// Pictures in the terminal, drawn as the 3D view is: half blocks, two pixels a character cell, 24-bit colours.
// PNG (every colour type and depth, not interlaced) and GIF (the first frame) are read here; anything else (JPEG, SVG,
// WebP, an interlaced PNG) goes through a headless Chrome when one is found (once for all the pictures of a run).
import { inflateSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---- PNG -> { width, height, rgba }
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
export const readPng = (buf) => {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8, W = 0, H = 0, depth = 8, type = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') (W = d.readUInt32BE(0)), (H = d.readUInt32BE(4)), (depth = d[8]), (type = d[9]), (interlace = d[12]);
    else if (name === 'PLTE') plte = d;
    else if (name === 'tRNS') trns = d;
    else if (name === 'IDAT') idat.push(d);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  if (interlace || !W || !H) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bpp = Math.max(1, (channels * depth) >> 3), stride = Math.ceil((W * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride), rgba = new Uint8ClampedArray(W * H * 4);
  const sample = (row, x, c) => {
    if (depth === 8) return row[x * channels + c];
    if (depth === 16) return row[(x * channels + c) * 2];
    const bit = (x * channels + c) * depth, v = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      cur[i] = (row[i] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0)) & 255;
    }
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (type === 3) {
        const k = sample(cur, x, 0);
        rgba.set([plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], trns && k < trns.length ? trns[k] : 255], o);
      } else if (type === 0 || type === 4) {
        const g = sample(cur, x, 0);
        rgba.set([g, g, g, type === 4 ? sample(cur, x, 1) : trns && depth <= 8 && g === trns[1] ? 0 : 255], o);
      } else rgba.set([sample(cur, x, 0), sample(cur, x, 1), sample(cur, x, 2), type === 6 ? sample(cur, x, 3) : 255], o);
    }
    prev.set(cur);
  }
  return { width: W, height: H, rgba };
};

// ---- GIF (the first frame) -> { width, height, rgba }
export const readGif = (buf) => {
  if (buf.toString('latin1', 0, 3) !== 'GIF') return null;
  const W = buf.readUInt16LE(6), H = buf.readUInt16LE(8), flags = buf[10];
  let p = 13, global = null, trans = -1;
  if (flags & 0x80) ((global = buf.subarray(p, p + 3 * (2 << (flags & 7)))), (p += 3 * (2 << (flags & 7))));
  const rgba = new Uint8ClampedArray(W * H * 4);
  while (p < buf.length) {
    const b = buf[p];
    if (b === 0x21) {
      if (buf[p + 1] === 0xf9 && buf[p + 3] & 1) trans = buf[p + 6];
      p += 2;
      while (buf[p]) p += buf[p] + 1;
      p++;
    } else if (b === 0x2c) {
      const x0 = buf.readUInt16LE(p + 1), y0 = buf.readUInt16LE(p + 3), w = buf.readUInt16LE(p + 5), h = buf.readUInt16LE(p + 7), lf = buf[p + 9];
      p += 10;
      let pal = global;
      if (lf & 0x80) ((pal = buf.subarray(p, p + 3 * (2 << (lf & 7)))), (p += 3 * (2 << (lf & 7))));
      const min = buf[p++], data = [];
      while (buf[p]) (data.push(...buf.subarray(p + 1, p + 1 + buf[p])), (p += buf[p] + 1));
      // LZW
      const clear = 1 << min, out = [];
      let size = min + 1, dict = [], prevE = null, bit = 0;
      const reset = () => ((dict = Array.from({ length: clear + 2 }, (_, i) => [i])), (size = min + 1), (prevE = null));
      reset();
      while (bit + size <= data.length * 8 && out.length < w * h) {
        let c = 0;
        for (let i = 0; i < size; i++, bit++) c |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
        if (c === clear) {
          reset();
          continue;
        }
        if (c === clear + 1) break;
        const e = c < dict.length ? dict[c] : prevE ? [...prevE, prevE[0]] : [0];
        out.push(...e);
        if (prevE && dict.length < 4096) dict.push([...prevE, e[0]]);
        prevE = e;
        if (dict.length === 1 << size && size < 12) size++;
      }
      const inter = lf & 0x40, rows = [];
      if (inter) for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) rows.push(y);
      for (let k = 0; k < h; k++) {
        const y = inter ? rows[k] : k;
        for (let x = 0; x < w; x++) {
          const i = out[k * w + x] ?? 0, o = ((y0 + y) * W + x0 + x) * 4;
          if (i !== trans && pal) rgba.set([pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2], 255], o);
        }
      }
      return { width: W, height: H, rgba };
    } else break;
  }
  return null;
};

// ---- anything else: a headless Chrome draws it on a canvas (started once, on the first such picture)
let chrome = null;
const viaChrome = async (buf, mime) => {
  if (chrome === false) return null;
  try {
    if (!chrome) {
      const { findChrome, devtools } = await import('./term-app.mjs');
      const exe = findChrome();
      if (!exe || typeof WebSocket !== 'function') throw new Error('no Chrome');
      const profile = await mkdtemp(join(tmpdir(), 'spider-md-'));
      const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', '--disable-component-update', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
      const ws = await new Promise((ok, no) => {
        let err = '';
        const t = setTimeout(() => no(new Error('Chrome did not start')), 15000);
        proc.stderr.on('data', (d) => {
          err += d;
          const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
          if (m) (clearTimeout(t), ok(m[1]));
        });
      });
      const dt = await devtools(ws);
      const { targetId } = await dt.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await dt.send('Target.attachToTarget', { targetId, flatten: true });
      chrome = { send: (m, p) => dt.send(m, p, sessionId), close: async () => (dt.close(), proc.kill(), rm(profile, { recursive: true, force: true }).catch(() => {})) };
    }
    const url = `data:${mime};base64,${buf.toString('base64')}`;
    const r = await chrome.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const img = new Image();
        img.src = ${JSON.stringify(url)};
        await img.decode();
        const w = Math.min(img.naturalWidth || 300, 1024), h = Math.max(1, Math.round(w * (img.naturalHeight || 150) / (img.naturalWidth || 300)));
        const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data;
        let s = '';
        for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode(...d.subarray(i, i + 32768));
        return { w, h, b: btoa(s) };
      })()`,
    });
    const v = r?.result?.value;
    return v ? { width: v.w, height: v.h, rgba: new Uint8ClampedArray(Buffer.from(v.b, 'base64')) } : null;
  } catch {
    chrome = false; // (no Chrome: the picture stays its alt text)
    return null;
  }
};
export const closeImages = async () => chrome && chrome.close?.();

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', png: 'image/png', gif: 'image/gif' };
/** bytes -> { width, height, rgba } or null */
export const decodeImage = async (buf, name = '') => {
  const png = buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 ? readPng(buf) : null;
  if (png) return png;
  const gif = readGif(buf);
  if (gif) return gif;
  const ext = (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(name)?.[1] ?? '').toLowerCase();
  const mime = /^\s*</.test(buf.subarray(0, 200).toString('utf8')) ? 'image/svg+xml' : buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp' : MIME[ext] ?? 'application/octet-stream';
  return viaChrome(buf, mime);
};

/**
 * A picture as terminal lines: at most `cols` cells wide and `rows` cells high (aspect kept, two pixels a cell),
 * averaged down; see-through pixels let the terminal's background show.
 */
export const imageLines = ({ width: W, height: H, rgba }, { cols = 80, rows = 24 } = {}) => {
  const s = Math.min(1, cols / W, (rows * 2) / H);
  const w = Math.max(1, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
  const px = new Float32Array(w * h * 4);
  // box filter: every target pixel is the mean of the source pixels it covers (colour weighted by alpha)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * W) / w), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * W) / w));
      const sy0 = Math.floor((y * H) / h), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * H) / h));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++)
        for (let xx = sx0; xx < sx1; xx++) {
          const o = (yy * W + xx) * 4, al = rgba[o + 3] / 255;
          r += rgba[o] * al;
          g += rgba[o + 1] * al;
          b += rgba[o + 2] * al;
          a += al;
          n++;
        }
      px.set(a ? [r / a, g / a, b / a, a / n] : [0, 0, 0, 0], (y * w + x) * 4);
    }
  const lines = [];
  const c = (k) => `${Math.round(px[k * 4])};${Math.round(px[k * 4 + 1])};${Math.round(px[k * 4 + 2])}`;
  for (let y = 0; y < h; y += 2) {
    let line = '', last = '';
    for (let x = 0; x < w; x++) {
      const t = y * w + x, b = (y + 1) * w + x;
      const top = px[t * 4 + 3] >= 0.5, bot = y + 1 < h && px[b * 4 + 3] >= 0.5;
      const [code, ch] = top && bot ? [`0;38;2;${c(t)};48;2;${c(b)}`, '▀'] : top ? [`0;38;2;${c(t)}`, '▀'] : bot ? [`0;38;2;${c(b)}`, '▄'] : ['0', ' '];
      if (code !== last) (line += `\x1b[${code}m`), (last = code);
      line += ch;
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines;
};

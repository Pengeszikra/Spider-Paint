// spider-term, the app way: the real spider-paint runs in a headless Chrome (the same index.html, every key and every mode),
// the terminal shows its picture in half blocks and passes the keys and the mouse on (Chrome DevTools Protocol over the
// WebSocket node has built in). The HUD's important lines become one info line; the Enter box's input and its list are
// drawn as terminal text (the list covers the bottom of the view, as in the app).
//   rows: the picture · the list (when the Enter box is open, over the picture) · the info line · the Enter line
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, extname } from 'node:path';
import { inflateSync, deflateRawSync } from 'node:zlib';
import { cellRows, diffRow } from '../src/term-render.js';
import { createHelpView } from './term-help.mjs';
import { createPaletteView } from './term-palette.mjs';

// ---- Chrome: CHROME_PATH, or the usual places
export const findChrome = () => {
  const list = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return list.find((p) => existsSync(p)) ?? null;
};

// ---- PNG (8-bit RGB / RGBA, what Chrome's screenshots are) -> { width, height, rgb }
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
export const decodePng = (buf) => {
  let p = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') (width = data.readUInt32BE(0)), (height = data.readUInt32BE(4)), (type = data[9]);
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      cur[i] = (row[i] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0)) & 255;
    }
    for (let x = 0; x < width; x++) rgb.set(cur.subarray(x * bpp, x * bpp + 3), (y * width + x) * 3);
    prev.set(cur);
  }
  return { width, height, rgb, set: new Uint8Array(width * height).fill(1) };
};

// ---- a static server for the checkout (the app's own files, the same version as this terminal)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const serve = (root) =>
  new Promise((ok) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/sw.js') return void res.writeHead(404).end(); // (no service worker in the headless page)
        const file = resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html');
        if (file !== root && !file.startsWith(root + sep)) throw new Error('outside');
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(data);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1', () => ok(server));
  });

// ---- the DevTools protocol: one WebSocket to the browser, a flat session for the page
export const devtools = async (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, no) => ((ws.onopen = ok), (ws.onerror = () => no(new Error('no DevTools connection')))));
  let id = 0;
  const wait = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && wait.has(msg.id)) {
      const [ok, no] = wait.get(msg.id);
      wait.delete(msg.id);
      msg.error ? no(new Error(msg.error.message)) : ok(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, no) => {
      const n = ++id;
      wait.set(n, [ok, no]);
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send, close: () => ws.close() };
};

// what the terminal asks the page for, every frame: the HUD (short), the Enter box, a toast
const PAGE_STATE = `(() => {
  const t = (id) => document.getElementById(id);
  const words = (el) => (el ? [...el.querySelectorAll('div, b, span, small')].filter((c) => !c.children.length).map((c) => c.textContent.trim()).filter((w) => w && w !== '\\u00a0').join(' ') : '');
  const box = t('findBox');
  const toast = document.getElementById('cmdToast') ?? document.getElementById('cloudToast');
  return {
    hud: [...(t('hud')?.querySelectorAll('.row') ?? [])].map(words).filter(Boolean),
    flight: words(t('flight')),
    edit: globalThis.__editing?.() ?? null,
    fps: t('fps')?.textContent ?? '',
    toast: toast?.isConnected ? toast.textContent : '',
    palette: t('palette') && !t('palette').hidden ? globalThis.__palette?.() ?? null : null,
    text: t('textBox') && !t('textBox').hidden ? { value: t('textBox').value, hint: t('textBox').placeholder } : null,
    help: t('helpPanel') && !t('helpPanel').hidden ? { file: globalThis.__helpAt ?? 'index.md', found: globalThis.__helpFound ?? null } : null,
    find: box && !box.hidden ? { value: t('findInput').value, rows: [...t('findList').children].map((d) => ({ i: d.dataset.i ?? null, sel: d.classList.contains('sel'), left: (d.children[0]?.innerText ?? d.innerText).replace(/\\s+/g, ' ').trim(), right: (d.children[1]?.innerText ?? '').trim() })) } : null,
  };
})()`;

// the page shows only the 3D view (the terminal draws the rest); the Enter box stays usable but unseen
const PAGE_CSS = `header.bar, footer.bar, footer.console, #hud, #editbar, #flight, #surface, #zenOff, .build, #cmdToast, #cloudToast { display: none !important; }
#stage { position: fixed !important; inset: 0 !important; border: 0 !important; border-radius: 0 !important; z-index: 1; }
body { padding: 0 !important; gap: 0 !important; }
#findBox, #textBox, #palette { opacity: 0 !important; pointer-events: none !important; }`;

// ---- terminal keys -> DOM key events
const VK = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
export const keysOf = (s) => {
  const out = [];
  const SEQ = { '[A': 'ArrowUp', '[B': 'ArrowDown', '[C': 'ArrowRight', '[D': 'ArrowLeft', '[H': 'Home', '[F': 'End', '[3~': 'Delete', '[5~': 'PageUp', '[6~': 'PageDown', '[Z': 'Tab+shift', OA: 'ArrowUp', OB: 'ArrowDown', OC: 'ArrowRight', OD: 'ArrowLeft' };
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (ch === '\x1b') {
      // a key the terminal reports with its modifiers (the kitty keyboard protocol: ESC [ code ; mods u, or xterm's
      // modifyOtherKeys: ESC [ 27 ; mods ; code ~): Shift+Enter, Ctrl+…, Alt+…, a plain Esc
      const u = /^\x1b\[(\d+)(?::\d*)*(?:;(\d+)(?::\d+)?)?u/.exec(s.slice(i)) ?? /^\x1b\[27;(\d+);(\d+)~/.exec(s.slice(i));
      if (u) {
        const other = u[0].endsWith('~');
        const code = Number(other ? u[2] : u[1]), mods = Math.max(0, Number((other ? u[1] : u[2]) ?? 1) - 1);
        const name = { 13: 'Enter', 27: 'Escape', 9: 'Tab', 127: 'Backspace', 8: 'Backspace', 32: ' ' }[code];
        const shift = Boolean(mods & 1);
        let key = name ?? String.fromCodePoint(code);
        if (!name && shift) key = key.toUpperCase();
        out.push({ key, shift, alt: Boolean(mods & 2), ctrl: Boolean(mods & 4) });
        i += u[0].length;
        continue;
      }
      const m = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-D])/.exec(s.slice(i));
      if (m) {
        const raw = m[1].replace(/^\[1;(\d)/, '[');
        const mod = /^\[1;(\d)/.exec(m[1])?.[1];
        const name = SEQ[raw] ?? null;
        if (name) out.push({ key: name.replace('+shift', ''), shift: name.endsWith('+shift') || mod === '2', alt: mod === '3', ctrl: mod === '5' });
        i += m[0].length;
        continue;
      }
      if (i + 1 < s.length && s[i + 1] !== '\x1b') {
        out.push({ ...charKey(s[i + 1]), alt: true });
        i += 2;
        continue;
      }
      out.push({ key: 'Escape' });
      i++;
      continue;
    }
    out.push(charKey(ch));
    i++;
  }
  return out;
};
const charKey = (ch) => {
  if (ch === '\r' || ch === '\n') return { key: 'Enter' };
  if (ch === '\t') return { key: 'Tab' };
  if (ch === '\x7f' || ch === '\b') return { key: 'Backspace' };
  const c = ch.charCodeAt(0);
  if (c >= 1 && c <= 26) return { key: String.fromCharCode(96 + c), ctrl: true };
  return { key: ch, shift: ch !== ch.toLowerCase() };
};
export const keyEvents = ({ key, shift, ctrl, alt }) => {
  const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
  const printable = key.length === 1;
  const up = key.toUpperCase();
  const code = /^[a-z]$/i.test(key) ? `Key${up}` : /^\d$/.test(key) ? `Digit${key}` : key === ' ' ? 'Space' : printable ? '' : key;
  const vk = VK[key] ?? (/^[a-z0-9]$/i.test(key) ? up.charCodeAt(0) : 0);
  const text = printable && !ctrl && !alt ? key : key === 'Enter' ? '\r' : undefined;
  return [
    { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text, unmodifiedText: text } : {}) },
    { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers },
  ];
};

/** Run the app in the terminal. Resolves when the user quits (Ctrl+C). */
export const runApp = async ({ root, scene, chrome, url }) => {
  if (typeof WebSocket !== 'function') throw new Error('node 22 or newer is needed (WebSocket)');
  const server = url ? null : await serve(root);
  const base = url ?? `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'spider-term-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, no) => {
    let err = '';
    const timer = setTimeout(() => no(new Error(`Chrome did not start (${chrome})`)), 20000);
    proc.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) (clearTimeout(timer), ok(m[1]));
    });
    proc.on('exit', () => no(new Error(`Chrome stopped: ${err.slice(-300)}`)));
  });
  const dt = await devtools(wsUrl);
  const { targetId } = await dt.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await dt.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p) => dt.send(m, p, sessionId);
  await page('Page.enable');
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(PAGE_CSS)} })));` });

  const out = process.stdout;
  const CW = 8, CH = 16; // a cell's pixels in the headless page (a half block: 8 × 8)
  const layout = () => {
    const cols = out.columns || 80, rows = Math.max(6, (out.rows || 24) - 2); // (two lines under the picture: info, Enter)
    return { cols, rows };
  };
  let L = layout();
  const resize = async () => {
    L = layout();
    await page('Emulation.setDeviceMetricsOverride', { width: L.cols * CW, height: L.rows * CH, deviceScaleFactor: 1, mobile: false });
  };
  await resize();
  // a scene file (from vim: the buffer's file) travels in the #fragment, packed, as an MCP link does (#scene= / #sky=);
  // when the file is written again the page loads it again
  const isFile = scene && /\.(json|3draft)$/i.test(scene) && existsSync(scene);
  const urlOf = () => {
    if (!isFile) return `${base}/${scene ? `?scene=${encodeURIComponent(scene)}` : ''}`;
    const text = readFileSync(scene, 'utf8');
    const kind = /"format"\s*:\s*"3draft-sky"/.test(text.slice(0, 2000)) ? 'sky' : /"format"\s*:\s*"spider-build/.test(text.slice(0, 2000)) ? 'story' : 'scene';
    const packed = deflateRawSync(Buffer.from(JSON.stringify(JSON.parse(text)))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${base}/?empty#${kind}=${packed}`;
  };
  await page('Page.navigate', { url: urlOf() });
  if (isFile) {
    let again = 0;
    watch(scene, () => {
      clearTimeout(again);
      again = setTimeout(() => {
        try {
          page('Page.navigate', { url: urlOf() }).catch(() => {});
        } catch {} // (a half-written file: the next save brings it)
      }, 300);
    });
  }
  await page('Runtime.enable');

  const MOUSE_ON = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h', MOUSE_OFF = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l';
  // \x1b[>1u: the kitty keyboard protocol (disambiguate), so Shift+Enter is not plain Enter where the terminal knows it
  const RESTORE = `\x1b[<u\x1b[0m${MOUSE_OFF}\x1b[?25h\x1b[?1049l`;
  out.write(`\x1b[?1049h\x1b[>1u\x1b[?25l${MOUSE_ON}\x1b[2J`);
  let done = false;
  const quit = async (code = 0) => {
    if (done) return;
    done = true;
    out.write(RESTORE);
    try {
      dt.close();
    } catch {}
    proc.kill();
    server?.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    process.exit(code);
  };
  for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => quit(0));
  process.on('uncaughtException', (e) => {
    out.write(RESTORE);
    console.error(e);
    proc.kill();
    process.exit(1);
  });

  // ---- the frame: the picture (the list over it), the info line, the Enter line
  let shown = [], state = null, listRows = []; // listRows: [{ row (screen line), i }]
  // shown[i]: what screen line i holds: a string (a text line) or the picture's cells (rows of [code, ch]), so a
  // frame sends only the cells that changed. Inside Vim / Neovim (their :terminal parses every byte, slowly) the
  // colours are rounded a little and the frames are fewer: SPIDER_TERM_QUANT (0–5 bits) and SPIDER_TERM_FPS set them.
  const inEditor = !!(process.env.VIM_TERMINAL || process.env.NVIM);
  const QUANT = Math.max(0, Math.min(5, Number(process.env.SPIDER_TERM_QUANT ?? (inEditor ? 3 : 0)) || 0));
  const FPS = Math.max(1, Math.min(30, Number(process.env.SPIDER_TERM_FPS) || (inEditor ? 10 : 14)));
  const fit = (s, n) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);
  // the help: drawn here as text from help/*.md while the page's help panel is open (the page's section, its /help finds)
  const helpView = createHelpView(root);
  const palView = createPaletteView();
  // a change from the palette panel: to the page, and its answer (the palette as it is now) is drawn at once
  const palApply = async (a) => {
    if (a === 'close') return page('Runtime.evaluate', { expression: "document.getElementById('palClose')?.click()" });
    if (a && typeof a === 'object') {
      const r = await page('Runtime.evaluate', { expression: `globalThis.__paletteSet(${JSON.stringify(a)})`, returnByValue: true }).catch(() => null);
      if (state && r?.result?.value) state.palette = r.result.value;
    }
  };
  let helpSeen = null;
  const followHelp = (h) => {
    const key = h ? `${h.file}|${h.found?.file ?? ''}|${h.found?.text ?? ''}` : null;
    if (key === helpSeen) return;
    const before = helpSeen;
    helpSeen = key;
    if (!h) return;
    if (h.found && h.found.file === h.file && (!before || !before.endsWith(`|${h.found.text}`))) helpView.open(h.file, { text: h.found.text });
    else helpView.open(h.file);
  };
  const frame = async () => {
    const st = await page('Runtime.evaluate', { expression: PAGE_STATE, returnByValue: true }).catch(() => null);
    state = st?.result?.value ?? state;
    followHelp(state?.help);
    let lines;
    if (state?.help) lines = helpView.rows(L.cols, L.rows);
    else {
      const shot = await page('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: L.cols * CW, height: L.rows * CH, scale: 1 / CW }, captureBeyondViewport: false });
      const img = decodePng(Buffer.from(shot.data, 'base64'));
      if (img.width !== L.cols || img.height < L.rows * 2) return; // (a resize is on its way)
      img.height = L.rows * 2;
      lines = cellRows(img, QUANT);
      // the palette (P): a text panel on the right, over the picture
      if (state?.palette) {
        const { x0, lines: panel } = palView.draw(state.palette, L.cols, L.rows);
        for (const [y, c] of panel) lines[y] = lines[y].slice(0, x0).concat(c);
      }
    }
    // the Enter box's list, over the bottom of the picture
    listRows = [];
    const rows = state?.find?.rows ?? [];
    if (state?.find && rows.length) {
      const n = Math.min(rows.length, L.rows - 1);
      rows.slice(0, n).forEach((r, k) => {
        const at = L.rows - n + k;
        const right = r.right ? ` ${r.right} ` : ' ';
        const left = fit(` ${r.left}`, L.cols - right.length);
        const pad = ' '.repeat(Math.max(0, L.cols - left.length - right.length));
        // (the chosen row in the blue of the target's corner ticks)
        lines[at] = `${r.sel ? '\x1b[0;48;2;77;171;247;38;2;4;20;36' : '\x1b[0;48;2;28;30;34;38;2;220;222;226'}m${left}${pad}\x1b[38;2;${r.sel ? '10;45;80' : '130;134;140'}m${right}\x1b[0m`;
        if (r.i !== null) listRows.push({ row: at, i: r.i });
      });
    }
    // the info line: the HUD's important bits
    const s = state ?? {};
    const info = s.toast || [s.flight, ...(s.hud ?? []).slice(0, 4), /\d/.test(s.fps ?? '') ? s.fps : ''].filter(Boolean).join(' · ');
    // in the edit mode (Q) the line starts with a coloured mark, the mode and the model's name
    const mode = s.edit ? { draw: 'draw', vertex: 'points', edge: 'lines', face: 'faces', saw: 'saw', lathe: 'lathe' }[s.edit.mode] ?? s.edit.mode : '';
    const badge = s.edit ? `\x1b[0;1;48;2;241;72;28;38;2;255;255;255m EDIT \x1b[0;48;2;60;24;14;38;2;255;214;190m ${mode} \x1b[0;1;48;2;18;18;20;38;2;240;240;232m ${s.edit.name} ` : '';
    const badgeLen = s.edit ? 6 + mode.length + 2 + s.edit.name.length + 2 : 0;
    lines.push(`${badge}\x1b[0;48;2;18;18;20;38;2;150;154;160m${fit(` ${info}`, Math.max(0, L.cols - badgeLen)).padEnd(Math.max(0, L.cols - badgeLen))}\x1b[0m`);
    // the Enter line: lighter while the box is open (focused)
    // the text box (Y, T in Q): the words being typed, on the same line
    const textLine = (t) => {
      const head = ' text › ';
      const body = fit(t.value || t.hint || '', Math.max(0, L.cols - head.length));
      return `\x1b[0;48;2;62;66;74;38;2;240;240;240m${head}${t.value ? '' : '\x1b[38;2;150;154;160m'}${body}${' '.repeat(Math.max(0, L.cols - head.length - body.length))}\x1b[0m`;
    };
    const enter = s.text
      ? textLine(s.text)
      : s.find ? `\x1b[0;48;2;62;66;74;38;2;240;240;240m${fit(` › ${s.find.value}`, L.cols).padEnd(L.cols)}\x1b[0m` : `\x1b[0;48;2;30;31;34;38;2;90;94;100m${fit(' Enter: find / commands (/l /s /svg /help …) · in Q: Shift+Enter (or Alt+Enter) · /q: quit', L.cols).padEnd(L.cols)}\x1b[0m`;
    lines.push(enter);
    let buf = '\x1b[?2026h';
    lines.forEach((l, i) => {
      if (typeof l === 'string') {
        if (shown[i] !== l) buf += `\x1b[${i + 1};1H${l}`;
      } else buf += diffRow(Array.isArray(shown[i]) ? shown[i] : null, l, i + 1);
    });
    shown = lines;
    buf += s.text ? `\x1b[${L.rows + 2};${Math.min(L.cols, 9 + s.text.value.length)}H\x1b[?25h` : s.find ? `\x1b[${L.rows + 2};${Math.min(L.cols, 4 + s.find.value.length)}H\x1b[?25h` : '\x1b[?25l';
    // the terminal decides the pace: while it has not taken the last frame, no new one is made (no lag piles up)
    if (!out.write(`${buf}\x1b[?2026l`)) await new Promise((r) => out.once('drain', r));
  };
  const loop = async () => {
    while (!done) {
      const t = performance.now();
      try {
        await frame();
      } catch {}
      await new Promise((r) => setTimeout(r, Math.max(10, 1000 / FPS - (performance.now() - t)))); // (FPS frames a second at most)
    }
  };

  // ---- input: keys to the page as DOM key events, the mouse as pointer events at the cell's middle
  let held = 0; // the mouse buttons down (CDP bit mask)
  const px = (x, y) => ({ x: (x - 1) * CW + CW / 2, y: (y - 1) * CH + CH / 2 });
  const mouse = async (b, x, y, release) => {
    const wheel = b & 64, motion = b & 32, btn = b & 3;
    const mods = (b & 4 ? 8 : 0) | (b & 8 ? 1 : 0) | (b & 16 ? 2 : 0);
    if (y > L.rows) return; // (the info and Enter lines)
    if (state?.help && !state?.find) {
      // the help view: the wheel scrolls it, a click on the section row changes the section
      if (wheel) return void helpView.scroll(btn === 0 ? -3 : 3, L.rows);
      if (!motion && !release && btn === 0 && y === 1) helpView.click(x - 1);
      return;
    }
    if (state?.palette && !state?.find) {
      const r = palView.mouse(x - 1, y - 1, { press: !motion && !release && btn === 0 && !wheel, wheel: wheel ? (btn === 0 ? -1 : 1) : 0 }, state.palette);
      if (r) return palApply(r);
    }
    const at = px(x, y);
    if (wheel) return page('Input.dispatchMouseEvent', { type: 'mouseWheel', ...at, deltaX: 0, deltaY: btn === 0 ? -120 : 120, modifiers: mods });
    const name = ['left', 'middle', 'right'][btn] ?? 'none', bit = [1, 4, 2][btn] ?? 0;
    if (motion) return page('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, button: held ? name : 'none', buttons: held, modifiers: mods });
    // a press on a row of the list takes it, as the app's list does
    const row = !release && listRows.find((r) => r.row === y - 1);
    if (row && btn === 0) return page('Runtime.evaluate', { expression: `document.querySelector('#findList [data-i="${row.i}"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))` });
    if (release) held &= ~bit;
    else held |= bit;
    return page('Input.dispatchMouseEvent', { type: release ? 'mouseReleased' : 'mousePressed', ...at, button: name, buttons: held, clickCount: 1, modifiers: mods });
  };
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', async (b) => {
    let s = b.toString();
    if (s.includes('\x03') || /\x1b\[99(?::\d*)*;5(?::\d+)?u/.test(s)) return quit(); // Ctrl+C (also as the kitty protocol says it)
    const events = [];
    s = s.replace(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g, (_, b2, x, y, m) => (events.push(() => mouse(Number(b2), Number(x), Number(y), m === 'm')), ''));
    for (let k of keysOf(s)) {
      // Alt+Enter = Shift+Enter (every terminal tells Alt+Enter apart: ESC Enter): the Enter box in the edit mode (Q) too
      if (k.key === 'Enter' && k.alt) k = { key: 'Enter', shift: true };
      // the help view takes its keys (Enter still opens the box over it)
      if (state?.help && !state?.find && k.key !== 'Enter') {
        const r = helpView.key(k, L.rows);
        if (r === 'close') events.push(() => page('Runtime.evaluate', { expression: "document.getElementById('helpClose')?.click()" }));
        continue;
      }
      // the palette panel takes ↑ ↓ ← → Tab (not while a box is open: there they are typing keys)
      if (state?.palette && !state?.find && !state?.text) {
        const r = palView.key(k, state.palette);
        if (r) {
          if (r !== 'draw') events.push(() => palApply(r));
          continue;
        }
      }
      // /q, /quit (or /exit) in the Enter box: leave the terminal
      if (k.key === 'Enter' && !k.shift)
        events.push(async () => {
          const r = await page('Runtime.evaluate', { expression: `document.getElementById('findBox')?.hidden === false ? document.getElementById('findInput').value : ''`, returnByValue: true }).catch(() => null);
          if (/^\s*\/(q|quit|exit)\s*$/i.test(r?.result?.value ?? '')) await quit();
        });
      for (const e of keyEvents(k)) events.push(() => page('Input.dispatchKeyEvent', e));
    }
    for (const e of events) await e().catch(() => {});
  });
  out.on('resize', async () => {
    shown = [];
    out.write('\x1b[2J');
    await resize().catch(() => {});
  });
  // wait for the app, then run
  for (let i = 0; i < 300; i++) {
    const r = await page('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true }).catch(() => null);
    if (r?.result?.value) break;
    if (i % 5 === 0) out.write(`\x1b[H\x1b[0;2m loading spider-paint${'.'.repeat((i / 5) % 4)}   \x1b[0m`);
    await new Promise((r2) => setTimeout(r2, 200));
  }
  // the pointer starts in the middle (the cross follows it)
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (L.cols * CW) / 2, y: (L.rows * CH) / 2, button: 'none', buttons: 0 }).catch(() => {});
  loop();
};

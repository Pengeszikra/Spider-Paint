// Animated GIF from RGBA frames: one palette for every frame (median cut, 255 colours), index 0 is transparent (alpha < 128),
// LZW coded, each frame replaces the one before (disposal 2), endless or once. Pure: no DOM; node can test it.
// Frames are { width, height, data } with straight or premultiplied alpha (`premultiplied: true` takes it back out).

const straight = (d, i, pre) => {
  const a = d[i + 3];
  if (!pre || a === 255 || a === 0) return [d[i], d[i + 1], d[i + 2], a];
  const k = 255 / a;
  return [Math.min(255, d[i] * k), Math.min(255, d[i + 1] * k), Math.min(255, d[i + 2] * k), a];
};

/** The smallest rectangle holding every visible pixel of every frame, grown by `pad` pixels (within the frame). */
export const visibleBox = (frames, pad = 0) => {
  const { width: W, height: H } = frames[0];
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const f of frames)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (f.data[(y * W + x) * 4 + 3] >= 128) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad), y0 = Math.max(0, y0 - pad), x1 = Math.min(W - 1, x1 + pad), y1 = Math.min(H - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

// median cut over a 15-bit histogram: at most `n` colours
const medianCut = (hist, n) => {
  const entries = [];
  for (let k = 0; k < hist.count.length; k++) if (hist.count[k]) entries.push(k);
  if (!entries.length) return [[0, 0, 0]];
  const mean = (box) => {
    let c = 0, r = 0, g = 0, b = 0;
    for (const k of box) (c += hist.count[k]), (r += hist.r[k]), (g += hist.g[k]), (b += hist.b[k]);
    return [r / c, g / c, b / c];
  };
  const chan = (k, ch) => (k >> (10 - ch * 5)) & 31;
  const boxes = [entries];
  while (boxes.length < n) {
    let best = -1, bestRange = 0, bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 31, hi = 0;
        for (const k of box) (lo = Math.min(lo, chan(k, ch))), (hi = Math.max(hi, chan(k, ch)));
        const range = (hi - lo) * Math.log2(box.length + 1);
        if (range > bestRange) (bestRange = range), (best = i), (bestCh = ch);
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((p, q) => chan(p, bestCh) - chan(q, bestCh));
    let total = 0;
    for (const k of box) total += hist.count[k];
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += hist.count[box[i]];
      if (acc >= total / 2) ((cut = i + 1), (i = box.length));
    }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.map(mean);
};

// LZW, the GIF way: codes of growing width, packed low bit first, in sub-blocks of at most 255 bytes
const lzw = (indices, minSize, out) => {
  const clear = 1 << minSize, eoi = clear + 1;
  let size = minSize + 1, next = eoi + 1;
  let dict = new Map();
  const bytes = [];
  let acc = 0, bits = 0;
  const put = (code) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) bytes.push(acc & 255), (acc >>>= 8), (bits -= 8);
  };
  put(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      put(clear);
      dict = new Map();
      size = minSize + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  put(prefix);
  put(eoi);
  if (bits) bytes.push(acc & 255);
  out.push(minSize);
  for (let i = 0; i < bytes.length; i += 255) {
    const n = Math.min(255, bytes.length - i);
    out.push(n);
    for (let j = 0; j < n; j++) out.push(bytes[i + j]);
  }
  out.push(0);
};

/**
 * Encode frames (all the same size) as one animated GIF. `box` cuts every frame to { x, y, w, h }; `delay` is the time a
 * frame shows in seconds (GIF counts hundredths, at least 2); `loop` true plays it endlessly.
 */
export const encodeGif = (frames, { box, delay = 0.1, loop = true, premultiplied = false } = {}) => {
  if (!frames.length) throw new Error('no frames');
  const W = frames[0].width;
  const b = box ?? { x: 0, y: 0, w: W, h: frames[0].height };
  // one palette for every frame (sampled when there are many pixels)
  const hist = { count: new Uint32Array(32768), r: new Float64Array(32768), g: new Float64Array(32768), b: new Float64Array(32768) };
  const step = Math.max(1, Math.floor((b.w * b.h * frames.length) / 2e6));
  let n = 0;
  for (const f of frames)
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        if (n++ % step) continue;
        const [r, g, bl, a] = straight(f.data, (y * W + x) * 4, premultiplied);
        if (a < 128) continue;
        const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (bl >> 3);
        hist.count[k]++, (hist.r[k] += r), (hist.g[k] += g), (hist.b[k] += bl);
      }
  const colours = medianCut(hist, 255);
  const near = new Int16Array(262144).fill(-1); // 6 bits a channel -> palette index
  const index = (r, g, bl) => {
    const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (bl >> 2);
    if (near[k] >= 0) return near[k];
    let best = 0, dist = Infinity;
    colours.forEach(([cr, cg, cb], i) => {
      const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - bl) ** 2;
      if (d < dist) (dist = d), (best = i);
    });
    return (near[k] = best + 1);
  };
  const out = [];
  const word = (v) => out.push(v & 255, (v >> 8) & 255);
  for (const c of 'GIF89a') out.push(c.charCodeAt(0));
  word(b.w), word(b.h);
  out.push(0xf7, 0, 0); // a global table of 256 colours
  out.push(0, 0, 0); // 0: transparent
  for (let i = 0; i < 255; i++) {
    const c = colours[i] ?? [0, 0, 0];
    out.push(...c.map((v) => Math.round(v)));
  }
  if (loop) out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  const cs = Math.max(2, Math.round(delay * 100));
  const idx = new Uint8Array(b.w * b.h);
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, (2 << 2) | 1, cs & 255, cs >> 8, 0, 0); // disposal 2, transparent index 0
    out.push(0x2c), word(0), word(0), word(b.w), word(b.h), out.push(0);
    let p = 0;
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        const [r, g, bl, a] = straight(f.data, (y * W + x) * 4, premultiplied);
        idx[p++] = a < 128 ? 0 : index(r, g, bl);
      }
    lzw(idx, 8, out);
  }
  out.push(0x3b);
  return new Uint8Array(out);
};

// PNG preview for MCP hosts that look at pictures (Claude, ChatGPT): a small software rasterizer, no dependencies.
// The SVG preview (engine/svg.js) strokes every polygon, so a dense mesh (a character: 2000+ faces) turns into a black
// blot and a 700 KB text block. Here a depth buffer decides visibility per pixel, faces get a gentle flat light, and only
// the edges that mean something are drawn: silhouettes, borders between objects, creases (normal change) and depth
// steps. Rendered at 2x and box-filtered down, so lines stay sharp but not jagged. Output is deterministic.
//
// renderPng(objects, { view, size, palette, background }) -> Buffer (PNG). background: '#rrggbb' or 'transparent' (a checkerboard). objects: [{ name, mesh }] (the scene's export).
// view: 'sheet' (2x2: front, side, top, persp) or one of front | side | top | persp, or a camera spec { dir, up, ortho }.
import { deflateSync } from 'node:zlib';
import { makeCamera, project, VIEW_ORDER } from './engine/camera.js';
import { faceNormal, merge } from './engine/mesh.js';
import { surfaceOf } from './engine/material.js';
import { dot, minus, norm } from './engine/vec.js';

const SS = 2; // supersampling factor
const NEAR = 0.02;
const BACKGROUND = [250, 250, 250];
const EDGE = [29, 29, 31];
const FRAME = [207, 207, 212];
const LABEL = [85, 85, 85];
const CREASE = Math.cos((40 * Math.PI) / 180); // faces meeting sharper than this get a line

const hex = (c) => {
  const s = String(c ?? '#888888').replace('#', '');
  const f = s.length === 3 ? s.split('').map((x) => x + x).join('') : s.padEnd(6, '0');
  const n = parseInt(f.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [136, 136, 136];
};

// cut a face at the near plane of a perspective camera (like svg.js does)
const clipNear = (cam, world) => {
  const screen = world.map((p) => project(cam, p));
  if (cam.ortho) return screen.some((s) => s.depth <= 0.01) ? null : { world, screen };
  if (screen.every((s) => s.depth >= NEAR)) return { world, screen };
  if (screen.every((s) => s.depth < NEAR)) return null;
  const cut = [];
  for (let a = 0; a < world.length; a++) {
    const b = (a + 1) % world.length;
    const da = screen[a].depth - NEAR;
    const db = screen[b].depth - NEAR;
    if (da >= 0) cut.push(world[a]);
    if (da * db < 0) {
      const t = da / (da - db);
      cut.push(world[a].map((c, k) => c + (world[b][k] - c) * t));
    }
  }
  return cut.length < 3 ? null : { world: cut, screen: cut.map((p) => project(cam, p)) };
};

// even-odd scanline fill of one polygon; plot(x, y, w) for every covered pixel center. w is linear on screen.
const scan = (S, pts, w, plot) => {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) (lo = Math.min(lo, p.y), hi = Math.max(hi, p.y));
  const y0 = Math.max(0, Math.ceil(lo - 0.5));
  const y1 = Math.min(S - 1, Math.floor(hi - 0.5));
  const cross = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    cross.length = 0;
    for (let a = 0; a < pts.length; a++) {
      const b = (a + 1) % pts.length;
      const p = pts[a], q = pts[b];
      if ((p.y <= yc && q.y > yc) || (q.y <= yc && p.y > yc)) {
        const t = (yc - p.y) / (q.y - p.y);
        cross.push({ x: p.x + t * (q.x - p.x), w: w[a] + t * (w[b] - w[a]) });
      }
    }
    cross.sort((a, b) => a.x - b.x);
    for (let k = 0; k + 1 < cross.length; k += 2) {
      const l = cross[k], r = cross[k + 1];
      const x0 = Math.max(0, Math.ceil(l.x - 0.5));
      const x1 = Math.min(S - 1, Math.floor(r.x - 0.5));
      const span = r.x - l.x || 1;
      for (let x = x0; x <= x1; x++) plot(x, y, l.w + ((x + 0.5 - l.x) / span) * (r.w - l.w));
    }
  }
};

// a 5x7 font, just enough for the panel names
const FONT = {
  f: ['01110', '10000', '10000', '11110', '10000', '10000', '10000'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  n: ['00000', '00000', '10110', '11001', '10001', '10001', '10001'],
  t: ['01000', '01000', '11100', '01000', '01000', '01001', '00110'],
  s: ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  d: ['00001', '00001', '01101', '10011', '10001', '10011', '01101'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  p: ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
  c: ['00000', '00000', '01110', '10000', '10000', '10001', '01110'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  m: ['00000', '00000', '11010', '10101', '10101', '10001', '10001'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  b: ['10000', '10000', '10110', '11001', '10001', '11001', '10110'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  g: ['00000', '01111', '10001', '10001', '01111', '00001', '01110'],
  h: ['10000', '10000', '10110', '11001', '10001', '10001', '10001'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/** One view into an RGB panel of size x size pixels. */
// background: a #rrggbb colour, or 'transparent' (drawn as a light checkerboard, so the preview shows that nothing is behind)
const backgroundFill = (background) => {
  if (background === undefined || background === null) return () => BACKGROUND;
  if (background === 'transparent') return (x, y) => ((((x / (12 * SS)) | 0) + ((y / (12 * SS)) | 0)) & 1 ? [255, 255, 255] : [224, 224, 228]);
  const c = hex(background);
  return () => c;
};
const panel = (parts, view, size, palette, background) => {
  const S = size * SS;
  const all = merge(...parts.map((p) => p.mesh));
  const cam = makeCamera(view, all, S);
  const N = S * S;
  const zb = new Float32Array(N).fill(-Infinity); // larger = nearer
  const fid = new Int32Array(N).fill(-1);
  const rgb = new Uint8ClampedArray(N * 3);
  const fill = backgroundFill(background);
  for (let i = 0; i < N; i++) rgb.set(fill(i % S, (i / S) | 0), i * 3);
  // a light that sits up and to the left of the camera, so every view reads the same way
  const L = norm([cam.r[0] * -0.45 + cam.u[0] * 0.75 + cam.f[0] * 0.5, cam.r[1] * -0.45 + cam.u[1] * 0.75 + cam.f[1] * 0.5, cam.r[2] * -0.45 + cam.u[2] * 0.75 + cam.f[2] * 0.5]);
  const faces = []; // { obj, n (facing the eye), color, alpha }
  const glass = [];
  parts.forEach((part, obj) => {
    const { positions } = part.mesh;
    for (const face of part.mesh.faces) {
      if (!face?.v || face.v.length < 3) continue;
      const clipped = clipNear(cam, face.v.map((k) => positions[k]));
      if (!clipped) continue;
      let n = norm(faceNormal(face.v.map((k) => positions[k])));
      if (!n.every(Number.isFinite)) continue;
      const toEye = cam.ortho ? cam.f : norm(minus(clipped.world[0])(cam.eye));
      if (dot(n, toEye) < 0) n = n.map((c) => -c); // seen from behind: light the side we see
      const s = surfaceOf(face, palette);
      const base = hex(s.color);
      const lit = Math.min(1.15, 0.58 + 0.42 * Math.max(0, dot(n, L)) + (s.emit ?? 0) * 0.5);
      const color = base.map((c) => Math.min(255, Math.round(c * lit)));
      const w = clipped.screen.map((p) => (cam.ortho ? -p.depth : 1 / p.depth));
      const id = faces.length;
      faces.push({ obj, n, color, alpha: s.alpha ?? 1 });
      if ((s.alpha ?? 1) < 1) glass.push({ id, pts: clipped.screen, w });
      else scan(S, clipped.screen, w, (x, y, v) => {
        const at = y * S + x;
        if (v > zb[at]) (zb[at] = v, fid[at] = id);
      });
    }
  });
  for (let at = 0; at < N; at++) if (fid[at] >= 0) rgb.set(faces[fid[at]].color, at * 3);
  // see-through faces: blended over what is behind them, hiding nothing
  for (const g of glass) {
    const { color, alpha } = faces[g.id];
    scan(S, g.pts, g.w, (x, y, v) => {
      const at = y * S + x;
      if (v < zb[at]) return;
      for (let k = 0; k < 3; k++) rgb[at * 3 + k] = rgb[at * 3 + k] * (1 - alpha) + color[k] * alpha;
    });
  }
  // edges: between faces of different objects, creases, depth steps, and against the background
  const edge = new Uint8Array(N);
  const differs = (a, b) => {
    const fa = fid[a], fb = fid[b];
    if (fa === fb) return false;
    if (fa < 0 || fb < 0) return true;
    const A = faces[fa], B = faces[fb];
    if (A.obj !== B.obj) return true;
    if (dot(A.n, B.n) < CREASE) return true;
    const za = zb[a], zb2 = zb[b];
    return Math.abs(za - zb2) > 0.02 * Math.max(Math.abs(za), Math.abs(zb2)) * (cam.ortho ? 0.05 : 1);
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const at = y * S + x;
      if (x + 1 < S && differs(at, at + 1)) edge[at] = edge[at + 1] = 1;
      if (y + 1 < S && differs(at, at + S)) edge[at] = edge[at + S] = 1;
    }
  }
  for (let at = 0; at < N; at++) if (edge[at]) rgb.set(EDGE, at * 3);
  // down to the panel size (box filter)
  const out = new Uint8ClampedArray(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) sum += rgb[((y * SS + dy) * S + x * SS + dx) * 3 + k];
        out[(y * size + x) * 3 + k] = sum / (SS * SS);
      }
    }
  }
  return { pixels: out, name: cam.name };
};

const label = (img, W, x0, y0, text) => {
  [...String(text).toLowerCase()].forEach((ch, i) => {
    const g = FONT[ch];
    if (!g) return;
    g.forEach((row, gy) => [...row].forEach((bit, gx) => {
      if (bit !== '1') return;
      const at = ((y0 + gy) * W + x0 + i * 6 + gx) * 3;
      img.set(LABEL, at);
    }));
  });
};

// PNG (RGB, 8 bit) from a pixel buffer
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export const encodePng = (pixels, W, H) => {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    raw[row] = 2; // filter: Up
    for (let i = 0; i < W * 3; i++) {
      const v = pixels[y * W * 3 + i];
      const up = y ? pixels[(y - 1) * W * 3 + i] : 0;
      raw[row + 1 + i] = (v - up) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** The scene's objects as a PNG: a 2x2 sheet (front, side / top, persp) or one view. */
export const renderPng = (objects, { view = 'sheet', size = 280, palette, background } = {}) => {
  const parts = objects.filter((o) => o?.mesh?.positions?.length && o.mesh.faces?.length);
  if (!parts.length) throw new Error('nothing to render');
  const pal = Array.isArray(palette) ? Object.fromEntries(palette.map((m) => [m.name, m])) : palette;
  const views = view === 'sheet' ? VIEW_ORDER : [view];
  const cols = views.length > 1 ? 2 : 1;
  const W = size * cols;
  const H = size * Math.ceil(views.length / cols);
  const img = new Uint8ClampedArray(W * H * 3);
  views.forEach((v, i) => {
    const { pixels, name } = panel(parts, v, size, pal, background);
    const ox = (i % cols) * size, oy = Math.floor(i / cols) * size;
    for (let y = 0; y < size; y++) img.set(pixels.subarray(y * size * 3, (y + 1) * size * 3), ((oy + y) * W + ox) * 3);
    for (let k = 0; k < size; k++) {
      img.set(FRAME, ((oy) * W + ox + k) * 3);
      img.set(FRAME, ((oy + size - 1) * W + ox + k) * 3);
      img.set(FRAME, ((oy + k) * W + ox) * 3);
      img.set(FRAME, ((oy + k) * W + ox + size - 1) * 3);
    }
    label(img, W, ox + 8, oy + 8, name);
  });
  return encodePng(img, W, H);
};

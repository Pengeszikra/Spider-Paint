// A 3D view in a terminal: the mesh drawn into a pixel grid two pixels a character cell high (the upper half block ▀ with a
// fore- and a background colour), 24-bit ANSI colours, a depth buffer, one colour a face with a simple light (a key light
// from the upper left of the eye, a little ambient). Pure: no node, no DOM; bin/spider-term.mjs runs it in a terminal.
import { makeCamera, orbit, project } from '../engine/45789c908f86/camera.js';
import { bounds } from '../engine/45789c908f86/mesh.js';
import { surfaceOf } from '../engine/45789c908f86/material.js';

const rgb = (hex) => {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const newell = (pts) => {
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  return unit(n);
};

/**
 * Draw `mesh` into a { width, height, rgb: Uint8Array, set: Uint8Array } pixel grid (height = 2 × rows).
 * view: { yaw, pitch, zoom (1: the whole mesh fits), fit: { center, radius } }; palette: { name: material };
 * lit(faceIndex): a face drawn brighter (the one under the mouse). `ids` holds the face seen at each pixel (-1: none).
 */
export const rasterize = (mesh, { width, height, yaw = -0.6, pitch = 0.45, zoom = 1, palette = {}, fit, lit } = {}) => {
  const size = Math.min(width, height); // (the whole mesh fits the shorter side)
  const box = fit ?? bounds(mesh);
  const cam = makeCamera(orbit({ yaw, pitch }), mesh, size, { center: box.center, radius: (box.radius || 1) / zoom });
  const ox = (size - width) / 2, oy = (size - height) / 2;
  const P = mesh.positions.map((p) => {
    const q = project(cam, p);
    return [q.x - ox, q.y - oy, q.depth];
  });
  const depth = new Float32Array(width * height).fill(Infinity);
  const out = new Uint8Array(width * height * 3), set = new Uint8Array(width * height), ids = new Int32Array(width * height).fill(-1);
  // the light, in the camera's frame: from above, a little left and towards the eye
  const toEye = cam.f.map((c) => -c);
  const light = unit([toEye[0] * 0.55 - cam.r[0] * 0.35 + cam.u[0] * 0.75, toEye[1] * 0.55 - cam.r[1] * 0.35 + cam.u[1] * 0.75, toEye[2] * 0.55 - cam.r[2] * 0.35 + cam.u[2] * 0.75]);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    if (f.v.length < 3) continue;
    const world = f.v.map((i) => mesh.positions[i]);
    const n = newell(world);
    const mid = world.reduce((m, q) => [m[0] + q[0] / world.length, m[1] + q[1] / world.length, m[2] + q[2] / world.length], [0, 0, 0]);
    const facing = dot(n, unit(sub(cam.eye, mid))); // > 0: seen from its front
    const nn = facing < 0 ? n.map((c) => -c) : n; // (an open shell is seen from both sides)
    const s = surfaceOf(f, palette);
    const shade = Math.min(1.25, 0.32 + 0.85 * Math.max(0, dot(nn, light)) + s.emit * 0.4);
    const on = lit?.(fi);
    const c = rgb(s.color).map((v) => Math.max(0, Math.min(255, Math.round(on ? v * shade * 0.75 + 70 : v * shade)))); // (lit: lighter, towards white)
    const pts = f.v.map((i) => P[i]);
    if (pts.some((p) => p[2] <= 1e-6)) continue; // (behind the eye)
    for (let t = 1; t + 1 < pts.length; t++) {
      const a = pts[0], b = pts[t], d = pts[t + 1];
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], d[0]))), x1 = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], d[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], d[1]))), y1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], d[1])));
      const area = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b[0] - px) * (d[1] - py) - (b[1] - py) * (d[0] - px)) / area;
          const w1 = ((d[0] - px) * (a[1] - py) - (d[1] - py) * (a[0] - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = w0 * a[2] + w1 * b[2] + w2 * d[2];
          const k = y * width + x;
          if (z >= depth[k]) continue;
          depth[k] = z;
          set[k] = 1;
          ids[k] = fi;
          out.set(c, k * 3);
        }
    }
  }
  return { width, height, rgb: out, set, ids };
};

/** The pixel grid as terminal text: one line a row of cells, ▀ = the upper pixel (foreground) over the lower (background). */
export const ansiLines = (img) => {
  const { width: W, height: H, rgb: c, set } = img;
  const lines = [];
  for (let y = 0; y < H; y += 2) {
    let line = '', last = '';
    for (let x = 0; x < W; x++) {
      const a = y * W + x, b = (y + 1) * W + x;
      const top = set[a], bot = y + 1 < H && set[b];
      const fg = (k) => `38;2;${c[k * 3]};${c[k * 3 + 1]};${c[k * 3 + 2]}`, bg = (k) => `48;2;${c[k * 3]};${c[k * 3 + 1]};${c[k * 3 + 2]}`;
      let code, ch;
      if (top && bot) (code = `${fg(a)};${bg(b)}`), (ch = '▀');
      else if (top) (code = `0;${fg(a)}`), (ch = '▀');
      else if (bot) (code = `0;${fg(b)}`), (ch = '▄');
      else (code = '0'), (ch = ' ');
      if (code !== last) (line += `\x1b[${code}m`), (last = code);
      line += ch;
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines;
};
export const toAnsi = (img) => ansiLines(img).join('\n');

export const renderTerm = (mesh, { cols = 80, rows = 24, ...view } = {}) => toAnsi(rasterize(mesh, { width: cols, height: rows * 2, ...view }));

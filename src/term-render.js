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
export const rasterize = (mesh, { width, height, yaw = -0.6, pitch = 0.45, zoom = 1, palette = {}, fit, lit, outline = false } = {}) => {
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
  const normals = new Array(mesh.faces.length);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    if (f.v.length < 3) continue;
    const world = f.v.map((i) => mesh.positions[i]);
    const n = newell(world);
    normals[fi] = n;
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
  // outline (instead of the GPU's light play): a pixel at the edge of the shape, of a fold (the faces turn more than ~35°)
  // or in front of a depth jump is drawn dark; the line stays on the nearer side
  if (outline) {
    const jump = 0.04 * (box.radius || 1) / zoom;
    const edge = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const k = y * width + x, id = ids[k];
        if (id < 0) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx, jd = ids[j];
          if (jd < 0) { edge[k] = 1; break; } // (the silhouette)
          if (jd === id) continue;
          if (depth[j] < depth[k] - jump) continue; // (the nearer pixel draws the line)
          if (depth[j] > depth[k] + jump || dot(normals[id], normals[jd]) < 0.6) { edge[k] = 1; break; }
        }
      }
    for (let k = 0; k < edge.length; k++) if (edge[k]) for (let c = 0; c < 3; c++) out[k * 3 + c] = Math.round(out[k * 3 + c] * 0.5);
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

/**
 * The pixel grid as cells for a frame-to-frame diff: rows of [fg, bg, ch] ("r;g;b" or '' for the terminal's own,
 * "▀" / "▄" / " "). quant: the low bits of each colour channel dropped (0: exact; 3: 32 levels a channel), so noise
 * and slow gradients change fewer cells and neighbours share their colour codes more often.
 */
export const cellRows = (img, quant = 0) => {
  const { width: W, height: H, rgb: c, set } = img;
  const q = quant > 0 ? (v) => Math.min(255, ((v >> quant) << quant) + (1 << (quant - 1))) : (v) => v;
  const col = (k) => `${q(c[k * 3])};${q(c[k * 3 + 1])};${q(c[k * 3 + 2])}`;
  const rows = [];
  for (let y = 0; y < H; y += 2) {
    const row = new Array(W);
    for (let x = 0; x < W; x++) {
      const a = y * W + x, b = (y + 1) * W + x;
      const top = set[a], bot = y + 1 < H && set[b];
      row[x] = top && bot ? (col(a) === col(b) ? ['', col(a), ' '] : [col(a), col(b), '▀']) : top ? [col(a), '', '▀'] : bot ? [col(b), '', '▄'] : ['', '', ' '];
    }
    rows.push(row);
  }
  return rows;
};

/**
 * Only what changed: the escape codes that turn the cells of `prev` into `next` on screen line `line` (1-based); a
 * missing prev redraws the whole row. Runs of changed cells with gaps of up to `gap` unchanged cells are joined (a
 * cursor jump costs about as much); within a run only the colour that changes is sent (38;2 or 48;2, not both).
 */
export const diffRow = (prev, next, line, gap = 4) => {
  let out = '';
  const same = (x) => prev && prev[x] && prev[x][0] === next[x][0] && prev[x][1] === next[x][1] && prev[x][2] === next[x][2];
  for (let x = 0; x < next.length; ) {
    if (same(x)) {
      x++;
      continue;
    }
    // a run: up to the last changed cell that is followed by more than `gap` unchanged ones
    let end = x + 1, quiet = 0;
    for (let k = x + 1; k < next.length && quiet <= gap; k++) {
      if (same(k)) quiet++;
      else (quiet = 0), (end = k + 1);
    }
    out += `\x1b[${line};${x + 1}H`;
    let fg = null, bg = null;
    for (let k = x; k < end; k++) {
      const [f, b, ch] = next[k];
      const codes = [];
      // (a space shows no foreground: it keeps whatever is set)
      if (f !== fg && ch !== ' ') (codes.push(f ? `38;2;${f}` : '39'), (fg = f));
      if (b !== bg) (codes.push(b ? `48;2;${b}` : '49'), (bg = b));
      if (codes.length) out += `\x1b[${codes.join(';')}m`;
      out += ch;
    }
    out += '\x1b[0m';
    x = end;
  }
  return out;
};

export const renderTerm = (mesh, { cols = 80, rows = 24, ...view } = {}) => toAnsi(rasterize(mesh, { width: cols, height: rows * 2, ...view }));

/** The zoom that makes `mesh` (or `fit`) fill about `fill` of a width × height grid as seen from yaw / pitch now. */
export const fitZoom = (mesh, { width, height, yaw = -0.6, pitch = 0.45, fit, fill = 0.9 } = {}) => {
  const size = Math.min(width, height);
  const box = fit ?? bounds(mesh);
  const cam = makeCamera(orbit({ yaw, pitch }), mesh, size, { center: box.center, radius: box.radius || 1 });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const r = box.radius || 1;
  for (const p of mesh.positions) {
    if (Math.hypot(p[0] - box.center[0], p[1] - box.center[1], p[2] - box.center[2]) > r * 1.0001) continue; // (only what the fit holds)
    const q = project(cam, p);
    x0 = Math.min(x0, q.x - size / 2), x1 = Math.max(x1, q.x - size / 2), y0 = Math.min(y0, q.y - size / 2), y1 = Math.max(y1, q.y - size / 2);
  }
  if (!(x1 > x0) || !(y1 > y0)) return 1;
  // the picture is centred on the fit's middle: the farther side decides
  const half = (a, b) => Math.max(Math.abs(a), Math.abs(b));
  return Math.max(0.05, Math.min((fill * width) / 2 / half(x0, x1), (fill * height) / 2 / half(y0, y1)));
};

/**
 * A sky: points seen from one eye (a first-person camera: yaw / pitch as the viewer's lookFrom, pitch > 0 looks down, `fov`
 * in radians). points: [{ at, rgb: [r, g, b], b (0..1 brightness), big (pixels, optional) }]; the brighter one wins a pixel.
 * `ids` holds the index of the point at each pixel (-1: none).
 */
export const rasterSky = (points, { width, height, eye, yaw = 0, pitch = 0, fov = Math.PI / 3 } = {}) => {
  const size = Math.max(width, height); // (the wider side sees the whole field of view)
  const look = makeCamera(orbit({ yaw, pitch }), null, 100, { center: [0, 0, 0], radius: 1, dist: 1 });
  const cam = makeCamera(orbit({ yaw, pitch }), null, size, { center: eye.map((c, i) => c + look.f[i] * 1e-6), radius: 1, dist: 1e-6, fov });
  const ox = (size - width) / 2, oy = (size - height) / 2;
  const out = new Uint8Array(width * height * 3), set = new Uint8Array(width * height), ids = new Int32Array(width * height).fill(-1);
  const best = new Float32Array(width * height);
  points.forEach((p, i) => {
    const q = project(cam, p.at);
    if (!(q.depth > 0)) return;
    const x = Math.floor(q.x - ox), y = Math.floor(q.y - oy), r = p.big ?? 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= width || Y >= height || dx * dx + dy * dy > r * r + r) continue;
        const k = Y * width + X, b = p.b * (dx || dy ? 0.55 : 1);
        if (b <= best[k]) continue;
        best[k] = b;
        set[k] = 1;
        ids[k] = i;
        for (let c = 0; c < 3; c++) out[k * 3 + c] = Math.round(p.rgb[c] * b);
      }
  });
  return { width, height, rgb: out, set, ids, cam };
};

/** The yaw / pitch (lookFrom's) that look from `eye` at `at`. */
export const lookAtAngles = (eye, at) => {
  const d = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const l = Math.hypot(...d) || 1;
  return { yaw: Math.atan2(d[0], -d[2]), pitch: -Math.asin(d[1] / l) };
};

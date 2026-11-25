#!/usr/bin/env node
// spider-paint in a terminal: a scene file drawn with 24-bit colour half blocks (two pixels a character cell).
//   spider-term [scene] [--once] [--spin] [--flat] [--cols N --rows N] [--yaw deg --pitch deg]
// scene: a path (.json / .3draft) or a name of models/ (bridge, globe, human…); default: bridge.
//
// Zen: only the picture, no text on it. The mouse is the program's (the terminal does not select the picture):
//   drag: turn · wheel: zoom · the object under the pointer lights up · click: turn round it (empty space: the whole scene)
//   Enter: a command line under the picture (/help lists them; a plain word targets an object by name) · Ctrl+C: quit
// --once (or a pipe) prints one frame.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { merge, bounds } from '../engine/45789c908f86/mesh.js';
import { instantiate } from '../engine/45789c908f86/instances.js';
import { BUILTIN_MATERIALS } from '../mcp/materials.js';
import { rasterize, rasterSky, lookAtAngles, ansiLines, fitZoom } from '../src/term-render.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, d) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d;
};
const VALUED = ['--cols', '--rows', '--yaw', '--pitch'];
const named = argv.find((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1])) ?? 'bridge';

const MODELS = join(root, 'models');
const modelNames = () => readdirSync(MODELS).filter((f) => f.endsWith('.scene.json')).map((f) => f.replace(/\.scene\.json$/, '')).sort();
const fileOf = (n) => {
  for (const f of [n, resolve(n), join(MODELS, n), join(MODELS, `${n}.scene.json`), join(MODELS, `${n}.json`)]) if (existsSync(f) && /\.(json|3draft)$/.test(f)) return f;
  const near = modelNames().filter((m) => m.includes(n));
  if (near.length) return join(MODELS, `${near[0]}.scene.json`);
  throw new Error(`no scene "${n}" (a .json / .3draft path, or a models/ name)`);
};
const hexRgb = (h) => {
  const f = String(h ?? '#c8c8c8').replace('#', '').padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
// A sky (a starship scene: deepsky, stars, the sky catalogues): thousands of instances light years apart are not meshes
// here but points seen from the scene's start eye; brightness: how big they look, spread per kind (5%…95% -> dim…full).
const loadSky = (s, file) => {
  const pal = Object.fromEntries((s.palette ?? []).map((m) => [m.name, m]));
  const eye = s.start?.eye ?? [0, 0, 0];
  const pts = [];
  for (const o of s.objects ?? []) {
    if (!Array.isArray(o.at)) continue;
    const d = Math.hypot(o.at[0] - eye[0], o.at[1] - eye[1], o.at[2] - eye[2]) || 1e-12;
    const core = o.mats?.core;
    pts.push({ name: String(o.name ?? ''), kind: o.category ?? o.proto ?? '', at: o.at, rgb: hexRgb(o.glowColor ?? pal[core]?.color ?? o.color), L: Math.log10((o.glow ?? o.scale ?? 1) / d), galaxy: o.proto === 'ghost' || Boolean(o.galaxy) });
  }
  for (const kind of new Set(pts.map((p) => p.kind))) {
    const g = pts.filter((p) => p.kind === kind), L = g.map((p) => p.L).sort((a, b) => a - b);
    const lo = L[Math.floor(L.length * 0.05)], hi = L[Math.floor((L.length - 1) * 0.95)];
    for (const p of g) p.b = Math.max(0.28, Math.min(1, 0.3 + (0.7 * (p.L - lo)) / Math.max(1e-9, hi - lo)));
    for (const p of g) p.big = p.galaxy && p.b > 0.85 ? 1 : 0; // (only the biggest-looking galaxies as a little smudge)
  }
  // the dust cloud (the Milky Way's band): faint points under everything
  const c = s.cloud;
  if (c?.p?.length) for (let i = 0; i + 2 < c.p.length; i += 3) pts.unshift({ name: '', kind: 'cloud', at: [c.p[i] * (c.unit ?? 1), c.p[i + 1] * (c.unit ?? 1), c.p[i + 2] * (c.unit ?? 1)], rgb: [150, 160, 200], b: 0.22 });
  const D0 = Math.PI / 180;
  const start = { yaw: (s.start?.yaw ?? 0) * D0, pitch: (s.start?.pitch ?? 0) * D0 };
  return { sky: { points: pts, eye, start }, objects: [], name: s.name ?? file.split('/').pop() };
};
// a scene file -> one mesh, its palette and its objects (name + the range of their faces in the mesh)
const load = (file) => {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  if (s.vehicle === 'starship' || s.start?.eye || (s.prototypes && (s.objects?.length ?? 0) > 1500)) return loadSky(s, file);
  const meshes = [], objects = [];
  let face = 0;
  for (const o of s.objects ?? []) {
    let m = o.mesh;
    if (!m && o.proto && s.prototypes?.[o.proto]?.lods?.[0]) m = instantiate(s.prototypes[o.proto].lods[0], { at: o.at, scale: o.scale, ...(o.rot ? { rot: o.rot } : {}), ...(o.color ? { color: o.color } : {}) });
    if (!m?.positions?.length) continue;
    meshes.push(m);
    objects.push({ name: String(o.name ?? `object ${objects.length + 1}`), from: face, to: face + m.faces.length, mesh: m });
    face += m.faces.length;
  }
  if (!meshes.length) throw new Error(`${file}: no objects with a mesh`);
  const palette = Object.fromEntries([...BUILTIN_MATERIALS, ...(Array.isArray(s.palette) ? s.palette : [])].map(({ name, ...m }) => [name, m]));
  return { mesh: merge(...meshes), palette, objects, name: s.name ?? file.split('/').pop() };
};

let scene = load(fileOf(named));
const D = Math.PI / 180;
const view = { yaw: opt('yaw', -34) * D, pitch: opt('pitch', 26) * D, zoom: 1, fit: scene.sky ? null : bounds(scene.mesh), fov: 60 * D };
const skyStart = () => {
  if (!scene.sky) return;
  Object.assign(view, scene.sky.start, { fov: 60 * D });
};
skyStart();
let spin = flag('spin');
let outline = !flag('flat'); // the dark edge lines (the terminal's stand-in for the GPU's light)

const once = flag('once') || !process.stdout.isTTY || !process.stdin.isTTY;
const size = () => ({ cols: opt('cols', process.stdout.columns || 80), rows: Math.max(4, opt('rows', (process.stdout.rows || 24) - (once ? 0 : 1))) });
let img = null;
let hover = -1; // the object under the pointer
function fitStart() {
  if (scene.sky) return;
  const { cols, rows } = size();
  view.zoom = fitZoom(scene.mesh, { width: cols, height: rows * 2, ...view });
}
const objectOf = (fi) => (fi < 0 ? -1 : scene.sky ? (scene.sky.points[fi]?.name ? fi : -1) : scene.objects.findIndex((o) => fi >= o.from && fi < o.to));
const picture = () => {
  const { cols, rows } = size();
  if (scene.sky) {
    img = rasterSky(scene.sky.points, { width: cols, height: rows * 2, eye: scene.sky.eye, yaw: view.yaw, pitch: view.pitch, fov: view.fov });
    return ansiLines(img);
  }
  const o = scene.objects[hover];
  img = rasterize(scene.mesh, { width: cols, height: rows * 2, palette: scene.palette, ...view, outline, lit: o ? (fi) => fi >= o.from && fi < o.to : undefined });
  return ansiLines(img);
};

fitStart();
if (once) {
  process.stdout.write(`${picture().join('\n')}\n`);
  process.exit(0);
}

// ---- the screen: the picture, and one line under it (empty; the command line after Enter; a short answer)
const out = process.stdout;
// 1049: the other screen · ?25l: no cursor · 1000/1002/1003 + 1006: the mouse (presses, drags, moves) in SGR form: the
// terminal leaves selecting to the program (Shift + drag, Option + drag on a Mac, still selects in most terminals)
const MOUSE_ON = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h', MOUSE_OFF = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l';
const RESTORE = `\x1b[0m${MOUSE_OFF}\x1b[?25h\x1b[?1049l`;
out.write(`\x1b[?1049h\x1b[?25l${MOUSE_ON}\x1b[2J`);
let shown = []; // the lines on the screen now (only the changed ones are written again)
let line = { mode: 'none', text: '', until: 0 }; // none | prompt | note
const quit = (code = 0) => {
  out.write(RESTORE);
  process.exit(code);
};
for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => quit(0)); // (killed from outside: the terminal is given back too)
process.on('uncaughtException', (e) => {
  out.write(RESTORE);
  console.error(e);
  process.exit(1);
});
// The mouse sends a report for every cell it crosses: drawing each would pile them up (a big scene then seems frozen).
// So a change only asks for a frame; one frame is drawn at a time, at most every 33 ms, from the newest state.
let pending = false, lastPaint = 0;
const draw = () => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    lastPaint = performance.now();
    paint();
  }, Math.max(0, 33 - (performance.now() - lastPaint)));
};
const paint = () => {
  const lines = picture();
  const { rows, cols } = size();
  let buf = '\x1b[?2026h'; // synchronised output: the terminal shows the frame whole (where it is understood)
  lines.forEach((l, i) => {
    if (shown[i] !== l) buf += `\x1b[${i + 1};1H${l}`;
  });
  shown = lines;
  if (line.mode === 'note' && performance.now() > line.until) line = { mode: 'none', text: '', until: 0 };
  const hovered = scene.sky && hover >= 0 ? scene.sky.points[hover] : null;
  const under = line.mode === 'prompt' ? `\x1b[0m› ${line.text}` : line.mode === 'note' ? `\x1b[0;2m${line.text.slice(0, cols - 1)}\x1b[0m` : hovered ? `\x1b[0;2m${`${hovered.name}${hovered.kind ? ` · ${hovered.kind}` : ''}`.slice(0, cols - 1)}\x1b[0m` : '\x1b[0m';
  buf += `\x1b[${rows + 1};1H${under}\x1b[K`;
  buf += line.mode === 'prompt' ? `\x1b[${rows + 1};${Math.min(cols, 3 + line.text.length)}H\x1b[?25h` : '\x1b[?25l';
  out.write(`${buf}\x1b[?2026l`);
};
const note = (text) => ((line = { mode: 'note', text, until: performance.now() + 4000 }), draw());

// ---- commands (the browser's Enter box, the ones that make sense here)
const VIEWS = { front: [0, 0], back: [180, 0], right: [90, 0], left: [-90, 0], side: [90, 0], top: [0, 89.9], bottom: [0, -89.9], iso: [-45, 35.26] };
const aim = (o) => {
  if (scene.sky) {
    if (!o) return skyStart();
    return Object.assign(view, lookAtAngles(scene.sky.eye, o.at));
  }
  view.fit = o ? bounds(o.mesh) : bounds(scene.mesh);
  const { cols, rows } = size();
  view.zoom = fitZoom(o ? o.mesh : scene.mesh, { width: cols, height: rows * 2, ...view });
};
const run = (text) => {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ');
  if (!cmd) return;
  if (!cmd.startsWith('/')) {
    const q = text.trim().toLowerCase();
    const pool = scene.sky ? scene.sky.points.filter((p) => p.name) : scene.objects;
    const o = pool.find((x) => x.name.toLowerCase() === q) ?? pool.find((x) => x.name.toLowerCase().startsWith(q)) ?? pool.find((x) => x.name.toLowerCase().includes(q));
    if (o && scene.sky) {
      aim(o);
      return note(`${o.name}${o.kind ? ` · ${o.kind}` : ''}`);
    }
    const o2 = scene.objects.find((x) => x.name.toLowerCase() === q) ?? scene.objects.find((x) => x.name.toLowerCase().startsWith(q)) ?? scene.objects.find((x) => x.name.toLowerCase().includes(q));
    if (!o2) return note(`no object "${text.trim()}"`);
    aim(o2);
    return note(o2.name);
  }
  switch (cmd.slice(1)) {
    case 'l':
    case 'load':
      if (!arg) return note(`scenes: ${modelNames().join(' ')}`);
      try {
        scene = load(fileOf(arg));
        hover = -1;
        aim(null);
        shown = [];
        skyStart();
        fitStart();
        return note(scene.sky ? `${scene.name}: ${scene.sky.points.filter((p) => p.name).length} sky objects (seen from the start)` : `${scene.name}: ${scene.objects.length} objects, ${scene.mesh.faces.length} faces`);
      } catch (e) {
        return note(e.message);
      }
    case 'view': {
      const v = VIEWS[arg];
      if (!v) return note('front back left right top bottom iso');
      [view.yaw, view.pitch] = [v[0] * D, v[1] * D];
      return draw();
    }
    case 'spin':
      spin = arg === 'off' ? false : arg === 'on' ? true : !spin;
      return draw();
    case 'fit':
    case 'reset':
      aim(null);
      return draw();
    case 'outline':
    case 'edges':
      outline = arg === 'off' ? false : arg === 'on' ? true : !outline;
      return note(`outline: ${outline ? 'on' : 'off'}`);
    case 'zoom':
      if (scene.sky) view.fov = Math.max(0.5 * D, Math.min(150 * D, (60 * D) / (Number(arg) || 1)));
      else view.zoom = Math.max(0.05, Number(arg) || 1);
      return draw();
    case 'ls':
    case 'objects':
      return note((scene.sky ? scene.sky.points.filter((p) => p.name && p.b > 0.8) : scene.objects).map((o) => o.name).join(' · '));
    case 'q':
    case 'quit':
      return quit();
    case 'help':
    case 'h':
      return note('/l scene · /view front|top|iso… · /spin · /outline · /fit · /zoom n · /ls · /q · a name: turn round that object');
    default:
      return note(`no command ${cmd} (/help)`);
  }
};

// ---- input: the keyboard only for Enter (and the command line), the mouse for the view
let drag = null; // { x, y, moved }
const cellFace = (x, y) => {
  if (!img) return -1;
  const px = x - 1, py = (y - 1) * 2;
  if (px < 0 || px >= img.width || py < 0 || py >= img.height) return -1;
  if (scene.sky) {
    // a star is one pixel: the brightest named one within a cell round the pointer
    let best = -1, bb = 0;
    for (let y = py - 2; y <= py + 3; y++)
      for (let x2 = px - 1; x2 <= px + 1; x2++) {
        if (x2 < 0 || y < 0 || x2 >= img.width || y >= img.height) continue;
        const id = img.ids[y * img.width + x2], p = scene.sky.points[id];
        if (id >= 0 && p.name && p.b > bb) (best = id), (bb = p.b);
      }
    return best;
  }
  const top = img.ids[py * img.width + px];
  return top >= 0 ? top : py + 1 < img.height ? img.ids[(py + 1) * img.width + px] : -1;
};
const mouse = (b, x, y, release) => {
  const motion = b & 32, button = b & 3, wheel = b & 64;
  if (wheel) {
    if (scene.sky) view.fov = Math.max(0.5 * D, Math.min(150 * D, view.fov * (button === 0 ? 1 / 1.12 : 1.12)));
    else view.zoom *= button === 0 ? 1.12 : 1 / 1.12;
    return draw();
  }
  if (motion && drag && button === 0) {
    const dx = x - drag.x, dy = y - drag.y;
    if (dx || dy) {
      const k = scene.sky ? -view.fov / 60 : 1; // (the sky follows the pointer, finer when zoomed in)
      view.yaw += dx * 4 * D * k;
      view.pitch = Math.max(-89.9 * D, Math.min(89.9 * D, view.pitch + dy * 8 * D * (scene.sky ? -view.fov / 60 : 1))); // (a cell is twice as tall as wide)
      drag = { x, y, moved: true };
      return draw();
    }
    return;
  }
  if (motion) {
    const h = objectOf(cellFace(x, y));
    if (h !== hover) (hover = h), draw();
    return;
  }
  if (button === 0 && !release) return void (drag = { x, y, moved: false });
  if (release && drag) {
    const clicked = !drag.moved;
    drag = null;
    if (clicked) {
      const hit = objectOf(cellFace(x, y));
      if (scene.sky) {
        if (hit >= 0) (aim(scene.sky.points[hit]), note(`${scene.sky.points[hit].name}${scene.sky.points[hit].kind ? ` · ${scene.sky.points[hit].kind}` : ''}`));
        return;
      }
      aim(scene.objects[hit] ?? null);
      draw();
    }
  }
};
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (b) => {
  let s = b.toString();
  // mouse reports: ESC [ < b ; x ; y M|m
  s = s.replace(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g, (_, b2, x, y, m) => (mouse(Number(b2), Number(x), Number(y), m === 'm'), ''));
  if (!s) return;
  if (s.includes('\x03')) return quit();
  if (line.mode !== 'prompt') {
    const at = s.search(/[\r\n]/);
    if (at < 0) return; // (zen: no key but Enter)
    line = { mode: 'prompt', text: '', until: 0 };
    s = s.slice(at + 1); // (a paste may bring the command along)
    if (!s) return draw();
  }
  for (const ch of s.replace(/\x1b\[[0-9;]*[A-Za-z~]/g, '')) {
    if (ch === '\r' || ch === '\n') {
      const t = line.text;
      line = { mode: 'none', text: '', until: 0 };
      draw();
      run(t);
      return;
    }
    if (ch === '\x1b') return (line = { mode: 'none', text: '', until: 0 }), draw();
    if (ch === '\x7f' || ch === '\b') line.text = line.text.slice(0, -1);
    else if (ch >= ' ') line.text += ch;
  }
  draw();
});
setInterval(() => {
  if (spin && !drag) (view.yaw += scene.sky ? 0.004 : 0.04), draw();
  else if (line.mode === 'note' && performance.now() > line.until) draw();
}, 50);
process.stdout.on('resize', () => ((shown = []), out.write('\x1b[2J'), draw()));
draw();

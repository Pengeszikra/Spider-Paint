#!/usr/bin/env node
// spider-paint in a terminal: a scene file drawn with 24-bit colour half blocks (two pixels a character cell).
//   spider-term [scene] [--once] [--spin] [--cols N --rows N] [--yaw deg --pitch deg]
// scene: a path (.json / .3draft) or a name of models/ (bridge, globe, human…); default: bridge.
// Keys: ← → ↑ ↓ (or h l k j, a d w s) turn, + - zoom, space spin on / off, r reset, q / Esc / Ctrl+C quit.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { merge, bounds } from '../engine/45789c908f86/mesh.js';
import { instantiate } from '../engine/45789c908f86/instances.js';
import { BUILTIN_MATERIALS } from '../mcp/materials.js';
import { rasterize, toAnsi } from '../src/term-render.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, d) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : d;
};
const VALUED = ['--cols', '--rows', '--yaw', '--pitch'];
const named = argv.find((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1])) ?? 'bridge';

const fileOf = (n) => {
  for (const f of [n, resolve(n), join(root, 'models', n), join(root, 'models', `${n}.scene.json`), join(root, 'models', `${n}.json`)]) if (existsSync(f) && f.match(/\.(json|3draft)$/)) return f;
  throw new Error(`no scene "${n}" (a .json / .3draft path, or a models/ name)`);
};
// a scene file -> one mesh and its palette (v2 instances placed; a palette entry or a built-in material by name)
const load = (file) => {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const meshes = [];
  for (const o of s.objects ?? []) {
    if (o.mesh) meshes.push(o.mesh);
    else if (o.proto && s.prototypes?.[o.proto]?.lods?.[0]) meshes.push(instantiate(s.prototypes[o.proto].lods[0], { at: o.at, scale: o.scale, ...(o.rot ? { rot: o.rot } : {}), ...(o.color ? { color: o.color } : {}) }));
  }
  if (!meshes.length) throw new Error(`${file}: no objects with a mesh`);
  const palette = Object.fromEntries([...BUILTIN_MATERIALS, ...(Array.isArray(s.palette) ? s.palette : [])].map(({ name, ...m }) => [name, m]));
  return { mesh: merge(...meshes), palette, name: s.name ?? file.split('/').pop() };
};

const file = fileOf(named);
const { mesh, palette, name } = load(file);
const fit = bounds(mesh);
const D = Math.PI / 180;
const view = { yaw: opt('yaw', -34) * D, pitch: opt('pitch', 26) * D, zoom: 1 };
const start = { ...view };
let spin = flag('spin');
const size = () => ({ cols: opt('cols', process.stdout.columns || 80), rows: Math.max(4, opt('rows', (process.stdout.rows || 24) - 1)) });
const frame = () => {
  const { cols, rows } = size();
  return toAnsi(rasterize(mesh, { width: cols, height: rows * 2, palette, fit, ...view }));
};

if (flag('once') || !process.stdout.isTTY || !process.stdin.isTTY) {
  process.stdout.write(`${frame()}\n`);
  process.exit(0);
}

const out = process.stdout;
out.write('\x1b[?1049h\x1b[?25l'); // the other screen, no cursor
const quit = () => {
  out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  process.exit(0);
};
let last = 0, fps = 0;
const draw = () => {
  const t = performance.now();
  const status = `\x1b[0;2m ${name} · ${mesh.faces.length} faces · ${fps.toFixed(0)} fps · ←→↑↓ turn  +- zoom  space spin  r reset  q quit\x1b[0m\x1b[K`;
  out.write(`\x1b[H${frame()}\n${status}`);
  fps = fps * 0.8 + (1000 / Math.max(1, performance.now() - (last || t))) * 0.2;
  last = performance.now();
};
const timer = setInterval(() => {
  if (spin) (view.yaw += 0.04), draw();
}, 50);
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (b) => {
  const k = b.toString();
  const step = 8 * D;
  if (k === 'q' || k === '\x1b' || k === '\x03') return clearInterval(timer), quit();
  if (k === '\x1b[D' || k === 'h' || k === 'a') view.yaw -= step;
  else if (k === '\x1b[C' || k === 'l' || k === 'd') view.yaw += step;
  else if (k === '\x1b[A' || k === 'k' || k === 'w') view.pitch = Math.min(89 * D, view.pitch + step);
  else if (k === '\x1b[B' || k === 'j' || k === 's') view.pitch = Math.max(-89 * D, view.pitch - step);
  else if (k === '+' || k === '=') view.zoom *= 1.15;
  else if (k === '-' || k === '_') view.zoom /= 1.15;
  else if (k === ' ') spin = !spin;
  else if (k === 'r') Object.assign(view, start);
  draw();
});
process.stdout.on('resize', () => (out.write('\x1b[2J'), draw()));
draw();

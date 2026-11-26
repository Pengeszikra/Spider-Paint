// A test: the 3Draft engine's own WebGPU renderer (engine/…/gpu.js) in Deno, with no browser, drawn in the terminal in
// half blocks. The model turns; at the end the frame times and the memory are printed. Compare with
// scripts/bench-term-chrome.mjs (the same scene, the same size, through a headless Chrome as the terminal app view does).
//
//   deno run -A --unstable-webgpu scripts/bench-term-deno.mjs [scene] [--frames 200] [--ss 2] [--cols N --rows N]
//
// scene: a models/ name or a .json path (a model scene; not a sky). --ss: pixels rendered per cell edge, averaged down
// (1: fastest, rough edges; the Chrome view renders 8 and lets Chrome scale the screenshot down).
import { createGpu } from '../engine/45789c908f86/gpu.js';
import { orbit } from '../engine/45789c908f86/camera.js';
import { merge, bounds } from '../engine/45789c908f86/mesh.js';
import { instantiate } from '../engine/45789c908f86/instances.js';
import { BUILTIN_MATERIALS } from '../mcp/materials.js';
import { cellRows, diffRow } from '../src/term-render.js';

const args = Deno.args;
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const named = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'globe';
const root = new URL('..', import.meta.url);
const file = /\.(json|3draft)$/.test(named) ? named : new URL(`models/${named}.scene.json`, root);
const s = JSON.parse(await Deno.readTextFile(file));
if (s.vehicle === 'starship' || s.start?.eye) throw new Error(`${named} is a sky; this test draws model scenes (globe, a .json model)`);

// the scene -> one mesh and its palette (as bin/spider-term.mjs does)
const meshes = [];
for (const o of s.objects ?? []) {
  let m = o.mesh;
  if (!m && o.proto && s.prototypes?.[o.proto]?.lods?.[0]) m = instantiate(s.prototypes[o.proto].lods[0], { at: o.at, scale: o.scale, ...(o.rot ? { rot: o.rot } : {}), ...(o.color ? { color: o.color } : {}) });
  if (m?.positions?.length) meshes.push(m);
}
const mesh = merge(...meshes);
const fit = bounds(mesh);
const palette = Object.fromEntries([...BUILTIN_MATERIALS, ...(Array.isArray(s.palette) ? s.palette : [])].map(({ name, ...m }) => [name, m]));

// WebGPU without a canvas: the engine reads frames back from an offscreen texture (pixels()), so the canvas is a stand-in
if (!navigator.gpu) throw new Error('no navigator.gpu: run with  deno run -A --unstable-webgpu …  (Deno 1.39+ / 2.x)');
try {
  navigator.gpu.getPreferredCanvasFormat ??= () => 'rgba8unorm';
} catch {}
const canvas = { getContext: () => ({ configure() {}, getCurrentTexture() { throw new Error('no canvas in Deno: pixels() only'); } }) };
const t0 = performance.now();
const gpu = await createGpu(canvas, { sampleCount: 4, onError: (m) => console.error('gpu:', m) });
const startMs = performance.now() - t0;
const info = gpu.adapter.info ?? (await gpu.adapter.requestAdapterInfo?.()) ?? {};

const size = Deno.stdout.isTerminal() ? Deno.consoleSize() : { columns: 100, rows: 30 };
const cols = opt('cols', size.columns), rows = opt('rows', size.rows - 2);
const ss = Math.max(1, Math.min(8, opt('ss', 2)));
const frames = opt('frames', 200);
const W = cols, H = rows * 2; // the picture's pixels: one cell is one pixel wide and two high
const S = Math.max(W, H) * ss; // the square the engine renders

const enc = new TextEncoder();
const write = (t) => {
  const b = enc.encode(t);
  for (let o = 0; o < b.length; ) o += Deno.stdout.writeSync(b.subarray(o));
};
write('\x1b[?1049h\x1b[?25l\x1b[2J');
let shown = [];
const T = { gpu: 0, cells: 0, write: 0, bytes: 0 };
let last = 0;
try {
  for (let f = 0; f < frames; f++) {
    const a = performance.now();
    const img = await gpu.pixels(mesh, orbit({ yaw: -0.6 + f * 0.03, pitch: 0.42 }), { size: S, dpr: 1, fit, palette, background: [0.07, 0.07, 0.08], studio: true, smooth: 40 });
    const b = performance.now();
    // the middle W × H of the square, averaged down ss × ss
    const rgb = new Uint8Array(W * H * 3);
    const ox = Math.floor((S - W * ss) / 2), oy = Math.floor((S - H * ss) / 2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, bl = 0;
        for (let j = 0; j < ss; j++)
          for (let i = 0; i < ss; i++) {
            const k = ((oy + y * ss + j) * S + ox + x * ss + i) * 4;
            r += img.data[k];
            g += img.data[k + 1];
            bl += img.data[k + 2];
          }
        const n = ss * ss, o = (y * W + x) * 3;
        rgb[o] = r / n;
        rgb[o + 1] = g / n;
        rgb[o + 2] = bl / n;
      }
    const lines = cellRows({ width: W, height: H, rgb, set: new Uint8Array(W * H).fill(1) });
    let buf = '\x1b[?2026h';
    lines.forEach((l, i) => (buf += diffRow(shown[i], l, i + 1)));
    shown = lines;
    const fps = last ? 1000 / (a - last) : 0;
    last = a;
    buf += `\x1b[${rows + 1};1H\x1b[0;2m deno + WebGPU · ${named} · ${W}×${H} px (ss ${ss}) · frame ${f + 1}/${frames} · ${fps.toFixed(1)} fps   \x1b[0m\x1b[?2026l`;
    const c = performance.now();
    write(buf);
    const d = performance.now();
    T.gpu += b - a;
    T.cells += c - b;
    T.write += d - c;
    T.bytes += buf.length;
  }
} finally {
  write('\x1b[0m\x1b[?25h\x1b[?1049l');
}
const per = (ms) => (ms / frames).toFixed(1);
const total = T.gpu + T.cells + T.write;
console.log(`deno ${Deno.version.deno} · WebGPU: ${[info.vendor, info.architecture, info.description].filter((x) => x && x !== '0').join(' ') || '?'}`);
console.log(`scene ${named}: ${mesh.faces.length} faces · picture ${W}×${H} (rendered ${S}×${S}) · ${frames} frames`);
console.log(`start (adapter, device, shaders): ${startMs.toFixed(0)} ms`);
console.log(`per frame: render + read back ${per(T.gpu)} ms · to cells ${per(T.cells)} ms · to the terminal ${per(T.write)} ms (${(T.bytes / frames / 1024).toFixed(1)} KiB)`);
console.log(`=> ${(1000 / (total / frames)).toFixed(1)} frames a second at most · memory ${(Deno.memoryUsage().rss / 1048576).toFixed(0)} MB (rss)`);
Deno.exit(0); // (not gpu.destroy(): the engine reports a destroyed device as lost)

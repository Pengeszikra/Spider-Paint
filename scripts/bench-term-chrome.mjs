#!/usr/bin/env node
// The other half of scripts/bench-term-deno.mjs: the same scene at the same size through a headless Chrome, as the
// terminal app view (bin/term-app.mjs) gets its picture: a screenshot (PNG, base64, over the DevTools WebSocket), decoded,
// turned into half-block cells. The view turns with the arrow key; at the end the frame times and the memory.
//
//   node scripts/bench-term-chrome.mjs [scene] [--frames 200] [--cols N --rows N]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, devtools, decodePng, serve, PAGE_CSS, keyEvents } from '../bin/term-app.mjs';
import { cellRows, diffRow } from '../src/term-render.js';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const named = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'globe';
const cols = opt('cols', process.stdout.columns || 100), rows = opt('rows', (process.stdout.rows || 32) - 2);
const frames = opt('frames', 200);
const CW = 8, CH = 16;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = findChrome();
if (!chrome) throw new Error('no Chrome / Chromium / Edge found (CHROME_PATH names one)');

const t0 = performance.now();
const server = await serve(root);
const profile = await mkdtemp(join(tmpdir(), 'bench-chrome-'));
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const ws = await new Promise((ok, no) => {
  let e = '';
  proc.stderr.on('data', (d) => {
    e += d;
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(e);
    if (m) ok(m[1]);
  });
  proc.on('exit', () => no(new Error('Chrome stopped')));
});
const dt = await devtools(ws);
const { targetId } = await dt.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await dt.send('Target.attachToTarget', { targetId, flatten: true });
const page = (m, p) => dt.send(m, p, sessionId);
await page('Page.enable');
await page('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(PAGE_CSS)} })));` });
await page('Emulation.setDeviceMetricsOverride', { width: cols * CW, height: rows * CH, deviceScaleFactor: 1, mobile: false });
await page('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?scene=${encodeURIComponent(named)}` });
for (let i = 0; i < 300; i++) {
  const r = await page('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true }).catch(() => null);
  if (r?.result?.value) break;
  await new Promise((r2) => setTimeout(r2, 100));
}
await new Promise((r) => setTimeout(r, 1500)); // (the scene arrives after ready)
const startMs = performance.now() - t0;

// the memory of Chrome: every process under the one started here
const chromeRss = () => {
  try {
    const rowsPs = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
    const kids = new Map();
    for (const [pid, ppid] of rowsPs) kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
    const all = new Set([proc.pid]);
    for (const p of all) for (const k of kids.get(p) ?? []) all.add(k);
    return rowsPs.filter(([pid]) => all.has(pid)).reduce((a, r) => a + r[2], 0) / 1024;
  } catch {
    return NaN;
  }
};

const out = process.stdout;
out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
let shown = [];
const T = { shot: 0, decode: 0, cells: 0, write: 0, bytes: 0 };
let last = 0, rss = 0;
try {
  for (let f = 0; f < frames; f++) {
    for (const e of keyEvents({ key: 'ArrowLeft' })) await page('Input.dispatchKeyEvent', e); // (the view turns a step)
    const a = performance.now();
    const shot = await page('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: cols * CW, height: rows * CH, scale: 1 / CW }, captureBeyondViewport: false });
    const b = performance.now();
    const img = decodePng(Buffer.from(shot.data, 'base64'));
    img.height = Math.min(img.height, rows * 2);
    const c = performance.now();
    const lines = cellRows(img);
    let buf = '\x1b[?2026h';
    lines.forEach((l, i) => (buf += diffRow(shown[i], l, i + 1)));
    shown = lines;
    const fps = last ? 1000 / (a - last) : 0;
    last = a;
    buf += `\x1b[${rows + 1};1H\x1b[0;2m node + headless Chrome · ${named} · ${cols}×${rows * 2} px · frame ${f + 1}/${frames} · ${fps.toFixed(1)} fps   \x1b[0m\x1b[?2026l`;
    const d = performance.now();
    out.write(buf);
    const e = performance.now();
    T.shot += b - a;
    T.decode += c - b;
    T.cells += d - c;
    T.write += e - d;
    T.bytes += buf.length;
    if (f === Math.floor(frames / 2)) rss = chromeRss();
  }
} finally {
  out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
}
const per = (ms) => (ms / frames).toFixed(1);
const total = T.shot + T.decode + T.cells + T.write;
const ver = (await dt.send('Browser.getVersion').catch(() => ({}))).product ?? 'Chrome';
console.log(`node ${process.version} · ${ver}`);
console.log(`scene ${named} · picture ${cols}×${rows * 2} (the page ${cols * CW}×${rows * CH}) · ${frames} frames`);
console.log(`start (Chrome, the page, the scene): ${startMs.toFixed(0)} ms`);
console.log(`per frame: screenshot (render, PNG, base64, WebSocket) ${per(T.shot)} ms · PNG decode ${per(T.decode)} ms · to cells ${per(T.cells)} ms · to the terminal ${per(T.write)} ms (${(T.bytes / frames / 1024).toFixed(1)} KiB)`);
console.log(`=> ${(1000 / (total / frames)).toFixed(1)} frames a second at most · memory: Chrome ${rss.toFixed(0)} MB + node ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB (rss)`);
dt.close();
proc.kill();
server.close();
await rm(profile, { recursive: true, force: true }).catch(() => {});
process.exit(0);

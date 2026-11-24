// Headless Chromium smoke test of the emulator: node tests/smoke.mjs   (needs a chromium via Playwright, no npm packages of our own)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(root)) throw new Error('outside');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'text/plain' }).end(await readFile(file));
  } catch { res.writeHead(404).end('not found'); }
}).listen(0);
const port = server.address().port;

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) failed++; };

await page.goto(`http://localhost:${port}/emulator.html?emulate`);
check('navigator.xr exists', await page.evaluate(() => !!navigator.xr));
check('immersive-vr supported', await page.evaluate(() => navigator.xr.isSessionSupported('immersive-vr')));
check('inline not supported', !(await page.evaluate(() => navigator.xr.isSessionSupported('inline'))));

await page.click('#enter');
await page.waitForFunction(() => window.demoState?.frames > 3, null, { timeout: 15000 });
const s0 = await page.evaluate(() => ({ ...window.demoState }));
check('session started and frames render', s0.session && s0.frames > 3, `frames=${s0.frames}`);
check('two views', s0.views === 2);
check('head starts at standing height', Math.abs(s0.lastHead[1] - 1.6) < 1e-3, s0.lastHead.map((n) => n.toFixed(2)).join(','));

const info = await page.evaluate(async () => {
  const e = window.__xrEmulator, session = e.session;
  const space = await session.requestReferenceSpace('local-floor');
  return await new Promise((resolve) => session.requestAnimationFrame((t, f) => {
    const pose = f.getViewerPose(space);
    const [l, r] = pose.views;
    resolve({ ipd: r.transform.position.x - l.transform.position.x, proj: Array.from(l.projectionMatrix), same: l.projectionMatrix[0] !== r.projectionMatrix[8], vp: [l, r].map((v) => session.renderState.baseLayer.getViewport(v)), sources: session.inputSources.map((s) => s.handedness), canvas: [document.getElementById('c').width, document.getElementById('c').height] });
  }));
});
check('eye distance is the device IPD', Math.abs(info.ipd - 0.063) < 1e-4, info.ipd.toFixed(4));
check('projection matrix is finite and perspective', info.proj.every(Number.isFinite) && info.proj[11] === -1);
check('viewports split the canvas in two', info.vp[0].x === 0 && info.vp[1].x === info.vp[0].width && info.vp[0].width * 2 === info.canvas[0], JSON.stringify(info.vp));
check('two tracked-pointer controllers', info.sources.join() === 'left,right');

await page.keyboard.down('KeyW');
await page.waitForTimeout(600);
await page.keyboard.up('KeyW');
const moved = await page.evaluate(() => window.demoState.lastHead);
check('W walks forward (-Z)', moved[2] < -0.2, moved.map((n) => n.toFixed(2)).join(','));

await page.evaluate(() => { const e = window.__xrEmulator; e.click('right', 'trigger'); e.click('left', 'squeeze'); });
const s1 = await page.evaluate(() => ({ ...window.demoState }));
check('trigger click fires select', s1.selects === 1, `selects=${s1.selects}`);
check('squeeze click fires squeeze', s1.squeezes === 1);

await page.mouse.click(450, 250);
check('mouse click acts as the right trigger', (await page.evaluate(() => window.demoState.selects)) === 2);

const yaw = await page.evaluate(() => { const e = window.__xrEmulator; e.setHead({ yaw: Math.PI / 2 }); return e.rig.yaw; });
await page.waitForTimeout(150);
const px = await page.evaluate(() => { const c = document.getElementById('c'); const g = c.getContext('webgl2'); return [c.width, c.height, g ? 'ctx' : 'noctx']; });
check('canvas was resized for the layer', px[0] > 100 && px[1] > 100, px.join(' '));
await page.screenshot({ path: join(root, 'tests', 'smoke.png') });

await page.evaluate(() => window.__xrEmulator.session.end());
check('session ends cleanly', await page.evaluate(() => window.__xrEmulator.session === null && !window.demoState.session));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);

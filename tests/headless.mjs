// The app without a browser (bin/headless-page.mjs on bin/headless-dom.mjs): index.html's module starts on the stand-in
// DOM, loads a scene, and keys, the Enter box, the text box and the palette work as the terminal sends them.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { headlessDriver } from '../bin/headless-page.mjs';
import { keyEvents } from '../bin/term-app.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const D = await headlessDriver({ root, ss: 2, quiet: false });
const say = console.log;
console.log = console.info = console.warn = () => {}; // (the page's own notes)
await D.setSize(80, 24);
await D.navigate('http://spider.local/?scene=globe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 100 && !globalThis.__ready; i++) await sleep(100);
assert.ok(globalThis.__ready, 'the page started');
const ev = async (x) => (await D.page('Runtime.evaluate', { expression: x, returnByValue: true })).result.value;
const objects = () => ev("Number(document.getElementById('count').textContent)");
for (let i = 0; i < 50 && (await objects()) < 8; i++) await sleep(100);
assert.equal(await objects(), 8, 'the globe: 8 objects');
const key = async (k, mods = {}) => {
  for (const e of keyEvents({ key: k, ...mods })) await D.page('Input.dispatchKeyEvent', e);
};
const type = async (s) => {
  for (const c of s) await key(c, { shift: c !== c.toLowerCase() });
};
// the pointer over the middle, M: a prism on the globe
await D.page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 80, y: 48, button: 'none', buttons: 0 });
await sleep(300);
assert.ok(await ev('document.getElementById("hud").textContent.includes("target")'), 'the HUD names what is under the cross');
await key('m');
await sleep(300);
assert.equal(await objects(), 9, 'M put a prism down');
// the palette and its hooks
await key('p');
await sleep(100);
const pal = await ev('globalThis.__palette()');
assert.ok(pal.items.length >= 10 && pal.props.some((p) => p.key === 'soft'), 'the palette opened, its materials and values');
await key('p');
// the Enter box: /text puts words down
await key('Escape');
await key('Enter');
await sleep(100);
assert.equal(await ev("document.getElementById('findBox').hidden"), false, 'Enter opens the box');
await type('/text HI');
await sleep(100);
await key('Enter');
await sleep(400);
assert.equal(await objects(), 10, '/text HI made a text model');
// a story from the + scene list (/l picks the list's option: its value, not its label)
await key('Enter');
await sleep(100);
await type('/l last light');
await sleep(200);
await key('Enter');
for (let i = 0; i < 100 && (await ev("document.body.classList.contains('story')")) !== true; i++) await sleep(100);
assert.equal(await ev("document.body.classList.contains('story')"), true, 'the LARK-4C story opened');
assert.deepEqual(globalThis.__domErrors, [], 'no page errors on the way');
// the picture: no WebGPU in node, a dark one of the asked size
const img = await D.grab(80, 22);
assert.deepEqual([img.width, img.height], [80, 44]);
say('headless app: OK');
process.exit(0);

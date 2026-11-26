// The terminal view: a box drawn into half-block cells with 24-bit colours; the CLI prints a frame of a models/ scene.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { box } from '../engine/45789c908f86/mesh.js';
import { rasterize, toAnsi, renderTerm, cellRows, diffRow } from '../src/term-render.js';

const cube = box({ size: [1, 1, 1], color: '#cc4422' });
const img = rasterize(cube, { width: 40, height: 40 });
const lit = img.set.reduce((a, b) => a + b, 0);
assert.ok(lit > 200 && lit < 1600, `the cube covers part of the grid (${lit})`);
assert.equal(img.set[0], 0, 'the corner is empty');
const colours = new Set();
for (let k = 0; k < img.set.length; k++) if (img.set[k]) colours.add(img.rgb.slice(k * 3, k * 3 + 3).join(','));
assert.ok(colours.size >= 3 && colours.size <= 3, `three faces seen, three shades (${colours.size})`);
const text = renderTerm(cube, { cols: 40, rows: 20 });
assert.equal(text.split('\n').length, 20, 'one line a row of cells');
assert.match(text, /\x1b\[[0-9;]*38;2;\d+;\d+;\d+/, '24-bit colour');
assert.match(text, /▀/);
assert.ok(toAnsi({ width: 2, height: 2, rgb: new Uint8Array(12), set: new Uint8Array(4) }).includes('  '), 'empty cells are spaces');
const cli = spawnSync(process.execPath, ['bin/spider-term.mjs', 'bridge', '--once', '--cols', '60', '--rows', '16'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr);
assert.equal(cli.stdout.trimEnd().split('\n').length, 16);
// a sky (deepsky: 5000 instances light years apart) is drawn as points from the start eye, quickly and without meshes
const t0 = Date.now();
const sky = spawnSync(process.execPath, ['bin/spider-term.mjs', 'deepsky', '--once', '--cols', '80', '--rows', '20'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
assert.equal(sky.status, 0, sky.stderr);
assert.equal(sky.stdout.trimEnd().split('\n').length, 20);
assert.ok(Date.now() - t0 < 15000, 'the sky loads in seconds');
assert.ok((sky.stdout.match(/38;2;/g) ?? []).length > 50, 'stars are drawn');
console.log('terminal view: OK');

// the app way: terminal bytes -> DOM keys, Chrome's PNG screenshots decoded
{
  const { keysOf, keyEvents, decodePng } = await import('../bin/term-app.mjs');
  const { deflateSync } = await import('node:zlib');
  assert.deepEqual(keysOf('w').map((k) => k.key), ['w']);
  assert.deepEqual(keysOf('\x1b[A\r\x1b').map((k) => k.key), ['ArrowUp', 'Enter', 'Escape']);
  assert.equal(keysOf('W')[0].shift, true, 'a capital is Shift');
  assert.deepEqual(keysOf('\x04')[0], { key: 'd', ctrl: true }, 'Ctrl+D');
  assert.equal(keysOf('\x1bn')[0].alt, true, 'Alt+N');
  assert.equal(keysOf('\x1b[Z')[0].shift, true, 'Shift+Tab');
  const [down, up] = keyEvents({ key: 'm' });
  assert.equal(down.type, 'keyDown');
  assert.equal(down.code, 'KeyM');
  assert.equal(down.text, 'm');
  assert.equal(up.type, 'keyUp');
  assert.equal(keyEvents({ key: 'ArrowLeft' })[0].type, 'rawKeyDown');
  assert.equal(keyEvents({ key: 'd', ctrl: true })[0].modifiers, 2);
  // a 2 × 2 RGBA PNG with the Sub and Up filters
  const raw = Buffer.from([1, 255, 0, 0, 255, 1, 1, 1, 0, 2, 0, 255, 0, 0, 0, 0, 0, 0]);
  const chunk = (name, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(name, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0), ihdr.writeUInt32BE(2, 4), (ihdr[8] = 8), (ihdr[9] = 6);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const img = decodePng(png);
  assert.deepEqual([img.width, img.height], [2, 2]);
  assert.deepEqual([...img.rgb.slice(0, 6)], [255, 0, 0, 0, 1, 1], 'Sub filter');
  assert.deepEqual([...img.rgb.slice(6, 12)], [255, 255, 0, 0, 1, 1], 'Up filter');
  console.log('terminal app keys and png: OK');
}
{
  const { keysOf } = await import('../bin/term-app.mjs');
  assert.deepEqual(keysOf('\x1b[13;2u')[0], { key: 'Enter', shift: true, alt: false, ctrl: false }, 'Shift+Enter (kitty)');
  assert.deepEqual(keysOf('\x1b[27;2;13~')[0], { key: 'Enter', shift: true, alt: false, ctrl: false }, 'Shift+Enter (modifyOtherKeys)');
  assert.deepEqual(keysOf('\x1b[100;5u')[0], { key: 'd', shift: false, alt: false, ctrl: true }, 'Ctrl+D (kitty)');
  assert.equal(keysOf('\x1b[27u')[0].key, 'Escape', 'Esc (kitty)');
  assert.deepEqual(keysOf('\x1b\r')[0], { key: 'Enter', alt: true }, 'Alt+Enter');
  console.log('terminal app modified keys: OK');
}
{
  // the terminal's help view: the help/ files as text, a section row, places found by words
  const { createHelpView } = await import('../bin/term-help.mjs');
  const { visible } = await import('../src/md/markdown.js');
  const v = createHelpView(new URL('..', import.meta.url).pathname);
  let rows = v.rows(70, 20);
  assert.equal(rows.length, 20);
  assert.ok(rows.every((r) => visible(r) <= 70), 'no row wider than the terminal');
  assert.match(rows[0].replace(/\x1b\[[0-9;]*m/g, ''), /Help/);
  v.open('edit.md', { text: 'Ctrl+B: bevel' });
  rows = v.rows(70, 20);
  assert.ok(rows.slice(1).some((r) => r.replace(/\x1b\[[0-9;]*m/g, '').includes('Ctrl+B: bevel')), 'opened at the place');
  assert.equal(v.key({ key: 'Escape' }, 20), 'close');
  console.log('terminal help view: OK');
}

{
  // frame diffs: only the changed cells are sent; rounded colours change fewer cells
  const W = 20, H = 4, img = (shift) => ({ width: W, height: H, rgb: Uint8Array.from({ length: W * H * 3 }, (_, k) => (Math.floor(k / 3) % W === 7 ? 200 : 10 + shift)), set: new Uint8Array(W * H).fill(1) });
  const a = cellRows(img(0)), b = cellRows(img(0));
  assert.equal(diffRow(a[0], b[0], 1), '', 'nothing changed: nothing sent');
  const c = cellRows(img(0));
  c[0][12] = ['1;2;3', '4;5;6', '▀'];
  const d = diffRow(a[0], c[0], 3);
  assert.ok(d.startsWith('\x1b[3;13H') && d.includes('1;2;3') && d.replace(/\x1b\[[0-9;]*[mH]/g, '').length === 1, 'one cell: a jump and that cell');
  assert.equal(diffRow(null, a[0], 1).replace(/\x1b\[[0-9;]*[mH]/g, '').length, W, 'no previous row: all of it');
  assert.equal(diffRow(cellRows(img(0), 3)[0], cellRows(img(2), 3)[0], 1), '', 'a small colour drift disappears when rounded');
  const run = diffRow(null, [['1;1;1', '2;2;2', '▀'], ['3;3;3', '2;2;2', '▀'], ['', '', ' ']], 1);
  assert.equal(run, '\x1b[1;1H\x1b[38;2;1;1;1;48;2;2;2;2m▀\x1b[38;2;3;3;3m▀\x1b[49m \x1b[0m', 'only the colour that changes is sent');
  console.log('terminal frame diff: OK');
}
{
  // the palette as a text panel in the terminal app view
  const { createPaletteView } = await import('../bin/term-palette.mjs');
  const v = createPaletteView();
  const pal = { current: 1, items: ['plaster', 'oak', 'steel'].map((name, i) => ({ name, color: ['#dddddd', '#a0703c', '#99aaaa'][i], alpha: 1, metal: i === 2 ? 1 : 0 })), props: [{ key: 'metal', min: 0, max: 1, step: 0.05, value: 0 }, { key: 'rough', min: 0, max: 1, step: 0.05, value: 0.9 }] };
  const { x0, lines } = v.draw(pal, 80, 20);
  const text = (y) => lines.get(y).map((c) => c[2]).join('');
  assert.equal(x0, 80 - lines.get(0).length, 'on the right');
  assert.match(text(0), /materials.*✕/);
  assert.match(text(2), /^▸.*oak/, 'the chosen material marked');
  assert.equal(lines.get(2)[1][1], '160;112;60', 'its colour as a swatch');
  assert.deepEqual(v.key({ key: 'ArrowDown' }, pal), { current: 2 });
  assert.deepEqual(v.key({ key: 'ArrowUp' }, pal), { current: 0 });
  assert.equal(v.key({ key: 'Tab' }, pal), 'draw');
  assert.deepEqual(v.key({ key: 'ArrowRight' }, pal), { key: 'rough', value: 0.95 }, 'Tab chose rough, → one step');
  assert.equal(v.key({ key: 'w' }, pal), null, 'other keys are the page’s');
  assert.deepEqual(v.mouse(x0 + 3, 3, { press: true }, pal), { current: 2 }, 'a click on a material');
  assert.equal(v.mouse(x0 + lines.get(0).length - 2, 0, { press: true }, pal), 'close');
  assert.equal(v.mouse(x0 - 5, 3, { press: true }, pal), null, 'left of the panel: the picture (Ctrl+click paints)');
  console.log('terminal palette: OK');
}

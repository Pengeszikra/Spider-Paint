// The terminal view: a box drawn into half-block cells with 24-bit colours; the CLI prints a frame of a models/ scene.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { box } from '../engine/45789c908f86/mesh.js';
import { rasterize, toAnsi, renderTerm } from '../src/term-render.js';

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
console.log('terminal view: OK');

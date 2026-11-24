// build_model renders a PNG image block (mcp/raster.js), small even for a dense character mesh; format "svg" keeps SVG text.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { handleWorkshopMcp } from '../mcp/workshop-app.js';
import { renderPng } from '../mcp/raster.js';

const ctx = { origin: 'https://spider-paint.example', fetchText: async () => '' };
const call = (id, name, args) => handleWorkshopMcp({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, ctx);
const steps = [
  { tool: 'add_box', args: { name: 'Bench', size: [2, 0.1, 1], at: [0, 0.8, 0], color: '#8b5a2b' } },
  { tool: 'add_box', args: { name: 'Cube', size: [0.3, 0.3, 0.3], at: [0, 3, 0], color: '#44aaff' } },
  { tool: 'place_on', args: { name: 'Cube', onto: 'Bench', at: [0.4, 0] } },
  { tool: 'add_character', args: { name: 'Mechanic', preset: 'mechanic', pose: 'stand', at: [0, 0, 1.2], yaw: 180 } },
];

// the PNG header: size and RGB
const header = (buf) => {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), depth: buf[24], type: buf[25] };
};

const png = await call(1, 'build_model', { steps });
const blocks = png.result.content;
assert.deepEqual(blocks.map((b) => b.type), ['text', 'image'], 'a JSON text block, then the picture');
const out = JSON.parse(blocks[0].text);
assert.equal(out.failed, 0);
assert.ok(!('render' in out), 'no SVG text in the JSON');
assert.equal(blocks[1].mimeType, 'image/png');
const buf = Buffer.from(blocks[1].data, 'base64');
assert.deepEqual(header(buf), { w: 560, h: 560, depth: 8, type: 2 }, 'default: 2x2 sheet of 280 px views');
assert.ok(buf.length < 120000, `a character sheet stays small (${buf.length} bytes)`);

const one = await call(2, 'build_model', { steps, render: 'persp', size: 400 });
const b1 = Buffer.from(one.result.content[1].data, 'base64');
assert.deepEqual(header(b1), { w: 400, h: 400, depth: 8, type: 2 });

const none = await call(3, 'build_model', { steps, render: 'none' });
assert.deepEqual(none.result.content.map((b) => b.type), ['text']);

// format svg falls through to the synced 3Draft transport (SVG text block)
assert.equal(await call(4, 'build_model', { steps, format: 'svg' }), undefined, 'svg is left to mcp/http.js');

// deterministic, and the pixels decode: a red box seen from the front fills the middle with red
const box = [{ name: 'B', mesh: { positions: [[-1, 0, -1], [1, 0, -1], [1, 2, -1], [-1, 2, -1], [-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]], faces: [
  { v: [4, 5, 6, 7], color: '#ff0000' }, { v: [1, 0, 3, 2], color: '#ff0000' }, { v: [0, 4, 7, 3], color: '#ff0000' },
  { v: [5, 1, 2, 6], color: '#ff0000' }, { v: [3, 7, 6, 2], color: '#ff0000' }, { v: [0, 1, 5, 4], color: '#ff0000' },
] } }];
const a = renderPng(box, { view: 'front', size: 100 });
assert.ok(a.equals(renderPng(box, { view: 'front', size: 100 })), 'deterministic');
const idat = a.subarray(a.indexOf('IDAT') + 4, a.indexOf('IEND') - 8);
const raw = inflateSync(idat);
const row = 50, stride = 100 * 3 + 1;
// undo the Up filter down to the middle row
const line = new Uint8Array(300);
for (let y = 0; y <= row; y++) for (let i = 0; i < 300; i++) line[i] = (line[i] + raw[y * stride + 1 + i]) & 255;
const [r, g, bl] = line.subarray(150, 153);
assert.ok(r > 150 && g < 40 && bl < 40, `middle pixel is lit red (${r},${g},${bl})`);
console.log('raster ok:', buf.length, 'bytes for the character sheet');

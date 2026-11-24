// instance: one prototype, many copies (scene format v2 prototypes, as the viewer's stars), round trips and the browser model
import { publicTools } from '../mcp/http.js';
import { createScene, expandInstances } from '../mcp/scene.js';
import { bundleBrowserModel } from '../mcp/workshop-browser-model.js';
import assert from 'node:assert';
const bm = publicTools().find(t => t.name === 'build_model');
const ctx = { origin: 'https://x.test' };
// a pine: trunk + three needle rings as instances of one ring (the user's idea)
const ring = { tool: 'add_mesh', args: { name: 'Ring', color: '#2a5c33', positions: [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[0,1.6,0]], faces: [{ v:[0,1,2,3] },{ v:[1,0,4] },{ v:[2,1,4] },{ v:[3,2,4] },{ v:[0,3,4] }] } };
const steps = [
  { tool: 'add_box', args: { name: 'Trunk', size: [0.3, 1.5, 0.3], at: [0, 0.75, 0], color: '#5a3b22' } },
  ring,
  { tool: 'instance', args: { name: 'R2', source: 'Ring', at: [0, 2.2, 0], scale: 0.75, color: '#1f4d2b' } },
  { tool: 'instance', args: { name: 'R3', source: 'Ring', at: [0, 3.2, 0], scale: 0.5, rotate_y: 45, color: '#173d22' } },
  { tool: 'transform', args: { name: 'Ring', move: [0, 1.2, 0] } },
  { tool: 'group', args: { name: 'Pine', objects: ['Trunk', 'Ring', 'R2', 'R3'] } },
];
const one = bm.run({ steps, render: 'none' }, ctx);
assert.equal(one.failed, 0, JSON.stringify(one.steps.filter(s => s.error)));
// a whole pine as one mesh to copy: boolean union is heavy; instead merge via add_mesh of the group? use get_mesh path: copy each part
const copies = [];
for (let i = 0; i < 60; i++) copies.push({ at: [Math.cos(i) * 30, 0, Math.sin(i * 1.7) * 30], scale: 0.8 + (i % 5) * 0.15, rotate_y: i * 37 });
const two = bm.run({ from: one.open_url, steps: [
  { tool: 'instance', args: { name: 'Tree', source: 'Trunk', copies } },
  { tool: 'instance', args: { name: 'Odd', source: 'R2', at: [5, 0, 5], scale: [1, 2, 1] } },
  { tool: 'instance', args: { name: 'Tint', source: 'Trunk', at: [6, 0, 6], colors: { '#5a3b22': '#7a5b42' } } },
], render: 'none' }, ctx);
assert.equal(two.failed, 0, JSON.stringify(two.steps));
console.log('step results:', JSON.stringify(two.steps.map(s => s.result)).slice(0, 400));
// link size: compact vs the same scene written plainly
const sc = createScene();
const payload = /#scene=(.*)/.exec(two.open_url)[1];
const { unpack } = await import('../mcp/http.js');
const data = unpack(payload);
console.log('version', data.version, 'prototypes', Object.keys(data.prototypes || {}), 'objects', data.objects.length, 'compact objs', data.objects.filter(o => o.proto).length);
sc.call('import', { json: JSON.stringify(data) });
const plain = JSON.parse(sc.call('export', {}).text);
const compact = JSON.parse(sc.call('export', { compact: true }).text);
console.log('json bytes plain', JSON.stringify(plain).length, 'compact', JSON.stringify(compact).length, 'link chars', two.open_url.length);
// round trip: import compact == plain
assert.deepEqual(expandInstances(compact).objects.map(o => o.mesh), plain.objects.map(o => o.mesh));
// edit a copy -> becomes plain, others stay compact
const three = bm.run({ from: two.open_url, steps: [{ tool: 'transform', args: { name: 'Tree-3', move: [0, 1, 0] } }, { tool: 'list' }], render: 'none' }, ctx);
const d3 = unpack(/#scene=(.*)/.exec(three.open_url)[1]);
assert.ok(d3.objects.find(o => o.name === 'Tree-3').mesh);
assert.ok(d3.objects.find(o => o.name === 'Tree-4').proto);
assert.ok(d3.objects.find(o => o.name === 'R2').group === 'Pine');
// browser bundle includes instantiate and WorkshopModel takes a v2 base
const src = bundleBrowserModel();
const WM = new Function(src + '\nreturn WorkshopModel;')();
const wm = new WM(data);
const r = wm.apply('instance', { name: 'B', source: 'Trunk', at: [1, 0, 1] });
assert.equal(wm.data().objects.length, data.objects.length + 1);
// PNG render with an expanded scene
const { renderPng } = await import('../mcp/raster.js');
const png = renderPng(expandInstances(data).objects, { view: 'persp', size: 200 });
console.log('png bytes', png.length, 'ALL OK');
// group source: the whole pine
const four = bm.run({ from: one.open_url, steps: [
  { tool: 'instance', args: { name: 'P', source: 'Pine', copies: [{ at: [10, 0, 0] }, { at: [-10, 0, 3], scale: 1.3, rotate_y: 20 }] } },
  { tool: 'transform', args: { name: 'P-1.Trunk', move: [0, 0, 2] } },
  { tool: 'list' },
], render: 'none' }, ctx);
assert.equal(four.failed, 0, JSON.stringify(four.steps));
const d4 = unpack(/#scene=(.*)/.exec(four.open_url)[1]);
const names4 = d4.objects.map(o => o.name);
assert.ok(names4.includes('P-2.R3') && d4.objects.find(o => o.name === 'P-2.R3').group === 'P-2');
// moving one member moved its whole group (P-1.*): those are now plain, P-2 still compact
assert.ok(d4.objects.find(o => o.name === 'P-1.R2').mesh && d4.objects.find(o => o.name === 'P-2.R2').proto);
console.log('group source:', JSON.stringify(four.steps[0].result), 'GROUP OK');

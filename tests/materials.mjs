// materials everywhere: every MCP step that makes or paints a surface takes a palette material (mat), not only a colour,
// the scene carries the materials it uses, and the MCP palette starts as the viewer's
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScene } from '../mcp/scene.js';
import { BUILTIN_MATERIALS } from '../mcp/materials.js';
import { publicTools } from '../mcp/http.js';
import { WORKSHOP_TOOLS } from '../mcp/workshop-tools.js';

// the built-in palette is the viewer's starting palette (index.html MATERIALS, its screen entry aside)
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const viewer = [...html.slice(html.indexOf('const MATERIALS = ['), html.indexOf('];', html.indexOf('const MATERIALS = ['))).matchAll(/\{ name: '([^']+)', color: '([^']+)', metal: ([\d.]+), rough: ([\d.]+), alpha: ([\d.]+), emit: ([\d.]+)(, url)?/g)]
  .filter((m) => !m[7]).map((m) => ({ name: m[1], color: m[2], metal: +m[3], rough: +m[4], alpha: +m[5], emit: +m[6] }));
assert.deepEqual(BUILTIN_MATERIALS, viewer, 'mcp/materials.js and the viewer\'s MATERIALS agree');

const s = createScene();
const call = (tool, args) => {
  const r = s.call(tool, args);
  if (r.isError) throw new Error(`${tool}: ${r.text}`);
  return JSON.parse(r.text);
};
const faces = (n) => s.data().objects.find((o) => o.name === n).mesh.faces;

// add_box / add_extrusion with a material: every face names it and keeps its colour as the fallback
call('add_box', { name: 'pane', size: [1, 1, 0.02], mat: 'glass' });
assert.ok(faces('pane').every((f) => f.mat === 'glass' && f.color === '#a9d3e8'));
call('add_extrusion', { name: 'slab', polygon: [[0, 0], [2, 0], [2, 1]], height: 0.2, mat: 'concrete' });
assert.ok(faces('slab').every((f) => f.mat === 'concrete'));
// a new material, like another one
const neon = call('material', { name: 'neon', like: 'lamp', color: '#39ff88', emit: 3 });
assert.equal(neon.emit, 3);
assert.equal(neon.rough, 0.5);
// add_mesh: a default mat, a face's own mat, a face's own plain colour
call('add_mesh', { name: 'sign', mat: 'steel', positions: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1]], faces: [{ v: [0, 1, 2, 3], mat: 'neon' }, { v: [1, 0, 4] }, { v: [2, 1, 4], color: '#ff0000' }, { v: [3, 2, 4] }, { v: [0, 3, 4] }] });
const sf = faces('sign');
assert.equal(sf[0].mat, 'neon');
assert.equal(sf[1].mat, 'steel');
assert.equal(sf[2].mat, undefined);
assert.equal(sf[2].color, '#ff0000');
// instance: a whole copy in one material, a material swapped for another; a plain colour over materials replaces them
call('instance', { name: 'pane-gold', source: 'pane', at: [3, 0, 0], mat: 'gold' });
assert.ok(faces('pane-gold').every((f) => f.mat === 'gold'));
call('instance', { name: 'sign-red', source: 'sign', at: [5, 0, 0], mats: { neon: 'ruby-glass' } });
assert.equal(faces('sign-red')[0].mat, 'ruby-glass');
assert.equal(faces('sign-red')[1].mat, 'steel');
call('instance', { name: 'pane-flat', source: 'pane', at: [7, 0, 0], color: '#123456' });
assert.ok(faces('pane-flat').every((f) => f.mat === undefined && f.color === '#123456'), 'a colour over a material: the colour shows');
// recolor: a material, or a plain colour (which drops the material)
call('recolor', { name: 'slab', mat: 'brick', face: 0 });
assert.equal(faces('slab')[0].mat, 'brick');
call('recolor', { name: 'slab', color: '#00ff00', face: 1 });
assert.equal(faces('slab')[1].mat, undefined);
assert.equal(s.call('recolor', { name: 'slab' }).isError, true, 'recolor needs mat or color');
// unknown materials are refused with the palette listed
const bad = s.call('add_box', { name: 'x', mat: 'unobtainium' });
assert.equal(bad.isError, true);
assert.match(bad.text, /glass/);
// changing a material changes the fallback colour of its faces
call('material', { name: 'neon', color: '#ff2bd6' });
assert.equal(faces('sign')[0].color, '#ff2bd6');
// get_mesh shows the material
assert.equal(call('get_mesh', { name: 'sign' }).faces[0].mat, 'neon');
// the scene carries the materials its faces use (with their surface), and only those
const pal = s.data().palette;
const byName = Object.fromEntries(pal.map((m) => [m.name, m]));
for (const n of ['glass', 'concrete', 'neon', 'steel', 'gold', 'ruby-glass', 'brick']) assert.ok(byName[n], `palette has ${n}`);
assert.equal(byName.glass.alpha, 0.3);
assert.equal(byName.neon.emit, 3);
assert.equal(byName.wood, undefined, 'unused materials stay out');
// and a scene loaded back keeps its own materials
const s2 = createScene();
assert.equal(s2.call('import', { json: JSON.stringify(s.data()) }).isError, false);
assert.equal(JSON.parse(s2.call('material', { name: 'neon' }).text).color, '#ff2bd6');
// the step lists know the material step
assert.ok(WORKSHOP_TOOLS.includes('material'));
const bm = publicTools().find((t) => t.name === 'build_model');
assert.ok(bm.inputSchema.properties.steps.items.properties.tool.enum.includes('material'));
const run = bm.run({ steps: [{ tool: 'material', args: { name: 'teal-glass', like: 'glass', color: '#2fb8c0' } }, { tool: 'add_box', args: { name: 'b', mat: 'teal-glass' } }], render: 'none' }, { origin: 'https://x.test' });
assert.equal(run.failed, 0, JSON.stringify(run.steps));
console.log('materials: every surface step takes a palette material; the scene carries its palette: OK');
// extrude_face: the new sides keep the pushed face's material (the engine's extrude gives them only its colour)
{
  const e = createScene();
  e.call('add_box', { name: 'p', mat: 'wood' });
  const r = JSON.parse(e.call('extrude_face', { name: 'p', face: 0, distance: 0.3 }).text);
  const ff = e.data().objects[0].mesh.faces;
  assert.ok([r.cap_face, ...r.side_faces].every((i) => ff[i].mat === 'wood'), 'extruded sides keep the material');
  const r2 = JSON.parse(e.call('extrude_face', { name: 'p', face: r.cap_face, distance: 0.1, mat: 'brick' }).text);
  assert.ok([r2.cap_face, ...r2.side_faces].every((i) => e.data().objects[0].mesh.faces[i].mat === 'brick'));
  console.log('extrude_face keeps or sets the material: OK');
}

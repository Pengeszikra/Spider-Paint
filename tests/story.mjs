// build_story: a model + motions -> a valid Spider Build v2 story in a #story= link (both storage modes), and open_workshop story.
import assert from 'node:assert/strict';
import { handleWorkshopMcp } from '../mcp/workshop-app.js';
import { unpack } from '../mcp/http.js';
import { validateBuildDocument, sceneAt } from '../models/spider-build-v2.mjs';

const ctx = { origin: 'https://spider-paint.test', fetchText: async () => { throw new Error('no static files in this test'); } };
let id = 0;
const call = async (name, args) => {
  const r = await handleWorkshopMcp({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, ctx);
  return r.result;
};

const list = await handleWorkshopMcp({ jsonrpc: '2.0', id: ++id, method: 'tools/list' }, ctx);
assert.ok(list.result.tools.some((t) => t.name === 'build_story'), 'build_story is listed');

// a 3-level pyramid of 14 bricks: one brick + instance copies
const copies = [];
for (let k = 0; k < 3; k++) for (let i = 0; i < 3 - k; i++) for (let j = 0; j < 3 - k; j++) if (k || i || j) copies.push({ at: [i - (2 - k) / 2, k * 0.5, j - (2 - k) / 2] });
const steps = [
  { tool: 'add_box', args: { name: 'brick', size: [0.94, 0.46, 0.94], at: [-1, 0.23, -1], color: '#c8a165' } },
  { tool: 'instance', args: { name: 'pyr', source: 'brick', copies } },
];
const motions = [
  { object: 'pyr-13', keys: [{ t: 0 }, { t: 600, move: [0, 2, 0] }, { t: 1200, move: [4, 0, 0], rotate: [0, 90, 0] }] },
  { objects: ['pyr-1', 'pyr-2'], keys: [{ t: 300 }, { t: 1500, move: [0, 0, 3] }] },
  { match: '*-5', keys: [{ t: 0 }, { t: 900, move: [0, 0, -3] }] },
];

// animation mode (few distinct motions)
let r = await call('build_story', { title: 'Pyramid test', steps, motions, captions: [{ start: 0, end: 1000, text: 'Taking it apart' }] });
assert.ok(!r.isError, r.content?.[0]?.text);
let out = JSON.parse(r.content[0].text);
assert.equal(out.mode, 'animation');
assert.equal(out.objects, 14);
assert.ok(out.animated >= 2);
assert.ok(out.open_url.startsWith('https://spider-paint.test/#story='));
assert.ok(out.player_url.startsWith('https://spider-paint.test/player.html#story='));
assert.equal(r.content.filter((c) => c.type === 'image').length, 3, 'three preview frames');
let doc = unpack(out.story_token);
validateBuildDocument(doc);
const top = (t) => sceneAt(doc, t).find((o) => o.name === 'pyr-13').mesh.positions.reduce((m, p) => Math.max(m, p[1]), -Infinity);
assert.ok(Math.abs(top(0) - 1.46) < 1e-3, 'the top brick starts in place');
assert.ok(top(600) > 3.4, 'the top brick lifts');

// frames mode (stop-motion), forced
r = await call('build_story', { steps, motions, mode: 'frames', include_doc: true, preview: false });
assert.ok(!r.isError, r.content?.[0]?.text);
out = JSON.parse(r.content[0].text);
assert.equal(out.mode, 'frames');
assert.ok(out.frames > 5);
validateBuildDocument(out.story);
assert.equal(r.content.length, 1);
const endTop = sceneAt(out.story, out.duration_ms).find((o) => o.name === 'pyr-13').mesh.positions.reduce((m, p) => Math.max(m, p[1]), -Infinity);
assert.ok(Math.abs(endTop - 1.46) < 1e-3, 'it lands back on the ground level of its own height');

// auto picks frames above 64 distinct motions
const many = Array.from({ length: 13 }, (_, i) => ({ object: `pyr-${i + 1}`, keys: [{ t: i * 10 }, { t: 400 + i * 10, move: [i, 0, 0] }] }))
  .concat([{ object: 'brick', keys: [{ t: 0 }, { t: 200, move: [0, 1, 0] }] }]);
r = await call('build_story', { steps, motions: many, mode: 'animation', preview: false });
assert.equal(JSON.parse(r.content[0].text).mode, 'animation');

// errors are plain
r = await call('build_story', { steps, motions: [{ object: 'nope', keys: [{ t: 0 }] }] });
assert.ok(r.isError && /no object "nope"/.test(r.content[0].text));
r = await call('build_story', { motions });
assert.ok(r.isError && /give the model/.test(r.content[0].text));

// open_workshop plays a story inline
r = await call('open_workshop', { story: out.open_url ?? '' });
const ok = await call('build_story', { steps, motions, preview: false });
const token = JSON.parse(ok.content[0].text).story_token;
r = await call('open_workshop', { story: token });
assert.ok(!r.isError, r.content?.[0]?.text);
assert.equal(r.structuredContent.story_token, token);
assert.equal(r._meta.ui.resourceUri.startsWith('ui://spider-paint/'), true);
r = await call('open_workshop', { story: token, steps: [] });
assert.ok(r.isError);

// background: stored in presentation.background, player_url carries ?bg=, a bad value is refused
r = await call('build_story', { steps, motions, background: '#123', preview: false });
assert.ok(!r.isError, r.content?.[0]?.text);
out = JSON.parse(r.content[0].text);
assert.equal(out.background, '#112233');
assert.ok(out.player_url.startsWith('https://spider-paint.test/player.html?bg=%23112233#story='));
doc = unpack(out.story_token);
validateBuildDocument(doc);
assert.equal(doc.presentation.background, '#112233');
r = await call('build_story', { steps, motions, background: 'transparent', preview_at: [0, 450, 99999] });
assert.ok(!r.isError, r.content?.[0]?.text);
out = JSON.parse(r.content[0].text);
assert.equal(unpack(out.story_token).presentation.background, 'transparent');
assert.deepEqual(r.content.filter((c) => c.type === 'text' && c.text.startsWith('t = ')).map((c) => c.text), ['t = 0 ms', 't = 450 ms', `t = ${out.duration_ms} ms`], 'preview_at picks the moments (clamped to the end)');
r = await call('build_story', { steps, motions, background: 'blue' });
assert.ok(r.isError && /background/.test(r.content[0].text));
r = await call('build_story', { steps, motions, preview_at: [] });
assert.ok(r.isError && /preview_at/.test(r.content[0].text));
assert.throws(() => validateBuildDocument({ ...doc, presentation: { background: 'red' } }), /presentation.background/);

// shapes: a box morphs into its extruded shape (the template is left out; new vertices grow from the old top)
{
  const shapeSteps = [
    { tool: 'add_box', args: { name: 'block', size: [1, 1, 1], at: [0, 0.5, 0] } },
    { tool: 'add_box', args: { name: 'tall', size: [1, 1, 1], at: [3, 0.5, 0] } },
    { tool: 'extrude_face', args: { name: 'tall', face: 4, distance: 1 } },
    { tool: 'transform', args: { name: 'tall', move: [-3, 0, 0] } },
  ];
  const sr = await call('build_story', { steps: shapeSteps, shapes: [{ object: 'block', keys: [{ t: 0, shape: 'block' }, { t: 700, shape: 'tall', ease: 'linear' }] }], shape_ms: 100 });
  assert.ok(!sr.isError, sr.content?.[0]?.text);
  const so = JSON.parse(sr.content[0].text);
  assert.equal(so.objects, 1, 'the shape template is not in the story');
  assert.equal(so.shaped, 1);
  assert.equal(so.shape_frames, 7);
  const sdoc = unpack(so.story_token);
  validateBuildDocument(sdoc);
  const top = (t) => Math.max(...sceneAt(sdoc, t).find((o) => o.name === 'block').mesh.positions.map((p) => p[1]));
  assert.ok(Math.abs(top(0) - 1) < 1e-6 && Math.abs(top(300) - (1 + 3 / 7)) < 0.002 && Math.abs(top(700) - 2) < 1e-6, 'the extrusion grows continuously');
  const bad = await call('build_story', { steps: shapeSteps, shapes: [{ object: 'block', keys: [{ t: 0, shape: 'nope' }] }] });
  assert.ok(bad.isError && /shape/.test(bad.content[0].text));
}
// open_workshop plays a bundled story by name
{
  const or = await call('open_workshop', { story: 'story:spider-sculpt' });
  assert.ok(!or.isError, or.content?.[0]?.text);
  assert.ok(or.structuredContent.story_token.length > 1000);
  const miss = await call('open_workshop', { story: 'story:no-such-story' });
  assert.ok(miss.isError || /unknown_bundled_story/.test(JSON.stringify(miss)));
}

console.log('story: ok');

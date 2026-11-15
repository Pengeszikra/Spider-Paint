import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validate as validateMesh} from '../mcp/engine/index.js';
import {migrateV1, normalizeBuildDocument, validateBuildDocument, constructionAt,
  constructionIndexAtTime, cameraAt, narrationAt} from '../models/spider-build-v2.mjs';

const read = file => JSON.parse(readFileSync(new URL(`../models/${file}`, import.meta.url), 'utf8'));
const legacy = read('lark-4-tutorial.json'), build = read('lark-4.build.json');
const example = () => read('spider-build-example.build.json');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('v1 migration is deterministic and the checked-in export is current', () => {
  assert.deepEqual(migrateV1(legacy), build);
  assert.equal(build.tracks.construction.steps.length, 746);
  assert.equal(build.tracks.camera.keyframes.length, 26);
  assert.equal(build.tracks.narration.cues.length, 772);
  assert.deepEqual(normalizeBuildDocument(legacy), build);
});

test('all 746 commands and all intermediate material-aware scene states survive migration exactly', () => {
  const expected = new Map();
  legacy.events.forEach((event, i) => {
    const step = build.tracks.construction.steps[i];
    assert.deepEqual(step.command, {tool: event.method, args: event.args});
    if (event.after) expected.set(event.name, event.after);
    else if (event.method === 'remove') expected.delete(event.name);
    const replayed = constructionAt(build, step.timeMs);
    assert.equal(hash(replayed), hash([...expected.values()]), `Scene mismatch at step ${i + 1}`);
  });
  const objects = constructionAt(build, build.timeline.durationMs);
  assert.equal(objects.length, 635);
  const fingerprint = hash(objects.map(o => ({name: o.name,
    positions: o.mesh.positions.map(p => p.map(x => Math.round(x * 1e8) / 1e8)), faces: o.mesh.faces.map(f => f.v)})));
  assert.equal(fingerprint, build.result.geometrySha256);
  const live = read('lark-4-live-verification.json').objects;
  let error = 0;
  for (const o of objects) {
    const actual = live.find(v => v.name === o.name);
    assert.ok(actual, `Missing live object ${o.name}`);
    assert.deepEqual(actual.mesh.faces.map(f => f.v), o.mesh.faces.map(f => f.v));
    o.mesh.positions.forEach((p, i) => p.forEach((v, k) => {error = Math.max(error, Math.abs(v - actual.mesh.positions[i][k]));}));
  }
  assert.ok(error < 1e-8);
});

test('camera edits and narration edits cannot alter the construction track or replay', () => {
  const edited = structuredClone(build), before = hash(build.tracks.construction);
  edited.tracks.camera.keyframes = [];
  edited.tracks.camera.initialPose.eye = [200, 300, 400];
  edited.tracks.narration.cues = [];
  validateBuildDocument(edited);
  assert.equal(hash(edited.tracks.construction), before);
  for (const t of [0, 1000, 150000, build.timeline.durationMs]) assert.deepEqual(constructionAt(edited, t), constructionAt(build, t));
});

test('construction supports imports, replacement, removal, backwards seeking and equal-time transactions', () => {
  const doc = example();
  assert.equal(constructionAt(doc, 999).length, 0);
  assert.equal(constructionIndexAtTime(doc, 1000), 1);
  assert.equal(constructionAt(doc, 1000)[0].mesh.positions[0][0], -.5);
  assert.equal(constructionAt(doc, 4000)[0].mesh.positions[0][0], 1.5);
  assert.equal(constructionAt(doc, 7000).length, 0);
  assert.equal(constructionAt(doc, 1000)[0].mesh.positions[0][0], -.5);
  doc.scene.objects.push({name: 'imported', meshRef: 'block'});
  doc.tracks.construction.steps[1].timeMs = 1000;
  validateBuildDocument(doc);
  assert.equal(constructionIndexAtTime(doc, 1000), 2);
  assert.equal(constructionAt(doc, 0).length, 1);
  assert.equal(constructionAt(doc, 1000)[1].mesh.positions[0][0], 1.5);
  const exposed = constructionAt(doc, 1000); exposed[0].mesh.positions[0][0] = 10000;
  assert.equal(doc.assets.meshes.block.positions[0][0], -.5, 'Viewer mutated the recording');
});

test('camera moves between construction steps, holds at cuts and uses shortest-angle interpolation', () => {
  const doc = example();
  assert.deepEqual(constructionAt(doc, 1500), constructionAt(doc, 2500));
  assert.notDeepEqual(cameraAt(doc, 1500), cameraAt(doc, 2500));
  assert.equal(cameraAt(doc, 2000).eye[0], 0);
  assert.deepEqual(cameraAt(doc, 5999), doc.tracks.camera.keyframes[1].pose);
  assert.deepEqual(cameraAt(doc, 6000), doc.tracks.camera.keyframes[2].pose);
  doc.tracks.camera.initialPose.yaw = 170;
  doc.tracks.camera.keyframes = [{id: 'cross', timeMs: 2000, transition: 'linear', pose: {eye:[0,0,0],yaw:-170,pitch:0}}];
  assert.equal(cameraAt(doc, 1000).yaw, 180);
  assert.equal(cameraAt(doc, 2000).yaw, -170);
  doc.tracks.camera.keyframes[0].transition = 'smoothstep';
  assert.equal(cameraAt(doc, 500).yaw, 173.125);
});

test('narration uses independent half-open intervals and supports audio and overlaps', () => {
  const doc = example();
  assert.equal(narrationAt(doc, 499).length, 1);
  assert.equal(narrationAt(doc, 500).length, 2);
  assert.equal(narrationAt(doc, 3500).length, 1);
  assert.equal(narrationAt(doc, 9000).length, 0);
  doc.assets.audio.intro = {uri: 'data:audio/wav;base64,UklGRg==', mimeType: 'audio/wav'};
  doc.tracks.narration.cues[1].audio = {assetId:'intro',offsetMs:100,volume:.5};
  validateBuildDocument(doc);
  assert.equal(narrationAt(doc, 1500)[1].audio.offsetMs, 100);
});

test('invalid references, times, geometry, lifecycle and mixed-track fields are rejected', () => {
  const cases = [
    [d => {d.version = 99;}, /unsupported/],
    [d => {d.tracks.construction.steps[0].changes[0].object.meshRef = 'missing';}, /unknown mesh/],
    [d => {d.assets.meshes.block.faces[0].v[0] = 1000;}, /vertex indices/],
    [d => {d.assets.meshes.block.faces[0].mat = 'missing';}, /unknown material/],
    [d => {d.tracks.construction.steps[0].timeMs = -1;}, /outside timeline/],
    [d => {d.tracks.construction.steps[1].timeMs = 10;}, /nondecreasing/],
    [d => {d.tracks.camera.keyframes[1].timeMs = 1000;}, /strictly increasing/],
    [d => {d.tracks.camera.keyframes[1].pose.eye[0] = Infinity;}, /finite/],
    [d => {d.tracks.narration.cues[0].endMs = 99999;}, /outside timeline/],
    [d => {d.tracks.narration.cues[0].audio = {assetId:'missing'};}, /unknown audio/],
    [d => {d.tracks.construction.steps[2].changes[0].name = 'missing';}, /missing object/],
    [d => {d.tracks.construction.steps[0].camera = {};}, /unknown field/],
    [d => {d.tracks.construction.steps[0].label = 'Mixed narration';}, /unknown field/],
    [d => {d.chapters[0].camera = {};}, /unknown field/],
    [d => {d.tracks.camera.keyframes[0].transition = 'spline';}, /unknown camera/],
    [d => {d.scene.objects = [{name:'bad',meshRef:'missing'}];}, /unknown mesh/],
    [d => {d.chapters.push({...d.chapters[0],id:'overlap'});}, /overlapping/],
    [d => {d.tracks.construction.steps[1].id = 'add';}, /duplicate id/],
    [d => {d.assets.audio.bad = {uri:'javascript:alert(1)',mimeType:'audio/wav'};}, /URI/]
  ];
  for (const [mutate, expected] of cases) {const doc=example(); mutate(doc); assert.throws(() => validateBuildDocument(doc), expected);}
});

test('example and every stored LARK mesh pass the actual engine geometry validator; alpha is preserved', () => {
  for (const doc of [example(), build]) {
    validateBuildDocument(doc);
    for (const [id, mesh] of Object.entries(doc.assets.meshes)) assert.ok(validateMesh(mesh).ok, id);
  }
  assert.equal(build.scene.palette.find(m => m.name === 'l4-glass').alpha, .1);
});

test('a recording may contain no construction, camera motion or narration', () => {
  const doc = example(); doc.tracks.construction.steps = []; doc.tracks.camera.keyframes = []; doc.tracks.narration.cues = [];
  validateBuildDocument(doc);
  assert.deepEqual(constructionAt(doc, 5000), []);
  assert.deepEqual(cameraAt(doc, 5000), doc.tracks.camera.initialPose);
  assert.deepEqual(narrationAt(doc, 5000), []);
});

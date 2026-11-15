import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,humanoidRig,merge} from '../../mcp/engine/index.js';
import {normalizeBuildDocument,animationAt,animationSkin,constructionAt,sceneAt,cameraAt} from '../../models/spider-build-v2.mjs';
import {fragmentFrame} from './motion.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const doc=normalizeBuildDocument(read('models/lark-4c-accident.build.json')),sky=read('models/deepsky.scene.json'),sequence=read('scripts/lark-4c-accident/sequence.json');
test('one native self-contained story contains the ship, pilot, independent animation and seven camera shots',()=>{
 assert.equal(doc.format,'spider-build-tutorial');assert.equal(doc.timeline.durationMs,72000);assert.equal(doc.chapters.length,7);
 assert.equal(doc.tracks.animation.channels.length,47);assert.equal(doc.scene.objects.length,562);
 const bound=doc.tracks.animation.bindings.map(b=>b.object);assert.equal(new Set(bound).size,bound.length);assert.equal(bound.length,562);
 assert.ok(bound.includes('betterman/body')&&bound.includes('betterman/hair'));
});
test('the Deep Sky hole prototype, materials and orientation are reused; only one hole and no planets are embedded',()=>{
 const env=doc.scene.environment,original=sky.objects.find(o=>o.proto==='hole'&&o.name.startsWith('Sagittarius A*'));
 assert.deepEqual(env.prototypes.hole,sky.prototypes.hole);assert.equal(env.objects.length,1);
 assert.deepEqual(env.objects[0].mats,original.mats);assert.deepEqual(env.objects[0].rot,original.rot);
 assert.equal(env.objects[0].name,original.name);assert.deepEqual(Object.keys(env.prototypes),['hole']);
 for(const mat of sky.palette.filter(m=>m.name==='bh-core'||m.name==='bh-disc'))assert.deepEqual(doc.scene.palette.find(m=>m.name===mat.name),mat);
 assert.ok(!JSON.stringify(env).includes('planet'));assert.equal(env.cloud.n,2048);
 assert.ok(env.cloud.n<sky.cloud.n);assert.equal(env.cloud.p.length,env.cloud.n*3);
 assert.ok(env.cloud.c.every(c=>sky.cloud.c.includes(c)));
});
test('the story contains no audio data, audio cues or sound track',()=>{
 assert.deepEqual(doc.assets.audio,{});assert.ok(!doc.tracks.sound);
 assert.ok(doc.tracks.narration.cues.every(c=>!c.audio));assert.equal(doc.result.silent,true);
});
test('all saved geometry is valid and Betterman retains an exact standing height of 1.80 metres',()=>{
 for(const [id,mesh]of Object.entries(doc.assets.meshes))assert.ok(validate(mesh).ok,id);
 const bind=constructionAt(doc,0).filter(o=>o.name.startsWith('betterman/')),all=merge(...bind.map(o=>o.mesh));
 const height=Math.max(...all.positions.map(p=>p[1]))-Math.min(...all.positions.map(p=>p[1]));
 assert.ok(Math.abs(height*sequence.pilot.scale-1.8)<1e-10);assert.equal(doc.scene.palette.find(m=>m.name==='l4-glass').alpha,.1);
});
test('native animation reproduces the authored fragment matrices and rebuilds exactly after reverse seek',()=>{
 for(const t of [0,12000,30000,40000,49000,60000,72000]){
  const bones=animationAt(doc,t);sequence.ship.groups.forEach((g,i)=>fragmentFrame(sequence,g,t/1000).forEach((v,n)=>assert.ok(Math.abs(v-bones[i*12+n])<.0001)));
 }
 const a=sceneAt(doc,40000);sceneAt(doc,12000);assert.deepEqual(sceneAt(doc,40000),a);
 assert.notDeepEqual(sceneAt(doc,12000)[0].mesh.positions,sceneAt(doc,40000)[0].mesh.positions);
});
test('camera/narration edits leave all motion and geometry intact, including the seated pilot',()=>{
 const edited=structuredClone(doc),before=animationAt(doc,49000);
 edited.tracks.camera.keyframes=[];edited.tracks.narration.cues=[];
 assert.deepEqual(animationAt(edited,49000),before);assert.deepEqual(sceneAt(edited,49000),sceneAt(doc,49000));
 const skin=animationSkin(doc,constructionAt(doc,0));assert.equal(skin.meshes.length,562);assert.equal(skin.weights.length,562);
 assert.ok(Number.isFinite(cameraAt(doc,49000).fov));
});

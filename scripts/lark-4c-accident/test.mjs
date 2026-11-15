import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,humanoidRig,merge,instantiate} from '../../mcp/engine/index.js';
import {normalizeBuildDocument,animationAt,animationSkin,constructionAt,sceneAt,cameraAt} from '../../models/spider-build-v2.mjs';
import {fragmentFrame,shipFrame,point,sub,add,scale,dot,cross,norm,discNormal,discHeight,debrisAcceleration,debrisState,debrisTrajectory} from './motion.mjs';
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
test('gravity uses the actual tilted native disc plane and pulls toward it from both sides',()=>{
 const hole=doc.scene.environment.objects[0],rotated=instantiate({positions:[[0,0,0],[0,1,0]],faces:[]},{at:[0,0,0],scale:1,rot:hole.rot});
 const n=discNormal(sequence);assert.ok(Math.abs(n[1]-1)>.1,'Disc was accidentally treated as horizontal');
 rotated.positions[1].forEach((v,i)=>assert.ok(Math.abs(v-n[i])<1e-12));
 const radial=scale(norm(cross(n,[1,0,0])),70),plane=add(hole.at,radial);
 assert.ok(Math.abs(discHeight(sequence,plane))<1e-10);
 assert.ok(dot(debrisAcceleration(sequence,add(plane,scale(n,30))),n)<0);
 assert.ok(dot(debrisAcceleration(sequence,add(plane,scale(n,-30))),n)>0);
 assert.ok(Math.abs(dot(debrisAcceleration(sequence,plane),n))<1e-10);
 const near=Math.hypot(...debrisAcceleration(sequence,add(hole.at,scale(norm(radial),400))));
 const far=Math.hypot(...debrisAcceleration(sequence,add(hole.at,scale(norm(radial),800))));
 assert.ok(Math.abs(near/far-4)<.02,'Central gravity does not approach inverse-square falloff');
});
test('release preserves position and momentum, then falling parts gain normal speed under gravity',()=>{
 const g=sequence.ship.groups.find(g=>g.id==='port-wing'),release=point(shipFrame(sequence,g.release),g.pivot);
 const s=debrisState(sequence,g,g.release),later=debrisState(sequence,g,g.release+2),n=discNormal(sequence);
 assert.deepEqual(s.position,release);
 const before=point(shipFrame(sequence,g.release-.05),g.pivot),expected=add(scale(sub(release,before),20),g.velocity);
 s.velocity.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
 assert.ok(dot(later.velocity,n)>dot(s.velocity,n)+1,'Debris drifts at a fixed speed instead of accelerating');
 assert.ok(Math.abs(discHeight(sequence,later.position))<Math.abs(discHeight(sequence,s.position)));
 const next=point(fragmentFrame(sequence,g,g.release+1e-7),g.pivot);
 assert.ok(Math.hypot(...sub(next,release))<1e-4,'Separation teleported the fragment');
});
test('surviving fragments settle into the accretion-disc plane and continue orbiting',()=>{
 const groups=sequence.ship.groups.filter(g=>g.release!==null),live=groups.filter(g=>!debrisState(sequence,g,66).captured);
 assert.ok(live.length>=10,'Too little debris remains to show the disc convergence');
 for(const g of live){
  const s=debrisState(sequence,g,66),last=debrisState(sequence,g,72);
  assert.ok(Math.abs(discHeight(sequence,s.position))<1,`${g.id} has not reached the disc plane`);
  assert.ok(Math.abs(discHeight(sequence,last.position))<.1,`${g.id} drifted away from the plane again`);
  if(!last.captured)assert.ok(Math.hypot(...sub(s.position,last.position))>1,`${g.id} froze in the disc`);
 }
});
test('fixed-step integration converges and seek order cannot alter a debris trajectory',()=>{
 const g=sequence.ship.groups.find(g=>g.id==='port-wing'),a=debrisState(sequence,g,60);
 debrisState(sequence,g,35);debrisState(sequence,g,72);assert.deepEqual(debrisState(sequence,g,60),a);
 const fine=structuredClone(sequence);fine.blackHole.debrisDynamics.stepSeconds/=2;
 const b=debrisState(fine,fine.ship.groups.find(q=>q.id===g.id),60);
 assert.ok(Math.hypot(...sub(a.position,b.position))<.02,'Halving the physics step changed the path by more than 2 cm');
});
test('captured fragments are removed at the native black-hole shadow and never reappear',()=>{
 assert.ok(doc.result.debrisDynamics.capturedGroups>0);
 for(const capture of doc.result.debrisDynamics.captures){
  const group=sequence.ship.groups.find(g=>g.id===capture.group),trajectory=debrisTrajectory(sequence,group),p=trajectory.samples.at(-1).position;
  assert.ok(Math.abs(Math.hypot(...sub(p,sequence.blackHole.center))-sequence.blackHole.radius*sequence.blackHole.debrisDynamics.innerShadowFactor)<1e-6);
  const before=new Set(constructionAt(doc,capture.timeMs-1).map(o=>o.name)),after=new Set(constructionAt(doc,capture.timeMs).map(o=>o.name));
  assert.ok(group.objects.every(name=>before.has(name)));assert.ok(group.objects.every(name=>!after.has(name)));
  if(group.id==='cockpit'){assert.ok(before.has('betterman/body'));assert.ok(!after.has('betterman/body'));}
 }
});

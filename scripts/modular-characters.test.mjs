import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { merge, instantiate, validate, faceNormal } from '../mcp/engine/index.js';
import { buildLibrary, buildPack, expandedObjects } from './build-modular-characters.mjs';
import { characterScene, selectionOf, inspectionScene, PART_SLOTS, COLOR_SLOTS } from '../models/modular-characters/compose.mjs';

const root=new URL('../models/modular-characters/',import.meta.url);
const library=JSON.parse(readFileSync(new URL('library.json',root)));
const extent=(mesh,axis)=>[
  Math.min(...mesh.positions.map(p=>p[axis])),
  Math.max(...mesh.positions.map(p=>p[axis])),
];
const meshOf=(prefix)=>library.prototypes[prefix].lods[0];

test('all supplied modules have valid convex faces and low geometric complexity',()=>{
  assert.deepEqual(library,buildLibrary(),'Saved module library is stale');
  for (const [id,prototype] of Object.entries(library.prototypes)) {
    const mesh=prototype.lods[0],result=validate(mesh);
    assert(result.ok,`${id}: ${result.notes.join('; ')}`);
    const triangles=mesh.faces.reduce((n,f)=>n+f.v.length-2,0);
    assert.equal(triangles,library.modules[id].triangles);
    assert(triangles<200,`${id}: unnecessarily dense module`);
    if (!/^(face|hair|accessory|top)\//.test(id)) assert(result.closed,`${id}: structural module must be closed`);
  }
});

test('heads are box extrusions with real jaw silhouette changes',()=>{
  for (const option of library.options.head.filter(o=>!o.id.startsWith('robot-'))) {
    const mesh=meshOf(`head/${option.id}`);
    assert(mesh.positions.length<=32,option.id);
    const front=mesh.faces.find(f=>f.v.length>=4&&f.v.every(i=>Math.abs(mesh.positions[i][2]-library.headFront)<1e-8));
    assert(front,`${option.id}: missing flat face`);
    assert(front.v.length<=6);
  }
  const block=meshOf('head/block'),jaw=meshOf('head/cut-jaw');
  const frontOf=m=>m.positions.filter(p=>Math.abs(p[2]-library.headFront)<1e-8);
  assert.equal(frontOf(block).length,4);
  assert.equal(frontOf(jaw).length,6);
  const chin=frontOf(jaw).filter(p=>p[1]<1.6),brow=frontOf(jaw).filter(p=>p[1]>1.8);
  assert(Math.max(...chin.map(p=>Math.abs(p[0])))<Math.min(...brow.map(p=>Math.abs(p[0]))),'Jaw is not actually cut in');
});

test('eye, eyebrow, nose and mouth marks are outward planar sheets just above the head',()=>{
  for (const [id,prototype] of Object.entries(library.prototypes).filter(([id])=>id.startsWith('face/'))) {
    const mesh=prototype.lods[0];
    for (const p of mesh.positions) {
      assert(p[2]>=library.headFront+.0019&&p[2]<=library.headFront+.0031,`${id}: face mark is buried or floating too far away`);
    }
    for (const f of mesh.faces) {
      const points=f.v.map(i=>mesh.positions[i]);
      assert(points.every(p=>p[2]===points[0][2]),`${id}: sculpted face mark`);
      assert(faceNormal(points)[2]>0,`${id}: face mark faces inward`);
    }
  }
});

test('body-specific clothes and shoes meet at shared modular seams',()=>{
  for (const body of library.options.body) {
    for (const top of library.options.top) for (const bottom of library.options.bottom) {
      const a=extent(meshOf(`top/${body.id}/${top.id}`),1),b=extent(meshOf(`bottom/${body.id}/${bottom.id}`),1);
      assert(a[0]<b[1]&&a[1]>b[1],`${body.id}/${top.id}/${bottom.id}: gap at waist`);
    }
    for (const bottom of library.options.bottom) for (const shoes of library.options.shoes) {
      const leg=extent(meshOf(`bottom/${body.id}/${bottom.id}`),1),foot=extent(meshOf(`shoes/${body.id}/${shoes.id}`),1);
      assert(foot[1]>leg[0],`${body.id}: ankle gap`);
      assert.equal(foot[0],0);
    }
  }
  for (const head of library.options.head) for (const body of library.options.body) {
    assert(extent(meshOf(`body/${body.id}`),1)[1]>extent(meshOf(`head/${head.id}`),1)[0],'Gap at neck');
  }
});

test('women have shaped body geometry and remain freely modular across working roles',()=>{
  const women=library.examples.filter(e=>e.presentation==='woman');
  assert(women.length>0);
  for (const body of ['slender','curved']) {
    const torso=meshOf(`top/${body}/tee`);
    const widthAt=y=>{
      const xs=torso.positions.filter(p=>Math.abs(p[1]-y)<1e-8).map(p=>p[0]);
      return Math.max(...xs)-Math.min(...xs);
    };
    assert(widthAt(1.14)<widthAt(1.025),'Waist must be narrower than hips');
    assert(widthAt(1.14)<widthAt(1.34),'Torso contour must be actual geometry');
    for (const top of library.options.top) for (const bottom of library.options.bottom) for (const shoes of library.options.shoes) {
      const scene=characterScene(library,{body,top:top.id,bottom:bottom.id,shoes:shoes.id,head:'soft-jaw'});
      assert(validate(merge(...expandedObjects(scene).map(o=>o.mesh))).ok,`${body}/${top.id}/${bottom.id}/${shoes.id}`);
    }
  }
  const pack=buildPack(),saved=JSON.parse(readFileSync(new URL('women.scene.json',root)));
  assert.deepEqual(saved,pack.women);
  assert.deepEqual(saved.metadata.designs,women.map(e=>({id:e.id,spec:e.spec})));
  assert.equal(saved.metadata.modularCharacter,undefined,'A group must not claim to be a single character');
  for (const example of women) {
    const objects=saved.objects.filter(o=>o.name.startsWith(`${example.id}/`));
    assert.equal(objects.length,characterScene(library,example.spec).objects.length);
    assert(objects.some(o=>o.proto===`top/${example.spec.body}/${example.spec.top}`));
  }
  assert(saved.objects.some(o=>o.name.startsWith('betterman-reference/')));
});

test('every selectable shape and colour composes without changing the source prototypes',()=>{
  const before=JSON.stringify(library.prototypes),materials=new Set(library.palette.map(m=>m.name));
  for (const field of [...PART_SLOTS,...COLOR_SLOTS]) for (const option of library.options[field]) {
    const scene=characterScene(library,{[field]:option.id});
    const objects=expandedObjects(scene),mesh=merge(...objects.map(o=>o.mesh));
    assert(validate(mesh).ok,`${field}/${option.id}`);
    const height=extent(mesh,1);
    assert.equal(height[0],0);assert(height[1]>=1.91&&height[1]<2.05);
    for (const face of mesh.faces) assert(materials.has(face.mat),`${field}/${option.id}: unresolved ${face.mat}`);
    for (const object of scene.objects) {
      const slot=object.name.split('/')[1];
      assert.equal(library.modules[object.proto].slot,slot);
      if (['top','bottom','shoes','body'].includes(slot)) assert(object.proto.split('/')[1]===scene.metadata.modularCharacter.spec.body);
    }
  }
  assert.equal(JSON.stringify(library.prototypes),before);
  assert.throws(()=>selectionOf(library,{head:'unknown'}),/Unknown head/);
  assert.throws(()=>selectionOf(library,{unexpected:1}),/Unknown selection field/);
  assert.throws(()=>characterScene(library,{}, {scale:0}),/positive uniform scale/);
  assert.throws(()=>characterScene(library,{}, {at:[NaN,0,0]}),/finite XYZ/);
});

test('thin and fat builds change torso depth, belly and limbs without changing height',()=>{
  const thin=meshOf('top/thin/tee'),fat=meshOf('top/fat/tee');
  const widthAt=(mesh,y)=>{
    const xs=mesh.positions.filter(p=>Math.abs(p[1]-y)<1e-8).map(p=>p[0]);
    return Math.max(...xs)-Math.min(...xs);
  };
  assert(widthAt(fat,1.14)>widthAt(thin,1.14)*2);
  assert(widthAt(fat,1.14)>widthAt(fat,1.40),'Full build needs an actual belly contour');
  assert(extent(fat,2)[1]-extent(fat,2)[0]>(extent(thin,2)[1]-extent(thin,2)[0])*1.7);
  const legWidth=body=>{
    const xs=meshOf(`bottom/${body}/straight`).positions.filter(p=>Math.abs(p[1]-.56)<1e-8&&p[0]>0).map(p=>p[0]);
    return Math.max(...xs)-Math.min(...xs);
  };
  assert(legWidth('fat')>legWidth('thin')*1.5);
  for (const body of ['thin','fat']) {
    const torso=meshOf(`top/${body}/tee`);
    const badge=torso.faces.find(f=>f.mat==='accent');
    const front=torso.positions.find(p=>p[1]===1.14&&p[2]>0)[2];
    assert(badge.v.every(i=>torso.positions[i][2]>front),'Badge must follow the changed torso depth');
  }
  for (const suffix of ['technician','resident']) {
    const a=library.examples.find(e=>e.id===`thin-${suffix}`),b=library.examples.find(e=>e.id===`fat-${suffix}`);
    assert.deepEqual({...a.spec,body:b.spec.body},b.spec,'Comparison pairs must differ only in body geometry');
    const heights=[a,b].map(e=>extent(merge(...expandedObjects(characterScene(library,e.spec)).map(o=>o.mesh)),1));
    assert.deepEqual(heights[0],heights[1]);
  }
  const pack=buildPack();
  assert.deepEqual(JSON.parse(readFileSync(new URL('bodies.scene.json',root))),pack.bodies);
});

test('robot presets use mechanical geometry, interchangeable frames and shell-controlled indicators',()=>{
  const robots=library.examples.filter(e=>e.kind==='robot'),positions=new Set();
  assert(robots.length>0);
  for (const example of robots) {
    const scene=characterScene(library,example.spec),mesh=merge(...expandedObjects(scene).map(o=>o.mesh));
    assert(validate(mesh).ok,example.id);
    positions.add(JSON.stringify(mesh.positions));
    assert(mesh.faces.every(f=>!/^mc-(skin|hair)/.test(f.mat)),`${example.id}: human skin or hair leaked into the chassis`);
    const signal=scene.objects[0].mats.signal;
    assert(mesh.faces.some(f=>f.mat===signal),'Missing sensor indicators');
    assert(library.palette.find(m=>m.name===signal).emit>0);
    const recoloured=characterScene(library,{...example.spec,skin:'mc-skin-7'});
    assert.deepEqual(expandedObjects(scene),expandedObjects(recoloured),'Skin colour must not recolour metal');
    for (const body of library.options.body.filter(o=>o.id.startsWith('robot-'))) {
      const swapped=characterScene(library,{...example.spec,body:body.id});
      assert(validate(merge(...expandedObjects(swapped).map(o=>o.mesh))).ok);
      for (const slot of ['body','top','bottom','shoes'])
        assert(swapped.objects.some(o=>o.name===`character/${slot}`&&o.proto.split('/')[1]===body.id));
    }
  }
  assert.equal(positions.size,robots.length,'Robot series must not be palette-only clones');
  const pack=buildPack(),saved=JSON.parse(readFileSync(new URL('robots.scene.json',root)));
  assert.deepEqual(saved,pack.robots);
  assert.deepEqual(saved.metadata.designs.map(e=>e.id),robots.map(e=>e.id));
  assert.deepEqual(Object.keys(saved.prototypes).sort(),[...new Set(saved.objects.filter(o=>o.proto).map(o=>o.proto))].sort());
});

test('colour swaps preserve meshes while remapping skin independently from clothing',()=>{
  const a=characterScene(library),b=characterScene(library,{skin:'mc-skin-7'});
  assert.deepEqual(a.prototypes,b.prototypes);
  a.objects.forEach((o,i)=>{
    assert.equal(o.proto,b.objects[i].proto);
    assert.equal(b.objects[i].mats.skin,'mc-skin-7');
    assert.equal(o.mats.top,b.objects[i].mats.top);
    assert.deepEqual(instantiate(a.prototypes[o.proto].lods[0],o).positions,
      instantiate(b.prototypes[o.proto].lods[0],b.objects[i]).positions);
  });
});

test('saved designs preserve separate slots, scale and a small triangle budget',()=>{
  for (const example of library.examples) {
    const scene=JSON.parse(readFileSync(new URL(`${example.id}.scene.json`,root)));
    const generated=characterScene(library,example.spec);
    assert.deepEqual(scene.objects,generated.objects,example.id);
    assert.deepEqual(scene.prototypes,generated.prototypes);
    assert(scene.metadata.modularCharacter.triangles<800,example.id);
    assert.equal(scene.view.smooth,false);
    assert(Math.abs(scene.metadata.modularCharacter.referenceHeight-1.9115263677209686)<1e-10);
  }
});

test('face and exploded inspections keep the chosen geometry and apply placement correctly',()=>{
  const base=characterScene(library,{}, {at:[4,2,-1],yaw:Math.PI/2,scale:2});
  const face=inspectionScene(library,base,'face');
  assert(face.objects.every(o=>['head','face','hair','accessory'].includes(o.name.split('/')[1])));
  assert(Math.abs(face.view.cam.center[1]-(2+2*1.77))<1e-10);
  const parts=inspectionScene(library,base,'parts');
  assert.deepEqual(parts.prototypes,base.prototypes);
  const original=base.objects.find(o=>o.name==='character/face'),moved=parts.objects.find(o=>o.name===original.name);
  assert(Math.abs(moved.at[0]-original.at[0]-1.1)<1e-10);
  assert(Math.abs(moved.at[1]-original.at[1]-.8)<1e-10);
  assert.throws(()=>inspectionScene(library,base,'unknown'),/Unknown inspection view/);
});

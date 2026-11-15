import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exportBuild} from './export-build.mjs';
import {merge,validate,instantiate,bounds,renderView,orbit} from '../../mcp/engine/index.js';
const root=new URL('../../',import.meta.url),journalPath=new URL('models/lark-4-tutorial.json',root),j=JSON.parse(readFileSync(journalPath,'utf8'));
const map=new Map;for(const event of j.events){if(event.after)map.set(event.name,event.after);else if(event.method==='remove')map.delete(event.name)}
const objects=[...map.values()];
const live=JSON.parse(readFileSync(new URL('models/lark-4-live-verification.json',root),'utf8')).objects;
if(live.length!==objects.length)throw Error('Live construction and replay have different object counts');
let maxError=0;for(const object of objects){const actual=live.find(o=>o.name===object.name);if(!actual)throw Error(`Live object missing: ${object.name}`);if(JSON.stringify(actual.mesh.faces.map(f=>f.v))!==JSON.stringify(object.mesh.faces.map(f=>f.v)))throw Error(`Topology mismatch: ${object.name}`);object.mesh.positions.forEach((p,i)=>p.forEach((x,k)=>maxError=Math.max(maxError,Math.abs(x-actual.mesh.positions[i][k]))));const v=validate(object.mesh);if(!v.ok)throw Error(`${object.name}: ${v.notes}`)}
if(maxError>1e-8)throw Error(`Replay differs from live geometry by ${maxError}`);
const extended=j.chapters.some(c=>c.id>=15);
const prefixes=['shell/roof/','shell/port/','shell/canopy/port','exterior/armour-port/','exterior/identity/port','exterior/communications/','exterior/nav-light','propulsion/rcs--1-',...(extended?['extension/shell/crew-roof/','extension/shell/crew-port/','extension/shell/hangar-roof/','extension/shell/hangar-port/','extension/interior/cutaway-partition/','extension/interior/wetroom-crosswall','extension/propulsion/cruise--1/','extension/propulsion/aft-rcs--1/']:[])];
const inside=objects.filter(o=>!prefixes.some(p=>o.name.startsWith(p)));
const fingerprint=os=>createHash('sha256').update(JSON.stringify(os.map(o=>({name:o.name,positions:o.mesh.positions.map(p=>p.map(x=>Math.round(x*1e8)/1e8)),faces:o.mesh.faces.map(f=>f.v)})))).digest('hex');
// Repeated components share geometry in the native scene. The tutorial keeps
// each original command's resulting mesh for exact, viewport-independent replay.
function pack(os){const groups=new Map;for(const o of os){const c=bounds(o.mesh).center,mesh={positions:o.mesh.positions.map(p=>p.map((x,i)=>Math.round((x-c[i])*1e8)/1e8)),faces:o.mesh.faces};const key=JSON.stringify(mesh);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({o,c,mesh})}const prototypes={},out=[];let count=0;for(const group of groups.values()){if(group.length<2){out.push(group[0].o);continue}const id=`shared-part-${String(++count).padStart(3,'0')}`;prototypes[id]={lods:[group[0].mesh]};for(const {o,c}of group)out.push({name:o.name,proto:id,at:c,scale:1})}return{prototypes,objects:out}}
const all=merge(...objects.map(o=>o.mesh)),p=all.positions,min=[0,1,2].map(i=>Math.min(...p.map(q=>q[i]))),max=[0,1,2].map(i=>Math.max(...p.map(q=>q[i]))),size=max.map((v,i)=>v-min[i]);
const bb=bounds(all);
const main={format:'3draft-scene',version:2,name:extended?'LARK–4C — crew and cargo lander':'LARK–4 — four-person lander',palette:j.palette,...pack(objects),view:{render:'webgpu',edges:false,light:true,glow:false,smooth:true,studio:true,cam:{center:extended?bb.center:[.45,2.45,.1],radius:extended?bb.radius*.93:5.25,yaw:-.65,pitch:.31}}};
const cutaway={...main,name:extended?'LARK–4C — cargo and quarters cutaway':'LARK–4 — cabin cutaway',...pack(inside),view:{...main.view,cam:{...main.view.cam,yaw:.65,pitch:.48}}};
for(const s of [main,cutaway])for(const o of s.objects){const m=o.proto?instantiate(s.prototypes[o.proto].lods[0],o):o.mesh;if(!validate(m).ok)throw Error(`Invalid packed object: ${o.name}`)}
writeFileSync(new URL('models/lark-4.scene.json',root),JSON.stringify(main));
writeFileSync(new URL('models/lark-4-cutaway.scene.json',root),JSON.stringify(cutaway));
j.cutawayPrefixes=prefixes;j.finishedAt=new Date().toISOString();j.final={objects:objects.length,chapters:j.chapters.length,operations:j.events.length,bounds:{min,max,size},geometrySha256:fingerprint(objects),liveReplayMaximumError:maxError,crew:4,units:'metres',glassAlpha:.1};
if(extended){
 j.title="LARK–4C — crew and cargo lander";j.shortTitle='LARK–4C';
 const eye=[-30,28,27],target=[0,3.8,-7],d=target.map((v,i)=>v-eye[i]);
 j.cutawayCamera={eye,target,yaw:Math.atan2(d[0],-d[2])*180/Math.PI,pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI};
 j.final.variant='LARK–4C';j.final.hangar={clearWidth:5.5,clearLength:7.1,heightUnderCrane:3.8,doorWidth:4.64,rampWidth:4.5};j.final.rooms=['cockpit','four-berth quarters','galley','washroom/shower','cargo workshop hangar'];
 const crate=objects.find(o=>o.name==='hangar/cargo/crate');if(!crate)throw Error('Cargo operation has no final crate');
 const cb=bounds(crate.mesh);if(Math.abs(cb.center[0]+2.1)>1e-8||Math.abs(cb.center[1]-2.02)>1e-8||Math.abs(cb.center[2]+11.7)>1e-8)throw Error('Cargo operation ended in the wrong location');
}
const seats=j.chapters.find(c=>c.id===3);seats.text=seats.text.replace('45 cm','55 cm');
writeFileSync(journalPath,JSON.stringify(j));
exportBuild(j);
const materials=Object.fromEntries(j.palette.map(({name,...m})=>[name,m])),opts={points:false,size:1400,palette:materials,stroke:'#15232a28',background:'#dbe3df'};
writeFileSync('/tmp/lark-4-final-exterior.svg',renderView(all,orbit({yaw:-.65,pitch:.30}),opts));
writeFileSync('/tmp/lark-4-final-interior.svg',renderView(merge(...inside.map(o=>o.mesh)),orbit({yaw:.65,pitch:.50}),opts));
if(extended){
 const hangar=inside.filter(o=>o.name.startsWith('hangar/')||o.name.startsWith('extension/structure/hangar-')||o.name==='extension/interior/hangar-floor'||o.name.startsWith('extension/shell/hangar-'));
 const quarters=inside.filter(o=>o.name.startsWith('extension/interior/')||o.name.startsWith('interior/oxygen-')||o.name.startsWith('extension/shell/crew-')).filter(o=>o.name!=='extension/interior/hangar-floor');
 writeFileSync('/tmp/lark-4-hangar-view.svg',renderView(merge(...hangar.map(o=>o.mesh)),orbit({yaw:.60,pitch:.52}),opts));
 writeFileSync('/tmp/lark-4-quarters-view.svg',renderView(merge(...quarters.map(o=>o.mesh)),orbit({yaw:.75,pitch:.68}),opts));
}
writeFileSync(new URL('models/lark-4-verification.json',root),JSON.stringify({...j.final,nativePrototypes:Object.keys(main.prototypes).length,nativeInstances:main.objects.filter(o=>o.proto).length,cutawayObjects:inside.length},null,2));
console.log(JSON.stringify({...j.final,nativePrototypes:Object.keys(main.prototypes).length,nativeInstances:main.objects.filter(o=>o.proto).length,cutawayObjects:inside.length},null,2));

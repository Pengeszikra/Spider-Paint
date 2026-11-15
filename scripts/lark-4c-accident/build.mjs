// Author the silent accident as a native Spider Build v2 story; no standalone player.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {instantiate,humanoidRig,boneMatrices,box} from '../../mcp/engine/index.js';
import {validateBuildDocument,sceneAt} from '../../models/spider-build-v2.mjs';
import {matrix,compose,fragmentFrame,cameraAt,pilotPose,sub,norm,add,scale,debrisTrajectory,discNormal} from './motion.mjs';
const root=new URL('../../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const sequence=read('scripts/lark-4c-accident/sequence.json');
const shipSource=read('models/lark-4.scene.json'),pilotSource=read('models/betterman.scene.json'),sky=read('models/deepsky.scene.json');
const journal=read('models/lark-4-tutorial.json'),names=new Set(sequence.ship.groups.flatMap(g=>g.objects));
const ship=shipSource.objects.filter(o=>names.has(o.name)).map(o=>({name:o.name,mesh:o.mesh??instantiate(shipSource.prototypes[o.proto].lods[0],o)}));
if(ship.length!==names.size)throw Error('The source ship no longer matches the recorded fragment names.');
for(const o of ship.filter(o=>/gate\/leaf|access\/pressure-door/.test(o.name))){const first=journal.events.find(e=>e.name===o.name&&e.after);if(first)o.mesh=first.after.mesh;}
const pilot=pilotSource.objects.map(o=>({name:'betterman/'+o.name,mesh:{...o.mesh,faces:o.mesh.faces.map(f=>({...f,mat:f.mat?'betterman-'+f.mat:undefined}))}}));
const palette=[...shipSource.palette,...pilotSource.palette.map(m=>({...m,name:'betterman-'+m.name})),...sky.palette.filter(m=>m.name==='bh-core'||m.name==='bh-disc')];
palette.push({name:'engine-plume',color:'#3b85e3',alpha:.3,emit:1.6,metal:0,rough:1});
palette.push({name:'emergency-red',color:'#ff1208',alpha:1,emit:3,metal:0,rough:.55});
// Existing roof strips and four console/wall lamps emit actual pulsing red local light.
const roofLamps=ship.filter(o=>o.name.startsWith('shell/roof/interior-light-')&&!o.name.includes('housing'));
for(const o of roofLamps)o.mesh={...o.mesh,faces:o.mesh.faces.map(f=>({...f,mat:'emergency-red',color:'#ff1208'}))};
const cabinLamps=[[-1.48,3.1,1.05],[-.4,2.55,1.45],[1.48,3.1,1.05],[.4,2.55,1.45]].map((at,i)=>{const mesh=box({at,size:[.08,.14,.65],color:'#ff1208'});mesh.faces.forEach(f=>f.mat='emergency-red');return{name:`effects/cabin-alarm-${i}`,mesh};});
const effects=[-1,1].map(side=>{
 const at=[side*4.65,3.6,-14.9],positions=[add(at,[0,0,-8]),at],faces=[];
 for(let i=0;i<20;i++){const a=i/20*Math.PI*2;positions.push(add(at,[Math.cos(a)*.65,Math.sin(a)*.65,0]));}
 for(let i=0;i<20;i++){const a=2+i,b=2+(i+1)%20;faces.push({v:[0,b,a],mat:'engine-plume'},{v:[1,a,b],mat:'engine-plume'});}
 return{name:side<0?'effects/port-plume':'effects/starboard-plume',at,group:side<0?'port-engine':'starboard-engine',mesh:{positions,faces}};
});
// Keep the native Deep Sky black-hole prototype, material mapping and orientation.
// Only its placement and scale change to the local metre frame of the lander sequence.
const sourceHole=sky.objects.find(o=>o.proto==='hole'&&o.name.startsWith('Sagittarius A*'));
const hole={...sourceHole,at:sequence.blackHole.center,scale:8,glow:136};
Object.assign(sequence.blackHole,{center:hole.at,radius:hole.scale,rot:hole.rot});
// The background is a compact sample of the actual Deep Sky Milky Way cloud behind the hole.
// Project the selected directions onto a distant backdrop: no nearby planets or other holes.
const candidates=[];
for(let i=0;i<sky.cloud.n;i++){
 const p=[0,1,2].map(k=>sky.cloud.p[i*3+k]*sky.cloud.unit-sourceHole.at[k]),d=Math.hypot(...p);
 if(d>100&&p[2]/d>.18)candidates.push({i,p,d});
}
const cloud={unit:.01,n:0,p:[],r:[],c:[],l:[]},count=Math.min(2048,candidates.length);
for(let k=0;k<count;k++){
 const {i,p,d}=candidates[Math.floor(k*candidates.length/count)],at=add(hole.at,scale(norm(p),4000));
 cloud.p.push(...at.map(v=>Math.round(v/cloud.unit)));cloud.r.push(+Math.min(20,sky.cloud.r[i]*4000/d).toFixed(5));cloud.c.push(sky.cloud.c[i]);cloud.l.push(sky.cloud.l[i]);cloud.n++;
}
const environment={format:'3draft-scene',version:2,name:'Deep Sky — Sagittarius A* and background',prototypes:{hole:sky.prototypes.hole},objects:[hole],cloud,vehicle:null,
 view:{edges:false,light:true,glow:true,smooth:true,studio:false,material:Object.fromEntries(['ambient','diffuse','specular','shininess'].map(k=>[k,sequence.lighting[k]]))}};
const meshes={},objects=[];
for(const [i,o] of [...ship,...pilot,...effects,...cabinLamps].entries()){const id=`mesh-${i}`;meshes[id]=o.mesh;objects.push({name:o.name,meshRef:id});}
const rig=humanoidRig(pilot.map(o=>o.mesh)),channels=sequence.ship.groups.map(g=>({id:g.id,matrices:[]}));
const pilotStart=channels.length;rig.joints.forEach(j=>channels.push({id:'betterman/'+j.name,matrices:[]}));
const effectStart=channels.length;effects.forEach(e=>channels.push({id:e.name,matrices:[]}));
const alarmStart=channels.length;for(const id of ['alarm/cabin','alarm/roof'])channels.push({id,matrices:[],emission:[]});
const bindings=sequence.ship.groups.flatMap(g=>g.objects.map(object=>({object,channel:g.id})));
pilot.forEach((o,i)=>bindings.push({object:o.name,weights:rig.skin[i].map(w=>{const strongest=[...w].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=strongest.reduce((s,p)=>s+p[1],0);return strongest.map(([j,v])=>['betterman/'+rig.joints[j].name,+(v/sum).toFixed(8)]);})}));
effects.forEach(e=>bindings.push({object:e.name,channel:e.name}));
cabinLamps.forEach(e=>bindings.push({object:e.name,channel:'alarm/cabin'}));
for(const o of roofLamps)bindings.find(b=>b.object===o.name).channel='alarm/roof';
const timesMs=[],round=m=>m.map(v=>+v.toFixed(7)),cockpit=sequence.ship.groups.find(g=>g.id==='cockpit');
const placement=matrix(sequence.pilot.seat,[0,0,0],rig.joints[0].at,sequence.pilot.scale);
// Solve every capture before setting the ending; never remove a survivor merely to finish on time.
const captures=sequence.ship.groups.filter(g=>g.release!==null).map(g=>({group:g,time:debrisTrajectory(sequence,g).captureTime}));
if(captures.some(c=>c.time===null))throw Error('Some fragments escape the simulation limit; extend it or adjust the physical inflow.');
const durationMs=Math.ceil(Math.max(...captures.map(c=>c.time))*10)*100;
sequence.metadata.duration=durationMs/1000;
sequence.tracks.camera.shots.at(-1).end=durationMs/1000;
Object.assign(sequence.tracks.narration.cues.at(-1),{start:durationMs/1000-3,end:durationMs/1000});
for(let ms=0;ms<=durationMs;ms+=100){
 const t=ms/1000;timesMs.push(ms);
 sequence.ship.groups.forEach((g,i)=>channels[i].matrices.push(round(fragmentFrame(sequence,g,t))));
 const world=compose(fragmentFrame(sequence,cockpit,t),placement),bones=boneMatrices(rig,pilotPose(t));
 rig.joints.forEach((j,i)=>channels[pilotStart+i].matrices.push(round(compose(world,Array.from(bones.subarray(i*12,i*12+12))))));
 effects.forEach((e,i)=>{
  const smooth=x=>(x=Math.max(0,Math.min(1,x)))*x*(3-2*x);
  const burn=(.32+.95*smooth((t-16)/4))*(1-smooth((t-31)/4))*(1+.08*Math.sin(t*45));
  const frame=fragmentFrame(sequence,sequence.ship.groups.find(g=>g.id===e.group),t);
  channels[effectStart+i].matrices.push(round(compose(frame,matrix(e.at,[0,0,0],e.at,Math.max(.00001,burn)))));
 });
 for(let i=0;i<2;i++){
  const group=i===0?cockpit:sequence.ship.groups.find(g=>g.id==='cockpit-roof'),lamp=channels[alarmStart+i];
  lamp.matrices.push(round(fragmentFrame(sequence,group,t)));
  const wave=(.5+.5*Math.cos(t*Math.PI*2/sequence.lighting.pulsePeriod))**3;
  lamp.emission.push(+(sequence.lighting.pulseMin+(sequence.lighting.pulseMax-sequence.lighting.pulseMin)*wave).toFixed(6));
 }
}
const keyframes=[];
for(let ms=0;ms<=durationMs;ms+=25){
 const c=cameraAt(sequence,ms/1000),d=sub(c.target,c.eye),pose={eye:round(c.eye),yaw:+(Math.atan2(d[0],-d[2])*180/Math.PI).toFixed(7),pitch:+(-Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI).toFixed(7),roll:+(c.roll*180/Math.PI).toFixed(7),fov:+c.fov.toFixed(7)};
 keyframes.push({id:`camera-${ms}`,timeMs:ms,transition:sequence.tracks.camera.shots.some(s=>s.start*1000===ms)?'cut':'linear',pose});
}
const removals=[{id:'plume-shutdown',timeMs:35000,names:effects.map(e=>e.name)},...captures.map(c=>({id:`capture-${c.group.id}`,timeMs:Math.ceil(c.time*1000),names:[...c.group.objects,...effects.filter(e=>e.group===c.group.id).map(e=>e.name),...(c.group.id==='cockpit'?[...pilot,...cabinLamps].map(o=>o.name):[])]}))].sort((a,b)=>a.timeMs-b.timeMs);
const present=new Set(objects.map(o=>o.name)),steps=[];
for(const event of removals){
 const removed=event.names.filter(name=>present.delete(name));if(!removed.length)continue;
 steps.push({id:event.id,timeMs:event.timeMs,command:{tool:'story_remove',args:{names:removed}},changes:removed.map(name=>({type:'remove',name}))});
}
const doc={$schema:'./spider-build-v2.schema.json',format:'spider-build-tutorial',version:2,
 metadata:{id:'lark-4c-accident',title:'LARK–4C / LAST LIGHT',shortTitle:'LAST LIGHT',language:'en',units:'metres'},
 timeline:{timeUnit:'ms',durationMs},assets:{meshes,audio:{}},scene:{palette,objects,environment},
 chapters:sequence.tracks.camera.shots.map(s=>({id:s.id,title:s.title,startMs:s.start*1000,endMs:s.end*1000})),
 tracks:{construction:{steps},animation:{timesMs,channels,bindings},camera:{initialPose:keyframes[0].pose,keyframes,presets:{}},narration:{cues:sequence.tracks.narration.cues.map((c,i)=>({id:`caption-${i}`,startMs:c.start*1000,endMs:c.end*1000,channel:'operation',language:'en',text:(c.speaker?c.speaker+': ':'')+c.text}))}},
 result:{pilot:'Betterman',pilotStandingHeight:1.8,shipObjects:ship.length,fragments:sequence.ship.groups.length,shots:7,silent:true,
 environmentSource:'models/deepsky.scene.json',blackHoleSource:sourceHole.name,blackHoles:1,backgroundPoints:cloud.n,planets:0,
 lighting:{...sequence.lighting,glow:true,studio:false,redLamps:roofLamps.length+cabinLamps.length},allFragmentsCaptured:true,
 debrisDynamics:{...sequence.blackHole.debrisDynamics,planeNormal:discNormal(sequence),capturedGroups:captures.length,captures:captures.map(c=>({group:c.group.id,timeMs:Math.ceil(c.time*1000)}))},
 sourceShipSha256:createHash('sha256').update(JSON.stringify(shipSource)).digest('hex')}};
validateBuildDocument(doc);
writeFileSync(new URL('models/lark-4c-accident.build.json',root),JSON.stringify(doc));
const snapshot={...environment,name:doc.metadata.title,palette,objects:[...environment.objects,...sceneAt(doc,0)]};
writeFileSync(new URL('models/lark-4c-accident.scene.json',root),JSON.stringify(snapshot));
console.log(JSON.stringify({story:'models/lark-4c-accident.build.json',bytes:JSON.stringify(doc).length,channels:channels.length,frames:timesMs.length,backgroundPoints:cloud.n,blackHoles:1,planets:0,audio:0}));

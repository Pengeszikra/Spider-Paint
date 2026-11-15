// Pure timeline sampling: every frame can be reconstructed directly from its time.
export const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b,v));
export const mix = (a,b,t) => a+(b-a)*t;
export const lerp3 = (a,b,t) => a.map((v,i)=>mix(v,b[i],t));
export const ease = t => (t=clamp(t))*t*(3-2*t);
export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const scale = (v,s) => v.map(x=>x*s);
export const norm = v => scale(v,1/(Math.hypot(...v)||1));
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
export const identity = () => [1,0,0,0,0,1,0,0,0,0,1,0];
export function matrix(at=[0,0,0], angles=[0,0,0], pivot=[0,0,0], size=1) {
  const [x,y,z]=angles, cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  const rows=[cy*cz, sx*sy*cz-cx*sz,cx*sy*cz+sx*sz,0, cy*sz,sx*sy*sz+cx*cz,cx*sy*sz-sx*cz,0,-sy,sx*cy,cx*cy,0];
  for(let i=0;i<12;i++)rows[i]*=size;
  for(let i=0;i<3;i++)rows[i*4+3]=at[i]-rows[i*4]*pivot[0]-rows[i*4+1]*pivot[1]-rows[i*4+2]*pivot[2];
  return rows;
}
export function point(m,p) {return [0,1,2].map(i=>m[i*4]*p[0]+m[i*4+1]*p[1]+m[i*4+2]*p[2]+m[i*4+3]);}
export function compose(a,b) {
  const m=Array(12).fill(0);
  for(let r=0;r<3;r++)for(let c=0;c<3;c++)for(let k=0;k<3;k++)m[r*4+c]+=a[r*4+k]*b[k*4+c];
  for(let r=0;r<3;r++){m[r*4+3]=a[r*4+3];for(let k=0;k<3;k++)m[r*4+3]+=a[r*4+k]*b[k*4+3];}
  return m;
}
export function samplePath(keys,t) {
  if(t<=keys[0].time)return keys[0];
  for(let i=1;i<keys.length;i++)if(t<keys[i].time){const a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time);return{at:lerp3(a.at,b.at,u),angles:lerp3(a.angles,b.angles,u)};}
  return keys.at(-1);
}
export function shipFrame(film,t) {
  const p=samplePath(film.tracks.motion.flight,t);
  const alarm=ease((t-26)/12), jitter=alarm*.012*Math.sin(t*23);
  return matrix(p.at,[p.angles[0]+jitter,p.angles[1],p.angles[2]+jitter*.5],film.ship.pivot);
}
/** Same axis convention as Spider's native holeAxis: tilt about X, then rotate about Y. */
export function discNormal(film) {
  const rot=film.blackHole.rot;
  if(!Array.isArray(rot)||rot.length!==2)throw Error('Debris dynamics requires the native black-hole rotation.');
  const [a,b]=rot;
  return [Math.sin(a)*Math.sin(b),Math.cos(a),Math.sin(a)*Math.cos(b)];
}
export function discHeight(film,p) {return dot(sub(p,film.blackHole.center),discNormal(film));}
function dynamics(film) {
  const p=film.blackHole.debrisDynamics;
  if(!p)throw Error('Missing debris dynamics settings.');
  for(const key of ['stepSeconds','gravityMu','softening','discGravity','discHeightSoftening','gasThickness','normalDrag','orbitalDrag','innerShadowFactor']) {
    if(!Number.isFinite(p[key])||p[key]<=0)throw Error(`Invalid debris dynamics setting: ${key}`);
  }
  if(p.stepSeconds>1/30||!Number.isFinite(p.inwardDrift)||p.inwardDrift<0)throw Error('Invalid debris timestep or inward drift.');
  return p;
}
function field(film,p) {
  const config=dynamics(film),n=discNormal(film),r=sub(p,film.blackHole.center),height=dot(r,n);
  const radial=sub(r,scale(n,height)),rho=Math.hypot(...radial),outer=13*film.blackHole.radius;
  return {config,n,r,height,radial,rho,outer};
}
/** Softened central gravity plus an approximate symmetric vertical disc field, in m/s². */
export function debrisAcceleration(film,p) {
  const {config:c,n,r,height,rho,outer}=field(film,p);
  const central=scale(r,-c.gravityMu/(dot(r,r)+c.softening*c.softening)**1.5);
  const vertical=-c.discGravity*height/Math.hypot(height,c.discHeightSoftening)/(1+(rho/outer)**2);
  return add(central,scale(n,vertical));
}
function dampInDisc(film,p,v,dt) {
  const {config:c,n,height,radial,rho,outer}=field(film,p);
  // A diffuse outer gas layer avoids an artificial hard boundary at the bright disc edge.
  const gas=Math.exp(-Math.max(0,rho-outer)/(outer*.35)) * Math.exp(-.5*(height/c.gasThickness)**2);
  const vn=dot(v,n),planar=sub(v,scale(n,vn)),outward=norm(radial);
  const circularSpeed=Math.sqrt(c.gravityMu)*rho/(rho*rho+c.softening*c.softening)**.75;
  const flow=add(scale(cross(n,outward),circularSpeed),scale(outward,-c.inwardDrift*circularSpeed));
  return add(scale(n,vn*Math.exp(-c.normalDrag*gas*dt)),add(flow,scale(sub(planar,flow),Math.exp(-c.orbitalDrag*gas*dt))));
}
const trajectoryCache=new WeakMap();
/** Fixed-step velocity-Verlet with symmetric gas-drag half-steps; baked, never frame-rate driven. */
export function debrisTrajectory(film,group) {
  if(group.release===null)throw Error('The intact cockpit follows the authored flight path.');
  const signature=JSON.stringify([film.blackHole,film.tracks.motion.flight,film.metadata.duration,group.release,group.pivot,group.velocity]);
  let cache=trajectoryCache.get(film);if(!cache)trajectoryCache.set(film,(cache=new Map()));
  const previous=cache.get(group);
  if(previous?.signature===signature)return previous;
  const c=dynamics(film),step=c.stepSeconds,maxTime=film.metadata.duration-group.release;
  const start=point(shipFrame(film,group.release),group.pivot),before=point(shipFrame(film,group.release-.05),group.pivot);
  let position=start,velocity=add(scale(sub(start,before),20),group.velocity),captureTime=null;
  const samples=[{time:0,position,velocity}],captureRadius=film.blackHole.radius*c.innerShadowFactor;
  for(let i=1;i<=Math.ceil(maxTime/step);i++) {
    const time=Math.min(i*step,maxTime),dt=time-samples.at(-1).time;
    const drag=dampInDisc(film,position,velocity,dt/2),a=debrisAcceleration(film,position);
    const half=add(drag,scale(a,dt/2)),next=add(position,scale(half,dt));
    const nextVelocity=dampInDisc(film,next,add(half,scale(debrisAcceleration(film,next),dt/2)),dt/2);
    if(Math.hypot(...sub(next,film.blackHole.center))<=captureRadius) {
      // Resolve the entry along this step, so a captured part never re-emerges on the far side.
      const r=sub(position,film.blackHole.center),d=sub(next,position),A=dot(d,d),B=2*dot(r,d),C=dot(r,r)-captureRadius*captureRadius;
      const u=A?clamp((-B-Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A)):0;
      const localTime=samples.at(-1).time+dt*u;
      position=lerp3(position,next,u);velocity=lerp3(velocity,nextVelocity,u);captureTime=group.release+localTime;
      samples.push({time:localTime,position,velocity});break;
    }
    position=next;velocity=nextVelocity;samples.push({time,position,velocity});
  }
  const trajectory={signature,samples,captureTime};cache.set(group,trajectory);return trajectory;
}
export function debrisState(film,group,t) {
  const {samples,captureTime}=debrisTrajectory(film,group),elapsed=Math.max(0,t-group.release);
  if(captureTime!==null&&t>=captureTime)return{position:[...samples.at(-1).position],velocity:[0,0,0],captureTime,captured:true};
  const i=Math.min(Math.floor(elapsed/dynamics(film).stepSeconds),samples.length-1),a=samples[i],b=samples[i+1]??a;
  const u=b.time===a.time?0:clamp((elapsed-a.time)/(b.time-a.time));
  return {position:lerp3(a.position,b.position,u),velocity:lerp3(a.velocity,b.velocity,u),captureTime,captured:false};
}
export function fragmentFrame(film,group,t) {
  if(group.release===null||t<=group.release)return shipFrame(film,t);
  const state=debrisState(film,group,t),at=state.position,dt=Math.min(t,state.captureTime??t)-group.release;
  const release=shipFrame(film,group.release);
  const angles=group.spin.map(v=>v*dt);
  const rotation=matrix([0,0,0],angles);
  const initial=release.slice();initial[3]=initial[7]=initial[11]=0;
  const out=compose(rotation,initial);
  for(let i=0;i<3;i++)out[i*4+3]=at[i]-out[i*4]*group.pivot[0]-out[i*4+1]*group.pivot[1]-out[i*4+2]*group.pivot[2];
  return out;
}
export function shotAt(film,t) {return film.tracks.camera.shots.find(s=>t>=s.start&&t<s.end)??film.tracks.camera.shots.at(-1);}
export function cameraAt(film,t) {
  const shot=shotAt(film,t),u=ease((t-shot.start)/(shot.end-shot.start));
  let eye=lerp3(shot.eye[0],shot.eye[1],u), target=lerp3(shot.target[0],shot.target[1],u);
  if(shot.anchor==='ship'){const p=samplePath(film.tracks.motion.flight,t);eye=add(eye,p.at);target=add(target,p.at);}
  if(shot.anchor==='cockpit'){
    const m=fragmentFrame(film,film.ship.groups.find(g=>g.id==='cockpit'),t);eye=point(m,eye);target=point(m,target);
  }
  const shake=shot.shake??0;
  eye=add(eye,[Math.sin(t*43)*shake,Math.sin(t*59)*shake*.7,Math.cos(t*37)*shake*.4]);
  return {eye,target,roll:mix(shot.roll?.[0]??0,shot.roll?.[1]??0,u),fov:mix(shot.fov[0],shot.fov[1],u),shot};
}
export function pilotPose(t) {
  const alarm=ease((t-24)/13),turn=Math.sin(t*.65)*.08;
  return {hipL:[-1.45,0,.04],hipR:[-1.45,0,-.04],kneeL:[1.45,0,0],kneeR:[1.45,0,0],
    shoulderL:[-.65,0,.08],shoulderR:[-.56,0,-.06],elbowL:[-.95,-.1,0],elbowR:[-.9,.1,0],
    spine:[.05+alarm*.07,0,alarm*Math.sin(t*11)*.025],head:[.04+alarm*.1,turn+alarm*Math.sin(t*2.1)*.14,alarm*Math.sin(t*14)*.04]};
}
export function captionAt(film,t) {return film.tracks.narration.cues.find(c=>t>=c.start&&t<c.end)??null;}

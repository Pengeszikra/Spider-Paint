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
export function fragmentFrame(film,group,t) {
  if(group.release===null||t<=group.release)return shipFrame(film,t);
  const dt=t-group.release, release=shipFrame(film,group.release), start=point(release,group.pivot);
  const d=norm(sub(film.blackHole.center,start));
  // Release inherits the vessel's velocity; tidal acceleration separates fragments.
  const before=point(shipFrame(film,group.release-.05),group.pivot);
  const inherited=scale(sub(start,before),20);
  const at=add(start,add(scale(add(inherited,group.velocity),dt),scale(d,Math.min(dt*dt*.24,100))));
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

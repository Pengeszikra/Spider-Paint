// Wyoming WU-3463: reference-led massing, in metres. No rails or small fittings.
// Repeated windows, collars, tanks, radiators and structural ribs are native instances.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {box,merge,lathe,instantiate,validate,bounds,renderSheet,renderView,orbit} from '../mcp/engine/index.js';

const objects=[],prototypes={};
const colors={cream:'#ccc7b4',pale:'#e2dece',teal:'#568f8a',tealRoof:'#426e6c',red:'#a85a4c',redRoof:'#84483d',yellow:'#d6a53e',steel:'#556064',dark:'#25343a',glass:'#89b5bb',silver:'#aebbc0',floor:'#726f61'};
const mat=k=>'wm-'+k;
const palette=Object.entries(colors).map(([k,color])=>({name:mat(k),color,metal:k==='silver'?.75:k==='steel'?.5:k==='glass'?0:.18,rough:k==='glass'?.08:.63,alpha:k==='glass'?.1:1,emit:0,soft:0}));
const material=k=>({color:colors[k],mat:mat(k)});
const shade=(mesh,k)=>({positions:mesh.positions,faces:mesh.faces.map(f=>({...f,...material(k)}))});
function add(name,mesh){objects.push({name,mesh});return mesh}
function B(name,at,size,k){return add(name,shade(box({at,size}),k))}
function proto(name,mesh){prototypes[name]={lods:[mesh]};}
function inst(name,p,at,rot=[0,0],scale=1,mats){objects.push({name,proto:p,at,rot,scale,...(mats?{mats}:{} )});}
function orient(p,f,k){const c=[0,1,2].map(j=>p.reduce((s,v)=>s+v[j],0)/p.length);return{positions:p,faces:f.map(v=>{const a=p[v[0]],b=p[v[1]],d=p[v[2]],u=b.map((x,j)=>x-a[j]),w=d.map((x,j)=>x-a[j]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],cc=[0,1,2].map(j=>v.reduce((s,i)=>s+p[i][j],0)/v.length);if(n.reduce((s,x,j)=>s+x*(cc[j]-c[j]),0)<0)v=v.slice().reverse();return{v,...material(k)}})}}
// A convex XY outline extruded through Z; useful for the sloping factory hull.
function profileXY(poly,z0,z1,k){const p=[...poly.map(([x,y])=>[x,y,z0]),...poly.map(([x,y])=>[x,y,z1])],n=poly.length,f=[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>i+n)];for(let i=0;i<n;i++)f.push([i,(i+1)%n,(i+1)%n+n,i+n]);return orient(p,f,k)}
function slab(at,w,d,h,bevel,k){const [x,y,z]=at,b=bevel;const q=[[-w/2+b,-d/2],[w/2-b,-d/2],[w/2,-d/2+b],[w/2,d/2-b],[w/2-b,d/2],[-w/2+b,d/2],[-w/2,d/2-b],[-w/2,-d/2+b]],p=[...q.map(([u,v])=>[x+u,y-h/2,z+v]),...q.map(([u,v])=>[x+u,y+h/2,z+v])],f=[Array.from({length:8},(_,i)=>i),Array.from({length:8},(_,i)=>i+8)];for(let i=0;i<8;i++)f.push([i,(i+1)%8,(i+1)%8+8,i+8]);return orient(p,f,k)}
const frame={X:{right:[1,0,0],up:[0,1,0],normal:[0,0,1]},Y:{right:[0,1,0],up:[1,0,0],normal:[0,0,-1]},Z:{right:[0,0,1],up:[1,0,0],normal:[0,1,0]}};
function turned(contour,at,axis,k,n=12){
 // Closed annular contours need an actual open centre; the ordinary lathe caps
 // each end with a disc, which would cover the docking passage.
 if(contour.length>=4&&Math.abs(contour[0][0]-contour.at(-1)[0])<1e-9){
  const basis=frame[axis],p=[];
  for(const [u,r]of contour)for(let i=0;i<n;i++){const t=i*2*Math.PI/n;p.push(at.map((a,j)=>a+u*basis.right[j]+r*(Math.cos(t)*basis.up[j]+Math.sin(t)*basis.normal[j])))}
  const faces=[];for(let a=0;a<contour.length;a++)for(let i=0;i<n;i++){const b=(a+1)%contour.length,j=(i+1)%n;faces.push({v:[a*n+i,a*n+j,b*n+j,b*n+i],...material(k)})}
  return{positions:p,faces};
 }
 return lathe(contour,{origin:at,...frame[axis]},n,material(k));
}
function C(name,at,axis,contour,k,n=12){return add(name,turned(contour,at,axis,k,n))}
function bar(name,a,b,width,depth,k){const d=b.map((v,i)=>v-a[i]),l=Math.hypot(...d),ey=d.map(v=>v/l),ref=Math.abs(ey[2])<.9?[0,0,1]:[1,0,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];let ex=cross(ey,ref);const el=Math.hypot(...ex);ex=ex.map(v=>v/el);const ez=cross(ex,ey);return add(name,shade(box({at:a.map((v,i)=>(v+b[i])/2),size:[width,l,depth],axes:[ex,ey,ez]}),k))}

// Window frames surround real apertures; glass is a distinct shared material.
function windowProto(name,w,h){const t=.16,z=.18;
 const m=merge(shade(box({size:[w-2*t,h-2*t,.055]}),'glass'),shade(box({at:[0,(h-t)/2,0],size:[w,t,z]}),'dark'),shade(box({at:[0,-(h-t)/2,0],size:[w,t,z]}),'dark'),shade(box({at:[-(w-t)/2,0,0],size:[t,h-2*t,z]}),'dark'),shade(box({at:[(w-t)/2,0,0],size:[t,h-2*t,z]}),'dark'));
 proto(name,m);
}
windowProto('hab-window',2.7,1.9);
windowProto('canteen-window',2.7,2.8);
windowProto('control-window',2.35,2.45);
windowProto('corridor-window',2.7,1.55);

// Straight facade with no opaque surface behind its window band.
function facade(name,a,b,y0,y1,windowY,k,p='hab-window',pitch=3){
 const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),ux=dx/L,uz=dz/L;
 const zNormal=[-uz,ux],yaw=Math.atan2(zNormal[0],zNormal[1]);
 const pm=prototypes[p].lods[0],pb=bounds(pm),w=Math.max(...pm.positions.map(q=>q[0]))-Math.min(...pm.positions.map(q=>q[0])),h=Math.max(...pm.positions.map(q=>q[1]))-Math.min(...pm.positions.map(q=>q[1]));
 const count=Math.max(1,Math.floor((L-.2)/pitch)),margin=(L-count*pitch)/2;
 const wall=(label,u0,u1,low,high)=>{if(u1-u0<1e-5||high-low<1e-5)return;const c=(u0+u1)/2,at=[a[0]+ux*c,(low+high)/2,a[1]+uz*c];
  if(label.includes('pier')){const key=`wall-pier-${k}-${(u1-u0).toFixed(3)}x${(high-low).toFixed(3)}`;if(!prototypes[key])proto(key,shade(box({size:[u1-u0,high-low,.28]}),k));inst(`${name}/${label}`,key,at,[0,yaw]);}
  else{const mesh=shade(box({at,size:[u1-u0,high-low,.28],axes:[[ux,0,uz],[0,1,0],[-uz,0,ux]]}),k);add(`${name}/${label}`,mesh)}
 };
 wall('lower-band',0,L,y0,windowY-h/2);wall('upper-band',0,L,windowY+h/2,y1);
 let end=0;
 for(let i=0;i<count;i++){
  const c=margin+pitch*(i+.5),left=c-w/2,right=c+w/2;
  wall(`pier-${i}`,end,left,windowY-h/2,windowY+h/2);
  inst(`${name}/window-${String(i+1).padStart(2,'0')}`,p,[a[0]+ux*c,windowY,a[1]+uz*c],[0,yaw]);end=right;
 }
 wall('end-pier',end,L,windowY-h/2,windowY+h/2);
}

function hab(name,c,w,d,y0,y1,k,p,wy){
 const [x,z]=c,b=1.25,x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
 add(`${name}/floor`,slab([x,y0+.20,z],w,d,.40,b,'floor'));
 add(`${name}/roof`,slab([x,y1-.18,z],w+.3,d+.3,.36,b,k==='red'?'redRoof':'tealRoof'));
 // Four chamfered corners give the accommodation modules their blunt polygonal ends.
 const wall=(n,a,bb)=>bar(`${name}/${n}`,[a[0],(y0+y1)/2,a[1]],[bb[0],(y0+y1)/2,bb[1]],.32,y1-y0,k);
 // Vertical slabs on the diagonals (bar's local depth is chosen below via an explicit box frame).
 const diag=(n,a,bb)=>{const vx=bb[0]-a[0],vz=bb[1]-a[1],l=Math.hypot(vx,vz),key=`module-corner-${k}-${(y1-y0).toFixed(2)}`;if(!prototypes[key])proto(key,shade(box({size:[l,y1-y0,.30]}),k));inst(`${name}/${n}`,key,[(a[0]+bb[0])/2,(y0+y1)/2,(a[1]+bb[1])/2],[0,Math.atan2(-vz,vx)])};
 diag('corner-front-right',[x1-b,z1],[x1,z1-b]);diag('corner-rear-right',[x1,z0+b],[x1-b,z0]);diag('corner-rear-left',[x0+b,z0],[x0,z0+b]);diag('corner-front-left',[x0,z1-b],[x0+b,z1]);
 facade(`${name}/front`,[x0+b,z1],[x1-b,z1],y0+.4,y1-.36,wy,k,p);
 facade(`${name}/right`,[x1,z1-b],[x1,z0+b],y0+.4,y1-.36,wy,k,p);
 facade(`${name}/left`,[x0,z0+b],[x0,z1-b],y0+.4,y1-.36,wy,k,p);
 // Rear wall is deliberately solid, like the service side of the reference.
 B(`${name}/rear`,[x,(y0+y1)/2,z0],[w-2*b,y1-y0,.30],k);
}

// 01. Factory core: deep, sloping shoulder rather than a rectangular stack.
add('01-core/sloped-pressure-hull',profileXY([[-33,-5],[-34,1],[-30,11],[-18,23],[-11,23],[-7,17],[-6,-3],[-15,-10],[-27,-10]],-8.5,8.5,'cream'));
add('01-core/port-shoulder',profileXY([[-35,0],[-34,10],[-26,15],[-24,3],[-28,-5]],-6.5,5.2,'pale'));
add('01-core/lower-belly',profileXY([[-29,-6],[-12,-7],[-10,-15],[-17,-19],[-26,-14]],-6.5,6.7,'cream'));
C('01-core/vertical-service-spine',[-24,0,-3],'Y',[[-26,2.4],[-23,3.2],[-11,3.2],[-9,4.0],[25,4.0],[27,3.3],[38,3.3]],'cream');
C('01-core/upper-stepped-neck',[-24,0,-3],'Y',[[28,3.5],[30,3.5],[30,3.1],[35,3.1],[35,2.6],[39,2.6],[39,1.0],[43,1.0]],'pale');
C('01-core/lower-spine-tip',[-24,0,-3],'Y',[[-32,1.25],[-29,1.25],[-29,2.3],[-23,2.3]],'pale');
C('01-core/secondary-lower-leg',[-8,0,-2],'Y',[[-30,1.1],[-27,1.1],[-27,2.5],[-20,2.5],[-20,3.4],[-12,3.4]],'cream');

// Shared collars around both vertical spines.
proto('spine-collar',turned([[-.38,4.0],[.38,4.0],[.38,3.55],[-.38,3.55]], [0,0,0],'Y','steel',12));
for(const y of [-20,-11,26,32,37])inst(`01-core/spine-collar-${y}`,'spine-collar',[-24,y,-3],[0,0],y===37?.77:1);

// Hollow faceted transfer corridor, with an actual glazed front strip.
// Eight flat outer shell pieces, one front piece replaced by facade openings.
const r=4.45,inner=4.10,cy=0,cz=9.1,xa=-32,xb=-3;
for(let i=0;i<8;i++){
 const a=(i+.5)*Math.PI/4,b=(i+1.5)*Math.PI/4;
 if(i===1)continue;
 const q=[[cy+r*Math.cos(a),cz+r*Math.sin(a)],[cy+r*Math.cos(b),cz+r*Math.sin(b)],[cy+inner*Math.cos(b),cz+inner*Math.sin(b)],[cy+inner*Math.cos(a),cz+inner*Math.sin(a)]];
 const p=[...q.map(([y,z])=>[xa,y,z]),...q.map(([y,z])=>[xb,y,z])];
 add(`02-transfer/shell-sector-${i}`,orient(p,[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]],'pale'));
}
const frontZ=cz+r*Math.sin(3*Math.PI/8),frontH=r*Math.cos(3*Math.PI/8);
facade('02-transfer/front',[xa,frontZ],[xb,frontZ],-frontH,frontH,0,'cream','corridor-window',3.3);
B('02-transfer/interior-floor',[(xa+xb)/2,-1.13,cz],[xb-xa,.22,7.6],'floor');
proto('dock-collar',turned([[-.6,4.85],[.6,4.85],[.6,3.70],[-.6,3.70]],[0,0,0],'Y','pale',16));
for(const x of [-35,-32,-3])inst(`02-transfer/dock-collar-${x}`,'dock-collar',[x,0,9.1],[Math.PI/2,Math.PI/2]);
C('02-transfer/port-docking-socket',[-35,0,9.1],'X',[[-4.0,4.2],[-2.8,4.8],[-1.0,4.8],[-1.0,3.5],[-3.5,3.5]],'steel',16);
C('02-transfer/port-hatch',[-39,0,9.1],'X',[[.1,3.45],[.35,3.45]],'dark',12);

// 03. Offset accommodation blocks, with faceted undersides.
add('03-hab/upper-support-plinth',profileXY([[-16,23],[6,23],[8,25],[-17,25]],-7.8,6.8,'steel'));
hab('03-hab/upper',[-4,-.5],23,15,25,32.5,'teal','hab-window',28.2);
hab('03-hab/lower',[4,4.0],27,15,14.5,21.4,'teal','hab-window',17.65);
add('03-hab/lower-tapered-belly',profileXY([[-9.5,14.5],[17.5,14.5],[14.2,12.0],[-6.5,12.0]],-2.2,10.2,'tealRoof'));
B('03-hab/stack-connector',[-5,22.5,0],[8,5.7,8.0],'cream');
B('03-hab/rear-service-block',[6,26,-6],[8,5.0,7.5],'teal');

proto('roof-tank',turned([[-2.5,1.8],[-2.2,2.35],[1.9,2.35],[2.5,1.8]],[0,0,0],'Y','pale',12));
for(const x of [-4,4])inst(`03-hab/roof-tank-${x}`,'roof-tank',[x,35.1,-1]);

// 04. Terracotta canteen, a long cantilever with a wraparound glazed end.
hab('04-canteen',[30,5.5],42,17,5.3,13.1,'red','canteen-window',9.0);
add('04-canteen/underside-bevel',profileXY([[9,5.3],[51,5.3],[48,3.6],[13,3.6]],-1.5,12.5,'redRoof'));
const diagonal=bar('support-prototype',[-5,-11,0],[38,4.5,0],2.35,2.0,'steel');objects.pop();proto('canteen-main-support',diagonal);
const shortDiagonal=bar('support-prototype',[-4,-8,0],[13,4.3,0],1.75,1.65,'pale');objects.pop();proto('canteen-short-support',shortDiagonal);
for(const z of [-.2,10.4]){
 inst(`04-canteen/main-diagonal-${z}`,'canteen-main-support',[0,0,z]);
 inst(`04-canteen/short-diagonal-${z}`,'canteen-short-support',[0,0,z]);
}
bar('04-canteen/root-brace',[-5,-11,5],[-5,6,5],3.3,7.5,'steel');

// 05. Mustard lookout: narrow shaft, flared, sloping glazed control cab.
C('05-control/shaft',[19,0,-4.5],'Y',[[13.0,3.65],[25.8,3.65],[26.5,4.45]],'yellow',12);
C('05-control/cabin-floor',[19,0,-4.5],'Y',[[26.4,4.5],[27.0,4.5],[27.0,3.95],[26.4,3.95]],'yellow',12);
C('05-control/cabin-roof',[19,0,-4.5],'Y',[[29.75,5.15],[30.65,5.15],[31.2,4.55]],'yellow',12);
B('05-control/interior-floor',[19,26.85,-4.5],[5.9,.22,5.9],'floor');
proto('control-mullion',shade(box({size:[.20,2.58,.22]}),'yellow'));
for(let i=0;i<12;i++){
 const theta=i*Math.PI/6,rad=4.72;
 inst(`05-control/glass-bay-${i+1}`,'control-window',[19+rad*Math.sin(theta),28.4,-4.5+rad*Math.cos(theta)],[.255,theta]);
 const t=theta+Math.PI/12;
 inst(`05-control/mullion-${i+1}`,'control-mullion',[19+4.88*Math.sin(t),28.4,-4.5+4.88*Math.cos(t)],[.255,t]);
}
C('05-control/roof-vent',[19,0,-4.5],'Y',[[31.0,1.6],[33.2,1.6],[33.7,1.1]],'pale',10);

// 06. Lower workshop and four repeated broad radiator panels.
add('06-workshop/main-module',slab([2,-17,3],19,13,10.0,1.25,'pale'));
B('06-workshop/side-service-mass',[2,-16.5,9.7],[12,6,.55],'cream');
B('06-workshop/upper-brow',[2,-11.6,5],[15.5,1.0,10],'steel');
proto('radiator-panel',merge(shade(box({size:[3.0,12,.65]}),'dark'),shade(box({at:[-1.5,0,.16],size:[.25,12.4,.75]}),'steel'),shade(box({at:[1.5,0,.16],size:[.25,12.4,.75]}),'steel'),shade(box({at:[0,6,.16],size:[3.2,.30,.75]}),'steel'),shade(box({at:[0,-6,.16],size:[3.2,.30,.75]}),'steel')));
for(let i=0;i<4;i++)inst(`06-workshop/radiator-${i+1}`,'radiator-panel',[-22+i*3.45,-14.6,11.0]);
B('06-workshop/radiator-root',[-17,-14.5,8.9],[15,8.5,3.0],'steel');
C('06-workshop/docking-neck',[11.5,-17,3],'X',[[0,3.6],[4.0,3.6],[4.0,3.0],[7.5,3.0]],'steel',12);

// 07. Docked utility vessel: yellow aft section, long faceted cream bow.
C('07-tug/yellow-aft',[0,-17,3],'X',[[18,2.6],[20,4.15],[28,4.55],[33,4.55]],'yellow',12);
C('07-tug/cream-forward-hull',[0,-17,3],'X',[[32.5,4.55],[45,4.55],[53,4.10],[58,3.25],[60,2.8]],'pale',12);
proto('tug-hull-band',turned([[-.22,4.68],[.22,4.68],[.22,4.3],[-.22,4.3]],[0,0,0],'Y','steel',12));
for(const x of [20.5,27.0,33.5])inst(`07-tug/hull-band-${x}`,'tug-hull-band',[x,-17,3],[Math.PI/2,Math.PI/2]);
// A broad cockpit brow is a major silhouette feature, rather than fine surface detail.
add('07-tug/raised-cockpit',profileXY([[35,-12.5],[44,-12.5],[43,-9.5],[37,-9.5]],-.7,5.0,'cream'));
proto('cockpit-window',shade(box({size:[4.8,1.5,.12]}),'glass'));
inst('07-tug/cockpit-window','cockpit-window',[40,-10.6,5.15]);
proto('tug-side-window',shade(box({size:[2.0,.9,.065]}),'glass'));
for(const x of [50.5,53,55.5])inst(`07-tug/bow-window-${x}`,'tug-side-window',[x,-15.0,6.7]);
proto('tug-aux-pod',merge(turned([[-6.0,1.1],[-5.5,1.65],[4.9,1.65],[5.9,1.05]],[0,0,0],'X','pale',12),turned([[-4.0,1.76],[-3.65,1.76],[-3.65,1.60],[-4.0,1.60]],[0,0,0],'X','steel',12),turned([[3.7,1.76],[4.05,1.76],[4.05,1.60],[3.7,1.60]],[0,0,0],'X','yellow',12)));
for(const z of [-3.0,9.0])inst(`07-tug/aux-pod-${z}`,'tug-aux-pod',[43,-22,z]);

// 08. Only the large masts and spherical communications pod are retained.
B('08-comms/main-mast',[5.2,41,-2.7],[.85,14,1.0],'steel');
B('08-comms/main-mast-upper',[5.2,47.0,-2.7],[.38,2.0,.45],'pale');
B('08-comms/core-mast',[-24,41,-3],[.65,5,.75],'steel');
bar('08-comms/satellite-boom',[24,30,-4.5],[32,34,-4.5],.75,.85,'steel');
C('08-comms/spherical-pod',[33.5,34.5,-4.5],'Y',[[-2.8,.25],[-2.5,1.25],[-1.6,2.3],[0,2.75],[1.6,2.3],[2.5,1.25],[2.8,.25]],'silver',16);

// Major repeated ribs on the cream shoulder, without the reference's tiny panels.
proto('shoulder-rib',shade(box({size:[.48,15.5,.45]}),'pale'));
for(const x of [-17.0,-11.2])inst(`01-core/vertical-rib-${x}`,'shoulder-rib',[x,10.6,8.75]);

// Instance geometry is expanded only for validation and previews, never in the authored scene.
const expanded=objects.map(o=>o.proto?{name:o.name,mesh:instantiate(prototypes[o.proto].lods[0],o)}:o);
const errors=expanded.map(o=>({name:o.name,...validate(o.mesh)})).filter(v=>!v.ok);
if(errors.length)throw Error(JSON.stringify(errors.map(({name,notes})=>({name,notes})),null,2));
if(palette.find(m=>m.name===mat('glass')).alpha!==.1)throw Error('Window alpha must equal 0.1');
const windows=objects.filter(o=>o.proto&&prototypes[o.proto].lods[0].faces.some(f=>f.mat===mat('glass')));
if(windows.some(o=>!o.proto))throw Error('Every repeated window must be a native instance');
const all=merge(...expanded.map(o=>o.mesh)),bb=bounds(all),lo=[0,1,2].map(i=>Math.min(...all.positions.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...all.positions.map(p=>p[i])));
const view={render:'webgpu',edges:false,light:true,glow:false,smooth:false,studio:true,cam:{center:bb.center,radius:bb.radius*.91,yaw:.42,pitch:.12}};
const scene={format:'3draft-scene',version:2,name:'WU-3463 Wyoming — principal masses',palette,prototypes,view,objects};
const root=new URL('../',import.meta.url);
writeFileSync(new URL('models/wyoming-massing.scene.json',root),JSON.stringify(scene));
writeFileSync('/tmp/wyoming-massing-expanded.scene.json',JSON.stringify({format:'3draft-scene',version:1,objects:expanded}));
const materials=Object.fromEntries(palette.map(({name,...m})=>[name,m]));
const opts={points:false,palette:materials,stroke:'#12212a35',background:'#dce2df'};
writeFileSync('/tmp/wyoming-massing-sheet.svg',renderSheet(all,{...opts,size:650}));
writeFileSync('/tmp/wyoming-massing-hero.svg',renderView(all,orbit({yaw:.42,pitch:.12}),{...opts,size:1300}));
console.log(JSON.stringify({objects:objects.length,prototypes:Object.keys(prototypes).length,instances:objects.filter(o=>o.proto).length,windowInstances:windows.length,glassAlpha:.1,bounds:{min:lo,max:hi,size:hi.map((v,i)=>v-lo[i])},faces:all.faces.length},null,2));

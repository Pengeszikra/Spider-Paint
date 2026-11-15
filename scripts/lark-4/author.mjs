// Author one chapter at a time. Chapters become part of the replay only after
// their MCP operations have actually been executed in the live Spider viewer.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {box,extrude,merge,lathe,validate,renderSheet,renderView,orbit,bounds,textMesh} from '../../mcp/engine/index.js';
const root=new URL('../../',import.meta.url);
export const palette=[
 ['ceramic','#d5ddd9',.15,.65,1],['navy','#243b4b',.25,.6,1],['frame','#526b76',.65,.38,1],['orange','#e69843',.15,.6,1],['floor','#4a5961',.2,.8,1],['rubber','#17252c',0,.85,1],['seat','#427f83',0,.8,1],['glass','#8ebac4',0,.08,.1],['screen','#163441',.1,.25,1],['light','#bdeee8',0,.3,1],['warm','#f2d7a3',0,.4,1],['red','#d96653',.1,.6,1],['metal','#a3b4bb',.7,.3,1],['person','#93a7a3',0,.8,1]
].map(([id,color,metal,rough,alpha])=>({name:`l4-${id}`,color,metal,rough,alpha,emit:['light','warm'].includes(id)?.6:0,soft:0}));
export const color=k=>palette.find(m=>m.name===`l4-${k}`).color;
export const material=k=>({mat:`l4-${k}`,color:color(k)});
export const shaded=(m,k)=>({positions:m.positions,faces:m.faces.map(f=>({...f,...material(k)}))});
export const frame={X:{right:[1,0,0],up:[0,1,0],normal:[0,0,1]},Y:{right:[0,1,0],up:[1,0,0],normal:[0,0,-1]},Z:{right:[0,0,1],up:[1,0,0],normal:[0,1,0]}};
export function cylinder(at,axis,profile,k,n=12){return lathe(profile,{origin:at,...frame[axis]},n,material(k))}
export function beam(a,b,w,d,k){const v=b.map((x,i)=>x-a[i]),L=Math.hypot(...v),ey=v.map(x=>x/L),ref=Math.abs(ey[2])<.9?[0,0,1]:[1,0,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];let ex=cross(ey,ref),l=Math.hypot(...ex);ex=ex.map(x=>x/l);const ez=cross(ex,ey);return shaded(box({at:a.map((x,i)=>(x+b[i])/2),size:[w,L,d],axes:[ex,ey,ez]}),k)}
export function convexMesh(p,faces,k){const c=[0,1,2].map(j=>p.reduce((s,v)=>s+v[j],0)/p.length);return{positions:p,faces:faces.map(v=>{const a=p[v[0]],b=p[v[1]],d=p[v[2]],u=b.map((x,j)=>x-a[j]),w=d.map((x,j)=>x-a[j]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],fc=[0,1,2].map(j=>v.reduce((s,i)=>s+p[i][j],0)/v.length);if(n.reduce((s,x,j)=>s+x*(fc[j]-c[j]),0)<0)v=v.slice().reverse();return{v,...material(k)}})}}
export function plate(poly,depth,k){const a=poly[0],b=poly[1],c=poly[2],u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);n=n.map(x=>x/l);if(poly.length>3&&poly.some(q=>Math.abs(q.reduce((s,x,j)=>s+(x-a[j])*n[j],0))>1e-7))return merge(...poly.slice(1,-1).map((_,i)=>plate([poly[0],poly[i+1],poly[i+2]],depth,k)));const p=[...poly.map(q=>q.map((x,j)=>x-n[j]*depth/2)),...poly.map(q=>q.map((x,j)=>x+n[j]*depth/2))],N=poly.length,f=[Array.from({length:N},(_,i)=>i),Array.from({length:N},(_,i)=>i+N)];for(let i=0;i<N;i++)f.push([i,(i+1)%N,(i+1)%N+N,i+N]);return convexMesh(p,f,k)}
export function panel(at,w,h,d,b,k){const q=[[-w/2+b,-h/2],[w/2-b,-h/2],[w/2,-h/2+b],[w/2,h/2-b],[w/2-b,h/2],[-w/2+b,h/2],[-w/2,h/2-b],[-w/2,-h/2+b]];return plate(q.map(([x,y])=>[x+at[0],y+at[1],at[2]]),d,k)}
export function rod(a,b,r,k,n=10){const d=b.map((v,i)=>v-a[i]),L=Math.hypot(...d),axis=d.map(v=>v/L),ref=Math.abs(axis[1])<.9?[0,1,0]:[1,0,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];let up=cross(axis,ref),l=Math.hypot(...up);up=up.map(v=>v/l);return lathe([[0,r],[L,r]],{origin:a,right:axis,up,normal:cross(axis,up)},n,material(k))}
export function annular(at,axis,sections,k,n=12){const f=frame[axis],p=[];for(let side=0;side<2;side++)for(const [u,r0,r1]of sections)for(let i=0;i<n;i++){const a=i*2*Math.PI/n,r=side?r1:r0;p.push(at.map((v,j)=>v+u*f.right[j]+r*(Math.cos(a)*f.up[j]+Math.sin(a)*f.normal[j])))}const S=sections.length,b=S*n,faces=[];for(let a=0;a<S-1;a++)for(let i=0;i<n;i++){const j=(i+1)%n;faces.push({v:[a*n+i,a*n+j,(a+1)*n+j,(a+1)*n+i],...material(k)},{v:[b+a*n+i,b+(a+1)*n+i,b+(a+1)*n+j,b+a*n+j],...material('rubber')})}for(let i=0;i<n;i++){const j=(i+1)%n;faces.push({v:[i,b+i,b+j,j],...material(k)});const t=(S-1)*n;faces.push({v:[t+i,t+j,b+t+j,b+t+i],...material(k)})}return{positions:p,faces}}
export const footprints={outer:[[-1.65,-3],[1.65,-3],[2.05,-2.5],[2.05,1.8],[1.45,3.3],[.95,3.8],[-.95,3.8],[-1.45,3.3],[-2.05,1.8],[-2.05,-2.5]],inner:[[-1.55,-2.7],[1.55,-2.7],[1.78,-2.45],[1.78,1.65],[1.25,2.9],[.8,3.3],[-.8,3.3],[-1.25,2.9],[-1.78,1.65],[-1.78,-2.45]]};
const path=new URL('models/lark-4-tutorial.json',root);
const journal=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{format:'spider-build-tutorial',version:1,title:"LARK–4 — four-person lander",units:'metres',palette,chapters:[],events:[],createdAt:new Date().toISOString()};
const state=new Map();for(const e of journal.events){if(e.after)state.set(e.name,e.after);else if(e.method==='remove')state.delete(e.name)}
const commands=[];
export function mesh(name,m,label=name){const v=validate(m);if(!v.ok)throw Error(`${name}: ${v.notes.join('; ')}`);const after={name,mesh:m};const args={name,positions:m.positions,faces:m.faces.map(({v,color})=>({v,color}))};commands.push({name,method:'add_mesh',args,after,label});state.set(name,after);return m}
export function B(name,at,size,k,label=name){const after={name,mesh:shaded(box({at,size}),k)};commands.push({name,method:'add_box',args:{name,at,size,color:color(k)},after,label});state.set(name,after)}
export function E(name,polygon,y,height,k,label=name){const after={name,mesh:shaded(extrude({polygon,y,height}),k)};commands.push({name,method:'add_extrusion',args:{name,polygon,y,height,color:color(k)},after,label});state.set(name,after)}
export function remove(name,label=name){commands.push({name,method:'remove',args:{name},label});state.delete(name)}
export function transform(name,args,label=name){const old=state.get(name);if(!old)throw Error(`Missing ${name}`);const ps=old.mesh.positions,c=[0,1,2].map(i=>(Math.min(...ps.map(p=>p[i]))+Math.max(...ps.map(p=>p[i])))/2),s=args.scale===undefined?[1,1,1]:typeof args.scale==='number'?[args.scale,args.scale,args.scale]:args.scale,a=(args.rotate_y??0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),move=args.move??[0,0,0];const positions=ps.map(p=>{const x=(p[0]-c[0])*s[0],y=(p[1]-c[1])*s[1],z=(p[2]-c[2])*s[2];return[c[0]+ca*x+sa*z+move[0],c[1]+y+move[1],c[2]-sa*x+ca*z+move[2]]});const after={...old,mesh:{positions,faces:old.mesh.faces}};commands.push({name,method:'transform',args:{name,...args},after,label});state.set(name,after)}

const stages={
 1(){
  E('structure/heatshield',footprints.outer,1.31,.18,'navy',"Extrude the lower heat shield with chamfered corners");
  E('interior/pressure-floor',footprints.inner,1.49,.09,'floor',"Cabin walking surface: 1.58 m above ground");
  B('structure/floor-crossbeam-front',[0,1.30,1.50],[3.65,.22,.22],'frame',"Forward load-bearing crossbeam");
  B('structure/floor-crossbeam-rear',[0,1.30,-1.85],[3.65,.22,.22],'frame',"Aft load-bearing crossbeam");
  const hm=merge(box({at:[0,1.22,0],size:[.37,.57,.22]}),box({at:[0,1.67,0],size:[.20,.26,.21]}),box({at:[0,1.51,0],size:[.11,.13,.12]}),...[-1,1].flatMap(s=>[box({at:[s*.10,.47,0],size:[.15,.94,.17]}),box({at:[s*.255,1.19,0],size:[.105,.62,.13]})]));
  const p=hm.positions.map(q=>[q[0],q[1]+1.58,q[2]-.45]);
  mesh('guide/180cm-human',shaded({positions:p,faces:hm.faces},'person'),"1.80 m human figure for checking cabin scale");
  B('guide/one-metre',[2.5,.50,0],[.035,1,.035],'orange',"One-metre height reference");
  return{title:"01 · Scale and floor",text:"All coordinates are in metres. The four-person cabin floor is 1.58 m above ground; a 1.80 m human figure provides a reference for checking the usable space.",camera:{eye:[8,6,10],yaw:-38.66,pitch:18.99},focus:'interior/pressure-floor'};
 },
 2(){
  for(const s of [-1,1]){
   B(`structure/longeron-${s}`,[s*1.62,1.68,-.35],[.13,.20,4.75],'frame',"Longitudinal load-bearing beam");
   for(const z of [-2.55,.35,1.80])B(`structure/upright-${s}-${z}`,[s*1.80,2.60,z],[.13,2.05,.14],'frame',"Vertical cabin frame member");
   mesh(`structure/roof-shoulder-${s}`,beam([s*1.80,3.62,-2.5],[s*1.60,4.03,-2.5],.13,.16,'frame'),"Build the sloping roof shoulder");
  }
  B('structure/rear-top-crossbar',[0,3.96,-2.55],[3.30,.14,.16],'frame',"Aft roof frame");
  B('structure/centre-top-crossbar',[0,3.96,.35],[3.30,.14,.16],'frame',"Center roof frame");
  B('interior/aisle-strip',[0,1.590,-.65],[.72,.018,3.70],'navy',"72 cm clear central aisle");
  return{title:"02 · Cabin frame and clearances",text:"The interior is 3.56 m wide. A clear aisle of at least 72 cm remains between the seats, with more than 2 m of headroom beside the sloping roof shoulders.",camera:{eye:[8,5.6,10],yaw:-38.66,pitch:16.7}};
 },
 3(){
  for(const [row,z]of [['pilot',1.10],['passenger',-.80]])for(const s of [-1,1]){
   const x=s*.92,n=`interior/seat-${row}-${s}`;
   B(`${n}/floor-anchor`,[x,1.64,z],[.62,.12,.65],'frame',"Seat base bolted to the deck");
   B(`${n}/pedestal`,[x,1.82,z],[.30,.30,.34],'navy',"Energy-absorbing seat pedestal");
   mesh(`${n}/cushion`,panel([x,2.035,z+.02],.63,.18,.61,.045,'seat'),"63 cm wide seat cushion");
   mesh(`${n}/backrest`,panel([x,2.47,z-.255],.61,.74,.13,.065,'seat'),"Backrest cushion with a shaped outline");
   mesh(`${n}/headrest`,panel([x,2.97,z-.245],.35,.24,.15,.035,'navy'),"Headrest");
   for(const a of [-1,1]){
    B(`${n}/armrest-${a}`,[x+a*.355,2.22,z+.02],[.075,.09,.46],'navy',"Separate armrest");
    B(`${n}/harness-${a}`,[x+a*.16,2.48,z-.177],[.055,.64,.028],'rubber',"Shoulder strap of the five-point harness");
   }
   B(`${n}/belt-buckle`,[x,2.17,z+.12],[.115,.09,.045],'orange',"Central harness buckle");
  }
  return{title:"03 · Four energy-absorbing seats",text:"Two pilots sit in front and two passengers behind, all facing forward. The seat cushions are approximately 55 cm above the cabin floor; each seat has a separate headrest and safety harness.",camera:{eye:[7,5.5,9],yaw:-37.87,pitch:18.44}};
 },
 4(){
  for(const s of [-1,1]){
   const x=s*.87,n=`interior/cockpit-${s}`;
   mesh(`${n}/console-stand`,beam([x,1.60,2.28],[x,2.35,2.48],.43,.40,'navy'),"Cockpit console support pedestal");
   mesh(`${n}/console-body`,plate([[x-.43,2.40,2.13],[x+.43,2.40,2.13],[x+.43,2.67,2.74],[x-.43,2.67,2.74]],.16,'navy'),"Instrument console tilted toward the pilot");
   mesh(`${n}/display-frame`,plate([[x-.31,2.47,2.25],[x+.31,2.47,2.25],[x+.31,2.65,2.65],[x-.31,2.65,2.65]],.025,'rubber'),"Display bezel");
   mesh(`${n}/display`,plate([[x-.27,2.49,2.27],[x+.27,2.49,2.27],[x+.27,2.645,2.61],[x-.27,2.645,2.61]],.018,'screen'),"Navigation and engine display");
   for(let i=0;i<3;i++)B(`${n}/telemetry-${i}`,[x-.18+i*.18,2.575,2.47],[.10,.018,.10],i===2?'orange':'light',"Instruments and status indicators");
   mesh(`${n}/joystick`,cylinder([x+s*.34,2.31,1.34],'Y',[[0,.035],[.16,.035],[.21,.05]],'rubber',8),"Side control stick");
   B(`${n}/pedal-left`,[x-.14,1.67,1.72],[.18,.055,.24],'frame',"Footrest and pedal");
   B(`${n}/pedal-right`,[x+.14,1.67,1.72],[.18,.055,.24],'frame',"Footrest and pedal");
  }
  B('interior/centre-console',[0,2.04,1.93],[.28,.75,.70],'navy',"Central communications and manual control console");
  B('interior/centre-emergency-switch',[0,2.43,1.91],[.13,.045,.12],'red',"Guarded emergency switch");
  return{title:"04 · Cockpit and controls",text:"Build two sloping instrument consoles, separate control sticks and pedals. The consoles sit ahead of the seats while the central aisle remains clear.",camera:{eye:[5.2,5.2,7.5],yaw:-34.74,pitch:19.9}};
 },
 5(){
  B('interior/rear-bulkhead',[0,2.77,-2.72],[3.25,2.38,.14],'ceramic',"Aft pressure bulkhead");
  for(const s of [-1,1]){
   const x=s*.93,n=`interior/rear-locker-${s}`;
   B(`${n}/body`,[x,2.31,-2.39],[.74,1.40,.47],'navy',"Individual equipment locker");
   mesh(`${n}/door`,panel([x,2.33,-2.135],.68,1.24,.035,.045,'ceramic'),"Locker door");
   B(`${n}/handle`,[x+s*.20,2.33,-2.104],[.035,.20,.035],'frame',"Recessed door handle");
   B(`${n}/mark`,[x,2.78,-2.10],[.28,.06,.012],'orange',"Locker identification marking");
  }
  B('interior/life-support-cabinet',[0,2.25,-2.39],[.54,1.22,.46],'frame',"Central air and water treatment unit");
  B('interior/life-support-panel',[0,2.43,-2.13],[.42,.52,.035],'navy',"Maintenance access panel");
  for(let i=0;i<4;i++)B(`interior/life-support-vent-${i}`,[0,2.04+i*.07,-2.13],[.32,.025,.03],'rubber',"Vent grille slat");
  for(const s of [-1,1]){
   mesh(`interior/oxygen-bottle-${s}`,cylinder([s*.22,3.25,-2.36],'Y',[[-.21,.10],[-.16,.14],[.17,.14],[.23,.09]],'metal',10),"Reserve oxygen cylinder");
   B(`interior/oxygen-band-${s}`,[s*.22,3.27,-2.205],[.20,.055,.025],'orange',"Cylinder retaining strap");
  }
  B('interior/first-aid-kit',[-1.55,2.74,-1.66],[.25,.34,.32],'ceramic',"First-aid kit opposite the entrance");
  B('interior/first-aid-mark',[-1.55,2.74,-1.49],[.10,.035,.012],'red',"First-aid marking");
  B('interior/first-aid-mark-vertical',[-1.55,2.74,-1.49],[.035,.10,.012],'red',"First-aid marking");
  for(const s of [-1,1]){
   mesh(`interior/cargo-case-${s}`,panel([s*.93,1.76,-1.76],.66,.29,.36,.04,'navy'),"Secured lower luggage compartment");
   B(`interior/cargo-strap-${s}`,[s*.93,1.775,-1.56],[.055,.27,.018],'orange',"Cargo compartment retaining strap");
  }
  return{title:"05 · Life support and storage",text:"Equipment lockers, an air-treatment unit and reserve cylinders occupy the aft wall. Luggage stays clear of the crew entrance and central aisle.",camera:{eye:[6,5.5,6],yaw:-45,pitch:22.4}};
 },
 6(){
  // Window openings are assembled from wall bands and posts, never covered by
  // an opaque box behind a translucent face.
  for(const s of [-1,1]){
   const x=s*1.90,side=s<0?'port':'starboard',n=`shell/${side}`;
   if(s<0){
    B(`${n}/rear-panel`,[x,2.59,-1.625],[.18,2.02,1.75],'ceramic',"Port-side aft pressure wall");
   }else{
    B(`${n}/rear-panel`,[x,2.59,-2.35],[.18,2.02,.30],'ceramic',"Starboard aft wall behind the crew door");
    B(`${n}/door-front-pier`,[x,2.59,-.53],[.18,2.02,.34],'ceramic',"Narrow wall pier ahead of the door");
    B('structure/door-frame-top',[x,3.68,-1.40],[.24,.18,1.20],'frame',"1.10 m wide, 2 m high crew entrance");
    B('structure/door-frame-aft',[x,2.60,-2.03],[.24,2.15,.12],'frame',"Aft door jamb");
    B('structure/door-frame-front',[x,2.60,-.77],[.24,2.15,.12],'frame',"Forward door jamb");
   }
   B(`${n}/front-lower-band`,[x,2.025,.85],[.18,.89,2.40],'ceramic',"Wall panel below the side windows");
   B(`${n}/front-upper-band`,[x,3.46,.85],[.18,.40,2.40],'ceramic',"Upper side-window header");
   for(const z of [-.39,.75,1.89])B(`${n}/window-pier-${z}`,[x,2.90,z],[.20,.90,.12],'frame',"Structural post between windows");
   for(const [i,z]of [[1,.18],[2,1.32]]){
    const pts=[[x,2.50,z-.49],[x,2.50,z+.49],[x,3.29,z+.49],[x,3.29,z-.49]];
    mesh(`${n}/window-${i}`,plate(pts,.035,'glass'),"Transparent side window — alpha 0.1");
    B(`${n}/window-sill-${i}`,[x,2.49,z],[.21,.075,1.06],'navy',"Lower window frame");
   }
   mesh(`${n}/aft-chamfer`,plate([[s*1.90,1.60,-2.50],[s*1.56,1.60,-2.78],[s*1.56,3.65,-2.78],[s*1.90,3.65,-2.50]],.15,'ceramic'),"Chamfered aft corner");
  }
  return{title:"06 · Side walls and window openings",text:"Separate wall bands and posts surround the windows. The glazing has alpha 0.1 with actual openings behind it. A 1.10 × 2.00 m crew entrance remains on the aft starboard side.",camera:{eye:[8,5.1,8],yaw:-45,pitch:16.5}};
 },
 7(){
  for(const s of [-1,1]){
   const name=s<0?'port':'starboard';
   mesh(`shell/nose/lower-cheek-${name}`,plate([[s*2.00,1.58,1.80],[s*1.00,1.58,3.72],[s*1.30,2.94,3.42],[s*1.90,3.28,1.80]],.16,'ceramic'),"Side cheek of the wedge-shaped nose");
   mesh(`shell/nose/front-panel-${name}`,plate([[0,1.58,3.72],[s*1.00,1.58,3.72],[s*1.30,2.94,3.42],[0,2.94,3.42]],.15,'navy'),"Sloping lower nose armor");
   mesh(`shell/canopy/windshield-${name}`,plate([[0,2.99,3.43],[s*1.29,2.99,3.43],[s*1.64,3.98,2.26],[0,3.98,2.26]],.035,'glass'),"Two-piece sloping windshield");
   const A=[s*1.90,3.30,1.78],B0=[s*1.30,2.99,3.43],C=[s*1.64,3.98,2.26],D=[s*1.64,3.98,1.78];
   mesh(`shell/canopy/${name}-facet-front`,plate([A,B0,C],.035,'glass'),"Side cockpit glazing facet");
   mesh(`shell/canopy/${name}-facet-rear`,plate([A,C,D],.035,'glass'),"Upper cockpit glazing facet");
   mesh(`structure/canopy-edge-${name}`,beam(B0,C,.11,.11,'frame'),"Outer windshield frame member");
   mesh(`structure/canopy-shoulder-${name}`,beam(A,D,.11,.11,'frame'),"Cockpit shoulder frame");
   mesh(`structure/nose-side-sill-${name}`,beam([s*1.30,2.97,3.43],[s*1.90,3.28,1.80],.12,.12,'frame'),"Side window sill beam");
  }
  mesh('structure/windshield-centre-mullion',beam([0,2.98,3.45],[0,4.01,2.23],.11,.12,'frame'),"Center windshield mullion");
  mesh('structure/windshield-upper-crossbar',beam([-1.66,4.01,2.23],[1.66,4.01,2.23],.12,.13,'frame'),"Upper cockpit crossbar");
  mesh('structure/windshield-lower-crossbar',beam([-1.32,2.96,3.45],[1.32,2.96,3.45],.11,.11,'frame'),"Lower windshield crossbar");
  B('shell/nose/bump-stop',[0,1.68,3.85],[1.50,.19,.20],'frame',"Lower nose impact guard");
  return{title:"07 · Faceted nose and cockpit",text:"The nose narrows toward the front. Two sloping planes form the windshield, with triangular side glazing facets; every glass panel is a separate planar solid.",camera:{eye:[7,4.8,10],yaw:-34.99,pitch:13.1}};
 },
 8(){
  for(const z of [-1.85,-.20,1.30]){
   B(`shell/roof/interior-light-housing-${z}`,[0,3.98,z],[.90,.09,.20],'navy',"Ceiling light housing");
   B(`shell/roof/interior-light-${z}`,[0,3.925,z],[.76,.018,.13],'warm',"Warm-white cabin lighting");
  }
  B('shell/roof/main-pressure-panel',[0,4.105,-.48],[3.32,.17,4.70],'ceramic',"Removable pressure roof panel");
  for(const s of [-1,1]){
   const side=s<0?'port':'starboard';
   mesh(`shell/roof/shoulder-${side}`,plate([[s*1.90,3.63,-2.63],[s*1.90,3.63,1.78],[s*1.66,4.11,1.78],[s*1.66,4.11,-2.63]],.13,'ceramic'),"Sloping roof shoulder for more cabin space and a narrower upper hull");
   B(`shell/roof/seam-${side}`,[s*1.62,4.208,-.45],[.065,.035,4.45],'frame',"Roof panel sealing seam");
  }
  mesh('shell/roof/canopy-transition',plate([[-1.66,4.11,1.87],[1.66,4.11,1.87],[1.64,3.98,2.26],[-1.64,3.98,2.26]],.13,'ceramic'),"Sloping transition between roof and windshield");
  B('shell/roof/escape-hatch-frame',[0,4.225,-.65],[.98,.09,1.10],'navy',"Roof escape hatch frame");
  B('shell/roof/escape-hatch',[0,4.29,-.65],[.82,.055,.93],'ceramic',"Escape hatch");
  B('shell/roof/escape-hatch-handle',[0,4.34,-.65],[.28,.06,.055],'orange',"External hatch release handle");
  return{title:"08 · Roof and cabin lighting",text:"The roof is a separate panel group. Interior / cutaway hides this group and the port-side wall, keeping the completed cabin accessible for inspection.",camera:{eye:[8,6.8,10],yaw:-38.66,pitch:21.7}};
 },
 9(){
  for(const s of [-1,1]){
   const side=s<0?'port':'starboard',n=`exterior/armour-${side}`;
   mesh(`${n}/lower-belt`,beam([s*2.015,1.55,-2.35],[s*2.015,1.55,1.62],.28,.19,'navy'),"Lower side impact protection strip");
   mesh(`${n}/rear-cap`,plate([[s*1.70,1.65,-2.88],[s*1.70,3.64,-2.88],[s*1.92,3.54,-2.55],[s*1.92,1.65,-2.55]],.13,'navy'),"Aft corner armor");
   B(`${n}/orange-identification`,[s*2.015,2.10,.73],[.035,.13,1.70],'orange',"Orange identification stripe");
   B(`${n}/aft-maintenance-panel`,[s*2.025,2.26,-2.30],[.055,.47,.30],'frame',"Aft maintenance panel");
  }
  mesh('exterior/nose/front-inset',plate([[-.55,1.84,3.81],[.55,1.84,3.81],[.69,2.18,3.73],[-.69,2.18,3.73]],.045,'orange'),"Nose identification panel");
  B('exterior/rear/service-panel',[0,2.43,-2.855],[1.05,1.20,.09],'navy',"External life-support service cover");
  B('exterior/rear/service-inset',[0,2.44,-2.91],[.83,.96,.025],'frame',"Aft service cover inset");
  for(const x of [-.87,.87]){
   B(`exterior/rear/radiator-${x}`,[x,3.25,-2.89],[.65,.48,.13],'rubber',"Twin aft radiator panels");
   for(let i=0;i<4;i++)B(`exterior/rear/radiator-fin-${x}-${i}`,[x,3.08+i*.105,-2.97],[.58,.028,.03],'frame',"Radiator fins");
  }
  return{title:"09 · Exterior armor and service panels",text:"Ceramic-colored hull panels receive a dark impact protection belt and orange identification stripes. The aft service covers align with the interior life-support equipment.",camera:{eye:[7,4.9,-9],yaw:-142.13,pitch:16.3}};
 },
 10(){
  for(const s of [-1,1]){
   const x=s*1.04,n=`propulsion/main-engine-${s}`;
   mesh(`${n}/bell`,annular([x,0,-.10],'Y',[[.51,.57,.49],[.70,.53,.45],[1.08,.30,.225],[1.27,.26,.18]],'frame',16),"Open, hollow main engine bell");
   mesh(`${n}/mount`,cylinder([x,0,-.10],'Y',[[1.19,.33],[1.37,.33]],'navy',12),"Engine mounting ring");
   mesh(`${n}/throat`,cylinder([x,0,-.10],'Y',[[.92,.19],[1.28,.19]],'rubber',12),"Recessed nozzle throat");
   const p=`propulsion/side-pod-${s}`;
   mesh(`${p}/body`,cylinder([s*2.30,2.12,.42],'Z',[[-1.05,.27],[-.90,.40],[.90,.40],[1.12,.26]],'navy',12),"Side propellant and auxiliary systems pod");
   for(const z of [-.15,.99]){
    mesh(`${p}/support-${z}`,beam([s*1.87,2.11,z],[s*2.31,2.11,z],.20,.18,'frame'),"Pod support bracket");
    mesh(`${p}/band-${z}`,annular([s*2.30,2.12,z],'Z',[[-.045,.425,.393],[.045,.425,.393]],'orange',12),"Pod retaining band");
   }
   mesh(`propulsion/aft-tank-${s}`,cylinder([s*1.15,2.34,-3.13],'Y',[[-.62,.17],[-.52,.26],[.50,.26],[.62,.17]],'metal',12),"External reserve pressure cylinder");
   B(`propulsion/aft-tank-bracket-${s}`,[s*1.15,2.35,-2.98],[.46,.15,.25],'frame',"Aft cylinder bracket");
  }
  B('propulsion/underfloor-power-pack',[0,1.13,-1.88],[.82,.35,.92],'navy',"Underfloor power electronics and battery enclosure");
  return{title:"10 · Engines and auxiliary systems",text:"Two open-bell main engines are fitted below the floor. The side pods stop ahead of the crew entrance, keeping the door and ramp approach clear.",camera:{eye:[8,4.5,10],yaw:-38.66,pitch:10.7}};
 },
 11(){
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const n=`landing/leg-${sx}-${sz}`,mount=[sx*1.84,1.65,sz*2.05],knee=[sx*2.61,.75,sz*2.45],foot=[sx*3.10,.19,sz*2.73];
   B(`${n}/root-bracket`,mount,[.30,.28,.36],'frame',"Load-bearing landing-leg attachment");
   mesh(`${n}/upper-strut`,rod(mount,knee,.105,'navy'),"Angled, outward-splayed landing strut");
   mesh(`${n}/knee`,cylinder(knee,'Z',[[-.17,.16],[.17,.16]],'orange',10),"Landing-leg knee joint");
   mesh(`${n}/shock-absorber`,rod(knee,foot,.065,'metal'),"Lower shock absorber piston rod");
   mesh(`${n}/brace`,rod([sx*1.61,1.34,sz*1.60],[sx*2.99,.30,sz*2.67],.047,'frame'),"Diagonal support strut");
   const fp=[[-.34,-.28],[.34,-.28],[.43,-.18],[.43,.18],[.34,.28],[-.34,.28],[-.43,.18],[-.43,-.18]].map(([x,z])=>[x+foot[0],z+foot[2]]);
   E(`${n}/pad`,fp,0,.18,'navy',"Wide octagonal landing pad resting on the ground");
   B(`${n}/pad-marker`,[foot[0],.19,foot[2]],[.45,.025,.12],'orange',"Upper landing pad marking");
  }
  return{title:"11 · Four stable landing legs",text:"The bottom of each landing pad lies exactly on the y = 0 ground plane. Outward-splayed legs provide a footprint almost 7 m wide, with individual joints, shock absorbers and diagonal braces.",camera:{eye:[10,5.2,12],yaw:-39.81,pitch:13.5}};
 },
 12(){
  remove('guide/180cm-human',"Remove the scale figure after confirming the dimensions");
  remove('guide/one-metre',"Remove the one-metre scale reference");
  const x=1.97,z=-1.40;
  const door=merge(shaded(box({at:[x,2.15,z],size:[.13,1.10,1.10]}),'ceramic'),shaded(box({at:[x,3.45,z],size:[.13,.30,1.10]}),'ceramic'),...[-1,1].map(s=>shaded(box({at:[x,2.98,z+s*.465],size:[.13,.56,.17]}),'ceramic')),shaded(box({at:[x,2.98,z],size:[.035,.49,.74]}),'glass'),shaded(box({at:[x+.09,2.35,z+.32],size:[.075,.22,.07]}),'frame'),shaded(box({at:[x+.085,1.88,z],size:[.035,.10,.91]}),'orange'));
  mesh('access/pressure-door',door,"Pressure door with a separate inspection window");
  const centre=bounds(door).center,H=[x,centre[1],z-.55],a=95*Math.PI/180,d=centre.map((v,i)=>v-H[i]),after=[H[0]+Math.cos(a)*d[0]+Math.sin(a)*d[2],centre[1],H[2]-Math.sin(a)*d[0]+Math.cos(a)*d[2]];
  transform('access/pressure-door',{rotate_y:95,move:after.map((v,i)=>v-centre[i])},"Open the crew door by 95° around its aft hinge");
  B('access/threshold',[2.005,1.625,z],[.25,.09,1.13],'metal',"Crew door threshold");
  const A=[2.02,1.57,z],B0=[4.55,.23,z];
  mesh('access/ramp',beam(A,B0,.11,1.10,'navy'),"Deployed 1.10 m wide crew ramp");
  for(let i=0;i<9;i++){
   const t=(i+.5)/9,p=A.map((v,j)=>v+(B0[j]-v)*t);
   B(`access/ramp-tread-${i}`,[p[0],p[1]+.074,z],[.095,.035,.98],'metal',"Anti-slip cross tread on the crew ramp");
  }
  B('access/ramp-ground-pad',[4.67,.10,z],[.42,.20,1.24],'frame',"Lower step resting on the ground");
  for(const s of [-1,1]){
   const zz=z+s*.63;
   mesh(`access/handrail-${s}`,rod([2.06,2.39,zz],[4.48,1.13,zz],.027,'orange'),"Crew ramp handrail");
   for(const [i,t]of [[0,.10],[1,.86]]){
    const p=A.map((v,j)=>v+(B0[j]-v)*t);
    mesh(`access/handrail-post-${s}-${i}`,rod([p[0],p[1]+.06,zz],[p[0],p[1]+.81,zz],.023,'frame'),"Vertical handrail support");
   }
  }
  return{title:"12 · Opening door and crew ramp",text:"Rotate the actual door around its hinge. The 1.10 m wide ramp has anti-slip cross treads and two handrails, with its lower landing resting on the ground.",camera:{eye:[11,6,9],yaw:-50.71,pitch:16.4}};
 },
 13(){
  for(const s of [-1,1])for(const z of [-2.25,1.48]){
   const n=`propulsion/rcs-${s}-${z}`,x=s*1.93,y=z<0?3.45:3.55;
   B(`${n}/mount`,[x,y,z],[.29,.28,.31],'navy',"Small attitude-control thruster block");
   mesh(`${n}/lateral-nozzle`,annular([x,y,z],'X',[[s<0?-.31:.14,.135,.105],[s<0?-.14:.31,.09,.06]],'metal',8),"Lateral attitude-control nozzle");
   mesh(`${n}/vertical-nozzle`,annular([x,y,z],'Y',[[.12,.09,.06],[.29,.135,.105]],'metal',8),"Vertical attitude-control nozzle");
  }
  for(const s of [-1,1]){
   mesh(`exterior/nose/lamp-housing-${s}`,panel([s*.90,2.57,3.61],.32,.21,.16,.045,'rubber'),"Forward landing and work light housing");
   mesh(`exterior/nose/lamp-${s}`,panel([s*.90,2.57,3.705],.24,.13,.025,.025,'light'),"Landing light lens");
   mesh(`exterior/nav-light-${s}`,cylinder([s*1.74,3.80,-1.90],'Y',[[0,.08],[.10,.08]],s<0?'red':'light',8),"Side navigation light");
  }
  B('exterior/communications/base',[0,4.27,-1.93],[.42,.17,.42],'frame',"Communications antenna base");
  mesh('exterior/communications/mast',cylinder([0,4.35,-1.93],'Y',[[0,.035],[.53,.035],[.60,.02]],'metal',8),"Short communications mast");
  mesh('exterior/communications/head',panel([0,4.79,-1.93],.36,.20,.06,.025,'ceramic'),"Communications panel");
  mesh('exterior/nose/range-sensor',cylinder([0,2.60,3.66],'Z',[[0,.095],[.14,.095]],'rubber',10),"Central range and terrain sensor");
  return{title:"13 · Attitude control, sensors and lights",text:"Four corner blocks receive lateral and vertical attitude-control nozzles. Add two landing lights and a terrain sensor on the nose, plus a short communications antenna above.",camera:{eye:[11,6.6,13],yaw:-40.24,pitch:16.2}};
 },
 14(){
  for(const s of [-1,1]){
   const n=`shell/roof/thermal-panel-${s}`;
   B(`${n}/frame`,[s*.94,4.22,-.60],[.66,.10,1.65],'frame',"External roof thermal panel");
   B(`${n}/surface`,[s*.94,4.28,-.60],[.57,.025,1.54],'rubber',"Dark radiator surface");
   for(let i=0;i<5;i++)B(`${n}/rib-${i}`,[s*.94,4.30,-1.22+i*.31],[.55,.025,.025],'metal',"Repeated thermal panel fins");
  }
  mesh('exterior/identity/port',textMesh('LARK-4',{origin:[-2.055,2.03,-.35],right:[0,0,1],up:[0,1,0],normal:[-1,0,0],height:.16},material('ceramic')),"LARK-4 marking on the port identification stripe");
  mesh('exterior/identity/starboard',textMesh('LARK-4',{origin:[2.055,2.03,1.25],right:[0,0,-1],up:[0,1,0],normal:[1,0,0],height:.16},material('ceramic')),"LARK-4 marking on the starboard identification stripe");
  B('access/door-lamp-housing',[2.04,3.79,-1.40],[.18,.12,.42],'navy',"External crew entrance light");
  B('access/door-lamp',[2.145,3.77,-1.40],[.025,.07,.32],'warm',"Crew entrance lighting");
  for(const z of [-1.84,-1.53,-1.22,-.91])B(`access/threshold-mark-${z}`,[2.15,1.686,z],[.12,.025,.13],'orange',"Threshold warning marking");
  return{title:"14 · Finishing the exterior",text:"Fit the thermal panels, identification markings and entrance light. Cabin items remain separate objects; the roof and port-side wall can be hidden in the cutaway view.",camera:{eye:[12,7.2,14],yaw:-40.60,pitch:17.1}};
 }
};
const extension=await import('./extension.mjs');
Object.assign(stages,extension.chapters({B,E,mesh,remove,transform,beam,rod,annular,cylinder,plate,panel,convexMesh,shaded,material,color,state,palette}));
const chapter=Number(process.argv[2]);
if(!stages[chapter])throw Error(`Chapter ${chapter} is not authored yet`);
if(journal.chapters.some(c=>c.id===chapter))throw Error(`Chapter ${chapter} was already executed`);
const meta=stages[chapter]();
const pending={id:chapter,...meta,palette,commands};
writeFileSync(new URL('models/lark-4-pending.json',root),JSON.stringify(pending));
process.stdout.write(JSON.stringify({...pending,commands:commands.map(({method,args,name})=>({method,args,name}))}));

// The cargo conversion is appended to the original, executed construction log.
import {box,merge,bounds,textMesh} from '../../mcp/engine/index.js';
const look=(eye,target)=>{const d=target.map((v,i)=>v-eye[i]);return{eye,target,yaw:Math.atan2(d[0],-d[2])*180/Math.PI,pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI}};
export function chapters(A){
 const {B,E,mesh,remove,transform,beam,rod,annular,cylinder,plate,panel,convexMesh,shaded,material,color,state,palette}=A;
 return{
 15(){
  for(const n of [...state.keys()])if(n==='interior/rear-bulkhead'||n.startsWith('interior/life-support-')||n.startsWith('exterior/rear/')||n.startsWith('propulsion/aft-tank'))remove(n,"Remove the old aft closure and service equipment obstructing the passage");
  for(const n of [...state.keys()])if(n.startsWith('interior/oxygen-'))transform(n,{move:[-2.0,0,-3.60]},"Relocate the reserve cylinders into the new service module");
  const crew=[[-1.55,-2.65],[1.55,-2.65],[2.72,-3.55],[2.72,-6.65],[-2.72,-6.65],[-2.72,-3.55]];
  E('extension/structure/crew-underbody',crew,1.30,.20,'navy',"Widened lower hull beneath the crew quarters");
  E('extension/interior/crew-floor',crew,1.50,.08,'floor',"Level floor at the cabin's 1.58 m deck height");
  const hangar=[[-2.75,-6.55],[2.75,-6.55],[3.07,-6.95],[3.07,-13.55],[2.65,-13.95],[-2.65,-13.95],[-3.07,-13.55],[-3.07,-6.95]];
  E('extension/structure/hangar-underbody',hangar,1.30,.20,'navy',"Load-bearing lower hull beneath the wide cargo bay");
  E('extension/interior/hangar-floor',hangar,1.50,.08,'floor',"Continuous cargo deck to the rear door");
  for(const s of [-1,1]){
   B(`extension/structure/hangar-longeron-${s}`,[s*2.72,1.30,-10.2],[.22,.30,7.5],'frame',"Longitudinal hangar main beam");
   B(`extension/structure/crew-longeron-${s}`,[s*2.42,1.34,-4.95],[.18,.24,3.0],'frame',"Crew module lower main beam");
  }
  for(const z of [-7,-10,-13.55])B(`extension/structure/hangar-crossbeam-${z}`,[0,1.30,z],[5.6,.30,.22],'frame',"Cargo bay transverse reinforcement");
  B('extension/interior/crew-aisle',[0,1.593,-4.67],[1.10,.02,3.9],'navy',"1.10 m wide passage between the cabin and hangar");
  return{title:"15 · Aft hull and connecting passage",text:"Open the original cabin through its aft wall. The crew module and hangar continue at the same 1.58 m deck level, preserving the original seats and cockpit dimensions.",camera:look([17,12,16],[0,2.5,-4.8])};
 },
 16(){
  B('extension/interior/wetroom-crosswall',[-1.68,2.92,-4.55],[1.96,2.68,.12],'ceramic',"Partition between the washroom and galley");
  for(const [i,z,w]of [[0,-3.00,.20],[1,-4.37,.30],[2,-4.72,.23],[3,-6.20,.45]])B(`extension/interior/cutaway-partition/port-pier-${i}`,[-.66,2.91,z],[.12,2.66,w],'ceramic',"Wall piers between the two port-side room entrances");
  B('extension/interior/cutaway-partition/port-lintel',[-.66,4.02,-4.70],[.13,.46,3.45],'frame',"Common header above the washroom and galley entrances");
  B('extension/interior/cutaway-partition/bunk-wall',[.66,2.92,-5.18],[.12,2.68,2.55],'ceramic',"Partition wall for the four-berth crew room");
  B('extension/interior/cutaway-partition/bunk-lintel',[.66,4.02,-3.38],[.14,.46,1.05],'frame',"Crew-quarter entrance frame");
  B('extension/interior/cutaway-partition/wetroom-door',[-.72,2.73,-4.17],[.07,2.22,.68],'navy',"Washroom door parked beside its opening");
  B('extension/interior/cutaway-partition/wetroom-handle',[-.77,2.63,-3.93],[.035,.18,.045],'orange',"Washroom door latch");
  for(const s of [-1,1]){
   B(`extension/interior/airlock/side-${s}`,[s*1.72,2.88,-6.62],[2.08,2.60,.22],'ceramic',"Pressure bulkhead ahead of the hangar");
   B(`extension/interior/airlock/door-jamb-${s}`,[s*.70,2.70,-6.47],[.13,2.23,.16],'frame',"Passage frame with 1.27 m clear width");
  }
  B('extension/interior/airlock/header',[0,4.12,-6.62],[5.45,.66,.22],'ceramic',"Pressure-tight passage header");
  B('extension/interior/airlock/threshold',[0,1.625,-6.55],[1.45,.09,.35],'metal',"Level threshold between crew quarters and cargo bay");
  mesh('extension/interior/airlock/sliding-leaf',panel([1.57,2.73,-6.43],1.28,2.20,.10,.12,'navy'),"Pressure door slid to the side");
  B('extension/interior/airlock/sliding-stripe',[1.57,2.86,-6.365],[.85,.08,.018],'orange',"Sliding door warning stripe");
  B('extension/structure/hangar-forward-upper-wall',[0,5.01,-6.72],[5.45,1.12,.24],'ceramic',"Upper forward bulkhead of the taller hangar");
  for(const z of [-7.0,-10.15,-13.55]){
   for(const s of [-1,1]){
    B(`extension/structure/hangar-upright-${s}-${z}`,[s*2.86,3.44,z],[.18,3.70,.20],'frame',"Vertical main frame around the cargo bay");
    mesh(`extension/structure/hangar-shoulder-${s}-${z}`,beam([s*2.86,5.26,z],[s*2.32,5.83,z],.18,.20,'frame'),"Sloping upper hangar frame");
   }
   B(`extension/structure/hangar-roof-crossbar-${z}`,[0,5.82,z],[4.75,.20,.22],'frame',"Roof frame above the overhead crane");
  }
  return{title:"16 · Rooms and pressure-tight passage",text:"The central corridor serves a washroom, galley and four-berth crew room. A pressure bulkhead and a sliding door separate the hangar from the crew spaces.",camera:look([-16,14,13],[0,2.6,-6.0])};
 },
 17(){
  B('extension/interior/wetroom/toilet-pedestal',[-2.10,1.79,-4.00],[.38,.42,.47],'ceramic',"Fixed toilet pedestal");
  mesh('extension/interior/wetroom/toilet-bowl',cylinder([-2.10,0,-4.00],'Y',[[1.94,.20],[2.04,.24],[2.09,.21]],'ceramic',12),"Rounded toilet bowl");
  mesh('extension/interior/wetroom/toilet-seat',annular([-2.10,0,-4.00],'Y',[[2.055,.25,.16],[2.10,.25,.16]],'navy',12),"Open toilet seat ring");
  B('extension/interior/wetroom/cistern',[-2.10,2.19,-4.28],[.45,.47,.16],'ceramic',"Rear toilet service enclosure");
  B('extension/interior/wetroom/flush',[-2.10,2.39,-4.18],[.12,.05,.025],'metal',"Flush control");
  B('extension/interior/wetroom/basin-cabinet',[-2.10,1.99,-3.08],[.72,.78,.42],'navy',"Washbasin cabinet");
  B('extension/interior/wetroom/basin-top',[-2.10,2.41,-3.08],[.77,.06,.47],'ceramic',"Washbasin countertop");
  mesh('extension/interior/wetroom/basin',annular([-2.10,2.45,-3.08],'Y',[[0,.21,.16],[.04,.21,.16]],'metal',12),"Recessed washbasin rim");
  mesh('extension/interior/wetroom/tap',rod([-2.1,2.44,-3.23],[-2.1,2.65,-3.23],.018,'metal'),"Washbasin tap");
  B('extension/interior/wetroom/mirror',[-2.10,2.98,-2.94],[.66,.70,.035],'metal',"Mirror above the washbasin");
  B('extension/interior/wetroom/shower-tray',[-1.20,1.63,-4.05],[.82,.10,.72],'ceramic',"Separate shower tray");
  mesh('extension/interior/wetroom/shower-pipe',rod([-1.10,2.27,-4.37],[-1.10,3.61,-4.37],.023,'metal'),"Shower riser pipe");
  mesh('extension/interior/wetroom/shower-head',cylinder([-1.10,3.60,-4.22],'Y',[[0,.095],[.04,.095]],'metal',10),"Shower head");
  mesh('extension/interior/wetroom/shower-screen',plate([[-1.61,1.76,-3.67],[-1.22,1.76,-3.67],[-1.22,3.63,-3.67],[-1.61,3.63,-3.67]],.025,'glass'),"Half-width transparent splash screen");
  B('extension/interior/wetroom/drain',[-1.20,1.691,-4.05],[.12,.008,.12],'rubber',"Shower tray drain");
  B('extension/interior/galley/base',[-1.68,2.02,-6.20],[1.75,.86,.50],'navy',"Galley cabinet with storage and water treatment");
  B('extension/interior/galley/counter',[-1.68,2.48,-6.20],[1.83,.07,.57],'ceramic',"Galley countertop");
  for(const x of [-2.25,-1.68,-1.11]){
   B(`extension/interior/galley/cupboard-${x}`,[x,2.02,-5.93],[.50,.70,.035],'ceramic',"Lower galley cupboard door");
   B(`extension/interior/galley/handle-${x}`,[x,2.26,-5.90],[.19,.025,.035],'frame',"Cupboard handle");
  }
  B('extension/interior/galley/hotplate',[-1.38,2.53,-6.20],[.45,.025,.39],'rubber',"Fixed cooking and warming surface");
  mesh('extension/interior/galley/kettle',cylinder([-1.38,2.55,-6.20],'Y',[[0,.10],[.21,.10],[.24,.07]],'metal',10),"Secured water heater");
  B('extension/interior/galley/fridge',[-2.33,2.11,-5.12],[.45,1.04,.51],'ceramic',"Compact refrigerator");
  B('extension/interior/galley/fridge-handle',[-2.07,2.19,-5.12],[.04,.31,.04],'frame',"Refrigerator handle");
  B('extension/interior/galley/fold-table',[-1.35,2.31,-5.11],[.90,.075,.63],'ceramic',"Foldaway dining and work table");
  mesh('extension/interior/galley/table-brace',beam([-1.75,1.75,-5.1],[-1.35,2.25,-5.1],.08,.08,'frame'),"Diagonal table support");
  B('extension/interior/galley/bench',[-1.69,2.02,-4.79],[1.08,.20,.35],'seat',"Galley bench seat");
  return{title:"17 · Washroom, shower and galley",text:"The port-side module contains a washbasin, shower tray and toilet, followed by a galley with storage. Fixtures follow the 1.58 m deck level and retain human-scale dimensions.",camera:look([-9,10,3],[-1.3,2.6,-4.65])};
 },
 18(){
  for(const [column,x]of [[0,1.10],[1,2.05]]){
   for(const [tier,y]of [[0,1.90],[1,2.96]]){
    const n=`extension/interior/bunk-${column}-${tier}`;
    B(`${n}/frame`,[x,y,-5.15],[.79,.11,2.10],'frame',"2.10 m berth with a separate support frame");
    mesh(`${n}/mattress`,panel([x,y+.115,-5.15],.73,.15,2.01,.035,'seat'),"Mattress for one of the four bunks");
    mesh(`${n}/pillow`,panel([x,y+.23,-5.94],.52,.13,.35,.035,'ceramic'),"Pillow at the head of the berth");
    B(`${n}/headboard`,[x,y+.29,-6.20],[.80,.47,.07],'navy',"Berth headboard");
    B(`${n}/retaining-strap`,[x,y+.215,-4.81],[.06,.025,1.14],'orange',"Mattress restraint strap");
    B(`${n}/reading-lamp`,[x,y+.43,-6.13],[.23,.06,.07],'warm',"Individual reading light");
   }
   for(const side of [-1,1])B(`extension/interior/bunk-support-${column}-${side}`,[x+side*.37,2.47,-5.15],[.055,1.18,2.0],'navy',"Longitudinal bunk-bed support frame");
   for(const side of [-1,1])mesh(`extension/interior/bunk-ladder-${column}-${side}`,rod([x+side*.25,1.60,-3.96],[x+side*.25,3.00,-3.96],.022,'frame'),"Upper bunk ladder side rail");
   for(let i=0;i<4;i++)B(`extension/interior/bunk-rung-${column}-${i}`,[x,1.82+i*.30,-3.96],[.53,.04,.06],'orange',"Upper bunk ladder rung");
  }
  B('extension/interior/crew/dresser',[2.27,2.17,-3.21],[.64,1.16,.42],'ceramic',"Shared crew-quarter equipment cabinet");
  for(const y of [1.84,2.18,2.52]){
   B(`extension/interior/crew/drawer-${y}`,[2.27,y,-2.985],[.54,.28,.025],'navy',"Equipment drawer");
   B(`extension/interior/crew/drawer-handle-${y}`,[2.27,y,-2.96],[.19,.025,.035],'metal',"Drawer handle");
  }
  B('extension/interior/crew/locker-light',[2.27,3.26,-3.18],[.43,.10,.14],'light',"Crew-quarter entrance light");
  return{title:"18 · Four-berth crew quarters",text:"Build two separate bunk-bed units for four people. Each berth is 2.10 m long, with about 1 m between levels, plus a pillow, restraint strap, reading light and ladder.",camera:look([10,10,2],[1.4,2.8,-4.8])};
 },
 19(){
  for(const s of [-1,1]){
   B(`hangar/crane/rail-${s}`,[s*2.13,5.61,-10.22],[.16,.16,6.42],'frame',"Two longitudinal overhead crane rails");
   for(const z of [-7.20,-13.22])B(`hangar/crane/rail-stop-${s}-${z}`,[s*2.13,5.58,z],[.26,.26,.20],'orange',"Crane travel end stop");
  }
  B('hangar/crane/bridge',[0,5.49,-10.20],[4.28,.20,.23],'navy',"Longitudinally traveling crane bridge");
  B('hangar/crane/trolley',[-.30,5.31,-10.20],[.47,.24,.45],'orange',"Cross-travel hoist trolley");
  mesh('hangar/crane/cable',rod([-.30,2.87,-10.20],[-.30,5.17,-10.20],.018,'metal'),"Lowered hoist cable");
  mesh('hangar/crane/hook',annular([-.30,2.77,-10.20],'Z',[[-.045,.105,.067],[.045,.105,.067]],'orange',12),"Closed lifting-hook attachment ring");
  B('hangar/cargo/crate',[-.30,2.02,-10.20],[.80,.88,.95],'ceramic',"Cargo crate used in the loading demonstration");
  B('hangar/cargo/lid',[-.30,2.49,-10.20],[.86,.08,1.00],'frame',"Cargo crate lid");
  for(const s of [-1,1])B(`hangar/cargo/strap-${s}`,[-.30+s*.25,2.02,-10.20],[.055,.90,.98],'orange',"Cargo crate retaining strap");
  for(const sx of [-1,1])for(const sz of [-1,1])mesh(`hangar/slings/${sx}-${sz}`,rod([-.30+sx*.31,2.54,-10.20+sz*.37],[-.30,2.74,-10.20],.014,'frame'),"Temporary four-point lifting sling");
  const payload=[...state.keys()].filter(n=>n.startsWith('hangar/cargo/')||n.startsWith('hangar/slings/')||n==='hangar/crane/hook');
  for(const n of payload)transform(n,{move:[0,.65,0]},"Lift the cargo by 65 cm");
  transform('hangar/crane/cable',{scale:[1,1.65/2.30,1],move:[0,.325,0]},"Shorten the cable as the cargo rises");
  for(const n of [...payload,'hangar/crane/cable','hangar/crane/trolley'])transform(n,{move:[-1.80,0,-1.50]},"Move the cargo to the aft port-side securing area");
  transform('hangar/crane/bridge',{move:[0,0,-1.50]},"Move the crane bridge along its rails");
  for(const n of payload)transform(n,{move:[0,-.65,0]},"Lower the crate onto the deck");
  transform('hangar/crane/cable',{scale:[1,2.30/1.65,1],move:[0,-.325,0]},"Extend the cable while lowering the load");
  for(const n of [...state.keys()].filter(n=>n.startsWith('hangar/slings/')))remove(n,"Detach the lifting slings from the grounded crate");
  transform('hangar/crane/hook',{move:[0,2.19,0]},"Retract the unloaded hook beneath the crane");
  transform('hangar/crane/cable',{scale:[1,.11/2.30,1],move:[0,1.095,0]},"Retract the hoist cable to its stowed position");
  B('hangar/workshop/bench-base',[-2.40,2.03,-8.25],[.54,.90,1.36],'navy',"Workshop bench cabinet beside the cargo lane");
  B('hangar/workshop/bench-top',[-2.40,2.52,-8.25],[.66,.09,1.48],'metal',"Wear-resistant workbench top");
  B('hangar/workshop/vice',[-2.25,2.65,-8.12],[.23,.20,.30],'frame',"Bench vise");
  B('hangar/workshop/tool-board',[-2.73,3.07,-8.25],[.07,.83,1.47],'navy',"Tool board above the workbench");
  for(let i=0;i<4;i++)B(`hangar/workshop/tool-${i}`,[-2.67,3.09,-8.75+i*.31],[.045,.39,.06],'orange',"Secured workshop tool");
  for(const x of [-1.56,2.52])B(`hangar/floor/lane-${x}`,[x,1.595,-10.25],[.06,.015,6.35],'orange',"Two floor markings for the central cargo lane");
  for(const x of [-2.24,2.60])for(const z of [-7.6,-9.4,-11.2,-13.0])mesh(`hangar/floor/tie-down-${x}-${z}`,annular([x,1.606,z],'Y',[[0,.065,.035],[.025,.065,.035]],'metal',8),"Recessed cargo tie-down ring");
  return{title:"19 · Overhead crane and cargo handling",text:"The recorded construction sequence lifts the crate, moves it sideways and aft, then lowers it onto the securing area. The hook and cable retract afterward, leaving the central cargo lane clear.",camera:look([-16,16,-22],[0,3,-10.2])};
 },
 20(){
  for(const s of [-1,1]){
   const x=s*3.78,n=`extension/propulsion/cruise-${s}`,at=[x,3.10,-10.70];
   for(const z of [-8.30,-12.65])mesh(`${n}/pylon-${z}`,beam([s*2.78,3.35,z],[x,3.35,z],.40,.48,'frame'),"Reinforced main engine pod attachment");
   mesh(`${n}/casing`,cylinder(at,'Z',[[-4.08,.61],[-3.45,.97],[-2.70,1.06],[1.85,1.06],[2.75,.87]],'ceramic',16),"Main engine casing, approximately two metres in diameter");
   mesh(`${n}/nozzle`,annular(at,'Z',[[-6.0,1.01,.88],[-5.68,.98,.85],[-4.90,.70,.57],[-4.07,.52,.40]],'frame',16),"Large aft-facing thrust nozzle");
   mesh(`${n}/exhaust-lip`,annular(at,'Z',[[-6.08,1.06,.90],[-5.95,1.06,.90]],'navy',16),"Separate exhaust lip ring");
   mesh(`${n}/intake`,annular(at,'Z',[[2.70,.88,.69],[3.03,.91,.72],[3.22,.84,.66]],'navy',16),"Forward air intake and protection ring");
   mesh(`${n}/intake-hub`,cylinder(at,'Z',[[2.84,.19],[3.20,.19]],'frame',10),"Central intake protection hub");
   for(const u of [-2.80,.10,2.08])mesh(`${n}/band-${u}`,annular(at,'Z',[[u-.065,1.087,1.035],[u+.065,1.087,1.035]],'orange',16),"Repeated main engine retaining band");
   const fan=[];for(let i=0;i<6;i++){const a=i*Math.PI/3;fan.push(rod([x+.20*Math.cos(a),3.10+.20*Math.sin(a),-7.48],[x+.67*Math.cos(a),3.10+.67*Math.sin(a),-7.48],.025,'metal',6))}
   mesh(`${n}/intake-spokes`,merge(...fan),"Six-spoke intake protection grille");
  }
  return{title:"20 · Large main engine pods",text:"Build two long side-mounted engine pods, approximately 2.1 m in diameter, with open aft nozzles. They leave the central hangar door and cargo ramp approach unobstructed.",camera:look([20,12,-26],[0,3.3,-9])};
 },
 21(){
  for(const n of [...state.keys()])if(n.startsWith('propulsion/main-engine-'))remove(n,"Remove the original small landing engines");
  for(const s of [-1,1])for(const z of [-4.90,-11.50]){
   const n=`extension/propulsion/lift-${s}-${z}`,at=[s*1.70,0,z];
   mesh(`${n}/bell`,annular(at,'Y',[[.43,.82,.71],[.65,.76,.65],[1.12,.41,.30],[1.35,.34,.24]],'frame',16),"Enlarged vertical landing-engine bell");
   mesh(`${n}/mount`,cylinder(at,'Y',[[1.22,.45],[1.44,.45]],'navy',12),"Load-spreading engine mount");
   mesh(`${n}/throat`,cylinder(at,'Y',[[1.02,.24],[1.38,.24]],'rubber',12),"Inner nozzle throat");
   for(const dx of [-.33,.33])mesh(`${n}/brace-${dx}`,beam([at[0]+dx,1.18,z],[at[0]+dx*1.6,1.40,z],.08,.15,'frame'),"Diagonal engine mounting brace");
  }
  for(const s of [-1,1]){
   const n=`extension/landing/aft-leg-${s}`,root=[s*2.86,2.00,-12.57],knee=[s*3.82,.88,-13.16],foot=[s*4.72,.21,-13.73];
   B(`${n}/root`,root,[.42,.40,.50],'frame',"Aft landing support attachment for the extended hull");
   mesh(`${n}/upper`,rod(root,knee,.15,'navy'),"Aft landing-leg upper strut");
   mesh(`${n}/joint`,cylinder(knee,'Z',[[-.22,.23],[.22,.23]],'orange',12),"Enlarged aft landing-leg knee joint");
   mesh(`${n}/damper`,rod(knee,foot,.10,'metal'),"Aft shock absorber piston rod");
   mesh(`${n}/brace`,rod([s*2.55,1.40,-11.80],[s*4.62,.35,-13.67],.07,'frame'),"Aft landing-leg diagonal brace");
   const fp=[[-.47,-.35],[.47,-.35],[.58,-.20],[.58,.20],[.47,.35],[-.47,.35],[-.58,.20],[-.58,-.20]].map(([x,z])=>[foot[0]+x,foot[2]+z]);
   E(`${n}/pad`,fp,0,.20,'navy',"Enlarged aft landing pad resting on the ground");
   B(`${n}/mark`,[foot[0],.215,foot[2]],[.65,.035,.15],'orange',"Aft landing pad marking");
  }
  return{title:"21 · Four lift engines and aft landing supports",text:"Replace the original small engine pair with four larger vertical nozzles. Two additional aft landing legs support the extended cargo hull on the ground.",camera:look([20,11,18],[0,2.8,-6.7])};
 },
 22(){
  for(const s of [-1,1]){
   B(`hangar/gate/jamb-${s}`,[s*2.49,3.65,-13.94],[.22,4.14,.28],'frame',"Cargo door jamb with over 4.6 m clear opening");
   const name=`hangar/gate/leaf-${s}`,m=merge(panel([s*1.20,3.62,-14.08],2.38,4.08,.16,.13,'ceramic'),shaded(box({at:[s*1.20,2.04,-14.18],size:[2.13,.14,.035]}),'orange'),shaded(box({at:[s*1.20,4.80,-14.18],size:[1.73,.08,.025]}),'navy'));
   mesh(name,m,"Separate cargo door leaf");
   const c=bounds(m).center,H=[s*2.40,c[1],-14.08],a=-s*Math.PI/2,d=c.map((v,i)=>v-H[i]),next=[H[0]+Math.cos(a)*d[0]+Math.sin(a)*d[2],c[1],H[2]-Math.sin(a)*d[0]+Math.cos(a)*d[2]];
   transform(name,{rotate_y:-s*90,move:next.map((v,i)=>v-c[i])},"Swing the cargo door leaf open around its hinge");
  }
  B('hangar/gate/header',[0,5.82,-13.94],[5.22,.24,.31],'frame',"Cargo door header beam");
  B('hangar/gate/threshold',[0,1.60,-13.98],[4.92,.12,.34],'metal',"Low cargo threshold");
  const A0=[0,1.515,-14.10],B0=[0,.15,-20.0];
  mesh('hangar/ramp/deck',beam(A0,B0,.13,4.50,'navy'),"4.5 m wide cargo ramp with an approximately 13° slope");
  for(let i=0;i<14;i++){
   const t=(i+.5)/14,p=A0.map((v,j)=>v+(B0[j]-v)*t);
   B(`hangar/ramp/tread-${i}`,[0,p[1]+.075,p[2]],[4.34,.025,.075],'metal',"Anti-slip tread suitable for cargo wheels");
  }
  for(const s of [-1,1])mesh(`hangar/ramp/edge-${s}`,beam([s*2.30,1.71,-14.10],[s*2.30,.35,-19.94],.045,.045,'orange'),"Low cargo ramp edge marker");
  B('hangar/ramp/ground-pad',[0,.10,-20.18],[4.80,.20,.46],'frame',"Cargo ramp ground landing plate");
  for(const s of [-1,1]){
   B(`hangar/gate/lamp-housing-${s}`,[s*1.88,5.66,-14.12],[.44,.13,.22],'navy',"Cargo door work light");
   B(`hangar/gate/lamp-${s}`,[s*1.88,5.61,-14.25],[.33,.07,.035],'warm',"Cargo ramp lighting");
  }
  return{title:"22 · Opening cargo doors and wide ramp",text:"Two separate cargo door leaves rotate around their hinges. The opening provides approximately 4.6 m clear width and connects to a 4.5 m wide, gently sloping ramp that rests on the ground.",camera:look([20,12,-29],[0,3,-11.8])};
 },
 23(){
  for(const s of [-1,1]){
   const side=s<0?'port':'starboard',x=s*2.80,n=`extension/shell/crew-${side}`;
   B(`${n}/lower`,[x,2.31,-4.99],[.18,1.46,3.18],'ceramic',"Lower exterior crew-quarter wall panel");
   B(`${n}/upper`,[x,3.88,-4.99],[.18,.34,3.18],'ceramic',"Crew module upper window band");
   for(const z of [-3.46,-4.98,-6.50])B(`${n}/pier-${z}`,[x,3.38,z],[.20,.72,.13],'frame',"Structural post between crew-quarter windows");
   for(const z of [-4.22,-5.74])mesh(`${n}/window-${z}`,plate([[x,3.05,z-.68],[x,3.05,z+.68],[x,3.71,z+.68],[x,3.71,z-.68]],.035,'glass'),"Transparent crew-quarter window — alpha 0.1");
   mesh(`${n}/forward-transition`,plate([[s*1.88,1.58,-2.63],[s*2.80,1.58,-3.40],[s*2.80,4.04,-3.40],[s*1.88,3.67,-2.63]],.16,'ceramic'),"Transition from the original cabin to the wider crew module");
   mesh(`extension/shell/crew-roof/shoulder-${side}`,plate([[x,4.01,-6.54],[x,4.01,-3.41],[s*2.39,4.55,-3.41],[s*2.39,4.55,-6.54]],.15,'ceramic'),"Sloping crew-quarter roof shoulder");
   const hx=s*3.08,hn=`extension/shell/hangar-${side}`;
   B(`${hn}/lower`,[hx,2.91,-10.23],[.18,2.66,6.70],'ceramic',"Cargo bay exterior pressure wall");
   B(`${hn}/upper`,[hx,4.90,-10.23],[.18,.20,6.70],'navy',"Upper hangar window trim");
   for(const z of [-6.96,-10.23,-13.50])B(`${hn}/pier-${z}`,[hx,4.53,z],[.20,.56,.15],'frame',"Upper hangar observation-window post");
   for(const z of [-8.58,-11.86])mesh(`${hn}/window-${z}`,plate([[hx,4.26,z-1.48],[hx,4.26,z+1.48],[hx,4.79,z+1.48],[hx,4.79,z-1.48]],.035,'glass'),"Hangar observation window above the engines");
   mesh(`extension/shell/hangar-roof/shoulder-${side}`,plate([[hx,4.98,-13.65],[hx,4.98,-6.99],[s*2.32,5.88,-6.99],[s*2.32,5.88,-13.65]],.16,'ceramic'),"Sloping upper hangar side panel");
   mesh(`${hn}/rear-chamfer`,plate([[hx,1.60,-13.54],[s*2.54,1.60,-13.95],[s*2.54,5.53,-13.95],[hx,4.98,-13.54]],.16,'ceramic'),"Chamfered aft corner beside the cargo door");
  }
  B('extension/shell/crew-roof/main',[0,4.56,-4.98],[4.80,.18,3.25],'ceramic',"Removable crew-quarter roof panel");
  mesh('extension/shell/crew-roof/forward-transition',plate([[-1.66,4.10,-2.72],[1.66,4.10,-2.72],[2.39,4.55,-3.42],[-2.39,4.55,-3.42]],.15,'ceramic'),"Gradual transition to the higher cabin roof");
  B('extension/shell/hangar-roof/main',[0,5.90,-10.35],[4.68,.18,6.98],'ceramic',"Separate hangar roof above the crane");
  mesh('extension/shell/hangar-roof/forward-transition',plate([[-2.39,4.55,-6.56],[2.39,4.55,-6.56],[2.32,5.88,-7.04],[-2.32,5.88,-7.04]],.16,'navy'),"Transition between the lower crew module and taller hangar");
  for(const z of [-4.2,-5.7]){
   B(`extension/shell/crew-roof/light-housing-${z}`,[0,4.43,z],[.58,.10,.22],'navy',"Crew-quarter ceiling light housing");
   B(`extension/shell/crew-roof/light-${z}`,[0,4.365,z],[.47,.025,.15],'warm',"Warm-white crew-quarter lighting");
  }
  for(const x of [-1.25,1.25])for(const z of [-8.2,-11.7]){
   B(`extension/shell/hangar-roof/light-housing-${x}-${z}`,[x,5.73,z],[.27,.10,.96],'navy',"Overhead hangar work light");
   B(`extension/shell/hangar-roof/light-${x}-${z}`,[x,5.665,z],[.19,.025,.82],'light',"Cargo bay work lighting");
  }
  return{title:"23 · Crew module and hangar exterior",text:"Separate hull panels enclose the extension. The roofs and port-side panels can be removed in cutaway view; the observation windows retain alpha 0.1.",camera:look([24,16,21],[0,3,-6.3])};
 },
 24(){
  for(const s of [-1,1]){
   const n=`aero/main-wing-${s}`;
   const p=[[s*2.95,2.20,-7.60],[s*2.95,2.44,-9.20],[s*2.95,2.20,-12.80],[s*2.95,2.02,-9.20],[s*7.40,2.72,-10.90],[s*7.40,2.87,-11.85],[s*7.40,2.72,-13.90],[s*7.40,2.61,-11.85]];
   const f=[[0,1,2,3],[4,7,6,5]];for(let i=0;i<4;i++){const j=(i+1)%4;f.push([i,j,j+4],[i,j+4,i+4])}
   mesh(`${n}/airfoil`,convexMesh(p,f,'ceramic'),"Swept, tapered wing with slight dihedral");
   mesh(`${n}/leading-edge`,rod([s*3.03,2.21,-7.69],[s*7.32,2.72,-10.95],.048,'frame'),"Main wing leading-edge protection");
   mesh(`${n}/inboard-flap`,plate([[s*3.48,2.27,-12.98],[s*5.36,2.49,-13.44],[s*5.36,2.34,-14.06],[s*3.48,2.12,-13.60]],.085,'navy'),"Separate inboard flap, slightly lowered");
   mesh(`${n}/outboard-aileron`,plate([[s*5.52,2.52,-13.48],[s*7.20,2.72,-13.89],[s*7.20,2.64,-14.36],[s*5.52,2.44,-13.95]],.075,'navy'),"Separate outboard aileron");
   mesh(`${n}/flap-hinge`,rod([s*3.50,2.29,-12.95],[s*5.36,2.51,-13.41],.032,'metal'),"Separate flap hinge shaft");
   mesh(`${n}/aileron-hinge`,rod([s*5.53,2.54,-13.45],[s*7.19,2.74,-13.86],.029,'metal'),"Separate aileron hinge shaft");
   mesh(`${n}/flap-actuator`,rod([s*4.25,2.15,-12.60],[s*4.25,2.21,-13.55],.036,'frame'),"Flap actuator rod");
   B(`${n}/tip-marker`,[s*7.32,2.77,-13.53],[.13,.06,.48],'orange',"Wingtip warning marking");
   mesh(`${n}/navigation-light`,cylinder([s*7.39,2.76,-12.16],'Y',[[0,.075],[.10,.075]],s<0?'red':'light',8),"Wingtip navigation light");
  }
  return{title:"24 · Wings, ailerons and flaps",text:"The swept main wing spans approximately 14.8 m, with a thicker root, thinner tip and slight dihedral. Inboard flaps and outboard ailerons are separate bodies with their own hinge shafts.",camera:look([25,18,20],[0,3,-7.5])};
 },
 25(){
  for(const s of [-1,1]){
   const n=`aero/tail-${s}`,fx=y=>s*(2.55+.283*(y-5.60));
   const p=[[fx(5.60),5.60,-10.70],[fx(8.60),8.60,-12.20],[fx(8.30),8.30,-13.70],[fx(5.60),5.60,-14.10]];
   mesh(`${n}/vertical-fin`,plate(p,.16,'ceramic'),"Outward-canted twin vertical stabilizer");
   const rz=y=>-14.1+(y-5.60)*.4/2.7;
   mesh(`${n}/rudder`,plate([[fx(5.80),5.80,rz(5.80)-.07],[fx(8.10),8.10,rz(8.10)-.07],[fx(8.10),8.10,rz(8.10)-.49],[fx(5.80),5.80,rz(5.80)-.49]],.10,'navy'),"Separate rudder on the vertical stabilizer");
   mesh(`${n}/rudder-hinge`,rod([fx(5.80),5.80,rz(5.80)-.025],[fx(8.10),8.10,rz(8.10)-.025],.033,'metal'),"Rudder hinge shaft");
   mesh(`${n}/horizontal-stabilizer`,plate([[s*2.40,6.04,-13.55],[s*5.15,6.13,-14.15],[s*5.15,6.13,-15.60],[s*2.40,6.04,-15.45]],.14,'ceramic'),"Horizontal stabilizer above the cargo door");
   mesh(`${n}/elevator`,plate([[s*2.42,6.02,-15.51],[s*5.12,6.11,-15.66],[s*5.12,6.02,-16.15],[s*2.42,5.93,-16.00]],.075,'navy'),"Separate elevator control surface");
   mesh(`${n}/elevator-hinge`,rod([s*2.43,6.045,-15.48],[s*5.11,6.135,-15.63],.028,'metal'),"Elevator hinge shaft");
   mesh(`${n}/tip-cap`,beam([fx(8.53),8.53,-12.26],[fx(8.27),8.27,-13.67],.10,.12,'orange'),"Colored vertical stabilizer tip protection");
  }
  B('aero/tail-crossmember',[0,5.98,-13.90],[5.05,.18,.28],'frame',"Horizontal stabilizer crossmember above the cargo door");
  for(const s of [-1,1]){
   B(`extension/shell/hangar-roof/thermal-frame-${s}`,[s*.98,6.04,-9.74],[1.12,.12,3.18],'frame',"Larger aft thermal panel");
   B(`extension/shell/hangar-roof/thermal-surface-${s}`,[s*.98,6.12,-9.74],[1.00,.035,3.04],'rubber',"Dark thermal panel surface");
   for(let i=0;i<6;i++)B(`extension/shell/hangar-roof/thermal-rib-${s}-${i}`,[s*.98,6.15,-11.02+i*.51],[.98,.025,.035],'metal',"Repeated rear thermal panel fin");
  }
  return{title:"25 · Twin tail fins and elevators",text:"Fit two outward-canted vertical stabilizers with separate rudders. Horizontal stabilizers attach above the hangar door, keeping the rear loading route open.",camera:look([24,17,-29],[0,4,-10.0])};
 },
 26(){
  for(const s of [-1,1]){
   const side=s<0?'port':'starboard';
   B(`extension/shell/crew-${side}/stripe`,[s*2.91,2.68,-4.97],[.035,.25,2.55],'orange',"Side identification stripe for the cargo variant");
   mesh(`extension/shell/crew-${side}/identity`,textMesh('LARK-4C',{origin:[s*2.94,2.58,s<0?-5.93:-4.02],right:[0,0,s<0?1:-1],up:[0,1,0],normal:[s,0,0],height:.18},material('ceramic')),"LARK-4C marking on the crew module");
   const n=`extension/propulsion/aft-rcs-${s}`,x=s*3.13,y=5.13,z=-12.72;
   B(`${n}/mount`,[x,y,z],[.32,.28,.34],'navy',"Aft attitude-control thruster block");
   mesh(`${n}/side`,annular([x,y,z],'X',[[s<0?-.32:.15,.14,.11],[s<0?-.15:.32,.10,.07]],'metal',8),"Aft lateral thruster nozzle");
   mesh(`${n}/up`,annular([x,y,z],'Y',[[.13,.09,.06],[.31,.14,.11]],'metal',8),"Aft vertical attitude-control nozzle");
   mesh(`${n}/aft`,annular([x,y,z],'Z',[[-.32,.14,.11],[-.15,.09,.06]],'metal',8),"Small aft-facing maneuvering nozzle");
  }
  mesh('hangar/gate/identity',textMesh('CARGO',{origin:[.62,5.73,-14.115],right:[-1,0,0],up:[0,1,0],normal:[0,0,-1],height:.15},material('orange')),"External cargo door sign");
  for(const [word,z]of [['WC',-3.35],['GALLEY',-5.10]])mesh(`extension/interior/cutaway-partition/label-${word}`,textMesh(word,{origin:[-.57,3.96,z],right:[0,0,-1],up:[0,1,0],normal:[1,0,0],height:.11},material('orange')),"Room identification sign facing the corridor");
  mesh('extension/interior/cutaway-partition/label-CREW',textMesh('CREW',{origin:[.57,3.96,-3.69],right:[0,0,1],up:[0,1,0],normal:[-1,0,0],height:.11},material('orange')),"Crew-quarter identification sign");
  mesh('extension/interior/airlock/label',textMesh('HANGAR',{origin:[-.45,3.96,-6.47],right:[1,0,0],up:[0,1,0],normal:[0,0,1],height:.15},material('orange')),"Hangar passage sign");
  B('hangar/workshop/crane-console-body',[-2.51,3.00,-7.52],[.23,.48,.44],'navy',"Local overhead crane control console");
  B('hangar/workshop/crane-console-screen',[-2.37,3.09,-7.52],[.035,.21,.30],'screen',"Crane control display");
  B('hangar/workshop/crane-console-indicator',[-2.343,3.09,-7.52],[.012,.10,.18],'light',"Crane controller status indicator");
  B('hangar/workshop/crane-emergency-stop',[-2.34,2.89,-7.42],[.04,.08,.08],'red',"Crane emergency stop switch");
  B('hangar/floor/front-stop-line',[.46,1.60,-7.40],[4.0,.02,.075],'orange',"Forward stopping line for the cargo vehicle");
  B('extension/shell/hangar-roof/sensor-base',[0,6.07,-12.43],[.38,.16,.38],'navy',"Aft docking and terrain sensor base");
  mesh('extension/shell/hangar-roof/sensor-head',cylinder([0,6.15,-12.43],'Y',[[0,.16],[.23,.16],[.32,.07]],'metal',10),"Rear maneuvering sensor");
  return{title:"26 · Cargo variant final inspection",text:"Complete LARK-4C with room signs, a crane control console and aft maneuvering thrusters. Inspect the hangar and crew quarters in dedicated views; the extension remains part of the original construction tutorial.",camera:look([27,19,24],[0,3.8,-7.0])};
 }
 };
}

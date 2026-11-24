import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  box, merge, instantiate, validate, faceNormal, triangulate, orbit, renderView,
} from '../mcp/engine/index.js';
import { characterScene, inspectionScene } from '../models/modular-characters/compose.mjs';

const output=new URL('../models/modular-characters/',import.meta.url);
const reference=JSON.parse(readFileSync(new URL('../models/betterman.scene.json',import.meta.url)));
const referenceY=reference.objects.flatMap(o=>o.mesh.positions.map(p=>p[1]));
const referenceHeight=Math.max(...referenceY)-Math.min(...referenceY);
const headFront=.14, faceLift=.002;
const bodyShapes={
  straight:{shoulder:.22,waist:.17,hip:.18,leg:.104},
  tapered:{shoulder:.205,waist:.135,hip:.19,leg:.108},
  sturdy:{shoulder:.255,waist:.205,hip:.20,leg:.114},
  slender:{shoulder:.185,waist:.125,hip:.19,leg:.108,chest:.183},
  curved:{shoulder:.205,waist:.15,hip:.23,leg:.132,chest:.208},
  thin:{shoulder:.17,waist:.105,hip:.14,leg:.08,depth:.085,limb:.75},
  fat:{shoulder:.245,waist:.30,hip:.27,leg:.15,chest:.27,depth:.185,limb:1.2},
  'robot-light':{shoulder:.18,waist:.095,hip:.14,leg:.10,depth:.10,limb:.78,robot:true},
  'robot-heavy':{shoulder:.27,waist:.19,hip:.21,leg:.135,depth:.15,limb:1.2,robot:true},
  'robot-service':{shoulder:.22,waist:.14,hip:.18,leg:.11,depth:.13,robot:true},
};
const headShapes={
  block:{width:.15,outline:[[-.15,1.58],[.15,1.58],[.15,1.91],[-.15,1.91]]},
  'cut-jaw':{width:.15,outline:[[-.085,1.58],[.085,1.58],[.15,1.67],[.15,1.91],[-.15,1.91],[-.15,1.67]]},
  long:{width:.132,outline:[[-.073,1.55],[.073,1.55],[.132,1.65],[.132,1.91],[-.132,1.91],[-.132,1.65]]},
  broad:{width:.173,outline:[[-.128,1.59],[.128,1.59],[.173,1.66],[.173,1.91],[-.173,1.91],[-.173,1.66]]},
  'soft-jaw':{width:.14,outline:[[-.065,1.58],[.065,1.58],[.14,1.69],[.14,1.91],[-.14,1.91],[-.14,1.69]]},
  'robot-box':{width:.17,robot:true,outline:[[-.145,1.58],[.145,1.58],[.17,1.62],[.17,1.91],[-.17,1.91],[-.17,1.62]]},
  'robot-visor':{width:.18,robot:true,outline:[[-.13,1.58],[.13,1.58],[.18,1.70],[.18,1.91],[-.18,1.91],[-.18,1.70]]},
  'robot-optic':{width:.13,robot:true,outline:[[-.10,1.58],[.10,1.58],[.13,1.65],[.13,1.91],[-.13,1.91],[-.13,1.65]]},
};
export const OPTIONS={
  body:[['straight','Straight'],['tapered','Tapered'],['sturdy','Sturdy'],['slender','Slender / shaped waist'],['curved','Curved / wider hips'],['thin','Thin / narrow frame'],['fat','Fat / fuller build'],['robot-light','Robot / light frame'],['robot-heavy','Robot / heavy frame'],['robot-service','Robot / service frame']],
  head:[['block','Box / uncut'],['cut-jaw','Cut jaw'],['long','Long jaw'],['broad','Broad jaw'],['soft-jaw','Narrow / soft jaw'],['robot-box','Robot / box casing'],['robot-visor','Robot / visor casing'],['robot-optic','Robot / compact optic']],
  face:[['neutral','Neutral'],['smile','Small smile'],['focused','Focused'],['lined','Mature / lined'],['led-pair','Robot / twin LEDs'],['scanner','Robot / scanner strip'],['mono-eye','Robot / single optic']],
  hair:[['bald','None'],['crop','Crop'],['sweep','Side sweep'],['bob','Polygon bob'],['long','Long panels'],['spikes','Triangle spikes'],['bun','Angular bun'],['antenna','Single antenna'],['aerials','Twin aerials']],
  top:[['tee','T-shirt'],['shirt','Open-collar shirt'],['jacket','Short jacket'],['vest','Vest'],['coat','Lab coat'],['workwear','Workwear / bib'],['shell','Robot / service shell'],['armour','Robot / reinforced shell'],['open-frame','Robot / open chassis']],
  bottom:[['straight','Straight trousers'],['tapered','Tapered trousers'],['cargo','Cargo trousers'],['skirt','A-line skirt'],['actuators','Robot / actuator legs'],['armoured-legs','Robot / armoured legs']],
  shoes:[['formal','Plain shoes'],['trainers','Trainers'],['boots','Work boots'],['magnetic','Robot / magnetic feet'],['split-foot','Robot / split toes']],
  accessory:[['none','None'],['glasses','Glasses'],['headset','Headset'],['beard','Flat beard'],['visor','Visor']],
  skin:[['mc-skin-1','Porcelain'],['mc-skin-2','Sand'],['mc-skin-3','Honey'],['mc-skin-4','Copper'],['mc-skin-5','Umber'],['mc-skin-6','Deep brown'],['mc-skin-7','Ebony']],
  hairColor:[['mc-hair-ink','Ink'],['mc-hair-brown','Brown'],['mc-hair-auburn','Auburn'],['mc-hair-blond','Blond'],['mc-hair-grey','Grey'],['mc-hair-white','White']],
  outfit:[['dock','Dockside'],['command','Command'],['lab','Laboratory'],['field','Fieldwork'],['plum','Plum / cream'],['street','Street / denim'],['robot-ivory','Robot / ivory & teal'],['robot-industrial','Robot / safety yellow'],['robot-carbon','Robot / carbon & cyan'],['robot-copper','Robot / copper & green']],
};
export const EXAMPLES=[
  {id:'dockhand',name:'Dockhand',spec:{body:'sturdy',head:'cut-jaw',hair:'crop',face:'focused',top:'workwear',bottom:'cargo',shoes:'boots',accessory:'headset',skin:'mc-skin-4',hairColor:'mc-hair-brown',outfit:'dock'}},
  {id:'navigator',name:'Navigator',spec:{body:'tapered',head:'block',hair:'sweep',face:'neutral',top:'jacket',bottom:'straight',shoes:'formal',accessory:'glasses',skin:'mc-skin-2',hairColor:'mc-hair-ink',outfit:'command'}},
  {id:'researcher',name:'Researcher',spec:{body:'straight',head:'long',hair:'bob',face:'smile',top:'coat',bottom:'tapered',shoes:'trainers',accessory:'glasses',skin:'mc-skin-5',hairColor:'mc-hair-auburn',outfit:'lab'}},
  {id:'host',name:'Canteen host',spec:{body:'tapered',head:'cut-jaw',hair:'bun',face:'smile',top:'vest',bottom:'skirt',shoes:'formal',accessory:'none',skin:'mc-skin-3',hairColor:'mc-hair-ink',outfit:'plum'}},
  {id:'field-tech',name:'Field technician',spec:{body:'sturdy',head:'broad',hair:'spikes',face:'focused',top:'tee',bottom:'cargo',shoes:'boots',accessory:'headset',skin:'mc-skin-6',hairColor:'mc-hair-grey',outfit:'field'}},
  {id:'resident',name:'Station resident',spec:{body:'straight',head:'block',hair:'long',face:'neutral',top:'shirt',bottom:'tapered',shoes:'trainers',accessory:'none',skin:'mc-skin-2',hairColor:'mc-hair-blond',outfit:'street'}},
  {id:'mechanic',name:'Senior mechanic',spec:{body:'tapered',head:'broad',hair:'crop',face:'lined',top:'workwear',bottom:'straight',shoes:'boots',accessory:'beard',skin:'mc-skin-3',hairColor:'mc-hair-grey',outfit:'dock'}},
  {id:'mission-lead',name:'Mission lead',spec:{body:'straight',head:'cut-jaw',hair:'sweep',face:'focused',top:'jacket',bottom:'straight',shoes:'formal',accessory:'visor',skin:'mc-skin-7',hairColor:'mc-hair-white',outfit:'command'}},
  {id:'woman-commander',name:'Mission commander',presentation:'woman',spec:{body:'slender',head:'soft-jaw',hair:'crop',face:'focused',top:'jacket',bottom:'straight',shoes:'formal',accessory:'none',skin:'mc-skin-5',hairColor:'mc-hair-grey',outfit:'command'}},
  {id:'woman-engineer',name:'Systems engineer',presentation:'woman',spec:{body:'sturdy',head:'cut-jaw',hair:'bun',face:'neutral',top:'workwear',bottom:'cargo',shoes:'boots',accessory:'headset',skin:'mc-skin-3',hairColor:'mc-hair-ink',outfit:'dock'}},
  {id:'woman-medic',name:'Station medic',presentation:'woman',spec:{body:'curved',head:'soft-jaw',hair:'bob',face:'smile',top:'coat',bottom:'tapered',shoes:'trainers',accessory:'glasses',skin:'mc-skin-6',hairColor:'mc-hair-brown',outfit:'lab'}},
  {id:'woman-resident',name:'Senior resident',presentation:'woman',spec:{body:'curved',head:'long',hair:'long',face:'lined',top:'shirt',bottom:'skirt',shoes:'formal',accessory:'none',skin:'mc-skin-2',hairColor:'mc-hair-white',outfit:'street'}},
  {id:'thin-technician',name:'Thin technician',spec:{body:'thin',head:'cut-jaw',hair:'crop',face:'neutral',top:'tee',bottom:'straight',shoes:'boots',accessory:'none',skin:'mc-skin-4',hairColor:'mc-hair-brown',outfit:'field'}},
  {id:'fat-technician',name:'Fat technician',spec:{body:'fat',head:'cut-jaw',hair:'crop',face:'neutral',top:'tee',bottom:'straight',shoes:'boots',accessory:'none',skin:'mc-skin-4',hairColor:'mc-hair-brown',outfit:'field'}},
  {id:'thin-resident',name:'Thin resident',presentation:'woman',spec:{body:'thin',head:'soft-jaw',hair:'bob',face:'smile',top:'shirt',bottom:'tapered',shoes:'trainers',accessory:'none',skin:'mc-skin-3',hairColor:'mc-hair-ink',outfit:'plum'}},
  {id:'fat-resident',name:'Fat resident',presentation:'woman',spec:{body:'fat',head:'soft-jaw',hair:'bob',face:'smile',top:'shirt',bottom:'tapered',shoes:'trainers',accessory:'none',skin:'mc-skin-3',hairColor:'mc-hair-ink',outfit:'plum'}},
  {id:'robot-scout',name:'SC-1 / Scout',kind:'robot',spec:{body:'robot-light',head:'robot-optic',hair:'antenna',face:'mono-eye',top:'open-frame',bottom:'actuators',shoes:'split-foot',accessory:'none',skin:'mc-skin-1',hairColor:'mc-hair-ink',outfit:'robot-carbon'}},
  {id:'robot-loader',name:'LD-2 / Dock loader',kind:'robot',spec:{body:'robot-heavy',head:'robot-box',hair:'bald',face:'led-pair',top:'armour',bottom:'armoured-legs',shoes:'magnetic',accessory:'none',skin:'mc-skin-1',hairColor:'mc-hair-ink',outfit:'robot-industrial'}},
  {id:'robot-service',name:'SV-3 / Service unit',kind:'robot',spec:{body:'robot-service',head:'robot-visor',hair:'bald',face:'scanner',top:'shell',bottom:'actuators',shoes:'magnetic',accessory:'none',skin:'mc-skin-1',hairColor:'mc-hair-ink',outfit:'robot-ivory'}},
  {id:'robot-maintenance',name:'MX-4 / Repair unit',kind:'robot',spec:{body:'robot-service',head:'robot-box',hair:'aerials',face:'led-pair',top:'open-frame',bottom:'armoured-legs',shoes:'split-foot',accessory:'none',skin:'mc-skin-1',hairColor:'mc-hair-ink',outfit:'robot-copper'}},
];
const slotColors={
  skin:'#d8a57e',hair:'#332b28',top:'#637c87',secondary:'#dfd9c8',accent:'#bd8b4e',
  bottom:'#354a58',shoe:'#322f2d',sole:'#857f70',feature:'#26252b',white:'#f0e9da',
  mouth:'#874f46',metal:'#879391',lens:'#668f9a',skinShade:'#ba805d',signal:'#79e0e0',
};
const material=slot=>({mat:slot,color:slotColors[slot]});
const paint=(mesh,slot)=>({...mesh,faces:mesh.faces.map(f=>({...f,...material(slot)}))});
const rectangle=(cx,cy,w,h)=>[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function shell(positions,loops,slot) {
  const center=[0,1,2].map(j=>positions.reduce((n,p)=>n+p[j],0)/positions.length);
  return {positions,faces:loops.map(loop=>{
    const n=faceNormal(loop.map(i=>positions[i]));
    const c=[0,1,2].map(j=>loop.reduce((s,i)=>s+positions[i][j],0)/loop.length);
    return {v:n.reduce((s,v,j)=>s+v*(c[j]-center[j]),0)<0?[...loop].reverse():loop,...material(slot)};
  })};
}
function prismXY(polygon,z0,z1,slot) {
  const n=polygon.length;
  return shell([...polygon.map(([x,y])=>[x,y,z0]),...polygon.map(([x,y])=>[x,y,z1])],[
    Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>i+n),
    ...polygon.map((_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n]),
  ],slot);
}
function plane(polygon,z,slot) {
  const positions=polygon.map(([x,y])=>[x,y,z]);
  if (faceNormal(positions)[2]<0) positions.reverse();
  const concave=positions.some((a,i)=>{
    const b=positions[(i+1)%positions.length],c=positions[(i+2)%positions.length];
    return cross(b.map((v,j)=>v-a[j]),c.map((v,j)=>v-b[j]))[2]<-1e-12;
  });
  const loops=concave?triangulate(positions):[positions.map((_,i)=>i)];
  return {positions,faces:loops.map(v=>({v,...material(slot)}))};
}
const ring=(y,w,d,cx=0,cz=0)=>[[cx-w,y,cz-d],[cx+w,y,cz-d],[cx+w,y,cz+d],[cx-w,y,cz+d]];
function loft(rings,slot) {
  const n=rings[0].length,positions=rings.flat(),loops=[
    Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>positions.length-n+i),
  ];
  for (let r=0;r<rings.length-1;r++) for (let i=0;i<n;i++) {
    const a=r*n+i,b=r*n+(i+1)%n,c=b+n,d=a+n;
    loops.push([a,b,c,d]);
  }
  const slots=Array.isArray(slot)?slot:null;
  const mesh=shell(positions,loops,slots?slots[0]:slot);
  if (slots) mesh.faces=mesh.faces.map((f,i)=>({
    ...f,...material(i===0?slots[0]:i===1?slots.at(-1):slots[Math.floor((i-2)/n)]),
  }));
  return mesh;
}
function palette() {
  const result=[];
  const add=(name,color,props={})=>result.push({name,color,rough:.85,metal:0,alpha:1,emit:0,...props});
  for (const [slot,color] of Object.entries(slotColors)) add(`mc-${slot}`,color);
  ['#f1d5bc','#dfb796','#ce9c70','#b98158','#97643f','#71482e','#4d3025'].forEach((color,i)=>add(`mc-skin-${i+1}`,color));
  for (const [name,color] of Object.entries({ink:'#24232a',brown:'#604732',auburn:'#a75a3d',blond:'#c5a16c',grey:'#858b89',white:'#d9d4c6'})) add(`mc-hair-${name}`,color);
  const outfits={
    dock:['#9e663e','#d6c6a5','#d7ad55','#3a4b57','#43382b'],
    command:['#34465b','#d5d0bc','#d5a856','#323c4c','#2b2c31'],
    lab:['#dddcd1','#4d7b79','#b67f54','#4b555d','#454644'],
    field:['#69764b','#bbb99c','#c68c45','#484c38','#3c352b'],
    plum:['#77576c','#e4d9c3','#c79461','#4a3c4d','#352b33'],
    street:['#688192','#d6c7ad','#b67454','#3e536a','#e0d9c6'],
    'robot-ivory':['#d9ddd1','#739a98','#ce965c','#45595d','#3b5055'],
    'robot-industrial':['#c8a448','#555b58','#e5cc7e','#404b4d','#343d3c'],
    'robot-carbon':['#394953','#899ba2','#60bcc6','#28383f','#293336'],
    'robot-copper':['#ae7551','#b7b9a2','#83bb85','#4a514b','#34453d'],
  };
  const maps={};
  for (const [name,colors] of Object.entries(outfits)) {
    maps[name]=Object.fromEntries(Object.keys(slotColors).map(slot=>[slot,`mc-${slot}`]));
    ['top','secondary','accent','bottom','shoe'].forEach((slot,i)=>{
      const key=`mc-${name}-${slot}`;add(key,colors[i]);maps[name][slot]=key;
    });
    if (name.startsWith('robot-')) {
      for (const [slot,color] of [['metal',colors[1]],['signal',colors[2]]]) {
        const key=`mc-${name}-${slot}`;
        add(key,color,{rough:.4,metal:slot==='metal'?.7:0,emit:slot==='signal'?.8:0});
        maps[name][slot]=key;
      }
    }
  }
  return {palette:result,outfits:maps};
}

export function buildLibrary() {
  const prototypes={},modules={};
  let parts=[];
  const add=(mesh)=>parts.push(mesh);
  const B=(at,size,slot)=>add(paint(box({at,size}),slot));
  const P=(poly,z,slot)=>add(plane(poly,z,slot));
  const module=(id,slot,make)=>{
    parts=[];make();
    const mesh=merge(...parts),result=validate(mesh);
    assert(result.ok,`${id}: ${result.notes.join('; ')}`);
    const triangles=mesh.faces.reduce((n,f)=>n+f.v.length-2,0);
    prototypes[id]={lods:[mesh]};modules[id]={slot,faces:mesh.faces.length,triangles,closed:result.closed};
  };
  for (const [body,m] of Object.entries(bodyShapes)) {
    const limb=m.limb??1,depth=m.depth??.12,wrist=m.shoulder+.095*limb;
    const skin=m.robot?'metal':'skin';
    module(`body/${body}`,'body',()=>{
      if (m.robot) {
        B([0,1.535,0],[.095,.20,.09],'metal');
        B([0,1.48,0],[.16,.045,.14],'feature');
        for (const side of [-1,1]) {
          B([side*wrist,.925,0],[.09*limb,.10,.08*limb],'metal');
          for (const dx of [-.03,.03]) B([side*wrist+dx*limb,.855,.025],[.025*limb,.10,.085*limb],'accent');
        }
        return;
      }
      B([0,1.535,0],[.105,.18,.1],'skin');
      for (const side of [-1,1]) add(prismXY([
        [side*wrist-.035*limb,.83],[side*wrist+.035*limb,.83],[side*wrist+.045*limb,.89],
        [side*wrist+.035*limb,.975],[side*wrist-.035*limb,.975],
      ],-.035*limb,.042*limb,'skin'));
    });
    for (const style of OPTIONS.top.map(o=>o[0])) module(`top/${body}/${style}`,'top',()=>{
      if (['shell','armour','open-frame'].includes(style)) {
        B([0,1.14,0],[m.waist*1.6,.25,depth*1.3],'metal');
        if (style==='open-frame') {
          B([0,1.34,0],[m.shoulder,.26,depth],'feature');
          for (const side of [-1,1]) B([side*m.shoulder*.78,1.36,0],[.045,.30,depth*1.8],'top');
          B([0,1.49,0],[m.shoulder*1.8,.06,depth*1.8],'top');
          B([0,1.34,depth/2+.006],[.07,.12,.012],'signal');
        } else {
          add(loft([ring(1.23,m.waist+.025,depth),ring(1.40,m.shoulder,depth),ring(1.52,.07,.06)],'top'));
          P(rectangle(0,1.33,m.shoulder*1.2,.09),depth+.002,'secondary');
          P(rectangle(0,1.33,.07,.025),depth+.003,'signal');
        }
        for (const side of [-1,1]) {
          add(loft([
            ring(1.46,.064*limb,.075*limb,side*(m.shoulder+.025*limb)),
            ring(1.27,.048*limb,.060*limb,side*(m.shoulder+.055*limb)),
          ],'top'));
          B([side*(m.shoulder+.065*limb),1.235,0],[.085*limb,.10,.10*limb],'metal');
          add(loft([
            ring(1.20,.052*limb,.060*limb,side*(m.shoulder+.075*limb)),
            ring(.965,.035*limb,.042*limb,side*wrist),
          ],'secondary'));
          if (style==='armour') B([side*(m.shoulder+.035*limb),1.45,0],[.16*limb,.17,.19*limb],'accent');
        }
        return;
      }
      const C=(poly,z,slot)=>P(poly,z+depth-.12,slot);
      add(loft([
        ring(1.025,m.hip,depth),ring(1.14,m.waist,depth),
        ...(m.chest?[ring(1.34,m.chest,depth)]:[]),
        ring(1.40,m.shoulder,depth),ring(1.48,m.shoulder,m.depth?depth:.10),ring(1.535,.064,.06),
      ],'top'));
      for (const side of [-1,1]) {
        const rings=[
          ring(1.46,.067*limb,.088*limb,side*(m.shoulder+.025*limb)),
          ring(1.27,.059*limb,.073*limb,side*(m.shoulder+.055*limb)),
          ring(1.205,.052*limb,.061*limb,side*(m.shoulder+.075*limb)),
          ring(1.17,.050*limb,.058*limb,side*(m.shoulder+.08*limb)),
          ring(.965,.036*limb,.042*limb,side*wrist),
        ];
        const sleeves=[];
        for (let i=0;i<rings.length-1;i++) {
          const bare=style==='tee'&&i>=1;
          sleeves.push(bare?skin:style==='vest'?'secondary':'top');
        }
        add(loft(rings,sleeves));
        if (style!=='tee') B([side*wrist,.986,0],[.082*limb,.04,.092*limb],'secondary');
      }
      if (['jacket','coat','vest'].includes(style)) {
        C([[-.075,1.47],[.075,1.47],[.055,1.18],[-.055,1.18]],.122,'secondary');
        for (const side of [-1,1]) C([
          [side*.055,1.46],[side*.14,1.44],[side*.065,1.22],[side*.025,1.36],
        ].map((p,i,a)=>side===1?p:a[a.length-1-i]),.124,'accent');
        C([[-.018,1.40],[.018,1.40],[.03,1.23],[0,1.19],[-.03,1.23]],.126,'bottom');
      }
      if (style==='coat') {
        const width=m.hip+.07;
        for (const side of [-1,1]) {
          add(prismXY(rectangle(side*(width/2+.015),.91,width-.03,.28),depth+.005,depth+.017,'top'));
          C(rectangle(side*(width-.09),.98,.12,.07),.139,'secondary');
        }
        B([0,.91,-depth-.01],[m.hip*2+.06,.28,.035],'top');
      }
      if (style==='shirt') {
        C([[-.055,1.46],[0,1.36],[.055,1.46]],.122,skin);
        for (const side of [-1,1]) C([[side*.01,1.4],[side*.055,1.46],[side*.10,1.43]],.124,'secondary');
      }
      if (style==='workwear') {
        C(rectangle(0,1.245,.23,.27),.123,'secondary');
        for (const side of [-1,1]) C(rectangle(side*.105,1.38,.035,.16),.124,'accent');
        C(rectangle(0,1.24,.15,.07),.125,'top');
      }
      if (style!=='tee') for (let i=0;i<3;i++) C(rectangle(.015,1.10+i*.075,.016,.018),.129,'accent');
      C(rectangle(-m.shoulder*.60,1.33,.06,.035),.13,'accent');
    });
    for (const style of OPTIONS.bottom.map(o=>o[0])) module(`bottom/${body}/${style}`,'bottom',()=>{
      if (['actuators','armoured-legs'].includes(style)) {
        B([0,.97,0],[m.hip*2,.17,depth*1.8],'bottom');
        for (const side of [-1,1]) {
          const x=side*m.leg,w=(style==='actuators'?.052:.080)*limb;
          B([x,.90,0],[.10*limb,.12,.12*limb],'metal');
          add(loft([ring(.89,w,.070*limb,x),ring(.58,w*.85,.065*limb,x)],'top'));
          B([x,.54,0],[.095*limb,.12,.12*limb],'metal');
          add(loft([ring(.50,w,.068*limb,x),ring(.14,w*.7,.055*limb,x)],'bottom'));
          if (style==='actuators') B([x,.72,.08*limb],[.022*limb,.24,.022*limb],'metal');
          else B([x,.34,.075*limb],[.11*limb,.23,.028*limb],'accent');
        }
        return;
      }
      add(loft([ring(.88,m.hip,depth*.875),ring(1.055,m.hip,depth)],'bottom'));
      B([0,1.045,0],[m.hip*2+.012,.045,depth*2+.013],'shoe');
      B([0,1.046,depth+.012],[.07,.037,.018],'accent');
      for (const side of [-1,1]) {
        const wide=(style==='cargo'?.095:style==='tapered'?.073:.082)*limb;
        add(loft([
          ring(.94,wide,.095*limb,side*m.leg),
          ring(.56,wide*.84,.079*limb,side*m.leg),
          ring(.51,wide*.80,.076*limb,side*m.leg),
          ring(.14,(style==='tapered'?.047:.060)*limb,.064*limb,side*m.leg),
        ],style==='skirt'?skin:'bottom'));
        if (style==='cargo') {
          B([side*(m.leg+.072*limb),.72,.015],[.055*limb,.18,.15*limb],'secondary');
          B([side*(m.leg+.074*limb),.81,.015],[.06*limb,.025,.165*limb],'accent');
        }
      }
      if (style==='skirt') add(loft([ring(.66,m.hip+.06,depth*4/3),ring(1.03,m.hip+.01,depth*13/12)],'bottom'));
    });
    for (const style of OPTIONS.shoes.map(o=>o[0])) module(`shoes/${body}/${style}`,'shoes',()=>{
      for (const side of [-1,1]) {
        const x=side*m.leg;
        if (style==='split-foot') {
          B([x,.07,-.04],[.13*limb,.14,.12],'shoe');
          for (const dx of [-.045,.045]) B([x+dx*limb,.04,.10],[.07*limb,.08,.23],'secondary');
          B([x,.14,-.01],[.10*limb,.08,.10],'metal');
          continue;
        }
        if (style==='magnetic') {
          B([x,.02,.04],[.18*limb,.04,.32],'sole');
          B([x,.10,.04],[.16*limb,.12,.28],'shoe');
          B([x,.16,-.01],[.11*limb,.12,.12],'metal');
          B([x,.10,.184],[.11*limb,.025,.012],'signal');
          continue;
        }
        const w=(style==='boots'?.083:.074)*limb;
        B([x,.018,.045],[w*2,.036,.29],'sole');
        add(prismXY([[x-w,.035],[x+w,.035],[x+w,.10],[x+w*.7,.16],[x-w*.7,.16],[x-w,.10]],-.095,.188,'shoe'));
        if (style==='boots') {
          add(loft([ring(.12,.068*limb,.074*limb,x),ring(.32,.069*limb,.074*limb,x)],'shoe'));
          B([x,.315,0],[.145*limb,.04,.16*limb],'accent');
        }
        if (style==='trainers') {
          B([x,.10,.197],[w*1.8,.065,.018],'secondary');
          for (let i=0;i<3;i++) B([x,.166,.035+i*.036],[.09,.008,.012],'secondary');
        }
      }
    });
  }
  for (const [head,shape] of Object.entries(headShapes)) {
    const w=shape.width;
    module(`head/${head}`,'head',()=>{
      const casing=prismXY(shape.outline,-.13,headFront,shape.robot?'top':'skin');
      if (shape.robot) casing.faces=casing.faces.map(f=>
        f.v.every(i=>casing.positions[i][2]===headFront)?{...f,...material('feature')}:f);
      add(casing);
      for (const side of [-1,1]) B([side*(w+.014),1.745,.004],[.034,.077,.055],shape.robot?'metal':'skin');
      if (shape.robot) {
        const corner=shape.outline[2][1];
        B([0,1.91,.145],[w*2,.025,.02],'top');
        B([0,1.59,.145],[shape.outline[1][0]*2,.02,.02],'top');
        for (const side of [-1,1]) B([side*(w-.009),(corner+1.91)/2,.145],[.018,1.91-corner,.02],'top');
        for (let i=0;i<3;i++) B([0,1.67+i*.065,-.137],[w*1.2,.018,.014],'metal');
      }
    });
    for (const style of OPTIONS.face.map(o=>o[0])) module(`face/${head}/${style}`,'face',()=>{
      const s=w/.15,eyeY=1.768;
      if (['led-pair','scanner','mono-eye'].includes(style)) {
        if (style==='led-pair') for (const side of [-1,1])
          P(rectangle(side*w*.43,1.775,w*.32,.042),headFront+faceLift,'signal');
        if (style==='scanner') P(rectangle(0,1.775,w*1.5,.035),headFront+faceLift,'signal');
        if (style==='mono-eye') {
          P([[-.06,1.775],[-.03,1.825],[.03,1.825],[.06,1.775],[.03,1.725],[-.03,1.725]],headFront+faceLift,'metal');
          P(rectangle(0,1.775,.052,.045),headFront+faceLift+.001,'signal');
        }
        for (let i=0;i<3;i++) P(rectangle(0,1.657+i*.017,w*.65,.006),headFront+faceLift,'metal');
        return;
      }
      for (const side of [-1,1]) {
        const x=side*.067*s;
        P(rectangle(x,eyeY,.065*s,.032),headFront+faceLift,'white');
        P(rectangle(x+side*.002,eyeY,.019*s,.027),headFront+faceLift+.001,'feature');
        const tilt=style==='focused'?-side*.008:style==='smile'?side*.004:0;
        P([[x-.038*s,1.805-tilt],[x+.038*s,1.805+tilt],[x+.038*s,1.817+tilt],[x-.038*s,1.817-tilt]],headFront+faceLift,'hair');
        if (style==='lined') P(rectangle(x,1.737,.046,.006),headFront+faceLift,'skinShade');
      }
      P([[-.015,1.705],[.015,1.705],[0,1.737]],headFront+faceLift+.001,'skinShade');
      if (style==='smile') P([[-.052,1.675],[0,1.659],[.052,1.675],[.042,1.682],[0,1.672],[-.042,1.682]],headFront+faceLift,'mouth');
      else P(rectangle(0,style==='focused'?1.67:1.674,style==='focused'?.063:.082,.009),headFront+faceLift,'mouth');
    });
    for (const style of OPTIONS.hair.map(o=>o[0]).filter(id=>id!=='bald')) module(`hair/${head}/${style}`,'hair',()=>{
      if (['antenna','aerials'].includes(style)) {
        for (const side of style==='antenna'?[1]:[-1,1]) {
          B([side*(w-.02),1.97,-.04],[.018,.12,.018],'metal');
          B([side*(w-.02),2.035,-.04],[.027,.027,.027],'signal');
        }
        return;
      }
      const outer=w+.015,top=style==='crop'?1.946:1.97;
      add(loft([ring(1.855,outer,.15),ring(top,outer*.9,.13)],'hair'));
      if (['crop','sweep','spikes'].includes(style)) {
        const count=style==='spikes'?5:3;
        for (let i=0;i<count;i++) {
          const a=-outer+i*2*outer/count,b=-outer+(i+1)*2*outer/count;
          const tip=style==='sweep'?a+(b-a)*.15:(a+b)/2;
          P([[a,1.923],[b,1.923],[tip,style==='spikes'?1.825+(i%2)*.018:1.835+i*.008]],.155,'hair');
          if (style==='spikes') add(shell([[a,1.94,-.02],[b,1.94,-.02],[(a+b)/2,2.025,-.03],[(a+b)/2,1.94,-.10]],[[0,1,2],[0,3,1],[1,3,2],[2,3,0]],'hair'));
        }
      }
      if (['bob','long','bun'].includes(style)) {
        const bottom=style==='long'?1.49:style==='bob'?1.61:1.77;
        add(prismXY([[-outer,bottom],[outer,bottom],[outer,1.91],[-outer,1.91]],-.171,-.139,'hair'));
        for (const side of [-1,1]) {
          const x=side*outer;
          B([x,(bottom+1.87)/2,-.01],[.035,1.87-bottom,.27],'hair');
          P([[x-side*.014,1.9],[x+side*.025,1.84],[x+side*.02,bottom],[x-side*.03,bottom+.045]]
            .map((p,i,a)=>side===1?p:a[a.length-1-i]),.144,'hair');
        }
      }
      if (style==='bun') add(loft([ring(1.86,.075,.075,0,-.20),ring(1.98,.065,.065,0,-.20)],'hair'));
    });
    for (const style of OPTIONS.accessory.map(o=>o[0]).filter(id=>id!=='none')) module(`accessory/${head}/${style}`,'accessory',()=>{
      if (style==='glasses' || style==='visor') {
        if (style==='glasses') {
          for (const side of [-1,1]) {
            const x=side*.071*(w/.15),width=.104*(w/.15);
            for (const y of [1.737,1.798]) B([x,y,.153],[width,.01,.012],'feature');
            for (const dx of [-width/2,width/2]) B([x+dx,1.768,.153],[.01,.07,.012],'feature');
          }
          B([0,1.775,.153],[.036,.01,.012],'feature');
        } else {
          B([0,1.77,.16],[w*1.95,.08,.012],'lens');
          B([0,1.815,.16],[w*2.02,.014,.017],'metal');
        }
        for (const side of [-1,1]) B([side*(w+.02),1.78,.035],[.013,.018,.23],'feature');
      }
      if (style==='headset') {
        for (const side of [-1,1]) B([side*(w+.045),1.75,0],[.045,.085,.075],'metal');
        B([0,1.99,0],[w*2+.12,.025,.03],'feature');
        for (const side of [-1,1]) B([side*(w+.049),1.87,0],[.023,.23,.03],'feature');
        B([w+.07,1.665,.078],[.018,.025,.18],'feature');
        B([w+.015,1.665,.165],[.12,.025,.02],'feature');
      }
      if (style==='beard') P([[-w*.69,1.665],[-w*.35,1.644],[w*.35,1.644],[w*.69,1.665],[w*.55,1.592],[-w*.55,1.592]],.144,'hair');
    });
  }
  const colors=palette();
  return {
    format:'spider-modular-character-library',version:1,
    reference:{scene:'betterman',height:referenceHeight},headFront,faceLift,
    options:Object.fromEntries(Object.entries(OPTIONS).map(([key,list])=>[key,list.map(([id,label])=>({id,label}))])),
    defaults:EXAMPLES[1].spec,examples:EXAMPLES,
    palette:colors.palette,outfits:colors.outfits,prototypes,modules,
    sockets:{neck:[0,1.535,0],head:[0,1.58,0],waist:[0,1.04,0],
      ankles:Object.fromEntries(Object.entries(bodyShapes).map(([id,m])=>[id,[[-m.leg,.14,0],[m.leg,.14,0]]]))},
    views:{
      'three-quarter':{cam:{center:[0,.98,0],radius:1.1,dist:4.5,yaw:-.27,pitch:.06}},
      front:{cam:{center:[0,.98,0],radius:1.1,dist:4.5,yaw:0,pitch:0}},
      face:{cam:{center:[0,1.77,0],radius:.30,dist:1.15,yaw:-.12,pitch:.025},slots:['head','face','hair','accessory']},
      parts:{cam:{center:[0,1.2,0],radius:1.7,dist:6.4,yaw:-.3,pitch:.08},
        offsets:{body:[0,0,-.25],head:[0,.4,0],face:[0,.4,.55],hair:[0,.8,0],top:[-.65,0,0],bottom:[.65,-.05,0],shoes:[.65,-.25,0],accessory:[.7,.4,.5]}},
    },
    sources:['https://jxnblk.com/blog/modular-characters-part-one/','human/low-poly-boxy-method.png','human/group-color.png','human/group-edges.png','human/ultra-low-poly-suited-guy-with-glasses-3d-model_899449-177730.avif'],
  };
}

export const expandedObjects=scene=>scene.objects.map(o=>o.mesh?o:{name:o.name,mesh:instantiate(scene.prototypes[o.proto].lods[0],o)});

export function buildPack() {
  const library=buildLibrary();
  const scenes=Object.fromEntries(EXAMPLES.map(example=>{
    const scene=characterScene(library,example.spec);
    scene.name=`Modular / ${example.name}`;
    return [example.id,scene];
  }));
  const groupScene=(name,examples,columns)=>{
    const scene={...scenes[examples[0].id],name,prototypes:{},objects:[],
      metadata:{designs:examples.map(e=>({id:e.id,spec:e.spec})),referenceHeight}};
    examples.forEach((example,i)=>{
      const part=characterScene(library,example.spec,{at:[(i%columns)*1.4,0,Math.floor(i/columns)*2.4]});
      Object.assign(scene.prototypes,part.prototypes);
      scene.objects.push(...part.objects.map(o=>({...o,name:`${example.id}/${o.name}`})));
    });
    for (const o of reference.objects) scene.objects.push({
      name:`betterman-reference/${o.name}`,mesh:{...o.mesh,positions:o.mesh.positions.map(([x,y,z])=>[x-1.5,y,z])},
    });
    scene.palette=[...library.palette,...reference.palette];
    const width=(Math.min(columns,examples.length)-1)*1.4+1.5,depth=(Math.ceil(examples.length/columns)-1)*2.4;
    const radius=Math.max(3.3,Math.hypot(width,depth)/2+.4);
    scene.view={...scene.view,cam:{center:[(width-3)/2,1,depth/2],radius,dist:radius*(depth?3.6:3.1),yaw:-.18,pitch:depth?.72:.08}};
    return scene;
  };
  const lineup=groupScene('Modular low-poly character designs',EXAMPLES,5);
  const women=groupScene('Women / modular character designs',EXAMPLES.filter(e=>e.presentation==='woman'),3);
  const robots=groupScene('Robots / modular mechanical characters',EXAMPLES.filter(e=>e.kind==='robot'),4);
  const bodies=groupScene('Thin and fat / matched body studies',EXAMPLES.filter(e=>['thin','fat'].includes(e.spec.body)),4);
  const headStudy={...scenes.navigator,name:'Box heads / planar facial features',prototypes:library.prototypes,objects:[]};
  const columns=OPTIONS.head.length;
  for (let i=0;i<columns*2;i++) {
    const head=OPTIONS.head[i%columns][0],robot=head.startsWith('robot-');
    const hair=i<columns?'bald':robot?'antenna':OPTIONS.hair[1+(i-columns)%(OPTIONS.hair.length-1)][0];
    const part=characterScene(library,{...EXAMPLES[i%EXAMPLES.length].spec,head,hair,
      ...(robot?{face:'scanner',outfit:'robot-carbon'}:{}),accessory:'none'},{at:[(i%columns)*.7,(i<columns?.70:0)-1.5,0]});
    headStudy.objects.push(...part.objects.filter(o=>/\/(head|face|hair)$/.test(o.name)).map(o=>({...o,name:`study-${i}/${o.name}`})));
  }
  headStudy.view={...headStudy.view,cam:{center:[(columns-1)*.35,.55,0],radius:columns*.34,dist:columns*1.06,yaw:-.08,pitch:.03}};
  const exploded=inspectionScene(library,characterScene(library,EXAMPLES[1].spec),'parts');
  exploded.name='Modular character / separate interchangeable sections';
  return {library,scenes,lineup,women,robots,bodies,headStudy,exploded};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  mkdirSync(output,{recursive:true});
  const pack=buildPack();
  const save=(file,value)=>writeFileSync(new URL(file,output),JSON.stringify(value));
  save('library.json',pack.library);
  const all={...pack.scenes,lineup:pack.lineup,women:pack.women,robots:pack.robots,bodies:pack.bodies,heads:pack.headStudy,parts:pack.exploded};
  for (const [id,scene] of Object.entries(all)) {
    save(`${id}.scene.json`,scene);
    const mesh=merge(...expandedObjects(scene).map(o=>o.mesh)),palette=Object.fromEntries(scene.palette.map(({name,...m})=>[name,m]));
    writeFileSync(new URL(`${id}.svg`,output),renderView(mesh,orbit({yaw:-.25,pitch:scene.view.cam.pitch}),{
      size:id==='lineup'?1100:500,points:false,stroke:'#27313924',background:'#e9e4d8',palette,
    }));
    if (pack.scenes[id]) {
      writeFileSync(new URL(`${id}-front.svg`,output),renderView(mesh,'front',{size:500,points:false,stroke:'#27313924',background:'#e9e4d8',palette}));
      const result=validate(mesh);
      assert(result.ok,`${id}: ${result.notes.join('; ')}`);
    }
  }
  console.log(JSON.stringify({
    designs:EXAMPLES.length,modules:Object.keys(pack.library.modules).length,
    triangles:Object.fromEntries(Object.entries(pack.scenes).map(([id,s])=>[id,s.metadata.modularCharacter.triangles])),
    referenceHeight,
  },null,2));
}

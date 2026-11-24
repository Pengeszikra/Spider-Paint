export const PART_SLOTS = ['body','head','face','hair','top','bottom','shoes','accessory'];
export const COLOR_SLOTS = ['skin','hairColor','outfit'];

export function selectionOf(library, input = {}) {
  if (library.format !== 'spider-modular-character-library' || library.version !== 1)
    throw new Error('Unsupported modular character library');
  for (const key of Object.keys(input))
    if (![...PART_SLOTS,...COLOR_SLOTS].includes(key)) throw new Error(`Unknown selection field: ${key}`);
  const selection = {...library.defaults,...input};
  for (const key of [...PART_SLOTS,...COLOR_SLOTS])
    if (!library.options[key].some(option=>option.id===selection[key]))
      throw new Error(`Unknown ${key}: ${selection[key]}`);
  return selection;
}

export function characterScene(library, input = {}, placement = {}) {
  const spec = selectionOf(library,input);
  const at = placement.at ?? [0,0,0], yaw = placement.yaw ?? 0, scale = placement.scale ?? 1;
  if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite) ||
      !Number.isFinite(yaw) || !Number.isFinite(scale) || scale <= 0)
    throw new Error('Placement needs a finite XYZ position, yaw, and positive uniform scale');
  const keys = {
    body:`body/${spec.body}`, head:`head/${spec.head}`, face:`face/${spec.head}/${spec.face}`,
    hair:spec.hair==='bald'?null:`hair/${spec.head}/${spec.hair}`,
    top:`top/${spec.body}/${spec.top}`, bottom:`bottom/${spec.body}/${spec.bottom}`,
    shoes:`shoes/${spec.body}/${spec.shoes}`,
    accessory:spec.accessory==='none'?null:`accessory/${spec.head}/${spec.accessory}`,
  };
  const mats = {...library.outfits[spec.outfit],skin:spec.skin,hair:spec.hairColor};
  const prototypes = {}, objects = [];
  for (const [slot,key] of Object.entries(keys)) {
    if (!key) continue;
    const prototype = library.prototypes[key];
    if (!prototype) throw new Error(`Missing module: ${key}`);
    prototypes[key] = prototype;
    objects.push({name:`character/${slot}`,proto:key,at:[...at],rot:[0,yaw],scale,mats:{...mats}});
  }
  const triangles = objects.reduce((n,o)=>n+library.modules[o.proto].triangles,0);
  return {
    format:'3draft-scene',version:2,name:'Modular low-poly character',
    palette:library.palette,prototypes,objects,
    metadata:{modularCharacter:{version:1,spec,triangles,referenceHeight:library.reference.height,frame:{at:[...at],yaw,scale}}},
    view:{
      render:'webgpu',edges:false,light:true,glow:false,smooth:false,studio:true,
      cam:{center:[at[0],at[1]+scale*.98,at[2]],radius:scale*1.1,dist:scale*4.5,yaw:-.27,pitch:.06},
    },
  };
}

export function inspectionScene(library,scene,mode) {
  const view=library.views[mode];
  if (!view) throw new Error(`Unknown inspection view: ${mode}`);
  const {at,yaw,scale}=scene.metadata.modularCharacter.frame;
  const transform=([x,y,z])=>[
    scale*(Math.cos(yaw)*x+Math.sin(yaw)*z),
    scale*y,scale*(-Math.sin(yaw)*x+Math.cos(yaw)*z),
  ];
  const objects=scene.objects.filter(o=>!view.slots||view.slots.includes(o.name.split('/')[1])).map(o=>{
    const offset=view.offsets?.[o.name.split('/')[1]];
    if (!offset) return o;
    const delta=transform(offset);
    return {...o,at:o.at.map((v,i)=>v+delta[i])};
  });
  return {...scene,objects,view:{...scene.view,cam:{
    ...view.cam,center:transform(view.cam.center).map((v,i)=>v+at[i]),
    radius:view.cam.radius*scale,dist:view.cam.dist*scale,yaw:view.cam.yaw-yaw,
  }}};
}

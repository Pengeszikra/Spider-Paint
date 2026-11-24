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

// ---- rigging: a skeleton and joint weights for a placed character, in the form the engine's poses take
// ({ joints: [{ name, parent, at }], skin: per object, per vertex [[joint, weight]] }), so posed(), boneMatrices() and the
// viewer's pose mode (J) move it. The skeleton is the library's (rigs[body], made from the numbers the body is built of)
// put where the character stands; every vertex follows one bone, rigidly, as the low-poly modules are boxes: the parts of
// the arms by height (upper arm, forearm, hand), the legs by height (thigh, shin, foot), the trunk (root, spine) and the head.

/** The skeleton and weights of `scene` (characterScene); its objects in that order. `turn` is the character's yaw (turnedPose). */
export function characterRig(library, scene) {
  const meta = scene.metadata?.modularCharacter;
  const rig = meta && library.rigs?.[meta.spec.body];
  if (!rig) throw new Error('no rig for this character (an older library: rebuild it with scripts/build-modular-characters.mjs)');
  const { at, yaw, scale } = meta.frame;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const world = ([x, y, z]) => [at[0] + scale * (c * x + s * z), at[1] + scale * y, at[2] + scale * (-s * x + c * z)];
  const joints = rig.joints.map((j) => ({ ...j, at: world(j.at) }));
  const id = Object.fromEntries(rig.joints.map((j, i) => [j.name, i]));
  const L = rig.levels;
  const HEAD_SLOTS = ['head', 'face', 'hair', 'accessory'];
  const skin = scene.objects.map((o) => {
    const mesh = scene.prototypes[o.proto].lods[0]; // (in the character's own frame: standing at the origin, looking to +z)
    const slot = o.name.split('/')[1];
    const P = mesh.positions;
    if (HEAD_SLOTS.includes(slot)) return P.map(() => [[id.head, 1]]);
    // the loose shells of the module: an arm (a sleeve, a hand, a shoulder pad) is a shell standing out beside the trunk
    const up = P.map((_, i) => i);
    const root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
    for (const f of mesh.faces) for (let k = 1; k < f.v.length; k++) up[root(f.v[k])] = root(f.v[0]);
    const shells = new Map();
    P.forEach((p, i) => {
      const r = root(i);
      const sh = shells.get(r) ?? { n: 0, x: 0, low: Infinity };
      sh.n++, (sh.x += p[0]), (sh.low = Math.min(sh.low, p[1]));
      shells.set(r, sh);
    });
    return P.map(([x, y], i) => {
      const sh = shells.get(root(i));
      const cx = sh.x / sh.n;
      const n = (cx || x) >= 0 ? 'L' : 'R';
      const bone =
        Math.abs(cx) > rig.arm && sh.low > L.armLow ? (y >= L.elbow ? `shoulder${n}` : y >= L.wrist ? `elbow${n}` : `wrist${n}`)
        : y >= L.neck ? 'head'
        : y >= L.spine ? 'spine'
        : y >= L.hips || Math.abs(cx) < 0.01 ? 'root' // (the hips, a belt, a skirt)
        : ((leg) => (y >= L.knee ? `hip${leg}` : y >= L.ankle ? `knee${leg}` : `ankle${leg}`))(x >= 0 ? 'L' : 'R');
      return [[id[bone], 1]];
    });
  });
  return { joints, skin, turn: yaw };
}

/**
 * A pose (joint -> [x, y, z] angles, the engine's: turned about x, then y, then z, in the world's axes) for a figure that
 * looks `turn` radians away from +z: every joint's turn is the same turn seen from the figure, so a pose made for a figure
 * looking to +z (the engine's ready poses, the walk) bends a turned character the same way.
 */
export function turnedPose(pose, turn) {
  if (!turn) return pose;
  const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  const Rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
  const Ry = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
  const Rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  const out = {};
  for (const [name, [ax, ay, az]] of Object.entries(pose)) {
    const m = mul(mul(Ry(turn), mul(Rz(az), mul(Ry(ay), Rx(ax)))), Ry(-turn)); // R(turn) . Rz Ry Rx . R(-turn)
    const b = Math.asin(Math.max(-1, Math.min(1, -m[2][0])));
    out[name] = Math.abs(m[2][0]) < 0.999999
      ? [Math.atan2(m[2][1], m[2][2]), b, Math.atan2(m[1][0], m[0][0])]
      : [0, b, Math.atan2(-m[0][1], m[1][1])];
  }
  return out;
}

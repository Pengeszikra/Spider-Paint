// build_story: turn a model (a build_model open_url and / or modelling steps) plus keyframed motions, a camera path and captions
// into a Spider Build v2 story (models/spider-build-v2.md) that the editor's Stories player and player.html play on a timeline.
// Stateless like build_model: the whole story travels packed in the link's #story= fragment (deflate-raw, base64url).
//
// Two ways to store the motion, chosen by `mode` (auto picks the first that fits):
// - animation: tracks.animation, one rigid affine channel per distinct motion, sampled on a shared clock; the GPU blends the
//   matrices (smooth, small). At most 64 channels (the engine's limit).
// - frames: stop-motion on tracks.construction: at every frame only the objects that moved are put again with their moved
//   mesh. No channel limit; the size grows with how much moves, not with the length of the story.

import { pack, unpack, publicTools } from './http.js';
import { expandInstances } from './scene.js';
import { validateBuildDocument, sceneAt } from '../models/spider-build-v2.mjs';

export class StoryFail extends Error {}
const fail = (m) => {
  throw new StoryFail(m);
};

const MAX_URL = 200000;
const MAX_CHANNELS = 64;
const EASES = { linear: (t) => t, smooth: (t) => t * t * (3 - 2 * t), in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), cut: (t) => (t < 1 ? 0 : 1) };
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** background: "transparent" (also "none") or a #rgb / #rrggbb colour -> "transparent" | "#rrggbb"; undefined stays undefined. */
export const storyBackground = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') fail('background: "transparent" or a #rrggbb colour');
  const s = v.trim().toLowerCase();
  if (s === 'transparent' || s === 'none') return 'transparent';
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (!m) fail(`background: "${v}" is not "transparent" or a #rrggbb colour`);
  return `#${m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]}`;
};
const vec3 = (v, d, path) => {
  if (v === undefined) return d;
  if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) fail(`${path}: expected [x, y, z]`);
  return v;
};

// ---- 3x4 row-major affine matrices [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]
const mul = (a, b) => {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
};
const translate = ([x, y, z]) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const scaling = (s) => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0];
const rotX = (d) => {
  const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
};
const rotY = (d) => {
  const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
};
const rotZ = (d) => {
  const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
};
const IDENTITY = translate([0, 0, 0]);
const apply = (m, p) => [0, 1, 2].map((r) => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]);
/** A pose (move, rotate [x, y, z] degrees, scale) about `pivot` -> a world matrix. Order as transform: scale, X, Z, Y, move. */
const poseMatrix = (pose, pivot) => {
  const s = typeof pose.scale === 'number' ? [pose.scale, pose.scale, pose.scale] : pose.scale ?? [1, 1, 1];
  const [rx, ry, rz] = pose.rotate ?? [0, 0, 0];
  let m = translate(pivot.map((v) => -v));
  m = mul(scaling(s), m);
  if (rx) m = mul(rotX(rx), m);
  if (rz) m = mul(rotZ(rz), m);
  if (ry) m = mul(rotY(ry), m);
  return mul(translate(pivot.map((v, i) => v + (pose.move?.[i] ?? 0))), m);
};
const lerpPose = (a, b, t) => {
  const l = (x, y) => x + (y - x) * t;
  const sv = (s) => (typeof s === 'number' ? [s, s, s] : s ?? [1, 1, 1]);
  return {
    move: [0, 1, 2].map((i) => l(a.move?.[i] ?? 0, b.move?.[i] ?? 0)),
    rotate: [0, 1, 2].map((i) => l(a.rotate?.[i] ?? 0, b.rotate?.[i] ?? 0)),
    scale: [0, 1, 2].map((i) => l(sv(a.scale)[i], sv(b.scale)[i])),
  };
};

const boundsOf = (meshes) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (const p of m.positions) for (let i = 0; i < 3; i++) ((lo[i] = Math.min(lo[i], p[i])), (hi[i] = Math.max(hi[i], p[i])));
  if (!Number.isFinite(lo[0])) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 1 };
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  return { min: lo, max: hi, center, radius: Math.max(0.5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2) };
};
/** Spider Build camera pose looking from eye to a point: yaw 0 looks to -z, + turns to +x, + pitch looks down. */
const lookPose = (eye, at, extra = {}) => {
  const d = at.map((v, i) => v - eye[i]), len = Math.hypot(...d) || 1;
  return { eye: eye.map(r4), yaw: r4((Math.atan2(d[0], -d[2]) * 180) / Math.PI), pitch: r4((Math.asin(Math.max(-1, Math.min(1, -d[1] / len))) * 180) / Math.PI), ...extra };
};

/** Objects named by a motion: `object`, `objects` [...] and / or `match` ("prefix*", "*suffix", "*part*" or an exact name). */
const selectObjects = (motion, names, path) => {
  const out = new Set();
  const add = (n) => {
    if (!names.includes(n)) fail(`${path}: no object "${n}"`);
    out.add(n);
  };
  if (typeof motion.object === 'string') add(motion.object);
  if (Array.isArray(motion.objects)) motion.objects.forEach((n) => add(String(n)));
  if (typeof motion.match === 'string') {
    const esc = motion.match.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`^${esc.join('.*')}$`);
    const hit = names.filter((n) => re.test(n));
    if (!hit.length) fail(`${path}: match "${motion.match}" names no object`);
    hit.forEach((n) => out.add(n));
  }
  if (!out.size) fail(`${path}: give object, objects or match`);
  return [...out];
};

/** The motion's keys, sorted, checked: [{ t, move, rotate, scale, ease }]. */
const keysOf = (motion, path) => {
  if (!Array.isArray(motion.keys) || !motion.keys.length) fail(`${path}.keys: give at least one key { t, move, rotate, scale }`);
  const keys = motion.keys.map((k, i) => {
    const p = `${path}.keys[${i}]`;
    if (!k || typeof k !== 'object') fail(`${p}: expected an object`);
    const t = k.t ?? k.time_ms;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) fail(`${p}.t: a time in ms, 0 or more`);
    const ease = k.ease ?? motion.ease ?? 'smooth';
    if (!EASES[ease]) fail(`${p}.ease: one of ${Object.keys(EASES).join(', ')}`);
    const scale = k.scale === undefined ? undefined : typeof k.scale === 'number' ? k.scale : vec3(k.scale, undefined, `${p}.scale`);
    if (scale !== undefined && (typeof scale === 'number' ? scale <= 0 : scale.some((v) => v <= 0))) fail(`${p}.scale: must be positive`);
    return { t, ease, move: vec3(k.move, [0, 0, 0], `${p}.move`), rotate: vec3(k.rotate, [0, 0, 0], `${p}.rotate`), scale: scale ?? 1 };
  });
  keys.sort((a, b) => a.t - b.t);
  return keys;
};
const poseAt = (keys, t) => {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b.t) {
      const a = keys[i - 1];
      return lerpPose(a, b, EASES[b.ease]((t - a.t) / (b.t - a.t)));
    }
  }
  return keys.at(-1);
};

// face fields the story format keeps (materials only when the palette has them)
const cleanMesh = (mesh, materials) => ({
  positions: mesh.positions.map((p) => p.map((v) => +v)),
  faces: mesh.faces.map((f) => ({ v: f.v, ...(f.color ? { color: f.color } : {}), ...(f.mat && materials.has(f.mat) ? { mat: f.mat } : {}) })),
});
const r3 = (v) => Math.round(v * 1e3) / 1e3;
const movedMesh = (mesh, m) => ({ positions: mesh.positions.map((p) => apply(m, p).map(r3)), faces: mesh.faces });

/** The base scene: a build_model link (`from`) and / or modelling steps, run by the same engine as build_model. */
const baseScene = async (a, ctx) => {
  if (a.from === undefined && !(Array.isArray(a.steps) && a.steps.length)) fail('give the model: from (a build_model open_url) and / or steps');
  if (a.steps !== undefined && !Array.isArray(a.steps)) fail('steps must be a list of { tool, args }');
  const tool = publicTools().find((t) => t.name === 'build_model');
  let out;
  try {
    out = await tool.run({ steps: a.steps ?? [], from: a.from, render: 'none' }, ctx);
  } catch (e) {
    fail(String(e?.message ?? e));
  }
  if (out.failed) fail(`the model steps failed: ${out.steps.filter((s) => s.error).slice(0, 3).map((s) => `step ${s.step} (${s.tool}): ${s.error}`).join('; ')}`);
  if (!out.open_url) fail(out.note ?? 'the model could not be packed');
  const scene = expandInstances(unpack(/#scene=([A-Za-z0-9_-]+)/.exec(out.open_url)[1]));
  if (!scene.objects?.length) fail('the model has no objects');
  return scene;
};

export async function buildStory(a, ctx) {
  const background = storyBackground(a.background);
  if (a.preview_at !== undefined && (!Array.isArray(a.preview_at) || !a.preview_at.length || a.preview_at.length > 6 || a.preview_at.some((t) => typeof t !== 'number' || !Number.isFinite(t) || t < 0)))
    fail('preview_at: 1 to 6 times in ms, 0 or more');
  const scene = await baseScene(a, ctx);
  const palette = (Array.isArray(scene.palette) ? scene.palette : []).filter((m) => m?.name).map((m) => {
    const out = { name: m.name };
    for (const k of ['color']) if (typeof m[k] === 'string' && m[k]) out[k] = m[k];
    for (const k of ['metal', 'rough', 'emit', 'soft']) if (typeof m[k] === 'number' && Number.isFinite(m[k])) out[k] = m[k];
    if (typeof m.alpha === 'number' && m.alpha >= 0 && m.alpha <= 1) out.alpha = m.alpha;
    return out;
  });
  const materials = new Set(palette.map((m) => m.name));
  const rest = new Map(scene.objects.filter((o) => o?.mesh?.positions?.length).map((o) => [o.name, cleanMesh(o.mesh, materials)]));
  if (!rest.size) fail('the model has no mesh objects');

  // ---- shapes: an object's mesh changes continuously between shapes, other objects of the model (the shape
  // templates themselves are left out of the story). Vertex i morphs from vertex i of the previous shape; a vertex
  // the previous shape lacks grows out of the previous shape's nearest vertex (so an extrude_face result grows).
  if (a.shapes !== undefined && !Array.isArray(a.shapes)) fail('shapes must be a list');
  const templates = new Set();
  const shaping = new Map(); // object -> sorted keys [{ t, shape, ease }]
  (a.shapes ?? []).forEach((sh, i) => {
    const path = `shapes[${i}]`;
    if (!sh || typeof sh !== 'object' || typeof sh.object !== 'string' || !rest.has(sh.object)) fail(`${path}.object: the name of an object of the model`);
    if (shaping.has(sh.object)) fail(`${path}: "${sh.object}" already has shapes (one shapes entry per object)`);
    if (!Array.isArray(sh.keys) || !sh.keys.length) fail(`${path}.keys: give at least one key { t, shape }`);
    const keys = sh.keys.map((k, j) => {
      const p = `${path}.keys[${j}]`;
      const t = num(k?.t ?? k?.time_ms, NaN);
      if (!(t >= 0)) fail(`${p}.t: a time in ms, 0 or more`);
      if (typeof k.shape !== 'string' || !rest.has(k.shape)) fail(`${p}.shape: the name of an object of the model (its mesh is the shape)`);
      const ease = k.ease ?? sh.ease ?? 'smooth';
      if (!EASES[ease]) fail(`${p}.ease: one of ${Object.keys(EASES).join(', ')}`);
      if (k.shape !== sh.object) templates.add(k.shape);
      return { t, shape: k.shape, ease };
    }).sort((x, y) => x.t - y.t);
    keys.forEach((k, j) => j && k.t === keys[j - 1].t && fail(`${path}.keys: two keys at ${k.t} ms`));
    shaping.set(sh.object, keys);
  });
  for (const o of shaping.keys()) if (templates.has(o)) fail(`shapes: "${o}" is both a shaped object and a shape`);
  const names = [...rest.keys()].filter((n) => !templates.has(n));
  if (!names.length) fail('the model has no mesh objects');

  // ---- motions -> per object: keys + pivot
  if (a.motions !== undefined && !Array.isArray(a.motions)) fail('motions must be a list');
  const moving = new Map(); // name -> { keys, pivot, sig }
  (a.motions ?? []).forEach((motion, i) => {
    const path = `motions[${i}]`;
    if (!motion || typeof motion !== 'object') fail(`${path}: expected an object`);
    const keys = keysOf(motion, path);
    for (const name of selectObjects(motion, names, path)) {
      if (moving.has(name)) fail(`${path}: "${name}" already has a motion (one motion per object)`);
      const b = boundsOf([rest.get(name)]);
      const pivot = Array.isArray(motion.pivot) ? vec3(motion.pivot, null, `${path}.pivot`) : motion.pivot === 'foot' ? [b.center[0], b.min[1], b.center[2]] : b.center;
      // objects with the same keys and pivot share one animation channel
      moving.set(name, { keys, pivot, sig: JSON.stringify([keys, pivot]) });
    }
  });

  // ---- captions
  const captions = (Array.isArray(a.captions) ? a.captions : []).map((c, i) => {
    const p = `captions[${i}]`;
    const start = num(c?.start ?? c?.start_ms, NaN), end = num(c?.end ?? c?.end_ms, NaN);
    if (!(start >= 0) || !(end > start)) fail(`${p}: start (ms, 0 or more) and a later end`);
    if (typeof c.text !== 'string' || !c.text.trim()) fail(`${p}.text: the caption's text`);
    const channel = c.channel ?? 'voiceover';
    if (!['chapter', 'operation', 'voiceover'].includes(channel)) fail(`${p}.channel: chapter, operation or voiceover`);
    return { start, end, text: c.text.trim(), channel };
  }).sort((x, y) => x.start - y.start);

  // ---- camera keys (explicit) are read before the duration is known
  const cam = a.camera ?? {};
  if (typeof cam !== 'object' || Array.isArray(cam)) fail('camera: an object { orbit } or { keys }');
  const camKeys = Array.isArray(cam.keys) ? cam.keys.map((k, i) => {
    const p = `camera.keys[${i}]`;
    const t = num(k?.t ?? k?.time_ms, NaN);
    if (!(t >= 0)) fail(`${p}.t: a time in ms`);
    const transition = k.transition ?? 'smoothstep';
    if (!['cut', 'linear', 'smoothstep'].includes(transition)) fail(`${p}.transition: cut, linear or smoothstep`);
    return { ...k, t, transition };
  }).sort((x, y) => x.t - y.t) : null;

  for (const o of shaping.keys()) if (moving.has(o)) fail(`shapes: "${o}" also has a motion (a shaped object cannot move as well)`);
  const lastKey = Math.max(0, ...[...moving.values()].map((m) => m.keys.at(-1).t), ...[...shaping.values()].map((k) => k.at(-1).t), ...captions.map((c) => c.end), ...(camKeys ?? []).map((k) => k.t));
  const duration = Math.round(num(a.duration_ms, lastKey + num(a.hold_ms, 800)));
  if (duration <= 0) fail('duration_ms: give a positive length (or keys later than 0)');
  if (duration > 600000) fail('duration_ms: at most 10 minutes');
  if (duration < lastKey) fail(`duration_ms: ${duration} ends before the last key / caption (${lastKey})`);

  // ---- mode
  const channelSigs = [...new Set([...moving.values()].map((m) => m.sig))];
  const mode = a.mode ?? 'auto';
  if (!['auto', 'animation', 'frames'].includes(mode)) fail('mode: auto, animation or frames');
  if (mode === 'animation' && channelSigs.length > MAX_CHANNELS) fail(`mode animation: ${channelSigs.length} distinct motions, the engine blends at most ${MAX_CHANNELS} (use mode frames, or share keys and pivots)`);
  const useFrames = mode === 'frames' || (mode === 'auto' && channelSigs.length > MAX_CHANNELS);
  const step = Math.max(10, Math.round(num(a.sample_ms, useFrames ? 80 : 50)));
  const grid = new Set([0, duration]);
  for (let t = 0; t < duration; t += step) grid.add(Math.round(t));
  // in animation mode the motions' own key times are sampled exactly too (frames mode keeps to its frame clock)
  if (!useFrames) for (const m of moving.values()) for (const k of m.keys) if (k.t <= duration) grid.add(Math.round(k.t));
  const times = [...grid].sort((x, y) => x - y);

  // ---- assets: identical meshes are stored once
  const meshes = {}, byJson = new Map();
  const meshRef = (mesh) => {
    const json = JSON.stringify(mesh);
    let id = byJson.get(json);
    if (!id) {
      id = `m${byJson.size + 1}`;
      byJson.set(json, id);
      meshes[id] = mesh;
    }
    return id;
  };
  const matrixAt = (m, t) => poseMatrix(poseAt(m.keys, t), m.pivot);
  const objects = names.map((name) => {
    const m = moving.get(name);
    // in frames mode an object starts in its pose at time 0 (its first key may already move it)
    const mesh = useFrames && m ? movedMesh(rest.get(name), matrixAt(m, 0)) : shaping.has(name) ? rest.get(shaping.get(name)[0].shape) : rest.get(name);
    return { name, meshRef: meshRef(mesh) };
  });

  const steps = [];
  let animation;
  if (useFrames) {
    const last = new Map([...moving].map(([n, m]) => [n, JSON.stringify(matrixAt(m, 0).map(r4))]));
    let id = 0;
    for (const t of times) {
      if (t === 0) continue;
      const changes = [];
      for (const [name, m] of moving) {
        const mat = matrixAt(m, t), sig = JSON.stringify(mat.map(r4));
        if (sig === last.get(name)) continue;
        last.set(name, sig);
        changes.push({ type: 'put', object: { name, meshRef: meshRef(movedMesh(rest.get(name), mat)) } });
      }
      if (changes.length) steps.push({ id: `frame-${String(++id).padStart(5, '0')}`, timeMs: t, command: { tool: 'pose', args: { frame: id, objects: changes.length } }, changes });
    }
  } else if (moving.size) {
    const channelOf = new Map(channelSigs.map((s, i) => [s, `ch${i + 1}`]));
    const sample = new Map();
    for (const m of moving.values()) if (!sample.has(m.sig)) sample.set(m.sig, m);
    animation = {
      timesMs: times,
      channels: channelSigs.map((s) => ({ id: channelOf.get(s), matrices: times.map((t) => matrixAt(sample.get(s), t).map(r4)) })),
      bindings: [...moving].map(([name, m]) => ({ object: name, channel: channelOf.get(m.sig) })),
    };
  }

  // ---- shapes -> construction steps that put the morphing mesh every shape_ms
  const shapeStep = Math.max(20, Math.round(num(a.shape_ms, 70)));
  let shapeFrames = 0;
  const r3 = (v) => Math.round(v * 1e3) / 1e3;
  for (const [name, keys] of shaping) {
    for (let j = 1; j < keys.length; j++) {
      const A = keys[j - 1], B = keys[j];
      if (A.shape === B.shape || A.t > duration) continue;
      const pa = rest.get(A.shape).positions, target = rest.get(B.shape);
      const nearest = (q) => pa.reduce((best, p) => ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 < best.d ? { p, d: (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 } : best), { p: q, d: Infinity }).p;
      const start = target.positions.map((q, i) => (i < pa.length ? pa[i] : nearest(q)));
      const span = B.t - A.t, ease = EASES[B.ease];
      const at = [];
      for (let t = A.t + shapeStep; t < B.t; t += shapeStep) at.push(Math.round(t));
      at.push(B.t);
      for (const t of at) {
        if (t > duration) break;
        const f = ease((t - A.t) / span);
        const mesh = t === B.t || f >= 1 ? target : { positions: target.positions.map((q, i) => q.map((v, c) => r3(start[i][c] + (v - start[i][c]) * f))), faces: target.faces };
        steps.push({ id: `shape-${String(++shapeFrames).padStart(5, '0')}`, timeMs: t, command: { tool: 'shape', args: { object: name, shape: B.shape } }, changes: [{ type: 'put', object: { name, meshRef: meshRef(mesh) } }] });
      }
    }
  }
  if (shapeFrames) steps.sort((x, y) => x.timeMs - y.timeMs);

  // ---- camera: explicit keys, or an orbit (default: one slow turn round the whole motion)
  const swept = [...rest.entries()].filter(([n]) => !templates.has(n) || [...shaping.values()].some((k) => k.some((x) => x.shape === n))).map(([, m]) => m);
  for (const [name, m] of moving) for (const t of [times[Math.floor(times.length / 2)], duration]) swept.push(movedMesh(rest.get(name), matrixAt(m, t)));
  const b = boundsOf(swept);
  let initialPose, keyframes = [];
  const extra = (k) => ({ ...(typeof k.fov === 'number' ? { fov: Math.max(5, Math.min(150, k.fov)) } : {}), ...(typeof k.roll === 'number' ? { roll: k.roll } : {}) });
  if (camKeys) {
    const poses = camKeys.map((k, i) => {
      const p = `camera.keys[${i}]`;
      const eye = vec3(k.eye, null, `${p}.eye`);
      if (!eye) fail(`${p}.eye: where the camera is`);
      if (k.look_at !== undefined || (k.yaw === undefined && k.pitch === undefined)) return { t: k.t, transition: k.transition, pose: lookPose(eye, vec3(k.look_at, b.center, `${p}.look_at`), extra(k)) };
      return { t: k.t, transition: k.transition, pose: { eye, yaw: num(k.yaw, 0), pitch: Math.max(-90, Math.min(90, num(k.pitch, 0))), ...extra(k) } };
    });
    initialPose = poses[0].pose;
    let prev = -1;
    poses.forEach((p, i) => {
      if (p.t > duration) fail(`camera.keys[${i}].t: after the end (${duration})`);
      if (p.t <= prev) fail(`camera.keys[${i}].t: camera times must be different`);
      prev = p.t;
      keyframes.push({ id: `cam-${i + 1}`, timeMs: p.t, transition: p.transition, pose: p.pose });
    });
  } else {
    const o = cam.orbit ?? {};
    const center = vec3(o.center, b.center, 'camera.orbit.center');
    const radius = num(o.radius, b.radius * 2.6 + 1);
    const height = num(o.height, center[1] + radius * 0.45);
    const turns = num(o.turns, 0.25);
    const start = num(o.start_yaw, 35);
    const at = (deg) => {
      const r = (deg * Math.PI) / 180;
      return lookPose([center[0] + Math.sin(r) * radius, height, center[2] + Math.cos(r) * radius], center, extra(o));
    };
    initialPose = at(start);
    const n = Math.max(1, Math.ceil((Math.abs(turns) * 360) / 10));
    for (let i = 1; i <= n && turns; i++) keyframes.push({ id: `orbit-${i}`, timeMs: Math.round((duration * i) / n), transition: 'linear', pose: at(start + (turns * 360 * i) / n) });
  }

  const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 120) : 'spider-paint story';
  const doc = {
    format: 'spider-build-tutorial',
    version: 2,
    metadata: { id: `spider-paint-story-${Date.now().toString(36)}`, title, language: 'en', units: 'metres', createdAt: new Date().toISOString() },
    timeline: { timeUnit: 'ms', durationMs: duration },
    assets: { meshes, audio: {} },
    scene: { palette, objects },
    chapters: [],
    tracks: {
      construction: { steps },
      camera: { initialPose, keyframes, presets: {} },
      narration: { cues: captions.map((c, i) => ({ id: `cue-${i + 1}`, startMs: c.start, endMs: Math.min(c.end, duration), channel: c.channel, language: 'en', text: c.text })) },
      ...(animation ? { animation } : {}),
    },
    ...(background ? { presentation: { background } } : {}),
  };
  try {
    validateBuildDocument(doc);
  } catch (e) {
    fail(`the story did not validate: ${e.message}`);
  }
  const packed = pack(doc);
  const open_url = `${ctx.origin}/#story=${packed}`;
  const fits = open_url.length <= MAX_URL;
  return {
    doc,
    summary: {
      title,
      mode: useFrames ? 'frames' : 'animation',
      duration_ms: duration,
      objects: names.length,
      animated: moving.size,
      ...(useFrames ? { frames: steps.length - shapeFrames, frame_ms: step } : { channels: animation?.channels.length ?? 0, samples: times.length }),
      ...(shaping.size ? { shaped: shaping.size, shape_frames: shapeFrames, shape_ms: shapeStep } : {}),
      captions: captions.length,
      camera: camKeys ? `${keyframes.length} keys` : 'orbit',
      ...(background ? { background } : {}),
      link_chars: open_url.length,
      ...(fits
        ? { open_url, player_url: `${ctx.origin}/player.html${background ? `?bg=${encodeURIComponent(background)}` : ''}#story=${packed}`, story_token: packed }
        : { open_url: null, note: `the story is too big for a link (${open_url.length} characters): fewer frames (sample_ms), fewer moving objects, or include_doc and save it as a .build.json` }),
    },
  };
}

/** Preview: the story at a few moments, as objects to rasterize. `at`: chosen times in ms (clamped into the story, at most 6);
 * without it `count` moments spread evenly from the start to the end. */
export const storyMoments = (doc, count = 3, at) => {
  const d = doc.timeline.durationMs;
  const times = Array.isArray(at) && at.length
    ? [...new Set(at.filter((t) => typeof t === 'number' && Number.isFinite(t)).map((t) => Math.round(Math.max(0, Math.min(d, t)))))].slice(0, 6)
    : Array.from({ length: count }, (_, i) => Math.round((d * i) / Math.max(1, count - 1)));
  return times.map((t) => ({ t, objects: sceneAt(doc, t) }));
};

// (copied from 3Draft 86d0954 by scripts/sync.mjs: change it there)
// The model and its tools. One scene of named objects (meshes), edited by tool calls
// and judged by the deterministic SVG preview. No I/O except save/load of JSON files
// under the working directory. The MCP transport is in server.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { skyScene, SKY_TYPES, box, extrude, extrudeFace, moveVertices, faceNormal, faceCenter, merge, rotate, bounds, makeCamera, orbit, pick, ray as camRay, renderView, renderSheet, validate, boolean, VIEW_ORDER, triangulate, buildCharacter, normalizeCharacter, variateCharacter, posed, walkPose, HUMANOID_POSES, CHARACTER_PRESETS, makeJoint, jointNow, hingeTo, pivotTo, railTo, carried, moveMesh, springMesh } from './engine/index.js';

export class ToolError extends Error {}
const fail = (message) => {
  throw new ToolError(message);
};

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const rv = (v) => v.map(r6);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

const vec3 = (v, what, fallback) => {
  if (v === undefined) return fallback ?? fail(`${what} is required`);
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) fail(`${what} must be [x, y, z], three numbers`);
  return v;
};
const name = (v) => {
  if (typeof v !== 'string' || !v.trim() || v.length > 64) fail('name must be a non-empty string of at most 64 characters');
  return v;
};
const color = (v, fallback = '#c8c8c8') => {
  if (v === undefined) return fallback;
  if (typeof v !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) fail('color must be #rgb or #rrggbb');
  return v;
};
const number = (v, what, { min = -Infinity, max = Infinity, fallback } = {}) => {
  if (v === undefined) return fallback ?? fail(`${what} is required`);
  if (!isNum(v) || v < min || v > max) fail(`${what} must be a number between ${min} and ${max}`);
  return v;
};

/** Validates raw mesh data from a client: positions [[x,y,z]], faces [{ v: [indices], color? }]. */
const parseMesh = (positions, faces, fallbackColor) => {
  if (!Array.isArray(positions) || positions.length < 3) fail('positions must be a list of at least 3 [x, y, z] points');
  positions.forEach((p, i) => vec3(p, `positions[${i}]`));
  if (!Array.isArray(faces) || !faces.length) fail('faces must be a non-empty list of { v: [indices], color? }');
  const out = faces.map((f, i) => {
    const v = f?.v;
    if (!Array.isArray(v) || v.length < 3) fail(`faces[${i}].v needs at least 3 vertex indices`);
    v.forEach((k) => {
      if (!Number.isInteger(k) || k < 0 || k >= positions.length) fail(`faces[${i}].v has index ${k}, but there are ${positions.length} positions`);
    });
    return { v: [...v], color: color(f.color, fallbackColor), ...(typeof f.mat === 'string' ? { mat: f.mat } : {}) };
  });
  return { positions: positions.map((p) => [...p]), faces: out };
};

const extent = (mesh) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.positions) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[a]);
      max[a] = Math.max(max[a], p[a]);
    }
  }
  return { min: rv(min), max: rv(max) };
};

// ---- vectors, rotations and a ray cast, for place_on (the G G of the viewer) and the rotations of transform
const vsub = (a, b) => a.map((v, i) => v - b[i]);
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a) => {
  const l = Math.hypot(...a);
  return l > 0 ? a.map((v) => v / l) : a;
};
// rotate every point by `angle` (radians) round the unit `axis` through `pivot` (Rodrigues)
const turnAbout = (mesh, axis, angle, pivot) => {
  if (!angle) return mesh;
  const k = vnorm(axis), c = Math.cos(angle), sn = Math.sin(angle);
  return {
    ...mesh,
    positions: mesh.positions.map((p) => {
      const v = vsub(p, pivot), kv = vcross(k, v), d = vdot(k, v);
      return [0, 1, 2].map((i) => pivot[i] + v[i] * c + kv[i] * sn + k[i] * d * (1 - c));
    }),
  };
};
// turn the mesh round `pivot` so that its up (+y) points along `n`
const upTo = (mesh, n, pivot) => {
  const u = vnorm(n), d = Math.max(-1, Math.min(1, u[1]));
  if (d > 1 - 1e-9) return mesh;
  if (d < -1 + 1e-9) return turnAbout(mesh, [1, 0, 0], Math.PI, pivot);
  return turnAbout(mesh, vcross([0, 1, 0], u), Math.acos(d), pivot);
};
// the nearest face of `targets` ([name, mesh] pairs) along the ray; the normal faces the ray's origin. With all: every hit,
// nearest first, each with `facing`: true where the ray meets the face's outside (entering a closed object), false inside
const castRay = (targets, origin, dir, { all = false } = {}) => {
  const D = vnorm(dir);
  let best = null;
  const hits = [];
  for (const [n, mesh] of targets) {
    mesh.faces.forEach((f, fi) => {
      const pts = f.v.map((k) => mesh.positions[k]);
      for (const [a, b, c] of triangulate(pts)) {
        const A = pts[a], e1 = vsub(pts[b], A), e2 = vsub(pts[c], A), P = vcross(D, e2), det = vdot(e1, P);
        if (det * det <= 1e-24 * vdot(e1, e1) * vdot(e2, e2)) continue;
        const T = vsub(origin, A), u = vdot(T, P) / det;
        if (u < 0 || u > 1) continue;
        const Q = vcross(T, e1), v = vdot(D, Q) / det;
        if (v < 0 || u + v > 1) continue;
        const t = vdot(e2, Q) / det;
        if (t > 1e-9 && (all || !best || t < best.t)) {
          const out = vnorm(faceNormal(pts));
          const facing = vdot(out, D) < 0;
          const hit = { t, object: n, face: fi, point: origin.map((o, i) => o + D[i] * t), normal: facing ? out : out.map((x) => -x), facing };
          if (all) hits.push(hit);
          else best = hit;
          break; // (one hit a face: a ray along a diagonal would meet both its triangles)
        }
      }
    });
  }
  return all ? hits.sort((a, b) => a.t - b.t) : best;
};
// the foot of a mesh: the middle of the bottom of its bounding box (for a figure: the middle of where it stands)
const footOf = (mesh) => {
  const { min, max } = extent(mesh);
  return [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
};

// the map that takes mesh `a` to mesh `b` (same vertices moved by a turn, a uniform size and a move), from three spread vertices
const rigidBetween = (a, b) => {
  const P = a.positions, Q = b.positions;
  let i1 = 0, d1 = -1;
  P.forEach((p, i) => { const d = Math.hypot(...vsub(p, P[0])); if (d > d1) ((d1 = d), (i1 = i)); });
  const u = vnorm(vsub(P[i1], P[0]));
  let i2 = 0, d2 = -1;
  P.forEach((p, i) => { const w = vsub(p, P[0]); const d = Math.hypot(...vsub(w, u.map((x) => x * vdot(w, u)))); if (d > d2) ((d2 = d), (i2 = i)); });
  const frame = (X, i) => {
    const x = vnorm(vsub(X[i1], X[0])), z = vnorm(vcross(x, vsub(X[i2], X[0]))), y = vcross(z, x);
    return { o: X[0], R: [x, y, z], s: Math.hypot(...vsub(X[i1], X[0])) };
  };
  if (d1 <= 0 || d2 <= 1e-12) { const t = vsub(Q[0], P[0]); return (p) => p.map((v, k) => v + t[k]); }
  const fa = frame(P), fb = frame(Q), k = fb.s / fa.s;
  return (p) => {
    const w = vsub(p, fa.o), l = fa.R.map((r) => vdot(r, w));
    return [0, 1, 2].map((c) => fb.o[c] + k * (fb.R[0][c] * l[0] + fb.R[1][c] * l[1] + fb.R[2][c] * l[2]));
  };
};

const safePath = (p) => {
  if (typeof p !== 'string' || !p) fail('path must be a string');
  const full = resolve(process.cwd(), p);
  const rel = relative(process.cwd(), full);
  if (rel.startsWith('..') || isAbsolute(rel)) fail('path must stay inside the server working directory');
  if (extname(full) !== '.json') fail('path must end in .json');
  return full;
};

const vec3Schema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const nameSchema = { type: 'string', description: 'Object name, unique in the scene.' };
const colorSchema = { type: 'string', description: 'Face color, #rgb or #rrggbb.' };
const replaceSchema = { type: 'boolean', description: 'Overwrite an existing object with this name.' };
const viewProps = {
  view: {
    type: 'string',
    enum: [...VIEW_ORDER, 'sheet', 'orbit'],
    description: "front (eye on +z), side (eye on +x), top (eye on +y, -z is up), persp, orbit (uses yaw/pitch) or sheet (all four views on one 2x2 sheet; render only). Default: sheet for render, persp for pick.",
  },
  yaw: { type: 'number', description: 'orbit view, degrees: 0 looks from +z, 90 from -x, -90 from +x.' },
  pitch: { type: 'number', description: 'orbit view, degrees above the horizon (default 25).' },
  size: { type: 'number', description: 'Panel size in pixels, default 320.' },
};

export const createScene = () => {
  const objects = new Map();
  const listeners = new Set();
  let rev = 0; // grows with every change, so a viewer can tell it is up to date
  const info = { live: null }; // set by the server: { url, clients() }

  const groups = new Map(); // object name -> group name (objects of one group move as one)
  let joints = []; // the joints (src/joints.ts): glue, pivot, hinge, rail, spring
  const data = () => ({ format: '3draft-scene', version: 1, rev, objects: [...objects].map(([n, mesh]) => ({ name: n, mesh, ...(groups.has(n) ? { group: groups.get(n) } : {}) })), ...(joints.length ? { joints } : {}) });
  const linked = () => [...objects.keys()].map((n) => ({ name: n, group: groups.get(n) }));
  // the objects that move with `n` (its group, what is glued to it, what it holds), all moved by f(mesh) -> mesh
  const moveWith = (n, f) => {
    const names = carried([n], linked(), joints);
    for (const m of names) objects.set(m, f(objects.get(m)));
    stretchSprings();
    return names;
  };
  // the objects carried by `n` follow its move from `before` to `after` (the rigid map that takes the one mesh to the other)
  const carriedMove = (n, before, after) => {
    const others = carried([n], linked(), joints).filter((m) => m !== n);
    if (!others.length) return [];
    const map = rigidBetween(before, after);
    for (const m of others) objects.set(m, { ...objects.get(m), positions: objects.get(m).positions.map(map) });
    return others;
  };
  const stretchSprings = () => {
    for (const j of joints) if (j.spring && objects.has(j.spring.object) && objects.has(j.a) && objects.has(j.b)) objects.set(j.spring.object, springMesh(j, objects.get(j.a), objects.get(j.b)));
  };
  const dropLinks = (n) => {
    groups.delete(n);
    joints = joints.filter((j) => j.a !== n && j.b !== n);
  };

  const need = (n) => objects.get(name(n)) ?? fail(`no object named "${n}". Use list to see the objects.`);
  // the sensing set (what the cursor of the viewer would feel): every object except the ignored ones; sense, pick and place_on
  // look only at these. A call can narrow it further (exclude) or widen it (include: also ignored ones).
  const ignored = new Set();
  const names = (v, what) => (v === undefined ? [] : [v].flat().map((n) => (typeof n === 'string' ? n : fail(`${what} must be a name or a list of names`))));
  const sensed = ({ exclude, include, only } = {}) => {
    const ex = new Set(names(exclude, 'exclude')), inc = new Set(names(include, 'include'));
    [...ex, ...inc].forEach(need);
    const base = only !== undefined ? names(only, 'only').map((n) => (need(n), n)) : [...objects.keys()].filter((n) => !ignored.has(n) || inc.has(n));
    return base.filter((n) => !ex.has(n)).map((n) => [n, objects.get(n)]);
  };
  const groupList = () => {
    const out = {};
    for (const [n, g] of groups) (out[g] ??= []).push(n);
    return out;
  };
  const nowOut = (j) => {
    const n = jointNow(j, objects.get(j.a), objects.get(j.b));
    const r = (x) => (Array.isArray(x) ? (Array.isArray(x[0]) ? x.map(rv) : rv(x)) : r6(x));
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, typeof v === 'string' ? v : r(v)]));
  };
  const senseProps = {
    exclude: { description: 'leave these objects out of the sensing for this call (to see through them: to place behind or into them)', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    include: { description: 'take these in for this call even if the sensing set ignores them', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
  };
  const hitOut = (h, eye) => ({ object: h.object, face: h.face, point: rv(h.point), normal: rv(h.normal), distance: r6(h.t), ...(h.facing === undefined ? {} : { outside: h.facing }) });
  // a ray from the camera of a render (same view and size as render) through the pixel x, y
  const pixelRay = (a) => {
    if (!objects.size) fail('the scene is empty');
    const { mesh } = combined();
    const view = viewOf(a, 'persp');
    if (view === 'sheet') fail('a single view is needed, not the sheet');
    const size = number(a.size, 'size', { min: 64, max: 2000, fallback: 320 });
    const cam = makeCamera(view, mesh, size, bounds(mesh));
    return camRay(cam, number(a.x, 'x'), number(a.y, 'y'));
  };
  const put = (n, mesh, replace) => {
    name(n);
    if (objects.has(n) && !replace) fail(`"${n}" already exists; pass replace: true to overwrite it, or pick another name.`);
    objects.set(n, mesh);
    return summary(n, mesh);
  };
  const summary = (n, mesh) => ({ name: n, vertices: mesh.positions.length, faces: mesh.faces.length, ...extent(mesh) });

  const combined = () => {
    const names = [...objects.keys()];
    const meshes = names.map((n) => objects.get(n));
    const owners = [];
    let start = 0;
    names.forEach((n, i) => {
      owners.push({ name: n, start, end: start + meshes[i].faces.length });
      start += meshes[i].faces.length;
    });
    return { mesh: merge(...meshes), owners };
  };

  const viewOf = (args, fallback) => {
    const v = args.view ?? fallback;
    if (v === 'orbit') {
      const yaw = (number(args.yaw, 'yaw', { fallback: 35 }) * Math.PI) / 180;
      const pitch = (number(args.pitch, 'pitch', { min: -90, max: 90, fallback: 25 }) * Math.PI) / 180;
      return orbit({ yaw, pitch });
    }
    if (VIEW_ORDER.includes(v) || v === 'sheet') return v;
    return fail(`unknown view "${v}"`);
  };

  // a viewer command: to every open viewer through the live link (`view` event)
  const sendView = (cmd) => {
    if (!info.live?.command) fail('the live viewer is off (3DRAFT_LIVE=0) or could not bind a port');
    const sent = info.live.command(cmd);
    return sent ? { sent_to: sent, ...cmd } : { sent_to: 0, note: 'no viewer is open: call viewer for the URL and ask the user to open it' };
  };

  const tools = [
    {
      name: 'add_box',
      description: 'Add an axis-aligned box. `at` is the CENTER, so its bottom is at at[1] - size[1] / 2. Y is up, the ground is y = 0. Units are arbitrary but keep them consistent.',
      inputSchema: {
        type: 'object',
        properties: { name: nameSchema, size: { ...vec3Schema, description: '[width x, height y, depth z], default [1,1,1].' }, at: { ...vec3Schema, description: 'center, default [0,0,0].' }, color: colorSchema, replace: replaceSchema },
        required: ['name'],
      },
      run: (a) => put(name(a.name), box({ size: vec3(a.size, 'size', [1, 1, 1]), at: vec3(a.at, 'at', [0, 0, 0]), color: color(a.color) }), a.replace),
    },
    {
      name: 'add_extrusion',
      description: 'Add a prism: a CONVEX footprint polygon on the ground plane, given as [[x, z], ...] in any winding, extruded up by `height` from `y`. Use it for triangles, hexagons, wedges, roofs, columns. Concave shapes must be split into several convex extrusions.',
      inputSchema: {
        type: 'object',
        properties: { name: nameSchema, polygon: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, minItems: 3, description: '[[x, z], ...]' }, height: { type: 'number' }, y: { type: 'number', description: 'bottom, default 0' }, color: colorSchema, replace: replaceSchema },
        required: ['name', 'polygon', 'height'],
      },
      run: (a) => {
        if (!Array.isArray(a.polygon) || a.polygon.length < 3 || !a.polygon.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum))) fail('polygon must be [[x, z], ...] with at least 3 points');
        let mesh;
        try {
          mesh = extrude({ polygon: a.polygon, height: number(a.height, 'height', { min: 1e-9 }), y: number(a.y, 'y', { fallback: 0 }), color: color(a.color) });
        } catch (e) {
          fail(e.message);
        }
        return put(name(a.name), mesh, a.replace);
      },
    },
    {
      name: 'add_mesh',
      description: 'Add a raw mesh: `positions` [[x,y,z],...] and `faces` [{ v: [indices], color }]. Each face must be planar, convex and listed COUNTER-CLOCKWISE seen from outside (right-hand rule: the normal points out). Run inspect afterwards.',
      inputSchema: {
        type: 'object',
        properties: {
          name: nameSchema,
          positions: { type: 'array', items: vec3Schema },
          faces: { type: 'array', items: { type: 'object', properties: { v: { type: 'array', items: { type: 'integer' }, minItems: 3 }, color: colorSchema }, required: ['v'] } },
          color: { ...colorSchema, description: 'Default color for faces without one.' },
          replace: replaceSchema,
        },
        required: ['name', 'positions', 'faces'],
      },
      run: (a) => put(name(a.name), parseMesh(a.positions, a.faces, color(a.color)), a.replace),
    },
    {
      name: 'transform',
      description: 'Scale, then rotate round X, then round Z, then round Y, then move an object. Scale and rotations are about the center of its bounding box (or about `pivot`). Rotations are degrees, counter-clockwise looking from the + end of the axis towards the origin (right-hand rule): rotate_y 90 turns +x into -z, rotate_x 90 turns +y into +z, rotate_z 90 turns +x into +y.',
      inputSchema: {
        type: 'object',
        properties: {
          name: nameSchema,
          scale: { description: 'Positive number, or [sx, sy, sz].', oneOf: [{ type: 'number' }, vec3Schema] },
          rotate_x: { type: 'number', description: 'degrees round the X axis (tilts forward / back)' },
          rotate_z: { type: 'number', description: 'degrees round the Z axis (tilts left / right)' },
          rotate_y: { type: 'number', description: 'degrees, counter-clockwise seen from above' },
          pivot: { ...vec3Schema, description: 'the point to scale and rotate about, default the center of the bounding box (e.g. a hinge, or the foot to tip a thing over)' },
          move: { ...vec3Schema, description: 'translation [dx, dy, dz]' },
        },
        required: ['name'],
      },
      run: (a) => {
        let mesh = need(a.name);
        const { min, max } = extent(mesh);
        const c = a.pivot !== undefined ? vec3(a.pivot, 'pivot') : [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
        if (a.scale !== undefined) {
          const s = isNum(a.scale) ? [a.scale, a.scale, a.scale] : vec3(a.scale, 'scale');
          if (!s.every((v) => v > 0)) fail('scale must be positive');
          mesh = { ...mesh, positions: mesh.positions.map((p) => p.map((v, i) => c[i] + (v - c[i]) * s[i])) };
        }
        if (a.rotate_x !== undefined) mesh = turnAbout(mesh, [1, 0, 0], (number(a.rotate_x, 'rotate_x') * Math.PI) / 180, c);
        if (a.rotate_z !== undefined) mesh = turnAbout(mesh, [0, 0, 1], (number(a.rotate_z, 'rotate_z') * Math.PI) / 180, c);
        if (a.rotate_y !== undefined) {
          const yaw = (number(a.rotate_y, 'rotate_y') * Math.PI) / 180;
          mesh = rotate(mesh, { yaw }, c);
        }
        if (a.move !== undefined) {
          const d = vec3(a.move, 'move');
          mesh = { ...mesh, positions: mesh.positions.map((p) => p.map((v, i) => v + d[i])) };
        }
        const along = carriedMove(a.name, objects.get(a.name), mesh);
        objects.set(a.name, mesh);
        stretchSprings();
        return { ...summary(a.name, mesh), ...(along.length ? { moved_along: along } : {}) };
      },
    },
    {
      name: 'place_on',
      description: 'Put an object down on the surface of others, like the viewer\'s G G: its foot (the middle of the bottom of its bounding box; for a character the middle of where it stands) goes onto the surface point, and with align "normal" its up turns to the surface normal (a thing on a slope, a ball, a wall). Say where with `at` [x, z] (dropped straight down there: the highest surface under that spot), or a pixel `x`, `y` of a render (the ray from the camera, like the viewer\'s cursor; view / yaw / pitch / size as render), or `point` (+ `normal`) from sense / pick, or a ray (`from` + `dir`). Default: straight down at the object\'s own x, z. It lands on the sensing set (see sensing) without itself, or on `onto`; exclude / include change the set for this call (exclude a wall to place behind it). Returns the new bounds and the surface it landed on with its distance along the ray.',
      inputSchema: {
        type: 'object',
        properties: {
          name: nameSchema,
          onto: { description: 'the object(s) to land on (a name or a list); default every other object', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          at: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[x, z]: drop straight down onto the surface at this spot (default: the object\'s own x, z, or the middle of `onto` when it is a single object)' },
          point: { ...vec3Schema, description: 'a surface point (e.g. from pick); no ray is cast' },
          normal: { ...vec3Schema, description: 'the surface normal at `point` (default up)' },
          from: { ...vec3Schema, description: 'cast a ray from here …' },
          dir: { ...vec3Schema, description: '… in this direction (e.g. [1, 0, 0] to hang a picture on a wall to the +x)' },
          x: { type: 'number', description: 'a pixel of a render: cast from the camera through it (with y, and view / yaw / pitch / size as for render)' },
          y: { type: 'number' },
          view: viewProps.view, yaw: viewProps.yaw, pitch: viewProps.pitch, size: viewProps.size,
          ...senseProps,
          align: { type: 'string', enum: ['up', 'normal'], description: 'up (default): the object stays upright; normal: its up turns to the surface normal' },
          turn: { type: 'number', description: 'degrees to turn it round its up axis first (counter-clockwise seen from above)' },
          gap: { type: 'number', description: 'lift it off the surface by this much along the normal (default 0)' },
        },
        required: ['name'],
      },
      run: (a) => {
        let mesh = need(a.name);
        const ontoNames = a.onto === undefined ? sensed(a).map(([n]) => n).filter((n) => n !== a.name) : names(a.onto, 'onto').filter((n) => !names(a.exclude, 'exclude').includes(n));
        ontoNames.forEach((n) => (n === a.name ? fail('an object cannot be placed on itself') : need(n)));
        const targets = ontoNames.map((n) => [n, objects.get(n)]);
        if (!targets.length) fail('there is nothing to place it on: add another object, or say `onto`');
        let surface;
        if (a.point !== undefined) {
          surface = { object: null, point: vec3(a.point, 'point'), normal: vnorm(vec3(a.normal, 'normal', [0, 1, 0])) };
        } else {
          let origin, dir;
          if (a.x !== undefined || a.y !== undefined) {
            ({ origin, dir } = pixelRay(a));
          } else if (a.from !== undefined || a.dir !== undefined) {
            origin = vec3(a.from, 'from');
            dir = vec3(a.dir, 'dir');
          } else {
            let xz;
            if (a.at !== undefined) {
              if (!Array.isArray(a.at) || a.at.length !== 2 || !a.at.every(isNum)) fail('at must be [x, z]');
              xz = a.at;
            } else if (ontoNames.length === 1 && a.onto !== undefined) {
              const e = extent(targets[0][1]);
              xz = [(e.min[0] + e.max[0]) / 2, (e.min[2] + e.max[2]) / 2];
            } else {
              const f = footOf(mesh);
              xz = [f[0], f[2]];
            }
            const top = Math.max(...targets.map(([, m]) => extent(m).max[1]));
            origin = [xz[0], top + 1, xz[1]];
            dir = [0, -1, 0];
          }
          surface = castRay(targets, origin, dir, { all: true }).find((h) => h.facing) ?? null; // (front faces, as the cursor)
          if (!surface) fail(`the ray from [${rv(origin)}] along [${rv(dir)}] hits nothing of ${ontoNames.join(', ')}`);
        }
        let foot = footOf(mesh);
        if (a.turn !== undefined) mesh = rotate(mesh, { yaw: (number(a.turn, 'turn') * Math.PI) / 180 }, foot);
        const align = a.align ?? 'up';
        if (align !== 'up' && align !== 'normal') fail('align must be "up" or "normal"');
        if (align === 'normal') mesh = upTo(mesh, surface.normal, foot);
        const up = align === 'normal' ? surface.normal : [0, 1, 0];
        const gap = number(a.gap, 'gap', { fallback: 0 });
        const goal = surface.point.map((v, i) => v + up[i] * gap);
        const d = vsub(goal, foot);
        mesh = { ...mesh, positions: mesh.positions.map((p) => p.map((v, i) => v + d[i])) };
        const along = carriedMove(a.name, objects.get(a.name), mesh);
        objects.set(a.name, mesh);
        stretchSprings();
        return { ...summary(a.name, mesh), ...(along.length ? { moved_along: along } : {}), surface: { object: surface.object, point: rv(surface.point), normal: rv(surface.normal), ...(surface.t !== undefined ? { distance: r6(surface.t) } : {}) } };
      },
    },
    {
      name: 'add_character',
      description: 'Add a character from the viewer\'s character builder: a stylized figure (about 1.6-1.9 tall, the units are metres) in a few meshes merged into one object, its feet on y = 0 at `at`, facing `yaw`. Presets: scientist, mechanic, crew (Space 1999 style uniform), astronaut. `seed` makes a random variation of the preset, `spec` overrides any field of the builder\'s spec (base: "male" | "female", body: { height, build, shoulders, head }, face: { shape, skin }, hair: { style, mat }, outfit: { kind, main, second, helmet }, prop). Pose: stand, sit (the seat under the hips at about 0.44) or walk (one stride). Give `onto` (and `at`) to stand it on a surface, as place_on.',
      inputSchema: {
        type: 'object',
        properties: {
          name: nameSchema,
          preset: { type: 'string', enum: Object.keys(CHARACTER_PRESETS), description: 'default crew' },
          seed: { type: 'integer', description: 'a random variation of the preset (face, hair, colours)' },
          spec: { type: 'object', description: 'fields that override the preset (see the description)' },
          pose: { type: 'string', enum: ['stand', 'sit', 'walk'], description: 'default stand' },
          at: { ...vec3Schema, description: 'where it stands (the middle of its feet), default [0, 0, 0]; with onto only x and z count' },
          yaw: { type: 'number', description: 'degrees: 0 faces +z, 90 faces +x, 180 faces -z' },
          onto: { description: 'stand it on the surface of this object (or these), straight down at `at`', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          replace: replaceSchema,
        },
        required: ['name'],
      },
      run: (a) => {
        name(a.name);
        if (objects.has(a.name) && !a.replace) fail(`"${a.name}" already exists; pass replace: true to overwrite it, or pick another name.`);
        const preset = a.preset ?? 'crew';
        if (!CHARACTER_PRESETS[preset]) fail(`unknown preset "${preset}"; one of ${Object.keys(CHARACTER_PRESETS).join(', ')}`);
        if (a.spec !== undefined && (typeof a.spec !== 'object' || Array.isArray(a.spec) || a.spec === null)) fail('spec must be an object');
        const P = CHARACTER_PRESETS[preset], o = a.spec ?? {};
        const merged = { ...P, ...o, body: { ...P.body, ...o.body }, face: { ...P.face, ...o.face }, hair: { ...P.hair, ...o.hair }, outfit: { ...P.outfit, ...o.outfit } };
        let spec = normalizeCharacter(merged);
        if (a.seed !== undefined) spec = variateCharacter(spec, Math.trunc(number(a.seed, 'seed')));
        const pose = a.pose ?? 'stand';
        if (!['stand', 'sit', 'walk'].includes(pose)) fail('pose must be stand, sit or walk');
        const c = buildCharacter(spec);
        const local = merge(...posed(c.parts.map((p) => p.mesh), c.rig, pose === 'sit' ? HUMANOID_POSES.sit : pose === 'walk' ? walkPose(0.12) : (HUMANOID_POSES.bind ?? {}), { ground: true }));
        const at = vec3(a.at, 'at', [0, 0, 0]);
        const yaw = (number(a.yaw, 'yaw', { fallback: 0 }) * Math.PI) / 180;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        let mesh = { positions: local.positions.map((p) => [at[0] + p[0] * cy + p[2] * sy, at[1] + p[1], at[2] - p[0] * sy + p[2] * cy]), faces: local.faces.map((f) => ({ ...f, v: [...f.v] })) };
        let surface;
        if (a.onto !== undefined) {
          const names = [a.onto].flat();
          const targets = names.map((n) => [n, need(n)]);
          const top = Math.max(...targets.map(([, m]) => extent(m).max[1]));
          surface = castRay(targets, [at[0], top + 1, at[2]], [0, -1, 0]);
          if (!surface) fail(`nothing of ${names.join(', ')} under x ${at[0]}, z ${at[2]}`);
          const d = [0, surface.point[1] - at[1], 0];
          mesh = { ...mesh, positions: mesh.positions.map((p) => p.map((v, i) => v + d[i])) };
        }
        objects.set(a.name, mesh);
        return { ...summary(a.name, mesh), preset, pose, base: spec.base, height: r6(spec.body.height), ...(surface ? { surface: { object: surface.object, point: rv(surface.point) } } : {}) };
      },
    },
    {
      name: 'sense',
      description: 'Feel the scene along a ray, as the viewer\'s cursor does from the camera: through pixel (x, y) of a render (same view and size as render), or from `from` along `dir`. Returns the first surface (object, face, point, normal, distance from the eye or `from`) and `hits`: everything along the ray, nearest first, with `outside` true where the ray enters an object and false where it leaves it, so you can see what is behind and how thick it is. Only the sensing set counts (see sensing); exclude / include change it for this call. Use the point and normal with place_on (point + normal), or give place_on the same pixel.',
      inputSchema: { type: 'object', properties: { ...viewProps, x: { type: 'number' }, y: { type: 'number' }, from: vec3Schema, dir: vec3Schema, ...senseProps, limit: { type: 'integer', description: 'at most this many hits (default 12)' } } },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const r = a.from !== undefined || a.dir !== undefined ? { origin: vec3(a.from, 'from'), dir: vec3(a.dir, 'dir') } : pixelRay(a);
        const targets = sensed(a);
        const hits = castRay(targets, r.origin, r.dir, { all: true });
        const limit = Math.trunc(number(a.limit, 'limit', { min: 1, max: 200, fallback: 12 }));
        const first = hits.find((h) => h.facing) ?? null;
        return { ray: { from: rv(r.origin), dir: rv(vnorm(r.dir)) }, sensed: targets.map(([n]) => n), first: first && hitOut(first), hits: hits.slice(0, limit).map((h) => hitOut(h)) };
      },
    },
    {
      name: 'sensing',
      description: 'The sensing set: which objects sense, pick and place_on feel (the viewer\'s cursor feels everything; here you choose). New objects are sensed. ignore takes objects out (e.g. a wall to place things behind it, a box to place into it), sense puts them back, only senses just these, reset senses everything again. Returns the sensed and the ignored objects.',
      inputSchema: {
        type: 'object',
        properties: {
          ignore: { description: 'take these out of the sensing', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          sense: { description: 'put these back into the sensing', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          only: { description: 'sense only these (all others ignored)', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          reset: { type: 'boolean', description: 'sense every object again' },
        },
      },
      run: (a) => {
        if (a.reset) ignored.clear();
        if (a.only !== undefined) {
          const keep = new Set(names(a.only, 'only').map((n) => (need(n), n)));
          for (const n of objects.keys()) if (!keep.has(n)) ignored.add(n);
          for (const n of keep) ignored.delete(n);
        }
        for (const n of names(a.ignore, 'ignore')) (need(n), ignored.add(n));
        for (const n of names(a.sense, 'sense')) (need(n), ignored.delete(n));
        for (const n of [...ignored]) if (!objects.has(n)) ignored.delete(n);
        return { sensed: [...objects.keys()].filter((n) => !ignored.has(n)), ignored: [...ignored] };
      },
    },
    {
      name: 'group',
      description: 'Make a group: the objects move as one (in the viewer a G on any of them takes the whole group; the user groups a B selection with Ctrl+G). `objects` join the group `name` (leaving any group they were in); `rename` gives the group a new name. Returns every group.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'the group\'s name' }, objects: { type: 'array', items: { type: 'string' }, description: 'the objects to put in it' }, rename: { type: 'string', description: 'a new name for the group' } },
        required: ['name'],
      },
      run: (a) => {
        const g = name(a.name);
        if (a.objects !== undefined) {
          if (!Array.isArray(a.objects) || !a.objects.length) fail('objects must be a non-empty list of names');
          a.objects.forEach((n) => (need(n), groups.set(n, g)));
        } else if (![...groups.values()].includes(g)) fail(`no group named "${g}"; give objects to make it`);
        if (a.rename !== undefined) {
          const to = name(a.rename);
          for (const [n, x] of groups) if (x === g) groups.set(n, to);
        }
        return { groups: groupList() };
      },
    },
    {
      name: 'ungroup',
      description: 'Break a group up: its objects move on their own again (joints stay).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      run: (a) => {
        const members = [...groups].filter(([, g]) => g === a.name).map(([n]) => n);
        if (!members.length) fail(`no group named "${a.name}"`);
        members.forEach((n) => groups.delete(n));
        return { ungrouped: members, groups: groupList() };
      },
    },
    {
      name: 'connect',
      description: 'Join two objects with a joint (the basic mechanics). `a` holds, `b` is held: moving a carries b along; b itself moves only as the joint allows (move_joint here, a drag in the viewer). Kinds: glue (a and b move together; `contact`: the touching point, line or face as points), pivot (b turns about the point `at`, a ball joint; `limits` { x: [min, max], y, z } degrees round the world axes from the pose now), hinge (b turns about a line: `edge` [i, j], two vertex indices of b, e.g. a door\'s vertical side, or `axis` [[x,y,z], [x,y,z]]; `limit` [min, max] degrees, positive counter-clockwise looking from the second point towards the first), rail (b slides along the polyline `path` of a, its point `slider` (default its vertex nearest the rail) on the rail; `limit` [min, max] distance along the rail from its start), spring (b hangs on a spring from `at` on a to `at_b` on b; `rest_length` (default the distance now), `stiffness` (default 40), `damping` (default 3), `ends` [glue | pivot, glue | pivot]; `spring_object`: an object to stretch between the ends, its line `spring_line` [i, j] (default its longest side); the viewer animates it). Every geometry is in world coordinates now and then sticks to the objects. Returns the joint and its state.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['glue', 'pivot', 'hinge', 'rail', 'spring'] },
          a: { type: 'string', description: 'the holder' },
          b: { type: 'string', description: 'the held part' },
          name: { type: 'string', description: 'the joint\'s name (default type-a-b)' },
          at: { ...vec3Schema, description: 'pivot: the point; glue: the contact point; spring: the end on a' },
          at_b: { ...vec3Schema, description: 'spring: the end on b' },
          contact: { type: 'array', items: vec3Schema, description: 'glue: the contact as points (a point, a line of 2, a face of 3+)' },
          edge: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2, description: 'hinge: the line as two vertex indices of b (see get_mesh)' },
          axis: { type: 'array', items: vec3Schema, minItems: 2, maxItems: 2, description: 'hinge: the line as two points' },
          path: { type: 'array', items: vec3Schema, minItems: 2, description: 'rail: the polyline (it belongs to a)' },
          slider: { ...vec3Schema, description: 'rail: the point of b on the rail' },
          limit: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'hinge: [min, max] degrees; rail: [min, max] distance along the rail' },
          limits: { type: 'object', description: 'pivot: { x: [min, max], y: [min, max], z: [min, max] } degrees', properties: { x: { type: 'array', items: { type: 'number' } }, y: { type: 'array', items: { type: 'number' } }, z: { type: 'array', items: { type: 'number' } } } },
          rest_length: { type: 'number' },
          stiffness: { type: 'number' },
          damping: { type: 'number' },
          ends: { type: 'array', items: { type: 'string', enum: ['glue', 'pivot'] }, minItems: 2, maxItems: 2 },
          spring_object: { type: 'string' },
          spring_line: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
        },
        required: ['type', 'a', 'b'],
      },
      run: (a) => {
        const A = need(a.a), B = need(a.b);
        if (a.a === a.b) fail('a joint needs two different objects');
        const jname = a.name !== undefined ? name(a.name) : `${a.type}-${a.a}-${a.b}`;
        if (joints.some((j) => j.name === jname)) fail(`a joint named "${jname}" exists; disconnect it or give another name`);
        const pair = (v, what) => (Array.isArray(v) && v.length === 2 && v.every(isNum) ? v : fail(`${what} must be [min, max]`));
        const spec = { name: jname, type: a.type, a: a.a, b: a.b };
        if (a.at !== undefined) spec.at = vec3(a.at, 'at');
        if (a.at_b !== undefined) spec.bAt = vec3(a.at_b, 'at_b');
        if (a.contact !== undefined) spec.contact = a.contact.map((p, i) => vec3(p, `contact[${i}]`));
        if (a.edge !== undefined) {
          const [i, k] = a.edge;
          if (![i, k].every((x) => Number.isInteger(x) && x >= 0 && x < B.positions.length) || i === k) fail(`edge must be two different vertex indices of ${a.b} (0..${B.positions.length - 1})`);
          spec.axis = [B.positions[i], B.positions[k]];
        } else if (a.axis !== undefined) spec.axis = a.axis.map((p, i) => vec3(p, `axis[${i}]`));
        if (a.path !== undefined) spec.path = a.path.map((p, i) => vec3(p, `path[${i}]`));
        if (a.slider !== undefined) spec.slider = vec3(a.slider, 'slider');
        if (a.limit !== undefined) spec.limit = pair(a.limit, 'limit');
        if (a.limits !== undefined) {
          spec.limits = {};
          for (const k of ['x', 'y', 'z']) if (a.limits[k] !== undefined) spec.limits[k] = pair(a.limits[k], `limits.${k}`);
        }
        if (a.rest_length !== undefined) spec.restLength = number(a.rest_length, 'rest_length', { min: 0 });
        if (a.stiffness !== undefined) spec.stiffness = number(a.stiffness, 'stiffness', { min: 0 });
        if (a.damping !== undefined) spec.damping = number(a.damping, 'damping', { min: 0 });
        if (a.ends !== undefined) spec.ends = a.ends;
        if (a.spring_object !== undefined) spec.spring = { object: a.spring_object, mesh: need(a.spring_object), ...(a.spring_line ? { line: a.spring_line } : {}) };
        let j;
        try {
          j = makeJoint(spec, A, B);
        } catch (e) {
          fail(e.message);
        }
        joints.push(j);
        return { joint: { name: j.name, type: j.type, a: j.a, b: j.b }, now: nowOut(j) };
      },
    },
    {
      name: 'disconnect',
      description: 'Take a joint away (by its name; see joints).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      run: (a) => {
        const n = joints.length;
        joints = joints.filter((j) => j.name !== a.name);
        if (joints.length === n) fail(`no joint named "${a.name}"`);
        return { removed: a.name, joints: joints.length };
      },
    },
    {
      name: 'joints',
      description: 'The joints and groups now: each joint\'s kind, holder (a), held part (b), its limits and its state (a hinge\'s angle, a pivot\'s angles, a rail\'s position, a spring\'s length) with its geometry in world coordinates.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => ({ joints: joints.map((j) => ({ name: j.name, type: j.type, a: j.a, b: j.b, ...(j.limit ? { limit: j.limit } : {}), ...(j.limits ? { limits: j.limits } : {}), ...(j.type === 'spring' ? { rest_length: j.restLength, stiffness: j.stiffness, damping: j.damping, ends: j.ends, ...(j.spring ? { spring_object: j.spring.object } : {}) } : {}), now: nowOut(j) })), groups: groupList() }),
    },
    {
      name: 'move_joint',
      description: 'Move a held part as its joint allows, kept inside the limits: a hinge to `angle` (degrees from the pose it was connected in), a pivot to `angles` [x, y, z] (degrees round the world axes), a rail to `position` (distance along the rail). What b holds moves along. Returns the state reached (clamped).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, angle: { type: 'number' }, angles: vec3Schema, position: { type: 'number' } }, required: ['name'] },
      run: (a) => {
        const j = joints.find((x) => x.name === a.name) ?? fail(`no joint named "${a.name}"`);
        const A = objects.get(j.a), B = objects.get(j.b);
        let r;
        if (j.type === 'hinge') r = hingeTo(j, A, B, number(a.angle, 'angle'));
        else if (j.type === 'pivot') r = pivotTo(j, A, B, vec3(a.angles, 'angles'));
        else if (j.type === 'rail') r = railTo(j, A, B, number(a.position, 'position'));
        else fail(`a ${j.type} cannot be moved like this (glue holds still; a spring moves by itself in the viewer)`);
        const moved = moveWith(j.b, (m) => moveMesh(m, r.move));
        return { name: j.name, now: nowOut(j), moved };
      },
    },
    {
      name: 'get_mesh',
      description: 'Read an object\'s geometry so you can shape it: the vertices (index = position in the list) and the faces with their vertex indices, color, center and outward normal. Use it to find the face or vertex indices for extrude_face and move_vertices.',
      inputSchema: { type: 'object', properties: { name: nameSchema }, required: ['name'] },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const mesh = need(a.name);
        return {
          name: a.name,
          vertices: mesh.positions.map(rv),
          faces: mesh.faces.map((f, i) => {
            const pts = f.v.map((k) => mesh.positions[k]);
            const n = faceNormal(pts);
            const l = Math.hypot(...n) || 1;
            return { i, v: f.v, color: f.color, center: rv(faceCenter(pts)), normal: rv(n.map((c) => c / l)) };
          }),
        };
      },
    },
    {
      name: 'extrude_face',
      description: 'Shape an object by pushing one of its faces out, like a modeller. The face is replaced (same index) by a copy moved `distance` along its outward normal and scaled by `scale` about its center, joined to the old edges by new side faces. distance > 0 and scale 1: a prism grows out (a wing, a chimney, a step). distance > 0 and scale < 1: a taper (roof, tower top, frustum). distance 0 and scale < 1: an inset (a panel or window frame; extrude it again, negative, for a recess). distance < 0: a dent into the solid (a niche, a door recess). The result is a closed solid again; chain calls on the returned `cap` face.',
      inputSchema: {
        type: 'object',
        properties: { name: nameSchema, face: { type: 'integer', description: 'face index inside the object (see get_mesh)' }, distance: { type: 'number', description: 'along the outward normal, default 0' }, scale: { type: 'number', description: 'about the face center, > 0, default 1' }, color: { ...colorSchema, description: 'color for the new faces (default: the face color)' } },
        required: ['name', 'face'],
      },
      run: (a) => {
        const mesh = need(a.name);
        if (!Number.isInteger(a.face)) fail('face must be an integer');
        let out;
        try {
          out = extrudeFace(mesh, a.face, { distance: number(a.distance, 'distance', { fallback: 0 }), scale: number(a.scale, 'scale', { min: 1e-9, fallback: 1 }), color: a.color === undefined ? undefined : color(a.color) });
        } catch (e) {
          fail(e.message);
        }
        objects.set(a.name, out.mesh);
        const c = validate(out.mesh);
        return { ...summary(a.name, out.mesh), cap_face: out.cap, side_faces: out.sides, ok: c.ok, notes: c.notes };
      },
    },
    {
      name: 'move_vertices',
      description: 'Move the vertices with the given indices by [dx, dy, dz] (see get_mesh for the indices): shear, lean, pinch a roof ridge, raise a corner. Faces keep their vertices, so moving only some corners of a face can make it non-planar; the result reports that. Move all the corners of a face together to keep it flat.',
      inputSchema: { type: 'object', properties: { name: nameSchema, indices: { type: 'array', items: { type: 'integer' }, minItems: 1 }, by: { ...vec3Schema, description: '[dx, dy, dz]' } }, required: ['name', 'indices', 'by'] },
      run: (a) => {
        const mesh = need(a.name);
        if (!Array.isArray(a.indices) || !a.indices.length) fail('indices must be a non-empty list of vertex indices');
        let moved;
        try {
          moved = moveVertices(mesh, a.indices, vec3(a.by, 'by'));
        } catch (e) {
          fail(e.message);
        }
        objects.set(a.name, moved);
        const c = validate(moved);
        return { ...summary(a.name, moved), ok: c.ok, notes: c.notes };
      },
    },
    {
      name: 'boolean',
      description: 'Boolean of two closed solids: union, subtract (a minus b: a door, a window, a hole) or intersect. Both objects must be closed solids with outward faces (inspect says so). The result is a new closed solid; faces keep their colors and a face cut into a solid takes the color of the cutting face. By default a and b are replaced by the result; `keep: true` keeps them.',
      inputSchema: {
        type: 'object',
        properties: { a: nameSchema, b: nameSchema, op: { type: 'string', enum: ['union', 'subtract', 'intersect'] }, name: { ...nameSchema, description: 'name of the result (default a-op-b)' }, keep: { type: 'boolean', description: 'keep a and b (default false)' } },
        required: ['a', 'b', 'op'],
      },
      run: (x) => {
        const ma = need(x.a);
        const mb = need(x.b);
        if (!['union', 'subtract', 'intersect'].includes(x.op)) fail("op must be 'union', 'subtract' or 'intersect'");
        let out;
        try {
          out = boolean(ma, mb, x.op);
        } catch (e) {
          fail(e.message);
        }
        if (!out.faces.length) fail(`the ${x.op} of ${x.a} and ${x.b} is empty`);
        const result = x.name === undefined ? `${x.a}-${x.op}-${x.b}` : name(x.name);
        if (!x.keep) {
          objects.delete(x.a);
          objects.delete(x.b);
        }
        objects.set(result, out);
        const c = validate(out);
        return { ...summary(result, out), closed: c.closed, ok: c.ok, notes: c.notes };
      },
    },
    {
      name: 'recolor',
      description: 'Change the color of a whole object, or of one face when `face` is given.',
      inputSchema: { type: 'object', properties: { name: nameSchema, color: colorSchema, face: { type: 'integer', description: 'face index inside the object' } }, required: ['name', 'color'] },
      run: (a) => {
        const mesh = need(a.name);
        const c = color(a.color);
        if (a.face !== undefined && (!Number.isInteger(a.face) || a.face < 0 || a.face >= mesh.faces.length)) fail(`face must be 0..${mesh.faces.length - 1}`);
        objects.set(a.name, { ...mesh, faces: mesh.faces.map((f, i) => (a.face === undefined || a.face === i ? { ...f, color: c } : f)) });
        return summary(a.name, objects.get(a.name));
      },
    },
    {
      name: 'remove',
      description: 'Remove one object.',
      inputSchema: { type: 'object', properties: { name: nameSchema }, required: ['name'] },
      run: (a) => {
        need(a.name);
        objects.delete(a.name);
        dropLinks(a.name);
        return { removed: a.name, objects: objects.size };
      },
    },
    { name: 'clear', description: 'Remove every object.', inputSchema: { type: 'object', properties: {} }, run: () => {
      const n = objects.size;
      objects.clear();
      groups.clear();
      joints = [];
      return { removed: n };
    } },
    {
      name: 'list',
      description: 'List the objects with their face counts and axis-aligned bounds (min / max corners).',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => ({ objects: [...objects].map(([n, m]) => summary(n, m)), scene: objects.size ? extent(combined().mesh) : null }),
    },
    {
      name: 'inspect',
      description: 'Check an object (or all when name is omitted): closed shell, faces CCW from outside, planar, convex. Returns plain-text notes about what to fix. Run it after add_mesh.',
      inputSchema: { type: 'object', properties: { name: nameSchema } },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const names = a.name === undefined ? [...objects.keys()] : [name(a.name)];
        return { checked: names.map((n) => ({ name: n, ...validate(need(n)) })) };
      },
    },
    {
      name: 'render',
      description: 'Render the scene as a flat-colored SVG with edges and points (text, deterministic). Default is a 2x2 sheet of front, side, top and perspective. Each <polygon data-face=".."> is one face, <circle data-v=".."> a vertex. Look at it to judge the model, then fix and render again.',
      inputSchema: { type: 'object', properties: { ...viewProps, points: { type: 'boolean', description: 'draw vertices, default true' } } },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const { mesh } = combined();
        const view = viewOf(a, 'sheet');
        const opts = { size: number(a.size, 'size', { min: 64, max: 2000, fallback: 320 }), points: a.points ?? true };
        return { text: view === 'sheet' ? renderSheet(mesh, opts) : renderView(mesh, view, opts) };
      },
    },
    {
      name: 'pick',
      description: 'What is at pixel (x, y) of a render? Uses the same camera and size as render. Returns the object, its face index, the 3D point, the surface normal and the distance. Use it to find coordinates to place or stack things. Only the sensing set counts (see sensing; exclude / include for this call); sense also lists what lies behind.',
      inputSchema: { type: 'object', properties: { ...viewProps, x: { type: 'number' }, y: { type: 'number' }, ...senseProps }, required: ['x', 'y'] },
      annotations: { readOnlyHint: true },
      run: (a) => {
        if (viewOf(a, 'persp') === 'sheet') fail('pick needs a single view, not the sheet');
        if (!objects.size) return { hit: null };
        const { origin, dir } = pixelRay(a);
        const hits = castRay(sensed(a), origin, dir, { all: true }).filter((h) => h.facing); // (like the viewer: front faces)
        if (!hits.length) return { hit: null };
        const h = hits[0];
        return { hit: { ...hitOut(h), color: objects.get(h.object).faces[h.face].color } };
      },
    },
    {
      name: 'export',
      description: 'Return the scene as JSON, or write it to `path` (relative, inside the server working directory, must end in .json).',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      annotations: { readOnlyHint: true },
      run: (a) => {
        if (a.path === undefined) return { text: JSON.stringify(data()) };
        writeFileSync(safePath(a.path), JSON.stringify(data()));
        return { written: a.path, objects: objects.size };
      },
    },
    {
      name: 'import',
      description: 'Replace the scene with a JSON scene, given as `json` text or read from `path` (same rules as export).',
      inputSchema: { type: 'object', properties: { json: { type: 'string' }, path: { type: 'string' } } },
      run: (a) => {
        if ((a.json === undefined) === (a.path === undefined)) fail('give exactly one of json or path');
        let parsed;
        try {
          parsed = JSON.parse(a.json ?? readFileSync(safePath(a.path), 'utf8'));
        } catch (e) {
          fail(`could not read the scene: ${e.message}`);
        }
        if (parsed?.format !== '3draft-scene' || !Array.isArray(parsed.objects)) fail('not a 3draft scene (format, objects)');
        const next = new Map();
        for (const o of parsed.objects) {
          name(o?.name);
          next.set(o.name, parseMesh(o.mesh?.positions, o.mesh?.faces));
        }
        objects.clear();
        groups.clear();
        for (const [k, v] of next) objects.set(k, v);
        for (const o of parsed.objects) if (typeof o.group === 'string' && o.group) groups.set(o.name, o.group);
        joints = Array.isArray(parsed.joints) ? parsed.joints.filter((j) => j && objects.has(j.a) && objects.has(j.b)) : [];
        return { objects: objects.size, groups: new Set(groups.values()).size, joints: joints.length };
      },
    },
    // ---- The open viewer (the live link): these do not change the scene, they steer what the browser shows
    {
      name: 'view_target',
      description: 'Make the open viewer target an object by name (as the viewer\'s Enter search: case and accents do not matter; the whole name, then the start, a word start, any part). In a star map the starship turns to it and the braking program stops it at the surface when you fly there. Works on everything the viewer shows, also the loaded example scenes (stars, galaxies), not only the MCP objects.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'the name or a part of it, e.g. "andromeda", "Sirius", "seat"' } }, required: ['name'] },
      live: true,
      run: (a) => sendView({ cmd: 'target', name: String(a.name ?? fail('name is required')) }),
    },
    {
      name: 'view_camera',
      description: 'Put the open viewer\'s eye at a point, looking along yaw / pitch (degrees; yaw 0 looks towards -z, positive yaw turns towards +x, positive pitch looks down, as in the Spider Build format). In a star map the units are light years (the Sun at the origin). `roll` (degrees) banks the starship.',
      inputSchema: { type: 'object', properties: { eye: vec3Schema, yaw: { type: 'number' }, pitch: { type: 'number' }, roll: { type: 'number' } }, required: ['eye'] },
      live: true,
      run: (a) => sendView({ cmd: 'camera', eye: vec3(a.eye, 'eye'), yaw: number(a.yaw, 'yaw', { fallback: 0 }), pitch: number(a.pitch, 'pitch', { min: -90, max: 90, fallback: 0 }), roll: number(a.roll, 'roll', { fallback: 0 }) }),
    },
    {
      name: 'view_vehicle',
      description: 'Switch the open viewer\'s vehicle: "starship" (space flight, light years), "car" (drives on the ground), or "none" (the ordinary model camera).',
      inputSchema: { type: 'object', properties: { vehicle: { type: 'string', enum: ['none', 'starship', 'car'] } }, required: ['vehicle'] },
      live: true,
      run: (a) => {
        if (!['none', 'starship', 'car'].includes(a.vehicle)) fail('vehicle must be none, starship or car');
        return sendView({ cmd: 'vehicle', vehicle: a.vehicle });
      },
    },
    {
      name: 'view_example',
      description: 'Load one of the viewer\'s bundled scenes into the open viewer (beside the MCP objects, or instead of everything with replace: true). The names are the viewer\'s scene list, e.g. deepsky (1000 galaxies, 400 black holes, 3000 stars), stars, milkyway, stars-plain, sky:trappist-1 (a sky catalogue), globe, bridge, ex27, betterman (Spider Paint also: human, tr74, station-screen). It is shown in the browser only: render and inspect do not see it.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, replace: { type: 'boolean', description: 'clear the viewer first (default false)' } }, required: ['name'] },
      live: true,
      run: (a) => sendView({ cmd: 'example', name: String(a.name ?? fail('name is required')), replace: Boolean(a.replace) }),
    },
    {
      name: 'view_sky',
      description: 'Make a space scene from a sky catalogue and show it in the open viewer (the format is app/sky.md, "3draft-sky"): stars, planets, moons, dwarf planets, exoplanets, black holes and galaxies in astronomers\' units. A place is ra / dec (degrees, or "hh mm ss" / "±dd mm ss" strings, or ra_h hours) with dist + unit (ly, pc, kpc, Mpc, AU, kly, Mly, Gly) or parallax (mas), or at [x, y, z] in scene light years (the Sun at the origin, y = equatorial north). A star: spect (e.g. "G2V", "M5.5Ve", "DA"), temp (K), lum (L☉) or absmag or vmag, radius (R☉). A planet / moon goes round another object with around (its name), a (AU) or a_km, optional incl / node / angle (degrees), radius_earth / radius_km / radius_jup, teq (K, else from the star), surface (a planet shader recipe), ring, orbit: true (draw the orbit). A black hole: mass (M☉), radius_ly (drawn size). A galaxy: kind (spiral, elliptical, irregular, dwarf, interacting, early), diameter_kly or radius_ly, incl / pa, arms, bar. Any object: name, info (shown under the name when targeted), category (the find box\'s kind), color. start: { near: name, distance: ly } or { eye, yaw, pitch }. Returns the counts and notes about anything left out; save writes the made scene as a .json file the viewer opens (f↑).',
      inputSchema: {
        type: 'object',
        properties: {
          sky: { type: 'object', description: 'the catalogue: { format: "3draft-sky", name, start, objects: [ { type, name, … } ] }', properties: { name: { type: 'string' }, objects: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: [...SKY_TYPES] }, name: { type: 'string' } } } } } },
          path: { type: 'string', description: 'or read the catalogue from a .json file (relative, inside the server working directory)' },
          replace: { type: 'boolean', description: 'clear the viewer first (default true)' },
          save: { type: 'string', description: 'also write the made scene to this .json path' },
        },
      },
      live: true,
      run: (a) => {
        if ((a.sky === undefined) === (a.path === undefined)) fail('give exactly one of sky or path');
        let sky = a.sky;
        if (a.path !== undefined) {
          try {
            sky = JSON.parse(readFileSync(safePath(a.path), 'utf8'));
          } catch (e) {
            fail(`could not read the catalogue: ${e.message}`);
          }
        }
        let made;
        try {
          made = skyScene(sky);
        } catch (e) {
          fail(e.message);
        }
        const { scene, warnings, counts } = made;
        if (!scene.objects.length) fail(`nothing to show: ${warnings.slice(0, 5).join('; ') || 'no objects'}`);
        if (a.save !== undefined) writeFileSync(safePath(a.save), JSON.stringify(scene));
        const sent = info.live?.command ? info.live.command({ cmd: 'scene', scene, replace: a.replace !== false }) : 0;
        return {
          sent_to: sent,
          ...(sent ? {} : { note: info.live?.command ? 'no viewer is open: call viewer for the URL and ask the user to open it' : 'the live viewer is off' }),
          counts,
          ...(warnings.length ? { notes: warnings } : {}),
          start: scene.start,
          ...(a.save !== undefined ? { written: a.save } : {}),
        };
      },
    },
    {
      name: 'view_state',
      description: 'What the open viewer shows now (it reports every 2 seconds): vehicle, eye, yaw / pitch / roll (degrees), the target, the speed, the object count, the loaded scene. null when no viewer is open.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => ({ viewer: info.live?.viewer?.() ?? null, open_tabs: info.live?.clients() ?? 0 }),
    },
    {
      name: 'viewer',
      description: 'The URL of the live viewer: a browser page that shows this scene and updates after every change you make. Tell the user to open it. Returns null when the live viewer is off.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      run: () => (info.live ? { url: info.live.url, ...(Object.keys(info.live.viewers ?? {}).length > 1 ? { viewers: info.live.viewers } : {}), open_tabs: info.live.clients() } : { url: null, note: 'the live viewer is off (3DRAFT_LIVE=0) or could not bind a port' }),
    },
  ];

  /** Runs a tool: { text, isError }. Plain objects come back as JSON text. */
  const call = (toolName, args = {}) => {
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) return { isError: true, text: `unknown tool "${toolName}"` };
    if (args === null || typeof args !== 'object' || Array.isArray(args)) return { isError: true, text: 'arguments must be an object' };
    try {
      const out = tool.run(args);
      if (!tool.annotations?.readOnlyHint && !tool.live) {
        rev += 1;
        for (const fn of listeners) fn(rev);
      }
      return { isError: false, text: out?.text ?? JSON.stringify(out, null, 1) };
    } catch (e) {
      return { isError: true, text: e instanceof ToolError ? e.message : `internal error: ${e.message}` };
    }
  };

  const list = () => tools.map(({ name: n, description, inputSchema, annotations }) => ({ name: n, description, inputSchema, ...(annotations ? { annotations } : {}) }));

  /** fn(rev) runs after every successful change. Returns an unsubscribe function. */
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  return { call, list, objects, data, subscribe, info };
};

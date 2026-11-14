// (copied from 3Draft e9ea1fa by scripts/sync.mjs: change it there)
// The model and its tools. One scene of named objects (meshes), edited by tool calls
// and judged by the deterministic SVG preview. No I/O except save/load of JSON files
// under the working directory. The MCP transport is in server.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { box, extrude, extrudeFace, moveVertices, faceNormal, faceCenter, merge, rotate, bounds, makeCamera, orbit, pick, renderView, renderSheet, validate, boolean, VIEW_ORDER } from './engine/index.js';

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
    return { v: [...v], color: color(f.color, fallbackColor) };
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

  const data = () => ({ format: '3draft-scene', version: 1, rev, objects: [...objects].map(([n, mesh]) => ({ name: n, mesh })) });

  const need = (n) => objects.get(name(n)) ?? fail(`no object named "${n}". Use list to see the objects.`);
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
      description: 'Scale, then rotate around the Y axis, then move an object. Scale and rotation are about the center of its bounding box.',
      inputSchema: {
        type: 'object',
        properties: { name: nameSchema, scale: { description: 'Positive number, or [sx, sy, sz].', oneOf: [{ type: 'number' }, vec3Schema] }, rotate_y: { type: 'number', description: 'degrees, counter-clockwise seen from above' }, move: { ...vec3Schema, description: 'translation [dx, dy, dz]' } },
        required: ['name'],
      },
      run: (a) => {
        let mesh = need(a.name);
        const { min, max } = extent(mesh);
        const c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
        if (a.scale !== undefined) {
          const s = isNum(a.scale) ? [a.scale, a.scale, a.scale] : vec3(a.scale, 'scale');
          if (!s.every((v) => v > 0)) fail('scale must be positive');
          mesh = { ...mesh, positions: mesh.positions.map((p) => p.map((v, i) => c[i] + (v - c[i]) * s[i])) };
        }
        if (a.rotate_y !== undefined) {
          const yaw = (number(a.rotate_y, 'rotate_y') * Math.PI) / 180;
          mesh = rotate(mesh, { yaw }, c);
        }
        if (a.move !== undefined) {
          const d = vec3(a.move, 'move');
          mesh = { ...mesh, positions: mesh.positions.map((p) => p.map((v, i) => v + d[i])) };
        }
        objects.set(a.name, mesh);
        return summary(a.name, mesh);
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
        return { removed: a.name, objects: objects.size };
      },
    },
    { name: 'clear', description: 'Remove every object.', inputSchema: { type: 'object', properties: {} }, run: () => {
      const n = objects.size;
      objects.clear();
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
      description: 'What is at pixel (x, y) of a render? Uses the same camera and size as render. Returns the object, its face index, the 3D point, the surface normal and the distance. Use it to find coordinates to place or stack things.',
      inputSchema: { type: 'object', properties: { ...viewProps, x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
      annotations: { readOnlyHint: true },
      run: (a) => {
        const { mesh, owners } = combined();
        const view = viewOf(a, 'persp');
        if (view === 'sheet') fail('pick needs a single view, not the sheet');
        const size = number(a.size, 'size', { min: 64, max: 2000, fallback: 320 });
        const hit = pick(mesh, makeCamera(view, mesh, size, bounds(mesh)), number(a.x, 'x'), number(a.y, 'y'));
        if (!hit) return { hit: null };
        const o = owners.find((w) => hit.face >= w.start && hit.face < w.end);
        return { hit: { object: o.name, face: hit.face - o.start, point: rv(hit.point), normal: rv(hit.normal), distance: r6(hit.distance), color: hit.color } };
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
        for (const [k, v] of next) objects.set(k, v);
        return { objects: objects.size };
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
      description: 'Put the open viewer\'s eye at a point, looking along yaw / pitch (degrees; yaw 0 looks towards -z, pitch > 0 up). In a star map the units are light years (the Sun at the origin). `roll` (degrees) banks the starship.',
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
      description: 'Load one of the viewer\'s bundled scenes into the open viewer (beside the MCP objects, or instead of everything with replace: true). The names are the viewer\'s scene list, e.g. deepsky (1000 galaxies, 400 black holes, 3000 stars), stars, milkyway, stars-plain, globe, bridge, ex27, betterman (Spider Paint also: human, tr74, station-screen). It is shown in the browser only: render and inspect do not see it.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, replace: { type: 'boolean', description: 'clear the viewer first (default false)' } }, required: ['name'] },
      live: true,
      run: (a) => sendView({ cmd: 'example', name: String(a.name ?? fail('name is required')), replace: Boolean(a.replace) }),
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

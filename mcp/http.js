// (copied from 3Draft 2c18819 by scripts/sync.mjs: change it there)
// The public, stateless MCP server: JSON-RPC 2.0 over Streamable HTTP (a POST with one message, a JSON answer; no server-sent
// stream, no session). Deployed as a serverless function (Spider Paint: api/mcp.mjs -> https://spider-paint.vercel.app/api/mcp),
// so it keeps nothing between calls and cannot steer anyone's browser. Instead every tool that makes something returns an
// `open_url`: the viewer with the scene packed into the URL's #fragment (deflate-raw, base64url), so the link opens exactly what
// was made, and nothing is stored anywhere. build_model continues from such a link (`from`).
//
// handleMcp(message, { origin, fetchText }) -> the JSON-RPC answer (or null for a notification). origin: the site's own address
// (links and the bundled data are made from it); fetchText(path): reads one of the site's static files (the deep sky catalogue,
// the sky guide).

import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { createScene } from './scene.js';
import { skyScene, SKY_TYPES, version } from './engine/index.js';

export const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_URL = 200000; // characters: longer links are refused (browsers and chat apps cut them)

const INSTRUCTIONS = [
  'Spider Paint is a no-install 3D viewer in the browser (3Draft engine): a modeller, and a first-person universe browser with real-scale stars, planets, exoplanets, black holes and galaxies.',
  'This server keeps no state and cannot reach the user\'s browser: every tool that makes something returns open_url, a link that opens the viewer with exactly that scene. Give the user the link.',
  'Models: build_model takes a list of steps (add_box, add_extrusion, add_mesh, transform, extrude_face, move_vertices, boolean, recolor, remove...) and runs them in order, returns a render (SVG text) and the link; continue with from: <the last open_url>. Y is up, the ground is y = 0, faces counter-clockwise seen from outside.',
  'Space: sky_scene makes a scene from a sky catalogue (format 3draft-sky: stars, planets, moons, exoplanets, black holes, galaxies in astronomers\' units; read sky_guide first). find searches the bundled deep sky (the Solar System, 3000 stars, 500 exoplanets, 400 black holes, 1000 galaxies) and links straight to an object. examples lists the bundled scenes.',
].join(' ');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
/** JSON -> the #fragment payload (deflate-raw, base64url). */
export const pack = (value) => b64url(deflateRawSync(Buffer.from(JSON.stringify(value)), { level: 9 }));
/** The #fragment payload -> JSON. */
export const unpack = (s) => JSON.parse(inflateRawSync(fromB64url(s)).toString('utf8'));
/** An open_url's (or a bare payload's) packed part for `key` (scene, sky). */
const payloadOf = (link, key) => {
  const s = String(link).trim();
  const m = new RegExp(`[#&]${key}=([A-Za-z0-9_-]+)`).exec(s);
  return m ? m[1] : /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
};

class ToolFail extends Error {}
const fail = (m) => {
  throw new ToolFail(m);
};

// the modelling tools build_model may run (the ones that read or write files and steer a live viewer are left out)
const MODEL_TOOLS = ['add_box', 'add_extrusion', 'add_mesh', 'add_character', 'transform', 'place_on', 'sense', 'sensing', 'group', 'ungroup', 'connect', 'disconnect', 'joints', 'move_joint', 'get_mesh', 'extrude_face', 'move_vertices', 'boolean', 'recolor', 'remove', 'clear', 'list', 'inspect', 'pick'];
const VIEWS = ['sheet', 'front', 'back', 'left', 'right', 'top', 'bottom', 'persp', 'none'];

// the find box's kinds (the viewer's categoryOf)
const STAR_CAT = { O: 'blue O-type star', B: 'blue-white B-type star', A: 'white A-type star', F: 'yellow-white F-type star', G: 'yellow G-type star', K: 'orange K-type star', M: 'red M-type star', D: 'white dwarf star', L: 'brown dwarf', X: 'star' };
const GAL_CAT = { S: 'spiral galaxy', E: 'elliptical galaxy', I: 'irregular galaxy', D: 'dwarf galaxy', P: 'interacting galaxies', H: 'early universe galaxy' };
const EXO_SIZE = { rock: 'rocky', sub: 'sub-Neptune', nep: 'Neptune-like', jup: 'gas giant' };
const EXO_HEAT = { lava: 'lava', hot: 'hot', warm: 'warm', temp: 'temperate', cold: 'cold', froz: 'frozen' };
const categoryOf = (o) => {
  if (o.category) return o.category;
  const core = o.mats?.core ?? '';
  if (core === 'bh-core') return 'black hole';
  if (o.galaxy) return GAL_CAT[o.galaxy.kind] ?? 'galaxy';
  if (o.exo) {
    const [size, heat] = String(o.exo.class).split('-');
    return `${EXO_HEAT[heat] ?? ''} ${EXO_SIZE[size] ?? ''} exoplanet`.replace(/\s+/g, ' ').trim();
  }
  if (o.planet) return 'planet';
  if (core.startsWith('star-')) return STAR_CAT[core.slice(5)] ?? 'star';
  return o.proto ?? '';
};
const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lyText = (ly) => (ly < 0.05 ? (ly * 63241 < 0.01 ? `${Math.round(ly * 9.4607e12).toLocaleString('en')} km` : `${+(ly * 63241).toPrecision(3)} AU`) : ly < 1e3 ? `${+ly.toPrecision(3)} ly` : ly < 1e6 ? `${+(ly / 1e3).toPrecision(3)} kly` : ly < 1e9 ? `${+(ly / 1e6).toPrecision(3)} Mly` : `${+(ly / 1e9).toPrecision(3)} Gly`);

export const EXAMPLES = [
  ['deepsky', 'Deep sky: the Solar System at true scale, 3000 stars, 500 exoplanets, 400 black holes, 1000 galaxies (starship)'],
  ['stars', 'The 500 nearest stars'],
  ['milkyway', 'The Milky Way: 30 000 super-stars'],
  ['stars-plain', '300 stars and 100 galaxies as point glows'],
  ['sky:trappist-1', 'TRAPPIST-1: an ultracool red dwarf with seven Earth-sized planets, 40 ly away (a sky catalogue)'],
  ['globe', 'A globe'],
  ['bridge', 'A stone bridge'],
  ['ex27', 'EX-27 expedition module'],
  ['tr74', 'TR-74 expedition module'],
  ['human', 'A low poly human'],
  ['betterman', 'Betterman, a figure to pose (J)'],
  ['station-screen', 'A station with a scene shown on a screen'],
];

/** The public tools: { name, description, inputSchema, annotations, run(args, ctx) -> object }. */
export const publicTools = () => [
  {
    name: 'build_model',
    description: `Build a 3D model: runs the steps in order in a fresh scene (or continuing the scene of a previous open_url, given as from) and returns each step's result, a render (SVG text: a 2x2 sheet of front, side, top and perspective by default) and open_url, a link that opens the model in the Spider Paint viewer. Steps: { tool, args }, tool one of ${MODEL_TOOLS.join(', ')}. add_box { name, size: [x, y, z], at: [x, y, z] (the box's middle), color }, add_extrusion { name, polygon: [[x, z]...] (a convex floor outline), height, y (its bottom), color }, add_mesh { name, positions, faces: [{ v: [i...], color }] }, add_character { name, preset: scientist | mechanic | crew | astronaut, seed, spec, pose: stand | sit | walk, at: [x, y, z] (its feet), yaw (degrees, 0 faces +z), onto } (a figure from the character builder, about 1.7 m tall), transform { name, scale, rotate_x, rotate_z, rotate_y (degrees), pivot, move: [dx, dy, dz] }, place_on { name, onto, at: [x, z] | point (+ normal) | from + dir, align: up | normal, turn, gap } (like the viewer's G G: puts the object's foot, the middle of its bottom, onto the surface found straight down at [x, z], or along the ray; align normal turns its up to the surface), extrude_face { name, face, distance }, move_vertices { name, vertices, by }, boolean { op: union | subtract | intersect, a, b, name }, recolor { name, color, faces }, remove { name }, list (bounds of every object), pick { x, y, view } (what is at a pixel of the render: object, point, normal, distance), sense { x, y, view | from, dir, exclude, include } (the cursor's feel along a ray from the camera: the first surface and every hit behind it, with distances and whether the ray enters or leaves), sensing { ignore, sense, only, reset } (which objects sense, pick and place_on feel: ignore a wall to place behind it, a box to place into it). place_on also takes a pixel { x, y, view } and exclude / include. group { name, objects, rename } / ungroup { name } (objects that move as one), connect { type: glue | pivot | hinge | rail | spring, a (holds), b (held), at, at_b, contact, edge: [i, j] of b | axis, path, slider, limit, limits: { x, y, z }, rest_length, stiffness, damping, ends, spring_object } (the basic mechanics: a carries b; b moves only as the joint allows), disconnect { name }, joints (their state: angle, position, length), move_joint { name, angle | angles | position } (turn a hinge or pivot, slide a rail, inside the limits). Y is up, the ground is y = 0, faces counter-clockwise seen from outside. A step that fails is reported and the rest still run. Look at the render, then fix with another call (from: the last open_url).`,
    inputSchema: {
      type: 'object',
      properties: {
        steps: { type: 'array', description: 'the modelling steps, in order', items: { type: 'object', properties: { tool: { type: 'string', enum: MODEL_TOOLS }, args: { type: 'object' } }, required: ['tool'] } },
        from: { type: 'string', description: 'continue the scene of this open_url (from an earlier build_model)' },
        render: { type: 'string', enum: VIEWS, description: 'the render: sheet (default), one view, or none' },
        size: { type: 'number', description: 'render size in pixels (default 280)' },
      },
      required: ['steps'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a, ctx) => {
      if (!Array.isArray(a.steps)) fail('steps must be a list of { tool, args }');
      if (a.steps.length > 400) fail('at most 400 steps in one call');
      const scene = createScene();
      if (a.from !== undefined) {
        const p = payloadOf(a.from, 'scene');
        if (!p) fail('from: give the open_url of an earlier build_model');
        let data;
        try {
          data = unpack(p);
        } catch {
          fail('from: the link could not be read');
        }
        const r = scene.call('import', { json: JSON.stringify(data) });
        if (r.isError) fail(`from: ${r.text}`);
      }
      const results = a.steps.map((s, i) => {
        const tool = s?.tool;
        if (!MODEL_TOOLS.includes(tool)) return { step: i, tool, error: `not a modelling tool (one of ${MODEL_TOOLS.join(', ')})` };
        const r = scene.call(tool, s.args ?? {});
        let out;
        try {
          out = JSON.parse(r.text);
        } catch {
          out = r.text;
        }
        return r.isError ? { step: i, tool, error: r.text } : { step: i, tool, result: out };
      });
      const exported = JSON.parse(scene.call('export', {}).text);
      const link = `${ctx.origin}/#scene=${pack(exported)}`;
      const view = a.render ?? 'sheet';
      const svg = view === 'none' || !exported.objects.length ? null : scene.call('render', { view, size: a.size ?? 280, points: false }).text;
      return {
        objects: exported.objects.length,
        steps: results,
        failed: results.filter((r) => r.error).length,
        ...(link.length <= MAX_URL ? { open_url: link } : { open_url: null, note: `the model is too big for a link (${link.length} characters); split it or simplify` }),
        ...(svg ? { render: svg } : {}),
      };
    },
  },
  {
    name: 'sky_scene',
    description: `Make a space scene from a sky catalogue (format "3draft-sky"; read sky_guide for the whole format and examples) and return open_url, a link that opens it in the viewer as a starship flight. Objects: type (${SKY_TYPES.join(', ')}), name; a place: ra / dec (degrees or "hh mm ss" / "±dd mm ss") with dist + unit (ly, pc, kpc, Mpc, AU, kly, Mly, Gly) or parallax (mas); a star: spect, temp, lum / absmag / vmag, radius (R☉); a planet / moon: around (its star or planet), a (AU) or a_km, radius_earth / radius_km / radius_jup, teq, incl / node / angle, ring, orbit: true; a black hole: mass, radius_ly; a galaxy: kind, diameter_kly, incl / pa. Any object: info, category. start: { near: name, distance } or { eye, yaw, pitch }. Returns the counts and notes about anything left out.`,
    inputSchema: {
      type: 'object',
      properties: {
        sky: { type: 'object', description: 'the catalogue: { format: "3draft-sky", name, info, start, objects: [ { type, name, ... } ] }', properties: { name: { type: 'string' }, objects: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: [...SKY_TYPES] }, name: { type: 'string' } } } } } },
        target: { type: 'string', description: 'an object to fly to when the link opens (by name)' },
      },
      required: ['sky'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a, ctx) => {
      let made;
      try {
        made = skyScene(a.sky);
      } catch (e) {
        fail(e.message);
      }
      const { scene, warnings, counts } = made;
      if (!scene.objects.length) fail(`nothing to show: ${warnings.slice(0, 5).join('; ') || 'no objects'}`);
      const sky = { format: '3draft-sky', version: 1, ...a.sky };
      const link = `${ctx.origin}/${a.target ? `?target=${encodeURIComponent(a.target)}` : ''}#sky=${pack(sky)}`;
      return {
        counts,
        ...(warnings.length ? { notes: warnings } : {}),
        start: scene.start,
        ...(link.length <= MAX_URL ? { open_url: link } : { open_url: null, note: `the catalogue is too big for a link (${link.length} characters)` }),
      };
    },
  },
  {
    name: 'find',
    description: 'Search the bundled deep sky (the Solar System at true scale, the Moon, Pluto, 3000 stars, 500 exoplanets, 400 black holes, 1000 galaxies, 11 colliding systems) by name or by kind ("andromeda", "sirius", "trappist-1 e", "sgr a", or a kind: "white dwarf", "black hole", "spiral galaxy", "hot gas giant exoplanet", "moon"). Returns the matches with their kind, distance from the Sun and notes, each with open_url: the viewer flying to it.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', description: 'at most this many (default 10, max 50)' } }, required: ['query'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a, ctx) => {
      const q = fold(String(a.query ?? '').trim());
      if (!q) fail('query is required');
      const data = await deepSky(ctx);
      const rows = [];
      for (const o of data.objects) {
        const name = fold(o.name ?? ''), cat = fold(categoryOf(o));
        const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.split(/[\s\-()/]+/).some((w) => w.startsWith(q)) ? 2 : cat === q || cat.endsWith(q) || cat.startsWith(q) ? 2.5 : name.includes(q) ? 3 : cat.includes(q) ? 4 : -1;
        if (rank < 0) continue;
        const ly = Math.hypot(...(o.at ?? [0, 0, 0]));
        rows.push({ rank, ly, o });
      }
      rows.sort((x, y) => x.rank - y.rank || x.ly - y.ly);
      const limit = Math.max(1, Math.min(50, Number(a.limit) || 10));
      return {
        found: rows.length,
        matches: rows.slice(0, limit).map(({ ly, o }) => ({
          name: o.name,
          kind: categoryOf(o),
          distance_from_sun: lyText(ly),
          ...(o.info ? { info: o.info } : {}),
          open_url: `${ctx.origin}/?scene=deepsky&target=${encodeURIComponent(o.name)}`,
        })),
      };
    },
  },
  {
    name: 'examples',
    description: 'The scenes bundled with the viewer, each with open_url.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a, ctx) => ({ examples: EXAMPLES.map(([name, about]) => ({ name, about, open_url: `${ctx.origin}/?scene=${encodeURIComponent(name)}` })), viewer: `${ctx.origin}/`, guide: `${ctx.origin}/sky.html` }),
  },
  {
    name: 'sky_guide',
    description: 'The sky guide (Markdown): how the viewer shows stars, planets, black holes and galaxies, the whole 3draft-sky catalogue format with examples, where to find real data, and what is real and what is made up. Read it before writing a catalogue for sky_scene.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (a, ctx) => ({ text: await ctx.fetchText('/sky.md') }),
  },
];

// the deep sky catalogue, read once per warm instance
let deepSkyCache = null;
const deepSky = async (ctx) => {
  if (!deepSkyCache) deepSkyCache = JSON.parse(await ctx.fetchText('/models/deepsky.scene.json'));
  return deepSkyCache;
};

const answer = (id, result) => ({ jsonrpc: '2.0', id, result });
const errorOf = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** One JSON-RPC message -> its answer, or null (a notification needs none). */
export const handleMcp = async (msg, ctx) => {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return errorOf(msg?.id, -32600, 'invalid request');
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null;
  const tools = publicTools();
  switch (method) {
    case 'initialize':
      return answer(id, {
        protocolVersion: PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'spider-paint', title: 'Spider Paint', version },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return answer(id, {});
    case 'tools/list':
      return answer(id, { tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) });
    case 'tools/call': {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return errorOf(id, -32602, `unknown tool: ${params?.name}`);
      try {
        const out = await tool.run(params.arguments ?? {}, ctx);
        // the render is SVG text: it goes in a content block of its own, so the rest stays plain JSON
        const { render, text, ...rest } = out ?? {};
        const content = [{ type: 'text', text: text ?? JSON.stringify(rest) }];
        if (render) content.push({ type: 'text', text: render });
        return answer(id, { content });
      } catch (e) {
        if (e instanceof ToolFail) return answer(id, { content: [{ type: 'text', text: e.message }], isError: true });
        return answer(id, { content: [{ type: 'text', text: `error: ${e.message ?? e}` }], isError: true });
      }
    }
    default:
      return errorOf(id, -32601, `method not found: ${method}`);
  }
};

/**
 * A whole HTTP exchange of the Streamable HTTP transport, for any server: (method, headers, body text) -> { status, headers, body }.
 * POST: one JSON-RPC message (a batch is answered message by message); a notification or a response gets 202. GET (the
 * server-sent stream) and DELETE (ending a session) are not offered: 405. OPTIONS: CORS.
 */
export const handleHttp = async ({ method, body, origin, fetchText }) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization', 'access-control-expose-headers': 'mcp-protocol-version' };
  if (method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
  if (method === 'GET') return { status: 405, headers: { ...cors, allow: 'POST', 'content-type': 'application/json' }, body: JSON.stringify({ error: 'This is the Spider Paint MCP endpoint (Streamable HTTP): POST JSON-RPC messages here.', server: 'spider-paint', viewer: `${origin}/` }) };
  if (method !== 'POST') return { status: 405, headers: { ...cors, allow: 'POST' }, body: '' };
  let msg;
  try {
    msg = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return { status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(errorOf(null, -32700, 'parse error')) };
  }
  const ctx = { origin, fetchText };
  const json = { ...cors, 'content-type': 'application/json' };
  if (Array.isArray(msg)) {
    const outs = (await Promise.all(msg.map((m) => handleMcp(m, ctx)))).filter(Boolean);
    return outs.length ? { status: 200, headers: json, body: JSON.stringify(outs) } : { status: 202, headers: cors, body: '' };
  }
  if (msg && (msg.result !== undefined || msg.error !== undefined) && msg.method === undefined) return { status: 202, headers: cors, body: '' };
  const out = await handleMcp(msg, ctx);
  return out ? { status: 200, headers: json, body: JSON.stringify(out) } : { status: 202, headers: cors, body: '' };
};

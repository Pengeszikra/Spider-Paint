// The export_svg MCP tool: a model or a story as SVG, one picture of a view or an animated SVG (a turntable round the
// model, or a part of a story's timeline). The same drawing as the viewer's svg panel: renderView draws every frame,
// src/svg-anim.js joins them (SMIL, plays in any browser without script).
import { merge, renderView, orbit, makeCamera } from './engine/index.js';
import { animatedSvg, spread, storyView, svgBackground, titledSvg } from '../src/svg-anim.js';
import * as storyFormat from '../models/spider-build-v2.mjs';

const MAX_BYTES = 8e6; // an MCP answer carries the SVG as text
const VIEWS = ['persp', 'front', 'side', 'top'];

export const exportSvgTool = {
  name: 'export_svg',
  description:
    'Save a model or a story as SVG: one picture of a view, or an animated SVG (SMIL: it plays in any browser, without script) of a turntable round the model or of a part of a story\'s timeline. The source: from (a build_model open_url), story (a build_story story_token / open_url, or "story:<name>" bundled with spider-paint) or session_id (the scene open in the workshop widget now). The SVG comes back as text: save it as a .svg file. Flat-coloured faces in the palette\'s colours, far to near, as the viewer\'s SVG view draws them.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'the model: an open_url of build_model (a #scene= link)' },
      story: { type: 'string', description: 'a story: the story_token or open_url of build_story, or "story:<name>"' },
      session_id: { type: 'string', description: 'a workshop session: the scene in the widget now' },
      view: { description: '"persp" (default), "front", "side", "top", or { yaw, pitch } in degrees. A story uses its own camera unless a view is given.' },
      at_ms: { type: 'number', description: 'a picture of a story: its moment in ms (default: the end)' },
      size: { type: 'number', description: 'pixels, 128 to 1600 (default 600)' },
      background: { type: 'string', description: '"dark" (default), "light", "none" (transparent) or a #rrggbb colour' },
      edges: { type: 'boolean', description: 'outline the faces (default true)' },
      animate: {
        type: 'object',
        description: 'an animated SVG instead of one picture',
        properties: {
          kind: { type: 'string', enum: ['turntable', 'story'], description: 'turntable: round the model (any source); story: the story\'s timeline' },
          from: { type: 'number', description: 'turntable: the start angle in degrees (default 0); story: the start time in ms (default 0)' },
          to: { type: 'number', description: 'turntable: the end angle in degrees (default 360, a whole turn); story: the end time in ms (default the story\'s end)' },
          frames: { type: 'number', description: '2 to 240 (default: turntable 36; story 10 a second of the part)' },
          seconds: { type: 'number', description: 'the length of one pass (default: turntable 4; story the part\'s own time)' },
          loop: { type: 'boolean', description: 'play it again and again (default: turntable yes, story no: it stops on the last frame)' },
        },
      },
    },
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

class SvgFail extends Error {}
const fail = (m) => {
  throw new SvgFail(m);
};
const num = (v, what, lo, hi, d) => {
  if (v === undefined) return d;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number`);
  return Math.max(lo, Math.min(hi, v));
};
const paletteOf = (list) => Object.fromEntries((Array.isArray(list) ? list : []).filter((m) => m && typeof m.name === 'string').map(({ name, ...m }) => [name, m]));
const meshOf = (objects) => (objects.length ? merge(...objects.map((o) => o.mesh)) : { positions: [], faces: [] });
// a view: a name, or { yaw, pitch } in degrees (an orbit round the model)
const viewOf = (v) => {
  if (v === undefined) return null;
  if (typeof v === 'string') return VIEWS.includes(v) ? { name: v } : fail(`view must be one of ${VIEWS.join(', ')} or { yaw, pitch }`);
  if (v && typeof v === 'object') return { yaw: num(v.yaw ?? 0, 'view.yaw', -1e4, 1e4, 0), pitch: num(v.pitch ?? 0, 'view.pitch', -90, 90, 0) };
  return fail('view must be a name or { yaw, pitch }');
};
// a renderable view: the named ones as they are, an orbit (the default persp is yaw -35, pitch 25) with the turntable's extra turn
const viewSpec = (v, extraDeg = 0) => {
  if (v?.name && !extraDeg) return v.name;
  const yaw = (v?.name ? DEFAULT_ORBIT[v.name].yaw : v?.yaw ?? -35) + extraDeg;
  const pitch = v?.name ? DEFAULT_ORBIT[v.name].pitch : v?.pitch ?? 25;
  return { ...orbit({ yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180 }), name: '' };
};
const DEFAULT_ORBIT = { persp: { yaw: -35, pitch: 25 }, front: { yaw: 0, pitch: 0 }, side: { yaw: 90, pitch: 0 }, top: { yaw: 0, pitch: 89.9 } };

/** The tool: { svg, summary } or a SvgFail. */
export async function exportSvg(a, { loadStory, loadScene, readSession }) {
  const sources = ['from', 'story', 'session_id'].filter((k) => a[k] !== undefined);
  if (sources.length !== 1) fail('give one source: from (a build_model open_url), story, or session_id');
  const size = Math.round(num(a.size, 'size', 128, 1600, 600));
  const look = { size, occlude: true, points: false, background: svgBackground(a.background ?? 'dark'), ...(a.edges === false ? { stroke: 'none' } : {}) };
  const view = viewOf(a.view);
  const an = a.animate;
  if (an !== undefined && (typeof an !== 'object' || an === null || Array.isArray(an))) fail('animate must be an object');
  const kind = an?.kind ?? (an ? (a.story !== undefined ? 'story' : 'turntable') : null);
  if (kind && !['turntable', 'story'].includes(kind)) fail('animate.kind must be turntable or story');

  // ---- the source: a scene (objects + palette) or a story document
  let doc = null, scene = null, title = 'spider-paint';
  if (a.story !== undefined) {
    doc = await loadStory(a.story);
    if (doc?.format !== storyFormat.FORMAT) fail('story: not a Spider Build story');
    doc = storyFormat.normalizeBuildDocument(doc);
    title = doc.metadata?.title ?? title;
  } else if (a.from !== undefined) scene = await loadScene(a.from);
  else scene = await readSession(a.session_id);
  if (scene) title = scene.name ?? title;
  if (kind === 'story' && !doc) fail('animate.kind story needs a story source');

  const frames = [];
  let bytes = 0;
  const push = (svg) => {
    frames.push(svg);
    bytes += svg.length;
    if (bytes > MAX_BYTES) fail(`the SVG would be over ${MAX_BYTES / 1e6} MB after ${frames.length} frames: fewer frames, a smaller size or a shorter part`);
  };
  // one frame of the story at t: its own camera unless a view was given (then an orbit round what is there)
  const storyFrame = (t, extraDeg = 0) => {
    const objects = storyFormat.sceneAt(doc, t);
    const pal = paletteOf(doc.scene?.palette);
    if (view || extraDeg) return renderView(meshOf(objects), viewSpec(view, extraDeg), { ...look, palette: pal });
    const { view: v, fit } = storyView(storyFormat.cameraAt(doc, t), { orbit, makeCamera });
    return renderView(meshOf(objects), v, { ...look, fit, palette: pal });
  };
  const sceneFrame = (extraDeg = 0) => renderView(meshOf(scene.objects), viewSpec(view ?? { name: 'persp' }, extraDeg), { ...look, palette: paletteOf(scene.palette) });
  const d = doc?.timeline?.durationMs ?? 0;

  if (!kind) {
    const t = num(a.at_ms, 'at_ms', 0, d, d);
    const svg = titledSvg(doc ? storyFrame(t) : sceneFrame(), title);
    if (svg.length > MAX_BYTES) fail(`the SVG would be over ${MAX_BYTES / 1e6} MB: a smaller size`);
    return { svg, summary: { kind: 'picture', title, size, bytes: svg.length, ...(doc ? { at_ms: t } : {}) } };
  }
  const isStory = kind === 'story';
  const from = num(an.from, 'animate.from', isStory ? 0 : -1e5, isStory ? d : 1e5, 0);
  const to = num(an.to, 'animate.to', isStory ? 0 : -1e5, isStory ? d : 1e5, isStory ? d : 360);
  const count = Math.round(num(an.frames, 'animate.frames', 2, 240, isStory ? Math.max(2, Math.min(240, Math.round((Math.abs(to - from) / 1000) * 10))) : 36));
  const seconds = num(an.seconds, 'animate.seconds', 0.1, 600, isStory ? Math.max(0.1, Math.abs(to - from) / 1000) : 4);
  const loop = an.loop ?? !isStory;
  if (isStory) {
    for (const t of spread(from, to, count)) push(storyFrame(t));
  } else {
    const full = loop && to !== from && Math.abs(to - from) % 360 < 1e-9; // a whole turn: the last frame would be the first again
    const t = doc ? num(a.at_ms, 'at_ms', 0, d, d) : 0;
    for (const deg of spread(from, to, count, full)) push(doc ? storyFrame(t, deg || 1e-9) : sceneFrame(deg || 1e-9));
  }
  const svg = animatedSvg(frames, { size, seconds, loop, title });
  if (svg.length > MAX_BYTES) fail(`the SVG would be over ${MAX_BYTES / 1e6} MB: fewer frames or a smaller size`);
  return { svg, summary: { kind, title, size, frames: count, seconds, loop, from, to, bytes: svg.length } };
}
export { SvgFail };

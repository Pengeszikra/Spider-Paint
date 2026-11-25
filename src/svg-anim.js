// SVG export: one picture of a view, or an animated SVG made of frames. Shared by the viewer (the svg panel) and the MCP
// export_svg tool. It only composes text: the frames are drawn by the engine's renderView, whose functions the caller
// passes in (the viewer and the server load the engine from different places).
//
// The animation is SMIL, so it plays in any browser and in anything that shows SVG files, without script: every frame is
// a group shown for its share of the time (discrete visibility keys). Neighbouring frames that came out the same are one
// group, so a pause in a construction story costs nothing. The first frame is visible without animation too (a thumbnail).

const num = (v) => +Number(v).toFixed(4);
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

/** The inside of a standalone <svg> (what renderView returns). */
export const svgInner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>\n?/, '').replace(/\n?<\/svg>\s*$/, '');

/** `n` values from `a` to `b`; with `loop` the end is left out, as it is the start again (a full turn). */
export const spread = (a, b, n, loop = false) => Array.from({ length: n }, (_, i) => a + ((b - a) * (n === 1 ? 0 : i)) / (loop ? n : n - 1));

/**
 * A story camera pose (the story format's cameraAt: eye, yaw and pitch in degrees, fov in degrees) as renderView's view
 * and fit: the eye stands where the story put it and looks the way it looked.
 */
export const storyView = (pose, { orbit, makeCamera }) => {
  const view = { ...orbit({ yaw: (pose.yaw * Math.PI) / 180, pitch: (pose.pitch * Math.PI) / 180 }), name: '' };
  const f = makeCamera(view, { positions: [], faces: [] }, 100, { center: [0, 0, 0], radius: 1, dist: 1 }).f;
  return { view, fit: { center: pose.eye.map((c, i) => c + f[i]), radius: 1, dist: 1, ...(pose.fov !== undefined ? { fov: (pose.fov * Math.PI) / 180 } : {}) } };
};

/** The background options: 'dark' (the viewer's), 'light', 'none' (transparent), or a #rrggbb colour. */
export const svgBackground = (v) => (v === 'none' || v === 'transparent' ? 'none' : v === 'light' ? '#f4f2ec' : /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v)) ? v : '#141412');

/**
 * Frames (standalone SVGs of one size) as one animated SVG. seconds: the length of one pass; loop: play it again and
 * again (else it stops on the last frame).
 */
export const animatedSvg = (frames, { size, seconds = 4, loop = true, title = 'spider-paint' } = {}) => {
  if (!frames.length) throw new Error('no frames');
  const runs = [];
  for (const svg of frames) {
    const body = svgInner(svg);
    const last = runs[runs.length - 1];
    if (last && last.body === body) last.n++;
    else runs.push({ body, n: 1 });
  }
  const n = frames.length, dur = num(Math.max(0.05, seconds));
  let at = 0;
  const groups = runs.map((r, k) => {
    const a = num(at / n), b = num((at + r.n) / n);
    at += r.n;
    if (runs.length === 1) return `<g>\n${r.body}\n</g>`;
    const first = k === 0, last = k === runs.length - 1;
    const [values, keyTimes] = first ? ['visible;hidden', `0;${b}`] : last ? ['hidden;visible', `0;${a}`] : ['hidden;visible;hidden', `0;${a};${b}`];
    const timing = loop ? 'repeatCount="indefinite"' : 'fill="freeze"';
    return `<g visibility="${first ? 'visible' : 'hidden'}"><animate attributeName="visibility" calcMode="discrete" values="${values}" keyTimes="${keyTimes}" dur="${dur}s" ${timing}/>\n${r.body}\n</g>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<title>${esc(title)}</title>`,
    `<desc>${n} frames (${runs.length} different), ${dur} s${loop ? ', looping' : ''}; made with spider-paint</desc>`,
    ...groups,
    '</svg>',
    '',
  ].join('\n');
};

/** One picture: renderView's SVG with a title. */
export const titledSvg = (svg, title = 'spider-paint') => svg.replace(/(<svg[^>]*>\n?)/, `$1<title>${esc(title)}</title>\n`);

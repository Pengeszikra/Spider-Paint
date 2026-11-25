// Lit colours for an SVG picture: every polygon takes the average colour of its own pixels in a GPU frame of the same view
// (same camera, size and fit), so the light, the studio rig and the tone mapping come into the vectors, one colour a face.
// Pure: no DOM, no GPU (the page renders the frame and passes its pixels); node can test it.

const HEX = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

// Scan-line fill of a polygon (pixel centres inside, even-odd) into an id buffer: later polygons overwrite earlier ones,
// as the painter's order of the SVG paints them.
const fillPolygon = (ids, W, H, pts, id) => {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  const from = Math.max(0, Math.ceil(y0 - 0.5)), to = Math.min(H - 1, Math.floor(y1 - 0.5));
  const xs = [];
  for (let y = from; y <= to; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let a = 0; a < pts.length; a++) {
      const [ax, ay] = pts[a], [bx, by] = pts[(a + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      ids.fill(id, y * W + x0, y * W + x1 + 1);
    }
  }
};

/**
 * Recolour the polygons of `svg` (renderView's output, coordinates in pixels of a square frame) from `img`
 * ({ width, height, data: RGBA bytes, rows top down }). A see-through polygon (fill-opacity) keeps its colour: its pixels
 * show what is behind it too. A polygon with no pixel of its own (hidden, too thin) keeps its colour as well.
 * The pixels on a face's border are left out when the face has inner ones (the GPU's edge smoothing mixes the neighbours).
 * Returns { svg, lit, kept }.
 */
export const litSvg = (svg, img, { scale = 1 } = {}) => {
  const W = img.width, H = img.height;
  const tags = svg.match(/<polygon\b[^>]*>/g) ?? [];
  const ids = new Int32Array(W * H).fill(-1);
  tags.forEach((tag, i) => {
    if (/fill-opacity=/.test(tag)) return;
    const m = /points="([^"]*)"/.exec(tag);
    if (!m) return;
    const pts = m[1].trim().split(/\s+/).map((s) => s.split(',').map((v) => Number(v) * scale));
    if (pts.length >= 3 && pts.every((p) => p.length === 2 && p.every(Number.isFinite))) fillPolygon(ids, W, H, pts, i);
  });
  const inner = new Float64Array(tags.length * 4), all = new Float64Array(tags.length * 4);
  const d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x, id = ids[p];
      if (id < 0) continue;
      const q = id * 4;
      const add = (acc) => ((acc[q] += d[p * 4]), (acc[q + 1] += d[p * 4 + 1]), (acc[q + 2] += d[p * 4 + 2]), (acc[q + 3] += 1));
      add(all);
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1 && ids[p - 1] === id && ids[p + 1] === id && ids[p - W] === id && ids[p + W] === id) add(inner);
    }
  let n = 0, lit = 0;
  const out = svg.replace(/<polygon\b[^>]*>/g, (tag) => {
    const q = n++ * 4;
    const acc = inner[q + 3] ? inner : all;
    if (!acc[q + 3] || /fill-opacity=/.test(tag)) return tag;
    lit++;
    const c = acc[q + 3];
    return tag.replace(/fill="[^"]*"/, `fill="#${HEX(acc[q] / c)}${HEX(acc[q + 1] / c)}${HEX(acc[q + 2] / c)}"`);
  });
  return { svg: out, lit, kept: tags.length - lit };
};

/** Show only a part of a picture: the first <svg>'s viewBox, width and height become the rectangle [x, y, w, h]. */
export const cropSvg = (svg, [x, y, w, h]) => {
  const r = (v) => Math.round(v * 100) / 100;
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/viewBox="[^"]*"/, `viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}"`)
      .replace(/width="[^"]*"/, `width="${Math.round(w)}"`)
      .replace(/height="[^"]*"/, `height="${Math.round(h)}"`),
  );
};

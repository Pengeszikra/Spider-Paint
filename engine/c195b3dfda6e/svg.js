// Flat SVG preview: points, edges, faces. No shading, no textures.
// Faces are painted far to near (see order.js), back faces culled. The polygon stroke
// is the edge layer, so hidden edges stay hidden. Output is deterministic.
import { dot, norm, minus } from './vec.js';
import { faceNormal } from './mesh.js';
import { paintOrder } from './order.js';
import { VIEW_ORDER, makeCamera, project } from './camera.js';
import { surfaceOf } from './material.js';
/**
 * Depth-tested scanline fill of one polygon into an id buffer. `w` grows towards the eye (1/depth in a
 * perspective view, -depth in an orthographic one) and is linear across a planar face on the screen.
 * A pixel that ties with what is there (coplanar faces) keeps both ids alive for the painter's order.
 */
const fill = (ids, zb, size, pts, w, id, alive, solid = true) => {
    const test = (x, y, v) => {
        if (x < 0 || y < 0 || x >= size || y >= size)
            return;
        const at = y * size + x;
        const old = zb[at];
        const tie = Math.abs(v - old) <= 1e-5 * Math.abs(old);
        if (!solid) {
            // a see-through face is visible where nothing nearer hides it, and hides nothing itself
            if (v > old || tie)
                alive.add(id);
            return;
        }
        if (v > old || tie) {
            if (tie && ids[at] >= 0)
                alive.add(ids[at]);
            zb[at] = Math.max(v, old);
            ids[at] = id;
        }
    };
    // the outline too: a face thinner than a pixel still shows as a line
    for (let a = 0; a < pts.length; a++) {
        const b = (a + 1) % pts.length;
        const n = Math.ceil(Math.max(Math.abs(pts[b].x - pts[a].x), Math.abs(pts[b].y - pts[a].y)));
        for (let i = 0; i <= n; i++) {
            const t = n ? i / n : 0;
            test(Math.floor(pts[a].x + t * (pts[b].x - pts[a].x)), Math.floor(pts[a].y + t * (pts[b].y - pts[a].y)), w[a] + t * (w[b] - w[a]));
        }
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts)
        (lo = Math.min(lo, p.y), (hi = Math.max(hi, p.y)));
    const y0 = Math.max(0, Math.ceil(lo - 0.5));
    const y1 = Math.min(size - 1, Math.floor(hi - 0.5));
    const cross = [];
    for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        cross.length = 0;
        for (let a = 0; a < pts.length; a++) {
            const b = (a + 1) % pts.length;
            const p = pts[a];
            const q = pts[b];
            if ((p.y <= yc && q.y > yc) || (q.y <= yc && p.y > yc)) {
                const t = (yc - p.y) / (q.y - p.y);
                cross.push({ x: p.x + t * (q.x - p.x), w: w[a] + t * (w[b] - w[a]) });
            }
        }
        cross.sort((a, b) => a.x - b.x);
        for (let k = 0; k + 1 < cross.length; k += 2) {
            const l = cross[k];
            const r = cross[k + 1];
            const x0 = Math.max(0, Math.ceil(l.x - 0.5));
            const x1 = Math.min(size - 1, Math.floor(r.x - 0.5));
            const span = r.x - l.x || 1;
            for (let x = x0; x <= x1; x++) {
                const v = l.w + ((x + 0.5 - l.x) / span) * (r.w - l.w);
                test(x, y, v);
            }
        }
    }
};
const defaults = {
    size: 400,
    cull: true,
    points: true,
    stroke: '#1d1d1f',
    pointColor: '#d6336c',
    background: '#fafafa',
};
const num = (n) => String(Math.round(n * 100) / 100 + 0); // +0 turns -0 into 0
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const panel = (mesh, view, o, x = 0, y = 0) => {
    const cam = makeCamera(view, mesh, o.size, o.fit);
    const name = esc(cam.name);
    const proj = mesh.positions.map((p) => project(cam, p));
    const items = [];
    const NEAR = 0.02; // perspective: nearer than this is cut off
    const keep = -8; // faces entirely off the panel (by more than a stroke) are not drawn
    const seen = (pts) => !pts.every((p) => p.x < keep) && !pts.every((p) => p.y < keep) && !pts.every((p) => p.x > o.size - keep) && !pts.every((p) => p.y > o.size - keep);
    mesh.faces.forEach((face, i) => {
        let world = face.v.map((k) => mesh.positions[k]);
        let screen = face.v.map((k) => proj[k]);
        const dir = cam.ortho ? cam.f : minus(cam.eye)(world[0]);
        const normal = faceNormal(world);
        const facing = dot(normal, dir) < 0;
        if (o.cull && !facing)
            return; // back face
        if (cam.ortho) {
            if (screen.some((s) => s.depth <= 0.01))
                return; // behind the camera
        }
        else if (screen.some((s) => s.depth < NEAR)) {
            // cut the face at the near plane, like a camera does
            if (screen.every((s) => s.depth < NEAR))
                return;
            const cut = [];
            for (let a = 0; a < world.length; a++) {
                const b = (a + 1) % world.length;
                const da = screen[a].depth - NEAR;
                const db = screen[b].depth - NEAR;
                if (da >= 0)
                    cut.push(world[a]);
                if (da * db < 0) {
                    const t = da / (da - db);
                    cut.push(world[a].map((c, k) => c + (world[b][k] - c) * t));
                }
            }
            if (cut.length < 3)
                return;
            world = cut;
            screen = world.map((p) => project(cam, p));
        }
        if (!seen(screen))
            return; // outside the panel
        const surface = surfaceOf(face, o.palette);
        items.push({
            i,
            vs: face.v,
            world,
            screen,
            n: norm(normal),
            p: world[0],
            eye: facing ? 1 : -1,
            color: surface.color,
            alpha: surface.alpha,
            depth: screen.reduce((s, p) => s + p.depth, 0) / screen.length,
            pts: screen.map((p) => `${num(p.x)},${num(p.y)}`).join(' '),
        });
    });
    // Occlusion: a depth buffer finds the faces that own a pixel; only those go on to the painter's order.
    let idBuf = null;
    let visible = items;
    if (o.occlude) {
        const buf = new Int32Array(o.size * o.size).fill(-1);
        const zb = new Float32Array(o.size * o.size).fill(-Infinity);
        const alive = new Set();
        items.forEach((it, idx) => {
            const w = it.screen.map((p) => (cam.ortho ? -p.depth : 1 / p.depth));
            fill(buf, zb, o.size, it.screen, w, idx, alive, it.alpha >= 1);
        });
        for (const id of buf)
            if (id >= 0)
                alive.add(id);
        const remap = new Map(); // item index -> index among the visible faces
        visible = items.filter((_, idx) => alive.has(idx) && (remap.set(idx, remap.size), true));
        idBuf = buf.map((id) => (id < 0 ? -1 : (remap.get(id) ?? -1)));
    }
    let ordered = paintOrder(visible); // far to near
    if (idBuf) {
        // ids point into `visible`; the painter's order permutes it
        const at = new Map();
        visible.forEach((it, n) => at.set(it, n));
        const perm = new Int32Array(visible.length);
        ordered.forEach((it, n) => (perm[at.get(it)] = n));
        idBuf = idBuf.map((id) => (id < 0 ? -1 : perm[id]));
    }
    // A point is drawn right after the nearest painted face that holds it, so
    // faces painted later (closer to the camera) still cover it.
    const last = new Map();
    ordered.forEach((it, idx) => it.vs.forEach((k) => last.set(k, idx)));
    // a point is visible when a visible face that holds it owns a pixel at (or right next to) it
    const reached = (k) => {
        const px = Math.round(proj[k].x);
        const py = Math.round(proj[k].y);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = px + dx;
                const y = py + dy;
                if (x < 0 || y < 0 || x >= o.size || y >= o.size)
                    continue;
                const id = idBuf[y * o.size + x];
                if (id >= 0 && ordered[id].vs.includes(k))
                    return true;
            }
        }
        return false;
    };
    const body = ordered.flatMap((it, idx) => {
        const polygon = `<polygon data-face="${it.i}" data-depth="${num(it.depth)}" points="${it.pts}" ` +
            `fill="${it.color}"${it.alpha < 1 ? ` fill-opacity="${num(it.alpha)}"` : ''} stroke="${o.stroke}" stroke-width="1.5" stroke-linejoin="round"/>`;
        const dots = o.points
            ? it.vs
                .filter((k) => last.get(k) === idx && (cam.ortho || proj[k].depth >= NEAR) && (!idBuf || reached(k)))
                .sort((a, b) => a - b)
                .map((k) => `<circle data-v="${k}" cx="${num(proj[k].x)}" cy="${num(proj[k].y)}" r="3" fill="${o.pointColor}"/>`)
            : [];
        return [polygon, ...dots];
    });
    // 3D polylines (e.g. a surface cursor) drawn on top of everything else.
    const marks = (o.marks ?? []).flatMap((m) => m.lines.flatMap((line) => {
        const pts = line.map((p) => project(cam, p));
        if (pts.some((p) => p.depth <= 0.01))
            return [];
        return [
            `<polyline data-mark="${esc(m.name ?? 'mark')}" points="${pts.map((p) => `${num(p.x)},${num(p.y)}`).join(' ')}" ` +
                `fill="none" stroke="${m.color ?? '#0b7285'}" stroke-width="${m.width ?? 2}" ` +
                `stroke-linecap="round" stroke-linejoin="round"${m.opacity !== undefined && m.opacity < 1 ? ` stroke-opacity="${m.opacity}"` : ''}/>`,
        ];
    }));
    return [
        `<g data-view="${name}" transform="translate(${x} ${y})">`,
        `<rect width="${o.size}" height="${o.size}" fill="${o.background}" stroke="#cfcfd4"/>`,
        `<text x="10" y="20" font-family="monospace" font-size="13" fill="#555">${name}</text>`,
        ...body,
        ...marks,
        '</g>',
    ].join('\n');
};
const root = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${body}\n</svg>\n`;
/**
 * One standalone SVG for a single view: 'front' | 'side' | 'top' | 'persp',
 * or a custom { dir, up, ortho, name? } spec.
 */
export const renderView = (mesh, view, opts = {}) => {
    const o = { ...defaults, ...opts };
    return root(o.size, o.size, panel(mesh, view, o));
};
/** The four views one after another: [{ name, svg }, ...]. */
export const renderViews = (mesh, opts = {}) => VIEW_ORDER.map((name) => ({ name, svg: renderView(mesh, name, opts) }));
/** All four views on one 2x2 sheet: front, side / top, persp. */
export const renderSheet = (mesh, opts = {}) => {
    const o = { ...defaults, ...opts };
    const body = VIEW_ORDER.map((name, i) => panel(mesh, name, o, (i % 2) * o.size, Math.floor(i / 2) * o.size)).join('\n');
    return root(o.size * 2, o.size * 2, body);
};

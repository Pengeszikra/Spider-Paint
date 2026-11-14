// Boolean operations on closed solids: union, subtract (a - b) and intersect.
// A BSP tree per solid (after Evan Wallace's csg.js): polygons are cut by the planes of the other solid
// and the pieces inside or outside are kept, so every result face stays planar and convex, which is what
// the rest of the engine assumes. The result is welded and its T-junctions are closed, so it is a closed
// solid again and can go into the next boolean. Faces keep the color and material of the face they came from;
// a face cut into a solid by the other one takes the color of the cutting face.
import { triangulate } from './triangulate.js';
import { sub, dot, cross, len } from './vec.js';
import { faceNormal, bounds } from './mesh.js';
import { validate } from './check.js';
let CSG_EPS = 1e-6; // set per operation, relative to the size of the two solids
const unit = (v) => {
    const l = len(v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
};
// The BSP needs convex polygons: a concave face (an L, a V, a sketch outline) goes in as the triangles of its ear clipping.
const polysOf = (mesh) => mesh.faces.flatMap((f) => {
    const pts = f.v.map((k) => mesh.positions[k]);
    const n = unit(faceNormal(pts));
    if (len(faceNormal(pts)) < 1e-12)
        return [];
    const tris = triangulate(pts);
    if (tris.every(([a, b, c], j) => a === 0 && b === j + 1 && c === j + 2))
        return [{ pts, n, w: dot(n, pts[0]), color: f.color, mat: f.mat }];
    return tris.map((t) => ({ pts: t.map((i) => pts[i]), n, w: dot(n, pts[0]), color: f.color, mat: f.mat }));
});
const flip = (p) => ({ ...p, pts: [...p.pts].reverse(), n: [-p.n[0], -p.n[1], -p.n[2]], w: -p.w });
/** Cuts `p` by the plane into the four buckets. */
const splitPoly = (plane, p, cf, cb, front, back) => {
    const COPLANAR = 0;
    const FRONT = 1;
    const BACK = 2;
    const SPANNING = 3;
    let type = 0;
    const types = p.pts.map((q) => {
        const t = dot(plane.n, q) - plane.w;
        const k = t < -CSG_EPS ? BACK : t > CSG_EPS ? FRONT : COPLANAR;
        type |= k;
        return k;
    });
    if (type === COPLANAR)
        (dot(plane.n, p.n) > 0 ? cf : cb).push(p);
    else if (type === FRONT)
        front.push(p);
    else if (type === BACK)
        back.push(p);
    else if (type === SPANNING) {
        const f = [];
        const b = [];
        for (let i = 0; i < p.pts.length; i++) {
            const j = (i + 1) % p.pts.length;
            const ti = types[i];
            const tj = types[j];
            const vi = p.pts[i];
            const vj = p.pts[j];
            if (ti !== BACK)
                f.push(vi);
            if (ti !== FRONT)
                b.push(vi);
            if ((ti | tj) === SPANNING) {
                const t = (plane.w - dot(plane.n, vi)) / dot(plane.n, sub(vj, vi));
                const v = [vi[0] + (vj[0] - vi[0]) * t, vi[1] + (vj[1] - vi[1]) * t, vi[2] + (vj[2] - vi[2]) * t];
                f.push(v);
                b.push(v);
            }
        }
        if (f.length >= 3)
            front.push({ ...p, pts: f });
        if (b.length >= 3)
            back.push({ ...p, pts: b });
    }
};
const build = (node, polys) => {
    if (!polys.length)
        return;
    if (!node.plane)
        node.plane = { n: polys[0].n, w: polys[0].w };
    const front = [];
    const back = [];
    for (const p of polys)
        splitPoly(node.plane, p, node.polys, node.polys, front, back);
    if (front.length)
        build((node.front ??= { plane: null, front: null, back: null, polys: [] }), front);
    if (back.length)
        build((node.back ??= { plane: null, front: null, back: null, polys: [] }), back);
};
const tree = (polys) => {
    const node = { plane: null, front: null, back: null, polys: [] };
    build(node, polys);
    return node;
};
const invert = (node) => {
    node.polys = node.polys.map(flip);
    if (node.plane)
        node.plane = { n: [-node.plane.n[0], -node.plane.n[1], -node.plane.n[2]], w: -node.plane.w };
    invert0(node);
};
const invert0 = (node) => {
    if (node.front)
        invert(node.front);
    if (node.back)
        invert(node.back);
    [node.front, node.back] = [node.back, node.front];
};
/** The parts of `polys` that are outside the solid of `node`. */
const clipPolys = (node, polys) => {
    if (!node.plane)
        return [...polys];
    let front = [];
    let back = [];
    for (const p of polys)
        splitPoly(node.plane, p, front, back, front, back);
    front = node.front ? clipPolys(node.front, front) : front;
    back = node.back ? clipPolys(node.back, back) : [];
    return [...front, ...back];
};
const clipTo = (node, other) => {
    node.polys = clipPolys(other, node.polys);
    if (node.front)
        clipTo(node.front, other);
    if (node.back)
        clipTo(node.back, other);
};
const all = (node) => [...node.polys, ...(node.front ? all(node.front) : []), ...(node.back ? all(node.back) : [])];
/** Polygons to a welded mesh: shared vertices, no sliver faces, T-junctions closed. */
const toMesh = (polys, scale) => {
    const cell = scale * 1e-5;
    const ids = new Map();
    const positions = [];
    const weld = (p) => {
        // look in the neighbouring cells too, so a point on a cell border still finds its twin
        const base = p.map((c) => Math.round(c / cell));
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dz = -1; dz <= 1; dz++) {
                    const hit = ids.get(`${base[0] + dx},${base[1] + dy},${base[2] + dz}`);
                    if (hit !== undefined && len(sub(positions[hit], p)) <= cell * 1.5)
                        return hit;
                }
        ids.set(base.join(','), positions.length);
        positions.push(p);
        return positions.length - 1;
    };
    let faces = polys.flatMap((p) => {
        const v = [];
        for (const q of p.pts) {
            const k = weld(q);
            if (v[v.length - 1] !== k)
                v.push(k);
        }
        if (v.length > 1 && v[0] === v[v.length - 1])
            v.pop();
        if (v.length < 3)
            return [];
        // slivers stay for now: their vertices still give the neighbours' edges something to join to (see below)
        return [{ v, color: p.color, mat: p.mat }];
    });
    // T-junctions: a vertex lying on the edge of a neighbouring face gets inserted into that edge
    const used = new Set(faces.flatMap((f) => f.v));
    const verts = [...used];
    if (verts.length * faces.length < 6e7) {
        const tol = scale * 1e-5 * 3;
        faces = faces.map((f) => {
            const out = [];
            for (let i = 0; i < f.v.length; i++) {
                const a = f.v[i];
                const b = f.v[(i + 1) % f.v.length];
                out.push(a);
                const pa = positions[a];
                const pb = positions[b];
                const d = sub(pb, pa);
                const dl = len(d);
                if (dl < tol * 4)
                    continue;
                const on = [];
                for (const k of verts) {
                    if (k === a || k === b || f.v.includes(k))
                        continue; // never twice in one face
                    const pk = positions[k];
                    const t = dot(sub(pk, pa), d) / (dl * dl);
                    if (t <= 0 || t >= 1)
                        continue;
                    if (len(cross(sub(pk, pa), d)) / dl <= tol)
                        on.push({ t, k });
                }
                on.sort((x, y) => x.t - y.t);
                for (const { k } of on)
                    out.push(k);
            }
            return { ...f, v: out };
        });
    }
    // Now the slivers can go: a face with no area (its corners are in a line, the neighbours already have the extra vertices)
    // closes up around it. Dropping one before the T-junctions are done would leave a hole (an open edge) behind.
    const flat = 1e-9 * scale * scale;
    faces = faces.filter((f) => len(faceNormal(f.v.map((k) => positions[k]))) >= flat);
    return { positions, faces };
};
const closedSolid = (name, m) => {
    const v = validate(m);
    if (!v.closed)
        throw new Error(`boolean needs closed solids: ${name} has ${v.openEdges} open edge(s)`);
    if (v.inside_out)
        throw new Error(`boolean needs outward faces: ${name} is inside out`);
};
const subMesh = (mesh, idx) => {
    const map = new Map();
    const positions = [];
    const faces = idx.map((i) => {
        const f = mesh.faces[i];
        return { ...f, v: f.v.map((k) => (map.has(k) ? map.get(k) : (map.set(k, positions.length), positions.push(mesh.positions[k]), positions.length - 1))) };
    });
    return { ...mesh, positions, faces };
};
/** The connected parts of a mesh as separate meshes (each with its own vertex list), in face order of their first face. */
export const splitParts = (mesh) => health(mesh)
    .parts.map((p) => p.faces)
    .sort((a, b) => a[0] - b[0])
    .map((faces) => subMesh(mesh, faces));
/** Splits a mesh into connected parts and says which of them are closed solids (the health check). */
export const health = (mesh) => {
    const n = mesh.faces.length;
    const root = Array.from({ length: n }, (_, i) => i);
    const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
    const seen = new Map();
    mesh.faces.forEach((f, i) => f.v.forEach((v, k) => {
        const w = f.v[(k + 1) % f.v.length];
        const key = v < w ? `${v},${w}` : `${w},${v}`;
        const j = seen.get(key);
        if (j === undefined)
            seen.set(key, i);
        else
            root[find(i)] = find(j);
    }));
    const groups = new Map();
    for (let i = 0; i < n; i++)
        groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
    const parts = [...groups.values()].map((faces) => {
        const v = validate(subMesh(mesh, faces));
        return { faces, closed: v.closed, insideOut: v.inside_out, openEdges: v.openEdges };
    });
    const usable = parts.filter((p) => p.closed && !p.insideOut);
    const usableFaces = usable.reduce((t, p) => t + p.faces.length, 0);
    return { parts, usableFaces, skippedFaces: n - usableFaces, hasSolid: usable.length > 0, allSolid: usable.length === parts.length && parts.length > 0 };
};
const append = (base, extra) => {
    const o = base.positions.length;
    return { ...base, positions: [...base.positions, ...extra.positions], faces: [...base.faces, ...extra.faces.map((f) => ({ ...f, v: f.v.map((k) => k + o) }))] };
};
/**
 * Boolean of two closed solids (outward CCW faces): 'union', 'subtract' (a minus b) or 'intersect'.
 * Throws with a reason when an input is open or inside out. With `strict: false` the parts that are not closed solids are
 * left out of the calculation instead (see `health`): a union keeps them as they are, a subtract keeps those of `a`,
 * an intersect drops them; it throws only when `a` has no closed part at all.
 */
export const boolean = (a, b, op, { strict = true } = {}) => {
    if (strict) {
        closedSolid('a', a);
        closedSolid('b', b);
        return run(a, b, op);
    }
    const ha = health(a);
    const hb = health(b);
    if (!ha.hasSolid)
        throw new Error('boolean: the model has no closed part (nothing to calculate with)');
    if (!hb.hasSolid)
        throw new Error('boolean: the second model has no closed part');
    const pick = (m, h, closed) => subMesh(m, h.parts.filter((p) => (p.closed && !p.insideOut) === closed).flatMap((p) => p.faces).sort((x, y) => x - y));
    let out = run(pick(a, ha, true), pick(b, hb, true), op);
    if (ha.skippedFaces)
        out = append(out, pick(a, ha, false));
    if (op === 'union' && hb.skippedFaces)
        out = append(out, pick(b, hb, false));
    return out;
};
// A result is sound when it is a closed, outward solid with consistent winding (and the inputs were).
const sound = (m) => {
    if (!m.faces.length)
        return true; // nothing is a fine result (disjoint intersect)
    const v = validate(m);
    return v.closed && !v.inside_out && !v.notes.some((n) => /wound inconsistently/.test(n));
};
const shiftBy = (m, d) => ({ ...m, positions: m.positions.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]) });
/**
 * BSP booleans hit numerical trouble when faces are (nearly) coincident or a cut passes within a hair of a vertex; the
 * result then comes out with a crack or a flipped face. A solid must stay a solid, so a result that is not sound is
 * thrown away and the operation is repeated with the second operand moved by a tiny amount (a few tries, growing).
 * When no try gives a sound solid it throws, so the caller keeps the original.
 */
const run = (a, b, op) => {
    const first = run0(a, b, op);
    if (sound(first) || !sound(a) || !sound(b))
        return first;
    const size = Math.max(bounds(a).radius, bounds(b).radius, 1e-9);
    for (let k = 1; k <= 12; k++) {
        const mag = size * 1e-4 * k;
        const d = [Math.sin(k * 12.9898) * mag, Math.sin(k * 78.233) * mag, Math.sin(k * 37.719) * mag];
        const r = run0(a, shiftBy(b, d), op);
        if (sound(r))
            return r;
    }
    throw new Error('boolean: the result would not be a closed solid (numerical trouble); the operands were left alone');
};
const run0 = (a, b, op) => {
    const sa = bounds(a);
    const sb = bounds(b);
    const scale = Math.max(sa.radius, sb.radius, 1e-9) * 2 + len(sub(sa.center, sb.center));
    CSG_EPS = scale * 1e-9 * 1000;
    const A = tree(polysOf(a));
    const B = tree(polysOf(b));
    if (op === 'union') {
        clipTo(A, B);
        clipTo(B, A);
        invert(B);
        clipTo(B, A);
        invert(B);
        build(A, all(B));
    }
    else if (op === 'subtract') {
        invert(A);
        clipTo(A, B);
        clipTo(B, A);
        invert(B);
        clipTo(B, A);
        invert(B);
        build(A, all(B));
        invert(A);
    }
    else {
        invert(A);
        clipTo(B, A);
        invert(B);
        clipTo(A, B);
        clipTo(B, A);
        build(A, all(B));
        invert(A);
    }
    return toMesh(all(A), scale);
};
export const union = (a, b) => boolean(a, b, 'union');
export const subtract = (a, b) => boolean(a, b, 'subtract');
export const intersect = (a, b) => boolean(a, b, 'intersect');

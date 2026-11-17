// The saw: one plane cuts a closed solid into closed solids, like a board on the bench.
// The cut is a half-space (a huge box with one face on the plane) run through the boolean, so both sides come out
// closed, every face stays planar, and the new face lies exactly in the saw plane (the "kerf" has no width).
// A solid that the plane splits into several pieces (a U shape cut across its arms) comes out as several meshes.
import { sub, cross, dot, len, norm, add, scale as mul } from './vec.js';
import { box, bounds } from './mesh.js';
import { subtract, intersect, splitParts } from './csg.js';
import { validate } from './check.js';
const MIN = 1e-9;
/**
 * The plane a drawn line gives: it contains the line and stands square on the face the line was drawn on
 * (`faceNormal`), so it runs straight into the material and out beyond the ends of the line.
 */
export const planeThroughLine = (a, b, faceNormal) => {
    const c = cross(sub(b, a), faceNormal);
    if (len(c) < MIN * Math.max(1, len(sub(b, a))))
        throw new Error('the line has no length, or it points along the face normal: it cannot give a plane');
    return { point: a, n: norm(c) };
};
/** The plane through three points. Throws when they lie on one line. */
export const planeThroughTriangle = (a, b, c) => {
    const x = cross(sub(b, a), sub(c, a));
    const scale = Math.max(len(sub(b, a)), len(sub(c, a)), MIN);
    if (len(x) < 1e-9 * scale * scale)
        throw new Error('the three points lie on one line: they do not give a plane');
    return { point: a, n: norm(x) };
};
const frame = (n) => {
    const helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(helper, n));
    const v = cross(n, u);
    return [u, v, n]; // right-handed: u x v = n
};
/**
 * Saw `mesh` along `plane`. `mat` / `color` is the material of the two new faces (the cut surface).
 * Throws when the mesh is not a closed solid, or when the plane does not go through it.
 */
export const saw = (mesh, plane, opts = {}) => {
    // A model of several shells (a cube with a drawn-and-pulled-out V standing on it, a loose open surface): every closed shell is cut by
    // itself, a shell the plane misses, or one that is not closed, goes whole to the side its middle is on.
    const parts = splitParts(mesh);
    if (parts.length > 1) {
        const n = norm(plane.n);
        const front = [];
        const back = [];
        let solids = 0;
        let cut = 0;
        for (const part of parts) {
            const pv = validate(part);
            if (pv.closed && !pv.inside_out) {
                solids++;
                try {
                    const s = sawSolid(part, plane, opts);
                    front.push(...s.front);
                    back.push(...s.back);
                    cut++;
                    continue;
                }
                catch (err) {
                    if (!/does not go through/.test(String(err.message)))
                        throw err;
                }
            }
            (dot(sub(bounds(part).center, plane.point), n) >= 0 ? front : back).push(part);
        }
        if (!solids)
            throw new Error('saw: only a closed solid can be cut');
        if (!cut)
            throw new Error('the plane does not go through the object');
        return { front, back };
    }
    return sawSolid(mesh, plane, opts);
};
const sawSolid = (mesh, plane, { color = '#c8c8c8', mat } = {}) => {
    const v = validate(mesh);
    if (!v.closed || v.inside_out)
        throw new Error('saw: only a closed solid can be cut');
    const n = norm(plane.n);
    const { center, radius } = bounds(mesh);
    const size = Math.max(radius, MIN) * 8;
    const axes = frame(n);
    // the half-space: a box whose bottom face lies in the plane and which reaches far past the solid on every side
    const along = dot(sub(center, plane.point), n);
    const origin = add(sub(center, mul(n, along)), mul(n, size / 2)); // centre of the box: over the foot of the solid's centre
    const slab = box({ size: [size, size, size], at: origin, color, axes });
    if (mat)
        slab.faces.forEach((f) => (f.mat = mat));
    const front = intersect(mesh, slab);
    const back = subtract(mesh, slab);
    if (!front.faces.length || !back.faces.length)
        throw new Error('the plane does not go through the object');
    return { front: splitParts(front), back: splitParts(back) };
};
/** Where the plane meets the faces of the mesh: line segments for the preview of a cut. */
export const sectionSegments = (mesh, plane) => {
    const n = norm(plane.n);
    const out = [];
    const eps = 1e-9 * Math.max(bounds(mesh).radius, 1);
    const d = mesh.positions.map((p) => dot(sub(p, plane.point), n));
    for (const f of mesh.faces) {
        const hits = [];
        f.v.forEach((i, k) => {
            const j = f.v[(k + 1) % f.v.length];
            const a = d[i];
            const b = d[j];
            if (Math.abs(a) <= eps && Math.abs(b) <= eps)
                return; // an edge lying in the plane is the cut's boundary: shown from the other face
            if ((a < -eps && b > eps) || (a > eps && b < -eps)) {
                const t = a / (a - b);
                hits.push(add(mesh.positions[i], mul(sub(mesh.positions[j], mesh.positions[i]), t)));
            }
            else if (Math.abs(a) <= eps)
                hits.push(mesh.positions[i]);
        });
        // a convex face meets a plane in at most two points
        const uniq = hits.filter((p, k) => hits.findIndex((q) => len(sub(p, q)) <= eps * 10) === k);
        if (uniq.length === 2)
            out.push([uniq[0], uniq[1]]);
    }
    return out;
};

// Triangles of one polygon face. A convex polygon (and anything with 3 or 4 well-behaved corners) is a plain fan from its first
// corner; a concave one (an L, a V, a star: an outline that was drawn or filled by hand) is cut by ear clipping, so no triangle ever
// lies outside the outline. The triangles keep the winding of the polygon.
import { faceNormal } from './mesh.js';
const fan = (n) => Array.from({ length: Math.max(0, n - 2) }, (_, j) => [0, j + 1, j + 2]);
/** Indices into `pts`, three per triangle, `pts.length - 2` triangles. */
export const triangulate = (pts) => {
    const n = pts.length;
    if (n <= 3)
        return fan(n);
    const nrm = faceNormal(pts);
    const big = Math.max(Math.abs(nrm[0]), Math.abs(nrm[1]), Math.abs(nrm[2]));
    if (big < 1e-12)
        return fan(n); // no plane to speak of: nothing better than the fan
    // the plane is dropped to 2D along the normal's biggest axis; `sign` keeps the polygon counter-clockwise there
    const axis = big === Math.abs(nrm[0]) ? 0 : big === Math.abs(nrm[1]) ? 1 : 2;
    const [iu, iv] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
    const sign = nrm[axis] >= 0 ? 1 : -1;
    const P = pts.map((p) => [p[iu] * sign, p[iv]]);
    const turn = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
    let scale = 0;
    for (const p of P)
        scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]));
    const eps = 1e-12 * scale * scale;
    let convex = true;
    for (let i = 0; i < n && convex; i++)
        if (turn(i, (i + 1) % n, (i + 2) % n) < -eps)
            convex = false;
    if (convex)
        return fan(n);
    const inside = (p, a, b, c) => {
        // on or in the triangle (a, b, c), which is counter-clockwise; corners at the same place as a, b or c do not count
        for (const q of [a, b, c])
            if (Math.abs(P[p][0] - P[q][0]) <= 1e-12 * scale && Math.abs(P[p][1] - P[q][1]) <= 1e-12 * scale)
                return false;
        return turn(a, b, p) >= -eps && turn(b, c, p) >= -eps && turn(c, a, p) >= -eps;
    };
    const rest = pts.map((_, i) => i);
    const out = [];
    let guard = 0;
    while (rest.length > 3 && guard++ < n * n) {
        let clipped = false;
        for (let k = 0; k < rest.length; k++) {
            const a = rest[(k + rest.length - 1) % rest.length];
            const b = rest[k];
            const c = rest[(k + 1) % rest.length];
            if (turn(a, b, c) <= eps)
                continue; // a reflex (or flat) corner is not an ear
            if (rest.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c)))
                continue;
            out.push([a, b, c]);
            rest.splice(k, 1);
            clipped = true;
            break;
        }
        if (!clipped) {
            // a self-touching or degenerate outline: take the flattest corner off so the loop always ends
            let k = 0;
            let best = -Infinity;
            for (let i = 0; i < rest.length; i++) {
                const t = turn(rest[(i + rest.length - 1) % rest.length], rest[i], rest[(i + 1) % rest.length]);
                if (t > best)
                    ((best = t), (k = i));
            }
            out.push([rest[(k + rest.length - 1) % rest.length], rest[k], rest[(k + 1) % rest.length]]);
            rest.splice(k, 1);
        }
    }
    if (rest.length === 3)
        out.push([rest[0], rest[1], rest[2]]);
    return out;
};

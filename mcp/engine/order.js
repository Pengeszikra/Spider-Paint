// Back-to-front painting order, Newell-Sancha style.
//
// Faces that overlap on screen are ordered by plane tests: face A can be painted
// after face B when A lies wholly on the eye side of B's plane, or when B lies
// wholly behind A's plane. The resulting "paint this first" relations are then
// sorted topologically. Centroid depth only breaks ties, and orders faces that
// cannot be compared (intersecting solids, cycles) as well as before.
import { dot, minus } from './vec.js';
const PLANE_EPS = 1e-6; // plane test tolerance, world units
const PX = 0.01; // overlaps thinner than this are treated as touching
// Do two convex screen polygons overlap by more than a sliver? (separating axis test)
const overlaps = (a, b) => {
    for (const poly of [a, b]) {
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i];
            const q = poly[(i + 1) % poly.length];
            const nx = q.y - p.y;
            const ny = p.x - q.x;
            const length = Math.hypot(nx, ny);
            if (!length)
                continue;
            let minA = Infinity;
            let maxA = -Infinity;
            let minB = Infinity;
            let maxB = -Infinity;
            for (const v of a) {
                const d = (v.x * nx + v.y * ny) / length;
                if (d < minA)
                    minA = d;
                if (d > maxA)
                    maxA = d;
            }
            for (const v of b) {
                const d = (v.x * nx + v.y * ny) / length;
                if (d < minB)
                    minB = d;
                if (d > maxB)
                    maxB = d;
            }
            if (maxA <= minB + PX || maxB <= minA + PX)
                return false;
        }
    }
    return true;
};
// Signed distances of points to a face's plane, positive on the eye side.
const distances = (points, face) => points.map((v) => dot(face.n, minus(face.p)(v)) * face.eye);
/**
 * Items need: { i, world, screen, n, p, eye, depth }
 *   world  face points in world space      screen  the same, projected { x, y }
 *   n, p   unit normal and a point on it   eye     +1 if the face faces the camera, else -1
 *   depth  mean depth, used for ties       i       face index, used for ties
 */
export const paintOrder = (items) => {
    const count = items.length;
    const after = items.map(() => []);
    const waiting = new Array(count).fill(0);
    const link = (first, second) => {
        after[first].push(second);
        waiting[second] += 1;
    };
    // Screen bounding boxes, swept along x: only faces whose boxes overlap get the exact tests.
    const box = items.map(({ screen }) => {
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const { x, y } of screen) {
            if (x < x0)
                x0 = x;
            if (x > x1)
                x1 = x;
            if (y < y0)
                y0 = y;
            if (y > y1)
                y1 = y;
        }
        return { x0, x1, y0, y1 };
    });
    const byX = items.map((_, k) => k).sort((a, b) => box[a].x0 - box[b].x0 || a - b);
    for (let s = 0; s < count; s++) {
        for (let t = s + 1; t < count; t++) {
            const [i, j] = byX[s] < byX[t] ? [byX[s], byX[t]] : [byX[t], byX[s]];
            const bi = box[byX[s]];
            const bj = box[byX[t]];
            if (bj.x0 >= bi.x1 - PX)
                break; // every later box starts further right
            if (bj.y0 >= bi.y1 - PX || bi.y0 >= bj.y1 - PX)
                continue;
            const A = items[i];
            const B = items[j];
            if (!overlaps(A.screen, B.screen))
                continue;
            const a = distances(A.world, B); // A against B's plane
            const b = distances(B.world, A); // B against A's plane
            const aAfterB = a.every((d) => d >= -PLANE_EPS) || b.every((d) => d <= PLANE_EPS);
            const bAfterA = b.every((d) => d >= -PLANE_EPS) || a.every((d) => d <= PLANE_EPS);
            if (aAfterB && !bAfterA)
                link(j, i);
            else if (bAfterA && !aAfterB)
                link(i, j);
        }
    }
    const farther = (x, y) => items[x].depth > items[y].depth || (items[x].depth === items[y].depth && items[x].i < items[y].i);
    const done = new Array(count).fill(false);
    const out = [];
    while (out.length < count) {
        let best = -1;
        for (let k = 0; k < count; k++) {
            if (!done[k] && waiting[k] === 0 && (best < 0 || farther(k, best)))
                best = k;
        }
        if (best < 0) {
            // a cycle: take the farthest face that is left
            for (let k = 0; k < count; k++)
                if (!done[k] && (best < 0 || farther(k, best)))
                    best = k;
        }
        done[best] = true;
        out.push(items[best]);
        for (const k of after[best])
            waiting[k] -= 1;
    }
    return out;
};

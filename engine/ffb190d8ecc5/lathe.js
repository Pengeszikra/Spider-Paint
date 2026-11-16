// The lathe: a contour drawn on a plane is turned round an axis into a solid. Pure geometry, one closed mesh.
// The axis is a line in the plane (for the app: the bottom line of the face the contour was drawn on); the contour is a list of
// [u, r] points: u along the axis, r the distance from it (0 = on the axis). Both ends are closed: an end off the axis gets a flat disc,
// an end on the axis is a point (a tip).
import { add, scale as mul, dot } from './vec.js';
export const lathe = (contour, frame, segments = 7, { mat, color = '#c8c8c8' } = {}) => {
    if (!Number.isInteger(segments) || segments < 3)
        throw new Error('a lathe needs 3 or more segments');
    const span = Math.max(...contour.map(([, r]) => Math.abs(r)), 1e-9);
    const eps = span * 1e-6;
    // the same point twice in a row is one point
    const pts = [];
    for (const q of contour) {
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > eps)
            pts.push([q[0], q[1]]);
    }
    if (pts.length < 2)
        throw new Error('the contour needs 2 different points');
    if (pts.some(([, r]) => r < -eps))
        throw new Error('the contour must stay on one side of the axis (r >= 0)');
    const on = pts.map(([, r]) => r <= eps);
    // which way is the inside: the sign of the area between the contour and the axis
    const loop = [...pts, [pts[pts.length - 1][0], 0], [pts[0][0], 0]];
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) < eps * span)
        throw new Error('the contour and the axis enclose nothing');
    const sgn = area > 0 ? 1 : -1;
    const ang = (j) => (2 * Math.PI * j) / segments;
    const radial = (t) => add(mul(frame.up, Math.cos(t)), mul(frame.normal, Math.sin(t)));
    const positions = [];
    const ring = pts.map(([u, r], i) => {
        if (on[i]) {
            positions.push(add(frame.origin, mul(frame.right, u)));
            return [positions.length - 1];
        }
        return Array.from({ length: segments }, (_, j) => {
            positions.push(add(add(frame.origin, mul(frame.right, u)), mul(radial(ang(j)), r)));
            return positions.length - 1;
        });
    });
    const faces = [];
    const put = (v, want) => {
        // wound so that the face looks the way it should (its Newell normal agrees with `want`)
        const n = [0, 0, 0];
        for (let k = 0; k < v.length; k++) {
            const a = positions[v[k]];
            const b = positions[v[(k + 1) % v.length]];
            n[0] += (a[1] - b[1]) * (a[2] + b[2]);
            n[1] += (a[2] - b[2]) * (a[0] + b[0]);
            n[2] += (a[0] - b[0]) * (a[1] + b[1]);
        }
        faces.push({ v: dot(n, want) < 0 ? [...v].reverse() : v, color, ...(mat ? { mat } : {}) });
    };
    for (let i = 0; i + 1 < pts.length; i++) {
        if (on[i] && on[i + 1])
            continue; // a piece of the axis itself: no surface
        const du = pts[i + 1][0] - pts[i][0];
        const dr = pts[i + 1][1] - pts[i][1];
        const n2 = [sgn * dr, -sgn * du]; // outward, in the plane of the contour
        for (let j = 0; j < segments; j++) {
            const want = add(mul(frame.right, n2[0]), mul(radial(ang(j + 0.5)), n2[1]));
            const a = ring[i];
            const b = ring[i + 1];
            const j2 = (j + 1) % segments;
            if (on[i])
                put([a[0], b[j], b[j2]], want);
            else if (on[i + 1])
                put([a[j], a[j2], b[0]], want);
            else
                put([a[j], a[j2], b[j2], b[j]], want);
        }
    }
    // the two ends: a disc where the contour does not end on the axis
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (!on[0])
        put(ring[0], mul(frame.right, sgn * first[1]));
    if (!on[pts.length - 1])
        put(ring[pts.length - 1], mul(frame.right, -sgn * last[1]));
    return { positions, faces };
};

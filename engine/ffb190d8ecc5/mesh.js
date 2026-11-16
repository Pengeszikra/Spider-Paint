// Mesh = { positions: [[x, y, z], ...], faces: [{ v: [i, j, k, ...], color }] }
// Faces are CCW when seen from outside. No normals, UVs or textures yet.
import { add, len, scale, sub } from './vec.js';
/** Box: 8 points, 12 edges, 6 quad faces. Axis-aligned unless `axes` turns it. */
export const box = ({ size = [1, 1, 1], at = [0, 0, 0], color = '#c8c8c8', axes } = {}) => {
    const [hx, hy, hz] = size.map((s) => s / 2);
    // `axes` = [ex, ey, ez], an orthonormal right-handed frame (default: x, y, z)
    const [ex, ey, ez] = axes ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const at3 = (x, y, z) => add(at, add(add(scale(ex, x), scale(ey, y)), scale(ez, z)));
    const positions = [
        at3(-hx, -hy, -hz), // 0
        at3(hx, -hy, -hz), // 1
        at3(hx, hy, -hz), // 2
        at3(-hx, hy, -hz), // 3
        at3(-hx, -hy, hz), // 4
        at3(hx, -hy, hz), // 5
        at3(hx, hy, hz), // 6
        at3(-hx, hy, hz), // 7
    ];
    const faces = [
        [4, 5, 6, 7], // +z
        [1, 0, 3, 2], // -z
        [1, 2, 6, 5], // +x
        [0, 4, 7, 3], // -x
        [3, 7, 6, 2], // +y
        [0, 1, 5, 4], // -y
    ].map((v) => ({ v, color }));
    return { positions, faces };
};
/** Concatenate meshes into one, re-indexing the faces. */
export const merge = (...meshes) => {
    const positions = [];
    const faces = [];
    for (const m of meshes) {
        const offset = positions.length;
        for (const q of m.positions)
            positions.push(q); // (no spread: a big mesh would overflow the call stack)
        for (const f of m.faces)
            faces.push({ ...f, v: f.v.map((i) => i + offset) });
    }
    return { positions, faces };
};
/** Bounding box center and bounding sphere radius around that center. */
export const bounds = (mesh) => {
    if (!mesh.positions.length)
        return { center: [0, 0, 0], radius: 0 };
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of mesh.positions) {
        for (let a = 0; a < 3; a++) {
            if (p[a] < min[a])
                min[a] = p[a];
            if (p[a] > max[a])
                max[a] = p[a];
        }
    }
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    let radius = 0;
    for (const p of mesh.positions)
        radius = Math.max(radius, len(sub(p, center)));
    return { center, radius };
};
/**
 * Turntable rotation: yaw around Y first, then pitch around X (radians),
 * both around `center` (default: bounding-box center). Faces are shared.
 */
export const rotate = (mesh, { yaw = 0, pitch = 0 } = {}, center = bounds(mesh).center) => {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const positions = mesh.positions.map((p) => {
        const x = p[0] - center[0];
        const y = p[1] - center[1];
        const z = p[2] - center[2];
        const x1 = cy * x + sy * z;
        const z1 = -sy * x + cy * z;
        return [x1 + center[0], cp * y - sp * z1 + center[1], sp * y + cp * z1 + center[2]];
    });
    return { positions, faces: mesh.faces };
};
/** Face normal (not normalized) by Newell's method; points CCW => outward. */
export const faceNormal = (pts) => {
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
};
/** Mean of the face points. */
export const faceCenter = (pts) => {
    const s = pts.reduce((acc, p) => add(acc, p), [0, 0, 0]);
    return [s[0] / pts.length, s[1] / pts.length, s[2] / pts.length];
};
/**
 * Prism from a convex footprint: `polygon` is [[x, z], ...] on the ground plane (any
 * winding), it is extruded up from `y` by `height`. Faces: top, bottom, then one
 * quad per footprint edge, all CCW from outside.
 */
export const extrude = ({ polygon, height = 1, y = 0, color = '#c8c8c8' }) => {
    if (!Array.isArray(polygon) || polygon.length < 3)
        throw new Error('polygon needs at least 3 [x, z] points');
    if (!(height > 0))
        throw new Error('height must be positive');
    let pts = polygon.map((p) => [p[0], p[1]]);
    const n = pts.length;
    const turn = (a, b, c) => (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]); // y of edge cross, + is CCW from above
    let area = 0;
    for (let i = 0; i < n; i++)
        area += pts[i][1] * pts[(i + 1) % n][0] - pts[i][0] * pts[(i + 1) % n][1];
    if (Math.abs(area) < 1e-12)
        throw new Error('polygon has no area');
    if (area < 0)
        pts = pts.reverse();
    for (let i = 0; i < n; i++) {
        if (turn(pts[i], pts[(i + 1) % n], pts[(i + 2) % n]) < -1e-12)
            throw new Error('polygon must be convex');
    }
    const positions = [...pts.map(([x, z]) => [x, y, z]), ...pts.map(([x, z]) => [x, y + height, z])];
    const ring = [...Array(n).keys()];
    const faces = [
        { v: ring.map((i) => n + i), color },
        { v: [...ring].reverse(), color },
        ...ring.map((i) => ({ v: [i, (i + 1) % n, n + ((i + 1) % n), n + i], color })),
    ];
    return { positions, faces };
};

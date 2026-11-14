// Shaping an existing mesh: the topology edits a modeller does by hand.
// Both functions return a NEW mesh; faces stay CCW from outside and closed meshes stay closed.
import { add, sub, scale as mul, norm } from './vec.js';
import { faceNormal, faceCenter } from './mesh.js';
/**
 * Extrude a face: it is replaced (same index) by a copy moved `distance` along its
 * normal and scaled by `scale` about its center, and one quad per edge joins the two.
 *   distance > 0, scale 1      a prism out of the face
 *   distance > 0, scale < 1    a taper (roof, spire, frustum)
 *   distance 0,   scale < 1    an inset (a panel, a window frame)
 *   distance < 0               a dent into the solid (a niche, a door recess)
 * The new quads are appended after the existing faces; `color` recolors the cap and
 * the quads, otherwise they keep the face color.
 * Returns { mesh, cap, sides } with the index of the cap face and the new quad indices.
 */
export const extrudeFace = (mesh, index, { distance = 0, scale = 1, color } = {}) => {
    const face = mesh.faces[index];
    if (!face)
        throw new Error(`no face ${index}: this mesh has ${mesh.faces.length} faces`);
    if (!(scale > 0))
        throw new Error('scale must be positive');
    if (distance === 0 && scale === 1)
        throw new Error('nothing to do: give a distance or a scale other than 1');
    const pts = face.v.map((k) => mesh.positions[k]);
    const n = norm(faceNormal(pts));
    const c = faceCenter(pts);
    const moved = pts.map((p) => add(add(c, mul(sub(p, c), scale)), mul(n, distance)));
    const base = mesh.positions.length;
    const m = pts.length;
    const tint = color ?? face.color;
    const faces = mesh.faces.map((f, i) => (i === index ? { ...f, v: moved.map((_, j) => base + j), color: tint } : f));
    const sides = [];
    for (let i = 0; i < m; i++) {
        sides.push(faces.length);
        faces.push({ v: [face.v[i], face.v[(i + 1) % m], base + ((i + 1) % m), base + i], color: tint });
    }
    return { mesh: { positions: [...mesh.positions, ...moved], faces }, cap: index, sides };
};
/** Move the vertices at `indices` by `delta` [dx, dy, dz]. Faces keep their vertices, so faces may stop being planar: check with validate(). */
export const moveVertices = (mesh, indices, delta) => {
    const set = new Set();
    for (const i of indices) {
        if (!Number.isInteger(i) || i < 0 || i >= mesh.positions.length)
            throw new Error(`vertex ${i} does not exist: this mesh has ${mesh.positions.length} vertices`);
        set.add(i);
    }
    return { ...mesh, positions: mesh.positions.map((p, i) => (set.has(i) ? add(p, delta) : p)) };
};

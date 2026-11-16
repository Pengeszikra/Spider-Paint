// Surface sensing: what is under a screen pixel, and a marker that lies on it.
// Picking casts a real ray against the face geometry, so it is exact even where
// the painter-sorted drawing is not.
import { cross, dot, norm, plus, minus, times, scale } from './vec.js';
import { faceNormal } from './mesh.js';
import { triangulate } from './triangulate.js';
import { ray } from './camera.js';
// Parallel means relative to the triangle's own size: a star 40 ly away has 1e-10 ly edges (det ~ 1e-20), so an absolute
// epsilon would call every face of a real-scale planet parallel. det^2 < PAR^2 |e1|^2 |e2|^2 (d is a unit vector).
const PAR2 = 1e-24;
// Moller-Trumbore ray/triangle test. Distance along the ray, or null.
const hitTriangle = (o, d, a, b, c) => {
    const e1 = minus(a)(b);
    const e2 = minus(a)(c);
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (det * det <= PAR2 * dot(e1, e1) * dot(e2, e2))
        return null;
    const inv = 1 / det;
    const s = minus(a)(o);
    const u = inv * dot(s, h);
    if (u < 0 || u > 1)
        return null;
    const q = cross(s, e1);
    const v = inv * dot(d, q);
    if (v < 0 || u + v > 1)
        return null;
    const t = inv * dot(e2, q);
    return t > 0 ? t : null; // (in front of the eye at any scale)
};
/**
 * The nearest surface under panel pixel (x, y), or null.
 * { face, distance, point, normal, front, color }
 * `normal` is a unit vector facing the camera; `front` tells whether the face
 * itself faces the camera (always true while `cull` is on). Faces are assumed
 * convex and planar.
 */
export const pick = (mesh, cam, x, y, { cull = true } = {}) => {
    const { origin, dir } = ray(cam, x, y);
    let best = null;
    mesh.faces.forEach((face, i) => {
        const pts = face.v.map((k) => mesh.positions[k]);
        const outward = norm(faceNormal(pts));
        const front = dot(outward, dir) < 0;
        if (cull && !front)
            return;
        for (const [a, b, c] of triangulate(pts)) {
            const t = hitTriangle(origin, dir, pts[a], pts[b], pts[c]);
            if (t !== null && (!best || t < best.distance)) {
                best = {
                    face: i,
                    distance: t,
                    point: plus(origin)(times(t)(dir)),
                    normal: front ? outward : times(-1)(outward),
                    front,
                    color: face.color,
                };
            }
        }
    });
    return best;
};
/**
 * A target cross lying flat on the picked surface (perpendicular to its
 * normal): four arms with a gap in the middle and a ring, as 3D polylines.
 * It is aligned to the first edge of the face, so it turns with the object.
 * `radius` is the ring radius in world units.
 */
export const crosshair = (mesh, hit, radius = 0.1) => {
    const [a, b] = mesh.faces[hit.face].v;
    const t1 = norm(minus(mesh.positions[a])(mesh.positions[b]));
    const t2 = norm(cross(hit.normal, t1));
    const at = (p, q) => plus(hit.point)(plus(scale(t2, q * radius))(scale(t1, p * radius)));
    const ring = Array.from({ length: 33 }, (_, i) => {
        const angle = (i / 32) * 2 * Math.PI;
        return at(Math.cos(angle), Math.sin(angle));
    });
    return [
        [at(-1.7, 0), at(-0.4, 0)],
        [at(0.4, 0), at(1.7, 0)],
        [at(0, -1.7), at(0, -0.4)],
        [at(0, 0.4), at(0, 1.7)],
        ring,
    ];
};

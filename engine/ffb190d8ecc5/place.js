// Putting things down on surfaces.
import { cross, norm, plus, minus, times } from './vec.js';
import { box } from './mesh.js';
/**
 * A square prism standing on the picked surface: its base lies on the surface,
 * centered at the hit point, and it rises along the surface normal. Its sides
 * line up with the first edge of the face. The height is `3 * base` unless given.
 * Returns a new mesh; merge() it into the scene.
 */
export const standOn = (mesh, hit, { base = 0.15, height = 3 * base, color = '#c8c8c8' } = {}) => {
    const [a, b] = mesh.faces[hit.face].v;
    const ex = norm(minus(mesh.positions[a])(mesh.positions[b]));
    const ey = hit.normal;
    const ez = cross(ex, ey);
    const frame = { size: [base, height, base], at: plus(hit.point)(times(height / 2)(ey)), axes: [ex, ey, ez] };
    return { ...box({ ...frame, color }), frame }; // frame: what an instanced renderer needs
};

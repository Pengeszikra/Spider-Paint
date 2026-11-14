// Four named views, all looking at the mesh bounding-box center.
// front / side / top are orthographic (same scale), persp is a perspective view.
// A view can also be a custom spec: { dir, up, ortho, name? } where `dir` is the
// direction from the target towards the eye.
import { add, cross, dot, norm, scale, plus, minus, times } from './vec.js';
import { bounds } from './mesh.js';
export const VIEW_ORDER = ['front', 'side', 'top', 'persp'];
const FOV = (35 * Math.PI) / 180;
const VIEWS = {
    front: { dir: [0, 0, 1], up: [0, 1, 0], ortho: true }, // eye on +z
    side: { dir: [1, 0, 0], up: [0, 1, 0], ortho: true }, // eye on +x
    top: { dir: [0, 1, 0], up: [0, 0, -1], ortho: true }, // eye on +y, -z is screen-up
    persp: { dir: norm([1, 0.8, 1.2]), up: [0, 1, 0], ortho: false },
};
/**
 * `fit` = { center, radius, dist? } overrides the target and framing (perspective views only use `dist`). Use it when the
 * mesh moves (e.g. rotates) so the camera keeps looking at the same spot.
 */
export const makeCamera = (view, mesh, size, fit) => {
    const spec = typeof view === 'string' ? VIEWS[view] : view;
    if (!spec)
        throw new Error(`unknown view: ${view}`);
    const name = typeof view === 'string' ? view : (view.name ?? 'custom');
    const ortho = Boolean(spec.ortho);
    const { center, radius } = fit ?? bounds(mesh);
    const r0 = radius || 1;
    const dist = ortho ? r0 * 4 : (fit?.dist ?? (r0 * 1.25) / Math.sin(FOV / 2));
    const fov = fit?.fov ?? FOV; // fit.dist: eye distance override (a first-person eye sits almost on the center)
    const eye = plus(center)(times(dist)(norm(spec.dir)));
    const f = norm(minus(eye)(center)); // forward
    const r = norm(cross(f, spec.up)); // right
    const u = cross(r, f); // up
    const k = ortho ? ((size / 2) * 0.8) / r0 : size / 2 / Math.tan(fov / 2);
    return { name, eye, f, r, u, ortho, k, size };
};
/**
 * Turntable rotation as a camera: the view you get from rotate(mesh, { yaw, pitch })
 * with a fixed camera, but the mesh stays where it is. Picks and marks are then
 * in object space.
 */
export const orbit = ({ yaw = 0, pitch = 0, roll = 0, ortho = false, name = 'orbit' } = {}) => {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const dir = [-sy * cp, sp, cy * cp];
    const up = [sy * sp, cp, -cy * sp];
    if (!roll)
        return { name, ortho, dir, up };
    // roll: the up vector turns round the view axis towards the right (positive: the camera banks right, the picture turns left)
    const right = cross(scale(dir, -1), up);
    const c = Math.cos(roll), s = Math.sin(roll);
    return { name, ortho, dir, up: [up[0] * c + right[0] * s, up[1] * c + right[1] * s, up[2] * c + right[2] * s] };
};
/** Ray through panel pixel (x, y), the inverse of project(): { origin, dir } in world space, dir is a unit vector. */
export const ray = (cam, x, y) => {
    const nx = (x - cam.size / 2) / cam.k;
    const ny = -(y - cam.size / 2) / cam.k;
    const lateral = plus(scale(cam.u, ny))(scale(cam.r, nx));
    return cam.ortho
        ? { origin: add(cam.eye, lateral), dir: cam.f }
        : { origin: cam.eye, dir: norm(plus(lateral)(cam.f)) };
};
/** World point -> { x, y } in panel pixels (y down) and depth along the view direction. */
export const project = (cam, p) => {
    const d = minus(cam.eye)(p);
    const cx = dot(d, cam.r);
    const cy = dot(d, cam.u);
    const depth = dot(d, cam.f);
    const w = cam.ortho ? 1 : depth;
    return {
        x: cam.size / 2 + (cx / w) * cam.k,
        y: cam.size / 2 - (cy / w) * cam.k,
        depth,
    };
};

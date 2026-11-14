// Model checks an AI can read as text: is the mesh closed, are the faces CCW from
// outside, planar and convex (picking and the painter assume that).
import { sub, dot, cross, len, norm } from './vec.js';
import { faceNormal, bounds } from './mesh.js';
/**
 * { vertices, faces, closed, openEdges, volume, inside_out, degenerateFaces,
 *   nonPlanarFaces, nonConvexFaces, ok, notes }
 * `volume` and `inside_out` only mean something for a closed mesh.
 */
export const validate = (mesh) => {
    const { positions, faces } = mesh;
    const size = bounds(mesh).radius || 1;
    const degenerate = [];
    const nonPlanar = [];
    const nonConvex = [];
    const directed = new Map();
    let volume = 0;
    faces.forEach((face, i) => {
        const pts = face.v.map((k) => positions[k]);
        const m = pts.length;
        const n = faceNormal(pts);
        const area2 = len(n);
        if (area2 < 1e-12 * size * size) {
            degenerate.push(i);
            return;
        }
        const unit = norm(n);
        if (Math.max(...pts.map((p) => Math.abs(dot(sub(p, pts[0]), unit)))) > 1e-6 * size)
            nonPlanar.push(i);
        for (let j = 0; j < m; j++) {
            const a = pts[j];
            const b = pts[(j + 1) % m];
            const c = pts[(j + 2) % m];
            if (dot(cross(sub(b, a), sub(c, b)), unit) < -1e-9 * size * size) {
                nonConvex.push(i);
                break;
            }
        }
        for (let j = 0; j < m; j++) {
            const key = `${face.v[j]},${face.v[(j + 1) % m]}`;
            directed.set(key, (directed.get(key) ?? 0) + 1);
        }
        for (let j = 1; j < m - 1; j++)
            volume += dot(pts[0], cross(pts[j], pts[j + 1])) / 6;
    });
    let open = 0;
    let repeated = 0;
    for (const [key, count] of directed) {
        const [a, b] = key.split(',');
        if (count > 1)
            repeated += 1;
        if (!directed.has(`${b},${a}`))
            open += 1;
    }
    const closed = faces.length > 0 && open === 0 && repeated === 0;
    const insideOut = closed && volume < 0;
    const notes = [];
    if (degenerate.length)
        notes.push(`degenerate faces (no area): ${degenerate.join(', ')}`);
    if (nonPlanar.length)
        notes.push(`non-planar faces: ${nonPlanar.join(', ')}`);
    if (nonConvex.length)
        notes.push(`non-convex faces (picking and painting assume convex): ${nonConvex.join(', ')}`);
    if (repeated)
        notes.push(`${repeated} edge(s) are used twice in the same direction: faces are wound inconsistently`);
    if (open)
        notes.push(`${open} open edge(s): the mesh is not closed (fine for a surface, e.g. a missing bottom)`);
    if (insideOut)
        notes.push('the faces point inward: reverse the vertex order of every face');
    return {
        vertices: positions.length,
        faces: faces.length,
        closed,
        openEdges: open,
        volume: closed ? Math.round(volume * 1e9) / 1e9 : null,
        inside_out: insideOut,
        degenerateFaces: degenerate,
        nonPlanarFaces: nonPlanar,
        nonConvexFaces: nonConvex,
        ok: !degenerate.length && !nonPlanar.length && !nonConvex.length && !repeated && !insideOut,
        notes,
    };
};

// Text as a model: a minimalist, blocky stroke font drawn on a 2 x 4 grid, every stroke a straight wooden wedge-simple bar.
// The stroke is 20 % of the letter height (and so is the depth the letters stand out from the face).
// Glyphs are data: lists of poly-lines; a poly-line of one point is a dot. Unknown characters are skipped, lower case is upper case.
import { add, cross, dot, norm, scale, sub } from './vec.js';
import { box, faceNormal, merge } from './mesh.js';
import { health, union } from './csg.js';
const G = (...lines) => lines;
const O_ = [[0, 0], [0, 4], [2, 4], [2, 0], [0, 0]];
/** The font: x 0..2, y 0..4 (the centre line of the strokes); accents rise above 4. */
export const GLYPHS = {
    A: G([[0, 0], [0, 4], [2, 4], [2, 0]], [[0, 2], [2, 2]]),
    B: G(O_, [[0, 2], [2, 2]]),
    C: G([[2, 4], [0, 4], [0, 0], [2, 0]]),
    D: G([[0, 0], [0, 4], [1, 4], [2, 3], [2, 1], [1, 0], [0, 0]]),
    E: G([[2, 4], [0, 4], [0, 0], [2, 0]], [[0, 2], [1.5, 2]]),
    F: G([[2, 4], [0, 4], [0, 0]], [[0, 2], [1.5, 2]]),
    G: G([[2, 4], [0, 4], [0, 0], [2, 0], [2, 2], [1, 2]]),
    H: G([[0, 0], [0, 4]], [[2, 0], [2, 4]], [[0, 2], [2, 2]]),
    I: G([[0, 4], [2, 4]], [[1, 4], [1, 0]], [[0, 0], [2, 0]]),
    J: G([[2, 4], [2, 0], [0, 0], [0, 1]]),
    K: G([[0, 0], [0, 4]], [[2, 4], [0, 2], [2, 0]]),
    L: G([[0, 4], [0, 0], [2, 0]]),
    M: G([[0, 0], [0, 4], [1, 2], [2, 4], [2, 0]]),
    N: G([[0, 0], [0, 4], [2, 0], [2, 4]]),
    O: G(O_),
    P: G([[0, 0], [0, 4], [2, 4], [2, 2], [0, 2]]),
    Q: G(O_, [[1, 1], [2, 0]]),
    R: G([[0, 0], [0, 4], [2, 4], [2, 2], [0, 2]], [[1, 2], [2, 0]]),
    S: G([[2, 4], [0, 4], [0, 2], [2, 2], [2, 0], [0, 0]]),
    T: G([[0, 4], [2, 4]], [[1, 4], [1, 0]]),
    U: G([[0, 4], [0, 0], [2, 0], [2, 4]]),
    V: G([[0, 4], [1, 0], [2, 4]]),
    W: G([[0, 4], [0.5, 0], [1, 2], [1.5, 0], [2, 4]]),
    X: G([[0, 4], [2, 0]], [[0, 0], [2, 4]]),
    Y: G([[0, 4], [1, 2], [2, 4]], [[1, 2], [1, 0]]),
    Z: G([[0, 4], [2, 4], [0, 0], [2, 0]]),
    '0': G(O_, [[0, 0], [2, 4]]),
    '1': G([[0, 3], [1, 4], [1, 0]]),
    '2': G([[0, 4], [2, 4], [2, 2], [0, 2], [0, 0], [2, 0]]),
    '3': G([[0, 4], [2, 4], [2, 0], [0, 0]], [[0, 2], [2, 2]]),
    '4': G([[0, 4], [0, 2], [2, 2]], [[2, 4], [2, 0]]),
    '5': G([[2, 4], [0, 4], [0, 2], [2, 2], [2, 0], [0, 0]]),
    '6': G([[2, 4], [0, 4], [0, 0], [2, 0], [2, 2], [0, 2]]),
    '7': G([[0, 4], [2, 4], [0, 0]]),
    '8': G(O_, [[0, 2], [2, 2]]),
    '9': G([[2, 2], [0, 2], [0, 4], [2, 4], [2, 0], [0, 0]]),
    '.': G([[1, 0]]),
    ',': G([[1, 0], [0.5, -1]]),
    ':': G([[1, 0]], [[1, 2.5]]),
    '!': G([[1, 4], [1, 1.5]], [[1, 0]]),
    '?': G([[0, 4], [2, 4], [2, 2], [1, 2], [1, 1]], [[1, 0]]),
    '-': G([[0, 2], [2, 2]]),
    _: G([[0, 0], [2, 0]]),
    '+': G([[0, 2], [2, 2]], [[1, 3], [1, 1]]),
    '/': G([[0, 0], [2, 4]]),
    "'": G([[1, 4], [1, 3]]),
    ' ': [],
};
// Hungarian (and other) accents: a letter plus a mark above it
const ACUTE = G([[0.7, 5.4], [1.3, 6.4]]);
const DOUBLE = G([[0, 5.4], [0.6, 6.4]], [[1.4, 5.4], [2, 6.4]]);
const DOTS = G([[0, 5.6]], [[2, 5.6]]);
const ACCENTS = {
    Á: ['A', ACUTE], É: ['E', ACUTE], Í: ['I', ACUTE], Ó: ['O', ACUTE], Ú: ['U', ACUTE],
    Ö: ['O', DOTS], Ü: ['U', DOTS], Ő: ['O', DOUBLE], Ű: ['U', DOUBLE],
};
/** Grid units: the centre line is 4 high, the stroke 1: the letter is 5 high, so the stroke is 20 % of it. */
export const STROKE = 0.2;
const CELL_H = 5;
const ADVANCE = 4; // 3 wide letter + 1 gap
const SPACE = 3;
/** The frame of a face: it starts in the lower left corner (up = world up on the face; on a floor or ceiling: away from the viewer), and its height is the face's height. */
export const faceFrame = (mesh, face) => {
    const f = mesh.faces[face];
    const n = norm(faceNormal(f.v.map((i) => mesh.positions[i])));
    let up = sub([0, 1, 0], scale(n, dot([0, 1, 0], n)));
    if (Math.hypot(...up) < 1e-3)
        up = sub([0, 0, -1], scale(n, dot([0, 0, -1], n)));
    up = norm(up);
    const right = norm(cross(up, n));
    let lo = Infinity, hi = -Infinity, left = Infinity;
    for (const i of f.v) {
        const p = mesh.positions[i];
        const u = dot(p, up);
        lo = Math.min(lo, u);
        hi = Math.max(hi, u);
        left = Math.min(left, dot(p, right));
    }
    const p0 = mesh.positions[f.v[0]];
    // the point of the face plane with the lowest up and the lowest right
    const origin = add(add(scale(right, left), scale(up, lo)), scale(n, dot(p0, n)));
    return { origin, right, up, normal: n, height: Math.max(1e-6, hi - lo) };
};
const strokesOf = (ch) => {
    const up = ch.toUpperCase();
    const acc = ACCENTS[up];
    if (acc)
        return [{ at: 0, lines: GLYPHS[acc[0]] }, { at: 0, lines: acc[1] }];
    const g = GLYPHS[up];
    return g ? [{ at: 0, lines: g }] : [];
};
/**
 * Faces that lie in one plane and touch along an edge become one face (the boolean cuts the big sides into pieces; a letter wants
 * plain sides). Only when the result stays convex and the two have the same material. `edge(u, v)`, when given, must accept every
 * shared edge of a pair (the viewer's mirror joins only along its plane).
 */
export const mergeFlat = (mesh, { edge } = {}) => {
    const P = mesh.positions;
    let faces = mesh.faces.map((f) => ({ ...f, n: norm(faceNormal(f.v.map((i) => P[i]))) }));
    const tryMerge = (a, b) => {
        if (a.mat !== b.mat || a.color !== b.color || dot(a.n, b.n) < 1 - 1e-9)
            return null;
        const bAt = new Map();
        b.v.forEach((v, i) => bAt.set(`${v},${b.v[(i + 1) % b.v.length]}`, i));
        let shared = 0;
        let start = -1;
        a.v.forEach((u, i) => {
            const w = a.v[(i + 1) % a.v.length];
            if (bAt.has(`${w},${u}`)) {
                shared++;
                start = i;
                if (edge && !edge(u, w))
                    shared = -Infinity;
            }
        });
        if (!(shared > 0))
            return null;
        // the shared edge u -> v of a (v -> u in b): a from v round to u, then b from u round to v
        const u = a.v[start];
        const v = a.v[(start + 1) % a.v.length];
        const ai = (start + 1) % a.v.length;
        const A = a.v.map((_, k) => a.v[(ai + k) % a.v.length]); // v ... u
        const bi = bAt.get(`${v},${u}`) + 1; // u in b
        const B = b.v.map((_, k) => b.v[(bi + k) % b.v.length]); // u ... v
        const out = [...A, ...B.slice(1, -1)];
        // spikes: a vertex between two copies of the same neighbour (several shared edges in a row)
        for (let again = true; again && out.length > 2;) {
            again = false;
            for (let i = 0; i < out.length; i++) {
                if (out[(i + out.length - 1) % out.length] === out[(i + 1) % out.length]) {
                    out.splice(i, 1);
                    out.splice(i % out.length, 1);
                    again = true;
                    break;
                }
            }
        }
        if (out.length !== a.v.length + b.v.length - 2 * shared || new Set(out).size !== out.length)
            return null;
        // the engine's faces are convex (picking and painting assume it): a merge that would bend a face is not made
        for (let i = 0; i < out.length; i++) {
            const p0 = P[out[i]];
            const p1 = P[out[(i + 1) % out.length]];
            const p2 = P[out[(i + 2) % out.length]];
            if (dot(cross(sub(p1, p0), sub(p2, p1)), a.n) < -1e-9)
                return null;
        }
        return out;
    };
    for (let again = true; again;) {
        again = false;
        outer: for (let i = 0; i < faces.length; i++) {
            for (let j = i + 1; j < faces.length; j++) {
                const m = tryMerge(faces[i], faces[j]);
                if (!m)
                    continue;
                faces = faces.filter((_, k) => k !== j);
                faces[i] = { ...faces[i], v: m };
                again = true;
                break outer;
            }
        }
    }
    return { positions: P, faces: faces.map(({ n: _n, ...f }) => f) };
};
/** The bars of one letter fused into plain closed solids (no bar showing through another); if the fusing fails, the loose bars. */
const solid = (bars) => {
    if (bars.length < 2)
        return merge(...bars);
    try {
        let m = bars[0];
        for (const b of bars.slice(1))
            m = union(m, b);
        const h = health(m);
        if (h.allSolid && h.skippedFaces === 0)
            return mergeFlat(m);
    }
    catch {
        /* fall through */
    }
    return merge(...bars);
};
/** The text as one mesh: every stroke a bar of stroke × stroke section standing out of the face by the stroke width. */
export const textMesh = (text, frame, { mat, color = '#c8c8c8' } = {}) => {
    const s = frame.height / CELL_H; // world units per grid unit
    const letters = [];
    let x = 0;
    const half = 0.5; // the outer edge of the letter starts half a stroke before the centre line
    for (const ch of text) {
        if (ch === ' ') {
            x += SPACE;
            continue;
        }
        const bars = [];
        for (const part of strokesOf(ch)) {
            for (const line of part.lines) {
                const pts = line.length === 1 ? [line[0], line[0]] : line;
                for (let i = 0; i + 1 < pts.length; i++) {
                    const [ax, ay] = pts[i];
                    const [bx, by] = pts[i + 1];
                    const dx = bx - ax;
                    const dy = by - ay;
                    const len = Math.hypot(dx, dy);
                    const dir = len ? add(scale(frame.right, dx / len), scale(frame.up, dy / len)) : frame.right;
                    const ez = frame.normal;
                    const ey = cross(ez, dir);
                    const cx = x + half + (ax + bx) / 2;
                    const cy = half + (ay + by) / 2;
                    const at = add(add(add(frame.origin, scale(frame.right, cx * s)), scale(frame.up, cy * s)), scale(ez, (1 * s) / 2));
                    const bar = box({ size: [(len + 1) * s, s, s], at, axes: [dir, ey, ez], color });
                    if (mat)
                        bar.faces.forEach((f) => (f.mat = mat));
                    bars.push(bar);
                }
            }
        }
        letters.push(solid(bars));
        x += ADVANCE;
    }
    return merge(...letters);
};

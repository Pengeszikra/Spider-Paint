// Characters: a stylized low-poly figure made from a few numbers, for many quick, animatable extras.
//
// A character is a spec (`CharacterSpec`, versioned, plain JSON): a base figure (female or male), body sliders (height,
// build, shoulders, head), a face (shape, jaw, nose, skin), hair, glasses, beard, an outfit and one prop. buildCharacter()
// turns it into a few meshes with stable ids and a rig with the humanoid joints (rig.ts: HUMANOID_JOINTS), so posed(),
// walkPose() and HUMANOID_POSES move it like any figure. The same spec always gives the same figure.
//
// The look: about six heads tall, a big round head, a slim neck, long legs, hands a little large; the female base an
// hourglass (hips as wide as the shoulders, a narrow waist, a soft bust), the male a V (wide shoulders and chest,
// narrow hips). The meshes are lofts of rings with the loops a modeller would put there (extra loops at the knees and
// elbows, the trunk 12 round, the limbs 8), so they bend cleanly; smooth shading is meant (the renderers' `smooth`).
// `body` is ONE closed surface (trunk, neck, both legs and feet, branching at the crotch), `arms` both arms with their
// hands, `head` the head, `face` the eyes, brows, mouth, nose and ears as thin plates lying just over the skin (like a
// face drawn on with 5 + V in the viewer), `hair` flat locks (thin ribbons) and a cap, with the beard, `gear` what is
// worn on top (glasses, a coat's skirt, straps, a belt, an astronaut's helmet and pack), `prop` the thing in the right hand.
// The body and the arms bend smoothly: a point near a joint is shared by the bones on both sides of it (blended weights).
//
// There are no colours in a spec: every face names a palette material (`face.mat`, the engine's material model; its
// colour is only the fallback). CHARACTER_MATERIALS lists the ones a character uses, the spec picks skin, hair and cloth
// by material name, so a palette edit restyles every character made of it, and any palette entry can be chosen.
// Clothes are the body's own faces in cloth materials (a sleeve is the arm's surface, so it can never come off), plus a
// little gear for the shapes cloth adds (a coat's skirt, straps, a belt, a helmet).
//
// Y is up, the figure stands on y = 0 and looks to +z, its left is +x (as rig.ts expects).
import { add, sub, scale, dot, cross, norm } from './vec.js';
import { HUMANOID_JOINTS } from './rig.js';
export const CHARACTER_VERSION = 3;
/** The materials characters are made of (palette entries: add the missing ones to a palette). */
export const CHARACTER_MATERIALS = {
    'skin-1': { color: '#f4d6c0', rough: 0.6, soft: 0.7 },
    'skin-2': { color: '#e9bd9c', rough: 0.6, soft: 0.7 },
    'skin-3': { color: '#d8a680', rough: 0.6, soft: 0.7 },
    'skin-4': { color: '#c28c63', rough: 0.6, soft: 0.7 },
    'skin-5': { color: '#a16f49', rough: 0.6, soft: 0.7 },
    'skin-6': { color: '#805337', rough: 0.6, soft: 0.7 },
    'skin-7': { color: '#5f3b26', rough: 0.6, soft: 0.7 },
    'hair-black': { color: '#1f1b1a', rough: 0.5, soft: 0.2 },
    'hair-brown': { color: '#4a3020', rough: 0.5, soft: 0.2 },
    'hair-chestnut': { color: '#7a4b2a', rough: 0.5, soft: 0.2 },
    'hair-auburn': { color: '#9a4426', rough: 0.5, soft: 0.2 },
    'hair-blond': { color: '#cfa868', rough: 0.5, soft: 0.2 },
    'hair-grey': { color: '#9c9a96', rough: 0.5, soft: 0.2 },
    'hair-white': { color: '#e2e0da', rough: 0.5, soft: 0.2 },
    'lab-white': { color: '#ecebe5', rough: 0.85, soft: 0.2 },
    'shirt-white': { color: '#dcdad2', rough: 0.9, soft: 0.2 },
    'crew-beige': { color: '#d9cdb2', rough: 0.9, soft: 0.2 },
    'denim': { color: '#3f5a86', rough: 0.95, soft: 0.1 },
    'navy': { color: '#2a3550', rough: 0.9, soft: 0.1 },
    'olive': { color: '#5f6e46', rough: 0.95, soft: 0.1 },
    'khaki': { color: '#a89a72', rough: 0.95, soft: 0.1 },
    'brown-canvas': { color: '#6b4e33', rough: 0.95, soft: 0.1 },
    'charcoal': { color: '#34363b', rough: 0.9, soft: 0.1 },
    'rust': { color: '#b4552f', rough: 0.9, soft: 0.1 },
    'mustard': { color: '#d0a63a', rough: 0.9, soft: 0.1 },
    'teal': { color: '#2f7a7c', rough: 0.9, soft: 0.1 },
    'plum': { color: '#6a3a63', rough: 0.9, soft: 0.1 },
    'suit-white': { color: '#e8e8e4', rough: 0.75, soft: 0.1 },
    'suit-grey': { color: '#8d9096', rough: 0.7 },
    'suit-orange': { color: '#d8692c', rough: 0.8, soft: 0.1 },
    'leather': { color: '#3a2a1e', rough: 0.6 },
    'rubber': { color: '#26272a', rough: 0.85 },
    'eye': { color: '#1a1512', rough: 0.15 },
    'eye-white': { color: '#f4f1ea', rough: 0.3 },
    'mouth': { color: '#8a4a42', rough: 0.6, soft: 0.4 },
    'lens': { color: '#cfe6f0', metal: 0.2, rough: 0.05, alpha: 0.3 },
    'frame': { color: '#1a1a1c', rough: 0.4 },
    'visor': { color: '#d9a640', metal: 0.9, rough: 0.12, alpha: 0.55 },
    'screen': { color: '#5fc8e8', rough: 0.3, emit: 0.8 },
    'plastic': { color: '#2b2d33', rough: 0.45 },
    'steel': { color: '#9aa7b4', metal: 1, rough: 0.3 },
    'brass': { color: '#c9a24a', metal: 1, rough: 0.3 },
};
const MATS = CHARACTER_MATERIALS;
/** The material choices offered for skin, hair and cloth (any palette name works too). */
export const CHARACTER_SKINS = Object.keys(MATS).filter((n) => n.startsWith('skin-'));
export const CHARACTER_HAIRS = Object.keys(MATS).filter((n) => n.startsWith('hair-'));
export const CHARACTER_CLOTHS = ['lab-white', 'shirt-white', 'crew-beige', 'denim', 'navy', 'olive', 'khaki', 'brown-canvas', 'charcoal', 'rust', 'mustard', 'teal', 'plum', 'suit-white', 'suit-grey', 'suit-orange', 'leather'];
/** The palette entries characters use, as { name, ...material } (the form a scene file's `palette` has). */
export const characterPalette = () => Object.entries(MATS).map(([name, m]) => ({ name, metal: 0, rough: 0.7, alpha: 1, emit: 0, ...m }));
/** The slider ranges in which the poses and the clothes still fit. */
export const CHARACTER_RANGES = {
    height: [1.45, 2.05], build: [-1, 1], shoulders: [-1, 1], head: [0.85, 1.4], jaw: [-1, 1], nose: [-1, 1],
};
export const FACE_SHAPES = ['oval', 'round', 'square', 'long'];
export const HAIR_STYLES = ['short', 'long', 'bun', 'bald'];
export const BEARD_STYLES = ['none', 'full', 'goatee'];
export const OUTFITS = ['coat', 'overall', 'workwear', 'crew', 'astronaut'];
export const PROPS = ['none', 'tablet', 'wrench', 'commlock'];
/** the parts, in the order buildCharacter() returns them (missing ones are left out) */
export const CHARACTER_PARTS = ['body', 'arms', 'head', 'face', 'hair', 'gear', 'prop'];
export const CHARACTER_PRESETS = {
    scientist: {
        version: 3, role: 'scientist', base: 'male', seed: 11,
        body: { height: 1.76, build: -0.3, shoulders: -0.2, head: 1 },
        face: { shape: 'long', jaw: -0.2, nose: 0.2, skin: 'skin-2' },
        hair: { style: 'short', mat: 'hair-brown' }, glasses: true, beard: 'none',
        outfit: { kind: 'coat', main: 'lab-white', second: 'charcoal', helmet: true }, prop: 'tablet',
    },
    mechanic: {
        version: 3, role: 'mechanic', base: 'female', seed: 23,
        body: { height: 1.64, build: 0.1, shoulders: 0, head: 1 },
        face: { shape: 'round', jaw: 0, nose: 0, skin: 'skin-4' },
        hair: { style: 'bun', mat: 'hair-black' }, glasses: false, beard: 'none',
        outfit: { kind: 'overall', main: 'denim', second: 'shirt-white', helmet: true }, prop: 'wrench',
    },
    crew: {
        version: 3, role: 'crew', base: 'female', seed: 37,
        body: { height: 1.7, build: -0.2, shoulders: 0, head: 1 },
        face: { shape: 'oval', jaw: -0.3, nose: -0.2, skin: 'skin-1' },
        hair: { style: 'long', mat: 'hair-chestnut' }, glasses: false, beard: 'none',
        outfit: { kind: 'crew', main: 'crew-beige', second: 'rust', helmet: true }, prop: 'commlock',
    },
    astronaut: {
        version: 3, role: 'astronaut', base: 'male', seed: 51,
        body: { height: 1.8, build: 0.1, shoulders: 0.3, head: 1 },
        face: { shape: 'square', jaw: 0.3, nose: 0, skin: 'skin-3' },
        hair: { style: 'short', mat: 'hair-black' }, glasses: false, beard: 'none',
        outfit: { kind: 'astronaut', main: 'suit-white', second: 'suit-grey', helmet: true }, prop: 'none',
    },
};
const clamp = (v, [lo, hi], d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** A material name; an old spec's #rrggbb colour becomes the nearest material of the group. */
const matName = (v, group, d) => {
    if (typeof v !== 'string')
        return d;
    if (/^#[0-9a-f]{6}$/i.test(v)) {
        const c = rgb(v);
        let best = d, far = Infinity;
        for (const n of group) {
            const e = rgb(MATS[n].color).reduce((s, x, i) => s + (x - c[i]) ** 2, 0);
            if (e < far)
                ((far = e), (best = n));
        }
        return best;
    }
    return /^[\w .+-]{1,48}$/.test(v) ? v : d;
};
/** A complete, valid spec from anything (missing or bad fields take the defaults; values are clamped; older specs are brought up: colours become materials, curly hair long, a tomato nothing). */
export const normalizeCharacter = (s = {}) => {
    const R = CHARACTER_RANGES;
    const base = s.base === 'male' ? 'male' : 'female';
    const kind = pick(s.outfit?.kind, OUTFITS, 'crew');
    return {
        version: CHARACTER_VERSION,
        ...(typeof s.role === 'string' ? { role: s.role } : {}),
        base,
        body: { height: clamp(s.body?.height, R.height, base === 'male' ? 1.78 : 1.66), build: clamp(s.body?.build, R.build, 0), shoulders: clamp(s.body?.shoulders, R.shoulders, 0), head: clamp(s.body?.head, R.head, 1) },
        face: { shape: pick(s.face?.shape, FACE_SHAPES, 'oval'), jaw: clamp(s.face?.jaw, R.jaw, 0), nose: clamp(s.face?.nose, R.nose, 0), skin: matName(s.face?.skin, CHARACTER_SKINS, 'skin-2') },
        hair: { style: s.hair?.style === 'curly' ? 'long' : pick(s.hair?.style, HAIR_STYLES, 'short'), mat: matName(s.hair?.mat ?? s.hair?.color, CHARACTER_HAIRS, 'hair-brown') },
        glasses: Boolean(s.glasses),
        beard: pick(s.beard, BEARD_STYLES, 'none'),
        outfit: {
            kind,
            main: matName(s.outfit?.main ?? s.outfit?.color, CHARACTER_CLOTHS, kind === 'astronaut' ? 'suit-white' : kind === 'coat' ? 'lab-white' : kind === 'crew' ? 'crew-beige' : 'olive'),
            second: matName(s.outfit?.second ?? s.outfit?.color2, CHARACTER_CLOTHS, kind === 'astronaut' ? 'suit-grey' : kind === 'crew' ? 'mustard' : 'charcoal'),
            helmet: s.outfit?.helmet !== false,
        },
        prop: pick(s.prop, PROPS, 'none'),
        seed: Number.isInteger(s.seed) ? s.seed : 1,
    };
};
// a small seeded random (mulberry32)
const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
/**
 * Another person in the same role: a different face, hair, build, skin and hair materials (from `seed`); the outfit's
 * kind and the prop stay, and so does the main cloth of a uniform (a crew tunic, a lab coat, a suit; a crew member's
 * sleeve, the department, may change).
 */
export const variateCharacter = (spec, seed) => {
    const s = normalizeCharacter(spec);
    const r = rng(seed * 2654435761);
    const any = (l) => l[Math.floor(r() * l.length)];
    const span = (lo, hi) => lo + r() * (hi - lo);
    const base = r() < 0.5 ? 'female' : 'male';
    const R = CHARACTER_RANGES;
    const uniform = s.outfit.kind === 'coat' || s.outfit.kind === 'astronaut' || s.outfit.kind === 'crew';
    const keepMain = uniform || r() < 0.5;
    const work = CHARACTER_CLOTHS.filter((c) => !c.startsWith('suit') && c !== 'lab-white' && c !== 'crew-beige');
    const dept = ['mustard', 'rust', 'plum', 'teal', 'charcoal', 'shirt-white', 'olive'];
    return normalizeCharacter({
        ...s,
        base,
        seed,
        body: { height: span(base === 'male' ? 1.66 : 1.56, base === 'male' ? 1.94 : 1.8), build: span(-0.9, 1), shoulders: span(-0.7, 0.8), head: span(0.95, 1.12) },
        face: { shape: any(FACE_SHAPES), jaw: span(R.jaw[0], R.jaw[1]) * 0.55 + (base === 'male' ? 0.3 : -0.2), nose: span(-0.8, 0.9), skin: any(CHARACTER_SKINS) },
        hair: { style: any(base === 'male' ? ['short', 'short', 'bald', 'long'] : ['short', 'long', 'long', 'bun']), mat: any(CHARACTER_HAIRS) },
        glasses: r() < 0.3,
        beard: base === 'male' ? any(BEARD_STYLES) : 'none',
        outfit: { ...s.outfit, main: keepMain ? s.outfit.main : any(work), second: s.outfit.kind === 'crew' ? any(dept) : s.outfit.kind === 'astronaut' || r() < 0.5 ? s.outfit.second : any(work) },
    });
};
// ---------- the mesh builder ----------
// Points with their weights and faces with their materials. Faces may be built in any winding: finish() makes every
// closed piece wind one way, outwards.
class Build {
    P = [];
    W = [];
    F = [];
    pt(p, w) {
        this.P.push(p);
        this.W.push(w);
        return this.P.length - 1;
    }
    ring(pts, w) {
        return pts.map((p, k) => this.pt(p, typeof w === 'function' ? w(p, k) : w));
    }
    tri(a, b, c, mat) {
        this.F.push({ v: [a, b, c], mat });
    }
    /** triangles between two rings of the same length (wrap: the last point joins the first) */
    band(A, B, mat, wrap = true) {
        const n = A.length;
        for (let k = 0; k < (wrap ? n : n - 1); k++) {
            const k1 = (k + 1) % n;
            const m = typeof mat === 'string' ? mat : mat(k);
            this.tri(A[k], A[k1], B[k1], m);
            this.tri(A[k], B[k1], B[k], m);
        }
    }
    fan(A, apex, mat) {
        for (let k = 0; k < A.length; k++)
            this.tri(A[k], A[(k + 1) % A.length], apex, mat);
    }
    /** a rigid closed shell on one weight set: points and polygon faces (planar ones only: a rigid piece stays planar) */
    shell(pts, faces, mat, w) {
        const o = this.P.length;
        for (const p of pts)
            this.pt(p, w);
        faces.forEach((f, i) => this.F.push({ v: f.map((k) => k + o), mat: typeof mat === 'string' ? mat : mat(i) }));
    }
    /** a thin flat plate: a planar polygon `poly` (in order round), `thick` behind it along -n; both faces n-gons, the rim quads */
    plate(poly, n, thick, mat, w) {
        const back = poly.map((p) => sub(p, scale(n, thick)));
        const k = poly.length;
        const faces = [poly.map((_, i) => i), back.map((_, i) => k + i)];
        for (let i = 0; i < k; i++)
            faces.push([i, (i + 1) % k, k + ((i + 1) % k), k + i]);
        this.shell([...poly, ...back], faces, mat, w);
    }
    /**
     * a thin ribbon (a lock of hair): rows of [left, right] points along it, `thick` towards -n of each row; the front and the
     * back are triangle strips, the rim closes it. Rows may be any width (a pointed end is a row of two near points).
     */
    ribbon(rows, thick, mat, w) {
        const n = rows.length;
        const normals = rows.map(([l, r], i) => {
            const along = sub(rows[Math.min(n - 1, i + 1)][0], rows[Math.max(0, i - 1)][0]);
            const nn = norm(cross(sub(r, l), along));
            return nn;
        });
        const front = rows.map(([l, r]) => [this.pt(l, w), this.pt(r, w)]);
        const back = rows.map(([l, r], i) => [this.pt(sub(l, scale(normals[i], thick)), w), this.pt(sub(r, scale(normals[i], thick)), w)]);
        for (let i = 0; i < n - 1; i++) {
            const [a, b] = front[i], [c, d] = front[i + 1];
            this.tri(a, b, d, mat);
            this.tri(a, d, c, mat);
            const [e, f] = back[i], [g, h] = back[i + 1];
            this.tri(e, h, f, mat);
            this.tri(e, g, h, mat);
            // the two sides
            this.tri(a, c, g, mat);
            this.tri(a, g, e, mat);
            this.tri(b, h, d, mat);
            this.tri(b, f, h, mat);
        }
        // the ends
        const [a0, b0] = front[0], [e0, f0] = back[0];
        this.tri(a0, e0, f0, mat);
        this.tri(a0, f0, b0, mat);
        const [a1, b1] = front[n - 1], [e1, f1] = back[n - 1];
        this.tri(a1, b1, f1, mat);
        this.tri(a1, f1, e1, mat);
    }
    /** one winding for every connected piece, outwards (by its signed volume) */
    finish(color) {
        const { P, F } = this;
        const edges = new Map();
        const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
        F.forEach((f, i) => f.v.forEach((a, j) => {
            const k = key(a, f.v[(j + 1) % f.v.length]);
            const l = edges.get(k);
            if (l)
                l.push(i);
            else
                edges.set(k, [i]);
        }));
        const has = (v, a, b) => v.some((x, j) => x === a && v[(j + 1) % v.length] === b);
        const done = new Uint8Array(F.length);
        for (let s = 0; s < F.length; s++) {
            if (done[s])
                continue;
            done[s] = 1;
            const stack = [s], comp = [];
            while (stack.length) {
                const f = stack.pop();
                comp.push(f);
                const v = F[f].v;
                for (let j = 0; j < v.length; j++) {
                    const a = v[j], b = v[(j + 1) % v.length];
                    for (const g of edges.get(key(a, b))) {
                        if (done[g])
                            continue;
                        if (has(F[g].v, a, b))
                            F[g].v.reverse();
                        done[g] = 1;
                        stack.push(g);
                    }
                }
            }
            let vol = 0;
            for (const f of comp) {
                const q = F[f].v.map((i) => P[i]);
                for (let j = 1; j < q.length - 1; j++)
                    vol += dot(q[0], cross(q[j], q[j + 1]));
            }
            if (vol < 0)
                for (const f of comp)
                    F[f].v.reverse();
        }
        const r5 = (v) => Math.round(v * 1e5) / 1e5;
        const faces = F.map((f) => ({ v: f.v, color: color(f.mat), mat: f.mat }));
        return { mesh: { positions: P.map((p) => p.map(r5)), faces }, w: this.W };
    }
}
// rigid closed shells (points + faces), placed by the caller
const boxShape = (c, [hx, hy, hz], rotY = 0, rotX = 0, taper = 1) => {
    const raw = [];
    for (const y of [-1, 1])
        for (const z of [-1, 1])
            for (const x of [-1, 1])
                raw.push([x * hx * (y > 0 ? taper : 1), y * hy, z * hz * (y > 0 ? taper : 1)]);
    const pts = raw.map(([x, y, z]) => {
        const y1 = y * Math.cos(rotX) - z * Math.sin(rotX), z1 = y * Math.sin(rotX) + z * Math.cos(rotX);
        return add(c, [x * Math.cos(rotY) + z1 * Math.sin(rotY), y1, -x * Math.sin(rotY) + z1 * Math.cos(rotY)]);
    });
    return [pts, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]];
};
/** a faceted ellipsoid; triangles at the poles, quads (planar: rings are level) between */
const blobShape = (c, [rx, ry, rz], seg = 8, rings = 5) => {
    const pts = [add(c, [0, ry, 0])];
    for (let i = 1; i < rings; i++)
        for (let j = 0; j < seg; j++) {
            const th = (Math.PI * i) / rings, ph = (2 * Math.PI * (j + 0.5)) / seg;
            pts.push(add(c, [rx * Math.sin(th) * Math.cos(ph), ry * Math.cos(th), rz * Math.sin(th) * Math.sin(ph)]));
        }
    pts.push(add(c, [0, -ry, 0]));
    const faces = [];
    const R = (i, j) => 1 + (i - 1) * seg + (j % seg);
    for (let j = 0; j < seg; j++)
        faces.push([0, R(1, j + 1), R(1, j)]);
    for (let i = 1; i < rings - 1; i++)
        for (let j = 0; j < seg; j++)
            faces.push([R(i, j), R(i, j + 1), R(i + 1, j + 1)], [R(i, j), R(i + 1, j + 1), R(i + 1, j)]);
    for (let j = 0; j < seg; j++)
        faces.push([R(rings - 1, j), R(rings - 1, j + 1), pts.length - 1]);
    return [pts, faces];
};
/** a tube from a to b (n sides), radius ra at a and rb at b, closed */
const tubeShape = (a, b, ra, rb, n = 6) => {
    const u = norm(sub(b, a));
    const ref = Math.abs(u[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const X = norm(cross(u, ref)), Z = cross(X, u);
    const ring = (c, r) => Array.from({ length: n }, (_, k) => {
        const t = ((k + 0.5) / n) * Math.PI * 2;
        return add(c, add(scale(X, Math.cos(t) * r), scale(Z, Math.sin(t) * r)));
    });
    const pts = [...ring(a, ra), ...ring(b, rb)];
    const faces = [];
    for (let k = 0; k < n; k++)
        faces.push([k, (k + 1) % n, n + ((k + 1) % n)], [k, n + ((k + 1) % n), n + k]);
    faces.push(Array.from({ length: n }, (_, k) => k), Array.from({ length: n }, (_, k) => n + k));
    return [pts, faces];
};
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** a smooth bump 0..1..0 over [a, b] (for pushing a ring out over a few rings) */
const bump = (t, a, b) => (t <= a || t >= b ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * (t - a)) / (b - a)));
/** The figure's measures for a spec: the joints and the sizes every part is built from (cloth bulk included). */
const measures = (s) => {
    const H = s.body.height, b = s.body.build, f = s.base === 'female', sw = s.body.shoulders;
    const kind = s.outfit.kind;
    const suit = kind === 'astronaut';
    const fat = 1 + 0.26 * b; // thickness of the limbs
    const belly = 1 + 0.45 * Math.max(0, b) - 0.1 * Math.max(0, -b);
    // cloth over the body: the trunk, the limbs, the feet
    const tb = suit ? 1.15 : kind === 'coat' ? 1.04 : kind === 'workwear' ? 1.035 : 1.01;
    const lb = suit ? 1.22 : kind === 'coat' ? 1.05 : kind === 'workwear' ? 1.04 : 1.015;
    const fb = suit ? 1.22 : 1.05;
    // half widths (x) and half depths (z) of the trunk; the female an hourglass, the male a V
    const sh = (f ? 0.108 : 0.136) * H * (1 + 0.11 * sw) * (1 + 0.05 * b) * (suit ? 1.08 : 1);
    const chest = (f ? 0.082 : 0.104) * H * (1 + 0.09 * b) * (1 + 0.05 * sw);
    const waist = (f ? 0.057 : 0.082) * H * belly;
    const hip = (f ? 0.11 : 0.088) * H * (1 + 0.13 * b);
    const dChest = (f ? 0.052 : 0.066) * H * (1 + 0.14 * b), dWaist = (f ? 0.045 : 0.058) * H * belly, dHip = (f ? 0.064 : 0.055) * H * (1 + 0.14 * b);
    const neck = (f ? 0.02 : 0.027) * H * (1 + 0.12 * b);
    const armR = (f ? 0.021 : 0.027) * H * fat * lb; // the upper arm
    const thigh = (f ? 0.056 : 0.05) * H * fat * lb, knee = (f ? 0.035 : 0.037) * H * fat * lb, calf = (f ? 0.04 : 0.042) * H * fat * lb, ankle = (f ? 0.023 : 0.026) * H * fat * lb;
    const hand = (f ? 0.95 : 1.02) * H * (suit ? 1.25 : 1);
    const hh = 0.162 * H * s.body.head; // the head, chin to crown (about six heads tall)
    const y = (k) => k * H;
    const legX = hip * (f ? 0.5 : 0.54);
    const shX = sh - armR * 1.0;
    const wristX = Math.max(shX + 0.03 * H, hip * tb + armR * 0.9 + 0.012 * H, waist * tb * 1.1 + armR + 0.035 * H);
    const J = {
        root: [0, y(0.53), 0],
        spine: [0, y(0.66), -0.005 * H],
        head: [0, y(0.852), -0.004 * H],
        shoulderL: [shX, y(0.8), -0.006 * H],
        elbowL: [(shX + wristX) / 2 + 0.006 * H, y(0.625), -0.014 * H],
        wristL: [wristX, y(0.49), 0.006 * H],
        hipL: [legX, y(0.505), 0],
        kneeL: [legX * 0.92, y(0.275), 0.006 * H],
        ankleL: [legX * 0.88, y(0.05), -0.004 * H],
    };
    for (const n of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']) {
        const p = J[`${n}L`];
        J[`${n}R`] = [-p[0], p[1], p[2]];
    }
    return { H, f, b, fat, tb, lb, fb, sh, chest, waist, hip, dChest, dWaist, dHip, neck, armR, thigh, knee, calf, ankle, hand, hh, J, y, legX, suit, flare: kind === 'crew' };
};
/** Which material each region of the body and the arms is, for the outfit (L / R suffixes for one side only). */
const lookOf = (s) => {
    const skin = s.face.skin, { kind, main, second } = s.outfit;
    const legs = { thigh: second, knee: second, shin: second, foot: 'leather' };
    if (kind === 'coat')
        return { pelvis: second, belt: second, belly: main, chest: main, vee: second, shoulder: main, collar: main, neck: skin, ...legs, upper: main, elbow: main, fore: main, cuff: main, hand: skin };
    if (kind === 'overall')
        return { pelvis: main, belt: main, belly: main, bib: main, chest: second, vee: second, shoulder: second, collar: second, neck: skin, thigh: main, knee: main, shin: main, foot: 'leather', upper: second, elbow: skin, fore: skin, cuff: skin, hand: skin };
    if (kind === 'astronaut')
        return { pelvis: main, belt: second, belly: main, chest: main, vee: main, shoulder: main, collar: second, neck: second, thigh: main, knee: second, shin: main, foot: second, upper: main, elbow: second, fore: main, cuff: second, hand: second };
    // the crew tunic: beige with the left sleeve in the department's colour, a round black collar, a black belt
    if (kind === 'crew')
        return { pelvis: main, belt: 'charcoal', belly: main, chest: main, vee: main, shoulder: main, collar: 'charcoal', neck: skin, thigh: main, knee: main, shin: main, foot: 'leather', upper: main, elbow: main, fore: main, cuff: main, hand: skin, upperL: second, elbowL: second, foreL: second, cuffL: second, shoulderL: second };
    return { pelvis: second, belt: 'leather', belly: main, chest: main, vee: main, shoulder: main, collar: main, neck: skin, ...legs, upper: main, elbow: main, fore: main, cuff: second, hand: skin };
};
// ---------- the body: trunk, neck, legs and feet as one surface ----------
// The trunk's rings have 12 points (k = 0 at the left side, 3 in front, 6 at the right, 9 at the back). At the crotch the
// lowest ring splits: its left half, the front and back middle points and a crotch point make the left leg's first ring
// (8 points), the right half the right leg's.
const bodyMesh = (B, s, m, look, id) => {
    const { H, f, b, tb, hip, waist, chest, sh, dChest, dWaist, dHip, neck, thigh, knee, calf, ankle, fb, J, y } = m;
    const bt = Math.min(tb, 1.05); // trousers are thinner than a suit's trunk
    const bust = f ? 0.028 * H * (1 + 0.25 * Math.max(0, b)) : 0.006 * H;
    const glute = (f ? 0.018 : 0.01) * H;
    const tummy = 0.03 * H * Math.max(0, b);
    const R = (j) => id[j];
    // a trunk ring: an ellipse pushed out in front (the bust, a belly) and behind (the seat); squareFront flattens the chest
    const ring12 = (r) => B.ring(Array.from({ length: 12 }, (_, k) => {
        const t = (k * Math.PI) / 6;
        const c = Math.cos(t), sn = Math.sin(t);
        let z = sn * r.rz + (r.z ?? 0);
        if (k === 2 || k === 4)
            z += (r.front ?? 0);
        if (k === 3)
            z += r.frontMid ?? r.front ?? 0;
        if (k === 8 || k === 10)
            z += -(r.back ?? 0) * 0.8;
        if (k === 9)
            z += -(r.back ?? 0);
        if (r.squareFront && (k === 2 || k === 4))
            z += r.squareFront * r.rz; // the chest's front is flatter and wider
        return [c * r.rx * (r.squareFront && (k === 2 || k === 4) ? 1.08 : 1), r.y, z];
    }), r.w);
    const root = [[R('root'), 1]], spine = [[R('spine'), 1]];
    const mix = (a) => [[R('root'), 1 - a], [R('spine'), a]];
    const sq = f ? 0 : 0.12;
    const rings = {
        c: ring12({ y: y(0.485), rx: hip * 0.9 * bt, rz: dHip * 0.86 * bt, back: glute * 0.6, w: root }),
        hip: ring12({ y: y(0.53), rx: hip * bt, rz: dHip * bt, back: glute, w: root }),
        hip2: ring12({ y: y(0.572), rx: (f ? hip * 0.9 : hip * 0.9) * bt, rz: dHip * 0.95 * bt, front: tummy * 0.4, back: glute * 0.45, w: mix(0.25) }),
        waist: ring12({ y: y(0.615), rx: waist * tb, rz: dWaist * tb, front: tummy, w: mix(0.55) }),
        under: ring12({ y: y(0.66), rx: (chest * 0.9) * tb, rz: dChest * 0.92 * tb, front: bust * 0.3 + tummy * 0.5, frontMid: bust * 0.1 + tummy * 0.5, squareFront: sq, w: spine }),
        bust: ring12({ y: y(0.7), rx: chest * tb, rz: dChest * tb, front: bust, frontMid: bust * 0.7, squareFront: sq, w: spine }),
        upper: ring12({ y: y(0.745), rx: (f ? chest * 0.98 : Math.max(chest * 1.02, sh * 0.8)) * tb, rz: dChest * 0.96 * tb, front: bust * 0.45, frontMid: bust * 0.3, squareFront: sq, w: spine }),
        shoulder: ring12({ y: y(0.79), rx: sh * (f ? 0.88 : 0.9) * tb, rz: dChest * 0.72 * tb, z: -0.003 * H, front: bust * 0.05, back: -0.005 * H, w: spine }),
        trap: ring12({ y: y(0.818), rx: neck * 2.3 * tb, rz: neck * 1.7 * tb, z: -0.004 * H, w: spine }),
        n0: ring12({ y: y(0.838), rx: neck, rz: neck * 1.05, z: 0.002 * H, w: spine }),
        n1: ring12({ y: y(0.878), rx: neck * 0.94, rz: neck, z: 0.005 * H, w: [[R('spine'), 0.5], [R('head'), 0.5]] }),
    };
    const isFront = (k) => k >= 1 && k <= 4; // the columns between points 1..5 (the middle 120 degrees in front)
    const isVee = (k) => k === 2 || k === 3;
    B.band(rings.c, rings.hip, look.pelvis);
    B.band(rings.hip, rings.hip2, look.pelvis);
    B.band(rings.hip2, rings.waist, look.belt);
    B.band(rings.waist, rings.under, (k) => (look.bib && !isFront(k) ? look.chest : look.belly));
    B.band(rings.under, rings.bust, (k) => (look.bib && isFront(k) ? look.bib : look.chest));
    B.band(rings.bust, rings.upper, (k) => (look.bib && isFront(k) ? look.bib : look.chest));
    B.band(rings.upper, rings.shoulder, (k) => (isVee(k) ? look.vee : look.chest));
    B.band(rings.shoulder, rings.trap, (k) => (isVee(k) ? look.vee : look.shoulder));
    B.band(rings.trap, rings.n0, look.collar);
    B.band(rings.n0, rings.n1, look.neck);
    B.fan(rings.n1, B.pt([0, y(0.886), 0.005 * H], [[R('spine'), 0.5], [R('head'), 0.5]]), look.neck);
    // the legs
    const crotch = B.pt([0, y(0.462), 0.004 * H], root);
    const c = rings.c;
    // the shoe's outline (x across, z forward), in H: a rounded toe, a narrow heel
    const FOOT = [[0.03, 0.01], [0.034, 0.075], [0.022, 0.118], [0.0, 0.13], [-0.022, 0.115], [-0.03, 0.06], [-0.026, -0.02], [-0.012, -0.042], [0.012, -0.042], [0.028, -0.025]];
    for (const [n, side] of [['L', 1], ['R', -1]]) {
        const hipJ = R(`hip${n}`), kneeJ = R(`knee${n}`), ankleJ = R(`ankle${n}`);
        const top = side > 0 ? [c[0], c[1], c[2], c[3], crotch, c[9], c[10], c[11]] : [c[6], c[5], c[4], c[3], crotch, c[9], c[8], c[7]];
        const P = J[`hip${n}`], K = J[`knee${n}`], A = J[`ankle${n}`];
        const centre = (yy) => (yy >= K[1] ? lerp(K, P, (yy - K[1]) / (P[1] - K[1])) : lerp(A, K, (yy - A[1]) / (K[1] - A[1])));
        const ring8 = (yy, rx, rz, dz, w, inward = 0) => {
            const cc = centre(yy);
            return B.ring(Array.from({ length: 8 }, (_, k) => {
                const t = (k * Math.PI) / 4;
                return [cc[0] + side * (Math.cos(t) * rx - inward), yy, cc[2] + dz + Math.sin(t) * rz];
            }), w);
        };
        const wt = (a, ja, jb) => (a >= 1 ? [[ja, 1]] : [[ja, a], [jb, 1 - a]]);
        const fl = m.flare ? 1.35 : 1;
        const t1 = ring8(y(0.445), thigh, thigh * 1.02, 0.004 * H, wt(0.6, hipJ, R('root')), thigh * 0.08);
        const t2 = ring8(y(0.39), thigh * 0.93, thigh * 0.94, 0.004 * H, [[hipJ, 1]]);
        const t3 = ring8(y(0.335), thigh * 0.78, thigh * 0.8, 0.002 * H, wt(0.9, hipJ, kneeJ));
        const k0 = ring8(y(0.3), knee * 1.06, knee * 1.08, 0.002 * H, wt(0.7, hipJ, kneeJ));
        const kn = ring8(y(0.275), knee, knee * 1.06, 0.006 * H, wt(0.5, hipJ, kneeJ));
        const k1 = ring8(y(0.25), knee * 1.02, knee * 1.02, 0, wt(0.7, kneeJ, hipJ));
        const c1 = ring8(y(0.205), calf, calf * 1.08, -0.006 * H, [[kneeJ, 1]]);
        const c2 = ring8(y(0.15), calf * 0.86, calf * 0.9, -0.006 * H, [[kneeJ, 1]]);
        const a1 = ring8(y(0.095), ankle * 1.05 * fl, ankle * 1.1 * fl, -0.002 * H, [[kneeJ, 1]]);
        const a0 = ring8(y(0.058), ankle * 1.0 * fb * fl, ankle * 1.08 * fb * fl, 0, wt(0.5, kneeJ, ankleJ));
        const foot = (yy, k) => B.ring(FOOT.map(([ox, oz]) => [A[0] + side * ox * H * k, yy, A[2] + 0.004 * H + oz * H * k]), [[ankleJ, 1]]);
        const f2 = B.ring(FOOT.map(([ox, oz]) => [A[0] + side * ox * H * 0.75 * fb, y(0.038), A[2] + 0.004 * H + oz * H * 0.8 * fb]), [[ankleJ, 1]]);
        const f1 = foot(y(0.016), 0.98 * fb);
        const f0 = foot(0, fb);
        B.band(top, t1, look.thigh);
        B.band(t1, t2, look.thigh);
        B.band(t2, t3, look.thigh);
        B.band(t3, k0, look.thigh);
        B.band(k0, kn, look.knee);
        B.band(kn, k1, look.knee);
        B.band(k1, c1, look.shin);
        B.band(c1, c2, look.shin);
        B.band(c2, a1, look.shin);
        B.band(a1, a0, m.flare ? look.shin : look.foot);
        B.band(a0, f2, look.foot);
        B.band(f2, f1, look.foot);
        B.band(f1, f0, look.foot);
        B.fan(f0, B.pt([A[0] + side * 0.002 * H, 0, A[2] + 0.004 * H + 0.045 * H * fb], [[ankleJ, 1]]), look.foot === 'leather' ? 'rubber' : look.foot);
    }
};
// ---------- the arms and hands ----------
const armsMesh = (B, s, m, look, id) => {
    const { H, armR, hand, J } = m;
    const R = (j) => id[j];
    for (const [n, side] of [['L', 1], ['R', -1]]) {
        const S = J[`shoulder${n}`], E = J[`elbow${n}`], W = J[`wrist${n}`];
        const spine = R('spine'), sj = R(`shoulder${n}`), ej = R(`elbow${n}`), wj = R(`wrist${n}`);
        const L = (k) => look[`${k}${n}`] ?? look[k];
        // a ring across the limb (direction u): X points away from the body, Z forward
        const ring = (c, u, rx, rz, w) => {
            const Z = norm(sub([0, 0, 1], scale(u, u[2])));
            const X = norm(cross(u, Z));
            const out = dot(X, [side, 0, 0]) < 0 ? scale(X, -1) : X;
            return B.ring(Array.from({ length: 8 }, (_, k) => {
                const t = (k * Math.PI) / 4;
                return add(c, add(scale(out, Math.cos(t) * rx), scale(Z, Math.sin(t) * rz)));
            }), w);
        };
        const up = norm(sub(E, S)), lo = norm(sub(W, E));
        const A = armR;
        // the shoulder: a dome over the joint (its inner half inside the trunk), then the deltoid, a slim elbow, the forearm
        const a0 = ring(add(S, [-side * A * 0.4, A * 0.3, 0]), up, A * 0.95, A * 0.9, [[spine, 0.5], [sj, 0.5]]);
        const a1 = ring(add(S, [side * A * 0.1, -A * 0.25, 0]), up, A * 1.22, A * 1.15, [[sj, 0.8], [spine, 0.2]]);
        const a2 = ring(lerp(S, E, 0.3), up, A * 1.12, A * 1.1, [[sj, 1]]);
        const a3 = ring(lerp(S, E, 0.72), up, A * 0.9, A * 0.92, [[sj, 1]]);
        const a4 = ring(lerp(S, E, 0.9), up, A * 0.84, A * 0.86, [[sj, 0.8], [ej, 0.2]]);
        const a5 = ring(E, norm(add(up, lo)), A * 0.8, A * 0.84, [[sj, 0.5], [ej, 0.5]]);
        const a6 = ring(lerp(E, W, 0.1), lo, A * 0.84, A * 0.88, [[ej, 0.8], [sj, 0.2]]);
        const a7 = ring(lerp(E, W, 0.3), lo, A * 0.9, A * 1.0, [[ej, 1]]);
        const a8 = ring(lerp(E, W, 0.8), lo, A * 0.6, A * 0.7, [[ej, 1]]);
        const a9 = ring(W, lo, A * 0.52, A * 0.62, [[ej, 0.5], [wj, 0.5]]);
        // the hand: a flat paddle (the palm faces the thigh), a little bigger than life, fingers together, rounded
        const hu = norm([side * 0.06, -1, 0.05]);
        const h = (k) => k * hand;
        const h1 = ring(add(W, scale(hu, h(0.028))), hu, h(0.011), h(0.024), [[wj, 1]]);
        const h2 = ring(add(W, scale(hu, h(0.062))), hu, h(0.0105), h(0.029), [[wj, 1]]);
        const h3 = ring(add(W, scale(hu, h(0.095))), hu, h(0.009), h(0.025), [[wj, 1]]);
        const h4 = ring(add(W, scale(hu, h(0.115))), hu, h(0.006), h(0.015), [[wj, 1]]);
        B.fan(a0, B.pt(add(S, [-side * A * 0.6, A * 0.5, 0]), [[spine, 0.5], [sj, 0.5]]), L('shoulder'));
        B.band(a0, a1, L('upper'));
        B.band(a1, a2, L('upper'));
        B.band(a2, a3, L('upper'));
        B.band(a3, a4, L('upper'));
        B.band(a4, a5, L('elbow'));
        B.band(a5, a6, L('elbow'));
        B.band(a6, a7, L('fore'));
        B.band(a7, a8, L('fore'));
        B.band(a8, a9, L('cuff'));
        B.band(a9, h1, look.hand);
        B.band(h1, h2, look.hand);
        B.band(h2, h3, look.hand);
        B.band(h3, h4, look.hand);
        B.fan(h4, B.pt(add(W, scale(hu, h(0.122))), [[wj, 1]]), look.hand);
        // the thumb, forward of the palm
        const fwd = [0, 0, 1];
        B.shell(...tubeShape(add(add(W, scale(hu, h(0.028))), scale(fwd, h(0.014))), add(add(W, scale(hu, h(0.068))), scale(fwd, h(0.03))), h(0.008), h(0.006), 5), look.hand, [[wj, 1]]);
    }
};
// ---------- the head ----------
// The head's rings, chin (t = 0) to crown (t = 1): [t, half width, half depth, forward shift], all in head heights.
// A big round cranium, full cheeks, a small chin: the eyes sit at half the height, the face below is short.
const headProfile = (s, m) => {
    const shape = s.face.shape, jaw = s.face.jaw, male = s.base === 'male';
    const wide = { oval: 0.98, round: 1.05, square: 1.02, long: 0.93 }[shape];
    const tall = { oval: 1, round: 0.96, square: 1, long: 1.07 }[shape];
    const jw = (0.68 + 0.14 * jaw + (shape === 'square' ? 0.12 : shape === 'round' ? 0.06 : 0)) * (male ? 1.06 : 0.94);
    const chin = (shape === 'square' ? 0.2 : shape === 'round' ? 0.16 : 0.13) + 0.04 * jaw;
    const keys = [
        [0, chin * wide, 0.11, 0.12],
        [0.07, 0.36 * jw * wide, 0.3, 0.1],
        [0.17, 0.43 * jw * wide * (0.94 + 0.06 * jw), 0.41, 0.07],
        [0.3, 0.47 * wide, 0.48, 0.045],
        [0.44, 0.5 * wide, 0.52, 0.025],
        [0.58, 0.515 * wide, 0.54, 0.01],
        [0.72, 0.5 * wide, 0.53, -0.01],
        [0.85, 0.42 * wide, 0.45, -0.03],
        [0.95, 0.26 * wide, 0.28, -0.05],
    ];
    const hh = m.hh * tall;
    return { keys, hh, y0: m.y(0.852) - 0.01 * hh, zc: 0.012 * m.H };
};
const headAt = (P, t) => {
    const k = P.keys;
    const tt = Math.max(0, Math.min(k.at(-1)[0], t));
    let i = 0;
    while (i < k.length - 2 && k[i + 1][0] < tt)
        i++;
    const a = k[i], b = k[i + 1];
    const u = (tt - a[0]) / (b[0] - a[0]);
    const L = (j) => (a[j] + (b[j] - a[j]) * u) * P.hh;
    return { y: P.y0 + t * P.hh, rx: L(1), rz: L(2), z: P.zc + L(3) };
};
/** a point on the head at height t and angle th (0 = left, 90 degrees = front), d further out */
const headPt = (P, t, th, d = 0) => {
    const r = headAt(P, t);
    return [Math.cos(th) * (r.rx + d), r.y, r.z + Math.sin(th) * (r.rz + d)];
};
/** the face's front surface at height t and sideways offset x, and its outward normal */
const frontAt = (P, t, x) => {
    const r = headAt(P, t);
    const th = Math.acos(Math.max(-1, Math.min(1, x / r.rx)));
    const p = [x, r.y, r.z + Math.sin(th) * r.rz];
    // the normal of the ellipse in xz, tilted by the profile's slope in y
    const up = headAt(P, Math.min(0.95, t + 0.03)), dn = headAt(P, Math.max(0, t - 0.03));
    const slope = ((up.rz + up.z) - (dn.rz + dn.z)) / (up.y - dn.y);
    const n = norm([Math.cos(th) / Math.max(r.rx, 1e-6), -slope * Math.sin(th), Math.sin(th) / Math.max(r.rz, 1e-6)]);
    return { p, n };
};
/** a planar polygon on the face: at (t, x), `pts` as [across, up] offsets, lifted `lift` off the skin */
const facePoly = (P, t, x, pts, lift) => {
    const { p, n } = frontAt(P, t, x);
    const u = norm(cross([0, 1, 0], n)), v = cross(n, u);
    return { poly: pts.map(([a, b]) => add(add(add(p, scale(n, lift)), scale(u, a)), scale(v, b))), n };
};
const headMesh = (B, s, P, id) => {
    const w = [[id.head, 1]];
    const skin = s.face.skin, hh = P.hh;
    const rings = P.keys.map(([t]) => B.ring(Array.from({ length: 12 }, (_, k) => headPt(P, t, (k * Math.PI) / 6)), w));
    for (let i = 0; i < rings.length - 1; i++)
        B.band(rings[i], rings[i + 1], skin);
    const top = headAt(P, 1);
    B.fan(rings.at(-1), B.pt([0, top.y, P.zc - 0.05 * hh], w), skin);
    const chin = headAt(P, 0);
    B.fan(rings[0], B.pt([0, chin.y - 0.012 * hh, chin.z], w), skin);
    // the nose: a small wedge standing off the face
    const nose = 0.8 + 0.4 * s.face.nose;
    const { p: nb, n: nn } = frontAt(P, 0.4, 0);
    const tip = add(add(nb, scale(nn, 0.07 * hh * nose)), [0, -0.09 * hh * nose, 0]);
    const base = [add(nb, [-0.045 * hh * nose, -0.1 * hh * nose, -0.01 * hh]), add(nb, [0.045 * hh * nose, -0.1 * hh * nose, -0.01 * hh]), add(nb, [0, 0.02 * hh, -0.01 * hh])];
    B.shell([...base, tip], [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]], skin, w);
    // the ears: small rounded plates on the sides
    for (const sd of [1, -1]) {
        const ear = headAt(P, 0.47);
        const c = [sd * ear.rx * 0.98, ear.y, ear.z - 0.07 * hh];
        const poly = Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return add(c, [sd * 0.012 * hh, Math.sin(a) * 0.085 * hh, Math.cos(a) * 0.06 * hh]);
        });
        B.plate(poly, [sd, 0, 0], 0.025 * hh, skin, w);
    }
};
/** The face: eyes, brows and the mouth as flat plates lying a little over the skin (an n-gon drawn on the face). */
const faceMesh = (B, s, P, id) => {
    const w = [[id.head, 1]];
    const hh = P.hh, lift = 0.012 * hh, thick = 0.01 * hh;
    const brow = s.hair.style === 'bald' && s.beard === 'none' ? 'hair-brown' : s.hair.mat;
    const female = s.base === 'female';
    for (const sd of [1, -1]) {
        // an almond eye (6-gon), a little taller on the female base; the outer corner slightly higher
        const ew = 0.085 * hh, eh = (female ? 0.06 : 0.05) * hh;
        const eye = facePoly(P, 0.5, sd * 0.17 * hh, [[-ew, 0], [-ew * 0.5, eh], [ew * 0.5, eh * 1.05], [ew, eh * 0.15], [ew * 0.5, -eh * 0.9], [-ew * 0.5, -eh * 0.85]].map(([a, b]) => [sd * a, b]), lift);
        B.plate(eye.poly, eye.n, thick, 'eye-white', w);
        // the pupil: a dark hexagon over the white, a little to the inner side (looking at you)
        const pr = eh * 0.78;
        const pupil = facePoly(P, 0.495, sd * 0.16 * hh, Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3 + Math.PI / 6) * pr * 0.95, Math.sin((k * Math.PI) / 3 + Math.PI / 6) * pr]), lift + thick * 1.2);
        B.plate(pupil.poly, pupil.n, thick, 'eye', w);
        // a brow: a slim arc of four points
        const bw = 0.1 * hh, bh = female ? 0.014 * hh : 0.022 * hh;
        const browP = facePoly(P, 0.63, sd * 0.17 * hh, [[-bw, -bh * 0.6], [0, bh * 0.9], [bw, 0], [bw * 0.9, -bh * 1.2], [0, -bh * 0.9], [-bw * 0.95, -bh * 2.2]].map(([a, b]) => [sd * a, b]), lift);
        B.plate(browP.poly, browP.n, thick, brow, w);
    }
    // the mouth: a soft smile (5-gon), wider on the male base
    const mw = (female ? 0.075 : 0.085) * hh, mh = 0.02 * hh;
    const mouth = facePoly(P, 0.2, 0, [[-mw, mh * 0.6], [0, -mh * 0.2], [mw, mh * 0.6], [mw * 0.55, -mh * 1.2], [-mw * 0.55, -mh * 1.2]], lift);
    B.plate(mouth.poly, mouth.n, thick, 'mouth', w);
};
// ---------- hair and beard ----------
/**
 * A closed layer over the head: columns at angles `ths`, rows from lowT(th) up to highT(th); outside d out from the skin,
 * inside just under it. wrap: the columns go all the way round (the top closed by a point), else the patch gets side walls.
 */
const headLayer = (B, P, w, mat, ths, lowT, highT, d, wrap, rows = 4, drop = 0) => {
    const grid = (out) => Array.from({ length: rows + 1 }, (_, r) => B.ring(ths.map((th) => {
        const lo = lowT(th), hi = highT(th);
        const t = lo + ((hi - lo) * r) / rows;
        const p = headPt(P, t, th, out ? d(th, t, r / rows) : -0.012 * P.hh);
        return r === 0 && out ? add(p, [0, -drop * P.hh, 0]) : p;
    }), w));
    const O = grid(true), I = grid(false);
    for (let r = 0; r < rows; r++) {
        B.band(O[r], O[r + 1], mat, wrap);
        B.band(I[r], I[r + 1], mat, wrap);
    }
    B.band(O[0], I[0], mat, wrap);
    if (wrap) {
        const top = headAt(P, 1);
        B.fan(O[rows], B.pt([0, top.y + d(Math.PI / 2, 1, 1) * 0.9, P.zc - 0.05 * P.hh], w), mat);
        B.fan(I[rows], B.pt([0, top.y - 0.02 * P.hh, P.zc - 0.05 * P.hh], w), mat);
    }
    else {
        B.band(O[rows], I[rows], mat, false);
        const n = ths.length;
        for (const k of [0, n - 1]) {
            const o = O.map((row) => row[k]), i = I.map((row) => row[k]);
            B.band(o, i, mat, false);
        }
    }
};
/**
 * A lock of hair: a flat ribbon along `path` points ([t, th, d] on the head, or absolute points), `width` at the root
 * tapering to a point; it lies on the head's surface where it passes (the d offsets keep it off the skin).
 */
const lock = (B, P, w, mat, path, width, thick, taper = 0.15) => {
    const n = path.length;
    const rows = path.map((c, i) => {
        const along = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
        // sideways: across the lock, level with the head's surface there (radial from the head's axis)
        const r = headAt(P, Math.max(0, Math.min(0.95, (c[1] - P.y0) / P.hh)));
        const radial = norm([c[0], 0, c[2] - r.z]);
        let side = norm(cross(along, radial));
        if (!Number.isFinite(side[0]))
            side = [1, 0, 0];
        const wd = width * (1 - (1 - taper) * (i / (n - 1)) ** 1.3);
        return [add(c, scale(side, -wd / 2)), add(c, scale(side, wd / 2))];
    });
    B.ribbon(rows, thick, mat, w);
};
const hairMesh = (B, s, P, m, id) => {
    const w = [[id.head, 1]];
    const hh = P.hh, mat = s.hair.mat;
    const style = s.hair.style;
    const ring16 = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
    const r = rng(s.seed * 7919 + 13);
    if (style !== 'bald') {
        // the cap: the hairline high over the forehead, over the ears, lowest at the nape; thin at the line, full on top
        const low = (th) => {
            const a = Math.sin(th);
            return a > 0 ? 0.52 + 0.24 * a ** 1.4 : 0.52 + (style === 'short' ? 0.18 : 0.26) * a;
        };
        const thick = style === 'bun' ? 0.04 : 0.055;
        headLayer(B, P, w, mat, ring16, low, () => 0.94, (th, t, rel) => thick * hh * (0.2 + 0.8 * Math.min(1, rel * 1.5)), true, 4);
        // the fringe and the side locks: flat locks over the hairline, each a slightly different length and swing
        const fringe = (count, thFrom, thTo, len, swing, width) => {
            for (let k = 0; k < count; k++) {
                const u = count === 1 ? 0.5 : k / (count - 1);
                const th = thFrom + (thTo - thFrom) * u;
                const L = len * (0.85 + 0.3 * r()), sw = swing * (u - 0.5) * 2 + (r() - 0.5) * 0.3;
                const path = [];
                for (let i = 0; i <= 3; i++) {
                    const f = i / 3;
                    const t = 0.8 - L * f;
                    const p = headPt(P, Math.max(0.3, t), th + sw * f * 0.6, thick * hh * (0.75 - 0.3 * f) + 0.012 * hh * f);
                    path.push(t < 0.3 ? [p[0], P.y0 + t * hh, p[2]] : p);
                }
                lock(B, P, w, mat, path, width * hh, 0.014 * hh, 0.2);
            }
        };
        if (style === 'short') {
            fringe(5, Math.PI * 0.3, Math.PI * 0.7, 0.2, 0.4, 0.2);
            fringe(1, Math.PI * 0.08, Math.PI * 0.08, 0.26, 0, 0.17);
            fringe(1, Math.PI * 0.92, Math.PI * 0.92, 0.26, 0, 0.17);
        }
        else if (style === 'long') {
            fringe(4, Math.PI * 0.32, Math.PI * 0.68, 0.24, 0.5, 0.2);
            // long locks down the back and the sides, past the shoulders
            for (let k = 0; k < 9; k++) {
                const th = -Math.PI * 0.1 + (Math.PI * 1.2 * k) / 8 + Math.PI; // the back half, ear to ear
                const back = th > Math.PI * 1.3 && th < Math.PI * 1.7;
                const L = (back ? 0.95 : 0.75) * (0.9 + 0.2 * r());
                const path = [];
                for (let i = 0; i <= 4; i++) {
                    const f = i / 4;
                    const t = 0.8 - 0.95 * f;
                    if (t > 0.35)
                        path.push(headPt(P, t, th, 0.045 * hh));
                    else {
                        // below the jaw the lock hangs straight, drifting a little out and back
                        const base = headPt(P, 0.35, th, 0.05 * hh);
                        const y = P.y0 + (0.35 - (0.35 - t) * (L / 0.49)) * hh;
                        path.push([base[0] * (1 + 0.1 * f), Math.max(y, P.y0 - L * hh + 0.35 * hh), base[2] - 0.04 * hh * f]);
                    }
                }
                lock(B, P, w, mat, path, 0.26 * hh, 0.016 * hh, 0.35);
            }
        }
        else if (style === 'bun') {
            fringe(3, Math.PI * 0.34, Math.PI * 0.66, 0.16, 0.3, 0.2);
            const c = headPt(P, 0.84, -Math.PI / 2, 0.14 * hh);
            B.shell(...blobShape(add(c, [0, 0.07 * hh, 0]), [0.2 * hh, 0.17 * hh, 0.19 * hh], 8, 5), mat, w);
            B.shell(...tubeShape(add(c, [0, -0.01 * hh, 0.08 * hh]), add(c, [0, 0.03 * hh, 0.1 * hh]), 0.14 * hh, 0.13 * hh, 8), mat, w);
        }
    }
    if (s.beard !== 'none') {
        const bm = s.hair.mat;
        const span = s.beard === 'full' ? [-0.2, Math.PI + 0.2] : [Math.PI / 2 - 0.42, Math.PI / 2 + 0.42];
        const cols = s.beard === 'full' ? 11 : 5;
        const ths = Array.from({ length: cols }, (_, k) => span[0] + ((span[1] - span[0]) * k) / (cols - 1));
        const top = (th) => (s.beard === 'full' ? 0.13 + 0.17 * (1 - Math.abs(Math.sin(th))) : 0.12);
        headLayer(B, P, w, bm, ths, () => 0.0, top, (th, t, rel) => (s.beard === 'full' ? 0.04 : 0.035) * hh * (1 - 0.7 * rel) * (0.6 + 0.4 * Math.abs(Math.sin(th))), false, 3, s.beard === 'full' ? 0.035 : 0.03);
        const mo = facePoly(P, 0.27, 0, [[-0.1 * hh, 0.012 * hh], [0, 0.03 * hh], [0.1 * hh, 0.012 * hh], [0.08 * hh, -0.02 * hh], [-0.08 * hh, -0.02 * hh]], 0.014 * hh);
        B.plate(mo.poly, mo.n, 0.012 * hh, bm, w);
    }
    void m;
};
// ---------- gear: glasses, a coat's skirt, straps, a belt, pads, an astronaut's helmet and pack ----------
const gearMesh = (B, s, m, P, id) => {
    const { H, tb, hip, waist, chest, dChest, dWaist, dHip, neck, knee, J, y } = m;
    const { kind, main, second } = s.outfit;
    const head = [[id.head, 1]], spine = [[id.spine, 1]], root = id.root;
    const hh = P.hh;
    const helmet = kind === 'astronaut' && s.outfit.helmet;
    if (s.glasses && !helmet) {
        for (const sd of [1, -1]) {
            const rim = facePoly(P, 0.5, sd * 0.17 * hh, [[-0.11, 0.08], [0.11, 0.08], [0.11, -0.08], [-0.11, -0.08]].map(([a, b]) => [a * hh, b * hh]), 0.03 * hh);
            B.plate(rim.poly, rim.n, 0.008 * hh, 'frame', head);
            const lens = facePoly(P, 0.5, sd * 0.17 * hh, [[-0.09, 0.06], [0.09, 0.06], [0.09, -0.06], [-0.09, -0.06]].map(([a, b]) => [a * hh, b * hh]), 0.034 * hh);
            B.plate(lens.poly, lens.n, 0.004 * hh, 'lens', head);
            const side = headAt(P, 0.5);
            B.shell(...boxShape([sd * side.rx * 1.01, side.y + 0.012 * hh, side.z + side.rz * 0.3], [0.008 * hh, 0.01 * hh, side.rz * 0.6]), 'frame', head);
        }
        const mid = facePoly(P, 0.52, 0, [[-0.05 * hh, 0.012 * hh], [0.05 * hh, 0.012 * hh], [0.05 * hh, -0.012 * hh], [-0.05 * hh, -0.012 * hh]], 0.03 * hh);
        B.plate(mid.poly, mid.n, 0.008 * hh, 'frame', head);
    }
    if (kind === 'coat') {
        // the skirt: from the belt to above the knee; its hem follows the thighs in front (sitting, walking), much less behind
        const hipL = id.hipL, hipR = id.hipR;
        const sk = (yy, rx, rz, hem) => B.ring(Array.from({ length: 12 }, (_, k) => {
            const t = (k * Math.PI) / 6;
            return [Math.cos(t) * rx, yy, Math.sin(t) * rz + (Math.sin(t) < 0 ? -0.004 * H : 0)];
        }), (p) => {
            if (!hem)
                return [[root, 1]];
            const h = hem * (p[2] > 0 ? 1 : 0.35 + 0.65 * Math.max(0, 1 + p[2] / (rz * 0.5)));
            const l = Math.max(0, Math.min(1, 0.5 + p[0] / (2 * rx * 0.6)));
            return [[root, 1 - h], [hipL, h * l], [hipR, h * (1 - l)]].filter(([, x]) => x > 0);
        });
        const tummy = 0.03 * H * Math.max(0, m.b);
        const levels = [
            [0.612, Math.max(waist * 1.04, m.f ? waist * 0.5 + hip * 0.5 : 0) * tb * 1.04, dWaist * tb * 1.05 + tummy * 0.85, 0],
            [0.572, hip * 0.9 * Math.min(tb, 1.05) * 1.06, dHip * 0.95 * 1.08 + tummy * 0.7, 0],
            [0.53, hip * Math.min(tb, 1.05) * 1.07, dHip * 1.14 + tummy * 0.6 + (m.f ? 0.014 : 0.008) * H, 0],
            [0.43, hip * 1.17, dHip * 1.36 + tummy * 0.4, 0.55],
            [0.345, hip * 1.23, dHip * 1.42 + tummy * 0.3, 0.85],
        ];
        for (let r = 1; r < levels.length; r++)
            ((levels[r][1] = Math.max(levels[r][1], levels[r - 1][1])), (levels[r][2] = Math.max(levels[r][2], levels[r - 1][2])));
        const o = levels.map(([yy, rx, rz, hem]) => sk(y(yy), rx, rz, hem));
        const i = levels.map(([yy, rx, rz, hem]) => sk(y(yy), rx * 0.95, rz * 0.95, hem));
        for (let r = 0; r < o.length - 1; r++)
            (B.band(o[r], o[r + 1], main), B.band(i[r], i[r + 1], main));
        B.band(o[0], i[0], main);
        B.band(o.at(-1), i.at(-1), main);
        // lapels and the button line
        for (const sd of [1, -1])
            B.shell(...boxShape([sd * chest * 0.22 * tb, y(0.765), dChest * 0.95 * tb], [chest * 0.12, 0.035 * H, 0.006 * H], sd * 0.35, -0.2, 0.6), main, spine);
        B.shell(...boxShape([0, y(0.52), dHip * 1.1 + 0.004 * H], [0.003 * H, 0.08 * H, 0.003 * H]), second, [[root, 1]]);
    }
    if (kind === 'overall') {
        // the straps over the shoulders, brass buttons, a bib pocket
        for (const sd of [1, -1]) {
            const bust = m.f ? 0.028 * H * (1 + 0.25 * Math.max(0, m.b)) : 0.006 * H;
            const fr = [sd * chest * 0.42, y(0.752), dChest * tb + bust * 0.5 + 0.004 * H];
            const top = [sd * chest * 0.55, y(0.828), -0.004 * H];
            const bk = [sd * chest * 0.32, y(0.7), -dChest * tb - 0.014 * H];
            B.shell(...tubeShape(fr, top, 0.009 * H, 0.009 * H, 4), main, spine);
            B.shell(...tubeShape(top, bk, 0.009 * H, 0.009 * H, 4), main, spine);
            B.shell(...boxShape(add(fr, [0, -0.006 * H, 0.008 * H]), [0.007 * H, 0.007 * H, 0.004 * H]), 'brass', spine);
        }
        B.shell(...boxShape([0, y(0.705), dChest + m.dChest * 0.15 + 0.004 * H], [chest * 0.25, 0.022 * H, 0.004 * H]), main, spine);
    }
    if (kind === 'workwear') {
        for (const n of ['L', 'R']) {
            const K = J[`knee${n}`];
            B.shell(...boxShape(add(K, [0, 0, knee * 0.95 + 0.006 * H]), [knee * 0.7, knee * 0.9, 0.008 * H], 0, -0.1), 'rubber', [[id[`knee${n}`], 1]]);
        }
        B.shell(...boxShape([chest * 0.45 * tb, y(0.725), dChest * tb + 0.004 * H], [chest * 0.2, 0.025 * H, 0.004 * H]), second, spine);
    }
    if (kind === 'crew') {
        // the belt with its buckle, the zip line down the tunic's front
        const bw = (waist * 0.55 + hip * 0.45) * tb;
        B.shell(...tubeShape([0, y(0.6), 0], [0, y(0.625), 0], bw * 1.07, bw * 1.05, 12), 'charcoal', [[root, 0.5], [id.spine, 0.5]]);
        B.shell(...boxShape([0, y(0.612), dWaist * tb * 1.1 + 0.006 * H], [0.014 * H, 0.011 * H, 0.004 * H]), 'brass', [[root, 0.5], [id.spine, 0.5]]);
        B.shell(...boxShape([0, y(0.71), dChest * tb + (m.f ? 0.03 : 0.012) * H], [0.0025 * H, 0.075 * H, 0.003 * H], 0, 0.12), 'charcoal', spine);
    }
    if (kind === 'astronaut') {
        // the collar ring the helmet locks onto, a small pack on the back, the chest panel
        B.shell(...tubeShape([0, y(0.836), 0], [0, y(0.86), 0.002 * H], neck * 2.2, neck * 2.1, 10), second, spine);
        const back = dChest * tb;
        B.shell(...boxShape([0, y(0.705), -back - 0.03 * H], [chest * 0.72, 0.085 * H, 0.03 * H], 0, 0, 0.94), main, spine);
        B.shell(...boxShape([0, y(0.785), -back - 0.03 * H], [chest * 0.5, 0.008 * H, 0.024 * H]), second, spine);
        B.shell(...boxShape([0, y(0.705), dChest * tb + 0.008 * H], [0.05 * H, 0.032 * H, 0.012 * H]), second, spine);
        for (const sd of [1, 0, -1])
            B.shell(...boxShape([sd * 0.022 * H, y(0.712), dChest * tb + 0.021 * H], [0.007 * H, 0.007 * H, 0.002 * H]), sd === 0 ? 'screen' : 'rubber', spine);
        if (helmet) {
            const c = [0, P.y0 + hh * 0.5, P.zc + 0.03 * hh];
            const r = hh * 0.74;
            const seg = 12;
            const [pts, faces] = blobShape(c, [r, r * 1.02, r * 1.02], seg, 8);
            const mid = (f) => scale(f.reduce((a, i) => add(a, pts[i]), [0, 0, 0]), 1 / f.length);
            B.shell(pts, faces, (i) => {
                const f = faces[i], k = i - seg;
                const at = i < seg || i >= faces.length - seg ? mid(f) : mid(k % 2 === 0 ? [f[0], f[2]] : [f[0], f[1]]);
                const q = sub(at, c);
                return q[2] > r * 0.45 && q[1] > -r * 0.5 && q[1] < r * 0.55 && Math.abs(q[0]) < r * 0.78 ? 'visor' : main;
            }, head);
        }
    }
};
// ---------- the prop in the right hand ----------
const propMesh = (B, s, m, id) => {
    const { H, hand, J } = m;
    const w = [[id.wristR, 1]];
    const W = J.wristR;
    const hu = norm([-0.06, -1, 0.05]);
    const palm = add(W, scale(hu, 0.062 * hand));
    if (s.prop === 'tablet') {
        // held upright against the palm, the screen facing out
        const c = add(palm, [0.002 * H, -0.01 * H, 0.034 * H]);
        B.shell(...boxShape(c, [0.006 * H, 0.085 * H, 0.06 * H], 0, 0.15), 'plastic', w);
        B.shell(...boxShape(add(c, [-0.0068 * H, 0, 0]), [0.0012 * H, 0.075 * H, 0.052 * H], 0, 0.15), 'screen', w);
    }
    else if (s.prop === 'wrench') {
        const c = add(palm, [0, -0.01 * H, 0.014 * H]);
        B.shell(...boxShape(add(c, [0, -0.05 * H, 0.012 * H]), [0.006 * H, 0.085 * H, 0.012 * H], 0, -0.2), 'steel', w);
        B.shell(...boxShape(add(c, [0, -0.14 * H, 0.032 * H]), [0.009 * H, 0.016 * H, 0.03 * H], 0, -0.2), 'steel', w);
        B.shell(...boxShape(add(c, [0, -0.16 * H, 0.058 * H]), [0.009 * H, 0.012 * H, 0.009 * H], 0, -0.2), 'steel', w);
        B.shell(...boxShape(add(c, [0, -0.165 * H, 0.015 * H]), [0.009 * H, 0.012 * H, 0.009 * H], 0, -0.2), 'steel', w);
    }
    else if (s.prop === 'commlock') {
        // a hand-held communicator: a flat box in the fist with a small screen and a button row, its top at the thumb
        const c = add(palm, [0.0, -0.005 * H, 0.03 * H]);
        B.shell(...boxShape(c, [0.012 * H, 0.05 * H, 0.014 * H], 0, 0.1), 'suit-grey', w);
        B.shell(...boxShape(add(c, [-0.0125 * H, 0.015 * H, 0]), [0.001 * H, 0.016 * H, 0.009 * H], 0, 0.1), 'screen', w);
        for (const k of [-1, 0, 1])
            B.shell(...boxShape(add(c, [-0.0125 * H, -0.022 * H, k * 0.008 * H]), [0.001 * H, 0.004 * H, 0.0025 * H], 0, 0.1), k === 0 ? 'rust' : 'rubber', w);
        B.shell(...boxShape(add(c, [0, 0.056 * H, -0.004 * H]), [0.004 * H, 0.008 * H, 0.004 * H]), 'charcoal', w);
    }
};
const r5 = (v) => Math.round(v * 1e5) / 1e5;
/**
 * The figure of a spec: its parts (stable ids, in CHARACTER_PARTS order, the empty ones left out) and its rig (the humanoid
 * joints, blended weights). Faces name palette materials; their colours come from `palette` (else CHARACTER_MATERIALS).
 * Use the rig with posed() / boneMatrices() / walkPose() / HUMANOID_POSES.
 */
export const buildCharacter = (input, palette) => {
    const spec = normalizeCharacter(input);
    const m = measures(spec);
    const joints = HUMANOID_JOINTS.map((name) => {
        const parent = name === 'root' ? null : name === 'spine' || name.startsWith('hip') ? 'root' : name === 'head' || name.startsWith('shoulder') ? 'spine' : name.startsWith('elbow') ? `shoulder${name.slice(-1)}` : name.startsWith('wrist') ? `elbow${name.slice(-1)}` : name.startsWith('knee') ? `hip${name.slice(-1)}` : `knee${name.slice(-1)}`;
        return { name, parent, at: m.J[name].map(r5) };
    });
    const id = Object.fromEntries(joints.map((j, i) => [j.name, i]));
    const look = lookOf(spec);
    const P = headProfile(spec, m);
    const helmet = spec.outfit.kind === 'astronaut' && spec.outfit.helmet;
    const color = (mat) => palette?.[mat]?.color ?? MATS[mat]?.color ?? '#c8c8c8';
    const makers = [
        ['body', (B) => bodyMesh(B, spec, m, look, id)],
        ['arms', (B) => armsMesh(B, spec, m, look, id)],
        ['head', (B) => headMesh(B, spec, P, id)],
        ['face', (B) => faceMesh(B, spec, P, id)],
        ['hair', (B) => (helmet ? undefined : hairMesh(B, spec, P, m, id))],
        ['gear', (B) => gearMesh(B, spec, m, P, id)],
        ['prop', (B) => propMesh(B, spec, m, id)],
    ];
    const parts = [];
    const skin = [];
    for (const [pid, make] of makers) {
        const B = new Build();
        make(B);
        if (!B.F.length)
            continue;
        const { mesh, w } = B.finish(color);
        parts.push({ id: pid, mesh });
        skin.push(w);
    }
    return { spec, parts, rig: { joints, skin }, height: Math.max(m.H, P.y0 + P.hh) };
};

// Characters: a low-poly figure made from a few numbers, for many quick, animatable extras.
//
// A character is a spec (`CharacterSpec`, versioned, plain JSON): a base figure (female or male), body sliders (height,
// build, shoulders, head), a face (shape, jaw, nose, skin), hair, glasses, beard, an outfit and one prop. buildCharacter()
// turns it into a few meshes with stable ids and a rig with the humanoid joints (rig.ts: HUMANOID_JOINTS), so posed(),
// walkPose() and HUMANOID_POSES move it like any figure. The same spec always gives the same figure (curly hair is placed
// by the spec's seed).
//
// The meshes: `body` is ONE closed surface (trunk, neck, both legs and feet, branching at the crotch), `arms` both arms
// with their hands, `head` the head with its face, `hair` the hair and the beard, `gear` what is worn on top (glasses,
// a coat's skirt, straps, an astronaut's helmet and pack), `prop` the thing in the right hand. The body and the arms bend
// smoothly: a point near a joint is shared by the bones on both sides of it (blended weights).
//
// There are no colours in a spec: every face names a palette material (`face.mat`, the engine's material model; its
// colour is only the fallback). CHARACTER_MATERIALS lists the ones a character uses, the spec picks skin, hair and cloth
// by material name, so a palette edit restyles every character made of it, and any palette entry can be chosen.
// Clothes are the body's own faces in cloth materials (a sleeve is the arm's surface, so it can never come off), plus a
// little gear for the shapes cloth adds (a coat's skirt, straps, a helmet).
//
// Y is up, the figure stands on y = 0 and looks to +z, its left is +x (as rig.ts expects).
import { add, sub, scale, dot, cross, norm } from './vec.js';
import { HUMANOID_JOINTS } from './rig.js';
export const CHARACTER_VERSION = 2;
/** The materials characters are made of (palette entries: add the missing ones to a palette). */
export const CHARACTER_MATERIALS = {
    'skin-1': { color: '#f2d3bd', rough: 0.6, soft: 0.6 },
    'skin-2': { color: '#e6b998', rough: 0.6, soft: 0.6 },
    'skin-3': { color: '#d6a27e', rough: 0.6, soft: 0.6 },
    'skin-4': { color: '#c08a62', rough: 0.6, soft: 0.6 },
    'skin-5': { color: '#a06d48', rough: 0.6, soft: 0.6 },
    'skin-6': { color: '#7f5236', rough: 0.6, soft: 0.6 },
    'skin-7': { color: '#5f3b26', rough: 0.6, soft: 0.6 },
    'hair-black': { color: '#1f1b1a', rough: 0.55, soft: 0.15 },
    'hair-brown': { color: '#4a3020', rough: 0.55, soft: 0.15 },
    'hair-chestnut': { color: '#7a4b2a', rough: 0.55, soft: 0.15 },
    'hair-auburn': { color: '#9a4426', rough: 0.55, soft: 0.15 },
    'hair-blond': { color: '#c9a062', rough: 0.55, soft: 0.15 },
    'hair-grey': { color: '#9c9a96', rough: 0.55, soft: 0.15 },
    'hair-white': { color: '#e2e0da', rough: 0.55, soft: 0.15 },
    'lab-white': { color: '#ecebe5', rough: 0.85, soft: 0.2 },
    'shirt-white': { color: '#dcdad2', rough: 0.9, soft: 0.2 },
    'denim': { color: '#3f5a86', rough: 0.95, soft: 0.1 },
    'navy': { color: '#2a3550', rough: 0.9, soft: 0.1 },
    'olive': { color: '#5f6e46', rough: 0.95, soft: 0.1 },
    'khaki': { color: '#a89a72', rough: 0.95, soft: 0.1 },
    'brown-canvas': { color: '#6b4e33', rough: 0.95, soft: 0.1 },
    'charcoal': { color: '#34363b', rough: 0.9, soft: 0.1 },
    'rust': { color: '#a4492e', rough: 0.9, soft: 0.1 },
    'mustard': { color: '#c39a32', rough: 0.9, soft: 0.1 },
    'teal': { color: '#2f7a7c', rough: 0.9, soft: 0.1 },
    'suit-white': { color: '#e8e8e4', rough: 0.75, soft: 0.1 },
    'suit-grey': { color: '#8d9096', rough: 0.7 },
    'suit-orange': { color: '#d8692c', rough: 0.8, soft: 0.1 },
    'leather': { color: '#3a2a1e', rough: 0.6 },
    'rubber': { color: '#26272a', rough: 0.85 },
    'eye': { color: '#17120f', rough: 0.15 },
    'mouth': { color: '#6e3a32', rough: 0.6, soft: 0.4 },
    'lens': { color: '#cfe6f0', metal: 0.2, rough: 0.05, alpha: 0.3 },
    'frame': { color: '#1a1a1c', rough: 0.4 },
    'visor': { color: '#d9a640', metal: 0.9, rough: 0.12, alpha: 0.55 },
    'screen': { color: '#5fc8e8', rough: 0.3, emit: 0.8 },
    'plastic': { color: '#2b2d33', rough: 0.45 },
    'steel': { color: '#9aa7b4', metal: 1, rough: 0.3 },
    'brass': { color: '#c9a24a', metal: 1, rough: 0.3 },
    'tomato': { color: '#d4332a', rough: 0.35, soft: 0.3 },
    'leaf': { color: '#3f8a2e', rough: 0.7 },
};
const MATS = CHARACTER_MATERIALS;
/** The material choices offered for skin, hair and cloth (any palette name works too). */
export const CHARACTER_SKINS = Object.keys(MATS).filter((n) => n.startsWith('skin-'));
export const CHARACTER_HAIRS = Object.keys(MATS).filter((n) => n.startsWith('hair-'));
export const CHARACTER_CLOTHS = ['lab-white', 'shirt-white', 'denim', 'navy', 'olive', 'khaki', 'brown-canvas', 'charcoal', 'rust', 'mustard', 'teal', 'suit-white', 'suit-grey', 'suit-orange', 'leather'];
/** The palette entries characters use, as { name, ...material } (the form a scene file's `palette` has). */
export const characterPalette = () => Object.entries(MATS).map(([name, m]) => ({ name, metal: 0, rough: 0.7, alpha: 1, emit: 0, ...m }));
/** The slider ranges in which the poses and the clothes still fit. */
export const CHARACTER_RANGES = {
    height: [1.45, 2.05], build: [-1, 1], shoulders: [-1, 1], head: [0.85, 1.4], jaw: [-1, 1], nose: [-1, 1],
};
export const FACE_SHAPES = ['oval', 'round', 'square', 'long'];
export const HAIR_STYLES = ['short', 'curly', 'bun', 'bald'];
export const BEARD_STYLES = ['none', 'full', 'goatee'];
export const OUTFITS = ['coat', 'overall', 'workwear', 'astronaut'];
export const PROPS = ['none', 'tablet', 'wrench', 'tomato'];
/** the parts, in the order buildCharacter() returns them (missing ones are left out) */
export const CHARACTER_PARTS = ['body', 'arms', 'head', 'hair', 'gear', 'prop'];
export const CHARACTER_PRESETS = {
    scientist: {
        version: 2, role: 'scientist', base: 'female', seed: 11,
        body: { height: 1.68, build: -0.25, shoulders: -0.2, head: 1.05 },
        face: { shape: 'oval', jaw: -0.3, nose: 0, skin: 'skin-2' },
        hair: { style: 'short', mat: 'hair-black' }, glasses: true, beard: 'none',
        outfit: { kind: 'coat', main: 'lab-white', second: 'charcoal', helmet: true }, prop: 'tablet',
    },
    mechanic: {
        version: 2, role: 'mechanic', base: 'female', seed: 23,
        body: { height: 1.63, build: 0.1, shoulders: 0, head: 1.05 },
        face: { shape: 'round', jaw: 0, nose: 0.1, skin: 'skin-4' },
        hair: { style: 'bun', mat: 'hair-brown' }, glasses: false, beard: 'none',
        outfit: { kind: 'overall', main: 'denim', second: 'shirt-white', helmet: true }, prop: 'wrench',
    },
    farmer: {
        version: 2, role: 'farmer', base: 'male', seed: 37,
        body: { height: 1.74, build: 0.75, shoulders: 0.4, head: 1.05 },
        face: { shape: 'square', jaw: 0.5, nose: 0.4, skin: 'skin-3' },
        hair: { style: 'short', mat: 'hair-grey' }, glasses: false, beard: 'full',
        outfit: { kind: 'workwear', main: 'olive', second: 'brown-canvas', helmet: true }, prop: 'tomato',
    },
    astronaut: {
        version: 2, role: 'astronaut', base: 'male', seed: 51,
        body: { height: 1.78, build: 0, shoulders: 0.2, head: 1 },
        face: { shape: 'oval', jaw: 0.2, nose: 0, skin: 'skin-3' },
        hair: { style: 'short', mat: 'hair-brown' }, glasses: false, beard: 'none',
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
/** A complete, valid spec from anything (missing or bad fields take the defaults; values are clamped; a version 1 spec's colours become materials). */
export const normalizeCharacter = (s = {}) => {
    const R = CHARACTER_RANGES;
    const base = s.base === 'male' ? 'male' : 'female';
    const kind = pick(s.outfit?.kind, OUTFITS, 'workwear');
    return {
        version: CHARACTER_VERSION,
        ...(typeof s.role === 'string' ? { role: s.role } : {}),
        base,
        body: { height: clamp(s.body?.height, R.height, base === 'male' ? 1.76 : 1.66), build: clamp(s.body?.build, R.build, 0), shoulders: clamp(s.body?.shoulders, R.shoulders, 0), head: clamp(s.body?.head, R.head, 1) },
        face: { shape: pick(s.face?.shape, FACE_SHAPES, 'oval'), jaw: clamp(s.face?.jaw, R.jaw, 0), nose: clamp(s.face?.nose, R.nose, 0), skin: matName(s.face?.skin, CHARACTER_SKINS, 'skin-2') },
        hair: { style: pick(s.hair?.style, HAIR_STYLES, 'short'), mat: matName(s.hair?.mat ?? s.hair?.color, CHARACTER_HAIRS, 'hair-brown') },
        glasses: Boolean(s.glasses),
        beard: pick(s.beard, BEARD_STYLES, 'none'),
        outfit: {
            kind,
            main: matName(s.outfit?.main ?? s.outfit?.color, CHARACTER_CLOTHS, kind === 'astronaut' ? 'suit-white' : kind === 'coat' ? 'lab-white' : 'olive'),
            second: matName(s.outfit?.second ?? s.outfit?.color2, CHARACTER_CLOTHS, kind === 'astronaut' ? 'suit-grey' : 'charcoal'),
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
 * kind and the prop stay, and so does the main cloth of a lab coat or a suit (a role's cloth may change otherwise).
 */
export const variateCharacter = (spec, seed) => {
    const s = normalizeCharacter(spec);
    const r = rng(seed * 2654435761);
    const any = (l) => l[Math.floor(r() * l.length)];
    const span = (lo, hi) => lo + r() * (hi - lo);
    const base = r() < 0.5 ? 'female' : 'male';
    const R = CHARACTER_RANGES;
    const keepMain = s.outfit.kind === 'coat' || s.outfit.kind === 'astronaut' || r() < 0.5;
    const work = CHARACTER_CLOTHS.filter((c) => !c.startsWith('suit') && c !== 'lab-white');
    return normalizeCharacter({
        ...s,
        base,
        seed,
        body: { height: span(base === 'male' ? 1.64 : 1.54, base === 'male' ? 1.94 : 1.8), build: span(-0.9, 1), shoulders: span(-0.7, 0.8), head: span(0.92, 1.15) },
        face: { shape: any(FACE_SHAPES), jaw: span(R.jaw[0], R.jaw[1]) * 0.55 + (base === 'male' ? 0.3 : -0.2), nose: span(-0.8, 0.9), skin: any(CHARACTER_SKINS) },
        hair: { style: any(base === 'male' ? ['short', 'curly', 'bald', 'short'] : HAIR_STYLES.filter((h) => h !== 'bald')), mat: any(CHARACTER_HAIRS) },
        glasses: r() < 0.35,
        beard: base === 'male' ? any(BEARD_STYLES) : 'none',
        outfit: { ...s.outfit, main: keepMain ? s.outfit.main : any(work), second: s.outfit.kind === 'astronaut' || r() < 0.5 ? s.outfit.second : any(work) },
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
/** The figure's measures for a spec: the joints and the sizes every part is built from (cloth bulk included). */
const measures = (s) => {
    const H = s.body.height, b = s.body.build, f = s.base === 'female', sw = s.body.shoulders;
    const kind = s.outfit.kind;
    const suit = kind === 'astronaut';
    const fat = 1 + 0.28 * b;
    const belly = 1 + 0.5 * Math.max(0, b) - 0.1 * Math.max(0, -b);
    // cloth over the body: the trunk, the limbs, the feet
    const tb = suit ? 1.16 : kind === 'coat' ? 1.05 : kind === 'workwear' ? 1.04 : 1.01;
    const lb = suit ? 1.24 : kind === 'coat' ? 1.06 : kind === 'workwear' ? 1.05 : 1.02;
    const fb = suit ? 1.25 : 1.06;
    const sh = (f ? 0.104 : 0.132) * H * (1 + 0.12 * sw) * (1 + 0.06 * b) * (suit ? 1.1 : 1); // half the shoulder breadth
    const chest = (f ? 0.082 : 0.104) * H * (1 + 0.1 * b) * (1 + 0.05 * sw);
    const waist = (f ? 0.061 : 0.084) * H * belly;
    const hip = (f ? 0.11 : 0.088) * H * (1 + 0.14 * b);
    const dChest = (f ? 0.052 : 0.066) * H * fat, dWaist = (f ? 0.047 : 0.058) * H * belly, dHip = (f ? 0.064 : 0.055) * H * fat;
    const neck = (f ? 0.021 : 0.03) * H * (1 + 0.15 * b);
    const armR = (f ? 0.021 : 0.028) * H * fat * lb, legR = (f ? 0.053 : 0.047) * H * fat * lb;
    const hand = (f ? 0.92 : 1) * H * (suit ? 1.25 : 1);
    const hh = 0.132 * H * s.body.head; // the head, chin to crown
    const y = (k) => k * H;
    const legX = hip * (f ? 0.5 : 0.53);
    const shX = sh - armR * 1.05;
    const wristX = Math.max(shX + 0.012 * H, hip * tb + armR * 0.85 + 0.008 * H, waist * tb * 1.1 + armR + 0.03 * H);
    const J = {
        root: [0, y(0.53), 0],
        spine: [0, y(0.65), -0.005 * H],
        head: [0, y(0.858), -0.004 * H],
        shoulderL: [shX, y(0.805), -0.006 * H],
        elbowL: [(shX + wristX) / 2 + 0.008 * H, y(0.625), -0.012 * H],
        wristL: [wristX, y(0.485), 0.004 * H],
        hipL: [legX, y(0.5), 0],
        kneeL: [legX * 0.9, y(0.285), 0.006 * H],
        ankleL: [legX * 0.86, y(0.048), -0.004 * H],
    };
    for (const n of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']) {
        const p = J[`${n}L`];
        J[`${n}R`] = [-p[0], p[1], p[2]];
    }
    return { H, f, b, fat, tb, lb, fb, sh, chest, waist, hip, dChest, dWaist, dHip, neck, armR, legR, hand, hh, J, y, legX, suit };
};
/** Which material each region of the body and the arms is, for the outfit. */
const lookOf = (s) => {
    const skin = s.face.skin, { kind, main, second } = s.outfit;
    const legs = { thigh: second, knee: second, shin: second, foot: 'leather' };
    if (kind === 'coat')
        return { pelvis: second, belt: second, belly: main, chest: main, vee: second, shoulder: main, neck: skin, ...legs, upper: main, elbow: main, fore: main, cuff: main, hand: skin };
    if (kind === 'overall')
        return { pelvis: main, belt: main, belly: main, bib: main, chest: second, vee: second, shoulder: second, neck: skin, thigh: main, knee: main, shin: main, foot: 'leather', upper: second, elbow: skin, fore: skin, cuff: skin, hand: skin };
    if (kind === 'astronaut')
        return { pelvis: main, belt: second, belly: main, chest: main, vee: main, shoulder: main, neck: second, thigh: main, knee: second, shin: main, foot: second, upper: main, elbow: second, fore: main, cuff: second, hand: second };
    return { pelvis: second, belt: 'leather', belly: main, chest: main, vee: main, shoulder: main, neck: skin, ...legs, upper: main, elbow: main, fore: main, cuff: second, hand: skin };
};
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// ---------- the body: trunk, neck, legs and feet as one surface ----------
// The trunk's rings have 12 points (k = 0 at the left side, 3 in front, 6 at the right, 9 at the back). At the crotch the
// lowest ring splits: its left half, the front and back middle points and a crotch point make the left leg's first ring
// (8 points), the right half the right leg's.
const bodyMesh = (B, s, m, look, id) => {
    const { H, f, b, tb, hip, waist, chest, sh, dChest, dWaist, dHip, neck, legR, fb, J, y } = m;
    const bt = Math.min(tb, 1.06); // trousers are thinner than a suit's trunk
    const bust = f ? 0.024 * H * (1 + 0.3 * Math.max(0, b)) : 0.007 * H;
    const glute = (f ? 0.016 : 0.008) * H;
    const tummy = 0.035 * H * Math.max(0, b);
    const R = (j) => id[j];
    const ring12 = (r) => B.ring(Array.from({ length: 12 }, (_, k) => {
        const t = (k * Math.PI) / 6;
        const z = Math.sin(t) * r.rz + r.z + (r.push?.(k) ?? 0) * Math.sign(Math.sin(t) || 1);
        return [Math.cos(t) * r.rx, r.y, z];
    }), r.w);
    const front = (a, c) => (k) => (k === 2 || k === 4 ? a : k === 3 ? c : 0);
    const back = (a, c) => (k) => (k === 8 || k === 10 ? a : k === 9 ? c : 0);
    const both = (p, q) => (k) => p(k) + q(k);
    const root = [[R('root'), 1]], spine = [[R('spine'), 1]];
    const rings = {
        c: ring12({ y: y(0.49), rx: hip * 0.93 * bt, rz: dHip * 0.9 * bt, z: 0, push: back(glute * 0.7, glute * 0.5), w: root }),
        r1: ring12({ y: y(0.535), rx: hip * bt, rz: dHip * bt, z: 0, push: back(glute, glute * 0.8), w: root }),
        r2: ring12({ y: y(0.578), rx: (f ? hip * 0.82 + waist * 0.18 : hip * 0.6 + waist * 0.4) * bt, rz: (dHip + dWaist) * 0.5 * bt, z: 0, push: both(front(tummy * 0.5, tummy * 0.5), back(glute * 0.4, glute * 0.3)), w: [[R('root'), 0.8], [R('spine'), 0.2]] }),
        r2b: ring12({ y: y(0.604), rx: (f ? waist * 0.45 + hip * 0.55 : waist * 1.04) * tb, rz: dWaist * 1.03 * tb, z: 0, push: front(tummy * 0.8, tummy * 0.8), w: [[R('root'), 0.6], [R('spine'), 0.4]] }),
        r3: ring12({ y: y(0.64), rx: waist * tb, rz: dWaist * tb, z: 0, push: front(tummy, tummy), w: [[R('root'), 0.35], [R('spine'), 0.65]] }),
        r4: ring12({ y: y(0.68), rx: chest * 0.93 * tb, rz: dChest * 0.92 * tb, z: 0, push: front(bust * 0.45 + tummy * 0.4, bust * 0.35 + tummy * 0.4), w: spine }),
        r5: ring12({ y: y(0.72), rx: chest * tb, rz: dChest * tb, z: 0, push: front(bust, bust * 0.8), w: spine }),
        r6: ring12({ y: y(0.76), rx: (f ? chest * 1.0 : Math.max(chest * 1.04, sh * 0.86)) * tb, rz: dChest * 0.95 * tb, z: 0, push: front(bust * 0.55, bust * 0.45), w: spine }),
        r7: ring12({ y: y(0.8), rx: sh * (f ? 0.86 : 0.9) * tb, rz: dChest * 0.72 * tb, z: -0.004 * H, push: both(front(bust * 0.05, 0), back(0.004 * H, 0.004 * H)), w: spine }),
        r8: ring12({ y: y(0.826), rx: neck * 2.0 * tb, rz: neck * 1.5 * tb, z: -0.004 * H, w: spine }),
        n0: ring12({ y: y(0.845), rx: neck, rz: neck * 1.05, z: 0.002 * H, w: spine }),
        n1: ring12({ y: y(0.885), rx: neck * 0.92, rz: neck, z: 0.004 * H, w: [[R('spine'), 0.5], [R('head'), 0.5]] }),
    };
    const isFront = (k) => k >= 1 && k <= 4; // the columns between points 1..5 (the middle 120 degrees in front)
    const isVee = (k) => k === 2 || k === 3;
    B.band(rings.c, rings.r1, look.pelvis);
    B.band(rings.r1, rings.r2, look.pelvis);
    B.band(rings.r2, rings.r2b, look.belt);
    B.band(rings.r2b, rings.r3, (k) => (look.bib && !isFront(k) ? look.chest : look.belly));
    B.band(rings.r3, rings.r4, (k) => (look.bib && !isFront(k) ? look.chest : look.belly));
    B.band(rings.r4, rings.r5, (k) => (look.bib && isFront(k) ? look.bib : look.chest));
    B.band(rings.r5, rings.r6, (k) => (look.bib && isFront(k) ? look.bib : look.chest));
    B.band(rings.r6, rings.r7, look.chest);
    B.band(rings.r7, rings.r8, (k) => (isVee(k) ? look.vee : look.shoulder));
    B.band(rings.r8, rings.n0, look.neck);
    B.band(rings.n0, rings.n1, look.neck);
    B.fan(rings.n1, B.pt([0, y(0.893), 0.004 * H], [[R('spine'), 0.5], [R('head'), 0.5]]), look.neck);
    // the legs
    const crotch = B.pt([0, y(0.468), 0], root);
    const c = rings.c;
    const FOOT = [[0.034, 0.02], [0.03, 0.1], [0.008, 0.125], [-0.02, 0.105], [-0.026, 0.03], [-0.02, -0.035], [0, -0.045], [0.024, -0.035]];
    for (const [n, side] of [['L', 1], ['R', -1]]) {
        const hipJ = R(`hip${n}`), kneeJ = R(`knee${n}`), ankleJ = R(`ankle${n}`);
        const top = side > 0 ? [c[0], c[1], c[2], c[3], crotch, c[9], c[10], c[11]] : [c[6], c[5], c[4], c[3], crotch, c[9], c[8], c[7]];
        const P = J[`hip${n}`], K = J[`knee${n}`], A = J[`ankle${n}`];
        // a leg point's centre at height yy: along hip -> knee -> ankle
        const centre = (yy) => (yy >= K[1] ? lerp(K, P, (yy - K[1]) / (P[1] - K[1])) : lerp(A, K, (yy - A[1]) / (K[1] - A[1])));
        const ring8 = (yy, rx, rz, dz, w) => {
            const cc = centre(yy);
            return B.ring(Array.from({ length: 8 }, (_, k) => {
                const t = (k * Math.PI) / 4;
                return [cc[0] + side * Math.cos(t) * rx, yy, cc[2] + dz + Math.sin(t) * rz];
            }), w);
        };
        const wt = (a, ja, jb) => (a >= 1 ? [[ja, 1]] : [[ja, a], [jb, 1 - a]]);
        const L = legR;
        const t1 = ring8(y(0.45), L, L * 0.98, 0, wt(0.6, hipJ, R('root')));
        const t2 = ring8(y(0.385), L * 0.9, L * 0.9, 0, [[hipJ, 1]]);
        const t3 = ring8(y(0.325), L * 0.72, L * 0.74, 0, wt(0.85, hipJ, kneeJ));
        const kn = ring8(y(0.285), L * 0.6, L * 0.64, 0.004 * H, wt(0.5, hipJ, kneeJ));
        const c1 = ring8(y(0.225), L * 0.68, L * 0.72, -0.004 * H, wt(0.85, kneeJ, hipJ));
        const c2 = ring8(y(0.15), L * 0.52, L * 0.54, -0.002 * H, [[kneeJ, 1]]);
        const a1 = ring8(y(0.085), L * 0.38 * (m.suit ? 1.15 : 1), L * 0.4 * (m.suit ? 1.15 : 1), 0, [[kneeJ, 1]]);
        const a0 = ring8(y(0.052), L * 0.42 * fb, L * 0.44 * fb, 0, wt(0.5, kneeJ, ankleJ));
        const foot = (yy, k) => B.ring(FOOT.map(([ox, oz]) => [A[0] + side * ox * H * k, yy, A[2] + 0.004 * H + oz * H * k]), [[ankleJ, 1]]);
        const f1 = foot(y(m.suit ? 0.03 : 0.024), 0.9 * fb);
        const f0 = foot(0, fb);
        B.band(top, t1, look.thigh);
        B.band(t1, t2, look.thigh);
        B.band(t2, t3, look.thigh);
        B.band(t3, kn, look.knee);
        B.band(kn, c1, look.knee);
        B.band(c1, c2, look.shin);
        B.band(c2, a1, look.shin);
        B.band(a1, a0, look.foot === 'leather' ? look.shin : look.foot);
        B.band(a0, f1, look.foot);
        B.band(f1, f0, look.foot);
        B.fan(f0, B.pt([A[0] + side * 0.004 * H, 0, A[2] + 0.004 * H + 0.04 * H * fb], [[ankleJ, 1]]), look.foot === 'leather' ? 'rubber' : look.foot);
    }
};
// ---------- the arms and hands ----------
const armsMesh = (B, s, m, look, id) => {
    const { H, armR, hand, J } = m;
    const R = (j) => id[j];
    for (const [n, side] of [['L', 1], ['R', -1]]) {
        const S = J[`shoulder${n}`], E = J[`elbow${n}`], W = J[`wrist${n}`];
        const spine = R('spine'), sj = R(`shoulder${n}`), ej = R(`elbow${n}`), wj = R(`wrist${n}`);
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
        // the shoulder: a dome over the joint (its inner half inside the trunk), then the deltoid
        const a0 = ring(add(S, [-side * A * 0.3, A * 0.5, 0]), up, A * 1.05, A * 0.95, [[spine, 0.5], [sj, 0.5]]);
        const a1 = ring(add(S, [side * A * 0.05, -A * 0.15, 0]), up, A * 1.32, A * 1.22, [[sj, 0.8], [spine, 0.2]]);
        const a2 = ring(lerp(S, E, 0.32), up, A * 1.12, A * 1.08, [[sj, 1]]);
        const a3 = ring(lerp(S, E, 0.78), up, A * 0.92, A * 0.95, [[sj, 1]]);
        const a4 = ring(E, norm(add(up, lo)), A * 0.86, A * 0.88, [[sj, 0.5], [ej, 0.5]]);
        const a5 = ring(lerp(E, W, 0.25), lo, A * 0.92, A * 1.0, [[ej, 1]]);
        const a6 = ring(lerp(E, W, 0.82), lo, A * 0.66, A * 0.74, [[ej, 1]]);
        const a7 = ring(W, lo, A * 0.6, A * 0.68, [[ej, 0.5], [wj, 0.5]]);
        // the hand: flat across the palm (the palm faces the thigh), fingers together
        const hu = norm([side * 0.05, -1, 0.06]);
        const h = (k) => k * hand;
        const h1 = ring(add(W, scale(hu, h(0.03))), hu, h(0.012), h(0.021), [[wj, 1]]);
        const h2 = ring(add(W, scale(hu, h(0.06))), hu, h(0.0105), h(0.023), [[wj, 1]]);
        const h3 = ring(add(W, scale(hu, h(0.09))), hu, h(0.008), h(0.019), [[wj, 1]]);
        const h4 = ring(add(W, scale(hu, h(0.104))), hu, h(0.005), h(0.012), [[wj, 1]]);
        B.fan(a0, B.pt(add(S, [-side * A * 0.5, A * 0.8, 0]), [[spine, 0.5], [sj, 0.5]]), look.upper);
        B.band(a0, a1, look.upper);
        B.band(a1, a2, look.upper);
        B.band(a2, a3, look.upper);
        B.band(a3, a4, look.elbow);
        B.band(a4, a5, look.elbow === look.upper ? look.fore : look.elbow);
        B.band(a5, a6, look.fore);
        B.band(a6, a7, look.cuff);
        B.band(a7, h1, look.hand);
        B.band(h1, h2, look.hand);
        B.band(h2, h3, look.hand);
        B.band(h3, h4, look.hand);
        B.fan(h4, B.pt(add(W, scale(hu, h(0.11))), [[wj, 1]]), look.hand);
        // the thumb, forward of the palm
        const fwd = [0, 0, 1];
        B.shell(...tubeShape(add(add(W, scale(hu, h(0.025))), scale(fwd, h(0.012))), add(add(W, scale(hu, h(0.065))), scale(fwd, h(0.026))), h(0.0075), h(0.0055), 5), look.hand, [[wj, 1]]);
    }
};
// ---------- the head ----------
// The head's rings, chin (t = 0) to crown (t = 1): [t, half width, half depth, forward shift], all in head heights.
const headProfile = (s, m) => {
    const shape = s.face.shape, jaw = s.face.jaw, male = s.base === 'male';
    const wide = { oval: 0.97, round: 1.05, square: 1.0, long: 0.92 }[shape];
    const tall = { oval: 1, round: 0.96, square: 1, long: 1.08 }[shape];
    const jw = (0.62 + 0.16 * jaw + (shape === 'square' ? 0.12 : shape === 'round' ? 0.06 : 0)) * (male ? 1.06 : 0.94);
    const chin = shape === 'square' ? 0.15 : shape === 'round' ? 0.13 : 0.1;
    const cheek = shape === 'round' ? 1.04 : 1;
    const keys = [
        [0, (chin + 0.05 * jaw) * wide, 0.1, 0.16],
        [0.1, 0.42 * jw * wide, 0.27, 0.09],
        [0.24, 0.31 * wide * cheek * (0.9 + 0.1 * jw), 0.36, 0.05],
        [0.4, 0.345 * wide * cheek, 0.4, 0.03],
        [0.54, 0.36 * wide, 0.42, 0.02],
        [0.64, 0.365 * wide, 0.43, 0.02],
        [0.8, 0.34 * wide, 0.41, 0],
        [0.93, 0.23 * wide, 0.29, -0.02],
    ];
    const hh = m.hh * tall;
    return { keys, hh, y0: m.y(0.852), zc: 0.012 * m.H };
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
/** the face's front surface at height t and sideways offset x */
const frontAt = (P, t, x) => {
    const r = headAt(P, t);
    const th = Math.acos(Math.max(-1, Math.min(1, x / r.rx)));
    return [x, r.y, r.z + Math.sin(th) * r.rz];
};
const headMesh = (B, s, P, id) => {
    const w = [[id.head, 1]];
    const skin = s.face.skin, hh = P.hh;
    const rings = P.keys.map(([t]) => B.ring(Array.from({ length: 12 }, (_, k) => headPt(P, t, (k * Math.PI) / 6)), w));
    for (let i = 0; i < rings.length - 1; i++)
        B.band(rings[i], rings[i + 1], skin);
    const top = headAt(P, 1);
    B.fan(rings.at(-1), B.pt([0, top.y, P.zc - 0.04 * hh], w), skin);
    const chin = headAt(P, 0);
    B.fan(rings[0], B.pt([0, chin.y - 0.01 * hh, chin.z], w), skin);
    // the face: eyes, brows, nose, mouth, ears
    const brow = s.hair.style === 'bald' ? s.face.skin : s.hair.mat;
    for (const sd of [1, -1]) {
        const e = frontAt(P, 0.52, sd * 0.15 * hh);
        B.shell(...boxShape(add(e, [0, 0, -0.012 * hh]), [0.055 * hh, 0.032 * hh, 0.03 * hh], sd * 0.2), 'eye', w);
        const bw = frontAt(P, 0.625, sd * 0.155 * hh);
        B.shell(...boxShape(add(bw, [0, 0, -0.008 * hh]), [0.075 * hh, 0.017 * hh, 0.028 * hh], sd * 0.22, 0, 0.9), brow, w);
        const ear = headAt(P, 0.46);
        B.shell(...boxShape([sd * ear.rx * 0.97, ear.y, ear.z - 0.06 * hh], [0.035 * hh, 0.1 * hh, 0.07 * hh], 0, 0.15, 0.8), skin, w);
    }
    const nose = 0.8 + 0.45 * s.face.nose;
    const nb = frontAt(P, 0.36, 0);
    B.shell(...boxShape(add(nb, [0, 0.02 * hh * nose, 0.012 * hh * nose]), [0.045 * hh * nose, 0.1 * hh * nose, 0.05 * hh * nose], 0, 0.35, 0.55), skin, w);
    const mo = frontAt(P, 0.235, 0);
    B.shell(...boxShape(add(mo, [0, 0, -0.02 * hh]), [0.085 * hh, 0.014 * hh, 0.03 * hh]), 'mouth', w);
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
        B.fan(O[rows], B.pt([0, top.y + d(Math.PI / 2, 1, 1) * 0.9, P.zc - 0.04 * P.hh], w), mat);
        B.fan(I[rows], B.pt([0, top.y - 0.02 * P.hh, P.zc - 0.04 * P.hh], w), mat);
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
const hairMesh = (B, s, P, id) => {
    const w = [[id.head, 1]];
    const hh = P.hh, mat = s.hair.mat;
    const ring16 = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
    const style = s.hair.style;
    if (style !== 'bald') {
        // the hairline: high over the forehead, lower over the ears, lowest at the nape
        const low = (th) => {
            const a = Math.sin(th);
            const fr = style === 'bun' ? 0.77 : 0.75;
            return a > 0 ? 0.5 + (fr - 0.5) * a ** 1.5 : 0.5 + (style === 'short' ? 0.22 : 0.3) * a;
        };
        const thick = style === 'curly' ? 0.12 : style === 'bun' ? 0.04 : 0.075;
        // thin at the hairline, full on top; short hair stands up a little over the forehead
        const d = (th, t, rel) => thick * hh * (0.15 + 0.85 * Math.min(1, rel * 1.6)) * (style === 'short' && Math.sin(th) > 0.3 && t > 0.82 ? 1.6 : 1);
        headLayer(B, P, w, mat, ring16, low, () => 0.93, d, true, 4);
        if (style === 'bun') {
            const c = headPt(P, 0.86, -Math.PI / 2, 0.16 * hh);
            B.shell(...blobShape(add(c, [0, 0.06 * hh, 0]), [0.19 * hh, 0.17 * hh, 0.18 * hh], 8, 5), mat, w);
            B.shell(...tubeShape(add(c, [0, -0.02 * hh, 0.07 * hh]), add(c, [0, 0.02 * hh, 0.09 * hh]), 0.13 * hh, 0.12 * hh, 8), mat, w);
        }
        if (style === 'curly') {
            const r = rng(s.seed * 7919 + 13);
            for (let k = 0; k < 14; k++) {
                const th = r() * Math.PI * 2, t = 0.6 + r() * 0.38;
                if (Math.sin(th) > 0.4 && t < 0.82)
                    continue; // keep the face free
                const rr = (0.12 + r() * 0.06) * hh;
                B.shell(...blobShape(headPt(P, t, th, thick * hh * 0.9), [rr, rr * 0.9, rr], 6, 4), mat, w);
            }
        }
    }
    if (s.beard !== 'none') {
        const bm = s.hair.mat;
        const span = s.beard === 'full' ? [-0.2, Math.PI + 0.2] : [Math.PI / 2 - 0.42, Math.PI / 2 + 0.42];
        const cols = s.beard === 'full' ? 11 : 5;
        const ths = Array.from({ length: cols }, (_, k) => span[0] + ((span[1] - span[0]) * k) / (cols - 1));
        const top = (th) => (s.beard === 'full' ? 0.17 + 0.22 * (1 - Math.abs(Math.sin(th))) : 0.16);
        // thick at the chin, thinning up the cheeks
        headLayer(B, P, w, bm, ths, () => 0.0, top, (th, t, rel) => (s.beard === 'full' ? 0.055 : 0.04) * hh * (1 - 0.75 * rel) * (0.55 + 0.45 * Math.abs(Math.sin(th))), false, 3, s.beard === 'full' ? 0.06 : 0.05);
        // the moustache over the mouth
        const mo = frontAt(P, 0.29, 0);
        B.shell(...boxShape(add(mo, [0, 0, 0.006 * hh]), [0.12 * hh, 0.025 * hh, 0.03 * hh], 0, 0, 0.8), bm, w);
    }
};
// ---------- gear: glasses, a coat's skirt, straps, pads, an astronaut's helmet and pack ----------
const gearMesh = (B, s, m, P, id) => {
    const { H, tb, hip, waist, chest, dChest, dWaist, dHip, neck, legR, J, y } = m;
    const { kind, main, second } = s.outfit;
    const head = [[id.head, 1]], spine = [[id.spine, 1]], root = id.root;
    const hh = P.hh;
    const helmet = kind === 'astronaut' && s.outfit.helmet;
    if (s.glasses && !helmet) {
        for (const sd of [1, -1]) {
            const e = frontAt(P, 0.52, sd * 0.15 * hh);
            B.shell(...boxShape(add(e, [0, 0, 0.03 * hh]), [0.1 * hh, 0.07 * hh, 0.008 * hh]), 'frame', head);
            B.shell(...boxShape(add(e, [0, 0, 0.04 * hh]), [0.08 * hh, 0.052 * hh, 0.004 * hh]), 'lens', head);
            const side = headAt(P, 0.52);
            B.shell(...boxShape([sd * side.rx * 1.02, e[1] + 0.01 * hh, side.z + 0.05 * hh], [0.01 * hh, 0.012 * hh, side.rz * 0.6]), 'frame', head);
        }
        const mid = frontAt(P, 0.53, 0);
        B.shell(...boxShape(add(mid, [0, 0.01 * hh, 0.03 * hh]), [0.04 * hh, 0.01 * hh, 0.008 * hh]), 'frame', head);
    }
    if (kind === 'coat') {
        // the skirt: from the waist to above the knee, flaring; its hem follows the thighs a little
        const hipL = id.hipL, hipR = id.hipR;
        // the hem follows the thighs in front (sitting, walking), much less behind (it hangs on the seat)
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
        const tummy = 0.035 * H * Math.max(0, m.b);
        // the rings hug the trunk at the belt and only widen downwards (no lampshade on a wide waist)
        const levels = [
            [0.6, Math.max(waist * 1.04, m.f ? waist * 0.45 + hip * 0.55 : 0) * tb * 1.04, dWaist * tb * 1.05 + tummy * 0.85, 0],
            [0.578, (m.f ? hip * 0.82 + waist * 0.18 : hip * 0.6 + waist * 0.4) * Math.min(tb, 1.06) * 1.06, (dHip + dWaist) * 0.5 * Math.min(tb, 1.06) * 1.08 + tummy * 0.7, 0],
            [0.535, hip * Math.min(tb, 1.06) * 1.07, dHip * 1.14 + tummy * 0.6 + (m.f ? 0.016 : 0.008) * H, 0],
            [0.43, hip * 1.18, dHip * 1.38 + tummy * 0.4, 0.55],
            [0.34, hip * 1.24, dHip * 1.4 + tummy * 0.3, 0.85],
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
            const bust = m.f ? 0.024 * H * (1 + 0.3 * Math.max(0, m.b)) : 0.007 * H;
            const fr = [sd * chest * 0.42, y(0.752), dChest * tb + bust * 0.5 + 0.004 * H];
            const top = [sd * chest * 0.55, y(0.832), -0.004 * H];
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
            B.shell(...boxShape(add(K, [0, 0, legR * 0.62 + 0.006 * H]), [legR * 0.48, legR * 0.6, 0.008 * H], 0, -0.1), 'rubber', [[id[`knee${n}`], 1]]);
        }
        B.shell(...boxShape([chest * 0.45 * tb, y(0.725), dChest * tb + 0.004 * H], [chest * 0.2, 0.025 * H, 0.004 * H]), second, spine);
    }
    if (kind === 'astronaut') {
        // the collar ring the helmet locks onto, a small pack on the back, the chest panel
        B.shell(...tubeShape([0, y(0.835), 0], [0, y(0.858), 0.002 * H], neck * 2.1, neck * 2.0, 10), second, spine);
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
                // both triangles of a quad by the quad's middle (its diagonal), so the visor's edge follows the facets
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
    const hu = norm([-0.05, -1, 0.06]);
    const palm = add(W, scale(hu, 0.06 * hand));
    if (s.prop === 'tablet') {
        // held upright against the palm, the screen facing out
        const c = add(palm, [0.002 * H, -0.01 * H, 0.03 * H]);
        B.shell(...boxShape(c, [0.006 * H, 0.085 * H, 0.06 * H], 0, 0.15), 'plastic', w);
        B.shell(...boxShape(add(c, [-0.0068 * H, 0, 0]), [0.0012 * H, 0.075 * H, 0.052 * H], 0, 0.15), 'screen', w);
    }
    else if (s.prop === 'wrench') {
        const c = add(palm, [0, -0.01 * H, 0.012 * H]);
        B.shell(...boxShape(add(c, [0, -0.05 * H, 0.012 * H]), [0.006 * H, 0.085 * H, 0.012 * H], 0, -0.2), 'steel', w);
        B.shell(...boxShape(add(c, [0, -0.14 * H, 0.032 * H]), [0.009 * H, 0.016 * H, 0.03 * H], 0, -0.2), 'steel', w);
        B.shell(...boxShape(add(c, [0, -0.16 * H, 0.058 * H]), [0.009 * H, 0.012 * H, 0.009 * H], 0, -0.2), 'steel', w);
        B.shell(...boxShape(add(c, [0, -0.165 * H, 0.015 * H]), [0.009 * H, 0.012 * H, 0.009 * H], 0, -0.2), 'steel', w);
    }
    else if (s.prop === 'tomato') {
        const t = add(palm, [0.004 * H, -0.005 * H, 0.034 * H]);
        B.shell(...blobShape(t, [0.032 * H, 0.028 * H, 0.032 * H], 8, 5), 'tomato', w);
        B.shell(...boxShape(add(t, [0, 0.03 * H, 0]), [0.012 * H, 0.004 * H, 0.012 * H], 0.6), 'leaf', w);
        B.shell(...boxShape(add(t, [0, 0.037 * H, 0]), [0.003 * H, 0.008 * H, 0.003 * H]), 'leaf', w);
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
        ['hair', (B) => (helmet ? undefined : hairMesh(B, spec, P, id))],
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

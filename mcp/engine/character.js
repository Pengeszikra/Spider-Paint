// Characters: a stylized low-poly figure made from a few numbers, for many quick, animatable extras.
//
// A character is a spec (`CharacterSpec`, versioned, plain JSON): a base figure (female or male), body sliders (height,
// build, shoulders, head), a face (shape, jaw, nose, skin), hair, glasses, beard, an outfit and one prop. buildCharacter()
// turns it into parts with stable ids (body, outfit, hair, beard, glasses, prop) and a rig with the humanoid joints
// (rig.ts: HUMANOID_JOINTS), so posed(), walkPose() and HUMANOID_POSES move it like any figure. The same spec always
// gives the same figure (curly hair is placed by the spec's seed).
//
// Every part is a set of closed convex shells, each riding on ONE joint (a rigid skin): the clothes are the body's own
// segments, a little bigger, on the same joints, so a sleeve stays on its arm and a coat's tails on the thighs in any
// pose; balls at the elbows, knees and hips fill the bends. Y is up, the figure stands on y = 0 and looks to +z, its left
// is +x (as rig.ts expects). Faces carry their own colours, so every placed copy can be dressed differently.
import { add, sub, scale, dot, cross, norm } from './vec.js';
import { faceNormal } from './mesh.js';
import { HUMANOID_JOINTS } from './rig.js';
export const CHARACTER_VERSION = 1;
/** The slider ranges in which the poses and the clothes still fit. */
export const CHARACTER_RANGES = {
    height: [1.45, 2.05], build: [-1, 1], shoulders: [-1, 1], head: [0.85, 1.4], jaw: [-1, 1], nose: [-1, 1],
};
export const FACE_SHAPES = ['oval', 'round', 'square', 'long'];
export const HAIR_STYLES = ['short', 'curly', 'bun', 'bald'];
export const BEARD_STYLES = ['none', 'full', 'goatee'];
export const OUTFITS = ['coat', 'overall', 'workwear'];
export const PROPS = ['none', 'tablet', 'wrench', 'tomato'];
export const SKIN_TONES = ['#f3d2b8', '#e8b896', '#d9a27c', '#c98e62', '#a86f48', '#8a5534', '#6b3f26', '#4e2c1c'];
export const HAIR_COLORS = ['#1d1a1a', '#2a1d17', '#5a3a22', '#8a5a2e', '#c99a5a', '#e3c89a', '#9a9a9a', '#dcdcdc', '#a8442a'];
/** the parts, in the order buildCharacter() returns them (missing ones are left out) */
export const CHARACTER_PARTS = ['body', 'outfit', 'hair', 'beard', 'glasses', 'prop'];
export const CHARACTER_PRESETS = {
    scientist: {
        version: 1, role: 'scientist', base: 'female', seed: 11,
        body: { height: 1.68, build: -0.25, shoulders: -0.2, head: 1.15 },
        face: { shape: 'oval', jaw: -0.3, nose: 0, skin: '#e8b896' },
        hair: { style: 'short', color: '#1d1a1a' }, glasses: true, beard: 'none',
        outfit: { kind: 'coat', color: '#f1f1ec', color2: '#2c2f38' }, prop: 'tablet',
    },
    mechanic: {
        version: 1, role: 'mechanic', base: 'female', seed: 23,
        body: { height: 1.62, build: 0.1, shoulders: 0, head: 1.2 },
        face: { shape: 'round', jaw: 0, nose: 0.1, skin: '#c98e62' },
        hair: { style: 'bun', color: '#2a1d17' }, glasses: false, beard: 'none',
        outfit: { kind: 'overall', color: '#3d5a8a', color2: '#2b2b2b' }, prop: 'wrench',
    },
    farmer: {
        version: 1, role: 'farmer', base: 'male', seed: 37,
        body: { height: 1.72, build: 0.85, shoulders: 0.4, head: 1.15 },
        face: { shape: 'square', jaw: 0.5, nose: 0.4, skin: '#d9a27c' },
        hair: { style: 'short', color: '#9a9a9a' }, glasses: false, beard: 'full',
        outfit: { kind: 'workwear', color: '#5f7048', color2: '#6b4e33' }, prop: 'tomato',
    },
};
const clamp = (v, [lo, hi], d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
/** A complete, valid spec from anything (missing or bad fields take the defaults; values are clamped to the ranges). */
export const normalizeCharacter = (s = {}) => {
    const R = CHARACTER_RANGES;
    const base = s.base === 'male' ? 'male' : 'female';
    return {
        version: CHARACTER_VERSION,
        ...(typeof s.role === 'string' ? { role: s.role } : {}),
        base,
        body: { height: clamp(s.body?.height, R.height, base === 'male' ? 1.76 : 1.66), build: clamp(s.body?.build, R.build, 0), shoulders: clamp(s.body?.shoulders, R.shoulders, 0), head: clamp(s.body?.head, R.head, 1.15) },
        face: { shape: pick(s.face?.shape, FACE_SHAPES, 'oval'), jaw: clamp(s.face?.jaw, R.jaw, 0), nose: clamp(s.face?.nose, R.nose, 0), skin: hex(s.face?.skin, '#e8b896') },
        hair: { style: pick(s.hair?.style, HAIR_STYLES, 'short'), color: hex(s.hair?.color, '#2a1d17') },
        glasses: Boolean(s.glasses),
        beard: pick(s.beard, BEARD_STYLES, 'none'),
        outfit: { kind: pick(s.outfit?.kind, OUTFITS, 'workwear'), color: hex(s.outfit?.color, '#5f7048'), color2: hex(s.outfit?.color2, '#3a3a3a') },
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
const mixHex = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('');
};
const shade = (c, k) => mixHex(c, k < 0 ? '#000000' : '#ffffff', Math.abs(k));
/**
 * Another person in the same role: a different face, hair, build and colours (from `seed`); the outfit's kind and the prop
 * stay, the outfit's colours only shift a little, so the role still reads.
 */
export const variateCharacter = (spec, seed) => {
    const s = normalizeCharacter(spec);
    const r = rng(seed * 2654435761);
    const any = (l) => l[Math.floor(r() * l.length)];
    const span = (lo, hi) => lo + r() * (hi - lo);
    const base = r() < 0.5 ? 'female' : 'male';
    const R = CHARACTER_RANGES;
    return normalizeCharacter({
        ...s,
        base,
        seed,
        body: { height: span(base === 'male' ? 1.62 : 1.52, base === 'male' ? 1.95 : 1.82), build: span(-0.9, 1), shoulders: span(-0.7, 0.8), head: span(1.0, 1.3) },
        face: { shape: any(FACE_SHAPES), jaw: span(R.jaw[0], R.jaw[1]) * (base === 'male' ? 0.6 : 0.5) + (base === 'male' ? 0.3 : -0.2), nose: span(-0.8, 0.9), skin: any(SKIN_TONES) },
        hair: { style: any(base === 'male' ? ['short', 'curly', 'bald', 'short'] : HAIR_STYLES.filter((h) => h !== 'bald')), color: any(HAIR_COLORS) },
        glasses: r() < 0.35,
        beard: base === 'male' ? any(BEARD_STYLES) : 'none',
        outfit: { ...s.outfit, color: shade(s.outfit.color, span(-0.18, 0.18)), color2: shade(s.outfit.color2, span(-0.2, 0.2)) },
    });
};
const orient = (sh) => {
    const c = scale(sh.pts.reduce(add, [0, 0, 0]), 1 / sh.pts.length);
    const faces = sh.faces.flatMap((f) => {
        const pts = f.map((i) => sh.pts[i]);
        // a quad that is not flat (a tapered limb with an uneven cross section) becomes two triangles
        const flat = f.length < 4 || (() => {
            const n = faceNormal(pts);
            return pts.every((p) => Math.abs(dot(sub(p, pts[0]), n)) < 1e-7);
        })();
        const parts = flat ? [f] : [[f[0], f[1], f[2]], [f[0], f[2], f[3]]];
        return parts.map((g) => {
            const q = g.map((i) => sh.pts[i]);
            const fc = scale(q.reduce(add, [0, 0, 0]), 1 / q.length);
            return dot(faceNormal(q), sub(fc, c)) < 0 ? [...g].reverse() : g;
        });
    });
    return { ...sh, faces };
};
/** An elliptic, tapered tube from a to b (n sides), closed at both ends. `rx` / `rz`: radii at a and b across the figure / front-back. */
const tube = (a, b, ra, rb, color, joint, n = 8, turn = 0) => {
    const u = norm(sub(b, a));
    const ref = Math.abs(u[0]) > 0.9 ? [0, 0, 1] : [1, 0, 0];
    const X = norm(sub(ref, scale(u, dot(u, ref))));
    const Z = cross(X, u);
    const ring = (c, [rx, rz]) => Array.from({ length: n }, (_, k) => {
        const t = ((k + 0.5 + turn) / n) * Math.PI * 2;
        return add(c, add(scale(X, Math.cos(t) * rx), scale(Z, Math.sin(t) * rz)));
    });
    const pts = [...ring(a, ra), ...ring(b, rb)];
    const faces = [];
    for (let k = 0; k < n; k++)
        faces.push([k, (k + 1) % n, n + ((k + 1) % n), n + k]);
    faces.push(Array.from({ length: n }, (_, k) => k), Array.from({ length: n }, (_, k) => n + k));
    return orient({ pts, faces, color, joint });
};
/** A faceted ellipsoid (seg x rings), optionally squashed below its middle (`lower`: the lower half's y radius). */
const blob = (c, [rx, ry, rz], color, joint, seg = 8, rings = 5, lower = ry) => {
    const pts = [add(c, [0, ry, 0])];
    for (let i = 1; i < rings; i++)
        for (let j = 0; j < seg; j++) {
            const th = (Math.PI * i) / rings, ph = (2 * Math.PI * (j + 0.5)) / seg;
            const y = Math.cos(th);
            pts.push(add(c, [rx * Math.sin(th) * Math.cos(ph), (y >= 0 ? ry : lower) * y, rz * Math.sin(th) * Math.sin(ph)]));
        }
    pts.push(add(c, [0, -lower, 0]));
    const faces = [];
    const R = (i, j) => 1 + (i - 1) * seg + (j % seg);
    for (let j = 0; j < seg; j++)
        faces.push([0, R(1, j + 1), R(1, j)]);
    for (let i = 1; i < rings - 1; i++)
        for (let j = 0; j < seg; j++)
            faces.push([R(i, j), R(i, j + 1), R(i + 1, j + 1), R(i + 1, j)]);
    for (let j = 0; j < seg; j++)
        faces.push([R(rings - 1, j), R(rings - 1, j + 1), pts.length - 1]);
    return orient({ pts, faces, color, joint });
};
/** A box, optionally turned about y and then tilted about x (radians), round its centre. */
const box = (c, [hx, hy, hz], color, joint, rotY = 0, rotX = 0, taper = 1) => {
    const raw = [];
    for (const y of [-1, 1])
        for (const z of [-1, 1])
            for (const x of [-1, 1])
                raw.push([x * hx * (y > 0 ? taper : 1), y * hy, z * hz * (y > 0 ? taper : 1)]);
    const pts = raw.map(([x, y, z]) => {
        const y1 = y * Math.cos(rotX) - z * Math.sin(rotX), z1 = y * Math.sin(rotX) + z * Math.cos(rotX);
        return add(c, [x * Math.cos(rotY) + z1 * Math.sin(rotY), y1, -x * Math.sin(rotY) + z1 * Math.cos(rotY)]);
    });
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    return orient({ pts, faces, color, joint });
};
// ---------- the figure ----------
/** The figure's measures for a spec: the joints and the sizes every part is built from. */
const measures = (s) => {
    const H = s.body.height, b = s.body.build, f = s.base === 'female';
    const fat = 1 + 0.32 * b; // thickness of the limbs and the trunk
    const belly = 1 + 0.55 * Math.max(0, b) - 0.12 * Math.max(0, -b);
    const sh = (f ? 0.155 : 0.18) * H * (1 + 0.14 * s.body.shoulders) * (1 + 0.08 * b);
    const hip = (f ? 0.15 : 0.13) * H * (1 + 0.16 * b);
    const waist = (f ? 0.105 : 0.125) * H * belly;
    const chest = (f ? 0.125 : 0.145) * H * (1 + 0.12 * b) * (1 + 0.06 * s.body.shoulders);
    const depth = 0.075 * H * fat; // the trunk's half depth
    const armR = 0.026 * H * fat, legR = 0.042 * H * fat;
    const head = s.body.head;
    const hr = 0.1 * H * head; // the cranium's radius (a big, readable head)
    const y = (k) => k * H;
    const armX = Math.max(sh + armR * 0.2, hip + armR * 1.35, waist + armR * 1.5); // arms hang clear of the hips
    const legX = Math.min(hip * 0.55, 0.07 * H);
    const J = {
        root: [0, y(0.52), 0],
        spine: [0, y(0.63), -0.005 * H],
        head: [0, y(0.835), 0],
        shoulderL: [sh * 0.86, y(0.795), 0],
        elbowL: [armX + 0.012 * H, y(0.62), -0.01 * H],
        wristL: [armX + 0.024 * H, y(0.465), 0.005 * H],
        hipL: [legX, y(0.5), 0],
        kneeL: [legX * 0.95, y(0.275), 0.01 * H],
        ankleL: [legX * 0.92, y(0.048), 0],
    };
    for (const n of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']) {
        const p = J[`${n}L`];
        J[`${n}R`] = [-p[0], p[1], p[2]];
    }
    return { H, f, fat, sh, hip, waist, chest, depth, armR, legR, hr, J, y };
};
const SIDES = [['L', 1], ['R', -1]];
/** The body: trunk, neck, head with its face, arms with hands, legs with feet; every segment on its joint. */
const bodyShells = (s, m) => {
    const { H, f, sh, hip, waist, chest, depth, armR, legR, hr, J, y } = m;
    const skin = s.face.skin;
    const out = [];
    // trunk: pelvis (root), belly and chest (spine), the shoulder line
    out.push(tube([0, y(0.455), 0], [0, y(0.6), 0], [hip, depth * 0.95], [waist, depth], skin, 'root'));
    out.push(tube([0, y(0.58), 0], [0, y(0.81), 0], [waist, depth * (1 + 0.25 * Math.max(0, s.body.build))], [chest, depth * 0.9], skin, 'spine'));
    out.push(blob([0, y(0.79), 0], [sh, 0.03 * H, depth * 0.85], skin, 'spine', 8, 4));
    if (f)
        for (const [, sd] of SIDES)
            out.push(blob([sd * chest * 0.42, y(0.725), depth * 0.72], [chest * 0.36, 0.045 * H, 0.04 * H], skin, 'spine', 6, 4));
    // neck and head
    out.push(tube([0, y(0.8), 0], [0, y(0.86), 0.004 * H], [0.03 * H, 0.032 * H], [0.027 * H, 0.03 * H], skin, 'spine', 6));
    out.push(...headShells(s, m));
    // arms: shoulder ball, upper arm, elbow ball, forearm, hand
    for (const [n, sd] of SIDES) {
        const S = J[`shoulder${n}`], E = J[`elbow${n}`], W = J[`wrist${n}`];
        out.push(blob(S, [armR * 1.35, armR * 1.3, armR * 1.25], skin, `shoulder${n}`, 6, 4));
        out.push(tube(S, E, [armR * 1.2, armR * 1.15], [armR * 0.95, armR * 0.95], skin, `shoulder${n}`, 6));
        out.push(blob(E, [armR * 0.95, armR * 0.95, armR * 0.95], skin, `elbow${n}`, 6, 4));
        out.push(tube(E, W, [armR * 0.95, armR * 0.95], [armR * 0.7, armR * 0.75], skin, `elbow${n}`, 6));
        // the hand: a mitten, the thumb forward
        const hand = add(W, [sd * 0.004 * H, -0.04 * H, 0.004 * H]);
        out.push(box(hand, [armR * 0.55, 0.042 * H, armR * 1.05], skin, `wrist${n}`, 0, 0, 0.95));
        out.push(box(add(W, [sd * 0.002 * H, -0.03 * H, armR * 1.1]), [armR * 0.35, 0.022 * H, armR * 0.4], skin, `wrist${n}`, 0, -0.35));
    }
    // legs: hip ball, thigh, knee ball, shin, foot
    for (const [n] of SIDES) {
        const P = J[`hip${n}`], K = J[`knee${n}`], A = J[`ankle${n}`];
        out.push(blob(P, [legR * 1.25, legR * 1.2, legR * 1.15], skin, `hip${n}`, 6, 4));
        out.push(tube(P, K, [legR * 1.15, legR * 1.15], [legR * 0.8, legR * 0.85], skin, `hip${n}`, 7));
        out.push(blob(K, [legR * 0.82, legR * 0.82, legR * 0.85], skin, `knee${n}`, 6, 4));
        out.push(tube(K, A, [legR * 0.8, legR * 0.85], [legR * 0.5, legR * 0.55], skin, `knee${n}`, 7));
        out.push(box(add(A, [0, -0.022 * H, 0.03 * H]), [legR * 0.62, 0.026 * H, 0.07 * H], '#2b2620', `ankle${n}`, 0, 0, 0.9));
    }
    return out;
};
/** The head: cranium, jaw (by face shape and the jaw slider), nose, eyes, brows, ears, mouth. */
const headShells = (s, m) => {
    const { H, hr, y } = m;
    const skin = s.face.skin;
    const dark = '#1c1714', lip = shade(skin, -0.25), brow = s.hair.style === 'bald' ? shade(skin, -0.35) : s.hair.color;
    const shape = s.face.shape;
    const wide = { oval: 0.92, round: 1.04, square: 1.0, long: 0.88 }[shape];
    const tall = { oval: 1.06, round: 0.98, square: 1.0, long: 1.16 }[shape];
    const cy = y(0.835) + hr * 1.12 * tall; // the cranium's middle
    const out = [];
    out.push(blob([0, cy, 0], [hr * wide, hr * tall, hr * 0.98], skin, 'head', 10, 6, hr * tall * 0.92));
    // the jaw: a tapered block under the front of the cranium, wider with the slider and a square face
    const jw = hr * wide * (0.62 + 0.18 * s.face.jaw + (shape === 'square' ? 0.14 : shape === 'round' ? 0.06 : 0)) * (s.base === 'male' ? 1.05 : 0.95);
    const jawTop = cy - hr * tall * 0.15, jawLow = cy - hr * tall * (shape === 'long' ? 1.05 : 0.95);
    const jawZ = hr * 0.18;
    out.push(tube([0, jawLow, jawZ], [0, jawTop, 0.02 * hr], [jw * (shape === 'square' ? 0.8 : shape === 'oval' || shape === 'long' ? 0.5 : 0.62), hr * 0.5], [jw, hr * 0.78], skin, 'head', 8));
    // the face's front is at z ~ hr; features sit on it
    const fz = hr * 0.93;
    const eyeY = cy - hr * 0.05, eyeX = hr * 0.36 * wide;
    for (const sd of [1, -1]) {
        out.push(box([sd * eyeX, eyeY, fz], [hr * 0.13, hr * 0.1, hr * 0.06], dark, 'head'));
        out.push(box([sd * eyeX * 1.02, eyeY + hr * 0.22, fz + hr * 0.02], [hr * 0.18, hr * 0.045, hr * 0.06], brow, 'head', 0, 0, 0.95));
        out.push(box([sd * hr * wide * 0.99, cy - hr * 0.08, -hr * 0.05], [hr * 0.07, hr * 0.17, hr * 0.12], shade(skin, -0.06), 'head'));
    }
    const nose = 0.75 + 0.5 * s.face.nose;
    out.push(box([0, eyeY - hr * 0.2 * nose, fz + hr * 0.07 * nose], [hr * 0.09 * nose, hr * 0.2 * nose, hr * 0.12 * nose], shade(skin, -0.08), 'head', 0, 0.35, 0.6));
    out.push(box([0, eyeY - hr * 0.55, fz - hr * 0.05], [hr * 0.2, hr * 0.035, hr * 0.06], lip, 'head'));
    return out;
};
/** Hair on the cranium (short, curly, bun; bald: none). */
const hairShells = (s, m) => {
    if (s.hair.style === 'bald')
        return [];
    const { hr, y } = m;
    const tall = { oval: 1.06, round: 0.98, square: 1.0, long: 1.16 }[s.face.shape];
    const wide = { oval: 0.92, round: 1.04, square: 1.0, long: 0.88 }[s.face.shape];
    const cy = y(0.835) + hr * 1.12 * tall;
    const c = s.hair.color;
    const out = [];
    // a cap over the top and the back of the head (the face stays free)
    const cap = blob([0, cy + hr * 0.12, -hr * 0.12], [hr * wide * 1.08, hr * tall * 0.95, hr * 1.04], c, 'head', 10, 6, hr * tall * 0.55);
    if (s.hair.style === 'short') {
        out.push(cap);
        out.push(box([0, cy + hr * 0.5 * tall, hr * 0.62], [hr * wide * 0.7, hr * 0.16, hr * 0.28], c, 'head', 0, -0.25));
    }
    else if (s.hair.style === 'bun') {
        out.push(blob([0, cy + hr * 0.08, -hr * 0.08], [hr * wide * 1.05, hr * tall * 0.98, hr * 1.02], c, 'head', 10, 6, hr * tall * 0.5));
        out.push(blob([0, cy + hr * 0.75 * tall, -hr * 0.55], [hr * 0.45, hr * 0.42, hr * 0.45], c, 'head', 8, 5));
        out.push(tube([0, cy + hr * 0.45, -hr * 0.62], [0, cy + hr * 0.6, -hr * 0.62], [hr * 0.3, hr * 0.3], [hr * 0.28, hr * 0.28], shade(c, 0.25), 'head', 8));
    }
    else {
        // curly: a cloud of puffs round the top and the back, placed by the seed
        const r = rng(s.seed * 7919 + 13);
        out.push(blob([0, cy + hr * 0.1, -hr * 0.1], [hr * wide * 1.06, hr * tall * 0.96, hr * 1.02], c, 'head', 8, 5, hr * tall * 0.6));
        for (let k = 0; k < 16; k++) {
            const a = r() * Math.PI * 2, up = 0.15 + r() * 0.85;
            const dir = [Math.cos(a) * Math.sqrt(1 - up * up), up, Math.sin(a) * Math.sqrt(1 - up * up)];
            if (dir[2] > 0.45 && dir[1] < 0.75)
                dir[2] = -dir[2] * 0.5; // keep the face free
            const rr = hr * (0.3 + r() * 0.16);
            out.push(blob(add([0, cy + hr * 0.12, -hr * 0.1], scale([dir[0] * wide, dir[1] * tall, dir[2]], hr * 1.02)), [rr, rr, rr], shade(c, (r() - 0.5) * 0.18), 'head', 6, 4));
        }
    }
    return out;
};
const beardShells = (s, m) => {
    if (s.beard === 'none')
        return [];
    const { hr, y } = m;
    const tall = { oval: 1.06, round: 0.98, square: 1.0, long: 1.16 }[s.face.shape];
    const wide = { oval: 0.92, round: 1.04, square: 1.0, long: 0.88 }[s.face.shape];
    const cy = y(0.835) + hr * 1.12 * tall;
    const c = s.hair.color === '#dcdcdc' || s.hair.color === '#9a9a9a' ? s.hair.color : shade(s.hair.color, 0.08);
    if (s.beard === 'goatee')
        return [box([0, cy - hr * 0.86 * tall, hr * 0.62], [hr * 0.2, hr * 0.17, hr * 0.2], c, 'head', 0, 0.2, 0.8)];
    // full: round the jaw and the chin, and a moustache
    return [
        tube([0, cy - hr * tall * 1.12, hr * 0.32], [0, cy - hr * 0.25, hr * 0.12], [hr * wide * 0.62, hr * 0.62], [hr * wide * 0.98, hr * 0.86], c, 'head', 8),
        box([0, cy - hr * 0.42, hr * 0.95], [hr * 0.3, hr * 0.06, hr * 0.08], c, 'head', 0, 0, 0.8),
    ];
};
const glassesShells = (s, m) => {
    if (!s.glasses)
        return [];
    const { hr, y } = m;
    const tall = { oval: 1.06, round: 0.98, square: 1.0, long: 1.16 }[s.face.shape];
    const wide = { oval: 0.92, round: 1.04, square: 1.0, long: 0.88 }[s.face.shape];
    const cy = y(0.835) + hr * 1.12 * tall;
    const eyeY = cy - hr * 0.05, eyeX = hr * 0.36 * wide, fz = hr * 1.02;
    const frame = '#141414', lens = '#9fc6d8';
    const out = [];
    for (const sd of [1, -1]) {
        out.push(box([sd * eyeX, eyeY, fz], [hr * 0.22, hr * 0.16, hr * 0.025], frame, 'head'));
        out.push(box([sd * eyeX, eyeY, fz + hr * 0.02], [hr * 0.17, hr * 0.11, hr * 0.012], lens, 'head'));
        out.push(box([sd * hr * wide * 0.98, eyeY + hr * 0.02, hr * 0.45], [hr * 0.025, hr * 0.03, hr * 0.55], frame, 'head'));
    }
    out.push(box([0, eyeY + hr * 0.04, fz], [hr * 0.1, hr * 0.03, hr * 0.025], frame, 'head'));
    return out;
};
/**
 * The outfit: the body's segments again, a little bigger, on the same joints. coat: a long coat with sleeves and tails on the
 * thighs, trousers (color2); overall: bib trousers with straps (color) over a t-shirt (color2), boots; workwear: a jacket
 * (color), trousers (color2) with knee pads, boots.
 */
const outfitShells = (s, m) => {
    const { H, f, sh, hip, waist, chest, depth, armR, legR, J, y } = m;
    const { kind, color, color2 } = s.outfit;
    const k = 1.12; // how much bigger the cloth is than the body under it
    const out = [];
    const trunkTop = (c, upTo = 0.815, wide = 1) => {
        out.push(tube([0, y(0.58), 0], [0, y(upTo), 0], [waist * k * wide, depth * k * (1 + 0.25 * Math.max(0, s.body.build))], [chest * k * wide, depth * 0.9 * k], c, 'spine'));
        out.push(blob([0, y(0.79), 0], [sh * 1.06, 0.034 * H, depth * 0.9 * k], c, 'spine', 8, 4));
        if (f)
            for (const [, sd] of SIDES)
                out.push(blob([sd * chest * 0.42, y(0.725), depth * 0.74], [chest * 0.4, 0.05 * H, 0.046 * H], c, 'spine', 6, 4));
    };
    const pelvis = (c) => out.push(tube([0, y(0.445), 0], [0, y(0.605), 0], [hip * k, depth * 0.95 * k], [waist * k, depth * k], c, 'root'));
    const sleeves = (c, long) => {
        for (const [n] of SIDES) {
            const S = J[`shoulder${n}`], E = J[`elbow${n}`], W = J[`wrist${n}`];
            out.push(blob(S, [armR * 1.5, armR * 1.45, armR * 1.4], c, `shoulder${n}`, 6, 4));
            out.push(tube(S, long ? E : add(S, scale(sub(E, S), 0.55)), [armR * 1.32, armR * 1.28], [armR * 1.12, armR * 1.12], c, `shoulder${n}`, 6));
            if (long) {
                out.push(blob(E, [armR * 1.1, armR * 1.1, armR * 1.1], c, `elbow${n}`, 6, 4));
                out.push(tube(E, add(E, scale(sub(W, E), 0.92)), [armR * 1.1, armR * 1.1], [armR * 0.92, armR * 0.95], c, `elbow${n}`, 6));
            }
        }
    };
    const trousers = (c, pads = false) => {
        pelvis(c);
        for (const [n] of SIDES) {
            const P = J[`hip${n}`], K = J[`knee${n}`], A = J[`ankle${n}`];
            out.push(blob(P, [legR * 1.38, legR * 1.32, legR * 1.28], c, `hip${n}`, 6, 4));
            out.push(tube(P, K, [legR * 1.28, legR * 1.28], [legR * 0.95, legR * 1.0], c, `hip${n}`, 7));
            out.push(blob(K, [legR * 0.97, legR * 0.97, legR * 1.0], c, `knee${n}`, 6, 4));
            out.push(tube(K, add(A, [0, 0.03 * H, 0]), [legR * 0.95, legR * 1.0], [legR * 0.75, legR * 0.78], c, `knee${n}`, 7));
            if (pads)
                out.push(box(add(K, [0, 0, legR * 0.95]), [legR * 0.6, legR * 0.7, legR * 0.18], shade(c, -0.3), `knee${n}`));
        }
    };
    const boots = (c) => {
        for (const [n] of SIDES) {
            const A = J[`ankle${n}`];
            out.push(box(add(A, [0, -0.018 * H, 0.03 * H]), [legR * 0.72, 0.032 * H, 0.078 * H], c, `ankle${n}`, 0, 0, 0.92));
            out.push(tube(add(A, [0, -0.01 * H, 0]), add(A, [0, 0.05 * H, 0]), [legR * 0.72, legR * 0.75], [legR * 0.68, legR * 0.7], c, `ankle${n}`, 7));
        }
    };
    if (kind === 'coat') {
        trunkTop(color, 0.82, 1.04);
        pelvis(color);
        sleeves(color, true);
        trousers(color2);
        // the tails: a panel in front of each thigh, on the hip, down to the knee; a collar
        for (const [n, sd] of SIDES) {
            const P = J[`hip${n}`];
            out.push(box([P[0] + sd * legR * 0.3, y(0.36), legR * 0.55], [legR * 1.45, y(0.12), legR * 0.75], color, `hip${n}`, 0, 0, 1.08));
            out.push(box([P[0] + sd * legR * 0.2, y(0.36), -legR * 0.5], [legR * 1.4, y(0.12), legR * 0.75], color, `hip${n}`, 0, 0, 1.08));
            out.push(box([sd * chest * 0.32, y(0.79), depth * 0.9], [chest * 0.22, 0.04 * H, 0.012 * H], shade(color, -0.08), 'spine', 0, -0.2));
        }
        out.push(box([0, y(0.6), depth * 1.12], [0.004 * H, y(0.13), 0.004 * H], shade(color, -0.2), 'spine'));
        boots('#2b2620');
    }
    else if (kind === 'overall') {
        // the t-shirt under the bib
        trunkTop(color2, 0.815, 1.0);
        sleeves(color2, false);
        trousers(color);
        // the bib: front and back panels on the chest, the straps over the shoulders, a pocket, buttons
        out.push(box([0, y(0.68), depth * 1.08], [chest * 0.62, y(0.085), 0.012 * H], color, 'spine', 0, -0.06, 0.9));
        out.push(box([0, y(0.68), -depth * 1.06], [chest * 0.66, y(0.085), 0.012 * H], color, 'spine', 0, 0.04, 0.9));
        for (const [, sd] of SIDES) {
            out.push(box([sd * chest * 0.45, y(0.79), 0], [0.02 * H, 0.012 * H, depth * 1.12], color, 'spine'));
            out.push(box([sd * chest * 0.45, y(0.765), depth * 1.12], [0.016 * H, 0.012 * H, 0.008 * H], '#d4b25a', 'spine'));
        }
        out.push(box([0, y(0.66), depth * 1.12], [chest * 0.25, y(0.03), 0.008 * H], shade(color, -0.18), 'spine'));
        out.push(box([0, y(0.6), 0], [waist * k * 1.04, 0.012 * H, depth * k * (1 + 0.25 * Math.max(0, s.body.build)) * 1.02], shade(color, -0.25), 'root'));
        boots('#3a2a1e');
    }
    else {
        trunkTop(color, 0.815, 1.02);
        pelvis(color2);
        sleeves(color, true);
        trousers(color2, true);
        // rolled cuffs, a belt, a chest pocket
        for (const [n] of SIDES)
            out.push(tube(add(J[`elbow${n}`], scale(sub(J[`wrist${n}`], J[`elbow${n}`]), 0.3)), add(J[`elbow${n}`], scale(sub(J[`wrist${n}`], J[`elbow${n}`]), 0.45)), [armR * 1.22, armR * 1.22], [armR * 1.18, armR * 1.18], shade(color, -0.15), `elbow${n}`, 6));
        out.push(tube([0, y(0.585), 0], [0, y(0.61), 0], [waist * k * 1.06, depth * k * 1.06 * (1 + 0.25 * Math.max(0, s.body.build))], [waist * k * 1.06, depth * k * 1.06 * (1 + 0.25 * Math.max(0, s.body.build))], '#2a211a', 'root', 8));
        out.push(box([chest * 0.4, y(0.73), depth * 0.98], [chest * 0.2, y(0.03), 0.01 * H], shade(color, -0.15), 'spine'));
        boots('#3a2a1e');
    }
    return out;
};
/** The prop in the right hand (-x side): held at the wrist joint, hanging with the hand in the bind pose. */
const propShells = (s, m) => {
    const { H, armR, J } = m;
    const W = J.wristR;
    const hand = add(W, [-0.004 * H, -0.05 * H, 0.004 * H]);
    if (s.prop === 'tablet') {
        // held flat in front of the hand, the screen up, like a clipboard
        return [
            box(add(hand, [0.01 * H, 0.0, armR * 1.6]), [0.06 * H, 0.085 * H, 0.006 * H], '#2b2d33', 'wristR', -0.25, 0),
            box(add(hand, [0.0096 * H, 0.0, armR * 1.6 + 0.0068 * H]), [0.052 * H, 0.075 * H, 0.0012 * H], '#5fc8e8', 'wristR', -0.25, 0),
        ];
    }
    if (s.prop === 'wrench') {
        // the handle in the fist pointing down and forward, the open jaw at the end
        const c = '#b8bcc4', d = '#8a9098';
        return [
            box(add(hand, [0, -0.02 * H, 0.02 * H]), [0.008 * H, 0.09 * H, 0.016 * H], c, 'wristR', 0, -0.35),
            box(add(hand, [0, -0.105 * H, 0.055 * H]), [0.011 * H, 0.02 * H, 0.034 * H], d, 'wristR', 0, -0.35),
            box(add(hand, [0, -0.125 * H, 0.085 * H]), [0.011 * H, 0.012 * H, 0.012 * H], d, 'wristR', 0, -0.35),
            box(add(hand, [0, -0.13 * H, 0.04 * H]), [0.011 * H, 0.012 * H, 0.012 * H], d, 'wristR', 0, -0.35),
        ];
    }
    if (s.prop === 'tomato') {
        const t = add(hand, [0, -0.015 * H, armR * 1.4]);
        return [
            blob(t, [0.034 * H, 0.03 * H, 0.034 * H], '#d8342a', 'wristR', 8, 5),
            box(add(t, [0, 0.032 * H, 0]), [0.012 * H, 0.004 * H, 0.012 * H], '#3f8a2e', 'wristR', 0.6),
            box(add(t, [0, 0.038 * H, 0]), [0.003 * H, 0.008 * H, 0.003 * H], '#3f8a2e', 'wristR'),
        ];
    }
    return [];
};
const r5 = (v) => Math.round(v * 1e5) / 1e5;
/**
 * The figure of a spec: its parts (stable ids, in CHARACTER_PARTS order, the empty ones left out) and its rig (the humanoid
 * joints, every point on one joint). Use the rig with posed() / boneMatrices() / walkPose() / HUMANOID_POSES.
 */
export const buildCharacter = (input) => {
    const spec = normalizeCharacter(input);
    const m = measures(spec);
    const groups = [
        ['body', bodyShells(spec, m)],
        ['outfit', outfitShells(spec, m)],
        ['hair', hairShells(spec, m)],
        ['beard', beardShells(spec, m)],
        ['glasses', glassesShells(spec, m)],
        ['prop', propShells(spec, m)],
    ];
    const joints = HUMANOID_JOINTS.map((name) => {
        const parent = name === 'root' ? null : name === 'spine' || name.startsWith('hip') ? 'root' : name === 'head' || name.startsWith('shoulder') ? 'spine' : name.startsWith('elbow') ? `shoulder${name.slice(-1)}` : name.startsWith('wrist') ? `elbow${name.slice(-1)}` : name.startsWith('knee') ? `hip${name.slice(-1)}` : `knee${name.slice(-1)}`;
        return { name, parent, at: m.J[name].map(r5) };
    });
    const id = Object.fromEntries(joints.map((j, i) => [j.name, i]));
    const parts = [];
    const skin = [];
    for (const [pid, shells] of groups) {
        if (!shells.length)
            continue;
        const positions = [];
        const faces = [];
        const w = [];
        for (const sh of shells) {
            const o = positions.length;
            positions.push(...sh.pts.map((p) => p.map(r5)));
            for (const f of sh.faces)
                faces.push({ v: f.map((i) => i + o), color: sh.color });
            for (let k = 0; k < sh.pts.length; k++)
                w.push([[id[sh.joint], 1]]);
        }
        parts.push({ id: pid, mesh: { positions, faces } });
        skin.push(w);
    }
    return { spec, parts, rig: { joints, skin }, height: m.H };
};

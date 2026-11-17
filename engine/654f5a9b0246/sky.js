// A sky catalogue (format '3draft-sky'): the easy way to make a space scene. A list of stars, planets, moons, black holes and
// galaxies, in the units astronomers use (RA / Dec / distance, parallax, AU, solar and Earth radii, spectral classes, K), that
// `skyScene` turns into a viewer scene ('3draft-scene' v2): the same prototypes, materials and conventions as the deep sky
// scene, so everything (the planet shader, the galaxy recipes, the black hole tracer, the glows, the find box's categories)
// works on it. The MCP tool view_sky sends one to the open viewer; the viewer also opens such a file (f↑). Docs: app/sky.md.
//
// The scene's frame: 1 unit = 1 light year, the Sun at the origin, equatorial coordinates with z up turned to the viewer's
// y-up frame as [x, z, -y] (like every star scene).
export const LY_PER_PC = 3.26156;
export const LY_PER_AU = 1.58125074e-5;
export const LY_PER_KM = 1 / 9.4607304725808e12;
export const SUN_RADIUS_LY = 696340 * LY_PER_KM;
export const EARTH_RADIUS_LY = 6371 * LY_PER_KM;
const UNITS = { ly: 1, pc: LY_PER_PC, kpc: LY_PER_PC * 1e3, mpc: LY_PER_PC * 1e6, au: LY_PER_AU, km: LY_PER_KM, kly: 1e3, mly: 1e6, gly: 1e9 };
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const sig = (v, d = 6) => Number(v.toPrecision(d));
const fine = (v) => Number(v.toPrecision(14));
const hash = (s) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 2166136261);
// ---- the prototypes (the same meshes as examples/stars.js: PLAIN.star and GALAXY_PROTOS; a test keeps them equal)
const sphere = (r, seg, rings, mat) => {
    const positions = [[0, r, 0]];
    for (let i = 1; i < rings; i++)
        for (let j = 0; j < seg; j++) {
            const th = (Math.PI * i) / rings, ph = (2 * Math.PI * j) / seg;
            positions.push([r * Math.sin(th) * Math.sin(ph), r * Math.cos(th), r * Math.sin(th) * Math.cos(ph)]);
        }
    positions.push([0, -r, 0]);
    const faces = [];
    const f = (a, b, c) => faces.push({ v: [a, b, c], mat });
    const R = (i, j) => 1 + (i - 1) * seg + (j % seg);
    for (let j = 0; j < seg; j++)
        f(0, R(1, j), R(1, j + 1));
    for (let i = 1; i < rings - 1; i++)
        for (let j = 0; j < seg; j++)
            (f(R(i, j), R(i + 1, j + 1), R(i, j + 1)), f(R(i, j), R(i + 1, j), R(i + 1, j + 1)));
    for (let j = 0; j < seg; j++)
        f(R(rings - 1, j), positions.length - 1, R(rings - 1, j + 1));
    return { positions, faces };
};
const round4 = (m, k = 1) => ({ ...m, positions: m.positions.map((p) => p.map((v) => Math.round(v * k * 1e4) / 1e4)) });
const disc = (inner, n, mat, t = 0.03) => {
    const positions = [], faces = [];
    const ang = (j) => (2 * Math.PI * j) / n;
    const mid = (1 + inner) / 2;
    for (let j = 0; j < n; j++) {
        const a = ang(j), s = Math.sin(a), c = Math.cos(a);
        positions.push([s, 0, c], [mid * s, t, mid * c], [inner * s, 0, inner * c], [mid * s, -t, mid * c]);
    }
    const V = (j, w) => 4 * (j % n) + w;
    for (let j = 0; j < n; j++)
        for (let w = 0; w < 4; w++) {
            const w2 = (w + 1) % 4, a = V(j, w), b = V(j + 1, w), c = V(j + 1, w2), d = V(j, w2);
            faces.push({ v: [a, b, c], mat }, { v: [a, c, d], mat });
        }
    return { positions, faces };
};
const join = (...ms) => { const positions = [], faces = []; for (const m of ms) {
    const o = positions.length;
    positions.push(...m.positions);
    faces.push(...m.faces.map((f) => ({ ...f, v: f.v.map((i) => i + o) })));
} return round4({ positions, faces }); };
let protos = null;
/** The sky prototypes: star (a plain sphere, the glow is a sprite), planet (3 % smaller: the planet shader's sphere covers it), ghost (a galaxy's stand-in), hole (a black hole's ball and disc). */
export const skyPrototypes = () => {
    if (protos)
        return protos;
    const star = { halo: false, lods: [[64, 32], [32, 16], [16, 8], [8, 4], [4, 2]].map(([s, r]) => round4(sphere(1, s, r, 'core'))) };
    const planet = { ...star, lods: star.lods.map((m) => ({ ...m, positions: m.positions.map((q) => q.map((v) => Math.round(v * 0.97 * 1e5) / 1e5)) })) };
    const ghost = { halo: false, lods: [round4({ ...sphere(1, 8, 4, 'core'), positions: sphere(1, 8, 4, 'core').positions.map(([a, b, c]) => [a, b * 0.75, c]) })] };
    const hole = { halo: false, lods: [[32, 16, 48], [16, 8, 24], [8, 4, 16], [6, 3, 8]].map(([sg, rg, n]) => join(sphere(1, sg, rg, 'core'), (() => { const d = disc(0.35, n, 'disc'); return { ...d, positions: d.positions.map((p) => p.map((v) => v * 4.5)) }; })())) };
    return (protos = { star, planet, ghost, hole });
};
// ---- stars: the spectral class decides the material (star-O … star-L, star-D white dwarf, star-X unknown), the temperature the tint
export const STAR_CLASSES = {
    O: ['#9bb0ff', 1.0], B: ['#aabfff', 1.0], A: ['#cad7ff', 0.95], F: ['#f8f7ff', 0.9], G: ['#fff4ea', 0.85],
    K: ['#ffd2a1', 0.8], M: ['#ffb067', 0.75], D: ['#e8eeff', 0.9], L: ['#c46a3a', 0.4], X: ['#ffcf9a', 0.6],
};
const TYPICAL_T = { O: 4e4, B: 2e4, A: 9e3, F: 6.8e3, G: 5.7e3, K: 4.5e3, M: 3.3e3, D: 1.2e4, L: 2e3, X: 5e3 };
const TYPICAL_L = { O: 1e5, B: 800, A: 20, F: 3, G: 1, K: 0.3, M: 0.02, D: 0.003, L: 1e-4, X: 1 };
export const starClass = (spect, temp) => {
    if (spect) {
        if (/^\s*(D|WD)/i.test(spect))
            return 'D';
        const m = /[OBAFGKMLTY]/i.exec(spect.replace(/^\s*(sd|d)/i, ''));
        if (m)
            return /[TY]/i.test(m[0]) ? 'L' : m[0].toUpperCase();
    }
    if (temp)
        return temp > 30000 ? 'O' : temp > 10000 ? 'B' : temp > 7500 ? 'A' : temp > 6000 ? 'F' : temp > 5200 ? 'G' : temp > 3700 ? 'K' : temp > 2400 ? 'M' : 'L';
    return 'X';
};
/** a blackbody-ish tint for a temperature (K) */
export const starTint = (t) => {
    const u = (Math.log(Math.min(40000, Math.max(2500, t))) - Math.log(2500)) / (Math.log(40000) - Math.log(2500));
    const stops = [[0, [255, 150, 70]], [0.3, [255, 205, 150]], [0.5, [255, 244, 234]], [0.7, [220, 228, 255]], [1, [155, 176, 255]]];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++)
        if (u >= stops[i][0] && u <= stops[i + 1][0])
            (a = stops[i], b = stops[i + 1]);
    const w = (u - a[0]) / (b[0] - a[0] || 1);
    return '#' + a[1].map((x, i) => Math.round(x + (b[1][i] - x) * w).toString(16).padStart(2, '0')).join('');
};
// ---- planets: the 30 surface recipes of the exoplanets, by class (size and warmth); examples/exoplanets.js uses them too
const ring = { inner: 1.3, outer: 2.3, color: '#cdbb98' };
export const EXO_RECIPES = [
    ['rock-lava', { kind: 'lava', colors: ['#2a201c', '#4a3a30', '#ff6a1a'] }],
    ['rock-lava', { kind: 'lava', colors: ['#3a2a22', '#5c4637', '#ffd25a'] }],
    ['rock-hot', { kind: 'rock', colors: ['#6e6258', '#9a8a7a', '#3e3530'] }],
    ['rock-hot', { kind: 'cloud', colors: ['#e3c67c', '#f3e2b0', '#b8913c'], atmosphere: { color: '#f2d08a', size: 0.03 } }],
    ['rock-hot', { kind: 'cloud', colors: ['#d8925a', '#f0c08a', '#9c5a30'], atmosphere: { color: '#f0a86a', size: 0.03 } }],
    ['rock-warm', { kind: 'rock', colors: ['#b08a5c', '#d6b88a', '#7a5a3a'], atmosphere: { color: '#e8c89a', size: 0.012 } }],
    ['rock-warm', { kind: 'cloud', colors: ['#e9dcc0', '#f7f0de', '#c8b48c'], atmosphere: { color: '#f5e8c8', size: 0.025 } }],
    ['rock-temp', { kind: 'earth', colors: ['#1f528f', '#4f7f3a', '#b79a66'], detail: 0.53, atmosphere: { color: '#7fb2ff', size: 0.02 } }],
    ['rock-temp', { kind: 'earth', colors: ['#174a86', '#3e7a46', '#9a8a5a'], detail: 0.7, atmosphere: { color: '#8fc0ff', size: 0.022 } }],
    ['rock-temp', { kind: 'earth', colors: ['#2d5a7a', '#8a7a4a', '#c8a066'], detail: 0.38, atmosphere: { color: '#c0c8ff', size: 0.018 } }],
    ['rock-cold', { kind: 'rock', colors: ['#a5502e', '#c88060', '#6e3420'], detail: 0.1, atmosphere: { color: '#e8a07a', size: 0.01 } }],
    ['rock-cold', { kind: 'rock', colors: ['#8a8c90', '#b8bcc2', '#5c5e62'], detail: 0.18 }],
    ['rock-froz', { kind: 'rock', colors: ['#c8d4e0', '#eef4fa', '#8a9cb0'], detail: 0.3 }],
    ['sub-hot', { kind: 'cloud', colors: ['#a8683a', '#d29a62', '#6a3a20'], atmosphere: { color: '#e09a60', size: 0.04 } }],
    ['sub-hot', { kind: 'cloud', colors: ['#b8b4ac', '#e2ded6', '#8a8680'], atmosphere: { color: '#d8d4cc', size: 0.04 } }],
    ['sub-warm', { kind: 'cloud', colors: ['#cdb894', '#ece0c4', '#9a8664'], atmosphere: { color: '#e8dcc0', size: 0.035 } }],
    ['sub-warm', { kind: 'earth', colors: ['#2e6a9a', '#7a9aa8', '#a8b8c0'], detail: 0.88, atmosphere: { color: '#a8d0ff', size: 0.03 } }],
    ['sub-temp', { kind: 'earth', colors: ['#1e7a8a', '#3a8a7a', '#6aa89a'], detail: 0.94, atmosphere: { color: '#9ae8ff', size: 0.035 } }],
    ['sub-cold', { kind: 'ice', colors: ['#b8dce8', '#d8eef4', '#90bccc'], detail: 4, atmosphere: { color: '#d0f0ff', size: 0.03 } }],
    ['nep-hot', { kind: 'gas', colors: ['#3e5a5a', '#6a8a7a', '#2a3a3a'], detail: 7, atmosphere: { color: '#8ab8a8', size: 0.025 } }],
    ['nep-warm', { kind: 'ice', colors: ['#62b8c8', '#90d8e2', '#3a8a9a'], detail: 5, atmosphere: { color: '#a8eef8', size: 0.025 } }],
    ['nep-cold', { kind: 'ice', colors: ['#3f63d0', '#6f92ee', '#22409c'], detail: 5, atmosphere: { color: '#9fb8ff', size: 0.02 } }],
    ['jup-lava', { kind: 'gas', colors: ['#2a1a16', '#5a2a1e', '#ff5a20'], detail: 9, spot: true, atmosphere: { color: '#ff7a3a', size: 0.02 } }],
    ['jup-lava', { kind: 'gas', colors: ['#3a1e14', '#7a3a22', '#d0402a'], detail: 12, atmosphere: { color: '#e06a3a', size: 0.02 } }],
    ['jup-hot', { kind: 'gas', colors: ['#5a3e2a', '#8a6a4a', '#3a261a'], detail: 11, atmosphere: { color: '#b88a5a', size: 0.015 } }],
    ['jup-warm', { kind: 'gas', colors: ['#b98d62', '#efe2c8', '#c0603a'], detail: 14, spot: true }],
    ['jup-temp', { kind: 'gas', colors: ['#e2dccc', '#f8f4ea', '#b8ae98'], detail: 12, atmosphere: { color: '#f0f0ff', size: 0.012 } }],
    ['jup-temp', { kind: 'gas', colors: ['#bccad8', '#e6eef6', '#8a9cb0'], detail: 10 }],
    ['jup-cold', { kind: 'gas', colors: ['#cfb27a', '#efe0b5', '#b8975c'], detail: 10, ring }],
    ['jup-cold', { kind: 'gas', colors: ['#a8b8cc', '#d8e2ee', '#7a8ca8'], detail: 8, atmosphere: { color: '#c8d8ff', size: 0.012 } }],
];
const FALLBACK = { 'sub-lava': 'sub-hot', 'sub-froz': 'sub-cold', 'nep-lava': 'nep-hot', 'nep-temp': 'nep-warm', 'nep-froz': 'nep-cold', 'jup-froz': 'jup-cold' };
/** a planet's class: size (rock < 1.6 Earth radii, sub < 4, nep < 8, jup) and warmth (lava > 1200 K, hot > 700, warm > 350, temp > 200, cold > 100, froz) */
export const exoClass = (rE, teq) => {
    const size = rE < 1.6 ? 'rock' : rE < 4 ? 'sub' : rE < 8 ? 'nep' : 'jup';
    const heat = teq > 1200 ? 'lava' : teq > 700 ? 'hot' : teq > 350 ? 'warm' : teq > 200 ? 'temp' : teq > 100 ? 'cold' : 'froz';
    return `${size}-${heat}`;
};
/** the recipe of a planet of that size and warmth (a variant of its class by the name) */
export const exoRecipe = (name, rE, teq) => {
    const c = exoClass(rE, teq);
    let pool = EXO_RECIPES.filter(([k]) => k === c);
    if (!pool.length)
        pool = EXO_RECIPES.filter(([k]) => k === FALLBACK[c]);
    if (!pool.length)
        pool = EXO_RECIPES.filter(([k]) => k.startsWith(c.split('-')[0]));
    return pool[hash(name) % pool.length][1];
};
// ---- galaxies
const GAL_KIND = { s: 'S', spiral: 'S', sb: 'S', barred: 'S', e: 'E', elliptical: 'E', s0: 'E', lenticular: 'E', i: 'I', irregular: 'I', d: 'D', dwarf: 'D', p: 'P', interacting: 'P', merger: 'P', h: 'H', early: 'H' };
const GAL_GLOW = { S: '#bcd0ff', E: '#ffd9a0', I: '#a9c4ff', D: '#ffe2b8', P: '#c9d6ff', H: '#b9c8ff' };
const GAL_N = { S: 1, E: 1, I: 0.6, D: 0.4, P: 0.1, H: 0.05 };
export const SKY_PALETTE = () => [
    ...Object.entries(STAR_CLASSES).map(([k, [color, emit]]) => ({ name: `star-${k}`, color, metal: 0, rough: 0.5, alpha: 1, emit, soft: 0 })),
    { name: 'gal-ghost', color: '#9db4ff', metal: 0, rough: 1, alpha: 0, emit: 0, soft: 0 },
    { name: 'bh-core', color: '#000000', metal: 0, rough: 1, alpha: 1, emit: 0, soft: 0 },
    { name: 'bh-disc', color: '#ff9a40', metal: 0, rough: 1, alpha: 1, emit: 1, soft: 0 },
    { name: 'sky-planet', color: '#8a8a8a', metal: 0, rough: 0.9, alpha: 1, emit: 0 },
];
/** what the catalogue can hold, for the docs and the MCP tool's schema */
export const SKY_TYPES = ['star', 'planet', 'moon', 'dwarf planet', 'exoplanet', 'black hole', 'galaxy'];
// ---- the conversion
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const raDeg = (o) => {
    if (num(o.ra) !== undefined)
        return o.ra;
    if (num(o.ra_h) !== undefined)
        return o.ra_h * 15;
    if (typeof o.ra === 'string') {
        const p = o.ra.trim().split(/[\s:hms]+/).filter(Boolean).map(Number);
        if (p.every(Number.isFinite))
            return ((p[0] ?? 0) + (p[1] ?? 0) / 60 + (p[2] ?? 0) / 3600) * 15;
    }
    return undefined;
};
const decDeg = (o) => {
    if (num(o.dec) !== undefined)
        return o.dec;
    if (typeof o.dec === 'string') {
        const s = o.dec.trim();
        const neg = s.startsWith('-');
        const p = s.replace(/^[+-]/, '').split(/[\s:°'"dms]+/).filter(Boolean).map(Number);
        if (p.every(Number.isFinite))
            return (neg ? -1 : 1) * ((p[0] ?? 0) + (p[1] ?? 0) / 60 + (p[2] ?? 0) / 3600);
    }
    return undefined;
};
const unitOf = (u, what, warn) => {
    if (u === undefined)
        return 1;
    const k = UNITS[String(u).toLowerCase()];
    if (k === undefined) {
        warn(`${what}: unknown unit "${u}" (ly, pc, kpc, Mpc, AU, km, kly, Mly, Gly); light years used`);
        return 1;
    }
    return k;
};
/** equatorial (RA, Dec in degrees, distance in ly) -> the scene's [x, z, -y] */
export const skyAt = (raD, decD, dist) => {
    const a = (raD * Math.PI) / 180, d = (decD * Math.PI) / 180;
    const x = dist * Math.cos(d) * Math.cos(a), y = dist * Math.cos(d) * Math.sin(a), z = dist * Math.sin(d);
    return [x, z, -y];
};
// a place: at [x, y, z] in scene ly; xyz equatorial (with unit); ra / dec with dist (unit) or parallax (mas)
const placeOf = (o, warn) => {
    if (Array.isArray(o.at) && o.at.length === 3 && o.at.every((v) => num(v) !== undefined))
        return o.at.map((v) => v * unitOf(o.unit, o.name, warn));
    if (Array.isArray(o.xyz) && o.xyz.length === 3) {
        const k = unitOf(o.unit, o.name, warn);
        return [o.xyz[0] * k, o.xyz[2] * k, -o.xyz[1] * k];
    }
    const ra = raDeg(o), dec = decDeg(o);
    if (ra === undefined || dec === undefined)
        return null;
    let dist = num(o.dist);
    if (dist !== undefined)
        dist *= unitOf(o.unit, o.name, warn);
    else if (num(o.parallax) !== undefined) {
        if (o.parallax <= 0) {
            warn(`${o.name}: parallax ${o.parallax} mas is not a distance (left out)`);
            return null;
        }
        dist = (1000 / o.parallax) * LY_PER_PC;
    }
    if (dist === undefined)
        return null;
    return skyAt(ra, dec, dist);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(...a);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// an orbit's frame: its normal from inclination / node (degrees, to the scene's xz plane) or from the name
const orbitFrame = (o, h) => {
    let n;
    if (num(o.incl) !== undefined) {
        const i = (o.incl * Math.PI) / 180, w = ((o.node ?? 0) * Math.PI) / 180;
        n = [Math.sin(i) * Math.sin(w), Math.cos(i), -Math.sin(i) * Math.cos(w)];
    }
    else {
        const u1 = ((h % 1000) / 1000) * 2 - 1, u2 = (((h >>> 10) % 1000) / 1000) * 2 * Math.PI;
        n = [Math.sqrt(1 - u1 * u1) * Math.cos(u2), u1, Math.sqrt(1 - u1 * u1) * Math.sin(u2)];
    }
    const t1 = unit(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    return [n, t1, cross(n, t1)];
};
// a galaxy's tilt: [tilt about x, turn about y] (radians) from incl / pa (degrees) or the name
const galRot = (o, h) => {
    if (Array.isArray(o.rot))
        return o.rot;
    if (num(o.incl) !== undefined)
        return [r4((o.incl * Math.PI) / 180), r4(((o.pa ?? 0) * Math.PI) / 180)];
    return [r4(((h % 1000) / 1000) * 3), r4((((h >>> 10) % 1000) / 1000) * 6.283)];
};
/** A sky catalogue ('3draft-sky') -> a viewer scene. Errors that make an object unusable become warnings (the object is left out). */
export const skyScene = (sky) => {
    if (!sky || typeof sky !== 'object' || !Array.isArray(sky.objects))
        throw new Error('a sky catalogue needs objects: [ … ]');
    const warnings = [];
    const warn = (m) => { if (warnings.length < 200)
        warnings.push(m); };
    const objects = [];
    const paths = [];
    const counts = {};
    const byName = new Map(); // name -> the made object (for `around`)
    const lumOf = new Map();
    const types = (o) => String(o.type ?? 'star').toLowerCase().replace(/[_-]/g, ' ');
    const put = (src, made, type) => {
        if (src.info)
            made.info = String(src.info);
        if (src.category)
            made.category = String(src.category);
        objects.push(made);
        byName.set(made.name.toLowerCase(), made);
        counts[type] = (counts[type] ?? 0) + 1;
    };
    const named = (o, i) => (typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `${types(o)} ${i + 1}`);
    // stars, black holes and galaxies first (they have places of their own), then what goes round them
    const list = sky.objects.map((o, i) => ({ ...o, name: named(o, i) }));
    const free = list.filter((o) => !o.around);
    const bound = list.filter((o) => o.around);
    for (const o of free) {
        const type = types(o);
        const at = placeOf(o, warn);
        if (!at) {
            warn(`${o.name}: no place (give at [x, y, z] ly, or ra / dec with dist or parallax)`);
            continue;
        }
        const h = hash(o.name);
        if (type === 'star') {
            const k = starClass(o.spect, num(o.temp));
            const T = num(o.temp) ?? TYPICAL_T[k];
            const distLy = len(at);
            let L = num(o.lum);
            if (L === undefined && num(o.absmag) !== undefined)
                L = 10 ** ((4.83 - o.absmag) / 2.5);
            if (L === undefined && num(o.vmag) !== undefined && distLy > 0)
                L = 10 ** ((4.83 - (o.vmag - 5 * Math.log10(distLy / LY_PER_PC / 10))) / 2.5);
            const rSun = num(o.radius) ?? (L !== undefined ? (k === 'D' ? 0.012 : Math.sqrt(L) / (Math.max(T, 1500) / 5772) ** 2) : k === 'D' ? 0.012 : undefined);
            if (L === undefined)
                L = rSun !== undefined ? rSun ** 2 * (T / 5772) ** 4 : TYPICAL_L[k];
            const r = Math.max(SUN_RADIUS_LY * 0.008, SUN_RADIUS_LY * (rSun ?? Math.sqrt(L) / (Math.max(T, 1500) / 5772) ** 2));
            const glow = Math.max(r + 0.04 + (0.16 * Math.log10(1 + L * 100)) / 2, 0.08 * L ** 0.4);
            const made = { name: o.name, proto: 'star', at: at.map(r4), glow: r4(glow), scale: sig(r, 5), mats: { core: `star-${k}` }, color: o.color ?? starTint(num(o.temp) ?? T) };
            lumOf.set(made, L);
            put(o, made, 'star');
        }
        else if (type === 'black hole') {
            const mass = num(o.mass) ?? 10;
            const scale = num(o.radius_ly) ?? (mass > 1e5 ? 40 * Math.sqrt(mass / 4.3e6) : 0.3); // (drawn big: a real horizon is a few km)
            put(o, { name: o.name, proto: 'hole', at: at.map(r4), scale: sig(scale, 5), mats: { core: 'bh-core', disc: 'bh-disc' }, glow: sig(scale * 17, 5), glowColor: o.color ?? '#cfd8ff', far: true, rot: galRot(o, h), category: 'black hole' }, 'black hole');
        }
        else if (type === 'galaxy') {
            const kind = GAL_KIND[String(o.kind ?? 'spiral').toLowerCase()] ?? (warn(`${o.name}: unknown galaxy kind "${o.kind}" (spiral, elliptical, irregular, dwarf, interacting, early); spiral used`), 'S');
            const radius = num(o.radius_ly) ?? (num(o.diameter_kly) !== undefined ? o.diameter_kly * 500 : kind === 'D' ? 2000 : 40000);
            const g = { kind, seed: h % 2147483646 + 1, n: Math.round(Math.min(60000, Math.max(300, ((30000 * radius) / 45000) * GAL_N[kind]))) };
            for (const f of ['arms', 'pitch', 'bar', 'armShare', 'b', 'c', 'clumps', 'ratio', 'peri', 'incl1', 'incl2', 'time', 'merge', 'agn'])
                if (o[f] !== undefined)
                    g[f] = o[f];
            put(o, { name: o.name, proto: 'ghost', at: at.map(r4), scale: r4(radius), mats: { core: 'gal-ghost' }, glow: r4(radius * (kind === 'P' ? 2 : 4)), glowColor: o.color ?? GAL_GLOW[kind], far: true, galaxy: g, rot: galRot(o, h) }, 'galaxy');
        }
        else if (['planet', 'moon', 'dwarf planet', 'exoplanet'].includes(type)) {
            bound.push(o); // a planet with a place of its own: drawn there, lit by the nearest star
        }
        else
            warn(`${o.name}: unknown type "${o.type}" (${SKY_TYPES.join(', ')})`);
    }
    // planets and moons: round the object they name (`around`), a planets' place first so moons can go round them
    const pending = [...bound];
    for (let pass = 0; pass < 3 && pending.length; pass++)
        for (let i = 0; i < pending.length; i++) {
            const o = pending[i];
            const type = types(o);
            const host = o.around ? byName.get(String(o.around).toLowerCase()) : null;
            if (o.around && !host)
                continue; // (its host may come in a later pass)
            pending.splice(i--, 1);
            const h = hash(o.name);
            let at, a = 0;
            if (host) {
                a = num(o.a) !== undefined ? o.a * LY_PER_AU : num(o.a_km) !== undefined ? o.a_km * LY_PER_KM : NaN;
                if (!Number.isFinite(a)) {
                    warn(`${o.name}: give its orbit's size, a (AU) or a_km`);
                    continue;
                }
                const [, t1, t2] = orbitFrame(o, h);
                const ph = num(o.angle) !== undefined ? (o.angle * Math.PI) / 180 : (((h >>> 20) % 1000) / 1000) * 2 * Math.PI;
                at = host.at.map((c, k) => fine(c + a * (Math.cos(ph) * t1[k] + Math.sin(ph) * t2[k])));
                if (o.orbit)
                    paths.push({ name: `${o.name} orbit`, kind: 'orbit', color: o.orbitColor ?? '#8fa0b8', pts: Array.from({ length: 129 }, (_, s) => { const u = (s / 128) * 2 * Math.PI; return host.at.map((c, k) => fine(c + a * (Math.cos(u) * t1[k] + Math.sin(u) * t2[k]))); }) });
            }
            else
                at = placeOf(o, warn);
            if (!at) {
                warn(`${o.name}: no place (around a star with a, or a place of its own)`);
                continue;
            }
            // the light: the star it (or its planet) goes round, else the nearest star
            let star = host;
            while (star && star.proto !== 'star')
                star = star.host;
            if (!star) {
                let best = Infinity;
                for (const s of objects)
                    if (s.proto === 'star') {
                        const d = len(sub(s.at, at));
                        if (d < best)
                            (best = d, star = s);
                    }
            }
            const rE = num(o.radius_earth) ?? (num(o.radius_km) !== undefined ? o.radius_km / 6371 : num(o.radius_jup) !== undefined ? o.radius_jup * 11.21 : type === 'moon' ? 0.27 : 1);
            // the warmth: given, else from the star's luminosity and the distance (equilibrium, albedo 0.3)
            const dStar = star ? len(sub(star.at, at)) / LY_PER_AU : 1;
            const teq = num(o.teq) ?? (star ? 278.6 * 0.915 * (lumOf.get(star) ?? 1) ** 0.25 / Math.sqrt(Math.max(dStar, 1e-4)) : 150);
            const recipe = o.surface && typeof o.surface === 'object' ? { kind: 'rock', colors: ['#8a8a8a', '#b8b8b8', '#5a5a5a'], ...o.surface } : exoRecipe(o.name, rE, teq);
            if (o.ring && typeof o.ring === 'object')
                recipe.ring = { inner: 1.3, outer: 2.3, color: '#cdbb98', ...o.ring };
            const radius = rE * EARTH_RADIUS_LY;
            const pole = num(o.incl) !== undefined || host ? orbitFrame(o, h)[0] : unit([Math.sin(h), 1, Math.cos(h)]);
            const cls = exoClass(rE, teq).split('-');
            const sunlit = !star || /^(sun|sol)$/i.test(star.name);
            const category = o.category ?? ((type === 'planet' && !sunlit) || type === 'exoplanet'
                ? `${{ lava: 'lava', hot: 'hot', warm: 'warm', temp: 'temperate', cold: 'cold', froz: 'frozen' }[cls[1]]} ${{ rock: 'rocky', sub: 'sub-Neptune', nep: 'Neptune-like', jup: 'gas giant' }[cls[0]]} exoplanet`
                : type);
            const made = {
                name: o.name, proto: 'planet', at, scale: sig(radius), mats: { core: 'sky-planet' }, color: recipe.colors[1], category,
                glow: sig(Math.max(radius * 600, a * 0.004 || radius * 600)), glowColor: recipe.colors[1],
                planet: { ...recipe, seed: h % 997, pole: pole.map((v) => sig(v)), light: star ? [...star.at] : [0, 0, 0] },
            };
            Object.defineProperty(made, 'host', { value: host, enumerable: false });
            put(o, made, type);
        }
    for (const o of pending)
        warn(`${o.name}: around "${o.around}", which is not in the catalogue (left out)`);
    // the start: near the named object (or the first star, or the first object), far enough to see it and what goes round it
    let start = sky.start && Array.isArray(sky.start.eye) ? { eye: sky.start.eye, yaw: sky.start.yaw ?? 0, pitch: sky.start.pitch ?? 0 } : null;
    if (!start && objects.length) {
        const want = sky.start?.near ? byName.get(String(sky.start.near).toLowerCase()) : null;
        if (sky.start?.near && !want)
            warn(`start: no object "${sky.start.near}"`);
        const c = want ?? objects.find((x) => x.proto === 'star') ?? objects[0];
        const kids = objects.filter((x) => x.host === c || x.host?.host === c);
        const reach = Math.max(...kids.map((x) => len(sub(x.at, c.at))), 0);
        const d = num(sky.start?.distance) ?? (reach ? reach * 1.8 : c.proto === 'star' ? 60 * LY_PER_AU : c.proto === 'planet' ? c.scale * 9 : c.scale * 3);
        // a planet is seen from its day side, a little off the line to its star (so it is lit, in phase); the rest from above
        let dir = unit([0.35, 0.45, 1]);
        if (c.proto === 'planet' && !reach) {
            const toStar = unit(sub(c.planet.light, c.at));
            if (len(toStar) > 0.5) {
                const side = unit(cross(toStar, [0, 1, 0]));
                dir = unit([0, 1, 2].map((k) => toStar[k] + 0.7 * side[k] + (k === 1 ? 0.35 : 0)));
            }
        }
        const eye = c.at.map((v, k) => fine(v + dir[k] * d));
        const look = sub(c.at, eye);
        start = { eye, yaw: r4((Math.atan2(look[0], -look[2]) * 180) / Math.PI), pitch: r4((-Math.asin(look[1] / len(look)) * 180) / Math.PI) };
    }
    const scene = {
        format: '3draft-scene', version: 2, name: sky.name ?? 'sky', palette: SKY_PALETTE(), prototypes: skyPrototypes(),
        ...(start ? { start } : {}), vehicle: 'starship', objects, ...(paths.length ? { paths } : {}),
    };
    return { scene, warnings, counts };
};

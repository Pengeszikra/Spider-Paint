// Bevel: each selected line of a closed surface becomes a rounded (or, with one segment, flat) strip, like Blender's Ctrl+B.
// The line's two faces are cut back by `width` (measured across each face), and a strip of `segments` rows joins the cuts. Where several
// beveled lines meet, a patch fills the corner. Returns a new mesh (faces stay CCW from outside) and where the old points went.
import { add, sub, scale, cross, dot, len, norm } from './vec.js';
const newell = (pts) => {
    const n = [0, 0, 0];
    for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
};
/** A ring that goes out along a path and comes back the same way (x y x) has a spike: the spike is cut off. */
const despike = (ring) => {
    const r = [...ring];
    for (let again = true; again && r.length > 2;) {
        again = false;
        for (let i = 0; i < r.length; i++) {
            if (r[(i + r.length - 1) % r.length] === r[(i + 1) % r.length]) {
                r.splice(i, 1);
                r.splice(i % r.length, 1);
                again = true;
                break;
            }
        }
    }
    return r.filter((x, i) => x !== r[(i + 1) % r.length]);
};
export const bevel = (mesh, lines, width, segments = 1) => {
    if (!(width > 0))
        throw new Error('the bevel width must be positive');
    if (!Number.isInteger(segments) || segments < 1)
        throw new Error('the bevel needs 1 or more segments');
    const P0 = mesh.positions;
    const F = mesh.faces;
    const half = new Map(); // "a,b" -> the face holding the half-line a -> b
    F.forEach((f, fi) => f.v.forEach((a, k) => half.set(`${a},${f.v[(k + 1) % f.v.length]}`, fi)));
    const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const beveled = new Set();
    for (const [a, b] of lines)
        if (half.has(`${a},${b}`) && half.has(`${b},${a}`))
            beveled.add(key(a, b));
    if (!beveled.size)
        throw new Error('no line to bevel: a line needs a face on both sides');
    const isB = (a, b) => beveled.has(key(a, b));
    const verts = new Set();
    for (const k of beveled)
        for (const v of k.split(','))
            verts.add(Number(v));
    const fans = new Map();
    for (const v of verts) {
        const into = new Map();
        F.forEach((f, fi) => {
            const k = f.v.indexOf(v);
            if (k >= 0)
                into.set(f.v[(k + f.v.length - 1) % f.v.length], { f: fi, q: f.v[(k + 1) % f.v.length] });
        });
        const first = [...into.keys()][0];
        const ns = [first];
        const fs = [];
        let n = first;
        for (let guard = 0; guard < into.size + 1; guard++) {
            const c = into.get(n);
            if (!c)
                throw new Error('the bevel needs a closed surface round the ends of the lines');
            fs.push(c.f);
            n = c.q;
            if (n === first)
                break;
            ns.push(n);
        }
        if (n !== first || fs.length !== into.size)
            throw new Error('the bevel needs a closed surface round the ends of the lines');
        fans.set(v, { ns, fs });
    }
    // the corner of every face at every beveled point sits on the offset lines: P = v + w / sin * (b_i u_(i+1) + b_(i+1) u_i)
    const geo = new Map();
    let limit = Infinity;
    for (const [v, { ns }] of fans) {
        const k = ns.length;
        const u = ns.map((n) => norm(sub(P0[n], P0[v])));
        const l = ns.map((n) => len(sub(P0[n], P0[v])));
        const b = ns.map((n) => (isB(v, n) ? 1 : 0));
        const sin = ns.map((_, i) => len(cross(u[i], u[(i + 1) % k])));
        for (let i = 0; i < k; i++) {
            const j = (i + 1) % k;
            if (!b[i] && !b[j])
                continue;
            if (sin[i] < 1e-3)
                throw new Error('a line ends where a face goes straight on: bevel from another line');
            if (b[i])
                limit = Math.min(limit, 0.45 * sin[i] * l[j]);
            if (b[j])
                limit = Math.min(limit, 0.45 * sin[i] * l[i]);
        }
        geo.set(v, { u, sin, b, l });
    }
    const w = Math.min(width, limit);
    const scaleOf = Math.max(...P0.map((p) => Math.hypot(...p)), 1e-9);
    const P = P0.map((p) => [...p]);
    const reg = new Map();
    const pt = (p) => {
        const k = p.map((c) => Math.round(c / (scaleOf * 1e-9))).join(',');
        const have = reg.get(k);
        if (have !== undefined)
            return have;
        P.push(p);
        reg.set(k, P.length - 1);
        return P.length - 1;
    };
    const C = new Map(); // C.get(v)[i]: the corner point of face i at v
    for (const [v, { ns }] of fans) {
        const { u, sin, b } = geo.get(v);
        const k = ns.length;
        C.set(v, ns.map((_, i) => {
            const j = (i + 1) % k;
            if (!b[i] && !b[j])
                return v;
            const off = scale(add(scale(u[j], b[i]), scale(u[i], b[j])), w / sin[i]);
            return pt(add(P0[v], off));
        }));
    }
    // the profile of each line at each end: from the face holding the half-line v -> n to the other face (n >= 1 rows)
    const profile = new Map();
    for (const [v, { ns }] of fans) {
        const k = ns.length;
        const cs = C.get(v);
        for (let i = 0; i < k; i++) {
            if (!isB(v, ns[i]))
                continue;
            const A = cs[(i + k - 1) % k];
            const B = cs[i];
            const chain = [A];
            for (let s = 1; s < segments; s++) {
                const t = s / segments;
                const p = add(add(scale(P[A], (1 - t) * (1 - t)), scale(P0[v], 2 * t * (1 - t))), scale(P[B], t * t));
                chain.push(pt(p));
            }
            chain.push(B);
            profile.set(`${v}>${ns[i]}`, chain);
        }
    }
    const faceNormal = (fi) => norm(newell(F[fi].v.map((i) => P0[i])));
    const out = [];
    const addFace = (v, want, from) => {
        const ids = v.filter((x, i) => x !== v[(i + 1) % v.length]);
        if (new Set(ids).size < 3)
            return;
        const n = newell(ids.map((i) => P[i]));
        const f = F[from];
        out.push({ v: dot(n, want) < 0 ? [...ids].reverse() : ids, ...(f.color ? { color: f.color } : {}), ...(f.mat ? { mat: f.mat } : {}) });
    };
    // the strips
    for (const k of beveled) {
        const [a, b] = k.split(',').map(Number);
        const ca = profile.get(`${a}>${b}`); // from the face holding a -> b
        const cb = [...profile.get(`${b}>${a}`)].reverse(); // began at the face holding b -> a: turned round, it too begins at the face of a -> b
        const want = add(faceNormal(half.get(`${a},${b}`)), faceNormal(half.get(`${b},${a}`)));
        for (let s = 0; s < segments; s++)
            addFace([ca[s], ca[s + 1], cb[s + 1], cb[s]], want, half.get(`${a},${b}`));
    }
    // the corner patches, and the one face that takes a corner in (a point with a single untouched face is cut off)
    const replace = new Map(); // "face,v" -> the points that stand where v was
    for (const [v, { ns, fs }] of fans) {
        const { b } = geo.get(v);
        const k = ns.length;
        const cs = C.get(v);
        const ring = [];
        for (let i = 0; i < k; i++) {
            ring.push(cs[i]);
            const j = (i + 1) % k;
            if (b[j])
                ring.push(...profile.get(`${v}>${ns[j]}`).slice(1, -1));
        }
        const loop = despike(ring.filter((x, i) => x !== ring[(i + 1) % ring.length]));
        const untouched = ns.map((_, i) => i).filter((i) => !b[i] && !b[(i + 1) % k]);
        if (untouched.length === 1) {
            const at = loop.indexOf(v);
            const around = [...loop.slice(at + 1), ...loop.slice(0, at)];
            replace.set(`${fs[untouched[0]]},${v}`, around.reverse());
            continue;
        }
        const want = fs.reduce((t, f) => add(t, faceNormal(f)), [0, 0, 0]);
        if (new Set(loop).size < 3)
            continue;
        const nrm = norm(newell(loop.map((i) => P[i])));
        let convex = true;
        for (let i = 0; i < loop.length; i++) {
            const p = P[loop[i]];
            const q = P[loop[(i + 1) % loop.length]];
            const r = P[loop[(i + 2) % loop.length]];
            if (dot(cross(sub(q, p), sub(r, q)), nrm) < -1e-9 * scaleOf * scaleOf)
                convex = false;
        }
        const from = fs[0];
        if (convex)
            addFace(loop, want, from);
        else {
            // the whole ring is turned the right way once: a sliver triangle has no reliable normal of its own
            const ccw = dot(newell(loop.map((i) => P[i])), want) < 0 ? [...loop].reverse() : loop;
            const hub = ccw.includes(v) ? ccw.indexOf(v) : 0;
            const f = F[from];
            for (let i = 1; i + 1 < ccw.length; i++) {
                const t = [ccw[hub], ccw[(hub + i) % ccw.length], ccw[(hub + i + 1) % ccw.length]];
                if (new Set(t).size === 3)
                    out.push({ v: t, ...(f.color ? { color: f.color } : {}), ...(f.mat ? { mat: f.mat } : {}) });
            }
        }
    }
    // the old faces, with their corners at beveled points replaced
    const dist = (p, v) => len(sub(P[p], P0[v]));
    const faces = F.map((f, fi) => {
        const list = [];
        for (const x of f.v) {
            const fan = fans.get(x);
            if (!fan) {
                list.push(x);
                continue;
            }
            const taken = replace.get(`${fi},${x}`);
            if (taken) {
                list.push(...taken);
                continue;
            }
            const { ns } = fan;
            const k = ns.length;
            const i = fan.fs.indexOf(fi);
            const cs = C.get(x);
            const { b } = geo.get(x);
            const mine = cs[i];
            const d = dist(mine, x);
            const before = cs[(i + k - 1) % k];
            const after = cs[(i + 1) % k];
            if (!b[i] && before !== mine && dist(before, x) > d + 1e-12)
                list.push(before);
            list.push(mine);
            if (!b[(i + 1) % k] && after !== mine && dist(after, x) > d + 1e-12)
                list.push(after);
        }
        return { ...f, v: list.filter((p, i) => p !== list[(i + 1) % list.length]) };
    });
    // drop the points nothing uses any more
    const all = [...faces, ...out];
    const used = new Set();
    for (const f of all)
        for (const i of f.v)
            used.add(i);
    const remapAll = new Map();
    const positions = [];
    P.forEach((p, i) => {
        if (used.has(i)) {
            remapAll.set(i, positions.length);
            positions.push(p);
        }
    });
    const result = { positions, faces: all.map((f) => ({ ...f, v: f.v.map((i) => remapAll.get(i)) })) };
    const remap = new Map();
    for (let i = 0; i < P0.length; i++)
        if (remapAll.has(i))
            remap.set(i, remapAll.get(i));
    return { mesh: result, remap, width: w, lines: beveled.size };
};

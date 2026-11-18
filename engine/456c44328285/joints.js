// Groups and joints: the basic mechanics. Objects carry no transform (only meshes), so a joint keeps its geometry in the
// FRAME of an object's mesh: three of its vertices (well spread) give an origin, three axes and a scale, which every rigid move,
// turn and uniform size of that mesh carries along. So the anchors (a hinge's line, a rail, a pivot) follow their object
// without any bookkeeping, and undo comes for free.
//
// Joint kinds (a = the holder, b = the held part):
//   glue   a and b move together; `contact` (points, a line or a face, in a's frame) records where they touch
//   pivot  b turns about a point (a ball joint), with limits per axis (degrees, round the axes of `basis`, from the rest pose)
//   hinge  b turns about a line (its own edge: a door's vertical side), with a limit (degrees from the rest pose)
//   rail   b slides along a polyline of a (its `slider` point on the line), between `limit` (distances along the rail)
//   spring b hangs on a spring between a point of a and a point of b: rest length, stiffness, damping; each end glued or
//          pivoting; an optional spring object is stretched between the two ends
// The held part follows the holder (a moves → b moves along); moving b itself is what the joint allows.
// ---- small vector and matrix helpers (plain, so the viewer and the MCP server share them)
export const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => {
        const l = Math.hypot(a[0], a[1], a[2]);
        return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
    },
};
const { add, sub, mul, dot, cross, norm } = v3;
const mT = (m) => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
const mMul = (a, b) => a.map((r) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const mVec = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
/** The rotation matrix round the unit axis by angle (radians). */
export const axisAngle = (u, t) => {
    const [x, y, z] = norm(u), c = Math.cos(t), s = Math.sin(t), C = 1 - c;
    return [
        [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
        [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
        [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
    ];
};
/** Euler angles (radians) of R = Rz · Ry · Rx. */
const eulerXYZ = (R) => {
    const sy = Math.max(-1, Math.min(1, -R[2][0]));
    const y = Math.asin(sy);
    if (Math.abs(sy) > 0.99999)
        return [Math.atan2(-R[1][2], R[1][1]), y, 0];
    return [Math.atan2(R[2][1], R[2][2]), y, Math.atan2(R[1][0], R[0][0])];
};
const fromEuler = ([x, y, z]) => mMul(axisAngle([0, 0, 1], z), mMul(axisAngle([0, 1, 0], y), axisAngle([1, 0, 0], x)));
// ---- mesh frames
/** Three well spread vertices of a mesh: the first, the farthest from it, the farthest from their line. */
export const pickFrame = (mesh) => {
    const P = mesh.positions;
    if (P.length < 3)
        throw new Error('a joint needs objects of at least 3 vertices');
    let i1 = 0, d1 = -1;
    P.forEach((p, i) => {
        const d = v3.len(sub(p, P[0]));
        if (d > d1)
            ((d1 = d), (i1 = i));
    });
    const u = norm(sub(P[i1], P[0]));
    let i2 = 0, d2 = -1;
    P.forEach((p, i) => {
        const w = sub(p, P[0]);
        const d = v3.len(sub(w, mul(u, dot(w, u))));
        if (d > d2)
            ((d2 = d), (i2 = i));
    });
    if (d1 <= 0 || d2 <= 1e-9 * d1)
        throw new Error('a joint needs objects that are not flat lines or points');
    return [0, i1, i2];
};
export const frameOf = (mesh, idx) => {
    const [p0, p1, p2] = idx.map((i) => mesh.positions[i]);
    const x = norm(sub(p1, p0));
    const z = norm(cross(x, sub(p2, p0)));
    const y = cross(z, x);
    return { o: p0, R: [x, y, z], s: v3.len(sub(p1, p0)) };
};
export const toLocal = (f, p) => mul(mVec(f.R, sub(p, f.o)), 1 / f.s);
export const toWorld = (f, l) => add(f.o, mul(mVec(mT(f.R), l), f.s));
export const dirLocal = (f, d) => mVec(f.R, d);
export const dirWorld = (f, d) => mVec(mT(f.R), d);
/** b's axes in a's frame (the relative rotation). */
const relative = (fa, fb) => mMul(fa.R, mT(fb.R));
export const makeJoint = (spec, meshA, meshB) => {
    const frameA = pickFrame(meshA), frameB = pickFrame(meshB);
    const fa = frameOf(meshA, frameA), fb = frameOf(meshB, frameB);
    const j = { name: spec.name, type: spec.type, a: spec.a, b: spec.b, frameA, frameB, rest: relative(fa, fb) };
    const L = (p) => toLocal(fa, p);
    switch (spec.type) {
        case 'glue':
            if (spec.contact?.length)
                j.contact = spec.contact.map(L);
            else if (spec.at)
                j.contact = [L(spec.at)];
            break;
        case 'pivot':
            if (!spec.at)
                throw new Error('a pivot needs its point (at)');
            j.at = L(spec.at);
            j.basis = (spec.basis ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).map((d) => dirLocal(fa, norm(d)));
            if (spec.limits)
                j.limits = spec.limits;
            break;
        case 'hinge':
            if (!spec.axis || v3.len(sub(spec.axis[1], spec.axis[0])) <= 0)
                throw new Error('a hinge needs its line (two different points)');
            j.axis = [L(spec.axis[0]), L(spec.axis[1])];
            if (spec.limit)
                j.limit = spec.limit;
            break;
        case 'rail': {
            if (!spec.path || spec.path.length < 2)
                throw new Error('a rail needs a path of at least 2 points');
            j.path = spec.path.map(L);
            const slider = spec.slider ?? nearestVertexTo(meshB, spec.path);
            j.bAt = toLocal(fb, slider);
            j.scaleA = fa.s;
            if (spec.limit)
                j.limit = spec.limit;
            break;
        }
        case 'spring': {
            if (!spec.at || !spec.bAt)
                throw new Error('a spring needs its two ends: at (on a) and at_b (on b)');
            j.at = L(spec.at);
            j.bAt = toLocal(fb, spec.bAt);
            j.restLength = spec.restLength ?? v3.len(sub(spec.bAt, spec.at));
            j.stiffness = spec.stiffness ?? 40;
            j.damping = spec.damping ?? 3;
            j.ends = spec.ends ?? ['glue', 'glue'];
            j.scaleA = fa.s;
            if (spec.spring) {
                const m = spec.spring.mesh;
                const line = spec.spring.line ?? longestLine(m);
                j.spring = { object: spec.spring.object, line, mesh: m, ends: [spec.at, spec.bAt] };
            }
            break;
        }
        default:
            throw new Error(`unknown joint type "${spec.type}"`);
    }
    return j;
};
const nearestVertexTo = (mesh, path) => {
    let best = mesh.positions[0], bd = Infinity;
    for (const p of mesh.positions) {
        const d = v3.len(sub(p, closestOnPath(path, p).point));
        if (d < bd)
            ((bd = d), (best = p));
    }
    return best;
};
// the two vertices of a mesh farthest apart along its longest bounding-box side
const longestLine = (m) => {
    const lo = [0, 1, 2].map((k) => Math.min(...m.positions.map((p) => p[k])));
    const hi = [0, 1, 2].map((k) => Math.max(...m.positions.map((p) => p[k])));
    const k = [0, 1, 2].reduce((b, a) => (hi[a] - lo[a] > hi[b] - lo[b] ? a : b), 0);
    let i0 = 0, i1 = 0;
    m.positions.forEach((p, i) => {
        if (p[k] < m.positions[i0][k])
            i0 = i;
        if (p[k] > m.positions[i1][k])
            i1 = i;
    });
    return [i0, i1];
};
/** The nearest point of a polyline: the point, the distance along the line from its start, the segment's direction. */
export const closestOnPath = (path, p) => {
    let best = { point: path[0], s: 0, dir: norm(sub(path[1], path[0])) }, bd = Infinity, run = 0;
    for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], d = sub(path[i + 1], a), L = v3.len(d);
        if (L <= 0)
            continue;
        const t = Math.max(0, Math.min(L, dot(sub(p, a), d) / L));
        const q = add(a, mul(d, t / L));
        const dd = v3.len(sub(p, q));
        if (dd < bd)
            ((bd = dd), (best = { point: q, s: run + t, dir: mul(d, 1 / L) }));
        run += L;
    }
    return best;
};
export const pathLength = (path) => path.slice(1).reduce((t, p, i) => t + v3.len(sub(p, path[i])), 0);
export const pointAlong = (path, s) => {
    let run = 0;
    for (let i = 0; i + 1 < path.length; i++) {
        const L = v3.len(sub(path[i + 1], path[i]));
        if (s <= run + L || i + 2 === path.length)
            return add(path[i], mul(sub(path[i + 1], path[i]), L > 0 ? Math.max(0, Math.min(1, (s - run) / L)) : 0));
        run += L;
    }
    return path[path.length - 1];
};
const deltaOf = (j, fa, fb) => mMul(relative(fa, fb), mT(j.rest)); // the turn since rest, in a's frame
const signedAngle = (u, D) => {
    const ref = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const v = norm(cross(u, ref));
    const w = mVec(D, v);
    return Math.atan2(dot(u, cross(v, w)), dot(v, w));
};
export const jointNow = (j, meshA, meshB) => {
    const fa = frameOf(meshA, j.frameA), fb = frameOf(meshB, j.frameB);
    const W = (l) => toWorld(fa, l);
    const D = deltaOf(j, fa, fb);
    switch (j.type) {
        case 'hinge': {
            const u = norm(sub(j.axis[1], j.axis[0]));
            return { type: 'hinge', angle: (signedAngle(u, D) * 180) / Math.PI, axis: [W(j.axis[0]), W(j.axis[1])] };
        }
        case 'pivot': {
            const B = j.basis;
            const e = eulerXYZ(mMul(B, mMul(D, mT(B))));
            return { type: 'pivot', angles: e.map((t) => (t * 180) / Math.PI), point: W(j.at) };
        }
        case 'rail': {
            const path = j.path.map(W);
            const s = closestOnPath(path, toWorld(fb, j.bAt)).s;
            return { type: 'rail', position: s, path };
        }
        case 'spring': {
            const ends = [W(j.at), toWorld(fb, j.bAt)];
            return { type: 'spring', length: v3.len(sub(ends[1], ends[0])), ends };
        }
        default:
            return { type: 'glue', ...(j.contact ? { path: j.contact.map(W) } : {}) };
    }
};
export const ID3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const applyRigid = (m, p) => add(add(mVec(m.R, sub(p, m.about)), m.about), m.t);
export const moveMesh = (mesh, m) => ({ ...mesh, positions: mesh.positions.map((p) => applyRigid(m, p)) });
const clamp = (v, r) => (r ? Math.max(Math.min(r[0], r[1]), Math.min(Math.max(r[0], r[1]), v)) : v);
/** Set a hinge to an angle (degrees from rest, clamped to its limit): the move of b. */
export const hingeTo = (j, meshA, meshB, deg) => {
    const now = jointNow(j, meshA, meshB);
    const goal = clamp(deg, j.limit);
    const [p0, p1] = now.axis;
    return { move: { R: axisAngle(norm(sub(p1, p0)), ((goal - now.angle) * Math.PI) / 180), about: p0, t: [0, 0, 0] }, angle: goal };
};
/** Set a pivot to angles (degrees round its basis axes from rest, each clamped). */
export const pivotTo = (j, meshA, meshB, deg) => {
    const fa = frameOf(meshA, j.frameA), fb = frameOf(meshB, j.frameB);
    const L = j.limits ?? {};
    const goal = [clamp(deg[0], L.x), clamp(deg[1], L.y), clamp(deg[2], L.z)];
    const B = j.basis;
    const Dgoal = mMul(mT(B), mMul(fromEuler(goal.map((d) => (d * Math.PI) / 180)), B)); // in a's frame
    const D = deltaOf(j, fa, fb);
    const turnA = mMul(Dgoal, mT(D)); // a's frame
    const R = mMul(mT(fa.R), mMul(turnA, fa.R)); // world
    return { move: { R, about: toWorld(fa, j.at), t: [0, 0, 0] }, angles: goal };
};
/** Turn a pivot by a world turn (axis, degrees), kept inside its limits. */
export const pivotTurn = (j, meshA, meshB, axis, deg) => {
    const fa = frameOf(meshA, j.frameA), fb = frameOf(meshB, j.frameB);
    const turnW = axisAngle(axis, (deg * Math.PI) / 180);
    const turnA = mMul(fa.R, mMul(turnW, mT(fa.R)));
    const D2 = mMul(turnA, deltaOf(j, fa, fb));
    const B = j.basis;
    const e = eulerXYZ(mMul(B, mMul(D2, mT(B)))).map((t) => (t * 180) / Math.PI);
    return pivotTo(j, meshA, meshB, e);
};
/** Slide a rail's slider to the rail point nearest `p` (world), inside its limit: the move of b. */
export const railTo = (j, meshA, meshB, s) => {
    const fa = frameOf(meshA, j.frameA), fb = frameOf(meshB, j.frameB);
    const path = j.path.map((l) => toWorld(fa, l));
    const k = fa.s / (j.scaleA ?? fa.s); // (the limit scales with the object)
    const lim = j.limit ? [j.limit[0] * k, j.limit[1] * k] : [0, pathLength(path)];
    const goal = clamp(s, lim);
    const from = toWorld(fb, j.bAt);
    return { move: { R: ID3, about: [0, 0, 0], t: sub(pointAlong(path, goal), from) }, position: goal };
};
export const railNear = (j, meshA, meshB, p) => {
    const fa = frameOf(meshA, j.frameA);
    return railTo(j, meshA, meshB, closestOnPath(j.path.map((l) => toWorld(fa, l)), p).s);
};
/** One step of a spring (b's translation): where its end is pulled towards the rest length; v is its velocity (world units / s). */
export const springStep = (j, meshA, meshB, v, dt) => {
    const fa = frameOf(meshA, j.frameA), fb = frameOf(meshB, j.frameB);
    const A = toWorld(fa, j.at), Bp = toWorld(fb, j.bAt);
    const d = sub(Bp, A), len = v3.len(d);
    const k = fa.s / (j.scaleA ?? fa.s);
    const restL = (j.restLength ?? len) * k;
    const dir = len > 1e-12 ? mul(d, 1 / len) : [0, -1, 0];
    const stretch = len - restL;
    // semi-implicit Euler, in small steps
    let vel = v, x = [0, 0, 0];
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
        const cur = add(d, x), cl = v3.len(cur);
        const cd = cl > 1e-12 ? mul(cur, 1 / cl) : dir;
        const f = sub(mul(cd, -(j.stiffness ?? 40) * (cl - restL)), mul(vel, j.damping ?? 3));
        vel = add(vel, mul(f, h));
        x = add(x, mul(vel, h));
    }
    const rest = Math.abs(stretch) < 1e-4 * Math.max(restL, 1e-3) && v3.len(vel) < 1e-3 * Math.max(restL, 1e-3);
    return { move: { R: ID3, about: [0, 0, 0], t: rest ? mul(dir, -stretch) : x }, v: rest ? [0, 0, 0] : vel, rest };
};
/** The spring object stretched between the spring's two ends now. */
export const springMesh = (j, meshA, meshB) => {
    if (!j.spring)
        return null;
    const fa = frameOf(meshA, j.frameA), fb = frameOf(meshB, j.frameB);
    const A = toWorld(fa, j.at), Bp = toWorld(fb, j.bAt);
    const m = j.spring.mesh;
    const [r0, r1] = j.spring.ends;
    const d0 = sub(r1, r0), L0 = v3.len(d0), d1 = sub(Bp, A), L1 = v3.len(d1);
    if (L0 <= 0 || L1 <= 0)
        return m;
    const u0 = mul(d0, 1 / L0), u1 = mul(d1, 1 / L1);
    const c = dot(u0, u1), ax = cross(u0, u1), sn = v3.len(ax);
    const R = sn < 1e-9 ? (c > 0 ? ID3 : axisAngle(Math.abs(u0[0]) < 0.9 ? norm(cross(u0, [1, 0, 0])) : norm(cross(u0, [0, 1, 0])), Math.PI)) : axisAngle(mul(ax, 1 / sn), Math.atan2(sn, c));
    const k = L1 / L0;
    return {
        ...m,
        positions: m.positions.map((p) => {
            const w = sub(p, r0), along = dot(w, u0);
            const stretched = add(w, mul(u0, along * (k - 1))); // stretch along the line only
            return add(A, mVec(R, stretched));
        }),
    };
};
/**
 * The objects that move rigidly with `roots` when they are moved freely: their groups, everything glued to them (both ways) and
 * everything they hold by a pivot, hinge or rail (and so on down). Springs are not rigid: their held parts follow by the spring.
 */
export const carried = (roots, objects, joints) => {
    const groupOf = new Map(objects.map((o) => [o.name, o.group]));
    const set = new Set(roots);
    const stack = [...roots];
    while (stack.length) {
        const n = stack.pop();
        const g = groupOf.get(n);
        const more = [];
        if (g)
            for (const o of objects)
                if (o.group === g)
                    more.push(o.name);
        for (const j of joints) {
            if (j.type === 'spring')
                continue;
            if (j.a === n)
                more.push(j.b);
            if (j.type === 'glue' && j.b === n)
                more.push(j.a);
        }
        for (const m of more)
            if (!set.has(m))
                (set.add(m), stack.push(m));
    }
    return [...set];
};
/** The joint that holds `name` (it is the b of a pivot, hinge or rail), if any. */
export const holderOf = (name, joints) => joints.find((j) => j.b === name && (j.type === 'pivot' || j.type === 'hinge' || j.type === 'rail'));

// A galaxy as a recipe instead of a stored point set: a few numbers (kind, seed, shape) from which the same points are sampled
// every time, on the fly, when the viewer needs them (the galaxy is big enough on screen). The frame is the unit one: radius 1,
// the disc in the x-z plane (normal = y). Every point stands for millions of stars.
const BLUE = [170, 195, 255], WHITE = [255, 240, 225], GOLD = [255, 205, 140], RED = [255, 170, 105], PINK = [255, 190, 215];
const DEFAULT_N = { S: 1800, E: 1400, I: 700, D: 350, P: 2400 };
export const galaxyPoints = (g) => {
    let seed = (Math.abs(Math.floor(g.seed)) % 2147483646) + 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const expo = (s) => -s * Math.log(1 - rnd());
    const mix = (a, b, t) => ((Math.round(a[0] + (b[0] - a[0]) * t) << 16) | (Math.round(a[1] + (b[1] - a[1]) * t) << 8) | Math.round(a[2] + (b[2] - a[2]) * t)) >>> 0;
    const n = Math.max(1, Math.round(g.n ?? DEFAULT_N[g.kind]));
    const out = { n, p: new Float32Array(n * 3), r: new Float32Array(n), c: new Uint32Array(n), l: new Float32Array(n) };
    let i = 0;
    const add = (x, y, z, r, c, l) => {
        if (i >= n)
            return;
        out.p[3 * i] = x;
        out.p[3 * i + 1] = y;
        out.p[3 * i + 2] = z;
        out.r[i] = r;
        out.c[i] = c;
        out.l[i] = l;
        i++;
    };
    const inside = (x, y, z) => x * x + y * y + z * z <= 1;
    let guard = n * 50; // rejection sampling never loops forever
    if (g.kind === 'S') {
        const arms = Math.max(1, Math.round(g.arms ?? 2));
        const tan = Math.tan((((g.pitch ?? 17) * Math.PI) / 180));
        const share = g.armShare ?? 0.6;
        const bar = g.bar ?? 0;
        const bulge = Math.round(n * 0.16);
        const barN = bar > 0 ? Math.round(n * 0.08) : 0;
        while (i < bulge && guard--)
            add(gauss() * 0.1, gauss() * 0.06, gauss() * 0.1, 0.04, mix(GOLD, RED, rnd() * 0.5), 1.4);
        while (i < bulge + barN && guard--)
            add((rnd() * 2 - 1) * bar, gauss() * 0.03, gauss() * bar * 0.18, 0.04, mix(GOLD, WHITE, rnd() * 0.4), 1.2);
        const r0 = Math.max(0.2, bar || 0.35); // the arms start at the end of the bar
        while (i < n && guard--) {
            const r = 0.06 + expo(0.3);
            if (r > 1)
                continue;
            const y = gauss() * 0.02;
            if (rnd() < share && r > r0 * 0.6) {
                const k = Math.floor(rnd() * arms);
                const th = Math.log(r / r0) / tan + (k * 2 * Math.PI) / arms + (gauss() * (0.04 + 0.07 * r)) / r;
                add(r * Math.cos(th), y, r * Math.sin(th), 0.035, rnd() < 0.55 ? mix(BLUE, WHITE, rnd() * 0.5) : mix(WHITE, GOLD, rnd() * 0.5), 1.1);
            }
            else {
                const th = rnd() * 2 * Math.PI;
                add(r * Math.cos(th), y, r * Math.sin(th), 0.037, mix(WHITE, GOLD, rnd() * 0.7), 0.8);
            }
        }
    }
    else if (g.kind === 'E') {
        const b = g.b ?? 0.8, c = g.c ?? 0.9;
        while (i < n && guard--) {
            const u = Math.max(rnd() ** (1 / 3), 1e-3);
            const s = 0.3 / Math.sqrt(Math.max(1e-6, u ** -2 - 1)); // the radius of a Plummer sphere (scale 0.3)
            if (s > 1)
                continue;
            const v = [gauss(), gauss(), gauss()], l = Math.hypot(v[0], v[1], v[2]) || 1;
            add((v[0] / l) * s, (v[1] / l) * s * b, (v[2] / l) * s * c, 0.04, mix(GOLD, RED, rnd() * 0.7), 1);
        }
    }
    else if (g.kind === 'I') {
        const clumps = Math.max(1, Math.round(g.clumps ?? 6));
        const centres = Array.from({ length: clumps }, () => [gauss() * 0.3, gauss() * 0.08, gauss() * 0.3, 0.07 + rnd() * 0.12]);
        while (i < n && guard--) {
            const [cx, cy, cz, s] = centres[Math.floor(rnd() * clumps)];
            const x = cx + gauss() * s, y = cy + gauss() * s * 0.5, z = cz + gauss() * s;
            if (!inside(x, y, z))
                continue;
            add(x, y, z, 0.05, rnd() < 0.2 ? mix(PINK, WHITE, rnd()) : mix(BLUE, WHITE, rnd() * 0.6), 1);
        }
    }
    else if (g.kind === 'P') {
        const ratio = Math.max(1e-4, g.ratio ?? 0.5);
        const peri = Math.max(0.05, g.peri ?? 1);
        const ecc = g.ecc ?? 1;
        const T = g.time ?? 3;
        const R2 = g.size2 ?? Math.max(0.2, Math.sqrt(ratio));
        const first = g.first !== false;
        const M1 = 1, M2 = ratio, Mt = M1 + M2, eps2 = 0.15 * 0.15;
        // the relative orbit (2 - 1) in the x-y plane
        let rx, ry, vx, vy, total;
        if (ecc < 1) {
            const ra = (peri * (1 + ecc)) / (1 - ecc);
            [rx, ry, vx, vy] = [ra, 0, 0, Math.sqrt((Mt * (1 - ecc)) / ra)];
            total = T;
        }
        else {
            const pp = 2 * peri, r0 = Math.max(4 * peri, 4);
            const f0 = -Math.acos(Math.max(-1, Math.min(1, pp / r0 - 1)));
            const k = Math.sqrt(Mt / pp), vr = k * Math.sin(f0), vt = k * (1 + Math.cos(f0));
            [rx, ry] = [r0 * Math.cos(f0), r0 * Math.sin(f0)];
            [vx, vy] = [vr * Math.cos(f0) - vt * Math.sin(f0), vr * Math.sin(f0) + vt * Math.cos(f0)];
            const D = Math.tan(f0 / 2);
            total = -(Math.sqrt(pp ** 3 / Mt) / 2) * (D + D ** 3 / 3) + T; // Barker: from the start to the closest approach, then T
        }
        const B = [
            { x: [(-rx * M2) / Mt, (-ry * M2) / Mt, 0], v: [(-vx * M2) / Mt, (-vy * M2) / Mt, 0], m: M1 },
            { x: [(rx * M1) / Mt, (ry * M1) / Mt, 0], v: [(vx * M1) / Mt, (vy * M1) / Mt, 0], m: M2 },
        ];
        const tilt = (v, inclDeg, nodeDeg) => {
            const a = (inclDeg * Math.PI) / 180, b = (nodeDeg * Math.PI) / 180;
            const y1 = v[1] * Math.cos(a) - v[2] * Math.sin(a), z1 = v[1] * Math.sin(a) + v[2] * Math.cos(a);
            return [v[0] * Math.cos(b) - y1 * Math.sin(b), v[0] * Math.sin(b) + y1 * Math.cos(b), z1];
        };
        const nb = Math.round(n * 0.12); // bulge points, placed round the masses at the end
        const share2 = first ? g.share2 ?? Math.min(0.5, 0.15 + 0.35 * Math.sqrt(ratio)) : 1;
        const nPart = n - nb;
        const P = [];
        for (let k = 0; k < nPart; k++) {
            const who = rnd() < share2 ? 1 : 0;
            const body = B[who], R = who ? R2 : 1, M = body.m;
            let pos, vel;
            if (who === 1 && g.kind2 === 'E') {
                const r = R * (0.1 + 0.9 * Math.sqrt(rnd()));
                const u = [gauss(), gauss(), gauss()], ul = Math.hypot(u[0], u[1], u[2]) || 1;
                pos = u.map((c) => (c / ul) * r);
                const w = [gauss(), gauss(), gauss()]; // a random direction across the radius
                const d = (w[0] * pos[0] + w[1] * pos[1] + w[2] * pos[2]) / (r * r);
                const t = w.map((c, j) => c - d * pos[j]), tl = Math.hypot(t[0], t[1], t[2]) || 1;
                const sp = Math.sqrt((M * r * r) / (r * r + eps2) ** 1.5);
                vel = t.map((c) => (c / tl) * sp);
            }
            else {
                const r = R * (0.12 + 0.88 * Math.sqrt(rnd()));
                const th = rnd() * 2 * Math.PI;
                const sp = Math.sqrt((M * r * r) / (r * r + eps2) ** 1.5);
                const inc = who ? g.incl2 ?? 45 : g.incl1 ?? 20, node = who ? g.node2 ?? 0 : g.node1 ?? 0;
                pos = tilt([r * Math.cos(th), r * Math.sin(th), 0], inc, node);
                vel = tilt([-sp * Math.sin(th), sp * Math.cos(th), 0], inc, node);
            }
            P.push({ x: pos.map((c, j) => c + body.x[j]), v: vel.map((c, j) => c + body.v[j]), who, r0: Math.hypot(pos[0], pos[1], pos[2]) / R });
        }
        // leapfrog: the particles feel the two masses, the masses each other
        const dt = 0.02;
        const steps = Math.max(1, Math.ceil(total / dt));
        const acc = (x, out, skip = -1) => {
            out[0] = out[1] = out[2] = 0;
            for (let b = 0; b < 2; b++) {
                if (b === skip)
                    continue;
                const o = B[b], dx = o.x[0] - x[0], dy = o.x[1] - x[1], dz = o.x[2] - x[2];
                const q = o.m / (dx * dx + dy * dy + dz * dz + eps2) ** 1.5;
                out[0] += dx * q;
                out[1] += dy * q;
                out[2] += dz * q;
            }
        };
        const a = [0, 0, 0];
        for (let s = 0; s < steps; s++) {
            const h = Math.min(dt, total - s * dt);
            for (const p of P) {
                acc(p.x, a);
                for (let j = 0; j < 3; j++)
                    ((p.v[j] += a[j] * h), (p.x[j] += p.v[j] * h));
            }
            const ab = B.map((o, b) => (acc(o.x, a, b), [...a]));
            if (g.merge) {
                // dynamical friction: the relative motion is damped while the two overlap, so they spiral in and become one
                const d = [0, 1, 2].map((j) => B[1].x[j] - B[0].x[j]), dv = [0, 1, 2].map((j) => B[1].v[j] - B[0].v[j]);
                const k = g.merge / (1 + (d[0] ** 2 + d[1] ** 2 + d[2] ** 2) / 0.5);
                for (let j = 0; j < 3; j++)
                    ((ab[1][j] -= (k * dv[j] * M1) / Mt), (ab[0][j] += (k * dv[j] * M2) / Mt));
            }
            B.forEach((o, b) => { for (let j = 0; j < 3; j++)
                ((o.v[j] += ab[b][j] * h), (o.x[j] += o.v[j] * h)); });
        }
        // the frame: the centre of mass (or the first mass); the orbit plane becomes the x-z plane
        const c = first ? [0, 1, 2].map((j) => (B[0].x[j] * M1 + B[1].x[j] * M2) / Mt) : B[0].x;
        const pts = P.map((p) => ({
            x: p.x.map((v, j) => v - c[j]),
            col: p.who ? (g.kind2 === 'E' ? mix(GOLD, RED, rnd() * 0.6) : mix(WHITE, BLUE, Math.min(1, p.r0))) : mix(GOLD, BLUE, Math.min(1, p.r0 * 1.2)),
            l: p.r0 > 0.7 ? 0.8 : 1.1,
            r: 0.035,
        }));
        for (let k = 0; k < nb; k++) {
            const who = first ? (rnd() < share2 ? 1 : 0) : 1;
            const o = B[who], R = who ? R2 : 1;
            pts.push({ x: [0, 1, 2].map((j) => o.x[j] - c[j] + gauss() * 0.08 * R), col: mix(GOLD, RED, rnd() * 0.5), l: 1.4, r: 0.04 });
        }
        const radii = pts.map((q) => Math.hypot(q.x[0], q.x[1], q.x[2])).sort((u, v) => u - v);
        const scale = 1 / Math.max(1e-6, radii[Math.floor(radii.length * 0.99)]);
        for (const q of pts) {
            const x = q.x[0] * scale, y = q.x[2] * scale, z = q.x[1] * scale; // (orbit plane x-y -> x-z)
            if (x * x + y * y + z * z > 1)
                continue;
            add(x, y, z, q.r, q.col, q.l);
        }
    }
    else {
        while (i < n && guard--) {
            const x = gauss() * 0.28, y = gauss() * 0.22, z = gauss() * 0.28;
            if (!inside(x, y, z))
                continue;
            add(x, y, z, 0.07, mix(WHITE, GOLD, rnd()), 0.7);
        }
    }
    const q = i < n ? { n: i, p: out.p.slice(0, 3 * i), r: out.r.slice(0, i), c: out.c.slice(0, i), l: out.l.slice(0, i) } : out;
    // shuffled (with the same seed): any first part of the list is an even sample of the whole galaxy, so a viewer may draw only
    // the first m points of a galaxy that is small on screen
    for (let a = q.n - 1; a > 0; a--) {
        const b = Math.floor(rnd() * (a + 1));
        const t = [q.p[3 * a], q.p[3 * a + 1], q.p[3 * a + 2], q.r[a], q.c[a], q.l[a]];
        q.p[3 * a] = q.p[3 * b];
        q.p[3 * a + 1] = q.p[3 * b + 1];
        q.p[3 * a + 2] = q.p[3 * b + 2];
        q.r[a] = q.r[b];
        q.c[a] = q.c[b];
        q.l[a] = q.l[b];
        q.p[3 * b] = t[0];
        q.p[3 * b + 1] = t[1];
        q.p[3 * b + 2] = t[2];
        q.r[b] = t[3];
        q.c[b] = t[4];
        q.l[b] = t[5];
    }
    return q;
};

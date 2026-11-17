// VRTSH, "ViRTuSH": The Solution is at Hand. A hand-held UI for VR with bare hands (WebXR hand tracking).
//
// Each hand always has one function, whatever the wearer is doing or whoever they are playing. On the back of each hand sit
// the icons of the functions it can take; the other hand's index fingertip pokes one to choose it. The chosen one stands in
// front of the back of the hand, over the fingers, bigger, tilted toward the eyes; it is only a sign, it does not react. What a function does is up to the program: VRTSH
// reads the hands, keeps the choice, tells the gestures (fist, pinch, pointing, click, a fist opened) and lays the icons out.
// It knows nothing of a scene or a renderer: positions are in the room's reference space (metres, y up).
export const TSH_JOINTS = [
    'wrist',
    'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    ...['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].flatMap((f) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((k) => `${f}-${k}`)),
];
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
/** The bones to draw a hand with: chains of joint names from the wrist to each tip. */
export const TSH_BONES = [
    ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
    ...FINGERS.map((f) => ['wrist', `${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]),
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** Read both hands from a WebXR frame (joints in `space`). Hands that are not tracked are left out. */
export const readHands = (session, frame, space) => {
    const out = {};
    if (!frame?.getJointPose || !space)
        return out;
    for (const src of session.inputSources) {
        const side = src.handedness;
        if (!src.hand || (side !== 'left' && side !== 'right'))
            continue;
        const joints = {};
        let wrist = null, palm;
        for (const name of TSH_JOINTS) {
            const js = src.hand.get?.(name);
            if (!js)
                continue;
            let pose = null;
            try {
                pose = frame.getJointPose(js, space);
            }
            catch { }
            if (!pose)
                continue;
            const m = pose.transform.matrix;
            joints[name] = [m[12], m[13], m[14]];
            if (name === 'wrist')
                wrist = Float32Array.from(m);
            if (name === 'middle-finger-metacarpal')
                palm = Float32Array.from(m);
        }
        if (wrist && joints['index-finger-tip'] && joints['thumb-tip'] && joints['middle-finger-phalanx-proximal'])
            out[side] = { joints, wrist, palm };
    }
    return out;
};
// a smoothing that takes big jumps at once: it is for the tracking's tremble, not for real moves
const ease = (old, now, k, jump) => (old && len(sub(now, old)) < jump ? lerp(old, now, k) : now);
/** A hand's gestures, with slack so they do not flicker. `mem` keeps the hand's state between frames. */
export const handGestures = (side, h, mem, now) => {
    const j = h.joints, w = j.wrist;
    const ratio = (f) => {
        const t = j[`${f}-tip`], k = j[`${f}-phalanx-proximal`];
        return t && k ? len(sub(t, w)) / Math.max(1e-3, len(sub(k, w))) : 9;
    };
    const curls = FINGERS.map(ratio);
    const curl = curls.reduce((a, b) => a + b, 0) / curls.length;
    const others = Math.max(curls[1], curls[2], curls[3]);
    // pointing: the index straight, the other three curled
    mem.point = mem.point ? curls[0] > 1.5 && others < 1.35 : curls[0] > 1.7 && others < 1.15;
    mem.aim = mem.aim ? curls[0] > 1.5 : curls[0] > 1.7;
    // the thumb on the index: its tip near the index between the knuckle and the last joint (the tip itself is a pinch)
    {
        const p0 = j['index-finger-phalanx-proximal'], p1 = j['index-finger-phalanx-distal'] ?? j['index-finger-phalanx-intermediate'];
        let gap = 9;
        if (p0 && p1) {
            const seg = sub(p1, p0), l2 = Math.max(1e-9, dot(seg, seg));
            const t = Math.max(0, Math.min(1, dot(sub(j['thumb-tip'], p0), seg) / l2));
            gap = len(sub(j['thumb-tip'], add(p0, mul(seg, t))));
        }
        mem.thumbOn = mem.aim && (mem.thumbOn ? gap < 0.04 : gap < 0.025);
    }
    mem.fist = !mem.point && (mem.fist ? curl < 1.35 : curl < 1.1);
    const pinchGap = len(sub(j['thumb-tip'], j['index-finger-tip']));
    mem.pinch = !mem.fist && !mem.point && (mem.pinch ? pinchGap < 0.035 : pinchGap < 0.018);
    // the click while pointing: the thumb tucked against the middle finger
    const midF = j['middle-finger-phalanx-intermediate'] ?? j['middle-finger-phalanx-proximal'];
    const tuck = len(sub(j['thumb-tip'], midF));
    mem.click = mem.point && (mem.click ? tuck < 0.045 : tuck < 0.03);
    mem.palm = ease(mem.palm, mid(w, j['middle-finger-phalanx-proximal']), 0.5, 0.03);
    // the back of the hand: across the palm (index → pinky) × along it, signed by the hand (left and right are mirrored)
    const a = j['index-finger-metacarpal'] ?? j['index-finger-phalanx-proximal'], b = j['pinky-finger-metacarpal'] ?? j['pinky-finger-phalanx-proximal'];
    let back = a && b ? unit(cross(sub(a, w), sub(b, w))) : [0, 1, 0];
    if (side === 'right')
        back = mul(back, -1);
    mem.back = unit(ease(mem.back, back, 0.35, 0.5));
    const forward = unit(sub(j['middle-finger-phalanx-proximal'], w));
    const ip = j['index-finger-phalanx-proximal'], it = j['index-finger-tip'];
    mem.rayFrom = ip ? ease(mem.rayFrom, ip, 0.5, 0.03) : undefined;
    mem.rayDir = ip ? unit(ease(mem.rayDir, unit(sub(it, ip)), 0.4, 0.5)) : undefined;
    if (mem.fist)
        mem.fistSince ??= now;
    else
        mem.fistSince = undefined;
    return {
        fist: mem.fist, pinch: mem.pinch, point: mem.point, click: mem.click, aim: mem.aim, thumbOn: mem.thumbOn,
        palm: mem.palm, back: mem.back, forward,
        rayFrom: mem.rayFrom ?? null, rayDir: mem.rayDir ?? null,
        fistFor: mem.fistSince !== undefined ? (now - mem.fistSince) / 1000 : 0,
    };
};
/**
 * A VRTSH: the functions of each hand and the choice between them. Call `update` every frame with the hands (readHands) and
 * the head's pose; it returns each hand's function, gestures and icons, and what happened (a choice, a fist closed or opened).
 */
export const createTsh = (opts = {}) => {
    const fns = { left: opts.left ?? [], right: opts.right ?? [] };
    const chosen = { left: fns.left[0] ?? null, right: fns.right[0] ?? null };
    const mem = { left: {}, right: {} };
    const poking = { left: null, right: null };
    const wasFist = { left: 0, right: 0 };
    const wasClick = { left: false, right: false };
    const wasPoint = { left: false, right: false };
    const wasThumb = { left: false, right: false };
    const columns = opts.columns ?? 4, cell = opts.cell ?? 0.024, lift = opts.lift ?? 0.018;
    const bigSize = opts.bigSize ?? 0.05, bigAhead = opts.bigAhead ?? 0.1, bigOut = opts.bigOut ?? 0.045, reach = opts.reach ?? 0.013;
    /** where the icons of a hand sit: a grid over the back of the hand, the chosen one big in front of it, tilted to the eyes */
    // The icons hang on the WRIST's tracked pose only: the back of the hand, the way the fingers point and the palm's middle are
    // kept in the wrist's own frame, averaged slowly (they are the hand's shape, they do not change), and carried by the wrist.
    // So another hand coming near (which can shake the finger joints' tracking) does not turn or shift them.
    const onHand = { left: null, right: null };
    const inWrist = (m, v, point) => {
        const d = point ? [v[0] - m[12], v[1] - m[13], v[2] - m[14]] : v;
        return [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
    };
    const byWrist = (m, v, point) => {
        const r = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
        return point ? [r[0] + m[12], r[1] + m[13], r[2] + m[14]] : r;
    };
    const learnHand = (side, h, g) => {
        const now = { back: inWrist(h.wrist, g.back, false), fwd: inWrist(h.wrist, g.forward, false), palm: inWrist(h.wrist, g.palm, true) };
        const was = onHand[side];
        // (a fist folds the fingers: learn from an open hand only, after the first look)
        if (was && (g.fist || g.point))
            return;
        const k = was ? 0.01 : 1;
        onHand[side] = was
            ? { back: unit(lerp(was.back, now.back, k)), fwd: unit(lerp(was.fwd, now.fwd, k)), palm: lerp(was.palm, now.palm, k) }
            : now;
    };
    const layout = (side, g, h) => {
        const list = fns[side];
        if (list.length < 2)
            return []; // (one function: nothing to choose)
        const local = onHand[side];
        const z = local ? unit(byWrist(h.wrist, local.back, false)) : g.back;
        const fwd = local ? byWrist(h.wrist, local.fwd, false) : g.forward;
        const palm = local ? byWrist(h.wrist, local.palm, true) : g.palm;
        const y = unit(sub(fwd, mul(z, dot(fwd, z))));
        // x to the viewer's right when the back of the hand faces them (mirrored for the left hand's thumb side, which is fine)
        const x = cross(y, z);
        // the cells: fixed slots first, the rest in order (−1: the last cell of the last row, a corner, away from the middle)
        let rows = Math.max(1, Math.ceil(list.length / columns));
        for (const fn of list)
            if (fn.slot !== undefined && fn.slot >= 0)
                rows = Math.max(rows, Math.floor(fn.slot / columns) + 1);
        const cells = new Map();
        for (const fn of list)
            if (fn.slot !== undefined)
                cells.set(fn, fn.slot < 0 ? rows * columns + fn.slot : fn.slot);
        let next = 0;
        const taken = new Set(cells.values());
        for (const fn of list) {
            if (cells.has(fn))
                continue;
            while (taken.has(next))
                next++;
            cells.set(fn, next);
            taken.add(next);
        }
        const centre = add(palm, mul(z, lift));
        const icons = list.map((fn) => {
            const i = cells.get(fn);
            const c = i % columns, r = Math.floor(i / columns);
            const at = add(centre, add(mul(x, (c - (columns - 1) / 2) * cell), mul(y, ((rows - 1) / 2 - r) * cell)));
            return { fn, at, x, y, z, size: cell * 0.85, chosen: fn === chosen[side], hover: poking[side] === fn.id };
        });
        const fn = chosen[side];
        if (fn) {
            // the big one: in front of the back of the hand, over the fingers, leaning back toward the wrist by 40° (toward you when
            // the hand is held up in front of you); fixed on the hand like the rest (a sign only: the choosing never looks at it)
            const at = add(palm, add(mul(y, bigAhead), mul(z, bigOut)));
            const lean = (40 * Math.PI) / 180;
            const bz = unit(sub(mul(z, Math.cos(lean)), mul(y, Math.sin(lean))));
            const by = unit(cross(bz, x));
            icons.push({ fn, at, x: cross(by, bz), y: by, z: bz, size: bigSize, chosen: true, hover: false, big: true });
        }
        return icons;
    };
    const update = (hands, head, now) => {
        const events = [];
        const hp = head ? [head[12], head[13], head[14]] : null;
        const state = {};
        for (const side of ['left', 'right']) {
            const h = hands[side];
            const g = h ? handGestures(side, h, mem[side], now) : null;
            if (h && g)
                learnHand(side, h, g);
            state[side] = { seen: Boolean(h), fn: chosen[side], g, icons: h && g ? layout(side, g, h) : [] };
            if (!g)
                continue;
            if (g.fist && !wasFist[side])
                events.push({ type: 'fistClose', side });
            if (!g.fist && wasFist[side])
                events.push({ type: 'fistOpen', side, at: g.palm, heldFor: wasFist[side] });
            wasFist[side] = g.fist ? Math.max(g.fistFor, 1e-3) : 0;
            if (g.click && !wasClick[side])
                events.push({ type: 'clickDown', side });
            wasClick[side] = g.click;
            if (g.point && !wasPoint[side])
                events.push({ type: 'pointStart', side });
            wasPoint[side] = g.point;
            if (g.thumbOn && !wasThumb[side])
                events.push({ type: 'thumbDown', side });
            wasThumb[side] = g.thumbOn;
        }
        // choosing: the other hand's index fingertip on an icon (once, until it leaves)
        for (const side of ['left', 'right']) {
            const other = side === 'left' ? 'right' : 'left';
            const tip = hands[other]?.joints['index-finger-tip'];
            const icons = state[side].icons.filter((ic) => !ic.big);
            if (!tip || !icons.length) {
                poking[side] = null;
                continue;
            }
            let near = null, best = Infinity;
            for (const ic of icons) {
                const d = len(sub(tip, ic.at));
                if (d < best)
                    ((best = d), (near = ic));
            }
            if (near && best < reach) {
                if (poking[side] !== near.fn.id) {
                    poking[side] = near.fn.id;
                    if (chosen[side] !== near.fn) {
                        chosen[side] = near.fn;
                        events.push({ type: 'choose', side, fn: near.fn });
                        state[side] = { ...state[side], fn: near.fn, icons: layout(side, state[side].g, hands[side]) };
                    }
                }
                for (const ic of state[side].icons)
                    ic.hover = !ic.big && ic.fn.id === near.fn.id;
            }
            else if (best > reach * 2)
                poking[side] = null;
        }
        return { left: state.left, right: state.right, events };
    };
    return {
        update,
        /** the function a hand has now */
        fn: (side) => chosen[side],
        /** give a hand a function by id (or the first of its list) */
        choose: (side, id) => {
            const fn = fns[side].find((f) => f.id === id);
            if (fn)
                chosen[side] = fn;
            return fn ?? null;
        },
        /** change a hand's list (the choice stays if it is still there) */
        setFunctions: (side, list) => {
            fns[side] = list;
            if (!list.includes(chosen[side]))
                chosen[side] = list.find((f) => f.id === chosen[side]?.id) ?? list[0] ?? null;
        },
        functions: (side) => fns[side],
    };
};

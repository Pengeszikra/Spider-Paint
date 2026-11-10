# TR-74 expedition module for Spider Paint / 3Draft: the outside only.
# No UV map, no texture: every face names one entry of the palette (`face.mat`), so the panels, windows,
# stripes and lamps are simply faces that point at another material.
# y is up, metres, the ship stands on the ground (y = 0), the nose looks towards -z, port is -x.
import json, math, sys
import numpy as np

PAL = [
    ("tr-hull", "#b9ab8f", 0.78, 0.25, 1, 0),
    ("tr-hull-b", "#a3967c", 0.82, 0.25, 1, 0),
    ("tr-hull-c", "#8d7a62", 0.88, 0.3, 1, 0),
    ("tr-orange", "#c9622a", 0.65, 0.3, 1, 0),
    ("tr-frame", "#26282a", 0.45, 0.6, 1, 0),
    ("tr-glass", "#1a2731", 0.08, 0.7, 1, 0),
    ("tr-under", "#3a3b3c", 0.7, 0.5, 1, 0),
    ("tr-dark", "#2c2e31", 0.55, 0.65, 1, 0),
    ("tr-metal", "#74787b", 0.4, 0.85, 1, 0),
    ("tr-black", "#0b0c0e", 0.12, 0.6, 1, 0),
    ("tr-cyan", "#3fd9e8", 0.4, 0, 1, 1.4),
    ("tr-lamp", "#ffe6b8", 0.4, 0, 1, 1.6),
    ("tr-amber", "#ff9a2e", 0.4, 0, 1, 1.3),
    ("tr-red", "#8c2b25", 0.7, 0.35, 1, 0),
    ("tr-red-b", "#6f211d", 0.75, 0.35, 1, 0),
]
MATS = [{"name": n, "color": c, "rough": r, "metal": m, "alpha": a, "emit": e, "soft": 0} for n, c, r, m, a, e in PAL]
COL = {m["name"]: m["color"] for m in MATS}


def pick(i, j, table=(("tr-hull", 58), ("tr-hull-b", 28), ("tr-hull-c", 14))):
    """A steady pseudo-random choice per panel: the weathered look without a texture."""
    h = ((i * 73856093) ^ (j * 19349663) ^ 0x5F3759) % 100
    for name, share in table:
        if h < share:
            return name
        h -= share
    return table[0][0]


class Solid:
    """One closed shell: points are welded, the winding is turned outwards at the end."""

    def __init__(self):
        self.pos, self.index, self.faces = [], {}, []

    def v(self, p):
        k = tuple(round(float(c), 5) + 0.0 for c in p)
        if k not in self.index:
            self.index[k] = len(self.pos)
            self.pos.append(list(k))
        return self.index[k]

    def face(self, pts, mat):
        v = [self.v(p) for p in pts]
        v = [x for i, x in enumerate(v) if x != v[i - 1]]
        if len(v) >= 3:
            self.faces.append((v, mat))

    def loft(self, a, b, mats):
        n = len(a)
        for i in range(n):
            self.face([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]], mats(i) if callable(mats) else mats)

    def moved(self, fn):
        s = Solid()
        for v, mat in self.faces:
            s.face([fn(self.pos[i]) for i in v], mat)
        return s


class Obj:
    def __init__(self, name):
        self.name, self.pos, self.faces, self.report = name, [], [], []

    def add(self, s, label=""):
        P = np.array(s.pos)
        faces = []
        for v, mat in s.faces:  # a quad that is not flat becomes two triangles
            if len(v) == 4:
                a, b, c, d = P[v]
                n = np.cross(b - a, c - a)
                ln = np.linalg.norm(n)
                if ln > 1e-12 and abs(np.dot(d - a, n / ln)) > 1e-4:
                    faces += [([v[0], v[1], v[2]], mat), ([v[0], v[2], v[3]], mat)]
                    continue
            faces.append((v, mat))
        vol, edges = 0.0, {}
        for v, _ in faces:
            for i in range(1, len(v) - 1):
                vol += np.dot(P[v[0]], np.cross(P[v[i]], P[v[i + 1]])) / 6
            for i in range(len(v)):
                e = (v[i], v[(i + 1) % len(v)])
                edges[e] = edges.get(e, 0) + 1
        bad = sum(1 for e, c in edges.items() if c != 1 or (e[1], e[0]) not in edges)
        if bad:
            self.report.append(f"{label or 'solid'}: {bad} open/bad edges")
        base = len(self.pos)
        self.pos += s.pos
        for v, mat in faces:
            v = v[::-1] if vol < 0 else v
            self.faces.append({"v": [base + i for i in v], "mat": mat, "color": COL[mat]})

    def both(self, s, label=""):
        self.add(s, label)
        self.add(s.moved(lambda p: (-p[0], p[1], p[2])), label + " (mirror)")

    def mesh(self):
        return {"name": self.name, "mesh": {"positions": self.pos, "faces": self.faces}}


# ---- shapes ---------------------------------------------------------------------------------------
def box(lo, hi, mat):
    s = Solid()
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    m = mat if callable(mat) else (lambda side: mat)
    s.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], m("back"))
    s.face([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], m("front"))
    s.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], m("right"))
    s.face([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], m("left"))
    s.face([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], m("top"))
    s.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], m("bottom"))
    return s


def beam(p0, p1, w, d, mat, up=(0, 0, 1)):
    """A bar from p0 to p1: `w` wide along `up`, `d` deep across."""
    p0, p1 = np.array(p0, float), np.array(p1, float)
    ax = (p1 - p0) / np.linalg.norm(p1 - p0)
    u = np.array(up, float)
    u = u - ax * np.dot(u, ax)
    if np.linalg.norm(u) < 1e-6:
        u = np.array([1.0, 0, 0]) - ax * ax[0]
    u /= np.linalg.norm(u)
    t = np.cross(ax, u)
    q = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    a = [p0 + u * i * w / 2 + t * j * d / 2 for i, j in q]
    b = [p1 + u * i * w / 2 + t * j * d / 2 for i, j in q]
    s = Solid()
    s.loft(a, b, mat)
    s.face(a[::-1], mat)
    s.face(b, mat)
    return s


def tube(cx, cy, profile, angles, mats, cap=("tr-dark", "tr-dark")):
    """A body of revolution about an axis along z: profile is [(z, r), ...], mats(span, sector)."""
    ring = lambda z, r: [(cx + r * math.cos(a), cy + r * math.sin(a), z) for a in angles]
    rings = [ring(z, r) for z, r in profile]
    s = Solid()
    for k in range(len(rings) - 1):
        s.loft(rings[k], rings[k + 1], (lambda i, k=k: mats(k, i)) if callable(mats) else mats)
    s.face(rings[0][::-1], cap[0])
    s.face(rings[-1], cap[1])
    return s


def shell(levels, T, zf, stations, zr, mat):
    """A hull section: the same cross-section pushed along z, as one grid of faces.
    levels = [(y, half width)], T = columns across (-1 .. 1), zf / zr = z of the front / rear face per level.
    mat(kind, a, b, span): kind 'belly' | 'roof' (a = column), 'side' (a = level band, b = -1 | 1),
    'front' | 'rear' (a = level band, b = column)."""
    K, C = len(levels), len(T)
    pt = lambda k, t, z: (t * levels[k][1], levels[k][0], z[k] if isinstance(z, (list, tuple)) else z)

    def ring(z):
        pts = [pt(0, t, z) for t in T] + [pt(k, 1, z) for k in range(1, K - 1)]
        pts += [pt(K - 1, t, z) for t in reversed(T)] + [pt(k, -1, z) for k in range(K - 2, 0, -1)]
        return pts

    seg = [("belly", j, 0) for j in range(C - 1)] + [("side", k, 1) for k in range(K - 1)]
    seg += [("roof", C - 2 - j, 0) for j in range(C - 1)] + [("side", k, -1) for k in range(K - 2, -1, -1)]
    rings = [ring(zf)] + [ring(z) for z in stations] + [ring(zr)]
    s = Solid()
    for n in range(len(rings) - 1):
        s.loft(rings[n], rings[n + 1], lambda i, n=n: mat(seg[i][0], seg[i][1], seg[i][2], n))
    for k in range(K - 1):
        for j in range(C - 1):
            q = lambda z: [pt(k, T[j], z), pt(k, T[j + 1], z), pt(k + 1, T[j + 1], z), pt(k + 1, T[j], z)]
            s.face(q(zf)[::-1], mat("front", k, j, -1))
            s.face(q(zr), mat("rear", k, j, -1))
    return s


# =====================================================================================================
hull, engines, gear, details, lights = Obj("tr74-hull"), Obj("tr74-engines"), Obj("tr74-gear"), Obj("tr74-details"), Obj("tr74-lights")

# ---- main hull ----------------------------------------------------------------------------------------
LV = [(2.4, 1.9), (3.0, 2.6), (3.45, 2.6), (3.6, 2.6), (4.8, 2.6), (4.95, 2.6), (5.4, 2.25)]
TC = [-1, -0.86, -0.55, -0.06, 0.06, 0.55, 0.86, 1]
NOSE = [-10.25, -10.95, -11.05, -11.05, -10.6, -10.52, -10.2]
SPANS = [(-10.1, "pillar"), (-8.95, "glass"), (-8.8, "pillar"), (-7.6, "glass"), (-7.35, "pillar"), (-6.8, "stripe"),
         (-6.5, "plain"), (-6.35, "pillar"), (-4.55, "glass"), (-4.4, "pillar"), (-3.5, "plain"), (-3.35, "pillar"),
         (-2.75, "glass"), (-2.6, "pillar"), (-2.2, "plain"), (-1.5, "vent"), (-0.5, "plain"), (0.6, "plain"),
         (1.8, "plain"), (3.0, "plain"), (4.2, "plain"), (5.4, "plain"), (6.6, "plain"), (7.8, "plain"), (8.6, "plain"), (9.5, "plain")]
TAG = [t for _, t in SPANS]


def hull_mat(kind, a, b, n):
    if kind == "front":
        band = ["cham", "low", "sill", "win", "head", "top"][a]
        if band == "low":
            return "tr-lamp" if a == 1 and b in (1, 5) else pick(b, 90)
        if band in ("sill", "head"):
            return "tr-frame"
        if band == "win":
            return "tr-frame" if b in (0, 3, 6) else "tr-glass"
        return "tr-hull-b" if band == "cham" else pick(b, 91)
    if kind == "rear":
        return "tr-dark" if a in (2, 3, 4) and b in (2, 3, 4) else pick(a, b + 50, (("tr-hull-b", 60), ("tr-hull-c", 40)))
    tag = TAG[n]
    if kind == "belly":
        return pick(n, a, (("tr-under", 70), ("tr-dark", 20), ("tr-metal", 10)))
    if kind == "roof":
        if tag == "stripe":
            return "tr-orange"
        return pick(n, a + 7, (("tr-hull", 40), ("tr-hull-b", 30), ("tr-hull-c", 12), ("tr-dark", 18)))
    band = ["cham", "low", "sill", "win", "head", "top"][a]
    if band == "cham":
        return pick(n, b + 3, (("tr-hull-c", 45), ("tr-under", 35), ("tr-hull-b", 20)))
    if tag == "stripe":
        return "tr-orange"
    if tag == "pillar" and band in ("sill", "win", "head"):
        return "tr-frame"
    if tag == "glass":
        if band == "win":
            return "tr-glass"
        if band in ("sill", "head"):
            return "tr-frame"
    if tag == "vent" and band == "win":
        return "tr-dark"
    return pick(n, a * 5 + b)


hull.add(shell(LV, TC, NOSE, [z for z, _ in SPANS[:-1]], SPANS[-1][0], hull_mat), "hull")

# ---- upper module: sloped front, two small windows a side ------------------------------------------------------
UL = [(5.35, 1.9), (6.2, 1.9), (6.3, 1.9), (6.85, 1.9), (6.95, 1.9), (7.25, 1.9), (7.65, 1.5)]
UT = [-1, -0.3, 0.2, 1]
UF = [-3.6 + (y - 5.35) * 0.8 for y, _ in UL]
USP = [(-1.6, "slope"), (-0.9, "stripe"), (0.3, "plain"), (1.7, "plain"), (1.8, "pillar"), (2.4, "glass"), (2.5, "pillar"),
       (2.8, "plain"), (2.9, "pillar"), (3.5, "glass"), (3.6, "pillar"), (4.3, "plain")]
UTAG = [t for _, t in USP]


def upper_mat(kind, a, b, n):
    if kind == "front":
        return "tr-orange" if b == 1 else pick(a, b + 20)
    if kind == "rear":
        return pick(a, b + 30, (("tr-hull-b", 55), ("tr-hull-c", 25), ("tr-dark", 20)))
    tag = UTAG[n]
    if kind == "belly":
        return "tr-under"
    if kind == "roof":
        if a == 1 and n <= 1:
            return "tr-orange"
        return pick(n, a + 40, (("tr-hull", 45), ("tr-hull-b", 30), ("tr-dark", 25)))
    if tag == "stripe" and a >= 1:
        return "tr-orange"
    if tag == "pillar" and a in (2, 3, 4):
        return "tr-frame"
    if tag == "glass":
        if a == 3:
            return "tr-glass"
        if a in (2, 4):
            return "tr-frame"
    return pick(n + 30, a * 3 + b)


hull.add(shell(UL, UT, UF, [z for z, _ in USP[:-1]], USP[-1][0], upper_mat), "upper module")

# ---- rear deck: the red container and the grey equipment box ----------------------------------------------------
CS = [4.7 + 0.22 * i for i in range(1, 11)]
hull.add(shell([(5.35, 1.3), (5.5, 1.3), (6.85, 1.3), (7.0, 1.2)], [-1, 1], 4.7, CS[:-1], CS[-1],
               lambda kind, a, b, n: "tr-dark" if kind in ("belly",) or (kind == "side" and a == 0) or n in (0, 8)
               else ("tr-red-b" if kind in ("front", "rear") or n % 2 else "tr-red")), "container")
def rearbox_mat(kind, a, b, n):
    if kind == "belly":
        return "tr-under"
    if (kind == "side" and a == 1 and n == 2) or (kind == "rear" and a == 1 and b == 1):
        return "tr-dark"
    return pick(n + 60, a * 3 + b + (9 if kind == "roof" else 0), (("tr-hull-b", 45), ("tr-hull", 30), ("tr-hull-c", 25)))


hull.add(shell([(5.35, 1.6), (5.6, 1.6), (7.0, 1.6), (7.3, 1.35)], [-1, -0.35, 0.35, 1], 7.15, [7.4, 8.0, 8.6, 9.0], 9.3, rearbox_mat), "rear box")

# ---- engines: a nacelle with a black sensor dome in front, a long tank behind it -----------------------------------
EX, EY = 3.8, 3.9
N = 20
ANG = [2 * math.pi * i / N for i in range(N)]
nac = [(-1.2, 1.36), (-1.2, 1.62), (-0.55, 1.62), (-0.55, 1.5), (0.5, 1.5), (0.95, 1.5), (1.6, 1.5), (1.6, 1.64), (2.1, 1.64),
       (2.1, 1.44), (2.45, 1.44), (2.45, 1.36), (2.8, 1.36), (2.8, 1.44), (3.15, 1.44), (3.6, 1.05)]
nac_m = ["tr-dark", "tr-dark", "tr-frame", "hull", "tr-orange", "hull", "tr-frame", "tr-dark", "tr-frame", "tr-metal", "tr-frame",
         "tr-dark", "tr-frame", "tr-metal", "tr-dark"]
engines.both(tube(EX, EY, nac, ANG, lambda k, i: pick(k, i + 11) if nac_m[k] == "hull" else nac_m[k]), "nacelle")

# the dome: narrow sectors and one narrow ring carry the cyan lines
R, DZ = 1.36, -1.05
lines = [math.radians(a) for a in (28, 152, 262)]
half = math.radians(1.6)
dome_a, cyan_sector = [], set()
base = [2 * math.pi * i / 18 for i in range(18)]
marks = sorted([(a - half, a + half) for a in lines])
for a in base:
    if all(abs((a - m + math.pi) % (2 * math.pi) - math.pi) > math.radians(6) for m in lines):
        dome_a.append(a)
for lo, hi in marks:
    dome_a += [lo, hi]
dome_a.sort()
for i, a in enumerate(dome_a):
    if any(abs(a - lo) < 1e-9 for lo, _ in marks):
        cyan_sector.add(i)
phis = [8, 22, 36, 47, 49, 62, 76, 90]  # degrees from the tip; 47..49 is the cyan ring
dome_p = [(DZ - R * math.cos(math.radians(p)), R * math.sin(math.radians(p))) for p in phis]


def dome_mat(k, i):
    if i in cyan_sector and 1 <= k <= 5:
        return "tr-cyan"
    a = math.degrees(dome_a[i]) % 360
    if k == 3 and not (175 < a < 250):
        return "tr-cyan"
    return "tr-black"


engines.add(tube(EX, EY, dome_p, dome_a, dome_mat, ("tr-black", "tr-black")), "dome")
engines.add(tube(-EX, EY, dome_p, [math.pi - a for a in reversed(dome_a)],
                 lambda k, i: dome_mat(k, len(dome_a) - 2 - i if i < len(dome_a) - 1 else len(dome_a) - 1), ("tr-black", "tr-black")), "dome (mirror)")

TX, TY = 3.55, 3.45
tank = [(3.3, 0.8), (3.5, 1.08), (5.6, 1.08), (6.3, 1.08), (7.2, 1.08), (9.3, 1.08), (9.3, 1.18), (9.75, 1.18), (9.75, 1.02), (10.3, 0.95), (10.7, 0.6)]
tank_m = ["tr-dark", "hull", "tr-orange", "hull", "hull", "tr-frame", "tr-dark", "tr-frame", "tr-hull-c", "tr-dark"]
engines.both(tube(TX, TY, tank, ANG, lambda k, i: pick(k + 20, i // 2) if tank_m[k] == "hull" else tank_m[k], ("tr-dark", "tr-black")), "tank")
# three barrels between the nacelle and the rear deck
for dx, dy in ((2.95, 5.75), (3.25, 5.62), (3.1, 5.98)):
    engines.both(beam((dx, dy, 2.6), (dx, dy, 5.2), 0.16, 0.16, "tr-dark", (0, 1, 0)), "barrel")

# ---- landing gear -----------------------------------------------------------------------------------------------
def leg(x, z, top, reach=0.8):
    s = 1  # built on the +x side, mirrored for the other
    knee = (x + s * reach, 1.15, z)
    foot = (x + s * (reach - 0.15), 0.3, z)
    gear.both(box((x - 0.45, top - 0.75, z - 0.55), (x + 0.45, top + 0.12, z + 0.55), lambda side: "tr-hull-c" if side in ("left", "right") else "tr-dark"), "leg mount")
    gear.both(beam((x, top - 0.45, z), knee, 0.5, 0.46, "tr-hull-b"), "thigh")
    gear.both(box((knee[0] - 0.3, knee[1] - 0.3, z - 0.34), (knee[0] + 0.3, knee[1] + 0.3, z + 0.34), "tr-dark"), "knee")
    gear.both(beam(knee, foot, 0.36, 0.34, "tr-metal"), "shin")
    for dz in (-0.36, 0.36):
        gear.both(beam((x + 0.05, top - 0.3, z + dz), (foot[0] + 0.1, 0.5, z + dz), 0.1, 0.1, "tr-metal"), "piston")
    gear.both(box((foot[0] - 0.75, 0.0, z - 0.7), (foot[0] + 0.75, 0.2, z + 0.7), lambda side: "tr-under" if side in ("top", "bottom") else "tr-dark"), "pad")
    gear.both(box((foot[0] - 0.5, 0.2, z - 0.45), (foot[0] + 0.5, 0.34, z + 0.45), "tr-hull-c"), "pad plate")
    lights.both(box((foot[0] + 0.5, 0.36, z - 0.12), (foot[0] + 0.62, 0.48, z + 0.12), "tr-amber"), "pad lamp")
    lights.both(box((x + 0.45, top - 0.4, z - 0.14), (x + 0.5, top - 0.26, z + 0.14), "tr-amber"), "mount lamp")


leg(1.55, -8.5, 2.4)
leg(1.55, -3.9, 2.4)
leg(3.3, 2.6, 2.45)
leg(3.4, 8.0, 2.4)

# the ramp: out of the belly on the port side
RZ = -1.4
top_, bot_ = (-1.5, 2.36, RZ), (-5.7, 0.06, RZ)
gear.add(beam(top_, bot_, 1.7, 0.1, "tr-under"), "ramp")
for dz in (-0.9, 0.9):
    gear.add(beam((top_[0], top_[1] + 0.05, RZ + dz), (bot_[0], bot_[1] + 0.05, RZ + dz), 0.1, 0.24, "tr-metal"), "ramp rail")
d = np.array(bot_) - np.array(top_)
for i in range(1, 9):  # treads
    c = np.array(top_) + d * i / 9
    nrm = np.array([-d[1], d[0], 0]) / np.linalg.norm(d[:2])
    c = c + nrm * 0.06
    gear.add(beam(c - [0, 0, 0.8], c + [0, 0, 0.8], 0.05, 0.14, "tr-metal", up=nrm), "tread")

# ---- details ------------------------------------------------------------------------------------------------------
details.add(beam((-0.7, 7.6, -1.2), (-0.7, 10.0, -1.2), 0.07, 0.07, "tr-metal"), "antenna")
details.add(box((-0.85, 7.6, -1.35), (-0.55, 7.85, -1.05), "tr-dark"), "antenna foot")
# the dish: a shallow bowl on a post, tilted up and forward
dish_p = [(0.0, 0.07), (0.12, 0.1), (0.3, 0.62), (0.34, 0.62), (0.2, 0.08)]
ez = np.array([0.25, 0.8, -0.55]); ez /= np.linalg.norm(ez)
ex = np.cross([0, 1, 0], ez); ex /= np.linalg.norm(ex)
ey = np.cross(ez, ex)
o = np.array([0.7, 8.25, 1.0])
dish = tube(0, 0, dish_p, [2 * math.pi * i / 14 for i in range(14)], lambda k, i: "tr-hull" if k < 2 else ("tr-dark" if k == 2 else "tr-hull-b"), ("tr-dark", "tr-metal"))
details.add(dish.moved(lambda p: tuple(o + ex * p[0] + ey * p[1] + ez * p[2])), "dish")
details.add(beam((0.7, 7.6, 1.0), tuple(o + ez * 0.05), 0.12, 0.12, "tr-metal"), "dish post")
details.add(box((0.5, 7.6, 0.8), (0.9, 7.75, 1.2), "tr-dark"), "dish foot")
# roof blocks
for lo, hi, m in [((0.55, 7.6, 3.0), (1.45, 8.25, 4.15), "tr-dark"), ((-1.35, 7.6, 2.3), (-0.2, 7.95, 4.0), "tr-hull-b"), ((-1.2, 7.95, 3.2), (-0.5, 8.3, 3.9), "tr-dark"),
                  ((-0.9, 7.6, -0.3), (0.2, 7.78, 1.0), "tr-hull-c"), ((-0.6, 5.4, -9.2), (0.6, 5.52, -8.0), "tr-dark"), ((0.9, 5.4, -6.0), (1.8, 5.7, -4.6), "tr-hull-c"),
                  ((-1.9, 5.4, -5.6), (-0.8, 5.62, -4.2), "tr-dark"), ((-0.5, 5.4, -6.4), (0.5, 5.56, -5.2), "tr-hull-b")]:
    details.add(box(lo, hi, m), "roof block")
for x in (-1.95, 1.95):  # roof rails over the cockpit
    details.add(beam((x, 5.62, -9.9), (x, 5.62, -6.9), 0.06, 0.06, "tr-metal", (0, 1, 0)), "rail")
    for z in (-9.9, -8.4, -6.9):
        details.add(beam((x, 5.38, z), (x, 5.62, z), 0.06, 0.06, "tr-metal"), "rail post")
# a box under each big side window, and belly machinery
details.both(box((2.58, 3.02, -1.3), (2.75, 3.42, -0.3), "tr-hull-b"), "side box")
for lo, hi, m in [((-1.2, 2.15, -7.4), (1.2, 2.42, -5.0), "tr-dark"), ((-1.4, 2.0, 0.6), (1.4, 2.42, 4.6), "tr-under"), ((-0.9, 2.1, 5.2), (0.9, 2.42, 8.6), "tr-dark")]:
    details.add(box(lo, hi, m), "belly block")

# "TR-74" under the big side window: thin bars standing a centimetre proud of the hull
GLYPH = {"T": [((0, 1), (1, 1)), ((0.5, 0), (0.5, 1))], "R": [((0, 0), (0, 1)), ((0, 1), (1, 1)), ((1, 1), (1, 0.5)), ((0, 0.5), (1, 0.5)), ((0.4, 0.5), (1, 0))],
         "-": [((0.15, 0.5), (0.85, 0.5))], "7": [((0, 1), (1, 1)), ((1, 1), (0.35, 0))], "4": [((0, 1), (0, 0.45)), ((0, 0.45), (1, 0.45)), ((0.8, 1), (0.8, 0))]}


def text(word, x, y, z, dz, h=0.3, w=0.2, gap=0.09):
    """dz = +1 / -1: the direction the text runs in along z (so it reads from outside)."""
    for n, ch in enumerate(word):
        for (u0, v0), (u1, v1) in GLYPH[ch]:
            p = lambda u, v: (x, y + v * h, z + dz * (n * (w + gap) + u * w))
            a, b = np.array(p(u0, v0)), np.array(p(u1, v1))
            e = (b - a) / np.linalg.norm(b - a) * 0.022
            details.add(beam(a - e, b + e, 0.02, 0.045, "tr-frame", up=(1, 0, 0)), "text")


text("TR-74", -2.605, 3.08, -6.15, 1)
text("TR-74", 2.605, 3.08, -4.75, -1)
text("TR-74", -TX - 1.085, TY - 0.12, 7.5, 1, 0.26, 0.18)
text("TR-74", TX + 1.085, TY - 0.12, 8.85, -1, 0.26, 0.18)

# ---- lamps along the lower edge of the hull ---------------------------------------------------------------------------
for z in (-9.6, -5.6, -2.0, 0.9):
    lights.both(box((2.2, 2.66, z - 0.22), (2.38, 2.8, z + 0.22), "tr-amber"), "edge lamp")
lights.both(box((0.5, 2.3, -10.0), (1.0, 2.4, -9.7), "tr-lamp"), "nose lamp")

# =====================================================================================================
objs = [hull, engines, gear, details, lights]
P = np.array([p for o_ in objs for p in o_.pos])
for o_ in objs:
    print(f"{o_.name:14s} points {len(o_.pos):5d} faces {len(o_.faces):5d}  {'; '.join(o_.report) or 'closed'}", file=sys.stderr)
print("bounds", P.min(0).round(2), P.max(0).round(2), "faces", sum(len(o_.faces) for o_ in objs), file=sys.stderr)
scene = {"format": "3draft-scene", "version": 1, "palette": MATS, "objects": [o_.mesh() for o_ in objs]}
json.dump(scene, open(sys.argv[1], "w"), separators=(",", ":"))

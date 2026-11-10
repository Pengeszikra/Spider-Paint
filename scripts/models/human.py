# Low poly human for Spider Paint / 3Draft: ONE closed mesh, materials per face.
# y is up, metres, the origin is the middle of the base, the figure looks towards +z.
import json, math, sys
import numpy as np

MATS = [
    {"name": "fig-skin", "color": "#f1d79c", "metal": 0, "rough": 0.8, "alpha": 1, "emit": 0, "soft": 0},
    {"name": "fig-hair", "color": "#26272b", "metal": 0, "rough": 0.7, "alpha": 1, "emit": 0, "soft": 0},
    {"name": "fig-tee", "color": "#5b86d8", "metal": 0, "rough": 0.9, "alpha": 1, "emit": 0, "soft": 0},
    {"name": "fig-jeans", "color": "#2c4a94", "metal": 0, "rough": 0.9, "alpha": 1, "emit": 0, "soft": 0},
    {"name": "fig-shoes", "color": "#1e2024", "metal": 0, "rough": 0.6, "alpha": 1, "emit": 0, "soft": 0},
]
COL = {m["name"]: m["color"] for m in MATS}

pos, index, faces = [], {}, []


def V(p):
    k = tuple(round(c, 5) for c in p)
    if k not in index:
        index[k] = len(pos)
        pos.append([float(c) for c in k])
    return index[k]


def F(pts, mat, flip=False):
    v = [V(p) for p in pts]
    v = [x for i, x in enumerate(v) if x != v[i - 1]]  # welded points collapse
    if len(v) < 3:
        return
    faces.append({"v": v[::-1] if flip else v, "mat": mat, "color": COL[mat]})


def loft(a, b, mats, flip=False):
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        F([a[i], a[j], b[j], b[i]], mats[i] if isinstance(mats, list) else mats, flip)


def mx(p):
    return (-p[0], p[1], p[2])


def both(fn):
    """A part of the right side (+x), made again mirrored for the left."""
    fn(lambda p: p, False)
    fn(mx, True)


# ---- torso and head: rings of 8, counter-clockwise seen from above -------------------------
def ring8(y, w, d, z=0.0, bev=0.55):
    return [(w, y, z + d * 0.5), (w * bev, y, z + d), (-w * bev, y, z + d), (-w, y, z + d * 0.5),
            (-w, y, z - d * 0.5), (-w * bev, y, z - d), (w * bev, y, z - d), (w, y, z - d * 0.5)]


hip = ring8(0.90, 0.160, 0.100)
hem = ring8(0.98, 0.158, 0.105)
waist = ring8(1.10, 0.145, 0.095)
chest = ring8(1.26, 0.180, 0.115, 0.005)
shoulder = ring8(1.42, 0.195, 0.095)
neck0 = ring8(1.475, 0.058, 0.055, -0.005, 0.6)
neck1 = ring8(1.525, 0.052, 0.050, 0.0, 0.6)
jaw = ring8(1.545, 0.055, 0.070, 0.02, 0.5)
cheek = ring8(1.625, 0.088, 0.100, 0.012, 0.6)
brow = ring8(1.715, 0.092, 0.104, 0.004, 0.6)
crown = ring8(1.785, 0.060, 0.070, -0.008, 0.6)

loft(hip, hem, "fig-jeans")
loft(hem, waist, "fig-tee")
loft(waist, chest, "fig-tee")
# chest -> shoulder: the two side quads stay open, the arms grow out of them
for i in range(8):
    if i in (3, 7):
        continue
    j = (i + 1) % 8
    F([chest[i], chest[j], shoulder[j], shoulder[i]], "fig-tee")
loft(shoulder, neck0, "fig-tee")
loft(neck0, neck1, "fig-skin")
loft(neck1, jaw, "fig-skin")
loft(jaw, cheek, "fig-skin")
# hair: the back of the head and everything above the brow
loft(cheek, brow, ["fig-skin", "fig-skin", "fig-skin", "fig-skin", "fig-hair", "fig-hair", "fig-hair", "fig-skin"])
loft(brow, crown, "fig-hair")
F(crown, "fig-hair")

# crotch: two points under the hip ring, a triangle in front and one behind
Cf, Cb = (0.0, 0.80, 0.055), (0.0, 0.80, -0.055)
F([hip[2], hip[1], Cf], "fig-jeans")
F([hip[6], hip[5], Cb], "fig-jeans")


# ---- leg (right): rings of 6, same order as the loop hip7, hip0, hip1, Cf, Cb, hip6 ----------
def ring6(cx, y, cz, rx, rz):
    return [(cx + rx * math.cos(math.radians(a)), y, cz + rz * math.sin(math.radians(a))) for a in (-30, 30, 90, 150, 210, 270)]


def leg(m, flip):
    top = [hip[7], hip[0], hip[1], Cf, Cb, hip[6]]
    thigh = ring6(0.094, 0.76, 0.000, 0.084, 0.092)
    knee = ring6(0.098, 0.49, 0.008, 0.058, 0.064)
    calf = ring6(0.100, 0.34, -0.008, 0.056, 0.062)
    ankle = ring6(0.102, 0.10, -0.005, 0.044, 0.050)
    # the shoe: the front three points run forward into the toe
    cx, cz = 0.104, -0.005
    foot = [(cx + 0.052, 0, cz - 0.045), (cx + 0.058, 0, cz + 0.095), (cx + 0.012, 0, cz + 0.185),
            (cx - 0.048, 0, cz + 0.095), (cx - 0.046, 0, cz - 0.045), (cx, 0, cz - 0.075)]
    upper = [(x, 0.055 if i in (0, 4, 5) else 0.045, z) for i, (x, _, z) in enumerate(foot)]
    rings = [top, thigh, knee, calf, ankle, upper, foot]
    mats = ["fig-jeans"] * 4 + ["fig-shoes"] * 2
    for a, b, mat in zip(rings, rings[1:], mats):
        # rings are listed top down, so the loft is wound the other way round
        loft([m(p) for p in a], [m(p) for p in b], mat, not flip)
    F([m(p) for p in foot], "fig-shoes", not flip)


both(leg)


# ---- arm (right): rings of 4 growing out of the side quad of the torso -------------------------
def arm(m, flip):
    start = [chest[7], chest[0], shoulder[0], shoulder[7]]  # low back, low front, high front, high back

    def ring4(c, axis, r, rz=None):
        ax = np.array(axis, float)
        ax /= np.linalg.norm(ax)
        u = np.cross(ax, [1.0, 0.0, 0.0])
        u = u / np.linalg.norm(u) if np.linalg.norm(u) > 1e-6 else np.array([0, 0, 1.0])
        if u[2] < 0:
            u = -u  # u points forward
        v = np.cross(u, ax)  # v points outwards / up
        if v[0] < 0:
            v = -v
        c = np.array(c, float)
        rz = rz or r
        return [tuple(c - v * r - u * rz), tuple(c - v * r + u * rz), tuple(c + v * r + u * rz), tuple(c + v * r - u * rz)]

    up = (0.16, -1.0, 0.02)   # the upper arm hangs a little away from the body
    fo = (0.06, -1.0, 0.22)   # the forearm bends forward
    S = np.array([0.232, 1.345, 0.0])
    n = lambda a: np.array(a) / np.linalg.norm(a)
    sleeve = S + n(up) * 0.15
    elbow = S + n(up) * 0.29
    wrist = elbow + n(fo) * 0.25
    palm = wrist + n(fo) * 0.045
    tip = wrist + n(fo) * 0.105
    mid = n(n(up) + n(fo))
    rings = [start, ring4(S, (0.55, -1, 0), 0.062, 0.058), ring4(sleeve, up, 0.052), ring4(elbow, mid, 0.043),
             ring4(wrist, fo, 0.033), ring4(palm, fo, 0.040, 0.026), ring4(tip, fo, 0.030, 0.020)]
    mats = ["fig-tee", "fig-tee", "fig-skin", "fig-skin", "fig-skin", "fig-skin"]
    for a, b, mat in zip(rings, rings[1:], mats):
        loft([m(p) for p in a], [m(p) for p in b], mat, flip)
    F([m(p) for p in rings[-1]], "fig-skin", flip)


both(arm)

for f in faces:
    f["v"].reverse()  # everything above was wound inwards: turn the solid the right way out

# ---- checks: every edge is used once in each direction, and the solid is the right way out ---------
edges = {}
for f in faces:
    v = f["v"]
    for i in range(len(v)):
        e = (v[i], v[(i + 1) % len(v)])
        edges[e] = edges.get(e, 0) + 1
bad = [e for e, c in edges.items() if c != 1 or (e[1], e[0]) not in edges]
P = np.array(pos)
vol = 0.0
for f in faces:
    v = f["v"]
    for i in range(1, len(v) - 1):
        vol += np.dot(P[v[0]], np.cross(P[v[i]], P[v[i + 1]])) / 6
print(f"points {len(pos)}  faces {len(faces)}  bad edges {len(bad)}  volume {vol:.4f} m3  height {P[:,1].max():.3f}  base {P[:,1].min():.3f}", file=sys.stderr)
if bad:
    print(bad[:12], file=sys.stderr)

scene = {"format": "3draft-scene", "version": 1, "palette": MATS, "objects": [{"name": "human", "mesh": {"positions": pos, "faces": faces}}]}
json.dump(scene, open(sys.argv[1], "w"), separators=(",", ":"))

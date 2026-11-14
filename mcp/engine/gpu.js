// WebGPU renderer: flat-colored faces, one simple lit material, one global light.
// It draws the same scene through the same camera as the SVG renderer, so picking,
// the cross marks and the framing all stay valid. The pure helpers (viewProjection,
// buildVertices) need no GPU and are unit tested; createGpu() needs a browser.
import { dot, norm } from './vec.js';
import { bounds, faceNormal } from './mesh.js';
import { triangulate } from './triangulate.js';
import { makeCamera } from './camera.js';
import { surfaceOf } from './material.js';
/** Floats per screen vertex: position, then u v. */
export const SCREEN_FLOATS = 5;
/** The two triangles of every screen quad (SCREEN_FLOATS per vertex), in `screens` order. */
export const buildScreenQuads = (screens) => {
    const out = new Float32Array(screens.length * 6 * SCREEN_FLOATS);
    screens.forEach((sc, i) => {
        const [u0, v0, u1, v1] = sc.uv ?? [0, 0, 1, 1];
        const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        [0, 1, 2, 0, 2, 3].forEach((k, j) => out.set([...sc.corners[k], ...uv[k]], (i * 6 + j) * SCREEN_FLOATS));
    });
    return out;
};
/** The most joints a GPU skin can have. */
export const MAX_BONES = 64;
/** Floats per skinned vertex: the 14 of buildVertices, then four joints and their four weights. */
export const SKIN_FLOATS = 22;
/** a × b for column-major 4×4 matrices */
export const mul4 = (a, b) => {
    const m = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++) {
            let v = 0;
            for (let k = 0; k < 4; k++)
                v += a[k * 4 + r] * b[c * 4 + k];
            m[c * 4 + r] = v;
        }
    return m;
};
/** Floats of one mark segment: a (xyz), b (xyz), colour (rgba), width in CSS pixels, one spare. */
export const MARK_FLOATS = 12;
const colorOf = (css) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((css ?? '#0b7285').trim());
    const h = m ? (m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]) : '0b7285';
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
/** One instance per segment of every polyline of every mark (a zero-length segment is a round point). */
export const buildMarks = (marks) => {
    let n = 0;
    for (const m of marks)
        for (const l of m.lines)
            n += Math.max(1, l.length - 1);
    const out = new Float32Array(n * MARK_FLOATS);
    let o = 0;
    for (const m of marks) {
        const [r, g, b] = colorOf(m.color);
        for (const l of m.lines) {
            const segs = l.length > 1 ? l.length - 1 : 1;
            for (let i = 0; i < segs; i++) {
                const a = l[i];
                const c = l[Math.min(i + 1, l.length - 1)];
                out.set([a[0], a[1], a[2], c[0], c[1], c[2], r, g, b, m.opacity ?? 1, m.width ?? 2], o);
                o += MARK_FLOATS;
            }
        }
    }
    return out;
};
/** Line-list endpoints (x y z, x y z) of every edge of every face, each pair of vertices once. */
export const buildEdges = (mesh) => {
    const seen = new Set();
    const n = mesh.positions.length;
    const out = [];
    for (const f of mesh.faces)
        f.v.forEach((a, i) => {
            const b = f.v[(i + 1) % f.v.length];
            const k = a < b ? a * n + b : b * n + a;
            if (seen.has(k))
                return;
            seen.add(k);
            out.push(...mesh.positions[a], ...mesh.positions[b]);
        });
    return new Float32Array(out);
};
const EDGE_LIMIT = 300000; // faces: a bigger scene (a galaxy of super-stars) is drawn without edge lines
const partEdges = new WeakMap();
/** The edge lines of a scene: of its parts (kept while a part stays the same Mesh) or of the whole mesh. Empty when the scene is huge. */
export const sceneEdges = (mesh, parts) => {
    if (parts && parts.length) {
        if (parts.reduce((n, m) => n + m.faces.length, 0) > EDGE_LIMIT)
            return new Float32Array(0);
        const built = parts.map((m) => {
            let e = partEdges.get(m);
            if (!e)
                partEdges.set(m, (e = buildEdges(m)));
            return e;
        });
        const all = new Float32Array(built.reduce((n, e) => n + e.length, 0));
        let at = 0;
        for (const e of built)
            (all.set(e, at), (at += e.length));
        return all;
    }
    return mesh.faces.length > EDGE_LIMIT ? new Float32Array(0) : buildEdges(mesh);
};
/** Floats of one glow light: position (3), reach (1), colour times intensity (3), spare (1). */
export const LIGHT_FLOATS = 8;
export const MAX_LIGHTS = 16;
const emitters = new WeakMap();
/** Every emitting face of a mesh: centre (3), area times emit (1), colour (3), area (1). */
const emittersOf = (mesh, palette) => {
    const hit = emitters.get(mesh);
    if (hit && hit.palette === palette)
        return hit.data;
    const rows = [];
    for (const face of mesh.faces) {
        const s = surfaceOf(face, palette);
        if (s.emit < 0.05)
            continue;
        const pts = face.v.map((k) => mesh.positions[k]);
        const area = Math.hypot(...(faceNormal(pts))) || 0;
        if (!area)
            continue;
        const c = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
        const [r, g, b] = colorOf(s.color);
        rows.push(...c, area * s.emit, r, g, b, area);
    }
    const data = new Float32Array(rows);
    emitters.set(mesh, { palette, data });
    return data;
};
/**
 * Glow: the emitting faces of a scene act as local light sources. Faces close to each other (one cell of a grid) merge into
 * one light at their weighted centre; the brightest MAX_LIGHTS stay. Each light has a reach that grows with the emitting area.
 * Float32Array, LIGHT_FLOATS per light.
 */
export const sceneLights = (mesh, parts, palette) => {
    const list = (parts && parts.length ? parts : [mesh]).map((m) => emittersOf(m, palette)).filter((e) => e.length);
    if (!list.length)
        return new Float32Array(0);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const e of list)
        for (let i = 0; i < e.length; i += 8)
            for (let k = 0; k < 3; k++)
                (lo[k] = Math.min(lo[k], e[i + k]), (hi[k] = Math.max(hi[k], e[i + k])));
    const cell = Math.max((Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 6) || 1, 1e-3);
    const cells = new Map();
    for (const e of list) {
        for (let i = 0; i < e.length; i += 8) {
            const key = [0, 1, 2].map((k) => Math.floor((e[i + k] - lo[k]) / cell)).join(',');
            const c = cells.get(key) ?? { p: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0 };
            const w = e[i + 3];
            c.p += w;
            c.x += e[i] * w;
            c.y += e[i + 1] * w;
            c.z += e[i + 2] * w;
            c.r += e[i + 4] * w;
            c.g += e[i + 5] * w;
            c.b += e[i + 6] * w;
            c.a += e[i + 7];
            cells.set(key, c);
        }
    }
    const top = [...cells.values()].sort((a, b) => b.p - a.p).slice(0, MAX_LIGHTS);
    const out = new Float32Array(top.length * LIGHT_FLOATS);
    top.forEach((c, i) => {
        const reach = Math.max(2.5 * Math.sqrt(c.p), 0.05); // a 1 m x 1 m lamp at emit 1 reaches 2.5 m
        out.set([c.x / c.p, c.y / c.p, c.z / c.p, reach, c.r / c.p, c.g / c.p, c.b / c.p, 0], i * LIGHT_FLOATS);
    });
    return out;
};
const FLOATS = 14; // position(3) normal(3) color(3) material(4: metal, rough, alpha, emit) soft(1)
/**
 * Column-major 4x4 matrix (for WebGPU, z in 0..1) that maps world points exactly
 * like camera.project(): the same pixels, plus a depth between near and far.
 */
export const viewProjection = (cam, near = 0.03, far = 1e9) => {
    const kk = cam.k / (cam.size / 2);
    const row = (v, s) => [v[0] * s, v[1] * s, v[2] * s, -dot(v, cam.eye) * s];
    const a = cam.ortho ? 1 / (far - near) : far / (far - near);
    const zr = row(cam.f, a);
    zr[3] -= a * near;
    const rows = [row(cam.r, kk), row(cam.u, kk), zr, cam.ortho ? [0, 0, 0, 1] : row(cam.f, 1)];
    const m = new Float32Array(16);
    rows.forEach((r, i) => r.forEach((v, j) => (m[j * 4 + i] = v)));
    return m;
};
/**
 * Near plane for a scene seen from `cam`: the usual 0.03, unless everything is very far (a galaxy seen from outside, the
 * nearest point thousands of units away), where a near plane that close would leave no depth precision at all.
 */
export const nearPlane = (cam, mesh) => {
    const [ex, ey, ez] = cam.eye;
    const [fx, fy, fz] = cam.f;
    let nearest = Infinity;
    for (const p of mesh.positions) {
        const d = (p[0] - ex) * fx + (p[1] - ey) * fy + (p[2] - ez) * fz;
        if (d > 1e-6 && d < nearest)
            nearest = d;
    }
    return Number.isFinite(nearest) && nearest > 1000 ? nearest * 0.25 : 0.03; // (an empty scene, e.g. only a skin, has no nearest point)
};
const rgb = (color) => {
    const h = String(color ?? '').replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    if (!/^[0-9a-f]{6}$/i.test(full))
        return [0.78, 0.78, 0.78];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
/**
 * Smooth shading: a normal for every corner of every face. The faces that meet at a point (welded by position, so a
 * crack in the indices does not break it) are averaged, weighted by area, but only those within `crease` degrees of
 * this face: a 90 degree box corner stays sharp, a faceted fuselage becomes round.
 */
export const cornerNormals = (mesh, crease, soft) => {
    // the material's soft decides how far its edges may be smoothed: 0 keeps every edge hard, from 0.5 up the whole crease angle is allowed;
    // between two faces the harder one rules
    const cosAt = (i, j) => {
        const k = soft ? Math.min(1, 2 * Math.min(soft[i], soft[j])) : 1;
        return Math.cos((crease * k * Math.PI) / 180);
    };
    const area = mesh.faces.map((f) => faceNormal(f.v.map((k) => mesh.positions[k]))); // length = area
    const unit = area.map((n) => (Math.hypot(...n) > 0 ? norm(n) : [0, 1, 0]));
    const q = (bounds(mesh).radius || 1) * 1e-6;
    const key = (p) => `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)}`;
    const at = new Map();
    mesh.faces.forEach((f, i) => f.v.forEach((k) => {
        const id = key(mesh.positions[k]);
        const list = at.get(id) ?? [];
        if (list[list.length - 1] !== i)
            list.push(i);
        at.set(id, list);
    }));
    return mesh.faces.map((f, i) => f.v.map((k) => {
        const sum = [0, 0, 0];
        for (const j of at.get(key(mesh.positions[k])) ?? []) {
            if (i !== j && (soft ? Math.min(soft[i], soft[j]) <= 0 : false))
                continue;
            if (dot(unit[i], unit[j]) < cosAt(i, j) - 1e-12)
                continue;
            for (let c = 0; c < 3; c++)
                sum[c] += area[j][c];
        }
        return Math.hypot(...sum) > 0 ? norm(sum) : unit[i];
    }));
};
/**
 * Triangle list for the GPU: face normals (flat, or smoothed with `smooth` degrees), face colors and materials.
 * Float32Array, 14 floats per vertex.
 */
export const buildVertices = (mesh, palette, { smooth = 0 } = {}) => {
    let tris = 0;
    for (const f of mesh.faces)
        tris += Math.max(0, f.v.length - 2);
    const out = new Float32Array(tris * 3 * FLOATS);
    const corners = smooth > 0 ? cornerNormals(mesh, smooth, mesh.faces.map((f) => surfaceOf(f, palette).soft)) : null;
    let o = 0;
    mesh.faces.forEach((face, fi) => {
        const pts = face.v.map((k) => mesh.positions[k]);
        const flat = norm(faceNormal(pts));
        const s = surfaceOf(face, palette);
        const c = rgb(s.color);
        const mat = [s.metal, s.rough, s.alpha, s.emit];
        for (const tri of triangulate(pts)) {
            for (const k of tri) {
                out.set([...pts[k], ...(corners ? corners[fi][k] : flat), ...c, ...mat, s.soft], o);
                o += FLOATS;
            }
        }
    });
    return out;
};
/**
 * Triangle list of a skinned figure in its bind pose: buildVertices' 14 floats per vertex, then the indices of its four
 * strongest joints and their weights (summing to 1). The shader moves each vertex by its joints' bone matrices.
 */
export const buildSkinVertices = (meshes, weights, palette, { smooth = 0 } = {}) => {
    let tris = 0;
    for (const m of meshes)
        for (const f of m.faces)
            tris += Math.max(0, f.v.length - 2);
    const out = new Float32Array(tris * 3 * SKIN_FLOATS);
    let o = 0;
    meshes.forEach((mesh, m) => {
        const skin = weights[m];
        if (!skin || skin.length !== mesh.positions.length)
            throw new Error(`skin: mesh ${m} has ${mesh.positions.length} points, the weights know ${skin?.length ?? 0}`);
        const four = skin.map((w) => {
            const top = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sum = top.reduce((t, x) => t + x[1], 0) || 1;
            const j = [0, 0, 0, 0];
            const k = [0, 0, 0, 0];
            top.forEach(([joint, share], c) => {
                if (joint >= MAX_BONES)
                    throw new Error(`skin: joint ${joint} is over the limit of ${MAX_BONES}`);
                j[c] = joint;
                k[c] = share / sum;
            });
            return [...j, ...k];
        });
        const corners = smooth > 0 ? cornerNormals(mesh, smooth, mesh.faces.map((f) => surfaceOf(f, palette).soft)) : null;
        mesh.faces.forEach((face, fi) => {
            const pts = face.v.map((k) => mesh.positions[k]);
            const flat = norm(faceNormal(pts));
            const s = surfaceOf(face, palette);
            const c = rgb(s.color);
            const mat = [s.metal, s.rough, s.alpha, s.emit];
            for (const tri of triangulate(pts)) {
                for (const k of tri) {
                    out.set([...pts[k], ...(corners ? corners[fi][k] : flat), ...c, ...mat, s.soft, ...four[face.v[k]]], o);
                    o += SKIN_FLOATS;
                }
            }
        });
    });
    return out;
};
/** Splits a triangle list into the opaque triangles and the see-through ones (alpha < 1, float 11 of a vertex). */
export const splitGlass = (all, floats) => {
    const tri = 3 * floats;
    const solid = new Float32Array(all.length);
    const glass = new Float32Array(all.length);
    let a = 0;
    let b = 0;
    for (let o = 0; o < all.length; o += tri) {
        if (all[o + 11] < 1)
            (glass.set(all.subarray(o, o + tri), b), (b += tri));
        else
            (solid.set(all.subarray(o, o + tri), a), (a += tri));
    }
    return { solid: solid.subarray(0, a), glass: glass.subarray(0, b) };
};
/** A skin's vertices, kept while its meshes, palette and smoothing stay the same. */
export const skinCache = () => {
    let key = null;
    let data = null;
    return (skin, palette, crease) => {
        const same = key &&
            key.palette === palette &&
            key.crease === crease &&
            key.weights === skin.weights &&
            key.meshes.length === skin.meshes.length &&
            key.meshes.every((m, i) => m === skin.meshes[i]);
        if (same && data)
            return { ...data, fresh: false };
        data = splitGlass(buildSkinVertices(skin.meshes, skin.weights, palette, { smooth: crease }), SKIN_FLOATS);
        key = { meshes: [...skin.meshes], weights: skin.weights, palette, crease };
        return { ...data, fresh: true };
    };
};
const INSTANCE_FLOATS = 15; // at(3) ex(3) ey(3) ez(3) color(3)
/**
 * Per-instance data for drawInstances: one entry { at, axes: [ex, ey, ez], color } per copy of a
 * prototype mesh (modelled around the origin). Float32Array, 15 floats per instance.
 */
export const buildInstances = (items) => {
    const out = new Float32Array(items.length * INSTANCE_FLOATS);
    items.forEach((it, i) => out.set([...it.at, ...it.axes[0], ...it.axes[1], ...it.axes[2], ...rgb(it.color)], i * INSTANCE_FLOATS));
    return out;
};
export const defaultLight = { direction: norm([0.5, 0.8, 0.6]), sky: [1, 0.97, 0.92], ground: [0.42, 0.38, 0.36] };
export const defaultMaterial = { ambient: 0.62, diffuse: 0.78, specular: 0.2, shininess: 30 };
const SHADER = /* wgsl */ `
struct U {
  vp : mat4x4<f32>,
  light : vec4<f32>,   // xyz: direction towards the light
  sky : vec4<f32>,
  ground : vec4<f32>,
  eye : vec4<f32>,
  mat : vec4<f32>,     // ambient, diffuse, specular, shininess
  fx : vec4<f32>,      // filmic (0 or 1), exposure, emission gain, studio (0 or 1)
  fill : vec4<f32>,    // studio: xyz direction towards the fill light, w intensity
  rim : vec4<f32>,     // studio: xyz direction towards the rim light, w intensity
  res : vec4<f32>,     // marks: canvas pixels (x, y), device pixels per CSS pixel (z); w: number of glow lights
  lpos : array<vec4<f32>, 16>, // glow lights: xyz position, w reach
  lcol : array<vec4<f32>, 16>, // rgb colour times intensity
};
@group(0) @binding(0) var<uniform> u : U;
struct Bones { r : array<vec4<f32>, ${3 * 64}> }; // per joint three rows of [cols | shift]
@group(0) @binding(1) var<uniform> bones : Bones;

struct VIn { @location(0) pos : vec3<f32>, @location(1) nrm : vec3<f32>, @location(2) col : vec3<f32>, @location(8) mat : vec4<f32>, @location(9) soft : f32 };
struct VOut {
  @builtin(position) p : vec4<f32>,
  @location(0) n : vec3<f32>,
  @location(1) c : vec3<f32>,
  @location(2) w : vec3<f32>,
  @location(3) m : vec4<f32>,   // metal, rough, alpha, emit
  @location(4) s : f32,         // soft
};

@vertex fn vs(i : VIn) -> VOut {
  var o : VOut;
  o.p = u.vp * vec4<f32>(i.pos, 1.0);
  o.n = i.nrm;
  o.c = i.col;
  o.w = i.pos;
  o.m = i.mat;
  o.s = i.soft;
  return o;
}

struct SIn {
  @location(0) pos : vec3<f32>, @location(1) nrm : vec3<f32>, @location(2) col : vec3<f32>, @location(8) mat : vec4<f32>, @location(9) soft : f32,
  @location(10) j : vec4<f32>, @location(11) wt : vec4<f32>,
};
fn bone(k : u32, p : vec4<f32>) -> vec3<f32> {
  return vec3<f32>(dot(bones.r[k * 3u], p), dot(bones.r[k * 3u + 1u], p), dot(bones.r[k * 3u + 2u], p));
}
// a skinned figure: every vertex is moved by up to four joints, mixed by its weights (the normal by their turns)
@vertex fn vss(i : SIn) -> VOut {
  var o : VOut;
  var p = vec3<f32>(0.0);
  var n = vec3<f32>(0.0);
  for (var c = 0u; c < 4u; c = c + 1u) {
    let w = i.wt[c];
    if (w > 0.0) {
      let k = u32(i.j[c] + 0.5);
      p = p + bone(k, vec4<f32>(i.pos, 1.0)) * w;
      n = n + bone(k, vec4<f32>(i.nrm, 0.0)) * w;
    }
  }
  o.p = u.vp * vec4<f32>(p, 1.0);
  o.n = n;
  o.c = i.col;
  o.w = p;
  o.m = i.mat;
  o.s = i.soft;
  return o;
}

// a screen: a picture on a quad, as it is (a display does not take the scene's light)
@group(1) @binding(0) var scrSampler : sampler;
@group(1) @binding(1) var scrTex : texture_2d<f32>;
struct QOut { @builtin(position) p : vec4<f32>, @location(0) uv : vec2<f32> };
@vertex fn vsq(@location(0) pos : vec3<f32>, @location(1) uv : vec2<f32>) -> QOut {
  var o : QOut;
  o.p = u.vp * vec4<f32>(pos, 1.0);
  o.uv = uv;
  return o;
}
@fragment fn fsq(i : QOut) -> @location(0) vec4<f32> {
  return vec4<f32>(textureSample(scrTex, scrSampler, i.uv).rgb, 1.0);
}
// a hole: transparent, so what lies behind the canvas shows through
@fragment fn fsh(i : QOut) -> @location(0) vec4<f32> {
  return vec4<f32>(0.0);
}

struct IIn {
  @location(0) pos : vec3<f32>, @location(1) nrm : vec3<f32>,
  @location(3) at : vec3<f32>, @location(4) ex : vec3<f32>, @location(5) ey : vec3<f32>, @location(6) ez : vec3<f32>,
  @location(7) col : vec3<f32>,
};

// the same prototype drawn many times: its frame (ex, ey, ez, scaled axes scale it) and position come per instance
@vertex fn vsi(i : IIn) -> VOut {
  var o : VOut;
  let w = i.at + i.ex * i.pos.x + i.ey * i.pos.y + i.ez * i.pos.z;
  o.p = u.vp * vec4<f32>(w, 1.0);
  // the axes may be scaled (a thin long bar from the same prototype): normals follow the unit axes
  o.n = normalize(i.ex) * i.nrm.x + normalize(i.ey) * i.nrm.y + normalize(i.ez) * i.nrm.z;
  o.c = i.col;
  o.w = w;
  o.m = vec4<f32>(0.0, 0.7, 1.0, 0.0);
  o.s = 0.0;
  return o;
}

// the edge lines: 1 pixel, nudged a hair towards the eye so they win against the faces they lie on
@vertex fn vsl(@location(0) pos : vec3<f32>) -> @builtin(position) vec4<f32> {
  var p = u.vp * vec4<f32>(pos, 1.0);
  p.z = p.z - 0.0002 * p.w;
  return p;
}
@fragment fn fsl() -> @location(0) vec4<f32> {
  // dark lines on the lit picture; with no light the picture is dark, so the lines turn light
  let g = select(0.0, 0.85, u.light.w > 0.5);
  return vec4<f32>(g, g, g, select(0.4, 0.55, u.light.w > 0.5));
}

// the marks: thick round-capped segments, expanded to screen-space quads, drawn over everything (no depth test)
struct MOut { @builtin(position) p : vec4<f32>, @location(0) q : vec2<f32>, @location(1) c : vec4<f32>, @location(2) h : vec3<f32> };
@vertex fn vsm(@builtin(vertex_index) vi : u32, @location(0) a : vec3<f32>, @location(1) b : vec3<f32>, @location(2) col : vec4<f32>, @location(3) wd : f32) -> MOut {
  var o : MOut;
  var ca = u.vp * vec4<f32>(a, 1.0);
  var cb = u.vp * vec4<f32>(b, 1.0);
  let e = 0.001;
  o.p = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  if (ca.w < e && cb.w < e) { return o; }
  if (ca.w < e) { ca = mix(ca, cb, (e - ca.w) / (cb.w - ca.w)); }
  if (cb.w < e) { cb = mix(cb, ca, (e - cb.w) / (ca.w - cb.w)); }
  let half = vec2<f32>(u.res.x, u.res.y) * 0.5;
  let pa = ca.xy / ca.w * half;
  let pb = cb.xy / cb.w * half;
  let len = length(pb - pa);
  var d = vec2<f32>(1.0, 0.0);
  if (len > 0.0001) { d = (pb - pa) / len; }
  let hw = wd * u.res.z * 0.5;
  let n = vec2<f32>(-d.y, d.x);
  let cx = array<f32, 6>(0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  let cy = array<f32, 6>(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
  let t = cx[vi];
  let s = cy[vi];
  let ext = hw + 1.0;
  let along = mix(-ext, len + ext, t);
  let across = s * ext;
  let pos = pa + d * along + n * across;
  o.p = vec4<f32>(pos / half, 0.0, 1.0);
  o.q = vec2<f32>(along, across);
  o.c = col;
  o.h = vec3<f32>(len, hw, 0.0);
  return o;
}
@fragment fn fsm(i : MOut) -> @location(0) vec4<f32> {
  let dx = max(max(-i.q.x, i.q.x - i.h.x), 0.0);
  let dist = length(vec2<f32>(dx, i.q.y));
  let cov = clamp(i.h.y + 0.5 - dist, 0.0, 1.0);
  return vec4<f32>(i.c.rgb, i.c.a * cov);
}

fn toLinear(c : vec3<f32>) -> vec3<f32> {
  return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn toSrgb(c : vec3<f32>) -> vec3<f32> {
  return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// ACES filmic curve (Narkowicz fit): highlights roll off softly instead of clipping
fn aces(x : vec3<f32>) -> vec3<f32> {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Direct light, shared by both looks: x diffuse, y highlight, z scattered light (soft materials).
// Studio: the key light is u.light (placed by the camera), plus a softer fill and a rim light that only edges the shape.
fn lights(n : vec3<f32>, v : vec3<f32>, shin : f32, soft : f32) -> vec3<f32> {
  let key = normalize(u.light.xyz);
  let ndl = dot(n, key);
  // soft: the light wraps round the form, and a warm band of scattered light sits where light turns to shade
  var diff = max((ndl + soft) / (1.0 + soft), 0.0);
  let h = normalize(key + v);
  var spec = pow(max(dot(n, h), 0.0), shin) * step(0.0, ndl);
  let scat = soft * exp(-ndl * ndl * 5.0);
  if (u.fx.w > 0.5) {
    diff = diff * 0.85; // three lights add up: the key takes a little less
    let fl = normalize(u.fill.xyz);
    diff = diff + max((dot(n, fl) + soft) / (1.0 + soft), 0.0) * u.fill.w;
    let rl = normalize(u.rim.xyz);
    let edge = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    diff = diff + max(dot(n, rl), 0.0) * edge * u.rim.w * 2.0;
    let rh = normalize(rl + v);
    spec = spec + pow(max(dot(n, rh), 0.0), shin) * step(0.0, dot(n, rl)) * u.rim.w * 0.6 * edge;
  }
  return vec3<f32>(diff, spec, scat);
}

// Glow: every emitting cluster is a local light with a smooth falloff to zero at its reach, a little wrap so shade edges soften
fn glowAt(p : vec3<f32>, n : vec3<f32>) -> vec3<f32> {
  var sum = vec3<f32>(0.0);
  let cnt = u32(u.res.w);
  for (var k = 0u; k < cnt; k = k + 1u) {
    let d = u.lpos[k].xyz - p;
    let dist = max(length(d), 0.001);
    let reach = u.lpos[k].w;
    let x = dist / reach;
    var win = clamp(1.0 - x * x * x * x, 0.0, 1.0);
    win = win * win;
    let s = dist / (reach * 0.25);
    let wrap = max((dot(n, d / dist) + 0.3) / 1.3, 0.0);
    sum = sum + u.lcol[k].rgb * (win / (1.0 + s * s)) * wrap * 1.6;
  }
  return sum;
}

// The filmic path: the same light model, but in linear colour with HDR light and emission, then tone mapped.
fn filmic(i : VOut, n : vec3<f32>, l : vec3<f32>, v : vec3<f32>) -> vec4<f32> {
  let metal = i.m.x;
  let rough = i.m.y;
  let albedo = toLinear(i.c);
  let hemi = mix(toLinear(u.ground.rgb), toLinear(u.sky.rgb), n.y * 0.5 + 0.5) * u.mat.x * select(1.0, 0.7, u.fx.w > 0.5);
  let shin = mix(u.mat.w * 7.0, u.mat.w * 0.15, rough);
  let lt = lights(n, v, shin, i.s);
  let diff = lt.x * u.mat.y * 1.6;
  let spec = lt.y * mix(u.mat.z, 1.0, metal) * mix(1.0, 0.35, rough) * 2.5;
  let r = reflect(-v, n);
  // Schlick: edges mirror more, metal keeps its tint
  let f0 = mix(vec3<f32>(0.04), albedo, metal);
  let fres = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - max(dot(n, v), 0.0), 5.0) * (1.0 - rough);
  let env = mix(toLinear(u.ground.rgb) * 1.2, toLinear(u.sky.rgb) * 1.5, smoothstep(-0.25 - rough * 0.5, 0.25 + rough * 0.5, r.y));
  var lit = albedo * (hemi + vec3<f32>(diff)) * (1.0 - metal)
          + albedo * env * metal * (1.0 - 0.6 * rough)
          + env * fres * (1.0 - rough) * 0.5
          + vec3<f32>(spec) * mix(vec3<f32>(1.0), albedo, metal);
  // emission adds light, so a lamp can go above 1.0 and still keep its colour after tone mapping
  lit = lit + albedo * vec3<f32>(1.0, 0.38, 0.26) * lt.z * 0.5 * (1.0 - metal); // soft: the warm scattered band
  lit = lit + albedo * toLinear(vec3<f32>(1.0)) * glowAt(i.w, n) * (1.0 - metal);
  lit = lit + albedo * i.m.w * u.fx.z;
  return vec4<f32>(toSrgb(aces(lit * u.fx.y)), i.m.z);
}

@fragment fn fs(i : VOut, @builtin(front_facing) front : bool) -> @location(0) vec4<f32> {
  var n = normalize(i.n);
  if (!front) { n = -n; }
  let l = normalize(u.light.xyz);
  let v = normalize(u.eye.xyz - i.w);
  if (u.light.w > 0.5) {
    // unlit: no light in the scene, only what glows
    let g = glowAt(i.w, n) * (1.0 - i.m.x);
    if (u.fx.x > 0.5) { return vec4<f32>(toSrgb(aces((toLinear(i.c) * (i.m.w * u.fx.z + g)) * u.fx.y)), i.m.z); }
    return vec4<f32>(clamp(i.c * (min(i.m.w, 1.0) + g), vec3<f32>(0.0), vec3<f32>(1.0)), i.m.z);
  }
  if (u.fx.x > 0.5) { return filmic(i, n, l, v); }
  let metal = i.m.x;
  let rough = i.m.y;
  let hemi = mix(u.ground.rgb, u.sky.rgb, n.y * 0.5 + 0.5) * u.mat.x * select(1.0, 0.7, u.fx.w > 0.5);
  // roughness widens the highlight; metal makes it strong and tinted by the color
  let shin = mix(u.mat.w * 7.0, u.mat.w * 0.15, rough);
  let lt = lights(n, v, shin, i.s);
  let diff = lt.x * u.mat.y;
  let spec = lt.y * mix(u.mat.z, 1.0, metal) * mix(1.0, 0.35, rough);
  // metal mirrors the sky above and the ground below, blurred by roughness
  let r = reflect(-v, n);
  let env = mix(u.ground.rgb * 1.2, u.sky.rgb * 1.5, smoothstep(-0.25 - rough * 0.5, 0.25 + rough * 0.5, r.y));
  var lit = i.c * (hemi + vec3<f32>(diff)) * (1.0 - metal)
          + i.c * env * metal * (1.0 - 0.6 * rough)
          + vec3<f32>(spec) * mix(vec3<f32>(1.0), i.c, metal)
          + i.c * vec3<f32>(1.0, 0.38, 0.26) * lt.z * 0.25 * (1.0 - metal);
  lit = lit + i.c * glowAt(i.w, n) * (1.0 - metal);
  lit = mix(lit, i.c * 1.15, min(i.m.w, 1.0)); // the plain look: emit 0..1 fades to flat colour, more does not add
  return vec4<f32>(clamp(lit, vec3<f32>(0.0), vec3<f32>(1.0)), i.m.z);
}
`;
/**
 * Sets up WebGPU on a canvas. Rejects when WebGPU is not available.
 * Returns { render(mesh, view, options), destroy() }.
 * render options: size (CSS px, the canvas is made size x size), fit, instances { mesh, data } (many copies of one
 * prototype mesh, data from buildInstances; drawn after the mesh), background [r,g,b] 0..1,
 * light { direction, sky, ground }, material { ambient, diffuse, specular, shininess }, dpr.
 */
export const createGpu = async (canvas, { sampleCount = 4, onError } = {}) => {
    if (!globalThis.navigator?.gpu)
        throw new Error('WebGPU is not available in this browser');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
        throw new Error('No WebGPU adapter found');
    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (e) => {
        const message = String(e.error?.message ?? e);
        console.error('WebGPU:', message);
        onError?.(message);
    });
    device.lost.then((info) => console.error('WebGPU device lost:', info.reason, info.message));
    const context = canvas.getContext('webgpu');
    if (!context)
        throw new Error('Could not get a WebGPU canvas context');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' }); // opaque everywhere but where a screen punches a hole
    const module = device.createShaderModule({ code: SHADER });
    // shader compile errors are reported to onError too (the browser only logs them to the console)
    module.getCompilationInfo?.().then((info) => {
        for (const m of info.messages ?? [])
            if (m.type === 'error')
                onError?.(`shader line ${m.lineNum}: ${m.message}`);
    });
    const meshLayout = {
        arrayStride: FLOATS * 4,
        attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 8, offset: 36, format: 'float32x4' },
            { shaderLocation: 9, offset: 52, format: 'float32' },
        ],
    };
    const instanceLayout = {
        arrayStride: INSTANCE_FLOATS * 4,
        stepMode: 'instance',
        attributes: [3, 4, 5, 6, 7].map((loc, k) => ({ shaderLocation: loc, offset: k * 12, format: 'float32x3' })),
    };
    // ONE explicit layout for every pipeline: with 'auto' each pipeline gets its own, and a bind group made for one is refused by the others
    const bindLayout = device.createBindGroupLayout({
        // visibility 1 | 2 = GPUShaderStage.VERTEX | FRAGMENT
        entries: [
            { binding: 0, visibility: 1 | 2, buffer: { type: 'uniform' } },
            { binding: 1, visibility: 1, buffer: { type: 'uniform' } }, // the bones of a skin
        ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindLayout] });
    const make = (entry, buffers, glass = false) => device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: entry, buffers },
        fragment: {
            module,
            entryPoint: 'fs',
            targets: [
                glass
                    ? {
                        format,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }
                    : { format },
            ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        // see-through faces (alpha < 1) are blended over what is behind them: they test depth but do not write it
        depthStencil: { format: 'depth24plus', depthWriteEnabled: !glass, depthCompare: 'less' },
        multisample: { count: sampleCount },
    });
    const pipeline = make('vs', [meshLayout]);
    const skinLayout = {
        arrayStride: SKIN_FLOATS * 4,
        attributes: [...meshLayout.attributes, { shaderLocation: 10, offset: 56, format: 'float32x4' }, { shaderLocation: 11, offset: 72, format: 'float32x4' }],
    };
    const skinPipeline = make('vss', [skinLayout]);
    const skinGlassPipeline = make('vss', [skinLayout], true);
    // screens: a second bind group with the picture (one texture per screen)
    const texLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: 2, sampler: {} },
            { binding: 1, visibility: 2, texture: {} },
        ],
    });
    const screenPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindLayout, texLayout] }),
        vertex: {
            module,
            entryPoint: 'vsq',
            buffers: [{ arrayStride: SCREEN_FLOATS * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x2' }] }],
        },
        fragment: { module, entryPoint: 'fsq', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        multisample: { count: sampleCount },
    });
    const holePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module,
            entryPoint: 'vsq',
            buffers: [{ arrayStride: SCREEN_FLOATS * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x2' }] }],
        },
        fragment: { module, entryPoint: 'fsh', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        multisample: { count: sampleCount },
    });
    const screenSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const screenTex = [];
    let screenBuffer = null;
    let screenCap = 0;
    let screenCount = 0;
    const glassPipeline = make('vs', [meshLayout], true);
    // the instanced pipeline reads position and normal only from the prototype (locations 0, 1)
    const instPipeline = make('vsi', [{ ...meshLayout, attributes: meshLayout.attributes.slice(0, 2) }, instanceLayout]);
    const linePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: 'vsl', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
        fragment: {
            module,
            entryPoint: 'fsl',
            targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
        },
        primitive: { topology: 'line-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
        multisample: { count: sampleCount },
    });
    const markPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module,
            entryPoint: 'vsm',
            buffers: [
                {
                    arrayStride: MARK_FLOATS * 4,
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 12, format: 'float32x3' },
                        { shaderLocation: 2, offset: 24, format: 'float32x4' },
                        { shaderLocation: 3, offset: 40, format: 'float32' },
                    ],
                },
            ],
        },
        fragment: {
            module,
            entryPoint: 'fsm',
            targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
        multisample: { count: sampleCount },
    });
    const uniforms = device.createBuffer({ size: 720, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const boneBuffer = device.createBuffer({ size: MAX_BONES * 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const entries = [{ binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: { buffer: boneBuffer } }];
    const bind = device.createBindGroup({ layout: bindLayout, entries });
    const instBind = device.createBindGroup({ layout: bindLayout, entries });
    const skinVerts = skinCache();
    let skinSolid = null;
    let skinSolidCap = 0;
    let skinGlass = null;
    let skinGlassCap = 0;
    let skinSolidCount = 0;
    let skinGlassCount = 0;
    // Geometry that did not change since the last frame is not rebuilt or uploaded again.
    let uploaded = null; // the mesh now in vertexBuffer
    let uploadedPalette; // and the palette it was built with
    let uploadedSmooth = 0; // and the smoothing
    let partCache = new WeakMap(); // vertices per part mesh (see `parts`)
    let partPalette;
    let partSmooth = 0;
    let vertexCount = 0;
    let protoMesh = null;
    let protoBuffer = null;
    let protoCount = 0;
    let instBuffer = null;
    let instCapacity = 0;
    let instData = null;
    let instCount = 0;
    let vertexBuffer = null;
    let capacity = 0;
    let markBuffer = null;
    let markCapacity = 0;
    let markCount = 0;
    let edgeBuffer = null;
    let edgeCapacity = 0;
    let edgeCount = 0; // vertices (two per line)
    let edgeMesh = null;
    let edgeParts;
    let edgeOn = false;
    let glassBuffer = null; // the see-through triangles, sorted far to near for the eye
    let glassCapacity = 0;
    let glassTris = []; // centroid and offset (in floats) in glassSource
    let glassSource = new Float32Array(0);
    let glassCount = 0;
    let glassEye = '';
    let px = 0;
    let depth = null;
    let color = null;
    const targets = (n) => {
        if (n === px)
            return;
        px = n;
        canvas.width = n;
        canvas.height = n;
        depth?.destroy();
        color?.destroy();
        depth = device.createTexture({ size: [n, n], format: 'depth24plus', sampleCount, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        color = sampleCount > 1 ? device.createTexture({ size: [n, n], format, sampleCount, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    };
    const draw = (mesh, view, { size = 400, fit, background = [0.98, 0.98, 0.97], light = {}, material = {}, palette, dpr = globalThis.devicePixelRatio || 1, instances, parts, tonemap = false, smooth = false, studio = false, edges = false, marks, unlit = false, glow = false, skin, screens } = {}, readback = false) => {
        const L = { ...defaultLight, ...light };
        const filmic = tonemap ? { exposure: 1, emit: 2, ...(tonemap === true ? {} : tonemap) } : null;
        const M = { ...defaultMaterial, ...material };
        const cam = makeCamera(view, mesh, size, fit);
        targets(Math.max(1, Math.round(size * dpr)));
        const crease = smooth === true ? 40 : smooth || 0;
        if (mesh !== uploaded || palette !== uploadedPalette || crease !== uploadedSmooth) {
            uploadedSmooth = crease;
            let all;
            if (parts && parts.length) {
                if (palette !== partPalette || crease !== partSmooth) {
                    partCache = new WeakMap();
                    partPalette = palette;
                    partSmooth = crease;
                }
                const built = parts.map((m) => {
                    let v = partCache.get(m);
                    if (!v)
                        partCache.set(m, (v = buildVertices(m, palette, { smooth: crease })));
                    return v;
                });
                all = new Float32Array(built.reduce((n, v) => n + v.length, 0));
                let at = 0;
                for (const v of built) {
                    all.set(v, at);
                    at += v.length;
                }
            }
            else
                all = buildVertices(mesh, palette, { smooth: crease });
            // split: solid triangles are drawn first; triangles with alpha < 1 are kept apart and blended afterwards
            const tri = 3 * FLOATS;
            const solid = new Float32Array(all.length);
            let solidLen = 0;
            glassTris = [];
            for (let o = 0; o < all.length; o += tri) {
                if (all[o + 11] < 1) {
                    const c = [0, 1, 2].map((k) => (all[o + k] + all[o + FLOATS + k] + all[o + 2 * FLOATS + k]) / 3);
                    glassTris.push({ c, at: o });
                }
                else {
                    solid.set(all.subarray(o, o + tri), solidLen);
                    solidLen += tri;
                }
            }
            glassSource = all;
            glassEye = '';
            const verts = solid.subarray(0, solidLen);
            if (verts.byteLength > capacity) {
                vertexBuffer?.destroy();
                capacity = Math.max(verts.byteLength, 4096);
                vertexBuffer = device.createBuffer({ size: capacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            if (verts.byteLength)
                device.queue.writeBuffer(vertexBuffer, 0, verts);
            vertexCount = verts.length / FLOATS;
            uploaded = mesh;
            uploadedPalette = palette;
        }
        if (!edges)
            edgeCount = 0;
        else if (mesh !== edgeMesh || parts !== edgeParts || !edgeOn) {
            const e = sceneEdges(mesh, parts);
            if (e.byteLength > edgeCapacity) {
                edgeBuffer?.destroy();
                edgeCapacity = Math.max(e.byteLength, 4096);
                edgeBuffer = device.createBuffer({ size: edgeCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            if (e.byteLength)
                device.queue.writeBuffer(edgeBuffer, 0, e);
            edgeCount = e.length / 3;
            edgeMesh = mesh;
            edgeParts = parts;
        }
        edgeOn = edges;
        if (instances?.mesh && instances.mesh !== protoMesh) {
            const v = buildVertices(instances.mesh);
            protoBuffer?.destroy();
            protoBuffer = device.createBuffer({ size: Math.max(v.byteLength, 256), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            device.queue.writeBuffer(protoBuffer, 0, v);
            protoCount = v.length / FLOATS;
            protoMesh = instances.mesh;
        }
        if (instances?.data && instances.data !== instData) {
            const d = instances.data;
            if (d.byteLength > instCapacity) {
                instBuffer?.destroy();
                instCapacity = Math.max(d.byteLength, 4096);
                instBuffer = device.createBuffer({ size: instCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            if (d.byteLength)
                device.queue.writeBuffer(instBuffer, 0, d);
            instData = d;
            instCount = d.length / INSTANCE_FLOATS;
        }
        if (!instances)
            instCount = 0;
        if (skin && skin.meshes.length) {
            const v = skinVerts(skin, palette, crease);
            if (v.fresh) {
                if (v.solid.byteLength > skinSolidCap) {
                    skinSolid?.destroy();
                    skinSolidCap = Math.max(v.solid.byteLength, 4096);
                    skinSolid = device.createBuffer({ size: skinSolidCap, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                }
                if (v.solid.byteLength)
                    device.queue.writeBuffer(skinSolid, 0, v.solid);
                if (v.glass.byteLength > skinGlassCap) {
                    skinGlass?.destroy();
                    skinGlassCap = Math.max(v.glass.byteLength, 4096);
                    skinGlass = device.createBuffer({ size: skinGlassCap, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                }
                if (v.glass.byteLength)
                    device.queue.writeBuffer(skinGlass, 0, v.glass);
                skinSolidCount = v.solid.length / SKIN_FLOATS;
                skinGlassCount = v.glass.length / SKIN_FLOATS;
            }
            const b = skin.bones.subarray(0, MAX_BONES * 12);
            if (b.byteLength)
                device.queue.writeBuffer(boneBuffer, 0, b);
        }
        else
            skinSolidCount = skinGlassCount = 0;
        const eyeKey = cam.eye.join(',');
        if (glassTris.length && eyeKey !== glassEye) {
            glassEye = eyeKey;
            const [ex, ey, ez] = cam.eye;
            const far = (t) => (t.c[0] - ex) ** 2 + (t.c[1] - ey) ** 2 + (t.c[2] - ez) ** 2;
            const sorted = [...glassTris].sort((a, b) => far(b) - far(a)); // far first
            const out = new Float32Array(sorted.length * 3 * FLOATS);
            sorted.forEach((t, k) => out.set(glassSource.subarray(t.at, t.at + 3 * FLOATS), k * 3 * FLOATS));
            if (out.byteLength > glassCapacity) {
                glassBuffer?.destroy();
                glassCapacity = Math.max(out.byteLength, 4096);
                glassBuffer = device.createBuffer({ size: glassCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            device.queue.writeBuffer(glassBuffer, 0, out);
            glassCount = sorted.length * 3;
        }
        if (!glassTris.length)
            glassCount = 0;
        // studio rig, relative to the camera: key upper left in front, fill from the right, rim from behind and above
        const rig = (f, r, up) => norm([0, 1, 2].map((k) => -cam.f[k] * f + cam.r[k] * r + cam.u[k] * up));
        const S = studio ? { fill: 0.4, rim: 1, ...(studio === true ? {} : studio) } : null;
        const u = new Float32Array(52 + MAX_LIGHTS * 8);
        u.set(viewProjection(cam, nearPlane(cam, mesh)), 0);
        u.set([...(S ? rig(0.7, -0.5, 0.6) : norm(L.direction)), unlit ? 1 : 0], 16);
        u.set([...L.sky, 0], 20);
        u.set([...L.ground, 0], 24);
        u.set([...cam.eye, 0], 28);
        u.set([M.ambient, M.diffuse, M.specular, M.shininess], 32);
        u.set([filmic ? 1 : 0, filmic ? filmic.exposure : 1, filmic ? filmic.emit : 0, S ? 1 : 0], 36);
        u.set([...rig(0.6, 0.8, 0.1), S ? S.fill : 0], 40);
        u.set([...rig(-0.8, 0.3, 0.5), S ? S.rim : 0], 44);
        const lights = glow ? sceneLights(mesh, parts, palette) : new Float32Array(0);
        u.set([px, px, px / size, lights.length / LIGHT_FLOATS], 48);
        for (let k = 0; k < lights.length / LIGHT_FLOATS; k++) {
            u.set(lights.subarray(k * LIGHT_FLOATS, k * LIGHT_FLOATS + 4), 52 + k * 4);
            u.set([...lights.subarray(k * LIGHT_FLOATS + 4, k * LIGHT_FLOATS + 7), 0], 52 + MAX_LIGHTS * 4 + k * 4);
        }
        device.queue.writeBuffer(uniforms, 0, u);
        const markData = marks?.length ? buildMarks(marks) : null;
        markCount = markData ? markData.length / MARK_FLOATS : 0;
        if (markData && markData.byteLength) {
            if (markData.byteLength > markCapacity) {
                markBuffer?.destroy();
                markCapacity = Math.ceil(markData.byteLength * 1.5);
                markBuffer = device.createBuffer({ size: markCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            device.queue.writeBuffer(markBuffer, 0, markData);
        }
        // screens: copy each picture into its texture (made again when its size changes) and the quads into one buffer
        screenCount = 0;
        const shown = [];
        const holes = [];
        (screens ?? []).forEach((sc, i) => {
            if (sc.hole)
                return void holes.push(i);
            const w = sc.source?.width | 0;
            const h = sc.source?.height | 0;
            if (!w || !h)
                return;
            let t = screenTex[i];
            if (!t || t.w !== w || t.h !== h) {
                t?.tex.destroy();
                const tex = device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
                const group = device.createBindGroup({ layout: texLayout, entries: [{ binding: 0, resource: screenSampler }, { binding: 1, resource: tex.createView() }] });
                t = screenTex[i] = { tex, w, h, group };
            }
            try {
                device.queue.copyExternalImageToTexture({ source: sc.source }, { texture: t.tex }, [w, h]);
                shown.push(i);
            }
            catch (err) {
                onError?.(`screen ${i}: ${err.message}`);
            }
        });
        if (shown.length || holes.length) {
            const quads = buildScreenQuads(screens);
            if (quads.byteLength > screenCap) {
                screenBuffer?.destroy();
                screenCap = quads.byteLength;
                screenBuffer = device.createBuffer({ size: screenCap, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            device.queue.writeBuffer(screenBuffer, 0, quads);
            screenCount = shown.length + holes.length;
        }
        const encoder = device.createCommandEncoder();
        const offscreen = readback
            ? device.createTexture({ size: [px, px], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
            : null;
        const target = (offscreen ?? context.getCurrentTexture()).createView();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: color ? color.createView() : target,
                    resolveTarget: color ? target : undefined,
                    clearValue: { r: background[0], g: background[1], b: background[2], a: 1 },
                    loadOp: 'clear',
                    storeOp: color ? 'discard' : 'store',
                },
            ],
            depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
        });
        if (vertexCount) {
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.draw(vertexCount);
        }
        if (instCount && protoCount) {
            pass.setPipeline(instPipeline);
            pass.setBindGroup(0, instBind);
            pass.setVertexBuffer(0, protoBuffer);
            pass.setVertexBuffer(1, instBuffer);
            pass.draw(protoCount, instCount);
        }
        if (shown.length) {
            pass.setPipeline(screenPipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, screenBuffer);
            for (const i of shown) {
                pass.setBindGroup(1, screenTex[i].group);
                pass.draw(6, 1, i * 6);
            }
        }
        if (holes.length) {
            pass.setPipeline(holePipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, screenBuffer);
            for (const i of holes)
                pass.draw(6, 1, i * 6);
        }
        if (skinSolidCount) {
            pass.setPipeline(skinPipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, skinSolid);
            pass.draw(skinSolidCount);
        }
        if (edgeCount) {
            pass.setPipeline(linePipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, edgeBuffer);
            pass.draw(edgeCount);
        }
        if (glassCount) {
            // after everything solid (and the instances): see-through faces, far to near
            pass.setPipeline(glassPipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, glassBuffer);
            pass.draw(glassCount);
        }
        if (skinGlassCount) {
            pass.setPipeline(skinGlassPipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, skinGlass);
            pass.draw(skinGlassCount);
        }
        if (markCount) {
            pass.setPipeline(markPipeline);
            pass.setBindGroup(0, bind);
            pass.setVertexBuffer(0, markBuffer);
            pass.draw(6, markCount);
        }
        pass.end();
        if (!offscreen) {
            device.queue.submit([encoder.finish()]);
            return null;
        }
        const row = Math.ceil((px * 4) / 256) * 256;
        const out = device.createBuffer({ size: row * px, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        encoder.copyTextureToBuffer({ texture: offscreen }, { buffer: out, bytesPerRow: row }, [px, px]);
        device.queue.submit([encoder.finish()]);
        return out.mapAsync(GPUMapMode.READ).then(() => {
            const raw = new Uint8Array(out.getMappedRange());
            const data = new Uint8ClampedArray(px * px * 4);
            const swap = format.startsWith('bgra');
            for (let y = 0; y < px; y++) {
                for (let x = 0; x < px; x++) {
                    const i = y * row + x * 4;
                    const o = (y * px + x) * 4;
                    data[o] = raw[i + (swap ? 2 : 0)];
                    data[o + 1] = raw[i + 1];
                    data[o + 2] = raw[i + (swap ? 0 : 2)];
                    data[o + 3] = 255;
                }
            }
            out.unmap();
            out.destroy();
            offscreen.destroy();
            return { width: px, height: px, data };
        });
    };
    /** Draws a frame onto the canvas. */
    const render = (mesh, view, options) => {
        draw(mesh, view, options);
    };
    /** Draws a frame into an offscreen texture and reads it back: Promise<{ width, height, data: RGBA }>. */
    const pixels = (mesh, view, options) => draw(mesh, view, options, true);
    const destroy = () => {
        vertexBuffer?.destroy();
        glassBuffer?.destroy();
        markBuffer?.destroy();
        protoBuffer?.destroy();
        instBuffer?.destroy();
        skinSolid?.destroy();
        skinGlass?.destroy();
        screenBuffer?.destroy();
        for (const t of screenTex)
            t?.tex.destroy();
        boneBuffer.destroy();
        depth?.destroy();
        color?.destroy();
        uniforms.destroy();
        device.destroy();
    };
    return { render, pixels, destroy, device, adapter };
};

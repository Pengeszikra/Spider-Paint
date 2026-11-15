// Planets drawn by a shader: a ray-traced sphere over the scene. Every planet is a screen-space quad (the rectangle its sphere,
// atmosphere and rings cover); the fragment shader casts the pixel's ray against the sphere and the ring plane and paints a
// procedural surface (rocky with maria and craters, gas giant bands with a storm, an Earth-like world with oceans, land, ice,
// clouds, sun glint and city lights, an ice giant, a cloud-wrapped world), lit from the light's position (each planet its
// own phase), with an atmosphere rim and halo, and rings with the planet's shadow on them and their shadow on the planet. It
// writes its own depth (the usual or the logarithmic one), so it hides and is hidden like a mesh: a plain sphere mesh at the
// same place stays under it (for picking, positioning, the SVG renderer). Everything is computed relative to the eye in
// double precision on the CPU and in units of the planet's radius on the GPU, so a planet 10⁻¹⁰ light years big is exact.
export const PLANET_FLOATS = 36;
const KINDS = { rock: 0, gas: 1, earth: 2, ice: 3, cloud: 4 };
const rgb = (hex, fallback) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
    if (!m)
        return fallback;
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The 4x4 inverse (column-major), or null. */
export const inv4 = (m) => {
    const a = Array.from(m);
    const o = new Array(16);
    o[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    o[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    o[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    o[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    o[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    o[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    o[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    o[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    o[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    o[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    o[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    o[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    o[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    o[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    o[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    o[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    const det = a[0] * o[0] + a[1] * o[4] + a[2] * o[8] + a[3] * o[12];
    if (!det)
        return null;
    return Float32Array.from(o, (v) => v / det);
};
/**
 * The per-planet data for the shader: each planet relative to the eye (in doubles), in units of its radius, with the screen
 * rectangle it covers (from `vpRot`, the view-projection with the eye at the origin). Planets off screen are left out.
 */
export const planetInstances = (planets, eye, vpRot) => {
    const out = [];
    const m = vpRot;
    for (const p of planets) {
        const R = p.radius;
        if (!(R > 0))
            continue;
        const c = [p.center[0] - eye[0], p.center[1] - eye[1], p.center[2] - eye[2]];
        const atm = p.atmosphere ? (p.atmosphere.size ?? 0.025) : 0;
        const reach = R * Math.max(1 + atm * 1.5, p.ring?.outer ?? 0) * 1.02;
        const d = Math.hypot(c[0], c[1], c[2]);
        let rect = [-1, -1, 1, 1];
        if (d > reach * 1.05) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
            for (let k = 0; k < 8; k++) {
                const q = [c[0] + (k & 1 ? reach : -reach), c[1] + (k & 2 ? reach : -reach), c[2] + (k & 4 ? reach : -reach)];
                const w = m[3] * q[0] + m[7] * q[1] + m[11] * q[2] + m[15];
                if (w <= 0) {
                    behind = true;
                    break;
                }
                const x = (m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12]) / w, y = (m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13]) / w;
                x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
            }
            if (!behind) {
                if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1)
                    continue; // off screen
                rect = [Math.max(-1, x0), Math.max(-1, y0), Math.min(1, x1), Math.min(1, y1)];
            }
            else if (m[3] * c[0] + m[7] * c[1] + m[11] * c[2] + m[15] < -reach)
                continue; // wholly behind the eye (w: the depth)
        }
        const pole = norm(p.pole ?? [0, 1, 0]);
        const e1 = norm(cross(Math.abs(pole[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], pole));
        const L = norm([(p.light?.[0] ?? 0) - p.center[0], (p.light?.[1] ?? 0) - p.center[1], (p.light?.[2] ?? 0) - p.center[2]]);
        const [c0, c1, c2] = p.colors ?? ['#9c9690', '#cfc8c0', '#6f6a64'];
        out.push(c[0] / R, c[1] / R, c[2] / R, R, ...rect, ...pole, KINDS[p.kind] ?? 0, ...e1, (p.seed ?? 0) % 1000, ...L, p.ring?.inner ?? 0, ...rgb(c0, [0.6, 0.6, 0.6]), p.ring?.outer ?? 0, ...rgb(c1, [0.8, 0.8, 0.8]), atm, ...rgb(c2, [0.4, 0.4, 0.4]), p.detail ?? -1, ...rgb(p.ring?.color ?? p.atmosphere?.color, [0.6, 0.75, 1]), (p.spot ? 1 : 0) + (Math.floor(p.time ?? 0) % 10000) * 2);
    }
    return { data: new Float32Array(out), count: out.length / PLANET_FLOATS };
};
// ---- WGSL (WebGPU). Uniforms: the inverse of the rotation-only view-projection (pixel -> ray), the rotation-only
// view-projection (hit -> depth), x: pixels wide, y: high, z: log depth constant (0: the usual depth).
export const PLANET_WGSL = /* wgsl */ `
struct PU { inv : mat4x4<f32>, vp : mat4x4<f32>, res : vec4<f32> };
@group(0) @binding(0) var<uniform> pu : PU;
struct PIn {
  @location(0) c : vec4<f32>, @location(1) rect : vec4<f32>, @location(2) pole : vec4<f32>, @location(3) e1 : vec4<f32>,
  @location(4) l : vec4<f32>, @location(5) c0 : vec4<f32>, @location(6) c1 : vec4<f32>, @location(7) c2 : vec4<f32>, @location(8) c3 : vec4<f32>,
};
struct POut {
  @builtin(position) p : vec4<f32>,
  @location(0) @interpolate(flat) c : vec4<f32>, @location(1) @interpolate(flat) pole : vec4<f32>, @location(2) @interpolate(flat) e1 : vec4<f32>,
  @location(3) @interpolate(flat) l : vec4<f32>, @location(4) @interpolate(flat) c0 : vec4<f32>, @location(5) @interpolate(flat) c1 : vec4<f32>,
  @location(6) @interpolate(flat) c2 : vec4<f32>, @location(7) @interpolate(flat) c3 : vec4<f32>,
};
@vertex fn vsp(@builtin(vertex_index) vi : u32, i : PIn) -> POut {
  var o : POut;
  let cx = array<f32, 6>(0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  let cy = array<f32, 6>(0.0, 0.0, 1.0, 0.0, 1.0, 1.0);
  o.p = vec4<f32>(mix(i.rect.x, i.rect.z, cx[vi]), mix(i.rect.y, i.rect.w, cy[vi]), 0.5, 1.0);
  o.c = i.c; o.pole = i.pole; o.e1 = i.e1; o.l = i.l; o.c0 = i.c0; o.c1 = i.c1; o.c2 = i.c2; o.c3 = i.c3;
  return o;
}
fn ph(p : vec3<f32>) -> f32 { return fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453); }
fn pn(x : vec3<f32>) -> f32 {
  let i = floor(x); let f = fract(x); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ph(i), ph(i + vec3<f32>(1.0, 0.0, 0.0)), u.x), mix(ph(i + vec3<f32>(0.0, 1.0, 0.0)), ph(i + vec3<f32>(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(ph(i + vec3<f32>(0.0, 0.0, 1.0)), ph(i + vec3<f32>(1.0, 0.0, 1.0)), u.x), mix(ph(i + vec3<f32>(0.0, 1.0, 1.0)), ph(i + vec3<f32>(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}
fn fbm(x0 : vec3<f32>) -> f32 { var x = x0; var a = 0.5; var s = 0.0; for (var k = 0; k < 5; k++) { s += a * pn(x); x = x * 2.03 + vec3<f32>(1.7, 9.2, 3.1); a *= 0.5; } return s; }
fn ringOp(r : f32, inner : f32, outer : f32, seed : f32) -> f32 {
  if (r < inner || r > outer) { return 0.0; }
  let t = (r - inner) / (outer - inner);
  var a = 0.35 + 0.45 * smoothstep(0.15, 0.45, t) - 0.25 * smoothstep(0.85, 1.0, t);
  a *= 0.75 + 0.25 * sin(r * 211.0 + seed) * sin(r * 57.0);
  a *= 1.0 - 0.92 * (1.0 - smoothstep(0.0, 0.02, abs(t - 0.62))); // the Cassini division
  return clamp(a, 0.0, 0.95);
}
fn surf(n : vec3<f32>, lp : vec3<f32>, view : vec3<f32>, i : POut) -> vec3<f32> {
  let kind = i.pole.w; let seed = i.e1.w; let detail = i.c2.w;
  let spot = fract(i.c3.w * 0.5) > 0.25; let time = floor(i.c3.w * 0.5);
  let L = i.l.xyz; let ndl = dot(n, L);
  let lit = smoothstep(-0.08, 0.25, ndl) * (0.25 + 0.75 * max(ndl, 0.0)) + 0.025;
  let s = vec3<f32>(seed * 0.37, seed * 0.11, seed * 0.73);
  var col = i.c0.rgb;
  var extra = vec3<f32>(0.0);
  if (kind < 0.5) { // rock
    let v = fbm(lp * 3.0 + s); let w = fbm(lp * 11.0 + s * 1.7);
    col = mix(i.c0.rgb, i.c1.rgb, smoothstep(0.35, 0.7, v)) * (0.8 + 0.4 * w);
    col = mix(col, i.c2.rgb, smoothstep(0.58, 0.66, fbm(lp * 1.6 + s * 0.3)) * 0.85);
    if (detail > 0.0) { col = mix(col, vec3<f32>(0.95, 0.94, 0.92), smoothstep(1.0 - detail, 1.0 - detail * 0.6, abs(lp.y))); }
  } else if (kind < 1.5 || (kind > 2.5 && kind < 3.5)) { // gas giant, ice giant
    let ice = kind > 2.5;
    let bands = select(14.0, 5.0, ice);
    let nb = select(bands, detail, detail > 0.0);
    let warp = fbm(lp * vec3<f32>(2.0, 7.0, 2.0) + s + vec3<f32>(time * 0.01, 0.0, 0.0));
    let b = 0.5 + 0.5 * sin((lp.y + (warp - 0.5) * 0.12) * nb * 3.14159);
    col = mix(i.c0.rgb, i.c1.rgb, select(b, 0.5 + (b - 0.5) * 0.35, ice));
    col = mix(col, i.c2.rgb, smoothstep(0.62, 0.9, fbm(lp * vec3<f32>(5.0, 16.0, 5.0) + s)) * select(0.45, 0.15, ice));
    if (spot) {
      let q = vec2<f32>((atan2(lp.z, lp.x) - 0.8) * 1.6, (lp.y + 0.36) * 4.2);
      col = mix(col, i.c2.rgb * 1.05, (1.0 - smoothstep(0.55, 0.9, length(q))) * 0.9);
    }
  } else if (kind < 2.5) { // earth
    let sea = select(0.5, detail, detail > 0.0);
    let h = fbm(lp * 2.2 + s) * 0.75 + fbm(lp * 6.0 + s) * 0.25;
    let land = smoothstep(sea, sea + 0.012, h);
    let ocean = mix(i.c0.rgb * 0.55, i.c0.rgb, smoothstep(sea - 0.12, sea, h));
    let dry = smoothstep(0.35, 0.65, fbm(lp * 3.5 + s * 2.0)) * (1.0 - smoothstep(0.35, 0.7, abs(lp.y)));
    let ground = mix(i.c1.rgb, i.c2.rgb, dry) * (0.85 + 0.3 * fbm(lp * 14.0));
    col = mix(ocean, ground, land);
    col = mix(col, vec3<f32>(0.93, 0.95, 0.97), smoothstep(0.76, 0.84, abs(lp.y) + (h - 0.5) * 0.25));
    let cl = smoothstep(0.52, 0.72, fbm(lp * vec3<f32>(3.0, 5.0, 3.0) + s * 3.0 + vec3<f32>(time * 0.004, 0.0, 0.0)));
    let spec = pow(max(dot(reflect(-L, n), view), 0.0), 60.0) * 0.6 * (1.0 - land) * (1.0 - cl) * max(ndl, 0.0);
    if (spot) { extra = vec3<f32>(1.0, 0.75, 0.4) * step(0.62, fbm(lp * 38.0 + s)) * land * (1.0 - cl) * smoothstep(0.02, -0.2, ndl) * 0.9; }
    col = mix(col, vec3<f32>(0.97), cl * 0.92);
    extra = extra + vec3<f32>(spec);
  } else { // cloud-wrapped
    let w = fbm(lp * vec3<f32>(3.0, 8.0, 3.0) + fbm(lp * 2.0 + s) * 1.5 + s);
    col = mix(i.c0.rgb, i.c1.rgb, w);
    col = mix(col, i.c2.rgb, smoothstep(0.6, 0.85, fbm(lp * 6.0 + s)) * 0.3);
  }
  // the atmosphere's rim, on the lit side
  var rim = vec3<f32>(0.0);
  if (i.c1.w > 0.0) { rim = i.c3.rgb * pow(1.0 - max(dot(n, view), 0.0), 3.0) * smoothstep(-0.2, 0.3, ndl) * 0.9; }
  return col * lit + rim + extra;
}
struct PFrag { @location(0) c : vec4<f32>, @builtin(frag_depth) d : f32 };
fn pdepth(p : vec3<f32>) -> f32 {
  let k = pu.vp * vec4<f32>(p, 1.0);
  if (pu.res.z > 0.0) { return clamp(log2(max(1e-6, pu.res.z * k.w + 1.0)) / log2(pu.res.z * 1e12 + 1.0), 0.0, 1.0); }
  return clamp(k.z / k.w, 0.0, 1.0);
}
@fragment fn fsp(i : POut) -> PFrag {
  var o : PFrag;
  let ndc = vec2<f32>(i.p.x / pu.res.x * 2.0 - 1.0, 1.0 - i.p.y / pu.res.y * 2.0);
  let h = pu.inv * vec4<f32>(ndc, 0.0, 1.0); // (the near plane: the projection has no far plane)
  let dir = normalize(h.xyz / h.w);
  let c = i.c.xyz; let R = i.c.w;
  let pole = i.pole.xyz; let e1 = i.e1.xyz; let e2 = cross(pole, e1);
  let b = dot(c, dir);
  let hv = c - dir * b; let dd = dot(hv, hv);
  var tS = -1.0;
  if (dd <= 1.0) { tS = b - sqrt(1.0 - dd); }
  // the ring plane
  var tR = -1.0; var rr = 0.0;
  let inner = i.l.w; let outer = i.c0.w;
  if (outer > 0.0) {
    let den = dot(dir, pole);
    if (abs(den) > 1e-6) { tR = dot(c, pole) / den; rr = length(dir * tR - c); }
  }
  var col = vec3<f32>(0.0); var a = 0.0; var t = -1.0;
  if (tS > 0.0) {
    let hit = dir * tS; let n = hit - c;
    let lp = vec3<f32>(dot(n, e1), dot(n, pole), dot(n, e2));
    col = surf(n, lp, -dir, i);
    // the rings' shadow on the planet
    if (outer > 0.0) {
      let den = dot(i.l.xyz, pole);
      if (abs(den) > 1e-4) { let sR = -dot(n, pole) / den; if (sR > 0.0) { col *= 1.0 - 0.75 * ringOp(length(n + i.l.xyz * sR), inner, outer, i.e1.w); } }
    }
    a = 1.0; t = tS;
  }
  if (tR > 0.0 && (tS < 0.0 || tR < tS)) {
    let op = ringOp(rr, inner, outer, i.e1.w);
    if (op > 0.0) {
      let q = dir * tR - c;
      let lb = dot(q, i.l.xyz); let lh = q - i.l.xyz * lb;
      let shade = select(1.0, 0.08, lb < 0.0 && dot(lh, lh) < 1.0); // the planet's shadow on the ring
      let lit = (0.35 + 0.65 * abs(dot(pole, i.l.xyz))) * shade;
      let rc = i.c3.rgb * (0.75 + 0.25 * sin(rr * 90.0)) * lit;
      col = mix(col, rc, op); a = max(a, op);
      if (t < 0.0) { t = tR; }
    }
  }
  // the atmosphere's halo round the disc
  if (a < 1.0 && i.c1.w > 0.0) {
    let atm = i.c1.w; let r = sqrt(dd);
    if (r > 1.0 && r < 1.0 + atm * 1.5 && b > 0.0) {
      let k = 1.0 - (r - 1.0) / (atm * 1.5);
      let nh = normalize(hv * -1.0);
      let ha = k * k * smoothstep(-0.3, 0.4, dot(nh, i.l.xyz)) * 0.85;
      col = col * a + i.c3.rgb * ha * (1.0 - a); a = max(a, ha);
      if (t < 0.0) { t = b; }
    }
  }
  if (a <= 0.001) { discard; }
  o.c = vec4<f32>(col, a);
  o.d = pdepth(dir * t * R * 0.9995); // (a hair nearer: the plain sphere's corners lie on the surface)
  return o;
}
`;
// ---- GLSL ES 3 (WebGL2): the same, line by line
export const PLANET_GLSL_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec4 aC; layout(location = 1) in vec4 aRect; layout(location = 2) in vec4 aPole; layout(location = 3) in vec4 aE1;
layout(location = 4) in vec4 aL; layout(location = 5) in vec4 aC0; layout(location = 6) in vec4 aC1; layout(location = 7) in vec4 aC2; layout(location = 8) in vec4 aC3;
flat out vec4 vC; flat out vec4 vPole; flat out vec4 vE1; flat out vec4 vL; flat out vec4 vC0; flat out vec4 vC1; flat out vec4 vC2; flat out vec4 vC3;
void main() {
  float cx[6] = float[6](0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  float cy[6] = float[6](0.0, 0.0, 1.0, 0.0, 1.0, 1.0);
  gl_Position = vec4(mix(aRect.x, aRect.z, cx[gl_VertexID]), mix(aRect.y, aRect.w, cy[gl_VertexID]), 0.0, 1.0);
  vC = aC; vPole = aPole; vE1 = aE1; vL = aL; vC0 = aC0; vC1 = aC1; vC2 = aC2; vC3 = aC3;
}`;
export const PLANET_GLSL_FS = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 uInv; uniform mat4 uVpR; uniform vec4 uRes;
flat in vec4 vC; flat in vec4 vPole; flat in vec4 vE1; flat in vec4 vL; flat in vec4 vC0; flat in vec4 vC1; flat in vec4 vC2; flat in vec4 vC3;
out vec4 frag;
float ph(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pn(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ph(i), ph(i + vec3(1, 0, 0)), u.x), mix(ph(i + vec3(0, 1, 0)), ph(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(ph(i + vec3(0, 0, 1)), ph(i + vec3(1, 0, 1)), u.x), mix(ph(i + vec3(0, 1, 1)), ph(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
float fbm(vec3 x) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * pn(x); x = x * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float ringOp(float r, float inner, float outer, float seed) {
  if (r < inner || r > outer) return 0.0;
  float t = (r - inner) / (outer - inner);
  float a = 0.35 + 0.45 * smoothstep(0.15, 0.45, t) - 0.25 * smoothstep(0.85, 1.0, t);
  a *= 0.75 + 0.25 * sin(r * 211.0 + seed) * sin(r * 57.0);
  a *= 1.0 - 0.92 * (1.0 - smoothstep(0.0, 0.02, abs(t - 0.62)));
  return clamp(a, 0.0, 0.95);
}
vec3 surf(vec3 n, vec3 lp, vec3 view) {
  float kind = vPole.w, seed = vE1.w, detail = vC2.w;
  bool spot = fract(vC3.w * 0.5) > 0.25; float time = floor(vC3.w * 0.5);
  vec3 L = vL.xyz; float ndl = dot(n, L);
  float lit = smoothstep(-0.08, 0.25, ndl) * (0.25 + 0.75 * max(ndl, 0.0)) + 0.025;
  vec3 s = vec3(seed * 0.37, seed * 0.11, seed * 0.73);
  vec3 col = vC0.rgb; vec3 extra = vec3(0.0);
  if (kind < 0.5) {
    float v = fbm(lp * 3.0 + s), w = fbm(lp * 11.0 + s * 1.7);
    col = mix(vC0.rgb, vC1.rgb, smoothstep(0.35, 0.7, v)) * (0.8 + 0.4 * w);
    col = mix(col, vC2.rgb, smoothstep(0.58, 0.66, fbm(lp * 1.6 + s * 0.3)) * 0.85);
    if (detail > 0.0) col = mix(col, vec3(0.95, 0.94, 0.92), smoothstep(1.0 - detail, 1.0 - detail * 0.6, abs(lp.y)));
  } else if (kind < 1.5 || (kind > 2.5 && kind < 3.5)) {
    bool ice = kind > 2.5;
    float nb = detail > 0.0 ? detail : (ice ? 5.0 : 14.0);
    float warp = fbm(lp * vec3(2.0, 7.0, 2.0) + s + vec3(time * 0.01, 0.0, 0.0));
    float b = 0.5 + 0.5 * sin((lp.y + (warp - 0.5) * 0.12) * nb * 3.14159);
    col = mix(vC0.rgb, vC1.rgb, ice ? 0.5 + (b - 0.5) * 0.35 : b);
    col = mix(col, vC2.rgb, smoothstep(0.62, 0.9, fbm(lp * vec3(5.0, 16.0, 5.0) + s)) * (ice ? 0.15 : 0.45));
    if (spot) {
      vec2 q = vec2((atan(lp.z, lp.x) - 0.8) * 1.6, (lp.y + 0.36) * 4.2);
      col = mix(col, vC2.rgb * 1.05, (1.0 - smoothstep(0.55, 0.9, length(q))) * 0.9);
    }
  } else if (kind < 2.5) {
    float sea = detail > 0.0 ? detail : 0.5;
    float h = fbm(lp * 2.2 + s) * 0.75 + fbm(lp * 6.0 + s) * 0.25;
    float land = smoothstep(sea, sea + 0.012, h);
    vec3 ocean = mix(vC0.rgb * 0.55, vC0.rgb, smoothstep(sea - 0.12, sea, h));
    float dry = smoothstep(0.35, 0.65, fbm(lp * 3.5 + s * 2.0)) * (1.0 - smoothstep(0.35, 0.7, abs(lp.y)));
    vec3 ground = mix(vC1.rgb, vC2.rgb, dry) * (0.85 + 0.3 * fbm(lp * 14.0));
    col = mix(ocean, ground, land);
    col = mix(col, vec3(0.93, 0.95, 0.97), smoothstep(0.76, 0.84, abs(lp.y) + (h - 0.5) * 0.25));
    float cl = smoothstep(0.52, 0.72, fbm(lp * vec3(3.0, 5.0, 3.0) + s * 3.0 + vec3(time * 0.004, 0.0, 0.0)));
    float spec = pow(max(dot(reflect(-L, n), view), 0.0), 60.0) * 0.6 * (1.0 - land) * (1.0 - cl) * max(ndl, 0.0);
    if (spot) extra = vec3(1.0, 0.75, 0.4) * step(0.62, fbm(lp * 38.0 + s)) * land * (1.0 - cl) * smoothstep(0.02, -0.2, ndl) * 0.9;
    col = mix(col, vec3(0.97), cl * 0.92);
    extra += vec3(spec);
  } else {
    float w = fbm(lp * vec3(3.0, 8.0, 3.0) + fbm(lp * 2.0 + s) * 1.5 + s);
    col = mix(vC0.rgb, vC1.rgb, w);
    col = mix(col, vC2.rgb, smoothstep(0.6, 0.85, fbm(lp * 6.0 + s)) * 0.3);
  }
  vec3 rim = vC1.w > 0.0 ? vC3.rgb * pow(1.0 - max(dot(n, view), 0.0), 3.0) * smoothstep(-0.2, 0.3, ndl) * 0.9 : vec3(0.0);
  return col * lit + rim + extra;
}
float pdepth(vec3 p) {
  vec4 k = uVpR * vec4(p, 1.0);
  if (uRes.z > 0.0) return clamp(log2(max(1e-6, uRes.z * k.w + 1.0)) / log2(uRes.z * 1e12 + 1.0), 0.0, 1.0);
  return clamp(k.z / k.w, 0.0, 1.0);
}
void main() {
  vec2 ndc = vec2(gl_FragCoord.x / uRes.x * 2.0 - 1.0, gl_FragCoord.y / uRes.y * 2.0 - 1.0);
  vec4 hh = uInv * vec4(ndc, 0.0, 1.0);
  vec3 dir = normalize(hh.xyz / hh.w);
  vec3 c = vC.xyz; float R = vC.w;
  vec3 pole = vPole.xyz, e1 = vE1.xyz, e2 = cross(pole, e1);
  float b = dot(c, dir); vec3 hv = c - dir * b; float dd = dot(hv, hv);
  float tS = dd <= 1.0 ? b - sqrt(1.0 - dd) : -1.0;
  float tR = -1.0, rr = 0.0, inner = vL.w, outer = vC0.w;
  if (outer > 0.0) { float den = dot(dir, pole); if (abs(den) > 1e-6) { tR = dot(c, pole) / den; rr = length(dir * tR - c); } }
  vec3 col = vec3(0.0); float a = 0.0, t = -1.0;
  if (tS > 0.0) {
    vec3 n = dir * tS - c;
    col = surf(n, vec3(dot(n, e1), dot(n, pole), dot(n, e2)), -dir);
    if (outer > 0.0) { float den = dot(vL.xyz, pole); if (abs(den) > 1e-4) { float sR = -dot(n, pole) / den; if (sR > 0.0) col *= 1.0 - 0.75 * ringOp(length(n + vL.xyz * sR), inner, outer, vE1.w); } }
    a = 1.0; t = tS;
  }
  if (tR > 0.0 && (tS < 0.0 || tR < tS)) {
    float op = ringOp(rr, inner, outer, vE1.w);
    if (op > 0.0) {
      vec3 q = dir * tR - c; float lb = dot(q, vL.xyz); vec3 lh = q - vL.xyz * lb;
      float shade = (lb < 0.0 && dot(lh, lh) < 1.0) ? 0.08 : 1.0;
      float lit = (0.35 + 0.65 * abs(dot(pole, vL.xyz))) * shade;
      col = mix(col, vC3.rgb * (0.75 + 0.25 * sin(rr * 90.0)) * lit, op); a = max(a, op);
      if (t < 0.0) t = tR;
    }
  }
  if (a < 1.0 && vC1.w > 0.0) {
    float atm = vC1.w, r = sqrt(dd);
    if (r > 1.0 && r < 1.0 + atm * 1.5 && b > 0.0) {
      float k = 1.0 - (r - 1.0) / (atm * 1.5);
      vec3 nh = normalize(-hv);
      float ha = k * k * smoothstep(-0.3, 0.4, dot(nh, vL.xyz)) * 0.85;
      col = col * a + vC3.rgb * ha * (1.0 - a); a = max(a, ha);
      if (t < 0.0) t = b;
    }
  }
  if (a <= 0.001) discard;
  frag = vec4(col, a);
  gl_FragDepth = pdepth(dir * t * R * 0.9995);
}`;

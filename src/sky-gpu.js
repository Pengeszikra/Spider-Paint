// The sky layers on WebGPU: the black hole's ray tracer, the star cloud (the Milky Way's points, the live galaxies) and the
// glow sprites of far stars, on the same GPU device as the 3D view (engine/…/gpu.js), each into its own canvas as before
// (the page stacks them with CSS: the cloud screen-blended, the hole and the glows over the picture, or under it in a
// story's sky). They were WebGL2 and a 2D canvas: on WebGPU they run where the 3D view runs (a browser, Deno, a headset's
// browser), one GPU path. The page computes what to draw (which holes, the sprites' places); this draws it.
//
//   const sky = createSkyGpu(device, format)
//   sky.hole(canvas, size, holes)       holes: [{ cam, c, n, e1, rs, scissor: [x0, y0, x1, y1] }] in panel pixels
//   sky.cloud(canvas, size, sets, cam)  sets: [{ data: Float32Array(n * 8), n, eye }] (x y z radius r g b brightness)
//   sky.glow(canvas, size, sprites)     sprites: Float32Array(n * 8): x y radius r g b alpha 0 (panel pixels)
// cam: { f, r, u, k, half, hole: [x, y, radius, depth] } · size: the panel's square in CSS pixels; dpr is the canvas's own

const CAM = /* wgsl */ `
struct Cam { eye: vec3f, k: f32, f: vec3f, half: f32, r: vec3f, dpr: f32, u: vec3f, px: f32, hole: vec4f };
`;

// ---- the star cloud: every point one sharp point of 1.3–2.4 px at any distance (instanced quads: WebGPU has no big points)
const CLOUD = /* wgsl */ `${CAM}
@group(0) @binding(0) var<uniform> U: Cam;
struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec3f, @location(2) a: f32 };
fn corner(i: u32) -> vec2f {
  var c = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  return c[i];
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) p: vec3f, @location(1) rad: f32, @location(2) col: vec3f, @location(3) lum: f32) -> V {
  var o: V;
  o.uv = corner(vi);
  o.col = col;
  o.a = 0.0;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  let d = p - U.eye;
  let depth = dot(d, U.f);
  if (depth < 1e-3) { return o; }
  let sp = vec2f(dot(d, U.r), dot(d, U.u)) / depth * U.k;
  if (U.hole.z > 0.0 && depth > U.hole.w && distance(sp, U.hole.xy) < U.hole.z) { return o; } // behind the hole: in its shadow
  let nat = rad * U.k / depth;
  let px = clamp(nat, 1.3, 2.4);
  var a = lum * select(1.0, (nat / 1.3) * (nat / 1.3), nat < 1.3) * (1.0 + 0.6 * smoothstep(1.3, 12.0, nat));
  a *= 1.0 - smoothstep(400.0, 1600.0, nat);
  o.a = a;
  // the quad: px * 2 device pixels across (as the WebGL point size), in clip space
  o.pos = vec4f(sp / U.half + corner(vi) * (px * 2.0 * U.dpr) / U.px, 0.0, 1.0);
  return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  let r = length(v.uv);
  if (r > 1.0) { discard; }
  return vec4f(v.col * v.a * exp(-r * r * 6.0) * 0.5, 1.0);
}`;

// ---- the glow sprites: a soft round spot in the star's colour, added together (as the 2D canvas's 'lighter')
const GLOW = /* wgsl */ `
struct G { px: f32, dpr: f32, _a: f32, _b: f32 };
@group(0) @binding(0) var<uniform> U: G;
struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec3f, @location(2) a: f32 };
fn corner(i: u32) -> vec2f {
  var c = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  return c[i];
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) xyr: vec3f, @location(1) col: vec3f, @location(2) alpha: f32) -> V {
  var o: V;
  let c = corner(vi);
  let p = (xyr.xy + c * xyr.z) * U.dpr; // device pixels from the top left
  o.pos = vec4f(p.x / U.px * 2.0 - 1.0, 1.0 - p.y / U.px * 2.0, 0.0, 1.0);
  o.uv = c;
  o.col = col;
  o.a = alpha;
  return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  let t = length(v.uv);
  if (t >= 1.0) { discard; }
  // the 2D sprite's radial gradient: a whiter middle, the colour at 0.15, faint at 0.5, gone at the edge
  let hot = v.col + (vec3f(1.0) - v.col) * 0.35;
  var c = v.col;
  var a = 0.0;
  if (t < 0.15) { let s = t / 0.15; c = mix(hot, v.col, s); a = mix(1.0, 0.95, s); }
  else if (t < 0.5) { a = mix(0.95, 0.3, (t - 0.15) / 0.35); }
  else { a = mix(0.3, 0.0, (t - 0.5) / 0.5); }
  a *= v.a;
  return vec4f(c * a, a);
}`;

// ---- the black hole: rays from the eye bent round it (the same tracer as the WebGL2 one, in WGSL)
const HOLE = /* wgsl */ `
struct H { eye: vec3f, k: f32, f: vec3f, half: f32, r: vec3f, rs: f32, u: vec3f, scale: f32, c: vec3f, inR: f32, n: vec3f, outR: f32, e1: vec3f, B: f32, core: f32, _a: f32, _b: f32, _c: f32 };
@group(0) @binding(0) var<uniform> U: H;
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 4>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1));
  return vec4f(p[vi], 0.0, 1.0);
}
fn gmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn hashP(i0: vec2f, per: f32) -> f32 { var i = i0; i.x = gmod(i.x, per); return hash(i); }
fn pnoise(p: vec2f, per: f32) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashP(i, per), hashP(i + vec2f(1.0, 0.0), per), f.x), mix(hashP(i + vec2f(0.0, 1.0), per), hashP(i + vec2f(1.0, 1.0), per), f.x), f.y);
}
fn pfbm(p0: vec2f, per0: f32) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p0;
  var per = per0;
  for (var i = 0; i < 4; i++) { s += a * pnoise(p, per); p = p * 2.0 + vec2f(1.7, 9.2); per *= 2.0; a *= 0.5; }
  return s;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let q = pos.xy / U.scale; // panel pixels (from the top left)
  let dir = normalize(U.f + (q.x - U.half) / U.k * U.r - (q.y - U.half) / U.k * U.u);
  var p = (U.eye - U.c) / U.rs; // the hole's own units: horizon radius 1
  var v = dir;
  let B = U.B;
  let b = dot(p, v);
  let cc = dot(p, p) - B * B;
  let disc = b * b - cc;
  if (disc < 0.0) { discard; }
  let t0 = -b - sqrt(disc);
  if (t0 > 0.0) { p += v * t0; }
  let h2 = dot(cross(p, v), cross(p, v));
  let E2 = cross(U.n, U.e1);
  var col = vec3f(0.0);
  var a = 0.0;
  var minR = 1e9;
  for (var i = 0; i < 150; i++) {
    let r = length(p);
    minR = min(minR, r);
    if (r < U.core) { a = 1.0; break; }
    let dt = clamp(0.07 * r, 0.015, 0.5);
    let pn = p + v * dt;
    v = normalize(v - 1.5 * h2 * p / pow(r, 5.0) * dt);
    let s0 = dot(p, U.n);
    let s1 = dot(pn, U.n);
    if (s0 * s1 < 0.0) {
      let x = mix(p, pn, s0 / (s0 - s1));
      let rr = length(x);
      if (rr > U.inR && rr < U.outR) {
        let tang = normalize(cross(U.n, x));
        let dop = 1.0 + 0.45 * dot(tang, -v);
        let t = (rr - U.inR) / (U.outR - U.inR);
        let heat = pow(U.inR / rr, 1.25);
        let ang = atan2(dot(x, E2), dot(x, U.e1));
        let uu = ang / 6.2831853;
        var gas = pfbm(vec2f(uu * 19.0 + 7.0 / sqrt(rr), rr * 2.6), 19.0) * 1.35;
        gas *= 0.55 + 0.45 * pfbm(vec2f(uu * 6.0, rr * 9.0), 6.0);
        let base = mix(vec3f(0.82, 0.88, 1.0), vec3f(1.0, 0.9, 0.78), smoothstep(0.0, 0.8, t));
        let shift = clamp((dop - 1.0) * 2.4, -1.0, 1.0);
        let tint = select(mix(base, vec3f(1.0, 0.42, 0.14), -shift), mix(base, vec3f(0.62, 0.74, 1.0), shift), shift > 0.0);
        let dc = tint * (0.45 + 2.2 * heat) * dop * dop * dop * gas;
        let da = smoothstep(1.0, 0.55, t) * smoothstep(0.0, 0.06, t) * clamp(gas * 0.95, 0.0, 0.9);
        col += (1.0 - a) * dc * da;
        a += (1.0 - a) * da;
        if (a > 0.985) { break; }
      }
    }
    p = pn;
    if (r > B + 0.5 && dot(p, v) > 0.0) { break; }
  }
  let ring = exp(-pow((minR - 1.52) * 7.0, 2.0)) * (1.0 - a);
  col += vec3f(0.95, 0.92, 1.0) * ring * 0.9;
  a = max(a, ring * 0.6);
  return vec4f(col, a); // (premultiplied)
}`;

export const createSkyGpu = (device, format = navigator.gpu.getPreferredCanvasFormat()) => {
  const U = globalThis.GPUBufferUsage, T = globalThis.GPUTextureUsage;
  const ctxs = new WeakMap();
  // a canvas's WebGPU context, configured once (alphaMode as the old layer's: the cloud opaque for its screen blend)
  const context = (canvas, alphaMode) => {
    let c = ctxs.get(canvas);
    if (!c) {
      c = canvas.getContext('webgpu');
      if (!c) return null;
      c.configure({ device, format, alphaMode, usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
      ctxs.set(canvas, c);
    }
    return c;
  };
  const pipeline = (code, { buffers = [], blend, topology = 'triangle-list' }) => {
    const module = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs', buffers },
      fragment: { module, entryPoint: 'fs', targets: [{ format, ...(blend ? { blend } : {}) }] },
      primitive: { topology },
    });
  };
  const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const P = {};
  const pipes = () => {
    if (P.cloud) return P;
    return Object.assign(P, {
      cloud: pipeline(CLOUD, {
        buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32' }, { shaderLocation: 2, offset: 16, format: 'float32x3' }, { shaderLocation: 3, offset: 28, format: 'float32' }] }],
        blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src', operation: 'add' }, alpha: add }, // soft saturation, as before
      }),
      glow: pipeline(GLOW, {
        buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32' }] }],
        blend: { color: add, alpha: add },
      }),
      hole: pipeline(HOLE, { topology: 'triangle-strip' }),
    });
  };
  // buffers that grow
  const pool = new Map();
  const buffer = (key, bytes, usage) => {
    let b = pool.get(key);
    if (!b || b.size < bytes) {
      b?.destroy();
      b = device.createBuffer({ size: Math.max(256, Math.ceil(bytes / 256) * 256), usage: usage | U.COPY_DST });
      pool.set(key, b);
    }
    return b;
  };
  const uniforms = (key, data) => {
    const b = buffer(key, data.byteLength, U.UNIFORM);
    device.queue.writeBuffer(b, 0, data);
    return b;
  };
  const camData = (cam, eye, px) => new Float32Array([...eye, cam.k, ...cam.f, cam.half, ...cam.r, cam.dpr, ...cam.u, px, ...(cam.hole ?? [0, 0, 0, 0])]);
  const sizeTo = (canvas, px) => {
    if (canvas.width !== px || canvas.height !== px) canvas.width = canvas.height = px;
  };
  const pass = (ctx, clear) => {
    const enc = device.createCommandEncoder();
    const p = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: clear, loadOp: 'clear', storeOp: 'store' }] });
    return { enc, p };
  };

  return {
    // the cloud's point sets ({ data, n, eye }: the eye relative to that set's origin), screen-blended by the page's CSS
    cloud(canvas, size, sets, cam) {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const px = Math.round(size * dpr);
      sizeTo(canvas, px);
      const ctx = context(canvas, 'opaque');
      if (!ctx) return false;
      const { cloud } = pipes();
      const { enc, p } = pass(ctx, { r: 0, g: 0, b: 0, a: 1 });
      p.setPipeline(cloud);
      sets.forEach((s, i) => {
        if (!s.n) return;
        const vb = buffer(`cloud${i}`, s.data.byteLength, U.VERTEX);
        if (vb.__data !== s.data) (device.queue.writeBuffer(vb, 0, s.data.buffer, s.data.byteOffset, s.n * 32), (vb.__data = s.data));
        const ub = uniforms(`cloudU${i}`, camData({ ...cam, dpr }, s.eye, px));
        p.setBindGroup(0, device.createBindGroup({ layout: cloud.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }] }));
        p.setVertexBuffer(0, vb);
        p.draw(6, s.n);
      });
      p.end();
      device.queue.submit([enc.finish()]);
      return true;
    },
    // the glow sprites (Float32Array, 8 floats each), added together on a see-through canvas
    glow(canvas, size, sprites, n) {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const px = Math.round(size * dpr);
      sizeTo(canvas, px);
      const ctx = context(canvas, 'premultiplied');
      if (!ctx) return false;
      const { glow } = pipes();
      const { enc, p } = pass(ctx, { r: 0, g: 0, b: 0, a: 0 });
      if (n) {
        const vb = buffer('glow', n * 32, U.VERTEX);
        device.queue.writeBuffer(vb, 0, sprites.buffer, sprites.byteOffset, n * 32);
        const ub = uniforms('glowU', new Float32Array([px, dpr, 0, 0]));
        p.setPipeline(glow);
        p.setBindGroup(0, device.createBindGroup({ layout: glow.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }] }));
        p.setVertexBuffer(0, vb);
        p.draw(6, n);
      }
      p.end();
      device.queue.submit([enc.finish()]);
      return true;
    },
    // the traced holes, each in its square (scissor), at half resolution
    hole(canvas, size, holes) {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const scale = dpr * 0.5;
      const px = Math.max(1, Math.round(size * scale));
      sizeTo(canvas, px);
      const ctx = context(canvas, 'premultiplied');
      if (!ctx) return false;
      const { hole } = pipes();
      const { enc, p } = pass(ctx, { r: 0, g: 0, b: 0, a: 0 });
      p.setPipeline(hole);
      holes.forEach((h, i) => {
        const [x0, y0, x1, y1] = h.scissor;
        const sx = Math.max(0, Math.floor(x0 * scale)), sy = Math.max(0, Math.floor(y0 * scale));
        const sw = Math.min(px - sx, Math.ceil((x1 - x0) * scale) + 1), sh = Math.min(px - sy, Math.ceil((y1 - y0) * scale) + 1);
        if (sw <= 0 || sh <= 0) return;
        const c = h.cam;
        const ub = uniforms(`holeU${i}`, new Float32Array([0, 0, 0, c.k, ...c.f, c.half, ...c.r, h.rs, ...c.u, scale, ...h.c, h.inR, ...h.n, h.outR, ...h.e1, h.B, h.core, 0, 0, 0]));
        p.setBindGroup(0, device.createBindGroup({ layout: hole.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }] }));
        p.setScissorRect(sx, sy, sw, sh);
        p.draw(4);
      });
      p.end();
      device.queue.submit([enc.finish()]);
      return true;
    },
  };
};

// WebGL2 renderer: the same picture as the WebGPU one (gpu.ts), for browsers and devices that have no WebGPU.
// Same options, same vertices (buildVertices), same light model: the shader below is a line-by-line port of the WGSL.
// It also runs on a software GL (SwiftShader), so a frame can be checked on a machine without a GPU.
import { norm } from './vec.js';
import { makeCamera } from './camera.js';
import { buildVertices, buildMarks, skinCache, SKIN_FLOATS, MAX_BONES, buildScreenQuads, SCREEN_FLOATS, MARK_FLOATS, sceneEdges, sceneLights, LIGHT_FLOATS, MAX_LIGHTS, viewProjection, nearPlane, defaultLight, defaultMaterial, mul4 } from './gpu.js';
import { planetInstances, PLANET_GLSL_VS, PLANET_GLSL_FS, PLANET_FLOATS, inv4 } from './planet.js';
const GL_FLOATS = 14; // position(3) normal(3) color(3) material(4: metal, rough, alpha, emit) soft(1)
const GL_INSTANCE_FLOATS = 15; // at(3) ex(3) ey(3) ez(3) color(3)
const GL_COMMON = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 uVp;
uniform float uLd;
vec4 ld(vec4 p) { if (uLd > 0.0) p.z = log2(max(1e-6, uLd * p.w + 1.0)) / log2(uLd * 1e12 + 1.0) * p.w; return p; } // logarithmic depth (gpu.ts)
out vec3 vN; out vec3 vC; out vec3 vW; out vec4 vM; out float vS;
`;
const GL_VERT = `${GL_COMMON}
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNrm; layout(location = 2) in vec3 aCol;
layout(location = 3) in vec4 aMat; layout(location = 4) in float aSoft;
void main() {
  vec4 p = ld(uVp * vec4(aPos, 1.0));
  gl_Position = vec4(p.xy, p.z * 2.0 - p.w, p.w); // WebGPU depth is 0..1, GL wants -1..1
  vN = aNrm; vC = aCol; vW = aPos; vM = aMat; vS = aSoft;
}`;
// a skinned figure: every vertex is moved by up to four joints (three rows of [cols | shift] per joint), mixed by its weights
const GL_VERT_SKIN = `${GL_COMMON}
uniform vec4 uBones[${3 * 64}];
uniform vec4 uEmission[16];
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNrm; layout(location = 2) in vec3 aCol;
layout(location = 3) in vec4 aMat; layout(location = 4) in float aSoft;
layout(location = 5) in vec4 aJ; layout(location = 6) in vec4 aW;
vec3 bone(int k, vec4 p) { return vec3(dot(uBones[k * 3], p), dot(uBones[k * 3 + 1], p), dot(uBones[k * 3 + 2], p)); }
void main() {
  vec3 q = vec3(0.0);
  vec3 n = vec3(0.0);
  float emission = 0.0;
  for (int c = 0; c < 4; c++) {
    float w = aW[c];
    if (w > 0.0) {
      int k = int(aJ[c] + 0.5);
      q += bone(k, vec4(aPos, 1.0)) * w;
      n += bone(k, vec4(aNrm, 0.0)) * w;
      emission += uEmission[k / 4][k % 4] * w;
    }
  }
  vec4 p = ld(uVp * vec4(q, 1.0));
  gl_Position = vec4(p.xy, p.z * 2.0 - p.w, p.w);
  vN = n; vC = aCol; vW = q; vM = aMat; vS = aSoft;
  vM.w *= emission;
}`;
// a screen: a picture on a quad, as it is (a display does not take the scene's light)
const GL_VERT_SCREEN = `#version 300 es
precision highp float;
uniform mat4 uVp;
uniform float uLd;
vec4 ld(vec4 p) { if (uLd > 0.0) p.z = log2(max(1e-6, uLd * p.w + 1.0)) / log2(uLd * 1e12 + 1.0) * p.w; return p; }
layout(location = 0) in vec3 aPos; layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
  vec4 p = ld(uVp * vec4(aPos, 1.0));
  gl_Position = vec4(p.xy, p.z * 2.0 - p.w, p.w);
  vUv = aUv;
}`;
const GL_FRAG_HOLE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(0.0); }`;
const GL_FRAG_SCREEN = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(texture(uTex, vUv).rgb, 1.0); }`;
// the same prototype drawn many times: its frame (ex, ey, ez; scaled axes scale it) and position come per instance
const GL_VERT_INST = `${GL_COMMON}
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNrm;
layout(location = 5) in vec3 aAt; layout(location = 6) in vec3 aEx; layout(location = 7) in vec3 aEy; layout(location = 8) in vec3 aEz;
layout(location = 9) in vec3 aCol;
void main() {
  vec3 w = aAt + aEx * aPos.x + aEy * aPos.y + aEz * aPos.z;
  vec4 p = ld(uVp * vec4(w, 1.0));
  gl_Position = vec4(p.xy, p.z * 2.0 - p.w, p.w);
  vN = normalize(aEx) * aNrm.x + normalize(aEy) * aNrm.y + normalize(aEz) * aNrm.z;
  vC = aCol; vW = w; vM = vec4(0.0, 0.7, 1.0, 0.0); vS = 0.0;
}`;
// the edge lines: 1 pixel, nudged a hair towards the eye so they win against the faces they lie on
const GL_VERT_LINE = `#version 300 es
precision highp float;
uniform mat4 uVp;
uniform float uLd;
vec4 ld(vec4 p) { if (uLd > 0.0) p.z = log2(max(1e-6, uLd * p.w + 1.0)) / log2(uLd * 1e12 + 1.0) * p.w; return p; }
layout(location = 0) in vec3 aPos;
void main() {
  vec4 p = ld(uVp * vec4(aPos, 1.0));
  gl_Position = vec4(p.xy, p.z * 2.0 - p.w - 0.0004 * p.w, p.w);
}`;
const GL_FRAG_LINE = `#version 300 es
precision mediump float;
out vec4 outColor;
uniform float uUnlit;
void main() { outColor = uUnlit > 0.5 ? vec4(0.85, 0.85, 0.85, 0.55) : vec4(0.0, 0.0, 0.0, 0.4); }`;
// the marks: thick round-capped segments expanded to screen-space quads, over everything (see the WGSL vsm/fsm)
const GL_VERT_MARK = `#version 300 es
precision highp float;
uniform mat4 uVp; uniform vec3 uRes; uniform float uLd; uniform float uFocal;
layout(location = 0) in vec3 aA; layout(location = 1) in vec3 aB; layout(location = 2) in vec4 aCol; layout(location = 3) in float aW; layout(location = 4) in vec3 aDash;
out vec2 vQ; out vec4 vCol; out vec2 vH; out vec2 vDash;
void main() {
  // the points are relative to the eye (buildMarks, in doubles), uVp is the eye-centred view-projection
  vec4 ca = uVp * vec4(aA, 1.0);
  vec4 cb = uVp * vec4(aB, 1.0);
  float sa = aDash.y, sb = aDash.z;
  // the near cut: with log depth anything just in front of the eye is drawn, but never nearer than 1e-5 of the segment's far end:
  // a point cut at w ~ 0 lands ~1e15 px away, where float32 loses the line's direction and stray lines flash across the screen
  float e = max(uLd > 0.0 ? 1e-13 : 0.001, 1e-5 * max(ca.w, cb.w));
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (ca.w < e && cb.w < e) return;
  if (ca.w < e) { float k = (e - ca.w) / (cb.w - ca.w); ca = mix(ca, cb, k); sa = mix(sa, sb, k); }
  if (cb.w < e) { float k = (e - cb.w) / (ca.w - cb.w); cb = mix(cb, ca, k); sb = mix(sb, sa, k); }
  vec2 half_ = uRes.xy * 0.5;
  vec2 pa = ca.xy / ca.w * half_;
  vec2 pb = cb.xy / cb.w * half_;
  // the screen guard band: the segment is cut to 4x the picture before the quad is built, so no corner lies far off screen (a real
  // GPU's rasteriser may mangle a triangle with a corner ~1e12 px away: a stray line across the picture)
  {
    float G = max(half_.x, half_.y) * 4.0;
    vec2 dd = pb - pa;
    float t0 = 0.0, t1 = 1.0;
    for (int k = 0; k < 4; k++) {
      float pp = k == 0 ? -dd.x : k == 1 ? dd.x : k == 2 ? -dd.y : dd.y;
      float qq = k == 0 ? pa.x + G : k == 1 ? G - pa.x : k == 2 ? pa.y + G : G - pa.y;
      if (abs(pp) < 1e-20) { if (qq < 0.0) return; }
      else { float r = qq / pp; if (pp < 0.0) t0 = max(t0, r); else t1 = min(t1, r); }
    }
    if (t0 > t1) return;
    vec2 na = pa + dd * t0, nb = pa + dd * t1;
    // the dash distance and the depth follow the cut (s / w is linear on screen)
    float qa = sa / ca.w, qb = sb / cb.w;
    float ia = 1.0 / ca.w, ib = 1.0 / cb.w;
    float ja = mix(ia, ib, t0), jb = mix(ia, ib, t1);
    sa = mix(qa, qb, t0) / ja; sb = mix(qa, qb, t1) / jb;
    ca.w = 1.0 / ja; cb.w = 1.0 / jb;
    pa = na; pb = nb;
  }
  float len = length(pb - pa);
  vec2 d = len > 0.0001 ? (pb - pa) / len : vec2(1.0, 0.0);
  float hw = aW * uRes.z * 0.5;
  vec2 n = vec2(-d.y, d.x);
  float cx[6] = float[6](0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  float cy[6] = float[6](-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
  float ext = hw + 1.0;
  float along = mix(-ext, len + ext, cx[gl_VertexID]);
  float across = cy[gl_VertexID] * ext;
  vec2 pos = pa + d * along + n * across;
  gl_Position = vec4(pos / half_, 0.0, 1.0);
  vQ = vec2(along, across); vCol = aCol; vH = vec2(len, hw);
  // the dash phase in pixels (length along the line / depth x focal length: linear on screen, so it runs on across joints)
  float f = len > 0.0001 ? along / len : cx[gl_VertexID];
  vDash = vec2(mix(sa / ca.w, sb / cb.w, f) * uFocal, aDash.x * uRes.z);
}`;
const GL_FRAG_MARK = `#version 300 es
precision highp float;
in vec2 vQ; in vec4 vCol; in vec2 vH; in vec2 vDash;
out vec4 outColor;
void main() {
  float dx = max(max(-vQ.x, vQ.x - vH.x), 0.0);
  float dist = length(vec2(dx, vQ.y));
  float cov = clamp(vH.y + 0.5 - dist, 0.0, 1.0);
  if (vDash.y > 0.0) {
    float px = fract(vDash.x / (2.0 * vDash.y)) * 2.0 * vDash.y; // a dash, then a gap as long; half a pixel of soft edge
    cov *= clamp(min(px, vDash.y - px) + 0.5, 0.0, 1.0);
  }
  outColor = vec4(vCol.rgb, vCol.a * cov);
}`;
const GL_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uLight; uniform vec4 uSky; uniform vec4 uGround; uniform vec4 uEye; uniform vec4 uMat;
uniform vec4 uFx; uniform vec4 uFill; uniform vec4 uRim;
uniform vec4 uLP[16]; uniform vec4 uLC[16]; uniform float uLN;
in vec3 vN; in vec3 vC; in vec3 vW; in vec4 vM; in float vS;
out vec4 outColor;

vec3 toLinear(vec3 c) { return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045)))); }
vec3 toSrgb(vec3 c) { return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
// ACES filmic curve (Narkowicz fit): highlights roll off softly instead of clipping
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3(0.0), vec3(1.0)); }
// Glow: every emitting cluster is a local light with a smooth falloff to zero at its reach
vec3 glowAt(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int k = 0; k < 16; k++) {
    if (float(k) >= uLN) break;
    vec3 d = uLP[k].xyz - p;
    float dist = max(length(d), 0.001);
    float x = dist / uLP[k].w;
    float win = clamp(1.0 - x * x * x * x, 0.0, 1.0);
    win = win * win;
    float s = dist / (uLP[k].w * 0.25);
    float wrap = max((dot(n, d / dist) + 0.3) / 1.3, 0.0);
    sum += uLC[k].rgb * (win / (1.0 + s * s)) * wrap * 1.6;
  }
  return sum;
}

// Direct light, shared by both looks: x diffuse, y highlight, z scattered light (soft materials).
vec3 lights(vec3 n, vec3 v, float shin, float soft) {
  vec3 key = normalize(uLight.xyz);
  float ndl = dot(n, key);
  float diff = max((ndl + soft) / (1.0 + soft), 0.0);
  vec3 h = normalize(key + v);
  float spec = pow(max(dot(n, h), 0.0), shin) * step(0.0, ndl);
  float scat = soft * exp(-ndl * ndl * 5.0);
  if (uFx.w > 0.5) {
    diff = diff * 0.85;
    vec3 fl = normalize(uFill.xyz);
    diff = diff + max((dot(n, fl) + soft) / (1.0 + soft), 0.0) * uFill.w;
    vec3 rl = normalize(uRim.xyz);
    float edge = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    diff = diff + max(dot(n, rl), 0.0) * edge * uRim.w * 2.0;
    vec3 rh = normalize(rl + v);
    spec = spec + pow(max(dot(n, rh), 0.0), shin) * step(0.0, dot(n, rl)) * uRim.w * 0.6 * edge;
  }
  return vec3(diff, spec, scat);
}

vec4 filmic(vec3 n, vec3 v) {
  float metal = vM.x;
  float rough = vM.y;
  vec3 albedo = toLinear(vC);
  vec3 hemi = mix(toLinear(uGround.rgb), toLinear(uSky.rgb), n.y * 0.5 + 0.5) * uMat.x * (uFx.w > 0.5 ? 0.7 : 1.0);
  float shin = mix(uMat.w * 7.0, uMat.w * 0.15, rough);
  vec3 lt = lights(n, v, shin, vS);
  float diff = lt.x * uMat.y * 1.6;
  float spec = lt.y * mix(uMat.z, 1.0, metal) * mix(1.0, 0.35, rough) * 2.5;
  vec3 r = reflect(-v, n);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 fres = f0 + (vec3(1.0) - f0) * pow(1.0 - max(dot(n, v), 0.0), 5.0) * (1.0 - rough);
  vec3 env = mix(toLinear(uGround.rgb) * 1.2, toLinear(uSky.rgb) * 1.5, smoothstep(-0.25 - rough * 0.5, 0.25 + rough * 0.5, r.y));
  vec3 lit = albedo * (hemi + vec3(diff)) * (1.0 - metal)
           + albedo * env * metal * (1.0 - 0.6 * rough)
           + env * fres * (1.0 - rough) * 0.5
           + vec3(spec) * mix(vec3(1.0), albedo, metal);
  lit = lit + albedo * vec3(1.0, 0.38, 0.26) * lt.z * 0.5 * (1.0 - metal);
  lit = lit + albedo * glowAt(vW, n) * (1.0 - metal);
  lit = lit + albedo * vM.w * uFx.z;
  return vec4(toSrgb(aces(lit * uFx.y)), vM.z);
}

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uEye.xyz - vW);
  if (uLight.w > 0.5) {
    vec3 g = glowAt(vW, n) * (1.0 - vM.x);
    if (uFx.x > 0.5) { outColor = vec4(toSrgb(aces(toLinear(vC) * (vM.w * uFx.z + g) * uFx.y)), vM.z); return; }
    outColor = vec4(clamp(vC * (min(vM.w, 1.0) + g), vec3(0.0), vec3(1.0)), vM.z); return;
  }
  if (uFx.x > 0.5) { outColor = filmic(n, v); return; }
  float metal = vM.x;
  float rough = vM.y;
  vec3 hemi = mix(uGround.rgb, uSky.rgb, n.y * 0.5 + 0.5) * uMat.x * (uFx.w > 0.5 ? 0.7 : 1.0);
  float shin = mix(uMat.w * 7.0, uMat.w * 0.15, rough);
  vec3 lt = lights(n, v, shin, vS);
  float diff = lt.x * uMat.y;
  float spec = lt.y * mix(uMat.z, 1.0, metal) * mix(1.0, 0.35, rough);
  vec3 r = reflect(-v, n);
  vec3 env = mix(uGround.rgb * 1.2, uSky.rgb * 1.5, smoothstep(-0.25 - rough * 0.5, 0.25 + rough * 0.5, r.y));
  vec3 lit = vC * (hemi + vec3(diff)) * (1.0 - metal)
           + vC * env * metal * (1.0 - 0.6 * rough)
           + vec3(spec) * mix(vec3(1.0), vC, metal)
           + vC * vec3(1.0, 0.38, 0.26) * lt.z * 0.25 * (1.0 - metal);
  lit = lit + vC * glowAt(vW, n) * (1.0 - metal);
  lit = mix(lit, vC * 1.15, min(vM.w, 1.0));
  outColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), vM.z);
}`;
/**
 * Sets up WebGL2 on a canvas. Rejects when WebGL2 is not available. Same call and options as createGpu:
 * returns { render(mesh, view, options), pixels(...), destroy() }. `device.lost` resolves when the context is lost.
 */
export const createGl = async (canvas, { onError } = {}) => {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false }); // opaque but where a screen punches a hole as WebGL2RenderingContext | null;
    if (!gl)
        throw new Error('WebGL2 is not available in this browser');
    const lost = new Promise((resolve) => canvas.addEventListener('webglcontextlost', (e) => (e.preventDefault(), resolve({ reason: 'lost', message: 'WebGL context lost' }))));
    const program = (vs, fs) => {
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                const message = `shader: ${gl.getShaderInfoLog(s)}`;
                onError?.(message);
                throw new Error(message);
            }
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            const message = `program: ${gl.getProgramInfoLog(p)}`;
            onError?.(message);
            throw new Error(message);
        }
        return p;
    };
    const meshProg = program(GL_VERT, GL_FRAG);
    const instProg = program(GL_VERT_INST, GL_FRAG);
    const skinProg = program(GL_VERT_SKIN, GL_FRAG);
    const skinBones = gl.getUniformLocation(skinProg, 'uBones');
    const skinEmission = gl.getUniformLocation(skinProg, 'uEmission');
    const emission = new Float32Array(MAX_BONES);
    const uni = (p) => {
        const g = (n) => gl.getUniformLocation(p, n);
        return { vp: g('uVp'), light: g('uLight'), sky: g('uSky'), ground: g('uGround'), eye: g('uEye'), mat: g('uMat'), fx: g('uFx'), fill: g('uFill'), rim: g('uRim'), lp: g('uLP'), lc: g('uLC'), ln: g('uLN'), ld: g('uLd') };
    };
    const lineProg = program(GL_VERT_LINE, GL_FRAG_LINE);
    const lineVp = gl.getUniformLocation(lineProg, 'uVp');
    const lineLd = gl.getUniformLocation(lineProg, 'uLd');
    const lineUnlit = gl.getUniformLocation(lineProg, 'uUnlit');
    const planetProg = program(PLANET_GLSL_VS, PLANET_GLSL_FS.replace('uniform vec4 uRes;', 'uniform vec4 uRes; uniform vec4 uOff;').replace('gl_FragCoord.x / uRes.x', '(gl_FragCoord.x - uOff.x) / uRes.x').replace('gl_FragCoord.y / uRes.y', '(gl_FragCoord.y - uOff.y) / uRes.y'));
    const planetU = { inv: gl.getUniformLocation(planetProg, 'uInv'), vp: gl.getUniformLocation(planetProg, 'uVpR'), res: gl.getUniformLocation(planetProg, 'uRes'), off: gl.getUniformLocation(planetProg, 'uOff') };
    const markProg = program(GL_VERT_MARK, GL_FRAG_MARK);
    const markVp = gl.getUniformLocation(markProg, 'uVp');
    const markLd = gl.getUniformLocation(markProg, 'uLd');
    const markRes = gl.getUniformLocation(markProg, 'uRes');
    const markFocal = gl.getUniformLocation(markProg, 'uFocal');
    const meshU = uni(meshProg);
    const instU = uni(instProg);
    const skinU = uni(skinProg);
    const screenProg = program(GL_VERT_SCREEN, GL_FRAG_SCREEN);
    const screenVp = gl.getUniformLocation(screenProg, 'uVp');
    const screenLd = gl.getUniformLocation(screenProg, 'uLd');
    const screenTexU = gl.getUniformLocation(screenProg, 'uTex');
    const screenTex = [];
    const holeProg = program(GL_VERT_SCREEN, GL_FRAG_HOLE);
    const holeVp = gl.getUniformLocation(holeProg, 'uVp');
    const holeLd = gl.getUniformLocation(holeProg, 'uLd');
    const stride = GL_FLOATS * 4;
    const buffer = () => gl.createBuffer();
    const vaoWith = (setup) => {
        const v = gl.createVertexArray();
        gl.bindVertexArray(v);
        setup();
        gl.bindVertexArray(null);
        return v;
    };
    const attr = (loc, size, stride, offset, divisor = 0) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(loc, divisor);
    };
    const solidBuf = buffer();
    const glassBuf = buffer();
    const protoBuf = buffer();
    const instBuf = buffer();
    const edgeBuf = buffer();
    const edgeVao = vaoWith(() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
        attr(0, 3, 12, 0);
    });
    const planetBuf = buffer();
    const planetVao = vaoWith(() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf);
        for (let k = 0; k < 9; k++)
            attr(k, 4, PLANET_FLOATS * 4, k * 16, 1);
    });
    const markBuf = buffer();
    const markVao = vaoWith(() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, markBuf);
        const s = MARK_FLOATS * 4;
        attr(0, 3, s, 0, 1);
        attr(1, 3, s, 12, 1);
        attr(2, 4, s, 24, 1);
        attr(3, 1, s, 40, 1);
        attr(4, 3, s, 44, 1);
    });
    let markCount = 0;
    let edgeCount = 0;
    let edgeMesh = null;
    let edgeParts;
    let edgeOn = false;
    const meshAttrs = (b) => () => {
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        attr(0, 3, stride, 0);
        attr(1, 3, stride, 12);
        attr(2, 3, stride, 24);
        attr(3, 4, stride, 36);
        attr(4, 1, stride, 52);
    };
    const solidVao = vaoWith(meshAttrs(solidBuf));
    const skinSolidBuf = buffer();
    const skinGlassBuf = buffer();
    const skinAttrs = (b) => () => {
        const st = SKIN_FLOATS * 4;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        attr(0, 3, st, 0);
        attr(1, 3, st, 12);
        attr(2, 3, st, 24);
        attr(3, 4, st, 36);
        attr(4, 1, st, 52);
        attr(5, 4, st, 56);
        attr(6, 4, st, 72);
    };
    const skinSolidVao = vaoWith(skinAttrs(skinSolidBuf));
    const skinGlassVao = vaoWith(skinAttrs(skinGlassBuf));
    const skinVerts = skinCache();
    const screenBuf = buffer();
    const screenVao = vaoWith(() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, screenBuf);
        attr(0, 3, SCREEN_FLOATS * 4, 0);
        attr(1, 2, SCREEN_FLOATS * 4, 12);
    });
    let skinSolidCount = 0;
    let skinGlassCount = 0;
    const glassVao = vaoWith(meshAttrs(glassBuf));
    const instVao = vaoWith(() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, protoBuf);
        attr(0, 3, stride, 0);
        attr(1, 3, stride, 12);
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        [5, 6, 7, 8, 9].forEach((loc, k) => attr(loc, 3, GL_INSTANCE_FLOATS * 4, k * 12, 1));
    });
    // Geometry that did not change since the last frame is not rebuilt or uploaded again.
    let uploaded = null;
    let uploadedPalette;
    let uploadedSmooth = 0;
    let partCache = new WeakMap();
    let partPalette;
    let partSmooth = 0;
    let vertexCount = 0;
    let protoMesh = null;
    let protoCount = 0;
    let instData = null;
    let instCount = 0;
    let glassTris = [];
    let glassSource = new Float32Array(0);
    let glassCount = 0;
    let glassEye = '';
    let px = 0;
    const upload = (b, data) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    };
    const draw = (mesh, view, { size = 400, fit, background = [0.98, 0.98, 0.97], transparent = false, light = {}, material = {}, palette, dpr = globalThis.devicePixelRatio || 1, instances, parts, tonemap = false, smooth = false, studio = false, edges = false, marks, unlit = false, glow = false, skin, screens, xr, logDepth = 0, planets } = {}) => {
        const L = { ...defaultLight, ...light };
        const filmic = tonemap ? { exposure: 1, emit: 2, ...(tonemap === true ? {} : tonemap) } : null;
        const M = { ...defaultMaterial, ...material };
        let cam = makeCamera(view, mesh, size, fit);
        if (xr) {
            // a WebXR eye: its axes from the rows of the view matrix (right, up, back), its place from the caller
            const v = xr.view;
            cam = { ...cam, eye: [...xr.eye], r: [v[0], v[4], v[8]], u: [v[1], v[5], v[9]], f: [-v[2], -v[6], -v[10]], ortho: false };
            marks = undefined;
        }
        else {
            const n = Math.max(1, Math.round(size * dpr));
            if (n !== px) {
                px = n;
                canvas.width = n;
                canvas.height = n;
            }
        }
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
                all = new Float32Array(built.reduce((s, v) => s + v.length, 0));
                let at = 0;
                for (const v of built) {
                    all.set(v, at);
                    at += v.length;
                }
            }
            else
                all = buildVertices(mesh, palette, { smooth: crease });
            // solid triangles first; triangles with alpha < 1 are kept apart and blended afterwards
            const tri = 3 * GL_FLOATS;
            const solid = new Float32Array(all.length);
            let solidLen = 0;
            glassTris = [];
            for (let o = 0; o < all.length; o += tri) {
                if (all[o + 11] < 1) {
                    const c = [0, 1, 2].map((k) => (all[o + k] + all[o + GL_FLOATS + k] + all[o + 2 * GL_FLOATS + k]) / 3);
                    glassTris.push({ c, at: o });
                }
                else {
                    solid.set(all.subarray(o, o + tri), solidLen);
                    solidLen += tri;
                }
            }
            glassSource = all;
            glassEye = '';
            upload(solidBuf, solid.subarray(0, solidLen));
            vertexCount = solidLen / GL_FLOATS;
            uploaded = mesh;
            uploadedPalette = palette;
        }
        if (!edges)
            edgeCount = 0;
        else if (mesh !== edgeMesh || parts !== edgeParts || !edgeOn) {
            const e = sceneEdges(mesh, parts);
            upload(edgeBuf, e);
            edgeCount = e.length / 3;
            edgeMesh = mesh;
            edgeParts = parts;
        }
        edgeOn = edges;
        if (instances?.mesh && instances.mesh !== protoMesh) {
            const v = buildVertices(instances.mesh);
            upload(protoBuf, v);
            protoCount = v.length / GL_FLOATS;
            protoMesh = instances.mesh;
        }
        if (instances?.data && instances.data !== instData) {
            upload(instBuf, instances.data);
            instData = instances.data;
            instCount = instances.data.length / GL_INSTANCE_FLOATS;
        }
        if (!instances)
            instCount = 0;
        let bones = null;
        if (skin && skin.meshes.length) {
            const v = skinVerts(skin, palette, crease);
            if (v.fresh) {
                upload(skinSolidBuf, v.solid);
                upload(skinGlassBuf, v.glass);
                skinSolidCount = v.solid.length / SKIN_FLOATS;
                skinGlassCount = v.glass.length / SKIN_FLOATS;
            }
            bones = skin.bones.subarray(0, MAX_BONES * 12);
        }
        else
            skinSolidCount = skinGlassCount = 0;
        const eyeKey = cam.eye.join(',');
        if (glassTris.length && eyeKey !== glassEye) {
            glassEye = eyeKey;
            const [ex, ey, ez] = cam.eye;
            const far = (t) => (t.c[0] - ex) ** 2 + (t.c[1] - ey) ** 2 + (t.c[2] - ez) ** 2;
            const sorted = [...glassTris].sort((a, b) => far(b) - far(a)); // far first
            const out = new Float32Array(sorted.length * 3 * GL_FLOATS);
            sorted.forEach((t, k) => out.set(glassSource.subarray(t.at, t.at + 3 * GL_FLOATS), k * 3 * GL_FLOATS));
            upload(glassBuf, out);
            glassCount = sorted.length * 3;
        }
        if (!glassTris.length)
            glassCount = 0;
        // studio rig, relative to the camera: key upper left in front, fill from the right, rim from behind and above
        const rig = (f, r, up) => norm([0, 1, 2].map((k) => -cam.f[k] * f + cam.r[k] * r + cam.u[k] * up));
        const S = studio ? { fill: 0.4, rim: 1, ...(studio === true ? {} : studio) } : null;
        const vp = xr ? mul4(xr.projection, xr.view) : viewProjection(cam, nearPlane(cam, mesh));
        const ld = logDepth > 0 && !cam.ortho ? logDepth : 0; // logarithmic depth (GpuRenderOptions.logDepth)
        const key = S ? rig(0.7, -0.5, 0.6) : norm(L.direction);
        const fill = rig(0.6, 0.8, 0.1);
        const rim = rig(-0.8, 0.3, 0.5);
        const glowLights = glow ? sceneLights(mesh, parts, palette, skin) : new Float32Array(0);
        const glowN = glowLights.length / LIGHT_FLOATS;
        const glowPos = new Float32Array(MAX_LIGHTS * 4);
        const glowCol = new Float32Array(MAX_LIGHTS * 4);
        for (let k = 0; k < glowN; k++) {
            glowPos.set(glowLights.subarray(k * LIGHT_FLOATS, k * LIGHT_FLOATS + 4), k * 4);
            glowCol.set(glowLights.subarray(k * LIGHT_FLOATS + 4, k * LIGHT_FLOATS + 7), k * 4);
        }
        const setU = (u) => {
            gl.uniformMatrix4fv(u.vp, false, vp);
            gl.uniform1f(u.ld, ld);
            gl.uniform4f(u.light, key[0], key[1], key[2], unlit ? 1 : 0);
            gl.uniform4f(u.sky, L.sky[0], L.sky[1], L.sky[2], 0);
            gl.uniform4f(u.ground, L.ground[0], L.ground[1], L.ground[2], 0);
            gl.uniform4f(u.eye, cam.eye[0], cam.eye[1], cam.eye[2], 0);
            gl.uniform4f(u.mat, M.ambient, M.diffuse, M.specular, M.shininess);
            gl.uniform4f(u.fx, filmic ? 1 : 0, filmic ? filmic.exposure : 1, filmic ? filmic.emit : 0, S ? 1 : 0);
            gl.uniform4f(u.fill, fill[0], fill[1], fill[2], S ? S.fill : 0);
            gl.uniform4f(u.rim, rim[0], rim[1], rim[2], S ? S.rim : 0);
            gl.uniform1f(u.ln, glowN);
            if (glowN) {
                gl.uniform4fv(u.lp, glowPos);
                gl.uniform4fv(u.lc, glowCol);
            }
        };
        if (xr) {
            // into the XR layer's framebuffer, only this eye's part of it (the scissor keeps the other eye when clearing)
            const [x, y, w, h] = xr.viewport;
            gl.bindFramebuffer(gl.FRAMEBUFFER, xr.framebuffer);
            gl.viewport(x, y, w, h);
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(x, y, w, h);
        }
        else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.disable(gl.SCISSOR_TEST);
            gl.viewport(0, 0, px, px);
        }
        gl.clearColor(transparent ? 0 : background[0], transparent ? 0 : background[1], transparent ? 0 : background[2], transparent ? 0 : 1);
        gl.clearDepth(1);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.disable(gl.CULL_FACE);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (vertexCount) {
            gl.useProgram(meshProg);
            setU(meshU);
            gl.bindVertexArray(solidVao);
            gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        }
        if (instCount && protoCount) {
            gl.useProgram(instProg);
            setU(instU);
            gl.bindVertexArray(instVao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, protoCount, instCount);
        }
        const drawSkin = (vao, count) => {
            gl.useProgram(skinProg);
            setU(skinU);
            if (bones && bones.length)
                gl.uniform4fv(skinBones, bones);
            emission.fill(1);
            if (skin?.emission)
                emission.set(skin.emission.subarray(0, MAX_BONES));
            gl.uniform4fv(skinEmission, emission);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLES, 0, count);
        };
        if (skinSolidCount)
            drawSkin(skinSolidVao, skinSolidCount);
        // screens: each picture into its texture, then its quad, depth tested like a face
        const shown = (screens ?? []).map((sc, i) => ({ sc, i })).filter(({ sc }) => !sc.hole && (sc.source?.width | 0) > 0 && (sc.source?.height | 0) > 0);
        const holes = (screens ?? []).map((sc, i) => ({ sc, i })).filter(({ sc }) => sc.hole);
        if (holes.length) {
            // holes: transparent pixels, depth tested (a page behind the canvas shows through)
            upload(screenBuf, buildScreenQuads(screens));
            gl.useProgram(holeProg);
            gl.uniformMatrix4fv(holeVp, false, vp);
            gl.uniform1f(holeLd, ld);
            gl.bindVertexArray(screenVao);
            for (const { i } of holes)
                gl.drawArrays(gl.TRIANGLES, i * 6, 6);
        }
        if (shown.length) {
            upload(screenBuf, buildScreenQuads(screens));
            gl.useProgram(screenProg);
            gl.uniformMatrix4fv(screenVp, false, vp);
            gl.uniform1f(screenLd, ld);
            gl.uniform1i(screenTexU, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindVertexArray(screenVao);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            for (const { sc, i } of shown) {
                let t = screenTex[i];
                if (!t) {
                    t = screenTex[i] = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, t);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                }
                else
                    gl.bindTexture(gl.TEXTURE_2D, t);
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sc.source);
                    gl.drawArrays(gl.TRIANGLES, i * 6, 6);
                }
                catch { }
            }
        }
        // the shader planets (planet.ts): ray-traced over the scene, writing their depth
        if (planets?.length && !cam.ortho) {
            let vpRot;
            let eye = cam.eye;
            if (xr) {
                const v = Float32Array.from(xr.view);
                v[12] = v[13] = v[14] = 0;
                vpRot = mul4(xr.projection, v);
                eye = xr.eye;
            }
            else
                vpRot = viewProjection({ ...cam, eye: [0, 0, 0] }, nearPlane(cam, mesh));
            const inv = inv4(vpRot);
            const pi = inv ? planetInstances(planets, eye, vpRot) : null;
            if (pi?.count && inv) {
                gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf);
                gl.bufferData(gl.ARRAY_BUFFER, pi.data, gl.DYNAMIC_DRAW);
                gl.useProgram(planetProg);
                gl.uniformMatrix4fv(planetU.inv, false, inv);
                gl.uniformMatrix4fv(planetU.vp, false, vpRot);
                const [vx, vy, vw, vh] = xr ? xr.viewport : [0, 0, px, px];
                gl.uniform4f(planetU.res, vw, vh, ld, 0);
                gl.uniform4f(planetU.off, vx, vy, 0, 0);
                gl.enable(gl.BLEND);
                gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.bindVertexArray(planetVao);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, pi.count);
                gl.disable(gl.BLEND);
            }
        }
        if (edgeCount) {
            gl.useProgram(lineProg);
            gl.uniformMatrix4fv(lineVp, false, vp);
            gl.uniform1f(lineLd, ld);
            gl.uniform1f(lineUnlit, unlit ? 1 : 0);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthFunc(gl.LEQUAL);
            gl.depthMask(false);
            gl.bindVertexArray(edgeVao);
            gl.drawArrays(gl.LINES, 0, edgeCount);
            gl.depthMask(true);
            gl.depthFunc(gl.LESS);
            gl.disable(gl.BLEND);
        }
        if (glassCount) {
            // after everything solid: see-through faces, far to near; they test depth but do not write it
            gl.useProgram(meshProg);
            setU(meshU);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.bindVertexArray(glassVao);
            gl.drawArrays(gl.TRIANGLES, 0, glassCount);
            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
        if (skinGlassCount) {
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            drawSkin(skinGlassVao, skinGlassCount);
            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
        // the marks relative to the eye, drawn with the eye-centred matrix (an orbit far from the origin stays put near the camera)
        const markEye = xr ? xr.eye : cam.eye;
        const markData = marks?.length ? buildMarks(marks, markEye) : null;
        markCount = markData ? markData.length / MARK_FLOATS : 0;
        if (markCount && markData) {
            let vpe;
            if (xr) {
                const v = Float32Array.from(xr.view);
                v[12] = v[13] = v[14] = 0;
                vpe = mul4(xr.projection, v);
            }
            else
                vpe = viewProjection({ ...cam, eye: [0, 0, 0] }, nearPlane(cam, mesh));
            gl.bindBuffer(gl.ARRAY_BUFFER, markBuf);
            gl.bufferData(gl.ARRAY_BUFFER, markData, gl.DYNAMIC_DRAW);
            gl.useProgram(markProg);
            gl.uniformMatrix4fv(markVp, false, vpe);
            gl.uniform1f(markFocal, cam.ortho ? 0 : cam.k * (px / size));
            gl.uniform1f(markLd, ld);
            gl.uniform3f(markRes, px, px, px / size);
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(false);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindVertexArray(markVao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, markCount);
            gl.disable(gl.BLEND);
            gl.depthMask(true);
            gl.enable(gl.DEPTH_TEST);
        }
        gl.bindVertexArray(null);
        if (xr)
            gl.disable(gl.SCISSOR_TEST);
    };
    const render = (mesh, view, options) => draw(mesh, view, options);
    const pixels = (mesh, view, options) => {
        draw(mesh, view, options);
        const raw = new Uint8Array(px * px * 4);
        gl.readPixels(0, 0, px, px, gl.RGBA, gl.UNSIGNED_BYTE, raw); // read in the same task as the draw, before the buffer is presented
        const data = new Uint8ClampedArray(px * px * 4);
        for (let y = 0; y < px; y++)
            data.set(raw.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4); // GL rows go bottom up
        if (!options?.transparent)
            for (let i = 3; i < data.length; i += 4)
                data[i] = 255;
        return Promise.resolve({ width: px, height: px, data });
    };
    const destroy = () => {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    return { render, pixels, destroy, device: { lost }, adapter: null, context: gl };
};

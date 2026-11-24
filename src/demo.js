// A tiny raw-WebGL scene that renders through the WebXR API only: it works against the emulator or a real headset.
import { install } from './emulator/xr.js';
import { compose, mul, invertRigid, scaling } from './math.js';

if (!navigator.xr || new URLSearchParams(location.search).has('emulate')) install();

const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { xrCompatible: true, antialias: true });
const out = document.getElementById('log');

const vs = `#version 300 es
in vec3 p; uniform mat4 vp, m; out vec3 n;
void main() { n = p; gl_Position = vp * m * vec4(p, 1.); }`;
const fs = `#version 300 es
precision mediump float; in vec3 n; uniform vec3 tint; out vec4 o;
void main() { o = vec4(tint * (.55 + .45 * abs(normalize(n)).y + .2 * abs(n.x)), 1.); }`;
const program = gl.createProgram();
for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  gl.attachShader(program, s);
}
gl.linkProgram(program);
const cube = new Float32Array([-1,-1,-1, 1,-1,-1, 1,1,-1, -1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,1,1, 1,-1,1, -1,-1,1, -1,1,1, 1,1,1, -1,-1,-1, -1,1,1, -1,-1,1, -1,-1,-1, -1,1,-1, -1,1,1, 1,-1,-1, 1,-1,1, 1,1,1, 1,-1,-1, 1,1,1, 1,1,-1, -1,-1,-1, 1,-1,1, 1,-1,-1, -1,-1,-1, -1,-1,1, 1,-1,1, -1,1,-1, 1,1,-1, 1,1,1, -1,1,-1, 1,1,1, -1,1,1]);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);
const loc = gl.getAttribLocation(program, 'p');
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);

const world = [
  // a floor, and a few cubes around the start position
  { at: [0, -0.05, 0], size: [6, 0.05, 6], tint: [0.25, 0.3, 0.35] },
  { at: [0, 1, -3], size: [0.4, 0.4, 0.4], tint: [0.9, 0.5, 0.2] },
  { at: [-2, 0.5, -2], size: [0.3, 0.5, 0.3], tint: [0.3, 0.8, 0.5] },
  { at: [2, 0.8, -2.5], size: [0.5, 0.8, 0.5], tint: [0.5, 0.5, 0.95] },
];
const drawBox = ({ at, size, tint }, vp, extra = null) => {
  const model = mul(compose(at, extra ?? [0, 0, 0, 1]), scaling(size));
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'vp'), false, vp);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'm'), false, model);
  gl.uniform3fv(gl.getUniformLocation(program, 'tint'), tint);
  gl.drawArrays(gl.TRIANGLES, 0, 36);
};

const state = (window.demoState = { frames: 0, views: 0, selects: 0, squeezes: 0, lastHead: null, session: false });
let space;

const frame = (time, f) => {
  const session = f.session;
  session.requestAnimationFrame(frame);
  const pose = f.getViewerPose(space);
  if (!pose) return;
  const layer = session.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0.06, 0.08, 0.1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  for (const view of pose.views) {
    const v = layer.getViewport(view);
    gl.viewport(v.x, v.y, v.width, v.height);
    const vp = mul(view.projectionMatrix, invertRigid(view.transform.matrix));
    world.forEach((b) => drawBox(b, vp));
    for (const src of session.inputSources) {
      const p = f.getPose(src.gripSpace, space);
      if (!p) continue;
      const t = p.transform;
      drawBox({ at: [t.position.x, t.position.y, t.position.z], size: [0.03, 0.03, 0.12], tint: src.gamepad.buttons[0].pressed ? [1, 0.2, 0.2] : [0.9, 0.9, 0.9] }, vp, [t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w]);
    }
  }
  state.frames++;
  state.views = pose.views.length;
  const hp = pose.transform.position;
  state.lastHead = [hp.x, hp.y, hp.z];
};

document.getElementById('enter').onclick = async () => {
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  state.session = true;
  if (!window.__xrEmulator) await gl.makeXRCompatible?.(); // the emulator draws into the page canvas, nothing to hand over
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
  space = await session.requestReferenceSpace('local-floor');
  session.addEventListener('select', () => { state.selects++; out.textContent = `select ${state.selects}`; });
  session.addEventListener('squeeze', () => { state.squeezes++; });
  session.addEventListener('end', () => { state.session = false; });
  session.requestAnimationFrame(frame);
};

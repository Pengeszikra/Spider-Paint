// A dependency-free WebXR device emulator: installs a working `navigator.xr` (immersive-vr) that renders both eyes side by side into the page canvas.
// Coordinates follow WebXR: metres, +Y up, the user looks down -Z, the 'local-floor' space is the world frame.
import { compose, decompose, invertRigid, mul, perspectiveFov, quatFromYawPitch, quatMul, rotate } from '../math.js';
import { devices } from './devices.js';

const HEAD_HEIGHT = 1.6;
const pt = (p, w = 1) => (typeof DOMPointReadOnly === 'function' ? new DOMPointReadOnly(p[0], p[1], p[2], w) : { x: p[0], y: p[1], z: p[2], w });

export class Transform {
  constructor(position = { x: 0, y: 0, z: 0 }, orientation = { x: 0, y: 0, z: 0, w: 1 }) {
    const p = Array.isArray(position) ? position : [position.x ?? 0, position.y ?? 0, position.z ?? 0];
    const q = Array.isArray(orientation) ? orientation : [orientation.x ?? 0, orientation.y ?? 0, orientation.z ?? 0, orientation.w ?? 1];
    this.position = pt(p);
    this.orientation = pt(q, q[3]);
    this.matrix = compose(p, q);
  }
  get inverse() {
    const { position, orientation } = decompose(invertRigid(this.matrix));
    return new Transform(position, orientation);
  }
}

/** A tracked thing in the world: `pose()` returns its world matrix (or null when it is not tracked right now). */
class Space {
  constructor(kind, pose = () => compose([0, 0, 0], [0, 0, 0, 1])) {
    this.kind = kind;
    this.pose = pose;
  }
  getOffsetReferenceSpace(offset) {
    // A reference space moved by `offset`: a point in the new space is that point under the offset, placed in the old one.
    return new Space(this.kind, () => mul(this.pose(), offset.matrix ? new Float32Array(offset.matrix) : offset));
  }
}

class Pose {
  constructor(matrix, extra = {}) {
    this.transform = new Transform(...Object.values(decompose(matrix)));
    this.emulatedPosition = false;
    Object.assign(this, extra);
  }
}

class View {
  constructor(eye, matrix, projection, viewport) {
    this.eye = eye;
    this.projectionMatrix = projection;
    this.transform = new Transform(...Object.values(decompose(matrix)));
    this.recommendedViewportScale = null;
    this.viewport = viewport;
  }
  requestViewportScale() {}
}

class ViewerPose extends Pose {
  constructor(matrix, views) {
    super(matrix);
    this.views = views;
  }
}

class Frame {
  constructor(session, time) {
    this.session = session;
    this.time = time;
    this.active = true;
  }
  getViewerPose(space) {
    const rig = this.session.emulator.rig;
    const base = space.pose();
    if (!base) return null;
    const toSpace = invertRigid(base);
    const head = mul(toSpace, rig.headMatrix());
    const layer = this.session.renderState.baseLayer;
    const w = layer ? layer.framebufferWidth / 2 : 1, h = layer ? layer.framebufferHeight : 1;
    const near = this.session.renderState.depthNear, far = this.session.renderState.depthFar;
    const views = ['left', 'right'].map((eye, i) => {
      const dev = this.session.emulator.device;
      const fov = eye === 'left' ? dev.fov : { left: dev.fov.right, right: dev.fov.left, up: dev.fov.up, down: dev.fov.down };
      const offset = compose([(eye === 'left' ? -1 : 1) * dev.ipd / 2, 0, 0], [0, 0, 0, 1]);
      return new View(eye, mul(head, offset), perspectiveFov(fov, near, far), { x: i * w, y: 0, width: w, height: h });
    });
    return new ViewerPose(head, views);
  }
  getPose(space, baseSpace) {
    const m = space.pose(), base = baseSpace.pose();
    if (!m || !base) return null;
    return new Pose(mul(invertRigid(base), m));
  }
}

class Layer {
  constructor(session, gl, init = {}) {
    this.session = session;
    this.context = gl;
    this.framebuffer = null; // the page canvas itself, both eyes side by side
    this.antialias = init.antialias ?? true;
    this.ignoreDepthValues = false;
    const dev = session.emulator.device;
    const scale = init.framebufferScaleFactor ?? 1;
    this.framebufferWidth = Math.round(dev.resolution.width * 2 * scale * session.emulator.options.resolutionScale);
    this.framebufferHeight = Math.round(dev.resolution.height * scale * session.emulator.options.resolutionScale);
    const canvas = gl.canvas;
    if (canvas) {
      canvas.width = this.framebufferWidth;
      canvas.height = this.framebufferHeight;
    }
  }
  getViewport(view) {
    const v = view.viewport;
    return { x: v.x, y: v.y, width: v.width, height: v.height };
  }
}

class InputSource {
  constructor(emulator, handedness) {
    this.handedness = handedness;
    this.targetRayMode = 'tracked-pointer';
    this.profiles = emulator.device.profiles;
    this.hand = null;
    this.targetRaySpace = new Space('target-ray', () => emulator.rig.controllerMatrix(handedness));
    this.gripSpace = new Space('grip', () => emulator.rig.controllerMatrix(handedness));
    // Same layout as the xr-standard mapping: trigger, squeeze, (touchpad), thumbstick click, A/X, B/Y.
    const button = () => ({ pressed: false, touched: false, value: 0 });
    this.gamepad = { id: '', index: -1, connected: true, mapping: 'xr-standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, button) };
  }
}

const BUTTONS = { trigger: 0, squeeze: 1, thumbstick: 3, a: 4, b: 5 };

class Session extends EventTarget {
  constructor(emulator, mode) {
    super();
    this.emulator = emulator;
    this.mode = mode;
    this.visibilityState = 'visible';
    this.frameRate = emulator.device.refreshRate;
    this.supportedFrameRates = emulator.device.supportedFrameRates;
    this.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 1000, inlineVerticalFieldOfView: null };
    this.inputSources = [];
    this._callbacks = new Map();
    this._next = 1;
    this._ended = false;
    this.onend = this.onselect = this.onselectstart = this.onselectend = this.onsqueeze = this.onsqueezestart = this.onsqueezeend = this.oninputsourceschange = null;
  }
  updateRenderState(state = {}) {
    Object.assign(this.renderState, state);
  }
  async requestReferenceSpace(type) {
    const rig = this.emulator.rig;
    if (type === 'viewer') return new Space('viewer', () => rig.headMatrix());
    if (type === 'local-floor' || type === 'bounded-floor') return new Space(type);
    if (type === 'local') return new Space('local', () => compose([0, -HEAD_HEIGHT, 0], [0, 0, 0, 1]) /* the origin sits at the standing head height */);
    throw new DOMException(`Reference space "${type}" is not supported by the emulator`, 'NotSupportedError');
  }
  requestAnimationFrame(callback) {
    const id = this._next++;
    this._callbacks.set(id, callback);
    return id;
  }
  cancelAnimationFrame(id) {
    this._callbacks.delete(id);
  }
  async updateTargetFrameRate(rate) {
    this.frameRate = rate;
  }
  async end() {
    if (this._ended) return;
    this._ended = true;
    this.emulator.finish(this);
    this.dispatch('end', new Event('end'));
  }
  dispatch(type, event) {
    event.session = this;
    this.dispatchEvent(event);
    this[`on${type}`]?.(event);
  }
  /** One emulated display frame: update the rig from the inputs, then call back everything queued. */
  tick(time) {
    if (this._ended) return;
    const callbacks = [...this._callbacks];
    this._callbacks.clear();
    const frame = new Frame(this, time);
    for (const [, cb] of callbacks) cb(time, frame);
    frame.active = false;
  }
}

class XR extends EventTarget {
  constructor(emulator) {
    super();
    this.emulator = emulator;
    this.ondevicechange = null;
  }
  async isSessionSupported(mode) {
    return mode === 'immersive-vr';
  }
  async requestSession(mode, init = {}) {
    if (mode !== 'immersive-vr') throw new DOMException(`Session mode "${mode}" is not supported by the emulator`, 'NotSupportedError');
    return this.emulator.begin(mode);
  }
}

/** The rig: where the head and the two hands are, driven by code (tests) or by the keyboard and mouse (people). */
class Rig {
  constructor() {
    this.reset();
  }
  reset() {
    this.position = [0, HEAD_HEIGHT, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.hands = { left: { aim: [0, 0], offset: [-0.2, -0.35, -0.35] }, right: { aim: [0, 0], offset: [0.2, -0.35, -0.35] } };
    this.override = { left: null, right: null };
  }
  orientation() {
    return quatFromYawPitch(this.yaw, this.pitch);
  }
  headMatrix() {
    return compose(this.position, this.orientation());
  }
  controllerMatrix(hand) {
    const o = this.override[hand];
    if (o) return compose(o.position, o.orientation);
    const { aim, offset } = this.hands[hand];
    const yawQ = quatFromYawPitch(this.yaw, 0);
    const p = rotate(yawQ, offset);
    const q = quatMul(yawQ, quatFromYawPitch(aim[0], aim[1] + this.pitch));
    return compose([this.position[0] + p[0], this.position[1] + p[1], this.position[2] + p[2]], q);
  }
}

export class Emulator {
  constructor({ device = 'metaQuest3', resolutionScale = 0.25 } = {}) {
    this.device = devices[device] ?? device;
    this.options = { resolutionScale };
    this.rig = new Rig();
    this.session = null;
    this.keys = new Set();
    this.xr = new XR(this);
    this.log = [];
    this.running = false;
  }

  begin(mode) {
    if (this.session) throw new DOMException('An XRSession is already active', 'InvalidStateError');
    this.session = new Session(this, mode);
    const left = new InputSource(this, 'left'), right = new InputSource(this, 'right');
    this.session.inputSources = [left, right];
    this.sources = { left, right };
    this.running = true;
    this.last = 0;
    const loop = (t) => {
      if (!this.running) return;
      this.step(((t - this.last) || 16) / 1000);
      this.last = t;
      this.session?.tick(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return Promise.resolve(this.session);
  }

  finish(session) {
    if (this.session === session) this.session = null;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Moves the rig by held keys: WASD walk (in the heading), R/F up and down, arrows turn. */
  step(dt) {
    const k = this.keys, speed = 1.6 * dt, turn = 1.6 * dt;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (f || s) {
      const d = rotate(quatFromYawPitch(this.rig.yaw, 0), [s * speed, 0, -f * speed]);
      this.rig.position = this.rig.position.map((c, i) => c + d[i]);
    }
    if (k.has('KeyR')) this.rig.position[1] += speed;
    if (k.has('KeyF')) this.rig.position[1] -= speed;
    if (k.has('ArrowLeft')) this.rig.yaw += turn;
    if (k.has('ArrowRight')) this.rig.yaw -= turn;
    if (k.has('ArrowUp')) this.rig.pitch = Math.min(1.4, this.rig.pitch + turn);
    if (k.has('ArrowDown')) this.rig.pitch = Math.max(-1.4, this.rig.pitch - turn);
  }

  // ---- controller input (also the test API) ----

  /** Press or release a controller button: 'trigger' | 'squeeze' | 'thumbstick' | 'a' | 'b'. Fires select/squeeze events like a headset does. */
  button(hand, name, down) {
    const source = this.sources?.[hand];
    if (!source) return;
    const b = source.gamepad.buttons[BUTTONS[name]];
    if (!b || b.pressed === down) return;
    b.pressed = b.touched = down;
    b.value = down ? 1 : 0;
    const type = name === 'trigger' ? 'select' : name === 'squeeze' ? 'squeeze' : null;
    if (!type) return;
    const make = (t) => Object.assign(new Event(t), { inputSource: source, frame: new Frame(this.session, performance.now()) });
    this.session.dispatch(`${type}${down ? 'start' : 'end'}`, make(`${type}${down ? 'start' : 'end'}`));
    if (!down) this.session.dispatch(type, make(type));
  }
  click(hand, name = 'trigger') {
    this.button(hand, name, true);
    this.button(hand, name, false);
  }
  thumbstick(hand, x, y) {
    const a = this.sources?.[hand]?.gamepad.axes;
    if (a) [a[2], a[3]] = [x, y];
  }
  /** Pin a controller to an exact pose, or pass null to let it follow the head again. */
  setController(hand, pose) {
    this.rig.override[hand] = pose && { position: pose.position, orientation: pose.orientation ?? [0, 0, 0, 1] };
  }
  setHead({ position, yaw, pitch }) {
    if (position) this.rig.position = [...position];
    if (yaw !== undefined) this.rig.yaw = yaw;
    if (pitch !== undefined) this.rig.pitch = pitch;
  }

  // ---- install into a page ----

  /** Hooks keyboard and mouse: WASD/RF/arrows move, drag looks, left click = right trigger, Shift+click = left, Space/Alt+Space = squeeze. */
  attach(target = window) {
    const down = (e) => { this.keys.add(e.code); if (e.code === 'Space') this.button(e.shiftKey ? 'left' : 'right', 'squeeze', true); };
    const up = (e) => { this.keys.delete(e.code); if (e.code === 'Space') { this.button('left', 'squeeze', false); this.button('right', 'squeeze', false); } };
    let drag = null;
    const md = (e) => { if (e.button === 2 || e.altKey) drag = [e.clientX, e.clientY]; else this.button(e.shiftKey ? 'left' : 'right', 'trigger', true); };
    const mu = (e) => { drag = null; this.button('left', 'trigger', false); this.button('right', 'trigger', false); };
    const mm = (e) => {
      if (drag) {
        this.rig.yaw -= (e.clientX - drag[0]) * 0.004;
        this.rig.pitch = Math.max(-1.4, Math.min(1.4, this.rig.pitch - (e.clientY - drag[1]) * 0.004));
        drag = [e.clientX, e.clientY];
      } else {
        // the pointer aims the hands inside the view: up to 30 degrees to each side
        const nx = e.clientX / innerWidth * 2 - 1, ny = e.clientY / innerHeight * 2 - 1;
        for (const h of ['left', 'right']) this.rig.hands[h].aim = [-nx * 0.5, -ny * 0.5];
      }
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('mousedown', md);
    target.addEventListener('mouseup', mu);
    target.addEventListener('mousemove', mm);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    return () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('mousedown', md); target.removeEventListener('mouseup', mu); target.removeEventListener('mousemove', mm); };
  }
}

/** Install the emulator: window.XRWebGLLayer & friends plus navigator.xr. Returns the emulator for scripted control. */
export const install = (options = {}) => {
  const emulator = new Emulator(options);
  Object.defineProperty(navigator, 'xr', { value: emulator.xr, configurable: true });
  Object.assign(window, {
    XRRigidTransform: Transform,
    XRWebGLLayer: class extends Layer { constructor(session, gl, init) { super(session, gl, init); } },
    XRSession: Session,
    XRFrame: Frame,
  });
  window.__xrEmulator = emulator;
  if (options.attach !== false) emulator.attach(window);
  return emulator;
};

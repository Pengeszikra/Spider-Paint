// Small column-major 4x4 / quaternion helpers (the same layout WebXR and WebGL use). Positions are [x, y, z], quaternions [x, y, z, w].

export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export const quatMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const quatNormalize = (q) => {
  const n = Math.hypot(...q) || 1;
  return q.map((c) => c / n);
};

/** Yaw (around +Y) then pitch (around the turned +X): the way a head turns. Looking down -Z at yaw 0. */
export const quatFromYawPitch = (yaw, pitch) => quatMul([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]);

export const rotate = (q, v) => {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};

/** Position + orientation -> matrix. */
export const compose = (p, q) => {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0, 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0, 2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0, p[0], p[1], p[2], 1]);
};

/** Matrix (rotation + translation only) -> { position, orientation }. */
export const decompose = (m) => {
  const t = m[0] + m[5] + m[10];
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = [(m[6] - m[9]) / s, (m[8] - m[2]) / s, (m[1] - m[4]) / s, s / 4];
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2;
    q = [s / 4, (m[4] + m[1]) / s, (m[8] + m[2]) / s, (m[6] - m[9]) / s];
  } else if (m[5] > m[10]) {
    const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2;
    q = [(m[4] + m[1]) / s, s / 4, (m[9] + m[6]) / s, (m[8] - m[2]) / s];
  } else {
    const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2;
    q = [(m[8] + m[2]) / s, (m[9] + m[6]) / s, s / 4, (m[1] - m[4]) / s];
  }
  return { position: [m[12], m[13], m[14]], orientation: quatNormalize(q) };
};

export const mul = (a, b) => {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
};

/** Inverse of a rigid transform (rotation + translation): the transpose, and the turned-back translation. */
export const invertRigid = (m) => {
  const out = new Float32Array(16);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = m[r * 4 + c];
  for (let r = 0; r < 3; r++) out[12 + r] = -(out[r] * m[12] + out[4 + r] * m[13] + out[8 + r] * m[14]);
  out[15] = 1;
  return out;
};

/** An off-axis perspective from the four half-angles (degrees), like a headset's per-eye field of view. */
export const perspectiveFov = ({ left, right, up, down }, near, far) => {
  const l = -Math.tan((left * Math.PI) / 180) * near;
  const r = Math.tan((right * Math.PI) / 180) * near;
  const t = Math.tan((up * Math.PI) / 180) * near;
  const b = -Math.tan((down * Math.PI) / 180) * near;
  return new Float32Array([(2 * near) / (r - l), 0, 0, 0, 0, (2 * near) / (t - b), 0, 0, (r + l) / (r - l), (t + b) / (t - b), -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0]);
};

export const scaling = (s) => new Float32Array([s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1]);

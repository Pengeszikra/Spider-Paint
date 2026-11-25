// Simple solids for /add: about a metre, standing on y = 0 round the origin (their foot is the origin, as a placed model's).
// Mesh = { positions, faces: [{ v, color, mat? }] }, faces CCW seen from outside (every shape is convex: each face is turned
// to face away from the middle).

const surface = (color, mat) => ({ color, ...(mat !== undefined ? { mat } : {}) });

const outward = (positions, faces) => {
  const mid = positions.reduce((m, q) => m.map((c, i) => c + q[i] / positions.length), [0, 0, 0]);
  for (const f of faces) {
    const p = f.v.map((i) => positions[i]);
    let n = [0, 0, 0];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
    }
    const c = p.reduce((m, q) => m.map((x, i) => x + q[i] / p.length), [0, 0, 0]);
    if (n[0] * (c[0] - mid[0]) + n[1] * (c[1] - mid[1]) + n[2] * (c[2] - mid[2]) < 0) f.v.reverse();
  }
  return { positions, faces };
};

const ring = (n, r, y) => [...Array(n).keys()].map((i) => [r * Math.cos((2 * Math.PI * i) / n), y, r * Math.sin((2 * Math.PI * i) / n)]);

export const SHAPES = {
  box: ({ color, mat }) => {
    const s = surface(color, mat);
    const positions = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]];
    const faces = [[4, 5, 6, 7], [1, 0, 3, 2], [1, 2, 6, 5], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4]].map((v) => ({ v, ...s }));
    return outward(positions, faces);
  },
  cylinder: ({ color, mat, sides = 16 }) => {
    const s = surface(color, mat);
    const positions = [...ring(sides, 0.5, 0), ...ring(sides, 0.5, 1)];
    const k = [...Array(sides).keys()];
    const faces = [{ v: k.map((i) => i), ...s }, { v: k.map((i) => sides + i), ...s }, ...k.map((i) => ({ v: [i, (i + 1) % sides, sides + ((i + 1) % sides), sides + i], ...s }))];
    return outward(positions, faces);
  },
  cone: ({ color, mat, sides = 16 }) => {
    const s = surface(color, mat);
    const positions = [...ring(sides, 0.5, 0), [0, 1, 0]];
    const k = [...Array(sides).keys()];
    const faces = [{ v: k.map((i) => i), ...s }, ...k.map((i) => ({ v: [i, (i + 1) % sides, sides], ...s }))];
    return outward(positions, faces);
  },
  pyramid: ({ color, mat }) => {
    const s = surface(color, mat);
    const positions = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0]];
    const faces = [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]].map((v) => ({ v, ...s }));
    return outward(positions, faces);
  },
  sphere: ({ color, mat, sides = 16, rings = 8 }) => {
    const s = surface(color, mat);
    const positions = [[0, 0, 0]];
    for (let j = 1; j < rings; j++) {
      const a = (Math.PI * j) / rings;
      positions.push(...ring(sides, 0.5 * Math.sin(a), 0.5 - 0.5 * Math.cos(a)));
    }
    positions.push([0, 1, 0]);
    const top = positions.length - 1, at = (j, i) => 1 + (j - 1) * sides + (i % sides);
    const faces = [];
    for (let i = 0; i < sides; i++) {
      faces.push({ v: [0, at(1, i + 1), at(1, i)], ...s });
      for (let j = 1; j < rings - 1; j++) faces.push({ v: [at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i)], ...s });
      faces.push({ v: [at(rings - 1, i), at(rings - 1, i + 1), top], ...s });
    }
    return outward(positions, faces);
  },
};

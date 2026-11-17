// Tiny vec3 helpers on plain [x, y, z] arrays.
// The curried ones (plus, minus, times) are made for pipelines: `b |> minus(a) |> norm`.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
    const l = len(a);
    return l ? scale(a, 1 / l) : [0, 0, 0];
};
/** `a |> plus(b)` is a + b. */
export const plus = (b) => (a) => add(a, b);
/** `a |> minus(b)` is a - b. */
export const minus = (b) => (a) => sub(a, b);
/** `a |> times(s)` is a * s. */
export const times = (s) => (a) => scale(a, s);

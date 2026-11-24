import { compose, decompose, invertRigid, mul, quatFromYawPitch, rotate } from '../src/math.js';
let failed = 0;
const near = (a, b, eps = 1e-5) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

const q = quatFromYawPitch(0.7, -0.3), p = [1, 2, -3];
const m = compose(p, q);
const d = decompose(m);
check('compose/decompose round trip', near(d.position, p) && (near(d.orientation, q) || near(d.orientation, q.map((c) => -c))));
check('inverse * matrix = identity', near(Array.from(mul(invertRigid(m), m)), [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]));
check('yaw 90deg turns -Z (forward) to -X', near(rotate(quatFromYawPitch(Math.PI / 2, 0), [0, 0, -1]), [-1, 0, 0]));
check('pitch up looks up', rotate(quatFromYawPitch(0, 0.5), [0, 0, -1])[1] > 0.4);
process.exit(failed ? 1 : 0);

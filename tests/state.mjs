// src/state.js: signal / zignal (from flogon-galaxy) and batch
import assert from 'node:assert/strict';
import { signal, zignal, batch, plain, STATIC, DIRECT } from '../src/state.js';

// signal: every write, deep too, at once
{
  const seen = [];
  const s = signal((t, p, v) => seen.push([p, v]))({ a: 1, inner: { b: 2 } });
  s.a = 3;
  s.inner = { b: 4 };
  s.inner.b = 5;
  assert.deepEqual(seen, [['a', 3], ['inner', { b: 5 }], ['b', 5]]);
}
// zignal: one root, the path of every write, arrays, delete; the source object is copied, not written
{
  const seen = [];
  const src = { view: { smooth: true }, list: [1, 2] };
  const s = zignal((root, t, p, v, path) => seen.push(p === undefined ? 'ready' : [path.join('.'), v]))(src);
  seen.length = 0;
  s.view.smooth = false;
  s.list.push(3);
  delete s.view.smooth;
  assert.deepEqual(seen.slice(0, 2), [['view.smooth', false], ['list.2', 3]]);
  assert.deepEqual(seen.at(-1), ['view.smooth', undefined]);
  assert.equal(src.view.smooth, true, 'the source object stays as it was');
  assert.deepEqual(plain(s), { view: {}, list: [1, 2, 3] });
}
// STATIC and DIRECT objects are stored as they are (not watched); a watched object's own [DIRECT] hook runs at once
{
  const big = { [STATIC]: true, positions: [[0, 0, 0]] };
  const raw = { [DIRECT]: true, n: 1 };
  let direct = null;
  const s = zignal(() => {})({ mesh: big, raw, knob: { level: 1 } });
  assert.equal(s.mesh, big, 'a STATIC object is the same object');
  assert.equal(s.raw, raw, 'a DIRECT object is the same object');
  s.knob[DIRECT] = (p, old, v) => (direct = [p, old, v]);
  s.knob.level = 2;
  assert.deepEqual(direct, ['level', 1, 2]);
}
// batch: the writes of one task, one call, after it; the first call is the root alone
{
  const calls = [];
  const s = zignal(batch((root, changes) => calls.push(changes.map((c) => `${c.path.join('.')}=${c.value}`))))({ view: { a: 1, b: 2 } });
  assert.equal(calls.length, 0, 'nothing during the task');
  await Promise.resolve();
  assert.deepEqual(calls, [['view.a=1', 'view.b=2', 'view=[object Object]']], 'building it is one call (the inside first)');
  s.view.a = 10;
  s.view.b = 20;
  s.view.a = 11;
  assert.equal(calls.length, 1);
  await Promise.resolve();
  assert.deepEqual(calls[1], ['view.a=10', 'view.b=20', 'view.a=11'], 'three writes, one call');
  assert.equal(s.view.a, 11);
}
console.log('state: signal, zignal (paths, arrays, delete, STATIC, DIRECT) and batch: OK');

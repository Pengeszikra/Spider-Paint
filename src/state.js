// State as plain objects that tell when they change: signal and zignal, from flogon-galaxy (src/utils/old-bird-soft.js,
// github.com/Pengeszikra/flogon-galaxy), with batch added. No DOM here: the viewer, the MCP and a terminal can share it.
//
//   const ui = zignal(batch(render))({ view: { smooth: true } });
//   ui.view.smooth = false;   // render(root, [{ path: ['view', 'smooth'], value: false, … }]) once, after this task
//
// Every object put into a zignal becomes a proxy too, so a change deep inside is seen. An object marked [STATIC] or
// [DIRECT] is stored as it is (a mesh, a big array: not watched, not copied). A watched object can also get a hook of its
// own: after `obj[DIRECT] = (prop, old, value) => …` every write to it calls that first, at once, for a change that cannot
// wait for the batch. (As in flogon-galaxy.)

export const STATIC = Symbol('static');
export const DIRECT = Symbol('direct');

/**
 * A proxy whose every write (deep too) calls `watcher(target, prop, value)` at once.
 * @type {<T extends object>(watcher?: (target: object, prop: string | symbol, value: unknown) => void) => (state?: T) => T}
 */
export const signal = (watcher = () => {}) => (state = /** @type {any} */ ({})) =>
  new Proxy(state, {
    get: (target, prop) => target[prop],
    set: (target, prop, value) => {
      target[prop] = value !== null && typeof value === 'object' ? signal(watcher)(value) : value;
      watcher(target, prop, value);
      return true;
    },
  });

/** @typedef {(root: any, target?: any, prop?: string | symbol, value?: any, path?: (string | symbol)[]) => void} Watcher */

/**
 * A tree of proxies under one root: every write calls `watcher(root, target, prop, value, path)`, `path` being the keys
 * from the root to the written one. Built from `state`, which is copied in (writes go to the proxies, not to it); the
 * watcher is called once with the root alone when it is ready.
 * @type {<T extends object>(watcher?: Watcher) => (state: T) => T}
 */
export const zignal = (watcher = () => {}) => (state) => {
  let root;
  /** @type {(state: any, path: (string | symbol)[]) => any} */
  const inner = (state, path) => {
    const proxy = new Proxy(Array.isArray(state) ? [] : {}, {
      get: (target, prop) => target[prop],
      set: (target, prop, value) => {
        if (target?.[DIRECT]) target[DIRECT](prop, target[prop], value);
        target[prop] = value !== null && typeof value === 'object' && !value[STATIC] && !value[DIRECT] ? inner(value, [...path, prop]) : value;
        watcher(root, target, prop, value, [...path, prop]);
        return true;
      },
      deleteProperty: (target, prop) => {
        delete target[prop];
        watcher(root, target, prop, undefined, [...path, prop]);
        return true;
      },
    });
    for (const [key, val] of Object.entries(state)) proxy[key] = val;
    return proxy;
  };
  root = inner(state, []);
  watcher(root);
  return root;
};

/**
 * A watcher that gathers the writes of one task and calls `fn(root, changes)` once, after it (a microtask by default; a
 * viewer may pass requestAnimationFrame). The first call (the root ready) is the same: `fn(root, [])`, after the code
 * that made the state has run. changes: [{ path, value }], in order.
 * @type {(fn: (root: any, changes: { path: (string | symbol)[], value: any }[]) => void, schedule?: (run: () => void) => unknown) => Watcher}
 */
export const batch = (fn, schedule = queueMicrotask) => {
  let queued = false, changes = [], last;
  return (root, target, prop, value, path) => {
    if (root) last = root;
    if (prop !== undefined) changes.push({ path, value });
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      const now = changes;
      changes = [];
      if (last) fn(last, now);
    });
  };
};

/** A plain copy of a (zignal) state: for a scene file, a log, a test. */
export const plain = (state) => JSON.parse(JSON.stringify(state));

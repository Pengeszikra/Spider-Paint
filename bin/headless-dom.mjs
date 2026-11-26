// A small stand-in for the browser, enough for index.html's module to run without one (Deno or node): the page's elements
// parsed from its own HTML, events that bubble, simple selectors, styles and classes as plain data, timers for frames.
// Nothing is laid out or drawn: the terminal draws its own panels, and the 3D picture comes from WebGPU (the runner gives the
// canvas a context whose frames it reads back). An experiment (bin/term-deno.mjs): what the page asks for and is not here
// stays undefined, so the page's own fallbacks run (no Worker: picking on the main thread; no WebGL2; no layout).

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', times: '×', hellip: '…', mdash: '—', ndash: '–', larr: '←', rarr: '→', uarr: '↑', darr: '↓' };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- events
export class Event {
  constructor(type, init = {}) {
    Object.assign(this, init);
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.timeStamp = performance.now();
    this._stop = false;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() {
    this._stop = true;
  }
  stopImmediatePropagation() {
    this._stop = this._stopNow = true;
  }
  composedPath() {
    const p = [];
    for (let n = this.target; n; n = n.parentNode) p.push(n);
    return p;
  }
}
const ev = (defaults) =>
  class extends Event {
    constructor(type, init = {}) {
      super(type, { ...defaults, ...init });
    }
    getModifierState(k) {
      return { Shift: this.shiftKey, Control: this.ctrlKey, Alt: this.altKey, Meta: this.metaKey }[k] ?? false;
    }
  };
export const KeyboardEvent = ev({ key: '', code: '', repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false });
export const MouseEvent = ev({ clientX: 0, clientY: 0, button: 0, buttons: 0, detail: 1, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, movementX: 0, movementY: 0 });
export const PointerEvent = ev({ clientX: 0, clientY: 0, button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, movementX: 0, movementY: 0, pressure: 0 });
export const WheelEvent = ev({ clientX: 0, clientY: 0, deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
export const CustomEvent = ev({ detail: null });
export const ErrorEvent = ev({ message: '', error: null });
export const FocusEvent = ev({ relatedTarget: null });
export const InputEvent = ev({ data: null, inputType: '' });

class Target {
  constructor() {
    this._on = new Map();
  }
  addEventListener(type, fn, opts) {
    if (!fn) return;
    const list = this._on.get(type) ?? [];
    if (!list.some((l) => l.fn === fn)) list.push({ fn, once: typeof opts === 'object' && opts?.once, capture: opts === true || Boolean(opts?.capture) });
    this._on.set(type, list);
  }
  removeEventListener(type, fn) {
    const list = this._on.get(type);
    if (list) this._on.set(type, list.filter((l) => l.fn !== fn));
  }
  _fire(e) {
    e.currentTarget = this;
    for (const l of [...(this._on.get(e.type) ?? [])]) {
      if (l.once) this.removeEventListener(e.type, l.fn);
      try {
        typeof l.fn === 'function' ? l.fn.call(this, e) : l.fn.handleEvent(e);
      } catch (err) {
        reportError(err);
      }
      if (e._stopNow) break;
    }
    const h = this[`on${e.type}`];
    if (typeof h === 'function')
      try {
        h.call(this, e);
      } catch (err) {
        reportError(err);
      }
  }
  dispatchEvent(e) {
    e.target ??= this;
    // capture listeners on the way down, then the target, then the bubble up (window last)
    const path = [];
    for (let n = this.parentNode; n; n = n.parentNode) path.push(n);
    if (this !== globalThis && this instanceof Node) path.push(globalThis);
    for (const n of [...path].reverse()) {
      const caps = (n._on?.get(e.type) ?? []).filter((l) => l.capture);
      for (const l of caps) {
        e.currentTarget = n;
        try {
          typeof l.fn === 'function' ? l.fn.call(n, e) : l.fn.handleEvent(e);
        } catch (err) {
          reportError(err);
        }
        if (e._stop) return !e.defaultPrevented;
      }
    }
    this._fire(e);
    if (e.bubbles) for (const n of path) {
      if (e._stop) break;
      if (n === globalThis) {
        winFire(e);
        continue;
      }
      n._fire(e);
    }
    return !e.defaultPrevented;
  }
}
const reportError = (err) => {
  globalThis.__domErrors?.push(err);
  if (globalThis.__domLog) console.error('[page]', err?.stack ?? err);
};

// ---- nodes
export class Node extends Target {
  constructor() {
    super();
    this.parentNode = null;
    this.childNodes = [];
  }
  get parentElement() {
    return this.parentNode instanceof Element ? this.parentNode : null;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes.at(-1) ?? null;
  }
  get nextSibling() {
    const p = this.parentNode?.childNodes;
    return p ? p[p.indexOf(this) + 1] ?? null : null;
  }
  get previousSibling() {
    const p = this.parentNode?.childNodes;
    return p ? p[p.indexOf(this) - 1] ?? null : null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === globalThis.document;
  }
  get ownerDocument() {
    return globalThis.document;
  }
  contains(n) {
    for (; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  _adopt(n) {
    if (typeof n === 'string') n = new Text(n);
    if (n instanceof Fragment) return [...n.childNodes].flatMap((c) => this._adopt(c));
    n.parentNode?.removeChild(n);
    n.parentNode = this;
    return [n];
  }
  appendChild(n) {
    this.childNodes.push(...this._adopt(n));
    return n;
  }
  append(...ns) {
    for (const n of ns) this.appendChild(n);
  }
  prepend(...ns) {
    this.childNodes.unshift(...ns.flatMap((n) => this._adopt(n)));
  }
  insertBefore(n, ref) {
    const kids = this._adopt(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, ...kids);
    return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  replaceChild(n, old) {
    this.insertBefore(n, old);
    this.removeChild(old);
    return old;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  before(...ns) {
    for (const n of ns) this.parentNode?.insertBefore(n, this);
  }
  after(...ns) {
    const next = this.nextSibling;
    for (const n of ns) this.parentNode?.insertBefore(n, next);
  }
  replaceWith(...ns) {
    this.before(...ns);
    this.remove();
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (v !== '' && v != null) this.appendChild(new Text(String(v)));
  }
  cloneNode(deep) {
    return deep ? parse(this.outerHTML ?? esc(this.textContent))[0] : new this.constructor(this.tagName?.toLowerCase());
  }
}
export class Text extends Node {
  constructor(t = '') {
    super();
    this.data = t;
    this.nodeType = 3;
  }
  get textContent() {
    return this.data;
  }
  set textContent(v) {
    this.data = String(v);
  }
  get nodeValue() {
    return this.data;
  }
  get outerHTML() {
    return esc(this.data);
  }
}
class Comment extends Node {
  constructor(t = '') {
    super();
    this.data = t;
    this.nodeType = 8;
  }
  get textContent() {
    return '';
  }
  get outerHTML() {
    return `<!--${this.data}-->`;
  }
}
class Fragment extends Node {
  get outerHTML() {
    return this.childNodes.map((c) => c.outerHTML).join('');
  }
  querySelector(s) {
    return Element.prototype.querySelector.call(this, s);
  }
  querySelectorAll(s) {
    return Element.prototype.querySelectorAll.call(this, s);
  }
  get children() {
    return this.childNodes.filter((c) => c instanceof Element);
  }
}

class ClassList {
  constructor(el) {
    this.el = el;
  }
  get _set() {
    return new Set((this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
  }
  _put(s) {
    this.el.setAttribute('class', [...s].join(' '));
  }
  contains(c) {
    return this._set.has(c);
  }
  add(...cs) {
    const s = this._set;
    cs.forEach((c) => s.add(c));
    this._put(s);
  }
  remove(...cs) {
    const s = this._set;
    cs.forEach((c) => s.delete(c));
    this._put(s);
  }
  toggle(c, force) {
    const s = this._set;
    const on = force === undefined ? !s.has(c) : Boolean(force);
    on ? s.add(c) : s.delete(c);
    this._put(s);
    return on;
  }
  replace(a, b) {
    const s = this._set;
    if (!s.has(a)) return false;
    s.delete(a);
    s.add(b);
    this._put(s);
    return true;
  }
  get length() {
    return this._set.size;
  }
  item(i) {
    return [...this._set][i] ?? null;
  }
  [Symbol.iterator]() {
    return this._set[Symbol.iterator]();
  }
  toString() {
    return this.el.getAttribute('class') ?? '';
  }
}

const styleOf = () => {
  const s = {
    setProperty(k, v) {
      s[k] = v;
    },
    removeProperty(k) {
      delete s[k];
    },
    getPropertyValue(k) {
      return s[k] ?? '';
    },
  };
  Object.defineProperty(s, 'cssText', { get: () => '', set: () => {}, enumerable: false });
  return s;
};

// the attributes that are also properties (the page reads and writes both ways)
const REFLECT = ['id', 'title', 'type', 'name', 'placeholder', 'href', 'src', 'alt', 'role', 'min', 'max', 'step', 'lang', 'download', 'target', 'rel', 'for', 'width', 'height', 'maxLength', 'tabIndex'];
const BOOL = ['hidden', 'disabled', 'checked', 'selected', 'readOnly', 'multiple', 'open', 'autofocus', 'required'];

export class Element extends Node {
  constructor(tag = 'div', ns = null) {
    super();
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    this.namespaceURI = ns;
    this.nodeType = 1;
    this.attributes = new Map();
    this.style = styleOf();
    this.classList = new ClassList(this);
    this._value = undefined;
    this.scrollTop = this.scrollLeft = 0;
  }
  get nodeName() {
    return this.tagName;
  }
  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }
  removeAttribute(k) {
    this.attributes.delete(k);
  }
  hasAttribute(k) {
    return this.attributes.has(k);
  }
  toggleAttribute(k, force) {
    const on = force === undefined ? !this.hasAttribute(k) : Boolean(force);
    on ? this.setAttribute(k, '') : this.removeAttribute(k);
    return on;
  }
  getAttributeNames() {
    return [...this.attributes.keys()];
  }
  get className() {
    return this.getAttribute('class') ?? '';
  }
  set className(v) {
    this.setAttribute('class', v);
  }
  get dataset() {
    const el = this;
    const key = (k) => `data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    return new Proxy({}, {
      get: (_, k) => (typeof k === 'string' ? el.getAttribute(key(k)) ?? undefined : undefined),
      set: (_, k, v) => (el.setAttribute(key(k), v), true),
      deleteProperty: (_, k) => (el.removeAttribute(key(k)), true),
      has: (_, k) => el.hasAttribute(key(k)),
      ownKeys: () => [...el.attributes.keys()].filter((a) => a.startsWith('data-')).map((a) => a.slice(5).replace(/-(\w)/g, (m, c) => c.toUpperCase())),
      getOwnPropertyDescriptor: (_, k) => (el.hasAttribute(key(k)) ? { enumerable: true, configurable: true, value: el.getAttribute(key(k)) } : undefined),
    });
  }
  get children() {
    return this.childNodes.filter((c) => c instanceof Element);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }
  get nextElementSibling() {
    const p = this.parentNode?.children ?? [];
    return p[p.indexOf(this) + 1] ?? null;
  }
  get previousElementSibling() {
    const p = this.parentNode?.children ?? [];
    return p[p.indexOf(this) - 1] ?? null;
  }
  get childElementCount() {
    return this.children.length;
  }
  // value: an input's text, a select's chosen option, a range's number (as a string)
  get value() {
    if (this.localName === 'select') {
      const opts = this.querySelectorAll('option');
      const sel = opts.find((o) => o._sel) ?? opts.find((o) => o.hasAttribute('selected')) ?? opts[0];
      return sel ? sel.value : '';
    }
    if (this.localName === 'option') return this.getAttribute('value') ?? this.textContent;
    if (this.localName === 'textarea') return this._value ?? this.textContent;
    if (this._value !== undefined) return this._value;
    const v = this.getAttribute('value');
    if (v !== null) return v;
    if (this.getAttribute('type') === 'range') return String(((Number(this.getAttribute('min') ?? 0) + Number(this.getAttribute('max') ?? 100)) / 2));
    return this.localName === 'input' && this.getAttribute('type') === 'checkbox' ? 'on' : '';
  }
  set value(v) {
    if (this.localName === 'select') {
      for (const o of this.querySelectorAll('option')) o._sel = o.value === String(v);
      return;
    }
    this._value = v == null ? '' : String(v);
  }
  get valueAsNumber() {
    return Number(this.value);
  }
  get selectedIndex() {
    const opts = this.querySelectorAll('option');
    return opts.findIndex((o) => o.value === this.value);
  }
  set selectedIndex(i) {
    this.querySelectorAll('option').forEach((o, k) => (o._sel = k === i));
  }
  get options() {
    return this.querySelectorAll('option');
  }
  get selectionStart() {
    return this.value.length;
  }
  get selectionEnd() {
    return this.value.length;
  }
  setSelectionRange() {}
  select() {}
  get innerText() {
    return this.textContent;
  }
  set innerText(v) {
    this.textContent = v;
  }
  get innerHTML() {
    return this.childNodes.map((c) => c.outerHTML).join('');
  }
  set innerHTML(html) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    for (const n of parse(String(html), RAW.has(this.localName))) this.appendChild(n);
  }
  insertAdjacentHTML(where, html) {
    const ns = parse(String(html));
    if (where === 'beforeend') ns.forEach((n) => this.appendChild(n));
    else if (where === 'afterbegin') this.prepend(...ns);
    else if (where === 'beforebegin') this.before(...ns);
    else this.after(...ns);
  }
  insertAdjacentElement(where, el) {
    this.insertAdjacentHTML(where, '');
    if (where === 'beforeend') this.appendChild(el);
    else if (where === 'afterbegin') this.prepend(el);
    else if (where === 'beforebegin') this.before(el);
    else this.after(el);
    return el;
  }
  get outerHTML() {
    const attrs = [...this.attributes].map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)).join('');
    if (VOID.has(this.localName)) return `<${this.localName}${attrs}>`;
    return `<${this.localName}${attrs}>${RAW.has(this.localName) ? this.textContent : this.innerHTML}</${this.localName}>`;
  }
  replaceChildren(...ns) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.append(...ns);
  }
  matches(sel) {
    return selectorList(sel).some((s) => matchComplex(this, s));
  }
  closest(sel) {
    for (let n = this; n instanceof Element; n = n.parentNode) if (n.matches(sel)) return n;
    return null;
  }
  querySelectorAll(sel) {
    const list = selectorList(sel);
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes)
        if (c instanceof Element) {
          if (list.some((s) => matchComplex(c, s))) out.push(c);
          walk(c);
        }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  getElementsByTagName(t) {
    return this.querySelectorAll(t);
  }
  getElementsByClassName(c) {
    return this.querySelectorAll(`.${c}`);
  }
  focus() {
    const prev = globalThis.document.activeElement;
    if (prev === this) return;
    globalThis.document.activeElement = this;
    prev?.dispatchEvent?.(new FocusEvent('blur'));
    prev?.dispatchEvent?.(new FocusEvent('focusout', { bubbles: true }));
    this.dispatchEvent(new FocusEvent('focus'));
    this.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }
  blur() {
    if (globalThis.document.activeElement !== this) return;
    globalThis.document.activeElement = globalThis.document.body;
    this.dispatchEvent(new FocusEvent('blur'));
  }
  click() {
    if (this.disabled) return;
    if (this.localName === 'input' && (this.type === 'checkbox' || this.type === 'radio')) this.checked = !this.checked;
    this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  getBoundingClientRect() {
    const r = globalThis.__layout?.(this) ?? { x: 0, y: 0, width: 0, height: 0 };
    return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height };
  }
  getClientRects() {
    return [this.getBoundingClientRect()];
  }
  get clientWidth() {
    return this.getBoundingClientRect().width;
  }
  get clientHeight() {
    return this.getBoundingClientRect().height;
  }
  get offsetWidth() {
    return this.clientWidth;
  }
  get offsetHeight() {
    return this.clientHeight;
  }
  get scrollHeight() {
    return this.clientHeight;
  }
  get scrollWidth() {
    return this.clientWidth;
  }
  get offsetParent() {
    return this.parentElement;
  }
  scrollIntoView() {}
  scrollTo() {}
  scrollBy() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false;
  }
  requestPointerLock() {}
  requestFullscreen() {
    return Promise.reject(new Error('no fullscreen here'));
  }
  animate() {
    return { finished: Promise.resolve(), cancel() {}, onfinish: null };
  }
  attachShadow() {
    return new Fragment();
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  // a canvas: 2d is a recorder that draws nothing; webgpu comes from the runner; no webgl
  getContext(kind) {
    if (this.localName !== 'canvas') return null;
    if (kind === 'webgpu') return globalThis.__webgpuContext?.(this) ?? null;
    if (kind === '2d') return (this._2d ??= ctx2d(this));
    return null;
  }
  toDataURL() {
    return 'data:image/png;base64,';
  }
  toBlob(cb) {
    cb?.(new Blob([]));
  }
  // an SVG element's few geometry calls
  getBBox() {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  getTotalLength() {
    return 0;
  }
  createSVGPoint() {
    return { x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) };
  }
  getScreenCTM() {
    return null;
  }
}
for (const k of REFLECT) {
  const attr = k === 'maxLength' ? 'maxlength' : k === 'tabIndex' ? 'tabindex' : k === 'for' ? 'for' : k;
  Object.defineProperty(Element.prototype, k, {
    get() {
      const v = this.getAttribute(attr);
      if (k === 'width' || k === 'height') return v === null ? (this.localName === 'canvas' ? (k === 'width' ? 300 : 150) : 0) : Number(v);
      if (k === 'type' && v === null) return this.localName === 'input' ? 'text' : this.localName === 'button' ? 'submit' : '';
      return v ?? '';
    },
    set(v) {
      this.setAttribute(attr, v);
    },
  });
}
Object.defineProperty(Element.prototype, 'htmlFor', { get() { return this.getAttribute('for') ?? ''; }, set(v) { this.setAttribute('for', v); } });
for (const k of BOOL) {
  const attr = k.toLowerCase();
  Object.defineProperty(Element.prototype, k, {
    get() {
      if (k === 'checked' && this._checked !== undefined) return this._checked;
      if (k === 'selected' && this._sel !== undefined) return this._sel;
      return this.hasAttribute(attr);
    },
    set(v) {
      if (k === 'checked') return void (this._checked = Boolean(v));
      if (k === 'selected') return void (this._sel = Boolean(v));
      v ? this.setAttribute(attr, '') : this.removeAttribute(attr);
    },
  });
}

const ctx2d = (canvas) =>
  new Proxy(
    { canvas, measureText: (t) => ({ width: String(t).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), isPointInPath: () => false },
    { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^[a-z]/.test(k) && !/^(fill|stroke|font|line|global|shadow|text|image|direction|letter|filter)/.test(k) ? () => {} : t[k]), set: (t, k, v) => ((t[k] = v), true) },
  );

// ---- selectors: compound parts (tag, #id, .class, [attr], [attr=v], :not(...) ignored) joined by ' ' or '>'
const selCache = new Map();
const splitTop = (s, ch) => {
  const out = [];
  let depth = 0, q = null, cur = '';
  for (const c of s) {
    if (q) (cur += c), c === q && (q = null);
    else if (c === '"' || c === "'") (q = c), (cur += c);
    else if (c === '(' || c === '[') (depth++, (cur += c));
    else if (c === ')' || c === ']') (depth--, (cur += c));
    else if (c === ch && depth === 0) (out.push(cur), (cur = ''));
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
const selectorList = (sel) => {
  if (selCache.has(sel)) return selCache.get(sel);
  const list = splitTop(sel, ',').map((one) => {
    const parts = [];
    const re = /\s*(>)?\s*((?:[^\s>"'[\]()]+|\[[^\]]*\]|\([^)]*\))+)/g;
    let m;
    while ((m = re.exec(one))) parts.push({ child: Boolean(m[1]), simple: compound(m[2]) });
    return parts;
  });
  selCache.set(sel, list);
  return list;
};
const compound = (s) => {
  const out = { tag: null, id: null, cls: [], attrs: [], not: [] };
  const re = /(^[a-zA-Z*][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)\s*["']?([^"'\]]*)["']?)?\]|:not\(([^)]*)\)|:([\w-]+)(?:\([^)]*\))?/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) out.tag = m[1] === '*' ? null : m[1].toLowerCase();
    else if (m[2]) out.id = m[2];
    else if (m[3]) out.cls.push(m[3]);
    else if (m[4]) out.attrs.push({ k: m[4], op: m[5], v: m[6] });
    else if (m[7]) out.not.push(m[7]);
  }
  return out;
};
const matchSimple = (el, s) => {
  if (s.tag && el.localName !== s.tag) return false;
  if (s.id && el.getAttribute('id') !== s.id) return false;
  for (const c of s.cls) if (!el.classList.contains(c)) return false;
  for (const a of s.attrs) {
    const v = el.getAttribute(a.k);
    if (v === null) return false;
    if (a.op === '=' && v !== a.v) return false;
    if (a.op === '^=' && !v.startsWith(a.v)) return false;
    if (a.op === '$=' && !v.endsWith(a.v)) return false;
    if (a.op === '*=' && !v.includes(a.v)) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.v)) return false;
  }
  for (const n of s.not) if (el.matches(n)) return false;
  return true;
};
const matchComplex = (el, parts) => {
  let i = parts.length - 1;
  if (!matchSimple(el, parts[i].simple)) return false;
  let n = el;
  while (i > 0) {
    const child = parts[i].child;
    i--;
    if (child) {
      n = n.parentNode;
      if (!(n instanceof Element) || !matchSimple(n, parts[i].simple)) return false;
    } else {
      do n = n.parentNode;
      while (n instanceof Element && !matchSimple(n, parts[i].simple));
      if (!(n instanceof Element)) return false;
    }
  }
  return true;
};

// ---- HTML: tags, attributes, text, comments; void and raw-text elements; tolerant of what is not closed
const SVG_NS = 'http://www.w3.org/2000/svg';
export const parse = (html, rawOnly = false) => {
  if (rawOnly) return [new Text(html)];
  const root = new Fragment();
  const stack = [root];
  let i = 0;
  const top = () => stack.at(-1);
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0 || lt > i) {
      const t = html.slice(i, lt < 0 ? html.length : lt);
      if (t) top().appendChild(new Text(decode(t)));
      if (lt < 0) break;
      i = lt;
    }
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4);
      top().appendChild(new Comment(html.slice(i + 4, e < 0 ? html.length : e)));
      i = e < 0 ? html.length : e + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const e = html.indexOf('>', i);
      i = e < 0 ? html.length : e + 1;
      continue;
    }
    if (html[i + 1] === '/') {
      const e = html.indexOf('>', i);
      const name = html.slice(i + 2, e).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--)
        if (stack[k].localName === name) {
          stack.length = k;
          break;
        }
      i = e < 0 ? html.length : e + 1;
      continue;
    }
    const m = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(i, i + 64));
    if (!m) {
      top().appendChild(new Text('<'));
      i++;
      continue;
    }
    const tag = m[1];
    let j = i + m[0].length;
    const attrs = [];
    // attributes up to > (quoted values may hold >)
    while (j < html.length) {
      while (/\s/.test(html[j])) j++;
      if (html[j] === '>' || (html[j] === '/' && html[j + 1] === '>')) break;
      const a = /^([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/.exec(html.slice(j, j + 4000));
      if (!a) {
        j++;
        continue;
      }
      attrs.push([a[1], decode(a[2] ?? a[3] ?? a[4] ?? '')]);
      j += a[0].length;
    }
    const selfClose = html[j] === '/';
    j = html.indexOf('>', j) + 1 || html.length;
    const lower = tag.toLowerCase();
    const inSvg = lower === 'svg' || stack.some((n) => n.namespaceURI === SVG_NS);
    const el = new Element(inSvg ? tag : lower, inSvg ? SVG_NS : null);
    for (const [k, v] of attrs) el.setAttribute(k, v);
    top().appendChild(el);
    i = j;
    if (RAW.has(lower)) {
      const e = html.toLowerCase().indexOf(`</${lower}`, i);
      el.appendChild(new Text(html.slice(i, e < 0 ? html.length : e)));
      i = e < 0 ? html.length : html.indexOf('>', e) + 1;
      continue;
    }
    if (!selfClose && !VOID.has(lower)) stack.push(el);
  }
  return [...root.childNodes];
};

// ---- the document and the window
export class Document extends Node {
  constructor(html) {
    super();
    this.nodeType = 9;
    this.documentElement = new Element('html');
    this.head = new Element('head');
    this.body = new Element('body');
    this.documentElement.append(this.head, this.body);
    this.appendChild(this.documentElement);
    const bodyAt = html.search(/<body[\s>]/i);
    const headPart = bodyAt < 0 ? '' : html.slice(0, bodyAt);
    const bodyPart = bodyAt < 0 ? html : html.slice(html.indexOf('>', bodyAt) + 1).replace(/<\/body>[\s\S]*$/i, '');
    const bodyTag = /<body([^>]*)>/i.exec(html);
    if (bodyTag) for (const [, k, v] of bodyTag[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) this.body.setAttribute(k, v ?? '');
    for (const n of parse(headPart.replace(/^[\s\S]*<head[^>]*>/i, ''))) if (n instanceof Element) this.head.appendChild(n);
    for (const n of parse(bodyPart)) this.body.appendChild(n);
    this.activeElement = this.body;
    this.readyState = 'complete';
    this.visibilityState = 'visible';
    this.hidden = false;
    this.fullscreenElement = null;
    this.pointerLockElement = null;
    this.fonts = { ready: Promise.resolve(), load: () => Promise.resolve([]), check: () => true };
    this.cookie = '';
    this.title = '';
    this.referrer = '';
  }
  createElement(tag) {
    return new Element(tag);
  }
  createElementNS(ns, tag) {
    return new Element(tag, ns);
  }
  createTextNode(t) {
    return new Text(t);
  }
  createComment(t) {
    return new Comment(t);
  }
  createDocumentFragment() {
    return new Fragment();
  }
  getElementById(id) {
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c instanceof Element) {
          if (c.getAttribute('id') === id) return c;
          const f = walk(c);
          if (f) return f;
        }
      }
      return null;
    };
    return walk(this);
  }
  querySelector(s) {
    return Element.prototype.querySelector.call(this, s);
  }
  querySelectorAll(s) {
    return Element.prototype.querySelectorAll.call(this, s);
  }
  getElementsByTagName(t) {
    return this.querySelectorAll(t);
  }
  get children() {
    return [this.documentElement];
  }
  exitFullscreen() {
    return Promise.resolve();
  }
  exitPointerLock() {}
  hasFocus() {
    return true;
  }
  execCommand() {
    return false;
  }
  elementFromPoint() {
    return globalThis.__elementAt?.() ?? null;
  }
}

const winListeners = new Map();
const winFire = (e) => {
  for (const l of [...(winListeners.get(e.type) ?? [])]) {
    if (l.once) winListeners.get(e.type).splice(winListeners.get(e.type).indexOf(l), 1);
    try {
      typeof l.fn === 'function' ? l.fn.call(globalThis, e) : l.fn.handleEvent(e);
    } catch (err) {
      reportError(err);
    }
    if (e._stopNow) break;
  }
};

const memStorage = () => {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => void m.set(String(k), String(v)),
    removeItem: (k) => void m.delete(String(k)),
    clear: () => m.clear(),
  };
};

/**
 * Turns globalThis into the page's window: the document from `html`, the address `url` (fetch of the same origin reads
 * files through `readFile(path) -> Promise<Uint8Array>`), a size in CSS pixels.
 */
export const installDom = ({ html, url, readFile, width = 1280, height = 720, layout } = {}) => {
  const g = globalThis;
  // a global of the page (Deno has some of them already, location among them: those are replaced, or given a value)
  const set = (k, v) => {
    try {
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
      return;
    } catch {}
    try {
      delete g[k];
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
      return;
    } catch {}
    try {
      g[k] = v;
    } catch {}
  };
  const U = new URL(url);
  const doc = new Document(html);
  // the element classes the page tests with instanceof: by tag name (one Element class underneath)
  const byTag = (...tags) => ({ [Symbol.hasInstance]: (x) => x instanceof Element && tags.includes(x.localName) });
  const tagClasses = { HTMLInputElement: byTag('input'), HTMLTextAreaElement: byTag('textarea'), HTMLSelectElement: byTag('select'), HTMLButtonElement: byTag('button'), HTMLCanvasElement: byTag('canvas'), HTMLAnchorElement: byTag('a'), HTMLImageElement: byTag('img'), HTMLIFrameElement: byTag('iframe'), HTMLVideoElement: byTag('video'), HTMLFormElement: byTag('form'), HTMLLabelElement: byTag('label'), HTMLDivElement: byTag('div'), HTMLSpanElement: byTag('span'), HTMLOptionElement: byTag('option'), SVGElement: { [Symbol.hasInstance]: (x) => x instanceof Element && x.namespaceURI === SVG_NS }, SVGSVGElement: byTag('svg') };
  Object.assign(g, { Event, KeyboardEvent, MouseEvent, PointerEvent, WheelEvent, CustomEvent, ErrorEvent, FocusEvent, InputEvent, Node, Element, HTMLElement: Element, Text, Document, ...tagClasses });
  set('document', doc);
  set('window', g);
  set('self', g);
  set('parent', g);
  set('top', g);
  set('frameElement', null);
  set('innerWidth', width);
  set('innerHeight', height);
  set('outerWidth', width);
  set('outerHeight', height);
  set('devicePixelRatio', 1);
  set('screen', { width, height, availWidth: width, availHeight: height, orientation: { type: 'landscape-primary', angle: 0, addEventListener() {} } });
  set('visualViewport', { width, height, scale: 1, offsetTop: 0, offsetLeft: 0, addEventListener() {}, removeEventListener() {} });
  set('location', { href: U.href, origin: U.origin, protocol: U.protocol, host: U.host, hostname: U.hostname, port: U.port, pathname: U.pathname, search: U.search, hash: U.hash, reload() {}, assign() {}, replace() {}, toString: () => U.href });
  set('history', { length: 1, state: null, pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} });
  try {
    if (!g.localStorage || typeof g.localStorage.getItem !== 'function') set('localStorage', memStorage());
  } catch {
    set('localStorage', memStorage());
  }
  set('sessionStorage', memStorage());
  set('matchMedia', (q) => ({ matches: /prefers-reduced-motion: no-preference|pointer: fine|hover: hover/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  let rafId = 0;
  const rafs = new Map();
  set('requestAnimationFrame', (fn) => {
    const id = ++rafId;
    rafs.set(id, setTimeout(() => (rafs.delete(id), fn(performance.now())), 16));
    return id;
  });
  set('cancelAnimationFrame', (id) => (clearTimeout(rafs.get(id)), rafs.delete(id)));
  set('requestIdleCallback', (fn) => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 1));
  set('cancelIdleCallback', (id) => clearTimeout(id));
  const Obs = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  set('ResizeObserver', Obs);
  set('IntersectionObserver', Obs);
  set('MutationObserver', Obs);
  // the page's custom properties (--panel, --cursor …) from its :root rules outside @media, later ones winning; every element
  // inherits them (the page reads its colours this way: the GPU's ground, the cursor's colour)
  const rootVars = {};
  {
    const css = doc.querySelectorAll('style').map((st) => st.textContent).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0, sel = '', start = 0, inMedia = 0;
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (c === '{') {
        const head = css.slice(start, i).trim();
        if (head.startsWith('@')) inMedia = depth + 1;
        else sel = head;
        depth++;
        start = i + 1;
      } else if (c === '}') {
        if (!inMedia && depth === 1 && /^(?::root)+$|^html$/.test(sel)) for (const [, k, v] of css.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) rootVars[k] = v.trim();
        depth--;
        if (inMedia && depth < inMedia) inMedia = 0;
        start = i + 1;
        sel = '';
      } else if (c === ';' && depth === 0) start = i + 1;
    }
  }
  const prop = (el, k) => (String(k).startsWith('--') ? el?.style?.[k] ?? rootVars[k] ?? '' : el?.style?.[k] ?? '');
  set('getComputedStyle', (el) => new Proxy({ getPropertyValue: (k) => prop(el, k) }, { get: (t, k) => (k in t ? t[k] : prop(el, k)) }));
  set('addEventListener', (type, fn, opts) => {
    if (!fn) return;
    const l = winListeners.get(type) ?? [];
    l.push({ fn, once: typeof opts === 'object' && opts?.once });
    winListeners.set(type, l);
  });
  set('removeEventListener', (type, fn) => winListeners.set(type, (winListeners.get(type) ?? []).filter((l) => l.fn !== fn)));
  set('dispatchEvent', (e) => (e.target ??= g, winFire(e), !e.defaultPrevented));
  set('postMessage', () => {});
  set('scrollTo', () => {});
  set('scrollBy', () => {});
  set('focus', () => {});
  set('blur', () => {});
  set('open', () => null);
  set('alert', () => {});
  set('confirm', () => false);
  set('prompt', () => null);
  set('print', () => {});
  set('getSelection', () => ({ removeAllRanges() {}, addRange() {}, toString: () => '' }));
  set('CSS', { escape: (s) => String(s).replace(/[^\w-]/g, (c) => `\\${c}`), supports: () => false });
  set('Image', class extends Element {
    constructor() {
      super('img');
      this.complete = false;
      this.naturalWidth = this.naturalHeight = 0;
    }
    decode() {
      return Promise.reject(new Error('no images here'));
    }
  });
  set('Audio', class {
    play() {
      return Promise.reject(new Error('no audio here'));
    }
    pause() {}
    addEventListener() {}
    load() {}
  });
  set('DOMParser', class {
    parseFromString(s) {
      const d = new Document(`<body>${s}</body>`);
      return d;
    }
  });
  set('XMLSerializer', class {
    serializeToString(n) {
      return n.outerHTML ?? '';
    }
  });
  set('isSecureContext', true);
  set('crossOriginIsolated', false);
  set('origin', U.origin);
  // the navigator the page asks: no touch, no XR, a clipboard that keeps nothing (WebGPU: Deno's own navigator.gpu stays)
  const nav = g.navigator ?? {};
  const extra = { userAgent: nav.userAgent ?? 'headless', platform: 'headless', language: 'en', languages: ['en'], maxTouchPoints: 0, hardwareConcurrency: nav.hardwareConcurrency ?? 4, onLine: true, standalone: false, clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') }, vibrate: () => false, getGamepads: () => [], storage: { persist: () => Promise.resolve(false), estimate: () => Promise.resolve({}) }, permissions: { query: () => Promise.resolve({ state: 'denied', addEventListener() {} }) } };
  for (const [k, v] of Object.entries(extra))
    try {
      if (!(k in nav) || k === 'maxTouchPoints') Object.defineProperty(nav, k, { value: v, configurable: true });
    } catch {}
  if (!g.navigator) set('navigator', nav);
  // fetch: the page's own files from disk (the same origin), the rest as usual
  const realFetch = g.fetch?.bind(g);
  const TYPES = { json: 'application/json', js: 'text/javascript', mjs: 'text/javascript', md: 'text/markdown', html: 'text/html', svg: 'image/svg+xml', png: 'image/png' };
  set('fetch', async (input, init) => {
    const href = new URL(typeof input === 'string' ? input : input.url ?? String(input), U).href;
    const u = new URL(href);
    if (u.origin === U.origin) {
      try {
        const data = await readFile(decodeURIComponent(u.pathname.replace(/^\/+/, '')) || 'index.html');
        return new Response(data, { status: 200, headers: { 'Content-Type': TYPES[u.pathname.split('.').pop()] ?? 'application/octet-stream' } });
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
    return realFetch ? realFetch(href, init) : new Response('no network', { status: 503 });
  });
  g.__layout = layout;
  if (g.location?.href !== U.href) throw new Error(`the page's address could not be set (location is ${g.location?.href}); in Deno run without --location`);
  return doc;
};

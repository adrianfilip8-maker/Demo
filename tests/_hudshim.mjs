/**
 * _hudshim.mjs — enough DOM to boot the real `src/ui/HUD.js` in plain Node.
 *
 * NOT a test file (no `.test.mjs`), so the `tests/*.test.mjs` glob does not pick it up.
 *
 * Why bother instead of asserting on the source text: the interesting HUD claims are
 * *behavioural over time* — does a badge survive 30 s of frames, does it follow a guard who
 * moves — and a regex over the source cannot answer either. `tools/_domshim.mjs` is far too
 * small (it exists for three's loaders and has no tree, no classList, no querySelector), so this
 * is a second, richer shim aimed at UI code specifically.
 *
 * It implements only what HUD.js actually touches. Every selector the HUD uses is a single class
 * (`.sly-threat`, `.sly-alert-fill`, …), so `querySelector` supports `.class` and nothing else —
 * deliberately, so an unsupported selector throws instead of silently returning null and letting
 * a test pass against an element that was never found.
 */

/* --------------------------------------------------------------- elements */

class ClassList {
  constructor(el) { this.el = el; }
  get _set() { return this.el._classes; }
  add(...n) { for (const c of n) if (c) this._set.add(c); }
  remove(...n) { for (const c of n) this._set.delete(c); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    const want = force === undefined ? !this._set.has(c) : !!force;
    if (want) this._set.add(c); else this._set.delete(c);
    return want;
  }
  get value() { return [...this._set].join(' '); }
}

class Style {
  constructor() { this._props = new Map(); }
  setProperty(k, v) { this._props.set(k, String(v)); }
  getPropertyValue(k) { return this._props.get(k) ?? ''; }
  removeProperty(k) { this._props.delete(k); }
}

export class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this._classes = new Set();
    this._text = '';
    this.classList = new ClassList(this);
    this.style = new Style();
    this.dataset = {};
    this._listeners = new Map();
  }

  /* ---- attributes ---- */
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'class') { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); this.classList = new ClassList(this); }
    else if (k === 'id') this.id = String(v);
    else if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = String(v);
  }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this.setAttribute('class', v); }

  /* ---- tree ---- */
  get children() { return this.childNodes.filter((n) => n instanceof El); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] ?? null; }
  appendChild(n) {
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  remove() { this.parentNode?.removeChild(this); }

  /* ---- content ---- */
  set innerHTML(html) {
    this.childNodes = [];
    this._text = '';
    for (const n of parseHTML(String(html))) this.appendChild(n);
  }
  get innerHTML() { return this.childNodes.map((n) => (n instanceof El ? n.outerHTML : n)).join(''); }
  get outerHTML() {
    const at = [...this.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
    return `<${this.tagName.toLowerCase()}${at}>${this._text}${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }
  set textContent(v) { this.childNodes = []; this._text = String(v); }
  get textContent() {
    return this._text + this.childNodes.map((n) => (n instanceof El ? n.textContent : String(n))).join('');
  }

  /* ---- query ---- */
  querySelector(sel) {
    const m = /^\.([\w-]+)$/.exec(String(sel).trim());
    if (!m) throw new Error(`_hudshim querySelector supports only ".class", got: ${sel}`);
    return this._find(m[1]);
  }
  querySelectorAll(sel) {
    const m = /^\.([\w-]+)$/.exec(String(sel).trim());
    if (!m) throw new Error(`_hudshim querySelectorAll supports only ".class", got: ${sel}`);
    const out = [];
    this._findAll(m[1], out);
    return out;
  }
  _find(cls) {
    for (const c of this.children) {
      if (c._classes.has(cls)) return c;
      const d = c._find(cls);
      if (d) return d;
    }
    return null;
  }
  _findAll(cls, out) {
    for (const c of this.children) {
      if (c._classes.has(cls)) out.push(c);
      c._findAll(cls, out);
    }
  }

  /* ---- misc the HUD calls ---- */
  addEventListener(t, fn) {
    if (!this._listeners.has(t)) this._listeners.set(t, new Set());
    this._listeners.get(t).add(fn);
  }
  removeEventListener(t, fn) { this._listeners.get(t)?.delete(fn); }
  dispatch(t, ev) { for (const fn of this._listeners.get(t) ?? []) fn(ev); }
  /* Web Animations: the HUD only ever fires-and-forgets, so a stub is faithful enough. */
  animate() { return { cancel() {}, finish() {}, addEventListener() {} }; }
}

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

/* ----------------------------------------------------------------- parser */

/**
 * Tag-level HTML/SVG parser. Handles quoted attributes (single and double), self-closing tags and
 * text nodes. That is the whole subset `HUD._build()` and `Icons.js` produce.
 */
function parseHTML(html) {
  const roots = [];
  const stack = [];
  const push = (n) => (stack.length ? stack[stack.length - 1].appendChild(n) : roots.push(n));
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { addText(html.slice(i)); break; }
    if (lt > i) addText(html.slice(i, lt));

    if (html[lt + 1] === '/') {                      // closing tag
      const gt = html.indexOf('>', lt);
      if (gt < 0) break;
      stack.pop();
      i = gt + 1;
      continue;
    }
    if (html.startsWith('<!--', lt)) {                // comment
      const end = html.indexOf('-->', lt);
      i = end < 0 ? html.length : end + 3;
      continue;
    }

    const t = readTag(html, lt);
    if (!t) break;
    const el = new El(t.tag);
    for (const [k, v] of t.attrs) el.setAttribute(k, v);
    push(el);
    if (!t.selfClose) stack.push(el);
    i = t.end;
  }
  return roots;

  function addText(raw) {
    const txt = raw.replace(/\s+/g, ' ');
    if (!txt.trim()) return;
    const host = stack[stack.length - 1];
    if (host) host._text += txt;
  }
}

function readTag(html, start) {
  let i = start + 1;
  const nameEnd = /[\s/>]/.exec(html.slice(i));
  if (!nameEnd) return null;
  const tag = html.slice(i, i + nameEnd.index);
  i += nameEnd.index;
  const attrs = [];

  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] === '>') return { tag, attrs, selfClose: false, end: i + 1 };
    if (html[i] === '/' && html[i + 1] === '>') return { tag, attrs, selfClose: true, end: i + 2 };

    const eq = /[\s=/>]/.exec(html.slice(i));
    if (!eq) return { tag, attrs, selfClose: false, end: html.length };
    const key = html.slice(i, i + eq.index);
    i += eq.index;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== '=') { if (key) attrs.push([key, '']); continue; }
    i++;
    while (i < html.length && /\s/.test(html[i])) i++;
    const q = html[i];
    if (q === '"' || q === "'") {
      const close = html.indexOf(q, i + 1);
      attrs.push([key, html.slice(i + 1, close < 0 ? html.length : close)]);
      i = close < 0 ? html.length : close + 1;
    } else {
      const ve = /[\s/>]/.exec(html.slice(i));
      const end = ve ? i + ve.index : html.length;
      attrs.push([key, html.slice(i, end)]);
      i = end;
    }
  }
  return { tag, attrs, selfClose: false, end: i };
}

/* -------------------------------------------------------------- installer */

/** Install a fresh document/window. Returns a handle for teardown between tests. */
export function installDom() {
  const head = new El('head');
  const body = new El('body');
  const doc = {
    head,
    body,
    createElement: (t) => new El(t),
    createElementNS: (_ns, t) => new El(t),
    documentElement: new El('html'),
  };
  const listeners = new Map();
  const win = {
    document: doc,
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (fn) => { fn(0); return 1; },
    cancelAnimationFrame: () => {},
    addEventListener: (t, fn) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t).add(fn);
    },
    removeEventListener: (t, fn) => listeners.get(t)?.delete(fn),
    dispatch: (t, ev) => { for (const fn of listeners.get(t) ?? []) fn(ev); },
  };

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  return { doc, win, body, head };
}

/* ------------------------------------------------------------ fake engine */

/** The narrowest engine that satisfies `HUD` — an event bus plus the fields it reads. */
export function fakeEngine(camera) {
  const bus = new Map();
  return {
    camera,
    width: 1280,
    height: 720,
    dt: 1 / 60,
    time: 0,
    paused: false,
    debug: { hideHud: false },
    input: { pressed: () => false, releaseLock() {} },
    warnings: [],
    warn(m) { this.warnings.push(m); },
    get: () => null,
    has: () => false,
    on(evt, fn) {
      if (!bus.has(evt)) bus.set(evt, new Set());
      bus.get(evt).add(fn);
      return () => bus.get(evt)?.delete(fn);
    },
    emit(evt, payload) { for (const fn of bus.get(evt) ?? []) fn(payload); },
  };
}

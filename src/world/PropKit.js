import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chamferBox } from './Kit.js';

/**
 * PropKit — parametric builders for everything smaller than a building.
 *
 * Same philosophy as the architecture kit: raw BufferGeometry in *local* space at world UV
 * scale, no materials, no scene graph. The difference is what the shapes are for. A pot, a
 * brazier or a basket is read at two to five metres, so the silhouette rules are harsher:
 *
 *   - Nothing is a primitive. A jar whose profile is a perfect arc reads as a lathe demo;
 *     every profile here gets per-row radius drift and a slightly out-of-round cross section,
 *     which is what "thrown by hand" actually looks like.
 *   - Rims chip, corners knock off, ropes sag. Damage is geometry, never a texture.
 *   - Repeats are built once and instanced with per-instance jitter — see `scatter()`.
 *
 * Conventions
 *   - Local +Y up. Props that "face" something face +Z.
 *   - UVs at UV_PER_M so TEXTURES' repeat values behave the same here as on a pylon.
 *   - Randomness always arrives as an `rng` from core/Rand.js.
 */

/** 1 UV unit per 2 m — the project-wide texel density contract. */
export const UV_PER_M = 0.5;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);

const TAU = Math.PI * 2;
const KEEP = ['position', 'normal', 'uv'];

/* ============================ plumbing ================================= */

/**
 * Strip attributes down to a known set and guarantee an index, so any two geometries in the
 * same bucket can always be merged. `extras` keeps custom streams (banner sway weights,
 * vertex colours) alive through the merge.
 */
export function normaliseAttrs(geo, extras = null) {
  const keep = extras ? KEEP.concat(extras) : KEEP;
  for (const k of Object.keys(geo.attributes)) {
    if (!keep.includes(k)) geo.deleteAttribute(k);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (extras) {
    for (const k of extras) {
      if (geo.attributes[k]) continue;
      const size = k === 'color' ? 3 : 1;
      const a = new Float32Array(n * size);
      if (k === 'color') a.fill(1);
      geo.setAttribute(k, new THREE.BufferAttribute(a, size));
    }
  }
  if (!geo.index) {
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return geo;
}

/** Box-project UVs from current positions along the dominant normal axis. */
export function boxProjectUVs(geo, s = UV_PER_M) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const uv = geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x * s; v = z * s; }
    else if (nx >= nz) { u = z * s; v = y * s; }
    else { u = x * s; v = y * s; }
    uv.setXY(i, u, v);
  }
  geo.setAttribute('uv', uv);
  uv.needsUpdate = true;
  return geo;
}

/** Move a local-space geometry into place. Rotations in radians, YXZ order. */
export function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

export function matrixOf({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
  const m = new THREE.Matrix4();
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  return m;
}

export function mergeAll(list, extras = null) {
  const clean = list.filter(Boolean);
  if (!clean.length) return null;
  for (const g of clean) normaliseAttrs(g, extras);
  if (clean.length === 1) return clean[0];
  const g = mergeGeometries(clean, false);
  if (!g) return clean[0];
  for (const x of clean) x.dispose?.();
  return g;
}

/**
 * A pile of (materialKey, geometry) pairs. Complex props are built out of several materials
 * — a brazier is bronze, coal and flame — so builders hand back a Bag and the caller decides
 * which merge bucket each part lands in.
 */
export class Bag {
  constructor() { this.parts = []; }

  add(key, geo) {
    if (geo) this.parts.push({ key, geo });
    return this;
  }

  /** Fold another bag in, optionally transforming it on the way. */
  absorb(bag, xf = null) {
    if (!bag) return this;
    for (const p of bag.parts) {
      if (xf) place(p.geo, xf);
      this.parts.push(p);
    }
    bag.parts.length = 0;
    return this;
  }

  transform(xf) {
    for (const p of this.parts) place(p.geo, xf);
    return this;
  }

  drain(fn) {
    for (const p of this.parts) fn(p.key, p.geo);
    this.parts.length = 0;
    return this;
  }
}

/* ============================ blocks =================================== */

/**
 * A hand-cut block. Corners are grouped by sign so the box stays watertight while every
 * corner drifts; `chip` knocks one corner in for a genuine broken bite in the silhouette.
 * This is the workhorse — most props are five to thirty of these.
 */
export function chunk(w, h, d, opts = {}) {
  const { rng, jitter = 0.015, chip = 0, taper = 0, lean = 0, shear = 0, round = 0, c = 0 } = opts;
  /* `c` bevels the arrises. On sculpture this is not a masonry detail — a 12–20 cm bevel on a
     shoulder or a thigh is the cheapest thing that reads as a *turned* mass, because the
     bevel's normal sweeps between the two faces and the cel ramp draws its bands across it.
     Reserve it for masses that carry a silhouette; a bevel on an eyelid is 32 wasted
     triangles. */
  if (c > 0) return boxProjectUVs(chamferBox(w, h, d, { rng, jitter, chip, taper, lean, shear, round, c }));
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geo.attributes.position;

  const off = new Map();
  const chipCorner = chip > 0 && rng ? rng.int(0, 7) : -1;
  for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) for (let cz = 0; cz < 2; cz++) {
    const id = cx * 4 + cy * 2 + cz;
    let ox = rng ? rng.jitter(jitter) : 0;
    let oy = rng ? rng.jitter(jitter) : 0;
    let oz = rng ? rng.jitter(jitter) : 0;
    if (cy === 1) {
      const t = taper * 0.5;
      ox += cx ? -t : t; oz += cz ? -t : t;
      ox += lean; oz += shear;
    }
    // `round` pulls the top corners in on both axes — a cheap way to read as worn/soft.
    if (round > 0) {
      ox += (cx ? -round : round) * (cy ? 1 : 0.35);
      oz += (cz ? -round : round) * (cy ? 1 : 0.35);
    }
    if (id === chipCorner) {
      const c = chip * (rng ? rng.range(0.55, 1.0) : 1);
      ox += cx ? -c : c; oy += cy ? -c * 0.7 : c * 0.7; oz += cz ? -c : c;
    }
    off.set(`${cx}${cy}${cz}`, [ox, oy, oz]);
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const o = off.get(`${x > 0 ? 1 : 0}${y > 0 ? 1 : 0}${z > 0 ? 1 : 0}`);
    pos.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  geo.computeVertexNormals();
  return boxProjectUVs(geo);
}

/**
 * Shorthand: an axis-aligned chunk from extents. Reads closer to a layout table than w/h/d.
 * Extents are sorted, so `chunkAt(sx * 0.1, sx * 0.6, …)` works for either sign of sx —
 * mirrored limbs are written once and a flipped box would otherwise come out inside-out.
 */
export function chunkAt(x0, x1, y0, y1, z0, z1, opts = {}) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const az = Math.min(z0, z1), bz = Math.max(z0, z1);
  const g = chunk(bx - ax, by - ay, bz - az, opts);
  return place(g, { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 });
}

/** A wedge — one face collapsed to an edge. Beaks, noses, toes, sherds. */
export function wedge(w, h, d, opts = {}) {
  const { rng, jitter = 0.01, tipY = 1, tipZ = 0, tipW = 0.12 } = opts;
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const top = y > 0 === tipY > 0;
    if (top) {
      x *= tipW;
      z = z * tipW + tipZ;
    }
    if (rng) { x += rng.jitter(jitter); y += rng.jitter(jitter); z += rng.jitter(jitter); }
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return boxProjectUVs(g);
}

/* ======================== solids of revolution ========================= */

/**
 * Surface of revolution from a `[radius, y]` profile.
 *
 * Two deliberate imperfections: `wobble` drifts each profile row's radius (the wall of a
 * thrown pot is never a clean curve), and the same angular scale array is applied at every
 * row so the whole vessel is consistently out-of-round instead of noisy.
 */
export function lathe(profile, opts = {}) {
  const {
    seg = 14, rng, wobble = 0, lobes = 0, lobeAmt = 0, twist = 0,
    capBottom = true, capTop = true, uScale = 1,
  } = opts;

  const rows = profile.length;
  const rScale = new Float32Array(rows);
  for (let i = 0; i < rows; i++) rScale[i] = 1 + (rng && wobble ? rng.jitter(wobble) : 0);
  const aScale = new Float32Array(seg + 1);
  for (let j = 0; j <= seg; j++) aScale[j] = 1 + (rng && wobble ? rng.jitter(wobble * 0.55) : 0);
  aScale[seg] = aScale[0];

  const verts = [], uvs = [], idx = [];
  let arc = 0, prevR = profile[0][0], prevY = profile[0][1];
  const rMax = profile.reduce((m, p) => Math.max(m, p[0]), 0.001);

  for (let i = 0; i < rows; i++) {
    const [pr, py] = profile[i];
    arc += Math.hypot(pr - prevR, py - prevY);
    prevR = pr; prevY = py;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU + twist * (py / Math.max(0.001, profile[rows - 1][1]));
      const lobe = lobes ? 1 + lobeAmt * Math.cos(a * lobes) : 1;
      const r = pr * rScale[i] * aScale[j] * lobe;
      verts.push(Math.cos(a) * r, py, Math.sin(a) * r);
      uvs.push((j / seg) * TAU * rMax * UV_PER_M * uScale, arc * UV_PER_M);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const out = [geo];
  const cap = (rowIdx, up) => {
    const [pr, py] = profile[rowIdx];
    if (pr < 0.004) return;
    const cv = [], cu = [], ci = [];
    cv.push(0, py, 0); cu.push(0, 0);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU;
      const lobe = lobes ? 1 + lobeAmt * Math.cos(a * lobes) : 1;
      const r = pr * rScale[rowIdx] * aScale[j] * lobe;
      cv.push(Math.cos(a) * r, py, Math.sin(a) * r);
      cu.push(Math.cos(a) * r * UV_PER_M, Math.sin(a) * r * UV_PER_M);
    }
    for (let j = 1; j <= seg; j++) {
      if (up) ci.push(0, j, j + 1); else ci.push(0, j + 1, j);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    out.push(cg);
  };
  if (capBottom) cap(0, false);
  if (capTop) cap(rows - 1, true);
  return mergeAll(out);
}

/** A tapered post: mast, table leg, torch shaft. Cheap and always slightly bent. */
export function post(h, r0, r1, opts = {}) {
  const { seg = 8, rng, bend = 0, rows = 4 } = opts;
  const prof = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    prof.push([r0 + (r1 - r0) * t, h * t]);
  }
  const g = lathe(prof, { seg, rng, wobble: rng ? 0.03 : 0 });
  if (bend) {
    // Bow the post along +X with height; a perfectly straight pole reads as a cylinder prim.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / Math.max(0.001, h);
      pos.setX(i, pos.getX(i) + bend * y * y);
    }
    g.computeVertexNormals();
  }
  return g;
}

/* ============================ pottery ================================== */

/**
 * A wheel-thrown vessel. `kind` picks the silhouette family; everything else is derived so
 * a jar, an urn and an amphora are the same code with different bellies.
 */
export function vessel(opts = {}) {
  const {
    h = 1.0, rFoot = 0.16, rBelly = 0.38, rNeck = 0.16, rLip = 0.21,
    bellyAt = 0.42, seg = 12, rng, chip = 0, wobble = 0.035, rows = 9, lid = false,
  } = opts;

  const prof = [[rFoot * 0.55, 0], [rFoot, h * 0.04]];
  for (let i = 1; i <= rows; i++) {
    const t = i / rows;
    // Belly swells to rBelly at bellyAt then draws back to the neck. Powers keep the
    // shoulder tight and the base fat — the classic Egyptian storage jar.
    const s = t < bellyAt
      ? Math.pow(t / bellyAt, 0.62)
      : 1 - Math.pow((t - bellyAt) / (1 - bellyAt), 1.35);
    const r = rFoot + (rBelly - rFoot) * s;
    prof.push([Math.max(rNeck * 0.9, r), h * (0.04 + 0.86 * t)]);
  }
  prof.push([rNeck, h * 0.93]);
  prof.push([rLip, h * 0.97]);
  prof.push([rLip * 0.94, h]);

  const g = lathe(prof, { seg, rng, wobble, capTop: false, capBottom: true });

  if (chip > 0 && rng) {
    // Knock a bite out of the rim: pull two adjacent lip verts down and inward.
    const pos = g.attributes.position;
    const top = h * 0.9;
    const a0 = rng.range(0, TAU), span = rng.range(0.5, 1.1);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < top) continue;
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      let d = Math.abs(((a - a0 + Math.PI * 3) % TAU) - Math.PI);
      if (d > span) continue;
      const k = (1 - d / span) * chip;
      pos.setY(i, y - k * h * 0.16);
      pos.setX(i, pos.getX(i) * (1 - k * 0.10));
      pos.setZ(i, pos.getZ(i) * (1 - k * 0.10));
    }
    g.computeVertexNormals();
  }

  if (!lid) return g;
  const cap = lathe([[rLip * 1.06, 0], [rLip * 0.98, h * 0.05], [rLip * 0.5, h * 0.10], [rLip * 0.22, h * 0.13]],
    { seg, rng, wobble: 0.02 });
  place(cap, { y: h * 0.96 });
  return mergeAll([g, cap]);
}

/** Two loop handles for an amphora. Torus arcs, squashed, tilted outward. */
export function handles(rBelly, y, opts = {}) {
  const { tube = 0.045, rng } = opts;
  const out = [];
  for (const s of [-1, 1]) {
    const t = new THREE.TorusGeometry(rBelly * 0.42, tube, 5, 9, Math.PI * 1.15);
    normaliseAttrs(t);
    place(t, {
      x: s * rBelly * 0.86, y, rz: s > 0 ? -Math.PI * 0.42 : Math.PI * 0.42,
      ry: rng ? rng.jitter(0.12) : 0, sy: 1.35,
    });
    out.push(boxProjectUVs(t));
  }
  return mergeAll(out);
}

/** Canopic jar: a stopper carved as a head sits on a squat alabaster body. */
export function canopicJar(kind, opts = {}) {
  const { h = 0.62, rng } = opts;
  const body = vessel({
    h: h * 0.72, rFoot: h * 0.19, rBelly: h * 0.29, rNeck: h * 0.24, rLip: h * 0.27,
    bellyAt: 0.55, seg: 12, rng, rows: 7, wobble: 0.02,
  });
  const out = [body];
  const y = h * 0.72;
  const head = [];
  if (kind === 'jackal') {
    head.push(place(chunk(h * 0.30, h * 0.26, h * 0.34, { rng, round: 0.02 }), { y: y + h * 0.14, z: h * 0.02 }));
    head.push(place(wedge(h * 0.17, h * 0.30, h * 0.16, { rng, tipW: 0.5 }), { y: y + h * 0.18, z: h * 0.22, rx: 1.35 }));
    for (const s of [-1, 1]) head.push(place(wedge(h * 0.10, h * 0.26, h * 0.05, { rng, tipW: 0.25 }), { x: s * h * 0.11, y: y + h * 0.36, z: -h * 0.02, rz: s * 0.14 }));
  } else if (kind === 'falcon') {
    head.push(place(chunk(h * 0.30, h * 0.28, h * 0.30, { rng, round: 0.03 }), { y: y + h * 0.15 }));
    head.push(place(wedge(h * 0.12, h * 0.20, h * 0.13, { rng, tipW: 0.3, tipZ: 0.04 }), { y: y + h * 0.14, z: h * 0.17, rx: 2.1 }));
  } else if (kind === 'baboon') {
    head.push(place(chunk(h * 0.32, h * 0.26, h * 0.28, { rng, round: 0.04 }), { y: y + h * 0.14 }));
    head.push(place(chunk(h * 0.16, h * 0.13, h * 0.12, { rng, round: 0.03 }), { y: y + h * 0.08, z: h * 0.16 }));
  } else {
    // human — the classic Imsety lid, nemes and all, in miniature
    head.push(place(chunk(h * 0.26, h * 0.30, h * 0.26, { rng, round: 0.03 }), { y: y + h * 0.16 }));
    head.push(place(chunk(h * 0.34, h * 0.10, h * 0.28, { rng }), { y: y + h * 0.28 }));
    for (const s of [-1, 1]) head.push(place(chunk(h * 0.07, h * 0.20, h * 0.10, { rng, taper: 0.02 }), { x: s * h * 0.15, y: y + h * 0.14, z: h * 0.08 }));
  }
  head.push(place(lathe([[h * 0.27, 0], [h * 0.28, h * 0.03], [h * 0.24, h * 0.05]], { seg: 12, rng }), { y }));
  out.push(...head);
  return mergeAll(out);
}

/** Woven basket: coiled bands, slightly oval, with a sagging rim. */
export function basket(opts = {}) {
  const { r = 0.34, h = 0.4, seg = 12, rng, bands = 5 } = opts;
  const out = [];
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1 || 1);
    const rr = r * (0.72 + 0.28 * Math.sin(Math.PI * (0.25 + t * 0.6)));
    const band = new THREE.TorusGeometry(rr, h / bands * 0.62, 4, seg);
    normaliseAttrs(band);
    place(band, { y: h * t + h * 0.06, rx: Math.PI / 2, sz: 0.55, ry: rng ? rng.range(0, 1) : 0 });
    out.push(boxProjectUVs(band));
  }
  out.push(place(lathe([[r * 0.6, 0], [r * 0.62, 0.03]], { seg, rng, wobble: 0.04 }), { y: 0.02 }));
  return mergeAll(out);
}

/** Coiled rope on the floor: stacked, squashed tori that drift off-centre as they rise. */
export function ropeCoil(opts = {}) {
  const { r = 0.5, tube = 0.07, coils = 4, rng } = opts;
  const out = [];
  for (let i = 0; i < coils; i++) {
    const t = i / coils;
    const g = new THREE.TorusGeometry(r * (1 - t * 0.22), tube, 5, 14);
    normaliseAttrs(g);
    place(g, {
      x: rng ? rng.jitter(0.05) : 0, y: tube * 1.55 * i + tube,
      z: rng ? rng.jitter(0.05) : 0, rx: Math.PI / 2, sz: 0.7,
      ry: rng ? rng.range(0, TAU) : 0,
    });
    out.push(boxProjectUVs(g));
  }
  return mergeAll(out);
}

/** A slack rope between two points — a catenary tube, because taut rope reads as wire. */
export function ropeSpan(a, b, opts = {}) {
  const { sag = 0.35, r = 0.05, seg = 14, rad = 4 } = opts;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector3(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag,
      a[2] + (b[2] - a[2]) * t
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
  const g = new THREE.TubeGeometry(curve, seg, r, rad, false);
  normaliseAttrs(g);
  const uv = g.attributes.uv, L = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L * UV_PER_M, uv.getY(i) * TAU * r * UV_PER_M);
  uv.needsUpdate = true;
  return g;
}

/** Rope lashing: a short barrel of wraps around a joint. The tell that says "tied, not bolted". */
export function lashing(r, w, opts = {}) {
  const { wraps = 4, tube = 0.032, rng } = opts;
  const out = [];
  for (let i = 0; i < wraps; i++) {
    const g = new THREE.TorusGeometry(r, tube, 4, 10);
    normaliseAttrs(g);
    place(g, { y: (i - (wraps - 1) / 2) * (w / wraps), rx: Math.PI / 2, ry: rng ? rng.range(0, 1) : 0, sz: 1.12 });
    out.push(boxProjectUVs(g));
  }
  return mergeAll(out);
}

/* ============================ fire ===================================== */

/**
 * Brazier: a bowl on splayed legs, a bed of coals, and the point the flame and the light
 * hang off. Bronze that has been in the sun for four thousand years, so the legs bow.
 */
export function brazier(opts = {}) {
  const { r = 0.62, h = 1.05, rng, legs = 3 } = opts;
  const bag = new Bag();

  const bowl = lathe([
    [r * 0.30, 0], [r * 0.62, r * 0.16], [r * 0.86, r * 0.40],
    [r * 1.00, r * 0.66], [r * 1.06, r * 0.78], [r * 0.96, r * 0.80],
    [r * 0.82, r * 0.62],
  ], { seg: 14, rng, wobble: 0.02, capTop: false });
  place(bowl, { y: h });
  bag.add('bronze', bowl);

  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * TAU + 0.4;
    const leg = post(h + 0.05, 0.075, 0.05, { seg: 6, rng, bend: 0.09, rows: 3 });
    place(leg, { x: Math.cos(a) * r * 0.52, z: Math.sin(a) * r * 0.52, ry: -a, rz: Math.cos(a) * 0.12, rx: -Math.sin(a) * 0.12 });
    bag.add('bronze', leg);
    // Foot pad, so the leg doesn't end in a floating circle.
    bag.add('bronze', place(chunk(0.20, 0.06, 0.20, { rng, jitter: 0.01 }), { x: Math.cos(a) * r * 0.60, y: 0.03, z: Math.sin(a) * r * 0.60 }));
  }
  // Ring stretcher between the legs — reads as wrought metal.
  const ring = new THREE.TorusGeometry(r * 0.56, 0.038, 4, 12);
  normaliseAttrs(ring);
  place(ring, { y: h * 0.38, rx: Math.PI / 2 });
  bag.add('bronze', boxProjectUVs(ring));

  // Coal bed: chunky lumps, deliberately over-scale so they read at ten metres.
  for (let i = 0; i < 7; i++) {
    const a = rng ? rng.range(0, TAU) : i, rr = rng ? rng.range(0, r * 0.62) : 0;
    bag.add('ember', place(
      chunk(rng ? rng.range(0.13, 0.24) : 0.18, 0.11, rng ? rng.range(0.13, 0.22) : 0.16, { rng, jitter: 0.03, chip: 0.05 }),
      { x: Math.cos(a) * rr, y: h + r * 0.52, z: Math.sin(a) * rr, ry: rng ? rng.range(0, 1) : 0, rz: rng ? rng.jitter(0.3) : 0 }
    ));
  }
  bag.flameAt = [0, h + r * 0.62, 0];
  bag.lightAt = [0, h + r * 0.95, 0];
  return bag;
}

/** Wall torch: a bracket, a bound shaft, a cup. Faces +Z, mounts at y = 0 on the wall plane. */
export function wallTorch(opts = {}) {
  const { rng, len = 0.85 } = opts;
  const bag = new Bag();
  const plate = chunk(0.22, 0.34, 0.09, { rng, jitter: 0.008, chip: 0.03 });
  place(plate, { z: 0.045 });
  bag.add('bronze', plate);
  const arm = post(len, 0.055, 0.042, { seg: 6, rng, rows: 3 });
  place(arm, { z: 0.08, rx: Math.PI * 0.34 });
  bag.add('bronze', arm);
  const cup = lathe([[0.07, 0], [0.13, 0.09], [0.16, 0.19], [0.14, 0.21]], { seg: 10, rng, wobble: 0.02, capTop: false });
  const tipZ = 0.08 + Math.sin(Math.PI * 0.34) * len, tipY = Math.cos(Math.PI * 0.34) * len;
  place(cup, { y: tipY, z: tipZ });
  bag.add('bronze', cup);
  bag.add('ember', place(chunk(0.18, 0.07, 0.18, { rng, jitter: 0.03 }), { y: tipY + 0.19, z: tipZ }));
  bag.flameAt = [0, tipY + 0.24, tipZ];
  bag.lightAt = [0, tipY + 0.42, tipZ + 0.1];
  return bag;
}

/**
 * Flame sprite: two crossed quads. Cheaper and better-looking than any mesh flame — the
 * texture carries the turbulent edge, additive blending carries the heat, and crossing them
 * means it never turns edge-on and disappears.
 */
export function flameCard(w = 0.5, h = 0.9) {
  const out = [];
  for (const ry of [0, Math.PI / 2]) {
    const q = new THREE.PlaneGeometry(w, h, 1, 1);
    place(q, { y: h * 0.5, ry });
    out.push(q);
  }
  return mergeAll(out);
}

/** Single quad, centred — sparkles, glints, soot. */
export function card(w = 0.5, h = 0.5) {
  return new THREE.PlaneGeometry(w, h, 1, 1);
}

/**
 * Soot: a scorch licking up a wall above a flame. Built as a fan of tapered tongues so the
 * silhouette is ragged — a rectangle of dark would read as a sticker.
 */
export function sootStain(opts = {}) {
  const { w = 0.7, h = 1.3, tongues = 5, rng } = opts;
  const out = [];
  for (let i = 0; i < tongues; i++) {
    const t = (i + 0.5) / tongues;
    const x = (t - 0.5) * w;
    const hh = h * (0.45 + 0.55 * Math.sin(Math.PI * t)) * (rng ? rng.range(0.75, 1.15) : 1);
    const ww = (w / tongues) * (rng ? rng.range(1.0, 1.5) : 1.2);
    out.push(place(wedge(ww, hh, 0.03, { rng, jitter: 0.01, tipW: 0.18 }), { x, y: hh * 0.5 }));
  }
  return mergeAll(out);
}

/* ============================ furniture ================================ */

/** Offering table: a thick slab on splayed legs with a libation channel cut in the top. */
export function offeringTable(opts = {}) {
  const { w = 1.3, d = 0.8, h = 0.66, rng } = opts;
  const bag = new Bag();
  bag.add('stone', place(chunk(w, 0.13, d, { rng, jitter: 0.012, chip: 0.05 }), { y: h }));
  bag.add('stone', place(chunk(w * 0.44, 0.05, d * 0.4, { rng, jitter: 0.008 }), { y: h + 0.08 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bag.add('stone', place(chunk(0.13, h, 0.13, { rng, jitter: 0.01, taper: 0.03 }),
      { x: sx * (w / 2 - 0.14), y: h / 2, z: sz * (d / 2 - 0.12), rz: sx * 0.035, rx: -sz * 0.035 }));
  }
  bag.add('stone', place(chunk(w * 0.9, 0.07, d * 0.75, { rng, jitter: 0.01 }), { y: 0.05 }));
  return bag;
}

/** Incense stand: a tall stem with a shallow dish. Lives beside doorways and shrines. */
export function incenseStand(opts = {}) {
  const { h = 1.15, rng } = opts;
  const bag = new Bag();
  bag.add('stone', lathe([
    [0.24, 0], [0.26, 0.06], [0.14, 0.12], [0.10, h * 0.35], [0.085, h * 0.62],
    [0.11, h * 0.80], [0.20, h * 0.90], [0.30, h], [0.31, h + 0.05], [0.24, h + 0.06],
  ], { seg: 12, rng, wobble: 0.02, capTop: false }));
  bag.add('ember', place(chunk(0.26, 0.05, 0.26, { rng, jitter: 0.02 }), { y: h + 0.02 }));
  bag.flameAt = [0, h + 0.06, 0];
  return bag;
}

/**
 * Scaffolding bay — palm poles lashed with rope, plank decks. Doubles as traversal
 * geometry, so the decks are chunky and the uprights are a clean climbable radius.
 */
export function scaffold(opts = {}) {
  const { w = 1.9, d = 1.5, h = 10, decks = [3.4, 6.6, 9.4], rng } = opts;
  const bag = new Bag();
  const uprights = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
  for (const [ux, uz] of uprights) {
    const p = post(h, 0.115, 0.085, { seg: 7, rng, bend: rng ? rng.jitter(0.10) : 0, rows: 5 });
    place(p, { x: ux, z: uz, ry: rng ? rng.range(0, 1) : 0 });
    bag.add('wood', p);
  }
  for (const y of decks) {
    // Ledgers on all four sides, then planks across.
    for (const [len, ry, px, pz] of [[w, 0, 0, -d / 2], [w, 0, 0, d / 2], [d, Math.PI / 2, -w / 2, 0], [d, Math.PI / 2, w / 2, 0]]) {
      const l = post(len + 0.5, 0.075, 0.065, { seg: 6, rng, rows: 2 });
      place(l, { x: px, y: y - 0.16, z: pz, rz: Math.PI / 2, ry: ry + (rng ? rng.jitter(0.02) : 0) });
      bag.add('wood', l);
    }
    const planks = 4;
    for (let i = 0; i < planks; i++) {
      const pz = (i / (planks - 1) - 0.5) * (d - 0.16);
      bag.add('wood', place(chunk(w + 0.55, 0.075, (d - 0.1) / planks * 0.86, { rng, jitter: 0.012, chip: 0.03 }),
        { y, z: pz, ry: rng ? rng.jitter(0.02) : 0, rz: rng ? rng.jitter(0.012) : 0 }));
    }
    // Lashings where the ledgers cross the uprights.
    for (const [ux, uz] of uprights) {
      const g = lashing(0.135, 0.20, { wraps: 3, tube: 0.028, rng });
      place(g, { x: ux, y: y - 0.16, z: uz });
      bag.add('rope', g);
    }
  }
  // Diagonal brace on one bay — the thing that stops it reading as a grid.
  const diag = post(Math.hypot(w, decks[1]), 0.07, 0.06, { seg: 5, rng, rows: 2 });
  place(diag, { x: 0, y: decks[1] * 0.5, z: -d / 2 - 0.06, rz: Math.atan2(w, decks[1]) });
  bag.add('wood', diag);
  bag.decks = decks;
  return bag;
}

/* ============================ cloth ==================================== */

/**
 * A hanging banner. Returns geometry carrying `aSway` (0 at the fixed edge, 1 at the free
 * hem) and RGB vertex bands, so one draw call gives painted linen that moves in the wind.
 * Static cloth reads as painted cardboard, which is why the sway is not optional.
 */
export function banner(opts = {}) {
  const {
    w = 1.5, h = 5.0, nx = 5, ny = 12, rng,
    bulge = 0.22, tail = 0.5, bands = null,
  } = opts;

  const verts = [], uvs = [], sway = [], cols = [], idx = [];
  const pal = bands || [[0.95, 0.91, 0.83]];
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const x = (u - 0.5) * w;
      // Swallow-tail hem: the centre is cut up, the corners hang.
      const cut = v >= 1 ? tail * (1 - Math.abs(u - 0.5) * 2) : 0;
      const y = -h * v + cut;
      // Baked slack: the cloth bows away from the pole, more so toward the hem.
      const z = bulge * Math.sin(Math.PI * u) * (0.25 + 0.75 * v) + (rng ? rng.jitter(0.02) : 0);
      verts.push(x, y, z);
      uvs.push(x * UV_PER_M * 2, -y * UV_PER_M * 2);
      sway.push(Math.pow(v, 1.5));
      const c = pal[Math.min(pal.length - 1, Math.floor(v * pal.length))];
      cols.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Banner mast: a papyrus-bundle pole with binding rings and a flared finial. */
export function bannerMast(opts = {}) {
  const { h = 9, r0 = 0.19, r1 = 0.13, rng } = opts;
  const bag = new Bag();
  const shaft = lathe([
    [r0 * 1.5, 0], [r0 * 1.25, 0.22], [r0, 0.34],
    [r0 * 0.97, h * 0.4], [r1, h * 0.86], [r1 * 0.94, h],
  ], { seg: 9, rng, wobble: 0.015, lobes: 6, lobeAmt: 0.06 });
  bag.add('wood', shaft);
  for (const t of [0.30, 0.55, 0.80]) {
    const ring = new THREE.TorusGeometry(r0 * 0.95 - t * 0.03, 0.032, 4, 10);
    normaliseAttrs(ring);
    place(ring, { y: h * t, rx: Math.PI / 2 });
    bag.add('rope', boxProjectUVs(ring));
  }
  // Finial: a little cavetto cap so the top isn't a cut cylinder.
  bag.add('gold', place(lathe([[r1 * 1.1, 0], [r1 * 1.5, 0.10], [r1 * 1.15, 0.14], [r1 * 0.5, 0.30]], { seg: 9, rng }), { y: h }));
  bag.add('wood', place(chunk(0.10, 0.09, 1.05, { rng, jitter: 0.01 }), { y: h - 0.12 }));   // crossbar
  bag.topAt = h - 0.14;
  return bag;
}

/* ============================ treasure ================================= */

/** A single coin. Twelve-sided so the rim catches a hard specular step. */
export function coin(r = 0.075, t = 0.016) {
  const g = new THREE.CylinderGeometry(r, r * 0.97, t, 12, 1);
  normaliseAttrs(g);
  return boxProjectUVs(g);
}

/** Ingot: a squat truncated pyramid, stamped. Reads as heavy. */
export function ingot(opts = {}) {
  const { w = 0.32, h = 0.11, d = 0.18, rng } = opts;
  const g = chunk(w, h, d, { rng, jitter: 0.006, taper: 0.06 });
  const stamp = chunk(w * 0.4, 0.012, d * 0.42, { rng, jitter: 0.004 });
  place(stamp, { y: h * 0.5 });
  return mergeAll([g, stamp]);
}

/** Scarab amulet: domed back, split elytra, six little legs. */
export function scarab(opts = {}) {
  const { len = 0.22, rng } = opts;
  const out = [];
  const body = lathe([[len * 0.30, 0], [len * 0.42, len * 0.10], [len * 0.40, len * 0.22], [len * 0.22, len * 0.30], [0, len * 0.33]],
    { seg: 10, rng, wobble: 0.02 });
  place(body, { sz: 1.35 });
  out.push(body);
  out.push(place(chunk(len * 0.05, len * 0.06, len * 0.62, { rng, jitter: 0.003 }), { y: len * 0.26 }));
  out.push(place(chunk(len * 0.5, len * 0.10, len * 0.16, { rng, jitter: 0.004, taper: 0.02 }), { y: len * 0.14, z: len * 0.36 }));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    out.push(place(chunk(len * 0.30, len * 0.035, len * 0.05, { rng, jitter: 0.003 }),
      { x: s * len * 0.34, y: len * 0.05, z: (i - 1) * len * 0.18, ry: s * (0.3 + i * 0.2) }));
  }
  return mergeAll(out);
}

/**
 * A broad collar (wesekh) — concentric strung rows. Returns a Bag so the rows alternate
 * gold and stone inlay, which is the whole reason it reads as jewellery and not a donut.
 */
export function collar(opts = {}) {
  const { r = 0.5, rows = 4, arc = Math.PI * 1.35, rng, keys = ['gold', 'lapis', 'gold', 'carnelian'] } = opts;
  const bag = new Bag();
  for (let i = 0; i < rows; i++) {
    const rr = r * (1 - i * 0.13);
    const g = new THREE.TorusGeometry(rr, r * 0.055, 4, 16, arc);
    normaliseAttrs(g);
    place(g, { rz: -arc / 2 - Math.PI / 2, sy: 0.72, y: i * r * 0.035 });
    bag.add(keys[i % keys.length], boxProjectUVs(g));
  }
  return bag;
}

/**
 * A hoard: a drifted mound with coins, ingots and vessels tumbled over it. The mound is
 * lumpy on purpose — a smooth dome of gold reads as a hill, not as loot.
 */
export function hoardMound(opts = {}) {
  const { r = 1.6, h = 0.5, seg = 16, rings = 4, rng } = opts;
  const verts = [], uvs = [], idx = [];
  verts.push(0, h * (rng ? rng.range(0.9, 1.1) : 1), 0); uvs.push(0, 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      const lump = 1 + (rng ? rng.jitter(0.22) : 0) + 0.12 * Math.sin(a * 3 + i);
      const rr = r * t * lump;
      const y = h * Math.pow(1 - t, 1.6) * (1 + (rng ? rng.jitter(0.25) : 0));
      verts.push(Math.cos(a) * rr, Math.max(0.01, y), Math.sin(a) * rr);
      uvs.push(Math.cos(a) * rr * UV_PER_M, Math.sin(a) * rr * UV_PER_M);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + j, 1 + ((j + 1) % seg));
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j, b = 1 + i * seg + ((j + 1) % seg);
      const c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Sly's clue bottle: dumpy glass body, cork, wax seal. */
export function clueBottle(opts = {}) {
  const { h = 0.42, rng } = opts;
  const bag = new Bag();
  bag.add('glass', lathe([
    [h * 0.22, 0], [h * 0.30, h * 0.08], [h * 0.32, h * 0.36], [h * 0.26, h * 0.55],
    [h * 0.13, h * 0.68], [h * 0.12, h * 0.86], [h * 0.15, h * 0.92], [h * 0.13, h * 0.95],
  ], { seg: 10, rng, wobble: 0.015, capTop: false }));
  bag.add('cork', place(lathe([[h * 0.12, 0], [h * 0.13, h * 0.06], [h * 0.11, h * 0.10]], { seg: 8, rng }), { y: h * 0.93 }));
  return bag;
}

/* ============================ ground ================================== */

/**
 * Sand drifted into the angle where a prop meets the floor. Nothing in a desert sits on a
 * crisp line; this is the cheapest possible fix and it sells every base in the level.
 */
export function sandSkirt(opts = {}) {
  const { r = 1.0, spread = 0.7, h = 0.22, seg = 14, rng } = opts;
  const verts = [], uvs = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * TAU;
    const k = 1 + (rng ? rng.jitter(0.35) : 0) + 0.22 * Math.sin(a * 2.3);
    const hh = Math.max(0.03, h * (0.6 + 0.6 * Math.abs(Math.sin(a * 1.7 + 0.6))));
    verts.push(Math.cos(a) * r, hh, Math.sin(a) * r);
    uvs.push(Math.cos(a) * r * UV_PER_M, Math.sin(a) * r * UV_PER_M);
    const ro = r + spread * k;
    verts.push(Math.cos(a) * ro, 0.005, Math.sin(a) * ro);
    uvs.push(Math.cos(a) * ro * UV_PER_M, Math.sin(a) * ro * UV_PER_M);
  }
  for (let j = 0; j < seg; j++) {
    const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A fallen column drum, optionally cracked in half. */
export function columnDrum(opts = {}) {
  const { r = 1.1, h = 0.9, rng, lobes = 8 } = opts;
  const g = lathe([
    [r * 0.94, 0], [r, h * 0.08], [r * 1.02, h * 0.5], [r, h * 0.92], [r * 0.93, h],
  ], { seg: 16, rng, wobble: 0.02, lobes, lobeAmt: 0.035 });
  return g;
}

/** Rubble: a handful of angular fragments, for the base of anything broken. */
export function rubble(opts = {}) {
  const { count = 6, size = 0.4, rng, spread = 1.2 } = opts;
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = size * (rng ? rng.range(0.4, 1.2) : 1);
    const g = chunk(s, s * 0.55, s * 0.8, { rng, jitter: s * 0.16, chip: s * 0.3 });
    place(g, {
      x: rng ? rng.jitter(spread) : 0, y: s * 0.22, z: rng ? rng.jitter(spread) : 0,
      ry: rng ? rng.range(0, TAU) : 0, rz: rng ? rng.jitter(0.4) : 0, rx: rng ? rng.jitter(0.4) : 0,
    });
    out.push(g);
  }
  return mergeAll(out);
}

/* ============================ scatter ================================== */

/**
 * Instance matrices for a scattered repeat: N copies with jittered position, yaw and scale.
 * Everything repeated in this module goes through here so the draw-call budget survives.
 */
export function scatter(n, fn, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = fn(i, rng);
    if (!p) continue;
    out.push(matrixOf(p));
  }
  return out;
}

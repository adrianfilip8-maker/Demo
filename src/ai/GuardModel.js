import * as THREE from 'three';
import { fbm2, valueNoise2 } from '../core/Rand.js';

/**
 * GuardModel — the procedural mesh foundry for the Temple of Ra's garrison.
 *
 * Design brief, in one line each:
 *   · **Temple Guard** — a jackal in a lapis-and-gold nemes, linen shendyt and a bronze spear.
 *     Barrel chest, comically tiny legs, hands the size of his head. Half comedy, half threat.
 *   · **Heavy** — a hippo in a bronze cuirass with a shield the size of a door. Slower, wider,
 *     and his helmet is a landing pad you bounce *off*, not on.
 *   · **Scarab sentinel** — a knee-high beetle with a lapis carapace and a turquoise underglow.
 *
 * Construction rules (they are what keep 12 characters inside the draw budget):
 *   · Geometry is built **once per type** and shared by every instance. Only the `Skeleton`
 *     is per-instance, which is all `SkinnedMesh` actually needs to animate independently.
 *   · Exactly **two material groups** per guard — `body` (cloth/fur/leather) and `metal`
 *     (bronze/gold). Everything else — eye whites, ink pupils, painted stripes — rides on the
 *     vertex colour channel. Two draws + one ink shell per guard, and no more.
 *   · Normals come from smoothing groups, not `computeVertexNormals()`: a cartoon guard wants
 *     a smooth belly *and* a razor edge on the breastplate lip and the shield rim.
 *   · Skin weights are authored per ring. The shoulder and the hip are then hand-fixed on top,
 *     because automatic weighting always shears a dent out of a deltoid this exaggerated.
 *
 * Origin is at the FEET, +Z is forward, his left is +X — the same convention CHARACTER uses,
 * so poses read the same way in both files.
 */

/* ============================ TUNE ======================================== */

export const TUNE = {
  /* Silhouette exaggeration knobs. These are the only numbers worth touching by hand. */
  shoulderWidth: 1.00,     // multiplier on the deltoid spread — the big cartoon read
  legShorten: 1.00,        // <1 = even stubbier legs
  handScale: 1.00,         // huge thief-bait hands
  headScale: 1.00,
  footScale: 1.00,

  segLimb: 12,
  segTorso: 18,
  segHead: 20,

  colorJitter: 0.055,      // per-vertex tone break-up so no region is one flat value
};

/* ============================ PALETTE ===================================== */
/* Everything here is from the §2.2 Egypt palette or a blend of two entries in it. */

const PAL = {
  /* jackal */
  furMid: 0x8a5a38,        // SANDSTONE dark — a desert jackal, not a black one, so he
  furLight: 0xc9915a,      // still reads at night against dark stone
  furDark: 0x4a2f22,
  muzzle: 0x2a2018,
  /* hippo */
  hideMid: 0x6f6a82,
  hideLight: 0x8d88a0,
  hideDark: 0x453f55,
  hidePink: 0xa8756a,
  /* dress */
  linen: 0xf0e3c8,         // LIMESTONE light
  linenShade: 0xd4c19a,
  lapis: 0x1f4f96,
  turquoise: 0x2fa8a0,
  carnelian: 0xb8452c,
  malachite: 0x2f8f5a,
  leather: 0x6b4526,
  /* metal group */
  gold: 0xe8b942,
  goldLight: 0xffe9a8,
  goldDark: 0x966a18,
  bronze: 0xb07a3c,
  bronzeDark: 0x6d4a22,
  /* ink + eyes */
  ink: 0x1a1210,
  eyeWhite: 0xf7f3e6,
  scarabShell: 0x24304e,
  scarabGlow: 0x2fa8a0,
};

/** Material group order. Index into the material array ⇒ also the draw order. */
export const GROUPS = ['body', 'metal'];

/* ======================================================================== */
/*  Builder                                                                  */
/* ======================================================================== */

const WELD = 1e4;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _nrm = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _col = new THREE.Color();

/**
 * Accumulates one indexed BufferGeometry with material groups, vertex colours and skin data.
 * Vertices weld by (quantised position, smoothing group) for the normal pass, which buys hard
 * edges and a fixed UV seam from the same mechanism.
 */
class GBuild {
  constructor(boneIndex) {
    this.boneIndex = boneIndex;
    this.pos = []; this.uv = []; this.col = [];
    this.si = []; this.sw = []; this.sgOf = [];
    this.groups = new Map();
    this._g = 'body';
    this._sg = 1;
    this._sgNext = 100;
    this._c = new THREE.Color(1, 1, 1);
    this._w = [['root', 1]];
    this.missing = new Set();
  }

  group(n) { this._g = n; return this; }
  sg(id) { this._sg = id; return this; }
  newSg() { return ++this._sgNext; }
  color(c) { this._c.set(c); return this; }
  weights(w) { this._w = w; return this; }

  vert(p, u = 0, v = 0, col = null, w = null) {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    const c = col || this._c;
    this.col.push(c.r, c.g, c.b);
    this._skin(w || this._w);
    this.sgOf.push(this._sg);
    return i;
  }

  _skin(pairs) {
    let list = pairs;
    if (list.length > 4) list = list.slice().sort((x, y) => y[1] - x[1]).slice(0, 4);
    let sum = 0;
    for (let k = 0; k < list.length; k++) sum += list[k][1];
    if (sum <= 1e-6) { this.si.push(0, 0, 0, 0); this.sw.push(1, 0, 0, 0); return; }
    for (let k = 0; k < 4; k++) {
      if (k < list.length) {
        let idx = this.boneIndex[list[k][0]];
        if (idx === undefined) { this.missing.add(list[k][0]); idx = 0; }
        this.si.push(idx);
        this.sw.push(list[k][1] / sum);
      } else { this.si.push(0); this.sw.push(0); }
    }
  }

  _arr() {
    let a = this.groups.get(this._g);
    if (!a) { a = []; this.groups.set(this._g, a); }
    return a;
  }

  tri(a, b, c) { const g = this._arr(); g.push(a, b, c); return this; }
  quad(a, b, c, d) { const g = this._arr(); g.push(a, b, c, a, c, d); return this; }

  get triangleCount() { let n = 0; for (const g of this.groups.values()) n += g.length / 3; return n; }

  toGeometry(order) {
    const vcount = this.pos.length / 3;
    const position = new Float32Array(this.pos);
    const normal = new Float32Array(vcount * 3);

    const index = [];
    const ranges = [];
    for (let gi = 0; gi < order.length; gi++) {
      const arr = this.groups.get(order[gi]);
      const start = index.length;
      if (arr) for (let k = 0; k < arr.length; k++) index.push(arr[k]);
      ranges.push({ start, count: index.length - start, mat: gi });
    }

    // Area-weighted face normals: a big face should steer the average more than a sliver.
    for (let f = 0; f < index.length; f += 3) {
      const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
      _a.set(position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]);
      _b.set(position[c] - position[a], position[c + 1] - position[a + 1], position[c + 2] - position[a + 2]);
      _nrm.crossVectors(_a, _b);
      for (let k = 0; k < 3; k++) {
        const o = index[f + k] * 3;
        normal[o] += _nrm.x; normal[o + 1] += _nrm.y; normal[o + 2] += _nrm.z;
      }
    }

    const buckets = new Map();
    for (let i = 0; i < vcount; i++) {
      const o = i * 3;
      const key = `${Math.round(position[o] * WELD)},${Math.round(position[o + 1] * WELD)},` +
                  `${Math.round(position[o + 2] * WELD)},${this.sgOf[i]}`;
      let bk = buckets.get(key);
      if (!bk) { bk = { x: 0, y: 0, z: 0, list: [] }; buckets.set(key, bk); }
      bk.x += normal[o]; bk.y += normal[o + 1]; bk.z += normal[o + 2];
      bk.list.push(i);
    }
    for (const bk of buckets.values()) {
      let l = Math.hypot(bk.x, bk.y, bk.z);
      if (l < 1e-12) { bk.x = 0; bk.y = 1; bk.z = 0; l = 1; }
      const x = bk.x / l, y = bk.y / l, z = bk.z / l;
      for (const i of bk.list) { const o = i * 3; normal[o] = x; normal[o + 1] = y; normal[o + 2] = z; }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(this.si), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.sw), 4));
    g.setIndex(vcount > 65535
      ? new THREE.BufferAttribute(new Uint32Array(index), 1)
      : new THREE.BufferAttribute(new Uint16Array(index), 1));
    for (const r of ranges) if (r.count > 0) g.addGroup(r.start, r.count, r.mat);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ------------------------------ primitives -------------------------------- */

/** Parallel-transport frames: Frenet frames spin on an S-curve and shear the rings. */
function frames(centers, upHint) {
  const n = centers.length;
  const T = [], R = [], U = [];
  const up = upHint || new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = centers[Math.max(0, i - 1)], b = centers[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-12) t.copy(T[i - 1] || new THREE.Vector3(0, 1, 0));
    T.push(t.normalize());
  }
  let r = new THREE.Vector3().crossVectors(up, T[0]);
  if (r.lengthSq() < 1e-8) r.crossVectors(new THREE.Vector3(0, 0, 1), T[0]);
  r.normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      _quat.setFromUnitVectors(T[i - 1], T[i]);
      r = r.clone().applyQuaternion(_quat);
      r.sub(_a.copy(T[i]).multiplyScalar(r.dot(T[i]))).normalize();
    }
    R.push(r.clone());
    U.push(new THREE.Vector3().crossVectors(T[i], r).normalize());
  }
  return { T, R, U };
}

/** Superellipse section. k=1 circle, k>1 squarer (armour plate), k<1 pinched. */
function sect(a, k) {
  const c = Math.cos(a), s = Math.sin(a);
  if (k === 1) return { u: c, v: s };
  const p = 2 / k;
  return { u: Math.sign(c) * Math.pow(Math.abs(c), p), v: Math.sign(s) * Math.pow(Math.abs(s), p) };
}

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Interpolate an authored weight ramp: [[t, {bone: amt}], ...] ascending in t. */
function ramp(t, stops) {
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const [ta, wa] = stops[i];
  const [tb, wb] = stops[Math.min(i + 1, stops.length - 1)];
  const f = tb > ta ? THREE.MathUtils.clamp((t - ta) / (tb - ta), 0, 1) : 0;
  const acc = {};
  for (const k in wa) acc[k] = (acc[k] || 0) + wa[k] * (1 - f);
  for (const k in wb) acc[k] = (acc[k] || 0) + wb[k] * f;
  const out = [];
  for (const k in acc) if (acc[k] > 1e-4) out.push([k, acc[k]]);
  return out;
}

/** Deterministic per-vertex tone jitter. Flat vertex colour is an auto-fail (§7.3). */
function tint(base, out, x, y, z, amount = TUNE.colorJitter) {
  const n = fbm2(x * 5.0 + 17, y * 5.0 + z * 3.3, { octaves: 3, seed: 12 });
  const m = valueNoise2(y * 11.0, z * 11.0 + x * 6.0, 29);
  const k = 1 + (n - 0.5) * 2 * amount + (m - 0.5) * amount * 0.8;
  out.setRGB(base.r * k, base.g * k, base.b * k);
  return out;
}

/**
 * Loft a tube along a polyline.
 * o: { centers, seg, rx, ry, shape, warp, groupAt, sgAt, colorAt, weightsAt, weightsAtVert,
 *      capStart, capEnd, uvScale, upHint, framesOverride }
 */
function loft(mb, o) {
  const centers = o.centers;
  const n = centers.length;
  const seg = o.seg ?? 14;
  const { T, R, U } = o.framesOverride || frames(centers, o.upHint);
  const shape = o.shape || ((a) => ({ u: Math.cos(a), v: Math.sin(a) }));
  const num = (x, i, t) => (typeof x === 'function' ? x(i, t) : Array.isArray(x) ? x[i] : x);
  const uvS = o.uvScale || [1, 1];
  const sg0 = o.sg ?? mb.newSg();

  const arc = [0];
  for (let i = 1; i < n; i++) arc.push(arc[i - 1] + centers[i].distanceTo(centers[i - 1]));
  const total = arc[n - 1] || 1;

  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const rx = num(o.rx, i, t), ry = num(o.ry ?? o.rx, i, t);
    if (o.groupAt) mb.group(o.groupAt(i, t));
    mb.sg(o.sgAt ? o.sgAt(i, t) : sg0);
    if (o.weightsAt) mb.weights(o.weightsAt(i, t));
    const row = [];
    for (let j = 0; j <= seg; j++) {
      const ang = (j % seg) / seg * Math.PI * 2;
      const s = shape(ang, i, t);
      const p = new THREE.Vector3().copy(centers[i])
        .addScaledVector(R[i], s.u * rx)
        .addScaledVector(U[i], s.v * ry);
      if (o.warp) o.warp(p, i, t, ang);
      row.push(mb.vert(p, (j / seg) * uvS[0], (arc[i] / total) * uvS[1],
        o.colorAt ? o.colorAt(i, t, ang, p) : null,
        o.weightsAtVert ? o.weightsAtVert(i, t, ang, p) : null));
    }
    rows.push(row);
  }

  for (let i = 0; i < n - 1; i++) {
    if (o.groupAt) mb.group(o.groupAt(i, i / (n - 1)));
    for (let j = 0; j < seg; j++) mb.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
  }

  if (o.capStart) cap(mb, rows[0], centers[0], T[0], true, o);
  if (o.capEnd) cap(mb, rows[n - 1], centers[n - 1], T[n - 1], false, o);
  return rows;
}

function cap(mb, row, centre, tangent, atStart, o) {
  if (o.groupAt) mb.group(o.groupAt(atStart ? 0 : 999, atStart ? 0 : 1));
  if (o.weightsAt) mb.weights(o.weightsAt(atStart ? 0 : 999, atStart ? 0 : 1));
  const c = mb.vert(_b.copy(centre).addScaledVector(tangent, atStart ? -0.001 : 0.001), 0.5, atStart ? 0 : 1);
  const seg = row.length - 1;
  for (let j = 0; j < seg; j++) {
    if (atStart) mb.tri(c, row[j + 1], row[j]);
    else mb.tri(c, row[j], row[j + 1]);
  }
}

/** Ellipsoid / dome / lens. phi −π/2 (bottom) → π/2 (top). */
function blob(mb, o) {
  const c = o.center, r = o.radii;
  const segT = o.segTheta ?? 16, segP = o.segPhi ?? 10;
  const p0 = o.phi0 ?? -Math.PI / 2, p1 = o.phi1 ?? Math.PI / 2;
  const basis = o.basis;
  if (o.group) mb.group(o.group);
  mb.sg(o.sg ?? mb.newSg());
  if (o.weights) mb.weights(o.weights);

  const rows = [];
  for (let ip = 0; ip <= segP; ip++) {
    const fp = ip / segP, phi = p0 + (p1 - p0) * fp;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const row = [];
    for (let it = 0; it <= segT; it++) {
      const ft = it / segT, th = ft * Math.PI * 2;
      const x = cp * Math.sin(th) * r.x, y = sp * r.y, z = cp * Math.cos(th) * r.z;
      const p = new THREE.Vector3();
      if (basis) p.copy(c).addScaledVector(basis.x, x).addScaledVector(basis.y, y).addScaledVector(basis.z, z);
      else p.set(c.x + x, c.y + y, c.z + z);
      if (o.warp) o.warp(p, ft, fp);
      row.push(mb.vert(p, ft, fp, o.colorAt?.(ft, fp, p), o.weightsAtVert?.(ft, fp, p)));
    }
    rows.push(row);
  }
  for (let ip = 0; ip < segP; ip++) {
    for (let it = 0; it < segT; it++) {
      const a = rows[ip][it], b = rows[ip][it + 1], cc = rows[ip + 1][it + 1], d = rows[ip + 1][it];
      if (ip === 0 && Math.abs(p0 + Math.PI / 2) < 1e-6) mb.tri(a, cc, d);
      else if (ip === segP - 1 && Math.abs(p1 - Math.PI / 2) < 1e-6) mb.tri(a, b, cc);
      else mb.quad(a, b, cc, d);
    }
  }
  return rows;
}

/** Parametric patch — nemes lappets, kilt panels, shield face, collar. */
function patch(mb, o) {
  const su = o.segU ?? 8, sv = o.segV ?? 6;
  if (o.group) mb.group(o.group);
  mb.sg(o.sg ?? mb.newSg());
  if (o.weights) mb.weights(o.weights);
  const rows = [];
  for (let iv = 0; iv <= sv; iv++) {
    const v = iv / sv, row = [];
    for (let iu = 0; iu <= su; iu++) {
      const u = iu / su;
      const p = o.at(u, v);
      row.push(mb.vert(p, u, v, o.colorAt?.(u, v, p), o.weightsAtVert?.(u, v, p)));
    }
    rows.push(row);
  }
  for (let iv = 0; iv < sv; iv++) {
    for (let iu = 0; iu < su; iu++) {
      if (o.flip) mb.quad(rows[iv][iu], rows[iv + 1][iu], rows[iv + 1][iu + 1], rows[iv][iu + 1]);
      else mb.quad(rows[iv][iu], rows[iv][iu + 1], rows[iv + 1][iu + 1], rows[iv + 1][iu]);
    }
  }
  return rows;
}

/** Box with six hard edges. Buckles, breastplate studs, sandal soles, blade facets. */
function hardBox(mb, o) {
  const c = o.center, h = o.half;
  const bx = o.basis?.x || new THREE.Vector3(1, 0, 0);
  const by = o.basis?.y || new THREE.Vector3(0, 1, 0);
  const bz = o.basis?.z || new THREE.Vector3(0, 0, 1);
  if (o.group) mb.group(o.group);
  if (o.weights) mb.weights(o.weights);
  if (o.color) mb.color(o.color);
  const P = (sx, sy, sz) => new THREE.Vector3().copy(c)
    .addScaledVector(bx, sx * h.x).addScaledVector(by, sy * h.y).addScaledVector(bz, sz * h.z);
  const k = [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1),
             P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  for (const f of faces) {
    mb.sg(mb.newSg());
    const idx = f.map((q, m) => mb.vert(k[q], (m === 1 || m === 2) ? 1 : 0, (m >= 2) ? 1 : 0));
    mb.quad(idx[0], idx[1], idx[2], idx[3]);
  }
}

/** Curved tapered spike — fur tufts on the jackal's ruff, mane bristles, mandibles. */
function spike(mb, o) {
  const base = o.base;
  const dir = _a.copy(o.dir).normalize().clone();
  const side = new THREE.Vector3().crossVectors(dir, o.up || new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-8) side.crossVectors(dir, new THREE.Vector3(1, 0, 0));
  side.normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const bend = (o.bendDir ? o.bendDir.clone().normalize() : up.clone()).multiplyScalar(o.length * (o.bend ?? 0.25));

  if (o.group) mb.group(o.group);
  mb.sg(o.sg ?? mb.newSg());
  if (o.weights) mb.weights(o.weights);
  if (o.color) mb.color(o.color);

  const ring = [], mid = [];
  for (let j = 0; j < 4; j++) {
    const ang = (j / 4) * Math.PI * 2 + Math.PI / 4;
    ring.push(mb.vert(new THREE.Vector3().copy(base)
      .addScaledVector(side, Math.cos(ang) * o.width)
      .addScaledVector(up, Math.sin(ang) * o.width * (o.flat ?? 1)), j / 4, 0));
  }
  const midC = new THREE.Vector3().copy(base).addScaledVector(dir, o.length * 0.5).addScaledVector(bend, 0.25);
  for (let j = 0; j < 4; j++) {
    const ang = (j / 4) * Math.PI * 2 + Math.PI / 4;
    mid.push(mb.vert(new THREE.Vector3().copy(midC)
      .addScaledVector(side, Math.cos(ang) * o.width * 0.52)
      .addScaledVector(up, Math.sin(ang) * o.width * 0.52 * (o.flat ?? 1)), j / 4, 0.5));
  }
  const tip = mb.vert(new THREE.Vector3().copy(base).addScaledVector(dir, o.length).add(bend), 0.5, 1);
  for (let j = 0; j < 4; j++) {
    const q = (j + 1) % 4;
    mb.quad(ring[j], ring[q], mid[q], mid[j]);
    mb.tri(mid[j], mid[q], tip);
  }
}

/* ======================================================================== */
/*  Type specs                                                               */
/* ======================================================================== */

/**
 * One spec per guard type. Every landmark the builder needs lives here, so retuning the
 * silhouette is a matter of editing numbers rather than reading geometry code.
 *
 * The proportion story for both humanoids: **legs are ~30% of total height**, the chest is
 * nearly as wide as it is tall, the head is ~1:4.7 of the body, and the hands are the size
 * of the head. That combination is what makes a 2 m soldier read as a cartoon bruiser.
 */
const SPECS = {
  temple: {
    height: 2.02,
    /* [y, halfX, halfZ, zOffset] — hips → neck */
    torso: [
      [0.505, 0.170, 0.132, 0.000],
      [0.560, 0.192, 0.150, 0.000],
      [0.640, 0.196, 0.152, 0.006],
      [0.730, 0.180, 0.140, 0.012],
      [0.840, 0.196, 0.146, 0.010],
      [0.960, 0.232, 0.164, 0.002],
      [1.075, 0.272, 0.178, -0.012],
      [1.180, 0.298, 0.182, -0.020],
      [1.275, 0.300, 0.176, -0.022],
      [1.355, 0.256, 0.150, -0.012],
      [1.425, 0.156, 0.118, 0.000],
      [1.490, 0.118, 0.106, 0.010],
      [1.545, 0.116, 0.106, 0.014],
    ],
    hipY: 0.62, spineY: 0.80, chestY: 1.13, neckY: 1.45, headY: 1.60,
    shoulderY: 1.315, shoulderX: 0.115,
    armX: 0.300, armY: 1.300,
    elbowX: 0.398, elbowY: 0.955,
    handX: 0.452, handY: 0.662,
    legX: 0.118, kneeY: 0.330, ankleY: 0.108, toeZ: 0.170,
    headC: [0, 1.760, -0.010], headR: [0.222, 0.206, 0.232],
    snoutLen: 0.40, earLen: 0.30,
    kiltTop: 0.660, kiltBot: 0.300, kiltFlare: 1.55,
    footLen: 0.330, footW: 0.128,
    fur: PAL.furMid, furLight: PAL.furLight, furDark: PAL.furDark,
  },

  heavy: {
    height: 2.34,
    torso: [
      [0.480, 0.215, 0.170, 0.000],
      [0.545, 0.250, 0.198, 0.000],
      [0.640, 0.272, 0.216, 0.010],
      [0.760, 0.288, 0.228, 0.020],
      [0.890, 0.320, 0.244, 0.018],
      [1.030, 0.362, 0.256, 0.006],
      [1.170, 0.396, 0.262, -0.010],
      [1.300, 0.410, 0.258, -0.022],
      [1.420, 0.392, 0.238, -0.028],
      [1.520, 0.320, 0.194, -0.018],
      [1.600, 0.196, 0.150, -0.002],
      [1.665, 0.150, 0.134, 0.008],
      [1.720, 0.148, 0.134, 0.012],
    ],
    hipY: 0.60, spineY: 0.82, chestY: 1.22, neckY: 1.62, headY: 1.78,
    shoulderY: 1.480, shoulderX: 0.150,
    armX: 0.398, armY: 1.455,
    elbowX: 0.512, elbowY: 1.045,
    handX: 0.575, handY: 0.700,
    legX: 0.152, kneeY: 0.318, ankleY: 0.112, toeZ: 0.195,
    headC: [0, 1.955, 0.010], headR: [0.250, 0.222, 0.250],
    snoutLen: 0.30, earLen: 0.10,
    kiltTop: 0.640, kiltBot: 0.310, kiltFlare: 1.42,
    footLen: 0.380, footW: 0.156,
    fur: PAL.hideMid, furLight: PAL.hideLight, furDark: PAL.hideDark,
  },
};

/* ======================================================================== */
/*  Skeletons                                                                */
/* ======================================================================== */

/** [name, parent, [x, y, z]] in bind-pose model space. Bones carry no bind rotation, so a
    pose authored as Euler XYZ reads as world-axis rotation at the joint — hand-tunable. */
function humanoidSkeleton(S) {
  const legK = TUNE.legShorten, shK = TUNE.shoulderWidth;
  const sx = S.shoulderX * shK, ax = S.armX * shK, ex = S.elbowX * shK, hx = S.handX * shK;
  const list = [
    ['hips', 'root', [0, S.hipY, -0.005]],
    ['spine', 'hips', [0, S.spineY, 0.004]],
    ['chest', 'spine', [0, S.chestY, -0.008]],
    ['neck', 'chest', [0, S.neckY, 0.004]],
    ['head', 'neck', [0, S.headY, 0.010]],
    ['jaw', 'head', [0, S.headC[1] - 0.055, S.headR[2] * 0.30]],
    ['snout', 'head', [0, S.headC[1] - 0.010, S.headR[2] * 0.55]],
    ['earL', 'head', [0.105, S.headC[1] + S.headR[1] * 0.72, -0.045]],
    ['earR', 'head', [-0.105, S.headC[1] + S.headR[1] * 0.72, -0.045]],
    ['nemesL', 'head', [S.headR[0] * 0.86, S.headC[1] - 0.030, 0.030]],
    ['nemesR', 'head', [-S.headR[0] * 0.86, S.headC[1] - 0.030, 0.030]],
    ['nemesB', 'head', [0, S.headC[1] - 0.020, -S.headR[2] * 0.86]],
  ];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    list.push(
      [`shoulder${L}`, 'chest', [s * sx, S.shoulderY, 0.000]],
      [`upperArm${L}`, `shoulder${L}`, [s * ax, S.armY, 0.000]],
      [`lowerArm${L}`, `upperArm${L}`, [s * ex, S.elbowY, 0.016]],
      [`hand${L}`, `lowerArm${L}`, [s * hx, S.handY, 0.034]],
      [`upperLeg${L}`, 'hips', [s * S.legX, S.hipY - 0.030, 0.000]],
      [`lowerLeg${L}`, `upperLeg${L}`, [s * S.legX, S.kneeY * legK, 0.012]],
      [`foot${L}`, `lowerLeg${L}`, [s * S.legX, S.ankleY * legK, -0.020]],
      [`toe${L}`, `foot${L}`, [s * S.legX, S.ankleY * legK * 0.55, S.toeZ]],
    );
  }
  list.push(
    ['kiltF', 'hips', [0, S.kiltTop - 0.05, 0.12]],
    ['kiltB', 'hips', [0, S.kiltTop - 0.05, -0.12]],
    ['tailA', 'hips', [0, S.hipY - 0.030, -0.155]],
    ['tailB', 'tailA', [0, S.hipY - 0.190, -0.330]],
  );
  return list;
}

const SCARAB_SKELETON = [
  ['body', 'root', [0, 0.185, 0]],
  ['headS', 'body', [0, 0.150, 0.235]],
  ['antL', 'headS', [0.060, 0.185, 0.315]],
  ['antR', 'headS', [-0.060, 0.185, 0.315]],
  ['legL0', 'body', [0.135, 0.140, 0.150]],
  ['legL1', 'body', [0.150, 0.140, 0.000]],
  ['legL2', 'body', [0.135, 0.140, -0.150]],
  ['legR0', 'body', [-0.135, 0.140, 0.150]],
  ['legR1', 'body', [-0.150, 0.140, 0.000]],
  ['legR2', 'body', [-0.135, 0.140, -0.150]],
];

/* ======================================================================== */
/*  Humanoid build                                                           */
/* ======================================================================== */

function torsoAt(S, y) {
  const T = S.torso;
  for (let i = 0; i < T.length - 1; i++) {
    if (y <= T[i + 1][0] || i === T.length - 2) {
      const f = THREE.MathUtils.clamp((y - T[i][0]) / (T[i + 1][0] - T[i][0]), 0, 1);
      return {
        rx: THREE.MathUtils.lerp(T[i][1], T[i + 1][1], f),
        rz: THREE.MathUtils.lerp(T[i][2], T[i + 1][2], f),
        cz: THREE.MathUtils.lerp(T[i][3], T[i + 1][3], f),
      };
    }
  }
  return { rx: T[0][1], rz: T[0][2], cz: T[0][3] };
}

function spineRamp(S) {
  const h = S.hipY, sp = S.spineY, ch = S.chestY, nk = S.neckY;
  return [
    [S.torso[0][0], { hips: 1 }],
    [h, { hips: 1 }],
    [(h + sp) / 2, { hips: 0.55, spine: 0.45 }],
    [sp, { spine: 1 }],
    [(sp + ch) / 2, { spine: 0.45, chest: 0.55 }],
    [ch, { chest: 1 }],
    [nk - 0.10, { chest: 1 }],
    [nk, { chest: 0.45, neck: 0.55 }],
    [nk + 0.06, { neck: 1 }],
    [S.headC[1] - 0.10, { neck: 0.4, head: 0.6 }],
    [S.headC[1], { head: 1 }],
  ];
}

/**
 * Torso weights, plus the two hand fixes that automatic weighting never gets right:
 *  · the deltoid window drags the shoulder cap into shoulderL/R, so raising an arm on a
 *    guard this broad doesn't shear a triangular hole out of the chest;
 *  · everything below the belt is pinned to `hips` and denied to `spine`, so the hip waddle
 *    that sells "bumbling" doesn't pull the kilt into an hourglass.
 */
function torsoWeights(S, p, RAMP) {
  const w = ramp(p.y, RAMP);
  const ax = Math.abs(p.x);
  const win = smooth(S.shoulderX * 0.5, S.armX * 0.92, ax)
    * smooth(S.shoulderY - 0.19, S.shoulderY - 0.06, p.y)
    * (1 - smooth(S.shoulderY + 0.02, S.shoulderY + 0.11, p.y));
  if (win > 0.01) {
    const s = win * 0.66;
    const name = p.x > 0 ? 'shoulderL' : 'shoulderR';
    const out = [];
    for (const [b, a] of w) out.push([b, a * (1 - s)]);
    out.push([name, s]);
    return out;
  }
  return w;
}

function buildTorso(mb, S, cfg) {
  const T = S.torso;
  const RAMP = spineRamp(S);
  const centers = T.map(([y, , , cz]) => new THREE.Vector3(0, y, cz));
  const sgBody = mb.newSg(), sgNeck = mb.newSg();
  const neckStart = S.neckY + 0.02;

  loft(mb, {
    centers, seg: TUNE.segTorso,
    rx: (i) => T[i][1], ry: (i) => T[i][2],
    upHint: new THREE.Vector3(0, 0, 1),
    // A squarer section reads as a ribcage with a flat back; a circle reads as a barrel.
    shape: (a, i) => {
      const s = sect(a, 1.22);
      const chest = smooth(S.chestY - 0.10, S.chestY + 0.06, T[i][0]);
      const belly = 1 - smooth(S.spineY - 0.12, S.spineY + 0.10, T[i][0]);
      s.v *= 1 + 0.07 * chest * Math.max(0, Math.cos(a)) + 0.10 * belly * Math.max(0, Math.cos(a));
      return s;
    },
    groupAt: () => 'body',
    sgAt: (i) => (T[i][0] >= neckStart ? sgNeck : sgBody),
    colorAt: (i, t, a, p) => {
      // Pale linen/belly on the front, hide on the back — the tonal break that stops the
      // torso reading as one extruded tube.
      const front = Math.max(0, Math.cos(a));
      _col.set(cfg.hide).lerp(new THREE.Color(cfg.belly), front * 0.55 * smooth(1.30, 1.05, p.y));
      return tint(_col, _col, p.x, p.y, p.z);
    },
    weightsAtVert: (i, t, a, p) => torsoWeights(S, p, RAMP),
    capStart: true,
    uvScale: [3, 2.2],
  });
}

/** Broad collar (wesekh). Gold + lapis + carnelian bands over the shoulders — the hero read. */
function buildCollar(mb, S) {
  const top = S.neckY - 0.010, bot = S.chestY - 0.010;
  const RAMP = spineRamp(S);
  patch(mb, {
    segU: 30, segV: 5, group: 'metal', sg: mb.newSg(),
    at: (u, v) => {
      const th = u * Math.PI * 2;
      // Deeper at the front than the back, and it flares outward as it drops.
      const front = Math.max(0, Math.cos(th));
      const y = THREE.MathUtils.lerp(top, bot + 0.035 * (1 - front), v);
      const r = torsoAt(S, y);
      const k = 1.045 + 0.055 * v;
      return new THREE.Vector3(Math.sin(th) * r.rx * k, y, r.cz + Math.cos(th) * r.rz * k);
    },
    colorAt: (u, v, p) => {
      const band = Math.floor(v * 4.999);
      const c = [PAL.gold, PAL.lapis, PAL.turquoise, PAL.carnelian, PAL.gold][band];
      return tint(_col.set(c), _col, p.x, p.y, p.z, 0.07);
    },
    weightsAtVert: (u, v, p) => ramp(p.y, RAMP),
  });
}

function buildArm(mb, S, side, cfg) {
  const L = side > 0 ? 'L' : 'R';
  const shK = TUNE.shoulderWidth;
  const sx = S.shoulderX * shK, ax = S.armX * shK, ex = S.elbowX * shK, hx = S.handX * shK;
  // Key rings, ≥3 straddling each joint so a 100° elbow bend never creases.
  const key = [
    [0.00, new THREE.Vector3(side * sx * 0.65, S.shoulderY + 0.010, 0.000), S.torso[7][2] * 0.52],
    [0.12, new THREE.Vector3(side * (sx + (ax - sx) * 0.32), S.shoulderY - 0.004, 0.000), S.torso[7][2] * 0.62],
    [0.26, new THREE.Vector3(side * ax, S.armY, 0.000), S.torso[7][2] * 0.58],
    [0.42, new THREE.Vector3(side * (ax + (ex - ax) * 0.42), S.armY - (S.armY - S.elbowY) * 0.42, 0.006), S.torso[7][2] * 0.46],
    [0.58, new THREE.Vector3(side * (ax + (ex - ax) * 0.78), S.armY - (S.armY - S.elbowY) * 0.80, 0.012), S.torso[7][2] * 0.38],
    [0.66, new THREE.Vector3(side * ex, S.elbowY, 0.016), S.torso[7][2] * 0.40],
    [0.76, new THREE.Vector3(side * (ex + (hx - ex) * 0.36), S.elbowY - (S.elbowY - S.handY) * 0.36, 0.022), S.torso[7][2] * 0.36],
    [0.88, new THREE.Vector3(side * (ex + (hx - ex) * 0.72), S.elbowY - (S.elbowY - S.handY) * 0.74, 0.030), S.torso[7][2] * 0.32],
    [1.00, new THREE.Vector3(side * hx, S.handY, 0.034), S.torso[7][2] * 0.34],
  ];
  const ts = key.map((k) => k[0]);
  const ARM = [
    [0.00, { [`shoulder${L}`]: 0.55, chest: 0.45 }],
    [0.12, { [`shoulder${L}`]: 0.88, chest: 0.12 }],
    [0.26, { [`shoulder${L}`]: 0.42, [`upperArm${L}`]: 0.58 }],
    [0.42, { [`upperArm${L}`]: 1 }],
    [0.58, { [`upperArm${L}`]: 0.72, [`lowerArm${L}`]: 0.28 }],
    [0.66, { [`upperArm${L}`]: 0.42, [`lowerArm${L}`]: 0.58 }],
    [0.76, { [`lowerArm${L}`]: 1 }],
    [0.88, { [`lowerArm${L}`]: 1 }],
    [1.00, { [`lowerArm${L}`]: 0.40, [`hand${L}`]: 0.60 }],
  ];

  loft(mb, {
    centers: key.map((k) => k[1]), seg: TUNE.segLimb,
    rx: (i) => key[i][2],
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => sect(a, 1.06),
    groupAt: () => 'body',
    sgAt: () => 300 + (side > 0 ? 0 : 1),
    colorAt: (i, t, a, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
    weightsAt: (i) => ramp(ts[Math.min(i, ts.length - 1)], ARM),
    capStart: true,
    uvScale: [2, 2],
  });

  // Deltoid cap. Nothing automatic can invent this volume, and without it a raised arm
  // exposes the seam where the arm meets a chest this wide.
  blob(mb, {
    center: new THREE.Vector3(side * (sx + (ax - sx) * 0.55), S.shoulderY - 0.005, -0.004),
    radii: new THREE.Vector3(S.torso[7][2] * 0.70, S.torso[7][2] * 0.66, S.torso[7][2] * 0.70),
    segTheta: 14, segPhi: 9, group: 'body', sg: mb.newSg(),
    weights: [[`shoulder${L}`, 0.80], ['chest', 0.20]],
    colorAt: (u, v, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
  });

  // Bronze armlet just above the elbow — reads as uniform, and breaks the limb tube in two.
  const armletAt = 0.50;
  const ai = 4;
  loft(mb, {
    centers: [
      key[ai][1].clone().addScaledVector(new THREE.Vector3(side * 0.1, -1, 0).normalize(), -0.045),
      key[ai][1].clone(),
      key[ai][1].clone().addScaledVector(new THREE.Vector3(side * 0.1, -1, 0).normalize(), 0.045),
    ],
    seg: TUNE.segLimb,
    rx: [key[ai][2] * 1.06, key[ai][2] * 1.18, key[ai][2] * 1.06],
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => sect(a, 1.35),
    groupAt: () => 'metal',
    sgAt: (i) => 320 + i,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronze), _col, p.x, p.y, p.z, 0.08),
    weightsAt: () => ramp(armletAt, ARM),
  });
}

/** Huge mitts. The hands sell every gesture, so they get a palm, three fat fingers and a thumb. */
function buildHand(mb, S, side, cfg) {
  const L = side > 0 ? 'L' : 'R';
  const shK = TUNE.shoulderWidth;
  const wrist = new THREE.Vector3(side * S.handX * shK, S.handY, 0.034);
  const dir = new THREE.Vector3(side * 0.34, -0.90, 0.24).normalize();
  const fwd = new THREE.Vector3(0, 0.22, 0.97).normalize();
  const nx = new THREE.Vector3().crossVectors(dir, fwd).normalize();
  const H = 0.108 * TUNE.handScale * (S.height / 2.02);
  const palm = wrist.clone().addScaledVector(dir, H * 0.72);
  const W = [[`hand${L}`, 1]];

  blob(mb, {
    center: palm,
    radii: new THREE.Vector3(H * 0.56, H * 0.96, H * 0.82),
    basis: { x: nx, y: dir, z: fwd },
    segTheta: 14, segPhi: 9, group: 'body', sg: mb.newSg(), weights: W,
    colorAt: (u, v, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
  });

  const fingers = [[-0.62, 0.98], [0.0, 1.12], [0.62, 1.0]];
  for (const [off, len] of fingers) {
    const base = palm.clone().addScaledVector(dir, H * 0.72).addScaledVector(fwd, off * H * 0.52);
    const fd = dir.clone().addScaledVector(fwd, off * 0.22).normalize();
    const pts = [base.clone(),
      base.clone().addScaledVector(fd, H * len * 0.42),
      base.clone().addScaledVector(fd, H * len * 0.78),
      base.clone().addScaledVector(fd, H * len)];
    loft(mb, {
      centers: pts, seg: 7,
      rx: [H * 0.30, H * 0.29, H * 0.26, H * 0.18],
      framesOverride: { T: [fd, fd, fd, fd], R: [fwd, fwd, fwd, fwd], U: [nx, nx, nx, nx] },
      groupAt: () => 'body', sgAt: () => 340,
      colorAt: (i, t, a, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
      weightsAt: () => W, capEnd: true,
    });
  }
  const tb = palm.clone().addScaledVector(fwd, H * 0.72).addScaledVector(dir, -H * 0.12);
  const td = fwd.clone().multiplyScalar(0.82).addScaledVector(dir, 0.44).addScaledVector(nx, -side * 0.16).normalize();
  loft(mb, {
    centers: [tb.clone(), tb.clone().addScaledVector(td, H * 0.34),
      tb.clone().addScaledVector(td, H * 0.60), tb.clone().addScaledVector(td, H * 0.80)],
    seg: 7,
    rx: [H * 0.34, H * 0.32, H * 0.28, H * 0.19],
    framesOverride: { T: [td, td, td, td], R: [nx, nx, nx, nx], U: [dir, dir, dir, dir] },
    groupAt: () => 'body', sgAt: () => 342,
    colorAt: (i, t, a, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
    weightsAt: () => W, capEnd: true,
  });

  // Bronze wrist cuff — hard-edged, so the glove/hand boundary is a line and not a fade.
  loft(mb, {
    centers: [wrist.clone().addScaledVector(dir, -H * 0.30),
      wrist.clone().addScaledVector(dir, -H * 0.02),
      wrist.clone().addScaledVector(dir, H * 0.22)],
    seg: TUNE.segLimb,
    rx: [H * 0.60, H * 0.72, H * 0.66],
    framesOverride: { T: [dir, dir, dir], R: [fwd, fwd, fwd], U: [nx, nx, nx] },
    groupAt: () => 'metal', sgAt: (i) => 350 + i,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronze), _col, p.x, p.y, p.z, 0.08),
    weightsAt: () => [[`lowerArm${L}`, 0.30], [`hand${L}`, 0.70]],
  });
}

function buildLeg(mb, S, side, cfg) {
  const L = side > 0 ? 'L' : 'R';
  const legK = TUNE.legShorten;
  const hipY = S.hipY - 0.030, kneeY = S.kneeY * legK, ankY = S.ankleY * legK;
  const r0 = S.torso[1][2] * 0.86;
  const key = [
    [0.00, new THREE.Vector3(side * S.legX, hipY + 0.045, 0.004), r0 * 1.02],
    [0.18, new THREE.Vector3(side * S.legX, THREE.MathUtils.lerp(hipY, kneeY, 0.22), 0.008), r0 * 0.92],
    [0.40, new THREE.Vector3(side * S.legX * 1.02, THREE.MathUtils.lerp(hipY, kneeY, 0.62), 0.012), r0 * 0.78],
    [0.55, new THREE.Vector3(side * S.legX * 1.04, kneeY, 0.010), r0 * 0.74],
    [0.68, new THREE.Vector3(side * S.legX * 1.06, THREE.MathUtils.lerp(kneeY, ankY, 0.30), -0.004), r0 * 0.78],
    [0.84, new THREE.Vector3(side * S.legX * 1.08, THREE.MathUtils.lerp(kneeY, ankY, 0.66), -0.014), r0 * 0.62],
    [1.00, new THREE.Vector3(side * S.legX * 1.08, ankY, -0.020), r0 * 0.54],
  ];
  const ts = key.map((k) => k[0]);
  const RAMP = [
    [0.00, { hips: 0.45, [`upperLeg${L}`]: 0.55 }],
    [0.18, { [`upperLeg${L}`]: 1 }],
    [0.40, { [`upperLeg${L}`]: 1 }],
    [0.48, { [`upperLeg${L}`]: 0.70, [`lowerLeg${L}`]: 0.30 }],
    [0.55, { [`upperLeg${L}`]: 0.42, [`lowerLeg${L}`]: 0.58 }],
    [0.68, { [`lowerLeg${L}`]: 1 }],
    [0.84, { [`lowerLeg${L}`]: 1 }],
    [1.00, { [`lowerLeg${L}`]: 0.55, [`foot${L}`]: 0.45 }],
  ];

  loft(mb, {
    centers: key.map((k) => k[1]), seg: TUNE.segLimb,
    // key rows are [t, centre, radius] — index 3 does not exist, and reading it fed
    // `undefined` into every ring radius, which made the entire leg NaN.
    rx: (i) => key[i][2],
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => sect(a, 1.08),
    groupAt: () => 'body',
    sgAt: () => 400 + (side > 0 ? 0 : 1),
    colorAt: (i, t, a, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
    weightsAt: (i) => ramp(ts[Math.min(i, ts.length - 1)], RAMP),
    capStart: true, uvScale: [2, 2],
  });
}

/** Slab feet with a hard sandal sole. Big feet give the stance a base and read as cartoon. */
function buildFoot(mb, S, side, cfg) {
  const L = side > 0 ? 'L' : 'R';
  const legK = TUNE.legShorten, F = TUNE.footScale;
  const x = side * S.legX * 1.08;
  const ankY = S.ankleY * legK;
  const len = S.footLen * F, w = S.footW * F;
  const prof = [
    [-0.34, 0.72, 0.62, 0.86],
    [-0.10, 0.98, 0.90, 0.72],
    [0.16, 1.02, 0.86, 0.60],
    [0.44, 0.96, 0.74, 0.52],
    [0.70, 0.84, 0.60, 0.46],
    [0.90, 0.62, 0.42, 0.42],
    [1.00, 0.34, 0.22, 0.40],
  ];
  const SOLE = 0.026;
  const wt = (i, t) => (t < 0.66 ? [[`foot${L}`, 1]]
    : [[`foot${L}`, 1 - (t - 0.66) / 0.34 * 0.8], [`toe${L}`, (t - 0.66) / 0.34 * 0.8]]);

  loft(mb, {
    centers: prof.map(([z, , , cy]) => new THREE.Vector3(x, ankY * cy + SOLE, z * len)),
    seg: 14,
    rx: (i) => prof[i][1] * w,
    ry: (i) => prof[i][2] * ankY * 0.92,
    upHint: new THREE.Vector3(0, 1, 0),
    shape: (a) => sect(a, 1.55),
    warp: (p) => { if (p.y < SOLE + 0.012) p.y = SOLE + 0.012; },
    groupAt: () => 'body',
    sgAt: () => 420 + (side > 0 ? 0 : 1),
    colorAt: (i, t, a, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
    weightsAt: wt,
    capStart: true, capEnd: true,
  });

  // Sole slab: its own smoothing group and a near-square section ⇒ a hard welt line.
  loft(mb, {
    centers: prof.map(([z]) => new THREE.Vector3(x, SOLE * 0.55, z * len)),
    seg: 10,
    rx: (i) => prof[i][1] * w * 1.10,
    ry: () => SOLE * 0.62,
    upHint: new THREE.Vector3(0, 1, 0),
    shape: (a) => sect(a, 2.6),
    groupAt: () => 'body',
    sgAt: () => 424 + (side > 0 ? 0 : 1),
    colorAt: (i, t, a, p) => tint(_col.set(PAL.leather), _col, p.x, p.y, p.z, 0.09),
    weightsAt: wt,
    capStart: true, capEnd: true,
  });

  // Sandal thong across the instep.
  loft(mb, {
    centers: [
      new THREE.Vector3(x - w * 0.9, ankY * 0.34, len * 0.20),
      new THREE.Vector3(x, ankY * 0.90, len * 0.14),
      new THREE.Vector3(x + w * 0.9, ankY * 0.34, len * 0.20),
    ],
    seg: 6, rx: 0.014, ry: 0.026,
    groupAt: () => 'body', sgAt: () => 428,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.leather), _col, p.x, p.y, p.z, 0.09),
    weightsAt: wt, capStart: true, capEnd: true,
  });
}

/** The shendyt: a flared linen kilt with a stiff pleated front apron. Big silhouette shape. */
function buildKilt(mb, S) {
  const top = S.kiltTop, bot = S.kiltBot;
  const rTop = torsoAt(S, top);
  const flare = S.kiltFlare;
  const sgK = mb.newSg();

  loft(mb, {
    centers: [
      new THREE.Vector3(0, top + 0.03, rTop.cz),
      new THREE.Vector3(0, top - 0.02, rTop.cz),
      new THREE.Vector3(0, THREE.MathUtils.lerp(top, bot, 0.42), rTop.cz + 0.010),
      new THREE.Vector3(0, THREE.MathUtils.lerp(top, bot, 0.78), rTop.cz + 0.018),
      new THREE.Vector3(0, bot, rTop.cz + 0.022),
      new THREE.Vector3(0, bot - 0.030, rTop.cz + 0.022),
    ],
    seg: 22,
    rx: (i) => rTop.rx * [1.02, 1.06, 1.24, 1.44, flare, flare * 0.98][i],
    ry: (i) => rTop.rz * [1.02, 1.06, 1.22, 1.40, flare * 0.94, flare * 0.92][i],
    upHint: new THREE.Vector3(0, 0, 1),
    // Pleats: a fine radial ripple that catches the cel terminator and reads as folded linen.
    shape: (a, i) => {
      const s = sect(a, 1.16);
      const k = 1 + 0.030 * Math.sin(a * 13) * (i / 5);
      return { u: s.u * k, v: s.v * k };
    },
    groupAt: () => 'body',
    sgAt: (i) => (i <= 1 ? sgK : sgK + 1),
    colorAt: (i, t, a, p) => tint(_col.set(PAL.linen).lerp(new THREE.Color(PAL.linenShade), t * 0.45),
      _col, p.x, p.y, p.z, 0.05),
    weightsAt: (i, t) => (t < 0.22
      ? [['hips', 1]]
      : [['hips', 1 - t * 0.55], ['kiltF', t * 0.30], ['kiltB', t * 0.25]]),
    capEnd: true,
  });

  // Front apron — a stiff trapezoid that projects forward, the classic shendyt read.
  patch(mb, {
    segU: 7, segV: 6, group: 'body', sg: mb.newSg(),
    at: (u, v) => {
      const y = THREE.MathUtils.lerp(top + 0.01, bot - 0.10, v);
      const halfW = THREE.MathUtils.lerp(rTop.rx * 0.44, rTop.rx * 0.82, v);
      const z = rTop.cz + THREE.MathUtils.lerp(rTop.rz * 1.10, rTop.rz * flare * 1.16, v * v);
      const bulge = 0.018 * Math.sin(u * Math.PI) * (0.3 + v);
      return new THREE.Vector3((u * 2 - 1) * halfW, y, z + bulge);
    },
    colorAt: (u, v, p) => {
      const stripe = Math.floor(u * 7) % 2 === 0 ? PAL.linen : PAL.linenShade;
      return tint(_col.set(stripe), _col, p.x, p.y, p.z, 0.05);
    },
    weightsAtVert: (u, v) => (v < 0.25 ? [['hips', 1]] : [['hips', 1 - v * 0.6], ['kiltF', v * 0.6]]),
  });

  // Gold belt over the kilt waist.
  loft(mb, {
    centers: [new THREE.Vector3(0, top + 0.055, rTop.cz), new THREE.Vector3(0, top + 0.005, rTop.cz)],
    seg: 22,
    rx: (i) => rTop.rx * (i === 0 ? 1.06 : 1.09),
    ry: (i) => rTop.rz * (i === 0 ? 1.06 : 1.09),
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => sect(a, 1.20),
    groupAt: () => 'metal', sgAt: (i) => 460 + i,
    colorAt: (i, t, a, p) => tint(_col.set(i === 0 ? PAL.goldLight : PAL.gold), _col, p.x, p.y, p.z, 0.09),
    weightsAt: () => [['hips', 1]],
  });
}

/* ------------------------------ heads ------------------------------------- */

/** Jackal head: long wedge muzzle, tall triangular ears, hooded brow. Anubis in a nemes. */
function buildJackalHead(mb, S, cfg) {
  const C = new THREE.Vector3().fromArray(S.headC);
  const R = new THREE.Vector3().fromArray(S.headR).multiplyScalar(TUNE.headScale);
  const HW = [['head', 1]];
  const jawW = (p) => {
    const j = smooth(C.y + 0.02, C.y - 0.12, p.y) * smooth(R.z * 0.25, R.z * 0.85, p.z) * 0.65;
    return j < 0.02 ? HW : [['head', 1 - j], ['jaw', j]];
  };

  // cranium
  blob(mb, {
    center: C, radii: R, segTheta: TUNE.segHead, segPhi: 13,
    group: 'body', sg: mb.newSg(),
    weights: HW,
    warp: (p, ft, fp) => {
      // flatten the cheeks and give the brow a shelf over the eyes
      const front = Math.max(0, (p.z - C.z) / R.z);
      p.z += front * front * 0.02;
      const brow = smooth(0.62, 0.78, fp) * (1 - smooth(0.80, 0.94, fp));
      p.z += brow * front * 0.030;
      p.y -= brow * 0.006;
    },
    colorAt: (u, v, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
    weightsAtVert: (u, v, p) => jawW(p),
  });

  // muzzle — long, straight-sided wedge; the single strongest species read
  const sn = S.snoutLen;
  const mz = [
    [new THREE.Vector3(0, C.y - 0.015, C.z + R.z * 0.42), 0.128, 0.116],
    [new THREE.Vector3(0, C.y - 0.026, C.z + R.z * 0.42 + sn * 0.24), 0.116, 0.104],
    [new THREE.Vector3(0, C.y - 0.042, C.z + R.z * 0.42 + sn * 0.52), 0.094, 0.086],
    [new THREE.Vector3(0, C.y - 0.058, C.z + R.z * 0.42 + sn * 0.78), 0.074, 0.070],
    [new THREE.Vector3(0, C.y - 0.070, C.z + R.z * 0.42 + sn * 0.96), 0.058, 0.056],
    [new THREE.Vector3(0, C.y - 0.078, C.z + R.z * 0.42 + sn * 1.03), 0.030, 0.030],
  ];
  loft(mb, {
    centers: mz.map((m) => m[0]), seg: 16,
    rx: (i) => mz[i][1] * TUNE.headScale,
    ry: (i) => mz[i][2] * TUNE.headScale,
    upHint: new THREE.Vector3(0, 1, 0),
    shape: (a) => sect(a, 1.28),
    groupAt: () => 'body', sgAt: () => 520,
    colorAt: (i, t, a, p) => tint(_col.set(cfg.hide).lerp(new THREE.Color(cfg.dark), t * 0.55),
      _col, p.x, p.y, p.z),
    weightsAtVert: (i, t, a, p) => jawW(p),
    capStart: true, capEnd: true, uvScale: [2, 2],
  });

  // wet nose
  blob(mb, {
    center: new THREE.Vector3(0, C.y - 0.070, C.z + R.z * 0.42 + sn * 1.02),
    radii: new THREE.Vector3(0.040, 0.032, 0.034),
    segTheta: 12, segPhi: 8, group: 'body', sg: mb.newSg(), weights: [['jaw', 0.5], ['head', 0.5]],
    colorAt: () => _col.set(PAL.ink),
  });

  // ears — tall, triangular, slightly splayed and asymmetric so the head isn't a mirror
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const base = new THREE.Vector3(s * R.x * 0.50, C.y + R.y * 0.66, -R.z * 0.16);
    const lean = s > 0 ? 0.12 : 0.05;
    const tip = base.clone().add(new THREE.Vector3(s * (0.10 + lean), S.earLen, -0.045));
    patch(mb, {
      segU: 5, segV: 5, group: 'body', sg: mb.newSg(),
      at: (u, v) => {
        const along = base.clone().lerp(tip, v);
        const halfW = 0.088 * (1 - v * v * 0.92) * TUNE.headScale;
        const bulge = (1 - v) * 0.030 * Math.sin(u * Math.PI);
        return new THREE.Vector3(along.x + (u * 2 - 1) * halfW * 0.30, along.y,
          along.z + (u * 2 - 1) * halfW + bulge * (u > 0.5 ? 1 : -1) * 0.4);
      },
      colorAt: (u, v, p) => tint(_col.set(cfg.hide).lerp(new THREE.Color(cfg.dark), v * 0.6),
        _col, p.x, p.y, p.z),
      weightsAtVert: () => [[`ear${L}`, 0.85], ['head', 0.15]],
    });
    // inner ear, warm — one saturated accent that keeps the head from going monochrome
    patch(mb, {
      segU: 5, segV: 5, group: 'body', sg: mb.newSg(), flip: true,
      at: (u, v) => {
        const along = base.clone().lerp(tip, v * 0.94);
        const halfW = 0.070 * (1 - v * v * 0.92) * TUNE.headScale;
        return new THREE.Vector3(along.x + (u * 2 - 1) * halfW * 0.24 + s * 0.012, along.y,
          along.z + (u * 2 - 1) * halfW);
      },
      colorAt: (u, v, p) => tint(_col.set(PAL.carnelian), _col, p.x, p.y, p.z, 0.08),
      weightsAtVert: () => [[`ear${L}`, 0.85], ['head', 0.15]],
    });
  }

  buildEyes(mb, S, C, R, 0.46, 0.13, 0.052);

  // Ruff: a ragged collar of fur tufts where the head meets the nemes. Pure silhouette work —
  // a smooth join reads as a vinyl toy at any distance.
  for (let i = 0; i < 11; i++) {
    const a = -1.35 + (i / 10) * 2.7;
    const p = new THREE.Vector3(Math.sin(a) * R.x * 0.86, C.y - R.y * 0.62, C.z + Math.cos(a) * R.z * 0.80);
    spike(mb, {
      base: p,
      dir: new THREE.Vector3(p.x - C.x, -0.55, p.z - C.z).normalize(),
      length: 0.085 + 0.030 * Math.sin(i * 2.1),
      width: 0.030, bend: 0.35, group: 'body', sg: 560 + i,
      weights: [['head', 0.75], ['neck', 0.25]],
      color: _col.set(cfg.dark).clone(),
    });
  }
}

/** Hippo head: enormous blunt muzzle, tiny eyes and ears high on the skull, big nostrils. */
function buildHippoHead(mb, S, cfg) {
  const C = new THREE.Vector3().fromArray(S.headC);
  const R = new THREE.Vector3().fromArray(S.headR).multiplyScalar(TUNE.headScale);
  const HW = [['head', 1]];
  const jawW = (p) => {
    const j = smooth(C.y + 0.04, C.y - 0.14, p.y) * smooth(R.z * 0.10, R.z * 0.70, p.z) * 0.7;
    return j < 0.02 ? HW : [['head', 1 - j], ['jaw', j]];
  };

  blob(mb, {
    center: C, radii: R, segTheta: TUNE.segHead, segPhi: 12,
    group: 'body', sg: mb.newSg(), weights: HW,
    warp: (p) => {
      const front = Math.max(0, (p.z - C.z) / R.z);
      p.y -= front * 0.030;             // heavy brow sloping into the snout
    },
    colorAt: (u, v, p) => tint(_col.set(cfg.hide), _col, p.x, p.y, p.z),
    weightsAtVert: (u, v, p) => jawW(p),
  });

  // the muzzle: wider than the skull, blunt, squared off — a shovel, not a snout
  const sn = S.snoutLen;
  const mz = [
    [new THREE.Vector3(0, C.y - 0.055, C.z + R.z * 0.30), 0.212, 0.164],
    [new THREE.Vector3(0, C.y - 0.070, C.z + R.z * 0.30 + sn * 0.35), 0.232, 0.172],
    [new THREE.Vector3(0, C.y - 0.082, C.z + R.z * 0.30 + sn * 0.72), 0.236, 0.168],
    [new THREE.Vector3(0, C.y - 0.090, C.z + R.z * 0.30 + sn * 0.98), 0.206, 0.146],
    [new THREE.Vector3(0, C.y - 0.094, C.z + R.z * 0.30 + sn * 1.10), 0.130, 0.098],
  ];
  loft(mb, {
    centers: mz.map((m) => m[0]), seg: 16,
    rx: (i) => mz[i][1] * TUNE.headScale,
    ry: (i) => mz[i][2] * TUNE.headScale,
    upHint: new THREE.Vector3(0, 1, 0),
    shape: (a) => sect(a, 1.55),
    groupAt: () => 'body', sgAt: () => 620,
    colorAt: (i, t, a, p) => {
      const below = Math.max(0, -Math.sin(Math.atan2(p.y - (C.y - 0.07), p.x)));
      _col.set(cfg.hide).lerp(new THREE.Color(PAL.hidePink), t * 0.5 + below * 0.15);
      return tint(_col, _col, p.x, p.y, p.z);
    },
    weightsAtVert: (i, t, a, p) => jawW(p),
    capStart: true, capEnd: true, uvScale: [2, 2],
  });

  // nostrils
  for (const s of [1, -1]) {
    blob(mb, {
      center: new THREE.Vector3(s * 0.072, C.y - 0.038, C.z + R.z * 0.30 + sn * 1.06),
      radii: new THREE.Vector3(0.030, 0.024, 0.022),
      segTheta: 10, segPhi: 6, group: 'body', sg: mb.newSg(), weights: [['jaw', 0.4], ['head', 0.6]],
      colorAt: () => _col.set(PAL.ink),
    });
  }

  // tusks poking up out of the lower jaw — comedy underbite
  for (const s of [1, -1]) {
    spike(mb, {
      base: new THREE.Vector3(s * 0.150, C.y - 0.130, C.z + R.z * 0.30 + sn * 0.86),
      dir: new THREE.Vector3(s * 0.16, 1, 0.10).normalize(),
      length: 0.115, width: 0.036, bend: 0.20,
      group: 'body', sg: mb.newSg(), weights: [['jaw', 0.85], ['head', 0.15]],
      color: _col.set(PAL.linen).clone(),
    });
  }

  // tiny round ears, set high and far back
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    blob(mb, {
      center: new THREE.Vector3(s * R.x * 0.64, C.y + R.y * 0.74, -R.z * 0.30),
      radii: new THREE.Vector3(0.056, 0.062, 0.036),
      segTheta: 10, segPhi: 7, group: 'body', sg: mb.newSg(),
      weights: [[`ear${L}`, 0.8], ['head', 0.2]],
      colorAt: (u, v, p) => tint(_col.set(cfg.dark), _col, p.x, p.y, p.z),
    });
  }

  buildEyes(mb, S, C, R, 0.40, 0.30, 0.042);
}

/** Eyes: sclera + oversized ink pupil + a highlight, plus a hooded lid for the dim-witted read. */
function buildEyes(mb, S, C, R, thetaOff, phiOff, size) {
  for (const s of [1, -1]) {
    const th = s * thetaOff, ph = phiOff;
    const c = new THREE.Vector3(
      C.x + R.x * 0.86 * Math.cos(ph) * Math.sin(th),
      C.y + R.y * 0.86 * Math.sin(ph),
      C.z + R.z * 0.86 * Math.cos(ph) * Math.cos(th));
    const out = new THREE.Vector3(Math.sin(th) * 0.8, Math.sin(ph) * 0.5, Math.cos(th)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, out).normalize();
    const tup = new THREE.Vector3().crossVectors(out, right).normalize();
    const basis = { x: right, y: tup, z: out };
    const W = [['head', 1]];

    blob(mb, {
      center: c, radii: new THREE.Vector3(size, size * 1.05, size), basis,
      segTheta: 12, segPhi: 8, group: 'body', sg: mb.newSg(), weights: W,
      colorAt: () => _col.set(PAL.eyeWhite),
    });
    const pc = c.clone().addScaledVector(out, size * 0.60);
    blob(mb, {
      center: pc, radii: new THREE.Vector3(size * 0.50, size * 0.58, size * 0.50), basis,
      segTheta: 10, segPhi: 7, group: 'body', sg: mb.newSg(), weights: W,
      colorAt: () => _col.set(PAL.ink),
    });
    const hc = pc.clone().addScaledVector(out, size * 0.42)
      .addScaledVector(tup, size * 0.26).addScaledVector(right, -s * size * 0.20);
    blob(mb, {
      center: hc, radii: new THREE.Vector3(size * 0.22, size * 0.22, size * 0.20), basis,
      segTheta: 8, segPhi: 6, group: 'body', sg: mb.newSg(), weights: W,
      colorAt: () => _col.set(0xffffff),
    });
    // Heavy lid across the top third: wide-open reads as alert, a hooded lid reads as slow.
    const lidUp = tup.clone().applyAxisAngle(out, s * 0.22).normalize();
    const lidRight = new THREE.Vector3().crossVectors(lidUp, out).normalize();
    blob(mb, {
      center: c.clone().addScaledVector(out, size * 0.04),
      radii: new THREE.Vector3(size * 1.10, size * 1.14, size * 1.10),
      basis: { x: lidRight, y: lidUp, z: out },
      segTheta: 12, segPhi: 5, phi0: 0.02, phi1: Math.PI / 2,
      group: 'body', sg: mb.newSg(), weights: W,
      colorAt: (u, v, p) => tint(_col.set(S.fur).multiplyScalar(0.82), _col, p.x, p.y, p.z),
    });
  }
}

/**
 * The nemes headcloth. Cap over the skull + two striped lappets falling in front of the
 * shoulders + a bound tail behind. Lapis-and-gold stripes: the palette's warm/cool tension
 * sitting right at eye level, which is where the read has to happen.
 */
function buildNemes(mb, S) {
  const C = new THREE.Vector3().fromArray(S.headC);
  const R = new THREE.Vector3().fromArray(S.headR).multiplyScalar(TUNE.headScale);
  const stripeAt = (v) => (Math.floor(v * 9.0) % 2 === 0 ? PAL.lapis : PAL.gold);

  // cap — covers the crown and the back of the skull, stops short of the brow
  blob(mb, {
    center: C, radii: new THREE.Vector3(R.x * 1.10, R.y * 1.12, R.z * 1.10),
    segTheta: TUNE.segHead, segPhi: 8, phi0: -0.25, phi1: Math.PI / 2,
    group: 'body', sg: mb.newSg(), weights: [['head', 1]],
    warp: (p, ft, fp) => {
      // cut the front away so the face is uncovered, and flare the sides into wings
      const front = (p.z - C.z) / R.z;
      if (front > 0.30) p.z = C.z + R.z * 0.30 * 1.10;
      const side = Math.abs(p.x - C.x) / R.x;
      p.x += (p.x - C.x) * side * 0.20 * (1 - fp);
    },
    colorAt: (u, v, p) => {
      const a = Math.atan2(p.x - C.x, p.z - C.z);
      return tint(_col.set(stripeAt((a / Math.PI + 1) * 0.5 * 2.6 % 1)), _col, p.x, p.y, p.z, 0.06);
    },
  });

  // gold brow band (the seshed) — one bright horizontal that anchors the whole head
  loft(mb, {
    centers: [
      new THREE.Vector3(C.x, C.y + R.y * 0.44, C.z),
      new THREE.Vector3(C.x, C.y + R.y * 0.30, C.z),
    ],
    seg: TUNE.segHead,
    rx: (i) => R.x * (i === 0 ? 1.13 : 1.16),
    ry: (i) => R.z * (i === 0 ? 1.13 : 1.16),
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => sect(a, 1.15),
    groupAt: () => 'metal', sgAt: (i) => 700 + i,
    colorAt: (i, t, a, p) => tint(_col.set(i === 0 ? PAL.goldLight : PAL.gold), _col, p.x, p.y, p.z, 0.09),
    weightsAt: () => [['head', 1]],
  });

  // lappets: wide striped panels falling in front of each shoulder
  for (const s of [1, -1]) {
    const L = s > 0 ? 'nemesL' : 'nemesR';
    const topY = C.y + R.y * 0.30, botY = S.chestY - 0.02;
    patch(mb, {
      segU: 5, segV: 8, group: 'body', sg: mb.newSg(),
      at: (u, v) => {
        const y = THREE.MathUtils.lerp(topY, botY, v);
        // narrow at the temple, widest at the chest, then squared off
        const w = R.x * (0.30 + 0.62 * smooth(0.0, 0.72, v)) * (1 - 0.10 * smooth(0.86, 1.0, v));
        const cx = s * (R.x * 0.92 + 0.10 * smooth(0.2, 1.0, v));
        const cz = C.z + R.z * (0.62 - 0.10 * v);
        return new THREE.Vector3(cx + (u * 2 - 1) * w * 0.34, y,
          cz + (u * 2 - 1) * w * 0.9 * -s * 0.0 + (u * 2 - 1) * w * 0.86);
      },
      colorAt: (u, v, p) => tint(_col.set(stripeAt(v)), _col, p.x, p.y, p.z, 0.06),
      weightsAtVert: (u, v) => [[L, Math.min(1, v * 1.5)], ['head', Math.max(0, 1 - v * 1.5)]],
      flip: s < 0,
    });
  }

  // bound tail behind the head
  loft(mb, {
    centers: [
      new THREE.Vector3(0, C.y - R.y * 0.10, C.z - R.z * 0.98),
      new THREE.Vector3(0, C.y - R.y * 0.52, C.z - R.z * 1.22),
      new THREE.Vector3(0, C.y - R.y * 1.00, C.z - R.z * 1.24),
      new THREE.Vector3(0, C.y - R.y * 1.42, C.z - R.z * 1.10),
    ],
    seg: 10,
    rx: [R.x * 0.52, R.x * 0.44, R.x * 0.34, R.x * 0.16],
    ry: [R.z * 0.34, R.z * 0.28, R.z * 0.22, R.z * 0.10],
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => sect(a, 1.3),
    groupAt: () => 'body', sgAt: () => 740,
    colorAt: (i, t, a, p) => tint(_col.set(stripeAt(t * 2.4 % 1)), _col, p.x, p.y, p.z, 0.06),
    weightsAt: (i, t) => [['nemesB', Math.min(1, t * 1.4)], ['head', Math.max(0, 1 - t * 1.4)]],
    capEnd: true,
  });
}

/** Jackal tail — short, thick, held low. One more asymmetric shape in the silhouette. */
function buildTail(mb, S, cfg) {
  const y = S.hipY - 0.030;
  const pts = [
    new THREE.Vector3(0, y, -0.150),
    new THREE.Vector3(0, y - 0.070, -0.270),
    new THREE.Vector3(0.020, y - 0.170, -0.360),
    new THREE.Vector3(0.045, y - 0.290, -0.400),
    new THREE.Vector3(0.060, y - 0.395, -0.386),
  ];
  loft(mb, {
    centers: pts, seg: 10,
    rx: [0.062, 0.074, 0.076, 0.062, 0.030],
    upHint: new THREE.Vector3(0, 1, 0),
    shape: (a) => sect(a, 1.04),
    groupAt: () => 'body', sgAt: () => 780,
    colorAt: (i, t, a, p) => tint(_col.set(cfg.hide).lerp(new THREE.Color(cfg.dark), smooth(0.35, 0.9, t)),
      _col, p.x, p.y, p.z),
    weightsAt: (i, t) => (t < 0.4 ? [['tailA', 1]] : [['tailA', 1 - (t - 0.4) / 0.6], ['tailB', (t - 0.4) / 0.6]]),
    capEnd: true,
  });
}

/* ------------------------------ gear -------------------------------------- */

/** Spear: a long ash shaft with a bronze leaf blade and a butt-spike. Held in the right fist. */
function buildSpear(mb, S) {
  const shK = TUNE.shoulderWidth;
  const grip = new THREE.Vector3(-S.handX * shK - 0.035, S.handY, 0.075);
  const up = new THREE.Vector3(0.055, 1, 0.085).normalize();
  const W = [['handR', 1]];
  const lo = grip.clone().addScaledVector(up, -0.50);
  const hi = grip.clone().addScaledVector(up, 1.62);

  loft(mb, {
    centers: [lo, grip.clone().addScaledVector(up, 0.10), grip.clone().addScaledVector(up, 0.90), hi],
    seg: 8, rx: 0.021,
    framesOverride: {
      T: [up, up, up, up],
      R: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)],
      U: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)],
    },
    groupAt: () => 'body', sgAt: () => 800,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.leather), _col, p.x, p.y, p.z, 0.10),
    weightsAt: () => W, capStart: true,
  });

  // blade — flattened leaf, hard-edged so the bronze catches a rim
  const bBase = hi.clone();
  const bTip = hi.clone().addScaledVector(up, 0.34);
  const R0 = new THREE.Vector3(1, 0, 0), U0 = new THREE.Vector3(0, 0, 1);
  loft(mb, {
    centers: [
      bBase.clone().addScaledVector(up, -0.02),
      bBase.clone().addScaledVector(up, 0.05),
      bBase.clone().addScaledVector(up, 0.16),
      bBase.clone().addScaledVector(up, 0.26),
      bTip,
    ],
    seg: 8,
    rx: [0.026, 0.055, 0.062, 0.042, 0.004],
    ry: [0.022, 0.018, 0.016, 0.012, 0.003],
    framesOverride: { T: [up, up, up, up, up], R: [R0, R0, R0, R0, R0], U: [U0, U0, U0, U0, U0] },
    groupAt: () => 'metal', sgAt: () => 802,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronze).lerp(new THREE.Color(PAL.goldLight), t * 0.4),
      _col, p.x, p.y, p.z, 0.10),
    weightsAt: () => W, capStart: true, capEnd: true,
  });

  // butt spike + grip binding
  loft(mb, {
    centers: [lo.clone().addScaledVector(up, -0.10), lo.clone().addScaledVector(up, 0.02)],
    seg: 8, rx: [0.004, 0.026],
    framesOverride: { T: [up, up], R: [R0, R0], U: [U0, U0] },
    groupAt: () => 'metal', sgAt: () => 804,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronzeDark), _col, p.x, p.y, p.z, 0.10),
    weightsAt: () => W, capStart: true, capEnd: true,
  });
}

/** Khopesh: the sickle sword. A hooked silhouette is instantly readable at 40 px. */
function buildKhopesh(mb, S) {
  const shK = TUNE.shoulderWidth;
  const grip = new THREE.Vector3(-S.handX * shK - 0.040, S.handY - 0.02, 0.090);
  const W = [['handR', 1]];
  const R0 = new THREE.Vector3(0, 0, 1), U0 = new THREE.Vector3(1, 0, 0);

  // handle, pointing down-forward out of the fist
  const hd = new THREE.Vector3(-0.05, -0.94, 0.32).normalize();
  loft(mb, {
    centers: [grip.clone().addScaledVector(hd, -0.10), grip.clone(), grip.clone().addScaledVector(hd, 0.16)],
    seg: 8, rx: [0.026, 0.028, 0.026],
    framesOverride: { T: [hd, hd, hd], R: [R0, R0, R0], U: [U0, U0, U0] },
    groupAt: () => 'body', sgAt: () => 820,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.leather), _col, p.x, p.y, p.z, 0.10),
    weightsAt: () => W, capStart: true, capEnd: true,
  });

  // blade: straight out of the grip, then a hard sickle hook
  const a0 = grip.clone().addScaledVector(hd, -0.12);
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const ang = -0.35 + t * 2.25;
    const rr = 0.30 + 0.10 * t;
    pts.push(new THREE.Vector3(a0.x - 0.02 * t, a0.y + rr * Math.sin(ang) + 0.10, a0.z + rr * (1 - Math.cos(ang)) * 0.9));
  }
  loft(mb, {
    centers: pts, seg: 6,
    rx: (i) => 0.012,
    ry: (i) => 0.050 - 0.020 * (i / 8),
    upHint: new THREE.Vector3(1, 0, 0),
    shape: (a) => sect(a, 1.7),
    groupAt: () => 'metal', sgAt: () => 822,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronze).lerp(new THREE.Color(PAL.goldLight), t * 0.35),
      _col, p.x, p.y, p.z, 0.10),
    weightsAt: () => W, capStart: true, capEnd: true,
  });
}

/** Round bronze shield strapped to the left forearm. The single biggest shape on the Heavy. */
function buildShield(mb, S) {
  const shK = TUNE.shoulderWidth;
  const c = new THREE.Vector3(S.handX * shK + 0.10, S.handY + 0.20, 0.16);
  const W = [['lowerArmL', 0.55], ['handL', 0.45]];
  const nrm = new THREE.Vector3(0.30, 0.06, 0.95).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, nrm).normalize();
  const tup = new THREE.Vector3().crossVectors(nrm, right).normalize();
  const RX = 0.40, RY = 0.50;

  // face — a shallow dome so the cel bands curve across it
  patch(mb, {
    segU: 22, segV: 5, group: 'metal', sg: mb.newSg(), weights: W,
    at: (u, v) => {
      const th = u * Math.PI * 2, r = v;
      const dome = Math.cos(r * 1.15) * 0.11;
      return c.clone()
        .addScaledVector(right, Math.sin(th) * RX * r)
        .addScaledVector(tup, Math.cos(th) * RY * r)
        .addScaledVector(nrm, dome);
    },
    colorAt: (u, v, p) => {
      // painted rings: bronze field, a carnelian band, a gold boss at the centre
      const c2 = v < 0.22 ? PAL.goldLight : v < 0.42 ? PAL.gold : v < 0.60 ? PAL.carnelian : PAL.bronze;
      return tint(_col.set(c2), _col, p.x, p.y, p.z, 0.09);
    },
  });
  // rim — separate smoothing group ⇒ a hard bright edge all the way round
  loft(mb, {
    centers: (() => {
      const arr = [];
      for (let i = 0; i <= 24; i++) {
        const th = (i / 24) * Math.PI * 2;
        arr.push(c.clone().addScaledVector(right, Math.sin(th) * RX).addScaledVector(tup, Math.cos(th) * RY));
      }
      return arr;
    })(),
    seg: 6, rx: 0.034, ry: 0.034,
    upHint: nrm,
    shape: (a) => sect(a, 1.5),
    groupAt: () => 'metal', sgAt: () => 860,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronzeDark), _col, p.x, p.y, p.z, 0.10),
    weightsAt: () => W,
  });
}

/** Bronze cuirass + pauldrons. Hard-edged plate over a soft body: the contrast is the point. */
function buildCuirass(mb, S) {
  const top = S.chestY + 0.19, bot = S.spineY + 0.10;
  const RAMP = spineRamp(S);
  loft(mb, {
    centers: [
      new THREE.Vector3(0, top, torsoAt(S, top).cz),
      new THREE.Vector3(0, THREE.MathUtils.lerp(top, bot, 0.35), torsoAt(S, THREE.MathUtils.lerp(top, bot, 0.35)).cz),
      new THREE.Vector3(0, THREE.MathUtils.lerp(top, bot, 0.72), torsoAt(S, THREE.MathUtils.lerp(top, bot, 0.72)).cz),
      new THREE.Vector3(0, bot, torsoAt(S, bot).cz),
    ],
    seg: TUNE.segTorso,
    rx: (i, t) => torsoAt(S, THREE.MathUtils.lerp(top, bot, t)).rx * (1.07 - 0.02 * t),
    ry: (i, t) => torsoAt(S, THREE.MathUtils.lerp(top, bot, t)).rz * (1.09 - 0.02 * t),
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a, i, t) => {
      const s = sect(a, 1.30);
      // pectoral swell, so the plate reads as beaten to a body rather than a barrel
      const front = Math.max(0, Math.cos(a));
      s.v *= 1 + 0.10 * front * (1 - t) + 0.05 * Math.abs(Math.sin(a * 2)) * (1 - t);
      return s;
    },
    groupAt: () => 'metal',
    sgAt: (i) => 880 + (i === 0 ? 0 : 1),
    colorAt: (i, t, a, p) => tint(_col.set(PAL.bronze).lerp(new THREE.Color(PAL.bronzeDark), t * 0.55),
      _col, p.x, p.y, p.z, 0.10),
    weightsAtVert: (i, t, a, p) => ramp(p.y, RAMP),
    capStart: false, capEnd: false,
  });

  // scalloped lower lip of the plate — a hard bright line across the belly
  loft(mb, {
    centers: [
      new THREE.Vector3(0, bot + 0.012, torsoAt(S, bot).cz),
      new THREE.Vector3(0, bot - 0.030, torsoAt(S, bot).cz),
    ],
    seg: TUNE.segTorso,
    rx: (i) => torsoAt(S, bot).rx * (i === 0 ? 1.06 : 1.11),
    ry: (i) => torsoAt(S, bot).rz * (i === 0 ? 1.08 : 1.13),
    upHint: new THREE.Vector3(0, 0, 1),
    shape: (a) => { const s = sect(a, 1.30); const k = 1 + 0.035 * Math.sin(a * 9); return { u: s.u * k, v: s.v * k }; },
    groupAt: () => 'metal', sgAt: (i) => 884 + i,
    colorAt: (i, t, a, p) => tint(_col.set(PAL.goldLight), _col, p.x, p.y, p.z, 0.09),
    weightsAtVert: (i, t, a, p) => ramp(p.y, RAMP),
  });

  // pauldrons
  const shK = TUNE.shoulderWidth;
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    blob(mb, {
      center: new THREE.Vector3(s * (S.shoulderX + (S.armX - S.shoulderX) * 0.55) * shK, S.shoulderY + 0.030, -0.010),
      radii: new THREE.Vector3(S.torso[7][2] * 0.86, S.torso[7][2] * 0.78, S.torso[7][2] * 0.86),
      segTheta: 14, segPhi: 6, phi0: -0.30, phi1: Math.PI / 2,
      group: 'metal', sg: mb.newSg(),
      weights: [[`shoulder${L}`, 0.85], ['chest', 0.15]],
      colorAt: (u, v, p) => tint(_col.set(PAL.bronze), _col, p.x, p.y, p.z, 0.10),
    });
  }
}

/** Bronze war helmet with a nose guard and a crest — the Heavy's silhouette signature. */
function buildHelmet(mb, S) {
  const C = new THREE.Vector3().fromArray(S.headC);
  const R = new THREE.Vector3().fromArray(S.headR).multiplyScalar(TUNE.headScale);
  blob(mb, {
    center: C.clone().setY(C.y + 0.010),
    radii: new THREE.Vector3(R.x * 1.10, R.y * 1.16, R.z * 1.10),
    segTheta: TUNE.segHead, segPhi: 7, phi0: -0.16, phi1: Math.PI / 2,
    group: 'metal', sg: mb.newSg(), weights: [['head', 1]],
    warp: (p) => { const front = (p.z - C.z) / R.z; if (front > 0.38) p.z = C.z + R.z * 0.38 * 1.10; },
    colorAt: (u, v, p) => tint(_col.set(PAL.bronze), _col, p.x, p.y, p.z, 0.10),
  });
  // crest, front to back
  patch(mb, {
    segU: 8, segV: 3, group: 'metal', sg: mb.newSg(), weights: [['head', 1]],
    at: (u, v) => {
      const th = -0.30 + u * (Math.PI + 0.30);
      const h = 0.055 + 0.075 * Math.sin(u * Math.PI);
      return new THREE.Vector3(
        (v - 0.5) * 0.030,
        C.y + (R.y * 1.16 + h * v) * Math.sin(th * 0.5 + 0.35) * 0.99 + 0.02,
        C.z + R.z * 1.12 * Math.cos(th * 0.5 + 0.35) * 0.99);
    },
    colorAt: (u, v, p) => tint(_col.set(PAL.carnelian), _col, p.x, p.y, p.z, 0.08),
  });
  // nose guard
  hardBox(mb, {
    center: new THREE.Vector3(0, C.y + R.y * 0.10, C.z + R.z * 1.06),
    half: new THREE.Vector3(0.036, 0.115, 0.020),
    group: 'metal', weights: [['head', 1]], color: PAL.bronzeDark,
  });
}

/* ------------------------------ assembly ---------------------------------- */

function buildHumanoid(type) {
  const S = SPECS[type];
  const skel = humanoidSkeleton(S);
  const boneIndex = { root: 0 };
  skel.forEach(([n], i) => { boneIndex[n] = i + 1; });

  const mb = new GBuild(boneIndex);
  const cfg = {
    hide: S.fur,
    belly: S.furLight,
    dark: S.furDark,
  };

  buildTorso(mb, S, cfg);
  buildKilt(mb, S);
  for (const s of [1, -1]) {
    buildArm(mb, S, s, cfg);
    buildHand(mb, S, s, cfg);
    buildLeg(mb, S, s, cfg);
    buildFoot(mb, S, s, cfg);
  }
  if (type === 'temple') {
    buildTail(mb, S, cfg);
    buildJackalHead(mb, S, cfg);
    buildNemes(mb, S);
    buildCollar(mb, S);
    buildSpear(mb, S);
  } else {
    buildHippoHead(mb, S, cfg);
    buildHelmet(mb, S);
    buildCuirass(mb, S);
    buildShield(mb, S);
    buildKhopesh(mb, S);
  }

  return { spec: S, skeleton: skel, geometry: mb.toGeometry(GROUPS), tris: mb.triangleCount, missing: mb.missing };
}

/* ------------------------------ scarab ------------------------------------ */

function buildScarab() {
  const boneIndex = { root: 0 };
  SCARAB_SKELETON.forEach(([n], i) => { boneIndex[n] = i + 1; });
  const mb = new GBuild(boneIndex);
  const W = [['body', 1]];

  // carapace — a squashed dome with a hard split down the elytra
  blob(mb, {
    center: new THREE.Vector3(0, 0.175, 0.010),
    radii: new THREE.Vector3(0.215, 0.135, 0.290),
    segTheta: 18, segPhi: 9, phi0: -0.55, phi1: Math.PI / 2,
    group: 'body', sg: mb.newSg(), weights: W,
    warp: (p) => { p.y += 0.030 * Math.max(0, 1 - Math.abs(p.z) * 3.2); },
    colorAt: (u, v, p) => {
      // iridescent lapis→turquoise sheen across the shell
      _col.set(PAL.scarabShell).lerp(new THREE.Color(PAL.turquoise), 0.30 * Math.pow(v, 2.2));
      return tint(_col, _col, p.x, p.y, p.z, 0.10);
    },
  });
  // elytra split — a thin dark inlay so the shell reads as two wing cases
  patch(mb, {
    segU: 3, segV: 8, group: 'body', sg: mb.newSg(), weights: W,
    at: (u, v) => {
      const z = THREE.MathUtils.lerp(0.24, -0.27, v);
      const h = 0.175 + 0.135 * Math.cos(Math.abs(z) * 3.0) + 0.030 * Math.max(0, 1 - Math.abs(z) * 3.2);
      return new THREE.Vector3((u - 0.5) * 0.026, h + 0.004, z);
    },
    colorAt: () => _col.set(PAL.ink),
  });
  // underbelly glow — the only emissive thing on a guard; it is what makes it read as a sentinel
  blob(mb, {
    center: new THREE.Vector3(0, 0.115, 0.010),
    radii: new THREE.Vector3(0.185, 0.075, 0.250),
    segTheta: 14, segPhi: 6, phi0: -Math.PI / 2, phi1: 0.05,
    group: 'body', sg: mb.newSg(), weights: W,
    colorAt: () => _col.set(PAL.scarabGlow),
  });
  // head + mandibles
  blob(mb, {
    center: new THREE.Vector3(0, 0.150, 0.270),
    radii: new THREE.Vector3(0.130, 0.078, 0.090),
    segTheta: 12, segPhi: 8, group: 'body', sg: mb.newSg(), weights: [['headS', 1]],
    colorAt: (u, v, p) => tint(_col.set(PAL.scarabShell), _col, p.x, p.y, p.z, 0.09),
  });
  for (const s of [1, -1]) {
    spike(mb, {
      base: new THREE.Vector3(s * 0.070, 0.135, 0.330),
      dir: new THREE.Vector3(s * 0.30, 0.10, 1).normalize(),
      length: 0.115, width: 0.028, bend: 0.45,
      bendDir: new THREE.Vector3(-s, 0, 0),
      group: 'metal', sg: mb.newSg(), weights: [['headS', 1]], color: PAL.bronze,
    });
    // eye
    blob(mb, {
      center: new THREE.Vector3(s * 0.098, 0.185, 0.310),
      radii: new THREE.Vector3(0.030, 0.030, 0.028),
      segTheta: 8, segPhi: 6, group: 'body', sg: mb.newSg(), weights: [['headS', 1]],
      colorAt: () => _col.set(PAL.goldLight),
    });
    // antenna
    const L = s > 0 ? 'antL' : 'antR';
    spike(mb, {
      base: new THREE.Vector3(s * 0.055, 0.205, 0.315),
      dir: new THREE.Vector3(s * 0.55, 0.72, 0.42).normalize(),
      length: 0.150, width: 0.014, bend: 0.5,
      group: 'body', sg: mb.newSg(), weights: [[L, 1]], color: PAL.ink,
    });
  }
  // six legs, each a two-segment crank
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const name = `leg${s > 0 ? 'L' : 'R'}${i}`;
      const z = 0.150 - i * 0.150;
      const hip = new THREE.Vector3(s * 0.145, 0.140, z);
      const knee = new THREE.Vector3(s * 0.265, 0.185, z + s * 0.0);
      const toe = new THREE.Vector3(s * 0.305, 0.005, z - 0.040);
      loft(mb, {
        centers: [hip, hip.clone().lerp(knee, 0.55), knee, knee.clone().lerp(toe, 0.5), toe],
        seg: 6, rx: [0.030, 0.026, 0.024, 0.018, 0.006],
        upHint: new THREE.Vector3(0, 1, 0),
        groupAt: () => 'metal', sgAt: () => 900 + i * 2 + (s > 0 ? 0 : 1),
        colorAt: (i2, t, a, p) => tint(_col.set(PAL.bronzeDark), _col, p.x, p.y, p.z, 0.10),
        weightsAt: () => [[name, 1]],
        capStart: true, capEnd: true,
      });
    }
  }

  return {
    spec: { height: 0.34, hipY: 0.18, headC: [0, 0.185, 0.27], eyeY: 0.20 },
    skeleton: SCARAB_SKELETON,
    geometry: mb.toGeometry(GROUPS),
    tris: mb.triangleCount,
    missing: mb.missing,
  };
}

/* ======================================================================== */
/*  Public API                                                               */
/* ======================================================================== */

/**
 * Build the shared geometry for every guard type. Call once; the result is handed to
 * `instantiate()` as many times as there are guards.
 * @returns {Record<string, {spec, skeleton, geometry, tris, missing}>}
 */
export function buildGuardAssets() {
  return {
    temple: buildHumanoid('temple'),
    heavy: buildHumanoid('heavy'),
    scarab: buildScarab(),
  };
}

/**
 * One guard instance: a fresh bone tree + `Skeleton` sharing the type's geometry.
 * Bind happens while `root` sits at the identity, so bindMatrix is trivial and the caller
 * can move `root` freely afterwards.
 *
 * @param {{spec, skeleton, geometry}} asset
 * @param {THREE.Material[]} materials  one per entry in GROUPS
 */
export function instantiate(asset, materials) {
  const root = new THREE.Group();
  root.name = 'guard_root';

  const bones = {};
  const rootBone = new THREE.Bone();
  rootBone.name = 'root';
  bones.root = rootBone;
  root.add(rootBone);

  const world = { root: new THREE.Vector3(0, 0, 0) };
  for (const [name, parent, p] of asset.skeleton) {
    const b = new THREE.Bone();
    b.name = name;
    const wp = new THREE.Vector3().fromArray(p);
    world[name] = wp;
    b.position.copy(wp).sub(world[parent] || world.root);
    (bones[parent] || rootBone).add(b);
    bones[name] = b;
  }

  const order = ['root', ...asset.skeleton.map((s) => s[0])];
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(order.map((n) => bones[n]));

  const mesh = new THREE.SkinnedMesh(asset.geometry, materials);
  mesh.name = 'guard_body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  /* Cull by an explicit, generously inflated sphere rather than not culling at all.
   *
   * The hazard named here was real — three fills `SkinnedMesh.boundingSphere` from whatever
   * pose happens to be current the first time it is asked and then never recomputes it, so
   * culling against it pops a guard out of frame mid-animation. But `frustumCulled = false`
   * over-corrects: it draws every guard in the level, in every shot, in every shadow cascade,
   * whether or not one is on screen. Measured at 35 meshes / 139k triangles with 24 of them
   * "in frustum" in shots containing no visible guard — which after the depth prepass and
   * three shadow cascades is the single largest item in the frame budget after the prepass
   * itself.
   *
   * `Frustum.intersectsObject` prefers `object.boundingSphere` when it is set, so setting one
   * that covers every pose the rig can reach gets the culling back without the popping. The
   * inflation is deliberately over-generous: being too large only costs a guard just off the
   * edge still drawing, while being too small is the popping bug all over again. */
  mesh.frustumCulled = true;
  asset.geometry.computeBoundingSphere();
  mesh.boundingSphere = asset.geometry.boundingSphere.clone();
  mesh.boundingSphere.radius *= 2.0;
  root.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());

  return { root, mesh, bones, skeleton, bindWorld: world, boneNames: order };
}

export { PAL as GUARD_PALETTE, SPECS as GUARD_SPECS };

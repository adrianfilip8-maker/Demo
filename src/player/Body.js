import * as THREE from 'three';
import { rng, fbm2, valueNoise2, ridged2 } from '../core/Rand.js';

/**
 * Body.js — the procedural mesh foundry for Sly.
 *
 * Everything here is geometry *authoring* primitives, not Sly himself. The design intent:
 *
 *  · One accumulator (`MeshBuilder`) collects position / normal / uv / colour / skin data and
 *    emits a single indexed BufferGeometry with material groups. One mesh, few draw calls,
 *    one skeleton — which is what keeps a hand-built character inside budget.
 *
 *  · Normals come from *smoothing groups*, not from `computeVertexNormals()`. A cartoon
 *    character needs smooth limbs AND razor edges on the cap brim, boot sole and cane
 *    ferrule. Vertices are welded by (position, smoothingGroup), so two coincident rings in
 *    different groups produce a crease and two in the same group produce a seamless join.
 *    That single mechanism gives hard edges *and* fixes the UV-seam normal split for free.
 *
 *  · Skin weights are authored per-ring, not solved globally. Automatic distance weighting
 *    always bleeds across the shoulder and the crotch; here every ring of every loft states
 *    which bones own it, so joints bend the way they were drawn.
 */

/* Weld tolerance for the smoothing-group normal pass. Tight enough that separate parts never
   merge, loose enough that a duplicated ring always welds. */
const WELD_Q = 1e4;

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

/* ========================================================================== */
/*  MeshBuilder                                                               */
/* ========================================================================== */

export class MeshBuilder {
  /** @param {Record<string,number>} boneIndex  bone name → index in skeleton.bones */
  constructor(boneIndex) {
    this.boneIndex = boneIndex;
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.sgOf = [];          // smoothing group per vertex
    this.groups = new Map(); // materialGroupName → index array
    this._group = 'fur';
    this._sg = 1;
    this._sgNext = 1;
    this._color = new THREE.Color(1, 1, 1);
    this._weights = [['root', 1]];
    this.missingBones = new Set();
  }

  /** Material group for subsequent faces (becomes one draw call). */
  group(name) { this._group = name; return this; }

  /** Smoothing group. Same id + same position ⇒ shared normal. Different id ⇒ hard edge. */
  sg(id) { this._sg = id; return this; }
  /** Allocate a fresh smoothing group id. */
  newSg() { return ++this._sgNext + 1000; }

  color(c) { this._color.set(c); return this; }
  /** @param {Array<[string,number]>} pairs */
  weights(pairs) { this._weights = pairs; return this; }

  vert(p, u, v, colOverride, weightsOverride) {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    const c = colOverride || this._color;
    this.col.push(c.r, c.g, c.b);
    this._pushWeights(weightsOverride || this._weights);
    this.sgOf.push(this._sg);
    return i;
  }

  _pushWeights(pairs) {
    // Max 4 influences, largest wins, renormalised — the shader only reads 4.
    let list = pairs;
    if (list.length > 4) {
      list = list.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
    }
    let sum = 0;
    for (let k = 0; k < list.length; k++) sum += list[k][1];
    if (sum <= 1e-6) { this.si.push(0, 0, 0, 0); this.sw.push(1, 0, 0, 0); return; }
    for (let k = 0; k < 4; k++) {
      if (k < list.length) {
        const name = list[k][0];
        let idx = this.boneIndex[name];
        if (idx === undefined) { this.missingBones.add(name); idx = 0; }
        this.si.push(idx);
        this.sw.push(list[k][1] / sum);
      } else { this.si.push(0); this.sw.push(0); }
    }
  }

  _idx() {
    let arr = this.groups.get(this._group);
    if (!arr) { arr = []; this.groups.set(this._group, arr); }
    return arr;
  }

  tri(a, b, c) { const g = this._idx(); g.push(a, b, c); return this; }
  /** Quad as a paired triangle fan with consistent winding. */
  quad(a, b, c, d) { const g = this._idx(); g.push(a, b, c, a, c, d); return this; }

  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { let n = 0; for (const g of this.groups.values()) n += g.length / 3; return n; }

  /**
   * @param {string[]} groupOrder material group names, in the order the material array uses
   * @returns {THREE.BufferGeometry}
   */
  toGeometry(groupOrder) {
    const vcount = this.pos.length / 3;
    const position = new Float32Array(this.pos);
    const normal = new Float32Array(vcount * 3);

    // --- concatenate index arrays, one contiguous run per material group ---
    const index = [];
    const ranges = [];
    for (let gi = 0; gi < groupOrder.length; gi++) {
      const arr = this.groups.get(groupOrder[gi]);
      const start = index.length;
      if (arr) for (let k = 0; k < arr.length; k++) index.push(arr[k]);
      ranges.push({ start, count: index.length - start, mat: gi });
    }

    // --- area-weighted face normals ---
    for (let f = 0; f < index.length; f += 3) {
      const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
      _v0.set(position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]);
      _v1.set(position[c] - position[a], position[c + 1] - position[a + 1], position[c + 2] - position[a + 2]);
      _n.crossVectors(_v0, _v1);   // length ∝ 2·area, so big faces steer the average
      for (let k = 0; k < 3; k++) {
        const o = index[f + k] * 3;
        normal[o] += _n.x; normal[o + 1] += _n.y; normal[o + 2] += _n.z;
      }
    }

    // --- weld by (quantised position, smoothing group) ---
    const buckets = new Map();
    const keyOf = (i) => {
      const o = i * 3;
      return `${Math.round(position[o] * WELD_Q)},${Math.round(position[o + 1] * WELD_Q)},` +
             `${Math.round(position[o + 2] * WELD_Q)},${this.sgOf[i]}`;
    };
    for (let i = 0; i < vcount; i++) {
      const k = keyOf(i);
      let b = buckets.get(k);
      if (!b) { b = { x: 0, y: 0, z: 0, list: [] }; buckets.set(k, b); }
      const o = i * 3;
      b.x += normal[o]; b.y += normal[o + 1]; b.z += normal[o + 2];
      b.list.push(i);
    }
    for (const b of buckets.values()) {
      let l = Math.hypot(b.x, b.y, b.z);
      if (l < 1e-12) { b.x = 0; b.y = 1; b.z = 0; l = 1; }
      const x = b.x / l, y = b.y / l, z = b.z / l;
      for (const i of b.list) { const o = i * 3; normal[o] = x; normal[o + 1] = y; normal[o + 2] = z; }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(this.si), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.sw), 4));
    g.setIndex(vcount > 65535 ? new THREE.BufferAttribute(new Uint32Array(index), 1)
                              : new THREE.BufferAttribute(new Uint16Array(index), 1));
    for (const r of ranges) if (r.count > 0) g.addGroup(r.start, r.count, r.mat);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ========================================================================== */
/*  Ring frames                                                               */
/* ========================================================================== */

/**
 * Parallel-transport frames along a polyline. Frenet frames flip and spin on an S-curve
 * (the tail is exactly that shape), which twists the UVs and shears the ring cross-sections;
 * transporting the previous frame by the minimal rotation between tangents does not.
 */
export function frames(centers, upHint = new THREE.Vector3(0, 1, 0)) {
  const n = centers.length;
  const T = [], R = [], U = [];
  for (let i = 0; i < n; i++) {
    const a = centers[Math.max(0, i - 1)], b = centers[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-12) t.copy(T[i - 1] || new THREE.Vector3(0, 1, 0));
    T.push(t.normalize());
  }
  let r = new THREE.Vector3().crossVectors(upHint, T[0]);
  if (r.lengthSq() < 1e-8) r.crossVectors(new THREE.Vector3(0, 0, 1), T[0]);
  r.normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      _q.setFromUnitVectors(T[i - 1], T[i]);
      r = r.clone().applyQuaternion(_q);
      // re-orthogonalise against drift
      r.sub(_v0.copy(T[i]).multiplyScalar(r.dot(T[i]))).normalize();
    }
    R.push(r.clone());
    U.push(new THREE.Vector3().crossVectors(T[i], r).normalize());
  }
  return { T, R, U };
}

/** Superellipse cross-section. k=1 circle, k>1 squarer, k<1 pinched. */
export function superEllipse(a, k) {
  const c = Math.cos(a), s = Math.sin(a);
  if (k === 1) return { u: c, v: s };
  const p = 2 / k;
  return {
    u: Math.sign(c) * Math.pow(Math.abs(c), p),
    v: Math.sign(s) * Math.pow(Math.abs(s), p),
  };
}

/**
 * Loft a tube. The workhorse: torso, head, muzzle, limbs, tail, ears, cane, cap dome.
 *
 * @param {MeshBuilder} mb
 * @param {object} o
 *   centers   Vector3[]                       ring centres, in bind-pose model space
 *   rx, ry    number|number[]|fn(i,t)         half-width along R / along U
 *   seg       number                          radial segments
 *   shape     fn(angle, i, t) -> {u,v}        unit cross-section (default circle)
 *   warp      fn(p, i, t, angle) -> void      final per-vertex displacement hook
 *   weightsAt fn(i, t) -> [[bone,amt],...]
 *   groupAt   fn(i, t) -> string              material group per ring
 *   colorAt   fn(i, t, angle) -> THREE.Color
 *   sgAt      fn(i, t) -> number              smoothing group per ring
 *   capStart / capEnd  boolean                close the ends with a fan
 *   uvScale   [number, number]
 *   upHint    Vector3
 */
export function addTube(mb, o) {
  const centers = o.centers;
  const n = centers.length;
  const seg = o.seg ?? 16;
  const { T, R, U } = o.framesOverride || frames(centers, o.upHint);
  const shape = o.shape || ((a) => ({ u: Math.cos(a), v: Math.sin(a) }));
  const num = (x, i, t) => (typeof x === 'function' ? x(i, t) : Array.isArray(x) ? x[i] : x);
  const uvS = o.uvScale || [1, 1];
  const sg0 = o.sg ?? mb.newSg();

  // arc length for a non-stretched v coordinate
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
      const a = (j % seg) / seg * Math.PI * 2;
      const s = shape(a, i, t);
      const p = new THREE.Vector3()
        .copy(centers[i])
        .addScaledVector(R[i], s.u * rx)
        .addScaledVector(U[i], s.v * ry);
      if (o.warp) o.warp(p, i, t, a, R[i], U[i], T[i]);
      const col = o.colorAt ? o.colorAt(i, t, a, p) : null;
      const wv = o.weightsAtVert ? o.weightsAtVert(i, t, a, p) : null;
      row.push(mb.vert(p, (j / seg) * uvS[0], (arc[i] / total) * uvS[1] * (total / 0.3), col, wv));
    }
    rows.push(row);
  }

  for (let i = 0; i < n - 1; i++) {
    if (o.groupAt) mb.group(o.groupAt(i, i / (n - 1)));
    for (let j = 0; j < seg; j++) {
      mb.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    }
  }

  if (o.capStart) capRing(mb, rows[0], centers[0], T[0], true, o, 0);
  if (o.capEnd) capRing(mb, rows[n - 1], centers[n - 1], T[n - 1], false, o, 1);

  return rows;
}

function capRing(mb, row, centre, tangent, atStart, o, t) {
  const i = atStart ? 0 : 1;
  if (o.groupAt) mb.group(o.groupAt(atStart ? 0 : 999, t));
  if (o.weightsAt) mb.weights(o.weightsAt(atStart ? 0 : 999, t));
  const c = mb.vert(_v2.copy(centre).addScaledVector(tangent, atStart ? -0.001 : 0.001), 0.5, t);
  const seg = row.length - 1;
  for (let j = 0; j < seg; j++) {
    if (atStart) mb.tri(c, row[j + 1], row[j]);
    else mb.tri(c, row[j], row[j + 1]);
  }
}

/**
 * Ellipsoid patch — full spheres, domes, eyelid crescents, mask backing.
 * phi runs −π/2 (bottom) → π/2 (top); theta 0 → 2π around the local Y axis.
 */
export function addEllipsoid(mb, o) {
  const c = o.center;
  const r = o.radii;                       // Vector3
  const segT = o.segTheta ?? 20, segP = o.segPhi ?? 12;
  const t0 = o.theta0 ?? 0, t1 = o.theta1 ?? Math.PI * 2;
  const p0 = o.phi0 ?? -Math.PI / 2, p1 = o.phi1 ?? Math.PI / 2;
  const closed = Math.abs((t1 - t0) - Math.PI * 2) < 1e-6;
  const basis = o.basis;                   // optional {x:Vector3,y:Vector3,z:Vector3}
  if (o.group) mb.group(o.group);
  mb.sg(o.sg ?? mb.newSg());
  if (o.weights) mb.weights(o.weights);

  const rows = [];
  for (let ip = 0; ip <= segP; ip++) {
    const fp = ip / segP, phi = p0 + (p1 - p0) * fp;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const row = [];
    for (let it = 0; it <= segT; it++) {
      const ft = it / segT, th = t0 + (t1 - t0) * ft;
      let x = cp * Math.sin(th) * r.x, y = sp * r.y, z = cp * Math.cos(th) * r.z;
      const p = new THREE.Vector3();
      if (basis) p.copy(c).addScaledVector(basis.x, x).addScaledVector(basis.y, y).addScaledVector(basis.z, z);
      else p.set(c.x + x, c.y + y, c.z + z);
      if (o.warp) o.warp(p, ft, fp, th, phi);
      row.push(mb.vert(p, ft * (o.uvScale?.[0] ?? 1), fp * (o.uvScale?.[1] ?? 1),
        o.colorAt?.(ft, fp, p), o.weightsAtVert?.(ft, fp, p)));
    }
    rows.push(row);
  }
  for (let ip = 0; ip < segP; ip++) {
    for (let it = 0; it < segT; it++) {
      const a = rows[ip][it], b = rows[ip][it + 1], cc = rows[ip + 1][it + 1], d = rows[ip + 1][it];
      // Degenerate at the poles: emit one triangle instead of a zero-area quad.
      if (ip === 0 && Math.abs(p0 + Math.PI / 2) < 1e-6) mb.tri(a, cc, d);
      else if (ip === segP - 1 && Math.abs(p1 - Math.PI / 2) < 1e-6) mb.tri(a, b, cc);
      else mb.quad(a, b, cc, d);
    }
  }
  void closed;
  return rows;
}

/**
 * A parametric surface patch. Used for the domino mask, the cap brim and the boot sole —
 * anything whose outline is authored as a 2D shape and then projected onto a form.
 * `at(u,v)` returns a Vector3.
 */
export function addPatch(mb, o) {
  const su = o.segU ?? 10, sv = o.segV ?? 6;
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

/**
 * A fur clump: a curved, lobed wedge.
 *
 * These exist purely for the silhouette. A smooth lofted limb reads as a vinyl toy no matter
 * how good the shader is, and under a cel ramp there is no shading gradient for a fur texture
 * to live in — so all the fur information there will ever be is in this outline.
 *
 * **Why it is a lobe and not a spike.** This used to taper to a single tip vertex, which put a
 * row of sharp triangles along every edge; the critic read them, correctly, as "a torn or burnt
 * edge". Real fur clumps are broad and blunt, they overlap, and no two are the same length — so
 * the edge *scallops*. The profile here is base → wide waist → short blunt tip, and the tip is
 * an edge rather than a point (`tipW`), which is the whole difference between reading as fur
 * and reading as a saw.
 *
 * `flat` squashes the section in the `up` axis, so a clump is a strap rather than a quill.
 */
export function addTuft(mb, o) {
  const base = o.base, dir = _v0.copy(o.dir).normalize();
  const len = o.length, w = o.width;
  const bend = o.bend ?? 0.25;
  const waist = o.waist ?? 0.86;      // how wide the clump still is at half length
  const tipW = o.tipW ?? 0.34;        // width of the blunt tip edge, as a fraction of `w`
  const side = _v1.crossVectors(dir, o.up || new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-8) side.crossVectors(dir, new THREE.Vector3(1, 0, 0));
  side.normalize();
  const up = _v2.crossVectors(side, dir).normalize();
  const bendV = (o.bendDir ? o.bendDir.clone().normalize() : up.clone()).multiplyScalar(len * bend);

  if (o.group) mb.group(o.group);
  mb.sg(o.sg ?? mb.newSg());
  if (o.weights) mb.weights(o.weights);
  if (o.color) mb.color(o.color);

  const S = side.clone(), Uv = up.clone(), D = dir.clone();
  const flat = o.flat ?? 1;
  const RN = 4;
  const ringAt = (centre, sw, uw, v) => {
    const out = [];
    for (let j = 0; j < RN; j++) {
      const a = (j / RN) * Math.PI * 2 + Math.PI / 4;
      out.push(mb.vert(new THREE.Vector3().copy(centre)
        .addScaledVector(S, Math.cos(a) * sw)
        .addScaledVector(Uv, Math.sin(a) * uw), j / RN, v));
    }
    return out;
  };

  const ring = ringAt(base, w, w * flat, 0);
  const midC = new THREE.Vector3().copy(base).addScaledVector(D, len * 0.52).addScaledVector(bendV, 0.28);
  const mid = ringAt(midC, w * waist, w * waist * flat, 0.52);
  const tipC = new THREE.Vector3().copy(base).addScaledVector(D, len).add(bendV);
  const tip = ringAt(tipC, w * tipW, w * tipW * flat * 0.5, 1);

  for (let j = 0; j < RN; j++) {
    const k = (j + 1) % RN;
    mb.quad(ring[j], ring[k], mid[k], mid[j]);
    mb.quad(mid[j], mid[k], tip[k], tip[j]);
  }
  mb.tri(tip[0], tip[1], tip[2]);
  mb.tri(tip[0], tip[2], tip[3]);
  return tip[0];
}

/** Box with six independent smoothing groups — every edge is hard. Buckles, brims, ferrules. */
export function addHardBox(mb, o) {
  const c = o.center, h = o.half;
  const bx = o.basis?.x || new THREE.Vector3(1, 0, 0);
  const by = o.basis?.y || new THREE.Vector3(0, 1, 0);
  const bz = o.basis?.z || new THREE.Vector3(0, 0, 1);
  if (o.group) mb.group(o.group);
  if (o.weights) mb.weights(o.weights);
  const P = (sx, sy, sz) => new THREE.Vector3().copy(c)
    .addScaledVector(bx, sx * h.x).addScaledVector(by, sy * h.y).addScaledVector(bz, sz * h.z);
  const corners = [
    P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1),
    P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1),
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  for (const f of faces) {
    mb.sg(mb.newSg());
    const idx = f.map((k, m) => mb.vert(corners[k], (m === 1 || m === 2) ? 1 : 0, (m >= 2) ? 1 : 0));
    mb.quad(idx[0], idx[1], idx[2], idx[3]);
  }
}

/** Catmull-Rom resample — control points in, N evenly parameterised points out. */
export function resample(points, n, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'catmullrom', tension);
  const out = [];
  for (let i = 0; i < n; i++) out.push(curve.getPoint(i / (n - 1)));
  return out;
}

/** Smooth 0→1 ramp. */
export const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Interpolate an authored weight ramp.
 *
 * @param {number} t                 0..1 along a chain
 * @param {Array<[number, object]>} stops  [[t, {boneName: amount}], ...] ascending
 * @returns {Array<[string,number]>}
 */
export function ramp(t, stops) {
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

/* ========================================================================== */
/*  Procedural maps                                                           */
/* ========================================================================== */

function heightToNormal(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const o = (y * size + x) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function grayTexture(vals, size, tint) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const g = THREE.MathUtils.clamp(vals[i], 0, 1);
    data[i * 4] = g * 255 * (tint?.r ?? 1);
    data[i * 4 + 1] = g * 255 * (tint?.g ?? 1);
    data[i * 4 + 2] = g * 255 * (tint?.b ?? 1);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Fur maps. The height field is *anisotropic on purpose*: thin ridges running along +V with
 * a low-frequency clumping mask, so strands read as combed hair rather than noise. That
 * directional flow, plus the sss wrap term from SHADING, is what stops fur looking injection-
 * moulded — a symmetric bump map just reads as orange peel.
 */
export function makeFurMaps(size = 256, seed = 7) {
  const h = new Float32Array(size * size);
  const alb = new Float32Array(size * size);
  const STRANDS = 46;          // strands per tile width
  for (let y = 0; y < size; y++) {
    const fy = y / size;
    for (let x = 0; x < size; x++) {
      const fx = x / size;
      // clumping: strands bundle into locks, and the locks drift sideways as they go down
      const drift = (fbm2(fx * 3.1, fy * 1.2, { octaves: 3, seed }) - 0.5) * 0.16;
      const clump = fbm2(fx * 7 + 11, fy * 3 + 3, { octaves: 3, seed: seed + 3 });
      const s = (fx + drift) * STRANDS;
      const strand = Math.pow(Math.abs(Math.sin(s * Math.PI)), 0.55);
      // strands break into tapered segments along V so they don't read as extruded lines
      const seg = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin((fy * 6.5 + valueNoise2(s * 0.7, 0.5, seed) * 4) * Math.PI)), 0.7);
      const coarse = ridged2(fx * 5, fy * 5, { octaves: 3, seed: seed + 9 });
      const v = strand * seg * (0.45 + 0.75 * clump) + coarse * 0.22;
      h[y * size + x] = v;
      // Albedo modulation stays near white: it multiplies the authored fur colour.
      alb[y * size + x] = 0.80 + 0.28 * v * (0.55 + 0.45 * clump) - 0.10 * coarse;
    }
  }
  return {
    normal: heightToNormal(h, size, 2.2),
    detail: grayTexture(alb, size),
  };
}

/** Woven cloth: a fine over-under weave plus slub irregularity, so the shirt isn't a plane. */
export function makeClothMaps(size = 256, seed = 21) {
  const h = new Float32Array(size * size);
  const alb = new Float32Array(size * size);
  const W = 34;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size, fy = y / size;
      const warp = Math.sin(fx * W * Math.PI * 2);
      const weft = Math.sin(fy * W * Math.PI * 2);
      const over = (Math.floor(fx * W) + Math.floor(fy * W)) % 2 === 0;
      const weave = over ? Math.abs(warp) * 0.9 : Math.abs(weft) * 0.9;
      const slub = fbm2(fx * 9, fy * 9, { octaves: 4, seed }) * 0.4;
      const wear = fbm2(fx * 2.2 + 5, fy * 2.2, { octaves: 4, seed: seed + 5 });
      h[y * size + x] = weave * 0.8 + slub;
      alb[y * size + x] = 0.86 + 0.14 * weave - 0.13 * (1 - wear) + 0.05 * slub;
    }
  }
  return { normal: heightToNormal(h, size, 1.5), detail: grayTexture(alb, size) };
}

/** Hammered gold: shallow dishing plus fine chase marks. Gold has to look *worked*. */
export function makeMetalMaps(size = 256, seed = 33) {
  const h = new Float32Array(size * size);
  const alb = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size, fy = y / size;
      const dish = fbm2(fx * 6, fy * 6, { octaves: 3, seed }) * 0.7;
      const chase = Math.abs(Math.sin((fx * 40 + fbm2(fx * 4, fy * 4, { seed: seed + 1 }) * 8) * Math.PI)) * 0.18;
      const grime = 1 - ridged2(fx * 3, fy * 3, { octaves: 4, seed: seed + 7 }) * 0.45;
      h[y * size + x] = dish + chase;
      alb[y * size + x] = 0.80 + 0.30 * dish * grime + 0.10 * chase;
    }
  }
  return { normal: heightToNormal(h, size, 1.9), detail: grayTexture(alb, size) };
}

/**
 * Deterministic per-vertex tone jitter so no fur region is a single flat value.
 *
 * **Vertex colour is a MULTIPLIER**, in every shader path three.js offers — it lands as
 * `diffuseColor *= vColor`. So this returns a value centred on white. Writing an absolute
 * palette colour here squares the material colour instead of modulating it: shirt-blue
 * `#2f7fc4` under a shirt-blue material resolves to `#083f97`, fur `#7a8ba8` under fur to
 * `#3a4c6e`, and every group collapses into the same near-black navy. That is precisely how
 * a model with a cap, a mask, a ringed tail and a cream chest rendered as one flat purple
 * mannequin. Hue and value belong to the material; this only breaks up the surface.
 *
 * `shift` is an optional deliberate offset on top of the jitter — a number to lift or drop
 * a region's value, or a THREE.Color to push its hue. Default (null) = pure neutral.
 */
export function furTint(out, x, y, z, amount = 0.055, seed = 4, shift = null) {
  const n = fbm2(x * 5.5 + 20, y * 5.5 + z * 3.1, { octaves: 3, seed });
  const m = valueNoise2(y * 13.0, z * 13.0 + x * 7.0, seed + 11);
  const k = 1 + (n - 0.5) * 2 * amount + (m - 0.5) * amount * 0.7;
  if (shift === null) out.setRGB(k, k, k);
  else if (typeof shift === 'number') out.setRGB(k * shift, k * shift, k * shift);
  else out.setRGB(k * shift.r, k * shift.g, k * shift.b);
  return out;
}

export { rng };

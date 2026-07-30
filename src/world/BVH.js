import * as THREE from 'three';

/**
 * BVH.js — the spatial acceleration structure behind COLLISION.
 *
 * Everything here is deliberately allocation-free after `build()`: triangles live in flat
 * typed arrays, nodes live in flat typed arrays, traversal uses a preallocated stack, and
 * the geometric kernels write their results into module-scope scalars rather than Vector3s.
 * MOVEMENT does dozens of queries per frame and a single `new Vector3()` in that path is a
 * GC hitch waiting to eat a jump input.
 *
 * The two kernels that matter:
 *
 *   closestSegTriangle()  — exact closest point between a line segment and a triangle,
 *                           covering all Voronoi regions (face / edge / vertex).
 *   sweepCapsuleTri()     — conservative advancement on top of it. Because the distance
 *                           between two convex sets is a *convex* function of their relative
 *                           translation, Newton stepping `t += gap / closingSpeed` is
 *                           provably conservative: it can never step past the first contact.
 *                           That is what makes the sweep exact rather than approximate, and
 *                           it is why a capsule cannot tunnel a wall at any speed.
 */

/* Tag ids are stored per-triangle as a byte, so they must be a fixed, ordered set. */
export const TAG_NAMES = ['ground', 'wall', 'ledge', 'rail', 'pole', 'hook', 'spire', 'vent', 'water', 'hazard', 'misc'];
export const TAG_ID = Object.fromEntries(TAG_NAMES.map((n, i) => [n, i]));
export const MAT_NAMES = ['stone', 'sand', 'wood', 'metal', 'cloth', 'water', 'flesh', 'misc'];
export const MAT_ID = Object.fromEntries(MAT_NAMES.map((n, i) => [n, i]));

export const FLAG_ONEWAY = 1;
export const FLAG_CLIMBABLE = 2;
export const FLAG_ANALYTIC = 4;      // terrain proxy — groundCheck refines against heightAt()

const MAX_LEAF = 8;                  // small leaves keep the per-candidate CA loop short
const BINS = 16;
const CA_ITERS = 12;
const CA_EPS = 1e-4;
const EPS = 1e-9;

/* ===================================================================== */
/* Geometric kernels — results land in these module scalars.             */
/* ===================================================================== */

/** Closest point on a triangle to a point. */
let _tpx = 0, _tpy = 0, _tpz = 0;
/** Closest point on the segment. */
let _spx = 0, _spy = 0, _spz = 0;
/** Contact normal (triangle → capsule), unit length. */
let _nx = 0, _ny = 0, _nz = 0;

/** Ericson, Real-Time Collision Detection §5.1.5. Writes _tpx/_tpy/_tpz. */
function closestPtPointTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { _tpx = ax; _tpy = ay; _tpz = az; return; }

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { _tpx = bx; _tpy = by; _tpz = bz; return; }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    _tpx = ax + abx * v; _tpy = ay + aby * v; _tpz = az + abz * v; return;
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { _tpx = cx; _tpy = cy; _tpz = cz; return; }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    _tpx = ax + acx * w; _tpy = ay + acy * w; _tpz = az + acz * w; return;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    _tpx = bx + (cx - bx) * w; _tpy = by + (cy - by) * w; _tpz = bz + (cz - bz) * w; return;
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  _tpx = ax + abx * v + acx * w;
  _tpy = ay + aby * v + acy * w;
  _tpz = az + abz * v + acz * w;
}

/* Segment-segment closest points, kept out of the shared scalars so the triangle
   routine can compare candidates without clobbering its running best. */
let _ssax = 0, _ssay = 0, _ssaz = 0, _ssbx = 0, _ssby = 0, _ssbz = 0;

/** Ericson §5.1.9. Returns squared distance; writes _ssa* (on seg1) and _ssb* (on seg2). */
function closestPtSegSeg(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;

  if (a <= EPS && e <= EPS) {
    _ssax = p1x; _ssay = p1y; _ssaz = p1z;
    _ssbx = p2x; _ssby = p2y; _ssbz = p2z;
    return rx * rx + ry * ry + rz * rz;
  }
  if (a <= EPS) {
    t = f / e; t = t < 0 ? 0 : t > 1 ? 1 : t;
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s;
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      if (denom > EPS) {
        s = (b * f - c * e) / denom;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
      } else s = 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
      else if (t > 1) { t = 1; s = (b - c) / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    }
  }
  _ssax = p1x + d1x * s; _ssay = p1y + d1y * s; _ssaz = p1z + d1z * s;
  _ssbx = p2x + d2x * t; _ssby = p2y + d2y * t; _ssbz = p2z + d2z * t;
  const dx = _ssax - _ssbx, dy = _ssay - _ssby, dz = _ssaz - _ssbz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Exact squared distance between segment [a,b] and triangle (t0,t1,t2).
 * Writes the closest point on the segment to _spx/_spy/_spz and on the triangle to
 * _tpx/_tpy/_tpz.
 *
 * For two convex polytopes the closest feature pair is vertex-face, vertex-edge,
 * vertex-vertex or edge-edge; enumerating {segment endpoints vs triangle} plus
 * {segment vs each triangle edge} covers all of them, and the plane-crossing test
 * catches actual interpenetration.
 */
export function closestSegTriangle(
  ax, ay, az, bx, by, bz,
  v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z,
  nx, ny, nz
) {
  // Interpenetration: does the segment pierce the triangle?
  const da = nx * (ax - v0x) + ny * (ay - v0y) + nz * (az - v0z);
  const db = nx * (bx - v0x) + ny * (by - v0y) + nz * (bz - v0z);
  if ((da > 0) !== (db > 0)) {
    const s = da / (da - db);
    const px = ax + (bx - ax) * s, py = ay + (by - ay) * s, pz = az + (bz - az) * s;
    closestPtPointTriangle(px, py, pz, v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z);
    const ex = px - _tpx, ey = py - _tpy, ez = pz - _tpz;
    if (ex * ex + ey * ey + ez * ez < 1e-12) {
      _spx = px; _spy = py; _spz = pz;
      return 0;
    }
  }

  let best = Infinity;

  closestPtPointTriangle(ax, ay, az, v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z);
  let dx = ax - _tpx, dy = ay - _tpy, dz = az - _tpz;
  let d2 = dx * dx + dy * dy + dz * dz;
  best = d2; _spx = ax; _spy = ay; _spz = az;
  let btx = _tpx, bty = _tpy, btz = _tpz;

  closestPtPointTriangle(bx, by, bz, v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z);
  dx = bx - _tpx; dy = by - _tpy; dz = bz - _tpz;
  d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < best) { best = d2; _spx = bx; _spy = by; _spz = bz; btx = _tpx; bty = _tpy; btz = _tpz; }

  d2 = closestPtSegSeg(ax, ay, az, bx, by, bz, v0x, v0y, v0z, v1x, v1y, v1z);
  if (d2 < best) { best = d2; _spx = _ssax; _spy = _ssay; _spz = _ssaz; btx = _ssbx; bty = _ssby; btz = _ssbz; }

  d2 = closestPtSegSeg(ax, ay, az, bx, by, bz, v1x, v1y, v1z, v2x, v2y, v2z);
  if (d2 < best) { best = d2; _spx = _ssax; _spy = _ssay; _spz = _ssaz; btx = _ssbx; bty = _ssby; btz = _ssbz; }

  d2 = closestPtSegSeg(ax, ay, az, bx, by, bz, v2x, v2y, v2z, v0x, v0y, v0z);
  if (d2 < best) { best = d2; _spx = _ssax; _spy = _ssay; _spz = _ssaz; btx = _ssbx; bty = _ssby; btz = _ssbz; }

  _tpx = btx; _tpy = bty; _tpz = btz;
  return best;
}

/* Accessors so callers (and the unit test) can read the kernel's output. */
export function segPointX() { return _spx; }
export function segPointY() { return _spy; }
export function segPointZ() { return _spz; }
export function triPointX() { return _tpx; }
export function triPointY() { return _tpy; }
export function triPointZ() { return _tpz; }
export function normalX() { return _nx; }
export function normalY() { return _ny; }
export function normalZ() { return _nz; }

/**
 * Conservative advancement of capsule (segment a..b, radius r) translating along v.
 * Returns the parametric time of first contact in [0, tMax], or -1 for a clean miss.
 * Writes the *geometric* contact normal (triangle → capsule) into _nx/_ny/_nz.
 */
export function sweepCapsuleTri(
  ax, ay, az, bx, by, bz, vx, vy, vz, r, tMax,
  v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z, nx, ny, nz
) {
  let t = 0;
  for (let k = 0; k < CA_ITERS; k++) {
    const ox = vx * t, oy = vy * t, oz = vz * t;
    const d2 = closestSegTriangle(
      ax + ox, ay + oy, az + oz, bx + ox, by + oy, bz + oz,
      v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z, nx, ny, nz
    );
    const d = Math.sqrt(d2);
    const gap = d - r;

    if (d > 1e-7) {
      const inv = 1 / d;
      _nx = (_spx - _tpx) * inv; _ny = (_spy - _tpy) * inv; _nz = (_spz - _tpz) * inv;
    } else {
      // Segment is on or through the face: the Minkowski normal is undefined, so fall back to
      // the plane normal signed by whichever side the capsule's midpoint sits on.
      const mx = (ax + bx) * 0.5 + ox, my = (ay + by) * 0.5 + oy, mz = (az + bz) * 0.5 + oz;
      const s = nx * (mx - v0x) + ny * (my - v0y) + nz * (mz - v0z) < 0 ? -1 : 1;
      _nx = nx * s; _ny = ny * s; _nz = nz * s;
    }

    if (gap <= CA_EPS) return t;

    const closing = -(vx * _nx + vy * _ny + vz * _nz);
    // Convexity: if the distance is not decreasing here it never will. Guaranteed miss.
    if (closing <= 1e-9) return -1;

    const step = gap / closing;
    t += step;
    if (t > tMax) return -1;
    // Stalled on a kink in the distance function — stop here; CA only ever undershoots,
    // so this is a safe (slightly early) contact rather than a tunnel.
    if (step < 1e-7) return t;
  }
  return t;
}

/** Möller–Trumbore, two-sided. Returns t along dir or -1. */
export function rayTriangle(
  ox, oy, oz, dx, dy, dz,
  v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z, tMax
) {
  const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
  const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-12 && det < 1e-12) return -1;
  const inv = 1 / det;
  const tx = ox - v0x, ty = oy - v0y, tz = oz - v0z;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (t < 1e-6 || t > tMax) return -1;
  return t;
}

/* ===================================================================== */
/* Triangle soup — world-space flattening of registered meshes           */
/* ===================================================================== */

const _m4 = new THREE.Matrix4();

export class TriangleSoup {
  constructor() {
    this.cap = 4096;
    this.count = 0;
    this.pos = new Float32Array(this.cap * 9);
    this.nrm = new Float32Array(this.cap * 3);
    this.rec = new Uint32Array(this.cap);
    this.tag = new Uint8Array(this.cap);
    this.mat = new Uint8Array(this.cap);
    this.flag = new Uint8Array(this.cap);
    this._vbuf = new Float64Array(3072);
    this.skipped = { degenerate: 0, nonFinite: 0, noPosition: 0 };
  }

  _grow(need) {
    if (need <= this.cap) return;
    let cap = this.cap;
    while (cap < need) cap *= 2;
    const pos = new Float32Array(cap * 9); pos.set(this.pos); this.pos = pos;
    const nrm = new Float32Array(cap * 3); nrm.set(this.nrm); this.nrm = nrm;
    const rec = new Uint32Array(cap); rec.set(this.rec); this.rec = rec;
    const tag = new Uint8Array(cap); tag.set(this.tag); this.tag = tag;
    const mat = new Uint8Array(cap); mat.set(this.mat); this.mat = mat;
    const flag = new Uint8Array(cap); flag.set(this.flag); this.flag = flag;
    this.cap = cap;
  }

  /**
   * Flatten every triangle of `object` (and its mesh descendants) into world space.
   * Respects matrixWorld, InstancedMesh matrices, missing indices and drawRange, and
   * silently drops anything degenerate or non-finite. Never throws.
   */
  addObject(object, recIdx, tagIdx, matIdx, flags, warn) {
    let added = 0;
    object.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const geo = o.geometry;
      const attr = geo?.attributes?.position;
      if (!attr) { this.skipped.noPosition++; warn?.(`no position attribute on "${o.name || 'unnamed'}"`); return; }

      const vcount = attr.count;
      if (this._vbuf.length < vcount * 3) this._vbuf = new Float64Array(vcount * 3);
      const index = geo.index;
      const src = attr.array;
      const itemSize = attr.itemSize >= 3 ? attr.itemSize : 3;
      const offset = attr.offset || 0;
      const stride = attr.data ? attr.data.stride : itemSize;   // interleaved buffers

      const instances = o.isInstancedMesh ? o.count : 1;
      for (let inst = 0; inst < instances; inst++) {
        // A collider registered with a malformed mesh used to throw here and take down the
        // whole frame. Skipping it loses one surface; throwing loses the game.
        if (!o.matrixWorld?.elements) break;
        if (o.isInstancedMesh) {
          if (!o.instanceMatrix?.array) break;
          _m4.fromArray(o.instanceMatrix.array, inst * 16);
          _m4.premultiply(o.matrixWorld);
        } else {
          _m4.copy(o.matrixWorld);
        }
        const e = _m4.elements;
        const b = this._vbuf;
        for (let i = 0; i < vcount; i++) {
          const k = offset + i * stride;
          const x = src[k], y = src[k + 1], z = src[k + 2];
          const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
          const iw = w === 1 ? 1 : 1 / w;
          b[i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * iw;
          b[i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * iw;
          b[i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * iw;
        }

        const dr = geo.drawRange || { start: 0, count: Infinity };
        const total = index ? index.count : vcount;
        const start = Math.max(0, dr.start | 0);
        const end = Math.min(total, dr.count === Infinity ? total : start + dr.count);
        const iarr = index ? index.array : null;

        for (let i = start; i + 2 < end; i += 3) {
          const ia = iarr ? iarr[i] : i;
          const ib = iarr ? iarr[i + 1] : i + 1;
          const ic = iarr ? iarr[i + 2] : i + 2;
          if (ia >= vcount || ib >= vcount || ic >= vcount) continue;
          added += this._push(b, ia, ib, ic, recIdx, tagIdx, matIdx, flags);
        }
      }
    });
    return added;
  }

  _push(b, ia, ib, ic, recIdx, tagIdx, matIdx, flags) {
    const ax = b[ia * 3], ay = b[ia * 3 + 1], az = b[ia * 3 + 2];
    const bx = b[ib * 3], by = b[ib * 3 + 1], bz = b[ib * 3 + 2];
    const cx = b[ic * 3], cy = b[ic * 3 + 1], cz = b[ic * 3 + 2];

    const sum = ax + ay + az + bx + by + bz + cx + cy + cz;
    if (!Number.isFinite(sum)) { this.skipped.nonFinite++; return 0; }

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    // Twice the triangle area. Below this a "triangle" is a sliver that produces garbage
    // normals, which is worse than not having it at all.
    if (len < 1e-10) { this.skipped.degenerate++; return 0; }
    const inv = 1 / len;
    nx *= inv; ny *= inv; nz *= inv;

    this._grow(this.count + 1);
    const i = this.count++;
    const p = i * 9;
    const P = this.pos;
    P[p] = ax; P[p + 1] = ay; P[p + 2] = az;
    P[p + 3] = bx; P[p + 4] = by; P[p + 5] = bz;
    P[p + 6] = cx; P[p + 7] = cy; P[p + 8] = cz;
    const q = i * 3;
    this.nrm[q] = nx; this.nrm[q + 1] = ny; this.nrm[q + 2] = nz;
    this.rec[i] = recIdx;
    this.tag[i] = tagIdx;
    this.mat[i] = matIdx;
    this.flag[i] = flags;
    return 1;
  }
}

/* ===================================================================== */
/* The BVH                                                              */
/* ===================================================================== */

export class TriBVH {
  constructor() {
    this.triCount = 0;
    this.nodeCount = 0;
    this.leafCount = 0;
    this.maxDepth = 0;
    this.pos = null; this.nrm = null; this.rec = null;
    this.tag = null; this.mat = null; this.flag = null;
    this.bounds = null;       // Float32Array(node*6): minx,miny,minz,maxx,maxy,maxz
    this.links = null;        // Int32Array(node*2): [leftChild|firstTri, triCount(0 = internal)]

    /** Per-tag gate, filled by COLLISION before each query. 1 = considered. */
    this.tagAllow = new Uint8Array(32);

    this._stack = new Int32Array(256);
    this._cand = new Int32Array(1 << 14);
    this.candCount = 0;
    this.candOverflow = false;

    /* Last sweep/raycast result. */
    this.hitT = -1; this.hitTri = -1;
    this.hitNx = 0; this.hitNy = 1; this.hitNz = 0;

    this.bmin = new Float32Array(3);
    this.bmax = new Float32Array(3);
  }

  /** Adopt a TriangleSoup and build the hierarchy. Returns build stats. */
  build(soup) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const N = soup.count;
    this.triCount = N;
    this.nodeCount = 0; this.leafCount = 0; this.maxDepth = 0;

    if (N === 0) {
      this.pos = new Float32Array(0); this.nrm = new Float32Array(0);
      this.rec = new Uint32Array(0); this.tag = new Uint8Array(0);
      this.mat = new Uint8Array(0); this.flag = new Uint8Array(0);
      this.bounds = new Float32Array(0); this.links = new Int32Array(0);
      return { tris: 0, nodes: 0, leaves: 0, depth: 0, ms: 0 };
    }

    const srcPos = soup.pos;
    const cen = new Float32Array(N * 3);
    const idx = new Uint32Array(N);
    for (let i = 0; i < N; i++) {
      idx[i] = i;
      const p = i * 9;
      cen[i * 3] = (srcPos[p] + srcPos[p + 3] + srcPos[p + 6]) / 3;
      cen[i * 3 + 1] = (srcPos[p + 1] + srcPos[p + 4] + srcPos[p + 7]) / 3;
      cen[i * 3 + 2] = (srcPos[p + 2] + srcPos[p + 5] + srcPos[p + 8]) / 3;
    }

    const cap = 2 * N + 1;
    const bounds = new Float32Array(cap * 6);
    const links = new Int32Array(cap * 2);
    let nodeCount = 1;

    const triBounds = (i, out) => {
      const p = i * 9;
      const ax = srcPos[p], ay = srcPos[p + 1], az = srcPos[p + 2];
      const bx = srcPos[p + 3], by = srcPos[p + 4], bz = srcPos[p + 5];
      const cx = srcPos[p + 6], cy = srcPos[p + 7], cz = srcPos[p + 8];
      out[0] = Math.min(ax, bx, cx); out[1] = Math.min(ay, by, cy); out[2] = Math.min(az, bz, cz);
      out[3] = Math.max(ax, bx, cx); out[4] = Math.max(ay, by, cy); out[5] = Math.max(az, bz, cz);
    };

    const tb = new Float32Array(6);
    const nodeBoundsOf = (start, count, o) => {
      let n0 = Infinity, n1 = Infinity, n2 = Infinity, x0 = -Infinity, x1 = -Infinity, x2 = -Infinity;
      for (let k = start; k < start + count; k++) {
        triBounds(idx[k], tb);
        if (tb[0] < n0) n0 = tb[0]; if (tb[1] < n1) n1 = tb[1]; if (tb[2] < n2) n2 = tb[2];
        if (tb[3] > x0) x0 = tb[3]; if (tb[4] > x1) x1 = tb[4]; if (tb[5] > x2) x2 = tb[5];
      }
      bounds[o] = n0; bounds[o + 1] = n1; bounds[o + 2] = n2;
      bounds[o + 3] = x0; bounds[o + 4] = x1; bounds[o + 5] = x2;
    };

    nodeBoundsOf(0, N, 0);

    /* Explicit stack: a pathological tree could recurse deeper than is comfortable. */
    const stack = [0, 0, N, 0];
    const binCount = new Int32Array(BINS);
    const binMin = new Float32Array(BINS * 3);
    const binMax = new Float32Array(BINS * 3);
    const leftArea = new Float32Array(BINS);
    const leftCnt = new Int32Array(BINS);

    while (stack.length) {
      const depth = stack.pop();
      const count = stack.pop();
      const start = stack.pop();
      const node = stack.pop();
      if (depth > this.maxDepth) this.maxDepth = depth;

      if (count <= MAX_LEAF || depth > 60) {
        links[node * 2] = start; links[node * 2 + 1] = count;
        this.leafCount++;
        continue;
      }

      /* Split plane: binned SAH along the longest axis of the centroid bounds. One axis
         rather than three keeps a 100k-triangle build well under a frame's worth of time
         and costs almost nothing in tree quality at these leaf sizes. */
      let cn0 = Infinity, cn1 = Infinity, cn2 = Infinity, cx0 = -Infinity, cx1 = -Infinity, cx2 = -Infinity;
      for (let k = start; k < start + count; k++) {
        const c = idx[k] * 3;
        const a = cen[c], b = cen[c + 1], d = cen[c + 2];
        if (a < cn0) cn0 = a; if (b < cn1) cn1 = b; if (d < cn2) cn2 = d;
        if (a > cx0) cx0 = a; if (b > cx1) cx1 = b; if (d > cx2) cx2 = d;
      }
      const ex = cx0 - cn0, ey = cx1 - cn1, ez = cx2 - cn2;
      const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
      const lo = axis === 0 ? cn0 : axis === 1 ? cn1 : cn2;
      const extent = axis === 0 ? ex : axis === 1 ? ey : ez;

      let splitAt = -1;
      if (extent > 1e-7) {
        binCount.fill(0);
        for (let b = 0; b < BINS; b++) {
          binMin[b * 3] = binMin[b * 3 + 1] = binMin[b * 3 + 2] = Infinity;
          binMax[b * 3] = binMax[b * 3 + 1] = binMax[b * 3 + 2] = -Infinity;
        }
        const scale = BINS / extent;
        for (let k = start; k < start + count; k++) {
          const ti = idx[k];
          let b = ((cen[ti * 3 + axis] - lo) * scale) | 0;
          if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1;
          binCount[b]++;
          triBounds(ti, tb);
          const o = b * 3;
          if (tb[0] < binMin[o]) binMin[o] = tb[0];
          if (tb[1] < binMin[o + 1]) binMin[o + 1] = tb[1];
          if (tb[2] < binMin[o + 2]) binMin[o + 2] = tb[2];
          if (tb[3] > binMax[o]) binMax[o] = tb[3];
          if (tb[4] > binMax[o + 1]) binMax[o + 1] = tb[4];
          if (tb[5] > binMax[o + 2]) binMax[o + 2] = tb[5];
        }

        let mn0 = Infinity, mn1 = Infinity, mn2 = Infinity, mx0 = -Infinity, mx1 = -Infinity, mx2 = -Infinity;
        let acc = 0;
        for (let b = 0; b < BINS - 1; b++) {
          const o = b * 3;
          if (binCount[b]) {
            if (binMin[o] < mn0) mn0 = binMin[o];
            if (binMin[o + 1] < mn1) mn1 = binMin[o + 1];
            if (binMin[o + 2] < mn2) mn2 = binMin[o + 2];
            if (binMax[o] > mx0) mx0 = binMax[o];
            if (binMax[o + 1] > mx1) mx1 = binMax[o + 1];
            if (binMax[o + 2] > mx2) mx2 = binMax[o + 2];
            acc += binCount[b];
          }
          leftCnt[b] = acc;
          leftArea[b] = acc ? surfaceArea(mx0 - mn0, mx1 - mn1, mx2 - mn2) : 0;
        }

        mn0 = mn1 = mn2 = Infinity; mx0 = mx1 = mx2 = -Infinity;
        acc = 0;
        let bestCost = Infinity, bestBin = -1;
        for (let b = BINS - 1; b > 0; b--) {
          const o = b * 3;
          if (binCount[b]) {
            if (binMin[o] < mn0) mn0 = binMin[o];
            if (binMin[o + 1] < mn1) mn1 = binMin[o + 1];
            if (binMin[o + 2] < mn2) mn2 = binMin[o + 2];
            if (binMax[o] > mx0) mx0 = binMax[o];
            if (binMax[o + 1] > mx1) mx1 = binMax[o + 1];
            if (binMax[o + 2] > mx2) mx2 = binMax[o + 2];
            acc += binCount[b];
          }
          const lc = leftCnt[b - 1];
          if (lc === 0 || acc === 0) continue;
          const cost = leftArea[b - 1] * lc + surfaceArea(mx0 - mn0, mx1 - mn1, mx2 - mn2) * acc;
          if (cost < bestCost) { bestCost = cost; bestBin = b; }
        }

        if (bestBin > 0) {
          // Partition idx[start..start+count) around the chosen bin.
          let i = start, j = start + count - 1;
          while (i <= j) {
            const ti = idx[i];
            let b = ((cen[ti * 3 + axis] - lo) * scale) | 0;
            if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1;
            if (b < bestBin) i++;
            else { idx[i] = idx[j]; idx[j] = ti; j--; }
          }
          splitAt = i;
        }
      }

      if (splitAt <= start || splitAt >= start + count) {
        // SAH gave nothing usable (coincident centroids, zero extent): median split keeps
        // the tree balanced instead of degenerating into a list.
        splitAt = start + (count >> 1);
        nthElement(idx, cen, start, start + count - 1, splitAt, axis);
      }

      const left = nodeCount++, right = nodeCount++;
      links[node * 2] = left; links[node * 2 + 1] = 0;
      nodeBoundsOf(start, splitAt - start, left * 6);
      nodeBoundsOf(splitAt, start + count - splitAt, right * 6);
      stack.push(left, start, splitAt - start, depth + 1);
      stack.push(right, splitAt, start + count - splitAt, depth + 1);
    }

    /* Reorder triangle data into leaf order — a leaf's triangles then sit contiguous in
       memory, which is the whole point of the flat arrays. */
    this.pos = new Float32Array(N * 9);
    this.nrm = new Float32Array(N * 3);
    this.rec = new Uint32Array(N);
    this.tag = new Uint8Array(N);
    this.mat = new Uint8Array(N);
    this.flag = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const s = idx[i];
      this.pos.set(soup.pos.subarray(s * 9, s * 9 + 9), i * 9);
      this.nrm.set(soup.nrm.subarray(s * 3, s * 3 + 3), i * 3);
      this.rec[i] = soup.rec[s];
      this.tag[i] = soup.tag[s];
      this.mat[i] = soup.mat[s];
      this.flag[i] = soup.flag[s];
    }

    this.bounds = bounds.slice(0, nodeCount * 6);
    this.links = links.slice(0, nodeCount * 2);
    this.nodeCount = nodeCount;
    const need = (this.maxDepth + 8) * 2;
    if (this._stack.length < need) this._stack = new Int32Array(need);

    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { tris: N, nodes: nodeCount, leaves: this.leafCount, depth: this.maxDepth, ms };
  }

  /* ------------------------- traversal ------------------------------- */

  /**
   * Collect triangle indices whose AABB overlaps the given box into `this._cand`.
   * Returns the count; sets candOverflow if the buffer filled.
   */
  overlapBox(minx, miny, minz, maxx, maxy, maxz) {
    this.candCount = 0;
    this.candOverflow = false;
    if (this.nodeCount === 0) return 0;

    const B = this.bounds, L = this.links, P = this.pos, T = this.tag, A = this.tagAllow;
    const st = this._stack, cand = this._cand, capC = cand.length;
    let sp = 0;
    st[sp++] = 0;

    while (sp > 0) {
      const node = st[--sp];
      const o = node * 6;
      if (B[o] > maxx || B[o + 3] < minx || B[o + 1] > maxy || B[o + 4] < miny ||
          B[o + 2] > maxz || B[o + 5] < minz) continue;

      const cnt = L[node * 2 + 1];
      if (cnt === 0) {
        const left = L[node * 2];
        if (sp + 2 > st.length) continue;      // cannot happen with a sane depth; fail safe
        st[sp++] = left; st[sp++] = left + 1;
        continue;
      }
      const first = L[node * 2];
      for (let i = first; i < first + cnt; i++) {
        if (!A[T[i]]) continue;
        const p = i * 9;
        const ax = P[p], ay = P[p + 1], az = P[p + 2];
        const bx = P[p + 3], by = P[p + 4], bz = P[p + 5];
        const cx = P[p + 6], cy = P[p + 7], cz = P[p + 8];
        if (Math.min(ax, bx, cx) > maxx || Math.max(ax, bx, cx) < minx) continue;
        if (Math.min(ay, by, cy) > maxy || Math.max(ay, by, cy) < miny) continue;
        if (Math.min(az, bz, cz) > maxz || Math.max(az, bz, cz) < minz) continue;
        if (this.candCount >= capC) { this.candOverflow = true; return this.candCount; }
        cand[this.candCount++] = i;
      }
    }
    return this.candCount;
  }

  /**
   * Swept capsule against the whole hierarchy. `v` is the full displacement, so the returned
   * hitT is a fraction of it. `faceSnapCos` controls how aggressively an edge/vertex contact
   * is rewritten to the triangle's plane normal (see COLLISION's notes on internal edges).
   *
   * Returns hitT in [0,1], or -1. Result normal in hitNx/hitNy/hitNz, triangle in hitTri.
   */
  sweepCapsule(ax, ay, az, bx, by, bz, vx, vy, vz, radius, allowOneWay, faceSnapCos, pad) {
    this.hitT = -1; this.hitTri = -1;
    if (this.nodeCount === 0) return -1;

    const r = radius > 1e-5 ? radius : 1e-5;
    const grow = r + (pad || 0.01);
    const minx = Math.min(ax, bx, ax + vx, bx + vx) - grow;
    const miny = Math.min(ay, by, ay + vy, by + vy) - grow;
    const minz = Math.min(az, bz, az + vz, bz + vz) - grow;
    const maxx = Math.max(ax, bx, ax + vx, bx + vx) + grow;
    const maxy = Math.max(ay, by, ay + vy, by + vy) + grow;
    const maxz = Math.max(az, bz, az + vz, bz + vz) + grow;

    const n = this.overlapBox(minx, miny, minz, maxx, maxy, maxz);
    if (n === 0) return -1;

    const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const hasMotion = vlen > 1e-9;
    const dx = hasMotion ? vx / vlen : 0, dy = hasMotion ? vy / vlen : 0, dz = hasMotion ? vz / vlen : 0;

    const P = this.pos, NR = this.nrm, F = this.flag, cand = this._cand;
    let tBest = 1;
    let bestTri = -1, bnx = 0, bny = 0, bnz = 0;

    for (let ci = 0; ci < n; ci++) {
      const i = cand[ci];
      const q = i * 3;
      let tnx = NR[q], tny = NR[q + 1], tnz = NR[q + 2];
      const flags = F[i];

      if (flags & FLAG_ONEWAY) {
        if (!allowOneWay) continue;
        // Pass-through from below, solid from above: decided by the face's own normal
        // against the motion, never by position — a fast-moving player must not pop through.
        if (tny < 0.6) continue;
        if (!hasMotion || (dx * tnx + dy * tny + dz * tnz) >= -1e-4) continue;
      }

      const p = i * 9;
      const t = sweepCapsuleTri(
        ax, ay, az, bx, by, bz, vx, vy, vz, r, tBest,
        P[p], P[p + 1], P[p + 2], P[p + 3], P[p + 4], P[p + 5], P[p + 6], P[p + 7], P[p + 8],
        tnx, tny, tnz
      );
      if (t < 0) continue;

      let cnx = _nx, cny = _ny, cnz = _nz;

      /* Sign the plane normal toward the capsule, then snap the geometric normal onto it
         when they broadly agree. Internal edges between coplanar triangles otherwise hand
         back a normal tilted along the surface, and sliding on that is exactly the "player
         catches on a seam in the floor" bug. */
      const ox = vx * t, oy = vy * t, oz = vz * t;
      const mx = (ax + bx) * 0.5 + ox, my = (ay + by) * 0.5 + oy, mz = (az + bz) * 0.5 + oz;
      if (tnx * (mx - P[p]) + tny * (my - P[p + 1]) + tnz * (mz - P[p + 2]) < 0) {
        tnx = -tnx; tny = -tny; tnz = -tnz;
      }
      if (cnx * tnx + cny * tny + cnz * tnz >= faceSnapCos) { cnx = tnx; cny = tny; cnz = tnz; }

      // A contact that does not oppose the motion is not what stopped us. Dropping it here
      // (depenetration still resolves any residual overlap) is the other half of the
      // internal-edge fix.
      if (hasMotion && (dx * cnx + dy * cny + dz * cnz) > -1e-4) continue;

      tBest = t; bestTri = i; bnx = cnx; bny = cny; bnz = cnz;
      if (t <= 0) break;
    }

    if (bestTri < 0) return -1;
    this.hitT = tBest; this.hitTri = bestTri;
    this.hitNx = bnx; this.hitNy = bny; this.hitNz = bnz;
    return tBest;
  }

  /**
   * Nearest surface point to a capsule, used by depenetration and overlap tests.
   * Iterates a candidate list produced by a prior overlapBox() call so the caller can
   * reuse one gather across several push-out iterations.
   *
   * Returns the penetration depth (radius - distance), or -Infinity for no contact.
   * Result normal in hitNx/hitNy/hitNz, triangle in hitTri.
   */
  deepestContact(ax, ay, az, bx, by, bz, radius, allowOneWay, faceSnapCos, candCount) {
    this.hitTri = -1;
    const P = this.pos, NR = this.nrm, F = this.flag, cand = this._cand;
    let best = -Infinity, bestTri = -1, bnx = 0, bny = 1, bnz = 0;

    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;

    for (let ci = 0; ci < candCount; ci++) {
      const i = cand[ci];
      const flags = F[i];
      const q = i * 3, p = i * 9;
      let tnx = NR[q], tny = NR[q + 1], tnz = NR[q + 2];

      // Sign the plane normal toward the capsule's midpoint before anything else — the
      // one-way rule needs to know which side of the platform we are on.
      if (tnx * (mx - P[p]) + tny * (my - P[p + 1]) + tnz * (mz - P[p + 2]) < 0) {
        tnx = -tnx; tny = -tny; tnz = -tnz;
      }
      // A body under a one-way platform must never be pushed down out of it: pass through.
      if ((flags & FLAG_ONEWAY) && (!allowOneWay || tny < 0.6)) continue;

      const d2 = closestSegTriangle(
        ax, ay, az, bx, by, bz,
        P[p], P[p + 1], P[p + 2], P[p + 3], P[p + 4], P[p + 5], P[p + 6], P[p + 7], P[p + 8],
        tnx, tny, tnz
      );
      const d = Math.sqrt(d2);
      const pen = radius - d;
      if (pen <= best) continue;

      let cnx = tnx, cny = tny, cnz = tnz;
      if (d > 1e-7) {
        const inv = 1 / d;
        const gx = (_spx - _tpx) * inv, gy = (_spy - _tpy) * inv, gz = (_spz - _tpz) * inv;
        if (gx * tnx + gy * tny + gz * tnz < faceSnapCos) { cnx = gx; cny = gy; cnz = gz; }
      }

      best = pen; bestTri = i; bnx = cnx; bny = cny; bnz = cnz;
    }

    if (bestTri < 0) return -Infinity;
    this.hitTri = bestTri;
    this.hitNx = bnx; this.hitNy = bny; this.hitNz = bnz;
    return best;
  }

  /**
   * Closest hit along a ray. Ordered slab traversal with an early-out on the running best,
   * so a 200 m Thief-o-Vision probe still only visits the nodes it needs to.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, allowOneWay, twoSided) {
    this.hitT = -1; this.hitTri = -1;
    if (this.nodeCount === 0) return -1;

    const idx = 1 / (dx || 1e-20), idy = 1 / (dy || 1e-20), idz = 1 / (dz || 1e-20);
    const B = this.bounds, L = this.links, P = this.pos, NR = this.nrm, T = this.tag,
      F = this.flag, A = this.tagAllow;
    const st = this._stack;
    let sp = 0;
    st[sp++] = 0;
    let tBest = maxDist;
    let bestTri = -1;

    while (sp > 0) {
      const node = st[--sp];
      const o = node * 6;
      // Slab test.
      let t0 = (B[o] - ox) * idx, t1 = (B[o + 3] - ox) * idx;
      let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
      t0 = (B[o + 1] - oy) * idy; t1 = (B[o + 4] - oy) * idy;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      t0 = (B[o + 2] - oz) * idz; t1 = (B[o + 5] - oz) * idz;
      tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
      if (tmax < 0 || tmin > tmax || tmin > tBest) continue;

      const cnt = L[node * 2 + 1];
      if (cnt === 0) {
        const left = L[node * 2];
        if (sp + 2 <= st.length) { st[sp++] = left; st[sp++] = left + 1; }
        continue;
      }
      const first = L[node * 2];
      for (let i = first; i < first + cnt; i++) {
        if (!A[T[i]]) continue;
        const q = i * 3;
        const nd = dx * NR[q] + dy * NR[q + 1] + dz * NR[q + 2];
        if (F[i] & FLAG_ONEWAY) {
          if (!allowOneWay || NR[q + 1] < 0.6 || nd >= 0) continue;
        } else if (!twoSided && nd >= 0) continue;
        const p = i * 9;
        const t = rayTriangle(ox, oy, oz, dx, dy, dz,
          P[p], P[p + 1], P[p + 2], P[p + 3], P[p + 4], P[p + 5], P[p + 6], P[p + 7], P[p + 8], tBest);
        if (t < 0) continue;
        tBest = t; bestTri = i;
      }
    }

    if (bestTri < 0) return -1;
    const q = bestTri * 3;
    let nx = NR[q], ny = NR[q + 1], nz = NR[q + 2];
    if (dx * nx + dy * ny + dz * nz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    this.hitT = tBest; this.hitTri = bestTri;
    this.hitNx = nx; this.hitNy = ny; this.hitNz = nz;
    return tBest;
  }

  dispose() {
    this.pos = this.nrm = this.rec = this.tag = this.mat = this.flag = null;
    this.bounds = this.links = null;
    this.triCount = this.nodeCount = 0;
  }
}

function surfaceArea(w, h, d) {
  if (w < 0 || h < 0 || d < 0) return 0;
  return 2 * (w * h + h * d + d * w);
}

/**
 * Quickselect partition around the k-th element by centroid on `axis`. Only the median
 * fallback path uses it; an insertion sort here would make a pathological build O(n²).
 */
function nthElement(idx, cen, lo, hi, k, axis) {
  while (lo < hi) {
    const pivot = cen[idx[(lo + hi) >> 1] * 3 + axis];
    let i = lo, j = hi;
    while (i <= j) {
      while (cen[idx[i] * 3 + axis] < pivot) i++;
      while (cen[idx[j] * 3 + axis] > pivot) j--;
      if (i <= j) { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; i++; j--; }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return;
  }
}

/**
 * _decimate.mjs — quadric edge-collapse decimation that does not invent skin weights.
 *
 * WHY A HAND-ROLLED ONE. three's `SimplifyModifier` keeps `position` and drops every other
 * attribute, which on a skinned mesh means dropping `skinIndex`/`skinWeight` — i.e. producing a
 * mesh that cannot be bound to the rig it came from. The pistol this exists for is weighted to a
 * four-bone sub-armature and is animated by it in six of eleven clips, so the weights are the
 * whole reason the geometry is worth keeping.
 *
 * THE ONE DESIGN DECISION. Collapses are **half-edge**: an edge (a,b) always collapses onto one
 * of its two existing endpoints, never onto an invented optimal point. That costs a little
 * geometric accuracy against full QEM, and it buys the property that matters here — every
 * surviving vertex's UV, normal, `skinIndex` and `skinWeight` are bytes the artist authored, not
 * a blend this file made up. A blended `skinIndex` is not even well defined (it is an integer
 * bone id), so the alternative is either "invent" or "pick one anyway": this picks one, and says
 * so, and the picked one is geometrically the survivor rather than an arbitrary side.
 *
 * ATTRIBUTE SPLITS ARE PRESERVED. Positions are welded for the collapse graph, but each welded
 * vertex remembers every original vertex sharing that position (a UV seam or a hard normal
 * crease makes several). On a collapse b→a, a corner that referenced one of b's variants is
 * re-pointed at whichever of a's variants has the closest normal, so hard edges survive as hard
 * edges instead of being smoothed into the body.
 *
 * GUARDS. A collapse is rejected if it would flip any incident face by more than `maxFlip`, and
 * boundary edges carry a perpendicular constraint quadric so open borders keep their shape.
 * Neither is optional: without the flip test a decimating gun grows spikes, and the failing input
 * is on record in `tools/pistollp.mjs`'s report.
 */
import * as THREE from 'three';

/* Symmetric 4x4 quadric as 10 floats: xx xy xz xw yy yz yw zz zw ww */
function qAddPlane(q, a, b, c, d, w) {
  q[0] += w * a * a; q[1] += w * a * b; q[2] += w * a * c; q[3] += w * a * d;
  q[4] += w * b * b; q[5] += w * b * c; q[6] += w * b * d;
  q[7] += w * c * c; q[8] += w * c * d;
  q[9] += w * d * d;
}
function qEval(q, x, y, z) {
  return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x
       + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y
       + q[7] * z * z + 2 * q[8] * z
       + q[9];
}
function qAdd(dst, src) { for (let i = 0; i < 10; i++) dst[i] += src[i]; }

/**
 * @param {THREE.BufferGeometry} geo  indexed, with position (+ any of normal/uv/skinIndex/skinWeight)
 * @param {number} targetTris         triangles to stop at
 * @param {object} [opt]
 * @returns {{geometry: THREE.BufferGeometry, before: number, after: number, collapses: number,
 *            rejectedFlip: number, boundaryEdges: number}}
 *
 * It deliberately returns NO deviation figure. A quadric residual is cheap to compute here and
 * reads like an error in metres without being one; `tools/pistollp.mjs` measures the real thing
 * (every original vertex to the nearest point on the decimated SURFACE) and that is the number
 * anyone should quote.
 */
export function decimateSkinned(geo, targetTris, opt = {}) {
  const WELD = opt.weld ?? 1e-5;
  const MAXFLIP = Math.cos(THREE.MathUtils.degToRad(opt.maxFlipDeg ?? 75));
  const BOUNDARY_W = opt.boundaryWeight ?? 1000;

  const src = geo.index ? geo : geo.clone().setIndex(
    Array.from({ length: geo.attributes.position.count }, (_, i) => i));
  const pos = src.attributes.position;
  const nrm = src.attributes.normal;
  const idx = src.index;
  const nOrig = pos.count;

  /* ---- weld ---- */
  const q = 1 / WELD;
  const wOf = new Int32Array(nOrig);
  const wKey = new Map();
  const wPos = [];
  const variants = [];                                  // welded id -> original vertex ids
  for (let i = 0; i < nOrig; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let w = wKey.get(k);
    if (w === undefined) { w = wPos.length; wKey.set(k, w); wPos.push([x, y, z]); variants.push([]); }
    wOf[i] = w; variants[w].push(i);
  }
  const nW = wPos.length;

  /* ---- faces, in welded ids, remembering their original corners ---- */
  const faces = [];                                     // {w:[3], o:[3], dead}
  for (let t = 0; t < idx.count; t += 3) {
    const o = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const w = [wOf[o[0]], wOf[o[1]], wOf[o[2]]];
    if (w[0] === w[1] || w[1] === w[2] || w[0] === w[2]) continue;
    faces.push({ w, o, dead: false });
  }
  const before = faces.length;
  if (before <= targetTris) return { geometry: src, before, after: before, collapses: 0, rejectedFlip: 0, boundaryEdges: 0 };

  const inc = Array.from({ length: nW }, () => new Set());   // welded id -> face indices
  faces.forEach((f, i) => f.w.forEach((v) => inc[v].add(i)));

  const P = (v) => wPos[v];
  const faceNormal = (f, out = [0, 0, 0]) => {
    const [a, b, c] = f.w.map(P);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return out;
  };

  /* ---- quadrics ---- */
  const Q = Array.from({ length: nW }, () => new Float64Array(10));
  const n3 = [0, 0, 0];
  for (const f of faces) {
    faceNormal(f, n3);
    const len = Math.hypot(n3[0], n3[1], n3[2]);
    if (len < 1e-20) continue;
    const a = n3[0] / len, b = n3[1] / len, c = n3[2] / len;
    const p0 = P(f.w[0]);
    const d = -(a * p0[0] + b * p0[1] + c * p0[2]);
    const area = len * 0.5;
    for (const v of f.w) qAddPlane(Q[v], a, b, c, d, area);
  }

  /* ---- boundary constraint: an edge used by one face gets a plane perpendicular to it ---- */
  const edgeFaces = new Map();
  const ekey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  faces.forEach((f, i) => {
    for (let e = 0; e < 3; e++) {
      const k = ekey(f.w[e], f.w[(e + 1) % 3]);
      let a = edgeFaces.get(k); if (!a) edgeFaces.set(k, a = []);
      a.push(i);
    }
  });
  let boundaryEdges = 0;
  for (const [k, fl] of edgeFaces) {
    if (fl.length !== 1) continue;
    boundaryEdges++;
    const [ai, bi] = k.split('_').map(Number);
    const pa = P(ai), pb = P(bi);
    faceNormal(faces[fl[0]], n3);
    const ln = Math.hypot(n3[0], n3[1], n3[2]); if (ln < 1e-20) continue;
    const fx = n3[0] / ln, fy = n3[1] / ln, fz = n3[2] / ln;
    let ex = pb[0] - pa[0], ey = pb[1] - pa[1], ez = pb[2] - pa[2];
    const el = Math.hypot(ex, ey, ez); if (el < 1e-20) continue;
    ex /= el; ey /= el; ez /= el;
    /* plane containing the edge, perpendicular to the face */
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const nl = Math.hypot(nx, ny, nz); if (nl < 1e-20) continue;
    const a = nx / nl, b = ny / nl, c = nz / nl;
    const d = -(a * pa[0] + b * pa[1] + c * pa[2]);
    const w = BOUNDARY_W * el;
    qAddPlane(Q[ai], a, b, c, d, w); qAddPlane(Q[bi], a, b, c, d, w);
  }

  /* ---- candidate edges ---- */
  const alive = new Uint8Array(nW).fill(1);
  const stamp = new Int32Array(nW);                     // bumped whenever a vertex changes
  const heap = [];
  const cost = (a, b) => {
    const s = new Float64Array(10); qAdd(s, Q[a]); qAdd(s, Q[b]);
    const pa = P(a), pb = P(b);
    const ca = qEval(s, pa[0], pa[1], pa[2]);
    const cb = qEval(s, pb[0], pb[1], pb[2]);
    /* collapse the LOSER onto the WINNER: keep the endpoint with the lower error there */
    return ca <= cb ? { c: ca, keep: a, drop: b } : { c: cb, keep: b, drop: a };
  };
  const push = (a, b) => {
    const r = cost(a, b);
    heap.push({ c: r.c, keep: r.keep, drop: r.drop, sa: stamp[a], sb: stamp[b], a, b });
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].c <= heap[i].c) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l].c < heap[m].c) m = l;
        if (r < heap.length && heap[r].c < heap[m].c) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  for (const k of edgeFaces.keys()) { const [a, b] = k.split('_').map(Number); push(a, b); }

  /* ---- collapse loop ---- */
  let live = before, collapses = 0, rejectedFlip = 0;
  const nBefore = [0, 0, 0], nAfter = [0, 0, 0];
  while (live > targetTris && heap.length) {
    const e = pop();
    if (!alive[e.a] || !alive[e.b]) continue;
    if (stamp[e.a] !== e.sa || stamp[e.b] !== e.sb) { push(e.a, e.b); continue; }
    const keep = e.keep, drop = e.drop;

    /* flip test: every face that survives the collapse must keep its winding */
    const moving = [...inc[drop]].filter((fi) => !faces[fi].dead);
    let flips = false;
    for (const fi of moving) {
      const f = faces[fi];
      if (f.w.includes(keep)) continue;                 // this face dies in the collapse
      faceNormal(f, nBefore);
      const lb = Math.hypot(nBefore[0], nBefore[1], nBefore[2]);
      const saved = f.w.slice();
      f.w = f.w.map((v) => (v === drop ? keep : v));
      faceNormal(f, nAfter);
      const la = Math.hypot(nAfter[0], nAfter[1], nAfter[2]);
      f.w = saved;
      if (lb < 1e-20 || la < 1e-20) { flips = true; break; }
      const dot = (nBefore[0] * nAfter[0] + nBefore[1] * nAfter[1] + nBefore[2] * nAfter[2]) / (lb * la);
      if (dot < MAXFLIP) { flips = true; break; }
    }
    if (flips) { rejectedFlip++; continue; }

    /* commit */
    for (const fi of moving) {
      const f = faces[fi];
      if (f.dead) continue;
      if (f.w.includes(keep)) { f.dead = true; live--; for (const v of f.w) inc[v].delete(fi); continue; }
      /* re-point the corner: the surviving variant with the closest authored normal */
      for (let c = 0; c < 3; c++) {
        if (f.w[c] !== drop) continue;
        f.w[c] = keep;
        f.o[c] = pickVariant(f.o[c], variants[keep], nrm);
      }
      inc[drop].delete(fi); inc[keep].add(fi);
    }
    qAdd(Q[keep], Q[drop]);
    alive[drop] = 0;
    stamp[keep]++;
    collapses++;
    /* re-price every edge now incident on `keep` */
    const nb = new Set();
    for (const fi of inc[keep]) { const f = faces[fi]; if (!f.dead) for (const v of f.w) if (v !== keep && alive[v]) nb.add(v); }
    for (const v of nb) push(keep, v);
  }

  /* ---- emit ---- */
  const used = new Map();                               // original vertex id -> new id
  const outIdx = [];
  for (const f of faces) {
    if (f.dead) continue;
    for (let c = 0; c < 3; c++) {
      let n = used.get(f.o[c]);
      if (n === undefined) { n = used.size; used.set(f.o[c], n); }
      outIdx.push(n);
    }
  }
  const order = [...used.entries()].sort((a, b) => a[1] - b[1]).map(([o]) => o);
  const out = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    const a = src.attributes[key]; if (!a) continue;
    const it = a.itemSize;
    const arr = new a.array.constructor(order.length * it);
    order.forEach((o, i) => { for (let c = 0; c < it; c++) arr[i * it + c] = a.array[o * it + c]; });
    out.setAttribute(key, new THREE.BufferAttribute(arr, it, a.normalized));
  }
  /* positions come from the WELDED representative so co-located variants stay co-located */
  {
    const p = out.attributes.position;
    order.forEach((o, i) => { const w = wPos[wOf[o]]; p.setXYZ(i, w[0], w[1], w[2]); });
  }
  out.setIndex(order.length < 65536 ? new THREE.Uint16BufferAttribute(outIdx, 1)
                                    : new THREE.Uint32BufferAttribute(outIdx, 1));
  return { geometry: out, before, after: outIdx.length / 3, collapses, rejectedFlip, boundaryEdges };
}

/** Of `cands` (original vertices at the surviving position) the one whose authored normal is
 *  closest to the corner being replaced. With no normals, the first — deterministic either way. */
function pickVariant(fromOrig, cands, nrm) {
  if (!cands.length) return fromOrig;
  if (!nrm || cands.length === 1) return cands[0];
  const ax = nrm.getX(fromOrig), ay = nrm.getY(fromOrig), az = nrm.getZ(fromOrig);
  let best = cands[0], bestD = -Infinity;
  for (const c of cands) {
    const d = ax * nrm.getX(c) + ay * nrm.getY(c) + az * nrm.getZ(c);
    if (d > bestD) { bestD = d; best = c; }
  }
  return best;
}

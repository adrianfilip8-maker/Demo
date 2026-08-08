import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SlyModel, RIG3, TUNE } from '../src/player/SlyModel3.js';

/**
 * The tail and the grip, as NUMBERS.
 *
 * `tests/geometry.test.mjs` guards the whole mesh's structure — winding, skin weights, bounds.
 * This file guards the two things critic pass 7 filed against the character (§4 "rebuild the
 * tail", §5 "the cane is not held", §6 "the cane hook is a mitred polyline"), because every one
 * of those is a property of the built geometry and none of them needed a capture to find.
 *
 * ── What the instrument had to learn before it could be trusted ────────────────────────────
 * The first version of the ring reader marched the tail's vertex buffer in blocks of `seg` and
 * took the first block that looked round as proof of the segment count. On an 18-segment tube it
 * picked 16, every block after that straddled two real rings, and it reported a **285% radius
 * spike** and a **213% ring-to-ring step** — a stray spike and a banding fault, on a part that had
 * both of those on the books, from an instrument that was reading its own misalignment. It also
 * marched straight off the end of the tube into the tip solid and read that as more rings.
 *
 * That is KNOWN_ISSUES §211.4's failure exactly: a wrong number that is localized, plausible, and
 * agrees with a defect already filed. Both fixes are below and both are load-bearing:
 *   · the segment count is chosen by ARGMIN over twelve blocks, not by the first block to pass;
 *   · a block stops being a ring when it stops being round, so the tube ends where it ends.
 * Neither assumes anything about what the answer should be.
 */

const stubEngine = { warn: () => {}, get: () => null, emit: () => {} };
const model = new SlyModel(stubEngine);
await model.init();
const geo = model.mesh.geometry;
const pos = geo.attributes.position;
const col = geo.attributes.color;
const skinIndex = geo.attributes.skinIndex;
const index = geo.index;

const V = (i) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
const HEX = (i) => new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHexString();

/** vertices touched by any of the four tail bones — the tail and nothing else uses them */
const tailBones = new Set(['tailA', 'tailB', 'tailC', 'tailD'].map((n) => RIG3.BONE_ORDER.indexOf(n)));
const tailV = [];
for (let i = 0; i < pos.count; i++) {
  for (const c of ['X', 'Y', 'Z', 'W']) {
    if (tailBones.has(skinIndex[`get${c}`](i))) { tailV.push(i); break; }
  }
}

/** spread of a block's vertices about their own centroid, as a fraction of the mean radius */
function outOfRound(base, n) {
  const c = new THREE.Vector3();
  for (let k = 0; k < n; k++) c.add(V(base + k));
  c.divideScalar(n);
  const r = [];
  for (let k = 0; k < n; k++) r.push(c.distanceTo(V(base + k)));
  const mu = r.reduce((a, b) => a + b) / n;
  return mu < 1e-6 ? 0 : (Math.max(...r) - Math.min(...r)) / mu;
}

/* segment count by argmin over the first twelve blocks — see the header */
const first = tailV[0];
let SEG = 0, best = Infinity;
for (const cand of [6, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32]) {
  let acc = 0, n = 0;
  for (let b = 0; b < 12; b++) {
    const base = first + b * cand;
    if (base + cand > tailV[tailV.length - 1]) break;
    acc += outOfRound(base, cand); n++;
  }
  const s = n ? acc / n : Infinity;
  if (s < best) { best = s; SEG = cand; }
}

/* rings, ending where the vertices stop forming one */
const rings = [];
for (let i = first; i + SEG <= tailV[tailV.length - 1] + 1; i += SEG) {
  if (outOfRound(i, SEG) > 0.5) break;
  const c = new THREE.Vector3();
  const r = [];
  for (let k = 0; k < SEG; k++) c.add(V(i + k));
  c.divideScalar(SEG);
  for (let k = 0; k < SEG; k++) r.push(c.distanceTo(V(i + k)));
  rings.push({ i, c, r, mu: r.reduce((a, b) => a + b) / SEG, hex: HEX(i) });
}

test('tail: the cross-section is the one TUNE asks for, and it is round', () => {
  /* 12 segments is what critic pass 7 measured as "≥12 straight silhouette segments with visible
     corner vertices at 443 px". The number is in TUNE so this test reads it rather than repeating
     it; what is asserted is that the builder honours it and that the detector agrees. */
  assert.equal(SEG, TUNE.tailSeg, `detected ${SEG} cross-section segments against TUNE.tailSeg ${TUNE.tailSeg}`);
  assert.ok(TUNE.tailSeg >= 16, `TUNE.tailSeg is ${TUNE.tailSeg}; the tail is half the silhouette`);
  assert.ok(best < 0.12, `mean out-of-round at the chosen segment count is ${(best * 100).toFixed(1)}%`);
});

test('tail: 5-6 hard albedo bands, each with 6-8 subdivision rings', () => {
  /* Critic pass 7 §4, verbatim: "Needs 5-6 hard albedo ring bands and 6-8 subdivision rings."
     The old build had TEN bands and called them five in its own source, because `tailRings` was
     multiplied by two at the only place it was read. Bands are counted here as they render: runs
     of consecutive rings sharing one vertex colour. */
  const runs = [];
  for (const R of rings) {
    if (!runs.length || runs[runs.length - 1].hex !== R.hex) runs.push({ hex: R.hex, n: 0 });
    runs[runs.length - 1].n++;
  }
  assert.ok(runs.length >= 5 && runs.length <= 6, `${runs.length} albedo bands: ${runs.map((r) => `${r.hex}x${r.n}`).join(' ')}`);
  /* The first and last runs carry the buried root ring and the terminal cone, so they run long;
     every interior band must sit in the asked window on its own. */
  for (let k = 1; k < runs.length - 1; k++) {
    assert.ok(runs[k].n >= 6 && runs[k].n <= 8, `band ${k} has ${runs[k].n} rings, outside 6-8`);
  }
  const hues = new Set(runs.map((r) => r.hex));
  assert.equal(hues.size, 2, `bands use ${hues.size} colours (${[...hues].join(',')}) — the ladder is two-valued`);
});

test('tail: no stray spike, and no lip at a colour seam', () => {
  /* §4 names "a stray spike". A spike is a vertex standing proud of the ring it belongs to, so
     that is what is measured — against the ring's own median, which one outlier cannot move.
     The seam check is the other half: a band edge is made by DOUBLING a ring, and the two rings
     of the pair have to agree on radius or the crisp colour edge is also a 7% ridge. The old
     build jittered by band PARITY, so all ten seams carried one. */
  for (const R of rings) {
    if (R.mu < 1e-4) continue;                      // the terminal cone's apex is a cap, not a ring
    const med = R.r.slice().sort((a, b) => a - b)[SEG >> 1];
    for (let k = 0; k < SEG; k++) {
      assert.ok((R.r[k] - med) / med < 0.12,
        `vertex ${R.i + k} stands ${(((R.r[k] - med) / med) * 100).toFixed(0)}% proud of its ring`);
    }
  }
  let seams = 0;
  for (let k = 1; k < rings.length; k++) {
    /* 2 mm, not exact equality. A doubled pair sits on one spine point, but each ring's CENTROID
       is the mean of its modulated vertices, so two rings with different modulation shapes at the
       same point have centroids a fraction of a millimetre apart. An exact test silently skipped
       every seam on the old build and passed by inspecting nothing — the §211.1 failure. Real
       neighbouring rings are ~25 mm apart, so 2 mm separates the two cases cleanly. */
    if (rings[k].c.distanceTo(rings[k - 1].c) > 0.002) continue;
    seams++;
    /* PER VERTEX, not per mean. The first version of this line compared the two rings' MEAN
       radii, and the old build passed it: its modulation was a zero-mean sine, so a ring at
       jitter 0.07 and its twin at jitter 0 had the same mean radius and completely different
       shapes. A mean is exactly the statistic a zero-mean defect is invisible to. */
    let d = 0;
    for (let s = 0; s < SEG; s++) d = Math.max(d, Math.abs(rings[k].r[s] - rings[k - 1].r[s]) / rings[k - 1].mu);
    assert.ok(d < 0.005, `the doubled seam at ring ${k} steps ${(d * 100).toFixed(1)}% in radius at its worst vertex`);
  }
  /* And the seam check must have had something to check. */
  assert.ok(seams >= 4, `only ${seams} doubled colour seams found — the band edges are not doubled`);
});

test('tail: both ends are closed, and the root is buried', () => {
  /* `tube()` emits no caps. The tail ran from a 156 mm open ring standing proud of a 110 mm torso
     to a 140 mm open ring at the tip with a 42 mm ball floating in the middle of it — a pipe with
     a nub in it, which is what the "stray spike" reads as in profile. Asserted as a size, because
     "is there a hole" is not decidable but "how big is it" is: an open boundary loop is scored by
     its own diameter, and anything the size of the tail is a defect. */
  const tset = new Set(tailV);
  const edges = new Map();
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (!tset.has(a) || !tset.has(b) || !tset.has(c)) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let widest = 0;
  const open = [];
  for (const [k, n] of edges) if (n === 1) open.push(k.split('_').map(Number));
  for (const [u, v] of open) widest = Math.max(widest, V(u).distanceTo(V(v)));
  /* 40 mm: an edge of an 18-gon at the 156 mm tip radius would be 54 mm, so this catches the old
     uncapped tip; the surviving open edges are the buried root ring (78 mm radius, 27 mm edges)
     and the terminal cone's zero-length apex ring. */
  assert.ok(widest < 0.040, `an open boundary edge is ${(widest * 1000).toFixed(0)} mm long`);

  const rootRing = rings[0];
  assert.ok(rootRing.c.z > -0.02 && rootRing.mu < 0.095,
    `the tail's open root ring is ${(rootRing.mu * 1000).toFixed(0)} mm at z=${rootRing.c.z.toFixed(3)} — it must sit inside the torso loft`);
});

/* ---------------------------------------------------------------------------------------- */

const handR = RIG3.BONE_ORDER.indexOf('handR');
const GOLD = 'd9a521';
const caneV = [], gripV = [];
for (let i = 0; i < pos.count; i++) {
  let on = false;
  for (const c of ['X', 'Y', 'Z', 'W']) if (skinIndex[`get${c}`](i) === handR) on = true;
  if (!on) continue;
  (HEX(i) === GOLD ? caneV : gripV).push(i);
}

test('cane: the hand closes around the shaft, and it cannot come off', () => {
  /* §5: "the cane is not held ... shaft passing behind the fingers with a visible gap ... Grip
     must be IK-constrained to a socket on the cane."
     There is no IK here and there does not need to be: every cane vertex and every grip vertex is
     weighted to `handR` alone, so their relative geometry is fixed at build time — asserted below
     rather than assumed, because a `bi()` typo returns -1 and would bind one of them to the hips.
     What IS a real question is whether the hand encloses the shaft, and that is measured the way
     the defect is described: as ANGULAR COVERAGE around the shaft axis. A hand that merely touches
     one side of a shaft lights a contiguous arc and leaves the rest empty. */
  assert.ok(caneV.length > 100 && gripV.length > 100, `cane ${caneV.length} verts, grip ${gripV.length} verts`);
  for (const i of caneV.concat(gripV)) {
    for (const c of ['Y', 'Z', 'W']) {
      assert.ok(geo.attributes.skinWeight[`get${c}`](i) === 0,
        `vertex ${i} on the cane/grip has a second bone influence — the grip is no longer rigid`);
    }
  }

  const grip = new THREE.Vector3(RIG3.SKELETON.find((s) => s[0] === 'handR')[2][0] - 0.014,
    RIG3.SKELETON.find((s) => s[0] === 'handR')[2][1] - 0.042,
    RIG3.SKELETON.find((s) => s[0] === 'handR')[2][2] + 0.014);
  const shaft = caneV.filter((i) => V(i).distanceTo(grip) < 0.10);
  assert.ok(shaft.length > 20, `only ${shaft.length} cane vertices near the grip`);
  const c0 = new THREE.Vector3();
  for (const i of shaft) c0.add(V(i));
  c0.divideScalar(shaft.length);
  let axis = new THREE.Vector3(0, 1, 0);
  for (let it = 0; it < 60; it++) {
    const acc = new THREE.Vector3();
    for (const i of shaft) { const d = V(i).sub(c0); acc.addScaledVector(d, d.dot(axis)); }
    axis.copy(acc.normalize());
  }
  const radial = (v) => { const d = v.clone().sub(c0); return d.addScaledVector(axis, -d.dot(axis)).length(); };
  const axial = (v) => v.clone().sub(c0).dot(axis);
  const sr = shaft.map((i) => radial(V(i))).sort((a, b) => a - b);
  const shaftR = sr[sr.length >> 1];
  const sa = shaft.map((i) => axial(V(i)));
  const lo = Math.min(...sa), hi = Math.max(...sa);

  const e1 = new THREE.Vector3(1, 0, 0);
  if (Math.abs(e1.dot(axis)) > 0.9) e1.set(0, 1, 0);
  e1.addScaledVector(axis, -e1.dot(axis)).normalize();
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
  const bins = new Array(12).fill(0);
  let closest = Infinity;
  for (const i of gripV) {
    const v = V(i), a = axial(v);
    if (a < lo || a > hi) continue;
    const r = radial(v);
    if (r < closest) closest = r;
    if (r > shaftR + 0.025) continue;
    const d = v.clone().sub(c0);
    d.addScaledVector(axis, -d.dot(axis));
    let th = Math.atan2(d.dot(e2), d.dot(e1));
    if (th < 0) th += Math.PI * 2;
    bins[Math.floor(th / (Math.PI * 2 / 12)) % 12]++;
  }
  const wrap = bins.filter((b) => b > 0).length;
  assert.ok(wrap >= 10, `the hand covers only ${wrap} of 12 sectors around the shaft: [${bins.join(',')}]`);
  assert.ok(closest < shaftR, `the nearest grip surface is ${((closest - shaftR) * 1000).toFixed(1)} mm CLEAR of the shaft`);
});

test('cane: the hook is a crook, not a mitred polyline', () => {
  /* §6: "the cane hook is a mitred polyline of three straight segments — a bent coat hanger, not
     a crook." A mitre IS a turn angle, so that is the quantity: the centreline's turn at each
     joint. The old arc was 8 points over 180 degrees = 25.7 degrees per joint, plus a fourth
     mitre where a separately-built shaft met it at 7.4 degrees off tangent.
     `sweep` is asserted too: 180 degrees is a half-round that reads as a hoop, and `Cane.js`'s own
     note records 255 degrees closing up into "a bangle". A crook has to pass its widest point. */
  const hookV = caneV.filter((i) => V(i).y > RIG3.SKELETON.find((s) => s[0] === 'handR')[2][1] + 0.40);
  assert.ok(hookV.length > 60, `only ${hookV.length} hook vertices`);
  const s0 = Math.min(...hookV), s1 = Math.max(...hookV);
  let HS = 0, hb = Infinity;
  for (const cand of [6, 8, 9, 10, 12, 14, 16, 18, 20]) {
    let acc = 0, n = 0;
    for (let b = 0; b < 6; b++) {
      const base = s0 + b * cand;
      if (base + cand > s1) break;
      acc += outOfRound(base, cand); n++;
    }
    const sc = n ? acc / n : Infinity;
    if (sc < hb) { hb = sc; HS = cand; }
  }
  const centres = [];
  for (let s = s0; s + HS <= s1 + 1; s += HS) {
    const c = new THREE.Vector3();
    for (let k = 0; k < HS; k++) c.add(V(s + k));
    centres.push(c.divideScalar(HS));
  }
  assert.ok(centres.length >= 10, `the hook is sampled at only ${centres.length} rings`);
  let sweep = 0, worst = 0;
  for (let i = 1; i + 1 < centres.length; i++) {
    const a = centres[i].clone().sub(centres[i - 1]);
    const b = centres[i + 1].clone().sub(centres[i]);
    if (a.lengthSq() < 1e-10 || b.lengthSq() < 1e-10) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) * 180 / Math.PI;
    sweep += ang;
    worst = Math.max(worst, ang);
  }
  assert.ok(worst <= 16, `the hook turns ${worst.toFixed(1)} degrees at its sharpest joint`);
  assert.ok(sweep >= 190 && sweep <= 240, `the hook sweeps ${sweep.toFixed(0)} degrees`);
});

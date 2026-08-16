/**
 * basketvary.test.mjs — pins PREREG-basketvary's shipped seal (a).
 *
 * The complaint was a set-dressing clone: eight `ropeCoil` placements, ONE silhouette, seven of
 * them inside the `courtyard` frustum (critic r12: "the same coil basket appears three times in
 * one frame" / "the seventh appearance ... reads as set-dressing autopilot").
 *
 * These assertions are the bars, re-derived from the shipped source the same way the sealed
 * scorer derives them — by wrapping `Props._push`, which every prop passes through in world
 * space before the per-material merge erases prop identity. No boot, no lock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { Props } from '../src/world/Props.js';
import { Architecture } from '../src/world/Architecture.js';

const PIECES = [];
const REG = [];
const orig = Props.prototype._push;
Props.prototype._push = function (key, geo) {
  if (geo?.attributes?.position) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    PIECES.push({ key, min: bb.min.clone(), max: bb.max.clone(), tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 });
  }
  return orig.call(this, key, geo);
};
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: () => {}, get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  registerCollider: (m, o) => REG.push({ tag: o?.tag ?? null, mesh: m }),
};
const A = new Architecture(engine); await A.init();
const P = new Props(engine); await P.init();

const coils = PIECES.filter((p) => p.key === 'rope' && p.max.y < 1.2);
const S10 = (v) => Math.round(v / 0.10);
const sig = (p) => `${S10(p.max.x - p.min.x)}x${S10(p.max.y - p.min.y)}x${S10(p.max.z - p.min.z)}`;

test('A3: the courtyard rope coils are authored, and there are no more of them than before', () => {
  assert.equal(coils.length, 6, 'six authored coils replaced eight scattered ones');
});

test('A2b: every coil is its own silhouette — the clone family is gone', () => {
  const sigs = new Set(coils.map(sig));
  assert.equal(sigs.size, coils.length, `expected ${coils.length} distinct silhouettes, got ${sigs.size}: ${[...sigs]}`);
  assert.ok(sigs.size >= 5, 'PREREG-basketvary A2b: >= 5 distinct silhouettes');
});

test('A2: the coils vary in size, not just in yaw (bbox-diagonal CV >= 0.12)', () => {
  const d = coils.map((p) => Math.hypot(p.max.x - p.min.x, p.max.y - p.min.y, p.max.z - p.min.z));
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const cv = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length) / mean;
  assert.ok(cv >= 0.12, `CV ${cv.toFixed(4)} < 0.12 (HEAD before this seal measured 0.0025)`);
});

test('A1: no registered camera sees two coils of the same silhouette', () => {
  const box = new THREE.Box3();
  for (const [name, s] of Object.entries(SHOTS)) {
    const cam = new THREE.PerspectiveCamera(s.fov, 1280 / 720, 0.1, 600);
    cam.position.fromArray(s.pos);
    cam.lookAt(new THREE.Vector3().fromArray(s.target));
    if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const f = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const seen = new Map();
    for (const p of coils) if (f.intersectsBox(box.set(p.min, p.max))) seen.set(sig(p), (seen.get(sig(p)) || 0) + 1);
    const worst = Math.max(0, ...seen.values());
    assert.ok(worst <= 2, `${name} sees ${worst} identical coils (bar <= 2; HEAD before this seal: courtyard 7, dunes 8)`);
  }
});

/**
 * P-A1b — the direct measurement, added because P-A1 below is a PROXY for it.
 *
 * P-A1 pins a GLOBAL ARCHITECTURE+PROPS registration total to police a LOCAL property of six
 * rope coils. That works, and it has already caught one real regression — but it also fires on
 * any lane that adds any collider anywhere, on a message about rope coils, and it has now
 * blocked unrelated level content twice. The proxy is not the claim.
 *
 * This is the claim: **no registered collider is attributable to a rope coil.** Measured per
 * coil rather than inferred from a total, so it is indifferent to what the rest of the level
 * does.
 *
 * Overlap alone is the wrong quantity and I nearly shipped it — every coil sits on the ground,
 * so the ground slab's box contains all six and a plain `intersectsBox` reports 12 hits on a
 * level where no coil has a collider at all. What distinguishes "this coil has been given a
 * collider" from "this coil is standing on the floor" is SIZE. Measured today, the twelve
 * boxes that overlap a coil run from **40x its volume** (a 2.1 x 7.7 x 2.0 m wall) to
 * **360,783x** (a 44 x 22.5 x 102.6 m ground slab). A collider authored on a coil would be
 * roughly 1x.
 *
 * So the bar is 8x, and it is derived rather than picked: a factor of 5 below the smallest real
 * overlapper and a factor of ~3 above a plausible coil collider, with the two populations four
 * orders of magnitude apart. This can only ever tighten the seal — it adds a constraint and
 * removes none — which is why it can be added while the global pin is actively blocking a lane,
 * and the pin itself cannot be touched in the same breath. That is §141.1's whole point: the
 * moment to re-scope a bar is when nothing depends on the answer.
 */
test('P-A1b: no collider is attributable to a rope coil, measured per coil', () => {
  const VOL_BAR = 8;
  const cb = coils.map((p) => new THREE.Box3(p.min.clone(), p.max.clone()));
  const vol = (b) => { const s = new THREE.Vector3(); b.getSize(s); return s.x * s.y * s.z; };
  const cv = cb.map(vol);
  const box = new THREE.Box3();
  const culprits = [];
  let minRatio = Infinity;

  for (const r of REG) {
    if (!r.mesh) continue;
    try { r.mesh.updateMatrixWorld?.(true); box.setFromObject(r.mesh); } catch { continue; }
    if (box.isEmpty()) continue;
    const v = vol(box);
    for (let i = 0; i < cb.length; i++) {
      if (!box.intersectsBox(cb[i])) continue;
      const ratio = v / cv[i];
      if (ratio < minRatio) minRatio = ratio;
      if (ratio < VOL_BAR) culprits.push(`${r.tag} at ${ratio.toFixed(2)}x coil ${i}`);
    }
  }

  console.log(`\n  P-A1b: ${coils.length} coils · closest overlapping collider is ${minRatio.toFixed(0)}x ` +
    `a coil's volume (bar: nothing under ${VOL_BAR}x)`);
  assert.deepEqual(culprits, [],
    `a collider is sized like a rope coil and overlaps one — that is a coil with gameplay volume:\n  ${culprits.join('\n  ')}`);
  assert.ok(minRatio > VOL_BAR,
    `the closest overlapper is ${minRatio.toFixed(1)}x, at or under the ${VOL_BAR}x bar — either a coil `
    + 'gained a collider or the bar no longer has the headroom it was derived with');
});

test('P-A1b CALIBRATION: a coil that DID gain a collider is caught', () => {
  /* MUST FIRE. A seal that cannot fail is worth nothing, and this project has voided a whole run
     over an arm built on a lever already known dead (progress/records/RESULT-cel1.md). The lever
     here is a single planted collider sized and centred exactly on coil 0 — which is what "a coil
     gained a collider" would actually look like — and it must be rejected by the same logic the
     arm above runs. Measured: the plant scores 1.00x against a real-level minimum of 40x, so the
     two populations sit four orders of magnitude apart and the 8x bar is nowhere near either. */
  const c0 = coils[0];
  const size = new THREE.Vector3().subVectors(c0.max, c0.min);
  const centre = new THREE.Vector3().addVectors(c0.min, c0.max).multiplyScalar(0.5);
  const fake = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  fake.position.copy(centre);
  fake.updateMatrixWorld(true);

  const coilBox = new THREE.Box3(c0.min.clone(), c0.max.clone());
  const vol = (b) => { const s = new THREE.Vector3(); b.getSize(s); return s.x * s.y * s.z; };
  const planted = new THREE.Box3().setFromObject(fake);
  const ratio = vol(planted) / vol(coilBox);

  console.log(`  P-A1b calib: a collider planted on coil 0 scores ${ratio.toFixed(2)}x its volume`);
  assert.ok(planted.intersectsBox(coilBox), 'the planted collider does not even overlap its coil');
  assert.ok(ratio < 8,
    `a collider built to the coil's own dimensions scored ${ratio.toFixed(2)}x, which the 8x bar `
    + 'would ACCEPT — the arm above cannot detect the thing it exists to detect');
});

test('P-A1: a rope coil is set dress and carries no gameplay volume', () => {
  /* The registration totals are the pin. If a later change gives a coil a collider, a hazard or
     a contact decal, this is where it surfaces rather than in a frame nobody diffs.

     P-A1b above is the direct form of this claim and is the one to trust; this remains as a
     broad drift check on the level's total mass. When somebody re-scopes it — and it should be
     re-scoped, at a moment when it is not blocking anyone — P-A1b is the successor that means
     the seal loses nothing.

     ── 272 → 268, and the reason, because a pin moved without one is worthless ────────────────
     The four banner masts on the entry pylon's south face lost their `poleProxy` (KNOWN_ISSUES
     §382.5). They keep their geometry, their banners and their flanking-the-gate reading; only
     the collider goes, so this is `pole` 21 → 17 and every other tag byte-identical — checked
     against the histogram, not inferred from the total.

     Why it is a retirement rather than a convenience: their authoring comment read *"a banner
     pole by a pylon is a legitimate route up"*, and that was TRUE WHEN WRITTEN. They were the
     route up that face. The 26-rung ladder is now the route up that face, and two routes up one
     elevation is what EgyptLevel's own rule refuses — *"one route per face; two ladders are a
     staggered pair read as a single climbing line, never a choice."* These two are not even a
     pair: one is 11 m and dead-ends a third of the way up a 26 m ascent while outranking the
     move the player is performing (`PoleClimb` 82 against `WallClimb` 79), and driving proved
     it — 506 frames in `poleClimb`, 0 of 26 rungs, before the entry was moved.

     The rule this earns, and it is the reason this note is long: **a seal is not a ceiling, it
     is a pin.** Moving it DOWNWARD without a recorded reason is the same failure as moving it
     upward, and it is the easier one to commit because removing a collider feels like tidying.
     The lane that made this change flagged it as needing the same conversation as an addition
     before it made it, which is why the change is here at all. */
  assert.equal(REG.length, 268, 'collider registrations unchanged by this seal');
  assert.equal(P.stats.decals, 46, 'contact decals unchanged by this seal');
  assert.equal(P._fx.length, 24, 'fx emitters unchanged');
  assert.equal(P._lights.length, 24, 'lights unchanged');
});

test('P-A2: the seal is triangle-negative', () => {
  const tris = PIECES.reduce((s, p) => s + p.tris, 0);
  assert.ok(tris <= 76288, `prop triangles ${tris} > the 76288 measured before this seal`);
});

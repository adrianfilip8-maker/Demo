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

/* ── A1's instrument, and why it is no longer a bucket ─────────────────────────────────────────
 *
 * A1 used to count, per frame, how many visible coils shared a 10 cm-quantised bbox signature, and
 * bar that count at 2. **That bar could not fail.** Not "had never fired" — could not:
 *
 *   A2b asserts all six signatures are DISTINCT at 10 cm.
 *   Distinct signatures ⟹ no two coils anywhere share one ⟹ every frame's count is at most 1,
 *   for every possible camera, not merely the eighteen canonical ones.
 *
 * So A1 was a strict logical consequence of A2b and asserted nothing A2b did not already
 * guarantee. Measured as well as argued, because an argument is not a measurement: over 20,000
 * random subsets of the six coils — a superset of everything any camera can see — the highest
 * per-signature count is **1**, against a bar of 2. A seal with no reachable failure state is
 * decoration, and this one guarded the complaint the whole PREREG exists for.
 *
 * ── the second defect, found by transferring the bar ───────────────────────────────────────────
 * `tests/decalstat.test.mjs` T3 borrowed this bar for the sphinx avenue, and T3c established why
 * that reads differently there: **10 cm is an ABSOLUTE quantum applied to objects an order of
 * magnitude apart in size.** On a 1.86 m coil it means "within 8 %"; on a 5 m sphinx, "within 1 %".
 * The same sentence is a far stricter demand on the avenue than on the coils, which is how the
 * avenue came to sit exactly on a limit while the coils cleared it without the bar ever engaging.
 *
 * The replacement is scale-free and has no parameter inside it: the maximum per-axis RELATIVE size
 * difference between the two most-alike coils a frame can see. Unitless, continuous, no cliff.
 * Measured — shipped worst frame `sly-arm` at 14.76 %, the pre-seal clone family at exactly 0 %.
 */
const relDiff = (a, b) => {
  const sa = [a.max.x - a.min.x, a.max.y - a.min.y, a.max.z - a.min.z];
  const sb = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  let m = 0;
  for (let i = 0; i < 3; i++) m = Math.max(m, Math.abs(sa[i] - sb[i]) / ((sa[i] + sb[i]) / 2));
  return m;
};
const camFor = (s) => {
  const cam = new THREE.PerspectiveCamera(s.fov, 1280 / 720, 0.1, 600);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
};
const frustumOf = (s) => {
  const cam = camFor(s);
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
};
/** Per frame: the two most-alike coils it can see, as a relative difference. */
function worstFrame(set) {
  const box = new THREE.Box3();
  let worst = Infinity, shot = '', frames = 0;
  for (const [name, s] of Object.entries(SHOTS)) {
    const f = frustumOf(s);
    const seen = set.filter((p) => f.intersectsBox(box.set(p.min, p.max)));
    if (seen.length < 2) continue;
    frames++;
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const d = relDiff(seen[i], seen[j]);
        if (d < worst) { worst = d; shot = name; }
      }
    }
  }
  return { worst, shot, frames };
}
/**
 * The floor, DERIVED rather than picked.
 *
 * A2b's own demand is "distinct at a 10 cm quantum". Expressed scale-free against the coils' own
 * mean bbox diagonal, that same demand is a relative difference of 10 cm / mean-diagonal. So the
 * floor is A2b's existing quantum translated into the units that transfer between objects, not a
 * new threshold with a new argument behind it. On the shipped set that is about 5.6 %, and the
 * level clears it at 14.76 % — the headroom is printed rather than assumed.
 */
const MEAN_DIAG = coils.reduce((s, p) => s
  + Math.hypot(p.max.x - p.min.x, p.max.y - p.min.y, p.max.z - p.min.z), 0) / coils.length;
const REL_FLOOR = 0.10 / MEAN_DIAG;

test('A1: no camera sees two coils that read alike — measured scale-free, not bucketed', () => {
  assert.ok(coils.length > 1, 'inspected fewer than two coils');
  const { worst, shot, frames } = worstFrame(coils);
  console.log(`  A1: ${frames} frames see two or more coils · most-alike pair is in "${shot}" at `
    + `${(100 * worst).toFixed(2)} % apart · floor ${(100 * REL_FLOOR).toFixed(2)} % `
    + `(A2b's 10 cm quantum over a ${MEAN_DIAG.toFixed(2)} m mean diagonal) · headroom ${(worst / REL_FLOOR).toFixed(1)}x`);
  assert.ok(frames > 0, 'no canonical camera sees two coils — this arm proved nothing');

  /* THE SEAL. A floor, because the complaint was that the coils did not differ; a floor is the
     only shape that catches drifting back toward it. */
  assert.ok(worst >= REL_FLOOR,
    `"${shot}" shows two coils only ${(100 * worst).toFixed(2)} % apart, under the ${(100 * REL_FLOOR).toFixed(2)} % floor. `
    + 'HEAD before this seal was 0 % — one silhouette, eight times — and this is the bar that '
    + 'catches the walk back to it. A1 CALIBRATION below proves the bar can fire.');

  /* AND A PIN, because a floor alone lets the number slide from 14.76 % to 6 % unremarked, and
     the coils drifting halfway back toward a clone family is a thing somebody should say out loud. */
  assert.ok(Math.abs(100 * worst - 14.76) < 1.0,
    `the most-alike pair is now ${(100 * worst).toFixed(2)} % apart, pinned at 14.76 %. Still above the `
    + 'floor, so this is not a seal break — but the coils have been re-authored and the PREREG '
    + 'numbers describe a set that no longer exists');

  /* the legacy bucket count, kept as the tie to PREREG's own wording and labelled for what it is */
  const box = new THREE.Box3();
  let bucketWorst = 0;
  for (const s of Object.values(SHOTS)) {
    const f = frustumOf(s);
    const seen = new Map();
    for (const p of coils) if (f.intersectsBox(box.set(p.min, p.max))) seen.set(sig(p), (seen.get(sig(p)) || 0) + 1);
    bucketWorst = Math.max(bucketWorst, 0, ...seen.values());
  }
  assert.ok(bucketWorst <= 2, `${bucketWorst} identical coils in one frame (PREREG's original wording; `
    + 'HEAD before this seal: courtyard 7, dunes 8)');
  assert.equal(bucketWorst, 1,
    'the bucket count is no longer 1, which means two coils now share a 10 cm signature and A2b '
    + 'should have failed first — if A2b passed and this did not, one of them is measuring the wrong set');
});

test('A1 CALIBRATION: the new bar fires on a clone family; the old one could not', () => {
  /* MUST FIRE, and A1 shipped without one for its whole life — which is how a bar that could not
     fail survived. Two levers, because there are two claims: that the replacement works, and that
     the replacement was necessary. */

  /* LEVER 1 — the replacement fires. Rebuild the exact defect PREREG was raised over: every coil
     given the first one's bounds, which is what "one silhouette, eight times" means. */
  const clones = coils.map((c) => ({ key: c.key, min: coils[0].min.clone(), max: coils[0].max.clone() }));
  const cl = worstFrame(clones);
  console.log(`  A1 calib: a clone family scores ${(100 * cl.worst).toFixed(2)} % against a `
    + `${(100 * REL_FLOOR).toFixed(2)} % floor — rejected`);
  assert.ok(cl.frames > 0, 'the clone family is not visible to any camera, so this lever proves nothing');
  assert.ok(cl.worst < REL_FLOOR,
    `a family of identical coils scores ${(100 * cl.worst).toFixed(2)} %, which A1 would ACCEPT — the `
    + 'new bar cannot detect the thing it exists to detect');

  /* and a GRADIENT case, because a lever that only rejects zero cannot show where the bar sits —
     it would pass just as happily if the floor were 0.001 %. The first attempt at this arm was
     exactly that mistake: it scaled alternate coils by ±f from ONE base size, so every same-parity
     pair came out byte-identical and it scored 0.00 % while its own console line claimed to be
     demonstrating a gradient. A second clone family dressed as a near-miss.

     Built properly: each coil scaled from a common base by a distinct 1 + i*step, so the closest
     pair differs by exactly `step`. Set just inside the floor, it must be rejected; set just
     outside, it must be accepted. Both directions, or the bar's position is still unmeasured. */
  const base = [coils[0].max.x - coils[0].min.x, coils[0].max.y - coils[0].min.y, coils[0].max.z - coils[0].min.z];
  const ladder = (step) => coils.map((c, i) => {
    const k = 1 + i * step;
    return { key: c.key, min: c.min.clone(),
      max: new THREE.Vector3(c.min.x + base[0] * k, c.min.y + base[1] * k, c.min.z + base[2] * k) };
  });
  const under = worstFrame(ladder(REL_FLOOR * 0.8));
  const over = worstFrame(ladder(REL_FLOOR * 1.5));
  console.log(`  A1 calib: a ladder stepped at 0.8x the floor scores ${(100 * under.worst).toFixed(2)} % — rejected; `
    + `at 1.5x it scores ${(100 * over.worst).toFixed(2)} % — accepted`);
  assert.ok(under.worst > 0,
    'the under-floor ladder scored exactly 0, so it is another clone family rather than a near-miss '
    + 'and it demonstrates nothing the first lever did not');
  assert.ok(under.worst < REL_FLOOR,
    `a set whose most-alike pair differs by ${(100 * under.worst).toFixed(2)} % passes the `
    + `${(100 * REL_FLOOR).toFixed(2)} % floor — the bar is not where this arm says it is`);
  assert.ok(over.worst >= REL_FLOOR,
    `a set stepped at 1.5x the floor scores ${(100 * over.worst).toFixed(2)} % and is still REJECTED — `
    + 'the bar rejects sets it should accept, which makes it a trap rather than a seal');

  /* LEVER 2 — the OLD bar could not fire, which is why it was replaced. A2b guarantees all six
     signatures distinct, so no subset of the coils can put two of them in one bucket. Demonstrated
     over every subset a camera could possibly select, rather than over the eighteen that exist. */
  const sigs = new Set(coils.map(sig));
  assert.equal(sigs.size, coils.length, 'A2b no longer holds, so the implication below does not apply');
  let maxAnySubset = 0;
  for (let mask = 1; mask < (1 << coils.length); mask++) {
    const c = new Map();
    for (let i = 0; i < coils.length; i++) {
      if (!(mask & (1 << i))) continue;
      const k = sig(coils[i]);
      c.set(k, (c.get(k) || 0) + 1);
    }
    maxAnySubset = Math.max(maxAnySubset, ...c.values());
  }
  console.log(`  A1 calib: over all ${(1 << coils.length) - 1} subsets of the six coils, the old bucket `
    + `count never exceeds ${maxAnySubset} — its bar was 2, so it could not fail while A2b passed`);
  assert.equal(maxAnySubset, 1,
    `the old bucket count can reach ${maxAnySubset} over some subset, so it was NOT unfirable and the `
    + 'reason recorded for replacing it is wrong');
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
     before it made it, which is why the change is here at all.

     ── 268 → 269 → 268, and the round trip is the record ─────────────────────────────────────
     §482.3 added one `groundProxy` to bridge 3.54 m of open air between flight A's foot and the
     tomb's mid landing, and this pin caught it — an ADDITION from three files away in a different
     module, which is the whole argument for a level-wide total over a per-module one.

     §484 then took it back out, and that is the more interesting half. The gap existed because
     flight A started at x 3.6, which is 3.6 m east of the lane the player arrives in and inside
     the east Anubis's footprint. Anchoring the flight to the approach (`A_HEAD = 0`) puts its foot
     at x −9.66 — the mid landing's own east edge to 6 cm — so the gap it was bridging stopped
     existing. **A proxy added to span a gap is evidence that something upstream is misplaced**,
     and the bridge was pinning the symptom rather than the cause.

     Checked against the histogram both times rather than inferred from the total: `ground`
     53 → 54 → 53, every other tag byte-identical, as the 272 → 268 entry above requires.

     ── 268 → 269 again: the stair signpost block (§486) ──────────────────────────────────────
     One `groundProxy`, the fallen half-course block east of terrace flight 2 at x 2.9…4.5,
     top y 3.6 — the level-side signpost for the first beat the level refuses (§485.6 item 1).
     It splits the 3.25 m stage-1 → stage-2 rise into two 1.6 m single jumps, 25/25 driven
     timing pairs, with the centre-line ledgeClimb recovery unchanged at 24/30. Histogram:
     `ground` 53 → 54, every other tag byte-identical. Unlike the §484 bridge this one is not
     spanning a gap something else should close — it IS the level design, so it stays.

     ── 269 → 272: the vault-gate doorway (§490, wall +2) and the kiosk step (§491, ground +1) ──
     §490 split the tomb stairwell's north wall around the vault gate's own doorway — it was one
     solid slab ACROSS the opening, and no instrument had ever crossed it (R2's waypoint stops
     south of it, V3 teleports north of it). One wallProxy became three: +2.
     §491 added the half-course step at the kiosk south face: §8.1 step 2's 8 cm margin drops a
     near-miss into a boxed soffit pocket at y 7.75 with no exit (headroom 1.75 < CAPSULE_H), so
     the step splits the rise into two 1.9 m singles that never arc into it: ground +1.
     Histogram: wall 75 → 77, ground 54 → 55, every other tag byte-identical.

     ── 272 → 273: §500.5's notch filled (§493, ground +1) ────────────────────────────────────
     A ~15 cm slot in the ground colliders at the stage-2 lid's south edge. A/B-driven: filling
     it turns the SNEAK retreat off the south face from 15.60 HARD to 14.80 soft, and leaves the
     full-stick retreat unchanged (air control converges every held-south fall to the same paving
     landing — that residual is §493's design note, not this proxy's job). A separate sliver
     rather than a longer lid on purpose: stretching the lid's run 2.70 → 2.82 m would drop the
     stair's pinned 50.28° below the 50° walkable limit. Histogram: ground 55 → 56, all else
     byte-identical.

     ── 273 → 276: §495's three thief lines (pole +2, rail +1) ────────────────────────────────
     The obelisk climbing rope (r 0.15 — preserves the §8.1 step-2 alternative through the §494
     thinness gate), the colossi tightrope (a rail over the spawn approach), and the SE drainpipe
     (r 0.18, paving to the y 9.0 ring). All three driven end to end by
     `tests/thiefspots.test.mjs` before shipping; both new poles asserted r <= 0.5 in-arm so they
     cannot thicken past the gate they were authored for. Histogram: pole 17 → 19, rail 6 → 7,
     all else byte-identical.

     ── 276 → 280: §497 re-hangs the tightrope after the camera lane photographed it (ground +4)
     The T2 frames (`shots/thief1-*`) measured the §495 rope failing all three of its claims:
     no walk-on existed (the "y 5.44 stance" was the STATUE'S SHIN — a rest-scan misread), every
     mount was a 9.5 m/s fling (the default `railSpeed` floor), and the far end delivered the
     rider into the colossus's inboard shin, where the capsule HUNG at (8.33, 4.77) until §504's
     watchdog threw it to spawn. Four ground proxies close it: two 80.5° shin DEFLECTOR planes
     (nothing can pocket against the overhang; fast arrivals shed to the knee floor) and two
     MOUNTING STONES at the anchors (top 4.90 — the knee shelf's collidable ART otherwise walks
     a capsule grounded below the from-above catch before releasing it). With `mountSpeed: 0`
     and the ends re-hung at 4.95 the crossing settles into `railWalk` — driven both directions,
     plus the fling, in `thiefspots`. Histogram: ground 56 → 60, all else byte-identical.

     ── 280 → 282: §498 fills the crouch pocket the §497 stones formed (ground +2) ─────────────
     The camera lane's fourth take pinned GROUNDED at (−7.01, 4.77, 26.52) for 1347 frames
     (§473.3): the statue's kneecap sculpt leans north as it rises, and the slot between it and
     each anchor stone admitted a capsule at crouch height against the stone's corner — exempt
     from both watchdogs by design (grounded, wiggling). One fill per side, ledge-to-above-crouch
     (x ±6.75..8.45, y 4.5..5.8, z 25.9..26.6), so the slot admits nothing; the exposed north
     face is a plain wall on the open shelf (§436-driven: every escape leaves, including a
     ledgeClimb UP it onto the colossus). Histogram: ground 60 → 62, all else byte-identical. */
  assert.equal(REG.length, 282, 'collider registrations unchanged by this seal');
  assert.equal(P.stats.decals, 46, 'contact decals unchanged by this seal');
  assert.equal(P._fx.length, 24, 'fx emitters unchanged');
  assert.equal(P._lights.length, 24, 'lights unchanged');
});

test('P-A2: the seal is triangle-negative', () => {
  const tris = PIECES.reduce((s, p) => s + p.tris, 0);
  assert.ok(tris <= 76288, `prop triangles ${tris} > the 76288 measured before this seal`);
});

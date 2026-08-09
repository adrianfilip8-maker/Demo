import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Lighting } from '../src/render/Lighting.js';
import { TUNE as SHADE_TUNE } from '../src/render/ToonMaterial.js';

/**
 * Guards for the enclosure-scoped shade band — KNOWN_ISSUES §269/§271,
 * `progress/records/PREREG-holdscope.md`.
 *
 * All of it is arithmetic over `Lighting`'s fan and decision, with a stub collision module, so
 * it needs no renderer and no capture lock. What it is really protecting is a **pair** of claims
 * that are easy to satisfy by accident:
 *
 *   1. **Inertness at `holdEnclose = -1`.** The fan must not run and nothing must be published.
 *      §218: an inertness assertion passes trivially on a lever that never reaches its consumer,
 *      so every inertness test below is paired with an arm that MUST move, and the moving arm is
 *      asserted first.
 *   2. **The decision is a decision.** §269 measured the band at 0.6 producing `dunes` hue 355 /
 *      sat 0.274 — mud, worse than either endpoint. A future edit that "smooths" this into a
 *      ramp would walk every partially-roofed camera through that. The test therefore asserts
 *      the published value is in {0, 1} and never between.
 */

/** Minimal engine: a camera and a collision module whose fan result the test dictates. */
function fakeEngine(blocked = 0) {
  const camera = new THREE.PerspectiveCamera();
  const state = { blocked, casts: 0 };
  const collision = {
    raycast() {
      state.casts++;
      /* Block the first `blocked` rays of each fan of 5, so the target is blocked/5 exactly. */
      return { hit: ((state.casts - 1) % 5) < state.blocked };
    },
  };
  const eng = {
    camera, debug: {}, scene: { add() {}, remove() {} }, on() {}, warn() {},
    quality: 'high', settings: {},
    get(k) { return k === 'collision' ? collision : null; },
  };
  return { eng, state };
}

/** Drive N update ticks of just the enclosure term, at the dt every capture in this repo uses. */
function tick(L, n, dt = 0) { for (let i = 0; i < n; i++) L._updateEnclosure(dt); }

test('enclosure: OFF by default, and the fan does not even run', () => {
  const { eng, state } = fakeEngine(5);
  const L = new Lighting(eng);
  assert.equal(L.TUNE.holdEnclose, -1,
    `TUNE.holdEnclose is ${L.TUNE.holdEnclose}, not -1 — the scoped shade band shipped ON. ` +
    `PREREG-holdscope's ship rule requires every registered guard to PASS first.`);
  assert.equal(L.TUNE.encloseStrength, 0,
    'TUNE.encloseStrength moved off 0; the sky-FILL half of the enclosure term was bracketed and ' +
    'refused (see its TUNE note), and the scope half must not drag it along');

  tick(L, 30);
  assert.equal(state.casts, 0, `the fan cast ${state.casts} rays with both consumers off; it must cast none`);
  assert.equal(L.enclosure, 0);
  assert.equal(L._skyOpenDecision(), null,
    'with scoping off the decision must be null, not 0 — ToonMaterial writes uShadowHold only ' +
    'when the payload carries a number, and that is what keeps a harness poke of the uniform sticking');

  // CALIBRATION ARM: the same stub, with scoping on, must produce a fan and a decision.
  L.TUNE.holdEnclose = 0.9;
  try {
    tick(L, 1);
    assert.ok(state.casts > 0, 'CALIBRATION FAILED: the fan casts nothing even with scoping on, so the ' +
      'inertness assertion above proves nothing');
    assert.equal(L._skyOpenDecision(), 0, 'a fully blocked fan must decide ROOFED');
  } finally { L.TUNE.holdEnclose = -1; }
});

test('enclosure: a camera cut converges in one tick, which is what dt = 0 captures need', () => {
  const { eng } = fakeEngine(5);
  const L = new Lighting(eng);
  L.TUNE.holdEnclose = 0.9;
  try {
    /* §251: every capture steps with dt = 0, which pins the lerp rate to 1/240 * 4 = 1/60. A
       smoothed value would be 1.7% of the way to its target after one frame and ~5% after three,
       which is what the capture actually gets. The snap-on-cut is the whole reason the scope
       decision is readable at the captured frame. */
    eng.camera.position.set(0, 0, 0);
    tick(L, 1);
    assert.equal(L._encloseTarget, 1, 'a fan with all five rays blocked must read 1.0');
    assert.equal(L.enclosure, 1,
      `enclosure is ${L.enclosure} after the first tick at a new camera position — it did not snap, so ` +
      `every dt = 0 capture would score a value that has not converged`);

    /* And the counterfactual: without a cut, the damping is still damping. */
    const { eng: e2 } = fakeEngine(0);
    const L2 = new Lighting(e2);
    L2.TUNE.holdEnclose = 0.9;
    L2.enclosure = 1; L2._encloseTarget = 1;
    L2._encloseAt = new THREE.Vector3(0, 0, 0);   // "already probed here"
    e2.camera.position.set(0, 0, 0);
    tick(L2, 1, 1 / 60);
    assert.ok(L2.enclosure > 0.5,
      `enclosure fell to ${L2.enclosure} in one 60 Hz frame without a camera cut; the term is supposed to ` +
      `dissolve over ~0.25 s, not switch`);
    L2.dispose?.();
  } finally { L.TUNE.holdEnclose = -1; L.dispose?.(); }
});

test('enclosure: the decision is binary with hysteresis, never a ramp through the middle', () => {
  const { eng } = fakeEngine(0);
  const L = new Lighting(eng);
  L.TUNE.holdEnclose = 0.9;
  try {
    const seen = new Set();
    for (let e = 0; e <= 1.0001; e += 0.05) {
      L.enclosure = e;
      L._skyOpen = null;                    // no carried state: test the bare compare
      seen.add(L._skyOpenDecision());
    }
    assert.deepEqual([...seen].sort(), [0, 1],
      `the decision produced ${[...seen].join(', ')}; §269 measured hold 0.6 as mud (dunes hue 355, ` +
      `sat 0.274), so any value strictly between 0 and 1 is the failure this term exists to avoid`);

    /* Hysteresis: inside the dead band the previous decision stands, in BOTH directions. */
    const h = L.TUNE.holdEncloseHyst * 0.5;
    L.enclosure = L.TUNE.holdEnclose - h - 0.01; L._skyOpen = null;
    assert.equal(L._skyOpenDecision(), 1, 'below the dead band must read OPEN');
    L.enclosure = L.TUNE.holdEnclose;        // walk into the middle
    assert.equal(L._skyOpenDecision(), 1, 'the dead band must hold the previous OPEN decision');
    L.enclosure = L.TUNE.holdEnclose + h + 0.01;
    assert.equal(L._skyOpenDecision(), 0, 'above the dead band must read ROOFED');
    L.enclosure = L.TUNE.holdEnclose;
    assert.equal(L._skyOpenDecision(), 0, 'the dead band must hold the previous ROOFED decision');

    /* First evaluation with no history fails to the PROTECTED side. §269 measured what the held
       band does to a tomb; an unnecessary teal shadow is the cheaper error. */
    L.enclosure = L.TUNE.holdEnclose; L._skyOpen = null;
    assert.equal(L._skyOpenDecision(), 0,
      'a first decision inside the dead band must fail to ROOFED, the protected side');
  } finally { L.TUNE.holdEnclose = -1; L.dispose?.(); }
});

test('enclosure: a fan that cast nothing is no information, not open sky', () => {
  /* The BVH is not built for the first frames of a boot, and `raycast` throws or is absent. The
     pre-holdscope code turned that into `_encloseTarget = 0`, which under the scope consumer
     would switch the held band ON inside a tomb for as long as it lasted. */
  const camera = new THREE.PerspectiveCamera();
  let live = false;
  const eng = {
    camera, debug: {}, scene: { add() {}, remove() {} }, on() {}, warn() {},
    quality: 'high', settings: {},
    get(k) { return k === 'collision' ? (live ? { raycast: () => ({ hit: true }) } : {}) : null; },
  };
  const L = new Lighting(eng);
  L.TUNE.holdEnclose = 0.9;
  try {
    live = true;
    camera.position.set(0, 0, 0);
    tick(L, 1);
    assert.equal(L._skyOpenDecision(), 0, 'precondition: the sealed reading is ROOFED');

    live = false;                            // BVH gone: no rays cast at all
    camera.position.set(50, 0, 0);           // and a cut, so the fan definitely re-fires
    tick(L, 1);
    assert.equal(L._encloseTarget, 1,
      `_encloseTarget fell to ${L._encloseTarget} when the fan cast nothing; "no information" must hold ` +
      `the previous reading, or one blind frame unroofs a tomb`);
    assert.equal(L._skyOpenDecision(), 0);
  } finally { L.TUNE.holdEnclose = -1; L.dispose?.(); }
});

test('shade band: shadowHold ships inert, so scoping it changes nothing until both knobs move', () => {
  assert.equal(SHADE_TUNE.shadowHold, 0,
    `ToonMaterial.TUNE.shadowHold is ${SHADE_TUNE.shadowHold}. §269 shipped it at 0 and PREREG-holdscope ` +
    `only raises it together with a threshold that passed every registered guard.`);
  assert.ok(SHADE_TUNE.shadowHoldKnee > 0,
    'shadowHoldKnee at 0 removes the achromatic guard that keeps limestone and granite on the ' +
    'violet-teal shadow §2.1.3 requires');
});

test('enclosure: toggling the term off and on re-probes, so an A/B arm cannot score a stale value', () => {
  /* The failure this catches is silent and would have looked like a tuning result: with the term
     toggled between arms, the second enable found `_encloseAt` still holding the old camera
     position, read "no jump", waited for the 6-frame beat, and left the smoothed value crawling
     up from 0 at 1/60 per dt = 0 frame. Every arm after the first would have been scored at an
     enclosure it had not reached. */
  const { eng } = fakeEngine(5);
  const L = new Lighting(eng);
  eng.camera.position.set(0, 0, 0);
  try {
    L.TUNE.holdEnclose = 0.9;
    tick(L, 2);
    assert.equal(L.enclosure, 1, 'precondition: the first enable snaps');

    L.TUNE.holdEnclose = -1;            // an intervening arm with scoping off
    tick(L, 2);
    assert.equal(L.enclosure, 0);
    assert.equal(L._encloseAt, null, 'the recorded probe position must be cleared while the fan is not casting');

    L.TUNE.holdEnclose = 0.9;           // and back on, camera unmoved
    tick(L, 1);
    assert.equal(L.enclosure, 1,
      `enclosure is ${L.enclosure} one frame after re-enabling at the same camera position; it did not ` +
      `re-probe, so a dt = 0 capture would score a value on its way up from 0`);
  } finally { L.TUNE.holdEnclose = -1; L.dispose?.(); }
});

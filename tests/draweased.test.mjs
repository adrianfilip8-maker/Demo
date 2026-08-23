/**
 * §610 — the drawn root eases; the capsule does not move.
 *
 * §599 measured the rope "teleport" the user reported twice and found TWO cuts in one frame: the
 * camera passes 1.801 m of the chain's 4.646 m entry catch through its follow spring, and the
 * drawn body takes the whole 4.646 m through an undamped `root.position.copy(this.position)`.
 * `Controller._easeDraw` holds back the part of a frame's displacement that velocity does not
 * explain and pays it off in `TUNE.drawEaseFrames` equal steps.
 *
 * THE ONE PROPERTY EVERYTHING ELSE RESTS ON is that this is presentation and nothing more. Four
 * simulation-side attempts at the same complaint (§593-§598) each moved the chain — a duplicate
 * grab, then a leg that stopped — and the reason this one cannot is structural: the offset is
 * written by `_easeDraw` and read by `_pushCharacter`, and there is no third party. Arm C asserts
 * it rather than asserting the shape of the code, because "no path exists" is a claim about
 * behaviour and behaviour is measurable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT as dt } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

const LINTEL = new THREE.Vector3(2.2, 9.0, 8.4);
const RINGS = [new THREE.Vector3(4.2, 14.8, 4.5), new THREE.Vector3(1.0, 14.5, -3.0),
               new THREE.Vector3(-4.0, 13.9, -8.5), new THREE.Vector3(-9.5, 13.2, -13.0)];
const WS = [156, 12, 24];
const ringOf = (p) => { let b = -1, bd = 1.2; RINGS.forEach((r, i) => { const d = r.distanceTo(p); if (d < bd) { bd = d; b = i; } }); return b; };

const { engine, c } = await realWorld();

function aim(dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
}

/**
 * The four-ring chain, recording the CAPSULE track and the DRAWN track separately.
 *
 * `realWorld()` builds no character, so `_pushCharacter` drives the placeholder. That is the same
 * seam — one line apart in the same method, both `.sub(this._drawLag)` — and it is the one this
 * harness can see. The drawn track is therefore read back off the placeholder with its half-height
 * offset removed, which is what makes `drawn[i] === capsule[i] - lag[i]` checkable here at all.
 */
function drive() {
  hardReset(engine, c, LINTEL.clone(), Math.PI);
  engine.events.length = 0;
  const cap = []; const drawn = []; const order = [];
  let grabs = 0, grabFrame = -1, bailing = false;
  for (let f = 0; f < 2600; f++) {
    const target = RINGS[Math.min(grabs, RINGS.length - 1)];
    const swinging = c.sm.name === 'hookSwing';
    if (swinging) aim(c.velocity.x, c.velocity.z);
    else aim(target.x - c.position.x, target.z - c.position.z);
    engine.input.beginFrame(dt);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (f === 1 || f === 2) engine.input.hold('jump');
    else if (f === 3) engine.input.let_go('jump');
    else if (!swinging && grabs === 0 && f > 3) engine.input.hold('interact');
    if (swinging) {
      if (grabFrame >= 0 && grabs <= WS.length && f - grabFrame === WS[grabs - 1]) {
        engine.input.hold('jump'); bailing = true;
      } else if (bailing) { engine.input.let_go('jump'); bailing = false; }
    }
    engine.time = f * dt; c.update(dt, f * dt);
    cap.push(c.position.x, c.position.y, c.position.z);
    const ph = c._placeholder;
    if (ph) drawn.push(ph.position.x, ph.position.y - TUNE.height * 0.5, ph.position.z);
    for (const e of engine.events) if (e.evt === 'hookGrab') { order.push(ringOf(e.payload.pos) + 1); grabs++; grabFrame = f; }
    engine.events.length = 0;
    if (grabs >= 4) break;
    if (c.grounded && grabs > 0 && f > grabFrame + 30) break;
  }
  return { cap, drawn, order };
}

function withEase(n, fn) {
  const was = TUNE.drawEaseFrames;
  TUNE.drawEaseFrames = n;
  try { return fn(); } finally { TUNE.drawEaseFrames = was; }
}

const steps = (t) => {
  const out = [];
  for (let i = 3; i < t.length; i += 3) {
    out.push(Math.hypot(t[i] - t[i - 3], t[i + 1] - t[i - 2], t[i + 2] - t[i - 1]));
  }
  return out;
};
const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), 0);

test('C1: a same-tune control — two drives with the easing OFF are bit-identical', () => {
  /* The yardstick, and it has to be established before any on/off claim is made. This harness has
     been reported to diverge by ~1e-6 between runs, which would make "bit-identical" meaningless
     as a criterion; if that is true here, this arm fails and every comparison below has to be
     re-expressed as a tolerance. It is checked rather than assumed (§439). */
  const a = withEase(0, drive);
  const b = withEase(0, drive);
  assert.equal(a.cap.length, b.cap.length, 'two identical drives ran for different lengths');
  let worst = 0, at = -1;
  for (let i = 0; i < a.cap.length; i++) {
    const d = Math.abs(a.cap[i] - b.cap[i]);
    if (d > worst) { worst = d; at = i; }
  }
  assert.equal(worst, 0,
    `two drives with the SAME tune diverged by ${worst} at component ${at} — the harness is not `
    + 'deterministic, so no on/off comparison below can be stated as bit-identity');
  console.log(`[C1] control: ${a.cap.length / 3} frames, two runs, max component divergence ${worst}`);
});

test('C2: the capsule trace is bit-identical with the easing on and off', () => {
  /* THE BAR. Not "close enough": exactly equal, component by component, over the whole chain. The
     easing may only ever be a presentation offset, and any leak into the simulation — a read of
     the drawn root by a state, an affordance poll taken off the visual position — would show up
     here as a divergence that grows. */
  const off = withEase(0, drive);
  const on = withEase(TUNE.drawEaseFrames || 4, drive);

  assert.equal(on.cap.length, off.cap.length,
    `the drive ran ${on.cap.length / 3} frames with the easing on and ${off.cap.length / 3} with it `
    + 'off — the easing changed how long the chain took, which means it reached the simulation');

  let worst = 0, at = -1;
  for (let i = 0; i < off.cap.length; i++) {
    const d = Math.abs(on.cap[i] - off.cap[i]);
    if (d > worst) { worst = d; at = i; }
  }
  assert.equal(worst, 0,
    `the capsule moved when the easing was switched on: max component divergence ${worst} at `
    + `component ${at} (frame ${Math.floor(at / 3)}). Presentation must not be able to do this.`);

  assert.deepEqual(on.order, off.order,
    `ring order changed with the easing on: [${on.order}] vs [${off.order}]`);
  assert.deepEqual(on.order, [1, 2, 3, 4],
    `the chain did not close in authored order: [${on.order}]`);
  console.log(`[C2] capsule bit-identical over ${on.cap.length / 3} frames; chain [${on.order}] both ways`);
});

test('C3: the drawn body\'s worst single-frame step is cut by drawEaseFrames', () => {
  const N = TUNE.drawEaseFrames || 4;
  const off = withEase(0, drive);
  const on = withEase(N, drive);

  const capMax = maxOf(steps(off.cap));
  const drawnOffMax = maxOf(steps(off.drawn));
  const drawnOnMax = maxOf(steps(on.drawn));

  /* With the easing off the drawn track IS the capsule track — that is the defect §599 named, and
     it is worth asserting so the arm cannot pass by measuring the wrong object. */
  assert.ok(Math.abs(drawnOffMax - capMax) < 1e-9,
    `with the easing off the drawn body should move exactly with the capsule, but their worst `
    + `steps differ: drawn ${drawnOffMax} vs capsule ${capMax}`);

  /* The bound: a snap is paid off in N equal steps, so the drawn step is the snap over N plus at
     most the honest travel of that frame. `capMax / N` alone would be too tight by exactly that
     explained part, which at the entry catch is 0.094 m; allow it and no more. */
  const bound = capMax / N + 0.15;
  assert.ok(drawnOnMax < bound,
    `the drawn body still steps ${drawnOnMax.toFixed(3)} m in one frame against a bound of `
    + `${bound.toFixed(3)} (capsule ${capMax.toFixed(3)} over N=${N}) — the easing is not paying `
    + 'the snap off in equal parts');
  assert.ok(drawnOnMax < capMax * 0.5,
    `the drawn worst step ${drawnOnMax.toFixed(3)} m is not meaningfully below the capsule's `
    + `${capMax.toFixed(3)} m — with N=${N} it should be near a quarter of it`);
  console.log(`[C3] worst single-frame step  capsule ${capMax.toFixed(3)} m -> drawn ${drawnOnMax.toFixed(3)} m `
    + `(N=${N}, bound ${bound.toFixed(3)}); easing off, drawn == capsule at ${drawnOffMax.toFixed(3)}`);
});

test('C4: the offset is bounded, always paid off, and zero for most of the drive', () => {
  const N = TUNE.drawEaseFrames || 4;
  const on = withEase(N, drive);
  const off = withEase(0, drive);

  /* lag[i] = capsule[i] - drawn[i], reconstructed from the two tracks rather than read out of the
     Controller, so the arm measures what was DRAWN and not what the field happened to hold. */
  let worstLag = 0, nonZero = 0, run = 0, worstRun = 0;
  const frames = on.cap.length / 3;
  for (let i = 0; i < frames; i++) {
    const L = Math.hypot(on.cap[i * 3] - on.drawn[i * 3],
                         on.cap[i * 3 + 1] - on.drawn[i * 3 + 1],
                         on.cap[i * 3 + 2] - on.drawn[i * 3 + 2]);
    if (L > worstLag) worstLag = L;
    if (L > 1e-9) { nonZero++; run++; if (run > worstRun) worstRun = run; } else run = 0;
  }

  const capMax = maxOf(steps(off.cap));
  assert.ok(worstLag <= capMax * (N - 1) / N + 1e-6,
    `the drawn body fell ${worstLag.toFixed(3)} m behind its capsule; with N=${N} the payoff is `
    + `linear so it can never exceed ${(capMax * (N - 1) / N).toFixed(3)} m`);
  assert.ok(worstLag < TUNE.drawLagMax,
    `lag ${worstLag.toFixed(3)} m reached the ${TUNE.drawLagMax} m clamp — the clamp is a bound `
    + 'against pathological frames, not a working part of the easing');
  assert.ok(worstRun <= N,
    `the drawn body was off its capsule for ${worstRun} consecutive frames against N=${N} — the `
    + 'payoff is not completing, so lag is accumulating faster than it is spent');

  /* And it is idle nearly all the time: this eases placements, not motion. */
  const share = nonZero / frames;
  assert.ok(share < 0.15,
    `the offset was non-zero on ${(share * 100).toFixed(1)}% of frames — it should fire only on `
    + 'placements, so a large share means ordinary locomotion is being eased');
  console.log(`[C4] worst lag ${worstLag.toFixed(3)} m (ceiling ${(capMax * (N - 1) / N).toFixed(3)}), `
    + `longest run ${worstRun}/${N} frames, non-zero on ${nonZero}/${frames} frames (${(share * 100).toFixed(1)}%)`);
});

test('C5: a teleport is spent, not eased — and shot mode never carries an offset', () => {
  /* `Debug.js`:141 teleports before every canonical shot and reads the root back at :184 to record
     where Sly was staged. If a teleport were eased, the drawn body would be dragged across the
     level from a position that no longer exists and the shot report would record the offset as the
     staging. Same rule as the spawn snap, which `_probeEnvironment` re-anchors for the same
     reason. */
  hardReset(engine, c, LINTEL.clone(), Math.PI);
  for (let f = 0; f < 8; f++) { engine.input.beginFrame(dt); engine.time = f * dt; c.update(dt, f * dt); }

  c.teleport(new THREE.Vector3(-9.5, 6.0, -13.0), 0);
  assert.equal(c._drawLag.length(), 0, 'teleport left an easing offset standing');
  assert.equal(c._drawEaseN, 0, 'teleport left payoff frames owed');

  /* One update after a 20 m teleport must not read the teleport itself as a snap to ease. */
  engine.input.beginFrame(dt); engine.time = 9 * dt; c.update(dt, 9 * dt);
  assert.ok(c._drawLag.length() < 1e-9,
    `the frame after a teleport eased ${c._drawLag.length().toFixed(3)} m — the teleport was read `
    + 'as a displacement, which is exactly what re-anchoring `_drawP0` prevents');

  /* Shot mode: force a standing offset, then freeze. The freeCam branch must clear it before
     `_pushCharacter` runs, or `Debug.js`:184 records a staged position nobody asked for. */
  c._drawLag.set(1, 2, 3); c._drawEaseN = 3;
  engine.debug.freeCam = true;
  try {
    engine.input.beginFrame(dt); engine.time = 10 * dt; c.update(dt, 10 * dt);
    assert.equal(c._drawLag.length(), 0, 'shot mode ran with an easing offset standing');
    const ph = c._placeholder;
    if (ph) {
      assert.ok(Math.abs(ph.position.x - c.position.x) < 1e-9 && Math.abs(ph.position.z - c.position.z) < 1e-9,
        'the drawn body is not where the shot recipe placed the capsule');
    }
  } finally { engine.debug.freeCam = false; }
  console.log('[C5] teleport spends the offset, the next frame does not re-capture it, shot mode draws exact');
});

test('C6: DOMAIN — the easing fires on a placement and refuses ordinary running', () => {
  /* §418.3: an input seen to PASS and one seen to FAIL, both run in-arm. The pass is the chain's
     entry catch. The fail is a flat run at full speed, which covers more ground per frame than a
     ledge mount does and must still never be eased — that is the whole reason the predicate is
     "unexplained" and not "large". */
  const N = TUNE.drawEaseFrames || 4;

  const on = withEase(N, drive);
  let caught = 0;
  for (let i = 0; i < on.cap.length / 3; i++) {
    const L = Math.hypot(on.cap[i * 3] - on.drawn[i * 3], on.cap[i * 3 + 1] - on.drawn[i * 3 + 1],
                         on.cap[i * 3 + 2] - on.drawn[i * 3 + 2]);
    if (L > 1e-9) caught++;
  }
  assert.ok(caught > 0, 'the chain produced no easing at all — the predicate never fired');

  /* The negative: run flat out across the courtyard for 600 frames. */
  hardReset(engine, c, new THREE.Vector3(0, 2, 20), 0);
  let eased = 0, fastest = 0, prev = c.position.clone();
  for (let f = 0; f < 600; f++) {
    aim(0, 1);
    engine.input.beginFrame(dt);
    engine.input.move.x = 0; engine.input.move.y = 1;
    engine.input.hold('run');
    engine.time = f * dt; c.update(dt, f * dt);
    const step = prev.distanceTo(c.position); prev.copy(c.position);
    if (step > fastest) fastest = step;
    if (c._drawLag.length() > 1e-9) eased++;
  }
  assert.equal(eased, 0,
    `${eased} of 600 flat-out running frames were eased (fastest step ${fastest.toFixed(3)} m) — `
    + 'ordinary locomotion is being held back, which will read as the body lagging the controls');
  assert.ok(fastest > 0.10,
    `the negative control only reached ${fastest.toFixed(3)} m per frame, which is too slow to `
    + 'discriminate — it would pass on any threshold and asserts nothing');
  console.log(`[C6] placement: ${caught} eased frames on the chain · running: 0 of 600 eased at up to `
    + `${fastest.toFixed(3)} m/frame`);
});

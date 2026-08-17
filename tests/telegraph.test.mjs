import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDom, fakeEngine } from './_hudshim.mjs';
import { realWorld, hardReset } from './_moveset.mjs';

/**
 * The traversal telegraph, HUD half.
 *
 * ── What was measured, and why this exists ─────────────────────────────────────────────────
 * Driven on the shipped level: **nothing on screen says what is grabbable**, and both grab paths
 * announce on the frame they commit.
 *
 *     auto-grab (freefall onto ring 3)      fall@0   -> hookSwing@27, hookGrab@27    0 frames
 *     E-grab    (kiosk lintel -> ring 3)    tiptoe@0 -> hookSwing@30, hookGrab@30    0 frames
 *
 * The bus census explains it without needing either drive: `thiefTargets` is the only target
 * signal that reaches the HUD and `Controller._thiefVision` emits it *only* on the rising edge of
 * holding `focus`; `targetLocked` — the signal that means the game has chosen a hold — has one
 * listener and it is `Particles._onTargetLocked`; `hookGrab`/`railMount` reach Audio and FX only
 * and fire on contact. So the renderer existed and nothing was wired to it, which is §357.1 with
 * the expensive half already built.
 *
 * ── The publisher has LANDED, and the arms changed shape because of it ─────────────────────
 * `Controller._telegraph()` now emits. The HUD arms below still drive a SYNTHETIC event — that is
 * the right instrument for "does the view render what it is given" — but they no longer claim they
 * cannot discriminate the emit, because a real driven arm at the bottom of this file does. That
 * last arm is the only one that can tell "the HUD renders what it is given" apart from "the game
 * gives it something in time", and it is the one that closes the loop.
 *
 * Delivered lead, measured the same way as the 0-frame baseline that motivated the work:
 *
 *     E-grab (kiosk lintel -> ring 3)      telegraph@0,  hookGrab@30  ->  30 frames, 0.50 s
 *     auto-grab (fall from y 25 onto ring 3) telegraph@26, hookGrab@63  ->  37 frames, 0.62 s
 *     auto-grab (fall from y 30)             telegraph@46, hookGrab@76  ->  30 frames, 0.50 s
 */

async function bootHud() {
  installDom();
  const { HUD } = await import('../src/ui/HUD.js');
  const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -20);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const engine = fakeEngine(camera);
  const hud = new HUD(engine);
  await hud.init();
  return { hud, engine, camera };
}
const frame = (hud, engine) => { engine.dt = 1 / 60; engine.time += 1 / 60; hud.update(1 / 60); };
/** Pixel offset the mark was translated to, parsed from the element's transform. */
const markXY = (hud) => {
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(hud.el.lock.style.transform || '');
  return m ? { x: +m[1], y: +m[2] } : null;
};
const markOn = (hud) => hud.el.lock.classList.contains('on');

test('telegraph: a hold in front of the camera raises a mark near frame centre', async () => {
  /* DOMAIN (§418.3 + the third line)
   *   passes on : a point 12 m straight down the camera's forward axis — the mark comes on and
   *               lands within a quarter-frame of centre.
   *   fails  on : a point 12 m BEHIND the camera — `_project` rejects it and no mark appears.
   *   cannot discriminate : the emit's TIMING or its choice of hold. Both inputs here are
   *               synthetic, so this arm covers projection and gating only. The driven arm at the
   *               bottom of this file covers whether the game emits, when, and pointing at what.
   */
  const { hud, engine } = await bootHud();

  engine.emit('telegraph', { point: new THREE.Vector3(0, 2, -12), kind: 'hook', distance: 12 });
  frame(hud, engine);
  assert.ok(markOn(hud), 'a hold ahead of the camera must raise the mark');
  const ahead = markXY(hud);
  assert.ok(ahead, 'the mark must be positioned');
  assert.ok(Math.abs(ahead.x - 640) < 320 && Math.abs(ahead.y - 360) < 180,
    `a hold dead ahead must land near centre, got (${ahead.x}, ${ahead.y})`);

  engine.emit('telegraph', { point: new THREE.Vector3(0, 2, +12), kind: 'hook', distance: 12 });
  frame(hud, engine);
  assert.equal(markOn(hud), false, 'a hold behind the camera must not be marked');
  console.log(`\n[telegraph] ahead -> mark at (${ahead.x.toFixed(0)}, ${ahead.y.toFixed(0)}) · behind -> no mark`);
});

test('telegraph: the mark follows the hold, and null retires it', async () => {
  /* DOMAIN (§418.3 + the third line)
   *   passes on : two holds at different screen positions — the mark moves between them.
   *   fails  on : `telegraph` with a null payload — the mark goes off.
   *   cannot discriminate : whether the publisher ever sends null in play. `_telegraph` emits
   *               null when the best hold's identity becomes none, but this arm proves only that
   *               the HUD honours it when told.
   */
  const { hud, engine } = await bootHud();

  engine.emit('telegraph', { point: new THREE.Vector3(-4, 2, -12) });
  frame(hud, engine);
  const left = markXY(hud);
  engine.emit('telegraph', { point: new THREE.Vector3(+4, 2, -12) });
  frame(hud, engine);
  const right = markXY(hud);
  assert.ok(left && right, 'both holds must project');
  assert.ok(right.x - left.x > 100,
    `the mark must follow the hold across the frame, got ${left.x.toFixed(0)} -> ${right.x.toFixed(0)}`);

  engine.emit('telegraph', null);
  frame(hud, engine);
  assert.equal(markOn(hud), false, 'a null telegraph must retire the mark');
  console.log(`[telegraph] follows: x ${left.x.toFixed(0)} -> ${right.x.toFixed(0)} · null retires`);
});

test('telegraph: a combat lock outranks the traversal telegraph', async () => {
  /* DOMAIN (§418.3 + the third line)
   *   passes on : `lockOn` and `telegraph` live at once — the mark sits at the LOCK's position.
   *   fails  on : the same pair with the lock retired — the mark falls back to the telegraph's
   *               position, proving the precedence is a real branch and not a constant.
   *   cannot discriminate : whether the two ever coexist in play. They may never, and the
   *               precedence exists because nothing in the state machine guarantees they cannot.
   *               This arm shows the branch works, not that it is ever taken. That one is
   *               genuinely unreachable and stays.
   */
  const { hud, engine } = await bootHud();

  engine.emit('telegraph', { point: new THREE.Vector3(-6, 2, -12) });
  engine.emit('lockOn', { pos: new THREE.Vector3(+6, 2, -12) });
  frame(hud, engine);
  const withLock = markXY(hud);

  engine.emit('lockOn', null);
  frame(hud, engine);
  const withoutLock = markXY(hud);

  assert.ok(withLock && withoutLock, 'both states must project a mark');
  assert.ok(withLock.x > 640, `combat lock is to the right of centre, got ${withLock.x.toFixed(0)}`);
  assert.ok(withoutLock.x < 640, `telegraph is to the left of centre, got ${withoutLock.x.toFixed(0)}`);
  assert.ok(withLock.x - withoutLock.x > 200,
    'retiring the lock must hand the mark back to the telegraph, at a visibly different place');
  console.log(`[telegraph] precedence: lock ${withLock.x.toFixed(0)} -> telegraph ${withoutLock.x.toFixed(0)}`);
});

test('telegraph: DRIVEN — the game emits a hook mark before the player commits', async () => {
  /* THE ARM THAT CLOSES THE LOOP. Every arm above drives the HUD with a synthetic event and so
   * can only show that the view renders what it is given. This one runs the real `Controller`
   * over the shipped level and asks the question that actually matters: does the GAME produce a
   * telegraph, pointing at the hold it is about to take, BEFORE the frame it commits?
   *
   * DOMAIN (§418.3 + the third line)
   *   passes on : §8.1 step 2's E-grab — standing on the kiosk lintel (2.2, 8.95, 8.4), pressing
   *               `interact` at frame 30. `telegraph` fires with kind `hook` at ring 3 and
   *               `hookGrab` lands at frame 30, so the mark precedes the commitment.
   *   fails  on : the same drive with no hold in reach — spawn (0, 0, 30), where the nearest hook
   *               is far outside `hookGrab` 9.0. No hook telegraph is emitted at all. Both are
   *               driven here, so the arm distinguishes "emits a hook mark" from "emits always".
   *   cannot discriminate : whether the lead is ENOUGH. 30 frames is what this beat delivers and
   *               whether half a second is adequate warning is a feel question this arm has no
   *               access to. It pins that the lead is positive and that the mark names the right
   *               hold; it does not certify the number.
   *
   * The baseline this replaces: before the emit, both grab paths gave 0 frames — announcement and
   * commitment on the same frame. */
  const { realWorld, hardReset, DT } = await import('./_moveset.mjs');
  const { engine, c } = await realWorld();

  const drive = (start, script, frames) => {
    engine.input.clear();
    hardReset(engine, c, new THREE.Vector3(start[0], start[1], start[2]), Math.PI);
    let tele = -1, point = null, grab = -1;
    for (let i = 0; i < frames; i++) {
      engine.events.length = 0;
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      script(engine.input, i);
      engine.time = i * DT;
      c.update(DT, i * DT);
      for (const e of engine.events) {
        if (e.evt === 'telegraph' && e.payload?.kind === 'hook' && tele < 0) {
          tele = i; point = e.payload.point.clone();
        }
        if (e.evt === 'hookGrab' && grab < 0) grab = i;
      }
    }
    return { tele, point, grab };
  };

  const eGrab = drive([2.2, 8.95, 8.4],
    (inp, i) => { if (i === 30) inp.hold('interact'); if (i === 34) inp.let_go('interact'); }, 200);
  const noHold = drive([0, 0, 30], () => {}, 120);

  assert.ok(eGrab.tele >= 0, 'the game must emit a hook telegraph on the lintel beat');
  assert.ok(eGrab.grab >= 0, 'the beat must actually reach a grab, or it proves nothing');
  assert.ok(eGrab.tele < eGrab.grab,
    `the mark must precede the commitment: telegraph@${eGrab.tele} vs hookGrab@${eGrab.grab}`);
  /* It must name the hold that is actually taken — ring 3 at (4.2, 14.8, 4.5). A mark on the
     ledge underfoot passed an earlier version of this and told the player nothing; ranking by
     KIND rather than by distance is what fixed it. */
  assert.ok(eGrab.point && eGrab.point.distanceTo(new THREE.Vector3(4.2, 14.8, 4.5)) < 0.5,
    `the mark must name ring 3, got ${eGrab.point && JSON.stringify(eGrab.point.toArray().map((v) => Math.round(v * 100) / 100))}`);
  assert.equal(noHold.tele, -1,
    'the failing input: standing at spawn with no hook in reach must emit no hook telegraph');

  console.log(`[telegraph] DRIVEN E-grab: telegraph@${eGrab.tele} -> hookGrab@${eGrab.grab} = `
    + `${eGrab.grab - eGrab.tele} frames (${((eGrab.grab - eGrab.tele) / 60).toFixed(2)} s) lead, baseline was 0`);
});

test('telegraph: the harness can start a beat airborne, at a stated height', async () => {
  /* The harness defect this pins. `hardReset` to (4.2, 19.5, 4.5) followed by one update put Sly
   * on the terrace deck at y 2 — a 17.5 m fall in one frame, grounded, `idle` — on the FIRST
   * update of each freshly-minted Controller, from any height. The second and third calls at the
   * same height left him at 19.49 and falling. **No test in this project could start a beat
   * airborne**, so every airborne-entry move was reachable only by first driving Sly off
   * something, and a probe that asked for height silently got the ground.
   *
   * `realWorld()` now burns that frame off before handing the Controller over. Not identified as
   * `_calibrate` — forcing `_bindCollision()` first sets `_calibrated` and the snap still happens;
   * see `burnFirstFrame`'s note, which says the root cause is unfound rather than fixed.
   *
   * DOMAIN (§418.3 + the third line)
   *   passes on : y 30, 19.5 and 8.95 — `grounded === false` at frame 0, within 2 cm of the
   *               stated height, state `fall`.
   *   fails  on : y 0.0 at spawn — genuinely on the ground, so `grounded === true`. Both run, so
   *               the arm distinguishes "airborne when asked" from "never grounded".
   *   cannot discriminate : whether the underlying first-frame snap is fixed. It is burned off,
   *               not repaired, and `Debug.setShot` steps a fresh Controller the same way.
   */
  const { realWorld, hardReset, DT } = await import('./_moveset.mjs');
  const { engine, c } = await realWorld();

  const at = (y) => {
    engine.input.clear();
    hardReset(engine, c, new THREE.Vector3(4.2, y, 4.5), Math.PI);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    c.update(DT, 0);
    return { y: c.position.y, grounded: c.grounded, state: c.stateName };
  };

  for (const y of [30, 19.5, 8.95]) {
    const r = at(y);
    assert.equal(r.grounded, false, `asked for y ${y} airborne, got grounded at y ${r.y.toFixed(2)}`);
    assert.ok(Math.abs(r.y - y) < 0.05,
      `airborne start must hold its height: asked ${y}, got ${r.y.toFixed(2)} — the 17.5 m snap is back`);
  }
  /* The failing input: a height that really is the ground. */
  engine.input.clear();
  hardReset(engine, c, new THREE.Vector3(0, 0, 30), Math.PI);
  engine.input.beginFrame(DT);
  engine.input.move.x = 0; engine.input.move.y = 0;
  c.update(DT, 0);
  assert.equal(c.grounded, true, 'a start on the paving must be grounded, or the arm proves nothing');
  console.log(`[telegraph] airborne starts hold at 30 / 19.5 / 8.95; spawn is grounded`);
});

test('telegraph: DRIVEN — the auto-grab path also leads the commitment', async () => {
  /* The path that could not be measured until the harness could place him in the air.
   *
   * My recorded prediction was that this would be structurally SHORTER than the E-grab's 30
   * frames, because the auto-grab is bounded by `hookAuto` rather than `hookGrab`. **That was
   * wrong, and the reason is worth keeping**: `_telegraph` reads `afford('hook')`, whose reach is
   * `AFFORD.hook.range` = `hookGrab` 9.0 on BOTH paths. `hookAuto` governs when the grab fires,
   * not when the affordance becomes visible, so the telegraph opens at the same 9 m sphere either
   * way — and the fall spends longer inside it than the standing E-grab does.
   *
   * DOMAIN (§418.3 + the third line)
   *   passes on : a fall from y 25 onto ring 3 — telegraph@26, hookGrab@63, 37 frames.
   *   fails  on : a fall from y 25 at x -20, far from any ring — no hook telegraph at all.
   *   cannot discriminate : whether 0.62 s is enough warning. Same as the E-grab arm: it pins
   *               the lead positive and correctly aimed, never that the number is adequate.
   */
  const { realWorld, hardReset, DT } = await import('./_moveset.mjs');
  const { engine, c } = await realWorld();

  const fall = (x, z) => {
    engine.input.clear();
    hardReset(engine, c, new THREE.Vector3(x, 25, z), Math.PI);
    let tele = -1, grab = -1, point = null;
    for (let i = 0; i < 300; i++) {
      engine.events.length = 0;
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT;
      c.update(DT, i * DT);
      for (const e of engine.events) {
        if (e.evt === 'telegraph' && e.payload?.kind === 'hook' && tele < 0) { tele = i; point = e.payload.point.clone(); }
        if (e.evt === 'hookGrab' && grab < 0) grab = i;
      }
    }
    return { tele, grab, point };
  };

  const onRing = fall(4.2, 4.5);
  const away = fall(-20, 4.5);

  assert.ok(onRing.tele >= 0 && onRing.grab >= 0, 'the fall must telegraph and then grab');
  assert.ok(onRing.tele < onRing.grab,
    `the mark must precede the grab: telegraph@${onRing.tele} vs hookGrab@${onRing.grab}`);
  assert.ok(onRing.point.distanceTo(new THREE.Vector3(4.2, 14.8, 4.5)) < 0.5, 'must name ring 3');
  assert.equal(away.tele, -1, 'the failing input: falling far from any ring emits no hook telegraph');
  console.log(`[telegraph] DRIVEN auto-grab: telegraph@${onRing.tele} -> hookGrab@${onRing.grab} = `
    + `${onRing.grab - onRing.tele} frames (${((onRing.grab - onRing.tele) / 60).toFixed(2)} s)`);
});

/* ====================================================================== */
/* T7 — a hookGrab payload must be a copy, or no chain can be measured    */
/* ====================================================================== */

test('telegraph: hookGrab reports the ring it grabbed, not the one grabbed last', async () => {
  /* ── WHY ──────────────────────────────────────────────────────────────────────────────────
   * `c.anchor` is ONE persistent Vector3 on the Controller, reused for every hook. `hookGrab`
   * passed it LIVE. `Engine.emit` is synchronous, so AUDIO and FX — which read during the call —
   * were always correct, and nothing shipped was ever wrong. Anyone who KEEPS the payload was:
   * a collected event stream reports whichever ring was grabbed last for every grab in it.
   *
   * That is not theoretical. It is why §504.2 could not pair `telegraph` with `hookGrab` across
   * the authored four-ring chain, and it is the shape §449's published table would take if it
   * read stored payloads — its last three grabs name the same ring. `telegraph` a few lines away
   * already clones; this was the inconsistency, not the rule.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : two grabs at different anchors — each payload keeps its own position after the
   *               anchor has moved on.
   *   fails  on : RUN in-arm — the pre-fix behaviour, reconstructed by storing the live `anchor`
   *               reference alongside, which reports the SECOND ring for both.
   *   does NOT  : say anything about when `hookGrab` fires, or about telegraph leads. It pins
   *   discrim.    that the payload is a copy, which is the precondition for measuring those.
   */
  const { engine, c } = await realWorld();
  hardReset(engine, c, new THREE.Vector3(0, 0.2, 30), Math.PI);

  const kept = [];
  const live = [];
  const off = engine.on('hookGrab', (p) => { kept.push(p.pos); live.push(c.anchor); });

  /* Two grabs at deliberately different anchors, emitted through the real state. */
  const A = new THREE.Vector3(4.2, 14.8, 4.5);
  const B = new THREE.Vector3(-9.5, 13.2, -13.0);
  for (const at of [A, B]) {
    c.anchor.copy(at);
    c.engine.emit('hookGrab', { pos: c.anchor.clone(), material: 'stone' });
  }
  off?.();

  assert.equal(kept.length, 2, 'both grabs must reach the listener');
  assert.ok(kept[0].distanceTo(A) < 1e-9,
    `the first grab reported (${kept[0].x.toFixed(1)}, ${kept[0].z.toFixed(1)}) but grabbed `
    + `(${A.x}, ${A.z}). A payload that changes after emit cannot be paired with anything.`);
  assert.ok(kept[1].distanceTo(B) < 1e-9, 'the second grab must report its own ring');
  assert.ok(kept[0].distanceTo(kept[1]) > 1e-6,
    'two grabs at different rings reported the same position — the payload is aliasing the '
    + 'anchor and every grab in a collected stream is the last one');

  /* ── the counterexample, RUN: the pre-fix aliasing, reconstructed ── */
  assert.ok(live[0] === live[1],
    'the reconstruction is not faithful: passing `c.anchor` live must yield the SAME object for '
    + 'both grabs, which is exactly what made them indistinguishable');
  assert.ok(live[0].distanceTo(B) < 1e-9 && live[0].distanceTo(A) > 1,
    `the live reference reports (${live[0].x.toFixed(1)}, ${live[0].z.toFixed(1)}) for BOTH grabs `
    + '— the second ring. That is the defect this arm exists to keep fixed.');

  console.log('[T7] cloned payloads keep their own ring; the live reference reports the last one for both');
});

/* ====================================================================== */
/* T8 — the authored ring chain is completable, and a committed driver     */
/* ====================================================================== */

test('telegraph: the authored hook chain chains — the release that carries you is `bail`, not `crouch`', async () => {
  /* ── WHY THIS EXISTS, AND WHAT IT CORRECTS ────────────────────────────────────────────────
   * §505.1 recorded a hypothesis: `HookSwing`'s release does `velocity.multiplyScalar(0.5)`, so
   * flying to a ring 7+ m away might not be drivable at all — which would make the authored
   * four-ring chain, on the critical path to the vault, uncompletable.
   *
   * **The hypothesis is false, and it was my driver's fault.** There are TWO releases:
   *
   *     bail   jump / buffered jump / interact / attack, after `hookMinSwing`
   *            -> velocity x `hookRelease` 1.15, PLUS `hookUpKick` 2.4 of lift   <- the chain release
   *     crouch after `hookMinSwing`
   *            -> velocity x 0.5                                                <- the drop-off
   *
   * Four drivers across two lanes held `crouch`. That is the deliberate step-off, not the launch.
   * A second error compounded it: starting Sly hanging directly below the ring at rest is the
   * pendulum's stable equilibrium, so the swing never swings — release speed came out 1.65 m/s at
   * every hold from 12 to 80 frames, which should have read as an instrument fault immediately
   * (§442.3) and instead read as "the chain is hard".
   *
   * ── WHAT THIS ARM PINS ────────────────────────────────────────────────────────────────────
   * Sly arrives at a ring with real speed, grabs, swings, and bails toward the next ring.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : legs ring1->ring2 (8.16 m) and ring2->ring3 (7.46 m), which reach the INTENDED
   *               next ring across every arrival speed swept, 6 to 18 m/s.
   *   fails  on : RUN in-arm — the same legs released with `crouch` instead, which is the drop-off
   *               path and does not carry.
   *   does NOT  : measure telegraph LEADS. It proves the chain is drivable, which is the
   *   discrim.    precondition §505.1 said was missing; pairing leads still needs a full drive
   *               from the kiosk lintel. Nor does it pin leg ring3->ring4: that leg closes to
   *               0.66 m of ring 4 — 4x inside `hookAuto` 2.9 — but `afford('hook')` returns a
   *               DIFFERENT hook in reach and Sly grabs that one instead, via `toTarget`. Real
   *               behaviour, recorded in §506, not asserted here.
   */
  const { realWorld: rw, hardReset: hr, DT: dt } = await import('./_moveset.mjs');
  const { TUNE: T } = await import('../src/player/Controller.js');
  const { engine, c } = await rw();
  const RINGS = [[4.2, 14.8, 4.5], [1.0, 14.5, -3.0], [-4.0, 13.9, -8.5]].map((a) => new THREE.Vector3(...a));

  function aim(dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  }

  /** Arrive at ring `ri` at `v` m/s aimed at the next, grab, swing `hold` frames, release. */
  function leg(ri, v, hold, release) {
    const A = RINGS[ri], B = RINGS[ri + 1];
    const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    const start = A.clone().addScaledVector(dir, -2.0); start.y = A.y - T.hookL;
    hr(engine, c, start, Math.PI);
    c.grounded = false; c.sm.set('fall');
    c.velocity.copy(dir).multiplyScalar(v);
    let relAt = -1, released = false, closest = Infinity;
    for (let i = 0; i < 400; i++) {
      aim(B.x - c.position.x, B.z - c.position.z);
      engine.input.beginFrame(dt);
      engine.input.move.x = 0; engine.input.move.y = 1;
      if (c.sm.name === 'hookSwing') { if (relAt < 0) relAt = i; if (i - relAt === hold) engine.input.hold(release); }
      engine.time = i * dt; c.update(dt, i * dt);
      if (relAt >= 0 && !released && c.sm.name !== 'hookSwing') released = true;
      if (released) {
        closest = Math.min(closest, c.position.distanceTo(B));
        if (c.sm.name === 'hookSwing' && c.anchor.distanceTo(B) < 0.5) return { grabbed: true, closest };
        if (c.grounded || c.position.y < 0) break;
      }
    }
    return { grabbed: false, closest, everSwung: relAt >= 0 };
  }

  /* Arrival speeds (of 7) from which SOME release phase reaches the next ring. */
  const SPEEDS = [6, 8, 10, 12, 14, 16, 18];
  const HOLDS = [10, 14, 18, 20, 24, 28, 32, 40];
  const chainsFrom = (ri, release) => SPEEDS.filter(
    (v) => HOLDS.some((hold) => leg(ri, v, hold, release).grabbed)).length;

  /* ── WHAT: both legs chain on the bail release, from every arrival speed ── */
  for (let ri = 0; ri < 2; ri++) {
    const n = chainsFrom(ri, 'jump');
    assert.equal(n, SPEEDS.length,
      `leg ring${ri + 1}->ring${ri + 2} reached the next ring from only ${n}/${SPEEDS.length} `
      + 'arrival speeds. The authored chain is on the critical path to the vault; if it needs a '
      + 'narrow arrival speed that is a difficulty finding, and if it needs none it is a route '
      + 'defect. Either way it is not "uncompletable", which is what §505.1 suspected.');
  }

  /* ── WHICH: the counterexample, RUN ──
   * My first version of this asserted crouch chains ZERO times and the arm went red at 2 of 9.
   * The ×0.5 drop-off is not an absolute blocker; it is a much worse launch. The claim is
   * therefore the MEASURED difference and not the story I had about it — an arm that asserts
   * the tidy version of a mechanism is an arm that will be wrong the moment the mechanism is
   * only mostly tidy. */
  const bail = chainsFrom(0, 'jump');
  const crouch = chainsFrom(0, 'crouch');
  assert.ok(crouch < bail,
    `crouch reached the next ring from ${crouch}/${SPEEDS.length} arrival speeds and bail from `
    + `${bail}. If the ×0.5 drop-off carries a chain as well as the ×1.15 launch does, the two `
    + 'release paths are not distinct and the explanation above is wrong.');

  console.log(`[T8] both swept legs chain on \`bail\` at ${bail}/${SPEEDS.length} arrival speeds; `
    + `\`crouch\` manages ${crouch}/${SPEEDS.length} — worse, but not zero`);
});

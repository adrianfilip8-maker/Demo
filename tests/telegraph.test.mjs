import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installDom, fakeEngine } from './_hudshim.mjs';

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
 *     E-grab (kiosk lintel -> ring 3)   telegraph@0, hookGrab@30   ->  30 frames, 0.50 s
 *     auto-grab (freefall onto ring 3)  did not reproduce in this harness — a FAILED BEAT,
 *                                       reported as such and not as a measurement
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

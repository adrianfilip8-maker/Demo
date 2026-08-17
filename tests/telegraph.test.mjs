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
 * ── The publisher is BLOCKED, and this file must not be read as proof it works ──────────────
 * `src/player/Controller.js` is held by another lane. These arms drive `HUD` with a SYNTHETIC
 * `telegraph` event, so they prove the subscription, the precedence and the projection. They
 * cannot prove the emit is correct, well-timed, or fired at all in play — see the third domain
 * line on every arm below. `tests/eventbus.test.mjs` carries `telegraph` in `DEAD_UNBUILT` as the
 * receipt for that gap.
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
   *   cannot discriminate : whether anything ever EMITS `telegraph`. Both inputs here are
   *               synthetic `engine.emit` calls. A green here says the HUD renders a telegraph
   *               it is given; it says nothing about the game giving it one, and the measured
   *               truth today is that the game gives it none. Do not quote this arm as evidence
   *               that the telegraph works in play.
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
   *   cannot discriminate : whether the emit ever sends null when the hold leaves reach. The
   *               retire path is the publisher's responsibility and is unwritten; this proves
   *               only that the HUD honours it when told.
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
   *               This arm shows the branch works, not that it is ever taken.
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

test('telegraph: the subscription exists and the publisher is declared missing', async () => {
  /* A TRIPWIRE, labelled (§418.5). It has no failing input while `Controller` is held by another
   * lane: it asserts the HUD subscribes and that the census still lists `telegraph` as unbuilt.
   * It goes red the moment the emit lands, which is the signal to delete the census line — the
   * census's own doctrine is that a closed line is deleted, not moved to a "fixed" list. */
  const { readFileSync } = await import('node:fs');
  const hudSrc = readFileSync(new URL('../src/ui/HUD.js', import.meta.url), 'utf8');
  const busSrc = readFileSync(new URL('./eventbus.test.mjs', import.meta.url), 'utf8');
  assert.ok(/on\('telegraph'/.test(hudSrc), 'the HUD subscription is gone');
  assert.ok(/setTelegraph\s*\(/.test(hudSrc), 'setTelegraph is gone');
  assert.ok(/DEAD_UNBUILT = \[[^\]]*'telegraph'/.test(busSrc),
    'the census no longer lists `telegraph` as unbuilt — if the emit landed, delete this arm and '
    + 'the census line together');
});

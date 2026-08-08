import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installDom, fakeEngine } from './_hudshim.mjs';

/**
 * The pickpocket economy: paid on the STEAL, never on the reach.
 *
 * `HUD.js` used to carry `on('pickpocket', () => { this.addCoins(25); … })`. `pickpocket` is
 * Moveset's *intent* event — Sly put a hand out — and `Moveset.Pickpocket.canEnter` requires only
 * that the player is grounded, pressed `interact`, and has no hook/rail/pole to grab. **It never
 * checks that a guard is anywhere near.** So holding E in an empty courtyard minted 25 coins a
 * press, about 45 per second at `pickTime` 0.55, complete with toast, coin burst and SFX, while
 * `Guards` correctly stole nothing whatsoever.
 *
 * Underneath it, the game's only authored economy was unreachable. `Guard.pickpocket()` refuses
 * unless `canBePickpocketed`, latches `looted` so no guard can be robbed twice, rolls coins from
 * that guard's own table (temple 45–90, heavy 80–150, scarab 10–25) plus an item, and emits
 * `guardPickpocket`. **That event had zero listeners** — the loot had never once reached the player.
 *
 * Both halves are the same defect seen from two sides, and it is §239's shape again: a publisher
 * and a subscriber that were each individually reasonable and never introduced to one another. The
 * tests below pin the wiring in both directions, because fixing only one of them silently
 * reintroduces the other — crediting `guardPickpocket` while the flat 25 still stands would simply
 * double-pay.
 *
 * These boot the real `HUD.js` against the DOM shim rather than scraping its source: the claim is
 * behavioural ("this event moves the counter by exactly this much"), and a regex cannot tell a live
 * subscription from a commented-out one.
 */

const SRC = new URL('../src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, SRC), 'utf8');

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
  return { hud, engine };
}

test('CALIBRATION (must fire): the counter moves at all, and this harness can see it', async () => {
  /* §211.1 — every assertion below is "the counter did NOT move". If the harness could never move
     it, all of them would pass while inspecting nothing. Prove the instrument is alive first. */
  const { hud, engine } = await bootHud();
  const before = hud.coins;
  engine.emit('coin', { amount: 7, pos: [0, 0, 0] });
  assert.equal(hud.coins - before, 7,
    'CALIBRATION FAILED — the harness cannot move the coin counter, so every "did not move" '
    + 'assertion below is vacuous. Interrogate the harness; do not adjust the tests.');
});

test('the reach pays nothing: `pickpocket` alone must not mint coins', async () => {
  /* The exploit, stated as the regression it is. Fifty presses in an empty room. */
  const { hud, engine } = await bootHud();
  const before = hud.coins;
  for (let i = 0; i < 50; i++) {
    engine.emit('pickpocket', { pos: new THREE.Vector3(0, 0, 0), yaw: 0, range: 1.6 });
  }
  assert.equal(hud.coins, before,
    `50 pickpocket INTENT events credited ${hud.coins - before} coins. That event fires whenever `
    + 'the player presses interact with nothing grabbable — no guard required — so any payout on '
    + 'it is free money.');
});

test('the steal pays exactly what the guard was carrying', async () => {
  const { hud, engine } = await bootHud();
  const before = hud.coins;
  engine.emit('guardPickpocket', { id: 'g1', pos: new THREE.Vector3(), coins: 73, item: 'brass key' });
  assert.equal(hud.coins - before, 73, 'a successful steal must credit the guard\'s own rolled loot');

  /* And a second guard adds to it rather than replacing it. */
  engine.emit('guardPickpocket', { id: 'g2', pos: new THREE.Vector3(), coins: 51, item: null });
  assert.equal(hud.coins - before, 124);
});

test('a malformed steal credits nothing rather than NaN', async () => {
  /* `addCoins(undefined)` would poison the counter permanently — every later display reads NaN,
     and no subsequent correct event can recover it. */
  const { hud, engine } = await bootHud();
  const before = hud.coins;
  engine.emit('guardPickpocket', { id: 'g3', pos: new THREE.Vector3() });   // no `coins` key
  assert.equal(hud.coins, before);
  assert.ok(Number.isFinite(hud.coins), `coin counter is ${hud.coins} — a missing key poisoned it`);
});

test('the HUD subscribes to the outcome and not to the intent', async () => {
  /* Source-level, and deliberately so: the behavioural tests above would still pass if someone
     re-added a *second* credit path on `pickpocket` that happened to pay 0. This pins intent. */
  const src = read('ui/HUD.js');
  assert.match(src, /on\(\s*'guardPickpocket'/, 'HUD no longer listens for the successful steal');
  const intent = /on\(\s*'pickpocket'\s*,([\s\S]{0,240}?)\)\s*;/.exec(src);
  if (intent) {
    assert.doesNotMatch(intent[1], /addCoins|setCoins/,
      'HUD credits coins on the `pickpocket` INTENT event again — that is the E-mash exploit');
  }
});

test('the guard side still gates the steal, so the payout cannot be farmed', async () => {
  /* The HUD fix is only sound while `Guard.pickpocket()` refuses a repeat. If that latch is ever
     removed, one guard becomes an infinite coin fountain and this test is the one that says so. */
  const g = read('ai/Guard.js');
  const body = /pickpocket\(\)\s*\{([\s\S]*?)\n  \}/.exec(g);
  assert.ok(body, 'could not find Guard.pickpocket() — has it been renamed?');
  assert.match(body[1], /if\s*\(\s*!this\.canBePickpocketed\s*\)\s*return null/,
    'Guard.pickpocket() no longer refuses when the guard cannot be robbed');
  assert.match(body[1], /this\.looted\s*=\s*true/,
    'Guard.pickpocket() no longer latches `looted` — the same guard can be robbed repeatedly');
  assert.match(body[1], /emit\(\s*'guardPickpocket'/,
    'Guard.pickpocket() no longer announces the steal the HUD now pays on');
});

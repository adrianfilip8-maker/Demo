import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import * as K from '../src/world/Kit.js';
import { rng } from '../src/core/Rand.js';
import { L } from '../src/world/EgyptLevel.js';

/**
 * The terrace stair: the first seven metres of the game.
 *
 * Found by driving the shipped build with real key events. Holding forward from spawn — the
 * first thing any player does — travelled **7.14 m and stopped dead** at z 22.844 with forward
 * still held and `stateName` still `move`, for another 236 frames.
 *
 * The cause was the tenth §357.1 in this project and the most vivid: `groundProxy` was passed
 * `slope: true` at the call site, spread it into the collider record, and **nothing in `src/`
 * read it**. The drawn flight rises 0 -> 2 m in four steps; the collider was a box with a flat
 * top at 2.05 m, so the player walked into 2.04 m of invisible wall standing exactly where the
 * art shows open paving:
 *
 *     z 22.6    drawn step top 0.00 m    collision top 2.04 m
 *
 * A second defect sat underneath it: `stairFlight` climbs +X, and `ry: -Math.PI/2` maps +X to
 * +Z, so the drawn flight ascended SOUTH — away from the terrace it serves — topping out 6 m
 * into open courtyard with nothing to step onto. The art was at z [22.36, 25.44]; the collision
 * footprint at z [19.40, 22.50]. §8.1's own route says *"the terrace south stair at (0, 0,
 * 19.6)"*, which is the footprint and not the art, so the art was the half that was wrong.
 *
 * These arms are what stop either coming back, and one of them is a §141.1 tripwire: flight 2
 * is deliberately NOT repaired, and the reason is a number that must not be moved.
 */

K.setMergeFn(mergeGeometries);

const SPAWN = new THREE.Vector3(0, 0, 30);
const DECK1 = L.terrace.s1.y;               // 2.0
const r2 = (v) => Math.round(v * 100) / 100;
const deg = (rad) => rad * 180 / Math.PI;

/** Hold a direction from spawn for `frames`, camera-relative like the real game. */
async function walk(moveY, frames = 420) {
  const { engine, c } = await realWorld();
  engine.input.clear();
  hardReset(engine, c, SPAWN.clone(), Math.PI);
  engine.camera.rotation.set(0, 0, 0);       // stub camera looks -Z, so move.y = 1 is north
  engine.camera.updateMatrixWorld(true);
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = moveY;
    engine.time = i * DT;
    c.update(DT, i * DT);
  }
  return { pos: c.position.clone(), state: c.stateName, engine, c };
}

test('terracestair: holding forward from spawn arrives on the stage-1 deck', async () => {
  /* DOMAIN (§418.3)
   *   passes on : move.y = +1 (hold forward) — ends ON the stage-1 deck, y ~1.96 and z ~19.6.
   *   fails  on : move.y = -1 (hold back) — ends at z ~49.7, nowhere near the deck.
   * Both are driven below.
   *
   * The predicate is "is he standing on the stage-1 deck", NOT "did he gain height", and that
   * correction was made at authoring time by running the failing input: holding back climbs the
   * dune south of spawn to **y 4.53**, which is higher than the deck. A bare `y >= 2` bar would
   * have passed on both inputs and discriminated nothing — the §418.3 question answering itself
   * before the arm was committed, for the second time in this lane.
   *
   * The historical failing input is the one that matters and it is recorded rather than run,
   * because it no longer exists: before this fix the FORWARD case ended at (0, 0, 22.844), which
   * fails the `z < 20.5` bar below by 2.3 m. */
  const fwd = await walk(+1);
  const back = await walk(-1);
  const onDeck = (p) => p.y >= DECK1 - 0.1 && p.z < 20.5 && p.z > L.terrace.s1.z0 && Math.abs(p.x) < L.terrace.s1.x;

  assert.ok(fwd.pos.y >= DECK1 - 0.1,
    `forward from spawn must reach the stage-1 deck (y ${DECK1}), ended at y ${r2(fwd.pos.y)} z ${r2(fwd.pos.z)}`);
  assert.ok(fwd.pos.z < 20.5,
    `forward must get past the old wall at z 22.844, ended at z ${r2(fwd.pos.z)}`);
  assert.ok(onDeck(fwd.pos), `forward must finish ON the deck, ended (${r2(fwd.pos.x)}, ${r2(fwd.pos.y)}, ${r2(fwd.pos.z)})`);
  assert.ok(!onDeck(back.pos),
    `holding BACK must NOT reach the deck — the failing input — ended (${r2(back.pos.x)}, ${r2(back.pos.y)}, ${r2(back.pos.z)})`);
  console.log(`\n[stair] forward -> (${r2(fwd.pos.x)}, ${r2(fwd.pos.y)}, ${r2(fwd.pos.z)})  ·  back -> (${r2(back.pos.x)}, ${r2(back.pos.y)}, ${r2(back.pos.z)})`);
  console.log(`[stair] pre-fix, this same forward drive ended at (0, 0, 22.844) — blocked after 7.14 m`);
});

test('terracestair: the ramp is walkable and it is a ramp, not a step and not a wall', async () => {
  /* DOMAIN (§418.3)
   *   passes on : a probe at z 21.0, mid-ramp — `groundCheck` reports a walkable sloped normal.
   *   fails  on : a probe at z 26.0, flat courtyard paving south of the flight — same call,
   *               slope ~0, so "is sloped" is false there. Both are probed below.
   * This is what distinguishes the fix from the defect it replaced: the OLD proxy also reported
   * `walkable` at z 21.0, because the top of a box is flat and perfectly walkable — it was the
   * vertical face nobody could see that stopped you. So "walkable" alone is not the bar; the
   * bar is that the surface HEIGHT changes across the run. */
  const { collision } = await realWorld();
  const at = (z) => collision.groundCheck(new THREE.Vector3(0, 6, z), 0.34, 12);

  const mid = at(21.0), flat = at(26.0);
  assert.ok(mid?.hit && flat?.hit, 'both probes must find ground');
  assert.ok(mid.walkable, `mid-ramp must be walkable, slope ${r2(deg(mid.slope))} deg`);
  assert.ok(deg(mid.slope) > 25 && deg(mid.slope) < 45,
    `mid-ramp must actually be sloped, got ${r2(deg(mid.slope))} deg`);
  assert.ok(deg(flat.slope) < 5, `courtyard paving must be flat, got ${r2(deg(flat.slope))} deg`);

  /* The height must climb monotonically across the run — the box could not do this. */
  const zs = [22.4, 21.8, 21.2, 20.6, 20.0];
  const ys = zs.map((z) => at(z).y);
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] > ys[i - 1] + 0.1,
      `ground must rise walking north: z ${zs[i - 1]} -> ${zs[i]} gave ${r2(ys[i - 1])} -> ${r2(ys[i])}`);
  }
  console.log(`[stair] ramp slope ${r2(deg(mid.slope))} deg (walkable ${mid.walkable}) · heights ${ys.map(r2).join(' -> ')}`);
});

test('terracestair: the drawn flight and its collider occupy the same ground', async () => {
  /* DOMAIN (§418.3)
   *   passes on : ry = +Math.PI/2, the shipped value — drawn AABB z [19.36, 22.44].
   *   fails  on : ry = -Math.PI/2, the old value — drawn AABB z [22.36, 25.44], a full 3 m
   *               south of the collider and ascending the wrong way.
   * Both are built and measured here, so the arm shows the defect as well as the repair.
   *
   * `K.setMergeFn` at the top of this file is load-bearing: without it `Kit.mergeAll` returns
   * `list[0]`, the flight becomes ONE tread, and the AABB silently shrinks to 0.83 m — which
   * reads exactly like "all four steps are stacked at the origin". That cost a round during the
   * diagnosis and is why it is set explicitly rather than assumed. */
  const build = (ry) => {
    const g = K.stairFlight({ steps: 4, rise: 0.5, run: 0.75, width: 6.4, rng: rng('probe') });
    const p = K.place(g, { x: 0, y: 0, z: L.terrace.s1.z1 + 3.0, ry });
    p.computeBoundingBox();
    return p.boundingBox;
  };
  const shipped = build(Math.PI / 2);
  const old = build(-Math.PI / 2);

  const FOOT = { z0: L.terrace.s1.z1, z1: L.terrace.s1.z1 + 3.1 };   // the rampProxy footprint
  assert.ok(shipped.min.z > FOOT.z0 - 0.15 && shipped.max.z < FOOT.z1 + 0.15,
    `drawn flight must sit on its collider: art z [${r2(shipped.min.z)}, ${r2(shipped.max.z)}] vs footprint [${FOOT.z0}, ${FOOT.z1}]`);
  assert.ok(shipped.max.y > DECK1 - 0.1 && shipped.max.y < DECK1 + 0.15,
    `top tread must meet the deck at y ${DECK1}, got ${r2(shipped.max.y)}`);
  assert.ok(old.min.z > FOOT.z1 - 0.2,
    `the old placement is supposed to be off the footprint — got z [${r2(old.min.z)}, ${r2(old.max.z)}]`);
  console.log(`[stair] art z [${r2(shipped.min.z)}, ${r2(shipped.max.z)}] on footprint [${FOOT.z0}, ${FOOT.z1}]  ·  old was [${r2(old.min.z)}, ${r2(old.max.z)}]`);
});

test('terracestair: flight 2 is left broken ON PURPOSE, and this pins the reason (§141.1)', async () => {
  /* A TRIPWIRE, and labelled as one (§418.5). It has no failing input that anyone should ever
   * produce: it asserts that flight 2's footprint is steeper than the walkable limit, which is
   * why it was not repaired as a ramp. If it ever goes red, someone has widened
   * `slopeWalkableDeg` — moving a threshold after seeing which side a result landed on, which
   * is precisely §141.1 — or re-authored the terrace, in which case flight 2 should be fixed
   * properly and this arm deleted rather than adjusted.
   *
   * The numbers, from the call site and `L.terrace`:
   *     rise 5.25 (proxy top) - 2.0 (stage-1 deck) = 3.25 m over a 2.70 m run = 50.28 deg
   *     Collision walkable limit                                              = 50.00 deg
   *     risers 0.46 m  vs  Controller stepHeight 0.42 m -> a stepped proxy cannot work either
   * so every repair either moves the limit or is a level-design change. */
  const { collision } = await realWorld();
  const limitDeg = deg(collision.SLOPE.walkable);
  const rise = 5.25 - L.terrace.s1.y;
  const run = 2.7;
  const pitch = deg(Math.atan2(rise, run));

  assert.ok(pitch > limitDeg,
    `flight 2's footprint is ${r2(pitch)} deg against a limit of ${r2(limitDeg)} deg — if this is `
    + 'no longer true the limit moved, and that is the thing this arm exists to catch');
  assert.equal(r2(limitDeg), 50, `slopeWalkableDeg moved: now ${r2(limitDeg)} deg`);
  console.log(`[stair] flight 2 footprint ${r2(pitch)} deg vs walkable ${r2(limitDeg)} deg — still correctly refused`);
});

test('terracestair: no call site passes `slope` to groundProxy, and the guard is present', () => {
  /* DOMAIN (§418.3)
   *   passes on : the current `EgyptLevel.js`.
   *   fails  on : the pre-fix call site, reproduced as a literal below and run through the same
   *               detector — which flags it. Both inputs are executed, so this tests the
   *               detector as well as the file.
   * A source assertion because `groundProxy` is module-private and there is no seam to call it
   * through; named as such rather than dressed up as behavioural. */
  const src = readFileSync(new URL('../src/world/EgyptLevel.js', import.meta.url), 'utf8');
  const OFFENDER = /groundProxy\([^)]*\bslope\b/;

  const OLD_CALL = "  groundProxy(A, -3.2, 3.2, 2.05, t1.z1, t1.z1 + 3.1, { thick: 3.4, slope: true });";
  assert.ok(OFFENDER.test(OLD_CALL), 'the detector must flag the pre-fix call site');
  assert.ok(!OFFENDER.test(src), 'a groundProxy call is passing `slope` again — use rampProxy');
  assert.ok(/`slope` is not a ground-slab option/.test(src),
    'groundProxy lost its guard against the inert `slope` option');
  assert.ok(/function rampProxy\(/.test(src), 'rampProxy is gone');
});

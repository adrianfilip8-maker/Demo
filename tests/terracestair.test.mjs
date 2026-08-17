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

test('terracestair: you cannot walk into the second terrace', async () => {
  /* DOMAIN (§418.3)
   *   passes on : walking north from the stage-1 deck at x 5 — stopped at z ~16.94, which is
   *               stage 2's face at 16.6 plus the 0.34 capsule radius.
   *   fails  on : the same walk at x 12, OUTSIDE the terrace footprint (x +-9.4) — nothing to
   *               stop him, so he keeps going well past z 16.6. Both are driven here, so the
   *               bar distinguishes "blocked by the terrace" from "blocked by anything".
   *
   * The historical failing input is the one this exists for: before the terrace colliders were
   * made solid, this same drive went straight THROUGH the building — z 18.99 -> 16 -> 13 -> 10
   * -> 7 at a constant y 2.0 — and ended by falling out of the level at (5, 0, -10.45). */
  const { engine, c, collision } = await realWorld();
  const run = (x, startZ) => {
    engine.input.clear();
    const g = collision.groundCheck(new THREE.Vector3(x, 8, startZ), 0.34, 20);
    hardReset(engine, c, new THREE.Vector3(x, g.hit ? g.y : 2, startZ), Math.PI);
    engine.camera.rotation.set(0, 0, 0); engine.camera.updateMatrixWorld(true);
    for (let i = 0; i < 260; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 1;
      engine.time = i * DT;
      c.update(DT, i * DT);
    }
    return c.position.clone();
  };
  const onTerrace = run(5, 19.0);
  const besideIt = run(12, 19.0);

  assert.ok(onTerrace.z > L.terrace.s2.z1,
    `walking north on the stage-1 deck must be stopped by the terrace face at z ${L.terrace.s2.z1}, `
    + `got z ${r2(onTerrace.z)} — pre-fix this walk reached z -10.45, inside and then past the building`);
  assert.ok(onTerrace.y >= L.terrace.s1.y - 0.2,
    `he must still be standing on the stage-1 deck, got y ${r2(onTerrace.y)}`);
  assert.ok(besideIt.z < L.terrace.s2.z1,
    `the failing input: walking north OUTSIDE the footprint must not be stopped by it, got z ${r2(besideIt.z)}`);
  console.log(`[stair] north on deck -> z ${r2(onTerrace.z)} (blocked)  ·  north beside it -> z ${r2(besideIt.z)} (free)`);
});

test('terracestair: stage 2 is solid, and stage 1 is hollow-but-unenterable on purpose', async () => {
  /* The coincidence worth pinning. Both decks used the default `thick` 1.0, so BOTH were hollow
   * shells; only stage 2's gap was tall enough to enter:
   *
   *     stage 1   slab underside y 1.0 over courtyard y 0.0   ->  1.0 m clearance   capsule 1.8 -> DID NOT FIT
   *     stage 2   slab underside y 4.2 over deck      y 2.0   ->  2.2 m clearance   capsule 1.8 -> WALKED IN
   *
   * Stage 2 is solidified. **Stage 1 deliberately is not**, and this arm pins both halves of
   * that so neither drifts: stage 2 must stay solid, and stage 1's gap must stay SHORTER than
   * the capsule — because the moment it is not, the latent defect is live and the source note
   * on its `groundProxy` stops being true.
   *
   * DOMAIN (§418.3)
   *   passes on : stage 2 at `thick = t2.y - t1.y + 0.4`, reaching the stage-1 deck.
   *   fails  on : stage 2 at the old default `thick: 1.0`, computed below, which leaves a gap
   *               of 2.2 m — taller than the 1.8 m capsule, i.e. enterable. Both evaluated.
   * The stage-1 pair is the mirror: its real 1.0 m gap is asserted to be UNDER the capsule
   * height, which is the whole reason it was invisible. */
  const { collision } = await realWorld();
  const S1 = L.terrace.s1, S2 = L.terrace.s2;
  const CAPSULE = 1.80;

  const extentOf = (halfX, z0, z1) => {
    let best = null;
    for (const rec of collision.recs || []) {
      const m = rec.mesh;
      if (!m?.geometry || m.name !== 'proxy:ground') continue;
      m.updateWorldMatrix?.(true, false);
      const b = new THREE.Box3().setFromObject(m);
      const s = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
      if (Math.abs(s.x - halfX * 2) < 0.6 && Math.abs(ctr.z - (z0 + z1) / 2) < 0.6) {
        if (!best || b.max.y > best.max.y) best = b;
      }
    }
    return best;
  };
  const e1 = extentOf(S1.x, S1.z0, S1.z1);
  const e2 = extentOf(S2.x, S2.z0, S2.z1);
  assert.ok(e1 && e2, 'both terrace deck colliders must be findable');

  assert.ok(e2.min.y <= S1.y + 0.05,
    `stage 2 must be solid down to the stage-1 deck, underside at y ${r2(e2.min.y)}`);

  /* Stage 1 is still a slab, and the arm asserts the coincidence rather than the fix: its gap
     must remain too short to enter. If a future edit raises the deck or thins the slab, this
     goes red and the source note about it being "unenterable, not solid" needs revisiting. */
  const gap1 = e1.min.y - 0.0;
  assert.ok(gap1 < CAPSULE,
    `stage 1's gap is ${r2(gap1)} m against a ${CAPSULE} m capsule — the latent defect just went live`);

  /* The failing input, evaluated rather than described: stage 2 at the old default. */
  const oldGap2 = (S2.y - 1.0) - S1.y;
  assert.ok(oldGap2 > CAPSULE, `thick 1.0 is supposed to leave stage 2 enterable, gap ${r2(oldGap2)}`);
  console.log(`[stair] stage2 solid y[${r2(e2.min.y)}, ${r2(e2.max.y)}] · stage1 slab y[${r2(e1.min.y)}, ${r2(e1.max.y)}]`
    + `  ·  gaps: stage1 ${r2(gap1)} m (< ${CAPSULE}, unenterable — the coincidence), stage2 would be ${r2(oldGap2)} m at thick 1.0 (> ${CAPSULE}, the defect)`);
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

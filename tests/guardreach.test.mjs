import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld } from './_moveset.mjs';
import { Guards } from '../src/ai/Guard.js';
import { DETECT } from '../src/ai/Patrol.js';

/**
 * guardreach.test.mjs — §588.1: a guard's swing has a top, and it is his own head.
 *
 * Both reach tests in `Guard.js` flattened `y` to zero before measuring — the decision to swing
 * in CHASE (`d <= attackRange`) and `_resolveSwing` (`attackRange * attackReach`). The range
 * check was therefore a cylinder of unbounded height, and a guard standing on the hypostyle
 * floor was inside swing range of a player anywhere up the 16 m nave rope. The camera lane's
 * live run left that rope at **y 10.24** into `hurt`.
 *
 * The fix adds a vertical band derived from the bodies rather than chosen: the player's capsule
 * must overlap the span between the guard's feet and his own `headTop` (temple 1.95, heavy 2.22,
 * scarab 0.34). Ground behaviour cannot move, because a player on the same floor is at dy 0,
 * which is inside the band for every type.
 *
 * Arms:
 *   G1  the ground control — on one floor the gate is a NO-OP at every range and every type.
 *   G2  driven on the real level — the nave rope is unreachable above the band and still
 *       reachable at its foot.
 *   G3  the lamp chain — ring 0 sits directly on the `hall_nave` patrol line, the sharpest case.
 *   G4  mutation check — defeat the gate and every claim above must fail.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROPE = { x: 2.40, z: -33.20 };          // §571
const RING0 = { x: 0.0, y: 6.75, z: -21.0 };  // §575, directly on the hall_nave line (x = 0)
const HOOK_L = 2.2;                           // TUNE.hookL — a hanging player's feet sit this far below

async function harness() {
  const { engine } = await realWorld();
  const guards = new Guards(engine);
  await guards.init();
  assert.ok(guards.guards?.length, 'no guards were built — this file has nothing to measure');
  const damage = [];
  engine.on?.('damage', (p) => damage.push(p));
  /* A guard who is KO or stunned never swings, and one mid-cooldown never starts; put the
     subject in the one state the arms are about. */
  const arm = (g) => { g.state = 4; g._attackCd = 0; g._swing = 0; return g; };
  return { engine, guards, damage, arm };
}

/** Did a swing actually resolve into damage? Drives the real method, not a predicate. */
function swings(guards, g, damage, playerAt) {
  guards.playerPos.copy(playerAt);
  damage.length = 0;
  const res = g._resolveSwing();
  return { resolved: res === true, emitted: damage.length > 0 };
}

/* ====================================================================================== */
test('guardreach G1: on one floor the height gate is a no-op — ground combat is untouched', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped guard — for a player on the SAME floor, the swing resolves at
   *             exactly the horizontal ranges it resolved at before §588.1, for every roster type.
   * fails  on : RUN IN-ARM — the same sweep with the player lifted to y 10.24, which must stop
   *             resolving everywhere. Without it "the gate is a no-op" would be indistinguishable
   *             from "the gate does nothing at all".
   * does NOT  : test detection, patrol, alert or chase. Only the reach.
   * discrim.
   */
  const { guards, damage, arm } = await harness();
  const REACH = DETECT.attackRange * DETECT.attackReach;

  const byType = new Map();
  for (const g of guards.guards) if (!byType.has(g.type)) byType.set(g.type, g);
  assert.ok(byType.size >= 2, `only ${byType.size} guard type(s) on the roster — sweep needs more than one`);

  const mismatches = [], lifted = [];
  for (const [type, g] of byType) {
    arm(g);
    g.position.set(0, 0, 0);
    for (let d = 0.2; d <= 4.0; d += 0.2) {
      /* the pre-§588.1 rule, computed here rather than quoted: horizontal distance alone */
      const expected = d <= REACH + 1e-9;
      const on = swings(guards, arm(g), damage, V(d, 0, 0));
      if (on.resolved !== expected) mismatches.push(`${type} at ${d.toFixed(1)} m: ${on.resolved}, expected ${expected}`);
      /* the failing input, in-arm: same range, 10.24 m up */
      const up = swings(guards, arm(g), damage, V(d, 10.24, 0));
      if (up.resolved) lifted.push(`${type} at ${d.toFixed(1)} m reached a player 10.24 m up`);
    }
  }
  assert.deepEqual(mismatches, [],
    `ground behaviour moved under §588.1. The height gate must be a no-op at dy 0 — a player on the `
    + `guard's own floor is inside the band for every type:\n  ${mismatches.join('\n  ')}`);
  assert.deepEqual(lifted, [],
    `the gate did not bite:\n  ${lifted.join('\n  ')}`);
  console.log(`[guardreach G1] ${byType.size} types x 20 ranges: ground outcomes identical to the `
    + `horizontal-only rule (reach ${REACH.toFixed(2)} m), and none of them reach 10.24 m up`);
});

/* ====================================================================================== */
test('guardreach G2: the nave rope is safe above the band and still dangerous at its foot', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped level — a guard on the `hall_nave` line (x 0) beneath the rope
   *             reaches a player at the rope's foot and at climbing heights inside his head,
   *             and reaches nobody above it.
   * fails  on : RUN IN-ARM — the same heights with the GUARD raised to match, so dy returns to
   *             ~0. Every one of them must resolve again. That is the control: it proves the
   *             instrument can still find a positive at 10 m of altitude, so "unreachable" is a
   *             fact about the height DIFFERENCE and not about the test running out of steam.
   * does NOT  : claim a guard is ever actually under the rope in play — `hall_nave` runs x 0
   * discrim.    from z −19.5 to −48.5 and the rope is 2.40 m off it, which is why this matters,
   *             but the patrol's timing is not measured here.
   */
  const { guards, damage, arm } = await harness();
  const g = arm(guards.guards.find((x) => x.type === 'temple') || guards.guards[0]);
  const head = 1.95;

  /* the guard stands on the patrol line directly beneath the rope */
  g.position.set(0, 0, ROPE.z);
  const horiz = Math.hypot(ROPE.x - 0, ROPE.z - ROPE.z);
  assert.ok(horiz <= DETECT.attackRange,
    `the rope is ${horiz.toFixed(2)} m from the patrol line, outside attackRange ${DETECT.attackRange} — `
    + 'the premise of this arm is gone and the exposure it guards no longer exists');

  const low = swings(guards, arm(g), damage, V(ROPE.x, 0.2, ROPE.z));
  assert.ok(low.resolved && low.emitted,
    'a player at the foot of the rope is not reachable. The fix must not make climbers invulnerable '
    + 'the moment they touch the shaft — only once they are above his head');

  const inBand = swings(guards, arm(g), damage, V(ROPE.x, head - 0.1, ROPE.z));
  assert.ok(inBand.resolved, `a player at dy ${(head - 0.1).toFixed(2)} (just under headTop) must still be hit`);

  const escaped = [];
  for (const y of [head + 0.1, 3.0, 6.0, 10.24, 14.0, 16.0]) {
    if (swings(guards, arm(g), damage, V(ROPE.x, y, ROPE.z)).resolved) escaped.push(y.toFixed(2));
  }
  assert.deepEqual(escaped, [],
    `a floor guard still reached a climber at y ${escaped.join(', ')} — the reported defect was y 10.24`);

  /* control: raise the guard to each height and the swing must come back */
  const dead = [];
  for (const y of [3.0, 6.0, 10.24, 14.0]) {
    g.position.set(0, y, ROPE.z);
    if (!swings(guards, arm(g), damage, V(ROPE.x, y, ROPE.z)).resolved) dead.push(y.toFixed(2));
  }
  assert.deepEqual(dead, [],
    `CONTROL: with the guard raised to the same height, the swing failed at y ${dead.join(', ')}. The `
    + 'instrument cannot find a positive up there, so its negatives above mean nothing');
  console.log(`[guardreach G2] rope foot hit, dy ${(head - 0.1).toFixed(2)} hit, 6 heights from `
    + `${(head + 0.1).toFixed(2)} to 16.0 all missed; raising the guard restores every one`);
});

/* ====================================================================================== */
test('guardreach G3: lamp ring 0 sits on the patrol line — hit on the floor, safe on the rope', async () => {
  /* The sharpest case in the level, which is why it gets its own arm: §575's ring 0 is at
   * x 0.0, directly ON `hall_nave`'s centre line, so its horizontal offset is ZERO and only the
   * height gate can ever separate a swinging player from a guard walking underneath.
   *
   * DOMAIN (§418.3)
   * passes on : a player hanging from ring 0 (feet at ring − `hookL`) is unreachable, while the
   *             same XZ on the floor is reachable.
   * fails  on : RUN IN-ARM — the hanging case with the gate defeated, which must be reachable.
   * does NOT  : test the other four rings individually; three of the five are inside the
   * discrim.    cylinder and ring 0 is the extreme.
   */
  const { guards, damage, arm } = await harness();
  const g = arm(guards.guards.find((x) => x.type === 'temple') || guards.guards[0]);
  g.position.set(0, 0, RING0.z);

  const hangY = RING0.y - HOOK_L;
  assert.ok(hangY > 1.95,
    `a player hanging from ring 0 sits at y ${hangY.toFixed(2)}, inside a temple guard's 1.95 m band — `
    + 'the ring has been lowered and this arm no longer describes the level');

  const onFloor = swings(guards, arm(g), damage, V(RING0.x, 0, RING0.z));
  assert.ok(onFloor.resolved, 'a player standing under ring 0 is not reachable — ground combat has moved');

  const hanging = swings(guards, arm(g), damage, V(RING0.x, hangY, RING0.z));
  assert.ok(!hanging.resolved,
    `a guard on the floor swatted a player hanging from ring 0 at y ${hangY.toFixed(2)}, directly above him`);

  /* the failing input: defeat the gate and the hanging player must be hit again */
  const real = g._inSwingBand;
  g._inSwingBand = () => true;
  const defeated = swings(guards, arm(g), damage, V(RING0.x, hangY, RING0.z));
  g._inSwingBand = real;
  assert.ok(defeated.resolved,
    'with the height gate defeated the hanging player was STILL not hit, so this arm is not measuring '
    + 'the gate — something else is refusing the swing and the result above proves nothing');
  console.log(`[guardreach G3] ring 0 offset 0.00 m from the patrol line: floor hit, hang at `
    + `y ${hangY.toFixed(2)} missed, gate defeated -> hit again`);
});

/* ====================================================================================== */
test('guardreach G4: mutation check — restoring the flattened reach reopens the defect', async () => {
  /* §439: an instrument built from the same assumption as the fix cannot falsify it. So the fix
   * is removed wholesale — every guard's band forced open, which is exactly the pre-§588.1 code —
   * and the defect must come back on the real geometry.
   */
  const { guards, damage, arm } = await harness();
  const g = arm(guards.guards.find((x) => x.type === 'temple') || guards.guards[0]);
  g.position.set(0, 0, ROPE.z);

  const before = swings(guards, arm(g), damage, V(ROPE.x, 10.24, ROPE.z)).resolved;
  const real = g._inSwingBand;
  g._inSwingBand = () => true;                       // the flattened cylinder, restored
  const after = swings(guards, arm(g), damage, V(ROPE.x, 10.24, ROPE.z)).resolved;
  g._inSwingBand = real;

  assert.equal(before, false, 'the shipped guard still reaches y 10.24 — the fix is not in effect');
  assert.equal(after, true,
    'restoring the flattened reach did NOT reproduce the defect at y 10.24, so the two are not the '
    + 'same mechanism and §588.1 may be fixing something other than what was reported');
  console.log('[guardreach G4] shipped: no swing at y 10.24 · gate forced open: swing returns — '
    + 'the fix and the defect are the same mechanism');
});

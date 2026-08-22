import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * naverope.test.mjs — §571's nave rope, driven the way the 29 were.
 *
 * §570 measured the route and found 68 % of the walked line with no affordance inside its own
 * entry gate, worst run **35.5 m** — the hypostyle hall floor. The cause is the columns ruling
 * working correctly (all 12 papyrus columns are `pole` recs at r 1.62 and all 12 are refused by
 * §514.3), plus §569's finding that the two circuits §8.1 offered instead do not exist.
 *
 * The rope is at (2.40, 0.10…16.10, −33.20), r 0.14, material `cloth`. Everything about that
 * placement is a measured constraint rather than a taste:
 *
 *   x 2.40   `PoleClimb.canEnter` auto-mounts at `poleMount` 1.90 on any held stick pointed at
 *            the shaft and E-mounts at `poleMount * 1.5` = 2.85. The route walks x 0, so the
 *            whole design space is that 0.95 m band; closer is a trapdoor (§495.A's own scar:
 *            `spawn2eye` mounted the obelisk rope by accident and climbed it), further is
 *            invisible. 2.40 is the middle.
 *   z −33.20 where the hall cable passes 0.62 m from the axis at y 13.00 — inside
 *            `railMount * 1.6` = 2.16, so the climb has an exit that is not the ceiling.
 *   top 16.10 the nave ceiling (the deck underside is 16.15). Above it is solid deck, so the
 *            rope is tied to something rather than hanging in air.
 *
 * ── DOMAIN (§418.3) ───────────────────────────────────────────────────────────────────────
 * passes on : the shipped rope — climbed from the hall floor to the cable and ridden, and
 *             descended from the cable to the floor, both driven end to end.
 * fails  on : RUN IN-ARM in arm X — a walk straight up the route line at x 0 past the rope,
 *             which must NOT mount it. That is the trapdoor case and the whole reason for the
 *             1.90 m edge. Its CONTROL is the same detector on a walk aimed AT the rope, which
 *             MUST mount: without it, "the route walk is safe" is indistinguishable from "this
 *             detector never fires". (An earlier draft asserted that a no-E approach must not
 *             mount and was simply wrong about poles — the auto clause fires on a held stick
 *             pointed at the shaft, which is correct behaviour and is why the placement is a
 *             band rather than a minimum.)
 * does NOT  : discriminate art (a rope with no drawn cord would pass here — the same seam
 * discrim.    `reachcensus` names), difficulty, or the ride's feel. Nor does it own the cable:
 *             the hall cable's geometry is MOVEMENT's tuned number and is untouched.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROPE = { x: 2.40, z: -33.20, y0: 0.10, y1: 16.10, r: 0.14 };

async function harness() {
  const { engine, collision, c } = await realWorld();
  const aim = (tx, tz) => {
    const dx = tx - c.position.x, dz = tz - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };
  const step = (s) => {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    s(engine.input); engine.time += DT; c.update(DT, engine.time); engine.events.length = 0;
  };
  return { engine, collision, c, aim, step };
}

/* ====================================================================================== */
test('naverope U: the hall floor climbs to the hall cable', async () => {
  const { engine, collision, c, aim, step } = await harness();

  /* the rope is where the level says it is, and thin enough for the §494 gate */
  const rec = collision.recs.find((r) => r.tag === 'pole' && r.mesh
    && Math.abs(r.mesh.position.x - ROPE.x) < 0.2 && Math.abs(r.mesh.position.z - ROPE.z) < 0.2);
  assert.ok(rec, `no pole rec at (${ROPE.x}, ${ROPE.z}) — the nave rope moved or was removed`);
  const gp = rec.mesh.geometry?.parameters;
  assert.ok((gp?.radiusTop ?? gp?.radius ?? 99) <= 0.5,
    'the nave rope is thicker than the §494/§514.3 gate it must pass — the columns ruling');

  /* climb: settle on the hall floor 2.4 m off-axis, walk in, E, climb, take the cable */
  hardReset(engine, c, V(0, 0.6, -33.2), Math.atan2(ROPE.x, 0));
  for (let i = 0; i < 45; i++) step(() => {});
  assert.ok(c.grounded, `the hall floor stance did not settle (y ${c.position.y.toFixed(2)})`);
  const startY = c.position.y;

  /* The handoff is a JUMP, not an E. `RailSlide.canEnter` refuses while `sm.group === 'attach'`
     and `poleClimb` is attached, so you cannot step from a pole onto a rail — you leave the pole
     first (`poleJumpOut` 6.5 outward, `poleJumpUp` 0.88) and grab the cable in the air. */
  let mounted = false, topY = startY, onCable = false, left = -1;
  for (let i = 0; i < 1600; i++) {
    step((inp) => {
      if (!mounted) { aim(ROPE.x, ROPE.z); inp.move.y = 1; if (i % 5 === 0) inp.hold('interact'); else inp.let_go('interact'); }
      else if (c.stateName === 'poleClimb') {
        inp.let_go('interact');
        if (c.position.y < 12.6) inp.move.y = 1;            // climb to the cable's height
        else inp.hold('jump');                              // and leave the rope there
      } else { inp.let_go('jump'); if (i % 3 === 0) inp.hold('interact'); else inp.let_go('interact'); }
    });
    if (c.stateName === 'poleClimb') { mounted = true; topY = Math.max(topY, c.position.y); }
    else if (mounted && left < 0) left = i;
    if (mounted && (c.stateName === 'railSlide' || c.stateName === 'railWalk')) { onCable = true; break; }
  }
  assert.ok(mounted, 'walking into the nave rope from the hall floor with E never entered poleClimb');
  assert.ok(topY > 12.5,
    `the climb reached y ${topY.toFixed(2)}; the hall cable it exists to serve passes at y 13.00, so a `
    + 'rope that stops short of it is a climb to the ceiling');
  assert.ok(onCable,
    `the climb reached y ${topY.toFixed(2)} but never took the cable — the rope's axis is 0.62 m from `
    + `the span at y 13.00 and railMount*1.6 is ${(TUNE.railMount * 1.6).toFixed(2)} m, so if this fails the `
    + 'cable has moved or the rope has');
  console.log(`[naverope U] floor ${startY.toFixed(2)} -> poleClimb -> y ${topY.toFixed(2)} -> ${c.stateName} on the cable`);
});

/* ====================================================================================== */
test('naverope D: the cable descends to the hall floor by the rope, softly', async () => {
  const { engine, c, aim, step } = await harness();
  /* Climb it first rather than teleporting up: `hardReset` spends `_needSpawnSnap`, so the first
     mid-air placement in a fresh process is snapped to the floor (the §562 family — a teleport is
     not how the agent arrives). Climbing is also the honest way to be up there. */
  hardReset(engine, c, V(0, 0.6, -33.2), Math.atan2(ROPE.x, 0));
  for (let i = 0; i < 45; i++) step(() => {});
  let mounted = false, high = 0;
  for (let i = 0; i < 1200; i++) {
    step((inp) => {
      if (!mounted) { aim(ROPE.x, ROPE.z); inp.move.y = 1; if (i % 5 === 0) inp.hold('interact'); else inp.let_go('interact'); }
      else { inp.move.y = 1; inp.let_go('interact'); }
    });
    if (c.stateName === 'poleClimb') { mounted = true; high = Math.max(high, c.position.y); }
    if (high > 13.2) break;
  }
  assert.ok(mounted && high > 13.2,
    `could not climb the nave rope to cable height to test the descent (reached ${high.toFixed(2)})`);
  let worstImpact = 0, landed = null;
  for (let i = 0; i < 1400; i++) {
    step((inp) => { inp.hold('crouch'); inp.let_go('interact'); });   // crouch = pole slide
    worstImpact = Math.max(worstImpact, c.landImpact || 0);
    if (c.grounded && c.position.y < 1.0) { landed = c.position.clone(); break; }
  }
  assert.ok(landed,
    `the descent never reached the hall floor (ended (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, `
    + `${c.position.z.toFixed(2)}) ${c.stateName})`);
  assert.ok(worstImpact < TUNE.landHard,
    `the descent arrived at ${worstImpact.toFixed(1)} m/s against landHard ${TUNE.landHard} — the rope is `
    + 'meant to make §489\'s 16 m drop soft, not to be another version of it');
  console.log(`[naverope D] cable height -> hall floor at (${landed.x.toFixed(2)}, ${landed.y.toFixed(2)}, ${landed.z.toFixed(2)}), worst arrival ${worstImpact.toFixed(1)} m/s`);
});

/* ====================================================================================== */
test('naverope X: walking the route past the rope does NOT mount it — the trapdoor case', async () => {
  /* The failing input of U, run as its own arm because it is the constraint that placed the
     rope. §495.A's docblock records the same defect happening for real: `spawn2eye` walked the
     §489 retrace within `poleMount` of the obelisk rope and climbed it instead of continuing. */
  const { engine, c, aim, step } = await harness();

  /* leg 1: the route walk, x 0, straight past the rope's z — must never mount */
  hardReset(engine, c, V(0, 0.6, -20), Math.PI);
  for (let i = 0; i < 45; i++) step(() => {});
  assert.ok(c.grounded, 'the hall-floor start did not settle');
  let mountedOnWalk = false, passed = false;
  for (let i = 0; i < 1200; i++) {
    step((inp) => { aim(0, -52); inp.move.y = 1; });
    if (c.stateName === 'poleClimb') mountedOnWalk = true;
    if (c.position.z < -40) passed = true;
  }
  assert.ok(passed,
    `the route walk only reached z ${c.position.z.toFixed(2)} — it must get past the rope's z ${ROPE.z} `
    + 'for this arm to have tested anything');
  assert.ok(!mountedOnWalk,
    'walking the route line at x 0 MOUNTED the nave rope. That is the trapdoor case: the rope must sit '
    + `outside poleMount ${TUNE.poleMount} m of the walked line, and at x ${ROPE.x} it is meant to`);

  /* leg 2 is the CONTROL, and it is the half that makes leg 1 mean anything: the same detector,
     the same 400 frames, on a walk aimed AT the rope instead of along the route. It MUST mount —
     `PoleClimb.canEnter`'s auto clause fires at `poleMount` on a held stick pointed at the shaft,
     which is correct behaviour for a pole and is exactly why the placement is a band and not a
     minimum. (An earlier version of this arm asserted the opposite and was simply wrong about
     how poles work.) */
  hardReset(engine, c, V(0, 0.6, -33.2), Math.atan2(ROPE.x, 0));
  for (let i = 0; i < 45; i++) step(() => {});
  let mountedAtIt = false;
  for (let i = 0; i < 400; i++) {
    step((inp) => { aim(ROPE.x, ROPE.z); inp.move.y = 1; inp.let_go('interact'); });
    if (c.stateName === 'poleClimb') { mountedAtIt = true; break; }
  }
  assert.ok(mountedAtIt,
    'CONTROL: a walk aimed straight at the rope did NOT mount it in 400 frames. Then leg 1 proves '
    + 'nothing — a detector that never fires cannot show that the route walk is safe from it');
  console.log(`[naverope X] route walk reached z ${c.position.z.toFixed(2)} without mounting; the control walk aimed at the rope mounted it`);
});

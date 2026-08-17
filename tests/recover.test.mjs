/**
 * recover.test.mjs — the two recovery mechanics adapted from `Scripts/player__sly.gd`.
 *
 *   R1/R2  the last SUPPORTED stance, and what it refuses to certify.
 *          `collision_detect()` stamps a node at the player's origin whenever all nine of its
 *          floor rays are colliding; `return_to_safe()` teleports there. The idea worth having
 *          is that the recovery point is not an authored checkpoint — it is the last place the
 *          player demonstrably stood, so it is always exactly as far back as it needs to be.
 *          Ours is that idea on `narrowGround()`'s two casts, polled at `TUNE.safePoll`.
 *   R3     the consolation on a failed lock. Theirs adds `velocity.y += 4.0` on both TO_TARGET
 *          failure paths and on neither success path. Ours is a FLOOR at `magFailBoost` 5.5
 *          (= their 4.0 through the existing kV 1.375 = 0.5 × jumpV0), on `'timeout'` only.
 *
 * The world here is a finite platform rather than `Controller`'s `FLAT` fallback, and that is
 * load-bearing rather than scenery: FLAT is an infinite plane whose `capsuleSweep` clamps any
 * downward motion to y = 0, so under it **a fall out of the world cannot happen** and an arm
 * that claimed to measure one would be measuring a teleport it performed itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Controller, TUNE } from '../src/player/Controller.js';
import { realWorld, hardReset, DT } from './_moveset.mjs';

const DEG = Math.PI / 180;

/* ====================================================================== */
/* harness — a 10 m platform at y = 0 with nothing beyond it              */
/* ====================================================================== */

class Platform {
  constructor(half = 10) {
    this.ready = true;
    this.half = half;
    this.SLOPE = { walkable: 50 * DEG, wall: 70 * DEG };
    this._sweep = { hit: false, position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, toi: 1, tag: 'ground', material: 'stone', rec: null };
    this._gnd = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'stone', rec: null };
    this._ray = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, tag: '', rec: null };
  }
  over(x, z) { return Math.abs(x) <= this.half && Math.abs(z) <= this.half; }
  capsuleSweep(from, to) {
    const s = this._sweep;
    s.position.copy(to);
    s.normal.set(0, 1, 0);
    s.toi = 1;
    s.hit = false;
    if (to.y < 0 && from.y >= 0 && this.over(to.x, to.z)) {
      s.position.y = 0;
      s.hit = true;
      s.toi = from.y > to.y ? from.y / (from.y - to.y) : 1;
    }
    s.distance = s.position.distanceTo(from);
    return s;
  }
  groundCheck(pos, _r, maxDist) {
    const g = this._gnd;
    g.y = 0;
    g.hit = this.over(pos.x, pos.z) && pos.y <= maxDist + 1e-4 && pos.y >= -maxDist - 1e-4;
    return g;
  }
  raycast() { this._ray.hit = false; return this._ray; }
  overlap() { return []; }
  nearest() { return null; }
  query() { return []; }
}

function stubEngine(collision) {
  const listeners = new Map();
  const input = {
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, zoom: 0,
    down() { return false; }, pressed() { return false; }, released() { return false; },
    bufferedPeek() { return false; }, buffered() { return false; }, clearBuffer() {},
  };
  return {
    input,
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    scene: new THREE.Scene(),
    time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high',
    warnings: [], events: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get(n) { return n === 'collision' ? collision : null; },
    has() { return false; },
    warn(m) { this.warnings.push(String(m)); },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => {}; },
    emit(e, p) { this.events.push({ evt: e, payload: p }); for (const f of listeners.get(e) || []) f(p); },
    registerCollider() {},
  };
}

async function makeController(collision = new Platform()) {
  const engine = stubEngine(collision);
  const c = new Controller(engine);
  await c.init();
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  return { engine, c };
}

/** Step the real update loop. */
function step(c, engine, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) { engine.dt = dt; engine.time += dt; c.update(dt, engine.time); }
}

/* ====================================================================== */
/* R1 — the recovery point is where he last stood, not where he spawned    */
/* ====================================================================== */

test('R1: falling out of the world returns Sly to the last stance he was standing in', async () => {
  /* DOMAIN (§418.3)
   *   passes on : a controller that has stood on the platform at (6, 0, −4). `safeOk` goes true,
   *               `safePoint` holds that stance, and the void fall lands him back on it — not at
   *               SPAWN (0, 0, 30), which is 34 m away and the whole reason this exists.
   *   fails on  : the SAME void fall on a controller that has never been grounded (`safeOk`
   *               false). Run below as its own case: the net must fall back to SPAWN rather than
   *               teleport to a spawn-shaped guess it is calling a recovery. If the two cases
   *               produced the same destination this arm would be measuring nothing, so both are
   *               measured and asserted to DIFFER. */
  const { engine, c } = await makeController();
  c.teleport(new THREE.Vector3(6, 0, -4), 0.5);
  step(c, engine, 40);

  console.log(`\n[R1] after 40 grounded frames: safeOk ${c.safeOk} · `
    + `safePoint (${c.safePoint.x.toFixed(2)}, ${c.safePoint.y.toFixed(2)}, ${c.safePoint.z.toFixed(2)})`);
  assert.ok(c.safeOk, 'standing on a broad platform for 40 frames certified no stance at all');
  const stance = c.safePoint.clone();
  assert.ok(stance.distanceTo(new THREE.Vector3(6, 0, -4)) < 0.25,
    `the certified stance is (${stance.x.toFixed(2)}, ${stance.y.toFixed(2)}, ${stance.z.toFixed(2)}), `
    + 'not where he was standing — `_recordSafeStance` is sampling something else');

  // Now put him under the world and let `_safetyNet` see it.
  c.position.set(6, TUNE.voidY - 5, -4);
  step(c, engine, 1);
  console.log(`[R1] after the void fall: (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)})`);
  assert.ok(c.position.distanceTo(stance) < 0.25,
    `the net put him at (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}), `
    + `not on the certified stance (${stance.x.toFixed(2)}, ${stance.y.toFixed(2)}, ${stance.z.toFixed(2)})`);

  /* THE FAILING INPUT, run rather than described: never grounded, so nothing to recover to. */
  const virgin = await makeController();
  virgin.c.safeOk = false;
  virgin.c.position.set(3, TUNE.voidY - 5, 3);
  step(virgin.c, virgin.engine, 1);
  console.log(`[R1] never-grounded fall: (${virgin.c.position.x.toFixed(2)}, `
    + `${virgin.c.position.y.toFixed(2)}, ${virgin.c.position.z.toFixed(2)}) — SPAWN is (0, 0, 30)`);
  assert.ok(Math.abs(virgin.c.position.z - 30) < 0.5 && Math.abs(virgin.c.position.x) < 0.5,
    'with no certified stance the net did not fall back to SPAWN');
  assert.ok(virgin.c.position.distanceTo(stance) > 5,
    'the two cases landed in the same place, so R1 is not discriminating between having a '
    + 'recovery point and not having one');
});

/* ====================================================================== */
/* R2 — and it refuses to certify a stance that would not survive arrival  */
/* ====================================================================== */

test('R2: each gate refuses on its own, tested one variable at a time', async () => {
  /* Every gate in `_recordSafeStance` exists because arriving at the point has to be survivable.
   * Tested as a single-variable A/B against one baseline pose rather than as a sequence, because
   * a sequence is how a refusal comes to pass for the wrong reason — which is exactly what
   * happened writing this arm. The first draft set an attach state with `sm.set('ledgeHang')`
   * and then probed: `LedgeHang.enter` SNAPS SLY TO A LEDGE, so he was at (0, −1.62, 0) with no
   * platform under him, `narrowGround()` refused, and the attach gate under test never ran. The
   * arm's own control caught it. Now every case starts from the identical pose and moves exactly
   * one field.
   *
   * DOMAIN (§418.3)
   *   passes on : the baseline — grounded, `sm.group` 'ground', `hurtCooldown` 0, broad ground.
   *               `safePoint` moves to the pose.
   *   fails on  : three one-field departures from that same pose — `grounded` false, group
   *               'attach' (a rail 20 m up is somewhere Sly WAS, not somewhere he can be put
   *               back), and `hurtCooldown` > 0 (he is standing in the thing that hurt him, and
   *               without this the recovery point drifts into the spike pit). Each asserted to
   *               leave `safePoint` untouched, against a baseline that is re-measured rather
   *               than remembered. */
  const { engine, c } = await makeController();
  c.teleport(new THREE.Vector3(-3, 0, 2), 0);
  step(c, engine, 40);
  assert.ok(c.safeOk, 'the harness never certified anything, so no refusal below is meaningful');

  const AT = new THREE.Vector3(-8, 0, -8);
  const MARK = new THREE.Vector3(99, 99, 99);
  /** Put Sly in the identical pose, apply one departure, and report whether a stance was taken. */
  const probe = (mutate) => {
    c.sm.set('idle');
    c.position.copy(AT);
    c.grounded = true;
    c.groundY = 0;
    c.hurtCooldown = 0;
    c.safePoint.copy(MARK);
    c._safeT = 0;
    mutate();
    c._recordSafeStance(1 / 60);
    return c.safePoint.distanceTo(MARK) > 1e-9;
  };

  const base = probe(() => {});
  const airborne = probe(() => { c.grounded = false; });
  const attached = probe(() => { c.sm.set('ledgeHang'); c.position.copy(AT); c.grounded = true; });
  const hurt = probe(() => { c.hurtCooldown = 1.0; });

  console.log(`\n[R2] baseline (grounded, ground group, unhurt) -> recorded ${base}`);
  console.log(`[R2] grounded=false                            -> recorded ${airborne}`);
  console.log(`[R2] sm.group='attach'                         -> recorded ${attached}`);
  console.log(`[R2] hurtCooldown=1.0                          -> recorded ${hurt}`);

  assert.ok(base,
    'the baseline pose certified nothing, so the three refusals below pass because nothing ever '
    + 'records rather than because the gates work');
  assert.ok(!airborne, 'an airborne pose was certified as a standing stance');
  assert.ok(!attached,
    'an attached pose was certified — a rail or pole snap 20 m up is now a place the net will drop him');
  assert.ok(!hurt,
    'a stance was certified while hurtCooldown was live — the recovery point can now drift into '
    + 'the hazard that killed him');
});

/* ====================================================================== */
/* R3 — the consolation on a failed lock                                   */
/* ====================================================================== */

test('R3: a timed-out lock hands back half a jump; a lock that fell out of range does not', async () => {
  /* `magFailBoost` 5.5 = THEIRS 4.0 × kV 1.375 = 0.5 × jumpV0. `tests/targets.test.mjs`'s A8
     already asserts that derivation against `DERIVATION`; this arm asserts the BEHAVIOUR, which
     is a different claim — a constant can be derived correctly and wired to nothing.
   *
   * DOMAIN (§418.3)
   *   passes on : `release('timeout')` with vy = −8.0. Sly is falling, the lock ran out of time,
   *               and he leaves with vy = +5.5 instead of continuing to plummet.
   *   fails on  : two inputs, both run below.
   *                 · `release('below')` with the same vy = −8.0 — falling out of the bottom of
   *                   an assist is the assist correctly declining, and theirs does not pay on
   *                   that path either. vy must be untouched.
   *                 · `release('timeout')` with vy = +9.0, already above the boost. This is a
   *                   FLOOR, not an impulse: `Math.max`, not `+=`. Theirs adds, and adding is how
   *                   a lock that FAILED becomes a bigger launch than one that worked. vy must be
   *                   untouched. */
  const boost = TUNE.magFailBoost;
  assert.ok(Math.abs(boost - 0.5 * TUNE.jumpV0) < 1e-9,
    `magFailBoost ${boost} is not half of jumpV0 ${TUNE.jumpV0} — the derivation has drifted`);

  const armed = async (vy, reason) => {
    const { c } = await makeController();
    const t = c.addTarget({ point: new THREE.Vector3(0, 6, -6) });
    c.targets.target = t;
    c.targets.locked = true;
    c.velocity.set(0, vy, 0);
    c.targets.release(reason);
    return c.velocity.y;
  };

  const paid = await armed(-8.0, 'timeout');
  const declined = await armed(-8.0, 'below');
  const rising = await armed(9.0, 'timeout');
  console.log(`\n[R3] timeout from vy −8.0 -> ${paid.toFixed(3)} (boost ${boost})`);
  console.log(`[R3] below   from vy −8.0 -> ${declined.toFixed(3)}`);
  console.log(`[R3] timeout from vy +9.0 -> ${rising.toFixed(3)}`);

  assert.ok(Math.abs(paid - boost) < 1e-9,
    `a timed-out lock left Sly at vy ${paid.toFixed(3)} instead of the ${boost} floor`);
  assert.ok(Math.abs(declined + 8.0) < 1e-9,
    `a 'below' release paid out ${declined.toFixed(3)} — it must not pay at all, or falling out of `
    + 'an assist becomes a way of gaining height');
  assert.ok(Math.abs(rising - 9.0) < 1e-9,
    `a timed-out lock at vy +9.0 left him at ${rising.toFixed(3)} — this is a floor, not an impulse, `
    + 'and adding would make a failed lock out-launch a successful one');
  assert.ok(paid !== declined,
    'the paying and non-paying release reasons produced the same answer, so the reason is not '
    + 'reaching the payout and R3 is measuring nothing');
});

/* ====================================================================== */
/* R4 — how many landings a player is actually told about                  */
/* ====================================================================== */

test('R4: every ordinary drop height now lands audibly, and the race is gone', async () => {
  /* ── THIS ARM USED TO PIN THE DEFECT. IT NOW PINS THE REPAIR. Read that before editing it. ──
   *
   * Until §438 it asserted that **at least 3 of 8 drop heights were SILENT**, and that silence was
   * not ordered by arrival speed. That was correct and deliberate: `Controller.TUNE`'s landing
   * block documented a race in which `_moveVertical` zeroed `v.y` before `_probeGround` could read
   * it, so `landImpact` came out 0 and `Land.canEnter` refused. Measured on the shipped temple:
   *
   *     0.5 m  4.51 m/s SILENT      1 m  6.10 m/s fires
   *     4   m 13.00 m/s SILENT    2.5 m 10.07 m/s fires
   *     6   m 16.09 m/s SILENT      8 m 18.55 m/s fires
   *     10  m 20.98 m/s SILENT     15 m 25.74 m/s fires
   *
   * Silent meant completely silent — no `land` state, no `landed` event, so no sound, no shake,
   * no impact pose — and a 4.51 m/s landing being silent while a 25.74 m/s one fired meant a
   * player could not learn the rule. Half of all landings, on the first thing anyone does.
   *
   * The old arm's own failure message said what to do when it went green: *"the landImpact race
   * has been fixed — say so and retire this arm rather than loosening it."* This is that, done
   * deliberately rather than by relaxing a bound, because **an arm that silently flips meaning is
   * worse than one that fails.** The sweep now records the arrival it used to erase and
   * `_probeGround` consumes it on the same frame; 8 of 8 heights fire.
   *
   * DOMAIN (§418.3 / §418.9)
   *   passes on : the repaired tree — all 8 sampled heights fire, every one above `landBeat`.
   *   fails on  : RUN in-arm below — the pre-repair predicate, `-velocity.y` read after the sweep
   *               has zeroed it, evaluated on the same landing frames. It is 0 on every one of
   *               them, which is exactly why they were silent, and it is what this arm asserts
   *               the shipped code no longer does. */
  const heights = [0.5, 1.0, 2.52, 4, 6, 8, 10, 15];
  const rows = [];
  for (const h of heights) {
    const { engine, c } = await realWorld();
    hardReset(engine, c, new THREE.Vector3(0, 0.2, 30), 0);
    c._needSpawnSnap = false;
    c.pendingLaunch = Math.sqrt(2 * -TUNE.gravity * h);
    c.sm.set('jump');
    let prevG = true, vyB = 0, arrival = 0, fired = false, rawVy = null;
    for (let i = 0; i < 900; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      engine.time = i * DT;
      c.update(DT, i * DT);
      if (!prevG && c.grounded) {
        if (!arrival) { arrival = Math.max(vyB, c.landImpact); rawVy = -c.velocity.y; }
      }
      if (engine.events.some((e) => e.evt === 'landed')) fired = true;
      prevG = c.grounded; vyB = -c.velocity.y;
      if (arrival && fired) break;
    }
    rows.push({ h, arrival, fired, rawVy });
  }

  console.log('\n[R4] drop      arrival    landed?');
  for (const r of rows) {
    console.log(`[R4] ${String(r.h).padStart(5)} m  ${r.arrival.toFixed(2).padStart(7)} m/s   ${r.fired ? 'fires ' : 'SILENT'}`);
  }
  const silent = rows.filter((r) => !r.fired);
  console.log(`[R4] ${rows.length - silent.length}/${rows.length} drop heights produce landing feedback · landBeat ${TUNE.landBeat} m/s`);

  assert.ok(rows.every((r) => r.arrival > TUNE.landBeat),
    'some sampled drops arrive below landBeat, so their silence would be by design and this arm '
    + 'would be counting intended behaviour');
  assert.deepEqual(silent.map((r) => r.h), [],
    `${silent.length} of ${rows.length} drop heights are silent again (${silent.map((r) => r.h).join(', ')} m). `
    + 'The landImpact race has regressed: `_moveVertical` is zeroing `v.y` before `_probeGround` '
    + 'can see it, and half of all landings have no sound, no shake and no impact pose.');

  /* The counterexample, RUN: the pre-repair predicate on these same landing frames. If reading
     `-velocity.y` after the sweep still saw the arrival, the race never existed and the repair
     above is decoration. */
  const rawSeen = rows.filter((r) => r.rawVy > TUNE.landBeat);
  assert.equal(rawSeen.length, 0,
    `the old predicate (-velocity.y after the sweep) saw an arrival above landBeat on `
    + `${rawSeen.length} of ${rows.length} landings, so it was not blind and the race this arm `
    + 'documents was never the mechanism');
});

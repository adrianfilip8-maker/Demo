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

/** One straight-up launch onto the temple floor at spawn, and what the landing was told.
 *
 * **Read off the bus, not off the Controller, and that is not a stylistic choice.** By the time
 * `c.update()` returns, every field this arm would want has been overwritten *by the landing it
 * is trying to measure*: `Land.enter` consumes the number (`const f = c.landImpact;
 * c.landImpact = 0`, Moveset.js:172) and `Land.update` then runs its own `gravity`+`move` in the
 * same frame, which re-arms the sweep with the 0.400 m/s of a body at rest. A first draft of R4
 * sampled the Controller after the update and reported `landImpact 0.000 · sweep 0.400` at every
 * height — a perfectly consistent, perfectly wrong table. `landed.force` is the value
 * `Land.enter` actually received, captured at emit and immutable afterwards.
 */
function dropOnto(engine, c, h) {
  hardReset(engine, c, new THREE.Vector3(0, 0.2, 30), 0);
  c._needSpawnSnap = false;
  engine.events.length = 0;
  c.pendingLaunch = Math.sqrt(2 * -TUNE.gravity * h);
  c.sm.set('jump');
  let prevG = true, approach = 0, gndFrame = -1, evFrame = -1, force = null;
  for (let i = 0; i < 900; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    const vyIn = -c.velocity.y;              // the speed carried INTO this frame's move
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (!prevG && c.grounded && gndFrame < 0) { gndFrame = c._frame; approach = vyIn; }
    const ev = engine.events.find((e) => e.evt === 'landed');
    if (ev && force === null) { force = ev.payload.force; evFrame = c._frame; }
    prevG = c.grounded;
    if (force !== null && gndFrame >= 0) break;
    if (gndFrame >= 0 && c._frame > gndFrame + 8) break;   // touched down and stayed silent
  }
  return { h, force, evFrame, gndFrame, landFrame: c._landFrame, approach };
}

test('R4: every ordinary drop height now lands audibly, and the race is gone', async () => {
  /* ── THIS ARM USED TO PIN THE DEFECT. IT NOW PINS THE REPAIR. Read that before editing it. ──
   *
   * Until §443 it asserted that **at least 3 of 8 drop heights were SILENT**, and that silence was
   * not ordered by arrival speed. That was correct and deliberate: `Controller.TUNE`'s landing
   * block documented a race in which `_moveVertical` zeroed `v.y` before `_probeGround` could read
   * it, so `landImpact` came out 0 and `Land.canEnter` refused. Silent meant *completely* silent —
   * no `land` state, no `landed` event, so no sound, no shake, no impact pose — and a 5.3 m/s
   * landing being silent while a 26.5 m/s one fired meant a player could not learn the rule. Half
   * of all landings, on the first thing anyone does.
   *
   * The old arm's own failure message said what to do when it went green: *"the landImpact race
   * has been fixed — say so and retire this arm rather than loosening it."* This is that, done
   * deliberately rather than by relaxing a bound, because **an arm that silently flips meaning is
   * worse than one that fails.**
   *
   * ── MECHANISM, NOT OUTCOME ────────────────────────────────────────────────────────────────
   * "8 of 8 fire" supports any number of stories — a widened band, a lowered `landBeat`, a
   * different probe. Three facts support exactly one, and this arm pins those instead:
   *
   *   WHAT was written   `landed.force` is the arrival carried into the contact frame plus
   *                      exactly one tick of gravity, at every height. Not 0, not a constant.
   *   WHEN it was written  the emit frame, `_landFrame` and the first grounded frame are the
   *                      same frame. The repair consumes the record same-frame or not at all.
   *   WHICH source won   the sweep's record is **ablated** and the identical drops re-run.
   *
   * The ablation is the load-bearing half. `Object.defineProperty` pins `_sweepLandFrame` to −1,
   * which switches off exactly the two consumption sites (Controller.js:982 grounding fallback,
   * :1018 `landImpact`) and nothing else — the launch, gravity, capsule and floor are untouched,
   * so the arrival speed is never stubbed. That matters: **an arm that stubbed the arrival and
   * then asserted the beat fires would be the `camlead` L3 shape**, an instrument built from the
   * assumption it is testing. Here the measurement (a bus event) is downstream of and independent
   * of the mechanism (a private frame stamp), and the ablation can fail — 4 of the 8 heights still
   * fire without the repair, because on those the ground probe happened to catch the arrival too.
   *
   * That split is also the ablation's own audit. It reproduces the pre-repair silent set
   * **0.5, 4, 6, 10 m** exactly — the set recorded in `Controller.TUNE` before this arm existed
   * and from a different instrument. An ablation that did not reproduce it would not be a
   * reconstruction of the old code and its silence would prove nothing.
   *
   * DOMAIN (§418.3 / §418.9)
   *   passes on : the repaired tree. 8 of 8 heights emit `landed`; on each, force = approach +
   *               one gravity tick to 1e-6, and emit frame = `_landFrame` = first grounded frame.
   *   fails on  : RUN in-arm, second pass below — the same 8 drops with `_sweepLandFrame` pinned
   *               to −1. Four go completely silent. Were the repair decoration, all 8 would still
   *               fire and this arm would go red on `ablSilent.length > 0`.
   *   does not  : any threshold. It never asks which landings are HARD, so `landHard` could be
   *   discrim.    any value and nothing here moves — that is L1's job. Nor does it see landings
   *               with horizontal motion, on slopes, or onto one-way surfaces: every drop is a
   *               straight vertical launch onto flat ground at spawn. And it cannot separate the
   *               two sources below ~8 mm of fall, where the arrival is itself under one tick;
   *               the shallowest height sampled is 60× that. */
  const HEIGHTS = [0.5, 1.0, 2.52, 4, 6, 8, 10, 15];
  const TICK = -TUNE.gravity * DT;                        // 0.400 m/s — one frame of gravity

  const { engine, c } = await realWorld();
  const rows = HEIGHTS.map((h) => dropOnto(engine, c, h));

  /* Second pass on a second Controller — `realWorld()` retires the first, so no arm ever holds
     two live ones (§425). The repair is switched off on this one and only on this one. */
  const { engine: e2, c: c2 } = await realWorld();
  Object.defineProperty(c2, '_sweepLandFrame', { get: () => -1, set() {}, configurable: true });
  const abl = HEIGHTS.map((h) => dropOnto(e2, c2, h));

  console.log('\n[R4] drop    approach   landed.force  frames(ev/land/gnd)   ablated');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], a = abl[i];
    console.log(`[R4] ${String(r.h).padStart(5)} m ${r.approach.toFixed(3).padStart(9)}`
      + ` ${(r.force === null ? 'SILENT' : r.force.toFixed(3)).padStart(13)}`
      + `   ${String(r.evFrame).padStart(4)}/${String(r.landFrame).padStart(4)}/${String(r.gndFrame).padStart(4)}`
      + `   ${(a.force === null ? 'SILENT' : a.force.toFixed(3)).padStart(9)}`);
  }
  const silent = rows.filter((r) => r.force === null);
  const ablSilent = abl.filter((r) => r.force === null);
  console.log(`[R4] repaired ${rows.length - silent.length}/${rows.length} fire · ablated `
    + `${abl.length - ablSilent.length}/${abl.length} fire · landBeat ${TUNE.landBeat} m/s`);

  /* Precondition. If a drop arrived below `landBeat`, its silence would be by design and this
     arm would be counting intended behaviour as a defect. */
  assert.ok(rows.every((r) => r.approach + TICK > TUNE.landBeat),
    'some sampled drops arrive below landBeat, so their silence would be by design');
  assert.deepEqual(silent.map((r) => r.h), [],
    `${silent.length} of ${rows.length} drop heights are silent again (${silent.map((r) => r.h).join(', ')} m). `
    + 'The landImpact race has regressed: `_moveVertical` is zeroing `v.y` before `_probeGround` '
    + 'can see it, and half of all landings have no sound, no shake and no impact pose.');

  /* WHAT, and WHEN. */
  for (const r of rows) {
    assert.ok(Math.abs(r.force - (r.approach + TICK)) < 1e-6,
      `${r.h} m: landImpact was written as ${r.force.toFixed(3)} but the capsule arrived at `
      + `${(r.approach + TICK).toFixed(3)} m/s. The beat fired on a number that is not the `
      + 'arrival, so whatever it is measuring, it is not this landing.');
    assert.equal(r.evFrame, r.gndFrame,
      `${r.h} m: 'landed' fired on frame ${r.evFrame} but contact was frame ${r.gndFrame} — the `
      + 'record is being consumed a frame late, which is the stale-impact case `_landFrame` exists '
      + 'to refuse');
    assert.equal(r.landFrame, r.gndFrame,
      `${r.h} m: landImpact was stamped for frame ${r.landFrame}, not the contact frame `
      + `${r.gndFrame}`);
  }

  /* WHICH — the counterexample, RUN. */
  assert.ok(ablSilent.length > 0,
    'switching the sweep record off changed nothing: all 8 heights still fire without it, so the '
    + 'ground probe was seeing every arrival on its own and the repair is decoration');
  assert.deepEqual(ablSilent.map((r) => r.h), [0.5, 4, 6, 10],
    `the ablation went silent at ${ablSilent.map((r) => r.h).join(', ')} m, not the 0.5, 4, 6, 10 m `
    + 'recorded in Controller.TUNE before this arm existed. It is therefore no longer a faithful '
    + 'reconstruction of the pre-repair code, and its silence is not evidence about the repair.');
  /* And the repair is additive: where the probe already saw the arrival, the number is unchanged
     to the bit. A repair that shifted every landing would show up here as a mismatch. */
  for (let i = 0; i < rows.length; i++) {
    if (abl[i].force === null) continue;
    assert.equal(abl[i].force, rows[i].force,
      `${rows[i].h} m: the repair changed a landing the probe was already seeing `
      + `(${abl[i].force.toFixed(3)} -> ${rows[i].force.toFixed(3)}). It is meant to add the `
      + 'landings the probe missed, not to re-scale the ones it caught.');
  }
  console.log(`[R4] ablating the sweep record silences ${ablSilent.map((r) => `${r.h} m`).join(', ')}`
    + ` — those four landings exist only because of it`);
});

/* ====================================================================== */
/* L1 — the threshold that decides which landings hurt                    */
/* ====================================================================== */

test('L1: landHard sits in a band that neither population can reach', async () => {
  /* R4 fixed the arrivals and that **forced this number**, which is why the arm is here and not
   * in a tuning file. Before the repair `landImpact` was 0 on most landings, so `landHard` was
   * only ever compared against the minority the probe happened to catch. With every arrival
   * reported, the old `landHard` 9.0 sat *below a plain jump* (10.87 m/s) — the repair alone
   * would have made every jump in the game a hard landing, with a 0.19 s control tax, a screen
   * shake and a root impulse, forever.
   *
   * So the threshold is derived from the arcs this moveset and this level actually produce.
   * Both populations are measured here, on the real integrator and the real floor:
   *
   *   A — what he can do to himself:  jump, and jump+double, swept over every hold/release/press
   *       timing in a 31 x 50 frame grid. 1550 arcs.
   *   B — what the level asks of him: the descents in `architecture.api.route`, dropped for real
   *       rather than solved for, so the same integrator reports both populations.
   *
   * The two do not merely differ, they are **disjoint with nothing in between**, and the reason
   * is structural: arrivals are quantized. A frame of gravity is 0.400 m/s and the sweep records
   * the velocity the move was made with, so every arrival in population A lands on a 0.400-spaced
   * ladder whose top rung is 14.586. `landHard` 15.0 is more than one whole rung clear of it.
   * That is the margin worth quoting — not a percentage of a continuous quantity, because the
   * quantity is not continuous.
   *
   * DOMAIN (§418.3 / §418.9)
   *   passes on : the shipped TUNE. Population A tops out below `landHard`; the first descent
   *               above A is above `landHard`; the band between them is empty.
   *   fails on  : RUN in-arm — `landHard` 9.0, the value this arm replaced, checked against the
   *               same measured populations below. It lands *inside* population A, so a plain
   *               jump is a hard landing. Also fails for any value at or below A's top rung.
   *   does not  : the exact number. Every threshold in (A-top, first-descent] separates the same
   *   discrim.    two populations identically, and this arm passes for all of them — a ~9.8 m/s
   *               window. Where 15.0 sits inside it is a feel decision, owed to hardware review,
   *               not a measurement. Nor is population A complete: it is jump and double-jump
   *               from flat ground. Wall-run exits, magnetism yanks (`magYankGain` 11.0) and
   *               enemy bounces are self-inflicted verticals this arm never launches.
   *
   *   ── §500: THIS ARM'S HEADLINE IS FALSE ON THE SHIPPED LEVEL, AND IT STILL PASSES ──
   *   The band is real between the two populations THIS ARM MEASURES, and both of them are
   *   measured at spawn on the courtyard floor, which is a plane. Rebuilt against the level's
   *   101 standable surfaces, a plain WALK off a reachable edge reaches 29.600 m/s and the
   *   median walk-off is 17.200 — above `landHard` itself — so the 14.586…23.749 band does not
   *   exist in play and 67 edges already arrive inside population B. §500.4 shows no single
   *   threshold separates them.
   *
   *   This arm is deliberately NOT widened to cover that. Its populations are the ones §443.3
   *   derived the number from, and it exists to pin that derivation against drift. What is
   *   added here is the disclaimer, because the failure mode §418.3 exists to prevent is
   *   exactly this: a green arm titled "landHard sits in a band that neither population can
   *   reach" being quoted for a claim about the LEVEL that it structurally cannot see. It
   *   cannot see the level. It has never stood on anything.
   *
   *   ── §501.3: AND ITS POPULATION B CANNOT TELL A DROP FROM A STAIRCASE ──
   *   `descents` below is built as `route[i-1][2] - route[i][2]` — the height difference between
   *   consecutive waypoints — and then dropped onto flat ground. That construction cannot see what
   *   is BETWEEN the waypoints. Opened one at a time, L1's three "authored route descents" are:
   *
   *       7.753   hook-chain -> hall-front-cornice   dy  1.20   a 1.2 m HOOK RELEASE
   *      25.368   hall-front-cornice -> hall-floor   dy 13.60   a WALK-OFF off a standable ledge
   *      23.749   descent-landing -> vault-floor     dy 12.00   a STAIRCASE
   *
   *   §447.1 measured that stair and found it built, correct and walkable — flight A −3.650 /
   *   −5.347, mid landing −5.600, flight B −9.071, crypt −12.000, both ramps inside
   *   `slopeWalkableDeg` 50. **Nobody falls 12 m into the vault; they walk down.** So `bandHi` here
   *   is the arrival of a fall nobody takes, and it must not be quoted as an authored descent.
   *
   *   Left standing rather than rebuilt, deliberately: this arm exists to pin §443.3's derivation
   *   against drift, and that derivation used exactly these numbers. Changing the population would
   *   make it stop doing the one job it has. What is added is that the population is not what its
   *   name says. */
  const TICK = -TUNE.gravity * DT;
  const { engine, c, mods } = await realWorld();

  /** Hold jump on [0,r), release, press-and-hold from p. Returns the written landImpact. */
  const arc = (r, p) => {
    hardReset(engine, c, new THREE.Vector3(0, 0.2, 30), 0);
    c._needSpawnSnap = false;
    engine.events.length = 0;
    c.pendingLaunch = TUNE.jumpV0;
    c.sm.set('jump');
    let apex = -99, force = null;
    for (let i = 0; i < 400; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      if (i < r || i >= p) engine.input.hold('jump'); else engine.input.let_go?.('jump');
      engine.time = i * DT;
      c.update(DT, i * DT);
      if (c.position.y > apex) apex = c.position.y;
      const ev = engine.events.find((e) => e.evt === 'landed');
      if (ev && i > 3) { force = ev.payload.force; break; }
    }
    return { force, apex };
  };

  /* ---- population A ---------------------------------------------------------------------- */
  const self = [];
  let apexMax = -99;
  for (let r = 0; r <= 30; r++) {
    for (let p = r + 1; p <= r + 50; p++) {
      const o = arc(r, p);
      if (o.apex > apexMax) apexMax = o.apex;
      if (o.force !== null) self.push(o.force);
    }
  }
  const selfTop = Math.max(...self);
  const selfLow = Math.min(...self);

  /* ---- population B: dropped, not solved --------------------------------------------------- */
  const route = mods.architecture.api.route;
  const descents = [];
  for (let i = 1; i < route.length; i++) {
    const dy = route[i - 1][2] - route[i][2];
    if (dy > 0.4) descents.push({ leg: `${route[i - 1][0]} -> ${route[i][0]}`, dy });
  }
  for (const d of descents) d.arrival = dropOnto(engine, c, d.dy).force;

  console.log(`\n[L1] A  what he can do to himself   ${selfLow.toFixed(3)} … ${selfTop.toFixed(3)} m/s`
    + `  (${self.length} arcs, highest apex ${apexMax.toFixed(3)} m)`);
  for (const d of descents) {
    console.log(`[L1] B  ${d.leg.padEnd(38)} ${d.dy.toFixed(1).padStart(5)} m  ${d.arrival.toFixed(3).padStart(7)} m/s`);
  }
  const above = descents.filter((d) => d.arrival > selfTop).map((d) => d.arrival);
  const bandLo = selfTop, bandHi = Math.min(...above);
  console.log(`[L1] empty band ${bandLo.toFixed(3)} … ${bandHi.toFixed(3)} m/s (${(bandHi - bandLo).toFixed(2)} wide)`
    + ` · landHard ${TUNE.landHard} · one gravity tick ${TICK.toFixed(3)}`);

  assert.ok(selfTop > TUNE.landBeat,
    `the fastest thing he can do to himself arrives at ${selfTop.toFixed(3)} m/s, at or below `
    + 'landBeat — then landBeat and landHard are not measuring two different populations and this '
    + 'whole derivation is about one');
  assert.ok(selfTop < TUNE.landHard,
    `a move the player MEANT to make arrives at ${selfTop.toFixed(3)} m/s, at or above landHard `
    + `${TUNE.landHard}. Ordinary jumping now costs a ${TUNE.landHardTime} s control tax and a `
    + 'screen shake, which is the exact failure the 9.0 -> 15.0 re-derivation existed to avoid.');
  assert.ok(TUNE.landHard - selfTop >= TICK,
    `landHard clears the self-inflicted ceiling by ${(TUNE.landHard - selfTop).toFixed(3)} m/s, `
    + `less than the ${TICK.toFixed(3)} m/s quantum arrivals actually come in. Sub-quantum margin `
    + 'is not margin: one more frame of fall anywhere in the moveset crosses it.');
  assert.ok(bandHi > TUNE.landHard,
    `the first descent above the self-inflicted ceiling arrives at ${bandHi.toFixed(3)} m/s, at or `
    + 'below landHard — a genuine fall would land soft, which is the opposite defect');
  assert.equal(descents.filter((d) => d.arrival > bandLo && d.arrival < bandHi).length, 0,
    'a route descent landed inside the band this arm calls empty');

  /* The counterexample, RUN: the value this derivation replaced, against these same numbers. */
  const OLD = 9.0;
  assert.ok(!(selfLow > OLD),
    `landHard ${OLD} was supposed to be inside population A — the slowest self-inflicted landing `
    + `measures ${selfLow.toFixed(3)} m/s. If it is above ${OLD}, the old value did not make every `
    + 'jump hard and the reason given for re-deriving it is wrong.');
  console.log(`[L1] counterexample: landHard ${OLD} sits below A's floor ${selfLow.toFixed(3)} — `
    + 'every jump in the game would be a hard landing');
});

/* ====================================================================== */
/* R5 — the spawn snap is armed for the SPAWN, and a teleport spends it    */
/* ====================================================================== */

test('R5: a freshly-minted Controller no longer eats its first frame teleporting to the floor', async () => {
  /* ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────────
   * `Controller._needSpawnSnap` exists so that `init()`, which places Sly at `SPAWN` before
   * COLLISION is live, gets him dropped onto the real floor on the first frame it IS. It was
   * scoped to "the first live frame" and never to "the spawn", and `teleport()` did not spend
   * it — so a Controller placed by hand and then stepped had a 38 m ground cast applied to
   * wherever it had been put. On the shipped temple that was a 17.5 m fall in ONE frame,
   * arriving grounded in state `idle`.
   *
   * The cost was not to the game (`src` mints exactly one Controller, at `main.js:205`, and its
   * one armed frame happens at `SPAWN` where the snap moves it −0.0000 m). The cost was that
   * **no test in this project could start a beat airborne** — a probe that asked for a height
   * silently got the ground — which is how a telegraph beat was twice reported as
   * "did not reproduce". Six sites across five files had each found the field and cleared it by
   * hand without naming it; `realWorld()` was the one that had not, and it is the one that bit.
   *
   * ── MECHANISM, NOT OUTCOME (§439) ────────────────────────────────────────────────────────
   * "he is still airborne" is satisfied by a dozen stories — a shortened cast, a changed gate,
   * a different probe order. So the ablation restores the pre-repair code EXACTLY, by re-arming
   * the single boolean the repair spends, and re-runs the identical drops. Nothing on the
   * measurement path is stubbed: the BVH, the capsule, the cast and the position are all real;
   * what is put back is one private flag, and what is read is where Sly ends up.
   *
   * The third case is the one that stops this being a deletion. A repair that simply removed
   * the snap would pass both halves above, so the arm also drives the BOOT path — position
   * written directly, no teleport, exactly as `init()` does (measured: `init()` calls
   * `teleport()` zero times) — and requires that it still snaps.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a fresh Controller teleported to (4.2, y, 4.5) for y in 2.5 … 30 and stepped
   *               once — he stays within a frame of gravity of where he was put.
   *   fails  on : the same drops with `_needSpawnSnap` re-armed after the teleport (RUN below,
   *               in-arm) — every one of them arrives at the terrace deck, y 2.000, grounded.
   *   does NOT discriminate : the snap's REACH, or its upward face. Once `teleport()` spends
   *               the arm, the only position the snap can act on is the spawn, so the ±(8, 30) m
   *               cast this arm leaves in place is untestable from here and deliberately
   *               untouched. Nor does it see whether a level whose spawn is NOT already on the
   *               floor is snapped correctly — `SPAWN` is, so case 3 below measures that the
   *               mechanism RAN, not that it moved him.
   */
  const { engine } = await realWorld();
  const HEIGHTS = [2.5, 5, 8.95, 12, 19.5, 25, 30];
  const AT = new THREE.Vector3(4.2, 0, 4.5);
  /* One frame of free fall — the most a stepped Controller may legitimately move downward from
     rest. Derived from the tune rather than written down, so a gravity change cannot make this
     arm quietly permissive. `TUNE.gravity` is signed (−24); this bound is a magnitude. */
  const TICK = Math.abs(TUNE.gravity) * DT * DT;

  async function virgin() {
    const c = new Controller(engine);
    await c.init();
    return c;
  }
  function step(c) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    c.update(DT, 0);
  }

  /* 1 — the repair. A fresh Controller per row, because the defect was per-INSTANCE. */
  const kept = [];
  for (const y of HEIGHTS) {
    const c = await virgin();
    hardReset(engine, c, new THREE.Vector3(AT.x, y, AT.z));
    step(c);
    kept.push({ y, end: c.position.y, grounded: c.grounded, state: c.sm.name, group: c.sm.group });
    c.dispose?.();
  }

  /* 2 — the ablation: put the one flag back, change nothing else. */
  const snapped = [];
  for (const y of HEIGHTS) {
    const c = await virgin();
    hardReset(engine, c, new THREE.Vector3(AT.x, y, AT.z));
    c._needSpawnSnap = true;                 // exactly what teleport() now spends
    step(c);
    snapped.push({ y, end: c.position.y, grounded: c.grounded });
    c.dispose?.();
  }

  /* 3 — the boot path, unchanged: position written directly, no teleport. */
  const boot = await virgin();
  const bootArmed = boot._needSpawnSnap;
  step(boot);
  const bootSpent = !boot._needSpawnSnap;
  boot.dispose?.();

  /* 4 — a shot-staged frame cannot reach the snap either, and not only because of the flag:
         `Debug.setShot` raises `engine.debug.freeCam` before it steps, and `update()` returns
         on it above `_probeEnvironment`. Measured here rather than read off the source, because
         it is the fact the "does this reach the shipped game" answer rests on. */
  const shot = await virgin();
  shot.position.set(AT.x, 19.5, AT.z);       // direct write: the arm is still live
  engine.debug.freeCam = true;
  step(shot);
  engine.debug.freeCam = false;
  const shotY = shot.position.y;
  const shotArmed = shot._needSpawnSnap;
  shot.dispose?.();

  /* ── WHAT ── */
  for (const r of kept) {
    assert.ok(r.y - r.end <= TICK + 1e-9,
      `teleported to y ${r.y} and stepped once, Sly ended at y ${r.end.toFixed(3)} — a drop of `
      + `${(r.y - r.end).toFixed(3)} m in one frame, against a free-fall bound of `
      + `${TICK.toFixed(5)} m. Something is still moving him further than gravity can.`);
    assert.equal(r.grounded, false,
      `teleported to y ${r.y}, Sly reports grounded after one frame — the harness accepted a `
      + 'height and handed back the floor, which is the whole defect');
    /* NOT `state === 'fall'`. That is what I wrote first and the level refused it: at y 12 over
       (4.2, 4.5) the auto hook-grab fires on frame 1, because there is a ring in reach — real
       behaviour, and behaviour that was UNREACHABLE from a fresh Controller until this repair.
       Asserting `fall` would have been a probe written from my picture of the level rather than
       from the level (§435.4). The claim this arm is entitled to is that he is not on the floor. */
    assert.notEqual(r.group, 'ground',
      `teleported to y ${r.y}, Sly is in "${r.state}" (group "${r.group}") after one frame — a `
      + 'ground state at altitude is the snap, whatever it calls itself');
  }

  /* ── WHICH — the counterexample, RUN ── */
  for (const r of snapped) {
    assert.ok(r.grounded && r.y - r.end > 0.4,
      `re-arming _needSpawnSnap at y ${r.y} left Sly at y ${r.end.toFixed(3)} (grounded `
      + `${r.grounded}). The ablation is meant to reconstruct the pre-repair snap; if it no `
      + 'longer snaps, this arm is passing for a reason that has nothing to do with the repair.');
  }
  const decks = new Set(snapped.map((r) => r.end.toFixed(3)));
  assert.equal(decks.size, 1,
    `the ablation should land every height on the same deck under (${AT.x}, ${AT.z}); it landed `
    + `on ${[...decks].join(', ')}, so it is not the single cast this repair is about`);

  /* ── AND THE MECHANISM IS STILL THERE ── */
  assert.ok(bootArmed,
    'a freshly constructed Controller must arrive with the spawn snap armed — init() places Sly '
    + 'before COLLISION is live and something has to put him on the floor');
  assert.ok(bootSpent,
    'the boot path (position written directly, no teleport, exactly as init() does) did not '
    + 'spend the spawn snap on its first live frame. The repair has removed the mechanism rather '
    + 'than scoping it, and a level whose spawn sits off the floor will now start Sly in the air.');

  /* ── AND THE SHOT PATH ── */
  assert.equal(shotY, 19.5,
    `with engine.debug.freeCam raised, one update moved Sly from 19.5 to ${shotY.toFixed(3)}. `
    + 'Debug.setShot steps the Controller with freeCam up; if physics runs under it, a staged '
    + 'frame is not the pose the shot asked for.');
  assert.ok(shotArmed,
    'a freeCam update spent the spawn snap. It returns above _probeEnvironment precisely so a '
    + 'posed frame runs no physics, and this says it no longer does.');

  console.log(`[R5] ablation: re-arming _needSpawnSnap drops all ${HEIGHTS.length} heights `
    + `(${HEIGHTS[0]}…${HEIGHTS[HEIGHTS.length - 1]} m) onto y ${snapped[0].end.toFixed(3)} in one frame`);
  console.log(`[R5] repaired, frame 1 states by height: `
    + kept.map((r) => `${r.y}m ${r.state}`).join(' · ')
    + ' — the non-`fall` rows are airborne entries the harness could not reach at all before');
});

/* ====================================================================== */
/* R6 — stuck is not slow: the safety net's second failure mode           */
/* ====================================================================== */

test('R6: a capsule that is airborne, unattached and going nowhere is recovered; one that is merely still is not', async () => {
  /* ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────
   * `_safetyNet` triggered on HEIGHT alone (`voidY` −220). §503 drove a capsule pinned at a
   * 57.64° face in the tomb stairwell: the ground was 6 mm under its feet, `_probeGround`
   * refused it — correctly, since grounding on a 57.64° face would be the bug — so `grounded`
   * never latched, `Jump.canEnter`'s `canGroundJump()` never returned true, coyote expired, and
   * **no input produced a jump.** Backing off, walking either way and jumping were all driven:
   * all four moved the capsule under 7 mm in 180 frames. Stationary, airborne, out of options,
   * at y −6.58 — nowhere near `voidY`, so nothing noticed, while `_recordSafeStance` had held a
   * good recovery point the whole time.
   *
   * ── THE ARM IS BUILT ON THE MECHANISM, NOT THE COORDINATES, AND HAD TO BE ────────────────
   * The world lane has since closed that face: re-driven, (−9.26, −6.58, −56.60) now settles to
   * `tiptoe`, grounded, in 10 frames. An arm pinned to those coordinates would today be green
   * for the wrong reason and would have been testing a surface rather than a predicate. So the
   * pin below is produced by holding the capsule still — airborne and unattached — which is the
   * condition the predicate actually reads, by whatever cause.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a capsule held airborne, unattached and motionless — recovered at exactly
   *               `stuckTime`, to the frame.
   *   fails  on : RUN in-arm below — the same drive with the capsule GROUNDED, and again with it
   *               free to fall. Neither is recovered, at ten times the window.
   *   does NOT  : whether the recovery point is a good one. That is R1/R2's job. Nor does it see
   *   discrim.    a capsule moving slowly but genuinely — it pins the two ends, not the boundary
   *               at `stuckDist`, and it cannot say whether 3.0 s feels long to a player.
   */
  const { engine, c } = await realWorld();
  const HOLD = new THREE.Vector3(0, 12, 30);
  const FRAMES = Math.round(TUNE.stuckTime / DT);

  /**
   * Drive `n` frames from `at`, optionally pinning the capsule in place. Returns the rescue frame
   * or −1.
   *
   * The grounded control STANDS ON REAL GROUND rather than setting `c.grounded = true`. My first
   * version set the flag at y 12 and the arm went red: `_probeGround` runs inside `update()` and
   * correctly cleared it, so the "standing still" control was a capsule in mid-air with a stale
   * boolean — §435.4 inside the arm meant to catch it. The control is only a control if the world
   * agrees with it.
   */
  function run(n, at, { pin = false, airborne = true } = {}) {
    hardReset(engine, c, at.clone(), Math.PI);
    engine.warnings.length = 0;
    if (airborne) { c.grounded = false; c.sm.set('fall'); }
    for (let i = 0; i < n; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 0;
      if (pin) { c.position.copy(at); c.velocity.set(0, 0, 0); }
      engine.time = i * DT;
      c.update(DT, i * DT);
      if (engine.warnings.some((w) => /stuck airborne/.test(w))) return i;
    }
    return -1;
  }

  /* ── WHAT ── */
  const rescued = run(FRAMES * 3, HOLD, { pin: true });
  assert.equal(rescued, FRAMES,
    `a capsule held airborne, unattached and motionless was recovered on frame ${rescued}, not `
    + `${FRAMES} (= stuckTime ${TUNE.stuckTime}s). The watchdog is not counting the window it says.`);

  /* ── WHICH — the counterexamples, RUN ── */
  const still = run(FRAMES * 10, new THREE.Vector3(0, 0.2, 30), { airborne: false });
  assert.ok(c.grounded,
    'the standing control is not actually standing — it must rest on real ground, or it is a '
    + 'second airborne case wearing a boolean');
  assert.equal(still, -1,
    `a capsule standing perfectly still ON THE GROUND was "recovered" at frame ${still}. Stuck is `
    + 'not slow: a player who stops moving is the most ordinary thing in the game and must never '
    + 'be teleported for it.');

  const falling = run(FRAMES * 10, HOLD, { pin: false });
  assert.equal(falling, -1,
    `a capsule left free to fall was recovered at frame ${falling}. Motion resets the anchor, so `
    + 'anything actually travelling — a long drop, a slide down a face — must never trip this.');

  /* ── AND THE EXEMPTION THAT IS NOT BY NAME ── */
  assert.ok(TUNE.stuckTime > TUNE.wallClingMax,
    `stuckTime ${TUNE.stuckTime} does not clear wallClingMax ${TUNE.wallClingMax}. wallCling is `
    + 'group `air`, not `attach`, so it is stationary, airborne and unexempted — it is safe only '
    + 'because it self-terminates first, and that ordering is the whole reason 3.0 was chosen.');

  console.log(`[R6] recovered at frame ${rescued} = ${TUNE.stuckTime}s exactly; still-on-ground and `
    + `free-fall both survive ${FRAMES * 10} frames untouched`);
});

/* ====================================================================== */
/* R7 — a jump off a pole is a move you meant, and a spire perch is not   */
/*      a place history leaks through                                     */
/* ====================================================================== */

test('R7: deliberate attach-family exits classify controlled; a genuine loss still lands hard', async () => {
  /* ── THE DEFECT (§511, measured on §485.2's own sequence) ─────────────────────────────────
   * The acceptance drive climbed the obelisk, jumped off the top, spire-landed on the
   * pyramidion, walked off, and fell 13 m — landing 31.0 m/s HARD. Under §502's rule that
   * should be soft: every step was chosen. Traced at the transition level, TWO defects:
   *
   *   1. `poleClimb -> jump` set `_airControlled = false`. `poleClimb` is in BEAT_LOST, and the
   *      list treated every exit as a lost grip — but the `jump` STATE is only enterable through
   *      input (all six `return 'jump'` sites read: five press/buffer gates, one deliberate
   *      stick-up vault, plus PoleSwing's designed launch). A press classified as a lost beat.
   *   2. `spireLand -> fall` fired NEITHER branch (not ground, not in BEAT_LOST), so the flag
   *      kept whatever history it had — the classification of a spire drop depended on how you
   *      arrived at the spire. SpireLand has no failure mode: velocity zeroed every frame, no
   *      timer, exits are a jump press, a crouch drop, and a 0.16 s debounced walk-off.
   *
   * ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a real jump press at the pole top (flag true), and a spire walk-off with the
   *               flag POISONED false first (comes out true — the §485.2 inheritance, cured).
   *   fails  on : RUN in-arm — a wallCling loss from 17 m, which must still land HARD; and
   *               `hookSwing -> fall`, which must still classify uncontrolled. If either flips,
   *               the fix widened the term instead of correcting the two named sites.
   *   does NOT  : decide whether a double jump mid-fall should re-establish control (air->air
   *   discrim.    transitions are untouched, deliberately), nor whether §502.5's hookSwing bail
   *               residual is acceptable — the bail returns 'fall', not 'jump', and remains
   *               conservatively uncontrolled.
   */
  const { engine, c } = await realWorld();

  /* 1 — a REAL press at the pole top classifies controlled. */
  hardReset(engine, c, new THREE.Vector3(1.22, 19.5, 12.29), Math.PI);
  c.grounded = false;
  c.sm.set('poleClimb');
  assert.equal(c.sm.name, 'poleClimb', 'the probe needs the pole mount to take');
  engine.input.beginFrame(DT);
  engine.input.move.x = 0; engine.input.move.y = 0;
  engine.input.hold('jump');
  c.update(DT, 0);
  assert.ok(['jump', 'fall', 'doubleJump'].includes(c.sm.name),
    `a jump press on the pole left Sly in "${c.sm.name}" — the exit this arm pins never ran`);
  assert.equal(c._airControlled, true,
    'a jump PRESSED at the pole top classified as a lost beat — poleClimb is in BEAT_LOST and '
    + 'the jump-state override is not running before the list check');

  /* 2 — the spire walk-off launders a poisoned history. */
  hardReset(engine, c, new THREE.Vector3(0, 23.6, 11), Math.PI);
  c.grounded = false; c.sm.set('fall'); c.velocity.set(0, -2, 0);
  c._airControlled = false;                        // the inherited lost-beat history, simulated
  let perched = false, off = false;
  for (let i = 0; i < 300; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = c.sm.name === 'spireLand' ? 1 : 0;
    engine.camera.rotation.set(0, Math.PI, 0, 'YXZ'); engine.camera.updateMatrixWorld(true);
    engine.time = i * DT; c.update(DT, i * DT);
    if (c.sm.name === 'spireLand') perched = true;
    if (perched && c.sm.name === 'fall') { off = true; break; }
  }
  assert.ok(perched && off, 'the probe must reach the spire and walk off it');
  assert.equal(c._airControlled, true,
    'walking off the spire kept a stale uncontrolled flag — the classification of a deliberate '
    + 'drop is depending on how Sly ARRIVED at the perch');

  /* 3 — the counterexamples, RUN: the fix must not have widened the term. */
  hardReset(engine, c, new THREE.Vector3(0, 17, 30), Math.PI);
  c.grounded = false; c.sm.set('wallCling'); c.sm.set('fall');
  assert.equal(c._airControlled, false,
    'a wallCling loss now classifies controlled — the jump/spire fix widened BEAT_LOST away');
  engine.events.length = 0;
  let landedEv = null;
  for (let i = 0; i < 600 && !landedEv; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time = i * DT; c.update(DT, i * DT);
    landedEv = engine.events.find((e) => e.evt === 'landed') || null;
    engine.events.length = 0;
  }
  assert.ok(landedEv && landedEv.payload.force >= TUNE.landHard,
    `the 17 m wallCling loss arrived at ${landedEv?.payload.force?.toFixed(1)} m/s — the control `
    + 'needs a genuinely hard arrival to say anything');
  hardReset(engine, c, new THREE.Vector3(0, 12, 30), Math.PI);
  c.grounded = false; c.sm.set('hookSwing'); c.sm.set('fall');
  assert.equal(c._airControlled, false,
    'hookSwing -> fall now classifies controlled — but the bail returns fall, not jump, so the '
    + 'name cannot distinguish a chosen release from a lost hook and must stay conservative');

  console.log('[R7] pole-top jump press: controlled · spire walk-off launders poison · '
    + 'wallCling and hookSwing losses still uncontrolled');
});

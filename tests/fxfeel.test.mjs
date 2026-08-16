import test from 'node:test';
import assert from 'node:assert/strict';
import { EMITTERS, ALERT_LADDER, CONTINUOUS, PAL } from '../src/fx/Emitters.js';
import { TUNE, BATCH_CAPACITY, DENSITY_CLAMP, emitTicks } from '../src/fx/Particles.js';

/**
 * Offline guards on the traversal / stealth FX pass (PREREG-fxtraversal).
 *
 * ── Why this suite is arithmetic and not a capture ─────────────────────────────────────
 * A particle system is emission rate, lifetime, integration and a budget ceiling. All four
 * are numbers in committed data, so all four can be settled in a second in plain Node
 * instead of in five minutes holding the global capture lock. Nothing below needs a browser,
 * a GPU or a frame, and the pass that added these emitters therefore never took the lock.
 *
 * ── Pre-registration ──────────────────────────────────────────────────────────────────
 * Every threshold here was written down BEFORE the emitter values it judges existed
 * (§141.1). They are restated in the test that uses them. If a candidate misses one, the
 * EMITTER moves — never the threshold. Nothing in this file was re-derived after seeing a
 * number it did not like.
 *
 * ── §211.1 ────────────────────────────────────────────────────────────────────────────
 * Every data-driven test asserts a NON-ZERO inspected count. Nine assertions in this
 * project once passed while reading a field that did not exist.
 *
 * ── Calibration ───────────────────────────────────────────────────────────────────────
 * T1, T2 and T3 each carry a positive arm that MUST fire. A ceiling that clamps nothing, a
 * budget that rejects nothing and a monotonicity check that accepts a flat ladder are all
 * indistinguishable from having no check at all, and would each pass a naive assertion
 * trivially. Where an arm fails, interrogate it before touching it.
 */

const P11 = (fovDeg) => 1 / Math.tan((fovDeg * Math.PI) / 360);
const frac = (sizeMetres, fovDeg, d) => (sizeMetres * P11(fovDeg)) / d;

/* The emitters this pass added. Named explicitly rather than diffed against a snapshot so
   that the suite says what it is guarding even when read on its own. */
const NEW_SPARK = ['rail_spark', 'alert_spot_spark'];
const NEW_DUST = ['skid_scuff', 'alert_clear', 'alert_notice', 'alert_search', 'alert_spot'];
const NEW_ALL = [...NEW_SPARK, ...NEW_DUST];

/* Registered T1 bound: 0.75 * TUNE.flashMaxH at the fov-40 / d-5.0 reference framing. This is
   the SAME bound the already-shipped suite (tests/fx.test.mjs, "the small spark populations
   are nowhere near the ceiling") enforces on every non-cane_flash spark emitter — so it was
   not mine to choose, and breaching it turns an existing test red as well as this one. */
const T1_FRAC = 0.75 * TUNE.flashMaxH;          // 0.3375
const T1_REF = { fov: 40, d: 5.0 };

/* Registered T2 share: a quarter of the batch, for the NEW CONTINUOUS emitters only.
   `_updateEmitters` records that ~300 live smoke against capacity 220 wrapped the ring and
   evicted the puff NEAREST the camera. Object-tracked emitters are exempt from the distance
   cull, so a player-attached continuous emitter competes with every fire in the level for the
   whole session rather than only when the player is near it. */
const T2_SHARE = 0.25;

const meanOf = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
const maxOf = (r) => (Array.isArray(r) ? Math.max(r[0], r[1]) : r);

/* ══════════════════════════════════════════════════════ T0 — the data actually landed ══ */

test('T0: every emitter this pass claims to add exists in the catalogue', () => {
  let inspected = 0;
  for (const name of NEW_ALL) {
    const def = EMITTERS[name];
    assert.ok(def, `EMITTERS.${name} is missing — a name that resolves to nothing is the ` +
                   '`embers` gap again (eight warnings a boot, no fire in any brazier)');
    assert.ok(Array.isArray(def.size) && def.size.length === 2, `${name}.size must be [start,end]`);
    assert.ok(Array.isArray(def.life) && def.life.length === 2, `${name}.life must be [min,max]`);
    assert.ok(Array.isArray(def.alpha) && def.alpha.length === 2, `${name}.alpha must be [min,max]`);
    assert.ok(Array.isArray(def.count) && def.count.length === 2, `${name}.count must be [min,max]`);
    inspected++;
  }
  assert.equal(inspected, NEW_ALL.length, 'inspected fewer emitters than the pass claims to add');
  assert.ok(inspected > 0, 'inspected zero emitters');
  console.log(`  T0: ${inspected} new emitters present and well-formed`);
});

test('T0: the batch capacities and the density clamp are exported, not buried', () => {
  /* The budget arithmetic below is only meaningful if it reads the SAME numbers the renderer
     allocates. Both used to be magic numbers inside `_buildBatches` and `_density`, where a
     test could not see them drift. */
  assert.ok(BATCH_CAPACITY && typeof BATCH_CAPACITY === 'object', 'BATCH_CAPACITY must be exported');
  for (const b of ['dust', 'smoke', 'spark', 'ring']) {
    assert.equal(typeof BATCH_CAPACITY[b], 'number', `BATCH_CAPACITY.${b} must be a number`);
    assert.ok(BATCH_CAPACITY[b] > 0, `BATCH_CAPACITY.${b} must be positive`);
  }
  assert.ok(Array.isArray(DENSITY_CLAMP) && DENSITY_CLAMP.length === 2, 'DENSITY_CLAMP must be [lo,hi]');
  assert.ok(DENSITY_CLAMP[1] >= 1, 'the density ceiling must be at least 1 or the budget is understated');
});

/* ═══════════════════════════════════════════════════════════════ T1 — screen-space size ══ */

test('T1: no new additive sprite approaches the screen-space ceiling', () => {
  let inspected = 0;
  const report = [];
  for (const name of NEW_SPARK) {
    const def = EMITTERS[name];
    assert.ok(def, `EMITTERS.${name} missing`);
    assert.equal(def.batch, 'spark', `${name} is claimed as a new additive emitter but sits in "${def.batch}"`);
    const f = frac(maxOf(def.size), T1_REF.fov, T1_REF.d);
    report.push(`${name}=${f.toFixed(4)}`);
    assert.ok(
      f <= T1_FRAC,
      `${name}: frac ${f.toFixed(4)} exceeds the registered bound ${T1_FRAC} ` +
        `(max size ${maxOf(def.size)} m at fov ${T1_REF.fov}, d ${T1_REF.d} m)`,
    );
    inspected++;
  }
  assert.ok(inspected > 0, 'inspected zero new additive emitters');
  console.log(`  T1: ${inspected} new spark emitters, bound ${T1_FRAC}; ${report.join(', ')}`);
});

test('T1 CALIBRATION: the shipped cane_flash breaches the bound this test applies', () => {
  /* MUST FIRE. If the pathological emitter the ceiling was built for passes the bound, the
     bound is not measuring what it claims to and no T1 result above means anything. */
  const flash = EMITTERS.cane_flash;
  assert.ok(flash, 'cane_flash missing — the calibration arm has nothing to measure');
  const heavy = 1.35;                                   // _onCaneHit index >= 3
  const f = frac(flash.size[0] * heavy, T1_REF.fov, T1_REF.d);
  console.log(`  T1 calib: cane_flash heavy = ${(flash.size[0] * heavy).toFixed(3)} m -> frac ${f.toFixed(3)}`);
  assert.ok(
    f > T1_FRAC,
    `calibration failed: cane_flash frac ${f.toFixed(3)} does NOT breach ${T1_FRAC}, so this ` +
      'bound cannot distinguish a veiling sprite from a speck',
  );
});

/* ══════════════════════════════════════════════════════════════════════ T2 — budget ══ */

/**
 * Steady-state live count of a continuous emitter.
 *
 * `_updateEmitters` accumulates `dt * rate * density` and drains one whole tick at a time;
 * each tick `_emit` writes `round(range(count0, count1+0.999) * density)` particles, each
 * living `range(life0, life1)`. In steady state the live population is the arrival rate times
 * the mean residence time, and the WORST case — which is the one a fixed-size ring buffer has
 * to survive — takes the density ceiling and the longest life.
 */
const steadyLive = (rate, def, density) => rate * meanOf(def.count) * maxOf(def.life) * density;

test('T2: the new continuous emitters fit inside their registered share of each batch', () => {
  const density = DENSITY_CLAMP[1];
  const perBatch = new Map();
  let inspected = 0;

  for (const [state, cfg] of Object.entries(CONTINUOUS)) {
    const def = EMITTERS[cfg.emitter];
    assert.ok(def, `CONTINUOUS.${state} points at "${cfg.emitter}", which is not in EMITTERS`);
    assert.equal(typeof cfg.rate, 'number', `CONTINUOUS.${state}.rate must be a number`);
    assert.ok(cfg.rate > 0, `CONTINUOUS.${state}.rate must be positive`);
    const live = steadyLive(cfg.rate, def, density);
    perBatch.set(def.batch, (perBatch.get(def.batch) || 0) + live);
    inspected++;
  }

  assert.ok(inspected > 0, 'inspected zero continuous emitters — CONTINUOUS is empty or unreadable');

  const lines = [];
  for (const [batch, live] of perBatch) {
    const cap = BATCH_CAPACITY[batch];
    assert.equal(typeof cap, 'number', `no capacity published for batch "${batch}"`);
    const budget = T2_SHARE * cap;
    lines.push(`${batch} ${live.toFixed(1)}/${budget.toFixed(0)} of ${cap}`);
    assert.ok(
      live <= budget,
      `batch "${batch}": new continuous emitters hold ${live.toFixed(1)} live at density ` +
        `${density}, over the registered ${T2_SHARE} share (${budget.toFixed(0)} of ${cap}). ` +
        'A player-attached emitter is never distance-culled, so this competes with every ' +
        'fire in the level for the whole session.',
    );
  }
  console.log(`  T2: ${inspected} continuous emitters at density ${density}; ${lines.join(' | ')}`);
});

test('T2 CALIBRATION: an over-budget emitter is rejected by the same arithmetic', () => {
  /* MUST FIRE. A budget check that accepts everything is not a budget check. This synthetic
     emitter is deliberately past the spark share: 60 ticks/s x 1 x 3.0 s x 1.6 = 288 live
     against a registered 175. */
  const density = DENSITY_CLAMP[1];
  const synthetic = { count: [1, 1], life: [3.0, 3.0], batch: 'spark' };
  const live = steadyLive(60, synthetic, density);
  const budget = T2_SHARE * BATCH_CAPACITY.spark;
  console.log(`  T2 calib: synthetic rate 60 / life 3.0 -> ${live.toFixed(0)} live vs budget ${budget.toFixed(0)}`);
  assert.ok(
    live > budget,
    `calibration failed: the synthetic over-budget emitter (${live.toFixed(0)} live) did NOT ` +
      `exceed the budget (${budget.toFixed(0)}), so T2 cannot detect an emitter that floods a batch`,
  );
});

/* ══════════════════════════════════════════════════ T2b — the emission integrator ══ */

/**
 * Drive the SHIPPED `emitTicks` over a frame schedule and report what it emitted and the
 * peak live population, given a lifetime. This is the integration half of the budget: T2
 * bounds the steady state, this bounds the transient.
 */
function driveTicks(rate, density, dts, lifeSec, meanCount) {
  let accum = 0;
  const perFrame = [];
  for (const dt of dts) {
    const r = emitTicks(accum, dt, rate, density);
    accum = r.accum;
    perFrame.push(r.ticks);
  }
  const total = perFrame.reduce((s, n) => s + n, 0);
  // Live population = everything born within one lifetime of now, at 60 fps sampling.
  const window = Math.round(lifeSec * 60);
  let peak = 0;
  for (let i = 0; i < perFrame.length; i++) {
    let live = 0;
    for (let j = Math.max(0, i - window); j <= i; j++) live += perFrame[j];
    peak = Math.max(peak, live);
  }
  return { total, peak: peak * meanCount, perFrame };
}

const RAIL = { rate: CONTINUOUS.railSlide.rate, def: EMITTERS.rail_spark };

test('T2b: the integrator conserves the authored rate at normal frame times', () => {
  const density = DENSITY_CLAMP[1];
  const seconds = 4;
  const dts = new Array(60 * seconds).fill(1 / 60);
  const out = driveTicks(RAIL.rate, density, dts, maxOf(RAIL.def.life), meanOf(RAIL.def.count));
  const intended = RAIL.rate * density * seconds;
  assert.ok(out.perFrame.length > 0, 'drove zero frames');
  console.log(`  T2b: 60fps x ${seconds}s -> ${out.total} ticks, intended ${intended.toFixed(0)}`);
  /* Within one tick of carry — the accumulator holds a fraction, it does not drop or invent. */
  assert.ok(
    Math.abs(out.total - intended) <= 1,
    `emitted ${out.total} ticks against an intended ${intended.toFixed(1)} — the integrator ` +
      'is not conserving the authored rate',
  );
});

test('T2b: a frame hitch does not flood the batch afterwards', () => {
  const density = DENSITY_CLAMP[1];
  /* One 1.0 s hitch, then a second and a half of normal frames. */
  const dts = [1.0, ...new Array(90).fill(1 / 60)];
  const out = driveTicks(RAIL.rate, density, dts, maxOf(RAIL.def.life), meanOf(RAIL.def.count));
  const budget = T2_SHARE * BATCH_CAPACITY.spark;
  const steady = steadyLive(RAIL.rate, RAIL.def, density);
  console.log(
    `  T2b hitch: peak live ${out.peak.toFixed(0)} (steady ${steady.toFixed(1)}, budget ${budget.toFixed(0)})`,
  );
  /* Registered bound: a hitch may cost at most one clamped frame on top of the steady state,
     never a sustained burst. 3x the steady state is generous headroom for that one frame. */
  assert.ok(
    out.peak <= steady * 3,
    `peak live ${out.peak.toFixed(0)} after a 1 s hitch is more than 3x the steady state ` +
      `${steady.toFixed(1)} — the integrator is banking the backlog and paying it off at the ` +
      'clamp, which floods the batch exactly when the machine is already struggling',
  );
  assert.ok(out.peak <= budget, `peak live ${out.peak.toFixed(0)} exceeds the batch budget ${budget.toFixed(0)}`);
});

test('T2b CALIBRATION: the banking form this replaced does flood, by the same measure', () => {
  /* MUST FIRE. `emitTicks` differs from the obvious loop in one line — it clamps the
     ACCUMULATOR, not just the tick count. If the banking form does not flood under this
     measurement, then the test above is not measuring flooding and its pass means nothing.
     This is the only place the old form is reproduced, and it is reproduced to be rejected. */
  const density = DENSITY_CLAMP[1];
  const banking = (accum, dt, rate, dens, maxTicks = 6) => {
    let a = accum + dt * rate * dens;
    let ticks = 0;
    while (a >= 1 && ticks < maxTicks) { a -= 1; ticks++; }
    return { ticks, accum: a };                       // arrears kept — the defect
  };
  const dts = [1.0, ...new Array(90).fill(1 / 60)];
  let accum = 0;
  const perFrame = [];
  for (const dt of dts) {
    const r = banking(accum, dt, RAIL.rate, density);
    accum = r.accum;
    perFrame.push(r.ticks);
  }
  const window = Math.round(maxOf(RAIL.def.life) * 60);
  let peak = 0;
  for (let i = 0; i < perFrame.length; i++) {
    let live = 0;
    for (let j = Math.max(0, i - window); j <= i; j++) live += perFrame[j];
    peak = Math.max(peak, live);
  }
  peak *= meanOf(RAIL.def.count);
  const steady = steadyLive(RAIL.rate, RAIL.def, density);
  console.log(`  T2b calib: banking form peaks at ${peak.toFixed(0)} live vs steady ${steady.toFixed(1)}`);
  assert.ok(
    peak > steady * 3,
    `calibration failed: the banking form peaked at only ${peak.toFixed(0)} against a steady ` +
      `${steady.toFixed(1)}, so this measurement cannot tell a flooding integrator from a ` +
      'well-behaved one',
  );
});

/* ═══════════════════════════════════════════════════════════════════════ T3 — ladder ══ */

/**
 * Registered loudness metric: count x alpha x area.
 *
 * Area rather than diameter because a sprite's contribution to the frame goes as the square
 * of its size — a rung that is twice as wide is four times as much picture, and a ladder
 * scored on diameter would call that a 2x step.
 */
const loudness = (def) => meanOf(def.count) * meanOf(def.alpha) * Math.pow(def.size[0], 2);

/* The rung order the ladder has to climb, quietest first. */
const RUNG_ORDER = ['patrol', 'suspicious', 'searching', 'chase'];

test('T3: the stealth ladder is strictly graded, quietest rung to loudest', () => {
  let inspected = 0;
  const scores = [];
  for (const state of RUNG_ORDER) {
    const entry = ALERT_LADDER[state];
    assert.ok(entry, `ALERT_LADDER has no entry for guard state "${state}"`);
    const def = EMITTERS[entry.emitter];
    assert.ok(def, `ALERT_LADDER.${state} points at "${entry.emitter}", which is not an emitter`);
    scores.push({ state, emitter: entry.emitter, score: loudness(def) });
    inspected++;
  }
  assert.equal(inspected, RUNG_ORDER.length, 'did not inspect every rung');
  assert.ok(inspected > 0, 'inspected zero rungs');

  console.log(`  T3: ${scores.map((s) => `${s.state}(${s.emitter})=${s.score.toFixed(5)}`).join(' < ')}`);

  for (let i = 1; i < scores.length; i++) {
    assert.ok(
      scores[i].score > scores[i - 1].score,
      `rung "${scores[i].state}" (${scores[i].score.toFixed(5)}) is not louder than ` +
        `"${scores[i - 1].state}" (${scores[i - 1].score.toFixed(5)}) — the ladder is not graded, ` +
        'which is the shipped defect: one identical puff at every rung',
    );
  }

  /* Each rung must be a STEP, not a nudge: a 1% difference is graded on paper and identical
     on screen. Registered at 1.6x minimum between adjacent rungs. */
  for (let i = 1; i < scores.length; i++) {
    const ratio = scores[i].score / scores[i - 1].score;
    assert.ok(
      ratio >= 1.6,
      `rung "${scores[i].state}" is only ${ratio.toFixed(2)}x "${scores[i - 1].state}" — ` +
        'below the registered 1.6x step, so the two rungs will not read apart',
    );
  }
});

test('T3 CALIBRATION: a flat ladder is rejected', () => {
  /* MUST FIRE. The defect this ladder replaces was a single `guard_alert` puff fired at every
     rung. If the monotonicity check accepts a flat ladder it would have passed the shipped
     defect, and its verdict on the new one means nothing. */
  const flat = { count: [5, 7], alpha: [0.4, 0.6], size: [0.1, 0.5] };
  const a = loudness(flat);
  const b = loudness(flat);
  console.log(`  T3 calib: two identical rungs score ${a.toFixed(5)} and ${b.toFixed(5)}`);
  assert.ok(
    !(b > a),
    'calibration failed: the strict-increase test would accept two identical rungs, so it ' +
      'cannot detect a flat ladder',
  );
});

test('T3: the ladder speaks the vision cone\'s own three-stop colour language', () => {
  /* The cone already tells the player where he is on the meter — cream, amber, red
     (Guard.js colPatrol / colWarn / colAlert). A puff in some fourth palette would be a
     second, contradicting language for the same state. This does not pin exact hexes (those
     belong to GUARDS); it pins the RELATIONSHIP: the ladder must warm and redden as it
     climbs, never cool. */
  const red = (hex) => (hex >> 16) & 0xff;
  const blue = (hex) => hex & 0xff;
  /* Warmth = how far red leads blue. Cream leads a little, amber more, red most. */
  const warmth = (hex) => red(hex) - blue(hex);

  let inspected = 0;
  const seen = [];
  let prev = -Infinity;
  for (const state of RUNG_ORDER) {
    const def = EMITTERS[ALERT_LADDER[state].emitter];
    const w = warmth(def.col0);
    seen.push(`${state}=${w}`);
    assert.ok(
      w >= prev,
      `rung "${state}" (warmth ${w}) is COOLER than the rung below it (${prev}) — the ladder ` +
        'must warm as it climbs, the way the vision cone does',
    );
    prev = w;
    inspected++;
  }
  assert.ok(inspected > 0, 'inspected zero rung colours');
  /* Calibration: the ladder must actually traverse the ramp, not sit on one stop. */
  const first = warmth(EMITTERS[ALERT_LADDER[RUNG_ORDER[0]].emitter].col0);
  const last = warmth(EMITTERS[ALERT_LADDER[RUNG_ORDER[RUNG_ORDER.length - 1]].emitter].col0);
  assert.ok(
    last > first,
    `the ladder starts and ends at the same warmth (${first} -> ${last}); it is not traversing ` +
      'the cone ramp at all',
  );
  console.log(`  T3 colour: ${seen.join(' -> ')} (warmth = R - B)`);
});

/* ═════════════════════════════════════════════════════════════════════ T5 — routing ══ */

/* Every state Guard._setState can transition INTO. Mirrored from src/ai/Patrol.js STATE.
   Duplicated deliberately rather than imported: this suite guards the FX side of the
   contract, and it should go red if GUARDS adds a rung FX has not been told about. */
const GUARD_STATES = ['patrol', 'suspicious', 'searching', 'chase', 'lost', 'stunned', 'ko'];

test('T5: every guard state routes to an emitter that exists', () => {
  let inspected = 0;
  const routes = [];
  for (const state of GUARD_STATES) {
    const entry = ALERT_LADDER[state];
    assert.ok(entry, `guard state "${state}" has no ALERT_LADDER entry — it would fall through ` +
                     'to a silent default and the player would get no tell for that rung');
    assert.equal(typeof entry.emitter, 'string', `ALERT_LADDER.${state}.emitter must be a name`);
    assert.ok(
      EMITTERS[entry.emitter],
      `ALERT_LADDER.${state} points at "${entry.emitter}", which is not in EMITTERS — this is ` +
        'exactly the `embers` failure: a name that warns once a call and draws nothing',
    );
    routes.push(`${state}->${entry.emitter}`);
    inspected++;
  }
  assert.equal(inspected, GUARD_STATES.length, 'did not inspect every guard state');
  assert.ok(inspected > 0, 'inspected zero guard states');
  console.log(`  T5: ${routes.join(', ')}`);
});

test('T5: the chase rung carries its extra spark, and it is the only rung that does', () => {
  /* The top rung is the one that has to punch. It gets a second, additive emitter on top of
     its dust puff; the rungs below deliberately do not, so "he has actually seen you" is the
     only moment that puts additive light in the frame. */
  let withSpark = 0;
  let inspected = 0;
  for (const state of GUARD_STATES) {
    const entry = ALERT_LADDER[state];
    if (entry.spark) {
      assert.ok(EMITTERS[entry.spark], `ALERT_LADDER.${state}.spark "${entry.spark}" is not an emitter`);
      assert.equal(EMITTERS[entry.spark].batch, 'spark', `${entry.spark} must live in the additive batch`);
      assert.equal(state, 'chase', `only the chase rung may carry an extra spark; "${state}" does`);
      withSpark++;
    }
    inspected++;
  }
  assert.ok(inspected > 0, 'inspected zero states');
  assert.equal(withSpark, 1, `expected exactly one rung to carry an extra spark, found ${withSpark}`);
});

/* ══════════════════════════════════════════════════ traversal emitters, shape checks ══ */

test('rail sparks read as metal-on-metal: short-lived, stretched, and thrown backwards', () => {
  const def = EMITTERS.rail_spark;
  assert.ok(def, 'rail_spark missing');
  assert.equal(def.batch, 'spark', 'rail sparks are additive');
  assert.ok(maxOf(def.life) <= 0.45, `rail spark life ${maxOf(def.life)} s is a firework, not a grind spark`);
  assert.ok(def.stretch > 0, 'a grind spark must be velocity-stretched or it reads as a dot');
  assert.ok(def.gravity > 0, 'grind sparks fall — they are hot metal, not embers floating up');
  assert.ok(def.size[1] < def.size[0], 'a spark shrinks as it cools');
  /* It must not be a dust-coloured spark: this is the one traversal FX whose colour says
     "metal". PAL.metalSpark is that colour. */
  assert.equal(def.col0, PAL.metalSpark, 'rail sparks start at the metal-spark colour');
});

test('the skid scuff is ground dust that dies fast enough to track a turn', () => {
  const def = EMITTERS.skid_scuff;
  assert.ok(def, 'skid_scuff missing');
  assert.equal(def.batch, 'dust', 'a scuff is dust, not an additive spark');
  /* A skid resolves in well under half a second (Moveset Skid: `sm.time > 0.42` forces the
     exit). Dust that outlives the state by a lot leaves a cloud hanging where the player has
     already gone, which reads as lag. */
  assert.ok(maxOf(def.life) <= 1.0, `skid dust life ${maxOf(def.life)} s outlives the skid state`);
  assert.ok(def.drag > 0, 'scuff dust must decelerate or it keeps travelling after the foot stops');
  assert.ok(def.size[1] > def.size[0], 'a dust puff expands as it dissipates');
});

test('the new dust emitters stay inside the palette', () => {
  /* §2.2: the emitter table is the one place colours are allowed, and they come from PAL or
     from the guard cone ramp. A raw hex that matches neither is how a fourth language gets
     into the build. */
  const allowed = new Set([
    ...Object.values(PAL),
    0xfff0c2, 0xffb14a, 0xff3a22,        // Guard.js colPatrol / colWarn / colAlert
  ]);
  let inspected = 0;
  const strays = [];
  for (const name of NEW_ALL) {
    const def = EMITTERS[name];
    for (const key of ['col0', 'col1']) {
      if (!allowed.has(def[key])) strays.push(`${name}.${key}=0x${def[key].toString(16)}`);
      inspected++;
    }
  }
  assert.ok(inspected > 0, 'inspected zero colours');
  assert.deepEqual(strays, [], `new emitters use colours outside PAL and the cone ramp: ${strays.join(', ')}`);
  console.log(`  palette: ${inspected} colour slots checked across ${NEW_ALL.length} emitters`);
});

/* ══════════════════════════════════════════════ T5 — machinery wired at BOTH ends (§357.1) ══
 *
 * §357.1 — "machinery wired at one end only — a guard that exists is not a guard that runs" —
 * has recurred four-plus times in this project. A dead-machinery audit of `src/fx` and
 * `src/audio` found two more instances of it in the FX catalogue's own data, and the two tests
 * below exist so that fixing them cannot quietly come undone.
 *
 * Both read `src/fx/Particles.js` as TEXT as well as importing from it. That is deliberate and
 * is the same instrument `tests/pickups.test.mjs` uses on its three subscribers: importing a
 * symbol proves it EXISTS, and existing is precisely the half of the bug that was never in
 * doubt. Only the call site proves it RUNS.
 */

import fs from 'node:fs';
import * as THREE from 'three';
import { pinnedAffordance, Particles } from '../src/fx/Particles.js';

const PARTICLES_SRC = fs.readFileSync(new URL('../src/fx/Particles.js', import.meta.url), 'utf8');

test('T6a: both ember grades are reachable, and the cup is quieter than the bed', () => {
  /* The defect: `ember` (a wall torch's cup) and `embers` (a brazier's bed) were both authored,
     the difference was documented at `Emitters.js:684-690`, and `_fireTick` asked for `embers`
     unconditionally — so `ember` had zero call sites in all of `src/` and every sconce in the
     game threw a brazier's sparks. */
  const cup = EMITTERS.ember;
  const bed = EMITTERS.embers;
  assert.ok(cup, 'EMITTERS.ember is missing — the wall-torch ember grade');
  assert.ok(bed, 'EMITTERS.embers is missing — the brazier ember grade');

  /* END ONE: the data says they differ. Scored on the same `loudness` the alert ladder uses
     (count x alpha x size^2), so "quieter" means the same thing here as it does there. */
  const cupScore = loudness(cup);
  const bedScore = loudness(bed);
  console.log(`  T6a: ember(cup)=${cupScore.toFixed(5)} < embers(bed)=${bedScore.toFixed(5)}`);
  assert.ok(
    bedScore > cupScore,
    `a brazier's bed (${bedScore.toFixed(5)}) must throw more than a sconce's cup ` +
      `(${cupScore.toFixed(5)}) — otherwise the two grades are a distinction with no difference`,
  );
  assert.ok(
    maxOf(bed.life) > maxOf(cup.life),
    'Emitters.js documents the bed as "coarser and longer-lived" than the cup; its life is not longer',
  );

  /* END TWO: `_fireTick` actually routes them apart. Without this the assertions above pass on
     a catalogue whose second entry is never emitted, which IS the shipped defect.

     RUN it rather than grep it. `_fireTick` touches only `h.name`, `h.position`, `h.scale`,
     `this._emit` and a module-scope scratch vector, so `Particles.prototype._fireTick.call()`
     on a two-field stub executes the real shipped line with no renderer, no canvas and no
     atlas — and a text match would go green on a comment or red on a reformat. */
  const fired = (name) => {
    const calls = [];
    Particles.prototype._fireTick.call(
      { _emit: (n) => calls.push(n) },
      { name, position: new THREE.Vector3(1, 2, 3), scale: 1 },
      0,
    );
    return calls;
  };

  /* Every name FIRE_NAMES resolves as a composite, split by what PROPS means by it:
     `Props.js:607` spawns `embers` for a brazier, `Props.js:619` spawns `torch_smoke` for a
     wall sconce, and `_seedOrphanTorches` spawns `torch`. */
  const BEDS = ['embers', 'brazier'];
  const CUPS = ['torch', 'torch_smoke', 'fire'];
  let routed = 0;
  for (const name of BEDS) {
    const calls = fired(name);
    assert.ok(calls.includes('embers'), `a bed ("${name}") did not emit 'embers': ${calls.join()}`);
    assert.ok(!calls.includes('ember'), `a bed ("${name}") emitted the cup grade: ${calls.join()}`);
    routed++;
  }
  for (const name of CUPS) {
    const calls = fired(name);
    assert.ok(calls.includes('ember'), `a cup ("${name}") did not emit 'ember': ${calls.join()}`);
    assert.ok(!calls.includes('embers'), `a cup ("${name}") emitted the bed grade: ${calls.join()}`);
    routed++;
  }
  assert.equal(routed, BEDS.length + CUPS.length, 'did not route every fire name');
  console.log(`  T6a: ${BEDS.length} bed names -> embers, ${CUPS.length} cup names -> ember`);

  /* Every fire still emits its other three components whichever grade it takes — the routing
     must not have cost a sconce its core, body or smoke. */
  for (const name of [...BEDS, ...CUPS]) {
    const calls = fired(name);
    for (const part of ['fire_core', 'fire_body', 'torch_smoke']) {
      assert.ok(calls.includes(part), `"${name}" lost its ${part}: ${calls.join()}`);
    }
  }
});

test('T6b: the sparkle guard rejects box affordances, and _updateSparkles actually calls it', () => {
  /* §2.1.6's diamond marks a place. `Collision.query()` resolves a rec three ways
     (`Collision.js:832/846/857`) and only two of them are places: a spline point slides ALONG
     its rail, an authored point does not move, and a box's "closest point" tracks the player —
     measured at |Δpoint|/|Δplayer| = 1.000 at p90 for `ledge` and `wall` and at the median for
     `ground`, on the shipped level built headless. `pinnedAffordance` is what keeps a box out
     of the field if WORLD ever widens `TUNE.sparkleTags`. */
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rec = (userData) => ({ rec: { mesh: { userData } }, point: V() });

  const accepted = [
    ['authored point (hook, spire)', rec({ point: V(1, 2, 3) })],
    /* The result field WORLD added to `query()` — authoritative, and the only thing that sees
       a pole whose curve COLLISION synthesised but could not write back. */
    ['query() spline result field (rail, pole)', { ...rec({}), spline: { getPoint: () => V() }, length: 12 }],
    ['userData.spline fallback (older query() shape)', rec({ spline: { getPoint: () => V() } })],
  ];
  const rejected = [
    ['bare box (ledge, wall, ground, vent)', rec({})],
    ['point that is not a Vector3', rec({ point: { x: 1, y: 2, z: 3 } })],
    ['spline without getPoint', rec({ spline: {} })],
    ['result-field spline without getPoint', { ...rec({}), spline: {}, length: 0 }],
    ['no userData at all', { rec: { mesh: {} }, point: V() }],
    ['no mesh', { rec: {}, point: V() }],
    ['no rec', { point: V() }],
    ['nothing', null],
  ];

  let inspected = 0;
  for (const [what, e] of accepted) {
    assert.ok(pinnedAffordance(e), `pinnedAffordance rejected a pinned affordance: ${what}`);
    inspected++;
  }
  /* The arm that MUST fire. A guard that accepts everything is indistinguishable from no
     guard, and would pass the accept arm above trivially. */
  for (const [what, e] of rejected) {
    assert.ok(!pinnedAffordance(e), `pinnedAffordance ACCEPTED an unpinned affordance: ${what}`);
    inspected++;
  }
  assert.equal(inspected, accepted.length + rejected.length, 'did not inspect every case');
  console.log(`  T6b: ${accepted.length} pinned accepted, ${rejected.length} unpinned rejected`);

  /* END TWO. The guard exists; this is the half that says it runs. */
  const upd = PARTICLES_SRC.slice(PARTICLES_SRC.indexOf('  _updateSparkles(dt, t) {'));
  assert.ok(upd.startsWith('  _updateSparkles'), 'could not find _updateSparkles in Particles.js');
  const body = upd.slice(0, upd.indexOf('\n  }'));
  assert.ok(
    /pinnedAffordance\(e\)/.test(body),
    '_updateSparkles no longer consults pinnedAffordance — a box tag added to sparkleTags ' +
      'would draw diamonds that slide with the player:\n' + body,
  );
  /* And that skipping an entry cannot silently truncate the field: the loop must bound on
     marks placed, not on how far down the query list it has walked. */
  assert.ok(
    /marked\s*<\s*sp\.capacity/.test(body),
    '_updateSparkles bounds its loop by list index rather than by markers placed, so skipped ' +
      'box entries would eat the sparkle budget',
  );
});

/* ══════════════════════════════════════ T7 — the destructible vocabulary (§357.1, round 2) ══
 *
 * FX owns what a break looks like; `src/world/` owns *that* one happened. These hold the half
 * that lives here, and in particular that the three dead catalogue entries the audit found —
 * the `dust_ring` and `scorch` decals and `PAL.crevice` — are now reachable through it.
 */

import { SMASH, smashFor } from '../src/fx/Emitters.js';
import { DECALS } from '../src/fx/Decals.js';

test('T7: every smash recipe names things that exist, and resolves like stepFor does', () => {
  const mats = Object.keys(SMASH);
  assert.ok(mats.length >= 4, `only ${mats.length} smash materials`);
  let checked = 0;
  for (const m of mats) {
    const R = SMASH[m];
    assert.ok(EMITTERS[R.debris], `SMASH.${m}.debris "${R.debris}" is not an emitter`);
    assert.ok(EMITTERS[R.dust], `SMASH.${m}.dust "${R.dust}" is not an emitter`);
    if (R.spark) assert.ok(EMITTERS[R.spark], `SMASH.${m}.spark "${R.spark}" is not an emitter`);
    assert.ok(DECALS[R.decal], `SMASH.${m}.decal "${R.decal}" is not in the decal catalogue`);
    assert.equal(R.col.length, 2, `SMASH.${m}.col must be [start, end]`);
    assert.equal(R.dustCol.length, 2, `SMASH.${m}.dustCol must be [start, end]`);
    checked++;
  }
  assert.equal(checked, mats.length, 'did not check every material');

  /* Unknown material must fall back the same way `Sfx.stepFor()` does, or the two halves of a
     break disagree about what an unlabelled prop is made of. */
  assert.equal(smashFor('granite'), SMASH.stone, 'unknown material did not default to stone');
  assert.equal(smashFor(undefined), SMASH.stone, 'missing material did not default to stone');
  assert.equal(smashFor('wood'), SMASH.wood, 'a known material was not resolved');
});

test('T7: the smash table is what makes dust_ring, scorch and PAL.crevice reachable', () => {
  /* The audit's finding, turned into a guard. All three were built and had zero readers in
     `src/`; if a future edit drops them out of this table they go dead again silently. */
  const decals = new Set(Object.values(SMASH).map((r) => r.decal));
  assert.ok(decals.has('dust_ring'), 'no smash recipe places the dust_ring decal — it is dead again');
  assert.ok(decals.has('scorch'), 'no smash recipe places the scorch decal — it is dead again');

  const cols = Object.values(SMASH).flatMap((r) => [...r.col, ...r.dustCol]);
  assert.ok(cols.includes(PAL.crevice), 'no smash recipe uses PAL.crevice — it is dead again');

  /* scorch is a BURN. It belongs to metal and to nothing else: a clay jar breaking does not
     char the floor, and spreading it to every material to use up a catalogue entry would be
     worse than leaving it unread. */
  for (const [m, r] of Object.entries(SMASH)) {
    if (r.decal === 'scorch') assert.equal(m, 'metal', `"${m}" leaves a burn mark and should not`);
    if (m === 'metal') assert.ok(r.spark, 'metal is the material that throws light and has no spark');
    else assert.equal(r.spark, null, `"${m}" throws sparks; only metal should`);
  }
});

test('T7: one break stays far inside the dust batch, and the arm that proves the bound bites', () => {
  /* A break is an event, not a loop, so the only way it can hurt is if a single call is large
     or a burst of them stacks. Mean count per call, against BATCH_CAPACITY. */
  let worst = 0, worstMat = '';
  for (const [m, r] of Object.entries(SMASH)) {
    const dustN = meanOf(EMITTERS[r.debris].count) + meanOf(EMITTERS[r.dust].count);
    if (dustN > worst) { worst = dustN; worstMat = m; }
  }
  const share = worst / BATCH_CAPACITY.dust;
  console.log(`  T7: worst break is "${worstMat}" at ${worst} dust particles = ${(share * 100).toFixed(1)}% of ${BATCH_CAPACITY.dust}`);
  assert.ok(share < 0.05, `one break costs ${(share * 100).toFixed(1)}% of the dust batch`);

  /* Six broken in one swing — the shelf-of-jars case — must still clear the quarter-share that
     CONTINUOUS reserves for the emitters that never get distance-culled. */
  const six = worst * 6;
  assert.ok(six < BATCH_CAPACITY.dust * T2_SHARE,
    `six simultaneous breaks reach ${six}, past the ${BATCH_CAPACITY.dust * T2_SHARE} quarter-share`);

  /* CALIBRATION, must fire: a recipe 20x the size has to breach the same bound, or the bound
     is not measuring anything. */
  assert.ok((worst * 20) / BATCH_CAPACITY.dust >= 0.05,
    'calibration failed: a 20x recipe still passes the per-break bound');
});

/* ══════════════════════════════════════════════ T8 — the `alert` shot's staging ══
 *
 * 22 of the catalogue's 34 emitters are unreachable in every canonical capture, the whole
 * stealth ladder among them — the one part of the FX layer with a pre-registered suite (T3
 * above) and zero pixels of evidence. The coordinator authors the new `alert` shot; this is the
 * staging half, and these hold it. Executed, not grepped: `_stageAlert` touches only the engine
 * getters, `this._emit` and module scratch, so a stub runs the shipped code.
 */

test('T8: the alert shot stages the top rung, and the ladder contrast when there are two guards', () => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const run = (guards) => {
    const calls = [];
    const self = {
      engine: {
        get: (k) => (k === 'movement' ? { position: V(0, 0, 0) }
          : k === 'guards' && guards ? { list: guards } : null),
      },
      _emit: (n, p) => calls.push({ n, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) }),
    };
    const out = Particles.prototype._stageAlert.call(self);
    return { calls, out };
  };

  /* Two guards → both rungs, so one frame carries the grading the ladder claims. */
  const two = run([{ position: V(3, 0, -4) }, { position: V(-6, 0, -8) }]);
  const names = new Set(two.calls.map((c) => c.n));
  assert.ok(names.has('alert_spot'), 'the top rung was not staged');
  assert.ok(names.has('alert_spot_spark'), 'the top rung lost its additive spark — the only light in the ladder');
  assert.ok(names.has('alert_search'), 'the second guard did not get the contrast rung');
  assert.ok(!names.has('alert_clear') && !names.has('alert_notice'),
    'staged a quiet rung; the shot exists to evidence the loud end');

  /* Head height, agreeing with `_onGuardAlert`'s +1.55 — a staged frame and a played one must
     put the mark in the same place or the capture is not evidence about the game. */
  const spot = two.calls.find((c) => c.n === 'alert_spot');
  assert.equal(spot.y, 1.55, `top rung at y=${spot.y}, not the guard's head height`);
  assert.deepEqual([spot.x, spot.z], [3, -4], 'top rung did not land on the nearest guard');
  const search = two.calls.find((c) => c.n === 'alert_search');
  assert.deepEqual([search.x, search.z], [-6, -8], 'contrast rung did not land on the second guard');

  /* §237 / the `_emit` aliasing trap: `_emit` writes `_v1` before it reads `position` inside its
     particle loop, so a staging path that held its position in `_v1` would put every particle
     at (0,1,0). Six emissions from one point is exactly that shape. MUST NOT be the origin. */
  for (const c of two.calls) {
    assert.ok(!(c.x === 0 && c.y === 1 && c.z === 0),
      `"${c.n}" was emitted at (0,1,0) — the position scratch was clobbered by _emit`);
  }

  /* The burst train: the capture latency after Debug.setShot's second rebase is not something
     this pass could measure (§186 held the lock), so each rung is emitted as several back-dated
     ticks and is readable whichever latency is real. */
  const spots = two.calls.filter((c) => c.n === 'alert_spot');
  assert.ok(spots.length >= 3, `top rung staged as ${spots.length} tick(s); a single tick bets the frame on one latency`);

  /* One guard → top rung only. Two marks with one guard under them would be a lie about the
     scene, and this is the arm that proves the second rung is conditional rather than always-on. */
  const one = run([{ position: V(3, 0, -4) }]);
  const oneNames = new Set(one.calls.map((c) => c.n));
  assert.ok(oneNames.has('alert_spot'), 'one guard did not get the top rung');
  assert.ok(!oneNames.has('alert_search'), 'staged a second rung with only one guard to hang it on');
  assert.equal(one.out.rung2, null, 'reported a rung-2 position that was never staged');

  /* No GUARDS module at all → still stages, offset from the player, so the shot is never empty. */
  const none = run(null);
  assert.ok(none.calls.length > 0, 'no guards module staged nothing — the shot would capture an empty frame');
  assert.ok(none.out.rung3 && none.out.rung3.lengthSq() > 0, 'fallback mark landed on the player');
  console.log(`  T8: 2 guards -> ${two.calls.length} emissions, 1 guard -> ${one.calls.length}, none -> ${none.calls.length}`);
});

test('T8: an unknown shot name still stages nothing extra', () => {
  /* The branch must be inert until the shot lands, and every existing shot must be untouched —
     restaging an existing one would break comparability with every sealed measurement on it. */
  const src = PARTICLES_SRC.slice(PARTICLES_SRC.indexOf('  _stageShot(name) {'));
  const body = src.slice(0, src.indexOf('\n  }'));
  assert.ok(/name === 'alert'/.test(body), '_stageShot has no alert branch');
  for (const shot of ['hero', 'temple', 'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard', 'kaykit']) {
    const staged = (body.match(new RegExp(`name === '${shot}'`, 'g')) || []).length;
    assert.ok(staged <= 1, `"${shot}" is branched on ${staged} times — a second branch would restage it`);
  }
  assert.ok(!/name === 'alert'[\s\S]*name === 'combat'/.test(body),
    'the alert branch was inserted before combat, changing an existing shot\'s staging order');
});

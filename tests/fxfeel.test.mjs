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
import { pinnedAffordance, Particles, STAGE_LATENCY } from '../src/fx/Particles.js';

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
      _emit: (n, p, opt) => calls.push({
        n, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), age: opt?.age ?? 0,
      }),
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

  /* ── The ages, re-derived here rather than restated ────────────────────────────────────
     The capture latency is settled: `Debug.js` runs applyShot → step(14) → applyShot → step(3)
     → capture, so the operative distance is 3 frames after the SECOND staging — `STAGE_LATENCY`.
     But there are TWO capture paths: the shipping one at dt = 1/60 (+STAGE_LATENCY) and the A/B
     one §195 requires to pass dt = 0 (+0). The staging cannot tell them apart, so each age must
     be judged on the WORSE of the two, and this recomputes that from the shader's own curves. */
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ink = (d, u) => {
    const sz = d.size[0] + (d.size[1] - d.size[0]) * Math.pow(u, d.sizeExp);
    return sz * sz * meanOf(d.alpha) * ss(0, Math.max(d.fadeIn, 1e-3), u) * Math.pow(Math.max(1 - u, 0), d.fadeOut);
  };
  const worstFrac = (name, age) => {
    const d = EMITTERS[name], life = meanOf(d.life);
    let best = 0;
    for (let u = 0; u < 1; u += 0.0005) best = Math.max(best, ink(d, u));
    return Math.min(ink(d, (age + STAGE_LATENCY) / life), ink(d, age / life)) / best;
  };

  /* One tick per emitter per staging. The burst train was a hedge against not knowing the
     latency; knowing it, three ticks is just three times the particles. */
  for (const n of ['alert_spot', 'alert_spot_spark', 'alert_search']) {
    const ticks = two.calls.filter((c) => c.n === n);
    assert.equal(ticks.length, 1, `${n} staged as ${ticks.length} ticks; the latency is known, one is enough`);
  }

  let aged = 0;
  for (const c of two.calls) {
    const d = EMITTERS[c.n];
    /* `_emit` drops any particle whose sampled life is <= age, so an age past the SHORTEST life
       silently thins the population instead of aging it. */
    assert.ok(c.age < d.life[0],
      `${c.n} staged at age ${c.age}s, past its shortest life ${d.life[0]}s — _emit would drop part of the burst`);

    /* **The arm that matters, and it must fire.** At age exactly 0 a sprite whose fadeIn is a
       fraction of life has `smoothstep(0, fadeIn, 0) === 0` — alpha zero, nothing rendered — on
       the dt = 0 path where the clock never advances. `alert_spot_spark` is the case: staging it
       at 0 would put an additive spark in every A/B capture that draws literally nothing. */
    assert.ok(worstFrac(c.n, 0) < worstFrac(c.n, c.age) || c.age === 0,
      `${c.n} gains nothing from its staged age — check the derivation`);
    if (d.fadeIn > 0) {
      assert.ok(c.age > 0,
        `${c.n} is staged at age 0 and has a fade-in, so it renders NOTHING on the dt = 0 A/B path`);
    }
    aged++;
  }
  assert.equal(aged, two.calls.length, 'did not check every staged emission');

  /* The puffs must land near their own optimum on BOTH paths; the spark provably cannot (its
     ink peaks 4 ms after birth and the live path is already 50 ms past it), so it is held to
     the weaker bar of "visible", not "optimal". */
  for (const n of ['alert_spot', 'alert_search']) {
    const c = two.calls.find((x) => x.n === n);
    const f = worstFrac(n, c.age);
    console.log(`  T8: ${n} age ${c.age}s -> ${(f * 100).toFixed(1)}% of peak ink, worst of both capture paths`);
    assert.ok(f > 0.9, `${n} at age ${c.age}s is only ${(f * 100).toFixed(1)}% of its peak on the worse path`);
  }
  const sp = two.calls.find((x) => x.n === 'alert_spot_spark');
  const spf = worstFrac('alert_spot_spark', sp.age);
  console.log(`  T8: alert_spot_spark age ${sp.age}s -> ${(spf * 100).toFixed(1)}% (its peak is 4 ms after birth; unreachable at a 50 ms latency)`);
  assert.ok(spf > 0.25, `the staged spark is at ${(spf * 100).toFixed(1)}% of peak — too dim to be the ladder's only light`);
  /* CALIBRATION: the bar must reject the naive answer. */
  assert.ok(worstFrac('alert_spot_spark', 0) < 0.25,
    'calibration failed: age 0 passes the spark visibility bar, so the bar cannot catch the dt=0 blank');

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
  /* Matched on the method NAME, not its full signature: this assertion is about which shots
     are branched on, and it must not go quietly vacuous the day an argument is added. A
     `slice(-1)` on a failed indexOf is a body of one character that passes everything. */
  const at = PARTICLES_SRC.search(/^ {2}_stageShot\(/m);
  assert.ok(at > 0, 'could not find _stageShot in Particles.js — this test is inspecting nothing');
  const src = PARTICLES_SRC.slice(at);
  const body = src.slice(0, src.indexOf('\n  }'));
  assert.ok(body.length > 200, `_stageShot body scanned as ${body.length} chars — the slice is wrong`);
  assert.ok(/name === 'alert'/.test(body), '_stageShot has no alert branch');
  for (const shot of ['hero', 'temple', 'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard', 'kaykit']) {
    const staged = (body.match(new RegExp(`name === '${shot}'`, 'g')) || []).length;
    assert.ok(staged <= 1, `"${shot}" is branched on ${staged} times — a second branch would restage it`);
  }
  assert.ok(!/name === 'alert'[\s\S]*name === 'combat'/.test(body),
    'the alert branch was inserted before combat, changing an existing shot\'s staging order');
});

test('T7: the smash mark is probed onto a real surface, never guessed onto one', () => {
  /* A decal is painted ON something. `smash()` is handed a break POINT, in the air at the
     prop's middle, so defaulting the plane to UP puts a horizontal disc in mid-air the moment a
     prop breaks against a wall — which reads as a renderer bug, not as an effect. */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const run = (opts, collision) => {
    const decals = [];
    const warns = [];
    Particles.prototype.smash.call({
      engine: { get: (k) => (k === 'collision' ? collision : null), warn: (m) => warns.push(m) },
      _emit: () => {},
      decal: (n, p, nrm, o) => decals.push({
        n, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        nrm: [+nrm.x.toFixed(2), +nrm.y.toFixed(2), +nrm.z.toFixed(2)], size: o.size,
      }),
    }, V(0, 1.4, 0), opts);
    return { decals, warns };
  };
  const floorAt = (y, nrm = V(0, 1, 0)) => ({
    raycast: () => ({ hit: true, distance: 1.4 - y, point: V(0, y, 0), normal: nrm }),
  });
  const nothingBelow = { raycast: () => ({ hit: false }) };

  /* 1. Caller names the plane -> it wins, at the break point. WORLD knows which face took it. */
  const named = run({ material: 'stone', normal: V(1, 0, 0) }, floorAt(0));
  assert.equal(named.decals.length, 1, 'a named normal did not produce a mark');
  assert.deepEqual(named.decals[0].nrm, [1, 0, 0], 'the caller\'s normal was overridden by the probe');
  assert.deepEqual(named.decals[0].p, [0, 1.4, 0], 'a named normal should mark at the break point');

  /* 2. No normal -> probe down, and take the surface's OWN position and tilt. A plinth top and
        a sloped dune both come out right; UP at the break height would not. */
  const probed = run({ material: 'stone' }, floorAt(0.35, V(0, 0.94, 0.34)));
  assert.equal(probed.decals.length, 1, 'the probe found a surface and drew no mark');
  assert.deepEqual(probed.decals[0].p, [0, 0.35, 0], 'the mark was not moved onto the surface it found');
  assert.deepEqual(probed.decals[0].nrm, [0, 0.94, 0.34], 'the mark did not take the surface tilt');

  /* 3. Nothing below -> NO mark, and one warning. This is the wall case, and the arm that
        proves the probe is not just decorating the old guess: a mid-air disc must not appear. */
  const air = run({ material: 'stone' }, nothingBelow);
  assert.equal(air.decals.length, 0, 'drew a mark with no surface under it — the mid-air disc is back');
  assert.equal(air.warns.length, 1, `expected exactly one warning, got ${air.warns.length}`);
  assert.match(air.warns[0], /normal/, 'the warning does not tell the caller what to pass');

  /* 4. …but only ONCE per session, or a shelf of jars broken over a ledge floods the log. */
  const self = {
    engine: { get: () => nothingBelow, warn() { this.n = (this.n || 0) + 1; } },
    _emit: () => {}, decal: () => {},
  };
  for (let i = 0; i < 5; i++) Particles.prototype.smash.call(self, V(0, 1.4, 0), { material: 'stone' });
  assert.equal(self.engine.n, 1, `warned ${self.engine.n} times across 5 breaks; it must warn once`);

  /* 5. No COLLISION at all (headless, early boot) -> fall back to the floor rather than dropping
        the mark. That is a world with nothing to probe, not a break in mid-air. */
  const headless = run({ material: 'stone' }, null);
  assert.equal(headless.decals.length, 1, 'dropped the mark with no collision module to ask');
  assert.deepEqual(headless.decals[0].nrm, [0, 1, 0], 'headless fallback did not use the floor plane');
  assert.equal(headless.warns.length, 0, 'warned about a missing normal when there was nothing to probe');
});

/* ══════════════════════════ T9/T10 — staging is an instrument, and instruments get checked ══
 *
 * These build REAL `Batch` objects through the shipped private factory. `Batch`'s constructor
 * is pure three.js — InstancedBufferGeometry plus ShaderMaterial, no renderer and no GL — so
 * the ring buffer under test is the one that ships rather than a model of it, and the
 * populations below are read off `_used` exactly as `commit()` does.
 */

import { BATCH_CAPACITY as CAP } from '../src/fx/Particles.js';
import { Decals } from '../src/fx/Decals.js';
import { rng as makeRng } from '../src/core/Rand.js';

const VEC = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function fxHost({ guards = 2, playerState = 'idle', velocity = VEC(9, 0, 0) } = {}) {
  const list = [{ position: VEC(3, 0, -4) }, { position: VEC(-6, 0, -8) }].slice(0, guards);
  const host = {
    engine: {
      warn: () => {}, time: 0, camera: new THREE.PerspectiveCamera(),
      get: (k) => (k === 'movement' ? { position: VEC(), faceDir: VEC(0, 0, 1), velocity, speed: 9 }
        : k === 'guards' && guards ? { list } : null),
    },
    root: new THREE.Group(),
    shared: {
      wind: { value: VEC() }, lightTint: { value: new THREE.Color() },
      ambTint: { value: new THREE.Color() }, atlas: { value: null },
      depth: { value: null }, maskPass: { value: 0 },
    },
    batches: new Map(), _t: 0, _t0: 0, rand: makeRng(1), _density: () => 1,
    stats: { spawned: 0, bursts: 0 }, _playerState: playerState,
    _updateWind: () => {}, _prerollFires: () => {}, _prerollCrests: () => {},
    sparkles: null, _motesBuilt: 0, _sparkleTimer: 0, emitters: [],
    decal(n, p, nm, o) { return this.decals.add(n, p, nm, o); },
  };
  for (const m of ['_batch', '_emit', '_clearStaged', '_stageShot', '_stageAlert', '_stageImpact',
    '_prerollContinuous', '_emitPlayerCont', '_onCaneHit', 'smash']) host[m] = Particles.prototype[m];
  host.decals = new Decals(host.engine, { atlas: null, capacity: 96 });
  for (const [name, capacity] of Object.entries(CAP)) host._batch(name, { capacity, defines: [] });
  host._batch('ambientProbe', { capacity: 460, loop: true, defines: ['LOOP'] });
  const amb = host.batches.get('ambientProbe');
  amb._used = 460; amb.geometry.instanceCount = 460;   // ambient fields are pre-populated
  return host;
}
const oneShotPop = (h) => [...h.batches].filter(([n]) => n !== 'ambientProbe')
  .reduce((a, [, b]) => a + b._used, 0) + h.decals._used;

test('T9: a second staging REPLACES the first — the capture is one population, not two', () => {
  /* Debug.js runs applyShot → step(14) → applyShot → step(3) → capture, and `_stageShot`
     rebases `_t` to 0 on BOTH calls, so the first staging's particles are re-born at the origin
     under the second's instead of aging out. Every staged effect reached the film at 2x
     coincident density, and alpha composites as 1-(1-a)^2, which is not a factor anyone can
     divide back out. */
  let inspected = 0;
  for (const shot of ['alert', 'impact', 'combat', 'traversal']) {
    const once = fxHost(); once._stageShot(shot);
    const twice = fxHost(); twice._stageShot(shot); twice._stageShot(shot);
    const a = oneShotPop(once), b = oneShotPop(twice);
    assert.ok(a > 0, `"${shot}" staged nothing at all — the test is inspecting an empty branch`);
    assert.equal(b, a, `"${shot}" staged twice holds ${b} sprites against ${a} for once — the double staging is back`);
    /* Ambient fields are GPU-resident populations with no birth event; clearing them would
       empty the air out of the very frame this is fixing. */
    assert.equal(twice.batches.get('ambientProbe')._used, 460, 'the clear ate a looping ambient field');
    inspected++;
  }
  assert.equal(inspected, 4, 'did not inspect every staged shot');

  /* CALIBRATION, and it must fire: without the clear the count has to double, or this test
     would pass just as well on a build that never had the bug. */
  const probe = fxHost();
  probe._stageShot('combat');
  const single = oneShotPop(probe);
  probe._t = 0; probe.rand = makeRng(1);
  probe._stageAlert.call(probe);            // any second staging without a clear in front of it
  assert.ok(oneShotPop(probe) > single,
    'calibration failed: staging twice without clearing did not raise the population, so the ' +
    'idempotency assertion above cannot tell a fixed build from a broken one');
});

test('T9: the impact branch stages all four dive emitters, aged so none of them is blank', () => {
  const h = fxHost(); const out = h._stageImpact();
  assert.ok(out?.point, '_stageImpact returned no position for the shot author to frame');
  assert.ok(out.radius > 0, '_stageImpact reported no radius');
  /* Four emitters across three batches plus two decals — the six catalogue entries that were
     unreachable in every canonical capture. */
  assert.ok(h.batches.get('ring')._used >= 1, 'no dive_ring: the largest sprite in the game');
  assert.ok(h.batches.get('dust')._used > 0, 'no dive_dust / dive_debris');
  assert.ok(h.batches.get('spark')._used > 0, 'no dive_spark');
  assert.equal(h.decals._used, 2, `expected the crack and the scuff, got ${h.decals._used} decals`);

  /* Every staged age must be inside the emitter's SHORTEST life, or `_emit` silently drops part
     of the burst instead of aging it; and every one must be non-zero, because at age 0 the
     shader's smoothstep(0, fadeIn, 0) is exactly zero and the sprite renders NOTHING on the
     dt = 0 capture path §195 mandates for A/B arms. */
  const ages = [];
  const rec = fxHost();
  rec._emit = (n, p, o) => { ages.push([n, o?.age ?? 0]); };
  rec._stageImpact.call(rec);
  assert.equal(ages.length, 4, `impact staged ${ages.length} emitters, expected 4`);
  for (const [n, age] of ages) {
    const d = EMITTERS[n];
    assert.ok(age > 0, `${n} staged at age 0 — it renders nothing on the dt = 0 path`);
    assert.ok(age < d.life[0], `${n} aged ${age}s past its shortest life ${d.life[0]}s`);
  }
  console.log(`  T9: impact -> ${ages.map(([n, a]) => `${n}@${a}s`).join(', ')}`);
});

test('T10: the continuous preroll reproduces the steady state, and stays inside the budget', () => {
  /* `rail_spark` and `skid_scuff` were invisible in captures not because a still cannot show
     them but because nothing back-ran them — the same gap `_prerollFires` closed for braziers.
     Steady state is `rate * meanCount * meanLife`; the preroll issues `rate * maxLife` ticks and
     lets `_emit`'s own `age >= life` guard do the mortality. */
  let inspected = 0;
  for (const [state, c] of Object.entries(CONTINUOUS)) {
    const def = EMITTERS[c.emitter];
    const expected = c.rate * meanOf(def.count) * meanOf(def.life);
    const h = fxHost({ playerState: state });
    const ticks = h._prerollContinuous();
    const live = oneShotPop(h);
    console.log(`  T10: ${state.padEnd(10)} ${ticks} ticks -> ${live} live (steady state ${expected.toFixed(1)})`);
    assert.ok(ticks > 0, `"${state}" issued no ticks`);
    assert.ok(live > 0, `"${state}" prerolled nothing — the emitter is still invisible in stills`);
    /* Within 40% of the analytic steady state: the draw is random, so this is a sanity band,
       not an equality — but a preroll that produced a third or triple the population would mean
       the tick derivation is wrong. */
    assert.ok(live > expected * 0.6 && live < expected * 1.4,
      `"${state}" prerolled ${live} against a steady state of ${expected.toFixed(1)}`);
    /* And it must fit: one population now, because T9 removed the doubling. */
    const cap = BATCH_CAPACITY[def.batch];
    assert.ok(live < cap * T2_SHARE,
      `"${state}" preroll reaches ${live}, past the ${cap * T2_SHARE} quarter-share of ${def.batch}`);
    inspected++;
  }
  assert.equal(inspected, Object.keys(CONTINUOUS).length, 'did not inspect every continuous state');

  /* A state with no continuous effect must produce nothing — the arm that proves the preroll is
     driven by the state and is not simply always firing. */
  const idle = fxHost({ playerState: 'idle' });
  assert.equal(idle._prerollContinuous(), 0, 'prerolled a state that owns no continuous emitter');
  assert.equal(oneShotPop(idle), 0, 'an idle preroll still put sprites in the frame');

  /* A stationary player is a contact effect with no contact. Same gate gameplay uses. */
  const still = fxHost({ playerState: 'railSlide', velocity: VEC(0, 0, 0) });
  still._prerollContinuous();
  assert.equal(oneShotPop(still), 0, 'prerolled a grind for a player who is not moving');
});

test('T10: a back-dated contact effect is laid along the travel, not piled at one point', () => {
  /* The difference between a stationary emitter and a moving one, and the reason
     `_prerollFires`\' approach cannot be copied verbatim: a grind\'s sparks read BECAUSE they
     trail the shoe. Spawn every back-dated tick at the player\'s current position and they knot
     up at a single point, which is the opposite of the effect. */
  const seen = [];
  const h = fxHost({ playerState: 'railSlide' });
  h._emit = (n, p, o) => seen.push({ x: p.x, age: o?.age ?? 0 });
  h._prerollContinuous.call(h);
  assert.ok(seen.length > 2, `only ${seen.length} ticks to inspect`);
  const spread = Math.max(...seen.map((s) => s.x)) - Math.min(...seen.map((s) => s.x));
  console.log(`  T10: ${seen.length} back-dated ticks span ${spread.toFixed(2)} m of travel at 9 m/s`);
  assert.ok(spread > 1.0, `back-dated ticks span only ${spread.toFixed(2)} m — they are piling up at the contact point`);
  /* And in the right direction: older ticks sit further back along +X travel, i.e. at lower x. */
  const oldest = seen.reduce((a, b) => (a.age > b.age ? a : b));
  const newest = seen.reduce((a, b) => (a.age < b.age ? a : b));
  assert.ok(oldest.x < newest.x, 'the oldest spark is ahead of the newest — the trail runs the wrong way');
});

/* ═══════════════════════════════ T11 — the re-age, and what it was not allowed to change ══ */

test('T11: every staged emission is aged past its fade-in, on both capture paths', () => {
  /* `Engine.renderFrame(0)` sets `dt = 0` and `time += 0`, so on the A/B path §195 mandates the
     FX clock never advances and a sprite staged at age 0 has `smoothstep(0, fadeIn, 0) === 0`
     — alpha exactly zero, nothing drawn. This is the census for that, across every branch. */
  const shots = ['combat', 'traversal', 'night', 'guard', 'alert', 'impact'];
  let inspected = 0, blanks = [];
  for (const shot of shots) {
    const seen = [];
    const h = fxHost();
    h._emit = (n, p, o) => seen.push([n, o?.age ?? 0]);
    h._stageShot(shot);
    assert.ok(seen.length > 0, `"${shot}" staged no emitters at all`);
    for (const [n, age] of seen) {
      const d = EMITTERS[n];
      if (!d) continue;
      if (d.fadeIn > 0 && age <= 0) blanks.push(`${shot}/${n}`);
      assert.ok(age < d.life[0],
        `${shot}: ${n} aged ${age}s, past its shortest life ${d.life[0]}s — _emit drops part of the burst`);
      inspected++;
    }
  }
  assert.ok(inspected >= 12, `only ${inspected} staged emissions inspected`);
  assert.deepEqual(blanks, [],
    `staged at age 0 with a fade-in, so they render NOTHING on the dt = 0 path: ${blanks.join(', ')}`);
  console.log(`  T11: ${inspected} staged emissions across ${shots.length} shots, none blank on either path`);
});

test('T11: the re-age moved ages and nothing else — gameplay and staging depict the same hit', () => {
  /* The condition on the re-age was "ages only: no emitter swaps, no scale changes, no
     additions". `_onCaneHit` is threaded rather than twinned precisely so this is checkable:
     the same call with and without ages must differ in the age field and in nothing else. */
  const capture = (ages) => {
    const seen = [];
    Particles.prototype._onCaneHit.call(
      { engine: { get: () => ({ position: VEC(), faceDir: VEC(0, 0, 1) }) }, _emit: (n, p, o) => seen.push({ n, ...o }) },
      3, VEC(1, 1, 1), VEC(0, 0, 1), ages,
    );
    return seen;
  };
  const play = capture(undefined);
  const staged = capture({ cane_flash: 0.001, cane_ring: 0.045, cane_spark: 0.002, cane_debris: 0.079 });

  assert.equal(staged.length, play.length, 'staging emits a different NUMBER of things than gameplay');
  assert.ok(play.length === 4, `expected the four cane emitters, got ${play.length}`);
  for (let i = 0; i < play.length; i++) {
    const a = play[i], b = staged[i];
    assert.equal(b.n, a.n, `emitter ${i} differs: gameplay "${a.n}", staged "${b.n}"`);
    for (const k of Object.keys(a)) {
      if (k === 'age') continue;
      assert.deepEqual(b[k], a[k], `${a.n}.${k} differs between gameplay and staging — this was ages only`);
    }
    assert.equal(a.age ?? 0, 0, `gameplay ${a.n} is aged; only staging may be`);
    assert.ok(b.age > 0, `staged ${b.n} is not aged`);
  }
  console.log(`  T11: 4 cane emitters, identical but for age (${staged.map((x) => x.age).join(', ')}s)`);
});

test('T11: a shot that asks for a continuous preroll and cannot get one says so', () => {
  /* The delay-fuse trap: `_prerollContinuous` gates on ground speed, so a shot that poses the
     player into a grind but leaves him at rest prerolls nothing and looks simply unstaged.
     Silent no-ops in staging are what this whole pass has been about. */
  const shotWith = (player) => ({ player });

  /* 1. Named a state that owns no continuous emitter — a typo, and it must name the valid set. */
  const typo = fxHost();
  const warns = [];
  typo.engine.warn = (m) => warns.push(m);
  typo._stageShot('hero', shotWith({ fxState: 'railSlyde' }));
  assert.equal(warns.length, 1, `expected one warning for an unknown fxState, got ${warns.length}`);
  assert.match(warns[0], /railSlyde/, 'the warning does not name the state that was asked for');
  assert.match(warns[0], /railSlide/, 'the warning does not list the valid states');

  /* 2. Valid state, but the posed player is stationary — the actual delay fuse. MUST warn. */
  const still = fxHost({ velocity: VEC(0, 0, 0) });
  const w2 = [];
  still.engine.warn = (m) => w2.push(m);
  still._stageShot('hero', shotWith({ fxState: 'railSlide' }));
  assert.equal(w2.length, 1, 'a stationary posed player asking for a grind preroll warned nothing');
  assert.match(w2[0], /1\.2 m\/s|contact gate/, 'the warning does not explain the gate that stopped it');
  assert.equal(oneShotPop(still), 0, 'prerolled a grind for a stationary player');

  /* 3. Valid state, player moving — prerolls, and stays quiet. */
  const ok = fxHost();
  const w3 = [];
  ok.engine.warn = (m) => w3.push(m);
  ok._stageShot('hero', shotWith({ fxState: 'railSlide' }));
  assert.deepEqual(w3, [], `a valid, moving preroll warned anyway: ${w3.join(' | ')}`);
  assert.ok(oneShotPop(ok) > 0, 'a valid moving preroll produced nothing');

  /* 4. A pose whose name happens to be a CONTINUOUS key is accepted without a new field. */
  const byPose = fxHost();
  byPose._stageShot('hero', shotWith({ pose: 'skid' }));
  assert.ok(oneShotPop(byPose) > 0, 'a pose named exactly like a CONTINUOUS state did not preroll');

  /* 5. A shot that says nothing stays silent and falls back to _playerState — the existing
        ten shots must not start warning. */
  const quiet = fxHost();
  const w5 = [];
  quiet.engine.warn = (m) => w5.push(m);
  for (const n of ['hero', 'temple', 'courtyard', 'combat', 'traversal']) {
    quiet._stageShot(n, { player: { pose: 'idle_confident' } });
  }
  assert.deepEqual(w5, [], `an ordinary shot now warns: ${w5.join(' | ')}`);
});

/* ════════════════════════════════ T12 — retiring an inherited constant ══
 *
 * `d = 4.906 m`, the view depth of `combat`'s impact anchor, was the one input in the
 * `cane_flash` derivation that could not be re-derived from committed source. It came from
 * PREREG-combatrecipient §0.2 and was believed to need a posed character, so it sat as a number
 * three shipped figures depended on and nobody could check.
 *
 * It does not need a posed character. `Debug.js` teleports the player to `shot.player.pos`
 * BEFORE `applyShot` emits `shot` (Debug.js:141-142, then :176), so by the time `_stageShot`
 * runs, `mv.position` IS the authored position — and the anchor is a function of committed
 * constants alone. No rig, no capture, no lock.
 */

import { SHOTS } from '../src/core/Shots.js';

test('T12: combat\'s impact depth d is derived from source, not inherited', () => {
  const shot = SHOTS.combat;
  assert.ok(shot?.player?.pos, 'SHOTS.combat no longer poses a player — the anchor is undefined');

  /* The camera exactly as `applyShot` builds it (Shots.js:552-559). */
  const cam = new THREE.PerspectiveCamera(shot.fov, 1280 / 720, 0.1, 1000);
  cam.position.fromArray(shot.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(shot.target));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  /* The anchor is taken by RUNNING the shipped branch, not by restating its arithmetic here.
     A test that re-implements the recipe is a second copy of it, and the two drift the first
     time somebody moves the 1.05 m push — which is the whole failure class this suite exists
     for. `_stageShot` emits every cane sprite at the anchor, so the first emission IS it. */
  let anchor = null;
  const host = {
    engine: { warn: () => {}, get: (k) => (k === 'movement' ? { position: new THREE.Vector3().fromArray(shot.player.pos) } : null) },
    _t: 0, _t0: 0, rand: makeRng(1), decals: { _t: 0 }, sparkles: null,
    _updateWind: () => {}, _prerollFires: () => {}, _prerollCrests: () => {},
    _prerollContinuous: () => 0, _clearStaged: () => {}, _motesBuilt: 0, _sparkleTimer: 0,
    _onCaneHit: Particles.prototype._onCaneHit,
    _stageShot: Particles.prototype._stageShot,
    _emit: (n, p) => { if (!anchor) anchor = p.clone(); },
    decal: () => {},
  };
  host._stageShot('combat');
  assert.ok(anchor, 'staging combat emitted nothing — the anchor could not be read');

  const d = -anchor.clone().applyMatrix4(cam.matrixWorldInverse).z;
  const P11 = cam.projectionMatrix.elements[5];

  console.log(`  T12: anchor (${anchor.x.toFixed(3)}, ${anchor.y.toFixed(3)}, ${anchor.z.toFixed(3)}) -> d = ${d.toFixed(4)} m, P11 = ${P11.toFixed(4)}`);

  /* The inherited value, now checkable. 1 cm of tolerance: the recorded figure carries three
     decimals, so anything inside 0.01 m is agreement rather than luck. */
  assert.ok(Math.abs(d - 4.906) < 0.01,
    `d re-derives to ${d.toFixed(4)} m against the inherited 4.906 m. That is a real difference, `
    + 'not a rounding one. All three dependent figures scale as 1/d TOGETHER, so the flashMaxH '
    + 'verdict (the flash is wider than the hero) survives either way — but the ceiling VALUE '
    + '0.45 was set at the old d and needs re-deriving at this one.');
  assert.ok(Math.abs(P11 - 2.7475) < 0.001, `P11 re-derives to ${P11.toFixed(4)}, not 2.7475`);

  /* And the three figures that depend on it, so a change to the shot's framing turns this red
     rather than silently invalidating the note in TUNE.flashMaxH. */
  const frac = (sz) => (sz * P11) / d;
  const emission = frac(EMITTERS.cane_flash.size[0] * 1.35);
  assert.ok(Math.abs(emission - 1.134) < 0.002, `emission frac ${emission.toFixed(4)}, recorded 1.1340`);

  const f = EMITTERS.cane_flash;
  const u = STAGE_LATENCY / meanOf(f.life);
  const szc = (f.size[0] + (f.size[1] - f.size[0]) * Math.pow(u, f.sizeExp)) * 1.35;
  const capture = frac(szc);
  assert.ok(Math.abs(capture - 0.9199) < 0.002, `capture frac ${capture.toFixed(4)}, recorded 0.9199`);
  /* The independent one: goldlobe1/combat.base.png measured 0.9170. Two instruments sharing no
     machinery, and the agreement is what makes d credible rather than merely self-consistent. */
  assert.ok(Math.abs(capture - 0.9170) / 0.9170 < 0.01,
    `the capture prediction ${capture.toFixed(4)} is more than 1% from the measured 0.9170`);

  console.log(`  T12: emission ${emission.toFixed(4)} (rec 1.1340) · capture ${capture.toFixed(4)} (rec 0.9199, measured 0.9170)`);
});

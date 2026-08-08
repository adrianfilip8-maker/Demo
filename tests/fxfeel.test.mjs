import test from 'node:test';
import assert from 'node:assert/strict';
import { EMITTERS, ALERT_LADDER, CONTINUOUS, PAL } from '../src/fx/Emitters.js';
import { TUNE, BATCH_CAPACITY, DENSITY_CLAMP } from '../src/fx/Particles.js';

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

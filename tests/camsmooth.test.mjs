/**
 * camsmooth.test.mjs — the framing blend's SHAPE (§744).
 *
 * The owner asked for the camera transitions to be *slightly* smoothed. The change that answers
 * it is one constant and no authored `FRAMES.tau`: `_blendFrame` runs a critically damped filter
 * at `smoothTime = tau × TUNE.frameBlendShape` instead of a first-order `ease`, so the camera's
 * velocity RAMPS into a state change instead of STEPPING at it.
 *
 * These arms hold the two halves that make that a repair rather than a preference, and they are
 * two different claims that must both survive:
 *
 *   S2  the step actually fell, measured at the screen on real driven transitions
 *   S3  and no framing's end-to-end delivery fell to pay for it
 *
 * S3 is the one with teeth. The obvious way to smooth a blend is to lengthen it, and the table
 * `FRAMES` lives in already records why that is wrong here: `land` cannot reach 47 % of itself at
 * any frame rate, a jump-apex `dive` holds 8 frames against `tau` 0.09, `air` gets 7 frames on a
 * glide hinge. Every one of those gets WORSE with a longer duration. A change that smoothed the
 * transitions by deleting framings the player currently gets would pass S2 and fail S3, which is
 * why both are here.
 *
 * ── THE INSTRUMENT IS IMPORTED, NOT COPIED (§424) ──────────────────────────────────────────
 * `tools/camjerk.mjs` is the measurement and these arms import it. A second copy of the
 * counterfactual replay living in a test file is a copy that will disagree with the tool the
 * ledger's numbers were produced by, and this project has that failure written down twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { record, rank, pool, delivery, armWith, absOf, PERC, SCREEN } from '../tools/camjerk.mjs';
import { TUNE } from '../src/player/CameraRig.js';

PERC.lin = TUNE.deadzoneH; PERC.ang = TUNE.shakeRot; PERC.fov = TUNE.shakeFov;

/* One recording of the driven routes, shared by every arm below. The trajectories are produced
   by the REAL `Controller` on the shipped level and are identical in every arm by construction —
   the camera is a passive observer here, exactly as `camdrive.test.mjs` explains, so a camera
   change cannot move the player and confound the comparison. */
let REC = null;
const recorded = async () => (REC || (REC = await record()));

/** Run one arm at a given `frameBlendShape` and hand back both measurements. */
async function measure(shape) {
  const keep = TUNE.frameBlendShape;
  TUNE.frameBlendShape = shape;
  try {
    const rec = await recorded();
    const ev = rank(rec);
    return { ev, pooled: pool(ev), del: delivery(rec),
      worst: ev[0], mean: ev.reduce((a, e) => a + e.score, 0) / ev.length };
  } finally { TUNE.frameBlendShape = keep; }
}

const CHANNELS = ['boom', 'fov', 'pivY', 'lead', 'side', 'pitch'];

/* ====================================================================== */
/* S1 — the instrument discriminates, proved by running its own controls   */
/* ====================================================================== */

test('S1: the abruptness rank moves the right way under a forced-harsh and a forced-soft framing', async () => {
  /* §439's lesson applied before any number below is quoted: an instrument built from the same
   * assumption as its subject cannot falsify it. So the rank is exercised on three framings whose
   * answer is known ahead of the run — a `roll` row whose `tau` is a cut, one whose `tau` is
   * longer than the route, and one whose channels are literally the framing it is entered FROM.
   *
   * The third is the one worth having and it is a control on the COUNTERFACTUAL, not on the ease:
   * if the pinned replay were not reproducing the unpinned run frame for frame, a framing that
   * moves nothing would still score something. It scores exactly zero.
   *
   * DOMAIN (§418.3)
   *   passes on : `tau` 0.004 — a 5.4 ms blend at a 16.7 ms frame time, i.e. a cut. Run below.
   *   fails on  : `tau` 6.0 — 36 s of blend on a 24-frame residency, so the switch moves almost
   *               nothing. Run below, and asserted to rank BELOW the shipped row, so the arm is
   *               known to be able to go down as well as up.
   *   does NOT discriminate : anything about whether 0.80 is the right SHAPE. This arm is about
   *               the measuring device. S2 and S3 are about the change. */
  const rec = await recorded();
  const SUBJ = 'roll';
  const ROLL = '  roll:       { dist: -0.40, height: -0.30, lead: 1.20, fov:  2.0, pitch:  1.0 * DEG, side: 0.00, stiff: 0.80, tau: 0.16 },';
  const IDLE = '  idle:       { dist:  0.00, height:  0.00, lead: 0.35, fov:  0.0, pitch:  0.0 * DEG, side: 0.00, stiff: 1.15, tau: 0.35 },';
  const at = (rows) => rows.find((r) => r.pair.endsWith(`-> ${SUBJ}`));

  const base = at(pool(rank(rec)));
  assert.ok(base, 'no transition into `roll` on these routes — the control has no subject');

  const arm = async (tag, row) => {
    const A = await armWith([[ROLL, row]], `s1${tag}`);
    A.TUNE.frameBlendShape = TUNE.frameBlendShape;
    return at(pool(rank(rec, A)));
  };
  const pos = await arm('p', ROLL.replace('tau: 0.16', 'tau: 0.004'));
  const neg = await arm('n', ROLL.replace('tau: 0.16', 'tau: 6.0'));
  const nul = await arm('z', IDLE.replace('idle:  ', 'roll:  '));

  console.log(`\n[S1] idle -> roll   shipped ${base.score.toFixed(3)}   cut(tau .004) ${pos.score.toFixed(3)}   `
    + `slow(tau 6.0) ${neg.score.toFixed(3)}   null(roll:=idle) ${nul.score.toExponential(2)}`);

  assert.ok(pos.score > base.score * 3,
    `a framing whose tau is 0.004 s — a cut at any frame rate — ranks ${pos.score.toFixed(3)} against the `
    + `shipped row's ${base.score.toFixed(3)}. This rank cannot see abruptness, so nothing it says elsewhere counts.`);
  assert.ok(neg.score < base.score * 0.5,
    `a framing whose tau is 6.0 s ranks ${neg.score.toFixed(3)}, not meaningfully below the shipped `
    + `${base.score.toFixed(3)} — the rank only goes up, so it is measuring something other than the blend`);
  assert.ok(nul.score < 1e-9,
    `a framing IDENTICAL to the one it is entered from scores ${nul.score.toExponential(2)} instead of 0. `
    + 'The counterfactual replay is not reproducing the unpinned run, so every attributable number is noise.');
});

/* ====================================================================== */
/* S2 — the step fell, at the screen, on real transitions                  */
/* ====================================================================== */

test('S2: the soft-start blend removes the velocity step at a state change, on every transition', async () => {
  /* Both arms replay the SAME recorded trajectories. `?cam=hardblend`'s arm is
   * `frameBlendShape = 0`, which is the shipped first-order `ease` bit-exact — so this is a
   * before/after and not a comparison against a reconstruction.
   *
   * DOMAIN (§418.3)
   *   passes on : `frameBlendShape` 0.80 — every pooled transition's step falls, run below.
   *   fails on  : `frameBlendShape` 0, which is asserted to be WORSE on the same instrument.
   *               Both directions measured on one run, so a green here is not a statement about
   *               a rank that only ever returns small numbers.
   *   does NOT discriminate : whether the remaining `air → dive` step is acceptable. It is still
   *               the worst transition by an order of magnitude after the change (143 against a
   *               next-worst 12) and this arm asserts only that it FELL. §744 records what
   *               closing it further would cost. */
  const hard = await measure(0);
  const soft = await measure(TUNE.frameBlendShape);

  console.log('\n[S2] switch-attributable velocity step, pooled by transition');
  console.log('     transition                   ease(shape 0)   shipped   change | boom mm, ease -> shipped');
  const byPair = new Map(soft.pooled.map((r) => [r.pair, r]));
  let worstRise = 0, worstRisePair = '';
  for (const h of hard.pooled) {
    const s = byPair.get(h.pair);
    if (!s) continue;
    const chg = (s.score - h.score) / h.score;
    if (chg > worstRise) { worstRise = chg; worstRisePair = h.pair; }
    console.log(`     ${h.pair.padEnd(28)} ${h.score.toFixed(2).padStart(9)} ${s.score.toFixed(2).padStart(11)} `
      + `${(100 * chg).toFixed(0).padStart(7)}% | ${h.dBoom.toFixed(1).padStart(7)} -> ${s.dBoom.toFixed(1)}`);
  }
  console.log(`[S2] worst single step ${hard.worst.score.toFixed(2)} (${hard.worst.from}->${hard.worst.to}) `
    + `-> ${soft.worst.score.toFixed(2)} (${soft.worst.from}->${soft.worst.to})   `
    + `mean over ${hard.ev.length} transitions ${hard.mean.toFixed(2)} -> ${soft.mean.toFixed(2)}`);

  assert.ok(soft.worst.score < hard.worst.score * 0.7,
    `the worst transition's velocity step went ${hard.worst.score.toFixed(2)} -> ${soft.worst.score.toFixed(2)}, `
    + 'less than a 30 % cut. The change is not buying what it was taken for.');
  assert.ok(soft.mean < hard.mean * 0.5,
    `the mean step over ${hard.ev.length} transitions went ${hard.mean.toFixed(2)} -> ${soft.mean.toFixed(2)}. `
    + 'This was supposed to be a table-wide repair, not a fix to one row.');
  /* NO transition may get harsher. A second-order filter that overshot would show up exactly
     here, on some row nobody was looking at. */
  assert.ok(worstRise <= 0.02,
    `'${worstRisePair}' got ${(100 * worstRise).toFixed(0)}% HARSHER under the soft-start blend. `
    + 'A smoothing change that makes any transition step harder is a regression wherever it helps.');
  /* And the counterfactual has to be exact or none of the above is attributable. */
  const drift = Math.max(...hard.ev.map((e) => e.drift), ...soft.ev.map((e) => e.drift));
  assert.equal(drift, 0,
    `the pinned replay diverged from the unpinned one BEFORE the switch by ${drift} m, so the `
    + '"attributable" step includes an earlier transition\'s disagreement');
});

/* ====================================================================== */
/* S3 — and nothing became less reachable to pay for it                    */
/* ====================================================================== */

test('S3: the boom ends closer to every framing in aggregate, and no row loses more than the scorer can resolve', async () => {
  /* The trap this arm exists for, stated as the arm's own claim: **a smoother blend that lowers
   * delivery has deleted framings the player currently gets.** The published table
   * (`camdrive.test.mjs` D6, and the block above `_castBoom`) is scored as
   * `(peak during the residency − value on entry) / (pinned-run value − value on entry)`,
   * absolute-weighted `Σ|got| / Σ|asked|`, and that ratio is printed below unchanged so the two
   * tables can be read against each other.
   *
   * ── BUT THE BAR IS ON THE RESIDUAL, AND THE REASON IS A MEASURED TRAP ─────────────────────
   * `asked` is the distance still to travel WHEN THE STATE BEGINS, so it is a fact about where
   * the previous blend left the camera — and two arms of a smoothing change do not agree about
   * that. On the `combo` route, where combat and idle alternate every 30 frames and the camera
   * never fully returns, the soft arm enters each combat ALREADY NEARER the combat framing:
   * per-visit spans −1.381/−0.770/−0.402/−0.558° become −1.111/−0.544/−0.316/−0.436°. `asked`
   * falls 5.95 → 5.25 and `got` falls with it, which an absolute-`got` bar reads as a 10.5 %
   * regression — **and it is the opposite of one.** The per-visit fractions are the same or
   * better and the camera is closer to the authored lens the whole time.
   *
   * So the bar is on `miss` — the CLOSEST the screen ever got to the authored framing during the
   * visit, in the channel's own unit, summed over visits. It is measured from the target rather
   * than from the entry, so it does not care where a visit started; it is ungated, so its
   * population is identical in both arms; and the reference it is measured against is the settled
   * pinned run, which is arm-invariant. It is the quantity "did this framing get less reachable"
   * actually asks about.
   *
   * DOMAIN (§418.3)
   *   passes on : `frameBlendShape` 0.80 — run below. 40 of 51 framing×channel rows end CLOSER to
   *               their framing, the boom closes by 1.03 m of 14.68 summed over nine framings, and
   *               the eleven rows that end further all do so by less than the scorer's own
   *               resolution — worst 34.8 millidegrees of lens per visit against a 0.30° threshold.
   *   fails on  : `frameBlendShape` 1.60 — the same mechanism pushed past the point where it pays
   *               for itself, asserted below to FAIL this arm's own bar on `boom`. So a green here
   *               is a measurement of the shipped value and not a bar nothing could trip. (The
   *               first value that costs anything is 0.85, where `land`'s boom ratio goes
   *               38 % → 37 %; 1.60 is used because it fails on the channel the bar is strictest
   *               on and by a margin no rounding can explain.)
   *   does NOT discriminate : any framing these routes do not reach. `hook_swing`, `rail_slide`,
   *               `balance`, `spire`, `ledge_hang`, `crawl` and `climb` produce no residency on
   *               this census and this arm is silent about all seven. */
  const hard = await measure(0);
  const soft = await measure(TUNE.frameBlendShape);

  const compare = (A, B) => {
    const rows = [];
    for (const [key, a] of A.del) {
      const b = B.del.get(key);
      if (!b) continue;
      for (const ch of CHANNELS) {
        const ca = a.ch[ch], cb = b.ch[ch];
        if (!ca || !cb || ca.visits === 0 || cb.visits === 0) continue;
        rows.push({ key, ch, visA: ca.visits, visB: cb.visits,
          pctA: 100 * absOf(ca), pctB: 100 * absOf(cb),
          askedA: ca.asked, askedB: cb.asked, missA: ca.miss, missB: cb.miss,
          dMiss: cb.miss - ca.miss });
      }
    }
    return rows;
  };

  const rows = compare(hard, soft);
  rows.sort((x, y) => y.dMiss - x.dMiss);
  console.log(`\n[S3] delivery, first-order ease -> soft start, ${rows.length} framing x channel rows`);
  console.log('     framing    ch     visits |  D6 ratio    ->        | miss (closest the screen got)');
  for (const r of rows) {
    const pa = Number.isFinite(r.pctA) ? `${r.pctA.toFixed(0)}%` : '—';
    const pb = Number.isFinite(r.pctB) ? `${r.pctB.toFixed(0)}%` : '—';
    console.log(`     ${r.key.padEnd(10)} ${r.ch.padEnd(6)} ${String(r.visA).padStart(5)}${r.visA === r.visB ? ' ' : '!'}| `
      + `${pa.padStart(8)} -> ${pb.padStart(6)}        | ${r.missA.toFixed(4).padStart(10)} -> ${r.missB.toFixed(4).padStart(10)}`);
  }
  const rose = rows.filter((r) => r.dMiss > 1e-9);
  console.log(`[S3] ${rows.length - rose.length} rows end CLOSER to their authored framing, ${rose.length} further; worst `
    + `${rose.length ? `+${rose[0].dMiss.toFixed(4)} on ${rose[0].key}.${rose[0].ch}` : 'none'}`);

  /* The population must be identical, or the two columns are not the same census. */
  for (const r of rows) {
    assert.equal(r.visA, r.visB,
      `'${r.key}'.${r.ch} was scored over ${r.visA} visits under the ease and ${r.visB} under the soft `
      + 'start — `miss` is ungated precisely so this cannot happen, so the scorer has drifted');
  }

  /* ── THE BARS, PRE-REGISTERED IN THIS ARM'S HEADER BEFORE THE ROWS WERE READ ──────────────
     Two, and the second is deliberately not "nothing got worse", because that is not what the
     measurement says and claiming it would be a worse outcome than reporting the truth:

       1. THE BOOM, IN AGGREGATE. It is the channel the §442.1 chain collapse put on screen and
          the one the complaint is about. Summed over every framing the census reaches, the
          camera must end up CLOSER to its authored boom, not further.
       2. PER ROW, AGAINST THE SCORER'S OWN RESOLUTION. Eleven of 51 rows do end marginally
          further away — `air`'s boom by 3.4 mm per visit, `air`'s lens by 18 millidegrees, and so
          on. The bar is that no row loses more than ONE `minSpan` of approach per visit, where
          `minSpan` is the threshold the published scorer already uses to decide a framing asked
          for anything at all (0.05 m of boom, 0.30° of lens, 0.08 m of lead...). A loss under the
          scorer's own resolution is not a framing anybody lost. */
  const MIN = Object.fromEntries(SCREEN);
  const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
  const boom = rows.filter((r) => r.ch === 'boom');
  console.log(`[S3] boom, summed over ${boom.length} framings: miss ${sum(boom, 'missA').toFixed(3)} m -> ${sum(boom, 'missB').toFixed(3)} m`);
  assert.ok(sum(boom, 'missB') < sum(boom, 'missA'),
    `summed over every framing, the camera ends ${sum(boom, 'missB').toFixed(3)} m short of its authored `
    + `boom under the soft-start blend against ${sum(boom, 'missA').toFixed(3)} m under the ease. The `
    + 'change costs boom delivery in aggregate, which is the one thing it was taken on the promise of not doing.');

  const perVisit = (r) => (r.missB - r.missA) / r.visA;
  const worstRow = rows.slice().sort((x, y) => perVisit(y) - perVisit(x))[0];
  console.log(`[S3] worst per-visit loss of approach: ${(1000 * perVisit(worstRow)).toFixed(1)}e-3 on `
    + `${worstRow.key}.${worstRow.ch}, against the scorer's own ${MIN[worstRow.ch]} resolution`);
  for (const r of rows) {
    assert.ok(perVisit(r) <= MIN[r.ch],
      `'${r.key}'.${r.ch} ends ${perVisit(r).toFixed(4)} per visit further from its framing than the ease `
      + `left it — more than the ${MIN[r.ch]} the scorer itself calls a framing move. `
      + `(${r.missA.toFixed(4)} -> ${r.missB.toFixed(4)} over ${r.visA} visits.)`);
  }

  /* THE FAILING INPUT, RUN (§418.9). The same mechanism at 1.60 is the version of this change
     that DOES cost delivery, and the bars above have to reject it or they are not bars. */
  const over = await measure(1.6);
  const oRows = compare(hard, over);
  const oBoom = oRows.filter((r) => r.ch === 'boom');
  const oWorst = oRows.slice().sort((x, y) => perVisit(y) - perVisit(x))[0];
  console.log(`[S3] control at frameBlendShape 1.60: boom miss ${sum(oBoom, 'missA').toFixed(3)} -> ${sum(oBoom, 'missB').toFixed(3)} m; `
    + `worst per-visit loss ${(1000 * perVisit(oWorst)).toFixed(1)}e-3 on ${oWorst.key}.${oWorst.ch} vs a ${MIN[oWorst.ch]} bar`);
  const bar1 = sum(oBoom, 'missB') >= sum(oBoom, 'missA');
  const bar2 = oRows.some((r) => perVisit(r) > MIN[r.ch]);
  assert.ok(bar1 || bar2,
    'pushed to frameBlendShape 1.60 the blend still passes both of this arm\'s bars, so neither can tell '
    + 'a change that pays for itself from one that does not, and the green above means nothing');
});

/* ====================================================================== */
/* S4 — the revert is a revert                                             */
/* ====================================================================== */

test('S4: `?cam=hardblend` is the shipped ease bit-exact, and no authored tau differs between arms', async () => {
  /* A revert token that reproduces the old feel APPROXIMATELY is not a revert. Two claims:
   *   · the token reaches `TUNE.frameBlendShape` and zeroes it;
   *   · and the arm it selects differs from the shipped one in NOTHING ELSE — every `FRAMES.tau`
   *     is byte-identical, read out of the source, because the whole argument for this change is
   *     that no duration moved.
   *
   * DOMAIN (§418.3)
   *   passes on : `__CAMBLEND_AB = 'hard'`, which is asserted to produce shape 0 in a freshly
   *               imported module.
   *   fails on  : the same import with the flag unset, asserted to produce the shipped non-zero
   *               shape — so the arm is known to be reading the flag rather than a constant. */
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const taus = [...src.matchAll(/^ {2}([a-z_]+):\s*\{[^}]*tau:\s*([\d.]+)/gm)].map((m) => `${m[1]}=${m[2]}`);
  assert.ok(taus.length >= 15, `FRAMES scan found ${taus.length} rows with a tau — the scan is broken`);
  console.log(`\n[S4] ${taus.length} authored taus, unchanged by this lane: ${taus.join(' ')}`);

  /* The published set, pinned. If a later lane retunes one it should be a deliberate act with its
     own measurement, not something that slides in under a section titled "the blend's shape". */
  assert.equal(taus.join(' '),
    'idle=0.35 sneak=0.34 crawl=0.34 hook_swing=0.30 rail_slide=0.24 balance=0.45 spire=0.50 '
    + 'dive=0.09 wall_run=0.22 ledge_hang=0.36 climb=0.34 glide=0.40 land=0.14 roll=0.16 air=0.26 combat=0.18',
    'a `FRAMES.tau` moved. §744 shipped a change to the blend\'s SHAPE on the explicit claim that '
    + 'no duration moved, and this arm is that claim.');

  const fresh = async (flag) => {
    const keep = globalThis.__CAMBLEND_AB;
    if (flag === undefined) delete globalThis.__CAMBLEND_AB; else globalThis.__CAMBLEND_AB = flag;
    try { return (await import(`../src/player/CameraRig.js?camblend=${flag}-${Math.random()}`)).TUNE.frameBlendShape; }
    finally { if (keep === undefined) delete globalThis.__CAMBLEND_AB; else globalThis.__CAMBLEND_AB = keep; }
  };
  const off = await fresh(undefined);
  const rev = await fresh('hard');
  console.log(`[S4] frameBlendShape: default ${off} · with __CAMBLEND_AB='hard' ${rev}`);
  assert.ok(off > 0, `the default build has frameBlendShape ${off} — the soft start is not shipped`);
  assert.equal(rev, 0, `\`?cam=hardblend\` left frameBlendShape at ${rev}; the revert does not revert`);
});

/* ====================================================================== */
/* S5 — a second-order blend must not ring                                 */
/* ====================================================================== */

test('S5: the framing blend never overshoots its target, at 60, 20 or 10 Hz', async () => {
  /* The risk a first-order filter does not have. A second-order blend that rang would push the
   * boom PAST the framing and pull it back — a pop introduced by a change made to remove one —
   * and a discrete second-order filter is most at risk exactly where the frame time is large
   * against the time constant, which for `dive` at `tau` 0.09 is any rate under about 30 Hz.
   *
   * Driven on the CHANNEL, not at the screen, on purpose: the screen-side boom is also moved by
   * the speed dolly, the whiskers and the ceiling probe, so a non-monotone boom would not be
   * evidence of a ringing blend. `_frame.dist` is the blend's own output.
   *
   * DOMAIN (§418.3)
   *   passes on : 24 ordered pairs of real framings at 60 and 20 Hz, plus 10 Hz on the shortest
   *               `tau` in the table. Worst overshoot measured at exactly 0.
   *   fails on  : the SAME drive against a copy of the rig with `smoothDamp`'s overshoot clamp
   *               removed and the blend handed a velocity past its target — run below, and it
   *               rings by 1.7 m. The shipped arm handed the identical velocity reads exactly 0,
   *               which is the point: the clamp is what makes the guarantee, and this arm is what
   *               says so out loud rather than trusting a comment.
   *   does NOT discriminate : anything about the screen. A monotone channel can still arrive at a
   *               boom that is not monotone, because three later stages touch it. */
  const { CameraRig } = await import('../src/player/CameraRig.js');
  const THREE = await import('three');
  const OPEN_SKY = { ready: true, raycast: () => null, capsuleSweep: () => null, query: () => [], overlap: () => [] };

  /** Settle in `fromState`, switch to `toState`, and report how far past the target it went. */
  const overshootOf = (Rig, fromState, toState, dt, kickMag) => {
    const movement = { position: new THREE.Vector3(), velocity: new THREE.Vector3(),
      grounded: true, stateName: fromState, yaw: Math.PI };
    const engine = { input: { look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, zoom: 0, pressed: () => false, down: () => false },
      camera: new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 2000), scene: new THREE.Scene(), movement,
      collision: OPEN_SKY, time: 0, dt, timeScale: 1, width: 1920, height: 1080, quality: 'high',
      debug: { freeCam: false }, warn() {}, has() { return false; }, on() { return () => {}; }, emit() {},
      get(n) { return n === 'movement' ? movement : n === 'collision' ? OPEN_SKY : null; } };
    const rig = new Rig(engine); rig.init?.();
    const trail = [];
    const run = (n, t0, keep) => { for (let i = 0; i < n; i++) { engine.dt = dt; engine.time = (t0 + i) * dt; rig.update(dt); if (keep) trail.push(rig._frame.dist); } };
    run(Math.ceil(4 / dt), 0, false);            // 4 s: settled in `fromState` at any rate
    const start = rig._frame.dist;
    movement.stateName = toState;
    run(1, 1000, true);                          // one frame in, so the blend is mid-flight
    if (kickMag) rig._frameVel.dist = kickMag;
    run(Math.ceil(4 / dt), 1001, true);
    const target = rig._frame.dist;
    const dir = Math.sign(target - start) || 1;
    let over = 0;
    for (const d of trail) over = Math.max(over, dir * (d - target));
    return over;
  };

  /* Every ordered pair selects two DIFFERENT framings through the real state resolver — the state
     namespace, not the clip one (see `STATE_FRAME`), so `railWalk` really does reach `balance` and
     `ledgeHang` really does reach `ledge_hang`. */
  const PAIRS = [['idle', 'dive'], ['dive', 'idle'], ['fall', 'sneak'], ['sneak', 'fall'],
    ['idle', 'combatStrafe'], ['combatStrafe', 'idle'], ['paraglide', 'roll'], ['roll', 'paraglide'],
    ['ledgeHang', 'railWalk'], ['railWalk', 'ledgeHang'], ['wallRun', 'land'], ['land', 'wallRun']];

  let worst = 0, worstPair = '';
  for (const hz of [60, 20]) {
    for (const [a, b] of PAIRS) {
      const o = overshootOf(CameraRig, a, b, 1 / hz, 0);
      if (o > worst) { worst = o; worstPair = `${a}->${b} @${hz}Hz`; }
    }
  }
  const slow = overshootOf(CameraRig, 'idle', 'dive', 1 / 10, 0);
  if (slow > worst) { worst = slow; worstPair = 'idle->dive @10Hz'; }
  console.log(`\n[S5] worst overshoot past the authored framing over ${2 * PAIRS.length + 1} drives `
    + `at 60, 20 and 10 Hz: ${worst.toExponential(2)} m${worstPair ? ` on ${worstPair}` : ''}`);
  assert.ok(worst < 1e-9,
    `the framing blend overshoots its own target by ${worst.toExponential(2)} m on ${worstPair}. `
    + 'A ringing blend is a new pop introduced by a change made to remove one.');

  /* THE FAILING INPUT, RUN (§418.9). `smoothDamp`'s last line is what guarantees the zero above;
     a copy without it, handed the same velocity, rings — so this arm can see ringing. */
  const CLAMP = '  if ((tgt - cur > 0) === (out > tgt)) { out = tgt; _sdVel = 0; }';
  const RUNG = await armWith([[CLAMP, '  /* S5 control: the overshoot clamp removed on purpose */']], 's5');
  const shipKick = overshootOf(CameraRig, 'idle', 'dive', 1 / 20, -200);
  const rungKick = overshootOf(RUNG.CameraRig, 'idle', 'dive', 1 / 20, -200);
  console.log(`[S5] control, the same drive handed -200 m/s at 20 Hz: shipped ${shipKick.toExponential(2)} m, `
    + `clamp removed ${rungKick.toFixed(3)} m`);
  assert.ok(rungKick > 0.5,
    `with \`smoothDamp\`'s overshoot clamp removed the blend still only rings ${rungKick.toFixed(4)} m, so this `
    + 'arm cannot see ringing and its zero above is a statement about nothing');
  assert.ok(shipKick < 1e-9,
    `the shipped blend handed the same -200 m/s rings ${shipKick.toExponential(2)} m`);
});

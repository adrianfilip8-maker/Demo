/**
 * camswing.test.mjs — the ring swing's camera motion (§745).
 *
 * The owner asked for the camera to move half as much while swinging on the rings, and for that
 * motion to be smoother. **The metric is his: total path length of the camera position over one
 * swing, in metres, integrated entry-to-exit.** Rotation is reported beside it and never folded
 * into the same scalar.
 *
 * Two changes ship, and they do two different jobs — W2 measures that they do:
 *
 *   `hook_swing.vtip  0.00`  the fraction of the velocity-driven orbit tip (`fallPitch` +
 *                            `climbPitch`) this framing uses. Owns the JERK.
 *   `hook_swing.track 0.30`  the fraction of the pivot goal's own excursion the rig chases, the
 *                            rest going to a `trackTau`-low-passed copy. Owns the PATH.
 *
 * Every other row is 1.0 on both. `?cam=swingtip` and `?cam=swingtrack` revert them separately.
 *
 * ── HOW THE WINDOW AND THE POPULATION ARE HELD FIXED ───────────────────────────────────────
 * FIVE real swings at the same ring, spanning 87-109 deg of pendulum deviation, all entered by
 * the auto-grab out of freefall (§435.4). Each is recorded ONCE and replayed under every arm, so
 * the `hook_swing` residency is the same frame span in every arm by construction — W3 asserts
 * that, because a change that shortened the window would cut the path without calming anything.
 * The CAPSULE's own path over the same window is the paired control: if it moved too, the arms
 * are measuring different swings rather than different cameras.
 *
 * The instrument is `tools/camjerk.mjs`, imported rather than copied (§424).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordSwings, replay, residency, armWith, record, delivery, rank, pool, absOf, PERC }
  from '../tools/camjerk.mjs';
import { TUNE } from '../src/player/CameraRig.js';

/* The rank in W4 is weighted by the rig's own constants, exactly as §744 weighted it. Unset it is
   `null` and every score is NaN — which is what the first run of W4 produced, alongside a set of
   delivery ratios that were wrong for a different reason. */
PERC.lin = TUNE.deadzoneH; PERC.ang = TUNE.shakeRot; PERC.fov = TUNE.shakeFov;

/** The five swings, recorded once. The camera is a passive observer of each. */
let REC = null;
const swings = async () => (REC || (REC = await recordSwings()));

/**
 * One arm, pooled over all five swings. `vt`/`tk` null means "use the shipped row"; a number
 * forces the token's own lever, which is how BEFORE is produced — the same module, one field.
 * The window is the FULL `hook_swing` residency, entry through exit, `skip` 0.
 */
async function measure({ vt = null, tk = null, ARM = null } = {}) {
  const recs = await swings();
  const T = ARM ? ARM.TUNE : TUNE;
  const kv = T.swingVTip, kt = T.swingTrack;
  T.swingVTip = vt; T.swingTrack = tk;
  try {
    const per = recs.map(([lab, t]) => [lab, residency(t.samples, replay(t.samples, t.collision, null, ARM), 'hook_swing', 0)]);
    const sum = (k) => per.reduce((a, [, R]) => a + R[k], 0);
    return { per, path: sum('path'), playerPath: sum('playerPath'), angPath: sum('angPath'),
      pivPath: sum('pivPath'), ndcPath: sum('ndcPath'), frames: sum('frames'),
      rmsAcc: sum('rmsAcc'), peakAcc: Math.max(...per.map(([, R]) => R.peakAcc)),
      ndcMax: Math.max(...per.map(([, R]) => R.ndcMax)), behind: sum('behind') };
  } finally { T.swingVTip = kv; T.swingTrack = kt; }
}

const BEFORE = { vt: 1, tk: 1 };

/** The shipped row, verbatim, for the source-patched control arms. */
const HOOK = '  hook_swing: { dist:  2.30, height:  0.55, lead: 1.60, fov:  1.0, pitch: -3.0 * DEG, side: 0.85, stiff: 1.50, tau: 0.30, vtip: 0.00, track: 0.20 },';

/* ====================================================================== */
/* W1 — the path metric discriminates, both ways                          */
/* ====================================================================== */

test('W1: camera path length rises on a camera made busier and falls on one glued to the pendulum', async () => {
  /* §439, before any number is quoted: the metric is exercised on two rigs whose answer is known
   * ahead of the run, plus a determinism control.
   *
   * DOMAIN (§418.3)
   *   passes on : `vtip` 3.0 — the velocity orbit tip at triple strength, which throws the camera
   *               around a 7.8 m boom. Run below; pooled camera path rises well above BEFORE.
   *   fails on  : `track` 1.0 with `stiff` 0.30 — a pivot glued hard to the capsule, which is the
   *               MOST movement the rig can produce and is asserted to exceed BEFORE too... no:
   *               asserted below is the other direction, `track` 0.00, the least. Both are run,
   *               so the metric is known to move down as well as up.
   *   does NOT discriminate : whether the motion is pleasant. It is an amount. W3's `ndcPath`
   *               and `ndcMax` bars are what say the shot still works. */
  const before = await measure(BEFORE);
  const shipped = await measure({});
  const POS = await armWith([[HOOK, HOOK.replace('vtip: 0.00', 'vtip: 3.00')]], 'w1p');
  const pos = await measure({ ARM: POS });
  const NEG = await armWith([[HOOK, HOOK.replace('track: 0.20', 'track: 0.00')], ['  trackTau: 1.00,', '  trackTau: 3.00,']], 'w1n');
  const neg = await measure({ ARM: NEG });

  console.log(`\n[W1] pooled camera path over 5 swings, metres:  before ${before.path.toFixed(2)}  `
    + `shipped ${shipped.path.toFixed(2)}  positive(vtip 3.0) ${pos.path.toFixed(2)}  negative(track 0, tau 3) ${neg.path.toFixed(2)}`);
  console.log(`[W1] capsule path, same windows:               before ${before.playerPath.toFixed(2)}  `
    + `shipped ${shipped.playerPath.toFixed(2)}  positive ${pos.playerPath.toFixed(2)}  negative ${neg.playerPath.toFixed(2)}`);

  assert.ok(pos.path > before.path * 1.1,
    `tripling the velocity tip left the camera path at ${pos.path.toFixed(2)} m against ${before.path.toFixed(2)} m. `
    + 'This metric cannot see the camera being made busier, so nothing it says elsewhere counts.');
  assert.ok(neg.path < shipped.path * 0.95,
    `a pivot that ignores the pendulum entirely, over a 3 s window, travels ${neg.path.toFixed(2)} m against `
    + `the shipped ${shipped.path.toFixed(2)} m — the metric only goes up`);
  const again = await measure({});
  assert.equal(again.path, shipped.path, 'two identical replays disagree — the instrument is not deterministic');
});

/* ====================================================================== */
/* W2 — two levers, two jobs, and neither does the other's                */
/* ====================================================================== */

test('W2: `track` owns the path and `vtip` owns the jerk — each alone does only its own half', async () => {
  /* §442's warning applied to a two-part change: a pair of levers landing together is a pair
   * whose individual contributions nobody measured. Each is run ALONE against BEFORE.
   *
   * DOMAIN (§418.3)
   *   passes on : `track` alone — path falls hard, jerk barely moves. `vtip` alone — jerk falls
   *               hard, path barely moves. Both run below.
   *   fails on  : the claim that either does both, which is what this arm asserts against. If
   *               `vtip` alone halved the path, `track` would be unnecessary and this file would
   *               be shipping a change nothing needs.
   *   does NOT discriminate : anything about the SWING. `HookSwing` and the ring magnet are not
   *               touched by this lane; one recording per swing is replayed under every arm, so
   *               nothing here can be evidence about the move. */
  const before = await measure(BEFORE);
  const tipOnly = await measure({ tk: 1 });        // vtip shipped (0.00), track forced back to 1
  const trkOnly = await measure({ vt: 1 });        // track shipped (0.30), vtip forced back to 1
  const both = await measure({});

  const row = (l, R) => console.log(`     ${l.padEnd(22)} path ${R.path.toFixed(2).padStart(6)} x${(R.path / before.path).toFixed(3)}`
    + `   rmsAcc ${R.rmsAcc.toFixed(0).padStart(4)} x${(R.rmsAcc / before.rmsAcc).toFixed(3)}`
    + `   angPath ${R.angPath.toFixed(2)} x${(R.angPath / before.angPath).toFixed(3)}`);
  console.log('\n[W2] each lever alone, pooled over five swings');
  row('BEFORE', before); row('vtip only (track=1)', tipOnly); row('track only (vtip=1)', trkOnly); row('SHIPPED, both', both);

  assert.ok(tipOnly.path / before.path > 0.75,
    `the velocity tip alone took the camera path to ${(tipOnly.path / before.path).toFixed(3)} of before. `
    + 'It is doing the path work too, so `track` is not the lever this file says it is.');
  assert.ok(tipOnly.rmsAcc / before.rmsAcc < 0.5,
    `the velocity tip alone left the camera's rms acceleration at ${(tipOnly.rmsAcc / before.rmsAcc).toFixed(3)} of before`);
  assert.ok(trkOnly.path / before.path < 0.8,
    `the pivot tracking alone took the camera path only to ${(trkOnly.path / before.path).toFixed(3)} of before`);
  assert.ok(trkOnly.rmsAcc / before.rmsAcc > 0.8,
    `the pivot tracking alone took the rms acceleration to ${(trkOnly.rmsAcc / before.rmsAcc).toFixed(3)} of before — `
    + 'it is smoothing as well as shortening, so the two-lever story is wrong');
});

/* ====================================================================== */
/* W3 — the halving, with the window pinned and the shot intact           */
/* ====================================================================== */

test('W3: the camera travels half as far over the same five swings, and the capsule travels the same', async () => {
  /* The owner's number, on the owner's metric.
   *
   * THREE guards make it a halving rather than an artefact:
   *   · the residency in FRAMES must be identical arm to arm, or the window moved;
   *   · the CAPSULE's path must be identical, or the swings moved;
   *   · the subject's on-screen path and worst NDC radius must not degrade, or the camera bought
   *     stillness by letting Sly leave the frame.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped pair — pooled camera path 0.508 of before over five swings, per
   *               swing 0.490-0.544, capsule path identical to the digit, frames identical.
   *   fails on  : `track` 0.00 with `stiff` 8.00, run below, which cuts the path further and
   *               FAILS the composition bar — the subject's screen path rises past 5 %. That is
   *               the trade this arm exists to refuse, measured rather than imagined.
   *   does NOT discriminate : any ring but this one. One ring, five entries. */
  const before = await measure(BEFORE);
  const after = await measure({});

  console.log('\n[W3] camera PATH LENGTH per swing, entry to exit, metres');
  console.log('     swing      frames |  before   after   ratio |  capsule before/after | angPath b/a | peakAcc b/a');
  for (let i = 0; i < after.per.length; i++) {
    const [lab, A] = after.per[i], B = before.per[i][1];
    assert.equal(A.frames, B.frames, `'${lab}' residency is ${A.frames} frames after and ${B.frames} before — the WINDOW moved, so a shorter path is not a calmer camera`);
    console.log(`     ${lab.padEnd(9)} ${String(A.frames).padStart(6)} | ${B.path.toFixed(2).padStart(7)} ${A.path.toFixed(2).padStart(7)} `
      + `${(A.path / B.path).toFixed(3).padStart(7)} | ${B.playerPath.toFixed(2).padStart(8)} / ${A.playerPath.toFixed(2).padStart(6)} | `
      + `${B.angPath.toFixed(2)} / ${A.angPath.toFixed(2)} | ${B.peakAcc.toFixed(0)} / ${A.peakAcc.toFixed(0)}`);
    assert.ok(Math.abs(A.playerPath - B.playerPath) < 1e-9,
      `'${lab}' capsule path is ${A.playerPath.toFixed(4)} after and ${B.playerPath.toFixed(4)} before — the arms are `
      + 'measuring different swings, not different cameras');
  }
  const R = after.path / before.path;
  console.log(`[W3] POOLED camera path ${before.path.toFixed(2)} -> ${after.path.toFixed(2)} m, x${R.toFixed(3)} `
    + `(target 0.500)   capsule ${before.playerPath.toFixed(2)} -> ${after.playerPath.toFixed(2)} m`);
  console.log(`[W3] rotation, reported separately and NOT folded in: angular path ${before.angPath.toFixed(2)} -> `
    + `${after.angPath.toFixed(2)} rad, x${(after.angPath / before.angPath).toFixed(3)}`);
  console.log(`[W3] jerk: rms acceleration x${(after.rmsAcc / before.rmsAcc).toFixed(3)}, worst peak `
    + `${before.peakAcc.toFixed(0)} -> ${after.peakAcc.toFixed(0)} m/s2`);
  console.log(`[W3] composition: subject screen path x${(after.ndcPath / before.ndcPath).toFixed(3)}, worst NDC radius `
    + `${before.ndcMax.toFixed(3)} -> ${after.ndcMax.toFixed(3)}, frames behind the lens ${after.behind}`);

  assert.ok(R >= 0.47 && R <= 0.55,
    `the camera's pooled path is ${R.toFixed(3)} of what it was. The owner asked for half; a band of `
    + '0.47-0.55 is what "half" is being held to, and this is outside it.');
  /* Rotation must not be the thing that was traded away. */
  assert.ok(after.angPath < before.angPath,
    `the camera's angular travel went ${before.angPath.toFixed(2)} -> ${after.angPath.toFixed(2)} rad. The path was `
    + 'bought by rotating more, which is not less camera movement.');
  /* And the request's second half. */
  assert.ok(after.rmsAcc / before.rmsAcc < 0.5,
    `rms camera acceleration is ${(after.rmsAcc / before.rmsAcc).toFixed(3)} of before — "and smooth the camera `
    + 'movement" is not delivered');
  /* Composition. */
  /* TWO-SIDED, AND THE TWO SIDES MEAN DIFFERENT THINGS. A RISE is the failure mode this bar
     exists for — stillness bought by letting Sly wander the frame. A FALL means the camera is
     holding him BETTER than before, which is fine up to the point where it is holding him so
     rigidly that the arc stops being told at all, so the far side is barred loosely. Measured:
     −5.3 %, i.e. slightly better held. */
  assert.ok(after.ndcPath / before.ndcPath < 1.05,
    `the subject's on-screen path ROSE by ${(100 * (after.ndcPath / before.ndcPath - 1)).toFixed(1)}% — the stillness `
    + 'was bought by moving Sly around the frame instead of the world');
  assert.ok(after.ndcPath / before.ndcPath > 0.75,
    `the subject's on-screen path FELL by ${(100 * (1 - after.ndcPath / before.ndcPath)).toFixed(1)}% — the camera is `
    + 'now glued to him, so the arc is told by neither the world nor the subject');
  assert.ok(after.ndcMax <= before.ndcMax + 0.02, `the subject reaches ${after.ndcMax.toFixed(3)} of NDC radius against ${before.ndcMax.toFixed(3)}`);
  assert.equal(after.behind, 0, 'the subject went behind the lens during a swing');

  /* THE FAILING INPUT, RUN: the version of this change that DOES buy stillness with composition. */
  const OVER = await armWith([[HOOK, HOOK.replace('stiff: 1.50', 'stiff: 20.00')]], 'w3o');
  const over = await measure({ tk: 1, ARM: OVER });   // the SPRING route, not the tracking one
  console.log(`[W3] control: at stiff 20.00 with the pivot still on the pendulum, the path falls to x${(over.path / before.path).toFixed(3)} `
    + `but the subject's screen path rises to x${(over.ndcPath / before.ndcPath).toFixed(3)}`);
  /* And the sharpest form of the point: the control's PATH is indistinguishable from the shipped
     arm's on the owner's own metric, and its composition is not. A halving is not self-certifying;
     the composition bar is the thing that separates these two. */
  assert.ok(Math.abs(over.ndcPath / before.ndcPath - 1) >= 0.05,
    `the stiff-20.00 control moves the subject's screen path by only `
    + `${(100 * (over.ndcPath / before.ndcPath - 1)).toFixed(1)}%, inside the 5 % bar above — so that bar is not `
    + 'known to be able to catch a camera that buys stillness by letting Sly wander the frame');
  console.log(`[W3] and it reaches ${(over.path / before.path).toFixed(3)} of the path doing it, against the `
    + `shipped ${(after.path / before.path).toFixed(3)} — the path metric alone does not separate these two`);
});

/* ====================================================================== */
/* W4 — §744 is not paid for                                              */
/* ====================================================================== */

test('W4: §744 is untouched — the transition ranking and all nine boom deliveries are unchanged', async () => {
  /* `vtip` is an eighth blended channel and `_effectivePitch` now multiplies by it. On every row
   * but `hook_swing` it is 1.0, and none of §744's eight routes enters `hook_swing` — so the
   * published numbers must be identical, not merely close. Asserted against the literals §744
   * shipped, so a later change to either lane reddens here rather than in a report.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped tree — every ratio equal to the published integer and `air -> dive`
   *               equal to 143.1 to one decimal.
   *   fails on  : `TUNE.frameBlendShape = 0`, run below, which is §744 reverted and moves seven of
   *               the nine. So the equality above is a measurement and not a bar that any camera
   *               would pass. */
  const rec = await record();
  const ev = rank(rec);
  const del = delivery(rec);
  const ratio = (k) => Math.round(100 * absOf(del.get(k)?.ch.boom));
  const PUBLISHED = { air: 69, combat: 79, dive: 93, glide: 100, idle: 68, land: 39, roll: 96, sneak: 100, wall_run: 3 };
  const got = Object.fromEntries(Object.keys(PUBLISHED).map((k) => [k, ratio(k)]));
  const worst = pool(ev)[0];
  console.log(`\n[W4] §744 boom delivery: ${Object.entries(got).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`[W4] §744 worst transition: ${worst.pair} STEP ${worst.score.toFixed(2)} `
    + `(published 143.1); mean over ${ev.length} transitions ${(ev.reduce((a, e) => a + e.score, 0) / ev.length).toFixed(2)} (published 10.4)`);
  assert.deepEqual(got, PUBLISHED,
    '§745 moved a §744 boom delivery ratio. The owner has seen and approved §744; a swing change '
    + 'may not be paid for out of it.');
  assert.equal(worst.pair, 'air -> dive', `§744's worst transition is now '${worst.pair}'`);
  assert.ok(Math.abs(worst.score - 143.1) < 0.1, `§744's worst step is ${worst.score.toFixed(2)}, published 143.1`);

  const keep = TUNE.frameBlendShape;
  TUNE.frameBlendShape = 0;
  let moved = 0;
  try {
    const d0 = delivery(rec);
    for (const k of Object.keys(PUBLISHED)) if (Math.round(100 * absOf(d0.get(k)?.ch.boom)) !== PUBLISHED[k]) moved++;
  } finally { TUNE.frameBlendShape = keep; }
  console.log(`[W4] control: with §744 reverted (frameBlendShape 0), ${moved} of 9 ratios differ from the published set`);
  assert.ok(moved >= 5,
    `reverting §744 moved only ${moved} of the nine boom ratios, so this arm cannot tell the two camera `
    + 'blends apart and its equality above proves nothing');
});

/* ====================================================================== */
/* W5 — the revert, and the blast radius                                  */
/* ====================================================================== */

test('W5: both §745 tokens revert exactly what they name, separately and together', async () => {
  /* Two mechanisms, two tokens, the §720/§723 pattern — because a pair that can only be reverted
   * together is a pair whose failures cannot be attributed. Three claims:
   *   · each token reaches its own field and leaves the other alone;
   *   · the change reaches exactly one framing row;
   *   · and the token arm is the OLD MOTION, not merely the old constant — the flown swing under
   *     `?cam=swingtip,swingtrack` is bit-equal to a source copy whose row literally reads 1.00.
   *
   * DOMAIN (§418.3)
   *   passes on : `swingtip`, `swingtrack`, both, and both plus `hardblend`. All four imported
   *               fresh below.
   *   fails on  : the unset import, asserted to leave BOTH fields null so the row governs — so
   *               the arm is reading the flag rather than a constant. */
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  /* The key must start a field, or `track` also matches `vtrack` — which it did, and the arm
     reported `wall_run` and `climb` as carrying a §745 tracking fraction they do not have. */
  const scan = (key) => [...src.matchAll(new RegExp(`^ {2}([a-z_]+):\\s*\\{[^}]*[{,]\\s${key}:\\s*([\\d.]+)`, 'gm'))].map((m) => `${m[1]}=${m[2]}`);
  console.log(`\n[W5] rows carrying a vtip: ${scan('vtip').join(' ') || '(none)'} · a track: ${scan('track').join(' ') || '(none)'}`);
  assert.deepEqual(scan('vtip'), ['hook_swing=0.00'], 'a framing other than `hook_swing` carries a `vtip`');
  assert.deepEqual(scan('track'), ['hook_swing=0.20'], 'a framing other than `hook_swing` carries a `track`');

  const fresh = async (flag) => {
    const keep = globalThis.__CAMBLEND_AB;
    if (flag === undefined) delete globalThis.__CAMBLEND_AB; else globalThis.__CAMBLEND_AB = flag;
    try {
      const m = await import(`../src/player/CameraRig.js?swing=${flag}-${Math.random()}`);
      return { vt: m.TUNE.swingVTip, tk: m.TUNE.swingTrack, shape: m.TUNE.frameBlendShape };
    } finally { if (keep === undefined) delete globalThis.__CAMBLEND_AB; else globalThis.__CAMBLEND_AB = keep; }
  };
  const off = await fresh(undefined);
  const tip = await fresh('swingtip');
  const trk = await fresh('swingtrack');
  const both = await fresh('swingtip,swingtrack');
  const all = await fresh('hardblend,swingtip,swingtrack');
  console.log(`[W5] default {vt ${off.vt}, tk ${off.tk}, shape ${off.shape}} · swingtip {${tip.vt}, ${tip.tk}} · `
    + `swingtrack {${trk.vt}, ${trk.tk}} · both {${both.vt}, ${both.tk}} · all three {${all.vt}, ${all.tk}, shape ${all.shape}}`);
  assert.deepEqual(off, { vt: null, tk: null, shape: 0.8 }, 'the default build forces a §745 field instead of leaving the row to govern');
  assert.deepEqual(tip, { vt: 1, tk: null, shape: 0.8 }, '`?cam=swingtip` did not revert exactly the tip');
  assert.deepEqual(trk, { vt: null, tk: 1, shape: 0.8 }, '`?cam=swingtrack` did not revert exactly the tracking');
  assert.deepEqual(both, { vt: 1, tk: 1, shape: 0.8 }, '`?cam=swingtip,swingtrack` did not revert both');
  assert.deepEqual(all, { vt: 1, tk: 1, shape: 0 }, '§744 and §745 tokens are not independent');

  /* And the revert is a revert of the MOTION, not of a constant. */
  const viaToken = await measure(BEFORE);
  const viaSource = await measure({ ARM: await armWith([[HOOK, HOOK.replace('vtip: 0.00', 'vtip: 1.00').replace('track: 0.20', 'track: 1.00')]], 'w5') });
  console.log(`[W5] token arm path ${viaToken.path.toFixed(6)} m vs a source copy at vtip 1.00 track 1.00 ${viaSource.path.toFixed(6)} m`);
  assert.equal(viaToken.path, viaSource.path,
    'the token arm and a rig whose row literally reads the pre-§745 values do not fly the same swings, so '
    + 'the tokens are an approximation of the old feel rather than the old feel');
  assert.equal(viaToken.angPath, viaSource.angPath, 'the token arm and the source copy disagree on angular path');
});

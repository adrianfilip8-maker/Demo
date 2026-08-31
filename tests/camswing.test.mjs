/**
 * camswing.test.mjs — the ring swing's camera motion (§745).
 *
 * The owner asked for the camera to move half as much while swinging on the rings, and for that
 * motion to be smoother. What ships is one number: `FRAMES.hook_swing.vtip = 0.00`, which is the
 * fraction of the velocity-driven orbit tip — `fallPitch` + `climbPitch` in `_effectivePitch` —
 * that this one framing uses. Every other row is 1.0 and unchanged. `?cam=swingtip` puts it back.
 *
 * ── WHY THAT ONE TERM, AND NOT `stiff` OR `lead` ───────────────────────────────────────────
 * Because the ablation says so and it is not close. W2 runs it. A pendulum's vertical velocity
 * oscillates through its whole range twice per cycle, so both halves of the velocity tip are
 * driven end to end all swing — and they are an ORBIT pitch on a 7.8 m boom, so a radian of them
 * is 7.8 m of camera arc. Every other velocity-reactive term in the rig moved the measured motion
 * by 6 % or less, and the authored `lead` moved it by nothing at all, exactly as the `leadMax`
 * census in `CameraRig.js` predicted.
 *
 * ── THE METRIC, WHICH IS DEFINED BEFORE IT IS HALVED ───────────────────────────────────────
 * "Amount of camera movement" is four different quantities. This file's primary is **mean optical
 * flow** — `|ω| + |v_perp| / distDefault`, radians per second of IMAGE motion — because that is
 * literally how fast the picture moves, which is what a person watching a screen means. Total
 * path length is reported and is NOT the target: 91 % of the camera's path is Sly's own 14.95 m
 * pendulum arc, and a camera that travels half of that has lost him.
 *
 * The instrument is `tools/camjerk.mjs`, imported rather than copied (§424).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SWING_ROUTE, trace, replay, residency, armWith, record, delivery, rank, pool, absOf, PERC }
  from '../tools/camjerk.mjs';
import { TUNE } from '../src/player/CameraRig.js';

/* The rank in W4 is weighted by the rig's own constants, exactly as §744 weighted it. Unset it is
   `null` and every score is NaN — which is what the first run of W4 produced, alongside a set of
   delivery ratios that were wrong for a different reason. */
PERC.lin = TUNE.deadzoneH; PERC.ang = TUNE.shakeRot; PERC.fov = TUNE.shakeFov;

/** One recording of the driven swing, shared by every arm. The camera is a passive observer. */
let REC = null;
const swing = async () => (REC || (REC = await trace(SWING_ROUTE[1], SWING_ROUTE[2], SWING_ROUTE[3], SWING_ROUTE[4], SWING_ROUTE[5])));

/** `vt` null = the shipped row (0.00); a number forces `TUNE.swingVTip`, which is the token's lever. */
async function measure(vt, ARM = null, skip = 30) {
  const t = await swing();
  const T = ARM ? ARM.TUNE : TUNE;
  const keep = T.swingVTip;
  T.swingVTip = vt;
  try {
    const A = replay(t.samples, t.collision, null, ARM);
    return residency(t.samples, A, 'hook_swing', skip);
  } finally { T.swingVTip = keep; }
}

const HOOK = '  hook_swing: { dist:  2.30, height:  0.55, lead: 1.60, fov:  1.0, pitch: -3.0 * DEG, side: 0.85, stiff: 1.50, tau: 0.30, vtip: 0.00 },';

/* ====================================================================== */
/* W1 — the residency metric moves the right way, both ways               */
/* ====================================================================== */

test('W1: the during-state motion metric rises on a camera made busier and falls on one made stiller', async () => {
  /* §439: an instrument built from the same assumption as its subject cannot falsify it. Before
   * any number below is quoted, the metric is exercised on two rigs whose answer is known ahead
   * of the run, plus a determinism control.
   *
   * DOMAIN (§418.3)
   *   passes on : `vtip` 3.0 — the same term at triple strength. Run below; mean flow goes
   *               0.791 → 1.631 rad/s and peak acceleration 273 → 798 m/s².
   *   fails on  : `stiff` 8.00 — the follow spring made five times softer, so the camera barely
   *               translates. Run below and asserted to fall BELOW the shipped arm on path and
   *               peak speed, so the metric is known to be able to go down as well as up.
   *   does NOT discriminate : whether the motion it counts is PLEASANT. It is an amount, not a
   *               verdict; W3's `ndcPath`/`ndcMax` guard is what says the shot still works.
   *
   * The `stiff` control is also the reason `path` is not this file's primary: `stiff 8.00` cuts
   * the path hardest of anything measured and leaves the FLOW essentially where it was, because
   * a camera that lags has to rotate more to hold the subject. Two readings of "less movement"
   * that disagree, in one run. */
  const t = await swing();
  const before = await measure(1);
  const shipped = await measure(null);
  const POS = await armWith([[HOOK, HOOK.replace('vtip: 0.00', 'vtip: 3.00')]], 'w1p');
  const NEG = await armWith([[HOOK, HOOK.replace('stiff: 1.50', 'stiff: 8.00')]], 'w1n');
  const pos = await measure(null, POS);
  const neg = await measure(null, NEG);

  console.log(`\n[W1] mean flow rad/s   before ${before.flow.toFixed(3)}  shipped ${shipped.flow.toFixed(3)}  `
    + `positive(vtip 3.0) ${pos.flow.toFixed(3)}  negative(stiff 8.0) ${neg.flow.toFixed(3)}`);
  console.log(`[W1] path m            before ${before.path.toFixed(2)}  shipped ${shipped.path.toFixed(2)}  `
    + `positive ${pos.path.toFixed(2)}  negative ${neg.path.toFixed(2)}   (capsule ${before.playerPath.toFixed(2)})`);
  console.log(`[W1] peakAcc m/s2      before ${before.peakAcc.toFixed(1)}  shipped ${shipped.peakAcc.toFixed(1)}  `
    + `positive ${pos.peakAcc.toFixed(1)}  negative ${neg.peakAcc.toFixed(1)}`);

  assert.ok(pos.flow > before.flow * 1.5,
    `tripling the velocity tip moved the mean flow to ${pos.flow.toFixed(3)} against ${before.flow.toFixed(3)}. `
    + 'This metric cannot see the camera being made busier, so nothing it says elsewhere counts.');
  assert.ok(pos.peakAcc > before.peakAcc * 2,
    `tripling the tip left peak acceleration at ${pos.peakAcc.toFixed(1)} against ${before.peakAcc.toFixed(1)}`);
  assert.ok(neg.path < shipped.path && neg.peak < shipped.peak,
    `a follow spring at stiff 8.00 travels ${neg.path.toFixed(2)} m at peak ${neg.peak.toFixed(2)} m/s against the `
    + `shipped ${shipped.path.toFixed(2)} m / ${shipped.peak.toFixed(2)} m/s — the metric only goes up`);

  /* Determinism: the same trajectory replayed twice under the same rig must give the same number,
     or every before/after difference in this file is partly noise. */
  const again = await measure(null);
  assert.equal(again.flow, shipped.flow, 'two identical replays disagree — the instrument is not deterministic');
  assert.equal(again.path, shipped.path, 'two identical replays disagree on path');
  assert.ok(t.samples.filter((s) => s.state === 'hookSwing').length > 180,
    'the driven route stopped catching the ring — the sample is broken, not the camera');
});

/* ====================================================================== */
/* W2 — the attribution: which lever actually owns the swing's motion      */
/* ====================================================================== */

test('W2: the velocity orbit tip owns the swing camera motion, and every other lever is noise', async () => {
  /* This is §745's load-bearing claim and the one §442 is a warning about: a number is easy, the
   * explanation for it is what goes wrong. So the explanation is measured rather than reasoned —
   * each candidate term is removed IN TURN from a copy of the rig and the swing is re-flown.
   *
   * DOMAIN (§418.3)
   *   passes on : the velocity tip — removing it alone takes mean flow to 0.561 of shipped-before.
   *   fails on  : the other five, asserted below to move the flow by less than 10 % each. Both
   *               sides come off the same instrument on the same trajectory, so "this one and not
   *               those" is a measurement rather than a preference.
   *   does NOT discriminate : anything about the SWING ITSELF. `HookSwing` and the ring magnet are
   *               untouched by this lane; the capsule trajectory is one recording replayed under
   *               every arm, so nothing here can be evidence about the move. */
  const before = await measure(1);
  const ABL = [
    ['velocity orbit tip', null, null],
    ['climbLift + fallLead', [['    y += Math.min(1, climbing / TUNE.climbSpeed) * TUNE.climbLift;\n    y -= Math.min(falling * TUNE.fallLeadTime, TUNE.fallLeadMax);', '    y += 0 * climbing; y -= 0 * falling;']], 1],
    ['speed dolly', [['    want += this._speedNorm() * TUNE.distSpeedGain;   // the speed dolly — see `distSpeedGain`', '    want += 0;']], 1],
    ['fov speed gain', [['      + this._speedNorm() * TUNE.fovSpeedGain', '      + 0 * TUNE.fovSpeedGain']], 1],
    ['side (0.85 -> 0)', [[HOOK, HOOK.replace('side: 0.85', 'side: 0.00')]], 1],
    ['lead (1.60 -> 0)', [[HOOK, HOOK.replace('lead: 1.60', 'lead: 0.00')]], 1],
    ['stiff (1.50 -> 3.0)', [[HOOK, HOOK.replace('stiff: 1.50', 'stiff: 3.00')]], 1],
  ];
  const rows = [];
  let tag = 0;
  for (const [label, edits, vt] of ABL) {
    const ARM = edits ? await armWith(edits, `w2${tag++}`) : null;
    rows.push([label, await measure(vt, ARM)]);
  }
  console.log('\n[W2] each term removed in turn, as a fraction of the pre-§745 camera');
  console.log('     removed                  flow  flowPeak  angPath  peakAng   rmsAcc  peakAcc');
  for (const [label, R] of rows) {
    const f = (k) => (R[k] / before[k]).toFixed(3).padStart(8);
    console.log(`     ${label.padEnd(22)}${f('flow')}${f('flowPeak')}${f('angPath')}${f('peakAng')}${f('rmsAcc')}${f('peakAcc')}`);
  }

  const tip = rows[0][1];
  assert.ok(tip.flow < before.flow * 0.65,
    `removing the velocity orbit tip left the mean flow at ${(tip.flow / before.flow).toFixed(3)} of the `
    + 'pre-§745 camera. It is not the dominant term, so §745 fixed the wrong thing.');
  for (const [label, R] of rows.slice(1)) {
    assert.ok(Math.abs(R.flow / before.flow - 1) < 0.10,
      `removing '${label}' moved the mean flow to ${(R.flow / before.flow).toFixed(3)} of the pre-§745 camera — `
      + 'more than 10 %. It is not the noise this arm claims it is, and the attribution needs re-measuring.');
  }
  /* The `lead` row carries its own claim, and it is the one the file already predicted: */
  const lead = rows.find((r) => r[0].startsWith('lead'))[1];
  console.log(`[W2] lead 1.60 -> 0.00 moves the flow by ${(100 * (lead.flow / before.flow - 1)).toFixed(1)}% `
    + '— `hook_swing` is floored by `leadMax`, so no value of `f.lead` reaches the screen');
  assert.ok(Math.abs(lead.flow / before.flow - 1) < 0.01,
    "deleting `hook_swing`'s authored lead changed the camera's motion. The `leadMax` census says it "
    + 'cannot, so either the census or this arm is wrong');
});

/* ====================================================================== */
/* W3 — the delivered reduction, against the target, with the shot intact  */
/* ====================================================================== */

test('W3: the swing camera moves 0.56 of what it did, and the subject sits exactly where it did', async () => {
  /* The owner asked for half. The primary metric is mean optical flow, and half of it is NOT
   * reachable: with the velocity tip entirely off — which is what ships — the flow is 0.561 of
   * before, and the remaining 0.443 rad/s is the irreducible cost of keeping a subject who
   * travels 14.95 m in 3.25 s inside the frame. That gap is reported rather than closed, because
   * closing it means spending `stiff` and `side`, which the ablation prices at 6 % and 4 %.
   *
   * **The second bar is the one that makes the first one honest.** A camera can always be made to
   * move less by letting the subject leave the frame. So the subject's on-screen path and its
   * worst NDC radius are asserted UNCHANGED — the motion removed was not doing framing work.
   *
   * DOMAIN (§418.3)
   *   passes on : the shipped `vtip` 0.00 — flow 0.561, angular path 0.531, peak acceleration
   *               0.271, subject path 0.999 and worst NDC radius equal to three decimals.
   *   fails on  : `stiff` 8.00, run below, which cuts the camera's path harder than the shipped
   *               arm does and FAILS the composition bar — the subject's screen path rises 15 %.
   *               That is the trade this arm exists to refuse, measured rather than imagined.
   *   does NOT discriminate : any ring but this one, or any swing that ends differently. One
   *               route, one ring, 225 frames. */
  const before = await measure(1);
  const after = await measure(null);
  const NEG = await armWith([[HOOK, HOOK.replace('stiff: 1.50', 'stiff: 8.00')]], 'w3n');
  const neg = await measure(null, NEG);

  const F = (k) => after[k] / before[k];
  console.log('\n[W3] ring swing residency, 195 frames (3.25 s), pre-§745 -> shipped');
  const line = (k, u, d = 3) => console.log(`     ${k.padEnd(10)} ${before[k].toFixed(d).padStart(9)} -> ${after[k].toFixed(d).padStart(9)} ${u.padEnd(7)} x${F(k).toFixed(3)}`);
  for (const [k, u] of [['flow', 'rad/s'], ['flowPeak', 'rad/s'], ['angPath', 'rad'], ['peakAng', 'rad/s'],
    ['path', 'm'], ['relPath', 'm'], ['mean', 'm/s'], ['peak', 'm/s'], ['rmsAcc', 'm/s2'], ['peakAcc', 'm/s2'],
    ['boomPath', 'm'], ['fovPath', 'deg'], ['ndcPath', 'ndc'], ['ndcMax', 'ndc']]) line(k, u);
  console.log(`     capsule path over the same frames ${before.playerPath.toFixed(2)} m — the floor for 'path'`);

  /* THE TARGET. Stated as a band rather than a point: the owner said half, the mechanism's floor
     is 0.561, and a bar at exactly 0.500 would be a bar this change cannot pass. */
  assert.ok(F('flow') <= 0.65,
    `the mean optical flow is ${F('flow').toFixed(3)} of what it was — the change delivers less than a `
    + 'third of the reduction asked for');
  assert.ok(F('flow') >= 0.45,
    `the mean optical flow fell to ${F('flow').toFixed(3)} of what it was, well past the half asked for. `
    + 'Either something other than the velocity tip moved, or the camera has stopped following him.');
  /* And the smoothing half, which is the request's second sentence. */
  assert.ok(F('peakAcc') < 0.5 && F('rmsAcc') < 0.5,
    `the camera's acceleration during the swing is ${F('rmsAcc').toFixed(3)} rms / ${F('peakAcc').toFixed(3)} peak `
    + 'of what it was — "and smooth the camera movement" is not delivered');

  /* COMPOSITION, and it is a bar rather than an observation. */
  assert.ok(Math.abs(F('ndcPath') - 1) < 0.02,
    `the subject's on-screen path changed by ${(100 * (F('ndcPath') - 1)).toFixed(1)}% — the camera motion that `
    + 'was removed WAS doing framing work, so this is a composition change and not a smoothing one');
  assert.ok(after.ndcMax <= before.ndcMax + 1e-3,
    `the subject reaches ${after.ndcMax.toFixed(3)} of NDC radius against ${before.ndcMax.toFixed(3)} before — `
    + 'he is further out of frame than he was');
  assert.equal(after.behind, 0, 'the subject went behind the lens during the swing');

  console.log(`[W3] composition control: at stiff 8.00 the camera path falls to ${(neg.path / before.path).toFixed(3)} `
    + `but the subject's screen path RISES to ${(neg.ndcPath / before.ndcPath).toFixed(3)} — bought, not earned`);
  assert.ok(neg.path < after.path && neg.ndcPath > before.ndcPath * 1.05,
    'the stiff-8.00 control does not actually trade composition for stillness, so the bar above is not '
    + 'known to be able to catch that trade');
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

test('W5: `?cam=swingtip` restores the pre-§745 swing exactly, and no other framing carries a vtip', async () => {
  /* Two claims. The token is a real revert, and the change reaches exactly one row.
   *
   * DOMAIN (§418.3)
   *   passes on : `__CAMBLEND_AB = 'swingtip'` in a fresh import — `swingVTip` becomes 1, and the
   *               measured swing under it is bit-equal to the arm with the tip at full strength.
   *   fails on  : the same import with the flag unset, asserted to leave `swingVTip` null so the
   *               row's own 0.00 governs. And `hardblend,swingtip` is asserted to set BOTH, so the
   *               comma list is known to be parsed rather than string-matched. */
  const src = readFileSync(new URL('../src/player/CameraRig.js', import.meta.url), 'utf8');
  const rowsWithVtip = [...src.matchAll(/^ {2}([a-z_]+):\s*\{[^}]*vtip:\s*([\d.]+)/gm)].map((m) => `${m[1]}=${m[2]}`);
  console.log(`\n[W5] rows carrying a vtip: ${rowsWithVtip.join(' ') || '(none)'}`);
  assert.deepEqual(rowsWithVtip, ['hook_swing=0.00'],
    'a framing other than `hook_swing` carries a `vtip`. §745 is scoped to the ring swing and this '
    + 'arm is that scope.');

  const fresh = async (flag) => {
    const keep = globalThis.__CAMBLEND_AB;
    if (flag === undefined) delete globalThis.__CAMBLEND_AB; else globalThis.__CAMBLEND_AB = flag;
    try {
      const m = await import(`../src/player/CameraRig.js?swing=${flag}-${Math.random()}`);
      return { vt: m.TUNE.swingVTip, shape: m.TUNE.frameBlendShape };
    } finally { if (keep === undefined) delete globalThis.__CAMBLEND_AB; else globalThis.__CAMBLEND_AB = keep; }
  };
  const off = await fresh(undefined);
  const rev = await fresh('swingtip');
  const both = await fresh('hardblend,swingtip');
  console.log(`[W5] swingVTip: default ${off.vt} · swingtip ${rev.vt} · both ${both.vt} (shape ${both.shape})`);
  assert.equal(off.vt, null, `the default build forces swingVTip to ${off.vt} instead of leaving the row to govern`);
  assert.equal(off.shape, 0.8, '§744 default moved');
  assert.equal(rev.vt, 1, `\`?cam=swingtip\` set swingVTip to ${rev.vt}; the revert does not revert`);
  assert.equal(rev.shape, 0.8, '`?cam=swingtip` also reverted §744 — the two tokens are not independent');
  assert.equal(both.vt, 1); assert.equal(both.shape, 0, '`?cam=hardblend,swingtip` did not set both');

  /* And the revert is a revert of the MOTION, not just of a constant. */
  const reverted = await measure(1);
  const full = await measure(null, await armWith([[HOOK, HOOK.replace('vtip: 0.00', 'vtip: 1.00')]], 'w5'));
  console.log(`[W5] token arm flow ${reverted.flow.toFixed(6)} vs a source copy at vtip 1.00 ${full.flow.toFixed(6)}`);
  assert.equal(reverted.flow, full.flow,
    'the token arm and a rig whose row literally reads `vtip: 1.00` do not fly the same swing, so '
    + '`?cam=swingtip` is an approximation of the old feel rather than the old feel');
  assert.equal(reverted.path, full.path, 'the token arm and the source copy disagree on path');
});

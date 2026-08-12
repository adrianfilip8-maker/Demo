import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A/B capture runners must freeze the world clock.
 *
 * `Debug.setShot` defaults `dt` to `1/60` and then runs 17 settle frames, so **every arm advances
 * `engine.time` by ~0.28 s unless the caller passes `{ dt: 0 }`**. That clock is the only phase
 * source in the build, so birds, particles, embers and water all move between arms of what is
 * supposed to be a single-lever comparison.
 *
 * The cost, measured (§251): `decalsign`'s null arm — two captures of the *identical* configuration
 * — differed on **51.97% of pixels at mean 3.85 L**, against `celband`'s null, which froze the clock
 * and came back **byte-identical** across a five-minute gap and three intervening arms (§250). Worse
 * than the noise itself, the noise was not zero-mean: braziers carry an `embers` emitter 1.05 m
 * overhead, so the raw ROI null sat **43.9 SEM from zero** and a straightforward averaging argument
 * for ignoring it was invalid (§252.1).
 *
 * ── Why this is a test and not a comment ────────────────────────────────────────────────────────
 * **It was already a comment.** `Debug.js:82` says, in the file, next to the line:
 *
 *   > *"A/B runners pass `{ dt: 0 }`; everything else passes"*
 *
 * and cites the **two VOID runs** of §195, where staging2's P-F4 `[0,0]` band was unachievable by
 * construction for exactly this reason. The guidance existed, in the right place, and was missed
 * again by an agent who had read enough of that file to use its API. That is §245's lesson for the
 * third time: **a documented hazard is worth nothing until it fails loudly.**
 *
 * ── Why the rule is narrow, and why a blanket version would be wrong ────────────────────────────
 * 32 of 59 runners never pass `dt: 0`, and **most of them are right not to**. A one-shot render
 * (`tools/shot.mjs`, `tools/budget.mjs`, `gildmetal`) has no second frame to be inconsistent with,
 * and freezing its clock buys nothing. Asserting "always freeze" would flag 32 files, be wrong about
 * ~20 of them, and be ignored within a day — the census-that-cries-wolf failure §248 records, where
 * three successive drafts of a scrape each produced a confident list of non-defects.
 *
 * So the rule applies only to the shape that can actually be harmed: a runner that calls `setShot`
 * **two or more times** is comparing arms, and its arms must be phase-aligned.
 *
 * The known set is pinned exactly, and fails in BOTH directions, following `tests/api.test.mjs`.
 * A new multi-arm runner without a frozen clock turns this red. Fixing one of the listed files also
 * turns it red — telling whoever fixed it to delete the line rather than leave a stale exception.
 * The list is a defect register, not a permission.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const DIRS = ['progress/records', 'tools'];

/** `setShot(` anywhere — the call whose default this test is about. */
const CALL = /setShot\s*\(/g;
/** `{ dt: 0 }` in any spacing, anywhere in the file: one frozen call is enough to show intent. */
const FROZEN = /\bdt\s*:\s*0\b/;
/**
 * The SECOND legitimate phase-alignment mechanism (§275.1, first used by fxshape2.mjs):
 * rewind `engine.time = 0` immediately before every `setShot(..., { dt: 1/60 })`, so every arm
 * advances along the identical absolute timeline instead of not advancing at all. FX runners
 * need this form — at `dt: 0` emitters hold at t = 0 and a combat-trail arm has no trail to
 * measure. The requirement this file guards is phase ALIGNMENT, not the literal `dt: 0`; a
 * runner using either spelling is not `decalsign`'s defect. (This regex is deliberately
 * narrow: an assignment of exactly 0 to the engine clock. A runner that rewinds only SOME of
 * its setShot calls would still pass it — as would a `dt: 0` in only some calls; both scans
 * assert declared intent, and the arms' own recorded `t` is what a scorer checks.)
 */
const REWOUND = /(?:__ENGINE|engine)\.time\s*=\s*0\b/;

function scan() {
  const out = [];
  for (const d of DIRS) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.mjs')) continue;
      const rel = `${d}/${name}`;
      const text = readFileSync(join(dir, name), 'utf8');
      const calls = [...text.matchAll(CALL)].length;
      if (!calls) continue;
      out.push({ rel, calls, frozen: FROZEN.test(text) || REWOUND.test(text) });
    }
  }
  return out;
}

const runners = scan();
/** The shape that can be harmed: more than one staged frame in the same process. */
const multiArm = runners.filter((r) => r.calls >= 2);

/**
 * Multi-arm runners that let the clock run. Every one is a candidate for `decalsign`'s defect —
 * **candidates, not confirmed instances**, since a statistic can be robust to a moving clock and
 * several of these may be. What the list asserts is that nobody has *checked*.
 *
 * **`decalsign.mjs` is ON this list, and that is correct** — I first wrote this file asserting it
 * had been fixed, and this test caught me. The agent that *found* the defect did not freeze its
 * clock; it handled the consequence analytically instead, with a null-derived stable mask covering
 * 90.9% of the ROI that reduced the bias to +0.186 against an effect of −8.98 (§252.1). That is a
 * defensible trade — re-running to freeze the clock costs another ~90 minutes of an already
 * three-deep lock queue — but it is *mitigation, not repair*, and a register that recorded it as
 * repaired would be lying about the one file whose numbers the project is currently relying on.
 */
const KNOWN_RUNNING_CLOCK = [
  'progress/records/atmowire1.mjs',
  'progress/records/banda1.mjs',
  'progress/records/banda2.mjs',
  'progress/records/goldlobe1.mjs',
  'progress/records/goldlobe2.mjs',
  'progress/records/hgcframe.mjs',
  'progress/records/litwarm1.mjs',
  'progress/records/skynoise1.mjs',
  'progress/records/skyswirl1.mjs',
  'progress/records/decalsign.mjs',
  'progress/records/staging1.mjs',
  'tools/cryptgate.mjs',
];

test('clockfreeze: the scan found a real population of runners', () => {
  /* §211.1 — both assertions below are set comparisons over `multiArm`. If the scan found nothing
     they would pass having inspected nothing. Assert the subject exists first, and assert that the
     scan can see BOTH states, or a regex that matches nothing would look like universal compliance. */
  assert.ok(runners.length > 40, `only ${runners.length} runners call setShot`);
  assert.ok(multiArm.length > 15, `only ${multiArm.length} multi-arm runners found`);
  assert.ok(multiArm.some((r) => r.frozen), 'the scan sees no frozen runner — the dt regex is broken');
  assert.ok(multiArm.some((r) => !r.frozen), 'the scan sees no running-clock runner — the call regex is broken');
});

test('clockfreeze: no NEW multi-arm runner leaves the world clock running', () => {
  const running = multiArm.filter((r) => !r.frozen).map((r) => r.rel).sort();
  assert.deepEqual(running, [...KNOWN_RUNNING_CLOCK].sort(),
    'multi-arm capture runners that never pass { dt: 0 }:\n'
    + running.map((r) => `  ${r}`).join('\n')
    + '\n\nsetShot defaults dt to 1/60 across 17 settle frames, so each arm advances engine.time by\n'
    + '~0.28 s and every animated thing in the scene moves between arms. See §251, and §250 for the\n'
    + 'contrast with a run that froze it and got a byte-identical null.\n'
    + 'If you FIXED one, delete it from KNOWN_RUNNING_CLOCK.');
});

test('clockfreeze: the runners whose results are load-bearing stay frozen', () => {
  /* Named individually rather than left to the set above, because these are the runs whose
     conclusions the project is currently relying on — §249's NOTHING SHIPS and §253's fill
     diagnosis. `decalsign.mjs` is deliberately NOT here: it never froze its clock and mitigated
     analytically instead, which the register above records honestly. */
  for (const rel of ['progress/records/celband.mjs', 'progress/records/inkw.mjs']) {
    const r = runners.find((x) => x.rel === rel);
    assert.ok(r, `${rel} no longer calls setShot — has it been renamed?`);
    assert.ok(r.frozen, `${rel} no longer passes { dt: 0 } — its arms are no longer phase-aligned`);
  }
});

test('clockfreeze: Debug.setShot still defaults dt, so the rule still applies', () => {
  /* If someone changes the default to 0, this whole file becomes unnecessary — and should be
     deleted rather than left asserting a rule that no longer has teeth. This test says so. */
  const dbg = readFileSync(join(ROOT, 'src/core/Debug.js'), 'utf8');
  const m = /const dt = Number\.isFinite\(\s*opts\.dt\s*\)\s*\?\s*opts\.dt\s*:\s*([^\s;]+)/.exec(dbg);
  assert.ok(m, 'could not find setShot\'s dt default in src/core/Debug.js — re-read it before trusting this file');
  assert.notEqual(m[1], '0',
    'setShot now defaults dt to 0. The hazard this file guards is gone; delete this file rather '
    + 'than leave it pinning a list that no longer means anything.');
});

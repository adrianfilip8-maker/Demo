import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { CLIPS, REQUIRED, sampleInto, compile } from '../src/player/Clips.js';
import { PoseBuffer } from '../src/player/Rig.js';
import { MIXAMO_CLIPS } from '../src/player/MixamoClips.js';
import { buildClipSet, ACTIVE, CLIP_REGIME, CLIP_ORIGIN, LIMB_OPEN, GODOT_LIMB_OPEN } from '../src/player/Animation.js';
import { GODOT_CLIPS } from '../src/player/GodotClips.js';
import { TUNE } from '../src/player/Controller.js';

/**
 * Guards on the CLIP-SET REGISTRATION — the seam where `MixamoClips.js` becomes something the rig
 * can be driven by. `tests/rig.test.mjs` guards the 52 hand-authored clips and
 * `tests/mixamo.test.mjs` guards the emitter's raw output; neither can see the third artefact,
 * which is the **spliced** clip that only exists at registration time: Mixamo's tracks for the 21
 * bones it has, plus the procedural counterpart's tracks — time-scaled — for the 10 it does not,
 * plus that counterpart's cane.
 *
 * The failure modes this file exists for, in the order they would have cost the most:
 *
 * 1. **The default silently moving.** `?anim=` has to resolve to `proc` for an absent, unknown or
 *    misspelled token, and `proc` has to be the *same objects* `Clips.js` exports — not a copy
 *    that happens to look the same. Asserted by identity (`===`), because a structural comparison
 *    would pass a rebuild that changed a float.
 * 2. **The splice mutating `CLIPS`.** `timeScale` rewrites key times, and the donor track it
 *    rewrites is shared with the procedural clip. If it scaled in place, building the mixamo set
 *    would corrupt the procedural one — and in a build where both regimes exist so they can be
 *    A/B'd, that corrupts the control arm from the treatment arm. This project has paid for that
 *    class of bug once already, in `Rig.aimBone`'s `_v0` aliasing, which made every foot-IK solve
 *    a no-op that still returned `true`.
 * 3. **A tree node losing its stride.** `Animation._strideLength()` reads `clip.stride > 0` as
 *    "rate-match this to real speed" and returns 0 when no node declares one — which freezes the
 *    shared stride phase and stops the legs dead while the character keeps sliding forward. A
 *    Mixamo clip carries no stride of its own (the source is in-place), so the emitter derives one
 *    from foot geometry; if that derivation ever silently returns nothing, this is what catches it.
 * 4. **A donor track running off the end of its new clip.** `walk` is 1.0 s and `walk_forward` is
 *    1.7 s. Unscaled, the tail would freeze for the last 0.7 s of every cycle; scaled wrongly, a
 *    key lands past `dur` where `seg()` clamps and it never plays.
 */

const BONES = new Set(RIG3.BONE_ORDER);
const REG = ['proc', 'mixamo', 'mixamo-pure', 'godot', 'godot-pure'];

/** RIG3 bones Mixamo has no source for — the ones the splice has to fill from the donor. */
const NO_SOURCE = ['tailA', 'tailB', 'tailC', 'tailD', 'capBrim', 'jaw', 'browL', 'browR', 'earL', 'earR'];

/* ------------------------------------------------------------ the default ---- */

test('regime: the shipped default is `godot` — the audited swaps ride on Clips.js itself', () => {
  /* Since the FrontFlip commit the DEFAULT regime is `godot`, by the user's instruction (use the
     repo's movement animations). Its table draws every swapped name from GodotClips.js.
     THE IDENTITY HALF OF THIS CLAIM IS RE-DERIVED FOR §531, not patched around: until the
     spread ruling, an unswapped clip in this regime was `CLIPS[n]` by object identity. The
     ruling ("the arms and legs are too tucked in") applies to the shipped look as a whole, and
     the most folded pose in the set is a procedural one the swap never reached, so the limb
     lever now runs over the whole godot REGIME. An unswapped clip is therefore the procedural
     clip with its DISTAL tracks opened and everything else bit-exact — asserted below, which is
     a stronger statement than the identity it replaces. `?anim=proc` keeps the identity claim
     verbatim, and that is the arm the §474-era measurements re-run against.
     DOMAIN — passes on: the shipped build (swapped set ⊇ double_jump; unswapped clips differ
     from CLIPS only at lowerArm/lowerLeg); fails on: the pre-FrontFlip build, RUN here as
     buildClipSet('proc') — its double_jump has no godot origin (asserted below, the same check
     inverted), and a lever that leaked into a non-distal channel, RUN here as the per-bone
     comparison; cannot discriminate: whether a swap LOOKS right — that is the on-camera
     audit's job, frames in shots/, not an object-identity test's. */
  assert.equal(CLIP_REGIME, 'godot', 'a plain `node` import must resolve to the default regime');
  let swapped = 0, kept = 0;
  for (const n of Object.keys(CLIPS)) {
    if (CLIP_ORIGIN[n] === 'proc') {
      /* §531: same motion, distal joints opened — every other channel bit-exact */
      const OPENED = new Set(['lowerArmL', 'lowerArmR', 'lowerLegL', 'lowerLegR']);
      assert.equal(ACTIVE[n].dur, CLIPS[n].dur, `unswapped "${n}" changed duration`);
      assert.equal(ACTIVE[n].bones.length, CLIPS[n].bones.length, `unswapped "${n}" gained or lost a track`);
      for (const tr of ACTIVE[n].bones) {
        const was = CLIPS[n].bones.find((x) => x.name === tr.name);
        assert.ok(was, `unswapped "${n}" grew a track "${tr.name}"`);
        if (OPENED.has(tr.name)) continue;
        assert.equal(tr, was, `unswapped "${n}" changed a NON-distal track "${tr.name}" — the §531 lever leaked`);
      }
      kept++;
    } else {
      const m = /^godot:(.+)$/.exec(CLIP_ORIGIN[n]);
      assert.ok(m, `swapped "${n}" has origin "${CLIP_ORIGIN[n]}", not godot:*`);
      assert.ok(GODOT_CLIPS[m[1]], `swapped "${n}" names source "${m[1]}", which GodotClips.js does not carry`);
      assert.notEqual(ACTIVE[n], CLIPS[n], `swapped "${n}" is still the procedural object — the splice did not run`);
      swapped++;
    }
  }
  assert.equal(kept + swapped, 52, `expected the 52 clip names, saw ${kept + swapped}`);
  assert.ok(CLIP_ORIGIN.double_jump?.startsWith('godot:'),
    'double_jump is the P1 deliverable — the default regime must swap it');

  /* The control arm still exists and still IS Clips.js: `?anim=proc` must reproduce the exact
     objects, because that token is how every §474-era measurement is re-run. */
  const s = buildClipSet('proc');
  for (const n of Object.keys(CLIPS)) {
    assert.equal(s.table[n], CLIPS[n], `proc regime replaced "${n}" with a different object`);
    assert.equal(s.origin[n], 'proc');
  }
});

test('regime: an unknown, empty or misspelled token falls through to `godot`', () => {
  /* Restoring the incumbent is the ABSENCE of a token, the same contract `?char=` states in
     main.js — and the incumbent is now the godot set. A typo must not half-install anything.
     DOMAIN — passes on: junk tokens resolving to the default; fails on: an explicit 'proc'
     being swallowed by the fall-through (RUN below — 'proc' must select proc, or the §474
     control arm is unreachable); cannot discriminate: which regime SHOULD be the default —
     that claim lives in the regime test above and in the ledger, not in normalisation. */
  for (const t of ['', 'mixmao', 'godo', 'godot2', 'true', '1', 'legacy', undefined, null, 'godot']) {
    const s = buildClipSet(t);
    assert.equal(s.regime, 'godot', `token ${JSON.stringify(t)} did not fall through to godot`);
    /* The default's substitutions must be IN FORCE under a junk token (double_jump swapped) while
       the scope-guarded gaits stay procedural — sneak_walk carries the §470 wrong-leg fix and the
       repo has no sneak, so its SOURCE doubles as the scope guard. Since §531 the guard is
       stated on provenance and on the §470 channels rather than on object identity: the limb
       lever opens distal joints across the whole godot regime, so sneak_walk is no longer the
       same object — but it must still be the same MOTION, from no source, with the wrong-leg
       repair's own channels untouched. */
    assert.notEqual(s.table.double_jump, CLIPS.double_jump, `token ${JSON.stringify(t)} lost the default's swaps`);
    assert.equal(s.origin.sneak_walk, 'proc', `token ${JSON.stringify(t)} swapped the §470 sneak gait`);
    for (const bone of ['upperArmL', 'upperArmR', 'head']) {
      assert.deepEqual(
        Array.from(s.table.sneak_walk.bones.find((x) => x.name === bone).q),
        Array.from(CLIPS.sneak_walk.bones.find((x) => x.name === bone).q),
        `token ${JSON.stringify(t)} moved the §470 sneak repair's ${bone}`);
    }
  }
  for (const t of ['proc', 'mixamo', 'mixamo-pure', 'godot-pure']) {
    assert.equal(buildClipSet(t).regime, t, `explicit token ${JSON.stringify(t)} was swallowed by the fall-through`);
  }
  /* Case and surrounding whitespace ARE tolerated, deliberately: a URL a human typed, or a token a
     shell passed through with a trailing space, should select the arm it plainly names rather than
     silently restoring the incumbent and producing a control frame labelled as a treatment. */
  for (const t of ['MIXAMO ', ' Mixamo', 'Mixamo-Pure', ' GODOT']) {
    assert.equal(buildClipSet(t).regime, t.trim().toLowerCase(), `token ${JSON.stringify(t)} was not normalised`);
  }
});

test('regime: the godot double_jump is FrontFlip retimed onto OUR jump window, and the retime mutates nothing', () => {
  /* The §474.3 rule as an arm: an aliased clip's `dur` is the window the moveset delivers, and
     the window is physics — doubleJumpV0 / |gravity| puts apex at 0.4125 s, so the clip must end
     within half a frame of it (a held flip finishes exactly as `fall` re-bases; the tapped cut
     at ~0.167 s lands past the flip's 180° so the demote blend resolves forward — §474.3's
     numbers, re-verified on camera in shots/flip1). DOMAIN — passes on: the shipped alias;
     fails on: the source's own authored duration, RUN here (0.75 s would overshoot the window
     by 82 % — the exact §474.3 class, a clip cut mid-rotation); cannot discriminate: whether
     0.41 s READS as a flip at game framing — the flip1 frames carry that claim. */
  const win = TUNE.doubleJumpV0 / Math.abs(TUNE.gravity);
  const { table, origin } = buildClipSet('godot');
  assert.equal(origin.double_jump, 'godot:FrontFlip');
  const dj = table.double_jump;
  assert.ok(Math.abs(dj.dur - win) <= 0.5 / 60,
    `double_jump dur ${dj.dur} is not the delivered window ${win.toFixed(4)} (±half a frame)`);
  assert.ok(Math.abs(GODOT_CLIPS.FrontFlip.dur - 0.75) < 1e-6,
    `the authored source would overshoot the window by ${(GODOT_CLIPS.FrontFlip.dur / win - 1) * 100 | 0}% — and retiming must not have rewritten it`);
  for (const tr of dj.bones) {
    assert.ok(tr.times[tr.times.length - 1] <= dj.dur + 1e-4,
      `retimed track ${tr.name} ends at ${tr.times[tr.times.length - 1]}, past dur ${dj.dur}`);
  }
  /* the retime rebuilt keys; the SOURCE module's own key grid must still be the emitter's */
  assert.equal(GODOT_CLIPS.FrontFlip.keys[1].t, 0.05, 'GodotClips.js FrontFlip keys were rewritten in place');
  /* splice coverage: filled arm drives all 31 RIG3 bones, pure arm only the emitted 21 */
  const names = new Set(dj.bones.map((t) => t.name));
  assert.equal(names.size, 31, `godot double_jump drives ${names.size} bones, not 31 — the donor fill did not run`);
  assert.ok(dj.cane, 'godot double_jump lost the donor cane track');
  const pure = buildClipSet('godot-pure').table.double_jump;
  assert.equal(new Set(pure.bones.map((t) => t.name)).size, 21, 'godot-pure double_jump must carry only the emitted bones');
  assert.equal(pure.cane, null, 'godot-pure double_jump must not carry a cane track');
});

/* ------------------------------------------------------------- the splice ---- */

test('registration: building any regime mutates neither Clips.js nor GodotClips.js', () => {
  /* Snapshot the donor key times BEFORE, build every regime, compare AFTER. `timeScale` multiplies
     key times by durNew/durOld and `retimeRaw` rebuilds a source clip's keys; done in place either
     would silently retune the control arm (or the emitter's committed grid). */
  const before = new Map();
  for (const n of Object.keys(CLIPS)) {
    for (const tr of CLIPS[n].bones) before.set(`${n}/${tr.name}`, Float32Array.from(tr.times));
    if (CLIPS[n].cane) before.set(`${n}/#cane`, Float32Array.from(CLIPS[n].cane.times));
  }
  const gBefore = new Map();
  for (const n of Object.keys(GODOT_CLIPS)) gBefore.set(n, GODOT_CLIPS[n].keys.map((k) => k.t));
  for (const r of REG) buildClipSet(r);
  let checked = 0;
  for (const n of Object.keys(CLIPS)) {
    for (const tr of CLIPS[n].bones) {
      assert.deepEqual(Array.from(tr.times), Array.from(before.get(`${n}/${tr.name}`)),
        `${n}/${tr.name} key times were rewritten by building another regime`);
      checked++;
    }
    if (CLIPS[n].cane) {
      assert.deepEqual(Array.from(CLIPS[n].cane.times), Array.from(before.get(`${n}/#cane`)), `${n} cane times were rewritten`);
      checked++;
    }
  }
  for (const n of Object.keys(GODOT_CLIPS)) {
    assert.deepEqual(GODOT_CLIPS[n].keys.map((k) => k.t), gBefore.get(n), `GodotClips "${n}" key times were rewritten in place`);
    checked++;
  }
  assert.ok(checked > 1000, `only ${checked} tracks compared`);
});

test('registration: the alias map names only clips that exist on both sides', () => {
  const s = buildClipSet('mixamo');
  const mapped = Object.entries(s.origin).filter(([, o]) => o !== 'proc');
  assert.equal(mapped.length, 14, `expected 14 mapped clip names, got ${mapped.length}`);
  const sources = new Set();
  for (const [game, origin] of mapped) {
    const src = origin.replace(/^mixamo:/, '');
    assert.ok(CLIPS[game], `alias target "${game}" is not a clip in Clips.js`);
    assert.ok(MIXAMO_CLIPS[src], `alias source "${src}" is not in MixamoClips.js`);
    sources.add(src);
  }
  assert.equal(sources.size, 13, `expected 13 distinct sources used, got ${sources.size}`);
  assert.deepEqual(s.unused.sort(), ['fall_pose_02', 'walk_side_left', 'walk_side_right'],
    'the deliberately-unused sources changed — a source gained or lost a job');
});

test('registration: every §4.7 required clip survives every regime', () => {
  /* The whole point of a 16-clip set standing in for a 52-clip one is that the other 38 keep
     working. `Shots.js` freezes on these names by contract. */
  for (const r of REG) {
    const { table } = buildClipSet(r);
    for (const n of REQUIRED) assert.ok(table[n], `regime "${r}" lost required clip "${n}"`);
    assert.equal(Object.keys(table).length, 52, `regime "${r}" has ${Object.keys(table).length} clips, not 52`);
  }
});

test('registration: a spliced clip covers all 31 bones; the pure arm covers only Mixamo\'s 21', () => {
  const mixed = buildClipSet('mixamo'), pure = buildClipSet('mixamo-pure');
  let checked = 0;
  for (const [n, o] of Object.entries(mixed.origin)) {
    if (o === 'proc') continue;
    const names = new Set(mixed.table[n].bones.map((t) => t.name));
    for (const b of NO_SOURCE) {
      assert.ok(names.has(b), `mixed "${n}" has no track for "${b}" — the tail/face fill did not run`);
    }
    assert.equal(names.size, 31, `mixed "${n}" drives ${names.size} bones, not 31`);
    assert.ok(mixed.table[n].cane, `mixed "${n}" lost its cane track — the cane would snap to bind`);

    const pnames = new Set(pure.table[n].bones.map((t) => t.name));
    for (const b of NO_SOURCE) assert.ok(!pnames.has(b), `pure "${n}" should NOT carry "${b}"`);
    assert.equal(pure.table[n].cane, null, `pure "${n}" carries a cane track — the arm is not isolating the fill`);
    checked++;
  }
  assert.equal(checked, 14, `inspected ${checked} spliced clips, expected 14`);
});

test('registration: donor tracks are time-scaled inside the new duration', () => {
  const { table, origin } = buildClipSet('mixamo');
  const bad = [];
  let checked = 0;
  for (const [n, o] of Object.entries(origin)) {
    if (o === 'proc') continue;
    const c = table[n];
    const all = [...c.bones, ...c.scales, ...(c.cane ? [{ name: '#cane', ...c.cane }] : [])];
    for (const tr of all) {
      checked++;
      let prev = -Infinity;
      for (const t of tr.times) {
        if (!Number.isFinite(t) || t < prev) { bad.push(`${n}/${tr.name} times not ascending/finite`); break; }
        prev = t;
      }
      if (tr.times[tr.times.length - 1] > c.dur + 1e-4) {
        bad.push(`${n}/${tr.name} last key ${tr.times[tr.times.length - 1]} exceeds dur ${c.dur}`);
      }
    }
    assert.ok(c.hold >= 0 && c.hold <= c.dur + 1e-6, `${n} hold ${c.hold} outside [0, ${c.dur}]`);
  }
  assert.ok(checked > 300, `only ${checked} tracks inspected`);
  assert.deepEqual(bad, []);
});

test('registration: every quaternion in every regime is finite and unit-length', () => {
  let quats = 0;
  const bad = [];
  for (const r of REG) {
    const { table } = buildClipSet(r);
    for (const n of Object.keys(table)) {
      for (const tr of table[n].bones) {
        for (let i = 0; i < tr.times.length; i++) {
          const a = i * 4;
          const L = Math.hypot(tr.q[a], tr.q[a + 1], tr.q[a + 2], tr.q[a + 3]);
          quats++;
          if (!Number.isFinite(L) || Math.abs(L - 1) > 1e-3) { bad.push(`${r}/${n}/${tr.name} key${i} |q|=${L}`); break; }
        }
        if (!BONES.has(tr.name)) bad.push(`${r}/${n} animates "${tr.name}", which RIG3 does not have`);
      }
    }
  }
  assert.ok(quats > 5000, `only ${quats} quaternions inspected`);
  assert.deepEqual(bad, []);
});

/* --------------------------------------------------- the tree still works ---- */

/** The eight locomotion-tree nodes, mirrored from Animation.js's private `TREE`. */
const TREE_NODES = ['idle_confident', 'walk', 'run', 'run_fast',
  'sneak_idle', 'sneak_walk', 'crouch_idle', 'crouch_walk'];

test('tree: no regime takes a stride away from a locomotion node', () => {
  /* THE regression test for "the legs stop moving". A Mixamo clip has no stride of its own — the
     source is in-place, measured hips travel ~0 on all 16 — so `tools/mixamo2clips.mjs` derives one
     from how far the planted foot travels under the body. If that derivation returns nothing,
     `_strideLength()` returns 0, `rate` becomes 0, and the stride phase never advances while the
     character keeps moving. Nothing in a still frame would show it. */
  const bad = [];
  for (const r of REG) {
    const { table } = buildClipSet(r);
    for (const n of TREE_NODES) {
      if (!(CLIPS[n].stride > 0)) continue;              // idles have no stride by design
      if (!(table[n].stride > 0)) bad.push(`${r}: "${n}" lost its stride (${table[n].stride})`);
    }
  }
  assert.deepEqual(bad, [], 'a locomotion node cannot rate-match:\n  ' + bad.join('\n  '));
});

test('tree: a clip that declares a stride declares a plausible one', () => {
  /* Sly walks at 2.6 m/s and tops out at 7.2 (§6). `Animation` clamps the cycle rate to
     [0.35, 3.4] cycles/s, so a clip whose stride implies a rate outside that at its own natural
     speed is a clip the clamp is fighting. Bounds are wide on purpose — this is a sanity guard on
     a DERIVED number, not a judgement about gait. */
  const bad = [];
  let checked = 0;
  for (const r of REG) {
    const { table } = buildClipSet(r);
    for (const n of Object.keys(table)) {
      const c = table[n];
      if (!(c.stride > 0)) continue;
      checked++;
      if (c.stride < 0.2 || c.stride > 8) bad.push(`${r}/${n} stride ${c.stride} m per cycle`);
      const rate = 2.6 / c.stride;
      if (!Number.isFinite(rate)) bad.push(`${r}/${n} non-finite cycle rate`);
    }
  }
  assert.ok(checked > 20, `only ${checked} strided clips inspected`);
  assert.deepEqual(bad, []);
});

/* ------------------------------------------------ the emitter's own cycles ---- */

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/**
 * `hang_crawl_left` declares itself a cycle and does not close. KNOWN and FILED, not tolerated,
 * and asserted EXACTLY so that fixing it turns this test red with "expected this to still be
 * broken" — the direction a tracked exception should fail in.
 *
 * It is a source-data property, not an emitter bug: the fan project's shimmy ends 12.80° away from
 * where it began on `lowerLegR`, a dangling leg under a ledge hang. `Animation.js` maps it onto
 * `ledge_shimmy_l`, which the tree replays continuously, so it pops once per cycle. The three
 * options were to leave it a one-shot (it then freezes on its last key, which is worse), to blend
 * the seam shut (which invents motion the source does not contain), or to ship it and say so.
 */
const KNOWN_OPEN_CYCLES = ['hang_crawl_left'];

test('emitter: a Mixamo clip that declares loop:true closes its cycle', () => {
  /* Same statistic and same tolerance as tests/rig.test.mjs — that file measured float noise at
     0.04° across the 31 authored cycles that close, against a 0.5° bound. */
  const open = [];
  let looping = 0;
  for (const n of Object.keys(MIXAMO_CLIPS)) {
    const c = MIXAMO_CLIPS[n];
    if (!c.loop) continue;
    looping++;
    const first = c.keys[0].P, last = c.keys[c.keys.length - 1].P;
    let worst = 0;
    for (const b of Object.keys(first)) {
      if (!last[b]) continue;
      const e = (d) => new THREE.Euler(THREE.MathUtils.degToRad(d[0]), THREE.MathUtils.degToRad(d[1]), THREE.MathUtils.degToRad(d[2]), 'XYZ');
      _qa.setFromEuler(e(first[b])); _qb.setFromEuler(e(last[b]));
      worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(_qa.dot(_qb)))) * 180 / Math.PI);
    }
    if (worst > 0.5) open.push(n);
  }
  assert.ok(looping >= 9, `only ${looping} looping Mixamo clips inspected`);
  assert.deepEqual(open.sort(), KNOWN_OPEN_CYCLES,
    'the set of Mixamo cycles that do not close changed — see KNOWN_OPEN_CYCLES above');
});

test('emitter: dense samples are linear, not eased', () => {
  /* `EASES[1]` (`smooth`) is t²(3−2t) — zero derivative at BOTH ends. That is the point of it for
     a hand-authored key POSE and wrong for a 20 Hz machine sample of continuous motion, where it
     stops the body dead 20 times a second. Measured before the change: the stall fraction on the
     busiest bone of `run`, `walk_side_left` and `walk_side_right` was 0.029 / 0.037 / 0.017; after,
     all three read exactly 0.000. */
  const bad = [];
  let keys = 0;
  for (const n of Object.keys(MIXAMO_CLIPS)) {
    for (const k of MIXAMO_CLIPS[n].keys) { keys++; if (k.e !== 'lin') bad.push(`${n} @${k.t} ease "${k.e}"`); }
  }
  assert.ok(keys > 500, `only ${keys} keys inspected`);
  assert.deepEqual(bad.slice(0, 5), []);
});

test('emitter: only cycles carry a stride, and only strided cycles carry footsteps', () => {
  /* `stride` is "metres of ground travel per CYCLE" (Clips.js) and drives playback rate off real
     speed. Fitted to a one-shot it is a category error with teeth: `jump_from_ground` plants a foot
     in its crouch, fits 2.403 m, and would have played faster the faster you were already running.
     A footstep is a footfall of a locomotion cycle; `idle_side` has two contact runs because a
     standing foot shifts, and firing footstep audio off a standing idle is wrong. */
  const bad = [];
  for (const [n, c] of Object.entries(MIXAMO_CLIPS)) {
    if (c.stride > 0 && !c.loop) bad.push(`${n} is a one-shot with stride ${c.stride}`);
    if (c.events?.length && !(c.stride > 0)) bad.push(`${n} fires ${c.events.length} events with no stride`);
    for (const e of c.events || []) {
      if (e.t < 0 || e.t > c.dur + 1e-3) bad.push(`${n} event at ${e.t} outside [0, ${c.dur}]`);
      if (e.n !== 'footstep' || !['L', 'R'].includes(e.d?.foot)) bad.push(`${n} malformed event ${JSON.stringify(e)}`);
    }
  }
  assert.deepEqual(bad, []);
  const strided = Object.values(MIXAMO_CLIPS).filter((c) => c.stride > 0);
  assert.ok(strided.length >= 4, `only ${strided.length} Mixamo clips carry a derived stride`);
});

/* ------------------------------------------------- seam chirality (§479.5) ---- */

test('seam chirality: proc partners of godot states hold uncrossed wrists, and the crossfade never scissors', () => {
  /* §479.5: the HANG-family poses authored their big upperArm Z with the gait family's sign
     habit ("L +Z raises" — Rig.js), which at hang/balance amplitude swings each arm DOWN-ACROSS
     the body: wrists past the midline every frame. Invisible while every blend partner shared
     the idiom; exposed the moment godot's uncrossed `LedgeGrab Idle`/`railrun` became the other
     side of the moveset's own crossfades (hang↔shimmy 0.14/0.16 s, rail_walk↔balance_idle
     0.2 s) — the fade swept both hands THROUGH the midline in opposite directions, the user's
     "arms seem to get crossed when on a ledge or off balance". Fixed by re-signing the arm
     chains of HANG, ledge_shimmy_l (and its defMirror twin) and balance_idle; this arm holds
     the repaired chirality through the real compile+FK.
     DOMAIN (§418.3) — passes on: ledge_shimmy_r @0.45 (sep +0.47 m, RUN below); fails on:
     `ko` @0.5·dur, RUN below as the contrast — it is one of the ten §479.5-census clips still
     in the crossed idiom (sep −0.10 m here), which proves the metric can say "crossed"; if a
     later round uncrosses the census backlog, this contrast line is the one to re-derive.
     Cannot discriminate: whether the pose READS at game framing — shots/seam1 (before/after,
     rear and front, telemetry beside each frame) carries that claim. */
  const abs = Object.create(null);
  for (const [n, , p] of RIG3.SKELETON) abs[n] = p;
  const rig = (() => {
    const rt = new THREE.Group(), bones = Object.create(null);
    for (const [name, parent, p] of RIG3.SKELETON) {
      const b = new THREE.Object3D();
      const pa = parent === 'root' ? [0, 0, 0] : abs[parent];
      b.position.set(p[0] - pa[0], p[1] - pa[1], p[2] - pa[2]);
      (parent === 'root' ? rt : bones[parent]).add(b);
      bones[name] = b;
    }
    return { rt, bones };
  })();
  const pb = new PoseBuffer(RIG3.BONE_ORDER);
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(rig.bones[n].matrixWorld);
  const sepOf = (samples) => {
    pb.clear();
    for (const [clip, t, w] of samples) sampleInto(clip, t, pb, w);
    for (const n of RIG3.BONE_ORDER) {
      const b = rig.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    }
    rig.rt.updateMatrixWorld(true);
    const ua = wp('upperArmL'), ub = wp('upperArmR'), hip = wp('hips');
    const lat = ua.sub(ub); lat.y = 0; lat.normalize();
    const l = (p) => p.sub(hip).dot(lat);
    return l(wp('handL')) - l(wp('handR'));
  };
  /* the three repaired clips: uncrossed at five phases each */
  for (const name of ['ledge_shimmy_l', 'ledge_shimmy_r', 'balance_idle']) {
    const c = CLIPS[name];
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const sep = sepOf([[c, f * c.dur, 1]]);
      assert.ok(sep > 0.07, `${name} @${(f * c.dur).toFixed(2)}s: hand sep ${sep.toFixed(3)} m — crossed or near-crossed`);
    }
  }
  /* the shipped crossfades, sampled mid-blend through the same accumulate path the runtime uses */
  const g = buildClipSet('godot').table;
  for (const [a, b] of [['ledge_hang', 'ledge_shimmy_r'], ['ledge_hang', 'ledge_shimmy_l'], ['rail_walk', 'balance_idle']]) {
    for (const w of [0.25, 0.5, 0.75]) {
      const sep = sepOf([[g[a], 0.45 * g[a].dur, w], [g[b], 0.45 * g[b].dur, 1 - w]]);
      assert.ok(sep > 0.05, `${a}×${b} @w=${w}: mid-fade hand sep ${sep.toFixed(3)} m — the seam scissors`);
    }
  }
  /* CONTRAST (§418.3's fails-on case), re-derived in §532.1 exactly as this line predicted it
     would have to be. It used to point at `ko`, one of the ten clips §479.5 measured as crossed
     and deliberately left; §532 solved all of them, so pointing at any shipped clip now asserts
     something no clip does. The durable form is a SYNTHETIC pose carrying the defect itself —
     the raise-amplitude idiom with the gait family's signs (`upperArmL` negative Z / `upperArmR`
     positive Z), which is what every one of those eleven clips was written in. It cannot rot
     when a clip is repaired, because it is not a clip. */
  const CROSSED_IDIOM = compile('__contrast', {
    dur: 1, loop: false, hold: 0.5,
    keys: [{ t: 0, e: 'soft', P: {
      shoulderL: [-16, 6, -34], upperArmL: [-10, 16, -118], lowerArmL: [-24, -20, -20], handL: [28, -16, -18],
      shoulderR: [-16, -6, 34], upperArmR: [-8, -16, 114], lowerArmR: [-22, 20, 20], handR: [24, 18, 18],
    } }],
  });
  const idiom = sepOf([[CROSSED_IDIOM, 0.5, 1]]);
  assert.ok(idiom < 0, `contrast arm: the pre-§479.5 HANG idiom reads sep ${idiom.toFixed(3)} m — `
    + 'expected NEGATIVE (crossed). If this passes, the metric has stopped being able to say "crossed" '
    + 'and every uncrossed assertion above it is vacuous.');

  /* and the whole shipped set is clear of it — the §532 census, as an arm */
  const g532 = buildClipSet('godot').table;
  const stillCrossed = [];
  for (const [name, clip] of Object.entries(g532)) {
    let n = 0;
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) if (sepOf([[clip, f * clip.dur, 1]]) < 0) n++;
    if (n >= 3) stillCrossed.push(name);
  }
  assert.deepEqual(stillCrossed, [], 'clips shipping with sustained crossed wrists');
});

test('limb lever (§531): ships OPEN on both joints, and zero is still bit-exact identity', () => {
  /* RE-DERIVED FROM THE INVERTED CLAIM, not patched: §479.6 shipped this lever at zero because
     the fold measured as the repo's own authored style, and the user has now seen it in motion
     and ruled — "The arms and legs are too tucked in. They should be spread out more." So the
     shipped claim inverts (the set opens by default) and the arm inverts with it, keeping the
     old claim reachable as the faithful A/B rather than deleting it. The lever now covers the
     KNEE as well, which is the half §479.6 had no constant for, and the ruling named.
     DOMAIN (§418.3) — passes on: the shipped build, whose delivered walk elbow AND knee both
     open past the faithful pose by ≥ 10° (RUN below); fails on: __LIMB_OPEN {elbow:0,knee:0},
     RUN below as the faithful arm — bit-exact with the untouched clip, which is the same
     identity claim §479.6 asserted, now carried as the control instead of the default (a lever
     that ignored k fails the ≥10° bar; one that fired at zero fails the bit-exact bar).
     Cannot discriminate: whether 0.45/0.35 is the right amount of spread — that is the user's
     call on the live build, with shots/spread1-* as the evidence pair. */
  const abs = Object.create(null);
  for (const [n, , p] of RIG3.SKELETON) abs[n] = p;
  const rig = (() => {
    const rt = new THREE.Group(), bones = Object.create(null);
    for (const [name, parent, p] of RIG3.SKELETON) {
      const b = new THREE.Object3D();
      const pa = parent === 'root' ? [0, 0, 0] : abs[parent];
      b.position.set(p[0] - pa[0], p[1] - pa[1], p[2] - pa[2]);
      (parent === 'root' ? rt : bones[parent]).add(b);
      bones[name] = b;
    }
    return { rt, bones };
  })();
  const pb = new PoseBuffer(RIG3.BONE_ORDER);
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(rig.bones[n].matrixWorld);
  /* interior angle at any joint, through the real compile+sample path */
  const joint = (clip, t, a3, b3, c3) => {
    pb.clear();
    sampleInto(clip, t, pb, 1);
    for (const n of RIG3.BONE_ORDER) {
      const b = rig.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    }
    rig.rt.updateMatrixWorld(true);
    const a = wp(a3), e = wp(b3), h = wp(c3);
    const u = a.sub(e.clone()).normalize(), w = h.sub(e).normalize();
    return Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1)) * 180 / Math.PI;
  };
  const elbow = (clip, t) => joint(clip, t, 'upperArmL', 'lowerArmL', 'handL');
  const knee = (clip, t) => joint(clip, t, 'upperLegL', 'lowerLegL', 'footL');

  const shipped = buildClipSet('godot').table;
  globalThis.__LIMB_OPEN = { elbow: 0, knee: 0 };
  const faithful = buildClipSet('godot').table;
  delete globalThis.__LIMB_OPEN;

  /* the ruling: BOTH joints must be carried more open than the repo-faithful pose */
  const t = 0.45 * shipped.walk.dur;
  const dElbow = elbow(shipped.walk, t) - elbow(faithful.walk, t);
  const dKnee = knee(shipped.walk, t) - knee(faithful.walk, t);
  assert.ok(dElbow >= 10, `the shipped walk elbow opens only ${dElbow.toFixed(1)}° past faithful — expected ≥ 10`);
  assert.ok(dKnee >= 10, `the shipped walk knee opens only ${dKnee.toFixed(1)}° past faithful — expected ≥ 10`);
  assert.ok(LIMB_OPEN.elbow > 0 && LIMB_OPEN.knee > 0, 'the §531 ruling ships the lever OFF zero on both joints');

  /* zero is still bit-exact — the faithful pose stays reachable, which is what keeps the A/B honest */
  const trOf = (tbl, n) => tbl.walk.bones.find((x) => x.name === n).q;
  for (const n of ['lowerArmL', 'lowerLegL']) {
    assert.notDeepEqual(Array.from(trOf(shipped, n)), Array.from(trOf(faithful, n)),
      `${n} is identical shipped-vs-faithful — the lever is dead on that joint`);
  }
  globalThis.__LIMB_OPEN = { elbow: 0, knee: 0 };
  const again = buildClipSet('godot').table;
  delete globalThis.__LIMB_OPEN;
  for (const n of ['lowerArmL', 'lowerLegL', 'upperArmL', 'upperLegL']) {
    assert.deepEqual(Array.from(trOf(again, n)), Array.from(trOf(faithful, n)),
      `${n}: the faithful build is not reproducible bit-for-bit`);
  }
  /* and the lever must not touch the joints it does not name (the swing stays the animator's) */
  assert.deepEqual(Array.from(trOf(shipped, 'upperArmL')), Array.from(trOf(faithful, 'upperArmL')),
    'the lever moved upperArm — it may only open the distal joints');
  assert.deepEqual(Array.from(trOf(shipped, 'upperLegL')), Array.from(trOf(faithful, 'upperLegL')),
    'the lever moved upperLeg — it may only open the distal joints');

  /* SCOPE: the lever reaches the procedural clips the swap never touched (the idle is the most
     folded pose in the set), and it must still leave `?anim=proc` and §470 alone. Both are
     structural rather than lucky — proc returns before the lever runs, and §470 repaired
     upperArm phase and head pitch, which this lever never writes. */
  const procT = buildClipSet('proc').table;
  for (const n of Object.keys(CLIPS)) {
    assert.equal(procT[n], CLIPS[n], `?anim=proc no longer returns Clips.js by identity for ${n}`);
  }
  /* The witness is DERIVED, not named: §479.17 exempted both IDLE_A idles to elbow 0 (the user
     ruled the standing pose must match the reference, whose elbow folds to 137°), so a hard
     `idle_confident` here would fail for a reason that has nothing to do with scope. Take any
     standing idle that is proc-sourced AND carries no `GODOT_LIMB_OPEN` row — `idle_bored`
     authors its own arm channels and is exempt from nothing, which is why §479.17 left it. */
  const scopeWitness = ['idle_bored', 'idle_confident', 'idle_look', 'perch_idle']
    .find((n) => CLIPS[n] && !CLIP_ORIGIN[n]?.startsWith('godot') && !(GODOT_LIMB_OPEN[n]?.elbow === 0));
  assert.ok(scopeWitness, 'every proc-sourced idle is elbow-exempt — the scope claim has no witness left');
  const idleOpen = elbow(shipped[scopeWitness], 0.5 * shipped[scopeWitness].dur)
    - elbow(procT[scopeWitness], 0.5 * procT[scopeWitness].dur);
  assert.ok(idleOpen >= 10, `${scopeWitness} opens only ${idleOpen.toFixed(1)}° — the regime-wide scope is not reaching proc-sourced clips`);
  /* and the exemption itself is real: the named idles must come through UNOPENED */
  for (const n of ['idle_confident', 'idle_look']) {
    assert.equal(elbow(shipped[n], 0.5 * shipped[n].dur).toFixed(2), elbow(procT[n], 0.5 * procT[n].dur).toFixed(2),
      `${n} was opened by the lever — §479.17 exempts it so the pose can match the reference`);
  }
  for (const n of ['sneak_walk', 'sneak_idle', 'crouch_walk', 'crawl']) {
    for (const bone of ['upperArmL', 'upperArmR', 'head', 'neck', 'hips', 'chest']) {
      const a = shipped[n].bones.find((x) => x.name === bone);
      const b = procT[n].bones.find((x) => x.name === bone);
      if (!a || !b) continue;
      assert.deepEqual(Array.from(a.q), Array.from(b.q),
        `§470 regression risk: ${n}/${bone} moved under the §531 lever`);
    }
  }
  /* the combat chain is exempt by GODOT_LIMB_OPEN — §479.8's contact calibration outranks it */
  for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) {
    const a = shipped[n].bones.find((x) => x.name === 'lowerArmR');
    const b = faithful[n].bones.find((x) => x.name === 'lowerArmR');
    assert.deepEqual(Array.from(a.q), Array.from(b.q), `${n} was opened — the combat exemption is gone`);
  }
});

test('launch pace (§479.7): jump_rise delivers the reference tree\'s own 0.75x, and Falling stays natural', () => {
  /* "Slow down the jump animation." Their tree plays the ground jump through
     `parameters/TimeScale/scale = 0.75` (sly_cooper_anims_4.tscn:48498) — at our old 1.0x the
     launch ran 1.33x faster than their own game ever showed it. Unlike the flip (§478.3) the
     launch needs NO closure inside the airtime (apex/fall re-base it), so the delivered rate is
     their number verbatim, expressed in the alias as `rate` so the constant in the table IS the
     measurement. Falling is NOT retimed: both its tree bindings are bare animation nodes (no
     TimeScale in the path), so 1.0x is its natural delivered rate.
     DOMAIN (§418.3) — passes on: the shipped table (0.5 s bake → 0.6667 s delivered, asserted);
     fails on: the pre-§479.7 wiring, RUN below as the raw GODOT_CLIPS duration (0.5 — the same
     claim inverted: if the alias stopped retiming, jump_rise.dur collapses back to it); cannot
     discriminate: whether 0.75x READS right at game framing — shots/jump1 (before/after, the
     track playhead beside every frame) carries that. */
  const g = buildClipSet('godot').table;
  const authored = GODOT_CLIPS.Jump.dur;
  assert.equal(authored, 0.5, `the Anims27 Jump bake moved (${authored}) — re-derive the rate row`);
  assert.ok(Math.abs(g.jump_rise.dur - authored / 0.75) < 1e-3,
    `jump_rise delivers ${g.jump_rise.dur}s — expected ${(authored / 0.75).toFixed(4)} (authored / their 0.75 TimeScale)`);
  assert.notEqual(g.jump_rise.dur, authored, 'jump_rise fell back to the authored duration — the rate row is dead');
  assert.equal(g.jump_fall.dur, GODOT_CLIPS.Falling.dur, 'Falling must play at its natural rate — their tree has no TimeScale on the fall');
  /* the retime must rescale the key grid with the duration, not stretch the last segment */
  const last = g.jump_rise.bones[0].times[g.jump_rise.bones[0].times.length - 1];
  assert.ok(Math.abs(last - g.jump_rise.dur) < 0.02, `last key at ${last}s sits off the delivered duration ${g.jump_rise.dur}`);
});

/* ---- §479.8 — the combat, pickpocket and hook port ---------------------------------------- */

/** RIG3 FK for a compiled clip: world position of `bone` at `t`, in hips-relative metres.
 *  Hips TRANSLATION is deliberately not applied — every measure below is (hand − hips), which
 *  a whole-rig translation leaves invariant, so the rig only needs its rotations. */
function reachRig() {
  const abs = Object.create(null);
  for (const [n, , p] of RIG3.SKELETON) abs[n] = p;
  const rt = new THREE.Group(), bones = Object.create(null);
  for (const [name, parent, p] of RIG3.SKELETON) {
    const b = new THREE.Object3D();
    const pa = parent === 'root' ? [0, 0, 0] : abs[parent];
    b.position.set(p[0] - pa[0], p[1] - pa[1], p[2] - pa[2]);
    (parent === 'root' ? rt : bones[parent]).add(b);
    bones[name] = b;
  }
  return { rt, bones };
}

test('cane contact (§479.8): the swing\'s contact moment is where `cane_hit` fires, on a measure calibrated against our own set', () => {
  /* "Check to see if the attack animations were properly ported." They were not, and the reason
     is worth the words: an earlier pass of this port read `Canehit`'s peak hand SPEED (14.8 m/s,
     late in the clip) as the strike, and trimmed 0.25 s off the head to bring it forward. The
     fast late moment is the RECOVERY — the hand leaving the target — and the trim deleted the
     actual attack, shipping only the yank back to guard. §442.3: measure the composition.

     The measure is max forward reach of the swinging hand relative to the hips. It is not
     asserted on faith — the CONTROL below runs it on our own procedural combo, where the house
     independently declares the contact by placing `cane_hit`, and the two coincide.

     DOMAIN (§418.3) — passes on: the shipped godot table, whose delivered contact sits within
     one frame of its `cane_hit`, and on the proc control (measure 0.150 vs declared 0.150, RUN
     below as the calibration). Fails on: the pre-fix wiring, RUN below as the raw-timeline
     claim — the strike at t 0.10 lies BEFORE the old 0.25 s cut, so that build's delivered clip
     could not contain it; and on the speed-peak reading, RUN below as the reach at the late
     fast moment being far short of the reach at the real one. Cannot discriminate: whether the
     swing READS as a hit at game framing, or whether contact wants to be earlier or later for
     feel — shots/cane1 (before/after, the track playhead beside every frame) carries that. */
  const rig = reachRig();
  const pb = new PoseBuffer(RIG3.BONE_ORDER);
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(rig.bones[n].matrixWorld);
  /** forward reach (hand − hips on +Z, RIG3's facing) of a compiled clip at time t */
  const reach = (clip, t) => {
    pb.clear();
    sampleInto(clip, t, pb, 1);
    for (const n of RIG3.BONE_ORDER) {
      const b = rig.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    }
    rig.rt.updateMatrixWorld(true);
    return wp('handR').z - wp('hips').z;
  };
  const contactOf = (clip) => {
    let best = -Infinity, bestT = 0;
    for (let t = 0; t <= clip.dur + 1e-9; t += 1 / 240) {
      const r = reach(clip, Math.min(t, clip.dur));
      if (r > best) { best = r; bestT = Math.min(t, clip.dur); }
    }
    return { reach: best, t: bestT };
  };

  const proc = buildClipSet('proc').table;
  const g = buildClipSet('godot').table;

  /* ---- CONTROL: the metric reproduces the house's own authored contact ------------------- */
  const declared = proc.cane_combo_1.events.find((e) => e.n === 'cane_hit').t;
  const measured = contactOf(proc.cane_combo_1).t;
  assert.ok(Math.abs(measured - declared) <= 1 / 60,
    `calibration: max-reach on the PROCEDURAL combo_1 reads ${measured.toFixed(3)}s but the house `
    + `declares cane_hit at ${declared.toFixed(3)}s — the metric is not measuring contact, so nothing below it means anything`);

  /* ---- the shipped godot combos: contact within a frame of the event -------------------- */
  for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) {
    const c = g[n];
    assert.equal(CLIP_ORIGIN[n], 'godot:Canehit', `${n} is not sourced from Canehit (origin ${CLIP_ORIGIN[n]})`);
    const ev = c.events.find((e) => e.n === 'cane_hit');
    assert.ok(ev, `${n} lost its cane_hit event — a swap must never mute the contact beat`);
    const k = contactOf(c);
    assert.ok(Math.abs(k.t - ev.t) <= 1 / 60,
      `${n}: contact measured at ${k.t.toFixed(3)}s, cane_hit fires at ${ev.t.toFixed(3)}s — ${((k.t - ev.t) * 1000).toFixed(0)} ms apart`);
    assert.ok(k.reach > 0.6, `${n}: peak forward reach ${k.reach.toFixed(3)} m — the delivered clip is not extending into a strike`);
  }
  /* combo_3's stomp rides the same beat as its strike, as the proc set had it */
  const c3 = g.cane_combo_3.events;
  assert.equal(c3.find((e) => e.n === 'land').t, c3.find((e) => e.n === 'cane_hit').t,
    'combo_3: the land stomp drifted off the strike beat');

  /* ---- INVERTED, on the raw source: where the strike really is on Canehit's own timeline -- */
  const rawContact = contactOf(g.cane_combo_1);          /* untrimmed, so this IS Canehit's timeline */
  assert.ok(rawContact.t < 0.25,
    `the strike sits at ${rawContact.t.toFixed(3)}s of Canehit; the pre-fix build cut the first 0.25s, `
    + 'so if this ever exceeds the cut the §479.8 story is wrong and the trim was harmless');
  /* the late fast moment is the recovery, not the contact: far less reach there */
  const lateReach = reach(g.cane_combo_1, 0.42);
  assert.ok(lateReach < rawContact.reach - 0.15,
    `reach at the late speed peak (0.42s) is ${lateReach.toFixed(3)} m vs ${rawContact.reach.toFixed(3)} m at contact — `
    + 'if these were comparable, "peak speed = strike" would have been a defensible reading');
});

test('combat/pickpocket/hook wiring (§479.8): sourced from the reference, whole where their tree plays it whole, and ?anim=proc restores every one', () => {
  /* The four verbs the follow-up names, plus the two the CaneSwing family turned out to serve.
     `Canehit` ships WHOLE and at natural rate because their tree fires it that way (no
     TimeScale on `Hit Transition/hit_floor`); `PickPocket` is the one cut, and only at the
     tail — a 4 s idle-bake whose motion is over by ~0.6 s, delivered at the 1.1 s the
     pickpocket state spends on it.
     DOMAIN (§418.3) — passes on: the shipped godot table (six verbs, origins asserted); fails
     on: a regenerated GodotClips.js that dropped any of the five source clips, RUN below as the
     GODOT_CLIPS presence arm, and on a proc build that still carried a godot origin, RUN below
     as the AB arm. Cannot discriminate: whether the poses read correctly on the shipped model —
     shots/cane1 carries that; nor whether hook_swing's near-static hang is RIGHT for our hook
     arc, which is a design read, not a wiring one. */
  for (const src of ['Canehit', 'PickPocket', 'CaneSwing', 'CaneSwing Grab', 'CaneSwing Idle']) {
    assert.ok(GODOT_CLIPS[src], `GodotClips.js no longer carries "${src}" — re-run tools/godot2clips.mjs`);
  }
  const g = buildClipSet('godot').table;
  assert.equal(CLIP_ORIGIN.pickpocket, 'godot:PickPocket');
  assert.equal(CLIP_ORIGIN.hook_grab, 'godot:CaneSwing Grab');
  assert.equal(CLIP_ORIGIN.hook_swing, 'godot:CaneSwing');
  /* Canehit whole: delivered duration IS the authored bake, no trim and no retime */
  assert.equal(g.cane_combo_1.dur, GODOT_CLIPS.Canehit.dur,
    'cane_combo_1 no longer delivers Canehit whole — a trim or retime crept back in');
  /* PickPocket cut at the tail only, to the state's own window */
  assert.equal(GODOT_CLIPS.PickPocket.dur, 4, 'the PickPocket bake moved — re-derive the until row');
  assert.equal(g.pickpocket.dur, 1.1, `pickpocket delivers ${g.pickpocket.dur}s — expected the 1.1 s state window`);
  assert.ok(g.pickpocket.dur < GODOT_CLIPS.PickPocket.dur, 'the until row is dead — the 4 s idle-bake tail is shipping');
  /* the hang loops (the state carries the arc, the clip carries the hold); the catch does not */
  assert.equal(g.hook_swing.loop, true, 'hook_swing must loop — a one-shot hang ends mid-swing');
  assert.equal(g.hook_grab.loop, false, 'hook_grab is a catch, not a cycle');
  /* the dismount flourish has no counterpart in their tree and must stay ours */
  assert.equal(CLIP_ORIGIN.hook_release, 'proc', 'hook_release was swapped — their tree has no dismount clip');
  /* AB: ?anim=proc restores all six */
  const p = buildClipSet('proc');
  for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3', 'pickpocket', 'hook_grab', 'hook_swing']) {
    assert.equal(p.origin[n], 'proc', `?anim=proc left "${n}" on a godot source — the AB seam does not restore it`);
    assert.ok(p.table[n], `?anim=proc has no "${n}" at all`);
  }
});

test('combo chain seam (§525): a motion is never layered on top of itself, and every strike in a mash delivers its full reach', async () => {
  /* THE DEFECT THIS GUARDS. Their tree has exactly ONE ground attack — established in §525 by
     censusing all 24 clips of `SlyCooper_Anims27.gltf` BY CONTENT rather than by name, plus the
     four `[Action Stash]*` in Anims4 (two are byte-identical duplicates of Jump and Walk; the
     other two are an idle and a run variant) and `KeyAction.001` (a single facial morph-weight
     channel on Head_LowPoly, no body motion at all). So all three of our combo slots resolve to
     `godot:Canehit`, and the old mixer put three tracks of that one arc on the body at three
     different phases, each pinned at weight 1.0 for 0.30 s. `PoseBuffer.addQuat` averages them,
     and the average of an arc with itself out of phase is a pose the arc never passes through —
     which is an invented cane direction, because the shipped model sockets the cane rigidly to
     `handR` (`SlyModelDLRig`).

     THE MEASURE is §479.8's, reused rather than reinvented: max forward reach of the swinging
     hand relative to the hips. It is calibrated in the arm above against the house's own
     `cane_hit`, so a number out of it means something.

     DOMAIN (§418.3) — passes on: the shipped godot table under a mashed chain at the real
     cadence (`Combo.update` re-swings at `_elapsed >= _t*0.55`, `TUNE.comboTimes`), where each
     of the three slots delivers a peak within 2% of a clean single swing and no more than two
     tracks are ever live. Fails on: the SAME table with `source` AND `excl` stripped, RUN BELOW
     as the control — that is exactly the pre-§525 mixer (those two fields are the rule's whole
     input), and it reproduces the defect at three live tracks and strikes 2 and 3 short of the
     clean peak.
     Cannot discriminate: whether the chain READS as three hits at game framing, whether the
     cross-fade during the brief 2-track overlap is the right length, or anything about the
     torso, feet or lunge — this reads one hand. `shots/chain1-{before,after}-*` carry the picture. */

  const { Animation } = await import('../src/player/Animation.js');
  const g = buildClipSet('godot').table;
  const rig = reachRig();
  const pb = new PoseBuffer(RIG3.BONE_ORDER);
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(rig.bones[n].matrixWorld);
  const DT = 1 / 60;

  /* Drive the REAL mixer. `_advance` + a manual sample need neither character nor rig, and using
     the real one means a change to fades, track count or the chain rule shows up here. */
  const mash = (table) => {
    const a = new Animation({ warn() {}, emit() {} });
    a.pose = new PoseBuffer(RIG3.BONE_ORDER);
    /* play() resolves through the module-level ACTIVE table, so drive the arm by swapping the
       three entries under test — the same seam the tool uses, and the reason the control below
       is a real control rather than a parallel reimplementation. */
    const saved = {};
    for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) { saved[n] = ACTIVE[n]; ACTIVE[n] = table[n]; }
    try {
      let idx = 0, elapsed = 0, t = 0;
      const peak = { 1: -Infinity, 2: -Infinity, 3: -Infinity };
      let maxLive = 0;
      const swing = () => { idx = idx >= 3 ? 1 : idx + 1; elapsed = 0; a.play(`cane_combo_${idx}`, { fade: 0.08, loop: false, speed: 1 }); };
      swing();
      while (t < 1.2) {
        a._advance(DT, t);
        a.pose.clear();
        const live = [];
        for (const tr of a.tracks) {
          if (!tr.clip || tr.w <= 0.001) continue;
          sampleInto(tr.clip, tr.time, a.pose, tr.w);
          live.push(tr);
        }
        if (live.length) {
          maxLive = Math.max(maxLive, live.length);
          for (const n of RIG3.BONE_ORDER) {
            const b = rig.bones[n]; if (!b) continue;
            if (a.pose.w[n] > 0) b.quaternion.copy(a.pose.q[n]); else b.quaternion.identity();
          }
          rig.rt.updateMatrixWorld(true);
          const r = wp('handR').z - wp('hips').z;
          const dom = live.reduce((x, y) => (y.w > x.w ? y : x));
          const m = /cane_combo_(\d)/.exec(dom.clip.name);
          if (m) peak[m[1]] = Math.max(peak[m[1]], r);
        }
        t += DT; elapsed += DT;
        if (elapsed >= TUNE.comboTimes[idx - 1] * 0.55 && idx < 3) swing();
      }
      return { peak, maxLive };
    } finally { for (const n of Object.keys(saved)) ACTIVE[n] = saved[n]; }
  };

  /* A clean single swing is the yardstick every slot is measured against. */
  let clean = -Infinity;
  for (let t = 0; t <= g.cane_combo_1.dur + 1e-9; t += DT) {
    pb.clear();
    sampleInto(g.cane_combo_1, Math.min(t, g.cane_combo_1.dur), pb, 1);
    for (const n of RIG3.BONE_ORDER) {
      const b = rig.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    }
    rig.rt.updateMatrixWorld(true);
    clean = Math.max(clean, wp('handR').z - wp('hips').z);
  }
  assert.ok(clean > 0.2, `the clean swing's reach (${clean.toFixed(4)}) is implausible — the yardstick is broken, so nothing below means anything`);

  /* ---- CONTROL: strip the rule's INPUTS and the defect must come back ---------------------- */
  /* Both of them. The rule's input was `source` alone at §525; §526 added `excl` for the
     procedural set and `buildClipSet` re-applies it to every regime, so a control that strips
     only `source` no longer reaches the pre-fix mixer — it silently becomes a second copy of the
     "after" arm and the assertions below stop being evidence. That is exactly how this arm failed
     when §526 landed, which is the control doing its job. Strip what `play()` reads, and if a
     third predicate is ever added this must grow with it. */
  const stripped = {};
  for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) { const { source, excl, ...rest } = g[n]; stripped[n] = rest; }
  const before = mash(stripped);
  assert.equal(before.maxLive, 3,
    `CONTROL FAILED: with \`source\`+\`excl\` stripped the mixer should layer three copies of Canehit (that is the pre-§525 build), but maxLive was ${before.maxLive} — `
    + `the control no longer reproduces the defect, so the pass below is not evidence of anything`);
  assert.ok(before.peak[3] < clean * 0.95,
    `CONTROL FAILED: the layered build's third strike reached ${before.peak[3].toFixed(4)} of a clean ${clean.toFixed(4)} — the defect did not reproduce`);

  /* ---- the shipped table: at most a cross-fade, and every strike whole -------------------- */
  const after = mash(g);
  assert.ok(after.maxLive <= 2,
    `the shipped chain put ${after.maxLive} tracks of the same source on the body at once — a motion is being layered on itself again`);
  for (const slot of [1, 2, 3]) {
    assert.ok(after.peak[slot] >= clean * 0.98,
      `strike ${slot} of a mashed chain delivered ${after.peak[slot].toFixed(4)} m of reach against ${clean.toFixed(4)} for a clean single swing `
      + `(${((after.peak[slot] / clean - 1) * 100).toFixed(1)}%) — the chain is smearing strikes together again`);
  }

  /* The procedural set still carries no `source` — the swap-back must restore procedural DATA,
     and a `source` appearing there would mean an imported clip had leaked into it. What changed
     at §526 is only the exclusivity POLICY, which is asserted in its own arm below. */
  const p = buildClipSet('proc').table;
  for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) {
    assert.equal(p[n].source, undefined, `procedural "${n}" carries a source — an imported clip has leaked into the ?anim=proc table`);
  }
});

test('combo chain seam, procedural set (§526): three different strikes are a hand-off, not an average, and the authored escalation survives a mash', async () => {
  /* THE DEFECT THIS GUARDS, and why it is a second arm rather than a parameter of the one above.
     §525 fixed "a motion averaged with ITSELF" — the imported set's shape, where all three slots
     are `godot:Canehit`. The procedural set has three genuinely DIFFERENT strikes, so `source`
     could never match and the rule could not reach it; §525.6 measured the defect there and
     deliberately left it, because `?anim=proc` was then the unbanked baseline of a live A/B. The
     A/B is banked (§525.1, `shots/chain1-*`), so the reason expired and this is the fix.

     The mechanism is the same class stated one level up: `Combo.update` re-swings 0.154 s into a
     0.46 s clip and nothing ended the outgoing strike, so three different strikes ran at full
     weight together. Averaging three DIFFERENT motions is not automatically wrong — that is what
     blending is for — but these are three renditions of ONE action slot and slot 2 is meant to
     INTERRUPT slot 1, not be summed with it. Hence `excl`, beside `source`, on the clip.

     THE MEASURE, and it is deliberately NOT the off-manifold angle. `PoseBuffer.addQuat` slerps
     by `w/(acc+w)`, a normalised weighted mean, so the summed live weight IS the number of
     motions being averaged: 1.00 is a hand-off, 3.00 is a three-way mean. Off-manifold is
     zero-tolerance only when the tracks are the same arc; between two different clips a
     cross-fade leaves both arcs by construction. Fixing this chain RAISED its off-manifold peak
     from 29.8° to 43.0° while removing every 3-track frame — so this arm asserts on summed
     weight and on the authored escalation, and not on that angle.

     DOMAIN (§418.3) — passes on: the procedural table, mashed at the real cadence, where summed
     live weight never exceeds 1.001 and per-slot peak reach rises monotonically as authored.
     Fails on: the SAME table with `excl` stripped, RUN BELOW as the control — the pre-§526
     mixer, which reaches summed weight 3.0 and delivers a NON-rising profile. Cannot
     discriminate: whether the escalation reads at game framing (that is feel and it is hardware
     item 20), the right cross-fade LENGTH at either seam, or anything about torso, feet or the
     left arm — like the arm above it reads one hand. */

  const { Animation } = await import('../src/player/Animation.js');
  const p = buildClipSet('proc').table;
  const rig = reachRig();
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(rig.bones[n].matrixWorld);
  const DT = 1 / 60;

  /* Drive the REAL mixer through the REAL table seam, exactly as the arm above does. */
  const mash = (table) => {
    const a = new Animation({ warn() {}, emit() {} });
    a.pose = new PoseBuffer(RIG3.BONE_ORDER);
    const saved = {};
    for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) { saved[n] = ACTIVE[n]; ACTIVE[n] = table[n]; }
    try {
      let idx = 0, elapsed = 0, t = 0, maxW = 0;
      const peak = { 1: -Infinity, 2: -Infinity, 3: -Infinity };
      const swing = () => { idx = idx >= 3 ? 1 : idx + 1; elapsed = 0; a.play(`cane_combo_${idx}`, { fade: 0.08, loop: false, speed: 1 }); };
      swing();
      while (t < 1.4) {
        a._advance(DT, t);
        a.pose.clear();
        const live = [];
        let wsum = 0;
        for (const tr of a.tracks) {
          if (!tr.clip || tr.w <= 0.001) continue;
          sampleInto(tr.clip, tr.time, a.pose, tr.w);
          live.push(tr); wsum += tr.w;
        }
        if (live.length) {
          maxW = Math.max(maxW, wsum);
          for (const n of RIG3.BONE_ORDER) {
            const b = rig.bones[n]; if (!b) continue;
            if (a.pose.w[n] > 0) b.quaternion.copy(a.pose.q[n]); else b.quaternion.identity();
          }
          rig.rt.updateMatrixWorld(true);
          const r = wp('handR').z - wp('hips').z;
          const dom = live.reduce((x, y) => (y.w > x.w ? y : x));
          const m = /cane_combo_(\d)/.exec(dom.clip.name);
          if (m) peak[m[1]] = Math.max(peak[m[1]], r);
        }
        t += DT; elapsed += DT;
        if (elapsed >= TUNE.comboTimes[idx - 1] * 0.55 && idx < 3) swing();
      }
      return { peak, maxW };
    } finally { for (const n of Object.keys(saved)) ACTIVE[n] = saved[n]; }
  };

  /* The three slots are three DIFFERENT clips, so each needs its OWN clean peak — §525.6's
     "every strike loses about a quarter" came from measuring all three against the largest of
     the three, and that artefact is corrected in §526.1. */
  const soloPeak = (clip) => {
    const pb = new PoseBuffer(RIG3.BONE_ORDER);
    let best = -Infinity;
    for (let t = 0; t <= clip.dur + 1e-9; t += DT) {
      pb.clear();
      sampleInto(clip, Math.min(t, clip.dur), pb, 1);
      for (const n of RIG3.BONE_ORDER) {
        const b = rig.bones[n]; if (!b) continue;
        if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
      }
      rig.rt.updateMatrixWorld(true);
      best = Math.max(best, wp('handR').z - wp('hips').z);
    }
    return best;
  };
  const solo = [1, 2, 3].map((i) => soloPeak(p[`cane_combo_${i}`]));
  assert.ok(solo[0] < solo[1] && solo[1] < solo[2],
    `the procedural chain is supposed to ESCALATE — solo peaks came back ${solo.map((s) => s.toFixed(4)).join(' / ')}, which is not rising, so the premise of this arm is gone`);

  /* ---- CONTROL: strip `excl` and the defect must come back -------------------------------- */
  const stripped = {};
  for (const n of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) { const { excl, ...rest } = p[n]; stripped[n] = rest; }
  const before = mash(stripped);
  assert.ok(before.maxW > 2.5,
    `CONTROL FAILED: with \`excl\` stripped the procedural mash should pile three strikes to a summed weight near 3.0 (the pre-§526 mixer), but the max was ${before.maxW.toFixed(2)} — `
    + `the control no longer reproduces the defect, so the pass below is not evidence of anything`);
  const bRise = before.peak[1] <= before.peak[2] && before.peak[2] <= before.peak[3];
  assert.equal(bRise, false,
    `CONTROL FAILED: the piled build still delivered a rising profile (${[1, 2, 3].map((i) => before.peak[i].toFixed(4)).join(' / ')}) — the defect did not reproduce`);

  /* ---- the shipped procedural table: a hand-off, and the escalation intact ---------------- */
  const after = mash(p);
  assert.ok(after.maxW <= 1.001,
    `the procedural chain summed ${after.maxW.toFixed(2)} of live weight — above 1.0 is an AVERAGE of that many strikes, not a cross-fade between two of them`);
  assert.ok(after.peak[1] <= after.peak[2] && after.peak[2] <= after.peak[3],
    `a mashed procedural chain delivered ${[1, 2, 3].map((i) => after.peak[i].toFixed(4)).join(' / ')} — the authored escalation `
    + `(${solo.map((s) => s.toFixed(4)).join(' / ')}) is being flattened again`);
  for (const slot of [1, 2, 3]) {
    assert.ok(after.peak[slot] >= solo[slot - 1] * 0.95 && after.peak[slot] <= solo[slot - 1] * 1.08,
      `strike ${slot} delivered ${after.peak[slot].toFixed(4)} m against its OWN clean peak of ${solo[slot - 1].toFixed(4)} `
      + `(${((after.peak[slot] / solo[slot - 1] - 1) * 100).toFixed(1)}%) — a strike that is well over its authored reach is being dragged by the one overlapping it`);
  }
});

test('landing/launch seam (§529): a whole-body posture is replaced by the next one, never averaged with it', async () => {
  /* THE DEFECT THIS GUARDS. `Land` and `Skid` fire a one-shot that IS the body's entire pose and
     then never re-assert it as a base clip. Nothing in the mixer could end such a track (§527's
     ceiling: `_demoteOthers` skipped non-loops, `play()` called it only for loops, `_advance`
     waits for the clip's own duration), so a landing absorb held weight 1.0 straight through the
     launch that replaced it. `PoseBuffer.addQuat` is a NORMALISED mean, so the two did not
     overdrive — they AVERAGED, and the mean of a landing and a launch is neither.

     Driven from the REAL state machine in `tools/landseam.mjs`, pre-fix: `land -> jump` held
     `land_soft` + `jump_rise` for 383 ms at summed weight 2.167, and `skid -> jump` reached 3.00
     with `skid_stop` still live through the following landing. `shots/land1-*` carry the picture:
     at the worst beat he is neither skidding nor launching but hanging at rest, arms at his sides.

     THE MEASURE is §526.2's, reused rather than reinvented: SUMMED LIVE WEIGHT is the number of
     motions being averaged. 1.00 is a hand-off; 2.00 is a two-way mean. A per-clip channel sum
     cannot see this at all — every track plays its authored arc correctly and the defect exists
     only in the composition.

     DOMAIN (§418.3) — passes on: the shipped table in every regime, where asserting a new base
     clip over a live posture one-shot cross-fades it out and summed weight stays at 1.00. Fails
     on: the SAME table with `posture` stripped, RUN BELOW as the control — that is exactly the
     pre-§529 mixer, since `posture` is the rule's whole input, and it reproduces the 2.00 mean.
     Cannot discriminate: whether the resulting pose LOOKS right (it reads weight, not geometry —
     two clips that happen to agree score the same as two that fold him in half); nor anything
     about the six other states §527 flagged, which carry no `posture` flag and are untouched
     here; nor whether the cross-fade's LENGTH is the right one for the verb. */

  const { Animation } = await import('../src/player/Animation.js');
  const DT = 1 / 60;

  /** The set is asserted, not assumed: a clip gaining or losing `posture` must be deliberate. */
  /* `double_jump` and `roll` joined at §530, on the same evidence and by the same mechanism: both
     are whole-body one-shots whose state asserts no base clip. `Bounce` fires `double_jump` and
     leaves it averaged 50/50 with the `jump_rise` it rebounds out of (350 ms); `Roll` fires `roll`,
     which at 0.66 s outlives its own 0.44 s state and rode the launch, the fall AND the next
     landing — run-wide summed weight 3.000, matching `skid_stop`, the worst §529 found. */
  const POSTURE = ['double_jump', 'land_hard', 'land_roll', 'land_soft', 'roll', 'skid_stop'];
  for (const regime of ['proc', 'godot', 'mixamo']) {
    const t = buildClipSet(regime).table;
    const got = Object.keys(t).filter((n) => t[n]?.posture).sort();
    assert.deepEqual(got, POSTURE,
      `${regime}: posture clips are [${got}], expected [${POSTURE}] — the rule's reach changed. `
      + 'It travels with the game NAME so that swapping the data behind a verb cannot change it.');
  }

  /**
   * Drive the mixer the way `Land -> Jump` drives it: the posture one-shot fires, then one frame
   * later the incoming state asserts ITS clip as a looping base — which is what `Jump.update`'s
   * `baseClip('jump_rise')` does on the frame after `Jump.enter`'s `oneShot`.
   */
  const seam = (table) => {
    const a = new Animation({ warn() {}, emit() {} });
    a.pose = new PoseBuffer(RIG3.BONE_ORDER);
    const saved = {};
    for (const n of [...POSTURE, 'jump_rise']) { saved[n] = ACTIVE[n]; ACTIVE[n] = table[n]; }
    try {
      let maxSum = 0, both = 0, sustained = 0, gone = Infinity;
      a.play('land_soft', { fade: 0.08, loop: false });
      for (let f = 0; f < 40; f++) {
        if (f === 3) a.play('jump_rise', { fade: 0.08, loop: false });   // Jump.enter
        if (f === 4) a.play('jump_rise', { fade: 0.10, loop: true });    // Jump.update's baseClip
        a._advance(DT, f * DT);
        let sum = 0, live = new Set();
        for (const tr of a.tracks) { if (!tr.clip || tr.w <= 0.001) continue; sum += tr.w; live.add(tr.clip.name); }
        maxSum = Math.max(maxSum, sum);
        if (sum > 1.05) sustained++;
        if (live.has('land_soft') && live.has('jump_rise')) both++;
        if (gone === Infinity && f > 4 && !live.has('land_soft')) gone = f;
      }
      return { maxSum, both, sustained, gone };
    } finally { for (const n of Object.keys(saved)) ACTIVE[n] = saved[n]; }
  };

  for (const regime of ['proc', 'godot']) {
    const table = buildClipSet(regime).table;

    /* ---- CONTROL: strip the rule's input and the average must come back ------------------ */
    /* `posture` is the third predicate `play()` reads, after `source` (§525) and `excl` (§526).
       Every control that reconstructs the pre-fix mixer has to strip ALL of them — a control that
       strips only the older ones silently becomes a second copy of the treatment arm and its
       assertions stop being evidence while still passing. That is exactly how the §525 control
       broke when §526 landed. If a fourth predicate is ever added, this must grow with it. */
    const stripped = {};
    for (const n of [...POSTURE, 'jump_rise']) { const { posture, ...rest } = table[n]; stripped[n] = rest; }
    const before = seam(stripped);
    const ownLength = table.land_soft.dur / DT;
    /* Pre-fix the landing DOES eventually go — on its own authored duration, because that is the
       only thing that could ever end it. (An earlier draft of this arm asserted it never leaves at
       all; the control failed and was right to. `_advance` ends a one-shot at `tr.time >= dur`, so
       in a 40-frame window a 0.42 s clip expires at frame ~33 on its own. The defect was never
       "it runs forever" — it is "nothing but its own length can end it".) So the control pins that
       it survived essentially its whole authored length, which is what the fix has to change. */
    assert.ok(before.gone >= ownLength * 0.8,
      `CONTROL FAILED (${regime}): with \`posture\` stripped the landing should have survived to its own `
      + `authored duration (~${ownLength.toFixed(0)} frames) because nothing else can end it, but it went at `
      + `frame ${before.gone} — the control is not reproducing the pre-§529 mixer`);
    /* Scaled to the clip, not a bare 20: `land_soft` is 0.42 s procedurally and 0.25 s in the
       imported set, so an absolute frame count is a different demand in each regime — and it
       failed the godot arm at 18 for exactly that reason. What is regime-independent is that the
       average persists for about as long as the clip itself. */
    assert.ok(before.sustained >= ownLength * 0.8,
      `CONTROL FAILED (${regime}): with \`posture\` stripped the landing should sit under the launch for roughly `
      + `its own length (~${ownLength.toFixed(0)} frames), but summed weight exceeded 1.05 on only `
      + `${before.sustained} — the control is not reproducing the defect`);
    assert.ok(before.maxSum > 1.9,
      `CONTROL FAILED (${regime}): with \`posture\` stripped the landing should sit under the launch at a summed `
      + `weight near 2.0 — that is the pre-§529 mixer — but the max was ${before.maxSum.toFixed(3)}. `
      + 'The control no longer reproduces the defect, so the pass below is not evidence of anything.');

    /* ---- the shipped table: a cross-fade, one weight falling as the other rises ---------- */
    /* THE INVARIANT IS DURATION, NOT PEAK, and the difference is the whole of §526.2's lesson.
       Summed weight above 1.0 *during a hand-over* is what a hand-over IS — one weight falling
       while the other rises, and for one frame both are high. What made this a defect was that
       neither ever fell. So the arm bounds how LONG the average persists, and keeps a loose cap
       on the peak beside it.

       The residual is real and is reported rather than tuned away: `jump_rise` fires as a
       one-shot one frame before `Jump.update` asserts it as a base, and only that second call
       retires the landing, so a single frame sums to 1.167. Flagging `jump_rise` `posture` too
       would erase it — and is deliberately NOT done: `Jump` is one of the thirteen self-cleaning
       states and has no defect of its own, so widening the rule to shave one frame off another
       state's fix would be exactly the blanket application §527 warned against. Driven from the
       real machine the residual is smaller still: `land -> jump` shows NO overlap at all (both
       `enter`s land in one frame, so the absorb never rises) and `skid -> jump` peaks at 0.750. */
    const after = seam(table);
    /* THE MECHANISM ASSERTION, and it is the one that cannot be satisfied by tuning a number:
       the outgoing posture must actually LEAVE. Pre-fix it never does inside the window — it is
       pinned at weight 1.0 until its own duration expires — so `gone` is Infinity in the control
       and a small frame index here. */
    assert.ok(after.gone <= 12,
      `${regime}: the landing was still live ${after.gone === Infinity ? 'for the whole window' : `at frame ${after.gone}`} `
      + 'after the launch asserted itself — the incoming posture is not retiring the outgoing one');
    assert.ok(after.sustained <= 6,
      `${regime}: summed live weight stayed above 1.05 for ${after.sustained} frames against ${before.sustained} pre-fix — `
      + 'a cross-fade of the authored length (0.08 s in, 0.10 s out) is expected; this is long enough to be an average again');
    assert.ok(after.maxSum <= 1.2,
      `${regime}: the landing and the launch peaked at ${after.maxSum.toFixed(3)} summed weight — a one-frame `
      + 'hand-over transient is expected, but this is high enough to be an average again');
    assert.ok(after.both < before.both,
      `${regime}: the two clips were live together for ${after.both} frames against ${before.both} pre-fix — `
      + 'the outgoing posture is not being retired by the incoming one');
  }

  /**
   * §443.1 — EVERY LANDING STILL SPEAKS. The rule can end `land_soft` on the very frame it starts
   * (a jump buffered into the landing preempts `Land` inside one frame, so the absorb is cancelled
   * outright rather than blended). Its `land`/`footstep` events must still fire: `_advance` runs
   * `_trackEvents` BEFORE it reaps a finished track, and this pins that ordering, because the
   * obvious "tidy" reordering would silently mute the landing beat on the commonest input in the
   * game and no pose or weight assertion above would notice.
   */
  const fired = [];
  const a2 = new Animation({ warn() {}, emit: (e) => fired.push(e) });
  a2.pose = new PoseBuffer(RIG3.BONE_ORDER);
  a2.play('land_soft', { fade: 0.08, loop: false });
  a2.play('jump_rise', { fade: 0.08, loop: true });          // demotes land_soft on frame 0
  a2._advance(DT, 0);
  assert.ok(fired.includes('footstep'),
    `a landing cancelled on its first frame emitted [${fired}] — the landing has gone silent (§443.1)`);
});

test('hook chain seam (§530): a catch and a release are one slot, and a re-catch restarts rather than inheriting', async () => {
  /* THE DEFECT THIS GUARDS, and it is §525's shape at LEVEL scale. §575 shipped five lamp rings on
     a cable down the nave — the route's first repeated-same-verb chain. Driven ring to ring on the
     shipped level in `tools/hookchain.mjs`, at both cadences the chain can be played at, two
     things went wrong at every hop:

       1. `hook_release` and `hook_grab` sat on the body TOGETHER, both at full weight, summed
          3.000 for 533 ms of a ~2 s traverse. A body cannot be letting go of a rope and biting
          into one at the same instant.
       2. `play()`'s "already running? retarget it" branch does not reset `tr.time`. That is right
          for a base clip — MOVEMENT re-asserts those every frame and a restart would stutter the
          cycle — and wrong for a one-shot, which is fired at a MOMENT. A catch landing inside the
          grab's own 0.44 s therefore inherited the previous catch's playhead, so the throw-and-bite
          at t 0…0.22 never played: 2 of the 4 hops, at both cadences.

     THE REFERENCE SETTLES IT STRUCTURALLY. `jump_swing` (the release off a swing) and
     `jump_cane_grab` are two INPUTS of the single `jump_state` `AnimationNodeTransition`, feeding
     the one `OneShot` everything downstream sees. A Transition is winner-take-all, so selecting
     one deselects the other — their graph cannot hold a catch and a release together, exactly as
     §529 found it cannot hold a landing and a launch together. Every input carries `reset = true`,
     which is the same statement about (2).

     ONE FLAG CLOSES BOTH, which is why no fourth predicate was added to `play()`. `excl:
     'hook_bite'` (§526's mechanism, unchanged) makes the release END the grab. A chain alternates
     catch and release by construction, so the grab is always `ending` by the time the next catch
     fires, and `play()`'s retarget branch — which requires `!tr.ending` — cannot be reached: a
     fresh track is allocated from t 0.

     THE MEASURE is §526.2's, reused: summed live weight is the number of motions being averaged.
     The bound here is 2.0 rather than 1.0, and that is deliberate — `hook_grab` over `hook_swing`
     IS an authored layer (§529 classified `hookSwing` as the one exposed state where the one-shot
     is meant to ride over its own base), so a catch legitimately sits at 2.000 over the hang. What
     may not happen is a THIRD motion, and that is what the assertion is written against.

     DOMAIN (§418.3) — passes on: the shipped table in every regime, driven at the catch/release/
     re-catch cadence `tools/hookchain.mjs` measured off the real machine, where the re-catch starts
     from t≈0 and summed weight never reaches 2.5. Fails on: the SAME table with `excl` cleared,
     RUN BELOW as the control — the pre-§530 mixer, which inherits a playhead past 0.3 and piles
     grab+release+swing to 3.0. Cannot discriminate: whether the catch READS as a catch at game
     framing (that is what `shots/hook1-*` is for — this reads weight and playhead, not geometry);
     nor the right cross-fade LENGTH at either seam; nor anything about the grab-over-swing layer
     itself, which it deliberately permits at 2.000 and which the reference does not author at all. */

  const { Animation } = await import('../src/player/Animation.js');
  const DT = 1 / 60;

  /** The slot is asserted, not assumed: a clip joining or leaving it must be deliberate. */
  const SLOT = ['hook_grab', 'hook_release'];
  for (const regime of ['proc', 'godot', 'mixamo']) {
    const t = buildClipSet(regime).table;
    const got = Object.keys(t).filter((n) => t[n]?.excl === 'hook_bite').sort();
    assert.deepEqual(got, SLOT,
      `${regime}: the 'hook_bite' slot holds [${got}], expected [${SLOT}] — the rule's reach changed. `
      + 'It travels with the game NAME so that swapping the data behind a verb cannot change it.');
  }

  /**
   * Drive the mixer through ONE chain hop at the cadence the real machine produced: catch at 0,
   * release 250 ms later, re-catch 50 ms after that — i.e. the second catch lands 300 ms in,
   * comfortably inside `hook_grab`'s own 0.44 s, which is the whole point. The `mash` cadence in
   * `tools/hookchain.mjs` measured exactly this (catch f0, release f15, catch f18).
   */
  const hop = (table) => {
    const a = new Animation({ warn() {}, emit() {} });
    a.pose = new PoseBuffer(RIG3.BONE_ORDER);
    const saved = {};
    for (const n of [...SLOT, 'hook_swing', 'jump_fall']) { saved[n] = ACTIVE[n]; ACTIVE[n] = table[n]; }
    try {
      let maxW = 0, maxLive = 0, reT = null;
      const grab = () => { a.play('hook_grab', { fade: 0.08, loop: false }); a.play('hook_swing', { fade: 0.18, loop: true }); };
      grab();
      for (let f = 0; f < 40; f++) {
        if (f === 15) { a.play('hook_release', { fade: 0.08, loop: false }); a.play('jump_fall', { fade: 0.14, loop: true }); }
        if (f === 18) grab();
        a._advance(DT, f * DT);
        let w = 0, n = 0;
        for (const tr of a.tracks) { if (!tr.clip || tr.w <= 0.001) continue; w += tr.w; n++; }
        maxW = Math.max(maxW, w); maxLive = Math.max(maxLive, n);
        /* The playhead of the grab the RE-CATCH started — the youngest instance that is not
           already fading out. Reading `find()` here instead would return the OUTGOING grab and
           report the fix as a failure; that is not hypothetical, it is what `hookchain` did. */
        if (f === 19) {
          const live = a.tracks.filter((tr) => tr.clip?.name === 'hook_grab' && tr.w > 0.001);
          const fresh = live.filter((tr) => !tr.ending);
          reT = (fresh.length ? fresh : live).sort((x, y) => x.time - y.time)[0]?.time ?? null;
        }
      }
      return { maxW, maxLive, reT };
    } finally { for (const n of Object.keys(saved)) ACTIVE[n] = saved[n]; }
  };

  for (const regime of ['proc', 'godot']) {
    const table = buildClipSet(regime).table;

    /* ---- CONTROL: clear the slot and both defects must come back ------------------------- */
    const stripped = {};
    for (const n of [...SLOT, 'hook_swing', 'jump_fall']) stripped[n] = table[n];
    for (const n of SLOT) { const { excl, ...rest } = table[n]; stripped[n] = rest; }
    const before = hop(stripped);
    assert.ok(before.reT != null && before.reT > 0.28,
      `CONTROL FAILED (${regime}): with the slot cleared the re-catch should INHERIT the first catch's `
      + `playhead (~0.32 s into a 0.44 s clip), but it read ${before.reT} — the control no longer `
      + 'reproduces the defect, so the pass below is not evidence of anything');
    assert.ok(before.maxW > 2.5,
      `CONTROL FAILED (${regime}): with the slot cleared a catch, a release and a hang should average `
      + `to a summed weight near 3.0 (the pre-§530 mixer), but the max was ${before.maxW.toFixed(3)}`);

    /* ---- the shipped table: the catch restarts, and nothing is averaged three ways -------- */
    const after = hop(table);
    assert.ok(after.reT != null && after.reT <= 0.05,
      `${regime}: the second catch of a chain started at t=${after.reT} instead of ~0 — it is inheriting `
      + 'the previous catch\'s playhead, so the throw-and-bite that IS the grab never plays');
    assert.ok(after.maxW <= 2.001,
      `${regime}: a chain hop summed ${after.maxW.toFixed(3)} of live weight. Above 2.0 means a THIRD `
      + 'motion joined the authored grab-over-hang layer, and the only candidate is the release');
  }
});

test('idle arm clearance (§479.10): the standing idles keep daylight between the arms, measured on the SKIN not the skeleton', async () => {
  /* The user, on the shipped build carrying §531/§532's lever: "The arms are still crossed when
     in the idle position." Every instrument this lane owns said clean — `uncross.mjs` reports 0
     crossed clips, the §479.5 census reports none — because they all share one predicate:
     *is the hand BONE ORIGIN past the other hand's bone origin?* An arm is not a point. Gloves
     are ~10 cm across and a forearm is a tube, so one arm can lap the other's volume with both
     origins politely on their own sides. That predicate is the boundary, not the clip list:
     idle was always INSIDE the census loop and always reported clean.

     This arm measures what the eye measures — the signed lateral gap between the left arm's
     skinned geometry and the right arm's, in the pose's own shoulder-line frame. Negative means
     the two arms occupy each other's side.

     DOMAIN (§418.3) — passes on: the shipped build's three standing idles, every sampled phase
     (RUN below); fails on: `idle_look` at elbow lever 0.75, which is what the user was looking
     at — RUN below as the contrast, and it reads about -6.7 cm at its worst phase, so the
     metric can say "crossed". Cannot discriminate: whether an overlap READS as crossed at game
     framing (shots/idlecross carries that), nor whether a pose whose arms MEET on purpose —
     wall_run, the mantle, a hard landing — is a defect; those are legitimately negative and are
     deliberately not swept here. */
  const { SlyModel } = await import('../src/player/SlyModel.js');
  const engine = {
    quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
    warn: () => {}, get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  };
  const sly = new SlyModel(engine);
  await sly.init();
  const pb = new PoseBuffer(sly.boneNames);
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);
  const ARM_L = ['shoulderL', 'upperArmL', 'lowerArmL', 'handL'];
  const ARM_R = ['shoulderR', 'upperArmR', 'lowerArmR', 'handR'];
  const _v = new THREE.Vector3();

  /** Signed lateral gap in cm between the two arms' skinned point clouds. */
  const gapCm = (clip, t) => {
    pb.clear();
    sampleInto(clip, t, pb, 1);
    for (const n of sly.boneNames) {
      const b = sly.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
      if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
    }
    const base = sly.bp('hips');
    sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
    sly.root.updateMatrixWorld(true);
    const lat = at('upperArmL').sub(at('upperArmR')); lat.y = 0; lat.normalize();
    const hip = at('hips');
    const latOf = (p) => p.clone().sub(hip).dot(lat);
    let lMin = Infinity, rMax = -Infinity; const L = [], Rr = [];
    sly.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const g = o.geometry, pos = g.attributes.position;
      const sIdx = g.attributes.skinIndex, sW = g.attributes.skinWeight;
      if (!sIdx || !sW) return;
      const names = o.skeleton.bones.map((b) => b.name);
      for (let v = 0; v < pos.count; v++) {
        let wl = 0, wr = 0;
        for (let k = 0; k < 4; k++) {
          const w = sW.getComponent(v, k); if (w <= 0) continue;
          const nm = names[sIdx.getComponent(v, k)];
          if (ARM_L.includes(nm)) wl += w; else if (ARM_R.includes(nm)) wr += w;
        }
        if (wl < 0.6 && wr < 0.6) continue;
        _v.fromBufferAttribute(pos, v);
        if (o.applyBoneTransform) o.applyBoneTransform(v, _v); else o.boneTransform(v, _v);
        _v.applyMatrix4(o.matrixWorld);
        const x = latOf(_v);
        if (wl >= 0.6) { if (x < lMin) lMin = x; L.push(_v.clone()); } else { if (x > rMax) rMax = x; Rr.push(_v.clone()); }
      }
    });
    let d3 = Infinity;
    const sL = Math.max(1, Math.floor(L.length / 400)), sR = Math.max(1, Math.floor(Rr.length / 400));
    for (let i = 0; i < L.length; i += sL) for (let j = 0; j < Rr.length; j += sR) {
      const d = L[i].distanceToSquared(Rr[j]); if (d < d3) d3 = d;
    }
    return { lat: (lMin - rMax) * 100, near: Math.sqrt(d3) * 100 };
  };

  /* §479.15 — THE BAR IS THE FRAME-FREE ONE. `lat` projects both arms onto the SHOULDER line,
     which was the right frame while every arm hung off the chest (§479.5) and is the wrong one
     the moment a hand is pinned to the PELVIS: a torso twist then rotates the measuring frame
     out from under the hand and the projection collapses while the arms stay put. It is also
     provably blind to the defect the user reported three times — it scored the old
     hands-meet-in-front idle at +10.3 cm of "daylight" while the shipped rig photographed ZERO
     clearance (§479.14). `near` is the nearest distance between the two arms' skinned point
     clouds in 3D: no frame, no projection, and it still discriminates (RUN below, and `hurt`
     reads 0.8 cm / `pole_climb` 0.2 cm under it). `lat` stays MEASURED and reported so the
     projection is on the record, but the assertion is `near`. */
  const IDLES = ['idle_confident', 'idle_bored', 'idle_look'];
  const shipped = buildClipSet('godot').table;
  const bad = [];
  for (const name of IDLES) {
    const c = shipped[name];
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const g = gapCm(c, f * c.dur);
      if (g.near <= 4.0) bad.push(`${name}@${(f * 100).toFixed(0)}% ${g.near.toFixed(1)}cm (lat ${g.lat.toFixed(1)})`);
    }
  }
  assert.deepEqual(bad, [], 'a standing idle has its arms inside each other — the pose the player looks at most');

  /* CONTRAST, RUN (§418.3's fails-on, re-derived for the frame-free bar): the predicate can say
     no, and the input it says no to is a real shipped clip rather than a synthetic one —
     `ledge_climb`'s mantle presses both gloves onto the lip and closes them to 0.7 cm. (It is a
     mantle: the hands BELONG together there, which is why this is a contrast input and not a
     defect report.) If a future edit opens that mantle, this line is the one to re-derive.

     WHAT THIS ARM NO LONGER CLAIMS, stated rather than quietly dropped: until §479.15 the
     contrast lifted `GODOT_LIMB_OPEN.idle_look` and watched the arms cross, because the idle's
     left hand hung in FRONT of the belly where an elbow-fold lever could drive it into the right
     arm. With the hand re-solved onto the hip (§479.15) that is no longer reachable — lifting the
     exemption now leaves 12.2 cm — so the exemption is no longer what holds this pose clear; the
     pose is. The row is still pinned below, because it still governs the elbow FOLD the user
     asked about in §531, but the "it is the only thing standing between them" claim is retired
     with its measurement. */
  const hurtNear = (() => {
    const c = shipped.ledge_climb;
    let w = Infinity;
    for (let i = 0; i <= 10; i++) w = Math.min(w, gapCm(c, i / 10 * c.dur).near);
    return w;
  })();
  assert.ok(hurtNear < 4.0, `contrast arm: ledge_climb's mantle reads ${hurtNear.toFixed(1)} cm — expected the arms to close `
    + 'inside the bar, proving the predicate discriminates; re-derive if the mantle was re-authored');

  /* and the exemption row still EXISTS and still caps — asserted by mechanism rather than by
     its number, which is the §479.17 lesson: that round took the row 0.45 → 0 for a different
     reason (the pose must match the reference, whose elbow folds to 137°), and a blind pin on
     0.45 would have reddened a change it has no opinion about. What this arm actually needs is
     that `idle_look` is held BELOW the set-wide rung, so the lever cannot straighten the arm
     across the body — any such rung satisfies it, and the clearance measurements above are the
     real bar. */
  const cap = GODOT_LIMB_OPEN.idle_look?.elbow;
  assert.ok(cap !== undefined && cap < LIMB_OPEN.elbow,
    `the §479.10 exemption row is what holds the idle clear — idle_look elbow ${cap} must sit below the set-wide ${LIMB_OPEN.elbow}`);
});

test('idle variants (§479.11): the boredom timer reaches the tree, and both later idles actually play', async () => {
  /* THE DEFECT THIS HOLDS. `Moveset.js:141` rotates three standing idles on a boredom timer
     (confident → bored at 6 s → look at 13 s), but all three are TREE_CLIPS, and `play()`'s
     tree branch consumed the NAME and handed the body to the tree — whose stance-0 idle node
     is the literal string 'idle_confident'. So `idle_bored` and `idle_look` were requested
     every frame and never once reached the screen. Two rounds of idle work were spent on a
     pose no player could see: §479.10 measured `idle_look` crossing and exempted it from the
     lever, and the shipped-rig capture that was supposed to prove the repair photographed
     `idle_confident` four times under three different labels (its telemetry `clip` field came
     back EMPTY on all seven frames — tree-driven clips are not in `tracks` — which is why the
     mislabelling survived the review; the tool now records `idleVariant` per frame).
     DOMAIN (§418.3) — passes on: play('idle_look') making isPlaying('idle_look') true and the
     tree sample carry its keys (RUN below, all three variants); fails on: the pre-fix
     resolution, RUN below as the node's literal clip — TREE's stance-0 entry is still the
     string 'idle_confident', so asserting the node name alone would pass on the broken build
     while the variant assertion fails. Cannot discriminate: whether the variant LOOKS right on
     the shipped rig — shots/idlecross carries that, per-frame `idleVariant` on every capture. */
  const { Animation } = await import('../src/player/Animation.js');
  const a = new Animation({ warn() {}, emit() {} });
  a.pose = new PoseBuffer(RIG3.BONE_ORDER);
  a.setLocomotion({ speed: 0, grounded: true, maxSpeed: 7.2 });
  for (const want of ['idle_confident', 'idle_bored', 'idle_look']) {
    a.play(want, { fade: 0.3 });
    for (let i = 0; i < 40; i++) { a.pose.clear(); a._advance(1 / 60, i / 60); a._sampleTree(1 / 60); }
    assert.equal(a.idleVariant, want, `the tree kept showing ${a.idleVariant} after MOVEMENT asked for ${want}`);
    assert.ok(a.isPlaying(want), `isPlaying('${want}') is false right after playing it — the variant never reached the tree`);
    /* THE DISCRIMINATOR, and the pre-fix build's exact failure: the tree's stance-0 node
       RESOLVES to the requested variant. The node's literal clip name is still
       'idle_confident' (TREE is unchanged), so a test that asserted the literal would pass on
       the broken build; this asserts the resolution, which is what the renderer samples. */
    assert.equal(a._nodeClip(0)?.name, want,
      `the tree's idle node resolved to ${a._nodeClip(0)?.name} while MOVEMENT asked for ${want}`);
    assert.ok(a.pose.w.chest > 0, `${want} delivered no chest weight — the tree sampled nothing`);
  }
  /* the swap is a CROSSFADE, not a cut: mid-fade both variants are live */
  a.play('idle_confident', { fade: 0.3 });
  for (let i = 0; i < 40; i++) { a.pose.clear(); a._advance(1 / 60, i / 60); a._sampleTree(1 / 60); }
  a.play('idle_look', { fade: 0.3 });
  for (let i = 0; i < 9; i++) { a.pose.clear(); a._advance(1 / 60, i / 60); a._sampleTree(1 / 60); }
  assert.ok(a.idleBlend > 0.05 && a.idleBlend < 0.95, `mid-fade blend is ${a.idleBlend} — the variant swap cut instead of blending`);
  assert.equal(a.idlePrev, 'idle_confident', 'the outgoing variant is not being held under the incoming one');
});

test('idle arm spread (§479.16): the standing idle carries both arms OUT to the side, toward Sly 2\'s own Standupright', async () => {
  /* The user's ruling, after seeing §479.15's hand-on-hip: *"the default pose seems to be worse.
     For the pose, have arms spread further out to the side to be more similar to the default
     pose of the character in Sly 2."*

     THE BAR IS THE REFERENCE'S, MEASURED, not a number anyone picked. `tools/idleref.mjs` reads
     their default standing idle — `Standupright`, resolved off their own graph (`floor_state`
     input 3 "idle stand"; both crouch inputs take `Crouching stand` instead) — and it carries
     each hand ~10 cm outboard of its own shoulder with the hands 47.7 cm apart. Ours delivered
     43.6 cm, and the RIGHT hand sat 3.6 cm *inboard* of its own shoulder: the cane arm was
     behind the torso, which is why the pose read narrow from the front however wide the left
     arm went. The assertion is therefore per-arm and signed — "outboard of your own shoulder" is
     the thing that was false — plus the spread itself.

     Measured on the DELIVERED table (`buildClipSet('godot')`), because the shipped idles are
     procedural clips that STILL pass through §531's limb lever (Animation.js), so `CLIPS.idle_*`
     is not what the player sees — the raw clip reads 14.1 cm where the delivered pose reads 24.8.

     DOMAIN (§418.3) — passes on: the shipped `idle_confident` / `idle_look` (RUN below, both
     hands outboard, spread within 2.5 cm of the reference's 47.7 — §479.17 made the reference
     the target rather than the floor, see the band note below); fails on: the pre-§479.16 chain, RUN below
     by restoring its three left/right triples into the same pose and re-measuring — the right
     hand comes back at −3.6 cm and the spread collapses to 43.6. Cannot discriminate: whether
     the pose READS as "spread out to the side" — the user has reported this pose three times
     with every instrument passing, so the frames (shots/idle16-*, front-verified through the
     §479.14 camDot guard) are the acceptance evidence and this arm is only the tripwire. */
  const { SlyModel } = await import('../src/player/SlyModel.js');
  const engine = {
    quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
    warn: () => {}, get: () => null, has: () => false, on: () => () => {}, emit: () => {},
  };
  const sly = new SlyModel(engine);
  await sly.init();
  const pb = new PoseBuffer(sly.boneNames);
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);

  /** hand-outboard per arm (cm, + = outboard of its OWN shoulder) and hand-to-hand spread. */
  const carry = (clip, t) => {
    pb.clear();
    sampleInto(clip, t, pb, 1);
    for (const n of sly.boneNames) {
      const b = sly.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
      if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
    }
    const base = sly.bp('hips');
    sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
    sly.root.updateMatrixWorld(true);
    const lat = at('upperArmL').sub(at('upperArmR')); lat.y = 0; lat.normalize();
    const out = (S) => (S === 'L' ? 1 : -1)
      * at(`hand${S}`).sub(at(`upperArm${S}`)).dot(lat) * 100;
    return { L: out('L'), R: out('R'), sep: at('handL').sub(at('handR')).dot(lat) * 100 };
  };

  const REF_SEP = 47.7;                       // Standupright, measured — the anchor
  /* §479.17 CHANGES THE SHAPE OF THIS BAR, and the change is the user's, not a loosening.
     §479.16 read "further out to the side" as a direction and made the reference a FLOOR
     (`sep >= 47.7`, delivered 61.7). The user then looked at the result: "The static pose does
     not appear to be the same as the godot repo." So the reference is now the TARGET, and a
     floor is the wrong predicate for a target — being 14 cm wider than Sly 2 passes a floor and
     fails the ruling. The band is ±2.5 cm (~5%), which is wider than the solve's residual
     (47.1–47.7 across both idles' cycles) and far tighter than either failure it must catch:
     §479.15's 43.6 cm narrow pose and §479.16's 61.7 cm splayed one both sit outside it.
     The per-arm "outboard of your own shoulder" checks are UNCHANGED — that is §479.16's real
     find, it survives the retarget of the goalposts, and it is the one thing the coordinator
     asked be kept whatever the reference says. */
  const BAND = 2.5;
  const shipped = buildClipSet('godot').table;
  const bad = [];
  for (const name of ['idle_confident', 'idle_look']) {
    const c = shipped[name];
    const m = carry(c, c.hold);
    if (m.L <= 2) bad.push(`${name}: left hand ${m.L.toFixed(1)} cm — not outboard of its shoulder`);
    if (m.R <= 2) bad.push(`${name}: right (cane) hand ${m.R.toFixed(1)} cm — tucked behind the torso, the §479.16 defect`);
    if (Math.abs(m.sep - REF_SEP) > BAND) {
      bad.push(`${name}: hands ${m.sep.toFixed(1)} cm apart — off Sly 2's own ${REF_SEP} by more than ${BAND} cm`);
    }
  }
  assert.deepEqual(bad, [], 'the standing idle no longer matches the reference’s spread');

  /* CONTRAST, RUN: the pre-§479.16 arm chain, spliced into the REAL idle_confident so the body
     — and therefore the shoulder-line frame the measurement uses — is the shipped one. Building
     the old arms on a bare skeleton instead measures a different pose in a different frame and
     reads +12.8 cm, which is how this contrast failed on its first draft. */
  const OLD = {
    shoulderL: [24, -13, -5], upperArmL: [8, 3, -26], lowerArmL: [-58, -23, -50], handL: [22, -28, -14],
    shoulderR: [-4, -7, 11], upperArmR: [-4, -12, 20], lowerArmR: [-52, 18, 12], handR: [-6, 16, 10],
  };
  const oldArms = compile('oldarms', {
    dur: 1, loop: true, hold: 0.5,
    keys: [{ t: 0, e: 'soft', P: { ...OLD } }, { t: 1, e: 'soft', P: { ...OLD } }],
  });
  const I = new THREE.Quaternion(), q = new THREE.Quaternion();
  const openTrack = (tr) => {
    if (tr.name !== 'lowerArmL' && tr.name !== 'lowerArmR') return tr;
    const o = new Float32Array(tr.q.length);
    for (let i = 0; i < tr.q.length; i += 4) {
      q.set(tr.q[i], tr.q[i + 1], tr.q[i + 2], tr.q[i + 3]); q.slerp(I, LIMB_OPEN.elbow);
      o[i] = q.x; o[i + 1] = q.y; o[i + 2] = q.z; o[i + 3] = q.w;
    }
    return { ...tr, q: o };
  };
  const OLD_NAMES = new Set(Object.keys(OLD));
  const base = shipped.idle_confident;
  const spliced = { ...base, bones: [
    ...base.bones.filter((tr) => !OLD_NAMES.has(tr.name)),
    ...oldArms.bones.filter((tr) => OLD_NAMES.has(tr.name)).map(openTrack),
  ] };
  const before = carry(spliced, base.hold);
  console.log(`    [contrast] pre-§479.16 cane arm ${before.R.toFixed(1)} cm outboard, spread ${before.sep.toFixed(1)} cm`);
  assert.ok(before.R < 2, `contrast arm: the pre-§479.16 cane arm reads ${before.R.toFixed(1)} cm outboard — `
    + 'expected it INBOARD (about -3.6), proving this predicate discriminates the two poses');
});

test('play direction (§479.18): pole_climb runs BACKWARDS, the way their tree plays it', () => {
  /* THE DEFECT THIS HOLDS, and it is the §479.8 class one layer deeper. `pole_climb` was
     name-correct and content-wrong: their `pole_state` input 1 ("pole_walk") reaches
     `Library_Sly_19/PoleClimbing` through a node carrying `play_mode = 1`, which is Godot's
     PLAY_MODE_BACKWARD (`Scenes/Character Mesh/sly_cooper_anims_4.tscn`). We played it forward.
     Exactly two nodes in their whole tree carry that flag and BOTH are clips we swapped —
     PoleClimbing and CaneSwing — but only one of them needs reversing, and that is a
     measurement rather than a guess: sampling pose(t) against pose(dur−t) over the cycle,
     PoleClimbing differs by 35.4° worst / 8.7° mean (DIRECTIONAL) while CaneSwing differs by
     0.2° (PALINDROMIC — its backward flag is invisible, so `hook_swing` is deliberately NOT
     reversed; churning it would be motion without a reason).
     DOMAIN (§418.3) — passes on: the shipped table, whose pole_climb reproduces the reversed
     source to < 1° and departs from the FORWARD source by > 8° (both RUN below, lever off so
     the comparison isolates direction from §531); fails on: the pre-§479.18 wiring, RUN below
     as the forward build — it matches forward and not reversed, the same claim inverted.
     Cannot discriminate: whether the climb READS right in situ on a real drainpipe — that is
     the hardware sheet's, and shots/pole1-* carries the on-camera half. */
  const abs = Object.create(null);
  for (const [n, , p] of RIG3.SKELETON) abs[n] = p;
  const rig = (() => {
    const rt = new THREE.Group(), bones = Object.create(null);
    for (const [name, parent, p] of RIG3.SKELETON) {
      const b = new THREE.Object3D();
      const pa = parent === 'root' ? [0, 0, 0] : abs[parent];
      b.position.set(p[0] - pa[0], p[1] - pa[1], p[2] - pa[2]);
      (parent === 'root' ? rt : bones[parent]).add(b);
      bones[name] = b;
    }
    return { rt, bones };
  })();
  const pb = new PoseBuffer(RIG3.BONE_ORDER);
  const JOINTS = ['lowerArmL', 'lowerArmR', 'upperArmL', 'upperArmR', 'lowerLegL', 'lowerLegR'];
  const wq = (n) => {
    const q = new THREE.Quaternion();
    rig.bones[n].matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    return q;
  };
  const pose = (clip, t) => {
    pb.clear();
    sampleInto(clip, t, pb, 1);
    for (const n of RIG3.BONE_ORDER) {
      const b = rig.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    }
    rig.rt.updateMatrixWorld(true);
    return Object.fromEntries(JOINTS.map((j) => [j, wq(j)]));
  };
  const worstBetween = (A, B, dur) => {
    let w = 0;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20 * dur, a = pose(A, t), b = pose(B, t);
      for (const j of JOINTS) {
        const d = a[j].clone().invert().multiply(b[j]);
        w = Math.max(w, 2 * Math.acos(Math.min(1, Math.abs(d.w))) * 180 / Math.PI);
      }
    }
    return w;
  };
  /* lever OFF so this arm measures DIRECTION, not §531's elbow — with it on, the donor fill and
     the open elbow put 80° between the shipped clip and any bare-source comparison and the
     direction signal is unreadable. That confusion is why this note exists. */
  globalThis.__LIMB_OPEN = { elbow: 0, knee: 0 };
  const shipped = buildClipSet('godot').table.pole_climb;
  delete globalThis.__LIMB_OPEN;
  const src = GODOT_CLIPS.PoleClimbing;
  const fwd = compile('fwd', src);
  const rev = compile('rev', { ...src, keys: src.keys.map((k) => ({ ...k, t: +(src.dur - k.t).toFixed(4) })).reverse() });

  assert.ok(worstBetween(shipped, rev, shipped.dur) < 1.0,
    `shipped pole_climb is not the reversed source (worst ${worstBetween(shipped, rev, shipped.dur).toFixed(2)}°)`);
  assert.ok(worstBetween(shipped, fwd, shipped.dur) > 8.0,
    'shipped pole_climb still matches the FORWARD source — the reverse flag is dead');
  /* the clip really is directional, and its sibling really is not — the reason only one moved */
  const selfRev = (clip) => {
    let w = 0;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20 * clip.dur, a = pose(clip, t), b = pose(clip, clip.dur - t);
      for (const j of JOINTS) {
        const d = a[j].clone().invert().multiply(b[j]);
        w = Math.max(w, 2 * Math.acos(Math.min(1, Math.abs(d.w))) * 180 / Math.PI);
      }
    }
    return w;
  };
  assert.ok(selfRev(fwd) > 8, 'PoleClimbing reads as palindromic — re-derive, the reversal would be pointless');
  assert.ok(selfRev(compile('cs', GODOT_CLIPS.CaneSwing)) < 5,
    'CaneSwing is no longer palindromic — its play_mode=1 now matters and hook_swing needs the same reversal');
});

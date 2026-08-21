import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { CLIPS, REQUIRED, sampleInto } from '../src/player/Clips.js';
import { PoseBuffer } from '../src/player/Rig.js';
import { MIXAMO_CLIPS } from '../src/player/MixamoClips.js';
import { buildClipSet, ACTIVE, CLIP_REGIME, CLIP_ORIGIN } from '../src/player/Animation.js';
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
     repo's movement animations). Its table is Clips.js BY IDENTITY except for exactly the names
     the audit swapped, each of which must be a real substitution sourced from GodotClips.js.
     DOMAIN — passes on: the shipped build (swapped set ⊇ double_jump, everything else the same
     objects every past KNOWN_ISSUES measurement was taken against); fails on: the pre-FrontFlip
     build, RUN here as buildClipSet('proc') — its double_jump has no godot origin (asserted
     below, the same check inverted); cannot discriminate: whether a swap LOOKS right — that is
     the on-camera audit's job, frames in shots/, not an object-identity test's. */
  assert.equal(CLIP_REGIME, 'godot', 'a plain `node` import must resolve to the default regime');
  let swapped = 0, kept = 0;
  for (const n of Object.keys(CLIPS)) {
    if (CLIP_ORIGIN[n] === 'proc') {
      assert.equal(ACTIVE[n], CLIPS[n], `unswapped "${n}" is not the procedural clip by identity`);
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
       repo has no sneak, so its identity doubles as the scope guard. */
    assert.notEqual(s.table.double_jump, CLIPS.double_jump, `token ${JSON.stringify(t)} lost the default's swaps`);
    assert.equal(s.table.sneak_walk, CLIPS.sneak_walk, `token ${JSON.stringify(t)} swapped the §470 sneak gait`);
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
  /* contrast: the metric can say "crossed" — ko is still in the census's crossed idiom */
  const ko = sepOf([[CLIPS.ko, 0.5 * CLIPS.ko.dur, 1]]);
  assert.ok(ko < 0, `contrast arm: ko @0.5 reads sep ${ko.toFixed(3)} m — expected the old crossed idiom; ` +
    'if the §479.5 census backlog was just uncrossed, re-derive this line from the census');
});

test('elbow lever (§479.6): ships at 0 bit-exact, and a boot override opens the fold through the real FK', () => {
  /* The user reads the swapped set's elbows as "too tucked in". Measured three ways
     (tools/armcross.mjs): the fold is the SOURCE's authored creep (Walk elbows 69–129° vs our
     proc 142–153°), and the retarget already opens it ~15–19° (rest-direction delta between the
     rigs) — so the knob is taste, not repair, and it SHIPS AT ZERO: the delivered set stays
     faithful to the repo until the user turns it. `GODOT_ELBOW_OPEN` (or the `__ELBOW_OPEN`
     boot override, the same pre-module seam as `__ANIM_AB`) scales lowerArm rotations toward
     bind by the given fraction.
     DOMAIN (§418.3) — passes on: __ELBOW_OPEN {walk:0.5} opening the mid-swing elbow by ≥ 20°
     (RUN below: 87.5° → ~134°); fails on: the same override leaving the tracks identical — the
     identity claim inverted, RUN below as the k=0 arm (a broken lever that ignored k would fail
     the ≥20° bar; a lever that fired at k=0 would fail the bit-exact bar). Cannot discriminate:
     whether 0.35 is the right taste — that is the hardware sheet's row (item 19) and the
     shots/elb1 pair, not a unit bar. */
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
  const elbow = (clip, t) => {
    pb.clear();
    sampleInto(clip, t, pb, 1);
    for (const n of RIG3.BONE_ORDER) {
      const b = rig.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    }
    rig.rt.updateMatrixWorld(true);
    const a = wp('upperArmL'), e = wp('lowerArmL'), h = wp('handL');
    const u = a.sub(e.clone()).normalize(), w = h.sub(e).normalize();
    return Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1)) * 180 / Math.PI;
  };
  const shipped = buildClipSet('godot').table;
  globalThis.__ELBOW_OPEN = { walk: 0.5 };
  const opened = buildClipSet('godot').table;
  globalThis.__ELBOW_OPEN = { walk: 0 };
  const zeroed = buildClipSet('godot').table;
  delete globalThis.__ELBOW_OPEN;
  const t = 0.45 * shipped.walk.dur;
  const base = elbow(shipped.walk, t), open = elbow(opened.walk, t);
  assert.ok(open - base >= 20, `k=0.5 opens the walk mid-swing elbow by ${(open - base).toFixed(1)}° — expected ≥ 20`);
  /* k=0 must be BIT-EXACT with the shipped build, not merely similar */
  const trOf = (tbl) => tbl.walk.bones.find((x) => x.name === 'lowerArmL').q;
  assert.deepEqual(Array.from(trOf(zeroed)), Array.from(trOf(shipped)), 'k=0 override must not touch a single float');
  /* and the opened build must differ — the inverted identity, so this arm can say no both ways */
  assert.notDeepEqual(Array.from(trOf(opened)), Array.from(trOf(shipped)), 'k=0.5 left the lowerArm track untouched — the lever is dead');
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

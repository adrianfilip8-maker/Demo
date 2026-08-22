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
     with `skid_stop` still live through the following landing. `shots/land1/*` carry the picture:
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
  const POSTURE = ['land_hard', 'land_roll', 'land_soft', 'skid_stop'];
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

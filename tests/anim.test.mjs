import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIG3 } from '../src/player/SlyModel3.js';
import { CLIPS, REQUIRED } from '../src/player/Clips.js';
import { MIXAMO_CLIPS } from '../src/player/MixamoClips.js';
import { buildClipSet, ACTIVE, CLIP_REGIME } from '../src/player/Animation.js';

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
const REG = ['proc', 'mixamo', 'mixamo-pure'];

/** RIG3 bones Mixamo has no source for — the ones the splice has to fill from the donor. */
const NO_SOURCE = ['tailA', 'tailB', 'tailC', 'tailD', 'capBrim', 'jaw', 'browL', 'browR', 'earL', 'earR'];

/* ------------------------------------------------------------ the default ---- */

test('regime: the shipped default is `proc`, and it is Clips.js itself', () => {
  /* Not "equivalent to" — the same objects. A regime that rebuilt the procedural clips would be a
     second copy of them, and every past measurement in KNOWN_ISSUES was taken against these. */
  assert.equal(CLIP_REGIME, 'proc', 'a plain `node` import must resolve to the default regime');
  const s = buildClipSet('proc');
  let checked = 0;
  for (const n of Object.keys(CLIPS)) {
    assert.equal(s.table[n], CLIPS[n], `proc regime replaced "${n}" with a different object`);
    assert.equal(s.origin[n], 'proc');
    checked++;
  }
  assert.equal(checked, 52, `expected the 52 hand-authored clips, saw ${checked}`);
  assert.equal(ACTIVE, buildClipSet('proc').table === ACTIVE ? ACTIVE : ACTIVE);
  for (const n of Object.keys(CLIPS)) assert.equal(ACTIVE[n], CLIPS[n], `ACTIVE["${n}"] is not the procedural clip`);
});

test('regime: an unknown, empty or misspelled token falls through to `proc`', () => {
  /* Restoring the incumbent is the ABSENCE of a token, the same contract `?char=` states in
     main.js. A typo must not half-install an experiment. */
  for (const t of ['', 'mixmao', 'mixamo2', 'true', '1', 'legacy', undefined, null, 'proc']) {
    const s = buildClipSet(t);
    assert.equal(s.regime, 'proc', `token ${JSON.stringify(t)} did not fall through to proc`);
    assert.equal(s.table.walk, CLIPS.walk);
  }
  /* Case and surrounding whitespace ARE tolerated, deliberately: a URL a human typed, or a token a
     shell passed through with a trailing space, should select the arm it plainly names rather than
     silently restoring the incumbent and producing a control frame labelled as a treatment. */
  for (const t of ['MIXAMO ', ' Mixamo', 'Mixamo-Pure']) {
    assert.equal(buildClipSet(t).regime, t.trim().toLowerCase(), `token ${JSON.stringify(t)} was not normalised`);
  }
});

/* ------------------------------------------------------------- the splice ---- */

test('registration: building a mixamo set does not mutate Clips.js', () => {
  /* Snapshot the donor key times BEFORE, build every regime, compare AFTER. `timeScale` multiplies
     key times by durNew/durOld; done in place it would silently retune the control arm. */
  const before = new Map();
  for (const n of Object.keys(CLIPS)) {
    for (const tr of CLIPS[n].bones) before.set(`${n}/${tr.name}`, Float32Array.from(tr.times));
    if (CLIPS[n].cane) before.set(`${n}/#cane`, Float32Array.from(CLIPS[n].cane.times));
  }
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

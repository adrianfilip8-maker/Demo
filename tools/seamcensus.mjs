#!/usr/bin/env node
/**
 * seamcensus — every transition in the moveset that can put two one-shots on the body at once.
 *
 * WHY THIS EXISTS (§527). §525 found one seam by looking at one seam. §526 found the same defect
 * in the procedural set. The mechanism — *a motion averaged with itself, or with one it should
 * have replaced* — is a CLASS, not an instance, and the state machine has 32 states. This tool
 * enumerates the whole space rather than sampling it, so "most transitions are fine" becomes a
 * printed list instead of an expectation.
 *
 * ── THE CEILING, derived before anything is driven (§450.4) ────────────────────────────────
 *
 * Read three things in `Animation.js` and the worst case falls out without a single measurement:
 *
 *   1. `_demoteOthers` ends a track only `if (tr.loop)`. A new clip therefore never ends a live
 *      ONE-SHOT — which is correct for a one-shot riding over a base, and is also the whole
 *      mechanism here.
 *   2. `play()` calls `_demoteOthers` only `if (loop)`. A new one-shot demotes nothing at all.
 *   3. `_advance` ends a one-shot only when `tr.time >= tr.clip.dur`, then fades it over
 *      `ANIM_TUNE.fade`.
 *
 * So a one-shot is ended by exactly three things: its own completion, the §525/§526 coalesce
 * rule, or an explicit `stop()`/lock. Nothing else. Two one-shots that overlap therefore both sit
 * at their target weight for the whole overlap, and `PoseBuffer.addQuat` — a NORMALISED
 * incremental slerp, `w/(acc+w)` — averages them 50/50 on every bone they both animate.
 *
 * **That is the ceiling: any overlap of two one-shots is a sustained equal-weight average, not a
 * cross-fade.** A cross-fade has one weight falling while the other rises; here neither falls
 * until its own clip runs out. The worst case per transition is therefore the full remaining
 * lifetime of the outgoing clip, which happens when the incoming state is entered immediately —
 * dwell → 0 — and that is the case this tool drives.
 *
 * ── WHAT IS AND IS NOT A DEFECT ────────────────────────────────────────────────────────────
 *
 * Averaging two DIFFERENT motions is not automatically wrong; blending is what a transition is
 * made of. Three things separate an ordinary blend from the §525/§526 defect, and the tool
 * reports all three rather than collapsing them into a verdict:
 *
 *   · SHARED BONES — two clips that animate disjoint bone sets cannot average each other at all,
 *     whatever their weights. This is the cheapest exoneration and it is checked first.
 *   · OVERLAP LENGTH — four frames of two motions meeting is a transition. Two hundred
 *     milliseconds of both at full weight is a smear, and it is what the combo chain was.
 *   · WHETHER ONE SHOULD HAVE REPLACED THE OTHER — a judgement about the verbs, not a number.
 *     The tool marks the pairs the coalesce rule already covers (same `source`, same `excl`) and
 *     prints the rest for a human to rule on, with the two numbers above beside them.
 *
 * ── REACHABILITY ───────────────────────────────────────────────────────────────────────────
 *
 * The transition graph is not guessed: `--driven <file>` takes the DRIVEN predecessor map that
 * `tests/_smtrace.mjs` records across the whole suite (`SM_TRACE_DIR=… node --test --import
 * ./tests/_smtrace.mjs "tests/*.test.mjs"`, then merge the per-process files). "Driven" means the
 * machine chose the transition inside `update()` — a player could cause it — as opposed to a test
 * reaching in with `sm.set()`. Without the file the tool falls back to the full 32×31 product and
 * says so, which is the sound over-estimate rather than a silent one.
 *
 * `--clips` is REQUIRED and comes from `tools/_clipprobe.mjs`, which records what each state
 * actually asks the mixer for while the suite drives it. See the note above `probeState` for why
 * the base clips cannot be probed offline the way the one-shots can.
 *
 *   SM_TRACE_DIR=t node --test --import ./tests/_smtrace.mjs  "tests/*.test.mjs"   # → driven.json
 *   SM_CLIP_DIR=c  node --test --import ./tools/_clipprobe.mjs "tests/*.test.mjs"  # → clips.json
 *   node tools/seamcensus.mjs --driven driven.json --clips clips.json
 *   node tools/seamcensus.mjs --driven driven.json --clips clips.json --regime proc --json out.json
 *
 * ── WHAT IT CANNOT DISCRIMINATE (§418.3, third line) ───────────────────────────────────────
 *
 * It reads the CLIP TABLE and the mixer, not the game. It cannot see a transition whose real
 * dwell time is always longer than the outgoing clip (it assumes the worst case, dwell → 0, so
 * it OVER-reports rather than under-reports — the sound direction, but it means a flagged pair is
 * a candidate and not yet a bug). It cannot see states that fire a one-shot from `update()` under
 * a condition the probe does not satisfy — those are listed explicitly as `enter-only probe` so
 * the gap is visible rather than assumed away. It says nothing about whether an averaged pose
 * looks wrong; that is what `canelook`/`comboseam` and frames are for. And a pair it exonerates
 * on DISJOINT BONES is exonerated for the skeleton only — two clips can share no bone and still
 * fight over the cane socket or the root offset.
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { PoseBuffer } from '../src/player/Rig.js';
import { RIG3 } from '../src/player/SlyModel3.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REGIME = arg('--regime', 'godot');
const DRIVEN_FILE = arg('--driven', '');
const JSON_OUT = arg('--json', '');

/* Same pre-module seam as comboseam: `play()` resolves through the module-level ACTIVE table that
   Animation.js binds ONCE at load, so a regime set after the import measures the wrong set
   silently. Set before, then assert it took. */
globalThis.__ANIM_AB = REGIME;
const { Animation, ACTIVE, CLIP_REGIME, ANIM_TUNE } = await import('../src/player/Animation.js');
if (CLIP_REGIME !== REGIME) {
  throw new Error(`seamcensus: asked for regime "${REGIME}" but the module loaded "${CLIP_REGIME}" `
    + `— the pre-module seam did not take, and every number below would be from the wrong set.`);
}
const { buildMoveset } = await import('../src/player/Moveset.js');

const DT = 1 / 60;
const BONES = RIG3.SKELETON.map(([n]) => n);

/* ══ 1. state -> the one-shots it fires ═══════════════════════════════════════════════════════
 *
 * Probed, not parsed. A source scan for `oneShot(` cannot resolve `cane_combo_${c.comboIndex}`,
 * cannot follow a subclass that inherits its parent's `enter`, and drifts the moment a call site
 * moves. So each registered state's real `enter()` is invoked against a recording stand-in and
 * the calls are read off. Anything the stand-in cannot satisfy throws, is caught, and is REPORTED
 * — a state whose probe threw is listed rather than silently contributing nothing.
 */
function probeState(st) {
  const fired = [], based = [];
  const mk = () => new Proxy(function () {}, {
    get(_t, k) {
      if (k === 'oneShot') return (name) => { if (name) fired.push(String(name)); };
      if (k === 'baseClip') return (name) => { if (name) based.push(String(name)); };
      if (k === 'play') return () => {};
      if (k === Symbol.toPrimitive || k === 'valueOf') return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;                 // never look thenable
      return mk();
    },
    set() { return true; },
    apply() { return mk(); },
    has() { return true; },
  });
  let threw = null;
  try { st.enter?.(mk()); } catch (e) { threw = `enter: ${e.message}`; }
  return { fired: [...new Set(fired)], based: [...new Set(based)], threw };
}

/**
 * BASE CLIPS ARE NOT PROBED — they are OBSERVED, and the difference cost a whole wrong census.
 *
 * `enter()` probes cleanly against the stand-in above: it is straight-line code and the
 * calibration below proves it reads the real moveset. `update()` does not, and it fails
 * silently in the direction that flatters. Every state's `update` opens with guard clauses —
 * `const l = this.landed(c); if (l) return l;`, `if (c.velocity.y <= 0) return 'fall';` — and a
 * Proxy answers those guards as "grounded and not rising", so the state returns a transition
 * BEFORE reaching its `baseClip` call. The probe reported "no base clip" for nearly every state,
 * which reads like a finding and is an artefact, and a census built on it reported 44 defective
 * pairs that do not exist.
 *
 * So `--clips` takes the map recorded by `tools/_clipprobe.mjs` across the whole suite, where the
 * base clips come from the machine actually running. Without it the tool refuses to guess.
 */
const CLIPS_FILE = arg('--clips', '');
const observed = CLIPS_FILE ? JSON.parse(readFileSync(CLIPS_FILE, 'utf8')) : null;

const moveset = buildMoveset();
const stateOneShots = new Map();
const stateBase = new Map();
const probeFailed = [];
for (const st of moveset) {
  const { fired, threw } = probeState(st);
  stateOneShots.set(st.name, fired);
  stateBase.set(st.name, observed?.[st.name]?.base || []);
  if (threw) probeFailed.push({ state: st.name, threw });
}
if (!observed) {
  console.error('seamcensus: --clips <file> is required (see tools/_clipprobe.mjs). Without the\n'
    + 'observed base clips every state looks like it re-asserts nothing, the incoming state stops\n'
    + 'terminating the outgoing one-shot, and the census reports defects that do not exist.');
  process.exit(2);
}

/* CALIBRATION, run rather than asserted (§439 — an instrument whose arms agree is broken). The
   probe must recover the one-shots we can read with our own eyes at known call sites. If these
   three do not come back, the probe is not reading the moveset and nothing below is evidence. */
const CALIB = [['jump', 'jump_rise'], ['land', 'land_soft'], ['hurt', 'hurt']];
for (const [s, clip] of CALIB) {
  const got = stateOneShots.get(s) || [];
  if (!got.includes(clip)) {
    throw new Error(`seamcensus CALIBRATION FAILED: state "${s}" should fire "${clip}" on enter `
      + `(Moveset.js), probe returned [${got.join(', ') || 'nothing'}] — the probe is not reading the moveset.`);
  }
}

/* ══ 2. reachable transitions ═════════════════════════════════════════════════════════════ */
const NAMES = moveset.map((s) => s.name);
let driven = null;
if (DRIVEN_FILE) driven = JSON.parse(readFileSync(DRIVEN_FILE, 'utf8'));
const pairs = [];
if (driven) {
  for (const [from, tos] of Object.entries(driven)) for (const to of tos) if (from !== to) pairs.push([from, to]);
} else {
  for (const a of NAMES) for (const b of NAMES) if (a !== b) pairs.push([a, b]);
}

/* ══ 3. per-pair drive, at the worst case ════════════════════════════════════════════════════
 *
 * Play A's one-shot, then fire B's on the very next frame (dwell → 0, the worst case the ceiling
 * names), and record the composition every frame through the REAL mixer. `_advance` is the real
 * fade/end machinery, so the coalesce rule, the fade constants and the end condition are all the
 * shipped ones rather than a restatement of them.
 */
/**
 * WHICH BASE CLIPS KILL A LIVE ONE-SHOT — measured, not read off a table.
 *
 * `TREE_CLIPS` is module-private in `Animation.js`, and copying its ten names here would be a
 * restatement that drifts the day the tree changes. The property that actually matters is
 * behavioural — "does asking for this as a base clip end a one-shot that is already live" — so it
 * is probed directly against the real mixer. That also means the census stays correct if the tree
 * branch is ever replaced by some other terminator: it tests the effect, not the implementation.
 */
const TREE_KILLERS = new Set();
for (const name of Object.keys(ACTIVE)) {
  const a = new Animation({ warn() {}, emit() {} });
  a.pose = new PoseBuffer(BONES);
  a.play('jump_rise', { fade: 0.08, loop: false });
  a.play(name, { fade: 0.14, loop: true });
  const victim = a.tracks.find((tr) => tr.clip?.name === 'jump_rise');
  if (!victim || victim.ending) TREE_KILLERS.add(name);
}
if (!TREE_KILLERS.size) throw new Error('seamcensus: no base clip ends a live one-shot — the tree-branch probe is broken, and the census below would exonerate everything.');

function boneSet(clip) {
  const s = new Set();
  for (const tr of clip?.bones || []) s.add(tr.name);
  return s;
}
/**
 * THE REAL FRAME SEQUENCE, and the correction that halved this census.
 *
 * A first version of this drove `play(A)` then `play(B)` and nothing else, and reported that all
 * 40 reachable pairs sustain a 2.00 summed weight. That measured a path the game never takes.
 * Every state re-asserts its BASE clip from `update()` on EVERY frame, and `play()` has a branch
 * above the one-shot logic:
 *
 *     const stance = TREE_CLIPS[name];
 *     if (stance !== undefined) { … for (const tr of this.tracks) if (!tr.lock) this._end(tr, …) }
 *
 * — when the requested name is one of the ten locomotion TREE clips, the body is handed to the
 * blend tree and **every non-locked track is ended, one-shots included**. So a ground state whose
 * base clip is a tree name (`idle`, `move`, `sneak`, `crouch`, and `tiptoe` while moving) is a
 * de-facto one-shot terminator: it kills the outgoing clip on the first frame after the
 * transition. Air and attach states base on NON-tree clips (`jump_rise`, `wall_cling`,
 * `hook_swing`, …), which take the loop path, and `_demoteOthers` ends only loops — so there the
 * outgoing one-shot survives to its own duration.
 *
 * That single asymmetry predicts where the defect can live at all, and it is why this drives the
 * real per-frame call sequence — `oneShot` on enter, `baseClip` every frame — instead of two bare
 * `play` calls. `dwell` is how many frames the machine stays in A before entering B; 1 frame is
 * the worst case the ceiling names.
 */
function driveOne(stA, stB, clipA, clipB, baseA, baseB, dwell = 1) {
  const a = new Animation({ warn() {}, emit() {} });
  a.pose = new PoseBuffer(BONES);
  const oneShot = (n) => a.play(n, { fade: 0.08, loop: false, speed: 1 });
  const base = (n) => { if (n && ACTIVE[n]) a.play(n, { fade: 0.14, loop: true }); };

  oneShot(clipA); base(baseA);
  let t = 0, maxW = 0, overlap = 0, sustained = 0;
  for (let i = 0; i < dwell; i++) { a._advance(DT, t); t += DT; base(baseA); }
  oneShot(clipB); base(baseB);
  const lim = (ACTIVE[clipA].dur + ACTIVE[clipB].dur) * 1.5 + 1;
  while (t < lim) {
    a._advance(DT, t);
    /* SUMMED WEIGHT OVER EVERY LIVE TRACK — the same invariant `comboseam` settled on, and for
       the same reason: `PoseBuffer.addQuat` is a normalised mean, so the sum IS the number of
       motions being averaged. Loops are counted too. A loop that is fading out against a rising
       one-shot sums to 1.00 and is an ordinary hand-off; two things both holding 1.0 sum to 2.00
       and are an average. Counting only non-loop tracks would exonerate exactly the case where a
       state's base clip is still at full weight under the next state's one-shot. */
    let w = 0, live = 0;
    for (const tr of a.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      w += tr.w; live++;
    }
    if (live >= 2) overlap++;
    if (w > 1.001) sustained++;
    maxW = Math.max(maxW, w);
    t += DT;
    base(baseB);
  }
  return { maxW, overlapFrames: overlap, sustainedFrames: sustained, baseA, baseB };
}

/**
 * A state's base clip is CONDITIONAL — `railWalk` asserts `rail_walk` or `balance_idle`, `move`
 * picks among walk/run/run_fast — so there is no single "the" base clip and picking the first of
 * an observed set is picking arbitrarily. An earlier draft did exactly that and reported
 * `railWalk -> jump` as 2950 ms of pile, which is what `balance_idle` gives; `rail_walk` gives a
 * clean hand-off, and the state can be in either condition. So every combination is driven and
 * the WORST is reported, with the base clips that produced it named — an over-estimate by
 * construction, which is the sound direction for a census whose job is to bound the problem.
 */
function drive(stA, stB, clipA, clipB) {
  /* A state that HAS base clips asserts one of them every frame — it never asserts none. Adding
     `undefined` to the candidate list for such a state models a frame that cannot happen and
     inflates the census (it was reporting 40 pairs, most of them on that fiction). Only a state
     with no observed base clip at all gets the no-base case, which for it is the real one. */
  const obsA = stateBase.get(stA) || [], obsB = stateBase.get(stB) || [];
  const basesA = obsA.length ? obsA : [undefined];
  const basesB = obsB.length ? obsB : [undefined];
  let worst = null;
  for (const bA of basesA) for (const bB of basesB) {
    const d = driveOne(stA, stB, clipA, clipB, bA, bB);
    if (!worst || d.sustainedFrames > worst.sustainedFrames || (d.sustainedFrames === worst.sustainedFrames && d.maxW > worst.maxW)) worst = d;
  }
  return worst;
}

/**
 * THE PREDICATE THAT SEPARATES SAFE FROM EXPOSED, and the real shape of this class.
 *
 * A state that re-asserts its own one-shot as its BASE clip (`Jump` fires `oneShot('jump_rise')`
 * and then `baseClip('jump_rise')` every frame) takes `play()`'s retarget path, which sets
 * `tr.loop = true` on the track already running. That clip is now a LOOP — so when the next state
 * asserts ITS base clip, `_demoteOthers` ends it properly, weight falling while the new one rises.
 * Such a state is self-cleaning and cannot leave a one-shot behind.
 *
 * A state that fires a one-shot and never re-asserts it leaves that track a one-shot forever.
 * Nothing demotes a one-shot — not `_demoteOthers`, not the next state's base clip — so it holds
 * its target weight until its own `dur` runs out, underneath whatever the next state plays.
 *
 * `Combo` is the known instance: it asserts no base clip, which is precisely why its slots piled.
 * The same predicate applied to all 32 states is the general statement of §525/§526's class.
 */
const exposed = [];
for (const st of moveset) {
  const ones = stateOneShots.get(st.name) || [];
  const bases = new Set(stateBase.get(st.name) || []);
  for (const c of ones) if (ACTIVE[c] && !bases.has(c)) exposed.push({ state: st.name, clip: c, bases: [...bases] });
}

const rows = [];
let considered = 0;
for (const [from, to] of pairs) {
  const A = stateOneShots.get(from) || [];
  const B = stateOneShots.get(to) || [];
  for (const ca of A) for (const cb of B) {
    if (!ACTIVE[ca] || !ACTIVE[cb] || ca === cb) continue;
    considered++;
    const shared = [...boneSet(ACTIVE[ca])].filter((n) => boneSet(ACTIVE[cb]).has(n));
    const d = drive(from, to, ca, cb);
    const sameMotion = !!ACTIVE[ca].source && ACTIVE[ca].source === ACTIVE[cb].source;
    const sameSlot = !!ACTIVE[ca].excl && ACTIVE[ca].excl === ACTIVE[cb].excl;
    rows.push({
      from, to, ca, cb,
      shared: shared.length,
      maxW: +d.maxW.toFixed(3),
      overlapMs: Math.round(d.overlapFrames * DT * 1000),
      sustainedMs: Math.round(d.sustainedFrames * DT * 1000),
      baseB: d.baseB || null,
      treeKill: d.baseB ? TREE_KILLERS.has(d.baseB) : false,
      covered: sameMotion || sameSlot,
    });
  }
}

/* ══ 4. report ═══════════════════════════════════════════════════════════════════════════ */
const nStates = NAMES.length;
const firing = NAMES.filter((n) => (stateOneShots.get(n) || []).length);
console.log(`\n=== seamcensus — regime "${CLIP_REGIME}" ===\n`);
console.log(`--- the ceiling, derived ---`);
console.log(`states                                : ${nStates}`);
console.log(`ordered state pairs (32x31)           : ${nStates * (nStates - 1)}`);
console.log(`transitions reachable in play (driven): ${driven ? pairs.length : `${pairs.length} (NO --driven FILE: full product, an over-estimate)`}`);
console.log(`states that fire a one-shot on enter  : ${firing.length}  (${firing.join(' ')})`);
console.log(`distinct one-shot clips reached       : ${new Set(rows.flatMap((r) => [r.ca, r.cb])).size}`);
console.log(`clip pairs a reachable transition can co-fire : ${considered}`);
console.log(`worst case per transition             : both one-shots hold target weight for the whole`);
console.log(`  overlap (nothing demotes a one-shot), so the pose is a 50/50 average on shared bones.`);
console.log(`  Bound on overlap = outgoing clip's remaining lifetime (dur + ANIM_TUNE.fade=${ANIM_TUNE.fade}).`);
if (probeFailed.length) {
  console.log(`\n!! probe threw for ${probeFailed.length} state(s) — these contribute NO outgoing clip and may hide a pair:`);
  for (const p of probeFailed) console.log(`     ${p.state}: ${p.threw}`);
}
const noFire = NAMES.filter((n) => !(stateOneShots.get(n) || []).length);
if (noFire.length) console.log(`\n   states with no enter-time one-shot (enter-only probe): ${noFire.join(' ')}`);

const bad = rows.filter((r) => !r.covered && r.shared > 0 && r.sustainedMs > 0)
  .sort((a, b) => b.sustainedMs - a.sustainedMs || b.shared - a.shared);
const disjoint = rows.filter((r) => r.shared === 0);
const covered = rows.filter((r) => r.covered);
const treeKilled = rows.filter((r) => !r.covered && r.treeKill && r.sustainedMs === 0);

console.log(`\n--- the predicate: which states can leave a one-shot behind ---`);
console.log(`A state that re-asserts its own one-shot as its BASE clip promotes that track to a loop,`);
console.log(`and the next state's base clip then demotes it properly. A state that does not, cannot:`);
console.log(`nothing in the mixer ever demotes a one-shot.\n`);
console.log(`  EXPOSED (fires a one-shot it never re-asserts): ${exposed.length}`);
for (const e of exposed) console.log(`    ${e.state.padEnd(13)} leaves ${e.clip.padEnd(16)} base=[${e.bases.join(' ') || 'none'}]`);
const selfClean = moveset.filter((s) => (stateOneShots.get(s.name) || []).some((c) => (stateBase.get(s.name) || []).includes(c)));
console.log(`  SELF-CLEANING (re-asserts its one-shot): ${selfClean.length}  (${selfClean.map((s) => s.name).join(' ')})`);

console.log(`\n--- results ---`);
console.log(`base clips that END a live one-shot (probed): ${TREE_KILLERS.size}  — ${[...TREE_KILLERS].sort().join(' ')}`);
console.log(`pairs already covered by the coalesce rule : ${covered.length}   (max summed weight ${covered.length ? Math.max(...covered.map((r) => r.maxW)).toFixed(2) : 'n/a'})`);
console.log(`pairs the incoming state's TREE base clip ends immediately : ${treeKilled.length}`);
console.log(`pairs exonerated on DISJOINT BONES         : ${disjoint.length}`);
console.log(`pairs that sustain a >1.0 summed weight on shared bones : ${bad.length}`);
if (bad.length) {
  console.log(`\n  ${'from -> to'.padEnd(28)} ${'outgoing / incoming'.padEnd(32)} shared  maxW  sustained  incoming base`);
  for (const r of bad) {
    console.log(`  ${`${r.from} -> ${r.to}`.padEnd(28)} ${`${r.ca} / ${r.cb}`.padEnd(32)} ${String(r.shared).padStart(5)} ${r.maxW.toFixed(2).padStart(6)} ${String(r.sustainedMs + ' ms').padStart(9)}  ${r.baseB || '(none)'}`);
  }
}
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ regime: CLIP_REGIME, ceiling: { nStates, pairs: pairs.length, considered }, rows, probeFailed }, null, 1));
  console.log(`\nwrote ${JSON_OUT}`);
}

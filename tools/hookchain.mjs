#!/usr/bin/env node
/**
 * hookchain — what is live on the body at each CATCH and each RELEASE of a five-ring chain.
 *
 * WHY THIS EXISTS (§530). §525 found one clip fired repeatedly, its instances averaging into a
 * pose that exists in neither, and §526 found the same defect one layer out. §575 then shipped
 * five lamp rings on a cable down the nave — the level's first repeated-same-verb CHAIN. That is
 * the §525 shape one scale up: `hook_grab` fired five times, `hook_release` four, `hook_swing`
 * asserted and demoted five times, all inside a few seconds. §529 established that `hookSwing`
 * is a genuine LAYER — it asserts its own base `hook_swing` beneath the `hook_grab` one-shot, so
 * the `posture` repair would break it rather than fix it. The open question is therefore not
 * whether `posture` applies; it is whether that layer survives being RE-ENTERED five times.
 *
 * WHAT IT MEASURES, and why this and not a pose metric. Identical to `landseam` (§529): summed
 * live track weight is the number of motions `PoseBuffer.addQuat`'s normalised mean is averaging,
 * so 1.00 is a hand-over and 2.00 is a two-way mean. Regime-independent, and it states the class
 * exactly (§442.3 — measure the composition, do not derive the story).
 *
 * PLUS ONE MEASURE `landseam` DID NOT NEED, and it is the one this shape turns on. `play()`'s
 * "already running? retarget it" branch does not reset `tr.time`. So if catch N+1 lands while
 * catch N's `hook_grab` is still live and not yet `ending`, the second catch does NOT restart the
 * clip — it inherits the first one's playhead, and the throw-and-bite that IS the grab (t 0 →
 * 0.22 of 0.44) never plays again. So every catch records the `hook_grab` playhead on the frame
 * after entry. A catch that restarts reads ~0.017; a catch that inherits reads whatever the
 * previous one had reached. That distinction is invisible to weight.
 *
 * THE WORLD IS THE SHIPPED ONE. `realWorld()` — Terrain, Architecture, Props, one BVH — and the
 * five rings are §575's, read out of the level rather than written down here, so a chain that
 * moves shows up as a different measurement rather than as a stale constant. The run is ONE
 * continuous drive: mount ring 0 from the floor by E, then release-and-catch along the line. It
 * is not four independent hops with a reset between them, because the reset is precisely what
 * would hide a defect that only exists in succession.
 *
 * TWO CADENCES, because "quick succession" is the variable under test (§466.5 — two samples):
 *   --cadence mash   E tapped through the flight. `spent()` refuses the ring just left until he
 *                    is `hookAuto` 2.9 m clear of it, so the catch lands near the hop midpoint,
 *                    ~3.5 m out, at up to `hookGrab` 9.0 m. This is a player mashing E, and it
 *                    is the FASTEST legal chain.
 *   --cadence auto   no E at all after the mount; the airborne fly-through auto-grab at 2.9 m
 *                    takes each ring. The slowest legal chain, and the one §575 designed for.
 *
 * THE GUARD (§439, and it is the reason `landseam` is trustworthy). The tool DECLARES that it
 * needs 5 catches and 4 releases and THROWS if the drive did not produce them. A chain tool that
 * reports a confident table for a run that fell off at ring 2 is measuring something else.
 *
 *   node tools/hookchain.mjs                        # shipped mixer, both cadences
 *   node tools/hookchain.mjs --cadence mash
 *   node tools/hookchain.mjs --nofix                # PRE-§530 mixer, for the before arm
 *   node tools/hookchain.mjs --json out.json
 *
 * WHAT IT CANNOT DISCRIMINATE (§418.3, third line). It counts WEIGHT, PLAYHEAD and BONES, never
 * poses: two clips averaged 50/50 score 2.00 whether the mean is grotesque or nearly identical to
 * both, and an inherited playhead scores the same whether the pose it lands on is close to the
 * grab's first frame or nothing like it. It says a defect of this CLASS is present, where, and
 * for how long; whether it READS as wrong is what `shots/chain2-*` is for. It also sees only the
 * two cadences scripted here — silence about a third is a statement about this file.
 */
import './_domshim.mjs';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from '../tests/_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';
import { PoseBuffer } from '../src/player/Rig.js';
import { RIG3 } from '../src/player/SlyModel3.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REGIME = arg('--regime', 'godot');
const JSON_OUT = arg('--json', '');
const WANT = arg('--cadence', '');
const NOFIX = argv.includes('--nofix');

/* The regime must be chosen before Animation.js binds its module-level ACTIVE table (§525.7). */
globalThis.__ANIM_AB = REGIME;
const { Animation, CLIP_REGIME, ACTIVE: TBL } = await import('../src/player/Animation.js');
if (CLIP_REGIME !== REGIME) {
  throw new Error(`hookchain: asked for regime "${REGIME}" but the module loaded "${CLIP_REGIME}" `
    + '— the pre-module seam did not take, and every number below would be from the wrong set.');
}
/**
 * `--nofix` reconstructs the PRE-§530 mixer by stripping the rule's only input off the live clip
 * table, exactly as `landseam --nofix` strips `posture` and `comboseam --nocoalesce` strips
 * `source`/`excl`.
 *
 * THE FIRST VERSION OF THIS BLOCK STRIPPED `posture` ONLY, and it is written up rather than
 * quietly corrected because it produced a control arm that was byte-identical to the treatment
 * arm and read as "no difference found". The chain's repair is `excl: 'hook_bite'`, not `posture`
 * — `posture` is §529's mechanism and does not touch a hook — so the flag was wired downstream of
 * the thing it was supposed to change and measured nothing (§525.7). The COUNT below is what makes
 * that impossible to ship a second time: an inert control throws instead of agreeing.
 */
if (NOFIX) {
  let p = 0, x = 0;
  for (const k of Object.keys(TBL)) {
    if (TBL[k]?.posture) { delete TBL[k].posture; p++; }
    if (TBL[k]?.excl === 'hook_bite') { TBL[k].excl = null; x++; }
  }
  if (x !== 2) {
    throw new Error(`hookchain --nofix: cleared the 'hook_bite' slot from ${x} clips, expected 2 `
      + '(hook_grab, hook_release). A control that does not reach the rule under test silently '
      + 'duplicates the treatment arm and reads as "no difference found" (§525.7).');
  }
  console.log(`!! --nofix: 'hook_bite' cleared from ${x} clips and posture from ${p} — the PRE-§530 mixer.`);
}

const BONES = RIG3.SKELETON.map(([n]) => n);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------- rings ---- */
/**
 * §575's five rings, read off the LEVEL rather than copied. `collision._aff`/`nearest` is what
 * the moveset reads, so the rings are collected the way `afford('hook')` would find them: probe
 * `nearest(p, 'hook', …)` on a coarse grid down the nave and keep the distinct anchor points.
 * A chain that moves therefore changes this measurement instead of quietly invalidating it.
 */
function readRings(collision) {
  const found = [];
  for (let z = -18; z >= -52; z -= 0.5) {
    for (let x = -6; x <= 4; x += 0.5) {
      const a = collision.nearest(V(x, 6.7, z), 'hook', 3.0);
      if (!a) continue;
      if (!found.some((p) => p.distanceTo(a.point) < 1.0)) found.push(a.point.clone());
    }
  }
  found.sort((p, q) => q.z - p.z);          // south (−21) first, walking north
  return found;
}

/* ------------------------------------------------------------------ driving ---- */
async function drive(name, cadence) {
  const { engine, collision, mods, c } = await realWorld();
  const a = new Animation(engine);
  a.pose = new PoseBuffer(BONES);
  mods.animation = a;                        // realWorld's `engine.get` reads `mods`
  c.anim = a;

  const rings = readRings(collision);
  if (rings.length !== 5) {
    throw new Error(`hookchain: read ${rings.length} nave rings from the level, expected §575's 5. `
      + 'The chain moved, or the probe grid no longer covers it — refusing to measure a chain '
      + 'this tool cannot name (§439).');
  }

  /* Every `set()` the machine makes, intra-frame ones included — the machine's own hook, so the
     transition list cannot drift from what it really did (§529 §3). */
  const steps = [];
  let frameNo = 0;
  const prevHook = c.onStateChanged.bind(c);
  c.onStateChanged = (next, prev) => {
    steps.push({ i: frameNo, st: next.name, from: prev?.name ?? null, anchor: c.anchor.clone() });
    return prevHook(next, prev);
  };

  const aim = (p) => {
    const dx = p.x - c.position.x, dz = p.z - c.position.z;
    engine.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
  };

  /* Stand under ring 0 and settle, exactly as `navefork` does — the mount is from the floor. */
  const g0 = collision.groundCheck(V(rings[0].x, 3, rings[0].z), TUNE.radius, 10);
  hardReset(engine, c, V(rings[0].x, (g0?.hit ? g0.y : 0) + 0.35, rings[0].z), Math.PI);
  for (let i = 0; i < 70; i++) {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time += DT; c.update(DT, engine.time); a._advance(DT, engine.time);
  }

  const log = [];
  let target = 0;                 // the ring we are trying to be ON
  let onSince = -1;               // frame the current swing started
  let mounted = false;            // has the chain been entered at all yet?
  const FRAMES = 1200;
  for (let i = 0; i < FRAMES; i++) {
    frameNo = i;
    const inp = engine.input;
    inp.beginFrame(DT); inp.move.x = 0; inp.move.y = 0;

    const onRing = c.stateName === 'hookSwing';
    /* Which ring is he on? By anchor, not by intent — the whole question is whether the machine
       did what the script asked. */
    if (onRing) {
      mounted = true;
      const k = rings.findIndex((p) => p.distanceTo(c.anchor) < 1.0);
      if (k >= 0 && k !== target) { target = k; onSince = i; }
      if (onSince < 0) onSince = i;
    }
    const next = rings[Math.min(target + 1, rings.length - 1)];
    aim(next);
    inp.move.y = 1;                                   // pump forward along the arc

    if (onRing && target < rings.length - 1) {
      /* Release once the swing has wound up. `hookMinSwing` 0.18 s is 11 frames; releasing at
         frame 14 of the swing is a wound-up bail rather than a grab-frame slip.
         `cadence.bail` uses CROUCH instead — `HookSwing.update`'s SECOND exit, which drops to
         `fall` WITHOUT firing `hook_release`. That matters because the `hook_bite` slot repairs
         the inherited playhead only via the release; a crouch-bail leaves the grab live and
         un-ended, so this cadence is what says whether that residual is reachable. */
      if (i - onSince === cadence.release) inp.hold(cadence.bail ? 'crouch' : 'jump');
      else { inp.let_go('jump'); inp.let_go('crouch'); }
    } else {
      inp.let_go('jump'); inp.let_go('crouch');
    }
    /* E is always what MOUNTS the chain — §575's entry is an E press from the floor beneath ring
       0 — so a cadence with no in-flight E still presses until the first catch. */
    const mayPress = cadence.press > 0 || !mounted;
    const per = cadence.press > 0 ? cadence.press : 3;
    if (!onRing && mayPress && i % per === 0) inp.hold('interact'); else inp.let_go('interact');

    engine.time += DT;
    c.update(DT, engine.time);
    a._advance(DT, engine.time);

    const live = [];
    for (const tr of a.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      live.push({ n: tr.clip.name, w: +tr.w.toFixed(3), t: +tr.time.toFixed(3), end: !!tr.ending, loop: !!tr.loop });
    }
    /* WHICH ring, by anchor — the script says which ring it is aiming at, and this says which one
       the machine actually took. A chain that re-grabs the ring it just left is a different
       defect from one that hops, and only the anchor can tell them apart. */
    const held = c.stateName === 'hookSwing' ? rings.findIndex((p) => p.distanceTo(c.anchor) < 1.0) : -1;
    log.push({
      i, st: c.stateName, ring: target, held, sum: +live.reduce((s, l) => s + l.w, 0).toFixed(3), live,
      y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2),
    });
    if (c.position.y < 0.9 && c.grounded && i > 120) break;      // fell off the chain: stop
  }
  return { log, steps, rings };
}

/* ----------------------------------------------------------------- analysis ---- */
const path = (steps) => steps.map((s) => `${s.i}:${s.st}`);

/** The frames on which the machine ENTERED / LEFT `hookSwing`. */
const catchesOf = (steps) => steps.filter((s) => s.st === 'hookSwing').map((s) => s.i);
const releasesOf = (steps) => steps.filter((s) => s.from === 'hookSwing').map((s) => s.i);

const at = (log, i) => log.find((f) => f.i === i) || null;

/**
 * The clip the CATCH just started — and picking it correctly is not a detail; the first version of
 * this function was wrong in the direction that would have hidden the repair.
 *
 * A name can be on more than one track at once, which is exactly what an ordinary cross-fade looks
 * like: the outgoing instance `ending` at a falling weight while the new one rises. `find()` returns
 * whichever the allocator happened to put first, and after the fix that is the OUTGOING grab, still
 * sitting at t 0.433. So the tool reported "restart? NO" on the two catches it had just repaired,
 * with the evidence — two `hook_grab` entries, one of them `↓` — printed in its own live column.
 *
 * Take the track that is not `ending`, and among those the youngest playhead. If every instance is
 * ending there is no new one and `null` is the honest answer (§442.3: measure the composition).
 */
function startedTrack(f, n) {
  const all = (f?.live || []).filter((l) => l.n === n);
  const live = all.filter((l) => !l.end);
  const pick = (live.length ? live : all).slice().sort((a, b) => a.t - b.t)[0];
  return pick || null;
}

function analyse(log) {
  const pairs = new Map();
  for (const f of log) {
    if (f.live.length < 2) continue;
    const k = f.live.map((l) => l.n).sort().join(' + ');
    const e = pairs.get(k) || { frames: 0, maxW: 0 };
    e.frames++; e.maxW = Math.max(e.maxW, f.sum);
    pairs.set(k, e);
  }
  const over = log.filter((f) => f.sum > 1.001);
  return {
    maxSum: +Math.max(0, ...log.map((f) => f.sum)).toFixed(3),
    framesOver1: over.length,
    msOver1: Math.round(over.length * DT * 1000),
    maxLive: Math.max(0, ...log.map((f) => f.live.length)),
    pairs: [...pairs].sort((x, y) => y[1].maxW - x[1].maxW)
      .map(([k, v]) => ({ clips: k, frames: v.frames, maxW: +v.maxW.toFixed(3) })),
  };
}

/** Longest run of frames in which BOTH named clips are live, and the worst sum inside it. */
function overlapOf(log, aName, bName) {
  let best = { frames: 0, maxW: 0, from: -1 }, cur = null;
  for (const f of log) {
    const has = (n) => f.live.some((l) => l.n === n);
    if (has(aName) && has(bName)) {
      if (!cur) cur = { frames: 0, maxW: 0, from: f.i };
      cur.frames++; cur.maxW = Math.max(cur.maxW, f.sum);
    } else if (cur) { if (cur.frames > best.frames) best = cur; cur = null; }
  }
  if (cur && cur.frames > best.frames) best = cur;
  return { ...best, maxW: +best.maxW.toFixed(3), ms: Math.round(best.frames * DT * 1000) };
}

/* -------------------------------------------------------------------- run ---- */
/**
 * TWO CADENCES, and they are the two the CHAIN can actually be played at rather than two numbers
 * picked for spread. `press` is the E period in frames during flight; `release` is how many
 * frames into a swing the jump is tapped (`hookMinSwing` 0.18 s = 11 frames is the floor).
 *
 * `auto` — no E in flight at all, letting `hookAuto` 2.9 m take each ring — is NOT here, and the
 * omission is a measurement rather than a gap: driven at release phases 12…40 it never catches a
 * second ring, because a release tuned to carry 7 m arrives outside a 2.9 m sphere. §575 says the
 * chain's four hops catch, and `navefork` proves it — with E tapped through the flight, which is
 * what both cadences below do. The fly-through grab is for a chain tighter than this one.
 */
const CADENCES = {
  mash: { press: 3, release: 14 },     // E every 50 ms: the fastest legal chain
  lazy: { press: 12, release: 22 },    // E every 200 ms and a fuller wind-up: the slowest that traverses
  bail: { press: 3, release: 14, bail: true },  // crouch off each ring: the exit that fires no release
};
const out = { regime: CLIP_REGIME, nofix: NOFIX, cadences: {} };

for (const [cadence, spec] of Object.entries(CADENCES)) {
  if (WANT && WANT !== cadence) continue;
  /* SPREAD the spec, do not rebuild it. The first version listed `press` and `release` explicitly
     and silently dropped `bail`, so the crouch-bail cadence ran the jump-release script and came
     back byte-identical to `mash` — a third arm that agreed with the first because it WAS the
     first. Same shape as the inert `--nofix` above: a flag wired downstream of what it changes. */
  const { log, steps, rings } = await drive(cadence, {
    ...spec, press: Number(arg('--press', spec.press)), release: Number(arg('--release', spec.release)),
  });
  const cat = catchesOf(steps), rel = releasesOf(steps);
  if (cat.length < 5 || rel.length < 4) {
    throw new Error(`hookchain[${cadence}]: the drive produced ${cat.length} catches and ${rel.length} `
      + `releases; the chain needs 5 and 4. Path was ${path(steps).join(' -> ')}. `
      + 'Refusing to report a chain measurement for a run that did not traverse the chain (§439).');
  }
  /**
   * THE SECOND HALF OF THE GUARD, and it is the one that nearly let a wrong run through. Five
   * `→ hookSwing` transitions is NOT five rings: a chain that re-grabs the ring it just left five
   * times produces exactly the same count, and the first draft of this tool would have reported a
   * confident table for it. The run must visit rings 0…4 in order, read off the ANCHOR.
   */
  const visited = [];
  for (const i of cat) {
    const h = (at(log, i + 1) || at(log, i))?.held ?? -1;
    if (h >= 0 && visited[visited.length - 1] !== h) visited.push(h);
  }
  if (visited.join(',') !== '0,1,2,3,4') {
    throw new Error(`hookchain[${cadence}]: the drive caught rings [${visited.join(',')}], not 0,1,2,3,4. `
      + `${cat.length} catches over ${rel.length} releases. Path was ${path(steps).join(' -> ')}. `
      + 'A chain tool that counts catches without checking WHICH ring is measuring re-grabs (§439).');
  }
  const A = analyse(log);

  /* Per catch: what is live, and — the measure this shape turns on — the `hook_grab` playhead one
     frame after entry. A restart reads ~0.017; an inherited playhead reads the previous catch's. */
  const catches = cat.map((i, k) => {
    const f = at(log, i + 1) || at(log, i);
    const gr = startedTrack(f, 'hook_grab');
    return {
      k, frame: i, ring: f?.held ?? -1, sincePrev: k ? i - cat[k - 1] : null,
      msSincePrev: k ? Math.round((i - cat[k - 1]) * DT * 1000) : null,
      grabT: gr ? gr.t : null, grabW: gr ? gr.w : null,
      restarted: gr ? gr.t <= 0.05 : null,
      sum: f?.sum ?? null, live: (f?.live || []).map((l) => `${l.n}:${l.w}${l.end ? '↓' : ''}`),
    };
  });
  const releases = rel.map((i, k) => {
    const f = at(log, i + 1) || at(log, i);
    return { k, frame: i, sum: f?.sum ?? null, live: (f?.live || []).map((l) => `${l.n}:${l.w}${l.end ? '↓' : ''}`) };
  });

  const relGrab = overlapOf(log, 'hook_release', 'hook_grab');
  const grabSwing = overlapOf(log, 'hook_grab', 'hook_swing');
  const fallGrab = overlapOf(log, 'jump_fall', 'hook_grab');

  out.cadences[cadence] = {
    rings: rings.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]),
    catches, releases, path: path(steps), ...A,
    overlaps: { 'hook_release+hook_grab': relGrab, 'hook_grab+hook_swing': grabSwing, 'jump_fall+hook_grab': fallGrab },
  };

  console.log(`\n===== cadence "${cadence}": ${cat.length} catches, ${rel.length} releases =====`);
  console.log(`  rings: ${rings.map((p) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' ')}`);
  console.log('  CATCH  ring  frame   Δms  hook_grab t   restart?  sum   live');
  for (const x of catches) {
    console.log(`   ${x.k}      ${String(x.ring).padStart(2)}  ${String(x.frame).padStart(4)}  ${String(x.msSincePrev ?? '—').padStart(4)}  `
      + `${x.grabT == null ? '  none' : x.grabT.toFixed(3).padStart(6)}      `
      + `${x.restarted == null ? ' — ' : x.restarted ? 'yes' : 'NO '}     ${String(x.sum).padStart(5)}  ${x.live.join(' ')}`);
  }
  console.log('  RELEASE frame  sum   live');
  for (const x of releases) {
    console.log(`   ${x.k}      ${String(x.frame).padStart(4)}  ${String(x.sum).padStart(5)}  ${x.live.join(' ')}`);
  }
  console.log(`  run-wide: max summed weight ${A.maxSum}, max live tracks ${A.maxLive}, `
    + `${A.framesOver1} frames (${A.msOver1} ms) above 1.00`);
  for (const [k, v] of Object.entries(out.cadences[cadence].overlaps)) {
    console.log(`     ${k.padEnd(28)} longest ${String(v.frames).padStart(3)} frames (${String(v.ms).padStart(4)} ms)  maxW ${v.maxW.toFixed(3)}`);
  }
  for (const p of A.pairs) console.log(`     ${p.clips.padEnd(46)} ${String(p.frames).padStart(3)} frames  maxW ${p.maxW.toFixed(3)}`);
}

if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(out, null, 1)); console.log(`\n-> ${JSON_OUT}`); }

#!/usr/bin/env node
/**
 * landseam — what a landing and a launch actually put on the body at the same time.
 *
 * WHY THIS EXISTS (§529). §527 censused the whole transition space and flagged 28 pairs that can
 * sustain summed weight > 1 at worst-case dwell, naming `land → jump` and `skid → jump` as the
 * two to take first: a landing absorb and a launch are not simultaneously true of a body, they
 * share all 31 bones, and both sit on the commonest path in a platformer. That census drove
 * SYNTHETIC pairs — `sm.set`-style, one clip then the other — and what the suite happened to
 * observe was mild (1.17, 1.21). This tool drives the REAL state machine with REAL input through
 * `tests/_moveset.mjs`, the same harness the suite uses, so the dwell, the jump buffer and the
 * state priorities are the game's rather than a reconstruction of them.
 *
 * WHAT IT MEASURES, and why this and not a pose metric. `PoseBuffer.addQuat` is a NORMALISED
 * incremental slerp (`w/(acc+w)`), so N tracks at weight 1.0 do not overdrive anything — they
 * produce the equal-weight MEAN of N poses. **Summed live weight is therefore the number of
 * motions being averaged**: 1.00 is a hand-off, 2.00 is a two-way mean. That is the invariant
 * §526.2 settled on, it is regime-independent, and it states the class exactly. A per-clip
 * channel sum cannot see this defect at all — every track is playing its authored arc correctly;
 * the defect lives only in the composition (§442.3).
 *
 * THE GUARD THAT MATTERS MOST (§439). Writing this, three scripted inputs in a row produced
 * confident numbers for a run that never reached the transition being named — a jump tapped in
 * the air was eaten by `doubleJump`, and a jump tapped after `landSoftTime` found `idle` instead
 * of `land`. Each printed a full table. So every case DECLARES the transition it exists to drive
 * and the tool THROWS if the machine did not take it. A seam tool that cannot reach its seam must
 * fail loudly, not report the seam it happened to find.
 *
 * AND THE GUARD IMMEDIATELY CAUGHT THE TOOL ITSELF, which is the reason it is written up rather
 * than quietly fixed. The first version read the state ONCE PER FRAME and rejected the `land`
 * case as unreachable: the path came out `fall → jump`, with no `land` in it. That is not what
 * happens. `StateMachine.update` resolves up to FOUR times per frame — deliberately, so that a
 * jump pressed on the landing frame does not eat a frame of gravity — so `Fall` returns `'land'`,
 * `Land.enter` fires `land_soft`, and `Jump` (priority 64) preempts `Land` (50) on the very next
 * pass. **The whole transition happens inside one frame**, and a per-frame sample cannot see it
 * while `land_soft` is unmistakably on the body. Dwell is not merely "worst case → 0" here; it is
 * structurally zero on every buffered jump. Transitions are therefore recorded from
 * `onStateChanged`, which the machine calls on every `set()`, rather than inferred from samples.
 *
 *   node tools/landseam.mjs                    # shipped regime (godot)
 *   node tools/landseam.mjs --nofix            # the PRE-§529 mixer, for the before arm
 *   node tools/landseam.mjs --regime proc      # the procedural set
 *   node tools/landseam.mjs --json out.json
 *
 * WHAT IT CANNOT DISCRIMINATE (§418.3, third line). It counts WEIGHT and BONES, not poses. Two
 * clips averaged 50/50 score 2.00 whether the mean pose is grotesque or nearly identical to
 * both — a landing averaged with a fall that happens to agree at that instant reads exactly as
 * badly here as one that folds him in half. It says a defect of this CLASS is present and how
 * long it lasts; whether it READS as wrong is what the frames in `shots/land1-*` are for, and
 * this tool exists to say where to point them. It also sees only what the scripted input drives:
 * silence about a transition is a statement about this file's scripts, not about the game.
 */
import './_domshim.mjs';
import { writeFileSync } from 'node:fs';
import { makeSim, run, DT } from '../tests/_moveset.mjs';
import { PoseBuffer } from '../src/player/Rig.js';
import { RIG3 } from '../src/player/SlyModel3.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REGIME = arg('--regime', 'godot');
const JSON_OUT = arg('--json', '');

/**
 * `--nofix` reconstructs the PRE-§529 mixer by stripping the rule's only input — the `posture`
 * flag — off the live clip table, exactly as `comboseam --nocoalesce` strips `source`/`excl`.
 * A flag wired downstream of the thing it is supposed to change measures nothing (§525.7), so
 * this happens BEFORE any scenario runs, and the count is printed so an inert flag cannot be
 * mistaken for a null result.
 */
const NOFIX = argv.includes('--nofix');

/* The regime must be chosen before Animation.js binds its module-level ACTIVE table (§525.7). */
globalThis.__ANIM_AB = REGIME;
const { Animation, CLIP_REGIME, ACTIVE: TBL } = await import('../src/player/Animation.js');
if (CLIP_REGIME !== REGIME) {
  throw new Error(`landseam: asked for regime "${REGIME}" but the module loaded "${CLIP_REGIME}" `
    + '— the pre-module seam did not take, and every number below would be from the wrong set.');
}
if (NOFIX) {
  let n = 0;
  for (const k of Object.keys(TBL)) if (TBL[k]?.posture) { delete TBL[k].posture; n++; }
  console.log(`!! --nofix: posture stripped from ${n} clips — this is the PRE-§529 mixer.`);
}

const BONES = RIG3.SKELETON.map(([n]) => n);
const boneSet = (clip) => new Set((clip?.bones || []).map((b) => b.name));

/* ------------------------------------------------------------------ driving ---- */

async function drive({ frames, script, setup }) {
  const { engine, c } = await makeSim();
  const a = new Animation(engine);
  a.pose = new PoseBuffer(BONES);
  engine.get = (m) => (m === 'animation' ? a : null);
  c.anim = a;
  if (setup) setup(c);
  /* Every `set()` the machine makes, including the ones that come and go inside one frame.
     `onStateChanged` is the machine's own hook, so this cannot drift from what it really did. */
  const steps = [];
  const prevHook = c.onStateChanged.bind(c);
  let frameNo = 0;
  c.onStateChanged = (next, prev) => { steps.push({ i: frameNo, st: next.name, from: prev?.name ?? null }); return prevHook(next, prev); };
  const log = [];
  run(engine, c, frames, (i, input, ctl) => { frameNo = i; script(i, input, ctl); }, (i) => {
    a._advance(DT, i * DT);
    const live = [];
    for (const tr of a.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      live.push({ n: tr.clip.name, w: +tr.w.toFixed(3), t: +tr.time.toFixed(3), end: !!tr.ending, loop: !!tr.loop });
    }
    log.push({ i, st: c.stateName, sum: +live.reduce((s, l) => s + l.w, 0).toFixed(3), live });
  });
  return { log, steps };
}

/** Every `set()` the machine made, as `frame:state` — intra-frame ones included. */
const path = (steps) => steps.map((s) => `${s.i}:${s.st}`);

/** Did the machine DRIVE `from -> to`? Read off the machine's own transitions, not off samples. */
function tookTransition(steps, from, to) {
  for (const s of steps) if (s.from === from && s.st === to) return s.i;
  return -1;
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

/* ------------------------------------------------------------------- cases ---- */

/**
 * land → jump, from PURE INPUT — no state is poked, nothing is placed by hand. Run forward, jump,
 * jump again in the air (which spends the air jump, as a player does constantly), then tap jump
 * once more just before touchdown. `TUNE.jumpBufferMs` carries that press into the landing and
 * `Jump` (priority 64) outranks `Land` (50), so the launch preempts the absorb inside the same
 * frame `Land` was entered. This is not a contrived worst case; it is the thing the jump buffer
 * was built to produce, and it is the commonest sequence in a platformer.
 *
 * An earlier draft set `c.airJumps = 0` to stop `doubleJump` eating the third press. That worked
 * but made the node arm a different scenario from the browser arm, which can only send keys —
 * so the air jump is now spent by USING it, and both instruments drive the identical sequence.
 */
const CASES = {
  land: {
    from: 'land', to: 'jump', a: 'land_soft', b: 'jump_rise',
    frames: 100,
    script: (() => {
      let tap = -99;
      return (i, input, c) => {
        input.move.y = -1;
        const press = i === 20 || i === 21 || i === 32 || i === 33;
        if (!c.grounded && c.velocity.y < 0 && c.position.y < 0.6 && c.airJumps === 0 && tap < 0) tap = i;
        if (press || i === tap || i === tap + 1) input.hold('jump'); else input.let_go('jump');
      };
    })(),
  },
  /**
   * skid → jump. Run to full speed, reverse the stick hard enough to trip `Skid.canEnter`
   * (`TUNE.skidSpeed`/`skidDot`), then tap jump inside the skid. `Jump` (64) outranks `Skid` (40)
   * so it preempts after ~3 frames of skid — again the ordinary input, not a constructed one.
   */
  skid: {
    from: 'skid', to: 'jump', a: 'skid_stop', b: 'jump_rise',
    frames: 100,
    script: (i, input) => {
      input.move.y = i < 40 ? -1 : 1;
      if (i === 43 || i === 44) input.hold('jump'); else input.let_go('jump');
    },
  },
  /**
   * fall → land. Not one of §527's 28 (those are one-shot PAIRS); this is the other polarity of
   * the same hole — `play()` calls `_demoteOthers` only `if (loop)`, so a new ONE-SHOT demotes
   * nothing, and `Fall`'s promoted `jump_fall` base sits at full weight underneath the landing.
   * It is on the same path as the two above and every frame of them contains it, so it is
   * measured here rather than left to be rediscovered.
   */
  fall: {
    from: 'fall', to: 'land', a: 'jump_fall', b: 'land_soft',
    frames: 80,
    setup: (c) => { c.position.y = 3.0; c.velocity.y = 0; c.grounded = false; },
    script: (i, input) => { input.let_go('jump'); void i; },
  },
  /**
   * bounce → fall (§530). §529 §6 classified `bounce` as the same shape as the two fixed there:
   * it fires `double_jump` and asserts no base of its own, and both its driven exits (`dive`,
   * `fall`) assert non-tree loops, which before §529 could not end a one-shot at all. The
   * interesting half is that `Bounce` and `DoubleJump` fire the SAME clip and only `DoubleJump`
   * re-asserts it as a base — so one path self-cleans and the other does not, from one clip.
   *
   * `c.bounce()` is the game's own public entry (`Controller.bounce`, what GUARDS calls on a head
   * stomp and what the `enemyBounce` event routes to), not a poked state: the request goes through
   * `sm.request` and `Bounce.canEnter` exactly as it does in play.
   */
  bounce: {
    from: 'bounce', to: 'fall', a: 'double_jump', b: 'jump_fall',
    frames: 120,
    script: (i, input, c) => {
      input.move.y = -1;
      if (i === 20 || i === 21) input.hold('jump'); else input.let_go('jump');
      if (i === 30) c.bounce();
    },
  },
  /**
   * roll → jump (§530), the roll-cancel. §529 §6 found three of `roll`'s four driven exits are
   * `idle`/`move`, which take `play()`'s blend-tree branch and end every non-locked track already;
   * only `fall` and `jump` are exposed. `jump` is the one a player actually drives — roll-cancel
   * is standard vocabulary for this character and `Roll.update` was given a jump poll for exactly
   * that reason — so it is the case measured here.
   */
  roll: {
    from: 'roll', to: 'jump', a: 'roll', b: 'jump_rise',
    frames: 100,
    script: (i, input) => {
      input.move.y = -1;
      if (i === 40) input.hold('crouch'); else input.let_go('crouch');
      if (i === 46 || i === 47) input.hold('jump'); else input.let_go('jump');
    },
  },
};

const out = { regime: CLIP_REGIME, nofix: NOFIX, cases: {} };
const want = arg('--case', '');

for (const [name, spec] of Object.entries(CASES)) {
  if (want && want !== name) continue;
  const { log, steps } = await drive(spec);
  const at = tookTransition(steps, spec.from, spec.to);
  if (at < 0) {
    throw new Error(`landseam[${name}]: the machine never drove ${spec.from} -> ${spec.to}. `
      + `Path was ${path(steps).join(' -> ')}. `
      + 'Refusing to report numbers for a run that did not reach the seam it names (§439).');
  }
  const A = analyse(log);
  const pair = overlapOf(log, spec.a, spec.b);
  const shared = [...boneSet(TBL[spec.a])].filter((n) => boneSet(TBL[spec.b]).has(n)).length;
  out.cases[name] = { transitionAt: at, path: path(steps), shared, ...A, pair };

  console.log(`\n===== ${name}: ${spec.from} -> ${spec.to} (driven at frame ${at}) =====`);
  console.log(`  path: ${path(steps).join(' -> ')}`);
  console.log(`  ${spec.a} + ${spec.b}: shared bones ${shared}`);
  console.log(`  longest joint overlap: ${pair.frames} frames (${pair.ms} ms), worst summed weight ${pair.maxW}`);
  console.log(`  run-wide: max summed weight ${A.maxSum}, max live tracks ${A.maxLive}, `
    + `${A.framesOver1} frames (${A.msOver1} ms) above 1.00`);
  for (const p of A.pairs) console.log(`     ${p.clips.padEnd(46)} ${String(p.frames).padStart(3)} frames  maxW ${p.maxW.toFixed(3)}`);
}

if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(out, null, 1)); console.log(`\n-> ${JSON_OUT}`); }

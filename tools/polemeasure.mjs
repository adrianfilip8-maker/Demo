#!/usr/bin/env node
/**
 * polemeasure — the POLE state's own contract, measured on the shipped rig.
 *
 *   node tools/polemeasure.mjs
 *
 * ── WHY A SECOND INSTRUMENT, and what it refuses to inherit ───────────────────────────────
 *
 * §717.5 refused `PoleClimbIdle` at **+27.9 cm floating** — the lowest foot, signed against the
 * rig's own bind contact. That number is correct and it is the WRONG QUESTION here, because it
 * is asked against a GROUND idle's contract, where a foot off the floor is a hard defect.
 * `balance_idle` stands on a rail; `pole_idle` hangs off a shaft. §717.5 says so itself, in the
 * same paragraph that refuses it: *"these are poses their game plays while the feet are on a
 * PROP — a rail, a pole, a spire — not on the ground."* On a pole the feet ARE off the ground
 * by design, so `idlemeasure`'s ground row cannot decide a pole binding either way.
 *
 * What decides one is where the hands and the feet sit relative to the POLE AXIS, and that is a
 * frame `idlemeasure` does not have. This tool builds it out of the state's own geometry rather
 * than out of taste — every constant below is read from the shipped source, not chosen:
 *
 *     Moveset.PoleClimb.place()   position = pole + hold·(sin a, 0, cos a);  yaw faces the pole
 *     Moveset.PoleClimb.enter()   p.hold = p.r + TUNE.radius · 0.8
 *                                 p.r    = max(0.18, geometry radiusTop ?? radius ?? 0.5)
 *     Collision POLE.girthMax     the §514.3 thin gate — climbables are r 0.15…0.40
 *
 * So in the rig's own frame the capsule origin is at (0,0,0), the character faces the pole, and
 * **the pole is a vertical line `hold` metres straight ahead**. Every row below is a distance to
 * that line, minus the shaft radius: **0 cm = the hand is ON the shaft**, negative = inside it,
 * positive = closed on air. Both ends of the shipped climbable range are printed, because the
 * level holds a r 0.15 rope (clamped to the 0.18 floor) and a r 0.40 mast and one clip has to
 * serve both.
 *
 * ── §442 / §439 guards ────────────────────────────────────────────────────────────────────
 * The BIND pose is a row, read by the same code path: an instrument that measured the bind pose
 * would report every clip identical to it. The rig's forward axis is DERIVED per run (from the
 * toe-to-heel line of the bind pose) and printed, never assumed — §715.3's facing check in
 * miniature, and the reason is §466.5's: a tool here labelled rear shots "front" for its life.
 *
 * ── §418.3 DOMAIN ─────────────────────────────────────────────────────────────────────────
 * passes on : `PoleClimbing` and the procedural `pole_climb` — the two clips the game already
 *             plays ON A POLE — which must read as gripping the shaft.
 * fails  on : `Standupright` and `Idle Anim 1`, ground idles carried into this frame, whose arms
 *             hang at the hips and so must read as closed on air, far off the shaft. They are in
 *             the table for exactly that reason.
 * does NOT  : judge motion QUALITY, decide a fade, or say anything about the ground. A clip that
 * discrim.    grips the shaft can still be the wrong motion for the verb; that is the seam and
 *             the state contract, measured elsewhere.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { DEG } from './_posecarry.mjs';

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { compile, sampleInto, RAW_CLIPS } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { TUNE } = await import('../src/player/Controller.js');

const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const at = (role) => new THREE.Vector3().setFromMatrixPosition(sly.bones[role].matrixWorld);

function poseAt(clip, t) {
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
}
function bindPose() {
  for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) { b.quaternion.identity(); b.scale.set(1, 1, 1); } }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x, base.y, base.z);
  sly.root.updateMatrixWorld(true);
}

/* ── the forward axis, DERIVED (§439: never assume the sign that flatters) ────────────────
   The bind pose's toe sits ahead of its heel; the sign of (toe − foot)·z IS the rig's forward.
   Printed, so a rig change that flips it is visible rather than silently re-labelling the
   columns. */
bindPose();
const toeAhead = (at('toeL').z - at('footL').z) + (at('toeR').z - at('footR').z);
const FWD = toeAhead >= 0 ? 1 : -1;
const BIND_FOOT = Math.min(at('footL').y, at('footR').y, at('toeL').y, at('toeR').y);

/* ── the two shafts the shipped level actually offers (§514.3's thin gate) ──────────────── */
const SHAFTS = [
  { tag: 'rope r0.18', r: 0.18 },   // the §495.A rope (r 0.15) after PoleClimb.enter's max(0.18, …)
  { tag: 'mast r0.40', r: 0.40 },   // the east mast — the thickest thing the gate still admits
];
const holdOf = (r) => r + TUNE.radius * 0.8;

const N = 41;
const GRIP = ['handL', 'handR'];
const CLAMP = ['footL', 'footR', 'toeL', 'toeR'];

/** Horizontal distance from a joint to the pole axis, minus the shaft radius. cm. */
function gapTo(p, r) {
  const hold = holdOf(r);
  const dx = p.x - 0;
  const dz = p.z - FWD * hold;
  return (Math.hypot(dx, dz) - r) * 100;
}

const measure = (name, raw) => measureCompiled(name, compile(name, raw));

function measureCompiled(name, c) {
  const s = { hands: [], handsMast: [], feet: [], feetMast: [], hipsY: [], handDY: [], handY: [], q: [] };
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * c.dur;
    poseAt(c, t);
    const hL = at('handL'), hR = at('handR');
    s.hands.push(Math.max(gapTo(hL, 0.18), gapTo(hR, 0.18)));      // the WORSE hand — a grip needs both
    s.handsMast.push(Math.max(gapTo(hL, 0.40), gapTo(hR, 0.40)));
    s.feet.push(Math.min(...CLAMP.map((f) => gapTo(at(f), 0.18))));  // the BEST foot — one boot clamps
    s.feetMast.push(Math.min(...CLAMP.map((f) => gapTo(at(f), 0.40))));
    s.hipsY.push(at('hips').y);
    s.handDY.push(Math.abs(hL.y - hR.y) * 100);
    s.handY.push(((hL.y + hR.y) / 2 - BIND_FOOT) * 100);
    const qs = []; for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) qs.push(b.quaternion.clone()); }
    s.q.push(qs);
  }
  const mean = (a) => a.reduce((x, v) => x + v, 0) / a.length;
  const rng = (a) => Math.max(...a) - Math.min(...a);
  let sweep = 0;
  for (let i = 1; i < s.q.length; i++) {
    let acc = 0;
    for (let b = 0; b < s.q[0].length; b++) {
      const d = s.q[i - 1][b].clone().invert().multiply(s.q[i][b]);
      acc += 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
    }
    sweep += acc / s.q[0].length;
  }
  sweep = c.dur > 0 ? sweep / c.dur : 0;
  return {
    name, dur: +c.dur.toFixed(2), loop: !!c.loop,
    gripRope: +mean(s.hands).toFixed(1), gripRopeMax: +Math.max(...s.hands).toFixed(1),
    gripMast: +mean(s.handsMast).toFixed(1),
    clampRope: +mean(s.feet).toFixed(1), clampMast: +mean(s.feetMast).toFixed(1),
    handDY: +mean(s.handDY).toFixed(1), handDYmax: +Math.max(...s.handDY).toFixed(1),
    handY: +mean(s.handY).toFixed(1),
    hipsY: +mean(s.hipsY).toFixed(3), bobCm: +(rng(s.hipsY) * 100).toFixed(1),
    sweep: +sweep.toFixed(1),
    grip0: +s.hands[0].toFixed(1), gripEnd: +s.hands[s.hands.length - 1].toFixed(1),
    qEnd: s.q[s.q.length - 1], q0: s.q[0], compiled: c,
  };
}

/** Worst-bone angular distance between two sampled pose arrays, degrees. §717's seam measure. */
function seamBetween(a, b) {
  let worst = 0, name = '';
  const names = sly.boneNames.filter((n) => sly.bones[n]);
  for (let i = 0; i < a.length; i++) {
    const d = a[i].clone().invert().multiply(b[i]);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
    if (ang > worst) { worst = ang; name = names[i]; }
  }
  return { worst: +worst.toFixed(1), bone: name };
}

const rows = [];
{
  bindPose();
  const g = (r) => Math.max(gapTo(at('handL'), r), gapTo(at('handR'), r));
  const f = (r) => Math.min(...CLAMP.map((n) => gapTo(at(n), r)));
  rows.push({
    name: '(BIND POSE — §442 control)', dur: 0, loop: false,
    gripRope: +g(0.18).toFixed(1), gripRopeMax: +g(0.18).toFixed(1), gripMast: +g(0.40).toFixed(1),
    clampRope: +f(0.18).toFixed(1), clampMast: +f(0.40).toFixed(1),
    handDY: +(Math.abs(at('handL').y - at('handR').y) * 100).toFixed(1), handDYmax: 0,
    handY: +(((at('handL').y + at('handR').y) / 2 - BIND_FOOT) * 100).toFixed(1),
    hipsY: +at('hips').y.toFixed(3), bobCm: 0, sweep: 0, tag: '',
  });
}

for (const n of ['pole_climb', 'pole_idle', 'pole_grab', 'pole_slide', 'pole_swing', 'ledge_hang', 'wall_cling'])
  if (RAW_CLIPS[n]) rows.push({ ...measure(n, RAW_CLIPS[n]), tag: 'proc' });

const { GODOT_CLIPS } = await import('../src/player/GodotClips.js');
/* the pole family, then the §418.3 FAIL ARM: two ground idles the game plays standing, carried
   into the pole frame, which must read as closed on air. */
for (const n of ['PoleClimbing', 'PoleClimbIdle', 'PoleGrab', 'SpireJump', 'LedgeGrab', 'Standupright'])
  if (GODOT_CLIPS[n]) rows.push({ ...measure(n, GODOT_CLIPS[n]), tag: 'gltf' });
const { GODOT_LIB_CLIPS } = await import('../src/player/GodotLibClips.js');
for (const n of ['Idle Anim 1']) if (GODOT_LIB_CLIPS[n]) rows.push({ ...measure(n, GODOT_LIB_CLIPS[n]), tag: 'lib' });

/* ── WHAT SHIPS, not what the source holds. The godot regime plays `pole_climb` as
   `PoleClimbing` REVERSED (§479.18) after `spliceClip`'s donor fill and §531's limb lever, so a
   seam quoted off the raw gltf clip would be a seam nobody sees. These rows come through the
   shipped `buildClipSet` and are the ones the mount seam below is judged against. */
const { buildClipSet } = await import('../src/player/Animation.js');
const SHIPPED = buildClipSet('godot').table;
for (const n of ['pole_climb', 'pole_idle', 'pole_grab'])
  if (SHIPPED[n]) rows.push({ ...measureCompiled(n, SHIPPED[n]), tag: 'SHIPPED godot' });

/* ── §531's lever, swept on the pole family, because a POLE HAND IS A PLACED HAND ──────────
   §479.10 states the criterion the wall-run and hand-on-hip exemptions were each finding one
   case of: *the lever may open a FREE limb; it may not straighten a limb whose hand is PLACED.*
   No pole verb carries a `GODOT_LIMB_OPEN` row, so every one of them takes the set-wide
   0.75/0.60 — and a hand on a shaft is placed by the same argument a palm on a wall is. This
   sweep is the measurement that decides it, at the rungs §479.10 and §715 already use. */
console.log('\n— §531 LEVER SWEEP on the pole family (grip cm to the rope surface; 0 = on the shaft) —');
console.log('  the base lever forced to each rung, per-verb rows OFF, so the sweep reads the transform');
console.log('  ' + 'verb'.padEnd(16) + ['elbow/knee 0/0', '0.45/0', '0.75/0.60 (set-wide)'].map((s) => s.padStart(24)).join(''));
for (const verb of ['pole_climb', 'pole_idle', 'pole_grab', 'pole_slide', 'pole_swing']) {
  const cells = [[0, 0], [0.45, 0], [0.75, 0.60]].map(([e, k]) => {
    globalThis.__LIMB_OPEN = { elbow: e, knee: k };
    /* `pole: 'climb'` drops §720's per-verb exemptions for the two incumbents, so the base rung
       is what actually lands and the sweep measures the LEVER rather than this section's rows.
       The two new verbs keep theirs and read flat by construction — noted, not hidden. */
    const t = buildClipSet('godot', { pole: 'climb' }).table[verb];
    if (!t) return '—'.padStart(24);
    const m = measureCompiled(verb, t);
    return `${m.gripRope} mean / ${m.gripRopeMax} worst`.padStart(24);
  });
  console.log('  ' + verb.padEnd(16) + cells.join(''));
}
delete globalThis.__LIMB_OPEN;

/* ── §720's TOKEN, both arms, on the clips the player sees ────────────────────────────────── */
console.log('\n— §720 A/B: what `?pole=climb` restores (grip cm to the rope surface) —');
console.log('  ' + 'verb'.padEnd(16) + ['DEFAULT (ported)', '?pole=climb'].map((s) => s.padStart(26)).join(''));
for (const verb of ['pole_climb', 'pole_idle', 'pole_grab', 'pole_slide']) {
  const cells = ['port', 'climb'].map((mode) => {
    const t = buildClipSet('godot', { pole: mode }).table[verb];
    if (!t) return '—'.padStart(26);
    const m = measureCompiled(verb, t);
    const src = buildClipSet('godot', { pole: mode }).origin[verb];
    return `${m.gripRope}/${m.gripRopeMax} ${src === 'proc' ? '[proc]' : ''}`.padStart(26);
  });
  console.log('  ' + verb.padEnd(16) + cells.join(''));
}

console.log(`rig forward axis DERIVED as ${FWD > 0 ? '+Z' : '-Z'} (bind toe-ahead-of-heel ${(toeAhead * 100).toFixed(1)} cm); `
  + `bind contact y ${BIND_FOOT.toFixed(3)}`);
console.log(`pole hold = r + TUNE.radius ${TUNE.radius} x 0.8  ->  rope ${holdOf(0.18).toFixed(3)} m, mast ${holdOf(0.40).toFixed(3)} m ahead of the capsule origin\n`);

const H = ['clip', 'dur', 'lp', 'gripRope', 'worst', 'gripMast', 'clampRope', 'clampMast', 'handDY', 'dYmax', 'handY', 'hipsY', 'bob', 'sweep'];
const W = [30, 6, 3, 10, 8, 10, 11, 11, 8, 8, 8, 8, 7, 8];
console.log(H.map((h, i) => h.padStart(W[i])).join(''));
for (const r of rows) {
  const v = [r.name + (r.tag ? ` [${r.tag}]` : ''), r.dur, r.loop ? 'y' : 'n',
    r.gripRope, r.gripRopeMax, r.gripMast, r.clampRope, r.clampMast,
    r.handDY, r.handDYmax, r.handY, r.hipsY, r.bobCm, r.sweep];
  console.log(v.map((x, i) => String(x).padStart(W[i])).join(''));
}
/* ── THE MOUNT SEAM ───────────────────────────────────────────────────────────────────────
   `PoleClimb.enter` fires a ONE-SHOT and then `update` re-asserts a base clip every frame, so a
   mount clip is judged on where it ENDS, not on its mean: it has to hand over to the loop that
   follows it. Both destinations are measured, because which one follows depends on whether the
   player is moving on arrival. */
const byName = Object.fromEntries(rows.filter((r) => r.q0).map((r) => [(r.tag === 'SHIPPED godot' ? '*' : '') + r.name, r]));
const DEST = ['*pole_climb', '*pole_idle', 'PoleClimbIdle'];
console.log('\n— THE MOUNT SEAM: a one-shot is judged where it ENDS (worst-bone deg to the loop that follows) —');
console.log('  (* = the clip as the SHIPPED godot regime builds it, which is what the player sees)');
console.log('  ' + 'mount one-shot'.padEnd(24) + 'grip@t0'.padStart(9) + 'grip@end'.padStart(10)
  + '  ' + DEST.map((d) => `-> ${d}`.padStart(24)).join(''));
for (const m of ['*pole_climb', 'pole_climb', 'PoleGrab', '*pole_grab']) {
  const r = byName[m]; if (!r) continue;
  const line = DEST.map((d) => {
    const t = byName[d]; if (!t) return '                       —';
    const s = seamBetween(r.qEnd, t.q0);
    return `${s.worst.toFixed(1)}deg @${s.bone}`.padStart(24);
  }).join('');
  console.log('  ' + m.padEnd(24) + String(r.grip0).padStart(9) + String(r.gripEnd).padStart(10) + '  ' + line);
}

/* ── THE IN-STATE SEAM ────────────────────────────────────────────────────────────────────
   `PoleClimb.update` re-picks its base clip EVERY FRAME off the stick with a 0.16 s fade, so
   the hang<->climb pair is a seam the player crosses on every push and release — far more often
   than §717's 6 s idle rotation. Read at the loops' own t=0, both directions, in both arms. */
const seamPair = (mode) => {
  const T = buildClipSet('godot', { pole: mode }).table;
  const a = measureCompiled('pole_idle', T.pole_idle), b = measureCompiled('pole_climb', T.pole_climb);
  const s = seamBetween(a.q0, b.q0);
  return `${s.worst.toFixed(1)}deg @${s.bone}`;
};
console.log('\n— THE IN-STATE SEAM: hang <-> climb, crossed on every stick push (0.16 s fade) —');
console.log(`  DEFAULT (ported)   pole_idle <-> pole_climb   ${seamPair('port')}`);
console.log(`  ?pole=climb        pole_idle <-> pole_climb   ${seamPair('climb')}   (unreachable: nothing plays pole_idle there)`);

console.log(`
gripRope/gripMast  the WORSE hand's horizontal distance to the pole SURFACE, cm. 0 = on the shaft.
worst              the worst single frame of gripRope over the cycle.
clampRope/Mast     the BEST foot/toe's distance to the surface, cm — one boot clamping is enough.
handDY             hand-to-hand VERTICAL separation, cm: a climb alternates up the shaft, a hang holds level.
handY              mean hand height above the rig's bind contact, cm.
bob                hips vertical excursion over the cycle, cm.   sweep = mean per-bone deg/s.`);

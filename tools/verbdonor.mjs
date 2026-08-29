#!/usr/bin/env node
/**
 * verbdonor — for every STILL-PROCEDURAL verb, ask whether the reference corpus holds a donor
 * BY CONTENT, and measure the candidates on the SHIPPED rig through the SHIPPED
 * compile()/sampleInto() seam. §733's instrument.
 *
 *   node tools/verbdonor.mjs                      the shipped set (proc incumbents + baked ports)
 *   node tools/verbdonor.mjs <bench-module.js>    ... plus candidates emitted by
 *                                                 `godotlib2clips.mjs --asset X --keep Y`
 *
 * WHY A THIRD MEASURING TOOL EXISTS, stated so it is not mistaken for duplication. §717's
 * `idlemeasure` answers "is this an idle, is it grounded, does it move" over a FIXED list of
 * nine idle-family verbs; it is the right instrument for the idle shelf and this file imports
 * its vocabulary rather than re-deriving it (`_posecarry.mjs`'s carry(), the one copy the §479
 * rulings are quoted against). What it cannot answer is the question §733 was given: the
 * remaining procedural verbs are mostly ONE-SHOTS and TRAJECTORIES — a roll, a flip, a skid, a
 * pounce, a hard landing — and their identity lives in axes no idle table carries: how far the
 * body PITCHES over the clip, where the acting limb REACHES and WHEN, how far the clip travels.
 * A clip is not a donor for `roll` because its hips are low; it is a donor because the body goes
 * over.
 *
 * ── THE REACH MEASURE (§479.8), AND WHY IT IS THE ONE THAT MATTERS ──────────────────────────
 * §479.8 is this project's most expensive animation defect: an attack shipped BACKWARDS because
 * a lane read the peak hand SPEED as the strike. It is not — the speed peak is the RECOVERY,
 * the hand leaving the target. The measure that is right is MAX FORWARD REACH OF THE ACTING
 * LIMB RELATIVE TO THE HIPS, in the pose's own forward frame, and the time at which it occurs.
 *
 * That measure is CALIBRATED IN-RUN rather than trusted (§439/§440: an instrument built from the
 * same assumption as its subject cannot falsify it). Three arms print on every run, before any
 * candidate row:
 *
 *   PASS  — every combo slot whose `cane_hit` time the house DECLARES, in BOTH regimes: the
 *           shipped table (`ACTIVE`, 0.10/0.10/0.375) and the procedural bodies (`RAW_CLIPS`,
 *           0.150/0.130/0.210). If the measure does not reproduce the house's own authored
 *           contact on the house's own clip, the measure is wrong and every number below it is
 *           worthless.
 *   FAIL  — a synthetic FLAT clip (one pose held for the whole duration). Reach RANGE must read
 *           0.000 m: a measure that reports a strike on a clip with no motion is reporting its
 *           own frame, not the clip's content.
 *   FLIP  — the same pose under a 180° facing conjugation. Forward reach must change SIGN. A
 *           measure that cannot tell front from back cannot certify a strike direction, which is
 *           the §479.8 disaster in one line.
 *
 * The run EXITS NON-ZERO if any arm fails, so a broken instrument cannot quietly produce a table.
 *
 * WHICH FORWARD, AND HOW THE FIRST DRAFT OF THIS FILE GOT IT WRONG — recorded because the
 * calibration is the only reason it was caught. The first draft measured reach along the POSE's
 * OWN forward (lat × up, `idlemeasure`'s brace-detector convention, borrowed on the reasonable
 * theory that borrowing the house's vocabulary was the safe move). It failed two arms at once
 * and the pair of failures is the diagnosis:
 *   · it put `cane_combo_1`'s peak at 0.295 against the declared 0.150 — because the body YAWS
 *     44° through a cane swing (§716.3), so a forward that rotates with the torso chases the
 *     hand and moves the peak;
 *   · and it read +0.256 m BOTH ways under the conjugation arm — because a body-relative
 *     quantity is invariant under a root yaw BY CONSTRUCTION. That arm could never have failed,
 *     which makes it exactly the §439.3 stub: a check built so it cannot disagree.
 * The measure that reproduces the house is the WORLD forward (+Z, the controller's own facing).
 * On it: `cane_combo_3` reads 0.627 m at t 0.374 against §716.4's published 0.627 @ 0.375 — the
 * shipped figure to the digit, on a table this lane did not write.
 *
 * ── THE PITCH MEASURE ───────────────────────────────────────────────────────────────────────
 * A flip/roll is a body that goes OVER. Euler readings tumble through vertical, so pitch is
 * accumulated as the unwrapped angle of the hips→chest axis inside the pose's own sagittal
 * plane, summed frame to frame — a clip that rotates 360° reads ~360 rather than folding back
 * to ~0. `Front Flip 1` reading ~0 on this axis while `Front Flip 2` reads a full turn is a
 * finding about those two clips, not a bug (§733.4).
 *
 * §442 guard: the BIND POSE is measured by the same code path and printed as its own row. An
 * instrument that had CPU-skinned the rest pose instead of the clip would report every row
 * equal to it.
 */
import './_domshim.mjs';
import * as path from 'node:path';
import * as THREE from 'three';
import { carry, DEG } from './_posecarry.mjs';

const BENCH = process.argv[2];
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { compile, sampleInto, RAW_CLIPS } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const at = (role) => new THREE.Vector3().setFromMatrixPosition(sly.bones[role].matrixWorld);

const bench = BENCH ? (await import(path.resolve(BENCH))).GODOT_LIB_CLIPS : {};

/* FACING: 0 = as authored, Math.PI = the §418.3 conjugation arm. Applied to the ROOT, so it
   rotates the whole delivered pose exactly as a facing error would. */
let FACING = 0;
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
  sly.root.rotation.set(0, FACING, 0);
  sly.root.updateMatrixWorld(true);
}
function bindPose() {
  for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) { b.quaternion.identity(); b.scale.set(1, 1, 1); } }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x, base.y, base.z);
  sly.root.rotation.set(0, FACING, 0);
  sly.root.updateMatrixWorld(true);
}

const FEET = ['footL', 'footR', 'toeL', 'toeR'];
const N = 121;                 // 121 samples: dense enough that a 0.27 s jump gets ~2 ms grain
let BIND_FOOT = 0;

/* the pose's own frame: lateral from the shoulders, up from hips→chest, forward = lat × up.
   Deriving forward from the BODY rather than from the world is what makes the measure
   survive a clip authored off-axis (§715.3's centerYaw class) — and what makes the FLIP arm
   a real test, since conjugating the root carries the body frame with it. */
function frame() {
  const lat = at('upperArmL').clone().sub(at('upperArmR')); lat.y = 0; lat.normalize();
  const up = at('chest').clone().sub(at('hips')).normalize();
  return { fwd: new THREE.Vector3().crossVectors(lat, up).normalize(), up, lat };
}

/* The CONTROLLER's forward. Fixed, not body-relative — see the header note on the first draft. */
const WORLD_FWD = new THREE.Vector3(0, 0, 1);

/** §479.8 — max forward reach of `limb` relative to the hips, and WHEN. */
function reachOf(c, limb) {
  let best = -Infinity, bestT = 0, lo = Infinity;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * c.dur;
    poseAt(c, t);
    if (!sly.bones[limb]) return null;
    const d = at(limb).clone().sub(at('hips')).dot(WORLD_FWD);
    if (d > best) { best = d; bestT = t; }
    if (d < lo) lo = d;
  }
  /* speed AT the reach peak, so a caller can see whether the hand ARRIVES with speed (a strike
     driving through) or has already stopped (a settle) — §716.3's discriminator. */
  const i = Math.round((bestT / (c.dur || 1)) * (N - 1));
  const dt = c.dur / (N - 1);
  let spd = 0;
  if (i > 0 && i < N - 1) {
    poseAt(c, (i - 1) * dt); const a = at(limb).clone();
    poseAt(c, (i + 1) * dt); spd = a.distanceTo(at(limb)) / (2 * dt);
  }
  return { reach: best, t: bestT, range: best - lo, spd };
}

/* `raw` may be an authored clip def OR an already-compiled clip (ACTIVE's entries are compiled).
   `compile` is idempotent-by-detection here rather than by luck: a compiled clip carries its
   sampled arrays, so re-compiling one would be a second, different code path. */
function measure(name, raw) {
  const c = raw.bones && raw.mask !== undefined ? raw : compile(name, raw);
  const hipsY = [], hipsXZ = [], footY = [], seps = [], upright = [], toeL = [], toeR = []
  const legExt = [], handHip = [];
  let pitch = 0, prevAng = null;
  const worldQ = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * c.dur;
    poseAt(c, t);
    const h = at('hips');
    hipsY.push(h.y); hipsXZ.push(new THREE.Vector2(h.x, h.z));
    const lowFoot = Math.min(...FEET.map((f) => (sly.bones[f] ? at(f).y : Infinity)));
    footY.push(lowFoot);
    legExt.push(h.y - lowFoot);
    handHip.push(Math.min(at('handL').y, at('handR').y) - h.y);
    toeL.push(at('toeL').y); toeR.push(at('toeR').y);
    const { up, lat } = frame();
    /* PITCH: angle of the body up-axis in the sagittal plane, unwrapped and accumulated. */
    const sag = up.clone().projectOnPlane(lat).normalize();
    const ref = new THREE.Vector3(0, 1, 0).projectOnPlane(lat).normalize();
    const cross = new THREE.Vector3().crossVectors(ref, sag).dot(lat);
    let ang = Math.atan2(cross, ref.dot(sag)) * DEG;
    if (prevAng !== null) { let d = ang - prevAng; while (d > 180) d -= 360; while (d < -180) d += 360; pitch += d; }
    prevAng = ang;
    const cy = carry(at);
    seps.push(cy.sepCm);
    upright.push(Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)) * DEG);
    const qs = [];
    for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) qs.push(b.quaternion.clone()); }
    worldQ.push(qs);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const rng = (a) => Math.max(...a) - Math.min(...a);
  /* POSE-RELATIVE axes, and why they are not optional. `hipsY` and `grnd` are anchored to the
     WORLD, so for a GROUNDED clip they say something real (the stance's depth, the foot's
     contact) and for an AIRBORNE clip they say almost nothing: the authored root height of a
     fall or a flip is arbitrary — the STATE drives world position, and the clip's own hips track
     is wherever the animator's rig happened to sit. Comparing `jump_apex` against an air pose on
     `hipsY` is therefore comparing two root offsets, which is §435.4's error exactly: a probe
     written from the author's model rather than from the thing. `legExt` (hips above the lowest
     foot) and `handHip` (lowest hand relative to the hips) are invariant to that offset and are
     the axes an air verb must actually be judged on. */
  let travel = 0;
  for (let i = 1; i < hipsXZ.length; i++) travel += hipsXZ[i].distanceTo(hipsXZ[i - 1]);
  let sweep = 0;
  for (let i = 1; i < worldQ.length; i++) {
    let s = 0;
    for (let b = 0; b < worldQ[0].length; b++) {
      const d = worldQ[i - 1][b].clone().invert().multiply(worldQ[i][b]);
      s += 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
    }
    sweep += s / worldQ[0].length;
  }
  sweep /= (c.dur || 1);
  const rH = reachOf(c, 'handR'), rF = reachOf(c, 'footR');
  return {
    name, dur: +c.dur.toFixed(2), loop: !!c.loop,
    hipsY: +mean(hipsY).toFixed(3), hipsYmin: +Math.min(...hipsY).toFixed(3),
    bobCm: +(rng(hipsY) * 100).toFixed(1),
    groundCm: +((Math.min(...footY) - BIND_FOOT) * 100).toFixed(1),
    travel: +travel.toFixed(3), speed: +(travel / (c.dur || 1)).toFixed(2),
    legExt: +mean(legExt).toFixed(3), handHip: +mean(handHip).toFixed(3),
    pitch: +pitch.toFixed(0), tilt: +Math.max(...upright).toFixed(1),
    sep: +mean(seps).toFixed(1),
    stepL: +(rng(toeL) * 100).toFixed(1), stepR: +(rng(toeR) * 100).toFixed(1),
    sweep: +sweep.toFixed(1),
    reachH: rH ? +rH.reach.toFixed(3) : null, reachHt: rH ? +rH.t.toFixed(3) : null,
    reachHspd: rH ? +rH.spd.toFixed(1) : null, reachHrng: rH ? +rH.range.toFixed(3) : null,
    reachF: rF ? +rF.reach.toFixed(3) : null,
  };
}

/* ─────────────────────────── §418.3 CALIBRATION, run before any table ─────────────────────── */
bindPose();
BIND_FOOT = Math.min(...FEET.map((f) => at(f).y));

let calFails = 0;
const line = (ok, s) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${s}`); if (!ok) calFails++; };
console.log('§418.3 CALIBRATION — the measure against inputs it must pass and must fail\n');

/* PASS arm: the house's own declared contacts, on the house's own clips, in BOTH regimes.
   The 20 ms bar is the project's own — §531/§716 use it to decide the combo's limb-lever
   exemption, so the measure is held to the tolerance the shipped rows are decided at. */
const { ACTIVE } = await import('../src/player/Animation.js');
/* WHICH ROWS GATE, and why not all six. §479.8 names ONE calibration case in so many words —
   *"proc `cane_combo_1` peaks at t 0.150 and the house declares its `cane_hit` at exactly
   0.150"* — and says of the others only that *"combos 2 and 3 [are] within 35–70 ms"*. So the
   house's own claim is that slot 1 is exact and slots 2/3 are approximate, and a bar that
   demanded 20 ms of all six would be a bar this project's own shipped set fails. The gating
   rows are therefore: all three SHIPPED slots (what any new binding is actually judged beside)
   and proc slot 1 (the declared calibration case). Proc 2/3 print, do not gate, and their
   errors are quoted so nobody reads the exemption as a pass. */
const GATE = new Set(['SHIPPED cane_combo_1', 'SHIPPED cane_combo_2', 'SHIPPED cane_combo_3', 'proc cane_combo_1']);
for (const [label, table] of [['SHIPPED', ACTIVE], ['proc', RAW_CLIPS]]) {
  for (const verb of ['cane_combo_1', 'cane_combo_2', 'cane_combo_3']) {
    const raw = table[verb]; if (!raw) continue;
    const decl = (raw.events || []).find((e) => e.n === 'cane_hit');
    if (!decl) continue;
    const c = table === ACTIVE ? raw : compile(verb, raw);
    const r = reachOf(c, 'handR');
    const err = Math.abs(r.t - decl.t);
    const key = `${label} ${verb}`, gates = GATE.has(key);
    const ok = err <= 0.020;
    const txt = `${label.padEnd(7)} ${verb}: declared cane_hit ${decl.t.toFixed(3)} · measured peak ` +
      `reach ${r.t.toFixed(3)} (${r.reach.toFixed(3)} m, ${r.spd.toFixed(1)} m/s there) · err ${err.toFixed(3)} s`;
    if (gates) line(ok, txt);
    else console.log(`  ${ok ? 'pass' : 'note'}  ${txt}  [does not gate — §479.8's own 35–70 ms band]`);
  }
}

/* FAIL arm: a flat clip cannot produce a strike. Built from cane_combo_1's own first key so it
   is the same pose data with the motion removed — not a different clip that happens to be still. */
{
  const src = RAW_CLIPS.cane_combo_1;
  const k0 = src.keys.slice().sort((a, b) => a.t - b.t)[0];
  const flat = { ...src, keys: [{ t: 0, P: k0.P }, { t: src.dur, P: k0.P }], events: [] };
  const r = reachOf(compile('__flat', flat), 'handR');
  line(r.range < 1e-6, `FLAT clip (cane_combo_1's first key held): reach range ${r.range.toFixed(6)} m ` +
    `— the measure cannot invent a strike`);
}

/* FLIP arm: forward must change sign under a 180° facing conjugation. */
{
  const c = compile('cane_combo_1', RAW_CLIPS.cane_combo_1);
  FACING = 0; const fwd = reachOf(c, 'handR');
  FACING = Math.PI; const bwd = reachOf(c, 'handR');
  FACING = 0;
  /* The bar is a SIGN CHANGE, not symmetry. A first draft asserted |bwd + fwd| < 0.02 — i.e.
     that conjugating negates the reading — and that is false for a reason worth writing down:
     the statistic is a MAX over time of a projection, and max(−x) = −MIN(x), not −max(x). A
     swing whose hand goes 0.254 m in front and only 0.070 m behind reads +0.254 / −0.070, which
     is the correct answer and fails a symmetry test. What the §479.8 arm actually needs is that
     a strike in front cannot be mistaken for a strike behind: the sign must flip. */
  line(fwd.reach > 0 && bwd.reach < 0,
    `FACING conjugation: +${fwd.reach.toFixed(3)} m forward vs ${bwd.reach.toFixed(3)} m conjugated ` +
    `— the sign flips, so front and back are distinguishable`);
}
console.log('');
if (calFails) { console.error(`verbdonor: ${calFails} CALIBRATION ARM(S) FAILED — the table is not trustworthy`); process.exit(2); }

/* ─────────────────────────────────────── the table ────────────────────────────────────────── */
const rows = [];
bindPose();
rows.push({ ...measure('__bind', { dur: 0.1, loop: false, keys: [{ t: 0, P: {} }], events: [] }), name: '(BIND — §442 control)' });

/* Verb rows read the SHIPPED table, not the raw procedural bodies: for a still-procedural verb
   ACTIVE[v] IS its procedural clip as delivered (donor fill + the §531 limb lever applied), and
   that delivered clip is precisely what a donor would have to beat. Reading RAW_CLIPS here would
   compare candidates against a body the player never sees. */
const { REQUIRED } = await import('../src/player/Clips.js');
const { CLIP_ORIGIN } = await import('../src/player/Animation.js');
const ONLY = process.env.VERBS ? process.env.VERBS.split(/[,\s]+/).filter(Boolean) : null;
for (const v of REQUIRED) {
  if (ONLY && !ONLY.includes(v)) continue;
  const c = ACTIVE[v]; if (!c) continue;
  const o = CLIP_ORIGIN[v];
  rows.push({ ...measure(v, c), tag: (o && o !== 'proc') ? 'PORTED' : 'proc' });
}
for (const n of Object.keys(bench)) rows.push({ ...measure(n, bench[n]), tag: 'cand' });
const { GODOT_LIB_CLIPS } = await import('../src/player/GodotLibClips.js');
for (const n of Object.keys(GODOT_LIB_CLIPS)) if (!bench[n]) rows.push({ ...measure(n, GODOT_LIB_CLIPS[n]), tag: 'lib' });
const { GODOT_CLIPS } = await import('../src/player/GodotClips.js');
for (const n of Object.keys(GODOT_CLIPS)) if (!bench[n]) rows.push({ ...measure(n, GODOT_CLIPS[n]), tag: 'gltf' });

const H = ['clip', 'tag', 'dur', 'lp', 'hipsY', 'legExt', 'handHip', 'bob', 'grnd', 'travel', 'pitch', 'tilt', 'sep', 'stpL', 'stpR', 'sweep', 'reachH', '@t', 'm/s', 'rng'];
const K = ['name', 'tag', 'dur', 'loop', 'hipsY', 'legExt', 'handHip', 'bobCm', 'groundCm', 'travel', 'pitch', 'tilt', 'sep', 'stepL', 'stepR', 'sweep', 'reachH', 'reachHt', 'reachHspd', 'reachHrng'];
const W = H.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[K[i]] ?? '').length)));
console.log(H.map((h, i) => h.padStart(W[i])).join(' '));
for (const r of rows) console.log(K.map((k, i) => String(r[k] ?? (k === 'loop' ? '' : '')).padStart(W[i])).join(' '));
console.log(`\nhipsY/travel/legExt/handHip world m on the shipped rig (legExt = hips above lowest foot, handHip =
lowest hand relative to hips: the two axes that survive an arbitrary authored root height, which is
what every AIRBORNE clip has); bob/grnd/sep/step cm; pitch = accumulated sagittal
body rotation (deg, a flip reads a full turn); tilt = max chest-over-hips off world up; sweep = mean
per-bone deg/s; reachH = max forward reach of handR vs the hips in the POSE's own frame with the time,
the hand speed there and the reach RANGE over the clip (§479.8); reachF = same for footR.`);
if (warnings.length) console.log(`\nwarnings: ${warnings.length}`);

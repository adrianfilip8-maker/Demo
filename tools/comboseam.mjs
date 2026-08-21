/**
 * comboseam — measure what a MASHED attack chain actually puts on the body.
 *
 * WHY THIS EXISTS (§525). §479.9 photographed a defect at the combo's chain seam: with the godot
 * set, three tracks of the SAME source clip (`Canehit`, the repo's only ground attack) run live at
 * three different phases, and the blended pose puts the cane TRAILING BEHIND Sly rather than
 * anywhere in a strike. That was left measured and unpatched pending one prior question — does
 * the repo actually have a second attack clip? The census (§525) says no, by content. So the seam
 * is ours to fix, and this tool is the instrument that prices and then verifies the fix.
 *
 * WHAT IT MEASURES, and why this measure rather than a channel sum. The quantity is the same one
 * §479.8 calibrated and §479.9 used: forward reach of the swinging hand relative to the hips,
 * through RIG3's own FK, on the BLENDED pose the mixer actually produces.
 *
 * CALIBRATION, run rather than inherited (`--regime proc`, solo peaks against the times the house
 * itself declares in `Clips.js`): `cane_combo_1` peaks at t 0.150 against a declared `cane_hit`
 * of 0.150 — exact; `cane_combo_2` peaks 0.183 against 0.13 (+53 ms); `cane_combo_3` peaks 0.183
 * against 0.21 (−27 ms). A measure that lands on the house's own authored contact for the clip
 * that was authored most deliberately is measuring contact, and the two 30–50 ms residuals are
 * the honest width of it.
 *
 * A channel sum cannot see this defect at all: every track is playing its full authored arc, so
 * every per-clip sum is correct while the thing on screen is a cane pointing somewhere no frame
 * of the clip points. The defect lives ONLY in the composition.
 *
 * It drives the REAL mixer (`Animation`) with the REAL cadence (`Moveset.Combo` re-swings at
 * `_elapsed >= _t * 0.55`, `TUNE.comboTimes [0.28,0.28,0.40]`, `oneShot` fade 0.08) — not a
 * reimplementation of either, so a change to the mixer or the tuning shows up here.
 *
 *   node tools/comboseam.mjs                     # shipped regime (godot), mashed
 *   node tools/comboseam.mjs --regime proc       # the procedural set, for calibration
 *   node tools/comboseam.mjs --json out.json
 *
 * WHAT IT CANNOT DISCRIMINATE (§418.3, third line). It reads the right hand only — its position
 * (reach) and its orientation (off-manifold angle). A chain that keeps both while mangling the
 * TORSO, the FEET or the left arm scores identically to a clean one, and the off-manifold angle
 * is computed against the three solos' hand orientations alone, so it cannot see a pose that is
 * on-manifold for the hand and impossible for the rest of the body. It is a seam detector, not a
 * pose judge; the frames in `shots/` are what settle whether the motion reads, and this tool
 * exists to say WHERE to point them. Nor does it model the LUNGE — `Combo.swing` also drives
 * `velocity`, so the on-screen distance covered is larger than any number here.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { PoseBuffer } from '../src/player/Rig.js';
import { RIG3 } from '../src/player/SlyModel3.js';
import { sampleInto } from '../src/player/Clips.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REGIME = arg('--regime', 'godot');
/**
 * `--nocoalesce` reproduces the PRE-§525 mixer exactly, so the before/after of the one-shot
 * coalesce stays measurable forever instead of living in one session's scrollback.
 *
 * It works by stripping `source` off the live clip table, because that is the whole input to the
 * rule (`play()`: `if (!loop && c.source)`). Removing it puts those clips in precisely the state
 * procedural clips are always in — no source, therefore free to layer — so this flag reconstructs
 * the old behaviour rather than approximating it with a parallel code path that could drift.
 */
const NOCOALESCE = argv.includes('--nocoalesce');

/**
 * THE REGIME MUST BE SET BEFORE `Animation.js` IS IMPORTED, and this is not a nicety.
 *
 * `play()` resolves clips through the module-level `ACTIVE` table, which `Animation.js` binds
 * ONCE at load from `buildClipSet(animRegime())`. A `--regime` flag that only called
 * `buildClipSet` itself would build a table the mixer never looks at — the tool would silently
 * measure the shipped set under every flag value and report both arms as identical. That is
 * precisely what the first draft of this file did, and the giveaway was `--regime proc` printing
 * the godot numbers to four decimals. `globalThis.__ANIM_AB` is the documented pre-module seam
 * (same one `?anim=` feeds), so setting it here and importing afterwards exercises the real
 * path instead of a parallel one.
 */
globalThis.__ANIM_AB = REGIME;
const { Animation, CLIP_REGIME, ACTIVE: TBL } = await import('../src/player/Animation.js');
/* Strip BEFORE any measurement runs — the first draft stripped after `run()` and both arms
   printed identical numbers, which is the same class of mistake as the inert `--regime` above:
   a knob wired downstream of the thing it is supposed to change. */
if (NOCOALESCE) {
  let n0 = 0;
  for (const n of Object.keys(TBL)) if (TBL[n] && TBL[n].source) { delete TBL[n].source; n0++; }
  console.log(`!! --nocoalesce: source stripped from ${n0} clips — this is the PRE-§525 mixer.`);
}
if (CLIP_REGIME !== REGIME) {
  throw new Error(`comboseam: asked for regime "${REGIME}" but the module loaded "${CLIP_REGIME}" `
    + `— the pre-module seam did not take, and every number below would be from the wrong set.`);
}
const JSON_OUT = arg('--json', '');
const DT = 1 / 60;

/* The cadence, read from the real tuning rather than restated. */
const COMBO_TIMES = [0.28, 0.28, 0.40];
const REPRESS = 0.55;             // Combo.update's re-swing gate
const ONESHOT_FADE = 0.08;        // Controller.oneShot's default

/* ---- RIG3 forward kinematics: bind hierarchy, pose applied, world positions out ---- */
const RIG_ABS = Object.create(null);
for (const [n, , p] of RIG3.SKELETON) RIG_ABS[n] = p;
function makeRig() {
  const rt = new THREE.Group(), bones = Object.create(null);
  for (const [name, parent, p] of RIG3.SKELETON) {
    const b = new THREE.Object3D();
    const pa = parent === 'root' ? [0, 0, 0] : RIG_ABS[parent];
    b.position.set(p[0] - pa[0], p[1] - pa[1], p[2] - pa[2]);
    (parent === 'root' ? rt : bones[parent]).add(b);
    bones[name] = b;
  }
  return { rt, bones };
}
const BONE_NAMES = RIG3.SKELETON.map(([n]) => n);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

/**
 * Forward reach of handR past the hips, in the hips' own frame, PLUS the hand's world
 * orientation — which on the shipped model IS the cane's direction: `SlyModelDLRig` sockets the
 * cane rigidly to `handR` (that file's "WHY A RIGID SOCKET" note), so nothing but this bone's
 * rotation aims it. A hand can sit forward while the cane it carries points backwards, which is
 * why reach alone could not have caught what §479.9's frame showed.
 */
function reachFrom(pose, rig) {
  for (const n of BONE_NAMES) rig.bones[n].quaternion.copy(pose.q[n]);
  rig.rt.updateMatrixWorld(true);
  _v.setFromMatrixPosition(rig.bones.handR.matrixWorld);
  _v2.setFromMatrixPosition(rig.bones.hips.matrixWorld);
  const d = _v.sub(_v2);
  const hq = new THREE.Quaternion().setFromRotationMatrix(rig.bones.hips.matrixWorld).invert();
  d.applyQuaternion(hq);
  const hand = new THREE.Quaternion().setFromRotationMatrix(rig.bones.handR.matrixWorld);
  return { fwd: +Math.hypot(d.x, d.z).toFixed(4), z: +d.z.toFixed(4), y: +d.y.toFixed(4), hand };
}

/** Angle between two quaternions, degrees — sign-insensitive. */
function qdeg(a, b) {
  const d = Math.min(1, Math.abs(a.dot(b)));
  return 2 * Math.acos(d) * 180 / Math.PI;
}

/* ---- a mixer with no character: _advance + _sampleTracks need neither rig nor engine loop ---- */
function makeMixer() {
  const warned = [];
  const engine = { warn: (m) => warned.push(m), emit: () => {} };
  const a = new Animation(engine);
  a.pose = new PoseBuffer(BONE_NAMES);
  return { a, warned };
}

/**
 * One mashed chain. Presses at the earliest moment `Combo.update` allows, which is the input a
 * player produces by holding down attack — the worst case and the common one.
 */
function run({ mash = true } = {}) {
  const { a } = makeMixer();
  const rig = makeRig();
  const frames = [];
  let idx = 0, elapsed = 0, t = 0;
  const swing = () => {
    idx = idx >= 3 ? 1 : idx + 1;
    elapsed = 0;
    const name = `cane_combo_${idx}`;
    a.play(name, { fade: ONESHOT_FADE, loop: false, speed: 1 });
  };
  swing();
  const TOTAL = 1.4;
  while (t < TOTAL) {
    a._advance(DT, t);
    a.pose.clear();
    // sample exactly as _sampleTracks does, but against the regime's own table objects
    const live = [];
    for (const tr of a.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      sampleInto(tr.clip, tr.time, a.pose, tr.w);
      live.push({ clip: tr.clip.name, t: +tr.time.toFixed(3), w: +tr.w.toFixed(3), end: !!tr.ending });
    }
    const r = live.length ? reachFrom(a.pose, rig) : null;
    frames.push({ t: +t.toFixed(3), n: live.length, live, reach: r });
    t += DT; elapsed += DT;
    const lim = COMBO_TIMES[idx - 1];
    if (mash && elapsed >= lim * REPRESS && idx < 3) swing();
  }
  return { frames };
}

/** A single clean swing of one slot — the reference every blended frame is compared against. */
function solo(slot) {
  const { a } = makeMixer();
  const rig = makeRig();
  a.play(`cane_combo_${slot}`, { fade: ONESHOT_FADE, loop: false, speed: 1 });
  const out = [];
  let t = 0;
  while (t < 1.0) {
    a._advance(DT, t);
    a.pose.clear();
    let any = false;
    for (const tr of a.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      sampleInto(tr.clip, tr.time, a.pose, tr.w); any = true;
    }
    if (any) out.push({ t: +t.toFixed(3), reach: reachFrom(a.pose, rig) });
    t += DT;
  }
  return out;
}

const mashed = run();
const solos = [1, 2, 3].map((s) => solo(s));

/**
 * THE OFF-MANIFOLD DISTANCE — the measure that actually catches this defect.
 *
 * Averaging one arc with ITSELF out of phase does not produce a pose from that arc; it produces
 * the mean of several, which the authored motion may never pass through. So for every mashed
 * frame, find the CLOSEST hand orientation anywhere in the clean swing, and report that angle.
 * Near 0° means "the blend is showing a pose the animator drew". Large means the blend invented
 * a pose — and since the cane is socketed rigidly to this bone, an invented hand orientation is
 * an invented cane direction, which is what the frame showed.
 *
 * Calibration: a clean solo scores 0° against itself by construction, so the number is only
 * meaningful as a comparison BETWEEN arms, and the 1-track frames of the mash (which are clean)
 * are the in-run zero.
 */
const manifold = solos.flat().map((f) => f.reach.hand);
for (const f of mashed.frames) {
  if (!f.reach) continue;
  let best = Infinity;
  for (const q of manifold) best = Math.min(best, qdeg(f.reach.hand, q));
  f.off = +best.toFixed(2);
}

console.log(`\n=== comboseam — regime "${REGIME}", mashed chain (press at ${REPRESS} of each slot) ===`);
console.log(`clip sources: ${[1, 2, 3].map((i) => `${i}:${TBL[`cane_combo_${i}`]?.source || 'proc(no source)'}`).join('  ')}`);
console.log(`\n   t   live  tracks (clip@phase×weight)                                    reachFwd   off°`);
for (const f of mashed.frames) {
  if (f.t * 1000 % 50 > 1 && f.n < 3) continue;         // every 0.05 s, plus every 3-track frame
  const desc = f.live.map((l) => `${l.clip.replace('cane_combo_', 'c')}@${l.t.toFixed(2)}×${l.w.toFixed(2)}${l.end ? '↓' : ''}`).join(' ');
  console.log(`${String(f.t.toFixed(3)).padStart(6)}  ${f.n}    ${desc.padEnd(62)} ${f.reach ? f.reach.fwd.toFixed(4) : '-'}  ${f.off != null ? f.off.toFixed(1) : '-'}`);
}

/* The headline: peak reach the mash delivers, against the peak a clean single swing delivers. */
const peakMash = mashed.frames.reduce((m, f) => (f.reach && f.reach.fwd > m ? f.reach.fwd : m), 0);
const peakSolo = Math.max(...solos.map((s) => Math.max(...s.map((f) => f.reach.fwd))));
/* And the seam itself: the worst frame while 3 tracks are live. */
const three = mashed.frames.filter((f) => f.n >= 3);
const seamMin = three.length ? Math.min(...three.map((f) => f.reach.fwd)) : null;
const seamMax = three.length ? Math.max(...three.map((f) => f.reach.fwd)) : null;

console.log(`\n--- summary ---`);
console.log(`frames with 3 live tracks : ${three.length}  (${(three.length * DT).toFixed(3)} s)`);
console.log(`peak reach, clean swing   : ${peakSolo.toFixed(4)} m`);
console.log(`peak reach, mashed        : ${peakMash.toFixed(4)} m   (${((peakMash / peakSolo - 1) * 100).toFixed(1)}%)`);
if (seamMin != null) console.log(`reach while 3 live        : ${seamMin.toFixed(4)} … ${seamMax.toFixed(4)} m`);
console.log(`max live tracks           : ${Math.max(...mashed.frames.map((f) => f.n))}`);
const offs = mashed.frames.filter((f) => f.off != null);
const off1 = offs.filter((f) => f.n === 1), offN = offs.filter((f) => f.n >= 2);
const mx = (a) => (a.length ? Math.max(...a.map((f) => f.off)) : 0);
console.log(`off-manifold, 1 track      : max ${mx(off1).toFixed(1)}°   <- the in-run zero (clean frames)`);
console.log(`off-manifold, 2+ tracks    : max ${mx(offN).toFixed(1)}°   <- poses the authored clip never contains`);

/**
 * PER-STRIKE PEAK — the headline, and the reason the run-wide peak above is a decoy.
 *
 * The FIRST swing of a mash is always clean (nothing is layered on it yet), so a run-wide peak
 * hits the clean value whether or not strikes 2 and 3 survive. What the defect destroys is the
 * MODULATION: three strikes should read as three separate lunges of the cane, and a layered
 * chain flattens them into one plateau. So attribute each frame to the slot that owns it — the
 * highest-weight live track — and report the peak reach delivered while each slot is dominant.
 * Three numbers near the clean peak is a chain that reads; one peak and two shoulders is a smear.
 */
const perSlot = { 1: 0, 2: 0, 3: 0 };
for (const f of mashed.frames) {
  if (!f.reach || !f.live.length) continue;
  const dom = f.live.reduce((a, b) => (b.w > a.w ? b : a));
  const m = /cane_combo_(\d)/.exec(dom.clip);
  if (m) perSlot[m[1]] = Math.max(perSlot[m[1]], f.reach.fwd);
}
console.log(`per-strike peak reach      : ${[1, 2, 3].map((i) => `slot${i} ${perSlot[i].toFixed(4)}`).join('  ')}`);
console.log(`   (clean single swing ${peakSolo.toFixed(4)} m — three numbers near it is a chain that reads)`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ regime: CLIP_REGIME, mashed: mashed.frames, solos, peakSolo, peakMash, seamMin, seamMax }, null, 1));
  console.log(`wrote ${JSON_OUT}`);
}

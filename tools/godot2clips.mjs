/**
 * godot2clips — retarget the Godot project's authored MOVEMENT clips onto RIG3, offline.
 *
 * The user's instruction (playtest, P1): use the repo's animations for movement — starting with
 * `FrontFlip` as the double jump. The repo is the same fan project the mesh already comes from
 * (<https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>, licence status recorded in
 * `public/assets/sly-godot/PROVENANCE.md` — none stated, owner's standing instruction on record).
 *
 * SOURCE, established by reading their scene graph rather than the filename:
 *   `Assets/Models/Characters/SlyCooper_Anims27.gltf` — 24 clips, 166-joint skin, the fullest
 *   animation set in the repository and the ONLY glTF carrying LedgeGrab / LedgeGrab Idle /
 *   PickPocket. Their game does not bind this file directly: the tree in
 *   `sly_cooper_anims_4.tscn` plays `Library_Sly_14` (Falling, FrontFlip, Landing — the
 *   Anims14 bake), `Library_Sly_19` (Walk/Run/Jump/pole/spire/rail — the Anims19 bake) and a
 *   tscn-baked `Library Sly MASTER 006` (the LedgeGrab family). Anims27 is the consolidated
 *   re-export of the same authored motions — MEASURED, not assumed: FrontFlip's pelvis curve is
 *   byte-identical between Anims14 and Anims19, and Anims27 matches within 0.033° at the pelvis
 *   (worst probed joint anywhere: 0.127°, Walk/thigh.L — export float noise, invisible); its
 *   166-vs-174-joint delta is finger control bones only, which the MAP below never touches.
 *   The air jump fires FrontFlip at `Scripts/player__sly.gd:911` via `jump_air_forward`,
 *   through `TimeScale 2/scale = 0.85` (tscn default, never rewritten at runtime) — i.e. THEIR
 *   delivered flip is ≈ 0.88 s inside their jump arc. That number does NOT transfer to our
 *   0.41 s rise; the alias table in Animation.js derives its timing from OUR window (§474.3).
 *
 * TWO STAGES, so the emitted module is reproducible from this repository alone:
 *
 *   node tools/godot2clips.mjs --extract --src <checkout-root>
 *       builds `public/assets/sly-godot/sly-godot-moves.glb` — the movement clips, mesh-free,
 *       with dead channels dropped (morph 'weights' tracks, and scale/translation tracks that
 *       are constant at rest to 1e-6 — each drop counted and printed, nothing silent).
 *   node tools/godot2clips.mjs                 # report only, from the committed GLB
 *   node tools/godot2clips.mjs --write src/player/GodotClips.js
 *
 * THE RETARGET is mixamo2clips' world-space method verbatim (see that file for why a local
 * quaternion copy would be plausible-looking garbage): rest world rotation per source joint,
 * animated world rotation by the same hierarchy, world delta D = W(t)·W_rest⁻¹, our bind is
 * identity so D IS our world target, then world→local top-down over RIG3's parent order, Euler
 * XYZ degrees. Two things are new here, both measured before they were coded:
 *
 *   · THE FLIP LIVES ABOVE THE PELVIS. `FrontFlip`'s 360° is authored on control bones
 *     (`RotateCTL`, 562° of local path; `spine.001` local is ~static). A local-track copy of the
 *     mapped joints would deliver a flip with NO rotation in it — §474.1's failure mode exactly,
 *     the identity authored into a channel the copy discards. The world-space method carries
 *     ancestors' motion into the mapped joint's world delta by construction.
 *   · THE EXPORT'S OWN LAST QUARTER-TURN IS BROKEN, AND DECIMATION IS THE REPAIR. The baked
 *     pelvis curve runs monotonically 0→+282° about +X and then SNAPS BACKWARD to identity in
 *     0.05 s (raw keys: …+268.6, +282.4, +119.4, +18.7, 0 — the +119.4 key is the quaternion
 *     image of a pose the forward continuation never authored; played by any conformant glTF
 *     sampler, three's AND Godot's, the pelvis visibly unwinds ~282° in ~3 frames). Their game
 *     hides it at TimeScale 2 — the snap spans ~1.5 rendered frames, and a one-frame jump from
 *     +282° to upright is visually indistinguishable from +78° forward. Sampled at EMIT_FPS and
 *     played through `Clips.js`'s per-segment slerp, at most one emitted key can land inside the
 *     0.05 s snap, every adjacent emitted pair sits ≤ ~110° apart, and slerp's short arc runs the
 *     flip FORWARD through +360 with an 18° overshoot-and-settle — textbook follow-through, from
 *     the artefact that created the problem. The detector below measures this rather than trusts
 *     it: any adjacent-key world step over SNAP_DEG at source rate is flagged per clip/bone, and
 *     the emitted curve's net swept angle is printed next to the source's so the repair (or a
 *     clip where decimation does NOT repair) is a printed number, not a hope.
 *
 * WHAT IT CANNOT DO, so nobody reads the output as complete: the source has no cane bone we can
 * use (our cane channel is a hand-space aim consumed via `_attachPoints`, which the shipped model
 * does not register — §474.1), no jaw/ear/cap/brow mapping (declined for the same reasons
 * `SlyModelGodot` declines them), and finger animation lands nowhere because RIG3 has no finger
 * bones (§207's baked curl). Those stay procedural via `Animation.js`'s donor fill.
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RIG3 } from '../src/player/SlyModel3.js';
import { toGLB, fromGLB, compact, assertAccessorsResolved } from './godot2rig.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET = path.join(ROOT, 'public/assets/sly-godot/sly-godot-moves.glb');
const SRC_GLTF = 'Assets/Models/Characters/SlyCooper_Anims27.gltf';

/**
 * The movement set. Combat (Canehit, CaneSwing×3), PickPocket and the 1-channel KeyAction.001
 * are deliberately NOT extracted: the instruction is the MOVEMENT set, and every clip here is
 * either on the audit list (Walk, Run, Jump, Falling, Landing, the attach set) or is this
 * round's deliverable (FrontFlip). Re-extraction is one --extract away if that changes.
 */
export const KEEP_CLIPS = [
  'FrontFlip',
  'Walk', 'Run', 'Jump', 'Falling', 'Landing',
  'LedgeGrab', 'LedgeGrab Idle',
  'PoleGrab', 'PoleClimbing', 'PoleClimbIdle',
  'railrun', 'RailrunStand',
  'SpireJump', 'SpireJumpIdle', 'SpireJumplanding',
  'Crouching stand   ', 'Standupright',
];

/**
 * Source joint → RIG3 bone. `SlyModelGodot.BONE_MAP`'s namespace (their Blender rig), with two
 * deliberate differences, both about ROTATION rather than skinning:
 *   · `chest` takes `spine.004` (the DEEPER of the two joints SlyModelGodot folds into it for
 *     weights). The world-space method makes this exact: neck and shoulders hang off spine.004
 *     in the source, so taking its world delta puts our chest where their upper chest is and the
 *     children compose correctly; spine.003's motion is absorbed into chest's local, lost to
 *     nothing.
 *   · the tail maps by SlyModelGodot's own arc anchors (tailA←Tail.008 … tailD←Tail.002) — this
 *     rig HAS a tail, which Mixamo did not, and clips that move it keep it.
 */
const MAP = {
  'spine.001': 'hips',
  'spine.002': 'spine',
  'spine.004': 'chest',
  'spine.005': 'neck',
  face: 'head',
  'shoulder.L': 'shoulderL', 'upper_arm.L': 'upperArmL', 'forearm.L': 'lowerArmL', 'hand.L': 'handL',
  'shoulder.R': 'shoulderR', 'upper_arm.R': 'upperArmR', 'forearm.R': 'lowerArmR', 'hand.R': 'handR',
  'thigh.L': 'upperLegL', 'shin.L': 'lowerLegL', 'foot.L': 'footL', 'toe.L': 'toeL',
  'thigh.R': 'upperLegR', 'shin.R': 'lowerLegR', 'foot.R': 'footR', 'toe.R': 'toeR',
  'Tail.008': 'tailA', 'Tail.006': 'tailB', 'Tail.004': 'tailC', 'Tail.002': 'tailD',
};
/* RIG3 parent order for the world→local pass. Mirrors SlyModel3.SKELETON, tail included. */
const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', lowerArmL: 'upperArmL', handL: 'lowerArmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', lowerArmR: 'upperArmR', handR: 'lowerArmR',
  upperLegL: 'hips', lowerLegL: 'upperLegL', footL: 'lowerLegL', toeL: 'footL',
  upperLegR: 'hips', lowerLegR: 'upperLegR', footR: 'lowerLegR', toeR: 'footR',
  tailA: 'hips', tailB: 'tailA', tailC: 'tailB', tailD: 'tailC',
};
const ORDER = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'lowerArmL', 'handL',
  'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'toeL',
  'upperLegR', 'lowerLegR', 'footR', 'toeR',
  'tailA', 'tailB', 'tailC', 'tailD'];

const EMIT_FPS = 20;            // same rate and same reasoning as mixamo2clips
const CHECK_FPS = 60;           // the source's own bake rate — the snap detector's resolution
const SNAP_DEG = 120;           // per-key step above this at 60 Hz is 7200 °/s — no authored
                                // motion in the set approaches it (measured max 47°); only the
                                // export artefact does (282°). Printed, so a third cluster shows.
const DEG = 180 / Math.PI;

/* Which clips are cycles, named by FUNCTION (mixamo2clips' rule and its reasons). `Falling` is a
   cycle because its JOB is `jump_fall`'s — a held pose the fall state replays for as long as the
   fall lasts; as a one-shot it would end and fade to nothing mid-drop. Its motion is near-static
   (max 60 Hz world step 1°, pos range 2 mm) so the seam is closed by construction. */
const LOOPS = /^(Walk|Run|railrun|Falling|PoleClimbing|PoleClimbIdle|LedgeGrab Idle|SpireJumpIdle|RailrunStand|Crouching stand\s*|Standupright)$/;

/* ---- RIG3 forward kinematics for grounding + stride, mixamo2clips' block adapted -----------
 * Same constants, same fit, same gate, same reasons (see that file): stride is the distance the
 * planted foot travels backwards under the body per cycle, measured with RIG3's own proportions;
 * a footstep is the start of a contact run; only cycles whose feet actually reach the floor and
 * whose planted foot really travels get either. ONE deliberate difference from mixamo2clips: the
 * measurement runs on the CHECK_FPS capture, not the emitted 20 Hz keys — this set's gaits are
 * bouncy cartoon bounds whose stance phase is so short that 20 Hz leaves ≤ 2 keys inside the
 * contact band (measured: Walk 2, Run 1 — under the fit's ≥ 3 minimum), while 60 Hz sees the
 * same stance as 4–6 samples. The dense capture and the emitted keys are views of the same
 * sampled motion (see the one-pass note above), so the stride quantity is unchanged; only the
 * estimator's resolution is. */
const CONTACT_BAND = 0.030, IK_ANKLE = 0.086, PLANT_LIFT = 0.10;
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
  return { rt, bones, hipsBase: bones.hips.position.clone() };
}
const _e3 = new THREE.Euler(), _vk = new THREE.Vector3();
/** World positions of `want` for every key of an emitted clip. */
function fkTrack(keys, want) {
  const r = makeRig();
  const out = want.map(() => []);
  for (const k of keys) {
    for (const b of ORDER) {
      const d = k.P[b];
      if (d) { _e3.set(d[0] / DEG, d[1] / DEG, d[2] / DEG, 'XYZ'); r.bones[b].quaternion.setFromEuler(_e3); }
      else r.bones[b].quaternion.identity();
    }
    r.bones.hips.position.set(r.hipsBase.x + k.pos[0], r.hipsBase.y + k.pos[1], r.hipsBase.z + k.pos[2]);
    r.rt.updateMatrixWorld(true);
    want.forEach((n, i) => { _vk.setFromMatrixPosition(r.bones[n].matrixWorld); out[i].push(_vk.clone()); });
  }
  return out;
}
/** Derived stride + footstep events for one emitted clip, or nulls when the gate refuses. */
function deriveStride(keys, loop) {
  const [tL, tR, aL, aR] = fkTrack(keys, ['toeL', 'toeR', 'footL', 'footR']);
  const minY = (a) => a.reduce((m, v) => Math.min(m, v.y), Infinity);
  const lift = Math.max(0, Math.min(minY(aL), minY(aR)) - IK_ANKLE);
  const runsOf = (tr) => {
    const lo = minY(tr), on = tr.map((v) => v.y <= lo + CONTACT_BAND);
    const rr = []; let cur = null;
    for (let i = 0; i < on.length; i++) { if (on[i]) { if (!cur) { cur = []; rr.push(cur); } cur.push(i); } else cur = null; }
    return rr;
  };
  let num = [0, 0], den = 0;
  const steps = [];
  for (const [tr, side] of [[tL, 'L'], [tR, 'R']]) {
    for (const R of runsOf(tr)) {
      /* ≥ 2, not mixamo2clips' ≥ 3: Run's stance is TWO 60 Hz samples (measured — a sprint's
         contact of ~0.03 s), and a 2-point run still contributes an exact slope to the fit,
         which pools across both feet so the velocity stays overdetermined. Every other clip's
         verdict is unchanged by this (checked by running both thresholds side by side). */
      if (R.length >= 2) {
        const ts = R.map((i) => keys[i].t);
        const tb = ts.reduce((a, b) => a + b, 0) / R.length;
        const pbx = R.reduce((s, i) => s + tr[i].x, 0) / R.length;
        const pbz = R.reduce((s, i) => s + tr[i].z, 0) / R.length;
        R.forEach((i, k2) => {
          const tt = ts[k2] - tb;
          num[0] += tt * (tr[i].x - pbx); num[1] += tt * (tr[i].z - pbz); den += tt * tt;
        });
      }
      if (R.length >= 2) steps.push({ t: keys[R[0]].t, n: 'footstep', d: { foot: side } });
    }
  }
  const vel = den > 0 ? [-num[0] / den, -num[1] / den] : [0, 0];
  const speed = Math.hypot(vel[0], vel[1]);
  const isLoco = loop && lift < PLANT_LIFT && speed > 0.2;
  const dur = keys[keys.length - 1].t;
  return {
    lift: +lift.toFixed(3), speed: +speed.toFixed(3),
    stride: isLoco ? +(speed * dur).toFixed(3) : 0,
    events: isLoco && steps.length ? steps.sort((a, b) => a.t - b.t) : null,
  };
}

/* ───────────────────────────── extract: checkout → committed GLB ───────────────────────────── */

function doExtract(srcDir) {
  const gp = path.join(srcDir, SRC_GLTF);
  if (!existsSync(gp)) throw new Error(`godot2clips: missing ${gp} — --src must be a checkout root`);
  const src = JSON.parse(readFileSync(gp, 'utf8'));
  const bin = readFileSync(gp.replace(/\.gltf$/, '.bin'));

  const names = src.animations.map((a) => a.name);
  for (const want of KEEP_CLIPS) {
    if (!names.includes(want)) throw new Error(`godot2clips: source has no clip "${want}" (has: ${names.join(' | ')})`);
  }

  /* Rest TRS per node, for the constant-track trim. */
  const restT = src.nodes.map((n) => n.translation || [0, 0, 0]);

  const readAcc = (ai) => {
    const a = src.accessors[ai];
    const bv = src.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    return new Float32Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
  };

  const dropped = { weights: 0, constScale: 0, constPos: 0, kept: 0 };
  const anims = [];
  for (const a of src.animations.filter((x) => KEEP_CLIPS.includes(x.name))) {
    const channels = [];
    for (const c of a.channels) {
      const s = a.samplers[c.sampler];
      if (c.target.path === 'weights') { dropped.weights++; continue; }
      if (c.target.path === 'scale') {
        const v = readAcc(s.output);
        let dead = true;
        for (let i = 0; i < v.length && dead; i++) if (Math.abs(v[i] - 1) > 1e-6) dead = false;
        if (dead) { dropped.constScale++; continue; }
      }
      if (c.target.path === 'translation') {
        const v = readAcc(s.output);
        const r = restT[c.target.node];
        let dead = true;
        for (let i = 0; i < v.length && dead; i++) if (Math.abs(v[i] - r[i % 3]) > 1e-6) dead = false;
        if (dead) { dropped.constPos++; continue; }
      }
      dropped.kept++;
      channels.push(c);
    }
    anims.push({ name: a.name, channels, samplers: a.samplers });
  }

  /* Re-index samplers per animation to only those still referenced, then compact accessors. */
  const keep = [];
  for (const a of anims) {
    const used = [...new Set(a.channels.map((c) => c.sampler))];
    const remap = new Map(used.map((si, i) => [si, i]));
    a.samplers = used.map((si) => ({ ...a.samplers[si] }));
    a.channels = a.channels.map((c) => ({ ...c, sampler: remap.get(c.sampler) }));
    for (const s of a.samplers) keep.push(s.input, s.output);
  }
  const { json, bin: outBin, accMap } = compact(src, bin, keep);
  json.animations = anims;
  for (const a of json.animations) for (const s of a.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
  delete json.meshes; delete json.skins; delete json.materials; delete json.images; delete json.textures; delete json.samplers;
  for (const n of json.nodes) { delete n.mesh; delete n.skin; }
  assertAccessorsResolved(json, 'sly-godot-moves.glb');
  const out = toGLB(json, outBin);
  writeFileSync(ASSET, out);
  console.log(`wrote ${ASSET}  ${(out.length / 1024).toFixed(0)} KB`);
  console.log(`  ${json.animations.length} clips: ${json.animations.map((a) => a.name.trim()).join(', ')}`);
  console.log(`  channels kept ${dropped.kept}; dropped ${dropped.weights} morph 'weights', `
    + `${dropped.constScale} identity-constant scale, ${dropped.constPos} rest-constant translation`);
}

/* ─────────────────────────── retarget: committed GLB → module ─────────────────────────────── */

async function loadAsset() {
  if (!existsSync(ASSET)) throw new Error(`godot2clips: ${ASSET} not built — run --extract --src <checkout>`);
  const buf = readFileSync(ASSET);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  return gltf;
}

async function doRetarget(writePath) {
  const gltf = await loadAsset();
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  /* GLTFLoader sanitises node names (dots stripped in r185). Resolve each plausible form. */
  const nodes = new Map();
  root.traverse((o) => { if (o.name) nodes.set(o.name, o); });
  const resolve = (nm) => nodes.get(nm)
    || nodes.get(nm.replace(/\./g, ''))
    || nodes.get(nm.replace(/\./g, '_'))
    || nodes.get(nm.replace(/[\s.:/[\]]/g, '_'))
    || null;

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const worldQuat = (node) => { node.matrixWorld.decompose(_p, _q, _s); return _q.clone(); };

  const missing = Object.keys(MAP).filter((m) => !resolve(m));
  const restWorld = new Map();
  for (const [nm] of Object.entries(MAP)) { const n = resolve(nm); if (n) restWorld.set(nm, worldQuat(n)); }
  console.log(`source nodes: ${nodes.size}   mapped: ${restWorld.size}/${Object.keys(MAP).length}`);
  if (missing.length) console.log(`  !! absent from the GLB: ${missing.join(', ')}`);
  if (restWorld.size < 20) throw new Error('godot2clips: mapping collapsed — name sanitisation changed?');

  /* ---- facing. RIG3 faces +Z (its tail roots at z −0.150). Measured on the source's own rest
     feet rather than assumed: if the toes point −Z, every world delta and every hips offset is
     conjugated by a 180° yaw so "his forward" stays +Z in the emitted data. */
  const toeZ = new THREE.Vector3().setFromMatrixPosition(resolve('toe.L').matrixWorld).z
    - new THREE.Vector3().setFromMatrixPosition(resolve('foot.L').matrixWorld).z;
  const FLIP = toeZ < 0;
  const YAW180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  console.log(`facing: source toes point ${toeZ >= 0 ? '+Z' : '-Z'} (Δz ${toeZ.toFixed(4)}) — `
    + (FLIP ? 'conjugating by yaw 180°' : 'no conjugation'));

  /* ---- hips scale K, derived from the two rigs' own hip heights (mixamo2clips' rule). */
  const HIPS_ABS_Y = (RIG3.SKELETON.find(([n]) => n === 'hips') || [, , [0, 1, 0]])[2][1];
  const restHips = new THREE.Vector3().setFromMatrixPosition(resolve('spine.001').matrixWorld);
  const K = HIPS_ABS_Y / restHips.y;
  console.log(`hips scale K = ${HIPS_ABS_Y.toFixed(4)} / ${restHips.y.toFixed(4)} = ${K.toFixed(4)}×  (offsets referenced to REST)`);

  const mixer = new THREE.AnimationMixer(root);
  const out = {};
  const table = [];

  for (const clip of gltf.animations) {
    const act = mixer.clipAction(clip);
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.reset();
    act.play();

    /** One retarget sample at absolute time t → { P, pos } in emit units. */
    const sample = (t) => {
      mixer.setTime(t);
      root.updateMatrixWorld(true);
      const worldTarget = new Map();
      for (const [nm, ours] of Object.entries(MAP)) {
        if (!restWorld.has(nm)) continue;
        let d = worldQuat(resolve(nm)).multiply(restWorld.get(nm).clone().invert());
        if (FLIP) d = YAW180.clone().multiply(d).multiply(YAW180.clone().invert());
        worldTarget.set(ours, d);
      }
      const P = {};
      const localW = new Map();
      for (const b of ORDER) {
        const w = worldTarget.get(b);
        if (!w) continue;
        const par = PARENT[b];
        const pw = par ? (localW.get(par) || new THREE.Quaternion()) : new THREE.Quaternion();
        localW.set(b, w.clone());
        const q = pw.clone().invert().multiply(w);
        const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
        P[b] = [e.x * DEG, e.y * DEG, e.z * DEG].map((v) => +v.toFixed(1));
      }
      const hp = new THREE.Vector3().setFromMatrixPosition(resolve('spine.001').matrixWorld);
      const off = hp.sub(restHips).multiplyScalar(K);
      if (FLIP) { off.x = -off.x; off.z = -off.z; }
      return { P, pos: [+off.x.toFixed(4), +off.y.toFixed(4), +off.z.toFixed(4)], world: worldTarget };
    };

    /* ---- ONE ascending sampling pass at the source's own bake rate. One pass is load-bearing:
       `clampWhenFinished` pauses the action the moment a sample lands on t == duration, and a
       paused action ignores every later `setTime` — mixamo2clips documents the trap, and the
       first draft of this file walked into it anyway (a second pass after the detector emitted
       every clip as its FROZEN final pose; the never-moves filter kept 21 "moving" bones because
       a constant non-rest pose still differs from rest, and only the sweep instrument said 0°
       where the source said 360°). Snap detection, the source sweep, and the emitted keys are
       all views of the same captured samples now. */
    const nChk = Math.max(2, Math.round(clip.duration * CHECK_FPS) + 1);
    let prevW = null;
    const snaps = [];
    let maxStep = 0, maxStepBone = '';
    let srcSweep = 0;                       // net hips pitch sweep, sign-proof vector method
    let prevA = null;
    const samples = [];
    for (let i = 0; i < nChk; i++) {
      const t = (i / (nChk - 1)) * clip.duration;
      const s = sample(t);
      samples.push({ t, ...s });
      const { world } = s;
      if (prevW) {
        for (const [b, w] of world) {
          const d = prevW.get(b).clone().invert().multiply(w);
          const ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
          if (ang > maxStep) { maxStep = ang; maxStepBone = b; }
          if (ang > SNAP_DEG) snaps.push({ t: +t.toFixed(3), b, ang: +ang.toFixed(0) });
        }
      }
      prevW = world;
      const v = new THREE.Vector3(0, 0, 1).applyQuaternion(world.get('hips'));
      const a = Math.atan2(v.y, v.z);
      if (prevA !== null) { let da = a - prevA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; srcSweep += da; }
      prevA = a;
    }
    act.stop();

    /* ---- the emitted keys: the CHECK_FPS capture decimated onto the EMIT_FPS grid (every
       third sample, last always included). `lin` between dense machine samples — mixamo2clips'
       reasoning, verbatim. */
    const stride = Math.max(1, Math.round(CHECK_FPS / EMIT_FPS));
    const keys = [];
    for (let i = 0; i < nChk; i += stride) keys.push(samples[i]);
    if (keys[keys.length - 1] !== samples[nChk - 1]) keys.push(samples[nChk - 1]);
    for (const k of keys) { k.e = 'lin'; k.t = +k.t.toFixed(3); delete k.world; }

    /* drop bones that never move (dense sample ⇒ absent bone = donor's to fill) */
    const moves = new Set();
    for (const b of ORDER) {
      let mx = 0;
      for (const k of keys) { const d = k.P[b]; if (d) mx = Math.max(mx, Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])); }
      if (mx > 0.05) moves.add(b);
    }
    for (const k of keys) for (const b of ORDER) if (!moves.has(b)) delete k.P[b];

    /* ---- what the EMITTED curve delivers through Clips.js' own sampler semantics: per-segment
       slerp between the emitted keys. The same sign-proof vector sweep as the source read, so
       the snap repair (or its failure) is one printed pair of numbers. */
    const qOf = (d) => new THREE.Quaternion().setFromEuler(new THREE.Euler(d[0] / DEG, d[1] / DEG, d[2] / DEG, 'XYZ'));
    let emitSweep = 0;
    /* world hips = local hips (hips has no mapped parent), so the hips track alone decides */
    const hk = keys.filter((k) => k.P.hips);
    if (hk.length >= 2) {
      let pa = null;
      for (let i = 0; i < nChk; i++) {
        const t = (i / (nChk - 1)) * clip.duration;
        let lo = hk[0], hi = hk[hk.length - 1];
        for (const k of hk) { if (k.t <= t) lo = k; else { hi = k; break; } }
        const f = hi.t > lo.t ? (t - lo.t) / (hi.t - lo.t) : 0;
        const q = qOf(lo.P.hips).slerp(qOf(hi.P.hips), f);
        const v = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const a = Math.atan2(v.y, v.z);
        if (pa !== null) { let da = a - pa; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; emitSweep += da; }
        pa = a;
      }
    }

    const name = clip.name.trim();
    const loop = LOOPS.test(clip.name);
    const g = deriveStride(samples, loop);
    const rec = { dur: +clip.duration.toFixed(3), loop, keys };
    if (g.stride > 0) rec.stride = g.stride;
    if (g.events) rec.events = g.events;
    out[name] = rec;
    table.push({
      name, dur: clip.duration, keys: keys.length, bones: moves.size, loop,
      maxStep: +maxStep.toFixed(0), maxStepBone, snaps,
      srcSweep: +(srcSweep * DEG).toFixed(0), emitSweep: +(emitSweep * DEG).toFixed(0),
      posY: Math.min(...keys.map((k) => k.pos[1])),
      lift: g.lift, stride: g.stride, steps: g.events ? g.events.length : 0,
    });
  }

  console.log('\nclip                  dur   keys bones loop  max 60Hz world step      hips pitch sweep src→emit   min pos.y   lift  stride  steps');
  for (const r of table) {
    const snap = r.snaps.length ? `  SNAP×${r.snaps.length}@${r.snaps[0].t}s ${r.snaps[0].b} ${r.snaps[0].ang}°` : '';
    console.log(`${r.name.padEnd(20)} ${r.dur.toFixed(2)}  ${String(r.keys).padStart(4)} ${String(r.bones).padStart(4)}  ${r.loop ? 'yes' : ' no'}`
      + `  ${String(r.maxStep).padStart(4)}° ${r.maxStepBone.padEnd(10)}${snap.padEnd(26)}`
      + ` ${String(r.srcSweep).padStart(5)}° → ${String(r.emitSweep).padStart(5)}°   ${r.posY.toFixed(3)}`
      + `   ${r.lift.toFixed(3)}  ${(r.stride ? r.stride.toFixed(3) : '—').padStart(6)}  ${String(r.steps).padStart(5)}`);
  }
  const snapped = table.filter((r) => r.snaps.length);
  console.log(`\n${snapped.length} clip(s) carry a source snap ≥ ${SNAP_DEG}°/key; `
    + `for each, compare the sweep pair above — emit ≈ ±360 on a flip means decimation repaired it.`);

  if (writePath) {
    writeFileSync(writePath, `/* GENERATED by tools/godot2clips.mjs — do not hand-edit.\n`
      + ` * Retargeted from public/assets/sly-godot/sly-godot-moves.glb (SlyCooper_Anims27.gltf;\n`
      + ` * provenance in public/assets/sly-godot/PROVENANCE.md). World-space delta retarget onto\n`
      + ` * RIG3; jaw/ears/cap/brows/cane are absent by construction and stay procedural via the\n`
      + ` * donor fill in Animation.js. Consumed through Clips.js' own compile(). */\n`
      + `export const GODOT_CLIPS = ${JSON.stringify(out)};\n`);
    console.log(`\nwrote ${writePath}`);
  } else {
    console.log('\n(report only — pass --write <path> to emit)');
  }
}

/* ───────────────────────────── entry ───────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--extract')) {
    const i = argv.indexOf('--src');
    if (i < 0 || !argv[i + 1]) throw new Error('godot2clips --extract needs --src <checkout-root>');
    doExtract(path.resolve(argv[i + 1]));
  } else {
    const wi = argv.indexOf('--write');
    await doRetarget(wi !== -1 ? argv[wi + 1] : null);
  }
}

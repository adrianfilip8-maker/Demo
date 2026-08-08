/**
 * mixamo2clips — retarget the supplied Mixamo clips onto RIG3, offline.
 *
 * `public/assets/sly-anim/sly-anims.glb` holds 16 authored clips (idle x3, walk forward/side, run,
 * jump, airtime, fall poses, hang_loose, hang_crawl L/R, pole_up) on a standard Mixamo humanoid.
 * `Clips.js` is hand-authored data in a different shape entirely: per-key bone -> [x,y,z] Euler
 * DEGREES on top of bind. This converts one to the other and prints enough to check the result
 * before any of it is wired into the game.
 *
 * WHY A QUATERNION COPY WOULD BE WRONG. RIG3's bones have IDENTITY local rotations at bind — the
 * skeleton's shape lives entirely in bone POSITIONS (SlyModelDLRig's header states this: "pose bones
 * BY NAME against this project's skeleton, with identity bind rotations"). Mixamo's bones carry real
 * per-bone rest rotations that orient each bone along its own axis. Copying local quaternions across
 * would apply Mixamo's axis conventions to our bones and produce garbage that looks almost plausible
 * — the worst kind of wrong.
 *
 * THE RETARGET, in world space, which avoids per-bone axis-correction algebra entirely:
 *
 *   1. rest world rotation of each source joint, Ws_rest(b), from the GLB's own node hierarchy;
 *   2. animated world rotation Ws(b, t), by walking the same hierarchy with sampled local keys;
 *   3. the joint's world-space CHANGE:  D(b, t) = Ws(b, t) * Ws_rest(b)^-1;
 *   4. our rest world rotations are identity, so our target world rotation IS D(b, t);
 *   5. convert world -> local top-down over RIG3's parent order:
 *         Qlocal(b) = Qworld(parent)^-1 * D(b, t)
 *   6. Euler XYZ degrees, which is what `P` in Clips.js means.
 *
 * WHAT IT CANNOT DO, stated so nobody reads the output as complete: Mixamo has no tail and no cane.
 * `tailA..tailD` and the cane are absent from every emitted key and must stay on the existing
 * procedural spring chain layered over the clip. Fingers are absent too — RIG3 has no finger bones
 * (that is why the gloves needed a baked curl, §207).
 *
 *   node tools/mixamo2clips.mjs                 # report only, writes nothing
 *   node tools/mixamo2clips.mjs --write <path>  # emit the module
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RIG3 } from '../src/player/SlyModel3.js';

const SRC = new URL('../public/assets/sly-anim/sly-anims.glb', import.meta.url);

/* Mixamo -> RIG3. Deliberately partial: only what both rigs have. */
const MAP = {
  'mixamorig:Hips': 'hips',
  'mixamorig:Spine1': 'spine',
  'mixamorig:Spine2': 'chest',
  'mixamorig:Neck': 'neck',
  'mixamorig:Head': 'head',
  'mixamorig:LeftShoulder': 'shoulderL', 'mixamorig:RightShoulder': 'shoulderR',
  'mixamorig:LeftArm': 'upperArmL', 'mixamorig:RightArm': 'upperArmR',
  'mixamorig:LeftForeArm': 'lowerArmL', 'mixamorig:RightForeArm': 'lowerArmR',
  'mixamorig:LeftHand': 'handL', 'mixamorig:RightHand': 'handR',
  'mixamorig:LeftUpLeg': 'upperLegL', 'mixamorig:RightUpLeg': 'upperLegR',
  'mixamorig:LeftLeg': 'lowerLegL', 'mixamorig:RightLeg': 'lowerLegR',
  'mixamorig:LeftFoot': 'footL', 'mixamorig:RightFoot': 'footR',
  'mixamorig:LeftToeBase': 'toeL', 'mixamorig:RightToeBase': 'toeR',
};
/* RIG3 parent order, needed for the world->local pass. Mirrors SlyModel3's SKELETON. */
const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', lowerArmL: 'upperArmL', handL: 'lowerArmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', lowerArmR: 'upperArmR', handR: 'lowerArmR',
  upperLegL: 'hips', lowerLegL: 'upperLegL', footL: 'lowerLegL', toeL: 'footL',
  upperLegR: 'hips', lowerLegR: 'upperLegR', footR: 'lowerLegR', toeR: 'footR',
};
const ORDER = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'lowerArmL', 'handL',
  'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'toeL',
  'upperLegR', 'lowerLegR', 'footR', 'toeR'];

const FPS = 20;                 // sample rate; Clips.js keys are sparse and eased, 20 is ample
const DEG = 180 / Math.PI;

const gltf = await new GLTFLoader().parseAsync(
  readFileSync(SRC).buffer.slice(0), '');
const root = gltf.scene;
root.updateMatrixWorld(true);

/* rest world rotations, captured before any clip is applied.
 *
 * NAME SANITISATION, which cost a run to discover rather than to assume: GLTFLoader rewrites node
 * names through PropertyBinding.sanitizeNodeName, and in three r185 it STRIPS the colon rather than
 * replacing it — `mixamorig:Hips` arrives as `mixamorigHips`. The map below is written in canonical
 * Mixamo form because that is what a reader will recognise, and the resolver tries each plausible
 * sanitisation instead of hard-coding one, so a three upgrade that switches to `_` does not silently
 * map zero bones again. The first run mapped 0/21 and said so loudly, which is the only reason this
 * is a five-line resolver and not a wrong clip set. */
const nodes = new Map();
root.traverse((o) => { if (o.name) nodes.set(o.name, o); });
const resolve = (mx) => nodes.get(mx)
  || nodes.get(mx.replace(/:/g, ''))
  || nodes.get(mx.replace(/:/g, '_'))
  || nodes.get(mx.replace(/[\s.:/[\]]/g, '_'))
  || null;
/* DECOMPOSE, never setFromRotationMatrix. This rig's world scale is 0.01 — Mixamo's convention —
   and setFromRotationMatrix is only valid on an unscaled rotation matrix. Fed a scaled one it
   returns a quaternion that is wrong but STABLE, so rest and animated frames were wrong in the same
   way and the delta cancelled to identity: every clip reported 0.0 degrees on every bone. The
   report caught it because a walk with a 0-degree thigh swing is obviously impossible; a subtler
   version of the same bug would have shipped. */
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const worldQuat = (node) => { node.matrixWorld.decompose(_p, _q, _s); return _q.clone(); };
const restWorld = new Map();
for (const [mx] of Object.entries(MAP)) {
  const n = resolve(mx);
  if (!n) continue;
  restWorld.set(mx, worldQuat(n));
}
const missing = Object.keys(MAP).filter((m) => !resolve(m));
console.log(`source nodes: ${nodes.size}   mapped: ${restWorld.size}/${Object.keys(MAP).length}`);
if (missing.length) console.log(`  !! absent from the GLB: ${missing.join(', ')}`);

/* ---- the hips channel: units and reference frame -------------------------------------------
 * The old emitter wrote `hipsWorld(t) - hipsWorld(t=0)` straight into `pos`, and that is wrong
 * twice over.
 *
 *   UNITS. The GLB's Armature carries scale 0.01, so the source's own hip height in world units
 *   is 0.0569 against RIG3's 0.8856 — a factor of ~15.6. Every offset was that much too small,
 *   which is why the emitted hips never bobbed: a 3 cm pelvis rise arrived as 2 mm.
 *
 *   REFERENCE FRAME, which is the expensive half. Referring to frame 0 discards the clip's
 *   STANDING HEIGHT. The source walks with its pelvis 0.0093 below its own rest pose — a 14.5 cm
 *   crouch at our scale — and its legs are folded to match. Zeroing at frame 0 pinned the pelvis
 *   at RIG3's bind height while keeping the folded legs, so the character walked with its feet
 *   24-43 cm in the air. `Rig.footIK` cannot rescue that and is not meant to: it computes
 *   `clipLift = max(0, footY - (rootY + ikAnkle))` and then targets `groundY + ikAnkle + clipLift`
 *   — it PRESERVES authored lift by design, so a swing foot is never dragged down, and neither is
 *   a floating one. `footPlant` also fades to 0 above 0.10 m of lift, so those clips registered no
 *   contact at any moment.
 *
 * K is derived from the two rigs' own hip heights rather than hard-coded, so a source swap or a
 * change to RIG3.TUNE.height cannot silently reintroduce the scale error. */
const HIPS_ABS_Y = (RIG3.SKELETON.find(([n]) => n === 'hips') || [, , [0, 1, 0]])[2][1];
const restHips = new THREE.Vector3().setFromMatrixPosition(resolve('mixamorig:Hips').matrixWorld);
const K = HIPS_ABS_Y / restHips.y;
console.log(`hips scale K = ${HIPS_ABS_Y.toFixed(4)} / ${restHips.y.toFixed(4)} = ${K.toFixed(3)}×  `
  + `(source rest hips world y ${restHips.y.toFixed(4)}; offsets are referenced to REST, not to frame 0)`);

/* ---- RIG3 forward kinematics, for grounding + stride, on the data actually being emitted ----
 * Rotations retarget cleanly; END-EFFECTOR POSITIONS DO NOT, because a delta retarget preserves
 * joint angles and our limb proportions are not the source's — RIG3's foot is 0.180 m from ankle
 * to toe against the source's 0.29 m at the same scale, and in a toe-pointed pose that whole
 * difference shows up as height. So the emitted feet are measured here rather than assumed, and
 * the residual is printed for every clip. */
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
const _e3 = new THREE.Euler(), _qk = new THREE.Quaternion(), _vk = new THREE.Vector3();
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

const mixer = new THREE.AnimationMixer(root);
const out = {};
const report = [];

for (const clip of gltf.animations) {
  const act = mixer.clipAction(clip);
  /* `mixer.setTime(duration)` WRAPS to frame 0 under three's default LoopRepeat, so the last key
     this sampler wrote was a byte-identical copy of the first. Verified on the emitted module:
     16 of 16 clips, worst difference 0.00 deg. The irony is sharp — §211.2 added a loop-seam test
     for the hand-authored clips, and these clips passed any such check *by construction*, because
     their seam was closed by a bug rather than by the animation.
     Measured impact is smaller than the mechanism sounds: 14 of 16 clips move <= 0.05 deg, because
     their true final frame genuinely coincides with frame 0. The real one is `hang_crawl_left` at
     11.91 deg on `toeR` — the same clip and the same contact bone the sparse-key bug hit (§212.1).
     Trap worth naming: `clampWhenFinished` sets `paused = true` once a sample lands on
     t == duration, and a paused action ignores every later `setTime`. Safe here because this is a
     single ascending pass whose last sample IS t == duration; fatal if anything re-samples after. */
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = true;
  act.reset();
  act.play();
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const keys = [];
  const range = {};                                  // per-bone max quaternion angle
  const gimbal = new Set();                          // bones whose Euler blows up near gimbal
  let hipsY0 = null, hipsTravel = new THREE.Vector3();

  let srcMinToe = Infinity;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * clip.duration;
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    /* Where the SOURCE's own feet are, at our scale. Separates "the clip is airborne" from
       "the retarget lost the floor" — without it every float looks like the tool's fault. */
    for (const s of ['mixamorig:LeftToeBase', 'mixamorig:RightToeBase']) {
      srcMinToe = Math.min(srcMinToe, new THREE.Vector3().setFromMatrixPosition(resolve(s).matrixWorld).y * K);
    }

    /* world change per source joint -> our world target */
    const worldTarget = new Map();
    for (const [mx, ours] of Object.entries(MAP)) {
      if (!restWorld.has(mx)) continue;
      const nw = worldQuat(resolve(mx));
      worldTarget.set(ours, nw.multiply(restWorld.get(mx).clone().invert()));
    }
    /* world -> local, top-down so a parent is always resolved first */
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
      const d = [e.x * DEG, e.y * DEG, e.z * DEG].map((v) => +v.toFixed(1));
      /* Emit EVERY sampled bone at EVERY key. The old rule — `if (d.some(v => |v| > 0.05))` —
         dropped a bone from a key whenever it happened to sit near identity there, and
         `Clips.js`'s `trackFromKeys` *skips* absent keys rather than treating them as identity
         (`if (v === undefined) continue`). So a limb passing through neutral lost precisely the key
         at the crossing, and the track slerped straight across it. That convention is right for the
         hand-authored clips, where "a bone a key does not mention holds its previous value" is how
         a sparse pose is written; it is wrong for a dense machine sample, where an absent key means
         "I measured identity here", not "carry on". Bones that never move in a clip are dropped
         wholesale below instead, which is both correct and more compact than the old rule. */
      P[b] = d;
      /* Report the QUATERNION angle, not the largest Euler component. Euler XYZ near gimbal
         produces huge individual components for a modest rotation — `idle_side` reported a 180 deg
         hips on a rotation that is nothing of the sort — so a max-component metric cannot tell a
         real swing from a representation artefact, and would have been quoted as evidence. */
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * DEG;
      range[b] = Math.max(range[b] || 0, ang);
      /* Flag Euler components that are large while the true rotation is not: that is the artefact. */
      if (Math.max(...d.map(Math.abs)) > 100 && ang < 100) gimbal.add(b);
    }
    /* hips translation in METRES, referenced to the source's REST pose (see the K derivation) */
    const hp = new THREE.Vector3().setFromMatrixPosition(resolve('mixamorig:Hips').matrixWorld);
    if (hipsY0 === null) hipsY0 = hp.clone();
    const off = hp.clone().sub(restHips).multiplyScalar(K);
    hipsTravel.max(off.clone().set(Math.abs(off.x), Math.abs(off.y), Math.abs(off.z)));
    /* `lin`, NOT `smooth`. `EASES[1] = t²(3−2t)` has zero derivative at BOTH ends, which is the
       point of it for a hand-authored key POSE and exactly wrong for a dense machine sample: at
       20 keys/s it stops the motion dead 20 times a second. Linear between dense samples costs
       O(dt²) in position and is what every dense sampler in the industry writes. */
    keys.push({ t: +t.toFixed(3), e: 'lin', P, pos: [+off.x.toFixed(4), +off.y.toFixed(4), +off.z.toFixed(4)] });
  }
  act.stop();

  /* ---- drop bones that never move, and audit what the OLD sparse rule would have cost ----
     The audit is the point: "always emit" is only worth the bytes if dropping near-identity keys
     actually damaged the motion, and it is not obvious that it did. A bone crossing neutral
     symmetrically loses nothing — slerp between +30 and -30 passes through identity at the
     midpoint anyway — so the cost has to be measured, not assumed. For every key the old rule
     would have dropped, this slerps that bone's surviving neighbours to the dropped key's time
     and reports how far the result lands from what was actually measured there. */
  const moves = new Set();
  for (const b of ORDER) {
    let mx = 0;
    for (const k of keys) { const d = k.P[b]; if (d) mx = Math.max(mx, Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])); }
    if (mx > 0.05) moves.add(b);
  }
  const qOf = (d) => new THREE.Quaternion().setFromEuler(new THREE.Euler(d[0] / DEG, d[1] / DEG, d[2] / DEG, 'XYZ'));
  let auditWorst = 0, auditBone = '', dropped = 0;
  for (const b of moves) {
    const kept = keys.filter((k) => k.P[b].some((v) => Math.abs(v) > 0.05));   // the OLD rule
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.P[b].some((v) => Math.abs(v) > 0.05)) continue;                     // survived the old rule
      dropped++;
      /* neighbours that the old rule kept, straddling this time */
      let lo = null, hi = null;
      for (const c of kept) { if (c.t <= k.t) lo = c; else { hi = c; break; } }
      if (!lo && !hi) continue;
      const qa = qOf((lo || hi).P[b]), qb = qOf((hi || lo).P[b]);
      const f = (lo && hi && hi.t > lo.t) ? (k.t - lo.t) / (hi.t - lo.t) : 0;
      const got = qa.clone().slerp(qb, f);
      const err = 2 * Math.acos(Math.min(1, Math.abs(got.dot(qOf(k.P[b]))))) * DEG;
      if (err > auditWorst) { auditWorst = err; auditBone = b; }
    }
  }
  for (const k of keys) for (const b of ORDER) if (!moves.has(b)) delete k.P[b];
  report.sparseAudit = report.sparseAudit || [];
  report.sparseAudit.push({ name: clip.name, dropped, worst: auditWorst, bone: auditBone, bones: moves.size });

  report.gimbalAny = (report.gimbalAny || new Set());
  for (const b of gimbal) report.gimbalAny.add(b);

  /* ---- grounding, stride and footsteps, measured on the emitted keys ------------------------
   * A Mixamo clip carries NO stride, because the source is in-place — measured hips travel is
   * ~0 on every clip. `Animation._strideLength()` reads `clip.stride > 0` as "rate-match this to
   * real speed", and returns 0 when no node declares one, which freezes the stride phase and
   * stops the legs dead. So a stride has to be derived, and the only honest source for it is the
   * geometry: the distance the planted foot travels backwards under the body per cycle. Same
   * quantity `Clips.js` documents `stride` to be, arrived at by measurement instead of by eye.
   *
   * Emitted only when the clip actually plants a foot. A clip whose feet never come within
   * `plantLift` of the floor has no contact to fit, and a stride fitted to a phantom contact is
   * a number with no referent — worse than absent, because absent is visible. */
  const [tL, tR, aL, aR] = fkTrack(keys, ['toeL', 'toeR', 'footL', 'footR']);
  const CONTACT_BAND = 0.030, IK_ANKLE = 0.086, PLANT_LIFT = 0.10;
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
      if (R.length >= 3) {
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
  const loop = /idle|walk|run|hang_loose/.test(clip.name);
  /* CYCLES ONLY. `stride` is defined in Clips.js as "metres of ground travel per CYCLE", and
     `Animation._strideLength()` divides real speed by it to drive the shared stride phase. A
     one-shot has no cycle, so fitting one to it is a category error with teeth: `jump_from_ground`
     plants a foot in its crouch, fitted 2.403 m, and would then have had its playback rate driven
     by the character's ground speed — a jump that plays faster the faster you were running.
     Likewise a footstep is a footfall of a locomotion cycle; `idle_side` has two contact runs
     because a standing foot shifts, and firing footstep audio off a stationary idle is wrong. */
  const isLoco = loop && lift < PLANT_LIFT && speed > 0.2;
  const stride = isLoco ? +(speed * clip.duration).toFixed(3) : 0;
  const rec = { dur: +clip.duration.toFixed(3), loop, keys };
  if (stride > 0) rec.stride = stride;
  if (isLoco && steps.length) rec.events = steps.sort((a, b) => a.t - b.t);
  out[clip.name] = rec;
  report.ground = report.ground || [];
  report.ground.push({
    name: clip.name, minToe: Math.min(minY(tL), minY(tR)), srcMinToe, lift, stride,
    plants: lift < PLANT_LIFT, steps: (isLoco ? steps.length : 0),
    hipsY: keys.reduce((m, k) => Math.min(m, k.pos[1]), Infinity),
  });
  report.push({ name: clip.name, dur: clip.duration, keys: keys.length, range, travel: hipsTravel, gimbal: [...gimbal] });
}

console.log(`\nclips: ${report.length}`);
console.log('name                dur   keys   max|angle| on a few bones (deg)              hips travel x/y/z (m)');
for (const r of report) {
  const pick = ['hips', 'chest', 'upperArmL', 'upperLegL', 'lowerLegL', 'footL']
    .map((b) => `${b} ${(r.range[b] ?? 0).toFixed(0)}`).join('  ');
  console.log(`${r.name.padEnd(19)} ${r.dur.toFixed(2)} ${String(r.keys).padStart(4)}   ${pick.padEnd(52)} ${r.travel.x.toFixed(2)}/${r.travel.y.toFixed(2)}/${r.travel.z.toFixed(2)}`);
}
/* sanity: a humanoid walk should swing the thigh tens of degrees, not hundreds and not ~0 */
const walk = report.find((r) => r.name === 'walk_forward');
if (walk) {
  const th = walk.range.upperLegL ?? 0;
  console.log(`\nsanity — walk_forward thigh rotation ${th.toFixed(1)}deg ` +
    (th > 12 && th < 110 ? '(plausible for a stride measured from bind)' : '(!! implausible)'));
  const allG = new Set(report.flatMap((r) => r.gimbal));
  console.log(`gimbal-artefact bones (Euler >100deg while true rotation <100deg): ` +
    (allG.size ? [...allG].join(', ') : 'none'));
}
/* What the old near-identity drop rule cost, per clip. Reported rather than asserted: if these
   numbers were all ~0 the rule was harmless and this change is only tidiness. */
if (report.sparseAudit) {
  const rows = report.sparseAudit.slice().sort((a, b) => b.worst - a.worst);
  console.log('\nsparse-key audit — error the OLD "drop near-identity keys" rule introduced:');
  console.log('clip                bones  dropped keys   worst deviation');
  for (const r of rows) {
    console.log(`${r.name.padEnd(19)} ${String(r.bones).padStart(3)}   ${String(r.dropped).padStart(8)}       ${r.worst.toFixed(2)}deg  ${r.bone}`);
  }
  const worst = rows[0];
  console.log(`\nworst across all clips: ${worst.worst.toFixed(2)}deg on ${worst.bone} in ${worst.name}`);
}

/* Grounding: the number that decides whether any of this is usable at runtime. RIG3's bind toe
   sits at y = 0.0205 and its bind ankle at 0.0645; `Rig.footIK` stops calling a foot planted once
   it is 0.10 m above `rootY + ikAnkle`. Printed per clip, unrounded, whatever it says. */
if (report.ground) {
  console.log('\ngrounding — where the retargeted feet actually land on RIG3 (bind toe y = 0.0205):');
  console.log('clip                min toe y   SOURCE min toe   ankle lift   plants?   derived stride   footsteps   min hips offset');
  for (const g of report.ground) {
    console.log(`${g.name.padEnd(19)} ${g.minToe.toFixed(4).padStart(9)}   ${g.srcMinToe.toFixed(4).padStart(14)}   ${g.lift.toFixed(3).padStart(10)}   ${(g.plants ? 'yes' : ' NO').padStart(7)}   ${(g.stride ? g.stride.toFixed(3) : '—').padStart(14)}   ${String(g.steps).padStart(9)}   ${g.hipsY.toFixed(3).padStart(15)}`);
  }
  const n = report.ground.filter((g) => !g.plants).length;
  console.log(`\n${n}/${report.ground.length} clips never bring a foot within ${0.10} m of the floor — those cannot plant at runtime`);
  console.log('and therefore get no stride: a rotation-only retarget preserves joint ANGLES, not end-effector');
  console.log('POSITIONS, and RIG3\'s foot is 0.180 m ankle-to-toe against the source\'s 0.29 m at the same scale.');
}

console.log('\nBONES WITH NO SOURCE, which stay procedural: tailA..tailD, and the cane.');

const wi = process.argv.indexOf('--write');
if (wi !== -1 && process.argv[wi + 1]) {
  const path = process.argv[wi + 1];
  writeFileSync(path, `/* GENERATED by tools/mixamo2clips.mjs — do not hand-edit.\n`
    + ` * Retargeted from public/assets/sly-anim/sly-anims.glb (provenance in that directory).\n`
    + ` * Tail and cane are absent by construction and stay procedural. */\n`
    + `export const MIXAMO_CLIPS = ${JSON.stringify(out)};\n`);
  console.log(`\nwrote ${path}`);
} else {
  console.log('\n(report only — pass --write <path> to emit)');
}

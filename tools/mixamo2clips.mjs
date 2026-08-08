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

const mixer = new THREE.AnimationMixer(root);
const out = {};
const report = [];

for (const clip of gltf.animations) {
  const act = mixer.clipAction(clip);
  act.play();
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const keys = [];
  const range = {};                                  // per-bone max quaternion angle
  const gimbal = new Set();                          // bones whose Euler blows up near gimbal
  let hipsY0 = null, hipsTravel = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * clip.duration;
    mixer.setTime(t);
    root.updateMatrixWorld(true);

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
    /* hips translation, in metres, relative to the clip's first frame */
    const hp = new THREE.Vector3().setFromMatrixPosition(resolve('mixamorig:Hips').matrixWorld);
    if (hipsY0 === null) hipsY0 = hp.clone();
    const off = hp.clone().sub(hipsY0);
    hipsTravel.max(off.clone().set(Math.abs(off.x), Math.abs(off.y), Math.abs(off.z)));
    keys.push({ t: +t.toFixed(3), e: 'smooth', P, pos: [+off.x.toFixed(3), +off.y.toFixed(3), +off.z.toFixed(3)] });
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
  out[clip.name] = { dur: +clip.duration.toFixed(3), loop: /idle|walk|run|hang_loose/.test(clip.name), keys };
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

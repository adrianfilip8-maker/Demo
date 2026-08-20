/**
 * dlaxes.mjs — measure the DL asset's bind axes against RIG3, offline, at the MECHANISM.
 *
 * Written for the two rig faults the user reported on hardware (§522 defect 3): "arms feel
 * switched at times" and "the head is permanently looking upward". Both suspects live in
 * `SlyModelDLRig.js`'s carry from the FBX bind pose into ours, and every quantity that carry
 * uses is derivable from the FBX file plus RIG3.SKELETON — no frame needs to be rendered to
 * know what the carry DOES (§439: point the instrument at the mechanism, not the outcome).
 *
 * What it answers, each measured the same way the shipped loader computes it:
 *   1. CHIRALITY — is the FBX's `LF_`/`RT_` naming the character's own left/right, or the
 *      viewer's? Decided by where the eyes and muzzle sit (facing) against the signed x of
 *      the named wrists/ankles. BONE_MAP assumes LF = character's left; if the asset faces
 *      +Z and LF_wrist.x > 0 that assumption holds (+X is the character's left when facing
 *      +Z, same convention as RIG3).
 *   2. THE STAFF HAND — which named wrist is nearer the staff-weighted triangles, i.e. which
 *      hand the artist actually posed holding the cane. `BONE_MAP` hard-codes staff→handR.
 *   3. THE SKULL PITCH — the carry orients all head geometry by rot[neck] =
 *      setFromUnitVectors(srcNeck→Head, ourNeck→Head) (structChild of `head` is none, so
 *      `head` inherits its parent's q). If the asset's neck axis leans and ours is vertical,
 *      that difference is applied to the skull as a permanent pitch, in every state. This
 *      probe computes the exact quaternion the loader builds and applies it to the asset's
 *      own eye-line, reporting the pitch the shipped skull carries relative to the asset's
 *      authored facing.
 *
 * Run: node tools/dlaxes.mjs
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FBX = path.join(ROOT, 'src/assets/sly-dl/sly.fbx');

/* RIG3.SKELETON without importing SlyModel3.js (it builds THREE objects at module scope that
   want an engine; the five numbers needed here are stable and asserted against the source). */
const src3 = readFileSync(path.join(ROOT, 'src/player/SlyModel3.js'), 'utf8');
const num = (re, name) => {
  const m = src3.match(re);
  if (!m) throw new Error(`SlyModel3.js no longer matches ${name} — re-derive`);
  return Number(m[1]);
};
const height = num(/height:\s*([\d.]+)/, 'height');
const headFraction = num(/headFraction:\s*([\d.]+)/, 'headFraction');
const legFraction = num(/legFraction:\s*([\d.]+)/, 'legFraction');
const H = height, HEAD_H = H * headFraction, HIP_Y = H * legFraction;
const NECK_Y = H - HEAD_H, HEAD_Y = NECK_Y + HEAD_H * 0.12;
const ourNeck = new THREE.Vector3(0, NECK_Y - 0.02, 0.010);
const ourHead = new THREE.Vector3(0, HEAD_Y, 0.015);

const loader = new FBXLoader();
const buf = readFileSync(FBX);
const fbx = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.dirname(FBX) + '/');
fbx.updateMatrixWorld(true);

const skinned = [];
fbx.traverse((o) => { if (o.isSkinnedMesh && o.geometry?.attributes?.skinWeight) skinned.push(o); });
const skel = skinned[0].skeleton;
const idx = new Map(skel.bones.map((b, i) => [b.name, i]));
const bind = (nm) => {
  if (!idx.has(nm)) return null;
  const m = new THREE.Matrix4().copy(skel.boneInverses[idx.get(nm)]).invert();
  return new THREE.Vector3().setFromMatrixPosition(m);
};

const P = {};
for (const nm of ['a_body', 'pelvis', 'base_neck', 'base_head', 'LF_wrist', 'RT_wrist',
  'LF_ankle', 'RT_ankle', 'LF_shoulder', 'RT_shoulder', 'staff', 'LF_thumb_base', 'RT_thumb_base']) {
  P[nm] = bind(nm);
}

/* Facing + eye line, from geometry in the same shared space the loader bakes (matrixWorld). */
const staffIdx = skel.bones.findIndex((b) => b.name === 'staff');
let eyePts = [], muzzleZmax = -Infinity, muzzleZmin = Infinity, headPts = 0;
const headTop = { y: -Infinity }, staffC = new THREE.Vector3();
let staffN = 0;
const v = new THREE.Vector3();
for (const sm of skinned) {
  const part = /eyeball/i.test(sm.name) ? 'eyeball' : /head/i.test(sm.name) ? 'head' : /tail/i.test(sm.name) ? 'tail' : 'body';
  const pos = sm.geometry.attributes.position;
  const si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(sm.matrixWorld);
    if (part === 'eyeball') eyePts.push(v.clone());
    if (part === 'head') {
      headPts++;
      if (v.z > muzzleZmax) muzzleZmax = v.z;
      if (v.z < muzzleZmin) muzzleZmin = v.z;
      if (v.y > headTop.y) headTop.y = v.y;
    }
    if (part === 'body' && staffIdx >= 0 && si && sw) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.array[i * 4 + k] === staffIdx) w += sw.array[i * 4 + k];
      if (w > 0.5) { staffC.add(v); staffN++; }
    }
  }
}
if (staffN) staffC.divideScalar(staffN);
const eyeC = eyePts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, eyePts.length));
/* Two eyes -> split by x to confirm the pair straddles the centreline. */
const eyeL = eyePts.filter((p) => p.x > eyeC.x), eyeR = eyePts.filter((p) => p.x <= eyeC.x);
const cent = (a) => a.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, a.length));
const eL = cent(eyeL), eR = cent(eyeR);

const f2 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3);
const vec = (p) => (p ? `[${f2(p.x)} ${f2(p.y)} ${f2(p.z)}]` : 'ABSENT');

console.log('=== FBX bind positions (asset units, shared world space) ===');
for (const [k, p] of Object.entries(P)) console.log(`  ${k.padEnd(14)} ${vec(p)}`);
console.log(`  eye centroid   ${vec(eyeC)}  (n=${eyePts.length}; halves x ${f2(eL.x)} / ${f2(eR.x)})`);
console.log(`  head part z    [${f2(muzzleZmin)} .. ${f2(muzzleZmax)}]  (${headPts} verts)`);
console.log(`  staff centroid ${vec(staffN ? staffC : null)}  (${staffN} verts)`);

/* --- 1. facing and chirality --- */
const headP = P.base_head, neckP = P.base_neck;
const eyeFwd = eyeC.clone().sub(headP);
console.log('\n=== 1. facing / chirality ===');
console.log(`  eyes sit at z ${f2(eyeFwd.z)} relative to base_head -> the asset faces ${eyeFwd.z > 0 ? '+Z' : '-Z'}`);
const facing = Math.sign(eyeFwd.z) || 1;
/* If facing +Z, character-left is +X (RIG3's convention). If facing -Z, character-left is -X. */
const leftSign = facing;
const lfIsLeft = Math.sign(P.LF_wrist.x) === leftSign && Math.sign(P.LF_ankle.x) === leftSign;
console.log(`  character-left is x ${leftSign > 0 ? '+' : '-'} · LF_wrist.x ${f2(P.LF_wrist.x)} · RT_wrist.x ${f2(P.RT_wrist.x)}`);
console.log(`  => LF_* names the character's ${lfIsLeft ? 'LEFT — BONE_MAP chirality CORRECT' : 'RIGHT — BONE_MAP is CROSSED'}`);

/* --- 2. the staff hand --- */
if (staffN) {
  const dL = P.LF_wrist.distanceTo(staffC), dR = P.RT_wrist.distanceTo(staffC);
  const side = dL < dR ? 'LF' : 'RT';
  const charSide = (side === 'LF') === lfIsLeft ? 'LEFT' : 'RIGHT';
  console.log('\n=== 2. staff hand ===');
  console.log(`  staff centroid to LF_wrist ${dL.toFixed(1)} · to RT_wrist ${dR.toFixed(1)} -> ${side}_wrist (character's ${charSide})`);
  console.log(`  BONE_MAP sends staff -> handR (character's RIGHT): ${charSide === 'RIGHT' ? 'consistent' : 'MISMATCH'}`);
}

/* --- 3. the skull pitch the carry bakes in --- */
console.log('\n=== 3. skull carry (rot[neck], inherited by head) ===');
const dS = headP.clone().sub(neckP);
const dO = ourHead.clone().sub(ourNeck);
const pitchOf = (d) => Math.atan2(d.z, d.y) * 180 / Math.PI; // lean of the axis off vertical, + = forward (toward +Z)
console.log(`  asset neck->head axis ${vec(dS.clone().normalize())}  lean ${pitchOf(dS).toFixed(1)} deg off vertical`);
console.log(`  our   neck->head axis ${vec(dO.clone().normalize())}  lean ${pitchOf(dO).toFixed(1)} deg off vertical`);
const q = new THREE.Quaternion().setFromUnitVectors(dS.clone().normalize(), dO.clone().normalize());
const eu = new THREE.Euler().setFromQuaternion(q, 'XYZ');
const deg = (r) => (r * 180 / Math.PI);
console.log(`  carry quaternion as Euler XYZ deg: [${deg(eu.x).toFixed(1)}, ${deg(eu.y).toFixed(1)}, ${deg(eu.z).toFixed(1)}]`);
/* Apply the carry to the asset's own eye-line and report where the skull ends up looking. */
const eyeDir = eyeFwd.clone().normalize();
const eyeAfter = eyeDir.clone().applyQuaternion(q);
const elev = (d) => Math.asin(THREE.MathUtils.clamp(d.y / d.length(), -1, 1)) * 180 / Math.PI;
console.log(`  asset eye-line elevation: authored ${elev(eyeDir).toFixed(1)} deg -> after carry ${elev(eyeAfter).toFixed(1)} deg`);
console.log('  (positive elevation = the shipped skull looks UP by that much before any clip key)');

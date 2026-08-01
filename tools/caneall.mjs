/**
 * Cane tip/hook height across EVERY clip, for a given shaft drop.
 *
 * Lengthening the shaft to plant the idle is a global change: the same geometry is carried by
 * all 52 clips. This prints, per clip at its hold pose, the cane tip's world y and how far the
 * tip is below the ground plane, so "planting the idle" can be checked against "the tip now
 * spears the floor while running".
 *
 *   node tools/caneall.mjs [dropOverride]
 *
 * Ground: RIG_TUNE.ikAnkle = 0.086 is the bind ankle height above the sole plane, and foot IK
 * drives the ankle to groundY + 0.086, so world y = 0 is the floor for a planted foot.
 *
 * **What it was for.** The idle cane floated ~19 cm and no amount of re-aiming fixed it: a full
 * 4x3x3 sweep of `CANE.plant` left tip y invariant at 0.20 while x and z both moved, because
 * the shaft precesses about a cone whose apex is the grip — tip height is set by grip height
 * and shaft length, and the aim has no lever on it. The fix was an explicit `dropBelowGrip`
 * replacing an opaque `length * 0.455`; this tool is what made it safe to ship, by checking the
 * new constant against all 52 clips instead of the one being looked at. It found `ko` already
 * through the floor and needing a re-aim, which the idle-only view would have missed.
 *
 * **What this cannot tell you.** Geometry against a flat y=0 plane. It does not know about real
 * ground height, stairs or rooftops, so on any clip staged off the flat it is meaningless. It
 * reads the hold pose only, so a mid-clip swing that spears the floor is invisible to it — the
 * `idle_confident` breath keys at t=0.9/1.9 that swing a planted cane over his shoulder do not
 * appear here at all. And a tip at y=0 is not the same as a tip that LOOKS planted: it says
 * nothing about whether the contact reads in the render.
 */
import * as THREE from 'three';
const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };

const { CANE_TUNE } = await import('../src/player/Cane.js');
const drop = process.argv[2] !== undefined ? +process.argv[2] : null;
if (drop !== null) CANE_TUNE.dropBelowGrip = drop;

const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, REQUIRED, sampleInto, sampleCane } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const sly = new SlyModel(engine); await sly.init();
const bq = sly._canePivot.quaternion.clone();
const pb = new PoseBuffer(sly.boneNames);
const d = new THREE.Quaternion();

console.log(`shaft drop below grip = ${sly.cane.tipPoint.y.toFixed(4)} m (cane local butt y)\n`);
console.log('clip                    tip.y   hook.y   grip.y   below-ground');
const bad = [];
for (const name of REQUIRED) {
  const clip = CLIPS[name];
  if (!clip) { console.log(`${name.padEnd(20)}  MISSING`); bad.push(name + ' MISSING'); continue; }
  pb.clear();
  sampleInto(clip, clip.hold, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  d.identity();
  sampleCane(clip, clip.hold, d);
  sly._canePivot.quaternion.copy(d).multiply(bq);
  sly.root.updateMatrixWorld(true);
  sly.cane.mesh.updateMatrixWorld(true);
  const M = sly.cane.mesh.matrixWorld;
  const tip = sly.cane.tipPoint.clone().applyMatrix4(M);
  const hook = sly.cane.hookPoint.clone().applyMatrix4(M);
  const grip = new THREE.Vector3().applyMatrix4(M);
  const under = tip.y < -0.02;
  if (under) bad.push(`${name} tip y ${tip.y.toFixed(3)}`);
  console.log(`${name.padEnd(20)} ${tip.y.toFixed(3).padStart(7)} ${hook.y.toFixed(3).padStart(8)} ${grip.y.toFixed(3).padStart(8)}   ${under ? 'UNDER ' + tip.y.toFixed(3) : ''}`);
}
console.log(`\n${bad.length} clips with the tip through the floor:`);
for (const b of bad) console.log('  ' + b);

/** Bone world positions for a frozen clip — the numbers behind a pose. node poseprobe.mjs <clip> */
import * as THREE from 'three';
const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto, sampleCane } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const sly = new SlyModel(engine); await sly.init();
const name = process.argv[2] || 'idle_confident';
const clip = CLIPS[name];
const pb = new PoseBuffer(sly.boneNames).clear();
sampleInto(clip, process.argv[3] !== undefined ? +process.argv[3] : clip.hold, pb, 1);
for (const n of sly.boneNames) {
  const b = sly.bones[n]; if (!b) continue;
  if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
  if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
}
const base = sly.bp('hips');
sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
sly.root.updateMatrixWorld(true);
const p = new THREE.Vector3();
const at = (n) => { p.setFromMatrixPosition(sly.bones[n].matrixWorld); return p.clone(); };
console.log(`clip ${name} @ ${clip.hold}`);
for (const n of (process.argv[4] ? process.argv[4].split(',') : ['hips', 'chest', 'head', 'handL', 'handR', 'footL', 'toeL', 'footR', 'toeR', 'tailD'])) {
  const v = at(n);
  console.log('  ' + n.padEnd(10), v.x.toFixed(3).padStart(7), v.y.toFixed(3).padStart(7), v.z.toFixed(3).padStart(7));
}
const fl = at('footL'), fr = at('footR');
console.log(`  stance  dx ${(fl.x - fr.x).toFixed(3)}  dz ${(fl.z - fr.z).toFixed(3)}   lowest foot y ${Math.min(fl.y, fr.y).toFixed(3)}`);
const h = at('hips'), c = at('chest'), hd = at('head');
console.log(`  S-curve hips x ${h.x.toFixed(3)}  chest x ${c.x.toFixed(3)}  head x ${hd.x.toFixed(3)}`);
if (sly._canePivot) {
  const d = new THREE.Quaternion();
  const bq = sly._canePivot.quaternion.clone();
  if (sampleCane(clip, clip.hold, d)) sly._canePivot.quaternion.copy(d).multiply(bq);
  sly.root.updateMatrixWorld(true);
  sly.cane.mesh.updateMatrixWorld(true);
  const tip = sly.cane.tipPoint.clone().applyMatrix4(sly.cane.mesh.matrixWorld);
  const hook = sly.cane.hookPoint.clone().applyMatrix4(sly.cane.mesh.matrixWorld);
  console.log(`  cane    tip ${tip.x.toFixed(2)},${tip.y.toFixed(2)},${tip.z.toFixed(2)}  hook ${hook.x.toFixed(2)},${hook.y.toFixed(2)},${hook.z.toFixed(2)}`);
}

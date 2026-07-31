/**
 * Aim the cane by measurement instead of by guess.
 *
 * For a given clip pose, sweep the cane's hand-space Euler delta and score each aim on what
 * the §7.3 silhouette test actually cares about: is the crook clear of the body, is it high
 * enough to be against open background, and is the C presented broadside to the camera
 * (its arc lies in the cane's local YZ plane, so the plane normal is the cane's local X).
 *
 *   node canesweep.mjs <clip> <viewAzimuthDeg> <viewElevDeg> [legOverrides]
 */
import * as THREE from 'three';
const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const sly = new SlyModel(engine); await sly.init();
const clipName = process.argv[2] || 'idle_confident';
const azim = (+(process.argv[3] ?? 13)) * Math.PI / 180;
const elev = (+(process.argv[4] ?? 7)) * Math.PI / 180;
const clip = CLIPS[clipName];
const pb = new PoseBuffer(sly.boneNames).clear();
sampleInto(clip, clip.hold, pb, 1);
for (const n of sly.boneNames) {
  const b = sly.bones[n]; if (!b) continue;
  if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
}
const base = sly.bp('hips');
sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
sly.root.updateMatrixWorld(true);

const view = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));
const bq = sly._canePivot.quaternion.clone();
const head = new THREE.Vector3().setFromMatrixPosition(sly.bones.head.matrixWorld);
const chest = new THREE.Vector3().setFromMatrixPosition(sly.bones.chest.matrixWorld);

const D2R = Math.PI / 180;
const e = new THREE.Euler(), q = new THREE.Quaternion();
const rows = [];
for (let x = -180; x <= 180; x += 8) {
  for (let y = -60; y <= 60; y += 15) {
    for (let z = -30; z <= 30; z += 15) {
      e.set(x * D2R, y * D2R, z * D2R, 'XYZ');
      q.setFromEuler(e);
      sly._canePivot.quaternion.copy(q).multiply(bq);
      sly.root.updateMatrixWorld(true);
      sly.cane.mesh.updateMatrixWorld(true);
      const M = sly.cane.mesh.matrixWorld;
      const hook = sly.cane.hookPoint.clone().applyMatrix4(M);
      const tip = sly.cane.tipPoint.clone().applyMatrix4(M);
      // plane of the C = cane local X axis
      const nrm = new THREE.Vector3(1, 0, 0).transformDirection(M).normalize();
      const broadside = Math.abs(nrm.dot(view));                   // 1 = C faces the camera
      // screen-space separation of the crook from the head and the chest
      const proj = (p) => {
        const d = p.clone().sub(chest);
        const sx = d.x * Math.cos(azim) - d.z * Math.sin(azim);
        return { sx, sy: d.y };
      };
      const ph = proj(hook), pd = proj(head);
      const clearHead = Math.hypot(ph.sx - pd.sx, ph.sy - pd.sy);
      const clearBody = Math.abs(ph.sx);
      // the shaft must not lie along the view axis or it foreshortens into a stub
      const shaft = hook.clone().sub(tip).normalize();
      const across = 1 - Math.abs(shaft.dot(view));
      const score = broadside * 1.0 + across * 1.2
        + Math.min(clearHead, 0.45) * 1.6 + Math.min(clearBody, 0.40) * 1.4
        + Math.min(Math.max(0, hook.y - 1.45), 0.5) * 1.2;
      rows.push({ x, y, z, score, hook, tip, broadside, across, clearHead, clearBody });
    }
  }
}
rows.sort((a, b) => b.score - a.score);
console.log(`clip ${clipName}  view azim ${(azim / D2R).toFixed(0)}° elev ${(elev / D2R).toFixed(0)}°`);
for (const r of rows.slice(0, 12)) {
  console.log(`  [${String(r.x).padStart(4)},${String(r.y).padStart(4)},${String(r.z).padStart(4)}]  score ${r.score.toFixed(3)}` +
    `  broad ${r.broadside.toFixed(2)} across ${r.across.toFixed(2)} headGap ${r.clearHead.toFixed(2)} bodyGap ${r.clearBody.toFixed(2)}` +
    `  hook ${r.hook.x.toFixed(2)},${r.hook.y.toFixed(2)},${r.hook.z.toFixed(2)}`);
}

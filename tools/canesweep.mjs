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
    /* z was -30..+30 until KNOWN_ISSUES §57. That domain did not contain the aim that was
       ACTUALLY SHIPPED in perch_idle (z = 130), so this tool could never evaluate the value it
       existed to choose — in either direction. The tell was in its own output the whole time:
       the top twelve all sat on the z = +30 boundary. A search whose winners pile against an
       edge is reporting that its optimum is outside the box. Full rotation range now. */
    for (let z = -180; z <= 180; z += 15) {
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

/* The shipped aim, scored and RANKED against the sweep it is being compared to.
   Without this the tool only ever compares candidates to each other, so it can report a
   confident winner while saying nothing about whether the thing already in the file was better.
   perch_idle's shipped aim ranked 5927 of 10351 and nobody knew, because the number was never
   printed. `clip` is read from Clips.js so this cannot drift out of date the way a hardcoded
   baseline would. */
const shippedKey = CLIPS[clipName]?.keys?.find((k) => k.cane)?.cane ?? null;
if (shippedKey) {
  const [sx, sy, sz] = shippedKey;
  // Nearest grid row to the shipped aim; exact if it lands on the grid, labelled if it does not.
  let best = null, bestD = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.x - sx) + Math.abs(r.y - sy) + Math.abs(r.z - sz);
    if (d < bestD) { bestD = d; best = r; }
  }
  const rank = rows.indexOf(best) + 1;
  console.log(`SHIPPED  [${sx},${sy},${sz}]${bestD ? `  (nearest grid [${best.x},${best.y},${best.z}], Δ${bestD}°)` : ''}` +
    `  score ${best.score.toFixed(3)}  RANK ${rank} of ${rows.length}` +
    `  broad ${best.broadside.toFixed(2)} across ${best.across.toFixed(2)} bodyGap ${best.clearBody.toFixed(2)}`);
}

console.log(`clip ${clipName}  view azim ${(azim / D2R).toFixed(0)}° elev ${(elev / D2R).toFixed(0)}°`);
for (const r of rows.slice(0, 12)) {
  console.log(`  [${String(r.x).padStart(4)},${String(r.y).padStart(4)},${String(r.z).padStart(4)}]  score ${r.score.toFixed(3)}` +
    `  broad ${r.broadside.toFixed(2)} across ${r.across.toFixed(2)} headGap ${r.clearHead.toFixed(2)} bodyGap ${r.clearBody.toFixed(2)}` +
    `  hook ${r.hook.x.toFixed(2)},${r.hook.y.toFixed(2)},${r.hook.z.toFixed(2)}`);
}

/* SCOPE, stated because §57.2 cost a wrong selection: this score models crook clearance against
   `head` and `chest` ONLY. It does not know about the tail, which in perch_idle is the largest
   mass in frame. Two aims tied at 3.455 / 3.475 there, and the loser rendered as a ring fused
   into the tail. SHORTLIST WITH THIS SCORE, NEVER SELECT WITH IT — take the top rows to a
   silhouette render and choose there. A tie between candidates that look nothing alike means
   this score is missing a term, not splitting hairs. */

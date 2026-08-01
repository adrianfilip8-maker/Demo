/**
 * How far does the boot geometry go through the floor, in every clip?
 *
 * IDLE_A had 82 vertices up to 7.4 cm under the ground plane while its foot *bones* sat safely
 * above it, so nothing in bone space could see the defect and `footIK` cannot fix it (it drives
 * the ankle and preserves the clip's lift; it never looks at the boot). `charvis` reports a
 * feet-band occlusion of 33-56% in temple / interior / night / combat, attributed to "surface
 * contact" — some of that is a boot genuinely inside the paving.
 *
 * CPU-skins the foot vertices for each clip at its hold pose and reports the lowest one.
 * Airborne clips are expected to be negative-free only because their root is lifted at runtime,
 * so the grounded column is the one to read.
 *
 *   node tools/footall.mjs
 *
 * **What it was for.** It is the before/after that made the foot-levelling change shippable
 * without a GPU frame. `footIK`'s levelling pass was gated on `nrm.y < 0.9995`, so it ran only
 * on slopes and was skipped on flat ground where it is exactly what is needed; the blast radius
 * of removing that gate is every grounded clip, which is too much to change on a guess. Run
 * across all 52 clips it bounds the risk in vertex space: worst-case penetration went
 * 18.8 cm -> 7.3 cm, 39 clips improved, 13 unchanged, none regressed. It also caught the first
 * attempt at the fix — flattening the sole onto the plane lifted `cane_combo_3`, the `combat`
 * pose, 8.5 cm clear of the floor, because flattening double-counts against the ankle target's
 * `clipLift` term. A foot RISING is the regression signature to watch for here.
 *
 * **What this cannot tell you.** Flat ground at y=0 only, so it cannot see a clip staged on
 * stairs or a rooftop. Hold pose only — a mid-clip frame that plants a foot through the floor
 * is invisible to it, and if a clip's `hold` is wrong (KNOWN_ISSUES §9) it faithfully measures
 * the wrong pose. It runs ONE `footIK` call, but `hipDrop` is a filtered follower, so the
 * numbers are the first frame of a settle, not its steady state. And it is a penetration
 * measure, not a visibility one: a boot 7 cm into the paving may be entirely hidden behind a
 * step in a given shot, and a boot at exactly 0 can still read as floating if the shadow under
 * it is wrong. Use `charvis.mjs` for what the camera can actually see.
 */
import * as THREE from 'three';
const warnings = [];
/* Flat ground at y=0, so the real footIK runs instead of being skipped. Without this the
   sweep is meaningless: footIK drives the ankle to groundY + ikAnkle and RAISES any foot whose
   authored ankle sits below bind, so a naive skin-and-measure reports every crouch, land and
   hang as "boot through the floor" when the runtime would have lifted it. */
const collision = { groundCheck: () => ({ hit: true, y: 0, normal: new THREE.Vector3(0, 1, 0) }) };
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: (k) => (k === 'collision' ? collision : null), has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, REQUIRED, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer, Rig } = await import('../src/player/Rig.js');
const { SHOTS } = await import('../src/core/Shots.js');

const sly = new SlyModel(engine); await sly.init();
const mesh = sly.root.getObjectByName('sly_body');
const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
const sk = mesh.skeleton;
const idxOf = (n) => sk.bones.findIndex((b) => b.name === n);
const FOOT = new Set(['footL', 'toeL', 'footR', 'toeR'].map(idxOf).filter((i) => i >= 0));
const verts = [];
for (let i = 0; i < pos.count; i++) {
  for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0 && FOOT.has(si.getComponent(i, k))) { verts.push(i); break; }
}
const bindV = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3(), m = new THREE.Matrix4();
const pb = new PoseBuffer(sly.boneNames);

/* Which clip does each canonical shot freeze on? Those are the ones that reach a frame. */
const usedBy = {};
for (const [nm, s] of Object.entries(SHOTS)) if (s.player?.pose) (usedBy[s.player.pose] ||= []).push(nm);

function lowest(name) {
  const clip = CLIPS[name];
  pb.clear();
  sampleInto(clip, clip.hold ?? 0, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  /* Settle the IK: hipDrop is a filtered follower, so one call is not the steady state. */
  if (rig?.ok) { rig.footIK(1 / 30, 1, 0); sly.root.updateMatrixWorld(true); }  /* ONE call: the runtime resamples the clip every frame, so repeated calls on a frozen pose accumulate and are not the game path */
  mesh.updateMatrixWorld(true);
  let lo = 1e9, n = 0;
  for (const i of verts) {
    bindV.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
    acc.set(0, 0, 0); let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w === 0) continue;
      const bi = si.getComponent(i, k); const bone = sk.bones[bi]; if (!bone) continue;
      m.multiplyMatrices(bone.matrixWorld, sk.boneInverses[bi]);
      acc.add(t.copy(bindV).applyMatrix4(m).multiplyScalar(w)); wsum += w;
    }
    if (wsum === 0) continue;
    acc.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
    if (acc.y < lo) lo = acc.y;
    if (acc.y < -0.005) n++;
  }
  /* ankle heights say whether the clip means to be on the ground at all */
  const aL = new THREE.Vector3().setFromMatrixPosition(sly.bones.footL.matrixWorld).y;
  const aR = new THREE.Vector3().setFromMatrixPosition(sly.bones.footR.matrixWorld).y;
  return { lo, n, ankle: Math.min(aL, aR) };
}

const rig = new Rig(engine, sly);
console.log(`rig ok=${rig.ok} · footIK driven against flat ground y=0\n`);
const rows = [];
for (const name of REQUIRED) { if (CLIPS[name]) rows.push({ name, ...lowest(name) }); }
rows.sort((a, b) => a.lo - b.lo);
console.log('clip                 lowest-boot-y  verts<-5mm  lowest-ankle  shots');
for (const r of rows) {
  const flag = r.lo < -0.02 ? (r.ankle < 0.30 ? '  <-- GROUNDED, BOOT IN FLOOR' : '  (airborne pose)') : '';
  console.log(`${r.name.padEnd(20)} ${r.lo.toFixed(3).padStart(8)}   ${String(r.n).padStart(6)}      ${r.ankle.toFixed(3).padStart(6)}   ${(usedBy[r.name] || []).join(',').padEnd(14)}${flag}`);
}
const bad = rows.filter((r) => r.lo < -0.02 && r.ankle < 0.30);
console.log(`\n${bad.length} grounded clips with the boot through the floor: ${bad.map((b) => `${b.name} ${b.lo.toFixed(3)}`).join(', ') || 'none'}`);

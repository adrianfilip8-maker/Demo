/**
 * Are the eyes actually FACING the camera in each shot?
 *
 * eyemeasure.mjs / eyeprobe.mjs project the sclera centre and sample a box of pixels there.
 * Neither tests visibility — exactly the caveat charview.mjs's own header records ("in frame
 * means not outside the frustum, NOT visible"). An eye on the far side of the head projects to
 * a perfectly good pixel coordinate, and the box then measures the back of his head.
 *
 * This reports, per shot: the eye's screen position, its projected size, and the sign of
 * dot(outward, toCamera) — negative means the lens is pointing away and nothing sampled at
 * that pixel is the eye.
 *
 *   node tools/eyefacing.mjs
 *
 * **The scheduling fact it produced.** Eye work only pays at `sly-closeup`, where the two eyes
 * are 45.6 and 36.9 px across. Everywhere else the far eye is 3.4-4.2 px or is facing away
 * outright, so a change to eye shading or emissive cannot show up there however good it is.
 * In `night` his-left eye is at dot = -0.387 — back-face culled — while a 24x25 px sampling box
 * sat over it happily measuring the side of his head. A "night eye regression" was raised and
 * then retracted on that basis: there were no night eyes on screen to regress.
 *
 * **What this cannot tell you.** Facing only. A forward-facing eye can still be behind a wall,
 * behind his own cane, or in shadow — `charvis.mjs` does architecture occlusion and
 * `occlude.mjs` does self-occlusion. It also uses the shot's frozen `hold` pose, so if a clip's
 * hold is wrong (see KNOWN_ISSUES §9) this faithfully reports the wrong pose's eyes. It says
 * nothing about pixel VALUES — it is a geometry check, not a measurement of what was rendered.
 */
import * as THREE from 'three';
const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel, TUNE } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SHOTS } = await import('../src/core/Shots.js');

const W = 1280, H = 720;
const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);

console.log(`eye visibility per shot at ${W}x${H}\n`);
console.log('shot           eye    screen x,y      dot(out,toCam)  lens px   verdict');
for (const name of Object.keys(SHOTS)) {
  const shot = SHOTS[name];
  const clip = CLIPS[shot.player?.pose]; if (!clip) continue;
  pb.clear();
  sampleInto(clip, clip.hold ?? 0, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const hb = sly.bp('hips');
  sly.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);
  sly.root.position.fromArray(shot.player.pos);
  sly.root.rotation.set(0, shot.player.yaw ?? 0, 0);
  sly.root.updateMatrixWorld(true);

  const cam = new THREE.PerspectiveCamera(shot.fov ?? 45, W / H, 0.1, 500);
  cam.position.fromArray(shot.pos);
  cam.lookAt(new THREE.Vector3().fromArray(shot.target));
  if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

  const headBone = sly.bones.head;
  const inv = sly.skeleton.boneInverses[sly.boneNames.indexOf('head')];
  const skinM = new THREE.Matrix4().multiplyMatrices(headBone.matrixWorld, inv);
  const r = sly.headRadii;

  for (const side of [1, -1]) {
    const th = side * 0.455, ph = 0.165;
    const c = sly.headSurf(th, ph, 0.92).applyMatrix4(skinM);
    /* Same construction as _buildEye: ellipsoid gradient, then lerped 0.30 toward straight
       ahead. Direction, so only the rotation part of the skinning matrix applies. */
    const nrm = new THREE.Vector3(
      Math.cos(ph) * Math.sin(th) / r.x, Math.sin(ph) / r.y, Math.cos(ph) * Math.cos(th) / r.z,
    ).normalize();
    const outward = nrm.lerp(new THREE.Vector3(0, 0, 1), 0.30).normalize()
      .transformDirection(skinM).normalize();
    const toCam = cam.position.clone().sub(c).normalize();
    const d = outward.dot(toCam);

    const p = c.clone().project(cam);
    const x = Math.round((p.x * 0.5 + 0.5) * W), y = Math.round((-p.y * 0.5 + 0.5) * H);
    /* Projected width of the sclera (0.086 * headScale half-width) in px. */
    const S = TUNE.headScale;
    const edge = c.clone().addScaledVector(
      new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward).normalize(), 0.086 * S);
    const pe = edge.project(cam);
    const px = Math.abs(pe.x - p.x) * 0.5 * W * 2;

    const behind = p.z > 1 || c.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3())) < 0;
    const verdict = behind ? 'CAMERA-BEHIND' : d <= 0 ? 'FACING AWAY — not visible' : d < 0.25 ? 'grazing' : 'visible';
    console.log(`${name.padEnd(13)} ${side > 0 ? 'L' : 'R'}    ${String(x).padStart(5)},${String(y).padStart(4)}   ${d.toFixed(3).padStart(8)}      ${px.toFixed(1).padStart(5)}   ${verdict}`);
  }
}

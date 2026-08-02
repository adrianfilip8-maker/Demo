/**
 * startleframe.mjs — where does a camera have to stand so BOTH eyes read in `sly-startle`?
 *
 * cap6's catchlight guard fired on the right eye only (max L121.9 vs L198.8 left). The pupil
 * `sc:` keys are symmetric ([0.35,0.35,1] on both), so constriction cannot produce an L/R
 * split; `eyefacing` gives the actual asymmetry as view angle — dot 0.963 left against 0.684
 * right, 47.6 px against 33.8 px. This sweeps camera azimuth/elevation/distance about the
 * staged player and reports the placement that maximises the WORSE eye, which is the eye the
 * guard is failing on.
 *
 * WHAT THIS IS, AS THE GAP (§11) — the suffix not implemented, between this and the render:
 *   - facing and projected size only. No lighting: it cannot tell you the eye is under the
 *     cap brim's shadow, which is the other half of cap6's finding and is a function of the
 *     player YAW against the sun, not of the camera (KNOWN_ISSUES §7).
 *   - no self-occlusion (muzzle, cane, brim geometry) — `occlude.mjs` owns that.
 *   - no level occlusion — `charvis.mjs` owns that.
 * So a row here means "the lens can see this eye at this angle and size", never "this eye is
 * lit" and never "this eye is unobstructed".
 *
 *   node startleframe.mjs
 */
import * as THREE from 'three';
const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel, TUNE } = await import('/home/user/Demo/src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('/home/user/Demo/src/player/Clips.js');
const { PoseBuffer } = await import('/home/user/Demo/src/player/Rig.js');
const { SHOTS } = await import('/home/user/Demo/src/core/Shots.js');

const W = 1280, H = 720;
const sly = new SlyModel(engine); await sly.init();
const shot = SHOTS['sly-startle'];
const clip = CLIPS[shot.player.pose];
const pb = new PoseBuffer(sly.boneNames);
pb.clear();
sampleInto(clip, clip.hold ?? 0, pb, 1);
for (const n of sly.boneNames) {
  const b = sly.bones[n]; if (!b) continue;
  if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
  if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
}
const hb = sly.bp('hips');
sly.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);

const PLAYER = shot.player.pos, YAW = shot.player.yaw;
function eyes(camPos, camTarget, fov, yaw) {
  sly.root.position.fromArray(PLAYER);
  sly.root.rotation.set(0, yaw, 0);
  sly.root.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 500);
  cam.position.copy(camPos); cam.lookAt(camTarget);
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const headBone = sly.bones.head;
  const inv = sly.skeleton.boneInverses[sly.boneNames.indexOf('head')];
  const skinM = new THREE.Matrix4().multiplyMatrices(headBone.matrixWorld, inv);
  const r = sly.headRadii;
  const out = [];
  for (const side of [1, -1]) {
    const th = side * 0.455, ph = 0.165;
    const c = sly.headSurf(th, ph, 0.92).applyMatrix4(skinM);
    const nrm = new THREE.Vector3(
      Math.cos(ph) * Math.sin(th) / r.x, Math.sin(ph) / r.y, Math.cos(ph) * Math.cos(th) / r.z).normalize();
    const outward = nrm.lerp(new THREE.Vector3(0, 0, 1), 0.30).normalize().transformDirection(skinM).normalize();
    const toCam = cam.position.clone().sub(c).normalize();
    const d = outward.dot(toCam);
    const p = c.clone().project(cam);
    const S = TUNE.headScale;
    const edge = c.clone().addScaledVector(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward).normalize(), 0.086 * S);
    const pe = edge.clone().project(cam);
    const px = Math.abs(pe.x - p.x) * 0.5 * W * 2;
    out.push({ side, d, px, sx: (p.x * 0.5 + 0.5) * W, sy: (-p.y * 0.5 + 0.5) * H, c });
  }
  return out;
}

/* Head centre in world, as the aim point — the pupil shot wants the head, not the chest. */
sly.root.position.fromArray(PLAYER); sly.root.rotation.set(0, YAW, 0); sly.root.updateMatrixWorld(true);
const headW = new THREE.Vector3().setFromMatrixPosition(sly.bones.head.matrixWorld);
console.log(`sly-startle  pose=${shot.player.pose}  player=(${PLAYER})  yaw=${YAW}`);
console.log(`head world centre (${headW.x.toFixed(2)}, ${headW.y.toFixed(2)}, ${headW.z.toFixed(2)})`);
const A0 = Math.atan2(shot.pos[0] - headW.x, shot.pos[2] - headW.z);
const D0 = Math.hypot(shot.pos[0] - headW.x, shot.pos[2] - headW.z, shot.pos[1] - headW.y);
const cur = eyes(new THREE.Vector3().fromArray(shot.pos), new THREE.Vector3().fromArray(shot.target), shot.fov, YAW);
console.log(`CURRENT  fov ${shot.fov}  L dot ${cur[0].d.toFixed(3)} ${cur[0].px.toFixed(1)}px   R dot ${cur[1].d.toFixed(3)} ${cur[1].px.toFixed(1)}px   worse ${Math.min(cur[0].d, cur[1].d).toFixed(3)}`);

/* Sweep camera azimuth/elev/distance about the head. Yaw held at the staged value: changing it
   would break the "closeup's staging verbatim, one variable" property the shot exists for, and
   it is also the only lever on FACE LIGHTING, which this tool cannot see. Reported separately
   below rather than optimised here. */
const rows = [];
for (let az = -80; az <= 80; az += 5) {
  for (let el = -6; el <= 22; el += 4) {
    for (const dist of [1.9, 2.3, 2.8, 3.4]) {
      /* Azimuth is measured as a DELTA from the shot's current camera bearing, not from the
         player yaw. Deriving it from yaw assumed a facing convention this rig does not use and
         put the whole sweep 146° away from the framing it was supposed to be perturbing — every
         row came back with the far eye behind the head, which is what made the error visible.
         Anchoring on the real bearing also makes `az` mean "rotate the lens N° around him". */
      const a = A0 + az * Math.PI / 180;
      const pos = new THREE.Vector3(
        headW.x + Math.sin(a) * dist * Math.cos(el * Math.PI / 180),
        headW.y + Math.sin(el * Math.PI / 180) * dist,
        headW.z + Math.cos(a) * dist * Math.cos(el * Math.PI / 180));
      /* fov chosen so the head fills a constant fraction of frame at any distance — the
         comparison must be about angle, not about how close the lens happens to be. */
      const fov = 2 * Math.atan(0.30 / dist) * 180 / Math.PI;
      const e = eyes(pos, headW, fov, YAW);
      const worse = Math.min(e[0].d, e[1].d);
      const worsePx = Math.min(e[0].px, e[1].px);
      rows.push({ az, el, dist, fov, worse, worsePx, L: e[0], R: e[1], pos });
    }
  }
}
rows.sort((a, b) => b.worse - a.worse);
console.log('\n  az   el  dist   fov   worseDot  worsePx   Ldot  Lpx    Rdot  Rpx    campos');
for (const r of rows.slice(0, 10)) {
  console.log(`  ${String(r.az).padStart(3)} ${String(r.el).padStart(4)} ${r.dist.toFixed(1)}  ${r.fov.toFixed(1).padStart(5)}   ${r.worse.toFixed(3)}    ${r.worsePx.toFixed(1).padStart(5)}   ${r.L.d.toFixed(3)} ${r.L.px.toFixed(1).padStart(5)}  ${r.R.d.toFixed(3)} ${r.R.px.toFixed(1).padStart(5)}  (${r.pos.x.toFixed(2)}, ${r.pos.y.toFixed(2)}, ${r.pos.z.toFixed(2)})`);
}
/* Best placement holding the CURRENT fov, for a minimal-change option. */
const near = rows.filter((r) => Math.abs(r.fov - shot.fov) < 4).slice(0, 3);
console.log('\n  same-fov-ish options:');
for (const r of near) console.log(`  az ${r.az} el ${r.el} dist ${r.dist} fov ${r.fov.toFixed(1)}  worseDot ${r.worse.toFixed(3)} worsePx ${r.worsePx.toFixed(1)}  pos (${r.pos.x.toFixed(2)}, ${r.pos.y.toFixed(2)}, ${r.pos.z.toFixed(2)})`);
console.log(`\nwarnings ${warnings.length}`);

/* Explicit candidates at sane focal lengths, since the auto-fov sweep above holds head-fill
   constant and therefore only ever proposes very long lenses. */
console.log('\nEXPLICIT CANDIDATES (az delta from current bearing, target = head centre):');
for (const cand of [
  { az: -25, el: 6, dist: 3.4, fov: 20 },
  { az: -25, el: 10, dist: 2.8, fov: 22 },
  { az: -25, el: 6, dist: 2.4, fov: 26 },
  { az: -20, el: 8, dist: 2.8, fov: 22 },
  { az: -30, el: 8, dist: 2.8, fov: 22 },
  { az: 0, el: 6, dist: 3.4, fov: 20 },
]) {
  const a = A0 + cand.az * Math.PI / 180;
  const er = cand.el * Math.PI / 180;
  const pos = new THREE.Vector3(
    headW.x + Math.sin(a) * cand.dist * Math.cos(er),
    headW.y + Math.sin(er) * cand.dist,
    headW.z + Math.cos(a) * cand.dist * Math.cos(er));
  const e = eyes(pos, headW, cand.fov, YAW);
  console.log(`  az ${String(cand.az).padStart(3)} el ${String(cand.el).padStart(2)} d ${cand.dist} fov ${cand.fov}  L ${e[0].d.toFixed(3)}/${e[0].px.toFixed(0)}px  R ${e[1].d.toFixed(3)}/${e[1].px.toFixed(0)}px  worse ${Math.min(e[0].d, e[1].d).toFixed(3)}  pos [${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}]  target [${headW.x.toFixed(2)}, ${headW.y.toFixed(2)}, ${headW.z.toFixed(2)}]`);
}

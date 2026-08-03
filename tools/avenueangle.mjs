/* What would it take to get the whole sphinx avenue into `dunes`?
 *
 * §8.1 pins the avenue at x = ±7, z = 40…84, so the avenue cannot move. The pedestal lever
 * is exhausted at its knee (tools/avenuevis.mjs --ped sweep). That leaves the camera, which
 * is not GEOMETRY's file — so state the requirement in numbers its owner can act on instead
 * of handing over "6 are off-frame".
 *
 * For each off-frame animal: the angle between the view axis and the ray to its head, and
 * therefore the horizontal fov that would be needed to include it from the current position.
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { Terrain } from '../src/world/Terrain.js';
import { Props } from '../src/world/Props.js';

const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: () => {}, get: () => null, has: () => false,
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};
const T = new Terrain(engine);
await T.init();

const SPHINX_X = 7, BODY = 3.5;
const SPHINX_Z = [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84];
const PED = Props.AVENUE_PEDESTAL;
const W = 1280, H = 720, ASPECT = W / H;

const s = SHOTS.dunes;
const cam = new THREE.PerspectiveCamera(s.fov, ASPECT, 0.1, 2000);
cam.position.fromArray(s.pos);
cam.lookAt(new THREE.Vector3(...s.target));
cam.updateMatrixWorld(true);
cam.updateProjectionMatrix();

const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();

const vfovHalf = THREE.MathUtils.degToRad(s.fov) / 2;
const hfovHalf = Math.atan(Math.tan(vfovHalf) * ASPECT);
console.log(`dunes camera ${JSON.stringify(s.pos)} -> ${JSON.stringify(s.target)}`);
console.log(`vfov ${s.fov}deg (half ${(vfovHalf * 180 / Math.PI).toFixed(1)}deg), `
  + `hfov ${(hfovHalf * 2 * 180 / Math.PI).toFixed(1)}deg (half ${(hfovHalf * 180 / Math.PI).toFixed(1)}deg)\n`);

console.log('   z     x   dist   horiz-ang  vert-ang   needed-vfov   verdict');
let worstVfov = 0;
for (const z of SPHINX_Z) {
  for (const sx of [-1, 1]) {
    const x = sx * SPHINX_X;
    const head = new THREE.Vector3(x, T.heightAt(x, z) - 0.15 + PED + BODY, z);
    const d = head.clone().sub(cam.position);
    const dist = d.length();
    const along = d.dot(fwd);
    const hx = d.dot(right), vy = d.dot(up);
    // angle from the view axis in each plane; negative `along` = behind the camera
    const ha = Math.atan2(hx, along) * 180 / Math.PI;
    const va = Math.atan2(vy, along) * 180 / Math.PI;
    const inH = Math.abs(ha) <= hfovHalf * 180 / Math.PI && along > 0;
    const inV = Math.abs(va) <= vfovHalf * 180 / Math.PI && along > 0;
    // vfov that would be needed to cover this point (via the horizontal requirement)
    let needV = NaN;
    if (along > 0) {
      const needH = Math.abs(Math.atan2(hx, along));
      needV = 2 * Math.atan(Math.tan(needH) / ASPECT) * 180 / Math.PI;
      const needVdirect = 2 * Math.abs(Math.atan2(vy, along)) * 180 / Math.PI;
      needV = Math.max(needV, needVdirect);
    }
    const inFrame = inH && inV;
    if (!inFrame && Number.isFinite(needV)) worstVfov = Math.max(worstVfov, needV);
    console.log(
      `${String(z).padStart(5)} ${String(x).padStart(5)} ${dist.toFixed(1).padStart(6)} `
      + `${ha.toFixed(1).padStart(9)}d ${va.toFixed(1).padStart(8)}d   `
      + `${along > 0 ? `${needV.toFixed(0)}deg`.padStart(9) : 'BEHIND CAM'.padStart(9)}     `
      + `${inFrame ? 'in frame' : 'OFF-FRAME'}`
    );
  }
}
console.log(`\nTo include every off-frame animal from the CURRENT position: vfov >= ${worstVfov.toFixed(0)}deg`);
console.log(`(current ${s.fov}deg). Anything past ~65deg vfov is a fisheye and will bow the`);
console.log(`pyramids and the temple front, so this is a camera-MOVE question, not an fov one.`);

/* Would pulling the camera back along its own view axis do it? That keeps the bearing —
   and therefore the sun-to-subject and view-to-subject relationships — exactly as framed. */
console.log('\nDolly back along the view axis, fov unchanged:');
for (const back of [0, 10, 20, 30, 45, 60]) {
  const p = cam.position.clone().addScaledVector(fwd, -back);
  const c2 = new THREE.PerspectiveCamera(s.fov, ASPECT, 0.1, 2000);
  c2.position.copy(p);
  c2.lookAt(new THREE.Vector3(...s.target));
  c2.updateMatrixWorld(true); c2.updateProjectionMatrix();
  let vis = 0, occ = 0;
  for (const z of SPHINX_Z) for (const sx of [-1, 1]) {
    const x = sx * SPHINX_X;
    const head = new THREE.Vector3(x, T.heightAt(x, z) - 0.15 + PED + BODY, z);
    const q = head.clone().project(c2);
    const f2 = new THREE.Vector3(0, 0, -1).applyQuaternion(c2.quaternion);
    const inF = Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && head.clone().sub(p).dot(f2) > 0;
    if (!inF) continue;
    // terrain occlusion along the new ray
    const dir = head.clone().sub(p); const len = dir.length(); dir.divideScalar(len);
    let pen = 0;
    for (let t = 1.0; t < len - 0.6; t += 0.35) {
      const qq = p.clone().addScaledVector(dir, t);
      pen = Math.max(pen, T.heightAt(qq.x, qq.z) - qq.y);
    }
    if (pen > 0) { occ++; continue; }
    vis++;
  }
  const gy = T.heightAt(p.x, p.z);
  console.log(`  back ${String(back).padStart(2)} m -> pos (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  `
    + `visible ${String(vis).padStart(2)}/16  occluded ${occ}  `
    + `cam is ${(p.y - gy).toFixed(1)} m above local sand${p.y - gy < 2 ? '  <-- INSIDE/near terrain' : ''}`);
}

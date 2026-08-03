/* How much of the sphinx avenue does `dunes` actually see, and what is hiding it?
 *
 * The open finding is "70% of the avenue is buried in the one shot that shows it", and
 * "buried" has two mechanisms that want opposite fixes: an animal *sunk into* the sand
 * (PROPS placed it below `heightAt`) versus an animal *occluded by* a dune between it and
 * the camera (TERRAIN's ridge, or the camera's own height). §75.4 declined to act because
 * two of the three candidate files are not GEOMETRY's — so establish which mechanism it is
 * before anyone edits anything.
 *
 *   node tools/avenuevis.mjs
 *
 * For each of the sixteen pedestals: the sand height under it, the y PROPS gives it, how
 * much of a 3.5 m animal stands above the local sand, whether its top is inside the `dunes`
 * frustum, and whether the straight line from the camera to its top clears the terrain.
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

const SPHINX_X = 7;
const SPHINX_Z = [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84];
const BODY = 3.5;          // overall height of the animal, per Statues.sphinx
/* Read the lift from the module that builds it rather than restating it — a verification tool
   that carries its own copy of the number under test verifies nothing. `--ped0` scores the
   un-lifted avenue for the before/after pair. */
const PEDARG = process.argv.find((a) => a.startsWith('--ped='));
const PED = PEDARG ? Number(PEDARG.slice(6)) : Props.AVENUE_PEDESTAL;
const W = 1280, H = 720;

const s = SHOTS.dunes;
const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 2000);
cam.position.fromArray(s.pos);
cam.lookAt(new THREE.Vector3(...s.target));
cam.updateMatrixWorld(true);
cam.updateProjectionMatrix();

/** March the straight line camera→p and report the deepest penetration into the sand. */
function occlusion(p) {
  const from = cam.position, dir = p.clone().sub(from);
  const len = dir.length();
  dir.divideScalar(len);
  let worst = 0, at = 0;
  for (let t = 1.0; t < len - 0.6; t += 0.35) {
    const q = from.clone().addScaledVector(dir, t);
    const g = T.heightAt(q.x, q.z);
    const pen = g - q.y;
    if (pen > worst) { worst = pen; at = t; }
  }
  return { pen: worst, at };
}

console.log('  z     x    sand   propY  standing  headPx        occluded-by-sand   verdict');
let hidden = 0, total = 0;
for (const z of SPHINX_Z) {
  for (const sx of [-1, 1]) {
    const x = sx * SPHINX_X;
    const sand = T.heightAt(x, z);
    const propY = sand - 0.15 + PED;              // Props._sphinxAvenue
    const head = new THREE.Vector3(x, propY + BODY, z);
    // local sand around the animal — a mound at the pedestal can bury a body placed at its peak
    let ring = 0;
    for (let a = 0; a < 8; a++) {
      ring = Math.max(ring, T.heightAt(x + 2.2 * Math.cos(a * 0.785), z + 2.2 * Math.sin(a * 0.785)));
    }
    const standing = propY + BODY - ring;
    const q = head.clone().project(cam);
    const inFrustum = Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1
      && head.clone().sub(cam.position).dot(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)) > 0;
    const px = [Math.round((q.x * 0.5 + 0.5) * W), Math.round((-q.y * 0.5 + 0.5) * H)];
    const occ = occlusion(head);
    total++;
    const shown = inFrustum && occ.pen <= 0;
    if (!shown) hidden++;
    console.log(
      `${String(z).padStart(5)} ${String(x).padStart(5)} ${sand.toFixed(2).padStart(7)} ` +
      `${propY.toFixed(2).padStart(7)} ${standing.toFixed(2).padStart(8)}m  ` +
      `${inFrustum ? `${px[0]},${px[1]}`.padEnd(11) : 'off-frame  '}   ` +
      `${occ.pen > 0 ? `${occ.pen.toFixed(2)} m at ${occ.at.toFixed(0)} m` : 'clear'.padEnd(14)}` +
      `   ${shown ? 'VISIBLE' : 'hidden'}`
    );
  }
}
console.log(`\n${hidden}/${total} pedestals hidden from \`dunes\` (${(hidden / total * 100).toFixed(0)}%)`);
console.log(`camera ${JSON.stringify(s.pos)} → ${JSON.stringify(s.target)}, fov ${s.fov}`);

/* What is at this pixel? Ray-casts the shot camera through given frame pixels and reports the
 * mesh, world hit point and distance. Coordinates are given in the SHOT's own pixel space
 * (1280x720 by default) so a read taken off shots/<set>/<shot>.png transfers directly.
 *
 *   node tools/pixat.mjs courtyard 640,340 700,200 ...
 */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const W = parseInt(opt('w', '1280'), 10);
const H = parseInt(opt('h', '720'), 10);
const nm = argv.shift() || 'courtyard';
const s = SHOTS[nm];
if (!s) { console.log(`unknown shot ${nm}`); process.exit(1); }

const WITH_PROPS = !process.argv.includes('--noprops');
const { root } = await buildLevel({ withProps: WITH_PROPS });
root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
cam.position.fromArray(s.pos);
cam.lookAt(new THREE.Vector3().fromArray(s.target));
if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const rc = new THREE.Raycaster();
rc.firstHitOnly = false;
const targets = [];
root.traverse((o) => { if (o.isMesh && o.visible !== false) targets.push(o); });

for (const spec of argv) {
  const [px, py] = spec.split(',').map(Number);
  const ndc = new THREE.Vector2((px / W) * 2 - 1, -((py / H) * 2 - 1));
  rc.setFromCamera(ndc, cam);
  const hits = rc.intersectObjects(targets, false);
  if (!hits.length) { console.log(`${spec}: (no architecture — sky/terrain/props)`); continue; }
  const h = hits[0];
  const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
  console.log(`${spec}: ${h.object.name}  d=${h.distance.toFixed(2)}m  ` +
    `world=(${h.point.x.toFixed(2)}, ${h.point.y.toFixed(2)}, ${h.point.z.toFixed(2)})` +
    (n ? `  n=(${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)})` : ''));
}

/* Multi-sample version: a grid over each drift's real footprint, both faces of each wall,
 * so a single mis-guessed crest point cannot decide the verdict. */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const W = 1280, H = 720;
const { root } = await buildLevel({ withProps: true });
root.updateMatrixWorld(true);

/* [name, cx, cz, len, alongAxis, faceDir(+1 => drift spills toward +axis), h, depth] */
const DRIFTS = [
  ['pylon  -X (north face)', -14, 31.0, 10.4, 'x', -1, 1.7, 4.2],
  ['pylon  +X (north face)',  14, 31.0, 10.4, 'x', -1, 1.7, 4.2],
  ['colossi -X', -9.5, 22.0, 7.4, 'x', -1, 1.35, 3.4],
  ['colossi +X',  9.5, 22.0, 7.4, 'x', -1, 1.35, 3.4],
  ['hall   -X', -25.1, -34, 30, 'z', -1, 1.5, 3.6],
  ['hall   +X',  25.1, -34, 30, 'z',  1, 1.5, 3.6],
  ['inner pylon',  0, 48.5, 19, 'x', -1, 2.0, 5.0],
  ['court corner', 13.5, 19.6, 9, 'x', -1, 0.9, 3.0],
];
const rc = new THREE.Raycaster();
const names = Object.keys(SHOTS).filter(k => SHOTS[k]?.pos && SHOTS[k]?.target);
const cams = names.map(sn => {
  const s = SHOTS[sn];
  const c = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 2000);
  c.position.fromArray(s.pos); c.lookAt(new THREE.Vector3(...s.target));
  c.updateMatrixWorld(true); c.updateProjectionMatrix();
  return [sn, c];
});

for (const [nm, cx, cz, len, axis, fd, h, depth] of DRIFTS) {
  const pts = [];
  for (let i = -2; i <= 2; i++) {           // along the run
    for (const dk of [0.10, 0.35, 0.70]) {   // out from the wall: crest -> shoulder -> toe
      const a = (i / 5) * len;
      const off = fd * depth * dk;
      const y = Math.max(0.12, h * (1 - dk) * 0.8) ;
      pts.push(axis === 'x'
        ? new THREE.Vector3(cx + a, y, cz + off)
        : new THREE.Vector3(cx + off, y, cz + a));
    }
  }
  const seen = new Map();
  for (const [sn, cam] of cams) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let ok = 0;
    for (const p of pts) {
      const q = p.clone().project(cam);
      if (!(Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && p.clone().sub(cam.position).dot(fwd) > 0)) continue;
      rc.setFromCamera(new THREE.Vector2(q.x, q.y), cam);
      const hits = rc.intersectObject(root, true);
      if (!hits.length) continue;
      if (Math.abs(hits[0].distance - cam.position.distanceTo(p)) < 0.7) ok++;
    }
    if (ok) seen.set(sn, ok);
  }
  const tot = pts.length;
  const txt = [...seen.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}/${tot}`).join('  ');
  console.log(`${nm.padEnd(24)} ${txt || 'NOT front-most at any of ' + tot + ' samples, in any camera'}`);
}

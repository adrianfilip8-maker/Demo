/* For each canonical shot: where does the character's cast shadow actually go, and is it
   in frame? Pure math off the real sun/moon tables — no boot needed. */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { evalAtmosphere, createAtmosphereState } from '../src/render/Atmosphere.js';

const ASPECT = 16 / 9;
const SLY_H = 1.7;

for (const [name, s] of Object.entries(SHOTS)) {
  if (!s.player || s.hidePlayer) { console.log(`${name.padEnd(13)} (no player)`); continue; }
  const A = evalAtmosphere(s.tod ?? 0.78, createAtmosphereState());
  const key = A.keyDir ? A.keyDir.clone() : A.sunDir.clone();   // toward the light
  const el = Math.asin(THREE.MathUtils.clamp(key.y, -1, 1)) * 180 / Math.PI;

  const p = new THREE.Vector3(...s.player.pos);
  const cam = new THREE.Vector3(...s.pos);
  const tgt = new THREE.Vector3(...s.target);

  // Ground shadow direction = anti-key, flattened.
  const sd = new THREE.Vector3(-key.x, 0, -key.z);
  if (sd.lengthSq() < 1e-6) { console.log(`${name.padEnd(13)} light overhead`); continue; }
  sd.normalize();
  const len = el > 1 ? Math.min(SLY_H / Math.tan(el * Math.PI / 180), 40) : 40;
  const tip = p.clone().addScaledVector(sd, len);
  tip.y = p.y;

  const camera = new THREE.PerspectiveCamera(s.fov ?? 45, ASPECT, 0.1, 500);
  camera.position.copy(cam);
  camera.lookAt(tgt);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const proj = (v) => {
    const n = v.clone().project(camera);
    const behind = v.clone().sub(cam).dot(tgt.clone().sub(cam).normalize()) < 0;
    return { x: n.x, y: n.y, behind };
  };
  const inFrame = (q) => !q.behind && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1;

  const feet = proj(p);
  const t = proj(tip);
  // How much of the shadow's length is on screen: sample along it.
  let vis = 0, N = 24;
  for (let i = 1; i <= N; i++) {
    const q = proj(p.clone().addScaledVector(sd, len * i / N));
    if (inFrame(q)) vis++;
  }

  const relAz = (a, b) => { let d = (a - b) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const camAz = Math.atan2(cam.z - p.z, cam.x - p.x);
  const shadAz = Math.atan2(sd.z, sd.x);

  console.log(
    `${name.padEnd(13)} el ${el.toFixed(0).padStart(3)}°  len ${len.toFixed(1).padStart(5)}m  ` +
    `shadow-vs-cam ${relAz(shadAz, camAz).toFixed(0).padStart(5)}°  ` +
    `feet ${inFrame(feet) ? 'IN ' : 'out'}  tip ${inFrame(t) ? 'IN ' : (t.behind ? 'BEHIND' : 'out')}  ` +
    `visible ${(100 * vis / N).toFixed(0).padStart(3)}% of shadow`
  );
}

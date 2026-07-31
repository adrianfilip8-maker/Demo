/* Camera + subject-yaw search for the character shots.
   A framing works when: feet and head are in frame, a useful run of the cast shadow is
   visible, the face is keyed rather than backlit, and the camera is not staring into the sun.
   Yaw matters as much as camera position — the first sweep failed every single candidate on
   face lighting, which is a function of yaw and the sun alone. */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { evalAtmosphere, createAtmosphereState } from '../src/render/Atmosphere.js';

const ASPECT = 16 / 9, H = 1.7;
const shot = process.argv[2] ?? 'sly-closeup';
const base = SHOTS[shot];
const A = evalAtmosphere(base.tod ?? 0.78, createAtmosphereState());
const key = (A.keyDir ?? A.sunDir).clone();
const el = Math.asin(THREE.MathUtils.clamp(key.y, -1, 1));
const flat = new THREE.Vector3(key.x, 0, key.z).normalize();
const sd = flat.clone().multiplyScalar(-1);              // ground shadow direction
const len = Math.min(H / Math.tan(Math.max(el, 0.05)), 40);

const p = new THREE.Vector3(...base.player.pos);
const c0 = new THREE.Vector3(...base.pos);
const dist0 = Math.hypot(c0.x - p.x, c0.z - p.z);
const az0 = Math.atan2(c0.z - p.z, c0.x - p.x);

function evaluate({ az, dist, camY, tgtY, fov, yaw }) {
  const cam = new THREE.Vector3(p.x + dist * Math.cos(az), p.y + camY, p.z + dist * Math.sin(az));
  const tgt = new THREE.Vector3(p.x, p.y + tgtY, p.z);
  const camera = new THREE.PerspectiveCamera(fov, ASPECT, 0.1, 500);
  camera.position.copy(cam); camera.lookAt(tgt);
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const fwd = tgt.clone().sub(cam).normalize();
  const vis = (v) => {
    if (v.clone().sub(cam).dot(fwd) < 0) return false;
    const n = v.clone().project(camera);
    return Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1;
  };
  let shadow = 0; const N = 24;
  for (let i = 1; i <= N; i++) if (vis(p.clone().addScaledVector(sd, len * i / N))) shadow++;
  shadow /= N;

  const face = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const faceLit = face.dot(flat);
  // Face toward camera: a character sheet wants him presenting to lens, not turned away.
  const faceCam = face.dot(cam.clone().sub(p).setY(0).normalize());
  const back = fwd.dot(flat);
  const feet = vis(p.clone()), head = vis(p.clone().setY(p.y + H));

  return { cam, tgt, yaw, shadow, faceLit, faceCam, back, feet, head,
    ok: feet && head && shadow >= 0.30 && faceLit > 0.15 && faceCam > 0.25 && back < 0.45 };
}

const out = [];
for (let d = -60; d <= 60; d += 5) {                       // azimuth, relative to current
  const az = az0 + d * Math.PI / 180;
  for (const dm of [1.0, 1.15, 1.3]) {
    for (const camY of [1.2, 1.5, 1.8, 2.2]) {
      for (const tgtY of [0.7, 0.9, 1.1]) {
        for (const fov of [base.fov, base.fov + 6]) {
          for (let yd = 0; yd < 360; yd += 10) {
            const r = evaluate({ az, dist: dist0 * dm, camY, tgtY, fov, yaw: yd * Math.PI / 180 });
            if (r.ok) out.push({ d, dm, camY, tgtY, fov, yd, ...r });
          }
        }
      }
    }
  }
}
// Prefer: most shadow, then a 3/4 face (lit but not flat-on to the sun), then least camera move.
out.sort((a, b) => (b.shadow - a.shadow)
  || (Math.abs(a.faceLit - 0.55) - Math.abs(b.faceLit - 0.55))
  || (Math.abs(a.d) - Math.abs(b.d)));
console.log(`${shot}: ${out.length} viable  (sun el ${(el * 180 / Math.PI).toFixed(0)}°, shadow ${len.toFixed(1)}m)`);
for (const r of out.slice(0, 10)) {
  console.log(`  dAz ${String(r.d).padStart(4)}°  yaw ${String(r.yd).padStart(3)}°  fov ${r.fov}  ` +
    `shadow ${(r.shadow * 100).toFixed(0).padStart(3)}%  faceLit ${r.faceLit.toFixed(2)}  faceCam ${r.faceCam.toFixed(2)}  ` +
    `pos [${r.cam.x.toFixed(2)}, ${r.cam.y.toFixed(2)}, ${r.cam.z.toFixed(2)}]  tgt [${r.tgt.x.toFixed(2)}, ${r.tgt.y.toFixed(2)}, ${r.tgt.z.toFixed(2)}]  yawRad ${(r.yd * Math.PI / 180).toFixed(2)}`);
}

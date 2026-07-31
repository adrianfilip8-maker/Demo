/* For the environment shots: keep the camera exactly where it is (the shot exists to show the
   architecture, not the character) and find a player position + yaw whose ground contact and
   cast shadow are actually in frame. Ground height is unknown off the current spot, so y is
   held and x/z move only a few metres. */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { evalAtmosphere, createAtmosphereState } from '../src/render/Atmosphere.js';

const ASPECT = 16 / 9, H = 1.7;
const shot = process.argv[2];
const s = SHOTS[shot];
const A = evalAtmosphere(s.tod ?? 0.78, createAtmosphereState());
const key = (A.keyDir ?? A.sunDir).clone();
const el = Math.asin(THREE.MathUtils.clamp(key.y, -1, 1));
const flat = new THREE.Vector3(key.x, 0, key.z).normalize();
const sd = flat.clone().multiplyScalar(-1);
const len = Math.min(H / Math.tan(Math.max(el, 0.05)), 40);

const cam = new THREE.Vector3(...s.pos);
const tgt = new THREE.Vector3(...s.target);
const camera = new THREE.PerspectiveCamera(s.fov ?? 45, ASPECT, 0.1, 500);
camera.position.copy(cam); camera.lookAt(tgt);
camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
const fwd = tgt.clone().sub(cam).normalize();
const ndc = (v) => v.clone().project(camera);
const vis = (v) => {
  if (v.clone().sub(cam).dot(fwd) < 0) return false;
  const n = ndc(v);
  return Math.abs(n.x) <= 0.97 && Math.abs(n.y) <= 0.97;   // small margin off the frame edge
};

const p0 = new THREE.Vector3(...s.player.pos);
const out = [];
for (let dx = -8; dx <= 8; dx += 0.5) {
  for (let dz = -8; dz <= 8; dz += 0.5) {
    const p = new THREE.Vector3(p0.x + dx, p0.y, p0.z + dz);
    const dist = p.distanceTo(cam);
    if (dist < 4 || dist > 34) continue;
    if (!vis(p) || !vis(p.clone().setY(p.y + H))) continue;
    let shadow = 0; const N = 24;
    for (let i = 1; i <= N; i++) if (vis(p.clone().addScaledVector(sd, len * i / N))) shadow++;
    shadow /= N;
    if (shadow < 0.5) continue;
    // Apparent height in NDC — he must read as a figure, not a speck.
    const hNdc = Math.abs(ndc(p.clone().setY(p.y + H)).y - ndc(p).y);
    if (hNdc < 0.10) continue;
    for (let yd = 0; yd < 360; yd += 5) {
      const yaw = yd * Math.PI / 180;
      const face = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const faceLit = face.dot(flat);
      const faceCam = face.dot(cam.clone().sub(p).setY(0).normalize());
      if (faceLit < 0.20 || faceCam < 0.10) continue;
      const n = ndc(p);
      out.push({ p, yaw, yd, shadow, faceLit, faceCam, hNdc, dist,
        move: Math.hypot(dx, dz), nx: n.x, ny: n.y });
    }
  }
}
// Prefer: keeps his screen position close to where it was, then shadow, then a 3/4 face.
const n0 = ndc(p0);
out.sort((a, b) => (Math.hypot(a.nx - n0.x, a.ny - n0.y) - Math.hypot(b.nx - n0.x, b.ny - n0.y))
  || (b.shadow - a.shadow)
  || (Math.abs(a.faceLit - 0.55) - Math.abs(b.faceLit - 0.55)));
console.log(`${shot}: ${out.length} viable  (sun el ${(el * 180 / Math.PI).toFixed(0)}°, shadow ${len.toFixed(1)}m, was at ndc ${n0.x.toFixed(2)},${n0.y.toFixed(2)})`);
const seen = new Set();
for (const r of out) {
  const k = `${r.p.x.toFixed(1)},${r.p.z.toFixed(1)}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  pos [${r.p.x.toFixed(2)}, ${r.p.y.toFixed(2)}, ${r.p.z.toFixed(2)}]  yaw ${r.yaw.toFixed(2)} (${r.yd}°)  ` +
    `shadow ${(r.shadow * 100).toFixed(0).padStart(3)}%  faceLit ${r.faceLit.toFixed(2)}  faceCam ${r.faceCam.toFixed(2)}  ` +
    `figH ${(r.hNdc * 100).toFixed(0)}%screen  d ${r.dist.toFixed(1)}m  moved ${r.move.toFixed(1)}m  ndc ${r.nx.toFixed(2)},${r.ny.toFixed(2)}`);
  if (seen.size >= 8) break;
}

/* Camera-relevant seal test.
 *
 * Casts a grid of rays through each canonical camera's frustum against the built architecture
 * and classifies each FIRST hit by whether the triangle's geometric normal faces the camera.
 * A first hit on a BACKFACE means the ray reached the inside of a closed form — it went
 * through a hole. That is exactly "looking sideways into the hollow shell", and unlike a
 * distance threshold it needs no per-opening bookkeeping to be correct.
 *
 * Two-sided art (sand drifts, cable tubes, the star ceiling slab seen from below) can register
 * legitimately, so the number to watch is the change, and the named surfaces.
 */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const { A } = await buildLevel();

/* Flatten every visible triangle once, with its owning mesh name. */
const TRI = [];
const NAME = [];
{
  const v = new THREE.Vector3();
  A.root.updateMatrixWorld(true);
  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); }
      else m.copy(o.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        const t = new Float32Array(9);
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(i + k) : i + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(m);
          t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z;
        }
        TRI.push(t); NAME.push(o.name);
      }
    }
  });
}

/* Uniform grid over world space so a ray only tests triangles in the cells it crosses. */
const CELL = 4.0;
const grid = new Map();
const key = (i, j, k) => `${i},${j},${k}`;
const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
for (let n = 0; n < TRI.length; n++) {
  const t = TRI[n];
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let k = 0; k < 3; k++) {
    x0 = Math.min(x0, t[k * 3]); x1 = Math.max(x1, t[k * 3]);
    y0 = Math.min(y0, t[k * 3 + 1]); y1 = Math.max(y1, t[k * 3 + 1]);
    z0 = Math.min(z0, t[k * 3 + 2]); z1 = Math.max(z1, t[k * 3 + 2]);
  }
  lo.min(new THREE.Vector3(x0, y0, z0)); hi.max(new THREE.Vector3(x1, y1, z1));
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++)
      for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
        const kk = key(i, j, k);
        let b = grid.get(kk); if (!b) grid.set(kk, b = []);
        b.push(n);
      }
}

function rayTri(o, d, T) {
  const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2];
  const e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2];
  const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tx = o.x - T[0], ty = o.y - T[1], tz = o.z - T[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const vv = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (vv < -1e-7 || u + vv > 1 + 1e-7) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4 ? t : -1;
}

/* 3D-DDA over the grid; returns {t, n} of the nearest hit. */
function cast(o, d, maxT = 400) {
  let ci = Math.floor(o.x / CELL), cj = Math.floor(o.y / CELL), ck = Math.floor(o.z / CELL);
  const si = d.x > 0 ? 1 : -1, sj = d.y > 0 ? 1 : -1, sk = d.z > 0 ? 1 : -1;
  const inv = (v) => (Math.abs(v) < 1e-12 ? Infinity : 1 / v);
  const dtx = Math.abs(CELL * inv(d.x)), dty = Math.abs(CELL * inv(d.y)), dtz = Math.abs(CELL * inv(d.z));
  const nb = (c, s) => (s > 0 ? (c + 1) * CELL : c * CELL);
  let tx = (nb(ci, si) - o.x) * inv(d.x); if (tx < 0) tx = Infinity;
  let ty = (nb(cj, sj) - o.y) * inv(d.y); if (ty < 0) ty = Infinity;
  let tz = (nb(ck, sk) - o.z) * inv(d.z); if (tz < 0) tz = Infinity;
  let travelled = 0, guard = 0;
  while (travelled < maxT && guard++ < 4000) {
    const b = grid.get(key(ci, cj, ck));
    if (b) {
      let best = Infinity, bn = -1;
      for (const n of b) { const t = rayTri(o, d, TRI[n]); if (t > 0 && t < best) { best = t; bn = n; } }
      // Only accept if the hit is inside this cell's span, else a nearer cell may still win.
      const cellEnd = Math.min(tx, ty, tz);
      if (bn >= 0 && best <= cellEnd + 1e-3) return { t: best, n: bn };
    }
    if (tx < ty && tx < tz) { travelled = tx; ci += si; tx += dtx; }
    else if (ty < tz) { travelled = ty; cj += sj; ty += dty; }
    else { travelled = tz; ck += sk; tz += dtz; }
  }
  return { t: Infinity, n: -1 };
}

const W = 96, H = 54;
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['hero', 'temple', 'dunes', 'courtyard', 'guard', 'night', 'interior'];
console.log(`${TRI.length} tris, ${grid.size} cells;  ${W}x${H} rays per shot\n`);
console.log('shot        hits   backface   %      worst offenders');
for (const nm of names) {
  const s = SHOTS[nm]; if (!s) { console.log(`${nm}: unknown`); continue; }
  const cam = new THREE.PerspectiveCamera(s.fov, 16 / 9, 0.1, 1000);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  cam.updateMatrixWorld(true);
  const o = cam.position.clone();
  let hits = 0, back = 0;
  const tally = new Map();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const ndc = new THREE.Vector3((px + 0.5) / W * 2 - 1, 1 - (py + 0.5) / H * 2, 0.5);
    const d = ndc.unproject(cam).sub(o).normalize();
    const r = cast(o, d);
    if (r.n < 0) continue;
    hits++;
    const T = TRI[r.n];
    e1.set(T[3] - T[0], T[4] - T[1], T[5] - T[2]);
    e2.set(T[6] - T[0], T[7] - T[1], T[8] - T[2]);
    nrm.crossVectors(e1, e2);
    if (nrm.dot(d) > 0) {                      // normal points away from the camera
      back++;
      const k = NAME[r.n] || '?';
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`${nm.padEnd(11)} ${String(hits).padStart(5)}  ${String(back).padStart(7)}  ${(back / Math.max(1, hits) * 100).toFixed(1).padStart(5)}   ${top}`);
}

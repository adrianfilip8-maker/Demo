/* Which mesh owns each pixel? Front-face ownership map for a canonical shot.
 *
 * `raster.mjs` tracks owners only for BACK faces, because it exists to find culling errors.
 * This asks the complementary question — "what am I actually looking at in this frame?" —
 * which is the one you need before claiming a form is missing from a shot. A piece that is
 * authored, built, and eight metres outside the frustum is not a rendering defect and no
 * amount of reshaping it will change the picture.
 *
 * Same clip-then-project path as raster.mjs (see the note there on why near-plane clipping
 * is load-bearing rather than a nicety). Architecture only — no player, no props.
 *
 *   node tools/frontmap.mjs <shot> [--w 800] [--h 450] [--top 20]
 */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const W = parseInt(opt('w', '800'), 10);
const H = parseInt(opt('h', '450'), 10);
const TOP = parseInt(opt('top', '20'), 10);
const nm = argv[0] || 'courtyard';

const s = SHOTS[nm];
if (!s) { console.log(`unknown shot ${nm}`); process.exit(1); }

const { A } = await buildLevel();
A.root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 600);
cam.position.fromArray(s.pos);
cam.lookAt(new THREE.Vector3().fromArray(s.target));
if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

const NEAR = cam.near;
const clipNear = (poly) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.w >= NEAR, bin = b.w >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.w) / (b.w - a.w);
      out.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
    }
  }
  return out;
};
const toScreen = (v) => new THREE.Vector3(
  (v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w);

const zb = new Float32Array(W * H).fill(Infinity);
const owner = new Int32Array(W * H).fill(-1);
const meshNames = [];
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();

A.root.traverse((o) => {
  if (!o.isMesh || o.visible === false) return;
  const g = o.geometry; if (!g?.attributes?.position) return;
  const meshId = meshNames.push(o.name) - 1;
  const pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
  const m = new THREE.Matrix4();
  for (let ii = 0; ii < inst; ii++) {
    if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      p0.fromBufferAttribute(pos, i0).applyMatrix4(m);
      p1.fromBufferAttribute(pos, i1).applyMatrix4(m);
      p2.fromBufferAttribute(pos, i2).applyMatrix4(m);
      e1.subVectors(p1, p0); e2.subVectors(p2, p0); nrm.crossVectors(e1, e2).normalize();
      if (nrm.dot(p0.clone().sub(cam.position)) >= 0) continue;   // backface
      const poly = clipNear([p0, p1, p2].map((v) => new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(VP)));
      if (poly.length < 3) continue;
      const S = poly.map(toScreen);
      for (let f = 1; f + 1 < S.length; f++) {
        const a = S[0], b = S[f], c = S[f + 1];
        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        if (minX > maxX || minY > maxY) continue;
        const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
        if (Math.abs(area) < 1e-9) continue;
        const inv = 1 / area;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) * inv;
          const w1 = ((px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w2 / a.z + w1 / b.z + w0 / c.z);
          if (z <= 0) continue;
          const k = y * W + x;
          if (z >= zb[k]) continue;
          zb[k] = z; owner[k] = meshId;
        }
      }
    }
  }
});

const tally = new Map();
let filled = 0;
for (let k = 0; k < W * H; k++) {
  if (owner[k] < 0) continue;
  filled++;
  const nn = meshNames[owner[k]];
  tally.set(nn, (tally.get(nn) || 0) + 1);
}
console.log(`${nm}: ${W}x${H}, architecture covers ${(filled / (W * H) * 100).toFixed(1)}% of frame`);
const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
for (const [k, v] of rows) {
  console.log(`  ${(v / (W * H) * 100).toFixed(2).padStart(6)}%  ${String(v).padStart(7)}  ${k}`);
}

/* Nearest-surface distance per named mesh: "is it in frame" and "how big is it" are
   different questions from "is it close enough for its detail to survive". */
console.log('\n  nearest depth of each of the above (m):');
const near = new Map();
for (let k = 0; k < W * H; k++) {
  if (owner[k] < 0) continue;
  const nn = meshNames[owner[k]];
  if (!near.has(nn) || zb[k] < near.get(nn)) near.set(nn, zb[k]);
}
for (const [k] of rows) console.log(`    ${near.get(k).toFixed(1).padStart(6)}  ${k}`);

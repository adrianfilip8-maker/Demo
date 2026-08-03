#!/usr/bin/env node
/**
 * gilddepth — how many screen pixels one texture repeat of a material subtends, per shot,
 * measured off the real level geometry through the shot's own camera.
 *
 * Exists because PREREG-hgchisel-frame's P3 gate is a lag band (30–300 px) and a pass inside a
 * band that does not contain the material's actual repeat is a vacuous pass. The 157 px in the
 * seal is one point on a receding run; this prints the distribution.
 *
 * SCOPE — the suffix NOT implemented (KNOWN_ISSUES §11):
 *   architecture only (`lvl.mjs`'s build), no props/terrain/character/FX, so a gilded pixel that
 *   the real frame covers with something else is still counted here. Z-buffered against
 *   architecture only. It reports the *geometric* px/repeat: it says nothing about whether the
 *   repeat is visible, only how large it would be.
 *
 *   node gilddepth.mjs <shot> <W> <H> <material> <worldRepeatMetres>
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';

const [shotName, Ws, Hs, MAT, REPs] = process.argv.slice(2);
const W = parseInt(Ws, 10), H = parseInt(Hs, 10), REPM = parseFloat(REPs);
const s = SHOTS[shotName];
if (!s) { console.error('unknown shot'); process.exit(1); }

const { A } = await buildLevel();
A.root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 600);
cam.position.fromArray(s.pos);
cam.up.set(0, 1, 0);
cam.lookAt(new THREE.Vector3().fromArray(s.target));
if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

const zb = new Float32Array(W * H).fill(Infinity);
const isMat = new Uint8Array(W * H);
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
const NEAR = cam.near;
const clipNear = (poly) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.w >= NEAR, bin = b.w >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.w) / (b.w - a.w);
      out.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
    }
  }
  return out;
};
const toScreen = (v) => [(v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w];

/* `--only` rasterises the named material ALONE, so the difference against the full build is
   exactly how much of it other architecture is standing in front of. */
const ONLY = process.argv.includes('--only');

A.root.traverse((o) => {
  if (!o.isMesh || o.visible === false) return;
  if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
  const g = o.geometry; if (!g?.attributes?.position) return;
  const mine = (o.material?.name || o.name || '?') === MAT ? 1 : 0;
  if (ONLY && !mine) return;
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
      const poly = clipNear([p0, p1, p2].map((v) => new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(VP)));
      if (poly.length < 3) continue;
      const S = poly.map(toScreen);
      for (let f = 1; f + 1 < S.length; f++) {
        const a = S[0], b = S[f], c = S[f + 1];
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(d) < 1e-9) continue;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / d;
          const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / d;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]);
          const k = y * W + x;
          if (z < zb[k]) { zb[k] = z; isMat[k] = mine; }
        }
      }
    }
  }
});

const fovRad = THREE.MathUtils.degToRad(s.fov ?? 50);
const mradPerPx = (2 * Math.tan(fovRad / 2) / H) * 1000;   // small-angle at frame centre
/* `--rows y0,y1` restricts the report to a horizontal band, because a material can span a 10x
   depth range in one frame and a single median then describes nothing in it. */
const ROWS = (process.argv.find((a) => a.startsWith('--rows=')) || '').slice(7);
const [ry0, ry1] = ROWS ? ROWS.split(',').map(Number) : [0, H];
const ds = [];
for (let i = 0; i < W * H; i++) if (isMat[i] && (i / W | 0) >= ry0 && (i / W | 0) < ry1) ds.push(zb[i]);
ds.sort((a, b) => a - b);
if (!ds.length) { console.log(`${shotName}: ${MAT} not visible`); process.exit(0); }
const q = (p) => ds[Math.min(ds.length - 1, Math.max(0, Math.round(p * (ds.length - 1))))];
const pxRep = (d) => REPM / (d * mradPerPx / 1000);
console.log(`${shotName}: ${MAT}  ${ds.length} px  fov ${s.fov}  ${mradPerPx.toFixed(4)} mrad/px at H=${H}`);
console.log(`  view depth  p5 ${q(0.05).toFixed(1)}  p25 ${q(0.25).toFixed(1)}  p50 ${q(0.50).toFixed(1)}  p75 ${q(0.75).toFixed(1)}  p95 ${q(0.95).toFixed(1)} m`);
console.log(`  px / ${REPM} m repeat   p5 ${pxRep(q(0.95)).toFixed(0)}  p25 ${pxRep(q(0.75)).toFixed(0)}  p50 ${pxRep(q(0.50)).toFixed(0)}  p75 ${pxRep(q(0.25)).toFixed(0)}  p95 ${pxRep(q(0.05)).toFixed(0)}`);
const inBand = ds.filter((d) => { const p = pxRep(d); return p >= 30 && p <= 300; }).length;
console.log(`  share of this material's px whose repeat falls inside the registered 30-300 px lag band: ${(100 * inBand / ds.length).toFixed(1)}%`);

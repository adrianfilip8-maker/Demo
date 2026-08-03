/**
 * ringpx — how many millimetres of a SURFACE fall in one screen pixel, per material, per shot.
 *
 * Why it exists: every "is this feature sub-pixel?" question in this file (MOTES.size,
 * sand_ripples, the 61 mm arris ring, "no sand glint") is the same arithmetic — an authored
 * world size divided by the surface mm/px at the framing that has to show it. That divisor has
 * been quoted per shot as a single number (`interior` 20.6, `traversal` 30.6, §90.2) with no
 * instrument in the repository behind it. This is the instrument, and it prints a distribution
 * rather than a number because a 45 m wall seen obliquely spans a factor of several.
 *
 * SCOPE — the transforms between this and what the renderer drew, i.e. the suffix NOT
 * implemented (KNOWN_ISSUES §11):
 *   - ARCHITECTURE only by default (`--props` adds PROPS). No terrain, character, FX or sky, so
 *     a pixel any of those covers in the real frame is attributed here to the masonry behind it.
 *     Shares are therefore upper bounds for occluded materials.
 *   - No lighting, no shadow, no grade, no mips, no FXAA. This is a geometric measurement of the
 *     camera and the level; it says nothing about whether a feature is *visible*, only whether it
 *     is large enough to be resolvable at all. A 4 px feature at 0.2% contrast is still invisible.
 *   - It measures the surface footprint of one pixel INCLUDING obliquity: the two screen axes are
 *     projected onto the surface plane separately and reported separately, because a wall seen at
 *     a grazing angle resolves fine across its width and not at all along its run. `mmpx` is the
 *     geometric mean (the area-equivalent scale that a resample to "one pixel = N mm" means);
 *     `mmpxMax` is the foreshortened axis and is the one that decides whether a ring closes.
 *   - Geometry drift: built from the CURRENT tree. A frame captured at an older SHA can disagree.
 *   - No near-plane-clip artefact: triangles are clipped against the near plane before
 *     projection (§10 — raster.mjs invented a defect by dropping them instead).
 *
 *   node ringpx.mjs <shot|--all> [--w 1280] [--h 720] [--props] [--feature 61]
 *                   [--mat substr] [--json out.json]
 *
 * `--feature <mm>` also prints that feature's size in pixels at p10/p50/p90 of the material's
 * own mm/px, which is the number a sub-pixel sweep actually wants.
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const W = parseInt(opt('w', '1280'), 10), H = parseInt(opt('h', '720'), 10);
const FEATURE = parseFloat(opt('feature', '61'));      // mm
const MATSUB = opt('mat', null);
const shotNames = has('all') ? Object.keys(SHOTS) : [argv[0]].filter(Boolean);
if (!shotNames.length) { console.error('usage: ringpx.mjs <shot|--all>'); process.exit(1); }

const { A, root } = await buildLevel({ withProps: has('props') });
const world = root || A.root;
world.updateMatrixWorld(true);

/* Flatten to world triangles once — every shot reuses them. */
const tris = [];   // {ax..cz, name}
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  world.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const name = o.material?.name || o.name || '?';
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
        tris.push({ a: p0.clone(), b: p1.clone(), c: p2.clone(), name });
      }
    }
  });
}
console.log(`# ringpx  ${W}x${H}  props=${has('props')}  triangles=${tris.length}  feature=${FEATURE}mm`);

const pct = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.floor(q * arr.length)))] : NaN;
const out = {};

for (const shotName of shotNames) {
  const s = SHOTS[shotName];
  if (!s) { console.error('unknown shot', shotName); continue; }
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 900);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  /* Camera ray for a pixel centre, exact for a perspective camera. */
  const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5), aspect = W / H;
  const R = new THREE.Matrix4().extractRotation(cam.matrixWorld);
  const o = cam.position;
  const dirAt = (px, py, v) => {
    v.set(((px / W) * 2 - 1) * tanH * aspect, (1 - (py / H) * 2) * tanH, -1).applyMatrix4(R).normalize();
    return v;
  };

  const zb = new Float32Array(W * H).fill(Infinity);
  const mid = new Int16Array(W * H).fill(-1);
  const mmpx = new Float32Array(W * H);
  const mmpxMax = new Float32Array(W * H);
  const mats = [], matOf = new Map();

  const NEAR = cam.near;
  const clipNear = (poly) => {
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a.w >= NEAR, bin = b.w >= NEAR;
      if (ain) res.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.w) / (b.w - a.w);
        res.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
      }
    }
    return res;
  };
  const toScreen = (v) => [(v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w];

  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  const d0 = new THREE.Vector3(), dx = new THREE.Vector3(), dy = new THREE.Vector3();
  const P0 = new THREE.Vector3(), PX = new THREE.Vector3(), PY = new THREE.Vector3();

  for (const T of tris) {
    let mi = matOf.get(T.name);
    if (mi === undefined) { mi = mats.push(T.name) - 1; matOf.set(T.name, mi); }
    const poly = clipNear([T.a, T.b, T.c].map((v) => new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(VP)));
    if (poly.length < 3) continue;
    e1.subVectors(T.b, T.a); e2.subVectors(T.c, T.a); nrm.crossVectors(e1, e2);
    const nlen = nrm.length(); if (nlen < 1e-12) continue;
    nrm.multiplyScalar(1 / nlen);
    const cplane = nrm.dot(T.a);
    const S = poly.map(toScreen);
    for (let f = 1; f + 1 < S.length; f++) {
      const a = S[0], b = S[f], c = S[f + 1];
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const dt = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(dt) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / dt;
          const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / dt;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]);
          const k = y * W + x;
          if (z >= zb[k]) continue;
          // Surface footprint of this pixel: intersect three neighbouring rays with the plane.
          const den0 = nrm.dot(dirAt(px, py, d0));
          if (Math.abs(den0) < 1e-7) continue;
          const t0 = (cplane - nrm.dot(o)) / den0;
          if (!(t0 > 0)) continue;
          P0.copy(d0).multiplyScalar(t0).add(o);
          const denx = nrm.dot(dirAt(px + 1, py, dx));
          const deny = nrm.dot(dirAt(px, py + 1, dy));
          if (Math.abs(denx) < 1e-7 || Math.abs(deny) < 1e-7) continue;
          PX.copy(dx).multiplyScalar((cplane - nrm.dot(o)) / denx).add(o);
          PY.copy(dy).multiplyScalar((cplane - nrm.dot(o)) / deny).add(o);
          const mx = P0.distanceTo(PX) * 1000, my = P0.distanceTo(PY) * 1000;
          if (!isFinite(mx) || !isFinite(my)) continue;
          zb[k] = z; mid[k] = mi;
          mmpx[k] = Math.sqrt(mx * my);
          mmpxMax[k] = Math.max(mx, my);
        }
      }
    }
  }

  const buckets = new Map();
  for (let k = 0; k < W * H; k++) {
    const m = mid[k]; if (m < 0) continue;
    let arr = buckets.get(mats[m]);
    if (!arr) { arr = { g: [], mx: [], x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }; buckets.set(mats[m], arr); }
    arr.g.push(mmpx[k]); arr.mx.push(mmpxMax[k]);
    const x = k % W, y = (k / W) | 0;
    if (x < arr.x0) arr.x0 = x; if (x > arr.x1) arr.x1 = x;
    if (y < arr.y0) arr.y0 = y; if (y > arr.y1) arr.y1 = y;
  }
  const rows = [];
  for (const [name, arr] of buckets) {
    if (MATSUB && !name.includes(MATSUB)) continue;
    arr.g.sort((p, q) => p - q); arr.mx.sort((p, q) => p - q);
    rows.push({
      name, px: arr.g.length, sharePct: +(100 * arr.g.length / (W * H)).toFixed(2),
      mmpx10: +pct(arr.g, 0.1).toFixed(1), mmpx50: +pct(arr.g, 0.5).toFixed(1), mmpx90: +pct(arr.g, 0.9).toFixed(1),
      mmpxMax50: +pct(arr.mx, 0.5).toFixed(1),
      featPx50: +(FEATURE / pct(arr.g, 0.5)).toFixed(2),
      featPx10: +(FEATURE / pct(arr.g, 0.9)).toFixed(2),   // worst decile (largest mm/px)
      featPxMaxAxis50: +(FEATURE / pct(arr.mx, 0.5)).toFixed(2),
      /* Tiling exposure: how many texture repeats the material's own screen extent spans, using
       * its median surface mm/px. `worldTile` comes from the recipe (tile x the consumer UV
       * factor) and is filled in by the caller — a repeat count is meaningless without it. */
      bboxW: arr.x1 - arr.x0 + 1, bboxH: arr.y1 - arr.y0 + 1,
      spanMmW: +(pct(arr.g, 0.5) * (arr.x1 - arr.x0 + 1)).toFixed(0),
    });
  }
  rows.sort((p, q) => q.sharePct - p.sharePct);
  out[shotName] = rows;
  console.log(`\n=== ${shotName}  fov ${s.fov ?? 50}  pos ${s.pos.map((v) => v.toFixed(1)).join(',')} ===`);
  console.log('material'.padEnd(26) + 'share%   px    mm/px p10   p50   p90  maxAxis50 | ' + FEATURE + 'mm -> px p50  p10  maxAxis');
  for (const r of rows.slice(0, 14)) {
    console.log(r.name.padEnd(26) + String(r.sharePct).padStart(6) + String(r.px).padStart(8) +
      String(r.mmpx10).padStart(9) + String(r.mmpx50).padStart(6) + String(r.mmpx90).padStart(6) +
      String(r.mmpxMax50).padStart(10) + ' | ' + String(r.featPx50).padStart(10) +
      String(r.featPx10).padStart(6) + String(r.featPxMaxAxis50).padStart(9));
  }
}
const jp = opt('json', null);
if (jp) { writeFileSync(jp, JSON.stringify({ W, H, feature: FEATURE, props: has('props'), shots: out }, null, 1)); console.log('\njson ->', jp); }

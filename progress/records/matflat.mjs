/**
 * In-frame texture-legibility instrument, keyed per MATERIAL rather than per hand-placed ROI.
 *
 * Question it answers: for each material, in a real captured frame, how much of its screen area
 * carries resolvable surface detail (COVERAGE) and how strong is that detail where it exists
 * (AMPLITUDE) — the two halves §7.3's "reads as flat vertex colour" conflates.
 *
 * How: rasterise architecture (+props) offline with the shot's own camera at the capture
 * resolution, producing a per-pixel material-key mask; erode it; then measure band-pass local
 * contrast in the captured PNG inside each eroded mask.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS BETWEEN THIS NUMBER AND WHAT THE RENDERER DREW (the suffix I did NOT implement) — §11.
 *
 *  - The mask is built from ARCHITECTURE (+ PROPS with --props). TERRAIN, the CHARACTER, FX
 *    (motes, shafts, sparkles) and the SKY are NOT in it. Any frame pixel those cover is
 *    attributed to whatever masonry stands behind it. Mitigation: --erode drops pixels within
 *    N px of a mask boundary, which removes silhouettes, ink outlines and most thin occluders,
 *    but a large occluder's interior (the character's torso) still lands in the wrong bucket.
 *    `--maxshare` prints the eroded share so a suspicious bucket can be spotted.
 *  - No shadows, no AO, no lighting: the mask says which material, never how lit. A material
 *    measured half in shadow reports the average of two regimes.
 *  - The frame HAS been through everything: shadows, AO, ink, bloom, AgX, saturation, FXAA.
 *    So this is a measurement of the delivered image, not of the texture. The texture-side
 *    counterpart is `flatcov.mjs`, and the pair of them is what isolates authoring from grade.
 *  - Geometry drift: the mask is built from the CURRENT tree; a frame captured at an older SHA
 *    can disagree on where a wall is. Pass --sha to record what was compared; the erode is the
 *    only defence and it is a weak one for a moved wall.
 *
 * Usage:
 *   node matflat.mjs shots/cap9/hero.png hero [--props] [--erode 3] [--json out.json]
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const pngPath = args[0];
const shotName = args[1];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1] ?? true) : d; };
const has = (n) => args.includes(`--${n}`);
const ERODE = parseInt(opt('erode', '3'), 10);

const img = readPNG(pngPath);
const W = img.w, H = img.h, CH = img.ch;
const s = SHOTS[shotName];
if (!s) throw new Error(`unknown shot ${shotName}`);

const { root } = await buildLevel({ withProps: has('props') });
root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 900);
cam.position.fromArray(s.pos);
cam.lookAt(new THREE.Vector3().fromArray(s.target));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

const zb = new Float32Array(W * H).fill(Infinity);
const matId = new Int32Array(W * H).fill(-1);
const cosT = new Float32Array(W * H);
const matNames = [];
const matIndex = new Map();

const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
const ctr = new THREE.Vector3(), vdir = new THREE.Vector3();
const NEAR = cam.near;
const clipNear = (poly) => {
  const o = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a.w >= NEAR, bin = b.w >= NEAR;
    if (ain) o.push(a);
    if (ain !== bin) {
      const t = (NEAR - a.w) / (b.w - a.w);
      o.push(new THREE.Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
    }
  }
  return o;
};
const toScreen = (v) => new THREE.Vector3((v.x / v.w * 0.5 + 0.5) * W, (1 - (v.y / v.w * 0.5 + 0.5)) * H, v.w);

root.traverse((o) => {
  if (!o.isMesh || o.visible === false) return;
  const g = o.geometry; if (!g?.attributes?.position) return;
  const mm = Array.isArray(o.material) ? o.material[0] : o.material;
  const key = mm?.name ? String(mm.name).replace(/^arch:|^props?:/, '') : String(o.name || '').split(':').pop();
  let mi = matIndex.get(key);
  if (mi === undefined) { mi = matNames.push(key) - 1; matIndex.set(key, mi); }
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
      ctr.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
      vdir.subVectors(ctr, cam.position).normalize();
      if (nrm.dot(vdir) >= 0) continue;
      const ct = Math.min(1, Math.abs(nrm.dot(vdir)));
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
          const k = y * W + x;
          if (z >= zb[k] || z <= 0) continue;
          zb[k] = z; matId[k] = mi; cosT[k] = ct;
        }
      }
    }
  }
});

/* ---- erode: drop pixels within ERODE px of a material/depth boundary ------------------- */
const keep = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = y * W + x; const id = matId[k];
  if (id < 0) { keep[k] = 0; continue; }
  let ok = 1;
  for (let dy = -ERODE; dy <= ERODE && ok; dy++) for (let dx = -ERODE; dx <= ERODE; dx++) {
    const yy = y + dy, xx = x + dx;
    if (yy < 0 || yy >= H || xx < 0 || xx >= W) { ok = 0; break; }
    const kk = yy * W + xx;
    if (matId[kk] !== id) { ok = 0; break; }
    // a depth step inside one material is still a silhouette (a column in front of a wall)
    if (Math.abs(zb[kk] - zb[k]) > 0.35 + 0.02 * zb[k]) { ok = 0; break; }
  }
  keep[k] = ok;
}

/* ---- frame luma, display space (that is where the eye is) ------------------------------ */
const L = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  L[i] = (img.data[i * CH] * 0.2126 + img.data[i * CH + 1] * 0.7152 + img.data[i * CH + 2] * 0.0722) / 255;
}

/* ---- --diff <otherPng>: per-material frame-to-frame delta inside the SAME eroded mask.
 * Suffix NOT implemented: a raw luma delta between two boots/SHAs. It says where two frames
 * differ, never why — every pipeline change between them is in it alongside any texture change.
 * Use it to ask "is the difference localised to the material I changed", not "is it my change". */
const diffPath = opt('diff', null);
if (diffPath) {
  const D = readPNG(diffPath);
  if (D.w !== W || D.h !== H) throw new Error('diff size mismatch');
  const rowsD = matNames.map((name, mi) => {
    let n = 0, sum = 0, over = 0;
    for (let i = 0; i < W * H; i++) {
      if (!keep[i] || matId[i] !== mi) continue;
      const la = img.data[i * CH] * 0.2126 + img.data[i * CH + 1] * 0.7152 + img.data[i * CH + 2] * 0.0722;
      const lb = D.data[i * D.ch] * 0.2126 + D.data[i * D.ch + 1] * 0.7152 + D.data[i * D.ch + 2] * 0.0722;
      const d = Math.abs(la - lb); n++; sum += d; if (d > 2) over++;
    }
    return { name, n, mean: n ? +(sum / n).toFixed(3) : 0, over: n ? +(100 * over / n).toFixed(2) : 0 };
  }).filter((r) => r.n > 500).sort((a, b) => b.n - a.n);
  console.log(`\n=== DIFF vs ${diffPath} (mean |dLuma| in 0-255 units, inside the eroded mask) ===`);
  console.log('material'.padEnd(24) + 'keptPx'.padStart(9) + 'mean|dL|'.padStart(10) + '  %px|dL|>2');
  for (const r of rowsD) console.log(r.name.padEnd(24) + String(r.n).padStart(9) + String(r.mean).padStart(10) + String(r.over).padStart(12));
  process.exit(0);
}

function gauss(src, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1); let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); a += src[y * W + xx] * k[i + r]; }
    tmp[y * W + x] = a;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); a += tmp[yy * W + x] * k[i + r]; }
    out[y * W + x] = a;
  }
  return out;
}

/* Two scales. FINE ~ chisel/grain/joint detail; COARSE ~ block and stain structure. */
const loF = gauss(L, 1.6), loC = gauss(L, 6.0), base = gauss(L, 14.0);

const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))];

/* Connected-component dead-area: a big contiguous run of sub-threshold pixels is what actually
 * reads as "a flat panel", and it is invisible to any mean. */
function deadBlobs(ids, id, thrMap, thr, minPx) {
  const seen = new Uint8Array(W * H);
  let deadPix = 0, bigPix = 0, biggest = 0, total = 0;
  const big = [];
  const stack = new Int32Array(W * H);
  for (let k0 = 0; k0 < W * H; k0++) {
    if (ids[k0] !== id || !keep[k0]) continue;
    total++;
    if (seen[k0] || thrMap[k0] >= thr) continue;
    let sp = 0; stack[sp++] = k0; seen[k0] = 1; let size = 0;
    const cells = [];
    while (sp > 0) {
      const k = stack[--sp]; size++; cells.push(k);
      const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const kk = yy * W + xx;
        if (seen[kk] || ids[kk] !== id || !keep[kk] || thrMap[kk] >= thr) continue;
        seen[kk] = 1; stack[sp++] = kk;
      }
    }
    deadPix += size;
    if (size >= minPx) {
      bigPix += size;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, lsum = 0; const zs = [];
      for (const k of cells) {
        const x = k % W, y = (k / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        lsum += L[k]; zs.push(zb[k]);
      }
      zs.sort((a, b) => a - b);
      big.push({ size, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], luma: +(lsum / size).toFixed(3), zMed: +zs[zs.length >> 1].toFixed(1) });
    }
    if (size > biggest) biggest = size;
  }
  big.sort((a, b) => b.size - a.size);
  return { deadShare: deadPix / Math.max(1, total), bigShare: bigPix / Math.max(1, total), biggest, total, big: big.slice(0, 4) };
}

/* Relative band-pass contrast maps. Weber-ish: |bandpass| / local mean. */
const cF = new Float32Array(W * H), cC = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  const b = Math.max(0.02, base[i]);
  cF[i] = Math.abs(L[i] - loF[i]) / b;
  cC[i] = Math.abs(loF[i] - loC[i]) / b;
}

const rows = [];
for (let mi = 0; mi < matNames.length; mi++) {
  const idxs = [];
  for (let k = 0; k < W * H; k++) if (matId[k] === mi && keep[k]) idxs.push(k);
  if (idxs.length < 500) continue;
  let raw = 0; for (let k = 0; k < W * H; k++) if (matId[k] === mi) raw++;
  const f = [], c = [], lum = [], zs = [];
  for (const k of idxs) { f.push(cF[k]); c.push(cC[k]); lum.push(L[k]); zs.push(zb[k]); }
  f.sort((a, b) => a - b); c.sort((a, b) => a - b); lum.sort((a, b) => a - b); zs.sort((a, b) => a - b);
  const covF = f.filter((v) => v >= 0.01).length / f.length;
  const covF2 = f.filter((v) => v >= 0.02).length / f.length;
  const covC = c.filter((v) => v >= 0.02).length / c.length;
  const meanActive = (() => { const a = f.filter((v) => v >= 0.01); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; })();
  const dead = deadBlobs(matId, mi, cF, 0.01, 400);
  rows.push({
    name: matNames[mi],
    sharePct: +(raw / (W * H) * 100).toFixed(2),
    keptPx: idxs.length,
    lumaMed: +pct(lum, 0.5).toFixed(3),
    zMed: +pct(zs, 0.5).toFixed(1), zP90: +pct(zs, 0.9).toFixed(1),
    fineMed: +pct(f, 0.5).toFixed(4),
    fineP90: +pct(f, 0.9).toFixed(4),
    coarseMed: +pct(c, 0.5).toFixed(4),
    cov1: +covF.toFixed(3),
    cov2: +covF2.toFixed(3),
    covC2: +covC.toFixed(3),
    ampActive: +meanActive.toFixed(4),
    deadShare: +dead.deadShare.toFixed(3),
    deadBig: +dead.bigShare.toFixed(3),
    biggestDeadPx: dead.biggest,
    bigBlobs: dead.big,
  });
}
rows.sort((a, b) => b.sharePct - a.sharePct);

/* Sky / background null: pixels the raster says are empty. Not a flat surface — it has a
 * gradient and whatever SKY draws — but it is the pipeline's own low-structure floor. */
{
  const idxs = [];
  for (let k = 0; k < W * H; k++) if (matId[k] < 0) idxs.push(k);
  if (idxs.length > 500) {
    const f = idxs.map((k) => cF[k]).sort((a, b) => a - b);
    rows.push({
      name: '(background/sky+terrain+char)',
      sharePct: +(idxs.length / (W * H) * 100).toFixed(2), keptPx: idxs.length,
      lumaMed: null, fineMed: +pct(f, 0.5).toFixed(4), fineP90: +pct(f, 0.9).toFixed(4),
      coarseMed: null, cov1: +(f.filter((v) => v >= 0.01).length / f.length).toFixed(3),
      cov2: +(f.filter((v) => v >= 0.02).length / f.length).toFixed(3), covC2: null,
      ampActive: null, deadShare: null, deadBig: null, biggestDeadPx: null,
    });
  }
}

console.log(`\n=== ${pngPath}  shot=${shotName}  ${W}x${H}  erode=${ERODE}px  props=${has('props')} ===`);
console.log('material'.padEnd(24) + 'share%  keptPx  lumaMed  fineMed  fineP90  coarseMed  cov1%  cov2%  covC2%  ampAct  dead%  deadBig%  biggestDead');
for (const r of rows) {
  console.log(
    r.name.padEnd(24) +
    String(r.sharePct).padStart(6) + String(r.keptPx).padStart(8) +
    String(r.lumaMed ?? '-').padStart(9) + String(r.fineMed).padStart(9) + String(r.fineP90).padStart(9) +
    String(r.coarseMed ?? '-').padStart(11) +
    String((r.cov1 * 100).toFixed(1)).padStart(7) + String((r.cov2 * 100).toFixed(1)).padStart(7) +
    String(r.covC2 == null ? '-' : (r.covC2 * 100).toFixed(1)).padStart(8) +
    String(r.ampActive ?? '-').padStart(8) +
    String(r.deadShare == null ? '-' : (r.deadShare * 100).toFixed(1)).padStart(7) +
    String(r.deadBig == null ? '-' : (r.deadBig * 100).toFixed(1)).padStart(10) +
    String(r.biggestDeadPx ?? '-').padStart(13));
}
for (const r of rows) if (r.bigBlobs && r.bigBlobs.length) console.log('  blobs', r.name, JSON.stringify(r.bigBlobs));
const jp = opt('json', null);
if (jp) writeFileSync(jp, JSON.stringify({ png: pngPath, shot: shotName, erode: ERODE, props: has('props'), rows }, null, 1));

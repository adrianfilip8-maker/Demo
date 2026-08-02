/**
 * Does the cel ramp actually band ON SCREEN? — the join instrument.
 *
 * Every previous attempt at this question measured one side of it. `ndl.mjs` measures what the
 * *geometry* offers (how much projected area sweeps a terminator) and explicitly disclaims
 * shadows, normal maps, AO and post. The critic measured the *pixels* (luma along a scanline)
 * and could not say whether a flat profile meant "the ramp is smooth" or "this surface never
 * crosses a terminator in the first place". Neither can settle it alone: a flat luma profile on
 * a surface whose ndl never leaves one band is the CORRECT result, and reading it as a failure
 * is how five capture cycles went into a metric that could not show the defect.
 *
 * So this joins the two, per pixel:
 *
 *   - rasterise architecture offline with the canonical shot camera (roll included) at the
 *     captured PNG's exact resolution, keeping the interpolated SHADING normal and world
 *     position per pixel — so ndl is the same quantity the shader's diffuse term computes;
 *   - rasterise a tight orthographic depth map along the key direction, so cast-shadowed
 *     pixels can be excluded (their direct term is off; their luma says nothing about the ramp);
 *   - read the captured frame and take its luma at the same pixel.
 *
 * Then it asks the only question that discriminates: **restricted to lit architecture pixels,
 * is luma a STEP function of ndl?** A banded ramp is flat inside a band and jumps at the
 * terminator. A smooth ramp has the same slope everywhere. That is a shape test, and it is
 * immune to the exposure/grade/albedo offsets that made previous absolute-luma readings
 * unfalsifiable.
 *
 * It also locates the sites: connected runs of one mesh whose ndl sweeps across a terminator
 * are exactly "where a terminator should read", ranked by size, so the verdict is attached to
 * a named surface and a pixel box that can be cropped and looked at.
 *
 * LIMITS, stated because they bound the verdict:
 *   - Architecture only. Props, the player and terrain are not rasterised, so a pixel where one
 *     of those occludes architecture joins the wrong luma. Median statistics and the per-site
 *     boxes keep that from dominating, but a site overlapping the player is not evidence.
 *   - The detail normal map perturbs the real shaded normal and is NOT modelled here. If the
 *     geometry sweeps a terminator and the pixels show no step, that map is a prime suspect —
 *     which is why within-band luma noise is reported beside the step height.
 *   - Ink outlines are near-black pixels lying on exactly the silhouettes this cares about;
 *     they are rejected by a darkness gate, reported as `ink%`.
 *
 * Takes no capture lock and boots no browser.
 *
 *   node tools/bandprobe.mjs <shot> <png> [--sites 6] [--out shots/_scratch/bp]
 */
import * as THREE from 'three';
import { readPNG } from './png.mjs';
import { writePNG } from './crop.mjs';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';
import { readFileSync } from 'node:fs';

/* ---- args ---- */
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const NSITES = parseInt(opt('sites', '6'), 10);
const OUT = opt('out', '');
const [SHOT, PNG] = argv.filter((a) => !a.startsWith('--'));
if (!SHOT || !PNG) { console.error('usage: bandprobe.mjs <shot> <png> [--sites N] [--out prefix]'); process.exit(2); }

/* Read the terminators out of SHADING's source rather than hardcoding them, so this cannot
   drift from the shader the way a copied pair would. Same contract as ndl.mjs. */
const { TERM_LO, TERM_HI, TERM_SOFT } = (() => {
  const src = readFileSync(new URL('../src/render/ToonMaterial.js', import.meta.url), 'utf8');
  const grab = (k) => {
    const m = src.match(new RegExp(`\\b${k}\\s*:\\s*([0-9.]+)`));
    if (!m) throw new Error(`bandprobe: could not read ${k} from ToonMaterial.js`);
    return parseFloat(m[1]);
  };
  return { TERM_LO: grab('termLo'), TERM_HI: grab('termHi'), TERM_SOFT: grab('termSoft') };
})();
const TERMS = [TERM_LO, TERM_HI];

const S = SHOTS[SHOT];
if (!S) { console.error(`unknown shot ${SHOT}`); process.exit(2); }

const img = readPNG(PNG);
const W = img.w, H = img.h;
const lumaOf = (i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];

/* ---- camera: applyShot's exact sequence, including roll ---- */
const cam = new THREE.PerspectiveCamera(S.fov ?? 50, W / H, 0.1, 1400);
cam.position.fromArray(S.pos);
cam.up.set(0, 1, 0);
cam.lookAt(new THREE.Vector3().fromArray(S.target));
if (S.roll) cam.rotateZ(THREE.MathUtils.degToRad(S.roll));
cam.updateProjectionMatrix();
cam.updateMatrixWorld(true);
const VP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

const st = createAtmosphereState();
evalAtmosphere(S.tod ?? 0.78, st);
const L = st.keyDir.clone().normalize();

const { A } = await buildLevel();
A.root.updateMatrixWorld(true);

/* ---- gbuffer ---- */
const NPX = W * H;
const zb = new Float32Array(NPX).fill(Infinity);
const gN = new Float32Array(NPX * 3);
const gP = new Float32Array(NPX * 3);
const gM = new Int32Array(NPX).fill(-1);
const meshNames = [];

/* Collect meshes once; keep instancing expanded lazily per triangle. */
const clip = new THREE.Vector4();
function projectTo(vx, vy, vz, out) {
  clip.set(vx, vy, vz, 1).applyMatrix4(VP);
  if (clip.w <= 1e-6) return false;
  out[0] = (clip.x / clip.w * 0.5 + 0.5) * W;
  out[1] = (1 - (clip.y / clip.w * 0.5 + 0.5)) * H;
  out[2] = clip.w;
  return true;
}

{
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const pa = [0, 0, 0], pb = [0, 0, 0], pc = [0, 0, 0];
  let drawn = 0;

  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    const mi = meshNames.length;
    meshNames.push(o.name || 'unnamed');
    const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
    const count = idx ? idx.count : pos.count;
    const inst = o.isInstancedMesh ? o.count : 1;

    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); }
      else m.copy(o.matrixWorld);
      nm.getNormalMatrix(m);
      for (let i = 0; i < count; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        b.fromBufferAttribute(pos, i1).applyMatrix4(m);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        if (!projectTo(a.x, a.y, a.z, pa)) continue;
        if (!projectTo(b.x, b.y, b.z, pb)) continue;
        if (!projectTo(c.x, c.y, c.z, pc)) continue;
        // backface cull in screen space (CCW front, y flipped -> sign inverted)
        const area2 = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
        if (area2 >= 0) continue;
        let x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
        let x1 = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
        let y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
        let y1 = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
        if (x1 < x0 || y1 < y0) continue;
        if (nor) {
          na.fromBufferAttribute(nor, i0).applyMatrix3(nm).normalize();
          nb.fromBufferAttribute(nor, i1).applyMatrix3(nm).normalize();
          nc.fromBufferAttribute(nor, i2).applyMatrix3(nm).normalize();
        } else { na.set(0, 1, 0); nb.copy(na); nc.copy(na); }
        const inv = 1 / area2;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((pb[0] - px) * (pc[1] - py) - (pc[0] - px) * (pb[1] - py)) * inv;
            if (w0 < 0) continue;
            const w1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) * inv;
            if (w1 < 0) continue;
            const w2 = 1 - w0 - w1;
            if (w2 < 0) continue;
            // perspective-correct depth
            const iw = w0 / pa[2] + w1 / pb[2] + w2 / pc[2];
            const z = 1 / iw;
            const q = y * W + x;
            if (z >= zb[q]) continue;
            zb[q] = z;
            const k0 = w0 / pa[2] * z, k1 = w1 / pb[2] * z, k2 = w2 / pc[2] * z;
            let nx = na.x * k0 + nb.x * k1 + nc.x * k2;
            let ny = na.y * k0 + nb.y * k1 + nc.y * k2;
            let nz = na.z * k0 + nb.z * k1 + nc.z * k2;
            const ln = Math.hypot(nx, ny, nz) || 1;
            gN[q * 3] = nx / ln; gN[q * 3 + 1] = ny / ln; gN[q * 3 + 2] = nz / ln;
            gP[q * 3] = a.x * k0 + b.x * k1 + c.x * k2;
            gP[q * 3 + 1] = a.y * k0 + b.y * k1 + c.y * k2;
            gP[q * 3 + 2] = a.z * k0 + b.z * k1 + c.z * k2;
            gM[q] = mi;
          }
        }
        drawn++;
      }
    }
  });
  console.error(`# rasterised ${drawn} tris over ${meshNames.length} meshes`);
}

/* ---- shadow map: tight ortho along L over the world positions actually visible ---- */
const SM = 2048;
let sBox = new THREE.Box3();
for (let q = 0; q < NPX; q++) if (gM[q] >= 0) sBox.expandByPoint(new THREE.Vector3(gP[q * 3], gP[q * 3 + 1], gP[q * 3 + 2]));
const smDepth = new Float32Array(SM * SM).fill(Infinity);
let smMat = null, smTexel = 0;
if (!sBox.isEmpty()) {
  const centre = sBox.getCenter(new THREE.Vector3());
  const radius = sBox.getSize(new THREE.Vector3()).length() * 0.5 + 2;
  const eye = centre.clone().addScaledVector(L, radius + 60);
  const lcam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 2 * radius + 140);
  lcam.position.copy(eye);
  lcam.up.set(0, 1, 0);
  if (Math.abs(L.y) > 0.99) lcam.up.set(0, 0, 1);
  lcam.lookAt(centre);
  lcam.updateProjectionMatrix(); lcam.updateMatrixWorld(true);
  smMat = new THREE.Matrix4().multiplyMatrices(lcam.projectionMatrix, lcam.matrixWorldInverse);
  smTexel = (2 * radius) / SM;

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector4();
  const pa = [0, 0, 0], pb = [0, 0, 0], pc = [0, 0, 0];
  const proj = (x, y, z, out) => {
    v.set(x, y, z, 1).applyMatrix4(smMat);
    out[0] = (v.x * 0.5 + 0.5) * SM; out[1] = (1 - (v.y * 0.5 + 0.5)) * SM; out[2] = v.z;
  };
  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    const pos = g.attributes.position, idx = g.index;
    const count = idx ? idx.count : pos.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); }
      else m.copy(o.matrixWorld);
      for (let i = 0; i < count; i += 3) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        b.fromBufferAttribute(pos, i1).applyMatrix4(m);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        proj(a.x, a.y, a.z, pa); proj(b.x, b.y, b.z, pb); proj(c.x, c.y, c.z, pc);
        const ar = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
        if (Math.abs(ar) < 1e-12) continue;
        const inv = 1 / ar;
        const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
        const x1 = Math.min(SM - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
        const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
        const y1 = Math.min(SM - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          let w0 = ((pb[0] - px) * (pc[1] - py) - (pc[0] - px) * (pb[1] - py)) * inv;
          let w1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) * inv;
          let w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = pa[2] * w0 + pb[2] * w1 + pc[2] * w2;
          const q = y * SM + x;
          if (z < smDepth[q]) smDepth[q] = z;
        }
      }
    }
  });
}
const shadowBias = 3e-3;
function litAt(x, y, z, ndl) {
  if (!smMat) return true;
  const v = new THREE.Vector4(x, y, z, 1).applyMatrix4(smMat);
  const sx = Math.round((v.x * 0.5 + 0.5) * SM), sy = Math.round((1 - (v.y * 0.5 + 0.5)) * SM);
  if (sx < 0 || sy < 0 || sx >= SM || sy >= SM) return true;
  // slope-scaled bias: grazing surfaces need more
  const bias = shadowBias * (1 + 3 * (1 - Math.min(1, ndl)));
  let occluded = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const q = (sy + dy) * SM + (sx + dx);
    if (q < 0 || q >= SM * SM) continue;
    n++;
    if (smDepth[q] < v.z - bias) occluded++;
  }
  return { lit: occluded === 0, edge: occluded > 0 && occluded < n };
}

/* ---- join ---- */
const INK = 34;             // luma below this is ink / crushed; excluded and reported
const NB = 50;
const bins = Array.from({ length: NB }, () => []);
let nArch = 0, nLit = 0, nInk = 0, nEdge = 0;
const lit8 = new Uint8Array(NPX);       // 1 lit, 2 shadow, 3 edge

for (let q = 0; q < NPX; q++) {
  if (gM[q] < 0) continue;
  nArch++;
  const nx = gN[q * 3], ny = gN[q * 3 + 1], nz = gN[q * 3 + 2];
  const ndl = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
  const r = litAt(gP[q * 3], gP[q * 3 + 1], gP[q * 3 + 2], ndl);
  if (r.edge) { lit8[q] = 3; nEdge++; continue; }
  if (!r.lit) { lit8[q] = 2; continue; }
  lit8[q] = 1;
  const lum = lumaOf(q * img.ch);
  if (lum < INK) { nInk++; continue; }
  nLit++;
  const bi = Math.min(NB - 1, Math.floor(ndl * NB));
  bins[bi].push(lum);
}

const med = (arr) => { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const iqr = (arr) => { if (arr.length < 4) return NaN; const s = Float64Array.from(arr).sort(); return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)]; };

console.log(`\n=== ${SHOT}  ${PNG}  ${W}x${H}`);
console.log(`key (${L.x.toFixed(3)}, ${L.y.toFixed(3)}, ${L.z.toFixed(3)})   terminators ${TERM_LO} / ${TERM_HI}  soft ±${TERM_SOFT}`);
console.log(`architecture px ${nArch}  lit ${nLit}  shadow ${nArch - nLit - nEdge - nInk}  shadow-edge ${nEdge}  ink ${nInk} (${(100 * nInk / Math.max(1, nArch)).toFixed(1)}%)`);

console.log(`\n ndl      n     medL   IQR`);
for (let i = 0; i < NB; i++) {
  if (bins[i].length < 40) continue;
  const lo = i / NB;
  const mark = TERMS.some((t) => t >= lo && t < lo + 1 / NB) ? '  <== terminator' : '';
  console.log(` ${lo.toFixed(2)}  ${String(bins[i].length).padStart(7)}  ${med(bins[i]).toFixed(1).padStart(6)}  ${iqr(bins[i]).toFixed(1).padStart(5)}${mark}`);
}

/* ---- the shape test: step at terminator vs slope inside the neighbouring bands ----
 *
 * A step alone proves nothing: a smooth ramp also rises across any interval you pick. The
 * discriminator is the CONTROL — the median-luma change over an interval of the same ndl width
 * that lies wholly inside one band. Banded: step >> control. Smooth: step ≈ control. */
const gatherFrom = (bb, a, b) => { const o = []; for (let i = 0; i < NB; i++) { const lo = i / NB, hi = lo + 1 / NB; if (lo >= a - 1e-9 && hi <= b + 1e-9) o.push(...bb[i]); } return o; };
function stepTest(bb, label) {
  console.log(`\n--- step test: ${label} ---`);
  const HALF = 0.06;                      // interval width each side of a terminator
  for (const T of TERMS) {
    const below = gatherFrom(bb, Math.max(0, T - HALF), T - TERM_SOFT);
    const above = gatherFrom(bb, T + TERM_SOFT, Math.min(1, T + HALF));
    if (below.length < 50 || above.length < 50) { console.log(`  T=${T.toFixed(2)}: too few lit px (below ${below.length}, above ${above.length})`); continue; }
    const mb = med(below), ma = med(above);
    /* Control: the SAME ndl width, entirely inside the band above the terminator, offset so it
       cannot touch the terminator's own soft edge. Reported as the pair of sub-intervals it
       compares, because a control you cannot locate is not a control. */
    const cA0 = T + TERM_SOFT + (HALF - TERM_SOFT) * 1.0, cA1 = cA0 + (HALF - TERM_SOFT);
    const cB1 = cA1 + (HALF - TERM_SOFT);
    const c0 = gatherFrom(bb, cA0, cA1), c1 = gatherFrom(bb, cA1, cB1);
    const ctrl = (c0.length > 50 && c1.length > 50) ? med(c1) - med(c0) : NaN;
    const step = ma - mb;
    const ratio = isNaN(ctrl) || Math.abs(ctrl) < 1e-6 ? NaN : Math.abs(step / ctrl);
    console.log(`  T=${T.toFixed(2)}  below ${mb.toFixed(1)} (n=${below.length})  above ${ma.toFixed(1)} (n=${above.length})  ` +
      `STEP ${step >= 0 ? '+' : ''}${step.toFixed(1)}`);
    console.log(`         control [${cA0.toFixed(2)},${cA1.toFixed(2)}]→[${cA1.toFixed(2)},${cB1.toFixed(2)}] Δ ${isNaN(ctrl) ? 'n/a' : (ctrl >= 0 ? '+' : '') + ctrl.toFixed(1)}` +
      `   step/control ${isNaN(ratio) ? 'n/a' : ratio.toFixed(2)}×   IQR below ${iqr(below).toFixed(1)} above ${iqr(above).toFixed(1)}`);
  }
}
stepTest(bins, 'all lit architecture, all materials pooled');

/* Per-mesh, because pooling materials lets an albedo difference masquerade as a ramp step:
   a bright limestone face at high ndl and dark mudbrick at low ndl produce a "step" with no
   quantiser involved at all. Within one merged mesh the material is constant by construction. */
{
  const perMesh = new Map();
  for (let q = 0; q < NPX; q++) {
    if (gM[q] < 0 || lit8[q] !== 1) continue;
    const lum = lumaOf(q * img.ch);
    if (lum < INK) continue;
    const nx = gN[q * 3], ny = gN[q * 3 + 1], nz = gN[q * 3 + 2];
    const ndl = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
    let bb = perMesh.get(gM[q]);
    if (!bb) { bb = Array.from({ length: NB }, () => []); perMesh.set(gM[q], bb); }
    bb[Math.min(NB - 1, Math.floor(ndl * NB))].push(lum);
  }
  const rank = [...perMesh.entries()].map(([mi, bb]) => {
    let n = 0, spanLo = NB, spanHi = -1;
    for (let i = 0; i < NB; i++) if (bb[i].length >= 25) { n += bb[i].length; spanLo = Math.min(spanLo, i); spanHi = Math.max(spanHi, i); }
    return { mi, bb, n, span: (spanHi - spanLo) / NB };
  }).filter((r) => r.n > 2000 && r.span > 0.25).sort((a, b) => b.n - a.n).slice(0, 3);
  for (const r of rank) stepTest(r.bb, `${meshNames[r.mi]}  (n=${r.n}, ndl span ${r.span.toFixed(2)})`);
}

/* ---- sites: genuinely CONTIGUOUS single-mesh regions that span all three bands ----
 *
 * The first version of this grouped by (terminator, mesh) over the whole frame and reported a
 * box spanning 1280 px — which located nothing, because one merged bucket is the entire
 * courtyard. A demonstration needs a region the eye can take in at once, so: 4-connected flood
 * fill over lit-or-penumbral pixels of ONE mesh, then keep the components that actually contain
 * pixels from more than one band. A component that is wholly inside one band is the null case —
 * it is where a flat face correctly renders as one tone, and it is not a terminator. */
const ndlAt = (q) => Math.max(0, gN[q * 3] * L.x + gN[q * 3 + 1] * L.y + gN[q * 3 + 2] * L.z);
const bandAt = (q) => { const d = ndlAt(q); return d < TERM_LO ? 0 : d < TERM_HI ? 1 : 2; };
const seen = new Uint8Array(NPX);
const comps = [];
const stack = new Int32Array(NPX);
for (let q0 = 0; q0 < NPX; q0++) {
  if (seen[q0] || gM[q0] < 0 || lit8[q0] === 2) continue;
  const mesh = gM[q0];
  let sp = 0; stack[sp++] = q0; seen[q0] = 1;
  let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
  const bandN = [0, 0, 0];
  while (sp > 0) {
    const q = stack[--sp];
    const x = q % W, y = (q / W) | 0;
    n++; bandN[bandAt(q)]++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const push = (nq) => { if (nq >= 0 && nq < NPX && !seen[nq] && gM[nq] === mesh && lit8[nq] !== 2) { seen[nq] = 1; stack[sp++] = nq; } };
    if (x > 0) push(q - 1);
    if (x < W - 1) push(q + 1);
    if (y > 0) push(q - W);
    if (y < H - 1) push(q + W);
  }
  const spanned = bandN.filter((b) => b >= 25).length;
  if (n >= 400 && spanned >= 2) comps.push({ mesh, n, x0, x1, y0, y1, bandN, spanned });
}
/* Visibility, not just presence. A step in median luma is worthless as a *demonstration* if the
 * surface's own albedo noise is the same size: masonry here carries per-block colour variation
 * and geometric mortar recesses that move luma as much as a band boundary does. So each site is
 * scored by the separation between adjacent bands' median luma DIVIDED BY the within-band IQR.
 * Below ~1 the band edge is buried in the texture and no viewer will read it as a terminator. */
for (const c of comps) {
  const per = [[], [], []];
  for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
    const q = y * W + x;
    if (gM[q] !== c.mesh || lit8[q] !== 1) continue;
    const lum = lumaOf(q * img.ch); if (lum < INK) continue;
    per[bandAt(q)].push(lum);
  }
  c.med = per.map((a) => (a.length >= 25 ? med(a) : NaN));
  c.iqr = per.map((a) => (a.length >= 25 ? iqr(a) : NaN));
  c.litN = per.map((a) => a.length);
  const sep = (i, j) => {
    if (isNaN(c.med[i]) || isNaN(c.med[j])) return NaN;
    const noise = (c.iqr[i] + c.iqr[j]) / 2;
    return noise < 1e-6 ? NaN : Math.abs(c.med[j] - c.med[i]) / noise;
  };
  c.sepLoMid = sep(0, 1); c.sepMidHi = sep(1, 2);
  c.score = Math.min(isNaN(c.sepLoMid) ? 0 : c.sepLoMid, isNaN(c.sepMidHi) ? 0 : c.sepMidHi);
}
comps.sort((a, b) => (b.score - a.score) || (b.spanned - a.spanned));
console.log(`\n--- contiguous multi-band sites (one mesh, 4-connected, lit or penumbral) ---`);
console.log(`  ${comps.length} of them; ranked by the WEAKER of the two band separations,`);
console.log(`  separation = |Δ median luma| / mean within-band IQR. <1 means the edge is inside the texture noise.`);
for (const c of comps.slice(0, NSITES)) {
  const f = (v) => (isNaN(v) ? '  n/a' : v.toFixed(2).padStart(5));
  const g = (v) => (isNaN(v) ? ' n/a' : v.toFixed(0).padStart(4));
  console.log(`  sep lo|mid ${f(c.sepLoMid)}  mid|hi ${f(c.sepMidHi)}   medL ${g(c.med[0])}/${g(c.med[1])}/${g(c.med[2])}` +
    `  IQR ${g(c.iqr[0])}/${g(c.iqr[1])}/${g(c.iqr[2])}  litpx ${c.litN[0]}/${c.litN[1]}/${c.litN[2]}`);
  console.log(`       ${meshNames[c.mesh]}  box(${c.x0},${c.y0})-(${c.x1},${c.y1})  ${c.x1 - c.x0 + 1}x${c.y1 - c.y0 + 1}`);
}

/* ---- the mid-level check: is the middle tone the QUANTISER's 0.5, or an accident? ----
 *
 * This is the test that separates a ramp terminator from a cast-shadow edge, and it caught two
 * false positives that the step and slope statistics both passed. With bands = 3 the quantiser
 * emits exactly three levels — 0, 0.5, 1 — so a genuine mid band must sit near HALFWAY between
 * the shadow and light tones. A sunlit patch edge, a mortar recess or a mis-registered shadow
 * boundary produces a middle tone at an arbitrary fraction: the temple column site measured
 * 0.13 and the courtyard limestone 0.25, and both are shadow edges rather than ramp bands.
 *
 * The frame is display-referred and AgX compresses the highlight end, which biases a true 0.5
 * slightly UP; so the acceptance window is deliberately loose on the high side. */
function midFraction(Lsh, Lmid, Llight) {
  if ([Lsh, Lmid, Llight].some(isNaN)) return NaN;
  const d = Llight - Lsh;
  return Math.abs(d) < 1e-6 ? NaN : (Lmid - Lsh) / d;
}

/* ---- box mode: the spatial profile across one compact surface ----
 *
 * The pooled and per-mesh step tests above share a weakness worth stating: a merged bucket holds
 * many faces at many orientations, so "luma rises at ndl 0.52" can still be a fact about WHICH
 * face you land on rather than about the ramp. Restricting to one small box on one mesh removes
 * that — the pixels are one surface, one material, one neighbourhood of AO and haze — and then
 * the profile along the axis that ndl actually varies on is the picture the eye would see. */
const BOX = opt('box', '');
if (BOX) {
  const [bx0, by0, bx1, by1] = BOX.split(',').map(Number);
  const meshHist = new Map();
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const q = y * W + x; if (gM[q] < 0) continue;
    meshHist.set(gM[q], (meshHist.get(gM[q]) || 0) + 1);
  }
  const domMesh = [...meshHist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  console.log(`\n=== box (${bx0},${by0})-(${bx1},${by1})  dominant mesh ${meshNames[domMesh]} (${meshHist.get(domMesh)} px)`);
  {
    /* Name the site in world space. A pixel box is not a surface anyone else can find; the
       world position and the distance from the shot camera are what make it citable. */
    const wp = [], dd = [];
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const q = y * W + x; if (gM[q] !== domMesh) continue;
      wp.push([gP[q * 3], gP[q * 3 + 1], gP[q * 3 + 2]]);
    }
    if (wp.length) {
      const c = [0, 1, 2].map((k) => med(wp.map((p) => p[k])));
      const dist = Math.hypot(c[0] - cam.position.x, c[1] - cam.position.y, c[2] - cam.position.z);
      console.log(`  world ≈ (${c[0].toFixed(1)}, ${c[1].toFixed(1)}, ${c[2].toFixed(1)})   ${dist.toFixed(1)} m from the shot camera`);
    }
  }

  /* Which screen axis does ndl vary along? Pick the one with the larger spread of column/row
     medians, so the profile is taken across the terminator rather than along it. */
  const colN = [], rowN = [];
  for (let x = bx0; x <= bx1; x++) { const a = []; for (let y = by0; y <= by1; y++) { const q = y * W + x; if (gM[q] === domMesh) a.push(ndlAt(q)); } colN.push(med(a)); }
  for (let y = by0; y <= by1; y++) { const a = []; for (let x = bx0; x <= bx1; x++) { const q = y * W + x; if (gM[q] === domMesh) a.push(ndlAt(q)); } rowN.push(med(a)); }
  const spread = (a) => { const f = a.filter((v) => !isNaN(v)); return f.length ? Math.max(...f) - Math.min(...f) : 0; };
  const byCol = spread(colN) >= spread(rowN);
  console.log(`  ndl spread across columns ${spread(colN).toFixed(3)}, across rows ${spread(rowN).toFixed(3)} → profile along ${byCol ? 'X (columns)' : 'Y (rows)'}`);

  console.log(`\n   ${byCol ? 'x' : 'y'}    n   ndl    medL   IQR   band`);
  const outer = byCol ? [bx0, bx1] : [by0, by1];
  for (let i = outer[0]; i <= outer[1]; i++) {
    const nd = [], lm = [];
    const inner = byCol ? [by0, by1] : [bx0, bx1];
    for (let j = inner[0]; j <= inner[1]; j++) {
      const q = byCol ? j * W + i : i * W + j;
      if (gM[q] !== domMesh || lit8[q] === 2) continue;
      const lum = lumaOf(q * img.ch);
      if (lum < INK) continue;
      nd.push(ndlAt(q)); lm.push(lum);
    }
    if (nd.length < 3) continue;
    const d = med(nd);
    console.log(`  ${String(i).padStart(4)} ${String(nd.length).padStart(4)}  ${d.toFixed(3)}  ${med(lm).toFixed(1).padStart(6)}  ${iqr(lm).toFixed(1).padStart(5)}   ${d < TERM_LO ? 'shadow' : d < TERM_HI ? 'MID' : 'light'}`);
  }

  const bb = Array.from({ length: NB }, () => []);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const q = y * W + x;
    if (gM[q] !== domMesh || lit8[q] !== 1) continue;
    const lum = lumaOf(q * img.ch); if (lum < INK) continue;
    bb[Math.min(NB - 1, Math.floor(ndlAt(q) * NB))].push(lum);
  }
  stepTest(bb, `box on ${meshNames[domMesh]}`);

  /* ---- the discriminator, in one number per interval ----
   *
   * dL/d(ndl) measured INSIDE each band and ACROSS each terminator, from the same profile.
   * A smooth ramp has one slope everywhere, so every ratio is ~1. A quantiser is flat inside a
   * band and near-vertical at the terminator. This is scale-free: exposure, grade and albedo
   * shift luma but cannot manufacture a slope ratio, which is why it is the headline number
   * rather than the raw step height the critic (correctly) found unconvincing on its own. */
  const prof = [];
  const outer2 = byCol ? [bx0, bx1] : [by0, by1];
  for (let i = outer2[0]; i <= outer2[1]; i++) {
    const nd = [], lm = [];
    const inner = byCol ? [by0, by1] : [bx0, bx1];
    for (let j = inner[0]; j <= inner[1]; j++) {
      const q = byCol ? j * W + i : i * W + j;
      if (gM[q] !== domMesh || lit8[q] === 2) continue;
      const lum = lumaOf(q * img.ch); if (lum < INK) continue;
      nd.push(ndlAt(q)); lm.push(lum);
    }
    if (nd.length >= 3) prof.push({ i, ndl: med(nd), L: med(lm) });
  }
  /* Matched-width intervals, NOT a regression.
   *
   * Least squares on (ndl, L) blows up exactly where this profile is most informative: inside a
   * band the ndl range collapses toward zero, so dividing by its variance reports a huge slope
   * from a 3-luma wiggle. The honest comparison is |ΔL| over intervals of the SAME ndl width —
   * one straddling a terminator, one lying wholly inside a band. Same width, same surface, same
   * material: if the ramp is smooth those two numbers match, and if it is quantised they do not. */
  const at = (target) => {
    let best = null, bd = 1e9;
    for (const p of prof) { const d = Math.abs(p.ndl - target); if (d < bd) { bd = d; best = p; } }
    return bd < 0.05 ? best : null;
  };
  const interval = (a, b, label) => {
    const pa = at(a), pb = at(b);
    if (!pa || !pb) return null;
    const dn = Math.abs(pb.ndl - pa.ndl);
    if (dn < 0.02) return null;
    return { label, a: pa, b: pb, dn, dL: pb.L - pa.L };
  };
  const W2 = 0.19;                       // interval width: wide enough to straddle a terminator
  const rows = [
    interval(TERM_HI + W2 / 2, TERM_HI + W2 * 1.5, `inside light band`),
    interval(TERM_HI + W2 / 2, TERM_HI - W2 / 2, `ACROSS T=${TERM_HI.toFixed(2)}`),
    interval(TERM_HI - W2 / 2, TERM_LO + 0.10, `inside MID band`),
    interval(TERM_LO + 0.10, Math.max(0.02, TERM_LO - 0.07), `ACROSS T=${TERM_LO.toFixed(2)}`),
  ].filter(Boolean);
  console.log(`\n--- matched-width ndl intervals on the profile above ---`);
  let inband = [], across = [];
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(22)} ndl ${r.a.ndl.toFixed(3)} → ${r.b.ndl.toFixed(3)} (Δ${r.dn.toFixed(3)})   ` +
      `L ${r.a.L.toFixed(1)} → ${r.b.L.toFixed(1)}   |ΔL| ${Math.abs(r.dL).toFixed(1)}   per unit ndl ${(Math.abs(r.dL) / r.dn).toFixed(0)}`);
    (r.label.startsWith('ACROSS') ? across : inband).push(Math.abs(r.dL) / r.dn);
  }
  if (inband.length && across.length) {
    const mi = inband.reduce((a, b) => a + b, 0) / inband.length;
    const ma = across.reduce((a, b) => a + b, 0) / across.length;
    console.log(`  → in-band mean ${mi.toFixed(0)} L/ndl, across-terminator mean ${ma.toFixed(0)} L/ndl, ` +
      `RATIO ${(ma / Math.max(1e-6, mi)).toFixed(1)}×   (a smooth ramp gives ~1×)`);
  }
}

/* ---- scan mode: apply all three tests to every candidate site, one level build ----
 *
 * The verdict wanted is "does any surface in this frame demonstrate the triple", so the scan has
 * to be exhaustive rather than a site I picked by eye — picking by eye is how the earlier
 * false positives got promoted. Each component is scored on:
 *   ratio  — |ΔL| per unit ndl across a terminator vs inside a band, matched widths (~1 = smooth)
 *   midf   — where the middle tone sits between shadow and light (0.5 = the quantiser's level)
 *   sep    — band separation against within-band texture IQR (<1 = buried in the noise)
 * A site passes only if all three do. */
if (argv.includes('--scan') || process.argv.includes('--scan')) {
  console.log(`\n=== SCAN: every contiguous multi-band site, all three tests ===`);
  console.log(`  pass = ratio ≥ 3, midf in [0.35,0.75], both seps ≥ 1.0`);
  const rowsOut = [];
  for (const c of comps) {
    if (c.spanned < 3) continue;
    const wpx = [];
    const colN = [], rowN = [];
    for (let x = c.x0; x <= c.x1; x++) { const a = []; for (let y = c.y0; y <= c.y1; y++) { const q = y * W + x; if (gM[q] === c.mesh) a.push(ndlAt(q)); } colN.push(med(a)); }
    for (let y = c.y0; y <= c.y1; y++) { const a = []; for (let x = c.x0; x <= c.x1; x++) { const q = y * W + x; if (gM[q] === c.mesh) a.push(ndlAt(q)); } rowN.push(med(a)); }
    const spread = (a) => { const f = a.filter((v) => !isNaN(v)); return f.length ? Math.max(...f) - Math.min(...f) : 0; };
    const byCol = spread(colN) >= spread(rowN);
    const prof = [];
    const outer = byCol ? [c.x0, c.x1] : [c.y0, c.y1];
    const inner = byCol ? [c.y0, c.y1] : [c.x0, c.x1];
    for (let i = outer[0]; i <= outer[1]; i++) {
      const nd = [], lm = [];
      for (let j = inner[0]; j <= inner[1]; j++) {
        const q = byCol ? j * W + i : i * W + j;
        if (gM[q] !== c.mesh || lit8[q] === 2) continue;
        const lum = lumaOf(q * img.ch); if (lum < INK) continue;
        nd.push(ndlAt(q)); lm.push(lum);
      }
      if (nd.length >= 3) { prof.push({ ndl: med(nd), L: med(lm) }); wpx.push(nd.length); }
    }
    if (prof.length < 6) continue;
    const at = (t) => { let b = null, bd = 1e9; for (const p of prof) { const d = Math.abs(p.ndl - t); if (d < bd) { bd = d; b = p; } } return bd < 0.05 ? b : null; };
    const iv = (a, b) => { const pa = at(a), pb = at(b); if (!pa || !pb) return null; const dn = Math.abs(pb.ndl - pa.ndl); return dn < 0.02 ? null : { dn, dL: Math.abs(pb.L - pa.L), r: Math.abs(pb.L - pa.L) / dn }; };
    const WD = 0.19;
    const inL = iv(TERM_HI + WD / 2, TERM_HI + WD * 1.5);
    const acH = iv(TERM_HI + WD / 2, TERM_HI - WD / 2);
    const inM = iv(TERM_HI - WD / 2, TERM_LO + 0.10);
    const acL = iv(TERM_LO + 0.10, Math.max(0.02, TERM_LO - 0.07));
    const ib = [inL, inM].filter(Boolean).map((r) => r.r);
    const ac = [acH, acL].filter(Boolean).map((r) => r.r);
    if (!ib.length || !ac.length) continue;
    const mi = ib.reduce((a, b) => a + b, 0) / ib.length, ma = ac.reduce((a, b) => a + b, 0) / ac.length;
    const ratio = ma / Math.max(1e-6, mi);
    const midf = midFraction(c.med[0], c.med[1], c.med[2]);
    const pass = ratio >= 3 && midf >= 0.35 && midf <= 0.75 && c.sepLoMid >= 1 && c.sepMidHi >= 1;
    let wx = 0, wy = 0, wz = 0, wn = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) { const q = y * W + x; if (gM[q] !== c.mesh) continue; wx += gP[q * 3]; wy += gP[q * 3 + 1]; wz += gP[q * 3 + 2]; wn++; }
    rowsOut.push({ pass, ratio, midf, c, w: [wx / wn, wy / wn, wz / wn], dist: Math.hypot(wx / wn - cam.position.x, wy / wn - cam.position.y, wz / wn - cam.position.z) });
  }
  rowsOut.sort((a, b) => (b.pass - a.pass) || (b.ratio - a.ratio));
  for (const r of rowsOut.slice(0, 12)) {
    console.log(`  ${r.pass ? 'PASS' : 'fail'}  ratio ${r.ratio.toFixed(1).padStart(5)}×  midf ${isNaN(r.midf) ? ' n/a' : r.midf.toFixed(2)}  ` +
      `sep ${r.c.sepLoMid.toFixed(1)}/${r.c.sepMidHi.toFixed(1)}  ${r.dist.toFixed(0)}m  ${meshNames[r.c.mesh]}`);
    console.log(`        box(${r.c.x0},${r.c.y0})-(${r.c.x1},${r.c.y1})  world (${r.w[0].toFixed(1)}, ${r.w[1].toFixed(1)}, ${r.w[2].toFixed(1)})`);
  }
  console.log(`  ${rowsOut.filter((r) => r.pass).length} of ${rowsOut.length} three-band sites pass all three tests`);
}

/* ---- optional visual: band map + lit mask ---- */
if (OUT) {
  const buf = Buffer.alloc(NPX * 3);
  for (let q = 0; q < NPX; q++) {
    let r = 12, g = 12, b = 18;
    if (gM[q] >= 0) {
      const nx = gN[q * 3], ny = gN[q * 3 + 1], nz = gN[q * 3 + 2];
      const ndl = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
      const band = ndl < TERM_LO ? 0 : ndl < TERM_HI ? 1 : 2;
      const shade = lit8[q] === 2 ? 0.28 : lit8[q] === 3 ? 0.6 : 1;
      const C = [[40, 50, 90], [150, 110, 80], [250, 220, 170]][band];
      r = C[0] * shade; g = C[1] * shade; b = C[2] * shade;
    }
    buf[q * 3] = r; buf[q * 3 + 1] = g; buf[q * 3 + 2] = b;
  }
  writePNG(`${OUT}-bands.png`, W, H, buf);
  console.log(`\nwrote ${OUT}-bands.png  (blue=shadow band, tan=mid, cream=light; darkened = cast shadow)`);
}

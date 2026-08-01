/* Where architecture's normals sit relative to the cel terminators.
 *
 * KNOWN_ISSUES §8 records a coincidence found in-page: whole flat face populations render a
 * flat mid-transition value because their single normal lands *on* a terminator rather than
 * inside a band (`temple` +Z walls ndl 0.15 vs terminator 0.14; `guard` +X walls 0.51 vs 0.52).
 * That finding is half SHADING's (where the terminators sit) and half mine (what normals the
 * geometry offers). This measures my half, and only my half.
 *
 * Area-weighted over architecture triangles that are inside the shot's frustum and front-facing
 * to it, ndl = max(0, n · keyDir) exactly as the shader's diffuse term computes it.
 *
 * **What this is NOT.** No shadows, no normal maps, no AO, no post. Every one of those moves a
 * pixel's final ndl, so the on-terminator figures here are an UPPER BOUND on what the geometry
 * alone can be blamed for — the same caveat the in-page measurement carries. Read it for the
 * *shape* of the distribution: a population spike is a geometry fact, its exact height is not.
 *
 *   node tools/ndl.mjs                 # every canonical shot
 *   node tools/ndl.mjs temple guard
 */
import * as THREE from 'three';
import { buildLevel } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';
import { readFileSync } from 'node:fs';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const W = 1280, H = 720;

/* SHADING's `TUNE` is module-private, and ToonMaterial.js is not mine to add an export to.
   Read the two terminator positions out of the source so this cannot silently drift from the
   shader the way a hardcoded pair would — and fail loudly rather than measure against a guess. */
const TERMS = (() => {
  const src = readFileSync(new URL('../src/render/ToonMaterial.js', import.meta.url), 'utf8');
  const grab = (k) => {
    const m = src.match(new RegExp(`\\b${k}\\s*:\\s*([0-9.]+)`));
    if (!m) throw new Error(`ndl.mjs: could not read ${k} from ToonMaterial.js — check the TUNE block`);
    return parseFloat(m[1]);
  };
  return [grab('termLo'), grab('termHi')];
})();
const WIN = 0.03;                       // "on the terminator" half-window, in ndl

const { A } = await buildLevel();
A.root.updateMatrixWorld(true);

/* ---- collect world-space triangles once ----
 *
 * Both the geometric face normal AND the three interpolated *shading* normals are kept. The
 * distinction is the whole point: a population's ndl spread can come from blocks being tilted
 * against each other, which steps value block-to-block and reads as blotching, or from normals
 * varying *inside* one primitive, which is the only thing a terminator can sweep across. The
 * first version of this tool measured only the population and could not tell those apart. */
const N = [];                           // per-mesh triangle packs, so memory stays typed
let triCount = 0;
{
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  const vn = new THREE.Vector3();
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  A.root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
    const count = idx ? idx.count : pos.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    const cap = (count / 3) * inst;
    const P = new Float32Array(cap * 3), F = new Float32Array(cap * 3);
    const V = new Float32Array(cap * 9), AR = new Float32Array(cap);
    let k = 0;
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); }
      else m.copy(o.matrixWorld);
      nm.getNormalMatrix(m);
      for (let i = 0; i < count; i += 3) {
        const ix = [idx ? idx.getX(i) : i, idx ? idx.getX(i + 1) : i + 1, idx ? idx.getX(i + 2) : i + 2];
        a.fromBufferAttribute(pos, ix[0]).applyMatrix4(m);
        b.fromBufferAttribute(pos, ix[1]).applyMatrix4(m);
        c.fromBufferAttribute(pos, ix[2]).applyMatrix4(m);
        ab.subVectors(b, a); ac.subVectors(c, a);
        fn.crossVectors(ab, ac);
        const len = fn.length();
        if (len < 1e-9) continue;
        P[k * 3] = (a.x + b.x + c.x) / 3; P[k * 3 + 1] = (a.y + b.y + c.y) / 3; P[k * 3 + 2] = (a.z + b.z + c.z) / 3;
        F[k * 3] = fn.x / len; F[k * 3 + 1] = fn.y / len; F[k * 3 + 2] = fn.z / len;
        for (let e = 0; e < 3; e++) {
          if (nor) vn.fromBufferAttribute(nor, ix[e]).applyMatrix3(nm).normalize();
          else vn.set(fn.x / len, fn.y / len, fn.z / len);
          V[k * 9 + e * 3] = vn.x; V[k * 9 + e * 3 + 1] = vn.y; V[k * 9 + e * 3 + 2] = vn.z;
        }
        AR[k] = len * 0.5;
        k++;
      }
    }
    if (k) { N.push({ P, F, V, AR, k, name: o.name }); triCount += k; }
  });
}
console.log(`architecture: ${triCount} triangles across ${N.length} meshes\n`);

const st = createAtmosphereState();
const names = only.length ? only : Object.keys(SHOTS);

for (const nm of names) {
  const S = SHOTS[nm];
  if (!S) { console.log(`unknown shot ${nm}`); continue; }

  evalAtmosphere(S.tod ?? 0.5, st);
  const L = st.keyDir.clone().normalize();

  const cam = new THREE.PerspectiveCamera(S.fov ?? 50, W / H, 0.1, 1200);
  cam.position.set(...(S.pos || [0, 2, 20]));
  cam.lookAt(new THREE.Vector3(...(S.target || [0, 2, 0])));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const eye = cam.position;

  let total = 0;
  const onTerm = new Float64Array(TERMS.length);
  const pop = new Map();                 // quantised face normal -> {area, ndl, n}
  const pt = new THREE.Vector3();
  /* Area whose SHADING normals vary enough inside one primitive for the ramp to band across
     it, and area where a band edge actually falls inside a primitive. */
  let smoothArea = 0, crossArea = 0;
  const bySrc = new Map();               // mesh name -> {area, cross}

  for (const M of N) {
    for (let i = 0; i < M.k; i++) {
      const cx = M.P[i * 3], cy = M.P[i * 3 + 1], cz = M.P[i * 3 + 2];
      const nx = M.F[i * 3], ny = M.F[i * 3 + 1], nz = M.F[i * 3 + 2];
      // front-facing to this camera only — a backface is never shaded on screen
      if (nx * (cx - eye.x) + ny * (cy - eye.y) + nz * (cz - eye.z) >= 0) continue;
      if (!frustum.containsPoint(pt.set(cx, cy, cz))) continue;

      /* Weight by PROJECTED area, not world area.
       *
       * Weighting by m² was the first version and it was wrong in the way that matters: the
       * background pyramids are ~105 m objects at 150-250 m, so they carried 32-80% of "area"
       * and topped every ranking, while the columns the terminator is supposed to read on
       * carried 1-2%. Screen coverage falls with 1/d², and a diagnostic that ignores that
       * invents its own answer. Solid angle ≈ area · |n·v| / d²; occlusion is still not
       * modelled, so a wall hidden behind another wall is counted. */
      const dx = cx - eye.x, dy = cy - eye.y, dz = cz - eye.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(d2) || 1e-6;
      const cosv = Math.abs((nx * dx + ny * dy + nz * dz) / dist);
      const area = M.AR[i] * cosv / Math.max(1e-6, d2);
      const ndl = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
      total += area;
      for (let k = 0; k < TERMS.length; k++) if (Math.abs(ndl - TERMS[k]) <= WIN) onTerm[k] += area;

      /* within-primitive shading-normal range */
      let lo = 9, hi = -9;
      for (let e = 0; e < 3; e++) {
        const d = Math.max(0, M.V[i * 9 + e * 3] * L.x + M.V[i * 9 + e * 3 + 1] * L.y + M.V[i * 9 + e * 3 + 2] * L.z);
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      if (hi - lo > 0.02) smoothArea += area;
      let crossed = false;
      for (const T of TERMS) if (lo < T && hi > T) crossed = true;
      if (crossed) crossArea += area;

      const b = bySrc.get(M.name) || { area: 0, cross: 0 };
      b.area += area; if (crossed) b.cross += area;
      bySrc.set(M.name, b);

      const key = `${Math.round(nx * 8)},${Math.round(ny * 8)},${Math.round(nz * 8)}`;
      const p = pop.get(key) || { area: 0, sum: 0, n: 0, min: 9, max: -9 };
      p.area += area; p.sum += ndl * area; p.n++;
      p.min = Math.min(p.min, ndl); p.max = Math.max(p.max, ndl);
      pop.set(key, p);
    }
  }

  if (total <= 0) { console.log(`=== ${nm}: no architecture in frustum\n`); continue; }

  const pct = (x) => `${(100 * x / total).toFixed(2)}%`;
  console.log(`=== ${nm}   key (${L.x.toFixed(3)}, ${L.y.toFixed(3)}, ${L.z.toFixed(3)})   ` +
    `visible arch, projected-area weighted`);
  console.log(`    on a terminator (±${WIN}):  lo ${TERMS[0]} → ${pct(onTerm[0])}    hi ${TERMS[1]} → ${pct(onTerm[1])}` +
    `    combined ${pct(onTerm[0] + onTerm[1])}`);
  console.log(`    smooth-shaded area (normals vary inside one triangle): ${pct(smoothArea)}` +
    `    band edge falls INSIDE a triangle: ${pct(crossArea)}`);
  /* Two different questions, and conflating them hid the answer. `frame%` is how much of the
     shot a mesh's band edges cover — dominated by whatever is simply biggest. `own%` is what
     fraction of that mesh's OWN visible area carries a band edge inside a primitive, which is
     the efficiency of the smoothing spent on it and the number worth acting on. */
  const srcs = [...bySrc.entries()].filter(([, b]) => b.area > total * 0.002)
    .sort((a, b) => (b[1].cross / b[1].area) - (a[1].cross / a[1].area)).slice(0, 7);
  if (srcs.length) {
    console.log('      band edge inside a primitive, by mesh — own% (frame%):');
    for (const [n, b] of srcs) {
      console.log(`        ${(100 * b.cross / b.area).toFixed(1).padStart(5)}%  (${pct(b.cross).padStart(7)})  ` +
        `${pct(b.area).padStart(7)} of frame   ${n}`);
    }
  }

  /* The populations that matter: biggest single-normal clusters and where they sit. */
  const top = [...pop.entries()].sort((a, b) => b[1].area - a[1].area).slice(0, 6);
  for (const [k, p] of top) {
    const mean = p.sum / p.area;
    let flag = '';
    for (const T of TERMS) if (Math.abs(mean - T) <= WIN) flag = `  ← ON TERMINATOR ${T} (Δ${(mean - T).toFixed(3)})`;
    const spread = p.max - p.min;
    console.log(`    ${pct(p.area).padStart(7)} area  n=${String(p.n).padStart(5)}  normal[${k}]  ` +
      `ndl ${mean.toFixed(3)}  spread ${spread.toFixed(3)}${flag}`);
  }
  console.log();
}

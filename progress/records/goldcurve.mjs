/**
 * goldcurve — is CURVATURE available on gilded architecture, and what would it buy?
 *
 * §121.9 handed ARCHITECTURE two levers and asked which is real:
 *   (a) `gloss` in Architecture.RECIPES — widens the lobe. Sized already by TEXTURES.
 *   (b) curvature on gilded elements — gives the lobe somewhere guaranteed to land.
 *
 * This is the OFFLINE half, per the coordinator's method note: no lock, no capture. It is a
 * pure-geometry instrument — it reuses goldspec.mjs's stage 2 verbatim (same frustum test,
 * same back-face and key-facing filters, same area weighting, same azimuth-averaged
 * convolution) so its numbers are comparable to RESULT-goldspec.md's tables, and it is
 * validated against them before any new number is quoted.
 *
 * What it adds over goldspec stage 2:
 *   1. `ndhMax` and the area-weighted ndh DISTRIBUTION per shot, not just the in-lobe integral.
 *      This is the statistic that separates "flat and losing the lottery" from "curved".
 *   2. A per-element curvature classification: for each gilded mesh, how many distinct normal
 *      directions carry its area, and how much of it lies on a continuous sweep.
 *   3. A light-direction SWEEP. A flat surface's in-lobe area is a lottery on where the key is;
 *      a curved one's is not. Variance across key directions is the discriminator, and a
 *      single key direction (which is all goldspec used) structurally cannot see it.
 *
 * NOT modelled, same as goldspec stage 2: shadow map, occlusion by other geometry, character
 * and FX, mip filtering, the grade. Numbers are geometric AVAILABILITY, not visibility.
 *
 *   node goldcurve.mjs [--gloss 64,40,24,16] [--sigma 17] [--json out.json]
 */
import * as THREE from 'three';
import { buildLevel } from '/home/user/Demo/tools/lvl.mjs';
import { SHOTS } from '/home/user/Demo/src/core/Shots.js';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const GLOSSES = (opt('gloss', '64,40,24,16')).split(',').map(Number);
const SIGMA = parseFloat(opt('sigma', '17'));      // matches "as built" per RESULT-goldspec §4
const RG_FIELD = parseFloat(opt('rghfield', '0.608'));   // gild's shipped ORM roughness p50
const MATS = (opt('mats', 'arch:hieroglyph_gilded,arch:gold_leaf')).split(',');

/* Default key direction: goldspec's fallback, since no SHOT defines keyDir. Quoted so the
   comparison against RESULT-goldspec.md's table is like-for-like. */
const KEY0 = new THREE.Vector3(-0.899, 0.438, 0).normalize();

/* ------------------------------------------------------------------ build */
const { A, root } = await buildLevel();
const world = root || A.root; world.updateMatrixWorld(true);

/** Gilded triangles, tagged with the owning mesh so elements can be classified. */
const tris = [];      // {p0,p1,p2, owner}
{
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  world.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.userData?.slyOutline || o.userData?.isOutlineShell) return;
    if (!MATS.includes(o.material?.name || '')) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const cnt = idx ? idx.count : pos.count, inst = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    for (let ii = 0; ii < inst; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < cnt; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
        p0.fromBufferAttribute(pos, a).applyMatrix4(m);
        p1.fromBufferAttribute(pos, b).applyMatrix4(m);
        p2.fromBufferAttribute(pos, c).applyMatrix4(m);
        tris.push({ p0: p0.clone(), p1: p1.clone(), p2: p2.clone(), owner: o.name || '?' });
      }
    }
  });
}
console.log(`gilded triangles: ${tris.length}  materials: ${MATS.join(' ')}`);

/* ------------------------------------------- normal-slope convolution LUT */
const glossAt = (rgh, g) => Math.max(g * (1 - 0.6 * rgh), 4);
const PHI = 64;
function synth(sigma) {
  const out = []; let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
  for (let i = 0; i < 512; i++) {
    const u = Math.max(1e-9, rnd()), v = rnd();
    out.push(Math.abs(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)) * sigma);
  }
  return out.sort((a, b) => a - b);
}
function lut(samples, thresh) {
  const NT = 361, out = new Float64Array(NT);
  const cosphi = new Float64Array(PHI);
  for (let p = 0; p < PHI; p++) cosphi[p] = Math.cos(2 * Math.PI * p / PHI);
  for (let t = 0; t < NT; t++) {
    const th = t * 0.25 * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
    let hit = 0, tot = 0;
    for (const dDeg of samples) {
      const d = dDeg * Math.PI / 180, cd = Math.cos(d), sd = Math.sin(d);
      for (let p = 0; p < PHI; p++) { if (ct * cd + st * sd * cosphi[p] > thresh) hit++; tot++; }
    }
    out[t] = tot ? hit / tot : 0;
  }
  return out;
}
const SAMP = synth(SIGMA);
const LUTS = GLOSSES.map((g) => lut(SAMP, Math.pow(0.02, 1 / glossAt(RG_FIELD, g))));
const look = (L, thDeg) => L[Math.min(L.length - 1, Math.max(0, Math.round(thDeg / 0.25)))];

/* ------------------------------------------------------------- per-shot */
function camFor(s) {
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, 1280 / 720, 0.1, 900);
  cam.position.fromArray(s.pos); cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
}

const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), ctr = new THREE.Vector3();
const Vv = new THREE.Vector3(), Hh = new THREE.Vector3();

/** Core measurement for one camera + one key direction. */
function measure(cam, key, collectDist) {
  const fr = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const eye = cam.position;
  let aTot = 0, ndhMax = -1;
  const aG = new Array(GLOSSES.length).fill(0);
  const hist = new Float64Array(91);       // area by half-vector angle, 1 deg bins
  const byOwner = new Map();
  for (const t of tris) {
    ctr.copy(t.p0).add(t.p1).add(t.p2).multiplyScalar(1 / 3);
    if (!fr.containsPoint(ctr)) continue;
    e1.subVectors(t.p1, t.p0); e2.subVectors(t.p2, t.p0); nn.crossVectors(e1, e2);
    const area = nn.length() * 0.5; if (area < 1e-9) continue;
    nn.multiplyScalar(1 / (area * 2));
    Vv.subVectors(eye, ctr).normalize();
    if (nn.dot(Vv) < 0) continue;                     // back-facing
    Hh.copy(key).add(Vv).normalize();
    const ndh = nn.dot(Hh);
    aTot += area;
    if (ndh > ndhMax) ndhMax = ndh;
    const th = Math.acos(Math.min(1, Math.max(-1, ndh))) * 180 / Math.PI;
    if (collectDist) {
      hist[Math.min(90, Math.max(0, Math.round(th)))] += area;
      const o = byOwner.get(t.owner) || { area: 0, best: -1 };
      o.area += area; if (ndh > o.best) o.best = ndh;
      byOwner.set(t.owner, o);
    }
    if (nn.dot(key) > 0.14) {                          // key-facing, per goldspec
      for (let k = 0; k < GLOSSES.length; k++) aG[k] += area * look(LUTS[k], th);
    }
  }
  return { aTot, ndhMax, aG, hist, byOwner };
}

/* ---------------------------------------------------- 1. validation table */
console.log(`\n=== 1. VALIDATION vs RESULT-goldspec.md §4 (sigma ${SIGMA}, rgh ${RG_FIELD}) ===`);
console.log(`shot            area(m2)   ` + GLOSSES.map((g) => `gl${String(g).padStart(3)}`).join('   ') + '    ndhMax  thMin');
const rows = {};
for (const name of Object.keys(SHOTS)) {
  const r = measure(camFor(SHOTS[name]), KEY0, true);
  if (r.aTot <= 0) { console.log(`${name.padEnd(14)}   (no gilded area in frustum)`); continue; }
  rows[name] = r;
  const pct = r.aG.map((a) => `${(100 * a / r.aTot).toFixed(2)}%`.padStart(7));
  const thMin = Math.acos(Math.min(1, r.ndhMax)) * 180 / Math.PI;
  console.log(`${name.padEnd(14)} ${r.aTot.toFixed(1).padStart(8)}   ${pct.join(' ')}   ${r.ndhMax.toFixed(4)}  ${thMin.toFixed(1)}°`);
}

/* --------------------------------------- 2. is the gilded geometry flat? */
console.log(`\n=== 2. CURVATURE CENSUS — distinct normal directions carrying gilded area ===`);
{
  // Global: cluster all gilded triangle normals at 5 deg resolution, area-weighted.
  const cells = new Map();
  let tot = 0;
  const byOwnerN = new Map();
  for (const t of tris) {
    e1.subVectors(t.p1, t.p0); e2.subVectors(t.p2, t.p0); nn.crossVectors(e1, e2);
    const area = nn.length() * 0.5; if (area < 1e-9) continue;
    nn.multiplyScalar(1 / (area * 2));
    tot += area;
    const key = `${Math.round(nn.x * 12)},${Math.round(nn.y * 12)},${Math.round(nn.z * 12)}`;
    cells.set(key, (cells.get(key) || 0) + area);
    const o = byOwnerN.get(t.owner) || { area: 0, cells: new Map() };
    o.area += area; o.cells.set(key, (o.cells.get(key) || 0) + area);
    byOwnerN.set(t.owner, o);
  }
  const sorted = [...cells.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`total gilded area ${tot.toFixed(1)} m2 across ${cells.size} normal cells (~5 deg bins)`);
  let cum = 0; let n50 = 0, n90 = 0;
  for (const [, a] of sorted) { cum += a; if (!n50 && cum >= 0.5 * tot) n50 = 1 + sorted.indexOf(sorted.find((x) => x[1] === a)); }
  cum = 0; let i = 0;
  for (const [, a] of sorted) { cum += a; i++; if (cum >= 0.5 * tot) { n50 = i; break; } }
  cum = 0; i = 0;
  for (const [, a] of sorted) { cum += a; i++; if (cum >= 0.9 * tot) { n90 = i; break; } }
  console.log(`  cells holding 50% of area: ${n50}     90% of area: ${n90}`);
  console.log(`  top 6 normal cells: ` + sorted.slice(0, 6).map(([k, a]) => `${k}=${(100 * a / tot).toFixed(1)}%`).join('  '));
  console.log(`\n  per-element (area-weighted, >2 m2):`);
  const els = [...byOwnerN.entries()].filter(([, o]) => o.area > 2).sort((a, b) => b[1].area - a[1].area);
  for (const [nm, o] of els.slice(0, 18)) {
    const c = [...o.cells.values()].sort((x, y) => y - x);
    let cc = 0, k50 = 0;
    for (const a of c) { cc += a; k50++; if (cc >= 0.5 * o.area) break; }
    console.log(`    ${nm.padEnd(34)} ${o.area.toFixed(1).padStart(7)} m2   cells ${String(o.cells.size).padStart(4)}   50%-in ${k50}`);
  }
}

/* ------------------------------------- 3. the light-direction lottery test */
console.log(`\n=== 3. LIGHT SWEEP — flat surfaces win/lose a lottery, curved ones do not ===`);
console.log(`(in-lobe % of gilded area at gloss 64, key azimuth swept 0..350 deg at 40 deg elevation)`);
{
  const probe = ['hero', 'sly-key', 'courtyard', 'night'].filter((n) => SHOTS[n]);
  for (const name of probe) {
    const cam = camFor(SHOTS[name]);
    const vals = [];
    for (let az = 0; az < 360; az += 30) {
      const a = az * Math.PI / 180, el = 40 * Math.PI / 180;
      const key = new THREE.Vector3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)).normalize();
      const r = measure(cam, key, false);
      vals.push(r.aTot > 0 ? 100 * r.aG[0] / r.aTot : 0);
    }
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length);
    const zero = vals.filter((v) => v < 0.5).length;
    console.log(`  ${name.padEnd(11)} mean ${mean.toFixed(2)}%  sd ${sd.toFixed(2)}  min ${Math.min(...vals).toFixed(2)}%  max ${Math.max(...vals).toFixed(2)}%  <0.5%: ${zero}/12`);
    console.log(`     ${vals.map((v) => v.toFixed(1).padStart(5)).join('')}`);
  }
}

if (opt('json', '')) {
  fs.writeFileSync(opt('json'), JSON.stringify({ GLOSSES, SIGMA, RG_FIELD, rows: Object.fromEntries(
    Object.entries(rows).map(([k, r]) => [k, { aTot: r.aTot, ndhMax: r.ndhMax, aG: r.aG, hist: [...r.hist] }])) }, null, 2));
}

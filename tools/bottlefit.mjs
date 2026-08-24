#!/usr/bin/env node
/**
 * bottlefit.mjs — does the clue bottle FIT where it was put?
 *
 * Written for §701 ("scale the bottles to be 3 times larger"). Twelve placements were tuned
 * around one silhouette; a bottle that grows sinks into whatever it stands over and pokes
 * through whatever stands above it, and neither failure announces itself — the bottle still
 * bobs, still collects, still passes R1/R2/R3, and the only symptom is a picture nobody took.
 * A screenshot of one bottle cannot find this: it is a per-placement question and there are
 * twelve placements.
 *
 * ── What it measures, and why it is triangles rather than rays ────────────────────────────
 * `camdot.mjs` answers "is a camera inside something" by casting 26 rays and reading the nearest
 * hit. That instrument is wrong for THIS question in a way that is easy to miss: `Raycaster`
 * honours `material.side`, so a ray fired from inside a `FrontSide` wall passes straight out
 * through its own back face and reports a clean, reassuring distance. A bottle buried in masonry
 * would measure as a bottle standing in open air.
 *
 * So this is an exact surface test instead. The bottle's own 272 triangles, posed, are tested
 * against the world's triangles with a separating-axis test — no ray, no side, no culling. Two
 * numbers come out per placement:
 *
 *   CROSS      does any bottle triangle actually intersect a world triangle. This is the defect.
 *   CLEARANCE  if not, how close it comes — min distance from a bottle vertex to a world
 *              triangle. A bottle at 0.004 m has not failed and is one edit away from failing.
 *
 * The world is the DRAWN scene (`camdot.drawnScene()`, props booted), not the collider set:
 * interpenetration is a thing you SEE, and plenty of what you see has no collider. The bottle's
 * own two meshes are excluded, or every bottle would be found intersecting itself.
 *
 * ── The pose envelope, not the rest pose ──────────────────────────────────────────────────
 * A bottle in this game is never at its authored spot. `Pickups.update` bobs it ±`clueBob`,
 * sways it ±`clueSway` and rocks it ±`clueRock` about Z, and sway and rock are driven by the
 * SAME `swing` term, so they are perfectly correlated and the extremes are s = ±1. Testing the
 * rest pose would be testing a pose the player never sees. Nine poses are tested — swing
 * {-1,0,+1} x bob {-1,0,+1} — and the worst of the nine is reported with the pose named. The
 * spin about Y is a full turn per cycle, so yaw is sampled too rather than assumed harmless.
 *
 *   node tools/bottlefit.mjs              the shipped h and 3x it
 *   node tools/bottlefit.mjs 0.42 1.26    an explicit list of h values
 *   YAWS=8 PAD=1.0 node tools/bottlefit.mjs
 */
import * as THREE from 'three';
import { drawnScene } from './camdot.mjs';
import { clueBottle, mergeAll, CLUE_ATTRS, CLUE_HEIGHT_RATIO } from '../src/world/PropKit.js';
import { TUNE } from '../src/world/Pickups.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const YAWS = +(process.env.YAWS || 6);
const PAD = +(process.env.PAD || 0.60);       // how far out a clearance is still worth reporting

/* The twelve, scraped from `Props._clueBottles()` rather than copied — `cluevault.test.mjs`'s
   own rule: a hand-copied fixture measures a layout nobody plays the moment PROPS moves one. */
const SPOTS = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/world/Props.js'), 'utf8');
  const body = /_clueBottles\(\)\s*\{[\s\S]*?const spots = \[([\s\S]*?)\n\s*\];/.exec(src);
  if (!body) throw new Error('could not scrape the clue spots from Props._clueBottles()');
  const out = [];
  const re = /\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(body[1]))) out.push([+m[1], +m[2], +m[3]]);
  return out;
})();

/* Names on the placements, so the report is actionable. Index-aligned with SPOTS and asserted
   to be, so a spot added without a label fails loudly instead of printing `undefined`. */
const LABELS = [
  'terrace stage 1', 'terrace stage 2', 'obelisk kiosk lintel', 'peristyle SE architrave',
  'pylon ladder rung 5', 'east pylon deck', 'hall front cornice', 'west aisle roof',
  'nave deck', 'inner pylon south stage', 'pylon summit deck', 'tomb vault floor',
];

/* ======================= primitives, allocation-free ======================= */

/** Separating-axis test, two triangles as flat 9-arrays. 2 face normals + 9 edge crosses. */
const _ax = new Float64Array(3);
function sat(A, ao, B, bo) {
  for (let pass = 0; pass < 11; pass++) {
    let x, y, z;
    if (pass < 2) {
      const T = pass === 0 ? A : B, o = pass === 0 ? ao : bo;
      const e0x = T[o + 3] - T[o], e0y = T[o + 4] - T[o + 1], e0z = T[o + 5] - T[o + 2];
      const e1x = T[o + 6] - T[o], e1y = T[o + 7] - T[o + 1], e1z = T[o + 8] - T[o + 2];
      x = e0y * e1z - e0z * e1y; y = e0z * e1x - e0x * e1z; z = e0x * e1y - e0y * e1x;
    } else {
      const i = (pass - 2) / 3 | 0, j = (pass - 2) % 3;
      const ai = ao + i * 3, aj = ao + ((i + 1) % 3) * 3;
      const bi = bo + j * 3, bj = bo + ((j + 1) % 3) * 3;
      const ex = A[aj] - A[ai], ey = A[aj + 1] - A[ai + 1], ez = A[aj + 2] - A[ai + 2];
      const fx = B[bj] - B[bi], fy = B[bj + 1] - B[bi + 1], fz = B[bj + 2] - B[bi + 2];
      x = ey * fz - ez * fy; y = ez * fx - ex * fz; z = ex * fy - ey * fx;
    }
    if (x * x + y * y + z * z < 1e-14) continue;   // degenerate axis, carries no information
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      const da = A[ao + k] * x + A[ao + k + 1] * y + A[ao + k + 2] * z;
      if (da < amin) amin = da; if (da > amax) amax = da;
      const db = B[bo + k] * x + B[bo + k + 1] * y + B[bo + k + 2] * z;
      if (db < bmin) bmin = db; if (db > bmax) bmax = db;
    }
    if (amax < bmin - 1e-9 || bmax < amin - 1e-9) return false;
  }
  return true;
}

/** Squared distance from a point to a triangle (Ericson), flat and allocation-free. */
function pointTri2(px, py, pz, T, o) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2];
  const abx = T[o + 3] - ax, aby = T[o + 4] - ay, abz = T[o + 5] - az;
  const acx = T[o + 6] - ax, acy = T[o + 7] - ay, acz = T[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - T[o + 3], bpy = py - T[o + 4], bpz = pz - T[o + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + abx * v - px, qy = ay + aby * v - py, qz = az + abz * v - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const cpx = px - T[o + 6], cpy = py - T[o + 7], cpz = pz - T[o + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + acx * w - px, qy = ay + acy * w - py, qz = az + acz * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = T[o + 3] + (T[o + 6] - T[o + 3]) * w - px;
    const qy = T[o + 4] + (T[o + 7] - T[o + 4]) * w - py;
    const qz = T[o + 5] + (T[o + 8] - T[o + 5]) * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  const qx = ax + abx * v + acx * w - px, qy = ay + aby * v + acy * w - py, qz = az + abz * v + acz * w - pz;
  return qx * qx + qy * qy + qz * qz;
}

/* ======================= the world, as triangles ======================= */

const CELL = 2.0;
const key = (i, j, k) => `${i},${j},${k}`;

export async function worldSoup() {
  const { meshes } = await drawnScene();
  const skip = new Set(['pickup_clues', 'clue_bottles']);
  const T = [], owner = [], names = [];
  const v = new THREE.Vector3(), mw = new THREE.Matrix4(), im = new THREE.Matrix4();
  let skipped = 0;
  for (const m of meshes) {
    if (skip.has(m.name)) { skipped++; continue; }
    const pos = m.geometry?.attributes?.position;
    if (!pos) continue;
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    const nameId = names.push(m.name || m.type) - 1;
    /* An InstancedMesh carries one geometry and N matrices; reading `matrixWorld` alone would
       stack every instance of a set at the origin — a silent way to measure nothing. */
    const count = m.isInstancedMesh ? m.count : 1;
    for (let inst = 0; inst < count; inst++) {
      if (m.isInstancedMesh) { m.getMatrixAt(inst, im); mw.multiplyMatrices(m.matrixWorld, im); }
      else mw.copy(m.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(i + k) : i + k;
          v.fromBufferAttribute(pos, vi).applyMatrix4(mw);
          T.push(v.x, v.y, v.z);
        }
        owner.push(nameId);
      }
    }
  }
  const tris = Float64Array.from(T);
  /* Spatial hash over every cell a triangle's AABB touches, so a long wall triangle is found
     from any cell it crosses rather than only the one its first vertex lands in. */
  const grid = new Map();
  const spill = [];
  for (let t = 0; t < owner.length; t++) {
    const o = t * 9;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      if (tris[o + k] < x0) x0 = tris[o + k]; if (tris[o + k] > x1) x1 = tris[o + k];
      if (tris[o + k + 1] < y0) y0 = tris[o + k + 1]; if (tris[o + k + 1] > y1) y1 = tris[o + k + 1];
      if (tris[o + k + 2] < z0) z0 = tris[o + k + 2]; if (tris[o + k + 2] > z1) z1 = tris[o + k + 2];
    }
    const span = ((x1 - x0) / CELL + 1) * ((y1 - y0) / CELL + 1) * ((z1 - z0) / CELL + 1);
    /* A triangle spanning a huge box (the terrain skirt, the sky dome) would land in thousands
       of cells. Those go on a spill list tested against every query instead. */
    if (span > 512) { spill.push(t); continue; }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++)
        for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
          const q = key(i, j, k);
          const a = grid.get(q); if (a) a.push(t); else grid.set(q, [t]);
        }
  }
  return { tris, owner, names, grid, spill, meshCount: meshes.length, skipped, triCount: owner.length };
}

/** Every candidate triangle near a box, deduped. Gathered ONCE per bottle, not per pose. */
function candidates(W, box, pad) {
  const seen = new Set();
  for (const t of W.spill) seen.add(t);
  for (let i = Math.floor((box.min.x - pad) / CELL); i <= Math.floor((box.max.x + pad) / CELL); i++)
    for (let j = Math.floor((box.min.y - pad) / CELL); j <= Math.floor((box.max.y + pad) / CELL); j++)
      for (let k = Math.floor((box.min.z - pad) / CELL); k <= Math.floor((box.max.z + pad) / CELL); k++) {
        const a = W.grid.get(key(i, j, k)); if (a) for (const t of a) seen.add(t);
      }
  /* Trim to the ones whose own AABB is actually within `pad` of the box — the spill list and a
     2 m cell both over-deliver, and this is the difference between 400 candidates and 40,000. */
  const out = [];
  for (const t of seen) {
    const o = t * 9;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      if (W.tris[o + k] < x0) x0 = W.tris[o + k]; if (W.tris[o + k] > x1) x1 = W.tris[o + k];
      if (W.tris[o + k + 1] < y0) y0 = W.tris[o + k + 1]; if (W.tris[o + k + 1] > y1) y1 = W.tris[o + k + 1];
      if (W.tris[o + k + 2] < z0) z0 = W.tris[o + k + 2]; if (W.tris[o + k + 2] > z1) z1 = W.tris[o + k + 2];
    }
    if (x1 < box.min.x - pad || x0 > box.max.x + pad) continue;
    if (y1 < box.min.y - pad || y0 > box.max.y + pad) continue;
    if (z1 < box.min.z - pad || z0 > box.max.z + pad) continue;
    out.push(t, x0, y0, z0, x1, y1, z1);
  }
  return out;   // flat: [triIndex, x0,y0,z0, x1,y1,z1] * n
}

/* ======================= the bottle, posed ======================= */

function bottleGeom(h) {
  const parts = [];
  clueBottle({ h }).drain((_k, g) => parts.push(g));
  const geo = mergeAll(parts, CLUE_ATTRS);
  const pos = geo.attributes.position, idx = geo.index;
  const verts = new Float64Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { verts[i * 3] = pos.getX(i); verts[i * 3 + 1] = pos.getY(i); verts[i * 3 + 2] = pos.getZ(i); }
  const index = Uint32Array.from({ length: idx.count }, (_, i) => idx.getX(i));
  geo.computeBoundingBox();
  return { verts, index, bbox: geo.boundingBox.clone(), triCount: idx.count / 3 };
}

/* The poses `Pickups.update` actually produces. `swing` drives sway and rock together, so they
   are one axis, not two; bob runs on its own rate and is independent. */
const SWINGS = [-1, 0, 1];
const BOBS = [-1, 0, 1];

/* ======================= the run ======================= */

async function run(hs) {
  process.stdout.write('· booting the drawn level (props included)\n');
  const t0 = Date.now();
  const W = await worldSoup();
  process.stdout.write(`· world: ${W.meshCount} drawn meshes → ${W.triCount.toLocaleString()} world triangles ` +
    `(${W.skipped} clue-bottle mesh(es) excluded, ${W.spill.length} oversize on the spill list)  ` +
    `${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  if (SPOTS.length !== LABELS.length) throw new Error(`${SPOTS.length} spots against ${LABELS.length} labels — relabel`);

  const results = {};
  for (const h of hs) {
    const B = bottleGeom(h);
    const height = B.bbox.max.y - B.bbox.min.y;
    const halfW = Math.max(B.bbox.max.x, -B.bbox.min.x, B.bbox.max.z, -B.bbox.min.z);
    /* The bottle's reach once rocked: the top corner swings out by sin(rock) * height. */
    const reach = halfW * Math.cos(TUNE.clueRock) + height * Math.sin(TUNE.clueRock) + TUNE.clueSway;
    process.stdout.write(`\n${'='.repeat(100)}\n  h = ${h}   HEIGHT ${height.toFixed(5)} m (h x ${CLUE_HEIGHT_RATIO})` +
      `   half-width ${halfW.toFixed(4)} m   base y ${B.bbox.min.y.toFixed(6)}   ${B.triCount} tris\n` +
      `  pose envelope: bob ±${TUNE.clueBob}  sway ±${TUNE.clueSway}  rock ±${(TUNE.clueRock * 180 / Math.PI).toFixed(1)}°` +
      `  → lateral reach ${reach.toFixed(3)} m, top of swing y+${(height * Math.cos(TUNE.clueRock) + TUNE.clueBob).toFixed(3)}\n` +
      `${'='.repeat(100)}\n`);

    const rows = [];
    const posed = new Float64Array(B.verts.length);
    const triA = new Float64Array(9);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();

    for (let si = 0; si < SPOTS.length; si++) {
      const spot = SPOTS[si];
      /* Candidates once per bottle, over the union of every pose — the envelope box. */
      const env = new THREE.Box3(
        new THREE.Vector3(spot[0] - reach, spot[1] - TUNE.clueBob, spot[2] - reach),
        new THREE.Vector3(spot[0] + reach, spot[1] + height + TUNE.clueBob, spot[2] + reach));
      const cand = candidates(W, env, PAD);
      let cross = null, minClear = Infinity, minWho = -1, minPose = '';

      for (const swing of SWINGS) {
        for (const bob of BOBS) {
          for (let yi = 0; yi < YAWS; yi++) {
            const yaw = (yi / YAWS) * Math.PI * 2;
            e.set(0, yaw, swing * TUNE.clueRock, 'ZYX');
            q.setFromEuler(e);
            p.set(spot[0] + swing * TUNE.clueSway, spot[1] + bob * TUNE.clueBob, spot[2]);
            M.compose(p, q, one);
            const m = M.elements;
            let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
            for (let i = 0; i < B.verts.length; i += 3) {
              const x = B.verts[i], y = B.verts[i + 1], z = B.verts[i + 2];
              const X = m[0] * x + m[4] * y + m[8] * z + m[12];
              const Y = m[1] * x + m[5] * y + m[9] * z + m[13];
              const Z = m[2] * x + m[6] * y + m[10] * z + m[14];
              posed[i] = X; posed[i + 1] = Y; posed[i + 2] = Z;
              if (X < bx0) bx0 = X; if (X > bx1) bx1 = X;
              if (Y < by0) by0 = Y; if (Y > by1) by1 = Y;
              if (Z < bz0) bz0 = Z; if (Z > bz1) bz1 = Z;
            }
            const poseName = `swing ${swing} bob ${bob} yaw ${Math.round(yaw * 180 / Math.PI)}°`;

            for (let c = 0; c < cand.length; c += 7) {
              const t = cand[c], cx0 = cand[c + 1], cy0 = cand[c + 2], cz0 = cand[c + 3];
              const cx1 = cand[c + 4], cy1 = cand[c + 5], cz1 = cand[c + 6];
              /* AABB gap in each axis; if the gap already exceeds the best clearance so far,
                 no vertex of this triangle can improve it and no triangle can cross it. */
              const gx = Math.max(0, Math.max(cx0 - bx1, bx0 - cx1));
              const gy = Math.max(0, Math.max(cy0 - by1, by0 - cy1));
              const gz = Math.max(0, Math.max(cz0 - bz1, bz0 - cz1));
              const gap2 = gx * gx + gy * gy + gz * gz;
              if (gap2 >= Math.min(minClear, PAD) ** 2) continue;
              const o = t * 9;
              /* clearance — vertices are enough and there are 190 of them, not 816 */
              for (let i = 0; i < posed.length; i += 3) {
                const d2 = pointTri2(posed[i], posed[i + 1], posed[i + 2], W.tris, o);
                if (d2 < minClear * minClear) { minClear = Math.sqrt(d2); minWho = W.owner[t]; minPose = poseName; }
              }
              /* crossing — the defect itself, only worth the 11 axes when they are this close */
              if (minClear < 0.25) {
                for (let f = 0; f < B.index.length && !cross; f += 3) {
                  for (let k = 0; k < 3; k++) {
                    const v = B.index[f + k] * 3;
                    triA[k * 3] = posed[v]; triA[k * 3 + 1] = posed[v + 1]; triA[k * 3 + 2] = posed[v + 2];
                  }
                  if (sat(triA, 0, W.tris, o)) cross = { who: W.names[W.owner[t]], pose: poseName };
                }
              }
              if (cross) break;
            }
            if (cross) break;
          }
          if (cross) break;
        }
        if (cross) break;
      }

      const who = minWho >= 0 ? W.names[minWho] : '';
      rows.push({ i: si, label: LABELS[si], spot, cross, clear: minClear, who, pose: minPose });
      const tag = cross
        ? `CROSSES  ${cross.who}`
        : (minClear === Infinity ? `clear  > ${PAD.toFixed(2)} m  (nothing that close)` : `clear  ${minClear.toFixed(3)} m  (${who})`);
      process.stdout.write(`  ${String(si).padStart(2)}  ${LABELS[si].padEnd(24)} ` +
        `(${spot.map((n) => n.toFixed(1)).join(', ').padEnd(21)})  ${tag}\n`);
      if (cross) process.stdout.write(`        └─ first crossing pose: ${cross.pose}\n`);
    }
    const bad = rows.filter((r) => r.cross);
    process.stdout.write(`\n  VERDICT h=${h}: ${bad.length ? `${bad.length}/12 INTERPENETRATE — ${bad.map((r) => r.i).join(', ')}` : '12/12 clear of world geometry'}\n`);
    results[h] = rows;
  }

  /* A side-by-side if more than one scale was run — the whole point is the delta. */
  const keys = Object.keys(results);
  if (keys.length > 1) {
    process.stdout.write(`\n${'='.repeat(100)}\n  PER-BOTTLE DELTA\n${'='.repeat(100)}\n`);
    process.stdout.write(`  ${'#'.padEnd(3)}${'placement'.padEnd(25)}${keys.map((k) => `h=${k}`.padEnd(28)).join('')}\n`);
    for (let i = 0; i < SPOTS.length; i++) {
      const cells = keys.map((k) => {
        const r = results[k][i];
        return (r.cross ? `CROSS ${r.cross.who}` : (r.clear === Infinity ? `>${PAD.toFixed(2)} m` : `${r.clear.toFixed(3)} m ${r.who}`)).slice(0, 27).padEnd(28);
      });
      process.stdout.write(`  ${String(i).padEnd(3)}${LABELS[i].padEnd(25)}${cells.join('')}\n`);
    }
  }
  return results;
}

export { SPOTS, LABELS, bottleGeom, candidates, pointTri2, sat, CELL };

/* ---- CLI. Guarded so the probes above can be imported without running a 12-bottle sweep. ---- */
if (process.argv[1] && process.argv[1].endsWith('bottlefit.mjs')) {
  const hs = process.argv.slice(2).map(Number).filter((n) => n > 0);
  await run(hs.length ? hs : [TUNE.clueHeight, +(TUNE.clueHeight * 3).toFixed(6)]);
  process.exit(0);
}

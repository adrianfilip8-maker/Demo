/**
 * Where does a camera have to stand for the sphinx avenue to READ as a processional way?
 *
 * `avenueangle.mjs` (GEOMETRY) established the constraint and handed the lever over: §8.1 pins
 * the avenue at x = ±7, z = 40…84; the pedestal lever is exhausted at its knee; `dunes` needs
 * **vfov 107°** to include every animal from where it stands, which is a fisheye. Its conclusion
 * — "this is a camera-MOVE question, not an fov one" — is what this tool acts on.
 *
 * **The thing that makes it a move question is not the fov, it is the STANCE.** `dunes` sits at
 * x = 26, twenty-six metres east of an avenue whose axis is x = 0, and aims at (-2, 9, 18). So it
 * looks diagonally ACROSS the processional way from beside its near end: the near animals sit at
 * horizontal −67°, nearly behind the lens, and the seven that are in frame are the far, smallest
 * ones. No fov fixes a stance — widening from 42° to 107° would put the near animals at the frame
 * edge where a rectilinear projection stretches them worst.
 *
 * So this sweeps ON-AXIS and near-axis stations at the near end looking down the way, which is
 * how a processional avenue has been photographed since Karnak: two converging rows, a terminating
 * mass at the far end, the vanishing point doing the work.
 *
 * SCOPE — what this does NOT do, stated because §11 is about exactly this gap:
 *   - Terrain occlusion only, by the same ray-march `avenueangle.mjs` uses. It does not know
 *     about props, walls, statues or the temple itself, so a station that scores well here can
 *     still be looking through a pylon. `camclear.mjs` and a render settle that, not this.
 *   - It scores GEOMETRY IN FRAME, which is a necessary condition for a composition and nowhere
 *     near a sufficient one. 16 visible animals arranged badly is worse than 12 arranged well.
 *     Take the top rows to a render and choose there — §57.2's rule, which cost a wrong pick when
 *     it was ignored.
 *   - No sun term. `dunes`' bearing was chosen partly for its light and this throws that away;
 *     whatever wins here has to be re-checked against the key before it is proposed.
 *
 *   node tools/avenueshot.mjs
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { Terrain } from '../src/world/Terrain.js';
import { Props } from '../src/world/Props.js';

const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings: [],
  warn: () => {}, get: () => null, has: () => false,
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};
const T = new Terrain(engine);
await T.init();

const SPHINX_X = 7, BODY = 3.5;
const SPHINX_Z = [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84];
const PED = Props.AVENUE_PEDESTAL;
const ASPECT = 1280 / 720;

const heads = [];
for (const z of SPHINX_Z) for (const sx of [-1, 1]) {
  const x = sx * SPHINX_X;
  heads.push(new THREE.Vector3(x, T.heightAt(x, z) - 0.15 + PED + BODY, z));
}

/** Visible / occluded / in-frame-but-blocked, plus how much of the frame the avenue spans. */
function score(pos, target, fov) {
  const c = new THREE.PerspectiveCamera(fov, ASPECT, 0.1, 2000);
  c.position.copy(pos); c.lookAt(target);
  c.updateMatrixWorld(true); c.updateProjectionMatrix();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
  let vis = 0, occ = 0, off = 0;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const head of heads) {
    const q = head.clone().project(c);
    const inF = Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && head.clone().sub(pos).dot(fwd) > 0;
    if (!inF) { off++; continue; }
    const dir = head.clone().sub(pos); const len = dir.length(); dir.divideScalar(len);
    let pen = 0;
    for (let t = 1.0; t < len - 0.6; t += 0.35) {
      const p = pos.clone().addScaledVector(dir, t);
      pen = Math.max(pen, T.heightAt(p.x, p.z) - p.y);
    }
    if (pen > 0) { occ++; continue; }
    vis++;
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  /* Frame span of the VISIBLE set. An avenue that reads is one that crosses the frame; a tight
     cluster in the middle is a row of statues, not a processional way. NDC is [-1,1], so 2.0 is
     the full width. Reported rather than folded into a single score, because §57.2: a scalar
     that mixes "how many" with "how spread" hides which one a station is winning on. */
  const spanX = vis ? (x1 - x0) / 2 : 0, spanY = vis ? (y1 - y0) / 2 : 0;
  return { vis, occ, off, spanX, spanY, agl: pos.y - T.heightAt(pos.x, pos.z) };
}

const s = SHOTS.dunes;
const base = score(new THREE.Vector3(...s.pos), new THREE.Vector3(...s.target), s.fov);
console.log(`BASELINE  dunes [${s.pos}] -> [${s.target}] fov ${s.fov}`);
console.log(`  visible ${base.vis}/16  occluded ${base.occ}  off-frame ${base.off}`
  + `  frame span ${(base.spanX * 100).toFixed(0)}% x ${(base.spanY * 100).toFixed(0)}%`
  + `  cam ${base.agl.toFixed(1)} m AGL\n`);

const rows = [];
for (const camX of [0, 3, 6, 10]) {
  for (const camZ of [88, 92, 97, 104]) {
    for (const agl of [3, 6, 10, 16]) {
      for (const fov of [38, 42, 50]) {
        for (const tz of [30, 40, 52]) {
          const gy = T.heightAt(camX, camZ);
          const pos = new THREE.Vector3(camX, gy + agl, camZ);
          const target = new THREE.Vector3(0, T.heightAt(0, tz) + 6, tz);
          const r = score(pos, target, fov);
          rows.push({ camX, camZ, agl, fov, tz, ...r });
        }
      }
    }
  }
}
/* Rank on visible first, then on how far the visible set spreads across the frame. Ties on
   `vis` are extremely common here — 40+ stations see all 16 — and that is exactly the case
   where the count has stopped discriminating and the composition term has to. */
rows.sort((a, b) => (b.vis - a.vis) || (b.spanX - a.spanX));

console.log('  x    z   AGL  fov  targetZ | vis  occ  off | frame span   ');
for (const r of rows.slice(0, 14)) {
  console.log(`${String(r.camX).padStart(3)} ${String(r.camZ).padStart(4)} ${String(r.agl).padStart(5)} `
    + `${String(r.fov).padStart(4)} ${String(r.tz).padStart(8)} | ${String(r.vis).padStart(3)} `
    + `${String(r.occ).padStart(4)} ${String(r.off).padStart(4)} | `
    + `${(r.spanX * 100).toFixed(0).padStart(3)}% x ${(r.spanY * 100).toFixed(0).padStart(3)}%`);
}
const all16 = rows.filter((r) => r.vis === 16).length;
console.log(`\n${all16} of ${rows.length} stations see all 16 animals unoccluded.`);
console.log('Count is NOT the discriminator here — take the top rows to a render and pick on');
console.log('composition and light, per this file\'s SCOPE note. Nothing above is a proposal.');

/**
 * What the enclosure fan should read at every canonical camera — derived offline, against raw
 * Architecture + Props triangles, with no browser and no capture lock.
 *
 *   node tools/fanpredict.mjs
 *
 * **This is deliberately a DIFFERENT instrument from the one that ships.** `Lighting._updateEnclosure`
 * casts its five rays at the COLLISION BVH, which is a registered subset of the world; this casts
 * the same five directions at the geometry itself with Möller–Trumbore. Where the two agree, the
 * fan reading is not an artefact of either. Where they disagree, the disagreement names something
 * real — a mesh that is drawn but not collidable, or the reverse — and that is worth more than a
 * second copy of the same number.
 *
 * It also costs nothing. The FIFO capture lock can be an hour deep, and "what will the probe say"
 * is answerable in eight seconds while you wait, which turns the capture into a confirmation
 * rather than a discovery (KNOWN_ISSUES §271.5: an offline sweep is worth an hour of FIFO).
 *
 * What it cannot answer: `buildLevel` builds NO TERRAIN (see its own header), so a camera whose
 * sky is blocked by a dune reads as open here. Nothing in this project's shot set is, but check
 * before trusting it on a new camera.
 */
import * as THREE from 'three';
import { buildLevel, trisIn, rayTri } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

/* Mirrored from Lighting.js: 30 m probe, straight up plus four rays 34 deg off vertical. Read the
   angle and range from that file if they ever move — they are quoted here, not derived, and this
   header is the place that will be wrong if they change. */
const PROBE = 30, DEG = 34;
const t = Math.tan(DEG * Math.PI / 180);
const FAN = [[0, 1, 0], [t, 1, 0], [-t, 1, 0], [0, 1, t], [0, 1, -t]]
  .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
const LABEL = ['up', '+x', '-x', '+z', '-z'];

const { root, A } = await buildLevel({ withProps: true });
const scene = root ?? A.root ?? A.group;

const WANT = process.argv[2]?.split(',') ??
  ['combat', 'courtyard', 'dunes', 'hero', 'interior', 'night', 'sly-closeup', 'sly-perch', 'temple', 'traversal'];

console.log(`fan: ${FAN.length} rays, ${DEG} deg cone, ${PROBE} m, against Architecture + Props triangles\n`);
console.log('shot          camera                    hits  enclosure  blocked rays (distance)');
const out = {};
for (const name of WANT) {
  const s = SHOTS[name];
  if (!s) { console.log(`${name.padEnd(13)} (no such shot)`); continue; }
  const [ox, oy, oz] = s.pos;
  const box = new THREE.Box3(
    new THREE.Vector3(ox - PROBE, oy - 1, oz - PROBE),
    new THREE.Vector3(ox + PROBE, oy + PROBE + 1, oz + PROBE));
  const tris = trisIn(scene, box);
  let hits = 0; const which = [];
  for (let i = 0; i < FAN.length; i++) {
    const [dx, dy, dz] = FAN[i];
    let best = Infinity;
    for (const tr of tris) {
      const d = rayTri(ox, oy, oz, dx, dy, dz, tr.t);
      if (d > 1e-4 && d < best) best = d;
    }
    if (best <= PROBE) { hits++; which.push(`${LABEL[i]}@${best.toFixed(1)}m`); }
  }
  out[name] = hits / FAN.length;
  console.log(`${name.padEnd(13)} ${JSON.stringify(s.pos).padEnd(24)} ${hits}/5   ${(hits / FAN.length).toFixed(2)}       ` +
              `${which.join(' ') || '(none — open sky in all five directions)'}`);
}
console.log(`\n${JSON.stringify(out)}`);

/* ------------------------------------------------------------------ robustness --- *
 * `SANDS_ROBUST=1` adds the two sweeps that say how much a threshold placed on this signal is
 * worth: how far a camera has to move to change its reading, and how much the reading depends on
 * the fan's own constants. A separating threshold on ten fixed cameras is not the same claim as a
 * term that behaves in play, and the difference is measurable for free.
 */
if (process.env.SANDS_ROBUST) {
  function fanAt(ox, oy, oz, probe, deg) {
    const tt = Math.tan(deg * Math.PI / 180);
    const dirs = [[0, 1, 0], [tt, 1, 0], [-tt, 1, 0], [0, 1, tt], [0, 1, -tt]]
      .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
    const box = new THREE.Box3(new THREE.Vector3(ox - probe, oy - 1, oz - probe),
                               new THREE.Vector3(ox + probe, oy + probe + 1, oz + probe));
    const tris = trisIn(scene, box);
    let hits = 0;
    for (const [dx, dy, dz] of dirs) {
      let best = Infinity;
      for (const tr of tris) { const d = rayTri(ox, oy, oz, dx, dy, dz, tr.t); if (d > 1e-4 && d < best) best = d; }
      if (best <= probe) hits++;
    }
    return hits / dirs.length;
  }
  const TT = Number(process.env.SANDS_ROBUST_T || 0.9);
  console.log(`\n--- camera perturbation, +/-1 m on each axis and face diagonal (13 samples), class at T=${TT} ---`);
  console.log('shot          base   min   max   class');
  for (const name of WANT) {
    const [x, y, z] = SHOTS[name].pos;
    const offs = [[0, 0, 0]];
    for (const d of [-1, 1]) for (const ax of [0, 1, 2]) { const o = [0, 0, 0]; o[ax] = d; offs.push(o); }
    for (const d of [-1, 1]) for (const [a, b] of [[0, 2], [0, 1], [1, 2]]) { const o = [0, 0, 0]; o[a] = d; o[b] = d; offs.push(o); }
    const vals = offs.map(([dx, dy, dz]) => fanAt(x + dx, y + dy, z + dz, PROBE, DEG));
    const cls = [...new Set(vals.map((v) => (v <= TT ? 'OPEN' : 'ROOFED')))].join('+');
    console.log(`${name.padEnd(13)} ${vals[0].toFixed(2)}  ${Math.min(...vals).toFixed(2)}  ${Math.max(...vals).toFixed(2)}  ${cls}`);
  }
  console.log('\n--- the fan\'s own constants: probe distance / cone angle ---');
  console.log('shot          30m/34d  15m/34d  60m/34d  30m/20d  30m/50d');
  for (const name of WANT) {
    const [x, y, z] = SHOTS[name].pos;
    const r = [[30, 34], [15, 34], [60, 34], [30, 20], [30, 50]].map(([p, d]) => fanAt(x, y, z, p, d).toFixed(2));
    console.log(`${name.padEnd(13)} ${r.join('     ')}`);
  }
}

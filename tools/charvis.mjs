/**
 * Is the character actually VISIBLE in each canonical shot, or merely inside the frustum?
 *
 * This exists because KNOWN_ISSUES §7 recorded "all ten shots put the character's ground
 * contact in frame" on the strength of a pure projection check, and a render-based A/B later
 * found that hiding him in `courtyard` changed **zero pixels**. Projection cannot see walls.
 * `charview.mjs` says so in its own header and still gets quoted as if it settled visibility.
 *
 * The test here is the one that was missing: CPU-skin the real character in the shot's own
 * pose, put him where the shot stages him, and cast a ray from the camera to each of a few
 * hundred surface points against real level triangles. A point is visible when nothing in the
 * architecture lies between it and the lens. No renderer, no capture lock, a few seconds.
 *
 *   node tools/charvis.mjs [shot ...]        # default: all ten
 *
 * **What this still cannot tell you.** Architecture only — `buildLevel()` builds
 * `src/world/Architecture.js` and nothing else, so anything drawn by FX, decals or the sky is
 * invisible to it, and so is the character's own self-occlusion (`occlude.mjs` does that one).
 * It is a necessary condition that was never being checked, not a sufficient one. A shot that
 * passes here can still be a bad frame; a shot that fails here cannot be a good one.
 */
import * as THREE from 'three';
import { buildLevel, trisIn, rayTri } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

/* Sample budget per shot. Rays are the cost, and the answer saturates fast: at 480 points on a
   1.7 m figure the samples are ~4 cm apart, well below any occluder edge that matters. */
const SAMPLES = 480;
/* Coincidence tolerance in metres, overridable so the result can be shown not to depend on it. */
const EPS = parseFloat(process.env.CHARVIS_EPS ?? '0.02');

const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false,
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};

const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const sly = new SlyModel(engine);
await sly.init();
const { A } = await buildLevel();

/** World-space surface points for `shot`'s staged character, decimated to ~SAMPLES. */
function characterPoints(shot) {
  const clip = CLIPS[shot.player.pose];
  const pb = new PoseBuffer(sly.boneNames).clear();
  sampleInto(clip, clip.hold ?? 0, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const hb = sly.bp('hips');
  sly.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  sly.skeleton.update();

  const geo = sly.mesh.geometry;
  const posA = geo.attributes.position, siA = geo.attributes.skinIndex, swA = geo.attributes.skinWeight;
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const step = Math.max(1, Math.floor(posA.count / SAMPLES));

  const yaw = shot.player.yaw ?? 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const [px, py, pz] = shot.player.pos;
  const out = [];
  const v = new THREE.Vector3(), t = new THREE.Vector3(), m = new THREE.Matrix4();
  for (let i = 0; i < posA.count; i += step) {
    t.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = swA.getComponent(i, k); if (w === 0) continue;
      const bi = siA.getComponent(i, k);
      m.multiplyMatrices(bones[bi].matrixWorld, inv[bi]);
      v.fromBufferAttribute(posA, i).applyMatrix4(m);
      t.addScaledVector(v, w);
    }
    /* model -> world: the root carries yaw about +Y and the staged position */
    out.push([px + t.x * cy + t.z * sy, py + t.y, pz - t.x * sy + t.z * cy, t.y]);
  }
  return out;
}

/**
 * `guard` is the one shot whose subject is not the player, and `setShot` stages only the
 * player — `Debug.js` teleports the character and freezes its pose, and does nothing at all
 * to the garrison. So the guard in the "guard sheet" is wherever `buildRoutes(TUNE.seed)` and
 * the roster's per-guard `u` phase happen to put him, which nobody had ever checked. Reported
 * here rather than left as "behind camera, by design", because "the player is deliberately out
 * of shot" is only half the claim; the other half is that the intended subject is in it.
 */
async function guardSubject(shot, cam, fwd) {
  let P;
  try { P = await import('../src/ai/Patrol.js'); }
  catch { console.log('              (Patrol.js unavailable — guard subject not checked)'); return; }
  const routes = P.buildRoutes(1);
  const half = Math.tan((shot.fov ?? 50) * Math.PI / 360), ASPECT = 16 / 9, GH = 1.85;
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const seen = [];
  for (let i = 0; i < P.ROSTER.length; i++) {
    const e = P.ROSTER[i], rt = routes[e.route];
    if (!rt) continue;
    /* The roster's `u` is a per-guard phase offset along the route. Evaluating every guard at
       u = 0 puts two of them on the same square metre and is simply wrong — a mistake worth
       naming, because it produced a plausible table. */
    const q = rt.at(e.u);
    const d = new THREE.Vector3(q.x, q.y, q.z).sub(cam);
    const z = d.dot(fwd);
    if (z <= 0) continue;
    const nx = d.dot(right) / (z * half * ASPECT), ny = d.dot(up) / (z * half);
    if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
    /* Body-centre ray only: the garrison is not skinned here, so this answers "is he behind a
       wall", not "how much of him shows". */
    const mid = new THREE.Vector3(q.x, q.y + GH * 0.55, q.z);
    const dir = mid.clone().sub(cam);
    const dist = dir.length(); dir.divideScalar(dist);
    const box = new THREE.Box3().setFromPoints([cam, mid]).expandByScalar(2.0);
    let blocked = null;
    for (const tr of trisIn(A.root, box)) {
      const t = rayTri(cam.x, cam.y, cam.z, dir.x, dir.y, dir.z, tr.t);
      if (t > 0 && t < dist - 0.02) { blocked = tr.name || '(unnamed)'; break; }
    }
    seen.push(`#${i} ${e.type} on ${e.route} u=${e.u.toFixed(2)} — ${z.toFixed(1)} m, ndc ${nx.toFixed(2)},${ny.toFixed(2)}, ${(GH / z / (2 * half) * 720).toFixed(0)} px${blocked ? `, OCCLUDED by ${blocked}` : ', clear'}`);
  }
  console.log(seen.length
    ? seen.map((s) => `              subject: ${s}`).join('\n')
    : '              subject: NO GUARD IS IN THIS FRAME — the guard sheet has no guard');
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
console.log(`shot          samples  visible   nearest blocker (by ray count)   [contact tolerance ${EPS} m]`);

for (const name of names) {
  const shot = SHOTS[name];
  if (!shot) { console.log(`${name.padEnd(13)} (no such shot)`); continue; }
  if (!shot.player) { console.log(`${name.padEnd(13)} (no player)`); continue; }

  const cam = new THREE.Vector3(...shot.pos);
  const pts = characterPoints(shot);

  /* Only geometry in the corridor between lens and character can occlude. A 2 m skirt keeps
     triangles that straddle the corridor edge; the per-triangle reject inside `trisIn` does
     the rest. */
  const box = new THREE.Box3().setFromPoints([cam, ...pts.map((p) => new THREE.Vector3(...p))])
    .expandByScalar(2.0);
  const tris = trisIn(A.root, box);

  const fwd = new THREE.Vector3(...shot.target).sub(cam).normalize();
  let inFront = 0, visible = 0, near = 0;
  /* Model-space Y bands: boots/contact, legs, torso/arms, head/cap. The critic scores the cap,
     muzzle and cane hook, so 6% lost off the boots and 6% lost off the head are not the same
     defect and must not average into one number. */
  const BANDS = ['feet', 'legs', 'torso', 'head'];
  const tot = [0, 0, 0, 0], cut = [0, 0, 0, 0];
  const blockers = new Map();
  for (const p of pts) {
    const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
    if (dx * fwd.x + dy * fwd.y + dz * fwd.z <= 0) continue;   // behind the lens
    inFront++;
    const dist = Math.hypot(dx, dy, dz);
    const d = [dx / dist, dy / dist, dz / dist];
    let hit = null, gap = 0;
    for (const tr of tris) {
      /* Stop short of the sample: a boot sole resting on paving is coincident with it, and a
         ray grazing that plane reports the character occluded by the floor he stands on. EPS
         is reported alongside the result because it is the one arbitrary number here — the
         near-miss column tells you whether it is doing real work or hiding a real overlap. */
      const t = rayTri(cam.x, cam.y, cam.z, d[0], d[1], d[2], tr.t);
      if (t > 0 && t < dist - EPS) { hit = tr.name || '(unnamed)'; gap = dist - t; break; }
    }
    const band = p[3] < 0.25 ? 0 : p[3] < 0.85 ? 1 : p[3] < 1.35 ? 2 : 3;
    tot[band]++;
    if (hit) {
      blockers.set(hit, (blockers.get(hit) ?? 0) + 1);
      cut[band]++;
      if (gap < 0.15) near++;
    } else visible++;
  }

  if (inFront === 0) {
    console.log(`${name.padEnd(13)} ${String(pts.length).padStart(7)}   BEHIND CAMERA (by design in \`guard\`)`);
    await guardSubject(shot, cam, fwd);
    continue;
  }
  const pct = 100 * visible / inFront;
  const top = [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([n, c]) => `${n} x${c}`).join(', ');
  const flag = pct === 0 ? '  <-- INVISIBLE: hiding him would change zero pixels'
    : pct < 35 ? '  <-- mostly occluded' : '';
  const nearNote = near ? `  [${near} within 15 cm — surface contact, not a wall]` : '';
  console.log(`${name.padEnd(13)} ${String(inFront).padStart(7)} ${pct.toFixed(1).padStart(7)}%   ${top || '(clear)'}${flag}${nearNote}`);
  if (visible < inFront) {
    const parts = BANDS.map((b, i) => tot[i] ? `${b} ${(100 * cut[i] / tot[i]).toFixed(0)}%` : `${b} --`);
    console.log(`              occluded by band: ${parts.join('  ')}`);
  }
}

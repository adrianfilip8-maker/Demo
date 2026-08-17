/**
 * perchproject.mjs — how many PIXELS of lateral line of action does `perch_idle` deliver in each
 * shot that stages it, by exact projection rather than by a cosine approximation?
 *
 * §345 settled that `hero` cannot verify this pose by computing `excursion × cos(view) × px/m`.
 * That is the right argument and it lands on ~1.81 px against a ~2.5 px ink hull. But the cosine
 * is a small-angle stand-in for a real projection: it assumes the excursion lies in the frontal
 * plane and that the camera is far enough for the perspective divide not to matter. This runs the
 * actual shot camera instead, so the number stops depending on that assumption.
 *
 * ── What is measured ─────────────────────────────────────────────────────────────────────────
 * A line of action is a SHAPE, not a position (§345's correction to §204): the quantity is the
 * chest's deviation from the straight line joining hips and head, which is invariant to the whole
 * figure sliding sideways. Measured here in the image plane, in pixels, at capture resolution.
 *
 * ── Why not a silhouette centroid ────────────────────────────────────────────────────────────
 * Because `shotsil`'s silhouette is the union of body AND cane, and `perch_idle` holds the cane
 * out at `tip 0.49 z`. A per-row centroid of that union measures the cane's contribution as
 * readily as the spine's, and would have produced a confident number about the wrong thing.
 * Bones do not have that problem.
 *
 * ── What this still cannot tell you ──────────────────────────────────────────────────────────
 * It is a projection of authored bone positions. It says what the pose OFFERS the camera; it does
 * not say what survives the ink hull, the shader or PostFX, and it does not test occlusion. The
 * comparison against the ~2.5 px hull is therefore a NECESSARY condition — below the hull the
 * excursion certainly cannot read, above it, it still has to survive the renderer.
 *
 *   node tools/perchproject.mjs [clip] [--rows 900]
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';

const argv = process.argv.slice(2);
const CLIP = argv.find((a) => !a.startsWith('--')) || 'perch_idle';
const ROWS = argv.includes('--rows') ? Number(argv[argv.indexOf('--rows') + 1]) : 900;
const ASPECT = 16 / 9;
const HULL_PX = 2.5;            // the ink hull width §345 compares against, at this resolution

/* Bone world positions for the frozen clip, model space, from `tools/poseprobe.mjs <clip>`.
   Hard-coded rather than re-derived so this tool has no rig dependency; re-run poseprobe and
   update if the clip changes. Values are perch_idle @ 0. */
const BONES = {
  perch_idle: { hips: [0.045, 0.695, 0.065], chest: [0.082, 0.879, 0.133], head: [0.045, 1.100, 0.142] },
};

const bones = BONES[CLIP];
if (!bones) {
  console.error(`no bone table for "${CLIP}" — run tools/poseprobe.mjs ${CLIP} and add one`);
  process.exit(2);
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Project a world point to pixel coordinates through a shot camera. */
function projector(shot) {
  const cam = new THREE.PerspectiveCamera(shot.fov, ASPECT, 0.1, 500);
  cam.position.set(...shot.pos);
  cam.lookAt(new THREE.Vector3(...shot.target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const cols = ROWS * ASPECT;
  return (world) => {
    const n = world.clone().project(cam);
    return { x: (n.x * 0.5 + 0.5) * cols, y: (1 - (n.y * 0.5 + 0.5)) * ROWS };
  };
}

/** Perpendicular distance from `p` to the line through `a` and `b`, in pixels. */
function deviation(a, b, p) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * vy - (p.y - a.y) * vx) / len;
}

console.log(`\nclip ${CLIP} · ${ROWS} rows (${Math.round(ROWS * ASPECT)}x${ROWS}) · hull ${HULL_PX} px\n`);
console.log('                            chest deviation, px');
console.log('shot         view°  figure   LATERAL  sagittal    total   vs hull  verdict');

const rows = [];
for (const [name, shot] of Object.entries(SHOTS)) {
  if (shot.player?.pose !== CLIP) continue;
  const yaw = shot.player.yaw ?? 0;
  const base = new THREE.Vector3(...(shot.player.pos ?? [0, 0, 0]));
  const toWorld = (local) => V(local).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(base);

  const proj = projector(shot);
  const hips = proj(toWorld(bones.hips));
  const chest = proj(toWorld(bones.chest));
  const head = proj(toWorld(bones.head));
  const figure = Math.hypot(head.x - hips.x, head.y - hips.y);

  /* DECOMPOSE BEFORE PROJECTING. An image-plane deviation cannot tell a lateral excursion from a
     sagittal one, and for this pose they are nearly equal in size — chest deviates 3.7 cm in local
     X and 3.3 cm in local Z. §345 records that what `hero` actually shows is ~90 % SAGITTAL, so a
     tool that reports the combined figure says "hero nearly resolves it" about the wrong axis.
     The line of action under test (#17, §204, §345) is the LATERAL one, so it is isolated here and
     the sagittal component is reported beside it rather than folded in. */
  const h = V(bones.hips), c = V(bones.chest), hd = V(bones.head);
  const t = (c.y - h.y) / (hd.y - h.y);
  const onLine = h.clone().lerp(hd, t);                 // the point the chest is measured against
  const devLocal = c.clone().sub(onLine);               // (lateralX, ~0, sagittalZ)
  const latOnly = onLine.clone().add(new THREE.Vector3(devLocal.x, 0, 0));
  const sagOnly = onLine.clone().add(new THREE.Vector3(0, 0, devLocal.z));
  const pLine = proj(toWorld([onLine.x, onLine.y, onLine.z]));
  const pLat = proj(toWorld([latOnly.x, latOnly.y, latOnly.z]));
  const pSag = proj(toWorld([sagOnly.x, sagOnly.y, sagOnly.z]));
  /* All three measured the SAME way — perpendicular distance from the projected hips-head line —
     so the columns are comparable. Measuring the components as distances from the on-line point
     while measuring the total perpendicular to the line made `total` smaller than `sagittal`,
     which is not wrong so much as two different quantities sharing a table. */
  const devLat = deviation(hips, head, pLat);
  const devSag = deviation(hips, head, pSag);
  const devTotal = deviation(hips, head, chest);
  const dev = devLat;                                   // the quantity #17 is about

  /* View angle, same convention as `tools/charview.mjs`: 0° = camera sees his front. */
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const toCam = new THREE.Vector3(...shot.pos).sub(base); toCam.y = 0; toCam.normalize();
  const view = Math.acos(THREE.MathUtils.clamp(fwd.dot(toCam), -1, 1)) * 180 / Math.PI;

  const ratio = dev / HULL_PX;
  const verdict = ratio >= 2 ? 'RESOLVABLE' : ratio >= 1 ? 'marginal' : 'BELOW HULL';
  rows.push({ name, view, figure, dev, devSag, devTotal, ratio, verdict });
  console.log(`${name.padEnd(13)}${view.toFixed(0).padStart(4)} ${figure.toFixed(0).padStart(7)}   ` +
    `${dev.toFixed(2).padStart(7)}  ${devSag.toFixed(2).padStart(7)}  ${devTotal.toFixed(2).padStart(7)}   ` +
    `${ratio.toFixed(2).padStart(5)}x  ${verdict}`);
}

if (!rows.length) console.log(`  (no canonical shot stages ${CLIP})`);
else {
  console.log('\nhips→head is the reference line; the quantity is the CHEST\'s perpendicular');
  console.log('deviation from it, which is invariant to the figure translating sideways.');
  console.log('`total` can be SMALLER than a component: at an oblique bearing the lateral and');
  console.log('sagittal offsets project onto opposite sides of the line and partly cancel. That');
  console.log('is why the combined figure must not be read as the line of action — at `hero` it');
  console.log('flatters the lateral excursion by more than 2x.');
  const best = rows.reduce((a, b) => (b.dev > a.dev ? b : a));
  console.log(`\nThe shot that can answer it is "${best.name}" at ${best.dev.toFixed(2)} px, ` +
    `${best.ratio.toFixed(1)}x the hull.`);
  for (const r of rows.filter((r) => r.ratio < 1)) {
    console.log(`"${r.name}" returns a null whether or not the lean exists: ${r.dev.toFixed(2)} px ` +
      `is NARROWER than the ${HULL_PX} px line drawn over it. Not a weak measurement — no measurement.`);
  }
}

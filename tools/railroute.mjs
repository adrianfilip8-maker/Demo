/* Score a candidate `approach` rail route against every canonical camera — no GPU, no lock.
 *
 * The `courtyard` camera was moved out onto the approach (z 41.5) *after* this rail was
 * routed down the approach, so the two occupy the same corridor and the rail passed 4 m from
 * the lens: a 44 px bronze bar diagonally across the composition (critic pass 6, finding #1,
 * re-attributed to src/world by §79.1). Any reroute has to be checked against all fifteen
 * cameras at once, because the last two reroutes each fixed one frame and broke another.
 *
 *   node tools/railroute.mjs            # score the shipped route
 *   node tools/railroute.mjs --cand     # score the candidate below
 *
 * Reports, per camera: on-screen sample count, nearest on-screen depth, apparent tube
 * diameter in px at that depth, and the screen box. Width is the number that matters —
 * "in frame" is fine for a traversal affordance, "in frame at 44 px" is not.
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';

const H = 720, W = 1280;

/* The shipped route and the candidate, kept side by side so the diff is legible. */
const ROUTES = {
  /* What EgyptLevel.js builds. Keep in sync — this tool is only useful if it is. */
  shipped: { r: 0.12, pts: [
    [10.0, 15.3, 61.0], [13.2, 13.6, 52.0], [16.6, 12.0, 43.0],
    [20.2, 10.6, 36.0], [20.7, 9.8, 31.8],
  ] },
  /* The west line this replaced: in `courtyard` at 42.5 px, `combat` 45.3, `sly-profile` 55.6. */
  west: { r: 0.13, pts: [
    [10.0, 15.3, 61.0], [7.8, 12.0, 51.0], [4.4, 7.6, 42.0],
    [-0.5, 3.9, 34.5], [-3.0, 1.7, 28.0], [-4.4, 1.15, 23.0],
  ] },
  cand: { r: 0.11, pts: [
    [10.0, 15.3, 61.0], [9.6, 12.6, 52.0], [9.0, 9.6, 44.0],
    [8.0, 7.4, 38.0], [6.6, 5.4, 32.0], [5.0, 3.0, 27.0], [3.6, 1.5, 22.0],
  ] },
  /* East peristyle: keep the whole descent outside the entry corridor and land on the
     y = 9.0 architrave ledge ring instead of on the courtyard floor. */
  east: { r: 0.12, pts: [
    [10.0, 15.3, 61.0], [13.2, 13.6, 52.0], [17.4, 11.8, 43.0],
    [20.8, 10.4, 35.0], [22.6, 9.6, 29.0], [23.0, 9.45, 25.0],
  ] },
  east2: { r: 0.12, pts: [
    [10.0, 15.3, 61.0], [14.0, 13.7, 52.0], [18.6, 11.9, 43.0],
    [21.6, 10.5, 35.0], [23.0, 9.6, 29.0], [23.2, 9.45, 24.0],
  ] },
  /* Lands on the peristyle's SOUTH-EAST return architrave (ledge y 9.0, x 17.4…23,
     z 30.7…32.3) — six metres clear of `pylon-drop`'s terminus at (22.6, 9.25, 26), which
     `east` converged onto to within 0.4 m. */
  corner: { r: 0.12, pts: [
    [10.0, 15.3, 61.0], [13.2, 13.6, 52.0], [16.6, 12.0, 43.0],
    [20.2, 10.6, 36.0], [20.7, 9.55, 31.8],
  ] },
};

const which = process.argv.find((a) => a.startsWith('--'))?.slice(2) || 'shipped';
const { r: RADIUS, pts } = ROUTES[which];

const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.35);
const samples = curve.getPoints(400);

console.log(`route: ${which}   radius ${RADIUS} m   length ${curve.getLength().toFixed(1)} m\n`);
console.log('camera        on/400  nearest  tubePx   screen box (1280x720)');

for (const [name, s] of Object.entries(SHOTS)) {
  if (!s.pos || !s.target) continue;
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 2000);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(...s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();

  const fwd = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);

  let on = 0, near = Infinity, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of samples) {
    const d = p.clone().sub(cam.position).dot(fwd);
    if (d <= 0.05) continue;
    const q = p.clone().project(cam);
    if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
    on++;
    near = Math.min(near, d);
    const px = (q.x * 0.5 + 0.5) * W, py = (-q.y * 0.5 + 0.5) * H;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px);
    y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  const tube = on ? (2 * RADIUS) / (2 * near * tanHalf) * H : 0;
  console.log(
    `${name.padEnd(13)} ${String(on).padStart(4)}   ` +
    (on ? `${near.toFixed(1).padStart(6)}m ${tube.toFixed(1).padStart(6)}px   ` +
          `[${x0.toFixed(0)},${y0.toFixed(0)} .. ${x1.toFixed(0)},${y1.toFixed(0)}]`
        : '     —       —    (clear)')
  );
}

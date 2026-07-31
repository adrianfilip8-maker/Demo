/**
 * Which side of the character does each canonical camera actually see, and how big is he?
 *
 * Added because a character-quality pass found that five of the ten shots look at Sly's back,
 * where the cap is a featureless dome with no brim, ear notch or muzzle — so silhouette work
 * that reads perfectly in a turntable does nothing for the frames the critic scores. It also
 * reports his height in pixels: no amount of silhouette work makes a 55 px figure read.
 *
 * Two angles matter and they pull against each other:
 *   view   0° = camera sees his front, ±180° = dead behind. Want |view| in ~20..70° for a
 *          three-quarter read that shows cap brim, muzzle, ear notch and cane at once.
 *   sun    0° = his face points at the key. Want ~20..70° so the face is lit but modelled.
 * A yaw that fixes one can easily break the other, which is why this prints both.
 *
 * No renderer boot — runs in about a second. `node tools/charview.mjs [--sweep]`
 *
 * **What this cannot tell you.** It projects a point through the shot camera and nothing more.
 * It does not test occlusion, and it does not verify that the character was actually staged
 * where the shot asks. So "in frame" here means "not outside the frustum", NOT "visible" —
 * a character behind a wall, or one the staging path never moved, reports exactly the same.
 *
 * This bit me: on the strength of this tool I recorded that all ten shots put the character's
 * ground contact in frame, and a render-based measurement later found that hiding him in
 * `courtyard` changed **zero pixels**. Treat a pass here as a necessary condition, and settle
 * visibility with a visible/hidden A/B against a real frame.
 */
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { evalAtmosphere, createAtmosphereState } from '../src/render/Atmosphere.js';

const ASPECT = 16 / 9, ROWS = 540, H = 1.7;
const deg = (r) => r * 180 / Math.PI;
const wrap = (d) => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

function analyse(s, yaw) {
  const p = new THREE.Vector3(...s.player.pos);
  const cam = new THREE.Vector3(...s.pos);
  const tgt = new THREE.Vector3(...s.target);
  const A = evalAtmosphere(s.tod ?? 0.78, createAtmosphereState());
  const key = (A.keyDir ?? A.sunDir).clone();
  const sun = new THREE.Vector3(key.x, 0, key.z).normalize();

  const facing = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const toCam = cam.clone().sub(p).setY(0).normalize();
  // Signed angle from facing to the camera, about +Y.
  const view = wrap(deg(Math.atan2(
    facing.clone().cross(toCam).y, facing.dot(toCam))));
  const sunA = wrap(deg(Math.atan2(
    facing.clone().cross(sun).y, facing.dot(sun))));

  const camera = new THREE.PerspectiveCamera(s.fov ?? 45, ASPECT, 0.1, 500);
  camera.position.copy(cam); camera.lookAt(tgt);
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const a = p.clone().project(camera), b = p.clone().setY(p.y + H).project(camera);
  const px = Math.abs(b.y - a.y) * ROWS / 2;
  const onScreen = Math.abs(a.x) <= 1 && Math.abs(a.y) <= 1
    && p.clone().sub(cam).dot(tgt.clone().sub(cam).normalize()) > 0;

  return { view, sunA, px, onScreen, dist: p.distanceTo(cam) };
}

const sweep = process.argv.includes('--sweep');
console.log('shot          view°   sun°    px   notes');
for (const [name, s] of Object.entries(SHOTS)) {
  if (!s.player) { console.log(`${name.padEnd(13)} (no player)`); continue; }
  const r = analyse(s, s.player.yaw);
  const notes = [];
  if (!r.onScreen) notes.push('OFF-SCREEN');
  if (Math.abs(r.view) > 130) notes.push('sees his BACK');
  else if (Math.abs(r.view) < 12) notes.push('dead-on, flat');
  if (r.px < 70 && r.onScreen) notes.push(`only ${r.px.toFixed(0)}px tall`);
  if (Math.abs(r.sunA) > 110) notes.push('face unlit');
  console.log(`${name.padEnd(13)} ${r.view.toFixed(0).padStart(5)} ${r.sunA.toFixed(0).padStart(6)} ${r.px.toFixed(0).padStart(5)}   ${notes.join(', ') || 'ok'}`);

  if (sweep && (Math.abs(r.view) > 130 || Math.abs(r.sunA) > 110)) {
    // Best yaw satisfying both reads at once, nearest to the current one.
    let best = null;
    for (let d = 0; d < 360; d += 1) {
      const y = d * Math.PI / 180;
      const t = analyse(s, y);
      const av = Math.abs(t.view), as = Math.abs(t.sunA);
      if (av < 20 || av > 70 || as < 20 || as > 70) continue;
      const delta = Math.abs(wrap(deg(y - s.player.yaw)));
      if (!best || delta < best.delta) best = { y, ...t, delta };
    }
    console.log(best
      ? `              -> yaw ${best.y.toFixed(2)} (${deg(best.y).toFixed(0)}°, ${best.delta.toFixed(0)}° away): view ${best.view.toFixed(0)}°, sun ${best.sunA.toFixed(0)}°`
      : '              -> no yaw satisfies both view and sun here; camera or sun must move');
  }
}

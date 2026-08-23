/**
 * _posecarry.mjs — the pose-geometry metric, in ONE place.
 *
 * §479.16 established why these quantities and not Euler triples: the reference rig's rest arm
 * hangs at [.54,−.84,.04] and RIG3's at [.72,−.69,0] (§479.6), so the two rigs' authored angles
 * are not comparable and every honest comparison has to be a POSE property read off joint
 * POSITIONS in a frame the pose itself defines. `idleref.mjs` wrote it first; `idlecensus.mjs`
 * needs exactly the same numbers on a much larger corpus, and a second copy of a metric that
 * two rounds of rulings are quoted against is the §212 mistake. One copy, imported by both.
 *
 *   lat  = upperArmL − upperArmR, horizontalised   (the shoulder line — §479.5's frame)
 *   up   = chest − hips                            (the torso axis, so a lean cannot fake it)
 *   fwd  = lat × up
 *
 *   ABDUCTION  shoulder→elbow direction's angle out of the torso's down-axis, frontal plane:
 *              0° = hanging flat against the ribs, 90° = straight out to the side.
 *   FLEXION    the same direction's forward/back component (+ = forward of the torso plane).
 *   FOLD       interior angle at the elbow (180° = straight).
 *   SEP        hand-to-hand lateral separation, cm and shoulder-widths.
 *
 * Both sides always, because their poses need not be symmetric and ours never is (cane hand).
 */
import * as THREE from 'three';

export const DEG = 180 / Math.PI;

/** @param j {(n:string)=>THREE.Vector3} joint world position by our canonical role name */
export function carry(j) {
  const lat = j('upperArmL').clone().sub(j('upperArmR')); lat.y = 0; lat.normalize();
  const up = j('chest').clone().sub(j('hips')).normalize();
  const fwd = new THREE.Vector3().crossVectors(lat, up).normalize();
  const shoulderW = j('upperArmL').distanceTo(j('upperArmR'));
  const out = { shoulderW: +shoulderW.toFixed(3) };
  for (const S of ['L', 'R']) {
    const sh = j(`upperArm${S}`), el = j(`lowerArm${S}`), ha = j(`hand${S}`);
    const d = el.clone().sub(sh).normalize();
    /* frontal-plane angle out of "straight down the torso"; sign flipped on the right so
       "+ = away from the body" reads the same on both arms */
    const side = S === 'L' ? 1 : -1;
    out[S] = {
      abduction: +(Math.atan2(side * d.dot(lat), -d.dot(up)) * DEG).toFixed(1),
      flexion: +(Math.asin(THREE.MathUtils.clamp(d.dot(fwd), -1, 1)) * DEG).toFixed(1),
      fold: +(Math.acos(THREE.MathUtils.clamp(
        sh.clone().sub(el).normalize().dot(ha.clone().sub(el).normalize()), -1, 1)) * DEG).toFixed(1),
      /* how far the elbow and hand sit outboard of the shoulder joint, in cm — the plain
         reading of "spread out to the side", independent of any angle convention */
      elbowOutCm: +((side * (el.clone().sub(sh)).dot(lat)) * 100).toFixed(1),
      handOutCm: +((side * (ha.clone().sub(sh)).dot(lat)) * 100).toFixed(1),
    };
  }
  const sepM = (j('handL').clone().sub(j('handR'))).dot(lat);
  out.sepCm = +(sepM * 100).toFixed(1);
  out.sepShoulders = +(sepM / shoulderW).toFixed(2);
  return out;
}

/** The one-line renderer both tools print with. */
export const fmtCarry = (tag, c, log = console.log) => {
  log(`  ${tag.padEnd(26)} shoulderW ${c.shoulderW.toFixed(3)} m   hand sep ${String(c.sepCm).padStart(6)} cm (${c.sepShoulders} sh)`);
  for (const S of ['L', 'R']) {
    const a = c[S];
    log(`      ${S}: abduction ${String(a.abduction).padStart(6)}°   flexion ${String(a.flexion).padStart(6)}°`
      + `   fold ${String(a.fold).padStart(6)}°   elbow out ${String(a.elbowOutCm).padStart(6)} cm   hand out ${String(a.handOutCm).padStart(6)} cm`);
  }
};

/**
 * What SHAPE is the eye, as the camera sees it?
 *
 * Written because `ROUTE-char12-sighted.md` filed "the eyes are large circles where Sly's are
 * narrow angled lens shapes" as an ADJECTIVE, and this file's whole discipline is that a shape
 * claim needs a shape statistic before anything ships. `eyeprobe.mjs` samples colour at the
 * sclera centre; `eyefacing.mjs` tests whether the eye faces the lens. **Neither measures the
 * outline**, so the highest-value character finding had no number attached to it.
 *
 *   node tools/eyeshape.mjs [shot ...]        # default: the character-bearing shots
 *
 * WHAT IS MEASURED, and why it is the aperture rather than the sphere. `SlyModel._buildEye`'s
 * mask comment states the geometry exactly: *"the eye's silhouette on the head IS an ellipse in
 * (theta, phi) centred on `_eyeFrame`'s own constants with semi-axes equal to the sclera radii
 * over the head radii"*, and the ink ring is the annulus from **1.00** to `MASK_OUT` of that
 * same ellipse. So the visible eye is that ellipse at r = 1.00 — there is no lid clipping it
 * further inboard, and projecting the sclera SPHERE instead would return a disc at every pose
 * and answer nothing.
 *
 * The boundary is sampled in (theta, phi), lifted to the head surface by `headSurf` at the same
 * inflate the eye uses, taken to world through the skinned head bone, and projected through the
 * shot camera. Aspect and angle come from the 2D covariance of those projected points, so
 * foreshortening at a three-quarter view is included rather than assumed away.
 *
 * SCOPE — what this does NOT do:
 *   - No occlusion and no visibility, and it does not reproduce `eyefacing.mjs`'s `facing`
 *     column either — see the note at the computation for why duplicating it was a mistake.
 *     An eye on the far side of the head projects to perfectly good pixels, so **run
 *     `eyefacing.mjs` and discard any row it calls FACING AWAY** before quoting anything here.
 *   - Geometry only. It says nothing about how the eye is SHADED, and #15 closed on hierarchy
 *     (bloom, `scleraTint`) which is a different question about the same object.
 *   - The reference target is NOT in this file. It reports what the model does; what it should
 *     do is an art call that has to be stated with its source before this becomes a bar.
 */
import * as THREE from 'three';

const warnings = [];
const engine = { quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings, warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {} };
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const { SHOTS } = await import('../src/core/Shots.js');

const W = 1280, H = 720;                      // the critic's resolution, not the harness's 900 (§72.1)
const shots = process.argv.slice(2).length ? process.argv.slice(2)
  : ['sly-closeup', 'sly-key', 'sly-startle', 'sly-profile', 'hero', 'combat'];

const sly = new SlyModel(engine);
await sly.init();

/* The eye ellipse, read from the same constants `_buildEye` uses. If those move, this moves. */
const S = sly.TUNE?.headScale ?? (await import('../src/player/SlyModel.js')).TUNE?.headScale;
const rH = sly.headRadii;
const EYE_TH = 0.455, EYE_PH = 0.165;
const eAx = (0.086 * S) / rH.x, eAy = (0.092 * S) / rH.y;

console.log(`sclera semi-axes in head angle: eAx ${eAx.toFixed(4)} (horiz)  eAy ${eAy.toFixed(4)} (vert)`);
console.log(`  model-space ratio width:height = ${(eAx / eAy).toFixed(3)}  `
  + `(1.0 = circular; Sly's reference eye is a WIDE lens, so > 1 is the direction)\n`);

console.log('shot           eye    W px   H px   aspect W:H   major/minor');
for (const name of shots) {
  const shot = SHOTS[name];
  if (!shot) { console.log(`${name.padEnd(14)} — no such shot`); continue; }

  const clip = CLIPS[shot.player.pose];
  const pb = new PoseBuffer(sly.boneNames).clear();
  sampleInto(clip, clip.hold ?? 0, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw?.[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const hb = sly.bp('hips');
  sly.bones.hips.position.set(hb.x + pb.pos.x, hb.y + pb.pos.y, hb.z + pb.pos.z);
  sly.root.position.fromArray(shot.player.pos);
  sly.root.rotation.set(0, shot.player.yaw ?? 0, 0);
  sly.root.updateMatrixWorld(true);

  const cam = new THREE.PerspectiveCamera(shot.fov ?? 45, W / H, 0.1, 500);
  cam.position.fromArray(shot.pos);
  cam.lookAt(new THREE.Vector3().fromArray(shot.target));
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

  const headM = sly.bones.head.matrixWorld;
  for (const side of [1, -1]) {
    const pts = [];
    let ctr = null;
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const th = side * EYE_TH + Math.cos(a) * eAx;
      const ph = EYE_PH + Math.sin(a) * eAy;
      const p = sly.headSurf(th, ph, 1.058).applyMatrix4(headM).project(cam);
      pts.push([p.x * W / 2, -p.y * H / 2]);
    }
    /* **THIS TOOL DELIBERATELY DOES NOT REPORT `facing`, AND THAT IS THE SECOND FIX HERE.**
       The first version computed it from the head BONE ORIGIN rather than the head SPHERE
       CENTRE — `headSurf` builds every point around `this.headCenter`, a bone-local offset — so
       every eye in every shot came back `facing < 0`, including `sly-closeup`, whose frame plainly
       shows both eyes down the lens. The number looked plausible (−0.5, not NaN), which is why it
       survived a first read.

       Fixing the origin made the signs right and the MAGNITUDES still disagreed with
       `eyefacing.mjs` — 0.686 against 0.898 on `sly-closeup` L — because that tool uses the eye's
       own authored frame and this one used the sphere normal. Two defensible quantities, one
       name. §96.3 records exactly this hazard costing a false read when `shotsil`'s 5.91 was set
       against `headratio`'s 5.03, and the rule there was **do not cross-quote them**.
       So the column is gone rather than reconciled: `eyefacing.mjs` owns visibility, this tool
       owns shape, and a row here is not evidence until that tool says the eye is visible. */

    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= n; syy /= n; sxy /= n;
    /* Principal axes of the projected outline. The boundary is sampled uniformly in the ANGLE
       PARAMETER, not in arc length, so for (a cos t, b sin t) the variances are a^2/2 and b^2/2
       — semi-axis = sqrt(2*lambda), full extent = 2*sqrt(2*lambda).
       The first version used 4*sqrt(lambda), over-scaling by sqrt(2), and it printed a major
       axis of 74.2 px inside a 50.0 x 46.9 px bounding box — a chord longer than the box's own
       68.5 px diagonal, which is impossible. **That impossibility is the check**: the extents and
       the axes are computed by two independent routes from the same points, so they can falsify
       each other, and the tool now asserts it rather than leaving it to be noticed. */
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    const major = 2 * Math.sqrt(Math.max(0, 2 * l1)), minor = 2 * Math.sqrt(Math.max(0, 2 * l2));
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
    /* Axis-aligned extents too: "wide vs tall" is a screen-vertical question, and a tilted
       ellipse can have a long major axis while still being short in screen height. */
    const wpx = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const hpx = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    const diag = Math.hypot(wpx, hpx);
    /* Tolerance is 2%, not 0.1%. At 0.1% this fired on `hero` R (minor axis 0.4 px) and
       `combat` R (4.9 px) at ratios of 1.0007 and 1.0025 — degenerate near-edge-on ellipses
       where 128 boundary samples cannot resolve the minor axis, not a real disagreement. A
       consistency check tuned so tightly that sampling noise trips it stops being a check and
       becomes a second thing to explain away. The degenerate case is reported on its own terms
       below instead. */
    if (major > diag * 1.02) {
      console.log(`  !! INCONSISTENT: major ${major.toFixed(1)} > bbox diagonal ${diag.toFixed(1)} `
        + '— the axes and the extents disagree, so neither is quotable.');
    }
    const degen = minor < 6;

    console.log(`${(side > 0 ? name : '').padEnd(14)} ${(side > 0 ? 'L' : 'R')}    `
      + `${wpx.toFixed(1).padStart(5)}  ${hpx.toFixed(1).padStart(5)}   `
      + `${(wpx / hpx).toFixed(3).padStart(6)}      `
      + `${major.toFixed(1).padStart(5)}/${minor.toFixed(1)} @${ang.toFixed(0).padStart(4)}°`
      + `${degen ? '   EDGE-ON — aspect not meaningful' : ''}`);
  }
}
console.log('\naspect W:H is the number the routing asked for. 1.0 = as tall as it is wide.');
console.log('VISIBILITY IS NOT MEASURED HERE — run `node tools/eyefacing.mjs` and discard any row');
console.log('whose eye that tool calls FACING AWAY. This tool owns shape and nothing else.');

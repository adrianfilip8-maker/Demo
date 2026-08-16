/**
 * alertframe.mjs — stage a two-subject frame before authoring it into `Shots.js`.
 *
 * Every canonical shot so far frames ONE subject: Sly, or a guard, or the architecture.
 * `alert` has to frame a *relationship* — Sly, the guard who has just seen him, and the alert
 * mark FX puts above that guard's head — and the failure modes of a two-subject frame are not
 * the ones the existing tools look for. `charvis` answers "is the character occluded", which is
 * necessary and not sufficient here; nothing answers "do the two subjects overlap", "is the
 * mark inside the frame", or "is either one falling off an edge".
 *
 * That last one is not hypothetical. `Shots.js`'s own header records `temple` and `courtyard`
 * shipping with the figure's feet below the bottom edge, and the `sly-profile` entry records
 * the same defect shipped a *third* time in a brand-new shot and caught only because the
 * landmarks were projected through the real camera instead of eyeballed. This tool is that
 * projection, made routine.
 *
 *   node tools/alertframe.mjs                  # score the built-in candidate set
 *   node tools/alertframe.mjs --shot alert     # score a candidate already in SHOTS
 *
 * ── What it measures, and why each one ──────────────────────────────────────────────────────
 *
 *   rows/cols     the pixel box each subject occupies at 1280x720, the critic's resolution
 *                 rather than the harness's 900 rows — a frame is judged at the size it is read
 *   margins       distance from each frame edge. A subject touching an edge is cropped, and
 *                 "cropped" is the defect this file exists to stop shipping a fourth time
 *   overlap       the two subjects' boxes intersected. Two figures merging into one silhouette
 *                 is the specific way a relationship frame fails while every single-subject
 *                 check passes
 *   mark          the alert mark at guard.y + 1.55 (Particles.js `_onGuardAlert`: "head height —
 *                 the mark belongs where his attention is, not at his boots"). If the mark is
 *                 outside the frame the shot has staged the FX it was built for out of view
 *   clear         a ray from the lens to each subject against real architecture triangles
 *
 * ── What it CANNOT tell you, stated plainly ─────────────────────────────────────────────────
 *
 * Architecture only, exactly as `tools/lvl.mjs` and `charvis.mjs` warn: props, FX, decals, the
 * sky and terrain are invisible to it, and so is the character's own self-occlusion. Subjects
 * are approximated as upright boxes, not skinned meshes — `charvis` is the tool for real
 * silhouette visibility and should be run on any candidate this one likes. **A candidate that
 * passes here can still be a bad frame; a candidate that fails here cannot be a good one.**
 *
 * It also says nothing about light. Whether the mark reads against the night grade at tod 0.10
 * is a question for a capture, and per KNOWN_ISSUES §367 a capture is the one instrument that
 * *can* answer it — FX are among the few systems that do render live in a shot.
 */
import * as THREE from 'three';
import { execFileSync } from 'node:child_process';
import { buildLevel, trisIn, rayTri } from './lvl.mjs';
import { SHOTS } from '../src/core/Shots.js';

/* Provenance, for the reason `charvis.mjs` states in its own header: this tool loads
   `src/world/**`, so its numbers describe the tree at the moment it ran. A figure from it
   without a commit beside it has been measured against a tree that may no longer exist. */
const provenance = (() => {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src/'], { encoding: 'utf8' })
      .split('\n').filter((l) => l.length > 3).length > 0;
    return `${sha}${dirty ? ' +dirty(src)' : ''}`;
  } catch { return 'unknown'; }
})();

const W = 1280, H = 720;          // the critic's resolution, not the harness's

/** Sly is 1.8 m; a guard reads about 1.95 m in the nemes. Upright boxes, deliberately coarse. */
const SLY = { w: 0.62, h: 1.80 };
const GUARD = { w: 0.78, h: 1.95 };
const MARK_Y = 1.55;              // Particles.js _onGuardAlert
const MARK_R = 0.55;              // the mark's own radius, so "in frame" means all of it

/* ---------------------------------------------------------------------- */

function camFor(spec) {
  const cam = new THREE.PerspectiveCamera(spec.fov, W / H, 0.1, 600);
  cam.position.fromArray(spec.pos);
  cam.lookAt(new THREE.Vector3().fromArray(spec.target));
  if (spec.roll) cam.rotateZ(THREE.MathUtils.degToRad(spec.roll));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Project a world point to pixels. Returns null when it is behind the lens. */
function project(cam, x, y, z) {
  const v = new THREE.Vector3(x, y, z);
  const view = v.clone().applyMatrix4(cam.matrixWorldInverse);
  if (view.z > -1e-6) return null;                 // behind the camera
  v.project(cam);
  return { px: (v.x * 0.5 + 0.5) * W, py: (1 - (v.y * 0.5 + 0.5)) * H };
}

/** Pixel box of an upright box subject standing at (x, z) on ground `y`. */
function boxOf(cam, x, y, z, dims) {
  const pts = [];
  for (const dx of [-dims.w / 2, dims.w / 2]) {
    for (const dz of [-dims.w / 2, dims.w / 2]) {
      for (const dy of [0, dims.h]) {
        const p = project(cam, x + dx, y + dy, z + dz);
        if (!p) return null;                       // any corner behind the lens: unusable
        pts.push(p);
      }
    }
  }
  return {
    x0: Math.min(...pts.map((p) => p.px)), x1: Math.max(...pts.map((p) => p.px)),
    y0: Math.min(...pts.map((p) => p.py)), y1: Math.max(...pts.map((p) => p.py)),
  };
}

const overlapArea = (a, b) => {
  if (!a || !b) return 0;
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
};

const margins = (b) => (b ? {
  l: b.x0, r: W - b.x1, t: b.y0, b: H - b.y1,
} : null);

/* ---------------------------------------------------------------------- */

const { A } = await buildLevel();

/** Is the straight line from the lens to `p` clear of architecture? */
function clear(cam, p) {
  const o = cam.position;
  const d = new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z);
  const len = d.length();
  if (len < 1e-6) return true;
  d.multiplyScalar(1 / len);
  const box = new THREE.Box3().setFromPoints([o.clone(), new THREE.Vector3(p.x, p.y, p.z)]);
  box.expandByScalar(1.0);
  const tris = trisIn(A.root ?? A.group ?? A, box);
  for (const T of tris) {
    const t = rayTri(o.x, o.y, o.z, d.x, d.y, d.z, T);
    /* The 0.25 m near-cut keeps a subject's own footing slab from counting as its occluder. */
    if (t > 0.25 && t < len - 0.25) return false;
  }
  return true;
}

/* ---------------------------------------------------------------------- */

function score(name, c) {
  const cam = camFor(c);
  const sly = boxOf(cam, c.player.pos[0], c.player.pos[1], c.player.pos[2], SLY);
  const grd = boxOf(cam, c.guard[0], c.guard[1], c.guard[2], GUARD);
  const markC = project(cam, c.guard[0], c.guard[1] + MARK_Y, c.guard[2]);
  const markBox = boxOf(cam, c.guard[0], c.guard[1] + MARK_Y - MARK_R, c.guard[2],
    { w: MARK_R * 2, h: MARK_R * 2 });

  const faults = [];
  if (!sly) faults.push('SLY BEHIND LENS');
  if (!grd) faults.push('GUARD BEHIND LENS');
  if (!markC) faults.push('MARK BEHIND LENS');

  const ms = margins(sly), mg = margins(grd), mm = margins(markBox);
  for (const [who, m] of [['sly', ms], ['guard', mg], ['mark', mm]]) {
    if (!m) continue;
    for (const [edge, v] of Object.entries(m)) {
      if (v < 0) faults.push(`${who} CROPPED ${edge} by ${(-v).toFixed(0)} px`);
      else if (v < 24) faults.push(`${who} within ${v.toFixed(0)} px of ${edge}`);
    }
  }

  const ov = overlapArea(sly, grd);
  const slyArea = sly ? (sly.x1 - sly.x0) * (sly.y1 - sly.y0) : 0;
  const grdArea = grd ? (grd.x1 - grd.x0) * (grd.y1 - grd.y0) : 0;
  const ovFrac = slyArea && grdArea ? ov / Math.min(slyArea, grdArea) : 0;
  if (ovFrac > 0.25) faults.push(`SUBJECTS MERGE (${(ovFrac * 100).toFixed(0)}% of the smaller)`);

  const slyH = sly ? sly.y1 - sly.y0 : 0;
  const grdH = grd ? grd.y1 - grd.y0 : 0;
  if (slyH < 90) faults.push(`sly only ${slyH.toFixed(0)} px tall`);
  if (grdH < 90) faults.push(`guard only ${grdH.toFixed(0)} px tall`);

  /* Group extent and balance. The first candidate set all scored "no faults" while putting both
     figures inside 20% of the frame width with the other 80% empty — every per-subject check
     passed and the composition was still dead. A relationship frame is about the space BETWEEN
     two subjects, so the span they occupy together, and where that span sits, are the quantities
     the per-subject checks structurally cannot see. Added after the first sweep, which is worth
     recording: the metric was missing because the tool was built one subject at a time. */
  let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
  for (const b of [sly, grd, markBox]) {
    if (!b) continue;
    gx0 = Math.min(gx0, b.x0); gx1 = Math.max(gx1, b.x1);
    gy0 = Math.min(gy0, b.y0); gy1 = Math.max(gy1, b.y1);
  }
  const spanW = Number.isFinite(gx0) ? (gx1 - gx0) / W : 0;
  const spanH = Number.isFinite(gy0) ? (gy1 - gy0) / H : 0;
  const centreOff = Number.isFinite(gx0) ? ((gx0 + gx1) / 2 - W / 2) / W : 0;
  /* 0.20, and the number is derived rather than picked — `--calibrate` prints the derivation.
     Over the fifteen shipped shots that stage a visible character, subject width runs 2.8% to
     45.7% of the frame with a MEDIAN of 11.1%. The five character-sheet cameras — the ones
     deliberately framed so the figure can be read — cluster tightly at 19.0-19.8%. So 20% is
     "as much picture as this project gives a subject it actually wants looked at", and a frame
     with two subjects plus a mark should clear at least that.

     My first draft of this bar was 0.34, invented on the spot with nothing behind it, and it
     failed candidate A at 21% — a framing the shipped set says is fine. Calibrating first would
     have cost five minutes; instead it sent me off redesigning the staging in the wrong
     direction. An undocumented threshold is not a weaker version of a measurement, it is a
     different thing wearing its clothes. */
  if (spanW < 0.20) faults.push(`GROUP SPANS ONLY ${(spanW * 100).toFixed(0)}% of the width (bar 20%, see --calibrate)`);
  if (Math.abs(centreOff) > 0.16) faults.push(`group centre ${(centreOff * 100).toFixed(0)}% off frame centre`);

  const slyClear = sly ? clear(cam, { x: c.player.pos[0], y: c.player.pos[1] + 1.2, z: c.player.pos[2] }) : false;
  const grdClear = grd ? clear(cam, { x: c.guard[0], y: c.guard[1] + 1.2, z: c.guard[2] }) : false;
  const markClear = markC ? clear(cam, { x: c.guard[0], y: c.guard[1] + MARK_Y, z: c.guard[2] }) : false;
  if (!slyClear) faults.push('SLY OCCLUDED');
  if (!grdClear) faults.push('GUARD OCCLUDED');
  if (!markClear) faults.push('MARK OCCLUDED');

  console.log(`\n── ${name}`);
  console.log(`   cam ${c.pos.map((v) => v.toFixed(2)).join(', ')} -> ${c.target.map((v) => v.toFixed(2)).join(', ')} · fov ${c.fov} · tod ${c.tod ?? '-'}`);
  if (sly) console.log(`   sly    rows ${sly.y0.toFixed(0)}..${sly.y1.toFixed(0)} (${slyH.toFixed(0)} px) cols ${sly.x0.toFixed(0)}..${sly.x1.toFixed(0)} · margins l${ms.l.toFixed(0)} r${ms.r.toFixed(0)} t${ms.t.toFixed(0)} b${ms.b.toFixed(0)} · ${slyClear ? 'clear' : 'OCCLUDED'}`);
  if (grd) console.log(`   guard  rows ${grd.y0.toFixed(0)}..${grd.y1.toFixed(0)} (${grdH.toFixed(0)} px) cols ${grd.x0.toFixed(0)}..${grd.x1.toFixed(0)} · margins l${mg.l.toFixed(0)} r${mg.r.toFixed(0)} t${mg.t.toFixed(0)} b${mg.b.toFixed(0)} · ${grdClear ? 'clear' : 'OCCLUDED'}`);
  if (markC) console.log(`   mark   at ${markC.px.toFixed(0)},${markC.py.toFixed(0)} · margins l${mm.l.toFixed(0)} r${mm.r.toFixed(0)} t${mm.t.toFixed(0)} b${mm.b.toFixed(0)} · ${markClear ? 'clear' : 'OCCLUDED'}`);
  console.log(`   overlap ${(ovFrac * 100).toFixed(1)}% of the smaller subject · group spans ` +
    `${(spanW * 100).toFixed(0)}%w ${(spanH * 100).toFixed(0)}%h, centre ${(centreOff * 100).toFixed(0)}% off`);
  console.log(`   ${faults.length ? 'FAULTS: ' + faults.join(' · ') : 'no faults'}`);
  return faults.length;
}

/* ---------------------------------------------------------------------- */
/* candidates                                                              */
/* ---------------------------------------------------------------------- */

/**
 * The guard stands on `courtyard_ring`, which is the route the `guard` shot already uses and
 * the only closed loop that runs the full length of the west colonnade. Waypoints from
 * `Patrol.js:241`: (-18.0, 28.5), (-18.0, 16.0), (-18.0, 1.0), (-18.0, -10.0), (-6.0, -13.0).
 *
 * Sly is placed toward the court's centre so the two figures separate across the frame rather
 * than stacking, and so the colonnade runs behind them rather than between them.
 */
const CANDIDATES = {
  /* The first four all put both figures inside 20% of the frame width. The cause was distance:
     the guard was parked at his own waypoint 8-11 m from Sly and the camera then had to stand
     far enough back to hold both, which shrinks each of them and empties the frame. `SHOT_POSE`
     already says what the right separation is — `minDist: 4.5, maxDist: 17` — and an alert is
     the moment the distance CLOSES, so the bottom of that range is the honest staging. The
     candidates below walk the guard down `courtyard_ring` toward Sly instead of moving the lens
     back. Waypoints from Patrol.js:241 are (-18.0, 28.5) (-18.0, 16.0) (-18.0, 1.0), so a guard
     between them stays on his own authored line. */
  'A far guard, wide court': {
    pos: [-4.0, 4.2, 26.5], target: [-14.0, 2.0, 15.0], fov: 46, tod: 0.10,
    player: { pos: [-9.5, 0, 20.0] }, guard: [-18.0, 0, 16.0],
  },
  'E close guard, 5.6 m apart': {
    pos: [-6.5, 3.0, 27.5], target: [-14.6, 1.5, 19.5], fov: 44, tod: 0.10,
    player: { pos: [-11.5, 0, 21.5] }, guard: [-16.0, 0, 18.5],
  },
  'F closer lens, 6.4 m apart': {
    pos: [-5.0, 2.8, 27.0], target: [-15.2, 1.4, 19.0], fov: 40, tod: 0.10,
    player: { pos: [-11.0, 0, 22.0] }, guard: [-17.0, 0, 18.0],
  },
  'G low angle, guard nearer the lens': {
    pos: [-7.0, 2.2, 26.0], target: [-15.5, 1.5, 19.0], fov: 46, tod: 0.10,
    player: { pos: [-12.5, 0, 22.5] }, guard: [-17.5, 0, 18.0],
  },
};

const args = process.argv.slice(2);
const shotArg = args.indexOf('--shot');

/**
 * `--calibrate` — what fraction of the frame do the shots this project ALREADY ACCEPTS give
 * their subject?
 *
 * The first version of this tool failed a candidate for "GROUP SPANS ONLY 21% of the width"
 * against a 34% bar I had invented on the spot with nothing behind it. That is the same move
 * §141.1 forbids, taken in advance rather than after the fact, and it is worse in one respect:
 * a threshold with no derivation cannot be argued with. So the bar comes from the shipped set
 * instead. Run this before trusting any span fault.
 */
if (args.includes('--calibrate')) {
  console.log('\ncalibration — subject width as a fraction of frame, over the shipped shots\n');
  const rows = [];
  for (const [name, s] of Object.entries(SHOTS)) {
    if (!s.player?.pos || s.hidePlayer) continue;
    const cam = camFor(s);
    const b = boxOf(cam, s.player.pos[0], s.player.pos[1], s.player.pos[2], SLY);
    if (!b) { rows.push([name, null]); continue; }
    rows.push([name, (b.x1 - b.x0) / W, (b.y1 - b.y0) / H]);
  }
  for (const [name, w, h] of rows) {
    console.log(w == null
      ? `  ${name.padEnd(14)} subject is behind the lens`
      : `  ${name.padEnd(14)} ${(w * 100).toFixed(1)}% of width · ${(h * 100).toFixed(1)}% of height`);
  }
  const ws = rows.filter((r) => r[1] != null).map((r) => r[1]).sort((a, b) => a - b);
  const med = ws[Math.floor(ws.length / 2)];
  console.log(`\n  n=${ws.length} · min ${(ws[0] * 100).toFixed(1)}% · median ${(med * 100).toFixed(1)}% ` +
    `· max ${(ws[ws.length - 1] * 100).toFixed(1)}%`);
  console.log('  A ONE-subject frame here is the reference. A two-subject frame should exceed it,');
  console.log('  because the second figure has to buy its place with picture the first did not need.');
  process.exit(0);
}

console.log(`alertframe · ${W}x${H} · tree ${provenance}`);
console.log(`sly ${SLY.w}x${SLY.h} m · guard ${GUARD.w}x${GUARD.h} m · mark at guard.y+${MARK_Y} r${MARK_R}`);

if (shotArg >= 0) {
  const name = args[shotArg + 1];
  const s = SHOTS[name];
  if (!s) { console.error(`no shot "${name}" in SHOTS`); process.exit(2); }
  if (!s.guard) { console.error(`shot "${name}" has no \`guard\` field for this tool to frame`); process.exit(2); }
  process.exit(score(name, s) ? 1 : 0);
}

let clean = 0;
for (const [name, c] of Object.entries(CANDIDATES)) if (score(name, c) === 0) clean++;
console.log(`\n${clean}/${Object.keys(CANDIDATES).length} candidates with no faults`);

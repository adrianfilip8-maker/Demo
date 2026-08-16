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
import { writeFileSync } from 'node:fs';
import { SHOTS } from '../src/core/Shots.js';
/* The five projection primitives live in `framelib.mjs` since `impactframe.mjs` was written
   and needed the identical five. The one thing that must never happen is two staging tools
   disagreeing about where a point lands, and two copies is how that happens. */
import {
  W, H, SLY, GUARD, provenance, camFor, project, boxOf, overlapArea, margins, clear,
  assertOccluded, assertVisible,
} from './framelib.mjs';

/* Both halves, before a single verdict prints. `clear()` answered "clear" unconditionally for
   this tool's whole life (§396.2), and the one-sided calibration that caught it could not have
   caught the opposite failure — which is what actually bit this shot (§401). */
console.log(assertOccluded());
console.log(assertVisible());

const MARK_Y = 1.55;              // Particles.js _onGuardAlert

/* ── MARK_R WAS 0.55 FOR BOTH RUNGS, AND IT IS A PROXY (§405's defect, third instance) ──────
 * Derived from the emitters' own data and `PARTICLE_VERT`'s expressions, at the staged ages:
 *
 *   rung 3  alert_spot    travel 0.483 + puff sz 0.769  ->  envelope 1.333 m   2.42x 0.55
 *   rung 2  alert_search  travel 0.267 + puff sz 0.530  ->  envelope 0.857 m   1.56x 0.55
 *
 * The sharpest form needs no cluster argument: **a single rung-3 puff's half-extent is 0.769 m,
 * 1.4x the old constant.** The framing circle did not contain one sprite, let alone the 8-11 the
 * emitter stages.
 *
 * The asymmetry is the tell. `_emit`'s `speedScale` is `opts.speed ?? 1` and `_stageAlert` passes
 * none, so the rung's `scale: 1.15` multiplies SIZE ONLY, never travel — which is why rung 3 is
 * out by 2.4x while rung 2, at scale 1.0, is out by 1.4x, and why rung 2's typical member
 * (0.52-0.58 m) lands almost exactly on 0.55. **0.55 looks fitted to a typical rung-2 puff and
 * then applied to both rungs.**
 *
 * Two bars read this and they failed in OPPOSITE directions. Cropping under-measured, so the tool
 * could certify "in frame" a mark that is cropped — the dangerous direction, and the reason this
 * is corrected before a re-certification rather than after. The 30 px readability bar erred safe,
 * rejecting candidates whose mark actually reads at ~2.4x the measured width. `markClear` casts to
 * the centre and is unaffected.
 *
 * The dt = 1/60 figures are used, not dt = 0: `Debug.setShot` without `opts.dt` runs a LIVE clock
 * (§370), and a cropping check should be made against the larger of the two paths.
 *
 * DERIVED, NOT MEASURED, and the difference matters: this is geometric extent, and a soft
 * sprite's visible extent is smaller than its quad. §405 measured the RING's light reaching ~sz,
 * but that is the ring's atlas tile and not the dust's. Confirming it wants an `alert` capture. */
const MARK_R3 = 1.333;            // rung 3, alert_spot at scale 1.15
const MARK_R2 = 0.857;            // rung 2, alert_search at scale 1.0

/* ---------------------------------------------------------------------- */

/**
 * The staging is now known, so the tool has to match it. `Particles._stageAlert()` places
 * **rung 3** (`alert_spot` + `alert_spot_spark`) at the NEAREST guard's head and, when a second
 * guard exists, **rung 2** (`alert_search`) at the next-nearest — both at `+1.55 m`, which is
 * `_onGuardAlert`'s own head-height offset, so a staged frame and a played one put the mark in
 * the same place.
 *
 * That second rung is the point of the shot rather than a bonus. The registered claim (T3) is
 * that four rungs read APART — strictly increasing, ≥1.6x per step. Recomputed from the
 * catalogue against T3's own `loudness` (`mean(count) × mean(alpha) × size[0]²`):
 *
 *   patrol 0.00366 → suspicious 0.01852 → searching 0.06014 → chase 0.21529
 *   steps 5.06x · 3.25x · 3.58x
 *
 * **One rung in a frame cannot evidence a ladder.** So a candidate that frames only one guard is
 * not a candidate for this shot, and `guard2` is required rather than optional.
 *
 * CORRECTION. This header previously cited "rung 3 at loudness 0.0177 against rung 2's 0.00949,
 * a 1.9x step", and both halves of that pair are wrong. `0.0177` is `Particles.js:3577`'s
 * figure, which is a DIFFERENT quantity from T3's (it does not reproduce from the catalogue
 * under T3's formula either, and is a separate open question about that comment). `0.00949`
 * appears nowhere in the tree at all. The real rung2→rung3 step is **3.58x, not 1.9x**, which
 * makes every argument here that leaned on it stronger rather than weaker — but a citation that
 * happens to argue in your favour is still a citation you have to be able to produce.
 */
function score(name, c, quiet = false, tally = null, rank = null) {
  const cam = camFor(c);
  const sly = boxOf(cam, c.player.pos[0], c.player.pos[1], c.player.pos[2], SLY);
  const grd = boxOf(cam, c.guard[0], c.guard[1], c.guard[2], GUARD);
  const markC = project(cam, c.guard[0], c.guard[1] + MARK_Y, c.guard[2]);
  const markBox = boxOf(cam, c.guard[0], c.guard[1] + MARK_Y - MARK_R3, c.guard[2],
    { w: MARK_R3 * 2, h: MARK_R3 * 2 });

  /* The second guard and its rung-2 mark, if the candidate stages one. */
  const g2 = c.guard2 || null;
  const grd2 = g2 ? boxOf(cam, g2[0], g2[1], g2[2], GUARD) : null;
  const mark2Box = g2
    ? boxOf(cam, g2[0], g2[1] + MARK_Y - MARK_R2, g2[2], { w: MARK_R2 * 2, h: MARK_R2 * 2 })
    : null;

  const faults = [];
  if (!sly) faults.push('SLY BEHIND LENS');
  if (!grd) faults.push('GUARD BEHIND LENS');
  if (!markC) faults.push('MARK BEHIND LENS');

  if (!g2) faults.push('NO SECOND GUARD — one rung cannot evidence a ladder (T3)');
  if (g2 && !grd2) faults.push('GUARD2 BEHIND LENS');

  const ms = margins(sly), mg = margins(grd), mm = margins(markBox);
  const mg2 = margins(grd2), mm2 = margins(mark2Box);
  for (const [who, m] of [['sly', ms], ['guard', mg], ['mark', mm], ['guard2', mg2], ['mark2', mm2]]) {
    if (!m) continue;
    for (const [edge, v] of Object.entries(m)) {
      if (v < 0) faults.push(`${who} CROPPED ${edge} by ${(-v).toFixed(0)} px`);
      else if (v < 24) faults.push(`${who} within ${v.toFixed(0)} px of ${edge}`);
    }
  }

  /* Pairwise, because with three figures the merge can happen between any two of them. */
  const area = (b) => (b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0);
  let ovFrac = 0;
  for (const [an, a] of [['sly', sly], ['guard', grd], ['guard2', grd2]]) {
    for (const [bn, b] of [['sly', sly], ['guard', grd], ['guard2', grd2]]) {
      if (an >= bn || !a || !b) continue;
      const f = overlapArea(a, b) / Math.max(1, Math.min(area(a), area(b)));
      if (f > ovFrac) ovFrac = f;
      if (f > 0.25) faults.push(`${an}/${bn} MERGE (${(f * 100).toFixed(0)}% of the smaller)`);
    }
  }

  const slyH = sly ? sly.y1 - sly.y0 : 0;
  const grdH = grd ? grd.y1 - grd.y0 : 0;
  if (slyH < 90) faults.push(`sly only ${slyH.toFixed(0)} px tall`);
  if (grdH < 90) faults.push(`guard only ${grdH.toFixed(0)} px tall`);

  /* No figure-height bar on guard2, deliberately — he is a background figure and a smaller one is
     correct staging. What has to survive is his MARK, because rung 2 is the entire reason he is in
     the shot: the frame's job is to show two rungs reading apart, and a rung nobody can resolve
     shows one. So the bar is on the mark's drawn diameter, not on the man carrying it.
     30 px, derived: rung 2 scores 0.06014 against rung 3's 0.21529 on T3's own loudness, a
     3.58x step (see the header's correction — the 1.9x this used to cite was two figures from
     two different quantities, one of which does not exist). A 3.58x difference in a soft puff
     still needs enough pixels to be read as brightness rather than as aliasing, and 30 px is
     roughly the size at which the ink hull's own ~2.5 px line stops dominating a round shape —
     an order of magnitude above it. The wider real step means this bar has MORE headroom than
     it was set with, not less, so it is left where it is rather than loosened to match: a bar
     is re-scoped when nothing depends on the answer (§141.1), and `alert` now ships against
     this one. */
  const markPx = (b) => (b ? Math.max(b.x1 - b.x0, b.y1 - b.y0) : 0);
  const m3px = markPx(markBox), m2px = markPx(mark2Box);
  if (markBox && m3px < 30) faults.push(`rung-3 mark only ${m3px.toFixed(0)} px across`);
  if (mark2Box && m2px < 30) faults.push(`rung-2 mark only ${m2px.toFixed(0)} px across — the ladder contrast is unreadable`);

  /* Group extent and balance. The first candidate set all scored "no faults" while putting both
     figures inside 20% of the frame width with the other 80% empty — every per-subject check
     passed and the composition was still dead. A relationship frame is about the space BETWEEN
     two subjects, so the span they occupy together, and where that span sits, are the quantities
     the per-subject checks structurally cannot see. Added after the first sweep, which is worth
     recording: the metric was missing because the tool was built one subject at a time. */
  let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
  for (const b of [sly, grd, markBox, grd2, mark2Box]) {
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
  const grd2Clear = grd2 ? clear(cam, { x: g2[0], y: g2[1] + 1.2, z: g2[2] }) : true;
  const mark2Clear = grd2 ? clear(cam, { x: g2[0], y: g2[1] + MARK_Y, z: g2[2] }) : true;
  if (!slyClear) faults.push('SLY OCCLUDED');
  if (!grdClear) faults.push('GUARD OCCLUDED');
  if (!markClear) faults.push('MARK OCCLUDED');
  if (!grd2Clear) faults.push('GUARD2 OCCLUDED');
  if (!mark2Clear) faults.push('MARK2 OCCLUDED');

  if (!quiet) {
  console.log(`\n── ${name}`);
  console.log(`   cam ${c.pos.map((v) => v.toFixed(2)).join(', ')} -> ${c.target.map((v) => v.toFixed(2)).join(', ')} · fov ${c.fov} · tod ${c.tod ?? '-'}`);
  if (sly) console.log(`   sly    rows ${sly.y0.toFixed(0)}..${sly.y1.toFixed(0)} (${slyH.toFixed(0)} px) cols ${sly.x0.toFixed(0)}..${sly.x1.toFixed(0)} · margins l${ms.l.toFixed(0)} r${ms.r.toFixed(0)} t${ms.t.toFixed(0)} b${ms.b.toFixed(0)} · ${slyClear ? 'clear' : 'OCCLUDED'}`);
  if (grd) console.log(`   guard  rows ${grd.y0.toFixed(0)}..${grd.y1.toFixed(0)} (${grdH.toFixed(0)} px) cols ${grd.x0.toFixed(0)}..${grd.x1.toFixed(0)} · margins l${mg.l.toFixed(0)} r${mg.r.toFixed(0)} t${mg.t.toFixed(0)} b${mg.b.toFixed(0)} · ${grdClear ? 'clear' : 'OCCLUDED'}`);
  if (markC) console.log(`   mark3  at ${markC.px.toFixed(0)},${markC.py.toFixed(0)} · margins l${mm.l.toFixed(0)} r${mm.r.toFixed(0)} t${mm.t.toFixed(0)} b${mm.b.toFixed(0)} · ${markClear ? 'clear' : 'OCCLUDED'}`);
  if (grd2) console.log(`   guard2 rows ${grd2.y0.toFixed(0)}..${grd2.y1.toFixed(0)} (${(grd2.y1 - grd2.y0).toFixed(0)} px) cols ${grd2.x0.toFixed(0)}..${grd2.x1.toFixed(0)} · margins l${mg2.l.toFixed(0)} r${mg2.r.toFixed(0)} t${mg2.t.toFixed(0)} b${mg2.b.toFixed(0)} · ${grd2Clear ? 'clear' : 'OCCLUDED'}`);
  if (mark2Box) console.log(`   mark2  margins l${mm2.l.toFixed(0)} r${mm2.r.toFixed(0)} t${mm2.t.toFixed(0)} b${mm2.b.toFixed(0)} · ${mark2Clear ? 'clear' : 'OCCLUDED'}`);
  console.log(`   marks  rung3 ${m3px.toFixed(0)} px across · rung2 ${m2px.toFixed(0)} px (bar 30)`);
  console.log(`   overlap ${(ovFrac * 100).toFixed(1)}% of the smaller subject · group spans ` +
    `${(spanW * 100).toFixed(0)}%w ${(spanH * 100).toFixed(0)}%h, centre ${(centreOff * 100).toFixed(0)}% off`);
  console.log(`   ${faults.length ? 'FAULTS: ' + faults.join(' · ') : 'no faults'}`);
  }
  if (tally) for (const f of faults) tally.set(f.replace(/ (by|only) .*/, ''), (tally.get(f.replace(/ (by|only) .*/, '')) || 0) + 1);
  /* What the shot is FOR, exposed so a sweep can order its survivors by it. The bars decide
     admission; this decides which admitted frame shows the ladder best, and it is the same
     quantity H was chosen over J on: rung 3 against rung 2 in drawn pixels. Reported, never
     used as a gate — `impactframe`'s sweep proved what happens when a composite is allowed to
     admit (its calibration candidate ranked FIRST and cropped on six edges). */
  if (rank) rank.last = { m3px, m2px, sep: m2px > 0 ? m3px / m2px : 0, spanW, spanH, slyH };
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
  'A far guard, wide court (one guard — kept as the control)': {
    pos: [-4.0, 4.2, 26.5], target: [-14.0, 2.0, 15.0], fov: 46, tod: 0.10,
    player: { pos: [-9.5, 0, 20.0] }, guard: [-18.0, 0, 16.0],
  },
  /* Two guards on `courtyard_ring`, both on their own authored line: the nearest takes rung 3,
     the one further down the colonnade takes rung 2. Separating them ALONG the run of the
     colonnade rather than across it is what buys the group its width — the lesson from the first
     sweep, where clustering the figures in world space shrank the angular span. */
  'H two guards down the colonnade': {
    pos: [-4.0, 4.2, 27.5], target: [-15.0, 2.0, 14.0], fov: 46, tod: 0.10,
    player: { pos: [-9.5, 0, 20.5] }, guard: [-18.0, 0, 16.0], guard2: [-18.0, 0, 1.0],
  },
  'I wider lens, guards further apart': {
    pos: [-3.0, 4.6, 29.0], target: [-15.5, 2.2, 12.0], fov: 52, tod: 0.10,
    player: { pos: [-9.0, 0, 22.0] }, guard: [-18.0, 0, 16.0], guard2: [-18.0, 0, 1.0],
  },
  'J second guard nearer, both on the west run': {
    pos: [-4.5, 3.8, 27.0], target: [-15.0, 1.8, 15.0], fov: 48, tod: 0.10,
    player: { pos: [-10.0, 0, 20.5] }, guard: [-18.0, 0, 16.0], guard2: [-18.0, 0, 7.0],
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
console.log(`sly ${SLY.w}x${SLY.h} m · guard ${GUARD.w}x${GUARD.h} m · marks at guard.y+${MARK_Y}, r${MARK_R3}/${MARK_R2}`);

if (shotArg >= 0) {
  const name = args[shotArg + 1];
  const s = SHOTS[name];
  if (!s) { console.error(`no shot "${name}" in SHOTS`); process.exit(2); }
  if (!s.guard) { console.error(`shot "${name}" has no \`guard\` field for this tool to frame`); process.exit(2); }
  process.exit(score(name, s) ? 1 : 0);
}

/**
 * `--search` — where CAN a lens see all three subjects, and which of those frame well?
 *
 * Written because the four hand-authored candidates below were all scored by a `clear()` that
 * returned true unconditionally (§396.2, §401), and every one of them re-scores as OCCLUDED on
 * every subject. A hand-picked candidate set is only as good as the checker that admitted it, and
 * this one admitted a camera standing behind `arch:court:sandstone_block`.
 *
 * So the search does the admission first and the framing second, which is the order that was
 * wrong before: sweep camera cells, keep only those with a clear line to all three subjects, and
 * score the survivors with the SAME `score()` the authored candidates go through — no second
 * scorer, no second set of bars.
 */
if (args.includes('--search')) {
  /* `ALERT_SLY=x,z` overrides the stand, because the stand is a variable of the search and not
     a constant of it. The shipped stand is the ROOT CAUSE of this shot's occlusion: at
     (-9.5, 20.5) a `sandstone_worn` block sits 1.07 m from Sly and cuts his line to `guard2`
     entirely — the two subjects cannot see each other, let alone share a lens. Sweeping cameras
     against a stand that is itself wrong is how the first two sweeps returned 0 of 158 and 0 of
     148 and told me to widen the lens. */
  const SLY_OVERRIDE = process.env.ALERT_SLY?.split(',').map(Number);
  const P = SLY_OVERRIDE ? [SLY_OVERRIDE[0], 0, SLY_OVERRIDE[1]] : SHOTS.alert.player.pos;
  const G = SHOTS.alert.guard, G2 = SHOTS.alert.guard2;
  if (SLY_OVERRIDE) console.log(`  (stand overridden to ${P[0]}, ${P[2]})`);
  /* THE SAME POINTS `score()` TESTS, and that is not a detail. The first version of this sweep
     probed chest at +0.9 / +1.0 while `score()` probes +1.2 and the mark at +1.55, so it
     admitted 158 cells whose chest was clear and whose head was not — and 111 of them then
     reported SLY OCCLUDED in the very scores the sweep had pre-filtered for visibility. Two
     probes of "the same thing" at different points, disagreeing, which is the cast-origin
     lesson `tests/traversal.test.mjs`'s header spells out, committed here by the person who
     had just finished reading it. A pre-filter that does not ask the scorer's question is not
     a pre-filter, it is a second opinion. */
  const subj = [
    { x: P[0], y: P[1] + 1.2, z: P[2] },
    { x: G[0], y: G[1] + 1.2, z: G[2] },
    { x: G[0], y: G[1] + MARK_Y, z: G[2] },
    { x: G2[0], y: G2[1] + 1.2, z: G2[2] },
    { x: G2[0], y: G2[1] + MARK_Y, z: G2[2] },
  ];
  /* Aim at the centroid of the three, at chest height: the shot frames a relationship, so the
     subject of the camera is the group rather than any one of them. */
  /* `/ subj.length`, and it was `/ 3` — a hard-coded divisor left behind when the subject list
     grew from three points to five to match `score()`'s probe heights. It aimed the camera at
     (-29.17, 2.23, 14.50), which is outside the level, and SIXTEEN candidates still scored clean
     against it: the bars are all relative to the frame, so a wrong aim that happens to leave the
     group inside the frustum passes every one of them. A constant that does not follow its data
     is the same defect as a comment that does not follow its code, and it is quieter. */
  const tgt = [
    subj.reduce((a, s) => a + s.x, 0) / subj.length,
    subj.reduce((a, s) => a + s.y, 0) / subj.length,
    subj.reduce((a, s) => a + s.z, 0) / subj.length,
  ];
  const found = [];
  const TALLY = new Map();
  const RANK = { last: null };
  let cells = 0;
  for (let x = -26; x <= 10; x += 2) {
    for (let z = -6; z <= 34; z += 2) {
      for (const y of [3.0, 4.2, 5.5, 7.0]) {
        const cam = { position: new THREE.Vector3(x, y, z) };
        if (!subj.every((t) => clear(cam, t))) continue;
        cells++;
        for (const fov of [34, 40, 46, 52, 60, 68]) {
          const c = {
            pos: [x, y, z], target: tgt, fov, tod: SHOTS.alert.tod,
            player: { ...SHOTS.alert.player, pos: P }, guard: G, guard2: G2,
          };
          const f = score(`x${x} y${y} z${z} fov${fov}`, c, true, TALLY, RANK);
          if (f === 0) found.push({ x, y, z, fov, ...RANK.last });
        }
      }
    }
  }
  console.log(`\n${cells} camera cells see all three subjects · ${found.length} of those also frame clean`);
  /* WHY they fail is the actionable half. A sweep that reports only a count tells you to widen
     it; a sweep that reports which bar bit tells you whether widening can possibly help. */
  const ranked = [...TALLY.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  fault frequency across the scored cells:');
  for (const [k, n] of ranked.slice(0, 10)) console.log(`    ${String(n).padStart(4)}x  ${k}`);
  found.sort((a, b) => b.sep - a.sep);
  writeFileSync(new URL('../progress/records/alertsearch.json', import.meta.url),
    JSON.stringify({ stand: P, target: tgt, found }, null, 2));
  console.log(`  ranked by rung separation (rung3 px : rung2 px) — the quantity this shot exists to show:`);
  for (const f of found.slice(0, 12)) {
    console.log(`   pos [${f.x}, ${f.y}, ${f.z}] fov ${f.fov}  sep ${f.sep.toFixed(2)}x `
      + `(${f.m3px.toFixed(0)}:${f.m2px.toFixed(0)} px) · span ${(f.spanW * 100).toFixed(0)}%w ${(f.spanH * 100).toFixed(0)}%h · sly ${f.slyH.toFixed(0)} px`);
  }
  console.log(`  target [${tgt.map((v) => v.toFixed(2)).join(', ')}] · all ${found.length} written to progress/records/alertsearch.json`);
  if (!found.length) console.log('   nothing clean — widen the sweep or revisit the stands');
  process.exit(found.length ? 0 : 1);
}

let clean = 0;
for (const [name, c] of Object.entries(CANDIDATES)) if (score(name, c) === 0) clean++;
console.log(`\n${clean}/${Object.keys(CANDIDATES).length} candidates with no faults`);

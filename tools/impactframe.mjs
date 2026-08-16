/**
 * impactframe.mjs — stage the Cane Slam frame before authoring it into `Shots.js`.
 *
 * `alertframe` measures a relationship between two upright figures. This measures something
 * with a different shape entirely: **a figure standing inside a large flat ring on the floor**,
 * and the ways that fails are not the ways a two-figure frame fails.
 *
 *   node tools/impactframe.mjs                 # score the built-in candidate set
 *   node tools/impactframe.mjs --shot impact   # score the entry already in SHOTS
 *   node tools/impactframe.mjs --search        # sweep the camera domain for survivors
 *
 * ── EVERY EXTENT HERE IS MEASURED IN A FRAME, AND THAT IS THE POINT (§407) ───────────────────
 * The first version of this tool sized its subjects from the emitter recipes and from an upright
 * box, and every one of those numbers was wrong — one by 2.69x, one by 2.85x, one by 20%. The
 * numbers below come from differencing the shipped A/B arms in `shots/fxrim2-impact/`, and each
 * one is projected back through the camera it was measured in and shown to reproduce its own
 * pixels every time this tool runs. See `assertExtents()`.
 *
 * ── What `_stageImpact` puts on the floor ───────────────────────────────────────────────────
 *   dive_ring    size 0.4 -> 5.0 over a 0.34 s life, staged at age 0.088 (97.6% of peak ink)
 *   dive_dust    16-22 puffs, 3.5-7.5 m/s disc, staged at 0.279
 *   dive_debris  10-14 at 4-9 m/s in a cone, staged at 0.012   (shares the `dust` batch)
 *   dive_spark   14-18 at 7-13 m/s disc, staged at 0.002
 *   decal crack  2.2 x scale = 2.75 m across
 *   decal scuff  3.4 x scale = 4.25 m across      <- the widest ground mark
 *
 * ── THE BAR THAT WAS REMOVED, AND WHY THAT IS NOT §141.1 ────────────────────────────────────
 * This tool used to gate on FIGURE SWALLOWED: the fraction of Sly's box covered by the ring's
 * box, barred at 55%. **It is a tautology and no camera has ever been able to pass it.** Swept
 * over 727,608 cameras — distance 3-30 m, height 0.5-20 m, 24 azimuths, 7 lenses — 605,304 pass
 * the ellipse bar, 50,680 pass the coverage bar, and **0 pass both**.
 *
 *   h  1 m  elev  4.8°  ellipse 0.083  ring covers  44.8%
 *   h  3 m  elev 14.0°  ellipse 0.245  ring covers  88.1%
 *   h  4 m  elev 18.4°  ellipse 0.320  ring covers 100.0%   <- and 100.0% everywhere above
 *
 * The header this replaces claimed the two "pull opposite ways, which is the entire difficulty
 * of this frame". They do not. They move together, and past ~18° of elevation the coverage
 * figure is the constant 100% — because the ring is an **annulus 8 m across and the figure
 * stands in its hole**, so asking whether his box is inside the rectangle bounding the ring is
 * asking whether a man in the middle of a circle is inside that circle's bounding square.
 *
 * A metric that returns one value across the whole admissible domain cannot gate and cannot
 * rank. **§141.1 forbids moving a threshold after seeing which side a result landed on, and it
 * stands** — the claim here is not that 55% is too strict, it is that the quantity compared to
 * it is constant, which is provable without reference to any candidate. A bar may be replaced
 * when it is shown to carry no information; never when it is merely failed.
 *
 * ── AND THE REPLACEMENT WAS MEASURED AND REJECTED TOO ───────────────────────────────────────
 * The obvious repair is to ask the question the old bar's NAME asks: what fraction of the
 * figure's silhouette has the ring's bright annulus (r = 3.0-4.5 m, measured) directly behind
 * it? Built it, swept it over 324,720 cameras, and **it ranges 0.0% to 16.7%.** A bar anywhere
 * in that range is either unfirable or a number picked to make something fail; at the 35% that
 * looked natural it admitted all 324,720. That is the same defect wearing the opposite sign, so
 * it is recorded here rather than shipped — the next person to have this idea should know it has
 * been measured.
 *
 * **Legibility of the figure against the ink is a capture's question, not a projection's**, and
 * there is already an instrument for it: the `S-nosly` arm isolates the figure in pixels and
 * `fxrimscore` measures ink. It belongs there, where it can be measured instead of modelled.
 *
 * ── What this still CANNOT tell you ─────────────────────────────────────────────────────────
 * Everything `framelib`'s header says: architecture triangles only, no props, no FX, no decals,
 * no terrain, no self-occlusion, and nothing at all about light.
 */
import { SHOTS } from '../src/core/Shots.js';
import { TUNE as FX_TUNE } from '../src/fx/Particles.js';
import { RING_R_CROP, RING_R_DECLARED, ringPlaneY, RING_PLANE_LIFT, summary as ringSummary }
  from './ringextent.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  W, H, provenance, camFor, project, plateOf, discOf, margins, clear, assertOccluded,
  assertVisible, groundColumn,
} from './framelib.mjs';

const S = FX_TUNE.impactScale;
const SCUFF_R = 3.4 * S / 2;      // the widest ground mark: Particles._stageImpact

/* ── `discOf`'s SEGMENT COUNT IS A BAR, NOT A DETAIL ────────────────────────────────────────
 * `discOf` samples an INSCRIBED polygon, whose bounding box under-reports the circle's by
 * `1 - cos(pi/n)` in the worst case. Under-reporting extent is the PERMISSIVE direction for a
 * cropping test: it certifies "in frame" about a rim that is not.
 *
 * At the default 24 segments that bound is 8.56e-3 — **9 px on this shot's 1050 px ring**, a
 * third of the 24 px edge floor. At 180 it is 1.52e-4, or 0.16 px. Chosen by where the error
 * stops mattering against the bar it feeds, not by taste. */
const DISC_SEG = 180;
const NGON_BOUND = 1 - Math.cos(Math.PI / DISC_SEG);   // 1.52e-4

/* ── THE REFERENCE CAMERA — PINNED, NOT READ FROM `SHOTS` ───────────────────────────────────
 * Every measured constant below is a count of pixels, and pixels only mean a world extent
 * through a specific camera. This is that camera: the one `shots/fxrim2-impact/` was captured
 * with, which at the time was `SHOTS.impact`.
 *
 * It is a literal here and must stay one. Reading it from `SHOTS.impact` would mean the
 * calibration silently re-based itself the moment the shot is re-staged — which is the whole
 * purpose of this tool — and every constant would then "reproduce" against a camera it was
 * never measured in. A calibration that follows the thing it calibrates is not one. */
const REF = {
  pos: [5.4, 4.4, -2.6], target: [0.0, 0.6, -8.0], fov: 38,
  at: [0, 0, -8],
  src: 'shots/fxrim2-impact, src tree 2b06133ddf675387',
};

/* ── MEASURED EXTENTS ───────────────────────────────────────────────────────────────────────
 * `A-ship` minus each isolation arm, |dL| bbox, taken on the plateau where the bbox is stable
 * across thresholds rather than at a chosen one.
 *
 *   arm         plateau        drawn extent                    what it is
 *   S-nosly     |dL| 8..64     x 502..699, rows 303..498       the figure
 *   P-nodust    |dL| 4..16     x 404..930, rows 248..521       dive_dust + dive_debris
 *   P-noring    |dL| 4..64     x 0..1272,  rows 216..719       the ring's light, clipped l/r/b
 *
 * The impact point (0, 0, -8) projects to px 640.0, py 423.8 in that camera, which is what
 * converts these to world extents about the contact. */
const MEASURED = {
  sly:  { x0: 502, x1: 699, y0: 303, y1: 498 },
  dust: { x0: 404, x1: 930, y0: 248, y1: 521 },
};

/* The figure, as a camera-facing plate. 197 x 195 px at the reference camera's depth.
 *
 * NOT ground-anchored: the measured figure spans 121 px above the contact point's projection
 * and 74 px below it. A slam reaches under the contact plane, and the pose's own root motion
 * is (0, -0.6885, +0.1). Modelling it from the ground up put its crown 101 px above his head. */
const SLY_SLAM = { w: 1.565, yLo: -0.746, yHi: 1.106 };

/* The dust cloud, likewise. Half-width 2.44 m, -0.82 to +1.48 m about the contact.
 *
 * Sized to CONTAIN the measurement rather than fit it, because the consumer is a cropping test
 * and an extent that under-covers certifies "in frame" about pixels that are not. The drawn
 * cloud is not centred on the contact — it reaches 290 px right of it and 236 px left, the
 * asymmetry being wind (`dive_dust` carries wind 0.5) — so the symmetric plate takes the
 * greater reach.
 *
 * Cross-checked against the recipe rather than substituted for it: at speed <= 7.5 m/s under
 * drag 3.4, `v*(1-e^-kt)/k` = 1.35 m of travel by the staged age of 0.279 s, and the puffs reach
 * 1.70 m of half-extent, so the population's outer edge is at <= 3.05 m in the worst draw
 * against 2.44 m measured. The recipe bounds the measurement and the measurement lands inside
 * it. Neither number is quoted as the other. */
const DUST = { w: 4.878, yLo: -0.989, yHi: 1.569 };

/* ── THE RING'S EXTENT HAS FIVE TERMS AND THIS TOOL KNEW ABOUT ONE ──────────────────────────
 * `_stageImpact` returns 1.50 m; §405 corrected that to 4.035 m; **both are wrong, and the
 * second is wrong in the direction that ships a cropped frame.** `_emit` computes
 * `s = R.range(0.8, 1.25) * scale`, so `sz` is a random variable spanning 3.228 to 5.043 m, and
 * 4.035 m is its value at jitter exactly 1.0 — the number you get by leaving the jitter out.
 *
 * Four further terms, all measured by the FX lane off the buffers the GPU was handed, and
 * **every one makes the ring larger**: two live `dive_ring` instances against `count: [1, 1]`
 * (`Math.round` where the `+0.999` idiom needs `floor`, so every emitter can exceed its declared
 * maximum); the atlas UV window; the quad being a world-axis-aligned square seen corner-on; and
 * PLANAR sprites drifting `aV0 * age`, so the ground ring is drawn 0.088 m above the ground.
 *
 * The derivation lives in `ringextent.mjs` and is IMPORTED rather than repeated. It had been
 * written down five times in this repo — here, in `Particles._stageImpact`'s header, in
 * `tests/fxrim.test.mjs`, in `ringspill.mjs` and in §405 — and `framelib`'s own header says why
 * that is the bug: a second copy is a second thing to keep true, and the copy is the one that
 * goes stale. */
const RING_R_DRAWN = RING_R_CROP;

/* The drawn figure's centre sits 39.5 px left of the contact point's projection. Part is the
   pose — a dive sprawls away from its contact — and part is the unexplained placement offset
   under investigation (`Debug._subject`'s `drift`/`final`). Rather than bake a number that may
   be half bug, the uncertainty is carried where it bites: the figure must clear the frame edge
   by the ordinary margin PLUS this, so a re-stage stays valid whichever way that resolves. */
const FIGURE_PLACEMENT_SLOP = 40;
const EDGE = 24;

console.log(`impactframe · ${W}x${H} · tree ${provenance}`);
console.log(`impactScale ${S} · scuff r${SCUFF_R.toFixed(2)} m`);
console.log(ringSummary());
/* Every `clear` verdict below depends on a ray test that silently returned "visible" for the
   whole life of `alertframe`. Prove it can say no — and that it can say yes — before printing
   a single one. */
console.log(assertOccluded());
console.log(assertVisible());

/**
 * §407.2 — a constant derived from a measurement must be projected back and shown to reproduce
 * it, in the tool, printed every run.
 *
 * `SLY_SLAM` was documented as "the measured pixels converted back through this shot's own
 * camera" and was never once converted back. It projected to 236 x 245 px against a measurement
 * of 197 x 195. The claim was in a comment, where nothing executes it. This is the same claim in
 * a place that runs.
 *
 * ── The two subjects are checked by DIFFERENT criteria, and saying which is the point ───────
 * `dust` is checked by CONTAINMENT: it feeds a cropping test, its spread is what matters, and
 * the drawn cloud is not centred on the contact (`dive_dust` carries wind 0.5, and the measured
 * cloud reaches 290 px right of the contact against 236 px left). A symmetric plate must cover
 * the greater reach, so slack on the other side is expected and is printed rather than hidden.
 *
 * `sly` is checked by SIZE. It cannot be checked by containment, because the drawn figure's
 * centre sits **39.5 px left of the contact point's projection** — part pose, part the
 * unexplained placement offset still open in `Debug._subject`. Forcing a symmetric plate to
 * contain it inflates the figure to 2.32 m wide and 292 px, which would then be quoted as the
 * width of a character who is 1.57 m across. **A number inflated to satisfy a check is a worse
 * number than the one the check was protecting.** So the size is checked here, exactly, and the
 * offset is carried by `FIGURE_PLACEMENT_SLOP` in the margin test — where it actually bites.
 */
function assertExtents() {
  const cam = camFor(REF);
  const [ax, ay, az] = REF.at;
  const c = project(cam, ax, ay, az);
  const lines = [`extents CALIBRATED against ${REF.src}`,
    `   contact (${REF.at.join(', ')}) projects to px ${c.px.toFixed(1)}, py ${c.py.toFixed(1)}`];
  let bad = 0;
  for (const [name, dims, how] of [['sly', SLY_SLAM, 'size'], ['dust', DUST, 'contain']]) {
    const p = plateOf(cam, ax, ay, az, dims);
    const m = MEASURED[name];
    let ok = false, verdict;
    if (!p) verdict = 'BEHIND THE LENS';
    else if (how === 'contain') {
      ok = p.x0 <= m.x0 + 0.5 && p.x1 >= m.x1 - 0.5 && p.y0 <= m.y0 + 0.5 && p.y1 >= m.y1 - 0.5;
      verdict = ok
        ? `contains it (slack l${(m.x0 - p.x0).toFixed(0)} r${(p.x1 - m.x1).toFixed(0)} t${(m.y0 - p.y0).toFixed(0)} b${(p.y1 - m.y1).toFixed(0)})`
        : 'DOES NOT COVER ITS OWN MEASUREMENT';
    } else {
      const dw = Math.abs((p.x1 - p.x0) - (m.x1 - m.x0)), dh = Math.abs((p.y1 - p.y0) - (m.y1 - m.y0));
      ok = dw <= 1 && dh <= 1;
      verdict = ok
        ? `reproduces its size to ${Math.max(dw, dh).toFixed(1)} px (centre offset ${(((m.x0 + m.x1) / 2) - c.px).toFixed(1)} px, carried by the ${FIGURE_PLACEMENT_SLOP} px slop)`
        : `DOES NOT REPRODUCE ITS OWN SIZE — off by ${dw.toFixed(1)} x ${dh.toFixed(1)} px`;
    }
    if (!ok) bad++;
    lines.push(`   ${name.padEnd(4)} ${dims.w.toFixed(2)} m wide, ${dims.yLo.toFixed(2)}..${dims.yHi.toFixed(2)} m`
      + ` -> ${p ? `${(p.x1 - p.x0).toFixed(0)} x ${(p.y1 - p.y0).toFixed(0)} px, rows ${p.y0.toFixed(0)}..${p.y1.toFixed(0)}` : '—'}`
      + ` · measured ${m.x1 - m.x0} x ${m.y1 - m.y0} px, rows ${m.y0}..${m.y1}`
      + ` · ${verdict}`);
  }
  if (bad) lines.push('   *** an extent above does not reproduce the pixels it was derived from;'
    + ' every margin this tool prints is a claim about the wrong subject ***');
  return lines.join('\n');
}
console.log(assertExtents());

/* The impact point does not move across a sweep, so its ground column is one query answered
   hundreds of thousands of times. Keyed on the point, not hoisted into a bare variable, so the
   candidate set — which may stage elsewhere — still gets its own answer. */
const _colCache = new Map();
function columnAt(x, z, ceiling) {
  const k = `${x},${z}`;
  let e = _colCache.get(k);
  if (!e) { e = { col: groundColumn(x, z) }; _colCache.set(k, e); }
  return { col: e.col, g: e.col.find((y) => y <= ceiling) ?? null };
}

/**
 * `stopEarly` skips the ray casts once a cheaper bar has already rejected the camera.
 *
 * This is short-circuit evaluation of the SAME predicates, not a pre-filter with its own
 * thresholds — `alertframe`'s search swept clearance at y+0.9 while `score()` tested y+1.2 and
 * admitted 158 cells that then reported OCCLUDED. Nothing here is scored by a different rule
 * than the one that admits it; a camera that survives has had every check run against it.
 *
 * The one thing it costs is completeness of the REJECTION TALLY: a camera cropped at the edge is
 * never tested for occlusion, so the tally reports first reasons rather than all reasons. Said
 * out loud where the tally prints, because a histogram that looks exhaustive and is not would be
 * read as one.
 */
function score(name, c, { quiet = false, stopEarly = false, skipClear = false } = {}) {
  const cam = camFor(c);
  const [px, py, pz] = c.player.pos;

  const sly = plateOf(cam, px, py, pz, SLY_SLAM);
  const dust = plateOf(cam, px, py, pz, DUST);
  const scuff = discOf(cam, px, py + 0.02, pz, SCUFF_R, DISC_SEG);
  /* ── THE SIXTH TERM: THE RING IS NOT DRAWN ON THE PLANE IT IS STAGED ON ───────────────────
     `_stageImpact` puts it at `p.y + 0.06`, and every consumer has projected it there. But
     `PARTICLE_VERT` computes `p = aP0 + aV0 * dc`, and for PLANAR sprites `aV0` holds the plane
     NORMAL — so with drag 0, `dc = age` and the ring is drawn `STAGED_AGE` metres along its own
     normal. 0.148 m off the floor, not 0.06.

     Registered as load-bearing rather than repaired: the `ring` batch ships SOFT, and the soft
     term fades a sprite by its stand-off from the surface behind it, so the drift supplies 59%
     of the ring's own stand-off. Removing it dims the largest sprite in the game by 2.50x at
     every radius. That is a look decision, not a cleanup. See `ringextent.mjs`. */
  const ring = discOf(cam, px, ringPlaneY(py), pz, RING_R_DRAWN, DISC_SEG);
  /* Display only — never gates. Computed only when it will be printed. */
  const ringDecl = quiet ? null : discOf(cam, px, ringPlaneY(py), pz, RING_R_DECLARED, DISC_SEG);

  const faults = [];
  if (!sly) faults.push('SLY BEHIND LENS');
  if (!scuff) faults.push('GROUND MARK BEHIND LENS');
  if (!ring) faults.push('RING BEHIND LENS');

  const ms = margins(sly), mk = margins(scuff), mr = margins(ring), md = margins(dust);
  for (const [who, m, floor] of [['sly', ms, EDGE + FIGURE_PLACEMENT_SLOP], ['scuff', mk, EDGE],
    ['ring', mr, EDGE], ['dust', md, EDGE]]) {
    if (!m) continue;
    for (const [edge, v] of Object.entries(m)) {
      if (v < 0) faults.push(`${who} CROPPED ${edge} by ${(-v).toFixed(0)} px`);
      else if (v < floor) faults.push(`${who} within ${v.toFixed(0)} px of ${edge}`);
    }
  }

  /* GROUND READ. For a circle on the floor the projected ellipse's height:width ratio is
     sin(camera elevation above the plane). Bar 0.22 — about 12.7° — derived rather than picked:
     below it the ring's minor axis is under a quarter of its major and it reads as a bar rather
     than a ring, and the shipped canonical that looks most steeply down the ground plane
     (`courtyard`) sits at 0.28 by the same measure. A shot depicting a ring must see more of
     the floor than the shot that merely stands on it. */
  const flat = scuff ? (scuff.y1 - scuff.y0) / Math.max(1, scuff.x1 - scuff.x0) : 0;
  if (flat < 0.22) faults.push(`RING EDGE-ON — ellipse ratio ${flat.toFixed(3)} reads as a line, not a ring`);

  const slyH = sly ? sly.y1 - sly.y0 : 0;
  if (slyH < 110) faults.push(`sly only ${slyH.toFixed(0)} px tall — a slam needs a body, not a token`);

  if (stopEarly && faults.length) return { faults, rank: 0, flat, slyH };
  if (skipClear) return { faults, rank: flat * slyH, flat, slyH };

  const slyClear = clear(cam, { x: px, y: py + 0.5, z: pz });
  const ringClear = clear(cam, { x: px, y: ringPlaneY(py), z: pz });
  if (!slyClear) faults.push('SLY OCCLUDED by architecture');
  if (!ringClear) faults.push('RING OCCLUDED by architecture');

  /* Is he actually standing on the floor the shot claims? A slam 1.4 m above the paving is a
     slam on nothing. The ceiling is `py + 1.0` and it is PASSED rather than defaulted: over most
     of this courtyard there is a terrace or a roof somewhere above, and a query that takes the
     topmost surface in the column answers about THAT — at (0, 30) it returns 18.12 while the
     paving the character stands on is at 0. */
  const { col, g } = columnAt(px, pz, py + 1.0);
  if (g === null) faults.push(`NO ARCHITECTURE FLOOR at or below y ${(py + 1).toFixed(2)} (column: ${col.map((v) => v.toFixed(2)).join(', ') || 'empty'}) — may be terrain, which this tool cannot see`);
  else if (Math.abs(g - py) > 0.25) faults.push(`FLOATING — floor is at y ${g.toFixed(2)}, the impact is staged at ${py.toFixed(2)}`);

  const rank = flat * slyH;
  if (!quiet) {
    console.log(`\n── ${name}`);
    console.log(`   cam ${c.pos.map((v) => v.toFixed(2)).join(', ')} -> ${c.target.join(', ')} · fov ${c.fov} · tod ${c.tod}`);
    if (sly) console.log(`   sly    ${(sly.x1 - sly.x0).toFixed(0)} x ${slyH.toFixed(0)} px · margins l${ms.l.toFixed(0)} r${ms.r.toFixed(0)} t${ms.t.toFixed(0)} b${ms.b.toFixed(0)} · ${slyClear ? 'clear' : 'OCCLUDED'}   [measured plate; edge floor ${EDGE}+${FIGURE_PLACEMENT_SLOP} px]`);
    if (ring) console.log(`   ring   ${(ring.x1 - ring.x0).toFixed(0)} x ${(ring.y1 - ring.y0).toFixed(0)} px · margins l${mr.l.toFixed(0)} r${mr.r.toFixed(0)} t${mr.t.toFixed(0)} b${mr.b.toFixed(0)} · ${ringClear ? 'clear' : 'OCCLUDED'}   [DRAWN r${RING_R_DRAWN.toFixed(2)}m on plane y${ringPlaneY(py).toFixed(3)} (staged 0.06 + ${RING_PLANE_LIFT.toFixed(3)} normal drift); _stageImpact declares ${RING_R_DECLARED.toFixed(2)}m]`);
    if (scuff) console.log(`   scuff  ${(scuff.x1 - scuff.x0).toFixed(0)} x ${(scuff.y1 - scuff.y0).toFixed(0)} px · margins l${mk.l.toFixed(0)} r${mk.r.toFixed(0)} t${mk.t.toFixed(0)} b${mk.b.toFixed(0)}`);
    if (dust) console.log(`   dust   ${(dust.x1 - dust.x0).toFixed(0)} x ${(dust.y1 - dust.y0).toFixed(0)} px · margins l${md.l.toFixed(0)} r${md.r.toFixed(0)} t${md.t.toFixed(0)} b${md.b.toFixed(0)}   [measured plate]`);
    /* TIEBREAK, and it is a tiebreak rather than a bar — say which is which. The bars above
       decide ADMISSION and every one is derived: cropping is cropping, 0.22 comes from the
       shipped shot that looks most steeply down the ground plane, 110 px is where a subject
       stops being one. Many cameras pass all of them and something must order the survivors.
       This is that something: the product of the two quantities the shot must deliver at once —
       the ring reading as a ring, and the figure reading as a figure. A composite is not
       evidence and is not treated as any. */
    console.log(`   ellipse ratio ${flat.toFixed(3)} (bar 0.22) · rank ${rank.toFixed(1)}`
      + (ringDecl && ring ? ` · declared-radius ring would read ${(ringDecl.x1 - ringDecl.x0).toFixed(0)} px, drawn reads ${(ring.x1 - ring.x0).toFixed(0)}` : ''));
    console.log(`   column over the impact point: ${col.map((v) => v.toFixed(2)).join(', ') || '(empty)'} · standing on ${g === null ? 'NOTHING architectural' : g.toFixed(2)}`);
    console.log(faults.length ? `   FAULTS: ${faults.join(' | ')}` : '   no faults');
  }
  return { faults, rank, flat, slyH };
}

/* (0, 0, -8), and the two rejected before it are why this constant carries a comment. The first
   draft slammed at (0, 0, 20) — under the obelisk terrace, with architecture at 1.56, 1.63, 2.00
   and 2.92 m directly overhead, i.e. a slam in a 1.56 m crawlspace. The second tried (0, 0, -6),
   which the tool reported as having NO architecture floor at all: a gap in the paving, so the
   crack and scuff decals — half the staged event — would have landed on terrain this tool cannot
   see and possibly on nothing. Both were found by the column print rather than by looking, and
   both would have rendered a plausible frame. */
const AT = [0, 0, -8];
const P = { pos: AT, yaw: 0.35, pose: 'dive_impact' };

const args = process.argv.slice(2);
const shotArg = args.indexOf('--shot');
if (shotArg >= 0) {
  const name = args[shotArg + 1];
  const s = SHOTS[name];
  if (!s) { console.error(`no shot "${name}" in SHOTS`); process.exit(2); }
  if (!s.player?.pos) { console.error(`shot "${name}" stages no player — nothing to slam`); process.exit(2); }
  process.exit(score(name, s).faults.length ? 1 : 0);
}

if (args.includes('--search')) {
  /**
   * Sweep the camera domain and keep the survivors.
   *
   * ── THE DOMAIN IS THREE-DIMENSIONAL, NOT FOUR, AND THAT IS MEASURED ────────────────────────
   * Every subject in this frame is centred on the contact point and the camera targets that same
   * point, so orbiting the lens about the vertical axis through it maps the whole configuration
   * onto itself. **Azimuth cannot change any projected quantity.** Measured, not assumed: across
   * 24 azimuths at four (d, h, fov) triples, the ellipse ratio and the figure's pixel height are
   * identical to 5e-16 and 3e-13 — floating-point noise, not agreement within a tolerance.
   *
   * The one thing azimuth DOES change is `clear()`, because the architecture is not rotationally
   * symmetric about a point in the courtyard. So the sweep is:
   *
   *   1. geometry over (d, h, fov) at one azimuth   — 9,450 cells instead of 453,600
   *   2. occlusion over azimuth, for geometric survivors only
   *
   * This is a symmetry, not a heuristic: step 1 rejects nothing that step 2 would have admitted,
   * because the quantities it rejects on do not vary along the axis it collapses. The first
   * version of this search swept all four axes and did not finish 453,600 cells in 1500 s.
   *
   * `assertAzimuthFree()` below re-derives that claim every run rather than trusting this
   * comment. If someone adds a subject that is NOT centred on the contact — a guard, a prop, an
   * off-centre decal — the symmetry breaks, the collapse starts hiding valid cameras, and
   * nothing about the output would look wrong. That is the failure this tool exists to not have.
   */
  const AZ_STEP = 7.5, AZ_N = Math.round(360 / AZ_STEP);

  /**
   * Prove the collapse is legitimate on THIS tree before relying on it.
   *
   * ── THE PROBE STEP MUST NOT DIVIDE INTO THE SEGMENT COUNT, AND MINE DID ────────────────────
   * The first version of this check swept 24 azimuths at 15° against `discOf`'s default 24
   * segments. It reported agreement to **5e-16** and I took that as confirmation. It is an
   * artefact: 360/24 = 15, so rotating the camera by one step maps the polygon's sample set
   * exactly onto itself. The same thing happens at 48 segments with 7.5° steps, and at 720 with
   * 7.5° steps. **The probe was commensurate with the discretisation, so it compared each
   * sample against itself and could only ever say "identical".**
   *
   * So the step below is deliberately non-commensurate — an odd fraction of a degree that shares
   * no factor with 180 — and the criterion is the polygon's own worst-case bound rather than a
   * tolerance chosen to pass. The true geometry IS exactly rotationally symmetric: every subject
   * is centred on the contact and the camera targets it, so orbiting maps the configuration onto
   * itself. Only the sampling breaks that, and only by `1 - cos(pi/n)`.
   *
   * If the spread ever exceeds that bound, the asymmetry is REAL — someone has added a subject
   * that is not centred on the contact — and collapsing the azimuth axis would start hiding
   * valid cameras with nothing in the output looking wrong.
   */
  function assertAzimuthFree() {
    const STEP = 7.3;                    // shares no factor with 180; see above
    const N = Math.floor(360 / STEP);
    let worst = 0, worstAt = null;
    for (const [d, hh, fov] of [[12, 3, 38], [8, 2, 44], [18, 6, 30], [6, 1.5, 50], [20, 10, 26]]) {
      const vals = [];
      for (let i = 0; i < N; i++) {
        const a = i * STEP * Math.PI / 180;
        const r = score('', {
          pos: [AT[0] + Math.cos(a) * d, hh, AT[2] + Math.sin(a) * d],
          target: [AT[0], 0.6, AT[2]], fov, tod: 0.78, player: P,
        }, { quiet: true, skipClear: true });
        vals.push([r.flat, r.slyH / Math.max(1, r.slyH), r.faults.length]);
      }
      for (const k of [0, 2]) {
        const col = vals.map((v) => v[k]);
        const sp = Math.max(...col) - Math.min(...col);
        if (sp > worst) { worst = sp; worstAt = `${['ellipse', '', 'fault count'][k]} at d${d} h${hh} fov${fov}`; }
      }
    }
    const bound = 2 * NGON_BOUND;
    return worst <= bound
      ? `azimuth-free CONFIRMED — geometry varies by ${worst.toExponential(1)} over ${N} `
        + `non-commensurate azimuths x 5 triples, inside the ${DISC_SEG}-gon bound ${bound.toExponential(1)}`
      : `*** AZIMUTH-FREE IS FALSE on this tree: ${worstAt} varies by ${worst.toExponential(2)}, past the `
        + `${DISC_SEG}-gon discretisation bound ${bound.toExponential(2)}. That is a REAL asymmetry, not `
        + 'sampling — some subject is no longer centred on the contact. Sweep all four axes. ***';
  }
  console.log(assertAzimuthFree());

  const t0 = Date.now();
  const survivors = [];
  let geomCells = 0, geomPass = 0, azTested = 0;
  const faultTally = new Map();
  const tally = (fs) => { for (const f of fs) {
    const key = f.replace(/ by [\d.]+ px/, ' by N px').replace(/ [\d.]+ px of /, ' N px of ')
      .replace(/ratio [\d.]+/, 'ratio N').replace(/only [\d.]+/, 'only N')
      .replace(/y [-\d.]+/g, 'y N').replace(/column: [^)]*/, 'column: …');
    faultTally.set(key, (faultTally.get(key) ?? 0) + 1);
  } };

  for (let d = 5; d <= 22; d += 0.5) {
    for (let hh = 1.0; hh <= 12; hh += 0.25) {
      for (const fov of [26, 30, 34, 38, 44, 50]) {
        geomCells++;
        const base = {
          pos: [AT[0] + d, hh, AT[2]], target: [AT[0], 0.6, AT[2]], fov, tod: 0.78, player: P,
        };
        const g = score('', base, { quiet: true, stopEarly: true, skipClear: true });
        if (g.faults.length) { tally(g.faults); continue; }
        geomPass++;
        /* Geometry admits this (d, h, fov) at EVERY azimuth. Only occlusion can reject one. */
        for (let i = 0; i < AZ_N; i++) {
          const azDeg = i * AZ_STEP, a = azDeg * Math.PI / 180;
          const cand = {
            pos: [AT[0] + Math.cos(a) * d, hh, AT[2] + Math.sin(a) * d],
            target: [AT[0], 0.6, AT[2]], fov, tod: 0.78, player: P,
          };
          azTested++;
          const r = score('', cand, { quiet: true });
          if (!r.faults.length) survivors.push({ ...cand, d, hh, azDeg, ...r });
          else tally(r.faults);
        }
      }
    }
  }
  survivors.sort((x, y) => y.rank - x.rank);
  console.log(`\n══ SEARCH · ${geomCells} (d,h,fov) cells -> ${geomPass} geometric survivors`
    + ` x ${AZ_N} azimuths = ${azTested} occlusion tests · ${survivors.length} clean`
    + ` · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`   domain: distance 5-22 m by 0.5, height 1-12 m by 0.25, ${AZ_N} azimuths, 6 lenses,`
    + ` target fixed at the contact`);
  console.log(`\n   why the rest were rejected (FIRST reason only — the ray casts are skipped once\n`
    + `   a cheaper bar rejects a camera, so these are not exhaustive per camera):`);
  for (const [f, k] of [...faultTally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)) {
    console.log(`     ${String(k).padStart(7)}  ${f}`);
  }
  console.log(`\n   top survivors by rank (ellipse ratio x figure height):`);
  for (const s of survivors.slice(0, 15)) {
    console.log(`     rank ${s.rank.toFixed(1).padStart(6)} · d ${String(s.d).padStart(4)} m h ${String(s.hh).padStart(5)} m az ${String(s.azDeg).padStart(5)}° fov ${String(s.fov).padStart(2)}`
      + ` · ellipse ${s.flat.toFixed(3)} · sly ${s.slyH.toFixed(0)} px`
      + ` · pos ${s.pos.map((v) => v.toFixed(2)).join(', ')}`);
  }
  try {
    mkdirSync('progress/records', { recursive: true });
    writeFileSync('progress/records/impact-search.json', JSON.stringify({
      tree: provenance, when: new Date().toISOString(),
      geomCells, geomPass, azTested, azimuthFree: assertAzimuthFree(),
      domain: 'd 5-22 by 0.5, h 1-12 by 0.25, az 0-360 by 7.5, fov [26,30,34,38,44,50]',
      bars: { edge: EDGE, figureSlop: FIGURE_PLACEMENT_SLOP, ellipse: 0.22, slyPx: 110 },
      extents: { SLY_SLAM, DUST, RING_R_DRAWN, RING_R_DECLARED, SCUFF_R },
      survivors: survivors.length,
      rejections: [...faultTally.entries()].sort((x, y) => y[1] - x[1]),
      top: survivors.slice(0, 40),
    }, null, 2));
    console.log(`\n   -> progress/records/impact-search.json`);
  } catch (e) { console.log(`   (could not persist: ${e.message})`); }
  process.exit(survivors.length ? 0 : 1);
}

/**
 * Candidates.
 *
 * All in the courtyard, on paving, because that is where the crack and scuff decals read: a slam
 * on sand leaves a mark nobody can see, and the two decals are half the staged event.
 */
const CANDIDATES = {
  /* CALIBRATION, and it must fault. Four candidates that all pass tell you nothing about the
     tool — the first version of this file scored 4/4 and I had learned nothing from it. This is
     the frame the instinct actually produces: get close, get low, fill the frame with the hero.
     If this ever reports "no faults", the bars have stopped biting and nothing below is
     evidence. */
  'CALIB close and low — the instinct, and it must fault': {
    pos: [1.6, 0.9, -5.4], target: [0.0, 0.8, -8.0], fov: 52, tod: 0.78, player: P,
  },
  /* SECOND CALIBRATION, and it must also fault, for a DIFFERENT reason: this is the camera the
     shipped `impact` used, and the ring it crops is the fault that survived §407's audit. If
     this ever passes, either the ring's drawn extent has been re-scoped or the crop test has
     stopped working — and the first is a decision, not a fix. */
  'CALIB the shipped camera — must still fault on the ring crop': {
    pos: [5.4, 4.4, -2.6], target: [0.0, 0.6, -8.0], fov: 38, tod: 0.78, player: P,
  },
  'A three-quarter, lifted': {
    pos: [4.6, 3.4, -3.4], target: [0.0, 0.7, -8.0], fov: 44, tod: 0.78, player: P,
  },
  'B higher and further — the ring reads, does the figure?': {
    pos: [6.4, 5.4, -1.6], target: [0.0, 0.5, -8.0], fov: 42, tod: 0.78, player: P,
  },
  'D low three-quarter — the most ground the ellipse bar allows': {
    pos: [4.2, 2.3, -4.2], target: [0.0, 0.8, -8.0], fov: 46, tod: 0.78, player: P,
  },
};

let clean = 0;
for (const [name, c] of Object.entries(CANDIDATES)) if (score(name, c).faults.length === 0) clean++;
console.log(`\n${clean}/${Object.keys(CANDIDATES).length} candidates with no faults`);

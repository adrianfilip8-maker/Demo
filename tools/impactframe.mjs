/**
 * impactframe.mjs — stage the Cane Slam frame before authoring it into `Shots.js`.
 *
 * `alertframe` measures a relationship between two upright figures. This measures something
 * with a different shape entirely: **a figure standing inside a large flat ring on the floor**,
 * and the ways that fails are not the ways a two-figure frame fails.
 *
 *   node tools/impactframe.mjs                 # score the built-in candidate set
 *   node tools/impactframe.mjs --shot impact   # score the entry already in SHOTS
 *
 * ── What `_stageImpact` actually puts on the floor, measured not guessed ────────────────────
 * `Particles._stageImpact()` emits four sprites plus two decals at the player's feet, all
 * scaled by `TUNE.impactScale` (1.25):
 *
 *   dive_ring    size 0.4 -> 5.0 over a 0.34 s life, staged at age 0.088 (97.6% of peak ink)
 *   dive_dust    16-22 puffs, 3.5-7.5 m/s disc, staged at 0.279  → reaches ~2.1 m of travel
 *   dive_debris  10-14 at 4-9 m/s in a cone, staged at 0.012
 *   dive_spark   14-18 at 7-13 m/s disc, staged at 0.002
 *   decal crack  2.2 x scale = 2.75 m across
 *   decal scuff  3.4 x scale = 4.25 m across      ← the widest thing on the ground
 *
 * `_stageImpact` returns `radius: 1.2 * scale` = 1.50 m as the ring's own reach. The FOOTPRINT
 * this tool frames is the scuff at 2.13 m radius, because that is the outermost mark a viewer
 * sees and cropping it is cropping the impact.
 *
 * ── Why a disc and not a box ────────────────────────────────────────────────────────────────
 * `boxOf` projects the eight corners of an upright box. A ground ring has no height, and its
 * silhouette is not its bounding square: from the low camera this shot wants, a circle projects
 * to a wide flat ellipse whose extremes are on the rim, not at the corners of a square around
 * it. `framelib.discOf` samples the rim. Using `boxOf` here would over-report the ring's
 * vertical extent and under-report its near/far spread, and both errors point toward "it fits"
 * — the direction that ships a cropped frame.
 *
 * ── The three faults this exists to catch ───────────────────────────────────────────────────
 *
 *   RING CROPPED    the largest sprite in the game (`dive_ring`'s peak projected ink is 104x
 *                   `alert_spot`'s, 7.6x the next largest) running off an edge. This is the
 *                   whole reason the shot is hard: the impulse is to get close, and close is
 *                   exactly what crops it.
 *   FIGURE SWALLOWED  Sly's box entirely inside the ring's box. A slam is a thing a CHARACTER
 *                   does; a frame where the character is a detail inside his own effect has
 *                   lost the subject. Measured as the fraction of Sly's box the ring covers.
 *   NO GROUND       the camera so low that the ring is seen edge-on. A ring read at 3° of
 *                   elevation is a line, and the shot depicts a line. Measured as the ellipse's
 *                   height:width ratio, which is `sin(elevation)` for a circle.
 *
 * ── What it CANNOT tell you ─────────────────────────────────────────────────────────────────
 * Everything `framelib`'s header says: architecture triangles only, boxes not meshes, and
 * nothing at all about light. It also cannot tell you whether the dust READS — that is a
 * capture's question, and per KNOWN_ISSUES §367 FX is one of the few systems that renders live
 * in a shot, so a capture can answer it.
 *
 * ── THE FIGURE BOX IS A PROXY, AND ON THIS POSE IT IS WRONG IN BOTH DIRECTIONS ───────────────
 * `boxOf` projects an upright 0.62 x 1.80 m box. `dive_impact` is a SLAM: a crouched, sprawling
 * pose that is wider than a stance and shorter than one. Measured against the shipped frame
 * (`shots/fxrim-impact/impact-{A-ship,S-nosly}.png`, src tree 2b06133ddf675387 — the figure is
 * the pixels that vanish when the character root is hidden, taken at the |dL| > 12 plateau which
 * is stable from 12 through 48):
 *
 *              x            rows        w x h
 *   proxy box  583..697     202..451    115 x 249      <- what this tool computes
 *   measured   502..699     303..498    197 x 195      <- what the renderer draws
 *
 * So the proxy is **83 px too narrow, 54 px too tall, and its crown sits 101 px above his head.**
 * It is not a silhouette and must never be quoted as one.
 *
 * **This changes a verdict, and the verdict is this file's.** FIGURE SWALLOWED divides the
 * ring/subject box overlap by the subject's own box area, so it inherits the proxy's error
 * whole: on the proxy the ring covers **44.2%** of him and passes the 55% bar; on the measured
 * figure it covers **80.6%** and does not. `impact` is admitted on that bar by an artefact of
 * the box. The `sly only N px tall` bar is unaffected — 195 px clears 110 either way.
 *
 * ── AND `RING_R` IS THE AUTHORED FOOTPRINT, NOT THE DRAWN SPRITE ────────────────────────────
 * `RING_R = 1.2 * S` = 1.50 m is what `_stageImpact` returns. The sprite `dive_ring` draws has
 * a half-extent of **4.035 m** — `mix(0.5, 6.25, (0.088/0.34)^0.36)`, an 8.07 m quad, and
 * PLANAR sprites are exempt from the shader's screen-size ceiling. Measured in the shipped
 * frame by unprojecting the `ring` batch's own light onto the impact plane: the bright annulus
 * is at r = 3.0-4.5 m, the light ends at 4.75-5.0 m, and 1.50 m is the dim inner shoulder.
 *
 *   RING CROPPED at 1.50 m   margins l460 r460 t341 b198   no fault
 *   RING CROPPED at 4.035 m  margins l112 r112 t249 b-102   cropped, 18.5% of the rim off-frame
 *
 * So this tool's second admission bar also turns on a number that is 2.69x too small, and it
 * certifies "clear" on a ring the renderer crops. Same treatment as the figure box: flagged,
 * not repaired, because the number is minted in `Particles._stageImpact`'s return and three
 * consumers plus a shipped seal read it. See that function's header.
 *
 * Not silently repaired, for two reasons. Re-scoring a shipped shot against a rule it now fails
 * is a decision about the shot, not about the tool, and §141.1 says a bar is not re-scoped by
 * whoever happens to be holding the file. And the obvious repair — CPU-skin the pose and project
 * it, which `charvis.mjs` already has the machinery for — **does not currently agree with the
 * renderer**: the skinned `dive_impact` extent comes out x 528..727 / rows 292..499, the right
 * width and height but shifted ~26 px (~0.22 m) in +x against the measured figure, and the cause
 * is not the clip's root motion (0, -0.6885, +0.1). The ring reproduces its certificate exactly
 * through the same camera, so the projection is sound and the disagreement is in the character's
 * model-to-world placement. Wiring in a second wrong number would be worse than labelling the
 * first. See KNOWN_ISSUES §379.4's round-17 report.
 */
import { SHOTS } from '../src/core/Shots.js';
import { TUNE as FX_TUNE } from '../src/fx/Particles.js';
import {
  W, H, SLY, provenance, camFor, boxOf, discOf, overlapArea, margins, clear, assertOccluded,
  assertVisible, groundColumn, groundUnder,
} from './framelib.mjs';

const S = FX_TUNE.impactScale;
const SCUFF_R = 3.4 * S / 2;      // the widest ground mark: Particles._stageImpact
const RING_R = 1.2 * S;           // what _stageImpact itself reports as the ring's reach
const DUST_H = 1.5 * S;           // dive_dust's end size — how high the cloud reads

console.log(`impactframe · ${W}x${H} · tree ${provenance}`);
console.log(`impactScale ${S} · scuff r${SCUFF_R.toFixed(2)} m · ring r${RING_R.toFixed(2)} m · dust h${DUST_H.toFixed(2)} m`);
/* Every `clear` verdict below depends on a ray test that silently returned "visible" for the
   whole life of `alertframe`. Prove it can say no before printing a single one. */
console.log(assertOccluded());
console.log(assertVisible());

function score(name, c) {
  const cam = camFor(c);
  const [px, py, pz] = c.player.pos;

  const sly = boxOf(cam, px, py, pz, SLY);
  const scuff = discOf(cam, px, py + 0.02, pz, SCUFF_R);
  const ring = discOf(cam, px, py + 0.06, pz, RING_R);
  /* The dust is a dome, not a disc: it travels outward AND the puffs are 1.9 m across at the
     staged age. Framed as an upright box of that height over the ring's own radius. */
  const dust = boxOf(cam, px, py, pz, { w: RING_R * 2, h: DUST_H });

  const faults = [];
  if (!sly) faults.push('SLY BEHIND LENS');
  if (!scuff) faults.push('GROUND MARK BEHIND LENS');
  if (!ring) faults.push('RING BEHIND LENS');

  const ms = margins(sly), mk = margins(scuff), mr = margins(ring), md = margins(dust);
  for (const [who, m] of [['sly', ms], ['scuff', mk], ['ring', mr], ['dust', md]]) {
    if (!m) continue;
    for (const [edge, v] of Object.entries(m)) {
      if (v < 0) faults.push(`${who} CROPPED ${edge} by ${(-v).toFixed(0)} px`);
      else if (v < 24) faults.push(`${who} within ${v.toFixed(0)} px of ${edge}`);
    }
  }

  /* SWALLOWED. Not overlap-as-merge (`alertframe`'s test, which is about two figures becoming
     one silhouette) — here the two subjects are SUPPOSED to overlap, and the question is
     whether the figure survives it. Scored as the fraction of Sly's own box the ring covers. */
  const area = (b) => (b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0);
  /* Computed on the PROXY box, and that is not a detail: see the header. On `impact` the same
     ratio against the measured figure is 80.6%, which does not pass. The number below is what
     this tool can compute; it is not what the renderer draws. */
  const swallowed = sly && ring ? overlapArea(sly, ring) / Math.max(1, area(sly)) : 0;
  if (swallowed > 0.55) faults.push(`FIGURE SWALLOWED — the ring covers ${(swallowed * 100).toFixed(0)}% of Sly's box`);

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

  const slyClear = clear(cam, { x: px, y: py + 0.9, z: pz });
  const ringClear = clear(cam, { x: px, y: py + 0.06, z: pz });
  if (!slyClear) faults.push('SLY OCCLUDED by architecture');
  if (!ringClear) faults.push('RING OCCLUDED by architecture');

  /* Is he actually standing on the floor the shot claims? A slam 1.4 m above the paving is a
     slam on nothing, and this is the check `sly-profile` records as the one that would have
     caught three shipped feet-below-frame defects.

     The ceiling is `py + 1.0` and it is passed rather than defaulted: over most of this
     courtyard there is a terrace or a roof somewhere above, and a query that takes the topmost
     surface in the column answers about THAT — at (0, 30) it returns 18.12 while the paving the
     character stands on is at 0. The whole column is printed alongside so the number can be
     read in context instead of trusted. */
  const col = groundColumn(px, pz);
  const g = groundUnder(px, pz, py + 1.0);
  if (g === null) faults.push(`NO ARCHITECTURE FLOOR at or below y ${(py + 1).toFixed(2)} (column: ${col.map((v) => v.toFixed(2)).join(', ') || 'empty'}) — may be terrain, which this tool cannot see`);
  else if (Math.abs(g - py) > 0.25) faults.push(`FLOATING — floor is at y ${g.toFixed(2)}, the impact is staged at ${py.toFixed(2)}`);

  console.log(`\n── ${name}`);
  console.log(`   cam ${c.pos.map((v) => v.toFixed(2)).join(', ')} -> ${c.target.join(', ')} · fov ${c.fov} · tod ${c.tod}`);
  if (sly) console.log(`   sly    rows ${sly.y0.toFixed(0)}..${sly.y1.toFixed(0)} (${slyH.toFixed(0)} px) · margins l${ms.l.toFixed(0)} r${ms.r.toFixed(0)} t${ms.t.toFixed(0)} b${ms.b.toFixed(0)} · ${slyClear ? 'clear' : 'OCCLUDED'}   [UPRIGHT-BOX PROXY, not a silhouette — see header]`);
  if (ring) console.log(`   ring   ${(ring.x1 - ring.x0).toFixed(0)} x ${(ring.y1 - ring.y0).toFixed(0)} px · margins l${mr.l.toFixed(0)} r${mr.r.toFixed(0)} t${mr.t.toFixed(0)} b${mr.b.toFixed(0)} · ${ringClear ? 'clear' : 'OCCLUDED'}   [AUTHORED FOOTPRINT r${RING_R.toFixed(2)}m, not the drawn sprite — see header]`);
  if (scuff) console.log(`   scuff  ${(scuff.x1 - scuff.x0).toFixed(0)} x ${(scuff.y1 - scuff.y0).toFixed(0)} px · margins l${mk.l.toFixed(0)} r${mk.r.toFixed(0)} t${mk.t.toFixed(0)} b${mk.b.toFixed(0)}`);
  if (dust) console.log(`   dust   margins l${md.l.toFixed(0)} r${md.r.toFixed(0)} t${md.t.toFixed(0)} b${md.b.toFixed(0)}`);
  /* TIEBREAK, and it is a tiebreak rather than a bar — say which is which.
     The bars above decide ADMISSION and every one of them is derived: cropping is cropping,
     0.22 comes from the shipped shot that looks most steeply down the ground plane, 55% and
     110 px are the points at which a subject stops being one. Four candidates can pass all of
     them, and something still has to order the survivors.
     This is that something: the product of the two quantities the shot must deliver at once —
     the ring READING AS A RING (ellipse ratio) and the figure READING AS A FIGURE (pixel
     height). They pull opposite ways, which is the entire difficulty of this frame: elevation
     rounds the ring and shrinks the man. A composite is not evidence and is not treated as
     any; it is a stated rule for ranking things the evidence has already admitted. */
  const rank = flat * slyH;
  console.log(`   ellipse ratio ${flat.toFixed(3)} (bar 0.22) · ring covers ${(swallowed * 100).toFixed(0)}% of Sly (bar 55%) · rank ${rank.toFixed(1)}`);
  console.log(`   column over the impact point: ${col.map((v) => v.toFixed(2)).join(', ') || '(empty)'} · standing on ${g === null ? 'NOTHING architectural' : g.toFixed(2)}`);
  console.log(faults.length ? `   FAULTS: ${faults.join(' | ')}` : '   no faults');
  return faults.length;
}

const args = process.argv.slice(2);
const shotArg = args.indexOf('--shot');
if (shotArg >= 0) {
  const name = args[shotArg + 1];
  const s = SHOTS[name];
  if (!s) { console.error(`no shot "${name}" in SHOTS`); process.exit(2); }
  if (!s.player?.pos) { console.error(`shot "${name}" stages no player — nothing to slam`); process.exit(2); }
  process.exit(score(name, s) ? 1 : 0);
}

/**
 * Candidates.
 *
 * All in the courtyard, on paving, because that is where the crack and scuff decals read: a
 * slam on sand leaves a mark nobody can see, and the two decals are half the staged event.
 * The variable being swept is CAMERA ELEVATION AND DISTANCE, which is the whole difficulty —
 * the ring wants distance and the figure wants closeness, and those pull opposite ways.
 */
/* (0, 0, -8), and the two rejected before it are the reason this constant carries a comment.
   The first draft slammed at (0, 0, 20) — under the obelisk terrace, with architecture at 1.56,
   1.63, 2.00 and 2.92 m directly overhead, i.e. a slam in a 1.56 m crawlspace. The second tried
   (0, 0, -6), which the tool reported as having NO architecture floor at all: it is a gap in the
   paving, so the crack and scuff decals — half the staged event — would have landed on terrain
   this tool cannot see and possibly on nothing. Both were found by the column print rather than
   by looking, and both would have rendered a plausible frame. */
const AT = [0, 0, -8];
const P = { pos: AT, yaw: 0.35, pose: 'dive_impact' };

const CANDIDATES = {
  /* CALIBRATION, and it must fault. Four candidates that all pass tell you nothing about the
     tool — the first version of this file scored 4/4 and I had learned nothing from it. This is
     the frame the instinct actually produces: get close, get low, fill the frame with the hero.
     If this ever reports "no faults", the bars have stopped biting and nothing below is
     evidence. */
  'CALIB close and low — the instinct, and it must fault': {
    pos: [1.6, 0.9, -5.4], target: [0.0, 0.8, -8.0], fov: 52, tod: 0.78, player: P,
  },
  'A three-quarter, lifted': {
    pos: [4.6, 3.4, -3.4], target: [0.0, 0.7, -8.0], fov: 44, tod: 0.78, player: P,
  },
  'B higher and further — the ring reads, does the figure?': {
    pos: [6.4, 5.4, -1.6], target: [0.0, 0.5, -8.0], fov: 42, tod: 0.78, player: P,
  },
  'C lifted, tighter lens to buy the figure back': {
    pos: [5.4, 4.4, -2.6], target: [0.0, 0.6, -8.0], fov: 38, tod: 0.78, player: P,
  },
  'D low three-quarter — the most ground the ellipse bar allows': {
    pos: [4.2, 2.3, -4.2], target: [0.0, 0.8, -8.0], fov: 46, tod: 0.78, player: P,
  },
};

let clean = 0;
for (const [name, c] of Object.entries(CANDIDATES)) if (score(name, c) === 0) clean++;
console.log(`\n${clean}/${Object.keys(CANDIDATES).length} candidates with no faults`);

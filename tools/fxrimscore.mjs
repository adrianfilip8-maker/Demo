#!/usr/bin/env node
/**
 * fxrimscore.mjs — §379.4's objective half, scored against PNGs on disk.
 *
 *   node tools/fxrimscore.mjs shots/fxrim-impact
 *
 * No browser. `tools/fxrim.mjs` holds the FIFO capture lock for as short a time as it can and
 * this does the arithmetic afterwards, because §400 records five container rollbacks and every
 * one of them ate an in-flight capture.
 *
 * ── THE QUESTION ────────────────────────────────────────────────────────────────────────────
 * §379.1's structural fact: particles set `depthWrite: false` (`Particles.js:1468, 1800, 2041,
 * 2193, 2405`), so `PostFX`'s edge pass — which keys off depth and normals — cannot see them;
 * and they are instanced quads, not `isMesh`, so `Outline.js:381`'s gate excludes them from the
 * hull system. Both mandatory ink treatments therefore miss them **in the source**. Nobody has
 * ever checked the picture. `dive_ring` is the place to check: 104x `alert_spot`'s peak
 * projected ink and 7.6x the next largest sprite in the game.
 *
 * ── THE INSTRUMENT: ink is what the ink passes CHANGE ────────────────────────────────────────
 * Not a near-black threshold. §270 is the record of that instrument being VOIDed on this very
 * project — a ridge detector found, on `night.png`, an "ink" median brighter than the frame
 * median — and the authored hexes are not what lands in the file anyway: hull ink is graded to
 * display L 12.3–23.4, crease ink leaks 5% of the background through `inkStrength 0.95`, is
 * faded by `smoothstep(0.05, 0.20, lum)`, then vignetted and smeared by FXAA. §2.1.2's colours
 * are still measured here, but as a REPORTED CROSS-CHECK on the definitional answer, never as
 * the detector. See `§colour` at the bottom.
 *
 * The verdict is taken on the CREASE pass alone — `A − B`, the depth/normal edge detect. That is
 * the treatment §379.1's mechanism is about. The hull is inapplicable to a ground ring by
 * construction and nobody disputes it (`Outline.js:381` gates on `isMesh`, and nothing ever
 * calls `shading.outline()` on an FX material), so measuring it would be theatre.
 *
 * ── THE THREE LOCI, and why each is located the way it is ───────────────────────────────────
 *
 *   RIM     the `dive_ring` rim: 720 points from `framelib.discOf`, projected from the point
 *           and radius the SHIPPED `Particles._stageImpact()` returns. Not restated — the
 *           staging function is executed and `discOf` hands back its own rim samples.
 *
 *   HERO    §379.4's MUST-FIND probe: the footprint of the inverted-hull shells, `B − C`. Those
 *           are hull-inked silhouettes as a piece of GEOMETRY, and they are located without
 *           reference to the pass being measured — the edge pass keys off the opaque scene's
 *           depth and normals and knows nothing about hull shells, so "does the edge pass fire
 *           where the hull says a silhouette is" is a real question.
 *
 *           **It is not Sly alone, and an earlier version of this file said it was.** The census
 *           (`SANDS_CENSUS=1`) counts 14 shells in this frame and they belong to `slydlrig`, the
 *           cane, a guard and the gold props — so 41% of the mask, spanning x 385..1264, is not
 *           the player. That makes it a broader positive control, not a worse one; it just is
 *           not "Sly's silhouette" and must not be quoted as one.
 *
 *           `boxOf` cannot supply this locus: the `dive_impact` slam renders at x 502..699 /
 *           rows 303..498 against the upright box's 583..697 / 202..451. `A − S-nosly` cannot
 *           either — it is the figure PLUS his cast shadow (x 356..841 / rows 277..614), and a
 *           shadow correctly carries no ink.
 *
 *   FLOOR   §379.4's MUST-NOT-FIND probe: ground-plane points on a grid, kept only where
 *           `framelib` finds architecture at the impact's own height, the camera has a clear
 *           line to it, and the projection is cordoned off from every other locus. A number
 *           with no such probe means nothing — a bar the frame passes everywhere is measuring
 *           the frame, not the ring. This frame's paving also supplies a SECOND positive
 *           control for free: its block seams are real depth edges lying in the ring's own
 *           plane, so CAL-D asks the edge pass to fire on the ground and it does.
 *
 * ── THE STATISTIC, and the two instruments this replaced ────────────────────────────────────
 * At each sample: **the darkest ink within `BAND_R` pixels** — the question "is there a line
 * here?", since a line is a local extremum crossing a boundary and a locus with no line has no
 * extremum to find. Reduced by the median over the locus. Two earlier instruments VOIDed on
 * their own calibration probes and both failures are recorded in the body: a boolean `A != C`
 * mask (counts sub-level leakage — 16% of bare paving), and a mean over an area band (dilutes a
 * 2.5 px line across a 4.5 px band, and bare paving in this frame is not quiet at 5.9 L).
 *
 * ── THE BARS ARE DERIVED FROM THE CONTROL, NOT PICKED ───────────────────────────────────────
 * CAL-B, the positive probe, must clear the floor control's **p90** — a positive result has to
 * beat the null's loud tail. The **verdict** bar is the floor control's **median**, because the
 * tail is paving seams and "reads like bare floor" means the typical floor, not its edges.
 * `BAND_R` comes from `ToonMaterial.TUNE.inkPx` (the shipped 2.5 px line), and every number is
 * printed across a sweep of it so no verdict can turn on that choice either.
 */
import { readPNG, px } from './png.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { SHOTS } from '../src/core/Shots.js';
import { Particles } from '../src/fx/Particles.js';
import { TUNE as TOON_TUNE } from '../src/render/ToonMaterial.js';
import {
  W, H, SLY, provenance, camFor, boxOf, discOf, project, clear, assertOccluded, assertVisible,
  groundUnder,
} from './framelib.mjs';
import {
  BAND_R, idx, inFrame, stamp, countOf, bandOfPolyline, bandOfPixels, boundaryOf,
} from './fxrimlib.mjs';

const DIR = process.argv[2] || 'shots/fxrim-impact';
const SHOT = process.argv[3] || 'impact';

/* ── arms ──────────────────────────────────────────────────────────────────────────────── */

const TAGS = ['A-ship', 'B-nocrease', 'C-noink', 'N-nofx', 'S-nosly', 'Z-null'];
const IM = {};
for (const t of TAGS) {
  const f = `${DIR}/${SHOT}-${t}.png`;
  if (!existsSync(f)) { console.error(`missing arm ${t}: ${f}`); process.exit(2); }
  IM[t] = readPNG(f);
}
const meta = existsSync(`${DIR}/arms.json`) ? JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8')) : null;

console.log(`fxrimscore · ${DIR} · shot ${SHOT} · tool tree ${provenance}`);
if (meta?.tree) console.log(`captured from src ${meta.tree.src ?? '?'} (HEAD ${meta.tree.head ?? '?'}) at ${meta.at}`);
for (const t of TAGS) {
  if (IM[t].w !== W || IM[t].h !== H) {
    console.error(`arm ${t} is ${IM[t].w}x${IM[t].h}; framelib projects at ${W}x${H}. A margin `
      + 'measured at the wrong size is a different claim.');
    process.exit(2);
  }
}

/** |Δ| over the three channels, max-channel. 0 means byte-identical. */
function delta(a, b, i) {
  const ca = a.ch, cb = b.ch, ia = i * ca, ib = i * cb;
  return Math.max(
    Math.abs(a.data[ia] - b.data[ib]),
    Math.abs(a.data[ia + 1] - b.data[ib + 1]),
    Math.abs(a.data[ia + 2] - b.data[ib + 2]),
  );
}
/** Boolean mask of pixels where two arms differ by more than `thr`. */
function diffMask(a, b, thr = 0) {
  const m = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (delta(a, b, i) > thr) { m[i] = 1; n++; }
  m.n = n;
  return m;
}

/* ── instrument gates: every one of these must hold or nothing below is evidence ────────── */

const gates = [];
const gate = (id, ok, msg) => { gates.push({ id, ok, msg }); return ok; };

const zero = diffMask(IM['A-ship'], IM['Z-null'], 0);
gate('G1 null arm', zero.n === 0,
  `A vs Z differ in ${zero.n} px — two renders of the identical state do not reproduce, so every `
  + 'mask below is noise');

const inkMask = diffMask(IM['A-ship'], IM['C-noink'], 0);
const creaseMask = diffMask(IM['A-ship'], IM['B-nocrease'], 0);
const hullMask = diffMask(IM['B-nocrease'], IM['C-noink'], 0);
const fxMask = diffMask(IM['A-ship'], IM['N-nofx'], 0);
const slyMask = diffMask(IM['A-ship'], IM['S-nosly'], 0);

gate('G2 ink lever', inkMask.n > 0, 'defeating both ink systems changed no pixels — the ink map is empty');
gate('G3 fx lever', fxMask.n > 0, 'hiding the FX root changed no pixels — the presence probe cannot fire');
gate('G4 sly lever', slyMask.n > 0, 'hiding the character root changed no pixels — the MUST-FIND probe cannot fire');

console.log(`\nmasks (px, ${(W * H / 1e3).toFixed(0)}k frame)`);
for (const [n, m] of [['ink A−C', inkMask], ['crease A−B', creaseMask], ['hull B−C', hullMask],
  ['fx A−N', fxMask], ['sly A−S', slyMask]]) {
  console.log(`  ${n.padEnd(12)} ${String(m.n).padStart(7)}  ${(100 * m.n / (W * H)).toFixed(3)}% of frame`);
}

/**
 * ── HOW MUCH ink, not WHETHER a byte moved ──────────────────────────────────────────────────
 *
 * The boolean masks above are the right map of *reach* and the wrong statistic for *density*,
 * and the first run of this scorer proved it by VOIDing itself: `A != C` fires on 16.8% of the
 * frame, and 16.1% of bare open paving, because the crease pass composites `min(ink, c)` over a
 * continuous edge response and therefore darkens sand grain and paving joints by a fraction of
 * a level everywhere. Counting those as ink makes every region in the frame read the same,
 * which is the exact shape of a false null: the rim would have "measured like the floor"
 * because EVERYTHING measures like the floor.
 *
 * Measured instead: **how much darker the ink passes make the pixel**, in display luma, which
 * needs no threshold at all. The pass is strictly subtractive by construction (`PostFX.js`:
 * "a per-channel min() makes it arithmetically impossible for this pass to add light to any
 * pixel, in any channel, ever"), so `luma(C) − luma(A)` is non-negative wherever ink landed and
 * is simply the weight of the line there. A count sweep over that quantity is printed too, but
 * the verdict is taken on the mean, where no threshold has been chosen by anybody.
 */
const LUMA = (im) => {
  const out = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const j = i * im.ch;
    out[i] = 0.2126 * im.data[j] + 0.7152 * im.data[j + 1] + 0.0722 * im.data[j + 2];
  }
  return out;
};
const lumA = LUMA(IM['A-ship']);
const inkAmt = new Float32Array(W * H);           // luma(C) − luma(A): how dark the ink drew here
const creaseAmt = new Float32Array(W * H);        // luma(B) − luma(A): the edge pass alone
const fxAmt = new Float32Array(W * H);            // |luma(A) − luma(N)|: how loud the FX is here
{
  const lumC = LUMA(IM['C-noink']), lumB = LUMA(IM['B-nocrease']), lumN = LUMA(IM['N-nofx']);
  for (let i = 0; i < W * H; i++) {
    inkAmt[i] = lumC[i] - lumA[i];
    creaseAmt[i] = lumB[i] - lumA[i];
    fxAmt[i] = Math.abs(lumA[i] - lumN[i]);
  }
}

/* ── geometry: the ring, from the shipped staging function ──────────────────────────────── */

/* BOTH halves, printed before any region is built. The floor control is thinned by `clear()`,
   so a `clear()` stuck on "occluded" would silently shrink the null probe toward the few points
   it still admits — and §401 records that exactly this failure went unnoticed on `alert`,
   because a check that condemns frames looks like diligence. `assertOccluded` alone is half a
   calibration. */
console.log(`\n${assertOccluded()}`);
console.log(assertVisible());

const shot = SHOTS[SHOT];
const emits = [];
const stageCtx = {
  engine: { get: (k) => (k === 'movement' && shot.player?.pos
    ? { position: new THREE.Vector3(...shot.player.pos) } : null) },
  _emit: (n, at, o) => emits.push({ n, at: at.clone(), ...o }),
  decal: () => {},
};
const staged = Particles.prototype._stageImpact.call(stageCtx);
const cam = camFor(shot);
/* 720 segments, not `discOf`'s default 24: the band is a curve here, not a bounding box, and at
   24 the chords cut ~2 px inside the true rim on a 360 px ellipse — which would walk the band
   off the ink it is looking for. The default is right for `impactframe`, which only needs the
   extremes. */
const ring = discOf(cam, staged.point.x, staged.point.y, staged.point.z, staged.radius, 720);
const slyBox = boxOf(cam, ...shot.player.pos, SLY);
console.log(`ring r ${staged.radius} m at (${staged.point.toArray().join(', ')}) `
  + `→ ${(ring.x1 - ring.x0).toFixed(0)} x ${(ring.y1 - ring.y0).toFixed(0)} px, ${ring.rim.length} rim samples`);
console.log(`sly box rows ${slyBox.y0.toFixed(0)}..${slyBox.y1.toFixed(0)} (${(slyBox.y1 - slyBox.y0).toFixed(0)} px)`);
console.log(`staged sprites: ${emits.map((e) => `${e.n}@${e.age}s`).join(' ')}`);

/* ── regions ────────────────────────────────────────────────────────────────────────────── */

/**
 * The floor control, chosen by GEOMETRY.
 *
 * Ground-plane points on a grid, kept only where all four hold: `framelib` finds architecture
 * within 0.25 m of the impact's own height (so it is the paving and not a terrace or a hole —
 * the check that rejected two impact sites when this shot was authored); `clear()` says the
 * camera can see it; the projection sits inside the frame with a margin; and it is far from
 * every other region in pixels. The last one is what makes it a control rather than a second
 * sample of the same thing.
 */
function floorPoints() {
  const keep = [];
  const [ix, , iz] = shot.player.pos;
  for (let wx = -14; wx <= 14; wx += 0.5) {
    for (let wz = -20; wz <= 6; wz += 0.5) {
      const g = groundUnder(wx, wz, staged.point.y + 1.0);
      if (g === null || Math.abs(g - shot.player.pos[1]) > 0.25) continue;
      const p = project(cam, wx, staged.point.y, wz);
      if (!p || p.px < 40 || p.py < 40 || p.px > W - 40 || p.py > H - 40) continue;
      if (!clear(cam, { x: wx, y: staged.point.y, z: wz })) continue;
      keep.push({ wx, wz, px: p.px, py: p.py, d: Math.hypot(wx - ix, wz - iz) });
    }
  }
  return keep;
}
/* Cast once, and cached to disk beside the frames. The geometry a candidate has to satisfy —
   real paving at the impact's own height, visible from the lens, inside the frame — does not
   depend on the band width or on any pixel, and re-raycasting it per sweep step turned a
   two-minute score into an unfinishable one. The cache is keyed on the source tree the frames
   were captured from, so it cannot outlive the level it describes. The band-dependent half of
   the rule (clearance from every other region) is applied per step below. */
const CACHE = `${DIR}/floor-candidates.json`;
let FLOOR_CANDIDATES;
const cacheKey = `${SHOT}|${meta?.tree?.src ?? 'unknown'}`;
if (existsSync(CACHE)) {
  const c = JSON.parse(readFileSync(CACHE, 'utf8'));
  if (c.key === cacheKey) FLOOR_CANDIDATES = c.points;
}
if (!FLOOR_CANDIDATES) {
  FLOOR_CANDIDATES = floorPoints();
  writeFileSync(CACHE, JSON.stringify({ key: cacheKey, points: FLOOR_CANDIDATES }));
}
console.log(`floor candidates on visible paving: ${FLOOR_CANDIDATES.length}`);

/** Is a disc of radius `r` at (cx, cy) entirely clear of `excl`? */
function discClear(excl, cx, cy, r) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inFrame(x, y)) return false;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r && excl[idx(x, y)]) return false;
    }
  }
  return true;
}

/* ── the sweep ──────────────────────────────────────────────────────────────────────────── */

/* `BAND_R` is `inkPx / 2 + 1` and its derivation lives in `fxrimlib.mjs` beside the builders
   that consume it. Every other half-width in the sweep is printed beside it so no verdict can
   turn on the choice. */
const R0 = BAND_R;
const SWEEP = [1, 2, R0, 4, 5, 6].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

console.log(`\nband half-width from ToonMaterial.TUNE.inkPx ${TOON_TUNE.inkPx} → ${R0} px (line/2 + 1 for FXAA)`);

/**
 * ── THE LOCUS, not a band average — and the first two runs of this scorer are why ───────────
 *
 * The measurement is "ink ALONG the rim", and a mean over an area band answers a different
 * question: a band is half boundary and half neighbourhood, so a real 2.5 px line inside a
 * 4.5 px band reads at roughly half strength, and a region with no line at all reads at
 * whatever its neighbourhood happens to contain. Both of the first two runs VOIDed on that —
 * the boolean version because a Δ>0 mask counts sub-level leakage, the mean version because
 * bare paving in this frame is NOT quiet (5.9 L; the courtyard's block seams are edges and the
 * edge pass is right to ink them).
 *
 * So each region is a LOCUS of sample points, and the statistic at a point is
 *
 *     the darkest ink within `BAND_R` pixels of it
 *
 * which is exactly the question "is there a line here?" — a line is a local extremum crossing
 * the boundary, and a locus with no line has no extremum to find. The three loci are sampled
 * the same way and reduced the same way, so they are comparable by construction:
 *
 *   RIM    `discOf(...).rim` at 720 samples — the projected `dive_ring` rim, from the point
 *          and radius the shipped `_stageImpact()` returns.
 *   HERO   the HULL mask `B − C` — where the inverted-hull shells project, i.e. hull-inked
 *          silhouettes as a piece of GEOMETRY. It locates them without reference to the pass
 *          being measured — see the note on circularity below. All 14 shells in the frame, not
 *          just the player's: 41% of the mask is a guard and the gold props.
 *   FLOOR  the ground-plane grid points `framelib` admits as visible paving at the impact's own
 *          height, cordoned off from every other region.
 *
 * ── Why the hero locus is the hull's footprint, and why that is not circular ─────────────────
 * `boxOf` cannot supply it. The `dive_impact` pose is a slam: the rendered figure occupies
 * x 502..699 and rows 303..498, against the upright 0.62 x 1.80 box's 583..697 and 202..451 —
 * wider than the box, shorter, and reaching lower. The box is not wrong (`framelib`'s header
 * says outright that subjects are approximated as upright boxes); it is simply not a silhouette.
 * `A − S-nosly` is the whole figure but also its SHADOW — together x 356..841 / rows 277..614 —
 * and a shadow is a ground feature that correctly carries no ink, so it would dilute the
 * MUST-FIND probe with pixels that are right to be blank.
 *
 * The verdict is therefore taken on the **CREASE** pass (`A − B`), the depth/normal edge detect,
 * located by the **HULL** pass (`B − C`). Two different systems: the edge pass keys off the
 * opaque scene's depth and normals and knows nothing about hull shells, so asking "does the
 * edge pass fire where the hull says the silhouette is" is a real question with a real answer.
 * Measuring total ink `A − C` on the hull's own footprint would be circular and is not done.
 *
 * That is also the sharper form of §379.1. The hull system is inapplicable to a ground ring by
 * construction and nobody disputes it — `Outline.js:381` gates on `isMesh` and nothing ever
 * calls `shading.outline()` on an FX material. The live question is the OTHER treatment: the
 * edge pass, which §379.1 says cannot see particles because they write no depth.
 *
 * ── The hero locus is the hull FOOTPRINT, not its outline, and CAL-B caught the difference ──
 * The first version sampled `boundaryOf(hullMask)`. It failed CAL-B at 6.9 L, and the failure
 * was the locus's rather than the frame's: the shell is extruded `TUNE.inkPx` outward, so the
 * outline of its footprint runs about 2.5 px OUTSIDE the mesh silhouette, while the crease line
 * sits on the silhouette itself — the probe was searching a line-width away from the line, and
 * the sag showed up as a median that climbed from 2.1 L at r=1 to 82.5 L at r=6. Sampling the
 * footprint instead puts the samples across the silhouette band, and the median is 17.5 L at
 * r=1 and 53.2 L at the derived radius. That is a repaired instrument, not a moved bar: the bar
 * is still the floor control's p90, computed the same way, and it was the MUST-FIND probe that
 * refused the bad locus.
 */
const HERO_SUB = Math.max(1, Math.floor(countOf(hullMask) / 6000));
const heroLocus = [];
for (let y = 0, k = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!hullMask[idx(x, y)]) continue;
    if (k++ % HERO_SUB === 0) heroLocus.push([x + 0.5, y + 0.5]);
  }
}
/**
 * ── The rim runs BEHIND THE HERO, and those samples measure him ─────────────────────────────
 *
 * Sly stands at the centre of his own slam, so a 1.5 m ring around his feet projects across his
 * legs and body: 234 of the 720 rim samples come within a search disc of the hero region. Their
 * peaks are his ink — median 10.5 L, up to 154 L — and counting them as "ink on the ring" would
 * credit the ring with the hero's outline. They are reported separately and excluded from the
 * verdict, and the exclusion is decided by the hero LOCATOR (the hull footprint and `A − S`),
 * which knows nothing about the crease field being measured.
 *
 * The slack is one pixel beyond the search radius, for the FXAA that runs after the ink pass and
 * can carry a line a pixel further than it was drawn. A sample whose disc reaches no hero pixel
 * cannot be reading the hero's line.
 */
const heroRegion = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) if (slyMask[i] || hullMask[i]) heroRegion[i] = 1;
const rimAll = ring.rim.map((p) => [p.px, p.py]);
const touchesHero = (cx, cy, r) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inFrame(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r && heroRegion[idx(x, y)]) return true;
    }
  }
  return false;
};
console.log(`\nloci: rim ${rimAll.length} samples · hero ${heroLocus.length} of ${countOf(hullMask)} hull px `
  + `(every ${HERO_SUB}) · floor candidates ${FLOOR_CANDIDATES.length}`);
gate('G5 hero locus non-empty', heroLocus.length > 0, 'the hull mask is empty — nothing to sample');

/** The darkest value of `field` within `r` px of (cx, cy). */
function peakNear(field, cx, cy, r) {
  let best = -Infinity;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inFrame(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const v = field[idx(x, y)];
      if (v > best) best = v;
    }
  }
  return best === -Infinity ? 0 : best;
}
const quant = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
/** Per-point peaks of `field` over a locus. */
const peaks = (locus, field, r) => locus.map(([x, y]) => peakNear(field, x, y, r));

/* The floor locus, cordoned away from every other region. Recomputed per band width because the
   cordon is band-relative; the raycast half is cached above and does not repeat. */
function floorLocus(r) {
  const excl = new Uint8Array(W * H);
  const rimBand = bandOfPolyline(ring.rim, r + 8);
  const heroBand = bandOfPixels(heroLocus, r + 8);
  for (let i = 0; i < W * H; i++) if (rimBand[i] || heroBand[i] || fxMask[i] || slyMask[i]) excl[i] = 1;
  return FLOOR_CANDIDATES.filter((q) => discClear(excl, q.px, q.py, r)).map((q) => [q.px, q.py]);
}

console.log('\nPEAK INK within BAND_R of each sample, luma levels of 255 — MEDIAN over the locus');
console.log('                     RIM, hero-overlap excluded      HERO (all hull-inked geo)      FLOOR (open paving)');
console.log('  r    what        crease  allink   fx    n     crease  allink*  n         crease  allink   n');

const rows = [];
for (const r of SWEEP) {
  const fl = floorLocus(r);
  const rimLocus = rimAll.filter(([x, y]) => !touchesHero(x, y, r + 1));
  const rimBehind = rimAll.filter(([x, y]) => touchesHero(x, y, r + 1));
  const row = {
    r, rimLocus, rimBehind,
    rimC: peaks(rimLocus, creaseAmt, r), rimI: peaks(rimLocus, inkAmt, r), rimF: peaks(rimLocus, fxAmt, r),
    behindC: peaks(rimBehind, creaseAmt, r),
    heroC: peaks(heroLocus, creaseAmt, r), heroI: peaks(heroLocus, inkAmt, r),
    floorC: peaks(fl, creaseAmt, r), floorI: peaks(fl, inkAmt, r), floorF: peaks(fl, fxAmt, r),
    floorN: fl.length,
  };
  rows.push(row);
  const m = (a) => (a.length ? quant(a, 0.5).toFixed(2) : '—').padStart(6);
  console.log(`  ${String(r).padEnd(4)} ${(r === R0 ? '← derived' : '').padEnd(11)}`
    + `${m(row.rimC)} ${m(row.rimI)} ${m(row.rimF)} ${String(rimLocus.length).padStart(4)}   ${m(row.heroC)} ${m(row.heroI)} ${String(heroLocus.length).padStart(6)}    `
    + `${m(row.floorC)} ${m(row.floorI)} ${String(row.floorN).padStart(5)}`);
}
console.log('  * `allink` on the HERO locus is circular by construction (the locus IS the hull\'s');
console.log('    footprint) and is printed for scale only. No gate and no verdict reads it.');

const main = rows.find((x) => x.r === R0);
const med = (a) => quant(a, 0.5);

/* ── verdict ────────────────────────────────────────────────────────────────────────────── */

console.log(`\nat the derived radius r = ${R0}:`);
console.log(`  RIM    ${main.rimLocus.length} of ${rimAll.length} samples clear of the hero · crease ${med(main.rimC).toFixed(2)} L `
  + `· FX loudness ${med(main.rimF).toFixed(1)} L`);
console.log(`         the other ${main.rimBehind.length} run behind him and read ${med(main.behindC).toFixed(2)} L — HIS ink, not the ring's`);
console.log(`  HERO   ${heroLocus.length} samples · crease ${med(main.heroC).toFixed(2)} L   (all hull-inked geometry: Sly 59%, plus a guard and gold props)`);
console.log(`  FLOOR  ${main.floorN} samples · crease ${med(main.floorC).toFixed(2)} L · FX loudness ${med(main.floorF).toFixed(1)} L`);

/* CAL-E: the exclusion must not BE the measurement. If the hero swallowed most of the rim, the
   surviving arc would be a handful of samples somewhere and its median would describe nothing —
   and `impactframe`'s own FIGURE SWALLOWED fault exists because that is a real way this frame
   can go wrong. Bar: over half the rim must survive. */
gate('CAL-E the hero exclusion leaves a rim to measure',
  main.rimLocus.length > rimAll.length / 2,
  `only ${main.rimLocus.length} of ${rimAll.length} rim samples are clear of the hero — the ring is `
  + 'mostly behind him, so what is left is not a measurement of the ring');

/* CAL-A: the rim locus is ON the drawn ring, stated as a ratio against the control rather than
   as a presence test. `A != N` covers 72.8% of this frame — the ambient sand haze, shafts and
   motes are FX too — so "the samples are on FX pixels" would be nearly vacuous. What is not
   vacuous is that the FX is far louder on the rim than it is over bare paving. */
gate('CAL-A the rim locus is on the drawn ring', med(main.rimF) > 4 * Math.max(med(main.floorF), 0.5),
  `the FX peaks at ${med(main.rimF).toFixed(1)} L on the rim locus against ${med(main.floorF).toFixed(1)} L over open `
  + 'paving — the locus is not on the ring, so its ink reading is a measurement of empty floor');
/* CAL-B: MUST FIND. The hero silhouette is the frame's strongest depth discontinuity; if the
   edge pass does not fire there, it is not working and no low number anywhere means anything.
   The bar is the floor control's own p90 — the level nine out of ten null samples stay under —
   which is derived from the frame and stated before the rim is read. */
const BAR = quant(main.floorC, 0.9);
gate('CAL-B hull-inked silhouettes carry crease ink', med(main.heroC) > BAR,
  `the hero silhouette peaks at only ${med(main.heroC).toFixed(2)} L against the floor control's p90 of `
  + `${BAR.toFixed(2)} L — the frame's strongest depth discontinuity does not read as inked, so a low `
  + 'rim number means nothing');
/* CAL-C: MUST NOT FIND. The null has to BE null at its median: under 1 L is under half a step of
   an 8-bit channel, i.e. the pass does nothing at a typical point of open paving. Its TAIL is
   expected to be loud — the courtyard is laid in blocks and every seam is a real edge the pass
   is right to ink — which is why the bar above is the p90 and not the maximum. */
gate('CAL-C open paving is null at its median', main.floorN > 0 && med(main.floorC) < 1.0,
  main.floorN === 0 ? 'no floor control could be placed at all'
    : `the median open-paving sample peaks at ${med(main.floorC).toFixed(2)} L — the detector fires on `
      + 'flat ground, so it is not measuring boundaries');
/* CAL-D: the SECOND must-find, and the one that makes the result hard to argue with. The floor
   control's own loud tail is paving seams — genuine depth discontinuities lying IN THE RING'S
   OWN PLANE, a few metres away, at the same grade and the same distance from the lens. If the
   edge pass fires there and not on the rim, no appeal to lighting, exposure or ground-plane
   geometry can explain the difference away. Bar: the tail must clear one 8-bit level, which is
   the smallest darkening the file can record at all — not a number anyone chose. */
gate('CAL-D the edge pass fires on the ground plane', quant(main.floorC, 0.9) > 1.0,
  `the floor control's p90 is ${quant(main.floorC, 0.9).toFixed(2)} L — the edge pass never fires anywhere `
  + 'on the paving, so this frame contains no ground-plane positive control and the rim result '
  + 'rests on the hero probe alone');

console.log('\ninstrument gates');
let voided = false;
for (const g of gates) {
  console.log(`  ${g.ok ? 'PASS' : 'FAIL'}  ${g.id}${g.ok ? '' : ` — ${g.msg}`}`);
  if (!g.ok) voided = true;
}
if (voided) {
  console.log('\nVOID — an instrument gate failed. No verdict is available from this set.');
  process.exit(3);
}

const z = (med(main.heroC) - med(main.floorC)) > 0
  ? (med(main.rimC) - med(main.floorC)) / (med(main.heroC) - med(main.floorC)) : NaN;

/* The verdict bar is the floor control's MEDIAN, not its p90.
   p90 is the right bar for CAL-B, whose job is to prove the detector fires — a positive probe
   has to clear the null's loud tail. It is the wrong bar for the verdict, because the tail is
   paving seams and a rim compared against seams would be given credit for every level below
   38 L. The null's TYPICAL level is what "reads like bare floor" means, and it is measured
   here, not chosen: whatever the median open-paving sample peaks at, the rim must not exceed
   it. On this frame that is the strictest bar available — 0.00 L — and it is strict by accident
   of the floor being genuinely null, not by anyone's choice. */
const VERDICT_BAR = med(main.floorC);
console.log('\n── VERDICT ────────────────────────────────────────────────────────────────────');
console.log(`  rim crease     ${med(main.rimC).toFixed(3)} L    (p90 ${quant(main.rimC, 0.9).toFixed(2)})`);
console.log(`  floor crease   ${med(main.floorC).toFixed(3)} L    (p90 ${BAR.toFixed(2)} L; the verdict bar is the median, ${VERDICT_BAR.toFixed(3)} L)`);
console.log(`  hero crease    ${med(main.heroC).toFixed(3)} L    (p90 ${quant(main.heroC, 0.9).toFixed(2)})`);
console.log(`  rim on the floor→hero scale: ${(100 * z).toFixed(2)}%   (0% = reads exactly like bare paving)`);
if (med(main.rimC) <= VERDICT_BAR) {
  console.log('\n  §379.1 DEMONSTRATED on this frame. The edge pass fires no harder along the rim of');
  console.log('  the largest sprite in the game than it does on bare paving — both at the floor of');
  console.log(`  the 8-bit scale — while the hero silhouette a hand's width away, in the same frame`);
  console.log(`  and the same grade, reads ${med(main.heroC).toFixed(1)} L. A ratio is not quoted: the denominator is zero,`);
  console.log('  and "no line at all" is the finding rather than "a faint one".');
} else {
  console.log('\n  §379.1 IS NOT DEMONSTRATED. The rim carries crease ink above the floor control\'s');
  console.log(`  own typical level (${med(main.rimC).toFixed(3)} L against a ${VERDICT_BAR.toFixed(3)} L bar). The hypothesis that`);
  console.log('  particles carry neither ink treatment does not survive this measurement as taken.');
}

/* The distribution, so the medians can be read as a shape rather than as three numbers: what
   fraction of each locus peaks at or above T. No bar is taken on any row — choosing T is the
   mistake §270 records — but a median can hide a loud minority, and this is what says whether
   it did. */
console.log('\n  fraction of each locus whose crease peak is at least T levels');
console.log('    T        rim      hero     floor');
for (const T of [0.5, 1, 2, 4, 8, 16, 32, 64]) {
  const f = (a) => `${(100 * a.filter((v) => v >= T).length / a.length).toFixed(2).padStart(7)}%`;
  console.log(`    ${String(T).padEnd(6)} ${f(main.rimC)} ${f(main.heroC)} ${f(main.floorC)}`);
}



/* ── PER-POPULATION: the other three sprites §379.1 is also a claim about ────────────────────
 *
 * Round 16 measured `dive_ring` and said so. §379.1 is a claim about PARTICLES, and one sprite
 * is one sprite. These arms hide one BATCH at a time, so `A − P-noX` is exactly the pixels that
 * population draws and `boundaryOf` of it is that population's silhouette — the same statistic
 * and the same floor control as the rim, with the locus supplied by a diff instead of by
 * `discOf`.
 *
 * ── A soft cloud has no unambiguous silhouette, and that is handled rather than hidden ───────
 * A ring has a rim. A dust cloud fades to zero alpha at its edge, so "the boundary" depends on
 * where you cut the mask, and any single cut would be a number somebody chose. The cut is
 * therefore SWEPT: if the ink answer is the same at every cut from half a level to 24, the
 * ambiguity does not reach the conclusion. If it were not, the honest report would be that the
 * method does not transfer to a cloud — which was a live possibility going in.
 *
 * `dust` carries BOTH `dive_dust` and `dive_debris` (`Emitters.js`: same batch), so that row is
 * the pair and is labelled as the pair. `spark` carries `dive_spark` and also every ember and
 * fire in frame; the live instance counts recorded per arm say what was actually in each.
 */
const POPS = [
  { tag: 'P-noring',  label: 'ring  (dive_ring)' },
  { tag: 'P-nodust',  label: 'dust  (dive_dust + dive_debris)' },
  { tag: 'P-nospark', label: 'spark (dive_spark + any fires)' },
];
const havePops = POPS.every((p) => existsSync(`${DIR}/${SHOT}-${p.tag}.png`));
if (!havePops) {
  console.log('\n(no P-* batch arms in this set — per-population section skipped)');
} else {
  for (const p of POPS) IM[p.tag] = readPNG(`${DIR}/${SHOT}-${p.tag}.png`);

  console.log('\n── PER-POPULATION ─────────────────────────────────────────────────────────────');
  if (meta?.arms) {
    for (const p of POPS) {
      const a = meta.arms.find((r) => r.arm === p.tag);
      const live = a?.applied?.live ?? {};
      const key = p.tag.replace('P-no', '');
      console.log(`  ${p.label.padEnd(34)} batch "${key}" live instances at capture: ${live[key] ?? '?'}`
        + `${a?.applied?.batchFound === false ? '   !! BATCH NOT FOUND — the lever did nothing' : ''}`);
    }
  }

  /**
   * ── A batch diff is only a SILHOUETTE when it looks like one, and this is that gate ────────
   *
   * The first run of this section reported all three populations as if their masks were
   * silhouettes. Two of them are not, and the gate below is what says so instead of me:
   *
   *   ring   56.6% of the frame, one blob spanning x 0..1279 and every row from 214 to the
   *          bottom edge. `dive_ring` draws into an ADDITIVE, PLANAR batch and stages at a
   *          sprite size of ~4.03 m — `mix(0.4, 5, u^0.36)` at `u = 0.088/0.34`, times
   *          `scale 1.25` — against the 1.5 m radius `_stageImpact` reports as "the ring's own
   *          reach". So the mask is the flat additive QUAD and its glow, not the visible
   *          annulus, and its boundary is nowhere near the rim. The rim has a GEOMETRIC locus
   *          (`discOf`, above) and that is the one that answers for this population.
   *   spark  875 px in 22 fragments, biggest 377, scattered across the upper left — the
   *          braziers. `dive_spark` is 14-18 of the batch's 259 live instances and is not
   *          separable from them by any lever here.
   *
   * The gate is derived from what a silhouette IS: a compact region whose boundary is one
   * closed curve. A mask covering a quarter of the frame is not compact, and one whose largest
   * component holds under 80% of its area is not one curve — it is a scatter, and the boundary
   * of a scatter is a sum of unrelated little boundaries. Neither bound was chosen to admit or
   * reject any particular row; both are properties of the word.
   */
  const FRAME_FRAC_MAX = 0.25, DOMINANCE_MIN = 0.8;
  function components(mask) {
    const seen = new Uint8Array(W * H); let n = 0, biggest = 0; const st = [];
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || seen[i]) continue;
      n++; st.length = 0; st.push(i); seen[i] = 1; let sz = 0;
      while (st.length) {
        const q = st.pop(), x = q % W, y = (q / W) | 0; sz++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!inFrame(nx, ny)) continue;
          const r = idx(nx, ny);
          if (mask[r] && !seen[r]) { seen[r] = 1; st.push(r); }
        }
      }
      if (sz > biggest) biggest = sz;
    }
    return { n, biggest };
  }

  console.log('\n  crease-ink peak (median L) on each population\'s own silhouette, by where the');
  console.log('  mask is cut — samples touching the hero are excluded exactly as the rim\'s are');
  console.log('   population                          cut  area%  comps  dom%  locus  clear  creaseL  allinkL   fxL');
  const popRows = [];
  const popAdmitted = new Map();
  for (const p of POPS) {
    for (const cut of [0.5, 4, 12, 24]) {
      const m = new Uint8Array(W * H);
      let n = 0;
      for (let i = 0; i < W * H; i++) if (delta(IM['A-ship'], IM[p.tag], i) > cut) { m[i] = 1; n++; }
      if (!n) { console.log(`   ${p.label.padEnd(34)} ${String(cut).padEnd(4)} EMPTY MASK — population drew nothing`); continue; }
      const cc = components(m);
      const frac = n / (W * H), dom = cc.biggest / n;
      const ok = frac <= FRAME_FRAC_MAX && dom >= DOMINANCE_MIN;
      if (ok) popAdmitted.set(p.label, true);
      const shape = `${(100 * frac).toFixed(1).padStart(5)} ${String(cc.n).padStart(5)} ${(100 * dom).toFixed(0).padStart(5)}`;
      if (!ok) {
        console.log(`   ${p.label.padEnd(34)} ${String(cut).padEnd(4)} ${shape}   NOT A SILHOUETTE — locus refused`);
        continue;
      }
      const locus = boundaryOf(m);
      const clear = locus.filter(([x, y]) => !touchesHero(x + 0.5, y + 0.5, R0 + 1)).map(([x, y]) => [x + 0.5, y + 0.5]);
      if (!clear.length) { console.log(`   ${p.label.padEnd(34)} ${String(cut).padEnd(4)} ${shape}   entirely behind the hero`); continue; }
      const c = peaks(clear, creaseAmt, R0), ink = peaks(clear, inkAmt, R0), fxp = peaks(clear, fxAmt, R0);
      popRows.push({ pop: p.label, cut, n, locus: locus.length, clear: clear.length, c, ink, fxp });
      console.log(`   ${p.label.padEnd(34)} ${String(cut).padEnd(4)} ${shape} ${String(locus.length).padStart(6)} ${String(clear.length).padStart(6)} `
        + `${quant(c, 0.5).toFixed(2).padStart(8)} ${quant(ink, 0.5).toFixed(2).padStart(8)} ${quant(fxp, 0.5).toFixed(2).padStart(6)}`);
    }
  }

  /* Same bars as the rim, applied population by population — but only to the populations whose
     mask is a silhouette at all. A refused locus is not a null result and is not reported as
     one: it is a population this frame cannot answer for. */
  console.log(`\n  against the same controls: floor median ${med(main.floorC).toFixed(2)} L (p90 ${BAR.toFixed(2)}), hero ${med(main.heroC).toFixed(2)} L`);
  const answered = [], held = [];
  for (const p of POPS) {
    const rows2 = popRows.filter((r) => r.pop === p.label);
    if (!rows2.length) {
      held.push(p.label);
      console.log(`   ${p.label.padEnd(34)} NO USABLE SILHOUETTE at any cut — HELD, not answered`);
      continue;
    }
    const worst = Math.max(...rows2.map((r) => quant(r.c, 0.5)));
    const loud = Math.max(...rows2.map((r) => quant(r.fxp, 0.5)));
    const quiet = worst <= VERDICT_BAR;
    answered.push({ label: p.label, quiet, worst });
    console.log(`   ${p.label.padEnd(34)} worst-cut crease ${worst.toFixed(3)} L · FX loudness ${loud.toFixed(1)} L · `
      + `${quiet ? 'NO INK at any cut' : 'CARRIES INK'}`);
  }
  const allQuiet = answered.length > 0 && answered.every((a) => a.quiet);
  console.log('');
  if (answered.length) {
    /* Counted in SPRITES, not populations: the `dust` batch carries two of the four emitters
       `_stageImpact` stages, so answering it answers two. Getting this wrong would understate
       the coverage, which is the direction that reads as modesty and is still an error. */
    const SPRITES_PER_POP = { 'dust': 2, 'ring': 1, 'spark': 1 };
    const spritesAnswered = answered.reduce((a, r) => a + (SPRITES_PER_POP[r.label.split(' ')[0]] ?? 1), 0) + 1;
    console.log(allQuiet
      ? `  Every population this frame CAN answer for carries no crease ink on its own\n`
        + `  silhouette, at any cut of the mask that defines it: ${answered.map((a) => a.label.split(' ')[0]).join(', ')}.\n`
        + `  With the ring's geometric rim (0.00 L, above) that is ${spritesAnswered} of the 4 sprites\n`
        + `  \`_stageImpact\` stages — the ring by geometry, the dust and the debris by mask.`
      : `  At least one population DOES carry crease ink — see the rows above. §379.1 is not general.`);
  }
  if (held.length) {
    console.log(`\n  HELD, and the reason is the instrument rather than the frame:\n   ${held.join('\n   ')}\n`
      + `  A refused locus is not evidence of absence. The ring is answered anyway, by the\n`
      + '  GEOMETRIC rim above — a locus `_stageImpact` supplies and no diff is needed for.\n'
      + `  Nothing supplies one for \`dive_spark\`, and it is 14-18 of its batch's 259 live\n`
      + `  instances, so this frame cannot separate it from the braziers at all.`);
  }
}

/* ── §colour: what the ink actually measures as, reported not used ──────────────────────── */

const fam = (m, name) => {
  const R = [], G = [], B = [], L = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i / W) | 0;
    const [r, g, b] = px(IM['A-ship'], x, y);
    R.push(r); G.push(g); B.push(b); L.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  if (!L.length) return null;
  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  const warm = R.filter((_, i) => R[i] > B[i]).length / R.length;
  const nearBlack = L.filter((v) => v <= 40).length / L.length;
  console.log(`  ${name.padEnd(22)} median rgb (${med(R)}, ${med(G)}, ${med(B)})  luma ${med(L).toFixed(1)}/255  `
    + `warm(R>B) ${(100 * warm).toFixed(0)}%  luma≤40 ${(100 * nearBlack).toFixed(0)}%`);
  return { medL: med(L), nearBlack };
};
console.log(`\n§colour — what §2.1.2's two ink families actually measure as in the graded frame`);
console.log(`  (#1a1210 is rgb(26,18,16) as authored; #161022 is rgb(22,16,34))`);
console.log('  every pixel the pass TOUCHES, which is mostly sub-level leakage on bright sand:');
fam(creaseMask, 'crease ink A−B');
fam(hullMask, 'hull ink B−C');
fam(inkMask, 'all ink A−C');
/* The line itself, not its halo. A Δ>0 mask is 15% of this frame and its median colour is the
   SAND's, because the crease pass darkens texture everywhere by a fraction of a level. The
   pixels a viewer would call the line are the ones it actually darkens, and 32 L is a quarter
   of the ink's own median depth here rather than a level anybody chose. This is the row that
   answers "would a near-black detector have found the ink" — and the answer decides nothing
   above, because the verdict never used one. */
const strong = (field, t) => {
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (field[i] >= t) m[i] = 1;
  return m;
};
console.log('  the LINE — pixels the pass darkens by ≥32 L:');
fam(strong(creaseAmt, 32), 'crease line');
fam(strong(inkAmt, 32), 'all-ink line');
console.log(`  A near-black threshold applied to these would be a DIFFERENT measurement from the`);
console.log(`  one above; the verdict does not use it. §270 is why.`);

/**
 * skynoise-diag.mjs — offline diagnosis of CRITIC-sbs1 gap #1: the marbled sky noise.
 *
 * OWNER: SKY. Boots nothing, takes no lock, reads committed PNGs + committed source only.
 *
 *   node progress/records/skynoise-diag.mjs [frames|grain|project|sim|all]      (default: all)
 *   node progress/records/skynoise-diag.mjs sim --png     also writes sim crops to the scratchpad
 *   node progress/records/skynoise-diag.mjs swirl [--png]      residual-class ablation (amendment)
 *   node progress/records/skynoise-diag.mjs sweep              elevation-term value sweep
 *   node progress/records/skynoise-diag.mjs swirlcrops         tall sim renders for eyeballing
 *   node progress/records/skynoise-diag.mjs swirlscore <dir>   score a skyswirl1 capture
 *
 * WHAT IT ANSWERS
 *   1. `frames`  — reproduces CRITIC-sbs1's hf metric on the committed frames
 *                  (progress/records/cand1/frames/*.base.png, progress/records/gold1/traversal.png)
 *                  plus cell-size (ACF) and structure numbers per registered rect.
 *   2. `grain`   — the hf FLOOR contributed by PostFX's registered 1-px dither
 *                  (PostFX.js `grain: 0.016`, composite `c += (slyIGN(px)-0.5)*uGrain`),
 *                  computed exactly from the shipped IGN formula. No Sky.js change can land
 *                  a sky hf below this floor; a post-fix band must sit above it.
 *   3. `project` — the source-side localisation: for each shot camera (src/core/Shots.js) and
 *                  each cloud deck (src/render/Sky.js TUNE.decks), the screen-space period of
 *                  every noise term the deck shader samples, in px, at the registered rect rows.
 *                  This is the arithmetic that names WHICH terms produce the ~15-25 px cells.
 *   4. `sim`     — a CPU re-render of the sky rects through the real cameras using verbatim
 *                  ports of Sky.js's noise/texture/deck code and the PostFX grade chain, with
 *                  per-term ablation (no decks / one deck at a time / warp off / flat arm /
 *                  candidate parameters), so the hf attribution and the candidate's predicted
 *                  numbers are MEASURED offline, not inferred. `--png` writes crops to the
 *                  scratchpad (never committed) for eyeballing.
 *
 * METRIC DEFINITIONS (KNOWN_ISSUES §122.1: state the basis with every number)
 *   luma      Rec.709 on 0-255: 0.2126R + 0.7152G + 0.0722B (same basis as sbs1-measure.py).
 *   hf        directional mean absolute gradients over in-rect, non-masked pairs:
 *               hf_x = mean|L(x+1,y)-L(x,y)|,  hf_y = mean|L(x,y+1)-L(x,y)|
 *             HEADLINE hf = hf_x + hf_y. CRITIC-sbs1 did not publish its code (scratchpad,
 *             lost), but this sum reproduces their numbers on the committed siblings of their
 *             frames to 0.2%-2% (dunes rect: ours 5.29 vs their 5.28; courtyard: 7.91 vs
 *             7.76), where the mean of the two directions misses by 2x. The sum is therefore
 *             taken as CRITIC's convention and is the registered metric. hf_x/hf_y also printed.
 *   sd        population standard deviation of in-rect non-masked luma.
 *   acf       pooled Pearson autocorrelation of luma at integer lags. For the x axis each ROW's
 *             mean is removed first; for the y axis each COLUMN's mean (otherwise the
 *             zenith-horizon ramp dominates every lag). True bounded NCC per lag — NOT §144's
 *             inflated estimator in acf.mjs (whose own header says not to start new work on it).
 *             Reported: first zero-crossing z0 (≈ cell radius), first-minimum lag (≈ half
 *             period), first secondary-maximum lag (≈ full period).
 *   PD9       flat-poster detector: fit a plane a+bx+cy to unmasked luma (kills both sky
 *             gradients), box-9 blur the residual (kills 1-px dither), sd of the blurred
 *             residual. A cloudless gradient sky scores ~0; any cloud field scores well above.
 *             This is the metric the over-corrected calibration arm must FAIL on.
 *   floor16   minimum tile-hf (sum convention) over 16x16 tiles >=90% unmasked: the empirical
 *             composite floor (grain + FXAA + gradient) in the flattest available sky patch.
 *   MASK      pixels darker than a per-shot threshold (day 60, night 22 — night sky itself
 *             sits at L 30-60) are masked, dilated 2 px, before any stat: wires, ropes, birds,
 *             silhouetted geometry. Masked share prints with every rect; >15% is flagged.
 *             The dunes pyramid is PALE (haze-bright), not dark — excluded by rect placement,
 *             not by mask, which is why dunes carries a geometry-free `clean` rect.
 *
 * PROVENANCE
 *   cand1/frames/*.base.png are the fx22 run's base arms (base = shipped tree at capture
 *   time); gold1/traversal.png is the goldtraversal run's frame, newer. These are NOT the
 *   frames CRITIC-sbs1 measured (2026-08-01, shots/, lost to rollback); CRITIC's hf
 *   7.76/5.28/7.51 are quoted for correspondence and this instrument's numbers on the
 *   committed frames are the operative baseline.
 *
 * SIM FIDELITY, stated up front
 *   The sim reproduces: dome gradient, Rayleigh/violet/hot-band/Mie, night sky (stars, Milky
 *   Way, moon), all three cloud decks with domain warp, trilinear+4x-aniso mip sampling of the
 *   CPU-built noise texture (bit-identical build: same hash2/fbm/worley code and seeds), the
 *   PostFX grade chain (exposure/lift/gain/split/saturation/contrast/AgX/sRGB) and the IGN
 *   dither. It does NOT reproduce: bloom (threshold 2.20 — sky band far from the sun disc is
 *   well below), vignette (smooth, excluded), FXAA (attenuates hf in frames by a factor the
 *   full-vs-frame comparison measures), FX particles/birds over sky, or the unknown capture
 *   uTime (drift translates the pattern; every metric here is translation-invariant).
 *   Sim numbers are therefore compared to frames as STATISTICS, and the per-shot sim/frame
 *   ratio on the CURRENT tree is the calibration every candidate prediction must quote.
 *
 * DRIFT GUARD (§143.1: a guard must check the mechanism)
 *   Every Sky.js / PostFX.js constant the ports below embed is parsed OUT of the committed
 *   source at runtime and asserted. If someone retunes TUNE.decks or the grade, this
 *   instrument refuses to run rather than print numbers about a tree that no longer exists.
 *
 * ── AMENDMENT 2026-08-05 (SKY successor, skyswirl seal) — recorded change, not a fork ──
 *   The skynoise candidate SHIPPED: Sky.js TUNE.decks now carries scale 0.000105/0.000138/
 *   0.000105 and soft 0.36/0.38/0.40 (RESULT-skynoise.md §17; CRITIC-sbs2 frames confirm).
 *   The deck parse was always generic, so the guard passes on the shipped tree with NO
 *   pattern change — `C.decks` now MEANS the shipped values, and the file-local CANDIDATE
 *   table below is the shipped tree restated (kept so `sim`/`cand` history reruns).
 *   What this amendment adds, for CRITIC-sbs2's residual finding (dunes worst band hf 8.05
 *   unmasked = 14.6x ref; night "liquid swirl" at 1:1; courtyard clean at 4.00):
 *     1. FRAMES entries for the committed sbs2 shipped-tree frames at CRITIC-sbs2's rects
 *        (their hf numbers are UNMASKED — reproduced here both unmasked for correspondence
 *        and masked/clean-subrect to split geometry ink out of the sky number).
 *     2. `swirl` mode — the successor per-term ablation at the SHIPPED values on the
 *        residual rects: deck solos, warp arms (incl. the pre-named deck2 1.25→0.7),
 *        streak arms, drift/seam arms (uTime + border-feathered texture), and the
 *        graze-fade candidate term (sim-only shader-term probe, marked as such).
 *     3. `swirlscore` mode — scores a landed skyswirl capture against PREREG-skyswirl.md.
 *   Baselines from the skynoise seal (cand1/gold1 FRAMES rows, SEAL table, runScore) are
 *   left byte-identical: they score the PREDECESSOR's capture and still reproduce.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { readPNG } from '../../tools/png.mjs';
import { SHOTS } from '../../src/core/Shots.js';
import { evalAtmosphere, createAtmosphereState } from '../../src/render/Atmosphere.js';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const REC = `${ROOT}/progress/records`;
const SCRATCH = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad';
const W = 1280, H = 720;

/* ────────────────────────── registered rects ──────────────────────────
 * (x0,y0,x1,y1) on 1280x720. `critic` rects are CRITIC-sbs1's verbatim; `clean` rects are
 * this instrument's, placed off geometry and verified by crop (scratchpad court/dunes/night/
 * hero crops, 2026-08-05): dunes pyramid ~x237-280 y80-120 → clean x>=320; night pole
 * x 780-880 and moon x 330-460 → nightA right marble field, nightB above-wire patch;
 * hero open-sky wedge between pylon (x<340) and east wall (x>700). */
const FRAMES = [
  { shot: 'courtyard', file: `${REC}/cand1/frames/courtyard.base.png`, thresh: 60,
    rects: { critic: [620, 10, 1200, 110], clean: [640, 12, 1150, 95] },
    criticHf: 7.76, criticNote: 'CRITIC luma sd 16.1, hf 7.76 (their lost 08-01 frame); ref day sky 1.33' },
  { shot: 'dunes', file: `${REC}/cand1/frames/dunes.base.png`, thresh: 60,
    rects: { critic: [100, 10, 280, 120], clean: [320, 12, 1000, 85] },
    criticHf: 5.28, criticNote: 'CRITIC marbled zone 5.28, full band 6.82; ref 0.38' },
  { shot: 'night', file: `${REC}/cand1/frames/night.base.png`, thresh: 22,
    rects: { cleanA: [900, 8, 1270, 112], cleanB: [450, 6, 760, 55] },
    criticHf: 7.51, criticNote: 'CRITIC quotes 7.51 with no stated rect; ref night sky 0.36' },
  { shot: 'hero', file: `${REC}/cand1/frames/hero.base.png`, thresh: 60,
    rects: { clean: [340, 2, 700, 50] },
    criticHf: null, criticNote: 'no CRITIC hf; regression-watch rect (warm haze wedge)' },
  { shot: 'traversal', file: `${REC}/gold1/traversal.png`, thresh: 60,
    rects: { clean: [80, 5, 700, 55] },
    criticHf: null, criticNote: 'newest committed frame (gold1); persistence check' },
  /* ── AMENDMENT 2026-08-05 (skyswirl): shipped-tree sbs2 frames, CRITIC-sbs2 rects. ──
   * CRITIC-sbs2's hf numbers are UNMASKED (thresh:null reproduces 8.05 / 4.98 / 4.00 to
   * the digit); the extra rects split geometry ink out of the sky number by PLACEMENT,
   * because on the night staging the architecture silhouette (p50 L≈11.6) and the deep
   * swirl sky (p25 L≈11.3) OVERLAP in luma — no threshold separates them (verified on
   * boosted crops: obelisk x≈785-880 full height, roof x≈880-1050 y≈100-230, rings
   * y≤60, all invisible at 1x against the night sky). */
  { shot: 'courtyard-sbs2', file: `${REC}/sbs2/courtyard.png`, thresh: null,
    rects: { critic2: [850, 0, 1150, 55] },
    criticHf: 4.00, criticNote: 'CRITIC-sbs2 clean sky 4.00 vs ref 1.22 — shipped decks, the now-clean day control (geometry-free: 0% under L60)' },
  { shot: 'dunes-sbs2', file: `${REC}/sbs2/dunes.png`, thresh: null,
    rects: { critic2: [760, 0, 1120, 45], clean: [920, 0, 1115, 45], top: [0, 0, 1280, 50] },
    criticHf: 8.05, criticNote: 'CRITIC-sbs2 worst band 8.05 UNMASKED — includes the pylon-top ink corner (x≈760-905, masked-at-60 variant reads 5.48) and birds; `clean` (0% under L60) is the sky-only residual; `top` includes the pale pyramid (correspondence only)' },
  { shot: 'night-sbs2', file: `${REC}/sbs2/night.png`, thresh: null,
    rects: { critic2: [750, 0, 1250, 220], cleanR: [1150, 90, 1275, 205] },
    criticHf: 4.98, criticNote: 'CRITIC-sbs2 swirl band 4.98 UNMASKED — contains obelisk/roof/rings (see amendment note); cleanR is open swirl sky by placement (FX petals remain in it, stated: pale motes L≈30-90, unmodelled by the sim)' },
];

const luma709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function lumaGrid(im, [x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0;
  const L = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y + y0) * im.w + (x + x0)) * im.ch;
    L[y * w + x] = luma709(im.data[i], im.data[i + 1], im.data[i + 2]);
  }
  return { L, w, h };
}

function darkMask({ L, w, h }, thresh, dil = 2) {
  const m0 = new Uint8Array(w * h);
  if (thresh == null) return m0;   // amendment: thresh null = unmasked (CRITIC-sbs2 convention)
  for (let i = 0; i < w * h; i++) m0[i] = L[i] < thresh ? 1 : 0;
  if (!dil) return m0;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let dy = -dil; dy <= dil && !v; dy++) for (let dx = -dil; dx <= dil; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w && m0[yy * w + xx]) { v = 1; break; }
    }
    m[y * w + x] = v;
  }
  return m;
}

function stats(grid, mask) {
  const { L, w, h } = grid;
  let n = 0, s = 0, s2 = 0, nx = 0, sx = 0, ny = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i]) continue;
    n++; s += L[i]; s2 += L[i] * L[i];
    if (x + 1 < w && !mask[i + 1]) { nx++; sx += Math.abs(L[i + 1] - L[i]); }
    if (y + 1 < h && !mask[i + w]) { ny++; sy += Math.abs(L[i + w] - L[i]); }
  }
  const mean = s / Math.max(1, n);
  const sd = Math.sqrt(Math.max(0, s2 / Math.max(1, n) - mean * mean));
  const hfx = sx / Math.max(1, nx), hfy = sy / Math.max(1, ny);
  return { n, maskedPct: 100 * (1 - n / (w * h)), mean, sd, hfx, hfy, hf: hfx + hfy };
}

function rowProfile(grid, mask, bands = 4) {
  const out = [];
  for (let b = 0; b < bands; b++) {
    const y0 = Math.floor((b * grid.h) / bands), y1 = Math.floor(((b + 1) * grid.h) / bands);
    const sub = { L: grid.L.subarray(y0 * grid.w, y1 * grid.w), w: grid.w, h: y1 - y0 };
    out.push(stats(sub, mask.subarray(y0 * grid.w, y1 * grid.w)).hf);
  }
  return out;
}

/** Pooled Pearson ACF; per-row mean removed for axis x, per-column mean for axis y. */
function acf(grid, mask, axis, maxLag = 80) {
  const { L, w, h } = grid;
  const R = new Float64Array(w * h);
  if (axis === 'x') {
    for (let y = 0; y < h; y++) {
      let s = 0, n = 0;
      for (let x = 0; x < w; x++) { const i = y * w + x; if (!mask[i]) { s += L[i]; n++; } }
      const m = s / Math.max(1, n);
      for (let x = 0; x < w; x++) { const i = y * w + x; R[i] = L[i] - m; }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let y = 0; y < h; y++) { const i = y * w + x; if (!mask[i]) { s += L[i]; n++; } }
      const m = s / Math.max(1, n);
      for (let y = 0; y < h; y++) { const i = y * w + x; R[i] = L[i] - m; }
    }
  }
  const rs = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    let sab = 0, saa = 0, sbb = 0, k = 0;
    const step = axis === 'x' ? 1 : w;
    const xmax = axis === 'x' ? w - lag : w, ymax = axis === 'x' ? h : h - lag;
    for (let y = 0; y < ymax; y++) for (let x = 0; x < xmax; x++) {
      const i = y * w + x, j = i + lag * step;
      if (mask[i] || mask[j]) continue;
      sab += R[i] * R[j]; saa += R[i] * R[i]; sbb += R[j] * R[j]; k++;
    }
    rs.push(k > 50 ? sab / Math.sqrt(Math.max(1e-9, saa * sbb)) : NaN);
  }
  let z0 = null, minLag = null, minV = 1, secPeak = null, secV = -2;
  for (let i = 0; i < rs.length; i++) {
    if (z0 === null && rs[i] <= 0) z0 = i + 1;
    if (z0 !== null && rs[i] < minV) { minV = rs[i]; minLag = i + 1; }
  }
  if (minLag !== null) for (let i = minLag; i < rs.length - 1; i++) if (rs[i] > secV) { secV = rs[i]; secPeak = i + 1; }
  return { z0, minLag, minV, secPeak, secV };
}

/** PD9 flat-poster detector + PDsd (unblurred plane residual sd). */
function pd9(grid, mask) {
  const { L, w, h } = grid;
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (mask[i]) continue;
    n++; sx += x; sy += y; sz += L[i]; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * L[i]; syz += y * L[i];
  }
  // solve [n sx sy; sx sxx sxy; sy sxy syy] [a b c]^T = [sz sxz syz]
  const A = [[n, sx, sy, sz], [sx, sxx, sxy, sxz], [sy, sxy, syy, syz]];
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c || Math.abs(A[c][c]) < 1e-12) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  const a = A[0][3] / A[0][0], b = A[1][3] / A[1][1], c3 = A[2][3] / A[2][2];
  const Rz = new Float64Array(w * h);
  let rs = 0, rs2 = 0, rn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    Rz[i] = mask[i] ? 0 : L[i] - (a + b * x + c3 * y);
    if (!mask[i]) { rn++; rs += Rz[i]; rs2 += Rz[i] * Rz[i]; }
  }
  const pdsd = Math.sqrt(Math.max(0, rs2 / Math.max(1, rn) - (rs / Math.max(1, rn)) ** 2));
  // box-9 blur via integral image
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    I[(y + 1) * (w + 1) + x + 1] = Rz[y * w + x] + I[y * (w + 1) + x + 1] + I[(y + 1) * (w + 1) + x] - I[y * (w + 1) + x];
  }
  const rad = 4, side = 2 * rad + 1;
  let bn = 0, bs = 0, bs2 = 0;
  for (let y = rad; y < h - rad; y++) for (let x = rad; x < w - rad; x++) {
    const x0 = x - rad, y0 = y - rad, x1 = x + rad + 1, y1 = y + rad + 1;
    const v = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / (side * side);
    bn++; bs += v; bs2 += v * v;
  }
  const m = bs / Math.max(1, bn);
  return { pd9: Math.sqrt(Math.max(0, bs2 / Math.max(1, bn) - m * m)), pdsd };
}

function floor16(grid, mask) {
  const { w, h } = grid;
  let best = Infinity, at = [-1, -1];
  for (let y0 = 0; y0 + 16 <= h; y0 += 8) for (let x0 = 0; x0 + 16 <= w; x0 += 8) {
    const sub = { L: new Float64Array(256), w: 16, h: 16 };
    const ms = new Uint8Array(256);
    let masked = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (y0 + y) * w + (x0 + x);
      sub.L[y * 16 + x] = grid.L[i]; ms[y * 16 + x] = mask[i]; masked += mask[i];
    }
    if (masked > 25) continue;
    const st = stats(sub, ms);
    if (st.hf < best) { best = st.hf; at = [x0, y0]; }
  }
  return { hf: best === Infinity ? null : best, at };
}

/* ────────────────────────── drift guard ────────────────────────── */

function must(re, src, what, file) {
  const m = src.match(re);
  if (!m) throw new Error(`drift guard: cannot find ${what} in ${file} — source moved; re-verify this instrument before trusting any number it prints`);
  return m;
}

function loadSourceConstants() {
  const skySrc = readFileSync(`${ROOT}/src/render/Sky.js`, 'utf8');
  const pfxSrc = readFileSync(`${ROOT}/src/render/PostFX.js`, 'utf8');
  const deckRe = /\{ h:\s*([\d.]+),\s*scale:\s*([\d.]+),\s*drift:\s*([\d.]+),\s*soft:\s*([\d.]+),\s*opacity:\s*([\d.]+),\s*warp:\s*([\d.]+),\s*streak:\s*([\d.]+)\s*\}/g;
  const decks = [];
  let dm;
  while ((dm = deckRe.exec(skySrc))) decks.push({ h: +dm[1], scale: +dm[2], drift: +dm[3], soft: +dm[4], opacity: +dm[5], warp: +dm[6], streak: +dm[7] });
  if (decks.length !== 3) throw new Error(`drift guard: expected 3 decks in Sky.js TUNE, found ${decks.length}`);
  const seed = +must(/const WORLD_SEED = (\d+);/, skySrc, 'WORLD_SEED', 'Sky.js')[1];
  const noiseSize = +must(/noiseSize:\s*(\d+)/, skySrc, 'noiseSize', 'Sky.js')[1];
  const texBase = +must(/const fx = u \* (\d+), fy = v \* \d+;/, skySrc, 'texture base frequency', 'Sky.js')[1];
  must(/float n2 = texture2D\(uNoise, a \* 2\.31/, skySrc, 'n2 scale 2.31', 'Sky.js');
  must(/float n3 = texture2D\(uNoise, a \* 5\.7/, skySrc, 'n3 scale 5.7', 'Sky.js');
  must(/float puff = texture2D\(uNoise, a \* 1\.7/, skySrc, 'puff scale 1.7', 'Sky.js');
  must(/uv \* 0\.31\)\.r/, skySrc, 'warp scale 0.31', 'Sky.js');
  must(/raw = n1 \* 0\.58 \+ n2 \* 0\.30 \+ n3 \* 0\.16 \+ puff \* 0\.20/, skySrc, 'raw weights', 'Sky.js');
  must(/cloudLightStep:\s*0\.030/, skySrc, 'cloudLightStep 0.030', 'Sky.js');
  must(/cloudBands:\s*3/, skySrc, 'cloudBands 3', 'Sky.js');
  must(/cloudRimPower:\s*3\.2/, skySrc, 'cloudRimPower 3.2', 'Sky.js');
  must(/cloudHazeBlend:\s*0\.42/, skySrc, 'cloudHazeBlend 0.42', 'Sky.js');
  must(/horizonBandLift:\s*0\.085/, skySrc, 'horizonBandLift 0.085', 'Sky.js');
  must(/starDensity:\s*165\.0/, skySrc, 'starDensity 165', 'Sky.js');
  must(/milkyWidth:\s*0\.30/, skySrc, 'milkyWidth 0.30', 'Sky.js');
  const grain = +must(/grain:\s*([\d.]+)/, pfxSrc, 'tune.grain', 'PostFX.js')[1];
  const exposure = +must(/^  exposure:\s*([\d.]+)/m, pfxSrc, 'tune.exposure', 'PostFX.js')[1];
  const contrast = +must(/^  contrast:\s*([\d.]+)/m, pfxSrc, 'tune.contrast', 'PostFX.js')[1];
  const saturation = +must(/^  saturation:\s*([\d.]+)/m, pfxSrc, 'tune.saturation', 'PostFX.js')[1];
  const splitStrength = +must(/splitStrength:\s*([\d.]+)/, pfxSrc, 'tune.splitStrength', 'PostFX.js')[1];
  const gainM = must(/^  gain:\s*\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/m, pfxSrc, 'tune.gain', 'PostFX.js');
  const liftM = must(/lift:\s*\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/, pfxSrc, 'tune.lift', 'PostFX.js');
  const srM = must(/splitRange:\s*\[([\d.]+),\s*([\d.]+)\]/, pfxSrc, 'tune.splitRange', 'PostFX.js');
  const toneShoulder = +must(/toneShoulder:\s*([\d.]+)/, pfxSrc, 'tune.toneShoulder', 'PostFX.js')[1];
  return {
    decks, seed, noiseSize, texBase,
    pfx: { grain, exposure, contrast, saturation, splitStrength,
      gain: [+gainM[1], +gainM[2], +gainM[3]], lift: [+liftM[1], +liftM[2], +liftM[3]],
      splitRange: [+srM[1], +srM[2]], toneShoulder,
      splitShadow: 0x2a3f66, splitHighlight: 0xffd9a0 },
  };
}

/* ────────────────────────── cameras ────────────────────────── */

function shotCamera(name) {
  const s = SHOTS[name];
  const cam = new THREE.PerspectiveCamera(s.fov ?? 50, W / H, 0.1, 4000);
  cam.position.fromArray(s.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3().fromArray(s.target));
  if (s.roll) cam.rotateZ(THREE.MathUtils.degToRad(s.roll));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function rayAt(cam, px, py, out = new THREE.Vector3()) {
  const ndcX = ((px + 0.5) / W) * 2 - 1;
  const ndcY = 1 - ((py + 0.5) / H) * 2;
  return out.set(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
}

/* ────────────────────────── section: frames ────────────────────────── */

function runFrames() {
  console.log('\n══ FRAMES — committed PNGs, registered rects ══');
  console.log('   headline hf = hf_x + hf_y (CRITIC-sbs1 convention, recovered: see header)\n');
  const out = {};
  for (const F of FRAMES) {
    let im;
    try { im = readPNG(F.file); } catch { console.log(`  ${F.shot}: MISSING ${F.file}`); continue; }
    out[F.shot] = {};
    for (const [rname, rect] of Object.entries(F.rects)) {
      const grid = lumaGrid(im, rect);
      const mask = darkMask(grid, F.thresh);
      const st = stats(grid, mask);
      const prof = rowProfile(grid, mask, 4);
      const ax = acf(grid, mask, 'x'), ay = acf(grid, mask, 'y');
      const pd = pd9(grid, mask);
      const fl = floor16(grid, mask);
      out[F.shot][rname] = { rect, ...st, prof, acfX: ax, acfY: ay, ...pd, floor16: fl };
      const flag = st.maskedPct > 15 ? '  [!] >15% masked' : '';
      console.log(`  ${F.shot}.${rname} ${JSON.stringify(rect)} mask<${F.thresh}${flag}`);
      console.log(`    n ${st.n} (masked ${st.maskedPct.toFixed(1)}%)  meanL ${st.mean.toFixed(1)}  sd ${st.sd.toFixed(2)}`);
      console.log(`    hf ${st.hf.toFixed(2)}  (hf_x ${st.hfx.toFixed(2)} + hf_y ${st.hfy.toFixed(2)})` +
        (F.criticHf ? (F.shot.includes('-sbs2')
          ? `   [CRITIC-sbs2, committed frame, their headline rect: ${F.criticHf}]`
          : `   [CRITIC, their lost frame: ${F.criticHf}]`) : ''));
    console.log(`    hf by row quarter (top→bottom): ${prof.map((v) => v.toFixed(2)).join('  ')}`);
      console.log(`    acf x(row-detrended): zero@${ax.z0} min@${ax.minLag}(${ax.minV?.toFixed(2)}) peak2@${ax.secPeak}(${ax.secV?.toFixed(2)})`);
      console.log(`    acf y(col-detrended): zero@${ay.z0} min@${ay.minLag}(${ay.minV?.toFixed(2)}) peak2@${ay.secPeak}(${ay.secV?.toFixed(2)})`);
      console.log(`    PD9 ${pd.pd9.toFixed(2)} (PDsd ${pd.pdsd.toFixed(2)})   floor16 hf ${fl.hf?.toFixed(2)} @ +${fl.at}`);
    }
    console.log(`    note: ${F.criticNote}\n`);
  }
  return out;
}

/* ────────────────────────── section: grain floor ────────────────────────── */

const ign = (x, y) => {
  const fr = (v) => v - Math.floor(v);
  return fr(52.9829189 * fr((x + 0.5) * 0.06711056 + (y + 0.5) * 0.00583715));
};

function runGrain(C) {
  const g = C.pfx.grain;
  let sx = 0, sy = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    sx += Math.abs(ign(x + 1, y) - ign(x, y));
    sy += Math.abs(ign(x, y + 1) - ign(x, y));
  }
  const dIx = sx / 65536, dIy = sy / 65536;
  const hfX = 255 * g * dIx, hfY = 255 * g * dIy;
  console.log('\n══ GRAIN FLOOR — PostFX display-space dither, exact (no capture) ══');
  console.log(`  slyIGN adjacent-px mean|Δ|: x ${dIx.toFixed(4)}  y ${dIy.toFixed(4)}`);
  console.log(`  at tune.grain ${g}: hf floor (sum convention) = ${(hfX + hfY).toFixed(2)} luma/px (x ${hfX.toFixed(2)} + y ${hfY.toFixed(2)})`);
  console.log('  CAVEAT: FXAA runs after the dither and attenuates it; frame floor16 in');
  console.log('  cloud-free tiles is the operative floor. No Sky.js change can go below it.');
  return { dIx, dIy, hfSum: hfX + hfY };
}

/* ────────────────────────── section: project ────────────────────────── */

const PROJ_ROWS = { courtyard: [15, 60, 105], dunes: [15, 60, 115], night: [15, 55, 95], hero: [10, 25, 45], traversal: [10, 30, 55] };
const PROJ_COLS = { courtyard: 910, dunes: 190, night: 1080, hero: 520, traversal: 400 };

function runProject(C) {
  console.log('\n══ PROJECT — screen-space period of every Sky.js noise term, per shot ══');
  console.log('  Mechanism (src/render/Sky.js cloudDeck, L277-323): t = H/d.y; uv = d.xz*t*scale;');
  console.log('  n1=G@(uv.x/streak,uv.y)  n2=R@2.31a  n3=B@5.7a  puff=A@1.7a;');
  console.log('  domain warp (L290-291): uv += (tex@0.31uv − .5)·warp·0.9 → ±0.45·warp repeats.');
  console.log(`  Texture (L159-195): ${C.noiseSize}px, base frequency ${C.texBase} cycles/repeat (L166 fx=u*6)`);
  console.log('  → largest feature the texture CONTAINS is 1/6 repeat; screen period of that');
  console.log('  fundamental P6 = 1/(6·|duv/dpx|); visible half-period cell ≈ P6/2.\n');
  for (const shot of Object.keys(PROJ_ROWS)) {
    const cam = shotCamera(shot);
    const s = SHOTS[shot];
    const A = evalAtmosphere(s.tod, createAtmosphereState());
    console.log(`  ${shot} (fov ${s.fov}, tod ${s.tod}): sunEl ${A.sunElevation.toFixed(1)}°  day ${A.dayAmount.toFixed(2)} night ${A.nightAmount.toFixed(2)}  cover [${A.cloudCover.toArray().map((v) => v.toFixed(3)).join(', ')}]  cloudBright ${A.cloudBright.toFixed(2)}`);
    for (const py of PROJ_ROWS[shot]) {
      const px = PROJ_COLS[shot];
      const d = rayAt(cam, px, py);
      const elev = (Math.asin(d.y) * 180) / Math.PI;
      if (d.y <= 0.004) { console.log(`    row ${py}: below deck horizon`); continue; }
      console.log(`    row y=${py} (x=${px}): elev ${elev.toFixed(1)}°`);
      C.decks.forEach((D, k) => {
        const uvOf = (dd) => { const t = D.h / dd.y; return [dd.x * t * D.scale, dd.z * t * D.scale]; };
        const uv0 = uvOf(d), uvx = uvOf(rayAt(cam, px + 1, py)), uvy = uvOf(rayAt(cam, px, py + 1));
        const g1x = Math.hypot((uvx[0] - uv0[0]) / D.streak, uvx[1] - uv0[1]);
        const g1y = Math.hypot((uvy[0] - uv0[0]) / D.streak, uvy[1] - uv0[1]);
        const P6x = 1 / (C.texBase * Math.max(1e-9, g1x)), P6y = 1 / (C.texBase * Math.max(1e-9, g1y));
        const texRate = C.noiseSize * Math.max(Math.hypot(uvx[0] - uv0[0], uvx[1] - uv0[1]), Math.hypot(uvy[0] - uv0[0], uvy[1] - uv0[1]));
        const puffCell = 1 / (C.texBase * 1.35 * 1.7 * Math.max(1e-9, Math.max(g1x, g1y)));
        console.log(`      deck${k}: |uv| ${Math.hypot(...uv0).toFixed(2)}rep  P6 x ${P6x.toFixed(0)}px/y ${P6y.toFixed(0)}px (cells ${(P6x / 2).toFixed(0)}/${(P6y / 2).toFixed(0)}px)  n1 ${texRate.toFixed(1)} texel/px  worley ${puffCell.toFixed(0)}px  warp ±${(0.45 * D.warp * 0.9).toFixed(2)}rep`);
      });
    }
    console.log('');
  }
  console.log(`  scale·h = ${C.decks.map((D) => (D.scale * D.h).toFixed(3)).join(' / ')} — three decks within 17% of ONE`);
  console.log('  angular frequency: no parallax scale separation, and nothing below 6 cyc/repeat');
  console.log('  exists in the texture, so no term can make a feature larger than P6 above.');
}

/* ══════════════════════════ section: sim ══════════════════════════
 * Verbatim ports from src/render/Sky.js (hash2/gradNoise2/fbm2/ridged2/worley2/warpedFbm2/
 * buildCloudTexture L35-97,159-195; deckDensity/cloudDeck L265-323; main L325-420) and
 * src/render/Atmosphere.js ATMOSPHERE_GLSL (hash11/hash13/hgPhase/rayleighPhase/bandRamp),
 * plus PostFX.js composite grade L1058-1148 and passes/Common.js GLSL_AGX/GLSL_SRGB. */

function hash2(x, y, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const nfade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function gradNoise2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const grad = (ix, iy, dx, dy) => {
    const a = hash2(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = nfade(xf), v = nfade(yf);
  const x1 = grad(xi, yi, xf, yf) * (1 - u) + grad(xi + 1, yi, xf - 1, yf) * u;
  const x2 = grad(xi, yi + 1, xf, yf - 1) * (1 - u) + grad(xi + 1, yi + 1, xf - 1, yf - 1) * u;
  return x1 * (1 - v) + x2 * v;
}
function fbm2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += gradNoise2(fx, fy, seed + i * 977) * amp;
    norm += amp; amp *= gain; fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}
function ridged2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(gradNoise2(fx, fy, seed + i * 613));
    sum += n * n * amp;
    norm += amp; amp *= gain; fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}
function worley2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = xi + ox, cy = yi + oy;
    const px = cx + hash2(cx, cy, seed);
    const py = cy + hash2(cx, cy, seed + 7919);
    const dx = px - x, dy = py - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return { f1, f2 };
}
function warpedFbm2(x, y, opts = {}) {
  const { warp = 0.6, seed = 1 } = opts;
  const wx = fbm2(x + 5.2, y + 1.3, { ...opts, seed: seed + 31 });
  const wy = fbm2(x + 1.7, y + 9.2, { ...opts, seed: seed + 97 });
  return fbm2(x + warp * wx, y + warp * wy, opts);
}
function buildCloudTextureData(size, seed) {
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x * inv, v = y * inv;
    const fx = u * 6, fy = v * 6;
    const i = (y * size + x) * 4;
    const cir = warpedFbm2(fx * 0.42, fy * 2.6, { octaves: 4, seed: seed + 11, warp: 0.7 });
    data[i] = Math.round(255 * Math.min(1, Math.max(0, cir * 0.5 + 0.5)));
    const cum = warpedFbm2(fx, fy, { octaves: 5, seed: seed + 97, warp: 0.9 });
    const lump = Math.min(1, Math.max(0, cum * 0.62 + 0.5));
    data[i + 1] = Math.round(255 * lump * lump * (3 - 2 * lump));
    const det = ridged2(fx * 2.3, fy * 2.3, { octaves: 3, seed: seed + 313 });
    data[i + 2] = Math.round(255 * Math.min(1, Math.max(0, det)));
    const w = worley2(fx * 1.35, fy * 1.35, seed + 701);
    data[i + 3] = Math.round(255 * Math.min(1, w.f2 - w.f1 + 0.25));
  }
  return data;
}

/** Mip chain + trilinear + ~4x anisotropic sampler over the RGBA data texture. */
function makeSampler(base, size) {
  const levels = [{ d: base, s: size }];
  let cur = base, cs = size;
  while (cs > 4) {
    const ns = cs >> 1;
    const nd = new Uint8Array(ns * ns * 4);
    for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
      for (let c = 0; c < 4; c++) {
        nd[(y * ns + x) * 4 + c] = (cur[((2 * y) * cs + 2 * x) * 4 + c] + cur[((2 * y) * cs + 2 * x + 1) * 4 + c]
          + cur[((2 * y + 1) * cs + 2 * x) * 4 + c] + cur[((2 * y + 1) * cs + 2 * x + 1) * 4 + c] + 2) >> 2;
      }
    }
    levels.push({ d: nd, s: ns });
    cur = nd; cs = ns;
  }
  const bilinear = (lv, u, v, out) => {
    const { d, s } = levels[lv];
    let fu = (u - Math.floor(u)) * s - 0.5, fv = (v - Math.floor(v)) * s - 0.5;
    const x0 = Math.floor(fu), y0 = Math.floor(fv);
    const tx = fu - x0, ty = fv - y0;
    const wrap = (a) => ((a % s) + s) % s;
    const X0 = wrap(x0), X1 = wrap(x0 + 1), Y0 = wrap(y0), Y1 = wrap(y0 + 1);
    for (let c = 0; c < 4; c++) {
      const a = d[(Y0 * s + X0) * 4 + c], b = d[(Y0 * s + X1) * 4 + c];
      const e = d[(Y1 * s + X0) * 4 + c], f = d[(Y1 * s + X1) * 4 + c];
      out[c] = ((a * (1 - tx) + b * tx) * (1 - ty) + (e * (1 - tx) + f * tx) * ty) / 255;
    }
    return out;
  };
  const tmp = [0, 0, 0, 0];
  /** sample(u, v, gx, gy) → [r,g,b,a] in 0..1; gx/gy = d(uv)/dpx for THIS sample's uv. */
  return (u, v, gx, gy, out = [0, 0, 0, 0]) => {
    const lx = Math.hypot(gx[0], gx[1]) * size, ly = Math.hypot(gy[0], gy[1]) * size;
    let major = Math.max(lx, ly), minor = Math.max(1e-6, Math.min(lx, ly));
    const aniso = Math.min(4, Math.max(1, major / minor));
    const lod = Math.max(0, Math.min(levels.length - 1.001, Math.log2(Math.max(1e-6, major / aniso))));
    const l0 = Math.floor(lod), lt = lod - l0;
    const taps = aniso > 1.5 ? 4 : 1;
    const dir = lx > ly ? gx : gy;
    out[0] = out[1] = out[2] = out[3] = 0;
    for (let t = 0; t < taps; t++) {
      const o = taps === 1 ? 0 : (t / (taps - 1) - 0.5);
      const su = u + dir[0] * o * 0.75, sv = v + dir[1] * o * 0.75;
      bilinear(l0, su, sv, tmp);
      let r0 = tmp[0], g0 = tmp[1], b0 = tmp[2], a0 = tmp[3];
      if (lt > 0.001 && l0 + 1 < levels.length) {
        bilinear(l0 + 1, su, sv, tmp);
        r0 += (tmp[0] - r0) * lt; g0 += (tmp[1] - g0) * lt; b0 += (tmp[2] - b0) * lt; a0 += (tmp[3] - a0) * lt;
      }
      out[0] += r0 / taps; out[1] += g0 / taps; out[2] += b0 / taps; out[3] += a0 / taps;
    }
    return out;
  };
}

/* GLSL helpers, ported */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
const mixN = (a, b, t) => a + (b - a) * t;
function hash11(p) { p = (p * 0.1031) % 1; if (p < 0) p += 1; p *= p + 33.33; p *= p + p; return p - Math.floor(p); }
function hash13(px, py, pz) {
  let x = (px * 0.1031) % 1, y = (py * 0.103) % 1, z = (pz * 0.0973) % 1;
  if (x < 0) x += 1; if (y < 0) y += 1; if (z < 0) z += 1;
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  const r = (x + y) * z;
  return r - Math.floor(r);
}
const hgPhase = (cosT, g) => { const g2 = g * g; const d = 1 + g2 - 2 * g * cosT; return (1 - g2) / (4 * Math.PI * Math.pow(Math.max(d, 1e-4), 1.5)); };
const rayleighPhase = (cosT) => (3 / (16 * Math.PI)) * (1 + cosT * cosT);
const bandRamp = (x, bands, soft) => { const s = x * bands; const f = Math.floor(s); const r = sstep(0.5 - soft, 0.5 + soft, s - f); return (f + r) / bands; };

/* AgX, ported from passes/Common.js GLSL_AGX (mat3 in GLSL is column-major: M*v below). */
const M_SRGB_2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]];
const M_2020_SRGB = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];
const M_INSET = [[0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859]];
const M_OUTSET = [[1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]];
const mat3mul = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
const agxContrast = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
function slyAgX(c) {
  let v = mat3mul(M_SRGB_2020, c);
  v = mat3mul(M_INSET, v);
  v = v.map((x) => Math.max(x, 1e-10));
  v = v.map((x) => (Math.log2(x) - (-12.47393)) / (4.026069 - (-12.47393)));
  v = v.map(clamp01);
  v = v.map(agxContrast);
  v = mat3mul(M_OUTSET, v);
  v = v.map((x) => Math.pow(Math.max(x, 0), 2.2));
  v = mat3mul(M_2020_SRGB, v);
  // gamut-map (Common.js): lift negative channels toward luminance
  const mn = Math.min(...v);
  if (mn < 0) {
    const l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    if (l > 1e-6) { const t = -mn / (l - mn); v = v.map((x) => x + (l - x) * t); } else v = v.map((x) => Math.max(0, x));
  }
  return v;
}
const lin2srgb = (c) => c.map((x) => { x = Math.max(0, x); return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; });
const srgbHex2lin = (hex) => {
  const s = [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
  return s.map((x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
};

/** Full sky radiance (linear) for direction d, with toggles. Ports SKY_FRAG main(). */
function makeSkySim(C, A, opts = {}) {
  const decks = opts.decks ?? C.decks;
  const deckOn = opts.deckOn ?? [true, true, true];
  const warpOn = opts.warpOn ?? true;
  const coverAdd = opts.coverAdd ?? 0;
  const sampler = opts.sampler;
  const uTime = opts.uTime ?? 0;   // capture boots freeze an arbitrary t; drift = per-deck uv translation
  /* AMENDMENT (skyswirl): candidate elevation-dependent terms, SIM-ONLY probes of a
   * proposed shader change — NOT ports of shipped code. Defaults reproduce the shipped
   * shader exactly (grazeEdge 0.085 is the shipped alpha smoothstep edge; grazeCover 0
   * disables the coverage lift; grazeBand only read when grazeCover > 0). */
  const grazeEdge = opts.grazeEdge ?? 0.085;
  const grazeCover = opts.grazeCover ?? 0;
  const grazeBand = opts.grazeBand ?? [0.06, 0.22];
  const grazeLod = opts.grazeLod ?? 0;      // mip-bias at grazing (texture2D bias equivalent)
  const grazeSoft = opts.grazeSoft ?? 0;    // soft widening at grazing
  const cover = [A.cloudCover.x + coverAdd, A.cloudCover.y + coverAdd, A.cloudCover.z + coverAdd];
  const col3 = (c) => [c.r, c.g, c.b];
  const uZenith = col3(A.zenith), uHorizon = col3(A.horizon), uHaze = col3(A.haze);
  const uViolet = col3(A.violet), uGroundHaze = col3(A.groundHaze);
  const uSunDisc = col3(A.sunDisc), uSunGlow = col3(A.sunGlow), uMoonColor = col3(A.moonColor);
  const uCloudLit = col3(A.cloudLit), uCloudShadow = col3(A.cloudShadow), uCloudRim = col3(A.cloudRim);
  const sun = A.sunDir, moon = A.moonDir;
  const milky = new THREE.Vector3(-0.58, 0.50, 0.64).normalize();

  function deckDensity(ax, ay, gx, gy, streak, cov, soft, lodK = 1) {
    const s1 = sampler(ax, ay, [gx[0] * lodK, gx[1] * lodK], [gy[0] * lodK, gy[1] * lodK]);
    const n1 = s1[1];
    const s2 = sampler(ax * 2.31 + 0.37, ay * 2.31 + 0.11, [gx[0] * 2.31 * lodK, gx[1] * 2.31 * lodK], [gy[0] * 2.31 * lodK, gy[1] * 2.31 * lodK]);
    const n2 = s2[0];
    const s3 = sampler(ax * 5.7 - 0.19, ay * 5.7 - 0.53, [gx[0] * 5.7 * lodK, gx[1] * 5.7 * lodK], [gy[0] * 5.7 * lodK, gy[1] * 5.7 * lodK]);
    const n3 = s3[2];
    const sp = sampler(ax * 1.7 + 0.61, ay * 1.7 + 0.23, [gx[0] * 1.7 * lodK, gx[1] * 1.7 * lodK], [gy[0] * 1.7 * lodK, gy[1] * 1.7 * lodK]);
    const puff = sp[3];
    const raw = n1 * 0.58 + n2 * 0.30 + n3 * 0.16 + puff * 0.20;
    return { dens: sstep(cov, cov + soft, raw), core: puff };
  }

  function cloudDeck(k, d, dNx, dNy, skyBehind) {
    const D = decks[k];
    if (d.y <= 0.004) return skyBehind;
    const uvOf = (dd) => { const t = D.h / dd.y; return [dd.x * t * D.scale + D.drift * uTime * D.scale * 26, dd.z * t * D.scale + D.drift * 0.35 * uTime * D.scale * 26]; };
    const uv0 = uvOf(d), uvX = uvOf(dNx), uvY = uvOf(dNy);
    let gx = [uvX[0] - uv0[0], uvX[1] - uv0[1]], gy = [uvY[0] - uv0[0], uvY[1] - uv0[1]];
    let uv = uv0;
    if (warpOn) {
      const wS = (p) => { const s = sampler(p[0] * 0.31, p[1] * 0.31, [gx[0] * 0.31, gx[1] * 0.31], [gy[0] * 0.31, gy[1] * 0.31]); const s2 = sampler(p[0] * 0.31 + 0.5, p[1] * 0.31 + 0.5, [gx[0] * 0.31, gx[1] * 0.31], [gy[0] * 0.31, gy[1] * 0.31]); return [s[0] - 0.5, s2[1] - 0.5]; };
      const w0 = wS(uv0), w1 = wS(uvX), w2 = wS(uvY);
      uv = [uv0[0] + w0[0] * D.warp * 0.9, uv0[1] + w0[1] * D.warp * 0.9];
      gx = [uvX[0] + w1[0] * D.warp * 0.9 - uv[0], uvX[1] + w1[1] * D.warp * 0.9 - uv[1]];
      gy = [uvY[0] + w2[0] * D.warp * 0.9 - uv[0], uvY[1] + w2[1] * D.warp * 0.9 - uv[1]];
    }
    const a = [uv[0] / D.streak, uv[1]];
    const agx = [gx[0] / D.streak, gx[1]], agy = [gy[0] / D.streak, gy[1]];
    const gz = (grazeCover > 0 || grazeLod > 0 || grazeSoft > 0) ? (1 - sstep(grazeBand[0], grazeBand[1], d.y)) : 0;
    const covK = cover[k] + grazeCover * gz;
    const softK = D.soft + grazeSoft * gz;
    const lodK = grazeLod > 0 ? Math.pow(2, grazeLod * gz) : 1;
    const { dens, core } = deckDensity(a[0], a[1], agx, agy, D.streak, covK, softK, lodK);
    if (dens <= 0.001) return skyBehind;
    const sl = Math.hypot(sun.x, sun.z) || 1e-4;
    const sunUv = [(sun.x / sl) * 0.030 * (1 + 2.2 * (1 - clamp01(sun.y))), (sun.z / sl) * 0.030 * (1 + 2.2 * (1 - clamp01(sun.y)))];
    const dL = deckDensity(a[0] + sunUv[0], a[1] + sunUv[1], agx, agy, D.streak, covK, softK, lodK).dens;
    let lit = clamp01((dens - dL) * 2.6 + 0.52 + sun.y * 0.22);
    lit = bandRamp(lit, 3, 0.16);
    let col = [0, 1, 2].map((c) => mixN(uCloudShadow[c], uCloudLit[c], lit) * A.cloudBright);
    const rim = Math.pow(1 - dens, 3.2) * lit;
    col = col.map((v, c) => v + uCloudRim[c] * rim * 1.35);
    col = col.map((v, c) => mixN(v, uCloudShadow[c] * 0.82, (1 - lit) * 0.45 * core));
    let alpha = dens * D.opacity * sstep(0.004, grazeEdge, d.y);
    const far = sstep(0.55, 0.03, d.y);
    col = col.map((v, c) => mixN(v, uHaze[c], far * 0.42 * 1.0));
    alpha *= mixN(1, 0.72, far);
    return skyBehind.map((v, c) => mixN(v, col[c], alpha));
  }

  function starField(dx, dy, dz, boost) {
    const p = [dx * 165, dy * 165, dz * 165];
    const cell = p.map(Math.floor);
    const f = p.map((v, i) => v - cell[i] - 0.5);
    const h = hash13(cell[0], cell[1], cell[2]);
    const exists = sstep(0.9945 - boost * 0.006, 1.0, h);
    if (exists <= 0) return 0;
    const jit = [hash13(cell[0] + 1.7, cell[1] + 1.7, cell[2] + 1.7), hash13(cell[0] + 3.1, cell[1] + 3.1, cell[2] + 3.1), hash13(cell[0] + 5.3, cell[1] + 5.3, cell[2] + 5.3)].map((v) => v - 0.5);
    const r = Math.hypot(f[0] - jit[0] * 0.72, f[1] - jit[1] * 0.72, f[2] - jit[2] * 0.72);
    const mag = 0.35 + 0.65 * hash11(h * 41.0);
    const twinkle = 0.72 + 0.28 * Math.sin(uTime * 2.1 + h * 137.0);
    return exists * Math.exp(-r * r * 30.0) * mag * twinkle;
  }

  function nightSky(d) {
    const b = d.x * milky.x + d.y * milky.y + d.z * milky.z;
    const band = Math.exp(-(b * b) / (0.3 * 0.3));
    const bu = [Math.atan2(d.z, d.x) * 0.2387, b * 1.9];
    const g0 = [[1e-4, 0], [0, 1e-4]];
    const dust = sampler(bu[0] * 1.1, bu[1] * 1.1, g0[0], g0[1])[1];
    const lane = sampler(bu[0] * 2.7 + 0.31, bu[1] * 2.7 + 0.31, g0[0], g0[1])[2];
    const glow = band * (0.42 + 0.72 * dust) * (1.0 - 0.55 * lane);
    const milkyCol = [mixN(0.36, 0.62, dust) * glow, mixN(0.42, 0.58, dust) * glow, mixN(0.62, 0.52, dust) * glow];
    const s = starField(d.x, d.y, d.z, band * 1.15) + starField(d.x * 2.13 + 7.0, d.y * 2.13 + 7.0, d.z * 2.13 + 7.0, band * 0.6) * 0.45;
    const k = A.starAmount * sstep(-0.02, 0.10, d.y);
    return [(milkyCol[0] * 1.0 + 0.86 * s * 2.6) * k, (milkyCol[1] * 1.0 + 0.90 * s * 2.6) * k, (milkyCol[2] * 1.0 + 1.0 * s * 2.6) * k];
  }

  return function radiance(d, dNx, dNy) {
    const h = Math.max(d.y, 0);
    const cosSun = d.x * sun.x + d.y * sun.y + d.z * sun.z;
    const cosMoon = d.x * moon.x + d.y * moon.y + d.z * moon.z;
    const grad = Math.pow(h, A.horizonPower);
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const lumH = Math.max(1e-5, lum(uHorizon)), lumZ = Math.max(1e-5, lum(uZenith));
    const lmix = mixN(lumH, lumZ, grad);
    let col = [0, 1, 2].map((c) => mixN(uHorizon[c] / lumH, uZenith[c] / lumZ, grad) * lmix);
    const ray = rayleighPhase(cosSun) / rayleighPhase(0);
    col = col.map((v) => v * mixN(1, ray, 0.16 * A.dayAmount));
    const antiSun = 1 - clamp01(cosSun * 0.5 + 0.5);
    const bandMask = Math.exp(-Math.pow((h - 0.19) / 0.15, 2));
    col = col.map((v, c) => mixN(v, uViolet[c], bandMask * antiSun * A.violetAmount));
    const azWarm = Math.pow(clamp01(cosSun * 0.5 + 0.5), 2.6);
    const lowBand = Math.exp(-h / 0.085);
    col = col.map((v, c) => mixN(v, uHaze[c], lowBand * (0.30 + 0.55 * azWarm) * A.dayAmount));
    const mieTight = hgPhase(cosSun, A.mieG), mieWide = hgPhase(cosSun, A.mieG * 0.44);
    col = col.map((v, c) => v + uSunGlow[c] * (mieTight * 0.55 + mieWide * 0.30) * A.mieStrength * A.dayAmount);
    const below = sstep(0, -0.055, d.y);
    col = col.map((v, c) => mixN(v, uGroundHaze[c], below));
    if (A.nightAmount > 0) {
      const ns = nightSky(d);
      col = col.map((v, c) => v + ns[c] * A.nightAmount);
    }
    const sunAng = Math.acos(Math.max(-1, Math.min(1, cosSun)));
    const discFade = sstep(-0.10, 0.02, sun.y);
    const disc = (1 - sstep(A.sunAngularRadius * 0.80, A.sunAngularRadius * 1.06, sunAng)) * discFade;
    col = col.map((v, c) => v + uSunDisc[c] * disc * 26.0);
    const halo = Math.pow(Math.max(0, 1 - sunAng / (A.sunAngularRadius * 15.0)), 2.6);
    col = col.map((v, c) => v + uSunGlow[c] * halo * 0.85 * discFade);
    const moonAng = Math.acos(Math.max(-1, Math.min(1, cosMoon)));
    const moonFade = sstep(-0.06, 0.05, moon.y) * A.nightAmount;
    const mdisc = 1 - sstep(A.moonAngularRadius * 0.90, A.moonAngularRadius * 1.02, moonAng);
    if (mdisc > 0) {
      const mUp = new THREE.Vector3().crossVectors(moon, new THREE.Vector3(0, 1, 0)).add(new THREE.Vector3(1e-4, 1e-4, 1e-4)).normalize();
      const mRt = new THREE.Vector3().crossVectors(mUp, moon);
      const mUv = [(d.x * mRt.x + d.y * mRt.y + d.z * mRt.z) / A.moonAngularRadius * 0.5 + 0.5,
        (d.x * mUp.x + d.y * mUp.y + d.z * mUp.z) / A.moonAngularRadius * 0.5 + 0.5];
      const maria = sampler(mUv[0] * 0.7 + 0.2, mUv[1] * 0.7 + 0.2, [[1e-4, 0]][0], [0, 1e-4])[1];
      const limb = sstep(1.02, 0.35, moonAng / A.moonAngularRadius);
      col = col.map((v, c) => v + uMoonColor[c] * mdisc * moonFade * 7.5 * (0.72 + 0.34 * maria) * (0.75 + 0.25 * limb));
    }
    const mhalo = Math.pow(Math.max(0, 1 - moonAng / (A.moonAngularRadius * 9.0)), 2.4);
    col = col.map((v, c) => v + uMoonColor[c] * mhalo * 0.55 * moonFade);
    for (let k = 0; k < 3; k++) if (deckOn[k]) col = cloudDeck(k, d, dNx, dNy, col);
    col = col.map((v, c) => v + uSunDisc[c] * disc * 26.0 * 0.45);
    return col.map((v) => Math.max(0, v * A.skyGain * A.exposure));
  };
}

/** PostFX composite grade for a sky pixel (no AO/bloom/rim/ink/vignette), ported L1058-1148. */
function makeGrade(C) {
  const P = C.pfx;
  const shadow = srgbHex2lin(P.splitShadow), highlight = srgbHex2lin(P.splitHighlight);
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (scene, px, py, withGrain) => {
    let c = scene.map((v) => v * P.exposure);
    c = c.map((v, i) => Math.max(0, v + P.lift[i] * (1 - v)));
    c = c.map((v, i) => v * P.gain[i]);
    const l = lum(c);
    const t = sstep(P.splitRange[0], P.splitRange[1], l);
    let tone = [mixN(shadow[0], highlight[0], t), mixN(shadow[1], highlight[1], t), mixN(shadow[2], highlight[2], t)];
    const tl = Math.max(1e-4, lum(tone));
    tone = tone.map((v) => v / tl);
    c = c.map((v, i) => mixN(v, v * tone[i], P.splitStrength));
    c = c.map((v) => mixN(l, v, P.saturation));
    c = c.map((v) => 0.18 * Math.pow(Math.max(v, 1e-6) / 0.18, P.contrast));
    c = slyAgX(c);
    c = lin2srgb(c);
    if (withGrain) { const g = (ign(px, py) - 0.5) * P.grain; c = c.map((v) => v + g); }
    return c.map((v) => Math.max(0, Math.min(1, v)));
  };
}

/** Render a rect through a shot camera into a luma grid (+ optional RGBA for PNG dump). */
function renderRect(C, shot, rect, opts, withGrain = true, wantRGBA = false) {
  const cam = shotCamera(shot);
  const A = evalAtmosphere(SHOTS[shot].tod, createAtmosphereState());
  const sim = makeSkySim(C, A, opts);
  const grade = makeGrade(C);
  const [x0, y0, x1, y1] = rect;
  const w = x1 - x0, h = y1 - y0;
  const L = new Float64Array(w * h);
  const rgba = wantRGBA ? new Uint8Array(w * h * 4) : null;
  const d = new THREE.Vector3(), dx = new THREE.Vector3(), dy = new THREE.Vector3();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    rayAt(cam, x0 + x, y0 + y, d);
    rayAt(cam, x0 + x + 1, y0 + y, dx);
    rayAt(cam, x0 + x, y0 + y + 1, dy);
    const lin = sim(d, dx, dy);
    const c = grade(lin, x0 + x, y0 + y, withGrain);
    L[y * w + x] = luma709(c[0] * 255, c[1] * 255, c[2] * 255);
    if (rgba) {
      rgba[(y * w + x) * 4] = Math.round(c[0] * 255);
      rgba[(y * w + x) * 4 + 1] = Math.round(c[1] * 255);
      rgba[(y * w + x) * 4 + 2] = Math.round(c[2] * 255);
      rgba[(y * w + x) * 4 + 3] = 255;
    }
  }
  return { L, w, h, rgba };
}

function writeSimPNG(path, { rgba, w, h }) {
  const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc = (b) => { let c = -1; for (const v of b) c = CRC_T[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0); out.write(type, 4);
    body.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

/* The registered CANDIDATE parameter set this instrument evaluates offline; the PREREG
 * quotes these exact values. Rationale in PREREG-skynoise.md: push the three decks apart in
 * angular frequency (scale·h 0.669/0.754/0.780 → cumulus coarse, cirrus finest) so the sky
 * carries a few LARGE soft masses instead of one uniform cell field, and widen `soft` so the
 * mid-histogram threshold cut stops slicing the fbm into binary cells (edge slope 1.5/soft:
 * deck2 was 16.7, candidate ~5). h, drift, opacity, warp, streak untouched. */
const CANDIDATE = {
  decks: [
    { h: 2600, scale: 0.000105, drift: 0.9, soft: 0.36, opacity: 0.72, warp: 0.55, streak: 3.4 },
    { h: 1450, scale: 0.000138, drift: 1.6, soft: 0.38, opacity: 0.86, warp: 0.85, streak: 1.5 },
    { h: 760, scale: 0.000105, drift: 2.4, soft: 0.40, opacity: 0.97, warp: 1.25, streak: 1.0 },
  ],
};

const SIM_RECTS = { courtyard: [620, 10, 1200, 110], dunes: [320, 12, 1000, 85], night: [900, 8, 1270, 112], hero: [340, 2, 700, 50] };
const SIM_THRESH = { courtyard: 60, dunes: 60, night: 22, hero: 60 };

function runSim(C, wantPNG) {
  console.log('\n══ SIM — CPU re-render of sky rects, per-term ablation (uTime=0, no FXAA/bloom/vignette/FX) ══');
  console.log('  Building noise texture (bit-identical build: same code+seed as Sky.js)...');
  const t0 = Date.now();
  const tex = buildCloudTextureData(C.noiseSize, (C.seed ^ 0x5b1e) >>> 0);
  const sampler = makeSampler(tex, C.noiseSize);
  console.log(`  texture built in ${Date.now() - t0} ms`);
  {
    // texture sanity: G-channel histogram mean vs the cover thresholds it is cut by
    let s = 0, s2 = 0;
    for (let i = 0; i < C.noiseSize * C.noiseSize; i++) { const v = tex[i * 4 + 1] / 255; s += v; s2 += v * v; }
    const n = C.noiseSize * C.noiseSize, m = s / n;
    console.log(`  G-channel mean ${m.toFixed(3)} sd ${Math.sqrt(s2 / n - m * m).toFixed(3)} — day cover 0.59-0.72 cuts at ${((0.59 - m)).toFixed(2)}..${((0.72 - m)).toFixed(2)} of mean`);
  }
  const arms = [
    ['full', {}],
    ['nodecks', { deckOn: [false, false, false] }],
    ['deck0', { deckOn: [true, false, false] }],
    ['deck1', { deckOn: [false, true, false] }],
    ['deck2', { deckOn: [false, false, true] }],
    ['nowarp', { warpOn: false }],
    ['flat(cover+9)', { coverAdd: 9 }],
    ['CANDIDATE', { decks: CANDIDATE.decks }],
    ['CAND-nograin', { decks: CANDIDATE.decks, grain: false }],
    /* seam probe: the texture does NOT actually tile (buildCloudTexture's comment says
     * "sample on a torus" but gradNoise2's integer lattice never wraps — hash2(6,y) is not
     * hash2(0,y) — so every integer uv boundary is a value discontinuity). Drift translates
     * uv by drift·t·scale·26 per deck, so a long-lived boot parks seams mid-frame. t=300 s
     * is a plausible capture settle. Marble hides seams today; a soft-mass candidate might
     * not. This arm measures whether they surface. */
    ['CAND-t300', { decks: CANDIDATE.decks, uTime: 300 }],
  ];
  const out = {};
  for (const shot of Object.keys(SIM_RECTS)) {
    const rect = SIM_RECTS[shot];
    console.log(`\n  ${shot} rect ${JSON.stringify(rect)} (mask<${SIM_THRESH[shot]}):`);
    out[shot] = {};
    for (const [name, o] of arms) {
      const withGrain = o.grain !== false;
      const wantRGBA = wantPNG && (name === 'full' || name === 'CANDIDATE' || name === 'flat(cover+9)' || name === 'CAND-t300');
      const r = renderRect(C, shot, rect, { ...o, sampler }, withGrain, wantRGBA);
      const mask = darkMask(r, SIM_THRESH[shot]);
      const st = stats(r, mask);
      const ay = acf(r, mask, 'y'), axr = acf(r, mask, 'x');
      const pd = pd9(r, mask);
      out[shot][name] = { hf: st.hf, sd: st.sd, pd9: pd.pd9, acfYmin: ay.minLag, acfXmin: axr.minLag };
      console.log(`    ${name.padEnd(14)} hf ${st.hf.toFixed(2).padStart(6)}  sd ${st.sd.toFixed(2).padStart(6)}  PD9 ${pd.pd9.toFixed(2).padStart(6)}  acfY min@${String(ay.minLag).padStart(3)}  acfX min@${String(axr.minLag).padStart(3)}  meanL ${st.mean.toFixed(0)}`);
      if (wantRGBA) {
        const p = `${SCRATCH}/sim-${shot}-${name.replace(/[^a-zA-Z0-9]/g, '')}.png`;
        writeSimPNG(p, r);
        console.log(`      → ${p}`);
      }
    }
  }
  console.log('\n  Attribution reading: (full − nodecks) is the deck stack\'s contribution;');
  console.log('  deck0/1/2 rows split it; nowarp isolates the domain-warp swirl signature;');
  console.log('  flat(cover+9) is the over-corrected poster-sky calibration arm (must FAIL PD9);');
  console.log('  CANDIDATE is the registered fix parameter set (PREREG-skynoise.md).');
  return out;
}

/* ────────────────────────── main ────────────────────────── */

const argv = process.argv.slice(2);
const mode = argv.find((a) => !a.startsWith('-')) || 'all';
const wantPNG = argv.includes('--png');
const C = loadSourceConstants();
console.log('drift guard OK — constants parsed from committed source:');
console.log('  Sky.js decks: ' + C.decks.map((d) => `h${d.h}/s${d.scale}/soft${d.soft}/op${d.opacity}/warp${d.warp}/streak${d.streak}`).join('  '));
console.log(`  Sky.js WORLD_SEED ${C.seed}, noiseSize ${C.noiseSize}, texture base ${C.texBase} cyc/repeat`);
console.log(`  PostFX: grain ${C.pfx.grain} exposure ${C.pfx.exposure} contrast ${C.pfx.contrast} sat ${C.pfx.saturation} split ${C.pfx.splitStrength} shoulder ${C.pfx.toneShoulder}`);

/** Fast candidate iteration: full/nodecks/CANDIDATE on the three scored shots only. */
function runCand(C, wantPNG2) {
  console.log('\n══ CAND — quick candidate evaluation (full / nodecks / CANDIDATE) ══');
  const tex = buildCloudTextureData(C.noiseSize, (C.seed ^ 0x5b1e) >>> 0);
  const sampler = makeSampler(tex, C.noiseSize);
  for (const shot of ['courtyard', 'dunes', 'night']) {
    const rect = SIM_RECTS[shot];
    console.log(`  ${shot} ${JSON.stringify(rect)}:`);
    for (const [name, o] of [['full', {}], ['nodecks', { deckOn: [false, false, false] }], ['CANDIDATE', { decks: CANDIDATE.decks }]]) {
      const r = renderRect(C, shot, rect, { ...o, sampler }, true, wantPNG2 && name === 'CANDIDATE');
      const mask = darkMask(r, SIM_THRESH[shot]);
      const st = stats(r, mask);
      const ay = acf(r, mask, 'y');
      const pd = pd9(r, mask);
      console.log(`    ${name.padEnd(10)} hf ${st.hf.toFixed(2).padStart(6)}  sd ${st.sd.toFixed(2).padStart(6)}  PD9 ${pd.pd9.toFixed(2).padStart(6)}  acfY z0@${ay.z0} min@${ay.minLag}  meanL ${st.mean.toFixed(0)}`);
      if (wantPNG2 && name === 'CANDIDATE') {
        const p = `${SCRATCH}/cand-${shot}.png`;
        writeSimPNG(p, r);
        console.log(`      → ${p}`);
      }
    }
  }
}

/* ══════════════════ AMENDMENT: section swirl (skyswirl seal) ══════════════════
 * Per-term ablation of the RESIDUAL swirl/streak class at the SHIPPED deck values, on
 * geometry-free rects of the committed sbs2 frames (CRITIC-sbs2's finding). Sim renders
 * sky-only, so the frame row above each table carries FX petals/birds the sim lacks —
 * compare as statistics with that stated (skynoise R3's discipline).
 * All stats UNMASKED (the sbs2 correspondence convention; sim rects are geometry-free). */

const SWIRL_RECTS = {
  dunes: { rect: [920, 0, 1115, 45], frame: `${REC}/sbs2/dunes.png` },
  night: { rect: [1150, 90, 1275, 205], frame: `${REC}/sbs2/night.png` },
  courtyard: { rect: [850, 0, 1150, 55], frame: `${REC}/sbs2/courtyard.png` },
};

function decksWith(C, fn) { return C.decks.map((d, k) => ({ ...d, ...fn(d, k) })); }

/** Border-feathered texture: seam-step ablation. Interior byte-identical; the 2 texels
 * beside each wrap boundary are cross-faded to their mutual wrap mean, so the lattice
 * seam (hash2(6,y) != hash2(0,y), non-integer R/A frequencies) becomes a short ramp.
 * Diagnostic ONLY — quantifies how much of a rect's hf the seams carry; not a fix. */
function featherSeams(tex, size) {
  const t = new Uint8Array(tex);
  const at = (x, y, c) => (y * size + x) * 4 + c;
  for (let c = 0; c < 4; c++) {
    for (let y = 0; y < size; y++) {
      const m = Math.round((tex[at(0, y, c)] + tex[at(size - 1, y, c)]) / 2);
      t[at(0, y, c)] = m; t[at(size - 1, y, c)] = m;
      t[at(1, y, c)] = Math.round((tex[at(1, y, c)] + m) / 2);
      t[at(size - 2, y, c)] = Math.round((tex[at(size - 2, y, c)] + m) / 2);
    }
    for (let x = 0; x < size; x++) {
      const m = Math.round((t[at(x, 0, c)] + t[at(x, size - 1, c)]) / 2);
      t[at(x, 0, c)] = m; t[at(x, size - 1, c)] = m;
      t[at(x, 1, c)] = Math.round((t[at(x, 1, c)] + m) / 2);
      t[at(x, size - 2, c)] = Math.round((t[at(x, size - 2, c)] + m) / 2);
    }
  }
  return t;
}

function seamMagnitude(tex, size) {
  const names = ['R(cirrus 2.52cyc — cannot tile)', 'G(cumulus 6cyc — lattice unwrapped)', 'B(ridged 13.8cyc)', 'A(worley 8.1cyc — cannot tile)'];
  console.log('  texture wrap-seam magnitude per channel (mean |step| across the boundary vs interior):');
  for (let c = 0; c < 4; c++) {
    let seam = 0, inter = 0, ni = 0;
    for (let y = 0; y < size; y++) {
      seam += Math.abs(tex[(y * size + size - 1) * 4 + c] - tex[(y * size) * 4 + c]);
      for (let x = 0; x < size - 1; x++) { inter += Math.abs(tex[(y * size + x + 1) * 4 + c] - tex[(y * size + x) * 4 + c]); ni++; }
    }
    console.log(`    ${names[c]}: seam ${(seam / size).toFixed(1)}/255 vs interior ${(inter / ni).toFixed(1)}/255 = ${(seam / size / (inter / ni)).toFixed(1)}x`);
  }
}

/** Elevation + per-deck screen-period table for a rect (the projection-compression attribution). */
function swirlProject(C, shot, rect) {
  const cam = shotCamera(shot);
  const [x0, y0, x1, y1] = rect;
  const midX = Math.round((x0 + x1) / 2);
  for (const py of [y0, Math.round((y0 + y1) / 2), y1 - 1]) {
    const d = rayAt(cam, midX, py);
    const elev = (Math.asin(d.y) * 180) / Math.PI;
    if (d.y <= 0.004) { console.log(`    row ${py}: below deck horizon`); continue; }
    const parts = C.decks.map((D, k) => {
      const uvOf = (dd) => { const t = D.h / dd.y; return [dd.x * t * D.scale, dd.z * t * D.scale]; };
      const uv0 = uvOf(d), uvx = uvOf(rayAt(cam, midX + 1, py)), uvy = uvOf(rayAt(cam, midX, py + 1));
      const g1x = Math.hypot((uvx[0] - uv0[0]) / D.streak, uvx[1] - uv0[1]);
      const g1y = Math.hypot((uvy[0] - uv0[0]) / D.streak, uvy[1] - uv0[1]);
      return `d${k} P6y ${(1 / (C.texBase * Math.max(1e-9, g1y))).toFixed(0)}px/P6x ${(1 / (C.texBase * Math.max(1e-9, g1x))).toFixed(0)}px aniso ${(g1y / Math.max(1e-9, g1x)).toFixed(1)}`;
    });
    console.log(`    row y=${py} (x=${midX}): elev ${elev.toFixed(1)}°  ${parts.join('  ')}`);
  }
}

function runSwirl(C, wantPNG) {
  console.log('\n══ SWIRL — residual-class ablation at the SHIPPED deck values (sbs2 rects, unmasked) ══');
  const t0 = Date.now();
  const tex = buildCloudTextureData(C.noiseSize, (C.seed ^ 0x5b1e) >>> 0);
  const sampler = makeSampler(tex, C.noiseSize);
  const samplerFeather = makeSampler(featherSeams(tex, C.noiseSize), C.noiseSize);
  console.log(`  texture built in ${Date.now() - t0} ms`);
  seamMagnitude(tex, C.noiseSize);
  const arms = [
    ['full', {}],
    ['nodecks', { deckOn: [false, false, false] }],
    ['deck0', { deckOn: [true, false, false] }],
    ['deck1', { deckOn: [false, true, false] }],
    ['deck2', { deckOn: [false, false, true] }],
    ['nowarp', { warpOn: false }],
    ['warp2_0.7', { decks: decksWith(C, (d, k) => (k === 2 ? { warp: 0.7 } : {})) }],
    ['warpLo', { decks: decksWith(C, (d, k) => ({ warp: [0.45, 0.60, 0.70][k] })) }],
    ['streak0_1', { decks: decksWith(C, (d, k) => (k === 0 ? { streak: 1.0 } : {})) }],
    ['t300', { uTime: 300 }],
    ['seamfeather', { sampler: samplerFeather }],
    ['grazeA_.18', { grazeEdge: 0.18 }],
    ['grazeC_.12', { grazeCover: 0.12 }],
    /* the sealed skyswirl candidate + its over-corrected known-bad (PREREG-skyswirl.md) */
    ['CANDSW', { grazeCover: 0.15, grazeBand: [0.10, 0.30] }],
    ['KBOVER', { grazeCover: 0.60, grazeBand: [0.10, 0.45] }],
  ];
  const out = {};
  for (const [shot, S] of Object.entries(SWIRL_RECTS)) {
    const rect = S.rect;
    console.log(`\n  ${shot} rect ${JSON.stringify(rect)} — elevation/screen-period per deck:`);
    swirlProject(C, shot, rect);
    out[shot] = {};
    try {
      const im = readPNG(S.frame);
      const grid = lumaGrid(im, rect);
      const mask = darkMask(grid, null);
      const st = stats(grid, mask);
      const pd = pd9(grid, mask);
      out[shot].FRAME = { hf: st.hf, hfx: st.hfx, hfy: st.hfy, sd: st.sd, pd9: pd.pd9 };
      console.log(`    FRAME(sbs2)    hf ${st.hf.toFixed(2).padStart(6)} (x ${st.hfx.toFixed(2)} + y ${st.hfy.toFixed(2)})  sd ${st.sd.toFixed(2).padStart(6)}  PD9 ${pd.pd9.toFixed(2).padStart(6)}  meanL ${st.mean.toFixed(0)}   [carries FX petals/birds the sim lacks]`);
    } catch { console.log(`    FRAME(sbs2)    missing ${S.frame}`); }
    for (const [name, o] of arms) {
      const wantRGBA = wantPNG && ['full', 'nowarp', 'warp2_0.7', 'warpLo', 'streak0_1', 'seamfeather', 'grazeA_.18', 'grazeC_.12', 't300', 'CANDSW', 'KBOVER'].includes(name);
      const r = renderRect(C, shot, rect, { ...o, sampler: o.sampler ?? sampler }, true, wantRGBA);
      const mask = darkMask(r, null);
      const st = stats(r, mask);
      const ay = acf(r, mask, 'y'), ax = acf(r, mask, 'x');
      const pd = pd9(r, mask);
      out[shot][name] = { hf: st.hf, hfx: st.hfx, hfy: st.hfy, sd: st.sd, pd9: pd.pd9 };
      console.log(`    ${name.padEnd(12)} hf ${st.hf.toFixed(2).padStart(6)} (x ${st.hfx.toFixed(2)} + y ${st.hfy.toFixed(2)})  sd ${st.sd.toFixed(2).padStart(6)}  PD9 ${pd.pd9.toFixed(2).padStart(6)}  acfY z0@${String(ay.z0).padStart(3)} acfX z0@${String(ax.z0).padStart(3)}  meanL ${st.mean.toFixed(0)}`);
      if (wantRGBA) {
        const p = `${SCRATCH}/swirl-${shot}-${name.replace(/[^a-zA-Z0-9]/g, '')}.png`;
        writeSimPNG(p, r);
        console.log(`      → ${p}`);
      }
    }
  }
  console.log('\n  Reading: (full − nodecks) = deck residual at shipped values; deck solos split it;');
  console.log('  nowarp/warp2_0.7/warpLo = the warp term (R2\'s pre-named lever); streak0_1 = cirrus');
  console.log('  anisotropy; t300+seamfeather = the R1 seam; grazeA/grazeC = elevation-term probes.');
  console.log('  The projection table above is the compression attribution: P6y vs P6x per row.');
  return out;
}

/** AMENDMENT: value sweep for the elevation-term candidate shapes. Prints per-shot deltas
 * vs the shipped `full` arm; {courtyard, hero, traversal} are the null-check surfaces
 * (mid-elevation day, cloudless low wedge, day band) — the term must not move them. */
const SWEEP_RECTS = {
  dunes: [920, 0, 1115, 45], night: [1150, 90, 1275, 205],
  courtyard: [850, 0, 1150, 55], hero: [340, 2, 700, 50], traversal: [80, 5, 700, 55],
};

function runSweep(C) {
  console.log('\n══ SWEEP — elevation-term shapes at the SHIPPED deck values (unmasked rects) ══');
  const tex = buildCloudTextureData(C.noiseSize, (C.seed ^ 0x5b1e) >>> 0);
  const sampler = makeSampler(tex, C.noiseSize);
  const shapes = [];
  for (const band of [[0.08, 0.26], [0.10, 0.30], [0.12, 0.34]]) {
    for (const gc of [0.10, 0.15, 0.22]) shapes.push([`cover+${gc}@[${band}]`, { grazeCover: gc, grazeBand: band }]);
    for (const gl of [1.5, 2.5]) shapes.push([`lod+${gl}@[${band}]`, { grazeLod: gl, grazeBand: band }]);
    shapes.push([`soft+0.30@[${band}]`, { grazeSoft: 0.30, grazeBand: band }]);
    shapes.push([`cover+.12+lod2@[${band}]`, { grazeCover: 0.12, grazeLod: 2.0, grazeBand: band }]);
  }
  const base = {};
  for (const [shot, rect] of Object.entries(SWEEP_RECTS)) {
    const r = renderRect(C, shot, rect, { sampler }, true, false);
    const st = stats(r, darkMask(r, null));
    base[shot] = st;
  }
  console.log('  full(shipped): ' + Object.entries(base).map(([s, v]) => `${s} ${v.hf.toFixed(2)}`).join('  '));
  for (const [name, o] of shapes) {
    const row = [name.padEnd(24)];
    for (const [shot, rect] of Object.entries(SWEEP_RECTS)) {
      const r = renderRect(C, shot, rect, { ...o, sampler }, true, false);
      const st = stats(r, darkMask(r, null));
      const d = st.hf - base[shot].hf;
      row.push(`${shot.slice(0, 5)} ${st.hf.toFixed(2)} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`);
    }
    console.log('  ' + row.join('  '));
  }
  console.log('  null-check: courtyard/hero/traversal deltas must be ~0.00 for a scoped term.');
}

/** AMENDMENT: tall-rect sim renders for eyeballing candidate looks (scratchpad only).
 * These rects run DOWN toward the horizon so the low-band look (dunes stratus, night
 * veils) is visible, unlike the scored bands. Used to choose the candidate; the capture
 * owner reuses it for P7 side-by-sides. */
function runSwirlCrops(C) {
  console.log('\n══ SWIRLCROPS — tall sim renders to the scratchpad ══');
  const tex = buildCloudTextureData(C.noiseSize, (C.seed ^ 0x5b1e) >>> 0);
  const sampler = makeSampler(tex, C.noiseSize);
  const jobs = [
    ['dunes', [920, 0, 1120, 170]], ['night', [1150, 0, 1275, 205]],
  ];
  const arms = [
    ['full', {}],
    ['deck0', { deckOn: [true, false, false] }],
    ['deck12', { deckOn: [false, true, true] }],
    ['cover15', { grazeCover: 0.15, grazeBand: [0.10, 0.30] }],
    ['cover22', { grazeCover: 0.22, grazeBand: [0.10, 0.30] }],
    ['lod25', { grazeLod: 2.5, grazeBand: [0.10, 0.30] }],
    ['soft30', { grazeSoft: 0.30, grazeBand: [0.10, 0.30] }],
  ];
  for (const [shot, rect] of jobs) {
    for (const [name, o] of arms) {
      const r = renderRect(C, shot, rect, { ...o, sampler }, true, true);
      const p = `${SCRATCH}/tall-${shot}-${name}.png`;
      writeSimPNG(p, r);
      console.log(`  → ${p}`);
    }
  }
}

/* ────────────────────────── section: score ──────────────────────────
 * Scores a landed skynoise1 capture against PREREG-skynoise.md. That file is AUTHORITATIVE;
 * the SEAL table below is a convenience mirror sealed the same day — if they ever disagree,
 * the prereg wins and this table is the bug. Usage:
 *   node progress/records/skynoise-diag.mjs score progress/records/skynoise1
 * expecting <dir>/<chunk>/<shot>.<arm>.png with arms base|cand|flat|restore. */
const SEAL = {
  scoreRect: { courtyard: [620, 10, 1200, 110], dunes: [320, 12, 1000, 85], night: [900, 8, 1270, 112], hero: [340, 2, 700, 50] },
  maskThresh: { courtyard: 60, dunes: 60, night: 22, hero: 60 },
  baseGateMin: { courtyard: 6.5, dunes: 4.8, night: 6.2 },
  flatPD9Max: 1.2,
  flatHfBand: { courtyard: [3.0, 4.4], dunes: [3.0, 4.4], night: [1.4, 3.2] },
  candExcess: { courtyard: [0.05, 1.30], dunes: [0.08, 1.40], night: [0.30, 2.40] },
  candPD9Min: { courtyard: 2.2, dunes: 1.6, night: 2.2 },
  candPD9Max: 14,
  totalRatioMax: 0.62,           // courtyard + night only; dunes exempt (floor-dominated)
  heroBand: [3.2, 5.0],
  restoreDiffThresh: 4,          // ΣRGB >= 4 per §122.1: state the threshold with the count
  nonSkyZoneY: 400,              // P-F5 proxy: rows y>=400 are below every horizon in all 4 shots
};

function diffPx(imA, imB, y0, y1) {
  let n = 0;
  const w = Math.min(imA.w, imB.w);
  for (let y = y0; y < Math.min(y1, imA.h, imB.h); y++) for (let x = 0; x < w; x++) {
    const i = (y * imA.w + x) * imA.ch, j = (y * imB.w + x) * imB.ch;
    const d = Math.abs(imA.data[i] - imB.data[j]) + Math.abs(imA.data[i + 1] - imB.data[j + 1]) + Math.abs(imA.data[i + 2] - imB.data[j + 2]);
    if (d >= SEAL.restoreDiffThresh) n++;
  }
  return n;
}

function runScore(dir) {
  console.log(`\n══ SCORE — ${dir} vs PREREG-skynoise.md (prereg authoritative) ══`);
  const find = (shot, arm) => {
    for (const sub of ['.', 'A', 'B', 'C', 'D']) {
      const p = `${dir}/${sub}/${shot}.${arm}.png`;
      if (existsSync(p)) return p;
    }
    return null;
  };
  for (const shot of ['courtyard', 'night', 'dunes', 'hero']) {
    const rect = SEAL.scoreRect[shot], thresh = SEAL.maskThresh[shot];
    const arms = {};
    for (const arm of ['base', 'cand', 'flat', 'restore']) {
      const p = find(shot, arm);
      if (!p) continue;
      const im = readPNG(p);
      const grid = lumaGrid(im, rect);
      const mask = darkMask(grid, thresh);
      arms[arm] = { p, im, st: stats(grid, mask), pd: pd9(grid, mask) };
    }
    if (!Object.keys(arms).length) { console.log(`  ${shot}: no frames found`); continue; }
    console.log(`  ${shot} rect ${JSON.stringify(rect)} mask<${thresh}:`);
    for (const [arm, a] of Object.entries(arms)) {
      console.log(`    ${arm.padEnd(8)} hf ${a.st.hf.toFixed(2).padStart(6)}  PD9 ${a.pd.pd9.toFixed(2).padStart(6)}  sd ${a.st.sd.toFixed(2)}  (${a.p})`);
    }
    const V = [];
    if (arms.base && SEAL.baseGateMin[shot] !== undefined) {
      const ok = arms.base.st.hf >= SEAL.baseGateMin[shot];
      V.push(`base gate hf>=${SEAL.baseGateMin[shot]}: ${ok ? 'PASS' : 'FAIL → P-F3 CAPTURE VOID'}`);
    }
    if (arms.flat) {
      const okp = arms.flat.pd.pd9 < SEAL.flatPD9Max;
      V.push(`flat PD9<${SEAL.flatPD9Max} (poster arm must fail structure): ${okp ? 'PASS (arm reads as its own failure — correct)' : 'FAIL → metric did not separate → UNSCOREABLE'}`);
      const b = SEAL.flatHfBand[shot];
      if (b) V.push(`flat hf in [${b}]: ${arms.flat.st.hf >= b[0] && arms.flat.st.hf <= b[1] ? 'PASS' : 'OUT → floor model wrong, say so in RESULT'}`);
    }
    if (arms.cand && arms.flat && SEAL.candExcess[shot]) {
      const ex = arms.cand.st.hf - arms.flat.st.hf;
      const [lo, hi] = SEAL.candExcess[shot];
      V.push(`cand excess ${ex.toFixed(2)} in [${lo}, ${hi}]: ${ex >= lo && ex <= hi ? 'PASS' : 'FAIL → P-F1 REVERT'}`);
      const pmin = SEAL.candPD9Min[shot];
      V.push(`cand PD9 ${arms.cand.pd.pd9.toFixed(2)} in [${pmin}, ${SEAL.candPD9Max}]: ${arms.cand.pd.pd9 >= pmin && arms.cand.pd.pd9 <= SEAL.candPD9Max ? 'PASS' : 'FAIL → P-F2 REVERT (poster or foreign structure)'}`);
      if (arms.base && (shot === 'courtyard' || shot === 'night')) {
        const r = arms.cand.st.hf / arms.base.st.hf;
        V.push(`cand/base total ${r.toFixed(2)} <= ${SEAL.totalRatioMax}: ${r <= SEAL.totalRatioMax ? 'PASS' : 'FAIL'}`);
      }
    }
    if (shot === 'hero' && arms.cand) {
      const [lo, hi] = SEAL.heroBand;
      V.push(`hero cand hf in [${lo}, ${hi}]: ${arms.cand.st.hf >= lo && arms.cand.st.hf <= hi ? 'PASS' : 'FAIL → regression'}`);
    }
    if (arms.base && arms.restore) {
      const n = diffPx(arms.base.im, arms.restore.im, 0, arms.base.im.h);
      V.push(`restore-vs-base diff ${n} px at ΣRGB>=${SEAL.restoreDiffThresh}: ${n === 0 ? 'PASS (bit-identical)' : 'FAIL → P-F4 ALL ARM NUMBERS VOID'}`);
    }
    if (arms.base && arms.cand) {
      const zone = arms.base.im.h - SEAL.nonSkyZoneY;
      const n = diffPx(arms.base.im, arms.cand.im, SEAL.nonSkyZoneY, arms.base.im.h);
      const pct = 100 * n / (zone * arms.base.im.w);
      V.push(`cand-vs-base non-sky proxy (y>=${SEAL.nonSkyZoneY}) ${n} px = ${pct.toFixed(3)}%: ${pct <= 0.2 ? 'PASS' : 'FAIL → P-F5 coupling, investigate'}`);
    }
    for (const v of V) console.log(`      ${v}`);
    console.log('      P7 (eyeball at stated zoom) and P-F6 (seam scan) are human steps — do them.');
  }
}

/* ══════════════════ AMENDMENT: section swirlscore (PREREG-skyswirl.md) ══════════════════
 * Scores a landed skyswirl1 capture. PREREG-skyswirl.md is AUTHORITATIVE; SEAL2 is a
 * sealed convenience mirror — if they disagree, the prereg wins and this table is the bug.
 * Expects <dir>/<chunk>/<shot>.<arm>.png, arms base|cand|kb|restore (dunes, night) and
 * base|cand|restore (courtyard, hero). */
const SEAL2 = {
  rect: { dunes: [920, 0, 1115, 45], night: [1150, 90, 1275, 205], courtyard: [850, 0, 1150, 55], hero: [340, 2, 700, 50] },
  mask: { dunes: null, night: null, courtyard: null, hero: 60 },
  baseGate: { dunes: [4.2, 5.2], night: [3.3, 4.4] },          // P-F3 outside
  baseMinusKbMin: { dunes: 0.55, night: 0.80 },                 // known-bad separation
  kbBand: { dunes: [3.4, 4.2], night: [1.4, 2.6] },             // out => floor model wrong, say so
  candExcess: { dunes: [0.08, 0.55], night: [0.00, 0.45] },     // P1 / P3 (excess = arm − kb)
  dunesTotalDropMin: 0.35,                                      // P2: base − cand >= this
  nightTotalRatioMax: 0.75,                                     // P3 total: cand <= 0.75 * base
  pd9KbRatioMax: 0.6,                                           // P4: PD9(kb) <= 0.6 * PD9(base)
  heroBase: [3.5, 4.1], heroCand: [3.2, 4.1],                   // P6
  restoreDiffThresh: 4,                                         // P-F4 (§122.1: state the threshold)
  nonSkyZoneY: 400,                                             // P-F5 proxy zone
};

function runSwirlScore(dir) {
  console.log(`\n══ SWIRLSCORE — ${dir} vs PREREG-skyswirl.md (prereg authoritative) ══`);
  const find = (shot, arm) => {
    for (const sub of ['.', 'A', 'B', 'C']) {
      const p = `${dir}/${sub}/${shot}.${arm}.png`;
      if (existsSync(p)) return p;
    }
    return null;
  };
  const load = (shot, arm) => {
    const p = find(shot, arm);
    if (!p) return null;
    const im = readPNG(p);
    const grid = lumaGrid(im, SEAL2.rect[shot]);
    const mask = darkMask(grid, SEAL2.mask[shot]);
    return { p, im, st: stats(grid, mask), pd: pd9(grid, mask) };
  };
  for (const shot of ['dunes', 'night']) {
    const arms = {};
    for (const arm of ['base', 'cand', 'kb', 'restore']) { const a = load(shot, arm); if (a) arms[arm] = a; }
    if (!Object.keys(arms).length) { console.log(`  ${shot}: no frames found`); continue; }
    console.log(`  ${shot} rect ${JSON.stringify(SEAL2.rect[shot])} mask ${SEAL2.mask[shot] ?? 'none'}:`);
    for (const [arm, a] of Object.entries(arms)) console.log(`    ${arm.padEnd(8)} hf ${a.st.hf.toFixed(2).padStart(6)}  PD9 ${a.pd.pd9.toFixed(2).padStart(6)}  sd ${a.st.sd.toFixed(2)}  (${a.p})`);
    const V = [];
    if (arms.base) {
      const [lo, hi] = SEAL2.baseGate[shot];
      V.push(`base gate hf in [${lo}, ${hi}]: ${arms.base.st.hf >= lo && arms.base.st.hf <= hi ? 'PASS' : 'FAIL → P-F3 CAPTURE VOID'}`);
    }
    if (arms.base && arms.kb) {
      const sep = arms.base.st.hf - arms.kb.st.hf;
      V.push(`base − kb = ${sep.toFixed(2)} >= ${SEAL2.baseMinusKbMin[shot]}: ${sep >= SEAL2.baseMinusKbMin[shot] ? 'PASS' : 'FAIL → known-bads did not separate → P-F7 UNSCOREABLE'}`);
      const [klo, khi] = SEAL2.kbBand[shot];
      V.push(`kb hf in [${klo}, ${khi}]: ${arms.kb.st.hf >= klo && arms.kb.st.hf <= khi ? 'PASS' : 'OUT → floor model wrong, say so in RESULT (excess stays computable)'}`);
      const r = arms.kb.pd.pd9 / Math.max(1e-9, arms.base.pd.pd9);
      V.push(`P4 PD9(kb)/PD9(base) ${r.toFixed(2)} <= ${SEAL2.pd9KbRatioMax}: ${r <= SEAL2.pd9KbRatioMax ? 'PASS' : 'FAIL'}`);
    }
    if (arms.cand && arms.kb) {
      const ex = arms.cand.st.hf - arms.kb.st.hf;
      const [lo, hi] = SEAL2.candExcess[shot];
      V.push(`cand excess (cand − kb) ${ex.toFixed(2)} in [${lo}, ${hi}]: ${ex >= lo && ex <= hi ? 'PASS' : ex > hi ? 'FAIL → P-F1 REVERT' : 'FAIL → P-F2 REVERT (over-corrected to poster)'}`);
      if (arms.base && shot === 'dunes') {
        const drop = arms.base.st.hf - arms.cand.st.hf;
        V.push(`P2 base − cand = ${drop.toFixed(2)} >= ${SEAL2.dunesTotalDropMin}: ${drop >= SEAL2.dunesTotalDropMin ? 'PASS' : 'FAIL'}`);
        const ordered = arms.kb.pd.pd9 < arms.cand.pd.pd9 && arms.cand.pd.pd9 < arms.base.pd.pd9;
        V.push(`P4 PD9 strict order kb ${arms.kb.pd.pd9.toFixed(2)} < cand ${arms.cand.pd.pd9.toFixed(2)} < base ${arms.base.pd.pd9.toFixed(2)}: ${ordered ? 'PASS' : 'FAIL'}`);
      }
      if (arms.base && shot === 'night') {
        const r = arms.cand.st.hf / arms.base.st.hf;
        V.push(`night total cand/base ${r.toFixed(2)} <= ${SEAL2.nightTotalRatioMax}: ${r <= SEAL2.nightTotalRatioMax ? 'PASS' : 'FAIL'}`);
      }
    }
    if (arms.base && arms.restore) {
      const n = diffPx(arms.base.im, arms.restore.im, 0, arms.base.im.h);
      V.push(`restore-vs-base diff ${n} px at ΣRGB>=${SEAL2.restoreDiffThresh}: ${n === 0 ? 'PASS (bit-identical)' : 'FAIL → P-F4 ALL ARM NUMBERS IN THIS BOOT VOID'}`);
    }
    if (arms.base && arms.cand) {
      const zone = arms.base.im.h - SEAL2.nonSkyZoneY;
      const n = diffPx(arms.base.im, arms.cand.im, SEAL2.nonSkyZoneY, arms.base.im.h);
      const pct = 100 * n / (zone * arms.base.im.w);
      V.push(`cand-vs-base non-sky proxy (y>=${SEAL2.nonSkyZoneY}) ${n} px = ${pct.toFixed(3)}%: ${pct <= 0.2 ? 'PASS' : 'FAIL → P-F5 coupling, investigate'}`);
    }
    for (const v of V) console.log(`      ${v}`);
    console.log('      P7 (eyeball, registered words, stated zoom) and P-F8 (seam scan) are human steps — do them.');
  }
  { // courtyard null (P5 / P-F6) — bit-exact inside the rect
    const base = load('courtyard', 'base'), cand = load('courtyard', 'cand'), rest = load('courtyard', 'restore');
    if (base && cand) {
      const [x0, y0, x1, y1] = SEAL2.rect.courtyard;
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * base.im.w + x) * base.im.ch, j = (y * cand.im.w + x) * cand.im.ch;
        const d = Math.abs(base.im.data[i] - cand.im.data[j]) + Math.abs(base.im.data[i + 1] - cand.im.data[j + 1]) + Math.abs(base.im.data[i + 2] - cand.im.data[j + 2]);
        if (d >= SEAL2.restoreDiffThresh) n++;
      }
      console.log(`  courtyard P5 null: cand-vs-base inside ${JSON.stringify(SEAL2.rect.courtyard)} = ${n} px at ΣRGB>=${SEAL2.restoreDiffThresh}: ${n === 0 ? 'PASS (bit-exact scope claim holds)' : 'FAIL → P-F6 REVERT (term not scoped as designed)'}`);
      if (rest) {
        const r = diffPx(base.im, rest.im, 0, base.im.h);
        console.log(`  courtyard restore-vs-base ${r} px: ${r === 0 ? 'PASS' : 'FAIL → P-F4'}`);
      }
    } else console.log('  courtyard: null-pair frames not found (chunk B)');
  }
  { // hero regression (P6)
    const base = load('hero', 'base'), cand = load('hero', 'cand');
    if (base && cand) {
      const [blo, bhi] = SEAL2.heroBase, [clo, chi] = SEAL2.heroCand;
      console.log(`  hero base hf ${base.st.hf.toFixed(2)} in [${blo}, ${bhi}]: ${base.st.hf >= blo && base.st.hf <= bhi ? 'PASS' : 'FAIL'};  cand hf ${cand.st.hf.toFixed(2)} in [${clo}, ${chi}]: ${cand.st.hf >= clo && cand.st.hf <= chi ? 'PASS' : 'FAIL → regression'}`);
    } else console.log('  hero: regression-pair frames not found (chunk B)');
  }
}

if (mode === 'frames' || mode === 'all') runFrames();
if (mode === 'grain' || mode === 'all') runGrain(C);
if (mode === 'project' || mode === 'all') runProject(C);
if (mode === 'sim' || mode === 'all') runSim(C, wantPNG);
if (mode === 'cand') runCand(C, wantPNG);
if (mode === 'swirl') runSwirl(C, wantPNG);
if (mode === 'sweep') runSweep(C);
if (mode === 'swirlcrops') runSwirlCrops(C);
if (mode === 'score') runScore(argv.find((a) => !a.startsWith('-') && a !== 'score') || `${REC}/skynoise1`);
if (mode === 'swirlscore') runSwirlScore(argv.find((a) => !a.startsWith('-') && a !== 'swirlscore') || `${REC}/skyswirl1`);

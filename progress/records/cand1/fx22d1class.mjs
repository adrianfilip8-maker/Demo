/**
 * fx22 D1a — per-pixel classification of the strict-differing pixels, for the RESULT's
 * application of D1's registered wording ("Outside the gated population the frame must be
 * bit-identical to base, 0 px").
 *
 * POST-HOC DIAGNOSTIC, not part of the sealed scorer and not a threshold move (§141.1): every
 * constant below is a registered one — the ARTEFACT backdrop precondition luma < 60 AND
 * R/B < 0.5 (PREREG-sandhigh §2, registered in graded-PNG units), and the sealed gate's own
 * soft-ramp widths 8 / 0.08 (cand1.patch TUNE, committed pre-capture) used only to LABEL how
 * far a pixel sits from the population edge. Nothing is decided here; distributions are
 * reported for the RESULT to apply the registered text.
 *
 * Method: for each strict-differing pixel (ANY byte, D1's own convention), read the GATED
 * frame's value as "behind-after" — the scorer's own convention for what is behind a removed
 * sprite (fx22an.mjs components()). Classify it against the registered backdrop rule in the
 * units the rule was registered in (graded PNG).
 *
 * Stated bias: where attenuation was partial (ramp interior, wl*wr < 1) the gated pixel still
 * carries sprite residue, which LIFTS its luma — i.e. this classification errs toward calling
 * a pixel OUT of population. It cannot manufacture in-population pixels. Where removal was
 * full (the sealed gate ships backdropMin = 0), the gated pixel is the composited backdrop
 * plus any un-gated overlapping sprites.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const D = '/home/user/Demo/shots/fx22';
const L = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];

function classify(shot, detail) {
  const A = readPNG(`${D}/${shot}.base.png`), B = readPNG(`${D}/${shot}.gated.png`);
  const W = A.w, H = A.h;
  let strict = 0, sum4 = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, maxCh = 0;
  // registered rule (graded-PNG units): luma < 60 AND R/B < 0.5
  // sealed ramp widths label the edge zone: luma in [52,60) or rb in [0.42,0.5)
  let inPop = 0, inCore = 0, inEdge = 0, out = 0;
  const outliers = [];
  const lumaHist = new Array(8).fill(0);   // 0-30,30-60,60-90,90-120,120-150,150-180,180-210,210+
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * A.ch;
    const d0 = Math.abs(A.data[o] - B.data[o]), d1 = Math.abs(A.data[o + 1] - B.data[o + 1]), d2 = Math.abs(A.data[o + 2] - B.data[o + 2]);
    if (!(d0 | d1 | d2)) continue;
    strict++;
    if (d0 + d1 + d2 >= 4) sum4++;
    maxCh = Math.max(maxCh, d0, d1, d2);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const r = B.data[o], g = B.data[o + 1], b = B.data[o + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const rb = b > 0 ? r / b : 99;
    lumaHist[Math.min(7, (lum / 30) | 0)]++;
    const inside = lum < 60 && rb < 0.5;
    if (inside) {
      inPop++;
      if (lum < 52 && rb < 0.42) inCore++; else inEdge++;
    } else {
      out++;
      const dL = L(A.data, o) - lum;
      outliers.push({ x, y, base: [A.data[o], A.data[o + 1], A.data[o + 2]], after: [r, g, b],
        lum: +lum.toFixed(1), rb: +rb.toFixed(2), dL: +dL.toFixed(2), dSum: d0 + d1 + d2 });
    }
  }
  console.log(`\n=== ${shot}: strict ${strict} px (ΣRGB>=4: ${sum4}), max single-channel Δ ${maxCh}, bbox x${x0}-${x1} y${y0}-${y1}`);
  console.log(`  behind-after vs REGISTERED backdrop rule (graded units, luma<60 AND R/B<0.5):`);
  console.log(`    IN population:  ${inPop} px (${(100 * inPop / strict).toFixed(1)} %)  [core (luma<52 & rb<0.42): ${inCore}; inside soft-ramp edge zone: ${inEdge}]`);
  console.log(`    OUT of population: ${out} px (${(100 * out / strict).toFixed(1)} %)`);
  console.log(`  behind-after luma histogram (30-wide bins from 0): [${lumaHist.join(', ')}]`);
  if (out && detail) {
    outliers.sort((a, b) => b.lum - a.lum);
    console.log(`  OUT-of-population pixels (sorted by behind-after luma, up to 40 shown):`);
    for (const p of outliers.slice(0, 40))
      console.log(`    (${p.x},${p.y}) base rgb(${p.base}) -> after rgb(${p.after})  luma ${p.lum} R/B ${p.rb}  removed dL ${p.dL >= 0 ? '+' : ''}${p.dL}  ΣΔ ${p.dSum}`);
    if (outliers.length > 40) console.log(`    ... and ${outliers.length - 40} more`);
    // cluster the outliers coarsely (16px grid) so the RESULT can name locations
    const cells = new Map();
    for (const p of outliers) {
      const k = `${(p.x / 16) | 0},${(p.y / 16) | 0}`;
      const c = cells.get(k) || { n: 0, lo: [1e9, 1e9], hi: [-1, -1] };
      c.n++; c.lo[0] = Math.min(c.lo[0], p.x); c.lo[1] = Math.min(c.lo[1], p.y);
      c.hi[0] = Math.max(c.hi[0], p.x); c.hi[1] = Math.max(c.hi[1], p.y);
      cells.set(k, c);
    }
    console.log(`  OUT pixels group into ${cells.size} 16px-grid cells:`);
    for (const [k, c] of [...cells.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20))
      console.log(`    cell ${k}: ${c.n} px, box (${c.lo[0]},${c.lo[1]})-(${c.hi[0]},${c.hi[1]})`);
  }
}

classify('courtyard', true);
classify('interior', true);
classify('night', false);   // context only — night is D4's registered population, not D1's
classify('temple', false);  // context: the treated interior, in-population share of its removals

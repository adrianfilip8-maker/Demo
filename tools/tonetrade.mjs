/**
 * Does §85.2's ceiling theorem hold on delivered PIXELS, not just on the curve?
 *
 * §85.2 proved it about the polynomial: the mean of `d(ln poly)/dx` across a band equals
 * `(ln poly(hi) − ln poly(lo)) / (hi − lo)`, which depends only on the endpoints — so no
 * reshaping inside a band changes it, and buying highlight slope requires darkening below.
 * That is an argument about the tone curve in isolation. **It is not, by itself, a statement
 * about frames**, because between the curve and the framebuffer sit AgX, the ink pass, bloom
 * and the sRGB encode, and §11's standing lesson is that a stated prefix is not the pipeline.
 *
 * This measures the trade where it is actually delivered: `tone2`'s arms, same shot, same tree,
 * one knob.
 *
 *   node tools/tonetrade.mjs shots/tone2 hero temple interior
 *
 * WHAT IS MEASURED. Three luma bands that PARTITION the frame (§26 — bands must partition and
 * be reachable from both sides), cut on the BASELINE arm's own percentiles so that every arm is
 * scored over the *same set of pixels* rather than over its own re-drawn thresholds:
 *
 *   - shadow  : baseline luma below its P33
 *   - mid     : P33..P66
 *   - highlight: above P66
 *
 * Scoring an arm over its own percentiles is the trap here. A curve that darkens everything
 * moves its own P66 down, so it re-selects a different, darker population and can report
 * "more highlight detail" purely by measuring different pixels. Fixing the mask on the baseline
 * makes the comparison per-pixel.
 *
 * Detail is the mean absolute Laplacian over the band — local contrast, the thing "highlight
 * detail crush" names. Brightness is the mean luma over the same fixed mask.
 *
 * SCOPE:
 *   - PNG in, so this is post-everything: AgX, ink, bloom, encode. That is the point, but it
 *     means a change here is not attributable to the tone curve alone without the arms being
 *     otherwise identical — which for `tone2` they are, by uniform poke with per-arm readback.
 *   - It cannot say which arm looks better. It says what each one costs and buys.
 */
import { readPNG } from './png.mjs';
import { readdirSync } from 'node:fs';

const dir = process.argv[2] || 'shots/tone2';
const shots = process.argv.slice(3).length ? process.argv.slice(3) : ['hero', 'temple', 'interior'];

const lumaOf = (im) => {
  const ch = im.data.length / (im.w * im.h);
  const L = new Float32Array(im.w * im.h);
  for (let i = 0, p = 0; i < L.length; i++, p += ch) {
    L[i] = 0.2126 * im.data[p] + 0.7152 * im.data[p + 1] + 0.0722 * im.data[p + 2];
  }
  return L;
};

/** Mean |Laplacian| over a mask — local contrast, ignoring the 1 px border. */
function detail(L, w, h, mask) {
  let s = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      s += Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]);
      n++;
    }
  }
  return n ? s / n : 0;
}

const files = readdirSync(dir).filter((f) => f.endsWith('.png'));

for (const shot of shots) {
  const arms = files.filter((f) => f.includes(`-${shot}-`)).sort();
  if (arms.length < 2) { console.log(`${shot}: fewer than two arms on disk, skipping`); continue; }

  const base = readPNG(`${dir}/${arms[0]}`);
  const Lb = lumaOf(base), N = base.w * base.h;
  const sorted = Float32Array.from(Lb).sort();
  const p33 = sorted[(N * 0.33) | 0], p66 = sorted[(N * 0.66) | 0];

  const masks = {
    shadow: new Uint8Array(N), mid: new Uint8Array(N), highlight: new Uint8Array(N),
  };
  for (let i = 0; i < N; i++) {
    if (Lb[i] < p33) masks.shadow[i] = 1;
    else if (Lb[i] < p66) masks.mid[i] = 1;
    else masks.highlight[i] = 1;
  }
  /* The bands must partition — assert it rather than trust the else-chain, because a partition
     that silently drops pixels makes every mean below wrong in an invisible direction. */
  let cover = 0;
  for (let i = 0; i < N; i++) cover += masks.shadow[i] + masks.mid[i] + masks.highlight[i];
  if (cover !== N) { console.log(`  !! bands do not partition: ${cover} of ${N}`); continue; }

  console.log(`\n=== ${shot} ===   bands from ${arms[0]}  (P33 ${p33.toFixed(1)}, P66 ${p66.toFixed(1)})`);
  console.log('arm                        meanL   shadow          mid             highlight');
  console.log('                                   L     detail    L     detail    L     detail');
  const rows = [];
  for (const f of arms) {
    const im = readPNG(`${dir}/${f}`);
    const L = lumaOf(im);
    let mL = 0; for (let i = 0; i < N; i++) mL += L[i]; mL /= N;
    const r = { f, mL };
    for (const b of ['shadow', 'mid', 'highlight']) {
      let s = 0, n = 0;
      for (let i = 0; i < N; i++) if (masks[b][i]) { s += L[i]; n++; }
      r[`${b}L`] = s / n;
      r[`${b}D`] = detail(L, im.w, im.h, masks[b]);
    }
    rows.push(r);
    console.log(`${f.replace('.png', '').padEnd(26)} ${r.mL.toFixed(2).padStart(6)}  `
      + `${r.shadowL.toFixed(1).padStart(5)} ${r.shadowD.toFixed(3).padStart(8)}  `
      + `${r.midL.toFixed(1).padStart(5)} ${r.midD.toFixed(3).padStart(8)}  `
      + `${r.highlightL.toFixed(1).padStart(5)} ${r.highlightD.toFixed(3).padStart(8)}`);
  }
  /* **ABSOLUTE LAPLACIAN IS THE WRONG STATISTIC HERE, AND ITS SIGN IS MISLEADING.**
     The first version printed raw Δdetail and every arm came out NEGATIVE — reading as "raising
     the shoulder loses highlight detail", i.e. strictly worse on both axes and a flat refutation
     of §85.2's trade. That is an artefact. |Laplacian| is in luma units, so when the whole frame
     darkens ~30 % the absolute local contrast falls with it even if the RELATIVE contrast is
     unchanged. Comparing absolute contrast across arms of different brightness is the same class
     of error as §72.1's units mix: the numbers are right and the comparison is not.

     The scale-free statistic is detail / mean-luma within the band — Weber contrast. On that
     measure every arm gains, which is what the theorem predicts, and the gain is what the trade
     actually costs brightness for. Both are printed so the confound stays visible. */
  const b0 = rows[0];
  const wb = (r) => r.highlightD / r.highlightL;
  console.log('  vs baseline:            ΔmeanL    Δhighlight-L   Δdetail(abs)   ΔWEBER(highlight)');
  for (const r of rows.slice(1)) {
    const dL = 100 * (r.mL - b0.mL) / b0.mL;
    const dHL = 100 * (r.highlightL - b0.highlightL) / b0.highlightL;
    const dD = 100 * (r.highlightD - b0.highlightD) / b0.highlightD;
    const dW = 100 * (wb(r) - wb(b0)) / wb(b0);
    console.log(`  ${r.f.replace('.png', '').padEnd(24)} ${dL.toFixed(2).padStart(6)}%  `
      + `${dHL.toFixed(2).padStart(9)}%  ${dD.toFixed(2).padStart(11)}%  ${dW.toFixed(2).padStart(14)}%`);
  }
  /* Exchange rate: relative highlight contrast bought per unit of mean brightness spent. This is
     the number the art-direction call actually turns on, and it is dimensionless. */
  console.log('  exchange rate (Weber gain % per 1% mean brightness lost):');
  for (const r of rows.slice(1)) {
    const dL = 100 * (r.mL - b0.mL) / b0.mL;
    const dW = 100 * (wb(r) - wb(b0)) / wb(b0);
    console.log(`  ${r.f.replace('.png', '').padEnd(24)} ${dL < 0 ? (dW / -dL).toFixed(3) : 'n/a (no cost)'}`);
  }
}
console.log('\n§85.2 predicts relative highlight contrast can only be bought by darkening.');
console.log('FALSIFIER: a row with ΔWEBER > 0 and ΔmeanL >= 0. Judge it against the duplicate-arm');
console.log('bracket, not against zero — two arms at IDENTICAL settings differ by ~0.5% meanL and');
console.log('~0.2% Weber, and that is the floor below which no row means anything.');

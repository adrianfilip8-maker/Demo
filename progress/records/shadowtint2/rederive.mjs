/**
 * rederive.mjs — §342.2's arithmetic, redone against §344's MEASURED `key` instead of an assumed
 * zero. Pure CPU arithmetic on already-committed frames. No boot, no capture, no `src` change,
 * no capture lock. Reproducible from a checkout with:
 *
 *     node progress/records/shadowtint2/rederive.mjs
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────
 *
 * NOT a re-score of PREREG-keyprobe. That seal VOIDed on `PF_KEY_LO` and stays VOID: the bar was
 * registered on the mean over the registered rect, that mean measured 0.0281, and 0.0281 > 0.02.
 * Nothing here moves a bar, re-draws a rect, or reads `K1` (§141.1).
 *
 * It DELIBERATELY computes no new statistic on `SHADE_R`'s `key`. That rect is the one under
 * test; the distribution of `key` inside it IS the question `K1` was registered to answer, and
 * §344 asks the successor to derive a new negative-control bar from a measured distribution.
 * Publishing a distribution on the rect under test would leave that re-seal no bar it could
 * register without violating §141.1. `SHADE_R` enters below only through the mean §344 already
 * committed (`key` 0.1017, derived `sh` 0.4908), used as a raw instrument reading and never as a
 * verdict on whether that face is keyed — which stays NOT CLAIMED. Its DISPLAY-side R/G is
 * measured here, because that is §336's published quantity and its provenance is at issue.
 *
 * ── THE TWO FRAMES, AND WHY BOTH ─────────────────────────────────────────────────────────────
 *
 *   shots/r12/courtyard.png                     every R/G figure in §336/§341/§342.x
 *   progress/records/keyprobe1/courtyard.*.png  every `key` figure in §344
 *
 * Different captures, two days apart. Every suppression figure in §342.1/§342.2 pairs an R/G off
 * the first with a lighting state asserted about the second, and no record checks that the two
 * describe one scene state. §5 checks it the way §341 says to — reproduce the statistic, not the
 * bytes. §6 then re-measures inside the keyprobe capture alone, so R/G and `key` come from one
 * boot and one pixel population for the first time on this item.
 */
import { readPNG } from '../../../tools/png.mjs';
import { hsv, lum } from '../shadowtint/measure.mjs';
import { scan } from '../shadowtint/patches.mjs';
import { vig, hsvLin } from '../shadowtint/space.mjs';
import { unGrade } from '../shadowtint/invchain.mjs';

const ROOT = '/home/user/Demo';
const KP = `${ROOT}/progress/records/keyprobe1`;
const say = console.log;
const rule = (c = '-') => say(c.repeat(104));

/* PREREG-keyprobe §2, verbatim from shadowtint/roi.json — not re-drawn (§141.1). */
const RECTS = {
  SHADE_R: { roi: [1020, 260, 90, 130], cls: 'shade-terminator' },
  CAST_L: { roi: [70, 150, 280, 300], cls: 'shade-cast' },
  LIT_R: { roi: [872, 300, 60, 210], cls: 'lit' },
  GROUND: { roi: [380, 600, 520, 110], cls: 'both' },
};
/* §336's own headline ROI, from the same roi.json. */
const BODY_ALL = [870, 250, 300, 370];
/* Sub-boxes INSIDE colossus-L's large flat mauve face, chosen by looking at a 2x crop of the
   CAST_L rect (tools/crop.mjs 70 150 280 300 2) — a SPATIAL criterion, picked before any R/G in
   them was computed. They exist because the CAST_L rect is demonstrably not one surface. */
const BODY_BOXES = [[120, 255, 120, 60], [150, 330, 100, 50], [100, 290, 80, 60]];
/* The cool block face at the right of the same rect, on the far side of an ink line and an
   edge highlight, where most of the rect's key==0 flat patches live. */
const RIGHT_BOX = [300, 395, 45, 30];

const t5 = readPNG(`${KP}/courtyard.term5.png`);
const t6 = readPNG(`${KP}/courtyard.term6.png`);
const cal = readPNG(`${KP}/courtyard.cal.png`);
const kpOff = readPNG(`${KP}/courtyard.off.png`);
const r12 = readPNG(`${ROOT}/shots/r12/courtyard.png`);
const px = (im, x, y) => { const o = (y * im.w + x) * im.ch; return [im.data[o], im.data[o + 1], im.data[o + 2]]; };
/* A pixel no debug-term draw covers keeps the same value in every arm. Its blue channel is not
   `key` at all — it is whatever the non-toon passes left in the buffer. */
const isBg = (x, y) => {
  const a = px(cal, x, y), b = px(t5, x, y), c = px(t6, x, y);
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[0] === c[0] && a[1] === c[1] && a[2] === c[2];
};
/* Local 3x3 spread, to drop ink / silhouette / FXAA pixels the display inverse does not model. */
function localSd(im, x, y) {
  let s = [0, 0, 0], q = [0, 0, 0], n = 0;
  for (let j = y - 1; j <= y + 1; j++) for (let i = x - 1; i <= x + 1; i++) {
    const p = px(im, i, j); for (let c = 0; c < 3; c++) { s[c] += p[c]; q[c] += p[c] * p[c]; } n++;
  }
  return Math.max(...[0, 1, 2].map((c) => Math.sqrt(Math.max(0, q[c] / n - (s[c] / n) ** 2))));
}
/** Aggregate a list of display triples into one sample and carry it back to scene-linear. */
function invertMean(im, pxs, cx, cy) {
  if (!pxs.length) return null;
  const mean = [0, 1, 2].map((c) => pxs.reduce((a, p) => a + p[c], 0) / pxs.length);
  const r = unGrade(mean.map((z) => z / vig(cx, cy, im.w, im.h)));
  return { n: pxs.length, mean, lin: r.scene, RG: r.scene[0] / Math.max(r.scene[1], 1e-9), BG: r.scene[2] / Math.max(r.scene[1], 1e-9), L: lum(mean), hD: hsv(mean).h, hL: hsvLin(r.scene).h, flags: r.flags };
}
const fmt = (a) => a ? `${String(a.n).padStart(6)}px  #${a.mean.map((z) => Math.round(z).toString(16).padStart(2, '0')).join('')} h${a.hD.toFixed(0).padStart(4)} L${a.L.toFixed(0).padStart(4)}  lin ${a.lin.map((z) => z.toFixed(4).padStart(7)).join(' ')}  R/G ${a.RG.toFixed(2).padStart(5)}  B/G ${a.BG.toFixed(2).padStart(5)}${a.flags?.length ? '  ' + a.flags.join(',') : ''}` : '(no sample)';
function boxFlat(im, [x0, y0, w, h], pred = null) {
  const out = [];
  for (let j = y0; j < y0 + h; j++) for (let i = x0; i < x0 + w; i++) {
    if (localSd(im, i, j) > 3) continue;
    if (pred && !pred(i, j)) continue;
    out.push(px(im, i, j));
  }
  return invertMean(im, out, x0 + w / 2, y0 + h / 2);
}

say('');
say('rederive.mjs — §342.2 re-derived against measured `key`.  Offline: no capture, no boot, no src change.');
say(`  keyprobe1 arms  ${t5.w}x${t5.h}   shots/r12/courtyard.png  ${r12.w}x${r12.h}`);
if (t5.w !== r12.w || t5.h !== r12.h) { say('  !! dimensions differ — the rects do not address the same pixels.'); process.exit(2); }

/* ═══ 1 ════════════════════════════════════════════════════════════════════════════════════════ */
rule('=');
say('1. §344\'s rect table RE-COMPUTED from the committed term5 frame — a transcription check');
rule();
say('   rect      class               ramp     ndl     key   sh=key/ramp      committed in §344');
const M = {};
for (const [id, r] of Object.entries(RECTS)) {
  const [x, y, w, h] = r.roi;
  let s = [0, 0, 0], n = 0, shs = 0, shn = 0;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const p = px(t5, i, j); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++;
    const ramp = p[0] / 255; if (ramp > 0.02) { shs += (p[2] / 255) / ramp; shn++; }
  }
  M[id] = { ramp: s[0] / n / 255, ndl: s[1] / n / 255, key: s[2] / n / 255, sh: shn ? shs / shn : null, n };
  const C = { SHADE_R: '0.1408 0.1013 0.1017  0.4908', CAST_L: '0.0684 0.0300 0.0281  0.1768', LIT_R: '0.8532 0.7823 0.5382  0.6172', GROUND: '0.7735 0.4183 0.3010  0.3608' }[id];
  say(`   ${id.padEnd(9)} ${r.cls.padEnd(18)} ${M[id].ramp.toFixed(4)}  ${M[id].ndl.toFixed(4)}  ${M[id].key.toFixed(4)}      ${M[id].sh.toFixed(4)}      ${C}`);
}

/* ═══ 2 ════════════════════════════════════════════════════════════════════════════════════════
 * toon.glsl.js:583  float shadowMix = 1.0 - key;   and :757-759 multiplies every shade-side term
 * by it; :622 says so in prose. FULL AUTHORITY means shadowMix == 1, i.e. key == 0 exactly —
 * NOT sh == 0. `sh` is one factor of key = ramp * sh (:528); a surface with sh > 0 is still at
 * full authority wherever ramp == 0. §342.2 inherited a claim about `sh` and spent it as if it
 * were a claim about `key`.                                                                    */
rule('=');
say('2. WASH AUTHORITY = shadowMix = 1 - key    (toon.glsl.js:583 / :622 / :757-759 — read, not modelled)');
rule();
say('   rect       mean key   authority = 1-key    shortfall');
for (const id of ['CAST_L', 'SHADE_R', 'GROUND', 'LIT_R']) {
  say(`   ${id.padEnd(9)}  ${M[id].key.toFixed(4)}     ${(1 - M[id].key).toFixed(4)} (${(100 * (1 - M[id].key)).toFixed(2)}%)      ${(100 * M[id].key).toFixed(2)}%`);
}

/* ═══ 3 ════════════════════════════════════════════════════════════════════════════════════════ */
rule('=');
say('3. CAST_L decomposed — what the rect mean of 0.0281 is a mean OF');
rule();
{
  const [x, y, w, h] = RECTS.CAST_L.roi;
  let n = 0, bg = 0, fgSum = 0, zero = 0; const ks = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    n++; if (isBg(i, j)) { bg++; continue; }
    const b = px(t5, i, j)[2]; fgSum += b; ks.push(b); if (b === 0) zero++;
  }
  ks.sort((a, b) => a - b);
  const q = (f) => ks[Math.min(ks.length - 1, Math.floor(f * ks.length))] / 255;
  const fgMean = fgSum / ks.length / 255;
  say(`   pixels in rect                        ${n}`);
  say(`   BACKGROUND (identical in all 3 arms)  ${bg} = ${(100 * bg / n).toFixed(2)}% — blue channel there is not \`key\``);
  say(`   mean key, WHOLE rect                  ${M.CAST_L.key.toFixed(4)}   <- the statistic §344 scored`);
  say(`   mean key, SURFACE pixels only         ${fgMean.toFixed(4)}   <- the statistic about the surface`);
  say(`     background supplies ${(100 * (M.CAST_L.key - fgMean) / M.CAST_L.key).toFixed(1)}% of the scored mean.`);
  say(`   surface pixels at key == 0            ${zero} = ${(100 * zero / ks.length).toFixed(1)}% — these ARE at full authority`);
  say(`   key percentiles, surface pixels       p50 ${q(0.50).toFixed(4)}  p75 ${q(0.75).toFixed(4)}  p90 ${q(0.90).toFixed(4)}  p95 ${q(0.95).toFixed(4)}  p99 ${q(0.99).toFixed(4)}`);
  say('     bimodal: a majority at exactly zero and a small hard-keyed tail. The mean sits where');
  say('     almost none of the rect is, so no single `sh` describes this control.');
  /* the other cast-shadow-bearing control, for scale — NOT the rect under test */
  const [gx, gy, gw, gh] = RECTS.GROUND.roi;
  let gz = 0, gn = 0;
  for (let j = gy; j < gy + gh; j++) for (let i = gx; i < gx + gw; i++) {
    if (isBg(i, j)) continue; gn++; if (px(t5, i, j)[2] === 0) gz++;
  }
  say(`   GROUND, same statistic          surface pixels at key == 0: ${(100 * gz / gn).toFixed(1)}%`);
}

/* ═══ 4 ════════════════════════════════════════════════════════════════════════════════════════ */
rule('=');
say('4. FRAME EQUIVALENCE — do the two captures describe one scene state? (§341: reproduce the statistic)');
rule();
say('   flat pixels (local 3x3 sd <= 3) over each region, inverted to scene-linear');
for (const [nm, roi] of [['colossus-L body box 1', BODY_BOXES[0]], ['colossus-L body box 2', BODY_BOXES[1]],
  ['colossus-L body box 3', BODY_BOXES[2]], ['colossus-L right block', RIGHT_BOX],
  ['CAST_L  (whole rect)', RECTS.CAST_L.roi], ['SHADE_R (whole rect)', RECTS.SHADE_R.roi],
  ['LIT_R   (whole rect)', RECTS.LIT_R.roi], ['colossus-R body-all', BODY_ALL], ['GROUND  (whole rect)', RECTS.GROUND.roi]]) {
  const a = boxFlat(r12, roi), b = boxFlat(kpOff, roi);
  const dR = a && b ? (b.RG / a.RG) : NaN;
  say(`   ${nm.padEnd(23)} r12       ${fmt(a)}`);
  say(`   ${''.padEnd(23)} keyprobe1 ${fmt(b)}   R/G ratio ${dR.toFixed(2)}x`);
}
say('');
say('   Left of frame reproduces to 4 decimal places. The colossus-R rects do not.');
say('');
say('   The same test on §336\'s OWN statistic — darkest 12% of clean 10x10 patches, sd <= 3:');
{
  const d12 = (im, roi) => {
    const list = scan(im, ...roi, 10, 3.0);
    if (!list.length) return null;
    const sel = list.slice(0, Math.max(1, Math.round(list.length * 0.12)));
    const mean = [0, 1, 2].map((c) => sel.reduce((a, p) => a + p.mean[c], 0) / sel.length);
    const v = sel.reduce((a, p) => a + vig(p.x, p.y, im.w, im.h), 0) / sel.length;
    const r = unGrade(mean.map((z) => z / v));
    return { n: sel.length, mean, lin: r.scene, RG: r.scene[0] / Math.max(r.scene[1], 1e-9), BG: r.scene[2] / Math.max(r.scene[1], 1e-9), L: lum(mean), hD: hsv(mean).h, flags: r.flags };
  };
  for (const [nm, roi] of [['colossus-R body-all (§336\'s 3.74)', BODY_ALL], ['SHADE_R', RECTS.SHADE_R.roi], ['CAST_L (§342.2\'s 1.02)', RECTS.CAST_L.roi], ['GROUND (§336\'s 0.52)', RECTS.GROUND.roi]]) {
    const a = d12(r12, roi), b = d12(kpOff, roi);
    say(`     ${nm.padEnd(34)} r12 R/G ${a.RG.toFixed(2).padStart(5)} (L${a.L.toFixed(0)}, h${a.hD.toFixed(0)})   keyprobe1 R/G ${b.RG.toFixed(2).padStart(5)} (L${b.L.toFixed(0)}, h${b.hD.toFixed(0)})`);
  }
}
say('');
say('   WHERE the two frames differ — mean max-channel |r12 - keyprobe1|, 160x120 cells:');
for (let by = 0; by < 6; by++) {
  let row = '';
  for (let bx = 0; bx < 8; bx++) {
    let s = 0, n = 0;
    for (let j = by * 120; j < (by + 1) * 120; j += 2) for (let i = bx * 160; i < (bx + 1) * 160; i += 2) {
      const a = px(r12, i, j), b = px(kpOff, i, j); n++;
      s += Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    }
    row += String(Math.round(s / n)).padStart(5);
  }
  say(`     y ${String(by * 120).padStart(3)}:${row}`);
}
say('   and the SKY, which fixes time of day and key elevation:');
for (const [nm, x, y] of [['top-left', 40, 20], ['top-mid', 600, 20], ['top-right', 1200, 20]]) {
  const o = [];
  for (const [lbl, im] of [['r12', r12], ['keyprobe1', kpOff]]) {
    let s = [0, 0, 0], n = 0;
    for (let j = y; j < y + 20; j++) for (let i = x; i < x + 20; i++) { const p = px(im, i, j); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; }
    const m = s.map((z) => z / n);
    o.push(`${lbl} #${m.map((z) => Math.round(z).toString(16).padStart(2, '0')).join('')} h${hsv(m).h.toFixed(0)} L${lum(m).toFixed(1)}`);
  }
  say(`     sky ${nm.padEnd(10)} ${o.join('   ')}`);
}
say('   The sky is unchanged and the left third is unchanged; the difference is confined to the');
say('   centre-right. Whatever moved, it did not move the sun and it did not move the camera.');

/* ═══ 5 ════════════════════════════════════════════════════════════════════════════════════════
 * The re-derivation proper: §342.2's own statistics, each paired with the `key` of the exact
 * pixel population it was computed over — inside one capture.                                  */
rule('=');
say('5. §342.2\'s OWN statistics, each with the co-registered `key` of the population it was measured over');
rule();
{
  const list = scan(kpOff, ...RECTS.CAST_L.roi, 10, 3.0);
  const patchKey = (p) => {
    let s = 0, n = 0, mx = 0, bg = 0;
    for (let j = p.y; j < p.y + 10; j++) for (let i = p.x; i < p.x + 10; i++) {
      if (isBg(i, j)) bg++;
      const b = px(t5, i, j)[2]; s += b; n++; mx = Math.max(mx, b);
    }
    return { mean: s / n / 255, max: mx / 255, bg };
  };
  const aggPatches = (sel) => {
    if (!sel.length) return null;
    const mean = [0, 1, 2].map((c) => sel.reduce((a, p) => a + p.mean[c], 0) / sel.length);
    const v = sel.reduce((a, p) => a + vig(p.x, p.y, kpOff.w, kpOff.h), 0) / sel.length;
    const r = unGrade(mean.map((z) => z / v));
    const k = sel.reduce((a, p) => a + patchKey(p).mean, 0) / sel.length;
    return { n: sel.length, mean, lin: r.scene, RG: r.scene[0] / Math.max(r.scene[1], 1e-9), BG: r.scene[2] / Math.max(r.scene[1], 1e-9), L: lum(mean), hD: hsv(mean).h, key: k, flags: r.flags };
  };
  const row = (lbl, a) => say(`   ${lbl.padEnd(34)} ${a ? `${String(a.n).padStart(4)}pat  L${a.L.toFixed(0).padStart(4)} h${a.hD.toFixed(0).padStart(4)}  R/G ${a.RG.toFixed(2).padStart(5)}  B/G ${a.BG.toFixed(2).padStart(5)}   mean key ${a.key.toFixed(4)}   authority ${(100 * (1 - a.key)).toFixed(2)}%` : '(none)'}`);
  const k12 = Math.max(1, Math.round(list.length * 0.12));
  row('DARK 12%  (§342.2\'s "1.02" end)', aggPatches(list.slice(0, k12)));
  for (const L of [55, 65, 75, 85]) {
    const sel = list.filter((p) => Math.abs(p.L - L) <= 2);
    row(`display L ${L} +/-2 bin`, aggPatches(sel));
  }
  say('');
  say('   The rect mean key is 0.0281. The population §342.2 read "1.02" off carries key 0.0016 —');
  say('   17x lower. R/G and key were never computed over the same pixels, in any record.');
  say('');
  say('   Same patches, binned by their OWN measured key:');
  const bins = [[0, 0, 'key == 0 exactly'], [1e-9, 0.01, '0 < key <= 0.01'], [0.01, 0.05, '0.01 < key <= 0.05'],
    [0.05, 0.20, '0.05 < key <= 0.20'], [0.20, 1.01, 'key > 0.20']];
  for (const [lo, hi, lbl] of bins) {
    const sel = list.filter((p) => { const k = patchKey(p); if (k.bg > 0) return false; return lo === 0 && hi === 0 ? k.max === 0 : (k.mean > lo && k.mean <= hi); });
    row(lbl, aggPatches(sel));
  }
  say('');
  {
    const worst = list.reduce((a, p) => Math.max(a, patchKey(p).mean), 0);
    say(`   EVERY one of the ${list.length} clean patches in CAST_L carries key <= ${worst.toFixed(4)} — authority >= ${(100 * (1 - worst)).toFixed(1)}%.`);
    say('   The sd<=3 patch filter that produces every published R/G on this item systematically');
    say('   EXCLUDES the hard-keyed tail: keyed pixels sit on relief edges and inlay, which are not flat.');
    say('   So §342.2\'s whole 1.02-1.86 range was already taken at 99.2-100% authority, and R/G varies');
    say('   1.9x across it while authority varies by under 0.8 points. Within this object, authority is');
    say('   not what moves R/G.');
  }
  say('');
  say('   ...and the key==0 patches are NOT a matched sample of the keyed ones:');
  const zeroP = list.slice(0, k12).filter((p) => patchKey(p).max === 0);
  say(`   of the darkest-12% patches, ${zeroP.length}/${k12} are entirely key==0, and`);
  const far = list.slice(0, k12).filter((p) => p.x >= 290).length;
  say(`   ${far}/${k12} = ${(100 * far / k12).toFixed(0)}% of them sit at x >= 290 — the separate block face at the right of the rect,`);
  say('   across an ink line and an edge highlight from the large mauve body. Different surface.');
  say('');
  say('   REDUCTIO, using only the two rows above. If key alone carried R/G from 0.67 (key 0) to');
  say('   1.70 (key 0.0049), the slope would be (1.70-0.67)/0.0049 = 210 per unit key, and the');
  say('   0.1017 §344 measured on SHADE_R would put it at R/G ~22. No pixel in this frame reads');
  say('   anything of the sort. The two populations therefore differ in something other than key,');
  say('   and the difference between them may not be attributed to shadow authority.');
}

/* ═══ 6 ════════════════════════════════════════════════════════════════════════════════════════
 * The one comparison that holds material and object fixed: inside colossus-L's own mauve face,
 * split its flat pixels by their measured key.                                                 */
rule('=');
say('6. WITHIN colossus-L\'s OWN mauve face — flat pixels split by their measured key');
rule();
for (const [i, b] of BODY_BOXES.entries()) {
  const z = boxFlat(kpOff, b, (x, y) => !isBg(x, y) && px(t5, x, y)[2] === 0);
  const k = boxFlat(kpOff, b, (x, y) => !isBg(x, y) && px(t5, x, y)[2] > 0);
  const tot = (z?.n ?? 0) + (k?.n ?? 0);
  say(`   body box ${i + 1} [${b.join(',')}]  flat px ${tot}   key==0 share ${(100 * (z?.n ?? 0) / Math.max(tot, 1)).toFixed(1)}%`);
  say(`     key == 0 (FULL AUTHORITY)  ${fmt(z)}`);
  say(`     key >  0                   ${fmt(k)}`);
}
say('');
say('   and the separate block face at the right of the same rect, for contrast:');
say(`     right block, key == 0      ${fmt(boxFlat(kpOff, RIGHT_BOX, (x, y) => !isBg(x, y) && px(t5, x, y)[2] === 0))}`);
say('');
say('   Two candidate readings of "granite at full authority" — 1.2-1.3 on the body, 0.68 on the');
say('   right block — and nothing committed establishes which surface carries the albedo the');
say('   6.344 input refers to. The key==0 body pixels are also darker and a small minority share,');
say('   so they differ from the keyed pixels in more than key. This is a bound, not a value.');

/* ═══ 7 ════════════════════════════════════════════════════════════════════════════════════════ */
rule('=');
say('7. §342.2\'s two lines');
rule();
say('   As written:');
say('     shipped albedo (input 6.344) at full authority ->  1.02-1.86   bar 0.90: miss by 1.13-2.07x');
say('     hueGrade off   (input 4.006) at full authority ->  0.64-1.18   <- "STRADDLES the bar"');
say('');
say('   LINE 1 — re-based above. Its "1.02" end was in fact measured at authority 99.84%, not at');
say('   the rect mean\'s 97.19%, because R/G and key were computed over different populations. The');
say('   figure is not an extrapolated limit and never needed to be; but 41% of the patches under it');
say('   sit on a different block face, so it is not a reading of the material it is labelled with.');
say('');
say('   LINE 2 — not re-basable at any authority. It multiplies a measured R/G by the ratio of two');
say('   albedo ratios, which needs the rendered R/G to be homogeneous of degree 1 in the albedo.');
say('   The shipped diffuse sum is not (toon.glsl.js:756-759 with shipped TUNE — shadeForm == 1 at');
say('   shadeBand 0.0, hold == 0 at shadowHold 0.0, ao off the key at aoKey 0.0):');
say('     diff = alb*keyRad*key  +  albAmb*fill*ao  +  albShadow*slyShad*shadowMix*(..)');
say('                            +  slyShad*uShadowWash*shadowMix*ao');
say('     - the last term carries NO albedo factor at all (uShadowWash 0.05, ToonMaterial.js:172);');
say('     - albShadow / albAmb mix alb toward its own LUMA (uShadowSat -0.35, :173) — a channel-');
say('       MIXING map, not a per-channel scale.');
say('   So D = (linear non-diagonal map of alb) + (a constant independent of alb), and D_R/D_G is');
say('   not a function of alb_R/alb_G alone. The transfer is not an operation this shader supports.');
say('   That defect is independent of the `sh` premise and survives any re-basing of line 1.');
say('');
rule('=');
say('Registered scorer, unchanged and still VOID:  node progress/records/keyprobe/keyprobe-score.mjs');
say('');

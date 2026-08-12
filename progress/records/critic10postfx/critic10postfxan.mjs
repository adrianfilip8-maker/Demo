/**
 * critic10postfxan — sealed scorer for PREREG-critic10-postfx.md. Staged before its frames
 * exist; evaluates in the registered order: per-shot back==base validity gate FIRST, then item-1
 * bars B1..B5 (PASS-A / PASS-B / NO-SHIP), then item-2 G1/G2 attribution. This file evaluates;
 * the RESULT decides, after the crops have been looked at.
 *
 * G2's two phrasings in the seal are the same bar restated: "the other two fields leave >=70%
 * of the component's effect with sandHigh" is implemented as E_other < 0.30 * E_sandHigh over
 * the same component pixels. Both were written before any frame existed.
 *
 * Generation rule (registered): a ghost shot scores generation 2 iff the runner's retry fired
 * for it (c10postfx.json .retries), else generation 1. No mixing within a shot.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';

const DIR = '/home/user/Demo/shots/c10postfx';
const CROPS = `${DIR}/crops`;
const J = JSON.parse(readFileSync(`${DIR}/c10postfx.json`, 'utf8'));
mkdirSync(CROPS, { recursive: true });

const L = (im, o) => 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];
const load = (n) => readPNG(`${DIR}/${n}.png`);
const has = (n) => existsSync(`${DIR}/${n}.png`);

function strictDiff(a, b) {
  let n = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1] || a.data[oa + 2] !== b.data[ob + 2]) n++;
  }
  return n;
}
function changedPx(a, b, thr = 2) {
  const out = [];
  for (let i = 0; i < a.w * a.h; i++) {
    const d = L(a, i * a.ch) - L(b, i * b.ch);
    if (Math.abs(d) >= thr) out.push([i % a.w, (i / a.w) | 0, d]);
  }
  return out;
}
function roiMean(im, [x, y, w, h]) {
  let s = 0, n = 0, ls = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const v = L(im, (j * im.w + i) * im.ch); s += v; n++; ls.push(v);
  }
  ls.sort((p, q) => p - q);
  return { mean: s / n, p99: ls[Math.floor(0.99 * (ls.length - 1))], max: ls[ls.length - 1] };
}
function components(a, b, thr = 4, minPx = 800) {
  const w = a.w, h = a.h, hot = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (Math.abs(L(a, i * a.ch) - L(b, i * b.ch)) >= thr) hot[i] = 1;
  const seen = new Uint8Array(w * h), comps = [];
  for (let i = 0; i < w * h; i++) {
    if (!hot[i] || seen[i]) continue;
    const px = []; const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); px.push(j);
      const x = j % w, y = (j / w) | 0;
      if (x > 0 && hot[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < w - 1 && hot[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && hot[j - w] && !seen[j - w]) { seen[j - w] = 1; stack.push(j - w); }
      if (y < h - 1 && hot[j + w] && !seen[j + w]) { seen[j + w] = 1; stack.push(j + w); }
    }
    if (px.length < minPx) continue;
    const xs = px.map(j => j % w), ys = px.map(j => (j / w) | 0);
    let dl = 0; for (const j of px) dl += L(a, j * a.ch) - L(b, j * b.ch);
    comps.push({
      n: px.length, px,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      meanDL: dl / px.length,
    });
  }
  comps.sort((p, q) => q.n - p.n);
  return comps;
}
function crop3x(im, x0, y0, w, h, out) {
  const s = 3, p = new PNG({ width: w * s, height: h * s });
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const sx = Math.min(im.w - 1, Math.max(0, x0 + (x / s | 0))), sy = Math.min(im.h - 1, Math.max(0, y0 + (y / s | 0)));
    const i = (sy * im.w + sx) * im.ch, o = (y * w * s + x) * 4;
    p.data[o] = im.data[i]; p.data[o + 1] = im.data[i + 1]; p.data[o + 2] = im.data[i + 2]; p.data[o + 3] = 255;
  }
  writeFileSync(out, PNG.sync.write(p));
}

/* registered ROIs (PREREG §1/§5) */
const SUBJ_DISPLAY = [536, 205, 42, 92], BALL = [572, 238, 36, 36];
const LAMPS = [660, 0, 120, 60], MOON = [380, 50, 60, 60];
const TORCH_A = [1004, 175, 28, 44], TORCH_B = [280, 190, 28, 38];

const gen = (shot) => (J.retries && J.retries[shot] ? '2' : '');
const verdict = { void: [], bars: {}, ghosts: {}, notes: [] };

/* ---- validity gates first ---- */
console.log('=== validity: back == base, strict ===');
for (const shot of ['traversal', 'night', 'interior', 'sly-closeup', 'hero', 'temple', 'sly-profile', 'kaykit']) {
  const g = gen(shot);
  if (!has(`${shot}.base${g}`) || !has(`${shot}.back${g}`)) { console.log(`${shot}: MISSING FRAMES`); verdict.void.push(shot); continue; }
  const n = strictDiff(load(`${shot}.base${g}`), load(`${shot}.back${g}`));
  console.log(`${shot}${g && ' (gen2)'}: ${n} px ${n === 0 ? 'OK' : '<<< VOID'}`);
  if (n !== 0) verdict.void.push(shot);
}

/* ---- item 1 ---- */
console.log('\n=== item 1: bloomSubjectCut ===');
const inBox = (x, y, bb, d) => bb && bb !== 'BEHIND' && x >= bb[0] - d && x <= bb[2] + d && y >= bb[1] - d && y <= bb[3] + d;

if (!verdict.void.includes('traversal')) {
  const base = load('traversal.base'), subj = load('traversal.subj1'), off = load('traversal.bloomoff');
  const chg = changedPx(base, subj), chgOff = changedPx(base, off);
  verdict.bars.B1 = { changed: chg.length, bloomoffChanged: chgOff.length, pass: chg.length >= 300, premise: chgOff.length >= 4 * Math.max(chg.length, 1) || chgOff.length >= 1200 };
  console.log(`B1 traversal diff(base,subj1) |dL|>=2: ${chg.length} px (>=300: ${chg.length >= 300}); bloomoff: ${chgOff.length} px`);

  const bb = J.jobs['traversal.base'].probe.subjBBox;
  for (const [shot, key] of [['traversal', 'traversal'], ['sly-closeup', 'sly-closeup'], ['hero', 'hero']]) {
    if (verdict.void.includes(shot)) continue;
    const a = load(`${shot}.base`), s = load(`${shot}.subj1`);
    const c = changedPx(a, s);
    const box = J.jobs[`${shot}.base`].probe.subjBBox;
    const inside = c.filter(([x, y]) => inBox(x, y, box, 128)).length;
    let outMax = 0;
    for (let i = 0; i < a.w * a.h; i++) {
      const x = i % a.w, y = (i / a.w) | 0;
      if (inBox(x, y, box, 128)) continue;
      for (let ch = 0; ch < 3; ch++) outMax = Math.max(outMax, Math.abs(a.data[i * a.ch + ch] - s.data[i * s.ch + ch]));
    }
    const brighten = c.filter(([, , d]) => d < -2).length; // d = base - subj; negative = subj brighter
    const contained = c.length === 0 ? 1 : inside / c.length;
    verdict.bars[`B2_${shot}`] = { changed: c.length, contained: +contained.toFixed(4), outMax, pass: contained >= 0.99 && outMax <= 2 };
    verdict.bars[`B3_${shot}`] = { brightenOver2: brighten, pass: brighten === 0 };
    console.log(`B2 ${shot}: ${c.length} changed, ${(contained * 100).toFixed(2)}% in bbox+128 ${JSON.stringify(box)}, outside max ${outMax} codes -> ${contained >= 0.99 && outMax <= 2 ? 'OK' : 'FAIL'}`);
    console.log(`B3 ${shot}: ${brighten} px brightened >2 L -> ${brighten === 0 ? 'OK' : 'FAIL'}`);
  }

  /* B4 halo-keep */
  const rois = [['LAMPS', 'night', LAMPS], ['MOON', 'night', MOON], ['TORCH_A', 'interior', TORCH_A], ['TORCH_B', 'interior', TORCH_B]];
  let vacuous = 0;
  for (const [name, shot, roi] of rois) {
    if (verdict.void.includes(shot)) continue;
    const b = roiMean(load(`${shot}.base${gen(shot)}`), roi), s = roiMean(load(`${shot}.subj1${gen(shot)}`), roi), o = roiMean(load(`${shot}.bloomoff${gen(shot)}`), roi);
    const dSubj = s.mean - b.mean, dOff = o.mean - b.mean;
    if (dOff <= -2) vacuous++;
    verdict.bars[`B4_${name}`] = { dSubj: +dSubj.toFixed(3), dBloomoff: +dOff.toFixed(3), pass: Math.abs(dSubj) <= 1.0 };
    console.log(`B4 ${name}: subj1 dMean ${dSubj.toFixed(3)} (|.|<=1: ${Math.abs(dSubj) <= 1.0}); bloomoff dMean ${dOff.toFixed(3)}`);
  }
  verdict.bars.B4_vacuity = { roisBloomCarried: vacuous, pass: vacuous >= 2 };
  console.log(`B4 vacuity: ${vacuous}/4 ROIs drop >=2 L with bloom off (need >=2 or the bar is vacuous)`);

  /* B5 the critic's read */
  const sb = roiMean(base, SUBJ_DISPLAY), ss = roiMean(subj, SUBJ_DISPLAY);
  const bbl = roiMean(base, BALL), bsl = roiMean(subj, BALL);
  verdict.bars.B5 = {
    subjMeanD: +(ss.mean - sb.mean).toFixed(3), subjP99D: +(ss.p99 - sb.p99).toFixed(3),
    ballMeanD: +(bsl.mean - bbl.mean).toFixed(3),
    pass: ss.mean <= sb.mean + 1e-9 && ((sb.p99 - ss.p99) >= 2 || (sb.mean - ss.mean) >= 0.5) && (bsl.mean - bbl.mean) <= 2,
  };
  console.log(`B5 SUBJ mean ${sb.mean.toFixed(2)} -> ${ss.mean.toFixed(2)}  p99 ${sb.p99.toFixed(1)} -> ${ss.p99.toFixed(1)}  BALL mean ${bbl.mean.toFixed(2)} -> ${bsl.mean.toFixed(2)} -> ${verdict.bars.B5.pass ? 'OK' : 'FAIL'}`);

  /* attribution decomposition, report-only */
  const spark = load('traversal.sparkoff');
  const ballSpark = roiMean(spark, BALL);
  console.log(`report: BALL base ${bbl.mean.toFixed(1)} / bloomoff ${roiMean(off, BALL).mean.toFixed(1)} / sparkoff ${ballSpark.mean.toFixed(1)} (quad vs bloom split)`);
  for (const t of ['T260', 'T290']) {
    const im = load(`traversal.${t}`);
    console.log(`report: ${t}  SUBJ mean ${roiMean(im, SUBJ_DISPLAY).mean.toFixed(2)}  BALL mean ${roiMean(im, BALL).mean.toFixed(2)}`);
  }
  crop3x(base, 500, 180, 140, 170, `${CROPS}/traversal-subj-base-3x.png`);
  crop3x(subj, 500, 180, 140, 170, `${CROPS}/traversal-subj-subj1-3x.png`);
  crop3x(off, 500, 180, 140, 170, `${CROPS}/traversal-subj-bloomoff-3x.png`);
}

/* PASS-A / PASS-B */
const b = verdict.bars;
const allB24 = ['B2_traversal', 'B2_sly-closeup', 'B2_hero', 'B3_traversal', 'B3_sly-closeup', 'B3_hero',
  'B4_LAMPS', 'B4_MOON', 'B4_TORCH_A', 'B4_TORCH_B'].every((k) => !b[k] || b[k].pass);
if (b.B1?.pass && allB24 && b.B5?.pass && b.B4_vacuity?.pass) verdict.item1 = 'PASS-A';
else if (!b.B1?.pass && allB24 && (b['B2_sly-closeup']?.changed >= 300) && (b.B2_hero?.changed >= 300)) verdict.item1 = 'PASS-B-CANDIDATE (check B5 ROIs moved <=1 L, then look)';
else verdict.item1 = 'NO-SHIP';
console.log(`\nitem 1 verdict (pre-looking): ${verdict.item1}`);

/* ---- item 2: ghosts ---- */
console.log('\n=== item 2: ghost attribution (sandHigh) ===');
let fired = 0;
for (const shot of ['temple', 'sly-profile', 'kaykit', 'night']) {
  if (verdict.void.includes(shot)) continue;
  const g = gen(shot);
  const base = load(`${shot}.base${g}`), hi = load(`${shot}.nosandhigh${g}`);
  const comps = components(base, hi);
  const top = comps[0];
  if (!top) { verdict.ghosts[shot] = { fired: false }; console.log(`${shot}${g && ' (gen2)'}: no >=800px component`); continue; }
  const entry = { fired: true, n: top.n, bbox: top.bbox, meanDL: +top.meanDL.toFixed(2), gen: g || '1' };
  /* backdrop off the nosandhigh frame, over the component (graded-PNG units, §148.3 caveat) */
  let r = 0, gg = 0, bl = 0;
  for (const j of top.px) { const o = j * hi.ch; r += hi.data[o]; gg += hi.data[o + 1]; bl += hi.data[o + 2]; }
  entry.backdrop = { rgb: [r, gg, bl].map((v) => Math.round(v / top.n)), luma: +((0.2126 * r + 0.7152 * gg + 0.0722 * bl) / top.n).toFixed(1) };
  /* G2 discriminators where captured */
  if (has(`${shot}.nosandlow${g}`)) {
    const eOver = (im) => { let s = 0; for (const j of top.px) s += L(base, j * base.ch) - L(im, j * im.ch); return Math.abs(s / top.n); };
    const eHigh = Math.abs(top.meanDL), eLow = eOver(load(`${shot}.nosandlow${g}`)), eShim = eOver(load(`${shot}.noshimmer${g}`));
    entry.G2 = { eHigh: +eHigh.toFixed(2), eLow: +eLow.toFixed(2), eShim: +eShim.toFixed(2), pass: eLow < 0.3 * eHigh && eShim < 0.3 * eHigh };
    console.log(`${shot}: G2 eHigh ${eHigh.toFixed(2)} eLow ${eLow.toFixed(2)} eShim ${eShim.toFixed(2)} -> ${entry.G2.pass ? 'OK' : 'FAIL'}`);
  }
  verdict.ghosts[shot] = entry;
  fired++;
  const [x0, y0, x1, y1] = top.bbox;
  const pad = 20, cw = Math.min(base.w - Math.max(0, x0 - pad), x1 - x0 + 2 * pad), chh = Math.min(base.h - Math.max(0, y0 - pad), y1 - y0 + 2 * pad);
  crop3x(base, Math.max(0, x0 - pad), Math.max(0, y0 - pad), cw, chh, `${CROPS}/${shot}-ghost-base-3x.png`);
  crop3x(hi, Math.max(0, x0 - pad), Math.max(0, y0 - pad), cw, chh, `${CROPS}/${shot}-ghost-nosandhigh-3x.png`);
  console.log(`${shot}${g && ' (gen2)'}: component ${top.n}px bbox ${JSON.stringify(top.bbox)} meanDL ${top.meanDL.toFixed(2)} backdrop ${JSON.stringify(entry.backdrop)}`);
}
const g2ok = Object.values(verdict.ghosts).every((e) => !e.G2 || e.G2.pass);
verdict.item2 = fired >= 2 && g2ok ? 'ATTRIB-PASS (pending the looking)' : 'ATTRIB-INCONCLUSIVE';
console.log(`\nitem 2 verdict (pre-looking): ${verdict.item2} (${fired}/4 fired)`);

writeFileSync(`${DIR}/verdict.json`, JSON.stringify(verdict, null, 1));
console.log(`\nwrote ${DIR}/verdict.json — this file evaluates; the RESULT decides, after the crops have been looked at.`);

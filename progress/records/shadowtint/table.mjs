/**
 * table.mjs — the whole comparison in one table, in BOTH spaces.
 *
 * For every ROI in roi.json: the clean-patch population (10x10, per-channel sd <= 3), its
 * darkest and brightest deciles, and — the point of the exercise — the scene-linear radiance
 * each of those displays came from.
 *
 * The MATCHED-LUMINANCE CONTROL at the bottom is the part that decides the space question.
 * If the courtyard miss were a transform artefact (a shade band sitting further up AgX's
 * desaturating shoulder than the passing shots'), then two patches from different shots at the
 * SAME display luminance would have to receive the SAME treatment — the transform has no shot
 * input. So a matched-L pair with a 140-degree display-hue gap cannot have been made downstream.
 */
import { readFileSync } from 'node:fs';
import { readPNG } from '../../../tools/png.mjs';
import { hsv, lum } from './measure.mjs';
import { scan } from './patches.mjs';
import { vig, hsvLin } from './space.mjs';
import { unGrade } from './invchain.mjs';

const cfg = JSON.parse(readFileSync(new URL('./roi.json', import.meta.url), 'utf8'));
const DIR = process.argv[2] ?? 'shots/r12';
const cache = new Map();
const img = (s) => { if (!cache.has(s)) cache.set(s, readPNG(`${DIR}/${s}.png`)); return cache.get(s); };

function agg(im, sel) {
  const n = sel.length;
  const mean = [0, 1, 2].map((c) => sel.reduce((a, p) => a + p.mean[c], 0) / n);
  const v = sel.reduce((a, p) => a + vig(p.x, p.y, im.w, im.h), 0) / n;
  const r = unGrade(mean.map((x) => x / v));
  return { n, mean, v, lin: r.scene, flags: r.flags, hD: hsv(mean), hL: hsvLin(r.scene), L: lum(mean) };
}
const row = (label, a) => `${label.padEnd(40)} ${String(a.n).padStart(4)}p  ` +
  `#${a.mean.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')} ` +
  `h${a.hD.h.toFixed(0).padStart(4)} s${a.hD.s.toFixed(2)} L${a.L.toFixed(0).padStart(4)}  |  ` +
  `lin ${a.lin.map((x) => x.toFixed(4).padStart(7)).join(' ')} h${a.hL.h.toFixed(0).padStart(4)} s${a.hL.s.toFixed(2)}  ` +
  `R/G ${(a.lin[0] / Math.max(a.lin[1], 1e-9)).toFixed(2).padStart(5)} B/G ${(a.lin[2] / Math.max(a.lin[1], 1e-9)).toFixed(2).padStart(5)}` +
  `${a.flags.length ? '  ' + a.flags.join(',') : ''}`;

console.log(`frames from ${DIR}\n`);
console.log(`${''.padEnd(40)}   px  display                |  scene-linear radiance`);
console.log('-'.repeat(150));
const all = [];
for (const e of cfg.shots) {
  const im = img(e.shot);
  const list = scan(im, ...e.roi, 10, 3.0);
  if (!list.length) { console.log(`${(e.shot + ' / ' + e.name).padEnd(40)} (no clean patches)`); continue; }
  const k = Math.max(1, Math.round(list.length * 0.12));
  const dark = agg(im, list.slice(0, k)), bright = agg(im, list.slice(-k));
  console.log(row(`${e.shot} / ${e.name}  DARK 12%`, dark));
  if (e.cls === 'both') console.log(row(`${e.shot} / ${e.name}  LIT  12%`, bright));
  all.push({ e, im, list });
}

/* ---- matched-luminance control ---------------------------------------------------------- */
console.log(`\n\nMATCHED-LUMINANCE CONTROL — patches from different shots at the SAME display L.`);
console.log(`The transform has no shot input: two pixels at the same display value entered it from`);
console.log(`the same place. Any hue difference between them was therefore made UPSTREAM.\n`);
const pool = [];
for (const { e, im, list } of all) {
  for (const p of list) pool.push({ shot: e.shot, name: e.name, p, im });
}
for (const Ltar of [45, 55, 65, 75, 85]) {
  const per = new Map();
  for (const q of pool) {
    if (Math.abs(q.p.L - Ltar) > 2.0) continue;
    const key = `${q.shot}/${q.name}`;
    if (!per.has(key)) per.set(key, []);
    per.get(key).push(q);
  }
  console.log(`  ---- display L ${Ltar} +/- 2 ----`);
  for (const [key, qs] of [...per.entries()].sort()) {
    const im = qs[0].im;
    const a = agg(im, qs.map((q) => q.p));
    console.log(`   ${row(key, a)}`);
  }
}

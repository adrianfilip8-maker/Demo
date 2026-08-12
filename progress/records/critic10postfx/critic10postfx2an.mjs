/**
 * critic10postfx2an — sealed scorer for PREREG-critic10-postfx2.md. Staged before its frames
 * exist. Registered order: V1 validity, V3's mask-presence instrument check, V2 effect,
 * V3 containment, V4 direction, V5 halo-keep (+vacuity), V6 crops for the looking.
 * This file evaluates; the RESULT decides, after the crops have been looked at.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';

const DIR = '/home/user/Demo/shots/c10postfx2';
const CROPS = `${DIR}/crops`;
mkdirSync(CROPS, { recursive: true });
const J = JSON.parse(readFileSync(`${DIR}/c10postfx2.json`, 'utf8'));

const L = (im, o) => 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];
const load = (n) => readPNG(`${DIR}/${n}.png`);

const SHOTS = ['traversal', 'night', 'interior', 'sly-closeup', 'hero'];
const v = { void: [], bars: {}, notes: [] };

/* V1 */
console.log('=== V1 validity: back == base strict ===');
for (const s of SHOTS) {
  let a, b;
  try { a = load(`${s}.base`); b = load(`${s}.back`); } catch { console.log(`${s}: MISSING`); v.void.push(s); continue; }
  let n = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1] || a.data[oa + 2] !== b.data[ob + 2]) n++;
  }
  console.log(`${s}: ${n} px ${n === 0 ? 'OK' : '<<< VOID'}`);
  if (n) v.void.push(s);
}
v.bars.V1 = { void: v.void.slice(), pass: v.void.length === 0 };

/* V3 instrument: masks present and nonempty */
console.log('\n=== mask instrument ===');
const masks = {};
for (const s of SHOTS) {
  try {
    const m = readPNG(`${DIR}/MASK.${s}.png`);
    let n = 0; for (let i = 0; i < m.w * m.h; i++) if (m.data[i * m.ch] > 128) n++;
    masks[s] = { m, count: n };
    console.log(`${s}: mask px ${n}${n === 0 ? ' <<< VOID-INSTRUMENT' : ''}`);
    if (n === 0) v.void.push(s);
  } catch { console.log(`${s}: MASK MISSING <<< VOID-INSTRUMENT`); v.void.push(s); }
}

/* distance-to-mask containment via dilation grid (128 px, chebyshev via box passes) */
function dilate(maskIm, r) {
  const w = maskIm.w, h = maskIm.h;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = maskIm.data[i * maskIm.ch] > 128 ? 1 : 0;
  // two-pass chebyshev distance threshold: horizontal run then vertical
  const b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) { if (a[y * w + x]) last = x; b[y * w + x] = (x - last <= r) ? 1 : 0; }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (a[y * w + x]) last = x; if (last - x <= r) b[y * w + x] = 1; }
  }
  const c = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) { if (b[y * w + x]) last = y; c[y * w + x] = (y - last <= r) ? 1 : 0; }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (b[y * w + x]) last = y; if (last - y <= r) c[y * w + x] = 1; }
  }
  return c;
}

/* V2/V3/V4 per shot */
console.log('\n=== V2/V3/V4 ===');
for (const s of SHOTS) {
  if (v.void.includes(s)) continue;
  const base = load(`${s}.base`), subj = load(`${s}.subj1`);
  const pts = [];
  for (let i = 0; i < base.w * base.h; i++) {
    const d = L(base, i * base.ch) - L(subj, i * subj.ch);
    if (Math.abs(d) >= 2) pts.push([i % base.w, (i / base.w) | 0, d]);
  }
  const changed = pts.length;
  const darker = pts.filter((p) => p[2] > 0).length;
  const meanAbs = changed ? pts.reduce((a, p) => a + Math.abs(p[2]), 0) / changed : 0;
  const dil = dilate(masks[s].m, 128);
  const inside = pts.filter(([x, y]) => dil[y * base.w + x]).length;
  const brighter = changed - darker;
  const v3pass = changed === 0 || inside === changed;
  const v4cap = Math.max(32, Math.ceil(0.05 * changed));
  const v4pass = brighter <= v4cap;
  v.bars[`shot_${s}`] = { changed, meanAbs: +meanAbs.toFixed(2), darkerPct: changed ? +(100 * darker / changed).toFixed(1) : null, inside, v3pass, brighter, v4cap, v4pass };
  console.log(`${s}: changed ${changed} mean|dL| ${meanAbs.toFixed(2)} darker ${changed ? (100 * darker / changed).toFixed(1) : '-'}%`
    + `  V3 inside ${inside}/${changed} -> ${v3pass ? 'OK' : 'FAIL'}  V4 brighter ${brighter} <= ${v4cap} -> ${v4pass ? 'OK' : 'FAIL'}`);
}
const cu = v.bars['shot_sly-closeup'];
v.bars.V2 = { pass: !!cu && cu.changed >= 300 && cu.meanAbs >= 3.0 && cu.darkerPct >= 90 };
console.log(`V2 (sly-closeup): ${cu ? `${cu.changed} px, mean ${cu.meanAbs}, darker ${cu.darkerPct}%` : 'VOID'} -> ${v.bars.V2.pass ? 'OK' : 'FAIL'}`);
v.bars.V3 = { pass: SHOTS.every((s) => v.void.includes(s) ? false : v.bars[`shot_${s}`]?.v3pass) && v.void.length === 0 };
v.bars.V4 = { pass: SHOTS.every((s) => v.void.includes(s) ? false : v.bars[`shot_${s}`]?.v4pass) && v.void.length === 0 };

/* V5 */
console.log('\n=== V5 halo-keep ===');
const roiMean = (im, [x, y, w, h]) => { let t = 0, n = 0; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { t += L(im, (j * im.w + i) * im.ch); n++; } return t / n; };
const ROIS = [['LAMPS', 'night', [660, 0, 120, 60]], ['MOON', 'night', [380, 50, 60, 60]], ['TORCH_A', 'interior', [1004, 175, 28, 44]], ['TORCH_B', 'interior', [280, 190, 28, 38]]];
let vac = 0, v5ok = true;
for (const [name, shot, roi] of ROIS) {
  if (v.void.includes(shot)) { v5ok = false; continue; }
  const b = roiMean(load(`${shot}.base`), roi), s1 = roiMean(load(`${shot}.subj1`), roi), o = roiMean(load(`${shot}.bloomoff`), roi);
  const dS = s1 - b, dO = o - b;
  if (dO <= -2) vac++;
  if (Math.abs(dS) > 1.0) v5ok = false;
  v.bars[`V5_${name}`] = { dSubj: +dS.toFixed(3), dBloomoff: +dO.toFixed(3) };
  console.log(`${name}: subj1 d ${dS.toFixed(3)}  bloomoff d ${dO.toFixed(3)}`);
}
v.bars.V5 = { pass: v5ok && vac >= 2, vacuityCarried: vac };
console.log(`V5 -> ${v.bars.V5.pass ? 'OK' : 'FAIL'} (bloom-carried ROIs: ${vac}/4, need >=2)`);

/* V6 crops */
function crop3x(im, x0, y0, w, h, out) {
  const s = 3, p = new PNG({ width: w * s, height: h * s });
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const sx = Math.min(im.w - 1, Math.max(0, x0 + (x / s | 0))), sy = Math.min(im.h - 1, Math.max(0, y0 + (y / s | 0)));
    const i = (sy * im.w + sx) * im.ch, o = (y * w * s + x) * 4;
    p.data[o] = im.data[i]; p.data[o + 1] = im.data[i + 1]; p.data[o + 2] = im.data[i + 2]; p.data[o + 3] = 255;
  }
  writeFileSync(out, PNG.sync.write(p));
}
if (cu && cu.changed) {
  const base = load('sly-closeup.base'), subj = load('sly-closeup.subj1');
  const pts = [];
  for (let i = 0; i < base.w * base.h; i++) { const d = L(base, i * base.ch) - L(subj, i * subj.ch); if (Math.abs(d) >= 2) pts.push([i % base.w, (i / base.w) | 0, d]); }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.min(...xs) - 12), y0 = Math.max(0, Math.min(...ys) - 12);
  const cw = Math.min(base.w - x0, Math.max(...xs) - x0 + 24), ch = Math.min(base.h - y0, Math.max(...ys) - y0 + 24);
  crop3x(base, x0, y0, Math.min(cw, 260), Math.min(ch, 380), `${CROPS}/closeup-base-3x.png`);
  crop3x(subj, x0, y0, Math.min(cw, 260), Math.min(ch, 380), `${CROPS}/closeup-subj1-3x.png`);
  const p = new PNG({ width: base.w, height: base.h });
  for (let i = 0; i < base.w * base.h; i++) {
    const d = L(base, i * base.ch) - L(subj, i * subj.ch);
    const vv = Math.min(255, Math.abs(d) * 8);
    p.data[i * 4] = d > 0 ? vv : 0; p.data[i * 4 + 1] = 0; p.data[i * 4 + 2] = d < 0 ? vv : 0; p.data[i * 4 + 3] = 255;
  }
  writeFileSync(`${CROPS}/closeup-diffmap-x8.png`, PNG.sync.write(p));
  console.log('\nV6 crops written (closeup base/subj1 3x + diffmap x8)');
}

/* report-only continuity rows */
try {
  const tb = load('traversal.base'), ts = load('traversal.subj1');
  const rm = (im, r) => roiMean(im, r);
  console.log(`report: traversal SUBJ-DISPLAY d ${(rm(ts, [536, 205, 42, 92]) - rm(tb, [536, 205, 42, 92])).toFixed(3)}  BALL d ${(rm(ts, [572, 238, 36, 36]) - rm(tb, [572, 238, 36, 36])).toFixed(3)}`);
} catch { /* voided */ }

v.SHIP = v.bars.V1.pass && v.bars.V2.pass && v.bars.V3.pass && v.bars.V4.pass && v.bars.V5.pass;
console.log(`\nverdict (pre-looking): ${v.SHIP ? 'SHIP (pending V6 looking)' : 'NO-SHIP'}`);
writeFileSync(`${DIR}/verdict2.json`, JSON.stringify(v, null, 1));
console.log(`wrote ${DIR}/verdict2.json — this file evaluates; the RESULT decides, after the crops have been looked at.`);

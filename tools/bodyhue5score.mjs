/**
 * Scores shots/bodyhue5/arms.json against PREREG-bodyhue5.md §4. Verdict-only; re-runnable.
 *
 * Gates per shot, in order: CAL-2 (swap took) → CAL-1 (coverage ≥ 0.15%) → CAL-R (arm
 * agreement ≤ 2.0°). Then P1 (swing −11.3 ± 4.0) and P2 (arm B within 213.5 ± 6.0), each on
 * BOTH shots. Tri-state: only explicit passes score; anything else is VOID, never a default.
 */
import { readPNG } from './png.mjs';
import { readFileSync } from 'node:fs';

const ARMS = (process.env.SANDS_OUT || 'shots/bodyhue5') + '/arms.json';
const rows = JSON.parse(readFileSync(ARMS, 'utf8'));

const circdiff = (a, b) => ((a - b + 540) % 360) - 180;

const circmed = (a) => {
  if (!a.length) return null;
  let sx = 0, sy = 0;
  for (const h of a) { const r = h * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); }
  const mean = Math.atan2(sy, sx) * 180 / Math.PI;
  const shift = 180 - ((mean % 360) + 360) % 360;
  const rot = a.map((h) => (((h + shift) % 360) + 360) % 360).sort((x, y) => x - y);
  return (((rot[Math.floor(rot.length / 2)] - shift) % 360) + 360) % 360;
};

const hueOf = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};

const texMedian = (path) => {
  const im = readPNG(path);
  const hs = [];
  for (let i = 0, px = im.w * im.h; i < px; i++) {
    const o = i * im.ch;
    if (im.ch === 4 && im.data[o + 3] < 128) continue;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2];
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const s = mx ? (mx - mn) / mx : 0;
    const h = hueOf(r, g, b);
    if (h == null || h < 190 || h > 270 || s <= 0.15) continue;
    hs.push(h);
  }
  return circmed(hs);
};
const H_A = texMedian('src/assets/sly-dl/sly_body.png');
const H_B = texMedian('src/assets/sly-dl/sly_body_fix.png');
console.log(`H_A ${H_A.toFixed(1)}°  H_B ${H_B.toFixed(1)}°  (seal expects 229.3 / 218.0 ± 0.5)\n`);

const NEED = ['sly-closeup', 'sly-perch'];
const REF = 213.5, P2_TOL = 6.0, ROT = -11.3, P1_TOL = 4.0;

let p1all = true, p2all = true, voided = false;
for (const shot of NEED) {
  const r = rows.find((x) => x.shot === shot);
  if (!r) { console.log(`${shot}: MISSING — VOID`); voided = true; continue; }
  if (!(r.modeA === 'raw' && r.modeB === 'fix' && r['A-raw'] && r['B-fix']
    && r['A-raw'].sha !== r['B-fix'].sha)) { console.log(`${shot}: CAL-2 fail — VOID`); voided = true; continue; }
  if (!(r.cov >= 0.0015)) { console.log(`${shot}: CAL-1 fail (cov ${(100 * r.cov).toFixed(2)}%) — VOID`); voided = true; continue; }
  if (r.hueA == null || r.hueB == null) { console.log(`${shot}: null hue — VOID`); voided = true; continue; }
  const dSA = circdiff(r.hueA, H_A), dSB = circdiff(r.hueB, H_B);
  const gap = Math.abs(circdiff(dSA, dSB));
  if (!(gap <= 2.0)) { console.log(`${shot}: CAL-R fail (gap ${gap.toFixed(1)}°) — VOID`); voided = true; continue; }
  const swing = circdiff(r.hueB, r.hueA);
  const p1 = Math.abs(circdiff(swing, ROT)) <= P1_TOL;
  const dRef = circdiff(r.hueB, REF);
  const p2 = Math.abs(dRef) <= P2_TOL;
  if (p1 !== true) p1all = false;
  if (p2 !== true) p2all = false;
  console.log(`${shot.padEnd(12)} mask ${(100 * r.cov).toFixed(2)}%  hueA ${r.hueA.toFixed(1)}°  hueB ${r.hueB.toFixed(1)}°  `
    + `swing ${swing.toFixed(1)}°  |B-ref| ${Math.abs(dRef).toFixed(1)}°  CAL-R gap ${gap.toFixed(1)}°  `
    + `P1 ${p1 ? 'PASS' : 'FAIL'}  P2 ${p2 ? 'PASS' : 'FAIL'}`);
}

const outcome = voided ? 'VOID' : p1all !== true ? 'FAIL' : p2all !== true ? 'MECHANISM-ONLY' : 'PASS';
console.log(`\nOUTCOME: ${outcome}`);
console.log(outcome === 'PASS'
  ? "PASS licenses flipping bodyMode() default to 'fix' (PREREG-bodyhue5 §4), lever test updated in the same commit."
  : "Default stays 'raw'. Only PASS may flip it.");

/**
 * PREREG-nightfloor §6 — the registered scorer. Reads progress/records/gradetrio1/ and
 * prints the verdict through tools/gate.mjs (VOID is not PASS; ship = every row PASS AND
 * the binding LOOK gate §8).
 *
 *   node progress/records/gradetrio/nightfloor-score.mjs
 */
import {
  ROSTER, manifest, row, img, stats, circDist, diffPx, bool, rBars, treeBar,
} from './gradetrio-lib.mjs';
import { shipVerdict, verdictLine } from '../../../tools/gate.mjs';

const D_ON = 0.14, D_KO = 0.18;
const WALL = [40, 180, 300, 560];      // night: the crushed left masonry mass (§4)
const MASS = [60, 560, 420, 700];      // night: the bottom-left rooftop mass
const GWALL = [560, 640, 900, 715];    // guard: the crushed floor mass behind the cone wash (§4)
const NIGHT_SHOTS = ['night', 'guard'];
const DAY_SHOTS = ROSTER.filter((s) => !NIGHT_SHOTS.includes(s));

const guards = {};
const report = [];

Object.assign(guards, rBars(report));

/* B — daylight protection: published nightAmount is exactly 0.0 on all fourteen daylight
   canonicals, so the lift branch is untaken and diff(off, don) must be [0,0], each. */
for (const shot of DAY_SHOTS) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'don')));
  report.push(`B ${shot.padEnd(12)} off-vs-don  ${d} px`);
  guards[`B_${shot}`] = guards[`R_${shot}`] !== true ? null : (d === null ? null : d === 0);
}

/* night/guard ROI stats. */
const N = {};
for (const [shot, arm] of [['night', 'off'], ['night', 'don'], ['night', 'dko'], ['guard', 'off'], ['guard', 'don']]) {
  const im = img(row(shot, arm));
  if (!im) continue;
  N[`${shot}.${arm}`] = shot === 'night'
    ? { WALL: stats(im, WALL), MASS: stats(im, MASS) }
    : { GWALL: stats(im, GWALL) };
  const S = N[`${shot}.${arm}`];
  report.push(`${shot}.${arm.padEnd(4)} ${Object.entries(S).map(([k, s]) => `${k} L ${s.meanL.toFixed(1)} R-B ${s.meanRB.toFixed(1)} hue ${s.hMean.toFixed(1)} dark% ${(s.dark * 100).toFixed(1)}`).join('   ')}`);
}
const okN = guards.R_night === true && N['night.off'] && N['night.don'];
const okG = guards.R_guard === true && N['guard.off'] && N['guard.don'];

/* BG_d — the crush must be present on the off arm (fail-closed). */
guards.BG_d = !N['night.off'] ? null
  : (N['night.off'].WALL.meanL >= 12 && N['night.off'].WALL.meanL <= 34
    && N['night.off'].WALL.dark >= 0.5 && N['night.off'].WALL.meanRB <= -15);

const gated = okN && guards.BG_d === true;

/* N1/N2 — the §2.2 floor arrives: the crushed masses lift by the modelled band. */
if (gated) {
  const d1 = N['night.don'].WALL.meanL - N['night.off'].WALL.meanL;
  const d2 = N['night.don'].MASS.meanL - N['night.off'].MASS.meanL;
  report.push(`N1  WALL dL ${d1.toFixed(2)} (want +1.0..+5.0)`);
  report.push(`N2  MASS dL ${d2.toFixed(2)} (want +0.8..+5.0)`);
  guards.N1 = d1 >= 1.0 && d1 <= 5.0;
  guards.N2 = d2 >= 0.8 && d2 <= 5.0;
} else { guards.N1 = null; guards.N2 = null; }

/* N3 — the lift is luminance-only: the violet-teal holds (the k-scale cannot rotate hue;
   measured through the grade all the same). */
if (gated) {
  const dh = circDist(N['night.don'].WALL.hMean, N['night.off'].WALL.hMean);
  report.push(`N3  WALL hue drift ${dh.toFixed(1)} (want <= 4)  R-B(don) ${N['night.don'].WALL.meanRB.toFixed(1)} (want <= -15)`);
  guards.N3 = dh <= 4 && N['night.don'].WALL.meanRB <= -15;
} else guards.N3 = null;

/* G1 — guard (the second moon-keyed canonical) lifts the same direction. */
if (okG) {
  const dg = N['guard.don'].GWALL.meanL - N['guard.off'].GWALL.meanL;
  report.push(`G1  GWALL dL ${dg.toFixed(2)} (want +0.5..+6.0)`);
  guards.G1 = dg >= 0.5 && dg <= 6.0;
} else guards.G1 = null;

/* KO_d — dose monotone (night dko, 0.18 = x1.44 on the shadow light). */
if (gated && N['night.dko']) {
  const dOn = N['night.don'].WALL.meanL - N['night.off'].WALL.meanL;
  const dKo = N['night.dko'].WALL.meanL - N['night.off'].WALL.meanL;
  report.push(`KO_d  WALL dL dko ${dKo.toFixed(2)} vs don ${dOn.toFixed(2)} (want >= 1.8x and >= don+1.5)`);
  guards.KO_d = dKo >= 1.8 * dOn && dKo >= dOn + 1.5;
} else guards.KO_d = null;

/* dark-share movement — REPORTED, not gated (§4: the 26-count threshold's crossing mass
   is a property of the frame's histogram, not of the mechanism). */
if (gated) {
  report.push(`dark%(L<26) WALL ${(N['night.off'].WALL.dark * 100).toFixed(1)} -> ${(N['night.don'].WALL.dark * 100).toFixed(1)}${N['night.dko'] ? ` -> ${(N['night.dko'].WALL.dark * 100).toFixed(1)} (dko)` : ''}   MASS ${(N['night.off'].MASS.dark * 100).toFixed(1)} -> ${(N['night.don'].MASS.dark * 100).toFixed(1)}`);
}

/* VD — readbacks: the lift is exactly x1.12 on the shadow light at night, exactly absent
   by day; every arm echoes its commanded value. */
{
  let ok = true, n = 0;
  for (const shot of ROSTER) {
    const o = row(shot, 'off')?.readback, d = row(shot, 'don')?.readback;
    if (!o?.uShadowColor || !d?.uShadowColor) { ok = null; break; }
    n++;
    if (o.shadowFloorNight !== 0.125 || d.shadowFloorNight !== D_ON) { ok = false; report.push(`VD: ${shot} echoes ${o.shadowFloorNight}/${d.shadowFloorNight}`); break; }
    if (NIGHT_SHOTS.includes(shot)) {
      if (o.nightAmount !== 1 || d.nightAmount !== 1) { ok = false; report.push(`VD: ${shot} nightAmount ${o.nightAmount}/${d.nightAmount}`); break; }
      const bad = ['r', 'g', 'b'].some((ch) => Math.abs(d.uShadowColor[ch] / o.uShadowColor[ch] - 1.12) > 1e-6);
      if (bad) { ok = false; report.push(`VD: ${shot} uShadowColor lift != x1.1200`); break; }
    } else {
      if (o.nightAmount !== 0 || d.nightAmount !== 0) { ok = false; report.push(`VD: ${shot} nightAmount ${o.nightAmount}/${d.nightAmount} (day)`); break; }
      const same = ['r', 'g', 'b'].every((ch) => d.uShadowColor[ch] === o.uShadowColor[ch]);
      if (!same) { ok = false; report.push(`VD: ${shot} uShadowColor moved though day`); break; }
    }
  }
  const ko = row('night', 'dko')?.readback;
  if (ok === true) {
    if (!ko || ko.shadowFloorNight !== D_KO) { ok = false; report.push('VD: dko echo wrong'); }
    else {
      const off = row('night', 'off').readback;
      const bad = ['r', 'g', 'b'].some((ch) => Math.abs(ko.uShadowColor[ch] / off.uShadowColor[ch] - 1.44) > 1e-6);
      if (bad) { ok = false; report.push('VD: dko lift != x1.4400'); }
    }
  }
  guards.VD = ok === null ? null : (ok && n === ROSTER.length);
}

guards.V4 = treeBar(report, 83);

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(14)} ${s}`);
console.log('');
console.log(verdictLine(v, `TUNE.shadowFloorNight = ${D_ON} (nightfloor — shared gradetrio boot; LOOK gate §8 still binds before any write)`));
process.exit(v.ship ? 0 : 1);

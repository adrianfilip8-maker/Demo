/**
 * PREREG-goldenrake §6 — the registered scorer. Reads progress/records/gradetrio1/ and
 * prints the verdict through tools/gate.mjs (VOID is not PASS; ship = every row PASS AND
 * the binding LOOK gate §8 — numbers here, eyes in the RESULT).
 *
 *   node progress/records/gradetrio/goldenrake-score.mjs
 */
import {
  ROSTER, manifest, row, img, stats, circDist, diffPx, bool, rBars, treeBar,
} from './gradetrio-lib.mjs';
import { shipVerdict, verdictLine } from '../../../tools/gate.mjs';

const C_ON = 1.0, C_KO = 0.5;
const LITF = [1120, 520, 1270, 600];      // hero: sun-raked courtyard floor (§4)
const SHFLOOR = [920, 560, 1040, 660];    // hero: cast-shadowed floor beside it
const SUBJ = [580, 230, 700, 420];        // sly-closeup: body-interior rect
const FULL = [0, 0, 1280, 720];
const EXEMPT = ['night', 'guard', 'interior'];   // untaken-branch / self-annulling shots

const guards = {};
const report = [];

Object.assign(guards, rBars(report));

/* B — the exemption claims, measured: moon gate (night/guard) and the el-76 clamp
   identity (interior), each diff(off, con) == 0 same-boot. */
for (const shot of EXEMPT) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'con')));
  report.push(`B ${shot.padEnd(12)} off-vs-con  ${d} px`);
  guards[`B_${shot}`] = guards[`R_${shot}`] !== true ? null : (d === null ? null : d === 0);
}

/* hero ROI stats. */
const H = {};
for (const arm of ['off', 'con', 'cko']) {
  const im = img(row('hero', arm));
  H[arm] = im ? { LITF: stats(im, LITF), SH: stats(im, SHFLOOR) } : null;
  if (H[arm]) report.push(`hero.${arm.padEnd(4)} LITF L ${H[arm].LITF.meanL.toFixed(1)} R-B ${H[arm].LITF.meanRB.toFixed(1)} hue ${H[arm].LITF.hMean.toFixed(1)}   SHFLOOR L ${H[arm].SH.meanL.toFixed(1)} R-B ${H[arm].SH.meanRB.toFixed(1)}`);
}
const okHero = guards.R_hero === true && H.off && H.con;

/* BG_c — the diagnosed mid-band floor + shadow pairing must be present on the off arm. */
guards.BG_c = !H.off ? null
  : (H.off.LITF.meanL >= 85 && H.off.LITF.meanL <= 150 && H.off.LITF.meanRB >= 40
    && H.off.SH.meanL >= 45 && H.off.SH.meanL <= 95 && H.off.SH.meanRB <= 0);

const gated = okHero && guards.BG_c === true;

/* E1 — the raked floor rises toward the full key. */
if (gated) {
  const dL = H.con.LITF.meanL - H.off.LITF.meanL;
  report.push(`E1  LITF dL ${dL.toFixed(1)} (want +8..+45)`);
  guards.E1 = dL >= 8 && dL <= 45;
} else guards.E1 = null;

/* E2 — it stays the same warm hue (brighter, not recoloured). */
if (gated) {
  const dh = circDist(H.con.LITF.hMean, H.off.LITF.hMean);
  const dRB = H.con.LITF.meanRB - H.off.LITF.meanRB;
  report.push(`E2  LITF hue drift ${dh.toFixed(1)} (want <= 8)  dR-B ${dRB.toFixed(1)} (want >= -15)`);
  guards.E2 = dh <= 8 && dRB >= -15;
} else guards.E2 = null;

/* E3 — the long shadows read: lit:shadow separation grows, shadow cores hold. */
if (gated) {
  const r0 = H.off.LITF.meanL / H.off.SH.meanL;
  const r1 = H.con.LITF.meanL / H.con.SH.meanL;
  const dSh = Math.abs(H.con.SH.meanL - H.off.SH.meanL);
  report.push(`E3  lit:shadow ${r0.toFixed(2)} -> ${r1.toFixed(2)} (want >= +0.06)  |dL(SHFLOOR)| ${dSh.toFixed(1)} (want <= 5)`);
  guards.E3 = r1 >= r0 + 0.06 && dSh <= 5;
} else guards.E3 = null;

/* KO_c — dose monotone (hero cko, uRakeTrack 0.5 = half the terminator move). */
if (gated && H.cko) {
  const dOn = H.con.LITF.meanL - H.off.LITF.meanL;
  const dKo = H.cko.LITF.meanL - H.off.LITF.meanL;
  report.push(`KO_c  LITF dL cko ${dKo.toFixed(1)} vs con ${dOn.toFixed(1)} (want 0.35-0.85x)`);
  guards.KO_c = dKo >= 0.35 * dOn && dKo <= 0.85 * dOn;
} else guards.KO_c = null;

/* SUBJ — the subject exemption, measured where the character is the shot. */
{
  const o = img(row('sly-closeup', 'off')), c = img(row('sly-closeup', 'con'));
  if (guards['R_sly-closeup'] === true && o && c) {
    const d = Math.abs(stats(c, SUBJ).meanL - stats(o, SUBJ).meanL);
    report.push(`SUBJ  sly-closeup body rect |dL| ${d.toFixed(2)} (want <= 1.0)`);
    guards.SUBJ = d <= 1.0;
  } else guards.SUBJ = null;
}

/* P — bounded whole-frame movement on the daylight shots (floors may brighten; nothing
   may darken or cool beyond band). */
const P_BANDS = {
  temple: { lo: -3, hi: 3, rbLo: -6, rbHi: 6 },
  kaykit: { lo: -1, hi: 10, rbLo: -15, rbHi: 12 },
};
const P_DEFAULT = { lo: -1, hi: 14, rbLo: -15, rbHi: 12 };
for (const shot of ROSTER) {
  if (EXEMPT.includes(shot)) continue;
  const o = img(row(shot, 'off')), c = img(row(shot, 'con'));
  if (guards[`R_${shot}`] !== true || !o || !c) { guards[`P_${shot}`] = null; continue; }
  const so = stats(o, FULL), sc = stats(c, FULL);
  const dL = sc.meanL - so.meanL, dRB = sc.meanRB - so.meanRB;
  const b = P_BANDS[shot] ?? P_DEFAULT;
  report.push(`P ${shot.padEnd(12)} FULL dL ${dL.toFixed(2)} (want ${b.lo}..${b.hi})  dR-B ${dRB.toFixed(2)} (want ${b.rbLo}..${b.rbHi})`);
  guards[`P_${shot}`] = dL >= b.lo && dL <= b.hi && dRB >= b.rbLo && dRB <= b.rbHi;
}

/* VC — readbacks: every arm echoes its commanded uRakeTrack; the moon-gate ground holds. */
{
  let ok = true, n = 0;
  for (const shot of ROSTER) {
    const o = row(shot, 'off')?.readback, c = row(shot, 'con')?.readback, b = row(shot, 'back')?.readback;
    if (!o || !c || !b) { ok = null; break; }
    n++;
    if (o.uRakeTrack !== 0 || b.uRakeTrack !== 0 || c.uRakeTrack !== C_ON) { ok = false; report.push(`VC: ${shot} uRakeTrack ${o.uRakeTrack}/${c.uRakeTrack}/${b.uRakeTrack}`); break; }
    if (c.uRakeGap !== 0.05) { ok = false; report.push(`VC: ${shot} uRakeGap ${c.uRakeGap}`); break; }
    if ((shot === 'night' || shot === 'guard') && !(c.uKeyColor.r < c.uKeyColor.b)) {
      ok = false; report.push(`VC: ${shot} key not the moon (r ${c.uKeyColor.r} b ${c.uKeyColor.b})`); break;
    }
  }
  const ko = row('hero', 'cko')?.readback;
  if (ok === true && (!ko || ko.uRakeTrack !== C_KO)) { ok = false; report.push('VC: cko echo wrong'); }
  guards.VC = ok === null ? null : (ok && n === ROSTER.length);
}

guards.V4 = treeBar(report, 83);

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(14)} ${s}`);
console.log('');
console.log(verdictLine(v, `TUNE.rakeTrack = ${C_ON} (goldenrake — shared gradetrio boot; LOOK gate §8 still binds before any write)`));
process.exit(v.ship ? 0 : 1);

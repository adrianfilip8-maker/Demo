/**
 * PREREG-redkey §6 — the registered scorer. Reads progress/records/redkey/ and prints the
 * verdict through tools/gate.mjs (tri-state: VOID is not PASS; ship = every row PASS, and
 * the LOOK gate §9 is scored by a human from the frames — this scorer prints numbers only).
 * Fail-closed per §6: B/E/P/PW bars VOID unless their shot's R PASSED; KO1 needs R_sly-arm;
 * E1/KO1 need BG1. A mismatch between this file and the prereg voids the scoring, not the
 * seal.
 *
 *   node progress/records/redkey-score.mjs
 */
import { readPNG } from '../../tools/png.mjs';
import { shipVerdict, verdictLine } from '../../tools/gate.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'progress/records/redkey');

const ON_V = 0.45;
const ROIS = {
  SHIRT: ['sly-perch', [575, 235, 670, 345]],
  WALL: ['sly-perch', [900, 60, 1260, 330]],
  COIL: ['sly-arm', [180, 465, 450, 625]],
  GROUND: ['combat', [640, 560, 1120, 700]],
};
const FULL = [0, 0, 1280, 720];
const GOLDEN = ['hero', 'kaykit', 'temple', 'courtyard'];
const EXEMPT = ['night', 'guard', 'interior'];       // untaken-branch [0,0] shots
const WARM_SHOTS = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'traversal', 'combat', 'sly-profile', 'sly-key',
];
const ALL_SHOTS = [...WARM_SHOTS.slice(0, 9), 'interior', 'night', ...WARM_SHOTS.slice(9, 11), 'guard', ...WARM_SHOTS.slice(11)];

const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
const img = (r) => {
  if (!r) return null;
  const f = path.join(DIR, r.file);
  return existsSync(f) ? readPNG(f) : null;
};

/** display-byte stats over a rect: meanL, meanRB, mean HSV S, chroma-weighted circular hue
 *  mean + dispersion (deg) — the §4 statistics, spelled once. */
function stats(im, [x0, y0, x1, y1]) {
  let n = 0, sl = 0, srb = 0, ss = 0, cx = 0, cy = 0, wsum = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const R = im.data[o] / 255, G = im.data[o + 1] / 255, B = im.data[o + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    let h = 0;
    if (d > 1e-6) {
      if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    n++; sl += (0.2126 * R + 0.7152 * G + 0.0722 * B) * 255; srb += (R - B) * 255;
    ss += mx > 1e-6 ? d / mx : 0;
    cx += d * Math.cos(h * Math.PI / 180); cy += d * Math.sin(h * Math.PI / 180); wsum += d;
  }
  const Rbar = wsum > 1e-9 ? Math.hypot(cx, cy) / wsum : 0;
  return {
    n, meanL: sl / n, meanRB: srb / n, meanS: ss / n,
    hMean: wsum > 1e-9 ? ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360 : NaN,
    disp: Rbar > 1e-9 ? Math.sqrt(-2 * Math.log(Rbar)) * 180 / Math.PI : NaN,
  };
}
const circDist = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

function diffPx(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let d = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1]
      || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}
const bool = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : !!v);

const guards = {};
const report = [];

/* R1–R16 — validity per shot: diff(off, back) == 0. */
for (const shot of ALL_SHOTS) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
  report.push(`R ${shot.padEnd(12)} off-vs-back ${d} px`);
  guards[`R_${shot}`] = d === null ? null : d === 0;
}

/* B — the untaken-branch protection: diff(off, on) == 0 on night/guard/interior. */
for (const shot of EXEMPT) {
  const d = diffPx(img(row(shot, 'off')), img(row(shot, 'on')));
  report.push(`B ${shot.padEnd(12)} off-vs-on   ${d} px`);
  guards[`B_${shot}`] = guards[`R_${shot}`] !== true ? null : (d === null ? null : d === 0);
}

/* ROI stats off/on (and ko for COIL). */
const S = {};
for (const [name, [shot, rect]] of Object.entries(ROIS)) {
  const o = img(row(shot, 'off')), n = img(row(shot, 'on'));
  S[name] = { off: o && stats(o, rect), on: n && stats(n, rect), shot };
  if (S[name].off && S[name].on) {
    report.push(`${name.padEnd(6)} off: L ${S[name].off.meanL.toFixed(1)} R-B ${S[name].off.meanRB.toFixed(1)} S ${S[name].off.meanS.toFixed(3)} hue ${S[name].off.hMean.toFixed(1)} disp ${S[name].off.disp.toFixed(1)}`);
    report.push(`${name.padEnd(6)} on : L ${S[name].on.meanL.toFixed(1)} R-B ${S[name].on.meanRB.toFixed(1)} S ${S[name].on.meanS.toFixed(3)} hue ${S[name].on.hMean.toFixed(1)} disp ${S[name].on.disp.toFixed(1)}`);
  }
}
const koIm = img(row('sly-arm', 'ko'));
const koCoil = koIm && stats(koIm, ROIS.COIL[1]);
if (koCoil) report.push(`COIL   ko : disp ${koCoil.disp.toFixed(1)}  (dose arm 0.35)`);

/* BG1 — off-arm defect gates (§6): the diagnosed flood must be present. */
guards.BG1 = (S.COIL.off && S.SHIRT.off && S.GROUND.off)
  ? (S.COIL.off.disp <= 14 && S.SHIRT.off.meanS <= 0.42 && S.GROUND.off.disp <= 30)
  : null;

/* E1 — COIL dispersion re-emergence. */
guards.E1 = (guards.BG1 !== true || guards['R_sly-arm'] !== true || !S.COIL.on) ? null
  : (S.COIL.on.disp >= S.COIL.off.disp * 1.30 && S.COIL.on.disp >= S.COIL.off.disp + 2.5);

/* E2 — GROUND dispersion. */
guards.E2 = (guards.R_combat !== true || !S.GROUND.on) ? null
  : (S.GROUND.on.disp >= S.GROUND.off.disp * 1.12 && S.GROUND.on.disp >= S.GROUND.off.disp + 2.0);

/* E3 — SHIRT: saturation up AND hue toward the reference blue 220. */
{
  const ok = guards['R_sly-perch'] !== true || !S.SHIRT.on ? null
    : (S.SHIRT.on.meanS >= S.SHIRT.off.meanS + 0.015
      && circDist(S.SHIRT.on.hMean, 220) <= circDist(S.SHIRT.off.hMean, 220) - 3);
  if (S.SHIRT.on) report.push(`E3     circDist(hue,220): off ${circDist(S.SHIRT.off.hMean, 220).toFixed(1)} -> on ${circDist(S.SHIRT.on.hMean, 220).toFixed(1)}   dS ${(S.SHIRT.on.meanS - S.SHIRT.off.meanS).toFixed(3)}`);
  guards.E3 = ok;
}

/* KO1 — dose monotone on the COIL. */
guards.KO1 = (guards.BG1 !== true || guards['R_sly-arm'] !== true || !koCoil || !S.COIL.on) ? null
  : (koCoil.disp >= S.COIL.on.disp + 2);

/* P — golden/daylight protections, full frame. */
for (const shot of [...GOLDEN, 'dunes']) {
  const o = img(row(shot, 'off')), n = img(row(shot, 'on'));
  if (!o || !n || guards[`R_${shot}`] !== true) { guards[`P_${shot}`] = guards[`R_${shot}`] !== true ? null : null; continue; }
  const so = stats(o, FULL), sn = stats(n, FULL);
  const dL = sn.meanL - so.meanL, dRB = sn.meanRB - so.meanRB;
  const capL = shot === 'dunes' ? 5 : 4, capRB = shot === 'dunes' ? -14 : -12;
  report.push(`P ${shot.padEnd(10)} FULL dMeanL ${dL.toFixed(2)}  dR-B ${dRB.toFixed(2)}  (caps |L|<=${capL}, dR-B>=${capRB})`);
  guards[`P_${shot}`] = Math.abs(dL) <= capL && dRB >= capRB;
}

/* PW — the flood stays warm (perch WALL). */
guards.PW = (guards['R_sly-perch'] !== true || !S.WALL.on) ? null
  : (S.WALL.on.meanRB >= 60 && S.WALL.on.meanRB >= S.WALL.off.meanRB - 25);

/* VK — on-arm readbacks (§6). */
{
  let ok = true, n = 0;
  for (const shot of ALL_SHOTS) {
    const r = row(shot, 'on');
    if (!r?.readback?.uKeyColor) { ok = null; break; }
    n++;
    const rb = r.readback, off = row(shot, 'off')?.readback;
    if (!off?.uKeyColor) { ok = null; break; }
    if (WARM_SHOTS.includes(shot)) {
      if (Math.abs(rb.sat - ON_V) > 1e-6) { ok = false; report.push(`VK: ${shot}.on sat ${rb.sat} != ${ON_V}`); break; }
    } else {
      const same = rb.uKeyColor.r === off.uKeyColor.r && rb.uKeyColor.g === off.uKeyColor.g && rb.uKeyColor.b === off.uKeyColor.b;
      if (!same) { ok = false; report.push(`VK: ${shot}.on uKeyColor moved though exempt`); break; }
      if (shot === 'interior' ? !(rb.sat < ON_V) : !(rb.uKeyColor.r < rb.uKeyColor.b)) {
        ok = false; report.push(`VK: ${shot}.on exemption ground does not hold (sat ${rb.sat}, r ${rb.uKeyColor.r}, b ${rb.uKeyColor.b})`); break;
      }
    }
    if (rb.keySatMax !== ON_V) { ok = false; report.push(`VK: ${shot}.on echoes keySatMax ${rb.keySatMax}`); break; }
  }
  guards.VK = ok === null ? null : (ok && n === ALL_SHOTS.length);
}

/* V3 — off/back echo 1 and carry the identical uKeyColor triple. */
{
  let ok = true, n = 0;
  for (const shot of ALL_SHOTS) {
    const o = row(shot, 'off')?.readback, b = row(shot, 'back')?.readback;
    if (!o?.uKeyColor || !b?.uKeyColor) { ok = null; break; }
    n++;
    if (o.keySatMax !== 1 || b.keySatMax !== 1) { ok = false; report.push(`V3: ${shot} off/back echo ${o.keySatMax}/${b.keySatMax}`); break; }
    if (o.uKeyColor.r !== b.uKeyColor.r || o.uKeyColor.g !== b.uKeyColor.g || o.uKeyColor.b !== b.uKeyColor.b) {
      ok = false; report.push(`V3: ${shot} uKeyColor off != back`); break;
    }
  }
  guards.V3 = ok === null ? null : (ok && n === ALL_SHOTS.length);
}

/* V4 — 49 rows, one src hash == the launch-derived HEAD archive hash. */
{
  const hs = new Set();
  for (const r of manifest.rows) hs.add(r.tree?.src || '?');
  report.push(`trees: {${[...hs]}} expected ${manifest.expect?.head}; rows ${manifest.rows.length}`);
  guards.V4 = manifest.rows.length === 49 && hs.size === 1 && [...hs][0] === manifest.expect?.head;
}

for (const k of Object.keys(guards)) guards[k] = bool(guards[k]);
console.log(report.join('\n'));
console.log('');
const v = shipVerdict(guards);
for (const [k, s] of Object.entries(v.states)) console.log(`  ${k.padEnd(14)} ${s}`);
console.log('');
console.log(verdictLine(v, 'TUNE.keySatMax = 0.45 (redkey — one boot, poked arms; LOOK gate §9 still binds before any write)'));
process.exit(v.ship ? 0 : 1);

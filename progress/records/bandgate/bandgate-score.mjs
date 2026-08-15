/**
 * PREREG-bandgate §5-§6 — the registered scorer. Every band fixed before the first frame.
 * Fail-closed: CAL / R / CLIP / V_ROWS / PF_LIT gate the measurement; a failure VOIDs.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.env.BANDGATE_DIR || path.join(ROOT, 'progress/records/bandgate1');
const LIT  = [908, 322, 948, 358];      // §3 — verified against shots/r12
const TERM = [1044, 322, 1090, 358];    // §3 — must NOT extend past ~1090
const CAL_U8 = [64, 128, 191];
const CAL_MIN_FRAC = 0.05, CLIP_MAX = 0.05, EXPECT_ROWS = 4;
const PF_LIT_MIN = 0.80;                // §5 — the instrument's own control
const SHADOW_MAX = 0.20, MID_MIN = 0.35; // §6

if (!existsSync(path.join(DIR, 'manifest.json'))) { console.error(`no manifest at ${DIR}`); process.exit(3); }
const m = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (a) => m.rows.find((r) => r.arm === a) || null;
const img = (r) => { try { return r ? readPNG(path.join(DIR, r.file)) : null; } catch { return null; } };
const off = img(row('off')), ramp = img(row('ramp')), cal = img(row('cal')), back = img(row('back'));
const report = [], guards = {};

/** mean of a channel over a rect, on byte/255 (the buffer is linear+undecoded, §2) */
function meanCh(im, [x0, y0, x1, y1], ch) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += im.data[(y * im.w + x) * im.ch + ch] / 255; n++; }
  return n ? s / n : null;
}
function clipFrac(im, [x0, y0, x1, y1]) {
  let c = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    if (im.data[o] >= 255 || im.data[o + 1] >= 255 || im.data[o + 2] >= 255) c++;
    n++;
  }
  return n ? c / n : null;
}

guards.V_ROWS = m.rows.length === EXPECT_ROWS;
report.push(`V_ROWS  ${m.rows.length} rows (want ${EXPECT_ROWS})`);
{
  let hit = 0;
  if (cal) for (let i = 0; i < cal.w * cal.h; i++) {
    const o = i * cal.ch;
    if (Math.abs(cal.data[o] - CAL_U8[0]) <= 1 && Math.abs(cal.data[o + 1] - CAL_U8[1]) <= 1
      && Math.abs(cal.data[o + 2] - CAL_U8[2]) <= 1) hit++;
  }
  const f = cal ? hit / (cal.w * cal.h) : null;
  report.push(`CAL  (64,128,191) over ${f === null ? '—' : (100 * f).toFixed(1) + '%'} (want >= ${100 * CAL_MIN_FRAC}%)`);
  guards.CAL = f === null ? null : f >= CAL_MIN_FRAC;
}
{
  let d = null;
  if (off && back) { d = 0; for (let i = 0; i < off.w * off.h; i++) { const a = i * off.ch, b = i * back.ch;
    if (off.data[a] !== back.data[b] || off.data[a+1] !== back.data[b+1] || off.data[a+2] !== back.data[b+2]) d++; } }
  report.push(`R  off-vs-back ${d === null ? '—' : d} px (want 0)`);
  guards.R = d === null ? null : d === 0;
}
{
  const f = ramp ? clipFrac(ramp, TERM) : null;
  report.push(`CLIP ${f === null ? '—' : (100 * f).toFixed(1) + '%'} of terminator px at 255 (want < ${100 * CLIP_MAX}%)`);
  guards.CLIP = f === null ? null : f < CLIP_MAX;
}
const rampLit = ramp ? meanCh(ramp, LIT, 0) : null;
const rampT   = ramp ? meanCh(ramp, TERM, 0) : null;
{
  report.push(`PF_LIT  lit control mean ramp ${rampLit === null ? '—' : rampLit.toFixed(3)} (want >= ${PF_LIT_MIN})`);
  guards.PF_LIT = rampLit === null ? null : rampLit >= PF_LIT_MIN;
}
const VALID = Object.values(guards).every((v) => v === true);

report.push('');
report.push(`ramp  LIT control  : ${rampLit === null ? '—' : rampLit.toFixed(3)}`);
report.push(`ramp  TERMINATOR   : ${rampT === null ? '—' : rampT.toFixed(3)}`);
if (ramp) {
  report.push(`ndl   TERMINATOR   : ${meanCh(ramp, TERM, 1).toFixed(3)}   key: ${meanCh(ramp, TERM, 2).toFixed(3)}  (context, not bars)`);
}
report.push(`bands: SHADOW <= ${SHADOW_MAX}  ·  MID >= ${MID_MIN}   (TUNE.bands 3)`);

for (const l of report) console.log(l);
console.log('');
if (!VALID) {
  console.log('==> VOID — a validity gate failed; NOTHING is claimed in either direction.');
  for (const [k, v] of Object.entries(guards)) console.log(`    ${k.padEnd(8)} ${v === true ? 'PASS' : v === false ? 'FAIL' : 'VOID'}`);
  process.exit(1);
}
if (rampT <= SHADOW_MAX) console.log('==> SHADOW BAND — the terminator is in the ramp\'s shadow band. The §336 item is ALIVE and a shade-scoped tint lever can reach it.');
else if (rampT >= MID_MIN) console.log('==> MID BAND — the face receives direct key. 345 -> 218 is UNREACHABLE at any legal dose; the item closes as mis-aimed and the successor must target the LIT path or the geometry, not the shadow tint.');
else console.log('==> INCONCLUSIVE — ramp falls between the sealed bands. Claim neither.');

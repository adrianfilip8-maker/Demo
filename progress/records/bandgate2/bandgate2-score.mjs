/**
 * PREREG-bandgate2 §5-§7 — the registered scorer. Every band fixed before the first frame.
 * Two changes from bandgate, both forced by §340: an ORDERING control (PF_ORDER) instead of an
 * absolute one, and a per-pixel HISTOGRAM instead of a mean, because the terminator rect sits on
 * a band boundary and a mean there conflates "all shadow" with "mostly shadow".
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.env.BANDGATE2_DIR || path.join(ROOT, 'progress/records/bandgate2run');
const LIT  = [908, 322, 948, 358];
const TERM = [1044, 322, 1090, 358];
const CAL_U8 = [64, 128, 191];
const CAL_MIN_FRAC = 0.05, CLIP_MAX = 0.05, EXPECT_ROWS = 4;
const ORDER_MIN = 0.25;                       // §6 PF_ORDER — half a band step
const SHADOW_HI = 0.25, LIT_LO = 0.75;        // §5 class boundaries (nominal levels 0/0.5/1.0)
const SHADOW_FRAC = 0.80, MID_FRAC = 0.50;    // §7

if (!existsSync(path.join(DIR, 'manifest.json'))) { console.error(`no manifest at ${DIR}`); process.exit(3); }
const m = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (a) => m.rows.find((r) => r.arm === a) || null;
const img = (r) => { try { return r ? readPNG(path.join(DIR, r.file)) : null; } catch { return null; } };
const off = img(row('off')), ramp = img(row('ramp')), cal = img(row('cal')), back = img(row('back'));
const report = [], guards = {};

const vals = (im, [x0, y0, x1, y1]) => {
  const a = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a.push(im.data[(y * im.w + x) * im.ch] / 255);
  return a;
};
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };

guards.V_ROWS = m.rows.length === EXPECT_ROWS;
report.push(`V_ROWS  ${m.rows.length} rows (want ${EXPECT_ROWS})`);
{
  let hit = 0;
  if (cal) for (let i = 0; i < cal.w * cal.h; i++) {
    const o = i * cal.ch;
    if (Math.abs(cal.data[o]-CAL_U8[0]) <= 1 && Math.abs(cal.data[o+1]-CAL_U8[1]) <= 1 && Math.abs(cal.data[o+2]-CAL_U8[2]) <= 1) hit++;
  }
  const f = cal ? hit/(cal.w*cal.h) : null;
  report.push(`CAL  (64,128,191) over ${f===null?'—':(100*f).toFixed(1)+'%'} (want >= ${100*CAL_MIN_FRAC}%)`);
  guards.CAL = f === null ? null : f >= CAL_MIN_FRAC;
}
{
  let d = null;
  if (off && back) { d = 0; for (let i = 0; i < off.w*off.h; i++) { const a = i*off.ch, b = i*back.ch;
    if (off.data[a]!==back.data[b] || off.data[a+1]!==back.data[b+1] || off.data[a+2]!==back.data[b+2]) d++; } }
  report.push(`R  off-vs-back ${d===null?'—':d} px (want 0)`);
  guards.R = d === null ? null : d === 0;
}
{
  let c = 0, n = 0;
  if (ramp) for (let y = TERM[1]; y < TERM[3]; y++) for (let x = TERM[0]; x < TERM[2]; x++) {
    const o = (y*ramp.w+x)*ramp.ch;
    if (ramp.data[o] >= 255 || ramp.data[o+1] >= 255 || ramp.data[o+2] >= 255) c++;
    n++;
  }
  const f = n ? c/n : null;
  report.push(`CLIP ${f===null?'—':(100*f).toFixed(1)+'%'} of terminator px at 255 (want < ${100*CLIP_MAX}%)`);
  guards.CLIP = f === null ? null : f < CLIP_MAX;
}
const vLit = ramp ? vals(ramp, LIT) : null;
const vTerm = ramp ? vals(ramp, TERM) : null;
const mLit = vLit ? median(vLit) : null, mTerm = vTerm ? median(vTerm) : null;
{
  const gap = (mLit !== null && mTerm !== null) ? mLit - mTerm : null;
  report.push(`PF_ORDER  median lit ${mLit===null?'—':mLit.toFixed(3)} − median term ${mTerm===null?'—':mTerm.toFixed(3)} = ${gap===null?'—':gap.toFixed(3)} (want >= ${ORDER_MIN})`);
  guards.PF_ORDER = gap === null ? null : gap >= ORDER_MIN;
}
const VALID = Object.values(guards).every((v) => v === true);

let fs = null, fm = null, fl = null;
if (vTerm) {
  const s = vTerm.filter((v) => v < SHADOW_HI).length;
  const l = vTerm.filter((v) => v >= LIT_LO).length;
  fs = s / vTerm.length; fl = l / vTerm.length; fm = 1 - fs - fl;
}
report.push('');
report.push(`TERMINATOR histogram over ${vTerm ? vTerm.length : '—'} px:`);
report.push(`   SHADOW (<${SHADOW_HI})  ${fs===null?'—':(100*fs).toFixed(1)+'%'}   MID  ${fm===null?'—':(100*fm).toFixed(1)+'%'}   LIT (>=${LIT_LO})  ${fl===null?'—':(100*fl).toFixed(1)+'%'}`);
report.push(`bands: SHADOW BAND if frac(SHADOW) >= ${SHADOW_FRAC}  ·  MID BAND if frac(MID) >= ${MID_FRAC}`);

for (const l of report) console.log(l);
console.log('');
if (!VALID) {
  console.log('==> VOID — a validity gate failed; NOTHING is claimed in either direction.');
  for (const [k, v] of Object.entries(guards)) console.log(`    ${k.padEnd(9)} ${v===true?'PASS':v===false?'FAIL':'VOID'}`);
  process.exit(1);
}
if (fs >= SHADOW_FRAC) console.log("==> SHADOW BAND — §336's item is ALIVE. A shade-scoped lever can reach the terminator; the successor targets the RED (linear R/G 3.74 -> <= 0.90), not the blue.");
else if (fm >= MID_FRAC) console.log('==> MID BAND — the face receives direct key. 345 -> 218 is UNREACHABLE at any legal dose; the item CLOSES as mis-aimed and the successor must target the LIT path or the geometry.');
else console.log('==> MIXED / INCONCLUSIVE — the rect straddles the boundary too evenly to call. Report the histogram and re-aim the rect in a NEW seal; do not pick the convenient reading.');

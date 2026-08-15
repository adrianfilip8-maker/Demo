/**
 * PREREG-linchroma §4-§5 — the registered scorer. Every band was fixed before the first frame.
 * Fail-closed: CAL / R / CLIP / V_ROWS gate the measurement; a failure VOIDs and claims nothing.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIR = process.env.LINCHROMA_DIR || path.join(ROOT, 'progress/records/linchroma1');
const RECT = [557, 261, 582, 291];
const ALB_CHROMA = 0.990;              // §5 — PREREG-lithold §0(a), 146,505 texels, not re-derived
const CONFIRM = 0.80 * ALB_CHROMA;     // 0.792
const REFUTE  = 0.50 * ALB_CHROMA;     // 0.495
const CAL_U8 = [64, 128, 191];         // §2 — debugTerm(4) writes (0.25,0.50,0.75)
const CAL_MIN_FRAC = 0.05;
const CLIP_MAX = 0.05;
const EXPECT_ROWS = 4;

if (!existsSync(path.join(DIR, 'manifest.json'))) { console.error(`no manifest at ${DIR}`); process.exit(3); }
const m = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const row = (a) => m.rows.find((r) => r.arm === a) || null;
const img = (r) => { try { return r ? readPNG(path.join(DIR, r.file)) : null; } catch { return null; } };
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const off = img(row('off')), raw = img(row('raw')), cal = img(row('cal')), back = img(row('back'));
const report = [], guards = {};

/* the measured pixel set: brightest half of the rect, taken from OFF (§3) */
let PIX = [];
if (off) {
  const px = [];
  for (let y = RECT[1]; y < RECT[3]; y++) for (let x = RECT[0]; x < RECT[2]; x++) {
    const i = y * off.w + x, o = i * off.ch;
    px.push({ i, L: lum(off.data[o], off.data[o + 1], off.data[o + 2]) });
  }
  px.sort((a, b) => b.L - a.L);
  PIX = px.slice(0, Math.round(px.length / 2)).map((p) => p.i);
}

guards.V_ROWS = m.rows.length === EXPECT_ROWS;
report.push(`V_ROWS  ${m.rows.length} rows (want ${EXPECT_ROWS})`);

/* CAL — the bypass proves itself in this boot */
{
  let hit = 0;
  if (cal) for (let i = 0; i < cal.w * cal.h; i++) {
    const o = i * cal.ch;
    if (Math.abs(cal.data[o] - CAL_U8[0]) <= 1 && Math.abs(cal.data[o + 1] - CAL_U8[1]) <= 1
      && Math.abs(cal.data[o + 2] - CAL_U8[2]) <= 1) hit++;
  }
  const frac = cal ? hit / (cal.w * cal.h) : null;
  report.push(`CAL  (64,128,191) over ${frac === null ? '—' : (100 * frac).toFixed(1) + '%'} of frame (want >= ${100 * CAL_MIN_FRAC}%)`);
  guards.CAL = frac === null ? null : frac >= CAL_MIN_FRAC;
}
/* R — same-boot bracket */
{
  let d = null;
  if (off && back) { d = 0; for (let i = 0; i < off.w * off.h; i++) { const a = i * off.ch, b = i * back.ch;
    if (off.data[a] !== back.data[b] || off.data[a + 1] !== back.data[b + 1] || off.data[a + 2] !== back.data[b + 2]) d++; } }
  report.push(`R  off-vs-back ${d === null ? '—' : d} px (want 0)`);
  guards.R = d === null ? null : d === 0;
}
/* CLIP — an HDR buffer in an 8-bit blit */
{
  let clipped = 0;
  if (raw) for (const i of PIX) { const o = i * raw.ch;
    if (raw.data[o] >= 255 || raw.data[o + 1] >= 255 || raw.data[o + 2] >= 255) clipped++; }
  const frac = raw && PIX.length ? clipped / PIX.length : null;
  report.push(`CLIP ${frac === null ? '—' : (100 * frac).toFixed(1) + '%'} of measured px at 255 (want < ${100 * CLIP_MAX}%)`);
  guards.CLIP = frac === null ? null : frac < CLIP_MAX;
}

const VALID = guards.V_ROWS === true && guards.CAL === true && guards.R === true && guards.CLIP === true;

/* THE MEASUREMENT — linear chroma on byte/255, per §2's proof that the buffer is undecoded */
let linC = null, dispC = null;
if (raw && PIX.length) {
  let s = 0;
  for (const i of PIX) { const o = i * raw.ch;
    const R = raw.data[o] / 255, G = raw.data[o + 1] / 255, B = raw.data[o + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    s += mx > 1e-6 ? (mx - mn) / mx : 0; }
  linC = s / PIX.length;
}
if (off && PIX.length) {
  let s = 0;
  for (const i of PIX) { const o = i * off.ch;
    const R = off.data[o] / 255, G = off.data[o + 1] / 255, B = off.data[o + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    s += mx > 1e-6 ? (mx - mn) / mx : 0; }
  dispC = s / PIX.length;
}
report.push('');
report.push(`measured px            : ${PIX.length}`);
report.push(`DISPLAY chroma (off)   : ${dispC === null ? '—' : dispC.toFixed(3)}   <- what litbleach2 measured as S`);
report.push(`LINEAR chroma (raw)    : ${linC === null ? '—' : linC.toFixed(3)}`);
report.push(`albedo chroma (sealed) : ${ALB_CHROMA.toFixed(3)}`);
report.push(`ratio linear/albedo    : ${linC === null ? '—' : (linC / ALB_CHROMA).toFixed(3)}`);
report.push(`bands: CONFIRMED >= ${CONFIRM.toFixed(3)}  ·  REFUTED <= ${REFUTE.toFixed(3)}`);

for (const l of report) console.log(l);
console.log('');
if (!VALID) {
  console.log('==> VOID — a validity gate failed; NOTHING is claimed in either direction.');
  console.log(`    V_ROWS ${guards.V_ROWS} · CAL ${guards.CAL} · R ${guards.R} · CLIP ${guards.CLIP}`);
  process.exit(1);
}
if (linC >= CONFIRM) console.log('==> CONFIRMED — the pixel leaves the shader essentially fully chromatic. The bleach is produced DOWNSTREAM (AgX + grade). §277/§312 re-routes SHADING -> POSTFX.');
else if (linC <= REFUTE) console.log('==> REFUTED — substantial chroma IS lost in linear, so `loss` should have been large. The 25x divergence needs another explanation.');
else console.log('==> INCONCLUSIVE — linear chroma falls between the sealed bands. Claim neither.');

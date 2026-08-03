#!/usr/bin/env node
/**
 * hgcdetrend — POST-HOC diagnostic for RESULT-hgchisel-frame §4's P3.
 *
 * NOT a registered gate and it cannot pass or fail P3. P3 is scored exactly as sealed, by
 * `hgcscore.mjs`, on the raw column-mean profile. This exists only to answer the question the
 * sealed number raised: hero's far band returns rho = 0.815 in BOTH arms (cand 0.816, ctl 0.815),
 * which is above the 0.45 gate and essentially unmoved by the treatment. A repeat detector and a
 * ramp detector return the same thing on a profile with a trend in it, so this separates them.
 *
 * SCOPE — the transforms between this and what the renderer drew (KNOWN_ISSUES §11), i.e. the
 * suffix NOT implemented:
 *   - identical to `hgcscore.mjs`: architecture-only masks (no props/terrain/character/FX/sky),
 *     display luma after the whole grade, one boot / two page loads, mask from the current tree.
 *   - the ONLY change is the profile that goes into the correlator: v -> v - box(v, HP). A
 *     high-pass cannot create a periodicity that is not there, but it CAN raise the relative
 *     weight of one that is, which is the entire point and is why this is a diagnostic and the
 *     raw number is what the seal scores.
 *   - the correlator is the same bounded per-lag Pearson coefficient. Nothing here can return a
 *     value outside [-1, 1]; if it does, this file is broken (`hgframe.mjs:64` / `acf.mjs:15`
 *     carry the unbounded v0*k/N form and printed rho = -1.370 on a 194 px strip).
 *
 *   node hgcdetrend.mjs --png shots/hgc/hero.png --mask ab-hgc/hero-mask.bin \
 *        --rows 24,140 --hp 300 [--mat arch:hieroglyph_gilded]
 */
import { readFileSync } from 'node:fs';
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const PNGF = opt('png'), MASKF = opt('mask'), HP = +opt('hp', '300');
const MAT = opt('mat', 'arch:hieroglyph_gilded');
const [Y0, Y1] = opt('rows', '0,720').split(',').map(Number);

const meta = JSON.parse(readFileSync(MASKF + '.json', 'utf8'));
const mask = new Uint8Array(readFileSync(MASKF));
const W = meta.W, H = meta.H, mi = meta.mats.indexOf(MAT);
const im = readPNG(PNGF);
const L = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) { const o = i * im.ch; L[i] = (im.data[o] * 0.2126 + im.data[o + 1] * 0.7152 + im.data[o + 2] * 0.0722) / 255; }

// same 3 px erosion as hgcscore
const keep = new Uint8Array(W * H);
for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
  const k = y * W + x; if (mask[k] !== mi) continue;
  let ok = 1;
  for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (mask[(y + dy) * W + x + dx] !== mi) { ok = 0; break; }
  if (ok) keep[k] = 1;
}

const col = new Float64Array(W), cnt = new Float64Array(W);
for (let y = Y0; y < Y1; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (keep[k]) { col[x] += L[k]; cnt[x]++; } }
const sup = new Uint8Array(W);
for (let x = 0; x < W; x++) sup[x] = cnt[x] > (Y1 - Y0) * 0.15 ? 1 : 0;
let best = [0, 0], cur = -1;
for (let x = 0; x <= W; x++) {
  const on = x < W && sup[x];
  if (on && cur < 0) cur = x;
  if (!on && cur >= 0) { if (x - cur > best[1] - best[0]) best = [cur, x]; cur = -1; }
}
const [x0, x1] = best, N = x1 - x0;
const v = []; for (let x = x0; x < x1; x++) v.push(col[x] / cnt[x]);

/** 1-D box, edge-clamped — the trend estimate that gets subtracted. */
function box1(a, r) {
  const o = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, c = 0;
    for (let j = i - r; j <= i + r; j++) { s += a[Math.min(a.length - 1, Math.max(0, j))]; c++; }
    o[i] = s / c;
  }
  return o;
}
const tr = box1(v, Math.floor(HP / 2));
const d = v.map((q, i) => q - tr[i]);

function acf(a) {
  const n0 = a.length, top = Math.min(300, Math.floor(n0 / 2)), out = [];
  for (let lag = 1; lag <= top; lag++) {
    const n = n0 - lag;
    let m1 = 0, m2 = 0;
    for (let i = 0; i < n; i++) { m1 += a[i]; m2 += a[i + lag]; }
    m1 /= n; m2 /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const p = a[i] - m1, q = a[i + lag] - m2; sxy += p * q; sxx += p * p; syy += q * q; }
    out.push([lag, sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0]);
  }
  return { out, top };
}

const raw = acf(v), det = acf(d);
const band = (o) => o.filter(([l]) => l >= 30 && l <= 300);
const mx = (o) => band(o).slice().sort((a, b) => b[1] - a[1])[0] || [null, NaN];
const sd = (a) => { const m = a.reduce((s, q) => s + q, 0) / a.length; return Math.sqrt(a.reduce((s, q) => s + (q - m) ** 2, 0) / a.length); };
const rng = (o, lo, hi) => { const s = band(o).filter(([l]) => l >= lo && l <= hi); return s.length ? s.slice().sort((a, b) => b[1] - a[1])[0] : [null, NaN]; };

console.log(`\n${PNGF}  ${MAT}  rows ${Y0}-${Y1}`);
console.log(`  contiguous supported run x${x0}-${x1} (${N} px), lags to ${raw.top}, high-pass box ${HP} px`);
console.log(`  profile sd: raw ${sd(v).toFixed(5)}   detrended ${sd(d).toFixed(5)}   (trend carries ${(100 * (1 - sd(d) / sd(v))).toFixed(1)}% of the profile's variation)`);
const [rl, rr] = mx(raw.out), [dl, dr] = mx(det.out);
console.log(`  max rho in lags 30-300:   RAW  lag ${rl} = ${rr.toFixed(3)}      DETRENDED  lag ${dl} = ${dr.toFixed(3)}`);
const [pl, pr] = rng(det.out, 129, 207);
console.log(`  detrended max inside the band's own repeat range 129-207 px: lag ${pl} = ${pr == null ? 'n/a' : pr.toFixed(3)}`);
console.log('  detrended rho at repeat lags — ' + [129, 137, 154, 157, 176, 192, 207].map((l) => {
  const e = det.out.find(([q]) => q === l); return `${l} ${e ? e[1].toFixed(3) : 'n/a'}`;
}).join('  '));
const first = raw.out.filter(([l]) => l <= 40).map(([l, r]) => `${l}:${r.toFixed(3)}`).slice(0, 4).join(' ');
console.log(`  raw rho at the short end (a monotone decline from lag 1 is a ramp, not a repeat): ${first}`);

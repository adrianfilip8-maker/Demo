/**
 * hgframe — P2 (squint sd) and P3 (horizontal ACF) for PREREG-hgrelief, inside a material mask.
 *
 * ── THE P3 ACF AT LINE ~64 IS NOT AN NCC AND IS NOT BOUNDED TO [-1, 1]. KNOWN_ISSUES §144. ───
 * `s / (v0 * k / N)` shrinks its own denominator as the lag grows (`k = N - lag`), inflating ρ at
 * long lags on short series; **−1.370 was measured on a 194 px strip.** Deliberately not patched,
 * because published numbers were scored with it and changing the estimator would retroactively
 * alter what they mean. Do not start a new measurement here — use the bounded per-lag Pearson NCC
 * in `progress/records/hgcscore.mjs`. Same defect, same expression, in `acf.mjs`.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * SCOPE — the transforms between this and what the renderer drew (what it does NOT do):
 *   the mask is ARCHITECTURE-ONLY, built offline from the CURRENT tree with the shot's camera:
 *   no props, terrain, character, FX or sky, so any frame pixel those cover is attributed to
 *   the masonry behind them, and a wall that moved since the capture is misattributed outright.
 *   No lighting, no shadow, no grade is modelled — the PNG has already been through all of it.
 *   The ACF is computed on the delivered display luma, so shadow edges and light shafts are in
 *   it alongside texture; that is why it is quoted as a *change* against the same ROI in a
 *   baseline frame, never as an absolute.
 *
 *   node hgframe.mjs <png> <maskbin> <material> [--band y0,y1] [--squintdiv 8]
 */
import { readFileSync } from 'node:fs';
import { readPNG } from '/home/user/Demo/tools/png.mjs';
const [png, maskbin, mat] = process.argv.slice(2);
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const meta = JSON.parse(readFileSync(maskbin + '.json', 'utf8'));
const mask = new Uint8Array(readFileSync(maskbin));
const img = readPNG(png);
const W = meta.W, H = meta.H;
if (img.w !== W || img.h !== H) throw new Error(`size mismatch ${img.w}x${img.h} vs ${W}x${H}`);
const mi = meta.mats.indexOf(mat);
if (mi < 0) throw new Error('material not in mask: ' + meta.mats.join(','));
const L = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) L[i] = (img.data[i*img.ch]*0.2126 + img.data[i*img.ch+1]*0.7152 + img.data[i*img.ch+2]*0.0722) / 255;
// erode 3 px so silhouettes and ink are not counted
const keep = new Uint8Array(W * H);
for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
  const k = y * W + x; if (mask[k] !== mi) continue;
  let ok = 1;
  for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (mask[(y+dy)*W + x+dx] !== mi) { ok = 0; break; }
  keep[k] = ok;
}
// P2: squint sd — box-downsample by D, keep cells that are >=80% mask
const D = parseInt(opt('squintdiv', '8'), 10);
const w = Math.floor(W / D), h = Math.floor(H / D);
let n = 0, m = 0, m2 = 0;
for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
  let s = 0, c = 0, tot = 0;
  for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) { const k = (v*D+j)*W + u*D+i; tot++; if (keep[k]) { s += L[k]; c++; } }
  if (c < 0.8 * tot) continue;
  const y = s / c; n++; m += y; m2 += y*y;
}
const sd = n ? Math.sqrt(Math.max(0, m2/n - (m/n)**2)) : 0;
console.log(`${png.split('/').slice(-2).join('/')} ${mat}: keptPx ${keep.reduce((a,b)=>a+b,0)}  squintCells ${n}  squintMean ${(m/Math.max(1,n)).toFixed(4)}  squintSD ${sd.toFixed(4)}`);
// P3: horizontal ACF over a band, mask-restricted columns
const band = (opt('band', null) || '').split(',').map(Number);
if (band.length === 2) {
  const [y0, y1] = band;
  const col = new Float64Array(W), cnt = new Float64Array(W);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const k = y*W+x; if (keep[k]) { col[x] += L[k]; cnt[x]++; } }
  const xs = []; for (let x = 0; x < W; x++) if (cnt[x] > (y1-y0)*0.5) xs.push(x);
  if (xs.length < 60) { console.log('   ACF: band has too few masked columns', xs.length); process.exit(0); }
  const x0 = xs[0], x1 = xs[xs.length-1];
  const v = []; for (let x = x0; x <= x1; x++) v.push(cnt[x] > 0 ? col[x]/cnt[x] : NaN);
  // linear-fill any gaps so the ACF is over a continuous strip
  for (let i = 0; i < v.length; i++) if (!isFinite(v[i])) { let a = i-1; while (a>=0 && !isFinite(v[a])) a--; let b=i+1; while (b<v.length && !isFinite(v[b])) b++;
    v[i] = (a>=0 && b<v.length) ? v[a] + (v[b]-v[a])*((i-a)/(b-a)) : (a>=0?v[a]:v[b]); }
  const N = v.length; let mu = 0; for (const q of v) mu += q; mu /= N;
  const c = v.map((q) => q - mu); let v0 = 0; for (const q of c) v0 += q*q;
  const out = [];
  for (let lag = 1; lag < Math.min(300, N - 30); lag++) { let s = 0, k = 0; for (let i = 0; i + lag < N; i++) { s += c[i]*c[i+lag]; k++; } out.push([lag, s / (v0 * k / N)]); }
  const srt = [...out].sort((a,b)=>b[1]-a[1]);
  console.log(`   ACF band y${y0}-${y1} over x${x0}-${x1} (${N}px): top ${srt.slice(0,8).map(([l,r])=>`${l}:${r.toFixed(3)}`).join(' ')}`);
  const mx = out.filter(([l])=>l>=30&&l<=300).sort((a,b)=>b[1]-a[1])[0];
  console.log(`   max lag in 30-300: ${mx[0]} = ${mx[1].toFixed(3)}`);
}

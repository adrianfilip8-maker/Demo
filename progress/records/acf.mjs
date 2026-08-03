/**
 * Horizontal autocorrelation of a PNG band. No lighting/geometry: reads the given PNG only.
 *
 * ── THIS IS NOT AN NCC AND ITS OUTPUT IS NOT BOUNDED TO [-1, 1]. KNOWN_ISSUES §144. ──────────
 * The normaliser below is `v0 * n / W`, where `n = W - lag` shrinks as the lag grows. So the
 * denominator shrinks with it and ρ is inflated at long lags on short series — TEXTURES measured
 * **ρ = −1.370** on a 194 px strip, which no correlation coefficient can return.
 *
 * **Deliberately NOT patched.** Published numbers were scored with this expression, and silently
 * changing the estimator would retroactively alter what those numbers mean without changing the
 * text that quotes them. Compare `void.mjs`, which WAS fixed: there the headline had never been
 * the condition its own comment defined, so no published result depended on the old behaviour.
 * Here one does.
 *
 * **So: do not start a new measurement with this file.** Use a bounded per-lag Pearson NCC —
 * `progress/records/hgcscore.mjs` has one. Read this only to reproduce an existing number, and
 * quote it as "the §144 estimator", never as a correlation.
 *
 * Same defect, same expression, at `progress/records/hgframe.mjs:64`.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
const [file, y0s, y1s] = process.argv.slice(2);
const _p = readPNG(file); const W = _p.w, H = _p.h, CH = _p.ch, data = _p.data;
const y0 = parseInt(y0s, 10), y1 = parseInt(y1s, 10);
const rows = y1 - y0;
const col = new Float64Array(W);
for (let x = 0; x < W; x++) { let s = 0; for (let y = y0; y < y1; y++) { const i = (y * W + x) * CH; s += 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2]; } col[x] = s / rows; }
let m = 0; for (let x = 0; x < W; x++) m += col[x]; m /= W;
const c = Float64Array.from(col, (v) => v - m);
let v0 = 0; for (let x = 0; x < W; x++) v0 += c[x] * c[x];
const out = [];
for (let lag = 1; lag < Math.min(300, W - 20); lag++) {
  let s = 0, n = 0; for (let x = 0; x + lag < W; x++) { s += c[x] * c[x + lag]; n++; }
  out.push([lag, s / (v0 * n / W)]);
}
out.sort((a, b) => b[1] - a[1]);
const top = out.slice(0, 10).map(([l, r]) => `${l}:${r.toFixed(3)}`).join(' ');
const at = (l) => { const e = out.find((o) => o[0] === l); return e ? e[1].toFixed(3) : 'n/a'; };
console.log(`${file.split('/').pop()} band ${y0}-${y1}: top ${top}`);
console.log(`   at 42=${at(42)}  84=${at(84)}  90=${at(90)}  126=${at(126)}  168=${at(168)}  252=${at(252)}`);

/**
 * celsurf — "does this surface read as cel?", measured on delivered frames.
 *
 * Implements critic 9's D6 instrument and nothing else, so that a number in this project can be
 * compared to a number in that review without a translation step.
 *
 * ── The definition is CALIBRATED, not chosen ────────────────────────────────────────────────
 *
 * D6 quotes a frame-wide statistic — *"the fraction of pixels in a truly flat 3x3 neighbourhood
 * is 0.15-0.18 in hero/courtyard/temple/traversal versus 0.296 in the reference"* — and "truly
 * flat" is not a definition. Nine candidate definitions were run against those five published
 * numbers BEFORE any candidate texture existed (the sweep is in PREREG-celband.md). Exactly one
 * reproduces all five:
 *
 *     L = 0.2126R + 0.7152G + 0.0722B on 0..255 floats, NOT rounded
 *     flat  <=>  max(L) - min(L) <= 2.0 over the 3x3 neighbourhood
 *
 *     definition          hero  courtyard  temple  traversal   ref     critic said
 *     rec709-raw-t2     0.1549     0.1506  0.1770     0.1833  0.2950   0.15-0.18 / 0.296
 *     rec709-round-t0   0.0216     0.0106  0.0075     0.0399  0.0956   -
 *     rec601-round-t2   0.2172     0.2147  0.2529     0.2355  0.3491   -
 *     mean-round-t2     0.1796     0.2181  0.2344     0.2271  0.3387   -
 *
 * Four of the five would have been within "0.15-0.18" for at least one of our frames. Only one
 * lands all four of ours inside the range *and* the reference on 0.296. That is the one below,
 * and `--tol` exists only so a reader can re-run the sweep, not so a result can be re-tuned.
 *
 * ── Why windows and not hand-placed patches ─────────────────────────────────────────────────
 *
 * D6's per-surface table is hand-placed ("temple.png column", "dunes.png pylon"). Those ROIs are
 * not recoverable from the review, and guessing them after seeing which frames failed is exactly
 * the re-scoping AGENTS forbids. So the per-surface half is reproduced as a *distribution*: every
 * WxW window on a stride grid is scored, windows that straddle a material boundary are rejected
 * by a chroma-spread test, and the surviving population is summarised by percentiles. The
 * frame-wide flat share, which IS recoverable exactly, is the anchor that says the two
 * instruments are measuring the same pixels.
 *
 *   node tools/celsurf.mjs shots/r9/*.png
 *   node tools/celsurf.mjs --json out.json shots/r9/hero.png
 *   node tools/celsurf.mjs --roi 300,220,96,96 shots/r9/hero.png
 */
import fs from 'node:fs';
import { readPNG } from './png.mjs';

const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const files = process.argv.slice(2).filter((a, i, arr) => a.endsWith('.png') && arr[i - 1] !== '--json' && arr[i - 1] !== '--roi');

const TOL = parseFloat(opt('tol', '2'));
const WIN = parseInt(opt('win', '64'), 10);
const STRIDE = parseInt(opt('stride', '32'), 10);
/* A window is "single material" when its chroma barely moves across it. Two different materials
 * meeting inside a window is the one thing that would inflate |dL/dx| for a reason D6 is not
 * about. The bar is the window's own (a*,b*) standard deviation in CIELAB; 4.0 is under two
 * just-noticeable differences, i.e. a window that a viewer would call one colour. */
const CHROMA_SD = parseFloat(opt('chroma', '4.0'));
/* Windows in near-darkness carry no readable surface at all and their statistics are dominated
 * by 8-bit quantisation, which reads as flatness. Excluded rather than counted as a success. */
const MIN_L = parseFloat(opt('minl', '20'));

export const lumaOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** sRGB byte -> CIELAB. D65. */
export function lab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116));
  const fx = k(X), fy = k(Y), fz = k(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export function luma(im) {
  const n = im.w * im.h, a = new Float64Array(n);
  for (let i = 0; i < n; i++) { const j = i * im.ch; a[i] = lumaOf(im.data[j], im.data[j + 1], im.data[j + 2]); }
  return a;
}

/** Share of interior pixels whose 3x3 neighbourhood spans <= tol luma. THE calibrated statistic. */
export function flatShare(a, w, h, tol = TOL) {
  let c = 0, t = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let mn = Infinity, mx = -Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) { const v = a[(y + dy) * w + x + dx]; if (v < mn) mn = v; if (v > mx) mx = v; }
      }
      t++; if (mx - mn <= tol) c++;
    }
  }
  return c / t;
}

/** D6's three per-surface numbers over an arbitrary pixel index list. */
export function surfaceStats(a, w, x0, y0, ww, hh) {
  let g = 0, gn = 0;
  for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww - 1; x++) { g += Math.abs(a[y * w + x + 1] - a[y * w + x]); gn++; }
  const hist = new Float64Array(256);
  let n = 0;
  for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) { hist[Math.max(0, Math.min(255, Math.round(a[y * w + x])))]++; n++; }
  const sorted = Array.from(hist).sort((p, q) => q - p);
  const top3 = (sorted[0] + sorted[1] + sorted[2]) / n;
  let lv = 0; for (let i = 0; i < 256; i++) if (hist[i] / n > 0.01) lv++;
  return { grad: g / gn, top3, levels: lv };
}

function chromaSD(im, x0, y0, ww, hh) {
  let sa = 0, sb = 0, sa2 = 0, sb2 = 0, sl = 0, n = 0;
  for (let y = y0; y < y0 + hh; y += 2) for (let x = x0; x < x0 + ww; x += 2) {
    const j = (y * im.w + x) * im.ch;
    const [L, A, B] = lab(im.data[j], im.data[j + 1], im.data[j + 2]);
    sl += L; sa += A; sb += B; sa2 += A * A; sb2 += B * B; n++;
  }
  const va = sa2 / n - (sa / n) ** 2, vb = sb2 / n - (sb / n) ** 2;
  return { sd: Math.sqrt(Math.max(0, va) + Math.max(0, vb)), meanL: sl / n };
}

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))] : NaN);

export function measure(file) {
  const im = readPNG(file);
  const a = luma(im);
  const flat = flatShare(a, im.w, im.h);
  const wins = [];
  for (let y = 0; y + WIN <= im.h; y += STRIDE) {
    for (let x = 0; x + WIN <= im.w; x += STRIDE) {
      const c = chromaSD(im, x, y, WIN, WIN);
      if (c.sd > CHROMA_SD) continue;
      if (c.meanL < MIN_L) continue;
      const st = surfaceStats(a, im.w, x, y, WIN, WIN);
      wins.push({ x, y, ...st, chroma: +c.sd.toFixed(2), meanL: +c.meanL.toFixed(1) });
    }
  }
  const gs = wins.map((v) => v.grad).sort((p, q) => p - q);
  const ts = wins.map((v) => v.top3).sort((p, q) => p - q);
  const ls = wins.map((v) => v.levels).sort((p, q) => p - q);
  return {
    file, w: im.w, h: im.h, flat: +flat.toFixed(4), nWin: wins.length,
    gradP: [10, 50, 90].map((p) => +pct(gs, p / 100).toFixed(2)),
    top3P: [10, 50, 90].map((p) => +pct(ts, p / 100).toFixed(3)),
    levelsP: [10, 50, 90].map((p) => pct(ls, p / 100)),
    gradMean: +(gs.reduce((s, v) => s + v, 0) / (gs.length || 1)).toFixed(2),
    wins,
  };
}

if (process.argv[1] && process.argv[1].endsWith('celsurf.mjs')) {
  const roi = opt('roi', null);
  const out = [];
  for (const f of files) {
    if (roi) {
      const [x, y, w, h] = roi.split(',').map(Number);
      const im = readPNG(f); const a = luma(im);
      const st = surfaceStats(a, im.w, x, y, w, h);
      console.log(`${f} roi ${roi}  grad ${st.grad.toFixed(2)}  top3 ${st.top3.toFixed(3)}  levels>1% ${st.levels}  flat ${flatShare(a.slice(), im.w, im.h).toFixed(4)}`);
      continue;
    }
    const m = measure(f);
    out.push(m);
    console.log(
      `${m.file.split('/').pop().replace('.png', '').padEnd(13)} flat ${m.flat.toFixed(4)}  ` +
      `n=${String(m.nWin).padStart(4)}  grad p10/50/90 ${m.gradP.map((v) => v.toFixed(2).padStart(5)).join(' ')}  ` +
      `top3 ${m.top3P.map((v) => v.toFixed(3)).join(' ')}  levels ${m.levelsP.join('/')}`,
    );
  }
  const j = opt('json', null);
  if (j) fs.writeFileSync(j, JSON.stringify(out.map(({ wins, ...r }) => ({ ...r, wins: wins.slice(0, 400) })), null, 1));
}

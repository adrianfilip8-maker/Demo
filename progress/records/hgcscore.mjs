#!/usr/bin/env node
/**
 * hgcscore — scores PREREG-hgchisel-frame's P1/P2/P3/P4 on a cand/ctl frame pair.
 *
 * SCOPE — the transforms between this and what the renderer drew, i.e. the suffix NOT
 * implemented (KNOWN_ISSUES §11 — state it in the OUTPUT, not only the header):
 *   - the material masks are ARCHITECTURE-ONLY (`matmask.mjs`): no props, terrain, vegetation,
 *     character, FX or sky. Any frame pixel one of those covers is attributed to the masonry
 *     behind it, so FX and the character enter every material ROI as drift. The 3 px erosion
 *     removes silhouettes and ink, not overlays.
 *   - no lighting model, no inverse grade: every number is on DELIVERED display luma, after
 *     AgX, saturation, split-tone, bloom and ink. A texture-side delta does not survive to here
 *     at its texture-side size (§70 is the case where +17.6 points delivered zero), so these
 *     are quoted as cand-vs-ctl within one boot and never as absolutes.
 *   - the mask is built from the CURRENT tree; if geometry moved since the capture it is
 *     misattributed outright. Both arms share one mask, so a misattribution is common-mode.
 *
 *   node hgcscore.mjs --shot temple --cand shots/hgc/temple.png --ctl shots/hgc/temple-ctl.png \
 *        --mask ab-hgc/temple-mask.bin [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SHOT = opt('shot', '?');
const CAND = opt('cand'), CTL = opt('ctl'), MASKF = opt('mask'), JSONOUT = opt('json', null);
/* The shot's own px-per-repeat range for this material, from gilddepth.mjs. Used only to say
   whether the measurable lag range reaches the repeat at all — never to move a threshold. */
const REPMIN = parseFloat(opt('repmin', '0')) || 0;
const REPMAX = parseFloat(opt('repmax', '0')) || 0;
const GILD = 'arch:hieroglyph_gilded';
const NULLS = ['arch:sandstone_block', 'arch:paving_courtyard', 'arch:hieroglyph_wall',
  'arch:column_papyrus', 'arch:limestone_polished'];

const meta = JSON.parse(readFileSync(MASKF + '.json', 'utf8'));
const mask = new Uint8Array(readFileSync(MASKF));
const W = meta.W, H = meta.H;

function luma(file) {
  const im = readPNG(file);
  if (im.w !== W || im.h !== H) throw new Error(`size mismatch ${file}: ${im.w}x${im.h} vs ${W}x${H}`);
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * im.ch;
    L[i] = (im.data[o] * 0.2126 + im.data[o + 1] * 0.7152 + im.data[o + 2] * 0.0722) / 255;
  }
  return L;
}

/** 3 px erosion of one material's mask — hgframe.mjs's rule, unchanged. */
function eroded(matName) {
  const mi = meta.mats.indexOf(matName);
  const keep = new Uint8Array(W * H);
  if (mi < 0) return { keep, n: 0, mi };
  let n = 0;
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    const k = y * W + x; if (mask[k] !== mi) continue;
    let ok = 1;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (mask[(y + dy) * W + x + dx] !== mi) { ok = 0; break; }
    if (ok) { keep[k] = 1; n++; }
  }
  return { keep, n, mi };
}

/** Separable box blur, radius r, edge-clamped. */
function box(L, r) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += L[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      t[y * W + x] = s / (2 * r + 1);
      s -= L[y * W + Math.min(W - 1, Math.max(0, x - r))];
      s += L[y * W + Math.min(W - 1, Math.max(0, x + r + 1))];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      o[y * W + x] = s / (2 * r + 1);
      s -= t[Math.min(H - 1, Math.max(0, y - r)) * W + x];
      s += t[Math.min(H - 1, Math.max(0, y + r + 1)) * W + x];
    }
  }
  return o;
}

/** P1: rms(L - box(L,r)) / mean(L) inside `keep`. */
function relLocalContrast(L, keep, r) {
  const B = box(L, r);
  let n = 0, sm = 0, s2 = 0;
  for (let i = 0; i < W * H; i++) if (keep[i]) { const d = L[i] - B[i]; sm += L[i]; s2 += d * d; n++; }
  if (!n) return { rlc: 0, mean: 0, n: 0 };
  const mean = sm / n;
  return { rlc: Math.sqrt(s2 / n) / Math.max(1e-6, mean), mean, n };
}

/** P2: sd of a 1/8 box downsample. `keep === null` ⇒ the whole frame. */
function squintSD(L, keep, D = 8) {
  const w = Math.floor(W / D), h = Math.floor(H / D);
  let n = 0, m = 0, m2 = 0;
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    let s = 0, c = 0, tot = 0;
    for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
      const k = (v * D + j) * W + u * D + i; tot++;
      if (!keep || keep[k]) { s += L[k]; c++; }
    }
    if (c < 0.8 * tot) continue;
    const y = s / c; n++; m += y; m2 += y * y;
  }
  return { sd: n ? Math.sqrt(Math.max(0, m2 / n - (m / n) ** 2)) : 0, cells: n, mean: n ? m / n : 0 };
}

/**
 * The longest run of *contiguous* columns that carry the material, and the row band it lives in.
 *
 * The registered rule ("rows >= 25% of max column count, longest contiguous run") is kept for the
 * row band. The column span is now taken as the longest CONTIGUOUS supported run rather than
 * first-to-last, because on `temple` the gilded run is cut into blobs by the column forest and
 * first-to-last silently spans the gaps — an NCC over a gap-filled void is a correlation of the
 * interpolator, not of the wall.
 */
function bandRows(keep) {
  const rows = new Int32Array(H);
  for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) if (keep[y * W + x]) c++; rows[y] = c; }
  let mx = 0; for (let y = 0; y < H; y++) if (rows[y] > mx) mx = rows[y];
  const th = 0.25 * mx;
  let best = [0, 0], cur = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && rows[y] >= th;
    if (on && cur < 0) cur = y;
    if (!on && cur >= 0) { if (y - cur > best[1] - best[0]) best = [cur, y]; cur = -1; }
  }
  return { y0: best[0], y1: best[1], maxRow: mx };
}

/**
 * P3: horizontal NCC of the mask-restricted column-mean profile.
 *
 * **The inherited implementation was wrong and its output was out of range.** `hgframe.mjs:64`
 * and `acf.mjs:15` both normalise by `v0 * k / N`, which is a whole-series variance rescaled by
 * the overlap count; at large lags it returns values outside [-1, 1] — this pair of frames'
 * predecessor test printed **rho = -1.370**, which no correlation can be. The seal says *NCC*, so
 * this is a per-lag Pearson coefficient over the overlapping window, which is bounded by
 * construction. Same bug shape in two other files: recorded, not silently patched there.
 */
function ncc(L, keep, y0, y1, maxLag) {
  const col = new Float64Array(W), cnt = new Float64Array(W);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (keep[k]) { col[x] += L[k]; cnt[x]++; } }
  const sup = new Uint8Array(W);
  for (let x = 0; x < W; x++) sup[x] = cnt[x] > (y1 - y0) * 0.15 ? 1 : 0;
  // longest contiguous supported column run
  let best = [0, 0], cur = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && sup[x];
    if (on && cur < 0) cur = x;
    if (!on && cur >= 0) { if (x - cur > best[1] - best[0]) best = [cur, x]; cur = -1; }
  }
  const [x0, x1] = best, N = x1 - x0;
  if (N < 60) return { ok: false, cols: N };
  const v = []; for (let x = x0; x < x1; x++) v.push(col[x] / cnt[x]);
  // A lag is only meaningful while the overlap is a decent fraction of the run.
  const top = Math.min(maxLag, Math.floor(N / 2));
  const out = [];
  for (let lag = 1; lag <= top; lag++) {
    const n = N - lag;
    let m1 = 0, m2 = 0;
    for (let i = 0; i < n; i++) { m1 += v[i]; m2 += v[i + lag]; }
    m1 /= n; m2 /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = v[i] - m1, b = v[i + lag] - m2; sxy += a * b; sxx += a * a; syy += b * b; }
    out.push([lag, sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0]);
  }
  const inBand = out.filter(([l]) => l >= 30 && l <= 300).sort((a, b) => b[1] - a[1]);
  const at = (l) => { const e = out.find(([q]) => q === l); return e ? e[1] : null; };
  return { ok: true, x0, x1, N, topLag: top, top: inBand.slice(0, 6), at, at137: at(137), at154: at(154), at157: at(157), at192: at(192) };
}

const Lc = luma(CAND), Lo = luma(CTL);
const pct = (a, b) => (b === 0 ? NaN : (a / b - 1) * 100);
const res = { shot: SHOT, cand: CAND, ctl: CTL, mask: MASKF, materials: {}, frame: {} };

console.log(`\n=== ${SHOT} — cand ${CAND.split('/').pop()} vs ctl ${CTL.split('/').pop()} ===`);
console.log('SCOPE: architecture-only masks (no props/terrain/character/FX/sky), display luma after the full grade, one boot, two page loads.');

// P2 primary: whole frame
const fc = squintSD(Lc, null), fo = squintSD(Lo, null);
res.frame.squint = { cand: fc.sd, ctl: fo.sd, deltaPct: pct(fc.sd, fo.sd), cells: fc.cells };
console.log(`\nP2  WHOLE-FRAME squint sd 1/8 (gate: <= +10%)`);
console.log(`      ctl ${fo.sd.toFixed(5)}   cand ${fc.sd.toFixed(5)}   Δ ${pct(fc.sd, fo.sd).toFixed(2)}%   (${fc.cells} cells)`);

// whole-frame gross change, for context on how much of the frame moved at all
let diffPx = 0, sumAbs = 0;
for (let i = 0; i < W * H; i++) { const d = Math.abs(Lc[i] - Lo[i]) * 255; if (d > 2) diffPx++; sumAbs += d; }
res.frame.diffPx = diffPx; res.frame.diffPctOfFrame = 100 * diffPx / (W * H); res.frame.meanAbs = sumAbs / (W * H);
console.log(`      frame pixels changed >2 codes: ${diffPx} (${(100 * diffPx / (W * H)).toFixed(2)}%),  mean |Δ| ${(sumAbs / (W * H)).toFixed(3)} codes`);

for (const mat of [GILD, ...NULLS]) {
  const { keep, n } = eroded(mat);
  if (!n) { console.log(`\n${mat}: absent from this mask`); continue; }
  const isGild = mat === GILD;
  const r8c = relLocalContrast(Lc, keep, 8), r8o = relLocalContrast(Lo, keep, 8);
  const r4c = relLocalContrast(Lc, keep, 4), r4o = relLocalContrast(Lo, keep, 4);
  const r16c = relLocalContrast(Lc, keep, 16), r16o = relLocalContrast(Lo, keep, 16);
  const sc = squintSD(Lc, keep), so = squintSD(Lo, keep);
  let dpx = 0; for (let i = 0; i < W * H; i++) if (keep[i] && Math.abs(Lc[i] - Lo[i]) * 255 > 2) dpx++;
  const m = res.materials[mat] = {
    px: n, r8: { cand: r8c.rlc, ctl: r8o.rlc, deltaPct: pct(r8c.rlc, r8o.rlc) },
    r4: { cand: r4c.rlc, ctl: r4o.rlc, deltaPct: pct(r4c.rlc, r4o.rlc) },
    r16: { cand: r16c.rlc, ctl: r16o.rlc, deltaPct: pct(r16c.rlc, r16o.rlc) },
    meanL: { cand: r8c.mean, ctl: r8o.mean, deltaPct: pct(r8c.mean, r8o.mean) },
    squint: { cand: sc.sd, ctl: so.sd, deltaPct: pct(sc.sd, so.sd), cells: sc.cells },
    changedPx: dpx, changedPct: 100 * dpx / n,
  };
  console.log(`\n${isGild ? 'P1/P3 ' : 'P4    '}${mat}  (${n} px eroded, ${(100 * n / (W * H)).toFixed(2)}% of frame)`);
  console.log(`      relLocalContrast r=8  ctl ${r8o.rlc.toFixed(5)}  cand ${r8c.rlc.toFixed(5)}   Δ ${m.r8.deltaPct >= 0 ? '+' : ''}${m.r8.deltaPct.toFixed(2)}%   ← ${isGild ? 'P1 GATE' : 'null floor'}`);
  console.log(`      profile  r=4  ${r4o.rlc.toFixed(5)} → ${r4c.rlc.toFixed(5)}  (${m.r4.deltaPct >= 0 ? '+' : ''}${m.r4.deltaPct.toFixed(2)}%)   r=16  ${r16o.rlc.toFixed(5)} → ${r16c.rlc.toFixed(5)}  (${m.r16.deltaPct >= 0 ? '+' : ''}${m.r16.deltaPct.toFixed(2)}%)`);
  console.log(`      mean L   ${r8o.mean.toFixed(5)} → ${r8c.mean.toFixed(5)}  (${m.meanL.deltaPct >= 0 ? '+' : ''}${m.meanL.deltaPct.toFixed(2)}%)`);
  console.log(`      in-mask squint sd 1/8  ${so.sd.toFixed(5)} → ${sc.sd.toFixed(5)}  (${m.squint.deltaPct >= 0 ? '+' : ''}${m.squint.deltaPct.toFixed(2)}%, ${sc.cells} cells)   [diagnostic, NOT a gate]`);
  console.log(`      px changed >2 codes ${dpx} (${(100 * dpx / n).toFixed(2)}% of mask)`);

  if (isGild) {
    const b = bandRows(keep);
    /* `--p3rows y0,y1[,label,repmin]` — extra explicitly-registered bands. On `hero` the material
       spans a 5x depth range, so the rule-selected band lands on the near mass where the repeat is
       469-1202 px and fewer than two repeats are on screen; a low rho there is arithmetic. */
    const extra = argv.filter((a, i) => argv[i - 1] === '--p3rows').map((s) => s.split(','));
    const bands = [{ y0: b.y0, y1: b.y1, label: 'by rule', repmin: REPMIN }];
    for (const e of extra) bands.push({ y0: +e[0], y1: +e[1], label: e[2] || 'registered', repmin: +(e[3] || 0) });
    console.log(`\nP3    peak masked row ${b.maxRow} px`);
    for (const bd of bands) scoreBand(mat, keep, bd);
    /* Not a gate — a scoping fact for §7.3's gold line. RESULT-tx7 §4 found only 1.4 % of hero's
       gilded pixels are sunlit and concluded no frame in the tested set has key-lit gilded at
       size. Same L >= 120 cut PREREG-goldspec registered. If a band here is lit, that band is
       where the gold-as-metal question can be asked; if none is, that is the answer to why it
       cannot be asked here. */
    console.log(`\n      [scoping, not a gate] sunlit share of gilded mask (L >= 120/255):`);
    for (const bd of bands) {
      for (const [arm, L] of [['ctl', Lo], ['cand', Lc]]) {
        let n2 = 0, lit = 0, sum = 0;
        for (let y = bd.y0; y < bd.y1; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (keep[k]) { n2++; sum += L[k]; if (L[k] * 255 >= 120) lit++; } }
        if (n2) console.log(`        ${bd.label.padEnd(10)} ${arm.padEnd(4)} ${n2} px, mean L ${(255 * sum / n2).toFixed(1)}, sunlit ${(100 * lit / n2).toFixed(2)}%`);
      }
    }
  }
}

function scoreBand(mat, keep, bd) {
  {
    const b = bd;
    console.log(`      --- band "${b.label}" y${b.y0}-${b.y1}${b.repmin ? `, repeat >= ${b.repmin} px` : ''} ---`);
    for (const [arm, L] of [['ctl', Lo], ['cand', Lc]]) {
      const REPMIN = b.repmin;
      const a = ncc(L, keep, b.y0, b.y1, 300);
      const key = `ncc_${b.label.replace(/\W+/g, '_')}_${arm}`;
      if (!a.ok) {
        console.log(`      ${arm}: longest CONTIGUOUS supported column run is ${a.cols} px — NOT TESTABLE`);
        res.materials[mat][key] = { ok: false, cols: a.cols };
        continue;
      }
      res.materials[mat][key] = a;
      /* A lag band that stops short of the surface's own repeat cannot see a repeat, so a low
         maximum in it is not a pass. Print the verdict, not just the number (§11). */
      if (REPMIN && a.topLag < REPMIN) {
        a.notTestable = `max measurable lag ${a.topLag} px (half the ${a.N} px contiguous run) is below this band's minimum repeat ${REPMIN} px`;
        console.log(`      ${arm.padEnd(4)} NOT TESTABLE — ${a.notTestable}`);
      }
      console.log(`      ${arm.padEnd(4)} x${a.x0}-${a.x1} (${a.N}px contiguous, lags to ${a.topLag})  max ρ in 30-300: ${a.top.map(([l, r]) => `${l}:${r.toFixed(3)}`).join('  ')}`);
      const f = (v) => (v == null ? 'n/a' : v.toFixed(3));
      console.log(`           ρ at repeat lags — 137 ${f(a.at137)}  154 ${f(a.at154)}  157 ${f(a.at157)}  176 ${f(a.at(176))}  192 ${f(a.at192)}  207 ${f(a.at(207))}`);
    }
  }
}

if (JSONOUT) writeFileSync(JSONOUT, JSON.stringify(res, null, 2));

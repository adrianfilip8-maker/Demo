/**
 * charread_pereye.mjs — charread.mjs's M5 mask test with ONE defect fixed. Additive: the
 * original file is untouched and still authoritative for everything except `bandMed`/`bandFrac`.
 *
 * ============================================================================================
 * WHY THIS EXISTS: `maskRead`'s band walk takes a SINGLE centroid over the WHOLE `EYE`
 * population. With two eyes visible that centroid lands BETWEEN them — on the muzzle bridge —
 * and `eR = sqrt(totalEyePx/PI)` is sized from their COMBINED area. Rays cast up and down from
 * the bridge never meet an eye at all and are dropped by the `seenEye` guard; the rays that do
 * hit one graze its rim and exit into cream fur. The median then describes the gap between the
 * eyes, not the mask around either of them.
 *
 * PROVED BOTH WAYS ON REAL INPUT (§33), from the tool's own data, no new rendering:
 *
 *   sly-profile   1 eye component (178 px)                  aggregate 0.46 == per-eye 0.46
 *   sly-closeup   2 components, 877 px + 234 px             aggregate 0.74 ~= near eye 0.78
 *   sly-startle   2 components, 4622 px + 3518 px           aggregate 0.10 <  BOTH (0.73, 0.28)
 *   hero          0 components >= 20 px (23 px total)       aggregate 1.48 from 23 pixels
 *
 * A median over a population cannot be smaller than the median of every sub-population it is
 * drawn from unless the ray origin is outside them all. One eye reproduces exactly; two eyes of
 * COMPARABLE area collapse; one dominant eye accidentally agrees. That is why only `sly-startle`
 * — the one near-face-on framing in the set, and the only one whose eyes project at comparable
 * size — ever looked broken.
 *
 * WHAT THIS RETRACTS. KNOWN_ISSUES §37 records as an honest residual: "`sly-startle`'s mask
 * still fails its band (0.08 -> 0.10) because that pose's eye is proportionally larger than the
 * bind-pose ring anticipates — the fix is to derive the ring radius from the *posed* sclera."
 * Both halves are wrong:
 *   - 0.10 is not a measurement of that pose's mask. Per eye it is 0.73 and 0.28.
 *   - The named mechanism is not present. `hurt` scales the **pupil** bone (`sc: pupilL/pupilR
 *     0.35`), and the sclera is weighted to `head` (SlyModel `group:'eye', weights:[['head',1]]`),
 *     so the posed sclera is the bind-pose sclera and the annulus ring still matches it exactly
 *     by construction. What actually grows `eyePx` at `sly-startle` is the pupil CONSTRICTING and
 *     uncovering sclera — which inflates `eR`, the denominator, and pushes `bandMed` down. The
 *     defect and its proposed fix were both artefacts of the same statistic.
 * Deriving the ring from the posed sclera would therefore have changed geometry to chase a
 * number that cannot see geometry. Left unimplemented, deliberately.
 *
 * WHAT SURVIVES, and it is a real residual: per eye, the near eye reads 0.73-0.78 across
 * `sly-closeup`, `sly-key` and `sly-startle` — consistent, i.e. the mask does NOT vary per pose —
 * while the oblique/far eye reads 0.28-0.46. That asymmetry tracks head yaw on a ring that is
 * built symmetrically (`for (const side of [1,-1])`), so it is a view consequence, not a
 * geometry defect. Quote per-eye numbers; the aggregate column is kept only so the two can be
 * compared.
 *
 * THE GAP (§11) is otherwise charread.mjs's, unchanged: albedo only, ink hull on, no cel ramp,
 * no PostFX, no foot IK, no level occlusion.
 * ============================================================================================
 */

import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(k);
const ROWS = parseInt(arg('--rows', '720'), 10);
const ROOT = arg('--root', '/home/user/Demo');
const OUT = arg('--out', path.join(process.env.SCRATCH || '/tmp', 'charread'));
const TAG = arg('--tag', 'run');
const INK_PX = parseFloat(arg('--inkpx', '2.5'));
mkdirSync(OUT, { recursive: true });

/* ---------------- PNG out (no deps) ---------------- */
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const crcT = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ================= METRICS, each with its own controls ================= */

/**
 * Boundary roughness of a binary mask: mean |second difference| of the outer contour's
 * radius-from-axis, in units of the mask's own mean radius. Scale-free.
 * A clean swept tube -> ~0. A sawtooth -> large.
 * Measured on the DOWNSAMPLED (40 px) coverage field, thresholded at 0.5, which is the
 * whole point: a spike that vanishes into a partial-coverage pixel at 40 px is not a
 * silhouette defect at 40 px.
 */
function contourRough(mask, w, h) {
  // For each column that has any coverage, the top and bottom boundary rows.
  const top = new Array(w).fill(-1), bot = new Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (mask[y * w + x]) { top[x] = y; break; }
    for (let y = h - 1; y >= 0; y--) if (mask[y * w + x]) { bot[x] = y; break; }
  }
  const cols = [];
  for (let x = 0; x < w; x++) if (top[x] >= 0) cols.push(x);
  if (cols.length < 5) return { rough: NaN, n: cols.length };
  const series = [];
  for (const arr of [top, bot]) {
    const s = cols.map((x) => arr[x]);
    for (let i = 1; i < s.length - 1; i++) series.push(Math.abs(s[i - 1] - 2 * s[i] + s[i + 1]));
  }
  const thick = cols.reduce((a, x) => a + (bot[x] - top[x] + 1), 0) / cols.length;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  return { rough: mean / Math.max(1e-6, thick), n: cols.length, thick, raw: mean };
}

/**
 * "One clean shape" made scoreable. `contourRough` above is kept but is NOT the verdict metric:
 * it normalises by the per-column vertical extent, which for a DIAGONAL tail is the diagonal's
 * span rather than the tube's diameter, so it divides the defect away. It read 0.079 on a tail
 * that is visibly shredded at 40 px, against a 0.735 sawtooth control — i.e. it is
 * non-discriminating on the geometry class it was pointed at, though it discriminates fine on
 * the horizontal synthetic it was proved on. That is §33: proved on a known, still incapable on
 * the real input. These three are view-independent and measure the words in the critic's test.
 *   components : "one" shape        -> 1
 *   holes      : gaps that "do not close" -> 0
 *   solidity   : area / convex hull area; a clean tapering tube is high, a shredded one low
 */
function shapeRead(mask, w, h) {
  const lab = new Int32Array(w * h).fill(0);
  let nc = 0, area = 0;
  const stack = [];
  for (let i = 0; i < w * h; i++) if (mask[i]) area++;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    nc++; stack.push(s); lab[s] = nc;
    while (stack.length) {
      const p = stack.pop(), px = p % w, py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !lab[q]) { lab[q] = nc; stack.push(q); }
      }
    }
  }
  // holes: background components not touching the border
  const bl = new Int32Array(w * h).fill(0);
  let nb = 0, holes = 0;
  for (let s = 0; s < w * h; s++) {
    if (mask[s] || bl[s]) continue;
    nb++; let touches = false; stack.push(s); bl[s] = nb;
    const cells = [];
    while (stack.length) {
      const p = stack.pop(), px = p % w, py = (p - px) / w;
      cells.push(p);
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) touches = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!mask[q] && !bl[q]) { bl[q] = nb; stack.push(q); }
      }
    }
    if (!touches) holes++;
  }
  // convex hull of the mask points (monotone chain), then its area
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) pts.push([x, y]);
  let solidity = NaN;
  if (pts.length > 2) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    let a2 = 0;
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    solidity = area / Math.max(1e-6, Math.abs(a2) / 2);
  }
  return { components: nc, holes, solidity, area };
}

/** Ring legibility: axial profile of mean luma inside the mask, then count resolvable
 *  alternations and their Michelson contrast. A raccoon tail at 40 px wants >=3 bands. */
function ringProfile(lum, mask, w, h) {
  /* Binned along the mask's OWN principal axis, not along screen x.
     Screen-column averaging was the first version and it is non-discriminating on a diagonal
     tail for the same reason `contourRough` is: every column crosses several rings, so the
     alternation averages out before it is counted. It reported 1-2 bands on a tail carrying
     six authored ones at every azimuth, i.e. it would have scored a perfect tail as a failure
     and sent me tuning the bands. PCA costs four lines and makes the statistic a property of
     the tail rather than of its angle on screen. */
  let sx = 0, sy = 0, n0 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { sx += x; sy += y; n0++; }
  if (n0 < 6) return { bands: 0, contrast: 0, n: 0 };
  const mx = sx / n0, my = sy / n0;
  let cxx = 0, cxy = 0, cyy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    const dx = x - mx, dy = y - my; cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
  }
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ax = Math.cos(th), ay = Math.sin(th);
  const bins = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    const t = Math.round((x - mx) * ax + (y - my) * ay);
    if (!bins.has(t)) bins.set(t, [0, 0]);
    const b = bins.get(t); b[0] += lum[y * w + x]; b[1]++;
  }
  const prof = [...bins.entries()].filter(([, b]) => b[1] >= 2).sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({ x: t, v: b[0] / b[1] }));
  if (prof.length < 6) return { bands: 0, contrast: 0, n: prof.length };
  const v = prof.map((p) => p.v);
  const lo = Math.min(...v), hi = Math.max(...v);
  const mid = (lo + hi) / 2;
  // count sign changes about the midline with hysteresis at 15% of the span
  const hy = 0.15 * (hi - lo);
  let state = v[0] > mid ? 1 : -1, flips = 0;
  for (const x of v) {
    if (state === 1 && x < mid - hy) { state = -1; flips++; }
    else if (state === -1 && x > mid + hy) { state = 1; flips++; }
  }
  return { bands: Math.ceil(flips / 2), contrast: (hi - lo) / Math.max(1e-6, hi + lo), n: prof.length, lo, hi };
}

/** Mask read: coverage, L/R symmetry about the head's own screen midline, eye enclosure. */
function maskRead(idBuf, W, H, IDS) {
  const { INK, EYE } = IDS;
  let headPx = 0, inkPx = 0, eyePx = 0;
  let minX = 1e9, maxX = -1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = idBuf[y * W + x];
    if (v < 0) continue;
    headPx++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (v === INK) inkPx++; else if (v === EYE) eyePx++;
  }
  if (!headPx) return null;
  const midX = (minX + maxX) / 2;
  let inkL = 0, inkR = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (idBuf[y * W + x] !== INK) continue;
    if (x < midX) inkL++; else inkR++;
  }
  /* Eye enclosure: of the boundary pixels of the EYE population, what fraction has an INK
     neighbour? A mask the eye sits INSIDE reads ~1. A dark smudge beside the eye reads low.
     This is the shape claim ("the eye becomes a hole in a shape") given a number. */
  let eb = 0, ebInk = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (idBuf[y * W + x] !== EYE) continue;
    const nb = [idBuf[(y - 1) * W + x], idBuf[(y + 1) * W + x], idBuf[y * W + x - 1], idBuf[y * W + x + 1]];
    if (nb.every((v) => v === EYE)) continue;
    eb++;
    if (nb.some((v) => v === INK)) ebInk++;
  }
  /* **Radial mask thickness around the eye, in eye radii.** `enclosure` above asks whether a
     dark pixel TOUCHES the eye, and every island on this model is wrapped in a ~2.5 px inverted
     hull, so an eye with no mask at all still scores ~0.5–0.6 from its own outline. It cannot
     separate "the eye is a hole in a mask" from "the eye is outlined". Thickness can: walk out
     from the eye's boundary along 64 rays and count consecutive dark pixels (ink material OR
     hull), normalised by the eye's own radius. The hull alone is a thin constant; a mask is a
     band several times thicker. Reported as the median over rays and the fraction of rays
     carrying at least half an eye-radius of black. */
  /* PER-EYE VARIANT (diagnostic). The shipped maskRead takes ONE centroid over the whole EYE
     population. With two eyes visible that centroid lands BETWEEN them — on the muzzle bridge —
     and eR is computed from their combined area, so it is sqrt(2) too large for either eye.
     Rays cast up/down from the bridge never meet an eye at all and are dropped by `seenEye`.
     Here EYE is split into 4-connected components and each is walked in its own coordinates. */
  const comps = [];
  {
    const lab = new Int32Array(W * H).fill(-1);
    const qx = new Int32Array(W * H), qy = new Int32Array(W * H);
    for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
      if (idBuf[y0 * W + x0] !== EYE || lab[y0 * W + x0] >= 0) continue;
      const id = comps.length; let head = 0, tail = 0;
      qx[tail] = x0; qy[tail] = y0; tail++; lab[y0 * W + x0] = id;
      let sx = 0, sy = 0, n = 0;
      while (head < tail) {
        const x = qx[head], y = qy[head]; head++;
        sx += x; sy += y; n++;
        const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (idBuf[ny * W + nx] !== EYE || lab[ny * W + nx] >= 0) continue;
          lab[ny * W + nx] = id; qx[tail] = nx; qy[tail] = ny; tail++;
        }
      }
      comps.push({ cx: sx / n, cy: sy / n, n });
    }
  }
  comps.sort((a, b) => b.n - a.n);
  const perEye = [];
  for (const c of comps) {
    if (c.n < 20) continue;
    const cR = Math.sqrt(c.n / Math.PI);
    const bt = [];
    const darkC = (v) => v === INK || v === 100;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let seen = false, t = 0;
      for (let r = 0; r < 200; r += 0.5) {
        const x = Math.round(c.cx + dx * r), y = Math.round(c.cy + dy * r);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const v = idBuf[y * W + x];
        if (v === EYE) { seen = true; continue; }
        if (!seen) continue;
        if (darkC(v)) t += 0.5; else break;
      }
      if (seen) bt.push(t / cR);
    }
    bt.sort((a, b) => a - b);
    perEye.push({
      px: c.n, r: cR,
      med: bt.length ? bt[Math.floor(bt.length / 2)] : 0,
      frac: bt.length ? bt.filter((v) => v >= 0.5).length / bt.length : 0,
      rays: bt.length,
    });
  }

  let ex = 0, ey = 0, en = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (idBuf[y * W + x] === EYE) { ex += x; ey += y; en++; }
  const bandT = [];
  if (en > 20) {
    ex /= en; ey /= en;
    const eR = Math.sqrt(en / Math.PI);
    const dark = (v) => v === INK || v === 100;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let r = 0, seenEye = false, t = 0;
      for (; r < 200; r += 0.5) {
        const x = Math.round(ex + dx * r), y = Math.round(ey + dy * r);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const v = idBuf[y * W + x];
        if (v === EYE) { seenEye = true; continue; }
        if (!seenEye) continue;
        if (dark(v)) t += 0.5; else break;
      }
      if (seenEye) bandT.push(t / eR);
    }
  }
  bandT.sort((a, b) => a - b);
  const medBand = bandT.length ? bandT[Math.floor(bandT.length / 2)] : 0;
  const fracBand = bandT.length ? bandT.filter((v) => v >= 0.5).length / bandT.length : 0;
  return {
    headPx, inkPx, eyePx,
    inkFrac: inkPx / headPx,
    sym: Math.abs(inkL - inkR) / Math.max(1, inkL + inkR),
    inkL, inkR,
    enclosure: eb ? ebInk / eb : 0, eyeBoundary: eb,
    bandMed: medBand, bandFrac: fracBand, perEye,
  };
}

/* ================= SELF TEST (§33: reachable from both sides) ================= */
if (has('--selftest')) {
  const W = 40, H = 14;
  const mk = (fn) => { const m = new Uint8Array(W * H); for (let x = 0; x < W; x++) { const [t, b] = fn(x); for (let y = t; y <= b; y++) m[y * W + x] = 1; } return m; };
  const clean = mk((x) => { const r = 5 - 3.4 * (x / (W - 1)) ** 2; return [Math.round(7 - r), Math.round(7 + r)]; });
  const saw = mk((x) => { const r = 5 - 3.4 * (x / (W - 1)) ** 2 + (x % 2 ? 1.6 : -1.6); return [Math.round(7 - r), Math.round(7 + r)]; });
  const rc = contourRough(clean, W, H), rs = contourRough(saw, W, H);
  console.log('SELFTEST contourRough  clean=%s  sawtooth=%s   (clean must be << sawtooth)', rc.rough.toFixed(4), rs.rough.toFixed(4));
  // shapeRead controls: clean tube, sawtooth tube, and a shredded tube (holes + islands)
  const shred = new Uint8Array(clean);
  for (let x = 2; x < W; x += 3) for (let y = 4; y < 10; y++) shred[y * W + x] = 0;         // punch gaps
  for (let x = 1; x < W; x += 5) { shred[1 * W + x] = 1; shred[(H - 2) * W + x] = 1; }      // detached specks
  for (const [nm, m] of [['clean', clean], ['sawtooth', saw], ['shredded', shred]]) {
    const s = shapeRead(m, W, H);
    console.log('SELFTEST shapeRead ' + nm.padEnd(9) + ' components=' + s.components + ' holes=' + s.holes + ' solidity=' + s.solidity.toFixed(3));
  }

  // ring profile: 5 clean bands vs flat
  const lumB = new Float32Array(W * H), lumF = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    lumB[y * W + x] = (Math.floor(x / 4) % 2) ? 30 : 200; lumF[y * W + x] = 120;
  }
  const pb = ringProfile(lumB, clean, W, H), pf = ringProfile(lumF, clean, W, H);
  console.log('SELFTEST ringProfile   striped bands=%d contrast=%s | flat bands=%d contrast=%s',
    pb.bands, pb.contrast.toFixed(3), pf.bands, pf.contrast.toFixed(3));

  // mask: symmetric vs half-erased; enclosed vs beside
  const MW = 60, MH = 40, IDS = { INK: 6, EYE: 7 };
  const mkMask = (half, enclosed) => {
    const b = new Int8Array(MW * MH).fill(-1);
    for (let y = 8; y < 30; y++) for (let x = 5; x < 55; x++) b[y * MW + x] = 0;      // head
    const eyes = [[20, 18], [40, 18]];
    for (const [ex, ey] of eyes) {
      for (let y = -8; y <= 8; y++) for (let x = -9; x <= 9; x++) {
        if (x * x / 81 + y * y / 64 > 1) continue;
        if (half && ex > 30) continue;
        b[(ey + y) * MW + ex + x] = IDS.INK;
      }
    }
    for (const [ex, ey] of eyes) {
      const cx = enclosed ? ex : ex + 12;
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        if (x * x + y * y > 25) continue;
        b[(ey + y) * MW + cx + x] = IDS.EYE;
      }
    }
    return b;
  };
  const a = maskRead(mkMask(false, true), MW, MH, IDS);
  const bH = maskRead(mkMask(true, true), MW, MH, IDS);
  const c = maskRead(mkMask(false, false), MW, MH, IDS);
  console.log('SELFTEST maskRead sym       symmetric=%s  half-erased=%s   (sym: 0 good, 1 absent)', a.sym.toFixed(3), bH.sym.toFixed(3));
  console.log('SELFTEST maskRead enclosure eye-in-mask=%s  eye-beside-mask=%s', a.enclosure.toFixed(3), c.enclosure.toFixed(3));
  // bandMed control: the same eye with NO mask at all, only a 2px hull round it
  const hullOnly = (() => {
    const b = new Int8Array(MW * MH).fill(-1);
    for (let y = 8; y < 30; y++) for (let x = 5; x < 55; x++) b[y * MW + x] = 0;
    for (const [cx, cy] of [[20, 18], [40, 18]]) {
      for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
        const d = Math.hypot(x, y);
        if (d <= 5) b[(cy + y) * MW + cx + x] = IDS.EYE;
        else if (d <= 7) b[(cy + y) * MW + cx + x] = 100;   // the inverted hull
      }
    }
    return b;
  })();
  const h = maskRead(hullOnly, MW, MH, IDS);
  console.log('SELFTEST maskRead bandMed  eye-in-mask=%s  HULL-ONLY(no mask)=%s  (eye radii of black)',
    a.bandMed.toFixed(3), h.bandMed.toFixed(3));
  console.log('SELFTEST maskRead enclosure HULL-ONLY=%s  <-- why enclosure cannot be the verdict metric', h.enclosure.toFixed(3));
  process.exit(0);
}

/* ================= LOAD + POSE + RASTERISE ================= */
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import(path.join(ROOT, 'src/player/SlyModel.js'));
const { CLIPS, sampleInto, sampleCane } = await import(path.join(ROOT, 'src/player/Clips.js'));
const { PoseBuffer } = await import(path.join(ROOT, 'src/player/Rig.js'));
const { SHOTS } = await import(path.join(ROOT, 'src/core/Shots.js'));

const sly = new SlyModel(engine);
await sly.init();
const geo = sly.mesh.geometry;
const D2R = Math.PI / 180;

function poseTo(shotName) {
  const shot = SHOTS[shotName];
  const clip = CLIPS[shot.player.pose];
  const pb = new PoseBuffer(sly.boneNames).clear();
  sampleInto(clip, clip.hold, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  if (sly._canePivot) {
    const d = new THREE.Quaternion();
    const bq = sly._canePivot.quaternion.clone();
    if (sampleCane(clip, clip.hold, d)) sly._canePivot.quaternion.copy(d).multiply(bq);
    sly.root.updateMatrixWorld(true);
  }
  const p = shot.player.pos, c = shot.pos, yawW = shot.player.yaw ?? 0;
  const dx = c[0] - p[0], dz = c[2] - p[2], dy = c[1] - (p[1] + 1.0);
  let phi = Math.atan2(dx, dz) - yawW;
  while (phi > Math.PI) phi -= 2 * Math.PI;
  while (phi < -Math.PI) phi += 2 * Math.PI;
  const elev = Math.atan2(dy, Math.hypot(dx, dz));
  const dist = Math.hypot(dx, dz, dy);
  const pxPerM = ROWS / (2 * dist * Math.tan((shot.fov * Math.PI / 180) / 2));
  return { phi, elev, pxPerM, clip: shot.player.pose };
}

const _sm = new THREE.Matrix4(), _sv = new THREE.Vector3(), _st = new THREE.Vector3();
const _sn = new THREE.Vector3(), _tn = new THREE.Vector3();
function skin() {
  const bones = sly.mesh.skeleton.bones, inv = sly.mesh.skeleton.boneInverses;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _st.set(0, 0, 0); _tn.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w === 0) continue;
      const b = si.getComponent(i, k);
      _sm.multiplyMatrices(bones[b].matrixWorld, inv[b]);
      _sv.fromBufferAttribute(pos, i).applyMatrix4(_sm);
      _st.addScaledVector(_sv, w);
      _sn.fromBufferAttribute(nor, i).transformDirection(_sm);
      _tn.addScaledVector(_sn, w);
    }
    P[i * 3] = _st.x; P[i * 3 + 1] = _st.y; P[i * 3 + 2] = _st.z;
    _tn.normalize();
    N[i * 3] = _tn.x; N[i * 3 + 1] = _tn.y; N[i * 3 + 2] = _tn.z;
  }
  return { P, N };
}

/* material index per triangle, from geometry groups */
const matRuns = [];
for (const g of geo.groups) matRuns.push({ s: g.start, e: g.start + g.count, m: g.materialIndex });
const matAt = (k) => { for (const r of matRuns) if (k >= r.s && k < r.e) return r.m; return -1; };

/* tuft family per vertex, from the model's published ranges */
const tuftOf = new Int8Array(geo.attributes.position.count).fill(-1);
const famNames = [];
for (const r of (sly.tuftRanges || [])) {
  let fi = famNames.indexOf(r.name); if (fi < 0) { famNames.push(r.name); fi = famNames.length - 1; }
  for (let i = r.v0; i < r.v1; i++) tuftOf[i] = fi;
}

const GROUPS = ['fur', 'furCream', 'furDark', 'cloth', 'clothDark', 'gold', 'ink', 'eye'];
const PALHEX = {
  fur: 0x7a8ba8, furCream: 0xe4dfcb, furDark: 0x2a3142, cloth: 0x2f7fc4,
  clothDark: 0x1b4f7c, gold: 0xe8b942, ink: 0x101319, eye: 0xf7f3e6,
};
const ID_SHELL = 100;      // ink hull
const bi = {}; sly.boneNames.forEach((n, i) => { bi[n] = i; });
const TAILB = new Set(['tailA', 'tailB', 'tailC', 'tailD'].map((n) => bi[n]).filter((v) => v !== undefined));
const HEADB = new Set(['head', 'jaw', 'capBrim', 'earL', 'earR', 'browL', 'browR'].map((n) => bi[n]).filter((v) => v !== undefined));
const siA = geo.attributes.skinIndex, swA = geo.attributes.skinWeight;
const domOf = new Int32Array(geo.attributes.position.count);
for (let i = 0; i < domOf.length; i++) {
  let b = -1, bw = -1;
  for (let k = 0; k < 4; k++) { const w = swA.getComponent(i, k); if (w > bw) { bw = w; b = siA.getComponent(i, k); } }
  domOf[i] = b;
}

/**
 * Rasterise. `region` selects which triangles participate ('all' | 'tail' | 'head').
 * `dropTuft` is a Set of family indices to suppress (hold-out A/B).
 * Returns { idBuf, W, H, pxPerM, minX, minY }.
 */
function raster({ shot, region = 'all', dropTuft = null, ink = true, scalePx = null, azOverride = null }) {
  let { phi, elev, pxPerM: ppm } = poseTo(shot);
  if (azOverride !== null) phi = azOverride * Math.PI / 180;
  const { P, N } = skin();
  const idx = geo.index.array;
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (dropTuft && dropTuft.has(tuftOf[a])) continue;
    if (region === 'tail' && !TAILB.has(domOf[a])) continue;
    if (region === 'head' && !HEADB.has(domOf[a])) continue;
    tris.push([a, b, c, matAt(i)]);
  }
  const cy = Math.cos(phi), sy = Math.sin(phi), ce = Math.cos(elev), se = Math.sin(elev);
  const view = (i, off) => {
    const x = P[i * 3] + N[i * 3] * off, y = P[i * 3 + 1] + N[i * 3 + 1] * off, z = P[i * 3 + 2] + N[i * 3 + 2] * off;
    const X = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [X, y * ce - z1 * se, y * se + z1 * ce];
  };
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const seen = new Set();
  for (const [a, b, c] of tris) for (const i of [a, b, c]) {
    if (seen.has(i)) continue; seen.add(i);
    const v = view(i, 0);
    if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
  }
  const pxPerM = scalePx ? scalePx / Math.max(maxX - minX, maxY - minY) : ppm;
  const inkOff = ink ? INK_PX / pxPerM : 0;
  const PAD = 6;
  const W = Math.ceil((maxX - minX) * pxPerM) + PAD * 2;
  const H = Math.ceil((maxY - minY) * pxPerM) + PAD * 2;
  const idBuf = new Int8Array(W * H).fill(-1);
  const depth = new Float32Array(W * H).fill(-1e9);
  const toPx = (v) => [(v[0] - minX) * pxPerM + PAD, H - PAD - (v[1] - minY) * pxPerM, v[2]];
  /* `backOnly` reproduces Outline.js's inverted hull faithfully: the shell material is
     `side: BackSide`, so ONLY back-facing triangles of the expanded copy are drawn. Rendering
     the expanded copy front-and-back instead buries the whole model in black — the shell wins
     the depth test everywhere, because expanding along the normal moves the front surface
     toward the camera. That is not a subtle error, it is the difference between "the figure has
     an ink line" and "the figure is a silhouette", and it is what the first run of this tool
     did. Backface selection is the sign of the screen-space signed area. */
  const drawPass = (off, forceId, backOnly = false) => {
    for (const [a, b, c, m] of tris) {
      const A = toPx(view(a, off)), B = toPx(view(b, off)), C = toPx(view(c, off));
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      const d = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(d) < 1e-12) continue;
      if (backOnly && d < 0) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w0 = ((B[0] - x) * (C[1] - y) - (C[0] - x) * (B[1] - y)) / d;
        const w1 = ((C[0] - x) * (A[1] - y) - (A[0] - x) * (C[1] - y)) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
        const o = y * W + x;
        if (z <= depth[o]) continue;
        depth[o] = z; idBuf[o] = forceId === null ? m : forceId;
      }
    }
  };
  if (ink) drawPass(inkOff, ID_SHELL, true);
  drawPass(0, null, false);
  return { idBuf, W, H, pxPerM, tris: tris.length };
}

function toRGB(idBuf, W, H, bg = [255, 255, 255]) {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const v = idBuf[i];
    let c;
    if (v < 0) c = (bg[0] << 16) | (bg[1] << 8) | bg[2];
    else if (v === ID_SHELL) c = 0x1a1210;
    else c = PALHEX[GROUPS[v]] ?? 0xff00ff;
    buf[i * 3] = (c >> 16) & 255; buf[i * 3 + 1] = (c >> 8) & 255; buf[i * 3 + 2] = c & 255;
  }
  return buf;
}
const LUM = (c) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

/** Box-downsample an id buffer to a target long-axis size, returning coverage + mean luma. */
function down(idBuf, W, H, targetLong) {
  const f = Math.max(W, H) / targetLong;
  const w = Math.max(1, Math.round(W / f)), h = Math.max(1, Math.round(H / f));
  const cov = new Float32Array(w * h), lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0, tot = 0, ls = 0;
    for (let sy = Math.floor(y * f); sy < Math.min(H, Math.ceil((y + 1) * f)); sy++)
      for (let sx = Math.floor(x * f); sx < Math.min(W, Math.ceil((x + 1) * f)); sx++) {
        tot++;
        const v = idBuf[sy * W + sx];
        if (v < 0) continue;
        n++;
        const c = v === ID_SHELL ? 0x1a1210 : (PALHEX[GROUPS[v]] ?? 0);
        ls += LUM(c);
      }
    cov[y * w + x] = tot ? n / tot : 0;
    lum[y * w + x] = n ? ls / n : 0;
  }
  return { cov, lum, w, h };
}

/* ================= RUNS ================= */
const SHOT = arg('--shot', 'sly-closeup');

if (has('--mask5')) {
  const five = ['sly-closeup', 'sly-key', 'sly-startle', 'sly-profile', 'hero'];
  console.log('M5 — mask read at each shot\'s own on-screen scale, albedo only, ink hull on');
  console.log('shot          clip             headPx   inkFrac     sym  enclosure  bandMed  bFrac   eyePx shellFrac');
  for (const s of five) {
    const { clip } = poseTo(s);
    const r = raster({ shot: s, region: 'head' });
    const m = maskRead(r.idBuf, r.W, r.H, { INK: GROUPS.indexOf('ink'), EYE: GROUPS.indexOf('eye') });
    writePNG(path.join(OUT, `${TAG}-mask-${s}.png`), r.W, r.H, toRGB(r.idBuf, r.W, r.H));
    const z = 4;
    const bz = Buffer.alloc(r.W * z * r.H * z * 3), src = toRGB(r.idBuf, r.W, r.H);
    for (let y = 0; y < r.H * z; y++) for (let x = 0; x < r.W * z; x++) {
      const so = (Math.floor(y / z) * r.W + Math.floor(x / z)) * 3, dO = (y * r.W * z + x) * 3;
      bz[dO] = src[so]; bz[dO + 1] = src[so + 1]; bz[dO + 2] = src[so + 2];
    }
    writePNG(path.join(OUT, `${TAG}-mask-${s}-z${z}.png`), r.W * z, r.H * z, bz);
    let shell = 0; for (let i = 0; i < r.W * r.H; i++) if (r.idBuf[i] === ID_SHELL) shell++;
    console.log([s.padEnd(13), clip.padEnd(15), String(m.headPx).padStart(7),
      m.inkFrac.toFixed(4).padStart(9), m.sym.toFixed(3).padStart(7),
      m.enclosure.toFixed(3).padStart(10), m.bandMed.toFixed(2).padStart(8), m.bandFrac.toFixed(2).padStart(6), String(m.eyePx).padStart(7),
      (shell / m.headPx).toFixed(3).padStart(8)].join(' '));
    console.log('              per-eye: ' + m.perEye.map((e, i) =>
      `#${i} px=${e.px} r=${e.r.toFixed(1)} med=${e.med.toFixed(2)} frac=${e.frac.toFixed(2)} rays=${e.rays}`).join('  |  '));
  }
  process.exit(0);
}

if (has('--tailsweep')) {
  /* The 40 px test across azimuth, because ONE shot's azimuth is view-luck: `sly-closeup`
     happens to foreshorten the tail, and a ring count taken there is a fact about that camera,
     not about the tail. The critic's test is a property of the object. Reported worst-case and
     median across 12 azimuths; the tail must survive all of them, because seven of the thirteen
     canonical shots see the character at >=70 deg. */
  console.log('T40 sweep — tail alone, 40 px long axis, albedo + ink hull');
  console.log('  az   comp holes solidity  bands  michelson');
  const rows = [];
  for (let az = 0; az < 360; az += 30) {
    const r = raster({ shot: SHOT, region: 'tail', azOverride: az });
    const d = down(r.idBuf, r.W, r.H, 40);
    const mask = new Uint8Array(d.w * d.h);
    for (let i = 0; i < mask.length; i++) mask[i] = d.cov[i] >= 0.5 ? 1 : 0;
    const s = shapeRead(mask, d.w, d.h), g = ringProfile(d.lum, mask, d.w, d.h);
    rows.push({ az, ...s, ...g });
    console.log(['  ' + String(az).padStart(3), String(s.components).padStart(4),
      String(s.holes).padStart(5), s.solidity.toFixed(3).padStart(8),
      String(g.bands).padStart(6), g.contrast.toFixed(3).padStart(10)].join(' '));
  }
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  console.log('  WORST components=%d  WORST holes=%d  MIN solidity=%s  MIN bands=%d  MEDIAN bands=%d',
    Math.max(...rows.map((r) => r.components)), Math.max(...rows.map((r) => r.holes)),
    Math.min(...rows.map((r) => r.solidity)).toFixed(3),
    Math.min(...rows.map((r) => r.bands)), med(rows.map((r) => r.bands)));
  process.exit(0);
}

if (has('--tail40')) {
  const azArg = arg('--az', null);
  const r = raster({ shot: SHOT, region: 'tail', azOverride: azArg === null ? null : parseFloat(azArg) });
  writePNG(path.join(OUT, `${TAG}-tail-full.png`), r.W, r.H, toRGB(r.idBuf, r.W, r.H));
  const d = down(r.idBuf, r.W, r.H, 40);
  const mask = new Uint8Array(d.w * d.h);
  for (let i = 0; i < mask.length; i++) mask[i] = d.cov[i] >= 0.5 ? 1 : 0;
  const rough = contourRough(mask, d.w, d.h);
  const shape = shapeRead(mask, d.w, d.h);
  const ring = ringProfile(d.lum, mask, d.w, d.h);
  // write the 40px view, and a 10x nearest zoom of it so it can be looked at
  const rgb40 = Buffer.alloc(d.w * d.h * 3);
  for (let i = 0; i < d.w * d.h; i++) {
    const a = d.cov[i], l = d.lum[i];
    const v = Math.round(255 * (1 - a) + l * a);
    rgb40[i * 3] = rgb40[i * 3 + 1] = rgb40[i * 3 + 2] = Math.max(0, Math.min(255, v));
  }
  writePNG(path.join(OUT, `${TAG}-tail40.png`), d.w, d.h, rgb40);
  const z = 12, bz = Buffer.alloc(d.w * z * d.h * z * 3);
  for (let y = 0; y < d.h * z; y++) for (let x = 0; x < d.w * z; x++) {
    const so = (Math.floor(y / z) * d.w + Math.floor(x / z)) * 3, dO = (y * d.w * z + x) * 3;
    bz[dO] = rgb40[so]; bz[dO + 1] = rgb40[so + 1]; bz[dO + 2] = rgb40[so + 2];
  }
  writePNG(path.join(OUT, `${TAG}-tail40-z${z}.png`), d.w * z, d.h * z, bz);
  console.log('T40 shot=%s  full=%dx%d px  down=%dx%d', SHOT, r.W, r.H, d.w, d.h);
  console.log('  ONE CLEAN SHAPE: components=%d (want 1)  holes=%d (want 0)  solidity=%s (want high)',
    shape.components, shape.holes, shape.solidity.toFixed(3));
  console.log('  contourRough = %s   [NON-DISCRIMINATING on a diagonal tail — see header]', rough.rough.toFixed(4));
  console.log('  thickness    = %s px', rough.thick?.toFixed(2));
  console.log('  rings: bands=%d  michelson=%s  (lo=%s hi=%s)', ring.bands, ring.contrast.toFixed(3),
    ring.lo?.toFixed(1), ring.hi?.toFixed(1));
  process.exit(0);
}

/* default: full figure + tuft hold-out attribution */
{
  const r = raster({ shot: SHOT });
  writePNG(path.join(OUT, `${TAG}-${SHOT}-albedo.png`), r.W, r.H, toRGB(r.idBuf, r.W, r.H));
  const all = new Set(famNames.map((_, i) => i));
  const r2 = raster({ shot: SHOT, dropTuft: all });
  writePNG(path.join(OUT, `${TAG}-${SHOT}-notufts.png`), r2.W, r2.H, toRGB(r2.idBuf, r2.W, r2.H));
  console.log('figure %dx%d at %s px/m, %d tris; families: %s', r.W, r.H, r.pxPerM.toFixed(1), r.tris, famNames.join(','));
  console.log('wrote %s-%s-albedo.png and -notufts.png to %s', TAG, SHOT, OUT);
}

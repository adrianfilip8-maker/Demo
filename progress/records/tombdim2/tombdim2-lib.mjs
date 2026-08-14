/**
 * tombdim2-lib.mjs — plumbing for PREREG-tombdim2's scorer: one manifest, one stats lens,
 * one strict pixel diff. The statistics are the parent family's, spelled once
 * (gradetrio-lib.mjs / the redkey-§293 convention: display bytes, Rec.709 L, R-B, HSV S,
 * chroma-weighted circular hue, dark share) so a number in this seal means what it meant in
 * PREREG-tombdim §4 — that is what licenses carrying its ROIs by citation.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DIR = path.join(ROOT, 'progress/records/tombdim21');

export const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];

export const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
export const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;

const _imgCache = new Map();
export const img = (r) => {
  if (!r) return null;
  if (_imgCache.has(r.file)) return _imgCache.get(r.file);
  const f = path.join(DIR, r.file);
  const im = existsSync(f) ? readPNG(f) : null;
  _imgCache.set(r.file, im);
  return im;
};

/** display-byte stats over a rect (the parent family's lens, verbatim). */
export function stats(im, [x0, y0, x1, y1]) {
  let n = 0, sl = 0, srb = 0, ss = 0, cx = 0, cy = 0, wsum = 0, dark = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch;
    const R = im.data[o] / 255, G = im.data[o + 1] / 255, B = im.data[o + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    let h = 0;
    if (d > 1e-6) {
      if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const L = (0.2126 * R + 0.7152 * G + 0.0722 * B) * 255;
    n++; sl += L; srb += (R - B) * 255;
    ss += mx > 1e-6 ? d / mx : 0;
    if (L < 26) dark++;
    cx += d * Math.cos(h * Math.PI / 180); cy += d * Math.sin(h * Math.PI / 180); wsum += d;
  }
  const Rbar = wsum > 1e-9 ? Math.hypot(cx, cy) / wsum : 0;
  return {
    n, meanL: sl / n, meanRB: srb / n, meanS: ss / n, dark: dark / n,
    hMean: wsum > 1e-9 ? ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360 : NaN,
    disp: Rbar > 1e-9 ? Math.sqrt(-2 * Math.log(Rbar)) * 180 / Math.PI : NaN,
  };
}

/** whole-frame population diagnostics — REPORTED, never barred (seal §6: this model cannot
 *  predict them, so they inform the LOOK gate instead of gating the ship). */
export function population(im) {
  let n = 0, cool = 0, warm = 0, dark = 0, bright = 0, sl = 0, sl2 = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const o = (y * im.w + x) * im.ch;
    const R = im.data[o], G = im.data[o + 1], B = im.data[o + 2];
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    n++; sl += L; sl2 += L * L;
    if (R - B <= -5) cool++;
    if (R - B >= 20) warm++;
    if (L < 40) dark++;
    if (L > 120) bright++;
  }
  return { meanL: sl / n, sd: Math.sqrt(sl2 / n - (sl / n) ** 2), cool: cool / n, warm: warm / n, dark: dark / n, bright: bright / n };
}

/** strict differing-px count (any |Δ| >= 1 in R,G,B). */
export function diffPx(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let d = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * a.ch, ob = i * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1]
      || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}
export const bool = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : !!v);

/** R bars — off-vs-back strict [0,0] per shot, same boot (§302). */
export function rBars(report) {
  const guards = {};
  for (const shot of ROSTER) {
    const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
    report.push(`R ${shot.padEnd(12)} off-vs-back ${d} px`);
    guards[`R_${shot}`] = d === null ? null : d === 0;
  }
  return guards;
}

/** V4 — expected row census + ONE src hash == the launch-derived HEAD archive hash. */
export function treeBar(report, expectedRows) {
  const hs = new Set();
  for (const r of manifest.rows) hs.add(r.tree?.src || '?');
  report.push(`trees: {${[...hs]}} expected ${manifest.expect?.head}; rows ${manifest.rows.length} (want ${expectedRows})`);
  return manifest.rows.length === expectedRows && hs.size === 1 && [...hs][0] === manifest.expect?.head;
}

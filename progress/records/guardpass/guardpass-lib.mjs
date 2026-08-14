/**
 * guardpass-lib.mjs — shared plumbing for the two guardpass scorers (guardart / guardcone).
 * One manifest, the gradetrio stats lens, one strict pixel diff, the probe accessors, and
 * the rect machinery both PREREGs' protection rules are written in. Each scorer consumes
 * only the rows its PREREG names; the R bars (off-vs-back, [0,0] per shot) are computed here
 * once and shared by citation, fail-closed in every consumer.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DIR = path.join(ROOT, 'progress/records/guardpass1');

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

/* ── pixels ─────────────────────────────────────────────────────────────────────────────── */

export const lumaOf = (im, o) =>
  0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];

/** display-byte stats over a rect (gradetrio-lib's lens + L>=235 blown share). */
export function stats(im, [x0, y0, x1, y1]) {
  let n = 0, sl = 0, srb = 0, ss = 0, cx = 0, cy = 0, wsum = 0, blown = 0;
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
    if (L >= 235) blown++;
    cx += d * Math.cos(h * Math.PI / 180); cy += d * Math.sin(h * Math.PI / 180); wsum += d;
  }
  return {
    n, meanL: n ? sl / n : NaN, meanRB: n ? srb / n : NaN, meanS: n ? ss / n : NaN,
    blown: n ? blown / n : NaN,
    hMean: wsum > 1e-9 ? ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360 : NaN,
  };
}

/** strict differing-px count (any |Δ| >= 1 in R,G,B), full frame or rect. */
export function diffPx(a, b, rect = null) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  const [x0, y0, x1, y1] = rect || [0, 0, a.w, a.h];
  let d = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const oa = (y * a.w + x) * a.ch, ob = (y * b.w + x) * b.ch;
    if (a.data[oa] !== b.data[ob] || a.data[oa + 1] !== b.data[ob + 1]
      || a.data[oa + 2] !== b.data[ob + 2]) d++;
  }
  return d;
}

/** differing px split against a container rect-union: {inside, outside, total}. */
export function diffSplit(a, b, rects) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return null;
  let inside = 0, outside = 0;
  const rs = rects.filter(Boolean);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const oa = (y * a.w + x) * a.ch, ob = (y * b.w + x) * b.ch;
    if (a.data[oa] === b.data[ob] && a.data[oa + 1] === b.data[ob + 1]
      && a.data[oa + 2] === b.data[ob + 2]) continue;
    let inRect = false;
    for (const [rx0, ry0, rx1, ry1] of rs) {
      if (x >= rx0 && x < rx1 && y >= ry0 && y < ry1) { inRect = true; break; }
    }
    if (inRect) inside++; else outside++;
  }
  return { inside, outside, total: inside + outside };
}

/* ── rects ──────────────────────────────────────────────────────────────────────────────── */

export const dilate = (r, px, W = 1280, H = 720) => (r
  ? [Math.max(0, r[0] - px), Math.max(0, r[1] - px), Math.min(W, r[2] + px), Math.min(H, r[3] + px)]
  : null);
export const erode = (r, fx = 0.15) => (r
  ? [Math.round(r[0] + (r[2] - r[0]) * fx), Math.round(r[1] + (r[3] - r[1]) * fx),
     Math.round(r[2] - (r[2] - r[0]) * fx), Math.round(r[3] - (r[3] - r[1]) * fx)]
  : null);
export const rectArea = (r) => (r ? Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]) : 0);
export const intersect = (a, b) => {
  if (!a || !b) return null;
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return (r[2] > r[0] && r[3] > r[1]) ? r : null;
};
export const discRect = (d) => (d ? [d.c[0] - d.r, d.c[1] - d.r, d.c[0] + d.r, d.c[1] + d.r] : null);

/* ── probe accessors ────────────────────────────────────────────────────────────────────── */

export const probeOf = (shot, arm) => row(shot, arm)?.probe || null;
export const subjectBox = (shot, arm) => {
  const p = probeOf(shot, arm);
  if (!p) return null;
  return p.guards?.[p.subjIdx]?.bbox || null;
};
/** every probe container rect for one arm (PREREG-guardcone §4's union). */
export function coneContainers(shot, arm, pad = 24) {
  const p = probeOf(shot, arm);
  if (!p) return [];
  const out = [];
  for (const g of p.guards || []) {
    if (g.bbox) out.push(dilate(g.bbox, pad));
    if (g.beamRect) out.push(dilate(g.beamRect, pad));
    if (g.poolRect) out.push(dilate(g.poolRect, pad));
  }
  if (p.spill?.rect) out.push(p.spill.rect);
  if (p.ahead) out.push(dilate(discRect(p.ahead), pad));
  return out.filter(Boolean);
}
export function guardBoxes(shot, arm, pad = 32) {
  const p = probeOf(shot, arm);
  return (p?.guards || []).map((g) => dilate(g.bbox, pad)).filter(Boolean);
}
export const anyGuardInFrame = (shot, arm) =>
  (probeOf(shot, arm)?.guards || []).some((g) => g.bbox);

/* ── shared bars ────────────────────────────────────────────────────────────────────────── */

/** R bars — off-vs-back strict [0,0] per shot; shared by both seals (fail-closed). */
export function rBars(report) {
  const guards = {};
  for (const shot of ROSTER) {
    const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
    report.push(`R ${shot.padEnd(12)} off-vs-back ${d} px`);
    guards[`R_${shot}`] = d === null ? null : d === 0;
  }
  return guards;
}

/** V-TREE: expected row census + ONE src hash == expect. */
export function treeBar(report, expectedRows = 82) {
  const hs = new Set();
  for (const r of manifest.rows) hs.add(r.tree?.src || '?');
  report.push(`trees: {${[...hs]}} expected ${manifest.expect?.head}; rows ${manifest.rows.length} (want ${expectedRows})`);
  return manifest.rows.length === expectedRows && hs.size === 1 && [...hs][0] === manifest.expect?.head;
}

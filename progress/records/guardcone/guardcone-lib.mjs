/**
 * guardcone-lib.mjs — shared plumbing for guardcone-score.mjs.
 *
 * FORK of progress/records/guardpass/guardpass-lib.mjs, re-scoped to the cone-only capture
 * per PREREG-guardcone AMENDMENT A1 (§309 parks the guard mannequin; the shared guardart
 * seal is WAIVED-UNSCORED, so the two-seal plumbing has one consumer left). The pixel lens,
 * the diff, the rect machinery and the R bars are copied VERBATIM from the sealed lib — not
 * one predicate is re-derived. What changed, and only this:
 *
 *   - DIR            guardpass1/ -> guardcone1/                      (A1.3 run identity)
 *   - treeBar rows   82 -> 49                                        (A1.2, a census not a band)
 *   - rBars          restated in place instead of "shared by citation" (A1.2 — same predicate,
 *                    same [0,0] band, same fail-closed wiring; the seal it cited is waived)
 *   - parkBar        NEW (A1.2 PARK1) — the §309 parking measured, not assumed
 *   - guardart-only accessors (guardBoxes, anyGuardInFrame) dropped: no consumer.
 */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DIR = path.join(ROOT, 'progress/records/guardcone1');

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

/* ── shared bars ────────────────────────────────────────────────────────────────────────── */

/**
 * R bars — strict differing-px of diff(off, back) per shot, same boot, band [0,0] each,
 * fail-closed in every consumer. AMENDMENT A1.2: restated here in place (the sealed text
 * cited PREREG-guardart §4 for the row definition, and that seal is WAIVED-UNSCORED). The
 * predicate and the band are copied, not re-derived.
 */
export function rBars(report) {
  const guards = {};
  for (const shot of ROSTER) {
    const d = diffPx(img(row(shot, 'off')), img(row(shot, 'back')));
    report.push(`R ${shot.padEnd(12)} off-vs-back ${d} px`);
    guards[`R_${shot}`] = d === null ? null : d === 0;
  }
  return guards;
}

/** V-TREE: expected row census + ONE src hash == expect. A1.2: 49 rows (was 82). */
export function treeBar(report, expectedRows = 49) {
  const hs = new Set();
  for (const r of manifest.rows) hs.add(r.tree?.src || '?');
  report.push(`trees: {${[...hs]}} expected ${manifest.expect?.head}; rows ${manifest.rows.length} (want ${expectedRows})`);
  return manifest.rows.length === expectedRows && hs.size === 1 && [...hs][0] === manifest.expect?.head;
}

/**
 * PARK1 (AMENDMENT A1.2, NEW) — the §309 parking measured rather than assumed: EVERY captured
 * row must read guardArt 0, guardSkin 0, painted false, skin-shift flag false. The runner does
 * not write those levers at all, so any non-zero here means the parking did not hold in the
 * boot and the capture is VOID (not FAIL — it is a validity bar). Strictly one-directional: it
 * can turn a PASS into a VOID, never a FAIL into a PASS.
 */
export function parkBar(report) {
  let ok = 0;
  const bad = [];
  for (const r of manifest.rows) {
    const p = r.readback?.park;
    if (!p) { bad.push(`${r.shot}.${r.arm}: no park readback`); continue; }
    if (p.guardArt === 0 && p.guardSkin === 0 && p.painted === false && p.skinShift === false) ok++;
    else bad.push(`${r.shot}.${r.arm}: art=${p.guardArt} skin=${p.guardSkin} painted=${p.painted} shift=${p.skinShift}`);
  }
  report.push(`PARK1 §309 guard-model levers inert in ${ok}/${manifest.rows.length} rows`
    + (bad.length ? ` — VIOLATIONS: ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ''}` : ''));
  return manifest.rows.length > 0 && bad.length === 0;
}

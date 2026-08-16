/**
 * fxrimlib.mjs — the region primitives §379.4's measurement is built from.
 *
 * Extracted from `fxrimscore.mjs` for the reason `framelib.mjs` states in its own header and
 * this project keeps re-learning: a second copy is a second thing to keep true, and the copy
 * is the one that goes stale. `tests/fxrim.test.mjs` seals these; the scorer runs them. If the
 * test carried its own band-builder it would be sealing a band nobody measures with.
 *
 * Everything here is pure pixel arithmetic at `framelib`'s fixed 1280x720. Nothing reads an
 * image, nothing opens a browser.
 */
import { W, H } from './framelib.mjs';
import { TUNE as TOON_TUNE } from '../src/render/ToonMaterial.js';

/**
 * The band half-width the measurement reports at, in pixels.
 *
 * Derived, not chosen: `ToonMaterial.TUNE.inkPx` is the shipped line width in device pixels
 * ("AGENTS: lines stay ~2.5 px on screen"), so a band centred on a boundary needs `inkPx / 2`
 * to contain the whole line — plus 1 px because FXAA runs AFTER the ink pass and smears it
 * outward by up to a pixel. Read off the source constant so a change to the line width moves
 * the band with it instead of leaving a band that no longer contains what it is measuring.
 *
 * The scorer prints the whole sweep beside this one, so no verdict turns on the choice.
 */
export const BAND_R = TOON_TUNE.inkPx / 2 + 1;

export const idx = (x, y) => y * W + x;
export const inFrame = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

/** Stamp a filled disc of radius `r` at (cx, cy) — pixel-centre sampled — into `m`. */
export function stamp(m, cx, cy, r) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inFrame(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) m[idx(x, y)] = 1;
    }
  }
  return m;
}

export const countOf = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };

/**
 * A band of half-width `r` around the CLOSED polyline `pts` (`discOf(...).rim`'s own samples).
 *
 * Stepped at half a pixel along each chord, so the band is continuous rather than a string of
 * beads: at `discOf`'s 720 samples a chord on this frame's ring is ~1.2 px and a per-vertex
 * stamp would already be continuous, but the function must not depend on the caller's segment
 * count for its connectivity.
 */
export function bandOfPolyline(pts, r) {
  const m = new Uint8Array(W * H);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.px - a.px, b.py - a.py);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stamp(m, a.px + (b.px - a.px) * t, a.py + (b.py - a.py) * t, r);
    }
  }
  m.n = countOf(m);
  return m;
}

/** The boundary pixels of a mask: in it, with at least one 4-neighbour outside it. */
export function boundaryOf(mask) {
  const out = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!mask[idx(x, y)]) continue;
      if (mask[idx(x - 1, y)] && mask[idx(x + 1, y)] && mask[idx(x, y - 1)] && mask[idx(x, y + 1)]) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/** A band of half-width `r` around a list of `[x, y]` pixels. */
export function bandOfPixels(pixels, r) {
  const m = new Uint8Array(W * H);
  for (const [x, y] of pixels) stamp(m, x + 0.5, y + 0.5, r);
  m.n = countOf(m);
  return m;
}

/** Fraction of `region` that is also in `mask`. */
export function density(region, mask) {
  let hit = 0;
  const n = region.n ?? countOf(region);
  for (let i = 0; i < region.length; i++) if (region[i] && mask[i]) hit++;
  return { hit, n, d: n ? hit / n : 0 };
}

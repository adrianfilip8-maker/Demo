/**
 * Shared instrument code for the two fxfix1 seals (PREREG-fxghost2 / PREREG-rimfloor2).
 *
 * The STATISTICS are imported from the parent run's library rather than re-implemented — the
 * whole point of `fxartifact-lib.mjs` was one implementation of each statistic across the
 * seals that quote each other's numbers, and this run quotes the parent's off-frame
 * populations directly. What lives here is only what is specific to THIS run: where its frames
 * are, what its arms commanded, and what "everything else at base" means for its lever set.
 * The BANDS live in the scorers (one per seal), never here.
 */
import {
  L, diffPx, roiMeanL, contribution, coolGlint, speck, meanDropOverSet, writeCrop,
} from '../fxartifact/fxartifact-lib.mjs';
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export { L, diffPx, roiMeanL, contribution, coolGlint, speck, meanDropOverSet, writeCrop };

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const DIR = path.join(ROOT, 'progress/records/fxfix1');

export function loadRun() {
  const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const row = (shot, arm) => manifest.rows.find((r) => r.shot === shot && r.arm === arm) || null;
  const img = (shot, arm) => {
    const r = row(shot, arm);
    if (!r) return null;
    const f = path.join(DIR, r.file);
    return existsSync(f) ? readPNG(f) : null;
  };
  return { manifest, row, img };
}

/** Levers at base — the state every arm is restored to before its one change is applied. */
const BASE = {
  uAmbGain: 1, uAlphaGain: 1, sandVis: true,
  uRimShadowFloorArch: 0.55, uRimShadowFloor: 0.45, uRimFloorOffCut: 0,
};

/** What each arm commanded. Anything not listed is at BASE — that is the §40 contract. */
export const ARM_EXPECT = {
  off: {}, back: {},
  ahide: { sandVis: false },
  g25: { uAmbGain: 0.25 }, g00: { uAmbGain: 0.0 },
  t30: { uAlphaGain: 0.30 }, t18: { uAlphaGain: 0.18 },
  k10: { uRimShadowFloorArch: 0.10 },
  rimz: { uRimShadowFloor: 0.0 },
  w35: { uRimFloorOffCut: 0.35 }, w45: { uRimFloorOffCut: 0.45 },
  b35: { uRimShadowFloorArch: 0.10, uRimFloorOffCut: 0.35 },
  b45: { uRimShadowFloorArch: 0.10, uRimFloorOffCut: 0.45 },
};

/**
 * Readback check: every lever at its commanded value for this arm and everything else at base,
 * plus the two conditions that make the frame scoreable at all — the composite is running
 * (`postfxOk`) and no OTHER batch picked up a gain (`strayGains`), which is the measured half
 * of PREREG-fxghost2's by-construction scoping claim.
 */
export function readbackOK(rowObj, expect) {
  const rb = rowObj?.readback;
  if (!rb) return false;
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
  const want = { ...BASE, ...expect };
  if (rb.postfxOk !== true) return false;
  if (rb.strayGains && rb.strayGains.length) return false;
  return near(rb.uAmbGain, want.uAmbGain) && near(rb.uAlphaGain, want.uAlphaGain)
    && rb.sandVis === want.sandVis
    && near(rb.uRimShadowFloorArch, want.uRimShadowFloorArch)
    && near(rb.uRimShadowFloor, want.uRimShadowFloor)
    && near(rb.uRimFloorOffCut, want.uRimFloorOffCut);
}

/**
 * Tree stamps (§296 per-capture): ONE src content hash across every row. This run installs
 * nothing, so the expected value is not a manifest constant — it is "whatever the boot started
 * with, unchanged for every capture". A foreign src landing mid-run (five other lanes share
 * this tree) changes it and VOIDs here, which is the only thing the stamp has to catch.
 */
export function stampsOK(manifest) {
  if (!manifest.rows.length) return false;
  const first = manifest.rows[0].tree?.src;
  if (!first) return false;
  for (const r of manifest.rows) if (r.tree?.src !== first) return false;
  return true;
}

/** V3: the composite ran and the page logged no errors, on every row. */
export function pageCleanOK(manifest) {
  if (!manifest.rows.length) return false;
  for (const r of manifest.rows) {
    if (r.readback?.postfxOk !== true) return false;
    if ((r.consoleErrors ?? 0) !== 0) return false;
  }
  return (manifest.consoleErrors?.length ?? 0) === 0;
}

/** Count px in a box whose |ΔL| between two frames is >= thr. */
export function changedInBox(a, b, [x0, y0, x1, y1], thr = 2) {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * a.w + x) * a.ch, j = (y * b.w + x) * b.ch;
    if (Math.abs(L(a.data[i], a.data[i + 1], a.data[i + 2])
      - L(b.data[j], b.data[j + 1], b.data[j + 2])) >= thr) n++;
  }
  return n;
}

/**
 * PREREG-rimfloor2 §3's character instrument: the set of pixels inside `box` that the
 * SCREEN-rim shadow floor lifts, frozen from this boot's own reference arm.
 *   RIMSET = { p in box : L(off) - L(rimz) >= lift }
 */
export function rimSet(off, rimz, [x0, y0, x1, y1], lift = 3) {
  const set = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * off.w + x) * off.ch, j = (y * rimz.w + x) * rimz.ch;
    const d = L(off.data[i], off.data[i + 1], off.data[i + 2])
      - L(rimz.data[j], rimz.data[j + 1], rimz.data[j + 2]);
    if (d >= lift) set.push(y * off.w + x);
  }
  return set;
}

/** Mean drop and hit fraction (drop >= hitThr) of `arm` against `off` over a frozen set. */
export function setDrop(off, arm, set, hitThr = 2) {
  if (!set.length) return null;
  let s = 0, hit = 0;
  for (const p of set) {
    const i = p * off.ch, j = p * arm.ch;
    const d = L(off.data[i], off.data[i + 1], off.data[i + 2])
      - L(arm.data[j], arm.data[j + 1], arm.data[j + 2]);
    s += d;
    if (d >= hitThr) hit++;
  }
  return { drop: s / set.length, hit: hit / set.length, n: set.length };
}

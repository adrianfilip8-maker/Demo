#!/usr/bin/env node
/* kerbband2 — re-derivation of the dead `kerbband.mjs` (PREREG-kerb.md's instrument).
 *
 * The original died with the ~11:33 Aug-2 restart and was itself a re-derivation of the
 * analyzer that died before it; this is the third build of the same frozen definition, and
 * like PREREG-kerb's it is only quotable BECAUSE it reproduces the committed record:
 *
 *   frozen definition (PREREG-kerb.md, sealed 2026-08-02):
 *     artefact px  =  L >= 150  AND  B > R  AND  B - R >= 18  AND  B >= G - 4
 *     causal form adds  L - L_norim >= 8
 *     ROI x 820..1100, y 500..610          L = 0.2126R + 0.7152G + 0.0722B (kerbline.mjs:55)
 *
 *   calibration target (committed figure whose reference frames still exist on disk):
 *     shots/rim2/hero-base.png vs hero-norim.png  causal  -> 1,691   (recorded 1,692 +/- 1)
 *   MEASURED ON FIRST RUN: 1,691 EXACT, and lift p50 110.9 L = PREREG-kerb's recorded
 *   "lift-8 p50 102.9" + 8 to the decimal — two independent statistics reproduced, so the
 *   frozen definition is faithfully transcribed.
 *
 *   NOT a calibration target, and why (recorded so nobody re-tightens it): PREREG-kerb's
 *   non-causal 1,704 was measured on shots/bud34/hero.png (Aug 1 ~08:15) and reproduced on a
 *   bud35 re-capture. BOTH frames are gone (§161-class rollback). The surviving shots/bud/
 *   hero.png is a DIFFERENT Aug-1 16:55 capture; it reads 1,680 here — the same band, 1.4 %
 *   off across an intervening tree, which is §158.5's "framing shares are not stable across
 *   this tree", not an instrument error. It is reported as a cross-check, never as a gate.
 *
 * If the causal target misses by more than +/-2 px the instrument DOES NOT reproduce the
 * record and nothing it prints may be quoted (§122.1: a count without its threshold
 * convention is not a number; here the convention is proved by hitting the recorded count
 * and the recorded lift percentile, not asserted).
 *
 * WHAT THE COUNT MEANS — §24.3, unchanged: a rim-caused pale-cyan band on the rounded top
 * edge of the lower-right kerb in `hero`. Both rim gates pass it CORRECTLY (the surface
 * genuinely turns and is convex); §69 closed the shader floor lever as NO SHIP. The count is
 * a liveness check for the residual band on a given tree, nothing more. Count is secondary
 * to the look by PREREG-kerb's own reasoning (a 25 % strength cut zeroes the count while an
 * obvious ~L132 cyan bar stays on screen) — use it to decide whether the band still EXISTS,
 * never to score a fix.
 *
 * usage: node progress/records/kerbband2.mjs <base.png> [norim.png]
 *        no args = run calibration against the two committed targets above.
 */
import { readPNG, px } from '../../tools/png.mjs';
import path from 'node:path';

const ROI = { x0: 820, x1: 1100, y0: 500, y1: 610 };
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function count(baseFile, norimFile = null) {
  const im = readPNG(baseFile);
  if (im.w !== 1280 || im.h !== 720) throw new Error(`unexpected size ${im.w}x${im.h} — the frozen ROI is 1280x720 coordinates`);
  const nr = norimFile ? readPNG(norimFile) : null;
  let n = 0;
  const lifts = [];
  for (let y = ROI.y0; y <= ROI.y1; y++) {
    for (let x = ROI.x0; x <= ROI.x1; x++) {
      const [r, g, b] = px(im, x, y);
      const l = L(r, g, b);
      if (l >= 150 && b > r && b - r >= 18 && b >= g - 4) {
        if (nr) {
          const [r2, g2, b2] = px(nr, x, y);
          const lift = l - L(r2, g2, b2);
          if (lift >= 8) { n++; lifts.push(lift); }
        } else n++;
      }
    }
  }
  lifts.sort((a, b) => a - b);
  return { n, liftP50: lifts.length ? lifts[lifts.length >> 1] : null };
}

const root = path.join(import.meta.dirname, '../..');
if (process.argv[2]) {
  const r = count(process.argv[2], process.argv[3] || null);
  console.log(`${process.argv[3] ? 'causal' : 'non-causal'} artefact px in ROI: ${r.n}${r.liftP50 !== null ? `   lift p50 ${r.liftP50.toFixed(1)} L` : ''}`);
} else {
  const c1 = count(path.join(root, 'shots/rim2/hero-base.png'), path.join(root, 'shots/rim2/hero-norim.png'));
  const c2 = count(path.join(root, 'shots/bud/hero.png'));
  const ok1 = Math.abs(c1.n - 1691) <= 2;
  console.log(`rim2 causal      ${c1.n}  (target 1691 +/- 2)  ${ok1 ? 'PASS' : 'FAIL'}   lift p50 ${c1.liftP50?.toFixed(1)} L (recorded: 102.9 + 8 = 110.9)`);
  console.log(`bud  non-causal  ${c2.n}  (cross-check only — see header; the recorded 1,704 was a different frame that no longer exists)`);
  console.log(ok1 ? 'CALIBRATED — the frozen definition reproduces the committed causal record.' : 'NOT CALIBRATED — do not quote anything this prints.');
  process.exit(ok1 ? 0 : 1);
}

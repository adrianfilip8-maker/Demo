/**
 * pupildiff2.mjs — the SPEC-startle-pupils difference, A vs B, on PINNED boxes.
 *
 * WHAT THIS IS, AS THE GAP (KNOWN_ISSUES §11) — the suffix between this number and the drawn
 * frame is EMPTY on the measurement side: this reads the delivered PNGs and nothing else. It
 * runs no rig, samples no clip, projects nothing. That is deliberate and is the whole design:
 *
 *   `interiorink --eyes` derives its eye boxes by projecting live eye-group vertices. The pupil
 *   ellipsoid is exactly what changes between A and B, so a re-derived box is a DIFFERENT box at
 *   each endpoint, and differencing two statistics computed over two different ROIs measures the
 *   ROI move as well as the pupil. §27.1 is the same hazard from the other side (live instrument,
 *   stale frame); here it is live instrument, two frames it must treat identically.
 *
 * So the boxes are PINNED to the ones the cap7 record published for exactly this purpose
 * ("boxes given so B can be differenced against exactly these"), and both frames are measured
 * with the identical rectangle. Sizes match the frozen 25x26.
 *
 * Metrics are the SPEC's, not interiorink's: darkFrac = fraction of box px with L < 60 (the
 * pupil disc), glintMax = max L in box (the catchlight). interiorink reports median/p95/max and
 * never computed darkFrac, so the SPEC's primary had no implementation until now.
 *
 * Delta convention, from SPEC-startle-pupils and §27.2: dDarkFrac = calibration - verdict,
 * calibration = keys NEUTRALISED (Capture B, cap8), verdict = keys ACTIVE (Capture A, cap7).
 * Constriction shrinks the dark disc, so a working mechanism gives a POSITIVE delta.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const BOXES = {
  'left(screen), anat R': { x0: 585, y0: 219, x1: 609, y1: 244 },
  'right(screen), anat L': { x0: 680, y0: 222, x1: 704, y1: 247 },
};

const A = readPNG('/home/user/Demo/shots/cap7/sly-startle.png'); // verdict: keys ACTIVE
const B = readPNG('/home/user/Demo/shots/cap8/sly-startle.png'); // calibration: keys NEUTRALISED

const luma = (im, x, y) => {
  const o = (y * im.w + x) * im.ch;
  return 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];
};

function stats(im, b) {
  const Ls = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) Ls.push(luma(im, x, y));
  Ls.sort((p, q) => p - q);
  const qf = (f) => Ls[Math.min(Ls.length - 1, Math.floor(f * Ls.length))];
  return {
    n: Ls.length,
    darkFrac: Ls.filter((l) => l < 60).length / Ls.length,
    glintMax: Ls[Ls.length - 1],
    median: qf(0.5),
    p95: qf(0.95),
  };
}

console.log(`A = cap7/sly-startle.png  (verdict, pupil keys ACTIVE)      ${A.w}x${A.h}`);
console.log(`B = cap8/sly-startle.png  (calibration, keys NEUTRALISED)   ${B.w}x${B.h}`);
console.log(`boxes PINNED from the cap7 record; identical rectangle on both frames.\n`);

const band = (d) => (d >= 0.12 ? 'PASS' : d >= 0.05 ? 'IMPROVED' : 'FAIL');

for (const [label, b] of Object.entries(BOXES)) {
  const a = stats(A, b), c = stats(B, b);
  const d = c.darkFrac - a.darkFrac;
  console.log(`${label}  box [${b.x0},${b.y0}..${b.x1},${b.y1}] (${a.n} px)`);
  console.log(`   darkFrac(L<60)   A(active) ${a.darkFrac.toFixed(4)}   B(neutral) ${c.darkFrac.toFixed(4)}   dDark = B-A = ${d >= 0 ? '+' : ''}${d.toFixed(4)}  -> ${band(d)}`);
  console.log(`   glintMax         A ${a.glintMax.toFixed(1)}   B ${c.glintMax.toFixed(1)}   d = ${(c.glintMax - a.glintMax >= 0 ? '+' : '')}${(c.glintMax - a.glintMax).toFixed(1)}   (SPEC guard: >= L180 both eyes)`);
  console.log(`   median           A ${a.median.toFixed(1)}   B ${c.median.toFixed(1)}      p95  A ${a.p95.toFixed(1)}   B ${c.p95.toFixed(1)}\n`);
}

/* Whole-frame sanity: if the two captures differ far outside the eyes, something other than the
   pupil keys moved between them and no eye delta is attributable. 338abec's diff is 4 pupil
   lines in Clips.js, so this should be near-zero away from the eye boxes. */
let diffPx = 0, total = 0, maxd = 0;
for (let y = 0; y < A.h; y += 2) for (let x = 0; x < A.w; x += 2) {
  const inEye = Object.values(BOXES).some((b) => x >= b.x0 - 2 && x <= b.x1 + 2 && y >= b.y0 - 2 && y <= b.y1 + 2);
  if (inEye) continue;
  total++;
  const d = Math.abs(luma(A, x, y) - luma(B, x, y));
  if (d > 2) diffPx++;
  if (d > maxd) maxd = d;
}
console.log(`frame-wide control OUTSIDE the eye boxes: ${diffPx}/${total} sampled px differ by >2L (${(100 * diffPx / total).toFixed(3)}%), max dL ${maxd.toFixed(1)}`);
console.log(`(A and B must differ ONLY by the pupil keys for the delta to be attributable.)`);

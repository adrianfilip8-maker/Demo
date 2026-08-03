/**
 * Score a hue-attribution A/B: does turning a term OFF move the pixels it is accused of tinting?
 *
 * Both of `tone2`'s remaining seals are HUE claims, and a differing-pixel count cannot answer
 * either. `PREREG-sphinxrim` says the surface rim can turn shadowed sandstone (hue 355 deg) into
 * pale blue-grey (hue 196 deg) and states plainly that this is **a capability result, not an
 * attribution** — §23's standing warning that a term can be present, firing, and provably able to
 * produce the exact signature and still not be the cause. This is the discriminating test.
 *
 *   node tools/huetest.mjs <onPng> <offPng> <loHue> <hiHue> [label]
 *
 * METHOD. The accused population is derived IN-RUN, never inherited (§73.2, §63.2): pixels whose
 * hue in the ON arm falls inside [loHue, hiHue] and whose luma is low enough to be shadowed
 * rather than sky. It then reports what those same pixels do in the OFF arm.
 *
 *   - retention = fraction of the accused population still inside the hue window with the term OFF
 *   - a LOW retention means the term is the cause: remove it and the tint goes
 *   - a HIGH retention means the term is NOT the cause, however capable the arithmetic showed it
 *
 * Sky is excluded by luma because a blue sky trivially satisfies a blue hue window and would
 * swamp the population with pixels nobody is arguing about. The exclusion is reported so the
 * reader can see how much it removed.
 *
 * SCOPE: hue is computed on the delivered sRGB, i.e. after the whole chain. That is correct for
 * "is it teal on screen" and wrong for any claim about scene-linear radiance. It also cannot say
 * WHICH object the pixels belong to — a raycast does that, and §82.4's routing used one.
 */
import { readPNG } from './png.mjs';

/* A SATURATION FLOOR IS NOT OPTIONAL HERE, and leaving it out cost a wrong verdict.
   The first run took every pixel with hue in [170,220] and luma <= 200: 124,759 px, 13.54% of
   the frame, and I was about to quote its 94.6% retention as a verdict about the SPHINXES.
   Looking at the frame showed the population was dominated by the pale lavender SKY and the
   blue-grey shadowed DUNE — neither of which anyone is arguing about. The sphinxes are a small,
   strongly saturated cyan mass at the left.
   Hue alone cannot separate "turquoise statue" from "pale dusk sky": they share a hue window and
   differ in saturation by a wide margin. This is BRIEF-critic7's requirement 6 — state how the
   ROI was derived and show it contains what it claims — applied to my own measurement. */
const [onP, offP, loS, hiS, label, satS] = process.argv.slice(2);
const lo = +loS, hi = +hiS, SAT_MIN = satS === undefined ? 0 : +satS;
const A = readPNG(onP), B = readPNG(offP);
const { w, h } = A, ch = A.data.length / (w * h), N = w * h;

const hueOf = (d, p) => {
  const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 1e-6) return -1;                       // achromatic: no hue, excluded rather than binned
  let H;
  if (mx === r) H = ((g - b) / c) % 6;
  else if (mx === g) H = (b - r) / c + 2;
  else H = (r - g) / c + 4;
  H *= 60; if (H < 0) H += 360;
  return H;
};
const inWin = (H) => H >= 0 && (lo <= hi ? (H >= lo && H <= hi) : (H >= lo || H <= hi));
const luma = (d, p) => 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
const satOf = (d, p) => {
  const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx < 1e-6 ? 0 : (mx - mn) / mx;                     // HSV saturation
};

const LUMA_MAX = 200;   // sky exclusion; reported below so it is not a hidden knob
let accused = 0, skyDropped = 0, satDropped = 0, retained = 0;
let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
let hSumOn = 0, hSumOff = 0, lSumOn = 0, lSumOff = 0;
const offHues = [];
for (let i = 0, p = 0; i < N; i++, p += ch) {
  const H = hueOf(A.data, p);
  if (!inWin(H)) continue;
  if (luma(A.data, p) > LUMA_MAX) { skyDropped++; continue; }
  if (satOf(A.data, p) < SAT_MIN) { satDropped++; continue; }
  accused++;
  const x = i % w, y = (i / w) | 0;
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  hSumOn += H; lSumOn += luma(A.data, p);
  const H2 = hueOf(B.data, p);
  offHues.push(H2);
  hSumOff += H2 < 0 ? H : H2; lSumOff += luma(B.data, p);
  if (inWin(H2)) retained++;
}

console.log(`${label || ''}  ${onP.split('/').pop()} vs ${offP.split('/').pop()}`);
console.log(`  hue window [${lo}..${hi}]deg, luma <= ${LUMA_MAX} (bright excluded: ${skyDropped} px), `
  + `saturation >= ${SAT_MIN} (desaturated excluded: ${satDropped} px)`);
if (!accused) { console.log('  ACCUSED POPULATION EMPTY — nothing to attribute. The window finds no pixels.'); process.exit(0); }
console.log(`  accused population (ON arm, in window): ${accused} px  (${(100 * accused / N).toFixed(2)}% of frame)`);
console.log(`  its bounding box: x ${bx0}..${bx1}  y ${by0}..${by1}  `
  + '<- CHECK THIS CONTAINS WHAT YOU ARE ARGUING ABOUT before quoting anything below');
console.log(`  mean hue  ON ${(hSumOn / accused).toFixed(1)}deg  ->  OFF ${(hSumOff / accused).toFixed(1)}deg`);
console.log(`  mean luma ON ${(lSumOn / accused).toFixed(1)}     ->  OFF ${(lSumOff / accused).toFixed(1)}`);
const ret = retained / accused;
console.log(`  RETENTION with the term OFF: ${retained}/${accused} = ${(100 * ret).toFixed(1)}%`);
console.log(ret < 0.20
  ? '  => the term IS the cause: removing it clears the tint from >80% of the accused pixels.'
  : ret > 0.60
    ? '  => the term is NOT the cause: the tint survives without it, however capable the arithmetic.'
    : '  => PARTIAL: the term contributes but does not account for the population. Do not bank either way.');

/**
 * mkca.mjs — synthesise a KNOWN-BAD symmetric chromatic aberration from an arm.
 *
 *   node mkca.mjs <in.png> <out.png> [shiftPx]
 *
 * §13's rule: a metric that has never been shown to move on a state KNOWN to have the defect is
 * not evidence about that defect, in either direction. `fringefind`/`inkpair` are being used to
 * say the ink fringe is not symmetric CA — so they must first be shown to FIRE on real symmetric
 * CA. This makes that state by shifting R one way and B the other, which is what a lens does.
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';
import { writePNG } from '/home/user/Demo/tools/crop.mjs';

const [inP, outP, sS] = process.argv.slice(2);
const S = sS === undefined ? 1 : +sS;
const I = readPNG(inP);
const { w, h, ch } = I;
const out = Buffer.alloc(w * h * 3);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const o = (y * w + x) * 3;
  const xr = Math.min(w - 1, Math.max(0, x + S));      // red pushed one way
  const xb = Math.min(w - 1, Math.max(0, x - S));      // blue pushed the other: symmetric
  out[o] = I.data[(y * w + xr) * ch];
  out[o + 1] = I.data[(y * w + x) * ch + 1];
  out[o + 2] = I.data[(y * w + xb) * ch + 2];
}
writePNG(outP, w, h, out);
console.log(`${outP}  symmetric CA, shift +-${S}px, from ${inP.split('/').pop()}`);

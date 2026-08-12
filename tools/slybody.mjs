/**
 * slybody.mjs — derive `sly_body_fix.png` from the supplied `sly_body.png` by rotating the
 * costume blue back onto the hue the render was built to receive. Critic 9 D2, §277/§278.
 *
 * ## Why a rotation, and why exactly -11.3°
 *
 * §277 measured the supplied albedo over 40 209 shirt-blue texels and found two different things:
 *
 *   saturation  0.927  against the reference's 0.909 — CORRECT, and consistent (p05-p95 = 0.080)
 *   hue         229.3° against the reference's 213.5° — violet (circular median, run-4 scorer)
 *
 * So this tool must move hue and must not touch saturation or value. An HSV hue rotation does
 * exactly that and is exactly invertible, which also makes the A/B honest: `?body=raw` is not an
 * approximation of the original, it IS the original file.
 *
 * The rotation is NOT `213.5 - 229.3 = -15.8`. That naive target ignores the render's own
 * per-shot hue offset, measured per shot by the same-boot swap instrument (RESULT-bodyshift.md,
 * arm-mean, fresh boots reproduced to 0.4°) on the only two canonical shots where the albedo
 * governs screen hue at all (§281):
 *
 *     dS(sly-closeup) = -0.9°     dS(sly-perch) = -8.2°     midrange -4.5°
 *     target albedo   = 213.5 - (-4.5) = 218.0°     rotation = 218.0 - 229.3 = -11.3°
 *
 * That centres both close-ups in the reference band 213.5 ± 6.0° (predicted landings 217.1° and
 * 209.8°). **The earlier -21.1° is refuted history**: it pre-compensated for §277's +5.6° render
 * shift, which RESULT-bodyhue.md showed was an average over shadow-dominated outliers with the
 * wrong sign per shot — measured, the render shifts the costume toward CYAN, per shot, not
 * violet. (The 207.8° hand-authored original that corroborated -21.1° descended from the same
 * frame population as the +5.6°, so its agreement was not independent.) Sealed:
 * PREREG-bodyhue5.md.
 *
 * ## What is touched
 *
 * Only texels already in the costume-blue family (hue 190-270°, sat > 0.15, opaque). The shorts
 * (tan), sash (red), belt (gold), mask (black) and white are left byte-identical, and the tool
 * asserts that. Cap, gloves and boots ARE rotated: they are the same brand blue as the shirt and
 * §196's "ONE blue" rule applies to the whole costume, not just the torso.
 *
 * Usage:  node tools/slybody.mjs [outPath] [--deg=-11.3]
 * Prints before/after hue and saturation so the claim is checkable from the run, not from here.
 */
import { readPNG } from './png.mjs';
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const SRC = new URL('../src/assets/sly-dl/sly_body.png', import.meta.url).pathname;
const argv = process.argv.slice(2);
const OUT = argv.find((a) => !a.startsWith('--')) || '/tmp/sly_body_fix.png';
const DEG = Number((argv.find((a) => a.startsWith('--deg=')) || '--deg=-11.3').split('=')[1]);

/* The costume-blue window. Deliberately wide enough to include cap/gloves/boots and narrow
   enough to exclude the tan shorts and the red sash, both of which are far outside it. */
const H_LO = 190, H_HI = 270, S_MIN = 0.15;

const rgb2hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx];
};

const hsv2rgb = (h, s, v) => {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

const im = readPNG(SRC);
const { w, h: H, ch } = im;
const out = Buffer.from(im.data);            // copy; untouched texels stay byte-identical

let moved = 0, untouched = 0;
const before = { h: [], s: [], v: [] }, after = { h: [], s: [], v: [] };

for (let i = 0; i < w * H; i++) {
  const o = i * ch;
  const a = ch === 4 ? im.data[o + 3] : 255;
  const [hh, ss, vv] = rgb2hsv(im.data[o], im.data[o + 1], im.data[o + 2]);
  if (a < 250 || ss <= S_MIN || hh < H_LO || hh > H_HI) { untouched++; continue; }
  before.h.push(hh); before.s.push(ss); before.v.push(vv);
  const [r2, g2, b2] = hsv2rgb(hh + DEG, ss, vv);
  out[o] = r2; out[o + 1] = g2; out[o + 2] = b2;
  const [h3, s3, v3] = rgb2hsv(r2, g2, b2);
  after.h.push(h3); after.s.push(s3); after.v.push(v3);
  moved++;
}

const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const mean = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;

console.log(`source ${SRC}`);
console.log(`rotation ${DEG}°   costume-blue window hue ${H_LO}-${H_HI}°, sat > ${S_MIN}`);
console.log(`texels rotated ${moved}   left byte-identical ${untouched}`);
console.log('');
console.log('                 before      after');
console.log(`  hue    median  ${med(before.h).toFixed(1).padStart(6)}°  ${med(after.h).toFixed(1).padStart(9)}°`);
console.log(`  sat    median  ${med(before.s).toFixed(3).padStart(6)}   ${med(after.s).toFixed(3).padStart(9)}`);
console.log(`  value  median  ${med(before.v).toFixed(3).padStart(6)}   ${med(after.v).toFixed(3).padStart(9)}`);
console.log(`  sat    mean    ${mean(before.s).toFixed(3).padStart(6)}   ${mean(after.s).toFixed(3).padStart(9)}`);

/* The invariant that makes this a HUE fix and not a recolour. 8-bit quantisation moves saturation
   a little; anything beyond a rounding-scale drift means the operator is wrong, not the asset. */
const dS = Math.abs(mean(after.s) - mean(before.s));
const dV = Math.abs(mean(after.v) - mean(before.v));
console.log('');
console.log(`  |Δ mean sat| ${dS.toFixed(4)}   |Δ mean value| ${dV.toFixed(4)}   (quantisation only; > 0.01 is a bug)`);
if (dS > 0.01 || dV > 0.01) {
  console.error('FAIL — saturation or value moved beyond quantisation. §277 measured saturation as '
    + 'already CORRECT; a fix that changes it is fixing the wrong thing.');
  process.exit(1);
}

/* Encode. Straight non-interlaced PNG at the source colour type. */
function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  let r = 0xffffffff;
  for (const x of buf) r = t[(r ^ x) & 255] ^ (r >>> 8);
  return (r ^ 0xffffffff) >>> 0;
}
const chunk = (type, body) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const stride = w * ch;
const raw = Buffer.alloc(H * (1 + stride));
for (let y = 0; y < H; y++) {
  raw[y * (1 + stride)] = 0;
  out.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
writeFileSync(OUT, Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`\nwrote ${OUT}`);

#!/usr/bin/env node
/* gilddiff — score the PREREG-gild.md arms off the pixels.
 *
 * Reads shots/gild/hero-{base,base2,lo,restore}.png plus the offline material mask
 * shots/gild/hero-mask.bin (from tools/gildrim.mjs), and answers, in order:
 *
 *   pin      base vs base2  — MUST be 0 changed px, else the dt=0 clock pin failed and every
 *                             number below is noise (KNOWN_ISSUES §28)
 *   revert   base vs restore — MUST be 0 changed px, else the poke is not reversible
 *   control  base vs lo restricted to gold_leaf / bronze px — MUST be 0 (pre-registered P3)
 *   scope    changed px outside the hieroglyph_gilded mask (pre-registered P4)
 *   effect   chroma/luma movement over the gild population (P1) and its sign (P2)
 */
import { readPNG } from './png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const DIR = '/home/user/Demo/shots/gild';
const SHOT = process.argv[2] || 'hero';
const need = ['base', 'base2', 'lo', 'restore'].map((a) => `${DIR}/${SHOT}-${a}.png`);
for (const f of need) if (!existsSync(f)) { console.error(`missing ${f} — run tools/gildmetal.mjs first`); process.exit(1); }

const im = Object.fromEntries(['base', 'base2', 'lo', 'restore'].map((a) => [a, readPNG(`${DIR}/${SHOT}-${a}.png`)]));
const { w, h } = im.base;
const mask = existsSync(`${DIR}/${SHOT}-mask.bin`) ? new Uint8Array(readFileSync(`${DIR}/${SHOT}-mask.bin`)) : null;
if (mask && mask.length !== w * h) { console.error(`mask is ${mask.length} px, frame is ${w * h}`); process.exit(1); }

const at = (I, i) => { const o = i * I.ch; return [I.data[o], I.data[o + 1], I.data[o + 2]]; };
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function changed(A, B, pred) {
  let n = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, maxd = 0, sum = 0;
  for (let i = 0; i < w * h; i++) {
    if (pred && !pred(i)) continue;
    const a = at(A, i), b = at(B, i);
    const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    if (!d) continue;
    n++; sum += d; if (d > maxd) maxd = d;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { n, pct: n / (w * h) * 100, bbox: n ? [x0, y0, x1, y1] : null, maxd, meand: n ? sum / n : 0 };
}

function stat(I, pred) {
  let n = 0, R = 0, G = 0, B = 0, l = 0, sat = 0, rb = 0;
  for (let i = 0; i < w * h; i++) {
    if (!pred(i)) continue;
    const [r, g, b] = at(I, i);
    n++; R += r; G += g; B += b; l += L(r, g, b); rb += r - b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0;
  }
  return n ? { n, R: R / n, G: G / n, B: B / n, L: l / n, sat: sat / n, rb: rb / n } : null;
}

console.log(`frame ${w}x${h}  (${(w * h).toLocaleString()} px)\n`);

const pin = changed(im.base, im.base2);
const rev = changed(im.base, im.restore);
console.log(`pin      base vs base2   : ${pin.n} px changed  ${pin.n ? '** FAIL — dt pin did not hold, everything below is noise **' : 'OK (clock pinned)'}`);
console.log(`revert   base vs restore : ${rev.n} px changed  ${rev.n ? '** FAIL — poke not reversible **' : 'OK'}`);

const eff = changed(im.base, im.lo);
console.log(`\neffect   base vs lo      : ${eff.n} px (${eff.pct.toFixed(2)}% of frame)  mean |d| ${eff.meand.toFixed(1)}  max |d| ${eff.maxd}`);
console.log(`         bbox ${eff.bbox ? eff.bbox.join(', ') : '-'}`);

if (mask) {
  const isGild = (i) => mask[i] === 1;
  const isCtrl = (i) => mask[i] === 3 || mask[i] === 4;
  const ctrl = changed(im.base, im.lo, isCtrl);
  const nCtrl = [...mask].filter((v) => v === 3 || v === 4).length;
  console.log(`\ncontrol  gold_leaf+bronze px in frame: ${nCtrl}`);
  console.log(`         changed by the arm          : ${ctrl.n} px  ${ctrl.n ? '** FAIL — a control material moved **' : 'OK — bit-identical (P3 holds)'}`);

  let inGild = 0, outGild = 0;
  for (let i = 0; i < w * h; i++) {
    const a = at(im.base, i), b = at(im.lo, i);
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
    if (isGild(i)) inGild++; else outGild++;
  }
  console.log(`\nscope    changed px on the gild mask : ${inGild}`);
  console.log(`         changed px elsewhere        : ${outGild}  (${(outGild / Math.max(1, inGild + outGild) * 100).toFixed(1)}%)`);
  console.log(`         NOTE: "elsewhere" is expected to be non-zero — bloom and the ink pass`);
  console.log(`         spread a gild change onto neighbouring pixels. P4 asks whether it is`);
  console.log(`         LOCAL, not whether it is zero; the bbox above is the test.`);

  const a = stat(im.base, isGild), b = stat(im.lo, isGild);
  if (a && b) {
    console.log(`\n         gild population (${a.n.toLocaleString()} px, offline mask = gild SURFACE; the ORM`);
    console.log(`         blue channel restricts the real metal to ~11% of these texels)`);
    console.log(`           metric      base(0.85)     lo(0.45)        delta`);
    const row = (k, f = 2) => console.log(`           ${k.padEnd(11)} ${a[k].toFixed(f).padStart(10)} ${b[k].toFixed(f).padStart(13)} ${(b[k] - a[k] >= 0 ? '+' : '') + (b[k] - a[k]).toFixed(f)}`);
    row('L'); row('R'); row('G'); row('B'); row('rb'); row('sat', 4);
  }
  const ca = stat(im.base, isCtrl), cb = stat(im.lo, isCtrl);
  if (ca && cb) console.log(`\n         control population L ${ca.L.toFixed(2)} -> ${cb.L.toFixed(2)}  (delta ${(cb.L - ca.L).toFixed(3)})`);
} else {
  console.log('\n(no mask — run tools/gildrim.mjs to produce it, else scope/control are unscored)');
}

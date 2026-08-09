/**
 * hilite2-where.mjs — post-hoc, no capture. Answers two questions the aggregate luma table
 * cannot, over the frames hilite2.mjs already wrote to shots/hilite2/:
 *
 *  1. WHERE did the coupling land — is the change a glint (few small connected regions) or a
 *     wash (one large one)? Reported as connected components of the changed set, with the
 *     bounding box and peak of the largest.
 *
 *  2. WHAT MATERIAL CLASS did it land on. The delta is exactly
 *         specTint * specAmt * specStep * ( keyRad - 1 )
 *     so it carries the material's own specTint. On a dielectric that is uSpecColor #fffbe8 —
 *     near-neutral, linear R/B 1.24. On metal it is mix( uSpecColor, alb*2 + uSpecColor*0.25,
 *     uMetal ), i.e. dominated by the albedo: gold_leaf #e8b942 gives linear R/B 14.8. The
 *     tonemap is monotone per channel and does not swap channel order, so the SIGN and rough
 *     size of the delta's R-B survives it. Classifying changed pixels by delta R-B therefore
 *     separates a metal highlight from a stone one without a per-pixel material id.
 *
 *     Stated as a limit, because it is one: this is a two-class split (metal-tinted vs
 *     neutral-tinted), NOT a per-recipe segmentation. It cannot tell sandstone from limestone,
 *     and it cannot tell gold_leaf from bronze_dark.
 *
 *  3. HOW OFTEN THE LOBE LANDS, masked to the toon population.
 *
 *     **This mask is not optional and the first version of this file did not have one.**
 *     `debugTerm(6)` only writes on draws that run the cel program; sky, particles and every
 *     other non-toon draw render NORMALLY into the same buffer, and their ordinary colours then
 *     read as R/G/B channel values. Unmasked, `B >= 1` counts any pixel with a little blue in
 *     it — which is most of a sky. `debugTerm(4)` is the toon-population map (nothing else in a
 *     frame writes (64, 128, 191); toon.glsl.js says so at DEBUG_CALIB), so every incidence
 *     share below is over mode-4 pixels only. The unmasked version of this table over-stated
 *     `courtyard` by 2.8x and, on `interior`, reported 22.7% of the frame gated on a shot where
 *     the true answer is EXACTLY ZERO toon pixels.
 *
 *   node progress/records/hilite2-where.mjs [dir]
 */
import { readPNG } from '../../tools/png.mjs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../../shots/hilite2'));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* Discovered from the frames on disk, not from score.json: the addendum's `interior` was a
   second boot with its own score file, and both belong in one table. */
const ORDER = ['hero', 'temple', 'courtyard', 'sly-closeup', 'interior'];
const SHOTS = readdirSync(DIR).filter((f) => f.endsWith('.base.png')).map((f) => f.slice(0, -'.base.png'.length))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

/** 4-connected components over a boolean mask; returns them sorted by size. */
function components(mask, w, h, minSize = 1) {
  const seen = new Uint8Array(w * h), out = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let sp = 0, n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[sp++] = i; seen[i] = 1;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (n >= minSize) out.push({ n, box: [x0, y0, x1, y1] });
  }
  return out.sort((a, b) => b.n - a.n);
}

console.log(`frames: ${DIR}\n`);
console.log('WHERE the >L230 population is, and how it is shaped');
console.log('shot           arm     >230 px   components (>=8px)   largest  box (x0,y0,x1,y1)');
for (const shot of SHOTS) {
  for (const arm of ['base', 'key']) {
    const f = path.join(DIR, `${shot}.${arm}.png`);
    if (!existsSync(f)) continue;
    const im = readPNG(f), n = im.w * im.h, mask = new Uint8Array(n);
    let cnt = 0;
    for (let i = 0, p = 0; i < n; i++, p += im.ch) {
      if (lum(im.data[p], im.data[p + 1], im.data[p + 2]) > 230) { mask[i] = 1; cnt++; }
    }
    const cc = components(mask, im.w, im.h, 8);
    const big = cc[0];
    console.log(`${shot.padEnd(13)} ${arm.padEnd(6)} ${String(cnt).padStart(8)}   ${String(cc.length).padStart(16)}   ${String(big ? big.n : 0).padStart(7)}  ${big ? big.box.join(',') : '-'}`);
  }
}

console.log('\nWHAT the coupling landed on — changed pixels classified by the delta\'s own tint');
console.log('(metal specTint is albedo-derived and strongly warm; dielectric specTint is #fffbe8, near-neutral)');
console.log('shot           changed px    warm dR-dB>12    neutral    cool   |  max dL   at (x,y)  base->key L');
for (const shot of SHOTS) {
  const fb = path.join(DIR, `${shot}.base.png`), fk = path.join(DIR, `${shot}.key.png`);
  if (!existsSync(fb) || !existsSync(fk)) continue;
  const a = readPNG(fb), b = readPNG(fk), n = a.w * a.h;
  let ch = 0, warm = 0, neut = 0, cool = 0, mx = -1e9, mxi = -1, mb = 0, mk = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    const dr = b.data[p] - a.data[p], dg = b.data[p + 1] - a.data[p + 1], db = b.data[p + 2] - a.data[p + 2];
    if (!dr && !dg && !db) continue;
    ch++;
    const t = dr - db;
    if (t > 12) warm++; else if (t < -12) cool++; else neut++;
    const dl = lum(b.data[p], b.data[p + 1], b.data[p + 2]) - lum(a.data[p], a.data[p + 1], a.data[p + 2]);
    if (dl > mx) { mx = dl; mxi = i; mb = lum(a.data[p], a.data[p + 1], a.data[p + 2]); mk = lum(b.data[p], b.data[p + 1], b.data[p + 2]); }
  }
  const x = mxi % a.w, y = (mxi / a.w) | 0;
  console.log(`${shot.padEnd(13)} ${String(ch).padStart(10)} ${String(warm).padStart(14)} ${String(neut).padStart(10)} ${String(cool).padStart(7)}  |  ${mx.toFixed(1).padStart(6)}  (${x},${y})   ${mb.toFixed(1)} -> ${mk.toFixed(1)}`);
}

/* The specular's own footprint today, from the off arm: base minus off is exactly `spec`. */
console.log('\nWHAT SPEC IS WORTH TODAY — base minus off (the specular term\'s whole footprint)');
console.log('shot           spec-lit px    % frame    mean dL    p99 dL    max dL');
for (const shot of SHOTS) {
  const fb = path.join(DIR, `${shot}.base.png`), fo = path.join(DIR, `${shot}.off.png`);
  if (!existsSync(fb) || !existsSync(fo)) continue;
  const a = readPNG(fb), o = readPNG(fo), n = a.w * a.h;
  const ds = [];
  let mx = 0, sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    const dl = lum(a.data[p], a.data[p + 1], a.data[p + 2]) - lum(o.data[p], o.data[p + 1], o.data[p + 2]);
    if (a.data[p] !== o.data[p] || a.data[p + 1] !== o.data[p + 1] || a.data[p + 2] !== o.data[p + 2]) {
      ds.push(dl); sum += dl; if (dl > mx) mx = dl;
    }
  }
  ds.sort((x, y) => x - y);
  const p99 = ds.length ? ds[Math.min(ds.length - 1, Math.floor(0.99 * ds.length))] : 0;
  console.log(`${shot.padEnd(13)} ${String(ds.length).padStart(11)} ${(100 * ds.length / n).toFixed(3).padStart(9)}% ${(ds.length ? sum / ds.length : 0).toFixed(2).padStart(10)} ${p99.toFixed(2).padStart(9)} ${mx.toFixed(2).padStart(9)}`);
}

/* ---------------------------------------------------------------------------------------
 * THE LOBE LANDS — ON WHAT?
 *
 * debugTerm(6) gives, per pixel, whether the two gates are open (B) and how much of the
 * quantiser's ceiling the lobe reached (R). Intersect that with the key-minus-base rise and
 * the question "is this amplitude or incidence" answers itself: a pixel where the lobe is
 * SATURATED and the sun is FULL is a pixel where every geometric precondition for a highlight
 * is met, so whatever rise it shows is set by the material's own uSpec alone.
 * ------------------------------------------------------------------------------------- */
console.log('\nWHERE THE LOBE ACTUALLY LANDS');
console.log('MASKED to the mode-4 toon population — see the note above. Unmasked shares are meaningless.');
console.log('shot          toon%  | of TOON px: gates>0  gatesFULL  lobe>0  quant>=50%  quantSAT | rise on quantSAT px');
console.log('                                                                                     p50     p90     max');
for (const shot of SHOTS) {
  const fg = path.join(DIR, `${shot}.dbg6.png`), fc = path.join(DIR, `${shot}.dbg4.png`);
  const fb = path.join(DIR, `${shot}.base.png`), fk = path.join(DIR, `${shot}.key.png`);
  if (![fg, fc, fb, fk].every(existsSync)) continue;
  const g = readPNG(fg), c = readPNG(fc), a = readPNG(fb), b = readPNG(fk), n = g.w * g.h;
  let toon = 0, gA = 0, gF = 0, lo = 0, q5 = 0, qS = 0;
  const rises = [];
  for (let i = 0; i < n; i++) {
    const ci = i * c.ch;
    if (!(c.data[ci] === 64 && c.data[ci + 1] === 128 && c.data[ci + 2] === 191)) continue;
    toon++;
    const p = i * g.ch, R = g.data[p], G = g.data[p + 1], B = g.data[p + 2];
    if (B >= 1) gA++;
    if (B >= 250) {
      gF++;
      if (G >= 6) lo++;
      if (R >= 128) q5++;
      if (R >= 252) {
        qS++;
        const q = i * a.ch;
        rises.push(lum(b.data[q], b.data[q + 1], b.data[q + 2]) - lum(a.data[q], a.data[q + 1], a.data[q + 2]));
      }
    }
  }
  const pc = (v) => (toon ? `${((100 * v) / toon).toFixed(3)}%` : '-');
  rises.sort((x, y) => x - y);
  const Q = (t) => (rises.length ? rises[Math.min(rises.length - 1, (t * rises.length) | 0)] : 0);
  console.log(`${shot.padEnd(13)} ${(100 * toon / n).toFixed(1).padStart(5)}% |${pc(gA).padStart(11)}${pc(gF).padStart(11)}${pc(lo).padStart(9)}${pc(q5).padStart(12)}${pc(qS).padStart(11)} | ${Q(0.5).toFixed(1).padStart(6)} ${Q(0.9).toFixed(1).padStart(7)} ${(rises.length ? rises[rises.length - 1] : 0).toFixed(1).padStart(7)}`);
  console.log(`${''.padEnd(13)}   quantSAT = ${qS} px = ${(100 * qS / n).toFixed(4)}% of the whole frame`);
}

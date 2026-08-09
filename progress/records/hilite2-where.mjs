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
 *   node progress/records/hilite2-where.mjs [dir]
 */
import { readPNG } from '../../tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../../shots/hilite2'));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const score = existsSync(path.join(DIR, 'score.json'))
  ? JSON.parse(readFileSync(path.join(DIR, 'score.json'), 'utf8')) : null;
const SHOTS = score ? score.shots.map((s) => s.shot) : ['hero', 'temple', 'courtyard', 'sly-closeup'];

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
console.log('\nWHERE THE LOBE ACTUALLY LANDS  (dbg6: R >= 252 = quantiser saturated, B >= 250 = full sun)');
console.log('shot           saturated+lit px   % frame  |  rise under coupling, over those px');
console.log('                                            <2L      2-10L    10-20L   >20L    max');
for (const shot of SHOTS) {
  const fg = path.join(DIR, `${shot}.dbg6.png`), fb = path.join(DIR, `${shot}.base.png`), fk = path.join(DIR, `${shot}.key.png`);
  if (!existsSync(fg) || !existsSync(fb) || !existsSync(fk)) continue;
  const g = readPNG(fg), a = readPNG(fb), b = readPNG(fk), n = g.w * g.h;
  let cnt = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, mx = 0;
  for (let i = 0, p = 0; i < n; i++, p += g.ch) {
    if (g.data[p] < 252 || g.data[p + 2] < 250) continue;
    cnt++;
    const q = i * a.ch;
    const dl = lum(b.data[q], b.data[q + 1], b.data[q + 2]) - lum(a.data[q], a.data[q + 1], a.data[q + 2]);
    if (dl > mx) mx = dl;
    if (dl < 2) b0++; else if (dl < 10) b1++; else if (dl < 20) b2++; else b3++;
  }
  const pc = (v) => cnt ? `${((100 * v) / cnt).toFixed(1)}%` : '-';
  console.log(`${shot.padEnd(13)} ${String(cnt).padStart(16)} ${(100 * cnt / n).toFixed(4).padStart(8)}% | ${pc(b0).padStart(7)} ${pc(b1).padStart(8)} ${pc(b2).padStart(8)} ${pc(b3).padStart(7)} ${mx.toFixed(1).padStart(6)}`);
}

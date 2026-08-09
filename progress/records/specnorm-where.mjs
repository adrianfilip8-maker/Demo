/**
 * specnorm-where.mjs — post-hoc, no capture, over the frames specnorm.mjs already wrote.
 *
 * Answers three things the aggregate luma table cannot:
 *
 *  1. WHERE the >L230 population is and what SHAPE it has — a glint (many small connected
 *     regions) or a wash (one large one). A "highlight" that is one 40 000-px blob is a lift,
 *     not a highlight, and the p99/>230 columns cannot tell the difference.
 *
 *  2. WHETHER A BLOWN PIXEL IS THE TERM OR IS BLOOM. PREREG-specnorm §4.2 names bloom's
 *     spatial gather as the one mechanism absent from the model, and it is separable per pixel:
 *     `spec` is multiplied by `sh * step( 0.02, ndl )`, so a pixel with debugTerm(6) B < 1
 *     CANNOT have run the term. A >250 pixel that is not gated is bloom spill (or another term
 *     entirely); a >250 pixel that is lobe-saturated is the highlight doing its job.
 *
 *  3. WHAT SPEC IS WORTH TODAY — base minus off, the specular term's whole footprint.
 *
 * Every masked share is over the mode-4 toon population (§262 §8.1). Unmasked shares off
 * debugTerm are meaningless: mode 6/7 only write on draws that run the cel program, and every
 * other draw renders NORMALLY into the same buffer, so its ordinary colours read as channel
 * values. `debugTerm(4)`'s triple is the only population that is provably the cel program's.
 *
 *   node progress/records/specnorm-where.mjs [dir]
 */
import { readPNG } from '../../tools/png.mjs';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || path.join(import.meta.dirname, '../../shots/specnorm'));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ORDER = ['hero', 'temple', 'courtyard', 'sly-closeup', 'interior'];
const ARMS = ['base', 'n035', 'n050', 'n100', 'n050k'];
const SHOTS = readdirSync(DIR).filter((f) => f.endsWith('.base.png')).map((f) => f.slice(0, -'.base.png'.length))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

function components(mask, w, h, minSize = 1) {
  const seen = new Uint8Array(w * h), out = [], stack = new Int32Array(w * h);
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
console.log('1. WHERE the >L230 population is, and whether it is a glint or a wash');
console.log('shot          arm      >230 px   comps(>=8px)   largest   median comp   box of largest');
for (const shot of SHOTS) {
  for (const arm of ARMS) {
    const f = path.join(DIR, `${shot}.${arm}.png`);
    if (!existsSync(f)) continue;
    const im = readPNG(f), n = im.w * im.h, mask = new Uint8Array(n);
    let cnt = 0;
    for (let i = 0, p = 0; i < n; i++, p += im.ch) {
      if (lum(im.data[p], im.data[p + 1], im.data[p + 2]) > 230) { mask[i] = 1; cnt++; }
    }
    const cc = components(mask, im.w, im.h, 8), big = cc[0];
    const med = cc.length ? cc[(cc.length / 2) | 0].n : 0;
    console.log(`${shot.padEnd(13)} ${arm.padEnd(6)} ${String(cnt).padStart(9)} ${String(cc.length).padStart(12)} ${String(big ? big.n : 0).padStart(9)} ${String(med).padStart(13)}   ${big ? big.box.join(',') : '-'}`);
  }
  console.log('');
}

console.log('2. IS A BLOWN PIXEL THE TERM, OR IS IT BLOOM?  (PREREG-specnorm §4.2)');
console.log('   gated = debugTerm(6) B >= 250 (full sun, N.L > 0.02); satLobe = also R >= 252.');
console.log('   A >250 pixel that is NOT gated cannot have run the specular term.');
console.log('shot          arm     >250 px   of which gated   satLobe   NOT gated (= bloom/other)');
for (const shot of SHOTS) {
  const fg = path.join(DIR, `${shot}.dbg6.png`), fc = path.join(DIR, `${shot}.dbg4.png`);
  if (!existsSync(fg) || !existsSync(fc)) continue;
  const g = readPNG(fg), c = readPNG(fc);
  for (const arm of ARMS) {
    const f = path.join(DIR, `${shot}.${arm}.png`);
    if (!existsSync(f)) continue;
    const im = readPNG(f), n = im.w * im.h;
    let hot = 0, gated = 0, satl = 0, ung = 0;
    for (let i = 0, p = 0; i < n; i++, p += im.ch) {
      if (lum(im.data[p], im.data[p + 1], im.data[p + 2]) <= 250) continue;
      hot++;
      const ci = i * c.ch;
      const isToon = c.data[ci] === 64 && c.data[ci + 1] === 128 && c.data[ci + 2] === 191;
      const q = i * g.ch;
      if (isToon && g.data[q + 2] >= 250) { gated++; if (g.data[q] >= 252) satl++; } else ung++;
    }
    if (hot) console.log(`${shot.padEnd(13)} ${arm.padEnd(6)} ${String(hot).padStart(8)} ${String(gated).padStart(16)} ${String(satl).padStart(9)} ${String(ung).padStart(11)}`);
  }
}
console.log('   (shots/arms with zero >250 pixels are omitted — that is the pass condition)');

console.log('\n3. WHAT SPEC IS WORTH TODAY — base minus off, the specular term\'s whole footprint');
console.log('shot           spec-lit px    % frame    mean dL    p99 dL    max dL');
for (const shot of SHOTS) {
  const fb = path.join(DIR, `${shot}.base.png`), fo = path.join(DIR, `${shot}.off.png`);
  if (!existsSync(fb) || !existsSync(fo)) continue;
  const a = readPNG(fb), o = readPNG(fo), n = a.w * a.h;
  const ds = []; let mx = 0, sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    if (a.data[p] === o.data[p] && a.data[p + 1] === o.data[p + 1] && a.data[p + 2] === o.data[p + 2]) continue;
    const dl = lum(a.data[p], a.data[p + 1], a.data[p + 2]) - lum(o.data[p], o.data[p + 1], o.data[p + 2]);
    ds.push(dl); sum += dl; if (dl > mx) mx = dl;
  }
  ds.sort((x, y) => x - y);
  const p99 = ds.length ? ds[Math.min(ds.length - 1, Math.floor(0.99 * ds.length))] : 0;
  console.log(`${shot.padEnd(13)} ${String(ds.length).padStart(11)} ${(100 * ds.length / n).toFixed(3).padStart(9)}% ${(ds.length ? sum / ds.length : 0).toFixed(2).padStart(10)} ${p99.toFixed(2).padStart(9)} ${mx.toFixed(2).padStart(9)}`);
}

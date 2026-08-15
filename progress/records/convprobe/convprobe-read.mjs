/** Reads convprobe1/ and asks whether successive renders converge. */
import { readPNG } from '../../../tools/png.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const DIR = path.resolve(import.meta.dirname, '../../../progress/records/convprobe1');
const mf = readdirSync(DIR).find((f) => f.startsWith('manifest.'));
const m = JSON.parse(readFileSync(path.join(DIR, mf), 'utf8'));
const im = m.rows.map((r) => readPNG(path.join(DIR, r.file)));
const diff = (a, b) => {
  let n = 0, mx = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * a.ch;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    if (d) { n++; if (d > mx) mx = d; }
  }
  return { n, mx };
};
console.log(`shot ${m.shot}, ${m.n} renders, lever pinned 0 throughout\n`);
console.log('  i   vs r0 (px / maxD)      vs previous (px / maxD)');
for (let i = 1; i < im.length; i++) {
  const a = diff(im[0], im[i]), b = diff(im[i - 1], im[i]);
  console.log(`  r${i}   ${String(a.n).padStart(7)} / ${String(a.mx).padStart(2)}          ${String(b.n).padStart(7)} / ${String(b.mx).padStart(2)}`);
}
const last = diff(im[im.length - 2], im[im.length - 1]);
console.log(`\nverdict: consecutive drift at the end is ${last.n} px / maxD ${last.mx}.`);
console.log(last.n === 0
  ? '=> CONVERGES to bit-exact. A warm-up of N renders makes a 0-px bracket achievable.'
  : '=> does NOT reach bit-exact; a warm-up alone will not buy a 0-px whole-frame bracket.');

/**
 * specnorm-inert.mjs — is the SHIPPED build still bit-identical after the scaffolding landed?
 *
 * PREREG-specnorm's I1 null arm proves that `uSpecNormPow 0` reproduces `uSpecNormPow 0` inside
 * ONE boot. That is repeatability, not inertness: it cannot see a change that the edit baked
 * into every arm equally (§255 — a whole block rendered black while its null passed, because
 * black equals black).
 *
 * The stronger check is available for free. `shots/hilite2/<shot>.base.png` was captured from
 * the PRE-EDIT source, at the same 1280x720, on the same shots, with the same `dt: 0`, at the
 * shipped TUNE. If `shots/specnorm/<shot>.base.png` is byte-identical to it, the scaffolding is
 * inert against a different COMMIT and a different BOOT, not merely against itself.
 *
 * A non-zero result is not automatically a failure — it could be cross-boot nondeterminism,
 * which §233 only ever claimed to be absent WITHIN a boot. So the report separates "0 px" from
 * "small and uniform" from "structured", and says which it is rather than assuming.
 *
 *   node progress/records/specnorm-inert.mjs
 */
import { readPNG } from '../../tools/png.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const A = path.resolve(import.meta.dirname, '../../shots/hilite2');   // pre-edit source
const B = path.resolve(import.meta.dirname, '../../shots/specnorm');  // post-edit source
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const SHOTS = ['hero', 'temple', 'courtyard', 'sly-closeup', 'interior'];

console.log('CROSS-COMMIT, CROSS-BOOT INERTNESS of the uSpecNormPow scaffolding');
console.log(`  pre-edit  ${A}/<shot>.base.png   (§262, commit 4791376)`);
console.log(`  post-edit ${B}/<shot>.base.png   (this run, TUNE.specNormPow 0)\n`);
console.log('shot          differing px    % frame   max |dL|   mean |dL| on changed   verdict');
let worst = 0;
for (const shot of SHOTS) {
  const fa = path.join(A, `${shot}.base.png`), fb = path.join(B, `${shot}.base.png`);
  if (!existsSync(fa) || !existsSync(fb)) { console.log(`${shot.padEnd(13)} (missing a frame)`); continue; }
  const a = readPNG(fa), b = readPNG(fb);
  if (a.w !== b.w || a.h !== b.h) { console.log(`${shot.padEnd(13)} SIZE MISMATCH ${a.w}x${a.h} vs ${b.w}x${b.h}`); continue; }
  const n = a.w * a.h;
  let px = 0, mx = 0, sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    if (a.data[p] === b.data[p] && a.data[p + 1] === b.data[p + 1] && a.data[p + 2] === b.data[p + 2]) continue;
    px++;
    const d = Math.abs(lum(b.data[p], b.data[p + 1], b.data[p + 2]) - lum(a.data[p], a.data[p + 1], a.data[p + 2]));
    sum += d; if (d > mx) mx = d;
  }
  worst = Math.max(worst, px);
  const verdict = px === 0 ? 'BIT-IDENTICAL' : (mx <= 1.0 ? 'sub-LSB — cross-boot noise' : 'STRUCTURED — investigate');
  console.log(`${shot.padEnd(13)} ${String(px).padStart(11)} ${(100 * px / n).toFixed(4).padStart(9)}% ${mx.toFixed(2).padStart(10)} ${(px ? sum / px : 0).toFixed(3).padStart(22)}   ${verdict}`);
}
console.log(`\n==> ${worst === 0
  ? 'the shipped build is BIT-IDENTICAL across the edit, proven against a different commit and a different boot'
  : 'NOT bit-identical — read the per-shot verdict above before quoting inertness'}`);

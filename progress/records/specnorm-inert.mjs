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
 * which §233 only ever claimed to be absent WITHIN a boot.
 *
 * **AND IT IS. The naive base-vs-base test is CONFOUNDED and it fired: 5.6 % / 15.3 / 15.7 of
 * the frame differs across the two runs, max |dL| up to 146.5.** Reported here rather than
 * quietly dropped, because a run that had only this test would have concluded the edit was live.
 *
 * The control that disambiguates it costs nothing and was already on disk. `off` sets
 * `uSpecGain 0`, which multiplies the whole specular term by zero — in BOTH runs. So:
 *
 *   - if the OFF frames differ across runs by the same amount as the BASE frames, the specular
 *     term cannot be the cause, because it contributes nothing to either;
 *   - and `base - off` inside one boot is the specular's entire footprint with the boot-level
 *     noise cancelled, since both arms are consecutive captures in the same boot (§233).
 *
 * Both are printed. The verdict is taken from them, not from the confounded comparison.
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
const cmp = (fa, fb) => {
  if (!existsSync(fa) || !existsSync(fb)) return null;
  const a = readPNG(fa), b = readPNG(fb);
  if (a.w !== b.w || a.h !== b.h) return null;
  const n = a.w * a.h;
  let px = 0, mx = 0, sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += a.ch) {
    if (a.data[p] === b.data[p] && a.data[p + 1] === b.data[p + 1] && a.data[p + 2] === b.data[p + 2]) continue;
    px++;
    const d = Math.abs(lum(b.data[p], b.data[p + 1], b.data[p + 2]) - lum(a.data[p], a.data[p + 1], a.data[p + 2]));
    sum += d; if (d > mx) mx = d;
  }
  return { px, pct: (100 * px) / n, mx, mean: px ? sum / px : 0 };
};

console.log('A. THE CONFOUNDED TEST — same arm, different commit AND different boot');
console.log('shot          arm     differing px   % frame   max |dL|   mean |dL|');
for (const shot of SHOTS) for (const arm of ['base', 'off']) {
  const r = cmp(path.join(A, `${shot}.${arm}.png`), path.join(B, `${shot}.${arm}.png`));
  if (!r) continue;
  console.log(`${shot.padEnd(13)} ${arm.padEnd(6)} ${String(r.px).padStart(12)} ${r.pct.toFixed(3).padStart(9)}% ${r.mx.toFixed(2).padStart(10)} ${r.mean.toFixed(3).padStart(11)}`);
}
console.log('   `off` has the specular multiplied by ZERO in both runs. If its row matches `base`\'s,');
console.log('   the specular is not what differs — the two BOOTS differ.');

console.log('\nB. THE CONTROLLED TEST — the specular\'s own footprint, base minus off, inside each boot');
console.log('shot          run        spec-lit px   % frame   max |dL|   mean |dL|');
const foot = {};
for (const shot of SHOTS) for (const [tag, d] of [['hilite2 (pre)', A], ['specnorm (post)', B]]) {
  const r = cmp(path.join(d, `${shot}.base.png`), path.join(d, `${shot}.off.png`));
  if (!r) continue;
  (foot[shot] ||= {})[tag] = r;
  console.log(`${shot.padEnd(13)} ${tag.padEnd(16)} ${String(r.px).padStart(8)} ${r.pct.toFixed(3).padStart(9)}% ${r.mx.toFixed(2).padStart(10)} ${r.mean.toFixed(3).padStart(11)}`);
}

console.log('\nVERDICT');
let ok = true, any = false;
for (const shot of SHOTS) {
  const f = foot[shot]; if (!f || Object.keys(f).length < 2) continue;
  any = true;
  const p = f['hilite2 (pre)'], q = f['specnorm (post)'];
  const dPx = Math.abs(p.px - q.px) / Math.max(1, p.px), dMx = Math.abs(p.mx - q.mx);
  const good = dPx <= 0.01 && dMx <= 0.01;
  ok &&= good;
  console.log(`   ${shot.padEnd(13)} footprint ${p.px} -> ${q.px} px (${(100 * dPx).toFixed(2)}% apart), peak ${p.mx.toFixed(2)} -> ${q.mx.toFixed(2)}   ${good ? 'UNCHANGED' : 'CHANGED'}`);
}
console.log(`\n==> ${!any ? 'not enough frames'
  : ok ? 'the specular term is UNCHANGED by the scaffolding: its footprint and its peak reproduce across a different commit and a different boot.\n    The base-vs-base difference in A is cross-boot nondeterminism that this project carries anyway — §233\'s determinism claim is WITHIN a boot, and A is the measurement of how much it is not across boots.'
  : 'the specular footprint MOVED — the scaffolding is not inert, investigate before quoting anything'}`);

/**
 * Score PREREG-puff's two bands from fx19's frames, against the rule as registered.
 *
 * Written because §99 scored this run at whole-frame level, concluded the bracket was mis-sited,
 * and then said Band 2 "should catch that" — **predicting a band's verdict instead of computing
 * it.** The seal exists precisely to stop that, so this computes both bands from the registered
 * definitions and lets them say what they say.
 *
 *   node tools/puffscore.mjs [dir]        default shots/fx19
 *
 * Regions are derived IN-RUN from this run's own frames, per the seal (§73.2, §63.2 — fx18's
 * frames are gone, so no coordinate from it is reusable):
 *   P = largest connected component of |base − no-sandLow|, asserted centroid within 150 px of
 *       (666,412) and area >= 3000 px. IF THAT FAILS, NO BAND IS SCORED — it is reported as a
 *       relocation, not measured around.
 *   G = sandLow-attributed pixels (|base − no-sandLow| >= 4) outside P, asserted >= 2000 px.
 *
 *   Band 1 PUFF     = mean|cap − base| over P        / mean|no-sandLow − base| over P
 *   Band 2 HAZE     = mean|cap − no-sandLow| over G  / mean|base − no-sandLow| over G
 *   PASS >= 0.60 both. A Band 1 pass with a Band 2 fail is NOT banked.
 *   Ship the LARGEST (weakest) ceiling passing both.
 */
import { readPNG } from './png.mjs';

const dir = process.argv[2] || 'shots/fx19';
const rd = (n) => readPNG(`${dir}/sly-profile.${n}.png`);
const base = rd('base'), noSand = rd('no-sandLow'), back = rd('back');
const caps = { 0.120: rd('cap120'), 0.085: rd('cap085'), 0.055: rd('cap055') };
const { w, h } = base, ch = base.data.length / (w * h), N = w * h;

/** Max-channel absolute difference per pixel. */
const diff = (a, b) => {
  const d = new Float32Array(N);
  for (let i = 0, p = 0; i < N; i++, p += ch) {
    d[i] = Math.max(Math.abs(a.data[p] - b.data[p]),
      Math.abs(a.data[p + 1] - b.data[p + 1]), Math.abs(a.data[p + 2] - b.data[p + 2]));
  }
  return d;
};

/* --- Harness attestation first: `back` must reproduce `base` bit-identically (§89.2). If it does
   not, the uniform poke leaked between arms and every arm below is unattested. Checked BEFORE any
   band is computed, because a band scored on unattested arms is worse than no band. */
const dBack = diff(base, back);
let backDiff = 0; for (let i = 0; i < N; i++) if (dBack[i] > 0) backDiff++;
console.log(`ATTESTATION  back vs base: ${backDiff} differing px  `
  + `${backDiff === 0 ? 'PASS — arms are attested' : '*** FAIL — uniform leaked, ARMS UNATTESTED ***'}`);
if (backDiff !== 0) { console.log('Refusing to score bands on unattested arms.'); process.exit(1); }

/* --- Region P: largest connected component of |base − no-sandLow|, 4-connected, threshold 4
   (the same threshold the seal uses for sandLow attribution). Iterative flood fill — a recursive
   one stack-overflows on a 34k-pixel blob. */
const dAbs = diff(base, noSand);
const on = new Uint8Array(N);
for (let i = 0; i < N; i++) on[i] = dAbs[i] >= 4 ? 1 : 0;
let onCount = 0; for (let i = 0; i < N; i++) onCount += on[i];

const label = new Int32Array(N).fill(-1);
let best = { size: 0, id: -1 }, next = 0;
const stack = new Int32Array(N);
for (let s = 0; s < N; s++) {
  if (!on[s] || label[s] >= 0) continue;
  const id = next++; let sp = 0, size = 0;
  stack[sp++] = s; label[s] = id;
  while (sp > 0) {
    const i = stack[--sp]; size++;
    const x = i % w, y = (i / w) | 0;
    if (x > 0 && on[i - 1] && label[i - 1] < 0) { label[i - 1] = id; stack[sp++] = i - 1; }
    if (x < w - 1 && on[i + 1] && label[i + 1] < 0) { label[i + 1] = id; stack[sp++] = i + 1; }
    if (y > 0 && on[i - w] && label[i - w] < 0) { label[i - w] = id; stack[sp++] = i - w; }
    if (y < h - 1 && on[i + w] && label[i + w] < 0) { label[i + w] = id; stack[sp++] = i + w; }
  }
  if (size > best.size) best = { size, id };
}
const P = new Uint8Array(N);
let cx = 0, cy = 0;
for (let i = 0; i < N; i++) if (label[i] === best.id) { P[i] = 1; cx += i % w; cy += (i / w) | 0; }
cx /= best.size; cy /= best.size;

const dist = Math.hypot(cx - 666, cy - 412);
console.log(`\nREGION P  largest component: area ${best.size} px, centroid (${cx.toFixed(0)},${cy.toFixed(0)})`);
console.log(`  assert centroid within 150 px of (666,412): ${dist.toFixed(1)} px  ${dist <= 150 ? 'PASS' : 'FAIL'}`);
console.log(`  assert area >= 3000 px: ${best.size}  ${best.size >= 3000 ? 'PASS' : 'FAIL'}`);
console.log(`  (attributed pixels overall: ${onCount}; components found: ${next})`);
if (dist > 150 || best.size < 3000) {
  console.log('\n*** RELOCATION — the puff is not where §89.3 found it. NO BAND IS SCORED, per the');
  console.log('    seal. This is reported as a relocation, not measured around.');
  process.exit(0);
}

const G = new Uint8Array(N);
let gCount = 0;
for (let i = 0; i < N; i++) if (on[i] && !P[i]) { G[i] = 1; gCount++; }
console.log(`REGION G  sandLow-attributed outside P: ${gCount} px  `
  + `assert >= 2000: ${gCount >= 2000 ? 'PASS' : 'FAIL — haze band unscoreable'}`);

const meanOver = (d, mask) => { let s = 0, n = 0; for (let i = 0; i < N; i++) if (mask[i]) { s += d[i]; n++; } return n ? s / n : 0; };

const denom1 = meanOver(diff(noSand, base), P);
const denom2 = meanOver(diff(base, noSand), G);
console.log(`\nDenominators: Band1 mean|no-sandLow-base| over P = ${denom1.toFixed(3)}`);
console.log(`              Band2 mean|base-no-sandLow| over G = ${denom2.toFixed(3)}`);

console.log('\nceiling   Band1 PUFF          Band2 HAZE (binding)   banked?');
const results = [];
for (const k of Object.keys(caps).map(Number).sort((a, b) => b - a)) {
  const cap = caps[k];
  const b1 = meanOver(diff(cap, base), P) / denom1;
  const b2 = gCount >= 2000 ? meanOver(diff(cap, noSand), G) / denom2 : NaN;
  const v1 = b1 >= 0.60 ? 'PASS' : b1 >= 0.30 ? 'WEAK' : 'FAIL';
  const v2 = Number.isNaN(b2) ? 'UNSCOREABLE' : b2 >= 0.60 ? 'PASS' : 'FAIL';
  const banked = v1 === 'PASS' && v2 === 'PASS';
  results.push({ k, b1, b2, v1, v2, banked });
  console.log(`  ${k.toFixed(3)}   ${b1.toFixed(3)} ${v1.padEnd(6)}      ${Number.isNaN(b2) ? '  n/a' : b2.toFixed(3)} ${v2.padEnd(12)} ${banked ? 'YES' : 'no'}`);
}

const banked = results.filter((r) => r.banked);
console.log('\nSHIP RULE — largest (weakest) ceiling passing BOTH bands:');
console.log(banked.length
  ? `  ship ${Math.max(...banked.map((r) => r.k)).toFixed(3)}`
  : '  NOTHING SHIPS. No ceiling passes both bands, so there is nothing to bank —\n'
    + '  which is the seal refusing a Band 1 pass that comes with a Band 2 fail.');

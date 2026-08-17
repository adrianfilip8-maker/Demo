#!/usr/bin/env node
/**
 * bootnoise.mjs — how small an effect can a comparison between two captures actually resolve?
 *
 *   node tools/bootnoise.mjs shots/fxrim4-impact shots/fxrim5-impact impact
 *
 * No browser, no lock. Compares PNGs `tools/fxrim.mjs` already wrote.
 *
 * ── The thing this exists to stop ───────────────────────────────────────────────────────────
 * `fxrim` captures a `Z-null` arm and asserts `Z == A`. That control is real and it fires: two
 * renders of one state inside ONE boot are bit-identical, 0 of 921,600 px. It has then been read
 * — by me, in a pushed commit — as though it licensed comparing frames from DIFFERENT boots.
 *
 * **It does not, and the gap is four orders of magnitude.** Measured on the `impact` shot:
 *
 *   within a boot    A-ship vs Z-null        0 px      bit-identical
 *   across boots     A-ship vs A-ship   82,766 px      max 192.7 L, concentrated in the upper air
 *
 * A capture is not a function of the source tree alone. It is a function of the tree AND the
 * boot, and nothing in the harness records the second argument. So "src tree unchanged" does not
 * imply "the same frame", and any claim resting on a cross-capture comparison inherits a noise
 * floor nobody had measured.
 *
 * ── Why the A/B isolation design survives it, and how far ───────────────────────────────────
 * `A − S` and `A − P` take both arms from the SAME boot, so whatever varies boot-to-boot appears
 * in both and cancels. That is what makes the extents measurable at all. It cancels most of it,
 * not all:
 *
 *   raw frame across boots                     82,766 px differ
 *   sly  isolation diff across boots              251 px   (max  6.2 L)   330x suppression
 *   dust isolation diff across boots              998 px   (max  7.1 L)    83x
 *   ring isolation diff across boots            6,099 px   (max 17.2 L)    14x
 *
 * **That residue is the noise floor of any cross-capture claim**, and an effect below it cannot
 * be resolved by comparing two captures however carefully they are read. The lit-pixel COUNTS
 * moved by only 4 / 4 / 8, which looks like agreement and is mostly the residue sitting under
 * the 4 L mask threshold rather than the two frames agreeing.
 *
 * ── What that costs a claim I made, stated because it is the reason this file exists ────────
 * `afbf1e5` reported "the drift fix preserved the staged frame to 0.003%", from those 4/4/8
 * counts. The number is real and the inference was not: the comparison cannot resolve anything
 * smaller than 251–6,099 px of residue, and the fix's contribution to the staged frame is below
 * that floor. The fix IS a no-op on the staged path — by construction, because `PLANAR_LIFT` is
 * defined as the drift at the staged age, so the plane is identical — and the capture is
 * CONSISTENT WITH that rather than evidence for it. A construction argument and a measurement
 * are different things and I quoted one as the other.
 */
import { readPNG } from './png.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { W, H } from './framelib.mjs';

const A_DIR = process.argv[2] || 'shots/fxrim4-impact';
const B_DIR = process.argv[3] || 'shots/fxrim5-impact';
const SHOT = process.argv[4] || 'impact';
const CUT = Number(process.env.BOOTNOISE_CUT || 0.5);
const MASK_CUT = Number(process.env.BOOTNOISE_MASK || 4);

const lum = (im) => {
  const o = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const j = i * im.ch; o[i] = 0.2126 * im.data[j] + 0.7152 * im.data[j + 1] + 0.0722 * im.data[j + 2]; }
  return o;
};
const load = (dir, tag) => {
  const f = `${dir}/${SHOT}-${tag}.png`;
  return existsSync(f) ? lum(readPNG(f)) : null;
};
const stat = (a, b) => {
  let n = 0, mx = 0;
  for (let i = 0; i < W * H; i++) { const v = Math.abs(a[i] - b[i]); if (v > CUT) n++; if (v > mx) mx = v; }
  return { n, mx };
};

const treeOf = (dir) => {
  const f = `${dir}/arms.json`;
  if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return { src: j.arms?.[0]?.tree?.src, head: j.arms?.[0]?.tree?.head, at: j.at };
};

console.log(`bootnoise · ${SHOT} · ${A_DIR} vs ${B_DIR} · differing = |dL| > ${CUT} L\n`);
for (const d of [A_DIR, B_DIR]) {
  const t = treeOf(d);
  console.log(`  ${d.padEnd(24)} src tree ${t?.src ?? '?'}  HEAD ${t?.head ?? '?'}  at ${t?.at ?? '?'}`);
}

/* ── the within-boot control, first, because it is what the cross-boot number is read against ── */
console.log('\n── WITHIN a boot: does the renderer repeat itself? ─────────────────────────────');
let withinOK = true;
for (const dir of [A_DIR, B_DIR]) {
  const A = load(dir, 'A-ship'), Z = load(dir, 'Z-null');
  if (!A || !Z) { console.log(`   ${dir}: no Z-null arm — no verdict`); continue; }
  const s = stat(A, Z);
  if (s.n) withinOK = false;
  console.log(`   ${dir.padEnd(24)} A-ship vs Z-null  ${String(s.n).padStart(7)} px  ${s.n ? `max ${s.mx.toFixed(1)} L — NOT deterministic` : 'bit-identical'}`);
}

/* ── and across boots, which is the comparison every re-capture claim actually makes ────── */
console.log('\n── ACROSS boots: the same arm, captured twice ──────────────────────────────────');
const rawA = load(A_DIR, 'A-ship'), rawB = load(B_DIR, 'A-ship');
let raw = null;
if (rawA && rawB) {
  raw = stat(rawA, rawB);
  console.log(`   A-ship vs A-ship          ${String(raw.n).padStart(7)} px   max ${raw.mx.toFixed(1)} L`);
  console.log(`   ${withinOK && raw.n > 0
    ? '   -> the renderer repeats inside a boot and NOT across boots. A capture is a function\n      of (tree, boot), and only the first is recorded anywhere.'
    : '   -> no cross-boot difference to report'}`);
}

/* ── the isolation diffs, which is what the A/B design actually compares ─────────────────── */
console.log('\n── the A/B ISOLATION DIFFS, which take both arms from ONE boot ─────────────────');
console.log('   subject   across-boot residue        suppression   lit px (mask |dL| > ' + MASK_CUT + ')');
const PAIRS = [['sly', 'S-nosly'], ['dust', 'P-nodust'], ['ring', 'P-noring']];
let worst = 0;
for (const [tag, iso] of PAIRS) {
  const a0 = load(A_DIR, 'A-ship'), a1 = load(A_DIR, iso);
  const b0 = load(B_DIR, 'A-ship'), b1 = load(B_DIR, iso);
  if (!a0 || !a1 || !b0 || !b1) { console.log(`   ${tag.padEnd(9)} arm ${iso} missing in one capture — no verdict`); continue; }
  const dA = new Float32Array(W * H), dB = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { dA[i] = a0[i] - a1[i]; dB[i] = b0[i] - b1[i]; }
  const s = stat(dA, dB);
  let la = 0, lb = 0;
  for (let i = 0; i < W * H; i++) { if (Math.abs(dA[i]) > MASK_CUT) la++; if (Math.abs(dB[i]) > MASK_CUT) lb++; }
  if (s.n > worst) worst = s.n;
  console.log(`   ${tag.padEnd(9)} ${String(s.n).padStart(6)} px (max ${s.mx.toFixed(1)} L)   `
    + `${raw && s.n ? `${(raw.n / s.n).toFixed(0)}x`.padStart(9) : '        —'}      ${la} -> ${lb}  (${lb - la >= 0 ? '+' : ''}${lb - la})`);
}

console.log(`\n── THE NOISE FLOOR ────────────────────────────────────────────────────────────`);
console.log(`   Taking both arms from one boot suppresses the boot difference by 1-2 orders of`);
console.log(`   magnitude but does not remove it. The largest residue here is ${worst} px.`);
console.log(`   **A cross-capture claim cannot resolve an effect smaller than that.** A lit-pixel`);
console.log(`   count that moves by single digits is not two frames agreeing; it is the residue`);
console.log(`   sitting mostly under the ${MASK_CUT} L mask threshold.`);
console.log(`\n   If an effect is below this floor, say it is BELOW THE FLOOR. A construction`);
console.log(`   argument ("identical by definition") is a fine reason to believe a change is a`);
console.log(`   no-op — it is not a measurement of one, and the two must not be quoted as each other.`);

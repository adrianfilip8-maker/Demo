#!/usr/bin/env node
/* a4score — scoring of the a4 run against PREREG-fxcluster-a4 §2.
 *
 * Thresholds are TRANSCRIBED from the seal, not chosen here. Statistics use the same
 * definitions a4-choose.mjs used on the committed a3 frames, so the seal's "a3 clean-pair
 * value" column and this run's values are the same instrument.
 *
 * Carried UNCHANGED from a3 (the coordinator's instruction): the pool ROI ΔmedL, the mirror
 * ratio, the §13 clause, the noise gates.
 * Changed for a4, both by measurement (seal §0.2, §0.3):
 *   - no-harm  Δmean|∇L| over the guard band  ->  silhouette px count ratio, L <= 60
 *   - V-1  whole-frame px at |Δ|>=1  ->  px at |ΔL| >= 10 inside the POOL ROI
 *
 * usage: node a4score.mjs   (writes a4-scores.json + a4-pairstruct.json)
 *        node a4score.mjs --frames a3-guard   (control mode: score a3's frames instead)
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ARMS = ['base', 'base2', 'cand', 'restore'];
const argIdx = process.argv.indexOf('--frames');
const PREFIX = argIdx > 0 ? process.argv[argIdx + 1] : 'a4-guard';
const RB = PREFIX === 'a4-guard' ? 'a4-readback.json' : `${PREFIX.split('-')[0]}-readback.json`;
const F = (a) => path.join(DIR, `${PREFIX}.${a}.png`);

/* ---- seal §2 masks ---- */
const POOL_ROI = [0, 400, 560, 700];
const SIL_BOX = [860, 200, 1000, 300];
const T_SIL = 60;
const A2_ROI = [340, 280, 700, 350];
const A3_GUARD = [852, 220, 990, 300];

/* ---- seal §2 bands, transcribed ---- */
const BAND = { QA41: [-100.0, -15.0], QA41m: [0.60, 1.40], N: 4.0, clause13: 3, QA42: 0.75, L2: 400, V1: 2000, V2eps: 1e-6 };
/* ---- the seal's a3 clean-pair column, quoted from a4-choose.json ---- */
const A3SHOWN = { QA41: -58.273, QA41m: 1.063, N1: 0.005, N2: 0.005, QA42: '0.843 (FAILS 0.581 on a3 dirty)', L2: '102 (FAILS 4322 on a3 dirty)', V1: '377 clean / 213 dirty; lever 137910', V2: 'a3 FAILED 0.03', V3: 'a3 FAILED base != base2' };

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const Lof = (i, x, y) => { const k = (y * i.w + x) * i.ch; return lum(i.data[k], i.data[k + 1], i.data[k + 2]); };
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
function rectL(i, [x0, y0, x1, y1]) { const L = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(Lof(i, x, y)); return L; }
const medL = (i, r) => median(rectL(i, r));
const meanL = (i, r) => { const L = rectL(i, r); let s = 0; for (const v of L) s += v; return s / L.length; };
function gradL(i, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y < y1 - 1; y++) for (let x = x0; x < x1 - 1; x++) {
    s += Math.abs(Lof(i, x + 1, y) - Lof(i, x, y)) + Math.abs(Lof(i, x, y + 1) - Lof(i, x, y)); n++;
  }
  return s / n;
}
function silCount(i, [x0, y0, x1, y1]) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Lof(i, x, y) <= T_SIL) n++;
  return n;
}
/* V-1: STRUCTURAL count — px whose luma differs by >= 10, inside the region the instrument reads */
function pxGE10(A, B, [x0, y0, x1, y1]) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Math.abs(Lof(B, x, y) - Lof(A, x, y)) >= 10) n++;
  return n;
}

const missing = ARMS.filter((a) => !existsSync(F(a)));
if (missing.length) console.log(`WARNING: frames missing: ${missing.join(', ')} — partial scoring`);
const im = {};
for (const a of ARMS) if (existsSync(F(a))) im[a] = readPNG(F(a));
if (!im.base || !im.cand) { console.log('FATAL: need at least base + cand to score. Stopping.'); process.exit(1); }

const r3 = (v) => (v == null || Number.isNaN(v) ? null : +v.toFixed(3));
const perArm = {};
for (const a of Object.keys(im)) {
  perArm[a] = {
    poolMedL: r3(medL(im[a], POOL_ROI)), poolMeanL: r3(meanL(im[a], POOL_ROI)),
    silCount: silCount(im[a], SIL_BOX),
    a2RoiMedL: r3(medL(im[a], A2_ROI)), a3GuardGrad: r3(gradL(im[a], A3_GUARD)),
  };
}
const has = (a) => !!im[a];
const d = (stat, a, b) => (has(a) && has(b) ? r3(perArm[b][stat] - perArm[a][stat]) : null);

const QA41 = d('poolMedL', 'base', 'cand');
const mirrorAbs = d('poolMedL', 'cand', 'restore');
const QA41m = QA41 && mirrorAbs != null ? r3(mirrorAbs / Math.abs(QA41)) : null;
const N1 = has('base2') ? r3(Math.abs(d('poolMedL', 'base', 'base2'))) : null;
const N2 = has('restore') ? r3(Math.abs(d('poolMedL', 'base', 'restore'))) : null;
const noiseMax = [N1, N2].filter((v) => v != null).length ? Math.max(...[N1, N2].filter((v) => v != null)) : null;
const QA42 = perArm.base.silCount ? r3(perArm.cand.silCount / perArm.base.silCount) : null;
const L2 = has('base2') ? Math.abs(perArm.base2.silCount - perArm.base.silCount) : null;
const V1 = has('base2') ? pxGE10(im.base, im.base2, POOL_ROI) : null;

let V2 = null, V3 = null, warmup = null;
try {
  const rb = JSON.parse(readFileSync(path.join(DIR, RB), 'utf8'));
  warmup = rb.warmup ?? null;
  const ts = rb.arms.map((r) => r.engineTimeAtCapture).filter((v) => v != null);
  V2 = { perArm: Object.fromEntries(rb.arms.map((r) => [r.arm, r.engineTimeAtCapture])), spread: ts.length ? +(Math.max(...ts) - Math.min(...ts)).toFixed(6) : null };
  const cols = Object.fromEntries(rb.arms.map((r) => [r.arm, r.probe?.guard?.beamCol0]));
  const same = (a, b) => !!(a && b && a.every((v, i) => v === b[i]));
  V3 = { perArm: cols, allFourIdentical: ARMS.every((a) => same(cols.base, cols[a])) };
} catch { /* readback optional */ }

const inBand = (v, [lo, hi]) => (v == null ? null : v >= lo && v <= hi);
const gates = {
  'Q-A4-1 ΔmedL cand−base, POOL ROI (0,400,560,700)': { band: `[${BAND.QA41[0]}, ${BAND.QA41[1]}]`, a3: A3SHOWN.QA41, value: QA41, pass: inBand(QA41, BAND.QA41) },
  'Q-A4-1m mirror ratio (restore−cand)/|Q-A4-1|': { band: `[${BAND.QA41m[0]}, ${BAND.QA41m[1]}]`, a3: A3SHOWN.QA41m, value: QA41m, pass: inBand(QA41m, BAND.QA41m) },
  'N-1 |base2−base| medL, POOL ROI': { band: `<= ${BAND.N}`, a3: A3SHOWN.N1, value: N1, pass: N1 == null ? null : N1 <= BAND.N },
  'N-2 |restore−base| medL, POOL ROI': { band: `<= ${BAND.N}`, a3: A3SHOWN.N2, value: N2, pass: N2 == null ? null : N2 <= BAND.N },
  '§13 clause: |Q-A4-1| >= 3 × max same-state Δ': { band: noiseMax == null ? 'n/a' : `>= ${r3(BAND.clause13 * noiseMax)}`, a3: 'a2 ROI FAILED 6.27 vs 13.89', value: QA41 == null ? null : r3(Math.abs(QA41)), pass: QA41 == null || noiseMax == null ? null : Math.abs(QA41) >= BAND.clause13 * noiseMax },
  'Q-A4-2 no-harm silCount(cand)/silCount(base), SIL BOX L<=60': { band: `>= ${BAND.QA42}`, a3: A3SHOWN.QA42, value: QA42, pass: QA42 == null ? null : QA42 >= BAND.QA42 },
  'L-2 licence |silCount(base2)−silCount(base)|': { band: `<= ${BAND.L2} px`, a3: A3SHOWN.L2, value: L2, pass: L2 == null ? null : L2 <= BAND.L2 },
  'V-1 px |ΔL|>=10 in POOL ROI, base vs base2': { band: `<= ${BAND.V1}`, a3: A3SHOWN.V1, value: V1, pass: V1 == null ? null : V1 <= BAND.V1 },
  'V-2 engine.time spread across all four arms': { band: `<= ${BAND.V2eps}`, a3: A3SHOWN.V2, value: V2?.spread ?? null, pass: V2?.spread == null ? null : V2.spread <= BAND.V2eps },
  'V-3 beamCol0 bit-identical across ALL FOUR arms': { band: 'exact', a3: A3SHOWN.V3, value: V3 ? V3.allFourIdentical : null, pass: V3 == null ? null : V3.allFourIdentical },
};
const context = {
  'C-1 ΔmeanL cand−base, POOL ROI': { value: d('poolMeanL', 'base', 'cand'), note: 'a3 clean −39.672' },
  'C-2 ΔmedL over a2 ROI (340,280,700,350)': { value: d('a2RoiMedL', 'base', 'cand'), note: '§178 exhibit: a2 read +6.27 unpinned, a3 −0.06 pinned' },
  'C-3 Δmean|∇L| over a3 guard rect (retired gate)': { value: d('a3GuardGrad', 'base', 'cand'), note: 'a3 clean +0.067, E/N 0.03' },
  'silCount per arm (SIL BOX, L<=60)': { value: Object.fromEntries(Object.keys(im).map((a) => [a, perArm[a].silCount])), note: 'a3 clean: base2 10315, cand 8693, restore 10417' },
};

/* pool pair structure — the P-A4b deliverable (measures only) */
const [X0, Y0, X1, Y1] = POOL_ROI;
const CX = 7, CY = 4, CW = (X1 - X0) / CX, CHh = (Y1 - Y0) / CY;
function pairStruct(a, b) {
  const A = im[a], B = im[b];
  let sum = 0, n = 0, ge10 = 0;
  const cs = Array.from({ length: CY }, () => new Float64Array(CX));
  const cn = Array.from({ length: CY }, () => new Float64Array(CX));
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const v = Lof(B, x, y) - Lof(A, x, y);
    sum += Math.abs(v); n++; if (Math.abs(v) >= 10) ge10++;
    const cx = Math.min(CX - 1, ((x - X0) / CW) | 0), cy = Math.min(CY - 1, ((y - Y0) / CHh) | 0);
    cs[cy][cx] += v; cn[cy][cx]++;
  }
  return { meanAbsDL: +(sum / n).toFixed(3), pxGE10: ge10, n, cellMeanDL: cs.map((row, cy) => Array.from(row, (v, cx) => +(v / cn[cy][cx]).toFixed(2))) };
}
const PS = {};
for (const [a, b] of [['base', 'base2'], ['base', 'cand'], ['cand', 'restore'], ['base', 'restore']]) if (has(a) && has(b)) PS[`${a}->${b}`] = pairStruct(a, b);
writeFileSync(path.join(DIR, PREFIX === 'a4-guard' ? 'a4-pairstruct.json' : 'a4-pairstruct-control.json'),
  JSON.stringify({ at: new Date().toISOString(), note: 'measures only; thresholds live in PREREG-fxcluster-a4. |ΔL| >= 10 stated per §122.1.', rect: POOL_ROI, cellGrid: { x: CX, y: CY }, pairs: PS }, null, 1));

const OUT = { at: new Date().toISOString(), prereg: 'PREREG-fxcluster-a4.md', frames: PREFIX, run: 'a4 (a3 instrument unchanged; discard warm-up + silhouette no-harm + structural V-1)', masks: { POOL_ROI, SIL_BOX, T_SIL, A2_ROI, A3_GUARD }, framesMissing: missing, warmup, perArm, gates, context, clock: V2, beamCol0: V3 };
writeFileSync(path.join(DIR, PREFIX === 'a4-guard' ? 'a4-scores.json' : 'a4-scorer-control.json'), JSON.stringify(OUT, null, 1));

console.log(`\nframes: ${PREFIX}`);
if (warmup) console.log('warm-up (discarded):', JSON.stringify(warmup));
console.log('\nper-arm:');
for (const a of Object.keys(perArm)) console.log(` ${a.padEnd(8)}`, JSON.stringify(perArm[a]));
console.log('\nGATES (band | a3 clean-pair | a4 value | pass):');
for (const [k, v] of Object.entries(gates)) {
  console.log(` ${v.pass === true ? 'PASS' : v.pass === false ? 'FAIL' : ' -- '}  ${k}`);
  console.log(`        band ${String(v.band).padEnd(12)} a3 ${String(v.a3).padEnd(36)} a4 ${v.value}`);
}
console.log('\ncontext (not gates):');
for (const [k, v] of Object.entries(context)) console.log(` ${k}: ${JSON.stringify(v.value)}   [${v.note}]`);
console.log('\nwrote scores + pairstruct');

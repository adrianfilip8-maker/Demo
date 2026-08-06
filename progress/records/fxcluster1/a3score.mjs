#!/usr/bin/env node
/* a3score — scoring of the a3 run against PREREG-fxcluster-a3 §2.
 *
 * Thresholds below are TRANSCRIBED from the seal, not chosen here. Statistics are computed by
 * the same definitions a3-choose.mjs used on the committed a2 frames, so the seal's
 * "shown able to move" column and this run's values are the same instrument.
 *
 * Every gate is printed with (a) its band, (b) its a2 known-bad/base response as quoted in the
 * seal, and (c) its a3 value — §177 finding 2: a guard that cannot fail is not a guard, so the
 * demonstration travels with the reading.
 *
 * usage: node a3score.mjs   (writes a3-scores.json + a3-pairstruct.json)
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ARMS = ['base', 'base2', 'cand', 'restore'];
const F = (a) => path.join(DIR, `a3-guard.${a}.png`);

/* ---- seal §2 masks ---- */
const POOL_ROI = [0, 400, 560, 700];        // Q-A3-1, Q-A3-1m, N-1, N-2, C-1
const GUARD_LIVE = [852, 220, 990, 300];    // Q-A3-2, L-2
const A2_ROI = [340, 280, 700, 350];        // C-2 (a2's registered ROI, carried for comparability)
const A2_FIGURE = [852, 220, 990, 700];     // C-3 (a2's untrimmed figure rect, the §177 exhibit)

/* ---- seal §2 bands, transcribed ---- */
const BAND = {
  QA31: [-100.0, -15.0],
  QA31m: [0.60, 1.40],
  N: 4.0,
  clause13: 3,
  QA32: -3.0,
  L2: 1.0,
  V1: 20000,
  V2eps: 1e-6,
};
/* ---- the seal's "shown able to move" column, quoted from a3-choose.json (a2 frames) ---- */
const A2SHOWN = {
  QA31: -59.84, QA31m: 0.94, N1: 1.49, N2: 3.49, QA32: -2.08, QA32mirror: 2.56, L2: 2.40, V1: 507830,
};

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
function framePxDiff(A, B) {
  let n = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const k = (y * A.w + x) * A.ch;
    for (let c = 0; c < 3; c++) if (Math.abs(A.data[k + c] - B.data[k + c]) >= 1) { n++; break; }
  }
  return n;
}

const missing = ARMS.filter((a) => !existsSync(F(a)));
if (missing.length) console.log(`WARNING: frames missing: ${missing.join(', ')} — partial scoring`);
const im = {};
for (const a of ARMS) if (existsSync(F(a))) im[a] = readPNG(F(a));
if (!im.base || !im.cand) { console.log('FATAL: need at least base + cand to score. Stopping.'); process.exit(1); }

const r2 = (v) => (v == null ? null : +v.toFixed(2));
const perArm = {};
for (const a of Object.keys(im)) {
  perArm[a] = {
    poolMedL: r2(medL(im[a], POOL_ROI)),
    poolMeanL: r2(meanL(im[a], POOL_ROI)),
    guardLiveGrad: r2(gradL(im[a], GUARD_LIVE)),
    a2RoiMedL: r2(medL(im[a], A2_ROI)),
    a2FigureMedL: r2(medL(im[a], A2_FIGURE)),
  };
}

const has = (a) => !!im[a];
const d = (stat, a, b) => (has(a) && has(b) ? r2(perArm[b][stat] - perArm[a][stat]) : null);

const QA31 = d('poolMedL', 'base', 'cand');
const QA31mAbs = d('poolMedL', 'cand', 'restore');
const QA31m = QA31 && QA31mAbs != null ? r2(QA31mAbs / Math.abs(QA31)) : null;
const N1 = has('base2') ? r2(Math.abs(d('poolMedL', 'base', 'base2'))) : null;
const N2 = has('restore') ? r2(Math.abs(d('poolMedL', 'base', 'restore'))) : null;
const noiseMax = [N1, N2].filter((v) => v != null).length ? Math.max(...[N1, N2].filter((v) => v != null)) : null;
const QA32 = d('guardLiveGrad', 'base', 'cand');
const QA32mirror = d('guardLiveGrad', 'cand', 'restore');
const L2a = has('base2') ? r2(Math.abs(d('guardLiveGrad', 'base', 'base2'))) : null;
const L2b = has('restore') ? r2(Math.abs(d('guardLiveGrad', 'base', 'restore'))) : null;
const L2 = [L2a, L2b].filter((v) => v != null).length ? Math.max(...[L2a, L2b].filter((v) => v != null)) : null;
const V1 = has('base2') ? framePxDiff(im.base, im.base2) : null;

/* V-2 / V-3: clock + beam colour identity, from the run's own readback */
let V2 = null, V3 = null, readback = null;
try {
  readback = JSON.parse(readFileSync(path.join(DIR, 'a3-readback.json'), 'utf8'));
  const ts = readback.arms.map((r) => r.engineTimeAtCapture);
  V2 = { perArm: Object.fromEntries(readback.arms.map((r) => [r.arm, r.engineTimeAtCapture])), spread: +(Math.max(...ts) - Math.min(...ts)).toFixed(6) };
  const cols = Object.fromEntries(readback.arms.map((r) => [r.arm, r.probe?.guard?.beamCol0]));
  const same = (a, b) => a && b && a.every((v, i) => v === b[i]);
  V3 = { perArm: cols, baseVsBase2: same(cols.base, cols.base2), baseVsRestore: same(cols.base, cols.restore), baseVsCand: same(cols.base, cols.cand) };
} catch { /* readback optional for a partial scoring */ }

const inBand = (v, [lo, hi]) => (v == null ? null : v >= lo && v <= hi);
const gates = {
  'Q-A3-1 ΔmedL cand−base, POOL ROI (0,400,560,700)': {
    band: `[${BAND.QA31[0]}, ${BAND.QA31[1]}]`, a2shown: A2SHOWN.QA31, value: QA31, pass: inBand(QA31, BAND.QA31),
  },
  'Q-A3-1m mirror ratio (restore−cand)/|Q-A3-1|': {
    band: `[${BAND.QA31m[0]}, ${BAND.QA31m[1]}]`, a2shown: A2SHOWN.QA31m, value: QA31m, pass: inBand(QA31m, BAND.QA31m),
  },
  'N-1 |base2−base| medL, POOL ROI': { band: `<= ${BAND.N}`, a2shown: A2SHOWN.N1, value: N1, pass: N1 == null ? null : N1 <= BAND.N },
  'N-2 |restore−base| medL, POOL ROI': { band: `<= ${BAND.N}`, a2shown: A2SHOWN.N2, value: N2, pass: N2 == null ? null : N2 <= BAND.N },
  '§13 clause: |Q-A3-1| >= 3 × max same-state Δ': {
    band: noiseMax == null ? 'n/a' : `>= ${r2(BAND.clause13 * noiseMax)}`,
    a2shown: 'a2 registered ROI FAILED this clause 6.27 vs 13.89',
    value: QA31 == null ? null : r2(Math.abs(QA31)),
    pass: QA31 == null || noiseMax == null ? null : Math.abs(QA31) >= BAND.clause13 * noiseMax,
  },
  'Q-A3-2 no-harm Δmean|∇L| cand−base, GUARD LIVE (852,220,990,300)': {
    band: `>= ${BAND.QA32}`, a2shown: `${A2SHOWN.QA32} (mirror ${A2SHOWN.QA32mirror})`, value: QA32,
    pass: QA32 == null ? null : QA32 >= BAND.QA32,
  },
  'L-2 licence: same-state |Δmean∇L|, GUARD LIVE': {
    band: `<= ${BAND.L2}`, a2shown: A2SHOWN.L2, value: L2, pass: L2 == null ? null : L2 <= BAND.L2,
  },
  'V-1 clock pin: whole-frame px differing base vs base2 (any channel |Δ|>=1 of 921600)': {
    band: `<= ${BAND.V1}`, a2shown: A2SHOWN.V1, value: V1, pass: V1 == null ? null : V1 <= BAND.V1,
  },
  'V-2 engine.time identical at capture, all arms': {
    band: `spread <= ${BAND.V2eps}`, a2shown: 'a2 did not pin the clock', value: V2?.spread ?? null,
    pass: V2 == null ? null : V2.spread <= BAND.V2eps,
  },
  'V-3 beamCol0 bit-identical across base/base2/restore': {
    band: 'exact', a2shown: 'a2 read 0.2440 / 0.2531 / 0.2630', value: V3 ? `b2 ${V3.baseVsBase2} / rest ${V3.baseVsRestore}` : null,
    pass: V3 == null ? null : (V3.baseVsBase2 && V3.baseVsRestore),
  },
};
const context = {
  'C-1 ΔmeanL cand−base, POOL ROI': { value: d('poolMeanL', 'base', 'cand'), note: 'a2 −38.41' },
  'C-2 ΔmedL cand−base, a2 ROI (340,280,700,350)': { value: d('a2RoiMedL', 'base', 'cand'), note: 'a2 +6.27 — carried for comparability' },
  'C-3 ΔmedL cand−base, a2 untrimmed figure (852,220,990,700)': { value: d('a2FigureMedL', 'base', 'cand'), note: 'a2 exactly 0.00, 82.9% static — the §177 finding-2 exhibit' },
};

/* pair structure over the POOL ROI, the P-A3b deliverable (measures only) */
const [X0, Y0, X1, Y1] = POOL_ROI;
const CX = 7, CY = 4, CW = (X1 - X0) / CX, CH2 = (Y1 - Y0) / CY;
function pairStruct(a, b) {
  const A = im[a], B = im[b];
  let sum = 0, n = 0, ge10 = 0;
  const cs = Array.from({ length: CY }, () => new Float64Array(CX));
  const cn = Array.from({ length: CY }, () => new Float64Array(CX));
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const v = Lof(B, x, y) - Lof(A, x, y);
    sum += Math.abs(v); n++; if (Math.abs(v) >= 10) ge10++;
    const cx = Math.min(CX - 1, ((x - X0) / CW) | 0), cy = Math.min(CY - 1, ((y - Y0) / CH2) | 0);
    cs[cy][cx] += v; cn[cy][cx]++;
  }
  return { meanAbsDL: +(sum / n).toFixed(3), pxGE10: ge10, n, cellMeanDL: cs.map((row, cy) => Array.from(row, (v, cx) => +(v / cn[cy][cx]).toFixed(2))) };
}
const PS = {};
for (const [a, b] of [['base', 'base2'], ['base', 'cand'], ['cand', 'restore'], ['base', 'restore']]) {
  if (has(a) && has(b)) PS[`${a}->${b}`] = pairStruct(a, b);
}
writeFileSync(path.join(DIR, 'a3-pairstruct.json'), JSON.stringify({
  at: new Date().toISOString(), note: 'measures only; thresholds live in PREREG-fxcluster-a3. |ΔL| >= 10 stated per §122.1.',
  rect: POOL_ROI, cellGrid: { x: CX, y: CY, cellW: CW, cellH: CH2 }, pairs: PS,
}, null, 1));

const OUT = {
  at: new Date().toISOString(), prereg: 'PREREG-fxcluster-a3.md',
  run: 'a3 (same −0.20 heading lever; pool-sited instrument + pinned engine clock)',
  masks: { POOL_ROI, GUARD_LIVE, A2_ROI, A2_FIGURE }, framesMissing: missing,
  perArm, gates, context, clock: V2, beamCol0: V3,
};
writeFileSync(path.join(DIR, 'a3-scores.json'), JSON.stringify(OUT, null, 1));

console.log('\nper-arm:');
for (const a of Object.keys(perArm)) console.log(` ${a.padEnd(8)}`, JSON.stringify(perArm[a]));
console.log('\nGATES (band | a2 shown-able-to-move | a3 value | pass):');
for (const [k, v] of Object.entries(gates)) {
  console.log(` ${v.pass === true ? 'PASS' : v.pass === false ? 'FAIL' : ' -- '}  ${k}`);
  console.log(`        band ${String(v.band).padEnd(14)} a2-shown ${String(v.a2shown).padEnd(28)} a3 ${v.value}`);
}
console.log('\ncontext (not gates):');
for (const [k, v] of Object.entries(context)) console.log(` ${k}: ${v.value}   [${v.note}]`);
console.log('\nwrote a3-scores.json + a3-pairstruct.json');

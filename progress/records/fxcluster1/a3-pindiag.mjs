#!/usr/bin/env node
/* a3-pindiag — DIAGNOSTIC for the a3 letter. Measures only; it re-scores nothing and
 * re-registers nothing. PREREG-fxcluster-a3's gates are scored by a3score.mjs against the
 * registered reference arm (base) and that verdict stands (§141: no design iteration mid-run).
 *
 * What this answers: the a3 run pinned engine.time to 1000.0 at the head of every arm, and the
 * readback shows base2 / cand / restore all captured at t = 1000.283333 with bit-identical
 * beamCol0, while BASE captured at t = 1000.313333 — 0.03 s (1.8 frames) later, with beamCol0
 * 1.7% higher. Every one of a3's four failing gates (V-1, V-2, V-3, L-2) is scored against base.
 * So the question this file exists to answer is: WITH BASE EXCLUDED, did the clock pin work?
 *
 * If base2 vs restore — two same-state arms, both pinned — comes back at or near bit-identity,
 * then the pin is sound and the defect is confined to the first arm's staging order. That is a
 * different (and much cheaper) finding than "the pin does not work", and it is the successor's
 * whole design brief, so it is measured rather than asserted.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ARMS = ['base', 'base2', 'cand', 'restore'];
const im = Object.fromEntries(ARMS.map((a) => [a, readPNG(path.join(DIR, `a3-guard.${a}.png`))]));
const W = im.base.w, H = im.base.h, CH = im.base.ch;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const Lof = (i, x, y) => { const k = (y * i.w + x) * i.ch; return lum(i.data[k], i.data[k + 1], i.data[k + 2]); };
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
function rectL(i, [x0, y0, x1, y1]) { const L = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(Lof(i, x, y)); return L; }
const medL = (i, r) => +median(rectL(i, r)).toFixed(2);
function gradL(i, [x0, y0, x1, y1]) {
  let s = 0, n = 0;
  for (let y = y0; y < y1 - 1; y++) for (let x = x0; x < x1 - 1; x++) {
    s += Math.abs(Lof(i, x + 1, y) - Lof(i, x, y)) + Math.abs(Lof(i, x, y + 1) - Lof(i, x, y)); n++;
  }
  return +(s / n).toFixed(3);
}
function pxDiff(a, b) {
  const A = im[a], B = im[b];
  let n = 0, maxCh = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * CH;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[k + c] - B.data[k + c]));
    if (d >= 1) n++;
    if (d > maxCh) maxCh = d;
  }
  return { anyChannelGE1: n, pct: +(100 * n / (W * H)).toFixed(3), maxChannelDelta: maxCh };
}

const POOL = [0, 400, 560, 700], GUARD_LIVE = [852, 220, 990, 300], A2_ROI = [340, 280, 700, 350];

/* engine.time + beamCol0 straight from the run's own readback */
let clock = null;
try {
  const rb = JSON.parse(readFileSync(path.join(DIR, 'a3-readback.json'), 'utf8'));
  clock = Object.fromEntries(rb.arms.map((r) => [r.arm, {
    engineTimeBeforePin: r.poke?.engineTimeBeforePin, engineTimeAfterPin: r.poke?.engineTimeAfterPin,
    engineTimeAfterSetShot: r.setShot?.engineTimeAfterSetShot, engineTimeAtCapture: r.engineTimeAtCapture,
    beamCol0: r.probe?.guard?.beamCol0, beamUTime: r.probe?.clock?.beamUTime, yaw: r.probe?.guard?.yaw,
  }]));
} catch { /* optional */ }

const PAIRS = [
  ['base', 'base2'], ['base', 'restore'], ['base', 'cand'],
  ['base2', 'restore'], ['base2', 'cand'], ['cand', 'restore'],
];
const pairs = {};
for (const [a, b] of PAIRS) {
  pairs[`${a}->${b}`] = {
    framePx: pxDiff(a, b),
    poolMedLDelta: +(medL(im[b], POOL) - medL(im[a], POOL)).toFixed(2),
    a2RoiMedLDelta: +(medL(im[b], A2_ROI) - medL(im[a], A2_ROI)).toFixed(2),
    guardLiveGradDelta: +(gradL(im[b], GUARD_LIVE) - gradL(im[a], GUARD_LIVE)).toFixed(3),
  };
}

/* WHERE does the residual between two PINNED same-state arms live? 16x9 mean|ΔL| grid.
   The pool ROI (0,400,560,700) covers grid cols 0-6 of rows 5-8; the guard's live band
   (852,220,990,300) covers cols 10-12 of rows 2-3. If the residual avoids the pool and lands
   on the guard band + sky, the attribution is the ambient FX fields (sandLow / sandHigh /
   airMotes / shimmer / motes), which are LOOPING and therefore deliberately NOT wiped by the
   c2/a2 pool wipe — their per-particle history differs per arm even on a pinned clock. */
function grid(aName, bName, GX = 16, GY = 9) {
  const A = im[aName], B = im[bName];
  const gw = W / GX, gh = H / GY;
  const s = Array.from({ length: GY }, () => new Float64Array(GX));
  const n = Array.from({ length: GY }, () => new Float64Array(GX));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.abs(Lof(B, x, y) - Lof(A, x, y));
    const gx = (x / gw) | 0, gy = (y / gh) | 0;
    s[gy][gx] += d; n[gy][gx]++;
  }
  return s.map((row, gy) => Array.from(row, (v, gx) => +(v / n[gy][gx]).toFixed(2)));
}
const residualGrid = grid('base2', 'restore');

/* ambient (looping, un-wiped) vs non-looping pool occupancy per arm, from the readback */
let poolsPerArm = null;
try {
  const rb = JSON.parse(readFileSync(path.join(DIR, 'a3-readback.json'), 'utf8'));
  poolsPerArm = Object.fromEntries(rb.arms.map((r) => [r.arm,
    Object.fromEntries(Object.entries(r.probe?.pools ?? {}).filter(([, v]) => v.loop).map(([k, v]) => [k, v.used]))]));
} catch { /* optional */ }

const OUT = { at: new Date().toISOString(), note: 'DIAGNOSTIC ONLY — scores nothing, registers nothing. The a3 verdict is a3score.mjs against the registered base arm.', clock, pairs, residualGridBase2ToRestore: residualGrid, loopingPoolsPerArm: poolsPerArm };
writeFileSync(path.join(DIR, 'a3-pindiag.json'), JSON.stringify(OUT, null, 1));

console.log('clock + beam per arm (from a3-readback.json):');
for (const [a, c] of Object.entries(clock ?? {})) console.log(` ${a.padEnd(8)} tCapture ${String(c.engineTimeAtCapture).padEnd(13)} beamUTime ${String(c.beamUTime).padEnd(13)} beamCol0 ${JSON.stringify(c.beamCol0)} yaw ${c.yaw}`);
console.log('\npair diffs (framePx = any-channel |Δ| >= 1 of 921600):');
for (const [k, v] of Object.entries(pairs)) {
  console.log(` ${k.padEnd(18)} px ${String(v.framePx.anyChannelGE1).padStart(7)} (${String(v.framePx.pct).padStart(6)}%) maxCh ${String(v.framePx.maxChannelDelta).padStart(3)}  Δpool ${String(v.poolMedLDelta).padStart(7)}  Δa2ROI ${String(v.a2RoiMedLDelta).padStart(6)}  Δgrad ${String(v.guardLiveGradDelta).padStart(7)}`);
}
console.log('\nresidual between two PINNED same-state arms (base2 -> restore), mean|ΔL| 16x9 grid:');
residualGrid.forEach((row, i) => console.log(` y${String(i * 80).padStart(3)}`, row.map((v) => String(v).padStart(6)).join('')));
console.log('\nlooping (un-wiped) ambient pool occupancy per arm:');
for (const [a, p] of Object.entries(poolsPerArm ?? {})) console.log(` ${a.padEnd(8)}`, JSON.stringify(p));
console.log('\nwrote a3-pindiag.json');

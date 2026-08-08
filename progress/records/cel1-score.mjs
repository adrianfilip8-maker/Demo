/**
 * cel1-score — scores PREREG-cel1.md against the frames cel1.mjs captured.
 *
 * Metric is the CRITIC'S OWN flat-area statistic, not one invented for this change: the share of
 * pixels whose 5x5 neighbourhood spans <= 2 luma, L = Rec.709 on sRGB bytes. Using their statistic
 * means the answer is comparable to the verdict it responds to, and I cannot pick one afterwards
 * that flatters the result.
 *
 * The ROIs are the ones sealed in the prereg, unchanged, in three groups with three different
 * expectations — character and KayKit MUST move, world must NOT. The world group is doing double
 * duty: it is the specificity check (did the alias touch only what it should?) and the cross-boot
 * floor (these arms are two separate boots, so whatever the world drifts bounds what the character
 * is allowed to claim).
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const DIR = '/home/user/Demo/progress/records/cel1';
const ROIS = [
  { g: 'CHAR',   id: 'startle/shoulder_L', shot: 'sly-startle', r: [485, 400, 545, 500] },
  { g: 'CHAR',   id: 'startle/cheek_R',    shot: 'sly-startle', r: [712, 235, 772, 295] },
  { g: 'CHAR',   id: 'interior/back_L',    shot: 'interior',    r: [582, 428, 642, 482] },
  { g: 'CHAR',   id: 'temple/sly_L',       shot: 'temple',      r: [640, 618, 700, 680] },
  { g: 'KAYKIT', id: 'temple/barrel_R',    shot: 'temple',      r: [402, 590, 462, 650] },
  { g: 'KAYKIT', id: 'courtyard/crate_R',  shot: 'courtyard',   r: [352, 560, 412, 660] },
  { g: 'WORLD',  id: 'temple/column_R',    shot: 'temple',      r: [318, 220, 378, 330] },
  { g: 'WORLD',  id: 'courtyard/obelisk_L', shot: 'courtyard',  r: [552, 100, 612, 250] },
];
const ARMS = ['base', 'cand', 'KB', 'restore'];

const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

function measure(png, [x0, y0, x1, y1]) {
  const { width: W, data } = png;
  let flat = 0, n = 0, sum = 0, mx = -1, mn = 1e9;
  const lum = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = L(data, (y * W + x) * 4);
      lum.push(v); sum += v; if (v > mx) mx = v; if (v < mn) mn = v;
    }
  }
  /* 5x5 span <= 2 luma — the critic's flat-area definition */
  const w = x1 - x0, h = y1 - y0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let lo = 1e9, hi = -1e9;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const v = lum[(y + j) * w + (x + i)];
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
      n++; if (hi - lo <= 2) flat++;
    }
  }
  const sorted = lum.slice().sort((a, b) => a - b);
  return { flat: 100 * flat / n, mean: sum / lum.length, median: sorted[sorted.length >> 1], max: mx, min: mn };
}

const M = {};
for (const roi of ROIS) {
  M[roi.id] = {};
  for (const arm of ARMS) {
    const p = `${DIR}/${roi.shot}.${arm}.png`;
    try { M[roi.id][arm] = measure(PNG.sync.read(readFileSync(p)), roi.r); }
    catch (e) { M[roi.id][arm] = null; }
  }
}

console.log('ROI                       arm       FLAT%    meanL   medianL');
for (const roi of ROIS) {
  for (const arm of ARMS) {
    const m = M[roi.id][arm];
    if (!m) { console.log(`${roi.id.padEnd(24)} ${arm.padEnd(9)} MISSING`); continue; }
    console.log(`${(roi.g + ' ' + roi.id).padEnd(31).slice(0, 31)} ${arm.padEnd(8)} ${m.flat.toFixed(1).padStart(6)} ${m.mean.toFixed(1).padStart(8)} ${m.median.toFixed(1).padStart(8)}`);
  }
}

const grp = (g) => ROIS.filter((r) => r.g === g);
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

console.log('\n================ REGISTERED BANDS ================');

/* KB — the calibration. Must move the character, or nothing here is interpretable. */
const kbMoves = grp('CHAR').map((r) => Math.abs(M[r.id].KB.mean - M[r.id].cand.mean));
const kbPass = kbMoves.filter((v) => v >= 15).length;
console.log(`KB  character meanL |KB - cand| per ROI: ${kbMoves.map((v) => v.toFixed(1)).join(', ')}`);
console.log(`KB  >= 15 L on ${kbPass}/4 (band: >= 3 of 4)  -> ${kbPass >= 3 ? 'PASS — the lever reaches the character' : 'FAIL -> RUN IS UNSCOREABLE'}`);

const dFlat = (g) => avg(grp(g).map((r) => M[r.id].cand.flat - M[r.id].base.flat));
const c = dFlat('CHAR'), k = dFlat('KAYKIT');
console.log(`\nP1  CHARACTER dFLAT (cand-base) = ${c.toFixed(2)} pp   (band: >= +10.0) -> ${c >= 10 ? 'CONFIRMED' : 'MISS'}`);
console.log(`P2  KAYKIT    dFLAT (cand-base) = ${k.toFixed(2)} pp   (band: >= +8.0)  -> ${k >= 8 ? 'MET' : 'MISS'}`);

console.log('\nP3  WORLD (must NOT move; also the cross-boot floor):');
let p3 = true;
for (const r of grp('WORLD')) {
  const df = M[r.id].cand.flat - M[r.id].base.flat, dl = M[r.id].cand.mean - M[r.id].base.mean;
  const ok = Math.abs(df) < 3 && Math.abs(dl) < 4;
  if (!ok) p3 = false;
  console.log(`    ${r.id.padEnd(22)} dFLAT ${df.toFixed(2).padStart(7)} pp   dL ${dl.toFixed(2).padStart(7)}   ${ok ? 'ok' : 'BREACH'}`);
}
console.log(`P3  -> ${p3 ? 'PASS' : 'BREACH — void, do not ship on this floor'}`);

console.log('\nP4  restore vs cand (determinism, band |dL| < 1):');
let p4 = true;
for (const r of ROIS) {
  const dl = Math.abs(M[r.id].restore.mean - M[r.id].cand.mean);
  if (dl >= 1) { p4 = false; console.log(`    ${r.id.padEnd(22)} dL ${dl.toFixed(2)}  BREACH`); }
}
console.log(`P4  -> ${p4 ? 'PASS' : 'BREACH'}`);

console.log('\n---- counter-risks ----');
const dMed = grp('CHAR').map((r) => M[r.id].cand.median - M[r.id].base.median);
console.log(`C1  character median dL: ${dMed.map((v) => v.toFixed(1)).join(', ')}  (regression if any < -25) -> ${dMed.every((v) => v > -25) ? 'ok' : 'CHARACTER WENT DARK'}`);
const mx = grp('CHAR').map((r) => M[r.id].cand.max);
console.log(`C3  character max L:     ${mx.map((v) => v.toFixed(0)).join(', ')}  (flag if > 235) -> ${mx.every((v) => v <= 235) ? 'ok' : 'FLAG: rim/SSS blowing out'}`);

/**
 * §128.5 cel-ramp secondary — plateau-and-step structure across `temple` nave columns, per arm.
 * Scores PREREG-compose1 §E's registered prediction (< 5 points of movement, base -> compose).
 *
 * The plateau/step rule is lifted BYTE-FOR-BYTE from progress/records/loftscore2.mjs (median-3
 * smoothing, plateau = run inside a +-2.5 L window, minRun 3), because §122.1 is the record of one
 * run scored 1.86x apart by two owners whose instruments differed silently.
 *
 * THRESHOLDS, STATED (§122.1):
 *   luma        Rec.709 on 8-bit sRGB, 0..255
 *   plateau     run of >=3 smoothed samples inside a +-2.5 L window
 *   plateauShare  samples inside a detected plateau / samples in the run
 *   steepShare    adjacent |dL| > 2.5 (one step leaves the plateau window) / (n-1)
 *   gradient      max - min of the smoothed profile
 *
 * MY plateauShare/steepShare are NOT calibrated against §128.5's 30-51%/15-17%: that was a
 * different owner's instrument and I do not have it. The registered prediction is about MOVEMENT
 * BETWEEN ARMS on one instrument, which is exactly the comparison this supports and which does not
 * depend on matching anyone's absolute calibration. Absolute values are printed for orientation
 * only and must not be quoted against §128.5's.
 *
 * Membership is geometric (colmask.mjs, raycast) and never colour-gated — a cel terminator's dark
 * band is darker AND bluer, so any value/hue mask deletes the band it is looking for.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { readFileSync, existsSync } from 'node:fs';

const D = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/compose1';
const SHOT = 'temple';
const ARMS = ['base', 'sbm010', 'fill0', 'compose', 'base2'];
const WIN = 2.5, MINRUN = 3;

const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const LUM = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* byte-for-byte loftscore2.mjs */
function plateaus(vals, { w = 3, minRun = MINRUN, win = WIN } = {}) {
  const v = vals.filter((x) => Number.isFinite(x));
  if (v.length < minRun * 2) return null;
  const h = w >> 1;
  const f = v.map((_, i) => med(v.slice(Math.max(0, i - h), Math.min(v.length, i + h + 1))));
  const plats = []; let s = 0;
  for (let i = 1; i < f.length; i++) {
    const seg = f.slice(s, i + 1);
    if (Math.max(...seg) - Math.min(...seg) > win) {
      if (i - s >= minRun) plats.push({ v: med(f.slice(s, i)), seg: f.slice(s, i) });
      s = i;
    }
  }
  if (f.length - s >= minRun) plats.push({ v: med(f.slice(s)), seg: f.slice(s) });
  const steps = [];
  for (let i = 1; i < plats.length; i++) steps.push(Math.abs(plats[i].v - plats[i - 1].v));
  const inPlat = plats.reduce((a, p) => a + p.seg.length, 0);
  let steep = 0;
  for (let i = 1; i < f.length; i++) if (Math.abs(f[i] - f[i - 1]) > win) steep++;
  return {
    n: plats.length,
    maxStep: steps.length ? Math.max(...steps) : 0,
    plateauShare: 100 * inPlat / f.length,
    steepShare: 100 * steep / Math.max(1, f.length - 1),
    gradient: Math.max(...f) - Math.min(...f),
  };
}

const maskFile = `${D}/colmask-${SHOT}.json`;
if (!existsSync(maskFile)) { console.log('no colmask yet — run colmask.mjs'); process.exit(0); }
const mask = JSON.parse(readFileSync(maskFile, 'utf8'));

console.log(`ROI: ${mask.rows.length} rows, x-stride ${mask.XSTRIDE}, runs >= 40 px, membership by raycast`);
console.log('arm         rows  plateau%  steep%  gradient L  plateaus/row  maxStep L');
const out = {};
for (const arm of ARMS) {
  const f = `${D}/frames/${SHOT}-${arm}.png`;
  if (!existsSync(f)) continue;
  const im = readPNG(f);
  const acc = { p: [], s: [], g: [], n: [], m: [] };
  for (const row of mask.rows) {
    // widest run on this row — one profile per row, so rows are independent replicates
    const run = row.runs.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    const vals = [];
    for (let x = run[0]; x <= run[1]; x += mask.XSTRIDE) {
      const [r, g, b] = px(im, x, row.y);
      vals.push(LUM(r, g, b));
    }
    const q = plateaus(vals);
    if (!q) continue;
    acc.p.push(q.plateauShare); acc.s.push(q.steepShare); acc.g.push(q.gradient);
    acc.n.push(q.n); acc.m.push(q.maxStep);
  }
  const M = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  out[arm] = { plateau: M(acc.p), steep: M(acc.s), grad: M(acc.g), n: M(acc.n), maxStep: M(acc.m), rows: acc.p.length };
  console.log(`${arm.padEnd(11)} ${String(out[arm].rows).padStart(4)}  ${out[arm].plateau.toFixed(1).padStart(7)}  ${out[arm].steep.toFixed(1).padStart(6)}  ${out[arm].grad.toFixed(1).padStart(10)}  ${out[arm].n.toFixed(2).padStart(12)}  ${out[arm].maxStep.toFixed(1).padStart(9)}`);
}

if (out.base && out.compose) {
  const dp = out.compose.plateau - out.base.plateau;
  const ds = out.compose.steep - out.base.steep;
  console.log(`\nPREREG §E: d(plateau) ${dp >= 0 ? '+' : ''}${dp.toFixed(2)} pts, d(steep) ${ds >= 0 ? '+' : ''}${ds.toFixed(2)} pts`);
  console.log(Math.abs(dp) < 5
    ? 'PREDICTED NULL HOLDS (<5 pts) — a luma-matched hue rotation does not move a luminance quantiser.'
    : '*** PREDICTION FALSIFIED (>=5 pts) — the luma-matching does not hold in frame; that is the finding. ***');
}
if (out.base && out.base2) {
  const d = Math.abs(out.base2.plateau - out.base.plateau);
  console.log(`self-control base2 vs base: d(plateau) ${d.toFixed(3)} pts ${d < 1e-9 ? '(identical)' : ''}`);
}

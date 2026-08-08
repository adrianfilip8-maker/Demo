/**
 * ramp1-score — score PREREG-ramp1's arms on the critic's own FLAT-fraction instrument.
 *
 * FLAT fraction = share of adjacent horizontal pixel pairs in the ROI with |dL| < 1, L = Rec.709
 * on 0-255 bytes. A quantised 3-band ramp gives > 85%.
 *
 * Every ROI re-verifies its surface before its number is quoted: the fill lever changes brightness,
 * so a luma shift is expected and tolerated, but a rect that has slid onto a different object is
 * caught by hue and channel-ordering and reported VOID rather than scored.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';

const DIR = '/home/user/Demo/progress/records/ramp1';
const ARMS = ['base', 'f35', 'f10', 'restore', 'f00'];
const ROIS = [
  { id: 'R1', shot: 'sly-startle', y: 430, x0: 520, x1: 780, want: [17, 73, 175], critic: 28.9 },
  { id: 'R2', shot: 'temple', y: 430, x0: 120, x1: 380, want: [75, 85, 93], critic: 12.4 },
  { id: 'R3', shot: 'interior', y: 250, x0: 120, x1: 380, want: [45, 54, 80], critic: 32.2 },
  { id: 'R4', shot: 'courtyard', y: 520, x0: 420, x1: 760, want: [55, 69, 90], critic: 28.0 },
];
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const order = (c) => c.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((p) => p[1]).join('');
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
const dHue = (a, b) => { const d = Math.abs(hue(a) - hue(b)) % 360; return d > 180 ? 360 - d : d; };

function flat(png, roi) {
  const { width: W, data } = png;
  const px = [];
  for (let x = roi.x0; x < roi.x1; x++) {
    const i = (roi.y * W + x) * 4;
    px.push([data[i], data[i + 1], data[i + 2]]);
  }
  const mean = [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / px.length);
  let flatPairs = 0;
  for (let i = 1; i < px.length; i++) {
    if (Math.abs(L(...px[i]) - L(...px[i - 1])) < 1) flatPairs++;
  }
  return { mean: mean.map((v) => +v.toFixed(1)), flat: +(100 * flatPairs / (px.length - 1)).toFixed(1) };
}
/* frame-wide flat-colour area, the critic's 5x5 <= 2 luma definition */
function flatArea(png) {
  const { width: W, height: H, data } = png;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) lum[p] = L(data[i], data[i + 1], data[i + 2]);
  let n = 0, tot = 0;
  for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
    let lo = 1e9, hi = -1e9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = lum[(y + dy) * W + (x + dx)];
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    tot++; if (hi - lo <= 2) n++;
  }
  return +(100 * n / tot).toFixed(2);
}

const out = { rois: {}, flatArea: {}, p99: {} };
for (const roi of ROIS) {
  out.rois[roi.id] = { shot: roi.shot, criticBaseline: roi.critic, arms: {} };
  for (const arm of ARMS) {
    const f = `${DIR}/${roi.shot}.${arm}.png`;
    if (!existsSync(f)) { out.rois[roi.id].arms[arm] = { missing: true }; continue; }
    const png = PNG.sync.read(readFileSync(f));
    const r = flat(png, roi);
    const surfaceOk = dHue(r.mean, roi.want) <= 12 && order(r.mean) === order(roi.want);
    out.rois[roi.id].arms[arm] = { ...r, surfaceOk, void: !surfaceOk };
  }
}
for (const arm of ARMS) {
  const f = `${DIR}/sly-startle.${arm}.png`;
  if (!existsSync(f)) continue;
  const png = PNG.sync.read(readFileSync(f));
  out.flatArea[arm] = flatArea(png);
  const lum = [];
  for (let i = 0; i < png.data.length; i += 4) lum.push(L(png.data[i], png.data[i + 1], png.data[i + 2]));
  lum.sort((a, b) => a - b);
  out.p99[arm] = +lum[Math.floor(lum.length * 0.99)].toFixed(1);
}

/* ---- registered bands ---- */
const meanFlat = (arm) => {
  const v = ROIS.map((r) => out.rois[r.id].arms[arm]).filter((a) => a && !a.missing && !a.void).map((a) => a.flat);
  return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null;
};
const A1 = meanFlat('f10'), A2 = out.rois.R1.arms.f10?.flat;
out.verdict = {
  A1_meanFlat_f10: A1, band: '>= 55 for PRIMARY CAUSE, < 25 fires P-F1',
  A2_R1_f10: A2, A3_flatArea_f10: out.flatArea.f10, A4_p99_f10: out.p99.f10,
  chain: ARMS.map((a) => `${a}=${meanFlat(a)}`).join('  '),
  PF1_fillNotPrimary: A1 !== null && A1 < 25,
  PF6_monotonic: (() => {
    const seq = ['base', 'f35', 'f10', 'f00'].map(meanFlat).filter((v) => v !== null);
    return seq.every((v, i) => i === 0 || v >= seq[i - 1] - 1.0);
  })(),
};
writeFileSync(`${DIR}/score.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.verdict, null, 2));
console.log('\nper-ROI FLAT % by arm:');
for (const r of ROIS) {
  const a = out.rois[r.id].arms;
  console.log(`  ${r.id} ${r.shot.padEnd(12)} critic ${String(r.critic).padStart(5)} | ` +
    ARMS.map((k) => `${k} ${a[k]?.void ? 'VOID' : (a[k]?.flat ?? '--')}`).join('  '));
}

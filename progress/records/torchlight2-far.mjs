/**
 * PREREG-torchlight2 §5 — the FAR-band derivation, as a runnable artifact.
 *
 *   node progress/records/torchlight2-far.mjs      # prints every number §5 quotes
 *
 * Ray-traces the registered FAR ROI [380,30,560,120] from the shipped `interior` camera
 * against the committed vault geometry (EgyptLevel.js L.tomb constants, transcribed below and
 * checked against source at seal time), then evaluates the candidate term per emitter exactly
 * as the shader does. Also exports `farSurfacePoints()` — the scorer's F2 bar measures the
 * staged guard-torch slot against this grid, so the bar and the derivation share one truth.
 *
 * Approximations, disclosed: masonry batter/recess/jitter (< ~0.15 m) are ignored; surfaces
 * are the axis-aligned faces below. The F1 band carries ~10% headroom over the computed
 * ceiling and F2's margin is metres, so none of this is load-bearing.
 */

const W = 1280, H = 720, FOV = 52, ASPECT = W / H;
const CAM = [3.2, -9.2, -60.0], TGT = [-1.5, -11.5, -74.0];   // Shots.js `interior`
export const FAR = [380, 30, 560, 120];                        // parent seal §3, carried
export const FAR_N = [480, 30, 560, 120];                      // §5 F1b sub-rect

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

const f = norm(sub(TGT, CAM));
const right = norm(cross(f, [0, 1, 0]));
const up = cross(right, f);
const tanV = Math.tan((FOV / 2) * Math.PI / 180);
const ray = (px, py) => norm(add(add(f, mul(right, (((px + 0.5) / W) * 2 - 1) * tanV * ASPECT)),
  mul(up, (1 - ((py + 0.5) / H) * 2) * tanV)));

/* Vault geometry: L.tomb {x0:-14,x1:14,z0:-78,z1:-56,floor:-12,ceil:-2}; wall shells 1.9 m
   thick centred 0.95 in from the box -> inner faces x ±12.1 / z −76.1; ceiling_stars slab
   underside −2.85; crypt piers 2.2² at (±5.5, −62/−68/−74) rising to C−1.2 = −3.2; gilded
   beams over the pier rows; sarcophagus stack. */
const EPS = 1e-6;
function hitPlane(o, d, axis, v, lo1, hi1, lo2, hi2, n) {
  if (Math.abs(d[axis]) < EPS) return null;
  const t = (v - o[axis]) / d[axis];
  if (t <= 0.01) return null;
  const p = add(o, mul(d, t));
  const [a1, a2] = axis === 0 ? [p[1], p[2]] : axis === 1 ? [p[0], p[2]] : [p[0], p[1]];
  if (a1 < lo1 || a1 > hi1 || a2 < lo2 || a2 > hi2) return null;
  if (dot(n, d) >= 0) return null;
  return { t, p, n };
}
function hitBox(o, d, [x0, x1, y0, y1, z0, z1]) {
  let b = null;
  for (const c of [
    hitPlane(o, d, 0, x0, y0, y1, z0, z1, [-1, 0, 0]), hitPlane(o, d, 0, x1, y0, y1, z0, z1, [1, 0, 0]),
    hitPlane(o, d, 1, y0, x0, x1, z0, z1, [0, -1, 0]), hitPlane(o, d, 1, y1, x0, x1, z0, z1, [0, 1, 0]),
    hitPlane(o, d, 2, z0, x0, x1, y0, y1, [0, 0, -1]), hitPlane(o, d, 2, z1, x0, x1, y0, y1, [0, 0, 1]),
  ]) if (c && (!b || c.t < b.t)) b = c;
  return b;
}
const PIERS = [];
for (const sx of [-1, 1]) for (const pz of [-62, -68, -74])
  PIERS.push({ name: `pier${sx > 0 ? 'E' : 'W'}${pz}`, box: [sx * 5.5 - 1.1, sx * 5.5 + 1.1, -12, -3.2, pz - 1.1, pz + 1.1] });
const BEAMS = [
  { name: 'beamW', box: [-6.7, -4.3, -3.2, -2.0, -75.8, -60.2] },
  { name: 'beamE', box: [4.3, 6.7, -3.2, -2.0, -75.8, -60.2] },
];
function trace(o, d) {
  let best = null;
  const take = (h, name) => { if (h && (!best || h.t < best.t)) best = { ...h, name }; };
  take(hitPlane(o, d, 2, -75.9, -2.6, 2.6, -12, -5.8, [0, 0, 1]), 'falseDoor');
  take(hitPlane(o, d, 2, -76.1, -12.1, 12.1, -12, -2, [0, 0, 1]), 'northWall');
  take(hitPlane(o, d, 1, -2.85, -13.1, 13.1, -76.4, -58.8, [0, -1, 0]), 'ceiling');
  take(hitPlane(o, d, 0, -12.1, -12, -2, -76.1, -58.2, [1, 0, 0]), 'westWall');
  take(hitPlane(o, d, 0, 12.1, -12, -2, -76.1, -58.2, [-1, 0, 0]), 'eastWall');
  take(hitPlane(o, d, 1, -12.0, -14, 14, -78, -56, [0, 1, 0]), 'floor');
  for (const P of PIERS) take(hitBox(o, d, P.box), P.name);
  for (const B of BEAMS) take(hitBox(o, d, B.box), B.name);
  take(hitBox(o, d, [-2.4, 2.6, -12, -9.35, -73.8, -70.2]), 'sarc');
  return best;
}

/** The FAR ROI's surface points (2 px sampling) — the F2 grid. */
export function farSurfacePoints() {
  const pts = [];
  for (let py = FAR[1]; py < FAR[3]; py += 2) for (let px = FAR[0]; px < FAR[2]; px += 2) {
    const h = trace(CAM, ray(px, py));
    if (h) pts.push(h.p);
  }
  return pts;
}

/* ---- derivation CLI ---------------------------------------------------------------------- */

const s2l = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const TORCH = [s2l(0xff), s2l(0xb0), s2l(0x60)];   // sconce 0xffb060 (Props.js:583)
const LUMA = [0.2126, 0.7152, 0.0722];
const SCONCES = [];
for (const sx of [-1, 1]) for (const pz of [-62, -68, -74]) SCONCES.push([sx * 4.35, -9.05, pz]);
const byCamD = SCONCES.map((p) => ({ p, d: Math.hypot(...sub(p, CAM)) })).sort((a, b) => a.d - b.d);
export const PROMOTED = byCamD.slice(0, 5).map((e) => e.p);   // 6-slot pool: 5 sconces + guard
export const DROPPED = byCamD[5].p;                           // (-4.35, -9.05, -74)
const att = (d, r) => d >= r ? 0 : (1 / Math.max(d * d, 0.01)) * Math.max(0, 1 - (d / r) ** 4) ** 2;

if (import.meta.url === `file://${process.argv[1]}`) {
  const GAIN = 2.5, CAP = 1.6, ALB = [0.5, 0.45, 0.4], AMP = 1.385, WOB = 0.13;
  const S_L = 170, K_RB = 800;
  const rects = [['FAR', FAR], ['FAR_N', FAR_N]];
  for (const [label, [X0, Y0, X1, Y1]] of rects) {
    let n = 0, hist = {}, per = {}, sy = 0;
    for (let py = Y0; py < Y1; py += 2) for (let px = X0; px < X1; px += 2) {
      const h = trace(CAM, ray(px, py));
      n++;
      if (!h) continue;
      hist[h.name] = (hist[h.name] || 0) + 1;
      let acc = [0, 0, 0];
      for (const sp of SCONCES) {
        const spw = add(sp, mul(norm(sub(h.p, sp)), WOB));
        const toL = sub(spw, h.p); const d = Math.hypot(...toL);
        const a = att(d, 9);
        if (!a) continue;
        const ndl = Math.max(0, dot(h.n, mul(toL, 1 / d)));
        const rad = mul(TORCH, 3.4 * AMP * a * ndl);
        const A = [0, 1, 2].map((i) => ALB[i] * Math.min(rad[i] * GAIN, CAP));
        const key = `${sp[0] < 0 ? 'L' : 'R'}${sp[2]}`;
        per[key] = (per[key] || 0) + dot(A, LUMA);
        if (PROMOTED.includes(sp)) acc = add(acc, rad);
      }
      const A = [0, 1, 2].map((i) => ALB[i] * Math.min(acc[i] * GAIN, CAP));
      sy += dot(A, LUMA);
    }
    console.log(`${label} rays ${n}  surfaces ${JSON.stringify(hist)}`);
    for (const [k, v] of Object.entries(per))
      console.log(`  ${k.padEnd(5)} ROI-mean Y_lin ${(v / n).toFixed(5)}  (dL ${(S_L * v / n).toFixed(2)}  dRB ${(K_RB * v / n).toFixed(2)})${PROMOTED.some((p) => `${p[0] < 0 ? 'L' : 'R'}${p[2]}` === k) ? '' : '  [DROPPED — not in the promoted set]'}`);
    console.log(`  promoted-set mean Y_lin ${(sy / n).toFixed(5)}  -> ceilings dL ${(S_L * sy / n).toFixed(2)}  dRB ${(K_RB * sy / n).toFixed(2)}`);
  }
  // guard-torch reach: patrol envelope (PREREG §4) and run-4 measured slot vs the F2 grid
  const pts = farSurfacePoints();
  let minEnv = 1e9;
  for (let gx = 6.75; gx <= 11.65; gx += 0.1) for (let gy = -11; gy <= -8.5; gy += 0.1)
    for (let gz = -76.95; gz <= -59.05; gz += 0.1)
      for (const p of pts) { const d = Math.hypot(gx - p[0], gy - p[1], gz - p[2]); if (d < minEnv) minEnv = d; }
  const run4 = [9.09, -8.78, -66.57];
  const minRun4 = Math.min(...pts.map((p) => Math.hypot(...sub(run4, p))));
  console.log(`guard envelope min distance to FAR surface: ${minEnv.toFixed(2)} m (radius 8.5 -> exact 0 at >= 8.5)`);
  console.log(`run-4 measured slot min distance:           ${minRun4.toFixed(2)} m`);
}

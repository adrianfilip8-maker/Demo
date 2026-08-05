#!/usr/bin/env node
/* mradius-score — offline scoring for PREREG-mradius.md §5 (P2, P3, P4/P5 counts, P6, P7)
 * over the frames in progress/records/mradius1/. No boot, no lock. Crops are made separately
 * with tools/crop.mjs (listed in RESULT-mradius.md); this file produces the NUMBERS.
 *
 * Conventions (stated per §122.1):
 *   changed px      = any channel |Δ| > 0 (the P1/P2 convention of the seal)
 *   temporal mask   = px where base != restore (per shot; excluded from P3 diffs)
 *   P3 region       = treated-cornice projected extents (top annulus + outer profile band
 *                     sharing the arris — ADDENDUM §3) rasterised from the shot camera,
 *                     dilated 6 px (the sealed bloom/AA allowance)
 *   P6 lifted px    = L >= 90 inside the three registered night bboxes (background reads
 *                     ~15-30 L there, the located traces peak 132-144 — the threshold sits
 *                     between populations; the CROPS rule, the number supports)
 *
 * usage: node progress/records/mradius-score.mjs [hero|night|courtyard|all]
 */
import { readPNG, px } from '../../tools/png.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'progress/records/mradius1');
const W = 1280, H = 720;
const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ---- cameras (Shots.js, verified by mradius-proj source guard) ---- */
const SHOTS = {
  hero: { pos: [8.9, 10.28, 17.2], target: [-1.0, 7.4, 4.0], fov: 46, roll: -1.5 },
  night: { pos: [-13.4, 8.4, 22.0], target: [2.0, 6.0, 2.0], fov: 48, roll: 0 },
  courtyard: { pos: [-2.5, 4.0, 41.5], target: [1.5, 6.4, 16.0], fov: 55, roll: 0.8 },
};
function camera(s) {
  const [cx, cy, cz] = s.pos, [tx, ty, tz] = s.target;
  let zx = cx - tx, zy = cy - ty, zz = cz - tz;
  const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xy = 0, xz = -zx;
  const xl = Math.hypot(xx, xy, xz); xx /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const t = (s.roll || 0) * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
  return { c: [cx, cy, cz], x: [ct * xx + st * yx, ct * xy + st * yy, ct * xz + st * yz],
    y: [-st * xx + ct * yx, -st * xy + ct * yy, -st * xz + ct * yz], zbk: [zx, zy, zz],
    tanV: Math.tan(s.fov / 2 * Math.PI / 180), tanH: Math.tan(s.fov / 2 * Math.PI / 180) * W / H };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function projector(cam) {
  return (p) => {
    const v = [p[0] - cam.c[0], p[1] - cam.c[1], p[2] - cam.c[2]];
    const d = -dot(v, cam.zbk);
    if (d <= 0) return null;
    return [ (dot(v, cam.x) / d / cam.tanH + 1) / 2 * W, (1 - dot(v, cam.y) / d / cam.tanV) / 2 * H ];
  };
}

/* ---- treated cornices (world), per PREREG-mradius §1/§3 ---- */
const CORNICES = [
  { x0: -6.65, x1: 6.65, z0: 5.35, z1: 16.65, top: 5.2, A: 0.58, outer: 0.70, yb: 4.70 },  // tc2
  { x0: -9.45, x1: 9.45, z0: 2.55, z1: 19.45, top: 2.0, A: 0.62, outer: 0.74, yb: 1.46 },  // tc1
];
function regionMask(shot) {
  const proj = projector(camera(SHOTS[shot]));
  const m = new Uint8Array(W * H);
  const paint = (p) => {
    const q = proj(p);
    if (!q) return;
    const X = Math.round(q[0]), Y = Math.round(q[1]);
    if (X < -8 || X >= W + 8 || Y < -8 || Y >= H + 8) return;
    if (X >= 0 && X < W && Y >= 0 && Y < H) m[Y * W + X] = 1;
  };
  const S = 0.02;
  for (const c of CORNICES) {
    // four runs: N (z0 side, out = -z), S (z1, +z), W (x0, -x), E (x1, +x)
    for (let u = c.x0 - c.outer; u <= c.x1 + c.outer; u += S) {
      for (let o = 0; o <= c.outer; o += S) {
        for (const [X, Z] of [[u, c.z0 - o], [u, c.z1 + o]]) {
          paint([X, c.top, Z]);                                     // top annulus + lip top
          if (o >= c.A - S) for (let y = c.yb; y <= c.top; y += S) paint([X, y, Z]); // outer faces
        }
      }
    }
    for (let u = c.z0 - c.outer; u <= c.z1 + c.outer; u += S) {
      for (let o = 0; o <= c.outer; o += S) {
        for (const [X, Z] of [[c.x0 - o, u], [c.x1 + o, u]]) {
          paint([X, c.top, Z]);
          if (o >= c.A - S) for (let y = c.yb; y <= c.top; y += S) paint([X, y, Z]);
        }
      }
    }
  }
  // dilate 6 px (the sealed allowance)
  const R = 6, out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && X < W && Y >= 0 && Y < H) out[Y * W + X] = 1;
    }
  }
  return out;
}

const ROI = { x0: 820, x1: 1100, y0: 500, y1: 610 };
const NIGHT_SITES = [
  { name: 'tc2-north', x0: 414, y0: 400, x1: 660, y1: 430 },
  { name: 'tc2-south', x0: 1170, y0: 449, x1: 1268, y1: 485 },
  { name: 'tc2-west', x0: 450, y0: 457, x1: 516, y1: 477 },
];

function diffStats(a, b, mask = null, region = null) {
  let n = 0, maxD = 0, out = 0, lt8 = 0;
  let bb = [1e9, 1e9, -1e9, -1e9], obb = [1e9, 1e9, -1e9, -1e9];
  const outs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r1, g1, b1] = px(a, x, y), [r2, g2, b2] = px(b, x, y);
    const d = Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
    if (d === 0) continue;
    if (mask && mask[y * W + x]) continue;
    n++; maxD = Math.max(maxD, d); if (d < 8) lt8++;
    bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    if (region && !region[y * W + x]) {
      out++;
      obb = [Math.min(obb[0], x), Math.min(obb[1], y), Math.max(obb[2], x), Math.max(obb[3], y)];
      if (outs.length < 12) outs.push([x, y, d]);
    }
  }
  return { n, maxD, lt8, bbox: n ? bb : null, outside: out, outsideBbox: out ? obb : null, outsideSamples: outs };
}
function tempMask(a, b) {
  const m = new Uint8Array(W * H);
  let n = 0, roiN = 0;
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r1, g1, b1] = px(a, x, y), [r2, g2, b2] = px(b, x, y);
    if (r1 === r2 && g1 === g2 && b1 === b2) continue;
    m[y * W + x] = 1; n++;
    if (x >= ROI.x0 && x <= ROI.x1 && y >= ROI.y0 && y <= ROI.y1) roiN++;
    bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
  }
  return { m, n, pct: (100 * n / (W * H)).toFixed(3), roiN, bbox: n ? bb : null };
}

const want = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : ['hero', 'night', 'courtyard'];
for (const shot of want) {
  const f = (arm) => path.join(DIR, `${shot}.${arm}.png`);
  if (!['base', 'cand', 'kb', 'restore'].every((a) => existsSync(f(a)))) {
    console.log(`\n=== ${shot}: frames incomplete — skipping`); continue;
  }
  console.log(`\n=== ${shot} ===`);
  const base = readPNG(f('base')), cand = readPNG(f('cand')), kb = readPNG(f('kb')), restore = readPNG(f('restore'));

  /* P2 — temporal mask */
  const tm = tempMask(base, restore);
  console.log(`P2 temporal mask (base vs restore, any-channel>0): ${tm.n} px (${tm.pct} % of frame)`
    + `${tm.n ? ` bbox (${tm.bbox.join(',')})` : ''}${shot === 'hero' ? `  ROI∩mask = ${tm.roiN} px` : ''}`);
  console.log(`   gate: mask <= 3 % of frame -> ${parseFloat(tm.pct) <= 3 ? 'PASS' : 'VOID'}`
    + (shot === 'hero' ? `; ROI∩mask == 0 -> ${tm.roiN === 0 ? 'PASS' : 'FAIL (hero counts do not stand)'}` : ''));

  /* P3 — confinement */
  const region = regionMask(shot);
  let regionPx = 0; for (let i = 0; i < region.length; i++) regionPx += region[i];
  console.log(`P3 region mask: ${regionPx} px allowed (${(100 * regionPx / (W * H)).toFixed(2)} % of frame; treated cornices + 6 px)`);
  for (const [tag, im] of [['cand', cand], ['kb', kb]]) {
    const d = diffStats(base, im, tm.m, region);
    console.log(`P3 ${tag} vs base (outside temporal mask): ${d.n} px changed, maxΔ ${d.maxD}, Δ<8: ${d.lt8}`
      + `${d.bbox ? `, bbox (${d.bbox.join(',')})` : ''}`);
    console.log(`   outside region: ${d.outside} px${d.outside ? ` bbox (${d.outsideBbox.join(',')}) samples ${JSON.stringify(d.outsideSamples)}` : ''}`
      + `  -> ${d.outside === 0 ? 'CONFINED (PASS)' : 'NOT CONFINED — geography above decides VOID vs bloom-ring report'}`);
  }

  /* P6 — night trace sites */
  if (shot === 'night') {
    for (const s of NIGHT_SITES) {
      const row = [];
      for (const [tag, im] of [['base', base], ['cand', cand], ['kb', kb], ['restore', restore]]) {
        let n = 0, mx = 0;
        for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
          const [r, g, b] = px(im, x, y); const l = L(r, g, b);
          if (l >= 90) { n++; mx = Math.max(mx, l); }
        }
        row.push(`${tag} ${n}px maxL ${mx.toFixed(0)}`);
      }
      console.log(`P6 ${s.name} (${s.x0},${s.y0})..(${s.x1},${s.y1}) L>=90: ${row.join(' | ')}`);
    }
    console.log('   gate: cand keeps each trace as a continuous lifted line (crops rule; thinner ~x0.6 predicted); kb kills/guts them');
  }
}
console.log('\n(counts for P4/P5 come from kerbband2.mjs — run its calibration first, then the per-arm frames)');

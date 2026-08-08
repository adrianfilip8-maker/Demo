/**
 * decalsign, post-hoc: is the ROI statistic above its own noise, and is that noise zero-mean?
 *
 * The pre-registered band in `PREREG-decalsign.md` §6 is unchanged and is scored by
 * `decalsign.mjs` itself. NOTHING HERE CAN RESCUE A FAILED BAND — this only characterises how
 * trustworthy a passing one is, and it exists because the A2/A3 null arm is NOT byte-identical:
 * `decalsign.mjs:362` calls `setShot(n)` without `{ dt: 0 }`, so each arm advances the world clock
 * ~0.28 s and every clock-driven effect (birds, dust, shafts, flame, sparkle) moves between arms.
 *
 * Three questions, in order:
 *
 *  1. **Is the ROI mean stable even though the pixels are not?** Per-pixel noise averages down as
 *     1/sqrt(N) *only if it is zero-mean*. So the null arm's own ROI mean and standard error are
 *     reported next to every subject number, and the subject must clear the null's SEM by a wide
 *     margin, not merely clear zero.
 *  2. **Is the noise actually zero-mean inside MY roi?** `Props.js:564` grounds every brazier and
 *     `:567` hangs an `embers` emitter 1.05 m above it, so some contact decals sit under animated
 *     fire. If drifting embers bias the FOOT pixels in one direction the averaging argument fails,
 *     and the null arm is the thing that says so.
 *  3. **Is the effect systematic or carried by one ROI?** Per-decal medians, so a single
 *     contaminated footprint cannot produce the result on its own.
 *
 * A STABLE mask (|A2 - A3| <= 2 L) is derived from the null pair alone — a control, never the
 * subject — and applied identically to every arm. Reported beside the pre-registered number, never
 * instead of it.
 *
 *   node progress/records/decalsign-noise.mjs [dir]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIR = process.argv[2] || path.resolve(import.meta.dirname, 'decalsign');
const rep = JSON.parse(readFileSync(path.join(DIR, 'report.json'), 'utf8'));

function luma(name) {
  const png = PNG.sync.read(readFileSync(path.join(DIR, `${name}.png`)));
  const L = new Float32Array(png.width * png.height);
  for (let i = 0, p = 0; i < L.length; i++, p += 4) {
    L[i] = 0.2126 * png.data[p] + 0.7152 * png.data[p + 1] + 0.0722 * png.data[p + 2];
  }
  return { w: png.width, h: png.height, L };
}
const A1 = luma('A1'), A2 = luma('A2'), A3 = luma('A3'), A4 = luma('A4');
const { w, h } = A1;

/* ---- masks, rebuilt from the report's own polygons (same code path as the runner) ---- */
function fillPoly(mask, pts, bit) {
  const n = pts.length / 2;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const y = pts[i * 2 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(h - 1, Math.ceil(y1));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5, xs = [];
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1];
      const j = (i + 1) % n, bx = pts[j * 2], by = pts[j * 2 + 1];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const s = Math.max(0, Math.ceil(xs[k] - 0.5)), t = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = s; x <= t; x++) mask[y * w + x] |= bit;
    }
  }
}

/**
 * The runner stored each decal's live world centre, radius and reach but not its screen outline,
 * so the outline is rebuilt here from quantities that are deterministic offline: `courtyard`'s
 * camera out of `Shots.js`, and `uKey` out of `Atmosphere` at that shot's tod, exactly as
 * `ContactDecals.refresh()` derives it.
 *
 * **The reconstruction is then validated against the live centroids the runner did store.** If any
 * rebuilt polygon's centroid misses the captured `cx, cy` by more than 1 px, the reconstruction is
 * not describing the decals the frame drew and this script refuses to print a number. Same
 * construction, same centroid: a match on all of them means the outlines match too.
 */
const THREE = await import('three');
const { SHOTS } = await import('../../src/core/Shots.js');
const { createAtmosphereState, evalAtmosphere } = await import('../../src/render/Atmosphere.js');
const { TUNE, shadowLengthOf } = await import('../../src/world/Decals.js');

const shot = SHOTS[rep.shot];
const [cw, chh] = rep.projection.canvas;
const cam = new THREE.PerspectiveCamera(shot.fov, cw / chh, 0.1, 600);
cam.position.fromArray(shot.pos);
cam.lookAt(new THREE.Vector3().fromArray(shot.target));
if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

const st = createAtmosphereState();
evalAtmosphere(shot.tod ?? 0.78, st);
let kx = -st.keyDir.x, kz = -st.keyDir.z;
const kl = Math.hypot(kx, kz);
if (kl > 1e-5) { kx /= kl; kz /= kl; } else { kx = 1; kz = 0; }
const tx = -kz, tz = kx;

const SEG = 96;
const v4 = new THREE.Vector4();
const polys = [];
for (const p of rep.polys) {
  const [Cx, Cy, Cz] = p.world;
  const r = p.rWorld, reach = p.reach;
  const pts = []; let sx = 0, sy = 0; let ok = true;
  for (let s = 0; s < SEG; s++) {
    const th = (s / SEG) * Math.PI * 2;
    const dx = Math.cos(th), dy = Math.sin(th);
    const along = dx * (r + reach) + reach * TUNE.push;
    v4.set(Cx + kx * along + tx * (dy * r), Cy, Cz + kz * along + tz * (dy * r), 1);
    v4.applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    if (v4.w <= 1e-6) { ok = false; break; }
    const X = (v4.x / v4.w * 0.5 + 0.5) * cw, Y = (-v4.y / v4.w * 0.5 + 0.5) * chh;
    pts.push(X, Y); sx += X; sy += Y;
  }
  if (!ok) continue;
  polys.push({ key: p.key, i: p.i, pts, cx: sx / SEG, cy: sy / SEG, stored: [p.cx, p.cy] });
}

let worst = 0;
for (const p of polys) worst = Math.max(worst, Math.hypot(p.cx - p.stored[0], p.cy - p.stored[1]));
console.log(`reconstruction check: ${polys.length}/${rep.polys.length} outlines rebuilt, `
  + `worst centroid error ${worst.toFixed(3)} px`);
if (!(worst < 1.0)) {
  console.error('REFUSING TO SCORE — the rebuilt outlines do not match the live ones (>1 px).');
  process.exit(2);
}

const foot = new Uint8Array(w * h);
for (const p of polys) fillPoly(foot, p.pts, 1);

/* STABLE: derived from the NULL PAIR only. Never from a subject arm. */
const stable = new Uint8Array(w * h);
for (let i = 0; i < stable.length; i++) stable[i] = Math.abs(A2.L[i] - A3.L[i]) <= 2 ? 1 : 0;

const describe = (vals) => {
  const n = vals.length;
  if (!n) return { n: 0 };
  const s = vals.slice().sort((a, b) => a - b);
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const varr = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1);
  const sd = Math.sqrt(varr);
  return { n, mean, sd, sem: sd / Math.sqrt(n), med: s[n >> 1], p10: s[Math.round(0.1 * (n - 1))], p90: s[Math.round(0.9 * (n - 1))] };
};

const delta = (a, b, sel) => {
  const out = [];
  for (let i = 0; i < a.L.length; i++) if (sel(i)) out.push(a.L[i] - b.L[i]);
  return out;
};

const inFoot = (i) => foot[i] === 1;
const inFootStable = (i) => foot[i] === 1 && stable[i] === 1;

const f = (v) => (Number.isFinite(v) ? v.toFixed(3).padStart(9) : '      n/a');
const row = (label, d) => console.log(`  ${label.padEnd(26)} n ${String(d.n).padStart(7)}  mean ${f(d.mean)}  SEM ${f(d.sem)}  sd ${f(d.sd)}  med ${f(d.med)}  p10 ${f(d.p10)}  p90 ${f(d.p90)}`);

console.log(`\n=== decalsign post-hoc noise analysis — ${w}x${h} ===`);
console.log(`FOOT ${foot.reduce((a, b) => a + b, 0)} px   STABLE(|A2-A3|<=2) over whole frame ${stable.reduce((a, b) => a + b, 0)} px`);

let footStable = 0;
for (let i = 0; i < foot.length; i++) if (inFootStable(i)) footStable++;
console.log(`FOOT n STABLE ${footStable} px  (${(100 * footStable / Math.max(1, foot.reduce((a, b) => a + b, 0))).toFixed(1)}% of FOOT)`);

console.log('\nQ1/Q2 — the NULL arm over the scored ROI. Zero-mean is the assumption the averaging rests on:');
const nullFoot = describe(delta(A2, A3, inFoot));
row('NULL A2-A3, FOOT', nullFoot);
row('NULL A2-A3, FOOT+STABLE', describe(delta(A2, A3, inFootStable)));
const zscore = nullFoot.mean / nullFoot.sem;
console.log(`  null ROI mean is ${Math.abs(zscore).toFixed(1)} SEM from zero`
  + (Math.abs(zscore) < 3 ? '  -> consistent with zero-mean; averaging is valid'
                          : '  -> BIASED. The averaging argument fails; read the STABLE rows.'));

console.log('\nSUBJECT — signed contribution of the decal, against the same frame with no decal in it:');
for (const [name, arm] of [['A1 BROKEN', A1], ['A2 FIXED', A2], ['A3 FIXED-prime', A3]]) {
  row(`${name} - A4, FOOT`, describe(delta(arm, A4, inFoot)));
  row(`${name} - A4, FOOT+STABLE`, describe(delta(arm, A4, inFootStable)));
}

console.log('\nQ3 — per decal, median (arm - A4) over that decal\'s own footprint:');
console.log('  (a systematic effect shows the same sign on nearly every row)');
let nNeg2 = 0, nPos1 = 0, counted = 0;
const rows = [];
for (const p of polys) {
  const m = new Uint8Array(w * h);
  fillPoly(m, p.pts, 1);
  const sel = (i) => m[i] === 1;
  const d1 = describe(delta(A1, A4, sel));
  const d2 = describe(delta(A2, A4, sel));
  const dn = describe(delta(A2, A3, sel));
  if (d2.n < 40) continue;
  counted++;
  if (d2.med < 0) nNeg2++;
  if (d1.med > 0) nPos1++;
  rows.push({ key: p.key, i: p.i, n: d2.n, a1: d1.med, a2: d2.med, nul: dn.med, nulMean: dn.mean });
}
rows.sort((a, b) => b.n - a.n);
for (const r of rows.slice(0, 16)) {
  console.log(`  #${String(r.i).padStart(3)} ${r.key.padEnd(7)} n ${String(r.n).padStart(6)}   A1 ${f(r.a1)}   A2 ${f(r.a2)}   null ${f(r.nul)}`);
}
console.log(`\n  decals with >= 40 px scored: ${counted}`);
console.log(`  A2 median NEGATIVE (darkens) on ${nNeg2}/${counted}`);
console.log(`  A1 median POSITIVE (brightens) on ${nPos1}/${counted}`);

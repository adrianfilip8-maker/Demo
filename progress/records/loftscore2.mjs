#!/usr/bin/env node
/**
 * loftscore2 — L2 rescored after a POPULATION correction. Offline, no lock, no WebGL.
 *
 * WHY THIS EXISTS. `loftscore.mjs` returned L2 10/10 and L3 PASS. Both are artefacts: its scan
 * region was a crude x-interpolation between projected station points, so it ran off the animal
 * into the foreground dune, a near-black mast, and (arm 2) a courtyard wall 2.66 m from the lens.
 * The steps it measured were object silhouettes, not band edges — 139.8 L against `temple`'s
 * 14–31 L reference, and up to 14 plateaus per column where a 3-band ramp admits 3.
 *
 * WHAT CHANGED AND WHAT DID NOT. Thresholds and discriminator are EXACTLY as sealed:
 * luma Rec.709; plateau = run inside a ±2.5 L window; step = |adjacent plateau medians|;
 * "carries a transition" = max step >= max(6.0 L, 3 x measured noise); flank counts iff >=2
 * columns pass; L2 bands >=4 PASS / 2-3 MARGINAL / <=1 FAIL. ONLY the population changed —
 * from "everything between two interpolated y values" to "pixels provably inside the animal's
 * own projected silhouette". That is the same class of correction as §64.4 (a control that
 * omitted a slab), and it is forced by the raycast and the pixels, not chosen after seeing a
 * number I disliked.
 *
 * WHY NOT A COLOUR MASK. The obvious mask — sphinx limestone reads teal, G-R >= +33, against
 * dune shadow at G-R <= +13 — separates cleanly on sampled pixels. It is also BIASED AGAINST
 * THE HYPOTHESIS: a cel terminator's dark band is both darker and bluer (the shadow light is
 * (0.142,0.189,0.423)), so a G-R gate deletes the shadow band and can only ever report "no
 * transition". Rejected for that reason. The mask here is geometric — point-in-polygon on the
 * projected silhouette, eroded 3 px to stay off the ink — so it is neutral with respect to value.
 *
 * CONTROLS, both registered before running:
 *  A. ABSENCE — the identical predicate on flat background sand patches of the same size. If a
 *     featureless region also "carries transitions", the predicate selects on any input and the
 *     clause is void.
 *  B. SCATTER NULL — each column's values shuffled, predicate re-run. A real terminator is a
 *     contiguous step and dies under shuffling; noise and speckle survive it.
 */
import { readPNG, px } from '/home/user/Demo/tools/png.mjs';
import { writePNG } from '/home/user/Demo/tools/crop.mjs';
import { readFileSync } from 'node:fs';

const DIR = '/home/user/Demo/shots/dunesloft';
const rep = JSON.parse(readFileSync(`${DIR}/report.json`, 'utf8'));
const im = readPNG(`${DIR}/dunes-canon.png`);
const L = (x, y) => {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return NaN;
  const [r, g, b] = px(im, x, y);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/* ---- sealed plateau/step analysis, byte-for-byte the same rule as loftscore.mjs ---- */
function plateaus(vals, { w = 3, minRun = 3, win = 2.5 } = {}) {
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
  const spread = plats.map((p) => Math.max(...p.seg) - Math.min(...p.seg));
  return { n: plats.length, maxStep: steps.length ? Math.max(...steps) : 0,
           spread: spread.length ? med(spread) : NaN };
}

/* ---- geometric mask: point in the projected silhouette, eroded ---- */
function polyOf(a) {
  const bots = a.pts.filter((_, i) => i % 2 === 0);
  const tops = a.pts.filter((_, i) => i % 2 === 1);
  return [...bots, ...tops.slice().reverse()];
}
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const E = 3;                                  // erosion radius, px — keeps the scan off the ink
const inside = (p, x, y) =>
  inPoly(p, x, y) && inPoly(p, x + E, y) && inPoly(p, x - E, y) && inPoly(p, x, y + E) && inPoly(p, x, y - E);

const INK = 40;                               // below this is ink/crevice, not a lit band

/** Longest contiguous run of masked, non-ink pixels in one column. */
function runAt(p, x, y0, y1) {
  let best = null, cur = null;
  for (let y = y0; y <= y1; y++) {
    const ok = inside(p, x, y) && L(x, y) >= INK;
    if (ok) { if (!cur) cur = { a: y, b: y }; else cur.b = y; }
    else { if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur; cur = null; }
  }
  if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur;
  return best;
}

function scoreFlank(a, { shuffle = false } = {}) {
  const p = polyOf(a);
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(im.w - 1, Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(im.h - 1, Math.max(...ys));
  const cols = [];
  for (let x = Math.ceil(x0); x <= Math.floor(x1); x++) {
    const r = runAt(p, x, Math.floor(y0), Math.ceil(y1));
    if (!r || r.b - r.a + 1 < 10) continue;    // need 10 px of animal to host a band edge
    let vals = []; for (let y = r.a; y <= r.b; y++) vals.push(L(x, y));
    if (shuffle) { for (let i = vals.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [vals[i], vals[j]] = [vals[j], vals[i]]; } }
    const q = plateaus(vals);
    if (q) cols.push(q);
  }
  if (!cols.length) return { cols: 0, hit: 0, carries: false, noise: NaN, thresh: NaN, maxStep: 0 };
  const noise = med(cols.map((c) => c.spread).filter(Number.isFinite));
  const thresh = Math.max(6.0, 3 * (Number.isFinite(noise) ? noise : 2));
  const hit = cols.filter((c) => c.maxStep >= thresh).length;
  return { cols: cols.length, hit, carries: hit >= 2, noise, thresh,
           maxStep: Math.max(...cols.map((c) => c.maxStep)) };
}

/* ---------------------------------- run ---------------------------------- */
const av = rep.arms.canon.avenue.filter((a) => a.inFrustum);
console.log(`=== L2 rescored, geometric mask (erode ${E}px, ink floor ${INK} L) ===`);
console.log('flank        dist   cols  noise  thresh  cols>=thr  maxStep  transition?');
const rows = [];
for (const a of av) {
  const r = scoreFlank(a);
  rows.push({ a, r });
  console.log(`${(a.side + " z" + a.z).padEnd(11)} ${String(a.dist).padStart(5)}m ${String(r.cols).padStart(5)}`
    + `  ${(Number.isFinite(r.noise) ? r.noise.toFixed(2) : '  - ').padStart(5)}`
    + `  ${(Number.isFinite(r.thresh) ? r.thresh.toFixed(2) : '  -  ').padStart(6)}  ${String(r.hit).padStart(9)}`
    + `  ${r.maxStep.toFixed(1).padStart(7)}  ${r.cols === 0 ? 'NO DATA' : r.carries ? 'YES' : 'no'}`);
}
const scoreable = rows.filter((x) => x.r.cols >= 5);
const n = scoreable.filter((x) => x.r.carries).length;
console.log(`\nscoreable flanks (>=5 masked columns): ${scoreable.length} of ${rows.length} in-frustum`);
console.log(`L2: ${n} of ${scoreable.length} carry >=1 band transition`);
console.log(`   L2 band: ${n >= 4 ? 'PASS (>=4)' : n >= 2 ? 'MARGINAL (2-3)' : 'FAIL (<=1)'}`);

/* ---- CONTROL A: absence. Flat background sand, same box sizes, no subject in them. ---- */
console.log(`\n=== CONTROL A — absence (flat background sand, no terminator present) ===`);
const patches = [[430, 250], [470, 200], [1150, 480], [700, 620]];
for (const [cx, cy] of patches) {
  const w = 70, h = 45;
  const p = [[cx, cy], [cx + w, cy], [cx + w, cy + h], [cx, cy + h]];
  const fake = { pts: [], side: 'ctl', z: 0, dist: 0 };
  // build pts in the bot/top alternating form scoreFlank expects
  fake.pts = [[cx, cy + h], [cx, cy], [cx + w, cy + h], [cx + w, cy]];
  const r = scoreFlank(fake);
  console.log(`sand patch (${cx},${cy})  cols ${String(r.cols).padStart(3)}  noise `
    + `${(Number.isFinite(r.noise) ? r.noise.toFixed(2) : ' - ').padStart(5)}  thresh `
    + `${(Number.isFinite(r.thresh) ? r.thresh.toFixed(2) : ' - ').padStart(5)}  cols>=thr ${String(r.hit).padStart(3)}`
    + `  maxStep ${r.maxStep.toFixed(1).padStart(6)}  ${r.carries ? 'CARRIES (predicate is not specific!)' : 'clean'}`);
}

/* ---- CONTROL B: scatter null on the real flanks ---- */
console.log(`\n=== CONTROL B — scatter null (same flanks, each column shuffled) ===`);
let nullCarry = 0;
for (const a of av) {
  const r = scoreFlank(a, { shuffle: true });
  if (r.cols >= 5 && r.carries) nullCarry++;
}
console.log(`flanks carrying a transition under shuffling: ${nullCarry} of ${scoreable.length}`
  + `  (a contiguous band edge should die; speckle survives)`);

/* ---- mask visualisation, so the population can be looked at rather than trusted ---- */
const OUT = process.argv[2];
if (OUT) {
  const w = im.w, h = im.h, rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = px(im, x, y);
    const i = (y * w + x) * 3;
    rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b;
  }
  for (const a of av) {
    const p = polyOf(a);
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w - 1, Math.ceil(Math.max(...xs))); x++) {
        if (inside(p, x, y) && L(x, y) >= INK) { const i = (y * w + x) * 3; rgb[i] = 255; rgb[i + 1] = 0; rgb[i + 2] = 255; }
      }
  }
  writePNG(OUT, w, h, rgb);
  console.log(`\nmask visualisation -> ${OUT}`);
}

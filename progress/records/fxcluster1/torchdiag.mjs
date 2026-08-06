#!/usr/bin/env node
/* torchdiag — FX torch-pool diagnosis for the banda2 warm-share remainder.
 *
 * OFFLINE. Reads only committed frames. No capture, no lock, no src edits.
 *
 * The question routed to FX: CRITIC-sbs3 re-measures interior's frame warm share at 7.05 %
 * against the comparand's 31.03 %, and CRITIC-sbs1 §3 said interior's flames exist but their
 * light "dies within ~2 m of each sconce". How much of that ~24 pp can the FX-owned share buy?
 *
 * This file answers it in pixels. The source trace lives in NOTE-torchpool.md; the short form is
 * that `ToonMaterial._patch` DELETES `<lights_fragment_begin|maps|end>` and
 * `<lights_physical_fragment>` from the shader source, and TOON_SHADE then replaces
 * `outgoingLight = totalDiffuse + ...` with a term built only from uKeyDir / uSkyColor /
 * uBounceColor / uShadowColor* / totalEmissiveRadiance. So a THREE.PointLight contributes
 * exactly zero to any toon-shaded surface, and all tomb architecture is toon-shaded
 * (Architecture.mat() -> shading.toon(); MeshStandardMaterial is a no-SHADING fallback).
 *
 * Predicates stated (§122.1): warm = R > B + 10 AND L > 40, CRITIC-sbs3's own frame predicate.
 * L = 0.2126R + 0.7152G + 0.0722B on 8-bit sRGB bytes.
 *
 * usage: node torchdiag.mjs   (writes torchdiag.json)
 */
import { writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import path from 'node:path';
import { readPNG } from '../../../tools/png.mjs';

const REC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FRAMES = {
  'sbs3/interior.png (current)': 'sbs3/interior.png',
  'sbs2/interior.base.png': 'sbs2/interior.base.png',
  'cand1/frames/interior.base.png': 'cand1/frames/interior.base.png',
  'banda2/interior.base.png': 'banda2/interior.base.png',
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const load = (rel) => { const p = path.join(REC, rel); return existsSync(p) ? readPNG(p) : null; };

function stats(im) {
  const { w, h, ch, data } = im;
  const N = w * h;
  let warm = 0, lit = 0;
  /* flame CORE: the emissive sprite itself — bright and strongly warm. Deliberately strict, so
     "flame" cannot quietly annex warm wall. */
  const core = new Uint8Array(N);
  let corePx = 0;
  const L = new Float32Array(N), RmB = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = i * ch, r = data[k], g = data[k + 1], b = data[k + 2];
    const l = lum(r, g, b); L[i] = l; RmB[i] = r - b;
    if (l > 40) lit++;
    if (r > b + 10 && l > 40) warm++;
    if (l > 170 && r > b + 40) { core[i] = 1; corePx++; }
  }
  return { w, h, N, warmPx: warm, warmShare: +(100 * warm / N).toFixed(2), litPx: lit, corePx, coreShare: +(100 * corePx / N).toFixed(3), core, L, RmB };
}

/** Distance (in px) from every pixel to the nearest flame core — two-pass chamfer. */
function distanceToCore(core, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h).fill(INF);
  for (let i = 0; i < d.length; i++) if (core[i]) d[i] = 0;
  const relax = (i, j, c) => { const v = d[j] + c; if (v < d[i]) d[i] = v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) relax(i, i - w, 1);
    if (x > 0 && y > 0) relax(i, i - w - 1, 1.414);
    if (x < w - 1 && y > 0) relax(i, i - w + 1, 1.414);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) relax(i, i + 1, 1);
    if (y < h - 1) relax(i, i + w, 1);
    if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 1.414);
    if (x > 0 && y < h - 1) relax(i, i + w - 1, 1.414);
  }
  return d;
}

/** Warm share and mean R−B in annuli around the flame cores — the "reach" profile. */
function reachProfile(s, d) {
  const EDGES = [0, 10, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480, 1e9];
  const rows = [];
  for (let b = 0; b < EDGES.length - 1; b++) {
    let n = 0, warm = 0, sumRmB = 0, lit = 0;
    for (let i = 0; i < s.N; i++) {
      if (d[i] < EDGES[b] || d[i] >= EDGES[b + 1]) continue;
      n++; sumRmB += s.RmB[i];
      if (s.L[i] > 40) { lit++; if (s.RmB[i] > 10) warm++; }
    }
    if (!n) continue;
    rows.push({
      annulusPx: `${EDGES[b]}-${EDGES[b + 1] === 1e9 ? 'inf' : EDGES[b + 1]}`,
      px: n, shareOfFrame: +(100 * n / s.N).toFixed(2),
      warmShareOfAnnulus: +(100 * warm / n).toFixed(2),
      meanRmB: +(sumRmB / n).toFixed(2),
      litShare: +(100 * lit / n).toFixed(1),
    });
  }
  return rows;
}

/** How much of the frame's warm population is flame-adjacent, by radius. */
function warmAttribution(s, d) {
  const RS = [10, 20, 40, 80, 160, 320];
  const out = {};
  for (const R of RS) {
    let within = 0;
    for (let i = 0; i < s.N; i++) if (d[i] <= R && s.L[i] > 40 && s.RmB[i] > 10) within++;
    out[`within ${R}px of a flame core`] = { px: within, shareOfFrame: +(100 * within / s.N).toFixed(2), shareOfWarmPop: +(100 * within / s.warmPx).toFixed(1) };
  }
  return out;
}

const OUT = { at: new Date().toISOString(), predicate: 'warm = R > B+10 AND L > 40 (CRITIC-sbs3 frame predicate); core = L > 170 AND R > B+40', frames: {} };
let primary = null;
for (const [label, rel] of Object.entries(FRAMES)) {
  const im = load(rel);
  if (!im) { OUT.frames[label] = { missing: rel }; continue; }
  const s = stats(im);
  const rec = { file: rel, w: s.w, h: s.h, warmShare: s.warmShare, warmPx: s.warmPx, litSharePct: +(100 * s.litPx / s.N).toFixed(2), flameCoreShare: s.coreShare, flameCorePx: s.corePx };
  OUT.frames[label] = rec;
  if (!primary) { primary = { label, s }; }
}
if (primary) {
  const d = distanceToCore(primary.s.core, primary.s.w, primary.s.h);
  OUT.reachProfile = { frame: primary.label, note: 'annuli measured outward from the flame sprites themselves', rows: reachProfile(primary.s, d) };
  OUT.warmAttribution = { frame: primary.label, rows: warmAttribution(primary.s, d) };
}
writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'torchdiag.json'), JSON.stringify(OUT, null, 1));

console.log('frame warm share (R>B+10, L>40) and flame-sprite coverage:\n');
console.log(` ${'frame'.padEnd(34)} ${'warm%'.padStart(7)} ${'lit%'.padStart(7)} ${'flameCore%'.padStart(11)} ${'flameCorePx'.padStart(12)}`);
for (const [label, r] of Object.entries(OUT.frames)) {
  if (r.missing) { console.log(` ${label.padEnd(34)}   (missing: ${r.missing})`); continue; }
  console.log(` ${label.padEnd(34)} ${String(r.warmShare).padStart(7)} ${String(r.litSharePct).padStart(7)} ${String(r.flameCoreShare).padStart(11)} ${String(r.flameCorePx).padStart(12)}`);
}
if (OUT.reachProfile) {
  console.log(`\nreach profile outward from the flame sprites — ${OUT.reachProfile.frame}:`);
  console.log(` ${'annulus (px)'.padEnd(14)} ${'px'.padStart(9)} ${'%frame'.padStart(8)} ${'warm% of annulus'.padStart(17)} ${'mean R−B'.padStart(10)} ${'lit%'.padStart(7)}`);
  for (const r of OUT.reachProfile.rows) console.log(` ${r.annulusPx.padEnd(14)} ${String(r.px).padStart(9)} ${String(r.shareOfFrame).padStart(8)} ${String(r.warmShareOfAnnulus).padStart(17)} ${String(r.meanRmB).padStart(10)} ${String(r.litShare).padStart(7)}`);
  console.log('\nwarm population attribution:');
  for (const [k, v] of Object.entries(OUT.warmAttribution.rows)) console.log(` ${k.padEnd(34)} ${String(v.px).padStart(8)} px  = ${String(v.shareOfFrame).padStart(6)}% of frame, ${String(v.shareOfWarmPop).padStart(5)}% of the warm population`);
}
console.log('\nwrote torchdiag.json');

/* ---------------------------------------------------------------------------
 * What the registered lights WOULD reach, if any term consumed them.
 * three.js punctual falloff (getDistanceAttenuation, decay = 2, cutoff = radius):
 *     I/d^2 * saturate(1 - (d/R)^4)^2
 * Slot params are Lighting.js's (L.distance = h.radius, L.decay = 2, :1745-1749); the
 * intensities/radii are PROPS' registrations (Props.js:515 brazier, :527 torch).
 * ------------------------------------------------------------------------- */
const LIGHTS = { 'wall torch (Props.js:527)': { I: 3.4, R: 9 }, 'brazier (Props.js:515)': { I: 5.5, R: 13 } };
const falloff = (I, R, d) => { const c = Math.max(0, 1 - (d / R) ** 4); return (I / Math.max(d * d, 0.01)) * c * c; };
const REACH = {};
for (const [n, L] of Object.entries(LIGHTS)) {
  REACH[n] = {};
  for (const d of [1, 2, 3, 4, 5, 6, 8, 10, 12]) if (d <= L.R) REACH[n][`${d} m`] = +falloff(L.I, L.R, d).toFixed(3);
}
console.log('\nreach the REGISTERED lights would have if a term consumed them (three.js decay=2):');
for (const [n, row] of Object.entries(REACH)) console.log(` ${n.padEnd(26)}`, JSON.stringify(row));
const J = JSON.parse(require('node:fs').readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'torchdiag.json'), 'utf8'));
J.registeredLightReach = { formula: 'I/d^2 * saturate(1-(d/R)^4)^2  (three.js decay=2, cutoff=radius)', lights: LIGHTS, table: REACH };
writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'torchdiag.json'), JSON.stringify(J, null, 1));

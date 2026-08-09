#!/usr/bin/env node
/**
 * slyface — derive a corrected head albedo for the shipped character from the supplied one.
 *
 * WHY THIS EXISTS. Critic pass 9's D11 says Sly's face is off-model in the two close-ups and
 * names three things: **there is no black nose**, **the mask reads as a pair of round
 * wire-rimmed spectacles**, and *"the reference mask is a broad pale bandit band across the
 * eyes"*. The first is true and is fixed here. The third is **wrong**, and getting that
 * straight is most of this file, because acting on it would have inverted the character.
 *
 * ── What the reference actually shows, measured rather than quoted ──────────────────────────
 *
 * `sly3-venice.jpg` frames Sly from behind, so the face is not in it; what IS in it is a broad
 * PALE band across the head, luma **L 85-145** against surrounding fur and cap at **L 45-70**.
 * That band is what critic 9 read as a pale mask. Two independent Sly head albedos say it is not
 * the mask — it is his HEAD FUR, and the mask is the dark shape inside it:
 *
 *   · `public/assets/sly-godot/sly-head.png` (the Godot fan project's Sly, imported at owner
 *     instruction, a different artist working from the same character). Its face island is a
 *     near-neutral pale grey — mean **(117.9, 117.5, 120.2)**, HSV sat **0.02**, R/B **0.98** —
 *     carrying a **solid black** bandit mask joined across the bridge with pointed temple ends,
 *     a small **black nose dot**, and a thin dark mouth line.
 *   · `src/player/SlyModel.js`, this project's own pre-rebuild procedural model, authors "the
 *     black domino mask" from the same reference and records that it *"does not read as a bandit
 *     mask, because it is the same warm brown as the eye it surrounds — so it reads as socket
 *     shading rather than as a shape"*.
 *
 * ── So what IS wrong with the shipped head, in one number ───────────────────────────────────
 *
 * Over the 99 762 texels the head mesh actually samples, `sly_head.png` is a **warm brown**:
 * mean **(135.7, 123.6, 111.7)**, HSV sat **0.181**, R/B **1.215**. Its median luma, 121, is
 * within 3 of the Godot head's 118 — **the value is right and the chroma is not.** A black mask
 * on a near-neutral pale head is a graphic shape; the same black mask on a warm mid-brown head
 * has far less separation from its own eye sockets and collapses into two rings. That is the
 * mechanism behind "wire-rimmed spectacles", and it is a chroma defect on the FUR, not a value
 * defect on the mask — whose albedo is already 0x000000 and cannot be darkened.
 *
 * ── What this tool writes ───────────────────────────────────────────────────────────────────
 *
 *   1. NOSE -> black. 146 head triangles form the muzzle-tip blob (centroid y < -0.235,
 *      |x| < 0.045, 1.49 < z < 1.60 in asset space); their UV footprint is 5 098 texels and the
 *      artist's mean colour there is **(89, 81, 74)** — plain fur. The nose geometry exists and
 *      was never painted. It is filled with `INK`.
 *   2. FUR -> neutral. Every head-surface texel the artist did NOT paint dark (L >= 45) is
 *      desaturated toward its own luma and given the reference's very slight cool tilt. Both
 *      constants are SOLVED from the two measured means, not chosen: `K` from the saturation
 *      ratio, the per-channel tilt from the Godot head's own R:G:B at our mean luma. Per-texel
 *      luma is preserved to within rounding, so every bit of the artist's painted shading,
 *      every fold and every seam survives — only the hue moves.
 *   3. The MASK IS NOT TOUCHED. Neither is its shape, its extent, or its value.
 *
 * Everything else in the image is copied byte for byte, and the supplied `sly_head.png` is not
 * modified — the product is a sibling file. `?face=raw` at runtime goes back to the original,
 * which is this change's calibration lever.
 *
 *   node tools/slyface.mjs                 # write src/assets/sly-dl/sly_head_fix.png
 *   node tools/slyface.mjs --dry           # report only
 *
 * WHAT THIS IS, AS THE GAP (KNOWN_ISSUES §11): an albedo edit measured in albedo space. Between
 * it and a frame lie the toon ramp, the shadow tint, the tonemap and the ink pass — three of
 * which are other agents' active work this session. Every number printed below is an albedo
 * number and none of them is a frame number; the frame claim lives in `PREREG-heroread.md`.
 */
import './_domshim.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { readPNG } from './png.mjs';
import { writePNG } from './crop.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_FBX = path.join(ROOT, 'src/assets/sly-dl/sly.fbx');
const SRC_TEX = path.join(ROOT, 'src/assets/sly-dl/sly_head.png');
const REF_TEX = path.join(ROOT, 'public/assets/sly-godot/sly-head.png');
const OUT_TEX = path.join(ROOT, 'src/assets/sly-dl/sly_head_fix.png');
const DRY = process.argv.includes('--dry');

/* The darkest thing on the head, for the nose. Deliberately not pure black: `SlyModel.js`
   records that the face's black group was authored warm and read as socket shading; this is
   that group's corrected value — same luma, cool. */
const INK = [17, 16, 20];
/* Texels at or below this luma are the artist's drawn black — mask, mouth, ear line. Left alone. */
const DARK = 45;
/* Nose blob, derived: the muzzle tip caps out at y -0.282 and the blob closes to |x| < 0.030 by
   y -0.24. z is up in this FBX and the muzzle runs to -y. */
const NOSE = { yMax: -0.235, xMax: 0.045, zMin: 1.49, zMax: 1.60 };
/* Where the reference face island sits in the Godot 2048^2 sheet. Named so the derivation below
   can be re-run and disagreed with rather than taken on trust. */
const REF_ROI = { x0: 720, y0: 1150, x1: 1500, y1: 1900 };

/* **`REF_TEX` IS ADAM7-INTERLACED** — IHDR interlace byte 1, colortype 6, 2048². Until `84252e3`
   (2026-08-09 18:23:14) `tools/png.mjs` did not implement interlacing and did not say so: it
   returned a plausible buffer with 66.6 % of sampled channels wrong. Anything read through that
   path before then is worthless, so this tool's reference numbers are corroborated rather than
   trusted:

     png.mjs (post-fix)  rgb 117.8, 117.5, 120.1   sat 0.043   R/B 0.981
     PIL (never had it)  rgb 117.9, 117.5, 120.2   sat 0.043   R/B 0.981

   The published figures came from the PIL read in the first place, which is why the derivation
   never depended on the broken decoder; the agreement above is the check, not the source. Both
   readings are of `REF_ROI` with the sheet's black backing and the mask excluded at L < 60.
   If you add a reference texture here, print its IHDR interlace byte before you believe a number
   off it. */

/* ---- load ------------------------------------------------------------------------------ */
const fbxBuf = readFileSync(SRC_FBX);
const scene = new FBXLoader().parse(
  fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength), '');
let head = null;
scene.traverse((o) => { if (o.isMesh && /head/.test(o.name)) head = o; });
if (!head) throw new Error('no head submesh in sly.fbx');

const src = readPNG(SRC_TEX);
const W = src.w, H = src.h, CH = src.ch;
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  rgb[i * 3] = src.data[i * CH];
  rgb[i * 3 + 1] = src.data[i * CH + 1];
  rgb[i * 3 + 2] = src.data[i * CH + 2];
}
const lum = (i) => (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3;

/* ---- rasterise the head's UV triangles, tagging the nose ------------------------------- */
const pos = head.geometry.attributes.position, uv = head.geometry.attributes.uv;
const owner = new Uint8Array(W * H);
const isNoseTexel = new Uint8Array(W * H);
const inNose = (x, y, z) => y < NOSE.yMax && Math.abs(x) < NOSE.xMax && z > NOSE.zMin && z < NOSE.zMax;

let noseTris = 0;
for (let t = 0; t < pos.count / 3; t++) {
  const I = [t * 3, t * 3 + 1, t * 3 + 2];
  const U = I.map((i) => uv.getX(i) * W);
  const V = I.map((i) => (1 - uv.getY(i)) * H);
  const P = I.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
  let nose = 0;
  for (const p of P) if (inNose(p[0], p[1], p[2])) nose++;
  const isNose = nose >= 2;
  if (isNose) noseTris++;
  const d = (U[1] - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (V[1] - V[0]);
  if (Math.abs(d) < 1e-9) continue;
  const x0 = Math.max(0, Math.floor(Math.min(...U))), x1 = Math.min(W - 1, Math.ceil(Math.max(...U)));
  const y0 = Math.max(0, Math.floor(Math.min(...V))), y1 = Math.min(H - 1, Math.ceil(Math.max(...V)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    const w1 = ((cx - U[0]) * (V[2] - V[0]) - (U[2] - U[0]) * (cy - V[0])) / d;
    const w2 = ((U[1] - U[0]) * (cy - V[0]) - (cx - U[0]) * (V[1] - V[0])) / d;
    const w0 = 1 - w1 - w2;
    /* half-texel slack so the seam between adjacent triangles does not leave holes */
    if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
    const o = y * W + x;
    owner[o] = 1;
    if (isNose) isNoseTexel[o] = 1;
  }
}

/* ---- measure: ours, and the reference ---------------------------------------------------- */
function stats(sample) {
  let n = 0, r = 0, g = 0, b = 0, sat = 0; const Ls = [];
  for (const [R, G, B] of sample) {
    const L = (R + G + B) / 3;
    n++; r += R; g += G; b += B; Ls.push(L);
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    sat += mx ? (mx - mn) / mx : 0;
  }
  Ls.sort((a, b2) => a - b2);
  return { n, r: r / n, g: g / n, b: b / n, sat: sat / n, med: Ls[Math.floor(n * 0.5)] };
}
const ours = [];
for (let o = 0; o < W * H; o++) {
  if (!owner[o] || isNoseTexel[o] || lum(o) < DARK) continue;
  ours.push([rgb[o * 3], rgb[o * 3 + 1], rgb[o * 3 + 2]]);
}
const A = stats(ours);

const ref = readPNG(REF_TEX);
const refPx = [];
for (let y = REF_ROI.y0; y < REF_ROI.y1; y++) for (let x = REF_ROI.x0; x < REF_ROI.x1; x++) {
  const i = (y * ref.w + x) * ref.ch;
  const R = ref.data[i], G = ref.data[i + 1], B = ref.data[i + 2];
  if ((R + G + B) / 3 < 60) continue;                    // the sheet's black backing and the mask
  refPx.push([R, G, B]);
}
const B_ = stats(refPx);

/* K: how much of each texel's chroma survives. Solved by bisection so the RESULTING mean
   saturation lands on the reference's, rather than by the ratio of the two means — those are
   not the same number, because saturation is a ratio and its mean does not scale with chroma.
   The first draft used the ratio and landed at sat 0.022 against a 0.043 target, i.e. it
   over-corrected by half the remaining chroma. Bisection because the map is monotone in K but
   has no closed form; 40 iterations is exact to 1e-12 on [0,1]. */
const Lbar = (A.r + A.g + A.b) / 3;
const refBar = (B_.r + B_.g + B_.b) / 3;
const want = [B_.r, B_.g, B_.b].map((c) => c / refBar * Lbar);
function tiltFor(k) {
  const post = [A.r, A.g, A.b].map((c) => Lbar + (c - Lbar) * k);
  return want.map((w, i) => w / post[i]);
}
function satAt(k) {
  const t = tiltFor(k);
  let s = 0;
  for (const [R, G, B] of ours) {
    const L = (R + G + B) / 3;
    const c = [R, G, B].map((v, i) => Math.max(0, Math.min(255, (L + (v - L) * k) * t[i])));
    const mx = Math.max(...c), mn = Math.min(...c);
    s += mx ? (mx - mn) / mx : 0;
  }
  return s / ours.length;
}
let lo = 0, hi = 1;
if (satAt(hi) > B_.sat) { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (satAt(mid) < B_.sat) lo = mid; else hi = mid; } }
else { lo = hi = 1; }                                    // already at or below the target: do not add chroma
const K = (lo + hi) / 2;
const tilt = tiltFor(K);

/* ---- paint ------------------------------------------------------------------------------- */
let nFur = 0, nNose = 0;
for (let o = 0; o < W * H; o++) {
  if (!owner[o]) continue;
  if (isNoseTexel[o]) {
    rgb[o * 3] = INK[0]; rgb[o * 3 + 1] = INK[1]; rgb[o * 3 + 2] = INK[2]; nNose++;
    continue;
  }
  const L = lum(o);
  if (L < DARK) continue;                                 // the artist's drawn black stays black
  for (let c = 0; c < 3; c++) {
    const v = (L + (rgb[o * 3 + c] - L) * K) * tilt[c];
    rgb[o * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
  nFur++;
}
const after = stats((() => {
  const out = [];
  for (let o = 0; o < W * H; o++) {
    if (!owner[o] || isNoseTexel[o] || lum(o) < DARK) continue;
    out.push([rgb[o * 3], rgb[o * 3 + 1], rgb[o * 3 + 2]]);
  }
  return out;
})());

const f = (x) => x.toFixed(1);
console.log(`slyface — ${W}x${H} head albedo, ${[...owner].reduce((a, b) => a + b, 0)} head-surface texels`);
console.log(`  nose        ${noseTris} triangles / ${nNose} texels   fur (89,81,74) -> ink (${INK.join(',')})`);
console.log(`  fur texels  ${nFur}   (mask/mouth/ear line at L < ${DARK} untouched)`);
console.log(`  ours   before   rgb ${f(A.r)},${f(A.g)},${f(A.b)}   sat ${A.sat.toFixed(3)}   R/B ${(A.r / A.b).toFixed(3)}   medL ${f(A.med)}`);
console.log(`  godot  reference rgb ${f(B_.r)},${f(B_.g)},${f(B_.b)}   sat ${B_.sat.toFixed(3)}   R/B ${(B_.r / B_.b).toFixed(3)}   medL ${f(B_.med)}`);
console.log(`  solved  K ${K.toFixed(4)}   tilt ${tilt.map((t) => t.toFixed(4)).join(' ')}`);
console.log(`  ours   after    rgb ${f(after.r)},${f(after.g)},${f(after.b)}   sat ${after.sat.toFixed(3)}   R/B ${(after.r / after.b).toFixed(3)}   medL ${f(after.med)}`);
console.log(`  luma drift      medL ${f(after.med - A.med)}   (target 0.0 +- 1)`);

if (DRY) { console.log('  --dry: nothing written'); process.exit(0); }
writePNG(OUT_TEX, W, H, rgb);
console.log(`  wrote ${path.relative(ROOT, OUT_TEX)}`);

/* ---- --sheet: the A/B nobody should have to take the capture lock to see ------------------- */
/**
 * Flat-shade the head with each albedo and put them side by side. No lighting, no ramp, no ink,
 * no tonemap — the albedo AS SAMPLED BY THE MESH and nothing else, which is the point: it shows
 * what the texture does to the face without the shading chain that D5 and D1 are arguing about.
 *
 * WHAT THIS IS, AS THE GAP: it is not a frame and must not be read as one. Every judgement about
 * how the face looks in the game belongs to a real capture; this answers only "did the paint land
 * where the tool says it did".
 */
if (process.argv.includes('--sheet')) {
  const SW = 560, SH = 560, S = 0.30;                   // half-extent of the view box, metres
  const CX = 0, CY = -0.07, CZ = 1.62;                  // head centre in asset space
  const parts = [];
  scene.traverse((o) => { if (o.isMesh && /head|eyeball/.test(o.name)) parts.push(o); });
  const eyeTex = readPNG(path.join(ROOT, 'src/assets/sly-dl/sly_eyeball.png'));
  const srcRgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    srcRgb[i * 3] = src.data[i * CH]; srcRgb[i * 3 + 1] = src.data[i * CH + 1]; srcRgb[i * 3 + 2] = src.data[i * CH + 2];
  }
  const sample = (buf, bw, bh, bch, u, v) => {
    const x = Math.min(bw - 1, Math.max(0, Math.round(u * bw - 0.5)));
    const y = Math.min(bh - 1, Math.max(0, Math.round((1 - v) * bh - 0.5)));
    const k = (y * bw + x) * bch;
    return [buf[k], buf[k + 1], buf[k + 2]];
  };
  const view = (headBuf, angDeg) => {
    const a = angDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const img = new Uint8Array(SW * SH * 3).fill(238);
    const zb = new Float32Array(SW * SH).fill(-1e9);
    for (const m of parts) {
      const isHead = /head/.test(m.name);
      const g = m.geometry, pos = g.attributes.position, uv = g.attributes.uv;
      for (let t = 0; t < pos.count / 3; t++) {
        const P = [], C = [];
        for (let k = 0; k < 3; k++) {
          const i = t * 3 + k;
          const x = pos.getX(i) - CX, y = pos.getY(i) - CY, z = pos.getZ(i) - CZ;
          P.push([((x * ca - y * sa) / S * 0.5 + 0.5) * SW, (0.5 - z / S * 0.5) * SH, -(x * sa + y * ca)]);
          C.push(isHead ? sample(headBuf, W, H, 3, uv.getX(i), uv.getY(i))
            : sample(eyeTex.data, eyeTex.w, eyeTex.h, eyeTex.ch, uv.getX(i), uv.getY(i)));
        }
        const det = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
        if (Math.abs(det) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
        const x1 = Math.min(SW - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
        const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
        const y1 = Math.min(SH - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w1 = ((px - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (py - P[0][1])) / det;
          const w2 = ((P[1][0] - P[0][0]) * (py - P[0][1]) - (px - P[0][0]) * (P[1][1] - P[0][1])) / det;
          const w0 = 1 - w1 - w2;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const zz = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
          const o = y * SW + x;
          if (zz <= zb[o]) continue;
          zb[o] = zz;
          for (let c = 0; c < 3; c++) img[o * 3 + c] = Math.round(w0 * C[0][c] + w1 * C[1][c] + w2 * C[2][c]);
        }
      }
    }
    return img;
  };
  const views = [0, 35];
  const cols = views.length * 2, GW = SW * cols, GH = SH;
  const sheet = Buffer.alloc(GW * GH * 3, 238);
  const blit = (img, col) => {
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const s2 = (y * SW + x) * 3, d2 = (y * GW + (col * SW + x)) * 3;
      sheet[d2] = img[s2]; sheet[d2 + 1] = img[s2 + 1]; sheet[d2 + 2] = img[s2 + 2];
    }
  };
  views.forEach((v, i) => { blit(view(srcRgb, v), i * 2); blit(view(rgb, v), i * 2 + 1); });
  const sheetPath = path.join(ROOT, 'progress/records/AB-slyface.png');
  writePNG(sheetPath, GW, GH, sheet);
  console.log(`  wrote ${path.relative(ROOT, sheetPath)}  (supplied | derived, at 0 and 35 degrees; flat albedo, no shading)`);
}

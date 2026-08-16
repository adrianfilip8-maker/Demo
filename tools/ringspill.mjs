#!/usr/bin/env node
/**
 * ringspill.mjs — the ring darkens 521,510 px and 4 m does not explain it. This is what does.
 *
 *   node tools/ringspill.mjs [shots/fxrim3-impact] [impact]
 *
 * Takes no capture lock and boots no browser. Scores PNGs `tools/fxrim.mjs` already wrote.
 *
 * ── The question, and why the obvious answer was not taken on trust ──────────────────────────
 * §404.4 registered "even a 4 m flat quad does not account for that extent" as unexplained.
 * §405 found the quad is 4.035 m rather than the 1.50 m everything read, which closed most of
 * the gap, and §407.4 recorded what is left: `A-ship − P-noring` puts the ring's light at
 * x 0..1272, rows 216..719 while a 4.035 m disc projects to x 112..1168, rows 249..822. The
 * standing hypothesis was BLOOM — "the quad plus bloom spill, an effective ~5 m radius".
 *
 * Bloom is the obvious candidate and this project has been wrong with obvious candidates
 * repeatedly, so it is not argued from plausibility here. It is DEFEATED and re-measured:
 * `fxrim`'s `G-nobloom` / `PG-noring-nobloom` pair is the same ring difference with
 * `postfx.tune.bloomIntensity = 0`, which zeroes the one line that adds the pyramid to the
 * composite (`PostFX.js`: `scene += texture2D(uBloom,vUv).rgb * uBloomIntensity`). Two arms,
 * both real, prediction stated for each before the capture:
 *
 *   if bloom is the spill   G − PG collapses onto the drawn sprite, ±FXAA
 *   if it is not            G − PG keeps the reach, and the residue is the finding
 *
 * ── And the model it is compared against is the DRAWN sprite, not a disc of radius sz ────────
 * Every extent quoted for this ring so far has been a circle of radius `sz`. The thing on the
 * floor is neither a circle nor of radius `sz`:
 *
 *   1. It is a SQUARE quad, world-axis-aligned. `PARTICLE_VERT`'s PLANAR branch builds its
 *      basis as `t1 = cross(n, X)`, `t2 = cross(n, t1)`, which for a ground ring is world −Z
 *      and −X. The camera for `impact` looks down (−1,0,−1)/√2 — straight at a corner — so the
 *      quad's screen extremes ARE its corners, at `sz*√2`, not its edges at `sz`.
 *   2. The atlas window is a live term nobody has converted. `vUv = tile*0.25 + 0.02 + uv*0.21`
 *      maps the quad's uv [0,1] onto the tile's [0.08, 0.92] — so the quad's EDGE samples the
 *      painter at |U| = 0.8904, not at 1.0, and a painter radius r lands at world r*sz/0.8904.
 *      `ringPainter`'s outer alpha edge (`edge + 0.03`, angularly wobbled) therefore falls
 *      between 3.89 and 4.44 m, ABOVE the 4.035 m everything quotes, in most directions — and
 *      the quad clips it back to 4.035 near the four axis directions.
 *
 * So the model here is per-pixel: intersect each pixel's ray with the sprite's own plane, take
 * the quad coordinates, and sample the SHIPPED atlas — `buildAtlas` is imported and run, not
 * re-implemented — against `PARTICLE_FRAG`'s own discard. Nothing is fitted.
 */
import { readPNG } from './png.mjs';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { W, H, camFor } from './framelib.mjs';
import { SHOTS } from '../src/core/Shots.js';

/* buildAtlas paints into a canvas; give it one that keeps the ImageData. */
let CAPTURED = null;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      width: 1, height: 1,
      getContext: () => ({
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img) => { CAPTURED = img; },
      }),
    }),
  };
}
const { buildAtlas, EMITTERS, TILE } = await import('../src/fx/Emitters.js');

const DIR = process.argv[2] || 'shots/fxrim3-impact';
const SHOT = process.argv[3] || 'impact';
const arm = (t) => `${DIR}/${SHOT}-${t}.png`;

/* ── the arms, and what each pair is ─────────────────────────────────────────────────────── */
const PAIRS = [
  { name: 'bloom ON  (shipped)', a: 'A-ship', b: 'P-noring' },
  { name: 'bloom OFF (defeated)', a: 'G-nobloom', b: 'PG-noring-nobloom' },
];
/* `--model` prints the sprite half only. That half needs no capture and no lock, and keeping it
   runnable on its own is what let the prediction below be written down BEFORE the arms existed
   rather than after they were read. */
const MODEL_ONLY = process.argv.includes('--model');
if (!MODEL_ONLY) {
  for (const p of PAIRS) for (const t of [p.a, p.b]) {
    if (!existsSync(arm(t))) { console.error(`missing arm ${t} — ${arm(t)}  (or pass --model)`); process.exit(2); }
  }
}
const meta = existsSync(`${DIR}/arms.json`) ? JSON.parse(readFileSync(`${DIR}/arms.json`, 'utf8')) : null;

console.log(`ringspill · ${DIR} · shot ${SHOT} · ${W}x${H}`);
if (meta?.tree) console.log(`captured from src ${meta.tree.src} (HEAD ${meta.tree.head}) at ${meta.at}`);
if (meta?.subject) console.log(`subject: ${JSON.stringify(meta.subject)}`);

/* §186 / §398: the arms carry their own tree stamps. A pair straddling an edit is not a pair. */
if (meta?.arms) {
  const trees = [...new Set(meta.arms.map((r) => r.tree?.src))];
  console.log(`arm trees: ${trees.join(', ')}${trees.length === 1 ? '  (homogeneous)' : '  !! THE SET STRADDLES AN EDIT'}`);
  for (const r of meta.arms) {
    console.log(`  ${r.arm.padEnd(20)} ${r.sha}  bloom ${r.applied.bloomIntensity}  batch ${r.applied.batchHidden ?? '-'}`
      + `  ring live ${r.applied.live?.ring ?? '?'}`);
  }
  /* The null control. Without it every mask below could be render noise. */
  const A = meta.arms.find((r) => r.arm === 'A-ship'), Z = meta.arms.find((r) => r.arm === 'Z-null');
  if (A && Z) {
    console.log(`\nNULL CONTROL  A-ship ${A.sha} vs Z-null ${Z.sha} — `
      + (A.sha === Z.sha ? 'IDENTICAL, the renderer is deterministic and every mask below is signal'
        : '!! DIFFERENT — two renders of one state disagree, and no mask below can be trusted'));
  } else console.log('\nNULL CONTROL  Z-null not in this run — no verdict on determinism');
}

const lum = (im) => {
  const o = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const j = i * im.ch;
    o[i] = 0.2126 * im.data[j] + 0.7152 * im.data[j + 1] + 0.0722 * im.data[j + 2];
  }
  return o;
};

/* ═══ THE MODEL: the sprite the GPU actually rasterises ═══════════════════════════════════ */
buildAtlas(512, 0x5c17c00);
const ATLAS = CAPTURED;
if (!ATLAS) { console.error('atlas not captured — the canvas shim did not take'); process.exit(2); }
const ASZ = ATLAS.width;

const E = EMITTERS.dive_ring;
const AGE = 0.088;                                   // STAGE_IMPACT
const SCALE = 1.25;                                  // TUNE.impactScale
const u = AGE / E.life[0];
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sz = (E.size[0] * SCALE) + ((E.size[1] * SCALE) - (E.size[0] * SCALE)) * Math.pow(u, E.sizeExp);
const vAlpha = E.alpha[0] * smoothstep(0, Math.max(E.fadeIn, 1e-3), u) * Math.pow(Math.max(1 - u, 0), E.fadeOut);
const T_MIN = 0.004 / vAlpha;                        // PARTICLE_FRAG: `if (a < 0.004) discard`

const tileX = TILE.RING % 4, tileY = Math.floor(TILE.RING / 4);
function texAlpha(cx, cy) {
  if (cx < -1 || cx > 1 || cy < -1 || cy > 1) return 0;
  const ax = (tileX * 0.25 + 0.02 + (cx + 1) * 0.5 * 0.21) * ASZ - 0.5;
  const ay = (tileY * 0.25 + 0.02 + (cy + 1) * 0.5 * 0.21) * ASZ - 0.5;
  const x0 = Math.floor(ax), y0 = Math.floor(ay), fx = ax - x0, fy = ay - y0;
  const at = (X, Y) => ATLAS.data[((Math.min(ASZ - 1, Math.max(0, Y))) * ASZ + Math.min(ASZ - 1, Math.max(0, X))) * 4 + 3] / 255;
  return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy)
       + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
}

const cam = camFor(SHOTS[SHOT]);
const P = new THREE.Vector3(0, 0.06, -8);            // _stageImpact: player y + 0.06
const n = new THREE.Vector3(0, 1, 1e-4).normalize(); // PARTICLE_VERT, aV0 = UP
const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
const t2 = new THREE.Vector3().crossVectors(n, t1);

/** Per-pixel: ray -> the sprite's plane -> quad coords -> the shipped atlas. */
const MODEL = new Float32Array(W * H);
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Vector3();
let modelPx = 0, quadPx = 0;
const QUAD = new Uint8Array(W * H);                  // the quad's raster, alpha ignored
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    _v.set(((x + 0.5) / W) * 2 - 1, -(((y + 0.5) / H) * 2 - 1), 0.5).unproject(cam);
    _d.copy(_v).sub(cam.position).normalize();
    const denom = _d.dot(n);
    if (Math.abs(denom) < 1e-9) continue;
    const t = _q.copy(P).sub(cam.position).dot(n) / denom;
    if (t <= 0) continue;                            // the plane is behind the lens here
    _q.copy(cam.position).addScaledVector(_d, t).sub(P);
    const cx = _q.dot(t1) / sz, cy = _q.dot(t2) / sz;
    if (cx < -1 || cx > 1 || cy < -1 || cy > 1) continue;
    QUAD[y * W + x] = 1; quadPx++;
    const a = texAlpha(cx, cy);
    if (a >= T_MIN) { MODEL[y * W + x] = a; modelPx++; }
  }
}
const bboxOf = (test) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n2 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!test(y * W + x)) continue;
    n2++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1, n: n2 };
};
const mb = bboxOf((i) => MODEL[i] > 0), qb = bboxOf((i) => QUAD[i]);
console.log(`\n── THE SPRITE, from the catalogue and the shipped atlas ────────────────────────`);
console.log(`dive_ring  u ${u.toFixed(4)}  sz ${sz.toFixed(4)} m (quad ${(2 * sz).toFixed(3)} m across, corners at ${(sz * Math.SQRT2).toFixed(3)} m)`);
console.log(`vCol.a ${vAlpha.toFixed(4)} · frag discards below texel alpha ${T_MIN.toFixed(5)}`);
console.log(`atlas window: quad uv [0,1] -> painter |U| <= 0.8904, so painter r -> world r * ${(sz / 0.8904).toFixed(4)} m`);
console.log(`  the QUAD's raster, in frame   x ${qb.x0}..${qb.x1}  rows ${qb.y0}..${qb.y1}   ${qb.n} px`);
console.log(`  the DRAWN alpha, in frame     x ${mb.x0}..${mb.x1}  rows ${mb.y0}..${mb.y1}   ${mb.n} px`);

/* The prediction, stated by the model and printed before any arm is opened. */
console.log(`\n   PREDICTION, before the arms are read:`);
console.log(`     if BLOOM is the spill, G−PG's lit bbox lands on x ${mb.x0}..${mb.x1} rows ${mb.y0}..${mb.y1} (±FXAA, ~2 px)`);
console.log(`     if it is not, G−PG keeps the reach and the residue is the finding`);
if (MODEL_ONLY) process.exit(0);

/* ═══ THE MEASUREMENT ═════════════════════════════════════════════════════════════════════ */
const CUTS = [2, 4, 8, 16, 32, 64];
const results = [];
for (const pair of PAIRS) {
  const LA = lum(readPNG(arm(pair.a))), LB = lum(readPNG(arm(pair.b)));
  const dL = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dL[i] = LA[i] - LB[i];
  console.log(`\n── ${pair.name}:  ${pair.a} − ${pair.b} ─────────────────────────────`);
  console.log(`   cut    changed px     bbox                        median dL   max dL`);
  let plateau = null;
  for (const c of CUTS) {
    const b = bboxOf((i) => Math.abs(dL[i]) > c);
    const vals = [];
    for (let i = 0; i < W * H; i++) if (Math.abs(dL[i]) > c) vals.push(dL[i]);
    vals.sort((a, z) => a - z);
    const med = vals.length ? vals[vals.length >> 1] : 0;
    const mx = vals.length ? vals[vals.length - 1] : 0;
    console.log(`   |dL|>${String(c).padEnd(3)} ${String(b.n).padStart(9)}     x ${String(b.x0).padStart(4)}..${String(b.x1).padEnd(4)} rows ${String(b.y0).padStart(3)}..${String(b.y1).padEnd(3)}   `
      + `${med.toFixed(1).padStart(9)} ${mx.toFixed(1).padStart(8)}`);
    if (c === 4) plateau = b;
  }

  /* ── the classification, which needs no threshold on the model side ──────────────────── */
  const CUT = 4;
  let inModel = 0, inQuadOnly = 0, outside = 0, total = 0;
  let ox0 = Infinity, ox1 = -Infinity, oy0 = Infinity, oy1 = -Infinity;
  for (let i = 0; i < W * H; i++) {
    if (Math.abs(dL[i]) <= CUT) continue;
    total++;
    if (MODEL[i] > 0) inModel++;
    else if (QUAD[i]) inQuadOnly++;
    else {
      outside++;
      const x = i % W, y = (i / W) | 0;
      if (x < ox0) ox0 = x; if (x > ox1) ox1 = x; if (y < oy0) oy0 = y; if (y > oy1) oy1 = y;
    }
  }
  console.log(`\n   where the changed pixels are, at |dL| > ${CUT} (${total} px):`);
  console.log(`     on the DRAWN sprite         ${String(inModel).padStart(7)}  ${(100 * inModel / total).toFixed(1)}%`);
  console.log(`     inside the quad, unlit tex  ${String(inQuadOnly).padStart(7)}  ${(100 * inQuadOnly / total).toFixed(1)}%`);
  console.log(`     OUTSIDE the quad entirely   ${String(outside).padStart(7)}  ${(100 * outside / total).toFixed(1)}%`
    + (outside ? `   x ${ox0}..${ox1} rows ${oy0}..${oy1}` : ''));
  results.push({ pair, dL, plateau, inModel, inQuadOnly, outside, total });
}

/* ═══ THE SPILL PROFILE: how far past the sprite, and how bright ═════════════════════════ */
/* Chamfer distance from the drawn sprite, in screen px. Two passes, 3-4 weights: exact enough
   at these radii and needs no kernel size chosen in advance. */
const DIST = new Int32Array(W * H).fill(1 << 28);
for (let i = 0; i < W * H; i++) if (MODEL[i] > 0) DIST[i] = 0;
const relax = (i, j, w) => { const v = DIST[j] + w; if (v < DIST[i]) DIST[i] = v; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (x > 0) relax(i, i - 1, 3);
  if (y > 0) relax(i, i - W, 3);
  if (x > 0 && y > 0) relax(i, i - W - 1, 4);
  if (x < W - 1 && y > 0) relax(i, i - W + 1, 4);
}
for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
  const i = y * W + x;
  if (x < W - 1) relax(i, i + 1, 3);
  if (y < H - 1) relax(i, i + W, 3);
  if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 4);
  if (x > 0 && y < H - 1) relax(i, i + W - 1, 4);
}

console.log(`\n── HOW FAR THE LIGHT REACHES PAST THE DRAWN SPRITE ─────────────────────────────`);
console.log(`   (chamfer distance in px from the nearest lit texel of the sprite itself)\n`);
const BANDS = [[1, 8], [8, 16], [16, 32], [32, 64], [64, 128], [128, 256], [256, 1e9]];
console.log(`   px past      ${PAIRS.map((p) => (p.name.includes('ON') ? '   bloom ON' : '  bloom OFF')).join('')}`);
for (const [lo, hi] of BANDS) {
  const cells = results.map((r) => {
    let n2 = 0, sum = 0;
    for (let i = 0; i < W * H; i++) {
      const d = DIST[i] / 3;
      if (d < lo || d >= hi) continue;
      if (Math.abs(r.dL[i]) > 4) { n2++; sum += r.dL[i]; }
    }
    return { n: n2, mean: n2 ? sum / n2 : 0 };
  });
  console.log(`   ${String(lo).padStart(4)}..${hi > 1e8 ? '  +' : String(hi).padStart(3)}   `
    + cells.map((c) => `${String(c.n).padStart(8)} px ${c.mean.toFixed(1).padStart(6)} L`).join('  '));
}

const [ON, OFF] = results;
console.log(`\n── VERDICT ─────────────────────────────────────────────────────────────────────`);
console.log(`   the ring's light, bloom ON   ${ON.total} px   outside its own quad: ${ON.outside}`);
console.log(`   the ring's light, bloom OFF  ${OFF.total} px   outside its own quad: ${OFF.outside}`);
const share = ON.total ? (1 - OFF.total / ON.total) : 0;
console.log(`   bloom accounts for ${(share * 100).toFixed(1)}% of the lit pixel count`);
console.log(`   bloom accounts for ${ON.outside ? (100 * (1 - OFF.outside / ON.outside)).toFixed(1) : '—'}% of the light OUTSIDE the quad`);

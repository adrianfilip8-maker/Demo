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
 *
 * ── RESULT, and the hypothesis it kills ─────────────────────────────────────────────────────
 * **Bloom contributes nothing.** `(A − P) − (G − PG)` is exactly zero at all 921,600 pixels and
 * in all three channels — not close, identical. The reason is visible in the arms: the WHOLE
 * bloom pass moves 11 px of this frame, at x 44..51 rows 11..20, and its contribution is the
 * same with the ring and without it (0 px differ). At `bloomThreshold 2.20 / knee 0.30` the
 * feed onset is 1.90 scene, and at this shot's tod 0.78 nothing on the floor reaches it. The
 * ring's own additive radiance is ~0.14 at its brightest. It never enters the pyramid.
 *
 * So §407.4's "the quad plus bloom spill — an effective ~5 m radius" is false in its second
 * half, and the light that reaches past the model is not postfx at all: with `chroma` at 0.0
 * and bloom defeated, FXAA's ~2 px is the only spatial pass left, and the reach is 64 px.
 *
 * ── AND THE RESIDUE IS A SIZE, NOT A HALO, WHICH IS A DIFFERENT KIND OF ANSWER ───────────────
 * The per-azimuth boundary is the measurement a bbox cannot give. Against the CATALOGUE sprite
 * the measured boundary ran 1.115x too far (median over the 12 azimuths whose rays stay in
 * frame), with light 0.5 m outside the quad's own geometry at azimuth 0 and 90 — and a halo
 * cannot do that. `tools/ringprobe.mjs` then read the attributes the GPU was handed, and the
 * catalogue is not what is drawn, for three reasons none of which is postfx:
 *
 *   1. `_emit`: `const s = R.range(0.8, 1.25) * scale`. A PER-PARTICLE random size factor. The
 *      drawn `sz` is a RANDOM VARIABLE on [3.228, 5.043] m. This capture drew factors 1.0744
 *      and 0.9707, for sz 4.335 m and 3.917 m.
 *
 *      CORRECTION to this file's own first telling of it (f40e51d called 4.035 the midpoint of
 *      that range, and it is not — the midpoint and the mean are both 4.135). 4.035 m is the
 *      value at a jitter factor of EXACTLY 1.0, which is the 44th percentile of one draw: it
 *      is what you get by leaving the jitter out, which is precisely how it was derived. With
 *      two particles the expected WIDEST is 4.438 m. Fixed forward per §314, and it is the
 *      §407.2 rule turned on my own commit message: a claim about a number gets checked.
 *   2. TWO live `dive_ring` instances against `count: [1, 1]` — same birth, same life, same
 *      point, independent size draws. What is on the floor is the UNION, so its outer edge is
 *      a MAX of two draws rather than one.
 *   3. `p = aP0 + aV0 * dc` in PARTICLE_VERT, where `aV0` holds the PLANE NORMAL for PLANAR
 *      sprites (`_emit`'s own comment says so) and drag 0 makes `dc = age`. The ground ring
 *      floats 0.088 m above the ground.
 *
 * With those read rather than derived, the model reproduces the frame:
 *
 *   468,482 of 468,589 lit px  (100.0%) land on the drawn sprite
 *             1 px  inside the quad on transparent texture
 *           106 px  (0.02%) outside the quad at all — FXAA's ~2 px, and the only postfx left
 *   per azimuth, measured / model:  min 0.977  median 0.987  max 1.002
 *
 * The measurement sits a hair INSIDE the model, which is the right side: the model's boundary
 * is `PARTICLE_FRAG`'s discard at texel alpha 0.0042, and a fragment that faint moves the
 * composite by less than the 4 L the mask needs. Nothing is left over.
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

  /* THE LEVER CONTROL, and the whole comparison is void without it. `G−PG` collapsing onto the
     sprite proves "bloom was the spill" only if bloom was ON in the other pair — a
     `bloomIntensity` lever that did nothing would produce the identical collapse and would be
     read as a confirmation. §211.1's shape: an inert lever and a null result look the same.
     So the bloom arms are required to DIFFER from the shipped ones, and it is asserted from
     the shas rather than assumed from the uniform. */
  const G = meta.arms.find((r) => r.arm === 'G-nobloom');
  if (A && G) {
    console.log(`LEVER CONTROL A-ship ${A.sha} vs G-nobloom ${G.sha} — `
      + (A.sha !== G.sha ? 'DIFFERENT, bloomIntensity = 0 changed the frame and the lever is live'
        : '!! IDENTICAL — the bloom lever did nothing, and no verdict below about bloom is supported'));
  } else console.log('LEVER CONTROL G-nobloom not in this run — no verdict on the bloom lever');
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
/* The CATALOGUE size — what §405, §407, `impactframe` and `Particles.js`'s own comment all
   quote. Kept so the measured one can be printed against it, never used as the model. */
const szCat = (E.size[0] * SCALE) + ((E.size[1] * SCALE) - (E.size[0] * SCALE)) * Math.pow(u, E.sizeExp);
const vAlpha = E.alpha[0] * smoothstep(0, Math.max(E.fadeIn, 1e-3), u) * Math.pow(Math.max(1 - u, 0), E.fadeOut);
const T_MIN = 0.004 / vAlpha;                        // PARTICLE_FRAG: `if (a < 0.004) discard`

/**
 * ── THE INSTANCES, READ OFF THE BUFFERS RATHER THAN DERIVED ─────────────────────────────────
 * `shots/ringprobe-<shot>/probe.json` is `tools/ringprobe.mjs`'s read of the attributes the GPU
 * was handed. Three terms live in there that no derivation of this sprite has ever carried:
 *
 *   1. `_emit`: `const s = R.range(0.8, 1.25) * scale` — a PER-PARTICLE random size factor. The
 *      catalogue's `size` is not the drawn ramp; it is the drawn ramp's expectation over a
 *      1.5625x-wide uniform draw. `sz` is therefore a RANDOM VARIABLE on [0.8, 1.25] x scale,
 *      not a constant, and every "the ring is 4.035 m" in this repo is its midpoint.
 *   2. There are TWO live `dive_ring` instances against `count: [1, 1]`, both born at −0.088 s
 *      at the same point, with independently drawn size factors. What is on the floor is the
 *      UNION of two rings, so the visible extent is a MAX of two draws, not one.
 *   3. `p = aP0 + aV0 * dc` in PARTICLE_VERT, with `aV0` holding the PLANE NORMAL for PLANAR
 *      sprites — `_emit`'s own comment says so. dive_ring has drag 0, so `dc = age`, and the
 *      ring floats `age` metres along its own normal: 0.088 m above the floor it is a decal on.
 *
 * With no probe on disk the model falls back to the catalogue and says so. It cannot silently
 * become a derivation again.
 */
const probePath = `shots/ringprobe-${SHOT}/probe.json`;
const probe = existsSync(probePath) ? JSON.parse(readFileSync(probePath, 'utf8')) : null;
const INSTANCES = [];
if (probe?.batches?.ring?.rows?.length) {
  const uT = probe.batches.ring.uTime, uS = probe.batches.ring.uSizeScale;
  for (const r of probe.batches.ring.rows) {
    const age = uT - r.birth, uu = age / Math.max(r.life, 1e-4);
    if (age < 0 || uu >= 1) continue;
    INSTANCES.push({
      i: r.i, age, u: uu,
      sz: (r.size0 + (r.size1 - r.size0) * Math.pow(uu, r.sizeExp)) * uS,
      p: r.p, ramp: [r.size0, r.size1],
    });
  }
}
const FROM_PROBE = INSTANCES.length > 0;
if (!FROM_PROBE) INSTANCES.push({ i: 0, age: AGE, u, sz: szCat, p: [0, 0.06, -8], ramp: [E.size[0] * SCALE, E.size[1] * SCALE] });
const sz = Math.max(...INSTANCES.map((s) => s.sz));  // the widest live ring — the outer boundary

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
const n = new THREE.Vector3(0, 1, 1e-4).normalize(); // PARTICLE_VERT, aV0 = UP
const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
const t2 = new THREE.Vector3().crossVectors(n, t1);
/* `p = aP0 + aV0 * dc`, and for PLANAR `aV0` IS the normal. drag 0 -> dc = age. */
for (const s of INSTANCES) s.P = new THREE.Vector3(...s.p).addScaledVector(n, s.age);
const P = INSTANCES.reduce((a, b) => (b.sz > a.sz ? b : a)).P;   // the widest ring's plane

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
    /* Every live instance, at its own plane and its own half-extent. The batch draws them all
       and additive blending unions them, so the drawn footprint is the union, not any one. */
    let bestA = 0, inQuad = false;
    for (const s of INSTANCES) {
      const t = _q.copy(s.P).sub(cam.position).dot(n) / denom;
      if (t <= 0) continue;                          // this plane is behind the lens here
      _q.copy(cam.position).addScaledVector(_d, t).sub(s.P);
      const cx = _q.dot(t1) / s.sz, cy = _q.dot(t2) / s.sz;
      if (cx < -1 || cx > 1 || cy < -1 || cy > 1) continue;
      inQuad = true;
      const a = texAlpha(cx, cy);
      if (a > bestA) bestA = a;
    }
    if (!inQuad) continue;
    QUAD[y * W + x] = 1; quadPx++;
    if (bestA >= T_MIN) { MODEL[y * W + x] = bestA; modelPx++; }
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
console.log(`\n── THE SPRITE ──────────────────────────────────────────────────────────────────`);
console.log(`catalogue says  mix(${(E.size[0] * SCALE).toFixed(3)}, ${(E.size[1] * SCALE).toFixed(3)}, u^${E.sizeExp}) at u ${u.toFixed(4)}  =  sz ${szCat.toFixed(4)} m`);
console.log(`the buffers say ${FROM_PROBE ? `${INSTANCES.length} live instance(s), read from ${probePath}` : 'NO PROBE ON DISK — falling back to the catalogue, and this model is a derivation'}`);
for (const s of INSTANCES) {
  console.log(`   #${s.i}  ramp ${s.ramp[0].toFixed(3)}..${s.ramp[1].toFixed(3)}  ->  sz ${s.sz.toFixed(4)} m`
    + `   ${(s.sz / szCat).toFixed(4)}x the catalogue   plane y ${s.P.y.toFixed(4)} (staged ${s.p[1].toFixed(3)} + ${s.age.toFixed(3)} m of normal drift)`);
}
console.log(`widest live ring  sz ${sz.toFixed(4)} m (quad ${(2 * sz).toFixed(3)} m across, corners at ${(sz * Math.SQRT2).toFixed(3)} m)`);
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

/* ═══ THE OUTER BOUNDARY, AZIMUTH BY AZIMUTH, IN THE SPRITE'S OWN PLANE ══════════════════
 * A bbox cannot tell a disc from a square from two overlapping quads. This walks outward along
 * each azimuth in the sprite's plane and reports the last lit pixel, against what the model
 * says is drawn there. The quad's own limit is `sz / max(|cos|,|sin|)` — so if the measurement
 * is the quad, four flat chords appear at exactly `sz` in the axis directions and nowhere else,
 * and that is a shape no disc and no postfx halo can imitate.
 */
const [ON, OFF] = results;
console.log(`\n── THE LIT BOUNDARY PER AZIMUTH, unprojected onto the sprite's plane ───────────`);
console.log(`   (azimuth 0 = +t1 = world −Z; the quad's own limit is sz/max(|cos|,|sin|))\n`);
console.log(`    az   model draws to   quad allows   MEASURED |dL|>4    measured/model`);
const _w = new THREE.Vector3();
const azRows = [];
for (let deg = 0; deg < 360; deg += 10) {
  const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const quadLimit = sz / Math.max(Math.abs(ca), Math.abs(sa));
  let modelR = 0, measR = 0, offEdge = false;
  for (let r = 0.05; r < 9.0; r += 0.01) {
    _w.copy(P).addScaledVector(t1, ca * r).addScaledVector(t2, sa * r);
    const v = _w.clone().project(cam);
    const px = Math.round((v.x * 0.5 + 0.5) * W), py = Math.round((-v.y * 0.5 + 0.5) * H);
    if (px < 0 || px >= W || py < 0 || py >= H) { offEdge = true; break; }
    if (r <= quadLimit && texAlpha(ca * r / sz, sa * r / sz) >= T_MIN) modelR = r;
    if (Math.abs(ON.dL[py * W + px]) > 4) measR = r;
  }
  azRows.push({ deg, modelR, quadLimit, measR, offEdge });
  console.log(`   ${String(deg).padStart(3)}°   ${modelR.toFixed(3).padStart(9)} m   ${quadLimit.toFixed(3).padStart(9)} m   `
    + `${measR.toFixed(3).padStart(9)} m${offEdge ? ' (ran off frame)' : '          '}   `
    + `${modelR > 0 ? (measR / modelR).toFixed(3) : '—'}`);
}
const inFrame = azRows.filter((r) => !r.offEdge && r.modelR > 0);
if (inFrame.length) {
  const ratios = inFrame.map((r) => r.measR / r.modelR).sort((a, b) => a - b);
  console.log(`\n   of ${azRows.length} azimuths, ${inFrame.length} stay inside the frame all the way out.`);
  console.log(`   measured / model on those:  min ${ratios[0].toFixed(3)}  median ${ratios[ratios.length >> 1].toFixed(3)}  max ${ratios[ratios.length - 1].toFixed(3)}`);
  const chord = inFrame.filter((r) => Math.abs(r.measR - r.quadLimit) < 0.06);
  console.log(`   azimuths where the measured edge sits ON THE QUAD's limit (±0.06 m): ${chord.length} of ${inFrame.length}`
    + (chord.length ? `  — ${chord.map((r) => `${r.deg}°`).join(' ')}` : ''));
}

console.log(`\n── VERDICT ─────────────────────────────────────────────────────────────────────`);
console.log(`   the ring's light, bloom ON   ${ON.total} px   outside its own quad: ${ON.outside}`);
console.log(`   the ring's light, bloom OFF  ${OFF.total} px   outside its own quad: ${OFF.outside}`);
const share = ON.total ? (1 - OFF.total / ON.total) : 0;
console.log(`   bloom accounts for ${(share * 100).toFixed(1)}% of the lit pixel count`);
console.log(`   bloom accounts for ${ON.outside ? (100 * (1 - OFF.outside / ON.outside)).toFixed(1) : '—'}% of the light OUTSIDE the quad`);

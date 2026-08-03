/**
 * bloomcalc.mjs — offline attribution + knee-picking for the sly-closeup eye blow-out.
 *
 * TRANSFORMS THIS MODEL SKIPS vs the renderer (per KNOWN_ISSUES §11 rule — the suffix NOT
 * implemented): the AO multiply (assumed 1.0 on an unoccluded sclera / open wall), the
 * display-space silhouette rim and ink (absent on a sclera body away from silhouettes),
 * vignette (eyes near frame centre: ~1.0), FXAA (luma-preserving to ±1), grain (±2 display L,
 * static). Shadow term sh assumed 1 on the lit face. Everything else — bright-pass, pyramid
 * gain, exposure, lift, gain, split-tone, saturation, contrast pivot, AgX (exact matrices from
 * Common.js), sRGB encode — is transcribed from the live shaders and verified against the
 * shipped comment anchor (scene 2.0 -> display ~L188) before use.
 *
 * Parts:
 *   1. measure  — eye blobs / wall / cane hierarchy in shots/cap2/sly-closeup.png
 *   2. model    — grade+AgX forward map for grey and RGB; inverse by bisection
 *   3. scene    — sclera & gold scene-linear from the real Atmosphere + shader arithmetic
 *   4. pyramid  — 2D simulation of the real 13-tap down / tent-up chain on an eye-sized blob
 *   5. pick     — sweep (threshold, knee), report eye vs glint vs sun outcomes
 */
import { readPNG } from '/home/user/Demo/tools/png.mjs';

const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // display luma
const srgb2lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lin2srgb = (c) => { c = Math.max(c, 0); return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };

/* ---------- 1. measure the cap2 frame ---------- */
const im = readPNG('/home/user/Demo/shots/cap2/sly-closeup.png');
const W = im.w, H = im.h;
const at = (x, y) => { const i = (y * W + x) * im.ch; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };

function roiStats(x0, y0, x1, y1, pred) {
  const ls = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [r, g, b] = at(x, y);
    if (pred && !pred(r, g, b)) continue;
    ls.push(L(r, g, b));
  }
  ls.sort((a, b) => a - b);
  const q = (p) => ls.length ? ls[Math.min(ls.length - 1, Math.floor(p * ls.length))] : NaN;
  return { n: ls.length, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: ls[ls.length - 1] ?? NaN };
}

// find >=228 blobs in the head area
const headX0 = 540, headX1 = 780, headY0 = 100, headY1 = 260;
let blob = [];
for (let y = headY0; y < headY1; y++) for (let x = headX0; x < headX1; x++) {
  const [r, g, b] = at(x, y);
  if (L(r, g, b) >= 228) blob.push([x, y]);
}
// split by x midpoint of the two clusters
const xs = blob.map(p => p[0]).sort((a, b) => a - b);
const midX = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : 0;
const left = blob.filter(p => p[0] < midX), right = blob.filter(p => p[0] >= midX);
const box = (ps) => ps.length ? [Math.min(...ps.map(p => p[0])), Math.min(...ps.map(p => p[1])), Math.max(...ps.map(p => p[0])), Math.max(...ps.map(p => p[1]))] : null;
console.log('=== 1. cap2/sly-closeup measurements ===');
console.log(`>=L228 in head area: total ${blob.length}px  left ${left.length}px ${JSON.stringify(box(left))}  right ${right.length}px ${JSON.stringify(box(right))}`);
const lb = box(left), rb = box(right);
if (lb) console.log('left eye ROI stats  :', JSON.stringify(roiStats(lb[0], lb[1], lb[2] + 1, lb[3] + 1)));
if (rb) console.log('right eye ROI stats :', JSON.stringify(roiStats(rb[0], rb[1], rb[2] + 1, rb[3] + 1)));
// sample eye centre colour
if (rb) { const cx = (rb[0] + rb[2]) >> 1, cy = (rb[1] + rb[3]) >> 1; console.log(`right eye centre px (${cx},${cy}) = ${at(cx, cy)}`); }
// sunlit wall (right side orange wall) and gold cane crook
console.log('sunlit wall ROI (1000-1200,150-350):', JSON.stringify(roiStats(1000, 1200, 150, 350)));
// NOTE roiStats args are x0,y0,x1,y1 — fix call:
console.log('sunlit wall ROI corrected          :', JSON.stringify(roiStats(1000, 150, 1200, 350)));
console.log('cane crook ROI (470-580,190-300)   :', JSON.stringify(roiStats(470, 190, 580, 300)));
// halo profile: horizontal luma scan through right eye centre, out to +60px
if (rb) {
  const cy = (rb[1] + rb[3]) >> 1, cx = (rb[0] + rb[2]) >> 1;
  let prof = [];
  for (let dx = 0; dx <= 60; dx += 4) prof.push(`${dx}:${Math.round(L(...at(Math.min(W - 1, cx + dx), cy)))}`);
  console.log('luma profile rightward from right-eye centre:', prof.join(' '));
}

/* ---------- 2. the grade + AgX forward model ---------- */
// constants transcribed from PostFX.js TUNE + COMPOSITE_FRAG and Common.js GLSL_AGX
const EXPOSURE = 0.95, CONTRAST = 1.08, SATURATION = 1.30, PIVOT = 0.18;
const LIFT = [0.006, 0.004, 0.010], GAIN = [1.035, 1.0, 0.985];
const SPLIT_STRENGTH = 0.16, SPLIT_RANGE = [0.04, 0.24];
const hex2lin = (h) => [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
const SPLIT_SHADOW = hex2lin(0x2a3f66), SPLIT_HIGHLIGHT = hex2lin(0xffd9a0);
const luma3 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; // slyLuma assumed rec709

// AgX exact (column-major mats in GLSL -> rows here transposed)
const M = (a) => a; // helper no-op, matrices written as row-major apply below
const SRGB_TO_2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]];
const R2020_TO_SRGB = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];
const INSET = [[0.856627153315983, 0.0951212405381588, 0.0482516061458583], [0.137318972929847, 0.761241990602591, 0.101439036467562], [0.11189821299995, 0.0767994186031903, 0.811302368396859]];
const OUTSET = [[1.1271005818144368, -0.11060664309660323, -0.016493938717834573], [-0.1413297634984383, 1.157823702216272, -0.016493938717834257], [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]];
const mul = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
const agxContrast = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
function agx(c) {
  const minEv = -12.47393, maxEv = 4.026069;
  let v = mul(SRGB_TO_2020, c);
  v = mul(INSET, v);
  v = v.map(x => Math.max(x, 1e-10));
  v = v.map(x => Math.log2(x));
  v = v.map(x => Math.min(1, Math.max(0, (x - minEv) / (maxEv - minEv))));
  v = v.map(agxContrast);
  v = mul(OUTSET, v);
  v = v.map(x => Math.pow(Math.max(x, 0), 2.2));
  v = mul(R2020_TO_SRGB, v);
  return v.map(x => Math.min(1, Math.max(0, x)));
}

/** scene-linear RGB -> display RGB 0..255 through the composite (no AO, no rim/ink, vig=1). */
function grade(cIn) {
  let c = cIn.map((x, i) => x * EXPOSURE);
  c = c.map((x, i) => Math.max(0, x + LIFT[i] * (1 - x)));
  c = c.map((x, i) => x * GAIN[i]);
  const l = luma3(c);
  const t = Math.min(1, Math.max(0, (l - SPLIT_RANGE[0]) / (SPLIT_RANGE[1] - SPLIT_RANGE[0])));
  const s = t * t * (3 - 2 * t);
  let tone = [0, 1, 2].map(i => SPLIT_SHADOW[i] + (SPLIT_HIGHLIGHT[i] - SPLIT_SHADOW[i]) * s);
  const tl = luma3(tone); tone = tone.map(x => x / Math.max(1e-4, tl));
  c = c.map((x, i) => x + (x * tone[i] - x) * SPLIT_STRENGTH);
  c = c.map((x) => l + (x - l) * SATURATION);
  c = c.map((x) => PIVOT * Math.pow(Math.max(x, 1e-6) / PIVOT, CONTRAST));
  c = agx(c);
  c = c.map(lin2srgb);
  return c.map(x => x * 255);
}
const displayL = (c) => { const d = grade(c); return L(d[0], d[1], d[2]); };

console.log('\n=== 2. model validation against the shipped comment table ===');
for (const s of [0.02, 0.05, 0.08, 0.18, 0.35, 0.50, 0.72, 1.00, 2.00, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0]) {
  console.log(`grey scene ${s.toFixed(2)} -> display L ${displayL([s, s, s]).toFixed(1)}`);
}
// !! THE ROW BELOW IS RETRACTED — DO NOT VALIDATE AGAINST IT. Validate against the live row at
// !! `src/render/PostFX.js:524`. This transcription is stale, and it has already cost one run:
// !! KNOWN_ISSUES §70.3 records an instrument landing 39 L off because its expected values were
// !! taken from this comment rather than from source. §62.3 is the general form — a transcribed
// !! constant goes stale WITHOUT CHANGING, WITHOUT ERRORING, and without failing any self-check,
// !! because every check is internally consistent with the wrong number.
// !!
// !! This annotation was added once before and LOST when the container rolled back (§83), because
// !! this file lived only in an ephemeral scratchpad. That is why it is now tracked in
// !! progress/records/ — §83.3 rule 2: a measurement or a warning that lives only in a scratchpad
// !! is one container restart from not existing.
// comment says: 0.02->29 0.05->60 0.08->78 0.18->112 0.35->139 0.50->153 0.72->165 1.00->175 2.00->188

// inverse for grey by bisection
function sceneForL(target) {
  let lo = 1e-4, hi = 200;
  for (let i = 0; i < 80; i++) { const mid = Math.sqrt(lo * hi); (displayL([mid, mid, mid]) < target) ? lo = mid : hi = mid; }
  return Math.sqrt(lo * hi);
}
console.log(`\ninverse: display L191 = grey scene ${sceneForL(191).toFixed(3)}   L228 = ${sceneForL(228).toFixed(3)}   L236 = ${sceneForL(236).toFixed(3)}   L154 = ${sceneForL(154).toFixed(3)}`);

/* ---------- 3. real scene-linear values from the live modules ---------- */
console.log('\n=== 3. scene-linear sources (from Atmosphere + shader arithmetic) ===');
const { evalAtmosphere, createAtmosphereState } = await import('/home/user/Demo/src/render/Atmosphere.js');
const ST = createAtmosphereState();
for (const [name, tod] of [['sly-closeup', 0.80], ['hero', 0.79], ['night', 0.02], ['interior', 0.50]]) {
  const A = evalAtmosphere(tod, ST);
  console.log(`${name} tod ${tod}: keyColor ${A.keyColor.r.toFixed(3)},${A.keyColor.g.toFixed(3)},${A.keyColor.b.toFixed(3)}  keyIntensity ${A.keyIntensity.toFixed(3)}  ambI ${A.ambientIntensity?.toFixed(3)}`);
}
const A8 = evalAtmosphere(0.80, createAtmosphereState());
const keyBoost = 1.0; // Lighting.TUNE.keyBoost
const keyRad = [A8.keyColor.r, A8.keyColor.g, A8.keyColor.b].map(x => x * A8.keyIntensity * keyBoost);
// sclera albedo: PAL.eyeWhite #f7f3e6 as linear, x vertex tint 0.82 (linear multiplier)
const eyeWhite = [0xf7 / 255, 0xf3 / 255, 0xe6 / 255].map(srgb2lin);
const scleraAlb = eyeWhite.map(x => x * 0.82);
// hemispheric fill on a mostly-forward-facing eye: hemi(N.y~0.2) -> mix(bounce*gain, sky)
const hemiSky = A8.hemiSky, hemiGround = A8.hemiGround;
const ambI = A8.ambientIntensity * 1.0; // ambientBoost read below if != 1
const hemiT = (0.2 + 0.72) / (0.55 + 0.72); // smoothstep arg for N.y ~ 0.2 (approx, pre-smooth)
const hs = hemiT * hemiT * (3 - 2 * hemiT);
const fill = [0, 1, 2].map(i => ([hemiGround.r, hemiGround.g, hemiGround.b][i] * 1.0 * (1 - hs) + [hemiSky.r, hemiSky.g, hemiSky.b][i] * hs) * ambI);
// diff at full key (ramp 1, sh 1): alb*keyRad + alb*fill  (ao 1, no shadow terms)
const scleraScene = scleraAlb.map((a, i) => a * keyRad[i] + a * fill[i]);
console.log(`keyRad = ${keyRad.map(x => x.toFixed(3))}`);
console.log(`fill   = ${fill.map(x => x.toFixed(3))}  (ambientIntensity ${ambI?.toFixed(3)})`);
console.log(`sclera scene-linear (full key, ramp=1, sh=1) = ${scleraScene.map(x => x.toFixed(3))}  maxch ${Math.max(...scleraScene).toFixed(3)}`);
console.log(`sclera pre-bloom display L = ${displayL(scleraScene).toFixed(1)}`);

// gold glint: gold_leaf spec 0.95 gloss 110 metal 0.85, alb #e8b942-ish from palette mid
const goldAlb = hex2lin(0xe8b942);
const specColor = hex2lin(0xfffbe8);
const rgh = 0.25;
const specAmt = 0.95 * (1 - 0.75 * rgh) * (1 + (3.4 - 1) * 0.85);
const specStepMax = 1.0 + 0.35; // both smoothsteps saturated at lobe=1
const specTint = goldAlb.map((a, i) => a * 2.0 + specColor[i] * 0.25);
const goldSpec = specTint.map(t => t * specAmt * specStepMax);
// plus its own diffuse at metal: alb*keyRad*0.2*... small; report spec alone and with diff
const goldDiff = goldAlb.map((a, i) => a * keyRad[i] * (1 - 0.8 * 0.85));
const goldPeak = goldSpec.map((s, i) => s + goldDiff[i]);
console.log(`gold glint spec term  = ${goldSpec.map(x => x.toFixed(2))}  (+diff = ${goldPeak.map(x => x.toFixed(2))})  maxch ${Math.max(...goldPeak).toFixed(2)}`);
console.log(`gold glint display L  = ${displayL(goldPeak).toFixed(1)}`);

/* ---------- 4. bloom pyramid gain for an eye-sized blob ---------- */
console.log('\n=== 4. pyramid self-gain simulation (real kernels) ===');
// bright-pass on scene value s: w = max(soft, l-T)/l, soft = clamp(l-T+k,0,2k)^2/(4k)
const brightW = (l, T, k) => { const soft0 = Math.min(2 * k, Math.max(0, l - T + k)); const soft = soft0 * soft0 / (4 * k + 1e-5); return Math.max(soft, l - T) / Math.max(l, 1e-5); };

function simulateBloom(blobW, blobH, valPx) {
  // half-res mip0 640x360; blob at centre. valPx = bright-pass OUTPUT value (c*w).
  const mips = [];
  let w = 640, h = 360;
  // mip0: blob of valPx (already downsampled to half res: blob dims halved)
  let cur = new Float32Array(w * h);
  const bw = Math.max(1, Math.round(blobW / 2)), bh = Math.max(1, Math.round(blobH / 2));
  const cx = w >> 1, cy = h >> 1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const ex = (x - bw / 2 + 0.5) / (bw / 2), ey = (y - bh / 2 + 0.5) / (bh / 2);
    if (ex * ex + ey * ey <= 1) cur[(cy - (bh >> 1) + y) * w + (cx - (bw >> 1) + x)] = valPx;
  }
  mips.push({ w, h, data: cur });
  const sampleBil = (m, x, y) => { // bilinear, clamp
    x = Math.min(m.w - 1.001, Math.max(0, x)); y = Math.min(m.h - 1.001, Math.max(0, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const d = m.data, i = y0 * m.w + x0;
    return d[i] * (1 - fx) * (1 - fy) + d[i + 1] * fx * (1 - fy) + d[i + m.w] * (1 - fx) * fy + d[i + m.w + 1] * fx * fy;
  };
  // downsample chain: 13-tap
  for (let mi = 1; mi < 5; mi++) {
    const pw = mips[mi - 1].w, ph = mips[mi - 1].h;
    w = Math.max(2, pw >> 1); h = Math.max(2, ph >> 1);
    const dst = new Float32Array(w * h);
    const src = mips[mi - 1];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w * pw - 0.5, v = (y + 0.5) / h * ph - 0.5; // src px coords
      const t = 1; // texel in src px
      const g = (dx, dy) => sampleBil(src, u + dx, v + dy);
      let o = g(0, 0) * 0.125;
      o += (g(-2, 2) + g(2, 2) + g(-2, -2) + g(2, -2)) * 0.03125;
      o += (g(0, 2) + g(-2, 0) + g(2, 0) + g(0, -2)) * 0.0625;
      o += (g(-1, 1) + g(1, 1) + g(-1, -1) + g(1, -1)) * 0.125;
      dst[y * w + x] = o;
    }
    mips.push({ w, h, data: dst });
  }
  // upsample additive: for i = 4..1: mips[i-1] += tent(mips[i]) radius 1 (in dst texel units of src mip)
  for (let mi = 4; mi >= 1; mi--) {
    const src = mips[mi], dst = mips[mi - 1];
    for (let y = 0; y < dst.h; y++) for (let x = 0; x < dst.w; x++) {
      const u = (x + 0.5) / dst.w * src.w - 0.5, v = (y + 0.5) / dst.h * src.h - 0.5;
      const g = (dx, dy) => sampleBil(src, u + dx, v + dy);
      const o = (g(-1, 1) + g(1, 1) + g(-1, -1) + g(1, -1)) * 1 + (g(0, 1) + g(-1, 0) + g(1, 0) + g(0, -1)) * 2 + g(0, 0) * 4;
      dst.data[y * dst.w + x] += o / 16;
    }
  }
  // centre value of mip0 / valPx = self-gain factor
  const m0 = mips[0];
  const centre = m0.data[(m0.h >> 1) * m0.w + (m0.w >> 1)];
  // halo: value at edge+N px (full-res 2N)
  const halo10 = m0.data[(m0.h >> 1) * m0.w + (m0.w >> 1) + (bw >> 1) + 5];
  const halo25 = m0.data[(m0.h >> 1) * m0.w + (m0.w >> 1) + (bw >> 1) + 12];
  return { gain: centre / valPx, halo10: halo10 / valPx, halo25: halo25 / valPx };
}
// right eye blob ~ (rb) size in full-res px
const eyeW = rb ? rb[2] - rb[0] + 1 : 40, eyeH = rb ? rb[3] - rb[1] + 1 : 30;
const sim = simulateBloom(eyeW, eyeH, 1.0);
console.log(`eye blob ${eyeW}x${eyeH}px: pyramid self-gain at centre = ${sim.gain.toFixed(3)}  (halo at +10px ${sim.halo10.toFixed(3)}, +25px ${sim.halo25.toFixed(3)})`);
const simSun = simulateBloom(30, 30, 1.0);
console.log(`sun-disc-sized 30x30 blob: gain ${simSun.gain.toFixed(3)}`);
const simGlint = simulateBloom(8, 8, 1.0);
console.log(`glint-sized 8x8 blob: gain ${simGlint.gain.toFixed(3)}`);

/* ---------- 5. threshold/knee sweep ---------- */
console.log('\n=== 5. (threshold, knee) sweep ===');
const BLOOM_I = 0.50;
function withBloom(scene, T, k, pyrGain) {
  const l = Math.max(...scene);
  const w = brightW(l, T, k);
  const add = scene.map(c => c * w * pyrGain * BLOOM_I);
  return scene.map((c, i) => c + add[i]);
}
const sunScene = [26, 24, 20];
const scleraL = Math.max(...scleraScene);
const goldL = Math.max(...goldPeak);
console.log(`inputs: sclera maxch ${scleraL.toFixed(2)}  gold-glint maxch ${goldL.toFixed(2)}  sun 26`);
console.log('cfg              w(sclera) eyeL   w(gold) goldBloomAdd  w(sun)  | eye target <= wall p50+~0');
for (const [T, k] of [[1.55, 0.45], [2.0, 0.45], [2.2, 0.35], [2.4, 0.30], [2.6, 0.30], [2.8, 0.25], [3.0, 0.25], [3.2, 0.2]]) {
  const eye = withBloom(scleraScene, T, k, sim.gain);
  const wS = brightW(scleraL, T, k), wG = brightW(goldL, T, k), wSun = brightW(26, T, k);
  const goldAdd = goldL * wG * simGlint.gain * BLOOM_I;
  console.log(`T=${T.toFixed(2)} k=${k.toFixed(2)}   ${wS.toFixed(3)}   ${displayL(eye).toFixed(1)}   ${wG.toFixed(3)}  ${goldAdd.toFixed(2)}          ${wSun.toFixed(3)}`);
}

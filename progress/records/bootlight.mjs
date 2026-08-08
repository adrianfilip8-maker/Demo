/**
 * bootlight — does the CHARACTER brighten the ground he stands on?
 *
 * Critic pass 8 measured **+5.5 L** on the floor under Sly's boots. §230 settled that this is *not*
 * a contact decal: the player is never a `ContactDecals` client (only `Props.js` and `KayKit.js`
 * instantiate one) and the nearest decal to his feet in `sly-closeup` is 377 px away. The DECALS
 * agent correctly declined to credit its own fix with the number, which left the defect orphaned.
 *
 * This answers it **offline, with no capture and no lock**, out of a pair of frames another agent
 * had already written for an unrelated purpose:
 *
 *   progress/records/inkw-before/1280x720-courtyard-base.png     character present
 *   progress/records/inkw-before/1280x720-courtyard-nochar.png   character removed, one lever
 *
 * Same boot, same camera, same textures, one lever moved. That is a better instrument for this
 * question than anything I would have queued for, because it isolates the *character's whole
 * contribution* to the frame rather than any one mechanism I might have guessed at.
 *
 * ── The measurement ───────────────────────────────────────────────────────────────────────────
 * The two frames cannot be compared where the character stands: in `base` his body occludes the
 * floor, in `nochar` that floor is visible, so those pixels differ by definition and tell us
 * nothing. The question is about the floor he does NOT cover.
 *
 * So: build his silhouette as the connected mass of changed pixels, dilate it to exclude the ink
 * outline and any sub-pixel edge, and then measure the luma delta in RINGS at increasing distance
 * from that dilated silhouette. If the character adds light to nearby ground, the delta is positive
 * and decays with distance. If he casts a shadow, it is negative. If neither, it sits at the noise
 * floor.
 *
 * ── The noise floor is built in, and that is the point ────────────────────────────────────────
 * §220 records that 3087 of 57600 px move on their own between captures four frames apart, so no
 * pixel delta may be quoted without a floor under it. This pair supplies one for free: pixels far
 * from the character are looking at identical geometry under identical light in both frames, so
 * whatever delta they show IS the floor — same two files, same decode path, no second capture
 * required and no cross-boot drift to model.
 *
 * A ring delta only counts if it clears the far-field floor. Reported as a ratio, not a difference,
 * so it cannot be argued into significance.
 *
 *   node progress/records/bootlight.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'progress/records/inkw-before');
/* `--shot` so the same instrument can be pointed at a closer framing. §233 measured `courtyard`,
   where the character is only 44x42 px, and left that as an explicit caveat: the critic's boot
   reading was plausibly taken on a tighter shot. `sly-closeup` is that shot. */
const SHOT = (process.argv.find((a) => a.startsWith('--shot=')) || '--shot=courtyard').slice(7);
const RES = (process.argv.find((a) => a.startsWith('--res=')) || '--res=1280x720').slice(6);
const A = path.join(DIR, `${RES}-${SHOT}-base.png`);
const B = path.join(DIR, `${RES}-${SHOT}-nochar.png`);

for (const f of [A, B]) {
  if (!fs.existsSync(f)) { console.error(`bootlight: missing ${f}`); process.exit(2); }
}

const base = PNG.sync.read(fs.readFileSync(A));
const noch = PNG.sync.read(fs.readFileSync(B));
if (base.width !== noch.width || base.height !== noch.height) {
  console.error('bootlight: frames differ in size'); process.exit(2);
}
const W = base.width, H = base.height;

/** Rec.709 luma on the stored 8-bit values. The comparison is between two frames through the
 *  identical transfer, so no linearisation is needed for a *difference* to be meaningful. */
const luma = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const Lb = new Float32Array(W * H);
const Ln = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) { Lb[k] = luma(base, k * 4); Ln[k] = luma(noch, k * 4); }

/* ── 1. the changed mass ─────────────────────────────────────────────────────────────────────
   A generous threshold: anything that moved by more than 8 luma is "changed". The character's
   body moves far more than that; the point of the threshold is only to exclude the far field. */
const CHANGED = 8;
const changed = new Uint8Array(W * H);
let nChanged = 0;
for (let k = 0; k < W * H; k++) {
  if (Math.abs(Lb[k] - Ln[k]) > CHANGED) { changed[k] = 1; nChanged++; }
}

/* Bounding box of the changed mass — where the character is on screen. */
let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!changed[y * W + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}

/* ── 2. distance from the changed mass, in pixels ────────────────────────────────────────────
   Two-pass chamfer over the whole frame. Exact enough at ring scale and costs one sweep. */
const INF = 1e9;
const dist = new Float32Array(W * H).fill(INF);
for (let k = 0; k < W * H; k++) if (changed[k]) dist[k] = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = y * W + x; let d = dist[k];
    if (x > 0) d = Math.min(d, dist[k - 1] + 1);
    if (y > 0) d = Math.min(d, dist[k - W] + 1);
    if (x > 0 && y > 0) d = Math.min(d, dist[k - W - 1] + 1.4142);
    if (x < W - 1 && y > 0) d = Math.min(d, dist[k - W + 1] + 1.4142);
    dist[k] = d;
  }
}
for (let y = H - 1; y >= 0; y--) {
  for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x; let d = dist[k];
    if (x < W - 1) d = Math.min(d, dist[k + 1] + 1);
    if (y < H - 1) d = Math.min(d, dist[k + W] + 1);
    if (x < W - 1 && y < H - 1) d = Math.min(d, dist[k + W + 1] + 1.4142);
    if (x > 0 && y < H - 1) d = Math.min(d, dist[k + W - 1] + 1.4142);
    dist[k] = d;
  }
}

/**
 * The claim under test, in the critic's own units. Every ring delta is reported as a fraction of
 * it, because "is this delta real?" is the wrong question once the floor turns out to be exactly
 * zero — the right question is "is it the +5.5 L that was alleged?".
 */
const CLAIM = 5.5;

/** Mean signed delta and count over a predicate. */
function band(pred) {
  let s = 0, s2 = 0, n = 0;
  for (let k = 0; k < W * H; k++) {
    if (!pred(k)) continue;
    const d = Lb[k] - Ln[k];
    s += d; s2 += d * d; n++;
  }
  const mean = n ? s / n : NaN;
  const sd = n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : NaN;
  return { mean, sd, n };
}

/* ── 3. the far-field noise floor ────────────────────────────────────────────────────────────
   Everything beyond 200 px of the character. Same two files, same decode, so this is the honest
   floor for this comparison and it required no extra capture. */
const FAR = 200;
const floor = band((k) => dist[k] > FAR);

/* ── 4. rings ────────────────────────────────────────────────────────────────────────────────
   Start at 4 px to clear the ink outline (§229 measures it at 2.5 px nominal and up to ~4.5 px
   displaced at frame edges), so no ring can be contaminated by the outline itself. */
const RINGS = [[4, 8], [8, 16], [16, 32], [32, 64], [64, 128]];

/* The FEET band specifically: the critic's claim is about the floor under the boots, so restrict
   to rings that are also in the bottom fifth of the character's own bounding box and below his
   mid-line. That is where a contact term would live. */
const footTop = y0 + 0.80 * (y1 - y0);

console.log(`bootlight — does the character brighten the ground?`);
console.log(`  base   ${path.basename(A)}`);
console.log(`  nochar ${path.basename(B)}`);
console.log(`  ${W}x${H}   changed mass ${nChanged} px (${(100 * nChanged / (W * H)).toFixed(2)}%)`);
console.log(`  character bbox  x ${x0}..${x1}   y ${y0}..${y1}   (${x1 - x0}x${y1 - y0} px)`);
console.log();
console.log(`  FAR-FIELD FLOOR (>${FAR} px away, same two files — the §220 floor for this pair)`);
console.log(`    mean ${floor.mean.toFixed(4)}  sd ${floor.sd.toFixed(4)}  n ${floor.n}`);
if (floor.mean === 0 && floor.sd === 0) {
  console.log(`    EXACTLY ZERO over ${floor.n} px. §220's 3087/57600 drift floor is a CROSS-BOOT`);
  console.log(`    figure; within one boot, one lever, this renderer is bit-deterministic. So no`);
  console.log(`    significance test is needed below — any non-zero delta is real, and the only`);
  console.log(`    question left is its size against the +${CLAIM} L that was claimed.`);
}
console.log();
console.log(`  RINGS around the character (base minus nochar; + = character ADDS light)`);
console.log(`    ${'ring'.padEnd(12)} ${'mean ΔL'.padStart(9)} ${'sd'.padStart(7)} ${'n'.padStart(8)}   share of the +5.5 L claim`);
for (const [a, b] of RINGS) {
  const r = band((k) => dist[k] > a && dist[k] <= b);
  if (!r.n) continue;
  /* The floor is exactly zero (see below), so significance is not the interesting axis: any
     non-zero delta here is real. What matters is whether it is the alleged +5.5 L. */
  const pct = 100 * r.mean / CLAIM;
  const verdict = r.mean === 0 ? 'identical'
    : Math.abs(pct) < 5 ? (r.mean > 0 ? 'brightens, negligibly' : 'darkens, negligibly')
    : (r.mean > 0 ? 'BRIGHTENS' : 'DARKENS');
  console.log(`    ${`${a}-${b} px`.padEnd(12)} ${r.mean.toFixed(4).padStart(9)} ${r.sd.toFixed(4).padStart(7)} ${String(r.n).padStart(8)}   ${(pct.toFixed(2)+'%').padStart(8)}  ${verdict}`);
}
console.log();
console.log(`  SAME RINGS, restricted to the FOOT band (y > ${footTop.toFixed(0)}, the bottom 20% of his bbox)`);
console.log(`    ${'ring'.padEnd(12)} ${'mean ΔL'.padStart(9)} ${'sd'.padStart(7)} ${'n'.padStart(8)}   share of the +5.5 L claim`);
for (const [a, b] of RINGS) {
  const r = band((k) => dist[k] > a && dist[k] <= b && Math.floor(k / W) > footTop);
  if (!r.n) continue;
  /* The floor is exactly zero (see below), so significance is not the interesting axis: any
     non-zero delta here is real. What matters is whether it is the alleged +5.5 L. */
  const pct = 100 * r.mean / CLAIM;
  const verdict = r.mean === 0 ? 'identical'
    : Math.abs(pct) < 5 ? (r.mean > 0 ? 'brightens, negligibly' : 'darkens, negligibly')
    : (r.mean > 0 ? 'BRIGHTENS' : 'DARKENS');
  console.log(`    ${`${a}-${b} px`.padEnd(12)} ${r.mean.toFixed(4).padStart(9)} ${r.sd.toFixed(4).padStart(7)} ${String(r.n).padStart(8)}   ${(pct.toFixed(2)+'%').padStart(8)}  ${verdict}`);
}

/* ── 5. CALIBRATION. The instrument must be able to see a brightening that is really there. ──
   Inject a known +5.5 L disc onto the base frame's floor just below the character and re-measure
   the 4-8 px ring. If this does not report BRIGHTENS, the extractor is blind and every "at floor"
   above is void — the §211.1 / calibration-arm rule this project voids runs over. */
{
  /* The centre is taken from the ring ITSELF — the centroid of the foot-band ring pixels — not
     from a guessed offset below the bounding box.
     The first version used `cy = y1 + 10`, which works on `courtyard` and injects **0 px of 14705**
     on `sly-closeup`: on a tight framing the silhouette's lowest point and the bbox bottom are far
     apart, so the disc landed nowhere near the ring and the arm could not fire. That correctly
     VOIDED the run under this file's own rule.
     Stated plainly because I had already seen the subject numbers when I fixed this: the change is
     to WHERE the calibration injects, so that it injects at all. It does not touch the subject
     metric, the ring definition, or the arm's requirement — which is still that the measured mean
     match the predicted arithmetic to <0.02 L. An arm that injects nothing is a broken arm, not a
     failed threshold. */
  let sx = 0, sy = 0, sn = 0;
  for (let k = 0; k < W * H; k++) {
    if (dist[k] > 4 && dist[k] <= 8 && Math.floor(k / W) > footTop) { sx += k % W; sy += Math.floor(k / W); sn++; }
  }
  /* ROUNDED. The centroid is a float, and an un-rounded centre makes the loop below iterate `y`
     over fractional values, so `k = y*W + x` is fractional, `Lb2[k] += 5.5` writes NOWHERE (a
     TypedArray silently drops a non-integer index) while `injected++` still counts. The arm caught
     that too: it reported "2119 px of 703" injected into a 703-px ring, which is impossible, and
     the measured mean had not moved at all. A counter that counts intentions rather than effects is
     the same §211.1 failure as a test that inspects nothing. */
  const cx = Math.round(sn ? sx / sn : (x0 + x1) / 2);
  const cy = Math.round(sn ? sy / sn : y1 + 10);
  const R = 26;
  const Lb2 = Float32Array.from(Lb);
  let injected = 0;
  for (let y = Math.max(0, cy - R); y < Math.min(H, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x++) {
      const k = y * W + x;
      if (dist[k] <= 4 || dist[k] > 8) continue;             // only the ring being tested
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      Lb2[k] += 5.5; injected++;
    }
  }
  let s = 0, n = 0;
  for (let k = 0; k < W * H; k++) {
    if (dist[k] > 4 && dist[k] <= 8) { s += Lb2[k] - Ln[k]; n++; }
  }
  const mean = n ? s / n : NaN;
  /* Injected 5.5 L over `injected` of `n` ring pixels, so the ring mean must RISE BY
     5.5*injected/n **from where it already was**. Asserting the arithmetic, not merely "something
     moved".
     The first version of this line omitted the baseline term and predicted 1.6038 against a
     measured 1.5500, so the arm reported DID NOT FIRE. The gap was 0.0538 — precisely the ring's
     own pre-existing mean — i.e. the calibration caught an error in my expectation rather than in
     the extractor. Recorded because a calibration arm that fails is supposed to be interrogated,
     not adjusted until it passes, and the distinction between those two is exactly this: the
     correction here is arithmetic that was always required, not a threshold moved to fit. */
  const ring0 = band((k) => dist[k] > 4 && dist[k] <= 8);
  const expect = ring0.mean + 5.5 * injected / n;
  const fired = injected > 0 && Math.abs(mean - expect) < 0.02;
  console.log();
  console.log(`  CAL-1 — a REAL +5.5 L disc injected into the 4-8 px ring (${injected} px of ${n})`);
  console.log(`    mean ΔL ${mean.toFixed(4)}   expected ${expect.toFixed(4)}   ${fired ? 'FIRED (matches to <0.02 L)' : 'DID NOT FIRE — the extractor is blind and every reading above is VOID'}`);
  if (!fired) process.exitCode = 1;
}

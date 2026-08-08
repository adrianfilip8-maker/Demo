/**
 * celcyl — "does a lit cylinder split into plateaus?", answered on the SHIPPED frame with the
 * column geometry projected through the shipped camera. Offline, reads a PNG, TAKES NO LOCK.
 *
 * Why this file exists. Every previous attempt at the cylinder test eyeballed a rect
 * (RESULT-critic8: "x 950-1150", sd 10.6-26.6) and measured ink lines and silhouette edges
 * instead of a lit face. An eyeballed rect on a column cannot tell a terminator from an
 * outline, so those numbers describe the ink pass, not the ramp.
 *
 * This one never guesses a rect. It rebuilds the temple's nave columns from EgyptLevel's own
 * constants, projects them through `Shots.applyShot`'s exact camera, intersects a camera ray
 * with the real leaning, tapered, eight-lobed shaft for EVERY pixel of the scanline, and
 * therefore knows, per pixel, the surface normal and N.L. The prediction is made from geometry
 * before a single pixel is read.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * §228 — WHY THE FIRST RUN OF THIS FILE WAS VOID, AND WHAT REPLACED ITS CRITERION
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The first criterion was `plateaus >= 2 && maxStep > 20` for the positive control. It FAILED:
 *
 *     [calib-banded] plateaus 3, maxStep 15.62   -> FAIL   (three plateaus, 85.0 luma apart)
 *     [calib-smooth] plateaus 1, maxStep  1.12   -> PASS
 *
 * The positive control drew three clean plateaus separated by 85 luma and was still scored as
 * "cannot see banding", because `20` was authored rather than derived. `maxStep` is the wrong
 * statistic for this geometry and no threshold on it can be right: `TUNE.termSoft` is a
 * ±0.024 smoothstep, and on a cylinder N.L changes slowly, so even a PERFECT band boundary is
 * spread over several pixels and never produces one large per-pixel step. A statistic whose
 * value depends on how many pixels a terminator happens to be wide cannot answer "how many
 * tones does this surface take".
 *
 * Three further facts about this subject kill any criterion built on *where* a band lands:
 *
 *   1. RIBS. `Kit.papyrusColumn` lathes r(θ) = R·(1 + 0.075·cos 8θ) with ribScale 1 on every
 *      shaft row, and `computeVertexNormals()` overwrites the pushed cylinder normals with the
 *      lobed ones. The normal's azimuth therefore swings ±atan(8·0.075) = ±31° with a period of
 *      45°, i.e. ~98 px at this column's scale, and N.L swings ±0.45 with it. Predicting "the
 *      terminator is at x = 1162" is meaningless on a surface that crosses that terminator
 *      eight times.
 *   2. LEAN. The shaft drifts off plumb by `lean·y` (deterministic for the nave: −sx·(0.4 +
 *      NAVE_LEAN_IN[cz]·0.7) degrees) plus a `leanZ` jitter drawn from the level rng. At the
 *      measured height that is ~13 cm, ~11 px — several terminator widths of registration error.
 *   3. TAPER. dr/dy ≈ −0.049 at mid-shaft, so the true normal has n.y ≈ +0.049 and every N.L
 *      is offset by ~+0.027 — larger than `termSoft` itself.
 *
 * Ribs and taper are modelled below (both are deterministic — see the note at `shaftNormal`).
 * Lean's x-component is modelled; its z-component is level-rng and is not. What follows from
 * (2) alone is the design rule for the criterion:
 *
 *      THE STATISTIC MUST BE POSITION-FREE. It may use the SET of luma values on the face.
 *      It may not use WHERE they fall.
 *
 * ── THE CRITERION ────────────────────────────────────────────────────────────────────────
 * Statistic `gapFrac`: sort the face's luma profile, trim 2% off each tail, and report the sum
 * of the (bands−1) largest gaps between consecutive sorted values, as a fraction of the trimmed
 * range. In words: **how much of the tonal range this surface occupies is EMPTY.**
 *
 *   - a surface that takes k discrete tones puts its whole range into k−1 gaps  -> gapFrac -> 1
 *   - a continuously shaded surface spreads n samples evenly over the range     -> gapFrac -> ~(k−1)/n
 *   - it is invariant to sort order (so lean, rib phase and silhouette registration cannot
 *     enter), and to any affine change of luma (so exposure, albedo and tone-curve gain cannot
 *     enter either).
 *
 * The THRESHOLD is not authored. Both control arms are built on this face's own N.L sequence,
 * at the subject's own tonal range and its own measured noise, and they are the two ends of one
 * continuum:
 *
 *      profile(λ) = base + amp · [ (1−λ)·normalise(slyRamp(N.L)) + λ·normalise(clamp(N.L)) ]
 *
 * λ = 0 is the positive control (an ideal three-band cel ramp at the shipped TUNE), λ = 1 is the
 * negative control (ideal smooth Lambert), and λ is literally "what fraction of the shading
 * response is continuous". The decision point is **λ = 0.5** — the midpoint between the only two
 * references that exist. It is the one threshold that is equidistant from both arms, and it is
 * also exactly the art question: the critic's charge is "soft Lambert with a slight posterize",
 * which is the claim λ > 0.5.
 *
 * ── ARMS ─────────────────────────────────────────────────────────────────────────────────
 *   envelope      NO PNG. Sweeps the noise/range ratio and reports where the λ=0 and λ=1
 *                 ensembles stop separating. This is the instrument's operating envelope and
 *                 it can be run — and was run — before the subject was ever read.
 *   calib-banded  POSITIVE control, λ = 0. MUST-FIRE: its ensemble MINIMUM gapFrac must exceed
 *                 the λ=1 ensemble MAXIMUM. If the two ideal endpoints overlap, no threshold
 *                 between them exists and every subject number is meaningless.
 *   calib-smooth  NEGATIVE control, λ = 1. Same assertion, other end.
 *   well-posed    MUST-FIRE: G(0) > G(0.5) > G(1) on the ensemble medians, or λ̂ cannot be
 *                 inverted from gapFrac and the verdict is undefined.
 *   noise         DRIFT/NOISE FLOOR (§220). Re-runs the whole verdict on rows y−4..y+4 (sheared
 *                 along the column's own screen axis, so all nine rows sample the same azimuth).
 *                 The nine rows must agree on the verdict; if they do not, the answer is
 *                 INDETERMINATE, not "banded". This is an intra-frame floor and is NOT a
 *                 capture-to-capture drift floor: nothing here re-renders. A before/after across
 *                 two CAPTURES needs its own two-boot null arm.
 *   subject       the captured PNG.
 *
 * Run:
 *   node progress/records/celcyl.mjs --arm=envelope          (no PNG needed)
 *   node progress/records/celcyl.mjs --arm=all
 *   node progress/records/celcyl.mjs --arm=all --png=shots/celband/temple-after.png
 *
 * Exit code is 0 unless a MUST-FIRE assertion failed (2 = arms do not separate / not well-posed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { SHOTS } from '../../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../../src/render/Atmosphere.js';
import { TUNE } from '../../src/render/ToonMaterial.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));

const SHOT = argv.shot || 'temple';
const PNGPATH = path.resolve(ROOT, argv.png || `shots/r8/${SHOT}.png`);
const ARM = argv.arm || 'all';

/* ---------------------------------------------------------------------------
   1. The geometry, restated from EgyptLevel.hypostyleHall + Kit.papyrusColumn.

   Only the constants that are NOT drawn from the level rng are used, so nothing here
   depends on replaying the level's random stream:
     rBase 1.9  rTop 1.25   (literals, and rBase is a contract surface per EgyptLevel)
     placement y 0.35, x +-8, z -22/-30/-38/-46    (literals)
     rollR = rBase*0.20, y0 = 2*rollR              (Kit.papyrusColumn)
     r(t) = rBase + (rTop-rBase) * t^0.62,  t = (y-y0)/(hShaft-y0)
     lobes 8, rib 0.075, seg = lobes*6 = 48        (Kit.papyrusColumn defaults)
     lean  = -sx * (0.4 + NAVE_LEAN_IN[cz] * (sx<0 ? 1 : 0.7)) deg   (EgyptLevel, no rng)
   hShaft is 11.6 +- 0.25 of jitter; `--hshaft` sweeps it. Its effect on r at mid-shaft is
   under 5 mm (checked below and printed), i.e. a fifth of a pixel, so the silhouette this
   predicts is robust to the one jittered input.
--------------------------------------------------------------------------- */
const RBASE = 1.9, RTOP = 1.25, PLACE_Y = 0.35, HSHAFT = Number(argv.hshaft || 11.6);
const ROLLR = RBASE * 0.20, Y0 = ROLLR * 2;
const LOBES = 8, RIB = 0.075, SEG = LOBES * 6;   // shaft rows carry ribScale 1
const NAVE_LEAN_IN = { '-22': 0.55, '-30': 1.15, '-38': 1.75, '-46': 0.75 };

/** Shaft radius at a LOCAL height (metres above the column's own origin), lobe-free carrier. */
function shaftR(yLocal, hShaft = HSHAFT) {
  const t = Math.min(Math.max((yLocal - Y0) / (hShaft - Y0), 0), 1);
  return RBASE + (RTOP - RBASE) * Math.pow(t, 0.62);
}
/** d(radius)/d(height) of the carrier — the taper that gives the shaft normal its y component. */
function shaftDR(yLocal, hShaft = HSHAFT) {
  const h = 1e-4;
  return (shaftR(yLocal + h, hShaft) - shaftR(yLocal - h, hShaft)) / (2 * h);
}

const NAVE = [];
for (const cz of [-22, -30, -38, -46]) for (const sx of [-1, 1]) {
  NAVE.push({
    x: sx * 8, z: cz, kind: 'nave',
    lean: -sx * THREE.MathUtils.degToRad(0.4 + NAVE_LEAN_IN[String(cz)] * (sx < 0 ? 1 : 0.7)),
  });
}

/**
 * The shaft's true outward normal at world azimuth `theta`, on the lathed 48-gon.
 *
 * **The rib phase is NOT a free parameter, and that is worth stating because the caller that
 * supplies it believes otherwise.** `Kit.papyrusColumn` computes `a = j/seg·2π + spin` and then
 * uses THE SAME `a` for both the vertex azimuth and the lobe, `1 + rib·cos(a·lobes)`. The polar
 * curve it traces is therefore r(θ) = R·(1 + rib·cos(8θ)) with the crests welded to WORLD
 * azimuth 0, 45°, 90° … on every column in the level, whatever `spin` is. `spin` shifts only
 * which 48-gon vertex lands where inside a lobe — a sub-facet effect, swept here as `spinPhase`
 * because it is the one genuinely unknown input, and it is worth about ±2° of normal azimuth.
 *
 * Normals are taken the way `computeVertexNormals()` takes them — average the two adjacent
 * facet normals at a vertex, interpolate along the facet — rather than analytically, because
 * the 48-gon is what ships and 6 samples per lobe is not a fine approximation of a cosine.
 */
function shaftNormal(theta, yLocal, spinPhase = 0, hShaft = HSHAFT) {
  const dA = (Math.PI * 2) / SEG;
  const vAz = (j) => spinPhase + j * dA;
  const vR = (j) => 1 + RIB * Math.cos(vAz(j) * LOBES);
  const vP = (j) => { const a = vAz(j), r = vR(j); return [Math.cos(a) * r, Math.sin(a) * r]; };
  const eN = (j) => {
    const a = vP(j), b = vP(j + 1);
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(ty, tx) || 1;
    return [ty / l, -tx / l];
  };
  const vN = (j) => {
    const a = eN(j - 1), b = eN(j);
    const nx = a[0] + b[0], ny = a[1] + b[1];
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  };
  const u = (theta - spinPhase) / dA;
  const j = Math.floor(u), t = u - j;
  const n0 = vN(j), n1 = vN(j + 1);
  let nx = n0[0] * (1 - t) + n1[0] * t, nz = n0[1] * (1 - t) + n1[1] * t;
  const lh = Math.hypot(nx, nz) || 1;
  nx /= lh; nz /= lh;
  /* Taper: for a surface of revolution the outward normal is (n_r, -dr/dy, n_r) normalised. */
  const ny = -shaftDR(yLocal, hShaft);
  const l = Math.hypot(1, ny);
  return new THREE.Vector3((nx / l), ny / l, (nz / l));
}

/* ---------------------------------------------------------------------------
   2. The camera, exactly as Shots.applyShot builds it.
--------------------------------------------------------------------------- */
const W = Number(argv.w || 1280), H = Number(argv.h || 720);
const shot = SHOTS[SHOT];
if (!shot) { console.error(`no shot "${SHOT}"`); process.exit(2); }
const cam = new THREE.PerspectiveCamera(shot.fov ?? 50, W / H, 0.1, 2000);
cam.position.fromArray(shot.pos);
cam.up.set(0, 1, 0);
cam.lookAt(new THREE.Vector3().fromArray(shot.target));
if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
cam.updateProjectionMatrix();
cam.updateMatrixWorld(true);

const atmo = evalAtmosphere(shot.tod ?? 0.78, createAtmosphereState());
const L = atmo.keyDir.clone().normalize();   // points TOWARD the key, world space (toon.glsl uKeyDir)

/** world -> pixel. Returns null behind the camera. */
function project(p) {
  const v = p.clone().project(cam);
  if (v.z > 1) return null;
  return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H, ndc: v };
}

/** Camera ray through pixel centre (px, py), world space. */
function rayThrough(px, py) {
  const ndc = new THREE.Vector3(((px + 0.5) / W) * 2 - 1, 1 - ((py + 0.5) / H) * 2, 0.5);
  ndc.unproject(cam);
  return ndc.sub(cam.position).normalize();
}

/**
 * Intersect a camera ray with the leaning tapered shaft, iterating radius AND axis offset
 * against the hit height. Returns { p, n, ndl, theta } or null. `n` is the full lathed normal
 * (ribs + taper); `nCarrier` is the smooth cylinder's, kept only for the diagnostic print.
 */
function hitColumn(col, rd, hShaft = HSHAFT, spinPhase = 0) {
  const o = cam.position;
  let r = shaftR(6.0, hShaft);
  let cx = col.x, cz = col.z;
  let hit = null;
  for (let it = 0; it < 6; it++) {
    const ox = o.x - cx, oz = o.z - cz;
    const a = rd.x * rd.x + rd.z * rd.z;
    const b = 2 * (ox * rd.x + oz * rd.z);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t <= 0) return null;
    const p = o.clone().addScaledVector(rd, t);
    const yLocal = p.y - PLACE_Y;
    if (yLocal < Y0 || yLocal > hShaft) return null;
    const nr = shaftR(yLocal, hShaft);
    const ncx = col.x + (col.lean || 0) * yLocal, ncz = col.z;
    hit = { p, yLocal, t };
    const done = Math.abs(nr - r) < 1e-4 && Math.abs(ncx - cx) < 1e-4;
    r = nr; cx = ncx; cz = ncz;
    if (done) break;
  }
  if (!hit) return null;
  const theta = Math.atan2(hit.p.z - cz, hit.p.x - cx);
  const n = shaftNormal(theta, hit.yLocal, spinPhase, hShaft);
  const nCarrier = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const V = cam.position.clone().sub(hit.p).normalize();
  return {
    p: hit.p, n, nCarrier, ndl: n.dot(L), ndlCarrier: nCarrier.dot(L),
    ndv: Math.max(0, Math.min(1, n.dot(V))), theta, r,
  };
}

/* ---------------------------------------------------------------------------
   3. The ramp, restated from toon.glsl.js slyRamp/slyTerm at the shipped TUNE.
      Used by the control arms, so both endpoints are built from the same numbers the shader
      is built from and cannot drift away from them.
--------------------------------------------------------------------------- */
const smoothstep = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
function slyRamp(ndl, bands = TUNE.bands) {
  const steps = Math.max(Math.floor(bands + 0.5) - 1, 1);
  const x = Math.min(Math.max(ndl, 0), 1);
  let acc = 0;
  for (let k = 0; k < 5; k++) {
    if (k + 0.5 > steps) continue;
    const f = steps > 1 ? k / (steps - 1) : 0;
    const t = TUNE.termLo + (TUNE.termHi - TUNE.termLo) * f;
    acc += smoothstep(t - TUNE.termSoft, t + TUNE.termSoft, x);
  }
  return Math.min(Math.max(acc / steps, 0), 1);
}

/* ---------------------------------------------------------------------------
   4. Metrics on a 1-D luma profile.
--------------------------------------------------------------------------- */
const LUMA = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;   // Rec.709 on the 8-bit sRGB values
const BANDS = Math.max(Math.round(TUNE.bands), 2);
const TRIM = Number(argv.trim || 0.02);

/**
 * THE STATISTIC. Fraction of the occupied tonal range that is EMPTY, given that a cel surface
 * is allowed `BANDS` tones. Position-free by construction: it reads only the sorted multiset.
 */
function gapFrac(prof, bands = BANDS, trim = TRIM) {
  const q = [...prof].sort((a, b) => a - b);
  const n = q.length;
  const lo = Math.floor(trim * n), hi = n - 1 - Math.floor(trim * n);
  const range = q[hi] - q[lo];
  if (!(range > 1e-9) || hi - lo < bands) return { frac: 0, range, top: [] };
  const gaps = [];
  for (let i = lo; i < hi; i++) gaps.push({ g: q[i + 1] - q[i], at: (q[i] + q[i + 1]) / 2 });
  gaps.sort((a, b) => b.g - a.g);
  const top = gaps.slice(0, bands - 1);
  return { frac: top.reduce((a, b) => a + b.g, 0) / range, range, top };
}

/** Descriptive only — the plateau/gap structure the void run reported. Never a criterion. */
function metrics(prof, eps) {
  const n = prof.length;
  const steps = [];
  for (let i = 1; i < n; i++) steps.push(Math.abs(prof[i] - prof[i - 1]));
  const maxStep = steps.length ? Math.max(...steps) : 0;
  const mean = prof.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(prof.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const MINRUN = Number(argv.minrun || 6);
  const plats = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n) {
      const seg = prof.slice(i, j + 1);
      if (Math.max(...seg) - Math.min(...seg) > eps) break;
      j++;
    }
    const len = j - i;
    if (len >= MINRUN) {
      const seg = prof.slice(i, j);
      plats.push({ i0: i, i1: j - 1, len, level: seg.reduce((a, b) => a + b, 0) / len });
    }
    i = len >= MINRUN ? j : i + 1;
  }
  return { n, maxStep, mean, sd, plateaus: plats };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return pct(s, 0.5); };

/* ---------------------------------------------------------------------------
   5. Extraction.
--------------------------------------------------------------------------- */
function loadPNG(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  return { png, w: png.width, h: png.height };
}

/**
 * Everything about one column's lit face at one world height, computed from geometry alone.
 * `inset` drops the outermost `inset` fraction of the face at each silhouette so the inverted
 * hull ink shell (Outline.js, TUNE.inkPx) and the msaa resolve at the edge cannot enter — the
 * exact contamination that voided every previous run of this test. The lean is modelled, so the
 * inset only has to absorb the `leanZ` jitter, which is level-rng.
 *
 * `shear` is dx/dy of the column's own axis in screen space: the nine noise rows are stepped
 * along it, so all of them sample the SAME azimuth and the noise arm measures noise rather than
 * the column's screen tilt.
 */
function faceGeom(col, worldY, inset = Number(argv.inset || 0.10)) {
  const yl = worldY - PLACE_Y;
  const axis = new THREE.Vector3(col.x + (col.lean || 0) * yl, worldY, col.z);
  const pa = project(axis);
  if (!pa) return null;
  const row = Math.round(pa.y);
  if (row < 0 || row >= H) return null;

  const dY = 0.25;
  const pa2 = project(new THREE.Vector3(col.x + (col.lean || 0) * (yl + dY), worldY + dY, col.z));
  const shear = pa2 ? (pa2.x - pa.x) / (pa2.y - pa.y) : 0;

  /* Walk pixels outward from the axis until the ray misses the cylinder: that is the true
     silhouette in the image, found by intersection rather than by eye. */
  let xl = Math.round(pa.x), xr = Math.round(pa.x);
  if (!hitColumn(col, rayThrough(xl, row))) return null;
  while (xl > 0 && hitColumn(col, rayThrough(xl - 1, row))) xl--;
  while (xr < W - 1 && hitColumn(col, rayThrough(xr + 1, row))) xr++;
  const wpx = xr - xl + 1;
  const cut = Math.max(1, Math.round(wpx * inset));
  const x0 = xl + cut, x1 = xr - cut;
  if (x1 - x0 < 12) return null;

  const samples = [];
  for (let x = x0; x <= x1; x++) {
    const h = hitColumn(col, rayThrough(x, row));
    samples.push(h ? { x, ndl: h.ndl, ndlCarrier: h.ndlCarrier, ndv: h.ndv, theta: h.theta, yLocal: h.p.y - PLACE_Y, dist: h.p.distanceTo(cam.position), r: h.r } : null);
  }
  if (samples.some((s) => !s)) return null;
  return { col, row, xl, xr, x0, x1, wpx, samples, axisPx: pa, shear };
}

/** Re-evaluate the face's N.L for a different rib sampling phase (the one unknown input). */
function ndlAt(fg, spinPhase) {
  if (!spinPhase) return fg.samples.map((s) => s.ndl);
  return fg.samples.map((s) => shaftNormal(s.theta, s.yLocal, spinPhase).dot(L));
}

/**
 * `--predict=b` — a FORECAST, not a measurement, and it is labelled as one everywhere it prints.
 *
 * Multiplies the captured profile by the shade-side band term `1 - b*(1 - slyRamp(N.L))` that
 * `TUNE.shadeBand` introduces, so the criterion can be scored against a *simulated* fix before a
 * capture exists. Its two known biases both point the same way and are stated so the forecast is
 * falsifiable rather than elastic:
 *
 *   - it applies the multiply in DISPLAY luma, where the shader applies it in scene-linear
 *     before a compressive tone curve, so the real change will be SMALLER;
 *   - it multiplies the WHOLE pixel, where the shader multiplies only the three shade-side
 *     terms, so on any pixel carrying rim or spec the real change is again SMALLER.
 *
 * So this is an UPPER BOUND on what `shadeBand = b` can buy. A value that fails here cannot
 * succeed in frame.
 */
const PREDICT = Number(argv.predict || 0);

function readProfile(png, fg, dy = 0) {
  const prof = [];
  const row = fg.row + dy;
  const dx = Math.round((fg.shear || 0) * dy);
  for (let i = 0, x = fg.x0; x <= fg.x1; x++, i++) {
    const o = (row * png.width + (x + dx)) * 4;
    let v = LUMA(png.data[o], png.data[o + 1], png.data[o + 2]);
    if (PREDICT) v *= 1 - PREDICT * (1 - slyRamp(fg.samples[i].ndl));
    prof.push(v);
  }
  return prof;
}

/* ---------------------------------------------------------------------------
   6. The control continuum.

   profile(λ) = base + amp · [ (1−λ)·norm(slyRamp(N.L)) + λ·norm(clamp(N.L,0,1)) ] + noise(σ)

   Both endpoints are affine-normalised onto the SAME [0,1] over this face before they are
   mixed, so λ is a pure shape parameter and `amp` sets the tonal range for both alike. λ = 0 is
   the positive control, λ = 1 the negative control. Neither endpoint has a knob the other does
   not; the only inputs from the subject are `amp` and `σ`, which are applied identically to
   both and therefore cannot favour either.
--------------------------------------------------------------------------- */
/* `--quant=0` restores the float controls the criterion was originally registered with, so both
   readings stay reproducible from one file. Default 1 = the faithful, harder one. Declared ahead
   of `synth` rather than after it: it worked either way (nothing calls `synth` before the module
   body reaches this line) but a const in the TDZ of its only consumer is a footgun, not a design. */
const QUANT = argv.quant === undefined ? 1 : Number(argv.quant);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const norm01 = (v) => {
  const lo = Math.min(...v), hi = Math.max(...v);
  return hi - lo > 1e-9 ? v.map((x) => (x - lo) / (hi - lo)) : v.map(() => 0);
};

function synth(nl, lambda, amp, base, sigma, seed) {
  const b = norm01(nl.map((x) => slyRamp(x)));
  const s = norm01(nl.map((x) => Math.min(Math.max(x, 0), 1)));
  const rnd = mulberry32(seed);
  const out = new Array(nl.length);
  for (let i = 0; i < nl.length; i++) {
    /* Box-Muller, two uniforms per sample — deterministic for a given seed. */
    const u1 = Math.max(rnd(), 1e-9), u2 = rnd();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = base + amp * ((1 - lambda) * b[i] + lambda * s[i]) + sigma * g;
    /* 8-BIT, like the subject. Found by dry-running the scorer on a uniformly DARKENED copy of
       the capture: gapFrac moved 0.0795 -> 0.0986 under a change the statistic is supposed to be
       exactly invariant to. The cause was not the statistic — it was that rounding a compressed
       range to 8 bits merges neighbouring values and manufactures gaps of 1/scale luma, and the
       controls were float while the subject was quantised. Quantising the controls too closes
       that asymmetry.

       This was changed AFTER the base subject number was known, so it is worth being explicit
       about the direction: it can only RAISE the controls' gapFrac (a continuous ramp gains
       small quantisation gaps; an already-banded one does not), therefore only RAISE G(0.5),
       therefore only make "BANDS" HARDER to reach. It cannot manufacture the verdict it is
       being applied in service of, and the base arm's verdict is unchanged by it. */
    out[i] = QUANT ? Math.min(255, Math.max(0, Math.round(v))) : v;
  }
  return out;
}

const SPINS = 6, SEEDS = 6;
/** Ensemble of gapFrac over the two genuinely unknown inputs: rib sampling phase and noise. */
function ensemble(fg, lambda, amp, base, sigma) {
  const vals = [];
  for (let sp = 0; sp < SPINS; sp++) {
    const nl = ndlAt(fg, (sp / SPINS) * (Math.PI * 2) / SEG);
    for (let sd = 0; sd < SEEDS; sd++) {
      vals.push(gapFrac(synth(nl, lambda, amp, base, sigma, 1000 + sp * 97 + sd * 7919)).frac);
    }
  }
  vals.sort((a, b) => a - b);
  return { min: vals[0], max: vals[vals.length - 1], med: pct(vals, 0.5), n: vals.length };
}

/* ---------------------------------------------------------------------------
   7. Report
--------------------------------------------------------------------------- */
function banner(s) { console.log(`\n${'-'.repeat(78)}\n${s}\n${'-'.repeat(78)}`); }

function describeFace(fg) {
  const s = fg.samples;
  const nl = s.map((q) => q.ndl);
  const nlc = s.map((q) => q.ndlCarrier);
  const bandOf = (v) => (v < TUNE.termLo - TUNE.termSoft ? 0 : v > TUNE.termHi + TUNE.termSoft ? 2 : 1);
  const counts = [0, 0, 0];
  for (const v of nl) counts[bandOf(v)]++;
  let cross = 0;
  for (let i = 1; i < nl.length; i++) {
    for (const t of [TUNE.termLo, TUNE.termHi]) if ((nl[i - 1] - t) * (nl[i] - t) < 0) cross++;
  }
  console.log(`  column (x ${fg.col.x}, z ${fg.col.z})  scanline row ${fg.row}  `
    + `silhouette px ${fg.xl}..${fg.xr} (${fg.wpx} px)  measured px ${fg.x0}..${fg.x1}`);
  console.log(`  distance ${s[0].dist.toFixed(2)} m   carrier radius ${s[0].r.toFixed(3)} m   `
    + `lean ${(THREE.MathUtils.radToDeg(fg.col.lean || 0)).toFixed(3)} deg   axis screen shear ${fg.shear.toFixed(4)} px/px`);
  console.log(`  N.L over the measured face: lathed ${Math.min(...nl).toFixed(3)} .. ${Math.max(...nl).toFixed(3)}   `
    + `smooth carrier ${Math.min(...nlc).toFixed(3)} .. ${Math.max(...nlc).toFixed(3)}`);
  console.log(`  band occupancy (shadow/mid/lit px): ${counts[0]} / ${counts[1]} / ${counts[2]}   `
    + `terminator crossings on this face: ${cross}`);
  const soft = nl.filter((v) => Math.abs(v - TUNE.termLo) < TUNE.termSoft || Math.abs(v - TUNE.termHi) < TUNE.termSoft).length;
  console.log(`  px inside a +-termSoft window: ${soft} of ${nl.length} (${(100 * soft / nl.length).toFixed(1)}%)`
    + `  -> a perfectly banded face still spends that many px in transition, which is why maxStep`
    + ` cannot be the statistic (§228)`);
  return { cross };
}

/* ---------------------------------------------------------------------------
   Main
--------------------------------------------------------------------------- */
console.log(`celcyl — shot "${SHOT}"  png ${path.relative(ROOT, PNGPATH)}  ${W}x${H}`);
console.log(`key dir (world, toward light) ${L.x.toFixed(4)} ${L.y.toFixed(4)} ${L.z.toFixed(4)}  `
  + `elev ${(Math.asin(L.y) * 180 / Math.PI).toFixed(2)} deg`);
console.log(`ramp constants read from ToonMaterial.TUNE: bands ${TUNE.bands} termLo ${TUNE.termLo} `
  + `termHi ${TUNE.termHi} termSoft ${TUNE.termSoft}`);
console.log(`hShaft sensitivity: r(mid) at 11.35/11.60/11.85 = `
  + [11.35, 11.6, 11.85].map((h) => shaftR(6, h).toFixed(4)).join(' / ') + ' m');

banner('COLUMNS PROJECTED THROUGH THE SHIPPED CAMERA');
const inFrame = [];
for (const col of NAVE) {
  const mid = project(new THREE.Vector3(col.x, PLACE_Y + 6.0, col.z));
  const tag = `(x ${String(col.x).padStart(3)}, z ${col.z})`;
  if (!mid) { console.log(`  ${tag}  behind camera`); continue; }
  const on = mid.x >= 0 && mid.x < W && mid.y >= 0 && mid.y < H;
  const fg = on ? faceGeom(col, PLACE_Y + 6.0) : null;
  const nl = fg ? fg.samples.map((s) => s.ndl) : null;
  console.log(`  ${tag}  axis px (${mid.x.toFixed(0)}, ${mid.y.toFixed(0)})  ${on ? 'IN FRAME' : 'off frame'}`
    + (fg ? `  width ${fg.wpx} px  N.L ${Math.min(...nl).toFixed(2)}..${Math.max(...nl).toFixed(2)}` : ''));
  if (fg) inFrame.push({ col, fg });
}

/* Pick the column whose lit face carries the most REQUIRED terminator crossings, breaking ties
   by width. That is the strongest available test, chosen by geometry, not by eye. */
const crossCount = (fg) => {
  const nl = fg.samples.map((s) => s.ndl);
  let c = 0;
  for (let i = 1; i < nl.length; i++) for (const t of [TUNE.termLo, TUNE.termHi]) if ((nl[i - 1] - t) * (nl[i] - t) < 0) c++;
  return c;
};
const ranked = inFrame
  .map((e) => ({ ...e, cr: crossCount(e.fg) }))
  .sort((a, b) => (b.cr - a.cr) || (b.fg.wpx - a.fg.wpx));
if (!ranked.length) { console.log('\nNo nave column resolves a lit face in this shot. Nothing to measure.'); process.exit(0); }

const pick = Number(argv.col ?? 0);
const chosen = ranked[Math.min(pick, ranked.length - 1)];
const worldY = Number(argv.y || (PLACE_Y + 6.0));
const fg = faceGeom(chosen.col, worldY) || chosen.fg;

banner('SUBJECT FACE — chosen by crossing count, not by eye');
describeFace(fg);

let failed = 0;

/* ── ARM: envelope. No PNG. Where do the two ideal endpoints stop separating? ───────────── */
if (ARM === 'all' || ARM === 'envelope') {
  banner('ARM: envelope — the instrument\'s operating envelope (NO PNG READ)');
  console.log('  noise/range   gapFrac lam=0 (min..max)     gapFrac lam=1 (min..max)     separated?');
  let breakdown = null;
  for (const ratio of [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.20]) {
    const A = ensemble(fg, 0, 100, 0, ratio * 100);
    const B = ensemble(fg, 1, 100, 0, ratio * 100);
    const sep = A.min > B.max;
    if (!sep && breakdown === null) breakdown = ratio;
    console.log(`    ${ratio.toFixed(3)}      ${A.min.toFixed(3)}..${A.max.toFixed(3)} (med ${A.med.toFixed(3)})`
      + `      ${B.min.toFixed(3)}..${B.max.toFixed(3)} (med ${B.med.toFixed(3)})      ${sep ? 'YES' : 'no'}`);
  }
  console.log(`\n  breakdown noise/range ratio: ${breakdown === null ? '> 0.20 (never breaks down in this sweep)' : breakdown}`);
  console.log('  The subject is only measurable at ratios BELOW this. It is checked against the');
  console.log('  measured ratio in the subject arm and reported there.');
}

/* Everything below needs the capture. */
if (ARM === 'envelope') { console.log(''); process.exit(failed ? 2 : 0); }

const { png } = loadPNG(PNGPATH);
if (png.width !== W || png.height !== H) console.log(`\n  !! png is ${png.width}x${png.height}, camera built for ${W}x${H}`);
if (PREDICT) {
  console.log(`\n  !! FORECAST MODE --predict=${PREDICT}: the profile below is the CAPTURED frame multiplied by`);
  console.log(`     the shade-side band term 1 - ${PREDICT}*(1 - slyRamp(N.L)). It is a simulation, and an UPPER`);
  console.log(`     BOUND — display-space instead of scene-linear-before-tonemap, and whole-pixel instead of`);
  console.log(`     shade-terms-only. Nothing here is a measurement of a rendered frame.`);
}

/* ── The two nuisance scales, taken from the capture and applied to BOTH arms alike. ────── */
banner('NUISANCE SCALES — measured from the capture, fed identically to both control arms');
const ROWS = [];
for (let dy = -4; dy <= 4; dy++) ROWS.push({ dy, prof: readProfile(png, fg, dy) });
const nCol = ROWS[0].prof.length;
const colSd = [];
for (let i = 0; i < nCol; i++) {
  const v = ROWS.map((r) => r.prof[i]);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  colSd.push(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length));
}
const SIGMA = median(colSd);
const prof0 = ROWS.find((r) => r.dy === 0).prof;
const sorted0 = [...prof0].sort((a, b) => a - b);
const AMP = pct(sorted0, 0.98) - pct(sorted0, 0.02);
const BASE = pct(sorted0, 0.02);
console.log(`  sigma  = median over x of the sd across the 9 sheared rows = ${SIGMA.toFixed(3)} luma`);
console.log(`         (verdict-neutral: it measures variation ALONG the column, the statistic reads ACROSS it)`);
console.log(`  amp    = p98 - p2 of the dy=0 profile = ${AMP.toFixed(2)} luma      base = ${BASE.toFixed(2)}`);
console.log(`  noise/range ratio = ${(SIGMA / Math.max(AMP, 1e-6)).toFixed(4)}`);

/* ── ARMS: the two controls, and the well-posedness of the curve between them. ──────────── */
banner('ARMS: calib-banded (lam=0) and calib-smooth (lam=1) — MUST SEPARATE');
const G = new Map();
const LGRID = [];
for (let i = 0; i <= 20; i++) LGRID.push(i / 20);
for (const l of LGRID) G.set(l, ensemble(fg, l, AMP, BASE, SIGMA));
const A0 = G.get(0), A1 = G.get(1), AH = G.get(0.5);
console.log(`  [calib-banded  lam=0.0]  gapFrac ${A0.min.toFixed(4)} .. ${A0.max.toFixed(4)}   median ${A0.med.toFixed(4)}   (n=${A0.n})`);
console.log(`  [calib-mid     lam=0.5]  gapFrac ${AH.min.toFixed(4)} .. ${AH.max.toFixed(4)}   median ${AH.med.toFixed(4)}`);
console.log(`  [calib-smooth  lam=1.0]  gapFrac ${A1.min.toFixed(4)} .. ${A1.max.toFixed(4)}   median ${A1.med.toFixed(4)}`);
const sepOK = A0.min > A1.max;
console.log(`\n  MUST-FIRE 1 (arms separate):  min(lam=0) ${A0.min.toFixed(4)} > max(lam=1) ${A1.max.toFixed(4)}  ->  ${sepOK ? 'PASS' : 'FAIL — no threshold between the arms exists; every subject number below is meaningless'}`);
if (!sepOK) failed++;
const wellOK = A0.med > AH.med && AH.med > A1.med;
console.log(`  MUST-FIRE 2 (well-posed):     G(0) ${A0.med.toFixed(4)} > G(0.5) ${AH.med.toFixed(4)} > G(1) ${A1.med.toFixed(4)}  ->  ${wellOK ? 'PASS' : 'FAIL — lambda cannot be inverted'}`);
if (!wellOK) failed++;
console.log(`\n  DECISION POINT, fixed by the arms and not authored:  gapFrac must exceed G(0.5) = ${AH.med.toFixed(4)}`);
console.log('  i.e. the face must be nearer an ideal 3-band cel ramp than a 50/50 mix of that ramp');
console.log('  with smooth Lambert, on this exact geometry, at this frame\'s own range and noise.');

/** Invert the ensemble-median curve: what mixture does this gapFrac correspond to? */
function lambdaOf(v) {
  if (v >= G.get(0).med) return 0;
  if (v <= G.get(1).med) return 1;
  for (let i = 1; i < LGRID.length; i++) {
    const a = LGRID[i - 1], b = LGRID[i], ga = G.get(a).med, gb = G.get(b).med;
    if (ga >= v && v >= gb) return a + (b - a) * ((ga - v) / Math.max(ga - gb, 1e-12));
  }
  return NaN;
}

/* ── ARM: subject ───────────────────────────────────────────────────────────────────────── */
let verdict = null;
if (ARM === 'all' || ARM === 'subject') {
  banner('ARM: subject — the captured frame');
  const gf = gapFrac(prof0);
  const m = metrics(prof0, 2.0);
  console.log(`  gapFrac ${gf.frac.toFixed(4)}   (trimmed range ${gf.range.toFixed(2)} luma; `
    + `largest ${BANDS - 1} gaps ${gf.top.map((t) => `${t.g.toFixed(2)}@${t.at.toFixed(0)}`).join(', ')})`);
  console.log(`  lambda_hat = ${lambdaOf(gf.frac).toFixed(3)}   `
    + `("this face's shading response is ${(100 * lambdaOf(gf.frac)).toFixed(0)}% continuous, `
    + `${(100 * (1 - lambdaOf(gf.frac))).toFixed(0)}% quantised")`);
  verdict = gf.frac > AH.med;
  console.log(`\n  VERDICT (dy=0): gapFrac ${gf.frac.toFixed(4)} vs decision point ${AH.med.toFixed(4)}  ->  `
    + `${verdict ? 'BANDS' : 'DOES NOT BAND'}`);
  console.log(`\n  descriptive only, never a criterion (§228): mean ${m.mean.toFixed(1)}  sd ${m.sd.toFixed(2)}  `
    + `maxStep ${m.maxStep.toFixed(2)}  plateaus(eps=2.0) ${m.plateaus.length}`);
  for (const p of m.plateaus.slice(0, 8)) {
    console.log(`      plateau px ${fg.x0 + p.i0}..${fg.x0 + p.i1}  len ${p.len}  level ${p.level.toFixed(1)}`);
  }
  console.log(`\n  profile (px:luma), every 4th sample:`);
  let line = '   ';
  prof0.forEach((v, i) => { if (i % 4 === 0) line += `${fg.x0 + i}:${v.toFixed(0)}  `; });
  console.log(line);
}

/* ── ARM: attrib — WHICH shader term draws the variation that IS there? ─────────────
 *
 * The claim this tests is a claim about the shader, and until now it was only READ off the
 * source: on a cast-shadowed surface `key = ramp*sh` is 0, `fill` depends only on `hemi(Nw.y)`,
 * the shadow multiply and the wash depend only on `shadowMix = 1-key` which is then the constant
 * 1, `spec` is gated by `sh` and `step(0.02,ndl)`, and `sss` is gated by `sh` — so nothing but
 * the fresnel rim can vary across the face. A source reading is not a measurement (§61.7), so
 * this correlates the captured profile against each candidate term computed from the geometry.
 *
 * The three candidates are predictions, not fits: none has a free parameter.
 *   ramp   slyRamp(N.L) at the shipped TUNE   — the cel quantiser. If it is live, this wins.
 *   ndl    raw Lambert                        — if the diffuse term were smooth but present.
 *   fres   (1 - N.V)^uRimPower                — the fresnel rim, the only ungated term left.
 */
if (ARM === 'all' || ARM === 'attrib') {
  banner('ARM: attrib — which term draws the variation that IS on this face?');
  const pearson = (a, b) => {
    const n = a.length;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
    return sab / Math.sqrt(Math.max(saa * sbb, 1e-12));
  };
  const RP = TUNE.rimPower ?? 3.1;
  const cand = {
    ramp: fg.samples.map((q) => slyRamp(q.ndl)),
    ndl: fg.samples.map((q) => Math.max(q.ndl, 0)),
    fres: fg.samples.map((q) => Math.pow(1 - q.ndv, RP)),
  };
  for (const [k, v] of Object.entries(cand)) {
    console.log(`   corr(luma, ${k.padEnd(4)}) = ${pearson(prof0, v).toFixed(3)}   `
      + `(term spans ${Math.min(...v).toFixed(3)}..${Math.max(...v).toFixed(3)})`);
  }
  console.log('\n   A live cel quantiser makes `ramp` the winner. The rim winning IS the measurement of');
  console.log('   "key = ramp * sh is zero here", as against the source reading of it.');
}

/* ── ARM: noise — §220's null. The verdict must survive the intra-frame floor. ──────────── */
if (ARM === 'all' || ARM === 'noise') {
  banner('ARM: noise — the intra-frame floor (§220). All nine rows must agree.');
  const votes = [];
  for (const r of ROWS) {
    const g = gapFrac(r.prof);
    const v = g.frac > AH.med;
    votes.push(v);
    console.log(`   dy ${String(r.dy).padStart(2)}  gapFrac ${g.frac.toFixed(4)}  lambda_hat ${lambdaOf(g.frac).toFixed(3)}  -> ${v ? 'BANDS' : 'does not band'}`);
  }
  const agree = votes.every((v) => v === votes[0]);
  const gfs = ROWS.map((r) => gapFrac(r.prof).frac);
  console.log(`\n   gapFrac across 9 adjacent rows of the same surface: ${Math.min(...gfs).toFixed(4)} .. ${Math.max(...gfs).toFixed(4)}`
    + `  (spread ${(Math.max(...gfs) - Math.min(...gfs)).toFixed(4)})`);
  console.log(`   => no gapFrac difference smaller than that spread may be quoted from this instrument.`);
  console.log(`   ROW AGREEMENT: ${agree ? `PASS — all nine rows say ${votes[0] ? 'BANDS' : 'DOES NOT BAND'}` : 'FAIL — rows disagree; the answer is INDETERMINATE, not "banded"'}`);
  if (!agree) failed++;
  console.log(`   NOTE: this is an INTRA-FRAME floor. It does not bound capture-to-capture drift (§220);`);
  console.log(`         a before/after across two boots needs its own null arm.`);
}

console.log('');
process.exit(failed ? 2 : 0);

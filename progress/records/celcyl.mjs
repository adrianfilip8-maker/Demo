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
 * with the real tapered cylinder for EVERY pixel of the scanline, and therefore knows, per
 * pixel, the surface normal, N.L, and which of the three cel bands that pixel is REQUIRED to
 * be in. The prediction is made from geometry before a single pixel is read.
 *
 * ── ARMS. Two of them must change, or the run is void. ─────────────────────────────────────
 *   subject       the captured PNG.
 *   calib-banded  POSITIVE control. The identical extractor and the identical metrics run on a
 *                 synthetic profile built from the SAME geometry and the SAME TUNE constants
 *                 through a perfect 3-band ramp. plateaus MUST be >= 2 and maxStep MUST be
 *                 large. If this arm reports "smooth", the instrument cannot see banding and
 *                 no subject number from it means anything.
 *   calib-smooth  NEGATIVE control. Same geometry, smooth Lambert, no ramp. plateaus MUST be
 *                 0..1 and maxStep small. If this arm reports "banded", the instrument fires
 *                 on anything and no subject number from it means anything.
 *   noise         DRIFT/NOISE FLOOR (§220). Re-runs the subject extractor on rows y-4..y+4 of
 *                 the same capture and reports how far the metric moves between rows that are
 *                 all supposed to be the same surface. No pixel delta below this floor may be
 *                 quoted. This is an intra-frame floor and is NOT a capture-to-capture drift
 *                 floor: nothing here re-renders, so capture drift cannot enter. A
 *                 before/after across two CAPTURES needs its own two-boot null arm.
 *
 * Run:
 *   node progress/records/celcyl.mjs --arm=all
 *   node progress/records/celcyl.mjs --arm=subject --png=shots/r8/temple.png --shot=temple
 *   node progress/records/celcyl.mjs --arm=subject --col=1 --y=5.5
 *
 * Exit code is 0 unless a calibration arm failed its own must-change assertion.
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
   hShaft is 11.6 +- 0.25 of jitter; `--hshaft` sweeps it. Its effect on r at mid-shaft is
   under 5 mm (checked below and printed), i.e. a fifth of a pixel, so the silhouette this
   predicts is robust to the one jittered input.
--------------------------------------------------------------------------- */
const RBASE = 1.9, RTOP = 1.25, PLACE_Y = 0.35, HSHAFT = Number(argv.hshaft || 11.6);
const ROLLR = RBASE * 0.20, Y0 = ROLLR * 2;
const LOBES = 8, RIB = 0.075;      // Kit.papyrusColumn defaults; shaft rows carry ribScale 1

/** Shaft radius at a LOCAL height (metres above the column's own origin). */
function shaftR(yLocal, hShaft = HSHAFT) {
  const t = Math.min(Math.max((yLocal - Y0) / (hShaft - Y0), 0), 1);
  return RBASE + (RTOP - RBASE) * Math.pow(t, 0.62);
}

const NAVE = [];
for (const cz of [-22, -30, -38, -46]) for (const sx of [-1, 1]) NAVE.push({ x: sx * 8, z: cz, kind: 'nave' });

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
 * Intersect a camera ray with the tapered column, iterating the radius against the hit height.
 * Returns { p, n, ndl, theta } or null. `n` is the SMOOTH CARRIER normal — the ribs ride on top
 * of it and are reported separately, because their phase (`spin`) is drawn from the level rng.
 */
function hitColumn(col, rd, hShaft = HSHAFT) {
  const o = cam.position;
  let r = shaftR(6.0, hShaft);
  let hit = null;
  for (let it = 0; it < 4; it++) {
    const ox = o.x - col.x, oz = o.z - col.z;
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
    hit = { p, yLocal, t };
    if (Math.abs(nr - r) < 1e-4) { r = nr; break; }
    r = nr;
  }
  if (!hit) return null;
  const n = new THREE.Vector3(hit.p.x - col.x, 0, hit.p.z - col.z).normalize();
  return { p: hit.p, n, ndl: n.dot(L), theta: Math.atan2(hit.p.z - col.z, hit.p.x - col.x), r };
}

/* ---------------------------------------------------------------------------
   3. The ramp, restated from toon.glsl.js slyRamp/slyTerm at the shipped TUNE.
      Used ONLY by the calib-banded arm, so the positive control is built from the same
      numbers the shader is built from and cannot drift away from them.
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

function metrics(prof, eps) {
  const n = prof.length;
  const steps = [];
  for (let i = 1; i < n; i++) steps.push(Math.abs(prof[i] - prof[i - 1]));
  const maxStep = steps.length ? Math.max(...steps) : 0;
  const meanStep = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  const mean = prof.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(prof.reduce((a, b) => a + (b - mean) ** 2, 0) / n);

  /* A plateau is a run of >= MINRUN samples over which the profile's total drift stays under
     `eps`. eps comes from the noise arm, not from taste. */
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
  return { n, maxStep, meanStep, mean, sd, plateaus: plats };
}

/** px to traverse 20 -> 80% of the local drop, centred on index `k`. */
function terminatorWidth(prof, k, span = 60) {
  const a = Math.max(0, k - span), b = Math.min(prof.length - 1, k + span);
  const lo = Math.min(...prof.slice(a, b + 1)), hi = Math.max(...prof.slice(a, b + 1));
  if (hi - lo < 1e-6) return { width: NaN, lo, hi };
  const t20 = lo + 0.2 * (hi - lo), t80 = lo + 0.8 * (hi - lo);
  let i20 = null, i80 = null;
  for (let i = a; i <= b; i++) {
    const v = prof[i];
    if (i20 === null && v >= t20) i20 = i;
    if (i80 === null && v >= t80) i80 = i;
  }
  if (i20 === null || i80 === null) return { width: NaN, lo, hi };
  return { width: Math.abs(i80 - i20) + 1, lo, hi };
}

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
 * exact contamination that voided every previous run of this test.
 */
function faceGeom(col, worldY, inset = Number(argv.inset || 0.10)) {
  const axis = new THREE.Vector3(col.x, worldY, col.z);
  const pa = project(axis);
  if (!pa) return null;
  const row = Math.round(pa.y);
  if (row < 0 || row >= H) return null;

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
    samples.push(h ? { x, ndl: h.ndl, theta: h.theta, dist: h.p.distanceTo(cam.position), r: h.r } : null);
  }
  if (samples.some((s) => !s)) return null;
  return { col, row, xl, xr, x0, x1, wpx, samples, axisPx: pa };
}

/** Where the carrier N.L crosses each cel terminator, in scanline index. */
function crossings(fg) {
  const out = [];
  const ts = [
    { name: 'termLo', v: TUNE.termLo },
    { name: 'termHi', v: TUNE.termHi },
  ];
  for (const t of ts) {
    for (let i = 1; i < fg.samples.length; i++) {
      const a = fg.samples[i - 1].ndl, b = fg.samples[i].ndl;
      if ((a - t.v) * (b - t.v) < 0) out.push({ ...t, i, px: fg.samples[i].x });
    }
  }
  return out;
}

function readProfile(png, fg, dy = 0) {
  const prof = [];
  const row = fg.row + dy;
  for (let x = fg.x0; x <= fg.x1; x++) {
    const o = (row * png.width + x) * 4;
    prof.push(LUMA(png.data[o], png.data[o + 1], png.data[o + 2]));
  }
  return prof;
}

/* ---------------------------------------------------------------------------
   6. Report
--------------------------------------------------------------------------- */
function banner(s) { console.log(`\n${'-'.repeat(78)}\n${s}\n${'-'.repeat(78)}`); }

function describeFace(fg) {
  const s = fg.samples;
  const nl = s.map((q) => q.ndl);
  const bandOf = (v) => (v < TUNE.termLo - TUNE.termSoft ? 0 : v > TUNE.termHi + TUNE.termSoft ? 2 : 1);
  const bands = nl.map(bandOf);
  const counts = [0, 0, 0];
  for (const b of bands) counts[b]++;
  console.log(`  column (x ${fg.col.x}, z ${fg.col.z})  scanline row ${fg.row}  `
    + `silhouette px ${fg.xl}..${fg.xr} (${fg.wpx} px)  measured px ${fg.x0}..${fg.x1}`);
  console.log(`  distance ${s[0].dist.toFixed(2)} m   shaft radius ${s[0].r.toFixed(3)} m`);
  console.log(`  carrier N.L over the measured face: ${Math.min(...nl).toFixed(3)} .. ${Math.max(...nl).toFixed(3)}`);
  console.log(`  REQUIRED band occupancy (shadow/mid/lit px): ${counts[0]} / ${counts[1]} / ${counts[2]}`);
  const cr = crossings(fg);
  console.log(`  REQUIRED terminator pixels: ${cr.length ? cr.map((c) => `${c.name}@x=${c.px}`).join('  ') : 'none on this face'}`);
  /* The ribs are a real part of this surface and they move N.L a great deal more than the
     carrier does. Phase is level-rng (`spin`), so report amplitude and screen period only. */
  const swing = Math.atan(LOBES * RIB);
  const arcPerLobe = 2 * Math.PI * s[0].r / LOBES;
  const ppm = fg.wpx / (2 * s[0].r);
  console.log(`  ribs: ${LOBES} lobes, normal azimuth swing +-${(swing * 180 / Math.PI).toFixed(1)} deg, `
    + `lobe arc ${arcPerLobe.toFixed(2)} m ~ ${(arcPerLobe * ppm).toFixed(0)} px at this scale`);
  return { cr };
}

function report(tag, prof, eps, cr, fg) {
  const m = metrics(prof, eps);
  console.log(`\n  [${tag}]  n=${m.n}  mean ${m.mean.toFixed(1)}  sd ${m.sd.toFixed(2)}  `
    + `maxStep ${m.maxStep.toFixed(2)}  meanStep ${m.meanStep.toFixed(3)}  plateaus(eps=${eps.toFixed(2)}) ${m.plateaus.length}`);
  for (const p of m.plateaus.slice(0, 8)) {
    console.log(`      plateau px ${fg.x0 + p.i0}..${fg.x0 + p.i1}  len ${p.len}  level ${p.level.toFixed(1)}`);
  }
  if (m.plateaus.length >= 2) {
    const gaps = [];
    for (let i = 1; i < m.plateaus.length; i++) gaps.push(Math.abs(m.plateaus[i].level - m.plateaus[i - 1].level));
    console.log(`      level gaps between consecutive plateaus: ${gaps.map((g) => g.toFixed(1)).join(', ')}`);
  }
  for (const c of cr) {
    const k = c.px - fg.x0;
    const t = terminatorWidth(prof, k);
    console.log(`      terminator width at REQUIRED ${c.name} (x=${c.px}): `
      + `${Number.isFinite(t.width) ? `${t.width} px` : 'n/a'}   local range ${t.lo.toFixed(1)}..${t.hi.toFixed(1)}`);
  }
  return m;
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

/* Pick the column with the most REQUIRED terminator crossings on its measured face, breaking
   ties by width. That is the strongest available test, chosen by geometry, not by eye. */
const ranked = inFrame
  .map((e) => ({ ...e, cr: crossings(e.fg) }))
  .sort((a, b) => (b.cr.length - a.cr.length) || (b.fg.wpx - a.fg.wpx));
if (!ranked.length) { console.log('\nNo nave column resolves a lit face in this shot. Nothing to measure.'); process.exit(0); }

const pick = Number(argv.col ?? 0);
const chosen = ranked[Math.min(pick, ranked.length - 1)];
const worldY = Number(argv.y || (PLACE_Y + 6.0));
const fg = faceGeom(chosen.col, worldY) || chosen.fg;

banner(`SUBJECT FACE — chosen by crossing count, not by eye`);
const { cr } = describeFace(fg);

let failed = 0;

if (ARM === 'all' || ARM === 'noise') {
  banner('ARM: noise — the intra-frame floor (§220)');
  const { png } = loadPNG(PNGPATH);
  const rows = [];
  for (let dy = -4; dy <= 4; dy++) {
    const p = readProfile(png, fg, dy);
    const m = metrics(p, 1.0);
    rows.push({ dy, maxStep: m.maxStep, sd: m.sd, mean: m.mean });
  }
  for (const r of rows) console.log(`   dy ${String(r.dy).padStart(2)}  mean ${r.mean.toFixed(1)}  sd ${r.sd.toFixed(2)}  maxStep ${r.maxStep.toFixed(2)}`);
  const ms = rows.map((r) => r.maxStep);
  const spread = Math.max(...ms) - Math.min(...ms);
  console.log(`\n   maxStep across 9 adjacent rows of the same surface: ${Math.min(...ms).toFixed(2)} .. ${Math.max(...ms).toFixed(2)}  (spread ${spread.toFixed(2)})`);
  console.log(`   => no maxStep difference smaller than ${spread.toFixed(2)} luma may be quoted from this instrument.`);
  console.log(`   NOTE: this is an INTRA-FRAME floor. It does not bound capture-to-capture drift (§220);`);
  console.log(`         a before/after across two boots needs its own null arm.`);
}

const EPS = Number(argv.eps || 2.0);

if (ARM === 'all' || ARM === 'subject') {
  banner('ARM: subject — the captured frame');
  const { png } = loadPNG(PNGPATH);
  if (png.width !== W || png.height !== H) console.log(`  !! png is ${png.width}x${png.height}, camera built for ${W}x${H}`);
  const prof = readProfile(png, fg, 0);
  report('subject', prof, EPS, cr, fg);
  console.log(`\n  profile (px:luma), every 4th sample:`);
  let line = '   ';
  prof.forEach((v, i) => { if (i % 4 === 0) line += `${fg.x0 + i}:${v.toFixed(0)}  `; });
  console.log(line);
}

if (ARM === 'all' || ARM === 'calib-banded') {
  banner('ARM: calib-banded — POSITIVE control (MUST report plateaus)');
  /* Same geometry, same TUNE, a perfect 3-band ramp and nothing else. Amplitudes are chosen to
     sit in the same luma decade as the subject so the metric is exercised at the same scale. */
  const prof = fg.samples.map((s) => 30 + 170 * slyRamp(s.ndl));
  const m = report('calib-banded', prof, EPS, cr, fg);
  const ok = m.plateaus.length >= 2 && m.maxStep > 20;
  console.log(`  MUST-CHANGE: plateaus>=2 && maxStep>20  ->  ${ok ? 'PASS' : 'FAIL — instrument cannot see banding'}`);
  if (!ok) failed++;
}

if (ARM === 'all' || ARM === 'calib-smooth') {
  banner('ARM: calib-smooth — NEGATIVE control (MUST NOT report banding)');
  const prof = fg.samples.map((s) => 30 + 170 * Math.max(s.ndl, 0));
  const m = report('calib-smooth', prof, EPS, cr, fg);
  const ok = m.maxStep < 20;
  console.log(`  MUST-CHANGE: maxStep<20  ->  ${ok ? 'PASS' : 'FAIL — instrument fires on a smooth ramp'}`);
  if (!ok) failed++;
}

console.log('');
process.exit(failed ? 1 : 0);

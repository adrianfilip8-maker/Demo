#!/usr/bin/env node
/* geocert — ROUTE 2 certification for NOTE-cone-geocert.md (coordinator decision §179).
 *
 * Certifies GEOMETRICALLY what a4's photometric no-harm gate could not: the §17 risk that the
 * guard's lit three-quarter read narrows as he turns ~30° lens-away at towardCamera −0.20.
 *
 * No capture, no lock, no src edits. Every input is either a committed constant read out of
 * src/ (quoted with its line) or a committed probe value from the a2/a3/a4 readbacks.
 *
 * METHOD. A z-buffered point rasteriser over the guard's authored surface:
 *   - torso lofted from GuardModel.js SPECS.temple.torso ([y, halfX, halfZ, zOffset], hips->neck)
 *   - head ellipsoid at headC radii headR; muzzle wedge snoutLen along +forward; two ears earLen
 *   - legs as two tapered cylinders below the hips
 * Each surface sample is projected through the committed camera; the frontmost sample per pixel
 * wins; a pixel counts as LIT if its frontmost surface normal faces the key direction.
 * Silhouette area = covered pixels. Lit-facing fraction = lit pixels / covered pixels.
 *
 * The projection is VALIDATED against a committed independent result before any number is
 * reported: PREREG-fxcluster §0.1's CPU port put the solved head at px (864,244).
 *
 * usage: node geocert.mjs   (writes geocert2.json, prints the tables the NOTE quotes)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const DEG = Math.PI / 180;

/* ===================== committed inputs ===================== */
/* Camera + pose: identical in every arm of a2, a3 and a4 (see determinism audit below). */
const CAM = { pos: JSON.parse(process.env.GC_POS || '[-13.25, 2.6, 30.5]'), fwd: [-0.884, -0.241, -0.402], fov: 38 };
const W = 1280, H = 720, ASPECT = W / H;
const G = [-15.487, 0, 27.545];                      // guard stand, probed identical everywhere
const ARMS = {
  'base  (shipped towardCamera 0.35)': { yaw: -0.0691, fwd: [-0.069, 0, 0.998] },
  'cand  (towardCamera -0.20)': { yaw: -0.628, fwd: [-0.588, 0, 0.809] },
};

/* GuardModel.js SPECS.temple — the authored jackal (`:531-562`) */
const TORSO = [
  [0.505, 0.170, 0.132, 0.000], [0.560, 0.192, 0.150, 0.000], [0.640, 0.196, 0.152, 0.006],
  [0.730, 0.180, 0.140, 0.012], [0.840, 0.196, 0.146, 0.010], [0.960, 0.232, 0.164, 0.002],
  [1.075, 0.272, 0.178, -0.012], [1.180, 0.298, 0.182, -0.020], [1.275, 0.300, 0.176, -0.022],
  [1.355, 0.256, 0.150, -0.012], [1.425, 0.156, 0.118, 0.000], [1.490, 0.118, 0.106, 0.010],
  [1.545, 0.116, 0.106, 0.014],
];
const HEAD_C = [0, 1.760, -0.010], HEAD_R = [0.222, 0.206, 0.232];
const SNOUT_LEN = 0.40, EAR_LEN = 0.30, LEG_X = 0.118, HEAD_TOP = 1.95;

/* Guard.js VISION.temple (Patrol.js:31-35) + TUNE (Guard.js:81-82) */
const PLINTH_Y = +(process.env.GC_PLINTH || 300);
const HALF_ANGLE = 0.60, CONE_LENGTH = 15.0, EYE_HEIGHT = 1.66, CONE_MIN_THROW = 0.55, CONE_PITCH = 0.115;

/* Atmosphere.js sun/moon tracks, sampled at the guard shot's tod 0.10 (probed in every arm) */
const TOD = 0.10;
const SUN_ELEVATION = [[0.00, -62], [0.06, -52], [0.12, -38], [0.18, -14], [0.215, 0], [0.26, 12], [0.30, 22], [0.38, 48], [0.44, 66], [0.50, 76], [0.56, 66], [0.62, 48], [0.68, 38], [0.72, 33], [0.76, 26], [0.79, 22], [0.83, 15], [0.86, 8], [0.895, 0], [0.94, -22], [1.00, -62]];
const MOON_ELEVATION = [[0.00, 9], [0.02, 12], [0.06, 20], [0.12, 31], [0.18, 24], [0.24, 4], [0.30, -26], [0.70, -34], [0.86, -6], [0.92, 2], [0.96, 6], [1.00, 9]];
const MOON_AZIMUTH = [[0.00, 292], [0.06, 297], [0.12, 308], [0.24, 326], [0.50, 20], [0.86, 268], [1.00, 292]];
/* Atmosphere.js:70-82 verbatim */
function sampleTable(table, x) {
  const n = table.length;
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[n - 1][0]) return table[n - 1][1];
  let i = 0;
  while (i < n - 2 && table[i + 1][0] < x) i++;
  const [x0, y0] = table[i], [x1, y1] = table[i + 1];
  const t = (x - x0) / (x1 - x0 || 1);
  const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return y0 + (y1 - y0) * s;
}
/* Atmosphere.js:269-273 verbatim */
const dirFrom = (elDeg, azDeg) => { const el = elDeg * DEG, az = azDeg * DEG, c = Math.cos(el); return [c * Math.cos(az), Math.sin(el), c * Math.sin(az)]; };

/* ===================== vector helpers ===================== */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ===================== camera basis + projection ===================== */
const f = norm(CAM.fwd);
const r = norm(cross(f, [0, 1, 0]));
const u = cross(r, f);
const tanV = Math.tan(CAM.fov * 0.5 * DEG), tanH = tanV * ASPECT;
function project(P) {
  const rel = sub(P, CAM.pos);
  const z = dot(rel, f);
  if (z <= 0.01) return null;
  return { x: (W / 2) * (1 + (dot(rel, r) / z) / tanH), y: (H / 2) * (1 - (dot(rel, u) / z) / tanV), z };
}

/* --- VALIDATION against the committed port (PREREG-fxcluster §0.1: head px (864,244)) --- */
const headProbe = project([G[0], HEAD_TOP, G[2]]);
const VALIDATION = {
  committedPort: [864, 244],
  thisInstrument: [+headProbe.x.toFixed(1), +headProbe.y.toFixed(1)],
  agreesWithinPx: Math.max(Math.abs(headProbe.x - 864), Math.abs(headProbe.y - 244)) < 1.5,
};

/* ===================== key direction at tod 0.10 ===================== */
const sunEl = sampleTable(SUN_ELEVATION, TOD);
const moonEl = sampleTable(MOON_ELEVATION, TOD), moonAz = sampleTable(MOON_AZIMUTH, TOD);
const moonDir = norm(dirFrom(moonEl, moonAz));
/* Atmosphere.js:356 `keyIsMoon = el < 1.0 && moonIntensity > 0.02`. sunEl is far below the
   horizon here, so the sun cannot be the key: if it were, nothing in the frame would be lit,
   which the committed frames refute (pool medL 86.4, guard band medL 63). Key = moon. */
const keyDir = moonDir;                       // unit, points TOWARD the moon (Atmosphere.js:219)
/* §2.1.5 rim, Atmosphere.js:385-387: anti-key azimuth, lifted 42 deg. §7.3 fails a shot outright
   for "no rim light separating silhouettes from the background", so rim coverage is as much a
   part of the guard's READ as key coverage, and it moves with his yaw too. */
const rimDir = norm(dirFrom(42, moonAz + 180));

/* ===================== the guard's surface, in body frame ===================== */
/* Body basis matches Guard.js's own pool basis convention (`:1604` right = (fz,0,-fx)). */
function bodyBasis(fwd) { const F = norm([fwd[0], 0, fwd[2]]); return { F, R: [F[2], 0, -F[0]], U: [0, 1, 0] }; }
const toWorld = (B, lx, ly, lz) => add(G, add(add(mul(B.R, lx), mul(B.U, ly)), mul(B.F, lz)));
const dirWorld = (B, lx, ly, lz) => norm(add(add(mul(B.R, lx), mul(B.U, ly)), mul(B.F, lz)));

/** Emit {P, N} surface samples for the whole figure. */
function surface(B, NA = 260) {
  const S = [];
  const push = (lx, ly, lz, nx, ny, nz) => S.push({ P: toWorld(B, lx, ly, lz), N: dirWorld(B, nx, ny, nz) });

  // torso: loft between consecutive authored slices
  for (let i = 0; i < TORSO.length - 1; i++) {
    const [y0, a0, b0, z0] = TORSO[i], [y1, a1, b1, z1] = TORSO[i + 1];
    const steps = Math.max(2, Math.round((y1 - y0) / 0.006));
    for (let s = 0; s <= steps; s++) {
      const k = s / steps, y = y0 + (y1 - y0) * k, a = a0 + (a1 - a0) * k, b = b0 + (b1 - b0) * k, z = z0 + (z1 - z0) * k;
      for (let j = 0; j < NA; j++) {
        const t = (j / NA) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        push(a * ct, y, b * st + z, ct / a, 0, st / b);
      }
    }
  }
  // legs: two tapered cylinders, hips (0.505) down to the ankle
  for (const sx of [-1, 1]) {
    for (let y = 0.02; y <= 0.505; y += 0.006) {
      const rad = 0.075 + 0.045 * (y / 0.505);
      for (let j = 0; j < NA; j++) {
        const t = (j / NA) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        push(sx * LEG_X + rad * ct, y, rad * st, ct, 0, st);
      }
    }
  }
  // head ellipsoid
  for (let iv = 0; iv <= 90; iv++) {
    const ph = (iv / 90) * Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
    for (let j = 0; j < NA; j++) {
      const th = (j / NA) * Math.PI * 2;
      const ux = sp * Math.cos(th), uy = cp, uz = sp * Math.sin(th);
      push(HEAD_C[0] + HEAD_R[0] * ux, HEAD_C[1] + HEAD_R[1] * uy, HEAD_C[2] + HEAD_R[2] * uz,
        ux / HEAD_R[0], uy / HEAD_R[1], uz / HEAD_R[2]);
    }
  }
  // muzzle: tapered wedge forward from the head (GuardModel.js:1107 "the single strongest species read")
  const z0m = HEAD_C[2] + HEAD_R[2] * 0.55;
  for (let s = 0; s <= 70; s++) {
    const k = s / 70, z = z0m + SNOUT_LEN * k;
    const rw = 0.105 * (1 - 0.45 * k), rh = 0.095 * (1 - 0.40 * k);
    for (let j = 0; j < NA; j++) {
      const t = (j / NA) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      push(rw * ct, HEAD_C[1] - 0.010 + rh * st, z, ct / rw, st / rh, 0.38);
    }
  }
  // ears: two tall triangular cones (GuardModel.js:1138-1143)
  for (const sx of [-1, 1]) {
    for (let s = 0; s <= 50; s++) {
      const k = s / 50, y = HEAD_C[1] + HEAD_R[1] * 0.72 + EAR_LEN * k;
      const rad = 0.062 * (1 - k);
      for (let j = 0; j < NA; j++) {
        const t = (j / NA) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        push(sx * 0.105 + sx * (0.10 * k) + rad * ct, y, -0.045 + rad * st, ct, 0.25, st);
      }
    }
  }
  return S;
}

/** z-buffered rasterisation -> silhouette px, lit px, bbox, per-part coverage */
function raster(B, tag) {
  const S = surface(B);
  const zbuf = new Float64Array(W * H).fill(Infinity);
  const lit = new Uint8Array(W * H);
  const rim = new Uint8Array(W * H);
  const cov = new Uint8Array(W * H);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, offFrame = 0;
  for (const { P, N } of S) {
    const p = project(P);
    if (!p) continue;
    if (dot(N, sub(CAM.pos, P)) <= 0) continue;                 // back-facing: not visible
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    const ix = Math.round(p.x), iy = Math.round(p.y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) { offFrame++; continue; }
    const k = iy * W + ix;
    if (p.z < zbuf[k]) { zbuf[k] = p.z; cov[k] = 1; lit[k] = dot(N, keyDir) > 0 ? 1 : 0; rim[k] = dot(N, rimDir) > 0 ? 1 : 0; }
  }
  let area = 0, litPx = 0, vArea = 0, vLit = 0, vRim = 0, vAny = 0;
  for (let i = 0; i < cov.length; i++) {
    if (!cov[i]) continue;
    area++; if (lit[i]) litPx++;
    /* The OPERATIVE figures. This rasteriser models the guard, not the scene's occluders, and
       the committed frames show the §152 plinth slab eating him below y ~= 300: per-row activity
       on a3/a4 frames is 97.6/88.2/88.7/88.0 % moving down to y 300, then 5.2 % at y 300-320 and
       exactly 0.0 % below (100 % of rows y >= 310 are bit-identical across all four arms). So
       everything below PLINTH_Y is authored but never seen, and including it would inflate every
       silhouette number with geometry the viewer cannot judge. */
    if ((i / W | 0) < PLINTH_Y) { vArea++; if (lit[i]) vLit++; if (rim[i]) vRim++; if (lit[i] || rim[i]) vAny++; }
  }
  return {
    tag,
    silhouettePxVisible: vArea, litPxVisible: vLit, litFractionVisible: +(vLit / vArea).toFixed(4),
    rimFractionVisible: +(vRim / vArea).toFixed(4), anyLightFractionVisible: +(vAny / vArea).toFixed(4),
    silhouettePxFullFigure: area, litPxFullFigure: litPx, litFractionFullFigure: +(litPx / area).toFixed(4),
    bbox: { minX: +minX.toFixed(1), maxX: +maxX.toFixed(1), minY: +minY.toFixed(1), maxY: +maxY.toFixed(1) },
    samplesOffFrame: offFrame,
  };
}

/** Share of the cone's ground pool that projects inside the frame — §7.2 "patrol light cone". */
function poolInFrame(arm, reach, N = 240) {
  const B = bodyBasis(arm.fwd);
  const onset = EYE_HEIGHT / Math.tan(Math.min(1.45, CONE_PITCH + HALF_ANGLE));
  let inside = 0, total = 0;
  const bx = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, n: 0 };
  for (let i = 0; i < N; i++) {
    const t = onset + (reach - onset) * ((i + 0.5) / N);        // distance along the throw
    const halfW = Math.tan(HALF_ANGLE) * t;
    for (let j = 0; j < N; j++) {
      const lat = -halfW + 2 * halfW * ((j + 0.5) / N);
      const P = add(add(G, mul(B.F, t)), mul(B.R, lat));
      total++;
      const p = project([P[0], 0.035, P[2]]);
      if (p && p.x >= 0 && p.x < W && p.y >= 0 && p.y < H) {
        inside++;
        bx.n++;
        if (p.x < bx.x0) bx.x0 = p.x; if (p.x > bx.x1) bx.x1 = p.x;
        if (p.y < bx.y0) bx.y0 = p.y; if (p.y > bx.y1) bx.y1 = p.y;
      }
    }
  }
  return { inFrameShare: +(inside / total).toFixed(4), samples: total,
           bbox: bx.n ? { x0: Math.round(bx.x0), y0: Math.round(bx.y0), x1: Math.round(bx.x1), y1: Math.round(bx.y1), n: bx.n } : null };
}

/* ===================== feature reads ===================== */
const viewDir = norm(sub(G, CAM.pos));                         // camera -> guard, 3D
const viewHoriz = norm([G[0] - CAM.pos[0], 0, G[2] - CAM.pos[2]]);
const distance = len(sub(G, CAM.pos));
const pxPerM = H / (2 * distance * tanV);                      // at the guard's depth

function features(name, arm) {
  const B = bodyBasis(arm.fwd);
  const fwdH = B.F;
  /* how far off full-frontal he is: 0 deg = facing the lens, 90 deg = pure profile */
  const offFrontal = 180 - Math.acos(Math.max(-1, Math.min(1, dot(viewHoriz, fwdH)))) / DEG;
  /* muzzle: projects at full length only when perpendicular to the line of sight */
  const perp = Math.sqrt(Math.max(0, 1 - dot(fwdH, viewDir) ** 2));
  const muzzleM = SNOUT_LEN * perp, muzzlePx = muzzleM * pxPerM;
  /* ear separation across the skull, projected */
  const earSepPx = 2 * 0.205 * Math.sqrt(Math.max(0, 1 - dot(B.R, viewDir) ** 2)) * pxPerM;
  /* angle between the line of sight and the key, which sets how much of ANY convex
     body's visible side can be lit at all */
  const viewKeyAngle = Math.acos(Math.max(-1, Math.min(1, dot(mul(viewDir, -1), keyDir)))) / DEG;
  return { name, offFrontalDeg: +offFrontal.toFixed(1), muzzleProjM: +muzzleM.toFixed(4), muzzleProjPx: +muzzlePx.toFixed(1), earSepPx: +earSepPx.toFixed(1), viewKeyAngleDeg: +viewKeyAngle.toFixed(1) };
}

/* ===================== §7.2 content: does anything leave frame? ===================== */
/* The registered content for the `guard` shot is "Guard character + patrol light cone"
   (AGENTS.md §7.2). The cone's ground pool is a wedge from his feet along `forward`, half-width
   tan(halfAngle)*reach at the far edge (Guard.js:1593, :1603-1611). `reach` is not probed, so
   both bounds are reported: the authored full throw and the floor the code guarantees. */
function coneFootprint(arm, reach) {
  const B = bodyBasis(arm.fwd);
  const rr = Math.tan(HALF_ANGLE) * reach;
  const onset = EYE_HEIGHT / Math.tan(Math.min(1.45, CONE_PITCH + HALF_ANGLE));
  const pts = {
    apex: add(G, [0, EYE_HEIGHT, 0]),
    onsetC: add(G, mul(B.F, onset)),
    farL: add(add(G, mul(B.F, reach)), mul(B.R, rr)),
    farR: add(add(G, mul(B.F, reach)), mul(B.R, -rr)),
  };
  const out = {};
  for (const [k, P] of Object.entries(pts)) {
    const p = project(P);
    out[k] = p ? { x: +p.x.toFixed(0), y: +p.y.toFixed(0), inFrame: p.x >= 0 && p.x < W && p.y >= 0 && p.y < H } : { behindCamera: true };
  }
  out.onsetM = +onset.toFixed(3);
  return out;
}

/* ===================== run ===================== */
const OUT = {
  at: new Date().toISOString(),
  method: 'z-buffered point rasterisation of the authored guard surface through the committed camera; no capture',
  validation: VALIDATION,
  key: { rimDir: null, tod: TOD, sunElevationDeg: +sunEl.toFixed(2), moonElevationDeg: +moonEl.toFixed(2), moonAzimuthDeg: +moonAz.toFixed(2), keyDir: keyDir.map((v) => +v.toFixed(4)), rimDirV: rimDir.map((v) => +v.toFixed(4)), keyIsMoon: true },
  camera: { ...CAM, aspect: +ASPECT.toFixed(4), distanceToGuardM: +distance.toFixed(3), pxPerMetreAtGuard: +pxPerM.toFixed(1) },
  arms: {}, features: {}, cone: {},
};
for (const [name, arm] of Object.entries(ARMS)) {
  OUT.arms[name] = raster(bodyBasis(arm.fwd), name);
  OUT.features[name] = features(name, arm);
  OUT.cone[name] = {
    fullThrow: { ...coneFootprint(arm, CONE_LENGTH), pool: poolInFrame(arm, CONE_LENGTH) },
    guaranteedFloor: { ...coneFootprint(arm, CONE_LENGTH * CONE_MIN_THROW), pool: poolInFrame(arm, CONE_LENGTH * CONE_MIN_THROW) },
  };
}
writeFileSync(path.join(DIR, 'geocert2.json'), JSON.stringify(OUT, null, 1));

const names = Object.keys(ARMS);
const [b, c] = names;
const pct = (x, y) => `${(((y - x) / x) * 100).toFixed(1)}%`;
console.log(`projection validation vs committed port (864,244): ${JSON.stringify(VALIDATION.thisInstrument)} -> ${VALIDATION.agreesWithinPx ? 'AGREES' : 'DISAGREES'}`);
console.log(`\nkey at tod ${TOD}: sun elevation ${OUT.key.sunElevationDeg} deg (below horizon) -> key is the MOON at el ${OUT.key.moonElevationDeg} az ${OUT.key.moonAzimuthDeg}`);
console.log(`camera ${OUT.camera.distanceToGuardM} m from the guard, ${OUT.camera.pxPerMetreAtGuard} px/m at his depth\n`);
console.log(`${'quantity'.padEnd(34)} ${'base (0.35)'.padStart(14)} ${'cand (-0.20)'.padStart(14)}   change`);
const row = (label, x, y, unit = '') => console.log(`${label.padEnd(34)} ${String(x).padStart(14)} ${String(y).padStart(14)}   ${pct(x, y)}${unit}`);
row('silhouette px (VISIBLE, y<300)', OUT.arms[b].silhouettePxVisible, OUT.arms[c].silhouettePxVisible);
row('lit px (visible)', OUT.arms[b].litPxVisible, OUT.arms[c].litPxVisible);
console.log(`${'lit-facing fraction (visible)'.padEnd(34)} ${String(OUT.arms[b].litFractionVisible).padStart(14)} ${String(OUT.arms[c].litFractionVisible).padStart(14)}   ${(OUT.arms[c].litFractionVisible - OUT.arms[b].litFractionVisible >= 0 ? '+' : '')}${((OUT.arms[c].litFractionVisible - OUT.arms[b].litFractionVisible) * 100).toFixed(2)} pp`);
row('silhouette px (full figure)', OUT.arms[b].silhouettePxFullFigure, OUT.arms[c].silhouettePxFullFigure);
console.log(`${'lit fraction (full figure)'.padEnd(34)} ${String(OUT.arms[b].litFractionFullFigure).padStart(14)} ${String(OUT.arms[c].litFractionFullFigure).padStart(14)}   ${(OUT.arms[c].litFractionFullFigure - OUT.arms[b].litFractionFullFigure >= 0 ? '+' : '')}${((OUT.arms[c].litFractionFullFigure - OUT.arms[b].litFractionFullFigure) * 100).toFixed(2)} pp`);
console.log(`${'rim-facing fraction (visible)'.padEnd(34)} ${String(OUT.arms[b].rimFractionVisible).padStart(14)} ${String(OUT.arms[c].rimFractionVisible).padStart(14)}   ${(OUT.arms[c].rimFractionVisible - OUT.arms[b].rimFractionVisible >= 0 ? '+' : '')}${((OUT.arms[c].rimFractionVisible - OUT.arms[b].rimFractionVisible) * 100).toFixed(2)} pp`);
console.log(`${'key-OR-rim fraction (visible)'.padEnd(34)} ${String(OUT.arms[b].anyLightFractionVisible).padStart(14)} ${String(OUT.arms[c].anyLightFractionVisible).padStart(14)}   ${(OUT.arms[c].anyLightFractionVisible - OUT.arms[b].anyLightFractionVisible >= 0 ? '+' : '')}${((OUT.arms[c].anyLightFractionVisible - OUT.arms[b].anyLightFractionVisible) * 100).toFixed(2)} pp`);
row('off-frontal angle (deg)', OUT.features[b].offFrontalDeg, OUT.features[c].offFrontalDeg);
row('muzzle projected (px)', OUT.features[b].muzzleProjPx, OUT.features[c].muzzleProjPx);
row('ear separation (px)', OUT.features[b].earSepPx, OUT.features[c].earSepPx);
console.log(`\nbbox base ${JSON.stringify(OUT.arms[b].bbox)}\nbbox cand ${JSON.stringify(OUT.arms[c].bbox)}`);
console.log(`samples off-frame: base ${OUT.arms[b].samplesOffFrame}, cand ${OUT.arms[c].samplesOffFrame}`);
console.log('\ncone/pool footprint (AGENTS.md §7.2 registered content):');
for (const n of names) for (const which of ['fullThrow', 'guaranteedFloor']) {
  const cf = OUT.cone[n][which];
  console.log(` ${n.padEnd(30)} ${which.padEnd(17)} pool in-frame ${(cf.pool.inFrameShare * 100).toFixed(1)}%  apex ${JSON.stringify(cf.apex)} farR ${JSON.stringify(cf.farR)}`);
}
console.log('\nwrote geocert2.json');

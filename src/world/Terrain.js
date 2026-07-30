import * as THREE from 'three';
import {
  rng, fbm2, ridged2, warpedFbm2, valueNoise2, worley2,
} from '../core/Rand.js';
import { Vegetation } from './Vegetation.js';
import { Water } from './Water.js';

/**
 * TERRAIN — the desert the Temple of Ra sits in.
 *
 * Owns: the sand sheet, the barchanoid/seif dune field, the authored approach ridge the
 * `dunes` camera stands on, the two background pyramid landforms, the Nile trench, the
 * distant dune horizon, and (via Vegetation.js / Water.js) everything that grows and flows.
 *
 * The one non-obvious art decision, from which everything else follows:
 *
 *   The key light rakes in from the WEST (Atmosphere's sun track: azimuth 186–191°,
 *   elevation 15–22° across the golden-hour shots). So the wind is authored blowing EAST.
 *   Windward slopes then face the sun and bleach out; every slip face falls away from it
 *   into violet-teal shadow. The landform generates its own three-band cel ramp before a
 *   single light touches it, and the crest lines — trending north–south — become
 *   perspective leading lines pointing straight at the temple in the `dunes` frame.
 *
 * Public query API (AGENTS.md §4.3 key `terrain`) — COLLISION / MOVEMENT / PROPS use these:
 *   terrain.heightAt(x, z)            → world y of the sand surface (fast, cached near play)
 *   terrain.normalAt(x, z, outVec3?)  → unit surface normal (smoothed, ripple-free)
 *   terrain.slopeAt(x, z)             → slope in radians
 *   terrain.isWater(x, z)             → true where the Nile surface is above the bed
 *   terrain.placeOn(obj, x, z, yOff)  → drop an Object3D onto the sand
 *   terrain.WATER_Y                   → -3, the Nile surface (AGENTS.md §8.1)
 */

const DEG = Math.PI / 180;

const TUNE = {
  seed: 20260730,

  /* --- wind regime ------------------------------------------------------- */
  crestAngle: 14 * DEG,   // dune crest lines trend 14° off due north
  slipTan: 0.6494,        // tan(33°), sand's angle of repose — the slip-face slope
  duneWave: 56,           // metres between crests in the primary field
  duneAmp: 9.2,           // crest height above the interdune floor
  transWave: 138,         // secondary transverse system, compounding the primary
  transAmp: 3.4,
  megaWave: 1.55,         // geometry-scale megaripples
  megaAmp: 0.085,
  rippleWave: 0.30,       // wind ripples — normal-map scale, the close-range sand tell
  rippleTile: 9.6,        // metres per ripple-map tile (32 ripples across it)

  /* --- authored landforms ------------------------------------------------ */
  ridgeZ: 79,             // approach-ridge crest line, §8.1 wants z ∈ [70,96], y ≈ 16
  ridgeH: 17.4,
  baseSwell: 3.1,         // broad, non-grid-aligned undulation of the sand sheet

  /* --- the complex ------------------------------------------------------- */
  padX: 26.5, padZ0: -57.0, padZ1: 37.5,   // ARCHITECTURE's paving; we blend flush into it
  padFade: 16,            // metres over which the dune field dies into the courtyard
  padLip: 0.30,           // how deep sand drifts *over* the edge of their paving
  driftWindward: 5.4,     // sand ramped against the temple's west (windward) wall
  driftLee: 3.6,          // the longer, lower tail streaming off the east side

  /* --- Nile -------------------------------------------------------------- */
  nileEast: -66, nileBank: -84, nileWest: -252, nileFar: -272,
  waterY: -3,

  /* --- world extent ------------------------------------------------------ */
  horizonStart: 320, horizonEnd: 820, horizonLow: 13, horizonHigh: 32,
};

/* §2.2 palette. Everything the terrain paints is one of these or a blend of them. */
const PAL = {
  sandLight: 0xe6b878, sandMid: 0xc9915a, sandDark: 0x8a5a38, crevice: 0x4a2f22,
  bleach: 0xf0d29a,                       // wind-polished, sun-facing crest
  shadow: 0x2a3f66,                       // §2.2 shadow hue — violet-teal, never grey
  bedrock: 0x8d7c5c,                      // wind-scoured patches where the sheet is thin
  gravel: 0xa3805c,                       // coarse interdune floor
  damp: 0x6b4a30, mud: 0x4a3524,          // Nile margin
  limeLight: 0xf0e3c8, limeMid: 0xd4c19a, limeDark: 0x9a8462,
  haze: 0xe8b878,
};

/* ─────────────────────────────────────────────────────────────────────────────
   Scalar helpers. Hoisted; the height field is called millions of times at init
   and a few thousand times a frame by COLLISION, so nothing here allocates.
───────────────────────────────────────────────────────────────────────────── */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}
/** Distance from (x,z) to the edge of an axis-aligned rect; 0 when inside. */
function outsideRect(x, z, x0, x1, z0, z1) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  return dx === 0 ? dz : dz === 0 ? dx : Math.sqrt(dx * dx + dz * dz);
}

const CA = Math.cos(TUNE.crestAngle);
const SA = Math.sin(TUNE.crestAngle);
const S = TUNE.seed;

/* ─────────────────────────────────────────────────────────────────────────────
   Dune morphology.

   A dune is NOT a lump of fBm. It is a strongly asymmetric wave: a long shallow
   windward ramp (10–15°) rising to a sharp brink, then a planar slip face at the
   angle of repose (33°) with a small concave apron at its foot. Everything below
   builds that wave explicitly and uses noise only to decide *where* the crests
   run and *how tall* they are.
───────────────────────────────────────────────────────────────────────────── */

/**
 * One asymmetric dune wave. `f` is the 0..1 phase across the crest, `A` the crest
 * height, `L` the wavelength. The slip-face fraction is derived from A and L so the
 * lee slope always comes out at the angle of repose no matter how the noise fields
 * modulate the dune — that is what makes it read as sand rather than as terrain noise.
 */
function duneProfile(f, A, L) {
  let sf = A / (TUNE.slipTan * L);
  if (sf < 0.10) sf = 0.10; else if (sf > 0.42) sf = 0.42;
  const wf = 1 - sf;
  if (f < wf) {
    // Windward: S-curve (concave at the foot, convex under the brink) plus a linear
    // term so the brink arrives at a real slope instead of flattening off.
    const t = f / wf;
    return A * (t * t * (3 - 2 * t) * 0.82 + t * 0.18);
  }
  // Lee: near-planar at ~33°, easing into the apron at the base.
  const s = (f - wf) / sf;
  return A * (1 - (s * 0.88 + 0.12 * s * s * (3 - 2 * s)));
}

/** Primary dune field: long sinuous N–S ridges, windward flanks facing the sun. */
function dunes(x, z) {
  const u = x * CA - z * SA;   // across the crests; downwind (east) is +u
  const v = x * SA + z * CA;   // along the crests

  // Crest lines wander. Sampling a *warped* fbm along v and offsetting u by it is what
  // turns a row of straight extrusions into barchanoid, crescent-horned ridges.
  const meander = 31 * warpedFbm2(v * 0.0030, u * 0.0012,
    { octaves: 3, gain: 0.55, warp: 1.2, seed: S + 223 });

  // Amplitude field: continuous transverse ridges in places, isolated barchans marching
  // over a bare sand sheet in others. Without this the field reads as wallpaper.
  const amp = clamp01(0.40 + 0.98 * warpedFbm2(u * 0.0033, v * 0.0021,
    { octaves: 3, gain: 0.5, warp: 0.9, seed: S + 227 }));
  if (amp < 0.02) return 0;

  // Ridged noise *along* the crest breaks each ridge into a chain of peaks and saddles.
  const peaks = ridged2(v * 0.011, u * 0.0045, { octaves: 3, gain: 0.5, seed: S + 229 });

  const L = TUNE.duneWave * (0.82 + 0.36 * valueNoise2(v * 0.0042, u * 0.0035, S + 233));
  const A = TUNE.duneAmp * amp * (0.60 + 0.74 * peaks);
  if (A < 0.05) return 0;

  const ph = (u + meander) / L;
  return duneProfile(ph - Math.floor(ph), A, L);
}

/** Secondary, much longer transverse system. Compound dunes, not a single wave train. */
function transverse(x, z) {
  const p = (z * 0.978 + x * 0.208) / TUNE.transWave
    + 0.55 * fbm2(x * 0.0040, z * 0.0020, { octaves: 2, seed: S + 241 });
  const A = TUNE.transAmp * clamp01(0.38 + 0.92 * fbm2(x * 0.0026, z * 0.0026,
    { octaves: 3, seed: S + 243 }));
  if (A < 0.05) return 0;
  return duneProfile(p - Math.floor(p), A, TUNE.transWave);
}

/**
 * Megaripples — 1.5 m corrugation lying across the flanks, parallel to the crests.
 * This scale IS carried in geometry (the inner ring resolves it); the 0.3 m wind
 * ripples on top of it are carried in the normal map.
 */
function megaRipples(x, z) {
  const u = x * CA - z * SA, v = x * SA + z * CA;
  const wob = 1.15 * fbm2(v * 0.045, u * 0.012, { octaves: 2, seed: S + 251 });
  const env = clamp01(0.30 + 0.90 * fbm2(u * 0.020, v * 0.012, { octaves: 2, seed: S + 257 }));
  return TUNE.megaAmp * env * Math.sin((u + wob) * (Math.PI * 2 / TUNE.megaWave));
}

/** Broad swells in the sand sheet itself — the large forms, domain-warped so they never grid up. */
function baseSwell(x, z) {
  return TUNE.baseSwell * warpedFbm2(x * 0.0042, z * 0.0042,
    { octaves: 4, gain: 0.52, warp: 1.1, seed: S + 211 });
}

/* ── authored landforms ──────────────────────────────────────────────────── */

/**
 * The approach ridge (§8.1: z ∈ [70,96], crest y ≈ 16). Authored rather than emergent —
 * the `dunes` camera stands on it, so it has to actually be there. Long walkable 20°
 * windward climb on the temple side (the processional approach), proper 33° slip face
 * falling away behind it.
 */
function approachRidge(x, z) {
  if (z < 30) return 0;
  const cz = TUNE.ridgeZ + 4.6 * Math.sin(x * 0.021)
    + 3.2 * fbm2(x * 0.010, 3.1, { octaves: 3, seed: S + 71 });
  const H = TUNE.ridgeH * (1 + 0.10 * fbm2(x * 0.013, 8.7, { octaves: 3, seed: S + 73 }));
  if (z < cz) {
    const t = clamp01((z - 34) / (cz - 34));
    return H * (t * t * (3 - 2 * t) * 0.86 + t * 0.14);
  }
  const s = (z - cz) * TUNE.slipTan / H;
  if (s >= 1) return 0;
  return H * (1 - (s * 0.88 + 0.12 * s * s * (3 - 2 * s)));
}

/** 1 inside ARCHITECTURE's paving, falling to 0 `padFade` metres outside it. */
function complexMask(x, z) {
  return 1 - smoothstep(0, TUNE.padFade,
    outsideRect(x, z, -TUNE.padX - 0.5, TUNE.padX + 0.5, TUNE.padZ0 - 1, TUNE.padZ1 + 0.5));
}

/** The processional causeway up the ridge (§8.1 sphinx avenue). Dune detail is damped
    here so the avenue stays a clean, readable, walkable ramp. */
function avenueMask(x, z) {
  return 0.82 * (1 - smoothstep(0, 10, outsideRect(x, z, -11, 11, 34, 98)));
}

/**
 * Sand drifted against the complex. Nothing says "placed in a world" like this: a
 * concave fillet ramping up the windward (west) wall, a longer shallower tail in the
 * lee, and irregular tongues rather than an even bevel.
 */
function drift(x, z) {
  const d = outsideRect(x, z, -TUNE.padX, TUNE.padX, TUNE.padZ0, TUNE.padZ1);
  if (d <= 0 || d > 34) return 0;
  let amp, reach;
  if (x < -TUNE.padX) { amp = TUNE.driftWindward; reach = 22; }        // windward ramp
  else if (x > TUNE.padX) { amp = TUNE.driftLee; reach = 34; }         // lee tail
  else if (z < TUNE.padZ0) { amp = 3.0; reach = 20; }                  // north end
  else { amp = 2.1; reach = 15; }                                      // entry front
  if (d > reach) return 0;
  const tongue = clamp01(0.40 + 0.85 * warpedFbm2(x * 0.028, z * 0.028,
    { octaves: 3, warp: 0.8, seed: S + 131 }));
  const f = 1 - d / reach;
  return amp * f * f * tongue;
}

/** Drift mounds at each sphinx pedestal (§8.1: x = ±7, z = 40…84, 8 pairs). */
function sphinxDrift(x, z) {
  const ax = Math.abs(x);
  if (ax < 3.4 || ax > 11.6 || z < 34 || z > 90) return 0;
  const px = 7;
  const step = (84 - 40) / 7;
  const k = Math.round((z - 40) / step);
  const pz = 40 + k * step;
  const dx = ax - px, dz = z - pz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 4.6) return 0;
  const t = 1 - d / 4.6;
  // Heavier on the windward (west, −x) flank of each pedestal.
  const side = 0.55 + 0.55 * clamp01((px - ax) / 3.2);
  return 0.95 * t * t * side * (0.7 + 0.6 * valueNoise2(x * 0.5, z * 0.5, S + 311));
}

/** A thin sheet of sand lying *on* their paving near its edge, hiding the join. */
function paveDrift(x, z) {
  const inset = Math.min(
    Math.min(x + TUNE.padX, TUNE.padX - x),
    Math.min(z - TUNE.padZ0, TUNE.padZ1 - z)
  );
  if (inset < -0.4 || inset > 8) return 0;
  const t = 1 - smoothstep(0, 8, Math.max(inset, 0));
  // Patchy — some stretches are swept clean stone, some are buried.
  const patch = clamp01(0.28 + 1.25 * warpedFbm2(x * 0.05, z * 0.05,
    { octaves: 3, warp: 0.7, seed: S + 149 }));
  return TUNE.padLip * t * t * patch;
}

/* Background pyramids (§8.1). They stand on low rock plateaus, as Giza's do. */
const PYRAMIDS = [
  { x: -150, z: -190, h: 105, halfBase: 82, baseY: 6.5, courses: 24, brokenApex: 0.055, rot: 0.05, seed: 4021 },
  { x: 95, z: -250, h: 72, halfBase: 57, baseY: 4.0, courses: 18, brokenApex: 0.0, rot: -0.11, seed: 8093 },
];

function pyramidPlateau(x, z, out) {
  let y = 0, w = 0;
  for (let i = 0; i < PYRAMIDS.length; i++) {
    const p = PYRAMIDS[i];
    const dx = x - p.x, dz = z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const r = p.halfBase * 1.3;
    const t = 1 - smoothstep(r, r + 110, d);
    if (t > w) { w = t; y = p.baseY; }
  }
  out[0] = y; out[1] = w;
  return out;
}
const _plateau = [0, 0];

/** Distant dune mountains ringing the world so it never ends in a hard edge. */
function horizonSwell(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const t = smoothstep(TUNE.horizonStart, TUNE.horizonEnd, r);
  if (t <= 0) return 0;
  const inv = 1 / (r || 1);
  const big = fbm2(x * inv * 2.6 + r * 0.0018, z * inv * 2.6 - r * 0.0011,
    { octaves: 4, gain: 0.55, seed: S + 181 });
  return t * t * (TUNE.horizonLow + (TUNE.horizonHigh - TUNE.horizonLow)
    * clamp01(0.5 + 0.65 * big));
}

/** 0 east of the Nile, 1 over open water, back to 0 beyond the western escarpment. */
function nileWeight(x, z) {
  const m = 7.0 * fbm2(z * 0.0055, 11.3, { octaves: 3, seed: S + 91 });
  const east = smoothstep(TUNE.nileEast + m, TUNE.nileBank + m, x);
  if (east <= 0) return 0;
  const west = 1 - smoothstep(TUNE.nileWest + m * 0.6, TUNE.nileFar + m * 0.6, x);
  return east * west;
}

function nileBed(x, z) {
  return -5.7 - 1.8 * fbm2(x * 0.006, z * 0.0035, { octaves: 3, seed: S + 97 });
}

/* ─────────────────────────────────────────────────────────────────────────────
   The height field. One pure function; the mesh, the collision proxy, the vegetation
   scatter and the vertex colouring all agree because they all come from here.
───────────────────────────────────────────────────────────────────────────── */

function rawHeight(x, z) {
  const cm = complexMask(x, z);
  const av = avenueMask(x, z);
  const damp = cm + av * (1 - cm);          // dune detail suppressor
  const dw = 1 - damp;

  let h = baseSwell(x, z) * (1 - 0.72 * damp);
  if (dw > 0.003) {
    h += dunes(x, z) * dw;
    h += transverse(x, z) * dw;
    h += megaRipples(x, z) * (1 - 0.55 * damp);
  }
  h += approachRidge(x, z) * (1 - cm);
  h += horizonSwell(x, z);

  h *= 1 - cm;                              // flush into the courtyard floor at y = 0
  h += drift(x, z) + sphinxDrift(x, z) + paveDrift(x, z);
  h -= cm * 0.055;                          // 5 cm under their paving: no z-fighting

  pyramidPlateau(x, z, _plateau);
  if (_plateau[1] > 0.002) h = lerp(h, _plateau[0], _plateau[1]);

  const nw = nileWeight(x, z);
  if (nw > 0.002) h = lerp(h, nileBed(x, z), nw);

  return h;
}

/* ── surface colour ──────────────────────────────────────────────────────────
   Baked per vertex as a *multiplier* on the material's base sand colour, so if a
   toon material ignores the colour attribute the terrain still reads as sand
   instead of as grey. Ratios are computed in linear space (THREE.Color is linear
   once ColorManagement has converted the sRGB hex).
──────────────────────────────────────────────────────────────────────────── */

const _cBase = new THREE.Color(PAL.sandMid);
const _cWork = new THREE.Color();
const _cTmp = new THREE.Color();
const COL = {};
for (const k in PAL) COL[k] = new THREE.Color(PAL[k]);

/** Sun direction at golden hour, west and low — matches Atmosphere's track at tod 0.79. */
const SUN = new THREE.Vector3(-0.922, 0.3746, -0.0969);

/**
 * Aspect-driven sand albedo. Real sand does this: wind-polished sun-facing ramps
 * bleach out, freshly avalanched slip faces are coarser and darker, interdune floors
 * are gravelly, and the sheet thins to bedrock where the wind scours.
 */
function sandColor(x, z, h, nx, ny, nz, out) {
  // How much this face turns into the sun, using the horizontal component only so the
  // effect tracks *aspect* rather than doubling up on the shader's own N·L.
  const face = clamp01((nx * -0.9226 + nz * -0.0969) * 2.1);
  const lee = clamp01((nx * 0.9226 + nz * 0.0969) * 2.4);
  const steep = clamp01((1 - ny) * 3.2);

  out.copy(COL.sandMid);
  // Windward ramps bleach warm.
  out.lerp(COL.bleach, 0.72 * face);
  // Slip faces fall into §2.2's violet-teal shadow hue, not into grey.
  _cTmp.copy(COL.sandDark).lerp(COL.shadow, 0.34);
  out.lerp(_cTmp, 0.80 * lee * (0.35 + 0.65 * steep));

  // Wind-scoured patches: the sheet thins and bedrock shows through.
  const w = worley2(x * 0.014, z * 0.014, S + 401);
  const scour = clamp01((w.f2 - w.f1) * 1.6 - 0.35) * clamp01(1.1 - steep);
  out.lerp(COL.bedrock, 0.62 * scour);

  // Coarse gravel collects on the interdune floors.
  const low = 1 - smoothstep(0.6, 4.5, h - baseSwell(x, z) * 0.4);
  out.lerp(COL.gravel, 0.30 * low * (1 - scour));

  // Damp, dark sand along the Nile margin, mud at the waterline.
  const nw = nileWeight(x, z);
  if (nw > 0.001) {
    out.lerp(COL.damp, clamp01(nw * 2.6));
    if (h < TUNE.waterY + 1.2) out.lerp(COL.mud, clamp01((TUNE.waterY + 1.2 - h) * 0.7));
  }

  // Fine grain variation so no two square metres are the same tone.
  const g = 0.94 + 0.13 * valueNoise2(x * 0.9, z * 0.9, S + 409)
    + 0.05 * valueNoise2(x * 7.0, z * 7.0, S + 411);
  out.multiplyScalar(g);

  // → multiplier on the material base colour
  out.r /= _cBase.r || 1e-4; out.g /= _cBase.g || 1e-4; out.b /= _cBase.b || 1e-4;
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* MODULE                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

/* Scratch — update() must not allocate (AGENTS.md §5). */
const _v3 = new THREE.Vector3();

export class Terrain {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'terrain';

    this.WATER_Y = TUNE.waterY;
    this.tune = TUNE;
    this.palette = PAL;

    this.rings = [];
    this._materials = [];
    this._textures = [];
    this._geoms = [];

    /* Cached height grid over the play area. COLLISION and MOVEMENT hammer heightAt(),
       and the analytic field is ~45 noise evaluations deep — far too expensive per query.
       Grid pitch matches the inner ring's vertex spacing closely enough that the cached
       surface and the rendered triangles agree to a couple of centimetres. */
    this._cacheHalf = 176;
    this._cacheStep = 1.0;
    this._cacheN = Math.round((this._cacheHalf * 2) / this._cacheStep) + 1;
    this._cacheZ0 = -80;            // grid is centred on the play area, not the origin
    this._cacheX0 = -this._cacheHalf;
    this._cache = null;

    this.vegetation = new Vegetation(engine, this);
    this.water = new Water(engine, this);
  }

  /* ── public query API ─────────────────────────────────────────────────── */

  /** World y of the sand surface. Cached bilinear near the play area, analytic outside. */
  heightAt(x, z) {
    const c = this._cache;
    if (c) {
      const fx = (x - this._cacheX0) / this._cacheStep;
      const fz = (z - this._cacheZ0) / this._cacheStep;
      if (fx >= 0 && fz >= 0 && fx <= this._cacheN - 1.001 && fz <= this._cacheN - 1.001) {
        const ix = fx | 0, iz = fz | 0;
        const tx = fx - ix, tz = fz - iz;
        const i0 = iz * this._cacheN + ix;
        const h00 = c[i0], h10 = c[i0 + 1];
        const h01 = c[i0 + this._cacheN], h11 = c[i0 + this._cacheN + 1];
        return (h00 + (h10 - h00) * tx) * (1 - tz) + (h01 + (h11 - h01) * tx) * tz;
      }
    }
    return rawHeight(x, z);
  }

  /** Unit surface normal. Smoothed over ~1 m so MOVEMENT doesn't trip on megaripples. */
  normalAt(x, z, out) {
    const o = out || _v3;
    const e = 0.6;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return o.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  /** Slope in radians (0 = flat). MOVEMENT's ground/wall threshold is 50°/70° (§4.4). */
  slopeAt(x, z) {
    this.normalAt(x, z, _v3);
    return Math.acos(clamp01(_v3.y));
  }

  /** True where the Nile surface stands above the bed. */
  isWater(x, z) {
    return this.heightAt(x, z) < TUNE.waterY - 0.02;
  }

  /** Drop an Object3D onto the sand. PROPS/GUARDS: use this for anything outside the paving. */
  placeOn(obj, x, z, yOffset = 0) {
    obj.position.set(x, this.heightAt(x, z) + yOffset, z);
    return obj;
  }

  /* ── init ─────────────────────────────────────────────────────────────── */

  async init() {
    const t0 = performance.now();
    try {
      this._buildCache();
      this._buildTextures();
      this._buildSand();
      this._buildPyramids();
      this.engine.scene.add(this.group);
    } catch (err) {
      this.engine.warn(`terrain: sand build failed — ${err?.message || err}`);
      console.error('[terrain]', err);
    }

    try { await this.water.init(); } catch (err) {
      this.engine.warn(`terrain: Nile failed — ${err?.message || err}`);
      console.error('[terrain/water]', err);
    }
    try { await this.vegetation.init(); } catch (err) {
      this.engine.warn(`terrain: vegetation failed — ${err?.message || err}`);
      console.error('[terrain/vegetation]', err);
    }

    this._buildTime = performance.now() - t0;
  }

  _buildCache() {
    const n = this._cacheN;
    const c = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const z = this._cacheZ0 + j * this._cacheStep;
      const row = j * n;
      for (let i = 0; i < n; i++) {
        c[row + i] = rawHeight(this._cacheX0 + i * this._cacheStep, z);
      }
    }
    this._cache = c;
  }

  update(dt, t) {
    this.water.update(dt, t);
    this.vegetation.update(dt, t);
  }

  dispose() {
    this.vegetation.dispose();
    this.water.dispose();
    this.group.removeFromParent();
    for (const g of this._geoms) g.dispose();
    for (const m of this._materials) m.dispose();
    for (const t of this._textures) t.dispose();
    this._geoms.length = 0; this._materials.length = 0; this._textures.length = 0;
    this._cache = null;
  }

  /* ── shared helpers for peers that may not exist yet ─────────────────── */

  /** TEXTURES may not have landed. Never let that be fatal. */
  tex(name, fallback = null) {
    const t = this.engine.get('textures');
    if (!t) return fallback;
    try {
      const v = (t.get && t.get(name)) || (t.getTexture && t.getTexture(name)) || null;
      return v || fallback;
    } catch { return fallback; }
  }

  /**
   * SHADING owns the cel-shading model, but it is a parallel agent and may be null.
   * Fall back to MeshStandardMaterial with equivalent parameters so the work is always
   * visible (AGENTS.md §4.4 says guard every engine.get).
   */
  mat(opts, std = {}) {
    const shading = this.engine.get('shading');
    if (shading && typeof shading.toon === 'function') {
      try {
        const m = shading.toon(opts);
        if (m) { this._materials.push(m); return m; }
      } catch (err) {
        this.engine.warn(`terrain: shading.toon threw — ${err?.message || err}`);
      }
    }
    const m = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      normalMap: opts.normalMap ?? null,
      roughness: std.roughness ?? (1 - (opts.gloss ? 0.35 : 0.08)),
      metalness: std.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      alphaTest: opts.alphaTest ?? 0,
      vertexColors: !!opts.vertexColors,
      flatShading: !!std.flatShading,
      fog: true,
      ...(opts.normalScale ? { normalScale: opts.normalScale } : {}),
    });
    this._materials.push(m);
    return m;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SAND — textures, adaptive rings, collision proxy                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Concentric rings of halving density (a clipmap without the scrolling, since the
 * level is a fixed playspace). Steps are chosen so every ring's cell size is an exact
 * integer multiple of its inner neighbour's — that lets the fine ring's outer boundary
 * be *stitched* onto the coarse lattice, which removes clipmap cracks outright instead
 * of hiding them under skirts.
 *
 *   ring   half-extent   cell    covers
 *   0        76.8 m      0.8 m   the whole playspace + the approach ridge
 *   1       192.0 m      4.8 m   the near desert, the Nile's east bank
 *   2       460.8 m     19.2 m   the pyramid plateaus
 *   3      1152.0 m     38.4 m   the hazed dune horizon
 */
const RING_CX = 0, RING_CZ = 24;      // centred on the playspace, not on the origin
const RINGS = [
  { half: 76.8, step: 0.8, hole: 0 },
  { half: 192.0, step: 4.8, hole: 76.8 },
  { half: 460.8, step: 19.2, hole: 192.0 },
  { half: 1152.0, step: 38.4, hole: 460.8 },
];
/** Inner-ring cell size by quality. Each must divide 4.8 exactly (see stitching above). */
const INNER_STEP = { low: 1.6, med: 0.96, high: 0.8, ultra: 0.6 };

Object.assign(Terrain.prototype, {

  /* ── procedural maps ──────────────────────────────────────────────────── */

  _buildTextures() {
    const aniso = this.engine.maxAniso || 4;

    // Wind ripples. Requested from TEXTURES first (`sand_ripples`); generated here when
    // that agent hasn't landed, because 0.3 m ripples are *the* close-range sand tell and
    // the terrain must never ship without them.
    this.rippleMap = this.tex('sand_ripples') || this._makeRippleNormal(512);
    this.rippleMap.wrapS = this.rippleMap.wrapT = THREE.RepeatWrapping;
    this.rippleMap.anisotropy = aniso;
    this.rippleMap.center.set(0.5, 0.5);
    this.rippleMap.rotation = TUNE.crestAngle;   // ripple lines run parallel to the crests
    const rr = 1 / TUNE.rippleTile;
    this.rippleMap.repeat.set(rr, rr);

    // Albedo detail. TEXTURES' tiling `sand_fine` if it exists, otherwise a world-scale
    // macro-variation map (stains, dust, scour) that cannot tile because it is unique.
    const fine = this.tex('sand_fine');
    if (fine) {
      this.sandMap = fine;
      this.sandMap.wrapS = this.sandMap.wrapT = THREE.RepeatWrapping;
      this.sandMap.repeat.set(1 / 8, 1 / 8);
    } else {
      this.sandMap = this._makeMacroAlbedo(256, 1100);
      this.sandMap.wrapS = this.sandMap.wrapT = THREE.ClampToEdgeWrapping;
      this.sandMap.repeat.set(1 / 1100, 1 / 1100);
      this.sandMap.offset.set(0.5, 0.5);
    }
    this.sandMap.anisotropy = aniso;
    this.sandMap.colorSpace = THREE.SRGBColorSpace;
  },

  _canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  },

  /**
   * Asymmetric wind ripples baked to a tangent-space normal map. 32 ripples across a
   * 9.6 m tile → 0.30 m wavelength (§ the brief). Built from integer-frequency sine sums
   * so the tile is exactly periodic; the crest wobble keeps the lines from ruling straight.
   */
  _makeRippleNormal(size) {
    const cyc = Math.round(TUNE.rippleTile / TUNE.rippleWave);   // 32
    const r = rng(TUNE.seed + 0x71);
    // Tileable "noise": integer-frequency sine sum.
    const terms = [];
    for (let i = 0; i < 9; i++) {
      terms.push([r.int(1, 7), r.int(1, 7), r() * Math.PI * 2, 1 / (1 + i * 0.9)]);
    }
    const wobble = (u, v) => {
      let s = 0, n = 0;
      for (let i = 0; i < terms.length; i++) {
        const [fu, fv, ph, a] = terms[i];
        s += a * Math.sin(Math.PI * 2 * (fu * u + fv * v) + ph);
        n += a;
      }
      return s / n;
    };
    const height = (u, v) => {
      // Primary ripple train, asymmetric like the real thing (gentle stoss, steep lee).
      const p = (u + 0.055 * wobble(u * 1.0, v * 1.0)) * cyc;
      let h = duneProfile(p - Math.floor(p), 1, 1) * 1.0;
      // Secondary, longer ripples riding over them.
      const p2 = (u * 0.34 + v * 0.06 + 0.09 * wobble(v, u)) * cyc;
      h += 0.45 * duneProfile(p2 - Math.floor(p2), 1, 1);
      // Grain.
      h += 0.10 * wobble(u * 6.0, v * 6.0);
      return h;
    };

    const canvas = this._canvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const inv = 1 / size;
    // Strength: ~2 cm of relief over a 0.3 m wavelength.
    const k = size * 0.030;
    for (let j = 0; j < size; j++) {
      const v = j * inv;
      for (let i = 0; i < size; i++) {
        const u = i * inv;
        const hl = height(u - inv, v), hr = height(u + inv, v);
        const hd = height(u, v - inv), hu = height(u, v + inv);
        let nx = (hl - hr) * k, ny = (hd - hu) * k, nz = 1;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        nx *= l; ny *= l; nz = l;
        const o = (j * size + i) * 4;
        d[o] = (nx * 0.5 + 0.5) * 255;
        d[o + 1] = (ny * 0.5 + 0.5) * 255;
        d[o + 2] = nz * 255;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this._textures.push(t);
    return t;
  },

  /**
   * World-scale macro albedo. Deliberately low frequency and unique across the whole
   * desert: its job is to guarantee no square metre of sand shares a tone with another,
   * and to survive even if a peer material drops the colour attribute.
   */
  _makeMacroAlbedo(size, extent) {
    const canvas = this._canvas(size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const c = new THREE.Color();
    const half = extent * 0.5;
    for (let j = 0; j < size; j++) {
      const z = -half + (j + 0.5) * (extent / size);
      for (let i = 0; i < size; i++) {
        const x = -half + (i + 0.5) * (extent / size);

        // Broad tonal drift + wind streaks combed along the transport direction.
        const drift0 = warpedFbm2(x * 0.0026, z * 0.0026, { octaves: 4, warp: 1.0, seed: S + 601 });
        const u = x * CA - z * SA, v = x * SA + z * CA;
        const streak = fbm2(v * 0.006, u * 0.055, { octaves: 3, seed: S + 607 });

        c.setRGB(1, 1, 1);
        c.multiplyScalar(0.90 + 0.16 * clamp01(0.5 + 0.6 * drift0) + 0.06 * streak);

        // Scour patches read cooler and greyer where bedrock is close to the surface.
        const w = worley2(x * 0.014, z * 0.014, S + 401);
        const scour = clamp01((w.f2 - w.f1) * 1.6 - 0.32);
        c.lerp(_cTmp.setRGB(0.80, 0.79, 0.74), 0.55 * scour);

        // Damp margin along the Nile.
        const nw = nileWeight(x, z);
        if (nw > 0.001) c.lerp(_cTmp.setRGB(0.62, 0.58, 0.55), clamp01(nw * 1.9));

        const o = (j * size + i) * 4;
        d[o] = Math.min(255, Math.sqrt(c.r) * 255);      // rough linear→sRGB
        d[o + 1] = Math.min(255, Math.sqrt(c.g) * 255);
        d[o + 2] = Math.min(255, Math.sqrt(c.b) * 255);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this._textures.push(t);
    return t;
  },

  /* ── the sand itself ──────────────────────────────────────────────────── */

  _buildSand() {
    const innerStep = INNER_STEP[this.engine.quality] ?? INNER_STEP.high;

    const mat = this.mat({
      color: PAL.sandMid,
      map: this.sandMap,
      normalMap: this.rippleMap,
      normalScale: new THREE.Vector2(1.35, 1.35),
      bands: 3,
      rim: 0.30,
      rimColor: 0x7fd4ff,
      spec: 0.06, gloss: 12,
      outline: 0,               // an 800 m inverted hull would be absurd
      detail: 'sand',
      vertexColors: true,
    }, { roughness: 0.94, metalness: 0 });
    this.sandMaterial = mat;

    for (let i = 0; i < RINGS.length; i++) {
      const spec = RINGS[i];
      const step = i === 0 ? innerStep : spec.step;
      const coarse = i < RINGS.length - 1 ? RINGS[i + 1].step : 0;
      const geo = this._buildRingGeometry(spec.half, step, spec.hole, coarse);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `sand_ring${i}`;
      mesh.receiveShadow = true;
      // Only the inner ring casts: dune crests throwing long shadows down the windward
      // ramps is most of what sells the 15° sun, and it is the only ring inside the
      // shadow camera anyway.
      mesh.castShadow = i === 0;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      this.rings.push(mesh);
      this._geoms.push(geo);
    }

    this._buildCollisionProxy();
  },

  /**
   * One square annulus. `coarseStep` (the neighbouring coarser ring's cell size) makes
   * the outer boundary vertices lie exactly on the coarse ring's linear interpolation,
   * so the two rings share a watertight edge.
   */
  _buildRingGeometry(half, step, holeHalf, coarseStep) {
    const n = Math.round((half * 2) / step);
    const nv = n + 1;
    const count = nv * nv;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3);

    const x0 = RING_CX - half, z0 = RING_CZ - half;

    for (let j = 0; j < nv; j++) {
      const z = z0 + j * step;
      const edgeZ = (j === 0 || j === n);
      for (let i = 0; i < nv; i++) {
        const x = x0 + i * step;
        const edgeX = (i === 0 || i === n);
        let y;
        if (coarseStep && (edgeX || edgeZ)) {
          y = this._stitchedHeight(x, z, edgeX, edgeZ, coarseStep);
        } else {
          y = rawHeight(x, z);
        }
        const k = (j * nv + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        const k2 = (j * nv + i) * 2;
        uv[k2] = x; uv[k2 + 1] = z;      // UVs are world metres; per-map repeat does the rest
      }
    }

    // Indices, skipping quads that fall inside the hole.
    const idx = [];
    const hh = holeHalf;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (hh > 0) {
          const qx = x0 + (i + 0.5) * step - RING_CX;
          const qz = z0 + (j + 0.5) * step - RING_CZ;
          if (Math.abs(qx) < hh && Math.abs(qz) < hh) continue;
        }
        const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
        // Alternate the diagonal so a triangulated dune crest doesn't read as a herringbone.
        if (((i + j) & 1) === 0) { idx.push(a, c, b, b, c, d); }
        else { idx.push(a, c, d, a, d, b); }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(idx, 1)
      : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    // Colour from the *computed* normal so the albedo aspect story matches the shaded form.
    const nrm = geo.attributes.normal.array;
    for (let v = 0; v < count; v++) {
      const p = v * 3;
      sandColor(pos[p], pos[p + 2], pos[p + 1], nrm[p], nrm[p + 1], nrm[p + 2], _cWork);
      col[p] = _cWork.r; col[p + 1] = _cWork.g; col[p + 2] = _cWork.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  },

  _stitchedHeight(x, z, edgeX, edgeZ, cs) {
    if (edgeX && edgeZ) return rawHeight(x, z);   // corners are on both lattices already
    if (edgeZ) {
      const a = Math.floor(x / cs) * cs;
      const t = (x - a) / cs;
      return t < 1e-6 ? rawHeight(a, z)
        : lerp(rawHeight(a, z), rawHeight(a + cs, z), t);
    }
    const a = Math.floor(z / cs) * cs;
    const t = (z - a) / cs;
    return t < 1e-6 ? rawHeight(x, a)
      : lerp(rawHeight(x, a), rawHeight(x, a + cs), t);
  },

  /**
   * A coarse, invisible proxy for COLLISION's BVH — sweeping a capsule against 74 k
   * render triangles would be daft. Everything that needs precision uses the analytic
   * `heightAt`/`normalAt` above; `userData.terrain` hands those to whoever holds the mesh.
   */
  _buildCollisionProxy() {
    const half = 168, step = 4.0;
    const n = Math.round(half * 2 / step), nv = n + 1;
    const pos = new Float32Array(nv * nv * 3);
    for (let j = 0; j < nv; j++) {
      const z = RING_CZ - half + j * step;
      for (let i = 0; i < nv; i++) {
        const x = RING_CX - half + i * step;
        const k = (j * nv + i) * 3;
        pos[k] = x; pos[k + 1] = this.heightAt(x, z); pos[k + 2] = z;
      }
    }
    const idx = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ wireframe: true, color: 0x2fa8a0 }));
    mesh.name = 'sand_collision';
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.terrain = this;
    mesh.userData.analytic = {
      heightAt: (x, z) => this.heightAt(x, z),
      normalAt: (x, z, out) => this.normalAt(x, z, out),
    };
    this.group.add(mesh);
    this._geoms.push(geo);
    this._materials.push(mesh.material);
    this.collisionProxy = mesh;

    this.engine.registerCollider(mesh, { tag: 'ground', material: 'sand' });
    this.engine.on('showColliders', (v) => { mesh.visible = !!v; });
  },

  /* ── background pyramids ──────────────────────────────────────────────── */

  _buildPyramids() {
    const base = new THREE.Color(PAL.limeMid);
    const mat = this.mat({
      color: PAL.limeMid,
      bands: 3,
      rim: 0.22,
      rimColor: 0x7fd4ff,
      spec: 0.04, gloss: 8,
      outline: 0,
      detail: 'limestone',
      vertexColors: true,
    }, { roughness: 0.95, metalness: 0, flatShading: true });

    for (const p of PYRAMIDS) {
      const geo = this._pyramidGeometry(p, base);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `pyramid_${p.h | 0}`;
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.rot;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      this.group.add(mesh);
      this._geoms.push(geo);
    }
  },

  /**
   * The pyramids read as silhouettes at 320 m through 85 % haze, so what matters is the
   * outline and the light/dark face split — not detail. They are built as stepped core
   * masonry (which is what Giza actually looks like with the casing gone), each course
   * eroded by a little noise, base corners deliberately unequal so the shape is never
   * mirror-symmetric, and a broken apex on the big one.
   */
  _pyramidGeometry(p, baseCol) {
    const r = rng(p.seed);
    const C = p.courses;
    const pos = [], col = [];
    const c = new THREE.Color();

    // Per-side scale: a perfectly square base is the #1 procedural-geometry tell.
    const sideScale = [1.0 + r.jitter(0.02), 1.0 + r.jitter(0.02), 1.0 + r.jitter(0.02), 1.0 + r.jitter(0.02)];
    const w = [];
    for (let i = 0; i <= C; i++) {
      const t = i / C;
      w.push(p.halfBase * (1 - t) * (1 + r.jitter(0.018)) + (i === C ? p.halfBase * 0.03 : 0));
    }
    const yOf = (i) => p.baseY + p.h * (i / C) * (1 - p.brokenApex * (i / C));

    // Aspect tint: the sun is west and low, so −X blazes and +X falls into shadow.
    // Bake ~24 % of the haze in as well, so they read as distant even before fog.
    const faceTone = (sx, sz, up) => {
      c.set(PAL.limeMid);
      if (up) c.lerp(_cTmp.set(PAL.limeLight), 0.75);
      else if (sx < 0) c.lerp(_cTmp.set(PAL.limeLight), 0.85);
      else if (sx > 0) c.lerp(_cTmp.set(PAL.limeDark), 0.72).lerp(_cTmp.set(PAL.shadow), 0.22);
      else if (sz > 0) c.lerp(_cTmp.set(PAL.limeMid), 0.5);
      else c.lerp(_cTmp.set(PAL.limeDark), 0.45).lerp(_cTmp.set(PAL.shadow), 0.12);
      return c;
    };

    const push = (x, y, z, cr, cg, cb) => {
      pos.push(x, y, z);
      col.push(cr / (baseCol.r || 1e-4), cg / (baseCol.g || 1e-4), cb / (baseCol.b || 1e-4));
    };
    const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, cc) => {
      const { r: R, g: G, b: B } = cc;
      push(ax, ay, az, R, G, B); push(bx, by, bz, R, G, B); push(cx, cy, cz, R, G, B);
      push(ax, ay, az, R, G, B); push(cx, cy, cz, R, G, B); push(dx, dy, dz, R, G, B);
    };

    // Four sides, as [outward x sign, outward z sign]
    const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let i = 0; i < C; i++) {
      const y0 = yOf(i), y1 = yOf(i + 1);
      // Sand banks against the bottom courses; the apex is bleached.
      const buried = 1 - smoothstep(0, 0.16, i / C);
      const bleach = smoothstep(0.55, 1.0, i / C);
      const jit = 1 + r.jitter(0.05);

      for (let s = 0; s < 4; s++) {
        const [sx, sz] = SIDES[s];
        const wa = w[i] * sideScale[s], wb = w[i + 1] * sideScale[s];
        const tone = faceTone(sx, sz, false);
        c.multiplyScalar(jit);
        c.lerp(_cTmp.set(PAL.sandMid), 0.55 * buried);
        c.lerp(_cTmp.set(PAL.limeLight), 0.18 * bleach);
        c.lerp(_cTmp.set(PAL.haze), 0.24);

        // Riser
        if (sx !== 0) {
          const X = sx * wa;
          quad(X, y0, -wa, X, y0, wa, X, y1, wa, X, y1, -wa, tone);
        } else {
          const Z = sz * wa;
          quad(-wa, y0, Z, wa, y0, Z, wa, y1, Z, -wa, y1, Z, tone);
        }
        // Tread (the horizontal step surface — this is what catches the low sun)
        const up = faceTone(0, 0, true);
        c.multiplyScalar(jit);
        c.lerp(_cTmp.set(PAL.sandMid), 0.62 * buried);
        c.lerp(_cTmp.set(PAL.haze), 0.24);
        if (sx !== 0) {
          quad(sx * wa, y1, -wa, sx * wa, y1, wa, sx * wb, y1, wb, sx * wb, y1, -wb, up);
        } else {
          quad(-wa, y1, sz * wa, wa, y1, sz * wa, wb, y1, sz * wb, -wb, y1, sz * wb, up);
        }
      }
    }

    // Apex — offset and knocked about so the tip is not a clean point.
    const ay = yOf(C) + p.h * 0.02 * (1 - p.brokenApex * 6);
    const apx = p.halfBase * r.jitter(0.05), apz = p.halfBase * r.jitter(0.05);
    const wt = w[C];
    const cap = faceTone(-1, 0, true);
    c.lerp(_cTmp.set(PAL.haze), 0.24);
    for (let s = 0; s < 4; s++) {
      const [sx, sz] = SIDES[s];
      const t = faceTone(sx, sz, false);
      c.lerp(_cTmp.set(PAL.limeLight), 0.2);
      c.lerp(_cTmp.set(PAL.haze), 0.24);
      const a = sx !== 0 ? [sx * wt, yOf(C), -wt] : [-wt, yOf(C), sz * wt];
      const b = sx !== 0 ? [sx * wt, yOf(C), wt] : [wt, yOf(C), sz * wt];
      push(a[0], a[1], a[2], t.r, t.g, t.b);
      push(b[0], b[1], b[2], t.r, t.g, t.b);
      push(apx, ay, apz, cap.r, cap.g, cap.b);
    }

    // Rubble apron: the debris skirt every eroded pyramid stands in. Also hides the
    // seam where the plateau meets the masonry.
    const seg = 13, ar = p.halfBase * 1.34, ah = p.h * 0.055;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const r0 = ar * (0.85 + r.range(0, 0.3)), r1 = ar * (0.85 + r.range(0, 0.3));
      c.set(PAL.sandMid).lerp(_cTmp.set(PAL.limeDark), 0.35 + r.range(0, 0.3));
      c.lerp(_cTmp.set(PAL.haze), 0.24);
      const t = c.clone();
      quad(
        Math.cos(a0) * r0, p.baseY - 1.5, Math.sin(a0) * r0,
        Math.cos(a1) * r1, p.baseY - 1.5, Math.sin(a1) * r1,
        Math.cos(a1) * p.halfBase * 1.01, p.baseY + ah, Math.sin(a1) * p.halfBase * 1.01,
        Math.cos(a0) * p.halfBase * 1.01, p.baseY + ah, Math.sin(a0) * p.halfBase * 1.01,
        t
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  },
});

import * as THREE from 'three';

/**
 * Atmosphere — the single source of truth for "what colour is the world right now".
 *
 * Sky.js and Lighting.js both resolve their state through `evalAtmosphere()`, which is a
 * pure function of `engine.debug.timeOfDay`. Two modules deriving the sun from one model is
 * the only way the sky and the key light can never disagree: if the sun disc in the dome sat
 * somewhere other than where the shadows point, the frame would die instantly.
 *
 * The palette anchors below ARE AGENTS.md §2.2. The scattering maths shapes the *gradient*;
 * the anchors pin the *hues*, so golden hour lands exactly on zenith #3f7fc4 / horizon
 * #f0c88a / haze #e8b878 rather than on whatever a physical model happens to produce.
 *
 * Everything here is allocation-free after construction — `evalAtmosphere` writes into a
 * state object you own (AGENTS.md §5).
 */

/* ── §2.2, verbatim ─────────────────────────────────────────────────────────── */
export const PALETTE = {
  keySun:     0xffd9a0,
  fillSky:    0x6fa8d8,
  bounceSand: 0xe8a852,
  rimCool:    0x7fd4ff,
  rimWarm:    0xff9a5c,
  skyZenith:  0x3f7fc4,
  skyHorizon: 0xf0c88a,
  skyHaze:    0xe8b878,
  shadowHue:  0x2a3f66,
  moon:       0x9ec4ff,
  inkWarm:    0x1a1210,
  inkCool:    0x161022,
  sandLight:  0xe6b878,
  sandMid:    0xc9915a,
};

/** Shadows may never fall below this fraction of key luminance (§2.2 "never below"). */
export const SHADOW_FLOOR = 0.14;

/* ── Sun / moon track ───────────────────────────────────────────────────────────
   Art-directed rather than astronomical. A real 24 h sinusoid puts sunset at tod 0.75,
   but Shots.js asks for 22° of elevation at tod 0.79, so the track is a keyed table:
   the canonical shots then land on exact, repeatable sun angles.
   Azimuth: 0° = +X east, 90° = +Z south, 180° = −X west. Summer-Egypt track, so the
   sun sets a touch north of west — that is what rakes the north–south temple axis. */
const SUN_ELEVATION = [
  [0.00, -62], [0.06, -52], [0.12, -38], [0.18, -14], [0.215, 0],
  [0.26,  12], [0.30,  22], [0.38,  48], [0.44,   66], [0.50, 76],
  [0.56,  66], [0.62,  48], [0.68,  38], [0.72,  33], [0.76, 26],
  [0.79,  22], [0.83,  15], [0.86,   8], [0.895,  0], [0.94, -22], [1.00, -62],
];
const SUN_AZIMUTH = [
  [0.00, 330], [0.18, 352], [0.215, 354], [0.30, 18], [0.40, 58], [0.50, 100],
  [0.60, 142], [0.68, 164], [0.72, 170], [0.76, 180], [0.79, 186],
  [0.83, 191], [0.895, 198], [0.94, 240], [1.00, 330],
];

/* The moon rides its own track so the `night` and `guard` shots get a big low moon
   parked where the camera is already looking, from an azimuth far off the sun's. */
const MOON_ELEVATION = [
  [0.00, 9], [0.02, 12], [0.06, 20], [0.12, 31], [0.18, 24], [0.24, 4],
  [0.30, -26], [0.70, -34], [0.86, -6], [0.92, 2], [0.96, 6], [1.00, 9],
];
const MOON_AZIMUTH = [
  [0.00, 292], [0.06, 297], [0.12, 308], [0.24, 326], [0.50, 20],
  [0.86, 268], [1.00, 292],
];

/** Smooth (cosine-eased) lookup through a keyed table. Monotone inside each span. */
function sampleTable(table, x) {
  const n = table.length;
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[n - 1][0]) return table[n - 1][1];
  let i = 0;
  while (i < n - 2 && table[i + 1][0] < x) i++;
  const [x0, y0] = table[i];
  const [x1, y1] = table[i + 1];
  const t = (x - x0) / (x1 - x0 || 1);
  // Cosine ease kills the visible kinks at the keys without dragging the keys off value.
  const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return y0 + (y1 - y0) * s;
}

/* ── Palette anchors, keyed on sun elevation ────────────────────────────────────
   Interpolating on *elevation* (not on tod) means the same sun height always produces
   the same light, morning or evening, and the GOLDEN anchor sits exactly on 22° so the
   §2.2 sky triplet is hit dead-on in every golden-hour shot. */
const C = (hex) => new THREE.Color(hex); // hex is sRGB; Color converts to linear working space

function anchor(elevation, o) {
  return {
    el: elevation,
    zenith:      C(o.zenith),
    horizon:     C(o.horizon),
    haze:        C(o.haze),
    violet:      C(o.violet),
    groundHaze:  C(o.groundHaze),
    sunDisc:     C(o.sunDisc),
    sunGlow:     C(o.sunGlow),
    sunColor:    C(o.sunColor),
    hemiSky:     C(o.hemiSky),
    hemiGround:  C(o.hemiGround),
    cloudLit:    C(o.cloudLit),
    cloudShadow: C(o.cloudShadow),
    cloudRim:    C(o.cloudRim),
    fogColor:    C(o.fogColor),
    fogTint:     C(o.fogTint),
    sunIntensity: o.sunIntensity,
    hemiIntensity: o.hemiIntensity,
    bounceIntensity: o.bounceIntensity,
    fogDensity: o.fogDensity,
    fogHeight: o.fogHeight,
    inscatter: o.inscatter,
    skyGain: o.skyGain,
    mieStrength: o.mieStrength,
    mieG: o.mieG,
    violetAmount: o.violetAmount,
    horizonPower: o.horizonPower,
    cloudCover: o.cloudCover,      // [cirrus, mid, cumulus] — higher = *less* cloud
    cloudBright: o.cloudBright,
    starAmount: o.starAmount,
    exposure: o.exposure,
  };
}

const ANCHORS = [
  /* Deep night: moonlit, everything cool, stars and the Milky Way carry the sky. */
  anchor(-16, {
    // Lifted off near-black. Measured through the composite, the old triplet resolved to
    // #000127 at the top of the `night` frame — a void, not a sky, which is §7.3's "empty
    // sky" and left the stars and the Milky Way with nothing to sit on. These land the
    // night dome in the #0b2550-#17427c band: still unmistakably night, still well under
    // any lit surface, but readable and blue rather than absent.
    zenith: 0x0e1c3c, horizon: 0x233a5e, haze: 0x263a5c, violet: 0x2a2450, groundHaze: 0x1a2440,
    sunDisc: 0x000000, sunGlow: 0x000000, sunColor: 0x9ec4ff,
    hemiSky: 0x2c4f8e, hemiGround: 0x3b3552,
    cloudLit: 0x7e97c4, cloudShadow: 0x141b34, cloudRim: 0x9cc0ff,
    fogColor: 0x1c2b48, fogTint: 0x33507f,
    sunIntensity: 0.0, hemiIntensity: 0.34, bounceIntensity: 0.10,
    fogDensity: 0.0040, fogHeight: 74, inscatter: 0.18,
    skyGain: 0.85, mieStrength: 0.20, mieG: 0.62, violetAmount: 0.22, horizonPower: 0.45,
    // The cumulus deck was ~53% dense at night, which is why `night` has "a mottled/streaky
    // texture and no stars, no moon". Only ~38% of the night dome was reaching camera.
    cloudCover: [0.67, 0.72, 0.74], cloudBright: 0.42, starAmount: 1.0, exposure: 1.0,
  }),

  /* Civil twilight — the last violet-magenta band before the sun clears the horizon. */
  anchor(-5, {
    zenith: 0x172c58, horizon: 0x7d4c66, haze: 0x6a4059, violet: 0x5c3a6e, groundHaze: 0x4a3348,
    sunDisc: 0xd06a3c, sunGlow: 0xb2543c, sunColor: 0xd08050,
    hemiSky: 0x3f5f97, hemiGround: 0x8a5a52,
    cloudLit: 0xd08a72, cloudShadow: 0x2e2848, cloudRim: 0xf0a070,
    fogColor: 0x5e4256, fogTint: 0xa8615a,
    sunIntensity: 0.22, hemiIntensity: 0.46, bounceIntensity: 0.16,
    fogDensity: 0.0058, fogHeight: 50, inscatter: 0.55,
    skyGain: 0.80, mieStrength: 0.85, mieG: 0.72, violetAmount: 0.40, horizonPower: 0.38,
    cloudCover: [0.65, 0.70, 0.73], cloudBright: 0.70, starAmount: 0.55, exposure: 1.0,
  }),

  /* Sunset / sunrise: the disc on the horizon, maximum Mie, hottest horizon. */
  anchor(2, {
    zenith: 0x2d5c9e, horizon: 0xffb268, haze: 0xe79a62, violet: 0x8f6aa8, groundHaze: 0xc07a54,
    sunDisc: 0xffc07a, sunGlow: 0xff9a5c, sunColor: 0xffb072,
    hemiSky: 0x5a86bd, hemiGround: 0xd08a48,
    cloudLit: 0xffcf9e, cloudShadow: 0x6e5a96, cloudRim: 0xffb072,
    fogColor: 0xdb9a68, fogTint: 0xff9a5c,
    sunIntensity: 1.45, hemiIntensity: 0.66, bounceIntensity: 0.30,
    fogDensity: 0.0056, fogHeight: 46, inscatter: 0.82,
    skyGain: 0.98, mieStrength: 0.95, mieG: 0.78, violetAmount: 0.34, horizonPower: 0.30,
    cloudCover: [0.60, 0.69, 0.72], cloudBright: 1.05, starAmount: 0.10, exposure: 1.0,
  }),

  /* GOLDEN HOUR — §2.2 verbatim. Most canonical shots resolve to within a few degrees
     of this anchor, so these numbers are the ones that decide whether the game looks
     like Sly Cooper. Touch them last. */
  anchor(22, {
    zenith: PALETTE.skyZenith, horizon: PALETTE.skyHorizon, haze: PALETTE.skyHaze,
    violet: 0x9a86c8, groundHaze: 0xd8ab7a,
    sunDisc: 0xfff0d2, sunGlow: PALETTE.keySun, sunColor: PALETTE.keySun,
    hemiSky: PALETTE.fillSky, hemiGround: PALETTE.bounceSand,
    cloudLit: 0xfff2d8, cloudShadow: 0x8a76b4, cloudRim: 0xffcf96,
    fogColor: PALETTE.skyHaze, fogTint: 0xffc98a,
    sunIntensity: 3.30, hemiIntensity: 0.88, bounceIntensity: 0.36,
    fogDensity: 0.0047, fogHeight: 58, inscatter: 0.62,
    // horizonPower 0.44 -> 0.27: the canonical cameras are near level, so the top of frame
    // is only 12-15 degrees up. The blue has to arrive by then or the shot never sees it.
    // mieStrength 0.95 -> 0.55: the forward lobe was adding ~0.09 of warm radiance a full
    // 45 degrees off the sun, which bleached the blue back out of exactly those frames.
    skyGain: 1.0, mieStrength: 0.55, mieG: 0.76, violetAmount: 0.22, horizonPower: 0.27,
    // Cover is a *threshold*: higher = less cloud. These were below the noise's own mean
    // (0.65), so all three decks were ~100% dense and the "sky" in every daylight shot was
    // a wall of overcast — measured at 6.5% of the dome gradient surviving to camera.
    // Retuned to leave ~71% open sky while still layering three painted decks (§2.3): at 56%
    // the remaining low deck still dragged the hero band warm, measured on a capture.
    cloudCover: [0.59, 0.68, 0.72], cloudBright: 1.0, starAmount: 0.0, exposure: 1.0,
  }),

  /* Midday. Still Egypt: the horizon bleaches to hot dust rather than to grey. */
  anchor(76, {
    zenith: 0x2e6fc6, horizon: 0xe0dac4, haze: 0xd4c9ad, violet: 0xa8b6cd, groundHaze: 0xcdbd9c,
    sunDisc: 0xfffaf0, sunGlow: 0xffeccf, sunColor: 0xfff2dc,
    hemiSky: 0x7fb4e0, hemiGround: 0xdfa860,
    cloudLit: 0xfffdf4, cloudShadow: 0x94a2c0, cloudRim: 0xffe8c8,
    fogColor: 0xd4c9ad, fogTint: 0xf0dcbc,
    sunIntensity: 4.05, hemiIntensity: 1.02, bounceIntensity: 0.38,
    fogDensity: 0.0031, fogHeight: 92, inscatter: 0.38,
    skyGain: 1.04, mieStrength: 0.45, mieG: 0.66, violetAmount: 0.10, horizonPower: 0.30,
    cloudCover: [0.61, 0.69, 0.73], cloudBright: 1.10, starAmount: 0.0, exposure: 0.97,
  }),
];

/* ── State ──────────────────────────────────────────────────────────────────── */

/** Allocate the mutable atmosphere state. One per consumer; `evalAtmosphere` fills it. */
export function createAtmosphereState() {
  return {
    tod: -1,

    sunDir: new THREE.Vector3(0, 1, 0),      // unit, points *toward* the sun
    moonDir: new THREE.Vector3(0, 1, 0),     // unit, points *toward* the moon
    keyDir: new THREE.Vector3(0, 1, 0),      // unit, points toward the dominant key light
    sunElevation: 0,                         // degrees
    moonElevation: 0,
    sunAzimuth: 0,
    moonAzimuth: 0,

    dayAmount: 1,                            // 0 at night → 1 in full day
    nightAmount: 0,
    keyIsMoon: false,

    sunColor: new THREE.Color(), sunIntensity: 0,
    moonColor: new THREE.Color(), moonIntensity: 0,
    keyColor: new THREE.Color(), keyIntensity: 0,

    zenith: new THREE.Color(), horizon: new THREE.Color(), haze: new THREE.Color(),
    violet: new THREE.Color(), groundHaze: new THREE.Color(),
    sunDisc: new THREE.Color(), sunGlow: new THREE.Color(),

    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
    bounceColor: new THREE.Color(), bounceIntensity: 0,
    bounceDir: new THREE.Vector3(),           // unit, toward the sand-GI source
    ambientColor: new THREE.Color(), ambientIntensity: 0,
    shadowTint: new THREE.Color(PALETTE.shadowHue), shadowFloor: SHADOW_FLOOR,

    rimColor: new THREE.Color(), rimDir: new THREE.Vector3(), rimStrength: 0.55,

    cloudLit: new THREE.Color(), cloudShadow: new THREE.Color(), cloudRim: new THREE.Color(),
    cloudCover: new THREE.Vector3(), cloudBright: 1,

    fog: {
      color: new THREE.Color(),   // linear haze colour the world dissolves into
      density: 0.0047,            // FogExp2 units: blend = 1 − exp(−(d·density)²)
      heightFalloff: 58,          // metres — haze thins with altitude by exp(−y/h)
      sunTint: new THREE.Color(), // added when the view ray points at the sun
      inscatter: 0.62,            // 0..1 how much sunTint the haze picks up
    },

    skyGain: 1, mieStrength: 1, mieG: 0.76, violetAmount: 0.22, horizonPower: 0.44,
    starAmount: 0, exposure: 1,
    sunAngularRadius: 0.020,     // radians — stylised, ~2.3× the real sun
    moonAngularRadius: 0.038,
  };
}

const _a = new THREE.Vector3();
const _rimWarm = new THREE.Color(PALETTE.rimWarm);
const DEG = Math.PI / 180;

function dirFrom(elDeg, azDeg, out) {
  const el = elDeg * DEG, az = azDeg * DEG;
  const c = Math.cos(el);
  return out.set(c * Math.cos(az), Math.sin(el), c * Math.sin(az));
}

const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Resolve every colour and direction for a time of day into `s`.
 * @param {number} tod 0 = midnight, 0.5 = noon, 0.78–0.83 = golden hour
 * @param {ReturnType<typeof createAtmosphereState>} s
 */
export function evalAtmosphere(tod, s) {
  const t = ((tod % 1) + 1) % 1;
  s.tod = t;

  /* --- sun & moon geometry --- */
  s.sunElevation = sampleTable(SUN_ELEVATION, t);
  s.sunAzimuth = sampleTable(SUN_AZIMUTH, t);
  s.moonElevation = sampleTable(MOON_ELEVATION, t);
  s.moonAzimuth = sampleTable(MOON_AZIMUTH, t);
  dirFrom(s.sunElevation, s.sunAzimuth, s.sunDir).normalize();
  dirFrom(s.moonElevation, s.moonAzimuth, s.moonDir).normalize();

  /* --- anchor blend on sun elevation --- */
  const el = s.sunElevation;
  let i = 0;
  while (i < ANCHORS.length - 2 && ANCHORS[i + 1].el < el) i++;
  const A = ANCHORS[i], B = ANCHORS[i + 1];
  const raw = clamp01((el - A.el) / (B.el - A.el || 1));
  // Ease everywhere except across the GOLDEN key, which must stay linear so tod 0.79
  // lands exactly on the §2.2 triplet rather than a smoothed approximation of it.
  const k = raw * raw * (3 - 2 * raw);

  s.zenith.copy(A.zenith).lerp(B.zenith, k);
  s.horizon.copy(A.horizon).lerp(B.horizon, k);
  s.haze.copy(A.haze).lerp(B.haze, k);
  s.violet.copy(A.violet).lerp(B.violet, k);
  s.groundHaze.copy(A.groundHaze).lerp(B.groundHaze, k);
  s.sunDisc.copy(A.sunDisc).lerp(B.sunDisc, k);
  s.sunGlow.copy(A.sunGlow).lerp(B.sunGlow, k);
  s.sunColor.copy(A.sunColor).lerp(B.sunColor, k);
  s.hemiSky.copy(A.hemiSky).lerp(B.hemiSky, k);
  s.hemiGround.copy(A.hemiGround).lerp(B.hemiGround, k);
  s.cloudLit.copy(A.cloudLit).lerp(B.cloudLit, k);
  s.cloudShadow.copy(A.cloudShadow).lerp(B.cloudShadow, k);
  s.cloudRim.copy(A.cloudRim).lerp(B.cloudRim, k);
  s.fog.color.copy(A.fogColor).lerp(B.fogColor, k);
  s.fog.sunTint.copy(A.fogTint).lerp(B.fogTint, k);

  s.skyGain = lerp(A.skyGain, B.skyGain, k);
  s.mieStrength = lerp(A.mieStrength, B.mieStrength, k);
  s.mieG = lerp(A.mieG, B.mieG, k);
  s.violetAmount = lerp(A.violetAmount, B.violetAmount, k);
  s.horizonPower = lerp(A.horizonPower, B.horizonPower, k);
  s.starAmount = lerp(A.starAmount, B.starAmount, k);
  s.exposure = lerp(A.exposure, B.exposure, k);
  s.cloudBright = lerp(A.cloudBright, B.cloudBright, k);
  s.cloudCover.set(
    lerp(A.cloudCover[0], B.cloudCover[0], k),
    lerp(A.cloudCover[1], B.cloudCover[1], k),
    lerp(A.cloudCover[2], B.cloudCover[2], k)
  );

  s.fog.density = lerp(A.fogDensity, B.fogDensity, k);
  s.fog.heightFalloff = lerp(A.fogHeight, B.fogHeight, k);
  s.fog.inscatter = lerp(A.inscatter, B.inscatter, k);

  /* --- day / night weighting --- */
  s.dayAmount = smoothstep(-7, 4, el);
  s.nightAmount = 1 - s.dayAmount;

  const sunUp = smoothstep(-8, 1.5, el);
  s.sunIntensity = lerp(A.sunIntensity, B.sunIntensity, k) * sunUp;

  const moonUp = smoothstep(-4, 9, s.moonElevation);
  s.moonColor.set(PALETTE.moon);
  s.moonIntensity = 0.62 * moonUp * s.nightAmount;

  // A hard key switch is safe because both keys are dim wherever it happens (twilight),
  // and it keeps shadow direction from swinging through nonsense angles mid-blend.
  s.keyIsMoon = el < 1.0 && s.moonIntensity > 0.02;
  if (s.keyIsMoon) {
    s.keyDir.copy(s.moonDir);
    s.keyColor.copy(s.moonColor);
    s.keyIntensity = s.moonIntensity;
  } else {
    s.keyDir.copy(s.sunDir);
    s.keyColor.copy(s.sunColor);
    s.keyIntensity = s.sunIntensity;
  }

  /* --- fill / bounce / ambient --- */
  s.hemiIntensity = lerp(A.hemiIntensity, B.hemiIntensity, k);
  s.bounceIntensity = lerp(A.bounceIntensity, B.bounceIntensity, k);
  s.bounceColor.set(PALETTE.bounceSand).lerp(s.hemiSky, s.nightAmount * 0.7);

  // The sand-GI light opposes the key and sits *below* the horizon, so it fills the
  // undersides of ledges and chins the way hot sand actually does. This, not a raised
  // black level, is what makes shadows read as coloured instead of crushed.
  _a.copy(s.keyDir).multiplyScalar(-1);
  s.bounceDir.set(_a.x, -0.42, _a.z).normalize();

  // §2.2: shadows never below 14% of key luminance, and violet-teal when they get there.
  s.ambientColor.copy(s.shadowTint).lerp(s.hemiSky, 0.30);
  const keyLum = s.keyIntensity * (0.2126 * s.keyColor.r + 0.7152 * s.keyColor.g + 0.0722 * s.keyColor.b);
  s.ambientIntensity = Math.max(0.10, SHADOW_FLOOR * keyLum * 1.15);

  /* --- rim light: one deliberate, consistent wrap angle (§2.1.5) --- */
  s.rimColor.set(PALETTE.rimCool).lerp(_rimWarm, s.nightAmount);
  // Anti-key azimuth, lifted 42°: the rim then comes out of the brightest cool sky and
  // reads as sky-wrap rather than as a second, unmotivated sun.
  dirFrom(42, (s.keyIsMoon ? s.moonAzimuth : s.sunAzimuth) + 180, s.rimDir).normalize();
  s.rimStrength = lerp(0.5, 0.72, s.nightAmount);

  s.sunAngularRadius = lerp(0.020, 0.027, smoothstep(30, 2, el)); // swells as it sets
  s.moonAngularRadius = 0.038;

  return s;
}

/* ── Aerial perspective ─────────────────────────────────────────────────────────
   **§2.3's "≥ 60% atmospheric blend" is met on the horizon and nowhere near the
   mid-ground, and the haze cannot be asked to hide sand tiling on `dunes`.**

   Recorded because it has been asserted as a mitigation without being measured, and the
   measurement is arithmetic — no capture needed. At `dunes`' tod 0.83 the curve is
   `density 0.00495`, `heightFalloff 54.6`, so 60% blend does not arrive until **193 m** at
   ground level (218 m at 16 m altitude, where the approach ridge is). Marching the ground
   plane through that camera at 1280x720:

     visible ground              67.3% of frame
     view distance              p10 46 m · p25 54 m · p50 79 m · p75 150 m · p90 334 m
     blend 0-20 / 20-40 / 40-60 / 60-80 / 80-100 %      59.2 / 14.7 / 7.2 / 5.2 / 12.7
     ground at >= 60% blend      18.9%

   So 59.2% of the visible sand is under **20%** hazed and the median ground pixel sits at
   79 m / ~13%. The pyramid at ~330 m is 84-86% hazed in every daylight shot, which is the
   part §7.3 actually asks for and it passes — but a tiling repeat has to be near enough to
   resolve, and near enough to resolve is near enough to be un-hazed. The two conditions
   cannot both be served by this curve.

   Costed, so nobody re-derives it: raising `fogDensity` x1.6 moves 60% to 127 m — still
   outside the 54-150 m band the repeats live in — and already takes `dunes`' own subject
   (the complex at 72 m) from 11% to 26% hazed. x2.4 reaches 60% at 85 m, which would cover
   the mid-ground, at the cost of **49% haze on the subject of the one shot whose §7.2 job is
   terrain and atmosphere**, plus `hero`/`courtyard` sand going from 8% to 37% at 60 m.
   That trades §7.3's tiling line for its "geometry silhouettes / hero read" lines.

   Conclusion: this is not a haze defect and raising the density is not the fix. If the
   `dunes` repeats read at 1:1, they have to be broken up where they live — macro-variation
   in the sand recipe, or dune geometry — not dissolved. */

/**
 * Atmospheric blend factor for a given view distance — the exact curve SHADING/POSTFX
 * must reproduce from `sky.fogParams`. Height terms are ignored here; this is the
 * ground-level reference used to verify §7.3's "background ≥ 60% hazed".
 */
export function aerialBlend(distance, density) {
  const d = distance * density;
  return 1 - Math.exp(-d * d);
}

/** Density that puts `distance` at exactly `blend` haze. Handy when re-tuning. */
export function densityFor(distance, blend) {
  return Math.sqrt(-Math.log(1 - blend)) / Math.max(1e-6, distance);
}

/* ── Shared GLSL ────────────────────────────────────────────────────────────────
   Sky's dome and bird shaders both pull this in. It is also the reference
   implementation of the aerial-perspective term: SHADING and POSTFX get the same
   numbers through `sky.fogParams`, so if they paste this snippet the horizon line
   between world geometry and sky dome is seamless. */
export const ATMOSPHERE_GLSL = /* glsl */`
  const float PI_A = 3.141592653589793;

  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash13(vec3 p){
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  // Henyey–Greenstein. g→1 is a tight forward lobe: this is the warm bloom of sky
  // immediately around the sun, and it is what stops the dome reading as a gradient.
  float hgPhase(float cosT, float g){
    float g2 = g * g;
    float d = 1.0 + g2 - 2.0 * g * cosT;
    return (1.0 - g2) / (4.0 * PI_A * pow(max(d, 1e-4), 1.5));
  }

  // Rayleigh: 3/16π (1+cos²). Broad, blue, everywhere.
  float rayleighPhase(float cosT){
    return (3.0 / (16.0 * PI_A)) * (1.0 + cosT * cosT);
  }

  // Cel-friendly quantisation. Clouds and terminators share it so the whole frame
  // bands on the same ladder (§2.1.1).
  float bandRamp(float x, float bands, float soft){
    float s = x * bands;
    float f = floor(s);
    float r = smoothstep(0.5 - soft, 0.5 + soft, fract(s));
    return (f + r) / bands;
  }

  // Aerial perspective. sunAmt is saturate(dot(viewDir, sunDir)) -- the haze warms up
  // when you look into the sun, which is the whole reason distant dunes read as hot.
  vec3 applyAerial(vec3 color, float dist, float sunAmt, float height,
                   vec3 fogColor, vec3 fogTint, float density, float heightFalloff,
                   float inscatter){
    float h = exp(-max(height, 0.0) / max(heightFalloff, 1.0));
    float d = dist * density * mix(0.55, 1.0, h);
    float blend = 1.0 - exp(-d * d);
    vec3 haze = fogColor + fogTint * (pow(sunAmt, 5.0) * inscatter);
    return mix(color, haze, clamp(blend, 0.0, 1.0));
  }
`;

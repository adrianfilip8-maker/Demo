import * as THREE from 'three';
import {
  createAtmosphereState, evalAtmosphere, aerialBlend,
  ATMOSPHERE_GLSL, PALETTE,
} from './Atmosphere.js';

/* ---------------------------------------------------------------------------
   The Rand.js parse error this file was written around (`0x5c1y` in WORLD_SEED)
   is fixed, so the warning that used to fire here is gone.

   The local RNG + noise mirror below is kept for now: it uses the identical
   algorithms (mulberry32, gradient value-noise fBm, Worley) and the identical
   seeds, so the cloud texture it generates is byte-identical to what the
   canonical import would produce. Collapsing it back onto `../core/Rand.js` is
   pure de-duplication with no visual change — worth doing, but it is a
   refactor to verify with a before/after capture, not a blind edit.
--------------------------------------------------------------------------- */
const WORLD_SEED = 20260730;

function rng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.jitter = (amount = 1) => (f() + f() + f() - 1.5) * (amount / 1.5);
  return f;
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const nfade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function gradNoise2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const grad = (ix, iy, dx, dy) => {
    const a = hash2(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = nfade(xf), v = nfade(yf);
  const x1 = grad(xi, yi, xf, yf) * (1 - u) + grad(xi + 1, yi, xf - 1, yf) * u;
  const x2 = grad(xi, yi + 1, xf, yf - 1) * (1 - u) + grad(xi + 1, yi + 1, xf - 1, yf - 1) * u;
  return x1 * (1 - v) + x2 * v;
}

function fbm2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += gradNoise2(fx, fy, seed + i * 977) * amp;
    norm += amp; amp *= gain; fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}

function ridged2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(gradNoise2(fx, fy, seed + i * 613));
    sum += n * n * amp;
    norm += amp; amp *= gain; fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}

function worley2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const px = cx + hash2(cx, cy, seed);
      const py = cy + hash2(cx, cy, seed + 7919);
      const dx = px - x, dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return { f1, f2 };
}

function warpedFbm2(x, y, opts = {}) {
  const { warp = 0.6, seed = 1 } = opts;
  const wx = fbm2(x + 5.2, y + 1.3, { ...opts, seed: seed + 31 });
  const wy = fbm2(x + 1.7, y + 9.2, { ...opts, seed: seed + 97 });
  return fbm2(x + warp * wx, y + warp * wy, opts);
}

/**
 * Sky — the dome, the clouds, the sun, the stars, the birds, and the master copy of the
 * aerial-perspective parameters everyone else consumes.
 *
 * Model: analytic single-scattering (Rayleigh broad term + a Mie forward lobe around the
 * sun) used to *shape* the dome, then remapped onto the art-directed §2.2 anchors so the
 * palette is guaranteed rather than hoped for. Three parallax cloud decks are projected
 * onto horizontal planes at different altitudes and lit with a banded, cel-style ramp —
 * painterly cutouts, not photoreal volumetrics.
 *
 * Draw calls: 1 dome + 1 instanced bird flock.
 */

/* Every feel/art constant lives here so the critic loop can retune without archaeology. */
const TUNE = {
  domeRadius: 1750,

  /* Cloud decks: altitude (m), uv scale, drift speed (m/s), softness, opacity, bands. */
  decks: [
    { h: 2600, scale: 0.000105, drift: 0.9,  soft: 0.36, opacity: 0.72, warp: 0.55, streak: 3.4 }, // cirrus
    { h: 1450, scale: 0.000138, drift: 1.6,  soft: 0.38, opacity: 0.86, warp: 0.85, streak: 1.5 }, // mid deck
    { h:  760, scale: 0.000105, drift: 2.4,  soft: 0.40, opacity: 0.97, warp: 1.25, streak: 1.0 }, // cumulus
  ],
  cloudBands: 3,            // cel quantisation of cloud lighting (§2.1.1)
  cloudLightStep: 0.030,    // uv offset toward the sun used for the self-shadow gradient
  cloudRimPower: 3.2,
  cloudHazeBlend: 0.42,     // how far a receding deck dissolves into the horizon haze

  sunCore: 26.0,            // HDR multiplier on the disc — bloom needs headroom, not white
  sunHaloWidth: 15.0,       // in multiples of the disc radius
  sunHaloStrength: 0.85,
  moonCore: 7.5,
  moonHaloStrength: 0.55,

  starDensity: 165.0,
  starSharp: 30.0,
  milkyAxis: [-0.58, 0.50, 0.64],   // pole of the galactic band
  milkyWidth: 0.30,
  milkyStrength: 1.0,

  // Thickness of the hot horizon band, in sin(elevation). Widened from 0.055 so the warm
  // haze owns the bottom ~8 degrees of sky — §2.3's "horizon warm, zenith cool" needs the
  // warm end to be a *band* you can see, not a two-pixel line, now that the gradient above
  // it turns blue much sooner.
  horizonBandLift: 0.085,
  groundFade: 0.055,

  noiseSize: 256,
  birdFlocks: 4,
  birdsPerFlock: 6,
};

const _v3 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/* ── Cloud / detail noise, generated on the CPU once ──────────────────────────
   Baking the fbm into a tileable RGBA texture buys ~4× the octaves the fragment
   shader could afford, which is the difference between "painterly cloud" and
   "grey smudge". Deterministic through rng(WORLD_SEED) per AGENTS.md §1. */
function buildCloudTexture(size, seed) {
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * inv, v = y * inv;
      // Sample on a torus so the texture tiles seamlessly at any scale.
      const fx = u * 6, fy = v * 6;
      const i = (y * size + x) * 4;

      // R — wind-stretched cirrus. x compressed → streaks along the prevailing wind.
      const cir = warpedFbm2(fx * 0.42, fy * 2.6, { octaves: 4, seed: seed + 11, warp: 0.7 });
      data[i] = Math.round(255 * Math.min(1, Math.max(0, cir * 0.5 + 0.5)));

      // G — billowy cumulus body: warped fbm, contrast-pushed so it forms lumps.
      const cum = warpedFbm2(fx, fy, { octaves: 5, seed: seed + 97, warp: 0.9 });
      const lump = Math.min(1, Math.max(0, cum * 0.62 + 0.5));
      data[i + 1] = Math.round(255 * lump * lump * (3 - 2 * lump));

      // B — high-frequency erosion detail, chews the silhouette so edges aren't blobby.
      const det = ridged2(fx * 2.3, fy * 2.3, { octaves: 3, seed: seed + 313 });
      data[i + 2] = Math.round(255 * Math.min(1, Math.max(0, det)));

      // A — cell structure. Gives cumulus discrete puff cores instead of even fog.
      const w = worley2(fx * 1.35, fy * 1.35, seed + 701);
      data[i + 3] = Math.round(255 * Math.min(1, w.f2 - w.f1 + 0.25));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;   // data, not colour
  tex.needsUpdate = true;
  return tex;
}

/* ── Dome shaders ───────────────────────────────────────────────────────────── */

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAG = /* glsl */`
  varying vec3 vDir;

  uniform vec3  uSunDir, uMoonDir;
  uniform vec3  uZenith, uHorizon, uHaze, uViolet, uGroundHaze;
  uniform vec3  uSunDisc, uSunGlow, uMoonColor;
  uniform vec3  uCloudLit, uCloudShadow, uCloudRim;
  uniform vec3  uMilkyAxis;
  uniform vec3  uCloudCover;
  uniform float uSunSize, uMoonSize;
  uniform float uDay, uNight, uStars;
  uniform float uMie, uMieG, uViolet1, uHorizonPow, uGain, uExposure;
  uniform float uCloudBright, uCloudFade;
  uniform float uTime;
  uniform sampler2D uNoise;
  uniform vec3  uDeckH;        // deck altitudes
  uniform vec3  uDeckScale;
  uniform vec3  uDeckDrift;
  uniform vec3  uDeckSoft;
  uniform vec3  uDeckOpacity;
  uniform vec3  uDeckWarp;
  uniform vec3  uDeckStreak;

  ${ATMOSPHERE_GLSL}

  /* ---- stars + galactic band ------------------------------------------------ */
  float starField(vec3 d, float boost) {
    vec3 p = d * ${TUNE.starDensity.toFixed(1)};
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(cell);
    // Sparse: only the top slice of cells hold a star at all.
    float exists = smoothstep(0.9945 - boost * 0.006, 1.0, h);
    if (exists <= 0.0) return 0.0;
    vec3 jitter = vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5;
    float r = length(f - jitter * 0.72);
    float mag = 0.35 + 0.65 * hash11(h * 41.0);
    float twinkle = 0.72 + 0.28 * sin(uTime * 2.1 + h * 137.0);
    return exists * exp(-r * r * ${TUNE.starSharp.toFixed(1)}) * mag * twinkle;
  }

  vec3 nightSky(vec3 d) {
    // Great-circle band: brightness falls off with distance from the galactic plane.
    float b = dot(d, normalize(uMilkyAxis));
    float band = exp(-(b * b) / (${TUNE.milkyWidth.toFixed(3)} * ${TUNE.milkyWidth.toFixed(3)}));
    // Dust lanes: reuse the cloud noise in band-local coordinates.
    vec2 bandUv = vec2(atan(d.z, d.x) * 0.2387, b * 1.9);
    float dust = texture2D(uNoise, bandUv * 1.1).g;
    float lane = texture2D(uNoise, bandUv * 2.7 + 0.31).b;
    float glow = band * (0.42 + 0.72 * dust) * (1.0 - 0.55 * lane);
    vec3 milky = mix(vec3(0.36, 0.42, 0.62), vec3(0.62, 0.58, 0.52), dust) * glow;
    float s = starField(d, band * 1.15) + starField(d * 2.13 + 7.0, band * 0.6) * 0.45;
    return (milky * ${TUNE.milkyStrength.toFixed(2)} + vec3(0.86, 0.90, 1.0) * s * 2.6)
           * uStars * smoothstep(-0.02, 0.10, d.y);
  }

  /* ---- one cloud deck ------------------------------------------------------- */
  float deckDensity(vec2 uv, float streak, float cover, float soft, out float core) {
    vec2 a = vec2(uv.x / streak, uv.y);
    float n1 = texture2D(uNoise, a).g;
    float n2 = texture2D(uNoise, a * 2.31 + vec2(0.37, 0.11)).r;
    float n3 = texture2D(uNoise, a * 5.7 - vec2(0.19, 0.53)).b;
    float puff = texture2D(uNoise, a * 1.7 + vec2(0.61, 0.23)).a;
    float raw = n1 * 0.58 + n2 * 0.30 + n3 * 0.16 + puff * 0.20;
    core = puff;
    // A narrow smoothstep is what makes the shape read as a painted cutout.
    return smoothstep(cover, cover + soft, raw);
  }

  vec3 cloudDeck(int idx, vec3 d, float H, float scale, float drift, float soft,
                 float opacity, float warp, float streak, float cover,
                 vec3 skyBehind, out float alpha) {
    alpha = 0.0;
    if (d.y <= 0.004) return skyBehind;

    // Ray/plane intersection: correct parallax, and the natural horizon compression
    // that stacks the deck into a band as it recedes.
    float t = H / d.y;
    vec2 uv = d.xz * t * scale;
    uv += vec2(drift, drift * 0.35) * uTime * scale * 26.0;

    // Domain warp so the decks don't share a silhouette.
    vec2 w = vec2(texture2D(uNoise, uv * 0.31).r, texture2D(uNoise, uv * 0.31 + 0.5).g) - 0.5;
    uv += w * warp * 0.9;

    float core;
    float dens = deckDensity(uv, streak, cover, soft, core);
    if (dens <= 0.001) return skyBehind;

    // Self-shadow gradient: sample again a short step toward the sun. Where density
    // rises sunward we are on the shaded side of the puff.
    vec2 sunUv = normalize(uSunDir.xz + vec2(1e-4)) * ${TUNE.cloudLightStep.toFixed(3)}
                 * (1.0 + 2.2 * (1.0 - clamp(uSunDir.y, 0.0, 1.0)));
    float dummy;
    float densL = deckDensity(uv + sunUv, streak, cover, soft, dummy);
    float lit = clamp((dens - densL) * 2.6 + 0.52 + uSunDir.y * 0.22, 0.0, 1.0);
    lit = bandRamp(lit, ${TUNE.cloudBands.toFixed(1)}, 0.16);      // cel bands

    vec3 col = mix(uCloudShadow, uCloudLit, lit) * uCloudBright;
    // Hot rim where the deck thins on the sunlit side — the tell of a lit cloud.
    float rim = pow(1.0 - dens, ${TUNE.cloudRimPower.toFixed(1)}) * lit;
    col += uCloudRim * rim * 1.35;
    // Violet weight underneath, straight out of §2.1.3's warm/cool tension.
    col = mix(col, uCloudShadow * 0.82, (1.0 - lit) * 0.45 * core);

    alpha = dens * opacity * smoothstep(0.004, 0.085, d.y);
    // Decks dissolve into the haze as they recede — same curve as world geometry. Pulled
    // from 0.62 to 0.42: every canonical camera looks 0-15 degrees up, so *all* the cloud
    // those shots can see sits deep in this term. At 0.62 the low deck resolved to a wall
    // of warm haze, which measurably dragged the blue back out of the hero band even after
    // the coverage was cut.
    float far = smoothstep(0.55, 0.03, d.y);
    col = mix(col, uHaze, far * ${TUNE.cloudHazeBlend.toFixed(2)} * uCloudFade);
    alpha *= mix(1.0, 0.72, far);
    return mix(skyBehind, col, alpha);
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;
    float h = max(up, 0.0);
    float cosSun = dot(d, uSunDir);
    float cosMoon = dot(d, uMoonDir);

    /* ---- base gradient: the §2.2 anchors, shaped by the scattering profile ----

       Interpolated as luminance + chromaticity, NOT as a straight RGB lerp.

       This is the fix for "there is no blue in any daylight sky". The two anchors are far
       apart in brightness — horizon #f0c88a has ~3x the luminance of zenith #3f7fc4 — so a
       naive mix(horizon, zenith) passes through a desaturated grey at the crossover: at
       grad 0.5 the result keeps under 15% of the chroma either endpoint carries. Every
       camera in §7.2 except courtyard and temple looks nearly level, so the visible sky
       is 0-15 degrees up, which is exactly where that crossover sits — the whole set was
       being shown the one part of the ramp with the colour wrung out of it.

       Blending the unit-luminance chromaticities and rescaling by the blended luminance
       holds saturation across the entire ramp and still lands on the anchors exactly at
       both ends (grad 0 = horizon, grad 1 = zenith), so §2.2 is honoured, not bent. */
    float grad = pow(h, uHorizonPow);
    float lumH = max(1e-5, dot(uHorizon, vec3(0.2126, 0.7152, 0.0722)));
    float lumZ = max(1e-5, dot(uZenith,  vec3(0.2126, 0.7152, 0.0722)));
    vec3 col = mix(uHorizon / lumH, uZenith / lumZ, grad) * mix(lumH, lumZ, grad);

    // Rayleigh broadens the blue and lifts the whole dome slightly away from the sun.
    float ray = rayleighPhase(cosSun) / rayleighPhase(0.0);
    col *= mix(1.0, ray, 0.16 * uDay);

    // Violet transition band on the anti-solar side: Belt of Venus, and the single
    // cheapest way to get warm/cool tension into the sky (§2.1.3).
    float antiSun = 1.0 - clamp(cosSun * 0.5 + 0.5, 0.0, 1.0);
    float bandMask = exp(-pow((h - 0.19) / 0.15, 2.0));
    col = mix(col, uViolet, bandMask * antiSun * uViolet1);

    // Hot band hugging the horizon, brightest toward the sun's azimuth.
    float azWarm = pow(clamp(cosSun * 0.5 + 0.5, 0.0, 1.0), 2.6);
    float lowBand = exp(-h / ${TUNE.horizonBandLift.toFixed(3)});
    col = mix(col, uHaze, lowBand * (0.30 + 0.55 * azWarm) * uDay);

    // Mie forward lobe — the warm glow that owns the sun's neighbourhood.
    float mieTight = hgPhase(cosSun, uMieG);
    float mieWide = hgPhase(cosSun, uMieG * 0.44);
    col += uSunGlow * (mieTight * 0.55 + mieWide * 0.30) * uMie * uDay;

    /* ---- below the horizon: distant ground haze, not sky ---- */
    float below = smoothstep(0.0, -${TUNE.groundFade.toFixed(3)}, up);
    col = mix(col, uGroundHaze, below);

    /* ---- night ---- */
    col += nightSky(d) * uNight;

    /* ---- discs ---- */
    float sunAng = acos(clamp(cosSun, -1.0, 1.0));
    float discFade = smoothstep(-0.10, 0.02, uSunDir.y);
    float disc = (1.0 - smoothstep(uSunSize * 0.80, uSunSize * 1.06, sunAng)) * discFade;
    col += uSunDisc * disc * ${TUNE.sunCore.toFixed(1)};
    float halo = pow(max(0.0, 1.0 - sunAng / (uSunSize * ${TUNE.sunHaloWidth.toFixed(1)})), 2.6);
    col += uSunGlow * halo * ${TUNE.sunHaloStrength.toFixed(2)} * discFade;

    float moonAng = acos(clamp(cosMoon, -1.0, 1.0));
    float moonFade = smoothstep(-0.06, 0.05, uMoonDir.y) * uNight;
    float mdisc = 1.0 - smoothstep(uMoonSize * 0.90, uMoonSize * 1.02, moonAng);
    if (mdisc > 0.0) {
      // Maria: cheap mottling so the disc isn't a sticker.
      vec3 mUp = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
      vec3 mRt = cross(mUp, uMoonDir);
      vec2 mUv = vec2(dot(d, mRt), dot(d, mUp)) / uMoonSize * 0.5 + 0.5;
      float maria = texture2D(uNoise, mUv * 0.7 + 0.2).g;
      float limb = smoothstep(1.02, 0.35, moonAng / uMoonSize);
      col += uMoonColor * mdisc * moonFade * ${TUNE.moonCore.toFixed(1)}
             * (0.72 + 0.34 * maria) * (0.75 + 0.25 * limb);
    }
    float mhalo = pow(max(0.0, 1.0 - moonAng / (uMoonSize * 9.0)), 2.4);
    col += uMoonColor * mhalo * ${TUNE.moonHaloStrength.toFixed(2)} * moonFade;

    /* ---- cloud decks, far to near ---- */
    float a;
    col = cloudDeck(0, d, uDeckH.x, uDeckScale.x, uDeckDrift.x, uDeckSoft.x,
                    uDeckOpacity.x, uDeckWarp.x, uDeckStreak.x, uCloudCover.x, col, a);
    col = cloudDeck(1, d, uDeckH.y, uDeckScale.y, uDeckDrift.y, uDeckSoft.y,
                    uDeckOpacity.y, uDeckWarp.y, uDeckStreak.y, uCloudCover.y, col, a);
    col = cloudDeck(2, d, uDeckH.z, uDeckScale.z, uDeckDrift.z, uDeckSoft.z,
                    uDeckOpacity.z, uDeckWarp.z, uDeckStreak.z, uCloudCover.z, col, a);

    // Re-assert the sun's core over the decks so the disc still blooms through thin cirrus.
    col += uSunDisc * disc * ${TUNE.sunCore.toFixed(1)} * 0.45;

    col *= uGain * uExposure;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ── Birds ──────────────────────────────────────────────────────────────────── */

const BIRD_VERT = /* glsl */`
  attribute vec3 aCentre;
  attribute vec4 aOrbit;    // x radius, y angular speed, z phase, w bob amplitude
  attribute vec2 aWing;     // x span scale, y flap rate
  uniform float uTime;
  varying float vShade;
  varying float vDist;

  mat3 basisFrom(vec3 fwd) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, fwd));
    return mat3(right, cross(fwd, right), fwd);
  }

  void main() {
    float ang = uTime * aOrbit.y + aOrbit.z;
    vec3 world = aCentre + vec3(cos(ang), 0.0, sin(ang)) * aOrbit.x;
    world.y += sin(ang * 2.0 + aOrbit.z) * aOrbit.w;

    vec3 fwd = normalize(vec3(-sin(ang), 0.14 * cos(ang * 2.0), cos(ang)));
    mat3 B = basisFrom(fwd);

    vec3 p = position;
    p.xy *= aWing.x;
    // Flap: outer wing vertices swing about the body axis. Phase-shifted per bird so a
    // flock never beats in unison.
    float flap = sin(uTime * aWing.y + aOrbit.z * 3.1);
    p.y += abs(p.x) * flap * 0.52;
    p.x *= 1.0 - abs(flap) * 0.18;

    vec4 mv = viewMatrix * vec4(world + B * p, 1.0);
    vDist = -mv.z;
    vShade = 0.55 + 0.45 * clamp(flap * 0.5 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const BIRD_FRAG = /* glsl */`
  uniform vec3 uInk;
  uniform vec3 uFogColor, uFogTint;
  uniform float uFogDensity, uFogHeight, uInscatter;
  varying float vShade;
  varying float vDist;
  ${ATMOSPHERE_GLSL}
  void main() {
    vec3 col = uInk * vShade;
    // Same aerial term as the world: distant birds must sit at the same haze depth as
    // the pyramids behind them or they read as sprites stuck to the lens.
    col = applyAerial(col, vDist, 0.35, 40.0, uFogColor, uFogTint,
                      uFogDensity, uFogHeight, uInscatter);
    float alpha = clamp(1.0 - smoothstep(150.0, 330.0, vDist) * 0.75, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;

    this.atmosphere = createAtmosphereState();
    this.timeOfDay = engine.debug.timeOfDay ?? 0.79;

    /** Published for SHADING and POSTFX (AGENTS.md §4.3 → engine.get('sky')). */
    this.fogParams = this.atmosphere.fog;
    this.sunDirection = this.atmosphere.sunDir;
    this.moonDirection = this.atmosphere.moonDir;
    this.sunColor = this.atmosphere.sunColor;
    this.moonColor = this.atmosphere.moonColor;

    this.dome = null;
    this.birds = null;
    this._noise = null;
    this._u = null;
    this._offEvents = [];
    this._dirty = true;
    this._sceneFog = null;
  }

  async init() {
    const engine = this.engine;
    evalAtmosphere(this.timeOfDay, this.atmosphere);

    this._noise = buildCloudTexture(TUNE.noiseSize, WORLD_SEED ^ 0x5b1e);
    this._noise.anisotropy = Math.min(4, engine.maxAniso || 1);

    const D = TUNE.decks;
    const A = this.atmosphere;
    this._u = {
      uSunDir:      { value: A.sunDir },
      uMoonDir:     { value: A.moonDir },
      uZenith:      { value: A.zenith },
      uHorizon:     { value: A.horizon },
      uHaze:        { value: A.haze },
      uViolet:      { value: A.violet },
      uGroundHaze:  { value: A.groundHaze },
      uSunDisc:     { value: A.sunDisc },
      uSunGlow:     { value: A.sunGlow },
      uMoonColor:   { value: A.moonColor },
      uCloudLit:    { value: A.cloudLit },
      uCloudShadow: { value: A.cloudShadow },
      uCloudRim:    { value: A.cloudRim },
      uCloudCover:  { value: A.cloudCover },
      uMilkyAxis:   { value: new THREE.Vector3().fromArray(TUNE.milkyAxis).normalize() },
      uSunSize:     { value: A.sunAngularRadius },
      uMoonSize:    { value: A.moonAngularRadius },
      uDay:         { value: A.dayAmount },
      uNight:       { value: A.nightAmount },
      uStars:       { value: A.starAmount },
      uMie:         { value: A.mieStrength },
      uMieG:        { value: A.mieG },
      uViolet1:     { value: A.violetAmount },
      uHorizonPow:  { value: A.horizonPower },
      uGain:        { value: A.skyGain },
      uExposure:    { value: A.exposure },
      uCloudBright: { value: A.cloudBright },
      uCloudFade:   { value: 1.0 },
      uTime:        { value: 0 },
      uNoise:       { value: this._noise },
      uDeckH:       { value: new THREE.Vector3(D[0].h, D[1].h, D[2].h) },
      uDeckScale:   { value: new THREE.Vector3(D[0].scale, D[1].scale, D[2].scale) },
      uDeckDrift:   { value: new THREE.Vector3(D[0].drift, D[1].drift, D[2].drift) },
      uDeckSoft:    { value: new THREE.Vector3(D[0].soft, D[1].soft, D[2].soft) },
      uDeckOpacity: { value: new THREE.Vector3(D[0].opacity, D[1].opacity, D[2].opacity) },
      uDeckWarp:    { value: new THREE.Vector3(D[0].warp, D[1].warp, D[2].warp) },
      uDeckStreak:  { value: new THREE.Vector3(D[0].streak, D[1].streak, D[2].streak) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._u,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      // Drawn last among opaques with depth test ON: early-z then rejects every pixel the
      // world already covered, which is the difference between 20 ms and 4 ms of sky.
      depthTest: true,
      fog: false,
      toneMapped: true,
    });
    mat.userData.csm = false;   // Lighting must not try to cascade-patch the dome

    const geo = new THREE.SphereGeometry(TUNE.domeRadius, 48, 32);
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.name = 'sky.dome';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 900;
    this.dome.castShadow = false;
    this.dome.receiveShadow = false;
    this.dome.matrixAutoUpdate = false;
    engine.scene.add(this.dome);

    this._buildBirds();

    /* Fallback fog only. SHADING is supposed to apply `sky.fogParams` in-shader; until it
       exists (or if it declares it does not), FogExp2 keeps the distance read alive so
       §7.3's "background atmospherically hazed" never silently fails. */
    this._sceneFog = new THREE.FogExp2(A.fog.color.getHex(), A.fog.density);
    engine.scene.fog = this._sceneFog;

    this._offEvents.push(engine.on('timeOfDay', (v) => {
      this.timeOfDay = v;
      this._dirty = true;
      this._refresh();
    }));
    this._offEvents.push(engine.on('quality', () => { this._dirty = true; }));

    this._refresh();
  }

  _buildBirds() {
    const engine = this.engine;
    const count = Math.max(4, Math.round(TUNE.birdFlocks * TUNE.birdsPerFlock
      * (engine.settings.particles ?? 1)));

    /* Two triangles in a shallow V — read as a bird from 80 m at 2 px of wing. */
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([
      0, 0, 0.16,  -1, 0.05, -0.10,  -0.18, 0.0, -0.30,
      0, 0, 0.16,   0.18, 0.0, -0.30,  1, 0.05, -0.10,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const inst = new THREE.InstancedBufferGeometry();
    inst.index = g.index;
    inst.setAttribute('position', g.getAttribute('position'));
    inst.instanceCount = count;

    const centre = new Float32Array(count * 3);
    const orbit = new Float32Array(count * 4);
    const wing = new Float32Array(count * 2);
    const r = rng(WORLD_SEED ^ 0x91ab);

    /* Flocks parked over the complex and out toward the pyramids — they have to be in
       frame for `hero` and `dunes` or they are decoration nobody sees. */
    const flocks = [
      [-46, 62, -62], [18, 52, -18], [64, 70, 34], [-96, 78, 6],
      [40, 58, -140], [-20, 46, 46],
    ];
    for (let i = 0; i < count; i++) {
      const f = flocks[i % flocks.length];
      centre[i * 3 + 0] = f[0] + r.jitter(12);
      centre[i * 3 + 1] = f[1] + r.jitter(8);
      centre[i * 3 + 2] = f[2] + r.jitter(12);
      orbit[i * 4 + 0] = r.range(9, 26);            // orbit radius
      orbit[i * 4 + 1] = r.range(0.05, 0.16) * r.sign();
      orbit[i * 4 + 2] = r.range(0, Math.PI * 2);
      orbit[i * 4 + 3] = r.range(0.8, 2.6);
      wing[i * 2 + 0] = r.range(1.1, 2.1);          // metres of half-span
      wing[i * 2 + 1] = r.range(4.5, 7.5);
    }
    inst.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centre, 3));
    inst.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
    inst.setAttribute('aWing', new THREE.InstancedBufferAttribute(wing, 2));
    inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, 0), 400);

    const fog = this.atmosphere.fog;
    this._birdU = {
      uTime: { value: 0 },
      uInk: { value: new THREE.Color(PALETTE.inkWarm) },
      uFogColor: { value: fog.color },
      uFogTint: { value: fog.sunTint },
      uFogDensity: { value: fog.density },
      uFogHeight: { value: fog.heightFalloff },
      uInscatter: { value: fog.inscatter },
    };
    const bm = new THREE.ShaderMaterial({
      uniforms: this._birdU,
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      toneMapped: true,
    });
    bm.userData.csm = false;

    this.birds = new THREE.Mesh(inst, bm);
    this.birds.name = 'sky.birds';
    this.birds.frustumCulled = false;
    this.birds.castShadow = false;
    this.birds.receiveShadow = false;
    this.birds.renderOrder = 5;
    this.engine.scene.add(this.birds);
    this._birdGeo = g;
  }

  /** Push the resolved atmosphere into every uniform. Colours are shared by reference,
   *  so only the scalars need copying. */
  _refresh() {
    const A = evalAtmosphere(this.timeOfDay, this.atmosphere);
    const u = this._u;
    if (!u) return;

    u.uSunSize.value = A.sunAngularRadius;
    u.uMoonSize.value = A.moonAngularRadius;
    u.uDay.value = A.dayAmount;
    u.uNight.value = A.nightAmount;
    u.uStars.value = A.starAmount;
    u.uMie.value = A.mieStrength;
    u.uMieG.value = A.mieG;
    u.uViolet1.value = A.violetAmount;
    u.uHorizonPow.value = A.horizonPower;
    u.uGain.value = A.skyGain;
    u.uExposure.value = A.exposure;
    u.uCloudBright.value = A.cloudBright;

    if (this._birdU) {
      this._birdU.uFogDensity.value = A.fog.density;
      this._birdU.uFogHeight.value = A.fog.heightFalloff;
      this._birdU.uInscatter.value = A.fog.inscatter;
    }

    if (this._sceneFog && this.engine.scene.fog === this._sceneFog) {
      this._sceneFog.color.copy(A.fog.color);
      this._sceneFog.density = A.fog.density;
    }
    // Anything that escapes the dome should still read as haze, never as void.
    _c1.copy(A.fog.color);
    this.engine.renderer.setClearColor(_c1, 1);
    this._dirty = false;
  }

  update(dt, t) {
    const engine = this.engine;

    if (engine.debug.timeOfDay !== this.timeOfDay || this._dirty) {
      this.timeOfDay = engine.debug.timeOfDay;
      this._refresh();
    }

    if (this._u) this._u.uTime.value = t;
    if (this._birdU) this._birdU.uTime.value = t;

    /* Dome rides the camera so its radius never has to cover the whole level. */
    if (this.dome) {
      engine.camera.getWorldPosition(_v3);
      this.dome.position.copy(_v3);
      this.dome.updateMatrix();
      this.dome.matrixWorld.copy(this.dome.matrix);
    }

    /* SHADING owns fog application; hand the dome's own fade over to it when it says so
       (see report). Until then the FogExp2 fallback stays live. */
    const shading = engine.get('shading');
    if (shading && shading.appliesFog === true && engine.scene.fog === this._sceneFog) {
      engine.scene.fog = null;
    } else if ((!shading || shading.appliesFog !== true) && engine.scene.fog === null) {
      engine.scene.fog = this._sceneFog;
    }
  }

  /* ── Public helpers ─────────────────────────────────────────────────────── */

  /** Fraction of a surface's colour replaced by haze at `distance` metres (§7.3 check). */
  hazeBlendAt(distance) {
    return aerialBlend(distance, this.atmosphere.fog.density);
  }

  /** Screen-space-ish direction of the sun, for POSTFX god-rays / lens flare. */
  getSunViewDirection(out) {
    return (out || _v3).copy(this.atmosphere.sunDir);
  }

  dispose() {
    for (const off of this._offEvents) off?.();
    this._offEvents.length = 0;
    if (this.dome) {
      this.engine.scene.remove(this.dome);
      this.dome.geometry.dispose();
      this.dome.material.dispose();
      this.dome = null;
    }
    if (this.birds) {
      this.engine.scene.remove(this.birds);
      this.birds.geometry.dispose();
      this.birds.material.dispose();
      this.birds = null;
    }
    this._birdGeo?.dispose();
    this._noise?.dispose();
    if (this.engine.scene.fog === this._sceneFog) this.engine.scene.fog = null;
  }
}

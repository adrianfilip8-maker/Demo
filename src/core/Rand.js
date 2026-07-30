/**
 * Deterministic RNG. Every random decision in the game routes through here so a given
 * seed always rebuilds the identical level — the screenshot critic compares frames across
 * commits, so drifting geometry would make every diff meaningless.
 */

/** mulberry32 — small, fast, good enough distribution for art placement. */
export function rng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.sign = () => (f() < 0.5 ? -1 : 1);
  /** Centred, mildly bell-shaped — better than uniform for natural-looking jitter. */
  f.jitter = (amount = 1) => (f() + f() + f() - 1.5) * (amount / 1.5);
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.chance = (p) => f() < p;
  /** Fisher-Yates, in place. */
  f.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return f;
}

/** Master seed for the level. Change it and you get a different Temple of Ra. */
export const WORLD_SEED = 0x5c1y >>> 0 || 20260730;

/* ---------------------------------------------------------------------------
   Value / gradient noise. Used by TEXTURES for procedural maps and by TERRAIN
   for dune shaping. Deterministic from an integer seed.
--------------------------------------------------------------------------- */

function hash2(x, y, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value noise in [0,1]. Cheap and smooth; good base for fBm. */
export function valueNoise2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 2D gradient (Perlin-ish) noise in [-1,1]. Sharper features than value noise. */
export function gradNoise2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const grad = (ix, iy, dx, dy) => {
    const a = hash2(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fade(xf), v = fade(yf);
  const x1 = grad(xi, yi, xf, yf) * (1 - u) + grad(xi + 1, yi, xf - 1, yf) * u;
  const x2 = grad(xi, yi + 1, xf, yf - 1) * (1 - u) + grad(xi + 1, yi + 1, xf - 1, yf - 1) * u;
  return x1 * (1 - v) + x2 * v;
}

/** Fractal Brownian motion over gradNoise2. Returns roughly [-1,1]. */
export function fbm2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += gradNoise2(fx, fy, seed + i * 977) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}

/** Ridged fBm — the sharp crests that read as wind-carved sand and eroded stone. */
export function ridged2(x, y, { octaves = 5, lacunarity = 2.0, gain = 0.5, seed = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(gradNoise2(fx, fy, seed + i * 613));
    sum += n * n * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}

/**
 * Worley / cellular noise. Returns { f1, f2, id } — f2-f1 gives the crack network
 * used for masonry grout lines and cracked-mud ground.
 */
export function worley2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const px = cx + hash2(cx, cy, seed);
      const py = cy + hash2(cx, cy, seed + 7919);
      const dx = px - x, dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(cx, cy, seed + 104729); }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1, f2, id };
}

/** Domain-warped fbm — kills the grid-aligned look that makes procedural texture obvious. */
export function warpedFbm2(x, y, opts = {}) {
  const { warp = 0.6, seed = 1 } = opts;
  const wx = fbm2(x + 5.2, y + 1.3, { ...opts, seed: seed + 31 });
  const wy = fbm2(x + 1.7, y + 9.2, { ...opts, seed: seed + 97 });
  return fbm2(x + warp * wx, y + warp * wy, opts);
}

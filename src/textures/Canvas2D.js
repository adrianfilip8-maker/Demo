/**
 * Canvas2D — the pixel-level toolbox every material recipe is built from.
 *
 * Three ideas drive the whole texture library:
 *
 * 1. **Height first.** A recipe paints a `Float32Array` height field; colour, normal, AO and
 *    roughness all follow from it (see NormalMap.js). Carvings that only exist in the albedo
 *    read as stickers, so nothing here is allowed to be albedo-only.
 * 2. **Everything is periodic.** `Rand.js`'s fBm is beautiful but not tileable, and a visible
 *    seam is the single fastest way to look cheap. The noise below wraps the lattice modulo an
 *    integer cell count, so it repeats *exactly* at the tile edge with no contrast-killing
 *    cross-fade. Rand's non-periodic helpers are still used for decals and sprites, which are
 *    clamp-wrapped and therefore have no seam to hide.
 * 3. **Grime obeys gravity and geometry.** Dirt is not noise: it collects in concavities, smears
 *    *downward* from every ledge and joint, and dust settles on up-facing bevels. Those three
 *    passes are what separate "procedural texture" from "texture".
 *
 * Orientation convention (binding on every recipe): a `DataTexture` has `flipY = false`, so
 * **row 0 is v = 0 is the BOTTOM of the surface** and row `size-1` is the top. Down is −row.
 */

import { rng, warpedFbm2, ridged2, worley2 } from '../core/Rand.js';

/* ------------------------------------------------------------------------- */
/*  scalar helpers                                                           */
/* ------------------------------------------------------------------------- */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = sat((x - e0) / (e1 - e0 || 1e-9));
  return t * t * (3 - 2 * t);
};
/** Signed triangle wave in [-1,1], period 1 — cheap ripple/stripe primitive. */
export const tri = (x) => Math.abs(((x % 1) + 1.5) % 1 - 0.5) * 4 - 1;

/* ------------------------------------------------------------------------- */
/*  palette (AGENTS.md §2.2 — these hex values are the law)                   */
/* ------------------------------------------------------------------------- */

export const PAL = {
  sun: 0xffd9a0, fill: 0x6fa8d8, bounce: 0xe8a852, rimCool: 0x7fd4ff, rimWarm: 0xff9a5c,

  sandLight: 0xe6b878, sandMid: 0xc9915a, sandDark: 0x8a5a38, sandCrev: 0x4a2f22,
  limeLight: 0xf0e3c8, limeMid: 0xd4c19a, limeDark: 0x9a8462,
  goldLight: 0xffe9a8, goldMid: 0xe8b942, goldDark: 0x966a18, goldSpec: 0xfffbe8,

  lapis: 0x1f4f96, turquoise: 0x2fa8a0, carnelian: 0xb8452c, malachite: 0x2f8f5a,

  ochre: 0xd4823a, red: 0xa83828, black: 0x241a16, white: 0xf2e8d4,

  shadow: 0x2a3f66, inkWarm: 0x1a1210, inkCool: 0x161022,
  skyZenith: 0x3f7fc4, skyHorizon: 0xf0c88a, haze: 0xe8b878,
  sparkCore: 0x8fd8ff, sparkGlow: 0x2a7fd4,
};

/** hex → [r,g,b] in 0..1, sRGB-encoded (the values that land in the 8-bit texture). */
export function hexRGB(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const _mixTmp = [0, 0, 0];
/** Blend two hexes. Mixing happens in sRGB space on purpose: it is what a painter's eye expects. */
export function mixHex(a, b, t, out = _mixTmp) {
  const ar = ((a >> 16) & 255) / 255, ag = ((a >> 8) & 255) / 255, ab = (a & 255) / 255;
  const br = ((b >> 16) & 255) / 255, bg = ((b >> 8) & 255) / 255, bb = (b & 255) / 255;
  out[0] = ar + (br - ar) * t; out[1] = ag + (bg - ag) * t; out[2] = ab + (bb - ab) * t;
  return out;
}

/** '#rrggbb' string for canvas fills. */
export function css(hex, alpha = 1) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Nudge a hex toward light/dark without leaving its hue family. */
export function shade(hex, k) {
  return k >= 0 ? mixHex(hex, 0xffffff, k * 0.85) : mixHex(hex, 0x000000, -k);
}

/* ------------------------------------------------------------------------- */
/*  periodic noise                                                           */
/* ------------------------------------------------------------------------- */

const fadeC = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Same mixing constants as Rand.hash2 so this noise has the same grain character. */
function ihash(x, y, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
/** Hash to 0..1. */
export function hash01(x, y, seed = 1) { return ihash(x | 0, y | 0, seed | 0) / 4294967296; }

// Gradient LUT — 8 trig calls per octave per pixel would dominate the whole build otherwise.
const GN = 256;
const GX = new Float32Array(GN), GY = new Float32Array(GN);
for (let i = 0; i < GN; i++) { const a = (i / GN) * TAU; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }

/**
 * Periodic gradient noise, ≈[-1,1]. (u,v) are tile coordinates; `freq` is the integer number of
 * lattice cells across the tile, and the lattice wraps modulo it — that is what makes it seamless.
 * Sampling outside [0,1) is fine and wraps, so domain warping stays seamless too.
 */
export function nz(u, v, freq, seed = 1) {
  const f = freq | 0;
  const x = u * f, y = v * f;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const uu = fadeC(xf), vv = fadeC(yf);
  const x0 = ((xi % f) + f) % f, y0 = ((yi % f) + f) % f;
  const x1 = (x0 + 1) % f, y1 = (y0 + 1) % f;
  const i0 = ihash(x0, y0, seed) & (GN - 1), i1 = ihash(x1, y0, seed) & (GN - 1);
  const i2 = ihash(x0, y1, seed) & (GN - 1), i3 = ihash(x1, y1, seed) & (GN - 1);
  const n0 = GX[i0] * xf + GY[i0] * yf;
  const n1 = GX[i1] * (xf - 1) + GY[i1] * yf;
  const n2 = GX[i2] * xf + GY[i2] * (yf - 1);
  const n3 = GX[i3] * (xf - 1) + GY[i3] * (yf - 1);
  return ((n0 * (1 - uu) + n1 * uu) * (1 - vv) + (n2 * (1 - uu) + n3 * uu) * vv) * 1.38;
}

/**
 * Anisotropic periodic gradient noise: independent integer cell counts per axis. This is how
 * stretched detail (wood grain, cloth fibre, polish streaks along a shaft) stays seamless —
 * pre-multiplying u or v by a non-integer would put a seam down the middle of the tile.
 */
export function nzA(u, v, fx, fy, seed = 1) {
  const a = fx | 0, b = fy | 0;
  const x = u * a, y = v * b;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const uu = fadeC(xf), vv = fadeC(yf);
  const x0 = ((xi % a) + a) % a, y0 = ((yi % b) + b) % b;
  const x1 = (x0 + 1) % a, y1 = (y0 + 1) % b;
  const i0 = ihash(x0, y0, seed) & (GN - 1), i1 = ihash(x1, y0, seed) & (GN - 1);
  const i2 = ihash(x0, y1, seed) & (GN - 1), i3 = ihash(x1, y1, seed) & (GN - 1);
  const n0 = GX[i0] * xf + GY[i0] * yf;
  const n1 = GX[i1] * (xf - 1) + GY[i1] * yf;
  const n2 = GX[i2] * xf + GY[i2] * (yf - 1);
  const n3 = GX[i3] * (xf - 1) + GY[i3] * (yf - 1);
  return ((n0 * (1 - uu) + n1 * uu) * (1 - vv) + (n2 * (1 - uu) + n3 * uu) * vv) * 1.38;
}

/** Anisotropic periodic fBm. */
export function fbmA(u, v, fx, fy, oct = 4, gain = 0.5, seed = 1) {
  let sum = 0, amp = 1, norm = 0, a = fx | 0, b = fy | 0;
  for (let i = 0; i < oct; i++) {
    sum += nzA(u, v, a, b, seed + i * 977) * amp;
    norm += amp; amp *= gain; a *= 2; b *= 2;
  }
  return sum / (norm || 1);
}

/**
 * An integer frequency vector for a directional pattern. Stripes of the form
 * `tri(P*u + Q*v)` tile *exactly* when P and Q are integers, whereas rotating the coordinate
 * frame does not — this is the difference between ripples that wrap and ripples with a seam.
 */
export function freqVec(freq, angle) {
  const p = Math.round(freq * Math.cos(angle));
  const q = Math.round(freq * Math.sin(angle));
  return [p === 0 && q === 0 ? 1 : p, q];
}

/** Periodic value noise — softer, blobbier than gradient noise. Good for colour mottle. */
export function vz(u, v, freq, seed = 1) {
  const f = freq | 0;
  const x = u * f, y = v * f;
  const xi = Math.floor(x), yi = Math.floor(y);
  const uu = fadeC(x - xi), vv = fadeC(y - yi);
  const x0 = ((xi % f) + f) % f, y0 = ((yi % f) + f) % f;
  const x1 = (x0 + 1) % f, y1 = (y0 + 1) % f;
  const a = ihash(x0, y0, seed) / 4294967296, b = ihash(x1, y0, seed) / 4294967296;
  const c = ihash(x0, y1, seed) / 4294967296, d = ihash(x1, y1, seed) / 4294967296;
  return (a * (1 - uu) + b * uu) * (1 - vv) + (c * (1 - uu) + d * uu) * vv;
}

/** Periodic fBm, ≈[-1,1]. `freq` must be an integer; octaves double it so wrapping survives. */
export function fbmN(u, v, freq, oct = 5, gain = 0.5, seed = 1) {
  let sum = 0, amp = 1, norm = 0, f = freq | 0;
  for (let i = 0; i < oct; i++) {
    sum += nz(u, v, f, seed + i * 977) * amp;
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / (norm || 1);
}

/** Periodic ridged fBm in [0,1] — the sharp crests of wind-carved sand and eroded stone. */
export function ridgeN(u, v, freq, oct = 5, gain = 0.5, seed = 1) {
  let sum = 0, amp = 1, norm = 0, f = freq | 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(nz(u, v, f, seed + i * 613));
    sum += n * n * amp;
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / (norm || 1);
}

/**
 * Periodic domain-warped fBm — the mirror of Rand's `warpedFbm2`, made seamless. This is the
 * workhorse that keeps large blotches from lining up on a grid and shouting "procedural".
 */
export function warpN(u, v, freq, oct = 5, warp = 0.7, seed = 1) {
  const wx = fbmN(u + 0.31, v + 0.17, freq, 3, 0.5, seed + 3121);
  const wy = fbmN(u + 0.73, v + 0.59, freq, 3, 0.5, seed + 9173);
  return fbmN(u + (warp * wx) / freq, v + (warp * wy) / freq, freq, oct, 0.5, seed);
}

const _wOut = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
/**
 * Periodic Worley. `f2-f1` is the crack network used for mud plates, rubble and hammer facets;
 * `id` is a per-cell random for colour variation.
 */
export function worleyN(u, v, freq, seed = 1, jitter = 0.85, out = _wOut) {
  const f = freq | 0;
  const x = u * f, y = v * f;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const wx = ((cx % f) + f) % f, wy = ((cy % f) + f) % f;
      const jx = 0.5 + (ihash(wx, wy, seed) / 4294967296 - 0.5) * jitter;
      const jy = 0.5 + (ihash(wx, wy, seed + 7919) / 4294967296 - 0.5) * jitter;
      const dx = cx + jx - x, dy = cy + jy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1; f1 = d;
        id = ihash(wx, wy, seed + 104729) / 4294967296;
        bx = cx + jx; by = cy + jy;
      } else if (d < f2) f2 = d;
    }
  }
  out.f1 = f1; out.f2 = f2; out.id = id; out.cx = bx / f; out.cy = by / f;
  return out;
}

/* Rand.js's non-periodic family, re-exported so recipes for clamp-wrapped decals and sprites
   (no seam to hide) can reach for the original implementations. */
export { warpedFbm2, ridged2, worley2, rng };

/* ------------------------------------------------------------------------- */
/*  buffers                                                                  */
/* ------------------------------------------------------------------------- */

export function f32(n, v = 0) {
  const a = new Float32Array(n);
  if (v) a.fill(v);
  return a;
}

/** Wrap-aware separable box blur. 2–3 iterations ≈ Gaussian, at a fraction of the cost. */
export function blurWrap(src, size, radius, iter = 2) {
  const r = Math.max(1, Math.round(radius));
  const n = size * size;
  let a = Float32Array.from(src), b = new Float32Array(n);
  const w = 2 * r + 1;
  for (let it = 0; it < iter; it++) {
    // horizontal
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[row + (((k % size) + size) % size)];
      for (let x = 0; x < size; x++) {
        b[row + x] = sum / w;
        sum += a[row + ((x + r + 1) % size)] - a[row + (((x - r) % size) + size) % size];
      }
    }
    // vertical
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += b[(((k % size) + size) % size) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = sum / w;
        sum += b[((y + r + 1) % size) * size + x] - b[((((y - r) % size) + size) % size) * size + x];
      }
    }
  }
  return a;
}

/** Wrap-aware bilinear upsample of a coarse field to full resolution. */
export function upsample(coarse, cs, size) {
  const out = new Float32Array(size * size);
  const sc = cs / size;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * sc - 0.5;
    let y0 = Math.floor(fy);
    const ty = fy - y0;
    y0 = ((y0 % cs) + cs) % cs;
    const y1 = (y0 + 1) % cs;
    const r0 = y0 * cs, r1 = y1 * cs, dst = y * size;
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * sc - 0.5;
      let x0 = Math.floor(fx);
      const tx = fx - x0;
      x0 = ((x0 % cs) + cs) % cs;
      const x1 = (x0 + 1) % cs;
      const a = coarse[r0 + x0], b = coarse[r0 + x1], c = coarse[r1 + x0], d = coarse[r1 + x1];
      out[dst + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

/** Central-difference gradient in v (rows), wrap-aware. Positive = height rises going up. */
export function gradV(h, size) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size, dn = ((y - 1 + size) % size) * size, row = y * size;
    for (let x = 0; x < size; x++) out[row + x] = (h[up + x] - h[dn + x]) * 0.5;
  }
  return out;
}

/**
 * How much a texel faces the sky, ≈[-1,1]. On a vertical wall the top chamfer of a proud block
 * has height falling as v rises, so `-dh/dv > 0` there: that is where sun bleaches and dust sits.
 */
export function skyward(h, size, smooth = 2) {
  const g = gradV(blurWrap(h, size, smooth, 1), size);
  let mx = 1e-6;
  for (let i = 0; i < g.length; i++) { const a = Math.abs(g[i]); if (a > mx) mx = a; }
  const out = g;
  for (let i = 0; i < out.length; i++) out[i] = -out[i] / mx;
  return out;
}

/** Concavity: blurred height minus height. Positive in crevices — the grime accumulation mask. */
export function concavity(h, size, radius = 6, iter = 2) {
  const b = blurWrap(h, size, radius, iter);
  for (let i = 0; i < b.length; i++) b[i] -= h[i];
  return b;
}

/**
 * Smear a source mask downward under gravity. `max(src, acc*decay)` gives the characteristic
 * "runs from a fixed point and fades" profile rather than a uniform gradient. Two laps over the
 * column so the value at the tile seam has converged and the streak continues across it.
 */
export function streakDown(src, size, decay = 0.985, wobbleSeed = 7) {
  const out = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    // Per-column decay jitter: uniform-length streaks look printed.
    const d = decay - 0.012 * (ihash(x, 3, wobbleSeed) / 4294967296);
    let acc = 0;
    for (let k = 0; k < size * 2; k++) {
      const y = ((size - 1 - k) % size + size) % size;
      const i = y * size + x;
      const s = src[i];
      acc = s > acc * d ? s : acc * d;
      if (k >= size) out[i] = acc;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/*  canvas                                                                   */
/* ------------------------------------------------------------------------- */

export function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Rasterise vector art to a Float32 mask. Canvas anti-aliasing is free sub-pixel coverage, which
 * is exactly what a chisel bevel wants. NOTE the row flip: canvas y grows downward, texture v
 * grows upward, so glyphs authored the way they read on a wall land the right way up.
 */
export function rasterMask(size, draw) {
  const c = mkCanvas(size, size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  draw(ctx, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4, dstRow = y * size;
    for (let x = 0; x < size; x++) out[dstRow + x] = d[srcRow + x * 4 + 3] / 255;
  }
  return out;
}

/** As `rasterMask` but keeps colour — used for paint layers over a carved surface. */
export function rasterRGBA(size, draw) {
  const c = mkCanvas(size, size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const n = size * size;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), a = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4, dstRow = y * size;
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4, i = dstRow + x;
      const av = d[s + 3] / 255;
      // Canvas hands back premultiplied-ish integers; un-premultiply so paint edges stay in hue.
      r[i] = av > 0.004 ? d[s] / 255 : 0;
      g[i] = av > 0.004 ? d[s + 1] / 255 : 0;
      b[i] = av > 0.004 ? d[s + 2] / 255 : 0;
      a[i] = av;
    }
  }
  return { r, g, b, a };
}

/* ------------------------------------------------------------------------- */
/*  Surface — the working set a recipe paints into                           */
/* ------------------------------------------------------------------------- */

export class Surface {
  constructor(size, seed = 1) {
    this.size = size;
    this.n = size * size;
    /** Height in 0..1; the material's `bump` (metres) says what 1.0 means. */
    this.h = f32(this.n, 0.5);
    this.r = f32(this.n); this.g = f32(this.n); this.b = f32(this.n);
    this.rough = f32(this.n, 0.85);
    this.metal = f32(this.n, 0);
    /** Artist-authored occlusion, multiplied into the derived AO (painted recesses, fur depth). */
    this.occ = f32(this.n, 1);
    this.a = null;       // alpha, lazily created (sprites / cutouts)
    this.em = null;      // [r,g,b] emissive, lazily created
    /** Last `masonry()` layout painted into this surface, if any — joint/edge/block masks. */
    this.masonry = null;
    this.seed = seed;
    this.rand = rng(seed);
  }

  alpha() { if (!this.a) this.a = f32(this.n, 1); return this.a; }
  emissive() { if (!this.em) this.em = [f32(this.n), f32(this.n), f32(this.n)]; return this.em; }

  fill(hex) {
    const [r, g, b] = hexRGB(hex);
    this.r.fill(r); this.g.fill(g); this.b.fill(b);
    return this;
  }
  fillH(v) { this.h.fill(v); return this; }

  set(i, rgb) { this.r[i] = rgb[0]; this.g[i] = rgb[1]; this.b[i] = rgb[2]; }
  setHex(i, hex) {
    this.r[i] = ((hex >> 16) & 255) / 255;
    this.g[i] = ((hex >> 8) & 255) / 255;
    this.b[i] = (hex & 255) / 255;
  }
  mul(i, k) { this.r[i] *= k; this.g[i] *= k; this.b[i] *= k; }
  add(i, k) { this.r[i] += k; this.g[i] += k; this.b[i] += k; }
  /** Lerp texel i toward an rgb triple. */
  mix(i, rgb, t) {
    this.r[i] += (rgb[0] - this.r[i]) * t;
    this.g[i] += (rgb[1] - this.g[i]) * t;
    this.b[i] += (rgb[2] - this.b[i]) * t;
  }
  mixHex(i, hex, t) {
    const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
    this.r[i] += (r - this.r[i]) * t;
    this.g[i] += (g - this.g[i]) * t;
    this.b[i] += (b - this.b[i]) * t;
  }
  /** Multiply-blend toward a hex — how real dirt darkens without going grey. */
  stainHex(i, hex, t) {
    const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
    this.r[i] *= 1 - t * (1 - r); this.g[i] *= 1 - t * (1 - g); this.b[i] *= 1 - t * (1 - b);
  }

  /**
   * Build a scalar field at 1/div resolution and bilinearly upsample it. Low-frequency masks
   * (erosion, mottle, dampness) are indistinguishable at 1/4 res and cost 1/16 as much — this is
   * what keeps the whole library inside its 4-second build budget.
   */
  field(div, fn) {
    const cs = Math.max(4, Math.round(this.size / div));
    const c = new Float32Array(cs * cs);
    for (let y = 0; y < cs; y++) {
      const v = (y + 0.5) / cs;
      for (let x = 0; x < cs; x++) c[y * cs + x] = fn((x + 0.5) / cs, v);
    }
    return div <= 1 ? c : upsample(c, cs, this.size);
  }

  /** Full-resolution field. Only for detail that genuinely needs per-texel frequency. */
  fieldFull(fn) {
    const s = this.size, out = new Float32Array(this.n);
    for (let y = 0; y < s; y++) {
      const v = (y + 0.5) / s, row = y * s;
      for (let x = 0; x < s; x++) out[row + x] = fn((x + 0.5) / s, v, row + x);
    }
    return out;
  }

  /** Iterate every texel with (i, u, v). */
  each(fn) {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      const v = (y + 0.5) / s, row = y * s;
      for (let x = 0; x < s; x++) fn(row + x, (x + 0.5) / s, v);
    }
    return this;
  }

  /** Normalise height into 0..1 so `bump` means what it says. */
  normaliseH(lo = 0, hi = 1) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < this.n; i++) { const v = this.h[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const d = mx - mn || 1;
    for (let i = 0; i < this.n; i++) this.h[i] = lo + ((this.h[i] - mn) / d) * (hi - lo);
    return this;
  }
}

/* ------------------------------------------------------------------------- */
/*  masonry — the block layout engine                                        */
/* ------------------------------------------------------------------------- */

/**
 * Running-bond ashlar. Courses vary in height, blocks vary in width, and every block gets two
 * stable randoms so colour, height offset and wear can all key off *the block* rather than off
 * noise — per-block variation is the strongest anti-tiling cue there is, because the eye reads
 * masonry as objects, not as a pattern.
 *
 * Course boundary 0 sits exactly on v=0 and block boundary 0 on u=0, so the tile seam always
 * falls inside a mortar joint where it is invisible.
 *
 * @returns {{id:Float32Array,id2:Float32Array,joint:Float32Array,edge:Float32Array,
 *            bu:Float32Array,bv:Float32Array,courses:number}}
 */
export function masonry(size, o = {}) {
  const {
    courses = 6,
    aspect = 2.2,          // block width / course height
    bond = 0.5,            // course-to-course horizontal offset (0.5 = classic running bond)
    bondJitter = 0.09,
    courseJitter = 0.16,
    widthJitter = 0.30,
    jointW = 0.010,        // half-width of the mortar groove, in tile units
    chamfer = 0.016,       // chamfer ramp width outside the groove
    seed = 1,
  } = o;
  const rnd = rng(seed >>> 0);
  const n = size * size;

  /* --- course boundaries (tile units, ascending, first at 0) --- */
  const ch = new Float32Array(courses);
  let tot = 0;
  for (let c = 0; c < courses; c++) { ch[c] = 1 + rnd.jitter(courseJitter * 2); tot += ch[c]; }
  const cy = new Float32Array(courses + 1);
  for (let c = 0; c < courses; c++) cy[c + 1] = cy[c] + ch[c] / tot;
  cy[courses] = 1;

  /* --- per-row lookup: which course, and distance to the nearest horizontal joint --- */
  const rowC = new Uint16Array(size);
  const rowD = new Float32Array(size);
  const rowV = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    let c = courses - 1;
    for (let k = 0; k < courses; k++) if (v >= cy[k] && v < cy[k + 1]) { c = k; break; }
    rowC[y] = c;
    const dTop = cy[c + 1] - v, dBot = v - cy[c];
    rowD[y] = Math.min(dTop, dBot);
    rowV[y] = (v - cy[c]) / (cy[c + 1] - cy[c] || 1);
  }

  /* --- per-course vertical joints, as x lookups --- */
  const colB = [], colD = [], colU = [], colC = [], nBlk = new Uint16Array(courses);
  for (let c = 0; c < courses; c++) {
    const hgt = ch[c] / tot;
    const target = Math.max(2, Math.round(1 / Math.max(0.05, hgt * aspect)));
    const w = new Float32Array(target);
    let wt = 0;
    for (let i = 0; i < target; i++) { w[i] = 1 + rnd.jitter(widthJitter * 2); wt += w[i]; }
    const bx = new Float32Array(target + 1);
    // Running bond: shift the whole course, then wrap the first (partial) block around the seam.
    const off = ((c * bond + rnd.jitter(bondJitter)) % 1 + 1) % 1;
    bx[0] = 0;
    for (let i = 0; i < target; i++) bx[i + 1] = bx[i] + w[i] / wt;
    bx[target] = 1;

    const bi = new Uint16Array(size), bd = new Float32Array(size), bu = new Float32Array(size);
    const bc = new Float32Array(size);
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size - off + 1) % 1;
      let k = target - 1;
      for (let j = 0; j < target; j++) if (u >= bx[j] && u < bx[j + 1]) { k = j; break; }
      bi[x] = k;
      bd[x] = Math.min(bx[k + 1] - u, u - bx[k]);
      bu[x] = (u - bx[k]) / (bx[k + 1] - bx[k] || 1);
      // Centre of this block, back in *tile* u (undo the running-bond shift).
      bc[x] = (((bx[k] + bx[k + 1]) * 0.5 + off) % 1 + 1) % 1;
    }
    colB.push(bi); colD.push(bd); colU.push(bu); colC.push(bc); nBlk[c] = target;
  }

  const id = new Float32Array(n), id2 = new Float32Array(n);
  const joint = new Float32Array(n), edge = new Float32Array(n);
  const bu = new Float32Array(n), bv = new Float32Array(n);
  /* Block *centre* in tile coordinates. Per-block randoms (`id`, `id2`) are white noise — they
   * put the colour difference between two neighbouring blocks at the highest spatial frequency
   * the wall can carry, which is what makes ashlar read as a chequerboard rather than as one
   * quarry's stone. Sampling a smooth field at the block centre instead gives per-block variation
   * that is *spatially correlated*: neighbours are similar, distant blocks differ, and the wall
   * grows large tonal regions. Same amplitude, a tenth of the frequency. */
  const bcu = new Float32Array(n), bcv = new Float32Array(n);

  for (let y = 0; y < size; y++) {
    const c = rowC[y], dy = rowD[y], vv = rowV[y];
    const bi = colB[c], bd = colD[c], bux = colU[c], bcx = colC[c];
    const cvC = (cy[c] + cy[c + 1]) * 0.5;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x;
      const k = bi[x];
      const d = Math.min(dy, bd[x]);
      id[i] = ihash(k, c, seed + 17) / 4294967296;
      id2[i] = ihash(k, c, seed + 8191) / 4294967296;
      joint[i] = 1 - smoothstep(jointW, jointW + chamfer, d);
      edge[i] = sat((d - jointW) / (chamfer * 2.2));
      bu[i] = bux[x]; bv[i] = vv;
      bcu[i] = bcx[x]; bcv[i] = cvC;
    }
  }
  return { id, id2, joint, edge, bu, bv, bcu, bcv, courses, blocksPerCourse: nBlk };
}

/* ------------------------------------------------------------------------- */
/*  weathering passes                                                        */
/* ------------------------------------------------------------------------- */

/**
 * The pass that does most of the heavy lifting for "AAA texture": grime in every concavity,
 * gravity streaks running down from joints and ledges, sun-bleached dust on up-facing bevels.
 * Recipes call this after they have both a height field and a base colour.
 */
export function weather(s, o = {}) {
  const {
    source = null,             // extra streak sources (joints, cracks) 0..1
    crevice = PAL.sandCrev,
    creviceAmt = 0.55,
    creviceRadius = 7,
    streakAmt = 0.30,
    streakTint = 0x6a4a30,
    streakDecay = 0.988,
    dustAmt = 0.22,
    dust = PAL.sandLight,
    downDark = 0.18,           // extra darkening on down-facing bevels
    roughGrime = 0.10,
    seed = 11,
    /**
     * Scale on the two *direction-dependent* terms — pale dust on up-facing bevels, darkening
     * on down-facing ones. Both are keyed to `skyward()`, i.e. to the sign of dH/dv, so they
     * bake a fixed top-left light into the albedo.
     *
     * On a big weathered wall that is honest: dust really does settle on up-facing ledges and
     * really does not sit under them, and it does not move when the sun does. On a *carving* it
     * is a lie the review caught precisely — §7.3's "carvings look painted-on rather than
     * chiselled", reported as "a baked-in fake bevel (light top-left, dark bottom-right) that
     * does not correspond to the sun direction and does not change across faces". A relief that
     * carries its own painted highlight cannot be lit; it looks the same on the shaded side of a
     * pylon as on the sunlit side, which is the single clearest tell that the depth is fake.
     *
     * So carved recipes pass a low `directional` and put the contrast into the height field
     * instead, where the normal map and the AO can turn it into real, sun-dependent relief.
     */
    directional = 1.0,
  } = o;
  const size = s.size, n = s.n;
  const rr = Math.max(2, Math.round((creviceRadius * size) / 512));

  const conc = concavity(s.h, size, rr, 2);
  let cmax = 1e-6;
  for (let i = 0; i < n; i++) if (conc[i] > cmax) cmax = conc[i];
  const sky = skyward(s.h, size, Math.max(1, Math.round(size / 340)));

  // Streak sources: whatever the recipe nominates, plus the deepest crevices (dirt washes out of
  // joints and runs), modulated by a coarse blotch field so streaks cluster rather than comb.
  const blot = s.field(6, (u, v) => sat(warpN(u, v, 3, 4, 0.9, seed + 4) * 1.5 + 0.45));
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = sat(conc[i] / cmax);
    src[i] = sat((source ? source[i] * 0.9 : 0) + c * 0.85) * blot[i];
  }
  const streak = streakDown(src, size, streakDecay, seed + 31);
  const streakSoft = blurWrap(streak, size, Math.max(1, Math.round(size / 380)), 1);

  const fine = s.field(2, (u, v) => fbmN(u, v, 24, 3, 0.55, seed + 55) * 0.5 + 0.5);

  const dir = sat(directional);
  for (let i = 0; i < n; i++) {
    const c = sat(conc[i] / cmax);
    // Crevice grime: multiply-blend, so it darkens and warms instead of washing to grey.
    if (creviceAmt > 0) s.stainHex(i, crevice, sat(c * 1.25) * creviceAmt);
    const dn = sat(-sky[i]);
    if (downDark > 0) s.mul(i, 1 - dn * downDark * dir);
    const st = sat(streakSoft[i] * (0.65 + 0.7 * fine[i]));
    if (streakAmt > 0) s.stainHex(i, streakTint, st * streakAmt);
    const up = sat(sky[i]);
    if (dustAmt > 0) s.mixHex(i, dust, up * dustAmt * dir * (0.5 + 0.7 * fine[i]));
    s.rough[i] = sat(s.rough[i] + (st * 0.6 + c * 0.5) * roughGrime - up * 0.02);
    // Occlusion is geometric, not directional — a recess is occluded whichever way the sun is.
    s.occ[i] *= 1 - sat(c) * 0.30 - dn * 0.12 * dir;
  }
  return { conc, sky, streak: streakSoft };
}

/** Rec.709 luma of a texel. */
export function lumaAt(s, i) { return s.r[i] * 0.2126 + s.g[i] * 0.7152 + s.b[i] * 0.0722; }

/** Luma of a palette hex. */
export function lumaHex(hex) {
  return (((hex >> 16) & 255) * 0.2126 + ((hex >> 8) & 255) * 0.7152 + (hex & 255) * 0.0722) / 255;
}

/**
 * Pull a surface into the value range its palette ramp actually declares.
 *
 * AGENTS §2.2 names `crevice #4a2f22` as **the darkest value in the sandstone ramp**, and the
 * stone recipes were running three times darker than that: `hieroglyph_wall` bottomed out at
 * `#130d0b` (luma 0.05 against the crevice's 0.157), because `carve` + `weather`'s crevice stain
 * + `pitting`'s stain all multiply and compound with nothing holding the floor.
 *
 * That matters far more than "slightly off-spec", because of what the shader does downstream:
 * the cel model adds a flat `uShadowColor` wash (the violet-teal `#2a3f66`) proportional to
 * `1 - key`. On a bright texel the warm albedo dominates and the result reads as sandstone; on a
 * near-black texel there is no albedo left to dominate and the additive violet is *all that is
 * left*, so the texel renders as `#5a4a7a` — the off-palette violet the review found blotched
 * across every wall. The blotches are the shape of my dark tail. Holding the floor at the
 * specified crevice colour removes the violet at its source and costs nothing else: crevices stay
 * the darkest thing in the material, they just stop falling out of the palette.
 *
 * Hue-preserving by construction — a texel below the floor is mixed *toward the crevice hex*,
 * not lifted in value, so the darkest stone is warm brown rather than grey.
 */
export function rampFloor(s, o = {}) {
  const { crevice = PAL.sandCrev, floor = null, soft = 1.0, ceil = 0, mask = null } = o;
  const lo = floor == null ? lumaHex(crevice) : floor;
  const cr = ((crevice >> 16) & 255) / 255, cg = ((crevice >> 8) & 255) / 255, cb = (crevice & 255) / 255;
  const hi = ceil ? lumaHex(ceil) : 0;
  for (let i = 0; i < s.n; i++) {
    const y = s.r[i] * 0.2126 + s.g[i] * 0.7152 + s.b[i] * 0.0722;
    if (y < lo) {
      // t = 1 at black, 0 at the floor. `soft` lets a recipe keep a little more of its own tail.
      const t = sat((lo - y) / lo) * soft * (mask ? mask[i] : 1);
      s.r[i] += (cr - s.r[i]) * t;
      s.g[i] += (cg - s.g[i]) * t;
      s.b[i] += (cb - s.b[i]) * t;
    } else if (hi && y > hi) {
      const k = hi / y;
      s.r[i] *= k; s.g[i] *= k; s.b[i] *= k;
    }
  }
}

/**
 * Chisel marks — the short parallel gouges a copper adze leaves on dressed sandstone. Reads as
 * hand-worked stone rather than extruded geometry, and it is the closest thing this library has
 * to a signature.
 */
export function chiselMarks(s, o = {}) {
  const { amount = 0.05, angle = -0.42, freq = 60, jitter = 0.55, seed = 3, mask = null } = o;
  const [P, Q] = freqVec(freq, angle);
  const marks = s.field(1.5, (u, v) => {
    // Integer frequency vector, so the gouges wrap; the warp makes them wander like tool marks.
    const wob = fbmN(u, v, 8, 3, 0.5, seed + 71) * jitter;
    const gouge = 1 - Math.abs(tri(P * u + Q * v + wob * 0.55));
    // Broken, intermittent strokes — a chisel does not cut a continuous line.
    const along = 0.45 + 0.55 * (fbmA(u, v, Math.max(2, Math.abs(Q) || 3), Math.max(2, Math.abs(P)), 3, 0.5, seed + 5) * 0.5 + 0.5);
    return gouge * gouge * along;
  });
  for (let i = 0; i < s.n; i++) {
    const m = mask ? mask[i] : 1;
    s.h[i] -= marks[i] * amount * m;
    s.rough[i] = sat(s.rough[i] + marks[i] * 0.05 * m);
  }
  return marks;
}

/** Pockmarks — wind-blasted pitting. Worley troughs, not noise, so each pit has a rim. */
export function pitting(s, o = {}) {
  /* `stain` is deliberately much weaker than the height `amount`. A pit is a hole, and a hole
   * reads as a hole because of its shadow, not because someone painted a dark dot in it — at
   * pit frequency (30-40 cells per tile) a painted dot is just high-frequency dark speckle, and
   * dark speckle is what the cel shader converts into violet speckle. Let the AO do it. */
  const { amount = 0.06, freq = 40, density = 0.45, seed = 9, mask = null, colorDark = 0, stain = 0.20 } = o;
  const pit = s.field(1.5, (u, v) => {
    const w = worleyN(u, v, Math.max(2, Math.round(freq)), seed, 0.95);
    const on = w.id < density ? 1 : 0;
    const r = 0.30 + 0.30 * w.id;
    return on * sat(1 - w.f1 / r) ** 1.6;
  });
  for (let i = 0; i < s.n; i++) {
    const m = (mask ? mask[i] : 1) * pit[i];
    if (m <= 0) continue;
    s.h[i] -= m * amount;
    s.rough[i] = sat(s.rough[i] + m * 0.12);
    if (colorDark) s.stainHex(i, colorDark, m * stain);
    s.occ[i] *= 1 - m * 0.22;
  }
  return pit;
}

/**
 * Mineral / crystal speckle. `colors` is a list of [hex, probability, tone] triples.
 *
 * Cell frequency is capped at size/8 — a speckle whose cells are under ~8 texels has no mip
 * level that can carry it, so at any distance past arm's length it stops being mica and starts
 * being per-pixel noise. Capping here rather than at 30 call sites also means a recipe keeps
 * its intended look when its tier drops it to half resolution.
 */
export function speckle(s, o = {}) {
  const { freq = 150, colors = [[PAL.white, 0.3, 0.1]], seed = 21, heightDelta = 0, mask = null } = o;
  const fq = Math.max(2, Math.min(Math.round(freq), Math.round(s.size / 8)));
  const s2 = s.size;
  for (let y = 0; y < s2; y++) {
    const v = (y + 0.5) / s2, row = y * s2;
    for (let x = 0; x < s2; x++) {
      const i = row + x;
      if (mask && mask[i] <= 0.01) continue;
      const w = worleyN((x + 0.5) / s2, v, fq, seed, 1.0);
      let p = 0;
      for (const [hex, prob, tone] of colors) {
        p += prob;
        if (w.id < p) {
          const k = sat(1 - w.f1 / (0.28 + 0.42 * ((w.id * 37) % 1)));
          const amt = k * k * (mask ? mask[i] : 1);
          s.mixHex(i, hex, amt * (0.55 + tone));
          if (heightDelta) s.h[i] += (((w.id * 91) % 1) - 0.5) * heightDelta * amt;
          break;
        }
      }
    }
  }
}

/**
 * Painterly brushwork — broad directional strokes of tinted colour. AGENTS §2.1.7 asks for
 * visible brush/chisel character; flat noise does not read as a hand, strokes do.
 */
export function brushwork(s, o = {}) {
  const { tint = PAL.sandLight, amount = 0.12, angle = 0.3, freq = 9, len = 4, seed = 5, mask = null } = o;
  const [P, Q] = freqVec(freq * len, angle);
  const strokes = s.field(3, (u, v) => {
    const w = fbmN(u, v, Math.max(2, freq), 3, 0.5, seed + 13) * 0.55;
    // Bristle ridges across the stroke, long smears along it.
    const across = 1 - Math.abs(tri(P * u + Q * v + w));
    const alongV = fbmA(u, v, Math.max(2, Math.abs(Q) || 2), Math.max(2, Math.abs(P)), 3, 0.5, seed + 29) * 0.5 + 0.5;
    return sat(across * 0.75 + alongV * 0.55);
  });
  for (let i = 0; i < s.n; i++) {
    const m = mask ? mask[i] : 1;
    s.mixHex(i, tint, sat(strokes[i] - 0.35) * amount * m);
  }
  return strokes;
}

/**
 * Paint remnants in the recesses of a carving. Paint survives where it was sheltered — deep in
 * the cut, out of the wind and sun — so surviving pigment is a *function of depth*, not a decal.
 */
export function paintRemnants(s, cut, paint, o = {}) {
  const { survival = 0.55, freq = 7, seed = 17, edgeLoss = 0.55, gloss = -0.12, fade = 0 } = o;
  const wearField = s.field(3, (u, v) => sat(warpN(u, v, Math.max(2, freq | 0), 5, 1.0, seed) * 1.25 + 0.5));
  const shelter = blurWrap(cut, s.size, Math.max(1, Math.round(s.size / 200)), 1);
  for (let i = 0; i < s.n; i++) {
    const pa = paint.a[i];
    if (pa <= 0.01) continue;
    // Deep in the cut → sheltered → paint survives. On the exposed lip → scoured away.
    const depth = sat(shelter[i] * 1.15);
    const keep = sat((wearField[i] * survival + depth * 0.65 - edgeLoss * (1 - depth)) * 1.6) * pa;
    if (keep <= 0.002) continue;
    /* `fade` bleaches the surviving pigment toward the stone it sits on before it is laid down.
     *
     * Three-thousand-year-old pigment in a sunk relief is a *ghost* of a colour — and the
     * saturation matters more than it looks, because a wall of full-strength pigment stops
     * reading as writing. The review's complaint that "the hieroglyph vocabulary reads as
     * abstract confetti — green crescents, red lozenges, pink discs" is partly a saturation
     * problem: at full chroma the eye files each mark as an independent coloured object rather
     * than as pigment *in* a carving, so the wall reads as pattern and the carving underneath
     * stops being visible. Fading toward the local stone keeps the hue (you can still tell red
     * ochre from Egyptian blue) and lets the *relief* carry the read. */
    let pr = paint.r[i], pg = paint.g[i], pb = paint.b[i];
    if (fade > 0) {
      pr += (s.r[i] - pr) * fade;
      pg += (s.g[i] - pg) * fade;
      pb += (s.b[i] - pb) * fade;
    }
    s.r[i] += (pr - s.r[i]) * keep;
    s.g[i] += (pg - s.g[i]) * keep;
    s.b[i] += (pb - s.b[i]) * keep;
    s.rough[i] = sat(s.rough[i] + gloss * keep);
  }
}

/**
 * Flow-aligned streaks by line-integral convolution: smear an isotropic high-frequency noise
 * along a direction field. Rotating the sampling frame would break periodicity, but *walking*
 * through a periodic noise never does — every tap wraps. This is what makes fur, hair and brushed
 * metal read as directional instead of as noise.
 *
 * @param {Float32Array} angle per-texel direction field (radians)
 */
export function flowStreaks(s, angle, o = {}) {
  const { freq = 220, taps = 7, len = 0.05, seed = 5, curl = 0.35 } = o;
  const size = s.size;
  // Strand pitch finer than ~4 texels can't be carried by a mip, so it reads as fizz, not fur.
  const fq = Math.max(4, Math.min(Math.round(freq), Math.round(size / 4)));
  const out = new Float32Array(s.n);
  const step = len / Math.max(1, taps - 1);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size, row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x, u = (x + 0.5) / size;
      let a = angle[i];
      let px = u, py = v, sum = 0, wsum = 0;
      for (let k = 0; k < taps; k++) {
        const t = k / Math.max(1, taps - 1);
        const w = 1 - t * 0.55;
        sum += (vz(px, py, fq, seed) - 0.5) * w;
        wsum += w;
        // Let the walk curl a little so strands are not dead straight.
        a += (vz(px * 1.7, py * 1.7, 9, seed + 13) - 0.5) * curl;
        px += Math.cos(a) * step;
        py += Math.sin(a) * step;
      }
      out[i] = sat(sum / wsum * 2.4 + 0.5);
    }
  }
  return out;
}

/**
 * Fine grain — the last 1% that stops big flat areas looking like vector art.
 *
 * Capped at size/7 for the same reason as `speckle`: grain at 2–4 texels per period is below
 * what the mip chain can represent, so it survives minification as sparkle instead of fading
 * out the way real grain does. Detail should be visible at 2 m and gone by 30 m.
 */
export function grain(s, o = {}) {
  const { amount = 0.02, freq = 220, seed = 43, heightAmt = 0.012 } = o;
  const fq = Math.max(2, Math.min(Math.round(freq), Math.round(s.size / 7)));
  const s2 = s.size;
  for (let y = 0; y < s2; y++) {
    const v = (y + 0.5) / s2, row = y * s2;
    for (let x = 0; x < s2; x++) {
      const i = row + x;
      const g = vz((x + 0.5) / s2, v, fq, seed) - 0.5;
      s.mul(i, 1 + g * amount * 2);
      s.h[i] += g * heightAmt;
    }
  }
}

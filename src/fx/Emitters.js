import { rng } from '../core/Rand.js';

/**
 * Emitters.js — the FX catalogue.
 *
 * Two kinds of data live here and nothing else:
 *
 *  1. **The sprite vocabulary.** Every particle in the game samples one 4×4 atlas built
 *     procedurally in `buildAtlas()`. The shapes are the art direction: chunky, closed,
 *     hard-edged silhouettes (§2.1 cel shading applies to particles too — a soft photoreal
 *     wisp reads as somebody else's game). Dust is a lumpy cartoon volume with a two-band
 *     cel shade and an ink rim; sparks are hard four-point lozenges; the ring is a crisp
 *     annulus. Nothing here is a Gaussian blob.
 *
 *  2. **The emitter definitions.** Plain data: ranges, curves, colours. `Particles.js` reads
 *     them and writes GPU instance attributes; the motion itself is integrated analytically
 *     in the vertex shader, so a definition is a description of a *curve*, never a per-frame
 *     simulation.
 *
 * Ranges are `[min, max]` and sampled with the deterministic `rng()` from core/Rand.js.
 */

/* ── atlas tiles (index into the 4×4 grid) ───────────────────────────────── */
export const TILE = {
  DUST: 0, DUST2: 1, DUST3: 2, SMOKE: 3,
  SPARK: 4, STAR: 5, RING: 6, GRAIN: 7,
  EMBER: 8, MOTE: 9, CHUNK: 10, STREAK: 11,
  CRACK: 12, SCORCH: 13, SHIMMER: 14, GLOW: 15,
};

/* ── §2.2 palette, the only colours allowed out of this file ─────────────── */
export const PAL = {
  sandLight: 0xe6b878, sandMid: 0xc9915a, sandDark: 0x8a5a38, crevice: 0x4a2f22,
  limeLight: 0xf0e3c8, limeMid: 0xd4c19a,
  goldLight: 0xffe9a8, goldMid: 0xe8b942, goldSpec: 0xfffbe8, goldDark: 0x966a18,
  sparkCore: 0x8fd8ff, sparkGlow: 0x2a7fd4,
  keySun: 0xffd9a0, skyFill: 0x6fa8d8, bounce: 0xe8a852,
  rimCool: 0x7fd4ff, rimWarm: 0xff9a5c,
  shadow: 0x2a3f66, haze: 0xe8b878,
  emberHot: 0xffe6b0, emberCool: 0xb8452c,
  smoke: 0x3a3040, smokeLit: 0x6f5f66,
  woodChip: 0x8a6a44, metalSpark: 0xfff2c8,
};

/* =========================================================================
   1. The sprite atlas
   ========================================================================= */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
const len2 = (x, y) => Math.sqrt(x * x + y * y);

/**
 * Build the 4×4 sprite atlas as a canvas.
 *
 * Painted per-pixel rather than with canvas paths because every shape here needs a
 * *controlled* edge — a two-pixel ramp, not the browser's antialiasing — and because the
 * cel shading inside each dust puff is a function of position, not a gradient fill.
 */
export function buildAtlas(size = 512, seed = 0x5c17c00) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const tiles = 4;
  const ts = (size / tiles) | 0;
  const painters = makePainters(seed);
  const out = [0, 0, 0, 0];

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const idx = ty * tiles + tx;
      const paint = painters[idx] || painters[0];
      for (let py = 0; py < ts; py++) {
        // 4 px of dead margin inside every tile so mip generation bleeds transparency
        // between neighbours instead of bleeding a spark into a dust puff.
        const v = ((py + 0.5) / ts) * 2 - 1;
        for (let px = 0; px < ts; px++) {
          const u = ((px + 0.5) / ts) * 2 - 1;
          const m = 1.06;                     // sample slightly outside so shapes end inside
          paint(u * m, v * m, out);
          const o = ((ty * ts + py) * size + (tx * ts + px)) * 4;
          data[o] = (clamp01(out[0]) * 255) | 0;
          data[o + 1] = (clamp01(out[1]) * 255) | 0;
          data[o + 2] = (clamp01(out[2]) * 255) | 0;
          data[o + 3] = (clamp01(out[3]) * 255) | 0;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Lumpy cartoon volume: a handful of overlapping discs, hard edge, two-band cel shade. */
function dustPainter(R, lobes, wobble) {
  const blobs = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + R.jitter(0.7);
    const d = i === 0 ? 0 : R.range(0.22, 0.42);
    blobs.push({
      x: Math.cos(a) * d, y: Math.sin(a) * d * 0.86,
      r: i === 0 ? R.range(0.46, 0.56) : R.range(0.26, 0.44),
    });
  }
  const wob = R.range(0, 6.28);
  return (x, y, out) => {
    // Slight radial wobble breaks the "circle" read without softening the edge.
    const ang = Math.atan2(y, x);
    const w = 1 + wobble * Math.sin(ang * 3 + wob) * 0.5 + wobble * Math.sin(ang * 5 - wob) * 0.3;
    let f = -1;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const dx = (x - b.x) / (b.r * w), dy = (y - b.y) / (b.r * w);
      const v = 1 - (dx * dx + dy * dy);
      if (v > f) f = v;
    }
    const a = smooth(0.0, 0.09, f);
    if (a <= 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    // Cel volume: light from upper-left, quantised to two bands plus a dark ink rim.
    const nl = clamp01((-x * 0.45 - y * 0.62) * 0.7 + 0.55);
    const band = nl > 0.62 ? 1.0 : nl > 0.34 ? 0.80 : 0.62;
    const rim = 1 - smooth(0.0, 0.26, f);
    const l = band * (1 - rim * 0.42);
    out[0] = l; out[1] = l * 0.985; out[2] = l * 0.96; out[3] = a;
  };
}

/** Soft-shouldered but still closed: torch smoke wants volume, not a wisp. */
function smokePainter(R) {
  const blobs = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R.jitter(0.9);
    const d = i === 0 ? 0 : R.range(0.18, 0.40);
    blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: i === 0 ? 0.54 : R.range(0.28, 0.46) });
  }
  return (x, y, out) => {
    let f = -1;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const dx = (x - b.x) / b.r, dy = (y - b.y) / b.r;
      const v = 1 - (dx * dx + dy * dy);
      if (v > f) f = v;
    }
    const a = smooth(0.0, 0.42, f) * 0.92;
    const nl = clamp01((-x * 0.4 - y * 0.7) * 0.6 + 0.5);
    const l = 0.55 + 0.45 * (nl > 0.55 ? 1 : nl > 0.3 ? 0.62 : 0.3);
    out[0] = l; out[1] = l * 0.96; out[2] = l * 0.98; out[3] = a;
  };
}

/** Hard four-point lozenge — the spark silhouette. Long on Y, white-hot core. */
function sparkPainter(aspect, power) {
  return (x, y, out) => {
    const px = Math.abs(x) / aspect, py = Math.abs(y);
    const d = Math.pow(px, power) + Math.pow(py, power);
    const a = 1 - smooth(0.92, 1.02, d);
    if (a <= 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    const core = 1 - smooth(0.0, 0.5, d);
    const l = 0.62 + 0.38 * core;
    out[0] = l; out[1] = l * (0.92 + 0.08 * core); out[2] = l * (0.80 + 0.2 * core);
    out[3] = a;
  };
}

/** Sly's four-point diamond, as a texture (the sparkle field draws its own analytically). */
function starPainter() {
  return (x, y, out) => {
    const d = Math.sqrt(Math.abs(x)) + Math.sqrt(Math.abs(y));
    const r = len2(x, y);
    const star = 1 - smooth(0.90, 1.0, d);
    const core = 1 - smooth(0.0, 0.30, r);
    const halo = Math.pow(Math.max(0, 1 - r), 3.0);
    const a = clamp01(star * 0.95 + core * 0.9 + halo * 0.35);
    const t = clamp01(core * 1.4 + star * 0.5);
    out[0] = 0.55 + 0.45 * t; out[1] = 0.85 + 0.15 * t; out[2] = 1.0;
    out[3] = a;
  };
}

/** Shockwave annulus: crisp outer lip, short inner falloff, slightly uneven. */
function ringPainter(R) {
  const ph = R.range(0, 6.28);
  return (x, y, out) => {
    const r = len2(x, y);
    const ang = Math.atan2(y, x);
    const wob = 1 + 0.045 * Math.sin(ang * 3 + ph) + 0.03 * Math.sin(ang * 7 - ph);
    const edge = 0.90 * wob;
    const band = 1 - smooth(0.0, 0.16, Math.abs(r - edge * 0.86));
    const lip = 1 - smooth(edge - 0.02, edge + 0.03, r);
    const inner = (1 - smooth(0.30, edge, r)) * 0.22;
    const a = clamp01(band * lip * 1.15 + inner);
    const l = 0.7 + 0.3 * band;
    out[0] = l; out[1] = l * 0.96; out[2] = l * 0.9; out[3] = a;
  };
}

/** A grain of wind-blown sand: a stretched lozenge, faintly granular. */
function grainPainter(R) {
  const s = R.range(0, 1000);
  return (x, y, out) => {
    const dx = x / 0.34, dy = y;
    const d = dx * dx + dy * dy;
    const a = (1 - smooth(0.55, 1.0, d)) * 0.95;
    if (a <= 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    const g = 0.86 + 0.14 * Math.sin((x * 31.7 + y * 17.3 + s) * 3.1);
    const l = (0.72 + 0.28 * (1 - smooth(0.0, 0.7, d))) * g;
    out[0] = l; out[1] = l * 0.98; out[2] = l * 0.94; out[3] = a;
  };
}

/** Hot dot with a tight halo — embers and coin sparkles. */
function emberPainter() {
  return (x, y, out) => {
    const r = len2(x, y);
    const dot = 1 - smooth(0.34, 0.44, r);
    const halo = Math.pow(Math.max(0, 1 - r), 2.6) * 0.5;
    const a = clamp01(dot + halo);
    const l = 0.5 + 0.5 * dot;
    out[0] = l; out[1] = l * 0.9; out[2] = l * 0.78; out[3] = a;
  };
}

/** Mote: a hard little chip of light with a faint bloom, so it reads at 3 px. */
function motePainter() {
  return (x, y, out) => {
    const r = len2(x, y);
    const dot = 1 - smooth(0.22, 0.30, r);
    const halo = Math.pow(Math.max(0, 1 - r), 3.2) * 0.42;
    const a = clamp01(dot * 0.95 + halo);
    out[0] = 1; out[1] = 0.97; out[2] = 0.92; out[3] = a;
  };
}

/** Angular debris chip — flat facets, no curve, reads as broken stone. */
function chunkPainter(R) {
  const facets = R.int(5, 7);
  const rs = [];
  for (let i = 0; i < facets; i++) rs.push(R.range(0.62, 0.95));
  const rot = R.range(0, 6.28);
  return (x, y, out) => {
    const ang = Math.atan2(y, x) + rot;
    const r = len2(x, y);
    const f = ((ang / (Math.PI * 2)) % 1 + 1) % 1 * facets;
    const i0 = Math.floor(f), t = f - i0;
    const rr = rs[i0 % facets] * (1 - t) + rs[(i0 + 1) % facets] * t;
    const a = 1 - smooth(rr - 0.05, rr, r);
    if (a <= 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    const nl = clamp01((-x * 0.5 - y * 0.6) * 0.8 + 0.5);
    const l = nl > 0.55 ? 0.95 : nl > 0.32 ? 0.72 : 0.5;
    out[0] = l; out[1] = l * 0.97; out[2] = l * 0.92; out[3] = a;
  };
}

/** Motion streak: a capsule with hard sides and tapered ends. */
function streakPainter() {
  return (x, y, out) => {
    const w = 1 - smooth(0.55, 0.98, Math.abs(x) / 0.22);
    const l = 1 - smooth(0.55, 1.0, Math.abs(y));
    const a = clamp01(w * l);
    const c = 0.7 + 0.3 * w;
    out[0] = c; out[1] = c * 0.96; out[2] = c * 0.9; out[3] = a;
  };
}

/** Radial crack decal — the dive-attack floor damage. */
function crackPainter(R) {
  const n = R.int(6, 8);
  const arms = [];
  for (let i = 0; i < n; i++) {
    arms.push({
      a: (i / n) * Math.PI * 2 + R.jitter(0.35),
      w: R.range(0.9, 1.5), ph: R.range(0, 6.28), len: R.range(0.72, 1.0),
      k: R.range(6, 11),
    });
  }
  return (x, y, out) => {
    const r = len2(x, y);
    if (r > 1) { out[0] = out[1] = out[2] = out[3] = 0; return; }
    const th = Math.atan2(y, x);
    let a = 0;
    for (let i = 0; i < arms.length; i++) {
      const m = arms[i];
      if (r > m.len) continue;
      const bend = 0.10 * Math.sin(r * m.k + m.ph);
      let d = th - (m.a + bend);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const width = (0.055 * m.w) * (1 - r / m.len) + 0.006;
      const v = 1 - smooth(width * 0.35, width, Math.abs(d) * Math.max(r, 0.12));
      if (v > a) a = v;
    }
    // A dusty bruise around the impact point so the cracks sit in something.
    const bruise = (1 - smooth(0.15, 0.85, r)) * 0.30;
    const al = clamp01(a * (1 - smooth(0.8, 1.0, r)) + bruise);
    const l = a > 0.5 ? 0.16 : 0.42;   // crack interiors are crevice-dark
    out[0] = l; out[1] = l * 0.9; out[2] = l * 0.86; out[3] = al;
  };
}

/** Scuff ring decal — where a landing kicked the dust off the paving. */
function scorchPainter(R) {
  const ph = R.range(0, 6.28);
  return (x, y, out) => {
    const r = len2(x, y);
    const ang = Math.atan2(y, x);
    const wob = 1 + 0.10 * Math.sin(ang * 3 + ph) + 0.06 * Math.sin(ang * 6 - ph * 1.7);
    const outer = 1 - smooth(0.55 * wob, 0.98 * wob, r);
    const inner = smooth(0.10, 0.58, r);
    const a = clamp01(outer * (0.25 + 0.75 * inner)) * 0.85;
    const l = 0.9;
    out[0] = l; out[1] = l * 0.97; out[2] = l * 0.9; out[3] = a;
  };
}

/** Heat shimmer lens: a wide, soft horizontal band. Deliberately the one soft shape. */
function shimmerPainter() {
  return (x, y, out) => {
    const a = Math.pow(Math.max(0, 1 - Math.abs(y)), 1.6) * Math.pow(Math.max(0, 1 - Math.abs(x)), 1.1);
    out[0] = 1; out[1] = 0.94; out[2] = 0.86; out[3] = clamp01(a * 0.9);
  };
}

/** Plain radial glow — fire cores, coin pops, brazier bloom. */
function glowPainter() {
  return (x, y, out) => {
    const r = len2(x, y);
    const a = Math.pow(Math.max(0, 1 - r), 2.4);
    const core = 1 - smooth(0.0, 0.32, r);
    out[0] = 1; out[1] = 0.9 + 0.1 * core; out[2] = 0.76 + 0.24 * core;
    out[3] = clamp01(a + core * 0.5);
  };
}

function makePainters(seed) {
  const R = rng(seed);
  return [
    dustPainter(rng(seed + 11), 5, 0.10),
    dustPainter(rng(seed + 23), 6, 0.14),
    dustPainter(rng(seed + 37), 4, 0.08),
    smokePainter(rng(seed + 41)),
    sparkPainter(0.30, 0.62),
    starPainter(),
    ringPainter(rng(seed + 59)),
    grainPainter(rng(seed + 67)),
    emberPainter(),
    motePainter(),
    chunkPainter(rng(seed + 71)),
    streakPainter(),
    crackPainter(rng(seed + 83)),
    scorchPainter(rng(seed + 97)),
    shimmerPainter(),
    glowPainter(),
    // (R is consumed above only to keep the seed stream stable if tiles are reordered)
  ].map((p) => p || ((x, y, o) => { o[0] = o[1] = o[2] = o[3] = 0; void R; }));
}

/* =========================================================================
   2. Emitter definitions
   =========================================================================

   Fields:
     batch      which GPU batch draws it: 'dust' | 'spark' | 'ring' | 'smoke'
     tile       atlas tile, or an array to pick from
     count      particles per burst  [min,max]
     life       seconds  [min,max]
     speed      initial speed m/s  [min,max]
     spread     'cone' | 'disc' | 'sphere'   (around the supplied direction)
     cone       half-angle, radians (cone), or disc thickness
     gravity    m/s² pulling -Y (negative floats the particle up)
     drag       linear drag coefficient; high drag == front-loaded, fast decel
     turb       metres of seeded wander per second of age
     wind       0..1, how much the global wind drags it
     size       [start, end] metres
     sizeExp    curve on the size ramp (<1 = grows fast then holds)
     spin       rad/s [min,max]
     fadeIn     fraction of life spent fading in
     fadeOut    exponent on (1-u); >1 holds then drops, <1 drops immediately
     alpha      [min,max] peak opacity (or additive gain)
     col0/col1  start and end colour (sRGB hex; converted to linear on load)
     stretch    velocity stretching (spark batch only)
     jitter     metres of spawn-position scatter
*/
export const EMITTERS = {
  /* ── footsteps ─────────────────────────────────────────────────────────── */
  footstep_sand: {
    batch: 'dust', tile: [TILE.DUST, TILE.DUST2, TILE.DUST3], count: [4, 6], life: [0.55, 0.9],
    speed: [0.5, 1.5], spread: 'disc', cone: 0.5, gravity: 1.2, drag: 3.6, turb: 0.10, wind: 0.5,
    size: [0.10, 0.55], sizeExp: 0.5, spin: [-1.8, 1.8], fadeIn: 0.08, fadeOut: 1.7,
    alpha: [0.42, 0.60], col0: PAL.sandLight, col1: PAL.sandMid, jitter: 0.09,
  },
  footstep_stone: {
    batch: 'dust', tile: [TILE.DUST, TILE.DUST3], count: [2, 4], life: [0.35, 0.6],
    speed: [0.4, 1.0], spread: 'disc', cone: 0.35, gravity: 1.6, drag: 4.6, turb: 0.07, wind: 0.35,
    size: [0.07, 0.30], sizeExp: 0.5, spin: [-2.2, 2.2], fadeIn: 0.07, fadeOut: 1.9,
    alpha: [0.22, 0.36], col0: PAL.limeLight, col1: PAL.limeMid, jitter: 0.07,
  },
  footstep_wood: {
    batch: 'dust', tile: [TILE.DUST3, TILE.CHUNK], count: [2, 3], life: [0.3, 0.5],
    speed: [0.5, 1.2], spread: 'disc', cone: 0.4, gravity: 3.2, drag: 4.0, turb: 0.05, wind: 0.2,
    size: [0.05, 0.20], sizeExp: 0.6, spin: [-3, 3], fadeIn: 0.06, fadeOut: 1.8,
    alpha: [0.3, 0.45], col0: PAL.woodChip, col1: PAL.sandDark, jitter: 0.06,
  },
  footstep_metal: {
    batch: 'spark', tile: TILE.SPARK, count: [2, 4], life: [0.18, 0.32],
    speed: [1.4, 3.2], spread: 'cone', cone: 1.1, gravity: 7, drag: 5.0, turb: 0.0, wind: 0,
    size: [0.05, 0.015], sizeExp: 1.0, spin: [0, 0], fadeIn: 0.02, fadeOut: 1.6,
    alpha: [1.5, 2.4], col0: PAL.metalSpark, col1: PAL.emberCool, stretch: 0.09, jitter: 0.03,
  },

  /* ── landing ───────────────────────────────────────────────────────────── */
  land_dust: {
    batch: 'dust', tile: [TILE.DUST, TILE.DUST2, TILE.DUST3], count: [8, 12], life: [0.6, 1.15],
    speed: [1.6, 3.4], spread: 'disc', cone: 0.30, gravity: 1.0, drag: 3.0, turb: 0.16, wind: 0.55,
    size: [0.16, 0.95], sizeExp: 0.45, spin: [-1.6, 1.6], fadeIn: 0.06, fadeOut: 1.6,
    alpha: [0.42, 0.62], col0: PAL.sandLight, col1: PAL.sandMid, jitter: 0.12,
  },
  land_ring: {
    batch: 'ring', tile: TILE.RING, count: [1, 1], life: [0.42, 0.42],
    speed: [0, 0], gravity: 0, drag: 0, turb: 0, wind: 0,
    size: [0.5, 3.2], sizeExp: 0.42, spin: [0, 0], fadeIn: 0.04, fadeOut: 1.5,
    alpha: [0.5, 0.5], col0: PAL.sandLight, col1: PAL.haze,
  },

  /* ── cane combo impact ─────────────────────────────────────────────────────
     Whole event under 250 ms and front-loaded: the sparks leave at 14 m/s with a drag
     of 13, so 80% of the travel happens in the first 60 ms and then they hang and die.
     That deceleration curve is what makes an impact read as force rather than fireworks. */
  cane_spark: {
    batch: 'spark', tile: TILE.SPARK, count: [22, 28], life: [0.12, 0.22],
    speed: [9, 16], spread: 'disc', cone: 0.55, gravity: 12, drag: 13, turb: 0, wind: 0,
    size: [0.085, 0.02], sizeExp: 0.8, spin: [0, 0], fadeIn: 0.02, fadeOut: 1.1,
    alpha: [2.2, 3.4], col0: PAL.goldSpec, col1: PAL.goldMid, stretch: 0.075, jitter: 0.05,
  },
  cane_flash: {
    batch: 'spark', tile: TILE.GLOW, count: [1, 1], life: [0.11, 0.11],
    speed: [0, 0], gravity: 0, drag: 0, turb: 0, wind: 0,
    size: [1.5, 0.5], sizeExp: 1.6, spin: [0, 0], fadeIn: 0.01, fadeOut: 2.0,
    alpha: [2.6, 2.6], col0: PAL.goldLight, col1: PAL.goldMid,
  },
  cane_ring: {
    batch: 'ring', tile: TILE.RING, count: [1, 1], life: [0.21, 0.21],
    speed: [0, 0], gravity: 0, drag: 0, turb: 0, wind: 0,
    size: [0.25, 2.5], sizeExp: 0.38, spin: [0, 0], fadeIn: 0.02, fadeOut: 1.35,
    alpha: [2.0, 2.0], col0: PAL.goldSpec, col1: PAL.rimCool,
  },
  cane_debris: {
    batch: 'dust', tile: [TILE.DUST, TILE.CHUNK, TILE.DUST3], count: [6, 9], life: [0.30, 0.55],
    speed: [2.5, 6.0], spread: 'disc', cone: 0.7, gravity: 6, drag: 5.5, turb: 0.06, wind: 0.2,
    size: [0.10, 0.34], sizeExp: 0.5, spin: [-6, 6], fadeIn: 0.04, fadeOut: 1.7,
    alpha: [0.5, 0.75], col0: PAL.limeLight, col1: PAL.sandMid, jitter: 0.10,
  },
  /* Gold arc laid along the cane's swing — the frozen "whoosh" for stills. */
  cane_arc: {
    batch: 'spark', tile: TILE.STREAK, count: [12, 12], life: [0.22, 0.30],
    speed: [0.2, 0.6], spread: 'cone', cone: 0.4, gravity: 0.4, drag: 4, turb: 0, wind: 0,
    size: [0.34, 0.10], sizeExp: 1.2, spin: [0, 0], fadeIn: 0.02, fadeOut: 1.4,
    alpha: [1.6, 2.6], col0: PAL.goldSpec, col1: PAL.goldMid, stretch: 0.02,
  },

  /* ── dive attack (Cane Slam) ───────────────────────────────────────────── */
  dive_dust: {
    batch: 'dust', tile: [TILE.DUST, TILE.DUST2, TILE.DUST3], count: [16, 22], life: [0.7, 1.3],
    speed: [3.5, 7.5], spread: 'disc', cone: 0.22, gravity: 1.6, drag: 3.4, turb: 0.2, wind: 0.5,
    size: [0.22, 1.5], sizeExp: 0.42, spin: [-1.4, 1.4], fadeIn: 0.05, fadeOut: 1.5,
    alpha: [0.5, 0.72], col0: PAL.sandLight, col1: PAL.sandMid, jitter: 0.16,
  },
  dive_debris: {
    batch: 'dust', tile: [TILE.CHUNK, TILE.CHUNK, TILE.DUST3], count: [10, 14], life: [0.55, 0.95],
    speed: [4, 9], spread: 'cone', cone: 1.15, gravity: 16, drag: 1.2, turb: 0.0, wind: 0.1,
    size: [0.12, 0.10], sizeExp: 1.0, spin: [-9, 9], fadeIn: 0.02, fadeOut: 2.2,
    alpha: [0.85, 1.0], col0: PAL.limeMid, col1: PAL.sandDark, jitter: 0.12,
  },
  dive_ring: {
    batch: 'ring', tile: TILE.RING, count: [1, 1], life: [0.34, 0.34],
    speed: [0, 0], gravity: 0, drag: 0, turb: 0, wind: 0,
    size: [0.4, 5.0], sizeExp: 0.36, spin: [0, 0], fadeIn: 0.02, fadeOut: 1.3,
    alpha: [1.4, 1.4], col0: PAL.goldLight, col1: PAL.haze,
  },
  dive_spark: {
    batch: 'spark', tile: TILE.SPARK, count: [14, 18], life: [0.14, 0.26],
    speed: [7, 13], spread: 'disc', cone: 0.45, gravity: 14, drag: 11, turb: 0, wind: 0,
    size: [0.09, 0.02], sizeExp: 0.85, spin: [0, 0], fadeIn: 0.02, fadeOut: 1.2,
    alpha: [1.8, 2.8], col0: PAL.goldSpec, col1: PAL.emberCool, stretch: 0.07, jitter: 0.06,
  },

  /* ── pickups ───────────────────────────────────────────────────────────── */
  coin_sparkle: {
    batch: 'spark', tile: [TILE.STAR, TILE.EMBER], count: [1, 2], life: [0.5, 0.85],
    speed: [0.15, 0.5], spread: 'sphere', cone: 3.14, gravity: -0.5, drag: 2.2, turb: 0.05, wind: 0.1,
    size: [0.12, 0.02], sizeExp: 1.5, spin: [0, 0], fadeIn: 0.15, fadeOut: 1.4,
    alpha: [1.6, 2.4], col0: PAL.goldSpec, col1: PAL.goldMid, jitter: 0.14,
  },
  coin_pop: {
    batch: 'spark', tile: [TILE.STAR, TILE.SPARK], count: [10, 14], life: [0.28, 0.5],
    speed: [2.2, 5.0], spread: 'sphere', cone: 3.14, gravity: 5, drag: 6.5, turb: 0.05, wind: 0.1,
    size: [0.14, 0.02], sizeExp: 1.1, spin: [0, 0], fadeIn: 0.03, fadeOut: 1.3,
    alpha: [2.0, 3.0], col0: PAL.goldSpec, col1: PAL.goldLight, stretch: 0.03, jitter: 0.05,
  },

  /* ── guards ────────────────────────────────────────────────────────────── */
  guard_alert: {
    batch: 'dust', tile: [TILE.SMOKE, TILE.DUST2], count: [5, 7], life: [0.5, 0.8],
    speed: [0.5, 1.4], spread: 'cone', cone: 0.9, gravity: -1.4, drag: 3.0, turb: 0.16, wind: 0.3,
    size: [0.10, 0.5], sizeExp: 0.5, spin: [-2, 2], fadeIn: 0.08, fadeOut: 1.6,
    alpha: [0.4, 0.6], col0: PAL.limeLight, col1: PAL.skyFill, jitter: 0.1,
  },

  /* ── braziers, torches, tomb air ───────────────────────────────────────── */
  ember: {
    batch: 'spark', tile: [TILE.EMBER, TILE.SPARK], count: [1, 2], life: [1.1, 2.2],
    speed: [0.5, 1.3], spread: 'cone', cone: 0.55, gravity: -1.1, drag: 1.1, turb: 0.30, wind: 0.35,
    size: [0.075, 0.012], sizeExp: 1.35, spin: [0, 0], fadeIn: 0.10, fadeOut: 1.5,
    alpha: [1.8, 2.8], col0: PAL.emberHot, col1: PAL.emberCool, stretch: 0.03, jitter: 0.08,
  },
  /**
   * `embers`, plural, is the name PROPS asks a brazier for (`Props.js:317`), and it was the
   * one name in this catalogue that did not exist — eight warnings a boot and no fire in any
   * brazier. It resolves two ways: as a *fire composite* through `Particles._handle`, which
   * is what a brazier wants (flame core + sparks + smoke), and as this plain burst, so a
   * one-shot `burst('embers', p)` still means something. Coarser and longer-lived than
   * `ember` because a brazier's bed throws bigger, lazier sparks than a wall torch's cup.
   */
  embers: {
    batch: 'spark', tile: [TILE.EMBER, TILE.EMBER, TILE.SPARK], count: [2, 3], life: [1.4, 2.8],
    speed: [0.6, 1.6], spread: 'cone', cone: 0.62, gravity: -1.3, drag: 1.0, turb: 0.34, wind: 0.4,
    size: [0.095, 0.014], sizeExp: 1.3, spin: [0, 0], fadeIn: 0.08, fadeOut: 1.45,
    alpha: [2.0, 3.1], col0: PAL.emberHot, col1: PAL.emberCool, stretch: 0.035, jitter: 0.13,
  },
  fire_core: {
    batch: 'spark', tile: TILE.GLOW, count: [1, 1], life: [0.28, 0.42],
    speed: [0.15, 0.4], spread: 'cone', cone: 0.35, gravity: -0.8, drag: 2.0, turb: 0.05, wind: 0.1,
    size: [0.42, 0.16], sizeExp: 1.2, spin: [0, 0], fadeIn: 0.18, fadeOut: 1.4,
    alpha: [1.5, 2.2], col0: PAL.emberHot, col1: PAL.emberCool, jitter: 0.05,
  },
  /* The flame *body* above the core: taller, dimmer, lazier. Two overlapping scales are what
     stop a fire reading as a single pulsing dot at ten metres. */
  fire_body: {
    batch: 'spark', tile: [TILE.GLOW, TILE.SMOKE], count: [1, 1], life: [0.45, 0.75],
    speed: [0.3, 0.7], spread: 'cone', cone: 0.28, gravity: -1.5, drag: 1.6, turb: 0.10, wind: 0.15,
    size: [0.30, 0.55], sizeExp: 0.7, spin: [-0.6, 0.6], fadeIn: 0.22, fadeOut: 2.0,
    alpha: [0.55, 0.95], col0: PAL.emberHot, col1: PAL.emberCool, jitter: 0.07,
  },
  torch_smoke: {
    batch: 'smoke', tile: [TILE.SMOKE, TILE.DUST2], count: [1, 1], life: [1.8, 3.0],
    speed: [0.3, 0.75], spread: 'cone', cone: 0.32, gravity: -0.55, drag: 0.9, turb: 0.22, wind: 0.6,
    size: [0.16, 1.1], sizeExp: 0.6, spin: [-0.7, 0.7], fadeIn: 0.14, fadeOut: 1.7,
    alpha: [0.16, 0.28], col0: PAL.smokeLit, col1: PAL.smoke, jitter: 0.06,
  },

  /* ── wind: sand ripping off a dune crest ───────────────────────────────── */
  crest_stream: {
    batch: 'dust', tile: [TILE.GRAIN, TILE.GRAIN, TILE.DUST3], count: [3, 6], life: [1.3, 2.4],
    speed: [1.2, 3.2], spread: 'cone', cone: 0.30, gravity: 0.45, drag: 0.55, turb: 0.35, wind: 1.6,
    size: [0.22, 1.5], sizeExp: 0.55, spin: [-0.5, 0.5], fadeIn: 0.16, fadeOut: 1.5,
    alpha: [0.30, 0.5], col0: PAL.sandLight, col1: PAL.haze, jitter: 1.2,
  },
};

/* =========================================================================
   3. Ambient field definitions (GPU-resident, never respawned on the CPU)
   ========================================================================= */
export const AMBIENT = {
  /* Low sheets of sand ripping along the ground. Wrapped in a box that follows the
     camera, so it exists everywhere without ever being simulated. */
  sand_drift: {
    batch: 'sandLow', capacity: 460, tile: [TILE.GRAIN, TILE.GRAIN, TILE.DUST3],
    box: [80, 2.2, 80], yOffset: 0.15, life: [2.6, 5.0],
    size: [0.35, 1.5], sizeExp: 0.7, spin: [-0.35, 0.35], fadeIn: 0.22, fadeOut: 1.3,
    alpha: [0.14, 0.30], col0: PAL.sandLight, col1: PAL.haze,
    wind: [0.9, 1.5], drift: [0.15, 0.5], turb: 0.06,
    fade: [70, 42, 1.6, 5.0],       // farOut, farIn, nearOut, nearIn
  },
  /* Suspended grains hanging in the air column: the airborne particulate that a wide
     shot needs. Sparse, big, slow, and lit by the key light. */
  sand_haze: {
    batch: 'sandHigh', capacity: 420, tile: [TILE.GRAIN, TILE.MOTE, TILE.DUST3],
    box: [90, 26, 90], yOffset: 11, life: [4.0, 9.0],
    size: [0.20, 0.85], sizeExp: 0.8, spin: [-0.2, 0.2], fadeIn: 0.25, fadeOut: 1.2,
    alpha: [0.10, 0.26], col0: PAL.haze, col1: PAL.sandLight,
    wind: [0.5, 1.0], drift: [0.1, 0.35], turb: 0.09,
    fade: [80, 46, 2.2, 7.0],
  },
  /**
   * Airborne motes — the particulate §7.3 asks for, and the one that actually *reads*.
   *
   * `sand_drift` and `sand_haze` are sand-coloured alpha sprites over sand-coloured
   * geometry, so however many of them there are they measure within a few luma of whatever
   * is behind them and the frame comes out with "no airborne particulate" for the second
   * review running. These are the opposite bet: sparse, **additive**, tinted by the key
   * light, and big enough to survive a 960 px frame (0.16 m at 30 m is ~4 px, where the
   * 0.05 m shaft motes were sub-pixel). They are what backlit dust actually looks like at
   * golden hour — specks brighter than the air, not a veil the colour of the ground.
   */
  air_motes: {
    batch: 'airMotes', capacity: 300, tile: [TILE.MOTE, TILE.MOTE, TILE.GRAIN],
    box: [46, 17, 46], yOffset: 3.0, life: [5.0, 11.0],
    size: [0.10, 0.20], sizeExp: 0.9, spin: [-0.2, 0.2], fadeIn: 0.22, fadeOut: 1.15,
    alpha: [0.30, 0.85], col0: PAL.keySun, col1: PAL.haze,
    wind: [0.28, 0.62], drift: [0.08, 0.26], turb: 0.10,
    fade: [44, 26, 1.8, 6.0],
  },
  /* Heat shimmer over hot sand. Not a distortion — POSTFX owns the screen — but a low,
     wide, warm additive band that boils. Reads as air moving above the paving. */
  shimmer: {
    batch: 'shimmer', capacity: 90, tile: TILE.SHIMMER,
    box: [60, 1.4, 60], yOffset: 0.55, life: [1.6, 2.8],
    size: [1.1, 2.6], sizeExp: 0.8, spin: [0, 0], fadeIn: 0.3, fadeOut: 1.4,
    alpha: [0.10, 0.20], col0: PAL.bounce, col1: PAL.haze,
    wind: [0.25, 0.5], drift: [0.05, 0.2], turb: 0.35,
    fade: [46, 26, 3.0, 9.0],
  },
};

/* Light-shaft motes are placed against LIGHTING's published shaft geometry rather than in
   a box, so they carry their own definition.

   Sizes were [0.045, 0.075] m. A shaft crosses the `temple` frame at 20–35 m, where the
   canonical 55° / 540 px camera resolves 1.7 mrad per pixel — so a 0.06 m mote was **1.0 px
   at best and usually less**, i.e. it existed in the buffer and was invisible in the image.
   That is the whole of "no airborne particulate" as far as this batch is concerned: not
   absent, sub-pixel. 0.10–0.26 m puts a mote at 3–6 px in the hall, which is a speck you
   can see turning, and still a speck rather than a snowflake. */
export const MOTES = {
  capacity: 900,
  tile: [TILE.MOTE, TILE.MOTE, TILE.STAR],
  life: [3.0, 6.5],
  size: [0.10, 0.26], sizeExp: 1.0, fadeIn: 0.2, fadeOut: 1.1,
  alpha: [0.55, 1.5],
  drift: 0.16,          // m/s of lazy convection inside the blade
  col0: PAL.keySun, col1: PAL.haze,
};

export const TORCH_MOTES = {
  life: [2.2, 4.5], size: [0.07, 0.16], alpha: [0.5, 1.2], radius: 1.7, drift: 0.14,
  col0: PAL.emberHot, col1: PAL.rimWarm,
};

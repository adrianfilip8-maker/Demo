/**
 * Materials — the named recipe catalogue.
 *
 * Every entry paints a `Surface` (height + albedo + roughness + metalness + occlusion) and
 * declares its physical footprint. NormalMap.js turns the height into normal/AO/roughness, so a
 * recipe's job is: get the *height* right first, then let colour follow the height.
 *
 * Fields on a definition
 * ----------------------
 *   tier      0 = detail-critical (full texSize) · 1 = standard (half) · 2 = sprite/small
 *   tile      metres covered by one repeat. Number, or [u,v] for anisotropic surfaces.
 *   bump      peak-to-peak relief in metres. Drives normal strength and AO reach, so a 4 mm
 *             chisel line and a 40 cm block step stay in correct proportion to each other.
 *   build     (surface, ctx) => void
 *   clamp     ClampToEdge instead of Repeat (decals and sprites)
 *   alpha     albedo carries meaningful alpha
 *   emissive  build an emissive map
 *   group     catalogue grouping, for the swatch sheet
 */

import * as C from './Canvas2D.js';
import * as HG from './Hieroglyphs.js';

const {
  PAL, sat, lerp, clamp, smoothstep, tri, mixHex, hexRGB, css, freqVec,
  masonry, weather, chiselMarks, pitting, speckle, brushwork, paintRemnants, grain, flowStreaks,
  blurWrap, concavity, skyward, streakDown, rasterMask, rasterRGBA, rampFloor,
  nz, nzA, vz, fbmN, fbmA, ridgeN, warpN, worleyN, rng, warpedFbm2,
} = C;

/* ========================================================================= */
/*  shared recipe helpers                                                    */
/* ========================================================================= */

const T3 = [0, 0, 0];
const MXT = [0, 0, 0];

/** Map t∈[0,1] through a three-stop colour ramp. Writes into a scratch triple. */
function ramp3(dark, mid, light, t, out = T3) {
  if (t < 0.5) return mixHex(dark, mid, t * 2, out);
  return mixHex(mid, light, (t - 0.5) * 2, out);
}

function rgb2hex(rgb) {
  return (Math.round(sat(rgb[0]) * 255) << 16) | (Math.round(sat(rgb[1]) * 255) << 8) | Math.round(sat(rgb[2]) * 255);
}

/** Blend two palette hexes and get a hex back — most helpers here take hexes, not triples. */
function MX(a, b, t) { return rgb2hex(mixHex(a, b, t, MXT)); }

/**
 * Blend `a` toward `b` and then put `a`'s luminance back — a hue shift with no value step.
 *
 * The catalogue keeps reaching for this and keeps open-coding it wrong. Two stones from one
 * quarry, two crystals in one granite, two courses on one wall: they differ in *hue* far more
 * than in value, and a plain `MX` toward a palette colour always drags the value with it. That
 * costs twice — the material loses the colour variation §2.1.7 asks for if the blend is kept
 * small, and it falls out of its value ramp (and, in the dark tail, out of the palette entirely)
 * if the blend is made large enough to see. Separating the two lets the hue move a long way
 * while the ramp stays exactly where the art direction put it.
 */
function tintAtValue(a, b, t) {
  const m = mixHex(a, b, t, MXT);
  const la = C.lumaHex(a);
  const lm = m[0] * 0.2126 + m[1] * 0.7152 + m[2] * 0.0722;
  const k = lm > 1e-4 ? la / lm : 1;
  return rgb2hex([m[0] * k, m[1] * k, m[2] * k]);
}

/**
 * Per-block colour variation — **amplitude**, now that the frequency is fixed elsewhere.
 *
 * The history here is worth keeping, because the first two attempts both treated the wrong
 * variable. The original recipes swung ±0.8 around the ramp midpoint keyed on `masonry.id2`,
 * a per-block *white noise*: neighbouring blocks differed as much as distant ones, so the wall
 * carried its entire tonal range at the highest spatial frequency it could, and AGENTS §7.3's
 * squint test failed — the big architectural shapes stopped reading through the static. The
 * first fix damped that global amplitude to 0.42, then to 0.26. It helped, but it is the wrong
 * knob: turning white noise down does not make it structured, it just makes a flatter wall that
 * is still, at close range, a chequerboard. The review called this exactly right — *"per-block
 * hue randomised at maximum spatial frequency; neighbouring blocks differ as much as distant
 * ones, so there is no larger structure"*.
 *
 * The frequency is now fixed at the source: `ashlar` samples a smooth low-frequency field at
 * each block's *centre* (`masonry.bcu/bcv`) instead of hashing the block index, so blocks near
 * each other come out of the same bed of stone and the wall grows metre-scale tonal regions —
 * which is both what real ashlar does and what §2.3's "large simple areas of colour" asks for.
 * With the frequency correct the amplitude can go back *up*: variation the eye can group into
 * shapes is depth, variation it cannot is noise.
 */
const VARIATION = 0.62;

/**
 * Damping on the *albedo* half of the joint — the mortar's painted tonal contrast against the
 * block face. The joint's **height** is not damped by this and should not be.
 *
 * Two separate constraints meet here and they pull opposite ways.
 *
 * ARCHITECTURE already builds the masonry as geometry (0.66 m courses, 6 cm recessed joints), so
 * a strong painted joint lays a *second*, unaligned rectangular grid over the first. Two
 * rectangle fields at similar frequency beat against each other, and that beat is the
 * "high-frequency rectangular noise" of AGENTS §7.3's squint test — the review's *"perfect
 * running bond of identical blocks with a heavy dark line between each; it reads as LEGO"*.
 *
 * But the joint also has to be **darker than the faces either side of it**, always: light
 * collects on proud surfaces and dirt collects in the gaps. Getting that sign wrong is what
 * produced the courtyard floor's bright grout.
 *
 * The resolution is that those are answers to different questions. The joint is dark *because it
 * is a recess*, so the darkness belongs in the height field, where `heightAO` turns it into a
 * contact line that tightens near the joint and fades away from it, and where the normal map
 * gives it a lit and a shaded wall. Painting it dark in the albedo instead gives a flat band of
 * constant tone that reads as a drawn line at every distance and in every lighting condition.
 * So: deep grooves, real AO, and only a light touch of mortar colour on top.
 */
const JOINT = 0.24;

/**
 * Ashlar masonry base — height and per-block colour. Everything about the way cut stone reads
 * lives here: blocks sit proud or recessed by a few millimetres, faces are very slightly convex,
 * the chamfer at every edge catches the sun, and colour is keyed to the *block index* so
 * neighbours differ the way quarried stone does.
 */
function ashlar(s, o = {}) {
  const {
    courses = 5, aspect = 2.3, jointW = 0.008, chamfer = 0.015,
    dark = PAL.sandDark, mid = PAL.sandMid, light = PAL.sandLight,
    mortar = 0x9a8a70, relief = 0.11, groove = 0.30, dome = 0.035,
    grainFreq = 12, spread = 0.80, seed = 1, bondJitter = 0.09, widthJitter = 0.30,
    rough = 0.86, joint = JOINT, tone = 0, bedFreq = 2, hueMix = 0.40, wash = 0.26,
    cloudFreq = 14, cloudAmt = 0.78,
  } = o;
  const m = masonry(s.size, { courses, aspect, jointW, chamfer, seed, bondJitter, widthJitter });
  const face = s.field(2, (u, v) => warpN(u, v, grainFreq, 5, 0.95, seed + 3) * 0.5 + 0.5);
  const macro = s.field(6, (u, v) => warpN(u, v, 3, 4, 1.15, seed + 91) * 0.5 + 0.5);
  const mort = s.field(3, (u, v) => fbmN(u, v, 18, 4, 0.55, seed + 41) * 0.5 + 0.5);
  /* Cloud: one octave *between* `macro` (whole-wall) and `face` (stone grain), so a single
   * dressed face is not internally uniform. The review's "flat orange field with sparse dark
   * dots that read as flyspecks" is exactly this gap — with nothing at 20–40 cm, the only thing
   * varying inside a block was per-texel speckle, and isolated dark speckle on a flat ground is
   * what reads as flyspecks rather than as stone. */
  /* `cloudFreq` is quoted in cycles per tile and defaults to ~14, which on the stone tiles works
   * out at 40–50 cm of world. That number is chosen against the *geometry*, not against the
   * texture: ARCHITECTURE lays real blocks on a 0.58–0.66 m course, so one dressed block face is
   * roughly 0.6 m of a 6.8 m repeat — under a tenth of the tile. Every term coarser than that
   * (the quarry bed, the per-block trim, the macro field) is therefore *constant across a whole
   * block face*, and the face is left with nothing but per-texel speckle on it. That is the
   * mechanism behind "a flat orange field with sparse dark dots that read as flyspecks": the
   * material had plenty of variation, all of it at frequencies the built geometry cuts into
   * single-value patches. At 45 cm a block face carries between one and two cycles — enough that
   * it reads as a piece of stone, still four times coarser than the chisel marks, and far above
   * anything the mip chain will turn into sparkle. */
  const cloud = s.field(3, (u, v) => warpN(u, v, Math.max(4, cloudFreq | 0), 4, 1.05, seed + 137) * 0.5 + 0.5);

  /* The quarry bed: a smooth field, *sampled per block at the block's centre*. Blocks cut from
   * the same part of the bed share a tone, so the wall reads as courses of related stone rather
   * than as a chequerboard, and the variation survives being squinted at because it forms
   * shapes bigger than a block. `bedFreq` cycles per tile — keep it well under the block grid.
   *
   * `bedH` is a second, independently-warped read of the same construction driving *hue* rather
   * than value. Two stones from one quarry at the same value are still not the same colour —
   * one course runs ochre, the next runs toward the pale grey of the limestone bed above it —
   * and hue variation is the half of §2.1.7's "colour variation between blocks" that a value
   * ramp alone cannot supply. It is also the half that survives being squinted at best: the eye
   * groups by hue before it groups by value. */
  const bed = new Float32Array(s.n);
  const bedH = new Float32Array(s.n);
  {
    const cache = new Map();
    for (let i = 0; i < s.n; i++) {
      // Quantise the centre so every texel of one block hits the same cache entry exactly.
      const cu = Math.round(m.bcu[i] * 4096), cv = Math.round(m.bcv[i] * 4096);
      const key = cu * 8192 + cv;
      let v = cache.get(key);
      if (v === undefined) {
        v = [
          warpN(cu / 4096, cv / 4096, bedFreq, 4, 1.25, seed + 613) * 0.5 + 0.5,
          warpN(cu / 4096, cv / 4096, Math.max(1, bedFreq + 1), 3, 1.05, seed + 2477) * 0.5 + 0.5,
        ];
        cache.set(key, v);
      }
      bed[i] = v[0]; bedH[i] = v[1];
    }
  }
  const hueA = MX(mid, PAL.ochre, 0.45);        // iron-rich, ochre-leaning stone
  const hueB = MX(mid, PAL.limeMid, 0.50);      // pale, chalkier stone

  for (let i = 0; i < s.n; i++) {
    const e = m.edge[i], j = m.joint[i];
    const bu = m.bu[i] * 2 - 1, bv = m.bv[i] * 2 - 1;
    const conv = (1 - bu * bu * 0.55) * (1 - bv * bv * 0.55);
    let h = 0.60
      + (m.id[i] - 0.5) * relief                       // whole block proud / recessed
      + conv * dome                                    // slightly convex dressed face
      + (face[i] - 0.5) * 0.055                        // stone grain
      - (1 - e) * groove * 0.55                        // chamfer ramp
      - j * groove;                                    // mortar groove
    s.h[i] = h;

    /* Colour: quarry bed first, individual block second.
     *
     * `bed` is the *correlated* term and carries most of the amplitude — it is a smooth field
     * read once per block, so a run of neighbouring blocks shares a tone and the wall grows
     * tonal regions several metres across. `id2` is the leftover per-block white noise and is
     * now a small trim on top of the bed, not the main event: a course of stone from one bed is
     * not uniform, but nor does it jump from `dark` to `light` between two adjacent stones.
     * `macro` runs at ~3 cycles per tile, below the block grid, and breaks the repeat.
     *
     * `tone` holds the recipe's *mean albedo* where the art direction wants it independently of
     * the variation terms, so retuning frequency never quietly relights the level. */
    /* Value. The bed is the correlated term and still carries the most amplitude, but the
     * per-block trim was damped so far (0.22) that two adjacent stones differed by about 0.02
     * luma — below the threshold at which anyone can see that they are two stones. Killing the
     * chequerboard and killing the masonry are different jobs and the first pass did both. At
     * 0.50 a neighbour differs by ~0.05 luma: visible as "another block", still a quarter of the
     * swing that failed as noise, and still half the bed's amplitude, so the metre-scale beds go
     * on owning the squint test. */
    const t = sat(0.44 + tone
      + (bed[i] - 0.5) * spread * VARIATION
      + (m.id2[i] - 0.5) * spread * VARIATION * 0.50
      + (macro[i] - 0.5) * 0.55 * VARIATION
      + (cloud[i] - 0.5) * cloudAmt * VARIATION
      + (face[i] - 0.5) * 0.22 * VARIATION);
    const col = ramp3(dark, mid, light, t);
    s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
    /* Hue drift, per block, on top of the value ramp. Signed around 0.5 so the mean albedo is
     * untouched — this adds colour variation without relighting the level. */
    const hd = (bedH[i] - 0.5) + (macro[i] - 0.5) * 0.45 + (m.id[i] - 0.5) * 0.30;
    if (hd > 0) s.mixHex(i, hueA, sat(hd * 2.4) * hueMix);
    else s.mixHex(i, hueB, sat(-hd * 2.4) * hueMix);
    /* The joint. It is *mortar in a recess*: darker than the dressed faces either side of it,
     * always, in every material. Light collects on proud surfaces and dirt collects in the
     * gaps between them — get that sign wrong and the wall inverts into a grid of bright lines,
     * which is what the review found on the courtyard paving ("crevices are brighter than the
     * tile faces… reads as cracked ice"). `mortar` hexes are asserted darker than their ramp's
     * `mid` at the recipe level; this is the pass that applies them. */
    if (j > 0.01) {
      s.mixHex(i, mortar, j * (0.55 + mort[i] * 0.4) * joint);
      s.rough[i] = rough + j * 0.10;
    } else s.rough[i] = rough;
  }

  /* Wash: the stain that runs down a block's own face from the bed joint above it.
   *
   * This is the "grime obeys gravity and geometry" rule applied at *block* scale rather than at
   * chisel scale, and it is the layer that was missing. `weather()`'s streaks start from the
   * height field, so they only run a few centimetres out of the groove; the thing you actually
   * see on a temple wall is a stain half a metre long hanging under one joint and not under the
   * next.
   *
   * Two guards keep it from becoming the per-block UV gradient the review objected to in the
   * baked AO. It is gated per block on the quarry-bed randoms, so roughly a third of blocks
   * carry it and the rest are clean; and it is cut horizontally by a mid-frequency field, so
   * each stain is a run of finite width rather than a band across the whole face. A wall of
   * identical gradients is a pattern; a scatter of stains is weathering. */
  if (wash > 0) {
    const runF = s.field(3, (u, v) => sat(warpN(u, v, 14, 4, 1.2, seed + 331) * 1.45 + 0.5));
    const washHex = MX(dark, PAL.sandCrev, 0.45);
    for (let i = 0; i < s.n; i++) {
      // Per block: only stones the bed nominates, and only over the upper part of the face.
      const gate = sat((bedH[i] * 0.55 + m.id[i] * 0.45 - 0.42) * 2.2);
      if (gate <= 0.01) continue;
      const down = smoothstep(0.18, 0.92, m.bv[i]);          // strongest just under the joint
      const run = sat(runF[i] * runF[i] * 1.6 - 0.18);
      const a = gate * down * run * wash;
      if (a > 0.004) {
        s.stainHex(i, washHex, a);
        s.rough[i] = sat(s.rough[i] + a * 0.20);
      }
    }
  }
  /* Handle for later passes in the same recipe (several already juggle `m` by hand) and for the
   * joint-sign check in the texture QA report. */
  s.masonry = m;
  return m;
}

/**
 * Sunk relief carving. `cut` is the silhouette mask, `line` the incised interior detail.
 *
 * The profile matters more than anything else in this file: a narrow bevel (2–3 texels) gives the
 * hard shadow edge a chisel leaves, the interior is *modelled* convex so it does not read as a
 * flat stamp, and the stone displaced by the cut piles into a faint lip just outside it.
 */
function carve(s, cut, line, o = {}) {
  const { depth = 0.34, bevelPx = 3.0, lip = 0.10, bulge = 0.40, lineDepth = 0.55, chatter = 0.03, seed = 5 } = o;
  const size = s.size;
  /* Bevel width scales with resolution so a tier-1 half-size map keeps the same *physical*
   * chisel edge. It also has a hard floor of 2 texels: at 1 texel the cut wall is a single-texel
   * cliff, which the normal pass' slope knee flattens back out and the mip chain then averages
   * away entirely — the carving loses its relief at exactly the distance the player sees it. */
  const rb = Math.max(2, Math.round((bevelPx * size) / 1024));
  const cb = blurWrap(cut, size, rb, 2);
  const cw = blurWrap(cut, size, rb * 4, 2);
  const chat = chatter > 0
    ? s.field(1.5, (u, v) => fbmN(u, v, 90, 3, 0.5, seed + 77) * 0.5 + 0.5)
    : null;
  // One texel of softening on the incised lines: a hard 1-texel step aliases into fireflies
  // under a normal map, a 2-texel V does not.
  const ln = line ? blurWrap(line, size, Math.max(1, Math.round(rb * 0.5)), 1) : null;
  const ramp = new Float32Array(s.n);
  for (let i = 0; i < s.n; i++) {
    const r = smoothstep(0.10, 0.92, cb[i]);
    const bul = sat((cw[i] - 0.45) / 0.55);
    // Stone pushed up around the cut — the burr a chisel raises.
    const outer = sat((cw[i] - cb[i]) * 2.6) * (1 - r);
    let d = depth * r * (1 - bulge * bul);
    if (chat) d *= 0.9 + chat[i] * 0.2;                 // tool chatter along the cut wall
    s.h[i] += outer * lip * depth - d;
    if (ln) s.h[i] -= sat(ln[i] * 1.5) * depth * lineDepth;
    ramp[i] = r;
  }
  return ramp;
}

/**
 * Freshly cut stone is paler and cooler than the sun-baked face it was cut into.
 *
 * `wallDark` used to darken every down-facing texel via `skyward()` — a fixed top-left light
 * painted into the albedo. That is precisely the defect §7.3 lists as "carvings look painted-on
 * rather than chiselled", and the review named it: *"flat decals with a baked-in fake bevel
 * (light top-left, dark bottom-right) that does not correspond to the sun direction and does not
 * change across faces"*. A carving whose highlight is in the albedo looks identical on the sunlit
 * and the shaded side of the same pylon, which is the tell.
 *
 * It is now off by default. The *pale* term stays — that is pigment, not lighting: newly exposed
 * stone really is a different colour from a face that has sat in the sun for three thousand
 * years, and it does not move with the sun. All the directional contrast has moved into the
 * height field (deeper cuts, a narrower bevel), where the normal map and `heightAO` turn it into
 * relief that actually responds to the key light.
 */
function freshCutTint(s, ramp, o = {}) {
  const { pale = PAL.limeLight, amount = 0.16, wallDark = 0, grime = 0.24, grimeHex = PAL.sandCrev } = o;
  const sky = wallDark > 0 ? skyward(s.h, s.size, Math.max(1, Math.round(s.size / 320))) : null;
  for (let i = 0; i < s.n; i++) {
    const r = ramp[i];
    if (r > 0.02) {
      /* The pale belongs on the *wall* of the cut, not on its floor. It was applied ∝ depth,
       * which put the freshest-looking stone at the bottom of the recess — backwards, and it
       * fought the crevice grime `weather()` was laying into the same texels, so a sunk relief
       * ended up with barely any albedo separation from the face around it at all (measured:
       * −0.10 luma on `hieroglyph_wall`, on a carving 20 mm deep). `4r(1-r)` peaks across the
       * bevel, which is the surface a chisel actually exposes. */
      s.mixHex(i, pale, 4 * r * (1 - r) * amount);
      /* And the floor of the cut gets what a three-thousand-year-old recess gets: dirt. This is
       * the term that makes a carving legible at twenty metres and it is the one that was
       * missing. It is *not* the painted bevel the review failed — it is symmetric about the
       * cut, a function of depth alone, so it says nothing about where the sun is and looks the
       * same on the lit and the shaded side of the same pylon. What it does is give the relief a
       * mip-surviving value difference to fall back on once the normal map's bevel is finer than
       * a texel, which is exactly where "carvings barely read" was coming from. */
      if (grime > 0) s.stainHex(i, grimeHex, r * r * grime);
    }
    if (sky) s.mul(i, 1 - sat(-sky[i]) * wallDark);
  }
}

/** Straw / fibre inclusions, drawn as real short strokes — noise cannot fake a fibre. */
function fibreMask(size, count, len, wid, seed, angleSpread = Math.PI) {
  const rnd = rng(seed >>> 0);
  return rasterMask(size, (ctx) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = rnd() * size, y = rnd() * size;
      const a = rnd.jitter(angleSpread) + (rnd() < 0.5 ? 0 : Math.PI);
      const l = len * size * (0.4 + rnd() * 1.2);
      ctx.lineWidth = wid * size * (0.6 + rnd() * 0.8);
      ctx.globalAlpha = 0.45 + rnd() * 0.55;
      ctx.beginPath();
      // Draw three times, offset by the tile, so strokes crossing the seam continue.
      for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]]) {
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      }
      ctx.stroke();
    }
  });
}

/** Twill / plain weave height + shading. `twill` shifts the interlace to a diagonal rib. */
function weave(s, o = {}) {
  const { freq = 90, twill = 0, depth = 1, slub = 0.35, seed = 7, fuzz = 0.02 } = o;
  // Interlace period: 2 for plain weave, 4 for a 2/2 twill. The thread count has to be a
  // multiple of it or the diagonal rib does not line up across the tile seam.
  const tp = twill ? 4 : 2;
  const f = Math.max(tp, Math.round(freq / tp) * tp);
  const size = s.size;
  const slubF = s.field(2, (u, v) => fbmN(u, v, 20, 3, 0.5, seed + 5) * 0.5 + 0.5);
  const h = new Float32Array(s.n);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size, row = y * size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, i = row + x;
      const cx = u * f, cy = v * f;
      const ix = Math.floor(cx), iy = Math.floor(cy);
      const over = twill ? (((ix + iy) % tp) + tp) % tp < tp / 2 : (((ix + iy) % 2) + 2) % 2 === 0;
      // Round thread profile: the cross-section of the thread that is on top.
      const px = cx - ix - 0.5, py = cy - iy - 0.5;
      const along = over ? px : py;
      const across = over ? py : px;
      const prof = Math.sqrt(sat(1 - 4 * across * across));
      const th = (over ? 0.62 : 0.30) + prof * 0.38 - Math.abs(along) * 0.10;
      const sl = 0.85 + slubF[i] * slub;
      h[i] = th * sl;
      s.rough[i] = sat(0.74 + (1 - prof) * 0.14 - (over ? 0.03 : 0));
      s.occ[i] *= 0.80 + prof * 0.20;
    }
  }
  const sm = fuzz > 0 ? blurWrap(h, size, Math.max(1, Math.round(size / 380)), 1) : h;
  for (let i = 0; i < s.n; i++) s.h[i] += lerp(h[i], sm[i], 0.45) * depth * 0.5;
  return h;
}

/** Fur: a flow field, strands drawn along it, clumped into tufts. */
function fur(s, o = {}) {
  const {
    flow = -Math.PI / 2, flowVar = 0.55, strandFreq = 240, along = 0.18,
    clumpFreq = 16, base = PAL.shadow, tip = PAL.limeLight, root = 0x121a2c,
    depth = 1, rough = 0.62, seed = 13, tipAmount = 0.55,
  } = o;
  const size = s.size;
  const ang = s.field(4, (u, v) => flow + fbmN(u, v, 5, 3, 0.5, seed + 21) * flowVar);
  const cw = {};
  const clump = s.field(2, (u, v) => {
    const w = worleyN(u, v, clumpFreq, seed + 3, 0.9, cw);
    return sat(w.f1 / 0.55);
  });
  // Two smear lengths: a long one for the guard hairs, a short one for the dense undercoat.
  const long = flowStreaks(s, ang, { freq: strandFreq, taps: 8, len: along * 0.85, seed, curl: 0.45 });
  const short = flowStreaks(s, ang, { freq: Math.round(strandFreq * 1.7), taps: 4, len: along * 0.3, seed: seed + 401, curl: 0.6 });
  const strand = new Float32Array(s.n);
  for (let i = 0; i < s.n; i++) strand[i] = sat(long[i] * 0.78 + short[i] * 0.42 - 0.10);
  const t3 = [0, 0, 0];
  for (let i = 0; i < s.n; i++) {
    const st = strand[i];
    const cl = clump[i];
    // Tips catch light, roots stay in the undercoat dark: that gradient is the whole read.
    const litT = sat(st * 1.25 - 0.18) * (0.45 + cl * 0.75);
    mixHex(root, base, sat(cl * 1.1 + st * 0.25), t3);
    s.r[i] = t3[0]; s.g[i] = t3[1]; s.b[i] = t3[2];
    s.mixHex(i, tip, litT * tipAmount);
    s.h[i] = 0.45 + st * 0.42 * depth + cl * 0.16 * depth;
    s.rough[i] = sat(rough + (1 - st) * 0.18 - litT * 0.10);
    s.occ[i] *= 0.62 + 0.38 * sat(st * 0.7 + cl * 0.5);
  }
  return { strand, clump };
}

/** Cloisonné inlay: raised gold cell walls with a semi-precious stone set in each cell. */
function cloisonne(s, o = {}) {
  const { rows = 6, seed = 5, wall = 0.055 } = o;
  const size = s.size;
  const wallMask = rasterMask(size, (ctx) => {
    const w = size * wall;
    ctx.lineWidth = w; ctx.lineJoin = 'miter';
    const rh = size / rows;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(-4, r * rh); ctx.lineTo(size + 4, r * rh); ctx.stroke();
    }
    // Alternate straight cells and chevron cells, the way a pectoral is divided.
    for (let r = 0; r < rows; r++) {
      const cells = r % 2 ? 8 : 6;
      const cw = size / cells;
      const off = r % 2 ? cw * 0.5 : 0;
      for (let k = -1; k <= cells + 1; k++) {
        const x = k * cw + off;
        ctx.beginPath();
        if (r % 3 === 1) {
          ctx.moveTo(x, r * rh);
          ctx.lineTo(x + cw * 0.32, r * rh + rh * 0.5);
          ctx.lineTo(x, (r + 1) * rh);
        } else {
          ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh);
        }
        ctx.stroke();
      }
    }
  });
  const soft = blurWrap(wallMask, size, Math.max(1, Math.round(size / 340)), 2);
  return { wallMask, soft };
}

/* ========================================================================= */
/*  the catalogue                                                            */
/* ========================================================================= */

export const MATERIALS = {

  /* ===================== stone & masonry ================================ */

  /* `tile` here is the single most load-bearing number in the file. ARCHITECTURE lays 0.66 m
   * geometric courses; the texture used to lay 0.48 m courses on top of them (2.4 m ÷ 5), and two
   * rectangle grids a few centimetres apart in pitch beat into a shimmer. At 3.4 m ÷ 4 the
   * texture's courses are 0.85 m — comfortably coarser than the geometry rather than adjacent to
   * it — and one repeat now covers a 20 m wall six times instead of eight. */
  sandstone_block: {
    group: 'stone', tier: 0, tile: 3.4, bump: 0.030, rough: 0.86,
    build(s, cx) {
      // `mortar` darker than `sandMid` — the joint is a recess and must read as one.
      const m = ashlar(s, { seed: cx.seed, courses: 4, aspect: 2.15, dome: 0.030, relief: 0.06, groove: 0.22, tone: -0.075, mortar: 0x7d6a50, bedFreq: 2 });
      chiselMarks(s, { amount: 0.022, angle: -0.38, freq: 40, seed: cx.seed + 1, mask: m.edge });
      pitting(s, { amount: 0.035, freq: 64, density: 0.34, seed: cx.seed + 2, colorDark: PAL.sandDark, stain: 0.10 });
      speckle(s, { freq: 110, seed: cx.seed + 4, colors: [[PAL.limeLight, 0.07, 0.06], [MX(PAL.sandDark, PAL.sandCrev, 0.4), 0.05, -0.16]], heightDelta: 0.006 });
      weather(s, { source: m.joint, seed: cx.seed + 6, creviceAmt: 0.44, streakAmt: 0.26, dustAmt: 0.18, directional: 0.7 });
      grain(s, { amount: 0.020, freq: 120, seed: cx.seed + 8, heightAmt: 0.006 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  sandstone_worn: {
    group: 'stone', tier: 1, tile: 3.6, bump: 0.050, rough: 0.92,
    build(s, cx) {
      const m = ashlar(s, {
        seed: cx.seed, courses: 3, aspect: 1.9, chamfer: 0.030, jointW: 0.012,
        relief: 0.085, dome: 0.02, groove: 0.24, spread: 0.9, tone: -0.035, mortar: 0x776448,
        dark: PAL.sandDark, mid: PAL.sandMid, light: PAL.sandLight, bedFreq: 2,
      });
      // Wind erosion: ridged noise scoops the face, worst on exposed corners.
      const ero = s.field(2, (u, v) => ridgeN(u, v, 7, 5, 0.55, cx.seed + 17));
      const bite = s.field(3, (u, v) => {
        const w = worleyN(u, v, 6, cx.seed + 23, 0.95);
        return sat(1 - w.f1 / 0.42) ** 2;
      });
      for (let i = 0; i < s.n; i++) {
        const corner = 1 - m.edge[i];
        s.h[i] -= ero[i] * 0.11 + bite[i] * 0.16 * (0.35 + corner * 0.9);
        s.mixHex(i, PAL.sandLight, ero[i] * 0.11);
        s.rough[i] = sat(s.rough[i] + ero[i] * 0.06);
      }
      pitting(s, { amount: 0.06, freq: 55, density: 0.48, seed: cx.seed + 5, colorDark: PAL.sandDark, stain: 0.08 });
      weather(s, { source: m.joint, seed: cx.seed + 6, creviceAmt: 0.50, streakAmt: 0.30, dustAmt: 0.24, streakDecay: 0.982, directional: 0.7 });
      grain(s, { amount: 0.026, freq: 120, seed: cx.seed + 9, heightAmt: 0.008 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  limestone_polished: {
    /* "Polished" is the quarry finish, not the state it is in three thousand years later, and at
     * `rough 0.44` this material behaved like one: a broad specular sheen swept across whatever
     * large flat surface it was on. That is expensive in the composition, because the biggest
     * surface it dresses is the `hero` foreground slab — the review's "the foreground bottom-left
     * slab is one of the *brightest* elements in frame, inverting the intended depth read… it
     * also carries dark blue-grey diagonal smears that read as spilled oil". A dark foreground
     * frame is §2.3's first depth rule, and a mirror finish cannot be one. 0.68 keeps limestone
     * distinctly smoother than sandstone (0.86–0.92) without letting it catch a sheet highlight. */
    group: 'stone', tier: 0, tile: 3.8, bump: 0.018, rough: 0.68,
    build(s, cx) {
      // Tura casing stone: enormous, tightly jointed, near-white, still faintly polished.
      const m = ashlar(s, {
        seed: cx.seed, courses: 4, aspect: 2.6, jointW: 0.0035, chamfer: 0.006,
        /* Tura casing stone was fitted so closely you cannot get a blade between two blocks, so
         * the joint here has to be a *hairline* — present, correctly signed (below the faces,
         * never above), and almost invisible. Correcting the inverted-grout bug catalogue-wide
         * overshot on this recipe in particular: a dark joint at full strength on near-white
         * limestone is the highest-contrast edge in the material, and a wall of them reads as a
         * drawn grid rather than as dressed stone — §7.3's "visible texture tiling repetition"
         * arriving through the other door. `joint` takes the painted contrast down to a third
         * and the shallow groove leaves just enough for `heightAO` to find. */
        dark: PAL.limeDark, mid: PAL.limeMid, light: PAL.limeLight, mortar: 0xa4957a,
        relief: 0.05, dome: 0.02, groove: 0.14, spread: 0.55, rough: 0.68, grainFreq: 16,
        bedFreq: 2, joint: 0.10,
      });
      // Sedimentary bedding — faint horizontal banding is what says "limestone" not "plaster".
      const bandF = s.field(2, (u, v) => {
        const w = fbmN(u, v, 6, 4, 0.5, cx.seed + 11) * 0.06;
        return Math.sin((v + w) * Math.PI * 2 * 9) * 0.5 + 0.5;
      });
      for (let i = 0; i < s.n; i++) {
        s.mixHex(i, PAL.limeDark, bandF[i] * 0.10);
        s.h[i] += (bandF[i] - 0.5) * 0.03;
        s.rough[i] = sat(s.rough[i] + (bandF[i] - 0.5) * 0.05);
      }
      // Conchoidal chips: shell-like flakes off the arrises.
      pitting(s, { amount: 0.08, freq: 22, density: 0.16, seed: cx.seed + 13, mask: m.joint, colorDark: PAL.limeDark });
      speckle(s, { freq: 120, seed: cx.seed + 15, colors: [[PAL.white, 0.10, 0.1], [PAL.limeDark, 0.05, 0.02]] });
      chiselMarks(s, { amount: 0.012, angle: 0.5, freq: 90, seed: cx.seed + 3, mask: m.edge });
      weather(s, {
        source: m.joint, seed: cx.seed + 6, crevice: 0x6a5f48, creviceAmt: 0.45,
        streakAmt: 0.26, streakTint: 0x7a6a4c, dustAmt: 0.14, roughGrime: 0.16, directional: 0.7,
      });
      grain(s, { amount: 0.016, freq: 130, seed: cx.seed + 8, heightAmt: 0.004 });
      rampFloor(s, { crevice: 0x54432c });
    },
  },

  granite_pink: {
    /* `bump` went 0.006 → 0.011 because there is now something for it to describe. At 6 mm
     * peak-to-peak the normal scale came out at 1.4 — the weakest in the catalogue by five times
     * — so the only relief the obelisk had was invisible, which is half of why its lit face read
     * as a printed plane. The added wind scour is a genuine centimetre-scale hollow. */
    group: 'stone', tier: 1, tile: 2.2, bump: 0.011, rough: 0.26,
    build(s, cx) {
      /* ── The second review's named offender. ───────────────────────────────────────────────
       *
       * *"In `courtyard.crop.png` its lit face is a large featureless salmon plane… There is no
       * chisel character, no grime in the joints, no colour variation between courses."*
       *
       * The previous pass fixed this material's real defect — crystals the size of a hand, in
       * six values, half of them dark enough to fall out of the palette and render violet — and
       * fixed it by making every crystal nearly the same colour as every other. What was left is
       * a 22 m monolith carrying one spatial frequency, 23 mm, and nothing else at all. Measured
       * off the CPU-side albedo before any of this ran: mip-4 luma RMS **0.0196** against
       * 0.062 for `sandstone_block`, and hue RMS at the same scale **0.0075**, i.e. three times
       * flatter than the wall behind it at every distance past arm's length. That number *is*
       * the featureless salmon plane.
       *
       * Everything added below is deliberately an order of magnitude coarser than the crystals —
       * 0.5 to 2 m — because that is the band the material had nothing in, and because detail in
       * that band is what survives the mip chain to the distance the obelisk is actually seen
       * from. None of it is per-crystal randomness; that is the knob that caused the original
       * problem and it stays where it is.
       *
       *   1. Schlieren. A pluton is not homogeneous: feldspar-rich and biotite-rich swathes wind
       *      through it at half-metre to metre scale. This drives the crystal *proportions*, not
       *      a tint over the top, so a pink region is pink because it has more feldspar in it.
       *   2. Wind scour. Three thousand years of blown sand cuts shallow hollows into the
       *      windward faces and leaves the sheltered ones with their polish. That is a height
       *      change and a roughness change, so it turns with the light instead of sitting on it.
       *   3. Desert varnish. Dark manganese-iron patination streaks *down* the faces from the
       *      pyramidion and from every horizontal arris. This is the gravity term, and it is the
       *      single most recognisable thing about a weathered granite monument.
       *   4. Dust film in the lee, pale bleach on the exposed faces.
       *
       * Repetition risk was checked rather than assumed. UVs are box-projected at 0.5 units per
       * metre and the repeat is 1/tile, so one tile spans 2 × 2.2 = 4.4 m of world: five repeats
       * up a 22 m shaft. Countable repetition needs a landmark to count, so all four layers here
       * are smooth fields with no isolated features, and the varnish is a *vertical* structure —
       * which is the one direction along which a five-fold vertical repeat cannot show a seam. */
      /* Aswan granite: feldspar/quartz/biotite, polished to a mirror on obelisks.
       *
       * This recipe dresses the obelisk, the colossi, the plinths and the rails — the tallest
       * and the largest shapes in `hero`, `courtyard` and `combat` — and it has been the worst
       * offender in the catalogue through two rounds of fixes, for the same reason each time:
       * it was drawing granite as *polygons* instead of as *speckle*.
       *
       * Two numbers were wrong and they compounded.
       *
       * **Cell size.** 17 Worley cells across a 2.2 m tile is a 13 cm crystal. Real Aswan
       * granite crystals are 5–15 mm. At 13 cm the cells are not a mineral texture at all, they
       * are a mosaic of hand-sized plates, and the review read them exactly that way: *"a mosaic
       * of irregular polygons in salmon, orange, deep violet and tan with a soft emboss… reads
       * as camouflage netting or crazy paving stood on end"*. 96 cells over 2.2 m is 23 mm,
       * which is granite, and which is small enough that two mip levels down it resolves into
       * the single warm grey-pink a monolith is supposed to be.
       *
       * **Value spread.** Three crystal hexes spanning near-white to near-black meant every
       * cell boundary was also a value edge, and the dark cells fell far enough down that the
       * cel shader's additive shadow wash (`uShadowColor`, the violet-teal `#2a3f66`) had more
       * weight in them than their own albedo — which is where the off-palette `#5a4a7a` violet
       * came from. Granite's crystals differ mostly in *hue* and only a little in value; that
       * is what `UNIFY` encodes, and it is now tight enough that no crystal can fall out of the
       * palette. The `rampFloor` at the end is the backstop.
       *
       * The height field keeps its per-crystal relief, so up close the surface is still crystalline
       * under a raking light — but at 23 mm that relief is carried by the normal map at a
       * frequency the eye reads as *material*, not as facets. */
      /* The three minerals now separate in *hue at constant value* rather than in value.
       *
       * The previous fix pulled all three 72% of the way toward one `base` hex, which did stop
       * the dark cells falling out of the palette — and took the material's entire colour
       * identity with them: measured hue RMS at mip 4 was 0.0075, against 0.043 for the
       * sandstone wall behind it. Granite's crystals really do differ mostly in hue (pink
       * feldspar, grey quartz) and hardly at all in value, so shifting on that axis is both more
       * truthful and strictly safer: no crystal can move toward the dark end of the ramp,
       * because none of them moves in value at all. Only biotite, which genuinely is dark, keeps
       * a value step — and a bounded one. */
      const base = MX(MX(PAL.carnelian, PAL.limeLight, 0.46), PAL.sandDark, 0.13);
      const fHex = tintAtValue(base, PAL.carnelian, 0.26);
      const qHex = tintAtValue(base, MX(PAL.limeLight, PAL.sandLight, 0.5), 0.26);
      const bHex = MX(base, PAL.sandCrev, 0.28);
      const macro = s.field(5, (u, v) => warpN(u, v, 4, 4, 1.2, cx.seed + 31) * 0.5 + 0.5);
      const size = s.size;

      /* (1) Schlieren — the pluton's own banding. Two cycles per tile is ~2 m of world, warped
       * hard so it winds rather than stripes, plus a weaker second octave. It biases which
       * mineral wins the Worley cell, so a pink swathe is pink because the feldspar count is up
       * there, and it drags a little value with it. */
      const schl = s.field(4, (u, v) => sat(
        warpN(u, v, 2, 3, 1.45, cx.seed + 907) * 0.80
        + warpN(u, v, 5, 3, 1.10, cx.seed + 1531) * 0.34 + 0.5));

      /* (2) Wind scour — shallow hollows cut by three thousand years of blown sand, at ~0.5 m.
       * Ridged noise because scour has crests where the harder crystals stand out. */
      const scour = s.field(3, (u, v) => ridgeN(u, v, 6, 4, 0.55, cx.seed + 733));

      const wA = {}, wB = {};
      // Crystal cells, capped so a half-resolution tier still gets ≥6 texels per crystal —
      // below that the Worley is finer than the mip chain can carry and returns as sparkle.
      const bigF = Math.max(24, Math.min(96, Math.round(size / 6)));
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const big = worleyN(u, v, bigF, cx.seed, 1.0, wA);
          const sm = worleyN(u, v, bigF * 2, cx.seed + 7, 1.0, wB);
          // Schlieren shifts the mineral thresholds: feldspar-rich bands vs biotite-rich ones.
          const sc = schl[i] - 0.5;
          const k = sat(big.id - sc * 0.44);
          let hex, rgh, hh;
          /* Biotite's share is down from 14% to 10%. Dark cells are the only ones carrying a
           * value step, so they are the only ones that can average the monolith toward mud at
           * distance — and at 14% they were the loudest thing on the surface up close too. */
          if (k < 0.48) { hex = fHex; rgh = 0.22; hh = 0.62; }        // pink feldspar
          else if (k < 0.91) { hex = qHex; rgh = 0.20; hh = 0.60; }   // grey quartz
          else { hex = bHex; rgh = 0.34; hh = 0.56; }                 // biotite / hornblende
          const shadeK = 0.95 + big.id * 0.06 + (sm.id - 0.5) * 0.04
            + (macro[i] - 0.5) * 0.10 + sc * 0.30;
          const c = hexRGB(hex);
          s.r[i] = c[0] * shadeK; s.g[i] = c[1] * shadeK; s.b[i] = c[2] * shadeK;
          // Crystals stand a hair apart even after polishing; grain edges catch light.
          const edge = sat((big.f2 - big.f1) / 0.16);
          const sq = scour[i] * scour[i];
          s.h[i] = hh + (1 - edge) * 0.10 + (sm.id - 0.5) * 0.06 - sq * 0.30;
          // Scoured stone lost its polish; sheltered stone kept it. That is the whole read of a
          // weathered monolith under a raking sun, and it costs nothing in the albedo.
          s.rough[i] = sat(rgh + (1 - edge) * 0.18 + (sm.id - 0.5) * 0.05 + sq * 0.34);
          s.metal[i] = 0;
        }
      }
      /* An explicit metre-scale *hue* band on top of the mineral bias, and it earns its place
       * for a reason that only showed up in a captured frame rather than in the texture.
       *
       * Measured on the obelisk's sunlit face in `courtyard`, the value structure added above
       * arrives at the eye badly compressed: mip-4 luma RMS in the texture rose 134%, and the
       * same face in the frame moved only ~15%, because a warm albedo under a full-strength key
       * sits near the top of the tonemap where value differences are squeezed flat. Hue is not
       * squeezed there. So the band that has to carry the lit face is a hue band — `tintAtValue`
       * moves it without touching luminance, which also means it cannot push any texel toward
       * the dark end of the ramp. On the *shadowed* faces the value structure is what reads,
       * because the shadow wash expands exactly the range the key compressed. Between them the
       * monolith has something to look at on every face. */
      const warmHex = tintAtValue(base, PAL.carnelian, 0.34);
      const coolHex = tintAtValue(base, MX(PAL.limeLight, PAL.sandDark, 0.55), 0.34);
      for (let i = 0; i < s.n; i++) {
        const b = schl[i] - 0.5 + (macro[i] - 0.5) * 0.5;
        if (b > 0) s.mixHex(i, warmHex, sat(b * 2.0) * 0.34);
        else s.mixHex(i, coolHex, sat(-b * 2.0) * 0.34);
      }

      // Polishing swirl + the odd deep scratch, so the mirror is not perfect.
      const pol = s.field(2, (u, v) => fbmA(u, v, 128, 40, 3, 0.5, cx.seed + 43) * 0.5 + 0.5);
      for (let i = 0; i < s.n; i++) s.rough[i] = sat(s.rough[i] + (pol[i] - 0.5) * 0.10);
      speckle(s, { freq: 120, seed: cx.seed + 19, colors: [[MX(PAL.goldSpec, PAL.sandLight, 0.4), 0.022, 0.05], [PAL.sandCrev, 0.030, 0.0]] });

      /* (3) Desert varnish, and (4) dust and bleach. `weather` cannot find its own streak
       * sources here — granite's height field is almost flat, so `concavity` returns nothing to
       * run out of — so the scour hollows are nominated explicitly. The patina term is turned up
       * over the catalogue default because a polished monolith has nothing else on it: this is
       * the layer that has to do all the work at twenty metres. */
      /* The streak source has to be *sparse*. Feeding the whole scour field in produced varnish
       * everywhere, which is the same as varnish nowhere — a uniform tint, not a streak. Only
       * the crests seed a run, so the runs start at identifiable points and hang between them. */
      const varnishSrc = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) varnishSrc[i] = sat((scour[i] - 0.52) * 3.4);
      weather(s, {
        source: varnishSrc, seed: cx.seed + 6,
        crevice: MX(PAL.sandCrev, PAL.carnelian, 0.20), creviceAmt: 0.26, creviceRadius: 10,
        streakAmt: 0.44, streakTint: 0x4e3628, streakDecay: 0.9962,
        dustAmt: 0.16, dust: MX(PAL.sandLight, PAL.limeLight, 0.4),
        downDark: 0.10, roughGrime: 0.14,
        patina: 0.26, patinaTint: 0x6f5040, patinaFreq: 2,
        // Granite is quarried in one piece: it has no courses, so no course-scale bevel light.
        directional: 0.45,
      });
      grain(s, { amount: 0.014, freq: 130, seed: cx.seed + 23, heightAmt: 0.003 });
      rampFloor(s, { crevice: MX(PAL.sandCrev, PAL.carnelian, 0.25) });
    },
  },

  mudbrick: {
    group: 'stone', tier: 1, tile: 2.6, bump: 0.038, rough: 0.94,
    build(s, cx) {
      const m = ashlar(s, {
        seed: cx.seed, courses: 6, aspect: 2.05, jointW: 0.016, chamfer: 0.026,
        dark: 0x6f4526, mid: PAL.sandDark, light: PAL.sandMid, mortar: 0x7b5230,
        /* Mud brick is genuinely laid in thick, visible mud beds, so this recipe earns a
         * stronger joint than the cut stone does — but not a *pillowed* brick. `dome` and
         * `relief` were high enough that each brick read as an inflated cushion in a deep bed,
         * which is the chocolate-bar look, not a mud wall. Flatter bricks, same bed. */
        relief: 0.07, dome: 0.022, groove: 0.20, spread: 0.85, widthJitter: 0.22,
        joint: 0.52, bedFreq: 3,
      });
      // Hand-moulded bricks: perturb the joint so no edge is straight, and crumble the arrises.
      const wob = s.field(2, (u, v) => fbmN(u, v, 34, 4, 0.55, cx.seed + 29) * 0.5 + 0.5);
      const straw = fibreMask(s.size, Math.round(s.size * 0.9), 0.030, 0.0022, cx.seed + 37);
      const strawHex = MX(PAL.limeMid, PAL.ochre, 0.45);
      for (let i = 0; i < s.n; i++) {
        const crumb = sat((1 - m.edge[i]) * (0.5 + wob[i]));
        s.h[i] -= crumb * 0.14;
        s.mixHex(i, 0x7a5330, crumb * 0.30);
        // Straw temper: pale fibres, standing slightly proud where the mud shrank back.
        const f = straw[i];
        if (f > 0.02) {
          s.mixHex(i, strawHex, f * 0.55);
          s.h[i] += f * 0.05;
          s.rough[i] = sat(s.rough[i] + f * 0.05);
        }
      }
      // Salt efflorescence: pale bloom where groundwater wicked up and dried.
      const salt = s.field(4, (u, v) => sat(warpN(u, v, 5, 4, 1.3, cx.seed + 53) * 1.6 + 0.35));
      for (let i = 0; i < s.n; i++) s.mixHex(i, PAL.white, salt[i] * salt[i] * 0.30);
      pitting(s, { amount: 0.05, freq: 60, density: 0.5, seed: cx.seed + 61, colorDark: 0x5a3820, stain: 0.10 });
      weather(s, { source: m.joint, seed: cx.seed + 6, crevice: 0x3d2416, creviceAmt: 0.54, streakAmt: 0.28, dustAmt: 0.20, directional: 0.7, patina: 0.10 });
      grain(s, { amount: 0.03, freq: 120, seed: cx.seed + 8, heightAmt: 0.010 });
      rampFloor(s, { crevice: 0x4a2f1c });
    },
  },

  plaster_painted: {
    group: 'stone', tier: 1, tile: 2.8, bump: 0.014, rough: 0.72,
    build(s, cx) {
      s.fill(PAL.limeLight); s.fillH(0.66);
      const size = s.size;
      // Lime plaster over mud: soft undulation from the float, fine crackle everywhere.
      const undu = s.field(4, (u, v) => warpN(u, v, 5, 4, 1.1, cx.seed) * 0.5 + 0.5);
      /* Crackle. Coarsened again, and this time the reason is what it *becomes* rather than how
       * it aliases: a dense dark web over a whole wall is a field of near-black texels at high
       * frequency, and the cel shader turns near-black texels violet. `interior`'s walls were
       * the worst instance of that in the review — "large soft-edged violet blotches on salmon…
       * reads as mould, lichen or camouflage". 14 cells over a 2.8 m tile is a 20 cm crackle
       * plate, which is what lime plaster over mud actually does; the old 26 was a 10 cm mesh. */
      const crack = s.field(1.5, (u, v) => {
        const w = worleyN(u, v, 14, cx.seed + 5, 0.95);
        return sat(1 - (w.f2 - w.f1) / 0.11) ** 2.2;
      });
      const paint = rasterRGBA(size, (ctx) => {
        // A dado band low down, a painted register band above it — real tomb-chapel decoration.
        HG.paintedBand(ctx, 0, size * 0.06, size, size * 0.14, 'paint',
          [PAL.ochre, PAL.red, PAL.white, PAL.lapis]);
        HG.paintedBand(ctx, 0, size * 0.72, size, size * 0.10, 'paint',
          [PAL.turquoise, PAL.white, PAL.red]);
        ctx.fillStyle = css(PAL.ochre, 0.9);
        ctx.fillRect(0, size * 0.40, size, size * 0.035);
        // Lotus-and-bud frieze between them.
        for (let i = 0; i < 9; i++) {
          HG.drawGlyph(ctx, 'lotus', (i + 0.18) * (size / 9), size * 0.46, size * 0.075, size * 0.20, 'paint');
        }
      });
      const flake = s.field(3, (u, v) => sat(warpN(u, v, 6, 5, 1.35, cx.seed + 71) * 1.5 + 0.42));
      for (let i = 0; i < s.n; i++) {
        s.h[i] += (undu[i] - 0.5) * 0.10 - crack[i] * 0.22;
        s.mixHex(i, PAL.limeMid, (1 - undu[i]) * 0.20);
        if (paint.a[i] > 0.02) {
          const keep = sat((1 - flake[i]) * 1.5) * paint.a[i];
          s.r[i] += (paint.r[i] - s.r[i]) * keep * 0.92;
          s.g[i] += (paint.g[i] - s.g[i]) * keep * 0.92;
          s.b[i] += (paint.b[i] - s.b[i]) * keep * 0.92;
          s.rough[i] = sat(s.rough[i] - keep * 0.14);
          s.h[i] += keep * 0.02;                 // pigment sits on the surface
        }
        /* Flaked-off patches expose the mud render beneath. These were the "camouflage" shapes:
         * soft-edged blotches covering ~a third of the wall at 85% strength, three value steps
         * below the plaster around them. Rendered, each one became a violet island. Fewer of
         * them (a higher threshold), and the exposed render is now only about one value step
         * down — which is also truer, since what is underneath is mud plaster, not a void. */
        const fl = sat((flake[i] - 0.72) * 3.4);
        if (fl > 0.01) {
          s.mixHex(i, 0x9c7048, fl * 0.62);
          s.h[i] -= fl * 0.20;
          s.rough[i] = sat(s.rough[i] + fl * 0.18);
        }
        s.stainHex(i, 0x6a5a42, crack[i] * 0.42);
      }
      brushwork(s, { tint: PAL.limeMid, amount: 0.10, angle: 0.22, freq: 8, len: 5, seed: cx.seed + 3 });
      weather(s, { source: crack, seed: cx.seed + 9, crevice: 0x4a3a26, creviceAmt: 0.42, streakAmt: 0.28, dustAmt: 0.14, directional: 0.6 });
      grain(s, { amount: 0.018, freq: 120, seed: cx.seed + 11, heightAmt: 0.005 });
      rampFloor(s, { crevice: 0x53412c });
    },
  },

  rubble_ground: {
    group: 'stone', tier: 1, tile: 2.6, bump: 0.036, rough: 0.94,
    build(s, cx) {
      const size = s.size;
      const sandF = s.field(3, (u, v) => warpN(u, v, 10, 4, 1.0, cx.seed + 13) * 0.5 + 0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          // Two stone sizes plus sand fill — a scree of temple debris. Fewer, larger stones:
          // a 30-cell layer over a 1.8 m tile is 6 cm gravel, which is pure noise at any
          // distance the player ever sees the floor from.
          const a = worleyN(u, v, 10, cx.seed, 1.0);
          const b = worleyN(u, v, 21, cx.seed + 3, 1.0);
          const ra = 0.26 + a.id * 0.20, rb = 0.22 + b.id * 0.18;
          const da = sat(1 - a.f1 / ra), db = sat(1 - b.f1 / rb);
          const stone = Math.max(da ** 0.7 * (a.id > 0.30 ? 1 : 0), db ** 0.7 * (b.id > 0.45 ? 1 : 0) * 0.7);
          const id = da > db ? a.id : b.id;
          const t = sat(0.245 + (id - 0.5) * 0.52 + (sandF[i] - 0.5) * 0.4);
          const col = ramp3(PAL.sandCrev, PAL.sandMid, PAL.limeMid, t);
          // Sand fill between the stones.
          const sandCol = mixHex(PAL.sandMid, PAL.sandLight, sandF[i]);
          s.r[i] = lerp(sandCol[0], col[0], stone);
          s.g[i] = lerp(sandCol[1], col[1], stone);
          s.b[i] = lerp(sandCol[2], col[2], stone);
          s.h[i] = 0.34 + stone * 0.52 + sandF[i] * 0.07;
          s.rough[i] = sat(0.96 - stone * 0.10);
        }
      }
      speckle(s, { freq: 110, seed: cx.seed + 21, colors: [[PAL.limeLight, 0.07, 0.1], [MX(PAL.sandDark, PAL.sandCrev, 0.4), 0.07, -0.14]], heightDelta: 0.012 });
      weather(s, { seed: cx.seed + 6, creviceAmt: 0.58, streakAmt: 0.10, dustAmt: 0.24, dust: PAL.sandLight, streakDecay: 0.95, directional: 0.7 });
      grain(s, { amount: 0.030, freq: 130, seed: cx.seed + 8, heightAmt: 0.010 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  paving_courtyard: {
    /* `rough` was 0.80 and the traffic-polish pass took another 0.24 off it in the worn lanes,
     * bottoming out near 0.56 — glossy enough that the floor caught a broad specular sheen and
     * read as "wet ceramic… a bathroom floor". Foot-polished sandstone does get smoother, but it
     * is still sandstone: the wear now moves roughness within a narrow band near the top of the
     * range rather than down into the gloss. */
    group: 'stone', tier: 0, tile: 4.4, bump: 0.024, rough: 0.92,
    aoStrength: 1.05,
    build(s, cx) {
      // 4.4 m ÷ 3 courses gives 1.5 m flags. The courtyard floor is the largest single area in
      // `hero` and `courtyard`, so its pattern frequency sets the whole frame's busyness.
      const m = ashlar(s, {
        seed: cx.seed, courses: 3, aspect: 1.15, jointW: 0.007, chamfer: 0.012,
        dark: PAL.sandDark, mid: PAL.sandMid, light: PAL.limeMid, mortar: 0x6a5540,
        relief: 0.055, dome: 0.0, groove: 0.26, spread: 0.7, bondJitter: 0.16, tone: -0.040,
        bedFreq: 3, rough: 0.92,
      });
      // Foot traffic: a wandering path of polished, dished, sand-scoured stone.
      const traffic = s.field(4, (u, v) => sat(warpN(u, v, 3, 4, 1.4, cx.seed + 47) * 1.7 + 0.55));
      /* The crazing. This was a 12-cell Worley web stained 42% toward `sandCrev` across every
       * flag — a dark polygon net at higher frequency than the paving pattern itself, laid over
       * the whole largest surface in the level. That is the "detail-distribution inversion" the
       * review describes (§2.3 wants "large simple areas of colour, detail concentrated at focal
       * points") and it is what made the floor read as crazy paving rather than as cut flags.
       * The crack keeps its full depth in the height field — it is a real crack — but almost all
       * of its albedo stain is gone; the AO it earns is what should draw it. */
      const crackNet = s.field(1.5, (u, v) => {
        const w = worleyN(u, v, 9, cx.seed + 51, 0.95);
        return sat(1 - (w.f2 - w.f1) / 0.045) ** 2.4;
      });
      for (let i = 0; i < s.n; i++) {
        const bu = m.bu[i] * 2 - 1, bv = m.bv[i] * 2 - 1;
        const dish = (1 - bu * bu) * (1 - bv * bv);
        const wear = traffic[i];
        s.h[i] -= dish * wear * 0.16;                        // worn hollow in the flag
        s.h[i] -= crackNet[i] * 0.22;
        s.mixHex(i, PAL.limeLight, dish * wear * 0.14);      // scuffed pale
        s.rough[i] = sat(s.rough[i] - dish * wear * 0.10 + crackNet[i] * 0.06);
        s.stainHex(i, PAL.sandCrev, crackNet[i] * 0.14);
      }
      /* Sand drifted into the joints.
       *
       * This was the single most visible sign error in the review: the joint was mixed 65%
       * toward `PAL.sandLight` *and* raised 0.13 in height, so the courtyard floor rendered as
       * pale flags separated by a raised white grid — "the crevices are *brighter* than the tile
       * faces… the floor reads as cracked ice", and with the joint standing proud of the flags
       * the derived AO had nothing to darken either. Both signs were wrong.
       *
       * The physics is not ambiguous. A joint is a gap between two stones: it is below the
       * surface, it is shaded by the stones either side of it, and what collects in it is dirt.
       * Wind-blown sand does fill it, but sand at the bottom of a 3 cm slot is sand in shadow —
       * it reads *darker* than the sunlit flag beside it, not lighter. So the drift now darkens
       * the joint (toward the sand's own shadowed value) and *lowers* it, which is also what
       * lets `heightAO` put a real contact line between the flags. */
      const sandIn = s.field(3, (u, v) => warpN(u, v, 10, 4, 1.0, cx.seed + 57) * 0.5 + 0.5);
      const jointSand = MX(PAL.sandDark, PAL.sandCrev, 0.45);
      for (let i = 0; i < s.n; i++) {
        const j = sat(m.joint[i] * 1.2) * (0.4 + sandIn[i] * 0.9);
        if (j > 0.02) {
          s.mixHex(i, jointSand, sat(j) * 0.26);
          s.h[i] -= sat(j) * 0.07;
          s.rough[i] = sat(s.rough[i] + j * 0.10);
          s.occ[i] *= 1 - sat(j) * 0.30;
        }
      }
      chiselMarks(s, { amount: 0.016, angle: 0.9, freq: 52, seed: cx.seed + 1, mask: m.edge });
      pitting(s, { amount: 0.032, freq: 70, density: 0.42, seed: cx.seed + 2, colorDark: PAL.sandDark, stain: 0.10 });
      speckle(s, { freq: 110, seed: cx.seed + 4, colors: [[PAL.limeLight, 0.06, 0.1], [MX(PAL.sandDark, PAL.sandCrev, 0.4), 0.055, -0.16]], heightDelta: 0.006 });
      weather(s, { source: m.joint, seed: cx.seed + 6, creviceAmt: 0.50, streakAmt: 0.12, dustAmt: 0.16, streakDecay: 0.94, directional: 0.55 });
      grain(s, { amount: 0.020, freq: 120, seed: cx.seed + 8, heightAmt: 0.006 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  /* ===================== carved & decorated ============================= */

  /* `tile` is 6.4 m because the *repeat* is what the review actually saw, not the glyphs: "the
   * wall is a grid of small blocks each stamped with a flat glyph, and I can count the same pink
   * oval at least eight times and the same green crescent at least six". At 4.2 m a 20 m pylon
   * showed the same tile five times across and three times up — fifteen copies of one oval in
   * one frame. At 6.4 m it is three by two, and the glyphs inside it are correspondingly larger,
   * so what repeats is a band of readable inscription rather than a stamp. */
  /* **`aoStrength` was 1.5–1.7 on every carved recipe as a stand-in for missing shadows. The
   * shadows work now, so it comes back down to 1.05–1.15.**
   *
   * The old note here was honest about why it was high: the shadow term was suppressed
   * engine-wide (`KNOWN_ISSUES` §1), the frames were ambient-lit, and baked AO was the only
   * occlusion available — it multiplies the ambient fill, so it darkens the inside of a cut
   * whatever the lighting is or is not doing. It also flagged this exact re-check. The second
   * review confirmed both halves: cast shadows verified working (*"a crisp diagonal shadow edge
   * across a wall"*), and the baked term now double-counting (*"a broad soft dark wash with no
   * occluder anywhere near it… it reads as an airbrush smudge"*).
   *
   * Two things happen together, and the second is why this is not simply a reduction. The
   * strength comes down, and `heightAO`'s radius weights move two thirds of the budget inside
   * five texels (see NormalMap.js). Net on a *carving*: the broad component that filled a glyph
   * interior with flat darkness — the thing that made it read as a stamp — is what goes, while
   * the contact darkening along the cut wall is barely touched. So the relief reads more like a
   * chisel edge at 1.15 than it did at 1.7, not less. What replaces the lost overall contrast is
   * grime on the floor of the cut (`freshCutTint`), which is albedo, survives minification, and
   * carries no lighting direction of its own. */
  /* `tile` is a compromise between two failures in opposite directions, and it is worth recording
   * which is which because the first pass of this fix overshot straight into the second.
   *
   * Too fine and the *repeat* is what you see rather than the glyphs: at 4.2 m a 20 m pylon shows
   * the same tile five times across and three times up, and the review counted "the same pink
   * oval at least eight times and the same green crescent at least six… a wall of postage
   * stamps". Too coarse and narrow surfaces starve: at 6.4 m the obelisk, whose faces are 2.6 m
   * wide, sampled well under half a tile and usually landed on the plain-stone part of the
   * layout, so it rendered as a bare block — §7.3's "any surface reads as flat vertex colour"
   * arriving as the price of fixing the repetition.
   *
   * 5.2 m is still a quarter coarser than the version that failed, and the other two levers —
   * three wide glyph columns instead of four, and pigment faded toward the stone — carry most of
   * the anti-repetition work now, because a repeat you cannot pick out is not a repeat. */
  hieroglyph_wall: {
    group: 'carved', tier: 0, tile: 5.2, bump: 0.044, rough: 0.86,
    aoStrength: 1.15, aoFloor: 0.13,
    build(s, cx) {
      const size = s.size;
      // Carvings run straight across block joints, exactly as they do on a real temple wall —
      // the masons dressed the wall first and the sculptors came after.
      const m = ashlar(s, { seed: cx.seed, courses: 6, aspect: 2.6, dome: 0.025, relief: 0.05, groove: 0.20, jointW: 0.006, chamfer: 0.012, tone: -0.045, bedFreq: 2 });
      const layout = (mode) => (ctx) => glyphWall(ctx, size, mode, cx.seed);
      const cut = rasterMask(size, layout('cut'));
      const lines = rasterMask(size, layout('line'));
      const paint = rasterRGBA(size, layout('paint'));

      /* Deeper cut, tighter bevel, no baked highlight. All of the carving's contrast now lives
       * in the height field, so the normal map and `heightAO` produce it — which means it turns
       * with the sun and goes flat in shadow, the way a chisel line does. */
      const ramp = carve(s, cut, lines, { depth: 0.46, bevelPx: 3.0, lip: 0.12, bulge: 0.42, lineDepth: 0.62, seed: cx.seed + 5 });
      freshCutTint(s, ramp, { amount: 0.16 });
      paintRemnants(s, ramp, paint, { survival: 0.50, freq: 5, seed: cx.seed + 9, edgeLoss: 0.66, fade: 0.42 });
      chiselMarks(s, { amount: 0.016, angle: -0.35, freq: 48, seed: cx.seed + 1, mask: m.edge });
      pitting(s, { amount: 0.030, freq: 64, density: 0.34, seed: cx.seed + 2, colorDark: PAL.sandDark, stain: 0.10 });
      const src = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) src[i] = sat(m.joint[i] * 0.8 + ramp[i] * 0.55);
      weather(s, { source: src, seed: cx.seed + 6, creviceAmt: 0.44, streakAmt: 0.26, dustAmt: 0.20, roughGrime: 0.12, directional: 0.35 });
      grain(s, { amount: 0.020, freq: 120, seed: cx.seed + 8, heightAmt: 0.006 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  hieroglyph_gilded: {
    group: 'carved', tier: 1, tile: 3.2, bump: 0.042, rough: 0.70,
    aoStrength: 1.12, aoFloor: 0.13,
    build(s, cx) {
      const size = s.size;
      ashlar(s, {
        seed: cx.seed, courses: 3, aspect: 3.0, dome: 0.02, relief: 0.04, groove: 0.20, jointW: 0.005, chamfer: 0.010,
        // Mortar darker than `limeMid`: a joint is a recess, so it can never be the bright thing.
        dark: PAL.limeDark, mid: PAL.limeMid, light: PAL.limeLight, mortar: 0x8a7a5e, rough: 0.62,
      });
      const layout = (mode) => (ctx) => glyphWall(ctx, size, mode, cx.seed + 4, { cols: 3, cartouche: true });
      const cut = rasterMask(size, layout('cut'));
      const lines = rasterMask(size, layout('line'));
      const ramp = carve(s, cut, lines, { depth: 0.42, bevelPx: 2.6, lip: 0.10, bulge: 0.5, lineDepth: 0.56, seed: cx.seed + 5 });

      // Gold leaf laid into the sunk glyphs over a red bole ground; the leaf lifts at the arrises.
      const lift = s.field(2, (u, v) => sat(warpN(u, v, 14, 4, 1.1, cx.seed + 31) * 1.4 + 0.5));
      const wrinkle = s.field(2, (u, v) => fbmN(u, v, 55, 3, 0.5, cx.seed + 37) * 0.5 + 0.5);
      for (let i = 0; i < s.n; i++) {
        const g = sat(ramp[i] * 1.35 - 0.10);
        if (g <= 0.01) continue;
        const worn = sat((lift[i] - 0.66) * 3.0) * g;
        const t = sat(0.40 + (wrinkle[i] - 0.5) * 1.1);
        const col = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, t);
        s.r[i] += (col[0] - s.r[i]) * g; s.g[i] += (col[1] - s.g[i]) * g; s.b[i] += (col[2] - s.b[i]) * g;
        s.mixHex(i, PAL.red, worn * 0.75);                    // bole showing through
        s.metal[i] = g * (1 - worn * 0.85);
        s.rough[i] = lerp(s.rough[i], 0.20 + (1 - wrinkle[i]) * 0.14 + worn * 0.4, g);
        s.h[i] += g * 0.03 * wrinkle[i];
      }
      weather(s, { source: ramp, seed: cx.seed + 6, crevice: 0x6a5c42, creviceAmt: 0.40, streakAmt: 0.22, dustAmt: 0.16, roughGrime: 0.08 });
      grain(s, { amount: 0.014, freq: 120, seed: cx.seed + 8, heightAmt: 0.004 });
    },
  },

  relief_figures: {
    group: 'carved', tier: 0, tile: 5.4, bump: 0.046, rough: 0.86,
    aoStrength: 1.15, aoFloor: 0.13,
    build(s, cx) {
      const size = s.size;
      const m = ashlar(s, { seed: cx.seed, courses: 4, aspect: 3.2, dome: 0.02, relief: 0.04, groove: 0.20, jointW: 0.005, chamfer: 0.010, tone: -0.020, bedFreq: 2 });
      const layout = (mode) => (ctx) => figureRegisters(ctx, size, mode, cx.seed);
      const cut = rasterMask(size, layout('cut'));
      const lines = rasterMask(size, layout('line'));
      const paint = rasterRGBA(size, layout('paint'));
      const ramp = carve(s, cut, lines, { depth: 0.50, bevelPx: 3.2, lip: 0.14, bulge: 0.52, lineDepth: 0.52, seed: cx.seed + 5 });
      freshCutTint(s, ramp, { amount: 0.18 });
      paintRemnants(s, ramp, paint, { survival: 0.48, freq: 4, seed: cx.seed + 9, edgeLoss: 0.68, fade: 0.44 });
      chiselMarks(s, { amount: 0.014, angle: -0.30, freq: 44, seed: cx.seed + 1, mask: m.edge });
      pitting(s, { amount: 0.035, freq: 64, density: 0.36, seed: cx.seed + 2, colorDark: PAL.sandDark, stain: 0.10 });
      const src = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) src[i] = sat(m.joint[i] * 0.8 + ramp[i] * 0.6);
      weather(s, { source: src, seed: cx.seed + 6, creviceAmt: 0.46, streakAmt: 0.28, dustAmt: 0.22, directional: 0.35 });
      grain(s, { amount: 0.020, freq: 120, seed: cx.seed + 8, heightAmt: 0.006 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  cartouche_gold: {
    group: 'carved', tier: 1, tile: 1.6, bump: 0.032, rough: 0.44,
    build(s, cx) {
      const size = s.size;
      s.fill(PAL.lapis); s.fillH(0.60); s.rough.fill(0.52);
      const deepLapis = MX(PAL.lapis, PAL.shadow, 0.40);
      // A lapis field with a gilded shen ring — the way a royal name reads on a shrine panel.
      const field = s.field(3, (u, v) => warpN(u, v, 9, 5, 1.1, cx.seed) * 0.5 + 0.5);
      const ring = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.cartouche(ctx, size * 0.24, size * 0.06, size * 0.52, size * 0.88, cx.seed, 'cut', { ringOnly: true });
      });
      const inner = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.cartouche(ctx, size * 0.24, size * 0.06, size * 0.52, size * 0.88, cx.seed, 'cut', { interiorOnly: true });
      });
      const innerLine = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.cartouche(ctx, size * 0.24, size * 0.06, size * 0.52, size * 0.88, cx.seed, 'line', { interiorOnly: true });
      });
      const rope = s.field(1.5, (u, v) => fbmN(u, v, 96, 2, 0.5, cx.seed + 13) * 0.5 + 0.5);
      const ringSoft = blurWrap(ring, size, Math.max(1, Math.round(size / 200)), 2);

      for (let i = 0; i < s.n; i++) {
        s.mixHex(i, deepLapis, (1 - field[i]) * 0.45);
        s.mixHex(i, PAL.turquoise, sat(field[i] - 0.7) * 0.35);
      }
      // Interior glyphs cut into the lapis, then the raised gilt ring on top.
      const ramp = carve(s, inner, innerLine, { depth: 0.34, bevelPx: 2.4, lip: 0.06, bulge: 0.45, lineDepth: 0.5, seed: cx.seed + 5 });
      for (let i = 0; i < s.n; i++) {
        const g = sat(ringSoft[i] * 1.3);
        if (g > 0.02) {
          const t = sat(0.42 + (rope[i] - 0.5) * 1.2);
          const col = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, t);
          s.r[i] += (col[0] - s.r[i]) * g; s.g[i] += (col[1] - s.g[i]) * g; s.b[i] += (col[2] - s.b[i]) * g;
          s.metal[i] = g;
          s.rough[i] = lerp(s.rough[i], 0.18 + (1 - rope[i]) * 0.16, g);
          s.h[i] += g * 0.30 + g * rope[i] * 0.06;     // the ring stands proud, rope-textured
        }
        // Gold in the sunk glyphs too — a cartouche is always the richest thing on the wall.
        const gi = sat(ramp[i] * 1.2 - 0.15);
        if (gi > 0.02) {
          s.mixHex(i, PAL.goldMid, gi * 0.85);
          s.metal[i] = Math.max(s.metal[i], gi * 0.9);
          s.rough[i] = lerp(s.rough[i], 0.24, gi);
        }
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x101c30, creviceAmt: 0.45, streakAmt: 0.14, dustAmt: 0.10, roughGrime: 0.06, patina: 0.06 });
      grain(s, { amount: 0.02, freq: 320, seed: cx.seed + 8, heightAmt: 0.006 });
    },
  },

  ceiling_stars: {
    group: 'carved', tier: 1, tile: 3.0, bump: 0.014, rough: 0.68,
    build(s, cx) {
      const size = s.size;
      /* A painted star ceiling is pigment *on plaster*, and the plaster keeps showing through —
       * real Egyptian ceilings are a mid blue, not a void. This one was mixed 55% toward a
       * shadowed lapis and then darkened another 50% by the plaster field, which put it three
       * value steps below every wall in the hall; at full-frame scale it stopped reading as
       * architecture and read as a hole through the roof to a night sky, in a golden-hour shot.
       * Lifting the ground keeps §2.2's `LAPIS #1f4f96` as the hue and puts the ceiling back
       * into the room's value range. */
      s.fill(MX(PAL.lapis, PAL.limeMid, 0.14)); s.fillH(0.62); s.rough.fill(0.70);
      const deepLapis = MX(PAL.lapis, PAL.sandCrev, 0.30);
      // Egyptian night ceiling: a deep blue field, gold stars in offset rows, painted border.
      const cols = 6, rows = 6;
      const stars = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff';
        const rnd = rng(cx.seed >>> 0);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const off = (r % 2) * 0.5;
            const x = ((c + off + 0.5) / cols) * size + rnd.jitter(size * 0.012);
            const y = ((r + 0.5) / rows) * size + rnd.jitter(size * 0.012);
            const rr = (size / cols) * (0.20 + rnd() * 0.045);
            for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
              HG.star5(ctx, x + ox, y + oy, rr, -Math.PI / 2 + rnd.jitter(0.16));
            }
          }
        }
      });
      const plaster = s.field(3, (u, v) => warpN(u, v, 7, 4, 1.1, cx.seed + 3) * 0.5 + 0.5);
      const soot = s.field(4, (u, v) => sat(warpN(u, v, 4, 4, 1.3, cx.seed + 17) * 1.5 + 0.42));
      const starSoft = blurWrap(stars, size, Math.max(1, Math.round(size / 300)), 2);
      const wear = s.field(3, (u, v) => sat(warpN(u, v, 11, 4, 1.2, cx.seed + 29) * 1.4 + 0.5));
      for (let i = 0; i < s.n; i++) {
        s.mixHex(i, deepLapis, (1 - plaster[i]) * 0.32);
        s.mixHex(i, PAL.turquoise, sat(plaster[i] - 0.76) * 0.30);
        s.h[i] += (plaster[i] - 0.5) * 0.10;
        const g = sat(starSoft[i] * 1.25);
        if (g > 0.02) {
          const lost = sat((wear[i] - 0.70) * 3.2);
          const t = sat(0.45 + (plaster[i] - 0.5) * 0.8);
          const col = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, t);
          const k = g * (1 - lost * 0.9);
          s.r[i] += (col[0] - s.r[i]) * k; s.g[i] += (col[1] - s.g[i]) * k; s.b[i] += (col[2] - s.b[i]) * k;
          s.h[i] += g * 0.24;                       // pigment/leaf sits proud of the plaster
          s.rough[i] = lerp(s.rough[i], 0.34, k);
          s.metal[i] = k * 0.55;
        }
        // Lamp soot: centuries of torches, pooling in the hollows.
        s.stainHex(i, 0x2a2430, sat(soot[i] - 0.55) * 0.55);
      }
      brushwork(s, { tint: MX(PAL.lapis, PAL.white, 0.18), amount: 0.10, angle: 0.1, freq: 7, len: 6, seed: cx.seed + 7 });
      weather(s, { seed: cx.seed + 6, crevice: 0x243044, creviceAmt: 0.34, streakAmt: 0.10, dustAmt: 0.06, roughGrime: 0.08, directional: 0.5, patina: 0.08 });
      grain(s, { amount: 0.024, freq: 320, seed: cx.seed + 8, heightAmt: 0.006 });
      rampFloor(s, { crevice: 0x2b3a58 });
    },
  },

  /* One of seven recipes whose `[u, v]` tile hit `Math.max(0.05, array)` in `derive()` and got a
   * NaN slope scale — which lands in a `Uint8Array` as 0, i.e. an all-black normal map decoding
   * to (-1,-1,-1) on all twelve hypostyle columns. Fixed in NormalMap.derive; the bump is now
   * also proportionate (0.10 m of relief across a 3.6 m repeat was a 28× slope scale). */
  column_papyrus: {
    group: 'carved', tier: 0, tile: [3.6, 4.5], bump: 0.042, rough: 0.84,
    aoStrength: 1.05, aoFloor: 0.14,
    build(s, cx) {
      const size = s.size;
      // A bundled-papyrus column: convex stalks running vertically, V-grooves between them,
      // painted bands ringing it, and a column of text down the front.
      /* The stalk cross-section.
       *
       * It was `sqrt(1 - d²)` — a true semicircle, and therefore a profile whose *derivative is
       * infinite* at both edges of every stalk. Differentiated at texel spacing and multiplied
       * by this recipe's slope scale (the largest in the catalogue: 0.05 m of relief across a
       * 3.6 m repeat), each stalk edge came out as a near-perpendicular facet running the full
       * height of the shaft. Facets that steep sit on the far side of the cel ramp's terminator
       * from the stalk face beside them, so every column carried alternating full-height bands
       * of "fully lit" and "fully shadowed" — which is what the review saw as *"long vertical
       * cyan and white smears running their full height… they read as melted candle wax"*, and
       * why it looked like a projection failure rather than fluting.
       *
       * `1 - d²` is the same rounded stalk to the eye, has a *finite* slope everywhere, and goes
       * to zero gradient at the crown, which is where the highlight belongs. Combined with a
       * wider, softer V between stalks and a smaller `bump`, the flutes now turn with the light
       * instead of banding against it. */
      /* `p` runs 0..1 across one stalk, so `d = 2p-1` is 0 at the stalk's crown and ±1 at the
       * boundary it shares with its neighbour. The groove therefore has to peak at |d| = 1.
       * It was written as `sat(1 - |d|/0.16)`, which peaks at |d| = 0 — so the V was being cut
       * straight down the *crown of every stalk* instead of into the gap between them, giving
       * each bundle a full-height slot down its front. Nine of those per repeat, on twelve
       * hypostyle columns, is a large part of why the columns read as vertically streaked. */
      const stalks = 9;
      const cross = s.field(1, (u, v) => {
        const wob = fbmN(u, v, 6, 3, 0.5, cx.seed + 11) * 0.010;
        const p = ((u + wob) * stalks) % 1;
        const d = p * 2 - 1;
        return sat(1 - d * d);
      });
      const groove = s.field(1, (u, v) => {
        const wob = fbmN(u, v, 6, 3, 0.5, cx.seed + 11) * 0.010;
        const p = ((u + wob) * stalks) % 1;
        return smoothstep(0.70, 1.0, Math.abs(p * 2 - 1));
      });
      const stone = s.field(2, (u, v) => warpN(u, v, 12, 5, 1.0, cx.seed) * 0.5 + 0.5);
      const bandsMask = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff';
        // Binding bands near the foot and below the capital.
        for (const [y, h] of [[0.035, 0.055], [0.115, 0.030], [0.80, 0.030], [0.865, 0.055]]) {
          ctx.fillRect(-2, (1 - y - h) * size, size + 4, h * size);
        }
      });
      const paint = rasterRGBA(size, (ctx) => {
        for (const [y, h] of [[0.035, 0.055], [0.865, 0.055]]) {
          HG.paintedBand(ctx, -2, (1 - y - h) * size, size + 4, h * size, 'paint',
            [PAL.ochre, PAL.red, PAL.lapis, PAL.turquoise, PAL.white]);
        }
        for (const [y, h] of [[0.115, 0.030], [0.80, 0.030]]) {
          ctx.fillStyle = css(PAL.ochre); ctx.fillRect(-2, (1 - y - h) * size, size + 4, h * size);
        }
        HG.columnRegister(ctx, size * 0.40, size * 0.20, size * 0.20, size * 0.58, cx.seed + 3, HG.POOLS.divine, 'paint');
      });
      const textCut = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.columnRule(ctx, size, size * 0.385, size * 0.008, size * 0.19, size * 0.79, 'line');
        HG.columnRule(ctx, size, size * 0.615, size * 0.008, size * 0.19, size * 0.79, 'line');
        HG.columnRegister(ctx, size * 0.40, size * 0.20, size * 0.20, size * 0.58, cx.seed + 3, HG.POOLS.divine, 'cut');
      });
      const textLine = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.columnRegister(ctx, size * 0.40, size * 0.20, size * 0.20, size * 0.58, cx.seed + 3, HG.POOLS.divine, 'line');
      });

      for (let i = 0; i < s.n; i++) {
        s.h[i] = 0.42 + cross[i] * 0.40 - groove[i] * 0.22 + (stone[i] - 0.5) * 0.07;
        // Most of the flute read is relief, not paint — a quarter of the tonal swing it had.
        const t = sat(0.42 + (stone[i] - 0.5) * 0.60 + cross[i] * 0.10);
        const col = ramp3(PAL.sandDark, PAL.sandMid, PAL.sandLight, t);
        s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
        s.rough[i] = 0.84;
        const bm = bandsMask[i];
        if (bm > 0.02) s.h[i] += bm * 0.16;                    // bands stand proud
      }
      const ramp = carve(s, textCut, textLine, { depth: 0.40, bevelPx: 2.4, lip: 0.09, bulge: 0.45, lineDepth: 0.60, seed: cx.seed + 5 });
      freshCutTint(s, ramp, { amount: 0.14 });
      paintRemnants(s, ramp, paint, { survival: 0.34, freq: 6, seed: cx.seed + 9, edgeLoss: 0.70, fade: 0.45 });
      // Band paint survives better than glyph paint — it was thicker and re-applied.
      const bandWear = s.field(3, (u, v) => sat(warpN(u, v, 8, 4, 1.2, cx.seed + 41) * 1.4 + 0.5));
      for (let i = 0; i < s.n; i++) {
        if (bandsMask[i] < 0.02 || paint.a[i] < 0.02) continue;
        const keep = sat((bandWear[i] * 0.8 + 0.35)) * bandsMask[i] * paint.a[i];
        s.r[i] += (paint.r[i] - s.r[i]) * keep; s.g[i] += (paint.g[i] - s.g[i]) * keep; s.b[i] += (paint.b[i] - s.b[i]) * keep;
        s.rough[i] = sat(s.rough[i] - keep * 0.12);
      }
      chiselMarks(s, { amount: 0.016, angle: 1.35, freq: 64, seed: cx.seed + 1 });
      pitting(s, { amount: 0.030, freq: 38, density: 0.32, seed: cx.seed + 2, colorDark: PAL.sandDark });
      const src = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) src[i] = sat(groove[i] * 0.7 + ramp[i] * 0.5 + bandsMask[i] * 0.4);
      /* `directional` is low here for a second reason on top of the fake-bevel one: the column is
       * a *cylinder*, so `skyward()`'s notion of "up-facing" — which is a fact about the texture's
       * v axis — sweeps around the shaft as the surface turns. Baking it in paints a fixed light
       * seam down the column that does not move with the sun, which is part of what the review saw
       * as "long vertical cyan and white smears running their full height". */
      weather(s, { source: src, seed: cx.seed + 6, creviceAmt: 0.46, streakAmt: 0.24, dustAmt: 0.16, directional: 0.20 });
      grain(s, { amount: 0.020, freq: 120, seed: cx.seed + 8, heightAmt: 0.006 });
      rampFloor(s, { crevice: PAL.sandCrev });
    },
  },

  /* ===================== metal & precious =============================== */

  gold_leaf: {
    group: 'metal', tier: 1, tile: 0.9, bump: 0.004, rough: 0.20,
    build(s, cx) {
      const size = s.size;
      s.fill(PAL.goldMid); s.fillH(0.62); s.rough.fill(0.18); s.metal.fill(1);
      // Beaten leaf laid in overlapping squares: the seams are the tell.
      const sheets = 4;
      const seam = s.field(1.5, (u, v) => {
        const jx = fbmN(u, v, 5, 3, 0.5, cx.seed + 3) * 0.02;
        const a = Math.abs(tri((u + jx) * sheets)), b = Math.abs(tri((v + jx) * sheets));
        return sat(1 - Math.min(a, b) / 0.10) ** 2;
      });
      const wrinkle = s.field(2, (u, v) => warpN(u, v, 26, 4, 1.2, cx.seed + 7) * 0.5 + 0.5);
      const dust = s.field(4, (u, v) => sat(warpN(u, v, 6, 4, 1.2, cx.seed + 13) * 1.4 + 0.5));
      const hole = s.field(2, (u, v) => {
        const w = worleyN(u, v, 34, cx.seed + 19, 1.0);
        return w.id < 0.10 ? sat(1 - w.f1 / 0.14) ** 2 : 0;
      });
      for (let i = 0; i < s.n; i++) {
        const t = sat(0.46 + (wrinkle[i] - 0.5) * 1.25);
        const col = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, t);
        s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
        s.h[i] = 0.58 + (wrinkle[i] - 0.5) * 0.28 + seam[i] * 0.22;
        s.rough[i] = sat(0.15 + (1 - wrinkle[i]) * 0.13 + seam[i] * 0.10);
        // Pinholes where the leaf tore: red bole ground shows, and it is not metal any more.
        if (hole[i] > 0.02) {
          s.mixHex(i, PAL.red, hole[i] * 0.9);
          s.metal[i] = 1 - hole[i] * 0.95;
          s.rough[i] = sat(s.rough[i] + hole[i] * 0.55);
          s.h[i] -= hole[i] * 0.20;
        }
        // Dust dulls gold faster than anything; without it gold reads as plastic.
        const d = sat(dust[i] - 0.55) * 0.8;
        s.mixHex(i, PAL.sandLight, d * 0.22);
        s.rough[i] = sat(s.rough[i] + d * 0.30);
        s.metal[i] *= 1 - d * 0.35;
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x5a4418, creviceAmt: 0.42, streakAmt: 0.16, dustAmt: 0.10, dust: PAL.limeMid, roughGrime: 0.14, downDark: 0.10, patina: 0.05 });
      grain(s, { amount: 0.016, freq: 340, seed: cx.seed + 8, heightAmt: 0.004 });
    },
  },

  gold_hammered: {
    group: 'metal', tier: 1, tile: 0.7, bump: 0.0055, rough: 0.28,
    build(s, cx) {
      const size = s.size;
      s.metal.fill(1);
      const facetF = 22;
      const macro = s.field(4, (u, v) => warpN(u, v, 5, 4, 1.2, cx.seed + 11) * 0.5 + 0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const w = worleyN(u, v, facetF, cx.seed, 0.95);
          const w2 = worleyN(u, v, facetF * 3, cx.seed + 5, 0.95);
          // Each hammer blow is a shallow dish; the rims between them stay bright.
          const dish = sat(1 - w.f1 / (0.40 + w.id * 0.22));
          const dish2 = sat(1 - w2.f1 / 0.42);
          s.h[i] = 0.72 - dish * dish * 0.42 - dish2 * dish2 * 0.14;
          const t = sat(0.40 + (1 - dish) * 0.55 + (macro[i] - 0.5) * 0.5 + (w.id - 0.5) * 0.2);
          const col = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.rough[i] = sat(0.22 + dish * 0.20 + (w2.id - 0.5) * 0.08);
        }
      }
      chiselMarks(s, { amount: 0.02, angle: 0.85, freq: 130, seed: cx.seed + 3 });
      weather(s, { seed: cx.seed + 6, crevice: 0x4e3a14, creviceAmt: 0.50, streakAmt: 0.14, dustAmt: 0.12, dust: PAL.limeMid, roughGrime: 0.18, downDark: 0.12, patina: 0.05 });
      grain(s, { amount: 0.014, freq: 360, seed: cx.seed + 8, heightAmt: 0.004 });
    },
  },

  bronze_aged: {
    group: 'metal', tier: 1, tile: 0.8, bump: 0.010, rough: 0.42,
    build(s, cx) {
      const size = s.size;
      const bronze = mixHex(PAL.goldDark, PAL.black, 0.30).slice();
      s.metal.fill(1); s.rough.fill(0.40);
      const cast = s.field(2, (u, v) => warpN(u, v, 18, 5, 1.0, cx.seed) * 0.5 + 0.5);
      const blow = s.field(2, (u, v) => {
        const w = worleyN(u, v, 30, cx.seed + 7, 1.0);
        return w.id < 0.22 ? sat(1 - w.f1 / 0.20) ** 2 : 0;
      });
      for (let i = 0; i < s.n; i++) {
        const t = cast[i];
        s.r[i] = bronze[0] * (0.72 + t * 0.6); s.g[i] = bronze[1] * (0.72 + t * 0.6); s.b[i] = bronze[2] * (0.72 + t * 0.6);
        s.h[i] = 0.66 + (t - 0.5) * 0.16 - blow[i] * 0.34;      // cast surface + blowholes
        s.rough[i] = sat(0.38 + (1 - t) * 0.16 + blow[i] * 0.3);
      }
      // Patina grows in the recesses and runs downhill from them — verdigris obeys gravity.
      const conc = concavity(s.h, size, Math.max(2, Math.round(size / 90)), 2);
      let cmax = 1e-6;
      for (let i = 0; i < s.n; i++) if (conc[i] > cmax) cmax = conc[i];
      const src = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) src[i] = sat(conc[i] / cmax * 1.2 + blow[i] * 0.8);
      const run = streakDown(src, size, 0.975, cx.seed + 3);
      const patch = s.field(3, (u, v) => sat(warpN(u, v, 7, 4, 1.3, cx.seed + 13) * 1.5 + 0.5));
      for (let i = 0; i < s.n; i++) {
        const p = sat((src[i] * 0.9 + run[i] * 0.8) * (0.4 + patch[i] * 1.2));
        if (p <= 0.01) continue;
        const green = mixHex(PAL.malachite, PAL.turquoise, 0.35 + patch[i] * 0.4);
        s.r[i] += (green[0] - s.r[i]) * sat(p * 0.9);
        s.g[i] += (green[1] - s.g[i]) * sat(p * 0.9);
        s.b[i] += (green[2] - s.b[i]) * sat(p * 0.9);
        s.metal[i] *= 1 - sat(p) * 0.85;                        // patina is a mineral, not metal
        s.rough[i] = sat(s.rough[i] + p * 0.45);
        s.h[i] += p * 0.06;                                     // crust builds up
      }
      // Handled edges wear back to bright metal.
      const sky = skyward(s.h, size, Math.max(1, Math.round(size / 300)));
      for (let i = 0; i < s.n; i++) {
        const up = sat(sky[i]) * sat(1 - src[i] * 2);
        s.mixHex(i, PAL.goldLight, up * 0.30);
        s.rough[i] = sat(s.rough[i] - up * 0.16);
        s.metal[i] = sat(s.metal[i] + up * 0.3);
      }
      grain(s, { amount: 0.02, freq: 340, seed: cx.seed + 8, heightAmt: 0.005 });
    },
  },

  lapis_inlay: { group: 'metal', tier: 1, tile: 0.45, bump: 0.010, rough: 0.36, build: (s, cx) => inlay(s, cx, PAL.lapis, PAL.white, PAL.goldSpec, 0.30) },
  turquoise_inlay: { group: 'metal', tier: 1, tile: 0.45, bump: 0.010, rough: 0.40, build: (s, cx) => inlay(s, cx, PAL.turquoise, 0x1a5c58, PAL.sandDark, 0.16) },
  carnelian_inlay: { group: 'metal', tier: 1, tile: 0.45, bump: 0.010, rough: 0.30, build: (s, cx) => inlay(s, cx, PAL.carnelian, 0xd98a62, PAL.white, 0.10) },

  /* ===================== organic ======================================== */

  /* **These two are authored to the scale TERRAIN actually applies them at, which is not the
   * scale they used to declare.** That mismatch is the `dunes` regression.
   *
   * `Terrain._buildTextures` takes `sand_ripples` for its *normal map only* and overrides the
   * repeat to `1/9.6` — 9.6 m per tile, because `TUNE.rippleWave` is 0.30 m and it wants 32
   * ripples across it. The recipe declared 2.6 m and drew 15 ripples. Two things went wrong at
   * once. The ripples came out at 9.6/15 = **64 cm**, twice the wavelength the terrain is built
   * around; and `derive` encoded the tangent slope for a 2.6 m tile, so stretching the map to
   * 9.6 m multiplied every slope by **3.7×**. A 64 cm corrugation with quadrupled slope is not a
   * wind ripple, it is a roof — and a raking key on a roof blows its lit flank straight through
   * the top of the tonemap, which desaturates it. That is the review's *"broad horizontal
   * grey-white wavy stripes… reads as dirty snow"*, and it is why the stripes went from pale
   * salmon in pass 1 to grey-white in pass 2 while the albedo stayed warm: nothing about the
   * *colour* changed, the highlight simply started clipping.
   *
   * Measured off the CPU-side albedo, `sand_fine` (the map that actually carries the dune's
   * colour) reports mean `#c08a55` at 0.556 saturation with its top luma decile at `#d09a63`.
   * There is no grey in the material. The grey was made in the shading, by relief that was
   * 3.7× too steep, and it is fixed here where the mistake is — by declaring the tile the
   * consumer uses. `sand_fine` gets the same treatment at its own 8 m repeat. */
  sand_ripples: {
    group: 'organic', tier: 0, tile: 9.6, bump: 0.018, rough: 0.95,
    build(s, cx) { sand(s, cx, { ripple: 1.0, rippleFreq: 32, grainFreq: 300, tone: 0.0, microH: 0.45, tileMetres: 9.6 }); },
  },
  sand_fine: {
    group: 'organic', tier: 1, tile: 8.0, bump: 0.014, rough: 0.96,
    build(s, cx) { sand(s, cx, { ripple: 0.30, rippleFreq: 26, grainFreq: 300, tone: 0.05, tileMetres: 8.0 }); },
  },
  sand_wet: {
    group: 'organic', tier: 1, tile: 1.6, bump: 0.030, rough: 0.42,
    build(s, cx) {
      sand(s, cx, { ripple: 0.55, rippleFreq: 9, grainFreq: 340, tone: -0.30, wet: true, tileMetres: 1.6 });
    },
  },

  palm_bark: {
    group: 'organic', tier: 1, tile: [1.4, 1.8], bump: 0.022, rough: 0.90,
    build(s, cx) {
      const size = s.size;
      // A date palm trunk is a lattice of old frond bases — rhombic pads with deep grooves.
      const fx = 5, fy = 7;
      const fibre = s.field(1.5, (u, v) => fbmA(u, v, 14, 140, 3, 0.5, cx.seed + 11) * 0.5 + 0.5);
      const macro = s.field(5, (u, v) => warpN(u, v, 4, 4, 1.2, cx.seed + 23) * 0.5 + 0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const wob = fbmN(u, v, 7, 3, 0.5, cx.seed) * 0.03;
          const a = tri((u + wob) * fx + (v + wob) * fy);
          const b = tri((u + wob) * fx - (v - wob) * fy);
          const d = Math.max(Math.abs(a), Math.abs(b));         // diamond distance field
          const pad = smoothstep(0.90, 0.34, d);                // raised frond-base pad
          const groove = sat(1 - (1 - d) / 0.16) ** 1.4;
          s.h[i] = 0.34 + pad * 0.46 - groove * 0.26 + (fibre[i] - 0.5) * 0.10;
          const t = sat(0.34 + pad * 0.5 + (macro[i] - 0.5) * 0.5 + (fibre[i] - 0.5) * 0.4);
          const col = ramp3(0x3a2618, PAL.sandDark, PAL.sandMid, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.rough[i] = sat(0.88 + (1 - pad) * 0.08);
        }
      }
      const hair = fibreMask(size, Math.round(size * 1.4), 0.035, 0.0016, cx.seed + 31, 0.35);
      const hairHex = MX(PAL.sandLight, PAL.sandDark, 0.35);
      for (let i = 0; i < s.n; i++) {
        if (hair[i] < 0.02) continue;
        s.mixHex(i, hairHex, hair[i] * 0.5);
        s.h[i] += hair[i] * 0.05;
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x241608, creviceAmt: 0.62, streakAmt: 0.18, dustAmt: 0.20, roughGrime: 0.06 });
      grain(s, { amount: 0.04, freq: 300, seed: cx.seed + 8, heightAmt: 0.014 });
    },
  },

  palm_frond: {
    group: 'organic', tier: 1, tile: [0.8, 2.4], bump: 0.010, rough: 0.62, alpha: true,
    build(s, cx) {
      const size = s.size;
      const oliveHex = MX(PAL.malachite, PAL.ochre, 0.42);
      const oliveLight = MX(oliveHex, PAL.sandLight, 0.45);
      const strawDry = MX(PAL.sandLight, PAL.ochre, 0.35);
      const ribHex = MX(PAL.sandLight, oliveHex, 0.40);
      const a = s.alpha();
      const leaflets = 13;
      const dry = s.field(3, (u, v) => sat(warpN(u, v, 6, 4, 1.2, cx.seed + 17) * 1.4 + 0.5));
      const fibre = s.field(1.5, (u, v) => fbmA(u, v, 160, 10, 3, 0.5, cx.seed + 5) * 0.5 + 0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const p = (u * leaflets) % 1;
          const d = Math.abs(p * 2 - 1);
          const idx = Math.floor(u * leaflets);
          const wid = 0.80 + (C.hash01(idx, 3, cx.seed) - 0.5) * 0.30;
          // Leaflets taper and part toward the tip, which is where the alpha gaps belong.
          const taperV = smoothstep(1.0, 0.62, v);
          const alive = sat(wid * taperV * 1.25 - d);
          const blade = smoothstep(0.0, 0.16, alive);
          a[i] = blade;
          const rib = sat(1 - d / 0.10);
          s.h[i] = 0.5 + Math.sqrt(sat(1 - d * d)) * 0.28 + rib * 0.18;
          const t = sat(0.42 + (fibre[i] - 0.5) * 0.6 + (C.hash01(idx, 7, cx.seed) - 0.5) * 0.5);
          const col = ramp3(0x2c5a34, oliveHex, oliveLight, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          // Sun-dried tips go straw-coloured — no palm in Egypt is uniformly green.
          const d2 = sat(dry[i] - 0.42) * 1.5 * smoothstep(0.3, 1.0, v);
          s.mixHex(i, strawDry, sat(d2) * 0.7);
          s.rough[i] = sat(0.55 + (1 - rib) * 0.16 + d2 * 0.2);
          s.occ[i] *= 0.86 + rib * 0.14;
        }
      }
      // Midrib of the whole frond, down the centre.
      for (let y = 0; y < size; y++) {
        const row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const dm = Math.abs(u - 0.5);
          const m = sat(1 - dm / 0.035);
          if (m <= 0) continue;
          a[i] = Math.max(a[i], m > 0.2 ? 1 : a[i]);
          s.h[i] += m * 0.30;
          s.mixHex(i, ribHex, m * 0.6);
        }
      }
      grain(s, { amount: 0.03, freq: 320, seed: cx.seed + 8, heightAmt: 0.006 });
    },
  },

  papyrus_reed: {
    group: 'organic', tier: 1, tile: 1.0, bump: 0.010, rough: 0.74,
    build(s, cx) {
      const size = s.size;
      s.fill(PAL.limeMid);
      // A papyrus sheet: two layers of split pith laid at right angles and beaten flat.
      const strips = 7;
      const fibre = s.field(1.5, (u, v) => fbmA(u, v, 180, 12, 3, 0.5, cx.seed + 3) * 0.5 + 0.5);
      const fibre2 = s.field(1.5, (u, v) => fbmA(u, v, 12, 180, 3, 0.5, cx.seed + 7) * 0.5 + 0.5);
      const stain = s.field(4, (u, v) => sat(warpN(u, v, 5, 4, 1.3, cx.seed + 11) * 1.4 + 0.5));
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const px = (u * strips) % 1, py = (v * strips) % 1;
          const ix = Math.floor(u * strips), iy = Math.floor(v * strips);
          const edgeX = sat(1 - Math.min(px, 1 - px) / 0.06);
          const edgeY = sat(1 - Math.min(py, 1 - py) / 0.06);
          const vert = C.hash01(ix, 0, cx.seed) > 0.5;
          const f = vert ? fibre[i] : fibre2[i];
          s.h[i] = 0.58 + (f - 0.5) * 0.26 - Math.max(edgeX, edgeY) * 0.18;
          const t = sat(0.44 + (f - 0.5) * 0.7 + (C.hash01(ix, iy, cx.seed + 1) - 0.5) * 0.35 + (stain[i] - 0.5) * 0.5);
          const col = ramp3(PAL.sandDark, PAL.limeMid, PAL.limeLight, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.rough[i] = sat(0.70 + (1 - f) * 0.12);
          s.occ[i] *= 1 - Math.max(edgeX, edgeY) * 0.20;
        }
      }
      const fib = fibreMask(size, Math.round(size * 0.7), 0.05, 0.0012, cx.seed + 19, 0.25);
      for (let i = 0; i < s.n; i++) if (fib[i] > 0.02) { s.mixHex(i, PAL.limeLight, fib[i] * 0.35); s.h[i] += fib[i] * 0.03; }
      weather(s, { seed: cx.seed + 6, crevice: 0x8a7250, creviceAmt: 0.35, streakAmt: 0.24, streakTint: 0x9a8256, dustAmt: 0.10, roughGrime: 0.06 });
      grain(s, { amount: 0.03, freq: 360, seed: cx.seed + 8, heightAmt: 0.006 });
    },
  },

  linen_cloth: {
    group: 'organic', tier: 1, tile: 0.55, bump: 0.006, rough: 0.80,
    build(s, cx) {
      s.fill(PAL.white); s.fillH(0.5);
      weave(s, { freq: 84, twill: 0, depth: 1.0, slub: 0.5, seed: cx.seed, fuzz: 0.03 });
      const fold = s.field(4, (u, v) => warpN(u, v, 4, 4, 1.3, cx.seed + 5) * 0.5 + 0.5);
      const dirt = s.field(4, (u, v) => sat(warpN(u, v, 6, 4, 1.2, cx.seed + 9) * 1.4 + 0.5));
      for (let i = 0; i < s.n; i++) {
        s.h[i] += (fold[i] - 0.5) * 0.5;                       // soft creases
        s.mixHex(i, PAL.limeMid, (1 - fold[i]) * 0.16);
        s.stainHex(i, 0xbba883, sat(dirt[i] - 0.5) * 0.6);
        s.rough[i] = sat(s.rough[i] + (1 - fold[i]) * 0.05);
      }
      const fib = fibreMask(s.size, Math.round(s.size * 0.5), 0.02, 0.0012, cx.seed + 15);
      for (let i = 0; i < s.n; i++) if (fib[i] > 0.02) { s.mixHex(i, PAL.limeLight, fib[i] * 0.3); s.h[i] += fib[i] * 0.04; }
      grain(s, { amount: 0.026, freq: 380, seed: cx.seed + 8, heightAmt: 0.004 });
    },
  },

  rope: {
    group: 'organic', tier: 1, tile: [0.28, 0.28], bump: 0.009, rough: 0.90,
    build(s, cx) {
      const size = s.size;
      const strands = 3, twist = 3;
      const fibre = s.field(1.5, (u, v) => fbmN(u, v, 160, 3, 0.5, cx.seed + 3) * 0.5 + 0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          // Helical lay: the strand phase advances along the rope.
          const p = ((u * strands + v * strands * twist) % 1 + 1) % 1;
          const d = p * 2 - 1;
          const bulge = Math.sqrt(sat(1 - d * d));
          const gap = sat(1 - Math.abs(d) / 0.12);
          s.h[i] = 0.34 + bulge * 0.52 - gap * 0.10 + (fibre[i] - 0.5) * 0.10;
          const t = sat(0.36 + bulge * 0.45 + (fibre[i] - 0.5) * 0.7);
          const col = ramp3(PAL.sandDark, PAL.sandMid, PAL.sandLight, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.rough[i] = sat(0.88 + (1 - bulge) * 0.08);
          s.occ[i] *= 0.72 + bulge * 0.28;
        }
      }
      // Loose fibres standing off the lay — the thing that makes rope read as rope.
      const fuzz = fibreMask(size, Math.round(size * 1.6), 0.02, 0.0014, cx.seed + 11, 0.6);
      for (let i = 0; i < s.n; i++) if (fuzz[i] > 0.02) { s.mixHex(i, PAL.sandLight, fuzz[i] * 0.45); s.h[i] += fuzz[i] * 0.06; }
      weather(s, { seed: cx.seed + 6, crevice: 0x4a3520, creviceAmt: 0.55, streakAmt: 0.10, dustAmt: 0.16, roughGrime: 0.05 });
      grain(s, { amount: 0.035, freq: 340, seed: cx.seed + 8, heightAmt: 0.008 });
    },
  },

  wood_old: {
    group: 'organic', tier: 1, tile: [1.0, 2.0], bump: 0.014, rough: 0.86,
    build(s, cx) {
      const size = s.size;
      const woodPale = MX(PAL.limeMid, PAL.sandLight, 0.5);
      // Weathered timber silvers off. Toward a warm neutral, not toward `PAL.shadow` — that is
      // the *lighting* shadow hue and it has no business being a pigment in a sunlit albedo.
      const silverHex = MX(PAL.limeDark, PAL.sandCrev, 0.34);
      const nailHex = MX(PAL.goldDark, PAL.black, 0.6);
      const knots = s.field(2, (u, v) => {
        const w = worleyN(u, v, 5, cx.seed + 13, 0.9);
        return w.id < 0.30 ? sat(1 - w.f1 / 0.20) : 0;
      });
      const warpF = s.field(2, (u, v) => warpN(u, v, 6, 4, 1.4, cx.seed + 3));
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          // Growth rings: distance along the grain, warped, then striped.
          const d = u * 7 + warpF[i] * 1.8 + knots[i] * 2.6;
          const ring = Math.abs(tri(d)) ;
          const hard = smoothstep(0.25, 0.95, ring);
          const t = sat(0.34 + hard * 0.5 + (warpF[i] * 0.5 + 0.5 - 0.5) * 0.4);
          const col = ramp3(0x3f2a1a, PAL.sandDark, woodPale, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          // Soft earlywood erodes away, leaving the hard rings standing proud.
          s.h[i] = 0.52 + hard * 0.28 - knots[i] * 0.10;
          s.rough[i] = sat(0.84 + (1 - hard) * 0.10);
        }
      }
      // Splits and checks run along the grain, never across it.
      const check = s.field(1.5, (u, v) => {
        const w = fbmA(u, v, 8, 96, 3, 0.5, cx.seed + 23);
        return sat(1 - Math.abs(w) / 0.05) ** 2;
      });
      const silver = s.field(4, (u, v) => sat(warpN(u, v, 5, 4, 1.2, cx.seed + 31) * 1.4 + 0.5));
      for (let i = 0; i < s.n; i++) {
        s.h[i] -= check[i] * 0.4;
        s.stainHex(i, 0x2a1a10, check[i] * 0.8);
        // Weathered timber silvers off: pale warm grey over the brown.
        s.mixHex(i, silverHex, sat(silver[i] - 0.4) * 0.45);
      }
      const nails = s.field(2, (u, v) => {
        const w = worleyN(u, v, 9, cx.seed + 41, 0.9);
        return w.id < 0.10 ? sat(1 - w.f1 / 0.055) ** 2 : 0;
      });
      for (let i = 0; i < s.n; i++) {
        if (nails[i] < 0.02) continue;
        s.mixHex(i, nailHex, nails[i] * 0.8);
        s.h[i] -= nails[i] * 0.25;
        s.metal[i] = nails[i] * 0.7;
        s.rough[i] = sat(s.rough[i] - nails[i] * 0.3);
      }
      weather(s, { source: check, seed: cx.seed + 6, crevice: 0x241609, creviceAmt: 0.55, streakAmt: 0.28, dustAmt: 0.14, roughGrime: 0.08 });
      grain(s, { amount: 0.03, freq: 330, seed: cx.seed + 8, heightAmt: 0.006 });
    },
  },

  nile_mud: {
    group: 'organic', tier: 1, tile: 1.9, bump: 0.024, rough: 0.92,
    build(s, cx) {
      const size = s.size;
      const mudPale = MX(PAL.sandLight, PAL.limeMid, 0.4);
      const silt = s.field(3, (u, v) => warpN(u, v, 11, 4, 1.1, cx.seed + 7) * 0.5 + 0.5);
      const damp = s.field(4, (u, v) => sat(warpN(u, v, 4, 4, 1.3, cx.seed + 19) * 1.5 + 0.5));
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const a = worleyN(u, v, 11, cx.seed, 0.9);
          const b = worleyN(u, v, 26, cx.seed + 3, 0.9);
          const eA = a.f2 - a.f1, eB = b.f2 - b.f1;
          const crackA = sat(1 - eA / 0.10), crackB = sat(1 - eB / 0.07) * 0.55;
          const crack = Math.max(crackA ** 1.6, crackB ** 1.8);
          // The plates curl: the edge lifts as the mud dried and shrank.
          const curl = sat(1 - eA / 0.34) ** 2 * 0.55 + sat(1 - eB / 0.22) ** 2 * 0.2;
          s.h[i] = 0.46 + curl * 0.34 - crack * 0.62 + (silt[i] - 0.5) * 0.10;
          const t = sat(0.36 + (a.id - 0.5) * 0.5 + (silt[i] - 0.5) * 0.55 + curl * 0.3);
          const col = ramp3(0x4a3520, 0x8a6a46, mudPale, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.stainHex(i, 0x2a1c10, crack * 0.85);
          // Still-damp hollows: darker, and much less rough.
          const w = sat(damp[i] - 0.55) * 1.4;
          s.stainHex(i, 0x3a2a18, w * 0.5);
          s.rough[i] = sat(0.94 - w * 0.42 + crack * 0.04);
        }
      }
      speckle(s, { freq: 300, seed: cx.seed + 11, colors: [[PAL.limeLight, 0.08, 0.2], [PAL.black, 0.05, 0.0]], heightDelta: 0.01 });
      weather(s, { seed: cx.seed + 6, crevice: 0x241608, creviceAmt: 0.5, streakAmt: 0.10, dustAmt: 0.14, streakDecay: 0.95 });
      grain(s, { amount: 0.04, freq: 320, seed: cx.seed + 8, heightAmt: 0.012 });
    },
  },

  /* ===================== Sly's character set ============================ */

  fur_sly: {
    group: 'sly', tier: 0, tile: 0.32, bump: 0.0038, rough: 0.62,
    build(s, cx) {
      // Sly is slate blue-grey: the shadow hue lifted toward the sky-bounce fill, then greyed.
      const base = MX(PAL.shadow, PAL.fill, 0.46);
      const baseGrey = MX(base, PAL.limeMid, 0.13);
      fur(s, {
        flow: -Math.PI / 2, flowVar: 0.7, strandFreq: 260, along: 0.16, clumpFreq: 14,
        base: baseGrey, tip: MX(baseGrey, PAL.limeLight, 0.55), root: 0x141c2e,
        rough: 0.60, seed: cx.seed, tipAmount: 0.60,
      });
      // Guard hairs: a sparser, longer, lighter layer over the undercoat.
      const guard = fibreMask(s.size, Math.round(s.size * 2.2), 0.055, 0.0011, cx.seed + 7, 0.30);
      const guardHex = MX(baseGrey, PAL.limeLight, 0.70);
      for (let i = 0; i < s.n; i++) {
        if (guard[i] < 0.02) continue;
        s.mixHex(i, guardHex, guard[i] * 0.45);
        s.h[i] += guard[i] * 0.10;
        s.rough[i] = sat(s.rough[i] - guard[i] * 0.10);
      }
      grain(s, { amount: 0.03, freq: 420, seed: cx.seed + 8, heightAmt: 0.010 });
    },
  },

  fur_tail_rings: {
    group: 'sly', tier: 1, tile: [0.34, 0.95], bump: 0.007, rough: 0.62,
    build(s, cx) {
      const base = rgb2hex(mixHex(PAL.shadow, PAL.fill, 0.46));
      // mixHex already takes hex ints, so `base` needs no conversion on the way back in.
      const baseGrey = rgb2hex(mixHex(base, PAL.limeMid, 0.13));
      const { strand } = fur(s, {
        flow: Math.PI / 2, flowVar: 0.35, strandFreq: 230, along: 0.14, clumpFreq: 12,
        base: baseGrey, tip: rgb2hex(mixHex(baseGrey, PAL.limeLight, 0.55)), root: 0x141c2e,
        rough: 0.60, seed: cx.seed, tipAmount: 0.62,
      });
      // Four rings along the tail. The band edge is displaced *by the strand field*, so hairs
      // cross the boundary and the rings get the soft ragged edge real fur has.
      const rings = 4;
      const size = s.size;
      const darkHex = MX(PAL.inkCool, PAL.shadow, 0.30);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x;
          const jitter = (strand[i] - 0.5) * 0.10 + nz((x + 0.5) / size, v, 6, cx.seed + 5) * 0.03;
          const p = ((v + jitter) * rings) % 1;
          const dark = smoothstep(0.06, 0.20, p) * (1 - smoothstep(0.44, 0.58, p));
          if (dark <= 0.01) continue;
          s.mixHex(i, darkHex, dark * (0.72 + strand[i] * 0.22));
          s.rough[i] = sat(s.rough[i] + dark * 0.06);
          s.occ[i] *= 1 - dark * 0.10;
        }
      }
      grain(s, { amount: 0.03, freq: 400, seed: cx.seed + 8, heightAmt: 0.010 });
    },
  },

  cloth_cap_blue: {
    group: 'sly', tier: 1, tile: 0.30, bump: 0.004, rough: 0.74,
    build(s, cx) {
      const capBlue = MX(PAL.lapis, PAL.sparkGlow, 0.45);
      const capFade = MX(capBlue, PAL.fill, 0.55), capDark = MX(capBlue, PAL.shadow, 0.55), capSeam = MX(capBlue, PAL.inkCool, 0.35);
      s.fill(capBlue); s.fillH(0.5);
      weave(s, { freq: 110, twill: 2, depth: 0.8, slub: 0.35, seed: cx.seed, fuzz: 0.04 });
      const fade = s.field(4, (u, v) => sat(warpN(u, v, 5, 4, 1.2, cx.seed + 5) * 1.4 + 0.5));
      const nap = s.field(2, (u, v) => fbmN(u, v, 30, 3, 0.5, cx.seed + 9) * 0.5 + 0.5);
      for (let i = 0; i < s.n; i++) {
        s.mixHex(i, capFade, sat(fade[i] - 0.45) * 0.40);   // sun-faded
        s.mixHex(i, capDark, (1 - nap[i]) * 0.22);
        s.rough[i] = sat(s.rough[i] + (1 - nap[i]) * 0.06);
      }
      // Stitched seams: a doubled ridge with a dotted needle line.
      const seams = rasterMask(s.size, (ctx) => {
        ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
        ctx.lineWidth = s.size * 0.012;
        for (const y of [0.30, 0.72]) {
          ctx.beginPath(); ctx.moveTo(-4, y * s.size); ctx.lineTo(s.size + 4, y * s.size); ctx.stroke();
        }
        ctx.lineWidth = s.size * 0.006;
        ctx.setLineDash([s.size * 0.020, s.size * 0.016]);
        for (const y of [0.275, 0.325, 0.695, 0.745]) {
          ctx.beginPath(); ctx.moveTo(-4, y * s.size); ctx.lineTo(s.size + 4, y * s.size); ctx.stroke();
        }
        ctx.setLineDash([]);
      });
      for (let i = 0; i < s.n; i++) {
        if (seams[i] < 0.02) continue;
        s.h[i] += seams[i] * 0.35;
        s.mixHex(i, capSeam, seams[i] * 0.35);
      }
      grain(s, { amount: 0.024, freq: 420, seed: cx.seed + 8, heightAmt: 0.004 });
    },
  },

  cloth_shirt_blue: {
    group: 'sly', tier: 1, tile: 0.42, bump: 0.004, rough: 0.70,
    build(s, cx) {
      const shirt = MX(PAL.lapis, PAL.shadow, 0.22);
      const shLit = MX(shirt, PAL.fill, 0.4), shDark = MX(shirt, PAL.inkCool, 0.5), shWear = MX(shirt, PAL.limeMid, 0.30);
      s.fill(shirt); s.fillH(0.5);
      weave(s, { freq: 150, twill: 3, depth: 0.55, slub: 0.22, seed: cx.seed, fuzz: 0.05 });
      const fold = s.field(4, (u, v) => warpN(u, v, 4, 4, 1.4, cx.seed + 3) * 0.5 + 0.5);
      const wear = s.field(3, (u, v) => sat(warpN(u, v, 8, 4, 1.2, cx.seed + 11) * 1.4 + 0.5));
      for (let i = 0; i < s.n; i++) {
        s.h[i] += (fold[i] - 0.5) * 0.7;
        s.mixHex(i, shLit, sat(fold[i] - 0.55) * 0.35);
        s.mixHex(i, shDark, (1 - fold[i]) * 0.30);
        s.mixHex(i, shWear, sat(wear[i] - 0.62) * 0.35);  // rubbed nap
        s.rough[i] = sat(s.rough[i] - sat(fold[i] - 0.6) * 0.10);
      }
      grain(s, { amount: 0.022, freq: 420, seed: cx.seed + 8, heightAmt: 0.003 });
    },
  },

  leather_boot: {
    group: 'sly', tier: 1, tile: 0.28, bump: 0.0042, rough: 0.62,
    build(s, cx) {
      const size = s.size;
      const hide = MX(PAL.black, PAL.sandDark, 0.42);
      const scuffHex = MX(PAL.sandDark, PAL.limeMid, 0.35), weltHex = MX(PAL.sandLight, PAL.sandDark, 0.4);
      const pebble = s.field(1.5, (u, v) => {
        const w = worleyN(u, v, 52, cx.seed, 1.0);
        return sat(1 - w.f1 / (0.42 + w.id * 0.2));
      });
      const crease = s.field(2, (u, v) => {
        const w = fbmA(u, v, 24, 16, 4, 0.55, cx.seed + 7);
        return sat(1 - Math.abs(w) / 0.10) ** 2;
      });
      const scuff = s.field(3, (u, v) => sat(warpN(u, v, 9, 4, 1.3, cx.seed + 13) * 1.4 + 0.5));
      for (let i = 0; i < s.n; i++) {
        const p = pebble[i];
        s.h[i] = 0.55 + p * p * 0.30 - crease[i] * 0.34;
        s.setHex(i, hide);
        s.mul(i, 0.82 + p * 0.34);
        s.stainHex(i, PAL.inkWarm, crease[i] * 0.55);
        // Scuffed leather goes pale and matte on the high points.
        const sc = sat(scuff[i] - 0.55) * 1.4 * sat(p * 1.3);
        s.mixHex(i, scuffHex, sc * 0.45);
        s.rough[i] = sat(0.52 + (1 - p) * 0.20 + sc * 0.30 + crease[i] * 0.10);
      }
      // Welt stitching around the sole.
      const st = rasterMask(size, (ctx) => {
        ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
        ctx.lineWidth = size * 0.010;
        ctx.setLineDash([size * 0.024, size * 0.018]);
        for (const y of [0.12, 0.86]) { ctx.beginPath(); ctx.moveTo(-4, y * size); ctx.lineTo(size + 4, y * size); ctx.stroke(); }
        ctx.setLineDash([]);
      });
      for (let i = 0; i < s.n; i++) {
        if (st[i] < 0.02) continue;
        s.h[i] += st[i] * 0.30;
        s.mixHex(i, weltHex, st[i] * 0.55);
        s.rough[i] = sat(s.rough[i] + st[i] * 0.15);
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x120c08, creviceAmt: 0.5, streakAmt: 0.16, dustAmt: 0.18, dust: PAL.sandLight, roughGrime: 0.10 });
      grain(s, { amount: 0.024, freq: 400, seed: cx.seed + 8, heightAmt: 0.005 });
    },
  },

  gold_cane: {
    group: 'sly', tier: 1, tile: [0.16, 0.70], bump: 0.004, rough: 0.22,
    build(s, cx) {
      const size = s.size;
      s.metal.fill(1);
      // Cast-and-polished brass: a lathe-turned shaft with engraved rings and handling wear.
      const polish = s.field(1.5, (u, v) => fbmA(u, v, 8, 120, 3, 0.5, cx.seed + 3) * 0.5 + 0.5);
      const macro = s.field(4, (u, v) => warpN(u, v, 5, 4, 1.2, cx.seed + 11) * 0.5 + 0.5);
      const rings = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff';
        const rnd = rng(cx.seed >>> 0);
        for (let k = 0; k < 5; k++) {
          const y = (0.10 + k * 0.20 + rnd.jitter(0.02)) * size;
          ctx.fillRect(-4, y, size + 8, size * 0.020);
          ctx.fillRect(-4, y + size * 0.034, size + 8, size * 0.010);
        }
      });
      const ringSoft = blurWrap(rings, size, Math.max(1, Math.round(size / 260)), 2);
      for (let i = 0; i < s.n; i++) {
        const t = sat(0.52 + (polish[i] - 0.5) * 0.9 + (macro[i] - 0.5) * 0.4);
        const col = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, t);
        s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
        s.h[i] = 0.66 - ringSoft[i] * 0.45 + (polish[i] - 0.5) * 0.06;
        // Streaked polish along the length; the grain of the buffing wheel.
        s.rough[i] = sat(0.16 + (1 - polish[i]) * 0.14 + ringSoft[i] * 0.22 + sat(macro[i] - 0.6) * 0.25);
        s.mixHex(i, PAL.goldDark, ringSoft[i] * 0.45);
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x4a3410, creviceAmt: 0.55, streakAmt: 0.10, dustAmt: 0.06, dust: PAL.limeMid, roughGrime: 0.12, downDark: 0.08, patina: 0.05 });
      grain(s, { amount: 0.014, freq: 400, seed: cx.seed + 8, heightAmt: 0.003 });
    },
  },

  mask_black: {
    group: 'sly', tier: 1, tile: 0.20, bump: 0.003, rough: 0.66,
    build(s, cx) {
      const inkMix = MX(PAL.inkWarm, PAL.inkCool, 0.55);
      const sheenHex = MX(PAL.shadow, PAL.inkCool, 0.55);
      s.fill(inkMix); s.fillH(0.5);
      weave(s, { freq: 190, twill: 2, depth: 0.5, slub: 0.2, seed: cx.seed, fuzz: 0.05 });
      const sheen = s.field(3, (u, v) => warpN(u, v, 10, 4, 1.1, cx.seed + 5) * 0.5 + 0.5);
      for (let i = 0; i < s.n; i++) {
        // Never flat black: the mask has to read against the black ink outline around it.
        s.mixHex(i, sheenHex, sheen[i] * 0.32);
        s.rough[i] = sat(0.60 + (1 - sheen[i]) * 0.16);
      }
      grain(s, { amount: 0.03, freq: 440, seed: cx.seed + 8, heightAmt: 0.003 });
    },
  },

  /* ===================== effects ======================================== */

  dust_soft: {
    group: 'fx', tier: 2, tile: 0.5, bump: 0.001, rough: 0.9, clamp: true, alpha: true, sprite: true,
    build(s, cx) {
      const size = s.size, a = s.alpha();
      s.fillH(0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const dx = u - 0.5, dy = v - 0.5;
          const d = Math.sqrt(dx * dx + dy * dy) * 2;
          // Non-periodic fBm is fine here: the sprite is clamp-wrapped, there is no seam.
          const n = warpedFbm2(u * 5, v * 5, { octaves: 4, seed: cx.seed });
          const edge = sat(1 - d * (1 + n * 0.35));
          a[i] = edge * edge * (0.55 + n * 0.35);
          const t = sat(0.4 + n * 0.8 + (1 - d) * 0.4);
          const col = ramp3(PAL.sandDark, PAL.sandMid, PAL.sandLight, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.h[i] = 0.5 + edge * 0.2;
          s.rough[i] = 0.95;
        }
      }
    },
  },

  spark_diamond: {
    group: 'fx', tier: 2, tile: 0.35, bump: 0.001, rough: 0.4, clamp: true, alpha: true, emissive: true, sprite: true,
    build(s, cx) {
      // Sly's signature: a four-point diamond twinkle, white-hot core, cyan spikes, blue halo.
      const size = s.size, a = s.alpha();
      const [er, eg, eb] = s.emissive();
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
          const r = Math.sqrt(dx * dx + dy * dy);
          // Four long spikes on the axes plus four short ones on the diagonals.
          const ax = sat(1 - Math.abs(dy) / (0.055 + Math.abs(dx) * 0.16)) * sat(1 - Math.abs(dx));
          const ay = sat(1 - Math.abs(dx) / (0.055 + Math.abs(dy) * 0.16)) * sat(1 - Math.abs(dy));
          const d1 = (dx + dy) * 0.7071, d2 = (dx - dy) * 0.7071;
          const bx = sat(1 - Math.abs(d2) / (0.05 + Math.abs(d1) * 0.20)) * sat(1 - Math.abs(d1) * 2.1);
          const by = sat(1 - Math.abs(d1) / (0.05 + Math.abs(d2) * 0.20)) * sat(1 - Math.abs(d2) * 2.1);
          const spikes = Math.max(ax, ay) ** 1.5 + 0.55 * Math.max(bx, by) ** 1.7;
          const core = sat(1 - r / 0.20) ** 2.2;
          const halo = sat(1 - r / 0.86) ** 3.0;
          const alpha = sat(spikes * 0.95 + core * 1.25 + halo * 0.42);
          a[i] = alpha;
          const t = sat(core * 1.5 + spikes * 0.75);
          const col = t > 0.6 ? mixHex(PAL.sparkCore, PAL.goldSpec, sat((t - 0.6) * 2.5))
                              : mixHex(PAL.sparkGlow, PAL.sparkCore, sat(t / 0.6));
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          er[i] = col[0] * alpha * 1.0; eg[i] = col[1] * alpha; eb[i] = col[2] * alpha;
          s.h[i] = 0.5 + alpha * 0.1;
          s.rough[i] = 0.35;
        }
      }
    },
  },

  torch_flame: {
    group: 'fx', tier: 2, tile: 0.5, bump: 0.002, rough: 0.5, clamp: true, alpha: true, emissive: true, sprite: true,
    build(s, cx) {
      const size = s.size, a = s.alpha();
      const [er, eg, eb] = s.emissive();
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          // Teardrop: wide and round at the base, pinched to a tip at the top.
          const width = 0.34 * Math.sin(Math.PI * sat(v * 0.92 + 0.04)) ** 0.7 * (1.15 - v * 0.45);
          const dx = Math.abs(u - 0.5);
          const turb = warpedFbm2(u * 7, v * 3.2 - 1.5, { octaves: 5, seed: cx.seed }) * (0.09 + v * 0.20);
          const body = sat(1 - (dx + turb * 0.6) / Math.max(0.02, width));
          const f = body ** 1.25 * smoothstep(0.0, 0.10, v) * (1 - smoothstep(0.72, 1.0, v) * 0.85);
          a[i] = sat(f * 1.25);
          const heat = sat(f * 1.35 - v * 0.55 + 0.12);
          const col = heat > 0.62 ? mixHex(PAL.goldLight, PAL.goldSpec, sat((heat - 0.62) * 2.6))
                    : heat > 0.32 ? mixHex(PAL.ochre, PAL.goldLight, sat((heat - 0.32) * 3.3))
                                  : mixHex(PAL.red, PAL.ochre, sat(heat * 3.1));
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          const e = sat(f * 1.6);
          er[i] = col[0] * e; eg[i] = col[1] * e * 0.92; eb[i] = col[2] * e * 0.7;
          s.h[i] = 0.5 + f * 0.25;
          s.rough[i] = 0.5;
        }
      }
    },
  },

  light_shaft: {
    group: 'fx', tier: 2, tile: 1.0, bump: 0.001, rough: 0.9, clamp: true, alpha: true, emissive: true, sprite: true,
    build(s, cx) {
      const size = s.size, a = s.alpha();
      const [er, eg, eb] = s.emissive();
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          // A god-ray billboard: brightest and tightest at the aperture (v=1), spreading and
          // fading as it falls. Striations sell it as light through dust, not a gradient.
          const spread = 0.16 + (1 - v) * 0.34;
          const dx = Math.abs(u - 0.5) / spread;
          const core = sat(1 - dx) ** 2.0;
          const stri = 0.72 + 0.28 * (warpedFbm2(u * 9, v * 1.4, { octaves: 3, seed: cx.seed }) * 0.5 + 0.5);
          const fall = smoothstep(0.0, 0.42, v) * (0.35 + v * 0.65);
          const alpha = sat(core * fall * stri * 0.85);
          a[i] = alpha;
          const col = mixHex(PAL.haze, PAL.sun, sat(core * 0.9 + v * 0.3));
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          er[i] = col[0] * alpha; eg[i] = col[1] * alpha; eb[i] = col[2] * alpha;
          s.h[i] = 0.5;
          s.rough[i] = 0.95;
        }
      }
    },
  },

  water_nile: {
    group: 'fx', tier: 0, tile: 6.0, bump: 0.030, rough: 0.09, animate: true,
    build(s, cx) {
      const size = s.size;
      // Three crossing swell trains plus a fine chop. The normal map is the whole point here.
      const swell = s.field(1, (u, v) => {
        let h = 0;
        h += Math.sin((u * 3 + v * 1.2) * Math.PI * 2 + fbmN(u, v, 5, 3, 0.5, cx.seed) * 2.2) * 0.5;
        h += Math.sin((u * -1.6 + v * 4.1) * Math.PI * 2 + fbmN(u, v, 7, 3, 0.5, cx.seed + 3) * 2.4) * 0.34;
        h += Math.sin((u * 5.2 + v * -3.4) * Math.PI * 2 + fbmN(u, v, 9, 3, 0.5, cx.seed + 7) * 2.0) * 0.22;
        return h;
      });
      const chop = s.field(1, (u, v) => fbmN(u, v, 40, 4, 0.55, cx.seed + 11));
      const scum = s.field(3, (u, v) => sat(warpN(u, v, 6, 4, 1.3, cx.seed + 17) * 1.4 + 0.5));
      const deep = MX(PAL.lapis, PAL.shadow, 0.35);
      const siltHex = MX(PAL.malachite, PAL.sandDark, 0.45);
      for (let i = 0; i < s.n; i++) {
        s.h[i] = 0.5 + swell[i] * 0.30 + chop[i] * 0.14;
        const t = sat(0.5 + swell[i] * 0.45 + chop[i] * 0.3);
        const col = ramp3(deep, PAL.lapis, PAL.turquoise, t);
        s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
        s.rough[i] = sat(0.07 + sat(chop[i]) * 0.06);
        // Nile silt and river scum: the water is not a swimming pool.
        const sc = sat(scum[i] - 0.58) * 1.5;
        s.mixHex(i, siltHex, sc * 0.35);
        s.rough[i] = sat(s.rough[i] + sc * 0.30);
        s.occ[i] = 1;
      }
    },
  },

  decal_crack: {
    group: 'fx', tier: 1, tile: 1.2, bump: 0.014, rough: 0.92, clamp: true, alpha: true,
    build(s, cx) {
      const size = s.size, a = s.alpha();
      const rnd = rng(cx.seed >>> 0);
      // A real branching fracture, walked rather than noised — noise gives you veins, not cracks.
      const mask = rasterMask(size, (ctx) => {
        ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
        const walk = (x, y, ang, len, wid, depth) => {
          let px = x, py = y, a2 = ang;
          const steps = Math.max(3, Math.round(len / (size * 0.03)));
          for (let i = 0; i < steps; i++) {
            a2 += rnd.jitter(0.55);
            const nx2 = px + Math.cos(a2) * (len / steps), ny2 = py + Math.sin(a2) * (len / steps);
            ctx.lineWidth = Math.max(size * 0.0015, wid * (1 - i / steps));
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx2, ny2); ctx.stroke();
            px = nx2; py = ny2;
            if (depth > 0 && rnd() < 0.22) walk(px, py, a2 + rnd.sign() * (0.5 + rnd() * 0.7), len * 0.45, wid * 0.55, depth - 1);
          }
        };
        walk(size * 0.5, size * 0.06, Math.PI / 2 + rnd.jitter(0.4), size * 0.9, size * 0.020, 2);
        walk(size * 0.5, size * 0.5, rnd.jitter(3), size * 0.4, size * 0.012, 1);
      });
      const soft = blurWrap(mask, size, Math.max(1, Math.round(size / 200)), 2);
      const wide = blurWrap(mask, size, Math.max(2, Math.round(size / 60)), 2);
      for (let i = 0; i < s.n; i++) {
        const m = sat(mask[i] * 1.4), sm = soft[i], w = wide[i];
        // Alpha covers the crack plus the chipped shoulder; the shoulder is *lighter* (fresh stone).
        a[i] = sat(m * 1.2 + sm * 0.9 + w * 1.6);
        s.h[i] = 0.62 - m * 0.55 - sm * 0.25 + sat(w * 2.2 - sm * 1.2) * 0.12;
        const t = sat(0.55 - m * 0.9 + sat(w * 3 - sm * 2) * 0.5);
        const col = ramp3(PAL.sandCrev, PAL.sandDark, PAL.limeLight, t);
        s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
        s.rough[i] = sat(0.90 + m * 0.08);
        s.occ[i] = 1 - sat(m * 0.8 + sm * 0.5) * 0.75;
      }
    },
  },

  decal_stain: {
    group: 'fx', tier: 1, tile: 1.6, bump: 0.004, rough: 0.9, clamp: true, alpha: true,
    build(s, cx) {
      const size = s.size, a = s.alpha();
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const n = warpedFbm2(u * 3.4, v * 3.4, { octaves: 5, seed: cx.seed, warp: 1.1 });
          const dx = (u - 0.5) * 2.05, dy = (v - 0.62) * 2.4;
          const body = sat(1 - Math.sqrt(dx * dx + dy * dy) * (0.9 + n * 0.55));
          // Drips run downward out of the blob: v is up, so the runs go to lower v.
          const drip = sat((1 - v) * 1.5) * sat(0.55 + warpedFbm2(u * 22, v * 1.6, { octaves: 3, seed: cx.seed + 5 }) * 1.6);
          const stain = sat(body * 1.3 + body * drip * 1.1 - 0.10);
          a[i] = stain * stain * 0.92;
          const t = sat(0.42 + n * 0.7);
          const col = ramp3(0x241a10, 0x4a3520, 0x6a5238, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.h[i] = 0.5 + stain * 0.10;
          s.rough[i] = sat(0.88 + stain * 0.10);
          s.occ[i] = 1 - stain * 0.25;
        }
      }
    },
  },
};

/* ========================================================================= */
/*  recipe bodies too long to inline                                         */
/* ========================================================================= */

/** Wind-rippled sand. Ripples are asymmetric: a long windward slope and a short steep lee face. */
function sand(s, cx, o = {}) {
  const { ripple = 1, rippleFreq = 15, grainFreq = 300, tone = 0, wet = false, microH = 1, tileMetres = 2.6 } = o;
  const size = s.size;
  const dune = s.field(5, (u, v) => warpN(u, v, 3, 4, 1.3, cx.seed + 3));
  const fineF = s.field(1.5, (u, v) => fbmN(u, v, 60, 4, 0.55, cx.seed + 11) * 0.5 + 0.5);
  /* Sand is not one colour at metre scale even though it is one colour at grain scale: heavy
   * dark minerals (magnetite, ilmenite) concentrate where the wind sorts them, and the crests
   * the wind works hardest are bleached pale. This is the only *low-frequency* term in the
   * material and it is warm on both ends — the crest tint is a bleached ochre, not a white, so
   * the pale end of the dune cannot drift toward neutral. */
  const sort = s.field(4, (u, v) => sat(warpN(u, v, 4, 4, 1.25, cx.seed + 401) * 1.3 + 0.5));
  const heavyHex = tintAtValue(PAL.sandMid, PAL.carnelian, 0.30);
  // Bleached, not blanched: toward the sun's own `#ffd9a0`, so the pale end of the dune stays a
  // warm ochre. Toward `limeLight` it drifted to cream, which is the neutral this material has
  // to keep out of at all costs — it is the warmest surface in the game.
  const bleachHex = tintAtValue(PAL.sandLight, PAL.sun, 0.42);
  const pw = {};
  // Pebble scale follows the tile: a 24 cm cobble lying on a dune crest was an artefact of this
  // helper being written for a 2.6 m tile and then used on a 9.6 m one.
  const pebFreq = Math.max(24, Math.round(40 * (tileMetres / 2.6)));
  const pebble = s.field(2, (u, v) => {
    const w = worleyN(u, v, pebFreq, cx.seed + 19, 1.0, pw);
    return w.id < 0.07 ? sat(1 - w.f1 / 0.10) ** 1.5 : 0;
  });
  /* One prevailing wind direction, plus a weaker secondary train whose interference makes the
   * crests fork and die out. Integer frequency vectors keep it seamless.
   *
   * **The secondary train was 66° off the primary, and that is a cross-hatch, not a ripple
   * field.** Two nearly-perpendicular sawtooths multiply into a lattice of short segments, and
   * once the map was applied at its true 9.6 m scale those segments landed at a few pixels each
   * and rendered as a rash of discrete dashes — a stitched-fabric look, not sand. Real
   * secondary ripple trains sit within about 20° of the prevailing one; at 16° the two beat
   * *along* the crest instead of across it, which is what makes a crest line run for metres and
   * then fork and die. The phase warp comes down for the same reason: at 0.55 of a wavelength
   * it was chopping crests into pieces shorter than they were wide. */
  const [P1, Q1] = freqVec(rippleFreq, 0.32);
  const [P2, Q2] = freqVec(Math.round(rippleFreq * 0.72), 0.32 + 0.28);
  const wander = s.field(2, (u, v) => warpN(u, v, 5, 4, 1.5, cx.seed + 23));
  const wander2 = s.field(3, (u, v) => warpN(u, v, 8, 3, 1.2, cx.seed + 29));
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size, row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x, u = (x + 0.5) / size;
      // Phase warp: enough to make crests meander, not enough to cut them into dashes.
      const ph = P1 * u + Q1 * v + wander[i] * 0.30 + dune[i] * 0.45;
      const pp = ((ph % 1) + 1) % 1;
      // Asymmetric sawtooth: 0.68 windward rise, 0.32 steep lee face.
      const asym = pp < 0.68 ? pp / 0.68 : 1 - (pp - 0.68) / 0.32;
      const ph2 = P2 * u + Q2 * v + wander2[i] * 0.5;
      const pp2 = ((ph2 % 1) + 1) % 1;
      const asym2 = pp2 < 0.6 ? pp2 / 0.6 : 1 - (pp2 - 0.6) / 0.4;
      const crest = sat(Math.pow(asym, 1.15) * 0.84 + Math.pow(asym2, 1.35) * 0.20);
      const h = 0.42 + crest * 0.40 * ripple + dune[i] * 0.22 + (fineF[i] - 0.5) * 0.10;
      s.h[i] = h + pebble[i] * 0.10;
      /* Crests are wind-polished pale and troughs hold the coarser dark grains — but only just.
       * The ripple used to swing the ramp position by ±0.42, i.e. from `sandDark` to
       * `sandLight`, which painted the ripple pattern into the albedo at full strength. That is
       * what made the dunes read as "bright salmon and white in horizontal wavy stripes… marbled
       * endpaper or streaky bacon": a painted stripe stays put when the terrain turns, so it
       * follows the image plane instead of the dune's form, and the actual form disappears.
       * Sand is very close to one colour. You see a ripple because of the shadow in its lee,
       * which is the height field's job — so the ripple keeps all of its relief and a quarter of
       * its paint. */
      const t = sat(0.40 + crest * 0.11 * ripple + dune[i] * 0.22 + (fineF[i] - 0.5) * 0.30
        + (sort[i] - 0.5) * 0.26 + tone);
      const col = ramp3(PAL.sandDark, PAL.sandMid, PAL.sandLight, t);
      s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
      // Mineral sorting: the metre-scale hue term. Signed, so the mean sand colour is unmoved.
      const so = sort[i] - 0.5;
      if (so > 0) s.mixHex(i, bleachHex, sat(so * 1.9) * 0.34 * (0.5 + crest * 0.9));
      else s.mixHex(i, heavyHex, sat(-so * 1.9) * 0.40);
      s.rough[i] = sat(0.95 - crest * 0.05);
      if (pebble[i] > 0.01) {
        s.mixHex(i, MX(PAL.limeMid, PAL.sandCrev, 0.35 + pebble[i] * 0.3), pebble[i] * 0.7);
        s.rough[i] = sat(s.rough[i] - pebble[i] * 0.20);
      }
    }
  }
  if (wet) {
    // Saturated sand: darker, smoother, with a tide-line of dried salt and silt.
    const damp = s.field(4, (u, v) => sat(warpN(u, v, 4, 4, 1.3, cx.seed + 31) * 1.5 + 0.55));
    for (let i = 0; i < s.n; i++) {
      const w = sat(damp[i] * 1.2);
      s.stainHex(i, 0x5a3a22, w * 0.55);
      s.rough[i] = sat(s.rough[i] - w * 0.52);
      s.h[i] = lerp(s.h[i], 0.5, w * 0.35);              // water flattens the ripples
      s.mixHex(i, PAL.white, sat(damp[i] - 0.42) * sat(0.62 - damp[i]) * 2.2 * 0.5);
    }
    speckle(s, { freq: 220, seed: cx.seed + 41, colors: [[PAL.white, 0.07, 0.3], [PAL.black, 0.04, 0.0]], heightDelta: 0.02 });
  }
  /* Individual grains catching the low sun. `PAL.goldSpec` was the wrong hex for this: at
   * `#fffbe8` it is a near-neutral white, and at 5% density mixed up to 90% it put white dots
   * across the whole dune. Up close they are glints; averaged by a mip they are a desaturating
   * film over the warmest surface in the game. A quartz grain lit by a 22° sun is the colour of
   * the *sun*, not of paper — `PAL.sun` (#ffd9a0) at lower density keeps the sparkle and takes
   * the neutral out of the average. `heightAmt` also comes down on the ripple map, where this
   * noise is the only thing the terrain reads (it takes the normal, not the albedo) and 0.05 of
   * range at 7 cm cells was fizz on top of the ripples rather than grain in them. */
  grain(s, { amount: 0.048, freq: grainFreq, seed: cx.seed + 8, heightAmt: 0.05 * microH });
  speckle(s, {
    freq: Math.round(grainFreq * 0.8), seed: cx.seed + 43,
    colors: [[MX(PAL.sun, PAL.goldSpec, 0.35), 0.035, 0.20], [PAL.sandDark, 0.05, 0.0]],
    heightDelta: 0.03 * microH,
  });
  weather(s, {
    seed: cx.seed + 6, crevice: PAL.sandDark, creviceAmt: 0.34, streakAmt: 0.0,
    dustAmt: 0.20, dust: PAL.sandLight, downDark: 0.10, roughGrime: 0.02,
    // Sand has no skin to grow a patina on — it is replaced by the wind every season.
    patina: 0,
  });
}

/** Semi-precious stone set in gold cloisonné cells. */
function inlay(s, cx, stoneHex, veinHex, fleckHex, fleckAmt) {
  const size = s.size;
  const { wallMask, soft } = cloisonne(s, { rows: 6, seed: cx.seed, wall: 0.05 });
  const veins = s.field(2, (u, v) => {
    const w = fbmN(u, v, 34, 4, 0.55, cx.seed + 7);
    return sat(1 - Math.abs(w) / 0.14) ** 1.6;
  });
  const cloud = s.field(3, (u, v) => warpN(u, v, 14, 4, 1.1, cx.seed + 11) * 0.5 + 0.5);
  const polish = s.field(2, (u, v) => fbmN(u, v, 34, 3, 0.5, cx.seed + 17) * 0.5 + 0.5);
  const stoneDeep = MX(stoneHex, PAL.inkCool, 0.42);
  const stoneLight = MX(stoneHex, PAL.white, 0.30);
  for (let i = 0; i < s.n; i++) {
    const t = sat(0.44 + (cloud[i] - 0.5) * 1.1 + (polish[i] - 0.5) * 0.35);
    const col = ramp3(stoneDeep, stoneHex, stoneLight, t);
    s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
    s.mixHex(i, veinHex, veins[i] * 0.55);                       // calcite / matrix veining
    // Domed cabochon: each cell's stone is polished slightly convex.
    s.h[i] = 0.52 + (1 - soft[i]) * 0.10 + (cloud[i] - 0.5) * 0.06 - veins[i] * 0.03;
    s.rough[i] = sat(0.30 + (1 - polish[i]) * 0.16 + veins[i] * 0.20);
    s.metal[i] = 0;
    const g = sat(soft[i] * 1.35);
    if (g > 0.02) {
      const gt = sat(0.5 + (polish[i] - 0.5) * 0.9);
      const gc = ramp3(PAL.goldDark, PAL.goldMid, PAL.goldLight, gt);
      s.r[i] += (gc[0] - s.r[i]) * g; s.g[i] += (gc[1] - s.g[i]) * g; s.b[i] += (gc[2] - s.b[i]) * g;
      s.metal[i] = g;
      s.rough[i] = lerp(s.rough[i], 0.20, g);
      s.h[i] += g * 0.34;                                        // the cell wall stands proud
    }
  }
  if (fleckAmt > 0) {
    speckle(s, { freq: 260, seed: cx.seed + 23, colors: [[fleckHex, fleckAmt * 0.35, 0.4]], mask: (() => {
      const m = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) m[i] = 1 - sat(soft[i] * 1.4);
      return m;
    })() });
  }
  weather(s, { seed: cx.seed + 6, crevice: 0x0e1424, creviceAmt: 0.45, streakAmt: 0.10, dustAmt: 0.10, dust: PAL.limeMid, roughGrime: 0.10 });
  grain(s, { amount: 0.016, freq: 380, seed: cx.seed + 8, heightAmt: 0.004 });
}

/* ------------------------------------------------------------------------- */
/*  wall compositions (canvas layouts)                                       */
/* ------------------------------------------------------------------------- */

/**
 * A tiling wall of text: one tall register of vertical glyph columns and one short frieze
 * register, separated by incised rules, with a cartouche interrupting one column. Register rules
 * sit exactly on the tile seam so the repeat is hidden inside a line that is supposed to be there.
 *
 * **Negative space is the point.** This used to fill both halves of the tile edge-to-edge with
 * dense glyph columns; at a 2.6 m tile that put seven or eight repeats of wall-to-wall text on a
 * 20 m pylon, and the frame lost its large shapes to what read as patterned static. A real temple
 * wall is mostly *plain dressed stone* with the carving concentrated into bands — which is also
 * what AGENTS §2.3 means by "colour blocking, detail concentrated at focal points". `plain` is the
 * fraction of the tile left as bare wall (the ashlar underneath still carries grain and grime, so
 * it is never a dead flat area).
 */
function glyphWall(ctx, size, mode, seed, o = {}) {
  /* `cols` and `tall` together set how much of a temple wall is *writing* and how much is plain
   * dressed stone, and they are the strongest control this file has over §7.3's squint test.
   *
   * At 4 columns over 53% of the tile height the hypostyle walls came out as an unbroken lattice
   * of small bright cells each holding one coloured mark — the review's "wall of postage stamps"
   * — and the architecture behind it stopped reading, because every square metre carried the same
   * maximum-frequency detail and nothing was left for the eye to rest on. Three wider columns
   * over 40% of the tile gives the same amount of *inscription* in larger, more legible signs,
   * and leaves the majority of the wall as plain stone, which is what §2.3 means by "large
   * simple areas of colour, detail concentrated at focal points" and what makes the carving read
   * as carving rather than as pattern. */
  const { cols = 3, cartouche = true, tall = 0.30, frieze = 0.10 } = o;
  const rule = size * 0.010;
  const rnd = rng((seed ^ 0x5eed) >>> 0);
  HG.registerRule(ctx, size, 0, rule, mode);
  HG.registerRule(ctx, size, size, rule, mode);

  const pitch = size / cols;
  const margin = pitch * 0.12;
  const cartCol = cartouche ? Math.floor(rnd() * cols) : -1;

  /* Band 0 — the tall text register, sitting just under the top rule. */
  {
    const y0 = size * 0.055;
    const y1 = y0 + size * tall;
    HG.registerRule(ctx, size, y1 + size * 0.020, rule, mode);
    for (let c = 0; c <= cols; c++) HG.columnRule(ctx, size, c * pitch, rule * 0.6, y0, y1, mode);
    for (let c = 0; c < cols; c++) {
      const x = c * pitch + margin;
      const w = pitch - margin * 2;
      if (c === cartCol) {
        const ch = Math.min((y1 - y0) * 0.58, w * 2.5);
        HG.cartouche(ctx, x, y0, w, ch, seed + c * 31, mode);
        HG.columnRegister(ctx, x, y0 + ch + size * 0.014, w, y1 - y0 - ch - size * 0.014, seed + c * 17, HG.POOLS.offering, mode);
      } else {
        const pool = c % 2 ? HG.POOLS.divine : HG.POOLS.offering;
        HG.columnRegister(ctx, x, y0, w, y1 - y0, seed + c * 17, pool, mode);
      }
    }
  }

  /* Band 1 — a single short frieze low on the wall, with plain stone above and below it. Two
   * bands of unequal weight give the eye somewhere to rest and read as deliberate; two equal
   * bands read as wallpaper. */
  {
    const y0 = size * (0.055 + tall + 0.215);
    const y1 = y0 + size * frieze;
    HG.registerRule(ctx, size, y0 - size * 0.020, rule, mode);
    HG.rowRegister(ctx, 0, y0, size, y1 - y0, seed + 907, HG.POOLS.divine, mode);
    // A painted stripe under the frieze. Purely horizontal, one repeat per tile: it puts colour
    // and an edge back on the plain area without giving the eye anything to resolve, which is
    // the only kind of detail a large wall can carry and still hold its shape when you squint.
    HG.paintedBand(ctx, -2, y1 + size * 0.020, size + 4, size * 0.045, mode,
      [PAL.ochre, PAL.red, PAL.white, PAL.lapis]);
  }
}

/**
 * Figures in registers: a god receiving an offering from the king, with label text columns. Each
 * register stands on an incised ground line, and nothing crosses the tile seam.
 */
function figureRegisters(ctx, size, mode, seed) {
  const rule = size * 0.012;
  /* The two figure registers are compressed into the lower 74% of the tile and the top quarter is
   * left as plain dressed wall under a kheker frieze. Same reasoning as `glyphWall`: full-bleed
   * relief over a 20 m pylon reads as pattern, not as carving, and the big architectural shapes
   * stop being legible when you squint. */
  const PLAIN = 0.26;
  const bandH = (1 - PLAIN) * 0.5;
  HG.registerRule(ctx, size, 0, rule, mode);
  HG.registerRule(ctx, size, size, rule, mode);
  HG.khekerFrieze(ctx, 0, size * 0.035, size, size * 0.085, 9, mode);
  HG.registerRule(ctx, size, size * PLAIN, rule, mode);
  HG.registerRule(ctx, size, size * (PLAIN + bandH), rule, mode);

  for (let band = 0; band < 2; band++) {
    const top = size * (PLAIN + band * bandH) + size * 0.030;
    const bh = size * bandH - size * 0.068;
    const base = top + bh;

    // ground line the figures stand on
    ctx.save();
    HG.setMode(ctx, mode, { paint: PAL.ochre });
    if (mode !== 'cut') ctx.fillRect(-2, base, size + 4, rule * 0.9);
    ctx.restore();

    const fh = bh * 0.90;
    const fy = base - fh;
    const dir = band === 0 ? -1 : 1;
    // Layout is a fixed sequence of column widths summing to the tile, so it wraps cleanly.
    const slots = [0.085, 0.255, 0.145, 0.255, 0.085, 0.175];
    const xs = [];
    let acc = 0;
    for (const w of slots) { xs.push(acc * size); acc += w; }

    const put = (k) => xs[k];
    if (dir < 0) {
      HG.columnRegister(ctx, put(0) + size * 0.008, top + size * 0.02, size * 0.069, bh * 0.86, seed + band * 71 + 1, HG.POOLS.divine, mode);
      HG.falconHeaded(ctx, put(1), fy, fh, mode, { dir: 1 });
      HG.offeringTable(ctx, put(2), base - bh * 0.52, size * 0.130, bh * 0.52, mode);
      HG.strideFigure(ctx, put(3), fy, fh, mode, { dir: -1, headdress: 'nemes', arm: 'staff' });
      HG.columnRegister(ctx, put(4) + size * 0.008, top + size * 0.02, size * 0.069, bh * 0.86, seed + band * 71 + 2, HG.POOLS.royal, mode);
      HG.seatedFigure(ctx, put(5) + size * 0.01, fy + fh * 0.06, fh * 0.94, mode, { dir: -1 });
    } else {
      HG.columnRegister(ctx, put(0) + size * 0.008, top + size * 0.02, size * 0.069, bh * 0.86, seed + band * 71 + 3, HG.POOLS.royal, mode);
      HG.strideFigure(ctx, put(1), fy, fh, mode, { dir: 1, headdress: 'plain', arm: 'adore' });
      HG.offeringTable(ctx, put(2), base - bh * 0.52, size * 0.130, bh * 0.52, mode);
      HG.falconHeaded(ctx, put(3), fy, fh, mode, { dir: -1 });
      HG.columnRegister(ctx, put(4) + size * 0.008, top + size * 0.02, size * 0.069, bh * 0.86, seed + band * 71 + 4, HG.POOLS.divine, mode);
      HG.cartouche(ctx, put(5) + size * 0.022, top + size * 0.03, size * 0.13, bh * 0.72, seed + band * 13, mode);
    }
  }
}

export const MATERIAL_NAMES = Object.keys(MATERIALS);

/** Grouped names, for the swatch sheet and for agents browsing the catalogue. */
export const MATERIAL_GROUPS = (() => {
  const g = {};
  for (const [k, v] of Object.entries(MATERIALS)) (g[v.group] ||= []).push(k);
  return g;
})();

/** Built first in init(): everything the canonical shots actually put on screen. */
export const PREWARM = [
  'sandstone_block', 'hieroglyph_wall', 'paving_courtyard', 'sand_ripples',
  'limestone_polished', 'column_papyrus', 'gold_leaf', 'fur_sly',
  'sandstone_worn', 'granite_pink', 'relief_figures', 'ceiling_stars',
  'cloth_cap_blue', 'cloth_shirt_blue', 'gold_cane', 'mask_black',
  'spark_diamond', 'torch_flame', 'dust_soft', 'light_shaft',
];

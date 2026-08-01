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

/* ── Cel-shaded metal: the value policy ───────────────────────────────────────────────────────
 *
 * §7.3: *"Gold doesn't read as metal (needs hard spec + bloom + dark occlusion)."* Every gold
 * recipe in this file used to answer that with brightness, and brightness is the one ingredient
 * that cannot supply it. Measured off the CPU-side albedo before any of this ran, `gold_leaf`
 * reported luma p01 **0.477**, p50 0.670, p99 0.784 — the whole sheet inside one third of a
 * stop, with no dark anywhere in it — plus a normal whose 90th-percentile tilt was **5.2°** and
 * a baked AO whose 1st percentile was **0.773**. A bright, flat, uniformly lit yellow surface is
 * the definition of painted plaster, and that is what the frame showed: the `hero` hook rings
 * measure `#72696b`, R/G **1.08**, i.e. chromatically *neutral* — not merely "not metal", not
 * even gold.
 *
 * What actually reads as cel-shaded metal is three things, and two of them are dark:
 *
 *   1. **A dark, saturated ground.** Most of a piece of gold is not lit by the key at all; it is
 *      showing you a dim reflection of the ground and the shaded sky. If the base sits at 0.67
 *      luma there is nothing for a highlight to be brighter *than*, and the eye reads flat paint.
 *   2. **A hard, narrow, broken highlight.** The shader already gives a hard one: `glossP` runs
 *      near 105 on gold, so the lobe is about 8° wide. On a surface whose normals vary by 5°
 *      that lobe either covers a whole face or misses it entirely — which is why gold currently
 *      either glows uniformly or does nothing. Relief is what breaks a single lobe into a
 *      scatter of glints, so `bump` and the height field matter more here than any colour does.
 *   3. **Occlusion that goes properly dark in the seams**, because the contrast between a black
 *      crease and a white glint two millimetres away is the entire read.
 *
 * So the ramp below moves the mass *down* and keeps a real bright tail, `goldRough` ties
 * roughness to value so that only the crests can catch the lobe (`specAmt ∝ 1 - 0.75·rough`,
 * `glossP ∝ 1 - 0.6·rough`), and the gold recipes carry a strong `aoStrength` with a low
 * `aoFloor`.
 *
 * ── On `PAL.goldSpec`, and whether gold wants the substitution sand got ──────────────────────
 *
 * It wants a substitution, but not that one, and the reason is worth writing down because the
 * two cases look identical and are not.
 *
 * `sand()` used `PAL.goldSpec` (`#fffbe8`, a near-neutral white) for its grain glints and it was
 * wrong there because a quartz grain is a **dielectric**: its specular reflection is the colour
 * of the light, so `PAL.sun` was the correct hex. Gold is a **metal**, and a metal's specular is
 * tinted by the metal itself (gold reflects roughly 1.00 / 0.77 / 0.34 in R/G/B). A gold
 * highlight is therefore neither paper-white *nor* the colour of the sun — it is the sun times
 * gold, which stays unmistakably gold all the way up to the point where it clips.
 *
 * The other half of the sand argument does carry over exactly. A near-neutral hex mixed into an
 * *albedo* is averaged by the mip chain into a desaturating film, and that is what turned the
 * dunes grey. Gold is the second-warmest surface in the game and can afford that even less. So
 * `GOLD_HOT` — the crest colour, which lives in the albedo — leans toward `PAL.sun`, past
 * `goldLight`, *away* from `goldSpec`.
 *
 * **Correct the record on where `PAL.goldSpec` goes.** The note that used to sit here said it
 * "is the shader's `uSpecColor`", and that is false — it was never checked and it changes the
 * answer. `ToonMaterial.js` does **not** import this palette; it declares its own private copy
 * (`ToonMaterial.js:188`, `specColor: hex(opts.specColor, PAL.goldSpec)` against *that* copy), as
 * does `src/fx/Emitters.js`. So this file's `goldSpec` reaches the specular term of exactly
 * nothing. Every live consumer of it in this catalogue puts it in an **albedo or an emissive**:
 * `sand()`'s grain glints, `lapis_inlay`'s flecks, `limestone_polished`'s speckle, and the spark
 * and ember gradients.
 *
 * Which means the desaturating-film argument applies to *all* of them, not just to sand, and
 * there is no counter-argument left about protecting a specular core — this file has no specular
 * core to protect. The two remaining albedo uses are already blended (`MX(goldSpec, sandLight,
 * 0.4)`, `MX(sun, goldSpec, 0.35)`) rather than used neat, which is the shape the sand fix
 * arrived at, so they are correct as written. The palette entry stays because §2.2 names it and
 * because `PREWARM`-time emissive gradients want a white-hot stop; what is wrong is the claim
 * that it is doing shader work.
 *
 * So: gold does **not** want the substitution sand got, and it does not want a hex of its own
 * either. The reason is that the shader already computes gold's highlight colour from the
 * albedo — `specTint = mix( uSpecColor, alb * 2.0 + uSpecColor * 0.25, slyMetal )` — so on a
 * surface this file marks metal the highlight is 1.7x the albedo plus a 0.36 white core, i.e.
 * sun-times-gold, arrived at without any palette entry. The lever that makes gold read is the
 * **metalness mask** (`s.metal`) and the value range under it, both of which live here. That is
 * what the rework below is about.
 */
/** Deep shadowed gold — a recess in gilding, still gold-brown, never neutral and never black. */
const GOLD_DEEP = MX(PAL.goldDark, PAL.sandCrev, 0.58);
/** The crest a specular hit lands on. Past `goldLight` toward the *sun*, not toward paper. */
const GOLD_HOT = MX(PAL.goldLight, PAL.sun, 0.45);

/* Palm-trunk browns, both chosen against §2.2's `crevice #4a2f22` luminance (0.2031) — the value
 * below which the shader's flat additive shadow wash out-weighs a texel's own albedo. Bark is
 * legitimately the darkest organic surface in the level and these keep it that way; what they
 * stop is it falling *through* the palette into shadow-violet. See `palm_bark`. */
/** Darkest stop of the trunk ramp. Luma 0.2334. */
const BARK_DARK = 0x523726;
/** The groove between two frond pads, and the floor. Luma 0.2451 — a floor has to sit well
 *  *above* the threshold it defends, because `rampFloor`'s pull is `(lo − y)/lo` and vanishes as
 *  a texel approaches it. Measured: a texel left at 0.199 by `grain`'s multiply is pulled only to
 *  0.202 from a 0.2253 floor, still under the line; from 0.2451 it clears. */
const BARK_CREV = 0x563a26;

/* Old timber, chosen the same way. `wood_old`'s ramp bottomed out on `0x3f2a1a`, luma **0.178** —
 * *below* §2.2's `crevice` 0.2031 before a single darkening pass had run — and the recipe carried
 * no `rampFloor` at all, so it reported the largest dark tail of any recipe in the catalogue with
 * a live consumer (**0.0649**). Props dresses walkable platforms and climbable poles with it, so
 * those texels are on surfaces the camera is close to. */
/** Darkest stop of the timber ramp. Luma 0.2280. */
const TIMBER_DARK = 0x51361f;
/** Split, check and nail-hole floor. Luma 0.2757 — well clear of the line it defends. */
const TIMBER_CREV = 0x624128;

/**
 * Five-stop gold ramp, `t` biased so the mass falls low and only the tail reaches `GOLD_HOT`.
 *
 * The bias is the whole point. Feeding a roughly symmetric field straight into a symmetric ramp
 * produces a symmetric distribution centred on `goldMid`, which is the bright flat sheet this
 * replaces. `t^GOLD_BIAS` pulls the body of the distribution toward `GOLD_DEEP` while leaving
 * the top decile where it was, so the *range* opens instead of the whole surface darkening.
 */
/**
 * World metres one repeat of a declared `tile` actually covers on architecture.
 *
 * `Kit.UV_PER_M = 0.5`, so ARCHITECTURE and PROPS lay one UV unit every two metres and every
 * wall, column and pavement in the level shows one repeat per **2 x tile**. Every layout in this
 * file that wants to size a feature in metres has to go through this, because quoting `tile`
 * directly is what put three-metre hieroglyphs on the hypostyle walls and what made
 * `sand_ripples` render at 3.7x its authored slope. Terrain is the exception and sets its own
 * repeat; it does not use this.
 */
const ARCH_UV = 2.0;
/** Declared tiles that a layout function also needs, so the two can never drift apart. */
const HG_WALL_TILE = 5.2;
const HG_GILDED_TILE = 3.2;
const worldTileOf = (tile) => (Array.isArray(tile) ? tile[0] : tile) * ARCH_UV;

const GOLD_BIAS = 1.75;
function goldRamp(t, out = T3) {
  const k = Math.pow(sat(t), GOLD_BIAS);
  if (k < 0.34) return mixHex(GOLD_DEEP, PAL.goldDark, k / 0.34, out);
  if (k < 0.62) return mixHex(PAL.goldDark, PAL.goldMid, (k - 0.34) / 0.28, out);
  if (k < 0.86) return mixHex(PAL.goldMid, PAL.goldLight, (k - 0.62) / 0.24, out);
  return mixHex(PAL.goldLight, GOLD_HOT, (k - 0.86) / 0.14, out);
}

/**
 * Roughness for a gold texel at ramp position `t`. Bright crest = planished and polished; deep
 * recess = dirty and scattering. Correlating the two is what makes the highlight land only where
 * the albedo is already hot, so the additive white spec sums onto gold instead of onto brown —
 * and it is the only way to get an albedo-tinted highlight out of a shader whose `uSpecColor` is
 * a fixed near-white this file cannot reach.
 */
function goldRough(t) {
  const k = Math.pow(sat(t), GOLD_BIAS);
  /* **Squared, and off a higher plateau, because `uMetal` is now real.**
   *
   * ARCHITECTURE and PROPS were never passing `metal` to `shading.toon()`, so every gilded
   * surface in the level rendered at `uMetal = 0`; that is fixed (e396c1d) and it changes what
   * this function is for. `specAmt = uSpec · (1 − 0.75·rgh) · mix(1, 3.4, uMetal)`, so the metal
   * path multiplies the highlight by **3.04**, and `specTint` becomes `albedo·1.7 + 0.36·white`
   * instead of flat near-white.
   *
   * Measured on the built maps by sweeping the half-vector over a hemisphere — which is what a
   * curved hook ring or spire presents to one sun — `gold_leaf`'s peak specular went 1.16 → 7.02
   * and the fraction of the surface blown past 1.0 went 0.2 % → **8.0 %**. The chroma of the
   * bright specular went 0.185 → 0.676 at the same time, which is the whole point of the fix and
   * must be kept: the highlight is finally gold rather than white.
   *
   * Those two pull against each other, because a highlight that clips in all three channels
   * desaturates — the same mechanism that turned the dunes into dirty snow. §7.3 asks for a hard
   * **narrow** specular, and a linear ramp put half the material within a stop of the polished
   * crest, so half of it was catching the lobe at close to full strength. Squaring holds the true
   * crests exactly as polished as they were — the peak, the bloom feed and the chroma are
   * untouched — and lifts everything below them onto a roughness that suppresses `specAmt`.
   *
   * **Be honest about what that did and did not buy.** On `bronze_aged`, whose uSpec is 0.6, it
   * halved the blown area (14.3 % → 7.4 %) at an unchanged peak, which is exactly the intent. On
   * `gold_leaf` the blown *area* did not move (8.0 % → 8.3 %): at uSpec 0.95 the metal path puts
   * `specTint · specAmt` above 1.0 wherever the lobe fires at all, so no roughness short of
   * ~0.95 — which would throw the lobe width away with it — can pull it back under. The
   * amplitude on gold belongs to `uSpec` (ARCHITECTURE's `RECIPES`, PROPS' `MATERIALS`) and to
   * the 3.4 metal gain in `toon.glsl`; this file can shape where the highlight lands and how
   * much of the surface is polished enough to catch it, and that is all. What the change does
   * buy on gold is a lower `specAmt` over the *body* of the material, which is what stops the
   * near-white lobe washing the base toward neutral on the gilded recipes that get no `uMetal`.
   *
   * It also helps the three gilded recipes that do *not* get `uMetal` (`hieroglyph_gilded`,
   * `cartouche_gold`, `ceiling_stars` are not flagged `metal` at their call sites): there the
   * specular is still near-white, and a near-white highlight over half a surface is exactly what
   * used to measure gold as chromatically neutral in frame. */
  return sat(0.70 - Math.pow(k, 2.0) * 0.60);
}

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
      // 6 rather than 4 cycles, for the same k=1 reason as `schl` below: this field is the other
      // half of the hue band, and at 4 cycles on a 4.4 m repeat it was leaking into the one-blob
      // bin alongside it. At 6 it is a 0.73 m band, still far above the 23 mm crystals.
      const macro = s.field(5, (u, v) => warpN(u, v, 6, 4, 1.2, cx.seed + 31) * 0.5 + 0.5);
      const size = s.size;

      /* (1) Schlieren — the pluton's own banding, warped hard so it winds rather than stripes,
       * plus a weaker second octave. It biases which mineral wins the Worley cell, so a pink
       * swathe is pink because the feldspar count is up there, and it drags a little value.
       *
       * **Three cycles per tile, not two, and the reason is the obelisk's repeat.** The note
       * above claims this material cannot show a seam because none of its layers carries a
       * countable landmark. Landmarks are not the only way a repeat becomes countable: a tile
       * whose variance sits at *one cycle per tile* is a single blob, and a column of identical
       * blobs is as countable as a column of identical cracks. Measured on the built albedo by
       * taking the row- and column-mean profiles and binning them by cycles-per-tile, this
       * recipe put **61.5%** of its along-U profile variance and **53.4%** of its along-V
       * variance in the k=1 bin — the highest in the catalogue after `bronze_aged`. With a 4.4 m
       * repeat on a 22 m shaft that is five identical light/dark bands, and at `courtyard`'s
       * 20.8 px/m they are 92 px apart: countable.
       *
       * Two cycles across a 4.4 m repeat is a 2.2 m feature, which is *above* this recipe's own
       * stated design band ("deliberately an order of magnitude coarser than the crystals — 0.5
       * to 2 m"). Three cycles is 1.5 m, inside it. So this is not a retreat from macro
       * structure — the flatness this recipe was rebuilt to fix — it is the same structure
       * moved to the scale the recipe already argued for. Nothing is lost to the mip chain
       * either: the obelisk is seen at mip 3 in `courtyard` (512 texels over a 66 px repeat),
       * which averages away anything under ~7 cm, and 1.5 m is twenty times that. */
      const schl = s.field(4, (u, v) => sat(
        warpN(u, v, 3, 3, 1.45, cx.seed + 907) * 0.80
        + warpN(u, v, 7, 3, 1.10, cx.seed + 1531) * 0.34 + 0.5));

      /* (2) Wind scour — shallow hollows cut by three thousand years of blown sand, at ~0.5 m.
       * Ridged noise because scour has crests where the harder crystals stand out. */
      const scour = s.field(3, (u, v) => ridgeN(u, v, 8, 4, 0.55, cx.seed + 733));

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
        // patinaFreq 2 → 3: one more k=1 contributor on a surface whose repeat is countable.
        patina: 0.26, patinaTint: 0x6f5040, patinaFreq: 3,
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
      pitting(s, { amount: 0.05, freq: 60, density: 0.5, seed: cx.seed + 61, colorDark: 0x6a4526, stain: 0.05 });
      /* **The one stone recipe that broke the `darkTail == 0` invariant** — 0.0076 at shipping
       * resolution, i.e. three quarters of a per cent of this wall was dark enough for the
       * shader's additive violet wash to out-weigh its own albedo. Two causes, both here.
       *
       * `crevice 0x3d2416` is luma **0.148**, the deepest hex in the recipe, and `creviceAmt`
       * 0.54 mixed a long way toward it; and the floor below targeted `0x4a2f1c`, luma **0.2014**,
       * which is 0.0018 *under* §2.2's `sandCrev #4a2f22` — the exact value the invariant is
       * measured against. So the mop-up pass was aiming fractionally below the line it existed
       * to clear, and `rampFloor` is asymptotic (a texel at 0.15 only moves a third of the way),
       * so it could never have got there from a tail that deep anyway.
       *
       * Both hexes now sit at or just above crevice luminance and keep the mud hue. The fix
       * belongs at the source rather than in the floor: the floor can only mop up stragglers. */
      weather(s, { source: m.joint, seed: cx.seed + 6, crevice: 0x543722, creviceAmt: 0.44, streakAmt: 0.28, dustAmt: 0.20, directional: 0.7, patina: 0.10 });
      grain(s, { amount: 0.03, freq: 120, seed: cx.seed + 8, heightAmt: 0.010 });
      /* Note for the next person tempted to close a dark tail with this call: `rampFloor`'s pull
       * is `(lo − y)/lo`, which goes to *zero* as a texel approaches the threshold. It mops up
       * near-black texels and is arithmetically incapable of moving one that sits just under the
       * line — no value of `soft` fixes that, because `soft` only scales a term that is already
       * ~0 there. A dark tail has to be closed at the source, which is what the two hexes above
       * do. Measured, not reasoned: raising `soft` to 2.2 here moved `darkTail` by nothing.
       *
       * `lift` is the missing tool that note was describing, added since: it multiplies rather
       * than lerps, so it maps [0, lo] onto [lo·(1−lift), lo] and *cannot* leave a texel short.
       * At `crevice 0x503322` (luma 0.2196) a lift of 0.06 puts the hard minimum at 0.2064, just
       * over §2.2's 0.2031, and takes this recipe's residual 0.0003 to zero. Small on purpose —
       * the source fix above is what did the work (0.0076 → 0.0003) and this only removes the
       * last ~79 texels of 262 144, which are the ones no source hex can reach. */
      rampFloor(s, { crevice: 0x503322, lift: 0.06 });
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
    group: 'carved', tier: 0, tile: HG_WALL_TILE, bump: 0.044, rough: 0.86,
    /* 1.15 → 0.55: the same saturated-AO defect diagnosed on `hieroglyph_gilded`, live in a
     * second place. `heightAO`'s nearest-radius gain here is
     * `(0.044 / (3 · 5.2/1024)) · 1.55 · 0.47 · 1.15 = 2.42`, so its term is `sat(d · 9.7)` and
     * clamps at a height difference of 0.103 — while `carve`'s `depth: 0.46` puts roughly 0.23
     * across the bevel at that radius. Every glyph interior therefore came out at `aoFloor`
     * regardless of its shape, which is `heightAO`'s own named failure ("a sunk relief … as a
     * *filled* dark stamp … §7.3's 'carvings look painted-on'") reappearing through the
     * `aoStrength` knob rather than through the radius weights it was fixed in.
     *
     * 0.55 is set against the saturation point, not by ratio: it gives `sat(d · 4.6)`, which
     * needs d > 0.22 to clamp, so the floor of a cut still bottoms out and the bevel keeps a
     * gradient. These are the 36 m walls `temple` looks down, so this is the largest carved
     * surface in the level and the one that decides that line of §7.3. */
    aoStrength: 0.55, aoFloor: 0.13,
    build(s, cx) {
      const size = s.size;
      // Carvings run straight across block joints, exactly as they do on a real temple wall —
      // the masons dressed the wall first and the sculptors came after.
      const m = ashlar(s, { seed: cx.seed, courses: 6, aspect: 2.6, dome: 0.025, relief: 0.05, groove: 0.20, jointW: 0.006, chamfer: 0.012, tone: -0.045, bedFreq: 2 });
      // The world size the layout is actually laid out at, derived from the tile rather than
      // written out — a literal here would go stale the next time anyone retunes `tile`, which
      // is precisely the failure `glyphWall`'s note describes. See `worldTileOf`.
      /* **`cartouche: false`, and it is the whole of §7.3's "visible texture tiling repetition"
       * on this recipe.** `glyphWall` defaults `cartouche` to `true`, so these walls were drawing
       * one royal cartouche — a 0.7 x 1.8 m outlined oval, the single most distinctive shape in
       * the sign set — once per 10.4 m repeat. Rendered as `temple` actually frames the far hall
       * wall (36 m of wall at 13.5 px/m, i.e. 3.46 repeats across 486 px, each repeat 140 px
       * wide) the cartouche is a beacon marking every seam, and the repeats are trivially
       * countable by eye.
       *
       * This is the failure `glyphWall`'s own note says it fixed — *"a dense field of small
       * varied marks has no landmark in it, so the eye has nothing to recognise on the next
       * repeat: the repetition is solved by removing the thing that repeats visibly"* — and the
       * note is right; the default simply put the landmark back. `hieroglyph_gilded` keeps its
       * cartouche on purpose (it is passed explicitly there): an architrave carries a royal name,
       * it is 11.7% gilded, and at `courtyard`'s 41 px per repeat there is nothing to count.
       *
       * Worth recording that the spectral tiling measure missed this completely. Binning the
       * tile's row/column mean profiles by cycles-per-tile put `hieroglyph_wall` among the
       * *cleanest* in the catalogue (k=1 at 0.047 along U, 0.169 along V) because its repeat
       * signature is not a low-frequency blob — it is a recognisable object. Only the render at
       * consumer scale showed it. */
      const layout = (mode) => (ctx) => glyphWall(ctx, size, mode, cx.seed, { worldTile: worldTileOf(HG_WALL_TILE), glyphM: 0.72, cartouche: false });
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

  /* The largest gilded surface in the level by a long way — every cornice, architrave, lintel
   * and false door in `hero`, `temple`, `courtyard` and `interior` is this recipe. Its gold gets
   * the same value policy as `gold_leaf` (see `goldRamp`), plus one thing that only applies to
   * gilding *in a sunk relief*: the ramp position is driven by where the texel sits on the cut
   * rather than by a noise field, so the floor of every glyph is deep and its bevel is hot.
   * That is both what leaf over a carved ground actually does — the burnisher can only reach the
   * arris — and the thing that makes the carving legible, because it puts the material's whole
   * value range across the two millimetres where the relief is. */
  hieroglyph_gilded: {
    group: 'carved', tier: 1, tile: HG_GILDED_TILE, bump: 0.042, rough: 0.70,
    /* **`aoStrength` 1.30 → 0.60, because at 1.30 this recipe had no occlusion *gradient* — it
     * had an occlusion *switch*, and the switch was closed over the whole of the gilding.**
     *
     * Measured on the built ORM: of the texels carrying the gild mask, **64.6%** sat exactly at
     * `aoFloor`, and the 1st, 25th and 50th percentiles were all 0.067 — the floor itself. The
     * comparison that makes it obvious is `gold_leaf`, the recipe this one borrows its value
     * policy from: 10.2% at floor, p50 **0.675**. One has a gradient; this one did not.
     *
     * The mechanism is arithmetic in `heightAO`. Its per-radius gain is
     * `(bump / (r·px))·1.55·w·strength`, and `px` comes from the *declared* tile (3.2) rather
     * than the 6.4 m the consumer actually lays it over, so it is already double what the name
     * suggests. At bump 0.042, size 512 and strength 1.30 the nearest radius alone gives
     * `sat(d·12.7)`, which reaches 1.0 at a height difference of 0.079 — and `carve`'s
     * `depth: 0.42` puts roughly 0.16 across the bevel at that radius. So all four radius terms
     * fired at full strength, `sat(v)` clamped to zero, and every texel inside a glyph came out
     * at the floor regardless of whether it was the floor of the cut or the arris above it.
     *
     * Why that matters more here than anywhere else in the catalogue: AO multiplies the two
     * terms that give cel metal its body away from the highlight — the hemispheric fill
     * (`albAmb * fill * ao`) and, decisively, the stylised environment reflection
     * (`metalEnv = alb * env * slyMetal * uMetalGain * ef * … * ao`). The specular lobe is *not*
     * multiplied by AO, so the surface still glinted; what it had lost was everything in
     * between. A gilded cornice was therefore a black stamp with a hard line on it, which is
     * neither metal nor carving. §7.3 asks for hard spec *and* dark occlusion, and dark
     * occlusion means the recess is dark **relative to** the arris — a uniform floor supplies
     * the darkness and destroys the relation that makes it read.
     *
     * 0.60 is chosen against the saturation point rather than by eye: it takes the nearest
     * radius' gain to `sat(d·5.9)`, which needs d > 0.17 to clamp, so the glyph floor still
     * bottoms out and the bevel keeps a gradient. The stone half of this recipe pays almost
     * nothing for it — only 9.2% of the whole surface was at the floor and the gild mask is
     * 11.7% of it, so essentially every floored texel *was* gilding; the limestone's AO sat at
     * p25 0.933 and is untouched. */
    aoStrength: 0.60, aoFloor: 0.07,
    build(s, cx) {
      const size = s.size;
      ashlar(s, {
        seed: cx.seed, courses: 3, aspect: 3.0, dome: 0.02, relief: 0.04, groove: 0.20, jointW: 0.005, chamfer: 0.010,
        // Mortar darker than `limeMid`: a joint is a recess, so it can never be the bright thing.
        dark: PAL.limeDark, mid: PAL.limeMid, light: PAL.limeLight, mortar: 0x8a7a5e, rough: 0.62,
      });
      // Same derivation as `hieroglyph_wall`: 3.2 declared through the 2x consumer factor is
      // 6.4 m of world per repeat, which at `cols: 3` was a 1.62 m sign. Gilded architrave signs
      // run a little larger than wall text, hence 0.80 rather than 0.72.
      /* **`cartouche: false` here too — the exception that kept it was argued against a framing
       * that no longer exists.** The note on `hieroglyph_wall` above removed the same landmark
       * and explicitly spared this recipe, on the grounds that "at `courtyard`'s 41 px per repeat
       * there is nothing to count". That was true of `courtyard` and is not true of `temple`,
       * which has since been re-framed from inside a nave column to a long axial view down the
       * full hypostyle nave — and this recipe dresses the nave architraves that run away from
       * that camera (`EgyptLevel.js:716, 821, 920`).
       *
       * The arithmetic at the new framing: fov 55 over 720 px is 1.334 mrad/px, so a 6.4 m repeat
       * subtends **192 px at 25 m and 137 px at 35 m**, the near and far ends of the run. The
       * cartouche is one of six columns, ~1.07 m, i.e. a 32 px outlined oval recurring every
       * 137–192 px straight down the axis of the shot — 4.7x the px-per-repeat the exception was
       * granted for, on a surface presented edge-on for its whole length.
       *
       * Same defect, same recipe family, fixed in one place and left live in the other: the
       * `Math.max(0.05, [u,v])` shape. The density does not change — the cartouche column is
       * replaced by another `columnRegister`, so the wall carries the same amount of writing with
       * no shape distinctive enough to count repeats by. A royal name belongs on `cartouche_gold`,
       * which exists for exactly that and is not tiled. */
      const layout = (mode) => (ctx) => glyphWall(ctx, size, mode, cx.seed + 4, { worldTile: worldTileOf(HG_GILDED_TILE), glyphM: 0.80, cartouche: false });
      const cut = rasterMask(size, layout('cut'));
      const lines = rasterMask(size, layout('line'));
      const ramp = carve(s, cut, lines, { depth: 0.42, bevelPx: 2.6, lip: 0.10, bulge: 0.5, lineDepth: 0.56, seed: cx.seed + 5 });

      // Gold leaf laid into the sunk glyphs over a red bole ground; the leaf lifts at the arrises.
      const lift = s.field(2, (u, v) => sat(warpN(u, v, 14, 4, 1.1, cx.seed + 31) * 1.4 + 0.5));
      const wrinkle = s.field(2, (u, v) => fbmN(u, v, 55, 3, 0.5, cx.seed + 37) * 0.5 + 0.5);
      // Which stretches of the inscription were re-gilded and which have gone dark. One cycle
      // per 1.6 m of world, so a run of glyphs shares a state instead of each one differing.
      const swathe = s.field(4, (u, v) => warpN(u, v, 4, 4, 1.25, cx.seed + 197) * 0.5 + 0.5);
      const t3 = [0, 0, 0];
      for (let i = 0; i < s.n; i++) {
        const g = sat(ramp[i] * 1.35 - 0.10);
        if (g <= 0.01) continue;
        const worn = sat((lift[i] - 0.66) * 3.0) * g;
        /* `4r(1-r)` peaks across the bevel of the cut and falls to zero on both the floor and
         * the surrounding face — the surface a chisel leaves and the only part of a sunk glyph a
         * burnisher can reach. It is the right shape for the *hot* end of the ramp.
         *
         * **It was the whole ramp, and that is why gilding did not read as gold.** `carve` sets
         * `ramp = smoothstep(0.10, 0.92, blur(cut, rb))` with `rb = max(2, round(bevelPx·size/1024))`,
         * which at this recipe's `bevelPx 2.6` and the shipping 512 build is **2 texels**. One
         * texel here is 12.5 mm of world (6.4 m repeat / 512), so the entire bevel is **25 mm** —
         * 0.75 px on `temple`'s far wall at 25 m and about 2 px at `interior` and `hero`. `4r(1-r)`
         * is zero everywhere except in that 25 mm, so the gild mask — which is the *floor* of the
         * cut, `g = sat(ramp·1.35 − 0.10)`, and is many pixels across — was sitting at `t ≈ 0.16`,
         * i.e. flat `GOLD_DEEP`, over essentially all of its area.
         *
         * Measured on the metal-masked subset before this change: luma p50 **0.290** against
         * `gold_leaf`'s 0.509, p95 0.634 against 0.775. The median of the gilding *was*
         * `GOLD_DEEP`, so the surface's central tendency was a dark brown and the only thing that
         * could have lifted it was a hot line under a pixel wide. In frame that measured as
         * `#4a3a39` on `hero`'s cornice — L 61, chroma 0.227 — which is what §7.3 means by "gold
         * doesn't read as metal". Same defect class as `MOTES.size` and `sand_ripples`: the
         * material's value range placed across a feature that subtends less than a pixel.
         *
         * **Be precise about the minification, because the obvious story is wrong.** Box-mipping
         * the albedo and the gild mask in lockstep, the old version's gild median *rises* with
         * distance — 0.290 at mip 0 to 0.354 at mip 1 (2 texels/px, `temple`'s nave architrave at
         * 25 m) and 0.362 at mip 2 — because averaging pulls the dark cut floor toward the pale
         * limestone around it. The range shrinks in both versions by about the same amount
         * (0.476 -> 0.363 old, 0.464 -> 0.369 new). So the fix is not "the range survives
         * minification now"; it is that the *median* moved off `GOLD_DEEP`: at mip 1 the gild
         * goes 0.354 -> 0.431, at mip 2 0.362 -> 0.427.
         *
         * **And record the cost, which is real.** Albedo chroma on the gild at mip 1 falls
         * **0.702 -> 0.629** (mip 2: 0.662 -> 0.635), because `goldRamp`'s saturation peaks around
         * `goldMid` and falls again toward `goldLight`/`GOLD_HOT`. The trade is bought back on the
         * term §7.3 actually names: evaluating `toon.glsl`'s hard-stepped specular on the built
         * maps at this recipe's real consumer parameters (uSpec 0.55, gloss 64, uMetal 0.85),
         * peak specular over a hemisphere sweep goes p50 0.976 -> 1.087 and p90 1.104 -> 1.261,
         * the fraction of gilding whose highlight clips in all three channels goes 8.8% -> 22.5%,
         * and the *highlight's* chroma holds (p50 0.476 -> 0.472, p90 0.544 -> 0.589). That comes
         * free with the value move, because `goldRough` is keyed to ramp position: the gild's
         * roughness p50 falls 0.715 -> 0.598, which lifts both `specAmt` and `glossP`.
         *
         * So the *body* of the cut now sits mid-ramp — leaf covers the whole sunk field, because
         * that is what gilding a sunk relief means — and the bevel keeps its job of carrying the
         * top of the range. The dark is not lost: it comes from `swathe`/`wrinkle` (which are
         * metre-scale, so they survive minification), from the albedo dirt on `s.occ` below, and
         * from the baked AO. Dark occlusion, not a dark base colour, is what §7.3 asks for. */
        const bevel = 4 * ramp[i] * (1 - ramp[i]);
        const t = sat(0.46 + bevel * 0.50 + (swathe[i] - 0.5) * 0.42 + (wrinkle[i] - 0.5) * 0.26);
        goldRamp(t, t3);
        s.r[i] += (t3[0] - s.r[i]) * g; s.g[i] += (t3[1] - s.g[i]) * g; s.b[i] += (t3[2] - s.b[i]) * g;
        s.mixHex(i, PAL.red, worn * 0.75);                    // bole showing through
        s.metal[i] = g * (1 - worn * 0.85);
        s.rough[i] = lerp(s.rough[i], sat(goldRough(t) + worn * 0.4), g);
        s.h[i] += g * 0.03 * wrinkle[i];
        // Dirt in the bottom of a gilded recess. This is the dark occlusion §7.3 asks for and
        // it is albedo, so unlike the baked AO it survives minification and carries no
        // lighting direction of its own.
        s.occ[i] *= 1 - g * sat(ramp[i] * 1.2) * 0.40;
      }
      weather(s, { source: ramp, seed: cx.seed + 6, crevice: 0x54441c, creviceAmt: 0.50, streakAmt: 0.22, dustAmt: 0.16, roughGrime: 0.08 });
      grain(s, { amount: 0.014, freq: 120, seed: cx.seed + 8, heightAmt: 0.004 });
      /* Opening the gold's value range downward put 0.28 % of texels (min luma 0.187) under
       * §2.2's `crevice` value, where the shader's additive violet wash starts to out-weigh the
       * albedo. This recipe reported `darkTail 0.0000` before and has to keep doing so. */
      rampFloor(s, { crevice: GOLD_DEEP });
    },
  },

  /* No consumer: nothing in `Architecture.RECIPES`, `Props.MATERIALS` or any other module names
   * this recipe, so it is built by `PREWARM` and applied to nothing. Kept correct rather than
   * tuned in frame — including the `aoStrength` correction below, which is the same defect and
   * the same arithmetic as its two siblings and should not be left live in a third place. */
  relief_figures: {
    group: 'carved', tier: 0, tile: 5.4, bump: 0.046, rough: 0.86,
    aoStrength: 0.55, aoFloor: 0.13,
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
    // Was on the catalogue defaults (1.0 / 0.16) and measured AO p01 **0.427** against
    // `gold_leaf`'s 0.047 — no dark anywhere on a panel whose whole subject is gilt on lapis.
    // The dark occlusion is half of §7.3's gold line and this recipe had none of it.
    aoStrength: 1.30, aoFloor: 0.07,
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
          const t = sat(0.26 + (rope[i] - 0.5) * 1.25 + sat(ringSoft[i] - 0.5) * 0.5);
          const col = goldRamp(t);
          s.r[i] += (col[0] - s.r[i]) * g; s.g[i] += (col[1] - s.g[i]) * g; s.b[i] += (col[2] - s.b[i]) * g;
          s.metal[i] = g;
          s.rough[i] = lerp(s.rough[i], goldRough(t), g);
          s.h[i] += g * 0.30 + g * rope[i] * 0.06;     // the ring stands proud, rope-textured
        }
        /* Gold in the sunk glyphs too — a cartouche is always the richest thing on the wall.
         *
         * This was the one gilded surface in the file still doing it the old way: a flat mix
         * toward `goldMid` at a fixed 0.24 roughness, i.e. a bright uniform yellow with a
         * uniform highlight — the painted-plaster read the note above `goldRamp` exists to
         * prevent. It gets the same treatment as the ring above it: the ramp position comes from
         * the *bevel* of the cut (`4r(1−r)` peaks across the cut wall and falls to zero on both
         * the floor and the surrounding face), so the recess is deep, the arris is hot, and the
         * two are two millimetres apart. That is what a burnisher can actually reach, and it is
         * also the only way a 1.6 m tile gets its whole value range across the relief. */
        const gi = sat(ramp[i] * 1.2 - 0.15);
        if (gi > 0.02) {
          const bev = 4 * ramp[i] * (1 - ramp[i]);
          /* Same correction, same arithmetic, as `hieroglyph_gilded` — the identical expression
           * was live in both places. `bevelPx 2.4` at the shipping 512 build is `rb = 2` texels,
           * and one texel of a 3.2 m repeat is 6.25 mm, so `4r(1−r)` was non-zero over 12.5 mm:
           * 0.83 px at `interior`'s 12 m. The base moves up so the leaf in the sunk glyph is
           * gold over its whole area and the bevel keeps the top of the range. */
          const tg = sat(0.42 + bev * 0.50 + (rope[i] - 0.5) * 0.30);
          const cg = goldRamp(tg);
          s.r[i] += (cg[0] - s.r[i]) * gi; s.g[i] += (cg[1] - s.g[i]) * gi; s.b[i] += (cg[2] - s.b[i]) * gi;
          s.metal[i] = Math.max(s.metal[i], gi * 0.9);
          s.rough[i] = lerp(s.rough[i], goldRough(tg), gi);
          // Dirt in the bottom of a gilded recess: albedo, so unlike the baked AO it survives
          // minification and carries no lighting direction of its own.
          s.occ[i] *= 1 - gi * sat(ramp[i] * 1.2) * 0.35;
        }
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x101c30, creviceAmt: 0.45, streakAmt: 0.14, dustAmt: 0.10, roughGrime: 0.06, patina: 0.06 });
      /* `freq` 320 → 150. 320 cycles on a 3.2 m world repeat is a 10 mm feature — 0.32 px at the
       * 30 m `temple` sees this panel from and 0.8 px at `interior`'s 16 m, so it was below the
       * pixel at every framing it appears in. */
      grain(s, { amount: 0.02, freq: 150, seed: cx.seed + 8, heightAmt: 0.006 });
      /* The only gold recipe with no floor, and it reported the catalogue's largest dark tail
       * outside `mudbrick` (0.0105 at half resolution). The crevice hex is a *lapis* one, so a
       * shadowed recess on this panel bottoms out as deep blue rather than as the violet the
       * shader's additive wash leaves on a near-black texel. */
      rampFloor(s, { crevice: MX(PAL.lapis, PAL.shadow, 0.30) });
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
          /* Gilded stars on a painted ceiling. `starSoft` falls off across the point of each
           * star, so driving the ramp with it makes the centre of a star hot and its points
           * deep — which is what gives a five-pointed leaf star its shape at twenty metres,
           * where the geometry of the point is well under a pixel. */
          const t = sat(0.20 + sat(starSoft[i] * 1.15) * 0.68 + (plaster[i] - 0.5) * 0.5);
          const col = goldRamp(t);
          const k = g * (1 - lost * 0.9);
          s.r[i] += (col[0] - s.r[i]) * k; s.g[i] += (col[1] - s.g[i]) * k; s.b[i] += (col[2] - s.b[i]) * k;
          s.h[i] += g * 0.24;                       // pigment/leaf sits proud of the plaster
          s.rough[i] = lerp(s.rough[i], goldRough(t), k);
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
    // tile[0] 3.6 → 5.0: one repeat per 10.0 m of arc, the mid-shaft circumference. See the
    // rib-matching note in `build`. tile[1] is untouched — it sets the band heights, not the ribs.
    group: 'carved', tier: 0, tile: [5.0, 4.5], bump: 0.042, rough: 0.84,
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
      /* **The painted rib now matches the rib the geometry already cuts, in count and in phase.**
       *
       * `Kit.papyrusColumn` builds the bundle as real geometry: `lobes = 8`, `rib = 0.075`, so
       * the mesh normal already swings ±31° eight times around the shaft, and `computeVertexNormals`
       * ships it. The shaft's UVs are `u = arclength × UV_PER_M`, i.e. `arclength × 0.5`, and the
       * repeat was `1/3.6` — one repeat per 7.2 m of arc. Nine painted stalks in that repeat put
       * `9·C/7.2` ribs around the column: **14.9 at the base (C = 11.94 m) and 11.0 under the
       * capital (C = 8.80 m)**, against 8 geometric ones, drifting continuously with the entasis.
       * Two incommensurate rib grids on one cylinder is the same beat the `JOINT` note describes
       * for masonry, and it is why twelve hypostyle columns read as corrugation down the nave in
       * a shot that is now a long axial view of all of them.
       *
       * Worse, they were in *anti-phase*. `p = (u·stalks) % 1` makes `d = 2p−1 = −1` at u = 0, so
       * `cross = 1 − d² = 0` — a painted groove exactly on the geometric crest, which is at a = 0
       * because `lobe = 1 + rib·cos(8a)` peaks there. The texture was cancelling the geometry at
       * the one angle where the two are guaranteed to line up.
       *
       * `tile[0]` 3.6 → 5.0 makes one repeat 10.0 m of world, which is the circumference at the
       * mid-shaft radius the entasis gives (r = 1.575 m at t = 0.5, C = 9.90 m); with `stalks = 8`
       * the painted count is 8 at mid-shaft, 9.6 at the foot and 7.0 at the neck — a slow ±1.3
       * drift over 12 m instead of a 2:1 beat. The `+0.5` puts a painted *crest* at u = 0.
       *
       * Exact agreement is not available: `u` is scaled by the profile radius, so a tapering
       * column drifts whatever the tile. So the amplitudes come down as well — the geometry owns
       * the bundle now and the paint only shades it. Where the two do drift apart the painted
       * term can soften a geometric rib; it can no longer draw a second one. */
      const stalks = 8;
      const cross = s.field(1, (u, v) => {
        const wob = fbmN(u, v, 6, 3, 0.5, cx.seed + 11) * 0.010;
        const p = ((u + wob) * stalks + 0.5) % 1;
        const d = p * 2 - 1;
        return sat(1 - d * d);
      });
      const groove = s.field(1, (u, v) => {
        const wob = fbmN(u, v, 6, 3, 0.5, cx.seed + 11) * 0.010;
        const p = ((u + wob) * stalks + 0.5) % 1;
        return smoothstep(0.70, 1.0, Math.abs(p * 2 - 1));
      });
      const stone = s.field(2, (u, v) => warpN(u, v, 12, 5, 1.0, cx.seed) * 0.5 + 0.5);
      /* Text column geometry, in metres rather than in fractions of a tile.
       *
       * `columnRegister` makes its quadrats one box-width square, so the box width *is* the glyph
       * size. At 0.20 of the tile it was a 1.44 m sign, and widening `tile[0]` to 5.0 above would
       * have quietly taken it to **2.0 m** — the same over-scale that put three-metre
       * hieroglyphs on the hypostyle walls, made worse by the fix for the ribs. TXT_W is 0.09 of
       * the repeat, i.e. 0.90 m: large, as befits a hypostyle column, but a *sign* rather than a
       * billboard, and it stacks six of them down the shaft instead of showing four. At the near
       * nave column (~8 m, 8.5 mm/px) that is 106 px and at the far end of the nave 28 px. */
      const TXT_W = 0.09, TXT_X = 0.5 - TXT_W * 0.5, TXT_Y = 0.20, TXT_H = 0.58;
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
        HG.columnRegister(ctx, size * TXT_X, size * TXT_Y, size * TXT_W, size * TXT_H, cx.seed + 3, HG.POOLS.divine, 'paint');
      });
      const textCut = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.columnRule(ctx, size, size * (TXT_X - 0.018), size * 0.008, size * 0.19, size * 0.79, 'line');
        HG.columnRule(ctx, size, size * (TXT_X + TXT_W + 0.018), size * 0.008, size * 0.19, size * 0.79, 'line');
        HG.columnRegister(ctx, size * TXT_X, size * TXT_Y, size * TXT_W, size * TXT_H, cx.seed + 3, HG.POOLS.divine, 'cut');
      });
      const textLine = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        HG.columnRegister(ctx, size * TXT_X, size * TXT_Y, size * TXT_W, size * TXT_H, cx.seed + 3, HG.POOLS.divine, 'line');
      });

      for (let i = 0; i < s.n; i++) {
        /* Relief and paint both damped, because the mesh already carries this rib (see above).
         * The groove in particular was a hard dark line 8-15 times around every column on top of
         * the geometry's 8 — halved, and its albedo contribution taken out of `t` entirely, so
         * what is left is a shallow trough that deepens the mesh's own valley rather than a
         * painted stripe that sits wherever the two happen to disagree. */
        s.h[i] = 0.42 + cross[i] * 0.22 - groove[i] * 0.11 + (stone[i] - 0.5) * 0.07;
        const t = sat(0.42 + (stone[i] - 0.5) * 0.60 + cross[i] * 0.05);
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
      /* Band paint survives better than glyph paint — it was thicker and re-applied — but it was
       * the one pigment in this file laid at *full chroma*: `keep` reaches 1.0 and, unlike
       * `paintRemnants`, nothing bleached it toward the stone first. A five-colour band at full
       * saturation is a hard rainbow stripe, and `tile[1]` is 4.5 (9.0 m of world) against a
       * 12.3 m shaft, so these bands do not land only at the foot and under the capital — they
       * repeat once more up the shaft, where a rainbow is both wrong and, being a thin horizontal
       * line of maximum chroma, the first thing to alias when the column is 30 m away. `BAND_FADE`
       * keeps the hue and takes the chroma down to something three thousand years old.
       *
       * The *registration* half of that is not fixable from here and belongs to ARCHITECTURE: a
       * tiling texture cannot know where the capital is. If the shaft's v were normalised to
       * shaft height instead of world metres, this tile would land exactly once and the bands
       * would sit where the recipe says they sit. */
      const BAND_FADE = 0.26;
      for (let i = 0; i < s.n; i++) {
        if (bandsMask[i] < 0.02 || paint.a[i] < 0.02) continue;
        const keep = sat((bandWear[i] * 0.8 + 0.35)) * bandsMask[i] * paint.a[i];
        const pr = paint.r[i] + (s.r[i] - paint.r[i]) * BAND_FADE;
        const pg = paint.g[i] + (s.g[i] - paint.g[i]) * BAND_FADE;
        const pb = paint.b[i] + (s.b[i] - paint.b[i]) * BAND_FADE;
        s.r[i] += (pr - s.r[i]) * keep; s.g[i] += (pg - s.g[i]) * keep; s.b[i] += (pb - s.b[i]) * keep;
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

  /* `tile` 0.9 → 1.2 and `bump` 0.004 → 0.020, both for measured reasons.
   *
   * **Scale.** One repeat is `2 x tile` metres of world (Kit's `UV_PER_M = 0.5`; see the note in
   * Textures._build), so this was 1.8 m and its energy sat at 1–3 cm: the wrinkle field ran 26
   * cycles per tile (7 cm) and the pinholes 34 Worley cells (5 cm). Gold in the canonical shots
   * is the hook rings and spire tips at 15–30 m and the sarcophagus and false door at 5–16 m; at
   * `hero`'s 1.115 mrad/px one pixel is 17–29 mm out there, so **44–73 % of this material's
   * albedo variance was below a pixel at every distance it is ever seen from.** Same shape as
   * `MOTES.size` and `sand_ripples`. At 1.2 the repeat is 2.4 m, the leaf sheets are 60 cm and
   * the planishing dishes 12 cm — both comfortably resolved at 25 m, both still fine enough to
   * be beaten metal in `interior` at 5 m.
   *
   * **Relief.** 4 mm across a 1.8 m repeat gave a 90th-percentile normal tilt of 5.2°, and the
   * gold specular lobe is about 8° wide. A surface flatter than its own highlight cannot break
   * that highlight up: it lights uniformly or not at all, which is the "yellow ball with a dot
   * on it" the shader's own comment warns about. 20 mm across 2.4 m puts the tilt where a
   * fraction of texels sit inside the lobe at any orientation, which is what a scatter of hard
   * glints is made of. */
  gold_leaf: {
    group: 'metal', tier: 1, tile: 1.2, bump: 0.020, rough: 0.20,
    // Dark occlusion is half of §7.3's gold line. The catalogue default floor (0.16) is a
    // *stone* number, set so shadowed sandstone keeps readable detail; on metal the seam
    // between two beaten sheets should go nearly black, because the glint next to it is what
    // it has to be read against.
    aoStrength: 1.45, aoFloor: 0.05,
    build(s, cx) {
      const size = s.size;
      s.fill(PAL.goldMid); s.fillH(0.62); s.rough.fill(0.30); s.metal.fill(1);
      // Beaten leaf laid in overlapping squares: the seams are the tell. Four sheets across a
      // 2.4 m repeat is a 60 cm sheet — the size gold leaf is actually laid in on furniture.
      const sheets = 4;
      const seam = s.field(1.5, (u, v) => {
        const jx = fbmN(u, v, 5, 3, 0.5, cx.seed + 3) * 0.02;
        const a = Math.abs(tri((u + jx) * sheets)), b = Math.abs(tri((v + jx) * sheets));
        return sat(1 - Math.min(a, b) / 0.10) ** 2;
      });
      /* Planishing. A gilded core is beaten down onto its ground with a round-faced hammer, and
       * what that leaves is a field of shallow dishes with sharp rims between them. This is the
       * term that supplies the *slope*: a Worley dish has a hard boundary, so the rim is a real
       * crease rather than the gentle undulation the old `warpN` wrinkle gave. 20 cells across
       * the repeat is a 12 cm blow, which is right for sheet over a wooden core and — the point
       * — three pixels across at twenty-five metres. */
      const dw = {};
      const dish = s.field(2, (u, v) => {
        const w = worleyN(u, v, 20, cx.seed + 71, 0.95, dw);
        return sat(1 - w.f1 / (0.42 + w.id * 0.24));
      });
      const rim = s.field(2, (u, v) => {
        const w = worleyN(u, v, 20, cx.seed + 71, 0.95, dw);
        return sat(1 - (w.f2 - w.f1) / 0.20) ** 1.2;
      });
      // Fine leaf wrinkle on top of the dishes — kept, but no longer the only structure.
      const wrinkle = s.field(2, (u, v) => warpN(u, v, 34, 4, 1.2, cx.seed + 7) * 0.5 + 0.5);
      /* The low-frequency term the material had none of: which parts of this piece of gold are
       * catching the room and which are in their own shade. At 3 and 1 cycles per repeat that is
       * 80 cm and 2.4 m of world — bigger than most of the objects this dresses, so on a hook
       * ring or a spire it reads as one side being bright and the other deep, which is exactly
       * how a small metal object reads and is impossible to get from any amount of grain.
       *
       * **This term carries the amplitude, and the planishing does not.** The first version of
       * this recipe put the swing on the Worley rim, and it failed the squint test outright: at
       * an eight-fold downsample the tile was a uniform gold-and-brown mush with no shape in it
       * at all — a net of bright cell walls is high-frequency randomness, which is the exact
       * failure the first pass of this whole catalogue was rejected for. The rim keeps its
       * *height* (a crease is a crease, and that is where the hard glint comes from) and gives
       * up most of its *paint*. Relief at high frequency, value at low frequency: that is the
       * division of labour that lets both halves of §7.3 pass at once. */
      const swathe = s.field(5, (u, v) => sat(
        warpN(u, v, 1, 3, 1.35, cx.seed + 307) * 0.72
        + warpN(u, v, 3, 4, 1.3, cx.seed + 211) * 0.40 + 0.5));
      const dust = s.field(4, (u, v) => sat(warpN(u, v, 5, 4, 1.2, cx.seed + 13) * 1.4 + 0.5));
      const hole = s.field(2, (u, v) => {
        const w = worleyN(u, v, 22, cx.seed + 19, 1.0);
        return w.id < 0.10 ? sat(1 - w.f1 / 0.14) ** 2 : 0;
      });
      const t3 = [0, 0, 0];
      for (let i = 0; i < s.n; i++) {
        /* Value. The dish floor is deep, the rim between dishes is hot, and the swathe decides
         * which region of the piece gets to be hot at all — so the bright texels come out as a
         * *connected network of rims inside a lit region*, not as salt-and-pepper. */
        const t = sat(0.52 + (1 - dish[i]) * 0.11 + rim[i] * 0.15
          + (swathe[i] - 0.5) * 1.10 + (wrinkle[i] - 0.5) * 0.12 - seam[i] * 0.20);
        goldRamp(t, t3);
        s.r[i] = t3[0]; s.g[i] = t3[1]; s.b[i] = t3[2];
        // Height keeps the full planishing structure even though the albedo gave most of it up:
        // the crest that catches the specular lobe has to be a real crease, and the value and
        // the relief still agree in sign, so a highlight never lands where the albedo is dark.
        s.h[i] = 0.56 - dish[i] * dish[i] * 0.34 + rim[i] * 0.30
          + (wrinkle[i] - 0.5) * 0.16 - seam[i] * 0.30;
        s.rough[i] = goldRough(t);
        // Pinholes where the leaf tore: red bole ground shows, and it is not metal any more.
        if (hole[i] > 0.02) {
          s.mixHex(i, PAL.red, hole[i] * 0.9);
          s.metal[i] = 1 - hole[i] * 0.95;
          s.rough[i] = sat(s.rough[i] + hole[i] * 0.55);
          s.h[i] -= hole[i] * 0.20;
        }
        // Dust dulls gold faster than anything; without it gold reads as plastic. It settles on
        // the crests, which is also where it does the most good — it stops the bright tail
        // becoming a uniform bright tail.
        const d = sat(dust[i] - 0.55) * 0.8;
        s.mixHex(i, PAL.sandLight, d * 0.20);
        s.rough[i] = sat(s.rough[i] + d * 0.34);
        s.metal[i] *= 1 - d * 0.35;
        // The seam between two sheets is a gap: dark, dirty, and where the AO has to bite.
        s.occ[i] *= 1 - seam[i] * 0.45;
      }
      weather(s, { seed: cx.seed + 6, crevice: 0x4a3612, creviceAmt: 0.52, creviceRadius: 7, streakAmt: 0.16, dustAmt: 0.10, dust: PAL.limeMid, roughGrime: 0.14, downDark: 0.12, patina: 0.05 });
      grain(s, { amount: 0.016, freq: 260, seed: cx.seed + 8, heightAmt: 0.006 });
      /* The same backstop the stone recipes carry, for the same reason: the cel shader adds a
       * flat violet wash proportional to `1 - key`, so any texel dark enough that its own albedo
       * stops dominating renders violet rather than dark. Opening gold's value range downward is
       * the point of this recipe, so it needs the floor more than the stone does — the crevice
       * hex here is a *gold* one, so a shadowed seam bottoms out as dark gilding. */
      rampFloor(s, { crevice: GOLD_DEEP });
    },
  },

  /* Not currently requested by any consumer (nothing in `Architecture.RECIPES` or
   * `Props.MATERIALS` names it), so this is kept correct rather than tuned in frame. It gets the
   * same value policy as `gold_leaf` so that whoever reaches for it does not reintroduce the
   * bright-flat-sheet failure — and the same scale correction: 0.7 was a 1.4 m repeat with a
   * 6 cm hammer facet, of which 87–98 % was sub-pixel at the distances gold appears at. */
  gold_hammered: {
    group: 'metal', tier: 1, tile: 1.1, bump: 0.016, rough: 0.28,
    aoStrength: 1.40, aoFloor: 0.06,
    build(s, cx) {
      const size = s.size;
      s.metal.fill(1);
      const facetF = 16;
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
          const t = sat(0.22 + (1 - dish) * 0.62 + (macro[i] - 0.5) * 0.58 + (w.id - 0.5) * 0.2);
          const col = goldRamp(t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          s.rough[i] = sat(goldRough(t) + dish * 0.18);
        }
      }
      chiselMarks(s, { amount: 0.02, angle: 0.85, freq: 90, seed: cx.seed + 3 });
      weather(s, { seed: cx.seed + 6, crevice: 0x4e3a14, creviceAmt: 0.50, streakAmt: 0.14, dustAmt: 0.12, dust: PAL.limeMid, roughGrime: 0.18, downDark: 0.12, patina: 0.05 });
      grain(s, { amount: 0.014, freq: 280, seed: cx.seed + 8, heightAmt: 0.004 });
      rampFloor(s, { crevice: GOLD_DEEP });
    },
  },

  /* **The flattest material in the catalogue, and it is a metal.** Measured off the packed
   * albedo at shipping resolution, before any of the rework below: luma p01 0.316 → p99 0.486,
   * i.e. the *entire* surface inside 0.6 of a stop; `lumaRms` **0.0315**, lower than every other
   * recipe except the three deliberately flat cloth maps; baked AO p01 **0.863**, so there is no
   * occlusion anywhere in it; and a normal whose median tilt is **1.15°** and 90th percentile
   * 2.95°, against a specular lobe about 8° wide. Those are every number `gold_leaf` was
   * condemned on in the note above `goldRamp`, and worse on each one. A flat mid-value sheet with
   * no dark, no highlight and no relief is painted plaster, and this dresses the braziers in
   * `courtyard`, `night`, `interior` and `guard`.
   *
   * There was a scale error under it too, of the shape this file has now hit four times. The one
   * term with any bite was `grain(freq 340)`, which on a 1.6 m world repeat is a **4.7 mm**
   * feature — 0.15 px at the 32 m the courtyard braziers are seen from. The relief budget was
   * being spent an order of magnitude below the pixel.
   *
   * So: the same three ingredients the gold policy is built on, at bronze values. A dark ground
   * (bronze is a much darker metal than gilding and has further to fall), casting relief at
   * 6–20 cm where a glint can actually resolve, and occlusion that goes properly dark in the
   * blowholes and under the patina crust. `tile` 0.8 → 1.0 puts the repeat at 2.0 m, which is
   * bigger than any brazier bowl it dresses, so nothing shows a repeat at all. */
  bronze_aged: {
    group: 'metal', tier: 1, tile: 1.0, bump: 0.026, rough: 0.42,
    // Same reasoning as `gold_leaf`: on metal the seam and the blowhole should go nearly black,
    // because the glint next to them is what they have to be read against.
    aoStrength: 1.35, aoFloor: 0.06,
    build(s, cx) {
      const size = s.size;
      /* A dark, saturated ground. The old base was `goldDark` 30% toward black, which lands at
       * 0.36 luma and never left it; this one is deeper and greener, so the bright tail below has
       * something to be brighter *than*. */
      // Hex, not an rgb triple: `mixHex` bit-shifts its arguments, so handing it the array the
      // old code kept here silently evaluates to black. Everything in this file that round-trips
      // a blend back into another blend goes through `MX`/`rgb2hex` for exactly that reason.
      const bronze = MX(MX(PAL.goldDark, PAL.malachite, 0.22), PAL.black, 0.46);
      const hot = MX(PAL.goldLight, PAL.sun, 0.30);
      s.metal.fill(1); s.rough.fill(0.40);
      const cast = s.field(2, (u, v) => warpN(u, v, 18, 5, 1.0, cx.seed) * 0.5 + 0.5);
      /* The two terms that supply the *slope*. Sand-cast bronze is a shallow orange-peel over a
       * mould, with the odd blowhole; at 9 cells and 26 cells across a 2.0 m repeat that is a
       * 22 cm swell and an 8 cm pock — 7 px and 2.5 px at 32 m, both resolvable, where the old
       * 4.7 mm grain was not. */
      /* Smooth, not Worley. A Worley dish has a hard cell *wall*, which is right for planished
       * gold leaf where the rim is a real crease, and wrong here: sand-cast bronze is an orange
       * peel, and 9 hard-edged cells across a 2 m repeat rendered in the lab as a field of dark
       * leaf-shaped blobs — the cells' shadowed flanks — which reads as leopard print. Only the
       * blowholes below are allowed a discontinuity, because only they have one. */
      const swell = s.field(3, (u, v) => warpN(u, v, 9, 4, 1.10, cx.seed + 23) * 0.5 + 0.5);
      /* Blowholes: 16 cells across the 2.0 m repeat is a 125 mm cell and a ~55 mm pock, which is
       * 1.8 px at `courtyard`'s 32 m and 5.3 px at `guard`'s 14 m. At the 26 cells this started
       * from the pock was 34 mm — about one pixel at the far framing, where a scatter of
       * one-pixel glints is not a scatter of glints, it is a slightly lighter tone. Fewer and
       * larger is the same relief budget spent where the frame can see it. */
      const blow = s.field(2, (u, v) => {
        const w = worleyN(u, v, 16, cx.seed + 7, 1.0);
        return w.id < 0.30 ? sat(1 - w.f1 / 0.26) ** 2 : 0;
      });
      /* Which side of the casting is catching the room. One and three cycles per 2 m repeat, so
       * on a brazier bowl it reads as one flank bright and the other deep — the low-frequency
       * term that makes a small metal object read as metal, and the one this recipe had none of.
       * Value at low frequency, relief at high frequency: the same division of labour that lets
       * `gold_leaf` pass the squint test and the 1:1 crop at once. */
      const swathe = s.field(5, (u, v) => sat(
        warpN(u, v, 1, 3, 1.35, cx.seed + 401) * 0.78
        + warpN(u, v, 3, 4, 1.30, cx.seed + 149) * 0.38 + 0.5));
      const t3 = [0, 0, 0];
      for (let i = 0; i < s.n; i++) {
        /* Biased low for the same reason `goldRamp` is: a symmetric field through a symmetric
         * ramp returns the flat mid-value sheet this replaces. The mass sits on the dark ground
         * and only the swell crests inside a lit swathe reach the tail. */
        const t = sat(0.30 + swell[i] * 0.32 + (swathe[i] - 0.5) * 1.00 + (cast[i] - 0.5) * 0.26);
        const k = Math.pow(t, 1.35);
        if (k < 0.60) mixHex(bronze, PAL.goldDark, k / 0.60, t3);
        else mixHex(PAL.goldDark, hot, (k - 0.60) / 0.40, t3);
        s.r[i] = t3[0]; s.g[i] = t3[1]; s.b[i] = t3[2];
        s.h[i] = 0.62 + swell[i] * 0.26 + (cast[i] - 0.5) * 0.10 - blow[i] * 0.40;
        // Roughness tied to value, so the lobe only fires where the albedo is already hot and
        // the additive highlight sums onto bronze instead of onto mud.
        /* Same shape as `goldRough`, and for the same reason: PROPS' bronze is flagged `metal`,
         * so `specAmt` carries the 3.04× metal multiplier. Swept over the hemisphere this recipe
         * measured a peak specular of 4.30 with **14.3 %** of the surface blown past 1.0 — a
         * sheet, not a scatter. Squaring holds the crest roughness where it was and lifts
         * everything below it, which cuts the blown *area* without touching the glint. */
        s.rough[i] = sat(0.76 - Math.pow(k, 2.0) * 0.60 + blow[i] * 0.30);
        s.occ[i] *= 1 - blow[i] * 0.55;
      }
      /* Patina grows in the recesses and runs downhill from them — verdigris obeys gravity.
       *
       * **Rebalanced against the image, not against a number.** Raising the casting relief above
       * made `concavity` find far more concave surface, and feeding `blow` in at 0.8 put a green
       * blob on *every* blowhole; with the drips on top the tile came out of the lab as dark
       * green blotches with cyan tails on olive — leopard print, i.e. precisely the
       * high-frequency-randomness failure the first pass of this catalogue was rejected for. The
       * value statistics were on target at the time and had nothing to say about it.
       *
       * The fix is to keep the patina where a mineral crust actually forms and let it be
       * subordinate: the *deep* concavities carry it, blowholes only tint, the drips are a
       * suggestion rather than a feature, and the whole thing is gated on a low-frequency patch
       * field so roughly a third of the piece is green and the rest is metal. `p` also stops well
       * short of opaque — a brazier lit for three thousand years is scoured bright where hands
       * and fuel touch it, and verdigris at full strength is not bronze any more, it is a flat
       * green mineral with the metal read thrown away. */
      const conc = concavity(s.h, size, Math.max(2, Math.round(size / 90)), 2);
      let cmax = 1e-6;
      for (let i = 0; i < s.n; i++) if (conc[i] > cmax) cmax = conc[i];
      const patch = s.field(4, (u, v) => sat(warpN(u, v, 4, 4, 1.3, cx.seed + 13) * 1.6 + 0.42));
      const src = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) {
        // Squared, so the shallow two thirds of the concavity range contributes almost nothing
        // and only the real hollows nucleate crust.
        const c = sat(conc[i] / cmax);
        src[i] = sat(c * c * 1.15 + blow[i] * 0.22);
      }
      const run = streakDown(src, size, 0.975, cx.seed + 3);
      for (let i = 0; i < s.n; i++) {
        const gate = sat((patch[i] - 0.42) * 1.9);
        const p = sat((src[i] * 0.85 + run[i] * 0.30) * gate);
        if (p <= 0.01) continue;
        const green = mixHex(PAL.malachite, PAL.turquoise, 0.30 + patch[i] * 0.35);
        const q = sat(p * 0.52);
        s.r[i] += (green[0] - s.r[i]) * q;
        s.g[i] += (green[1] - s.g[i]) * q;
        s.b[i] += (green[2] - s.b[i]) * q;
        s.metal[i] *= 1 - sat(p) * 0.70;                        // patina is a mineral, not metal
        s.rough[i] = sat(s.rough[i] + p * 0.35);
        s.h[i] += p * 0.05;                                     // crust builds up
      }
      // Handled edges wear back to bright metal.
      const sky = skyward(s.h, size, Math.max(1, Math.round(size / 300)));
      for (let i = 0; i < s.n; i++) {
        const up = sat(sky[i]) * sat(1 - src[i] * 2);
        s.mixHex(i, PAL.goldLight, up * 0.30);
        s.rough[i] = sat(s.rough[i] - up * 0.16);
        s.metal[i] = sat(s.metal[i] + up * 0.3);
      }
      /* `freq` 340 → 150. On a 2.0 m world repeat 340 cycles is a **5.9 mm** feature, which is
       * 0.19 px at the 32 m the `courtyard` braziers are seen from and 0.5 px at the 14 m of
       * `guard` — it existed in the buffer and could not appear in the image at any framing this
       * material is used at, while still costing a mip-0 shimmer source. 150 cycles is 13 mm,
       * about 0.4–1 px close in and honestly gone at distance, which is what a *grain* should be.
       * The relief that has to survive is the swell and the blowholes, and they are 22 cm and
       * 8 cm. */
      grain(s, { amount: 0.02, freq: 150, seed: cx.seed + 8, heightAmt: 0.005 });
      /* Bronze is the darkest metal in the level, so it is the one most exposed to the shader's
       * additive violet wash on a near-black texel. Floor it in its own hue — and note that the
       * floor hex has to sit at *crevice* luminance (§2.2's `#4a2f22` is 0.203), not at the
       * material's own mid-tone. A first attempt used a 0.44-luma green-gold here and `rampFloor`
       * duly lifted everything below 0.44, which is most of a dark metal: the value range came
       * out narrower than the flat sheet this recipe was rewritten to replace. The measurement
       * caught it; reasoning about it would not have. */
      rampFloor(s, { crevice: MX(PAL.malachite, PAL.black, 0.70) });
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

  /* **The catalogue's worst near-black tail on a surface that is actually in a canonical shot.**
   *
   * `darkTail` — the fraction of texels below §2.2's `crevice #4a2f22` luminance, 0.2031 — was
   * **0.141** here, twenty times the worst stone offender, on a recipe with no `rampFloor` at
   * all. Palms stand in `courtyard` (10 m from the camera, 53 px/m) and `dunes`.
   *
   * That threshold is not decoration, and it is worth writing down why it applies to bark and
   * not only to stone. In shadow the shader's terms on a texel are
   * `albShadow·uShadowColor·shadowMix·mix(0.55,1,ao)` plus `albAmb·fill·ao` plus a *flat*
   * additive `uShadowColor·uShadowWash·shadowMix·ao`. With `shadowWash 0.15` and the shadow
   * light at linear (0.142, 0.189, 0.423), the additive term is (0.021, 0.028, 0.063) — fixed,
   * independent of albedo. A bark texel at sRGB luma 0.13 is linear ~0.014, so its own
   * multiplied contribution is about (0.002, 0.003, 0.006): **the flat violet is an order of
   * magnitude larger than the material.** Fourteen per cent of the trunk was rendering as
   * shadow-hue rather than as bark, which is the same defect that put violet blotches on the
   * walls, arriving by the same route.
   *
   * Fixed at the source rather than with the floor, following `mudbrick`'s note: `rampFloor`'s
   * pull is `(lo − y)/lo` and goes to zero as a texel approaches the threshold, so it cannot
   * move a texel that sits just under the line. The ramp's dark stop was luma 0.162 and
   * `weather`'s crevice hex `0x241608` was **0.094** — less than half the threshold, mixed in at
   * `creviceAmt 0.62`. Both now sit just above it and keep the hue; `rampFloor` goes on as the
   * backstop it is meant to be.
   *
   * The bark does not go flat for it: the ramp's *range* is what carries this material and the
   * bright end is untouched, so the lift costs the bottom 6% of the value range and nothing
   * else. Checked, not assumed — luma RMS and the whole mip ladder are reported below. */
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
          const col = ramp3(BARK_DARK, PAL.sandDark, PAL.sandMid, t);
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
      weather(s, { seed: cx.seed + 6, crevice: BARK_CREV, creviceAmt: 0.62, streakAmt: 0.18, dustAmt: 0.20, roughGrime: 0.06, downDark: 0.08 });
      /* 300 cycles on the ~3.1 m Vegetation lays this tile over is a 10 mm feature: 0.54 px on
       * the `courtyard` palm and 0.08 px in `dunes`, i.e. below the pixel at both framings it
       * appears in. Dropped to 90 (34 mm, 1.8 px at `courtyard`) so the grain is something the
       * frame can carry rather than mip-chain fodder. */
      grain(s, { amount: 0.04, freq: 90, seed: cx.seed + 8, heightAmt: 0.014 });
      /* `lift` 0.14: `lo·(1 − 0.14)` = 0.2108, just clear of §2.2's `crevice` luminance 0.2031,
       * so nothing on a palm trunk can land where the shader's violet wash out-weighs its own
       * albedo. Palms stand in `courtyard` and `dunes` and this recipe was the worst live
       * offender in the catalogue outside the deliberately-black character maps: `darkTail`
       * 0.0367 at shipping resolution *with this floor already applied*, because the lerp on its
       * own leaves mid-dark texels short of the line (see `rampFloor`). */
      rampFloor(s, { crevice: BARK_CREV, lift: 0.14 });
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
          const col = ramp3(TIMBER_DARK, PAL.sandDark, woodPale, t);
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
      /* `crevice` was `0x241609`, luma 0.094 — less than half the value the invariant defends,
       * mixed at 0.55. A split in old timber is genuinely the darkest thing on the plank, but it
       * is still *timber*, and below the line it stops rendering as dark wood and starts
       * rendering as the shader's flat violet. Kept as the darkest hex in the recipe, moved onto
       * the palette's own crevice value. */
      weather(s, { source: check, seed: cx.seed + 6, crevice: PAL.sandCrev, creviceAmt: 0.55, streakAmt: 0.28, dustAmt: 0.14, roughGrime: 0.08 });
      grain(s, { amount: 0.03, freq: 330, seed: cx.seed + 8, heightAmt: 0.006 });
      // The floor this recipe never had. `lift` 0.24 puts the hard minimum at 0.2096.
      rampFloor(s, { crevice: TIMBER_CREV, lift: 0.24 });
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
      /* Same value policy as the rest of the gold (see `goldRamp`): the crown of the cell wall
       * is hot and its foot, where it meets the stone, is deep. A cloisonné wall is 2 mm of
       * upstanding gold, so it is *all* edge — if it is uniformly bright the whole grid reads as
       * a yellow lattice printed on the stone rather than as wire standing off it. */
      const gt = sat(0.30 + (1 - sat((1 - soft[i]) * 2.2)) * 0.46 + (polish[i] - 0.5) * 0.80);
      const gc = goldRamp(gt);
      s.r[i] += (gc[0] - s.r[i]) * g; s.g[i] += (gc[1] - s.g[i]) * g; s.b[i] += (gc[2] - s.b[i]) * g;
      s.metal[i] = g;
      s.rough[i] = lerp(s.rough[i], goldRough(gt), g);
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
  /* The floor the whole inlay family was missing. `lapis_inlay` reported `darkTail` 0.0257 and
   * `carnelian_inlay` 0.0062 with no `rampFloor` anywhere in this helper, and the cause is one
   * line above the loop: `stoneDeep = MX(stoneHex, inkCool, 0.42)` puts lapis at luma **0.199**,
   * already under §2.2's `crevice` 0.2031 before `weather`'s 0.078 crevice mixes it further down.
   *
   * The floor hex is derived from `stoneHex` rather than fixed, so each variety bottoms out in
   * its *own* hue — a shadowed lapis cell goes deep blue, a carnelian one goes deep red. That is
   * the point of the invariant: not "no dark", but "no dark that the additive violet wash can
   * take over". Lapis is the tightest case at luma 0.238, and `lift` 0.12 puts its hard minimum
   * at 0.2094. */
  rampFloor(s, { crevice: MX(stoneHex, PAL.inkCool, 0.24), lift: 0.12 });
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
  /* **The column count is derived from a glyph size in metres, not chosen.** That inversion is
   * the fix for §7.3's "visible texture tiling repetition" on every inscribed wall in the level,
   * and the reason is a scale error nobody had checked.
   *
   * `columnRegister` fills its box with square quadrats one column wide, so the glyph size is
   * `0.76 * worldTile / cols`. At `cols = 3` on `hieroglyph_wall`'s 10.4 m world repeat that is
   * a quadrat **2.63 m wide and 3.12 m tall**, and `round(0.30 / (0.2533 * 1.02)) = 1` — so the
   * tall register was literally *three three-metre hieroglyphs*, and a wall showed the same three
   * again every 10.4 m. Rendered as the consumer lays it (three repeats box-downsampled to the
   * 267 px per repeat the `courtyard` camera sees at 40 m) that is nine identical red stools,
   * blue beetles and yellow faces in perfect rows. A three-metre sign is not writing, it is a
   * billboard, and a billboard is the most recognisable thing a repeat can contain.
   *
   * Both previous passes tuned `cols` — 4 was rejected as "a wall of postage stamps", 3 was the
   * answer — and both were arguing about how many billboards to show. At 4 columns the quadrat
   * was 2.0 m; the lattice complaint was about *large isolated coloured cells*, which is a
   * different failure from a dense inscription and does not bind here. A temple wall's signs are
   * 0.3–0.8 m, and a dense field of small varied marks has no landmark in it, so the eye has
   * nothing to recognise on the next repeat: the repetition is solved by removing the thing that
   * repeats visibly rather than by making the tile bigger, which was tried at 6.4 m and starved
   * the obelisk.
   *
   * Sub-pixel check, because that is the failure this trades against: 0.72 m is 21 px at
   * `temple`'s far wall (36 m, 1.067 mrad/px), 19 px at `courtyard`'s 40 m and 78 px on the near
   * hall wall. The line work inside a glyph is ~1/8 of that, so it dissolves to tone at distance
   * and resolves close up, which is what it should do.
   *
   * `tall`/`frieze` still hold the *proportion* of wall that is writing at 40%, so the majority
   * is plain dressed stone — §2.3's "large simple areas of colour, detail concentrated at focal
   * points" is unchanged. Only the sign size moved. */
  const { worldTile = 10.4, glyphM = 0.72, cartouche = true, tall = 0.30 } = o;
  const cols = Math.max(2, Math.round((0.76 * worldTile) / glyphM));
  /* `rowRegister` takes its quadrat size from the band *height*, so the frieze's sign size is
   * the band height and nothing else. Left at the old fixed 0.10 of the tile it drew 1.04 m
   * signs — and one of them, a tall green sign, was still legible as the same mark once per
   * repeat after the tall register had stopped giving the tiling away. Derive it from the same
   * metre figure so the two bands cannot drift apart again. */
  const frieze = clamp(glyphM / worldTile, 0.03, 0.12);
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

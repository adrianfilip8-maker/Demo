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
 *
 * ── "Gold cannot reach bloom" is true of one recipe and false of the other ────────────────────
 *
 * Two numbers in the record disagreed, and they were being read as the same quantity:
 *
 *   - `PostFX.js:228`'s client table — "gold spec glints ~6.8", comfortably ABOVE the 1.90
 *     feed onset (threshold 2.20 - knee 0.30).
 *   - a chain inversion reported as "spec at scene 1.46-1.57", i.e. BELOW it, which was taken
 *     to mean gold can never glint and was used to close the question.
 *
 * **Neither is wrong; they are different terms of the same expression.** 1.46-1.57 is
 * `specAmt` — `uSpec · (1 − 0.75·rgh) · mix(1, 3.4, metal)` at `gold_leaf`'s median roughness
 * 0.638, which computes to **1.506**. That is a mid-chain *coefficient*. The scene value the
 * bloom feed thresholds on is `specTint · specAmt · specStep`, and the two factors omitted are
 * `specTint` (1.2–1.9 on metal, being `alb·2 + 0.25·specColor`) and `specStep` (**1.35** at the
 * lobe peak, not 1.0). Scoring a coefficient against an output threshold is the same category
 * error KNOWN_ISSUES §8 records for the shadow work — a surface measurement against a light
 * spec — and it produced the same shape of answer: a confident impossibility claim.
 *
 * Measured off the built Surfaces, per texel, at `ndh = 1` and `sh = 1`
 * (`scratchpad/goldbloom.mjs`; percentiles over the gild mask, `metal > 0.5`):
 *
 * | recipe | consumer `spec` | gild p50 | p99 | max | **% ≥ 1.90 onset** |
 * |---|---|---|---|---|---|
 * | `gold_leaf` | 0.95 (Architecture) | 1.82 | 4.77 | 6.07 | **46.4 %** |
 * | `gold_leaf` | 0.90 (Props `gold`) | 1.72 | 4.52 | 5.75 | **41.9 %** |
 * | `hieroglyph_gilded` | 0.55 (Architecture) | 0.95 | 1.74 | 2.26 | **0.38 %** |
 * | `bronze_aged` | 0.60 (Props `bronze`) | 0.51 | 0.96 | 1.65 | 0 % |
 * | `ceiling_stars` | 0.20 (Architecture) | 0.28 | 0.34 | 0.35 | 0 % |
 *
 * `gold_leaf`'s max of 6.07 is PostFX's "~6.8" (the earlier 7.02 here was the same sweep at a
 * different size/seed), so that table row was right about `gold_leaf` all along. **Gold reaches
 * bloom easily on the hook rings, the cane and the gilded Ra.** What does not reach it is
 * `hieroglyph_gilded` — and per KNOWN_ISSUES §8 that recipe is **28.7 % of `hero`**, so it is
 * the surface deciding §7.3's "gold doesn't read as metal", while the recipe that works sits on
 * small props. That is why the frame kept reading as painted plaster while the numbers on
 * `gold_leaf` looked fine.
 *
 * **The lever is not in this file, and I checked rather than assumed.** Sweeping the two
 * candidates on `hieroglyph_gilded`, % of gild mask over onset:
 *
 *     consumer `spec`  0.55 → 0.38 %   0.70 → 4.76 %   0.85 → 16.4 %   0.95 → 29.9 %
 *     uniform roughness (this file)   rgh 0.50 → 0 %   0.30 → 0.38 %   0.10 → 9.36 %
 *
 * Driving *every* texel of the gilding to a mirror polish — far past anything defensible, and
 * past what `goldRough` should ever author, since the crest/body split is what breaks one lobe
 * into a scatter of glints — buys 9.36 %, less than moving `spec` to 0.85. **So TEXTURES cannot
 * fix this line from its own files.** `spec: 0.55` in `Architecture.RECIPES` is the binding
 * constraint; `gold_leaf` next to it is already 0.95.
 *
 * The decisive experiment is one boot, no new geometry: poke `uSpec` (`ToonMaterial.js:825`, a
 * live uniform) on the material named `arch:hieroglyph_gilded` (`Architecture.js:199`) across
 * 0.55 / 0.85 in a single capture, the same shape as `scratchpad/bloomsweep.mjs`. Owner:
 * ARCHITECTURE, whose constant it is.
 *
 * **What these numbers are not.** They are an upper bound at mip 0 with the half-vector on the
 * texel's normal. Six transforms sit between them and the frame, listed in the probe header;
 * the two that matter are that nothing here checks any normal is so oriented (the lobe is
 * 10.8–14.1° half-angle, against normal tilts whose p50 is 33.8°, which is the intended
 * scatter) and that mip filtering box-averages a sparse peak away. A texel *below* the onset
 * here provably cannot feed bloom in frame; one above it still might not. The asymmetry is the
 * point — this is a necessary condition, which is exactly what was needed to refute an
 * impossibility claim, and it is not evidence that the glints are landing.
 *
 * ── The mip caveat above is now MEASURED, and it is not what capped the glints ───────────────
 *
 * The uSpec poke ran (`shots/spec1`, 0.55/0.85/0.95): localised on-form lift, real, and 0 px at
 * display L ≥ 235 in every arm. Measured per pixel off the built geometry
 * (`scratchpad/gildmip.mjs`), the population that responds — the kiosk lintel, the pixels the
 * verdict was decided on — samples the ORM at **mip ~0** (λ_iso p50 0.09; 0.00 with aniso), so
 * the only loss between the table above and the frame is `packORM`'s own div-2 (max 3.91 → 3.61
 * at uSpec 0.95, over-onset 29.9 % → 26.5 %; `scratchpad/gildmips.mjs`). The mask transfers.
 * What caps the frame is the **AgX shoulder**: the responsive cohort measures L(0.55) 187.9,
 * L(0.85) 200.6, L(0.95) 203.9 — L 235 back-solves to ≈ 2.7× the scene spec of the 0.95 arm,
 * and every texture-side lever stacked (ormDiv 1: ×1.09; crest parity with gold_leaf: ×1.56
 * max, at the dirty-snow cost; peak-preserving mips: ×1.13 where mips barely engage) tops out
 * under ×1.9. Hand-authored mip chains are also the wrong tool at distance: min-rough mips take
 * the L3 over-onset share to 60 %, i.e. whole far bands catching the lobe — "glows uniformly".
 * So §7.3's "hot" on gilded architecture is bloom's to deliver (metal-aware feed, POSTFX);
 * this file's share of the gold line — dark occlusion, value mass, crest scatter — is done.
 * Full working: `scratchpad/RESULT-goldmip.md`, pre-registered in `PREREG-goldmip.md`.
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

/**
 * Crevice floor for the *carved* sandstone recipes, as opposed to the crevice *colour*.
 *
 * §2.2's `crevice #4a2f22` is luma **0.2031**, which is exactly the line the dark-tail invariant
 * is measured against — and `rampFloor`'s pull is `(lo − y)/lo`, which vanishes as a texel
 * approaches `lo`. So passing `PAL.sandCrev` as the floor asks it to defend a line it is standing
 * on, and everything just under slips through. Same lesson, same arithmetic and same fix as
 * `BARK_CREV`: a floor has to sit *above* the threshold it defends.
 *
 * This is `#4a2f22` scaled x1.15 — the same hue, so §2.2's crevice is still what a recess reads
 * as — at luma **0.2334**, clear of the line by the margin `BARK_DARK` uses. It touches only the
 * texels that were already below §2.2's crevice, which is 0.03 % of the map, and lifts them by at
 * most 0.03 luma. It is *not* a general lightening of the crevices: the deep occlusion a carving
 * needs lives in `derive()`'s AO and in `s.h`, not down here.
 */
const SAND_CREV_FLOOR = 0x553627;

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
/* 5.2 declared, so 10.4 m of world per repeat through the 2x consumer factor.
 *
 * ── §7.3 "visible texture tiling repetition": measured, and the remaining lever is not here ──
 *
 * Repeat periods at the ten canonical framings, from an offline z-buffered rasterisation of the
 * real cameras at the real 1280x720 (scratchpad `angsize.mjs`; per-pixel depth and obliquity, so
 * `mm/px = z x 2tan(fov/2)/H` and the repeat is `worldTile / mm-per-px`):
 *
 *   temple      248 px  ->  2.8-6.1 repeats across the frame   17.0% of frame
 *   courtyard   688 px  ->  1.5-6.3                            22.2%
 *   night       252 px  ->  5.1-5.2                            14.7%
 *   traversal   286 px  ->  4.5-6.7                            15.1%
 *   dunes       190 px  ->  6.7-9.8                            15.3%
 *
 * **The critic's pass-3 tiling probe sampled 32/48/64/96/128 px windows on this wall.** Every one
 * of those is inside a single repeat, so it measured *detail* and reported it as *repeat*. The
 * number that matters is 2.8-9.8 repeats in frame, and at that count tiling is only visible if
 * the tile carries an anchor the eye can match across repeats.
 *
 * It does. Template-matching distinctiveness — take a patch, slide it over the wrapped tile, and
 * score `1 - (best non-self NCC)/(self NCC)`, swept over patch sizes because guessing one scale
 * is how the first attempt missed it (an eighth-scale low-pass scored every recipe "no landmark"
 * while the 6x6 wall render plainly showed a lattice) —
 *
 *   hieroglyph_wall 0.482   mudbrick 0.397   column_papyrus 0.388   limestone_polished 0.384
 *   sandstone_worn  0.314   paving_courtyard 0.303   sandstone_block 0.271   ceiling_stars 0.203
 *
 * This recipe is the only one above 0.45, and its peak is at 1/3 of a repeat — so the anchor is
 * the *register layout*, not an individual glyph. A predecessor already removed the strongest
 * anchor (`cartouche: false`, below); this is what is left.
 *
 * **In frame, it does not currently read, and I checked that rather than assuming it.** Critic
 * pass 4 re-ran the probe as a continuous autocorrelation sweep over lags 6-300 px and found no
 * peak above r = 0.30 anywhere on `traversal`'s rear wall or `guard`'s cream wall. My first
 * reaction was that its 300 px window could not span two of a 237-413 px repeat and so could not
 * have found one — so I tested it: laid this recipe's real albedo out at exactly the 286 px period
 * `traversal` measures and ran pass 4's own window and lag range over it. **It recovers the
 * planted period at r = 1.000** (at lag 286 in a 300 px window the 14 remaining columns are the
 * same data, so an exact repeat correlates perfectly). The objection was wrong and is withdrawn;
 * pass 4's result stands on the two shots it measured.
 *
 * What is left of the concern is narrower and worth one line: `traversal` (3.1-5.4 repeats) and
 * `guard` (0.4-2.7) are the two *fewest*-repeat framings in the table above. `dunes` runs 6.4-9.2
 * at 15.3 % of frame and has been probed by nobody. Its mitigation is supposed to be §2.3's >=60 %
 * atmospheric blend, which is SKY's and is a prediction until someone measures it.
 *
 * **Why the fix is not in this file.** A tile cannot avoid repeating its own content, so the two
 * levers are (a) enlarge the tile, which halves texels per glyph and buys §7.3's "visible tiling"
 * at the price of §7.3's "carvings look painted-on" — a straight trade between two conditions on
 * the same list, not an improvement — or (b) decorrelate it with a macro layer at a much longer,
 * incommensurate period. (b) already exists and is mistuned: `ToonMaterial`'s triplanar detail
 * takes a second octave at `uDetailScale * 0.137`, and the `sandstone` preset's `scale: 0.62`
 * puts that octave's period at **11.77 m against this recipe's 10.4 m repeat**. Near-unison — it
 * beats at 88 m rather than breaking the lattice, so the one mechanism in the pipeline that could
 * suppress texture repetition is tuned to a period where it cannot. ~0.03 would put it near 52 m.
 * That multiplier is SHADING's; it is recorded here because the measurement is. */
const HG_WALL_TILE = 5.2;
const HG_GILDED_TILE = 3.2;
const worldTileOf = (tile) => (Array.isArray(tile) ? tile[0] : tile) * ARCH_UV;

/**
 * World size of one cell of `paintRemnants`' survival field, in **metres**.
 *
 * ── §7.3 "visible texture tiling repetition", the part that was actually in this file ──
 *
 * `paintRemnants` gates surviving pigment on `warpN(u, v, freq, …)`, and `freq` is *cycles per
 * tile*. Every call site passed a bare number — 5 here, 4 on `relief_figures`, 6 on
 * `column_papyrus` — and nothing anywhere converted it to metres. On this recipe's 10.4 m repeat,
 * `freq: 5` is a **2.08 m** wear cell, so pigment survives in force across a 2 m patch where the
 * field is high and nowhere else. That is 50 px at `temple`, 138 px at `courtyard`, 38 px at
 * `dunes` — well clear of the sub-pixel line, and stated nowhere in metres before this constant.
 *
 * **The value here is 2.08, which is `round(10.4 / 2.08) = 5` cycles/tile — bit-identical to the
 * bare `freq: 5` it replaces. This is a naming change, not a tuning change**, and it is parked at
 * the control deliberately: the hypothesis that the 2 m wear cell *causes* the tiling landmark
 * was pre-registered, swept, and **failed**. Beacon peak/sd across the sweep:
 *
 *     wear cell   2.08    1.30    0.87    0.65    0.50    0.40   (metres)
 *     peak/sd    12.06   11.96   13.65    8.45   10.06   10.82
 *
 * No trend. The knob does move the image — the top blob's share of supra-threshold chroma mass
 * falls 0.273 → 0.17 and the blobs relocate — so it is *connected*; it is not the cause. Recorded
 * rather than reverted so the next person does not re-run the obvious first experiment. Keep the
 * derivation: a bare cycle count is the same shape of latent error as `MOTES.size` and
 * `sand_ripples`, and `ARCH_UV` exists one layer up for exactly this reason.
 *
 * **And the reason no sweep could have settled it is that the metric steering the sweep was never
 * calibrated.** `hieroglyph_wall` has a documented known-bad state — `cartouche: true`, which the
 * note on the layout call below says made the repeats "trivially countable by eye", and which is
 * unmistakable in a render at 248 px/repeat. Across that A/B:
 *
 *     tilescore.mjs   (1/8 low-pass peakiness)     "no landmark" both      no separation
 *     tilematch.mjs   (2D luma NCC, mean)          0.482 -> 0.488         +1.2 %
 *     tilematch2.mjs  (U chroma NCC, mean)         0.441 -> 0.443         +0.5 %
 *     beacon.mjs      (chroma blob peak/sd)        12.06 -> 12.05         -0.1 %
 *     usalience.mjs   (strip band salience)         2.61 -> 2.62          +0.4 %
 *     + a 28-point sweep of four scalar families x seven scales:  max separation **2.5 %**
 *
 * **Not one of them can see the landmark this recipe is documented as having had.** The cause is
 * structural, not a tuning fault: the cartouche is ~1.2 % of the tile and appears once, and every
 * one of those statistics is a global moment dominated by the other 98.8 %. The eye does feature
 * matching with attention, which no global scalar approximates.
 *
 * **So the 0.482 is withdrawn as evidence, and the 0.45 threshold with it** — I set that
 * threshold myself, from the numbers, against no known-bad state. What remains is the calibrated
 * instrument, the render at the framing's own px/repeat (scratchpad `wallstrip.mjs`), and it says
 * the shipped state is clean: at `temple`'s 248 px/repeat and at `dunes`' 190 px x 7 repeats —
 * the worst framing in the table above, and the one KNOWN_ISSUES said nobody had probed — no
 * landmark recurs, while the `cartouche: true` control is obvious at both. That agrees with the
 * one independent in-frame measurement, critic pass 4's autocorrelation sweep over real captures
 * (no peak above r = 0.30 on `traversal`'s rear wall or `guard`'s cream wall).
 *
 * The predecessor's `cartouche: false` was the real fix. See KNOWN_ISSUES §13.
 */
const PAINT_WEAR_M = 2.08;

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
   * It also helps any gilded recipe that does *not* get `uMetal`: there the specular is still
   * near-white, and a near-white highlight over half a surface is exactly what used to measure
   * gold as chromatically neutral in frame. When this was written that set was three recipes;
   * `Architecture.RECIPES` has since flagged `hieroglyph_gilded` and `ceiling_stars`
   * `metal: true` (the ORM's blue channel gates the metal path per texel, so only the gilded
   * texels take it), leaving `cartouche_gold` — which currently has no consumer at all — as the
   * only one still on the near-white lobe. Checked against the call sites on 2026-08-01; the
   * old parenthetical here named all three as unflagged, which is no longer true. */
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

  /* **"This material's amplitude is eating the cel band" was measured on a staircase.** Kept in
   * full because the amplitude here has been defended twice and the refutation is cheap to lose.
   *
   * `bandprobe` scored `arch:court:sandstone_worn` in `courtyard` at separation **0.82 / 0.99**
   * (within-band IQR 29/49/36 against band steps of 32–42) beside `hieroglyph_wall` at 3.12/1.92
   * (IQR 16/12/21), and the difference was routed here as an albedo/mortar question. It is not
   * one. A bandprobe "site" is a 4-connected run of one *merged* mesh spanning ≥2 bands, and on
   * this mesh that run is a **stair flight** — box(301,464)-(508,522), 5 nosings inside 59 px —
   * while `hieroglyph_wall`'s is a flat 356×410 wall. Rejecting pixels within 3 px of a geometric
   * normal discontinuity (the nosing, its post-process ink line and that line's antialiased
   * skirt) removes **76.3 %** of the stair site and **4.8 %** of the wall, and takes the stair's
   * IQR to **9/12/15** against the wall's 16/11/18. That rejection is measured with *no luma
   * gate at all*, and it cannot be removing texture: bandprobe's normals are interpolated vertex
   * normals, so every joint, pit and streak this recipe paints is still inside the residual.
   *
   * Confirmed off the built Surface, before any lighting (`scratchpad/bandnoise.mjs`, at the
   * site's own 34 mm/px and the architecture UV factor of 2):
   *
   *   gamma-relative albedo IQR   sandstone_worn 0.126   hieroglyph_wall 0.124   sandstone_block 0.139
   *   variance ≤ 8 screen px      13.7 %                 44.3 %
   *   variance ≥ 32 screen px     74.1 %                 42.3 %
   *   normal-map band flips       2.8 %                  5.6 %   (97–98 % of them in ≥8-texel blobs)
   *
   * So this recipe is *already* what the redistribution hypothesis asks for — 3.2× less energy
   * than the control at the frequency that competes with a terminator, 1.75× more in the
   * low-frequency band that breaks flatness — and the control is the material whose bands read
   * well. Cutting amplitude here would push the quietest of the three stone recipes toward the
   * flatness failure for no separation gain. **Not taken, and do not take it without first
   * re-running the edge split; a site that is three-quarters ink cannot be fixed from this file.**
   * The 1.7 mid|hi separation that survives at the stair is limited by the *step*, not the noise:
   * an up-facing tread collects the sky fill a west-facing riser does not, so ~half the key
   * difference is filled back in before AgX compresses the top end. That is SHADING's arithmetic.
   * Sites where this recipe is a large flat face already read: `traversal`'s pylon faces score
   * 2.16–3.61 in the shipped build. */
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
       * of its albedo stain is gone; the AO it earns is what should draw it.
       *
       * ── Per-flag crazing, because the field had no per-flag term at all ──
       *
       * After the UV fix put the paving at its authored density, the geometry agent's honest
       * caveat was that "every slab states the same crackle motif". Census first, before any
       * amplitude knob (the falcon lesson — count the parts): per painted flag, the fraction of
       * texels carrying crack sat between **4.2% and 6.2%, cv 0.12** — one homogeneous Worley
       * web sliced by the flag grid, every flag crazed at the same density in the same ridge
       * width. Checked against the falcon bug's shape and it is *not* that: no variety pipeline
       * collapses to one output here, because there was no variety pipeline — the crack field
       * simply had no term below whole-tile frequency. A real slab field is the opposite: most
       * flags clean or lightly checked, runs of neighbours sharing a state (they were bedded on
       * the same fill), the odd flag properly shattered.
       *
       * Three per-flag terms supply that, all keyed the way `ashlar` keys the quarry bed —
       * a smooth regional field read once per flag at the flag's centre, trimmed by the flag's
       * own white noise — so neighbours correlate into metre-scale regions (§2.3's structure)
       * instead of chequerboarding:
       *   - an amplitude gate, shaped so a fair share of flags are *clean* and a few are heavy;
       *   - a ridge-width blend: heavy flags draw a denser, wider-capture web (a genuinely
       *     different crack pattern, not the same one darker);
       *   - a per-flag domain offset into the Worley lattice, so two flags never state the same
       *     network and a crack terminates at the joint instead of flowing across it — which is
       *     also what real slabs do, since a crack cannot cross a gap. `worleyN` hashes cell
       *     indices mod freq, so a constant offset keeps the tile seamless.
       * Height, roughness and stain all follow the same gate: a clean flag must not carry
       * phantom crack relief in its normal map. */
      const crackThin = s.field(1.5, (u, v) => {
        const x = Math.min(s.size - 1, (u * s.size) | 0), y = Math.min(s.size - 1, (v * s.size) | 0);
        const k = y * s.size + x;
        const w = worleyN(u + m.id[k] * 17.31, v + m.id2[k] * 11.73, 9, cx.seed + 51, 0.95);
        return sat(1 - (w.f2 - w.f1) / 0.045) ** 2.4;
      });
      const crackWide = s.field(1.5, (u, v) => {
        const x = Math.min(s.size - 1, (u * s.size) | 0), y = Math.min(s.size - 1, (v * s.size) | 0);
        const k = y * s.size + x;
        const w = worleyN(u + m.id[k] * 17.31, v + m.id2[k] * 11.73, 13, cx.seed + 53, 0.95);
        return sat(1 - (w.f2 - w.f1) / 0.075) ** 1.8;
      });
      const crz = new Map();
      const crazeOf = (i) => {
        const cu = Math.round(m.bcu[i] * 4096), cv = Math.round(m.bcv[i] * 4096);
        const key = cu * 8192 + cv;
        let e = crz.get(key);
        if (e === undefined) {
          const reg = warpN(cu / 4096, cv / 4096, 2, 3, 1.2, cx.seed + 661) * 0.5 + 0.5;
          const t = sat(reg * 0.62 + (m.id2[i] - 0.5) * 0.72 + 0.18);
          e = [smoothstep(0.26, 0.55, t) * (0.5 + 1.2 * smoothstep(0.55, 0.90, t)), smoothstep(0.55, 0.90, t)];
          crz.set(key, e);
        }
        return e;
      };
      // Measurement hook (same shape as Hieroglyphs' __GLYPHLOG): the census instrument reads
      // what shipped rather than re-deriving it. Free when unset.
      const logCrack = globalThis.__PAVELOG ? new Float32Array(s.n) : null;
      for (let i = 0; i < s.n; i++) {
        const bu = m.bu[i] * 2 - 1, bv = m.bv[i] * 2 - 1;
        const dish = (1 - bu * bu) * (1 - bv * bv);
        const wear = traffic[i];
        const cz = crazeOf(i);
        const crack = lerp(crackThin[i], crackWide[i], cz[1]) * cz[0];
        if (logCrack) logCrack[i] = crack;
        s.h[i] -= dish * wear * 0.16;                        // worn hollow in the flag
        s.h[i] -= crack * 0.22;
        s.mixHex(i, PAL.limeLight, dish * wear * 0.14);      // scuffed pale
        s.rough[i] = sat(s.rough[i] - dish * wear * 0.10 + crack * 0.06);
        s.stainHex(i, PAL.sandCrev, crack * 0.14);
      }
      if (logCrack) globalThis.__PAVELOG.crack = logCrack;
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
  /* **The 6.5 % upper lobe on this recipe's shadowed faces: measured, looked at, kept.** It was
   * parked with a number so an art-director read could overrule it with a picture rather than
   * re-find it. This is that read, against `shots/rim3/courtyard-base.png` at (620,400) 240×110 —
   * 99.4 % one flat +Z face of `arch:court:hieroglyph_wall`, 0.5 % within a geometric normal
   * discontinuity, so nothing in it is an ink line or a neighbouring mesh.
   *
   * The lobe reproduces: base median 71, IQR 8, main lobe 60–80 carrying 78.8 %, upper lobe
   * 100–130, **6.77 % of the ROI at ≥100**. What it *is* was mis-described when it was parked,
   * and that correction matters more than the verdict. "Vertical erosion runnels" is right about
   * the mechanism and wrong about the magnification it was claimed at: at 4× the bright pixels
   * read as speckle plus two course beds, the vertical trains only resolve at 8×, and at 2× —
   * near how the frame is actually seen — they read as weathering streaks and chipped course
   * edges. Asserting a read at a magnification nobody looks at is how a wrong description
   * survives.
   *
   * "Structure, not rash" measured in the frame instead of asserted, at luma ≥ 100:
   *
   *                                        in ≥8 px comps   mean comp   largest   bbox h/w
   *   this ROI                                  89.0 %         122        784       3.25
   *   same pixel count, scattered (null)         0.0 %          —           4        —
   *   glyph register, same face, 130 px up      95.6 %          92        490       4.61
   *
   * A rash does not make a 784 px component against a scatter null of 4, and h/w 3.25 with the
   * x-autocorrelation through zero by lag 3 while y holds 0.39–0.44 out to lag 8 is a vertical
   * streak field. High-pass sd on shadow faces in that frame: glyph register 18.71, this ROI's
   * densest patch 9.14, this ROI's **joint-free interior 2.49**, neighbouring
   * `arch:court:sandstone_block` shadow face 1.58. So the flagged region is a near-clean ground
   * carrying sparse organised streaks, its busiest patch is half the accepted glyph band, and the
   * material beside it is the one sitting closest to §7.3's "flat vertex colour". Quieting this
   * moves toward that failure, not away from it. No autocorrelation recurrence at any lag in any
   * direction on any patch, so no tiling verdict is disturbed; squint holds at 48 px frame width
   * and 40 px on the wall, the shadowed mass staying one clean cool shape.
   *
   * Kept unchanged. **Correct one premise if this is quoted.** The guardrail handed to me said
   * this recipe is the quietest of the three stone recipes at the terminator-competing scale. It
   * is the *busiest* — 44.3 % of albedo variance at ≤8 screen px against `sandstone_worn`'s
   * 13.7 %; the 13.7 % belongs to the `sandstone_worn` note above, and the two got swapped in
   * relay. The verdict survives the corrected premise because it never rested on it: the
   * busyness costs no band separation here (this material reproduces at 3.12 / 1.92 in
   * `courtyard` where the noise floor is 1.0), and busy-*with*-separation is the target. */
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
      /* ── Amendment, critic pass 5 §3.9 and §36 ──────────────────────────────────────────────
       * `cartouche: true` again, and the note above stays because its mechanism is correct: a
       * *once-per-repeat* landmark is what made repeats countable. `glyphWall` no longer draws
       * one. It draws a cartouche in every other text column — five per repeat at a pitch of one
       * fifth of the tile — which is what a real royal wall does and which has no period at the
       * tile boundary for the eye to lock onto. The claim is checked at the framing's own scale
       * with `tools/wallstrip.mjs`, the instrument that separated the known-bad `cartouche: true`
       * state when twenty-eight scalars could not, and it must be checked again on any change
       * here rather than argued from this paragraph. */
      const layout = (mode) => (ctx) => glyphWall(ctx, size, mode, cx.seed, { worldTile: worldTileOf(HG_WALL_TILE), glyphM: 0.72, cartouche: true, kheker: 0.075 });
      const cut = rasterMask(size, layout('cut'));
      const lines = rasterMask(size, layout('line'));
      const paint = rasterRGBA(size, layout('paint'));
      const bandPaint = rasterRGBA(size, layout('bandpaint'));

      /* Deeper cut, tighter bevel, no baked highlight. All of the carving's contrast now lives
       * in the height field, so the normal map and `heightAO` produce it — which means it turns
       * with the sun and goes flat in shadow, the way a chisel line does. */
      const ramp = carve(s, cut, lines, { depth: 0.46, bevelPx: 3.0, lip: 0.12, bulge: 0.42, lineDepth: 0.62, seed: cx.seed + 5 });
      freshCutTint(s, ramp, { amount: 0.16 });
      /* `freq` derived from a metre figure, not written as a bare cycle count — see
       * `PAINT_WEAR_M`. At 10.4 m of world per repeat and a 2.08 m cell this is 5 cycles/tile,
       * exactly the literal it replaces; the derivation is the point, not the value. */
      /* `fade` 0.42 → 0.15, and this is the single largest hue lever in the file.
       *
       * `fade` bleaches surviving pigment toward the stone *before* it is laid down, and at 0.42
       * on top of `peak 0.80` and a wear field that already removes about half the coverage, the
       * effective pigment weight inside a glyph is ~0.46. Measured: an Egyptian-blue sign at that
       * weight over `sandMid` arrives at RGB (123,115,118) — **chroma 8, i.e. exactly on the
       * critic's chromatic gate**, which is why `huelab` reported 100 % of this recipe's
       * chromatic texels inside one 30 deg bucket while eleven of the twenty signs in the pool
       * it draws from are authored blue, green or turquoise. The paint was there and grey.
       *
       * The note at `paintRemnants` that motivated the high fade is about a real defect and is
       * not being relitigated — but it conflates two knobs. What produced *"flat decals with a
       * hard offset drop shadow"* and *"abstract confetti"* was **coverage**: full-opacity
       * pigment filling a glyph edge to edge. That is `keep`/`peak`/`edgeLoss`, and all three
       * stay exactly where they are, so the pigment is still patchy, still short of opaque, and
       * still lets the grain and grime through. `fade` is **chroma**, and chroma is not what made
       * a sticker; a real painted relief is partial in coverage and saturated where it survives.
       * At 0.15 the same sign lands at (82,99,132) — chroma 50, hue 220 — and is a colour again.
       *
       * Registered risk, because it is the one this trades against: if the wall comes back
       * reading as confetti at 1:1, the correct response is to take `peak` or `survival` down,
       * **not** to put `fade` back, because it was fade that cost the hue. */
      paintRemnants(s, ramp, paint, { survival: 0.50, freq: Math.round(worldTileOf(HG_WALL_TILE) / PAINT_WEAR_M), seed: cx.seed + 9, edgeLoss: 0.66, fade: 0.15 });
      /* Band paint — the kheker crown and the register stripe — laid down separately and near
       * flat, for the same reason `column_papyrus` does it: band paint on a temple wall was
       * thick, flat and re-applied, while pigment in a sunk glyph is a ghost. Going through
       * `paintRemnants` with the glyphs would have averaged these to chroma 9 after the
       * consumer's warm material multiply (see the four-pass note at `glyphWall`), which is the
       * whole reason the hue never reached the frame. `BAND_KEEP` still leaves a quarter of the
       * pigment's own chroma to the stone under it, and `bandWear` still removes it in patches,
       * so this is weathered painted plaster and not a decal. */
      /* **Wear is coverage, not opacity, and getting that wrong is what desaturates a palette.**
       * A uniform `keep` of 0.6 does not read as 60 % worn paint; it reads as paint mixed 60:40
       * with stone *everywhere*, and a 60:40 mix of malachite and sandstone is neither — measured
       * through the consumer's material colour it lands at hue 43 deg, i.e. back inside the warm
       * bin, where the same pigment at 0.9 lands at 90 deg. So the wear field is thresholded into
       * patches: a texel is painted or it is bare stone, at a 1.5 m patch scale, which is both how
       * pigment actually fails and the only version of it that keeps a hue. */
      const BAND_KEEP = 0.88;
      /* `freq` 18 over a 10.4 m repeat is a **58 cm** flake, deliberately not the 1.5 m the first
       * version used. A 1.5 m loss patch inside a 10.4 m tile is a large distinctive shape that
       * recurs once per repeat — which is exactly §13's countable-landmark defect arriving
       * through the wear field instead of through a cartouche, and it was visible as such in the
       * `wallstrip` render at `traversal`'s 340 px/repeat. Smaller flakes read as weathering and
       * have nothing for the eye to match on the next tile. */
      const bandWear = s.field(3, (u, v) => sat(warpN(u, v, 18, 4, 1.05, cx.seed + 43) * 1.5 + 0.60));
      /* Mineral pigment on a limed wall, not a swatch. Egyptian blue, malachite and red ochre are
       * ground minerals in a chalky binder — a few points off full chroma and a step lighter than
       * the raw hex, which is also what stops the dado reading as a printed stripe. Mixing toward
       * a *neutral* rather than toward the stone or toward `PAL.white` is what keeps the hue:
       * mixing toward the stone put the pigment back inside the warm bin, and mixing 16 % toward
       * the warm `PAL.white` measured malachite out at hue **80 deg** — olive — where the same
       * pigment at 10 % toward neutral lands at **112 deg**. The multiply by the consumer's warm
       * material colour amplifies any warmth introduced here, so the muting has to be achromatic
       * or it is not muting, it is tinting. */
      const PIG_LIME = 0.10;
      const PIG_TO = 0xe4e4e4;   // neutral, not warm — see PIG_LIME
      const wr = ((PIG_TO >> 16) & 255) / 255, wg = ((PIG_TO >> 8) & 255) / 255, wb = (PIG_TO & 255) / 255;
      for (let i = 0; i < s.n; i++) {
        const pa = bandPaint.a[i];
        if (pa <= 0.02) continue;
        const keep = smoothstep(0.28, 0.46, bandWear[i]) * pa * BAND_KEEP;
        if (keep <= 0.002) continue;
        const pr = bandPaint.r[i] + (wr - bandPaint.r[i]) * PIG_LIME;
        const pg = bandPaint.g[i] + (wg - bandPaint.g[i]) * PIG_LIME;
        const pb = bandPaint.b[i] + (wb - bandPaint.b[i]) * PIG_LIME;
        s.r[i] += (pr - s.r[i]) * keep;
        s.g[i] += (pg - s.g[i]) * keep;
        s.b[i] += (pb - s.b[i]) * keep;
        s.rough[i] = sat(s.rough[i] - keep * 0.10);
      }
      chiselMarks(s, { amount: 0.016, angle: -0.35, freq: 48, seed: cx.seed + 1, mask: m.edge });
      pitting(s, { amount: 0.030, freq: 64, density: 0.34, seed: cx.seed + 2, colorDark: PAL.sandDark, stain: 0.10 });
      const src = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) src[i] = sat(m.joint[i] * 0.8 + ramp[i] * 0.55);
      weather(s, { source: src, seed: cx.seed + 6, creviceAmt: 0.44, streakAmt: 0.26, dustAmt: 0.20, roughGrime: 0.12, directional: 0.35 });
      grain(s, { amount: 0.020, freq: 120, seed: cx.seed + 8, heightAmt: 0.006 });
      /* `SAND_CREV_FLOOR` + `lift`, matching `column_papyrus` — see that constant and the `lift`
       * note in `rampFloor`. Unbleaching the glyph pigment (`fade` 0.42 → 0.15 above) lets the
       * conventionally *black* signs — `falcon`, `jackal`, `wedjat`, `eye`, `kh`, all `#241a16`
       * at luma 0.11 — reach the surface at ~0.70 strength instead of ~0.46, and inside a deep
       * cut that `weather` has also darkened, a few of them land under §2.2's crevice luminance.
       * Measured: `darkTail` 0.0001 → 0.0003 without this, 0.0000 with it. The default lerp
       * cannot fix it (it lands short by construction); `lift` can, and it costs contrast that
       * was rendering as violet rather than as dark. */
      rampFloor(s, { crevice: SAND_CREV_FLOOR, lift: 0.5 });
    },
  },

  /* **Cloisonné inlay considered for critic pass 5's finding #2 and deliberately not taken.**
   * This recipe is 28.7 % of `hero`, 14.4 % of `traversal` and 11.1 % of `night`, so it is the
   * largest single surface that could carry a third hue, and lapis/malachite/carnelian inlay in
   * a gilded architrave is correct Egyptian practice. Two measurements say it would buy nothing
   * and cost something. `scratchpad/huechain.mjs`: in the *shade* regime every pigment in §2.2
   * lands between 152° and 244° after the light and grade chain — authored hue does not survive
   * there at all — and KNOWN_ISSUES §34 records that `hero`'s gilded mass is **98.6 % shadowed
   * at median L 43.6**. So the inlay would be invisible on the shot that has most of it, while
   * displacing gold on a recipe whose value ramp has been rebuilt twice to make §7.3's
   * "gold reads as metal" line work. Recorded rather than done, with the arithmetic, so the next
   * pass does not re-derive it: the reach on that 98.6 % is shadow-side and belongs to
   * SHADING/LIGHTING, or it is a framing decision, exactly as §34 concluded.
   *
   * The largest gilded surface in the level by a long way — every cornice, architrave, lintel
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
      /* `glyphArchitrave`, not `glyphWall` — see that function's note. Every consumer of this
       * recipe is a 0.8-2.6 m horizontal band whose UVs are box-projected in *local* space, so
       * they all sample V within +/-0.20 of the seam and the wall layout's registers, at V
       * 0.645-0.945 and 0.36-0.43, reached none of them. Measured on `hero`'s doorway lintel
       * through its own camera: luma p50 163/255 at chroma 0.330, i.e. pale limestone. */
      const layout = (mode) => (ctx) => glyphArchitrave(ctx, size, mode, cx.seed + 4, { worldTile: worldTileOf(HG_GILDED_TILE), signM: 0.85 });
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
        /* Base 0.46 -> 0.62, and it is the *same* argument as the note above, re-applied now that
         * the cut is a panel instead of a row of sign-shaped holes.
         *
         * `bevel = 4·ramp·(1−ramp)` is zero wherever `ramp` saturates, which over a sunk band is
         * its whole interior. So with the architrave layout the base constant alone sets the
         * body of the gilding, and 0.46 through `goldRamp`'s `k = t^1.75` is **0.257** — under
         * the 0.34 knee, i.e. between `GOLD_DEEP` and `goldDark`. Measured on `hero`'s doorway
         * lintel through its own camera, that put the band at luma p50 **89/255**: the exact
         * "median of the gilding *was* `GOLD_DEEP`" failure this recipe was rebuilt to remove,
         * reintroduced through a different door. 0.62 gives `k = 0.437`, between `goldDark` and
         * `goldMid`, so the body sits mid-ramp and the arrises still reach `GOLD_HOT`. */
        const bevel = 4 * ramp[i] * (1 - ramp[i]);
        const t = sat(0.62 + bevel * 0.50 + (swathe[i] - 0.5) * 0.42 + (wrinkle[i] - 0.5) * 0.26);
        goldRamp(t, t3);
        s.r[i] += (t3[0] - s.r[i]) * g; s.g[i] += (t3[1] - s.g[i]) * g; s.b[i] += (t3[2] - s.b[i]) * g;
        /* Red bole under lifted leaf. 0.75 -> 0.40 for the same reason as the base above: `worn`
         * is gated on `g`, and `g` used to cover only the sign cuts. Over a whole gilded band a
         * 75 % mix toward `PAL.red` fires on ~25 % of the area and the architrave reads as a
         * red-and-gold stripe rather than as gold. The bole is a tell, not a colourway. */
        s.mixHex(i, PAL.red, worn * 0.40);                    // bole showing through
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
      /* ---- Quarry mottle: BUILT, MEASURED IN FRAME, REVERTED. Do not rebuild it blind. ----
       *
       * An additive 17 cm mottle — `s.field(1, warpN(u,v,60,2,1.0, seed+217))` at 0.45 of the
       * ramp coordinate — was added here at `1420def` to attack §7.3's "reads as flat vertex
       * colour", and taken out again after the pass-6 capture scored it. It is recorded rather
       * than deleted because it *passed every offline check*: cov1 on the built albedo resampled
       * to `temple`'s own mm/px went 50.7 → 68.3 (+17.6 points) at the runtime size 1024 and
       * 45.2 → 67.2 at the lab default, squint sd moved +0.75 % against the +49 % of the ashlar
       * state that failed as blotching, mean albedo 0.5244 → 0.5237, `darkTail` 0.0000
       * throughout, and `hieroglyph_wall` bit-identical.
       *
       * In the frame it delivered **+0.1 points of cov1 against the control's +0.1** — i.e. zero,
       * against a pre-registered floor of +2.0 (`progress/records/PREREG-mottle-critic6.md`,
       * sealed before the boot; scored on `shots/critic6/temple.png` at `1bc8938` against
       * `shots/rim4/temple-base.png` at `2f99d55`, whose `src/textures/**` is this file minus
       * this block). The nulls held to ±0.1 and `temple`'s per-material median luma is stable to
       * ±0.001, so the frame did not move for outside reasons and that zero is the change's own.
       *
       * **The instrument is not blind — it was checked against a frame that did move.** Scored
       * the same way over the same two SHAs, `courtyard`'s *untouched* materials shift +1.4 to
       * **+3.1** points of cov1 (`paving_courtyard` 78.1 → 81.2) alongside a median-luma drop of
       * 0.03, and `interior`'s biggest two masks (332 k and 304 k px) sit at 0.0. So cov1 moves
       * several points in frame when something real changes, holds at zero when nothing does,
       * and returned zero here. Had this been read on `courtyard` the nulls would have failed and
       * the primary would have been unquotable — which is what that clause in the prereg is for.
       *
       * **Why the texture number did not transfer, which is the part worth keeping.** The mottle
       * is 16.7 cm ≈ 9.4 px at `temple`'s 17.8 mm/px. cov1 band-passes at 1.6 px. On the resampled
       * albedo a 9.4 px blob still moves a 1.6 px statistic, because the albedo is all the signal
       * there is; in the frame that band is already occupied by relief, joints, ink and shafts,
       * so what the mottle can buy is *coarse*-scale energy — the currency of the busy failure,
       * not of the flat one. The only in-frame trace consistent with it is covC2 (6 px, ≥2 %)
       * rising +1.7 points on this recipe against +0.1 on `temple`'s three other big masonry
       * masks, with `deadBig` up 2.0 → 2.1 and its largest dead blob 4044 → 4236 px.
       *
       * **Do not read that +1.7 as proof the change reached the GPU. It is suggestive and it is
       * not separated from pipeline drift.** The two captures are 21 commits apart, and an
       * untouched control moves by a comparable amount in the other framing scored the same way:
       * `interior`'s `hieroglyph_wall` (114 k px, no texture change) moves covC2 +0.8 and its
       * coarse amplitude +3.9 % — the same +3.9 % this recipe shows in `temple`. So the coarse
       * amplitude number carries no signal at all, and the covC2 number is about 2× the largest
       * control move rather than 17× the smallest. The raw per-pixel delta says the same thing
       * more bluntly: inside the eroded masks this recipe reads mean |dLuma| **1.50** with 22.9 %
       * of pixels past 2/255, against an untouched `hieroglyph_wall` at **1.13 / 19.9 %** and
       * `sandstone_worn` at 1.39 / 19.6 %. The frame moved comparably everywhere. Isolating the
       * recipe needs an A/B in one boot, which is a capture-lock cost this result does not merit.
       *
       * **And the diff *image* misleads here, which is worth one line.** Painted as red-over-grey
       * it looks unmistakably as though the columns changed most — they are 54 % of the frame, so
       * the same 20 % rate covers four times the pixels. The rate table above is the correction.
       *
       * The general form, for whoever authors the next flat-side fix here: a feature only moves
       * an in-frame statistic measured at scale X if the feature is near X. Size the feature
       * against the framings *and* against the band the statistic reads, or the texture-side
       * gain is real and unbankable. The larger reason this recipe measures flat is now
       * §68's — most of it is the tone curve, not the authoring — and that is routed to
       * POSTFX/SHADING as task #32, not fixable in this file. This experiment's own null
       * materials corroborate that for free: across 17 (material, framing) pairs in `temple`,
       * `interior` and `courtyard` whose textures did **not** change, Δcov1 against Δmedian-luma
       * gives **r = −0.88** at −0.72 points per 0.01 of luma — every pair that held its luma held
       * its coverage to ≤0.2 points, and every pair that lost 0.02–0.03 of luma gained 1.4–3.1
       * points. Observational, not an intervention, but it is the same sign and order as §68's
       * controlled sweep and it is measured in delivered frames. */

      /* ---- Drum courses. -----------------------------------------------------------------
       *
       * **This recipe measured the flattest large surface in the catalogue, and it dresses
       * 54.5 % of `temple`.** Relative local contrast (5x5 luma sd / mean, measured on the built
       * albedo resampled to the frame's own texel:pixel ratio, so lighting gain cancels) —
       *
       *   column_papyrus 0.0291   paving_courtyard 0.0364   sandstone_block 0.0486
       *   granite_pink   0.0503   hieroglyph_gilded 0.0523  hieroglyph_wall  0.0615
       *
       * — i.e. half the wall it stands next to. Everything this recipe carries is either
       * low-frequency (`stone`, a 5-octave warp) or deliberately damped, because the two notes
       * above correctly took the painted rib *down* so the mesh's own 8 lobes could own the
       * bundle. That fixed the corrugation and left the shaft with nothing on it: between the
       * binding bands at 0.145 and 0.80 there is 9.6 m of smooth sandstone and one 0.9 m column
       * of text. In `shots/tx4/temple.png` at 3x that is exactly what it looks like — a pale
       * mass with vertical rib shading and no surface. §7.3's "any surface reads as flat vertex
       * colour with no texture detail", on the biggest surface in the interior shot.
       *
       * A 12.3 m column is not a monolith; it is stacked drums. So the missing structure is
       * *horizontal*, which is the one direction this recipe has no energy in and the one that
       * cannot re-create the vertical streaking the two notes above exist to prevent. It is also
       * low-frequency, so unlike grain it survives to where the columns are actually seen:
       * `courtyard` puts them at 63 m (texelPx 0.24) and `dunes` at 105 m, where anything finer
       * than the drum spacing has already averaged away.
       *
       * Sized against the frame, not against the tile. V is registered: `Textures._build` sets
       * `repeat.y = 1/tile[1] = 1/4.5` and `Kit.papyrusColumn` writes `v = py x 4.5/capTop`, so
       * texture V runs 0..1 over `capTop` — 14.7 m on a nave column, 11.4 m on an aisle one.
       * Eight drums over the shaft is therefore a **1.20 m** course, and `DRUM_HW = 0.0032` V is
       * a half-width of **47 mm**, i.e. a 94 mm footprint with a ~28 mm core (the smoothstep runs
       * from 0.30 x HW to HW). Against the measured mm/px at each framing that is a **5.3 px
       * groove with a 1.6 px core on `temple`'s near nave column (17.8 mm/px)** and 1.9 px at
       * `temple`'s far end (48 mm/px).
       *
       * **Where it stops resolving, and what carries the structure there.** At `courtyard` the
       * columns are 63 m out (81.9 mm/px) and at `dunes` 105 m (111.8 mm/px), so the groove falls
       * to 1.1 px and 0.84 px — at or under the limit that `MOTES.size` and `sand_ripples` both
       * failed. That is why the per-drum tone below is not decoration: it modulates whole 1.2 m
       * drums, which subtend 15 px and 11 px at those same distances, so the drum structure
       * survives exactly where the joint line stops. Measured relative local contrast rises with
       * minification rather than falling — 0.0324 at `temple`'s 1:1, 0.0645 at `courtyard`'s 1/4
       * — which is the signature of structure that outlives its own detail.
       *
       * The darkness is put in *height and occlusion*, not in albedo: the albedo only leans to
       * `sandDark` (luma 0.383, well clear of §2.2's crevice 0.203), so `darkTail` cannot move
       * and the recess goes dark through `derive()`'s AO — which is what §7.3 means by dark
       * occlusion, and it keeps the joint from turning violet under the additive shadow wash.
       *
       * The spacing is jittered ±3.5 % of a course so the eight joints are not a perfect lattice
       * (§7.3's hand-built irregularity, and one less thing for the eye to count repeats by). */
      const DRUM_Y0 = 0.145, DRUM_Y1 = 0.80, DRUM_N = 8, DRUM_HW = 0.0032;
      const drumY = [];
      {
        const rj = rng(cx.seed + 71);
        for (let k = 1; k < DRUM_N; k++) {
          const f = k / DRUM_N + (rj() - 0.5) * (0.07 / DRUM_N);
          drumY.push(DRUM_Y0 + (DRUM_Y1 - DRUM_Y0) * f);
        }
      }
      /* 1 in the joint, 0 on the drum face. Full-resolution in v because the joint is a line:
         a half-res field would blur it to twice its width and halve its depth. */
      const drum = s.fieldFull((u, v) => {
        const y = 1 - v;                       // field v runs top-down; bands are keyed bottom-up
        let best = 1;
        for (let k = 0; k < drumY.length; k++) {
          const d = Math.abs(y - drumY[k]);
          if (d < best) best = d;
        }
        return 1 - smoothstep(DRUM_HW * 0.30, DRUM_HW, best);
      });
      /* Per-drum tone. Each drum is a separate block of stone, so it gets its own place in the
       * ramp — and, exactly as the `VARIATION` note above concluded for ashlar, the tone is
       * sampled from a *smooth field at the drum's centre* rather than hashed from its index.
       * Hashing would make adjacent drums differ as much as distant ones, which is the
       * "per-block hue randomised at maximum spatial frequency" failure that note records; a
       * smooth field means neighbouring drums came out of the same bed and the shaft grows a
       * slow tonal drift up its height. That drift is also the one cue that distinguishes twelve
       * columns from twelve copies of one column, because each shaft samples the field at its
       * own offset. Amplitude is deliberately half of ashlar's: a drum is 1.2 m and there are
       * only eight of them, so the same swing that reads as depth on a block wall would read as
       * a stack of differently-coloured cylinders here. */
      const drumTone = new Float32Array(DRUM_N);
      for (let k = 0; k < DRUM_N; k++) {
        const yc = DRUM_Y0 + (DRUM_Y1 - DRUM_Y0) * ((k + 0.5) / DRUM_N);
        drumTone[k] = warpN(0.37, yc, 2.4, 2, 0.9, cx.seed + 83) * 0.5 + 0.5;
      }
      const drumT = s.fieldFull((u, v) => {
        const y = 1 - v;
        let k = 0;
        while (k < drumY.length && y > drumY[k]) k++;
        return drumTone[k];
      });

      /* ---- Glyph registers: two ringing the shaft, and the vertical text between them. -----
       *
       * Critic pass 4 scored the near nave column *"no fluting, no glyph and no capital detail;
       * at this scale they are smooth tapered slabs"*. Measured on the frame it is exactly that:
       * relative local contrast (5x5 sd / mean, taken on an **albedo-only render through the
       * real camera** so no shading term can confound it) is **0.0132 against `hieroglyph_wall`'s
       * 0.0305 in `temple`**, and **0.0120 inside the critic's own ROI** — the flattest surface
       * in the frame while being 54.5 % of it. The drum courses above supplied the *low*
       * frequency and nothing carried the middle.
       *
       * The glyphs were already here, and the reason they were invisible only shows up when the
       * frame is measured rather than the tile: the register is a **vertical** strip 0.09 of the
       * repeat wide, so it dresses 9 % of a 10 m circumference and only the half of the shaft
       * facing the camera can show it at all. Measured, **10.3 % of `temple`'s column pixels
       * fall inside it**, most of that the blank ground between signs — which is why a 180x380
       * crop of the near column contains exactly one legible sign.
       *
       * A register that *rings* the shaft has no such lottery: it is on every column at every
       * angle. It is also **horizontal**, the one direction this recipe has no energy in, and
       * the one direction that cannot re-create the vertical streaking the two notes above exist
       * to prevent — the rib fix took the painted stalk down so the mesh's 8 lobes could own the
       * bundle, and nothing here puts it back.
       *
       * **Placed against the framings, not against the tile.** V is registered (see
       * `Kit.COLUMN_V_TILE`), so a fraction of v is a different number of metres on a nave
       * column than an aisle one and the only stable unit is pixels measured in the frame.
       * Coverage of each drum-face centre, as the share of that shot's column pixels landing
       * within +/-0.024 of it:
       *
       *     band v    temple  criticROI  courtyard   hero  traversal  night
       *     0.186       7.7      13.8       7.3       9.0     7.9      8.2
       *     0.268       6.6      13.6       7.0       8.8     5.3      8.0
       *     0.432       5.0      10.7       7.6       8.7     4.0      9.1
       *     0.513       4.5       1.5       7.3       3.5     0.0      8.1
       *     0.595+     <4.0      ~1.1      <6.7       0.0     0.0     <0.8
       *
       * Two results there that reasoning gets wrong. **The upper shaft is never on screen** — a
       * band at "two thirds up", the natural place to put one, is *zero* pixels in `hero` and
       * `traversal`. And coverage falls monotonically with height, so registers belong low.
       * 0.186 and 0.432 are the centres of drum faces 0 and 3, so a bed joint never cuts a band
       * (nearest joint clears by 0.017 of v, ~25 cm), and together they cover **24.5 % of the
       * critic's ROI**.
       *
       * **0.186 rather than 0.268 for the lower band, and the reason is not its own coverage.**
       * At 0.268 the band sits *inside* the span the vertical text used to occupy and pushes its
       * lowest run below one quadrat, so that run is dropped — and measured in the critic's ROI
       * that cost the *unbanded* shaft 11 % of its local contrast (0.0109 -> 0.0097), cancelling
       * a third of what the bands had just bought. At 0.186 the band clears the text entirely
       * (band top 0.210, text starts 0.220) and the vertical register runs unbroken from 0.220 to
       * the second band. Same band count, marginally better coverage, and nothing given back.
       * Worth carrying: a feature can be paid for out of a *neighbouring* feature's budget
       * without anything in its own numbers showing it.
       *
       * Half-width 0.024 of v is **43 px in `temple`**, 19 px `traversal`, 12 px `hero`, 10 px
       * `night`, 9 px `courtyard` — legible signs in the interior shot and a band at distance,
       * the same "outlives its own detail" property the drum tone above was chosen for.
       *
       * **The quadrats are square in WORLD, not in the tile.** One tile-u is 10 m of arc and one
       * tile-v is `capTop`, so a texel-square sign renders 1.47x taller than wide — the existing
       * vertical register has been drawing 0.90 x 1.42 m signs this whole time. Drawing inside
       * `scale(1, BAND_ASPECT)` cancels it: `drawGlyph` preserves the glyph's own aspect in the
       * scaled space, the outer scale squashes it by 0.680 in texels, and the u:v metre ratio
       * stretches it back. That puts 14 signs around the shaft at 41x43 px in `temple`.
       *
       * The bottom-up `y` used here is the same coordinate the binding bands below use, and it
       * equals tile-v in the frame — verified end-to-end rather than assumed, by finding the
       * painted bands at tile-v 0.075-0.125 / 0.800 / 0.900 against authored 0.035-0.090 /
       * 0.115-0.145 / 0.80-0.83 / 0.865-0.920. Three flips sit in that chain and reasoning about
       * them gives the wrong sign.
       *
       * ── Verified in frame. `shots/tx6/temple.png` against `shots/tx5/temple.png` ────────────
       *
       * All three pre-registered predictions hold, and the prediction was written before the
       * capture existed:
       *
       *   1. **Bands visible.** In the critic's own ROI (950,200 180x380) the near nave column
       *      carried, in tx5, two thin vertical highlights and one small mark on an otherwise
       *      blank shaft — critic pass 4's "smooth tapered slabs", exactly. In tx6 the same crop
       *      shows discrete signs on a ruled horizontal band, including a legible scarab.
       *   2. **No vertical streaking.** The only full-height lines in either frame are the
       *      `columnRule` pair bounding the vertical text, present in tx5 too. The
       *      `scale(1, BAND_ASPECT)` transform introduced none — which was the specific risk,
       *      this recipe having failed twice before on corrugation.
       *   3. **Magnitude in band.** Relative local contrast (5x5 sd/mean) over that ROI:
       *      **0.04764 -> 0.05302, +11.3 %**, against a pre-registered +8 % to +18 %. Below the
       *      albedo's +25 %, as the measured 2.65x transfer function said it should be — the
       *      change reached the frame and was diluted rather than amplified.
       *
       * Recorded because the honest reading of a +11.3 % is easy to lose: it is a *third* of the
       * texture-side gain, and the predecessor's "+117 % in texture, +22 % in frame" was read as
       * evidence that more amplitude was pointless. It is not — dilution was predicted from a
       * measurement and then observed. What that number does not license is any claim about the
       * sign *variety* in these bands, which changed after this capture; see KNOWN_ISSUES §13. */
      const BAND_V = [0.186, 0.432], BAND_HW = 0.024;
      /* 10 m of arc per tile-u against `capTop` m per tile-v. Exact on a nave column, which is
         what `temple` is mostly made of; aisle columns (capTop 11.4 m) come out ~1.3x wide, and
         that is not fixable from inside a tile while V is registered per column. */
      const BAND_ASPECT = 10 / 14.7;
      const RULE_T = 0.0026;

      /* `columnRegister` makes its quadrats one box-width square, so the box width *is* the glyph
       * size. At 0.20 of the tile it was a 1.44 m sign, and widening `tile[0]` to 5.0 above would
       * have quietly taken it to **2.0 m** — the same over-scale that put three-metre
       * hieroglyphs on the hypostyle walls. TXT_W is 0.09 of the repeat, i.e. 0.90 m: large, as
       * befits a hypostyle column, but a *sign* rather than a billboard.
       *
       * The ringing bands own their slice of v and the vertical text runs in what is left, rather
       * than being drawn through — overlapping registers are mush at every distance. Runs shorter
       * than one quadrat are dropped instead of being squeezed. */
      const TXT_W = 0.09, TXT_X = 0.5 - TXT_W * 0.5;
      const TXT_V0 = 0.22, TXT_V1 = 0.79, TXT_GAP = 0.010;
      const txtRuns = [];
      {
        let y0 = TXT_V0;
        for (const bc of BAND_V) {
          if (bc - BAND_HW - TXT_GAP - y0 > 0.05) txtRuns.push([y0, bc - BAND_HW - TXT_GAP]);
          y0 = bc + BAND_HW + TXT_GAP;
        }
        if (TXT_V1 - y0 > 0.05) txtRuns.push([y0, TXT_V1]);
      }

      /** One ringing register per band, drawn identically into the cut / line / paint passes. */
      const glyphBands = (ctx, mode) => {
        for (let b = 0; b < BAND_V.length; b++) {
          ctx.save();
          ctx.translate(0, (1 - BAND_V[b] - BAND_HW) * size);
          ctx.scale(1, BAND_ASPECT);
          HG.rowRegister(ctx, 0, 0, size, (BAND_HW * 2 * size) / BAND_ASPECT,
            cx.seed + 61 + b * 13, HG.POOLS.divine, mode);
          ctx.restore();
        }
      };
      /** The vertical text, in the runs the bands left, with the same world-square correction. */
      const glyphColumns = (ctx, mode) => {
        for (let r = 0; r < txtRuns.length; r++) {
          const [v0, v1] = txtRuns[r];
          ctx.save();
          ctx.translate(0, (1 - v1) * size);
          ctx.scale(1, BAND_ASPECT);
          HG.columnRegister(ctx, size * TXT_X, 0, size * TXT_W, ((v1 - v0) * size) / BAND_ASPECT,
            cx.seed + 3 + r * 7, HG.POOLS.divine, mode);
          ctx.restore();
        }
      };

      const bandsMask = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff';
        // Binding bands near the foot and below the capital.
        for (const [y, h] of [[0.035, 0.055], [0.115, 0.030], [0.80, 0.030], [0.865, 0.055]]) {
          ctx.fillRect(-2, (1 - y - h) * size, size + 4, h * size);
        }
      });
      /* ── The binding bands are where this recipe's hue lives, and they had none ──────────────
       *
       * `huewhere.mjs` on the built tile: **93.9 % of chromatic texels in the single 20-30 deg
       * bin, 0.86 % anywhere cool or green** — on the recipe that dresses **54.5 % of `temple`**,
       * i.e. the single largest contributor to critic pass 5's finding that 86.7 % of the frame's
       * chromatic pixels sit in two hue windows. The pigments were authored (`lapis`, `turquoise`
       * in the five-colour bands) and did not arrive, for the two reasons the wall recipe
       * documents: they were laid down mixed ~40:60 with the stone under them, and the consumer
       * then multiplies the map by `0xd8a468`, a saturated warm, which compresses a low-chroma
       * mix toward its own hue.
       *
       * Three changes, all of them area or chroma rather than new decoration: the two plain-ochre
       * cord bands become **malachite** (a papyrus column's bindings are the plant's own sheaths,
       * and green is both what they were painted and the one hue in §2.2 that the warm key cannot
       * rotate into the orange bin); the five-colour bands trade `ochre` for `malachite` so they
       * are half cool; and `BAND_FADE` stops averaging pigment into stone. */
      const paint = rasterRGBA(size, (ctx) => {
        for (const [y, h] of [[0.035, 0.055], [0.865, 0.055]]) {
          HG.paintedBand(ctx, -2, (1 - y - h) * size, size + 4, h * size, 'paint',
            [PAL.malachite, PAL.red, PAL.lapis, PAL.turquoise, PAL.white]);
        }
        for (const [y, h] of [[0.115, 0.030], [0.80, 0.030]]) {
          ctx.fillStyle = css(PAL.malachite); ctx.fillRect(-2, (1 - y - h) * size, size + 4, h * size);
        }
        glyphColumns(ctx, 'paint');
        glyphBands(ctx, 'paint');
      });
      const textCut = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        for (const [v0, v1] of txtRuns) {
          HG.columnRule(ctx, size, size * (TXT_X - 0.018), size * 0.008, (1 - v1) * size, (1 - v0) * size, 'line');
          HG.columnRule(ctx, size, size * (TXT_X + TXT_W + 0.018), size * 0.008, (1 - v1) * size, (1 - v0) * size, 'line');
        }
        /* The incised rule bounding each ringing register. It is what still reads once the signs
           inside it have blurred: at `courtyard`'s 9 px the band survives as a ruled stripe. */
        ctx.fillStyle = '#fff';
        for (const bc of BAND_V) {
          ctx.fillRect(-2, (1 - bc - BAND_HW) * size - RULE_T * size, size + 4, RULE_T * size);
          ctx.fillRect(-2, (1 - bc + BAND_HW) * size, size + 4, RULE_T * size);
        }
        glyphColumns(ctx, 'cut');
        glyphBands(ctx, 'cut');
      });
      const textLine = rasterMask(size, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        glyphColumns(ctx, 'line');
        glyphBands(ctx, 'line');
      });

      for (let i = 0; i < s.n; i++) {
        /* Relief and paint both damped, because the mesh already carries this rib (see above).
         * The groove in particular was a hard dark line 8-15 times around every column on top of
         * the geometry's 8 — halved, and its albedo contribution taken out of `t` entirely, so
         * what is left is a shallow trough that deepens the mesh's own valley rather than a
         * painted stripe that sits wherever the two happen to disagree. */
        s.h[i] = 0.42 + cross[i] * 0.22 - groove[i] * 0.11 + (stone[i] - 0.5) * 0.07;
        const t = sat(0.42 + (stone[i] - 0.5) * 0.60 + cross[i] * 0.05 + (drumT[i] - 0.5) * 0.18);
        const col = ramp3(PAL.sandDark, PAL.sandMid, PAL.sandLight, t);
        s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
        s.rough[i] = 0.84;
        /* The drum joint: lower and darker than the faces either side, which is the invariant
           `Textures._build()` asserts on `s.masonry` below. A weathered bed joint is also the
           roughest thing on the shaft — it is the one surface the burnisher never touched. */
        const dj = drum[i];
        if (dj > 0.004) {
          /* `JOINT`, not a local constant: the note at that constant is explicit that a joint's
             darkness belongs in the *height* field, where `heightAO` turns it into a contact
             line that tightens near the joint and fades away from it, and that painting it into
             the albedo instead "reads as a drawn line at every distance and in every lighting
             condition". The first version of this used 0.50 and did exactly that — visible as a
             ruled grid in the isolation render. Light touch of colour, deep groove. */
          s.r[i] += (((PAL.sandDark >> 16) & 255) / 255 - s.r[i]) * dj * JOINT;
          s.g[i] += (((PAL.sandDark >> 8) & 255) / 255 - s.g[i]) * dj * JOINT;
          s.b[i] += ((PAL.sandDark & 255) / 255 - s.b[i]) * dj * JOINT;
          s.h[i] -= dj * 0.11;
          s.rough[i] = sat(s.rough[i] + dj * 0.10);
        }
        const bm = bandsMask[i];
        if (bm > 0.02) s.h[i] += bm * 0.16;                    // bands stand proud
      }
      /* Publish the joint mask so the build-time joint-sign assertion in `Textures._build()`
         covers this recipe too. It only reads `.joint`; there are no blocks here to id. */
      s.masonry = { joint: drum };
      const ramp = carve(s, textCut, textLine, { depth: 0.40, bevelPx: 2.4, lip: 0.09, bulge: 0.45, lineDepth: 0.60, seed: cx.seed + 5 });
      freshCutTint(s, ramp, { amount: 0.14 });
      /* `survival` 0.34 → 0.46. With the registers above landing, the band interior measured
       * relative local contrast **0.0231 in frame against `hieroglyph_wall`'s 0.0305**, and its
       * chroma variation 0.0081 against the wall's 0.0112 — the marks were there and grey. The
       * two recipes' carve pipelines are otherwise near-identical
       * and this was the one large gap between them (the wall keeps 0.50, with lower `edgeLoss`
       * and `fade` besides), so this is matching a surface that already works rather than
       * inventing an amplitude.
       *
       * It is *not* a relaxation of the damping the two notes at the top of this recipe describe.
       * Those took down the painted **stalk** and the **binding-band chroma**, both of which are
       * full-width terms that fight the mesh's own 8 lobes or alias at 30 m. This is pigment left
       * in a **carved glyph**, which exists only where `ramp > 0` — about 13 % of the tile — and
       * is the difference between "a sunk relief" and "a smudge". Still below the wall's 0.50. */
      /* `fade` 0.45 → 0.18, for the reason set out at `hieroglyph_wall`'s call: `fade` is chroma,
       * not coverage, and it was chroma that stopped the pigment reaching the frame. `survival`,
       * `edgeLoss` and `peak` — the three knobs that decide how *much* of a glyph is painted, and
       * therefore the ones that produced the "flat decal" failure — are untouched. */
      paintRemnants(s, ramp, paint, { survival: 0.46, freq: 6, seed: cx.seed + 9, edgeLoss: 0.70, fade: 0.18 });
      // Band paint survives better than glyph paint — it was thicker and re-applied.
      const bandWear = s.field(3, (u, v) => sat(warpN(u, v, 16, 4, 1.15, cx.seed + 41) * 1.45 + 0.55));
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
      /* `BAND_FADE` 0.26 → 0.08, and `keep` becomes a *coverage* threshold rather than a uniform
       * opacity — the same correction as on the wall, and the same measurement behind it: a
       * pigment laid at 0.6 opacity over sandstone is not "60 % worn", it is a 60:40 mix whose
       * hue, after the consumer's warm multiply, lands back inside the warm bin. Paint fails in
       * patches; a texel here is now painted or bare. The aliasing worry in the note above is
       * answered by the patch scale, not by the chroma: `bandWear` runs at 16 cycles over a 9 m
       * V repeat, so a patch is ~0.56 m — small enough that no single loss blob is a landmark the
       * eye can match on the next repeat (the 8-cycle version was, visibly, in the `wallstrip`
       * render at `temple`'s 562 px/repeat), and still 5 px across at `courtyard`'s 63 m.
       * `PIG_LIME` toward a neutral keeps these off full-saturation swatch values without
       * rotating the hue, which mixing toward the stone or toward the warm `PAL.white` both do. */
      const BAND_FADE = 0.08, PIG_LIME = 0.10, PIG_TO = 0xe4e4e4;
      const wr = ((PIG_TO >> 16) & 255) / 255, wg = ((PIG_TO >> 8) & 255) / 255, wb = (PIG_TO & 255) / 255;
      for (let i = 0; i < s.n; i++) {
        if (bandsMask[i] < 0.02 || paint.a[i] < 0.02) continue;
        const keep = smoothstep(0.30, 0.50, bandWear[i]) * bandsMask[i] * paint.a[i] * 0.90;
        if (keep <= 0.002) continue;
        const qr = paint.r[i] + (wr - paint.r[i]) * PIG_LIME;
        const qg = paint.g[i] + (wg - paint.g[i]) * PIG_LIME;
        const qb = paint.b[i] + (wb - paint.b[i]) * PIG_LIME;
        const pr = qr + (s.r[i] - qr) * BAND_FADE;
        const pg = qg + (s.g[i] - qg) * BAND_FADE;
        const pb = qb + (s.b[i] - qb) * BAND_FADE;
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
      /* `SAND_CREV_FLOOR`, not `PAL.sandCrev`, and only on this recipe — see the constant. The
         registers above roughly tripled the carved area, and carving is what makes a dark tail:
         measured at the shipping size, `sandstone_block` (uncarved) is 0.00000, this recipe was
         0.00010 and is 0.00027 with a floor sitting exactly *on* the line, and `hieroglyph_wall`
         — carved, same family, same frame — is 0.00125. A floor on the line cannot defend it. */
      rampFloor(s, { crevice: SAND_CREV_FLOOR, lift: 0.5 });
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
  /* **`tile[0]` 1.4 → 1.0, because this consumer's U is not world metres — it is a fraction of
   * the way around the trunk, and 1.4 put a hard seam down every palm in the level.**
   *
   * `Vegetation.palmTrunk` writes `uv.push(s / SIDES, t * (height / 3))` (Vegetation.js:86), so U
   * runs **0..1 around a closed cylinder**. `Textures._build` turns `tile[0]` into
   * `repeat.x = 1/1.4`, so the texture U actually sampled ran 0 → **0.714** and then jumped
   * straight back to 0 at the geometric seam. 0.714 of a tileable texture butted against its own
   * start is a guaranteed discontinuity — the bark pattern breaks along one vertical line on
   * every trunk — and no amount of authoring inside the tile can hide it. At 1.0 exactly one
   * repeat wraps the trunk and the wrap is the texture's own seam, which is seamless by
   * construction.
   *
   * This is the third instance of the same shape (`sand_ripples` at 3.7x its authored slope,
   * `MOTES.size` sub-pixel, and the `Math.max(0.05, [u,v])` NaN): **a number quoted in metres
   * that its consumer does not read in metres.** `CONSUMER_UV_SCALE` in `Textures.js` cannot
   * express it, because the factor is not a constant — it is "whatever the trunk circumference
   * happens to be". Vegetation is already flagged there as a special case; this is what that
   * flag was hiding.
   *
   * **`fx` 5 → 9, for the reason `column_papyrus` was retuned: match the rib the geometry
   * already cuts.** `palmTrunk` modulates the radius by
   * `sin(a·4.5 + t·46)·sin(-a·4.5 + t·46)`, and `sin A · sin B = ½[cos(A−B) − cos(A+B)]` makes
   * that a diamond lattice of **9 cells around** the trunk and ~14.6 up its full height. The
   * painted lattice was `fx = 5` cells per repeat over 0.714 of a repeat, i.e. **3.6 around**
   * against the mesh's 9 — two incommensurate diamond grids on one cylinder, the same beat that
   * made the columns read as corrugation. `fy` 7 → 9 lands the painted rows at `9 · height/5.4`
   * = 15 over a 9 m palm against the mesh's 14.6, and squares up the pad: 0.22 m wide × 0.36 m
   * tall instead of 0.22 × 0.77, which is what an old frond base actually looks like.
   *
   * `bump` 0.022 → 0.013 holds the *measured relief* constant across the change, so this is a
   * registration fix and nothing else: the encoded normal's tilt percentiles go 23.79/33.73/38.43
   * before to 23.85/35.10/41.43 after. It has to move because both levers changed at once —
   * `derive()`'s `ku = bump·size/tu` rises 1.4x with the tile, and 9 cells across a repeat are
   * steeper than 5. For the record, `palmTrunk`'s taper gives circumferences of 2.73 m at the
   * foot, **1.57 m at mid-shaft** and 0.85 m under the crown, so the honest U slope scale would
   * be `0.013·512/1.57` = 4.24 against the 6.66 this declares — a 1.57x overstatement, in the
   * same direction and the same order as the project-wide 2x convention that `Textures._build`
   * documents. It was 8.05 against a true 3.66 (2.2x) before. */
  palm_bark: {
    group: 'organic', tier: 1, tile: [1.0, 1.8], bump: 0.013, rough: 0.90,
    build(s, cx) {
      const size = s.size;
      // A date palm trunk is a lattice of old frond bases — rhombic pads with deep grooves.
      // Counts matched to `Vegetation.palmTrunk`'s own scar lattice; see the note above.
      const fx = 9, fy = 9;
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
      /* 300 cycles was a 10 mm feature: 0.54 px on the `courtyard` palm and 0.08 px in `dunes`,
       * i.e. below the pixel at both framings it appears in, so it could only ever be mip-chain
       * fodder. Re-derived now that `tile[0]` is 1.0, which makes one U repeat the trunk
       * circumference and therefore height-dependent: 2.73 m at the foot, 1.57 m at mid-shaft.
       * At 48 cycles that is 57 mm / 33 mm, i.e. 2.3 px and 1.35 px on a `courtyard` palm at
       * 20 m and 1.212 mrad/px (1280x720). At 64 the mid-shaft figure is 24 mm = 1.01 px, which
       * is exactly the line this recipe was corrected once for standing on. */
      grain(s, { amount: 0.04, freq: 48, seed: cx.seed + 8, heightAmt: 0.014 });
      /* `lift` 0.14: `lo·(1 − 0.14)` = 0.2108, just clear of §2.2's `crevice` luminance 0.2031,
       * so nothing on a palm trunk can land where the shader's violet wash out-weighs its own
       * albedo. Palms stand in `courtyard` and `dunes` and this recipe was the worst live
       * offender in the catalogue outside the deliberately-black character maps: `darkTail`
       * 0.0367 at shipping resolution *with this floor already applied*, because the lerp on its
       * own leaves mid-dark texels short of the line (see `rampFloor`). */
      rampFloor(s, { crevice: BARK_CREV, lift: 0.14 });
    },
  },

  /* **This recipe's two axes were the wrong way round for the only geometry that uses it, so
   * essentially none of what it drew reached a frond.** Found by the sweep the palm trunk seam
   * came out of; recorded in full because the failure is invisible in a swatch and total in the
   * frame.
   *
   * `Vegetation.palmFrond` (Vegetation.js:143-165) writes exactly two kinds of UV:
   *
   *   rachis strip   `uv.push(t, 0.48,  t, 0.52)`               U along the frond, V a 0.04 band
   *   pinna triangle `uv.push(t, 0.5,   t, 1.0,   t, 0.62)`     **all three verts share U = t**
   *
   * So **U selects a leaflet and V runs outward along it, base to tip** — and because a pinna's
   * three vertices carry the *same* U, any U-direction structure in this texture is a single
   * flat value per leaflet. The recipe was authored the other way up: 13 leaflets laid *across*
   * U, a blade cross-section `sqrt(1 − d²)` in U, a rib at `|u − 0.5| < 0.035` described as
   * "midrib of the whole frond, down the centre", and the alpha taper on V. Every one of those
   * either collapsed to a constant or landed across the wrong axis.
   *
   * The tile made it worse in two independent ways. At `[0.8, 2.4]` the repeats are
   * `[1.25, 0.4167]`, so (a) U ran 0 → 1.25 along the frond — the 13-leaflet field wrapped
   * mid-frond and the "midrib" became a bright band straight across the rachis at 40 % of its
   * length — and (b) V was compressed to **0.208 … 0.417**, so the geometry only ever sampled a
   * fifth of the texture's V, in a stretch where `taperV = smoothstep(1.0, 0.62, v)` is
   * identically 1 and the sun-dried `smoothstep(0.3, 1.0, v)` never exceeds 0.17. The tip
   * straw and the alpha taper — the two things that make a palm frond read at golden hour —
   * were switched off by the tile, not by the authoring.
   *
   * `[1.0, 1.0]` makes the mapping the identity: U is the position along the frond, V = 0.5 is
   * the rachis and V = 1.0 is a leaflet tip, and the rachis strip lands in V 0.48–0.52 where
   * this build now paints one.
   *
   * **Be honest about what this geometry can and cannot carry.** A pinna is one triangle at one
   * U, so there is no width parameter: a leaflet's own fine longitudinal ribbing is not
   * expressible from a texture here and is not attempted. What is expressible is variation
   * *along* the leaflet (V) and *between* leaflets (U), and that is what the build below is. If
   * cross-blade detail is ever wanted it needs a second UV coordinate from VEGETATION, not more
   * authoring in this file. */
  palm_frond: {
    group: 'organic', tier: 1, tile: [1.0, 1.0], bump: 0.030, rough: 0.62, alpha: true,
    build(s, cx) {
      const size = s.size;
      const oliveHex = MX(PAL.malachite, PAL.ochre, 0.42);
      const oliveLight = MX(oliveHex, PAL.sandLight, 0.45);
      const strawDry = MX(PAL.sandLight, PAL.ochre, 0.35);
      const ribHex = MX(PAL.sandLight, oliveHex, 0.40);
      const a = s.alpha();
      // `SEG = 9` stations along the rachis, both pinnae of a pair sharing one U.
      const leaflets = 9;
      const dry = s.field(3, (u, v) => sat(warpN(u, v, 6, 4, 1.2, cx.seed + 17) * 1.4 + 0.5));
      /* Segmentation *along* a leaflet — the axis this geometry can actually resolve. Sized
       * against the frame, not against the tile: a pinna is ~0.5 m long (`palmFrond`'s `plen`)
       * and spans V 0.5→1.0, i.e. half the map, so `fy = 24` puts 12 segments across it at
       * ~42 mm — 2.2 px on a `courtyard` palm at 20 m and 0.97 mrad/px. `fbmA` doubles per
       * octave, so three octaves reach 96 in V, 10 mm, which is where it should stop.
       *
       * `fx = 3`, deliberately low. Leaflet-to-leaflet difference is `jit` below, which is
       * exact; what `fx` controls here is the U *gradient* of the height field, and `tile` has
       * to be `[1, 1]` for the mapping (see the note above) while one U repeat is really the
       * ~3.5 m rachis — so `derive()` encodes the U slope 3.5x too steep. Keeping the height
       * nearly flat along U is what stops that overstatement turning into a sideways tilt on
       * every pinna, which is not a shape a frond has. */
      const fibre = s.field(1.5, (u, v) => fbmA(u, v, 3, 24, 3, 0.5, cx.seed + 5) * 0.5 + 0.5);
      for (let y = 0; y < size; y++) {
        const v = (y + 0.5) / size, row = y * size;
        /* `b` = 0 where a pinna leaves the rachis, 1 at its tip. Below V 0.5 is the rachis
         * strip, which the geometry samples at 0.48-0.52. */
        const b = sat((v - 0.5) * 2);
        const rachis = sat(1 - Math.abs(v - 0.5) / 0.045);
        for (let x = 0; x < size; x++) {
          const i = row + x, u = (x + 0.5) / size;
          const idx = Math.floor(u * leaflets);
          // Per-leaflet variation. Constant across a pinna by construction, which is correct:
          // neighbouring leaflets on a real frond differ, one leaflet does not differ from itself.
          const jit = C.hash01(idx, 7, cx.seed) - 0.5;
          /* A pinna is thick and V-folded where it leaves the rachis and thins to a blade at the
           * tip, so the relief belongs on `b`. This is the same shape the old `sqrt(1 − d²)`
           * carried, moved onto the axis that has an extent. */
          const fold = Math.sqrt(sat(1 - b * b));
          /* The segmentation has to be in the *height* as well as the colour, or this map has no
           * relief at all: with `fold` and `rachis` alone the normal's 90th-percentile tilt
           * measured **1.6°**, i.e. a normal map doing nothing. Both are slow ramps in V and the
           * old cross-blade term is gone with the axis swap, so `fibre` is the only structure
           * left at a frequency a normal can use. */
          s.h[i] = 0.5 + fold * 0.26 + rachis * 0.30 + (fibre[i] - 0.5) * 0.34 * (0.35 + b);
          const t = sat(0.42 + (fibre[i] - 0.5) * 0.6 + jit * 0.5 - b * 0.10);
          const col = ramp3(0x2c5a34, oliveHex, oliveLight, t);
          s.r[i] = col[0]; s.g[i] = col[1]; s.b[i] = col[2];
          /* Sun-dried tips go straw-coloured — no palm in Egypt is uniformly green. Now driven
           * by distance out along the leaflet, which is where a frond actually dries.
           *
           * Damped from `0.7` at `smoothstep(0.30, 1.0, v)`, because that pair was written for a
           * V axis the consumer compressed to 0.208-0.417: the old term never exceeded 0.17 and
           * was effectively switched off. Restoring the axis switched it fully on and bleached
           * every leaflet tip to near-white. VEGETATION also marks 22 % of fronds dry through
           * vertex colour (`palmFrond`'s `dry`), so a full-strength straw here double-counts;
           * this leaves the texture doing the fraying and the vertex colour doing the season. */
          const d2 = sat(dry[i] - 0.42) * 1.5 * smoothstep(0.45, 1.0, b);
          s.mixHex(i, strawDry, sat(d2) * 0.45);
          s.mixHex(i, ribHex, rachis * 0.6);
          s.rough[i] = sat(0.55 + b * 0.16 + d2 * 0.2);
          s.occ[i] *= 0.86 + (1 - b) * 0.14;
          /* Leaflets fray at their tips, and only the dry ones. Kept in step with the colour
           * rather than carrying the shape: VEGETATION's `frondMat` sets neither `transparent`
           * nor `alphaTest`, so this alpha is inert today — it must never be the thing a frond's
           * read depends on, *and* it has to be right if that material is ever switched on.
           * Gated on `dry` for exactly that reason: an ungated taper would cut the outer 28 % off
           * every leaflet in the level the moment anyone enabled `alphaTest`, which is a
           * silhouette change disguised as a texture parameter. */
          a[i] = Math.max(rachis, sat(1 - sat((b - 0.86) / 0.14) * sat((dry[i] - 0.50) * 2)));
        }
      }
      /* `grain` is isotropic in tile space and this mapping is not: one U repeat is the whole
       * frond (~3.5 m of rachis) while one V repeat is two leaflet-lengths (~1.0 m). Size it off
       * V, the tighter axis — 32 cycles is 31 mm there (1.6 px on a `courtyard` palm at 20 m)
       * and a harmless 109 mm along U. At the old 320 it was 3 mm in V, six times under the
       * pixel and pure mip-chain fodder. */
      grain(s, { amount: 0.03, freq: 32, seed: cx.seed + 8, heightAmt: 0.006 });
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
  /* **Four passes, not three, and the fourth exists because of the consumer's material colour.**
   *
   * `Architecture.RECIPES.hieroglyph_wall.color` is `0xd6a874`, which three.js multiplies the map
   * by *in linear*: (0.680, 0.402, 0.185). That attenuates blue 3.7x harder than red, so a
   * pigment's chroma has to survive a multiply that is itself a saturated warm. Measured through
   * the whole chain (`scratchpad/huechain.mjs`): full-strength malachite comes out at display hue
   * 95 deg with chroma 105 — fine — but the *same pigment at 70 % over stone*, which is what
   * `paintRemnants` leaves, arrives at chroma **9**, one count above the critic's chromatic gate.
   * The blend with stone happens before the multiply, and the multiply then compresses whatever
   * is left toward its own hue.
   *
   * That is the mechanism behind `huelab`'s otherwise baffling reading that this recipe put
   * **100 % of its chromatic texels in one 30 deg bucket** while drawing from a pool in which
   * eleven signs of twenty are authored blue, green or turquoise. Nothing was wrong with the
   * pigments; they were being averaged into stone and then multiplied by a warm.
   *
   * So the flat painted decoration — the kheker crown and the register stripe — is separated out
   * into its own `'bandpaint'` pass and laid down at near-full strength by the recipe, exactly as
   * `column_papyrus` already does for its binding bands and for the same physical reason: band
   * paint on a temple wall was thick, flat and re-applied, where pigment in a sunk glyph is a
   * three-thousand-year-old ghost. The glyph pass is unchanged in coverage; only its `fade` moved.
   */
  const { worldTile = 10.4, glyphM = 0.72, cartouche = true, tall = 0.26, kheker = 0 } = o;
  const isBand = mode === 'bandpaint';        // flat painted decoration only
  const gm = isBand ? 'paint' : mode;         // styling mode handed to the HG primitives
  /* **Even, because the cartouche alternates and a tile has to close.** The natural count here
   * is `round(0.76 x 10.4 / 0.72) = 11`, and 11 is odd, so `c % 2` does not survive the wrap:
   * column 10 and column 0 of the next repeat carry the *same* state, and the alternation the
   * eye is following doubles once per repeat. That is a tile-boundary landmark of exactly the
   * kind §13 records — subtler than the once-per-repeat cartouche it replaced, but in the same
   * place and countable for the same reason. Found by arithmetic and then read off the
   * `wallstrip` render at temple's 248 px/repeat, where the doubled plain column sits at the
   * seam.
   *
   * **Rounded *up*, and the down-rounding was tried first and measured worse.** 10 columns is
   * the nearer even number and buys ~10 % wider columns, which looks like a free win for
   * §7.3's carving-detail condition. It is not free: `tools/census.mjs` on the built tile puts
   * the rarest-and-largest sign at **3.86x** the median sign area at 10 columns against 2.24x
   * at the original 11 — a wider column lets the layout pick a bigger quadrat, and a rare
   * *large* sign is precisely §13's beacon mechanism, i.e. the defect this change exists to
   * remove. At 12 it is **2.31x**, statistically the pre-change profile, for 8 % narrower
   * signs. So: 12, and the reason is the census, not the arithmetic. (§12's rule again — a
   * seam fix was about to be paid for out of the sign field's beacon budget, and no seam
   * metric could have shown it, because the payment lands somewhere the seam metric does not
   * look.)
   *
   * The general form, worth keeping in mind for anything drawn n-per-tile: **a motif with an
   * internal period p is only seamless when p divides the count.** Grep for the shape before
   * adding another one. */
  const cols = Math.max(2, 2 * Math.ceil((0.76 * worldTile) / glyphM / 2));
  /* `rowRegister` takes its quadrat size from the band *height*, so the frieze's sign size is
   * the band height and nothing else. Left at the old fixed 0.10 of the tile it drew 1.04 m
   * signs — and one of them, a tall green sign, was still legible as the same mark once per
   * repeat after the tall register had stopped giving the tiling away. Derive it from the same
   * metre figure so the two bands cannot drift apart again. */
  const frieze = clamp(glyphM / worldTile, 0.03, 0.12);
  const rule = size * 0.010;
  const rnd = rng((seed ^ 0x5eed) >>> 0);
  if (!isBand) {
    HG.registerRule(ctx, size, 0, rule, mode);
    HG.registerRule(ctx, size, size, rule, mode);
  }

  const pitch = size / cols;
  const margin = pitch * 0.12;

  /* **Cartouches: many, not one.** `cartouche` used to select a *single* column at random, and
   * that is precisely the shape §13 records as the largest visible-repetition defect this recipe
   * ever had — one 0.7 x 1.8 m outlined oval, the most distinctive silhouette in the sign set,
   * occurring exactly once per repeat, i.e. a beacon marking every seam. It was turned off, and
   * critic pass 5 then read the resulting wall as *"no cartouches"* (§3.9) — which it was.
   *
   * Both readings are right and the fix is neither of the two states that were tried. A royal
   * name on a temple wall is not rare; it is the most repeated thing on it. Drawn in every other
   * text column the cartouche occurs `floor(cols/2)` = **5 times per repeat**, so the rhythm the
   * eye locks onto has period `2 x pitch` — one fifth of the tile — and cannot mark the tile
   * boundary. The countability argument in §13 is a statement about a *once-per-repeat* landmark
   * and does not carry over to a five-per-repeat one; that is the thing to check in the
   * `wallstrip` render at the framing's own px/repeat, which is the only instrument here that
   * has ever separated the known-bad. */
  const cartEvery = cartouche ? 2 : 0;
  const cartPhase = cartouche ? (rnd() < 0.5 ? 0 : 1) : -1;

  /* Band -1 — the kheker frieze that crowns a temple wall.
   *
   * This is the polychrome answer to critic pass 5's finding #2 on the surface that carries it:
   * 86.7 % of the frame's chromatic pixels sit in two hue windows, and measured on the built
   * albedo (`scratchpad/huelab.mjs`) this recipe was **100 % of its chromatic texels inside one
   * 30 deg bucket** before this change. A kheker row is the right vehicle rather than another
   * stripe: it is large (0.8 m finials), it is a *silhouette* so it survives the squint pass as
   * a scallop rather than as a line, it alternates four pigments by construction, and it is the
   * single most recognisable crown motif on an Egyptian wall — so it pays for its area twice,
   * once in hue and once in "reads as Egypt in 200 ms". */
  const khTop = size * 0.012;
  const khH = size * kheker;
  if (kheker > 0 && mode !== 'paint') {
    /* **A multiple of four, because the frieze cycles four pigments.** `khekerFrieze` paints
     * `CYCLE[i % 4]`, so the colour rhythm only wraps cleanly when the count divides by 4. The
     * natural `round(10.4 / 0.72) = 14` does not: the tile ends `… lapis, malachite` and the
     * next one opens `lapis, malachite`, giving a doubled pair that occurs nowhere inside the
     * tile — a once-per-repeat break in the one rhythm on this wall regular enough for the eye
     * to be following. Sampled off the built strip at temple's 248 px/repeat, the sequence
     * confirms it, and it was *introduced here*: the two-pigment version this replaced happened
     * to close because 14 is even. Snapping to 16 costs 9 cm of finial width. */
    const khCount = 4 * Math.max(1, Math.round(worldTile / 0.72 / 4));
    HG.khekerFrieze(ctx, -2, khTop, size + 4, khH, khCount, gm);
    if (!isBand) HG.registerRule(ctx, size, khTop + khH + size * 0.014, rule, mode);
  }

  /* Band 0 — the tall text register, sitting under the crown. */
  if (!isBand) {
    const y0 = khTop + khH + size * (kheker > 0 ? 0.040 : 0.043);
    const y1 = y0 + size * tall;
    HG.registerRule(ctx, size, y1 + size * 0.020, rule, mode);
    for (let c = 0; c <= cols; c++) HG.columnRule(ctx, size, c * pitch, rule * 0.6, y0, y1, mode);
    for (let c = 0; c < cols; c++) {
      const x = c * pitch + margin;
      const w = pitch - margin * 2;
      if (cartEvery && c % cartEvery === cartPhase) {
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
    const y0 = size * (0.055 + kheker + tall + 0.215);
    const y1 = y0 + size * frieze;
    if (!isBand) {
      HG.registerRule(ctx, size, y0 - size * 0.020, rule, mode);
      HG.rowRegister(ctx, 0, y0, size, y1 - y0, seed + 907, HG.POOLS.divine, mode);
    }
    /* A painted stripe under the frieze. Purely horizontal, one repeat per tile: it puts colour
     * and an edge back on the plain area without giving the eye anything to resolve, which is
     * the only kind of detail a large wall can carry and still hold its shape when you squint.
     *
     * Five stripes rather than four, and the fifth is malachite. The four-stripe version was
     * `ochre · red · white · lapis` — three warm-or-neutral and one blue, i.e. one sample from
     * each of exactly the two hue windows critic pass 5 measured the whole project inside.
     * Green is the hue Egypt has and this project did not: `malachite #2f8f5a` after the
     * consumer's warm material colour and the full light+grade chain lands at display hue
     * **95 deg** in sun and **128 deg** in the ramp's mid band (`scratchpad/huechain.mjs`),
     * clear of both the 10-30 deg and 200-220 deg bins. In *shadow* it collapses to 188 deg
     * with everything else, so this buys nothing on a shaded wall and that limit is stated
     * rather than hidden. */
    if (mode !== 'paint') {
      HG.paintedBand(ctx, -2, y1 + size * 0.020, size + 4, size * 0.050, gm,
        [PAL.red, PAL.white, PAL.lapis]);
    }
  }

  /* Band 2 — the dado, at the foot of the wall.
   *
   * `rasterMask` flips rows on readback, so canvas y near `size` is the *bottom* of the wall,
   * which is where this belongs and is why it can be a broad flat colour rather than another
   * stripe: a dado is the one zone of a temple wall that is painted as a field.
   *
   * **This is the area that actually moves the hue statistic, and the arithmetic is the reason
   * it exists.** `huewhere.mjs` on the pre-change tile: **94.9 % of chromatic texels in the
   * single 20-30 deg bin, mean chroma 104** — the sandstone is not a neutral ground, it is a
   * saturated orange covering 95 % of the surface. Against that, decoration measured in
   * millimetres cannot register: the kheker crown and the register stripe together are ~2 % of
   * the tile in cool pigment, which moves a two-window concentration statistic by 0.02. A third
   * hue has to be paid for in *area* or not at all, and 0.13 of the tile is ~1.35 m of wall —
   * the height a real dado is.
   *
   * Five stripes, three of them cool, because the warm half of the palette (ochre 15 deg, red
   * 8 deg, gold 24 deg, and the stone itself at 20 deg) all lands inside one 40 deg window
   * after the chain, so warm pigment buys identity but no variety. */
  if (mode !== 'paint') {
    const dy = size * 0.845;
    if (!isBand) HG.registerRule(ctx, size, dy - size * 0.014, rule, mode);
    /* A narrow polychrome band over a broad single-hue field, not five equal stripes. The
     * equal-stripe version was measured-correct and *looked* like bunting: five saturated bars
     * of the same weight have no hierarchy, so the eye reads a flag rather than architecture,
     * and §2.3's "large simple areas of colour, detail concentrated at focal points" is the rule
     * it breaks. The field carries the hue and the band carries the detail. */
    HG.paintedBand(ctx, -2, dy, size + 4, size * 0.042, gm, [PAL.red, PAL.white, PAL.lapis]);
    HG.paintedBand(ctx, -2, dy + size * 0.042, size + 4, size * 0.094, gm, [PAL.malachite]);
  }
}

/**
 * An **architrave** band, not a wall: one row of large signs centred on the tile seam, rules
 * either side of it, plain dressed stone everywhere else, and one small secondary frieze at
 * mid-tile for the one consumer that sees a whole repeat.
 *
 * ── Why this exists, measured ────────────────────────────────────────────────────────────────
 *
 * `hieroglyph_gilded` was drawn by `glyphWall`, whose registers sit at surface V **0.645-0.945**
 * (tall) and **0.36-0.43** (frieze), with the incised rules on the seam. That is the right layout
 * for a wall. **None of this recipe's consumers is a wall.** Every one of the twelve call sites in
 * `EgyptLevel.js` is a horizontal band:
 *
 *     l.388  peristyle architrave  beam h 1.25    l.921  nave architrave     beam h 0.80
 *     l.621  pylon cornice         cornice ~0.86  l.1020 hall ext. cornice   cornice ~0.86
 *     l.666  great gate lintel     beam h 2.60    l.1085 pylon beam          beam h 1.40
 *     l.816  hall doorway lintel   beam h 1.50    l.1239 tomb beam           beam h 1.20
 *     l.1324 court beam            beam h 1.70    l.1349 fallen block        box  h 1.50
 *
 * and `Kit.beam`/`Kit.cornice` both call `boxProjectUVs(g)` **before** `place()`, so V is the
 * geometry's *local* Y times `UV_PER_M`, not its world height. A beam of height `h` therefore
 * samples exactly `h / (2 x tile) = h / 6.4` of the tile's V, **centred on the seam** (a beam's
 * blocks are built about local y = 0). So:
 *
 *     h 0.80 -> V +/-0.063     h 1.50 -> V +/-0.117     h 2.60 -> V +/-0.203
 *
 * The union over every gilded consumer is **V in [0.80, 1.0] u [0, 0.20]** — 40 % of the tile —
 * and the wall layout put its gilding in the other 60 %. Rendered through `hero`'s own camera at
 * the real 1280-equivalent scale, the great doorway lintel (10.4 x 1.5 m at 34 m, **379 x 58 px**,
 * the largest gilded surface in the money shot) comes out **luma p50 163/255, chroma p50 0.330**:
 * pale limestone with a 10 px strip of small gold signs along its lower edge. Critic pass 3 on
 * `hero` reads *"Gold doesn't read as metal — there is no gold in the frame to read"*, and this
 * is a large part of why. It is not a hue problem and not a shading problem; the gilding was
 * authored into a V band that no consumer samples.
 *
 * Same defect class as `MOTES.size`, `sand_ripples` and `palm_bark`: **a feature placed at a
 * coordinate the consumer does not visit.** The other three were about size; this one is about
 * position, which is why none of the size sweeps found it.
 *
 * ── Why the seam, and why not just make the tile anisotropic ─────────────────────────────────
 *
 * Centring on the seam is forced, not chosen: `beam` centres its blocks on local y = 0, so V = 0
 * is the middle of every architrave in the level. Drawing the row twice (`oy` of 0 and `-size`)
 * is the same wrap trick `ceiling_stars` uses for stars that cross the edge, and it is exact
 * because `columnRegister`/`rowRegister` are deterministic in their own box coordinates.
 *
 * The alternative — `tile: [3.2, 0.75]`, so one V repeat is 1.5 m and the whole authored height
 * lands on a beam — was rejected for two measured reasons. `derive()` takes the *same* `tile` for
 * the repeat and for the slope scale, so `kv` would go 6.72 -> 28.7; and 512 texels would map to
 * 6.4 m x 1.5 m, making every glyph 4.27x wider than tall unless the whole layout were redrawn
 * under a canvas transform. Both are real changes to the relief and the drawing on the largest
 * gilded family in the level, for the same result this gets by moving the band.
 */
function glyphArchitrave(ctx, size, mode, seed, o = {}) {
  const { worldTile = 6.4, signM = 0.85 } = o;
  /* The row's height in metres *is* its sign size — `rowRegister` takes the quadrat from the
   * band height — so this one number sets both how big a hieroglyph is and how much of each
   * architrave is gilded. 0.85 m is chosen against the *narrowest* consumer rather than the
   * average: the nave architrave is 0.80 m tall and samples V +/-0.063, so at 1.0 m it was
   * gilded edge to edge with no stone left, and so was the 1.25 m courtyard architrave that
   * `hero` frames Sly standing on. At 0.85 every consumer keeps a limestone rail above and
   * below the gold — which is what an architrave looks like, and which stops a change meant to
   * put one gold read in the frame from turning every horizontal band in the level solid gold.
   * Measured on `hero`'s doorway lintel: 1.0 m gives mean #a07834, 0.85 m gives #a27c3d with
   * visible stone margins. */
  const band = clamp(signM / worldTile, 0.05, 0.30);
  const rule = size * 0.010;
  const half = size * band * 0.5;
  // Drawn twice so the row is continuous across the seam it is centred on.
  for (const oy of [0, -size]) {
    const y0 = size - half + oy;
    /* **The whole band is a sunk panel, not just the signs.** `hieroglyph_gilded` gilds wherever
     * `carve`'s ramp is high — `g = sat(ramp * 1.35 - 0.10)` — so the gild mask is the *cut*, and
     * a row of separate sign-shaped cuts gilds only the signs. Measured on the built map, that
     * left the 1.5 m doorway lintel's visible V band at mean metal 0.22 with the rest bare
     * limestone: gold lettering on pale stone, not a gilded architrave.
     *
     * Sinking the band first and cutting the signs into it is both what a gilded architrave
     * actually is — leaf laid over a sunk field, the burnisher reaching only the arrises — and
     * what this recipe's own value policy was rebuilt around (see the long note on `bevel` in
     * `hieroglyph_gilded`: "leaf covers the whole sunk field, because that is what gilding a
     * sunk relief means"). The signs stay legible because they are also drawn in `'line'` mode,
     * which `carve` incises at `lineDepth`, so they read as dark cuts *in* the gold. */
    if (mode === 'cut') { ctx.fillStyle = '#fff'; ctx.fillRect(-2, y0, size + 4, half * 2); }
    HG.rowRegister(ctx, 0, y0, size, half * 2, seed + 41, HG.POOLS.royal, mode);
    HG.registerRule(ctx, size, y0 - size * 0.018, rule, mode);
    HG.registerRule(ctx, size, y0 + half * 2 + size * 0.018, rule, mode);
    HG.paintedBand(ctx, -2, y0 - size * 0.018 - size * 0.030, size + 4, size * 0.026, mode,
      [PAL.ochre, PAL.red, PAL.white, PAL.lapis]);
    HG.paintedBand(ctx, -2, y0 + half * 2 + size * 0.018 + size * 0.004, size + 4, size * 0.026, mode,
      [PAL.lapis, PAL.white, PAL.red, PAL.ochre]);
  }
  /* One secondary frieze at mid-tile. Nothing that samples a band ever sees this; it is here so
   * the single wall-shaped consumer — the tomb false door at `EgyptLevel.js:1263`, 6.2 m tall and
   * the only one that spans a whole repeat — is not 84 % bare stone. */
  {
    const fh = size * clamp(band * 0.55, 0.03, 0.10);
    const y0 = size * 0.5 - fh * 0.5;
    HG.registerRule(ctx, size, y0 - size * 0.016, rule * 0.8, mode);
    HG.rowRegister(ctx, 0, y0, size, fh, seed + 907, HG.POOLS.divine, mode);
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

/**
 * Built first in `init()`: everything the canonical shots actually put on screen.
 *
 * **Nine of the twenty entries here had no consumer anywhere in the build**, and this list is
 * the only reason they were ever built. Grepped across `src/world`, `src/player`, `src/fx`,
 * `src/ai` and `src/render` for every catalogue name and its alias, then measured the cost of
 * each recipe at the shipping size (`texSize 1024`, so tier 0 builds at 1024 and tier 1 at 512):
 *
 *   fur_sly 1942 ms · relief_figures 2543 ms · dust_soft 668 · light_shaft 514 · gold_cane 273 ·
 *   cloth_cap_blue 229 · cloth_shirt_blue 188 · mask_black 164 · spark_diamond 137
 *
 * **6.66 s of a 24.9 s prewarm (27 %) and 45.2 MB of the 350 MB texture budget, for material
 * that reaches no pixel.** The in-page warning `textures: prewarm took 33.7s at size 1024` in
 * the last `shots/report.json` is the same cost measured end to end, and on this container it
 * is paid inside every one of the 90 s boots that four agents queue behind.
 *
 * Why they were dead, so nobody re-adds them by reflex:
 *
 *   - The `sly` group (`fur_sly`, `fur_tail_rings`, `cloth_*`, `leather_boot`, `gold_cane`,
 *     `mask_black`) is **not what dresses the character.** `SlyModel.js` builds its own fur,
 *     cloth and gradient maps and sets its own repeats; it never calls `textures.get`. This is
 *     already recorded in `Textures._build`'s note on `tile`, and the PREWARM list had not
 *     caught up with it.
 *   - The `fx` sprites (`dust_soft`, `spark_diamond`, `light_shaft`) are the same story on the
 *     other side: **FX never asks TEXTURES for anything.** `src/fx/Emitters.js` draws its own
 *     sprites analytically — its own comment says so ("the sparkle field draws its own
 *     analytically"). `torch_flame` is the exception and stays: `Props.MATERIALS.flame`
 *     consumes it.
 *   - `relief_figures` has no consumer in `Architecture.RECIPES` or `Props.MATERIALS`, which
 *     its own recipe comment already states — it was still the second most expensive entry
 *     in this list.
 *
 * Removing a name here does **not** remove the recipe: `Textures.get()` still builds any
 * catalogue entry on first request. So if FX or CHARACTER ever wires one of these up it will
 * simply build lazily, and can be re-added here once it is actually on screen.
 */
export const PREWARM = [
  'sandstone_block', 'hieroglyph_wall', 'paving_courtyard', 'sand_ripples',
  'limestone_polished', 'column_papyrus', 'gold_leaf', 'hieroglyph_gilded',
  'sandstone_worn', 'granite_pink', 'mudbrick', 'ceiling_stars',
  'palm_bark', 'palm_frond', 'bronze_aged', 'torch_flame',
];

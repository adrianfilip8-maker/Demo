import * as THREE from 'three';
import { TOON_PARS, TOON_DETAIL, TOON_SHADE, TOON_DITHER, DEBUG_CALIB } from './shaders/toon.glsl.js';
import {
  weldNormals, applyInkWeights, createOutlineMaterial, buildOutlineShell, removeOutlineShell,
} from './Outline.js';

/**
 * Shading — the game's single lighting model, plus its ink lines.
 *
 * Every visible surface goes through `toon()`, which returns a MeshStandardMaterial whose PBR
 * accumulation has been surgically replaced (via onBeforeCompile) by a cel model: banded
 * diffuse ramp, coloured transparent shadows, fresnel rim, hard-stepped specular, wrap-around
 * SSS, triplanar detail, and height-fog aerial perspective — see shaders/toon.glsl.js.
 *
 * Inheriting from MeshStandardMaterial rather than writing a ShaderMaterial from scratch is a
 * deliberate call: it means shadow mapping, skinning, morph targets, instancing, batching,
 * screen-space-derivative tangents and every UV channel keep working exactly as three.js
 * intends them to, forever. Nothing here reimplements engine plumbing.
 *
 * Public surface (AGENTS.md §4.4) plus a few additive helpers other agents will want:
 *   toon(opts)                        cached material factory
 *   outline(mesh, opts)               attach an inverted-hull ink shell
 *   applyOutlines(root, opts)         walk a subtree and shell everything asking for it
 *   setKeyLight({...})                LIGHTING pushes the key here every frame
 *   setAtmosphere({...})              SKY pushes haze colour/density here
 *   normalMaterial                    override material for POSTFX's normal pass
 *   beginNormalPass() / endNormalPass()
 *   setOutlinesVisible(v)
 */

/* ---------------------------------------------------------------------------
   TUNE — every feel/look constant the critic loop might want to move.
--------------------------------------------------------------------------- */
/* Exported so `tests/shading.test.mjs` can read the terminators from the source of truth rather
   than restating them. The ramp thresholds interact with every shipped shot's sun elevation
   (KNOWN_ISSUES §210.1/§210.3), and that interaction is only checkable if the test and the shader
   read the same numbers. */
export const TUNE = {
  /* --- ramp --- */
  bands: 3,
  termLo: 0.14,          // first terminator, in N.L. Pushed off zero so the shadow side reads chunky.
  termHi: 0.52,          // last terminator; the gap between the two is the mid-tone band
  termSoft: 0.024,       // half-width of the smoothstep. ~0.05 total ≈ AGENTS' "≈0.03, hard but not aliased"
  shadowSharp: [0.10, 0.66],   // remap of the shadow map: hard, with a sliver of penumbra

  /* Cast-shadow penumbra quantiser — [steps, softness, amount]. See slyShadowBand() in
     toon.glsl.js for why this is the half of §7.3's banding condition that does not depend on
     geometry: the diffuse ramp needs a normal that turns, and this level is boxes, but the
     shadow penumbra is a gradient that exists on a flat wall. amount 0 restores the plain
     smoothstep. Set from the A/B in shots/shadowband/. */
  shadowBands: [2.0, 0.10, 0.0],

  /* --- key / fill --- */
  keyIntensity: 2.55,
  /* **Dead in the shipped game — do not tune this against a capture.** `Lighting.js:1335`
   * sets `p.ambient.intensity` every frame and `setKeyLight()` writes it straight into
   * `uAmbIntensity`, so whatever is here is overwritten before the first frame is drawn. It is
   * the boot value and the `_applyAutoLight()` fallback only. This is the same shape of trap as
   * the `shadowTintPeak` clamp that cost five capture cycles (KNOWN_ISSUES §3): the knob still
   * *moves* the image from a console poke, which is how it reads as live. The fill is a real
   * lever and it is needed for critic pass 3's "unlit <= 45% of lit" — but it has to be moved
   * in LIGHTING, via `Lighting.TUNE.ambientBoost` or `A.ambientIntensity`. */
  ambIntensity: 0.52,
  shadowFloor: 0.125,    // shadow illumination as a fraction of key luminance. AGENTS: never below ~14%
                         // of the *tonemapped* result — 0.155 of a raw 3.3 key left the frame flat.
  /* The daylight shadow hue. **Read the history before moving these.**
   *
   * Critic pass 2 measured one continuous surface at R/G 1.29 lit vs 1.63 shadowed — the
   * shadow a *redder, more saturated* version of the sunlit hue, where §2.2 wants violet-teal
   * — and ranked it the top defect in the report. The previous attempt spent five capture
   * cycles on these two numbers and failed:
   *
   *   wash 0.44           shadow R/G 1.25 vs lit 1.45 — on target, frame went lavender
   *   wash 0.24           still lavender, so the wash was never the cause
   *   shadowSat −0.18     hypothesis: desaturating albedo lets the blue tint dominate. Wrong
   *   shadowSat 0.06      frame essentially unchanged. Third hypothesis dead
   *
   * Its method error, which is worth more than its result: it took the critic's R/G ratio as
   * its metric, and *purple is a blue-channel phenomenon that R/G cannot see*. Shadow R/G sat
   * near 1.39 through every iteration while the frame was plainly lavender. Measure B against
   * max(R,G) as well, and look at the frame every time.
   *
   * The cause was neither of these knobs. It was `_refreshShadowColor()` lerping the shadow
   * tint toward the sand bounce **in linear radiance**: #2a3f66 is (0.023, 0.050, 0.133)
   * linear and #e8a852 is (0.807, 0.392, 0.084), so a 20% mix does not shift the hue 20% of
   * the way — it swamps it. The shadow *light* was leaving that function at R/G 1.52, magenta,
   * with green as its darkest channel. Every symptom follows from that one line: the shadow
   * came out warmer than the key because the light lighting it was warmer than the key, and
   * raising the wash added more of a magenta light, which is precisely what lavender is. The
   * mix is now done at matched luminance, so `shadowBounceMix` means what it says.
   *
   * With the light itself finally violet-teal, these two were re-bracketed against captures.
   * Both had to move, and in opposite directions to the obvious guess:
   *
   *   wash 0.34   correct hue, wrong material. The wash is albedo-*independent* — it lands on
   *               everything the key does not fully reach, which at a 22 degree sun is most of
   *               the frame — so at that weight it stops being a tint and becomes a coat of
   *               pale blue paint. Measured shadow R/G 1.09 and B/max 1.19, i.e. numerically
   *               on target, while `hero` went visibly lavender. This is the same trap the
   *               previous attempt fell into; the number was right and the frame was wrong.
   *               It is small on purpose: it exists to keep hue alive where the multiply
   *               neutralises, not to supply the hue.
   *
   *   sat +0.12   "saturation goes up in shadow" is a rule about the finished pixel, and
   *               applying it to the *albedo* before a coloured multiply does the opposite of
   *               what it promises. Warm sandstone at +0.34 has almost no blue left (linear
   *               0.105 -> 0.031), so multiplying by a violet-teal light could only ever
   *               produce a dark orange. Backing the albedo off toward its own luminance is
   *               what lets a coloured light read as coloured: the same surface swings from
   *               R/G 1.38 to 1.22 and from B/max 0.70 to 1.04 on that change alone. The
   *               chroma in a shadow now comes from the light, which is where it comes from
   *               in the reference art too. */
  /* 0.15 -> 0.05. **This term, not the `shadowTintPeak` clamp, is what makes the daylight
   * frames lavender.** Measured on a 12-variant sweep of `hero` and `courtyard` at 1280x720
   * (shots/washcap/, one boot, every variant the real `_refreshShadowColor()` with one input
   * changed — the re-implementation was checked bit-exact against it first, maxAbsErr 0.0).
   *
   * The wash is `uShadowColor * uShadowWash * shadowMix * ao`: **albedo-independent**. At a 22
   * degree sun `shadowMix = 1 - key` is non-zero over **88.8% of the `hero` frame**, so at 0.15
   * against the clamped light this stopped being a tint and became a flat coat of violet paint
   * over seven eighths of the image — which is exactly what "shaded sandstone reads as violet
   * concrete" is. `src/textures/Materials.js:2174` reached the same conclusion independently
   * from the other end: the flat term is `(0.021, 0.028, 0.063)` against a dark texel's own
   * `(0.002, 0.003, 0.006)`, an order of magnitude larger than the material.
   *
   * Removing it alone (`washoff`), against removing the whole shadow light (`off`) as control:
   *
   *   hero          cool% 57.1 -> 9.8    warm% 21.3 -> 39.0   frozen-set sat 0.238 -> 0.275
   *   courtyard     cool% 44.8 -> 24.1   warm% 35.8 -> 43.3   frozen-set sat 0.172 -> 0.299
   *
   * Note the shadows come out **more** saturated, not less: this is not "desaturating toward
   * grey", it is removing a flat overlay that was burying the material under it.
   *
   * It is also the term that inverts the key light, which is the top item in critic pass 3.
   * Removing only the wash takes `hero`'s fully-unlit pylon from L 61.0 to L 30.0 (-51%) while
   * the sunlit wall moves L 151.4 to L 148.9 (-1.7%). An albedo-independent additive term
   * lands at full strength on a face with no sun on it and is negligible next to a lit one, so
   * it is precisely the term that lets an unlit face out-brighten a lit one.
   *
   * Why 0.05 and not 0. Zero measured best on every palette metric but took `hero` to cool%
   * 9.8, which is pass 2's "monochrome-warm" failure re-entered from the other side, and the
   * standing instruction is to keep the violet and put it in the shadows only. 0.05 keeps the
   * hue support the term exists for at a third of the strength. `shots/washcap2/` brackets
   * 0.00 / 0.05 / 0.15 against the fill to settle the value.
   *
   * **What this cannot fix, for whoever picks up item 1.** The critic's "unlit <= 45% of lit"
   * is not reachable from this file on `courtyard`'s obelisk: with the wash at zero *and* the
   * whole shadow light at zero, its shadow face still measures **47.8%** of the lit face. The
   * remainder is the hemispheric fill, and `TUNE.ambIntensity` below is a **dead knob** —
   * `Lighting.js:1335` republishes `ambient.intensity` through `setKeyLight()` every frame, so
   * it is overwritten exactly the way `shadowFloor` is clamped. That half belongs to LIGHTING. */
  shadowWash: 0.05,
  shadowSat: -0.35,

  /* ── shadowHold / shadowHoldKnee — the shade band derived from each material's own albedo ──
   *
   * KNOWN_ISSUES §269, `progress/records/PREREG-shadowhold.md`. **Read §269 before moving these;
   * they sit on top of a resolved disagreement between two critics and the reference frames, and
   * the resolution is what makes both survivable.**
   *
   * The defect they answer (critic pass 9, D1): the same dune renders as hot orange in sun and
   * teal-grey in shade with a hard boundary and no shared identity — measured `Δh` 173.8° on
   * `dunes`, 165.6° on `hero`, against 12.6–24.8° on three verified single-material regions of
   * `sly3-venice.jpg`.
   *
   * The mechanism, measured offline from these very constants by `scratchpad/hue/model.mjs`
   * (regex-read, not transcribed; it reproduces the `G/R 3.258` that
   * `ADDENDUM-shadowhue-restate.md` §1 derived independently):
   *
   *     shadow light, linear   (0.1039, 0.3384, 0.5367)   G/R **3.258**
   *     break-even             an albedo flips R>G to G>R when its linear G/R exceeds **0.307**
   *     SANDSTONE mid          G/R 0.485 -> shade hue **175.9°** against a lit **22.5°**
   *
   * So the critic's phrase "global tint substitution" names the right defect and the wrong
   * mechanism, and so did my own first draft of this note. Nothing here substitutes a tint for a
   * multiply: the shadow light is simply saturated enough (G/R 3.258 against sandstone's 0.485)
   * that **the multiply itself inverts the channel order**, and it carries ~153° of the measured
   * ~174°. `shadowWash` compounds it and is not the cause. The fix is therefore not to remove
   * the tint — it is to stop the light's chroma from overwriting the material's.
   *
   * Why this is a new gate and not a move of `shadowSat` / `shadowWash` / `shadowTeal`. Critic
   * pass 2 ranked "the shadow is a redder, more saturated version of the sunlit hue" as its top
   * defect, and those constants are its fix — the one that cost five capture cycles (§3). Moving
   * them back reverses a ranked fix on the say-so of a later critic, which is how a project ends
   * up with no memory. `shadowHold` is gated on **albedo chroma**, a per-pixel quantity the old
   * model never consulted, so critic 2's constants ship unchanged and both findings hold in the
   * same build: the shade is still cooler and less red than the lit side (critic 2), and it is
   * still the same material (critic 9).
   *
   * `shadowHoldKnee` is the albedo chroma at which the hold reaches full strength, and it is the
   * whole of the achromatic answer. Hue is ill-defined on limestone and granite, so there is
   * nothing there to hold; below the knee the material keeps the shipped violet-teal shadow and
   * §2.1.3's "shadows are never grey" is preserved exactly where it is load-bearing.
   *
   * **The knee is in LINEAR chroma, not sRGB** — the shader's `alb` is `diffuseColor.rgb`, which
   * three delivers linear, and an earlier draft of this note quoted sRGB numbers, which are
   * roughly half. Linear `(max-min)/max` at the palette stops: SANDSTONE mid 0.825, SANDSTONE
   * light 0.763, LIMESTONE mid 0.509, LIMESTONE light 0.337, PAINT white 0.259, LAPIS 0.955,
   * a true grey 0.031. At a knee of 0.25 everything but a true neutral holds fully; the knee is
   * the lever for handing more of the frame back to the shadow light, and raising it is the
   * first thing to try if a future pass measures the warm/cool balance going monochrome-warm
   * (the failure critic pass 2 recorded, and the reason `shadowWash` is 0.05 and not 0).
   *
   * **0 is bit-identical** — `mix(x, y, 0.0) == x` and `(1.0 - 0.0) == 1.0` on any driver — so
   * the A/B's null arm is exact rather than approximate. */
  shadowHold: 0.0,
  shadowHoldKnee: 0.25,

  /* The sand bounce is *bounced* light — sunlight already absorbed once by sand — but it
     arrives as the palette colour at full radiance, brighter in red than the sun. Attenuating
     it here is the second half of the shadow-hue fix; see the fill term in toon.glsl.js. */
  bounceGain: 0.42,

  /* Task #19: hue blend of the fill's sand-bounce leg toward the sky, at matched luminance
     (see the fill term in toon.glsl.js). The fill is the one light term left with G/R < 1
     after 07fe98c, which made it the pre-registered suspect for temple's 233-256 shadow
     violet — but the corridor model (scratchpad/t19corridor.mjs, cross-validated on the
     t16ab base/teal15 frame pair) sizes this lever at 7-14 deg of a 10-30 deg residual:
     REAL and INSUFFICIENT. The violet's centre of mass is the terminator-corridor
     population (partial warm key crossfading with teal shadow — temple has ~43% of its
     visible architecture inside a terminator soft window, KNOWN_ISSUES §8), where the
     strong lever is PostFX's splitShadowTeal. This knob ships as the fill's share of that
     package. 0 = bit-identical legacy (mix at 0 is exact); capture A/B pokes the uniform.
     PREREG-task19.md stakes the acceptance; value lands only with the frame verdict.

     **0.70 SHIPS.** The model above was wrong about the magnitude and the direction of its own
     error, which is recorded rather than smoothed over: it sized this lever at 7-14 deg and
     called the fill "REAL and INSUFFICIENT". Measured in frame (`t19ab`, one boot, identity
     gate `maxAbsErr 2.78e-17` at all knobs 0, so the A leg is exactly the legacy chain), the
     fill alone moves temple's shadow hue by 2-4x that: hieroglyph_wall 232 -> 218,
     sandstone_block 256 -> 223, column_papyrus 224 -> 213, against §2.2's own shadow tint of
     219 deg. Saturation RISES (0.213 -> 0.293, 0.235 -> 0.338), so this is violet being
     replaced by a more saturated cool blue, not the desaturation-toward-grey KNOWN_ISSUES §3
     warns about. Lit splits move <=2 deg on every material, so the day mood is untouched.
     `pkg30`/`pkg50` overshoot to 195-211 — past the palette onto the cyan side — so this is
     the weakest variant that clears the condition and it is also the best on art direction.
     RESULT-task19.md carries the table and the falsified predictions.

     The ship was held one extra capture on purpose. The acceptance required night to be
     MEASURED, and night's only evidence was `pkg30`/`pkg50` — strictly stronger variants, so
     night was bracketed rather than measured, and shipping on a bracket is the four-of-ten
     move this fleet keeps refusing. `rim3`'s `fill70` leg closes it on night's own frame:
     subject silhouette lift vs the norim floor goes 1140 px / mean 12.15 -> 1129 px / 12.00,
     i.e. **99.0% of lifted pixels and 98.8% of mean lift retained**. Temple 104.2%/101.4%,
     interior 99.2%/98.3%. §7.3's rim condition pays nothing anywhere.

     One number here needs its caveat attached or it will mislead: this knob changes 45-90% of
     the PIXELS in a frame, at a mean delta of 3-11 L. That is a fill term touching everything
     slightly, and per KNOWN_ISSUES §8 it proves the knob is connected, not that it is right —
     the load-bearing figures are the silhouette costs above and the hue table in RESULT-task19. */
  fillSkyMix: 0.70,

  /* Grade-lever scaffolding (scratchpad/PREREG-creamfix.md; blueskew/coolskew verdict —
     the character's authored warm cream displays teal in fill+shadow, and the blind
     comparison convicted the light+grade chain, per-term B shares shadowMul 66 / fill 29 /
     wash 5). Three knobs, every default 0 = bit-identical legacy (mix at 0 exact):

     neutralShadow / neutralFill — ATTRIBUTION ARMS, never ship. Lerp uShadowColor (the wash
     follows it) / the hemispheric fill toward luma-matched grey, globally. Together with
     PostFX pokes (saturation 1, splitStrength 0, aoTintNeutral 1) they are TEXTURES'
     registered "neutral arm" (PREREG-blueskew-albedo §4); separately they are the
     single-knob legs its gate-fail branch reads against the B shares.

     subjWarmShade — THE FIX CANDIDATE. vSlySkin-scoped in the shader (skinned draws only:
     Sly and the guards; architecture is bit-identical by construction), lerps the chroma of
     both shade-side lights toward luma-matched PAL.wrapWarm on the subject. Modelled in
     scratchpad/creammodel.mjs (validated t16chain2 transcription): cream crosses the
     authored floor corridor b−r [−25,−16] at ≈ 0.45–0.52, rings stay cool (+30 at 0.5),
     luminance moves < 2% (luma-matched by construction). Night is DIRECTION-modelled only
     and renders FIRST in the A/B. Ships only with PREREG-creamfix.md's frame verdict. */
  neutralShadow: 0.0,
  neutralFill: 0.0,
  /* SHIPPED at 0.50 — certified by the creamfix A/B (progress/records/RESULT-creamfix.md):
     V1 cream lands in its corridor, V2 the navy rings hold, V4 night direction + retention +
     look, and V5 TEXTURES' independently re-anchored gate (S1 −42, S2 −77). The arm at 0.65
     measured closer to §2.2's authored sandstone ratios, and was NOT taken: choosing a
     different arm after seeing which one looks nearer authored is post-hoc selection, and 0.50
     is what the seal certified. Whether the acceptance corridor is itself the right ART target
     — it was derived as an ATTRIBUTION target, for deciding whether the blue was light-owned —
     is an open question routed to the blind critic rather than settled by re-picking an arm.
     V3 (off-subject scope) is VOID, not failed, and wants one pinned capture (§28/§30). */
  subjWarmShade: 0.65,
  subjWarmShadeNightPin: 0.50,  // night keeps the pre-banda2 look; published per frame at setKeyLight

  /* subjShadowHold — §269's hold band, vSlySkin-scoped (PREREG-subjhold.md, §287): in shade
     the SUBJECT's band carries its own albedo hue instead of the shade light's, which is the
     measured mechanism crushing the costume's authored hue at mid-range.

     SHIPPED at 1.0 by PREREG-subjhold2's full-green run (RESULT-subjhold2.md, §289): both
     mid shots recovered into the reference band (hero 223.9°→216.2°, interior 224.2°→217.4°
     vs 213.5±6.0), close-up held, face moved ≤1 count on both creamfix ROIs, architecture
     saw only the subject's own pixels (139, corners 0), and night went COOLER with the
     moonlit read intact (LOOK gate). 0.0 restores the pre-hold build bit-identically
     (max(uShadowHold, 0·vSlySkin) = uShadowHold). Published per frame at setKeyLight, flat
     across the clock — night behaviour is certified by that seal's PROT-NIGHT, not a pin. */
  subjShadowHold: 1.0,

  /* Baked aoMap strength, globally. The maps were authored while cast shadows were suppressed
     engine-wide (KNOWN_ISSUES §1), so the baked term was carrying the low frequencies as well
     as the contact scale. Shadows work now and the critic caught the consequence: occlusion
     "broad and soft everywhere and tight and dark nowhere", a smudge with no occluder near it
     on the `courtyard` obelisk. The GTAO pass owns contact scale; this is the leftover. */
  bakedAO: 0.55,

  /* Ceiling on the shadow light's brightest channel after the floor rescale.
     ~~the single constant that sets daylight shadow magnitude, because `k` is clamped by it in
     every daylight shot~~ — **RETRACTED, and this is the trap: the cap is INERT outdoors.**

     It binds on `interior` and on nothing else. On all six outdoor daylight shots `k` is
     floor-bound, so raising this value is bit-identical and lowering it is the only direction
     that does anything. Measured, one boot, live readback: KNOWN_ISSUES §261, the retraction
     block in `_refreshShadowColor()`, and `progress/records/clamp2.mjs`.

     **Do not tune this against a daylight frame expecting it to behave like the §3 lever.**
     §3's "the daylight shadow magnitude is set by `shadowTintPeak` and by nothing else" is a
     statement about a build with `shadowTeal: 0` and `shadowTintPeak: 0.52`, and both of those
     have since moved. The live lever outdoors is `TUNE.shadowFloor` (and LIGHTING's
     `ambient.floor`, which mins with it) — those were the dead knobs and now they are the
     live ones. The release point is 0.562; this ships at 0.62. */
  shadowTintPeak: 0.62,

  /* How much warm sand bounce is mixed into the shadow light — a desert shadow is lit by sky
     *and* by sun bouncing off the sand around it, and a purely blue shadow light multiplied
     into warm sandstone neutralises to mauve.

     The mix is done at matched luminance (see _refreshShadowColor). Doing it on raw linear
     radiance, as it used to, is what broke the shadow hue: the palette hue is R/G 0.667 in
     sRGB but the *linear* bounce is 35x brighter in red than the linear tint, so 20% of it
     took the light to R/G 1.52 — warmer than the sun it was meant to contrast with.

     **What this knob can and cannot reach, in closed form so nobody spends a capture cycle
     discovering it.** §2.2's R/G 0.667 is the shadow *hue* #2a3f66, i.e. a LIGHT colour. An
     in-frame shadowed surface is light x albedo, and `sandstone` mid #c9915a is itself R/G
     2.06 in linear. Transcribing the matched-luminance mix below and multiplying through:

       mix    shadow light   light R/G    sandstone in shadow, with the split-tone cool leg
                                          (x unit-luma #2a3f66 at splitStrength 0.16)
       0.00   #2a3f66        0.667        #1d1f23  R/G 0.935  B/max 1.000  darkest R
       0.10   #303f61        0.762        #221f21  R/G 1.097  B/max 0.971  darkest G
       0.20   #353e5c        0.855        #261f1f  R/G 1.226  B/max 0.816  darkest G

     Two things follow, and both have been walked into already:

     1. **R/G 0.667 is not reachable on a surface at any value of this knob**, and never was.
        The light hits it exactly at mix = 0 — that is what the number describes. Reading it
        as a target for a shadowed-sandstone *pixel* is the same category error as reading
        §3's "after" table as a target; the albedo alone puts the floor at 0.935.

     2. ~~**This knob is not what makes green the darkest channel — the split-tone is.**~~
        **WITHDRAWN — measured with the ordering statistic itself, and the split does not
        decide the ordering at any operating point.** The gains are right: the cool leg
        multiplies by unit-luma #2a3f66, i.e. per-channel (0.914, 0.999, 1.265) at strength
        0.16, so it lifts blue 26.5%, cuts red 8.6% and leaves green alone. The *inference*
        from them was not. Running the validated chain (`scratchpad/t16f.mjs`, the same
        `shadowPixel` + `grade` validated against a live `uShadowColor` readback and the eye1
        frame medians) and printing `argmin(R,G,B)` with the split ON and OFF:

          mix        material          pre-split min   post-split min
          shipped    sandstone_worn          G               G
          shipped    sandstone_block         G               G
          0.20       sandstone_worn          G               G
          0.20       sandstone_block         G               G
          0.10       sandstone_block         G               R      <- split REMOVES G from last
          0.05/0.00  all three               R               R

        Green is already the darkest channel in the scene-linear composite, before the grade
        exists, because 88.4% of shadow-side radiance is albedo-multiplied and sandstone's own
        linear G/R is 0.483. In the one cell where the split changes the ordering it moves G
        *out* of last place. So the split is not the mechanism in either statistic — not in
        hue (toggling it off moves 266 -> 278, toward magenta) and not in channel order.

        **Why this was wrong is worth more than the correction.** Both this claim and the
        toggle that "refuted" it were measuring different things — an ordering and an angle —
        and each was read as authority over the other. A term that raises B rotates hue toward
        blue AND pushes B above G simultaneously; "opposite directions" was an artefact of
        comparing two statistics, not a contradiction. Name the statistic before quoting a
        sign, and reach for `argmin` when the claim is about which channel is lowest.

     0.20 -> 0.05 (task #16, t16ab A/B). At 0.20 every shadowed wall in every daylight shot
     measured hue 261-298 — B-max with R > G, a channel order no §2.2 colour has (every
     intended cool is G >= R). TEXTURES cleared the albedo (authored hue 17-38 on all eight
     implicated materials), and the chain decomposition (t16chain2.mjs) found G has no
     champion in ANY term: fill G/R 0.79, mult 0.81, wash 1.34. This knob alone is measured
     insufficient (t16ab `mixonly`: worn/block land 252/256, still violet) — it ships
     INTERLOCKED with `shadowTeal` below. */
  shadowBounceMix: 0.05,

  /* ---- depth-dependent bounce (§115.4) --------------------------------------------
   * `shadowBounceMix` does two jobs with opposite optima. §115.1 measured the revert to
   * 0.20 as recovering 120%/65%/74% of §111's cool drift on hero/temple/sly-closeup; §115.4
   * measured that same revert re-creating task #16's magenta exactly (temple's shadowed bay
   * hue 211 -> 270, G-darkest 5.7% -> 66.7%, failing both ledger lines). So the value cannot
   * be chosen globally.
   *
   * The split: `shadowBounceMixLit` is the share used at the SHALLOW end of the shade and
   * `shadowBounceMix` stays the deep-shade value, handed over across `shadowDepth`
   * (a smoothstep window on shadowMix = 1 - key).
   *
   * **Read the arithmetic before tuning these.** Both shader terms carrying the shadow light
   * are multiplied by shadowMix, so the knob's per-pixel authority is exactly proportional to
   * shadow depth (scratchpad/gateauth.mjs derives it from the shipped expression; it does not
   * depend on albedo, ao, normal or the tone curve). Protecting deep shade therefore forfeits
   * most of the available authority by construction: handing over at shadowMix 0.85 retains
   * only ~32-60% of a full revert's effect depending on how the frame's depth distribution
   * falls. This lever is a PARTIAL recovery with an arithmetic ceiling, not a complete one —
   * the authority it cannot reach lives in terms that are NOT gated by shadowMix, i.e. the
   * ambient fill (`uFillSkyMix`, measured at 32%/24%/15% in §115.1).
   *
   * DEFAULT IS INERT: Lit == Mix makes the two uniforms bitwise equal, so the shader's mix()
   * is a no-op. Whether that is bit-identical in the frame depends on how the driver spells
   * mix(); the A/B carries a null arm to verify it rather than assume it. */
  shadowBounceMixLit: 0.05,
  shadowDepth: [0.45, 0.85],

  /* Blend of the shadow tint toward §2.2 TURQUOISE #2fa8a0, applied inside
     `_refreshShadowColor` — NOT to `PAL.shadowHue` — because LIGHTING's `ambient.tint`
     republish overwrites `_shadowTint` every frame, and because the blend must feed the
     floor/peak arithmetic (see the k-cap note there) rather than arrive pre-scaled.

     Why a hue blend at all: sandstone albedo is G/R 0.483 linear, so the multiplied leg
     reaches G = R only when the shadow light's G/R exceeds ~2.07 — #2a3f66 after the
     luminance-matched bounce mix delivers 1.34 and CANNOT get there at any bounceMix
     (mix 0 gives 1.87). The tint itself has to bring green. #2fa8a0 is §2.2's own cool
     ("violet, teal, or deep cyan" shadows are all sanctioned).

     0.15 is the smallest step that clears the ledger line (shadowed-arch hue <= 226,
     G-darkest < 50%) on the evidence frame — t16ab measured, every frame opened:
       sly-closeup worn/block/paving  base 275/282/261 -> teal15 224/226/211,
         satP50 0.77-1.10x base, G-dark 99/96/90% -> 12/16/4%, lit splits +-1 deg;
       night (FIRST, per ledger)      medians 236-242 -> 224-232, sat RISES 0.69->0.78,
         no green read;
       temple                         papyrus (55% of frame) 294 -> 224; residual 233-256
         on wall/block/paving is the FILL leg's sand-bounce R-dominance (untouched by both
         levers, 31% share on the validated wall, larger in enclosures) — the next lever is
         the fill hue, not more teal: teal20 buys ~8 deg on a 30 deg residual while pushing
         paving to 204 and sat to 0.75x.
     Interlock, both directions: teal at the old warm mix collapses shadow sat to 0.02-0.11
     (grey — §2.2 violation; model row, grey-collapse half not frame-captured); the new mix
     without teal stays violet (`mixonly` frame above). Ship both or neither. */
  shadowTeal: 0.15,

  /* --- rim --- */
  rim: 0.55,
  rimPower: 3.1,
  /* THIS term owns the two artefacts still standing after the gates (task #8a attribution,
     scratchpad/plinth2.mjs on the rim1 frames): the `courtyard` plinth-lip pale band (73 px
     strict, a visible ragged white-cyan edge in the crop) and the dominant share of `night`'s
     paving streak (base 181 / surfonly 60 / screenonly 0 visible px — PostFX's screen rim
     alone contributes zero to both). Mechanism, measured at the lip: this rim is added in
     scene-linear and tonemapped, so on saturated warm stone — norim (135,65,40) — a cool add
     lands as +3R +73G +105B display; R sits on the AgX shoulder, G/B ride the steep mid, and
     the lip renders (138,138,145): a pale grey band where §2.2 wants `#7fd4ff`. Any fix is a
     scene-space colour question AT THIS TERM (e.g. bounding the add against the surface's own
     radiance so the hue survives the shoulder) — do not chase it in PostFX's display-space
     rim, whose placement was evaluated and kept (see the headroom note in PostFX.js TUNE),
     and re-measure `night` first: its silhouettes are what this term's magnitude buys. */
  rimGain: 4.10,         // scales the art-directed rim colour into bloom range
  /* 2.05 -> 4.10 is a RE-BRACKET, not a brightening. It lands in the same change that gives
     `rim.strength` a consumer (`setKeyLight`), and the two only make sense together.
     `Atmosphere.rimStrength` is `lerp(0.5, 0.72, nightAmount)`, so:
         day    4.10 * 0.50 = 2.050   <- identical to the value every shot rendered before
         night  4.10 * 0.72 = 2.952   <- what the dead `_applyAutoLight` path always intended
     Every canonical shot except `night` (tod 0.02) and `guard` (0.10) has nightAmount 0.000,
     so this change is arithmetically bit-identical on fourteen of sixteen framings and moves
     exactly two. That is the whole reason it is shaped this way: wiring `strength` through
     against the old 2.05 would have silently halved the daylight rim on every shot at once.

     **The paragraph that used to be here was false, and it is why the constant is documented
     with its arithmetic now.** It claimed `_applyAutoLight()` "republishes uRimGain every time
     the clock moves, so on a night shot the uniform reads 2.9725". It never did: `_autoKey`
     goes false on LIGHTING's first `setKeyLight` (l.1155) and `_applyAutoLight` is then never
     called again, so the uniform held its boot value for the life of the process. Measured
     live, not read: rim1 and rim2 print `uRimGain=2.05` at the staging line of every shot they
     captured, including `night` at tod 0.02 — two independent boots, six and five shots.
     KNOWN_ISSUES §61.6. A comment asserting a runtime behaviour is not evidence of it, and
     this one sat directly on the knob it was wrong about (§61.7).

     Still true and still worth heeding: take an A/B baseline off `uniforms.uRimGain` after
     staging each shot, per shot, never off this constant — it is now a *pre-strength* factor
     and is not the live value on any frame.

     **HARNESS AUTHORS, READ THIS — the fix changed how you poke the rim.** `uRimGain` used to
     be written exactly once, at boot, so poking `uniforms.uRimGain.value` stuck for the life
     of the page. It is now recomputed inside `setKeyLight`, which `Lighting.update()` calls
     via `_publishKeyLight()` on EVERY frame — so a poked uniform is silently reverted by the
     next `__GAME.step()`, before the capture, and the arm renders the baseline while the
     harness log happily reports the value it asked for. Poke `shading.tune.rimGain` instead
     (it is the live `TUNE` object, and the per-frame recompute reads it); or poke both, which
     is what `rimsweep2.mjs` already does and why that harness survives this change.
     The same applies to `uRimColor`: `_setRimColor` re-asserts it per frame, so a direct
     write to a material's uniform is reverted too — override via the payload, or stub
     `_setRimColor` for the duration of the arm.
     Verify with a readback after the step, never before it. */

  /* Silhouette gate on the fresnel rim — see the long note at the term in toon.glsl.js.
     [lo, hi] are "normal turn per screen height": zero on any planar patch at any grazing
     angle, 1-3 on a background dune, 10-40 through the silhouette band of a limb or a head.
     The third number requires the turn to be *convex*, which is what keeps the rim off the
     concave contacts §7.3 wants darkened. A fresnel on its own cannot tell a silhouette from
     a flat face seen edge-on, and measured on `hero` that mistake was laying up to 0.91 of a
     full-strength cool rim across the open courtyard paving. Set [0, 0, 0] to disable the
     gate and get the old term back.

     **The gate's cost is not uniform across a frame, and the split is by geometry type.**
     Measured on `temple`, the shot framed down the nave and dominated by curved column shafts
     at grazing angles — the case this gate is supposed to be worst at. Lifted pixels within
     3 px of an ink line, ungated -> gated:

       column shafts (ROI x 333-512, y 72-518)   5632 -> 4046   72%, mean lift 31.1 -> 29.5,
                                                                peak identical at 103
       Sly (projected box, 161x154 px)           9509 ->  866    9%, mean lift 35.3 -> 24.3

     Architecture keeps its rim; the character does not. That is the convexity half doing
     exactly what the note above it predicts — faceted skinned quads read as concave — and it
     is why `rimSkinExempt` below exists. Whole-frame silhouette coverage tells the same story
     per shot (gated / ungated): `combat` 71/67, `traversal` 57/59, `courtyard` 60/78,
     `interior` 40/63, `temple` 41/96.

     **The sentence that used to end this note — that on `interior` and `temple` "the
     screen-space rim's depth-ratio gate is shut as well and nothing is left to carry it" — is
     measurably false, and it was load-bearing.** It is the belief PREREG-rimstarve was built
     on. Measured by ray-casting real Architecture+Props geometry along the taps the shader
     actually samples (`scratchpad/rimstarve.mjs`, no renderer, no capture lock), the depth
     ratio `(z_bg - z0)/z0` over the character's own rim band is:

       temple 0.418   interior 0.441   night 0.169   courtyard 0.244
       combat 0.442   traversal 1.492  hero 2.840    sly-closeup 1.269   dunes 6.546

     against a gate that opens at 0.05 and is fully open at 0.16. On `temple` 94% of that band
     is above the opening threshold and 81% is fully open; on `interior`, 96% and 89%. **Gate A
     is open on every shot that stages a character**, and the whole planarity gate costs the
     subject 0-6% of the screen rim's mask everywhere except `night` (22%). The instrument was
     proved first on a known input: with the level removed every tap is sky, and it returns
     S = 313.5, i.e. z0 = 4000/314.55 = 12.72 m, matching the independently frozen 12.54-12.94.

     So "nothing is left to carry it" was an inference from two gates being *assumed* shut, and
     neither is. What the character's rim actually costs is the convexity half, above, which is
     what `rimSkinExempt` already fixes. Do not re-derive the starvation hypothesis from this
     block. */
  rimCurve: [3.0, 10.0, 1.0],

  /* Exempt skinned geometry from the convexity HALF of that gate (the magnitude half still
     applies). The gate's own note in toon.glsl.js records that convexity rejects 69.7-79.7% of
     Sly's fresnel rim band because low-poly skinned quads straddle facet boundaries — his
     normalised fold reads -0.64 where a real concave crease reads -0.645 — while being the only
     thing suppressing a concave wall/ground contact on architecture. Those two facts do not
     conflict once the test can tell a character from a wall, which is what this does.

     1 ships, measured in rim2 (5 shots x 9 variants, one boot, difference-mask contour
     coverage vs the norim floor): the exemption equals convoff on the character and equals
     base off it — verified per-pixel, with every hot cell in the outside-identity accounted
     to animated content (lamp glows, cloud scroll, shafts, a guard walking into frame), not
     to leak. Character contour coverage base -> skinfix: sly-closeup 26.3 -> 26.8, night
     31.9 -> 34.8 (= convoff exactly), traversal 53.0 vs convoff 50.8. Architecture FLAT
     stays at base: hero 3647 -> 3849 px (1.055x, bound 1.1x); temple 1773 -> 2076 reads as
     1.17x but the excess localises to FX flicker cells that move in BOTH directions
     (+144@(640,64), -44@(1024,256)) and the nosly drift control moves with them — static
     architecture is net-flat. The cane is NOT exempt (vSlySkin comes from USE_SKINNING);
     measured mismatch vs convoff clusters on the cane shaft at 2-6% of subject px and the
     silhouette shows no visible notch. 0 = the pre-rim2 behaviour, for A/B. */
  rimSkinExempt: 1.0,

  /* Waive the MAGNITUDE half of the same gate on the same population. Separate knob from
     `rimSkinExempt` because the two halves fail differently and were established by different
     measurements: the convexity half rejects a character's rim because low-poly skinned quads
     straddle facet boundaries, while the magnitude half rejects it because a character IS
     mostly smooth on the scale of a pixel — `slyTurn` is small over his body, which is exactly
     what the gate is built to read as "not a silhouette".

     **MEASURED NULL — leave it at 0.** `mag1` ran it: the character's rim lift moves
     3.77 -> 3.75 (`temple`), 2.92 -> 3.44 (`sly-closeup`, against a base2 of 3.41), 4.40 ->
     4.39 (`hero`) — inside the base-vs-base2 noise in all three. Opening the *same* smoothstep
     globally (`rimCurve [0,0.0001,1]`) instead gives 16.4 / 8.8 / 7.0, so I concluded the
     magnitude half was starving the character and shipped this knob to fix it. The
     subject-restricted version reproducing none of that says the global lift on those pixels
     was never the subject's own surface — most likely bloom off the paving behind him, which
     the same leg raises by +13 to +20 L. See the long note at `rimSil` in `toon.glsl.js`.

     What IS established, three ways: `rimPlanar` is not the suppressor (turning the screen
     gate off entirely moves the character by ±0.4 L), so RESULT-rim3 §3's attribution is
     withdrawn. What starves it is still open.

     Kept at 0 rather than reverted because it is the only lever that isolates the skinned
     population — every other leg is global and carries the confound that produced the wrong
     answer twice. A/B is a uniform poke: `shading.uniforms.uRimMagExempt.value = 1`. */
  rimMagExempt: 0.0,

  /* Whether baked AO multiplies the DIRECT key term. It does not (0): `ao` currently reaches
     only the ambient fill, the shadow term and the wash, and on a sunlit surface the sun
     drowns all three. That much is a real shader fact and is why 1 is the A/B.

     The justification that used to sit here was arithmetic on a mislabelled column and is
     withdrawn (KNOWN_ISSUES §8's correction, §34). It read "a texture authoring a 0.412 median
     AO renders at 0.992" — but `texlab.mjs` emits p1/p5/p50, so 0.412 is the FIFTH PERCENTILE
     and the authored median is 0.992, the same number it was being compared against. There is
     also no instrument anywhere that reads AO back out of a frame, so the "renders at" half was
     never measured. Size this against percentiles that exist, and note that on `hero` only
     ~1.4% of the gilded population is key-lit, so this term cannot reach the other 98.6%.

     It is a global change to every sunlit crevice in the game, so the verification is the
     whole frame's midtones, not one material's mask. */
  aoKey: 0.0,

  /* How much of the three-band ramp the SHADE side carries. See slyShadeForm in toon.glsl.js
     for the derivation; the short version is that `key = ramp * sh`, so on a cast-shadowed
     surface the cel quantiser is multiplied by zero and every term left standing is constant in
     the normal's azimuth. Measured, offline, on the shipped captures:

       temple      1.57% of architecture px are key-lit (roofed hall)  -> no ramp anywhere
       courtyard  31.8% lit;  terminator step +21.8 / +24.8 luma, 12.3x / 25.1x its own control
       hero       18.4% lit;  terminator step +23.1 luma, 10.1x control

     i.e. the ramp was never soft — it was absent over the shots the critic scores worst. The
     nave column in `temple` sweeps N.L -0.367..0.865 through BOTH terminators and renders
     17.7 luma of purely continuous range (gapFrac 0.0795 against an ideal-Lambert control of
     0.0784 — progress/records/celcyl.mjs).

     0 = bit-identical legacy, exactly (the shader spells it `1 - uShadeBand*(1-ramp)`, never
     mix(), so the default multiplies out to a literal 1.0 on any driver). Nothing republishes
     the uniform per frame, so `shading.uniforms.uShadeBand.value` is a sticky one-boot A/B —
     unlike uRimGain, whose trap is documented at TUNE.rimGain.

     SHIPS AT 0 UNTIL THE SWEEP LANDS. The ship rule is registered in
     progress/records/PREREG-celband.md §9 and is not a number chosen here: it is the SMALLEST
     value on the pre-registered sweep {0.15, 0.30, 0.45, 0.60} that carries `temple`'s nave
     column across the criterion, with the verdict holding on all nine null rows and the
     `courtyard` guard not regressing beyond its own null. Landing it here before the capture
     would be authoring the answer, which is what §141.1 exists to stop. */
  shadeBand: 0.0,

  /* Shadow-side rim floor for NON-skinned geometry. The shader's `mix( 0.55, 1.0, sh )` keeps
     55% of the rim where the key is fully shadowed; that floor is what carries `night`'s
     silhouette rims, and it is also the one term behind the bright-cool band still standing on
     `hero`'s worn step lip at px (832-1056, 500-620).
     **0.55 = bit-identical no-op** — mix(0.55, 0.55, vSlySkin) is 0.55 everywhere — so this
     ships as scaffolding, exactly as `rimSkinExempt` and `aoKey` did.
     Scoped to architecture on purpose: §24.3's trap is that narrowing the band narrows the
     CHARACTER's rim in the same proportion, and scoping sidesteps that rather than trading
     against it. A/B is a uniform poke: `shading.uniforms.uRimShadowFloorArch.value = 0.20`.
     PREREG-kerb.md holds the bands and the ship rule; its acceptance requires `night` to be
     re-measured, because night is what the 0.55 buys. Do not change this default from a
     number in that prereg — change it from the run. */
  rimShadowFloorArch: 0.55,

  /* --- spec --- */
  spec: 0.25,
  /* PREREG-hilite2 §2 — how much of `keyRad` the specular lobe carries.
     0 = the legacy uncoupled term, bit-identically (the shader spells it
     `mix( vec3( 1.0 ), keyRad, uSpecKey )`, and mix at 0 is `x*(1-0) + y*0 = x`).
     1 = the physically-correct form: a highlight is a reflection of the light source, so it
     scales with the sun exactly the way `diff` and `sss` already do.

     Shared by identity like uShadeBand, and nothing republishes it per frame, so
     `shading.uniforms.uSpecKey.value` is a sticky one-boot A/B that reaches the whole scene.
     It is a SCENE-WIDE constant: it multiplies every material's specular by the same number,
     so it cannot re-order materials against each other — see the block at `vec3 spec` in
     toon.glsl.js for the per-material ceilings. */
  specKey: 0.0,
  /* Attribution lever, not art direction. 1 = shipped, and `x * 1.0 == x` exactly, so the
     shipped value is a no-op in IEEE. 0 removes the specular term outright; `base` minus
     `specGain 0` is how a capture measures what spec is worth in a frame, per pixel, without
     having to reach into every material's own uSpec. Leave it at 1. */
  specGain: 1.0,
  /* PREREG-specnorm §2 — exponent on the Blinn energy normalisation `(glossP + 8)/8`.

     `specStep` is a shape function capped at 1.35 whatever `uGloss` is, while the stepped
     lobe's support shrinks as `1/glossP`. So today a tighter highlight carries strictly LESS
     energy, which is backwards, and it is the arithmetic behind §256's "no highlight range".

     0 = shipped, and exact: the shader takes a literal-`1.0` branch and evaluates no arithmetic
     at all, so the no-op does not depend on how a driver spells `pow( x, 0 )`.
     1 = textbook energy conservation. Intermediate values are a partial normalisation with
     amplitude ∝ glossP^p.

     This is the one lever in the specular that is NOT scene-wide: it scales with each
     material's own gloss, so it re-orders the material set. In display space the movers are the
     dark-and-glossy classes (`ceiling_stars`, `bronze_dark`, `granite_pink`, and Sly's own mesh
     at the TUNE default `uSpec` 0.25) — NOT `gold_leaf`, which is already on the flat of the
     AgX curve and gains 13 L for a x12.94. Do not raise this from a number in a table; raise it
     from a capture that scores PREREG-specnorm's G4. */
  specNormPow: 0.0,
  gloss: 32,
  rough: 0.62,
  metalGain: 0.62,
  goldGlint: 0.0,          // PREREG-goldlobe §2 scaffold — INERT at 0; candidate pokes only
  glintPow: 20.0,
  glintSharp: 1.0,         // PREREG-goldlobe2 §2 — read only when uGoldGlint > 0

  /* --- sss --- */
  sss: 0.2,

  /* --- outline --- */
  inkPx: 2.5,            // AGENTS: lines stay ~2.5 px on screen
  inkFalloff: 150,       // metres over which lines thin out so distant clutter stays quiet
  inkSun: 0x1a1210,
  inkShade: 0x161022,
  /* `OUTLINE_FRAG` picks the line colour as `mix(uInkShade, uInkSun, lit)` where
     `lit = smoothstep(-0.20, 0.35, dot(N, uKeyDir))`. Both endpoints are CONSTANTS: nothing in
     the project ever tells the ink what time it is. So at `night` (tod 0.02) every surface
     facing the moon is outlined in `inkSun` — a colour named, and authored, for sunlight.
     `inkMoon` + `inkNightMix` are the lever for that. At `inkNightMix: 0` the lerp is the
     identity and this is BIT-IDENTICAL to the shipping build; `_setInkNight()` only ever
     writes a uniform, so the A/B is `shading.setInkNight(1)` with no rebuild.

     **Evidence, because this is a finding and not a hunch, and because my first two
     instruments both got it wrong.** A frame-wide "dark thin feature" hue census on
     `rim4/night-norim.png` reported 94.5% cool and appeared to REFUTE this — it was counting
     the whole frame's blue masonry joints, in which the character's few hundred ink pixels
     are noise. What settled it was the image: at 6x on `rim4/night-base.png` (px 640,370
     +180x125) Sly carries a plainly warm brown line round tail, ear and legs, and that line
     is STILL THERE in `night-norim.png` — an arm with `uRim = 0` and PostFX `rimStrength = 0`,
     so it cannot be either rim term. `norim` removes the rim and not the ink; that asymmetry
     is what makes the pair a clean attribution.

     NOT SHIPPED ON. What the night line should become is an art call (§2.2 gives no night ink
     pair, and §2.1 specifies the existing two by *lighting* — "warm brown in sunlight, violet
     in shadow" — which at midnight selects a leg that has no referent). Registered so the
     next capture can settle it in one poke rather than rediscovering it. */
  inkMoon: 0x101826,
  inkNightMix: 0.0,

  /* --- atmosphere (SKY overrides these) --- */
  hazeDensity: 0.020,
  hazeFalloff: 0.055,    // 1/metres — ~18 m scale height, so the courtyard floor silts up
  hazeBase: 0.0,
  hazeStart: 26,
  hazeGain: 1.30,

  /* Forward-scatter gain: how much brighter the haze is when you look *into* the key than
     when you look away from it. See _refreshHazeSun() — this exists because uHazeSun was a
     compile-time constant that no code path ever wrote, and 1.25 is not a new art decision
     but the relationship the palette pair already encoded (PAL.haze #e8b878 -> PAL.hazeSun
     #ffc98a is x1.231, x1.213, x1.359 per linear channel). */
  hazeSunBoost: 1.25,

  /* --- detail --- */
  detailFade: 95,        // metres at which the triplanar layer is fully faded out

  /* Ratio of the triplanar detail's SECOND octave to its first. The second octave is the only
     anti-tiling mechanism in the pipeline: a tile cannot avoid repeating its own content, so
     the macro layer has to vary *between* neighbouring repeats to break the lattice.
     Its world period is `P2 = 1 / (presetScale * detail2Scale)` metres.

     0.137 -> 0.030. At 0.137 the mechanism was tuned to a period where it cannot work, and
     the defect is universal rather than a sandstone special case — recomputed against every
     (recipe, detail-preset) pairing actually built in `src/world/**`, ALL EIGHT tiled
     consumers sat at rho = P2/repeat between 0.97 and 1.84:

       ceiling_stars    plaster   P2  5.84 m vs repeat  6.00 m   rho 0.97
       plaster_painted  plaster   P2  5.84 m vs repeat  5.60 m   rho 1.04
       hieroglyph_wall  sandstone P2 11.77 m vs repeat 10.40 m   rho 1.13   (the reported case)
       column_papyrus   sandstone P2 11.77 m vs repeat 10.00 m   rho 1.18
       mudbrick         generic   P2  7.30 m vs repeat  5.20 m   rho 1.40
       sandstone_worn   sandstone P2 11.77 m vs repeat  7.20 m   rho 1.64
       sandstone_block  sandstone P2 11.77 m vs repeat  6.80 m   rho 1.73
       hieroglyph_gilded sandstone P2 11.77 m vs repeat 6.40 m   rho 1.84

     At rho ~ 1 every repeat receives the same macro phase, so the layer adds detail but
     decorrelates nothing — `hieroglyph_wall` beat at 89 m instead of breaking the lattice.

     Three constraints bound the replacement, and 0.030 clears all three on all eight:
       (a) rho >= 3, so the macro actually differs between adjacent tiles  -> min rho 4.44;
       (b) the super-lattice round(rho)*repeat must exceed the longest framed run of one
           surface, or the macro becomes the countable landmark itself. Worst case is
           `temple`'s far hall wall, 36 m at 3.46 repeats (Materials.js:1334);
       (c) P2 must stay under ~3x that run, or the macro is DC across the frame and again
           decorrelates nothing -> sandstone lands at 53.8 m, 0.67 of a cycle across 36 m.
     The band clearing all eight is 0.015..0.0425; 0.030 sits inside it and is the more
     robust half, since (c) is the constraint that tightens on shots framing less wall.

     Hoisted to a shared uniform rather than left as a shader literal for the same reason
     `splitRange` was: it decides whether the mechanism works at all and was unreachable for
     an A/B. Verified by arithmetic (tools cannot reject a period from a frame), confirmed in
     frame — a bad number here is rejectable offline, a good one is not. */
  detail2Scale: 0.030,
};

/* The Egypt palette, AGENTS.md §2.2. THREE.Color decodes sRGB hex to linear working space. */
const PAL = {
  sun: 0xffd9a0,
  sunHigh: 0xfff2d8,
  sunLow: 0xff9a5c,
  moon: 0x9fc4ff,
  fillSky: 0x6fa8d8,
  fillSkyNight: 0x2f4a7a,
  bounce: 0xe8a852,
  bounceNight: 0x243350,
  rim: 0x7fd4ff,
  rimNight: 0xa8e0ff,
  shadowHue: 0x2a3f66,
  turquoise: 0x2fa8a0,   // §2.2 TURQUOISE — the G-source for TUNE.shadowTeal's tint blend
  /* `shadowTintPeak` moved to TUNE — it is the daylight shadow's magnitude control and had to
     become reachable from `shading.tune` to be A/B-able at all. */
  /* `shadowBounceMix` moved to TUNE for exactly the reason `shadowTintPeak` did: it is
     described everywhere as "the live hue lever" and it was not live at all — a PAL constant
     with no setter, reachable only by editing this file and rebuilding, so every A/B on the
     shadow hue cost a full boot. It is `TUNE.shadowBounceMix` now; poke it and call
     `_refreshShadowColor()`. */
  haze: 0xe8b878,
  hazeNight: 0x2a3f66,
  hazeSun: 0xffc98a,
  goldSpec: 0xfffbe8,
  sandstoneMid: 0xc9915a,
  wrapWarm: 0xffb07a,
};

const DAY_START = 0.23, DAY_END = 0.85;

/* Scratch — hoisted so update() allocates nothing. */
const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _col = new THREE.Color();
const _tintBlend = new THREE.Color();
const _turq = new THREE.Color(PAL.turquoise);
/* Scratch for _setRimColor's value comparison. Module scope because that path runs from the
   per-frame setKeyLight and §5 forbids allocating in it. */
const _rimIn = new THREE.Color();

export class Shading {
  constructor(engine) {
    this.engine = engine;
    this.tune = TUNE;

    /** @type {Map<string, THREE.Material>} */
    this._cache = new Map();
    /** @type {Map<string, THREE.ShaderMaterial>} */
    this._inkCache = new Map();
    /** @type {Map<string, THREE.DataTexture>} */
    this._detail = new Map();
    /** @type {THREE.Mesh[]} */
    this._shells = [];

    this._patchWarned = false;
    /* Exposed the way LIGHTING exposes its own, so a capture harness can bracket a value that is
       READ PER FRAME rather than latched into a uniform at construction. `shadowHold` became one
       of those the moment `setKeyLight` started scoping it (PREREG-holdscope), so poking the
       uniform is no longer equivalent to poking the knob and the harness needs the knob. */
    this.TUNE = TUNE;
    /* Per-channel calibration state: null = never proven, true/false = the last result a
       probe reported through confirmDebugCalibration(). Selecting a READING mode on a channel
       that is not `true` warns at the call site — see _debugGuard. */
    this._debugProven = { debugTerm: null, debugShadow: null };
    this._autoKey = true;          // until LIGHTING calls setKeyLight()
    this._autoLight = null;
    this._autoScan = 0;
    this._wireframe = false;
    this._outlinesVisible = true;
    this.shadowMatrix = null;

    /* The rim colour actually applied to the cache, held by value. See _setRimColor: the
       previous guard compared the *caller's object identity*, which LIGHTING mutates in
       place, so it could never miss. `_rimHas` distinguishes "never set" from "set to
       something that happens to equal black". */
    this._rimLive = new THREE.Color();
    this._rimHas = false;
    this._inkNight = 0;            // see setInkNight(); 0 = ink is bit-identical to shipping

    this._shadowTint = new THREE.Color(PAL.shadowHue);
    /* No cached tint luminance here any more: _refreshShadowColor derives everything from the
       teal-blended tint each call, so a cached unblended lum would be a field with setters and
       no reader — the exact "looks live, is dead" shape KNOWN_ISSUES §3/§8 bills by the cycle. */
    this._shadowFloor = TUNE.shadowFloor;
    /* Set only by an explicit setAtmosphere({ hazeSun }) — see _refreshHazeSun(). While false,
       the forward-scatter colour tracks the live haze instead of holding a constant.

       A harness that wants the shipped-before behaviour for an A/B sets this true and writes
       uHazeSun itself; that is the supported way to pin it, rather than editing this line. */
    this._hazeSunExplicit = false;

    /**
     * Shared uniform objects. Every material created by toon() references these *by identity*,
     * so writing a value once in update() reaches the whole scene — and costs no allocation.
     * three re-uploads a material's uniforms on its first draw of each frame, so this is safe.
     */
    this.uniforms = {
      uKeyDir:       { value: new THREE.Vector3(-0.62, 0.34, 0.71).normalize() },
      uKeyColor:     { value: new THREE.Color(PAL.sun) },
      uKeyIntensity: { value: TUNE.keyIntensity },
      uSkyColor:     { value: new THREE.Color(PAL.fillSky) },
      uBounceColor:  { value: new THREE.Color(PAL.bounce) },
      uBounceGain:   { value: TUNE.bounceGain },
      uFillSkyMix:   { value: TUNE.fillSkyMix },
      /* Local torch term gain (PREREG-torchlight). 0 = branch untaken, the pre-seal build.
         LIGHTING owns the shipped value (its TUNE.localToon) and publishes it per frame
         through setKeyLight's `local` key; written only when the payload carries a number,
         so a harness poke sticks whenever the publisher omits it — the uShadowHold contract. */
      uLocalToon:    { value: 0.0 },
      /* Grade-lever scaffolding — shared by identity like uDetail2Scale, so a one-boot A/B
         pokes `shading.uniforms.uX.value` and the whole scene follows. Defaults 0 = legacy. */
      uNeutralShadow: { value: TUNE.neutralShadow },
      uNeutralFill:  { value: TUNE.neutralFill },
      uSubjWarmShade: { value: TUNE.subjWarmShade },
      uSubjShadowHold: { value: TUNE.subjShadowHold },
      uAmbIntensity: { value: TUNE.ambIntensity },
      uShadowColor:  { value: new THREE.Color(0x000000) },
      uShadowColorLit: { value: new THREE.Color(0x000000) },
      uShadowDepth:  { value: new THREE.Vector2(TUNE.shadowDepth[0], TUNE.shadowDepth[1]) },
      uShadowWash:   { value: TUNE.shadowWash },
      /* §269. Shared by identity like the grade levers above, so a one-boot A/B is
         `shading.uniforms.uShadowHold.value = 1` and the whole scene follows. Nothing
         republishes either per frame, so the poke sticks across `__GAME.step()`. */
      uShadowHold:     { value: TUNE.shadowHold },
      uShadowHoldKnee: { value: TUNE.shadowHoldKnee },
      uShadowSharp:  { value: new THREE.Vector2(TUNE.shadowSharp[0], TUNE.shadowSharp[1]) },
      uShadowBands:  { value: new THREE.Vector3(...TUNE.shadowBands) },
      uHaze:         { value: new THREE.Color(PAL.haze) },
      uHazeSun:      { value: new THREE.Color(PAL.hazeSun) },
      uHazeGain:     { value: TUNE.hazeGain },
      uHazeDensity:  { value: TUNE.hazeDensity },
      uHazeFalloff:  { value: TUNE.hazeFalloff },
      uHazeBase:     { value: TUNE.hazeBase },
      uHazeStart:    { value: TUNE.hazeStart },
      /* atmowire seam (PREREG-atmowire.md C1): OFF by default — uAtmoWire 0.0 keeps every
         program on the shipped side-door bit-identically; setAtmosphere() fills these. */
      uAtmoWire:     { value: 0.0 },
      uHazeHeightFalloff: { value: 58 },
      uHazeInscatter: { value: 0.62 },
      uHazeTint:     { value: new THREE.Color(0xffc98a) },
      uTime:         { value: 0 },
      uRes:          { value: new THREE.Vector2(1600, 900) },
      uTermLo:       { value: TUNE.termLo },
      uTermHi:       { value: TUNE.termHi },
      uRimGain:      { value: TUNE.rimGain },
      uRimCurve:     { value: new THREE.Vector3(...TUNE.rimCurve) },
      uRimSkinExempt: { value: TUNE.rimSkinExempt },
      uRimMagExempt: { value: TUNE.rimMagExempt },
      uRimShadowFloorArch: { value: TUNE.rimShadowFloorArch },
      uAoKey:        { value: TUNE.aoKey },
      /* Shared by identity, and never republished per frame — so a poke of
         `shading.uniforms.uShadeBand.value` reaches the whole scene and STICKS across
         `__GAME.step()`. See TUNE.shadeBand and slyShadeForm in toon.glsl.js. */
      uShadeBand:    { value: TUNE.shadeBand },
      /* Shared, not per-material: it is one global ratio and it has to be pokeable from
         `shading.uniforms` for the A/B. Merged into every material by identity in
         onBeforeCompile, alongside the per-material uDetailScale it multiplies. */
      uDetail2Scale: { value: TUNE.detail2Scale },
      uShadowSat:    { value: TUNE.shadowSat },
      /* Shared, not per-material: the key radiance is one scene-wide quantity and the coupling
         has to be pokeable from `shading.uniforms` for the A/B. Merged into every material by
         identity in onBeforeCompile, alongside the per-material uSpec it multiplies. Neither is
         republished per frame, so a poke sticks across `__GAME.step()`. See TUNE.specKey. */
      uSpecKey:      { value: TUNE.specKey },
      uSpecGain:     { value: TUNE.specGain },
      uSpecNormPow:  { value: TUNE.specNormPow },
      uMetalGain:    { value: TUNE.metalGain },
      uGoldGlint:    { value: TUNE.goldGlint },
      uGlintPow:     { value: TUNE.glintPow },
      uGlintSharp:   { value: TUNE.glintSharp },
      /* Diagnostic channel. window.__ENGINE.get('shading').debugShadow(true) paints
         red=getShadowMask, green=receiveShadow, blue=N.L across the scene. Mode 9 is its
         self-calibration; it writes DEBUG_CALIB.shadow and nothing else. */
      uDebugShadow:  { value: 0 },
      /* Rim/ramp term visualiser — see the block at the end of TOON_SHADE. Only meaningful
         with PostFX.debugRaw('scene'); on its own it is a value reported through the chain
         that is supposed to be bypassed. Mode 4 is its self-calibration. */
      uDebugTerm:    { value: 0 },
    };

    this._refreshShadowColor();

    /**
     * POSTFX's interior-crease pass needs view-space normals. three's default depth texture
     * covers the depth term, so all that is missing is this: a plain MeshNormalMaterial used
     * as scene.overrideMaterial. It picks up skinning/instancing/morphing automatically.
     *
     * Ledger #31 — the ALPHA channel additionally carries "is this pixel the subject".
     *
     * Why here and not in PostFX: PostFX has depth and normals and no idea which pixels are a
     * character. The surface rim solved the identical problem with `vSlySkin` (`_patchVert`),
     * because `USE_SKINNING` is a vertex-stage define and a fragment `#ifdef` on it is always
     * false. The screen-space rim needs the same answer one stage further downstream, and the
     * normal prepass is the only pass that already visits every mesh with per-object identity
     * intact. So the same varying is written out as alpha and PostFX reads it as a mask.
     *
     * This channel was previously a constant: three's meshnormal_frag ends
     * `gl_FragColor = vec4( ..., diffuseColor.a ); #ifdef OPAQUE gl_FragColor.a = 1.0; #endif`
     * and every consumer of `uNormal` samples `.xyz` only (AO.js:63, PostFX.js:476-480, :549).
     * So this is strictly additive: no existing reader can see it, and the RGB is untouched.
     * The OPAQUE block is *replaced* rather than appended to, because it runs last and would
     * otherwise stamp 1.0 over the mask.
     *
     * Population is identical to the surface gate's exemption by construction — both are
     * `USE_SKINNING` — so the cane, which is not skinned, is not a subject in either. That is
     * deliberate: one concept, applied at two stages, not two definitions that can drift.
     *
     * THE SENSE IS INVERTED ON PURPOSE: alpha is 1 for "not subject", 0 for "subject".
     * `replaceOnce` degrades to a warning on a miss (l.1440) rather than throwing, and three's
     * own tail already writes `a = 1.0`. Under the obvious encoding a missed splice would
     * therefore hand PostFX a subject mask of 1 EVERYWHERE, silently exempting the whole frame
     * from the planar gate and re-admitting the paving artefact the gate exists to remove —
     * a shader-splice failure presenting as a lighting regression three files away. Inverted,
     * a miss leaves alpha at three's constant 1.0, which decodes to subject = 0, which makes
     * the exemption inert and the shipped behaviour exact. The prepass clear alpha is set to 1
     * for the same reason (PostFX), so untouched background also decodes to "not subject".
     */
    this.normalMaterial = new THREE.MeshNormalMaterial({ name: 'slyNormalPass' });
    this.normalMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = this._patchVert(shader.vertexShader);
      shader.fragmentShader = replaceOnce(shader.fragmentShader,
        'void main() {', 'varying float vSlySkin;\nvoid main() {',
        this, 'normalpass-subject-varying');
      shader.fragmentShader = replaceOnce(shader.fragmentShader,
        '\t#ifdef OPAQUE\n\t\tgl_FragColor.a = 1.0;\n\t#endif',
        '\tgl_FragColor.a = 1.0 - vSlySkin;',
        this, 'normalpass-subject-alpha');
    };

    this._onTimeOfDay = () => { if (this._autoKey) this._applyAutoLight(); };
    engine.on?.('timeOfDay', this._onTimeOfDay);
  }

  async init() {
    const s = this.engine.settings || {};
    this._detailSize = s.texSize >= 1024 ? 256 : 128;
    this._detail2 = this.engine.quality !== 'low';
    this._syncResolution();
    this._applyAutoLight();
  }

  /* ======================================================================
     Material factory
  ====================================================================== */

  /**
   * The one material factory. Cached by an option hash: identical options always return the
   * identical instance, so a thousand calls from ARCHITECTURE cost one program and one upload.
   *
   * All options optional. Unknown keys are ignored.
   *
   *   color            base albedo. Defaults to sandstone mid, or white when a `map` is given
   *   map normalMap roughnessMap aoMap emissiveMap alphaMap
   *   bands   3       diffuse quantisation steps (2..6)
   *   rim     0.55    fresnel rim strength      rimColor  0x7fd4ff
   *   spec    0.25    hard-stepped specular     gloss     32
   *   rough   0.62    dielectric roughness (ignored when roughnessMap is set)
   *   metal   0       1 = read as metal: killed diffuse, hot lobe, stylised reflection
   *   sss     0.2     warm wrap-around for fur/skin/cloth   wrapColor 0xffb07a
   *   detail  null    triplanar detail key: sandstone limestone gold plaster sand cloth fur metal
   *   detailScale/detailStrength/detailGrain   override the preset
   *   outline 1.0     inverted-hull thickness multiplier recorded for outline(); 0 = never
   *   haze    1.0     aerial-perspective multiplier; 0 for sky domes and UI
   *   emissive 0x000000  emissiveIntensity 0
   *   ao      1.0     aoMap strength
   *   transparent opacity side vertexColors depthWrite depthTest alphaTest flatShading
   *   skinning        accepted and ignored — three handles it from the mesh type
   */
  toon(opts = {}) {
    let key;
    try {
      const o = this._resolve(opts);
      key = o.key;
      const hit = this._cache.get(key);
      if (hit) return hit;
      const mat = this._build(o);
      this._cache.set(key, mat);
      return mat;
    } catch (err) {
      // A material factory must never take the frame down.
      this._warn(`toon() failed (${err?.message || err}); falling back to standard material`);
      const fallback = new THREE.MeshStandardMaterial({
        color: opts.color ?? PAL.sandstoneMid,
        map: opts.map || null,
        roughness: 0.7,
      });
      if (key) this._cache.set(key, fallback);
      return fallback;
    }
  }

  /** Normalise + hash the option bag. */
  _resolve(opts) {
    // Every texture slot is validated before it reaches a material. A caller that passes a
    // TEXTURES *bundle* (§4.4 returns {map, normalMap, ...}) instead of a THREE.Texture makes
    // three.js read `.matrix` off a plain object deep inside refreshMaterialUniforms, which
    // throws mid-render and takes the whole frame down. Unwrap what we can, drop the rest,
    // and name the slot so the caller can be found.
    for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'metalnessMap']) {
      const v = opts[slot];
      if (!v || v.isTexture) continue;
      const unwrapped = v[slot]?.isTexture ? v[slot] : (v.map?.isTexture ? v.map : null);
      opts[slot] = unwrapped;
      this.engine?.warn(
        `shading.toon: "${slot}" was not a THREE.Texture` +
        (unwrapped ? ' — unwrapped it from the texture bundle.' : ' — dropped it.')
      );
    }

    const hasMap = !!opts.map;
    const detailKey = typeof opts.detail === 'string' && opts.detail ? opts.detail : null;
    const preset = detailKey ? DETAIL_PRESETS[detailKey] || DETAIL_PRESETS.generic : null;

    const o = {
      color: hex(opts.color, hasMap ? 0xffffff : PAL.sandstoneMid),
      map: opts.map || null,
      normalMap: opts.normalMap || null,
      roughnessMap: opts.roughnessMap || null,
      aoMap: opts.aoMap || null,
      emissiveMap: opts.emissiveMap || null,
      alphaMap: opts.alphaMap || null,
      // The ORM blue channel. Accepted by the unwrap loop above since this factory was
      // written, but never put on the material — so the per-texel gilding masks TEXTURES
      // authors had no consumer at all. The shader samples it directly (see toon.glsl.js).
      metalnessMap: opts.metalnessMap || null,

      bands: clamp(num(opts.bands, TUNE.bands), 2, 6),
      termSoft: num(opts.bandSoftness, TUNE.termSoft),
      rim: num(opts.rim, TUNE.rim),
      rimColor: hex(opts.rimColor, PAL.rim),
      /* Whether the CALLER named a rim colour, as opposed to falling through to PAL.rim.
         `_build` needs the distinction to know if the live global may overwrite the uniform,
         and by then `opts` is out of scope. Not part of the option hash — `rimColor` above
         already keys it, and this is derived from the same field. */
      rimColorSet: opts.rimColor !== undefined,
      rimPower: num(opts.rimPower, TUNE.rimPower),
      spec: num(opts.spec, TUNE.spec),
      specColor: hex(opts.specColor, PAL.goldSpec),
      gloss: Math.max(num(opts.gloss, TUNE.gloss), 2),
      rough: clamp(num(opts.rough ?? opts.roughness, TUNE.rough), 0.02, 1),
      metal: clamp(num(opts.metal ?? opts.metalness, 0), 0, 1),
      sss: clamp(num(opts.sss, TUNE.sss), 0, 1),
      wrapColor: hex(opts.wrapColor ?? opts.sssColor, PAL.wrapWarm),
      /* Baked AO is scaled down globally — see TUNE.bakedAO. A caller asking for 1.0 is
         asking for "the normal amount of my aoMap", not for a promise that the whole term
         stays where it was authored when the shadow pipeline was broken. */
      ao: num(opts.ao ?? opts.aoIntensity, 1) * TUNE.bakedAO,
      haze: num(opts.haze, 1),

      detail: detailKey,
      detailScale: num(opts.detailScale, preset ? preset.scale : 1),
      detailStrength: num(opts.detailStrength, preset ? preset.strength : 0.7),
      detailGrain: num(opts.detailGrain, preset ? preset.grain : 0.35),
      detailFade: num(opts.detailFade, TUNE.detailFade),

      outline: num(opts.outline, 1),
      emissive: hex(opts.emissive, 0x000000),
      emissiveIntensity: num(opts.emissiveIntensity, 0),

      transparent: !!opts.transparent,
      opacity: num(opts.opacity, 1),
      side: opts.side ?? THREE.FrontSide,
      vertexColors: !!opts.vertexColors,
      depthWrite: opts.depthWrite ?? !opts.transparent,
      depthTest: opts.depthTest ?? true,
      alphaTest: num(opts.alphaTest, 0),
      flatShading: !!opts.flatShading,
      normalScale: num(opts.normalScale, 1),
      name: typeof opts.name === 'string' ? opts.name : '',
    };

    if (this.engine.quality === 'low') o.detail = null;   // triplanar is 6 taps; not worth it

    o.key = [
      o.color, tid(o.map), tid(o.normalMap), tid(o.roughnessMap), tid(o.aoMap),
      tid(o.emissiveMap), tid(o.alphaMap), tid(o.metalnessMap),
      o.bands, r3(o.termSoft), r3(o.rim), o.rimColor, r3(o.rimPower),
      r3(o.spec), o.specColor, r3(o.gloss), r3(o.rough), r3(o.metal),
      r3(o.sss), o.wrapColor, r3(o.ao), r3(o.haze),
      o.detail, r3(o.detailScale), r3(o.detailStrength), r3(o.detailGrain), r3(o.detailFade),
      r3(o.outline), o.emissive, r3(o.emissiveIntensity),
      +o.transparent, r3(o.opacity), o.side, +o.vertexColors, +o.depthWrite, +o.depthTest,
      r3(o.alphaTest), +o.flatShading, r3(o.normalScale),
    ].join('|');

    return o;
  }

  _build(o) {
    const mat = new THREE.MeshStandardMaterial({
      name: o.name || `toon${o.detail ? '_' + o.detail : ''}`,
      color: new THREE.Color(o.color),
      map: o.map,
      normalMap: o.normalMap,
      roughnessMap: o.roughnessMap,
      // Defines USE_METALNESSMAP + vMetalnessMapUv for the sample in TOON_SHADE. `metalness`
      // stays 0 below, so three's own term is still gone; only our uMetal is masked.
      metalnessMap: o.metalnessMap,
      aoMap: o.aoMap,
      emissiveMap: o.emissiveMap,
      alphaMap: o.alphaMap,
      emissive: new THREE.Color(o.emissive),
      emissiveIntensity: o.emissiveIntensity,
      // roughnessMap fully drives roughness when present, otherwise the art value does.
      roughness: o.roughnessMap ? 1.0 : o.rough,
      metalness: 0,                 // our metal read is stylised; three's PBR term is gone
      transparent: o.transparent,
      opacity: o.opacity,
      side: o.side,
      vertexColors: o.vertexColors,
      depthWrite: o.depthWrite,
      depthTest: o.depthTest,
      alphaTest: o.alphaTest,
      flatShading: o.flatShading,
      dithering: true,              // the haze gradient banded visibly without this
      fog: false,                   // aerial perspective is done in-shader, in linear space
    });
    if (o.normalMap) mat.normalScale.set(o.normalScale, o.normalScale);
    if (o.aoMap) mat.aoMapIntensity = 1;

    const detailTex = o.detail ? this._detailTexture(o.detail) : null;
    const useDetail = !!detailTex;
    const useDetail2 = useDetail && this._detail2;

    /* Per-material uniforms. Shared ones are merged in at compile time by identity. */
    const own = {
      uBands:          { value: o.bands },
      uTermSoft:       { value: o.termSoft },
      uRim:            { value: o.rim },
      uRimColor:       { value: new THREE.Color(o.rimColor) },
      uRimPower:       { value: o.rimPower },
      uSpec:           { value: o.spec },
      uSpecColor:      { value: new THREE.Color(o.specColor) },
      uGloss:          { value: o.gloss },
      uMetal:          { value: o.metal },
      uSss:            { value: o.sss },
      uSssColor:       { value: new THREE.Color(o.wrapColor) },
      uAoStrength:     { value: o.ao },
      uHazeAmount:     { value: o.haze },
      uDetailMap:      { value: detailTex },
      uDetailScale:    { value: o.detailScale },
      uDetailStrength: { value: o.detailStrength },
      uDetailGrain:    { value: o.detailGrain },
      uDetailFade:     { value: o.detailFade },
    };

    mat.defines = {};
    if (useDetail) mat.defines.SLY_DETAIL = '';
    if (useDetail2) mat.defines.SLY_DETAIL2 = '';
    /* Metal tag for PostFX's metal-aware bloom feed (TUNE.bloomMetalGain there; KNOWN_ISSUES
       §25). Opaque draws only: on transparent materials alpha is real coverage and must stay
       so. The encode is 1 - slyMetal so that every surface that never writes it — and every
       blend toward an unwritten background — decodes as metal 0 (see the PostFX comment for
       the full fail-closed argument). The option hash above already keys on `transparent`,
       so the define cannot alias across the material cache. */
    if (!o.transparent) mat.defines.SLY_METAL_TAG = '';

    /* Adopt the live global rim colour. `_setRimColor` walks `_cache`, so it can only reach
       materials that already exist — a material built after a time-of-day flip would
       otherwise keep `PAL.rim` (the daylight cool) forever, because `o.rimColor` defaults to
       that constant. Only for callers that did not name a rim colour themselves: an explicit
       `rimColor` is art direction for that one surface (a gold trinket's complement) and the
       global must not overwrite it. The option hash is unaffected — every defaulting caller
       still keys on `PAL.rim`, so this changes the value in the uniform, not the cache
       identity. */
    if (!o.rimColorSet && this._rimHas) own.uRimColor.value.copy(this._rimLive);
    mat.userData.slyRimPinned = o.rimColorSet;

    mat.userData.sly = true;
    mat.userData.slyUniforms = own;
    mat.userData.outline = o.outline;
    mat.userData.detail = o.detail;

    const cacheKey = `sly:${useDetail ? 1 : 0}${useDetail2 ? 1 : 0}`;
    mat.customProgramCacheKey = () => cacheKey;

    const self = this;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, self.uniforms, own);
      shader.fragmentShader = self._patch(shader.fragmentShader);
      shader.vertexShader = self._patchVert(shader.vertexShader);
    };

    return mat;
  }

  /**
   * Splice the cel model into meshphysical's fragment shader.
   *
   * The PBR accumulation block is removed outright rather than left running and discarded —
   * it is the single most expensive thing in that shader and we use none of its output.
   * Everything before it (albedo, alpha, normal maps, roughness, emissive) is kept.
   */
  _patch(src) {
    let s = src;
    const cuts = [
      '#include <lights_physical_fragment>',
      '#include <lights_fragment_begin>',
      '#include <lights_fragment_maps>',
      '#include <lights_fragment_end>',
      '#include <aomap_fragment>',       // AO is re-applied to ambient only, inside TOON_SHADE
    ];
    for (const c of cuts) s = s.split(c).join('');

    s = replaceOnce(s, 'void main() {', `${TOON_PARS}\nvoid main() {`, this, 'pars');
    /* NOTE: `void main() {` appears once in meshphysical's fragment shader, and TOON_PARS is
       spliced in front of it, so this must run before any other splice that could introduce a
       second one. It does. */
    s = replaceOnce(s, '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n${TOON_DETAIL}`, this, 'detail');
    s = replaceOnce(s, 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      TOON_SHADE, this, 'shade');
    /* After <opaque_fragment> has written gl_FragColor = vec4(outgoingLight, diffuseColor.a),
       overwrite alpha with the metal tag on opaque draws. TOON_SHADE scopes its body in a
       bare block, so `slyMetal` itself is NOT visible here — it exports `slyMetalOut` at
       main depth exactly the way it exports `outgoingLight` (scratchpad/goldproof.mjs
       failed the naive `slyMetal` version on the resolved source; the out-variable is the
       fix, proven by the same tool). Scene alpha has no other consumer — bright/down/up/
       composite/raw in PostFX all sample .rgb — so on the HalfFloat scene target this is
       invisible until PostFX's uMetalBloom leaves 0. No backticks in this string (§24.6's
       Common.js trap). */
    s = replaceOnce(s, '#include <opaque_fragment>',
      '#include <opaque_fragment>\n\t#ifdef SLY_METAL_TAG\n\t\tgl_FragColor.a = 1.0 - slyMetalOut;\n\t#endif',
      this, 'metal-tag');
    /* The dither runs AFTER everything in toon.glsl.js and adds up to half an LSB of hash
       noise, which is exactly enough to move a debug channel's calibration constant by one —
       measured: mode 4 came back as three modal triples instead of one. TOON_DITHER is three's
       own chunk behind a branch on the two debug uniforms, so a shipped draw (both 0) does the
       identical arithmetic and every diagnostic draw is exact. */
    s = replaceOnce(s, '#include <dithering_fragment>', TOON_DITHER, this, 'dither-guard');
    return s;
  }

  /**
   * The only thing the vertex stage has to tell the fragment stage: whether this draw is
   * skinned.
   *
   * `USE_SKINNING` is defined by three in `prefixVertex` and nowhere else, so a `#ifdef` on it
   * in a fragment shader is always false — which is why the convexity gate in toon.glsl.js
   * could not exempt characters from inside its own file. One varying carries the answer
   * across, and it costs nothing: no attribute, no uniform, no branch in the vertex body.
   *
   * Patched here rather than in the material because the same material may be drawn on both a
   * SkinnedMesh and a static Mesh; three compiles a separate program for each, so each gets the
   * right constant automatically.
   */
  _patchVert(src) {
    return replaceOnce(src, 'void main() {',
      'varying float vSlySkin;\nvoid main() {\n\t#ifdef USE_SKINNING\n\t\tvSlySkin = 1.0;\n\t#else\n\t\tvSlySkin = 0.0;\n\t#endif\n',
      this, 'vert-skin');
  }

  /* ======================================================================
     Outlines
  ====================================================================== */

  /**
   * Attach an inverted-hull ink shell to `mesh`.
   *
   * @param {THREE.Mesh} mesh
   * @param {{thickness?:number, color?:number, shadeColor?:number, opacity?:number}} opts
   *        thickness is a multiplier on TUNE.inkPx (device pixels), not metres.
   * @returns {THREE.Mesh|null} the shell
   */
  outline(mesh, { thickness = 1.0, color = null, shadeColor = null, opacity = 1.0 } = {}) {
    try {
      if (!mesh || !mesh.isMesh || thickness <= 0) return null;
      if (mesh.userData.slyOutline) return null;            // never shell a shell
      const existing = mesh.userData.slyShell;
      if (existing) return existing;

      const px = Math.max(TUNE.inkPx * thickness, 0.35);
      const sun = color === null ? TUNE.inkSun : hex(color, TUNE.inkSun);
      const shade = shadeColor === null
        ? (color === null ? TUNE.inkShade : hex(color, TUNE.inkShade))
        : hex(shadeColor, TUNE.inkShade);

      const ck = `${px.toFixed(3)}|${sun}|${shade}|${opacity.toFixed(2)}`;
      let inkMat = this._inkCache.get(ck);
      if (!inkMat) {
        inkMat = createOutlineMaterial(this.uniforms, {
          thickness: px, inkSun: sun, inkShade: shade, opacity,
          falloff: TUNE.inkFalloff,
        });
        /* The authored endpoints, kept so `_setInkNight` can lerp FROM them every time
           instead of from wherever it left the uniform last — a relative nudge applied per
           call would drift with the clock. */
        inkMat.userData.slyInkBase = { sun, shade };
        this._inkCache.set(ck, inkMat);
      }
      if (this._inkNight > 0) this._applyInkNight(inkMat);

      const shell = buildOutlineShell(mesh, inkMat);
      if (shell) {
        shell.visible = this._outlinesVisible;
        /* A shell shares its host's geometry and sits at identity, so it is the same surface
           twice. It must never reach the shadow map: the ink material is BackSide, three
           flips that to FrontSide for depth rendering, and the map would then hold every lit
           surface's own depth — every fragment would test against itself and self-shadow.
           `noShadow` is main.js's documented opt-out and `isOutlineShell` is the key its
           sweep actually reads; set both so neither the sweep nor a future one re-enables it. */
        shell.userData.noShadow = true;
        shell.userData.isOutlineShell = true;
        shell.castShadow = false;
        shell.receiveShadow = false;
        this._shells.push(shell);
      }
      return shell;
    } catch (err) {
      this._warn(`outline() failed on "${mesh?.name || '?'}": ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Walk a subtree and shell every mesh whose material asks for it (`userData.outline > 0`).
   * Convenience for CHARACTER / PROPS / ARCHITECTURE — they set `outline` once in toon() and
   * call this on the finished object.
   */
  applyOutlines(root, { thickness = 1.0, max = 4000 } = {}) {
    let n = 0;
    root?.traverse?.((obj) => {
      if (n >= max) return;
      if (!obj.isMesh || obj.userData.slyOutline || obj.userData.slyShell) return;
      const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const want = m?.userData?.outline;
      if (!(want > 0)) return;
      if (this.outline(obj, { thickness: thickness * want })) n++;
    });
    return n;
  }

  /** Hide/show every shell — POSTFX needs them gone during its normal pass. */
  setOutlinesVisible(v) {
    this._outlinesVisible = !!v;
    for (const s of this._shells) s.visible = this._outlinesVisible;
  }

  /**
   * For POSTFX. Returns the override material to install on the scene; shells are hidden for
   * the duration so they cannot contaminate the normal buffer with a silhouette fringe.
   * Always pair with endNormalPass().
   */
  beginNormalPass() {
    this.setOutlinesVisible(false);
    return this.normalMaterial;
  }

  endNormalPass() {
    this.setOutlinesVisible(true);
  }

  /** Rebuild welded normals for a geometry whose positions changed after the shell was built. */
  reweld(geometry) { return weldNormals(geometry, true); }

  /**
   * Re-derive a shelled mesh's per-vertex ink weights after its materials' `outline` values
   * changed. This is the live A/B path — set `mesh.material[i].userData.outline` and call
   * this — and it is the reason the weight lives on the material rather than in a uniform:
   * one boot can sweep it, which is the difference between one lock hold and five.
   */
  reink(mesh) { return applyInkWeights(mesh, true); }

  removeOutline(mesh) {
    const shell = mesh?.userData?.slyShell;
    if (!shell) return;
    const i = this._shells.indexOf(shell);
    if (i >= 0) this._shells.splice(i, 1);
    removeOutlineShell(mesh);
  }

  /* ======================================================================
     Light + atmosphere input
  ====================================================================== */

  /**
   * LIGHTING hands us the key light. Called every frame; must stay allocation-free.
   *
   * @param {object} p
   * @param {THREE.Vector3} p.direction  unit vector pointing TOWARD the light. If you pass the
   *        light's *travel* direction (y < 0) it is negated for you, so either convention works.
   * @param {THREE.Color|number} p.color
   * @param {number} p.intensity
   * @param {number|THREE.Color|{sky?,ground?,intensity?}} p.ambient
   * @param {number|THREE.Color|{color?,gain?}} p.rim
   * @param {THREE.Matrix4} [p.shadowMatrix] accepted and stored; unused, because the shell of
   *        three's own shadow varyings is what getShadowMask() reads.
   */
  setKeyLight({ direction, color, intensity, ambient, rim, shadowMatrix, nightAmount, local } = {}) {
    this._autoKey = false;
    const u = this.uniforms;

    /* Local torch term gain (PREREG-torchlight) — LIGHTING's TUNE.localToon arrives here.
       Written only when the publisher sends a number, exactly like `skyOpen` below: nothing
       else republishes this uniform, so a one-boot A/B that pokes `uLocalToon` directly keeps
       sticking if a publisher ever stops sending the key. */
    if (typeof local === 'number') u.uLocalToon.value = local;

    /* `nightAmount` has been in LIGHTING's payload (`Lighting.js:1837`) with no consumer here,
       the same way `rim.strength` was. Consumed only by the ink lever, which is a no-op at
       `TUNE.inkNightMix = 0`, so reading it changes nothing until that ships. */
    if (typeof nightAmount === 'number') {
      this.setInkNight(nightAmount);
      /* banda2's night gate: warm-restoration levers are day-scoped arithmetically —
         at nightAmount 1 the shade-warm returns to its pre-banda2 value (RESULT-banda2). */
      u.uSubjWarmShade.value = TUNE.subjWarmShade +
        (TUNE.subjWarmShadeNightPin - TUNE.subjWarmShade) * Math.min(1, Math.max(0, nightAmount));
      u.uSubjShadowHold.value = TUNE.subjShadowHold;
    }

    if (direction) {
      _v3.set(direction.x ?? 0, direction.y ?? 1, direction.z ?? 0);
      if (_v3.lengthSq() > 1e-8) {
        _v3.normalize();
        if (_v3.y < 0) _v3.negate();      // caller gave us the travel direction
        u.uKeyDir.value.copy(_v3);
      }
    }
    if (color !== undefined && color !== null) setCol(u.uKeyColor.value, color);
    if (typeof intensity === 'number') u.uKeyIntensity.value = intensity;

    if (ambient !== undefined && ambient !== null) {
      if (typeof ambient === 'number') u.uAmbIntensity.value = ambient;
      else if (ambient.isColor) u.uSkyColor.value.copy(ambient);
      else {
        if (ambient.sky !== undefined) setCol(u.uSkyColor.value, ambient.sky);
        if (ambient.ground !== undefined) setCol(u.uBounceColor.value, ambient.ground);
        if (ambient.bounce !== undefined) setCol(u.uBounceColor.value, ambient.bounce);
        if (typeof ambient.intensity === 'number') u.uAmbIntensity.value = ambient.intensity;

        /* `floor` and `tint` were being published and silently dropped. LIGHTING's
         * `_publishKeyLight()` has always sent both; this function read `sky`, `ground`,
         * `bounce` and `intensity` and ignored the other two, so `Lighting.TUNE.encloseStrength`
         * had no consumer and its note ("if the floor took a scalar from here, the enclosure
         * term could drive it and this knob would start meaning something") was exactly right.
         *
         * Why the floor is clamped rather than assigned. It is the fraction of key luminance a
         * shadow is allowed to sit at, and TUNE.shadowFloor is the value that was bracketed
         * against captures for the *open-sky* case — AGENTS §2.2 quotes ~14% but that is about
         * the tonemapped result, and 0.155 of a raw 3.3 key measured flat. A publisher sending
         * a larger number must not be able to undo that. What a publisher legitimately knows and
         * this file does not is *enclosure*: a sealed tomb sees almost no sky, so its floor
         * belongs below the open-sky value. So the payload may only ever darken.
         *
         * Today this is arithmetically inert — Atmosphere's SHADOW_FLOOR is 0.14 against
         * TUNE.shadowFloor 0.125, so the min() picks the tuned value, and `tint` is the same
         * #2a3f66 both sides. That is the point: wiring it changes no pixel now and makes the
         * enclosure term live the moment LIGHTING raises `encloseStrength` off 0.
         *
         * Note what this does NOT fix. `_refreshShadowColor()` scales the shadow light by
         * `lum(uKeyColor) * uKeyIntensity`, so an interior's shading is still set by a sun that
         * never reaches it: `interior` runs at tod 0.5, the brightest key in the game (x4.05),
         * and every surface in the tomb is at shadowMix 1.0. That is why the frame reads flat
         * lavender. This wiring is the enabler for the fix, not the fix. */
        if (typeof ambient.floor === 'number' && ambient.floor >= 0) {
          this._shadowFloor = Math.min(TUNE.shadowFloor, ambient.floor);
        }

        /* `skyOpen` — the scope for §269's held shade band. KNOWN_ISSUES §271.4,
         * `progress/records/PREREG-holdscope.md`.
         *
         * §269 measured that the held band fixes critic 9's D1 on every daylight frame and
         * destroys `interior`, and §271.3 showed the two cases cannot be separated from inside
         * this file: `uShadowHold` is one object shared by identity across the whole scene, 8 of
         * 12 architectural materials are in the tomb AND in daylight, and the tomb runs the
         * brightest key in the game so key radiance cannot arbitrate either. The one thing that
         * does separate them is a CAMERA property, which is why the decision arrives here in the
         * payload instead of being derived here: LIGHTING casts a five-ray fan at the sky and
         * sends 1 for open, 0 for roofed.
         *
         * Written only when the publisher sends a number. That is not defensiveness — the
         * uniform block above documents that nothing republishes `uShadowHold` per frame, so a
         * one-boot A/B pokes it and the poke sticks, and several runs depend on that. With
         * scoping off (`Lighting.TUNE.holdEnclose` -1) this key is absent and the contract is
         * unchanged. */
        if (typeof ambient.skyOpen === 'number') {
          u.uShadowHold.value = TUNE.shadowHold * (ambient.skyOpen > 0.5 ? 1 : 0);
        }
        if (ambient.tint !== undefined && ambient.tint !== null) {
          setCol(this._shadowTint, ambient.tint);
        }
      }
    }

    if (rim !== undefined && rim !== null) {
      if (typeof rim === 'number') u.uRimGain.value = TUNE.rimGain * rim;
      else if (rim.isColor) this._setRimColor(rim);
      else {
        if (rim.color !== undefined) this._setRimColor(rim.color);
        if (typeof rim.gain === 'number') u.uRimGain.value = TUNE.rimGain * rim.gain;
        if (typeof rim.intensity === 'number') u.uRimGain.value = TUNE.rimGain * rim.intensity;
        /* `strength` is the name LIGHTING has always sent (`Lighting.js:532` publishes
           `rim: { direction, color, strength }`), and until now this block read `gain` and
           `intensity` only — so `Atmosphere.rimStrength` had no consumer anywhere in the
           project and the rim never learned the time of day. Accepted here as a third spelling
           rather than renamed at the sender, because the payload is a published interface
           (AGENTS §4.4) and two other keys are already tolerated.
           See TUNE.rimGain for why this arrives with a re-bracket and not on its own. */
        if (typeof rim.strength === 'number') u.uRimGain.value = TUNE.rimGain * rim.strength;
      }
    }

    if (shadowMatrix) this.shadowMatrix = shadowMatrix;
    this._refreshShadowColor();
  }

  /**
   * SKY pushes the atmosphere here so surfaces, ink lines and the sky dome agree on the haze.
   * @param {{haze?, hazeSun?, density?, falloff?, base?, gain?, start?, heightFalloff?, inscatter?, tint?, shadowTint?, shadowFloor?}} p
   */
  setAtmosphere(p = {}) {
    const u = this.uniforms;
    if (p.haze !== undefined) setCol(u.uHaze.value, p.haze);
    if (p.color !== undefined) setCol(u.uHaze.value, p.color);
    if (p.hazeSun !== undefined) { setCol(u.uHazeSun.value, p.hazeSun); this._hazeSunExplicit = true; }
    else this._refreshHazeSun();
    if (typeof p.density === 'number') u.uHazeDensity.value = p.density;
    if (typeof p.falloff === 'number') u.uHazeFalloff.value = p.falloff;
    if (typeof p.base === 'number') u.uHazeBase.value = p.base;
    if (typeof p.gain === 'number') u.uHazeGain.value = p.gain;
    if (typeof p.start === 'number') u.uHazeStart.value = p.start;
    /* atmowire (PREREG-atmowire.md C1): published-curve params; inert while uAtmoWire is 0. */
    if (typeof p.heightFalloff === 'number') u.uHazeHeightFalloff.value = p.heightFalloff;
    if (typeof p.inscatter === 'number') u.uHazeInscatter.value = p.inscatter;
    if (p.tint !== undefined) setCol(u.uHazeTint.value, p.tint);
    if (p.shadowTint !== undefined) {
      setCol(this._shadowTint, p.shadowTint);
    }
    if (typeof p.shadowFloor === 'number') this._shadowFloor = p.shadowFloor;
    this._refreshShadowColor();
    this._fogSynced = true;    // SKY is authoritative from here on; stop reading scene.fog
  }

  /** Move the global ramp. Exposed so the critic loop can retune the look in one place. */
  setRampTuning({ lo, hi, soft } = {}) {
    if (typeof lo === 'number') this.uniforms.uTermLo.value = lo;
    if (typeof hi === 'number') this.uniforms.uTermHi.value = hi;
    if (typeof soft === 'number') {
      for (const m of this._cache.values()) {
        const u = m.userData?.slyUniforms;
        if (u?.uTermSoft) u.uTermSoft.value = soft;
      }
    }
  }

  /**
   * Rim colour is a per-material uniform (a gold trinket may want a different complement from
   * fur), so a global flip has to walk the cache. Guarded on the value: this is reachable from
   * the per-frame auto-light path and must not iterate every material every frame.
   */
  _setRimColor(c, isOverride = true) {
    /* Guard by VALUE, never by reference.
       `if (this._rimApplied === c) return;` was a cache that could never miss: LIGHTING passes
       the same `THREE.Color` instance every frame (`Lighting.js:475` allocates it once,
       l.1119 `copy()`s into it), so after the first call the identity test always fired and
       `uRimColor` held its boot value for the life of the process — while `_rimOverride` was
       simultaneously left truthy, which disabled `_applyAutoLight`'s day/night fallback too.
       Both paths dead from one `===`. KNOWN_ISSUES §61.6.
       Reading the value into a scratch first also means callers may keep mutating whatever
       they passed us; we never retain their object. */
    setCol(_rimIn, c);
    if (this._rimHas && _rimIn.equals(this._rimLive)) {
      if (isOverride) this._rimOverride = true;
      return;
    }
    this._rimLive.copy(_rimIn);
    this._rimHas = true;
    for (const m of this._cache.values()) {
      /* Skip materials whose caller named their own rim colour. This method's docstring
         always said "a gold trinket may want a different complement from fur" — and the walk
         then overwrote exactly those. It was invisible while the reference guard above froze
         this whole path after one call; un-freezing it made a latent defect live, which is
         why it is fixed in the same change. Real callers that would have been clobbered:
         `Vegetation.js:318/324` (0xd8ff9a foliage), `Vegetation.js:329` and
         `Guard.js:1072` (0xffd9a0). */
      if (m.userData?.slyRimPinned) continue;
      const u = m.userData?.slyUniforms;
      if (u?.uRimColor) u.uRimColor.value.copy(_rimIn);
    }
    if (isOverride) this._rimOverride = true;
  }

  /**
   * How far the ink's *lit* leg is carried toward `TUNE.inkMoon`, 0..1.
   *
   * 0 is bit-identical to the shipping build (the lerp is the identity), which is what makes
   * this a one-poke A/B: `engine.get('shading').setInkNight(1)`. Normally driven by
   * `nightAmount`, which is 1.000 at `night`/`guard` and 0.000 at every other canonical shot,
   * so it touches exactly the two framings where `inkSun` has no referent.
   */
  setInkNight(amount) {
    const a = clamp(+amount || 0, 0, 1);
    if (a === this._inkNight) return;
    this._inkNight = a;
    for (const m of this._inkCache.values()) this._applyInkNight(m);
  }

  _applyInkNight(m) {
    const base = m.userData?.slyInkBase;
    if (!base || !m.uniforms?.uInkSun) return;
    const k = this._inkNight * TUNE.inkNightMix;
    setCol(m.uniforms.uInkSun.value, base.sun);
    if (k > 0) m.uniforms.uInkSun.value.lerp(_colOf(TUNE.inkMoon), k);
  }

  /**
   * Shadow illumination = the shadow hue, renormalised to unit luminance, scaled to
   * `shadowFloor` x key luminance. Renormalising is what guarantees AGENTS' "never below ~14%
   * of key luminance" holds no matter how dark the chosen hue is.
   */
  /**
   * Paint shadow diagnostics over the scene. See TOON_SHADE for the channel key.
   *   false/0  off
   *   true/1   R = shadow term, G = receiveShadow, B = N.L
   *   2        cascade 0 shadow coordinate (xyz after the divide)
   *   3        stored map depth vs the fragment's projected depth
   *   4        cascade blend weights
   */
  debugShadow(mode = true) {
    const v = mode === true ? 1 : (mode === false ? 0 : (+mode || 0));
    this.uniforms.uDebugShadow.value = v;
    if (v > 0) this._debugGuard('debugShadow', v, DEBUG_CALIB.shadow);
    return v;
  }

  /**
   * Paint a rim-gate term over the scene, in raw shader units.
   *
   * **Only valid with `engine.get('postfx').debugRaw(true)`.** On its own this is exactly the
   * mistake KNOWN_ISSUES §1 records: a value written into `outgoingLight` and then carried
   * through AgX, the grade and bloom describes the chain, not the term. `debugRaw` is the half
   * that makes it a measurement.
   *
   *   0  off — bit-identical to shipping
   *   1  R = vSlySkin, G = rimMag (magnitude gate), B = slyConvex (convexity gate)
   *   2  R = rimBand (the fresnel band), G = rimSil (both gates), B = their product
   *   3  R = slyTurn/40, G = N.V, B = fres
   *   4  constants (0.25, 0.50, 0.75) — the calibration. Run this FIRST: it must arrive at the
   *      PNG as (64, 128, 191). It is also the toon-population map, since nothing else in a
   *      frame writes that triple.
   *   5  R = ramp (the quantised diffuse), G = N.L, B = ramp * shadow. Read R against G.
   *   6  R = specStep/1.35 (the specular quantiser as a fraction of its own ceiling),
   *      G = lobe (the raw Blinn lobe), B = sh * step(0.02, N.L) (the two gates).
   *      Read B FIRST: where B = 0 the specular is multiplied out and R/G mean nothing.
   *
   * A mode-4 failure does NOT mean "this channel is broken". It means "no pixel carrying this
   * constant reached the PNG", and a cel program that failed to LINK produces exactly that,
   * indistinguishably. §210.2 made that call the wrong way and it cost a day. `programHealth()`
   * separates the two by asking the driver, and this setter calls it for you.
   */
  debugTerm(mode = 1) {
    const v = mode === true ? 1 : (mode === false ? 0 : (+mode || 0));
    this.uniforms.uDebugTerm.value = v;
    if (v > 0) this._debugGuard('debugTerm', v, DEBUG_CALIB.term);
    return v;
  }

  /**
   * The calibration constants every debug channel proves itself with, re-exported so a probe
   * never has to hard-code them. `{ term: {mode, rgb, u8}, shadow: {...} }`.
   */
  get debugCalib() { return DEBUG_CALIB; }

  /**
   * Select a channel's SELF-CALIBRATION mode by name — `calibrate('term')` /
   * `calibrate('shadow')` — and return what the PNG must then read.
   *
   * Only meaningful with `postfx.debugRaw('scene')`; without that half the constants are
   * carried through AgX and the grade and mean nothing (KNOWN_ISSUES §1).
   */
  calibrate(channel) {
    const c = DEBUG_CALIB[channel];
    if (!c) { this._warn(`calibrate("${channel}") — no such channel; try ${Object.keys(DEBUG_CALIB).join(' / ')}`); return null; }
    if (channel === 'term') this.debugTerm(c.mode); else this.debugShadow(c.mode);
    return { ...c };
  }

  /**
   * Record what a calibration capture actually read, so later reading-mode calls stop warning
   * (or start warning louder). Probes should call this immediately after scoring mode 4 / 9.
   */
  confirmDebugCalibration(channel, ok, detail = '') {
    const name = channel === 'term' ? 'debugTerm' : channel === 'shadow' ? 'debugShadow' : channel;
    if (!(name in this._debugProven)) { this._warn(`confirmDebugCalibration("${channel}") — unknown channel`); return; }
    this._debugProven[name] = !!ok;
    if (!ok) this._warn(`${name} FAILED its own calibration${detail ? `: ${detail}` : ''} — nothing read through this channel is quotable.`);
  }

  /**
   * **Ask the GL driver whether the cel programs actually linked.**
   *
   * This is the check whose absence cost §210.2 a day and §217 a full retraction. Between
   * 6e0cc8f and its fix, `TOON_SHADE` carried thirteen lines of prose outside a comment, so
   * every cel fragment program failed to link — `ERROR: 0:2502: '*' : syntax error`, zero
   * active uniforms — and every toon-shaded pixel stopped drawing. What a capture showed was
   * still a plausible frame (sky, ink and post all have their own programs), so three
   * successive probes read the image, concluded "the uniform does not reach the shader", and
   * chased a uniform-plumbing bug that did not exist.
   *
   * Two tells, both here, neither visible in a PNG:
   *   · `LINK_STATUS` false — the direct answer;
   *   · `ACTIVE_UNIFORMS` 0 — §217 reported exactly this on four programs and dismissed it as
   *     an impossible reading from a wrong accessor. It was not wrong. A program that never
   *     linked reports zero active uniforms, which is what "impossible" was pointing at.
   *
   * @param {THREE.WebGLRenderer} [renderer] defaults to `engine.renderer`.
   * @returns {{ok:boolean, checked:number, linked:number, failed:number, unbuilt:number,
   *            reason:string, failures:Array<{material:string, uniforms:number, log:string}>}}
   */
  programHealth(renderer = this.engine?.renderer) {
    const out = { ok: false, checked: 0, linked: 0, failed: 0, unbuilt: 0, reason: '', failures: [] };
    if (!renderer || typeof renderer.getContext !== 'function' || !renderer.properties) {
      out.reason = 'no renderer available — pass one explicitly, or call after boot';
      return out;
    }
    const gl = renderer.getContext();
    const mats = [...this._cache.values(), ...this._inkCache.values()];
    for (const m of mats) {
      out.checked++;
      const prog = renderer.properties.get(m)?.currentProgram;
      const p = prog?.program;
      if (!p) { out.unbuilt++; continue; }
      const linked = gl.getProgramParameter(p, gl.LINK_STATUS);
      const nUni = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      if (linked && nUni > 0) { out.linked++; continue; }
      out.failed++;
      let log = (gl.getProgramInfoLog(p) || '').trim();
      for (const s of (gl.getAttachedShaders(p) || [])) {
        const l = (gl.getShaderInfoLog(s) || '').trim();
        if (l) log += (log ? '\n' : '') + l;
      }
      out.failures.push({ material: m.name || m.type || '?', uniforms: nUni, log: log.slice(0, 400) });
    }
    out.ok = out.checked > 0 && out.failed === 0 && out.linked > 0;
    if (out.checked === 0) out.reason = 'no cel materials built yet';
    else if (out.failed > 0) out.reason = `${out.failed}/${out.checked} cel programs FAILED TO LINK`;
    else if (out.linked === 0) out.reason = `${out.unbuilt} cel materials exist but none has been compiled yet — render a frame first`;
    else out.reason = `${out.linked}/${out.checked} cel programs linked`;
    return out;
  }

  /**
   * Loud at the call site, which is the whole point: a debug channel that cannot prove itself
   * must say so rather than return a plausible picture.
   */
  _debugGuard(name, mode, calib) {
    const health = this.programHealth();
    if (health.failed > 0) {
      this._warn(`${name}(${mode}): ${health.reason}. Nothing this channel paints will reach the frame. First failure: ${health.failures[0]?.log?.split('\n')[0] || '(no log)'}`);
      return;
    }
    if (mode === calib.mode) return;                       // selecting the calibration itself
    if (this._debugProven[name] === true) return;           // already proven this session
    const how = `${name}(${calib.mode}) with postfx.debugRaw('scene') must read (${calib.u8.join(', ')})`;
    this._warn(this._debugProven[name] === false
      ? `${name}(${mode}) is a READING mode and this channel FAILED its calibration — its numbers are not quotable. Re-prove it: ${how}.`
      : `${name}(${mode}) is a READING mode on an UNPROVEN channel. Prove it first: ${how}, then call confirmDebugCalibration('${name === 'debugTerm' ? 'term' : 'shadow'}', ok).`);
  }

  /**
   * Forward-scatter haze colour, rebuilt from whatever haze is currently live.
   *
   * **`uHazeSun` was a constant.** `setAtmosphere()` is its only writer and nothing in `src/`
   * calls `setAtmosphere()` — SKY expresses the haze as `scene.fog`, which carries a colour and
   * a density and no sun tint — so from construction to shutdown the uniform held
   * `PAL.hazeSun` `#ffc98a`, a golden-hour orange, in every shot at every time of day.
   *
   * That is invisible in daylight by luck: Atmosphere's own `fog.sunTint` at tod 0.72-0.83 is
   * `#ffc889`-`#ffbc7e`, which is the same colour. At night it is not close. Measured over the
   * `night` camera (tod 0.02, key = moon at elevation 12 deg, azimuth 157 deg — the camera looks
   * almost straight into it), `slyHazeColor()`'s mix weight `pow(sunAmt,3) * 0.8` combined with
   * the haze factor exceeds 0.20 over **94.1% of the frame** and peaks at 0.722, while the live
   * haze is `#222f4a` at linear luminance 0.024 against the stuck constant's 0.431 — **17.7x**
   * too bright, and warm where §2.2 wants the night palette. The one shot whose entire purpose
   * is "palette flip: moonlit stealth" was having most of its depth cue tinted orange.
   *
   * The gain is not a new art decision. The palette pair the constant came from, `PAL.haze`
   * `#e8b878` -> `PAL.hazeSun` `#ffc98a`, is x1.231 / x1.213 / x1.359 per linear channel — near
   * enough a flat 1.25 that the authored intent is simply "the same haze, brighter into the
   * light". Rebuilding it from the live `uHaze` reproduces daylight to within a rounding error
   * and follows the haze into night for free. An explicit `setAtmosphere({ hazeSun })` still
   * wins outright, so this is a floor under a missing publisher, not a replacement for one.
   */
  _refreshHazeSun() {
    if (this._hazeSunExplicit) return;
    const u = this.uniforms;
    u.uHazeSun.value.copy(u.uHaze.value).multiplyScalar(TUNE.hazeSunBoost);
  }

  _refreshShadowColor() {
    const u = this.uniforms;
    const keyLum = lum(u.uKeyColor.value) * u.uKeyIntensity.value;

    /* The teal blend (TUNE.shadowTeal — the interlock note there is the why) happens HERE,
     * on whatever tint is current, so a LIGHTING `ambient.tint` republish keeps the fix, and
     * the blended colour feeds the floor AND the peak cap below. That ordering has a measured
     * consequence worth stating: uncapped (night), light luminance is floor x keyLum exactly —
     * lerping two equal-luminance colours preserves luminance, so the hue blend cannot move
     * night's brightness (t16ab: 0.0419 -> 0.0418). Capped (all daylight), luminance is
     * tintLum x peakCap / tintPeak, and turquoise carries more luminance per unit of peak
     * channel than #2a3f66 — so daylight shadow light rises from 8.1% to 11.6% of key
     * luminance. That is TOWARD §2.2's "~14% of key, never below", not a side effect to
     * tune back out. */
    _tintBlend.copy(this._shadowTint).lerp(_turq, TUNE.shadowTeal);
    const tintLum = lum(_tintBlend);
    let k = (this._shadowFloor * keyLum) / Math.max(tintLum, 1e-4);

    /* Cap how far the hue may be scaled.
     *
     * With a golden-hour key at intensity 3.3, the floor target alone asks for k ≈ 2.8. Scaling
     * #2a3f66 that far drives its blue channel to clip while red lags, so the "dark violet-teal"
     * the palette specifies arrives at the shader as a bright periwinkle (#74a4ff was what was
     * actually reaching it). Multiplied into warm sandstone and then added again as the wash,
     * that is what turned every stone surface lavender.
     *
     * The floor is a readability rule — keep detail visible in shadow — not a licence to make
     * the shadow light brighter than the material it falls on. Capping the peak channel keeps
     * the hue intact and keeps shadow reading as shadow.
     *
     * ~~**Read this before tuning `shadowFloor` or `ambient.floor`: in daylight the cap is not an
     * edge case, it is the operating point, and both of those knobs are dead above it.**~~
     *
     * **RETRACTED — the cap released itself two constants ago and is now INERT outdoors.
     * KNOWN_ISSUES §261, measured.** The table that stood here (hero asks 6.50, `maxK` 3.904,
     * "every daylight shot receives the identical shadow light `(0.123, 0.175, 0.423)`") was
     * true when it was written and is false now. Two constants moved underneath it:
     *
     *   - `TUNE.shadowTeal` 0.15 was introduced, and the teal blend feeds BOTH `tintLum` and
     *     `peak`. It raises `tintLum` 0.05007 -> 0.08928, which DIVIDES `k asked` by 1.783.
     *   - this constant was raised 0.52 -> 0.62, which MULTIPLIES `maxK` by 1.192.
     *
     * Net `kAsked / maxK` moved by 2.13x and crossed 1. Live readback, one boot, `dt = 0`
     * (`progress/records/clamp2.mjs`, model bit-exact against the live uniform at 3.4e-12 on
     * 8/8 shots):
     *
     *     shot        keyLum   k asked   maxK    k used   capped?
     *     hero         2.423     3.392   3.742    3.392   no
     *     temple       2.542     3.560   3.742    3.560   no
     *     courtyard    2.440     3.417   3.742    3.417   no
     *     combat       2.481     3.474   3.742    3.474   no
     *     dunes        1.884     2.639   3.742    2.639   no
     *     traversal    2.433     3.406   3.742    3.406   no
     *     interior     3.642     5.100   3.742    3.742   YES — the only one left
     *     night        0.335     0.468   3.742    0.468   no
     *
     * Consequences, all measured rather than argued:
     *
     *   - Raising this constant is a **no-op outdoors**: 0.62 -> 4.00 leaves `uShadowColor`
     *     BIT-IDENTICAL on all six outdoor daylight shots, while the same poke moves `interior`
     *     36.3% and 0.62 -> 0.30 moves every shot >= 31.4% (both controls fired).
     *   - `shadowFloor` is **live again outdoors** — it is what sets `k` now, not this cap.
     *     The old "floor must fall below 0.075 to matter" no longer holds.
     *   - The daylight shadow light is **no longer identical across shots**; it tracks `keyLum`
     *     (hero luma 0.30287 vs temple 0.31778, ratio 1.04923 against keyLum ratio 1.04924).
     *   - The margin is thin and it re-binds under a key boost. Measured on `hero`: the light
     *     tracks the key exactly to x1.10, then goes flat — across §256's own keyBoost bracket
     *     the sun rises 160% and the shadow light rises **10.31%**. That is the mechanism
     *     behind §256's "p1 moves <= 1.5 L across the whole bracket".
     *
     * The release point is `kAsked * peak` = **0.562** and this constant ships at 0.62, i.e.
     * 10.3% of headroom. Anything that raises `keyLum` or `shadowFloor` past that re-engages
     * the cap silently, which is exactly how it got missed on the way out. */
    const peak = Math.max(_tintBlend.r, _tintBlend.g, _tintBlend.b);
    const maxK = TUNE.shadowTintPeak / Math.max(peak, 1e-4);
    k = Math.min(k, maxK);

    /* Mix warm sand bounce into the shadow light — **at matched luminance**.
     *
     * A desert shadow is not lit by blue sky alone; it is lit by sky *and* by sunlight
     * bouncing off the sand all around it, and a purely blue shadow light multiplied into
     * warm sandstone neutralises to mauve. So the mix itself is right and stays.
     *
     * What was wrong is that it ran on raw linear radiance. These two colours are nowhere
     * near the same brightness in linear space — #2a3f66 is (0.023, 0.050, 0.133) and
     * #e8a852 is (0.807, 0.392, 0.084), 35x more red — so `lerp(tint, bounce, 0.20)` is not
     * "20% of the way toward warm", it is "swamped by warm": the result left this function at
     * R/G 1.52 with green as its darkest channel, i.e. a *magenta* light, brighter in red
     * than the sun it was supposed to sit against. That single line is the whole of the
     * critic's "the shadow is a redder, more saturated version of the lit hue", and it is
     * also why raising `shadowWash` turned the frame lavender rather than blue: the wash is
     * this colour, added unmultiplied.
     *
     * Normalising the bounce to the tint's luminance first makes the parameter mean what its
     * name says — a hue blend — and leaves the scaling to `k`, which is the term that exists
     * to set how bright a shadow is. */
    const bounce = u.uBounceColor.value;
    const bl = lum(bounce);
    const bScale = bl > 1e-4 ? tintLum / bl : 1;

    /* Two builds of the SAME light differing only in bounce share, so the teal blend, the
     * floor and the peak cap `k` above apply identically to both and the pair cannot drift
     * apart when LIGHTING republishes. The shader picks between them on shadow depth.
     * With shadowBounceMixLit == shadowBounceMix the two are bit-identical and the shader's
     * mix() is an exact no-op — that is the shipped default and the A/B's null arm. */
    _col.copy(bounce).multiplyScalar(bScale);
    _col.lerp(_tintBlend, 1 - TUNE.shadowBounceMix);
    u.uShadowColor.value.copy(_col).multiplyScalar(k);

    _col.copy(bounce).multiplyScalar(bScale);
    _col.lerp(_tintBlend, 1 - TUNE.shadowBounceMixLit);
    u.uShadowColorLit.value.copy(_col).multiplyScalar(k);

    /* Kept in step with TUNE here rather than only at construction, so a live poke of
     * TUNE.shadowDepth followed by _refreshShadowColor() moves the window — the same
     * poke-and-refresh path §115's 29-arm sweep drove the other shadow knobs through. */
    u.uShadowDepth.value.set(TUNE.shadowDepth[0], TUNE.shadowDepth[1]);
  }

  /* ======================================================================
     Frame
  ====================================================================== */

  update(dt, t) {
    const e = this.engine;
    this.uniforms.uTime.value = t;
    this._syncResolution();

    if (this._autoKey) {
      // Rescan occasionally: LIGHTING may not exist, and main.js's fallback sun appears late.
      if ((this._autoScan = (this._autoScan + 1) % 24) === 1) this._findSceneLight();
      const tod = e.debug?.timeOfDay ?? 0.78;
      if (tod !== this._lastTod) this._applyAutoLight();
      else this._trackSceneLight();
    }

    // SKY may express the haze as scene.fog before it learns about setAtmosphere().
    if (!this._fogSynced) {
      const fog = e.scene?.fog;
      if (fog?.color) {
        this.uniforms.uHaze.value.copy(fog.color);
        if (typeof fog.density === 'number') {
          this.uniforms.uHazeDensity.value = Math.max(fog.density * 2.6, 0.004);
        }
        /* This is the ONLY path that keeps uHaze current in the shipped game — setAtmosphere()
           has no caller anywhere in src/ — so it is also the only place uHazeSun can be kept
           in step with it. */
        this._refreshHazeSun();
      }
    }

    if (e.debug && e.debug.wireframe !== this._wireframe) {
      this._wireframe = e.debug.wireframe;
      for (const m of this._cache.values()) m.wireframe = this._wireframe;
      this.setOutlinesVisible(!this._wireframe);
    }
  }

  _syncResolution() {
    const r = this.engine.renderer;
    if (!r) return;
    r.getDrawingBufferSize(_v2);
    const u = this.uniforms.uRes.value;
    if (u.x !== _v2.x || u.y !== _v2.y) u.copy(_v2);
  }

  /** Find the brightest shadow-casting directional light — ground truth for the ramp. */
  _findSceneLight() {
    this._bestLight = null;
    this._bestScore = -1;
    this.engine.scene?.traverse(this._scanLight);
    this._autoLight = this._bestLight;
  }

  _scanLight = (o) => {
    if (!o.isDirectionalLight || !o.visible) return;
    const score = o.intensity * (o.castShadow ? 4 : 1);
    if (score > this._bestScore) { this._bestScore = score; this._bestLight = o; }
  };

  /**
   * Copy the scene's own sun into the key uniforms. The ramp MUST agree with whatever light
   * rendered the shadow map, or lit surfaces and cast shadows disagree about where the sun is.
   */
  _trackSceneLight() {
    const L = this._autoLight;
    if (!L) return;
    const u = this.uniforms;
    _v3.setFromMatrixPosition(L.matrixWorld);
    if (L.target) { _v3b.setFromMatrixPosition(L.target.matrixWorld); _v3.sub(_v3b); }
    if (_v3.lengthSq() > 1e-8) u.uKeyDir.value.copy(_v3).normalize();
    u.uKeyColor.value.copy(L.color);
    const i = Math.max(L.intensity, 0.05);
    if (i !== u.uKeyIntensity.value) { u.uKeyIntensity.value = i; this._refreshShadowColor(); }
  }

  /**
   * Fallback lighting so the frame is art-directed even before LIGHTING lands. Direction and
   * colour come from the real scene light when there is one — they must, or the ramp would
   * disagree with the shadow map — and everything else is derived from timeOfDay.
   */
  _applyAutoLight() {
    const u = this.uniforms;
    const tod = this.engine.debug?.timeOfDay ?? 0.78;
    this._lastTod = tod;
    const day = tod > DAY_START && tod < DAY_END;
    const t = clamp((tod - DAY_START) / (DAY_END - DAY_START), 0, 1);
    const az = Math.PI * t;
    const elev = Math.sin(az);

    const L = this._autoLight;
    if (L) {
      this._trackSceneLight();
    } else {
      u.uKeyDir.value.set(Math.cos(az), Math.max(elev * 0.95, 0.06), -0.34).normalize();
      if (!day) u.uKeyDir.value.set(0.42, 0.62, 0.66).normalize();
      const warm = 1 - clamp(elev * 1.5, 0, 1);
      _col.copy(_colOf(PAL.sunHigh)).lerp(_colOf(PAL.sun), clamp(warm * 1.4, 0, 1));
      if (warm > 0.62) _col.lerp(_colOf(PAL.sunLow), (warm - 0.62) / 0.38 * 0.75);
      u.uKeyColor.value.copy(day ? _col : _colOf(PAL.moon));
      u.uKeyIntensity.value = day ? 1.5 + 1.35 * clamp(elev * 2.2, 0, 1) : 0.55;
    }

    // Fill, rim and haze follow the clock regardless of who owns the sun.
    const night = day ? 0 : 1;
    u.uSkyColor.value.copy(_colOf(PAL.fillSky)).lerp(_colOf(PAL.fillSkyNight), night);
    u.uBounceColor.value.copy(_colOf(PAL.bounce)).lerp(_colOf(PAL.bounceNight), night);
    u.uAmbIntensity.value = day ? TUNE.ambIntensity : TUNE.ambIntensity * 0.55;
    /* Mirrors `Atmosphere.rimStrength = lerp(0.5, 0.72, nightAmount)`, because `TUNE.rimGain`
       is now a PRE-strength factor (see its note) and this fallback has to apply a strength of
       its own or it would render 2x the rim LIGHTING asks for. 4.10 * 0.5 = 2.05 day,
       4.10 * 0.72 = 2.952 night — the same two numbers the wired path produces.
       Reachable only while LIGHTING is absent (`_autoKey`), so no canonical capture exercises
       it; kept in step so that when it IS the path, it is not a different look.
       Flagged, not changed: `PAL.rimNight` (#a8e0ff, cool) contradicts both AGENTS §2.2's
       "warm variant for night #ff9a5c" and `Atmosphere`'s own `rimWarm`, which is what
       LIGHTING actually publishes. Changing it is an art call on a path no shot renders, so
       it is recorded here rather than taken blind. */
    u.uRimGain.value = TUNE.rimGain * (day ? 0.5 : 0.72);
    if (!this._rimOverride) this._setRimColor(day ? PAL.rim : PAL.rimNight, false);
    if (!this._fogSynced) {
      u.uHaze.value.copy(_colOf(PAL.haze)).lerp(_colOf(PAL.hazeNight), night);
      u.uHazeGain.value = TUNE.hazeGain * (day ? 1 : 0.7);
      this._refreshHazeSun();
    }
    this._refreshShadowColor();
  }

  /* ======================================================================
     Procedural detail textures
  ====================================================================== */

  /**
   * The triplanar detail layer. Generated here rather than taken from TEXTURES because it is
   * part of the lighting model, not part of a surface's art: it is what stops a 40 m pylon
   * wall from reading as a flat plane, and it must exist even if a caller passes no maps.
   * RGB = tangent-space normal, A = albedo grain.
   */
  _detailTexture(key) {
    const size = this._detailSize || 256;
    const ck = `${key}@${size}`;
    const hit = this._detail.get(ck);
    if (hit) return hit;

    const p = DETAIL_PRESETS[key] || DETAIL_PRESETS.generic;
    const tex = buildDetailTexture(p, size);
    tex.anisotropy = this.engine.maxAniso || 4;
    this._detail.set(ck, tex);
    return tex;
  }

  /* ======================================================================
     Teardown
  ====================================================================== */

  dispose() {
    this.engine.off?.('timeOfDay', this._onTimeOfDay);
    for (const m of this._cache.values()) m.dispose();
    for (const m of this._inkCache.values()) m.dispose();
    for (const t of this._detail.values()) t.dispose();
    this._cache.clear();
    this._inkCache.clear();
    this._detail.clear();
    this._shells.length = 0;
    this.normalMaterial.dispose();
  }

  _warn(msg) {
    this.engine?.warn?.(`shading: ${msg}`);
  }
}

/* ---------------------------------------------------------------------------
   §213 — `make()`, the method five call sites have always called and that has
   never existed.

   `SlyModelDLRig.js:352` (the SHIPPED character, §216), `KayKit.js:181` (all 36
   props), `SlyModel3.js:701`, `SlyModelDL.js:445` and `SlyModelDLRaw.js:160` are
   all written as

       const mat = shading?.make ? shading.make({ … })
                                 : new THREE.MeshStandardMaterial({ … });

   and `shading?.make` has always been `undefined`, so all five take the fallback.
   The player character and every KayKit prop have therefore never rendered on the
   cel material — smooth Lambert, no ramp, no rim, no SSS — while the world calls
   the real method, `toon()`, and is fully cel-shaded. Critic pass 7's #1 defect,
   "THERE IS NO TOON RAMP, ANYWHERE", is this.

   `_normalise` already accepts everything those sites pass (`name`, `color`,
   `map`, `vertexColors`, `bands`, `rim`, `rimColor`, `sss`, `outline`); only
   `outlineColor` is dropped, and `Outline.js` owns that anyway.

   INSTALLED CONDITIONALLY so `?cel=off` reproduces the pre-fix build EXACTLY.
   With the property genuinely absent, each call site takes its own native
   fallback branch — which is what ships today. A `make` that existed and returned
   a stand-in could not make that guarantee, because all five fallbacks differ
   (KayKit passes a `map`, SlyModel3 passes `vertexColors`, …). Absence is the
   only faithful OFF arm, and PREREG-cel1 needs one.

   In Node (tests, offline tools) there is no `location`, so the alias is present —
   which is what `tests/api.test.mjs` reads.
--------------------------------------------------------------------------- */
if (typeof location === 'undefined'
    || new URLSearchParams(location.search).get('cel') !== 'off') {
  Shading.prototype.make = function make(opts) { return this.toon(opts); };
}

/* ===========================================================================
   Helpers
=========================================================================== */

const _colCache = new Map();
function _colOf(h) {
  let c = _colCache.get(h);
  if (!c) { c = new THREE.Color(h); _colCache.set(h, c); }
  return c;
}

function lum(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function tid(t) { return t ? t.uuid : '-'; }

function hex(v, d) {
  if (v === undefined || v === null) return d;
  if (typeof v === 'number') return v;
  if (v.isColor) return v.getHex();
  if (typeof v === 'string') { try { return new THREE.Color(v).getHex(); } catch { return d; } }
  return d;
}

function setCol(target, v) {
  if (v === undefined || v === null) return;
  if (v.isColor) target.copy(v);
  else if (typeof v === 'number') target.setHex(v);
  else if (typeof v === 'string') { try { target.set(v); } catch { /* keep */ } }
}

function replaceOnce(src, needle, replacement, mod, label) {
  if (src.indexOf(needle) === -1) {
    if (!mod._patchWarned) {
      mod._patchWarned = true;
      mod._warn(`shader splice "${label}" missed — three.js chunk layout changed?`);
    }
    return src;
  }
  return src.replace(needle, replacement);
}

/* ---------------------------------------------------------------------------
   Detail presets. `scale` is texture repeats per world metre.
--------------------------------------------------------------------------- */
const DETAIL_PRESETS = {
  sandstone: { kind: 'chisel', freq: 6,  oct: 4, relief: 1.15, streak: 0.55, streakY: 34, facet: 0.40, scale: 0.62, strength: 0.85, grain: 0.42, seed: 11 },
  limestone: { kind: 'pit',    freq: 9,  oct: 5, relief: 0.85, streak: 0.18, streakY: 20, facet: 0.22, scale: 0.80, strength: 0.62, grain: 0.30, seed: 23 },
  plaster:   { kind: 'tooth',  freq: 14, oct: 4, relief: 0.55, streak: 0.10, streakY: 12, facet: 0.05, scale: 1.25, strength: 0.45, grain: 0.22, seed: 37 },
  sand:      { kind: 'ripple', freq: 5,  oct: 4, relief: 0.70, streak: 0.85, streakY: 9,  facet: 0.00, scale: 0.35, strength: 0.55, grain: 0.20, seed: 41 },
  gold:      { kind: 'hammer', freq: 7,  oct: 3, relief: 0.45, streak: 0.12, streakY: 16, facet: 0.30, scale: 2.30, strength: 0.40, grain: 0.16, seed: 53 },
  metal:     { kind: 'brush',  freq: 3,  oct: 3, relief: 0.30, streak: 0.95, streakY: 64, facet: 0.00, scale: 1.60, strength: 0.35, grain: 0.14, seed: 67 },
  cloth:     { kind: 'weave',  freq: 10, oct: 3, relief: 0.70, streak: 0.30, streakY: 24, facet: 0.00, scale: 5.50, strength: 0.60, grain: 0.28, seed: 71 },
  fur:       { kind: 'strand', freq: 4,  oct: 4, relief: 0.90, streak: 1.00, streakY: 52, facet: 0.00, scale: 7.00, strength: 0.70, grain: 0.30, seed: 83 },
  generic:   { kind: 'tooth',  freq: 8,  oct: 4, relief: 0.70, streak: 0.25, streakY: 18, facet: 0.15, scale: 1.00, strength: 0.55, grain: 0.28, seed: 97 },
};

/* Local deterministic noise. Not imported from core/Rand.js on purpose: that module currently
   fails to parse (`WORLD_SEED = 0x5c1y`), and shading must not be able to break the boot. */
function ihash(x, y, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x85ebca6b) ^ Math.imul(s, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const sstep = (t) => t * t * (3 - 2 * t);

/** Tileable value noise with independent x/y periods. */
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = ihash(x0, y0, seed), b = ihash(x1, y0, seed);
  const c = ihash(x0, y1, seed), d = ihash(x1, y1, seed);
  const u = sstep(xf), v = sstep(yf);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fbm(u, v, fx, fy, oct, seed) {
  let sum = 0, norm = 0, amp = 1, ax = fx, ay = fy;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(u * ax, v * ay, ax, ay, seed + i * 17);
    norm += amp; amp *= 0.5; ax *= 2; ay *= 2;
  }
  return sum / norm;
}

/**
 * Build the detail map. Every kind is a height field plus a grain field; the normal comes from
 * central differences on the height, so relief and albedo grain always agree about where the
 * crevices are (which is what makes the AO/shadow read believable at close range).
 */
function buildDetailTexture(p, size) {
  const n = size * size;
  const h = new Float32Array(n);
  const g = new Float32Array(n);
  const inv = 1 / size;
  const s = p.seed;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const i = y * size + x;

      let base = fbm(u, v, p.freq, p.freq, p.oct, s);
      let hv;

      switch (p.kind) {
        case 'chisel': {
          // Ridged noise reads as tool marks; a hard-quantised term adds chisel facets.
          const r = 1 - Math.abs(base * 2 - 1);
          const streak = fbm(u, v, Math.max(2, p.freq >> 1), p.streakY, 3, s + 5);
          hv = 0.58 * r + p.streak * streak * 0.5;
          const q = Math.floor(hv * 6) / 6;
          hv = hv * (1 - p.facet) + q * p.facet;
          break;
        }
        case 'pit': {
          const pits = fbm(u, v, p.freq * 2, p.freq * 2, 2, s + 9);
          hv = base * 0.8 - Math.pow(Math.max(0, pits - 0.62) * 2.6, 2) * 0.55;
          hv += p.streak * fbm(u, v, 3, p.streakY, 2, s + 3) * 0.3;
          break;
        }
        case 'tooth':
          hv = base * 0.85 + p.streak * fbm(u, v, 4, p.streakY, 2, s + 7) * 0.4;
          break;
        case 'ripple': {
          const warp = fbm(u, v, 3, 3, 3, s + 2) * 0.6;
          hv = 0.5 + 0.5 * Math.sin((v * p.streakY + warp) * Math.PI * 2);
          hv = hv * 0.62 + base * 0.38;
          break;
        }
        case 'hammer': {
          const d = fbm(u, v, p.freq, p.freq, 2, s + 4);
          hv = 0.5 + 0.5 * Math.cos(d * Math.PI * 3.0);
          hv = hv * 0.7 + base * 0.3;
          const q = Math.floor(hv * 5) / 5;
          hv = hv * (1 - p.facet) + q * p.facet;
          break;
        }
        case 'brush':
          hv = fbm(u, v, 2, p.streakY, 3, s) * 0.9 + base * 0.1;
          break;
        case 'weave': {
          const wu = 0.5 + 0.5 * Math.sin(u * p.streakY * Math.PI * 2);
          const wv = 0.5 + 0.5 * Math.sin(v * p.streakY * Math.PI * 2);
          hv = Math.max(wu, wv) * 0.7 + base * 0.3;
          break;
        }
        case 'strand': {
          const drift = fbm(u, v, 3, 3, 3, s + 6) - 0.5;
          hv = fbm(u + drift * 0.25, v, 2, p.streakY, 3, s) * 0.85 + base * 0.15;
          break;
        }
        default:
          hv = base;
      }

      h[i] = hv;
      // Grain darkens where the height is low: grime settles in crevices.
      const mottle = fbm(u, v, 3, 3, 3, s + 13);
      g[i] = clamp(0.30 + 0.72 * hv * (0.75 + 0.5 * mottle), 0, 1);
    }
  }

  const data = new Uint8Array(n * 4);
  const amp = p.relief * size * 0.011;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = ((x - 1) + size) % size, xp = (x + 1) % size;
      const dx = (h[y * size + xp] - h[y * size + xm]) * amp;
      const dy = (h[yp * size + x] - h[ym * size + x]) * amp;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + 1) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = Math.round(g[y * size + x] * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;   // this is data, not art — no sRGB decode
  tex.needsUpdate = true;
  tex.name = `slyDetail_${p.kind}`;
  return tex;
}

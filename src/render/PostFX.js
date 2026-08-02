import * as THREE from 'three';
import { Blit, makeRT, sizeRT, killRT, passMaterial, GLSL_VIEW, GLSL_NOISE, GLSL_AGX, GLSL_SRGB } from './passes/Common.js';
import { AOPass } from './passes/AO.js';

/**
 * PostFX — owns the final image.
 *
 * Engine calls `render()` instead of doing a plain scene render, so if this throws the screen
 * goes black. Every stage is therefore wrapped: on any failure we drop the chain and present
 * the raw scene, and say so once in the warnings.
 *
 * Order: scene (HDR) → normals → AO → ink edges → bloom pyramid → composite (tonemap,
 * grade, vignette, grain) → FXAA.
 *
 * Tone mapping happens exactly once, in the composite, so the renderer's own tone mapping is
 * turned off for the scene pass — otherwise everything is transformed twice and washes out.
 */

const TUNE = {
  /* --- ink lines (AGENTS.md §2.1: the interior creases the hull shells can't give us) --- */
  edgeDepth: 1.05,        // depth discontinuity sensitivity, view-distance normalised
  edgeNormal: 0.62,       // normal discontinuity sensitivity (cos threshold)
  edgeThickness: 1.5,     // px, before the depth weighting below
  // §2.1.2 + §7.3: line weight must vary with depth. Near geometry inks at 1.8x the base
  // width, the far field at 0.7x, so a foreground corner reads heavier than a distant wall
  // instead of every edge in frame carrying the same hairline.
  edgeNearMul: 1.8,
  edgeFarMul: 0.70,
  edgeNearZ: 7,           // m — full weight closer than this
  edgeFarZ: 55,           // m — minimum weight beyond this
  edgeFadeStart: 45,      // m — lines thin out with distance so the far field isn't a black mess
  edgeFadeEnd: 190,
  inkWarm: 0x1a1210,      // §2.1: lit-side line colour, a warm near-black
  inkCool: 0x161022,      // shadow-side line colour, violet
  // Was 0.60. At that weight a line on a lit surface measured #44241c — a smear of the
  // surface, not ink. The mask is already antialiased, so the softness of a line should come
  // from the mask, not from letting the surface show through the middle of it. 0.95 puts the
  // core of a line on the specified §2.1.2 colour and leaves a trace of the surface so it
  // never reads as a flat stamp.
  inkStrength: 0.95,

  /* --- silhouette rim (§2.1.5) ---
     Device pixels, measured inward from the silhouette in the depth buffer. The band has to
     start clear of the ink and be wide enough to survive it: a character's inverted-hull
     shell writes depth, so the outermost ~2.5 px of its silhouette are ink before the
     screen-space crease pass adds its own — measured at 6 px of black on Sly's arm at 960
     wide. Architecture has only the thin crease line, so it keeps almost the whole band. */
  /* Halved from 2.4 / 4.4 / 7.2. Those radii were set against a close-up figure, and the
     canonical shots mostly are not one: Sly is 138 px tall in `night`, 115 in `temple`. His
     inverted-hull shell writes ~2.5 px of ink and the crease pass adds its own, so at that
     size a band reaching 7.2 px inward spent most of its width under the ink and the rest
     across the middle of a limb — which is a wash, not a rim, and it is why the lit edge was
     measuring *darker* than the body interior.

     Measured on the two shots whose A/B is byte-exact (determinism 0), both halves of the
     target moved the right way at once: character rim lift `temple` 4.3 -> 9.0 and `night`
     -4.7 -> -1.2, while the leftover bright-cool above the no-rim floor *fell* — `temple`
     3697 -> 1482, `night` 337 -> 168, `hero` paving 1138 -> 586. Narrower is not a
     compromise here; the outer half of the old band was contributing artefact, not read. */
  rimInner: 1.2,
  rimMid: 2.6,
  rimOuter: 4.4,
  rimTail: 0.45,          // strength of the far half of the band
  rimStrength: 0.70,
  /* Planarity gate on the rim mask — see slyBackStep. A depth *step* is not a silhouette; a
     floor running to a wall makes a bigger one than the obelisk against the sky does. These
     are thresholds on the second difference of inverse depth, which is exactly zero across
     any plane: 0.04 is roughly a ledge against a floor 3 m behind it at 20 m, 0.20 is a
     clean silhouette against something far enough back to read as background. The third
     number is the strength of the gate; 0 restores the old ungated mask.

     **Measured on the six shots that had never been checked** (`shots/rim1`, one boot, gates
     A/B'd live so every variant of a shot shares its geometry, camera and staging). The metric
     that matters is not the loose "bright and cool" count — quote the one that also requires
     the rim to have LIFTED the pixel, because `courtyard`'s sky is cream cloud on blue, sits at
     B == R, and turns a sub-perceptual nudge into 8610 counted pixels at a mean lift of 13
     while the overlay traces cloud filaments a rim term cannot reach. Visible bright-cool
     pixels away from any ink line, gateoff -> base:

       interior 1028 -> 0     combat 7816 -> 8     temple 53 -> 10
       traversal 104 -> 28    night  511 -> 181    courtyard 239 -> 236

     So five of six are clean and two are unfinished business — but NEITHER residual belongs
     to this pass, and an earlier version of this comment said otherwise. Attributed by
     variant differencing on the rim1 frames (scratchpad/plinth2.mjs, task #8a):

       courtyard 236 = 145 px of cloud drift at the top frame edge (the norim control was
       captured ~45 s after base, the sky moved, and the control's cool test sits at L150
       exactly where the zenith sky lands — a metric artefact, not an image defect: the
       drifted pixels' signature is +44R/-6B, a cream cloud edge, not a rim) + 73 px on the
       plinth lip + 18 scattered. On the lip, `surfonly` is bit-identical to `base` and
       `screenonly` is identical to `norim` (box mean add 0.1/0.3/0.3 — nothing): the pale
       band is entirely the SURFACE fresnel rim, which is scene-linear and goes through AgX.
       On saturated warm stone (135,65,40) a cool scene add lands as +3R +73G +105B display —
       R is on the AgX shoulder, G/B ride the steep mid — and the lip turns pale grey
       (138,138,145). `night`'s streak decomposes the same way: base 181 / surfonly 60 /
       screenonly 0 visible px in the streak box. This pass's rim, alone, crosses zero
       artefact thresholds on both shots. The lever for the lip is the surface rim's
       scene-space colour handling (ToonMaterial), not rimStrength / rimTail here.

     One thing this pass does NOT do, and it shows up at night: uRimLit is a constant. PostFX
     has no time-of-day hook of any kind, so the screen-space rim is `#7fd4ff` in all ten shots,
     while the surface rim's colour is clock-driven (`Atmosphere.evalAtmosphere` lerps rimCool
     -> rimWarm `#ff9a5c` by nightAmount, LIGHTING passes it, ToonMaterial takes it as an
     override). §2.2 asks for the warm variant at night. On `night`'s residual pixels the added
     light measures B-R = +5.9 for this pass and +10.7 for the surface term, so neither is
     currently landing warm — flagged with numbers rather than changed, because it moves the
     look of a shot rather than fixing a defect. */
  rimPlanar: [0.04, 0.20, 1.0],

  /* --- ledger #31: exempt the SUBJECT from the planar gate above ---
     Fraction of the planar gate waived on pixels the normal prepass marks as a skinned
     subject. 0 = shipped behaviour, exactly (the mix collapses); 1 = the subject is gated
     only by the depth-step mask, as it was before `rimPlanar` existed.

     **The measurement this knob was built on has been WITHDRAWN. Do not raise it on the
     strength of the paragraph below.** Kept, at 0, and the reasoning kept with it, because the
     mechanism is still a coherent thing to test — but its evidence is gone and it now has none.

     Why this was thought to exist. `rimPlanar` asks "is the neighbourhood one surface", and
     answers no only where inverse depth stops being affine. That is the right question for a
     floor and the wrong question for a character standing on one: in `temple` Sly is on the
     nave floor with the floor running away behind him, so the background a few pixels past his
     silhouette is very nearly the continuation of a plane through him, the gate reads "still
     one surface", and it shuts on the one silhouette in the frame that §2.1.5 most wants
     separated. Measured (RESULT-rim3 §3): temple subject mean rim lift 30.31 ungated -> 8.91
     shipped, 29.4% retained, against 65.8-124% on the other five shots.

     Why that is withdrawn. rim3 §3 reached it by construction from a chain of shader readings,
     and its reference leg `gateoff` moves TWO knobs at once, so it never isolated this gate.
     gate5 moved them one at a time: `planaroff` turns this gate off EVERYWHERE and moves the
     character by **±0.4 L** (temple 3.77 -> 3.70, sly-closeup 2.92 -> 3.98 against a base2 of
     3.41, hero 4.40 -> 4.68). A gate costing 21.4 L of subject rim cannot also be worth 0.4 L
     when switched off. The retraction is recorded at `ToonMaterial.js` `rimMagExempt` and at
     `toon.glsl.js` `rimSil`; **this was the third site and it did not get updated with them**,
     which is §7's "when a bug has a shape, grep for the shape" arriving from the other side —
     one retraction, three sites, two of them fixed. A knob whose justification has been
     retracted at two of its three call sites reads, at the third, exactly like a live finding.

     Why not just relax the thresholds: already measured and declined. RESULT-task8c ran
     `planarlo [0.015, 0.09, 1]` on `interior`, the same close-background case, for -1.7 pts
     against a required +1.5 — "the depth ratios, not the thresholds, are what starves the
     screen rim here". The gate is answering its own question correctly; the subject is simply
     not what it was built to police.

     It cannot re-admit what the gate is for. The paving, the dune ripples and the wall/ground
     contacts that motivated `rimPlanar` are all static geometry, so their subject mask is 0
     and the mix is the identity there — off-subject pixels are bit-identical by construction,
     not by tuning. That is the acceptance, and it is checked as bit-identity rather than
     asserted. Same shape and same population as ToonMaterial's `rimSkinExempt`, which waives
     the *surface* gate's convexity half on the same `USE_SKINNING` set. */
  rimSubjExempt: 0.0,

  // The shadow side keeps 45% of the lit side's strength — enough that a dark silhouette
  // always separates, little enough that the light still reads as coming from one direction.
  rimShadowFloor: 0.45,
  rimLit: 0x7fd4ff,       // §2.2 RIM, the key's complement
  rimShade: 0x6fa8d8,     // §2.2 FILL sky bounce — the shadow side is lit by sky, not by sun

  /* --- normal-prepass membership (ledger #26) ---
     Who is allowed to write into the normal buffer that AO and the crease pass read.

     The irony is worth recording rather than smoothing over: the block at the normal pass
     below already documents this exact contamination family as *fixed* — but only for the
     inverted-hull ink shells. The same argument was never extended to the two other
     populations that have no business defining a surface normal, so the fix reads as
     complete while two thirds of the class is still live:

       - the sky dome, which is not a surface at all;
       - the transparent queue — shafts, veils, particles, decals — which are volumetric
         or additive. `overrideMaterial` replaces their material outright, so blend mode,
         `depthWrite: false` and alpha all vanish and a light shaft renders as an opaque
         wall of normals sitting in mid-air. AO then occludes against it and the crease pass
         draws an ink line round a beam of light.

     Two knobs, not one, because their acceptance criteria are OPPOSITE and folding them
     together would make the bit-identical half unfalsifiable — the precise failure shape
     §8 records for the two rim terms ("if you are eliminating *the rim*, say which of the
     two"):

       - `prepassSkipSky` MUST be bit-identical in all ten shots. `Sky.js` builds the dome
         `side: BackSide` while the override is FrontSide, so every dome triangle is already
         back-face culled and hiding it can only remove a draw, never a pixel. If a frame
         moves, that reading is wrong and this knob is the thing that says so.
         Scope is the DOME ONLY, and that is load-bearing: `sky.birds` shares the name prefix
         but is `DoubleSide`, so it rasters and hiding it is a real change. It belongs to the
         transparent knob below. Widening this one back to `/^sky\./` re-breaks the
         acceptance in both directions at once — see the note at the gate site.
       - `prepassSkipTransparent` MUST change the frame where transparent geometry sits near
         an AO-relevant surface, and must not change it anywhere else. A gate that changes
         nothing at all would mean it is not reaching the queue it targets.

     Both default OFF so the shipped chain is unchanged and the A leg of that A/B is exact.
     This is a correctness gate, not a budget one: the geometry involved is ≤3k triangles. */
  prepassSkipSky: false,
  prepassSkipTransparent: false,

  /* --- ambient occlusion composition ---
     Occlusion darkens *toward the shadow hue*, never toward grey (§2.1.3). aoDepth is how
     dark a fully-occluded crease goes; aoStrength is how much of the AO buffer is believed,
     kept well under 1 because the baked aoMaps still carry part of the same term. */
  aoStrength: 0.62,
  aoDepth: 0.42,
  aoTint: 0x2a3f66,
  /* Task #19: blend of aoTint toward §2.2 TURQUOISE #2fa8a0 before the peak-normalise.
     tintColor() normalises by the peak channel, so #2a3f66 arrives at the shader as
     (0.174, 0.383, 1.0) — a multiplier that starves G relative to B on every occluded
     pixel. On warm albedo (R > G) that is the magenta-corridor arithmetic from task #16
     acting inside the AO composite: R survives via the albedo, B is fed, G has no
     champion. The shadow LIGHT got its G lifted in 07fe98c; this tint is the same hex and
     never did. 0 = bit-identical legacy (lerp at 0 is exact); the A/B pokes tune live —
     the composite re-reads it every frame. Modelled in scratchpad/t19corridor.mjs; ships
     only with PREREG-task19.md's frame verdict. */
  aoTintTeal: 0.0,

  /* --- bloom ---
     §7.3 wants "a tight coloured halo on bright things", not a wash. At threshold 1.02 with
     six mips, every sunlit limestone face in a golden-hour frame cleared the bar and the
     whole pyramid contributed, so the bloom was a low-frequency milky veil over the top of
     the image — which is precisely the "grey wash" the critic logged on three shots. The
     sun disc runs at 26x and gold spec well above 2x, so 1.55 still lets everything that
     should glow, glow; five mips keeps the halo tight instead of screen-wide.

     1.55 -> 2.20, knee 0.45 -> 0.30 (feed onset T-k: 1.10 -> 1.90). The 1.55 rationale above
     underestimated what a fully keyed DIFFUSE surface reaches: at tod 0.80 the key radiance
     is (3.29, 2.27, 1.15) (evalAtmosphere x keyBoost 1.0, live values), so any near-white
     albedo at the top ramp band lands at scene 2.4-2.9 — Sly's sclera at 2.59, sunlit
     limestone at 2.89 — and at onset 1.10 all of it fed the pyramid (sclera w=0.40,
     limestone w=0.51). That is the residue of the same "grey wash" class the 1.02 -> 1.55
     move was fixing, and on cap2/sly-closeup it is what washed the pupil ring to L162 and
     drew the halo on the fur around two already-saturated eyes.

     What this change does NOT claim: it does not fix the eye hierarchy inversion. Measured
     offline against the exact AgX+grade chain (scratchpad/bloomcalc.mjs, validated against
     the captured frame: predicted sclera body no-bloom L224 / with-bloom ~236 vs measured
     p50 226 / max 234), the sclera displays at ~L224 with bloom OFF entirely — the blow-out
     is scene radiance on the AgX shoulder (alb 0.79 x keyRad 3.29 = 2.59), owned by the eye
     material, not by this pass. The "diffuse white lands ~L191" premise came from the L-table
     in the splitRange comment below, whose top end this measurement contradicts (see report).

     Client table at the new values, w(scene maxch) old -> new: sun disc 26 [0.94 -> 0.91],
     gold spec glints ~6.8 [0.77 -> 0.67], torch flame 3.0 [0.48 -> 0.375], ember 2.4
     [0.35 -> 0.14], sparkle cores 1.4-2.5 [taper, authored halo geometry unaffected],
     sclera 2.59 [0.40 -> 0.145, and 0 once any sclera tint lands it below 1.9], sunlit
     limestone 2.89 [0.51 -> 0.30]. Every wanted client keeps >=40% of its feed; the bright-
     diffuse class loses 60-70%. Verified in-frame in shots/bloom1 (base / bloomold /
     bloomoff, one boot). */
  bloomThreshold: 2.20,
  bloomKnee: 0.30,
  bloomIntensity: 0.50,
  bloomMips: 5,

  /* --- grade --- */
  // Was lifted to 1.45 to fight darkness that turned out to be the AO feedback bug below.
  // With that fixed the lift became a double correction and blew the stone out to white,
  // which is what AgX then desaturated into pale lavender.
  exposure: 0.95,
  contrast: 1.08,
  /* AgX desaturates hard; the sandstone has to be pushed back. **But this is applied BEFORE
     the tonemap** (line ~541, `c = mix(vec3(l), c, uSaturation)`, with `slyAgX` at ~554), so it
     buys chroma in the shadows and cannot buy any in the highlights — pushing a channel further
     up the curve before the curve compresses it makes the top-end collapse slightly worse, not
     better. Measured on the shipped frames, mean HSV saturation by luma band:

       night      L<40 0.669   40-80 0.655   80-120 0.350   120-160 0.234   >160 0.083
       courtyard  L<40 0.385   40-80 0.370   80-120 0.436   120-160 0.383   >160 0.144

     `night` loses half its chroma above L=80 and is effectively white above 160, which is the
     "the deck reads daylit" report: it is not the lighting, it is that the brighter side of the
     seam has no colour left to say what lit it. The same cliff is in `courtyard` but it starts
     two bands later and lands on 24.5% of the frame rather than 0.3%, so it reads as sun.

     What this measurement does NOT establish: whether AgX desaturated those pixels or they
     arrived desaturated. Separating the two needs a capture with the grade bypassed, which has
     not been taken — so the lever (post-AgX chroma restore vs. moving `uSaturation` to display
     space) is a proposal, not a conclusion. Do not tune it from this comment alone.

     **The "move `uSaturation` to display space" half of that proposal is now MEASURED AND
     REFUTED — it makes a live defect worse.** CHARACTER reported a red-channel crush on the
     character (`clothDark` authored R/G 0.342, delivered 0.013) and read it as "a saturation
     multiply driving red negative and clamping". `mix(vec3(l), c, 1.30)` genuinely does go
     negative below `(1 - 1/s)*l = 0.23077*l`, and the `max(c, 1e-6)` on the contrast line
     genuinely does amputate it — so the hypothesis matches the signature exactly. It is still
     not the cause. Traced stage by stage (`scratchpad/redstage.mjs`), `shirtDark` under a cool
     light leaves the saturation multiply at red **+9.01e-5, positive**, and is zeroed two stages
     later by AgX's own `SLY_REC2020_TO_SRGB * color` followed by its `clamp(color, 0.0, 1.0)`:
     red arrives at **-0.00885** and is clipped. Neutralising `uSaturation` entirely leaves it at
     **-0.00234** — still negative, still clipped, still display red 0.

     So this knob is an AGGRAVATOR with a measured share, not the cause. Over the character's 9
     authored materials x 22 light levels, pixels with display red pinned at 0:

       saturation 1.30 -> 17.7%    1.20 -> 13.1%    1.10 -> 7.1%    1.00 -> 5.1%

     and only 9% of the pinned cases have red driven negative by the saturation multiply at all.
     **Do not cut this value on that evidence**: it would spend chroma over the whole frame —
     the thing §2.2 and §7.3 ask for — to buy back a fraction of one channel on 0.59% of one
     shot, and §3 records what tuning a knob at the wrong end of a chain costs here.

     And the reason the display-space move is refuted rather than merely unhelpful: applying the
     same multiply AFTER AgX operates on an already-clipped value and destroys MORE information.
     Sweeping the scene red at fixed G,B and counting distinct outputs over 7 inputs
     (`scratchpad/redinfo.mjs`) — 7 = fully invertible, 1 = all information gone:

       shipped (pre-AgX sat, hard clip)   3
       luminance-preserving gamut map     5
       saturation moved after AgX         2      <- worse than shipped

     The real fix is a gamut map in place of that hard clamp, and it is **not in this file** —
     `GLSL_AGX` lives in `passes/Common.js`. Routed there with the patch and its no-op proof:
     blending toward the pixel's own luminance by exactly enough to lift the minimum channel to
     0 is bit-identical on all 26,632 in-gamut grid samples (worst delta 0 bytes), so it cannot
     regress a pixel the clip was not already firing on. Note it does NOT restore red — the
     colour is genuinely outside sRGB by then — it recovers the information into blue.

     In-frame extent, so nobody re-derives it (`scratchpad/pinned.mjs`, shipped bytes, no model):
     `sly-closeup` 5407 px (0.59%), `hero` 334, `night` 126, `guard` 47, `interior` 28,
     `combat` 0 — and **red is the only channel ever pinned; G and B are pinned on zero pixels
     in every frame checked**, which is what the asymmetry of the rec2020->sRGB red row
     (-0.5876 G, -0.0728 B) predicts. Marked on the frame it is exactly `clothDark` and the
     darkest `tailDark`: boots, gloves, brim. It is NOT what makes the tail read as blotches —
     the tail profiles at 0-6% pinned — and it is not why the character reads blue, since the
     architecture in the same frame sits at R/G 1.55-1.65 warm while every character surface is
     B-max. That part is the light reaching him, not this chain.

     An earlier version of this comment blamed the `courtyard` plinth band on the silhouette
     rim being added AFTER `slyLinearToSrgb` ("no headroom left, so it clips toward white").
     DECIDED, with the rim1 frames as evidence (task #8a): the display-space placement stays,
     and the premise was a misattribution. Measured, the screen rim contributes 0.1/0.3/0.3
     mean display units in the plinth box and zero artefact pixels there and in `night`'s
     streak — the pale band is the SURFACE rim, which is already added before the encode, in
     scene-linear, and that placement is precisely what produces the band (see the rimPlanar
     comment above). Moving THIS rim pre-encode was evaluated by arithmetic on the captured
     pairs with the screen term isolated against `surfonly` (scratchpad/plinth3.mjs, proof:
     re-applying the current formula reproduces the captured base at mean |err| 0.2-0.5):
     `premap` recreates the surface rim's failure shape and inflates the edge-rim population
     +25.6% / +58.5% / +28.6% on courtyard / night / temple — night worst, the shot that can
     least afford a rim recalibration — while the artefact counts stay flat or worsen (night
     visFlat 183 -> 206). Display-space caps (`mixcap`/`headcap`) trade 8-10% of the edge
     population for no artefact change, because this rim's contribution to the residuals is
     already zero. The bounded `rim*amt*(1-c)` wrap below is the correct form for a
     display-space add and is kept. */
  saturation: 1.30,
  lift: [0.006, 0.004, 0.010],     // open the toe just enough to keep shadow detail (§7.3)
  // Warm the highlights — but the blue leg was pulled to 0.95, which is a 5% cut on every
  // blue in the frame including the sky. The warm/cool split is meant to come from the
  // palette, not from throwing blue away globally.
  gain: [1.035, 1.0, 0.985],
  splitShadow: 0x2a3f66,           // §2.2 shadow hue
  splitHighlight: 0xffd9a0,        // §2.2 sun
  /* Task #19: blend of splitShadow toward §2.2 TURQUOISE #2fa8a0. The cool leg is built
     from splitShadow at unit luminance — #2a3f66 gives per-channel (0.914, 0.999, 1.265):
     it cuts R, feeds B and leaves G alone, which KNOWN_ISSUES §8 already names as "the
     term actually making green the darkest channel". On the terminator-corridor population
     (partial warm key crossfading with teal shadow — the centre of mass of temple's
     233-256 shadow violet; the shot holds ~43% of its visible architecture inside a
     terminator soft window) this is the strongest single lever in this file: the corridor
     model (scratchpad/t19corridor.mjs, cross-validated on the t16ab base/teal15 pair)
     moves the corridor pixel 25-35 deg at blend 0.30-0.50 where the fill lever at maximum
     buys 7-14. Night is the binding constraint (ledger: 210-235, sat not falling; model
     says -5 deg, -1% sat at 0.30) and goes FIRST in the capture. 0 = bit-identical legacy;
     the A/B pokes tune live. Ships only with PREREG-task19.md's frame verdict. */
  splitShadowTeal: 0.0,
  // 0.22 -> 0.16. The split is hue-only and correct in direction, but at 0.22 it pulled the
  // whole mid-tone range warm — and the daylight sky lives in the mid-tones, so it was
  // eating a measurable part of the zenith blue that §2.3's warm/cool tension depends on.
  splitStrength: 0.16,
  /* Where the split crosses over from the shadow tint to the highlight tint, in SCENE-LINEAR
     luma — the space the composite tests, not display luma. Hoisted out of the shader because
     it is the term that decides whether this is a warm/cool *split* at all, and it was a pair
     of literals nobody could A/B.

     [0.08, 0.72] -> [0.04, 0.24]. The old pair was not a split at all, it was a global cool
     cast, and the reason is the space it is measured in. Transcribing this file's own grade
     chain (contrast about 0.18, then AgX, then the sRGB encode) and evaluating it exactly:

       scene-linear l   0.02   0.05   0.08   0.18   0.35   0.50   0.72   1.00   2.00
       display L        39     69     88     126    159    176    192    205    227

     (Grey axis, whole composite minus AO/rim/ink/vignette. This row REPLACES an earlier one
     that read 29/60/78/112/139/153/165/175/188 — that calibration was never validated against
     a rendered pixel, and when one finally existed it missed by 27-33 L at the top: Sly's
     sclera at scene 2.59 renders at p50 218 / max 228.5 with bloom disabled
     (shots/bloom1/sly-closeup-bloomoff, fixed ROI), where the old row predicts ~191 for
     scene >= 2. The replacement row is transcribed independently in scratchpad/bloomcalc.mjs
     and reproduces that frame to within a few L. Two conclusions below survive recalibration
     UNCHANGED — the old 0.72 crossover now maps even higher (L192, not L165), so "the old
     pair was a cool filter" only strengthens; and the new band still spans the shadow/lit
     boundary (0.04 -> L61, 0.24 -> L140 around the measured L~100 seam). Anything else quoting
     the old row — including the L191 "fully keyed diffuse white" figure that reached a task
     brief — inherits the error.)

     The old crossover therefore finished at ~L192 — above the 99th percentile of every
     daylight frame measured. AgX is extremely compressive at the top, which is what made a
     scene-linear number this large look reasonable. Measured over whole frames,
     fraction taking >=85% of the COOL leg vs >=85% of the warm leg:

                    old [0.08,0.72]        new [0.04,0.24]
       hero          86.4% / 8.2%           71.7% / 15.1%
       temple        84.2% / 3.1%           63.1% / 21.9%
       courtyard     47.1% / 31.2%          34.1% / 55.2%

     A warm/cool split whose warm leg reaches 3.1% of `temple` is a cool filter with extra
     steps, and it is a second, independent cause of the lavender that KNOWN_ISSUES §3
     describes — the first being the shadow-light mix, which is a different file.

     The new midpoint is not a taste call: it is anchored on the measured shadow/lit boundary.
     `courtyard` reads shadow L69.2 against lit L130.3 (53.1% ratio), so the tonal boundary
     between them is L~100, and [0.04, 0.24] puts a->L61, midpoint->L114, b->L140 (calibrated
     row above; the pre-recalibration figures were 51/101/124) — the ramp still spans the
     shadow-to-lit transition instead of sitting above the whole image.

     STATUS: VERIFIED IN FRAME (task #8b), and the history of how it got there is kept
     because an earlier version of this comment overstated a weaker state. The tables above
     are ARITHMETIC — the grade chain transcribed and evaluated against captured frames. The
     leg-balance table in shots/rim1/ANALYSIS.txt is also not an A/B of this change: it
     evaluates candidate crossovers against each frame's luma distribution. The direct read
     (scratchpad/splitread.mjs) differences the captured `base` [0.04,0.24] against
     `splitold` [0.08,0.72] pairs from the one-boot rim1 run, per pixel, banded by display
     luma. Result, all three shots agreeing with the pre-registered shape: delta(R-B) is
     ~0 below L55 (both ranges fully cool), rises to +18.1 (temple) / +17.7 (interior) /
     +12.6 (courtyard) at L90-110, and returns to ~0 by L190 (both fully warm), with band
     luma stable (|dL| <= 1 on temple/courtyard — the split is hue-only, as designed).
     Caveat that stays attached: `interior`'s bands above L130 are flicker-confounded
     (torch FX, 4.31% of px excluded at |dL|>40, dL to -17 in those rows) and are evidence
     about nothing; its verdict rests on the mid bands (~850k px). Frames eyeballed: base
     visibly warmer through the sunlit mid-tones on temple and courtyard, no other change.

     A correction to a correction, kept because the full history is the lesson. An earlier
     version of this comment computed 0.72 -> L192; a later pass "corrected" that to L165 and
     wrote that L192 "was simply miscomputed, and it is repeated in commit ee28427's message".
     The frame measurement above settles it the other way: the ORIGINAL L192 was right, the
     correction was the miscomputation, and it then seeded the L191 sclera premise two tasks
     downstream. Neither figure had been checked against a rendered pixel when it was written;
     both were asserted with equal confidence. The conclusion both were serving is unaffected
     (0.72 is far above frame content either way). Separately, the cool-leg fractions quoted
     in ee28427 (88.7 / 99.9) versus the table above (86.4 `hero` / 99.3 `interior`) are not a
     correction — they are the same statistic on different captures, and both say the same
     thing.

     One caveat on that arithmetic, since it is the basis for the change: the display->scene-
     linear step inverts AgX on the neutral axis, which is exact for greys and approximate for
     saturated colour. Round-tripped against real palette colours, the error INSIDE the
     crossover band 0.04..0.24 is 1.1-1.3% for stone and 6.7% worst case (gold). Far above the
     band, at display L>190, it reaches 88% — so this model must not be used to reason about
     highlights, only about where the crossover sits. */
  splitRange: [0.04, 0.24],

  /* --- finishing --- */
  vignette: 0.16,                  // was compounding with dark shadows into a black frame
  // Chromatic aberration: OFF. Measured at roughly a pixel of R-vs-B split in the outer
  // third of a 1280-wide frame, which is a coloured fringe on the outside of every
  // high-contrast edge. §2.1 and §7.3 ask for ink lines; nothing in the bible asks for a
  // lens. In a game whose edges are supposed to read as *drawn*, a channel split on those
  // edges is the exact "this is a post-processed render" tell the critic called out.
  chroma: 0.0,
  grain: 0.016,           // static dither; the only thing keeping the sky gradient off bands
};

/* ─────────────────────────────── shaders ─────────────────────────────── */

const EDGE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform vec2  uTexel;
uniform vec4  uParams;     // depthSens, normalSens, thickness, unused
uniform vec2  uFade;       // fadeStart, fadeEnd (metres)
uniform vec4  uWeight;     // nearMul, farMul, nearZ(m), farZ(m)
uniform vec4  uRimRadius;  // inner, mid, outer band radius in px; w = tail weight
uniform vec3  uRimPlanar;  // planarity gate: lo, hi, strength (0 = off, legacy behaviour)
uniform float uRimSubjExempt; // ledger #31: waive the planar gate on the skinned subject
uniform vec3  uKeyDirView; // unit vector toward the key light, view space
${GLSL_VIEW}

/**
 * How much further away the neighbourhood at radius 'o' is than this pixel, as a 0..1 mask.
 *
 * Asymmetric on purpose — 'zMax - z0', not '|zMax - zMin|' — so it answers "is there
 * background behind me?" and therefore only ever fires on the *near* side of a silhouette.
 * A pixel on the background sees neighbours that are nearer, not further, and gets nothing.
 * Sky reads as the far plane, so an edge against open sky is the strongest case of all.
 */
vec2 slyBackStep( vec2 uv, float z0, vec2 o ) {
  float a = slyLinearZ( texture2D( uDepth, uv + vec2(  o.x,  o.y ) ).x );
  float b = slyLinearZ( texture2D( uDepth, uv + vec2( -o.x, -o.y ) ).x );
  float c = slyLinearZ( texture2D( uDepth, uv + vec2(  o.x, -o.y ) ).x );
  float d = slyLinearZ( texture2D( uDepth, uv + vec2( -o.x,  o.y ) ).x );
  float zMax = max( max( a, b ), max( c, d ) );

  /* y: how many of the four taps are background, 0..1.
   *
   * This is what tells an edge from a wire. Three pixels inside the silhouette of a mass —
   * an obelisk, a shoulder — roughly half the neighbourhood is still the object, so the
   * fraction sits near 0.5. On a *thin* element the band is as wide as the element and every
   * tap lands off it, so the fraction goes to 1 and the whole strip lights up rather than its
   * edge. That is what put a bright line along the kerb at the wall/ground junction in
   * 'guard': not a contact being brightened, but an 8 px ledge being rimmed on both sides at
   * once, which is indistinguishable from one. A rim marks the edge of a mass. */
  float rel = 1.0 / max( 0.35, z0 );
  float frac = 0.25 * (
      step( 0.05, ( a - z0 ) * rel ) + step( 0.05, ( b - z0 ) * rel )
    + step( 0.05, ( c - z0 ) * rel ) + step( 0.05, ( d - z0 ) * rel ) );
  /* The threshold is a *relative* depth step, and it is deliberately much coarser than the
     ink pass's: §2.1.5 asks the rim to separate a silhouette from the background, not to
     outline every ledge. At 0.012 (the crease pass's sensitivity) a 25 cm course step at
     20 m qualified, and the rim touched 22% of the pixels in 'hero' — decoration, not
     lighting. At 0.05..0.16 it takes a step of 1-3 m at that distance, which is the obelisk
     against the sky, Sly against the wall behind him, a ledge against the courtyard floor. */
  float mask = smoothstep( 0.05, 0.16, ( zMax - z0 ) * rel );

  /* ...and a step that large is not enough on its own, because a *floor* produces one.
   *
   * A ground plane running away from a standing camera has an enormous depth gradient: the
   * last few pixels before it meets a wall cover tens of metres, so 'zMax - z0' clears any
   * threshold set for silhouettes and this pass rims the contact. That is half of the bright
   * cool line the critic measured at the wall/ground junction in 'guard' — the other half
   * was the surface fresnel (see toon.glsl.js), and with that one fixed this is what was
   * left: a band at L=111 lying between a wall at L=59 and a floor at L=60.
   *
   * The distinction the pass actually wants is *discontinuity*, not steepness, and there is
   * an exact test for it. Under a perspective projection, INVERSE depth is an affine
   * function of screen position across any plane — so for two taps either side of a pixel,
   * 1/a + 1/b - 2/z0 is identically zero on a plane at any grazing angle whatsoever, and
   * only departs from zero where the neighbourhood stops being one surface. Positive means
   * the far side falls away faster than a plane would, which is a silhouette with background
   * behind it; negative means it comes back toward the eye, which is a concave contact and
   * must never rim. Depth is stored as a function of 1/z, so this costs no precision.
   *
   * uRimPlanar.z = 0 restores the old ungated behaviour for A/B. */
  float w0 = 1.0 / max( z0, 1e-4 );
  float bend = max(
    ( 2.0 * w0 - 1.0 / max( a, 1e-4 ) - 1.0 / max( b, 1e-4 ) ) / w0,
    ( 2.0 * w0 - 1.0 / max( c, 1e-4 ) - 1.0 / max( d, 1e-4 ) ) / w0 );
  /* Ledger #31. The normal prepass writes 1-isSkinned into alpha (ToonMaterial's
     normalMaterial), so subj is 1 on the character and 0 on everything else, including sky
     and any pixel the prepass never wrote. Sampled at the centre tap only: the exemption is
     a property of the pixel being shaded, not of its neighbourhood, and widening it to the
     taps would let a subject pixel exempt the background *behind* the silhouette — which is
     the flat ground the gate is there to protect.
     uRimSubjExempt = 0 collapses the inner mix to uRimPlanar.z and is bit-identical. */
  float subj = 1.0 - texture2D( uNormal, uv ).a;
  mask *= mix( 1.0, smoothstep( uRimPlanar.x, uRimPlanar.y, bend ),
               uRimPlanar.z * ( 1.0 - uRimSubjExempt * subj ) );

  return vec2( mask, frac );
}

void main() {
  float d0 = texture2D( uDepth, vUv ).x;
  if ( slyIsSky( d0 ) ) { gl_FragColor = vec4( 0.0 ); return; }

  float z0 = slyLinearZ( d0 );

  // Line weight by depth. §7.3 fails a shot for "outlines uniform-thickness regardless of
  // depth", and this pass was sampling at one fixed pixel offset everywhere, so the near
  // obelisk corner and the far wall carried an identical hairline. A hand-inked frame gets
  // heavier on what is close: near geometry samples wider, distant geometry narrower.
  float weight = mix( uWeight.x, uWeight.y, smoothstep( uWeight.z, uWeight.w, z0 ) );
  vec2 o = uTexel * uParams.z * weight;

  // Roberts cross on depth, in metres and normalised by view distance: a 5 cm step matters
  // at 2 m and is invisible at 80 m, so a fixed threshold would either miss near creases or
  // outline every distant polygon.
  float dA = slyLinearZ( texture2D( uDepth, vUv + vec2(  o.x,  o.y ) ).x );
  float dB = slyLinearZ( texture2D( uDepth, vUv + vec2( -o.x, -o.y ) ).x );
  float dC = slyLinearZ( texture2D( uDepth, vUv + vec2(  o.x, -o.y ) ).x );
  float dD = slyLinearZ( texture2D( uDepth, vUv + vec2( -o.x,  o.y ) ).x );
  float dEdge = ( abs( dA - dB ) + abs( dC - dD ) ) / max( 0.35, z0 );
  // These thresholds were ~10x too sensitive: a 0.3% relative depth step fired a line, so
  // every course of masonry got inked and the architecture read as a circuit board. Creases
  // worth drawing are real steps in the form, not block joints the texture already shows.
  float depthLine = smoothstep( 0.030 * uParams.x, 0.075 * uParams.x, dEdge );

  // Normal discontinuity catches creases between coplanar-depth faces — a wall meeting a
  // wall at 90 degrees has almost no depth step at the corner but a hard normal step.
  vec3 n0 = slyDecodeNormal( texture2D( uNormal, vUv ).xyz );
  vec3 nA = slyDecodeNormal( texture2D( uNormal, vUv + vec2(  o.x,  o.y ) ).xyz );
  vec3 nB = slyDecodeNormal( texture2D( uNormal, vUv + vec2( -o.x, -o.y ) ).xyz );
  vec3 nC = slyDecodeNormal( texture2D( uNormal, vUv + vec2(  o.x, -o.y ) ).xyz );
  vec3 nD = slyDecodeNormal( texture2D( uNormal, vUv + vec2( -o.x,  o.y ) ).xyz );
  float nEdge = ( 1.0 - dot( nA, nB ) ) + ( 1.0 - dot( nC, nD ) );
  // Only genuine corners, not the chamfers and facets every block carries. 0.55 is roughly
  // a 60-degree fold; below that the shading already separates the surfaces.
  float normalLine = smoothstep( 0.55, 0.55 + ( 1.0 - uParams.y ) * 0.75, nEdge );

  // A normal step alone still fires on every masonry joint in a flat wall, which inked the
  // architecture into a circuit board. Require the normal fold to be corroborated by at
  // least a hint of depth step, so creases mark real folds in the form while the block
  // joints are left to the texture, which already draws them.
  float corroborate = smoothstep( 0.004, 0.020, dEdge );
  float line = max( depthLine, normalLine * corroborate );

  /* Keep only the near side of a silhouette.
   *
   * §2.1.2: an ink line is dark and *inside* the shape. A Roberts cross is symmetric, so
   * every depth step used to paint a band straddling the boundary — half of it landing on
   * whatever was *behind* the object. That outer half is the "halo outside the edge" the
   * critic saw: a smear of the foreground's line lying on the background, which is exactly
   * what a Photoshop edge filter does and an ink line never does.
   *
   * Where the 4-tap neighbourhood is nearly coplanar we are on an interior crease, not a
   * silhouette, and both sides should ink — so the gate is applied in proportion to how
   * much of a real depth step this is. */
  float zMin = min( min( dA, dB ), min( dC, dD ) );
  float zMax = max( max( dA, dB ), max( dC, dD ) );
  float span = zMax - zMin;
  float silhouette = smoothstep( 0.010, 0.060, span / max( 0.35, z0 ) );
  float side = ( z0 - zMin ) / max( 1e-5, span );          // 0 = nearest, 1 = furthest
  float nearSide = 1.0 - smoothstep( 0.30, 0.70, side );
  line *= mix( 1.0, nearSide, silhouette );

  // Thin the lines out with distance rather than cutting them, or the transition pops.
  float distFade = 1.0 - smoothstep( uFade.x, uFade.y, z0 );
  line *= distFade;

  /* ---- silhouette rim mask (§2.1.5, §7.3 "No rim light separating silhouettes") ----
   *
   * The fresnel rim in the surface shader can only rim a form whose normal turns toward
   * grazing at its own edge. That is true of Sly and false of every piece of architecture in
   * the game: a box's face normal is constant right up to the silhouette, so fres never
   * rises and the term is mathematically zero there. The critic measured exactly that — the
   * 'courtyard' obelisk against open sky has no rim on *either* edge, lit or shadowed, while
   * Sly's curved key-lit edge carries a clean 2 px cyan band.
   *
   * Depth knows what the normal doesn't. The band between two silhouette masks at different
   * radii is a strip of fixed pixel width lying just *inside* the object's outline —
   * geometry-independent, so a flat pylon face rims exactly as readily as a shoulder.
   *
   * The inner radius also keeps the rim clear of the ink: hull shells write depth, so the
   * silhouette in the depth buffer sits at the *outside* of a character's 2.5 px ink line,
   * and starting the band beyond that puts the light inside the line where it belongs rather
   * than painting over it.
   */
  vec2 rimIn  = slyBackStep( vUv, z0, uTexel * uRimRadius.x );
  vec2 rimMid = slyBackStep( vUv, z0, uTexel * uRimRadius.y );
  vec2 rimOut = slyBackStep( vUv, z0, uTexel * uRimRadius.z );
  // A thin element is background on every side at once; rim its edge, not its whole width.
  float thin = smoothstep( 0.60, 0.95, rimMid.y );
  // Three radii, not two: the near half of the band is full strength and the far half is a
  // tail, so the light falls off inward instead of stopping dead. A hard-edged stripe of
  // constant brightness reads as a sticker; this reads as light bending round the form.
  float rim = ( clamp( rimMid.x - rimIn.x, 0.0, 1.0 )
              + clamp( rimOut.x - rimMid.x, 0.0, 1.0 ) * uRimRadius.w )
            * distFade * ( 1.0 - thin );

  /* Which way the key is, in this pixel — the wrap-from-the-lit-side rule, applied in screen
     space. The composite turns this into brightness and colour, never into an on/off gate:
     a rim that switches off on the shadow side is the defect this pass exists to fix. */
  vec3 nView = slyDecodeNormal( texture2D( uNormal, vUv ).xyz );
  float lit = smoothstep( -0.35, 0.45, dot( nView, uKeyDirView ) );

  gl_FragColor = vec4( line, rim, lit, 1.0 );
}
`;

const BRIGHT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uThreshold;   // threshold, knee
void main() {
  vec3 c = texture2D( uScene, vUv ).rgb;
  float l = max( c.r, max( c.g, c.b ) );
  // Soft knee, so a surface drifting past the threshold ramps in instead of snapping on.
  float k = uThreshold.y;
  float soft = clamp( l - uThreshold.x + k, 0.0, 2.0 * k );
  soft = soft * soft / ( 4.0 * k + 1e-5 );
  float w = max( soft, l - uThreshold.x ) / max( l, 1e-5 );
  gl_FragColor = vec4( c * w, 1.0 );
}
`;

/** 13-tap downsample (COD/Jimenez): stable under motion, no boxy pumping. */
const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D( uSrc, vUv + t * vec2( -2.0, 2.0 ) ).rgb;
  vec3 b = texture2D( uSrc, vUv + t * vec2(  0.0, 2.0 ) ).rgb;
  vec3 c = texture2D( uSrc, vUv + t * vec2(  2.0, 2.0 ) ).rgb;
  vec3 d = texture2D( uSrc, vUv + t * vec2( -2.0, 0.0 ) ).rgb;
  vec3 e = texture2D( uSrc, vUv                        ).rgb;
  vec3 f = texture2D( uSrc, vUv + t * vec2(  2.0, 0.0 ) ).rgb;
  vec3 g = texture2D( uSrc, vUv + t * vec2( -2.0,-2.0 ) ).rgb;
  vec3 h = texture2D( uSrc, vUv + t * vec2(  0.0,-2.0 ) ).rgb;
  vec3 i = texture2D( uSrc, vUv + t * vec2(  2.0,-2.0 ) ).rgb;
  vec3 j = texture2D( uSrc, vUv + t * vec2( -1.0, 1.0 ) ).rgb;
  vec3 k = texture2D( uSrc, vUv + t * vec2(  1.0, 1.0 ) ).rgb;
  vec3 l = texture2D( uSrc, vUv + t * vec2( -1.0,-1.0 ) ).rgb;
  vec3 m = texture2D( uSrc, vUv + t * vec2(  1.0,-1.0 ) ).rgb;
  vec3 o = e * 0.125;
  o += ( a + c + g + i ) * 0.03125;
  o += ( b + d + f + h ) * 0.0625;
  o += ( j + k + l + m ) * 0.125;
  gl_FragColor = vec4( o, 1.0 );
}
`;

/** Tent-filter upsample, additive into the coarser mip. */
const UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 o = texture2D( uSrc, vUv + vec2( -t.x,  t.y ) ).rgb * 1.0;
  o += texture2D( uSrc, vUv + vec2(  0.0,  t.y ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv + vec2(  t.x,  t.y ) ).rgb * 1.0;
  o += texture2D( uSrc, vUv + vec2( -t.x,  0.0 ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv                      ).rgb * 4.0;
  o += texture2D( uSrc, vUv + vec2(  t.x,  0.0 ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv + vec2( -t.x, -t.y ) ).rgb * 1.0;
  o += texture2D( uSrc, vUv + vec2(  0.0, -t.y ) ).rgb * 2.0;
  o += texture2D( uSrc, vUv + vec2(  t.x, -t.y ) ).rgb * 1.0;
  gl_FragColor = vec4( o / 16.0, 1.0 );
}
`;

const COMPOSITE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uEdge;
uniform sampler2D uAO;
uniform sampler2D uDepth;
uniform vec2  uTexel;
uniform float uTime;
uniform float uExposure, uContrast, uSaturation;
uniform float uBloomIntensity, uSplitStrength, uVignette, uChroma, uGrain;
uniform vec2  uSplitRange;
uniform float uAOEnabled, uEdgeEnabled, uBloomEnabled, uInkStrength;
uniform float uAOStrength, uAODepth, uRimStrength, uRimShadowFloor;
uniform vec3  uLift, uGain, uSplitShadow, uSplitHighlight, uInkWarm, uInkCool;
uniform vec3  uAOTint, uRimLit, uRimShade;
${GLSL_VIEW}
${GLSL_NOISE}
${GLSL_AGX}
${GLSL_SRGB}

const float SLY_PIVOT = 0.18;   // scene-linear middle grey; the contrast pivot

void main() {
  // Radial chromatic aberration. uChroma is 0 by default (see TUNE) — the taps collapse to
  // the same texel and this costs nothing, but the plumbing stays so it can be dialled back
  // in deliberately rather than re-derived.
  vec2 fromCentre = vUv - 0.5;
  float r2 = dot( fromCentre, fromCentre );
  vec2 ca = fromCentre * uChroma * r2 * 4.0;
  vec3 scene;
  scene.r = texture2D( uScene, vUv + ca ).r;
  scene.g = texture2D( uScene, vUv ).g;
  scene.b = texture2D( uScene, vUv - ca ).b;

  // AO — coloured, not grey, and gentle.
  //
  // It previously scaled occlusion by how *dark* the pixel already was, meaning shadowed
  // areas received maximum occlusion — a feedback loop straight to black that crushed the
  // bottom two-thirds of the frame and tripped §7.3's "shadows crush to zero detail".
  // Occlusion is a property of the geometry, not of the pixel's current brightness.
  //
  // What it still did wrong: multiply the whole image by a neutral scalar. That is two
  // mistakes at once. Occlusion is *ambient* occlusion — attenuating direct sunlight with it
  // is the classic way to make a cel-shaded surface read as dirty PBR — and a neutral
  // multiply drags an occluded pixel toward grey, while §2.1.3 says shadow is never grey.
  // AO.js has documented the intent since it was written ("tints it toward the §2.2 shadow
  // hue rather than toward grey"); this is the composite finally honouring it. The tint is
  // normalised against its peak channel (see tintColor) so occlusion can only ever subtract
  // light, and the strength stays well under 1 because the baked aoMaps carry part of the
  // same term.
  if ( uAOEnabled > 0.5 ) {
    float ao = texture2D( uAO, vUv ).r;
    float occ = ( 1.0 - ao ) * uAOStrength;
    scene *= mix( vec3( 1.0 ), uAOTint * uAODepth, occ );
  }

  if ( uBloomEnabled > 0.5 ) {
    scene += texture2D( uBloom, vUv ).rgb * uBloomIntensity;
  }

  /* ---- grade, still in linear HDR ---- */
  vec3 c = scene * uExposure;
  c = max( vec3( 0.0 ), c + uLift * ( 1.0 - c ) );
  c *= uGain;

  // Split-tone toward the palette's complementary pair. Normalised so the tint shifts hue
  // without changing brightness — multiplying by a dark blue like #2a3f66 (as this did) both
  // darkened and desaturated the whole frame toward lavender, which is why the sandstone
  // stopped reading as warm stone.
  float l = slyLuma( c );
  vec3 tone = mix( uSplitShadow, uSplitHighlight, smoothstep( uSplitRange.x, uSplitRange.y, l ) );
  tone /= max( 1e-4, slyLuma( tone ) );      // hue only, unit luminance
  c = mix( c, c * tone, uSplitStrength );

  c = mix( vec3( l ), c, uSaturation );

  // Contrast about a mid-grey PIVOT, in log space — not (c - 0.5) * k + 0.5.
  //
  // This is still linear HDR, where 0.5 is not middle grey, so the old form was really a
  // flat −0.04 offset on every channel followed by a clamp. It silently amputated whole
  // channels out of anything dark: the §2.2 shadow hue #2a3f66 came out of the grade as
  // #00358c — red exactly zero — which is both "shadows crush to zero detail" and the
  // reason the night frames read as pure blue. A power about 0.18 is monotone, never
  // reaches zero, and leaves the hue alone.
  c = SLY_PIVOT * pow( max( c, vec3( 1e-6 ) ) / SLY_PIVOT, vec3( uContrast ) );

  /* ---- tonemap: exactly once, here. Exposure is already folded in above, so pass 1. ---- */
  c = slyAgX( c, 1.0 );
  // AgX returns linear sRGB. Nothing downstream encodes for us — a ShaderMaterial writing to
  // the canvas doesn't get three.js's output conversion — so do it here, once.
  c = slyLinearToSrgb( c );

  /* ---- silhouette rim, before the ink so a line still reads as a line -----------------
     §2.1.5 calls the rim "the single biggest AAA tell" and §7.3 fails a shot without one;
     nine of the ten pass-2 frames failed it. The mask comes from the edge pass (see there
     for why this cannot be done from the surface shader on flat-faced architecture).

     Two rules:

     1. It wraps from the lit side but never gates to zero. Amplitude and colour both follow
        N.L — the key's cool complement at full strength where the sun grazes the silhouette,
        the dimmer sky blue on the shadow side. A rim that exists only where the key already
        lights the surface does no separation work, which is precisely what the critic
        measured on Sly (2 px of #6093ac lit, +8 luma shadowed).

     2. '(1 - c)' rather than a straight add. It is a soft light-wrap: bounded, so it can
        never blow a lit surface to white, and strongest exactly where separation is scarcest
        — a dark silhouette on a dark background, which is the 'night' and 'traversal' case. */
  vec4 edge = texture2D( uEdge, vUv );
  if ( uEdgeEnabled > 0.5 && uRimStrength > 0.0 ) {
    vec3 rimCol = mix( uRimShade, uRimLit, edge.b );
    float amt = edge.g * uRimStrength * mix( uRimShadowFloor, 1.0, edge.b );
    c += rimCol * amt * ( 1.0 - c );
  }

  /* ---- ink lines ------------------------------------------------------------------
     Composited HERE, after slyAgX and after slyLinearToSrgb, so a line is a line and not
     something the tonemapper can bloom back open.

     Two rules this pass now obeys, and did not:

     1. The ink uniforms arrive already in DISPLAY space (see displayColor() in the module
        below). They used to be THREE.Color values, which colour management stores as
        *linear* — so mixing them into an image that had already been sRGB-encoded applied
        #1a1210 as if it were 0.010/0.006/0.005, i.e. effectively #030201. §2.1.2 says the
        lines are a warm brown and a dark violet and explicitly not pure black; §7.3 fails a
        shot for #000000 outlines. They were failing it.

     2. The contribution is strictly SUBTRACTIVE. Mixing toward a fixed colour brightens
        anything darker than that colour, which is how a night frame with crushed darks got
        drawn back in as glowing wireframe. A per-channel min() makes it arithmetically
        impossible for this pass to add light to any pixel, in any channel, ever.  */
  if ( uEdgeEnabled > 0.5 ) {
    float line = edge.r;
    float lum = slyLuma( c );
    // Don't ink what's already dark. A black line on a near-black surface adds nothing but
    // noise, and it was a large part of why the shadowed half of the frame turned to mush.
    line *= smoothstep( 0.05, 0.20, lum );
    // Warm ink where the surface is lit, violet ink where it's in shadow (§2.1).
    vec3 ink = min( mix( uInkCool, uInkWarm, smoothstep( 0.12, 0.55, lum ) ), c );
    c = mix( c, ink, clamp( line, 0.0, 1.0 ) * uInkStrength );
  }

  /* ---- finishing ---- */
  float vig = 1.0 - uVignette * smoothstep( 0.18, 0.95, r2 * 2.0 );
  c *= vig;

  // Dither in display space kills banding in the sky gradient, which is the one place an
  // 8-bit framebuffer visibly fails on a scene like this. Deliberately static per pixel,
  // not animated: the screenshot critic compares frames across commits and needs a still
  // frame to be bit-identical every time it renders.
  c += ( slyIGN( gl_FragCoord.xy ) - 0.5 ) * uGrain;

  gl_FragColor = vec4( c, 1.0 );
}
`;

const FXAA_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
void main() {
  vec3 rgbNW = texture2D( uSrc, vUv + vec2( -1.0, -1.0 ) * uTexel ).rgb;
  vec3 rgbNE = texture2D( uSrc, vUv + vec2(  1.0, -1.0 ) * uTexel ).rgb;
  vec3 rgbSW = texture2D( uSrc, vUv + vec2( -1.0,  1.0 ) * uTexel ).rgb;
  vec3 rgbSE = texture2D( uSrc, vUv + vec2(  1.0,  1.0 ) * uTexel ).rgb;
  vec3 rgbM  = texture2D( uSrc, vUv ).rgb;

  float lNW = luma( rgbNW ), lNE = luma( rgbNE );
  float lSW = luma( rgbSW ), lSE = luma( rgbSE ), lM = luma( rgbM );
  float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
  float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );

  if ( lMax - lMin < 0.06 * lMax ) { gl_FragColor = vec4( rgbM, 1.0 ); return; }

  vec2 dir = vec2( -( ( lNW + lNE ) - ( lSW + lSE ) ), ( ( lNW + lSW ) - ( lNE + lSE ) ) );
  float dirReduce = max( ( lNW + lNE + lSW + lSE ) * 0.25 * 0.03125, 1.0 / 128.0 );
  float rcpDirMin = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + dirReduce );
  dir = clamp( dir * rcpDirMin, -8.0, 8.0 ) * uTexel;

  vec3 rgbA = 0.5 * ( texture2D( uSrc, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb
                    + texture2D( uSrc, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
  vec3 rgbB = rgbA * 0.5 + 0.25 * ( texture2D( uSrc, vUv - dir * 0.5 ).rgb
                                  + texture2D( uSrc, vUv + dir * 0.5 ).rgb );
  float lB = luma( rgbB );
  gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );
}
`;

/* ─────────────────────────────── module ─────────────────────────────── */

/**
 * A palette hex as raw 0..1 sRGB components — no linearisation.
 *
 * `new THREE.Color(0x1a1210)` does NOT give you 0x1a/255: colour management treats the hex
 * as sRGB and stores the *linear* equivalent, which is ~6x darker. That is exactly right for
 * anything multiplied into scene radiance and exactly wrong for anything mixed into an image
 * that has already been encoded for display — the ink lines, which land after the tonemap.
 * Getting this backwards turned every §2.1.2 ink colour into near-#000000.
 */
function displayColor(hex) {
  return new THREE.Color(
    ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255
  );
}

/**
 * Rescale a colour so its brightest channel is exactly 1.
 *
 * For a colour that will be *multiplied* into the image this is the only safe normalisation:
 * it guarantees the multiply darkens every channel and brightens none, so the tint can never
 * add light. Normalising to unit *luminance* instead — the obvious choice, and the one the
 * split-tone correctly uses because it is a hue rotation — would hand #2a3f66 a blue
 * coefficient of 2.65, and an occlusion term that brightens blue in the deepest creases is
 * the sign error that put a cyan line at the `guard` frame's wall/ground contact.
 */
function tintColor(col) {
  const m = Math.max(col.r, col.g, col.b);
  return m > 1e-4 ? col.multiplyScalar(1 / m) : col;
}

/* Task #19 scratch: the two shadow-side tint colours are rebuilt from tune every frame so
   splitShadowTeal / aoTintTeal are live-pokeable for one-boot A/Bs (the scalar tune block
   below already works that way; the colours were constructor-only, which is exactly the
   "knob you cannot A/B costs capture cycles" trap TUNE exists to avoid). Hoisted per §5. */
const _turqTint = new THREE.Color(0x2fa8a0);   // §2.2 TURQUOISE — same target 07fe98c used
const _splitScratch = new THREE.Color();
const _aoScratch = new THREE.Color();

export class PostFX {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.blit = new Blit();
    this.tune = { ...TUNE };
    this.ok = false;
    this._complained = false;

    this.size = { w: 1, h: 1, hw: 1, hh: 1 };

    this.passes = {
      ao: { enabled: true }, edge: { enabled: true },
      bloom: { enabled: true }, grade: { enabled: true }, fxaa: { enabled: true },
    };

    /* Raw-scene bypass for shader-term visualisers. Off = every pass runs as normal. */
    this._debugRaw = false;

    /** Uniforms shared with sub-passes (AOPass reads these by reference). */
    this.shared = {
      uDepth: { value: null },
      uNormal: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uNearFar: { value: new THREE.Vector2(0.1, 4000) },
    };

    this._rts = [];
    this._mats = [];
    engine.on('resize', () => this.setSize());
    engine.on('quality', () => this.setSize());
  }

  async init() {
    try {
      const { width: w, height: h } = this._pixelSize();
      const samples = this.engine.settings.msaa || 0;

      this.sceneRT = this._rt(makeRT(w, h, {
        type: THREE.HalfFloatType, depthTexture: true, samples, name: 'postfx.scene',
      }));
      this.normalRT = this._rt(makeRT(w, h, { depth: true, name: 'postfx.normal' }));
      this.edgeRT = this._rt(makeRT(w, h, { depth: false, name: 'postfx.edge' }));
      this.gradeRT = this._rt(makeRT(w, h, { depth: false, name: 'postfx.grade' }));

      // Bloom pyramid, half-res down. Six mips at 1080p bottoms out around 16 px, which is
      // wide enough for a convincing glow without the whole screen turning into a haze.
      this.bloomRTs = [];
      let bw = w >> 1, bh = h >> 1;
      for (let i = 0; i < this.tune.bloomMips; i++) {
        this.bloomRTs.push(this._rt(makeRT(Math.max(2, bw), Math.max(2, bh), { depth: false, name: `postfx.bloom${i}` })));
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      }

      this.edgeMat = this._mat(passMaterial('postfx.edge', {
        uDepth: this.shared.uDepth, uNormal: this.shared.uNormal,
        uProjInv: this.shared.uProjInv, uNearFar: this.shared.uNearFar,
        uTexel: { value: new THREE.Vector2() },
        uParams: { value: new THREE.Vector4() },
        uFade: { value: new THREE.Vector2() },
        uWeight: { value: new THREE.Vector4() },
        uRimRadius: { value: new THREE.Vector4(this.tune.rimInner, this.tune.rimMid, this.tune.rimOuter, this.tune.rimTail) },
        uRimPlanar: { value: new THREE.Vector3(...this.tune.rimPlanar) },
        uRimSubjExempt: { value: this.tune.rimSubjExempt },
        uKeyDirView: { value: new THREE.Vector3(0, 0, 1) },
      }, EDGE_FRAG));

      this.brightMat = this._mat(passMaterial('postfx.bright', {
        uScene: { value: null }, uThreshold: { value: new THREE.Vector2() },
      }, BRIGHT_FRAG));

      this.downMat = this._mat(passMaterial('postfx.down', {
        uSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      }, DOWN_FRAG));

      this.upMat = this._mat(passMaterial('postfx.up', {
        uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 },
      }, UP_FRAG));
      this.upMat.blending = THREE.AdditiveBlending;

      this.compositeMat = this._mat(passMaterial('postfx.composite', {
        uScene: { value: null }, uBloom: { value: null }, uEdge: { value: null },
        uAO: { value: null }, uDepth: this.shared.uDepth,
        uProjInv: this.shared.uProjInv, uNearFar: this.shared.uNearFar,
        uTexel: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uExposure: { value: this.tune.exposure },
        uContrast: { value: this.tune.contrast },
        uSaturation: { value: this.tune.saturation },
        uBloomIntensity: { value: this.tune.bloomIntensity },
        uSplitStrength: { value: this.tune.splitStrength },
        uSplitRange: { value: new THREE.Vector2(...this.tune.splitRange) },
        uVignette: { value: this.tune.vignette },
        uChroma: { value: this.tune.chroma },
        uGrain: { value: this.tune.grain },
        uAOEnabled: { value: 1 }, uEdgeEnabled: { value: 1 }, uBloomEnabled: { value: 1 },
        uInkStrength: { value: this.tune.inkStrength },
        uAOStrength: { value: this.tune.aoStrength },
        uAODepth: { value: this.tune.aoDepth },
        uRimStrength: { value: this.tune.rimStrength },
        uRimShadowFloor: { value: this.tune.rimShadowFloor },
        // Occlusion is applied while the image is still linear, so the tint stays linear —
        // normalised against its peak channel so it can only ever darken (see tintColor).
        uAOTint: { value: tintColor(new THREE.Color(this.tune.aoTint)) },
        // The rim lands after slyLinearToSrgb, alongside the ink, so it is display-space.
        uRimLit: { value: displayColor(this.tune.rimLit) },
        uRimShade: { value: displayColor(this.tune.rimShade) },
        uLift: { value: new THREE.Vector3(...this.tune.lift) },
        uGain: { value: new THREE.Vector3(...this.tune.gain) },
        // Split-toning happens while the image is still linear, so these two stay linear.
        uSplitShadow: { value: new THREE.Color(this.tune.splitShadow) },
        uSplitHighlight: { value: new THREE.Color(this.tune.splitHighlight) },
        // The ink is mixed in AFTER slyLinearToSrgb, so it must be display-space.
        uInkWarm: { value: displayColor(this.tune.inkWarm) },
        uInkCool: { value: displayColor(this.tune.inkCool) },
      }, COMPOSITE_FRAG));

      this.fxaaMat = this._mat(passMaterial('postfx.fxaa', {
        uSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      }, FXAA_FRAG));

      /* The bypass half of `debugRaw()`. Deliberately the shortest shader in the file: one
         texture fetch, no encode, no clamp beyond what the 8-bit canvas does on its own.
         A ShaderMaterial writing to the canvas gets no output colour-space conversion from
         three (the same fact COMPOSITE_FRAG relies on when it calls slyLinearToSrgb itself),
         so a value of v in `sceneRT` lands at round(255*v) and a visualiser's numbers survive
         to the PNG. */
      this.rawMat = this._mat(passMaterial('postfx.raw', {
        uSrc: { value: null },
      }, `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uSrc;
        void main() { gl_FragColor = vec4( texture2D( uSrc, vUv ).rgb, 1.0 ); }
      `));

      if (this.engine.settings.ssao) {
        this.ao = new AOPass(this);
        await this.ao.init();
      }

      // PostFX owns tone mapping from here on: the composite pass applies AgX exactly once.
      // Leaving the renderer's own tone mapping on would transform the image twice and wash
      // it out; toggling it per frame would recompile every shader every frame.
      this._prevToneMapping = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;

      this.setSize();
      this.ok = true;
    } catch (err) {
      this.engine.warn(`postfx: init failed, falling back to direct rendering — ${err?.message || err}`);
      console.error('[postfx] init failed', err);
      this.ok = false;
    }
  }

  _pixelSize() {
    const pr = this.renderer.getPixelRatio();
    return { width: Math.max(1, Math.round(this.engine.width * pr)), height: Math.max(1, Math.round(this.engine.height * pr)) };
  }

  _rt(rt) { this._rts.push(rt); return rt; }
  _mat(m) { this._mats.push(m); return m; }

  setSize() {
    if (!this.sceneRT) return;
    const { width: w, height: h } = this._pixelSize();
    this.size = { w, h, hw: Math.max(1, w >> 1), hh: Math.max(1, h >> 1) };

    sizeRT(this.sceneRT, w, h);
    sizeRT(this.normalRT, w, h);
    sizeRT(this.edgeRT, w, h);
    sizeRT(this.gradeRT, w, h);
    let bw = w >> 1, bh = h >> 1;
    for (const rt of this.bloomRTs) {
      sizeRT(rt, Math.max(2, bw), Math.max(2, bh));
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
    }

    const texel = new THREE.Vector2(1 / w, 1 / h);
    this.edgeMat.uniforms.uTexel.value.copy(texel);
    this.compositeMat.uniforms.uTexel.value.copy(texel);
    this.fxaaMat.uniforms.uTexel.value.copy(texel);
    this.ao?.setSize();
  }

  setEnabled(name, on) {
    if (this.passes[name]) this.passes[name].enabled = !!on;
  }

  /**
   * Present the raw linear scene target, skipping AO, ink, bloom, the composite (exposure,
   * lift, gain, split-tone, saturation, contrast, AgX, sRGB encode) and FXAA.
   *
   * This is not a look; it is the second half of a shader-term visualiser. KNOWN_ISSUES §1 is
   * the record of what a visualiser costs when it goes through the chain it is inspecting —
   * `debugShadow`'s channels rode AgX, a 1.30 saturation, a split-tone and a broken AO
   * multiply, came out uniformly green, and sent an investigation down eight dead ends. A term
   * painted by `shading.debugTerm(n)` and read through the normal chain would repeat that
   * exactly.
   *
   * Prove it before quoting anything read through it: `debugTerm(4)` writes (0.25, 0.50, 0.75)
   * and, with this on, the PNG must read (64, 128, 191).
   */
  debugRaw(on = true) {
    this._debugRaw = !!on;
  }

  update(dt, t) {
    if (!this.ok) return;
    this.compositeMat.uniforms.uTime.value = t;
  }

  /* ─────────────────────────── the frame ─────────────────────────── */

  render() {
    const { renderer, engine } = this;
    if (!this.ok) { renderer.setRenderTarget(null); renderer.render(engine.scene, engine.camera); return; }

    try {
      this._renderChain();
    } catch (err) {
      // A black screen is the worst possible failure, so degrade permanently and loudly-once.
      if (!this._complained) {
        this._complained = true;
        engine.warn(`postfx: render failed, falling back to direct rendering — ${err?.message || err}`);
        console.error('[postfx] render failed', err);
      }
      this.ok = false;
      // We took tone mapping off the renderer in init(); hand it back, or the direct-render
      // fallback presents an untonemapped image that reads as blown out and flat.
      renderer.toneMapping = this._prevToneMapping ?? THREE.AgXToneMapping;
      renderer.setRenderTarget(null);
      renderer.render(engine.scene, engine.camera);
    }
  }

  _renderChain() {
    const { renderer, engine, blit } = this;
    const cam = engine.camera;
    const scene = engine.scene;

    this.shared.uProj.value.copy(cam.projectionMatrix);
    this.shared.uProjInv.value.copy(cam.projectionMatrixInverse);
    this.shared.uNearFar.value.set(cam.near, cam.far);

    /* ---- 1. scene, linear HDR ----
       Tone mapping was disabled permanently in init(), not toggled per frame: flipping
       renderer.toneMapping mid-frame changes a shader define, which invalidates every
       cached program and recompiles the whole scene each frame. outputColorSpace is left
       alone entirely — when rendering to a target, three.js takes the encoding from the
       target texture's colorSpace, which makeRT already sets to NoColorSpace. */
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(scene, cam);

    this.shared.uDepth.value = this.sceneRT.depthTexture;

    /* ---- 1b. debugRaw: present the scene target and stop. See debugRaw() above. ----
       Placed immediately after the scene draw so that every later pass is skipped by control
       flow rather than by a uniform set to zero — a pass whose strength is 0 still runs, still
       samples, and still gets to clamp or resolve; skipping is the only thing that is
       provably nothing. */
    if (this._debugRaw) {
      this.rawMat.uniforms.uSrc.value = this.sceneRT.texture;
      blit.render(renderer, this.rawMat, null);
      return;
    }

    /* ---- 2. view-space normals, for AO and for the crease pass ---- */
    const needNormals = (this.passes.edge.enabled || (this.ao && this.passes.ao.enabled));
    if (needNormals) {
      /* SHADING publishes beginNormalPass()/endNormalPass() precisely for this, and this
       * pass was reaching past them straight to `normalMaterial`.
       *
       * What that cost: the inverted-hull shells are children of their host meshes and stay
       * visible, so they were being drawn into the normal buffer too. `overrideMaterial`
       * replaces the shell's material outright — including its BackSide and its clip-space
       * expansion — so each shell rendered as a front-facing copy sitting exactly on top of
       * its host, z-fighting it, and left a ragged band of wrong normals around every
       * outlined silhouette. The crease pass then read that band as a normal discontinuity
       * and drew a line hugging the silhouette a second time, on top of the hull shell that
       * was already there. That is the doubling: shell + screen-space crease on the same
       * edge, which is what turns a 2.5 px line into a fat smear.
       *
       * begin/endNormalPass() hides the shells for the duration. Paired in try/finally so a
       * throw here can never leave every outline in the game switched off. */
      const shading = engine.get('shading');
      const canGate = typeof shading?.beginNormalPass === 'function'
        && typeof shading?.endNormalPass === 'function';
      const normalMat = (canGate ? shading.beginNormalPass() : shading?.normalMaterial)
        ?? this._fallbackNormalMat();
      const prevOverride = scene.overrideMaterial;
      const prevBg = scene.background;

      /* Freeze the shadow maps across this pass.
       *
       * three.js uses `scene.overrideMaterial` for shadow-map rendering as well as for the
       * main pass. Without this, the normal pass re-renders every cascade's shadow map using
       * MeshNormalMaterial, writing normal-encoded colour where depth should be. The
       * composite then samples those corrupted maps and the depth comparison fails
       * everywhere, which presents as the entire scene being in shadow — no cast shadows,
       * no key light, flat ambient-only lighting.
       *
       * The scene pass above has already produced correct maps this frame; this pass only
       * needs geometry, never shadows. */
      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;

      /* Ledger #31. Alpha in this buffer is the subject mask, written INVERTED (1 = not the
         subject) so that every way of failing lands on "not the subject". Clearing to alpha 1
         is the last of those: a pixel no geometry covers must not read as a character. The
         RGB clear is untouched, and no consumer of `uNormal` reads alpha except the rim gate. */
      const prevClearAlpha = renderer.getClearAlpha();
      renderer.setClearAlpha(1.0);

      /* Ledger #26 — see `prepassSkipSky` / `prepassSkipTransparent` in TUNE. Same shipped
         mechanism as the shell gate above (hide for the duration, restore in `finally`),
         extended to the two other populations that cannot define a surface normal.
         Collected before the try so the restore list exists no matter where we throw. */
      const prepassHidden = [];
      if (this.tune.prepassSkipSky || this.tune.prepassSkipTransparent) {
        scene.traverse((o) => {
          if (!o.visible || !(o.isMesh || o.isInstancedMesh || o.isSkinnedMesh)) return;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          if (!m) return;
          /* `depthWrite === false` is part of the test rather than `transparent` alone:
             additive FX (shafts, sparkles) are the population that most needs excluding and
             several of them are opaque-flagged but non-depth-writing. */
          /* Narrowed from /^sky\./ deliberately. The bit-identical acceptance below rests on
             ONE property — the dome is `side: BackSide` (`Sky.js:559`) against a FrontSide
             override, so every one of its triangles is back-face culled and hiding it can
             remove a draw but never a fragment. `sky.birds` shares the name prefix and NOT
             that property: it is `DoubleSide` (`Sky.js:657`), so it does raster into the
             normal buffer and hiding it is a real change. Under the old regex the birds would
             have made a correct sky gate score as an acceptance violation, and a genuine dome
             difference could have hidden behind that expected-looking delta.
             The birds are not dropped from scope, they move to the knob whose acceptance is
             true of them: `transparent:true, depthWrite:false` (`Sky.js:658-659`) puts them in
             `prepassSkipTransparent`, whose criterion is "MUST change the frame".
             The side test is checked here rather than assumed, so that if the dome is ever
             reauthored FrontSide the gate stops claiming a zero it no longer has. */
          const isSky = o.name === 'sky.dome' && m.side === THREE.BackSide;
          const isVeil = m.transparent === true || m.depthWrite === false;
          if ((this.tune.prepassSkipSky && isSky) || (this.tune.prepassSkipTransparent && isVeil)) {
            o.visible = false;
            prepassHidden.push(o);
          }
        });
      }

      try {
        scene.overrideMaterial = normalMat;
        scene.background = null;
        renderer.setRenderTarget(this.normalRT);
        renderer.clear();
        renderer.render(scene, cam);
      } finally {
        for (const o of prepassHidden) o.visible = true;
        scene.overrideMaterial = prevOverride;
        scene.background = prevBg;
        renderer.setClearAlpha(prevClearAlpha);
        renderer.shadowMap.autoUpdate = prevShadowAuto;
        if (canGate) { try { shading.endNormalPass(); } catch { /* shells stay hidden at worst */ } }
      }
      this.shared.uNormal.value = this.normalRT.texture;
    }

    /* ---- 3. AO ---- */
    let aoTex = null;
    if (this.ao && this.passes.ao.enabled) aoTex = this.ao.render();

    /* ---- 4. ink creases ---- */
    if (this.passes.edge.enabled && needNormals) {
      const u = this.edgeMat.uniforms;
      u.uParams.value.set(this.tune.edgeDepth, this.tune.edgeNormal, this.tune.edgeThickness, 0);
      u.uFade.value.set(this.tune.edgeFadeStart, this.tune.edgeFadeEnd);
      u.uWeight.value.set(this.tune.edgeNearMul, this.tune.edgeFarMul,
        this.tune.edgeNearZ, this.tune.edgeFarZ);
      u.uRimRadius.value.set(this.tune.rimInner, this.tune.rimMid, this.tune.rimOuter, this.tune.rimTail);
      u.uRimPlanar.value.set(this.tune.rimPlanar[0], this.tune.rimPlanar[1], this.tune.rimPlanar[2]);
      u.uRimSubjExempt.value = this.tune.rimSubjExempt;

      /* The rim wraps from the lit side, so this pass needs to know where the key is. SHADING
         holds the one authoritative copy — LIGHTING pushes the sun into it every frame — and
         taking it from there rather than hunting the scene graph for a DirectionalLight is
         what keeps the screen-space rim and the surface rim agreeing about the sun.
         transformDirection normalises in place: no allocation. */
      this._shading ??= engine.get('shading');
      const keyDir = this._shading?.uniforms?.uKeyDir?.value;
      if (keyDir) u.uKeyDirView.value.copy(keyDir).transformDirection(cam.matrixWorldInverse);

      blit.render(renderer, this.edgeMat, this.edgeRT);
    }

    /* ---- 5. bloom pyramid ---- */
    if (this.passes.bloom.enabled && this.bloomRTs.length) {
      this.brightMat.uniforms.uScene.value = this.sceneRT.texture;
      this.brightMat.uniforms.uThreshold.value.set(this.tune.bloomThreshold, this.tune.bloomKnee);
      blit.render(renderer, this.brightMat, this.bloomRTs[0]);

      for (let i = 1; i < this.bloomRTs.length; i++) {
        const src = this.bloomRTs[i - 1];
        this.downMat.uniforms.uSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        blit.render(renderer, this.downMat, this.bloomRTs[i]);
      }
      // Additive tent upsample back up the chain — accumulates a wide, smooth halo.
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        const src = this.bloomRTs[i];
        this.upMat.uniforms.uSrc.value = src.texture;
        this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.upMat.uniforms.uRadius.value = 1.0;
        blit.render(renderer, this.upMat, this.bloomRTs[i - 1], false);
      }
    }

    /* ---- 6. composite: AO, bloom, grade, tonemap, ink, vignette, dither ---- */
    const cu = this.compositeMat.uniforms;
    cu.uScene.value = this.sceneRT.texture;
    cu.uBloom.value = this.bloomRTs[0]?.texture ?? null;
    cu.uEdge.value = this.edgeRT.texture;
    cu.uAO.value = aoTex;
    cu.uAOEnabled.value = aoTex && this.passes.ao.enabled ? 1 : 0;
    cu.uEdgeEnabled.value = this.passes.edge.enabled && needNormals ? 1 : 0;
    cu.uBloomEnabled.value = this.passes.bloom.enabled && this.bloomRTs.length ? 1 : 0;
    cu.uExposure.value = this.tune.exposure;
    cu.uContrast.value = this.passes.grade.enabled ? this.tune.contrast : 1;
    cu.uSaturation.value = this.passes.grade.enabled ? this.tune.saturation : 1;
    cu.uSplitStrength.value = this.passes.grade.enabled ? this.tune.splitStrength : 0;
    cu.uSplitRange.value.set(this.tune.splitRange[0], this.tune.splitRange[1]);
    // Task #19 teal-consistency blends. lerp at 0 is exact, so 0 = the pre-knob colours.
    cu.uSplitShadow.value.copy(_splitScratch.setHex(this.tune.splitShadow).lerp(_turqTint, this.tune.splitShadowTeal));
    cu.uAOTint.value.copy(tintColor(_aoScratch.setHex(this.tune.aoTint).lerp(_turqTint, this.tune.aoTintTeal)));
    cu.uInkStrength.value = this.tune.inkStrength;
    cu.uAOStrength.value = this.tune.aoStrength;
    cu.uAODepth.value = this.tune.aoDepth;
    cu.uRimStrength.value = this.passes.edge.enabled ? this.tune.rimStrength : 0;
    cu.uRimShadowFloor.value = this.tune.rimShadowFloor;
    cu.uBloomIntensity.value = this.tune.bloomIntensity;
    cu.uVignette.value = this.tune.vignette;
    cu.uChroma.value = this.tune.chroma;
    cu.uGrain.value = this.tune.grain;

    const last = this.passes.fxaa.enabled ? this.gradeRT : null;
    blit.render(renderer, this.compositeMat, last);

    /* ---- 7. FXAA, last so it antialiases the ink lines too ---- */
    if (this.passes.fxaa.enabled) {
      this.fxaaMat.uniforms.uSrc.value = this.gradeRT.texture;
      blit.render(renderer, this.fxaaMat, null);
    }

    renderer.setRenderTarget(null);
  }

  /** SHADING normally supplies this; stand one up if it hasn't loaded. */
  _fallbackNormalMat() {
    if (!this._normalFallback) {
      this._normalFallback = new THREE.MeshNormalMaterial({ name: 'postfx.normalFallback' });
      this._mats.push(this._normalFallback);
    }
    return this._normalFallback;
  }

  dispose() {
    if (this._prevToneMapping != null) this.renderer.toneMapping = this._prevToneMapping;
    for (const rt of this._rts) killRT(rt);
    for (const m of this._mats) m.dispose?.();
    this.ao?.dispose();
    this.blit.dispose();
    this._rts.length = 0;
    this._mats.length = 0;
  }
}

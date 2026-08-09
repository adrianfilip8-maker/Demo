import * as THREE from 'three';
import {
  createAtmosphereState, evalAtmosphere, PALETTE, SHADOW_FLOOR,
} from './Atmosphere.js';

/**
 * Lighting — the key light, the fill, the bounce, the shadow cascades, the torch pool,
 * and the published geometry of the clerestory light shafts.
 *
 * Design notes worth knowing before editing:
 *
 * · One sun, N shadow maps. three.js gives a DirectionalLight exactly one shadow map, so
 *   the cascades are N co-directional lights and a small patch to `lights_fragment_begin`
 *   that gates each light to its own slice of view depth. Without the gate, N lights at
 *   1/N intensity would give shadows 1/N as dark; with it, exactly one cascade lights any
 *   given fragment, so the shadow is full strength and the cascade seam is invisible.
 *
 * · Cascade frusta are fitted to a *bounding sphere* of the camera's frustum slice, not to
 *   its corners. A sphere is rotation-invariant, so the ortho box stops resizing as the
 *   camera turns — that plus texel snapping is what kills shadow crawl.
 *
 * · SHADING is the real consumer. It gets the key light, the ambient floor, the rim, and
 *   every cascade matrix/map through `setKeyLight()` once per frame.
 */

const TUNE = {
  /* Cascades */
  shadowNear: 0.5,
  /* 420 → 160. The 420 was "must reach the Great Pyramid at (−150, ·, −190) so it casts" —
     and the budget attribution (KNOWN_ISSUES §8) finally measured what that costs: the
     frustum-visible scene is *under* §1's 250-draw budget in every shot measured while
     `renderer.info` reports 4.5–5.4× that, and the bulk of the multiplier is the cascades
     re-drawing every caster in the level into shadow maps fitted around 420 m of slice.
     What the 420 bought: a pyramid shadow that, checked against the sun track, never lands
     in a canonical frame at all — at tod 0.76–0.83 the sun azimuth is 180–191°, so the
     pyramid's shadow travels due east and falls at z ≈ −190, 150 m north of the courtyard.
     At 160 the furthest architecture any shot resolves is still inside the shadowed range,
     the pyramids leave every cascade's ortho box (they still self-shade by N·L; they are
     84–86% hazed in every daylight framing), and geometry past 160 m samples outside the
     maps, which both shadow paths treat as unshadowed (three's `getShadow` frustum test;
     `csmShadow` delegates to it). To A/B the old behaviour in-page:
     `L.TUNE.shadowDistance = 420; L._rebuildForQuality()`. */
  shadowDistance: 160,
  /* 0 = uniform splits, 1 = logarithmic. 0.90 is the usual figure for a four-cascade rig,
     but `med` ships two, and at 0.90 that put the c0/c1 seam at 34 m — so everything past
     the near third of the courtyard fell into a cascade fitted to ±417 m, i.e. 41 cm shadow
     texels and a 61 cm normal bias. That is what made mid-ground shadows read as vague
     smudges rather than as edges. 0.78 was tuned against distance 420 (seam ~57 m on two
     cascades); at 160 it lands the med seam at ~25 m and the high splits at ~14.5 / 42 m,
     with every band's texel size the same or finer than before except the 42–96 m band,
     which moves from ~3.4 cm to ~13 cm — under 3 px of screen at the distances that band
     is viewed from, and inside what the PCF radius already blurs. */
  splitLambda: 0.78,
  cascadeFade: 3.2,         // metres of cross-fade between cascades
  radiusQuantum: 0.25,      // tidy the fitted radius; it is already camera-invariant
  /* Caster pad: how far behind a cascade's slice the ortho box reaches, to catch casters
     whose shadows fall *into* the slice. The old form (`radius·0.7 + 30`) scaled it off the
     cascade's own size, which is a proxy with the wrong shape twice over: a tiny near
     cascade got a pad too small for a 34 m pylon's golden-hour shadow (26 m of pylon at 22°
     is ~69 m of reach along the light — the old c0 caught its tip by 2 m of luck), and the
     giant far cascade got 190 m of depth it never needed. The pad a slice actually needs is
     `tallest caster above it / sin(sun elevation)`, which is what _fitCascades now computes
     from `casterCeiling` and the live key direction. */
  casterCeiling: 36,        // metres — tallest shadow-relevant caster (34 m inner pylon + margin)
  casterPadMin: 34,
  casterPadMax: 130,        // low-sun clamp; past this the missing shadows are off any frame
  maxCascadeMap: 2048,
  /* Static-caster shadow cache (ledger #20). 48 of the 61 casters are static (0.38M of
     0.447M expanded tris — see the census in RESULT-ledger20-casters.md); the cascades
     re-drawing all of them every frame is the bulk of the §1 pass multiplication that
     survives the 160 m distance fix. Per cached cascade the statics are rendered once into
     a private depth target and re-rendered ONLY when anything that could change their
     depth image changes (snapped box, key direction, a static's transform/visibility, the
     caster set, a rebuild — the full trigger list is enumerated at _updateShadowCache);
     every frame the cached depth is blitted into the live map and the ~13 dynamic casters
     (sly_root + guard_root subtrees) are drawn on top. c0 is left on the legacy path: its
     ~1.2 cm texels mean any camera walk refreshes it anyway.
     `shadowStaticCache: false` restores the stock three path bit-identically, live, no
     rebuild — it is the verification A/B lever and the failure valve (any throw in the
     cache flips it off and pushes a warning rather than costing the frame). */
  shadowStaticCache: true,
  shadowCacheFrom: 1,       // first cached cascade index; c0 stays per-frame
  /* PCF kernel radius per cascade, in shadow-map texels.
   *
   * The old name (`vsmRadius`) said this was VSM-only tuning and therefore dead, because
   * `Engine.js:63` forces `PCFShadowMap` — see KNOWN_ISSUES §1, where VSM was one of the
   * things that had to go. Checked against the three we actually ship rather than against
   * that assumption, and it is live: `WebGLLights.js:292` copies `shadow.radius` into
   * `shadowUniforms.shadowRadius` for every directional light unconditionally, and r185's
   * `SHADOWMAP_TYPE_PCF` branch of `getShadow()` uses it — `float radius = shadowRadius *
   * texelSize.x`, scaling a 5-tap Vogel disk rotated per pixel by interleaved gradient
   * noise. So this is the *only* penumbra knob in the renderer, and it is not dead.
   *
   * `blurSamples` next to it genuinely was dead: `WebGLShadowMap.js:379-382` is its sole
   * reader and that is inside the VSM blur pass, which never runs. Deleted rather than
   * left to imply that the number 10 means anything here.
   *
   * Five taps can only produce six distinct values, so the radius sets how many *pixels*
   * those six values are spread across. At 2.4 texels on cascade 0's ~5 cm texels that is
   * a ~12 cm penumbra, and `ToonMaterial`'s [0.10, 0.66] `shadowSharp` window then discards
   * the outer two levels — which is why the shadow term measures as effectively binary and
   * why `uShadowBands` has never had anything to quantise (bandsOn moved `night` by 2 px
   * of 423 644). Raising this is the cheap half of unlocking §7.3's banded-cel read; the
   * cost is that the 5-tap dither starts to show, so it is bracketed, not guessed. */
  shadowRadius: [2.4, 2.0, 1.7, 1.5],
  /* Acne is a texel-size problem, so the offset that fixes it has to be measured in
     texels — not in hand-picked constants that only work at one cascade width. */
  normalBiasTexels: 1.7,
  normalBiasClamp: [0.012, 1.4],
  depthBiasMetres: 0.06,    // converted to normalised depth per cascade at fit time

  /* Key / fill */
  keyBoost: 1.0,
  hemiBoost: 1.0,
  bounceBoost: 1.0,
  ambientBoost: 1.0,

  /* ── Enclosure ────────────────────────────────────────────────────────────────
     A sealed room is not lit by the sky, and right now it is: at `interior`'s tod 0.5 the
     tomb — twelve metres underground with a stone ceiling — gets hemi 1.02 and an ambient
     floor of 0.586, i.e. the full open-desert midday fill. That is wrong on its own terms and
     this term exists to correct it.

     **It was also, plausibly but wrongly, held to be the cause of the critic's "the room is
     lit flat and uniformly … no falloff, no warm pool". It is not.** The measurement is below.
     Read it before spending a capture cycle here.

     `encloseStrength` is how much of the sky fill a fully-roofed camera loses.

     **It has now been bracketed on `interior`, and it stays 0, because it is connected and
     it is not the cause.** Forcing the enclosure to 1 (which is what the fan really measures
     from that camera — all five rays blocked) and sweeping 0 / 0.45 / 0.65 / 0.90:

       encloseStrength   0.00    0.45    0.65    0.90
       hemi              1.02    0.561   0.357   0.102     <- a 10x cut, as designed
       ambient           0.586   0.323   0.205   0.059
       near floor L      0.281   0.263   0.254   0.242     <- the frame moves 14%
       unlit pier L      0.254   0.243   0.238   0.234
       torch pool L      0.434   0.415   0.407   0.397
       pool : floor      2.99    2.98    2.97    2.92      <- contrast gets *worse*

     Ten times less sky fill changes the tomb by a tenth of a stop and costs it a hair of
     warm/cool contrast. So the fill was never what the room is made of, and the flat,
     uniform, falloff-free look the critic reports is not an FX or fill problem.

     **And it would have been easy to report this as a win.** e=0 against e=0.90 differs on
     **94.3% of the frame's pixels**, mean |Δ| 12/255, max 129 — a number that looks
     conclusive and means nothing. The structure the shot is judged on does not move: the
     near/far floor step stays ~0.02 L, the torch pool keeps the same 3:1 ratio to the
     unlit stone, and the two frames read identically side by side. This is KNOWN_ISSUES §8's
     lesson a second time ("disabling the shadow wash changed 83.8% of the frame and left the
     defect bit-intact"): measure the defect, not the knob.

     Where the light actually comes from: `ToonMaterial._refreshShadowColor()` sets shadow
     illumination to `shadowFloor (0.125) x lum(keyColor) x keyIntensity` — a function of the
     **sun**, applied to every shadowed surface in the game. Twelve metres underground with
     the sun sealed out, that floor *is* the lighting, which is why the measured shadow-to-key
     ratio sits pinned at 33–34% across the entire bracket and will not move for anything
     LIGHTING does to hemi, bounce or ambient.

     Owner of the fix: **SHADING / ToonMaterial.js.** The interface for it already exists and
     is simply not wired — `_publishKeyLight()` sends `ambient.floor` and `ambient.tint` in the
     payload, and `ToonMaterial.setKeyLight()` reads `ambient.sky`, `.ground`, `.bounce` and
     `.intensity` and silently ignores both of those. If the floor took a scalar from here, the
     enclosure term could drive it and this knob would start meaning something.

     Leaving this at 0 deliberately: a non-zero value darkens every roofed frame in the game
     by ~10% and buys nothing the shot needs. The fan and the bracket harness stay so the
     experiment is a re-run, not a re-derivation.
     LIGHTING exposes TUNE on the instance so that bracket can be driven from the harness. */
  encloseStrength: 0.0,
  encloseProbe: 30,          // metres straight up; nothing in §8.1 is taller than the pylon
  encloseEvery: 6,           // frames between probe fans (5 rays each — see ENCLOSE_FAN)
  encloseLerp: 4.0,          // per-second approach, so walking under a roof is not a switch
  encloseBounce: 0.5,        // the sand bounce dies more slowly than the sky does

  /* ── holdEnclose / holdEncloseHyst — the SECOND consumer of the fan, and the only live one ──
   *
   * KNOWN_ISSUES §269/§271, `progress/records/PREREG-holdscope.md`. Read §271.3 before touching
   * this: per-material scoping of the shade band is refuted, not untried.
   *
   * §269 built a shade band derived per pixel from the material's own albedo (`shadowHold` in
   * ToonMaterial) that fixes critic 9's ranked D1 on daylight and destroys `interior`, because a
   * tomb is at `shadowMix` 1 everywhere and the band therefore *is* its lighting rather than a
   * shadow lying on top of one. §271.3 established that the two cases cannot be told apart per
   * material (8 of 12 architectural materials appear in the tomb AND in daylight, over one
   * shared-by-identity uniform) and cannot be told apart by key radiance either (`interior` runs
   * the brightest key in the game, x4.05 — the sun is there, it just never arrives).
   *
   * What does tell them apart is **how much sky the camera can see**, which is what the fan
   * above has measured for nothing since it was written. `holdEnclose` is the enclosure at or
   * below which the camera counts as under open sky:
   *
   *     -1   scoping OFF. The fan does not run, `ambient.skyOpen` is not published, and
   *          ToonMaterial never writes `uShadowHold` — byte-identical to the pre-holdscope build.
   *     >=0  the fan runs and LIGHTING publishes a DECISION, `skyOpen` 0 or 1.
   *
   * **It is a threshold with a decision and never a ramp, and that is a measurement, not a
   * preference.** §269 bracketed the band at 0.6 and got `dunes` hue 355 / sat 0.274 — muddier
   * than either endpoint, because the blend passes through neutral. `hold = 1 - enclosure` would
   * put every partially-roofed camera in that mud.
   *
   * `holdEncloseHyst` is the full width of the dead band around the threshold, so a camera
   * parked on it does not chatter between two states that are deliberately far apart.
   *
   * This term does NOT touch the sky fill. `_encloseFill()` keeps its own `encloseStrength <= 0`
   * early-out, so raising this off -1 changes no fill, no hemi and no ambient — only which
   * cameras get the held shade band. The fill half stays 0 for the reason bracketed above. */
  holdEnclose: -1,
  holdEncloseHyst: 0.10,

  /* Local lights */
  localCap: { low: 2, med: 4, high: 6, ultra: 8 },
  localCullDistance: 68,
  flickerRate: 5.7,
  flickerPos: 0.055,        // metres of positional wobble — a still flame reads as a lamp

  /* ── Shafts ──────────────────────────────────────────────────────────────────
     These were five imaginary blades 42 m wide lying along y = 15.5 at z = −18…−50,
     which corresponds to no opening ARCHITECTURE ever built: the real hall has four
     2.6 × 2.3 m slots punched through the nave roof at z = −24…−48 and eight 2.8 × 1.3 m
     clerestory windows at x = ±11.4. A blade that doesn't line up with a hole reads as
     fog with no cause (and, since FX distributes its motes through these volumes, it was
     also seeding dust inside solid stone). The list is now built from
     `architecture.api.roofSlots` / `.clerestory` and only falls back to these constants
     when ARCHITECTURE is absent. */
  /* ── §214.6: critic pass 7 defect 9 re-measured, and BOTH its numbers are wrong ──────────
     The defect reads: "God-rays are a Gaussian screen overlay — 18 px 10–90 % edge transition,
     washing ~40 % of `temple` toward white and taking the columns' albedo with it."

     Re-measured on the shipped frame (`grain1/temple.g00.png`, 1280×720), with an edge finder
     calibrated against planted 4/18/40 px ramps and a median-9 prefilter — the first pass
     without that prefilter locked onto 1–2 px INK LINES, which are the strongest transitions
     in the frame (amp 143–168 L) and answered a question nobody asked:

       shaft boundary 10–90 % width, 19 scans:  21…61 px, **median 42 px**   (claim: 18 px)
       share of frame at L ≥ 170 : 2.5 %    L ≥ 180 : 0.6 %    L ≥ 200 : 0.0 %
       brightest pixel in the whole frame: L 232;  0.00 % of it reaches V > 0.90
       mean HSV saturation, L ≥ 150 band 0.255 vs L 60–110 band 0.249 — the wash costs
       **-2 %** of the surrounding saturation, i.e. nothing measurable

     So the edge is **2.3× softer** than reported, "~40 % toward white" does not reproduce at
     any threshold (the maximum share above any of them is 17.2 % at L ≥ 100), and "taking the
     columns' albedo with it" is not visible in saturation at all.

     What IS true, and it is worse in a way the defect did not name: these blades never become
     light. The calibrated display chain (scratchpad/tonechain.mjs) puts V > 0.90 at
     scene-linear 1.95, and the brightest shaft pixel in `temple` sits at L 177 ≈ scene 0.52 —
     **a quarter of the radiance a white needs.** A 42 px soft edge that peaks in the pale
     grey band is haze, not a god-ray. That also makes this the same defect as pass 7's #8
     ("nothing is white") seen from the other side, not an independent finding.

     The prescription therefore INVERTS the critic's. Do not dim these to stop a wash that is
     not happening; **narrow them and make the core hot**, so a blade reaches display white in
     a tight centre and falls off fast. The cross-section knobs are FX's (`Particles.js`
     TUNE.shaftEdge 0.16, shaftWide 1.85, shaftCore 0.55, shaftGain 0.52), not LIGHTING's —
     what is owned here is the published intensity and `shaftFlare` below, which widens every
     beam along its length and so contributes directly to that 42 px figure.

     Not changed here. The two owners have to move together or the result is uninterpretable,
     and neither half is verifiable without a capture. */
  shaftMaxLength: 52,
  /* 0.28 -> 0.12. **The half of §214.3's prescription that lives in this file.**
     Flare is a pure WIDENING term: FX scales each ribbon's half-width by `1 + flare*(down/len)`
     (`Particles.js` `_shaftRibbons`) with no compensating gain, so at 0.28 every blade is 28%
     broader at its foot than at its aperture and the published intensity is spread across that
     extra section. That is the arithmetic of a haze — the same radiance over more pixels and a
     proportionally wider rim penumbra, since FX's `shaftEdge` is a fraction of the half-width and
     therefore inherits the widening in absolute pixels.

     Deliberately NOT paired with a rise in published intensity, and the reason is arithmetic
     rather than caution: `power = dayAmount * (0.35 + shaftGrazeGain * grazing)` and `grazing`
     is already clamped to 1 at `temple`'s 33° sun (sunDir.y 0.545 against a [0.05, 0.45] window),
     so the only way to raise a `temple` blade from here is to raise the CONSTANT — which lifts
     every blade in every daylight shot, haze included, i.e. exactly the wash §214.3 says is not
     the problem. The hot core has to be bought by narrowing the cross-section, and the
     cross-section knobs are FX's (`shaftWide` 1.85, `shaftCore` 0.55, `shaftEdge` 0.16). Those
     are proposed as a diff in the report, not applied here.

     `debug.shaftFlare` overrides live (null = use this) so the pair can be A/B'd in one boot. */
  shaftFlare: 0.12,          // cross-section growth over the beam's length; 0 = a parallel tube
  shaftGrazeGain: 0.65,      // how much of the blade's power comes from a *low* sun
  /* A beam only exists where the opening faces the sun. cos of the widest angle that still
     counts as "the sun can see through this hole". */
  shaftFaceCos: 0.12,
  /* **An opening is a hole in something with thickness, and near-grazing sun it seals.**
     A roof slot is 2.6 m across cut through 0.85 m of slab; light entering it drifts
     `thick * tan(incidence)` sideways on the way through, so below a certain elevation no ray
     clears both lips and the slot transmits *nothing*. At tod 0.83 (sun 15°) the nave slots
     are geometrically sealed — the drift is 3.11 m across a 2.6 m opening — yet they were
     still publishing blades. COLLISION agreed: the length raycast left the aperture lip while
     still inside the roof's own `ground` proxy and came back 1.37 m, so the four nave blades
     drew as 1.77 m stubs hanging off the ceiling. Both symptoms are the same fact, and the
     fix is to stop emitting a blade the masonry cannot pass rather than to lengthen it.

     Deliberately a *seal* gate, not a transmission model: it is 1.0 for every opening in
     every canonical shot except the sealed case, so it cannot dim the hall blades in `temple`
     — the one shot where §7.3's volumetrics condition already passes. `temple`'s roof slots
     sit at throat 0.45 against a 0.12 seal, a 3.75x margin. If the art ever wants slot blades
     to genuinely fade toward sunset, raise `shaftSeal` — that is the knob, and it is a
     separate decision from this bug. */
  shaftSeal: 0.12,
  /* Metres of masonry each opening family is cut through, from the geometry EgyptLevel emits:
     nave roof slab `groundProxy` thick 0.85; clerestory band `masonryShell` thick 0.72;
     peristyle pier depth d = 1.95 (its 2.15 is the width along the row, not the depth light
     crosses). Only used by the seal test above. */
  shaftThick: { roof: 0.85, clere: 0.72, court: 1.95 },
  /* Courtyard peristyle (§8.1 x = ±23, piers every 5.5 m): the gaps between piers, above
     the temenos wall behind them and below the y = 9.0 architrave. The only motivated
     opening in an open courtyard, and the one that rakes light past the obelisk. */
  courtGapZ: [-10.25, -4.75, 0.75, 6.25, 11.75, 17.25, 22.75, 28.25],
  courtGapX: 23,
  courtGapY: 6.55, courtGapH: 2.1, courtGapW: 3.4,
  /* Open-air blades used to be deliberately quiet. That was the wrong call: it is the
     *interior* that has contrast to spare, and these are the blades being asked to survive a
     sunlit backdrop. They now carry a flanking shadow band (FX's `shaftDark`), which does
     most of the separating, and the gain is up to match.

     **And do not lower it chasing the `combat` veils (ledger #13).** The fx8 decomposition
     owns those veils to this family (slabs ~100% of the left ROI, ~91% of the doorway), but
     the mechanism is stacking, not per-blade brightness: a camera that looks ALONG the row
     integrates many blades in one sightline (combat has all eight on-screen; traversal —
     whose winning beam is one of these same blades — has ~1.4). The per-blade gain is right;
     the lever is FX's `courtStackBudget` family cap, which scales with the on-screen count
     and leaves single-blade framings untouched. */
  courtShaftGain: 0.80,
  /* **Do not raise the above trying to get a blade into the `courtyard` shot. It is not a
     brightness problem and no value of this knob can fix it.**
     Critic pass 3 item 10 ("no volumetrics in courtyard") has been read as an FX/LIGHTING
     tuning failure across three passes. It is geometry, and the arithmetic is short enough to
     repeat. At `courtyard`'s tod 0.76 the sun is due west at 26°, so light travels
     (0.899, −0.438, 0): only the *west* peristyle gaps at x = −23 face it, and every beam
     from them runs east, away from a camera that stands at x = −19 — four metres inside that
     same colonnade, with its back to the openings. Each blade drops 6.55 m to the floor in
     13.4 m of easting and lands at x = −9.6, which is where the "the beams die 9.6 m short of
     the obelisk" reading comes from; the obelisk is at x = 0.
     Projecting all eight west gaps through that camera, the share of each blade that is
     on-screen at all is 22 / 29 / 35 / 42 / 48 %, and every one of those segments is in the
     bottom-left corner — entering at x ≈ 0–8 px and exiting at x ≈ 84–330, y ≈ 580–689 of a
     1280x720 frame, behind the foreground plinth. So the blades are correctly placed,
     correctly aimed, live at intensity 0.798, and land where a 26° sun puts them; the frame
     simply does not contain the volume they occupy.
     Which means this is not FX's to fix and not LIGHTING's. The three real options are: move
     the camera (`Shots.js` — SHOTS/lead), give the courtyard an opening the camera is looking
     *at* rather than standing inside (ARCHITECTURE), or accept it. What FX *can* put in
     that frame without an opening is airborne particulate and the three braziers that project
     inside it, at 38.1, 44.3 and 56.1 m — see `Particles.js` TUNE.flameFade.

     **Correction, and the earlier version of this comment was wrong in two ways.** It said "a
     gate or clerestory in the **north wall around z = 0** would put a blade across the
     obelisk". (1) Wrong z: a blade travels (0.899, −0.438, **0**) — pure x and y, zero z — so
     it never leaves its opening's z-plane. An opening at z = 0 puts a blade 11 m south of an
     obelisk that stands at z = 11 (§8.1). The opening would have to be at z ≈ 11, on the
     *west* side, for the beam to reach the obelisk's own plane at all.
     (2) Wrong premise, and this is the part that kills the idea: a west opening at z ≈ 11 was
     gated headlessly (blade spines projected against architecture depth through this exact
     camera, `gate21b*.mjs`) and **fails at every height the wall could plausibly carry.** The
     occluder is this camera's own near field — `arch:court:hieroglyph_wall` and
     `arch:court:sandstone_block` at x ≈ −12.7, z ≈ 22–25, top y ≈ 5.2, sitting only 7–9 m
     from a lens that is 26–31 m from the beam's eastern half. Everything low and east of
     x ≈ −4 is behind it. Since a beam is *by construction* near the floor by the time it is
     east of x = 0, sweeping the opening height 9 → 24 m gives **zero** visible pixels past
     x = 0 until y ≈ 23 m, and only 31 px at 24 m (R5 wants ≥120). The west court wall tops
     out at y = 8.96 (measured), so this would mean ~14 m of new wall — not a clerestory, a
     redesign of the court enclosure, and it would still barely register.
     What the same sweep *does* show, recorded because it is a different and cheaper prize: an
     opening at y ≈ 13–14, z ≈ 11.75 puts ~13 m of blade (41 % of it) visibly raking the
     upper-left of this frame at ~190 px wide with a 22 m backdrop gap — i.e. it satisfies
     §2.3's "shafts raking through at least one opening in every interior/courtyard" while
     *not* satisfying "past the obelisk". That still costs ~5 m of new wall above the 9 m
     architrave §8.1 specifies, so it is ARCHITECTURE's and the lead's call, not FX's. */

  /* Torch / brazier cones. Built from whatever registered through addLocalLight(), so they
     follow PROPS rather than a second hardcoded list of sconces. */
  coneMax: 26,
  /* `interior` is the shot §7.2 names for volumetrics and it has *no* sun blade in it — no
     opening in the tomb projects into that frame, checked by projecting the whole published
     opening set through that camera. Every volumetric it can show is a torch cone, so a cone
     has to be long enough to reach the floor it lights: 0.30 × radius put a 9 m wall torch's
     cone at 2.7 m inside a 10 m-high vault. */
  coneLength: 3.6,           // metres, scaled by the light's radius
  coneRadius: 0.46,          // end radius as a fraction of length
  coneApex: 0.10,
  coneDayFade: 0.30,         // how much of a cone survives full daylight above ground
  /* Metres from camera: full → gone.
     **Checked, and deliberately left alone — recording the negative result so it is not
     re-investigated.** Projecting all 24 registered fires through the ten canonical cameras
     gives, for the nearest brazier in each: `guard` 7 m, `combat` 25 m, `hero` 31 m,
     `night` 34 m, `courtyard` 38 m. Evaluated against this smoothstep those arrive at
     1.00, 1.00, 1.00, 0.94 and 0.77 of full strength — i.e. the fade is **not** what is
     keeping brazier volumetrics out of `night`, which is the shot §7.2 wants them in. I
     widened this to [52, 92] on the assumption that it was, having read the smoothstep the
     wrong way round in my head, and reverted it when the arithmetic disagreed. Whatever is
     costing `night` its warm brazier accents is somewhere else; the only frame of it in the
     tree predates the night-anchor retune, so start by capturing a fresh one. */
  coneFade: [30, 56],
};

/* ── The cascade shader patch ────────────────────────────────────────────────────
   Only cascade 0 carries light intensity; cascades 1..N−1 exist purely to render extra
   shadow maps. So an *unpatched* built-in material still sees exactly one correctly
   exposed sun (with cascade-0 shadows), and a patched one swaps cascade 0's single
   shadow lookup for a distance-weighted blend across all N maps. No double-lighting,
   no 1/N-strength shadows, and no dependency on which materials got patched. */

const CSM_DECLS = (n) => /* glsl */`
uniform vec2 csmSplits[${n}];
uniform float csmFade;
// Complementary fades: the two masks that overlap at a split always sum to 1, so the
// shadow cross-dissolves while the light stays constant. That is why the seam is invisible.
float csmMask( const in vec2 s, const in float d ) {
  return smoothstep( s.x - csmFade, s.x + csmFade, d )
       * ( 1.0 - smoothstep( s.y - csmFade, s.y + csmFade, d ) );
}
`;

function csmShadowFn(n) {
  let taps = '';
  for (let i = 0; i < n; i++) {
    taps += `
  #if NUM_DIR_LIGHT_SHADOWS > ${i}
  w = csmMask( csmSplits[ ${i} ], d );
  if ( w > 0.0 ) {
    sum += w * getShadow( directionalShadowMap[ ${i} ],
      directionalLightShadows[ ${i} ].shadowMapSize, directionalLightShadows[ ${i} ].shadowIntensity,
      directionalLightShadows[ ${i} ].shadowBias, directionalLightShadows[ ${i} ].shadowRadius,
      vDirectionalShadowCoord[ ${i} ] );
    wsum += w;
  }
  #endif`;
  }
  return /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( CSM_CASCADES )
float csmShadow( const in float d ) {
  float sum = 0.0, wsum = 0.0, w;${taps}
  return wsum > 1e-4 ? sum / wsum : 1.0;
}
#endif
`;
}

/* The one line inside lights_fragment_begin's directional loop that applies the shadow. */
const CSM_SHADOW_LINE =
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

const CSM_SHADOW_PATCH = /* glsl */`
		#if defined( CSM_CASCADES ) && ( UNROLLED_LOOP_INDEX < CSM_CASCADES )
			#if UNROLLED_LOOP_INDEX == 0
			directLight.color *= ( directLight.visible && receiveShadow ) ? csmShadow( vViewPosition.z ) : 1.0;
			#endif
		#else
			${CSM_SHADOW_LINE}
		#endif`;

/** Built-in materials whose light loop we know. Anything else (SHADING's ShaderMaterial)
 *  consumes setKeyLight() instead and is never touched. */
const PATCHABLE = new Set([
  'MeshStandardMaterial', 'MeshPhysicalMaterial',
  'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial',
]);

/* Scratch — update() allocates nothing (§5). */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _lightDir = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _rayFrom = new THREE.Vector3();     // shaft length probe, stepped clear of the aperture
const _c1 = new THREE.Color();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FWD = new THREE.Vector3(0, 0, 1);
const RAY_GROUND = Object.freeze({ onlyTags: ['ground'] });

/**
 * Sky-occlusion fan for `_updateEnclosure`: straight up plus four rays 34° off vertical.
 * Fixed and pre-normalised — deterministic, and it allocates nothing at probe time.
 * 34° because it is wide enough to find a clerestory band from the floor of the nave and
 * narrow enough that standing in an open courtyard beside a pylon still reads as open sky.
 */
/** Camera displacement, in metres, that counts as a cut rather than a walk. See _updateEnclosure. */
const ENCLOSE_JUMP = 2.0;

/** Reusable raycast result for the enclosure fan — shape from Collision's `makeRayResult`. Owning
 *  one keeps five rays a frame out of Collision's 8-deep shared result ring. See _updateEnclosure. */
const _encloseHit = {
  hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0),
  distance: Infinity, tag: '', material: '', rec: null,
};

const ENCLOSE_FAN = (() => {
  const t = Math.tan(THREE.MathUtils.degToRad(34));
  return [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(t, 1, 0).normalize(),
    new THREE.Vector3(-t, 1, 0).normalize(),
    new THREE.Vector3(0, 1, t).normalize(),
    new THREE.Vector3(0, 1, -t).normalize(),
  ];
})();

/** Organic 1-D value noise. Flicker built from a sine reads as a metronome, not a flame. */
function nz(x) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    let t = (n | 0) * 0x27d4eb2d;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
/** Two octaves — one slow breath, one fast crackle. */
function flickerNoise(t, seed) {
  return nz(t * 1.0 + seed) * 0.62 + nz(t * 3.7 + seed * 7.13) * 0.38;
}

/**
 * Signature of ARCHITECTURE's published opening set — **positions, not just counts.**
 *
 * This used to be `roofSlots.length * 131 + clerestory.length`. **Be precise about what that
 * did and did not break, because the obvious reading of it is wrong and I believed the wrong
 * one first.** The fallback constants in `_buildShafts()` are four roof slots and eight
 * clerestory windows and the hall ARCHITECTURE builds is *also* four and eight, so fallback
 * and real hashed identically — 532 both ways. But `_buildShafts()` latches the signature of
 * the api it actually *used*, and at init that api is still empty, which hashed to 0. So the
 * empty → real transition was visible to the poll, it did fire, and the shipped frames have
 * had the real slot positions all along. Checked by computing both signatures against both
 * sets rather than by reasoning about them.
 *
 * What was genuinely broken is the case with no symptom: move an opening without changing how
 * many there are — retune the nave roof's band pitch, shift a clerestory — and the poll cannot
 * see it, so the blades keep the old geometry and nothing warns. The real slots already sit on
 * the band grid at z ≈ −25.19/−32.45/−39.71/−46.97 rather than on §8.1's nominal −24/−32/−40/
 * −48, which is exactly the kind of drift that would go unnoticed. Folding the centres and
 * sizes in costs nothing on a poll that runs once every 8 frames.
 */
function archSignature(api) {
  let h = 0x9e3779b1;
  const mix = (v) => { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; };
  for (const list of [api?.roofSlots, api?.clerestory]) {
    mix((list?.length ?? 0) + 0x51ed);
    if (!list) continue;
    for (const o of list) {
      const c = o?.center;
      if (!c) { mix(0x7fff); continue; }
      // Centimetre quantisation: finer than any placement difference that matters, coarse
      // enough that float noise in a rebuilt level cannot make this flap every poll.
      mix(Math.round(c.x * 100)); mix(Math.round(c.y * 100)); mix(Math.round(c.z * 100));
      mix(Math.round((o.w ?? 0) * 100) * 1009 + Math.round((o.h ?? 0) * 100));
    }
  }
  return h | 0;
}

export class Lighting {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.TUNE = TUNE;                   // so the capture harness can bracket a value

    this.atmosphere = createAtmosphereState();
    this.timeOfDay = engine.debug.timeOfDay ?? 0.79;
    this.enclosure = 0;                 // 0 = open sky overhead, 1 = fully roofed
    this._encloseTarget = 0;            // the raw fan reading the smoothed value is chasing
    this._encloseAt = null;             // camera position the last fan was cast from
    this._skyOpen = null;               // scope decision; null = scoping off, publish nothing

    /* ---- published interface (AGENTS.md §4.3 → engine.get('lighting')) ---- */
    this.keyLight = null;              // THREE.DirectionalLight — cascade 0, the lit one
    this.cascades = [];                // [{ light, camera, matrix, map, near, far, texel }]
    this.rimDirection = new THREE.Vector3();
    this.rimColor = new THREE.Color(PALETTE.rimCool);
    this.shafts = [];
    this.localLights = [];
    this.shadowTint = new THREE.Color(PALETTE.shadowHue);
    this.shadowFloor = SHADOW_FLOOR;

    this._slabCount = 0;
    this._coneCount = 0;
    this._localSig = -1;
    this._archSig = -1;
    this._shaftPoll = 0;
    this._rayDone = false;
    this._shaftSunKey = NaN;

    /* Animation clock, rebased whenever a canonical shot is staged. Only the flicker uses
       it, and only the flicker needs it — see the note over `_updateLocalLights`. Zero
       outside shot mode, where this is the engine clock unchanged. */
    this._animT0 = 0;

    this._cascadeCount = 1;
    this._splits = [];
    this._csmUniforms = null;
    this._patched = new Set();
    this._sweep = 0;

    /* Static-caster shadow cache (ledger #20; TUNE.shadowStaticCache). All allocation
       happens at census/first-engage time — the per-frame path reuses these. */
    this._cacheEngaged = false;
    this._cacheEpoch = 0;              // bumped by invalidateShadowCache() and rebuilds
    this._seenEpoch = -1;
    this._staticSig = NaN;             // NaN ≠ NaN → first engaged frame always refreshes
    this._memberSig = undefined;       // census membership hash; undefined ⇒ first census resets
    this._staticCasters = null;        // [{ mesh }] — layer-tagged at census time
    this._dynCount = 0;
    this._cachePoll = 0;
    this._cacheDepthMats = null;       // per-side override materials, built lazily
    this._cacheStats = { refreshes: 0, blits: 0, dynDraws: 0, dynTris: 0, engaged: false };

    this._hemi = null;
    this._bounce = null;
    this._ambient = null;
    this._pool = [];
    this._order = [];
    this._probe = null;
    this._offEvents = [];

    /* One reusable payload object for SHADING — mutated, never reallocated. */
    this._keyPayload = {
      direction: new THREE.Vector3(),        // unit, points TOWARD the light
      color: new THREE.Color(),
      intensity: 0,
      ambient: {
        color: new THREE.Color(), intensity: 0,
        sky: new THREE.Color(), ground: new THREE.Color(),
        tint: this.shadowTint, floor: SHADOW_FLOOR,
      },
      rim: { direction: this.rimDirection, color: this.rimColor, strength: 0.55 },
      shadowMatrix: null,                    // cascade 0 (by reference — three mutates it)
      cascades: [],
      shadowSplits: null,
      fog: null,
      timeOfDay: 0,
      nightAmount: 0,
    };
  }

  /* ===================================================================== init */

  async init() {
    const engine = this.engine;
    evalAtmosphere(this.timeOfDay, this.atmosphere);

    this._buildCascades();
    this._buildFill();
    this._buildLocalPool();
    this._buildShafts();

    /* Nothing in the placeholder world casts a shadow, and a bare plane cannot show
       whether the cascades are biased correctly. Only while ARCHITECTURE and TERRAIN are
       both absent, drop in a calibration rig: chunky blocks near the camera for acne /
       peter-panning, and the two §8.1 pyramid silhouettes so the far cascade and the
       aerial-perspective read can be judged. It vanishes the moment either agent lands. */
    if (!engine.has('architecture') && !engine.has('terrain')) this._buildCalibrationRig();

    this._offEvents.push(engine.on('timeOfDay', (v) => {
      this.timeOfDay = v;
      this._applyAtmosphere();
    }));
    this._offEvents.push(engine.on('quality', () => {
      this._rebuildForQuality();
    }));
    /* Staging a shot rebases the flicker clock, for the same reason FX rebases its own
       (`Particles.update`): engine time at the moment `setShot` stops the rAF loop is a
       function of how long the boot took, so anything animated on it samples at a different
       phase in every run and the frame comes back different with nothing having changed. */
    this._offEvents.push(engine.on('shot', () => { this._animT0 = engine.time; }));

    this._applyAtmosphere();
  }

  /* ------------------------------------------------------------- cascades --- */

  _cascadeMapSize(i, base) {
    // Cascade 0 gets the budget; the far ones cover 10× the area and nobody looks at a
    // 200 m shadow's edge. (The old note here costed this against VSM's RG16F + F32 pair
    // per cascade. We render PCF — one DEPTH_COMPONENT target each — so the cap is about
    // fill rate and texel size, not about the 500 MB VSM would have wanted.)
    const cap = TUNE.maxCascadeMap;
    if (i === 0) return Math.min(base, cap);
    return THREE.MathUtils.clamp(i >= 2 ? base >> 1 : base, 1024, cap);
  }

  _buildCascades() {
    const engine = this.engine;
    const n = THREE.MathUtils.clamp(engine.settings.shadowCascades ?? 2, 1, 4);
    this._cascadeCount = n;

    const base = engine.settings.shadowMap ?? 2048;
    const A = this.atmosphere;

    for (let i = 0; i < n; i++) {
      const light = new THREE.DirectionalLight(A.keyColor.getHex(), 0);
      light.name = `lighting.sun.cascade${i}`;
      light.castShadow = true;

      const size = this._cascadeMapSize(i, base);
      light.shadow.mapSize.set(size, size);
      light.shadow.radius = TUNE.shadowRadius[i];
      light.shadow.bias = -0.0004;      // refined per-cascade in _fitCascades()
      light.shadow.normalBias = 0.02;
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = 500;
      light.shadow.autoUpdate = true;

      // Order matters: WebGLLights sorts shadow-casters first but is stable, so scene
      // order fixes directionalLights[0..n-1] == cascade 0..n-1, which the shader mask
      // relies on. Every other light this module adds is castShadow:false and lands after.
      engine.scene.add(light);
      engine.scene.add(light.target);

      this.cascades.push({
        index: i,
        light,
        camera: light.shadow.camera,
        matrix: light.shadow.matrix,
        map: null,
        mapSize: size,
        near: 0, far: 0, radius: 0, texel: 0,
      });
    }
    this.keyLight = this.cascades[0].light;

    /* Practical split scheme: blend of uniform and logarithmic. Logarithmic alone wastes
       the near cascade on the first two metres; uniform alone leaves cascade 0 far too
       wide to ever look crisp on Sly. */
    this._splits.length = 0;
    const near = TUNE.shadowNear, far = TUNE.shadowDistance;
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      const log = near * Math.pow(far / near, p);
      const uni = near + (far - near) * p;
      this._splits.push(THREE.MathUtils.lerp(uni, log, TUNE.splitLambda));
    }

    /* The csmSplits/csmFade uniform OBJECTS keep their identity for the life of the
       module: every compiled program of every patched material holds a reference to them
       (enableCascades assigns them into shader.uniforms), and a reused program keeps its
       reference across a rebuild. Allocating fresh objects here left reused programs bound
       to stale split values — and the old workaround for that (_patched.clear() so the
       sweep re-patches) let onBeforeCompile get wrapped twice, double-injecting the GLSL
       and killing the program: fx6 hero.back rendered with every patched mesh missing.
       Mutate the values in place instead; identity never changes. */
    if (!this._csmUniforms) {
      this._csmUniforms = { csmSplits: { value: [] }, csmFade: { value: TUNE.cascadeFade } };
    }
    const splitVecs = this._csmUniforms.csmSplits.value;
    splitVecs.length = n;
    for (let i = 0; i < n; i++) {
      (splitVecs[i] ||= new THREE.Vector2()).set(
        i === 0 ? -1e4 : this._splits[i],
        i === n - 1 ? 1e6 : this._splits[i + 1]
      );
    }
    this._csmUniforms.csmFade.value = TUNE.cascadeFade;
    this._keyPayload.shadowSplits = splitVecs;
    this._keyPayload.shadowMatrix = this.cascades[0].matrix;
    this._keyPayload.cascades = this.cascades;
  }

  _rebuildForQuality() {
    /* The cache holds per-cascade targets and a key built from the old lights — a rebuild
       invalidates every part of it (§15 is the record of what a half-torn-down rebuild
       costs). Dispose first, epoch-bump, and let the next engaged frame rebuild fresh. */
    this._disposeShadowCache();
    // Cascade count is baked into every patched shader, so a quality change has to tear
    // the whole set down and force a relink.
    for (const c of this.cascades) {
      this.engine.scene.remove(c.light);
      this.engine.scene.remove(c.light.target);
      c.light.shadow.dispose?.();
      c.light.dispose?.();
    }
    this.cascades.length = 0;
    this._buildCascades();
    /* Relink only. Do NOT clear _patched: a material is wrapped once, ever — its
       onBeforeCompile and cache key read live cascade state, so a relink (count changed:
       new cache key, fresh compile) or a plain program reuse (count unchanged: same key,
       identity-stable uniforms updated in place) both see current values. Clearing the
       set made _sweepMaterials wrap the wrap, and the doubled GLSL injection failed to
       compile — every patched mesh vanished from the frame within one sweep period. */
    for (const mat of this._patchedMaterials()) mat.needsUpdate = true;
    this._applyAtmosphere();
  }

  _patchedMaterials() { return this._patchedList || (this._patchedList = []); }

  /* ----------------------------------------------------------------- fill --- */

  _buildFill() {
    const engine = this.engine;
    const A = this.atmosphere;

    // §2.2 FILL / BOUNCE. Sky above, hot sand below: this is what puts colour in the
    // shadows instead of grey, which §7.3 fails a shot for.
    this._hemi = new THREE.HemisphereLight(A.hemiSky.getHex(), A.hemiGround.getHex(), 1);
    this._hemi.name = 'lighting.hemi';
    engine.scene.add(this._hemi);

    // The opposing sand-GI bounce. Aimed slightly upward from the ground side so it fills
    // undersides — chins, ledge soffits, the inside of an arch.
    this._bounce = new THREE.DirectionalLight(PALETTE.bounceSand, 0.3);
    this._bounce.name = 'lighting.sandGI';
    this._bounce.castShadow = false;
    engine.scene.add(this._bounce);
    engine.scene.add(this._bounce.target);

    // Violet-teal floor so nothing ever crushes to black (§2.2 "never below").
    this._ambient = new THREE.AmbientLight(PALETTE.shadowHue, 0.2);
    this._ambient.name = 'lighting.ambientFloor';
    engine.scene.add(this._ambient);
  }

  /* ---------------------------------------------------------- local lights --- */

  _buildLocalPool() {
    const engine = this.engine;
    const cap = TUNE.localCap[engine.quality] ?? 4;
    for (let i = 0; i < cap; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      l.name = `lighting.local${i}`;
      l.visible = false;
      l.castShadow = false;   // VSM does not support point shadows; see report
      engine.scene.add(l);
      this._pool.push({ light: l, owner: null });
    }
    this._localCap = cap;
  }

  /**
   * Register a brazier / torch / any local emitter. Returns a handle you keep and mutate:
   * `handle.position`, `handle.intensity`, `handle.color`, `handle.radius`, `handle.flicker`
   * are all live. PROPS and FX are the expected callers.
   */
  addLocalLight(opts = {}) {
    const h = {
      id: this._nextLocalId = (this._nextLocalId || 0) + 1,
      position: (opts.position ? _v1.copy(opts.position) : _v1.set(0, 0, 0)).clone(),
      color: new THREE.Color(opts.color ?? 0xffb060),
      intensity: opts.intensity ?? 6,
      radius: opts.radius ?? 10,
      flicker: opts.flicker ?? 0,
      castShadow: !!opts.castShadow,
      enabled: opts.enabled !== false,
      /* runtime */
      _slot: null, _dist: 1e9, _seed: (this._nextLocalId * 13.37) % 97,
      _live: 0, _wob: new THREE.Vector3(),
    };
    this.localLights.push(h);
    return h;
  }

  removeLocalLight(handle) {
    if (!handle) return;
    const i = this.localLights.indexOf(handle);
    if (i >= 0) this.localLights.splice(i, 1);
    if (handle._slot) {
      handle._slot.owner = null;
      handle._slot.light.visible = false;
      handle._slot = null;
    }
  }

  /** How many local lights can actually be lit at once on this quality tier. */
  get localLightBudget() { return this._localCap; }

  /* ---------------------------------------------------------------- shafts --- */

  /**
   * The published shaft list. Each entry is a *volume*, described in the frame of the
   * opening that motivates it, so FX can extrude geometry straight from it:
   *
   *   kind      'slab' (a rectangular opening) | 'cone' (a point source)
   *   origin    centre of the opening, world space
   *   normal    the opening's outward normal — a blade only exists while the key can see
   *             through the hole, which is what makes the *west* clerestory throw beams at
   *             golden hour and the east one stay dark
   *   axis/axis2 + halfU/halfV   the opening's two in-plane axes and half-extents
   *   dir, length                unit travel direction and how far it gets before it lands
   *   intensity, color           0 = the beam is off this frame
   *   baseIntensity              `intensity` with the fire's flicker removed. Use this, not
   *             `intensity`, for anything whose *membership* must be stable frame to frame —
   *             a set keyed on the flickering value re-forms whenever a cone breathes across
   *             a threshold, which is how FX's whole mote field came to re-seed between two
   *             captures 33 ms apart. Use `intensity` for radiance; `baseIntensity` for "is
   *             this volume one of the ones I am tracking".
   *
   * `width` / `span` / `axis` are kept on every entry because FX's mote placement and its
   * `shaftBoost()` uniform packing already speak that vocabulary.
   */
  _makeShaft(id, kind, origin, normal, axis, axis2, halfU, halfV, gain, thick = 0, family = kind) {
    const s = {
      id, kind, family, gain, thick,
      origin: origin.clone(),
      normal: normal.clone().normalize(),
      axis: axis.clone().normalize(),
      axis2: axis2.clone().normalize(),
      halfU, halfV,
      dir: new THREE.Vector3(0, -1, 0),
      length: 12,
      maxLength: TUNE.shaftMaxLength,
      flare: TUNE.shaftFlare,
      intensity: 0,
      baseIntensity: 0,
      color: new THREE.Color(PALETTE.keySun),
      /* legacy view of the same volume, for FX's shaftBoost uniforms */
      width: halfV * 2,
      span: halfU * 2,
      _light: null,          // cone shafts only: the local light that owns them
      _len: 0,               // cached raycast result, invalidated when the sun moves
    };
    return s;
  }

  _buildShafts() {
    this.shafts.length = 0;
    const api = this.engine.get('architecture')?.api;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

    /* --- nave roof slots: horizontal openings, the classic hypostyle blade --- */
    const slots = (api?.roofSlots?.length ? api.roofSlots : [-24, -32, -40, -48].map((z) => ({
      center: V(0, 16.6, z), normal: V(0, 1, 0), w: 2.6, h: 2.3,
    })));
    slots.forEach((o, i) => {
      this.shafts.push(this._makeShaft(
        `roofslot${i}`, 'slab', o.center, o.normal || Y, X, Z,
        (o.w ?? 2.6) * 0.5, (o.h ?? 2.3) * 0.5, 1.0, o.t ?? TUNE.shaftThick.roof));
    });

    /* --- clerestory windows: vertical openings in the band wall, normal ±X --- */
    const clere = (api?.clerestory?.length ? api.clerestory : [-1, 1].flatMap((sx) =>
      [-20, -28, -36, -44].map((z) => ({ center: V(sx * 11.4, 15.5, z), normal: V(sx, 0, 0), w: 2.8, h: 1.3 }))));
    clere.forEach((o, i) => {
      const n = (o.normal || X).clone().normalize();
      // In-plane axes of a wall opening: horizontal along the wall, then vertical.
      const u = _v1.copy(Y).cross(n).normalize();
      if (u.lengthSq() < 1e-6) u.set(0, 0, 1);
      this.shafts.push(this._makeShaft(
        `clerestory${i}`, 'slab', o.center, n, u, Y,
        (o.w ?? 2.8) * 0.5, (o.h ?? 1.3) * 0.5, 1.0, o.t ?? TUNE.shaftThick.clere));
    });

    /* --- courtyard peristyle gaps: §2.3's "shafts through at least one opening in every
           interior/courtyard", and the beams that rake past the obelisk. --- */
    for (let i = 0; i < TUNE.courtGapZ.length; i++) {
      const z = TUNE.courtGapZ[i];
      for (const sx of [-1, 1]) {
        this.shafts.push(this._makeShaft(
          `court${sx > 0 ? 'e' : 'w'}${i}`, 'slab',
          V(sx * TUNE.courtGapX, TUNE.courtGapY, z), V(sx, 0, 0), Z, Y,
          TUNE.courtGapW * 0.5, TUNE.courtGapH * 0.5, TUNE.courtShaftGain, TUNE.shaftThick.court,
          /* family: the peristyle is a ROW of parallel blades; FX's stacking budget
             (Particles TUNE.courtStackBudget) keys on this tag. */
          'court'));
      }
    }

    this._slabCount = this.shafts.length;
    /* `engine.has()` is true from *registration*, not from init, so ARCHITECTURE exists here
       with an empty api — the openings only appear once its own init() has run. Signature the
       opening *geometry* and re-derive when it changes, rather than latching on the
       placeholder set (see `archSignature` — counts alone could not tell them apart). */
    this._archSig = archSignature(api);
    this._usingFallback = !(api?.roofSlots?.length) && !(api?.clerestory?.length);
    this._shaftSunKey = NaN;        // force the length raycasts to re-run
    this._rebuildCones();
    this._updateShafts();
  }

  /**
   * A cone per registered local light. PROPS registers every brazier and torch through
   * `addLocalLight`, so this follows the level's real fire rather than a second hardcoded
   * list of sconces that would drift out of sync with it.
   */
  _rebuildCones() {
    // Drop the previous cone set, keeping the slabs (which are index-stable).
    this.shafts.length = this._slabCount;
    const lights = this.localLights;
    const n = Math.min(TUNE.coneMax, lights.length);
    for (let i = 0; i < n; i++) {
      const h = lights[i];
      // A tomb sconce throws its readable cone *down*, onto the floor the camera is looking
      // at; an open brazier reads as a column of lit smoke going *up*. Ground level decides.
      const down = h.position.y < 0;
      const dir = new THREE.Vector3(0, down ? -1 : 1, 0);
      const len = THREE.MathUtils.clamp(h.radius * 0.42, 1.6, TUNE.coneLength * 1.6);
      const r = len * TUNE.coneRadius;
      const s = this._makeShaft(
        `cone${i}`, 'cone',
        _v1.copy(h.position).addScaledVector(dir, down ? 0.15 : -0.05),
        dir, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), r, r, 1.0);
      s.dir.copy(dir);
      s.length = len;
      s.maxLength = len;
      s.flare = 0;                 // a cone already widens; the base mesh carries it
      s._light = h;
      s.color.copy(h.color);
      this.shafts.push(s);
    }
    this._coneCount = this.shafts.length - this._slabCount;
    this._localSig = lights.length;
  }

  /**
   * How much of a slab opening still passes light at this incidence, 0..1.
   *
   * Light entering a rectangular hole in a slab of thickness `t` drifts sideways by
   * `t * tan(angle from the opening's normal)` before it leaves the far face, so the strip
   * that clears both lips is narrowed by that drift in each in-plane axis independently —
   * hence the product of the two reductions. Returns 0 when the drift exceeds the aperture,
   * i.e. when the opening is geometrically sealed and no direct sun reaches the far side.
   *
   * See `TUNE.shaftSeal` for why this is gated to a seal test rather than used as a
   * transmission curve.
   */
  _apertureThroat(s, dir) {
    if (!(s.thick > 0)) return 1;
    const cn = Math.abs(dir.dot(s.normal));
    if (cn < 1e-4) return 0;                       // travelling along the opening's face
    const du = Math.abs(dir.dot(s.axis)) / cn;     // tan of the incidence, per in-plane axis
    const dv = Math.abs(dir.dot(s.axis2)) / cn;
    const ru = 1 - (s.thick * du) / Math.max(1e-4, 2 * s.halfU);
    const rv = 1 - (s.thick * dv) / Math.max(1e-4, 2 * s.halfV);
    if (ru <= 0 || rv <= 0) return 0;
    return ru * rv;
  }

  /**
   * Direction, length and power, every time the sun moves. Lengths come from a real
   * COLLISION raycast when one is available — a blade that stops on the floor it actually
   * hits is the difference between a light shaft and a glowing stick through the masonry.
   */
  _updateShafts() {
    const A = this.atmosphere;
    const col = this.engine.get('collision');
    const canRay = !!col?.raycast && col.ready !== false;

    /* Sun travel direction. A 22° sun through a roof slot throws a long oblique blade
       across the hall, which is exactly the shot §2.3 asks for. */
    _lightDir.copy(A.sunDir).multiplyScalar(-1).normalize();
    const grazing = THREE.MathUtils.smoothstep(A.sunDir.y, 0.05, 0.45);
    const power = A.dayAmount * (0.35 + TUNE.shaftGrazeGain * grazing);

    const sunMoved = this._shaftSunKey !== Math.round(A.sunElevation * 4) * 1000 +
                     Math.round(A.sunAzimuth * 4);
    if (sunMoved) {
      this._shaftSunKey = Math.round(A.sunElevation * 4) * 1000 + Math.round(A.sunAzimuth * 4);
    }

    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i];

      if (s.kind === 'cone') {
        const h = s._light;
        if (h) {
          s.origin.copy(h.position).addScaledVector(s.dir, s.dir.y < 0 ? 0.15 : -0.05);
          s.color.copy(h.color);
        }
        // `_live` carries the flicker for whichever lights won a hardware slot; the rest
        // fall back to their nominal intensity, so a cone never blinks out just because a
        // nearer fire took its slot.
        const live = h ? (h._live > 0 ? h._live : h.intensity) : 0;
        const norm = THREE.MathUtils.clamp(live / 5.0, 0, 1.4);
        // Above ground a cone has to compete with the sky, so it mostly belongs to night.
        const underground = s.origin.y < 0;
        const day = underground ? 1 : THREE.MathUtils.lerp(TUNE.coneDayFade, 1, A.nightAmount);
        // Two dozen fires are registered across the level. Only the ones the camera is
        // actually near have any business adding radiance to the frame.
        const near = 1 - THREE.MathUtils.smoothstep(Math.sqrt(h?._dist ?? 0), TUNE.coneFade[0], TUNE.coneFade[1]);
        s.intensity = (h?.enabled === false ? 0 : norm) * day * near;
        /* The same number with the flicker taken out. FX places nine hundred dust motes
           *inside* these volumes and needs a set membership that does not change forty times
           a second: `s.intensity` carries `_live`, so a cone breathing across a consumer's
           cull threshold silently re-seeds the entire mote field. See `Particles.js`
           `_moteShafts`. Everything else here — enabled, day/night, distance — is stable
           within a frame and stays in, so this still means "is this cone contributing". */
        const nominal = THREE.MathUtils.clamp((h?.intensity ?? 0) / 5.0, 0, 1.4);
        s.baseIntensity = (h?.enabled === false ? 0 : nominal) * day * near;
        continue;
      }

      s.dir.copy(_lightDir);
      s.color.copy(A.sunColor);
      /* `debug.shaftFlare` — in-page lever on the widening term, same shape as
         `debug.grainScale` / `debug.contactScale`. Republished every frame (not only at build)
         so an A/B needs no `_buildShafts()`; null = use TUNE, which is bit-identical. */
      const flareDbg = this.engine?.debug?.shaftFlare;
      s.flare = flareDbg == null ? TUNE.shaftFlare : flareDbg;

      /* Only a hole the sun can see through throws a beam. This is what keeps the east
         clerestory dark while the west one blazes at golden hour. */
      const face = s.normal.dot(A.sunDir);
      const open = THREE.MathUtils.smoothstep(face, TUNE.shaftFaceCos, 0.45);
      /* ...and a hole the sun can see through still has to be one the light can *cross*. */
      const seal = THREE.MathUtils.smoothstep(this._apertureThroat(s, _lightDir), 0, TUNE.shaftSeal);
      s.intensity = power * open * s.gain * seal;
      // A slab has no flicker in it — sun, aperture and geometry only — so the flicker-free
      // intensity is the intensity. Published anyway so consumers never have to branch.
      s.baseIntensity = s.intensity;

      if (sunMoved || !s._len) {
        let len = 0;
        /* **Start the ray outside the masonry the opening is cut through.**
           `s.origin` is the centre of the aperture, which is the middle of a 0.85 m roof slab
           or a 1.95 m pier — so a ray fired from it is *inside solid geometry*, and the roof
           slab is a `ground` collider, so it hits its own far lip within centimetres. That is
           the whole of the "1.77 m stubs hanging off the nave ceiling" symptom: the blade was
           not short, its length was being measured against the slab it had not left yet.
           The distance to the far face along the ray is `(thick/2) / |dir·normal|`, which
           grows as the sun grazes — exactly the regime where the stubs appeared — and it is
           added back afterwards so `length` still means "from the published origin".
           The seal test above is the *other* half of the same geometry and does not replace
           this one: it removes blades the masonry cannot pass at all, while this fixes the
           measurement for every blade that does pass. */
        const cn = Math.abs(s.dir.dot(s.normal));
        const skip = s.thick > 0 && cn > 1e-3
          ? Math.min((s.thick * 0.5) / cn + 0.05, s.maxLength * 0.5)
          : 0.05;
        if (canRay) {
          try {
            /* `ground` only, deliberately. A blade *ends* where it lands on a floor; a
               column standing in the middle of it does not shorten it, it occludes part of
               it — and the depth test already does that per pixel. Raycasting against
               everything would truncate half the hall's beams into stubs against the
               columns they are supposed to rake across. */
            _rayFrom.copy(s.origin).addScaledVector(s.dir, skip);
            const hit = col.raycast(_rayFrom, s.dir, s.maxLength - skip, RAY_GROUND);
            if (hit?.hit && Number.isFinite(hit.distance)) len = hit.distance + skip;
          } catch { /* collision not ready; fall through to the analytic length */ }
        }
        if (len < 1.0) {
          // Analytic fallback: drop to the floor plane under the opening.
          const drop = Math.max(0.08, -s.dir.y);
          const floor = s.origin.y > 0 ? 0 : -12;
          len = THREE.MathUtils.clamp((s.origin.y - floor) / drop, 4, s.maxLength);
        }
        s._len = Math.min(len + 0.4, s.maxLength);   // a touch past the floor so it lands
      }
      s.length = s._len;
    }
  }

  /* ------------------------------------------------------ calibration rig --- */

  _buildCalibrationRig() {
    const engine = this.engine;
    const g = new THREE.Group();
    g.name = 'lighting.__calibration';

    const stone = new THREE.MeshStandardMaterial({ color: 0xc9915a, roughness: 0.92, metalness: 0 });
    const pale = new THREE.MeshStandardMaterial({ color: 0xd4c19a, roughness: 0.88, metalness: 0 });

    const box = new THREE.BoxGeometry(1, 1, 1);
    const put = (mat, x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(box, mat);
      m.position.set(x, y + sy / 2, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };

    // Near cluster: tall thin pylons throw long raking shadows across the courtyard, the
    // exact case that exposes acne (too little bias) and peter-panning (too much).
    put(stone, -6, 0, 10, 2.4, 9, 2.4);
    put(stone, 2, 0, 14, 1.6, 6.5, 1.6);
    put(pale, 8, 0, 6, 3.2, 12, 3.2);
    put(stone, -12, 0, 2, 2.0, 4.0, 2.0);
    put(pale, 0, 0, -6, 5.0, 2.0, 22.0);       // low wall — shows contact shadow quality
    put(stone, 14, 0, 22, 2.2, 16, 2.2);
    put(pale, -20, 0, 26, 6.0, 9.0, 6.0);
    // Mid distance, for cascade 1/2 handover.
    put(stone, -30, 0, -40, 4, 22, 4);
    put(stone, 26, 0, -60, 5, 26, 5);

    const cone = new THREE.ConeGeometry(1, 1, 4, 1);
    const pyr = (x, z, h, base) => {
      const m = new THREE.Mesh(cone, pale);
      m.position.set(x, h / 2, z);
      m.scale.set(base, h, base);
      m.rotation.y = Math.PI / 4;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };
    pyr(-150, -190, 105, 105);   // §8.1 Great Pyramid
    pyr(95, -250, 72, 74);       // §8.1 second pyramid

    engine.scene.add(g);
    this._probe = g;
    engine.warn('lighting: placeholder world detected — temporary shadow/haze calibration ' +
                'rig added. It removes itself once ARCHITECTURE or TERRAIN lands.');
  }

  /* =================================================================== frame */

  _applyAtmosphere() {
    const A = evalAtmosphere(this.timeOfDay, this.atmosphere);

    for (let i = 0; i < this.cascades.length; i++) {
      const l = this.cascades[i].light;
      l.color.copy(A.keyColor);
      // Cascade 0 is the sun. Cascades 1..N−1 are shadow-map providers only — zero
      // intensity, so nothing double-lights and unpatched materials stay correctly exposed.
      l.intensity = i === 0 ? A.keyIntensity * TUNE.keyBoost : 0;
    }

    if (this._hemi) {
      this._hemi.color.copy(A.hemiSky);
      this._hemi.groundColor.copy(A.hemiGround);
    }
    if (this._bounce) {
      this._bounce.color.copy(A.bounceColor);
      this._bounce.position.copy(A.bounceDir).multiplyScalar(140);
      this._bounce.target.position.set(0, 0, 0);
    }
    if (this._ambient) this._ambient.color.copy(A.ambientColor);
    this._applyFill();

    this.rimDirection.copy(A.rimDir);
    this.rimColor.copy(A.rimColor);
    this._keyPayload.rim.strength = A.rimStrength;

    this._updateShafts();
  }

  update(dt, t) {
    const engine = this.engine;

    if (engine.debug.timeOfDay !== this.timeOfDay) {
      this.timeOfDay = engine.debug.timeOfDay;
      this._applyAtmosphere();
    }

    if (this._probe && (engine.has('architecture') || engine.has('terrain'))) {
      this._disposeProbe();
    }

    this._updateEnclosure(dt);
    this._applyFill();
    this._fitCascades();
    /* Fail OPEN: any defect in the cache must cost the optimisation, never the frame.
       Engine wraps update() as a unit (see the `|| 0` note below), so this cannot be
       allowed to throw past here — a NaN in cache bookkeeping must not cost the shafts. */
    try { this._updateShadowCache(); }
    catch (err) {
      TUNE.shadowStaticCache = false;
      this._restoreShadowAutoUpdate();
      this.engine.warn(`lighting: static shadow cache failed (${err?.message || err}) — legacy path restored`);
    }
    /* `|| 0` on purpose: everything after this line in update() — the shaft re-derive poll
       and `_updateShafts()` — is skipped for the whole frame if anything in here throws,
       because Engine wraps a module's update() as a unit. A NaN clock must not be able to
       cost the shafts their update. */
    this._updateLocalLights(t - (this._animT0 || 0));

    /* ARCHITECTURE and PROPS both init after this module, so the shaft set is built from the
       fallback constants first and re-derived from the real openings and the real sconces the
       moment they exist. Checked on a slow beat: this allocates, and §5 says update() must not. */
    if ((this._shaftPoll = (this._shaftPoll | 0) + 1) % 8 === 0) {
      const api = engine.get('architecture')?.api;
      if (archSignature(api) !== this._archSig) this._buildShafts();
      else if (this._localSig !== this.localLights.length) this._rebuildCones();
      // Beam lengths come from a COLLISION raycast; until the BVH is built they are the
      // analytic fall-back, so re-measure once it can actually answer.
      const col = engine.get('collision');
      if (!this._rayDone && col?.raycast && col.ready !== false) {
        this._rayDone = true;
        this._shaftSunKey = NaN;
      }
    }
    this._updateShafts();

    this._sweepMaterials();
    this._publishKeyLight();
  }

  /* ---------------------------------------------------------- enclosure --- */

  /**
   * How much sky is over the camera? A small fan of rays against COLLISION, on a slow beat
   * and damped, so walking under an architrave is a dissolve rather than a switch. Nothing is
   * applied while `encloseStrength` is 0 — see the TUNE note.
   *
   * **Graded, not binary, and the grading is the point.** A single up-ray answers a yes/no
   * question, and the two roofed shots need different answers: the tomb is sealed stone and
   * should lose nearly all of its sky fill, while the hypostyle hall is roofed but has eight
   * clerestory windows, four roof slots and an open south end and genuinely *is* lit by the
   * sky. One binary term forced one `encloseStrength` to serve both, so any value dark enough
   * for the tomb turned the hall into a cave. The fan reports the fraction of sky the camera
   * cannot see, so one knob can mean the same thing in both.
   *
   * **Measured for `interior` only: it returns 1.0 there** — all five rays blocked, which is
   * right for a sealed vault. The hall is expected to come out part-way (`temple`'s +z ray
   * leaves the roof past z −16 into open sky) but that has not been captured, so do not trust
   * the separation until someone reads `_encloseTarget` from `temple`'s camera.
   *
   * The offsets are a fixed set, not sampled, so the term is deterministic frame for frame —
   * the screenshot critic depends on that (§1).
   *
   * **Two consumers, two gates, and they are deliberately separate.** `encloseStrength` gates
   * the sky-FILL half and is still 0 (bracketed and refused, see TUNE). `holdEnclose` gates the
   * SHADE-BAND SCOPE half (§269/§271, PREREG-holdscope). Either one wanting the fan is enough to
   * run it; neither implies the other. That is why this is `||` and not a single flag: taking
   * the scope term must not silently buy a 10% darkening of every roofed frame in the game.
   *
   * **Why a teleport snaps instead of lerping, and why that is not a shortcut.** The damping
   * exists so that *walking* under an architrave is a dissolve. A camera cut is not a walk, and
   * every capture in this project steps with `dt = 0` (§251), which pins `k` to `1/60` — a
   * smoothed value would still be 5% of the way to its target at the captured frame, and the
   * scope decision would read as a tuning failure when it is a settle-time artefact. So a jump
   * of more than `ENCLOSE_JUMP` metres re-probes immediately and snaps. `setShot` teleports the
   * camera tens of metres, so every canonical frame is captured at a converged value, and
   * PREREG-holdscope I4 asserts `|enclosure - _encloseTarget| <= 0.01` rather than trusting it.
   */
  _updateEnclosure(dt) {
    const wantFill = TUNE.encloseStrength > 0;
    const wantScope = TUNE.holdEnclose >= 0;
    if (!wantFill && !wantScope) {
      /* `_encloseAt` is cleared too, not just the value. It records where the last fan was cast
         from, and while the term is off no fan is being cast — leaving the old position behind
         would make the next frame after a re-enable look like "no jump", so the fan would wait
         for its 6-frame beat and the smoothed value would crawl from 0 at 1/60 per frame under a
         dt = 0 capture. An A/B that toggles this knob between arms would then score an
         unconverged value on every arm after the first. */
      this.enclosure = 0; this._encloseTarget = 0; this._encloseAt = null;
      return;
    }
    const engine = this.engine;
    engine.camera.getWorldPosition(_camPos);
    const jumped = !this._encloseAt || _camPos.distanceToSquared(this._encloseAt) > ENCLOSE_JUMP * ENCLOSE_JUMP;
    if (jumped || (this._enclosePoll = (this._enclosePoll | 0) + 1) % TUNE.encloseEvery === 0) {
      const col = engine.get('collision');
      let hits = 0, cast = 0;
      if (col?.raycast) {
        for (let i = 0; i < ENCLOSE_FAN.length; i++) {
          _v3.copy(ENCLOSE_FAN[i]);
          cast++;
          try {
            /* `_encloseHit` is passed as the OUT parameter on purpose. Collision hands results
               out of an 8-deep ring (`_pools.ray`), and this fan casts five rays in one frame —
               enough to rotate five eighths of that ring under any other system that is holding a
               ray result while it casts again. Before this term had a consumer the fan never ran,
               so the pressure was hypothetical; it is not any more. `raycast(o, d, m, opts, out)`
               writes into `out` and skips the pool entirely, which removes the interaction rather
               than testing for it. */
            const hit = col.raycast(_camPos, _v3, TUNE.encloseProbe, null, _encloseHit);
            if (hit?.hit) hits++;
          } catch { /* BVH not built yet — treat this ray as open sky */ }
        }
      }
      /* A fan that cast nothing (no collision module, BVH not built) is NOT "open sky" for the
         scope decision — it is no information. Hold the previous reading instead of publishing a
         0 that would switch the held band on inside a tomb for one frame. */
      if (cast > 0) {
        this._encloseTarget = hits / cast;
        (this._encloseAt ||= new THREE.Vector3()).copy(_camPos);
        if (jumped) this.enclosure = this._encloseTarget;
      }
    }
    const k = Math.min(1, TUNE.encloseLerp * Math.max(dt || 0, 1 / 240));
    this.enclosure += ((this._encloseTarget || 0) - this.enclosure) * k;
  }

  /**
   * The scope decision the shade band consumes: 1 = this camera is under open sky.
   *
   * Hysteresis, not a bare compare. The two states are deliberately far apart (§269: the band is
   * effectively binary, and the midpoint is mud), so a camera loitering on the threshold would
   * otherwise flip a large visual change every few frames. `holdEncloseHyst` is the full width
   * of the dead band; inside it the previous decision stands.
   *
   * Returns `null` when scoping is off, which is what stops ToonMaterial writing the uniform at
   * all — the pre-holdscope build published nothing here and a harness poke of `uShadowHold` has
   * to keep sticking (ToonMaterial's uniform block says so in as many words).
   */
  _skyOpenDecision() {
    if (TUNE.holdEnclose < 0) { this._skyOpen = null; return null; }
    const h = Math.max(0, TUNE.holdEncloseHyst) * 0.5;
    const e = this.enclosure;
    if (e <= TUNE.holdEnclose - h) this._skyOpen = 1;
    else if (e >= TUNE.holdEnclose + h) this._skyOpen = 0;
    else if (this._skyOpen === null || this._skyOpen === undefined) {
      /* First evaluation inside the dead band has no previous decision to keep. Fail to the
         PROTECTED side: an unnecessary teal shadow is a defect, a held band in a tomb is the
         frame §269 measured being destroyed. */
      this._skyOpen = 0;
    }
    return this._skyOpen;
  }

  /** Sky-fill multiplier for the current enclosure. 1 = open sky. */
  _encloseFill(bounce) {
    if (TUNE.encloseStrength <= 0) return 1;
    const s = TUNE.encloseStrength * this.enclosure * (bounce ? TUNE.encloseBounce : 1);
    return 1 - THREE.MathUtils.clamp(s, 0, 0.95);
  }

  /**
   * Fill intensities, always recomputed from the atmosphere's base values rather than
   * scaled in place — the enclosure term moves every frame and a multiply-in-place would
   * compound it away to nothing within a second.
   */
  _applyFill() {
    const A = this.atmosphere;
    const sky = this._encloseFill(false);
    const gnd = this._encloseFill(true);
    /* `debug.fillScale` — an IN-PAGE lever on the whole smooth fill (hemi + ambient), added so
       critic pass 7's "there is no toon ramp" can be tested without a source edit per arm.
       Default 1 is bit-identical to shipping. See PREREG-ramp1.md; it exists to be measured, not
       to be tuned by hand. */
    const fillScale = this.engine?.debug?.fillScale ?? 1;
    if (this._hemi) this._hemi.intensity = A.hemiIntensity * TUNE.hemiBoost * sky * fillScale;
    if (this._bounce) this._bounce.intensity = A.bounceIntensity * TUNE.bounceBoost * gnd;
    if (this._ambient) this._ambient.intensity = A.ambientIntensity * TUNE.ambientBoost * sky * fillScale;
    this._fillSky = sky;
    this._fillGround = gnd;
  }

  /* --------------------------------------------------------- cascade fit --- */

  _fitCascades() {
    const cam = this.engine.camera;
    if (!cam) return;
    const A = this.atmosphere;

    _lightDir.copy(A.keyDir).multiplyScalar(-1).normalize();   // direction light travels

    // Stable basis perpendicular to the light. Fixed for a fixed sun, so the snap grid
    // does not rotate under the shadow — the other half of "shadows don't crawl".
    const upRef = Math.abs(_lightDir.y) > 0.95 ? WORLD_FWD : WORLD_UP;
    _right.crossVectors(upRef, _lightDir).normalize();
    _up.crossVectors(_lightDir, _right).normalize();

    cam.getWorldPosition(_camPos);
    cam.getWorldDirection(_v1);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    const tanH = tanV * cam.aspect;
    const k2 = tanV * tanV + tanH * tanH;

    for (let i = 0; i < this.cascades.length; i++) {
      const c = this.cascades[i];
      const n = this._splits[i], f = this._splits[i + 1];
      c.near = n; c.far = f;

      /* Closed-form bounding sphere of the frustum slice. Equating the near-ring and
         far-ring corner distances to a centre on the view axis gives
         z = (n+f)(1+k²)/2; when that runs past the far plane the far ring alone bounds
         the slice. A sphere is rotation-invariant, so the ortho box stops resizing when
         the camera turns — half of why shadows stop crawling. */
      let z = 0.5 * (n + f) * (1 + k2);
      let radius;
      if (z >= f) {
        z = f;
        radius = Math.max(f * Math.sqrt(k2), Math.hypot(n * Math.sqrt(k2), f - n));
      } else {
        radius = Math.sqrt((f - z) * (f - z) + f * f * k2);
      }
      radius = Math.ceil(radius / TUNE.radiusQuantum) * TUNE.radiusQuantum;
      c.radius = radius;

      // Slice centre in world space, along the camera's forward axis.
      _centre.copy(_camPos).addScaledVector(_v1, z);

      /* Texel snap. Express the centre in the light's own basis and round the two
         lateral components to whole shadow-map texels. Sub-texel motion of the box is
         exactly what makes shadow edges shimmer as the camera walks. */
      const texel = (2 * radius) / c.mapSize;
      c.texel = texel;
      const a = Math.round(_centre.dot(_right) / texel) * texel;
      const b = Math.round(_centre.dot(_up) / texel) * texel;
      const d = Math.round(_centre.dot(_lightDir) / 0.5) * 0.5;
      _v2.set(0, 0, 0)
        .addScaledVector(_right, a)
        .addScaledVector(_up, b)
        .addScaledVector(_lightDir, d);

      /* Depth reach for casters shadowing this slice: a caster `h` above the slice sits
         `h / sin(elevation)` back along the light from where its shadow lands. `keyDir.y`
         is sin(elevation) for a unit direction. The 0.28 floor stops a horizon-grazing sun
         from asking for a kilometre of box — below ~16° the pad clamps and the furthest
         shadows land off every canonical framing anyway. */
      const sinEl = Math.max(0.28, Math.abs(A.keyDir.y));
      const pad = THREE.MathUtils.clamp(
        TUNE.casterCeiling / sinEl, TUNE.casterPadMin, TUNE.casterPadMax);
      const back = radius + pad;

      c.light.position.copy(_v2).addScaledVector(_lightDir, -back);
      c.light.target.position.copy(_v2);
      c.light.target.updateMatrixWorld();

      const sc = c.camera;
      const farPlane = back + radius + 1;
      if (sc.left !== -radius || sc.far !== farPlane) {
        sc.left = -radius; sc.right = radius;
        sc.top = radius; sc.bottom = -radius;
        sc.near = 0.05;
        sc.far = farPlane;
        sc.updateProjectionMatrix();
      }

      /* Bias, derived rather than guessed. normalBias walks the shadow lookup along the
         surface normal by a fixed number of texels, which is the only offset that scales
         correctly from a 3 cm near cascade to a 35 cm far one; the depth bias stays a
         constant handful of centimetres in world units. Together they kill acne without
         detaching contact shadows (peter-panning). */
      const sh = c.light.shadow;
      sh.normalBias = THREE.MathUtils.clamp(
        texel * TUNE.normalBiasTexels, TUNE.normalBiasClamp[0], TUNE.normalBiasClamp[1]);
      sh.bias = -TUNE.depthBiasMetres / (farPlane - sc.near);

      if (!c.map && c.light.shadow.map) c.map = c.light.shadow.map;
    }
  }

  /* ------------------------------------- static-caster shadow cache (#20) --- */

  /**
   * Cache the static casters' depth per far cascade; re-render only the dynamics per frame.
   *
   * Invalidation triggers, enumerated (each maps to a term of the cache key or a signature):
   *   1. snapped-box identity — target/light positions (texel-snapped in _fitCascades),
   *      radius, ortho far plane, map size;
   *   2. key direction — folded into the target/light position pair (position is a function
   *      of keyDir), so any sun/moon motion refreshes every frame: graceful degradation to
   *      legacy cost, never a stale map;
   *   3. static-set membership — census re-runs on a slow beat (%8, the _buildShafts
   *      cadence); a removed/reparented mesh trips the per-frame fingerprint immediately;
   *   4. static motion, state or geometry — per-frame fingerprint over matrixWorld,
   *      castShadow, material.side, EFFECTIVE visibility (own flag AND every ancestor's,
   *      because zone reveals toggle group visibility, not mesh visibility), and geometry
   *      content (object id, index/position versions, drawRange — an in-place edit that
   *      bumps no version is trigger 7's job, a raw typed-array write is invisible here);
   *   5. quality / cascade rebuild — _rebuildForQuality disposes the cache first;
   *   6. map reallocation — the live shadow.map's identity is part of the key;
   *   7. anything else — invalidateShadowCache() for agents mutating what the census
   *      cannot see.
   *
   * three's own WebGLShadowMap is kept off these cascades via shadow.autoUpdate = false;
   * shadow.updateMatrices() is called here because three only calls it on the path we just
   * disabled, and a stale sample matrix under a moved box is §15-class invisible wrongness.
   */
  _updateShadowCache() {
    const on = TUNE.shadowStaticCache && this.cascades.length > TUNE.shadowCacheFrom;
    if (!on) {
      if (this._cacheEngaged) { this._restoreShadowAutoUpdate(); this._cacheEngaged = false; }
      this._cacheStats.engaged = false;
      return;
    }
    // Warm-up: three allocates shadow.map inside its own first render. Until every cached
    // cascade has a live map (and its FBO), run legacy — the first frame after any rebuild.
    const renderer = this.engine.renderer;
    for (let i = TUNE.shadowCacheFrom; i < this.cascades.length; i++) {
      const sh = this.cascades[i].light.shadow;
      if (!sh.map || !renderer.properties.get(sh.map).__webglFramebuffer) {
        if (this._cacheEngaged) { this._restoreShadowAutoUpdate(); this._cacheEngaged = false; }
        this._cacheStats.engaged = false;   // probes must not read stale engagement here
        return;
      }
    }

    if (!this._staticCasters || (this._cachePoll++ & 7) === 0) this._censusCasters();

    // Per-frame fingerprint of everything that can change the statics' depth image.
    let sig = 0;
    const list = this._staticCasters;
    for (let k = 0; k < list.length; k++) {
      const m = list[k];
      if (!m.parent) { sig = NaN; break; }          // removed since census → refresh now
      let vis = m.visible ? 1 : 0;
      for (let p = m.parent; vis && p; p = p.parent) if (!p.visible) vis = 0;
      /* An invisible caster contributes **nothing** to the depth image, so nothing about it
         except its own visibility may enter the fingerprint. It used to contribute its full
         transform, which meant an invisible mesh that merely moved dirtied the cache and
         forced a refresh that reproduced the previous map pixel for pixel.
         That is not hypothetical here: `main.js`'s central sweep turns `castShadow` on for
         every opaque mesh, which includes ARCHITECTURE's collider proxies
         (`architecture:colliders`, invisible unless `showColliders` is on), so the static set
         is dominated by meshes that cannot cast anything.
         **Why the fix is here and not a `visible` test in the census, which is the cheaper-
         looking version.** Dropping invisible meshes from `_staticCasters` would also drop
         them from this loop, and this loop is the *only* thing that notices a reveal: the
         census re-runs on `%8`, so a mesh that becomes visible would keep a stale shadow map
         for up to eight frames. Both live reveal paths flip an ancestor's flag rather than
         the mesh's — `Architecture`'s `showColliders` handler and its `tomb` zone list — so
         they are exactly the case that would lag. Keeping the member and zeroing its
         *contribution* gets the saving with immediate detection intact: a visible member
         always contributes at least the +11, so any flip in either direction moves `sig`. */
      if (!vis) continue;
      const e = m.matrixWorld.elements;
      /* Geometry-content terms (PREREG-fingerprint-geometry.md — closes what was recorded
         here as a KNOWN GAP under ledger #20). A static whose GEOMETRY is edited while its
         transform stands still — position attribute rewritten in place, index buffer
         swapped, drawRange changed, or the whole geometry object replaced — must
         invalidate like a moved one, or it serves the OLD shape's shadow indefinitely:
         §15's exact failure shape, latent only because today's world builds statics once.
         `id` catches replacement, the two `version`s catch in-place edits (three bumps
         them on `needsUpdate`), and drawRange catches partial-draw changes. drawRange's
         default count is Infinity, and Infinity in the sum would freeze `sig` at Infinity
         — equal to itself forever, hiding every LATER edit — so it maps to −1, finite and
         distinct from any real count ≥ 0. All reads, ~5 flops on the existing loop.
         An in-place edit that bumps no version still needs `invalidateShadowCache()`,
         same as before — no fingerprint can see a raw typed-array write. */
      const g = m.geometry;
      const drc = g ? (g.drawRange.count === Infinity ? -1 : g.drawRange.count) : 0;
      sig += e[12] * 3.1 + e[13] * 5.7 + e[14] * 7.3 + e[0] + e[5] + e[10]
           + 11 + (m.castShadow ? 17 : 0) + (m.material?.side ?? 0) * 23
           + (m.isInstancedMesh ? m.instanceMatrix.version * 29 : 0)
           + (g ? g.id * 31 + (g.index ? g.index.version : 0) * 37
                + (g.attributes.position ? g.attributes.position.version : 0) * 41
                + g.drawRange.start * 43 + drc * 47
              : 0);
    }
    const dirty = !(sig === this._staticSig) || this._seenEpoch !== this._cacheEpoch;

    const st = this._cacheStats;
    st.engaged = true;
    for (let i = TUNE.shadowCacheFrom; i < this.cascades.length; i++) {
      const c = this.cascades[i];
      const sh = c.light.shadow;
      /* three's own path runs updateMatrices AFTER scene.updateMatrixWorld inside render;
         here in the update phase the light's matrixWorld is one frame stale after
         _fitCascades moved it. Refresh both explicitly so the map, the sample matrix and
         the cache key all describe the SAME box — a one-frame skew between map and matrix
         is exactly the invisible-wrongness class §15 documents. */
      c.light.updateMatrixWorld(true);
      c.light.target.updateMatrixWorld(true);
      sh.updateMatrices(c.light);

      const key = (c._cacheKey ||= new Float64Array(9));
      const tp = c.light.target.position, lp = c.light.position;
      const stale = dirty || c._cacheMapRef !== sh.map ||
        key[0] !== tp.x || key[1] !== tp.y || key[2] !== tp.z ||
        key[3] !== lp.x || key[4] !== lp.y || key[5] !== lp.z ||
        key[6] !== c.radius || key[7] !== c.camera.far || key[8] !== c.mapSize;
      if (stale) {
        key[0] = tp.x; key[1] = tp.y; key[2] = tp.z;
        key[3] = lp.x; key[4] = lp.y; key[5] = lp.z;
        key[6] = c.radius; key[7] = c.camera.far; key[8] = c.mapSize;
        c._cacheMapRef = sh.map;
        this._renderCacheStatics(c);
        st.refreshes++;
      }
      if (this._blitCacheDepth(c)) {
        st.blits++;
        this._renderCacheDynamics(c);
        sh.autoUpdate = false;
      } else {
        // FBO not resolvable this frame — legacy-render this cascade rather than show a
        // stale or empty map. Costs the saving for a frame, never correctness.
        sh.autoUpdate = true;
      }
    }
    this._staticSig = sig;
    this._seenEpoch = this._cacheEpoch;
    this._cacheEngaged = true;
  }

  /** Census + layer tagging. Layers 28/29/30 partition the statics by the side their depth
   *  must be rasterised with (three's shadowSide mapping: Front→Back, Back→Front,
   *  Double→Double); 31 is the dynamics. Layer 0 membership is never touched, so the main
   *  camera and c0's stock shadow pass are blind to all of this. */
  _censusCasters() {
    const statics = (this._staticCasters ||= []);
    for (let k = 0; k < statics.length; k++) {
      statics[k].layers.disable(28); statics[k].layers.disable(29); statics[k].layers.disable(30);
    }
    statics.length = 0;
    let dyn = 0;
    const isDynRoot = (o) => o.name === 'sly_root' || o.name === 'guard_root';
    this.engine.scene.traverse((o) => {
      if (!o.isMesh || !o.castShadow) { o.layers?.disable?.(31); return; }
      let dynamic = !!o.isSkinnedMesh;
      for (let p = o; !dynamic && p; p = p.parent) dynamic = isDynRoot(p);
      if (dynamic) { o.layers.enable(31); dyn++; return; }
      o.layers.disable(31);
      const side = o.material?.shadowSide ?? o.material?.side ?? THREE.FrontSide;
      // three renders shadow depth with the mapped side; mirror the mapping per mesh.
      o.layers.enable(side === THREE.DoubleSide ? 29 : side === THREE.BackSide ? 28 : 30);
      statics.push(o);
    });
    this._dynCount = dyn;
    /* Reset the fingerprint ONLY when the membership actually changed.
       This line used to be an unconditional `this._staticSig = NaN`, which made every 8th
       frame dirty regardless of whether anything moved — the census runs on a `%8` beat, and
       NaN never compares equal, so each census forced a full static refresh in every cached
       cascade. Measured on a static camera with a quiescent world: 26 refreshes per 100
       frames, i.e. the cache was paying its full bill on 12.5% of frames for nothing. It also
       made the V3 null control's pass band arithmetically unreachable, so that control could
       not discriminate any fingerprint implementation from any other.
       The reset was never the detector: the per-frame loop above iterates `_staticCasters`
       itself, so an appearing member adds its transform + visibility terms and a vanishing one
       stops contributing — membership moves `sig` on the very next frame anyway, and a removed
       mesh trips the `!m.parent` guard even earlier. This hash only closes the one gap that
       leaves: a float sum can in principle collide across a swap, so `h` is a different
       function of a different input (identity and order, not transforms) and a masked change
       must defeat both at once. `o.id` is three's monotonic per-object counter, never reused
       in a session; the polynomial is order-sensitive, so an add, a removal, a substitution, a
       side-class change or a reparent that reorders traversal all move it. */
    let h = 0x9e37 | 0;
    for (let k = 0; k < statics.length; k++) {
      const o = statics[k];
      h = (Math.imul(h, 31) + o.id) | 0;
      h = (Math.imul(h, 31) + ((o.material?.shadowSide ?? o.material?.side ?? 0) | 0)) | 0;
    }
    h = (Math.imul(h, 31) + statics.length) | 0;
    if (h !== this._memberSig) { this._memberSig = h; this._staticSig = NaN; }
  }

  _cacheDepthMat(side) {
    const mats = (this._cacheDepthMats ||= {});
    return (mats[side] ||= new THREE.MeshDepthMaterial({ side, blending: THREE.NoBlending }));
  }

  _makeCacheRT(size) {
    const rt = new THREE.WebGLRenderTarget(size, size);
    // Mirror three r185's PCF shadow-map depth allocation exactly (UnsignedIntType →
    // DEPTH_COMPONENT24) so gl.blitFramebuffer sees identical depth formats. No
    // compareFunction: this target is only ever blitted, never texture-sampled.
    rt.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    rt.texture.name = 'lighting.shadowCache';
    return rt;
  }

  /** Render the static casters into the cascade's private depth target, per side class. */
  _renderCacheStatics(c) {
    const renderer = this.engine.renderer;
    const scene = this.engine.scene;
    const cam = c.camera;
    const rt = (c._staticRT ||= this._makeCacheRT(c.mapSize));

    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevOverride = scene.overrideMaterial;
    const prevMask = cam.layers.mask;
    renderer.shadowMap.autoUpdate = false;   // our offscreen renders must not re-enter c0
    renderer.autoClear = false;
    renderer.setRenderTarget(rt);
    renderer.clear(true, true, false);
    for (const [layer, side] of [[30, THREE.BackSide], [29, THREE.DoubleSide], [28, THREE.FrontSide]]) {
      cam.layers.set(layer);
      scene.overrideMaterial = this._cacheDepthMat(side);
      renderer.render(scene, cam);
    }
    scene.overrideMaterial = prevOverride;
    cam.layers.mask = prevMask;
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAuto;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
  }

  /** Depth-blit the cached statics into the live shadow map. Uses renderer.state's tracked
   *  binds so three's GL state cache stays coherent. */
  _blitCacheDepth(c) {
    const renderer = this.engine.renderer;
    const props = renderer.properties;
    const src = c._staticRT && props.get(c._staticRT).__webglFramebuffer;
    const dst = c.light.shadow.map && props.get(c.light.shadow.map).__webglFramebuffer;
    if (!src || !dst) return false;
    const gl = renderer.getContext();
    const state = renderer.state;
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(0, 0, c.mapSize, c.mapSize, 0, 0, c.mapSize, c.mapSize,
                       gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    state.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  /** Draw the dynamics over the blitted static depth — no clear; the depth test keeps the
   *  nearer of cached-static vs dynamic, which is exactly what a full redraw would keep. */
  _renderCacheDynamics(c) {
    const renderer = this.engine.renderer;
    const scene = this.engine.scene;
    const cam = c.camera;

    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevOverride = scene.overrideMaterial;
    const prevMask = cam.layers.mask;
    const info = renderer.info.render;
    const d0 = info.calls, t0 = info.triangles;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    renderer.setRenderTarget(c.light.shadow.map);
    cam.layers.set(31);
    scene.overrideMaterial = this._cacheDepthMat(THREE.BackSide);
    renderer.render(scene, cam);
    scene.overrideMaterial = prevOverride;
    cam.layers.mask = prevMask;
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAuto;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    this._cacheStats.dynDraws += info.calls - d0;
    this._cacheStats.dynTris += info.triangles - t0;
  }

  _restoreShadowAutoUpdate() {
    for (const c of this.cascades) {
      c.light.shadow.autoUpdate = true;
      c.light.shadow.needsUpdate = true;   // stock path re-renders immediately, no stale frame
    }
  }

  /** Public: force a full static refresh (e.g. an agent moved world geometry mid-session). */
  invalidateShadowCache() { this._cacheEpoch++; }

  _disposeShadowCache() {
    this._restoreShadowAutoUpdate();
    for (const c of this.cascades) {
      if (c._staticRT) { c._staticRT.dispose(); c._staticRT = null; }
      c._cacheKey = null;
      c._cacheMapRef = null;
    }
    this._cacheEngaged = false;
    this._cacheEpoch++;
    this._staticSig = NaN;
    /* Cleared so a rebuilt cache re-censuses from scratch: without this, a dispose followed by
       an identical set would hash equal and skip its reset. Harmless today (the `_staticSig`
       above already forces the next frame dirty) — set explicitly so the property the census
       fix is documented to rely on does not depend on that coincidence holding. */
    this._memberSig = undefined;
    this._staticCasters = null;
  }

  /* ------------------------------------------------------- local lights --- */

  /**
   * @param {number} t seconds *since the current shot was staged*, not engine time.
   *
   * The distinction is the whole point. The flicker below is two-octave noise sampled at
   * `t * flickerRate`, and it moves both a light's intensity and its position — up to
   * `flickerPos * flicker * 4` metres of wobble, which drags the lit pool and every shadow
   * that light casts along with it. Sampled on the engine clock, the phase at capture is a
   * function of how long the boot took, so two runs of the same shot come back with the
   * braziers at different brightnesses and their shadows in different places. That is noise
   * with no cause in the scene, and it is exactly the noise that makes a real change to a
   * frame impossible to distinguish from run-to-run drift. FX already rebases its clock at
   * staging and documents why; this is the same clock and the same reason.
   */
  _updateLocalLights(t) {
    const engine = this.engine;
    const cam = engine.camera;
    if (cam) cam.getWorldPosition(_camPos);

    const lights = this.localLights;
    const nl = lights.length;
    const cull2 = TUNE.localCullDistance * TUNE.localCullDistance;

    /* Distance cull + nearest-N promotion. Insertion order on a preallocated index array:
       no Array#sort, no closures, no garbage. */
    const order = this._order;
    order.length = 0;
    for (let i = 0; i < nl; i++) {
      const h = lights[i];
      if (!h.enabled) { h._dist = 1e9; continue; }
      h._dist = cam ? h.position.distanceToSquared(_camPos) : 0;
      if (h._dist > cull2) continue;
      let j = order.length;
      order.push(i);
      while (j > 0 && lights[order[j - 1]]._dist > h._dist) {
        order[j] = order[j - 1];
        order[j - 1] = i;
        j--;
      }
    }

    const cap = this._pool.length;
    const promote = Math.min(cap, order.length);

    // Release slots whose owner dropped out of the nearest-N set.
    for (let s = 0; s < cap; s++) {
      const slot = this._pool[s];
      if (!slot.owner) continue;
      let keep = false;
      for (let k = 0; k < promote; k++) if (lights[order[k]] === slot.owner) { keep = true; break; }
      if (!keep) {
        slot.owner._slot = null;
        slot.owner = null;
        slot.light.visible = false;
      }
    }

    for (let k = 0; k < promote; k++) {
      const h = lights[order[k]];
      if (!h._slot) {
        let slot = null;
        for (let s = 0; s < cap; s++) if (!this._pool[s].owner) { slot = this._pool[s]; break; }
        if (!slot) continue;
        slot.owner = h;
        h._slot = slot;
      }
      const L = h._slot.light;

      /* Flicker: two-octave noise in intensity *and* position. The positional wobble is
         what actually sells it — a flame's shadow should breathe, not just its brightness. */
      let amp = 1;
      if (h.flicker > 0) {
        const n1 = flickerNoise(t * TUNE.flickerRate, h._seed);
        const n2 = flickerNoise(t * TUNE.flickerRate * 0.61 + 11.0, h._seed * 1.7);
        amp = 1 + (n1 - 0.5) * 2 * h.flicker * 0.55 + (n2 - 0.5) * h.flicker * 0.3;
        h._wob.set(
          (flickerNoise(t * 3.1, h._seed + 3) - 0.5) * 2,
          (flickerNoise(t * 4.3, h._seed + 9) - 0.5) * 2 + 0.35,
          (flickerNoise(t * 2.7, h._seed + 21) - 0.5) * 2
        ).multiplyScalar(TUNE.flickerPos * h.flicker * 4);
      } else {
        h._wob.set(0, 0, 0);
      }

      // Distance fade so a promoted light never pops in at full strength.
      const fade = 1 - THREE.MathUtils.smoothstep(
        Math.sqrt(h._dist), TUNE.localCullDistance * 0.72, TUNE.localCullDistance);
      h._live = Math.max(0, h.intensity * amp * fade);

      L.visible = h._live > 0.001;
      L.position.copy(h.position).add(h._wob);
      L.color.copy(h.color);
      L.intensity = h._live;
      L.distance = h.radius;
      L.decay = 2;
    }
  }

  /* ------------------------------------------------- cascade shader patch --- */

  /**
   * Opt a material into cascade shadows. Built-in three materials only — SHADING's
   * ShaderMaterials get the same data through setKeyLight() and do their own lookup.
   * Safe to call repeatedly.
   */
  enableCascades(material) {
    if (!material || this._patched.has(material.uuid)) return material;
    if (material.userData?.csm === false) return material;
    if (material.isShaderMaterial || material.isRawShaderMaterial) return material;
    if (!PATCHABLE.has(material.type)) return material;

    /* No captured cascade state: the closure reads `this` at compile time, so the one
       wrap a material ever gets stays correct across _rebuildForQuality. */
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      try { prev?.call(material, shader, renderer); } catch { /* not ours to fix */ }
      const n = this._cascadeCount;
      shader.uniforms.csmSplits = this._csmUniforms.csmSplits;
      shader.uniforms.csmFade = this._csmUniforms.csmFade;
      const chunk = THREE.ShaderChunk.lights_fragment_begin
        .replace(CSM_SHADOW_LINE, CSM_SHADOW_PATCH);
      if (chunk === THREE.ShaderChunk.lights_fragment_begin) {
        // three's chunk changed shape under us — bail loudly rather than silently
        // shipping a scene with no cascade blending.
        this.engine.warn('lighting: CSM patch anchor not found in lights_fragment_begin; ' +
                         'cascade blending disabled (cascade 0 still shadows).');
        return;
      }
      shader.fragmentShader =
        `#define CSM_CASCADES ${n}\n` + CSM_DECLS(n) +
        shader.fragmentShader
          .replace('#include <shadowmap_pars_fragment>',
                   '#include <shadowmap_pars_fragment>\n' + csmShadowFn(n))
          .replace('#include <lights_fragment_begin>', chunk);
    };
    const prevKey = material.customProgramCacheKey;
    material.customProgramCacheKey =
      () => `csm${this._cascadeCount}|${prevKey ? prevKey.call(material) : ''}`;
    material.needsUpdate = true;
    this._patched.add(material.uuid);
    this._patchedMaterials().push(material);
    return material;
  }

  /** Walk the scene occasionally and adopt any new built-in material. Cheap and
   *  allocation-free; a full traverse of a few thousand nodes every third of a second. */
  _sweepMaterials() {
    if (this._cascadeCount < 2) return;
    if (--this._sweep > 0) return;
    this._sweep = 20;
    this._sweepFn ||= (obj) => {
      const m = obj.material;
      if (!m) return;
      if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) this.enableCascades(m[i]); }
      else this.enableCascades(m);
    };
    this.engine.scene.traverse(this._sweepFn);
  }

  /* ------------------------------------------------------- hand-off ------- */

  _publishKeyLight() {
    const A = this.atmosphere;
    const p = this._keyPayload;

    p.direction.copy(A.keyDir);
    p.color.copy(A.keyColor);
    p.intensity = A.keyIntensity * TUNE.keyBoost;
    p.ambient.color.copy(A.ambientColor);
    // SHADING consumes this, not the scene lights, so the enclosure term has to reach it
    // through the payload or half the world would ignore it.
    /* `debug.fillScale` has to reach HERE, not only the scene lights: SHADING reads this payload
       rather than the lights, so scaling only `this._ambient` above would move a third of the
       world and leave every toon material untouched — a lever that half-works is worse than none,
       because the capture would look like a weak effect instead of a broken instrument. */
    p.ambient.intensity = A.ambientIntensity * TUNE.ambientBoost * (this._fillSky ?? 1)
      * (this.engine?.debug?.fillScale ?? 1);
    p.ambient.sky.copy(A.hemiSky);
    p.ambient.ground.copy(A.hemiGround);
    p.ambient.enclosure = this.enclosure;
    /* The scope decision for §269's held shade band (PREREG-holdscope §2). `undefined` — not 0 —
       when scoping is off, because 0 is a legitimate decision ("this camera is roofed") and the
       payload object is reused every frame: leaving a stale 0 behind would silently pin the whole
       world to the protected branch the moment anyone turned the term off. SHADING writes
       `uShadowHold` only when this is a number. */
    p.ambient.skyOpen = this._skyOpenDecision() ?? undefined;
    p.ambient.skyFill = this._fillSky ?? 1;
    p.ambient.groundFill = this._fillGround ?? 1;
    p.ambient.floor = A.shadowFloor;
    p.rim.strength = A.rimStrength;
    p.timeOfDay = this.timeOfDay;
    p.nightAmount = A.nightAmount;

    const sky = this.engine.get('sky');
    p.fog = sky?.fogParams ?? A.fog;

    const shading = this.engine.get('shading');
    if (shading?.setKeyLight) {
      try { shading.setKeyLight(p); }
      catch (err) { this.engine.warn(`shading.setKeyLight threw: ${err?.message || err}`); }
    }
  }

  /* ------------------------------------------------------------ teardown --- */

  _disposeProbe() {
    if (!this._probe) return;
    const seen = new Set();
    this._probe.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
      if (o.material && !seen.has(o.material.uuid)) { seen.add(o.material.uuid); o.material.dispose(); }
    });
    this.engine.scene.remove(this._probe);
    this._probe = null;
  }

  dispose() {
    for (const off of this._offEvents) off?.();
    this._offEvents.length = 0;
    this._disposeShadowCache();
    for (const k in (this._cacheDepthMats || {})) this._cacheDepthMats[k].dispose();
    this._cacheDepthMats = null;
    const scene = this.engine.scene;
    for (const c of this.cascades) {
      scene.remove(c.light); scene.remove(c.light.target);
      c.light.shadow?.dispose?.(); c.light.dispose?.();
    }
    this.cascades.length = 0;
    for (const s of this._pool) { scene.remove(s.light); s.light.dispose?.(); }
    this._pool.length = 0;
    if (this._hemi) { scene.remove(this._hemi); this._hemi.dispose?.(); }
    if (this._bounce) { scene.remove(this._bounce); scene.remove(this._bounce.target); this._bounce.dispose?.(); }
    if (this._ambient) { scene.remove(this._ambient); this._ambient.dispose?.(); }
    this._disposeProbe();
  }
}

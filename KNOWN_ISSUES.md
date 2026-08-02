# Known issues

State as of the last session. Written so the next person doesn't re-derive what's already
been eliminated — on this container a single capture takes 2–5 minutes, so each ruled-out
hypothesis below cost real time.

---

## 1. Cast shadows — **root cause found; the shadow term was never zero**

The whole "shadow term ≈ 0 across the frame" reading was an artefact of the diagnostic, not a
property of the shadow pipeline. `debugShadow()` writes its channels into `outgoingLight`,
which then goes through the *entire* PostFX chain — AgX, `saturation 1.30`, the split-tone, and
(at the time) an AO pass that was multiplying every pixel by a flat `0.545` because its shader
had never compiled. Green (`receiveShadow`, a hard 1.0) survives that; red (the shadow term)
is compressed toward the floor, so the frame comes out uniformly green and reads as "everything
is occluded". Read straight off the framebuffer with the chain bypassed, the term over the hero
frame is `mean 0.470`, and clearing `castShadow` on all 332 casters takes it to `0.981` — so the
maps, the cascade matrices, the sampler type and the bias were all correct the entire time, and
every hypothesis previously eliminated was eliminated correctly. Restricted to ground-plane
normals, 28 % of the visible floor is fully shadowed and 29 % is penumbra, and in the graded
frame lit ground sits at luma `0.310` against shadowed ground at `0.121` — a 2.6:1 step. What
was actually missing was *legibility*, and three real bugs were feeding that: everything past
34 m fell into a cascade fitted to ±417 m (41 cm shadow texels, 61 cm normal bias), so
mid-ground shadows had no edges — `splitLambda` is now `0.78`, which moves the c0/c1 seam to
~57 m and puts the whole courtyard in the near cascade at ~5 cm texels; `Engine.js` was setting
`PCFSoftShadowMap`, which three r185 deprecates and which has no entry in `WebGLProgram`'s
`shadowMapTypeDefines`, so every program built during `main.js`'s `renderer.compile()` warm-up
got `SHADOWMAP_TYPE_BASIC` (a plain `sampler2D`) against depth textures allocated with hardware
comparison — latent, because the first real draw relinks them, but exactly the mismatch that
produces a uniformly zero term, and now set to `PCFShadowMap`; and `main.js`'s central shadow
sweep opts out on `userData.isOutlineShell` while `Outline.js` marks shells `userData.slyOutline`,
so every inverted-hull ink shell was a shadow caster — and since a shell is its host's geometry
at identity with a `BackSide` material, which three flips to `FrontSide` for the depth pass, each
one wrote its host's *lit* surface into the map at coincident depth. `Shading.outline()` now
sets both keys and clears the flags.

**The hue gap that was open here is now closed — see §3.** The shadows were rendering as a
darker, *more saturated* version of the sunlit hue. That turned out not to be a tuning question
at all: `_refreshShadowColor()` was mixing the shadow tint toward the sand bounce in linear
radiance, where the bounce is ~35x brighter in red, so the shadow *light* itself was leaving
that function magenta.

**Also settled here:** the character is not excluded from the caster set. Measured in-page —
`sly_body` is `castShadow`, opaque, `frustumCulled false`, and lands at NDC (0.73, 0.24, 0.69)
inside cascade 0's ±40 m box; clearing its `castShadow` changes 1.14% of the `sly-closeup`
frame. What the critic saw is framing: at `tod 0.80` the sun is 21° up and almost due west, so
his shadow runs east — toward a camera that is standing east of him — and leaves a 34° frame
behind the near plane. Re-posed with a morning sun the same rig throws a full-length shadow.

---

## 2. Frame reads busy — texture detail overwhelms large shapes

`AGENTS.md §7.3`'s squint test still fails: at a glance the masonry reads as high-frequency
rectangular noise rather than as coherent stone, so the big architectural shapes stop reading.

Partly addressed — `Materials.js` gained a `VARIATION` damping factor (0.42) on per-block
ashlar colour, which was previously swinging ±0.8 around the midpoint and taking neighbouring
blocks from fully dark to fully light. Still more to do: the derived normal strength
(`derive()`'s `bump` per recipe) is the next suspect, and the hieroglyph recipes tile at a
high enough frequency on large walls to read as pattern noise rather than carving.

---

## 3. Warm/cool balance — **root cause found; it was never the three knobs**

The shadow hue was chased for five capture cycles through `shadowBounceMix` / `shadowSat` /
`shadowWash` and every one of them was a dead end, because none of them was the cause.

`_refreshShadowColor()` mixed the palette shadow tint toward the sand bounce **in linear
radiance**. `#2a3f66` is `(0.023, 0.050, 0.133)` linear; `#e8a852` is `(0.807, 0.392, 0.084)`.
A 20% lerp between those is not "20% of the way toward warm", it is *swamped* by warm: the
shadow light left that function at R/G **1.52**, magenta, with green as its darkest channel and
more red in it than the sun. So every shaded surface was lit by something warmer than the key —
which is exactly what the critic measured — and turning the wash up simply added more magenta,
which is what "the frame went lavender" was. The mix now runs at matched luminance, so the
parameter means what its name says, and the light leaves at `(0.142, 0.189, 0.423)`.

Measured on `hero`, same surfaces, before → after:

| surface | before | after |
|---|---|---|
| shadowed pier | `#9b5146` R/G 1.92 B/max 0.45 | `#594662` R/G 1.26 B/max 1.11 |
| shadowed wall | `#91514c` R/G 1.78 B/max 0.52 | `#524f6e` R/G 1.04 B/max 1.34 |
| lit foreground slab | `#ca8157` R/G 1.57 B/max 0.43 | `#c07a59` R/G 1.58 B/max 0.46 |

Two supporting corrections, both in the same direction and both documented at their sites: the
hemispheric fill was handing every vertical face 50% of an unattenuated sand bounce, and
`shadowSat` was *raising* albedo saturation before the coloured multiply, which left warm stone
with no blue for a violet light to work with.

**Method note for whoever tunes this next.** R/G cannot see blue, and the failure mode here is
a blue-channel one. Measure `B / max(R,G)` alongside it, and put the frame on screen every
single iteration — this defect has now twice produced numbers that were on target while the
image was plainly wrong.

> **The "after" column above is NOT a validated target. Do not defend a value with it.**
>
> Those numbers record what one fix happened to produce. They were never checked against
> reference art or against the frame as a whole. I then used them to rule that `temple` was "at
> target" and to stop a shading agent from changing the wash — without opening the PNG. When I
> finally looked at `shots/tx2/hero.png` and `courtyard.png`, the frames are overwhelmingly
> lavender-grey: shaded sandstone reads as violet concrete, the golden-hour key barely survives
> outside a few horizontal faces, and the whole image is two-tone orange/indigo with no middle.
> An art director shown that beside Odyssey's Sand Kingdom picks Odyssey instantly.
>
> A measured value sitting inside this band means only that it matches the last change someone
> made. **The frame is the authority; this table is a record.** Anyone tuning here should be
> looking at the image and at the palette in §2.2, not at these six numbers.

**Why the five cycles above were unwinnable, found much later.** `PAL.shadowTintPeak` clamps the
shadow light's brightest channel, and `k` hits that clamp at **3.904** while *every* daylight
shot asks for more — hero 6.50, temple 6.82, courtyard 6.52, combat 6.63, interior 9.79. So all
of them receive the **identical** shadow light `(0.123, 0.175, 0.423)` no matter what the scene
is doing, and **`shadowFloor` is a dead knob in daylight**: it changes nothing until it drops
below 0.075 (0.050 for `interior`).

Three consequences worth carrying:

- The daylight shadow magnitude is set by `shadowTintPeak` **and by nothing else**. Tuning
  `shadowWash`, `shadowSat`, `shadowBounceMix` or `shadowFloor` against a daylight frame is
  tuning behind a clamp.
- It explains the uniformity. Every daylight shot going lavender in the *same* way is what you
  would expect from every daylight shot receiving the same shadow light.
- A knob that is clamped still *moves* when you change it in the other direction, which is how
  it survived five capture cycles of A/B without anyone noticing it was pinned.

---

## 4. Guards module — **landed**, and the `guard` shot's subject is now verified present

`src/ai/Guard.js` exports `Guards`, walks the 11-entry `ROSTER`, wires one `GuardModel` rig per
entry to a `GuardAnim` and a `Senses`, and renders the vision cone as geometry rather than as a
budgeted local light. `main.js:31` registers it.

**The `guard` shot's subject had never been checked, and it turns out to be there.** This
mattered because `setShot` (`Debug.js:93`) stages *only the player* — it teleports the character
and freezes its pose and does nothing at all to the garrison — so who appears in the guard sheet
is decided entirely by `buildRoutes(TUNE.seed)` and each roster entry's `u` phase, neither of
which anything in `Shots.js` controls. `charvis.mjs` now reports it: exactly one guard is in
that frame, **#1 `temple` on `courtyard_ring` at u = 0.00, 6.5 m out, NDC (-0.02, -0.47), 297 px
tall, unoccluded** — dead centre and large. The camera's target (-17.0, 1.1, 28.0) sits on that
route's u = 0 point, so the aim was deliberate; it simply had no check behind it until now.

**A mistake worth naming, because it produced a plausible table.** The first version of that
probe evaluated every guard at `u = 0` instead of at its roster phase, which put two guards on
the same square metre and moved four others. Every number in it looked reasonable. `u` is a
per-guard offset; read the roster, not the route.

Props is done too — `src/world/Props.js` assembles the colossi, sphinx avenue, Anubis pair,
gilded Ra, braziers, banners, treasure and collectibles into 12 merged draw calls.

Still open in `src/ai/`: `GuardModel.js:76` carries its own `eyeWhite: 0xf7f3e6` and reproduces
the blown-sclera and straddling-terminator defect just fixed on Sly (see §9).

---

## 5. One shader failed to link — **fixed**

The `VALIDATE_STATUS false` in every capture was `postfx.gtao`: `uNearFar` was declared both
in `passes/AO.js` and in the `GLSL_VIEW` snippet it includes, and GLSL rejects the
redefinition. The AO program therefore never compiled and the AO pass has never run for a
single frame — `uAO` sampled as 0, so the composite multiplied the whole image by a flat
`mix(1, 0.35, 0.7) = 0.545`. That constant darkening is what the exposure/lift tuning in
`PostFX.TUNE` had been compensating for, so those values are now over-corrected in the other
direction and want a re-bracket now that occlusion is real.

---

## 6. Critic passes — two run, baseline 4.2

`tools/critic.mjs` and `tools/CRITIC.md` are built and working. Two adversarial passes have
scored the ten canonical shots against the §7.3 fail-list; see `progress/critic-pass1.md` and
`progress/critic-pass2.md`. The pass floor is 8 and the standing baseline is **4.2**.

Note when reading pass 1 and 2: several of their findings were *symptoms with the wrong cause
attached*, and two were reported against frames that were not showing what anyone thought they
were showing (see §7). Treat their observations as reliable and their diagnoses as hypotheses.

---

## 7. The canonical shots were not framing what they claimed — **fixed**

Three defects in `Shots.js`, all found with arithmetic rather than by eye, none of which
produces an error or a warning:

- **`temple` framed from 0.78 m inside a nave column.** The camera sat at `(9, 3.4, -22)`; the
  nave column at `(8, -22)` has a radius of 1.78 m at that height. A camera inside geometry
  still renders, so nothing ever complained. Now in the centre of the nave at the south end,
  3.6 m clear of the nearest column.
- **`temple` and `courtyard` had the character below the bottom edge of the frame**, at NDC y
  −1.97 and −1.21. Critic pass 2 reported this as "the character casts no shadow in 4 frames".
  The shadow was the symptom; the character being off-screen was the defect.
- **`sly-closeup` was constrained by yaw, not by the camera.** At yaw 0.55 his face pointed
  128° away from a sun at azimuth 187°, so no camera placement could light it — a sweep of
  6480 placements failed the face-lighting test on every one, because face lighting is a
  function of yaw and the sun alone.

All ten shots now put the character's ground contact **inside the frustum** with ≥50% of his
cast shadow visible, except `guard`, where he is behind the camera on purpose because the guard
is the subject. That exception is documented in place so it is not re-reported.

**Correction — "inside the frustum" is not "visible", and I originally wrote this as though it
were.** A render-based measurement later found that hiding the character in `courtyard` changes
**zero pixels**: he is not visible in that shot at all, despite passing every projection check.
The checkers below do pure projection — no occlusion test, and no verification that the staging
path actually moved him. A character behind a wall, or one the staging never placed, passes them
identically to one standing in clear view.

**Settled, and the settling found a second defect.** `tools/charvis.mjs` now does the test that
was missing: CPU-skin the real character in the shot's own pose, stage him where the shot says,
and cast a ray from the lens to each of ~500 surface points against real level triangles. All
ten shots, 2.6 s, no renderer and no capture lock. Result — **eight shots are 94–100% visible,
`guard` is behind the camera by design, and `courtyard` was 65.8%**: legs 70% occluded, torso
50%, head 16%, by `arch:court:hieroglyph_wall`. That is a *different* occluder from the west
colossus throne that the earlier fix cleared. The fix moved him out of one thing and into
another, and **the check that cleared it used five samples** — enough to find a throne block
that swallows him whole, not enough to see a wall cutting him at the waist. When a coarse
instrument clears a change, that is the instrument's resolution talking, not the change.
He is now at (-6.6, 5.12, 12.4), 100% of 506 samples visible, and 5.12 is the *measured* deck
height at that xz rather than the 5.2 assumed from `night` 8 cm away.

**The feet band went through two wrong explanations before the right one. Both were mine.**

The paving hits on `temple`, `interior`, `night` and `combat` (46–56% of the **feet** band, 0%
everywhere else) are not contact artefacts — that was the first wrong answer. The blocked
samples sit 0.9–27 cm *below* the character's own root with the occluder a median 0.33–0.64 m
in front, so the floor is correctly hiding points that are underground. The sneak clips author
their lowest vertex 28–29 cm under the root (`sneak_idle` −0.283, `sneak_walk` −0.287,
`cane_combo_3` −0.107, against `run` +0.165 and `idle_confident` +0.002), and the percentages
track that sink depth exactly.

The second wrong answer was mine too, and it is the instructive one. I read `Rig.footIK`, saw
that it drives each ankle to `groundY + ikAnkle + clipLift`, saw `Animation.freezePose` set
`_ikW = 1` for every non-airborne clip, and concluded the runtime corrects the sink — so the
buried feet were my tool's artefact and the frames were fine. **Every step of that was true
about what the code is specified to do, and the code did not do it.**

`Rig.aimBone` borrowed the module scratch `_v0`. `twoBoneIK` builds the direction it wants into
`_v0` and passes it as `dirWorld`, and `aimBone`'s first line overwrote `_v0` with the bone's
*current* direction — so `setFromUnitVectors(_v0, dirWorld)` compared the vector against itself,
returned the identity quaternion, and rotated nothing. **Both** call sites aliased. Every foot
plant returned `true` and moved no leg, in every clip, since the IK was written. So the captures
genuinely did render a buried character, and the tool was right for the wrong reason.

Fixed with a private `_vAim`. Ankles now land on target (`crouch_idle` −0.082 → 0.086); worst-case
boot penetration across the 52 clips **−0.450 → −0.188 m**.

**Still not zero, so do not read charvis's feet band as solved either.** With working IK
`sneak_idle` retains ~15.5 cm of boot below the floor, and 39 grounded clips still have some.
The cause is identified and deliberately not shipped: the foot inherits the IK-solved shin's
pitch, and `footIK`'s foot-levelling block is gated on `nrm.y < 0.9995`, so it runs only on
*sloped* ground and is skipped on flat ground — which is exactly where it is needed. That is a
one-token change with a blast radius across every grounded clip, left unshipped rather than
verified blind.

Three lessons, in the order they cost something: reading what code is specified to do is not
evidence that it does it; a knob that reports success is not a knob that did anything; and
**a tool that omits a runtime correction does not report "unknown", it reports a confident
wrong number** — this one correlated so cleanly with pose that it looked like a finding twice,
once as a defect and once as an artefact.

Ruled out so far by reading the code: the staging path is wired correctly. `Controller.js` is
registered as `'movement'` (`main.js:29`) and does have `teleport()` at `Controller.js:1007`, so
`Debug.js`'s `movement?.teleport` branch fires, and `SlyModel`'s own handler correctly defers to
it. So this is not a "nothing stages him" bug. Still open: whether he is occluded, or whether
the 14 physics frames the harness steps after teleporting move him. Settle it with a
visible/hidden A/B, not with more projection.

Four checkers are kept in `tools/` — `camclear.mjs`, `shadowframe.mjs`, `framesweep.mjs`,
`playerplace.mjs`. **None of them boots the renderer**, so they run in about a second where a
capture costs 2–5 minutes. Run `camclear.mjs` after moving any column or camera.

**A fix recorded here had not actually propagated, and the stale number was still being quoted
months later.** The behind-camera guard — a point behind the lens still projects to a finite
NDC pair, so `guard` reported a plausible **483 px** for a character who is behind it by design
— landed in `charview.mjs` and never reached `shotsil.mjs` or `shotsil_vn.mjs`, which went on
printing the exact figure this section claims was fixed. Both now return null. `charview.mjs`
carried a second bug of the same family: `ROWS = 540` hardcoded, a resolution nothing in this
project ever captures at, so every "he is N px tall" figure it produced was in units nobody
uses — including ones used to justify moving a camera. It now takes `--rows`, defaulting to the
harness's 900; the critic captures at 720, and a figure is 1.67× taller at 900 than at 540.
**When a bug has a shape, grep for the shape.** Two tools, same defect, one fix.

---

## 8. Open handoffs between modules

Recorded so they are not re-derived:

- ~~**The bright cool contact line**~~ — **fixed. It was the surface fresnel rim term.**
  `fres = pow(1 - N·V, 3.1)` is high both at a silhouette *and* on a flat face merely tilted
  away from the eye, and a floor running away from a standing camera is the second case over
  most of its length. Gated on normal-turn-per-screen-height plus a convexity sign test; both
  are exactly zero on a plane at any grazing angle. `hero` paving 1536 → 107 artefact px,
  `guard` contact 655 → 4, and the contact is now the darkest thing in its vertical profile.

  **Correct the record on this one.** An earlier pass reported the rim "eliminated — bit-
  identical across a rim-gate change". That was true and misleading: the test moved *PostFX's
  screen-space rim*. The surface fresnel is a **separate term** and had never been tested. If
  you are eliminating "the rim", say which of the two.

  Worth carrying: disabling the shadow wash changed **83.8%** of the frame and left the defect
  bit-intact. A knob moving the image proves it is connected, not that it is the cause.
- ~~**Dune ripple "chips"**~~ — **fixed by the same change**, and the shared cause is the
  point. The ripples are a *normal map*, so the mesh under them is planar and the new gate is
  identically zero there: 902 artefact px → 0. Reducing the ripple slope 4.3× scaled the
  artefact down but could never remove it, because slope was never what produced it.
- ~~**Not yet verified after the rim gate:** `temple`, `interior`, `night`, `traversal`,
  `combat`, `courtyard`.~~ **All six are now measured** (rim1/rim2/term1 boots; full record
  §17, §20, §22–§24). Artefact side: `interior` 2788 → 37 causal px (visFlat 1028 → 0),
  `traversal`/`combat` residuals went thin (thinness 87.5 → 99.6% / 57.1 → 97.0%, i.e. the
  planar wash is gone and what counts now is edge-shaped), `courtyard` 8,520 → 8,610 is the
  metric counting its own intended edge rim — §24.4 confirms the §8 prediction, there was no
  planar artefact there to remove. Retention side: the gates read 93–99% on the character's
  own rim band (`temple`/`sly-closeup`/`night`, §24.1) after c612db0's subject exemption;
  the one real regression found on the way — `temple`'s subject rim at 29.4% under the
  screen-space planar gate — was fixed by that exemption, not by relaxing the gate
  (planarlo ran −1.7 pts against a required +1.5 and was declined). Still open from that
  sweep: `hero`'s 1,692 px kerb band (§24.3, gates pass it correctly, not fixable from the
  gate knobs) and `combat`'s additive-model anomaly (§24.4, flagged before quoting any
  `combat` rim number). **Re-measured on the current tree 2026-08-02** (§32; rim1's retention
  column predates `rimSkinExempt` and is void): edge-ring retention passes on `temple` (+4.95)
  and `interior` (+4.77); `courtyard`/`combat` are strong but want a post-skinfix refresh;
  `traversal`'s negative mean is a bright-against-paving framing, not a regression. **`night`
  is the one genuinely weak shot** — +1.69 and negative inward, a dark figure on a dark parapet
  — and it now has its own sealed A/B with a falsifier that kills the lever if the gain does
  not survive the tonemap.
- **Stone mean albedo is 4–5% darker family-wide** (granite −13%) since the grime film landed.
  If LIGHTING wants it back, the lever is `ashlar`'s `tone`, not the grime.
- **The paving UV fix is measured-correct and visually unverified.** `Kit.pavingField` replaced
  the InstancedMesh with a merged field projected *after* placement, taking UV density from
  0.208/0.228/0.221 to **0.500 on all three** (p10..p90 all 0.500, no residual), and the
  exact-repetition period from one slab — 2.38 m, aligned to every joint — to the texture's own
  8.8 m. Cost is genuinely nothing: 315,358 → 315,358 triangles, 44 → 44 meshes, verified
  against a pristine `git archive HEAD` build, with `cast: false` preserved so the slabs stay
  out of the caster set. **But nobody has seen a frame at the corrected scale**, and this is a
  2.4× change to 36% of `interior` and 14% of `hero`. A texture authored to look right while
  stretched need not look right unstretched. Check it on the next capture; if the corrected
  scale reads worse, say so rather than tuning `UV_PER_M` to hide it.
- **Frustum culling has been eaten by the merge.** 8 of 10 shots bill the *entire* 315k
  architecture triangle count, because `arch:hall:hieroglyph_wall` is a single 75k mesh spanning
  36 m of z and any camera seeing one course pays for all of it. Billing the same geometry at
  triangle granularity gives the ceiling on re-bucketing by z-band: `interior` 91%, `guard` 90%,
  `combat` 75%, `temple` 66%, `sly-closeup` 55%, `traversal` 50%, `hero` 49%, `courtyard` 40%,
  `night` 38%, `dunes` 0%. Real, but architecture is only ~11% of the frame's triangles, so
  recovering even 60% of it is ~7% — **this is not where the 2× budget overage lives.** Headless
  attribution confirms the overage is ~89% outside `src/world/**`: `traversal` architecture is
  39 draws / 309k against the frame's 408 / 2.763M.

  **The budget question is now answered end-to-end, and "the 2× overage" was never scene
  geometry at all.** `budget.mjs` finally ran in-page (it had never executed — see the
  `__THREE` note) with the paving frames in the same boot. The frustum-visible scene is
  **under §1's 250 draws / 1.2M triangles in every shot measured**: `hero` 91 / 0.629M,
  `interior` 62 / 0.379M, `guard` 55 / 0.409M, `night` 93 / 0.639M. What `report.json` quotes
  is `renderer.info.render.calls/triangles` (`Engine.js:273`), which counts **every pass** —
  three shadow cascades re-drawing all casters (cascade frusta exceed the camera's), AO,
  outline, composite — a **4.5–5.4× pass multiplication over an in-budget scene**. The
  headless cross-checks hold (`interior` 17/125k predicted vs 17/125k measured, exact), so the
  table's rows are trusted. **Owner of the breach as measured: RENDER/LIGHTING** — cascade
  caster culling and shadow distance, not scene geometry, and deleting visible geometry would
  be spending in the wrong place. Two cheap secondary items: TERRAIN bills a constant 162k
  tris in every shot *including inside the sealed tomb* (sand rings + nile drawn fully
  occluded in `interior`; wants the zone-hide treatment Architecture gives the tomb), and FX
  spends 13 draws on empty emitters in all four shots measured.

  **The paving fix is now frame-verified: better, not worse.** Same boot, same ROIs against
  the pre-fix `rim1/interior-base.png`: floor local contrast 0.0577 → 0.0661 (+15%),
  floor/wall texture-energy ratio 0.676 → 0.775, wall control bit-stable at 0.0853. The
  featureless pale panels are gone and no repeat is countable in frame. The failure mode has
  *moved*, not vanished: every slab now states the same crackle motif, so the floor reads
  slightly monotonous — that is the paving *recipe's* crack network, a TEXTURES question, not
  density or geometry. `UV_PER_M` stays.
- **The cel ramp needs geometry, not shader work.** The 3-band quantiser is correct; the scene
  is boxes and faceted cylinders, so there is almost no smooth normal gradient for it to band.

  **Quote 0.14%–2.33% of architecture pixels showing band-edge crossings, not the 0.5%–1.7%
  first reported, and say that eight of ten shots are under 0.5%.** The first measurement had
  *two* errors, and only one of them had been flagged. It used a fixed light vector instead of
  each shot's own `keyDir` — and it put the band edges at ⅓ and ⅔, when `slyRamp` spreads
  terminators between `uTermLo` and `uTermHi`, which `ToonMaterial.TUNE` sets to **0.14 and
  0.52** deliberately, so the first terminator sits past zero. 0.14 lands on an entirely
  different population of surfaces. The correction *reorders* the set rather than scaling it:
  `night` and `guard` are moonlit with keys in the opposite quadrant from the fixed vector, so
  `night` fell 1.46% → **0.31%** (4.7× overstated, from second-best to near-bottom) while
  `guard` nearly doubled to 0.50%. `temple` at 2.33% remains the best case — it was right by
  luck. `hero` 0.57% → 0.16%, `sly-closeup` 0.65% → 0.14%.

  **The unpredicted result is a different failure mode from the one in the record.** Measuring
  *coverage* — pixels whose `ndl` sits inside a terminator's soft window — gives `guard`
  **24.03%** against 0.50% crossings and `temple` 18.36% against 2.33%. That gap is whole flat
  face populations landing **on** a terminator rather than inside a band:

  ```
  temple:  +Z-facing walls  ndl 0.15  vs terminator 0.14
  guard:   +X-facing walls  ndl 0.51  vs terminator 0.52
  ```

  Those surfaces render a flat mid-transition value with no gradient, and at ±0.024 they are one
  normal-map perturbation from flipping band — a plausible latent source of blotching. It is
  half ARCHITECTURE's (the normals) and half SHADING's (the terminator positions), and **a
  fixed-light measurement could not have found it.** Caveat that stays attached: measured with
  no shadows, normal maps, AO or post, so it is an upper bound on what the geometry can offer.

  **Weight by projected solid angle, not by world m² — it changes the answer by 2.5–7×.** The
  first pass weighted by surface area, which put the background *pyramids* at 32–80% of "area"
  and top of every ranking while the near columns sat at 1–2%. Screen coverage falls with 1/d².
  Re-weighted by what the camera actually sees (`tools/ndl.mjs`, reproduced independently):

  ```
  temple     lo 0.14 -> 39.75%   hi 0.52 ->  3.69%   combined 43.44%
  guard      lo 0.14 ->  0.58%   hi 0.52 -> 42.09%   combined 42.67%
  interior                                            combined  2.54%
  courtyard                                           combined  1.62%
  hero                                                combined  1.07%
  ```

  So it is **far worse than the m²-weighted 17.5%/5.8%** on the two shots it touches, and
  essentially absent on the other three — the coinciding populations are precisely the near,
  large, screen-filling surfaces. Two shots have ~43% of visible architecture sitting on a band
  boundary; the rest are clean.

  Two things fall out. The smoothing already spent **is working where it was put**:
  `arch:hall:column_papyrus` carries a band edge inside a primitive across 25.2% of its own
  area, the best of any near-field mesh. And the residual is nameable — the big flat masonry and
  paving meshes deliver **1.2–5.7%** (`arch:court:sandstone_block` 1.2%, `arch:tomb:hieroglyph_wall`
  1.6%, `paving:court` 3.6%) while each occupies 22–39% of frame.

  **Third instance in this file family of a diagnostic inventing the defect it exists to find**,
  after `raster.mjs`'s missing near-plane clip and the `|du|/|dp|` UV audit's per-vertex axis
  artefact. Caught because "the pyramids dominate every shot" was too convenient an answer.
- **Light shafts have no forward-scatter term, so one gain serves a 7.2× range.** A shaft is
  visible *because* of forward scatter, and `SHAFT_FRAG` (`src/fx/Particles.js`) has no term
  for it: `vViewZ` is depth fade, `vX`/`vS` are cross-section and along-beam, and `vAxial` is a
  billboard degeneracy guard that is symmetric and cannot tell looking into a beam from looking
  away from one. Blade brightness is independent of the camera–sun angle. At each shot's own
  `A.mieG` the Henyey–Greenstein weight across the ten cameras ranges **48.9×** (6.3× among the
  daylight shots alone), which the shader renders flat — so one `shaftGain` can be right in at
  most one frame. This is a second, independent explanation for "the open-air blades measured as
  drawn and read as absent", alongside the additive-headroom argument `SHAFT_FRAG`'s own comment
  makes. `hgPhase` already exists at `Atmosphere.js:460` and is live in `Sky.js:368`, so there
  is a tested implementation to reuse. Reproduce with `node tools/shaftphase.mjs`.

  **I published this table with the dot product inverted, and the allocation was backwards.**
  The scattering angle runs between the direction light *travels* and the direction it is
  scattered toward the lens: `cosθ = beam · toCam` with `beam = −key` and `toCam = −fwd`, and
  those negations cancel, so `cosθ = key · fwd`. I computed `fwd · (−key)`, which returns
  180° − θ. Corrected ordering, most forward-scattering first: `night` 23°, **`hero` 56°**,
  `combat` 57°, `dunes` 60°, `traversal` 69°, `temple` 79°, `guard` 106°, `interior` 111°,
  `sly-closeup` 111°, **`courtyard` 127°**. So `courtyard` — which I named as the one
  into-the-sun frame where a blade should blaze — is the **most backlit shot in the set**, and
  `hero` is the frame looking into the sun. Independently checkable three ways: §8.1 puts the
  sun west, `evalAtmosphere(0.76).sunDir` is `(−0.899, 0.438, 0)`, and `courtyard`'s camera
  looks east-north-east. It also predicts, correctly, that `courtyard`'s beams travel *away*
  from its camera — which FX had already found by A/B.

  **The instructive part is where the error lived.** That file's header spelled the convention
  out in prose *specifically* to guard against this, saying "getting this backwards inverts
  every conclusion below, which is why it is spelled out" — and the line below it did the
  opposite of the paragraph above it. **Writing a convention down is not implementing it**, and
  a comment asserting correctness is the easiest thing in a file to read past. The structural
  conclusion survived unchanged because it depends on the *spread*, not on which shot is which;
  every per-shot recommendation built on it did not.

  **The axial guard is cleared, not suspected.** `vAxial` maxes at 0.62 (`night`) against its
  0.86 threshold, so its fade is exactly 1.00 in all ten shots and it never touches a canonical
  frame. `courtyard` sits at 0.21, so a phase term added there will land cleanly.
- **The shadow residual is now green, not blue** — and this is the second time the same trap
  has been walked into from the opposite side. After the `shadowTintPeak` fix, shadow `B/max`
  went 1.050 → **0.855** (below 1.0 for the first time, blue inversion gone) while `R/G` went
  1.276 → **1.468**. Green is now the darkest channel and that is what reads as magenta. §3
  below warns "R/G cannot see blue — measure B/max too"; **the inverse now applies, and
  measuring only B/max would call this solved.** Report R/G, B/max and per-channel means
  together or you will trade one cast for another.

  **But do not score that 1.468 against §2.2's 0.667, which is what I first asked for.** 0.667
  is `#2a3f66`'s ratio — a *light* colour. A pixel is light × albedo, and `sandstone` is itself
  R/G ≈ 2.05 linear (`#c9915a` → 0.578/0.283), so a shadowed sandstone surface has a floor near
  **0.935** and cannot reach 0.667 at any `shadowBounceMix`. Comparing a surface measurement to
  a light spec is a category error, and it made a knob look like it had moved the wrong way when
  it was already near its own floor. Two independent things also turn out to be true here:
  `shadowBounceMix` was described everywhere as "the live hue lever" while being a `PAL`
  constant with **no setter at all** (now in `TUNE`), and the term actually making green the
  darkest channel is the **split-tone**, whose cool-leg gains are (0.914, 0.999, 1.265) — a
  1.384 B/R swing, i.e. exactly the reported 38%. At mix 0.20 the surface is darkest-in-blue
  *before* the split and darkest-in-green *after* it.

  **Correction, by toggle rather than by argument: the split-tone is compensating, not
  causing.** The paragraph above reads the split's gains and concludes it makes green darkest.
  Switching it off measures the opposite — shadow hue goes **266° → 278°, worse**, and so do the
  other two suspects that were argued the same way (AgX bypass 274°, wash off 277°). All three
  were named by inspecting a term's coefficients; none survives being turned off. The split's
  cool leg is G/R **1.09**, so it *raises* G relative to R and is partly undoing the defect.

  **Second correction, to the correction above: it answered a channel-order claim with a hue
  measurement, and those are different statistics.** "Makes green the darkest channel" is
  `argmin(R,G,B)`; "266° → 278°" is an angle. A leg that raises B moves both at once — hue
  rotates toward blue *and* B climbs past G — so "the opposite" was a category difference, not a
  contradiction, and the same trap caught both writers. Measured with the ordering statistic
  itself (`t16f.mjs`, `argmin` printed with the split on and off): green is **already** the
  darkest channel in the scene-linear composite, before the grade exists, at `shadowBounceMix`
  0.20 and at the shipped value; the split leaves the ordering unchanged in every cell but one,
  where it moves G **out** of last place. So the original claim is withdrawn on its own terms,
  not on the hue toggle's — and the real owner is the albedo multiply, as below. Two statistics,
  two verdicts, one term: name which one a sign belongs to before quoting it.

  The real owner is the **albedo multiply**, and it is a share argument rather than a hue one:
  88.4% of shadow-side radiance is albedo-multiplied (the multiplied leg 57.3% plus the fill
  31.1%) and therefore inherits sandstone's own linear G/R of **0.483**, while the one
  albedo-free term — the wash, at G/R 1.336 and healthy — is only 11.6% and far too small to
  rescue G. No cool term is making green dark; the stone is, and everything downstream is
  scaling it. This is the same category error as the ≤226° acceptance below, arriving from the
  other side: **read a coefficient and you learn what a term would do alone; toggle it and you
  learn what it does here.**
- ~~**Gold has no specular path in the shader at all.**~~ **False, and it was my widening of a
  true finding.** TEXTURES reported the narrow, correct fact: *this file's* `goldSpec` reaches
  no specular term. I relayed it as "no specular path at all". The shader has a full metal
  branch and has had one since before this was raised — `specAmt = uSpec * (1 - 0.75*rgh) *
  mix(1.0, 3.4, slyMetal)`, `specTint = mix(uSpecColor, alb*2.0 + uSpecColor*0.25, slyMetal)`,
  plus `metalEnv` — at `toon.glsl.js:433–449`, present at `23befef`. And `Materials.js:148–190`
  *already explains* that `goldSpec` not reaching `uSpecColor` is **correct by design**: a
  metal's specular is tinted by the metal, so the shader derives gold's highlight from the
  albedo rather than from a palette hex. **Adding a gold spec lobe would double an existing
  highlight.** Not implemented, deliberately.

  The B/max 1.08–1.39 defect is real; the cause is elsewhere. `metalEnv` and the diffuse are
  both multiplied by gold's albedo (linear blue ~0.05), so neither can produce it. The exposed
  terms are the additive shadow wash and rim, the multiplicative AO tint, and the split leg —
  and `diff *= mix(1.0, 0.20, slyMetal)` strips **68% of gold's own colour** at metal 0.85.
  That is the one-line A/B, after the cast fix.

  **68% is the metal-0.85 value — the world's gilding — and it has been quoted for the cane,
  where it is wrong.** `SlyModel.js:3331` binarises `metal: spec.metal ? 1 : 0`, so every gilded
  surface on the character runs uMetal **1.0** and the multiply is 0.20: **80% removed.** Corrected
  here at the declaration site as well as in §48.3, because §34 is the record of what leaving a
  constant right in one place and wrong in another costs. Quote the uMetal with the percentage.

  **The general lesson, which is mine.** A narrow measured claim ("`goldSpec` reaches no
  specular term") and a broad architectural one ("there is no specular path") differ by one
  word and by everything. I relayed the second, opened a task on it, and wrote it in here as
  fact. The agent that owns the file checked and refused to implement it.

  **§7.3's "gold needs dark occlusion": the dark base is authored and does not survive to the
  frame. TEXTURES' side is verified correct; the loss is downstream.** `hieroglyph_gilded` is
  **28.7% of `hero`** (corrected `angsize`, keyed on material name), so it decides this line.
  Measured off the built maps, before any lighting — the CPU lab, so no shading term can
  confound it:

  | | albedo luma p5/p50/p95 | AO **p1/p5/p50** (mislabelled p5/p50/p95 below — see correction) |
  |---|---|---|
  | `hieroglyph_gilded`, **built texture** | 92 / 166 / 193 | 0.247 / 0.416 / **0.992** |
  | `hieroglyph_gilded`, **in frame** | 162 / 186 / 217 | *(no instrument — see correction)* |
  | `gold_leaf`, built texture | 70 / 130 / 218 | 0.047 / 0.047 / 0.733 |
  | `bronze_aged`, built texture | 76 / 93 / 148 | 0.090 / 0.784 / 0.980 |

  > **CORRECTION, 2026-08-02 — this whole bullet rested on a mislabelled column.**
  > `tools/texlab.mjs:170` emits `aoP: [1, 5, 50]`. The triple is **p1 / p5 / p50**, and it has
  > been read as p5/p50/p95 here, in `PREREG-aokey.md`, and in two *shipped source comments*.
  > So the "authored 0.412 median" is the **5th percentile**; re-measured, `hieroglyph_gilded`
  > is p1 0.247 · p5 0.416 · p25 0.722 · **p50 0.992** · mean 0.865. **The authored median is
  > 0.992 — identical to the "in frame" figure this bullet calls a loss.** The two numbers
  > being compared were the same number wearing different labels.
  > Worse, **the "in frame" AO median had no instrument at all**: nothing in the repo reads an
  > AO channel back from a rendered frame, and the only 0.992 anywhere is `aoP[2]` itself. The
  > in-frame albedo row came from an *albedo-debug* capture rather than a graded frame; on the
  > real frame that population spans **3.879** (lit subset 1.508), not 1.34:1.
  > Everything below about "the occlusion is gone" is withdrawn. What survives: `ao` genuinely
  > does not multiply the direct key term, which is a real shader fact — but it was sized
  > against percentiles two steps off, over-predicting roughly 5×, and on `hero` it can only
  > reach the **1.4%** of gilded pixels that are key-lit.

  The texture authors a 2.1:1 value span with a genuine dark floor and a strong occlusion
  gradient. In frame that span is **1.34:1 and the occlusion is gone** — which is exactly "a
  bright yellow surface reading as painted plaster", and it is not a texture-authoring problem.
  So the earlier report that this recipe *has* no dark base was measuring the frame and
  attributing it to the source.

  Two named candidates, both outside `src/textures/**`, neither yet A/B'd:
  - `ToonMaterial.TUNE.bakedAO = 0.55` with `ao = mix(1.0, ao, uAoStrength)` takes an authored
    0.412 to **0.677** before anything else touches it. That is arithmetic, not a hypothesis —
    but it does not reach 0.992 on its own, so it is at most part of it.
  - The `aoMap` UV channel. `orm` is bound as both `roughnessMap` and `aoMap`
    (`Textures.js:289-291`, R=AO / G=rough / B=metal, which matches `packORM`), and
    `toon.glsl.js:316` samples `texture2D(aoMap, vAoMapUv).r`. `Kit.normaliseAttrs`
    (`Kit.js:51`) **deletes every attribute that is not `position`, `normal` or `uv`**, so no
    architecture geometry carries a second UV set at all. If anything in the chain resolves
    `vAoMapUv` to `uv1`, the AO term is sampling nothing. **Do not take this as established —
    it is a code reading, and this file's §7 records what reading code as evidence of its
    behaviour costs.** Settle it with the one-line A/B (force `aoMap.channel = 0`, or paint the
    sampled `ao` to the framebuffer) rather than by arguing about three.js defaults.

  Owned by SHADING (`ToonMaterial.js`, `toon.glsl.js`). TEXTURES' baseline above is frozen and
  is the before-measurement for whichever fix lands: if the frame's AO median moves off 0.992
  toward the authored 0.412 and the albedo span reopens past 1.34:1, the fix worked.

  **A third cause, and it subsumes both of those: `ao` never multiplies the key term.**
  `toon.glsl.js:365`:

  ```glsl
  vec3 diff = alb * keyRad * key                                        // <- no `ao` factor
            + albAmb * fill * ao
            + albShadow * uShadowColor * shadowMix * mix( 0.55, 1.0, ao )
            + uShadowColor * uShadowWash * shadowMix * ao;
  ```

  AO is applied to the ambient fill, to the shadow term (there remapped to [0.55, 1.0]) and to
  the wash — **never to direct key light.** So on a sunlit surface, where `alb * keyRad * key`
  dominates, occlusion is close to absent by construction, which is exactly a frame AO median
  of 0.992 on `hero`. The two stacked attenuations are real and secondary: `aoMapIntensity` is
  1 (`ToonMaterial.js:603`, so it contributes nothing), and `uAoStrength` is
  `TUNE.bakedAO = 0.55`, which takes an authored 0.412 to 0.677 — matching TEXTURES' arithmetic
  and, as it said, not reaching 0.992 on its own. It does not have to: whatever survives to
  `ao` is then only spent on terms the sun is drowning.

  Candidate 2 is separately **weakened**: `Texture.channel` defaults to 0 and nothing in the
  project sets it, so `vAoMapUv` resolves to `uv`, which every mesh has. `Kit.normaliseAttrs`
  stripping non-`uv` attributes is real but does not bite here.

  Epistemic status, stated because this file has been burned on exactly this: the above is a
  reading of the shader source, like candidate 2 was. The difference is that it is a reading of
  *which terms are written in an expression*, not an inference about whether a function has an
  effect at runtime — `ao` is textually absent from the key term. It is still worth one A/B
  (multiply the key term by `ao` and diff a frame) before anyone tunes `bakedAO` on the strength
  of it, because tuning a knob that is only spent on drowned terms will look like a dead knob and
  produce another five-cycle chase of the kind §3 records.
- ~~**The one anti-tiling mechanism is mistuned.**~~ **Fixed, and it was worse than reported.**
  The handoff named `sandstone`. Recomputing against every (recipe, detail-preset) pairing
  actually built in `src/world/**` shows it is **universal — all 8 tiled consumers** sat at
  rho = P2/repeat between 0.97 and 1.84, i.e. near-unison, where the macro layer decorrelates
  nothing: `ceiling_stars` 0.97, `plaster_painted` 1.04, `hieroglyph_wall` 1.13, `sandstone_block`
  1.73. `detail2Scale` 0.137 → **0.030** takes them to 4.44–7.91; the clean band is 0.015–0.0425.
  The two assumptions under this were checked rather than assumed: `slyTriplanar` uses
  UV = worldPos × scale (so period = 1/scale), and the detail texture is `RepeatWrapping`.
  Checking every consumer instead of the one named is what turned a local fix into a global one.
- **Enlarging `HG_WALL_TILE` is not an improvement — do not take it.** It halves texels per
  glyph, trading §7.3's tiling condition for §7.3's carving-detail condition. Measured and
  declined, not overlooked.
- ~~**`dunes` tiling is unverified and its only mitigation is a prediction.**~~ **Both halves
  are now settled, and they went opposite ways.** §2.3's ≥60% haze claim is **false** — 60%
  blend does not arrive until 193 m; of the 67.3% of frame that is ground, only 18.9% reaches
  60% and 59.2% is under 20%, median ground pixel 79 m at ~13%. So the mitigation the tiling
  defence rested on does not exist, and raising density is not the trade: ×2.4 covers the
  54–150 m repeat band at the cost of 49% haze on the subject of the terrain shot. But the
  tiling itself was then probed directly — `tools/wallstrip.mjs` at `dunes`' own 190 px × 7
  repeats, off the albedo alone and *before* any haze — and reads clean, agreeing with critic
  pass 4's in-frame autocorrelation. The condition passes on its own merits rather than on the
  haze that was supposed to hide it.

**Tool caveat — `angsize.mjs` assumes the default `UV_PER_M`.** The four documented consumer
exceptions therefore read wrong in it: the pyramids use `UV_PER_M * 0.25`, making
`limestone_polished`'s `dunes` count ~11–13, not the 44–54 it prints. Apply the correction by
hand or do not quote the number.

**Second caveat, now fixed, and it hid the largest tiling defect in the project.** `angsize.mjs`
keyed its per-material buckets on `mesh.name`. `Architecture.mesh()` happens to name meshes
`arch:<zone>:<materialKey>`, so splitting on `:` worked there and the tool looked correct.
`Architecture.instance()` (l.239) does not — it takes a `name` describing the *piece* and sets
`im.name = name`, while the recipe arrives separately as `matKey`. **Every InstancedMesh in the
level was therefore filed under a phantom key named after its geometry.** `paving_courtyard` —
675 instances — read as 5.81% of `hero` instead of **14.45%**, and *absent* from `interior`
instead of **36.19%**, with no tiling numbers printed at all for the phantom keys. Now keyed on
`material.name` (`Architecture.mat()` sets `arch:<matKey>` at l.191 and caches one material per
key, so it is authoritative for both paths). Third instance this session of a probe describing
something other than what its reader assumed.

**Sub-pixel sweep at the ten framings — clear, with the corrected keying.** The failure class
that bit at `MOTES.size` (0.045–0.075 m, sub-pixel at 20–35 m) and `sand_ripples` (2.6 m tile
applied at 1/9.6) was swept across every material holding ≥1% of any canonical frame, taking each
recipe's authored detail scale through its consumer's real UV factor. **The smallest such feature
is 12 px** (`ceiling_stars` in `temple`, 9.1% of frame), then `limestone_polished` 13.2 px on the
pyramids once the ×4 exception is applied, then `column_papyrus` 15.2 px. Nothing on architecture
is anywhere near the line. The four consumer exceptions above were already checked individually
when they were found; this closes the framing-side half of the same question.

---

## 9. Every character screenshot ever captured was of the wrong pose — **fixed**

`hold` on the frozen clips pointed at *partial in-between keys*. `idle_confident` held at 0.9
and `perch_idle` at 0.8, where a partial key overrode hips, chest, head and tail. So every
character capture in this project rendered a breath drift of the pose with those four bones
reverted, and **anything authored into the base pose on those bones had never reached a single
frame.** Both are now `hold: 0`.

Two more of the same kind: `run` froze on the contact key — the one frame of a run cycle that
looks like standing still — and `hook_swing` froze at the bottom of the arc, its straightest,
least dynamic frame, when the file's own comment already said the front of the arc was "the
pose the traversal frame wants".

A third, and the one that shows what this family actually costs. `idle_confident`'s breath keys
at t=0.9 and t=1.9 were still carrying cane aims from the old `CANE.shoulder` family —
`[-59,-58,28]` and `[-65,-52,28]` — left behind when the base pose moved to `CANE.plant`. Twice
every 3.6 s the clip swung the crook from resting at his side up over his shoulder and back
down, on a cane whose butt is supposed to be planted on the ground. The same trap had already
been found and fixed on the *tail* in those same two keys, and missed on the cane sitting on the
same line. Both now hold `CANE.plant`; only the body drifts.

What hid it was `hold: 0` — the held frame was correct. So **every still ever captured of this
clip was evidence that the clip was fine, and no still could ever have been evidence that it was
not.** That is the general form and it is worth stating once: a hold frame being right is not
weak evidence that the clip is right, it is *no* evidence, because the frozen frame is the only
thing anyone looks at and is therefore the one frame that gets fixed — the rest of the clip is
unobserved by construction. The mechanism is always the same: an in-between key carrying an
**absolute** angle is orphaned the moment the pose it was authored to drift from moves. When a
base pose changes, grep the clip's other keys for absolute `cane:` aims and absolute tail angles
before believing the capture.

**Read every prior character critique in that light.** "Pose is stiff / A-pose-like" was a real
observation of a frame nobody intended to render. `idle_confident` *did* have contrapposto
authored; it also failed for a second, independent reason worth knowing — leg angles are
measured against the hips, and the hips were already rolled −12°, so a leg authored at +13°
netted +1° in world and both feet stayed 4 cm apart and vertical.

Still open on the character, honestly scored by the agent that did the work:

- **Proportions — landed; this bullet's earlier text is superseded.** It read "5.53 → 5.29
  heads ... the real lever is a ~0.10 m shorter torso ... Deliberately not attempted", and that
  was the headScale-alone era. The asymptote arithmetic in it was right, which is why the fix
  that landed (`66d57aa` and the cap pass after it) moved the *other* levers: `TUNE.legLift`
  — the lever that works and the one the design wants, legs 41% → ~47% of figure — plus
  `TUNE.torsoShrink`, pushed to 0.16 by the old argument and backed off to 0.09 to give the
  spinal S its lever back. Squarely cartoon; §7.3's proportions condition is met.

  **The number itself has now been wrong twice, in opposite directions, and both times the
  instrument was the reason.** This bullet briefly carried **1 : 4.13** from
  `tools/propprobe.mjs` — but that tool's "chin" is the *throat bib* (`furCream` carried on the
  head bone), which sits 4.3 cm below the actual jaw, so it measured a head that extends into
  the neck and returned too small a count. Measured instead where the condition actually lives
  — projected through the real `sly-closeup` lens at 1280×720, chin at the jaw, top at the top
  of the cap — the standing `idle_confident` figure is 516.6 px against a 113.1 px head:
  **1 : 4.57**, with the bare skull at 1 : 6.30 (`tools/headpx.mjs`). Against the recorded 5.53
  start that is the real distance travelled.

  At least three defensible answers exist — 4.13, 4.52, 4.57 — differing only in where "chin"
  and "top" are placed, and every one of them is reproducible. So: **quote a head count with its
  definition *and* its pose, or do not quote it.**

  **2026-08-02 — the rule gets a tiebreaker, which this condition needed.** A silhouette-side
  measurement puts the same unchanged geometry at **4.14 heads including the cap** and **5.79
  skull-only** (an independent bind-pose probe agrees at 4.10), so the span is now measured at
  both ends rather than argued. The tiebreaker: **the cap is never removed in any frame or any
  clip.** No viewer ever sees the skull-only figure, so the number that adjudicates a *visual*
  condition is the cap-inclusive one — 4.14, comfortably inside §7.3's cartoon band — and the
  5.79 family describes an anatomy nobody looks at. This is why the condition kept failing on
  paper while passing on screen: two true numbers about different measurements were being
  traded as if one had to be wrong. When a definitional choice changes a verdict, pick the
  definition the *frame* uses, and say that you did. The pose half of that rule was learned first,
  when a `perch_idle` number was briefly cited as the standing figure; the definition half cost
  a published record. Like-for-like tables are at the `TUNE` block in `src/player/SlyModel.js`.

- **The cap fails the silhouette test, and no cane or tail work can reach it — OPEN.** Run
  literally, in pure black, on both framings: the cane shaft and hook now pass (in `hero` the
  crook reads as a distinct annulus with background inside its curve, clear of the torso and
  traceable to its shaft — the heroline change), ears read strongly, and the tail passes on mass
  at 26.6% of union pixels against the body's 46.2%. **The cap does not: 73.8% of its own
  boundary is buried, and cap and skull weld into a single blob with no bill notch at 118 px.**
  This is a head/cap geometry question and it needs its own seal; the cane aim and the tail
  shape have both now been measured and neither has a lever on it.

  Two limits of the method, worth stating so the result is not over-read: **the ringed tail and
  the mask are colour features and are untestable in a black silhouette** — the tail passes on
  *mass* only, and half of that signifier (the rings) cannot be scored this way at all. A
  silhouette test answers "is the shape readable", never "is the character recognisable".
- **Eye emissive lift is CPU-verified only.** The re-capture was queued behind other agents for
  32 minutes and the work was reported without it. Check `sly-closeup`, and check `night`
  (`tod 0.02`) where a warmer, brighter eye emissive previously failed as "two yellow dots".
- **Fur improved, not proven at close range.** Arms and legs are still fairly smooth tubes.
- ~~`combat` is still blown to near-white.~~ **Struck: this predates the bloom onset move
  (1.10 → 1.90) and is no longer true of the frame.** Measured on `shots/char10/combat.png`
  (stamped `4b58fee`): 0.89% of pixels ≥L230, **0.00% ≥L245**, frame mean luma 89.0 at
  saturation 0.417, with the violet wall at 0.639 and the paving at 0.369 — the environment is
  fully coloured and the only region over L230 is the impact glow itself, a tight halo at 0.89%
  of frame, which is what §7.3 asks for rather than a wash. What *is* bleached is **Sly**: his
  torso renders (155,139,119), warm-dominant at saturation 0.235, on a shirt authored
  `PAL.shirt = 0x2f7fc4`. So the defect is local to the character inside the flash glow — the
  flash's own energy (its share measured: removing it recovers 4× the blue-shirt pixels and
  +0.112 torso saturation) plus a residual warm hue-flip that additive energy alone cannot
  produce. It is not an exposure fault and must not be routed as one; a frame-wide statement
  sent the wrong owner to look for a problem the frame does not have.
- **The cane floats ~19 cm and the aim cannot fix it.** Measured off the render, not the probe:
  lowest gold pixel 42 px above the lowest boot pixel in a 400 px figure. A full 4×3×3 sweep of
  `CANE.plant` left tip y **invariant at 0.20** while x and z both moved — the shaft precesses
  about a fixed cone whose apex is the grip, so tip height is set by grip height and shaft
  length and the aim has no lever on it. A preset called `plant` that does not plant. The two
  real levers are arm pose and shaft length.
- ~~**`perch_idle` (the `hero` pose) has zero lateral line of action** — hips 0.000, chest 0.006,
  head −0.007. Untouched for lack of capture budget on the money shot, not because it is right.~~
  **STALE — corrected 2026-08-02.** These numbers describe a tree that stopped existing at
  `5d0441e`, the commit that authored the perch lateral line by roll opposition. `poseprobe` on
  the current tree reads **hips +0.045 → chest +0.082 → head +0.046** (+3.7 cm out on the lower
  segment, −3.6 cm back on the upper): **the line of action is present and landed.** What was
  never done is verifying it *in pixels*, which is a different task with a different remedy —
  and acting on the stale figure would have authored a second lateral lean on top of the first
  and doubled it. This is §18's shape (a model validated against a dead tree) arriving through a
  relay: the record was right when written, and three commits later it was a confident number
  about nothing. It propagated from here into a session verdict and then into a work order
  before its own owner re-measured and caught it. **A number quoted "from the record" needs the
  same freshness check as a relayed instruction (§27.4) — check when it was written, not only
  what it says.** What is actually wrong at `hero` is measured in
  `progress/records/PREREG-heroline.md`: the cane hook sits *inside* the torso (5.5% of the union
  outline, 41.2% of its own boundary buried).
- **The guards carry the identical eye defect.** `src/ai/GuardModel.js:76` has its own
  `eyeWhite: 0xf7f3e6` and reproduces the blown sclera and straddling cel terminator that were
  just fixed on Sly. `src/ai/**` had no owner (see §4); CHARACTER is now cleared to edit that
  one file, eye only, using the `_buildEye` pattern.
- **Seven of ten shots see him at ≥70°.** Only `sly-closeup` (33°), `temple` (35°) and `combat`
  (45°) are inside a three-quarter read, so face and muzzle work pays off in three frames.
  `hero` at 111 px carries on tail and cane-hook silhouette alone. Plan capture accordingly.

---

## 10. Backfacing geometry — one instance fixed, two larger ones still open

`Kit.sweep()` wound its triangles `a,c,b`, giving inward normals against `FrontSide` materials,
so **every cornice in the level was backface-culled** — the cavetto-and-torus crown that is the
one silhouette reading as Egyptian at distance had never appeared in a frame. Fixed.

The reason it survived three critic passes and many GPU cycles is worth more than the fix:
**a culled cornice does not look broken, it looks like a plain box.** Nothing in the image says
"geometry is missing here"; the design just reads as duller. It was found by an offline
z-buffered rasteriser that paints backfaces magenta (`tools/raster.mjs`, ~3 s, no capture lock)
after the ordinary review process had missed it repeatedly.

**Two larger instances I reported here were wrong, and the reason matters more than the numbers.**

I ran `raster.mjs` across all ten shots and reported `traversal` at **64,715 backface px (18.4%
of frame)** and `combat` at 4.9%, wrote them into this file, and routed them to ARCHITECTURE.
Re-run against the current tree, the same tool gives **`traversal` 0.01%, `combat` 0.00%,
`guard` 0.00%**. A critic pass independently measured `ed67555` at 3.23% and found `guard`'s
apparent 6.32% was entirely the sand-drift twin — it nearly filed that as a new finding and
checked first.

I first retracted them as a *correct measurement of a build that no longer existed*: triangle
count over the same shot went 135,111 → 246,241 between my two runs, because the reveal,
sand-drift and cornice-winding fixes landed in between. That much is true, and **I did quote a
tree five agents were editing live without recording what I had measured** — the same provenance
failure that made a 25-commit-old PNG look like a live sky bug, and that `shot.mjs`,
`critic.mjs` and now `charvis.mjs` stamp against.

**But I wrote "the figures were not a tool artefact", and that was wrong. Most of the inflation
was the tool, and it was my tool.** `raster.mjs` had **no near-plane clipping** — it dropped any
triangle with a vertex behind the eye. Near a surface, the triangles that drops are the *near,
occluding, front* faces, leaving the far interior wall to win the depth test and paint itself
magenta. Sampling the claimed pixels against a brute-force all-triangle ray tracer: `traversal`
30/151 truly backfacing, **121/151 (80%) a dropped front occluder**; `combat` 3/151 real,
**143/151 (95%) dropped**. The tool was inventing the defect it exists to find. The arithmetic
closes cleanly — 18.36% × 20% ≈ 3.7% against the 3.23% an independent pass measured at
`ed67555`.

A second false-positive class fell out of the same review: `guard`'s 6.38% was **entirely the
sand drift's deliberate reversed twin**. "Frontmost triangle is wound away" is the wrong
question — under `FrontSide` the GPU never draws a backface, so it cannot occlude anything. Both
tools now compare nearest-front against nearest-back depth with a tolerance, so coincident
two-sided art drops out on its own.

**Two lessons, and the second is the expensive one.** Offline measurements need the same
provenance discipline as captures. And when a number is wrong, "I measured a stale tree" is a
*comfortable* explanation that fully accounts for it — which is exactly why it should not be
accepted without checking the instrument too. I stopped at the first sufficient cause.

What was real, and is now fixed: **three open shells in `Kit.js`**, all genuine. `sweep()` had
no back plane, so every cornice run was an open shell and a cornice *ring* was four open shells
round a void open top and bottom — the "giant croissant", and `traversal`'s 182 px seeing
through to sky, which a critic pass scored the shot **2** on. `cornerRolls()` were `openEnded`,
so on small masses the bore stood in open air (759 px in `hero`, at the kiosk). `railGeo()`
tubes had no end caps.

**Two of those three fixes were wrong on the first attempt, and both were caught by measurement
rather than by review.** The back plane as a single quad left a **T-junction** (38 unpaired
boundary edges). The rail caps were **inverted on both ends** — which neither the watertightness
test nor the raster test could see, *because an inverted cap is culled*. It looked exactly like
a fix and did nothing. A tangent-direction check found it. A fix that is invisible to the test
that motivated it is the same failure shape as the culled cornice itself.

Result across all ten shots: `traversal` 3.23% (11,618 px) → **0.01% (18 px)**, `hero` 0.69% →
**0**, `night` 0.59% → **0**, `courtyard` 0.18% → **0**, the other six ≤0.04% → **0**. An
independent ray tracer agrees at 0–1 rays on all ten. Cost **+6,608 tris (+2.1%)**, draw calls
unchanged at 44. GPU-verified in `progress/frames/gpu2/traversal.png`: the cornice is a solid
opaque mass with a readable cavetto curve, fillet lip, undercut and ink silhouette.

**Deliberately left open**, and this is a judgement not an oversight: `obelisk`, `spire`,
`stairFlight`, `slabUnit`, `hookRing`, `papyrusColumn`, `bevelPrism`, `torusRoll` and
`steppedPyramid` are still open shells. Both camera-relevant tests read ~0 on them because their
rims are buried, so closing them spends triangles for no visible gain.

---

## 11. Probe headers — the same defect three times, and the rule that stops it

Three separate offline probes in `tools/` have now produced a confident wrong number by the
same mechanism, and it is worth naming as a class because none of them had a bug in it.

- **`shotsil.mjs`** said it "samples the clip the way `Animation.freezePose()` does". True of the
  pose buffer and of the cane aim, which is what the author was thinking about. `freezePose()`
  also sets `_ikW = 1`, so at runtime `Rig.footIK()` re-solves both legs before anything is
  drawn — and the tool does not run it. Everything below the knee was the *authored* clip pose.
  That sentence is what commit `5a1de96` quoted to conclude the buried feet were a tool
  artefact. They were real, and `2d16389` had to retract it.
- **`charview.mjs`** printed "he is N px tall" from a projection with no frustum-sidedness test
  and no occlusion test. `guard` came back a plausible **483 px** for a character who is behind
  the lens by design, and `courtyard` passed every projection check while contributing **zero
  pixels** to the frame. "In frame" was read as "visible" because the output said "px".
- **The `night` eye box** was computed from the eye geometry and projected — correctly — into a
  screen rectangle, and the luminance inside it was reported as the eyes' brightness. At
  `night`'s staged yaw the camera sees the side of his head, so the rectangle was over cheek
  fur. Every number in it was arithmetically right and about the wrong surface.

**The shape.** A probe is the authored model plus *some prefix* of the render pipeline. Its
header describes what it measures; the reader takes that as authority over what the renderer
draws. The gap is always a transform the probe skipped — foot IK, frustum sidedness plus
occlusion, staged yaw — and in all three cases the arithmetic was fine and the **sentence** was
what failed. Nothing in the output looked uncertain, because a skipped transform does not
produce a wide error bar; it produces a precise number about a different thing.

**The rule, for whoever writes the next tool.** Write the header as *the list of transforms
between what you compute and what the renderer draws* — the suffix you did **not** implement —
rather than as a description of what you measure. If you cannot name that suffix, you do not
know what your number means yet.

And then put it in the **output**, not only the header. `shot.mjs`, `critic.mjs` and
`charvis.mjs` already stamp provenance into every run for the same reason (§10); scope deserves
the identical treatment, because a header is read once by its author while the printed line gets
pasted into reports by people who never open the file. `shotsil.mjs` now prints `BEHIND` instead
of a pixel count and carries its IK omission in the header; `charview.mjs` prints
`BEHIND CAMERA (no pixel size)`. Those two lines are the whole fix, and they are cheaper than
any of the three retractions above.

Two corollaries that have each cost a cycle here:

- **A three-quarter view cannot test a left-right feature**, so not seeing a change in the
  canonical shots is not evidence either way. Every camera that draws Sly is a three-quarter
  (33°, 45°, 70°), and `shotsil.mjs` grew an `AZIM=0,90,180` mode so a lateral change can be
  looked at head-on. Used in anger this pass on notches cut into the cap crown at the ear
  azimuths: front and back said the same thing the three-quarters did, and a pixel diff put it
  at **52 px of 88,146 (0.06%)**. Removed rather than shipped, with the reason recorded at the
  site — the ear is wider than the notch is deep, so it stands in its own notch from every
  direction that could see it. The rule that got there is worth more than the result: *decide
  what view would show the change before you make it, and if there is no such view, the change
  is not testable and should not ship.*
- **A solid-black silhouette tells you the head is one blob; it cannot tell you which part owns
  the blob's edge.** Those two findings want opposite fixes, and I spent two iterations reshaping
  a cap crown that was not on the outline at all. `shotsil.mjs` now writes a
  `<shot>-headparts.png` on every run, flat-coloured by material group, which answers it in one
  frame: cap crown black, bill and hem dark grey, fur and ears light. It is what showed that the
  bill was wrapped round the temple as a visor ring and was hiding the crown it belongs to.

---

## 12. A feature can be paid for out of a neighbouring feature's budget

Recorded because nothing in the paying feature's own metrics showed the cost, and the general
form is not specific to textures.

`column_papyrus` gained two horizontal registers of glyph bands. The band's own numbers were
good and stayed good at every iteration: localisation confirmed exactly (contrast peaks appeared
only at the authored band buckets, 1.87x/1.72x/1.69x, with all 35 other buckets at 0.99–1.09),
band-interior luma contrast +70%, chroma +88%, reaching 75% and 82% of the reference wall.

At the band's **first** position it also pushed the vertical text register's lowest run below one
quadrat, so `columnRegister` dropped that run — and in the critic's ROI the ***unbanded*** shaft
lost 11% of its contrast, 0.0129 → 0.0115. That cancelled roughly a third of what the bands had
bought. **Every band metric was clean while this was happening.** The band was not measured on
the shaft, and the shaft was not expected to change, so nothing looked at it.

What found it was arithmetic, not observation: the ROI total is the area-weighted sum of the
band and not-band splits, and reconciling `0.0091 × 0.246 + 0.0129 × 0.754` against the measured
ROI figure did not close. Moving the band to the slot the coverage table already called best
cleared the text entirely and restored the shaft to 0.0128.

**The general rule.** A feature added inside a shared budget — screen area, tile V, a vertex
count, a frame's exposure range, a draw-call ceiling — can be paid for by a *neighbouring*
feature, and the payment is invisible in the new feature's metrics **by construction**, because
those metrics are scoped to the new feature. Two things follow:

- **Measure the neighbours you displaced, not only the thing you added.** The question is never
  "did my feature improve" but "did the region containing my feature improve".
- **Make the totals reconcile.** Splitting a region into changed and unchanged parts and checking
  that the parts sum to the whole is a cheap, mechanical check that catches this class without
  anyone having to anticipate which neighbour got squeezed.

Cheap corollary from the same experiment: **a luma metric is largely blind to a pigment change.**
Raising paint survival 0.34 → 0.46 moved whole-material luma contrast +0.7% and read as a null
result; measured on the band interior in *chroma* it was **+9%**. Same shape as §3's "R/G cannot
see blue".

---

## 13. Texture tiling cannot be measured by a global scalar — every metric we have fails its own control

**§7.3 "visible texture tiling repetition" on `hieroglyph_wall`. The finding that opened it is
withdrawn, and the reason is worth more than the finding was.**

`hieroglyph_wall` was routed as the only recipe over a "countable distinctiveness" line: 0.482
against a 0.45 threshold, at 13.2–32.9% of frame in seven of the ten canonical framings. Both
numbers were mine, and **the threshold was set from the numbers themselves, against no state
known to have the defect.**

This recipe has such a state. `cartouche: true` draws one 0.7 × 1.8 m outlined royal oval per
10.4 m repeat; the recipe's own note records it as having made the repeats "trivially countable
by eye", and rendered at `temple`'s own 248 px/repeat it is unmistakable — the oval marches
across the wall once per tile. That is a free, bit-exact A/B. Run everything we have across it:

| metric | cartouche:false (shipped) | cartouche:true (known-bad) | separation |
|---|---|---|---|
| `tilescore.mjs` — 1/8 low-pass peakiness | "no landmark" | "no landmark" | none |
| `tilematch.mjs` — 2D luma NCC, mean of 14 | 0.482 | 0.488 | +1.2% |
| `tilematch2.mjs` — horizontal chroma NCC | 0.441 | 0.443 | +0.5% |
| `beacon.mjs` — chroma blob peak/sd | 12.06 | 12.05 | −0.1% |
| `usalience.mjs` — strip band salience | 2.61 | 2.62 | +0.4% |
| 4 scalar families × 7 low-pass scales | — | — | **max 2.5%** |

**Not one of the twenty-eight measurements separates them.** Three of those metrics predate this
pass; two were written during it, specifically to fix the previous one's blind spot, and both
failed the same control.

**The cause is structural, so no amount of retuning fixes it.** The cartouche is ~1.2% of the
tile and occurs once. Every statistic above is a global moment over the whole tile or strip, and
is therefore dominated by the other 98.8%. Averaging is the worst case — `tilematch` scores each
patch soundly and then means it over 14 random patches, so a single landmark moves the result by
at most 1/14 of its own excursion and usually contributes no sample at all — but taking the max
over a dense grid does not rescue it either (0.759 → 0.787), because in a dense inscription
almost every patch is unique, so the metric saturates and discriminates nothing. The eye does
feature matching with attention; no global scalar approximates that.

**What is left, and it is enough.** The render at the framing's own px/repeat
(`tools/wallstrip.mjs`, no GPU, no lock, ~20 s — promoted out of the scratchpad, which is
ephemeral, precisely so this rule outlives the session) is the calibrated instrument: it
separates the A/B
instantly. On it, the shipped state is clean at `temple`'s 248 px/repeat *and* at `dunes`' 190 px
× 7 repeats — the worst framing in the table and the one this file said nobody had probed, now
probed, off the albedo alone and before §2.3's atmospheric haze is applied. That agrees with the
only independent in-frame measurement, critic pass 4's autocorrelation over real captures. **The
predecessor's `cartouche: false` was the real fix and the condition is met.**

Two eliminations recorded so they are not re-run:

- **The paint-survival wear cell is connected but is not the cause.** `paintRemnants` gates
  pigment on a noise field whose `freq` is *cycles per tile* and was written as a bare number at
  all three call sites — 5 on `hieroglyph_wall` (a **2.08 m** cell on a 10.4 m repeat), 4 on
  `relief_figures`, 6 on `column_papyrus`, with nothing anywhere converting it to metres. That
  looked like the same latent-scale bug as `MOTES.size` and `sand_ripples`, and it was
  pre-registered as the cause. Swept 2.08 → 0.40 m the beacon score goes 12.06, 11.96, 13.65,
  8.45, 10.06, 10.82 — **no trend**, while the knob demonstrably moves the image (top-blob mass
  share 0.273 → 0.17, blobs relocate). *A knob that moves the metric is not the knob that made
  the defect.* The metre-derived constant is kept at the behaviour-identical value because the
  bare cycle count is still a latent-scale hazard; the tuning is not taken.
- **Enlarging `HG_WALL_TILE` remains declined** — it trades this condition for §7.3's
  carving-detail condition. Measured previously, unchanged.

**The rule.** *A metric that has never been shown to move on a state known to have the defect is
not evidence about that defect, in either direction.* Before quoting a texture metric, run it
across a known-bad A/B and publish the separation next to the number. Where a defect is a rare
localised feature in a large field, expect to find no scalar at all, and budget for looking at
the render instead of for building a fifth metric.

### Correction: the shipped wall was *not* obviously clean, and the rhythm was not register structure

The coordinator looked at `wallstrip`'s 248 px render of `hieroglyph_wall`, reported a periodic
recurrence of coloured accents in the glyph registers — "particularly a blue element and an
arch-shaped glyph" — and asked for one of two answers: the known-bad rendered beside the shipped
state showing shipped is *obviously* the clean one, or a note saying the rhythm is intended.

**Neither. The observation was correct, the rhythm was residue, and the "condition met" above was
too strong.** Rendered side by side at 248 px (`cartouche: true` flipped in place, bit-exact), the
known-bad's oval is unmistakable once per repeat — and the shipped state still shows a rhythm of
its own. Cleaner, but not clean. *A control that separates does not license the claim that the
better side is good; it only shows the worse side is worse.*

**What the accents were, found by census rather than by eye.** Instrumenting `drawGlyph` to record
every sign the build actually places — position, size, paint — gives a per-instance list, which is
the one thing the twenty-eight failed scalars could not produce. On the shipped tile, of 109 sign
placements the rare-and-large ones were `ka` (red, 2.24× median area, n=2), **`scarab` (lapis,
1.95×, n=2 — both at the same tile-U, a stacked blue pair)**, `lotus` (lapis, 1.55×, n=1). The
coordinator's "blue element" is the scarab pair; it is a genuine once-per-repeat landmark.

**But they were salient because of what surrounded them, and that is the real defect.**

### The largest source of visible repetition in the level was one line of fallback code

`quadrat` builds three of its five layouts by *stacking* signs, asking `pick()` for one short
enough (`maxH` 0.5, 0.36, 0.40). **`POOLS.divine` contained no sign shorter than 0.78 and
`POOLS.royal` none but `neb`**, so those branches filtered to nothing and hit
`if (!ok.length) return pool[0]` — drawing the same sign every time, silently, because a plausible
glyph appeared and nothing looked broken. Weighted by branch probability that is **72.8 % of every
sign drawn from either pool**. Measured on the built tiles:

| recipe | signs/repeat | commonest sign, before | after |
|---|---|---|---|
| `column_papyrus` — **54.5 % of `temple`** | 64 | `falcon` **71.9 %** | `bread` 21.5 % |
| `hieroglyph_wall` | 109 | `falcon` **47.7 %** | `mouth` 17.9 % |
| `relief_figures` | 38 | `neb` **44.7 %** | `mouth` 28.9 % |
| `hieroglyph_gilded` | 48 | `neb` 37.5 % | `neb` 23.5 % |

Seven signs in ten on the biggest surface in the interior shot were the same near-black falcon.
At 1:1 the ringing register on a column is visibly a row of one repeated mark, and the vertical
text a stack of it. **This is §7.3's "visible texture tiling repetition" in its most literal form,
and no instrument in this project could have found it**: the repetition is *inside* the tile, not
at the repeat, so every global statistic sees a dense varied inscription. It also explains the
landmark question above — the rare coloured signs read as beacons because the field they sat in
had almost no variety to hide them in.

**Fixed** by giving both pools the flat signs the writing system actually leans on — `nb`, `n`,
`r`, `t`, the scroll, `ꜥ` — chosen four-warm-to-one-cool so replacing three-quarters of the field
could not swing §3's warm/cool balance. Every branch now has ≥5 candidates; degeneracy 72.8 % → 0.

Verified CPU-side, before/after at size 512, on everything the change could plausibly break:

| | `hieroglyph_wall` | `column_papyrus` |
|---|---|---|
| warm/cool `b−r` | −0.3531 → −0.3523 | −0.3810 → −0.3799 |
| chroma mean | 0.3532 → 0.3523 | 0.3890 → 0.3879 |
| `lumaRms` (busy) | 0.0645 → 0.0652 | 0.0621 → 0.0612 |
| squint, sd at 1/32 | 0.0348 → 0.0350 | 0.0314 → 0.0310 |
| in-band saturated texels >0.42 | 0.83 % → 0.62 % | 16.6 % → 9.9 % |
| in-band luma p01 | 0.2502 → 0.2602 | 0.2925 → 0.3184 |
| `jointDeltaY` / `dH` | −0.0338/−0.2786 → −0.0335/−0.2784 | −0.0600/−0.1324 → −0.0602/−0.1326 |

Both §7.3 conditions hold at once, checked as renders and not only as numbers: at 1:1 the
registers read as varied writing instead of columns of one mark, and at squint the masses are
unchanged and clean. All 44 recipes still report both joint deltas negative. My own expectation
that this would add colour was **wrong in sign** — saturated-texel share inside the register
*falls* (16.6 % → 9.9 % on the column), because what was removed was ink, not pigment.

`pick()`'s fallback is kept but made non-degenerate (shortest few, chosen at random) so a future
pool edit cannot re-create this silently. It is unreachable for the shipped pools, and that is
verified rather than believed: the built Surfaces of all six glyph-bearing recipes hash
bit-identically across the rewrite.

**Not verified in a frame.** `shots/tx6/temple.png` predates this change. Pre-registered for
whoever next holds the lock: the near nave column's ringing bands should show *varied* signs
rather than a row of one; `relLocalContrast` in the critic's ROI (950,200 180×380) should move by
less than ±5 % (this changes which signs are drawn, not how much is drawn); and the frame's
warm/cool balance should not move at all.

**The rule this adds.** *A metric over a whole surface cannot see a defect in what the surface is
made of.* Where a texture is assembled from parts, count the parts.

### Correction: `darkTail` is not 0.0000 on every stone recipe

Stated as an invariant in the brief, and asserted in `rampFloor`'s own docstring ("every stone
recipe already reports 0.0000 without it"). Measured on the current tree at size 512, three
carved recipes are not zero: **`hieroglyph_wall` 0.0008** (≈210 texels), `ceiling_stars` 0.0005,
`relief_figures` 0.0001. The mechanism is in the same docstring: `rampFloor`'s default `crevice`
is `PAL.sandCrev = 0x4a2f22`, which is *exactly* §2.2's crevice and therefore exactly the
luminance `darkTail` counts below, and the lerp "lands short" of its own floor by construction.
The floor is set at the threshold and cannot reach it. The fix is the existing opt-in `lift`,
which is off "because every stone recipe already reports 0.0000" — a premise that is false for
the three recipes that would need it. Not taken in this pass: it is a real albedo change and it
was found while a tiling experiment was live, so it is recorded rather than shipped blind.

**Amended — the diagnosis above was right about the mechanism and wrong about the cause, on two
of the three recipes.** The pool fix in the section above touches no ramp, no floor and no
`lift`, and it took **`hieroglyph_wall` 0.0008 → 0.0001** and **`relief_figures` 0.0001 → 0.0000**
on its own. The dark texels were not the `rampFloor` lerp landing short: they were `falcon`'s
near-black paint (**#241a16**, luma 0.11, well under the crevice's 0.157) mass-duplicated into
half the tile by the fallback bug. Removing the duplication removed the tail.

`ceiling_stars` is the control that proves the split, and it is worth stating precisely: it draws
**no glyphs at all**, its `darkTail` is unchanged at 0.0005, and it is now the *only* stone recipe
above zero. So the `rampFloor` explanation stands — for exactly the one recipe that has no other
candidate. The `lift` remains found-not-taken, but it is now a one-recipe question rather than a
three-recipe one, and correspondingly cheaper to verify.

The general point is worth more than the numbers: **a defect can be measured correctly, explained
by a mechanism that is genuinely present, and still be attributed to the wrong cause** — because
the true cause was upstream in a different file and was producing the same signature. The
mechanism was real; it just was not what was making the texels dark.

## 14. Background capture processes are reaped at exactly one hour — unless detached

Five capture-pipeline processes died silently in one afternoon, and the first two explanations
were both wrong before the third one was right. The record matters because each wrong
explanation was plausible, actionable, and would have hardened the pipeline against the wrong
threat.

**The symptom.** Queued capture runs and completion watchers died without a line of output:
CHARACTER's first cap2 run, TEXTURES' first and second tx7 runs, SHADING's rim2-done waiter,
FX's fx5 monitor. Each owner was left parked on a wake that could never arrive; the FIFO
lock swept the dead pids' tickets correctly, so from the queue's point of view the runs
simply ceased to exist.

**Wrong explanation #1 — lock handovers.** The first two deaths timestamped within a minute
of the moments the capture lock changed hands, which suggested the next holder's Chromium
boot was killing bystanders (memory spike, OOM). Coincidence: holds were running close to an
hour, so death-at-3600s and death-at-handover looked identical until a death arrived with no
handover near it.

**Wrong explanation #2 — self-inflicted timeouts.** Two deaths at 3589s and 3591s of process
life look exactly like someone passing `timeout: 3600000`. Nobody had: every launch in every
transcript shows no timeout parameter.

**The actual mechanism, proven by ancestry.** What separates the dead from the survivors is
the process tree, not the workload:

| process | launch shape | lifetime | fate |
|---|---|---|---|
| tx7 first run | attached (bg task child) | 3589 s | reaped |
| tx7 second run | attached (`wait $PID` wrapper) | 3591 s | reaped |
| cap2 first relaunch | attached (`wait $PID` wrapper) | would die ~19:35 | killed pre-emptively, relaunched |
| geo2 | `nohup … &` from a foreground call, ppid 1 | 95 min | completed |
| rimsweep2 | same, ppid 1 | 94 min | completed |
| fx6 | ppid 1 | >55 min and counting | alive |

A background task's process tree is reaped at ~3600 s of task life. A process that has been
orphaned to init before the hour — `nohup cmd > log 2>&1 &` inside a **non**-background call
that returns immediately — is outside the tree and untouchable. Keeping a wrapper alive with
`wait $PID` feels tidier (it captures the exit code) and is precisely what keeps the child
attached and mortal.

**The recipe, stated once:**
- Long captures: launch detached — `setsid nohup node tools/shot.mjs … > "$SCRATCH/run.log" 2>&1 &`,
  write the pid to a file, let the call return. Exit codes go to the log
  (`echo` an epilogue from the script itself, not from a waiting parent).
- Wakes: watchers must each live under the hour. A 50-minute poll loop that exits on its
  condition *or* on heartbeat — re-armed on every wake — never meets the reaper; a single
  until-loop armed for "however long the queue takes" always does.

**Three refinements, each paid for by a lost run.**

`nohup` alone is not always enough. It suppresses SIGHUP, but the wrapper shell can stay in the
task's process group and take the reap with it — one capture died at ~114 s that way, far
inside the hour, which is the failure that does *not* look like the reaper and so gets
mis-diagnosed. `setsid` puts the process in its own session and its own group, which is the
property that actually matters; it costs one word and removes the whole class.

`$!` names the wrapper, not the work. In `VAR=… && nohup node … &` the `&` backgrounds the
entire `&&` list, so `$!` is the subshell's pid and the node process is its child. A pid file
written from it points at something that exits early, so a liveness watcher reports a dead
capture while the capture is still rendering. Resolve the real child before writing the file.

Variables do not survive into that subshell either. `$SC` expanded to empty inside a
backgrounded list and the run's log was silently written to `/` — the capture was fine and its
output was simply not where anyone was looking for it. Expand paths before the `&`, or use
absolute ones.

**A seventh, and this one is mine: a restart-protection sweep committed a broken term ON.**
The convention in this session is that I commit agents' in-flight edits by filename, syntax-checked
and labelled unverified, so a restart cannot cost the work. That is sound and it has already paid
for itself — but on one sweep it caught a shading term **mid-edit, with its strength at the A/B
value rather than at zero, and carrying an arithmetic bug its author found minutes later.** Had a
capture booted in that window it would have measured a null and read as a *design* failure, when
the real state was a collapsed arm — §40's failure mode, manufactured by the safety mechanism.

The same commit also broke that author's verification tool, which had hardcoded `HEAD` as its
pre-term baseline: with the term now *in* `HEAD`, the check would have compared the term against
itself and reported a clean no-op. §18 arriving live, caused by a sweep.

**So a checkpoint sweep must not pick up a file whose owner is actively editing it** — or, where
it must, it has to be labelled loudly enough that no capture launched in that window is trusted.
The cheap version: sweep only files whose owner has reported, and treat "I am mid-edit" as a
reason to leave a file dirty and accept the restart risk. Restart-protection is worth less than a
frame nobody can trust.

**A sixth, and it inverts the recovery playbook: a HARNESS restart is not a container restart.**
A restart notice arrived saying *"The container was restarted. The following background tasks
were running and are now stopped"* — and the playbook this file had been carrying said container
restarts kill everything, detached processes included, so relaunch the queue. **Checking first
showed the opposite.** Every `setsid`-detached capture was still running with its original pid
(one holding the lock, one queued, one budget probe), the whole filesystem survived including
`shots/` and a 1,202-file scratchpad, and git was at HEAD with zero commits behind origin. What
actually died was the **harness-tracked background tasks** — the watchers and Monitors — and
nothing else. One run had even completed normally during the event and written its manifest.

Relaunching reflexively would have destroyed two live captures and cost roughly two hours of
lock time to re-render frames that already existed. **Rule: on any restart notice, verify before
recovering** — `ps` the pids you recorded, `ls` the output directories, and check `git rev-list
HEAD..origin`. The notice tells you what the *harness* lost, which is not the same question as
what the *machine* lost. Re-arm the watchers, which are the only casualties, and leave the work
alone.

**A fifth, hit twice in one hour by two different agents: `pgrep -f` matches the wrapper, so
the queue ticket is the authority on which pid is yours.** `pgrep -f "shot.mjs hero …"` matches
*any* process whose command line contains that string — including the `bash -c` wrapper that
launched it, and including the persistent tool shell. Both of us "verified detachment" against
the wrong pid: one launch reported `ppid 1` for a wrapper whose real node child sat at
`init → shell → node` with a live parent that the tool shell would have carried into the reaper,
and the other read a session id belonging to an already-exited leader. **The lock ticket is
written by the runner itself, so the pid in `<epochMs>-<pid>` is the process actually doing the
work.** Resolve from the ticket, or walk `--ppid` from the wrapper to its node child; then
confirm `ppid 1` *and* session leadership on **that** pid. A detachment check performed against
a process that is not the one rendering is worse than no check, because it reports safety.

**And the sharper half, which explains the false passes: verify in a SEPARATE call, after the
launching shell has exited.** Checking `ppid` in the same call that launched the process is
guaranteed to mislead — *the parent is necessarily still alive at that moment*, so an attached
child looks exactly like a detached one and the check reports success at the only instant it
cannot possibly fail. One launch was caught this way: `cd X && nohup … &` binds the `&` to the
whole `&&` chain, so the subshell ran node in the *foreground* and waited on it — the exact
mortal shape §14 exists to prevent — and the same-call check passed it. Launch, let the call
return, then verify in a fresh call. The orphaning you are testing for happens *after* your
launching shell dies, so a test that runs before that has not tested anything.

**A fourth, paid for only in luck: a mid-queue src edit races the next boot.** The goldhalo
splice (b77b614) was briefly broken on disk — a compile-breaker caught by its own proof
script — inside the window where cap5's queued run could have booted vite and baked the broken
module into all of its frames. cap5 booted clean (`7b0e3f8 dirty:false`, zero errors) by
roughly thirty seconds, which is luck, not process. The HMR guard (`SANDS_NO_HMR=1`, e04c9ec)
protects a run only *after* its boot; the boot itself reads whatever is on disk at that
moment. Rule: before editing `src/` while the capture queue is non-empty, check who holds the
lock and where they are in their run — if a boot is imminent (holder just acquired, or next
ticket is about to), wait it out. Seconds of patience against a five-minute-per-shot rerun.

**The general point:** a fleet of independent failures with one hidden cause will hand you a
different plausible story per failure — this one died at a handover, that one at an hour, the
other while its owner slept. The tell was two lifetimes agreeing to within two seconds. When
failures start rhyming numerically, stop explaining them individually.

## 15. `Lighting._rebuildForQuality()` corrupted every patched material on its second call — **fixed**; fx6 jobs 8–11 frames are invalid

The CSM patch (`Lighting.enableCascades`) wraps a material's `onBeforeCompile` and injects
the cascade GLSL. `_rebuildForQuality()` used to end with `this._patched.clear()` so the
material sweep would re-adopt everything with the new closure state — but the wrap itself
was still on the material, so the sweep wrapped the wrap. Both layers injected on the next
compile (forced, because the cache key doubled to `csm4|csm4|`), the duplicated definitions
failed to compile, and every patched mesh stopped rendering — while `renderer.info` kept
counting its draws exactly as before. Symptom pattern: world geometry vanishes, toon-shaded
characters survive as unlit ink-shell silhouettes, draw/tri stats look completely normal.
Trigger: any second cascade rebuild in a session (`engine.on('quality')` fires one per
quality change), plus up to 20 frames of sweep latency.

Consequences for captured evidence:
- **`shots/fx6/`: `hero.back`, `interior.full`, `guard.full`, `dunes.full` are corrupted**
  (all captured after the second rebuild of that boot). Do not use them as visual baselines.
  `temple.*`, `night.*`, `hero.full`, `hero.dist420` predate the corruption and are valid —
  the temple control was bit-identical, and both cascade A/B frames are coherent.
- Their **stats** rows appear breakage-invariant (hero.back counted 402 draws / 2.725M tris,
  identical to hero.full) but carry that asterisk.

Fix (in `src/render/Lighting.js`): the `csmSplits`/`csmFade` uniform objects are now
identity-stable for the life of the module (values mutated in place on rebuild), the wrap
reads live cascade state instead of capturing it, and `_patched` is never cleared — a
material is wrapped once, ever. Count changes still relink through the live cache key.
Side fix: reused programs previously kept stale split VALUES after a rebuild (fx6
`hero.dist420` selected cascades with boot-era splits); in-place mutation closes that too.
Verification pre-registered in `PREREG-fx7.md` (scratchpad): rebuild 420 → sweep → rebuild
160 → sweep on one boot must reproduce `hero.full` bit-identically.

## 16. Two ways a number passes while the thing it measures is still wrong

Both of these were caught tonight by the agent whose own result they undercut, which is the only
reason they are written down rather than shipped.

**A region mean passes because the clean part of the region is bigger than the broken part.**
The courtyard veil was staked as a mean lift over a frozen 109,549 px mask, and the final
measurement cleared it: +8.96 against ≤9.5. Split by surface, the plinth and bench — the
acceptance surface — read **+1.03 and are clean**, while the left stairs, a named residual from
two runs earlier, read **+10.06 and are still over the stake on their own terms**. The region
passes because the large clean area dilutes the small broken one. Both numbers are true. The
second is the one an art director sees, because nobody looks at a frame's area-weighted mean.

The lesson is not "use medians" — the median moved the same way. It is that a stake defined over
a region silently assumes the defect is distributed like the region, and a *named* residual
inside that region is direct evidence the assumption is false. When you already know a
sub-population is worse, stake it separately or your headline will average it away.

**A prediction chain compounds its own error and blames the model.** The same knob was predicted
three times. Each prediction was computed from the *previous prediction*, and the endpoint missed
by 1.47× — enough to look like the model was wrong. Recomputing one step from the last
**measured** value instead lands at 1.06×. The model was fine; the chain was rotten. Predict from
measurements, never from earlier predictions, and if you must chain, re-anchor every time a real
number arrives.

**A corollary about fitting, from the same run.** Fitting `lift = C + K·factor^p` to three points
produced a tidy "3.53 of the residual is non-court" — a finding worth reporting, except that at a
different exponent the held-out middle point is predicted exactly with `C≈0`. Three points, two
free parameters: the fit cannot separate "there is a floor" from "the exponent is smaller here",
and it will hand you whichever story you sampled toward. Report what both branches agree on, or
get a fourth point.

## 17. The obvious one-line fix would have halved the rim in nine shots

`LIGHTING` publishes `rim.strength`; `setKeyLight` reads `rim.gain` / `rim.intensity` and
ignores it. The bug is real — `uRimGain` has held its boot value of 2.05 in all ten shots for
the whole session, and a per-tod multiplier has never applied. The fix looks like a rename.

It is not a rename, and taking it would have been a silent 50% regression. `rimStrength` runs
0.5–0.72 while `uRimGain` is 2.05 and its consumer *multiplies*: the two live in different
units. Wiring `strength` straight into `gain` would have dropped the rim to roughly a quarter
of its shipped value in the nine daylight shots — arriving as "a correctness fix", landing as
a lighting regression, and with a commit message that would have made it look intended.

What identifies the right normalisation is that the two mechanisms **agree where they overlap**:
read against its own daylight reference, `0.72/0.5 = 1.44` against a hardcoded `1.45` — 0.7%
apart. That agreement is the evidence the units differ by exactly that reference, and under it
eight of ten shots come out bit-identical with only `night` and `guard` moving. Both of those
are night; the first report of this called it "night's rim" and missed that `guard` at tod 0.10
is night too, and that no rim run had ever measured `guard`.

So the plumbing goes in defaulted to a no-op, and the brightening it enables is held as its own
pre-registered A/B with the residual predictions written down first (the night lip artefact
13 → ~19 px, guard 4 → ~6 px). **A dropped value is a bug; restoring it at face value is a
change.** Before wiring any two systems together, check that the number means the same thing on
both ends — and if a "fix" would move a shipped look, it is a change wearing a fix's clothes.

## 18. A perfect validation score against a baseline that has already shipped past you

The chain model for the shadow-hue work validated against a live readback at
`maxAbsErr 4.69e-5` — five decimal places of agreement, the strongest validation any instrument
in this project has produced. It was a perfect match to **a tree that no longer existed.**

`shadowBounceMix 0.20 → 0.05` had shipped roughly four hours earlier, in the same commit that
introduced a turquoise blend the model did not contain at all. The model hardcoded the old mix
and had no teal term, so it described the renderer as it stood that morning. Live shadow light
had moved from `(0.1416, 0.1892, 0.4232)` to `(0.0961, 0.3131, 0.4966)` — G/R from 1.336 to
3.258, a factor of 2.4 — and the validation still passed, because the thing it was compared
against was itself computed from the same stale constants.

Everything downstream inherited it. An acceptance was declared unreachable ("floors of
225/240/238") on the strength of a model missing the very lever that reaches it; the frames
land 223/235/210/225, three of four inside the target. A caution that was true — a surface hue
does have a floor above the light's, so scoring one against a light spec is a category error —
got converted into a quantitative impossibility claim that was false. The coordinator conceded
the point. Both of us were arguing from the same dead tree.

**A validation number tells you the model matches its reference. It cannot tell you the
reference is current.** So: stamp the tree a model was built against, re-read the constants from
source at run time rather than transcribing them, and when a model and a frame disagree, check
what has shipped between them *before* trusting either. In a fleet shipping several commits an
hour, "my instrument is validated" has a shelf life measured in commits, not in correctness.

**Freshness guards, and the stale output directory.** §18's stale-baseline failure has an
operational twin that costs less to hit and is easier to miss: a capture directory that already
contains an older run. A completion monitor watching for `report.json` fired "finished" on a run
that had never started, because a previous capture's `report.json` was still sitting there — and
separately, a set of character frames was analysed for an hour before anyone checked its
provenance stamp and found it seven commits old, so the defects being re-diagnosed had already
been fixed. **Existence is not completion and a file is not a frame.** Watch for a file *newer
than the launch*, move or delete a previous run before capturing into the same directory, and
read the tree stamp out of the report before quoting a single number from the frames.

---

## 19. `setShot()` stops the rAF loop, so a `requestAnimationFrame` settle renders nothing

An in-page probe that advances frames with bare `requestAnimationFrame` and then reads
`renderer.info` or `engine.stats` is reading a **frozen snapshot**, not a measurement. It will
report plausible numbers that cannot respond to whatever lever it is testing.

`Debug.js`'s `setShot()` calls `engine.stopLoop()` — deliberately, so captures are reproducible
frame-for-frame — which clears `_looping`. `Engine._tick` then returns on its very first line.
rAF still *fires*; it just does nothing. No `renderFrame`, so no module `update()`, no
`renderer.info.reset()`, and no draw. Frames after `setShot` only advance through
`__GAME.step(n)` or `__GAME.capture()`, both of which call `engine.renderFrame()` directly.

This cost a full crypt-gate control run. `determinism.mjs` compared `interior` in four lever
states and reported **identical draw calls and identical triangles in all four** — 148 / 0.654M.
That was read as "the widened gate saves nothing". It is not: the counts were captured inside
`setShot`'s own `api.step(3)`, *before any lever moved*, and were identical by construction. The
byte-identity verdict from the same run is unaffected and still stands, because `capture()`
calls `renderFrame(0)` itself — which is the only reason the protocol produced a real result at
all.

The tell that it was an instrument fault rather than a finding is offline and takes seconds:
the `far` zone's merged `limestone_polished` mesh has a bounding sphere that **contains the
`interior` camera**, so it can never be frustum-culled from that shot, so hiding it *must* move
the draw count. A knob that provably should move a number and doesn't is a dead instrument
before it is a null result.

**This is not confined to one scratch script. `tools/cryptgate.mjs` has the same defect** — bare
rAF at line 50, `renderer.info` read at 56–58 — and that is the tool that produced the crypt
gate's **V2 BUDGET** leg, in both the original gate (`77e1eab`) and the widening (`33787cc`).
Every draw/triangle saving either of those two commits claims was taken through it and should be
treated as unmeasured until re-run. The V1 byte-identity legs are unaffected.

Audited, so nobody has to repeat it: `tools/budget.mjs`, `tools/progress.mjs`, `tools/critic.mjs`
and `tools/shot.mjs` are all **clean**. They read `stats` out of `setShot`'s own return value,
which is snapshotted after a real `api.step(14)` + `api.step(3)`, so every number in a
`shots/*/report.json` is a genuine rendered frame.

Two rules:

- **Advance frames with `__GAME.step(n)`, never with bare rAF, once `setShot` has been called.**
- Before believing a null result, find something the knob provably must change and check that it
  changed. §16 is the same lesson from the other side; this is the version where the number is
  not diluted but simply never taken.

**Related: pre-registered inventories drift from the thing they authorise.** The same gate was
pre-registered on S3+S4 "rendering in `interior` (~44k tris)". Measured offline, S4 (`far`) is
**704 triangles over 2 draw calls** — 2 stepped pyramids and 5 mastabas, all of which are cheap
silhouette geometry behind haze. Whatever the 44k was, it is essentially all S3 (vegetation).
The widening is still worth having, but it buys about 1.6% of what its own pre-registration
implied for S4, and no acceptance in that document would have caught the discrepancy because
none of them measured the inventory.

## 20. A global lever measured in a local ROI is not a local result

Twice in one investigation, and the second time by the agent who had just caught the first.

The rim work needed to know which of two gates was starving a character's silhouette. The
reference leg every capture had ever used, `gateoff`, **moves two knobs at once** — so no run in
the project had ever isolated either half. That was caught, correctly, and the elimination was
re-run one knob at a time. `rimPlanar` cleared: the screen gate off *everywhere* moves the
character by ±0.4 L.

Then the magnitude half was opened — **globally** — and the character lifted 4–12 L. That was
read as the answer, shipped as a subject exemption, and written into a comment and a commit
message. Opening the identical smoothstep on **exactly the skinned population** moves him
−0.02 / +0.53 / −0.01 L: nothing, inside base-vs-base2 noise. The 4–12 L was never his surface.
The same global leg raises the paving *behind* him by +13 to +20 L, and bloom does not respect a
silhouette, so the light bled into the ROI from outside the population under test.

**A lever applied outside your region of interest can move the pixels inside it.** Bloom, AO,
the prepass, ambient bounce and the tonemap's own shoulder all couple neighbouring pixels, so
"I changed X and my ROI moved" only implicates X if X was confined to the ROI. When the lever is
global, the control is not base-vs-lever — it is **lever-restricted-to-the-population** vs
**lever-everywhere**, and the gap between those two is the bleed.

The residue is worth stating plainly: after both eliminations, **no un-confounded lever has yet
moved this character's rim at all** — which puts the original regression itself in question,
since it was measured against the same two-knob reference. The next step is to paint the terms
into the framebuffer with the tonemap bypassed and look at what is actually there. Not a tuning.

**The same defect from the other side: work that happens outside the counter.** §19 is about a
probe that reads a counter nothing has written to. Its mirror is a counter that is reset *after*
the work it was supposed to count. `Engine.renderFrame` runs every module's `update()` and
*then* calls `info.reset()`. The static-caster shadow cache does all of its shadow work inside
`Lighting.update()` — the static refreshes, the depth blits, **and the per-frame dynamics
redraw** — so none of it appears in `engine.stats` at all.

The consequence lands on a number this file already quotes. With the cache shipping,
`renderer.info` simultaneously **over**-counts against §1's wording (it sums every pass, and a
shadow-cascade redraw is not a visible triangle) and **under**-counts true GPU work (it omits
the whole update phase). What the counter shows dropping is statics *plus* dynamics; what is
actually saved is statics only. **So `renderer.info` overstates the cache's saving, and the
33–41% figure must carry that correction before it is quoted again.**

**A second, larger correction to the same figure — 2026-08-02, from the fingerprint null
control (§31).** That correction assumed the refresh rate was near zero on a static camera. It
is not: the cache takes a **full static refresh on 12.5% of all frames** regardless of whether
anything changed. Every saving quoted for this cache — the 33–41% here and the corrected
34.7–40.1% statics-only figure — assumed a bill that is not being paid, and **all of them are
overstated and must be re-derived after the census fix rather than re-used.** No saving number
for the shadow cache is quotable until then.

**RE-DERIVED 2026-08-02 after the census fix (§31, §33), and the struck figures stay struck.**
With the unconditional reset gone the measured refresh rate is **r = 0.00000** over N = 100
frames × C = 2 cached cascades, so the cache eliminates **(1 − r) × S = 579,260 architecture-
static shadow triangles per frame against D = 713,738**, the same census's all-cascade
architecture-static shadow redraw — **81.2% of D**. It is 81% rather than 100% because cascade 0
is deliberately never cached. Two constraints travel with the number and must travel with every
re-quote: **S is an architecture-only floor** (Vegetation, Terrain and Props do not build
headless, so the absolute saving is understated while the ratio stays internally consistent
because S and D share a population), and **no counted-column figure appears anywhere in the
derivation.**

The §33 pre-registered-luck clause applies here **inverted, and the inversion is the
interesting part**. The prediction was that the new figure might land near the struck 33–41% and
that a near miss would be coincidence rather than vindication. It landed at 81.2% instead — and
a *far* miss is exactly as uninformative. The gap is a denominator difference, not a
disagreement: the struck figures used a whole-frame denominator that was never restated, and a
whole-frame version is declined here because that denominator is a counted-column number.
**Near-miss and far-miss are both non-evidence about a figure whose input was never measured.**

The general form: *a counter measures a window, and shipping work into a different window
changes the number without changing the machine.* Before trusting a delta, check that the thing
you changed executes inside the interval the counter covers — and when you move work across
phase boundaries, expect every historical number spanning that boundary to need re-basing.

## 21. `0 * Infinity` in the grid walk, and a wall that read as holed at exactly the cell size

The temenos raise (`0ad97ca`) was justified with an elevation angle — "at 12.5 m the wall top
sits 6.56° above the eye line and the horizon is gone". An elevation angle proves the wall is
tall **enough**. It does not prove nothing sees past it, and that run is stepped, jittered and
carries a collapsed breach at h=0, so those are different claims. `tools/horizon.mjs` closes the
gap by ray-cast, and — worth noting for anyone budgeting a slot — it needed **no capture boot at
all**: `tools/lvl.mjs` builds Architecture headless, so the whole verification is CPU-side.

**The instrument lied first, and the tell was a period rather than a value.** The first wall
profile came back holed at z = −12, −8, −4, 0, 4, … — isolated full-height gaps at *exactly*
every 4.0 m, which is `CELL`. In the DDA setup, `(boundary − origin) * (1/d)` is `0 * Infinity`
= **NaN** whenever a ray is axis-aligned on some component *and* its origin sits exactly on a
cell plane for that axis. Every comparison against NaN is false, so the walk fell through to the
`else` branch, set `travelled = NaN`, and `travelled < maxT` terminated the loop on its first
iteration — reporting a clean miss straight through 12.5 m of masonry. The sign test that was
supposed to catch bad entry distances (`if (t < 0) t = Infinity`) cannot see a NaN.

**`tools/void.mjs` contains this DDA verbatim and therefore shares the bug.** It is not
reachable there today — its rays are general-direction camera rays, and the failure needs an
exact zero component *and* an origin on a cell plane — but it is one axis-aligned probe away,
and its failure mode is the dangerous one: silence. A void probe that hits nothing reports "no
leak", which is the answer everyone wants to hear.

**CLOSED 2026-08-02: void.mjs got the same `t0` guard (`tools/void.mjs:104`), proven both
directions on the on-disk code.** The proof harness (`scratchpad/voidproof.mjs`) textually
extracts `rayTri`+`cast` from the file so it measures what actually ships, and before the fix
it reproduced the exact signature above — a strip scan reading holed at every `x = k·CELL`.
The mechanism surfaces one line later than horizon's, and it is worth recording because it is
*quieter*: the NaN `tx` never wins the branch chooser, but poisons
`cellEnd = Math.min(tx,ty,tz)`, so `best <= cellEnd` rejects every real hit forever — the
probe walks the whole grid politely and reports nothing. After the guard: the known-bad hits
at the analytic t = 8.000, the strip has zero holes, and the null (same degenerate ray aimed
away) still misses. Same bug, two tools, two different failure surfaces — a copied block
carries its trap into whatever control flow surrounds the paste site (diagnosis in
`progress/records/NOTE-void-and-poles.md`).

Second instrument fault in the same tool, same session: classifying crossings against a
**smoothed** profile. A ±1 m lookup window absorbed block jitter but bulldozed the breach's
edge, charging rays passing through open breach as passing through solid wall. Probing the wall
top at the crossing's own z, rather than at the nearest grid sample, removed the class outright.
Both faults produced *plausible* numbers; neither produced a wrong-looking one.

**The finding, once the tool was honest.** Same seed, same cameras, wall at 5.6 m vs 12.5 m,
desert visible as % of frame: `courtyard` 0.52 → **0.16**, `hero` 1.24 → 0.90, `night` 1.22 →
1.11, `guard` 0.00 → 0.00 but its sky rays 303 → **0**. No unintended hole anywhere in the run.
The raise did its job — on the camera it was argued from it removes two thirds of the leak and
collapses the remainder's z-range from 9.2..27.9 to 9.2..11.2, i.e. confines it to the breach.

**But "the horizon is gone" was overstated and is now corrected at its site.** The breach is a
hole by design and still shows desert to two of the eight enclosed cameras, and an eye above the
wall top legitimately sees over it. The claim that survives is narrower and is the one worth
making: *the wall is sound and the residual is the ruin, not a defect.* General form — when a
justification is a scalar computed from the design intent, it describes the design, not the
build. Only a measurement over the built geometry can close it.

**HMR can contaminate a capture that is already running.** `vite.config.js` leaves hot module
replacement enabled unless `SANDS_NO_HMR` is set, so editing a source file while a capture is
mid-run can push the edit into the live page between shots. One `hero` frame was rendered
during exactly that window: its `report.json` stamps the tree clean at the commit it booted
from, and the frame may still contain a later edit or a reload artefact — a 404 appears in the
log at the moment of the edit. The stamp is not lying; it records the boot, and nothing in it
can see a mid-run reload.

So the provenance stamp is necessary and not sufficient. **Either set `SANDS_NO_HMR=1` on any
capture whose frames will be measured, or do not touch `src/**` while one is rendering** — and
in a fleet where several agents edit concurrently, the first is the only one anybody can
enforce. A frame captured during someone else's edit is unattributable even when its own author
did nothing wrong.

---

## 22. Two knobs that could not have done anything, and the arithmetic that says so

§20 ended with "no un-confounded lever has yet moved this character's rim at all". Four legs had
run — `gateoff` (two knobs at once), `planaroff` (global, ±0.4 L), `curveopen` (global, +4–12 L
but +13–20 L on the paving behind him), `magex` (subject-restricted, null) — and the residue was
that the original regression itself was in question.

**A fifth lever was not needed. The gate's own arithmetic settles it.**

`rimBand = smoothstep(0.26, 0.58, fres·mix(0.60,1,wrapRim))`, `fres = (1−N·V)^3.1`, so the rim
term is **identically zero until 69.4° from facing** and saturates at 80.7°. The band is
therefore a sliver at the silhouette of world width `0.064·r`, across which the normal rotates
20.6°. `slyTurn = |∇N|·uRes.y` is large exactly there — 105–386 on Sly at his staged distances,
37 on a temple column shaft — against a gate that saturates at **10**. The margin is 10–160× on
the character and 3.7× at worst anywhere curved. The magnitude gate begins to close only for
radii above ~1.6 m at 3 m and ~7.3 m at 14 m: **planes and near-planes, which is exactly and
only what it was built for.**

Three consequences, none of which needed a capture:

- **`rimMagExempt` is a no-op by construction on its own target population.**
  `mix(rimMag, 1, exempt·vSlySkin)` can only move a pixel where `rimMag < 1`, and on the
  character's band `rimMag` is already 1. `mag1`'s null was a **tautology** — it could not have
  come out any other way — so it is not evidence about what starves the rim, in either
  direction.
- **The knob's stated rationale names the wrong population.** "`slyTurn` is small over his body"
  is true of the body *interior*, and irrelevant there, because `rimBand` is already 0 in the
  interior for an unrelated reason. A statement can be measured, true, and about the wrong
  pixels.
- **`curveopen` could not have moved the character's rim either.** `rimCurve = [0, 0.0001, 1]`
  takes `rimMag` 1.000 → 1.000 on every character pixel carrying a rim: bit-identical on the
  subject. Its +4–12 L was therefore **entirely** external. §20 named bloom off the paving as
  the prime suspect; this makes it the only possibility, from arithmetic rather than an A/B.

The load-bearing assumption — that `slyTurn` reads the *geometric* interpolated normal, not the
normal-mapped one — is confirmed by a measurement made for another purpose entirely: §8's dune
ripples are a **normal map on planar mesh** and went 902 artefact px → **0** under this gate. If
the gate saw the shaded normal, that could not have happened.

### The general form

**Before running a fifth A/B on a knob, check whether the knob can move the quantity at all.**
`rimMagExempt` cost a capture run, a commit, a retraction and a §20 entry, and one line of
algebra on the expression it modifies would have predicted its null before any of that. A
subject-restricted lever that reproduces none of its global version's effect is *suggestive* of
a confound; a lever that is arithmetically pinned on its own population is *proof* of one.

This is the third instrument class in one session whose common property is that it returns a
**plausible** number rather than an obviously wrong one — after §19's counter that nothing wrote
to and §21's grid walk that exits on iteration one. The shared defence is the same in all three:
establish what the instrument *must* report on a known input before trusting what it reports on
an unknown one.

### And a retraction that reached two of its three sites

`rimSubjExempt` (PostFX `TUNE`) exists solely on RESULT-rim3 §3's "temple subject rim lift
30.31 ungated → 8.91 shipped". That attribution was withdrawn when `gate5` isolated the knobs
(`planaroff` off *everywhere* moves the character ±0.4 L; a gate costing 21.4 L cannot be worth
0.4 L switched off). The withdrawal was recorded at `ToonMaterial.js` and `toon.glsl.js` — and
not at `PostFX.js`, where the knob actually lives, so its sole justification went on reading as
a live finding. Now corrected in place.

That is §7's "when a bug has a shape, grep for the shape" from the other side: **one retraction,
three sites, two of them updated.** A retraction is a change with a blast radius and it wants the
same grep discipline a fix does. The site that matters most is not where a knob is *consumed* —
it is where the knob is **declared**, because that is the line a future reader lands on when they
ask what the knob is for.

**Standing count:** three subject-exemption knobs now exist — `rimSkinExempt` (1.0, shipped),
`rimMagExempt` (0), `rimSubjExempt` (0) — each introduced to fix "the character's rim is
starved", and the attribution behind both of the latter two has since been withdrawn. Two of
the three are answers to a question nobody has yet shown has a defect in it.

### The instrument that closes it

`shading.debugTerm(n)` + `postfx.debugRaw(true)` paint the gate terms into the framebuffer with
haze, AO, ink, bloom, the composite (exposure/lift/gain/split/saturation/contrast/AgX/sRGB) and
FXAA all skipped **by control flow**, not by zeroed uniforms — a pass whose strength is 0 still
runs, still samples, and still clamps. Mode 4 writes `(0.25, 0.50, 0.75)` and must arrive as
`(64, 128, 191)`; that is proven offline in ~1 s without the capture lock
(`scratchpad/termproof.mjs`), which is the §1 lesson turned into a procedure rather than a
warning. Mode 4 doubles as the toon-population map, so "is this pixel toon-shaded" stops being
an inference from a graded image.

---

## 23. A term can be present, firing, and provably able to produce the exact signature — and still not be the cause

CHARACTER reported a red-channel crush on the character: `clothDark` authored at R/G 0.342 and
delivered at **0.013**, boot red 0.6/255, tail fur 1.4/255. The discriminator offered with it was
that the loss is **not uniform** — arm fur at HSV saturation 0.15 against tail fur at 0.98 — read
as "the signature of a saturation multiply driving red negative and clamping". `SATURATION = 1.30`
is live in the chain, so the named term exists and is running.

**Every step of that reasoning is sound and the attribution is still wrong.**

`c = mix(vec3(l), c, uSaturation)` is `l + s(c − l)`, which is negative for any channel below
`(1 − 1/s)·l = 0.23077·l`, and the `max(c, vec3(1e-6))` on the very next line amputates it. That
is not a hypothesis, it is the arithmetic — and it is the *same* failure the contrast line's own
comment records having fixed (`#2a3f66` leaving the grade as `#00358c`, red exactly zero), one
line earlier, in a term nobody re-checked. A better-looking candidate is hard to imagine.

Traced stage by stage, `shirtDark` under a cool light leaves the saturation multiply at red
**+9.01e-5 — positive**. It is zeroed two stages later, by AgX's own
`SLY_REC2020_TO_SRGB * color` followed by its `clamp(color, 0.0, 1.0)`: red arrives at −0.00885
and is clipped. Neutralise `uSaturation` entirely and the same pixel still arrives at −0.00234,
still clips, still delivers display red 0. The saturation multiply is neither necessary nor
sufficient. It is a real **aggravator** with a measured share (pinned population 17.7% → 5.1%
going 1.30 → 1.00; only 9% of pinned cases have red driven negative by it at all) and it is not
the cause.

**What settled it was a prediction the two mechanisms make differently, not a bigger number.**
The saturation multiply is channel-*symmetric* — it pins whichever channel is furthest below
`0.23077·l`, which on the warm architecture filling most of these frames is **blue**. The gamut
clip is channel-*asymmetric*: the rec2020→sRGB red row carries −0.5876 on green, an order of
magnitude more than anything in the other two rows, so only red can be driven out. Over 26
materials × 46 lights:

```
                            R      G      B
saturation drove negative  95      0    169     <- refuted hypothesis: blue is its FAVOURITE channel
AgX->sRGB drove negative   89      0      0     <- located cause
display channel pinned     93      0      0
measured in every frame   334-5614  0      0     <- ten frames, zero blue pins, zero green pins
```

So the frames **contradict** the handed hypothesis rather than merely being consistent with the
alternative. Had the saturation multiply been the cause, blue would be the most commonly pinned
channel in the game; there is not one blue-pinned pixel in any frame checked.

**And the discriminator that motivated the hypothesis does not discriminate.** Arm fur 0.15
against tail fur 0.98 is reproduced from albedo × light alone, with no per-material term at all:
`furMid` under the key lands at HSV saturation **0.16**, `furMid` under the cool fill at **1.00**.
The two surfaces differ by the light they receive. A non-uniformity is only evidence of a
per-surface mechanism if the uniform explanation has been checked first.

### The general form, which is new to this file

§16 records a number passing while the thing it measures is wrong. §20 records a lever moving an
ROI it was not confined to. §22 records a knob that could not have moved anything. **This is the
fourth shape: a term that genuinely does the thing it is accused of, to some pixels, some of the
time — and is still not what produced the defect,** because an unconditional downstream term
produces the same signature on the same population. A partial true positive is the hardest of the
four to refute, because neutralising the accused term *does* move the image (here, red goes
−0.00885 → −0.00234, a 3.8× change) and every check short of "did the defect clear" reads as
confirmation. §8's rule — *a knob moving the image proves it is connected, not that it is the
cause* — is usually applied to an unrelated knob. It applies just as hard to a contributing one.

### Two corrections to the report, and what survived

- **The clip is not what breaks the tail.** Profiled along the tail, pinned share is **0–6%** and
  luma still swings 33 → 78 (≈2.3:1). The rings separate. Whatever makes the tail read as
  blotches, it is not this.
- **It is not why the character reads blue.** In the same frame the architecture sits at R/G
  1.55–1.65, B/max ≈ 0.50 (warm) while every character surface is B-max. A global chain term
  cannot be warm on the wall and cool on the subject. The character is blue because the light
  reaching him is — upstream of PostFX.

CHARACTER's substantive claim survives both: the geometry is right and something downstream loses
it. The loss is real, smaller than reported, and in a different term.

### The fix is real, cheap, and in nobody's current scope

`GLSL_AGX` lives in `src/render/passes/Common.js`, which §3 does not assign. The patch replaces
the final hard `clamp` with a luminance-preserving gamut map — blend toward the pixel's own
luminance by exactly enough to lift the minimum channel to 0. **It is bit-identical on all 26,632
in-gamut grid samples (worst delta 0 display bytes), so it cannot regress a pixel the clip was not
already firing on** — which is the property that makes a global tonemap change safe to take, and
it is proven rather than asserted. It does **not** restore red: the colour is genuinely outside
sRGB by then. It recovers the information into blue (distinct outputs over 7 swept scene reds:
3 → 5) and removes the flat pinned patch.

**A standing proposal in `PostFX.js` is refuted by the same sweep.** That file's `saturation`
comment floats "moving `uSaturation` to display space". Applied after AgX it multiplies an
already-clipped value and destroys *more* information — distinct outputs 3 → **2**, worse than
shipped. Recorded at the declaration site per §22, because that is where the proposal lives.

**Checking one level of ancestry is not a detachment test.** A false alarm was raised — and
acted on — that four captures were about to be reaped, on the strength of reading each node
process's immediate parent and finding it was not `1`. That is the wrong test. The survivor
shape in this project is `init → wrapper → node`: the *wrapper* is orphaned to init, the node
hangs off the wrapper, and `ps -o ppid= -p <node>` therefore returns the wrapper's pid, not 1,
on a process that is perfectly safe. Every long run that survived 55–95 minutes this session has
exactly that ancestry.

The consequence was a killed capture and two agents pulled off their work to fix a problem that
did not exist. **Walk the chain to init, or check the session id (`ps -o sid=`), and treat a
non-1 immediate parent as a question rather than an answer.** Note also that `pgrep -f` is not a
safe way to find the pid to check: it matched the checking shell and its own subshells, and
would have written the wrong pid into a pid file. The reliable identifier is the lock's own
queue ticket, which is named `<epoch>-<pid>` by the process that took it.

Left open, and worth stating so it is not quietly assumed solved: **the original watcher deaths
that motivated §14 remain unexplained.** Those processes really did die at ~3600 s. This
correction removes one diagnosis, not the phenomenon.

**A candidate explanation for the ~3600 s deaths, recorded as a hypothesis with its test.**
While verifying a relaunch, a transient wrapper was observed with **ppid 569 — the `claude`
session process** — meaning orphans in this container do not necessarily fall to init: some are
adopted by the harness process itself, which behaves as a subreaper for its subtree. If that is
so, the two fates observed all session have a single cause: a process whose orphan-reparenting
lands on the harness lives inside a *task's* lifecycle and dies when that context is torn down
(the ~3600 s shape), while a process that genuinely reaches init (`setsid --fork` before the
adopting parent exits, or a wrapper that orphans first) outlives everything except a container
restart. The distinguishing test is cheap and should be run on any process whose survival
matters: walk `ppid` upward — a chain that terminates at `1` is safe; a chain that terminates
at the `claude` process is on that task's clock, whatever the process's own age. Unverified;
recorded so the next death can test it instead of starting cold.

**Scope correction to the HMR block above, and it narrows the trap.** `shot.mjs` has spawned
vite with `SANDS_NO_HMR=1` since `e04c9ec` (2026-07-30), and `vite.config.js` turns that into
`hmr: false` plus `watch: { ignored: ['**/*'] }` — so for any capture taken through `shot.mjs`,
mid-run edits never reach the page and the guard is automatic, not something the launcher must
remember. The exposure is **custom runners that spawn vite themselves** without the env var —
which is exactly the population `e04c9ec` was patching when it added the guard to
`cryptgate.mjs` and `horizon.mjs`. A `shot.mjs` frame with a clean log (no 404/reload marker)
is trustworthy even when source mtimes fall inside its render window; the frames are served by
a booted page that holds its modules.

Same report, one more counting rule paid for three times in one night: **the manifest is the
authority, not the directory.** One capture was reported as 7, 8 and 9 shots by three different
counts; `ls | wc -l` counts whatever else lives in the directory, while `report.json`'s shot
rows are written by the harness that rendered them. Count from the manifest.

---

## 24. The character's rim was never starved — the term reads 93–99% — and the residual that *is* real was outside every ROI anyone measured

Two results, opposite in sign, from one paint run (`shots/term1`, `temple` / `sly-closeup` /
`night`, six variants each, one boot). Full working in `scratchpad/RESULT-term1.md`.

### 24.1 P6: the surface gate passes the character's rim

`rimSil` — the factor that multiplies `uRimColor`, painted straight into the framebuffer with
the tonemap bypassed by control flow — read over the fresnel band on the **shader's own** skinned
mask (`vSlySkin = 255`):

| | `temple` | `sly-closeup` | `night` |
|---|---|---|---|
| band px | 368 | 3,181 | 1,559 |
| `rimMag` (magnitude gate) mean / med | 242.9 / **255** | 252.7 / **255** | 255.0 / **255** |
| `slyConvex` (convexity gate) mean / med | 240.9 / **255** | 255.0 / **255** | 254.9 / **255** |
| **`rimSil`** mean / med | **237.4 / 255** | **250.4 / 255** | **252.8 / 255** |
| same statistic on the architecture band | 0 (median) | 0 (median) | 0 (median) |

**CORRECTED 2026-08-02 — the 93–99% is inflated by an unsubtracted floor, and the corrected
figure is ~52%.** The ratio was computed as `base / gateoff` on raw cool-bright counts inside
the character box, but the `norim` control shows that box already contains a large
rim-independent population: on `sly-closeup` the numbers are 1260 → 1213 against **1162 with the
rim removed entirely**. That floor of 1162 sits in *both* the numerator and the denominator, so
it drags any ratio toward 1. Subtract it and the rim's own contribution is **98 px → 51 px, i.e.
~52% retained, not 96%.** The mechanism was reproduced independently on rim2's frames, where
`norim` alone contributes 2,675 cool-bright px inside the box and the same raw-style ratio reads
25.9% against a causal 4.1%.

**The general form, which is worth more than the number: a retention ratio must subtract the
control from both terms.** `after/before` measures what you think it measures only when the
control is zero; whenever a control floor exists, the raw ratio is a weighted average of the
real effect and 1, and it always flatters retention. This is §30's non-circularity instinct
applied to a *ratio* rather than to a null — and it is the second time a reassuring number here
turned out to be an artefact of the population rather than a property of the term (§27.5 was the
first).

~~So the gate is at 93–99% on the character and 0 on planes~~ — the plane figure stands; the
character figure is superseded by the above. The paragraph below is retained because its
*argument* is unaffected: what it establishes is that the gate does not discriminate against
the character relative to planes, and a 52% causal retention against 0% on planes says that
just as well as 96% did.
was built to do. `night`, the shot whose silhouette separation lives entirely on the rim, is the
*least* affected of the three at 99%.

**This closes the thread §20 left open.** Four legs had been run and every one was confounded:
`gateoff` moves two knobs, `planaroff` moved him ±0.4 L, `curveopen` is bit-identical on him by
arithmetic (§22), `magex` is a tautological null (§22). The term itself now says there was never
anything to un-starve: **the original "temple regression" was measured against the two-knob
reference, and the difference it showed is bloom off the paving behind him** — the same leg lifts
that paving +13 to +20 L. Three subject-exemption knobs were built for this defect
(`rimSkinExempt` 1.0 shipped and verified working here, `rimMagExempt` 0, `rimSubjExempt` 0);
the attribution behind the latter two is withdrawn and there is no longer a reason to look for a
fourth.

### 24.2 The first reading of this run was of the wrong population, and the paint is what caught it

`termread.mjs` masks the subject by differencing `base` against `nosly`. On `temple` it reported
`vSlySkin` median **0** over the band and scored P1 and P2 as failures. That mask is *"pixels the
character's removal changes"* — his cast shadow, his bloom halo, the AO he contributes — so most
of it is architecture, where the gate reads 0 **because it is working**. Read on `vSlySkin`
instead, the same frames give the table above.

It is §20 inverted: there, a global lever moved pixels outside the population under test; here, a
mask built out of a population's *effects* was read as the population. **If a probe can paint the
membership predicate itself, difference nothing.**

### 24.3 What is real: a fat cool band the gates pass by design, and it is in `hero`

`hero`'s headline was "open paving 1536 → 107 artefact px". True, and scoped to the paving ROI.
Measured over the **whole frame**, `hero` retains **2,311** rim-caused cool-bright px, and 1,692
of them are one band: a pale cyan bar along the rounded top edge of the lower-right kerb, ~13 px
wide, on the shadowed side of the moulding.

- **Rim-caused**: 1,692 px in the ROI at `base`, **0 at `norim`**. Removing the rim removes the
  band entirely.
- **Not the screen-space term.** On the same band class in `courtyard`: base 557, `surfonly` 557,
  `screenonly` **0**. It is the surface fresnel in `toon.glsl.js`, alone.
- **Not something the gates can reach.** `convoff` 1,692, `planarlo` 1,693, `skinfix` 1,692,
  `aokey` 1,692, `gateoff` 1,920 against `base` 1,692. Every gate lever is inside ±0.1%: the
  surface genuinely turns and is genuinely convex, so **both gates pass it correctly**. No value
  of `rimCurve` or `rimPlanar` will move it.
- **Still live on the current tree**: 1,704 cool-bright px in that ROI in `shots/bud34/hero.png`
  (08:15 today) against 1,692 in `rim2` — unchanged, and it looks identical cropped.
- **Shape, on a control that has the defect.** Thinness (share of artefact px with a non-artefact
  neighbour; a 1–2 px line ≈ 100%, a wash is low) separates pre-gate from post-gate where the
  defect was planar — `combat` 57.1% → 97.0%, `interior` 90% → 100%, `traversal` 87.5% → 99.6% —
  and `hero` sits at **50.0%** *after* the gate. It is the one frame whose residual is fat.

**Why the ROI hid it**: the band is not on the paving. §12's rule applies to region choice as
well as to features — *the question is never "did my ROI improve" but "did the frame improve"* —
and the cheap version of it is to run the causal metric frame-wide once before choosing an ROI.

**Not fixed, deliberately.** The only levers that reach it are the fresnel width itself
(`uRimPower` 3.1 / `rimBand`'s `smoothstep(0.26, 0.58)`) or rim strength on architecture, and
the band's world width scales with the moulding radius — so narrowing it narrows the character's
rim in the same proportion, against a §7.3 condition that nine of ten frames were failing earlier
this session and that §24.1 has just measured as healthy. That is §17's trap exactly: a fix that
moves a shipped look is a change, and it needs its own pre-registered A/B with the character
retention predicted first, not a knob turned on the strength of one kerb.

### 24.4 `courtyard`'s 8,520 → 8,610 is the metric counting the feature, not a residual

`courtyard` was the one shot where the gate reduced nothing. Looked at rather than inferred: the
dominant cluster is the pale edge line along the top of the shadowed stair block and its gate
posts, and with `norim` those edges go flat. Thinness 95.7% at `base` against 92.3% at `gateoff` —
edge-shaped in both states, i.e. **there was no planar artefact there to remove**, which is what
§8 predicted for this shot and is now measured rather than asserted. The causal metric counts
*any* rim-caused bright cool pixel, so on a shot whose rim legitimately lives on edges it counts
the intended feature. Read `courtyard`'s number as a description, not a defect.

Unexplained and left flagged rather than interpreted: `combat` reports `surfonly` 8,625 and
`screenonly` 11,992 against `base` 301 — both single-term legs score *worse than both terms
together*, which no additive model explains. Somebody should find out why before quoting any
`combat` rim number.

**EXPLAINED 2026-08-02 (`progress/records/RESULT-combatrim.md`): it was never rim.** Three
hypotheses were run against differing predictions. Leg-mislabel: refuted by the per-arm
uniform readback in rim1's own log. AgX exit-upward: refuted — the base is *dimmer* (135.7 vs
193.2) at 87.5% of surfonly's artefact pixels, the wrong direction. The located cause is
**FX-phase aliasing**: 95% of the anomalous population is the spire-tip blue sparkle glow at
(1216, 256–448), whose quiet-box luma swings 68.7 / 71.5 / 18.1 / 74.0 / 49.9 across the five
arms *in capture order* while true quiet boxes hold ±2 L — the animated particle system is in
a different phase in every arm, and a pixel-count metric reads the phase difference as a rim
difference. No additive model over rim terms can explain it because rim was never the
variable. The quarantine narrows rather than lifts: combat count-family numbers stay
unquotable until measured under the new sweep standard — a duplicate-arm bracket (same arm
captured twice brackets the phase noise) plus a temporal mask over known animated emitters.
The kerb prereg was amended to use that standard before its first pixel, which is the point
of finding this before running it.

### 24.5 Why the character is lit only by fill: staging, and he is one to two metres off the light

Routed as "occlusion, key direction, or intended staging?" — answer per shot, from ray-casting the
key against Architecture + Props + Terrain built headless (`scratchpad/keyocc*.mjs`, `keymap.mjs`;
full caveats in `RESULT-keylight.md`). Share of camera-visible surface that is both key-facing and
unoccluded: `courtyard` 67%, `sly-closeup` **37%**, `traversal` 32%, `hero` 29% (backlit by
design, nothing occludes him), `combat` 17%, `temple` **0%**, `night` **0%** (sun 59.5° *below*
the horizon — there is no key to occlude, the moon is the key).

- **`sly-closeup` is staging, and it is marginal staging.** He is not in full shadow (63% of his
  surface has a clear path to the sun) and not turned away (the side the camera sees is at
  N·L +0.317). Gridding his position shows the courtyard at this hour is mostly shadowed with a
  **lit corridor two rows deep at z ≈ 30–32**, and he is staged at its western lip: +2 m of x
  takes him 38% → 52%, +4 m → 58%. The frame's own warm wedge sits exactly there.
- **`temple` is a different answer**: 100% of body samples are inside `arch:hall:column_papyrus`'s
  shadow, from a column 1.9 m away, *and* his camera-facing side is edge-on at N·L −0.007. No
  staging nudge fixes that one.
- Two architecture occluders are named rather than inferred, by clustering the ray hit points
  (these meshes are 40–77 m merges, so a mesh name is not a location): the **west courtyard wall
  top edge at (−22.2, 8.6, 27.4)**, and a **`bronze_dark` piece at (−2.2, 2.3, 30.0)** — 2.2 m due
  west of the staged player, sitting on his key axis at chest-to-head height.

**Where this probe and the frame disagree, and it is recorded rather than resolved:** the ray set
calls the ground at his feet lit; the frame measures it shadowed (R/G **0.80** under him against
**1.36–1.80** on lit paving 3 m east, with a crisp boundary visible in the crop). A metre of
disagreement is inside this probe's own stated gaps (capsule vs skinned pose, no shadow map, no
normal bias), so it is **not** filed as a shadow-map defect — but it does mean his lighting is
knife-edge sensitive to where he stands, which is the actionable part.

### 24.6 AgX's gamut clip now maps instead of amputating — and the prediction registered for it was impossible

Landed in `src/render/passes/Common.js` (§23's routed fix): the final `clamp` after
`SLY_REC2020_TO_SRGB` blends toward the pixel's own luminance by exactly enough to lift the
minimum channel to 0.

- **No-op outside the population it fixes**, verified with the constants parsed out of the file at
  run time (§18): **0 of 42,123 in-gamut grid samples change**, in float64, not to a tolerance.
- **Compiles and behaves in the driver**, not only in the model: `scratchpad/agxcompile.mjs`
  renders five known radiances through the patched shader on the harness's own
  ANGLE/SwiftShader — 1 program, `glError 0`, no shader messages — and `agxcmp.mjs` finds the
  bytes **exact** against the float64 model on 5 of 5, in-gamut samples identical under both
  modes, pinned samples moving in blue (77 → 68, 64 → 53).
- **The registered prediction "pinned-red 5407 → 0" was withdrawn *before* the capture, because it
  was arithmetically impossible.** The map sets the minimum channel to exactly 0, so a pixel the
  clamp pinned at display red 0 stays at display red 0 and `pinned.mjs`'s count is unchanged. I
  had written a prediction about the fix's *intent* (recover the channel) where the metric can
  only see its *arithmetic* (lift to the gamut boundary). What the patch actually buys is that the
  pinned patch stops being **flat**. Frame A/B queued as `shots/agx1`.
- First attempt at this edit put **backticks inside the GLSL template literal** and broke
  `Common.js` at module load. Caught in seconds by importing it; it would otherwise have been a
  black frame for whichever agent booted next. Prose comments go into GLSL strings without them.

**CLOSED by the agx1 frame A/B (boot `7b0e3f8 dirty:false`), read 2026-08-02 ~12:04.** The
corrected prediction is what the frames show. The R-pin census is invariant under the map,
in-frame: sly-closeup **5,400** vs the committed pre-map 5,407 (0.13%), hero **333** vs 334 —
across five intervening commits, which doubles as magnitude validation of the rebuilt reader
(the original died with the restart; the rebuild self-diffed zero and reproduced a constructed
known exactly). G/B pins are **0 in all three frames** — §23's rec2020→sRGB asymmetry argument
holds post-map. `night`'s 300 vs 126 is not like-for-like (1–8 px FXAA-edge specks; 44dede5's
tail retune moved exactly the dark-fur population that pins there) and was rejected as a
comparison, not explained away. And the thing the map was for: sly-closeup's 195-px pinned boot
component now carries **98 distinct (G,B) pairs, interior |∇B| 4.17** — at 4× it reads as a
modelled form (shaft gradient, seam, ink line), not a hole. Durable copy:
`progress/records/RESULT-agx1.md`. This closes §23's fix chain end-to-end: attribution (§23),
arithmetic (§24.6), driver bytes (agxcmp), and now the shipped frame.

### 24.7 `GuardModel.js`'s `scleraTint` — closed by CHARACTER at `b87f79a`, and I nearly filed it as a misread

Routed to me as "still carries the pre-fix 0.82". It did, until **09:09 today**, when the file's
owner landed `b87f79a` (0.82 → 0.15). By the time I read it the live value at line 63 was 0.15
and the only `0.82` left in the file was at lines 47–48, **inside the comment that fix wrote to
explain itself**.

I had this queued to report as "the routing was a comment read as a value" — the §8 `goldSpec` /
§13 `rampFloor` family. `git log` on the file says otherwise: the item was real when it was
routed and someone else fixed it in the interval. **Check when a value changed, not only what it
is now** — on a tree taking several commits an hour, "I looked and it was fine" and "it was never
broken" are different claims, and only one of them is checkable.

---

## 25. §7.3 gold-hot: the mip hypothesis was measured and does not bind — the wall is the AgX shoulder, and the line routes to POSTFX

The spec1 A/B (uSpec 0.55/0.85/0.95 poked live on `arch:hieroglyph_gilded`, GEOMETRY) produced
a real, localised, on-form specular lift on the kiosk's gilded lintel and **0 px at L ≥ 235 in
every arm**. The standing explanation — TEXTURES' own bound, "mip filtering averages the sparse
gild peaks away" — was then measured rather than accepted, and it is false where the verdict
was decided.

**Where the gilded band samples.** Per-pixel λ from perspective-correct UV derivatives on the
built geometry (`scratchpad/gildmip.mjs`; instrument anchored on `temple`, which returns
λ_iso p50 1.87 against 1.4–1.9 predicted by the recipe note's own px-per-repeat arithmetic):
the spec-responsive population in `hero` — 1,554 px, spatially coherent on the kiosk lintel,
found by monotone rise across the three arms on the gilded matmask — samples the ORM at
**mip ~0** (λ_iso p50 0.09, p90 3.86; with 16× aniso p50 0.00). The band is majority
*magnified*: one ORM texel is 25 mm of world, the median band pixel ~21 mm. SwiftShader's true
aniso conduct is immaterial to this conclusion (both bounds agree at the median). The far tail
and `temple`'s architrave run (ORM λ ~1–4) do lose their peaks to mips — max 3.61 → 2.38 by
three halvings (`scratchpad/gildmips.mjs`) — but that is not where spec1 was scored.

**What the peaks lose on the real path at mip 0** is only `packORM`'s div-2: over-onset share
29.9 % → 26.5 % at 0.95 (16.4 → 13.8 at 0.85), ndh=1 max 3.91 → 3.61. The mip-0 mask
essentially transfers to the frame.

**What actually caps it.** The hot cohort (top decile of responsive px) measures
**L(0.55) 187.9 → L(0.85) 200.6 → L(0.95) 203.9**: slope falling 42 → 33 L/uSpec, log-fit
L ≈ 203.9 + 21.7·log2(0.05 + u), so surface L 235 needs ≈ **2.7× the scene spec of the 0.95
arm** — a floor, since the AgX slope keeps falling. Nothing in `hero` exceeds L 226.4 in any
arm; the frame max is the *sky*, bit-stable across arms. Texture-side headroom, stacked and
optimistic — recover packORM ×1.09, crest parity with `gold_leaf` ×1.56 (at the dirty-snow
cost the gold doctrine records), peak-preserving mips ×1.13 — tops out **< ×1.9 < ×2.7**.
Peak-preserving mip chains are additionally the wrong tool at distance: min-rough mips drive
the far-band over-onset share to 60 %, i.e. whole architraves catching the lobe, the "glows
uniformly" failure. Declined with numbers, not by taste.

**Routing.** §7.3's "hot" on gilded architecture is bloom's to deliver — which is what §7.3's
own wording ("hard spec + **bloom** + dark occlusion") already says. POSTFX's metal-aware
bloom feed is the lever with headroom: the responsive cluster feeds ~2.2–3.6 scene (ndh=1
bound) against the 1.90 onset — a thin margin a metal-aware onset/gain reaches without
touching stone. Two facts to carry into that A/B: `spec` is `sh`-gated (`toon.glsl.js:461`)
and `hero`'s gilded band is 98.6 % shadowed, so no spec/bloom lever touches the band's body —
that read is carried by the shipped dark occlusion and metalEnv; and under the shipped grade
the "0 px ≥ 235" criterion cannot pass on *surface* pixels in `hero` at any authoring — score
a bloom change on the halo (bloom adds display-space energy past the shoulder; the old blown
`combat` frame at 237.7 is the precedent that 235 is reachable at all).

`uSpec` 0.55 stays shipped. TEXTURES' side of the gold line — dark occlusion, value mass,
crest scatter — is done and verified in the texture (§8); no texture change ships from this
finding. Full working: `scratchpad/RESULT-goldmip.md` (pre-registered, `PREREG-goldmip.md`);
instruments kept in the scratchpad: `gildmip.mjs`, `gildmips.mjs`, `gildresp.mjs`.

**MEASURED 2026-08-02 (`progress/records/RESULT-goldhalo.md`): the gain formulation of that
routing is dead, and this section's own arithmetic said why before the run did.** The goldhalo
A/B (hero+temple × bloomMetalGain {0,4,12,24} + gain-0 falsifier arm, boot 4ef5f44 clean,
per-arm uniform readbacks verified) found that at gain 24 — a ×25 feed multiplier — **zero
temporally-stable pixels changed**: full gilded annulus, kiosk halo, gilded body, and the
bit-stable frame max 226.4, all flat. The arithmetic closes rather than surprises: §25 quoted
"feeds ~2.2–3.6 scene" from the ndh=1 *bound*, but its own log-fit puts the hottest gilded
pixel at scene ≈2.0 against the shipped onset 1.90 — w ≈ 0.004, and ×25 of nearly-nothing is
sub-quantization. `bloomMetalGain` stays 0. The lever with actual headroom is a **metal-aware
onset** (`mix(T, Tmetal, metal)`, Tmetal ≈ 1.2–1.5, DG-safe by the same arithmetic) — new
prereg required; nothing ships from this finding.

Two instrument rulings from the same run, both coordinator-decided. **F1 (bit-identity
between the two gain-0 arms) failed on both shots and the run stands anyway**: the diff is
§24.4's temporal-FX class (torch flame cores, shaft/dust overlays — 4–23% of it anywhere near
gilded), the bar as sealed is unattainable on any shot with animated emitters, and the a0/a0b
bracket *is* the temporal mask working as §24.4's sweep standard intends. The sealed letter
("run invalid") is preserved in the RESULT; the temporally-masked statistics are ruled the
operative evidence. ~~Standing rule: **a bit-identity falsifier on an FX-bearing shot must be
written as a duplicate-arm bracket + temporal mask from the start** — demanding byte equality
from an animated frame is sealing an impossibility, §26.1's cousin.~~ **RETRACTED — see §28.**
That ruling was mine and it was wrong: the impossibility was not in the animation, it was in the
harness advancing its world clock between arms. Pin the clock (`step(n, 0)`) and byte equality is
achievable on any shot; the bracket is a check that the pin held, not a substitute for it.
Temple's F2 control "failure" was the same time-noise (moves more at gain 0 than gain 24; masked,
14× under the bar); hero's F2 passed unmasked.

---

## 26. Two prereg design flaws, found by the seals' own verdicts — bands that don't partition, and an adjective with no metric

Both from cap5's sealed read (`progress/records/RESULT-cap5.md`), and both are flaws in how
the *seal* was written, discovered only because the measurement was honest against it.

**26.1 The registered bands left gaps, and the measurement landed in one.** The tail ratio
bands were pass 0.97–1.16 · fail-low < 0.75 · fail-null ≥ 1.22 — which leaves (1.16, 1.22)
and [0.75, 0.97) unassigned. The verdict frame measured **1.168**: 0.008 above the pass
ceiling, 0.051 below the null floor, claimable as nothing. The seal survived this only
because it had pre-declared the routing for an out-of-band result ("a finding, not a
verdict"), so the gap did not turn into a post-hoc judgment call — but that was the backstop
working, not the design. Rule: **registered bands must partition the outcome line.** Every
value the instrument can emit belongs to exactly one band at seal time; if a deliberate
buffer zone is wanted, it is itself a named band with a declared meaning. (The look-criterion
half of the same verdict failed independently — tip crown of separated triangles, underside
stud row — so the shipped 1.35 stays neither falsified nor exonerated, and the next lever is
authoring, not the ratio: the tip/underside spikes are separate authored structures that
`tuftRollW` never touched.)

**26.2 A sealed adjective is not a sealed metric.** K2 registered "materially brighter mean L"
for the keyed face. The frame delivered the *mechanism* unambiguously — cream muzzle under
the warm key, cap-brim terminator crossing the brow — while matched-mask mean L moved only
72.8 → 75.4 (+3.6%), because the mask/ink/hood population is lighting-invariant and
compresses the aggregate; the gain lives in p75 (+11 L) and below the mask. The only frozen
number in the seal (litFrac ≥ L110, +2.5 pp) moved in the predicted direction; the adjective
had no threshold to meet. The verdict had to *explain* the compression rather than claim a
band — honest, but explanation-after-measurement is what seals exist to prevent. Rule: every
prose claim in a prereg either carries a number and a threshold at seal time, or is marked
non-binding. "Materially" is a judgment deferred to exactly the moment it should have been
made.

**26.3 A remedy clause has a tense, and the schedule can falsify it.** The fingerprint seal
wrote its verification as running "before the fix ships". The fix shipped first — the queue
was two hours deep and the edit was committed for restart-safety in between — so on a FAIL
the remedy is no longer "withhold the patch" but "revert a shipped commit". The bands, the
procedure, and the instrument are all untouched by this; only the consequence changed. FX
caught it in its own seal and recorded it in the runner header rather than letting the record
imply a withholding that could no longer happen. Rule: **write the remedy as a function of
state, not of schedule** — "if FAIL, the change does not remain in the tree" holds whenever it
runs. And when a seal's assumed ordering is broken by the queue, say which ordering actually
happened; a verification's authority comes from its bands, but its *honesty* comes from the
record matching what was really done.

**26.5 Narrowing a seal after the fact is safe; widening it is not.** Two grounding
investigations converged from opposite directions — one predicting the shadow is *displaced*
8–46 px laterally, the other measuring that the occlusion is *too weak* by an order of magnitude
even at its ceiling — and the risk was that a null on the first would be read as closing the
whole finding. The fix was an addendum written **before any frame of that run existed** which
changed **no threshold** and only restricted what a FLAT outcome is permitted to *conclude*:
displacement eliminated by measurement, a dedicated contact term still owed, the AO knobs still
proven dead. It stated the converse too — a positive result there does not overturn the other
measurement.

That is the general rule worth having. **An amendment that makes a seal claim *less* is
legitimate at any time, because it cannot manufacture a pass; an amendment that makes it claim
*more*, or that moves a band, must precede the pixels.** §27.5 and §33 are both about the second
kind. This is the first clean example of the first kind, and the tell that it was legitimate is
that it constrained its own author's conclusion rather than freeing it.

**26.4 The acceptance set omitted the shot the fix breaks.** The task-16 seal registered its
tint→turquoise arm on `night` and `day` and never evaluated `interior`. Modelled afterwards, the
sealed arm drives `interior`'s shadows to hue **345 (magenta)** and then **69 (olive)** with
saturation collapsing to 0.039–0.067 — violating §2.2 in both directions, on a shot the seal's
own run order never renders. Only the smallest candidate (`turq 0.10 + mix 0.05`) survives all
three. A seal that ships a global lever must evaluate it on every shot the lever can reach, and
**the run order is part of the seal**: if a shot is not in the capture list, its verdict is not
"fine", it is "unmeasured". The same addendum recorded a second limit worth carrying — the ≤226
acceptance is **not offline-decidable**, because the seal's own validated model→frame offsets are
8–24° while the decision margin is 0–20°. That is §11 exactly: the correction you are skipping is
the size of the effect you are deciding. No model hue was quoted against the ledger.

---

## 27. A verdict that nearly went wrong three ways, and one verdict that cannot exist

All four from the cap6 read (`progress/records/RESULT-cap6-verdicts.md`). The tail verdict is a
FAIL on its tip band, and it is a *trustworthy* fail only because three separate traps were
caught on the way to it.

### 27.1 An instrument that derives its ROI from live source cannot measure an old frame

`taillobes.mjs` builds its tail mask from the live rig. Re-run on the pre-change frame it
returned under 6 / meanDepth 3.3 against the sealed 7 / 4.1 — which reads exactly like a
provenance failure, or like a seal that had been quietly written to fit. It was neither: a
**post-change mask over pre-change pixels**. Rebuilding the baseline from the archived sealed
tree (`git archive 7b0e3f8` into a scratch dir, instrument repointed, working tree untouched)
reproduced the seal to the digit — tip 2, under 7, top 3, 4.1 / 2.3.

**Rule: when an instrument reads geometry from source, a baseline needs both the old pixels and
the old source.** Keeping the old PNG is half a baseline. This is the mirror of §18 (a model
validated against a dead tree): there the *reference* was stale, here the *instrument* is live
against a stale frame, and both produce a confident number about nothing.

### 27.2 A difference metric cannot be re-anchored from one endpoint — and I told it to try

`SPEC-startle-pupils` scores ΔdarkFrac = calibration − verdict and requires a **pre-change**
calibration capture. `cap6` was the first capture ever to contain `sly-startle`, and it is
post-change: **there is no minuend.** I had instructed that if the provisional bands proved
mis-scaled, they should be re-anchored from this frame's calibration. That instruction was
wrong, and it was correctly refused: re-anchoring rescues an *absolute* band, never a
*difference* whose other endpoint was never photographed. The remedy is a capture, not
arithmetic — neutralise the pupil keys, shoot `sly-startle` once, and that frame is the missing
minuend. A coordinator's convenient suggestion is worth exactly as much as its arithmetic.

~~The same read fired a guard on its first exposure: the **catchlight reads L121.9 on the right
eye against a ≥180 bar** (L198.8 left).~~ **BOTH NUMBERS RETRACTED — the boxes excluded the
glint (see the close-out at the end of this subsection).** ~~because the glint rides the constricting bone and
shrank with the pupil.~~ **That attribution is retracted** — it was stated in the cap6 report,
relayed onward by me, and refuted by its own author on the next pass: the glint does ride the
pupil bone, but the constriction is **identical on both eyes** (`pupilL` and `pupilR` both
`[0.35, 0.35, 1]` in the same clip), and *a symmetric cause cannot produce an asymmetric
result*. §23's shape a second time — a term present, firing, provably able to produce the
signature, and still not the cause. What the frame actually presents is two eyes it does not
present equally: `dot(outward, toCamera)` **0.963 left against 0.684 right** (≈16° vs ≈47°
off-axis), 48 px against 34 px, with `sly-closeup` carrying the same asymmetry. A single
threshold was applied to both. **The guard did its job by firing on a real difference; "right
eye < 180" is not yet evidence of a defect in the eye** — it may be evidence about the framing,
or a correct dimming no threshold should have been set against. It is settled for free by the
calibration capture §27.2 already requires, and no geometry change is sealed until then:
shipping one now would be a fix for nothing, tuned against a number it can move.

**CLOSED by the calibration pair, and the answer was neither hypothesis.** With the pupil keys
neutralised and everything else held, the catchlight measures **left 161.1, right 163.2** — a
spread of **2.1 L, not 33**. The asymmetry this subsection was built to explain **does not exist
in the render.** Both earlier readings (L198.8 / L121.9) came from a pinned box carried over
verbatim from the `night` eye ROI, and **that box excludes the glint entirely** — verified by
eye, the highlight sits above the box's top edge. So the first explanation (the glint riding the
constricting bone) was refuted by symmetry, the second (the eyes presented at very different
view angles) explained a difference that measurement now says was never there, and both were
reasoning about an artefact of where a rectangle was placed.

What is real, and much duller: the guard's ≥180 bar genuinely fails at 161–163 — but
**symmetrically, and identically with the keys active or neutralised** (Δ ≈ +0.1/+0.2). It is
therefore not attributable to the pupil work at all; it is framing or grade, and it needs one
frame rather than an A/B, which makes it immune to every confound that complicated the rest of
this pair.

**The transferable lesson is about ROIs, not eyes.** A box inherited from another shot is an
*assumption* wearing the costume of a measurement, and it produced two successive confident
explanations of a phenomenon that was not in the image. Before explaining an asymmetry, confirm
the ROI contains the feature — by eye, at magnification, on both frames. (§30's non-circularity
rule is the same instinct applied to nulls; this is it applied to populations.)

**And the pupil verdict itself PASSES**, which is what the pair was for: ΔdarkFrac
**+0.726 / +0.731** on the pinned boxes and **+0.575 / +0.612** on empirically-located ones,
against a ≥0.12 band — roughly 5× the threshold on either ROI choice, and confirmed by eye
(large dark pupils in the calibration frame, small constricted ones in the verdict frame). The
missing minuend was the whole obstacle, and one capture supplied it.

### 27.3 The prereg costed the visible mesh and forgot the inverted hull

`PREREG-tailtip` costed the change at +522 triangles — the body-mesh delta. The character
carries a 1:1 inverted-hull ink shell, so the shipped cost is **+1,044, exactly ×2**, confirmed
per mesh (`sly_body` and `sly_outline` both 15,482 → 16,004). Draw groups did not move.
**Every character geometry change costs twice its mesh delta**, and no character prereg in this
project had ever said so.

One caveat that stops the next chase before it starts: the frame's residual (+764 tris, +2
draws) is *not* from `src/player/**`, and is not necessarily a code change at all — `cap5`'s own
`sly-key` and `sly-closeup` differ by 1 draw / 1,056 tris **on a single tree**, so a 2-draw delta
sits inside scene-side emitter/cull variation. Chasing it as a defect would be chasing noise.

### 27.4 Two process failures worth the same care as the measurements

**A 19.5-hour-stale instruction was acted on before it was checked.** A relayed cap2 directive
described a lock holder and a pid from the previous day; the pid was killed before anyone ran
`date` or `ps`. No harm followed (the frames were stale anyway and no ticket was squatted), but
§14's ancestry checks answer *"is this process alive"*, never *"is this still the situation"*.
Verify freshness before acting on any relayed process instruction — including mine.

**`report.json` is written incrementally, so its existence is not completion.** A watcher keyed
on the file fired "cap6 FINISHED" after shot 1 of 2. Key completion on the last expected PNG, or
on the harness's own `done` line.

**A bulk `git add` commits whatever an agent happened to write, read or not — mine, twice.** The
sweep convention is that agents write to the scratchpad and the coordinator copies named files
into `progress/records/`, having read them. Several agents began writing *directly* into
`progress/records/`, which is sensible on their side — the scratchpad is restart-mortal — but it
means a `git add -A` or `git add progress/records/` silently publishes documents nobody has read.
Two seals and a set of PNGs went in that way; the second time was in the very commit whose
message said bulk adds would stop, which is the useful part of the lesson: **a rule announced in
a commit is not a rule implemented in the command.** Both were read afterwards and were sound, so
the cost was zero this time and the exposure was not. Sweep by explicit filename, and treat any
path an agent can write to as unread until you have read *that version* of it — a file already
committed can be extended in place, so "I read this file" is a claim about a revision, not a name.

### 27.5 Re-anchoring the band would have preserved the broken box

One agent's offline arithmetic predicted that another's sealed gate would fail *warm* on a
correctly functioning arm, and an independent transcription confirmed it to the digit: neutral-arm
shadowed sandstone lands at b−r **−38**, paving −43, ROI-weighted −41, against a registered
`[−15, +15]` that would have failed a working arm by 23–33 counts. The stated cause is §8's
category error a second time — **a band written for the light, applied to a pixel**. Neutralising
the light exposes the albedo, and sandstone is warm by authoring.

The instructive part is what the disagreement did *not* name. Re-anchoring the band, which is
exactly what I asked for, would have preserved a worse defect: the certifier box called
`PAVING-SHADOW` is **70.4% `sandstone_block`**, and five of six unprojected probes land on a
**west-facing vertical kerb face** with ndl **+0.927** against the key — which the neutral arm
does not neutralise. Its statistic swings **−38 → −116** across keyF 0→0.6 while never leaving
its own luma gate. A box named for shadow was reading a lit face, and a re-anchored band would
have been a wrong claim with better arithmetic.

**Rule: when a gate misfires, ask what its ROI is actually made of before you move its band.** A
band is a claim about a population; fixing the number while the population is wrong is the more
dangerous repair, because it silences the symptom that would have led you to the box.

Two disciplines from the amendment worth copying wholesale. The replacement moved to a box
**already frozen in the same file and the same run** (`WALL-SHADOW`: one material, one plane,
subject bbox clearing it by 12 px) rather than authoring a fresh ROI after the fact — an
amendment inside the seal, not a new instrument built around a known answer. And the
post-derivation corroboration (`WALL-SHADOW` reads +35 on shipped frames against the model's
+38) was quarantined in its own section and **explicitly barred from tightening the band it
corroborates**: three counts of agreement would have justified a narrower S1, and taking it
would have been fitting the band to the evidence it exists to test. The substantive predictions
never moved — only the certifier did.

---

## 28. Every within-boot A/B in this project was captured at a different world clock — and it is a one-token fix

Found while scoring `goldonset`, and it reaches backwards through several results.

`window.__GAME.step(frames = 1, dt = 1/60)` calls `engine.renderFrame(dt)`, which **advances
`engine.time`**. Arms captured sequentially inside one boot are therefore rendered at different
world times, and every animated term rides that clock — torch flames, dust, shafts, sparkle,
birds. There is no `performance.now()` or `Date.now()` anywhere in `src/fx` or `src/render`, so
the engine clock is the *only* phase source, which is what makes the fix total.

The docstring reads *"Deterministic fixed-step advance — no reliance on wall clock"*
(`src/core/Debug.js:125`). That sentence is true and is exactly what kept the trap invisible for
weeks: **deterministic is not phase-stable.** Freedom from the wall clock buys reproducibility
across runs; it does nothing about the world clock moving between arms *within* a run.

**The fix is one token at the call site: `step(n, 0)`.** Frames still advance — poked uniforms
propagate, SwiftShader still flushes — while `engine.time` stands still. With the clock pinned, a
duplicate arm must produce **exactly zero** moved pixels, so bit-identity returns as the right
falsifier instead of a 40 % tolerance band.

### What this retracts

- **§25's amendment, which was my ruling.** I declared byte equality on an FX-bearing shot "an
  impossibility" and canonised bracket + temporal mask in its place. The impossibility was a bug's
  shadow. The standard reverts to the stronger one: **pin the clock and demand bit-identity**,
  keeping a duplicate arm as evidence the pin held.
- **§24.4's combat anomaly is now root-caused rather than merely located.** "FX-phase aliasing"
  was the right diagnosis; this is *why* the phase differed.
- **`goldhalo`'s F1 failure** was not an animated frame refusing to be identical — it was the run
  moving time between arms. Its masked statistics stand as far as they go, but the run had less
  power than it appeared to.

### `goldonset` is VOID, and its stop-band must not fire

The bracket arm `c0b` — an identical setting to `c0` — moved **more** gilded-architecture pixels
than the strongest real arm: 17,787 vs 17,527 on `hero`, 4,362 vs 3,739 on `temple`, at comparable
lift. Signal-to-phase below 1, so every pixel verdict in the run is void.

The seal's registered MECH stop-band — *"the onset formulation is not the lever either; §25's
routing is wrong twice — say so, stop"* — reads as **satisfied, and must not be applied.** A
stop-band met by a run with no power is a false negative, not a finding. **§25's routing is
untested, not refuted**, and the honest state of the gold line is that its replacement lever has
never actually been measured. Lesson for the next seal: **a stop-band needs its own power
condition attached**, or it will fire on noise exactly when the experiment is weakest.

### The control that caught the author's own misreading

Cropping on the strongest measured change showed two tight warm elliptical blobs — precisely
§7.3's "tight coloured halo", precisely what the experiment was hoping to see. Re-rendering those
same crops as `c0` vs `c0b`, **both at cut = 0**, reproduced the same blobs at the same positions
and amplitude. All phase. The same control killed an intermediate inference that the movers were
static "because they survived the temporal mask" — a two-phase bracket nulls itself by
construction and is blind to the phases between.

**When a result looks exactly like the thing you hoped for, render the null arm at the same crop
before believing it.**

Two prereg faults from the same seal, independent of phase and worth not repeating: a p95
statistic over a 45,984-px annulus cannot see a ~50-px effect by construction, and a "brightest
1,000 non-metal pixels" selector never sampled the 1,072 actual movers.

---

## 29. Two preregistered fixes, each passing its own bands, making the frame worse together

The strongest argument for preregistration is that it stops you rationalising a result after you
see it. This is the case it does **not** cover, and it was caught with one sweep rather than one
capture.

`hero`'s silhouette fails on the cane hook — 5.5% of the union outline with 41.2% of its own
boundary buried inside the torso. Two fixes were obvious and were about to be sealed
independently: move the **cane aim** so the hook clears the body, and **sweep the tail** so the
cap stops being welded to it. Each had a plausible mechanism, each would have been given
partitioning bands, and each would have **passed its own seal**.

A 96-row joint sweep says that together they drive hook outline to **1.5% — worse than the
untouched baseline, on the exact condition both fixes exist to repair.** Two green verdicts and a
worse frame. The tail must not move; the shipped seal is cane aim alone, and the tail's position
is now a *constraint* on that seal rather than a second opportunity.

**Rule: independently sealed changes to the same observable must be swept jointly before either
ships.** A prereg fixes the standard of evidence for one change; it says nothing about the
composition of two. Where two levers touch one metric, the seal must either (a) register the
joint arm as part of its own design, or (b) state the other lever's value as a frozen
precondition — "this verdict holds only while the tail stays where it is". Sealing them as
independent experiments quietly asserts they are separable, which is a physical claim about the
frame, not a procedural one, and it is exactly the claim that was false here.

**A second finding from the same instrument, about clusters.** The tail-sweep case was wrong
twice: its motivating number, "74% of the cap's boundary is buried", was the instrument scoring
the *internal* cap/skull seam as burial. Scored on the head+cap **cluster** — the thing a viewer
actually sees as one shape — it is 39.4%. **When parts are adjacent by construction, per-part
boundary metrics measure the construction, not the silhouette.** Cluster first, then measure.

Two hypotheses were also killed cheaply in the same sweep, both of which would have read
plausibly in a write-up: the cane aim *does* have a lever on screen position (42 px of hook
centroid travel — `CANE.plant`'s tip-height invariance is about a fixed radius from a fixed grip
and does not generalise), and the right arm is not the lever (all five arm variants made burial
worse, 41.2% → 47.9–77.4%; the shipped arm is the best of them).

---

## 30. Phase contamination is a property of the statistic, not of the run

§28 killed `goldonset`. The very next run carried **the same contamination, worse**, and its
verdicts are readable. The difference is not the physics; it is which number was being asked for,
and this is the rule that decides it.

`creamfix` measured its own phase floor first, as its addendum required: `base` vs `baseB` — an
identical setting — differs by **181,071 px on `night` (19.65% of frame)** and **245,674 px on
`sly-closeup` (26.66%)**. The arms under test move *fewer* whole-frame pixels than that duplicate
does (168k / 208k / 233k). That is exactly the shape that voided `goldonset`, and the expectation —
stated by its own author beforehand — was that it would void this run too.

It does not, because the sealed verdicts are **ROI medians**. Measured in the same statistic as the
claim, the null is:

| ROI | null (`base`→`baseB`) | effect at the verdict arm | ratio |
|---|---|---|---|
| cream band (V1) | **1.0** | −88.0 | 88× |
| navy rings (V2) | **1.0** | −49.0 | 49× |
| wall shadow (V5 certifier) | **0.0** | −77.0 | >154× |

**A median over 1,000–12,000 px is nearly immune to small-amplitude, spatially scattered drift; a
"did this pixel change at all" count is maximally sensitive to it** — a change-count is a threshold
at ε, so every pixel that moves by one least-significant bit counts the same as one that moves by
100. Count-family statistics are phase-dominated. Robust location statistics are not.

**The operational rule: measure the null in the same statistic as the claim, and make it
non-circular.** A null computed on a mask built from the arms agreeing is circular — it can only
tell you that the pixels you selected for agreeing, agree. `creamfix`'s nulls are unmasked for
exactly this reason. Do this and a phase-dirty run still yields every verdict whose statistic is
robust, while honestly voiding the ones that are not: here V1/V2/V4/V5 are read verbatim and **V3,
a whole-frame pixel-count claim, is VOID** — not failed, and explicitly not "read with a wider
band".

Three practices from the same read worth keeping:

- **Removing an instrument is not re-anchoring a band.** The frozen reader's temporal mask excluded
  **2,965 of 3,000 px** in the cream box, leaving n = 0, and the reader stopped rather than scoring
  an empty population. The mask exists to suppress phase; phase on that statistic is worth 1.0
  count. Dropping it and scoring the raw population with **every threshold exactly as sealed** is an
  instrument correction. §27.5's warning is about moving a *band* to rescue a result — no threshold
  moved here, and the distinction is the whole difference between honest and not.
- **A two-phase null cannot establish absence.** V3's off-subject diff appears almost entirely in
  the null, but "almost entirely" is not "none", and inferring absence from a two-arm bracket is the
  invalid step `goldonset` already recorded against the same author. It was not repeated; the leg is
  void and one pinned capture settles it.
- **Predicting the void and then being wrong about it, out loud, is the finding.** The correction
  above exists because an expectation was written down before the numbers and then contradicted by
  them.

---

## 31. The null control failed, the diagnosis exonerated the change, and the change was reverted anyway

`PREREG-fingerprint-geometry`'s three legs, measured on a run that was pinned by construction
(`fpv.mjs` never calls `step()`; all five frames sit at `time 0.5333` in one boot, so §28 does
not touch it and §30 does not need to be invoked):

| leg | measured | band | verdict |
|---|---|---|---|
| V1 stake — in-place position edit | **0 px** | `= 0` | **PASS** |
| V1 non-vacuity | 105,748 px | `≥ 200` | probative |
| V2 stake — `drawRange` edit | **0 px** | `= 0` | **PASS** |
| V2 non-vacuity | 12,406 px | `≥ 200` | probative |
| V3 null control — no edit, 100 frames | **26** (14 → 40) | `≥ 9` = FAIL | **FAIL** |

The correctness claim is established: with the geometry terms in the fingerprint, the cached
path reproduces the uncached path **bit for bit** after a geometry edit, and neither
non-vacuity leg landed in WEAK or VOID, so those zeros are real rather than a test that could
not have failed.

**Then the null control failed, and the diagnosis pointed away from the change.**
`_censusCasters()` ends by setting `_staticSig = NaN` and runs every 8th frame, so **every
cached cascade takes a full static refresh on 12.5% of frames whether or not anything changed**
— 12–13 censuses × 2 cascades + 2 from the restore ≈ 26–28, against 26 measured. That line
arrived with the *original* cache commit (`002f27e`), seven hours before the fix under test, and
the fix's own terms spent exactly +2 refreshes per edit with no excess.

**The change was reverted anyway, and that is the entry.** Its author's words: *"the failing
control doesn't implicate my change" is exactly the argument that manufactures a pass.* The band
was sealed before any code existed, 26 lands squarely in FAIL, and the remedy was already fixed
as a function of state rather than schedule (§26.3) — the fix had shipped ahead of its
verification, so FAIL meant revert, not withhold. The hunks reverse-applied cleanly, the terms
are gone, and the KNOWN-GAP note is back where it was. The geometry hazard is latent and
recorded again, which is a worse *engineering* position and a better *epistemic* one, and the
follow-up is ordered correctly: **fix the census reset first, then re-run V1–V3 unchanged.**
Until that lands, V3's `= 2` band is unreachable by *any* fingerprint, so re-running now would
fail identically and prove nothing.

**The consequence that reaches furthest is the one nobody was looking for.** A cache that
refreshes on an eighth of all frames is paying a real steady-state bill, not a latent one, and
every saving ever quoted for it assumed a near-zero refresh rate on a static camera. §19's
figures are struck accordingly. **A performance number inherits every assumption of the run that
produced it, and "nothing changed, so nothing refreshed" is an assumption, not an observation.**

---

## 32. A source comment became a premise, generated a prereg, and was false

`PREREG-rimstarve` existed because of one sentence in `ToonMaterial.js`: that on `temple` and
`interior` *"the screen-space rim's depth-ratio gate is shut as well and nothing is left to
carry it."* The seal registered **S ≥ 0.16 on either shot as outright refutation**. Measured
headless against ray-cast geometry along the taps the shader actually samples, `temple` reads
**0.418** and `interior` **0.441** — refuted by 8×, with 94–96% of the subject's rim band open
and 81–89% *fully* open. The gate was never shut. `rimSubjExempt` not reaching Gate A — the
prereg's load-bearing structural finding — is true and load-bearing on nothing.

The comment has been corrected in source, which is where a false premise has to be killed: a
prose sentence in a shipped file is not a note, it is a **premise that the next reader will
build on**, and this one spawned an entire sealed investigation. It also explains an old null
that had been filed as a puzzle — if a gate costs the character 0–6% everywhere but `night`,
then a ±0.4 L result from toggling it is the arithmetic answer, not an anomaly.

Three discipline points from the same run, all of which made the refutation trustworthy:

- **The instrument was proved on a constructed known before any scene number was read**: with
  the level removed every tap is sky, so S must be exactly `FAR/z0 − 1`; it returned 313.5,
  implying z0 = 12.72 m against an independently frozen 12.54–12.94.
- **A wrong mask was caught and discarded rather than used.** Hiding the character to build a
  subject mask also removes his cast shadow, producing a 16%-of-frame "silhouette" for a 193 px
  figure. The replacement was overlay-verified against cap, ear, tail rings and legs.
- **A known gap in the instrument was checked for its direction, not just noted.** `Terrain`
  cannot build headless, so it is missing from the depth set — which biases the gate *open*,
  i.e. toward the refutation. A gap that pushes toward your own conclusion has to be declared
  as such; here it means the refutation cannot have been manufactured by it, and that a future
  PASS on this instrument would need re-reading.

**And a correction to that report, made by checking rather than accepting.** It stated that
`shots/rim1/`'s analysis "was never carried into §8, which still lists all six as unverified".
§8 does not: that bullet was struck and closed with its numbers at `7b0e3f8`. The report was
right that rim1's *retention* column is stale — it predates `rimSkinExempt: 1.0` and describes
a tree that no longer exists — but wrong that the ledger had missed the work. Agent reports get
the same freshness check as everything else (§27.4), including reports that are otherwise
excellent, and including when the claim is that *I* have been sloppy.

---

## 33. A band can partition the outcome line and still discriminate nothing

§26.1 says registered bands must partition — every value the instrument can emit must land in
exactly one band. The fingerprint null control satisfied that rule completely and was still
incapable of returning information, and the distinction is worth having explicitly.

With the census reset in place, the arithmetic **floor** on V3's statistic over its 100-frame
window was 26 (12 censuses × 2 cascades + 2 from the restore). The registered bands were
`= 2` PASS / `3–8` MARGINAL / `≥ 9` FAIL. So *every emittable value* fell in FAIL — for a
correct fingerprint, an incorrect one, or none at all. The band partitioned the line correctly
and returned the correct verdict on the run it scored; what it could not do was **tell those
three cases apart.**

**Partitioning is necessary and not sufficient. A band also has to be reachable from both
sides**, which means checking the statistic's floor and ceiling *in the system as it actually
is* before sealing thresholds against it. The cheap check: ask what the metric reads when the
change under test is absent, and confirm that value can land in more than one band. If it
cannot, the control is decorative — it will fire identically whatever you do, and its FAIL
carries no information about the thing it was built to watch.

This is also the precise sense in which reverting was right rather than merely disciplined.
"The band is untestable, so ignore it" and "the band is untestable, so the verdict stands until
it is testable" both describe the same situation; only the second one keeps the seal worth
anything. The remedy ran, the change came out, and the follow-up is ordered so the control
becomes discriminating *before* it is asked to judge again — the fix moves the floor to 2,
which makes `= 2` reachable for the first time.

**Three practices from the same seal, each closing a hole nobody had named:**

- **An argument is not a test.** The census fix rests on a claim — that the reset was never the
  detector, because the per-frame fingerprint already loops the caster set, so an appearing or
  vanishing member moves the signature on the next frame regardless. That argument is sound, and
  *nothing in the existing V1–V3 suite exercises it*: all three mutate geometry or quiescence,
  none changes membership. A new leg was added that adds and removes a caster, because a fix
  whose own risk surface is untested by its own verification is a fix resting on prose.
- **A percentage must name its denominator in the same sentence.** The struck cache-saving
  figures (§19) travelled unchallenged for hours partly because the denominator was never
  restated after the first quote — so each re-quote inherited an assumption nobody could see. The
  new derivation is required to carry it inline, every time.
- **Register what a *lucky* result would mean, before it happens.** The re-derived saving may
  land near the old struck figure. That was pre-registered as **luck, not vindication**: an
  unmeasured input that happens to sit near the truth is not evidence about the input. Without
  writing that down first, a coincidence arriving after the fact is nearly impossible to argue
  down.

---

## 34. A mislabelled column travelled into two shipped shader comments, the ledger, and a seal

`tools/texlab.mjs:170` emits `aoP: [1, 5, 50].map(...)` — **p1, p5, p50**. Every consumer read
it as **p5/p50/p95**. The consequences, in order of how much they cost:

- **The premise of the whole AO line evaporates.** The argument was "the texture authors a
  0.412 median AO and the frame renders 0.992, so the occlusion is being lost". 0.412 is the
  **5th percentile**; re-measured, `hieroglyph_gilded` is p1 0.247 · p5 0.416 · p25 0.722 ·
  **p50 0.992** · mean 0.865. The authored median *is* 0.992. **The two numbers in that sentence
  were the same statistic wearing different labels**, and the gap between them — the entire
  observation — was a naming error.
- **The "in frame" AO median had no instrument.** Nothing in the repo, records or scratchpad
  reads an AO channel back out of a rendered frame; the only 0.992 anywhere is `aoP[2]`. A
  number was compared against itself and the comparison was reported as a measurement (§11's
  family: a precise sentence about something never measured).
- **It reached shipped source.** Both `ToonMaterial.js` and `toon.glsl.js` carried the wrong
  percentiles and the wrong conclusion in comments justifying a live uniform — §32's shape, now
  twice, and both are corrected in place rather than in a note somewhere else.
- **A seal inherited it.** `PREREG-aokey`'s sizing table is displaced two percentile steps
  (its "p50" row is the behaviour of the 5th percentile), over-predicting roughly **5×**; and
  its in-frame anchor came from an **albedo-debug capture, not a graded frame** — on the real
  frame the same population spans **3.879**, not 1.34:1, so its registered falsifier ("fails if
  span does not reach 1.45") **is already passed by the shipped baseline and cannot fire.**
  §33's shape a second time, arrived at from a completely different direction.

**The rule: a percentile triple must carry its percentiles at every hop.** `[0.247, 0.412,
0.992]` is not data, it is data plus a convention held in someone's head, and conventions do not
survive being pasted. Emit labelled keys or label them at the call site — and when a tool's
output is quoted in a comment, quote the tool's own field name with it.

### What survives, and the routing it forces

`ao` genuinely does not multiply the direct key term. That is a real shader fact and was never
the part in doubt. But the frozen before-measurement now says where it can act: **the ORM metal
mask covers only 14.2% of `hieroglyph_gilded`** (the rest is limestone), that metal is authored
*darker and warmer* than its stone — correct cel-metal doctrine, not a defect — and in `hero`
that mass is **98.6% shadowed at median L 43.6**, reading cool blue-grey.

So **every key-side lever this project has tried on gold — spec (§25), bloom gain, bloom onset
(§28), AO-on-key — operates on the same 1.4% of pixels.** That is why they keep measuring
inert, void or partial: they are all aimed at the lit fraction of a surface that is almost
entirely in shadow. The reach on the other 98.6% is **shadow-side** (`metalEnv`, shadow tint and
wash on metal), or it is a **framing** decision — the census says `interior`'s `gold_leaf` is
53.7% above the terminator and `courtyard`'s gilded 10.0%, against `hero`'s 1.4%. §7.3's
"gold reads as metal" condition has been getting judged on the one canonical shot where the gold
is in shadow.

---

## 35. The cane renders in a different place in two boots of the same tree

Found while differencing the pupil calibration pair, and it is the one result from that pair
that reaches past the character.

`cap7` and `cap8` are the same shot (`sly-startle`) on trees that differ by **four pupil lines
in `Clips.js` and nothing else** — the `src/render` diff between them is comment-only, checked
rather than assumed after a shading confound was hypothesised and refuted. `sampleCane(hurt,
hold)` returns **`[85.94, 20.11, −0.03]` in both trees.** And the cane still renders in a
visibly different position: two diagonals in the A/B difference map, a lit shaft across the
torso in one frame and not the other.

So **something outside the clip data moves the cane between boots.** This is §28's family — a
comparison contaminated by state nobody registered — but it is a genuinely different animal:
§28 was the *world clock advancing within* a boot, and pinning `dt` fixes it. This is
divergence *across* boots, where both frames are the first thing rendered after their own
staging, and `step(n, 0)` has nothing to say about it.

**What it costs immediately:** `cap8` is not a clean minuend for anything involving pose or the
cane. The pupil and catchlight results survive untouched because they depend on eye-window
pixels, which the difference map shows unaffected — but the tail-cone re-shoot that was going
to ride along in the same capture **was correctly not scored**, because a lobe count on a
contour would inherit exactly this nondeterminism.

**What it may cost retroactively is larger and is not yet known.** Every cross-boot comparison
this project has made — and most of them are cross-boot, because a capture is a boot — assumes
that identical source plus identical shot yields an identical frame. That assumption is now
false for at least one prop in at least one pose. Nobody should re-quote a cross-boot geometry
delta until the mechanism is found and either fixed or bounded.

**The shape to look for**, since the clip sample is identical: state that survives or varies
across staging rather than being derived from it — an `aimBone`/IK solve seeded from a previous
frame, a spring or damper with no reset, a `setShot` ordering where the cane's constraint runs
before or after the pose depending on what happened earlier, or physics settling a variable
number of ticks. The falsifier is cheap and should come first: **boot the same shot twice in
one process, and boot it twice in two processes, and difference the cane region.** If one-process
repeats are identical and two-process repeats are not, it is initialisation; if both differ, it
is a settle that never converged.

### 35.1 The falsifier ran and returned a third outcome — and found a different bug on the way

Both legs came back **identical**: two fresh builds in one process, three separate processes
(fingerprint-diffed), 1 vs 14 vs 60 vs 240 frames, 0 vs 100 vs 377 pre-freeze warm frames, and
dt 1/60 vs 1/30 vs 1/120 at equal elapsed time — **0.000 mm on cane tip, hook, grip and hand in
every leg.** The rule above enumerated two outcomes and the world produced a third, which is
worth recording as a habit: *a falsifier that partitions its own expectations can still be
surprised, and "neither branch" is data, not a broken test.* The cane divergence is **not** in
the player module's frozen path, and `settle()` does clear the integrators it owns.

**What the same probe did find is a bug nobody was looking for: the tail never reached
equilibrium in any capture.** `tailSag` is a constant force the spring had to fall into over
~240 frames, while `Debug.setShot` freezes and then steps 14 + 3. Measured drift: **19.8 mm
(1→14 frames), 21.7 mm (14→60), 0.217 mm (60→240)**, plus 6.3 mm of dt-sensitivity. So **every
character capture this project has ever taken rendered the tail ~22 mm short of its rest
position** — including every frame the tail-tip and tail-cone seals were scored on, and
including `critic5`. Fixed by seeding `tailLayer` at the spring's steady state (solving
`(_v2 − p)·stiff = sag` at `v = 0`) rather than at the authored tip: after, **0.000 mm across
every frame count and every dt**, with the tip settling 19.7 mm down into where it always
should have been.

**The cane divergence is bounded rather than explained, and the honest limit is stated.** A
magnitude probe says only two candidates reach the observed size — "the freeze never took"
(50–78 cm) or "the rig never bound" (110 cm) — while every mechanism in force during a *correct*
capture moves the cane 0.000 mm. Both candidates are staging/registration races in `Debug.js`,
and **both were completely silent**. The probe's own skipped suffix is declared per §11: no
browser, no renderer, no `setShot` staging, no `teleport()`, no collision under foot IK, no
module ordering — so a null there does not clear the project, and the two-boot cane-region
differencing still owes a real capture.

Two changes followed, both narrow: `freezePose()` now resets the one damped integrator that
does not live on the rig (behaviour-neutral while frozen — it removes a trap rather than moving
a frame), and `update()` warns once into `engine.warnings`, and therefore into `report.json`,
when a freeze is active but the rig never bound. **That converts a silent 1.10 m error into a
line in the manifest**, which is the pattern worth generalising: when a race has no symptom
except a wrong picture, the fix is to give it a symptom.

### 35.2 Frame observations from a stale capture are stale observations

The same report described `sly-closeup` as showing "eyes blown to large near-white glowing
discs that dominate the face" — which, taken at face value, would mean the eye-hierarchy line
had regressed. It has not: those frames are `cap2`, whose tree is `b96409c`, and the per-channel
`scleraTint` fix (`efb2e79`) landed the following morning. The observation is true about a build
that stopped existing sixteen hours earlier. Its author correctly labelled `cap2` as a pre-fix
baseline in one paragraph and then read frames from it in another without re-attaching the
caveat — which is exactly how §18 and §27.4 keep happening, and why the caveat belongs on the
*observation*, not on the capture that produced it.

---

## 36. Critic pass 5: REJECT at 2.88/10, and the finding is that we optimised the wrong layer

Full record: `progress/records/RESULT-critic5.md`. Thirteen shots, blind — the critic was given
no change list, no owner's belief about what was closed, and no hint about any contested
question. Best frame `temple` 4.5, worst `sly-profile` 1.5, mean **2.88**, median 2.5. **All
thirteen lose their blind side-by-side**, and the closing sentence is the one that matters:
*"the mandate is not 'better than before' but 'utterly wowed compared with the actual Sly
Cooper, Mario and Zelda games', and against that question, thirteen times out of thirteen, a
player picks the other frame."*

**It ruled the run valid on its own investigation rather than on my summary**, which is what a
provenance clause is for. Four `src/` files really did change inside the capture window; the
critic established they could not have reached the page by checking that all 17 `import(`
occurrences in `src/` are JSDoc annotations — no runtime dynamic import exists, so the static
module graph was fully fetched before `ready`. It then killed the one apparent contamination
signal (a `programs` 94→136 step a minute after a file was written) with a **null control**: the
same +42 step lands on `dunes` in a clean-tree run, at a different wall-clock offset and a
different shot index. The step is bound to the shot, not the clock. And the 404 appears in 24 of
24 historical reports.

### What it costs us to have been measuring what we were measuring

The three findings that dominate — character model, palette, grounding — **are not things any
seal in this project was watching.** Months of this ledger are gate coefficients, rim retention,
bloom onsets, percentile labels and phase pinning; the critic's top item is that *the mask is
unreliable across poses, the tail reads as hard plates with gaps, and the fur cards float clear
of the silhouette.* Its second is that **86.7% of chromatic pixels sit in two 40° hue windows**
(with controls proving the scale reaches 0.222 and 1.000), i.e. the frames read as a grade
smeared over grey geometry because hue variety was never authored into albedo. Its third is that
**there is no contact shadow at all** — floor 3 px under the boot reads L 72.0 against control
columns at 75.3 and 73.3.

None of those needed a pinned clock or a partitioned band to find. They needed someone to look
at the picture and compare it to the target. **A measurement apparatus can be rigorous, honest,
self-correcting — and pointed at the wrong layer.** Everything in §§17–35 is *true*; almost none
of it was load-bearing for the thing the project is actually judged on. The corrective is not
less rigour, it is choosing the object of rigour by asking first "if this were perfect, would the
frame win its side-by-side?"

### The critic's own misses, recorded because they are evidence

It listed six, three of which were its own 1× impressions destroyed by its own instruments:
"the character doesn't separate from the background" (refuted — Michelson 0.25–0.41 against
nulls of 0.01–0.03), "the combat character is flat" (refuted — spread 111 against `sly-key`'s
110), and "the courtyard sky has no large-scale structure" (refuted — R64 0.727 against controls
of 0.015 and 0.916). A fourth, on the guard cone's texture, had a **within-group null of 9.96×
against a between-group ratio of 0.14×** — it discriminates nothing (§33), so that finding
stands only as a described read at 2×, explicitly not as a measurement. Its ROIs were box-drawn
and eye-checked at magnification first, which caught two `night` patches sitting on the platform
rather than on the character (§27.2's lesson, applied by someone who had read it).

**A critic that publishes its own refuted impressions is worth more than one that does not**,
because it tells you which of its surviving claims were tested and which were merely felt.

---

## 37. The fur cards were net negative, and every instrument we had was structurally blind to it

The critic listed five character faults. **Four of them have one cause**, and it was found by a
hold-out rather than by a measurement: rendering the same model with every fur-card family
suppressed makes it read *immediately* as Sly Cooper — cap, mask band, cream muzzle, blue shirt,
clean banded tail. With the cards on, it is a shredded mottled mass.

### Why months of tuning could not find it

**Every clump instrument in this project scores a row by how much outer contour it breaks** —
that is, it measures each clump against the alternative of *not existing*. None of them can see
what a clump does when it is **not** on the contour, and for any single camera most clumps in a
ring are not on the contour. So the rows were optimised for the one view in which each clump is
an edge, and shipped into the frame where it is a blemish.

That is §36's lesson in mechanical form, and it is worth stating as a rule: **an instrument that
scores a feature against its own absence cannot tell you whether the feature is worth having.**
It answers "does this clump break the silhouette here", never "does the population of clumps
improve the picture". The second question needed a hold-out — build it without the feature and
look — which costs one render and no instrumentation at all.

The tail told the same story from the other side. The T40 verdict passed on the interior read
and on looking at the image, while **components, holes and solidity barely moved** (1/0/0.774 →
1/0/0.723): the inverted-hull ink shell welds the old shards into a single blob at 40 px, so the
shape metrics were *structurally unable* to see the defect they were pointed at. A metric that
cannot resolve the failure mode returns a healthy number for a broken object, and it will do so
consistently, which is what makes it dangerous.

### Two instruments caught being non-discriminating on real input after passing synthetic controls

- `contourRough` normalises by per-column extent, which **divides the defect away on a diagonal
  tail**: it read 0.079 on a visibly shredded tail against a 0.735 sawtooth control.
- The first `ringProfile` averaged along screen columns, which smears rings on a diagonal — it
  would have scored a **perfect** tail as a failure.

Both passed their synthetic knowns. Synthetic controls prove an instrument *can* respond; only
real input proves it responds *to this*. Both are now PCA-aligned, and the broken one is left in
the source **labelled NON-DISCRIMINATING rather than deleted**, so the next reader learns the
trap instead of rediscovering it.

### What it cost, and the trade taken deliberately

Triangles **16,094 → 13,148 (−18.3%)**, verts 9,914 → 7,958 — the fix is a net budget saving,
which is the shape of result you get when a feature was subtracting value. Fur at close range is
now sparser, and that is a **deliberate trade against §7.3's "fur must not read as smooth
plastic"**: a smooth silhouette that reads as Sly beats a furry one that reads as a shredded
mass. It is recorded here so the next critic's call on it is a decision being revisited, not a
regression being discovered.

### Two honest residuals

`sly-startle`'s mask still fails its band (0.08 → 0.10) because that pose's eye is
proportionally larger than the bind-pose ring anticipates — the fix is to derive the ring radius
from the *posed* sclera. And the character tool's projection is **mirrored relative to the
shipped frame**, inherited from `silmerge`'s phi derivation — harmless for before/after
comparisons, invalid for any "his left arm" claim, and **`silmerge`'s own left/right part
attributions are therefore suspect** for anyone relying on them.

---

## 38. The palette is two colours in the *albedo*, and the biggest cause is not in the albedo

Three findings from the texture side of critic finding #2, each of which changes where the work
has to happen.

### 38.1 It is worse in the material than in the frame

Rebuilt CPU-side with the critic's own statistic — same chroma gate, same two-40°-windows, and
its controls return **0.222 and 1.000** against the critic's 0.223/1.000, so the reading is
faithful — **nine of ten architecture recipes score 1.000 on their built albedo**, and
`hieroglyph_wall` puts **94.9% of its chromatic texels in a single 20–30° bin**. The *frames*
measured less concentrated (0.69–0.95) than the materials underneath them. The grade was being
blamed for a concentration that the materials already had.

### 38.2 Wear was implemented as opacity when it needed to be coverage

Eleven of twenty signs in the wall's pool are authored blue, green or turquoise, and **0.54% of
its texels came out cool.** Two mechanisms, both measured:

- `paintRemnants` bleaches pigment toward stone **before it is laid down**, so Egyptian blue
  arrives at **chroma 8 — exactly on the critic's chroma gate**, i.e. authored as colour and
  delivered as something the statistic cannot see as colour.
- the consumer recipe then multiplies by a saturated warm in linear, **attenuating blue 3.7×
  harder than red**. Full-strength malachite survives it (display hue 95°); a 60:40
  malachite-stone mix does not (43° — back in the warm bin).

**Fading a pigment toward its substrate destroys the hue; removing the pigment in patches keeps
it.** Worn paint is not paint at lower alpha, it is paint in fewer places. Cool share went
0.54% → 8.22% (wall) and 0.86% → 6.41% (column) by changing that one idea, with the coverage
knob that caused the old "flat decal" failure left untouched.

### 38.3 Identity variety is not shape variety

§13's pool fix spread the distribution over *sign identities* and left the distribution over
*silhouettes* untouched: nine of the ten flat signs are a horizontal bar, arc or oval at ~3:1,
and the layout draws flats in three of five slots. **A field can be uniform over names and
uniform over outlines at the same time, and the eye reads outlines** — which is precisely the
critic's "rows of identical rounded rectangles". The fix selected seven new signs by exactly one
criterion — *does the outline survive a box filter to 10 px as something other than a bar* — and
deduplicated the pools by silhouette rather than by name. Commonest sign 17.9% → 10.3%.

### 38.4 And the part that is not the texture owner's, registered before the capture

`huelab`'s **shaded column reads 1.000 on all ten framings**: under the committed chain every
§2.2 pigment collapses to 152–244° in shadow, so **authored hue cannot arrive on a shaded
surface at all**. That is the same wall §34 hit on gold from the other direction — gold was being
judged on the one shot where it is 98.6% shadowed — and it means finding #2 is **not closable
from `src/textures/**`**. Three causes, ranked: the stone family is 60–100% of every framing and
§2.2 gives it one hue; the consumer's material colour is a saturated warm and lives in
ARCHITECTURE's file; and the shadow regime belongs to SHADING/LIGHTING.

**The practice worth copying: the prereg states, before any pixel exists, that the whole-frame
number is expected to move little, and why.** Three of the shots are 83–98% stone and cannot
move on decoration alone. That converts a small result from something to explain away into
something predicted — and it is the difference between a finding and a spin, decided in advance.

---

## 39. Every prop placed through a Bag was stacked at the world origin, silently, for the whole project

`Bag.transform` forwarded a `Matrix4` into `place()`, whose signature is a **destructure**. A
`Matrix4` has none of the destructured field names, so every field came back `undefined`, every
default applied, the transform resolved to identity, and **nothing threw**. All 13 call sites in
`Props.js` passed `matrixOf(...)`, so **every prop placed through a Bag rendered at (0,0,0)**:
both colossi, the sixteen-sphinx avenue, the Anubis pair, the gilded Ra, the sarcophagus lid,
the offering table, the scaffold, the stelae and the masts. Props bounding box after the fix:
z **[−13.4, 31.4] → [−75.6, 84.7]**, y **[−0.4, 11.1] → [−12.0, 13.3]**.

**This is the single largest defect found in the project, and it was invisible to every
instrument we own.** A destructure of an object with the wrong shape is the quietest failure in
JavaScript: no exception, no warning, no NaN, no missing property access — just defaults, which
are by construction *plausible*. `Statues.js` passed options objects and was always correct, so
the same helper worked perfectly on half its callers.

**It explains four of the critic's §3.11 "placeholder and broken assets" at once:** the missing
subject in `courtyard`, the missing avenue in `dunes`, `interior`'s "placeholder rectangle"
(the gilded Ra belongs in front of it, and a pixel probe now finds Ra there at 15.3 m), and —
strongly though not conclusively — `sly-profile`'s "cream faceted polyhedron", since the
origin-stacked colossus projects to **2.8% of that frame against the critic's measured ~2.7%**,
and the pre-fix build put ~19,200 cream-limestone vertices on that screen that the post-fix
build does not.

**The lesson is about the shape of the failure, not the bug.** Ask what a wrong argument
*produces*: a destructure that misses produces defaults, and defaults were chosen to be
reasonable, so the wrong result looks like a deliberate one. Where a helper accepts a
structurally-typed argument, either accept both forms explicitly (as the fix does) or fail
loudly on an unrecognised one. **A silent default is a lie told in a plausible voice.**

Two smaller findings of the same family, both from the same sweep: a **sign error** in the
corner-roll transform put the entry pylon's torus moulding **0.97 m inside the wall at its foot
and 4.08 m clear of it in open air at its head** — those were the critic's "ten purposeless
untextured poles in `dunes`", never props at all but a moulding standing off its own building.
And the papyrus abacus was authored **0.256 m narrower than the bell it caps**, so the capital
occluded it — which is the critic's "no abacus" on a part drawn in every frame.

### 39.1 A comment describing a fixed bug, read as current behaviour, cost a capture

The same agent stood down a queued capture after 8.5 minutes because it believed
`lock.mjs` "steals at 20 min on elapsed time regardless of whether the holder is alive", and it
did not want to hijack a live run. **That behaviour does not exist.** `lock.mjs` evicts on
liveness only — `const stale = !alive(held.pid)` — and carries an explicit banner saying
*"Deliberately no age-based staleness anywhere in this file"*, because an age cutoff was tried
twice and was a bug both times. What the file *does* contain is a comment recording the old
bug's symptom: *"one run was observed losing the lock at 33.7 minutes mid-render."*

So a historical note, accurate and worth keeping, was read in the present tense — the mirror of
§32, where a comment stated something false. **A comment that describes a bug must say it is
fixed, in the same sentence, in the tense the reader will assume.** The cost here was one
capture and a wasted queue slot; the citizenship was exemplary and the premise was wrong, which
is the combination worth guarding against.

---

## 40. A clamp made two arms the same state, and only the applied-state readback knew

The grounding A/B ran four arms to test whether the shadow's normal-offset bias displaces the
contact away from the boot. Its seal required each arm to **read back the value the shader
actually received**, not the value requested. That requirement is the only reason the following
is known rather than assumed:

`normalBiasClamp = [0.012, 1.4]` floors the treated arms. `0.0105 × 0.5 = 0.00525` and
`0.0105 × 0.1 = 0.00105` **both clamp to 0.012**, so on cascade 0 — the cascade the contact
shadow actually lives in — `lowbias` and `minbias` are *the same state*, and the near-zero
extreme never ran. The frames confirm it independently: those two arms differ by 563 px, **every
one of them in c1/c2 where the clamp did bite, and 0 px under the boot.**

**So the seal's own "a null at minbias makes this decisive" leg is VOID**, and its author said so
rather than banking the null. What was actually tested is 11.23 cm → 5.87 cm of displacement
(≈15 px); the untested remainder is ≈8.7 px. **Rule: a parameter sweep must read back the
applied value per arm.** A clamp, a quantisation, a texel-size floor or a driver minimum can
silently collapse two arms into one, and the resulting null looks exactly like a decisive null —
same numbers, same shape, no warning.

### The instrument was sampling where the phenomenon cannot be

Band 1 came back **FLAT and then some**: ΔL 0.00 at every distance, and the under-boot box
**pixel-identical at 754/754** both between arms and against the critic's own frame. That is not
a dead knob — the same toggle moved **18,299 px (1.99% of frame)** on mid-ground floor and kerb
boundaries. It moved nothing under the boot.

The geometry says why, and it reaches back to the finding itself: the sun direction
(−0.927, 0.358, −0.109) sits at **20.97°**, throwing roughly **4.7 m of shadow nearly sideways in
screen space**, while the probe samples **straight down** from the sole. *That column contains no
cast shadow in any arm* — so a cast-shadow lever could never have shown up in it, at any bias.

This is worth separating carefully, because it is easy to over-read. It does **not** overturn the
critic's finding: there genuinely is no contact darkening under the character, and that is what
the probe measured correctly. What it establishes is that **cast shadow was never a candidate
mechanism at this sun angle** — the darkening has to come from a contact term, because the
geometry puts the shadow somewhere else entirely. The critic's #3 is unchanged, its ownership
does not move, and the AO knobs stay dead (+0.6 L at ceiling, §3 of the AO work).

### Two more disciplines held under pressure

**The acne band FAILED as sealed and was not reinterpreted.** Its author diagnosed the failure as
its own specification — an area threshold applied to an ROI defined as *"a sunlit floor band with
one shadow boundary"*, where a 4× crop shows coherent boundary movement (the kerb shadow
reattaching toward its caster, the knob working as intended) rather than speckle — and still
recorded FAIL, noting only that boundary ROIs should be scored on the component split alone.
Moot for shipping either way, since a FLAT contact band means there was no win to bank.

**And `base` vs `back` came back byte-identical**, which retires a live worry: the toggle path is
exact and §35's cross-boot nondeterminism did not touch this run.

---

## 41. The shadow's hue is owned by the albedo, not by any light term — and it explains two findings at once

> **CORRECTED 2026-08-02, by its own author, before the prediction below was tested. The
> mechanism survives; every number in it was computed from constants that had already shipped
> away.** This section used `shadowBounceMix 0.20` with no `shadowTeal`; the live values are
> **0.05 and 0.15**, and re-read from source the shadow light is G/R **3.258, not 1.336** —
> matching the pair §18 independently recorded. Consequences, all inverting:
> - break-even albedo G/R is **0.307**, not 0.749;
> - **the entire stone family passes** (1.73–2.31). *"Stone cannot survive shade" was the stale
>   light, not the stone;*
> - product hue for shaded sandstone is **176–181°, not 18°** — which reconciles with the 214°
>   TEXTURES measured, and dissolves the anomaly it routed rather than leaving it open.
>
> **The prediction this section was proudest of is dead, and the way it died is the lesson.** It
> claimed the violet is daylight-only and that `night` had always been on the correct side. On
> the live light **day passes too**, so the day/night split the prediction was made of does not
> exist. Its author's own words: *"Had I run night first as instructed, it would have come back
> `G ≥ R` and I'd have reported it as confirming a mechanism it does not test."* The
> pre-registered `bounceMix 0.20 → 0.00` arm **must not be run as written**.
>
> This is §18 recurring inside a section that cites §18 — a model validated against constants
> that had moved. The habit that caught it was re-reading the constants **from source** when a
> downstream agent produced a number the model could not predict, instead of treating that number
> as the anomaly. **When a measurement contradicts your model, re-derive the model's inputs before
> you doubt the measurement.**
>
> What survives, and it is not small: the *structure* — a shaded pixel is `light × albedo`, 88.4%
> of shadow radiance arrives multiplied by the albedo, and the controlling quantity is their
> product rather than any single term. What also survives is §38.4's measurement (a shaded column
> reads 1.000 on the two-window statistic across all ten framings) — but note carefully that the
> product test governs **channel order**, not **hue variety**. Everything being cool *and similar*
> still concentrates into two windows. The two facts are compatible and were briefly conflated
> here.
>
> Net effect on the shipped state: its distance from the re-derived acceptance band is now
> **unmeasured**, not the 37–45° this section implied — those frame numbers predate the shipped
> teal/bounceMix change. The next step is therefore **one provenance-stamped daylight capture
> scored for hue separation, not a fix A/B**; if it lands in band, the correct action is to close
> the line rather than to improve it.

The violet-shadow line has been chased through `shadowTeal`, `shadowBounceMix`, `fillSkyMix`,
the split-tone and the wash. The decomposition says none of them is the owner:

| term | luma share | G/R | multiplied by albedo |
|---|---|---|---|
| fill | 31.1% | 0.787 | yes |
| shadow multiply | 57.3% | 0.808 | yes |
| wash | 11.6% | **1.336** | **no** |

`shadowLight` itself is **G/R 1.336** — correctly `G ≥ R`, exactly as §2.2 asks. Sandstone albedo
is **G/R 0.483** (0.605 after `shadowSat`). So **88.4% of shadow radiance arrives carrying the
albedo's channel order rather than the light's**, and every cool constant on the shading side
being `G ≥ R` is beside the point. The wash is the only term that delivers the intended hue and
it is 11.6% of the energy.

The controlling quantity is a product, not a term: **`(albedo G/R in shadow) × (light G/R) ≥ 1`**.
Day **0.808** (fails by 19%), interior 0.837 (fails), night **1.003** (passes by 0.3%).

**That yields a falsifiable prediction with no capture at all: the violet is daylight-only, and
`night` has always been on the correct side of it** — from the same two constants. Night is the
first thing to re-measure, and if it comes back violet the mechanism is wrong.

### It is the same fact as §38.4, seen from the other side

TEXTURES measured that a shaded column reads 1.000 on the two-window hue statistic across all ten
framings — authored hue cannot arrive on a shaded surface. This says why: in shadow the albedo's
channel order dominates the product, so **whatever the light is doing, the surface decides the
hue** — and the stone family is one hue, which is §38.1's 1.000. Two agents, two instruments, two
directions, one mechanism. Neither could have closed it alone, and the pair is much stronger than
either: TEXTURES fixed what it owned and predicted its own number would barely move; SHADING then
found the reason it could not have moved.

### The acceptance line was derived for the wrong object and is not reachable

The ledger's **≤226°** target came from *light* constants and has been applied to *surfaces* —
the category error §8 already records once. Measured: no cell of the full two-dimensional lever
sweep reaches 226 on all three materials, and the single cell that reaches it on one requires
`shadowSat −1.00`, i.e. a grey albedo in shadow, which deletes §2.2's readable-shadow
requirement outright. Every path toward 226 doubles shadow chroma — §3's recorded failure mode,
verbatim. The additive wash is the only lever that buys hue at constant saturation, and it
asymptotes at exactly 240° while costing shadow density (L 0.331 → 0.550).

**Ruling: the target is re-derived, not relaxed — and the distinction has to be honoured in the
derivation.** A criterion that cannot be met is not automatically wrong; what makes this one
wrong is that it was computed for a different object. So the replacement must come from §2.2's
*surface* intent, derived independently, and must not be set to whatever `night` happens to
achieve. "Night already reaches it" is evidence a target is attainable, never evidence it is
correct.

Also corrected in passing: §8's "tuning behind a clamp" is true of shadow **magnitude** and false
of shadow **hue** — `tintPeak` pins the magnitude, while `bounceMix` still moves G/R from 1.336 to
2.147.

---

## 42. The mask never varied per pose; the statistic's ray origin was outside every population it measured

I twice told CHARACTER to implement a named fix — derive the mask ring radius from the *posed*
sclera rather than the bind-pose constant — to close a band that read 0.08 → 0.10 on
`sly-startle`. **It refused, proved the failure was in the instrument, and it was right. The fix
would have changed geometry to chase a number that cannot see geometry.**

`maskRead` walks its measurement band outward from **one centroid taken over the whole eye
population**. With two eyes visible, that centroid lands on the **muzzle bridge — between them**.
From the tool's own stored data, no new rendering:

| shot | eye components | aggregate | per-eye |
|---|---|---|---|
| `sly-profile` | 1 (178 px) | 0.46 | **0.46 — identical** |
| `sly-closeup` | 2 (877 / 234) | 0.74 | 0.78 / 0.46 (dominant eye ⇒ accidentally right) |
| `sly-startle` | 2 (4622 / 3518) | **0.10** | **0.73 / 0.28 — below both** |
| `hero` | 0 ≥ 20 px (23 px total) | 1.48 | computed from 23 pixels |

**The tell is arithmetic and it is decisive: a median cannot fall below every sub-population it is
drawn from unless the ray origin is outside them all.** And the artefact appears *only* where the
two eyes project at comparable size — the one near-face-on framing — which is exactly why a
single shot looked broken while the others looked fine. A one-shot failure in a five-shot test
invites a pose-specific explanation, and that is the trap.

The proposed mechanism was absent too, checkably: `hurt` scales the **pupil** bone, while the
sclera is weighted `[['head', 1]]` — so the posed sclera *is* the bind-pose sclera and the ring
still matches it by construction. What actually inflates the metric is the pupil constricting and
**uncovering sclera**, which grows the denominator.

**What survives is real, smaller, and the opposite of the original claim.** Per eye, the near eye
reads **0.73–0.78 across all three poses — the mask does not vary per pose at all** — while the
oblique eye reads 0.28–0.46, tracking head yaw on a ring that is symmetric by construction. That
is a view consequence, not a defect, and the critic's fault #1 item ("the mask cannot be allowed
to vary per pose") is answered rather than fixed.

**The coordinator error worth recording, because it is mine and it repeated.** I endorsed the
named fix twice, in consecutive messages, each time reasoning from the *number* rather than from
what could produce it — and the second endorsement came after §40 had already taught this session
that a null can be an artefact of the apparatus. An owner refusing a coordinator's instruction
with a two-sided proof is the system working; the instruction should not have needed refusing.
**Before endorsing a fix for a metric, ask what the metric would read if the defect did not
exist.** Here it would still have read 0.10.

~~Two smaller things from the same read, both worth keeping. **The muzzle overshot**: the beak is
gone and there is now *zero* forward projection — the muzzle sits entirely inside the cranium arc,
because two levers both landed. It was registered as the next A/B rather than nudged.~~

**THE MUZZLE CLAIM IS RETRACTED — it does not survive measurement, and the reason is this
section's own lesson applied one part further over.** Measured on built geometry with every vertex
carrying the method that emitted it, the snout and nose stand **+0.0947 m proud of the skull's own
profile contour — 27.5% of head height.** The instrument was checked against pathological input
per §43: skull-against-itself reads **0.00000**, and a +0.10 m push moves the peak by exactly
+0.10.

The original "zero forward projection" reading came from **the same confound this section already
caught, one part over**. A row-wise front-extent profile of the head is owned by the **cap bill**
(z 0.2909) and the **ear** (+0.1092), never by the nose (z 0.2143) — so a projecting snout reads
as flush. And here is the part worth the retraction: §42 **discarded the ear-confounded metric and
then kept the conclusion that metric had produced.** Throwing out an instrument does not throw out
what it told you. **When an instrument is disqualified, every claim that rests on it is
disqualified with it, including the ones that felt independently obvious** — otherwise the number
is retracted and the belief survives, which is worse than never measuring, because the belief now
looks like it was arrived at some other way.

Its author's first replacement was also wrong, in the flattering direction — binning cranium
vertices by height and taking a max, where the ring stack is coarse enough that inter-ring bins
caught only rear vertices and reported the skull's front at z −0.099, manufacturing a large fake
bulge. It was replaced with an upper hull **before anything was quoted**.

So the muzzle A/B is **not booked**. The only real geometric item is the bill's 0.077 m overhang,
and trimming that trades §7.3's cap-silhouette condition (§11 records the cap going 24.9% → 48.0%)
against the muzzle read — not a blind change either.

Finally, the §37 fur trade now has its price measured rather than argued: tail ink **2.52 → 1.44
runs/row (−43%)**, torso **2.16 → 1.67 (−23%)** — and **the arms still fail the ink gate
outright**, unchanged from before the redirect. Limb ink is still not tonally separable from limb
dark fur, which is §7.3's "smooth plastic" signature, and it is now the character's largest open
item.

---

## 43. The clearance test scored a camera standing inside a wall as perfectly clear

I eliminated three `courtyard` camera candidates by measurement and concluded the courtyard was
enclosed with no distance to buy — and recorded that conclusion in the source as reconnaissance
for whoever tried next. **Two of the three were not compositions that failed. They were cameras
standing in the west pylon.**

The box raycaster clamps `t0` at 0 and returns `Infinity` when the ray origin is **inside** a box,
so an embedded camera reports *no hit* — indistinguishable from open air, and in fact scoring
better than a camera merely close to something. Re-audited with a real clearance gate:

| candidate | clearance to nearest surface |
|---|---|
| shipped `(-19, 5.6, 30)` | 1.00 m (west entry pylon) |
| back along the view axis | 1.35 m |
| back in z `(-19, 5.6, 36)` | **0.00 m — inside the pylon** |
| up and back `(-20, 11.5, 34)` | **0.50 m — effectively inside it** |

With clearance ≥ 2 m actually enforced, **8,232 candidates pass.** The distance was always
available; it is bought by moving *along the approach axis*, not by backing into the enclosure.
The recommended camera clears by 7.5 m and puts both colossi complete in frame — crown, face,
knee and base — with the obelisk centred behind and the sphinx avenue leading in.

**This is the third instrument in this session that returned a healthy number for the worst
possible state**, and the family is now clear enough to name: §39's destructure produced
*defaults* for a wrong-shaped argument, §42's median measured from a ray origin outside every
population it sampled, and this returns *no obstruction* for total obstruction. In each case the
failure mode maps onto the "everything is fine" output rather than onto an error, which is
precisely why none of them was caught by looking at results.

**The check: ask what your instrument returns for the pathological input, and confirm it differs
from what it returns for the ideal one.** Here, "camera in open air" and "camera inside masonry"
both returned `Infinity`. That test takes one line and would have saved three eliminated
candidates and a false conclusion committed into the source.

`Shots.js` already recorded two instances of exactly this defect — `temple` framed from 0.78 m
inside a nave column for its whole life, and `guard` standing on a plinth deck with the subject
two metres below the lens. The file warns about it in its own header. **The warning was there and
the tool used to check it could not see the condition it warned about.**

---

## 44. A cycle whose period does not divide the tile, introduced by the fix for the critic's finding

Two independent instances in one recipe, both created while fixing critic finding #9, and both
found by arithmetic rather than by looking:

- **Cartouche alternation.** `cols = round(0.76 × 10.4 / 0.72) = 11` — **odd**, so `c % 2` does
  not survive the wrap: column 10 and column 0 of the next repeat carry the same state, and the
  alternation the eye is following **doubles exactly at the seam**, once per repeat.
- **Kheker frieze.** The four-pigment cycle drew `round(10.4 / 0.72) = 14` finials per tile.
  14 mod 4 = 2, so the colour rhythm breaks at every seam. Measured on the built strip: frieze
  autocorrelation **r@71 px = 0.366** at a period that does not divide the tile.

**The second one is the instructive one: the previous two-pigment version closed cleanly, because
14 is even. Going from two pigments to four — the change made to answer the critic — is what
introduced the defect.** Fixed by rounding the column count to the nearest *even* value and the
finial count to the nearest multiple of 4; after, r@62 = 0.705 and r@124 = 0.690 with r@71 down to
0.114, i.e. the cycle closes at the tile.

**Rule: whenever a repeating decoration carries a cycle, the cycle length must divide the tile
count, and changing either one re-opens the question.** This is §13's beacon logic one level down —
§13 is about a landmark making repeats *countable*; this is about a rhythm making the seam
*visible* — and neither the pitch argument that was registered nor any seam metric could see it,
because the pitch was right and the parity was not.

**A second trap avoided in the same fix, worth as much as the fix.** The obvious repair was to
round the column count *down* to 10. Measured by census, 10 columns pushes the rarest-and-largest
sign to **3.86× median area** against 2.24× before and **2.31×** at 12 — because a wider column
lets the layout pick a bigger quadrat. **The seam fix was about to be paid for out of §13's beacon
budget, and no seam metric would ever have shown it.** Rounding up costs nothing and was chosen on
that measurement rather than on the arithmetic being tidier.

### The registered band failed while the thing it tested succeeded

P1 read FAIL on all four framings, and its registered meaning — "the albedo change did not survive
to the frame" — is **falsified by measurement in the same read**. On temple's left column the
malachite band moved hue **300° → 194°** and gained **+83% chroma at unchanged luma**, while the
bare shaft 3 cm below it moved 284° → 214° and *lost* chroma. The decoration moved 106° against the
stone's 70° and got more saturated while the frame got less.

P1 could not see it for two reasons, both fixable only at registration time: it gates on
`luma > 140` while the decoration is in **shade**, and its absolute window was transcribed from a
chain before the tree moved **70–80° cool** (whole-frame hue p50 264° → 212°). **A band written
against absolute values expires when anything upstream shifts the distribution** — and the honest
handling here was to report FAIL as registered, then present the falsifier for its interpretation
separately, which is what happened.

The replacement statistic was registered **mid-capture, before two of the four frames existed**,
and is linear (`G − (R+B)/2`) precisely so it cannot wrap like a hue angle — a first draft using
median hue was discarded before registration when it returned 255° separations between a 28° and a
284° population. Its author's written expectation was then **wrong in both directions** (it
predicted interior would fail and courtyard would pass cleanly; the reverse happened), and it
published that rather than quietly re-reading.

**And a whole-frame statistic was retired with its reason:** critic-style M11 moved ±0.02–0.08 in
*both* directions across these trees, because the downstream cool shift concentrates one framing
into a single hue bin and raises a two-window concentration score regardless of albedo. **Whole-frame
M11 cannot score a texture change across trees that differ in grade.**

---

## 45. The shadow-hue line closes — measured, not fixed — and the closing cost no capture at all

Scored on frames that already existed (`shots/tx8`, stamp `671dd39` dirty:false), against the band
re-derived from §2.2's surface intent:

| shot | lit stone | shaded stone | Δh | from exact complement | verdict |
|---|---|---|---|---|---|
| `courtyard` (daylight) | 17.9° | 217.2° | 160.7 | 19.3° | **PASS** |
| `traversal` (daylight) | 33.2° | 230.8° | 162.4 | 17.6° | **PASS** |
| `temple` (shaft-lit) | 33.1° | 211.4° | 178.3 | **1.7°** | **PASS** |
| `interior` (torch-lit) | 24.5° | 226.7° | 157.7 | 22.3° | **PASS** |

All four also land inside the absolute band [177°, 237°], all with `G ≥ R`. **So there is nothing
to fix: the pre-registered lever arms are moot, and `night` never needed re-measuring — it was a
regression guard for a fix that is not happening.** §41's "shipped fails by 37–45°" is retired as
stale, exactly as its own correction predicted.

**The whole closure cost zero capture time.** The frames existed; the question was whether the
constants that matter had moved since, which is a `git log` question answered in two minutes.
`ToonMaterial.js`, `toon.glsl.js` and `Lighting.js` are unchanged across the interval; the only
post-chain change ships at strength 0. The one plausible confound — a texture commit landing in
between — was checked and dismissed structurally: it is entirely inside `glyphWall()`, so it
cannot reach bare stone, and every ROI is bare stone verified in its crop. **Before queueing an
hour of exclusive lock, ask whether the frame you need already exists on a tree where the inputs
you care about are unchanged.**

### The band's stated form had an unreachable half

The target was written `Δh ∈ [150°, 210°]`. **A circular separation cannot exceed 180°**, so the
upper half of that interval could never be entered by any measurement — §33's reachability rule,
in a form nobody had thought to check because the arithmetic looks innocuous. The operative
statement is `|180 − Δh| ≤ 30°`. It changes no verdict here, and it changes how every verdict
*reads*: 178.3° is **1.7° from dead centre**, where the old wording invites "near the top of the
band". Corrected at its declaration site.

### Three ROIs rejected, and the closest call passed its own guard

All three failures were §11's shape — a well-behaved statistic about the wrong surface — and
**every one was caught by looking at the crop, never by the number**. The instructive one read a
clean 28.4° at concentration 0.993 and was **the torch flame and its bloom halo**, not stone. Its
author had *just added* a guard for exactly this class, and the guard passed it. A statistic
cannot tell you it is describing the wrong object; only the picture can.

Two instrument bugs found in the same pass, both the author's own and both specific to circular
quantities: a **linear** median of a circular value put a plainly orange surface at "p50 313°" by
straddling 0°/360°, and a circular **mean** over a bimodal region landed between the modes
describing nothing (351.8° against a median of 31.1°). Both fixed, with every reported region now
gated at mean resultant length ≥ 0.964.

---

## 46. Two instruments checked against their own pathological input — one passed, one was worthless

§43 left a standing check: **ask what your instrument returns for the pathological input and
confirm it differs from what it returns for the ideal one.** Both halves of it showed up in the
same read, one hour later.

**Applied, and it worked.** The sphinx avenue was re-planted on the terrain height, and "planted on
`heightAt`" does not mean "not buried" when a ridge rises across a 5.0 × 2.4 m footprint. So the
predicate sampled the whole footprint of all sixteen bags: **0/16 have sand above the plinth top
anywhere**, crown clearance 2.80–3.51 m, base heights climbing 1.23 → 18.45 m across z 40 → 77.8
and cresting with the ridge. **Then the control: the identical predicate run against the shipped-away
bug (all bags at y = 0) returns 15/16 submerged.** The instrument distinguishes the two states, so
the pass means something. One detail kept rather than smoothed: the z = 52.6 pair clears by 0.00 and
−0.01 m — level with the sand, not buried, but zero margin.

**Not applied, and it was worthless.** A detector written to find the critic's "cream faceted
polyhedron" scored the **before** frame at **0.03%** — it called clean a frame that visibly contains
a 2.7% object — because its author guessed a saturation threshold of `< 0.30` and the lump measures
**0.42–0.48**. It was caught only by opening the before-frame instead of trusting the number, and
then recalibrated *on the object itself*: largest warm blob 7,849 px before → 1,723 px after, and
the survivor is a different object elsewhere in frame. The polyhedron is gone — confirmed by direct
A/B at identical camera settings, `#bd935e`–`#d2a975` → `#354458`–`#394659` on the same pixels.

**The pattern across both: a guessed threshold is a hypothesis about the data, and it needs the
same control as any other hypothesis.** The working predicate was validated against the state it
was meant to detect; the failing one was validated against nothing and returned the comfortable
answer.

### Three more, all of them the same discipline

- **A hypothesis killed before it was reported.** The suspicion that god-rays were washing the cel
  ramp flat was measured and is false — the in-shaft band swings **39.0 L** against the out-of-shaft
  band's **13.0 L**. It appears here only because it was tested.
- **A frame declared unable to settle its own question.** `hero` shows **4.5 m of a 12.45 m
  obelisk shaft, and the fattest part**, so a 9% taper is diluted by an ink shell measured 6–13 px
  outside the projected silhouette. The author's own first read off a 2× crop was "parallel-sided",
  which the projection then corrected. **Saying which frame cannot answer a question is worth more
  than an answer from the wrong frame.**
- **A defect found and deliberately not chased**: a ~6 cm flange at the obelisk base, invisible
  because it sits on a 5 × 5 m plinth top. Recorded so nobody re-derives it.

And one number corrected at its source: the obelisk's mid-shaft width is **2.044 m**, not the
2.00 m its comment claims — 2.2% off, in a comment written to record a fix.

---

## 47. The arms don't read as plastic because ink is missing — they read as plastic because nothing can resolve there

An ink treatment for the limbs was authored, measured, and **withdrawn by its author on the
measurement**, which is the outcome worth recording rather than the fix.

The diagnosis behind it was sound and still is: the arm's value ladder runs `cloth` 0.45 →
`fur` 0.54 → `clothDark` 0.28 and **stops**, where the tail continues to `tailDark` 0.19 and
`ink` 0.07. There is no near-black anywhere on an arm. So ink lines were authored — welts at the
sleeve hem and glove cuff, an ulnar seam along the forearm, deliberately *lines* rather than
clumps, since §37 removed clumps for good reason.

Then it was measured:
- **93 px changed** on `sly-closeup`, 90 on `sly-profile`, 117 on `hero` — about **0.1% of frame**,
  the same order as a cap-notch change §11 records as *removed rather than shipped*;
- at 6× the seam is a **1 px black hairline**; at 8× in profile it renders **detached from the arm,
  floating in background** — a placement bug on top of being invisible;
- cost **432 triangles (+3.3%)**.

Withdrawn, with the working tree hash verified back to its starting value.

**The finding is why it failed.** The bare-fur band is **15.3 cm of a 55 cm arm, seen ~26 px wide
across 18–33 rows.** Interior detail there is below the resolution at which *anything* can read —
which is also why the earlier baseline reported the arms UNMEASURABLE by its instrument on these
frames. **The lever is silhouette-scale — sleeve, glove and forearm proportions — not interior
ink.** A treatment that cannot be resolved is not a weak fix; it is a fix aimed at a feature the
frame does not have room for, and adding triangles to it makes the budget worse for nothing.

This generalises past the arms: **before authoring interior detail, compute how many pixels the
region occupies in the shots that score it.** Two of this project's three character wins —
the tail's merged mass and the cap's brim — were silhouette-scale. Every interior-detail attempt
on a small region has now failed the same way twice.

### And a provenance discipline that caught its own author

The determinism pair was nearly confounded by its owner editing source **ten seconds after
launching the second boot** — the exact hazard I had flagged, arriving from the inside rather
than the outside. It was caught because the runner stamps the source hash around the run, so the
mismatch was visible immediately; the boot was killed and relaunched from a `git archive` copy in
scratchpad, with `cwd` and hash verified to match the first boot's stamp.

**The provenance discipline has to point at your own edits, not only at other people's.** An
instrument built to protect a run from concurrent agents caught the agent that built it.

---

## 48. Three results from one offline pass: a defect that was a control, an arithmetic that divided by nothing, and a falsifier pre-registered to fail

No capture, no source change. All three came from frames that already existed plus the shader
expressions read out of source.

### 48.1 The sphinx avenue is not a defect — it is the control §41 never had

Routed as "a cream albedo rendering green-dominant, a channel order the albedo does not contain".
Modelled through the chain, both pixels reproduce: sphinx `#3b6068` h 190.7 against a measured
196.5 (**5.8°**), shadowed sand `#2d3e54` h 213.8 against 216.4 (**2.6°**). **The ordering is
predicted rather than anomalous**: cream limestone's albedo G/R is 0.623 against sandstone's
0.234, so §41's product lands at 2.342 against 1.181 and the sphinx *must* sit ~20° cooler —
modelled 23.1°, measured 19.9°.

And it is the missing control. **A near-neutral albedo is exactly where the light dominates the
product**, so the avenue shows the shadow light's own channel order more purely than any stone in
the game — the case §41's mechanism most needed and never had. It passes §45's band against every
lit-stone value ever measured here, worst |180 − Δh| = 16.7 against a tolerance of 30.

Its author's own "reads as teal blocks" impression was then **killed by its own control**: sphinx
chroma is **37–48 against lit sand's 123 and shaded sand's 62** — *less* chromatic than everything
around it. Two of four control ROIs were also thrown out for measuring the wrong surface (a
"shaded" pylon face that was lit; a sand box straddling a shadow boundary), caught by drawing the
boxes onto the frame. What survives is **form, not shading**: the statues read as stacked boxes,
which is a geometry line.

### 48.2 An arithmetic that attributed a swing to a term contributing exactly zero

The cel-ramp handoff was "13 L of total swing across a full cylinder gives a three-band quantiser
~4 L per step, below what reads — so diffuse **range** is missing." The shader says otherwise:
`key = ramp * sh`, so **outside the light shaft `sh → 0` and the quantiser contributes exactly
0 L.** That is arithmetic on the expression, not a model's opinion. The 13 L is entirely an
additive non-quantised term, and dividing it into three band steps describes a term that put none
of it there.

Where the ramp *is* spent, the model reconciles: in-shaft **36.6 L modelled against 39.0 L
measured** (6%), with band steps of **26.2 L and 10.4 L** — not 4. **So the missing quantity is
key light, not diffuse range, and no ramp tuning can reach a term multiplied by zero.**

**Before tuning a term, confirm it is active in the region you measured.** The measurement was
correct and carefully done; only the attribution was wrong, and no amount of re-measuring the same
region would have exposed it — reading the expression did.

Kept honest at the other end too: the surface fresnel rim is a candidate for the residual 13 L,
and its author explicitly declined to claim it, because that model overshot at 32 L with the
silhouette gate assumed open.

### 48.3 A falsifier pre-registered to fail under a correct diagnosis

The cane renders near-black in a shipped frame. Quantified:

- `SlyModel.js:3331` binarises `metal: spec.metal ? 1 : 0`, so the cane runs at **uMetal 1.0** and
  loses **80%** of its diffuse — **§8's oft-quoted 68% is the world's 0.85 value and is simply
  wrong for the cane.** A number correct in one place, quoted in another where it does not apply.
- `spec *= sh` means specular is **exactly zero in shade**, so the metal's designed highlight path
  cannot fire on a shaft in shadow at all.
- **The symptom is a hue gradient, not a brightness one**: shaft centre h 160.0°, silhouette
  h 40.0°, against authored gold 45.1°, with a luminance rim-to-shaft ratio of only **1.51×**.
  Anyone testing this on brightness would measure a weak effect and conclude the diagnosis was
  wrong.

Then the part worth the section: **the proposed one-line fix was modelled and predicted to be
insufficient — before it runs.** Raising the diffuse multiply 0.20 → 0.55 moves shaft luminance
×2.37 but leaves hue at **129.2°, still not gold**, and it does *not* leave the rim alone
(×1.91), so the falsifier's second half fails **even when the diagnosis is correct**. Recording
that in advance is what stops a correct diagnosis being thrown away by its own test — the mirror
of §33's pre-registered luck clause, and rarer.

---

## §49 — a zero is not one state: two opposite mechanisms produced identical nulls, and my hypothesis was falsified by the data I handed over with it

FX's `sprobe` (`shots/sprobe/sprobe.json`, 6 shots, boot-only, no capture cost) answers the `S`
re-statement. Three things came out of it and the least expected one is the most reusable.

### 49.1 The statistic was misread first, by its own author, and self-corrected

`S_runtime_cached` is a **per-cascade redraw bill** — each caster counted once per cached cascade
its bounds intersect — not a count of casters. FX's first reconciliation summed unique casters and
landed at **half** the reported value on every shot. Summing per-cascade reproduces all six `S`,
all six `S_pre39` and all six `D_runtime_all` **exactly**, and the 52/56-row tables reconcile to
**100.0%**. The rows are therefore complete for this population and can name individual movers;
the ~280 other tracked casters intersect no cascade at all.

A halving that appears on *every* shot is the signature of a units error, not of noise. It is worth
more than a correct first answer, because it proves the reconciliation was actually attempted.

### 49.2 My hypothesis was wrong, and the check that killed it was in the data I sent with it

I proposed that §39's identity-matrix defect only reaches shots with transformed prop bags in the
caster set — temple and guard move, bare framings do not — and explicitly flagged it as mine and
not to be accepted on my say-so. **It is false**, on two independent counts:

- **All six shots carry an identical prop population**: 7 prop rows, 55,466 triangles, *including
  both movers*, in every shot including the three that null. Presence is not the discriminator.
- **Only 2 of 7 bags ever move** — `props_cloth` (480 t) and `props_wood` (1,422 t). The other five
  are **96.6% of all prop triangles** and are identical under `real` and `origin` in all six shots.
  A property of Bag-transform placement *as such* would move the big ones too.

The real discriminator is **displacement measured against the bag's own bounding radius**, then
per-camera coverage: cloth 3.06 and wood 1.97 move; dark 0.46, bronze 0.39, lime 0.12, gold 0.09,
stone 0.08 do not. The proof case is `props_dark` — displaced comparably to `props_wood` and never
moving, because its 53.5 m radius swallows both endpoints. Absolute displacement predicts nothing;
displacement *relative to extent* predicts everything.

### 49.3 The finding: the three zeros have two opposite causes

`courtyard` and `night` null because both endpoints sit inside **all three** cascades — the caster
is counted either way. `interior` nulls because **neither** endpoint sits in any cascade — the
sealed tomb's cascades never reach the courtyard props.

> **A zero in `courtyard` means "always counted". A zero in `interior` means "never counted".**

Identical in the column, opposite in the world, and no amount of re-reading the zeros distinguishes
them. This is the sharp form of a hazard §30 only gestured at: pooling does not merely dilute a
signal, it can **merge two contradictory states into one symbol**. Any instrument that treats "no
delta" as a single outcome is lossy at exactly the point where it looks cleanest, and a null-rate
computed over such a column is meaningless — it is counting two different things.

### 49.4 The re-statement declines to produce the number it was asked for

| shot | S/D | §39 delta (% of S) |
|---|---|---|
| hero | 69.6% | −0.06% |
| courtyard | 75.3% | 0 |
| temple | 66.9% | −0.40% |
| night | 66.7% | 0 |
| interior | 71.1% (56 rows) | 0 |
| guard | 66.5% | −0.23% |

Per-shot spread is **66.5–75.3%**, an 8.8 pp range — **an order of magnitude wider than the §39
effect it corrects** (max 0.40%). Pooled figures exist (69.1% all six, 68.9% excluding interior)
and FX declines to headline either: interior is a genuinely different population (56 rows, `S` at
63% of the others, cascades that exclude the courtyard props), so a pooled denominator changes
meaning between framings, and the pooled figure would read as "interior drags it down", which is
precisely the false inference. The earlier **81.1% architecture-only headless** figure is
**superseded, not contradicted** — different population, one camera, no props — and must not be
quoted alongside these.

Refusing to emit a single project-wide number, when a single number was what was asked for, is the
correct answer here: it would misstate an individual shot by up to ~6 pp to correct an effect
of 0.40%.

---

## §50 — the fourth instrument blind to its own pathological input: a triangle-count audit cannot see a chamfer

GEOMETRY froze `src/world/*` at `d542055` so that `geo3` would boot a named commit rather than a
live edit (the hazard: `tools/shot.mjs` calls `acquire()` at line 129 and `gitDesc()` at line 172,
so **a queued run stamps and loads its modules when it ACQUIRES the lock, not when it was queued** —
`SANDS_NO_HMR=1` stops a mid-run reload destroying the execution context, it does **not** pin the
module text read at the initial `goto`). With the freeze, `PropKit.js` is verifiably **163
insertions, 0 deletions**, one new export (`loft`), so nothing outside `Statues.js` can move. Good
provenance, correctly argued.

It then reported the change's cost, thoroughly and correctly:

> +2,240 triangles level-wide (sphinx 1024 → 1164, ×16 instances) … **The nemes, lappet, head-core
> and plinth-cap changes cost exactly zero triangles**; they are chamfer/round parameter changes on
> geometry that was already `chamferBox`.

Every number there is right. And that last sentence is precisely why the audit could not see what
it had done: **a count-based instrument is structurally blind to a change that costs no
primitives.** Widening a chamfer moves the silhouette and re-aims the normals — it is a shading and
outline change of exactly the kind this project is graded on — and it emits a delta of zero.

The concrete miss: `nemes()` (`Statues.js:76`) is a **shared helper**, and the diff modifies it
(crown terrace `round 0.05w → 0.13w`, `c 0.055w → 0.10w`; lappet gaining `round 0.07w`, `c 0.05w →
0.09w`). Four builders call it —

| caller | line | `w` | placement |
|---|---|---|---|
| `seatedColossus` | 210 | **2.4** | x = ±9.5, **z = 25** |
| `sphinx` | 281 | 1.02 | avenue, z 40–84 |
| `coffinLid` | 456 | 0.70 L | vault (interior) |
| `fallenHead` | 492 | 1.65 | x −8.6, z 71.5 |

— so the edit reaches **four statue kinds across three framings**, and the two 13 m colossi stand
directly in the new `courtyard` camera's forward cone (`pos [-2.5, 4.0, 41.5]` → `target
[1.5, 6.4, 16.0]`, straight down −z through z = 25). On that basis GEOMETRY's two conclusions both
invert: there **is** statue change in geo3's frames, and there **is** evidence about the statue work
in this run.

**This is the fourth member of a family the ledger should now name explicitly.** §39 (`Bag.transform`
forwarding a `Matrix4` into a destructuring signature → all defaults, identity, no throw), §40
(`normalBiasClamp` flooring both arms to one value), §43 (`hit()` returning `Infinity` — "perfectly
clear" — for a camera *inside* masonry), and now §50. Every one returned a **healthy number for the
worst possible state**, and in every case the defect was invisible to the instrument by
construction rather than by accident. The standing check — *ask what the instrument returns for the
pathological input and confirm it differs from the ideal* — would have caught all four, and did
catch none of them at the time.

### 50.1 The correction cuts both ways, and the second half is the useful half

GEOMETRY wrote "there is also no evidence about the statue work in this run." The opposite is true,
and in its favour: `geo3`'s `courtyard` frame gives a **free read of the nemes work on the two
largest statues in the game, at w 2.4 against the sphinx's 1.02** — more than twice the scale, so
the widened arris subtends more pixels there than it ever will on the avenue. No `dunes` capture is
needed to find out whether the crown terraces stopped reading as plateaux; this run answers it
better than the shot it was authored for.

What `dunes` is still genuinely needed for is the **`loft` body** — the continuous rump-to-chest
curve replacing three stacked `chunkAt` slabs, whose whole point is a normal turning through a
quarter-circle so the cel ramp can put a terminator on the back. That is sphinx-only and appears in
none of geo3's three framings.

### 50.2 The author's own restatement, which is less kind than mine and more accurate

Recorded here at the declaration site, in GEOMETRY's words, because the project's rule is that a
correction lives where the claim lives (§34, §41) — and because this one is better than the version
I wrote:

> It is true that a triangle count is blind to a chamfer widening. But I did not merely use a blind
> instrument: I wrote "the nemes, lappet, head-core and plinth-cap changes cost exactly zero
> triangles" and then reasoned *from that zero* to "no evidence about the statue work in this run".
> **I read a null from an instrument as a null in the world.** That is the same error as §49's "a
> zero is not one state", one commit earlier in this very log, and I made it anyway. The instrument
> being blind is the mechanism; the fault is that I did not ask what the zero was made of. The cheap
> guard, had I applied it, was one grep for callers of `nemes()` — the helper is four lines from the
> code I edited.

Two things follow that my framing had lost. The blindness is the *mechanism*, not the *fault* — an
instrument is entitled to be blind, and the discipline is on the person reading it. And the guard
was not expensive: it was a single grep, four lines from the edit. A lesson whose remedy costs one
command is not a lesson about difficulty.

GEOMETRY then re-measured the frustum rather than accepting my arithmetic, and got a stronger
result than my estimate: **660/660 crown vertices inside on both colossi**, at 23.9° and 18.9°
off-axis against a 42.8° horizontal half-angle — where I had guessed ~28°/32°. The quantity under
test subtends **5.4 → 9.8 px at 19.5 m against 1.3 → 2.4 px on the avenue sphinx**, so courtyard is
not a consolation view of the nemes change, it is the **decisive** one: if the widened arris cannot
be seen there it will never be seen on a sphinx. Bands are sealed in
`progress/records/PREREG-nemes-colossi.md` before the frame exists, including N4 — an explicit
falsifier registering "melted rather than carved" as a **loss**, which is the failure mode a chamfer
widening actually has and the one most easily absorbed as "smoother is better".

The freeze itself paid for something neither of us anticipated. geo3 acquired the lock at 21:12:36
from a clean tree; **SHADING wrote to `src/render/shaders/toon.glsl.js` at 21:15:53** — 3 m 17 s
later. A shader reaching every pixel missed the boot window by three minutes, and had it not, the
report would have recorded only `dirty: true`.

The lesson is not "GEOMETRY was careless" — the accounting was careful and its every number
survives. It is that **a cost audit and a change audit are different instruments, and a triangle
count is only the first.** When the deliverable is a silhouette, the count is close to the least
informative thing that can be measured about it.


---

## §51 — the replacement measured worse than what it replaced, and the reason was that a box is not flat

GEOMETRY's statue-form work, delivered against §48.1's routed finding. Three results, and the one
worth the section is a failure it caught on itself.

### 51.1 A ruled flank turns through exactly zero degrees; a chamfered box does not

The sphinx body was three stacked `chunkAt` slabs with a hard arris across the back at the waist and
again at the shoulder. Replacing them with a single lofted mass is obviously the better structure —
and **the first loft measured worse than the boxes it replaced**: swept-normal area over the figure
fell **82.1% → 72.1%**.

> **SECOND CORRECTION — the mechanism below is measurably INVERTED, and the headline pair is not
> reproducible. See §56.** Measured with the chamfer bevels excluded, a `chunkAt` slab face
> interior turns **0.00°** with jitter off (0.46° shipped, and that is jitter, not pillowing),
> while the shipped loft flank turns **6.66°**. The "~7° pillowing" is an artefact of a 45°
> selection cone dragging the bevels into the face-interior population — the same slab then
> reports 13.98°. And **"swept-normal area" is not a statistic anything in the project computes**:
> `form.mjs` reports `top6/top12/top24`, no definition of the named quantity is written down, and
> every reconstruction comes out the **opposite sign** to the pair below. The 82.1 / 72.1 headline
> and `PropKit.js:393` are both **unverified** until whoever produced them states the statistic.
> **My error as much as anyone's: I recorded a headline number without ever asking what it
> measured.** `belly` is retained on evidence (+7.6 points body-only, +1.79° of flank turn), not on
> the story that was attached to it.

> **CORRECTION, added by GEOMETRY at the declaration site while sealing `PREREG-loft-dunes.md`:
> the 82.1% / 72.1% pair above is for the FLAT-FLANK loft — the version *before* `belly` existed.
> No measurement of the shipped `belly` loft exists anywhere in the record.** The claim that
> `belly` repays the deficit rests on a construction argument in a source comment ("the normal
> leaves the base tilted ~9° outward-and-down and arrives at the spring line horizontal"), which
> is the *specified* behaviour, not the measured one. That is §18's, §50's and §51.4's failure
> exactly — and it was caught by its own author one section after reopening someone else's item
> for the same reason. The gap is closed by clause **L1**, which needs no lock and is registered
> to run *before* the capture: if it fails, the `dunes` lock is to be spent on something else.

The reason is exact and generalises well beyond statues. `chamferBox` **pillows its face interiors
by about 7°**, so a "flat" box face is not flat and contributes real normal variation. A ruled
flank on a loft turns through **precisely zero**. Swapping boxes for a straight-sided loft therefore
*removes* curvature that nobody had noticed was there, because it was hiding inside a primitive
whose name says "box". The `belly` parameter exists solely because of this, and the shipped sections
carry it.

> **A primitive's name describes its topology, not its shading behaviour.** The thing being replaced
> was contributing a quantity that no one had attributed to it.

This was caught by measuring the replacement against the original, not by looking at the silhouette
— where the loft is plainly better and always was. An instrument that had only ever scored the loft
against *nothing* would have reported a large win, which is §37's hold-out lesson arriving in a new
place.

### 51.2 An offline cel rasteriser, and what it found about the old sphinx

`scratchpad/celraster.mjs` renders built geometry through the shader's **own band edges (0.52 /
0.14)** in about a second, with no WebGL and **without taking the capture lock**. That let every
iteration be looked at rather than reasoned about.

Its first output settles what the critic actually saw: the old sphinx was **one flat tone across the
entire animal — no terminator anywhere on it.** "Reads as stacked boxes" was not a figure of speech
and not a shading-tint problem; the geometry presented the band system with nothing to quantise.
After the loft, a curved terminator sweeps the haunch and flank. Cost: **+2,240 triangles
level-wide, 0.19% of budget**; the nemes/lappet/head/plinth changes cost zero.

### 51.3 §1 closes on all ten shots

| column | before (pass 2) | now |
|---|---|---|
| counted, like-for-like | 548 draws / 2.355 M | **265 draws / 1.747 M** (worst: night) |
| scored main-view (§1 ruling) | — | **93 draws / 0.668 M** (worst: night) |

**"Like-for-like" scopes the two cells in that row against each other — it does not extend to a
`report.json` from a later tree.** Concretely: `shots/geo3/report.json` reports `courtyard` at
**270 draws**, *above* the 265 this row calls the worst case. That is the camera move below, not a
regression and not an error in this table; the rows were measured on trees where `courtyard` was
still framed from `[-19, 5.6, 30] fov 50`.

Four shots measured directly, five bounded, combat measured-in-bands. Worst case is **37% of the
draw budget and 56% of the triangle budget**; architecture sits at 33 draws / 296 k. The specified
column trade was made as described — papyrus shafts **22 → 48 radial, 9 → 4 vertical**.

> **Reading a shipped `report.json` against this table — see §56.4.** `counted` here and
> `report.json.drawCalls` are the *same quantity* (both `renderer.info.render`, `autoReset =
> false`), so the two look directly comparable and are not. **`courtyard`'s camera moved and
> widened between the trees** — `[-19, 5.6, 30] fov 50` → `[-2.5, 4, 41.5] fov 55` (`8757fb6`,
> `9c5edf8`) — and a wider lens further back sees more of the level. That, not a regression,
> is the whole of the 255 → 270 draws and +53 k triangles anyone will find when they check.
> It also **exonerates the statue change independently of any camera argument**: the loft cost
> 2,240 triangles level-wide, and 2,240 cannot become 53,000 at any pass multiplier (the
> observed one is 3.1×). **§1 is scored on the main-view column, not on `counted`**, so the
> ruling above is unaffected either way. Recorded here rather than only in §56 because this
> table is where the comparison will actually be attempted.

### 51.4 A previously-closed item is reopened by its own author, and re-routed

GEOMETRY had reported the "no AO in crevices" defect closed. It corrects that: **it was closed on
the strength of a source comment.** `PREREG-kerb.md`'s calibrated instrument measures **1,704 px
still live on `hero`** at tree `f026ef3`, and `81b773f` — the stylobate-apron fix that was supposed
to have closed it — is verifiably an **ancestor** of that tree. So the apron fix landed and the
defect class did not close.

The margin analysis decides ownership rather than leaving it to preference: the rim lifts that band
by **~110 L** against a luma margin over threshold of **7.2 L**. A cause fifteen times larger than
the margin is the cause. **It is rim-caused, the registered lever is a shader uniform, and the owner
is SHADING**, with a geometry fallback available (chamfer edge-masking, already used once for the
night paving case).

Closing an item on a source comment is the same failure as §18's stale reference and §50's null:
reading what the code is specified to do, in place of measuring what it does.

---

## §52 — the check that pays, run before the capture instead of after

SHADING's turn produced four things. The first would have cost a lock; the last three are all cases
of an author catching their own instrument.

### 52.1 Three of `aokey`'s four sealed arms are one applied state

The §40 discipline — *read back applied state, never `tune`* — was applied **before** the run rather
than in the post-mortem, and it killed the run as sealed. Full detail and the working poke are in
`progress/records/ADDENDUM-aokey-arms-collapse.md`; the finding:

`uAoStrength` is per-material, computed once at `toon()` time (`ToonMaterial.js:805`) and frozen at
`:896`. **A grep for writers returns three hits: that line, the GLSL declaration, the GLSL use.
There is no writer.** `TUNE.bakedAO` is read at construction and never again, so `k1`, `k1b70` and
`k1b85` all apply **0.5500** and are the same arm. Only `k0` vs `k1` was ever real.

Worse than a no-op: `r3(o.ao)` sits in the option hash at `:837`, so any `toon()` *after* the poke
mints a **new** material (probe: `same instance returned? false`, new one at 0.8500) while every
mesh already in the scene keeps the old one — a half-applied state plus a silent duplicate program.
The A/B's own poke would have manufactured a §23 foreign change inside its own window, producing a
small, real, entirely spurious delta with a plausible story attached.

The sealed **falsifier** fails too, in §48.3's shape: `uAoKey` multiplies `alb * keyRad * key` and
`key = ramp * sh`, so where `sh = 0` the term is exactly zero at any `uAoKey` — and only **~1.4% of
`hero`'s gilded population is key-lit** by `ToonMaterial.js`'s own record. The falsifier scores a
population of which 98.6% cannot move, so it can fire against a correct diagnosis.

**This is the fifth instrument-blindness instance (§39, §40, §43, §50, §52.1) and the first caught
before it cost anything.** The difference was timing alone: the question was asked of a state that
did not exist yet.

### 52.2 The `ef` floor is sized, and it is the aimed lever

`ef` floor **0.25 → 0.60** takes shaft hue **160.0° → 45.0°** against an authored gold of 45.1°,
with L ×1.31, chroma 12 → 24, and rim:shaft falling 1.51× → 1.21×. It is *aimed*: metalEnv ×2.40 on
the shaft against ×1.09 on the rim, and at true grazing `ef = 1` for every floor — **exactly null
where the frame already works**, against §48.3's predicted ×1.91 rim disturbance from the naive
diffuse multiply. Acceptance window **0.45–0.60**; at 0.70+ the rim stops reading (ratio < 1.15).

The §12 neighbour holds: lit gilding moves L ×1.124 / ×1.062 / ×1.021 at key shares .70/.85/.95
with hue ≤ 0.6° — large where the defect is, small where the frame works — and it does not push hot
gilding into §25's AgX shoulder (at p 0.95 the pixel moves one count).

**Two brackets that SHADING broke and fixed on itself**, both of which would have produced confident
wrong numbers:

- Its first model **hand-rolled a display transform** instead of using the validated AgX + split-tone
  one, and put shaft hue at 98.8° against the validated 160.0°. Hue is the entire claim, so the
  control was load-bearing rather than ceremonial. Replaced verbatim; the control now reproduces
  `canegold.mjs` exactly.
- Its first §12 neighbour **re-solved the key magnitude per floor**, so the key grew with the thing
  being measured and returned an identical ×1.414 at *every* share — a collapsed bracket that looks
  like a clean invariant. Held fixed as the scene fixes it, the numbers separate.

Stated limits, not papered over: chroma 24 is still low against §48.1's scale (lit sand 123), so
this reads as **"not green" rather than "gleaming"**; `spec *= sh` remains exactly zero in shade and
is probably the larger lever for "reads as metal"; the model omits bloom, GTAO, ink shell and the
real reflection vector. **Verdict: sized, not shipped** — it is global to every metal and needs a
frame. `PREREG-cane1` already pre-committed "do not run `aokey` in the same arm as A1–A3", which is
exactly this situation.

### 52.3 An agent's context had silently lost 33 sections of the record

SHADING reports that its visible context began the turn with a `KNOWN_ISSUES.md` of **1120 lines,
§1–§15**, while the working tree holds **3542 lines through §48**. It noticed, **verified against
the file rather than reconstructing from messages**, and confirmed the claim it had been given by
reading `KNOWN_ISSUES.md:310` directly.

This is an operational hazard worth naming: **an agent's recollection of the ledger is not the
ledger.** A long-running agent can hold a stale snapshot and reason confidently from it, and nothing
in the transcript looks wrong. The remedy is the cheap one SHADING used — when a claim depends on
the record, open the record.

### 52.4 A comment-only edit broke the module

The 68% → 80% correction (§48.3) was applied at **both** declaration sites per §34 —
`toon.glsl.js:482` and `KNOWN_ISSUES.md §8:518`. The first version of the shader edit used backticks
inside the JS template literal and **terminated it**, breaking the module. It was caught because
SHADING checked rather than assuming a comment change was safe; now verified by module load,
block-comment depth 0, and `compilecheck.mjs` linking both skinned and static with `gl.getError 0`.

"It is only a comment" is a claim about intent. In a shader stored as a template literal it is not a
claim about syntax.

---

## §53 — §35 closes: the divergence does not reproduce, the counter was never a scene inventory, and the answer was in cap8's own stamp

CHARACTER's det1/det2 pair. It touched **no source files**; §4.7 verified intact (52 clips,
`missing: []`).

### 53.1 Root identity established by content, not by stamp

I had asked for a src hash. CHARACTER did better and declined the weaker instrument: **all 322
tracked files at det1's stamped commit `5ad3286` compared byte-for-byte against the pristine copy —
0 differ, 0 missing, no extra files that could shadow a module.** `node_modules` in the pristine
copy is a **symlink to `/home/user/Demo/node_modules`**, so it is literally the same dependency
tree. A `src/*.js`-shaped hash would have missed `index.html`, `vite.config.js` and `package.json`;
this misses nothing.

### 53.2 The verdict: seven pixels

| shot | px differing (of 921,600) | max channel Δ | where |
|---|---|---|---|
| `sly-startle` | **7 (0.0008%)** | 86 | one 3×3 blob at (65–67, 143–145), frame corner |
| `sly-profile` | 979 (0.106%) | 31 | top band y 0–249 only: sky/haze + one background edge |

`sly-startle` is **the shot §35 was observed on** (cap7/cap8). The cane and the entire character are
bit-identical across boots.

**A trap caught by its own author, and it is §42's exact shape.** `canediff.mjs`'s ROI was calibrated
on *`sly-profile`'s* framing; `sly-startle` is a face closeup where the gold hook sits at the bottom,
largely **outside** that ROI. So "cane ROI 0 px" on `sly-startle` is mostly measuring empty
background and proves nothing. What carries the claim is the **whole-frame** count of 7 — the hook
occupies thousands of pixels and not one differs. An ROI inherited across framings is an ROI that has
not been checked.

### 53.3 The §35.2 fix cannot be credited, and the arithmetic says so

An absent divergence was the ambiguous case I flagged. CHARACTER resolved it by **magnitude** rather
than by inference: §35.2's tail-seeding fix removed a **22 mm** drift, while §35.1's own probe says
only two candidates reach the observed size — "freeze never took" (50–78 cm) and "rig never bound"
(110 cm). 22 mm is **23–50× below the smaller**. *A fix that size cannot remove a defect that size.*

Both candidates are then **positively excluded**, not merely unobserved:

- **"Rig never bound"** — §35.1 shipped a warning into `engine.warnings` → `report.json` for exactly
  this. Both reports contain **only** the prewarm timing line. Excluded by the instrument built for
  it (contrast §49's lesson: this is a null read from an instrument proven able to fire).
- **"Freeze never took"** — a freeze failure renders a different pose, and the character pixels are
  bit-identical. Either it fired in neither or identically in both, and **a race that fires
  identically twice is not a race.**

### 53.4 What actually happened to cap7/cap8 was in cap8's own report all along

§35's premise was that the two trees "differ by four pupil lines in `Clips.js` and nothing else",
derived by diffing two **commits**. The stamps read:

- cap7: `6fc9e51`, `dirty: false`
- cap8: `338abec`, **`dirty: TRUE`**

Uncommitted edits were live at capture time, on a repo §10 records as having five agents editing
concurrently — and **a commit-to-commit diff cannot see them**. The "and nothing else" premise was
never established, and *the stamp contradicting it sat in the file for the whole investigation*.

CHARACTER labels "cap7 and cap8 did not render the same source" a **hypothesis rather than a proof**
— the uncommitted state is gone and cannot be recovered — while noting it is the only explanation
consistent with everything and rests on a recorded fact rather than on elimination. That is the right
epistemic weight and it is why this section closes §35 without overclaiming.

**Cross-boot noise floor, which is what §35 asked to be found or bounded:** with sources proven
identical, two boots agree to 7 px and 979 px, max ~10/255 per channel, **none of it on the
character**. Cross-boot geometry deltas on the character are usable again.

### 53.5 The +62 triangles are not a builder — and my instruction to hunt one was wrong

I told CHARACTER that identical draw calls meant "a count change inside an existing bag, localisable
by comparing per-bag triangle counts". **That was wrong, and acting on it would have burned cycles
searching `src/player` and `src/world` for a defect that is in neither.**

`report.json`'s `triangles` is `renderer.info.render.triangles` (`Engine.js:273`) with
`autoReset = false` — reset at frame start, read at frame end. It is a **per-frame, all-passes
submission counter**, not a scene inventory; §8 already documents the 4.5–5.4× pass multiplication.
It counts what was *submitted*, not what was *built*.

The arithmetic is exact: **62 ÷ 2 = 31.** Every instanced emitter in `src/fx/Particles.js` uses
`setIndex([0,1,2,0,2,3])` — a quad, 2 triangles per instance — so 62 triangles is **31 particle
instances**, a whole number, in a single pass. The only dynamic-count objects in the scene are FX's:
`geometry.instanceCount` is set from live particle counts at `Particles.js:1348, 1522, 1531, 1682,
1800`.

The pixels agree independently: every differing pixel in `sly-profile` is in the top band on
warm-brown and pale-blue values (`#795a48`, `#714b36`, `#7195a5` — haze and sky), additive-shaped,
none on the character, none gold, none on Sly's blue. **Airborne particulate, not structural
geometry.**

Candidate mechanism, stated as a hypothesis: the two boots' texture prewarm took **35.1 s vs
27.6 s** — a 7.5 s wall-clock difference during boot, from their own `bootWarnings`. §28 records that
the world clock advances during staging; an emitter advanced on wall clock during boot lands in a
different phase, and 31 particles is what that looks like. `sly-startle` matching exactly is
consistent — a face closeup at 179 draws with little sky. **So `sly-startle`'s zero is a control on
FX phase, not on a builder. Routed to FX.**

### 53.6 `perch_idle` was re-tasked three times from a number the record already marked stale

**My error, and the worst kind: a stale figure that survived three hops.** §9 carries a correction
dated 2026-08-02 — the "hips 0.000, chest 0.006, head −0.007" numbers describe a tree that stopped
existing at `5d0441e`. Re-measured on the live tree:

```
hips x +0.045  →  chest x +0.082  →  head x +0.046
```

**The line of action is present and landed** (+3.7 cm out on the lower segment, −3.6 cm back on the
upper). Acting on the stale figure would have authored a **second** lateral lean on top of the first
and doubled it — which is what §9's own text warns about.

The number's path was **record → session verdict → work order**, and it was stale at the first hop.
§18's stale-reference failure is usually described as an instrument validating against an old
baseline; this is the human-readable version, and it is more dangerous because each hop launders the
figure a little further from the correction attached to it. The remaining genuine item is verifying
the line **in pixels**, which is a different task from authoring it.

### 53.7 Arms: the geometry framing is confirmed, and a fourth ink pass is now definitively excluded

Measured at silhouette scale with membership decided by **skin weight** rather than proximity
(`scratchpad/armscale.mjs`), at `sly-closeup`'s 699 px figure:

- glove cuff → mitt: **59 px**
- bare forearm → glove cuff: **26 px**
- sleeve → bare forearm: **at or below the ~2.5 px ink hull**

The arm's outline carries two large unambiguous events, both at the hand end, and essentially nothing
along its length. **More ink is not the lever** — the events that read are already silhouette-scale,
and the one that does not read is smaller than the line drawn over it.

Two caveats CHARACTER volunteered rather than buried. Its first probe binned by proximity to the arm
axis and reported a **32 cm-wide upper arm on a 1.53 m figure** — catching torso, tail and cane —
caught only because the number was physically absurd (§11's family). And in the corrected version
several bins near the cuff rest on **2–6 vertices**, so the sleeve→forearm figure is noisy: 1.7 px
band-max-to-band-max, ~19 px across the actual notch. **It shipped no geometry change**, because
authoring one it could not verify is precisely what §47 records going wrong.

---

## §54 — the parity fix reaches the frame and the seam rhythm closes; the palette item has an arithmetic ceiling and the shipped frame is already at it

Two results, one capture-free. The first cost no lock at all: the frames it needed already existed
(§45's discipline), and the pre-registration was written and time-stamped before `shots/geo3/`
had a single file in it.

### §54.1 §44's parity fix: A1 and B pass, on frames that had a genuine pre-fix twin

`shots/tx8/` (`671dd39`, clean) is **post**-kheker/post-cartouche and **pre**-parity-fix, at the
same three framings `shots/geo3/` (`8795030`, clean, `errors: []`) later rendered. That is a real
A/B and nobody had noticed it was sitting on disk. `git merge-base --is-ancestor 59e3328 8795030`
confirms the fix is in the tree the pixels came from.

**The instrument, and why the first one was thrown away.** `scratchpad/uvprofile.mjs` resamples a
*rendered frame into texture space*: ray-cast the material through the shot's own camera, take
the interpolated `u_tex`/`v_tex` off the merged geometry, bin the frame's own pixels by `u`
within a `v` band. A decoration drawn `n` times per tile then has its fundamental at exactly
`k = n` cycles per repeat, so "14 finials or 16" is a question about which integer bin holds the
peak. **The NCC-lag version written first could not answer it** — at 96 bins the two lags are 7
and 6 samples and it returned r 0.352 vs 0.354, a null — and it was replaced rather than tuned,
which is §13's rule biting inside one session.

And the parity itself falls out as a frequency: a 4-pigment cycle over `n` finials sits at
`k = n/4`, an **integer when 4 divides n and 3.5 when it does not** — and a non-integer frequency
cannot exist in a periodic signal, so it appears as split energy across k3/k4. **That split *is*
§44's defect, written as a spectrum.**

| | tx8 (pre) | geo3 (post) | registered band | verdict |
|---|---|---|---|---|
| finial fundamental, luma | k14 **10.9 %**, k16 3.5 % | k14 **3.3 %**, k16 **14.0 %** | k16 > k14, ≥ 6 % | **PASS** |
| pigment cycle, `b−r` k4/(k3+k4) | **0.261** | **0.860** | ≥ 0.60 | **PASS** |
| columns 11 → 12, register band | luma 1.7/0.5, `b−r` 2.6/4.6 | luma 1.0/1.7, `b−r` 1.1/4.8 | both channels flip | **INCONCLUSIVE**, as pre-registered |
| **dado null** (no cycle) | k1 17.9, k4 11.6, k11 5.3, ratio 0.803 | k1 18.0, k4 11.6, k11 5.3, ratio 0.799 | < 3 % | **PASS**, ≤ 0.1 pp |

The A1 pair is a **swap**, not a strengthening — k14 falls as k16 rises, on the same 560 × 80 ROI
with an identical 11,476-pixel sample in both frames — and a constant that had not reached the
renderer would have left k14 where it was. So this is *not* §39's family; the value is consumed
where it is set.

**The dado null is what makes the rest quotable**: every dado figure matches to ±0.1 percentage
point across the two trees, so nothing global moved on that wall and the kheker swing is the
change under test. §29's failure — two fixes each passing its own band while the frame got worse
— is exactly what a null this tight rules out.

Three scope facts, all registered before the frames existed rather than discovered after:

- **`temple` cannot score this fix.** Its kheker band has no fundamental in *either* tree (k14
  2.2 % / k16 2.3 %), so it was disqualified in advance. The whole verdict rests on `traversal`.
- **`courtyard`'s null is unusable** — its ROI spectrum moves wildly between the trees because
  the shot's framing and props changed for unrelated reasons. Reported, not quoted.
- **A2 does not count**, by its own rule: both geo3 channels agree on k12 but `b−r` already
  favoured k12 pre-fix, so it did not flip. The cartouche alternation is therefore **not
  independently confirmed in frame**; it rides on A1 proving that both counts reach the renderer
  through the same function.

**A prior of mine was falsified before it could become a conclusion.** I first wrote that the
seam-local test would be VOID — 14 px cells on a wall at 28 m, through AgX and a bloom, ought to
be below the noise. Running the instrument on the *pre-fix* frame before writing the prediction
put the pigment cycle at 0.261 with k3 at 9.5 %, plainly present. **The defect was visible in a
shipped frame.** Getting the known-bad reading first is the only reason that is a correction
rather than a retraction.

### §54.2 The palette line is bounded by §2.2 itself at 0.875, and the critic measured 0.87

Every named colour in `AGENTS.md` §2.2, by display hue:

```
red 7.5  carnelian 10.7  paintBlack 17.1  sandCrev 19.5  sandDark 24.9  ochre 28.1  sandMid 29.7
sandLight 34.9  limeDark 36.4  goldDark 39.0  white 40.0  limeMid 40.3  limeLight 40.5  gold 43.0
goldLight 44.8   ||   malachite 146.9   turquoise 176.0   lapis 215.8
```

**Fifteen of eighteen lie inside a 37.3° span — narrower than one of M11's two 40° windows.** The
other three span 68.9°, so a second window holds at most two. Equal areas of all eighteen score
**17/18 = 0.944**; equal areas of the eight accent pigments, with no stone at all, score
**7/8 = 0.875**. Critic pass 5 measured the whole frame at **0.87**. *The shipped frame is
already at the floor the art bible's own palette permits*, and this is arithmetic on eighteen hex
constants, checkable in one line.

`scratchpad/chaincap.mjs` closes it from the other end by asking what the chain does to a
**perfect** input (controls first: sweep 0.222, two-hue 1.000):

| input | albedo | × matcol | keyF 1.00 | keyF 0.35 | keyF 0.00 |
|---|---|---|---|---|---|
| full-hue sweep | 0.228 | — | 0.417 | 0.325 | **1.000** |
| × `hieroglyph_wall` 0xd6a874 | — | 0.453 | **0.861** | 0.558 | **1.000** |
| × `sandstone_block` 0xc9915a | — | 0.630 | **0.942** | 0.654 | **1.000** |

A texture with a perfect 360° hue distribution — neither palette-legal nor desirable — still
leaves the chain at 0.861 in sun and 1.000 in shadow. Decomposed: consumer material colour
0.228 → 0.453 (ARCHITECTURE), light+grade 0.453 → 0.861 (SHADING/POSTFX), shadow → 1.000 (§38.4,
reproduced here from the opposite direction).

**So finding #2 is not closable from `src/textures/**`, and now it is bounded rather than
argued.** What the texture side did move is on the record: `hieroglyph_wall`'s built albedo is
**0.957** raw with hue mass 88/4/4/4 across the first four 30° buckets, against §38.1's 94.9 % in
a single bin; `column_papyrus` 0.949; `plaster_painted` 0.965 — three recipes off 1.000 where
§38.1 found nine of ten at 1.000. The consumer multiply takes `hieroglyph_wall` back to 0.994.

**What this does not say.** M11 being unreachable is not a defence of the frame. "The image is
two colours" is a real perceptual read; the answer to it is the shadow chain and the non-stone
area of the frame, not a statistic §2.2 pins at 0.875 before a texel is authored.

### §54.3 A UV-density defect that was the instrument, killed by its own distribution

A sweep across every mesh reported `arch:hall:hieroglyph_wall` at **5.23× the `UV_PER_M = 0.50`
contract** — which would have meant the largest wall in the game tiling every 2 m instead of
every 10.4 m, the biggest tiling defect in the project. It was the metric.
`sqrt(Σ uvArea / Σ worldArea)` is dominated by near-degenerate triangles with area ≈ 0 and
non-zero UV extent. Per-triangle and area-weighted, **every architecture mesh reports
p10 = p50 = p90 = 0.500 exactly**, and props are on contract too (`props_stone` 0.500,
`props_lime` 0.500; only `props_cloth` at 0.99, and it is banners). Same shape as §10's
rasteriser: an aggregate inventing the defect it exists to find, caught by looking at the
distribution instead of the ratio. **Nothing was reported until the distribution was checked.**

Also eliminated in the same pass, so it is not re-derived: the walls do **not** repeat
vertically. `arch:hall:hieroglyph_wall` runs `v_tex` 0.016 → 0.970 over its full 9.9 m height and
the court wall likewise stays inside one repeat, so the dado sits at the foot of the wall exactly
once and the kheker crown crowns it exactly once, as authored.

---

## §14.8 — "sweep by explicit filename" is not sufficient for a file two agents both append to

**My error, committed at `3d20157` and found within the minute by a numbering collision.**

The rule I have been enforcing all session is: never `git add -A`; name every file. I did name it —
`git add KNOWN_ISSUES.md` — and it was still a blind sweep, because **TEXTURES had already appended
its own §54 to that file and I had not read it.** I ran `cat >> KNOWN_ISSUES.md`, staged the path by
name, and shipped 122 lines of another agent's unread work inside a commit whose message described
only my own.

The commit is harmless — the content was good, and it is now read and kept. That is luck, not
process. The same motion would have committed a half-written section, or a section contradicting the
one above it, with a message claiming it was something else.

**What actually failed:** "explicit filename" is a guard against *breadth* — it stops `-A` sweeping
files nobody looked at. It is no guard at all against *depth*, because a filename says nothing about
whether the file's current contents are the contents you think they are. `KNOWN_ISSUES.md` is the
one file every agent appends to, so it is precisely the file where the rule is weakest.

**The strengthened rule, for a shared append-only file:**

1. `git diff` the file **before** appending, not after. A non-empty diff means someone else is
   mid-write, and their work is now inside your blast radius.
2. If the diff is non-empty, **read it** and either name it in your commit message or commit it
   separately with its author credited. Never let it ride anonymously.
3. Take the **next free section number after the diff**, not after `HEAD`. My §54 collided because I
   numbered from the committed file while an uncommitted §54 already existed three lines above where
   I was writing.

The general form, which is the same shape as §18 and §50: **a name is a reference, and a reference
can be stale.** `git add <path>` names a path, not a state — and a path resolves to whatever is
there at the moment it is staged, including things that arrived while you were composing.

For the record: TEXTURES's section keeps **§54**, since it was written first and sits first in the
file; FX's contact/determinism section is renumbered to **§55**. The commit message on `3d20157`
calls the latter "§54" and is now wrong; it is left in place rather than rewritten, because a pushed
history that quietly changes is worse than a message that needs this footnote to read correctly.

---

## §55 — the contact experiment was FLAT, and the reason is upstream of everything it tested

FX's `fx16`. Full write-up in `scratchpad/RESULT-fx16.md`. It reported **two defects in its own
experiment before scoring it**, then a flat result, then the cause — which turns out not to be a
tuning question at all.

### 55.1 The probe mis-located the sole and returned a confident false positive

The auto-locator put the boot sole at **(866, 660)** — open floor sitting on a cast-shadow edge —
and returned **+17.2 L**. That number reads *exactly* like "the contact shadow now exists". Cropping
showed floor and a rail and **no boot**. Eye-verified, the sole is at **(617, 638)**, which is
*precisely* critic5's published coordinate; the character had never moved.

> **Had the auto-location been trusted, FX would have reported the critic's finding fixed.**

This is the most dangerous failure shape in the project so far, because unlike §39, §40, §43, §50
and §52.1 — all of which returned a *healthy* number for a broken state — this one returns a
**confirming** number for the hypothesis under test. An instrument that fails toward your
conclusion is not caught by disbelieving good news. Re-scored at the true sole, the baseline
reproduces critic5's table exactly, which is the check that establishes the ROI rather than assuming
it.

### 55.2 `minbias` never applied — §40's clamp, inside a sealed experiment, again

`normalBiasClamp[0] = 0.012 m` pinned it. At c0's texel of 0.0105, both `nbt 0.5` → raw 0.00525 and
`nbt 0.1` → raw 0.00105 clamp to **0.012**. The two "reduced" states are an identical c0. The sweep
was **×1.49, not ×17**, and — the part that matters for the write-up — **the seal's "even at a
near-zero offset" argument is not available**, because that state never rendered. FX withdrew the
argument rather than keeping the conclusion it supported (contrast §42, where a disqualified
instrument's conclusion was kept; that was my error).

### 55.3 The band is flat, and flat harder than it was asked to be

Band 1 was sealed at "< 3 L". The result is **0 px changed, max delta 0** across the whole contact
neighbourhood, in both reduced states. Meanwhile the same toggle moves **26,150 px with max delta
129** elsewhere in frame and visibly tightens the kerb-rail shadow. **The knob is connected and does
nothing under the boot.** A null with a working positive control in the same frame is worth more
than any tuned number.

R2 failed as sealed (2.60% against a 1.0% band). FX reported it **FAIL as written** rather than
rewriting the rule after seeing the number, while noting 88.5% of it is large coherent components
and a 4× crop shows a rail shadow tightening rather than speckle. Reporting the sealed verdict and
the mitigating observation *separately* is the correct handling. `back` is byte-identical to `base`.

### 55.4 The cause: there is no direct light there to remove

Measured, not inferred. The sampled region sits on floor receiving **no direct key light**:

| region | RGB | R/B |
|---|---|---|
| under the boot | 61, 77, 90 | **0.68** (cool) |
| control | 59, 75, 90 | 0.66 |
| sunlit floor | 137, 78, 56 | ~~**2.47**~~ — **dead reference pixel, see §63.2; use 2.74** |

**A contact shadow is the removal of direct light. On shaded floor there is nothing to remove, at
any bias.** The lit/shade boundary is a long rail-parallel diagonal spanning the frame —
architectural in scale, far too large to be the 1.8 m caster's own shadow, so this is not Sly
swallowing his own ROI.

Three findings, deliberately kept separate: shadow-map **displacement is eliminated** (FX's own,
closed); **`sly-closeup` stages the character on unlit floor** (new, measured — owner is shot
staging or LIGHTING); the **AO ceiling of +0.6 L** (SHADING's, unchanged). They compose rather than
compete, and the composition is the finding:

> On shaded floor, **AO is the only possible source of contact darkening** — and AO is exactly the
> route already measured an order of magnitude too weak. So a contact term for this frame **must
> work in ambient-only conditions**; one keyed off direct light does nothing here.

**This reaches the contact term already built** (`RESULT-contact-build.md`, shipping at
`strength = 0`). That term derives its signal from the *negative lobe of the rim gate's planarity
test* — depth geometry, not light — and composites on the PostFX AO path toward `uAOTint`, so it
should survive an unlit floor. **That is now a prediction to state before its A/B, not an assumption
to discover afterwards**, and its M12 scoring ROI is on the same `sly-closeup` sole this section
just relocated.

**The cheapest next step is a decision, not code:** re-stage the feet into direct key (a `Shots.js`
one-liner) or specify the term against ambient. Building first risks specifying against the wrong
lighting condition.

### 55.5 The determinism lead: one emitter eliminated free, one mechanism named

**`LightShafts` is eliminated at zero cost.** `fx6` and `fx7` are two independent boots and their
shaft counts agree **exactly** on all six shared shots (dunes 12, guard 10, hero 27, interior 20,
night 12, temple 38). An existing pair of captures answered a new question with no lock spent.

**Named suspect, from the code rather than from pixels:** `_updateSparkles` **latches**.

```js
this._sparkleTimer -= dt;
if (this._sparkleTimer > 0) return;
```

The count is whatever the last refresh produced; refreshes are paced by the **world** clock; and
under the harness's `dt = 0` frames it never re-evaluates after staging. Its input is
`collision.query(movement.position, 34 m, [hook, spire, rail, pole])` **at whatever position the
player held when the last pre-staging refresh fired** — so a boot whose prewarm ran 7.5 s longer
latches a different one. `sparkleMax` is 96, so §53.5's **31 instances** is in range, and hook rings
hang at y 11–15 m, which lands in exactly the top band CHARACTER localised the differing pixels to.

If confirmed, this answers both questions I put to FX: it is **a determinism bug, not a
correctly-behaving emitter**, and the remedy is **neither a fixed seed nor `step(n, 0)`** but
forcing one refresh on the `shot` event — precisely as `_animT0` is already rebased for flicker.
§28's `step(n, 0)` fixes *within-boot* phase; a latch predating staging is immune to it.

The noise floor then gets a name and a bound rather than an empirical range: **≤ 96 instances /
192 triangles, spatially confined to wherever traversal affordances project.** Face closeups with no
affordances in frustum (`sly-startle`, 7 px) are trustworthy for cross-boot A/B; wide shots showing
the hook chain are not. That is a *predictive* statement about which shots can carry a cross-boot
comparison, which is worth far more than the measurement that prompted it.

`det3` is queued — two boots in one process, dumping every emitter's `instanceCount` plus the
latched **and** freshly re-queried sparkle count, so a stale latch shows up **within a single boot**.

### 55.6 A §14 footnote worth keeping

FX verified `det3`'s detachment by a **full ancestry walk** (init → wrapper → node, the survivor
shape). Its earlier one-level "ppid must be 1" test is the too-strict version §14 already corrected,
and it would have declared this correctly-detached process attached.


---

## §56 — L1 cleared the capture without being scoreable, and inverted the mechanism it was testing

GEOMETRY ran `PREREG-loft-dunes.md`'s L1 offline while `rim4` held the lock — the clause registered
so that a FAIL could cancel its own capture. It did not fail. It also could not be scored, and that
is the more useful outcome.

### 56.1 The bands were denominated in a statistic nobody defines

L1's thresholds (≥82.1 / 72.1–82.1 / ≤72.1) inherit §51.1's "swept-normal area" pair. **No such
quantity exists in the project.** `form.mjs` — the only instrument measuring area-weighted normal
clustering — reports `top6/top12/top24`, and no definition of the named statistic is written
anywhere. Reconstructing the most natural reading gives 47.9% → 69.3% body-only and 39.8% → 43.9%
whole-figure: **neither reproduces the pair, and both come out the opposite sign** to the recorded
finding.

GEOMETRY recorded L1 **UNSCOREABLE AS REGISTERED** rather than forcing a verdict into a band. That
is the right call and the rarer one — a sealed clause with a number attached invites you to produce
a number.

### 56.2 What is reproducible, with its definition stated so it can be recomputed

Area-weighted triangle-normal clustering, two normals in one cluster iff `dot > 0.9998`;
`swept = 100 − (area fraction in the 6 largest clusters)`. Arms share `rng(12345)`; the shipped
figure is built once and only its body is substituted.

| arm | tris | swept, body only | swept, whole figure |
|---|---|---|---|
| A — the `chunkAt` slabs the loft replaced | 88 | 47.9% | 39.8% |
| A3 — **the slabs it *actually* replaced** (see below) | 132 | **51.9%** | not recomputed |
| B — **shipped** loft, `belly` 0.06 | 240 | **76.9%** | 43.9% |
| C — same loft, `belly` 0 | 240 | 69.3% | 43.9% |

> **CORRECTION, added by GEOMETRY at the declaration site while applying this table to
> `PropKit.js:393`: arm A is under-populated, and the +29.0 headline inherits it.** Arm A is built
> from **two** slabs, and the loft replaced **three**. `Statues.js` says so beside the `loft()`
> call itself — *"body: haunch, barrel and chest as ONE lofted mass"* — its stations span
> z −2.18…1.26, and the pre-loft chest slab `chunkAt(-0.78,0.78,1.60,2.30,0.35,1.20)` is absent
> from the shipped sphinx. The loft and all eight stations landed in **one** commit (`d542055`),
> so the loft did not grow after the measurement; the control just omitted a slab.
>
> Adding it **raises** the baseline — a third chamfered slab contributes its own bevel clusters —
> so the margin **shrinks to +25.0 points body-only**. Direction and magnitude of the conclusion
> are unchanged, and **`belly`'s +7.6 is untouched**: that is B against C, loft against loft, and
> no control population enters it. Recomputed with `progress/records/L1-chest.mjs` (= `L1.mjs` + the
> third slab, params verbatim from `d542055~1`). `RESULT-L1-loft.md` §43/§47 carries the same
> two-slab control and wants the same correction.
>
> This is §56.3's own lesson landing on §56.2: **a number quoted onward without its population
> travelling with it.** The population was recoverable in about a minute from the source comment
> next to the knob, and nobody had checked it against the arm.

**The shipped loft beats what it replaced by +29.0 points** — corrected to **+25.0**, above — and `belly` earns +7.6 of that. At
whole-figure scale `belly` is **invisible** — 43.9% in both arms to three figures — because the body
is too small a share of the figure's area. Any future `belly` claim must be body-only or it is
measuring the head and the plinth.

### 56.3 The mechanism in §51.1 is exactly inverted

Mean area-weighted angular deviation of face-interior normals, restricted to triangles within 10° of
+X so the chamfer bevels are excluded:

| surface | tris | mean turn | max |
|---|---|---|---|
| `chunkAt` slab face interior, jitter **0** | 2 | **0.00°** | 0.00° |
| slab face interior, shipped jitter 0.025 | 2 | 0.46° | 0.48° |
| loft flank interior, `belly` 0 | 36 | 4.87° | 8.35° |
| loft flank interior, **`belly` 0.06 shipped** | 32 | **6.66°** | 11.17° |

**The box face turns through precisely zero and the loft flank carries the gradient** — the reverse
of what §51.1 says. A `chamferBox` side face is two triangles sharing one normal; its 0.46° is
jitter, and switching jitter off takes it to a hard 0.00°.

The origin is visible: widening the selection cone from 10° to 45° pulls the bevels into the
"face interior" population and the same slab reports **13.98°**. The "~7°" is that artefact — **a
bevel measured and attributed to the flat face beside it.** §50 and §51.4's shape again: an
instrument silently including what it was meant to exclude, and a conclusion reasoned from it.

**Four deep now, always the same:** a number quoted onward without its definition travelling with
it. §34 (`aoP` p1/p5/p50 read as p5/p50/p95), §48.3 (68% correct for a different material), §51.1
(this), §54's palette figure being checkable only because TEXTURES published the eighteen hex
constants. **My share of this one is specific: I wrote §51.1's headline into the ledger without ever
asking what "swept-normal area" measured.** A statistic with no definition is not a measurement, and
recording it gave it three more hops of authority.

`belly` stays at 0.06 — retained on §56.2's evidence, not on the source comment, which is wrong.
`PropKit.js:393` and §51.1's headline both want marking unverified; the source edit waits until
`src/world/` unfreezes after `dunes`.

### 56.4 The draw-call question: same quantity, wrong comparison

`counted` (bud35) and `report.json.drawCalls` **are** the same quantity — both `renderer.info.render`
with `autoReset = false`. But courtyard's camera **moved and widened between the two trees**:
`[-19, 5.6, 30] fov 50` → `[-2.5, 4, 41.5] fov 55` (`8757fb6`, `9c5edf8`). A wider lens further back
sees more. That accounts for 255 → 270 draws and +53 k triangles, and **exonerates the statue change
independently**: 2,240 level-wide triangles cannot become 53,000 even at the 3.1× pass multiplier.
§1 is unaffected — it scores the main-view column, not this one — and the table should say so where
it is declared.

### 56.5 N1–N4 on geo3's courtyard: the least-confident clause passed, and the falsifier stayed quiet

- **N3 PASSES** — the clause GEOMETRY called least confident and most worth knowing — **10.8 L west
  / 10.1 L east against a ≥8 L bar.** The terrace tops carry a real gradient; `round` is working.
- **N2 weak-but-present**: 5 px median (p25 3, p75 11) against a 9.8 px point prediction — **missed
  by ~2×**, and reported as a miss.
- **N4 registers no loss**: both crowns read crisply stepped, not melted. The over-rounding
  falsifier was registered to fire and did not.
- **N1 UNSCOREABLE** — it asked for a count of horizontal step edges, but the nemes has 5 stripes by
  construction and the clause specified no discriminator between two co-located band families; the
  terraces also step in depth rather than against the sky. **A prereg design defect, not a geometry
  result**, and the second clause this session to be unscoreable rather than failed.

### 56.6 `temple` closes §7.3's first condition on the columns

Median-filtered scans across five shafts show plateau-and-step structure with **41–72% of each scan
in flat plateaus separated by 14–31 L steps** — against critic pass 2's reading of "~12 L over
100 px with no plateau-and-step structure". The 48-radial-segment shafts gave the quantiser
something to act on.


---

## §57 — the shipped value was outside its own tuner's search domain, and the score and the silhouette disagreed

CHARACTER's `perch_idle` cane re-aim (`src/player/Clips.js`). **Authored and verified offline only
— no capture yet**, and the change says so in its own comment. Recorded here because the two
findings behind it outlive the fix.

### 57.1 An optimum on the boundary meant the answer was outside the box

The shipped cane aim was `[-20, 30, 130]`. `tools/canesweep.mjs` — the tool built to choose that
aim — searches `z` over **−30…+30**.

> **The value in the file was outside the domain the tool could search**, so the tool had never
> been able to evaluate what was shipped, in either direction.

The tell was present and readable the whole time: **its top-12 results all sat on the `z = +30`
boundary.** A search whose winners pile up against an edge is reporting that the optimum is outside
the box — §3's clamped-knob shape, appearing here in a search domain rather than in a uniform
clamp. Re-scored over the full domain with the shipped aim included **as a control**
(`scratchpad/canebase.mjs`), the shipped value ranks **5927 of 10351**: `bodyGap` 0.12, `across`
0.52 — the shaft half-aligned with the view axis and foreshortened into a stub. The new aim ranks
**1**: broad 1.00, across 1.00, bodyGap 0.53.

Including the shipped value as a control is what converts "the tool likes this new number" into
"the tool ranks the old number 5927th"; without it the sweep only ever compares candidates to each
other.

### 57.2 The score shortlisted; the silhouette chose; they disagreed

`[-124, 45, -180]` scores **3.455** against the chosen aim's **3.475** — a tie on the metric — and
renders as **a ring fused into the tail**. The reason is structural: `canesweep` measures crook
clearance against **`head` and `chest` only**, and in this pose the **tail is the largest mass in
frame and is not in its model at all.**

> **Shortlist with the score, never select with it.**

This is the §46/§52.1 family seen from a new angle. Those were instruments blind to a state; this is
an instrument blind to *an object* — the metric is correctly computed over a population that omits
the thing that actually decides the frame. A tie between a good answer and a bad one is the
signature: when two candidates score identically and look nothing alike, the score is missing a
term, not splitting hairs.

The defect being fixed is worth stating plainly, because it is a critic-visible one: at `hero`'s own
70°/1°, rendered as a pure black silhouette, the old crook curled back against the hip and its tip
closed on the torso — **the C read as a ring hanging off him rather than as a hook.** The most
recognisable prop in the series, fused into the body mass, on the one shot that freezes this clip.

### 57.3 All four keys moved together, and that is §9's trap being avoided rather than repeated

The base pose and the three in-between keys hold **absolute** angles, so moving the base alone would
have left the drift keys orphaned against a pose that no longer exists. All four moved by matched
deltas (+[4,−4,0] at 0.8, −[4,−4,0] at 1.7), so the breath drift is unchanged and only its centre
moves. §9's orphaned-key trap is already documented for the tail keys in this same clip; it applies
identically to the cane, and this is the first time it has been applied *before* the fact rather
than diagnosed after.

### 57.4 What the capture still has to answer

Stated by the author in the source, before any frame exists: `shotsil` has **no ink hull and no
scene**, so it cannot see the one risk this change creates — **he is perched on a ledge, and the
hook now swings low and outboard, so `hero` must show it over open air rather than through the
ledge.** An offline silhouette probe cannot see intersection with world geometry.

This also revises §53.6. I had recorded that `perch_idle`'s only remaining item was verifying the
existing line of action in pixels. That was right about the line of action and wrong about the clip:
a separate, larger, critic-visible defect was sitting in the same four keys.


---

## §58 — a tool that could not see the value it chose, a shot that could not see the thing it was asked about, and a condition that cannot be scored at all

CHARACTER's `perch_idle` follow-up. Two of these were fixed at source by the coordinator because
`tools/**` and `src/core/Shots.js` are read-only to the agent that found them.

### 58.1 `canesweep.mjs` fixed at the declaration site

Both defects §57 identified are now closed in the tool rather than in a scratch copy:

- **`z` domain `-30…30` → `-180…180`.** The grid is now 46 × 9 × 25 = **10,350** rows, which is
  exactly the population CHARACTER's full-domain re-score used (10,351 including its control).
- **The shipped aim is scored and RANKED**, read out of `Clips.js` so it cannot drift the way a
  hardcoded baseline would. Without it the tool compares candidates only to each other and can
  announce a confident winner while saying nothing about what is already in the file.
- **The scope limit is now written in the tool**: this score models crook clearance against `head`
  and `chest` only and does not know about the tail. *Shortlist with the score, never select with
  it.*

### 58.2 `sly-perch` added, because `hero` provably cannot answer the question

The line of action is hips +0.045 → chest +0.082 → head +0.046 — 3.7 cm out, 3.6 cm back. At
`hero`'s 87–97 px/m that is **3.2–3.6 px against a ~2.5 px ink hull at a 70° view.** The excursion
is the width of the line drawn over it, so `hero` returns a null whether or not the lean exists.

**Registered as an expected null before the capture**, so that a null in `hero` is never later read
as "the lean is missing" — the §49 discipline applied prospectively. `sly-perch` is `sly-closeup`
translated down 0.30 m and nothing else: same lens, bearing, distance, yaw and player position, with
only the height following `perch_idle`'s own base offset. Authored as a pure translation because
`sly-startle`'s own comment records what re-inventing a twin's camera costs (§27.2). It is
deliberately not on the ledge and therefore says nothing about §57.4's cane-over-open-air risk,
which remains `hero`'s alone.

### 58.3 The proportions condition cannot currently be scored — three definitions, no agreement

Measured on the live rig: standing `idle_confident` is **1.774 m**, reading **4.44 heads**
chin→crown including the cap, or **6.73 heads** on authored skull height. `perch_idle` reads
4.14 / 5.79 — *pose, not rig*. §7.3 asks for "~1:5", which sits **between** the two published
measures. §9's often-quoted **5.29 heads** is a third definition matching neither.

> **This is a live hazard, not a fixed defect.** Four numbers describe one figure and no two share a
> definition, so "does he read 1:5?" has no determinate answer until someone says chin-to-crown or
> skull, with or without the cap.

**Fifth instance of the session's most persistent pattern** — §34, §48.3, §51.1/§56.3, §54's palette
figure, and now this: *a number quoted onward without its definition travelling with it.* §9's
actual lever (~0.10 m shorter torso across ~10 absolute-Y sites) remains unattempted, and should
stay unattempted until the measure is fixed, because changing the rig to satisfy an ambiguous target
is how you ship a regression that scores as a win.

### 58.4 The sleeve→forearm bands carried a unit error larger than the effect

The 1.7 px / 19 px readings from §53.7 are in **`shotsil@900`** units; the capture renders **720**
rows. That is a **1.44× conversion — larger than the difference between the two candidate
readings.** Converted: **A = 1.4 px** (no event, buried inside the 2.5 px ink hull) against
**B = 15.4 px** (a visible notch).

The registered primary verdict is therefore the **unit-free ratio** to the forearm→cuff step
measured in the same frame: **A = 0.07, B = 0.58**, indeterminate between 0.15 and 0.40, with an
abort if the forearm→cuff ruler itself misses 15–28 px. Scoring a ratio rather than a length is what
makes the clause immune to the error that nearly broke it.

### 58.5 Reading C: the probe has a demonstrated false positive of exactly the shape the finding needs

Not in the record before, and registered by CHARACTER as the outcome it thinks most likely: the
notch rests on **4–6 vertex bins**, and the same probe is *known* to produce a spurious event of
precisely that shape — bin `u = 0.662`, `n = 4`, reporting a 7 cm arm in mid-sleeve, half of both
its neighbours.

So `cap9` gets a **free in-frame control**: that bin predicts ~34 px if low-`n` bins are real and
~0 px if they are artefacts. **If the control pinches, B is withdrawn regardless of what the hem
shows.** This is the §46 discipline — prove the instrument on a known input in the same frame as the
claim — arriving inside a pre-registration rather than after a disputed result.

### 58.6 The arm ink is authored and deliberately withheld, to keep the measurement falsifiable

`_buildArmInk` (105 lines: sleeve-hem welt, glove-cuff welt, ulnar seam) was withdrawn at `866e251`
to protect another agent's determinism pair, and is being **kept out on purpose**: its sleeve-hem
welt lands at `u ≈ 0.76`, exactly the boundary `cap9` measures, so reinstating it would make the
sleeve→forearm item **unfalsifiable**. `cap9` is its before-frame. Recovery is
`git show 4db64b4 -- src/player/SlyModel.js`.

A decision *not* to ship finished work, in order to preserve the falsifiability of a measurement,
is the inverse of §37's fur-card lesson and belongs in the record as a positive example.

### 58.7 A third self-discarded probe

CHARACTER tried to settle the line of action offline with a per-row silhouette-centroid probe and
threw its own result away: the "head" band came out **204 px wide on a 320 px figure**, so the bands
contained the cane and the tail rather than the spine. §11's wrong-population trap, caught by the
number being physically impossible — the same tell that caught the 32 cm forearm in §53.7.


---

## §14.9 — I ran the check and hardcoded its verdict

**One commit after recording §14.8, I repeated §14.8's failure with §14.8's own check running.**

The command was:

```sh
git diff --stat -- KNOWN_ISSUES.md ; echo "(empty = safe to append)"
```

`git diff` returned **12 insertions**. The `echo` printed *"(empty = safe to append)"* — because it
is an unconditional label, not a conclusion. I read my own output, saw the reassuring string, and
appended and staged over another author's uncommitted work.

> **A check whose conclusion does not depend on its measurement is not a check.**

This is the §39 / §43 / §50 / §52.1 family — an instrument that returns "healthy" for every input —
except hand-built by me, immediately after writing the section that warns about it. §14.8 diagnosed
the *breadth vs depth* problem correctly and then failed on a third axis neither of us named:
**the guard was advisory.** It printed something a human had to notice and act on, in a loop where
the human was the one making the mistake.

**Fixed as `tools/preappend.sh`, which exits non-zero.** It refuses rather than reports, so it
cannot be misread:

```sh
tools/preappend.sh KNOWN_ISSUES.md && <append> && git add … && git commit …
```

Proved on both inputs before being trusted, per §46: exit 0 with "clean at 674bdd9" on the real
file, exit 1 on a deliberately dirtied copy, and exit 0 again after reverting. A guard that has only
ever been seen to pass has not been seen to work.

**What rode in unread, now credited:** GEOMETRY's addendum to §51.3 — the note I had explicitly
asked it to write, recording that `counted` and `report.json.drawCalls` are the same quantity but
not a like-for-like comparison, because `courtyard`'s camera moved and widened between the trees.
Good work, and it should not have entered the history inside a commit message about something else.
Twice now the content has been fine; twice that has been luck rather than process.

---

## §59 — the guard against silence was itself silent, and the silhouette test was the wrong instrument for half of what it was asked

### 59.1 My §58.1 fix reintroduced the exact defect it closed

§57.1 found that `canesweep.mjs` could announce a winner while saying nothing about the value
already in the file. §58.1 claimed to close that by printing the shipped aim with its rank. **The
block never ran.**

It read `CLIPS[clip]?.keys?.find(k => k.cane)?.cane` — the **authoring** shape. `def()` in
`Clips.js` compiles `keys: [...]` into tracks, so at runtime **0 of 52 clips have `.keys`**, and the
aim lives at `clip.cane.v[0..2]` of a `{times, ease, v, q}` track. `shippedKey` was `undefined` for
every clip, the `if` never fired, and the tool printed its winner list with **no SHIPPED line —
indistinguishable from a clean run.**

> **A guard whose failure mode is silence cannot be verified by running it.** Nothing appears in
> either case. It must be checked by making it speak on a known input.

Fixed against the verified runtime shape and **proved by making it speak**: `perch_idle` now prints
`SHIPPED [116,-30,45] score 3.475 RANK 1 of 10350`, reproducing CHARACTER's independent numbers
exactly. Stated honestly: the new "no cane track" branch is **unreachable in this build** — all 52
clips carry one — so it is written for robustness and is *not* exercised by any control.

Same family as §7's `aimBone` aliasing. This is my error, found by CHARACTER, one section after I
recorded the tool as fixed.

The output also makes §57.2's rule visible: the top four rows score **3.475 / 3.474 / 3.473 /
3.462** — four candidates inside 0.013, one of which renders as a ring fused into the tail.
*Shortlist with the score, never select with it.*

### 59.2 Head:body resolved — 5.72, and the two published numbers never tested the condition

§58.3 froze the proportions lever as unscoreable. CHARACTER closed it by computing the measure
nobody had, and by explaining *why* the existing two disagree:

- `shotsil`'s `headH` is `max(y over head-cluster bones) − chin`, and that cluster contains
  `capBrim`, `earL`, `earR` — so it measures chin to the top of the **cap or ear tip**, inflating
  the head and deflating the ratio → **4.44**.
- `skullH` is a span read off the `SlyModel.HEAD` profile table, **narrower than the rendered
  skull** → **6.73**.

**They bracket §7.3's "~1:5" rather than test it.** Measured anatomically — chin to top of cranium,
cap and ears excluded, off skinned vertices, `idle_confident` — total **1.7745 m**, head
**0.3101 m** → **5.72 heads**. (`perch_idle` reads 5.11, but that is a crouch, not a stature.)

**So the condition is genuinely failing, and the generous 4.44 reading was making it look passed.**
He is ~0.7 head too realistic. Proposed for `AGENTS.md` §7.3, which is locked to CHARACTER:

> **Head:body** = total standing height ÷ head height, where head height is **chin to top of
> cranium in `idle_confident`, excluding cap and ears**. Target **5.0**; fail outside **4.5–5.5**.
> Current rig: **5.72**. Reproduce with `scratchpad/headratio.mjs`.

§9's arithmetic survives against it: reaching 5.0 by head size alone needs a 0.398 m head — a
bobblehead — so the torso remains the lever, now with a target that means something.

### 59.3 The pure-black silhouette is the right instrument for props and the wrong one for weight

CHARACTER read the black silhouette as "a vertical post", nearly filed a pose regression, and was
**corrected by its own measurement**. On the rig, `idle_confident` carries:

- **34.0°** of shoulder-vs-hip counter-rotation — genuine contrapposto;
- shoulder tilt **−0.036** against hip tilt **+0.045** — *opposite signs*, which is the definition;
- hips centred over the right foot (|dx| **0.002** against **0.234**) — the weight is on one leg;
- a **4.6 cm** chest offset from the hip→head chord, *more* line of action than `perch_idle`'s 3.6.

§9's "both feet 4 cm apart and vertical" is **stale — they are 23 cm apart.**

> **Contrapposto at a near-frontal view is an internal-contour and limb-overlap cue.** A pure-black
> silhouette deletes exactly the evidence that carries it, so it returns "post" for a correctly
> weighted pose. The instrument that settled the cane hook is the wrong instrument for the spine.

An instrument being *right* for the last question is not a reason to trust it on the next one — the
same lesson as §53.2's ROI inherited across framings, in a different currency.

### 59.4 Fur: both prescribed fixes are documented regressions, and the sheen is not fur

The brief asks for clumps and tufts breaking the silhouette. **§37 shipped exactly that and removed
it on a hold-out render** — with cards it read as "a shredded mottled mass"; without, it read
immediately as Sly. CHARACTER verified the current tree *is* the post-removal state rather than
assuming it: `shotsil` reports **13,148 body triangles**, matching §37's 16,094 → 13,148 exactly.
§47 then authored interior arm ink and withdrew it on measurement.

**Both routes are eliminated**, and the remaining lever §47 names — silhouette-scale sleeve/glove/
forearm proportions — is the same lever §58.3 froze. The honest state is: *not fixed, and the two
obvious fixes are documented regressions.*

One new fact, routed: at 4× the arms carry a **vinyl specular band**, and fur spec is already
0.02–0.03 at gloss 8–9. **That sheen is cloth (spec 0.18 / gloss 34), not fur.** It belongs to
whoever owns the shading of the sleeve, not to the fur work.

### 59.5 The ledge risk, predicted falsifiably before its frame

§57.4 registered that no offline probe could see whether the re-aimed hook passes through the
ledge. `scratchpad/caneledge.mjs` now bounds it in world space: staged at `hero`'s transform, the
cane's lowest vertex sits **6.2 cm** below his contact plane — statistically identical to his own
boots at **6.1 cm** — with the below-plane footprint within **0.42 m** of his stance. At `hero`'s
87–97 px/m that is **~0.6 px, sub-pixel.**

**Prediction: the hook clears, and any intersection is invisible.** The "low and outboard"
impression from the silhouette is projection, not world space. If `hero` contradicts this,
`scratchpad/Clips.preperch.js` reverts four numbers.

### 59.6 A stale output directory that would have produced a lying manifest

`shots/cap9/` already held a **different** run — `sly-closeup / sly-key / sly-startle / hero` from
19:14–19:25 at commit `5d30fed`, an older ancestor. The granted run writes **three** files, so
`sly-key` and `sly-startle` would have survived as orphans **inside a directory whose fresh
`report.json` did not describe them** — a manifest that is true about what it lists and silent about
what sits beside it. Moved to `shots/cap9-prev-5d30fed/` before the run wrote anything.

A monitor also fired a false "cap9 DONE" within 60 s; CHARACTER checked the stamp instead of
believing it.


---

## §60 — three defects caught before the capture, and a brief's hypothesis disproven by measurement

GEOMETRY, while blocked in the capture queue. All of this is pre-frame.

### 60.1 The dependency rule is now enforced in code rather than by vigilance

`PREREG-loft-dunes.md` is amended **before any `dunes` frame exists**, altering no clause and no
threshold, to record that its freeze clause was insufficient *as written*: it named `src/world/` —
the module GEOMETRY owns — while the hazard arrived from `src/render/`, which decides where band
edges fall. The rule it now states:

> **Name the modules the measurement depends on, not the modules you own.** For a band-transition
> measurement that set is `src/world/` (geometry), `src/render/` (the quantiser), `src/textures/`
> (the albedo the luma is read from) and `src/core/Shots.js` (the framing the pixel table is
> computed against).

`scratchpad/dunesloft.mjs` now **refuses to queue** while any of those four carries a tracked
uncommitted modification, and logs what it is waiting on. Note the discrimination: *held* (tree
unchanged) and *landed* (tree changed but named by a sha) both clear it. **Only a tree no sha
describes is refused** — which is the actual hazard, rather than "someone is editing".

### 60.2 Arm 2 was occluded by its own neighbour, and the fix is a better instrument

The seal asked for "one staged close arm on `+X z 52.6`" without fixing a viewpoint, and the obvious
viewpoint does not work. The row is 6.3 m apart in z and each animal is 3.44 m long in x (world x
**5.74…9.18**, since `ry −90°` maps local z onto world x). A sight line from z 62.5 to the z 52.6
flank crosses the z 58.9 animal's near face at **x 8.11 — inside its footprint.** *That frame would
have been a picture of the wrong sphinx.*

Arm 2 is now a **dolly along the canonical bearing**, 10.5 m from the flank centre on the line the
`dunes` camera already occupies; the same sight line crosses at **x 10.65, outside 9.18 — clear.**
And it is the better instrument for the reason `hero` uses the same trick: the bearing is unchanged,
so sun-to-flank and view-to-flank are identical to arm 1, making arm 2 **"arm 1, closer"** rather
than a differently-lit second opinion that would confound L3.

The run additionally **raycasts the live scene** from the arm-2 camera and records the first three
hits, so the frame carries its own proof of clearance instead of GEOMETRY's arithmetic. That is the
§46 discipline applied to a geometric argument: don't trust the calculation that chose the camera,
make the frame testify.

### 60.3 The ROI ran off the silhouette

The scan projected each station's top onto the flank plane — but **a D-section's flank stops at the
spring line.** The ROI would have sampled **sky** past that point and produced a false band
transition *at the silhouette edge*, corrupting both L2 and L3 in the direction of a pass. Caught
before the capture; the same shape as §53.2's ROI inherited across framings and §55.1's
auto-located sole, both of which produced confirming numbers from a misplaced window.

### 60.4 L2's discriminator did not exist, and was stated before scoring

L2's sealed text specifies **no** discriminator for "carries ≥1 band transition". `loftscore.mjs`
states one up front and dry-tests it on a real frame: **noise floor ≈1.9 L against a 6 L
threshold**, so a flank with no terminator (≈2 L) is cleanly separable from one carrying a band step
(**14–31 L**, measured on `temple`'s columns in §56.6). Proving the instrument's floor on a known
frame *before* the frame under test exists is what makes a null interpretable.

### 60.5 The `guard` cyan contact line is not a kerb modelling error — the brief's hypothesis is disproven

GEOMETRY's own brief proposed "give it real width or bury it in the wall". **Measurement disproves
it:** §24.3 puts the line at **1,692 px on `base` and 0 px on `norim`.** It is the **surface fresnel
in `toon.glsl.js`**; the surface genuinely *is* convex; both gates pass it **correctly**; and no
`rimCurve` / `rimPlanar` value moves it.

So it is SHADING's, the registered lever is `uRimShadowFloorArch` (landed inert at `1d9bd65`), and
its A/B must re-measure `night` — because the 0.55 floor is what carries `night`'s silhouette rims.
A hypothesis in a work order is not a finding, and this one was retired by the cheapest possible
test: a term that goes to zero when the rim is switched off is the rim.


---

## §61 — the temporal bracket is global, a shipped gate is inert, and two ledger entries have the wrong sign

SHADING's `rim4`: six shots the rim gate had never been measured on, seven arms, one boot, tree
`2f99d55` clean, lock released 22:13. Every shot was opened by eye as well as measured.

### 61.1 The bracket is not "combat-shaped". It is global, and it silently rewrites three earlier runs

`norim` was captured first **and again last** on every shot, and pixels where the two duplicates
disagree are excluded before any statistic. The excluded fraction:

| temple | interior | traversal | night | courtyard | combat |
|---|---|---|---|---|---|
| 11.9% | 14.4% | 16.6% | 18.6% | **46.4%** | **46.9%** |

at mean deltas of 13–51 L, with whole 64-px cells differing 4096/4096 on `combat`.

The cost of not bracketing, measured on `traversal`: base FLAT VIS reads **44 unbracketed against 3
bracketed**, and `scroff` reads **432 against 3**.

> Without the bracket, the screen-space gate would have appeared to remove **429 px of artefact
> that it does not remove at all.**

`RESULT-combatrim.md` recorded this hazard as "combat-shaped, not global". **It is global**, and
**every unbracketed rim number in rim1, rim2 and rim3 carries it.** This is the §30 lesson —
measure the null in the same statistic as the claim — arriving as a retroactive correction to three
completed runs rather than as advice.

### 61.2 The screen-space half of the rim gate is inert in both directions, on all six shots

`surfoff` reproduces `gateoff` and `scroff` reproduces `base`, **everywhere**. The surface gate does
~100% of both the artefact removal and the silhouette cost; `rimPlanar [0.04, 0.20, 1.0]` is paying
per-pixel cost for **no measured effect on any of these six frames.**

Decomposing the gate into halves was the whole reason `surfoff`/`scroff` exist rather than
`gateoff` alone — and it found that half of a shipped feature does nothing. A combined toggle would
have shown a working gate and hidden which half was working.

### 61.3 Artefact removal: clear on five of six, and `courtyard`'s "wrong way" reading is retired

| shot | FLAT artefact `gateoff`→`base` | lower ROI |
|---|---|---|
| traversal | 574 → **3** | 571 → **1** |
| night | 281 → **142** | 278 → **142** |
| temple | 90 → **22** | 72 → **5** |
| combat | 982 → **31** | 951 → **0** |
| courtyard | 2 → **1** | 1 → **0** |
| interior | 679 → **3** | 676 → **0** |

`courtyard`'s rim3 reading — that its count "went the wrong way", 6293 → 6602 — was **the loose
criterion counting drifting cloud filaments.** Under the calibrated criterion plus the bracket it is
**2 → 1 px in 921,600.** (rim3's frame no longer exists in any case: `courtyard`'s camera moved in
`9c5edf8`.)

### 61.4 `night` carries a real 142 px residual, and it is the kerb class

It localises to five cells at (224–448, 512–576) — at 4×, the pale tops of a worn kerb/step run
**inside cast shadow**. Same defect as `hero`'s 1,704 px band, produced by the same
`mix(0.55, 1.0, sh)` shadow floor. So `rim4` hands the reopened kerb item (§51.4) **a second frame,
on the very shot `PREREG-kerb` names as the floor's beneficiary** — which is what makes the A/B
non-trivial: the term you would lower to kill the artefact is the term `night`'s silhouette rims
depend on.

### 61.5 One genuine silhouette regression — `temple` — and the fix was withheld

`temple` retains **15.0%** of inked-contour coverage at **56.3%** of the lift, against a
pre-registered regression line of <15%. It is the only shot where the *ungated* baseline was strong
(51.6% at 48.1 L), so the absolute threshold is calibrated there — unlike `traversal`/`night`, where
`gateoff` itself only reached 18.6%/22.5% and the absolute bar does not apply. The frames agree: at
4×, `gateoff` puts a thick continuous white-cyan band round the whole figure and `base` is a thin
intermittent fringe.

`interior`'s 19.5% is **not** a regression — the character's own edge is essentially unchanged and
the difference is floor wash falling inside the mask boundary. Distinguishing those two by opening
the frames is why the number alone was not trusted.

**No fix landed, and the reason is the section's best line.** `surfoff` restores the rim but
restores the artefact with it (90 vs 22; lower 72 vs 5), so full-off is not the fix. `rimSkinExempt`
already ships at 1, so the convexity half is off on skinned geometry, leaving the **magnitude** half
— `TUNE.rimMagExempt`, whose own comment records a measured null against a coarser mask.

> *"I am not shipping a knob its own file says is null on the strength of a different instrument."*

That is one arm, pre-registered, not a guess.

### 61.6 Two dead knobs in the rim's own plumbing

**`uRimGain` never tracks time of day.** `Lighting.js:532` sends `rim: { direction, color, strength }`;
`ToonMaterial.setKeyLight` reads `rim.gain` / `rim.intensity` only — so `A.rimStrength` **has no
consumer**. `_applyAutoLight`'s night ×1.45 is dead too, because `_autoKey` goes false on LIGHTING's
first `setKeyLight`. Measured live: `uRimGain` reads **2.05 at tod 0.02** in two independent runs,
against intended 1.025 day / 1.476 night.

**Do not fix the plumbing alone.** 2.05 was tuned *with the interface already broken*, so wiring
`strength` through halves the daylight rim; `TUNE.rimGain` must be re-bracketed in the same change.
This is §3's clamped-knob shape in a new costume: a value tuned against a broken path is load-bearing
for the broken path.

**`uRimColor` is applied once at boot and never again.** `_setRimColor`'s
`if (this._rimApplied === c) return;` compares **by reference**, and LIGHTING passes the same
`THREE.Color` instance it mutates in place every frame — so the guard always fires after the first
call. Frame evidence rather than source reading: on rim1's `night` the surface term's mean added RGB
is **(20.9, 38.0, 31.5)**, unambiguously cool, where `A.rimColor` at tod 0.02 is `#ff521b`.

A reference-equality guard against a mutated-in-place object is a **cache that can never miss**.

### 61.7 Task #16: two ledger entries have the wrong sign

No single term owns the green suppression: **88.4% of shadow-side energy is albedo-multiplied**, and
sandstone's albedo is G/R **0.483**; the only albedo-free term is the wash at 11.6%, whose own
`#2a3f66` has G/R 1.42 against B/R 3.2. **Green is last because it is poor in both factors.**

Two recorded claims are contradicted by single-stage toggles: turning the split-tone **off** moves
hue 266 → **278**, i.e. *toward* magenta — the split is named as the term making green darkest, and
**the sign is the other way.** Wash off gives 277, also worse. *Reaching for `shadowWash` here will
move the image and make it worse.*

**Correction to this subsection, made when the coordinator acted on it: §8 was already fixed, and
the site that still carried the wrong sign was in `src/render/PostFX.js`.** The sentence above
sent a reader to §8's declaration site to correct something corrected there at **`a216439`
(03:28)** — §8 now records the same toggle, the same 266 → 278, and the same albedo-multiply
attribution. rim4 is therefore an *independent reproduction* of a standing correction, not a new
finding, and that is how it should be quoted.

What the sweep did find still live is a **quotation** of §8's withdrawn sentence, at
`PostFX.js`'s `splitShadowTeal` — the comment an agent reads immediately before turning task
#19's teal blend up. It cited "the term actually making green the darkest channel" as the reason
the blend was worth taking, three lines under its own gains `(0.914, 0.999, 1.265)`, whose G/R is
**1.09**. Now corrected in place, with the lever's *direction* explicitly preserved (turquoise is
G-rich; the corridor model is the evidence, the withdrawn sentence never was).

**The general shape, which is the part worth carrying:** a retraction lands at its declaration
site, and the *citations* of it do not move. Grepping for the corrected claim finds the fixed
site and reports success; only grepping for the **words of the withdrawn sentence** finds the
copies. §7 already records "when a bug has a shape, grep for the shape" — this is the same rule
for prose, and a quoted claim in a `TUNE` comment is worse than one in the ledger, because it sits
where the knob is.

The registered **≤226° acceptance is not reachable with these levers** — the strongest combination
lands at frame-predicted 233/247/237. Either the levers are insufficient or the model→frame offset
(+8/+23/+24, calibrated at one operating point) is not constant in hue. One `bmix05` arm settles
which, pre-registered: **>6° from prediction and the whole table is withdrawn.**

> ### WITHDRAWN, in full, and the withdrawal is the finding. The table above models a tree that shipped its fix 23 hours earlier.
>
> **`t16f.mjs`'s constant block reads `shadowBounceMix: 0.20` and has no `shadowTeal` at all. The
> tree ships `0.05` + `shadowTeal 0.15`, landed in `07fe98c` at 2026-08-01 23:13.** Every
> "shipped"/"base" row above — the 266 base, the toggle table, the candidate ladder, the ruling
> that 226 is unreachable — is computed at the **pre-fix** operating point. So is the evidence:
> `shots/eye1` stamps **commit `6f1d1f4`, captured 2026-08-01 20:26**, also before the fix. The
> model agreeing with those frames is therefore not a validation of anything shipped — *both
> sides of that validation predate the change.*
>
> **Measured on the shipped tree instead of modelled** (`framehue.mjs` over rim4's `base` frames,
> tree `2f99d55`, post-fix; architecture masks; character excluded; shadow split L<90):
>
> | shot | material | px | shadow hue p50 | G-darkest | sat p50 |
> |---|---|---|---|---|---|
> | temple | `column_papyrus` | 426k | **213** | 5.0% | 0.26 |
> | temple | `sandstone_block` | 56k | **224** | 17.7% | 0.34 |
> | night | `sandstone_worn` | 127k | **226** | 6.5% | 0.79 |
> | night | `sandstone_block` | 153k | **226** | 4.7% | 0.78 |
> | night | `paving_courtyard` | 100k | **223** | 5.3% | 0.74 |
> | interior | `hieroglyph_wall` | 108k | **215** | 7.8% | 0.28 |
> | interior | `granite_pink` | 348k | **227** | 19.8% | 0.45 |
>
> Against a registered acceptance of **≤226° with G ≥ R at comparable saturation**: every large
> population lands **213–227**, G-darkest runs **5–20%** where the pre-fix record has 90–99%, and
> **`night` — the falsifier the coordinator required first — sits at 223–226 inside §2.2's
> [215, 235] violet-blue band with saturation RISING to 0.74–0.79**, not collapsing to grey as
> the interlock note warned. The one material over the line is `granite_pink` at 227, by 1°.
> Controlled against rim contamination: the same statistic on the `norim` arm reads 227 / 213 /
> 227 against base's 226 / 213 / 227 — the cool rim moves the shadow median by ≤1°, so this is
> the shading chain, not the rim.
>
> **Day mood, the acceptance's other half, from the same frames' lit split (L>140):** `temple`
> `sandstone_block` **24°**, `sandstone_worn` **27°**, `column_papyrus` **34°**; `interior`
> `granite_pink` **30°**, `hieroglyph_wall` **34°**. Warm, and inside the 18–35° band the
> coordinator's own attribution note quotes for authored albedo — so the shadow move did not
> come out of the lit side, and §2.2's warm/cool tension is intact rather than traded. `night`'s
> lit population is 275–331 px and is not evidence in either direction; its verdict is the
> shadow row above.
>
> **One leg of the acceptance is NOT re-verified here, and saying which is the point.** "≤226°
> *at comparable saturation*" is a ratio against the pre-fix state, and no pre-fix frame of
> `temple`/`night`/`interior` exists at these cameras to divide by — `courtyard`'s camera moved
> in `9c5edf8` after the masks were built, so it is excluded outright. The saturation leg rests
> on `t16ab`'s same-shot pair (satP50 0.77–1.10× base) recorded at `TUNE.shadowTeal`, measured on
> `sly-closeup`, not on these three. What this measurement adds is the hue leg, on 100k–426k px
> populations across three shots, plus the channel order: shadow means are 61/72/83, 48/53/69,
> 13/20/43, 44/48/70, 57/67/80 — **G > R on every one**, where the pre-fix signature the task was
> opened on is B-max with R > G.
>
> **The acceptance is met on the shipped tree, and `bmix05` is not an arm.** It pokes
> `shadowBounceMix` to 0.05, which *is* the shipped value — the arm would have compared 0.05
> against 0.05 and measured its own noise, and I had it pre-registered as the run that would
> settle the table. `ToonMaterial.TUNE.shadowTeal`'s own comment already recorded the t16ab
> frame verification (worn/block/paving 275/282/261 → 224/226/211); this section contradicted a
> declaration site that was right, four hours later, from a model of the state it replaced.
>
> **The lesson is not "check provenance", which this file says four times already. It is that an
> instrument's CONSTANT BLOCK is provenance.** `t16f.mjs` stamps its tree (`2f99d55`), validates
> its light to 4.69e-5 and its composite against real frame medians, carries a §11 scope
> paragraph — and none of that could see that two numbers transcribed into it by hand had moved
> in `src/`. A transcribed constant is a silent copy of a value someone else owns, and it goes
> stale without changing, without erroring, and without failing any validation the instrument
> performs on itself. Instruments that read `TUNE` from source cannot have this bug; every one
> that retypes it can. Where retyping is unavoidable, diff the block against source at run time
> and print the comparison, the way `rim4` prints its uniform readback rather than its request.

### 61.8 `spec *= sh` confirmed at source, and it is the asymmetry

```glsl
spec = specTint * ( specAmt * specStep * sh * step(0.02, ndl) )   // hard zero in cast shadow
metalEnv … mix(0.35, 1.0, sh)                                     // floored
rim     … mix(0.55, 1.0, sh)                                      // floored
```

**Of the three view-dependent terms, the one that most makes "reads as metal" is the only one with
no shade floor.** Gilded stone in shadow gets diffuse ×0.20, env ×0.35, spec ×0.

The symmetric scaffold is `uSpecShadowFloor`, default 0.0 = bit-identical (`mix(0,1,sh) == sh`).
SHADING has **not sized it and declines to claim it beats the `ef` floor yet**: the honest sizing
splits the non-sunlit gild into `ndl ≤ 0.02` (unreachable by any shade floor) and `ndl > 0.02,
sh ≈ 0` (reachable), and only the second is this lever's population.

### 61.9 The `aokey` re-scope, and two withdrawals

`uAoKey` multiplies only `alb * keyRad * key`, which is ~0 where `key` is ~0, so **any statistic over
the whole gilded mask is near-null by construction whether or not the knob works** — and TEXTURES'
independent 1.4% figure makes that 98.6% of `hero`. The fix is structural, not a threshold tweak:
**add a `keyoff` arm and define the key-lit population by differencing**, exactly as `nosly` defines
the subject mask, then restate span, median and falsifier over that population only. And choose the
verdict frame from an offline key-lit census first — **`hero` cannot answer it in either direction.**

SHADING **withdraws `ef` from the queue** on its own challenge, and states **`aokey` is not ready to
ticket.** Two capture slots given back rather than spent.

A reporting addendum, filed as an addendum rather than a seal edit: V3's "night whole-frame rimPx"
is the wrong statistic, because night's whole-frame rim count is **dominated by the deck/kerb
population the floor is meant to reduce — so lowering the floor scores itself.** Use the character's
contour ring instead; night's baseline is now measured at 22.5% coverage / 33.6 L ungated, 14.1% /
29.7 L shipped.


---

## §62 — an instrument's constant block is provenance, and the falsifier I required could not fire

Two withdrawals from SHADING, both at their declaration sites, both landing while I was drafting a
section that would have duplicated one and contradicted the other. The corrections themselves are
recorded inline at §8 and §61.7; this section records **what they cost me and what they change
about how instruments are built.**

### 62.1 §61.7's entire table is withdrawn — it modelled a tree that had shipped its fix 23 hours earlier

`t16f.mjs`'s constant block reads `shadowBounceMix: 0.20` and carries **no `shadowTeal` at all.**
The tree ships **`0.05` + `shadowTeal 0.15`**, landed in `07fe98c` at 2026-08-01 23:13. So every
"shipped"/"base" row in §61.7 — the 266 base, the toggle table, the candidate ladder, and the
ruling that ≤226° is unreachable — is computed at the **pre-fix operating point.**

The evidence was pre-fix too: `shots/eye1` stamps `6f1d1f4`, captured 2026-08-01 20:26. **Both
sides of that validation predate the change**, which is why agreement between them proved nothing
about anything shipped.

Measured on the shipped tree instead (`framehue.mjs` over rim4's `base` frames at `2f99d55`,
architecture masks, character excluded): every large population lands **213–227°**, G-darkest runs
**5–20%** where the pre-fix record shows 90–99%, and **`night` sits at 223–226° inside §2.2's
[215, 235] band with saturation *rising* to 0.74–0.79** rather than collapsing to grey as the
interlock warned. One material is over the line — `granite_pink` at 227°, by one degree. Controlled
against rim contamination: the `norim` arm reads within ≤1° of `base`, so this is the shading chain
and not the rim.

**The registered acceptance is met on the shipped tree.** The line was closed before the section
declaring it unreachable was written.

### 62.2 The falsifier I required could not fire

I asked for `bmix05` as the arm that would settle the table. **`bmix05` pokes `shadowBounceMix` to
0.05, which is the shipped value** — the arm would have compared 0.05 against 0.05 and measured its
own noise, then reported a null indistinguishable from "the lever does nothing".

That is §52.1's collapsed-arm failure with one difference that makes it worse: there, the collapse
came from a clamp nobody had read. Here **the arm was collapsed by the shipped state itself**, and
the check that would have caught it is the one this ledger has demanded five times — *ask what the
instrument reads in the state you have not created yet.* I required the falsifier; I did not ask
what it would read if the fix were already in.

### 62.3 The lesson is not "check provenance". It is that a transcribed constant is provenance

`t16f.mjs` is not a careless instrument. It **stamps its tree** (`2f99d55`), validates its light
against a live `uShadowColor` readback to **4.69e-5**, checks its composite against real frame
medians, and carries a §11 scope paragraph. None of that could see that **two numbers typed into it
by hand had moved in `src/`.**

> A transcribed constant is a silent copy of a value someone else owns. It goes stale **without
> changing, without erroring, and without failing any validation the instrument performs on
> itself** — because every one of those checks is internally consistent with the wrong number.

**Instruments that read `TUNE` from source cannot have this bug; every instrument that retypes it
can.** Where retyping is unavoidable, diff the block against source at run time and print the
comparison — the way `rim4` prints its uniform *readback* rather than its request, and the way
`compositecheck.mjs` was hardened in §17 after it drifted one revision.

This is the fifth member of the "number without its definition travelling with it" family (§34,
§48.3, §56.1, §58.3), and the first where the number had a perfectly good definition and simply
stopped matching the thing it named.

### 62.4 What survives, and one rule worth keeping

Standing after both withdrawals: the **albedo multiply** is the mechanism (88.4% of shadow-side
radiance, sandstone's linear G/R 0.483); `shadowWash` is the wrong lever; the PostFX citation fix at
`c3a4cfa` rests on the corridor model rather than the withdrawn sentence; and the teal blend keeps
its **direction** while losing its **justification**.

And the rule SHADING extracted from its own confusion, which I had recorded backwards in §61.7:

> **Name the statistic before quoting a sign.** "Makes green the darkest channel" is
> `argmin(R,G,B)`; "266° → 278°" is an angle. A leg that raises B moves *both at once* — hue
> rotates toward blue **and** B climbs past G — so "the opposite direction" was a category
> difference, not a contradiction, and it caught both writers. Measured with the ordering statistic
> itself, green is already darkest in the scene-linear composite before the grade exists, and the
> split moves it *out* of last place in the single cell where it matters at all.

### 62.5 The ledger already contained this answer, measured, sixteen sections earlier — and §61.7 contradicted it without noticing

**§45 closed the shadow-hue line at 20:35, on frames, two hours before §61.7 reopened it from a
model.** It says it in the section title: *"the shadow-hue line closes — measured, not fixed."* It
retires the same stale 274/282/261 hues, for the same reason (`bounceMix` + `shadowTeal` shipped
mid-session), and it states the same consequence — *"the pre-registered lever arms are moot"*.
§61.7 then ruled the acceptance unreachable and pre-registered `bmix05` as the arm that would
settle it. **Both of those were already answered, in this file, by a section I did not read.**

So §62.1's provenance finding is real but is the *second* discovery of it, and the instrument
guard is worth keeping for the next transcription rather than for this question. The honest
credit: §45 got there first, cheaper, and by asking the better question — whether the frame it
needed already existed.

**The two measurements are independent and they agree**, which is the one thing §45 could not
give itself:

| shot | §45 — `tx8` `671dd39`, ROI crops (`dhscore.mjs`) | §62 — `rim4` `2f99d55`, arch masks (`framehue.mjs`) | Δ |
|---|---|---|---|
| `temple` | 211.4° | 213° (`column_papyrus`, 426k px) | **1.6°** |
| `interior` | 226.7° | 227° (`granite_pink`, 348k px) | **0.3°** |
| `night` | *declined as unnecessary* | **223–226°**, sat 0.74–0.79, G > R | — |

Different capture sets, different trees, different framings, different instruments — hand-placed
ROIs against material masks — landing within 2° on both shared shots. Neither was built to check
the other, which is what makes the agreement worth more than either number.

**What this pass adds is the leg §45 waived.** §45 argued `night` "never needed re-measuring — it
was a regression guard for a fix that is not happening". That is sound reasoning and it is still
an *assumption*: the coordinator's acceptance names night first precisely because night is what
the cool terms pay for. It is now measured — 223/226/226 across three materials and 380k px,
inside §2.2's [215, 235] band, with saturation **rising** to 0.74–0.79 rather than collapsing —
at zero capture cost, off frames that already existed. A waived guard and a discharged guard are
not the same evidence, and the difference cost nothing to close.

**The rule, and it is cheaper than every instrument in this section.** *Before writing a ruling
into this file, grep this file for the thing being ruled on.* This ledger is 5,000 lines and its
own §45 answered §61.7's question with better evidence; the search that would have found it is
`grep -n "shadow.*hue" KNOWN_ISSUES.md`, which costs one second and which I did not run. Every
guard in §62.3 protects against a constant going stale. Nothing protects against not reading, and
on this occasion that was the more expensive failure — it produced a wrong ruling, a
pre-registered capture arm that could not have measured anything, and a task routed to two agents
on a question that was already closed.


---

## §63 — a control that a working mechanism and a broken one both pass, and two pixels that stopped being landmarks

FX, on `det3`'s first boot and on re-verifying §55 against `cap9`.

### 63.1 The latch control is clean, and clean means nothing on this shot

Boot A: `sparkles latched=17 fresh=17`, `focus=[0,0,30]`; transients `smoke 220 · spark 586`; every
looping pool (`sandLow` 460, `sandHigh` 900, `airMotes` 1000, `shimmer` 90, `motes` 900) **pinned at
its cap**.

FX first checked the control was not vacuous *by shared input* — the probe re-reads `focus` from
`movement.position` at probe time and re-runs the collision query itself, so a stale latch would
disagree. It doesn't. **Then it found the control is vacuous for a different reason, and recorded
that before boot B exists.**

`Shots.js:369` stages `sly-profile`'s player at `[0, 0, 30]` — *exactly the spawn point*. The
pre-staging and staged positions are identical, so **there is no displacement for the latch to be
stale across**, and `latched == fresh` is what a working latch and a broken one would **both**
produce.

> **`sly-profile` is the weakest possible shot for the mechanism §55.5 named.** Boot A's clean
> control is not exoneration. Testing the latch needs a shot staged far from spawn — `hero`,
> `traversal`, `temple`.

This is the standing *"what does it read in the state you have not created yet"* check applied to a
**control** rather than a metric — and applied to a result that had already come back **in FX's
favour**, which is the harder direction by far.

Pre-registered before boot B, with the population narrowed from the dump rather than the code: only
the two **non-looping** pools can vary with boot history, since the looping ones have no room to
differ by 31 and `LightShafts` was eliminated free in §55.5.

- `sparkles ≠ 17` → latch implicated **without** displacement;
- `sparkles = 17` **and** transients differ by 31 → latch falsified for this delta;
- nothing differs by 31 → **it is not in `src/fx` at all**, and the census is the elimination handed
  back to CHARACTER.

### 63.2 Two of §55.4's reference pixels are dead, and the survey is why that was caught

Re-measured on `cap9` (`5c17500`, clean): floor under the boots **R/B 0.68** against **genuinely
sunlit floor in the same frame at 2.74** — a **4.0× separation**. §55.4's routing stands unchanged:
a contact term keyed off direct light does nothing there, and **AO remains the only possible source
of darkening**, exactly where SHADING's +0.6 L ceiling bites.

**But two coordinates did not survive.** §55.4's "sunlit floor" references — 2.47 and 2.38 — now
read **0.57 and 0.64. Cool.** The corridor has not vanished: a warm-pixel survey finds **9.27% of
frame above R/B 1.5**, and the frame plainly shows sunlit floor to his frame-right. Those two
*pixels* are simply no longer in it, because §39 relocated every `Bag`-placed prop and changed what
occludes what.

> **A fixed pixel is not a landmark when the world moves under it.** FX would have reported a
> spurious *"the sun went away"* had it trusted the coordinates instead of surveying the population
> and opening the frame.

§55.4's table is struck at its declaration site. **Do not re-quote 2.47 or 2.38** — use 2.74 or
re-survey. §53.2's inherited-ROI failure in its most compact form: there the window moved between
framings; here the world moved beneath a window that stayed put.

### 63.3 Coordinator decision: the feet are NOT re-staged before pass 6

§55.4 left this open — re-stage `sly-closeup`'s feet into direct key (a `Shots.js` one-liner, my
file) or specify the contact term against ambient. FX reports the lit corridor is a short lateral
move frame-right, matching §24.5's "+2 m of x", and genuinely sunlit.

**Decision: do not move it before the pass-6 capture.** Recorded so it can be overturned on evidence
rather than re-argued:

1. It is a **composition change to a canonical shot**, unverified, landing immediately before a
   blind critic capture. §17 is exact: *a change that moves a shipped look, arriving as a
   correctness fix, is a change wearing a fix's clothes.*
2. **The critic is the right instrument for the question underneath it.** If pass 6 reports the
   subject reading flat or unlit, that is independent evidence for the re-stage, obtained without my
   guessing. If it does not, the move was cosmetic and the term must be specified against ambient
   regardless.
3. The contact term already built derives from **depth geometry, not light**, and composites on the
   AO path — so it should survive an unlit floor. That is a prediction on the record, and
   re-staging would remove the frame that tests it.

Deferred, not declined.


---

## §64 — the guard closed the reading window and not the staging window, and I reopened a line I had closed myself

### 64.1 `ee9c23a` swept 45 unnamed lines *through* the guard that exists to stop exactly that

The commit added **152 lines**; its message named roughly 110 — GEOMETRY's budget-table note,
SHADING's two additions to §62, and my §63. The remaining ~45 were SHADING's **§62.5**, written
between the moment `preappend.sh` printed its diff and the moment I ran `git add`.

> **The guard protects the instant you READ. Staging happens later, and anything written in the gap
> rides in anyway.**

Third distinct version of one failure in a session: §14.8 (staged a shared file by name without
reading it), §14.9 (ran the check and hardcoded its verdict), §64.1 (ran the check, honoured it, and
was overtaken between check and stage). **Each fix was correct and each left a window open one step
further along.**

Closed with `tools/preappend.sh --verify`: the check stamps the file's byte length and prefix hash,
and `--verify` re-hashes that prefix immediately before `git add`, refusing if anything moved
beneath the append. **My first implementation of it was wrong in a way worth recording** — it
compared the **index** copy, which an unstaged foreign write never touches, so it would have passed
every real instance of the bug. Rewritten against the working tree and **proved on both inputs
before being trusted**: exit 0 with only my own append present, exit 1 with a foreign edit injected
into the prefix.

### 64.2 §45 had already closed the line, on frames, two hours before §61.7 reopened it from a model

**Mine, and the more expensive of the two.** SHADING found it: §45 closed the shadow-hue line at
20:35 **on frames** — it says so in its own title, retires the same stale hues for the same reason,
and states the same consequence, *"the pre-registered lever arms are moot."* §61.7 then ruled the
acceptance unreachable and pre-registered `bmix05` as the arm that would settle it. **Both were
already answered, in this file, by a section I did not read.**

§62.1's provenance finding is real and worth keeping for the next transcription — but it is the
**second** discovery. §45 got there first, cheaper, and by asking the better question: *whether the
frame it needed already existed.*

Cost of not looking: a wrong ruling written into the ledger, a capture arm pre-registered that could
not have measured anything, and a task routed to two agents on a closed question.

> **Before writing a ruling into this file, grep this file for the thing being ruled on.** The
> search that would have found it costs one second. Every guard in §62.3 protects against a constant
> going stale; **nothing protects against not reading.**

What redeems the duplication: the two measurements are **independent and agree** — hand-placed ROI
crops on `tx8` `671dd39` against material masks on `rim4` `2f99d55`, `temple` 211.4° vs 213°
(**1.6°**) and `interior` 226.7° vs 227° (**0.3°**). Neither was built to check the other. And §62
discharges the leg §45 **waived**: `night` measured across three materials and 380k px, inside
§2.2's band, saturation *rising* rather than collapsing, at zero capture cost. **A waived guard and
a discharged guard are not the same evidence.**

### 64.3 A silent no-op caught before it spent the lock — the trap is an asymmetry inside one renderer

`kerb2`'s predecessor poked `sh.tune.rimShadowFloorArch`. **`ToonMaterial.update()` never
republishes rim uniforms** — `this.tune = TUNE` is the object the uniforms were *initialised* from.
All four floor arms would have rendered at **0.55** while the log printed four distinct floors.

`PostFX` is the **opposite**: it re-reads `tune` every frame, which is why the contact term's A/B is
a live poke. Two modules in the same renderer, opposite conventions, and the poke that is correct
for one is a silent null for the other. `kerb2` now pokes **both** sites and reads back **after** the
step, from the uniform that rendered the frame.

> **A convention is a property of the module, not of the codebase** — and the arm that works next
> door is the most convincing wrong answer available.

### 64.4 GEOMETRY corrects §56.2's control: two slabs against a loft that replaced three

Caught by this guard's fourth refusal, while GEOMETRY was applying §56.2's table to
`PropKit.js:393`. **Arm A was built from two `chunkAt` slabs; the loft replaced three.**
`Statues.js` says so beside the `loft()` call — *"body: haunch, barrel and chest as ONE lofted
mass"* — its stations span z −2.18…1.26, and the pre-loft chest slab is absent from the shipped
sphinx. Loft and stations landed in **one** commit (`d542055`), so the loft did not grow after the
measurement; the control simply omitted a slab.

Adding it **raises the baseline** — a third chamfered slab brings its own bevel clusters — so the
margin **shrinks from +29.0 to +25.0 points body-only**. Direction and magnitude of the conclusion
are unchanged, and **`belly`'s +7.6 is untouched**, because that is B against C, loft against loft,
with no control population in it.

**This is §56.3's own lesson landing on §56.2** — *a number quoted onward without its population
travelling with it* — and the population was recoverable in about a minute from the source comment
next to the knob. I quoted +29.0 twice without asking what arm A contained.

### 64.5 `dunesloft` is complete

`shots/dunesloft/{dunes-canon.png (22:40), dunes-flank.png (22:41), report.json}` — the report 25 KB,
carrying arm 2's raycast hits so the frame testifies to its own clearance rather than resting on
§60.2's arithmetic. **The last shipped-but-unverified `src` change in the project now has its
frames.** Remaining before the pass-6 capture: `det3`'s second boot (holding the lock) and `kerb2`
(the only ticket queued).

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
- **Not yet verified after the rim gate:** `temple`, `interior`, `night`, `traversal`,
  `combat`, `courtyard`. The change is global to the rim term and only four shots were
  measured. `courtyard`'s rim sits mostly on edges rather than grazing floors so the effect
  there should be small, but that is a prediction, not a measurement.
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

  **The general lesson, which is mine.** A narrow measured claim ("`goldSpec` reaches no
  specular term") and a broad architectural one ("there is no specular path") differ by one
  word and by everything. I relayed the second, opened a task on it, and wrote it in here as
  fact. The agent that owns the file checked and refused to implement it.

  **§7.3's "gold needs dark occlusion": the dark base is authored and does not survive to the
  frame. TEXTURES' side is verified correct; the loss is downstream.** `hieroglyph_gilded` is
  **28.7% of `hero`** (corrected `angsize`, keyed on material name), so it decides this line.
  Measured off the built maps, before any lighting — the CPU lab, so no shading term can
  confound it:

  | | albedo luma p5/p50/p95 | AO p5/p50/p95 |
  |---|---|---|
  | `hieroglyph_gilded`, **built texture** | 92 / 166 / 193 | 0.247 / **0.412** / 0.992 |
  | `hieroglyph_gilded`, **in frame** | 162 / 186 / 217 | — / **0.992** / — |
  | `gold_leaf`, built texture | 70 / 130 / 218 | 0.047 / 0.047 / 0.733 |
  | `bronze_aged`, built texture | 76 / 93 / 148 | 0.090 / 0.784 / 0.980 |

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
  definition *and* its pose, or do not quote it.** The pose half of that rule was learned first,
  when a `perch_idle` number was briefly cited as the standing figure; the definition half cost
  a published record. Like-for-like tables are at the `TUNE` block in `src/player/SlyModel.js`.
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
- **`perch_idle` (the `hero` pose) has zero lateral line of action** — hips 0.000, chest 0.006,
  head −0.007. Untouched for lack of capture budget on the money shot, not because it is right.
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

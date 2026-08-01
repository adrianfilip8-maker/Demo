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
- **The cel ramp needs geometry, not shader work.** The 3-band quantiser is correct; the scene
  is boxes and faceted cylinders, so there is almost no smooth normal gradient for it to band.
- **Light shafts have no forward-scatter term, so one gain serves a 7.2× range.** A shaft is
  visible *because* of forward scatter, and `SHAFT_FRAG` (`src/fx/Particles.js`) has no term
  for it: `vViewZ` is depth fade, `vX`/`vS` are cross-section and along-beam, and `vAxial` is a
  billboard degeneracy guard that is symmetric and cannot tell looking into a beam from looking
  away from one. Blade brightness is independent of the camera–sun angle. The ten cameras are
  spread across the whole phase function — `courtyard` at 53° (into the sun), six shots at
  101–157° — and at each shot's own `A.mieG` the Henyey–Geenstein weight ranges **7.2×**, which
  the shader renders flat. Tune the gain until `courtyard` blazes and six frames get a bright
  volume where a real beam would be nearly invisible; tune it the other way and `courtyard`
  gets a seventh of what its geometry asks for. This is a second, independent explanation for
  "the open-air blades measured as drawn and read as absent", alongside the additive-headroom
  argument `SHAFT_FRAG`'s own comment makes. `hgPhase` already exists at `Atmosphere.js:460`
  and is live in `Sky.js:368`, so there is a tested implementation to reuse. Reproduce with
  `node tools/shaftphase.mjs`.

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
- **`dunes` tiling is unverified and its only mitigation is a prediction.** Repeat periods at
  all ten framings are 1.5–9.8 across frame (offline rasterisation, real cameras, real
  resolution); `dunes` runs **6.4–9.2 repeats at 15.3% of frame and has been probed by nobody**.
  §2.3 asserts ≥60% haze coverage makes it moot — that is an assertion. Settle it from
  `evalAtmosphere` at that tod, not from the section.

**Tool caveat — `angsize.mjs` assumes the default `UV_PER_M`.** The four documented consumer
exceptions therefore read wrong in it: the pyramids use `UV_PER_M * 0.25`, making
`limestone_polished`'s `dunes` count ~11–13, not the 44–54 it prints. Apply the correction by
hand or do not quote the number.

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

**Read every prior character critique in that light.** "Pose is stiff / A-pose-like" was a real
observation of a frame nobody intended to render. `idle_confident` *did* have contrapposto
authored; it also failed for a second, independent reason worth knowing — leg angles are
measured against the hips, and the hips were already rolled −12°, so a leg authored at +13°
netted +1° in world and both feet stayed 4 cm apart and vertical.

Still open on the character, honestly scored by the agent that did the work:

- **Proportions improved, not fixed:** 5.53 → 5.29 heads. The head sits on a fixed 1.396 m of
  legs and torso, so the ratio asymptotes to `1.49 + 1.396/headHeight` and no `headScale` gets
  to 1:4.5 without a bobblehead. The real lever is a ~0.10 m shorter torso, which touches ~10
  sites carrying absolute Y coordinates plus three bone positions. Deliberately not attempted;
  it is the next move if the critic keeps failing this line.
- **Eye emissive lift is CPU-verified only.** The re-capture was queued behind other agents for
  32 minutes and the work was reported without it. Check `sly-closeup`, and check `night`
  (`tod 0.02`) where a warmer, brighter eye emissive previously failed as "two yellow dots".
- **Fur improved, not proven at close range.** Arms and legs are still fairly smooth tubes.
- `combat` is still blown to near-white. The pose under it is fixed; the exposure is not the
  character's to fix.
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

The figures were not a tool artefact. They were a *correct measurement of a build that no longer
existed*: triangle count over the same shot went 135,111 → 246,241 between my two runs, because
the reveal, sand-drift and cornice-winding fixes landed in between. **I measured a tree that five
agents were editing live and quoted the result without recording what I had measured** — the
exact provenance failure that made a 25-commit-old PNG look like a live sky bug, and that
`shot.mjs` and `critic.mjs` now stamp against. Offline measurements need the same discipline as
captures: record the SHA and whether the tree was dirty, or the number is unattributable within
minutes.

What was real, and is now fixed: `traversal`'s unclosed cornice ring — the single largest object
in that frame, with 182 px seeing through to sky. A critic pass scored the shot **2** on it.

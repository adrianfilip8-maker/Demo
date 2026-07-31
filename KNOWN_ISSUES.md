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

---

## 4. Guards module still absent

`src/ai/` has a complete supporting library — `GuardModel.js` (`buildGuardAssets()`,
`instantiate()`), `GuardAnim.js` (`GuardAnim` class, full clip set), `Patrol.js` (`ROSTER`,
`ROUTES`, `Route`, `Senses`, `stateForSuspicion`, `speedFor`) — but no module entry point, so
`main.js` reports guards absent and the `guard` canonical shot has no subject.

Needs `src/ai/Guard.js` exporting `Guards`, following the same assembly pattern
`src/world/Props.js` now uses: walk `ROSTER`, `instantiate()` one rig per entry against shared
geometry, drive each with a `GuardAnim` and a `Senses`, and register the vision cone.

Props is done — `src/world/Props.js` landed and assembles the colossi, sphinx avenue, Anubis
pair, gilded Ra, braziers, banners, treasure and collectibles into 12 merged draw calls.

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

All ten shots now put the character's ground contact in frame with ≥50% of his cast shadow
visible, except `guard`, where he is behind the camera on purpose because the guard is the
subject. That exception is documented in place so it is not re-reported.

Four checkers are kept in `tools/` — `camclear.mjs`, `shadowframe.mjs`, `framesweep.mjs`,
`playerplace.mjs`. **None of them boots the renderer**, so they run in about a second where a
capture costs 2–5 minutes. Run `camclear.mjs` after moving any column or camera.

---

## 8. Open handoffs between modules

Recorded so they are not re-derived:

- **The bright cool contact line is still live.** `guard`: `#598aa2` L129 between surfaces at
  L87 and L65. `hero`, on *flat open paving* at x=640, y=330→355: `#9ba7b2` L165 and `#c2bdc5`
  L190 between warm stone at L133–156. Eliminated so far: AO sign error, the rim pass, the
  albedo authoring (every masonry joint verified darker and lower; the build-time crevice
  assertion fired zero times across four captures), and kerb geometry (the `hero` measurement
  is on open floor with no junction). It is added downstream of both textures and geometry.
  The informative asymmetry: bright **and cool** against warm surroundings — a band that lost
  its key would be dark and cool, a band that wrongly lost its shadow would be bright and warm.
- **Dune ripple "chips":** the 3-band ramp plus the rim term quantise a smooth ~30 cm ripple
  normal into hard bluish quadrilaterals. Slope is now 4.3× shallower than pass 2 and the
  artefact scales with it but does not go. Belongs to SHADING; it cannot be fixed from inside
  `src/textures/` without deleting the ripples Terrain asks for.
- **Stone mean albedo is 4–5% darker family-wide** (granite −13%) since the grime film landed.
  If LIGHTING wants it back, the lever is `ashlar`'s `tone`, not the grime.
- **The cel ramp needs geometry, not shader work.** The 3-band quantiser is correct; the scene
  is boxes and faceted cylinders, so there is almost no smooth normal gradient for it to band.

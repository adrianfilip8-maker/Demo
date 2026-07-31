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

**Still open, and now the real gap:** the shadows are placed correctly but they are rendered as a
darker, *more saturated* version of the sunlit hue (lit ground `rgb(0.52, 0.26, 0.16)` vs
shadowed `rgb(0.28, 0.08, 0.06)` — the shadow's red/green ratio is 3.6 against the lit side's
2.0), so they read as a patch of different stone rather than as shadow. `AGENTS.md §2.2` wants
violet-teal. That is the `shadowBounceMix` / `shadowSat` / `shadowWash` bracket in §3 below, not
a shadow-system problem — but it is why the frame still does not *look* like a 22° sun.

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

## 3. Warm/cool balance is bracketed but not settled

`PAL.shadowBounceMix` in `ToonMaterial.js` controls how much warm sand bounce mixes into the
shadow light. Both failure modes are established by capture:

- `0.00` — warm albedo multiplied by pure blue sky; every shaded face goes mauve
- `0.45` — cool removed entirely; frame turns monochrome orange, losing §2.3's warm/cool tension

Currently `0.20`. It is defensible but was not itself A/B'd against neighbours; worth a sweep
once shadows work, since real shadows will change what the right value is.

**Now measurable, because §1 established the shadows are real.** Sampling the hero frame at
ground-plane normals and splitting on the debug shadow mask: lit ground is
`rgb(0.522, 0.262, 0.164)` and shadowed ground is `rgb(0.282, 0.079, 0.058)`. The value step is
fine (2.6:1) — the *hue* is the problem. Red/green is `1.99` on the lit side and `3.57` in
shadow, i.e. the shadow is a more saturated version of the same orange, which is the opposite of
§2.2's violet-teal and is why a correctly-placed cast shadow still reads as a patch of different
stone. Three knobs push on this and they interact: `PAL.shadowBounceMix` (warmth mixed into the
shadow light), `TUNE.shadowSat` (`0.34`, an albedo *saturation boost* inside shadow that is
actively fighting the cool tint), and `TUNE.shadowWash` (`0.16`, the unmultiplied additive term
that is the only part carrying hue independent of the warm albedo). Sweep them together against
the numbers above rather than one at a time by eye.

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

## 6. The critic loop has never run a scoring pass

`tools/critic.mjs` and `tools/CRITIC.md` are built and working, but no adversarial review
pass has actually scored the ten canonical shots against the §7.3 fail-list. Everything above
is my own assessment, not a critic's.

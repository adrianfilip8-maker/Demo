# Known issues

State as of the last session. Written so the next person doesn't re-derive what's already
been eliminated — on this container a single capture takes 2–5 minutes, so each ruled-out
hypothesis below cost real time.

---

## 1. No cast shadows in any shot — **unresolved, highest-value fix**

Under a 22° golden-hour sun the courtyard should be crossed by long raking shadows. There are
none, anywhere. This is the single biggest remaining gap to the AAA bar: raking shadows are
most of what sells a low-sun read, and `AGENTS.md §7.3` depends on them for form.

**The measured symptom.** `shading.debugShadow(true)` paints red=shadow term, green=receiveShadow,
blue=N·L. The shadow term reads **≈0 across essentially the whole frame** — everything is
reported as fully occluded. Because the toon shader computes `key = ramp * sh`, that cancels
the directional light entirely. This is why the bug presents as *flat ambient-only lighting*
rather than as a missing-shadow bug, and it is why the colour cast was so hard to tune: the
shadow term had swallowed the key light.

**Ruled out — each measured at runtime, don't redo any of these:**

- Geometry flags. Now 312 of 328 meshes cast+receive (`main.js` sweeps them centrally).
  Previously 60 of 301, which was a real bug but not this one.
- Light config. Cascade 0: `intensity 3.30`, `castShadow true`, `2048×2048` map, `bias −5.4e−4`.
- Cascade fitting. `_fitCascades()` runs per frame; c0 fits to `±29.8` ortho, `near 0.05 /
  far 111.3`, positioned at `(−77, 37, −6)`. Sane and it comfortably contains the courtyard.
- Cascade splits. `csmSplits = [[−10000, 34.1], [34.1, 1000000]]` — correct, and the hero
  camera sits ~28 m from its subject so the frame resolves to cascade 0 as intended.
- Cascade selection reaching the shader. Confirmed `CSM_CASCADES` is defined in the compiled
  program (`toon_sand`), so `csmShadow()` — not the cascade-naive `getShadowMask()` — is the
  function actually running. Switching the toon shader to `csmShadow()` was a genuine fix
  (`getShadowMask()` multiplies all cascades, which is wrong for CSM) but did not change this.
- Material adoption timing. LIGHTING adopted materials only every 20 frames while a capture
  steps ~17; now forced at boot. Real bug, not this one.
- Shadow map type. `VSMShadowMap` → `PCFSoftShadowMap`. Changed nothing; kept because PCF is
  the more robust choice here regardless.
- Normal-pass corruption. three.js uses `scene.overrideMaterial` for shadow-map rendering too,
  so PostFX's normal pass was re-rendering every cascade map with `MeshNormalMaterial`. Now
  frozen across that pass. Real bug, correctly fixed — and still not sufficient.

**Unexplained signal worth starting from.** The runtime reports
`renderer.shadowMap.type === 1` (`PCFShadowMap`) even though `Engine.js` sets
`PCFSoftShadowMap` (`2`) and nothing else in `src/` touches it. Something is changing shadow
state after construction. That matters because a shader compiled for one shadow type reading a
map rendered for another produces exactly this symptom — a uniformly zero shadow term. Find
what resets it before looking anywhere else.

Second candidate: dump cascade 0's shadow map to a quad on screen. If it is blank or garbage
the fault is in the shadow render; if it looks like a correct depth map the fault is in the
lookup (matrix, bias, or sampler type).

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

## 5. One shader still fails to link

Every capture logs a single `THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false`.
The frame renders, so it is not on the critical path, but it has not been identified. Worth
capturing with `--verbose` and reading the full program log.

---

## 6. The critic loop has never run a scoring pass

`tools/critic.mjs` and `tools/CRITIC.md` are built and working, but no adversarial review
pass has actually scored the ten canonical shots against the §7.3 fail-list. Everything above
is my own assessment, not a critic's.

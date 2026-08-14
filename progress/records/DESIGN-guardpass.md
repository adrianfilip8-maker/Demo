# DESIGN-guardpass — critic family #3 (r11 #3 / r12 #3): the guards' first dedicated art pass

**Lane:** GUARDS. **Date:** 2026-08-14. **Parents:** RESULT-critic12 family 3 (guards the 2.5
floor, "raw KayKit mannequins outside the art pipeline… untextured, outline-less, cel-less white
figures in SIX frames" — kaykit, hero, temple, traversal, night, guard), RESULT-critic11 family 3
(guard 2, "cone rebuild (real volumetric cone)"), §291 (the guardfix vertex-colour history),
§301–§303 (the carried torch and localToon), task #14 / d526dd8 (guard cone night grade —
SHIPPED; see §Cone, "what stays").

Two seals come out of this note, registered separately per the lane brief:
`PREREG-guardart.md` (A — the bodies into the art pipeline) and `PREREG-guardcone.md`
(B — the patrol cone as a real volume). One shared one-boot runner
(`progress/records/guardpass/guardpass.mjs`), two independent scorers, gradetrio's
no-install chassis (all mechanisms inert in HEAD, pin-tested).

## What is actually broken (measured before design, per §291's lesson)

The critics' "raw KayKit mannequins" are not KayKit and are not outside the material pipeline.
`Guards._buildMaterials` already routes both garrison materials through `shading.toon()`
(bands 3, rim, vertexColors:true, outline 1.0) and `_applyOutlines` shells every guard. What
the six frames show is three concrete defects downstream of that, all verified headless today
(probe: scratchpad `carmprobe.mjs`, re-run against
`public/assets/sly-anim/carmelita-guard.glb` + `bindToRig3` at HEAD):

1. **The bodies are white because the §291 fix could only make them white.** The Carmelita
   merge deletes every attribute but position/normal/uv/skin (CarmelitaGuard.js:252), §291
   then synthesizes `color` = identity, so all nine humanoid guards render
   `linen_cloth × [1,1,1]` — a paper-white figure. The §2.2 palette the procedural bodies
   carried in their vertex colours (GuardModel PAL: linen/lapis/bronze/fur) never survived the
   geometry swap. The channel is alive and waiting (§291's contract): painting it is the fix.
   UVs are REAL (probe: range 0.014–0.993, zero exact-zero pairs), so the cloth map and
   normal detail already work.
2. **The head/chest block wears the bronze-metal material.** The merge's group 1
   (`HEAD_MESHES`: Head_LP, Hair_LP, Scrunchy2, BustRetopo, teeth/eyes — 11,831 of 20,950
   verts) draws with `guard_metal`: no albedo map, metal 0.85 (diffuse ×0.32), gloss 110.
   That is the dark glossy head/chest with white spec in `guard.crop` — a lacquered mannequin
   torso, not clothing.
3. **Every Carmelita skinIndex reads one bone early — a real off-by-one.**
   `bindToRig3` builds `boneIndex` over `RIG3.BONE_ORDER.filter(used)` WITHOUT `root`
   (CarmelitaGuard.js:178-179); `GuardModel.instantiate` builds its `Skeleton` as
   `['root', ...skeleton]` (GuardModel.js:1892). Measured through both conventions
   (carmprobe): crown vertices carry index 4 = `head` in the import's space but
   `instantiate` reads bones[4] = **neck**; hands read **lowerArm**; hips read **root**
   (which never animates); toes read foot, foot reads lowerLeg. At bind pose this is
   invisible (Σw·B·B⁻¹·v = v regardless of which bone), which is why §241's structural
   suite could pass — under ANY animated pose every joint pulls the wrong ring of flesh.
   The hunched, collapsed stance in all six frames is this defect, not the clips
   (GUARD_CLIPS drive bones by NAME, correctly). This is §291's channel-contract rule again,
   one attribute over: the geometry source and the skeleton consumer disagreed about index 0,
   and the sanitizer's keep-list was only half the contract.

Outlines: mechanically present in code (shells built per guard, ink weights filled); the
runner's live probe records shell presence/visibility per guard rather than assuming it, and
the (A) seal carries a structural bar on it.

## A — the bodies into the art pipeline (PREREG-guardart)

Mechanism, all inert in HEAD (`TUNE.guardArt: 0`, `TUNE.guardSkin: 0`, pin-tested):

- `CarmelitaGuard.bindToRig3` additionally returns `regions` — per-source-mesh
  `{name, group, start, count}` in merged-vertex space (pure metadata; nothing in the HEAD
  path reads it). The probe already reproduced these ranges externally; recording them at the
  merge makes the paint self-describing instead of offset arithmetic in a second file.
- `Guards.applyArt()` (called once at init, re-callable; reads `TUNE.guardArt/guardSkin`):
  - `guardSkin 1` ⇒ `shiftGuardSkin(geo, true)`: +1 on every skinIndex of the shared
    Carmelita geometry (exactly reversible; integers; flagged in `geometry.userData`).
    At 0 and no flag: nothing touched — bit-identical HEAD.
  - `guardArt 1` ⇒ `paintGuardRegions(geo, regions, GUARD_DRESS)`: writes the §2.2 palette
    into the vertex-colour channel per region with ±5.5% deterministic tone jitter
    (GuardModel `TUNE.colorJitter` parity; §7.3 "flat vertex colour" rule), swaps every
    humanoid guard's material array to `[body, body]` (the head block stops being bronze
    lacquer; two draws per guard unchanged), and ensures the ink shell exists (bookkept, so
    restore removes only what it added). At 0: fill(1) only if previously painted — an
    unpainted boot never touches the attribute.

**The dress (derivation, §2.2 + GuardModel PAL — the garrison keeps the palette the
procedural bodies were authored in):** body group — Coat/MainBody `linen #f0e3c8`
(LIMESTONE light), Stomach `linenShade #d4c19a`, Legs/Hand `furMid #8a5a38` (SANDSTONE
dark: "a desert jackal, not a black one"), Shoes `leather #6b4526`, Tail `furDark #4a2f22`,
Collar `gold #e8b942` (the wesekh — the hero read of buildCollar, kept), Buckles/Badge/Zip
`bronze #b07a3c`, Antennae/Barrel `bronzeDark #6d4a22`; head group — Head `furMid`,
Bust `linen`, **Hair `lapis #1f4f96`** (the nemes read: the one large blue mass §2.2 gives a
guard), Scrunchy `gold`, Tongue `muzzle #2a2018`, Teeth `eyeWhite ×0.8`, Irises `ink`,
Eyeshine `eyeWhite`. Bronze/lapis accents on warm linen, per the brief. Both humanoid types
share the merged geometry, so the garrison dresses uniformly — recorded as accepted (a
per-type tint would need a second geometry clone and is not this seal).

Verify (sealed, one boot, poke/restore per §302's same-boot rule): per-shot off/on/back with
back-validity [0,0]; structural probe bars (toon material live, shell present, crown
skinIndex reads `neck` at off and `head` at on — the defect and the fix both measured live);
palette-membership, banded-histogram, ink-ring and rim bars on the `guard` subject bbox;
distance palette bar on kaykit; strict [0,0] protections on every shot the probe shows no
guard in, containment caps where guards are visible. LOOK gate binding. Full bar table in
the PREREG.

## B — the patrol cone as a real volume (PREREG-guardcone)

What the `guard` frame shows at 2.5: a 68°-wide (VISION.temple halfAngle 0.60), 15 m
additive cone seen side-on from inside its throw — `clamp(a, 0, 4)` premultiplied over lit
stone burns the left half of the frame to white; no source, no boundary, ±16% sine "dust",
and nothing in the world is actually lit by it (the carried-torch handle IS the cone's light
— `_registerLights`/`_updateSpill`, one `addLocalLight` per humanoid, nearest-to-camera
enabled — but §303's localToon term consumes point lights only UNDERGROUND
(`slyLocalY < -0.5`, toon.glsl.js:790), so above ground the beam hangs over pavement it
cannot illuminate, including the guard holding it. Same handle, gated off — question in the
brief answered).

Candidate, inert in HEAD behind one master gate (`TUNE.coneShape: 0` ⇒ `uConeShape` 0 ⇒ the
legacy branch, spelled byte-identical to today's shader text):

- **Colour + falloff:** `colPatrol #fff0c2 → #ffd9a0` (§2.2 KEY sun — the "warm yellow");
  in-branch saturation-deepening down the length (`tint → tint²/max` mix by `t·uConeGrad`),
  so the shaft cools from lamp-cream at the apex toward the §2.2 sand-GI family at the tip —
  and at night the same arithmetic deepens task #14's shipped cool patrol colour instead of
  re-warming it (the gradient is hue-family-preserving by construction; d526dd8's
  colNight/beamNight/nightLo/nightHi are NOT touched).
- **Form:** rendered shell narrowed to `beamCoreScale 0.62` of the sensed half-angle (the
  POOL keeps the exact half-angle — the wedge on the pavement stays the honest gameplay
  telegraph; the bright volume stops being wider than the frame), attenuation 7→13 (the far
  half is carried by the pool), hard cap 4.0→1.30 (a warm shaft can no longer clip to
  white), a boundary-emphasis term (`uConeEdge`) so the cone has an edge the eye can find.
- **Dust:** the ±16% sine pair becomes structured motes (three incommensurable
  angular×length×time bands, ±~45% local) — density inside the volume, not a flat wash.
- **Source:** the apex card (already in the beam's draw call) gets a hot near-white core +
  warm halo (`uGlow 0.34→0.42`, gated core curve) — the tight coloured thing §7.3 wants
  bloom to grab, where today's card is a faint smudge.
- **It lights the guard:** new shared toon uniforms `uGuardLampPos` (xyz world, w =
  radius·gain·window) + `uGuardLampColor`, published per frame by `_updateSpill` for the one
  enabled carried-torch guard, consumed by a branch-untaken term in TOON_SHADE directly
  after §303's localToon block (same cap `SLY_LOCAL_CAP`, lambert, punctual falloff).
  `TUNE.lampToon 0.0` ships inert (w=0 ⇒ untaken). The window
  `1 − smoothstep(_light, 0.26, 0.56)` is EXACTLY 0 for every daylight shot (all ≥0.72
  _light) and for interior (_light 0.90 — §303's sealed tomb instruments never see this
  term), ≈1.0 at guard (_light 0.263) and 1.0 at night (0.10) — the same day-arm shape as
  §221.1/tombdim. The lamp colour is `_colA` post-night-grade ⊕ alert lerp, so it agrees
  with the beam it pretends to be cast by, cool at deep night per task #14.

Files: `src/ai/Guard.js` (TUNE, both shader strings, `_buildCones` uniforms, core scale in
`_updateCones`, lamp publish in `_updateSpill`) + `src/render/ToonMaterial.js` (two shared
uniforms) + `src/render/shaders/toon.glsl.js` (declarations + the gated term). The two
SHADING-side files follow torchlight's precedent (§301–§303: the LIGHTING lane's term in the
same two files, same branch-untaken contract), kept to ~20 lines total.

Verify: same one-boot pattern; cone bars on `guard.bon` (source local-max, warm-hue split
near/far, non-blowout share, boundary-gradient presence, Δ-field dust variance, guard-lit and
pool-lit deltas); protections: night moon ROI [0,0], night hanging-lamp ROI and traversal
sparkle ROI [0,0]-if-disjoint (probe rules), containment caps elsewhere, day-exactness of the
lamp by arithmetic + measured. LOOK gate binding. Task #14 is prior art here, not duplicated:
its night grade stays shipped and its two frames are protection-barred.

## Shared discipline

gradetrio chassis: no install, HEAD is the tree, mechanisms inert + pin-tested
(`tests/guardart.test.mjs`), bars sealed and pushed before any frame, per-shot poke arms with
back-validity only (§302 — no cross-boot bar anywhere), candidates as TUNE/uniform pokes
restored in-arm, fail-closed scorers through `tools/gate.mjs`, `ringPainter` untouched,
launch via `tools/launch.sh` with absolute log + pidfile, FIFO serializes with other lanes,
push before launch (the rollback rule), suite green before every push. Arms per shot:
`off → aon → bon → abon → back` (+ `askin` on `guard` only) = 81 frames, ~2h lock — priced
in the PREREGs.

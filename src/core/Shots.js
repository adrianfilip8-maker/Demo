import * as THREE from 'three';

/**
 * Canonical camera setups (AGENTS.md §7.2).
 *
 * These are the frames the harsh-critic loop judges, so they are FIXED. World coordinates
 * here are a contract: the ARCHITECTURE / TERRAIN / PROPS agents must build the level so
 * that these camera positions frame the thing each shot is named for. See §8.1 of AGENTS.md
 * for the level's coordinate layout.
 *
 * Each shot may specify:
 *   pos, target   camera placement (metres)
 *   fov           vertical FOV in degrees — long lenses compress and read more cinematic
 *   tod           time of day 0..1 (0.5 noon, 0.78 golden hour, 0.02 night)
 *   player        { pos, yaw, pose } — pose is an animation clip name to freeze on
 *   hidePlayer    keep Sly out of a pure-environment frame
 *   roll          camera roll in degrees; a couple of degrees of dutch reads as authored
 *
 * Two things worth checking with arithmetic rather than by eye before changing anything here,
 * because both have already shipped as silent defects in this file:
 *
 *   1. That the camera is not standing inside geometry. `temple` framed from 0.78 m inside a
 *      nave column for its whole life; it renders, so nothing ever complained. The column grid
 *      is nave x ±8 at z -22/-30/-38/-46 and aisle x ±16.5 at z -26/-38.
 *   2. That the staged player is actually in frame and his ground contact with him. `temple`
 *      and `courtyard` both had him below the bottom edge (NDC y -1.97 and -1.21), which the
 *      critic reported as "the character casts no shadow" — the shadow was a symptom, the
 *      character being off-screen was the defect.
 *
 *   3. Which *side* of the character each camera sees, and how many pixels tall he is. Five of
 *      the ten shots used to look at his back, where the cap is a featureless dome with no
 *      brim, ear notch or muzzle — so silhouette work that reads perfectly on a turntable did
 *      nothing for the frames the critic actually scores. `interior` additionally had his face
 *      156° from the key, i.e. unlit.
 *
 * Both are cheap to check off the sun tables in Atmosphere.js and the level layout without
 * booting the renderer at all. `tools/camclear.mjs`, `tools/shadowframe.mjs` and
 * `tools/charview.mjs` do exactly this and take about a second each.
 *
 * On yaw: two angles pull against each other and both have to land. View angle (0° = camera
 * sees his front, ±180° = dead behind) wants roughly 20–70° for a three-quarter read that
 * shows cap brim, muzzle, ear notch and cane at once. Sun angle (0° = face pointed at the key)
 * wants roughly 20–70° so the face is lit but still modelled. A yaw that fixes one will
 * happily break the other, so sweep against both — `charview.mjs --sweep` does it.
 */
export const SHOTS = {
  /* The money shot. Sly perched on the courtyard architrave, golden hour raking across
     the complex, Great Pyramid hazed in the distance. If one frame has to sell the game,
     this is it.

     Yaw was -2.35, which put the camera 172° round from his face — dead behind. Now 5.72, a
     three-quarter read at 69°, with the key still 64° off his face so it models rather than
     flattens.

     Camera dollied 40% along its own axis toward the target, 22.3 m → 11.1 m, which takes him
     from 49 px to 99 px. I first bet on the repaired rim carrying him at 49 px instead; that
     was measured and it lost. The character box means L 77.4 against L 94.7 beside it — a
     17.3 luma break, with the ink line doing most of the separating — and the specific reason
     it fails is sharper than "too small": at 49 px the tail is his largest identifying shape
     and its light/dark ring period is about **2 px**, below the size at which a ring pattern
     can resolve, so the tail collapses into one dark mass and merges with the 2.5 px ink line.
     Widening the rings would trade the close-range read for a marginal gain here, which is the
     wrong trade. Doubling him is the fix that addresses the stated cause.

     Dollying along the view axis rather than shortening the lens is deliberate: FOV and aim
     are unchanged, so the angular field is identical and the hazed pyramid — which is
     effectively at infinity — keeps its size. Only the near and mid ground grow. The vista
     survives; that was the thing worth protecting.

     **THE STAGED PLAYER MOVED, 2026-08-09 (PREREG-heroread, KNOWN_ISSUES §272). The camera did
     not.** `pos`, `target`, `fov`, `tod` and `roll` above are byte-identical to what they were;
     anyone holding a before/after on this frame has a moved subject and an unmoved set.

     Two reasons, and the second is the one nobody had recorded. Critic 9's D4 measures the
     character at 15.7% of frame height here against a reference band of 30-34% (`sly3-venice`,
     cap-ear tips to boot = 30.8%, to the tail tip = 34.3%), on the frame this file's own header
     calls the one that has to sell the game. And **he was standing on nothing**: a downward ray
     at (2.2, 8.4) finds `arch:court:paving_courtyard` at y 5.20, because the gilded architrave
     at y 9.0 spans only x 2.75-4.25 there and he stood at x 2.2 — **3.80 m of air**, visible at
     7x in `shots/r9/hero.png` as a boot tip ending over a cornice with no contact and no
     contact shadow. Every projection check passed, exactly as §7's own correction warns.

     (4.0, 8.99, 13.2) is ON the architrave — 8.99 is the measured deck height at that exact xz,
     not the nominal 9.0, for the reason §7's `courtyard` note gives — 6.5 m from the lens
     instead of 11.1, and 100% visible on 66 rays. Projected through this camera it takes him
     from 113 px to 202 px, i.e. 15.7% to 28.1%, and his ground contact from NDC y 0.14 to -0.09
     with his feet near the left-third line rather than dead centre.

     Yaw 5.72 -> 5.889, and it is a compromise that is worth stating rather than hiding. View and
     sun angles cannot both be solved here: `view - sun` is fixed by the stand, and moving toward
     this camera swings the bearing away from the key, taking that separation from 133 deg to
     147. 5.889 splits the excess evenly — view 73, sun -73, each 3.4 deg outside the 20-70 band
     this file's header asks for, which is the best any yaw can do at this position. The
     alternative was keeping sun at -64 and letting view reach 87, i.e. dead profile. */
  hero: {
    pos: [8.9, 10.28, 17.2], target: [-1.0, 7.4, 4.0], fov: 46, tod: 0.79, roll: -1.5,
    player: { pos: [4.0, 8.99, 13.2], yaw: 5.889, pose: 'perch_idle' },
  },

  /* Frames the KayKit showcase row on the courtyard paving (KayKit.js, ?kaykit=1). Data only —
     it costs nothing when the module is inert, which is its default.

     Re-aimed after its first capture came back unreadable. The row is ~22 m of 4–5 m pieces, and
     the old camera sat 10.6 m from it with a 44° field: two models filled the frame and the rest
     were off it. The view is OBLIQUE because neither straight-on option exists — a camera due
     north of the row is inside the hypostyle hall, and one due south looks straight through the
     obelisk (x 0, z 11, h 22). From (−14, 14, 12) the sightline to the row passes x ≈ −13.2 at the
     obelisk's z and clears terrace stage 1 (top y 2.0) at y 7.7, so nothing occludes it. Checked
     by arithmetic against §8.1 before the boot, because the last frame was spent discovering a
     framing error that the coordinate table already contained.

     Sly stands at (−9, 0, −3), three metres in front of the 4 m `pillar_decorated` at the near end.
     That is the point of him being here: "at this project's scale" is a claim the frame should
     SHOW against a known 1.80 m character, not one the reader takes from the provenance note. */
  kaykit: {
    pos: [-14.0, 14.0, 12.0], target: [0.0, 2.0, -6.0], fov: 34, tod: 0.30,
    player: { pos: [-9.0, 0.0, -3.0], yaw: -0.20, pose: 'idle_confident' },
  },


  /* Hypostyle hall — the column forest, clerestory light shafts, hieroglyph walls.

     The camera used to sit at (9, 3.4, -22), which is 1.0 m from the axis of the nave column
     at (8, -22) — whose radius at that height is 1.78 m. This shot was framed from 0.78 m
     *inside* a column for its whole life. Now in the centre of the nave at the south end,
     looking down the column forest with the clerestory above: the composition the shot was
     always described as having. Checked against the real column grid (nave x ±8 at
     z -22/-30/-38/-46, aisle x ±16.5 at z -26/-38); nearest clearance is 3.6 m. */
  temple: {
    pos: [3.5, 2.6, -19.0], target: [-1.5, 8.5, -40.0], fov: 55, tod: 0.72,
    player: { pos: [1.0, 0.0, -32.5], yaw: 5.85, pose: 'sneak_idle' },
  },

  /* Character sheet. Tight on Sly: cel bands, ink lines, fur, cloth, cane, face.
     Staged at the spawn point rather than at world origin — origin is inside the courtyard
     structure ARCHITECTURE built, so the camera was buried in masonry and the frame had no
     subject at all. Same relative framing, open ground, sky behind him.

     Reframed once more, from the other side of him. Two measured reasons:

     His feet were outside the frame, so he had no ground contact at all and no cast shadow
     could ever have shown — the critic read that as "the character casts no shadow", but the
     shadow was never the missing part. The framing now includes the contact point and the
     full figure, which is also what §7.3's character conditions need: proportion, silhouette
     and line-of-action are all judged on the whole body, not on a portrait.

     And his yaw was the binding constraint, not the camera. At yaw 0.55 his face pointed 128°
     away from a sun at azimuth 187°, so *no* camera position could have lit it — a sweep of
     6480 camera placements failed the face-lighting test on every single one, because face
     lighting is a function of yaw and the sun alone. At yaw 5.59 he is lit three-quarter
     front, and the camera sits off the shadow axis so the shadow rakes away across frame.

     Yaw 5.59 → 5.24. At 5.59 the camera sat at view 13°, one degree off `charview`'s
     "dead-on, flat" threshold — and this is the one shot whose entire job is the character.
     Dead-on shows the cap brim, muzzle, ear notch and cane hook all in profile or not at all;
     a three-quarter view shows them together. 5.24 puts view at 33° and keeps the sun at 37°
     off his face, so both reads land at once. */
  'sly-closeup': {
    pos: [-1.6, 1.45, 33.2], target: [0.0, 0.95, 30.0], fov: 38, tod: 0.80,
    player: { pos: [0, 0, 30], yaw: 5.24, pose: 'idle_confident' },
  },

  /* Pupil-state verification twin for the startle work (SPEC-startle-pupils): the `hurt` pose,
     whose hold window is where the pupil constriction keys live.

     **Player yaw stays 5.24 — `sly-closeup`'s — deliberately.** Face lighting is a function of
     yaw and the sun alone (§7), so yaw is the one thing that must not move if this shot is to
     remain the closeup's one-variable twin.

     The *camera*, though, is not the closeup's, and the first version of this shot was wrong to
     reuse it. `hurt` turns the head, and at the closeup's bearing that left the two eyes
     presented very unequally — `dot(outward, toCamera)` 0.963 left against 0.684 right, 48 px
     against 34 px. A single catchlight threshold applied across that asymmetry produced a
     failure on the right eye that was first blamed on the pupil constriction; it was the
     framing (KNOWN_ISSUES §27.2). So the lens is rotated −25° around him, up 10°, and in to
     2.8 m, aimed at the head centre rather than the chest: the two eyes come within 0.013 dot
     of each other (0.907 / 0.920) and the previously failing eye gets 3× its pixels.

     Measured control, so the gain is not miscredited to the zoom: the same distance and fov at
     the *old* bearing leaves the right eye at 0.685. The azimuth is the lever; the zoom only
     adds pixels. */
  'sly-startle': {
    pos: [-2.21, 1.60, 31.78], target: [-0.08, 1.11, 30.03], fov: 22, tod: 0.80,
    player: { pos: [0, 0, 30], yaw: 5.24, pose: 'hurt' },
  },

  /* Line-of-action verification twin for `perch_idle`. Added because `hero` provably CANNOT
     verify it and this was going to be read as a null in `hero` and mistaken for a missing lean.

     The excursion under test is the spine's lateral S — hips +0.045 → chest +0.082 → head
     +0.046, i.e. 3.7 cm out on the lower segment and 3.6 cm back on the upper. `hero` sees it
     at **view 73°, 295 px** (`tools/charview.mjs`, H=1.7 m, 900 rows → 173.5 px/m), and a
     73° bearing foreshortens the frontal plane to cos 73° ≈ 0.29, so 3.7 cm arrives as
     **~1.8 px against a ~2.5 px ink hull**: the excursion is NARROWER than the line drawn over
     it, and `hero` returns a null whether or not the lean exists.

     At this framing — view 33°, 619 px → 364 px/m, frontal factor 0.84 — the same 3.7 cm is
     **~11 px**, 4.4× the hull, which a per-row centroid can resolve.

     Numbers re-derived 2026-08-15 (§345, §359). They were previously quoted as "87-97 px/m →
     3.2-3.6 px", which omitted the foreshortening entirely and made the excursion sound
     comparable to the hull rather than narrower than it — two errors partly cancelling, so the
     conclusion below was right and understated. Re-derive from `charview`, not from this
     comment: the framing has moved before and the arithmetic is one command.

     **This is `sly-closeup` translated down 0.30 m and nothing else.** Same lens (fov 38), same
     bearing, same distance, same yaw 5.24, same player position — only the height follows
     `perch_idle`'s own `pos: [0.045, -0.30, 0.07]` base offset, so the crouched torso sits where
     the standing one did. Authored as a pure translation on purpose: `sly-startle`'s comment
     above records that re-inventing a twin's camera is how a framing artefact got blamed on the
     feature under test (§27.2), and a shot that differs from its reference in one axis by one
     known quantity cannot repeat that.

     Note it is deliberately NOT on the ledge — `perch_idle` is frozen here over flat ground.
     That is correct for this measurement, which is about the spine's own curve, and it means
     this shot says nothing about the cane-over-open-air question §57.4 registers. That one is
     `hero`'s to answer and only `hero`'s. */
  'sly-perch': {
    pos: [-1.6, 1.15, 33.2], target: [0.0, 0.65, 30.0], fov: 38, tod: 0.80,
    player: { pos: [0, 0, 30], yaw: 5.24, pose: 'perch_idle' },
  },

  /* DIAGNOSTIC framing, not a composition — added because the arms condition was unmeasurable in
     every scored shot and therefore could never be closed by capture (§65.2, §66.1).

     `sly-closeup` aborts its own arm measurement: scanning the outboard outline by dominant skin
     bone, the left edge is owned CANE 365 / HEAD 76 / HAND 66 / **ARM 0**, and the right edge
     LEG 234 / TAIL 214 / HEAD 68 / **ARM 0**. Zero depth-qualified forearm rows. The cane owns one
     side and the tail the other, so no width number taken there is measuring an arm — which is
     what the pre-registered abort caught before a number was published.

     This framing puts a forearm on the outline and was verified BEFORE it existed: **62
     consecutive rows, y 372-433**, outboard edge owned by `lowerArm`, median **34 px** proud
     (min 5, max 43) against a ~2-3 px ink hull — 11x clear. Negative control, same tool on
     `sly-closeup`'s own camera: **0 rows**. Gloves are excluded from "arm" on purpose: counting
     `handL/R` made `sly-closeup` look like it qualified at 44 rows, and a glove is cloth and
     cannot answer a fur condition.

     **Only the bearing moves.** Lens, distance, elevation and player yaw are all `sly-closeup`'s,
     for the reason `sly-perch` above is a pure translation and `sly-startle`'s comment records:
     re-inventing a twin's camera is how a framing artefact gets blamed on the feature under test.
     Camera clearance checked (3.6 m of open courtyard air); bearing sits 30 degrees off the sun's,
     so the presented side is lit.

     NOT in the critic's scored roster — a diagnostic framing should be graded as evidence, not as
     a composition. It rides the same boot at negligible cost. */
  'sly-arm': {
    pos: [-3.10, 1.45, 28.21], target: [0.0, 0.95, 30.0], fov: 38, tod: 0.80,
    player: { pos: [0, 0, 30], yaw: 5.24, pose: 'cane_combo_2' },
  },

  /* Composition + props: obelisk, colossi, braziers, palms, banners.

     Camera untouched — this shot exists to show the architecture, and turning it toward the
     character to chase a cast shadow would throw away what it is for. The character moves
     instead: he was at NDC y −1.21, i.e. below the bottom edge, entirely out of the frame he
     was meant to give scale to. Now at the same screen position he would have occupied, on
     the floor, lit three-quarter front with his shadow fully in shot.

     He is 58 px tall here and that is left alone on purpose, unlike `hero`. This shot is named
     for the obelisk, colossi, braziers, palms and banners; he is the scale figure, not the
     subject, and a scale figure reads as a person without needing his tail rings to resolve.
     `hero` got the camera moved because it is the one frame that has to sell the game and he
     is the subject of it. If a critic faults the character *here*, the answer is the same
     dolly, but it should be a deliberate decision to change what this shot is about.

     He was also **completely invisible in this shot** until now, and every projection check
     passed while he was. A raycast against the built scene found all five body samples blocked
     at 9.3–9.5 m of the 19.2 m to him, by the west colossus throne block at ≈(-12.9, 3.1, 23.4)
     — which sits exactly where §8.1 contracts it, so the level was right and this staging was
     wrong. He was inside the frustum at NDC (-0.115, -0.880), which is precisely why
     `charview.mjs` and every other projection tool reported him fine.

     Moved onto terrace stage 2, a surface already proven by `night` staging him at (-4, 5.2,
     12.5). Verified: clear of the throne, and the framing improves besides — NDC y -0.964 to
     -0.315, so he stops being jammed against the bottom edge. 84 px at 1600x900.

     **That verification was right about the throne and still wrong about the frame, because
     the instrument had five samples.** Five points on a 1.7 m figure can find a throne block
     that swallows him whole; they cannot see a wall that cuts him at the waist. A 506-sample
     test (`tools/charvis.mjs`) says the terrace position was **65.8% visible** — legs 70%
     occluded, torso 50%, head 16% — by `arch:court:hieroglyph_wall`, a different occluder
     from the one that was fixed. The fix moved him out of one thing and into another, and the
     check could not resolve the difference. **When a coarse instrument clears a change, that
     is the instrument's resolution talking, not the change.**

     Now at (-6.6, 5.12, 12.4): **100% of 506 samples visible**, nothing between him and the
     lens. 5.12 is the measured deck height at that exact xz, not the 5.2 assumed from `night`
     8 cm away — the terrace carries block-level relief and standing him on the nominal figure
     floats him.

     He gets *smaller* by this move — 67 px to 63 px at 1280x720 — and it is still the better
     frame: 67 px at 65.8% visible is ~44 px of readable figure, and the missing 34% is his
     legs, which is exactly where a run pose carries its line of action. Camera untouched, as
     this entry has said from the start; the dolly stays available and stays a deliberate
     decision about what this shot is for.

     Yaw 4.19 → 5.08. At 4.19 the camera saw him at view 81°, near profile; 5.08 is the
     nearest yaw putting view at 34° — a three-quarter read — while keeping the key 21° off
     his face so it still models. Visibility is flat across yaw here, so the two were solved
     separately without either fighting the other. */
  /* The courtyard seen through its gate — and the reason it moved outside is worth reading
     before anyone moves it back.

     Every prop placed through a `Bag` was rendering at the world origin (KNOWN_ISSUES §39), so
     the colossi, the sphinx avenue and most of the set dressing were invisible when this camera
     was composed. This shot is named for those props and was framed around their absence. Once
     they appeared, the west colossus (13 m on a 2 m plinth at x -9.5, z 25) overflowed the frame
     at both ends from 11.1 m away.

     I then eliminated three corrections by measurement and concluded the courtyard was enclosed
     with no distance to buy. **That conclusion was an artefact of a broken clearance test**
     (§43): the box raycaster clamps `t0` at 0 and returns `Infinity` when the origin is *inside*
     a box, so a camera embedded in masonry scored as perfectly clear. Re-audited with a real
     clearance gate, two of those three were not compositions that failed — they were cameras
     standing in the west pylon (0.00 m and 0.50 m). With clearance ≥ 2 m enforced, 8,232
     candidates pass: the distance is bought by moving *along the approach axis*, not by backing
     into the enclosure.

     Scored against real triangles, z-buffered, with occlusion counted: both colossi land
     complete — crown, face, knee and base inside the frame — obelisk centred behind, braziers in
     the bottom corners as dark foreground framing, the sphinx avenue leading in, and the west
     statue nearer than the east so the pair is not a mirror. Clearance 7.5 m. Statue coverage
     15.9% + 10.1% against 28.3% + 5.4% shipped, with crown and base previously OUT on both.

     The cost, stated because it is a change in what the shot *is*: the camera now sits at z 41.5,
     outside the courtyard on the approach. And the staged player falls to ~41 px at 720 rows. He
     is the scale figure here rather than the subject (see below), but if he needs to be larger,
     `(-3.5, 0, 27)` computes to ~83 px on open paving between the statues — that is arithmetic
     and wants `charvis` before it is trusted, so it is not applied here.

     **THE STAGED PLAYER MOVED, 2026-08-09 (PREREG-heroread, KNOWN_ISSUES §272). The camera did
     not** — `pos`, `target`, `fov`, `tod` and `roll` are byte-identical. Anyone holding a
     before/after on this frame has a moved subject and an unmoved set.

     This is the deliberate decision the entry above asks for. Critic 9's D4 leads with this
     frame at **5.7% of frame height** against a 30-34% reference band, and adds the read that
     makes it worse than a size complaint: *"there are two raccoon-silhouetted figures in frame …
     and a viewer cannot tell which is the protagonist"* — the other is a near-black guard at
     px (372, 460-540), which at 41 px was the same size as the hero.

     The suggestion recorded above was measured and **not** taken: (-3.5, 0, 27) scores 91%
     visible and floats 4 cm, and it lands the figure 50 px from that guard. (2.4, 0.02, 26.4) is
     on `paving:court` at the measured height (float 0.00), **100% visible on 66 rays**, on the
     approach paving between the two colossi and clear to the right of the guard. 41 px -> 77 px,
     5.7% -> 10.7%, ground contact at NDC y -0.69 with 94 px of paving under his boots for the
     cast shadow the shot has never had.

     It is still the smallest figure in the set, and that is correct: this shot is named for the
     obelisk, the colossi and the avenue, and a scale figure that doubles is a scale figure, not
     a subject. Yaw 5.08 -> 5.341 is a straight gain here rather than a compromise — view 77/sun
     -21 becomes **view 36 / sun -36**, both inside the band for the first time. */
  courtyard: {
    pos: [-2.5, 4.0, 41.5], target: [1.5, 6.4, 16.0], fov: 55, tod: 0.76, roll: 0.8,
    player: { pos: [2.4, 0.02, 26.4], yaw: 5.341, pose: 'run' },
  },

  /* Terrain + sky + aerial perspective. The approach ridge looking back at the complex. */
  dunes: {
    pos: [26.0, 19.5, 84.0], target: [-2.0, 9.0, 18.0], fov: 42, tod: 0.83,
    hidePlayer: false,
    player: { pos: [22.0, 16.4, 76.0], yaw: 5.53, pose: 'idle_confident' },
  },

  /* Interior lighting: torch-lit tomb, warm key against cold fill, heavy volumetrics. */
  interior: {
    pos: [3.2, -9.2, -60.0], target: [-1.5, -11.5, -74.0], fov: 52, tod: 0.5,
    player: { pos: [1.4, -12.0, -66.0], yaw: 5.36, pose: 'sneak_idle' },
  },

  /* Palette flip. Moonlit stealth: cool key, warm brazier accents, blue sparkles. */
  night: {
    pos: [-13.4, 8.4, 22.0], target: [2.0, 6.0, 2.0], fov: 48, tod: 0.02,
    player: { pos: [-4.0, 5.2, 12.5], yaw: 1.15, pose: 'sneak_walk' },
  },

  /* Motion tech, caught mid-arc: Sly swinging on a cane hook over the courtyard gap.

     Camera pulled 6 m west, on x alone. It was standing inside the cornice mass — the geometry
     agent measured that cornice at 39.8% of frame at 2.8 m mean depth, and I measured the same
     thing a different way before moving anything: `arch:court:sandstone_block` fills **41.8% of
     frame at 4.3 m**, and **41.3% of the entire frame sits closer than 5 m**. Two fifths of a
     shot about motion was a static slab an arm's length from the lens, with the subject at
     109 px behind it.

     A 5 m near-field probe over 576 frustum rays, against the original target so the
     composition is the thing being tested rather than a different shot:

         (12, 14, 6)  near<5m 41.1%   sky 19%   mean depth 17 m   109 px   ndc -0.27
         ( 6, 14, 6)  near<5m  0.0%   sky 24%   mean depth 28 m   147 px   ndc -0.06

     Target, fov, roll, tod and the player are all untouched, so this is the same shot with the
     obstruction gone: nothing in the near field at all, mean depth up 65%, the subject 35%
     larger and centred instead of pushed a quarter-frame off axis. More aggressive positions
     were available — (3, 14, 3) reaches 238 px — and were **not** taken: they drop sky to 14%
     and swing the axis far enough that it stops being this shot. The cornice itself is no
     longer a hole in the frame either; ARCHITECTURE closed it (§10), so this is a framing fix
     on top of a geometry fix, not instead of one. */
  traversal: {
    pos: [6.0, 14.0, 6.0], target: [-3.0, 11.0, -12.0], fov: 44, tod: 0.77, roll: -3.0,
    player: { pos: [1.0, 12.4, -3.0], yaw: 5.76, pose: 'hook_swing' },
  },

  /* Impact frame: third hit of the cane combo landing on a guard, full FX.
     Moved off world origin for the same reason as `sly-closeup` — it was framing bare floor. */
  combat: {
    pos: [4.6, 2.35, 31.4], target: [-0.6, 1.5, 27.0], fov: 40, tod: 0.74,
    player: { pos: [0, 0, 28.0], yaw: 0.15, pose: 'cane_combo_3' },
  },

  /* Guard sheet: silhouette, uniform, patrol light cone.
     Staged beside the (-18, 0, 22) courtyard brazier so the subject is actually lit — the
     old framing was empty ground at midnight and came out ~85% black. Time of day lifted
     off full dark to keep a readable silhouette while staying a night shot.

     Sly is deliberately *behind* this camera and out of shot: the subject here is the guard.
     A framing check will report this shot as "player feet out of frame, 0% of the player's
     cast shadow visible" — that is correct and intended, not a defect to fix. If the guard
     himself reads as ungrounded, that is a real problem, but it is about the guard's placement
     (AI owns it), not about this camera.

     **The camera was standing on the west colossus plinth, 5 cm above its deck.** The plinth
     top is y 2.00 and the camera sat at y 2.05, inside an 8x7 m stone deck at (-9.5, 25) —
     so this was an ankle-height view across a slab. That one placement produced three separate
     critic complaints: the "bright cyan contact line" is the plinth's far edge (predicted to
     project at y 255-264, measured at y 260 and 278 with the same left-to-right tilt); the
     "blank lower 60%" is the deck, at 61% of frame; and the guard has never been in shot
     because the subject is on the courtyard floor two metres below the camera's feet.

     ~~Raised 2.0 m so the camera stands *over* the plinth rather than on it, with the target
     lifted equally to keep the original pitch and aim.~~

     **CORRECTION — this paragraph describes a commit that was REVERTED, and the values below are
     not the ones it explains.** KNOWN_ISSUES §152. The +2.0 m version (`b81747d`, y 4.05) put the
     eye *inside the throne* — throne volume x -12.9..-6.1, y 2.0..4.5, z 22.0..27.6 contains
     (-11.5, 4.05, 25.4) on all three axes — so it was reverted. What ships is `e5f8260`:
     **+0.55 m and a +5.1 m southward dolly**, and the target was re-aimed rather than "lifted
     equally".

     So the stated intent — get the camera *over* the plinth — is **not met by the shipped value**,
     measured offline through this camera: the eye is **0.60 m** above the deck plane (not 2.05),
     the plinth SW top corner still projects in frame at **px (1022, 338), d = 2.9 m**, and the S
     top edge still crosses the frame diagonally with the same tilt sense the critic recorded.

     What actually changed is the *width* of the exposed up-facing deck band: **36-70 px at pass 2,
     239-265 px as shipped.** That matters for anyone reading a `kerbline` null off this frame — a
     thin-line detector cannot match a 240 px band, because its interior is not a local maximum, so
     absence of the signature is not evidence the surface left the shot.

     The plinth itself is an §8.1 contract surface and is correct — nothing about the level needed
     changing. */
  guard: {
    /* Moved 1.75 m west on 2026-08-07 per PREREG-staging4 §7's SHIP row (RESULT-staging4.md).
       The near-black plinth mass cut 26 of 39 row-bands of the subject from this camera —
       nineteen of them consecutively at exactly 0.000 unoccluded share, i.e. the whole midsection.
       From here that count is zero. Four captures to prove: three were voided by their own
       pre-registered falsifiers, each exposing a defect in the instrument rather than in this
       lever, whose bands never moved. */
    pos: [-13.25, 2.6, 30.5], target: [-18.75, 1.1, 28.0], fov: 38, tod: 0.10,
    player: { pos: [-9.0, 0, 31.5], yaw: 2.3, pose: 'sneak_idle' },
  },

  /* Near-profile character sheet — ADDITIVE, added for §7.3's "silhouette readable as Sly
     (cap, mask, tail, cane)" condition. Every other camera that draws Sly is a three-quarter
     (33°, 45°, 70°, and five behind him), and a three-quarter cannot test the one feature the
     cap is *made of*: the bill projects forward along head-space +Z, reaching z 0.320 against a
     face plane at ~0.19, so seen end-on it foreshortens into the crown and contributes almost
     nothing to the outline. Measured on the head-outline boundary, flat-filled by material
     group, collar excluded (`shotsil.mjs --parts` + `capoutline.mjs`), the bill owns **3.3% of
     the head outline at `sly-closeup`'s 33° and 12.2% at 90°**; the whole cap goes 24.9% → 48.0%
     over the same swing. So the cap's silhouette is a real feature that no canonical frame was
     looking at, and this camera is the view that shows it.

     Staging is `sly-closeup`'s, deliberately and in full: same player position (the spawn, open
     ground, the one staging charvis scores 100% visible at 506 samples), same `idle_confident`,
     and **the same yaw 5.24**. Only the camera moves. That is what makes this additive rather
     than a new variable — face lighting is a function of yaw and the sun alone (this file's
     header, and the 6480-placement sweep behind `sly-closeup`'s yaw), so reusing the yaw
     inherits its proven key angle (sun 37° off his face) instead of re-deriving one.

     Camera swung to view 95°: from the player at (0,0,30), `atan2(dx,dz) − yaw` = 1.657 rad.
     3.9 m out at fov 38 puts him 648 px at the harness's 900 rows and 495 px at the critic's
     720, so the head is large enough that the bill and the ear tips resolve rather than merging
     into the ink line — the failure `hero` hits at 111 px. Elevation 10° so it looks slightly
     down the way the other character cameras do, rather than being a turntable elevation
     nothing else uses.

     **The first version of this entry put his feet 15 px below the bottom edge** — figure rows
     171…735 at H 720 — which is precisely the defect this file's own header records for
     `temple` and `courtyard`, shipped again in a brand-new shot and caught only because the
     landmarks were projected through the real camera instead of eyeballed. Pulled back 3.46 →
     3.9 m and the aim dropped 1.15 → 0.88: rows 118…613, so 118 px of headroom and 106 px under
     his boots for the contact shadow. Checked with `camclear` (clear), `charvis` (100% of 481
     samples, no occluder at all) and a landmark projection at 1280x720.

     The standing 4.2 baseline is over the ten environment shots; compare against it by passing
     those ten names explicitly, or re-baseline deliberately. Nothing here changes any existing
     entry.

     CORRECTION. This used to read *"This is the eleventh shot, and a default
     `node tools/critic.mjs` with no shot names now scores eleven."* `critic.mjs` takes its list
     from `info.shots`, which is `Debug.js:76` → `SHOT_NAMES.slice()` — **every entry in this
     file, not a curated subset.** The count was already wrong when written and the ordinal was
     never checkable, because this file is organised by kind rather than by the order entries
     were added. Retired rather than re-stated: `tests/alertshot.test.mjs` now pins the live
     count by reading it out of the banner below, so it can go stale exactly once. */
  'sly-profile': {
    pos: [2.21, 1.70, 33.13], target: [0.0, 0.88, 30.0], fov: 38, tod: 0.80,
    player: { pos: [0, 0, 30], yaw: 5.24, pose: 'idle_confident' },
  },

  /* Character sheet in KEY light — ADDITIVE, approved by the coordinator against KNOWN_ISSUES
     §24.5. `sly-closeup` stages him at the *western lip* of the one lit corridor the courtyard
     has at tod 0.80 (two paving rows deep at z ≈ 30–32): measured by ray-casting the key against
     the built level, only **37% of his camera-visible surface is key-lit and unoccluded** there,
     with the occluders named rather than inferred — the west courtyard wall's top edge at
     (−22.2, 8.6, 27.4), and a `bronze_dark` piece at (−2.2, 2.3, 30.0) sitting 2.2 m due west of
     him, on the key axis at chest-to-head height. Every cel-band, fur and face judgement made on
     `sly-closeup` is therefore a judgement of him under *fill*, and §24.5's grid says +2 m of x
     takes the key-lit share to 52% and +4 m to 58%.

     This entry is that +4 m, as a new frame instead of a moved one. `sly-closeup` is untouched
     deliberately: it is the standing baseline half the character record is measured against, and
     its marginal staging is now a documented property, not a defect to erase. The whole rig —
     camera, target, player — is translated +4.0 in x together, so the 33° three-quarter view,
     the fov 38 figure size and the verified feet-in-frame coverage are inherited rather than
     re-derived; yaw stays 5.24 because face lighting is a function of yaw and the sun alone
     (this file's header; the 6480-placement sweep), so the key lands 37° off his face here too —
     but *on* him, not on the wall behind him.

     Verified before first capture, per the discipline the previous entry paid for — these are
     measured values, not the §24.5 predictions: `camclear` clear; `charvis` **100% of 500
     samples visible**, no occluder between lens and figure; `keyocc4` at the staged position:
     key-lit-and-visible **63%** against `sly-closeup`'s 37% in the same run — better than the
     grid's 58% because the wall shadow's lip falls fully behind him here (unshadowed 100%
     against 62%); full-vertex projection through the real camera at 1280x720: figure rows
     123…639 (identical to `sly-closeup`'s, as translation guarantees), 123 px of headroom,
     81 px of contact ground under his boots, 0 of 4746 vertices clipped.

     The standing baseline is over the ten environment shots; compare against it by passing
     those ten names explicitly, or re-baseline deliberately. Nothing here changes any existing
     entry.

     CORRECTION, the same one as `sly-profile`'s: this claimed to be "the twelfth shot" with a
     default critic run scoring twelve. See that entry. */
  'sly-key': {
    pos: [2.4, 1.45, 33.2], target: [4.0, 0.95, 30.0], fov: 38, tod: 0.80,
    player: { pos: [4.0, 0, 30], yaw: 5.24, pose: 'idle_confident' },
  },

  /* The first shot in this file that frames a RELATIONSHIP rather than a subject.
     (For "which number shot is this", see the SHOT COUNT banner at the end of this object —
     the ordinals that used to be written into individual entries were unverifiable and two of
     them were wrong.)
     ────────────────────────────────────────────────────────────────────────────────────────
     Every entry above stages one thing — Sly, or a guard, or the architecture — and every
     staging tool this project has answers a one-subject question. `charvis` asks "is the
     character occluded"; `keyocc4` asks "is he lit". Neither can ask "do the two subjects
     merge into one silhouette", "is the alert mark inside the frame", or "is either figure
     falling off an edge", and the third of those is not hypothetical: this file's own header
     records `temple` and `courtyard` shipping with the figure's feet below the bottom edge,
     and `sly-profile` records the same defect shipped a THIRD time in a brand-new shot.

     So `tools/alertframe.mjs` was written before this entry was, and this entry is its
     candidate H — the only one of four with no faults. Measured at 1280x720, the resolution a
     critic reads a frame at rather than the 900 rows the harness renders:

       sly     rows 467..655 (188 px)  margins l614 r585 t467 b65   clear
       guard   rows 357..457 (100 px)  margins l443 r782 t357 b263  clear
       guard2  rows 317..376  (59 px)  margins l793 r455 t317 b344  clear
       mark3   at 470,379            margins l432 r772 t349 b309  clear
       mark2                         margins l787 r449 t312 b372  clear
       overlap 0.0% of the smaller subject · group spans 31%w 48%h, centre -1% off

     WHY H AND NOT J, since both scored clean. The shot exists to show the alert LADDER, and a
     ladder needs two rungs you can tell apart. H's marks are 76 px and 44 px across — a ratio
     of 1.73. J's are 74 and 52, a ratio of 1.42. H separates the rungs by half again as much,
     and that is the whole subject of the frame. The group span is the tiebreak in the same
     direction: 31%w against J's 24%, where the shipped single-subject median is 11.1% and the
     character-sheet cameras reach 19.0–19.8% (`alertframe --calibrate`). A relationship frame
     should span more than a portrait does.

     WHAT IS NOT VERIFIED HERE, stated because the record is worth more than the claim.
     `alertframe` is architecture-only, exactly as `lvl.mjs` and `charvis.mjs` warn: props, FX,
     decals, sky and terrain are invisible to it, and subjects are upright boxes rather than
     skinned meshes. **A candidate it likes can still be a bad frame; a candidate it rejects
     cannot be a good one.** It also says nothing about light, and this is the only canonical
     shot at tod 0.10 — whether the mark reads against the night grade is a question only a
     capture can answer, and per KNOWN_ISSUES §367 FX is one of the few systems that does
     render live in a shot.

     The guards are staged by **`stage` below, in this object** — NOT by `SHOT_POSE.alert` in
     `Guard.js`, which does not exist. This sentence used to say it did, and it was left behind
     when the staging moved here so `alertframe` could re-certify the shipped shot; the very
     next paragraph in this entry explains that move, so the two contradicted each other inside
     one comment. Corrected rather than deleted, because a stale cross-reference to another
     module is the exact failure this session has now found in five files (§393.1, §395.3,
     §396.4, §397) and one of them should record that the author of the rule broke it too.

     AND THE `clear` VERDICTS ON THIS FRAME WERE VACUOUS WHEN FIRST WRITTEN. `alertframe`'s
     occlusion check passed `trisIn`'s record to `rayTri`, which wants the nine-number array;
     `T[3]` was `undefined`, `det` was `NaN`, every guard comparison against `NaN` is false, and
     the function returned −1 for every triangle in the level. It answered "clear"
     unconditionally, for its whole life. Fixed in `tools/framelib.mjs`, which now also carries
     `assertOccluded()` — a ray fired through the level that MUST report a blocker, run before
     any verdict prints. Re-measured after the fix: all five subjects here are genuinely clear.
     The numbers above stand; the certificate they came with did not, until it was re-earned.

     Before this entry, `Particles._stageAlert` and `_stageImpact` existed, were correct, and
     had never run: nothing in this file was ever named `alert`. */
  alert: {
    pos: [-4.0, 4.2, 27.5], target: [-15.0, 2.0, 14.0], fov: 46, tod: 0.10,
    player: { pos: [-9.5, 0, 20.5], yaw: 4.05, pose: 'crouch_idle' },
    /* The staging lives HERE, in the shot, and not in `Guard.js`'s `SHOT_POSE` where the
       `guard` shot's solver spec lives — because the tool that certified this frame has to be
       able to re-certify the shipped one. Put these two positions in the AI module and
       `alertframe --shot alert` can no longer see the subjects it was written to measure, which
       is the "wired at one end only" defect this shot exists partly to avoid repeating.
       `guard`/`guard2` are the field names `alertframe.score()` reads; `stage` is what
       `Guards._poseForShot` reads. One set of coordinates, two consumers, no second copy.

       Both stands are real `courtyard_ring` waypoints (`Patrol.js`: [-18.0, 16.0] and
       [-18.0, 1.0]) walked by roster #1 and #2 — a staged frame that puts a guard somewhere his
       beat never takes him is a picture of a level that does not exist. */
    guard: [-18.0, 0, 16.0],
    guard2: [-18.0, 0, 1.0],
    stage: [
      { index: 1, at: [-18.0, 16.0], state: 'chase', clip: 'alert', t: 0.62,
        lookAt: [-9.5, 20.5], look: [0.12, -0.04] },
      { index: 2, at: [-18.0, 1.0], state: 'searching', clip: 'look_around', t: 1.15,
        lookAt: [-9.5, 20.5], look: [0.26, 0.0] },
    ],
  },

  /* The Cane Slam — the loudest thing in the FX catalogue, and unseen until now.
     (See the SHOT COUNT banner at the end of this object rather than an ordinal here.)
     ────────────────────────────────────────────────────────────────────────────────────────
     `Particles._stageImpact()` was written, is correct, and had never run: this file had no
     entry named `impact`, so its dispatcher branch was unreachable, exactly as `alert`'s was.
     `dive_ring`'s peak projected ink is 104x `alert_spot`'s, which makes it the largest single
     sprite in the game by a factor of 7.6 over the next one, and nothing has ever framed it.

     WHAT IS ON THE FLOOR, at `TUNE.impactScale` 1.25: a ring reaching 1.50 m, a dust dome
     1.88 m high, and two decals — crack at 2.75 m across and scuff at 4.25 m, the widest mark
     and the one that decides the framing. `tools/impactframe.mjs` measures all of it.

     WHY A DISC AND NOT A BOX, which is the whole reason that tool exists rather than reusing
     `alertframe`: a ground ring has no height and its silhouette is not its bounding square.
     From a low camera a circle projects to a wide flat ellipse whose extremes are on the rim.
     Projecting a box instead over-reports its vertical extent and under-reports its near/far
     spread — and both errors point toward "it fits", which is the direction that ships a
     cropped frame.

     THIS IS CANDIDATE C, at 1280x720:

       sly    rows 202..451 (249 px) · margins l583 r583 t202 b269 · clear
       ring   360 x 181 px · margins l460 r460 t341 b198 · clear
       scuff  517 x 264 px · margins l381 r381 t318 b137
       ellipse ratio 0.511 (bar 0.22) · the ring covers 44% of Sly's box (bar 55%)

     Chosen over three other candidates that also passed every bar, by a stated tiebreak rather
     than by taste: the product of the ring reading as a RING (the ellipse ratio) and the figure
     reading as a FIGURE (its pixel height). Those pull opposite ways — elevation rounds the
     ring and shrinks the man — and C maximises the pair at 127.4 against A 122.6, D 114.4 and
     B 97.0.

     **The tiebreak is not a bar and must never be used as one.** The tool's calibration
     candidate — close, low, the frame the instinct actually produces — scores 199.9, the
     highest rank of all five, while cropping the scuff on three edges and the dust on two. The
     composite ranks survivors; the derived bars decide who survives.

     WHERE, and the two rejected sites are why this carries a comment. The first draft slammed
     at (0, 0, 20): the column over that point holds architecture at 1.56, 1.63, 2.00 and
     2.92 m, so it is a slam in a 1.56 m crawlspace under the obelisk terrace. The second tried
     (0, 0, -6), which has NO architecture floor at all — a gap in the paving, where the crack
     and scuff would have landed on terrain the tool cannot see, or on nothing. Both were found
     by printing the whole column over the impact point rather than by taking one ground query's
     answer, and both would have rendered a perfectly plausible picture.

     NOT VERIFIED: whether the dust READS. `impactframe` is architecture-only and says nothing
     about light or about FX. Per KNOWN_ISSUES §367 a capture can answer it, because FX is one
     of the few systems that renders live in a shot. */
  impact: {
    pos: [5.4, 4.4, -2.6], target: [0.0, 0.6, -8.0], fov: 38, tod: 0.78,
    player: { pos: [0, 0, -8], yaw: 0.35, pose: 'dive_impact' },
  },
};

/* ══ SHOT COUNT ═══════════════════════════════════════════════════════════════════════════
 * A default `node tools/critic.mjs` with no shot names captures **18 shots**: every key in
 * `SHOTS`, because `critic.mjs` reads `info.shots` and `Debug.js:76` publishes
 * `SHOT_NAMES.slice()`. There is no curated subset anywhere.
 *
 *   10 environment/gameplay  hero kaykit temple courtyard dunes interior night traversal
 *                            combat guard
 *    6 character sheets      sly-closeup sly-startle sly-perch sly-arm sly-profile sly-key
 *    2 staged-FX             alert impact
 *
 * WHY THIS IS A BANNER AND NOT AN ORDINAL IN EACH ENTRY. Four entries used to announce their
 * own position — "this is the eleventh shot", "the twelfth", "the thirteenth", "the
 * fourteenth" — and **every one of those four was wrong**, in both directions and for two
 * different reasons. The ordinal was unverifiable because this file is organised by KIND
 * rather than by the order entries were added, so an author counting down the file gets a
 * different answer from an author counting their own history. And the count that came with it
 * ("a default critic run now scores twelve") was a checkable claim that nobody re-checked, so
 * it stayed frozen at the moment it was written while four more entries landed around it.
 *
 * The last two were mine, inherited by reading the entry above and adding one — which is
 * exactly how a stale number propagates, and why the repair is a single claim in one place
 * with a test that re-derives it from this text (`tests/alertshot.test.mjs`) rather than a
 * convention everyone is trusted to maintain.
 *
 * The standing 4.2 critic baseline is over the TEN environment shots. Compare against it by
 * passing those ten names explicitly, or re-baseline deliberately.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

export const SHOT_NAMES = Object.keys(SHOTS);

const _v = new THREE.Vector3();

/** Apply a shot to the camera. Returns the resolved shot definition. */
export function applyShot(engine, name) {
  const shot = SHOTS[name];
  if (!shot) return null;
  const cam = engine.camera;

  cam.position.fromArray(shot.pos);
  cam.fov = shot.fov ?? 50;
  cam.up.set(0, 1, 0);
  cam.lookAt(_v.fromArray(shot.target));
  if (shot.roll) cam.rotateZ(THREE.MathUtils.degToRad(shot.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  engine.debug.timeOfDay = shot.tod ?? 0.78;
  engine.debug.hidePlayer = !!shot.hidePlayer;
  engine.emit('timeOfDay', engine.debug.timeOfDay);
  engine.emit('shot', { name, shot });
  return shot;
}

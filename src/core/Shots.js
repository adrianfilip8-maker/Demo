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
     survives; that was the thing worth protecting. */
  hero: {
    pos: [8.9, 10.28, 17.2], target: [-1.0, 7.4, 4.0], fov: 46, tod: 0.79, roll: -1.5,
    player: { pos: [2.2, 9.0, 8.4], yaw: 5.72, pose: 'perch_idle' },
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
     -0.315, so he stops being jammed against the bottom edge. 84 px at 1600x900. */
  courtyard: {
    pos: [-19.0, 5.6, 30.0], target: [1.0, 9.0, 12.0], fov: 50, tod: 0.76, roll: 1.0,
    player: { pos: [-6.6, 5.2, 14.4], yaw: 4.19, pose: 'run' },
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

  /* Motion tech, caught mid-arc: Sly swinging on a cane hook over the courtyard gap. */
  traversal: {
    pos: [12.0, 14.0, 6.0], target: [-3.0, 11.0, -12.0], fov: 44, tod: 0.77, roll: -3.0,
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

     Raised 2.0 m so the camera stands *over* the plinth rather than on it, with the target
     lifted equally to keep the original pitch and aim. The plinth itself is an §8.1 contract
     surface and is correct — nothing about the level needed changing. */
  guard: {
    pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0], fov: 38, tod: 0.10,
    player: { pos: [-9.0, 0, 31.5], yaw: 2.3, pose: 'sneak_idle' },
  },
};

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

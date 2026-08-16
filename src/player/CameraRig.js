import * as THREE from 'three';

/**
 * CameraRig — the third-person camera (AGENTS.md §6.1 controls, §2.3 composition).
 *
 * Design rules this file lives by, in priority order:
 *
 *  1. **The mouse is never filtered.** `yaw`/`pitch` integrate `input.look` 1:1 the frame it
 *     arrives. All the smoothing lives downstream — in the *pivot* the camera orbits and in the
 *     *boom length* — so translation is buttery while rotation stays glued to the hand. Low-passing
 *     the input instead is the single most common way a third-person camera ends up feeling dead.
 *  2. **Vertical follow is far softer than horizontal.** Stairs, small hops and the land-squash
 *     would otherwise pump the frame up and down. Horizontal ~0.16 s, vertical ~0.46 s, both
 *     critically damped (no overshoot, ever), both with a deadzone so an idle Sly holds a still frame.
 *  3. **Pull in instantly, come back out slowly.** Clipping through a wall for one frame is bad;
 *     snapping back out is *worse*, because the eye reads the recovery as a camera mistake rather
 *     than as a wall. Lateral whisker casts let the boom shorten *continuously* as a pillar
 *     approaches the sightline, which is what actually removes the pop.
 *  4. **The harness owns the camera when `engine.debug.freeCam` is set.** We return before touching
 *     anything. The whole visual review loop depends on the canonical shots being untouched.
 *  5. **The camera tells you where the level goes.** Staging a running character is only half the
 *     job; a Sly camera also *telegraphs the route*. Two blind critics read the shipped frames as
 *     "a correct Sly platforming camera" and, in the same breath, "zero vertical route — nothing
 *     says climb here". §"route telegraph" below is the answer: the rig senses the traversal
 *     affordances COLLISION already indexes and eases the framing toward them **on approach**,
 *     before the state machine has anything to react to. A camera that only responds once you are
 *     already on the pole has told you nothing you did not know.
 *
 * Coordinate convention (matches MOVEMENT's yaw, per AGENTS.md §8.1 "facing north = yaw π"):
 *   forward = (sin(yaw), 0, cos(yaw)).  `yaw` is the heading the camera *looks along*, so a camera
 *   sitting behind Sly has `camera.yaw === movement.yaw`. `pitch` is the camera's elevation above
 *   the pivot: positive = above, looking down.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * REFERENCE & PROVENANCE
 *
 * Design was compared against the camera and traversal scripts of
 * <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>, the fan-made Godot Sly project this
 * repository already draws the character mesh from. **Licence: none stated** — that repository
 * contains no LICENSE, no COPYING and no licence section; checked in its tree, not assumed. It is
 * a fan work derived from Sucker Punch / Sony's Sly Cooper. The project owner's standing
 * instruction is that this is not a legal obstacle here for reasons they have not disclosed; that
 * is their call, and it is recorded plainly so nobody reading this file has to infer the status.
 * The same source and the same status are recorded for the mesh in
 * `public/assets/sly-godot/PROVENANCE.md`; this note is that note's sibling, not a new claim.
 *
 * Nothing here is a transcription — GDScript node-parenting has no analogue in a boom-and-pivot
 * rig, so every line below was re-derived. What was *taken*, each cited at its use site:
 *   · `camera_parent.gd`: `pitch_adjust_spring = 0.015` and the shape around it — a very slow
 *     ambient pitch settle, gated on the player actually travelling, targeted by an environment
 *     probe  → `_ceilSettle`. The τ (1.103 s) is theirs; the sign and the form are not, and the
 *     comment there says exactly why.
 *   · `camera_parent.gd` + `target_point.gd`: `target.adj_fov → 85.0` from a 75.0 base — open the
 *     lens when there is something to attend to  → `TUNE.routeFov`, rescaled for our much longer
 *     base lens. `target_point.gd` shows this is an *authored per-point* flag, not a global rule.
 *   · `camera_parent.tscn`: the four probe nodes `Cam Right/Left/Up/Down` and the sphere `Camera
 *     Area3D`  → `WHISKERS`. This rig had a lateral pair only; the vertical pair exists because
 *     theirs does.
 *   · `motion_tracker.gd`: `move_grace_frames = 5` — debounce the moving/still flag  →
 *     `_movingDebounced`, which also records the two faults that stop *their* version working.
 *   · `hook_swing.gd`: `look_1` / `look_2`, a two-sided look direction on the hook chosen by
 *     approach  → corroborates the ± side choice in `_routeProfileYaw`. Theirs is authored per
 *     hook; ours is derived from the line, because our routes are not hand-annotated.
 *   · `camera_parent.gd`: `position_spring = 0.25 # if this value is too low, camera will move
 *     into walls` — read as corroboration for rule 3, not adopted: we pull in at τ = 0.
 * What was read and deliberately **not** taken, with the reason, because "we looked and there was
 * nothing there" is a finding too:
 *   · `rotation_spring = 0.15` — their yaw/pitch are low-passed at τ ≈ 205 ms. That is exactly the
 *     thing rule 1 forbids. We disagree with the reference here, on purpose.
 *   · `avg_distance` scaling of mouse sensitivity — initialised to 1 and never written in that
 *     file, so the behaviour it describes does not actually occur. Nothing to take.
 *   · `velocity_tracker.gd` — the whole file is `extends Node3D` and `var velocity`. It is a stub
 *     and drives nothing, so it is not the source of any speed-reactive camera behaviour.
 *   · `follower.gd` — an undamped positional copy with an optional grid snap; a design-tool
 *     helper, not a follow spring.
 *   · `pole.gd` — computes `camera_direction` from the camera's origin and never uses it. There is
 *     no pole-camera behaviour in that file to adapt.
 *   · `rope.gd` — rope sag geometry; nothing camera-side.
 *   · `camera_parent.tscn` sets `fov = 60.0` while `camera_parent.gd` immediately drives
 *     `target_fov = 75.0`. The script wins at runtime; 75 is the number cited above.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */

const DEG = Math.PI / 180;

/** Every feel constant lives here so the critic loop can tune without archaeology. */
export const TUNE = {
  /* ---- orbit -------------------------------------------------------------- */
  pitchMin: -70 * DEG,          // below the pivot, looking up
  pitchMax: 75 * DEG,           // nearly overhead, looking down
  pitchDefault: 11 * DEG,
  distMin: 2.5,
  distMax: 9.0,
  distDefault: 5.4,
  zoomStep: 0.55,               // metres per wheel notch
  zoomTime: 0.16,               // boom smoothing for a deliberate zoom
  /* The speed dolly. Metres of boom added at `speedRef`, continuous in the smoothed ground
     speed, so a sprint reads at a different scale from a stand.

     `FRAMES` carries an authored speed ladder (walk/run/run_fast dist 0.20/0.90/1.60) that
     nothing reaches, because the moveset's only ground locomotion state is `move`.

     THE ORIGINAL JUSTIFICATION FOR 0.30 IS STALE, AND SAYING SO HERE IS THE POINT. It was
     chosen because sprinting the hypostyle nave with +1.60 m put 11.6 % of frames into boom
     cuts past 50 cm against 0.0 % at the shipped length — the columns appearing to take back
     what the dolly asked for. That measurement was taken with `recoverSpeed` at 2.4, and it
     was measuring the RECOVERY LAG, not the geometry: the boom needed ~1.9 s to climb back
     out against a column every 1.11 s, so cuts accumulated and never cleared. With
     `recoverSpeed` at 6.0 the nave centre-line takes +1.60 m at 0.0 % of frames past
     2 x camRadius, worst cut 0.072 m against 1.346 m before, and does not object at ANY
     size until the boom passes 11 m. **The level never refused the dolly; it refused the
     recovery constant.**

     0.30 is therefore retained as a conservative value, NOT as a level-derived one, and it is
     flagged for re-decision rather than quietly re-tuned here — the size is a feel question
     and the evidence that settled it has been withdrawn.

     Deliberately NOT done here: lighting the `run_fast` framing row as well. Its `fov` +4.6
     ADDS to `fovSpeedGain` +5.4 in `_write`, and the two have never been live at once; that
     path is a +10° / +59.7 %-apparent-width change with its own risk, and it is not this one. */
  distSpeedGain: 0.30,          // metres of boom added at speedRef

  /* ---- follow spring ------------------------------------------------------ */
  followTimeH: 0.16,
  followTimeV: 0.46,            // ~3x softer than horizontal: stairs must not bob the frame
  deadzoneH: 0.10,
  deadzoneV: 0.22,              // a 22 cm step costs the camera nothing
  maxFollowH: 26,
  maxFollowV: 16,
  pivotHeight: 1.42,            // Sly is 1.8 m; this frames chest/head, not feet
  headroom: 0.18,               // look slightly above the pivot so he sits under centre
  /* Softness has to be *earned back*. τ=0.46 s is right for a stair and wrong for a climb: at a
     4 m/s pole climb it parked the look-at 1.17 m under the goal (measured) and Sly drifted to
     the top of frame — the softest possible way to lose the character. So the vertical time
     constant degrades, but it takes TWO conditions to degrade it, because magnitude alone cannot
     tell a climb from a jump: a 2.52 m jump peaks at 1.66 m of error, *larger* than the climb's.
     What separates them is that a jump's error reverses — he comes back down — and a climb's does
     not. So the gate is (error is large) AND (error has held one sign for a while). A jump's
     entire ascent is 0.458 s and never reaches `followHoldFull`; a stair never reaches
     `followErrSoft`. Self-limiting either way: paying the error off restores the damping. */
  followErrSoft: 0.55,          // below this the full 0.46 s applies, untouched
  followErrHard: 1.70,
  followHoldMin: 0.55,          // seconds of one-signed vertical VELOCITY before softness yields
  followHoldFull: 1.00,         // …vs a 0.458 s jump ascent, which therefore never reaches it
  followStiffV: 0.40,           // followTimeV multiplier when fully stiffened → 0.184 s
  /* The leash. A hard cap on how far the look-at may sit from where it wants to be, and it is a
     safety net rather than a feel control: the worst error in any *normal* move measured here is
     1.664 m at the apex of a full-height jump, so at 2.6 m this never engages in ordinary play.
     What it catches is the case no amount of spring tuning can: `Controller.TUNE.maxFall` is
     -40 m/s and `maxFollowV` is 16, so on a long drop the look-at falls behind at 24 m/s and the
     character leaves the frame entirely — 9.85 m behind after 1.5 s of falling, against a
     half-frame height of 3.07 m at this boom and lens. A spring cannot be tuned out of that;
     only a limit can. 2.6 m keeps him inside the frame with margin at the longest boom.

     That 9.85 m figure did not record its fall profile, and the profile is most of the answer.
     `tests/camera.test.mjs` pins the WORST case instead — 1.5 s held at a sustained -40 m/s,
     harsher than any accelerating drop reaching the same speed — and measures **39.90 m** of lag
     with the leash lifted out of the way. Leashed, the same fall settles at exactly 1.75 m, which
     is the saturation value and not an approach to it: the leash bounds `_goal.y - pivot.y` to
     2.6, and `_goal` already carries the -1.0 m `fallLeadMax` plus FRAMES.air's +0.15 height, so
     2.6 - 1.0 + 0.15 = 1.75 m above the character exactly. Both numbers are the same constant
     seen from two ends. */
  followLeashV: 2.6,

  /* ---- velocity lead ------------------------------------------------------ */
  leadTime: 0.17,               // seconds of travel to lead by, ×frame.lead
  leadMax: 1.75,
  fallLeadTime: 0.05,           // drop the look-at when plummeting…
  fallLeadMax: 1.0,
  fallPitch: 10 * DEG,          // …and tip the camera down to show the landing
  fallPitchSpeed: 16,
  climbLift: 0.55,              // raise the framing when going up a pole/wall
  climbPitch: -6 * DEG,
  climbSpeed: 4.0,

  /* ---- occlusion ---------------------------------------------------------- */
  camRadius: 0.34,              // sphere-cast radius; keeps the near plane out of stone
  camPad: 0.12,
  whisker: 0.38,                // lateral cast offset — sees the pillar before it occludes
  whiskerUp: 0.30,              // and one overhead, for lintels and tomb ceilings
  distHardMin: 0.55,            // absolute floor; below this we're inside Sly
  recoverDelay: 0.22,           // hold before creeping back out (kills corner flicker)
  recoverTime: 0.62,            // slow on purpose
  /* Raised from 2.4, because 2.4 could not keep up with the level.
     The hypostyle nave has a column every 8 m; at `runSpeed` 7.2 m/s that is one occlusion
     event every 1.11 s, against a recovery of 0.22 s of hold plus a 0.62 s tau — about 1.9 s
     to 95 %. The boom needed roughly twice as long to climb back out as the level gave it
     between columns, so from the first genuine occlusion onward it never returned to length:
     measured, a hall sprint one lane off the nave centre spent its whole run with the boom
     cut, and along the colonnade it sat at `distHardMin` — the camera inside the character.

     The cost was measured before this moved, on the corner traverses these constants exist
     for, and only after checking the cap actually SATURATES on them (72-125 frames per path;
     one candidate path never recovered at all and was discarded rather than averaged in — a
     cap tested where it does not bind compares two identical runs). At 6.0, three of the four
     flicker-prone traverses are unchanged to two decimals in boom-direction reversals, and
     the worst goes from 2 reversals to 3 across a 17 s walk. Against that: +0.79 m of
     delivered boom at the lane where it was worst.

     `recoverTime` is deliberately NOT touched. Only this constant was varied, so the result
     stays attributable to it; moving both would make neither measurable. */
  recoverSpeed: 6.0,            // m/s cap while recovering
  collisionPoll: 0.5,           // seconds between re-checks for a late COLLISION module

  /* ---- ceiling settle (adapted from camera_parent.gd, see the provenance note) ------------- */
  ceilProbe: 3.2,               // metres of headroom we care about above the pivot
  ceilPoll: 0.15,
  ceilFlatten: 0.85,            // fraction of the positive pitch given up under a hard ceiling
  ceilTau: 1.103,               // THEIR number: lerp 0.015/frame @60 Hz = -(1/60)/ln(0.985) s
  ceilMoveMin: 0.6,             // their gate was `if camera_player.direction` — ours is "moving"
  moveGrace: 0.083,             // 5 frames @60 Hz — see `_movingDebounced`

  /* ---- auto-yaw assist ---------------------------------------------------- */
  autoDelay: 1.2,               // no mouse for this long before we dare touch yaw
  autoFade: 0.45,               // and then fade the authority in over this
  autoRate: 0.95,               // rad/s ceiling
  autoGain: 1.7,
  autoDeadzone: 4 * DEG,
  autoMinSpeed: 2.0,
  autoAirScale: 0.45,

  /* ---- route telegraph ----------------------------------------------------- */
  /* The critics' actual complaint, in constants. COLLISION already indexes every rail, pole,
     hook, spire and ledge in the level (§4.6 `query`); this rig polls that index around the
     player and eases the framing toward whatever route is in reach. Two independent channels,
     because they answer two different questions:
       · UP   — "how high does this go?"  lift the look-at, tip the orbit up, lengthen the boom.
       · SIDE — "where does this line run?"  bias the yaw assist off the line's own heading so
                the rail crosses the screen instead of vanishing to a point. */
  routeRange: 9.5,              // sensing radius. Beyond this it is scenery, not a route
  routeNear: 2.6,               // full proximity weight at or inside this
  routePoll: 0.12,              // ~8 Hz. A route does not move; this does not need 60 Hz
  routeScan: 6,                 // shape-resolve at most this many candidates per poll
  routeRiseMin: 1.3,            // must climb this far above the look-at to be worth revealing
  routeRiseFull: 3.5,           // …and this far for the full reveal. A 4 m parapet is 2.6 m of it
  routeLift: 1.05,              // max metres the look-at rises toward the route's crest
  routePitch: -8.5 * DEG,       // max orbit pitch added (negative = camera drops, looks up)
  routeDist: 0.55,              // max metres added to the boom — room for a vertical line
  /* camera_parent.gd opens the lens when a target wants attention: `target.adj_fov` → 85.0 from
     a 75.0 base, +13%. Ours is +3% on a 52° base, because 13% of a 52° lens is +6.9° and at this
     focal length that reads as a zoom rather than as attention. Structure theirs, number ours. */
  routeFov: 1.6,
  routeIn: 0.40,                // blend in
  routeOut: 0.90,               // …and out more slowly. A reveal that snaps off reads as a bug
  routeAheadBias: 0.55,         // a route behind you still counts, at 45% — never zero
  routeLineMin: 0.35,           // horizontal fraction of the tangent before it counts as a "line"
  routeLineFull: 0.80,
  routeProfileAngle: 58 * DEG,  // how far off the line's own heading a profile view sits
  routeYawMax: 40 * DEG,        // …clamped to this much deviation from "behind Sly", ever
  routeYawRate: 0.55,           // rad/s ceiling — deliberately slower than autoRate
  routeSideFlip: 0.35,          // hysteresis before the profile picks the other side (rad)

  /* ---- recentre (R) ------------------------------------------------------- */
  recentreTime: 0.45,

  /* ---- speed coupling ------------------------------------------------------ */
  /* One smoothed ground speed, normalised by `speedRef`, feeds BOTH the FOV stretch and the
     boom dolly. It was `fovSpeedRef` while the FOV was the only consumer; the dolly below is
     the second, and a shared reference is the point — the two channels are the same physical
     read of "how fast is he going" and drifting them apart would let the lens and the boom
     disagree about what full speed means. */
  speedRef: 8.0,                // m/s at which both speed couplings saturate

  /* ---- FOV ---------------------------------------------------------------- */
  fovBase: 52,
  fovSpeedGain: 6.0,            // +6° at full run speed
  fovTime: 0.30,

  /* ---- shake -------------------------------------------------------------- */
  shakePos: 0.16,               // metres at strength 1 — deliberately small
  shakeRot: 0.055,              // rad at strength 1 (~3.2°) — rotation is what reads as impact
  shakeRoll: 0.075,
  shakeFov: 2.5,
  shakeFreqRot: 26,
  shakeFreqPos: 18,

  /* ---- misc --------------------------------------------------------------- */
  wallRoll: 5.5 * DEG,
  teleportSnap: 6.0,            // player moved this far in one frame → re-seed, don't sweep
  freeFlySpeed: 9.0,
  freeFlyFast: 30.0,
};

/**
 * Per-state framing. This table *is* the authored feel — every entry is a deliberate answer to
 * "what does the player need to see while doing this?".
 *
 *   dist   metres added to the boom          height  metres added to the pivot
 *   lead   multiplier on velocity lead       fov     degrees added
 *   pitch  radians added to the orbit pitch  side    lateral pivot offset (m, camera-right)
 *   stiff  multiplier on the spring times (>1 = softer, stiller)
 *   tau    blend time into this framing (never a cut)
 *   vtrack 1 = this state's vertical motion is sustained, not ballistic — see `_follow`
 */
const FRAMES = {
  idle:       { dist:  0.00, height:  0.00, lead: 0.35, fov:  0.0, pitch:  0.0 * DEG, side: 0.00, stiff: 1.15, tau: 0.35 },
  walk:       { dist:  0.20, height: -0.04, lead: 0.90, fov:  0.6, pitch:  0.0 * DEG, side: 0.00, stiff: 1.00, tau: 0.30 },
  /* Running: back and a little lower so the horizon opens up, and lead hard. */
  run:        { dist:  0.90, height: -0.16, lead: 1.40, fov:  2.4, pitch: -1.5 * DEG, side: 0.00, stiff: 0.92, tau: 0.28 },
  run_fast:   { dist:  1.60, height: -0.28, lead: 1.85, fov:  4.6, pitch: -2.5 * DEG, side: 0.00, stiff: 0.85, tau: 0.26 },
  /* Sneaking: close, tight, low. Intimate and tense — you feel the guard's cone. */
  sneak:      { dist: -1.70, height: -0.36, lead: 0.50, fov: -4.5, pitch:  1.5 * DEG, side: 0.18, stiff: 1.25, tau: 0.34 },
  crawl:      { dist: -1.90, height: -0.62, lead: 0.50, fov: -3.0, pitch:  4.0 * DEG, side: 0.00, stiff: 1.20, tau: 0.34 },
  /* Swing: wide, high and soft, so the pendulum arc reads as an arc. Lead frames the landing. */
  hook_swing: { dist:  2.30, height:  0.55, lead: 1.60, fov:  1.0, pitch: -3.0 * DEG, side: 0.85, stiff: 1.50, tau: 0.30 },
  /* Rail: behind and low, lens tightened — speed reads as compression, not FOV. */
  rail_slide: { dist:  1.30, height: -0.55, lead: 1.90, fov: -3.5, pitch: -1.0 * DEG, side: 0.00, stiff: 0.80, tau: 0.24 },
  /* Balance / spire: back and up to show the drop, and go very still. */
  balance:    { dist:  2.10, height:  1.00, lead: 0.20, fov: -3.0, pitch:  5.0 * DEG, side: 0.00, stiff: 1.60, tau: 0.45 },
  spire:      { dist:  2.70, height:  1.50, lead: 0.15, fov: -4.5, pitch:  7.0 * DEG, side: 0.00, stiff: 1.90, tau: 0.50 },
  /* Dive: snap in tight and fast, tip down. The shake does the rest. */
  dive:       { dist: -2.20, height:  0.35, lead: 0.40, fov:  3.5, pitch:  6.0 * DEG, side: 0.00, stiff: 0.55, tau: 0.09 },
  wall_run:   { dist:  0.60, height:  0.25, lead: 1.30, fov:  1.5, pitch: -1.0 * DEG, side: 0.35, stiff: 0.90, tau: 0.22, vtrack: 1 },
  /* Hanging: drop under the lip and look up past it — the point is what's *above*. */
  ledge_hang: { dist: -0.70, height:  1.15, lead: 0.20, fov: -1.5, pitch:-13.0 * DEG, side: 0.00, stiff: 1.30, tau: 0.36 },
  climb:      { dist:  0.35, height:  0.75, lead: 0.35, fov: -1.0, pitch: -7.0 * DEG, side: 0.00, stiff: 1.15, tau: 0.34, vtrack: 1 },
  glide:      { dist:  2.60, height:  0.85, lead: 1.50, fov:  3.0, pitch:  3.0 * DEG, side: 0.00, stiff: 1.30, tau: 0.40 },
  land:       { dist:  0.10, height: -0.10, lead: 0.70, fov:  0.5, pitch:  0.0 * DEG, side: 0.00, stiff: 0.75, tau: 0.14 },
  roll:       { dist: -0.40, height: -0.30, lead: 1.20, fov:  2.0, pitch:  1.0 * DEG, side: 0.00, stiff: 0.80, tau: 0.16 },
  air:        { dist:  0.55, height:  0.15, lead: 1.20, fov:  1.0, pitch:  0.0 * DEG, side: 0.00, stiff: 1.05, tau: 0.26 },
  combat:     { dist: -0.90, height:  0.10, lead: 0.50, fov: -2.0, pitch:  1.5 * DEG, side: 0.30, stiff: 0.90, tau: 0.18 },
};

/** Substring → framing key. Order matters: longest/most specific first. */
const STATE_RULES = [
  ['run_fast', 'run_fast'], ['sprint', 'run_fast'], ['run', 'run'],
  ['walk', 'walk'],
  ['sneak', 'sneak'], ['crouch', 'sneak'], ['tiptoe', 'sneak'],
  ['crawl', 'crawl'],
  ['hook', 'hook_swing'],
  ['rail_walk', 'balance'], ['rail_slide', 'rail_slide'], ['rail', 'rail_slide'],
  ['balance', 'balance'], ['perch', 'balance'],
  ['spire', 'spire'],
  ['dive', 'dive'],
  ['wall', 'wall_run'],
  ['ledge_hang', 'ledge_hang'], ['shimmy', 'ledge_hang'], ['ledge_climb', 'climb'],
  ['pole', 'climb'], ['climb', 'climb'],
  ['swing', 'hook_swing'],
  ['glide', 'glide'],
  ['land', 'land'],
  ['roll', 'roll'],
  ['jump', 'air'], ['fall', 'air'], ['apex', 'air'], ['air', 'air'],
  ['cane', 'combat'], ['combo', 'combat'], ['attack', 'combat'],
  ['idle', 'idle'],
];

/* Tags the camera must not be pushed around by: a hook ring or a rail line is visually
   see-through, and being shoved by one is worse than sighting through it. */
const CAM_SWEEP_OPTS = { ignoreTags: ['hazard', 'water', 'vent', 'rail', 'hook', 'spire'] };
const SOLID_TAGS = ['ground', 'wall', 'ledge', 'pole'];

/* ---- route telegraph tables ------------------------------------------------ */

/** The traversal tags worth telegraphing. AGENTS.md §4.4 defines every one of them. */
const ROUTE_TAGS = ['pole', 'hook', 'spire', 'rail', 'ledge'];

/**
 * How loudly each tag is worth announcing. `ledge` is last and quietest on purpose: it is the
 * one tag the level is *made* of — every step and platform edge carries it — so it earns its
 * reveal almost entirely through the rise gate rather than through the tag.
 */
const ROUTE_WEIGHT = { pole: 1.0, hook: 1.0, spire: 0.9, rail: 0.85, ledge: 0.75 };

/**
 * Once you are ON a route, FRAMES owns the shot and the telegraph gets out of the way — stacking
 * a reveal on top of an authored framing double-tilts it. Two exceptions, both deliberate:
 * `climb` and `ledge_hang` keep a fraction, because "how much further up does this go" is still
 * a live question while you are climbing. Absent from this table means full strength.
 */
const ROUTE_SUPPRESS = {
  rail_slide: 0, hook_swing: 0, balance: 0, spire: 0, dive: 0, glide: 0,
  climb: 0.45, ledge_hang: 0.35,
};

/**
 * Boom whiskers: [lateral × TUNE.whisker, vertical × TUNE.whiskerUp, authority].
 *
 * Authority is the fix for a measured defect. The whiskers exist so the boom shortens
 * *continuously* as a pillar approaches the sightline — but applied at full authority a whisker
 * clipping a column 38 cm off the sightline yanks the boom all the way in, which is a step, not a
 * ramp: a slow orbit past a 1.2 m column stepped 2.03 m in one frame. At 0.55 the whisker can
 * only ever claim half the shortening, so the column is met in two graded stages and the centre
 * cast — the only one that is actually the sightline — keeps full authority over it.
 *
 * The *set* is the reference's, and finding it there is the reason the vertical pair exists at
 * all: `Scenes/Design Tools/camera_parent.tscn` hangs four probe nodes off its Camera3D —
 * `Cam Right`, `Cam Left`, `Cam Up`, `Cam Down`, at ±1 m on X and Y — plus a sphere `Camera
 * Area3D` for the inside-geometry case, which is what our `col.overlap` belt-and-braces does.
 * This rig had the lateral pair and neither vertical one, so a lintel or a tomb ceiling was
 * invisible until it crossed the sightline and then arrived all at once. Offsets are ours (0.38 /
 * 0.30 against a 5.4 m boom and a 0.34 m cast radius, not 1 m); graded authority is ours; the
 * observation that a camera needs to feel *above and below* itself as well as beside is theirs.
 */
const WHISKERS = [
  [0, 0, 1.00],
  [1, 0, 0.55],
  [-1, 0, 0.55],
  [0, 1, 0.45],
  [0, -1, 0.35],
];

/* ---------------------------------------------------------------------------- */
/*  scratch — nothing in update() allocates                                     */
/* ---------------------------------------------------------------------------- */
const _pPos = new THREE.Vector3();
const _pVel = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _boomDir = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _off = new THREE.Vector3();
const _crest = new THREE.Vector3();
const _line = new THREE.Vector3();
const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _UP = new THREE.Vector3(0, 1, 0);

/* Unity-style critically damped smooth-damp: stable at any dt, no overshoot. Writes the new
   velocity to `_sdVel` because returning a pair would allocate. */
let _sdVel = 0;
function smoothDamp(cur, tgt, vel, smoothTime, dt, maxSpeed) {
  if (dt <= 0) { _sdVel = vel; return cur; }
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = cur - tgt;
  if (maxSpeed !== undefined) {
    const maxChange = maxSpeed * smoothTime;
    if (change > maxChange) change = maxChange;
    else if (change < -maxChange) change = -maxChange;
  }
  const goal = cur - change;
  const temp = (vel + omega * change) * dt;
  _sdVel = (vel - omega * temp) * decay;
  let out = goal + (change + temp) * decay;
  // Kill the last sliver of overshoot so "settled" means settled.
  if ((tgt - cur > 0) === (out > tgt)) { out = tgt; _sdVel = 0; }
  return out;
}

/** Exponential approach — for blends where a spring's inertia would be wrong. */
function ease(cur, tgt, tau, dt) {
  if (dt <= 0) return cur;
  return cur + (tgt - cur) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); }
function wrapPi(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/* Cheap deterministic value noise. Shake wants *coherent* wobble, not per-frame hash — white
   noise reads as a broken renderer, band-limited noise reads as an impact. */
function hash1(n) { const s = Math.sin(n * 127.1) * 43758.5453123; return s - Math.floor(s); }
function vnoise(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1;
}
/** Three octaves: a dominant thud with grit on top. */
function fbm(x) { return vnoise(x) * 0.62 + vnoise(x * 2.17 + 31.4) * 0.27 + vnoise(x * 4.31 + 77.7) * 0.11; }

/* ---------------------------------------------------------------------------- */

export class CameraRig {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;

    /* ---- public orbit state (AGENTS.md §4 interface) ---- */
    this.yaw = Math.PI;                    // Sly spawns facing north; start behind him
    this.pitch = TUNE.pitchDefault;
    this.distance = TUNE.distDefault;      // the player's zoom setting
    this.boom = TUNE.distDefault;          // the length actually in use after framing + occlusion
    this.mode = 'follow';
    this.pivot = new THREE.Vector3(0, TUNE.pivotHeight, 0);
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.locked = false;

    /* ---- follow ---- */
    this._pivotVel = new THREE.Vector3();
    this._vSign = 0;
    this._vHold = 0;
    this._boomWant = TUNE.distDefault;
    this._boomWantVel = 0;
    this._boomVel = 0;
    this._boomHold = 0;
    this._recovering = false;

    /* ---- framing blend ---- */
    this._frame = { dist: 0, height: 0, lead: 1, fov: 0, pitch: 0, side: 0, stiff: 1 };
    this._frameKey = 'idle';
    this._stateName = '';
    this._sideSign = 0;
    this._roll = 0;
    this._fovCur = TUNE.fovBase;
    this._fovApplied = -1;
    this._speedSm = 0;

    /* ---- assists ---- */
    this._idleLook = TUNE.autoDelay;       // start ready to assist
    this._recentreT = -1;
    this._recentreFrom = 0;
    this._recentrePitchFrom = 0;
    this._swallowLook = 0;

    /* ---- focus ---- */
    this._focusPos = new THREE.Vector3();
    this._focusDur = 0;
    this._focusT = 0;
    this._focusW = 0;

    /* ---- shake ---- */
    this._shakeAmp = 0;
    this._shakeDur = 0;
    this._shakeT = 0;
    this._shakeSeed = 0;
    /* No `_lastShakeAt` here. There was one — initialised to -1, written at the end of `shake()`,
       read by nothing, in either direction, anywhere in src/ tools/ or tests/. It is the same
       write-only register `Controller.js` keeps a list of (`c.pole`, `lastWallRec`, `spireLaunch`,
       `hitWall`) and the same defect as the `jumpHeld`/`_hurtReq` pair removed from it. The
       "don't stomp a big shake with a small one" rule below needs the shake's *remaining
       amplitude*, which `_shakeAmp * _shakeEnv()` already gives exactly; a timestamp answers a
       question nothing asks. */

    /* ---- wall side probe ---- */
    this._wallSide = 0;
    this._wallProbeT = 0;

    /* ---- route telegraph ---- */
    this._routeT = 0;
    this._routeUpRaw = 0;      // what the poll last found…
    this._routeSideRaw = 0;
    this._routeUpW = 0;        // …and the eased weights actually applied
    this._routeSideW = 0;
    this._routeLineYaw = 0;    // heading along the sensed line
    this._routeSide = 1;       // which side of it we chose to sit, with hysteresis

    /* ---- ceiling settle ---- */
    this._ceilT = 0;
    this._ceilRaw = 0;
    this._ceilW = 0;
    this._moveGrace = 0;

    /* ---- collision ---- */
    this._collision = null;
    this._collisionT = 0;
    this._collisionBroken = false;

    /* ---- housekeeping ---- */
    this._prevPlayer = new THREE.Vector3();
    this._hadPlayer = false;
    this._shotHeld = false;
    this._freeFly = false;
    this._freePos = new THREE.Vector3();
    this._offs = [];
    this._warnedNoCollision = false;
  }

  async init() {
    const engine = this.engine;

    this._offs.push(engine.on('pointerlock', (locked) => {
      this.locked = !!locked;
      // Some drivers deliver one enormous movementX on acquisition; Input caps it, but
      // dropping the first frame outright is free insurance against a whip on click.
      if (locked) this._swallowLook = 2;
    }));

    // A canonical shot teleports Sly and poses the camera. When the harness hands control back
    // we must re-seed rather than sweep across the level from wherever the shot left us.
    this._offs.push(engine.on('shot', () => { this._shotHeld = true; }));

    this._collision = engine.get('collision');
    this.snap(true);
  }

  /* ======================================================================== */
  /*  public API                                                              */
  /* ======================================================================== */

  /** 'follow' | 'aim' | 'cinematic' | 'free' */
  setMode(name) {
    const m = String(name || 'follow');
    if (m !== 'follow' && m !== 'aim' && m !== 'cinematic' && m !== 'free') {
      this.engine.warn(`camera: unknown mode "${name}" — staying in ${this.mode}`);
      return;
    }
    if (m === this.mode) return;
    if (m === 'free') this._enterFreeFly();
    else if (this.mode === 'free') this._exitFreeFly();
    this.mode = m;
    this._freeFly = (m === 'free');
  }

  /**
   * Impact shake. Rotation-dominant with a small positional and FOV component; decays to
   * *exactly* zero. `shake(0.35, 0.25)` is the dive-attack slam (AGENTS.md §6).
   */
  shake(strength = 0.3, duration = 0.25) {
    const s = clamp(Number(strength) || 0, 0, 2);
    const d = Number(duration) || 0;
    if (s <= 0 || d <= 0) return;
    // A weaker hit must not stomp a big one that's still ringing.
    const remaining = this._shakeAmp * this._shakeEnv();
    if (s >= remaining) {
      this._shakeAmp = s;
      this._shakeDur = Math.max(0.05, d);
      this._shakeT = 0;
      this._shakeSeed += 13.37;            // no two impacts wobble the same way
    } else {
      this._shakeDur = Math.max(this._shakeDur, this._shakeT + d * 0.5);
    }
  }

  /**
   * Draw the eye to something — a guard, the treasure. Blends the look-at toward `worldPos`
   * with an ease in and out, and (only if the player isn't touching the mouse) turns the orbit
   * to bring it on screen. Pass null to cancel.
   */
  focus(worldPos, duration = 1.2) {
    if (!worldPos) { this._focusDur = 0; this._focusT = 0; return; }
    this._focusPos.set(worldPos.x || 0, worldPos.y || 0, worldPos.z || 0);
    this._focusDur = Math.max(0.1, Number(duration) || 1.2);
    this._focusT = 0;
  }

  /** Re-seed the rig at its ideal pose. Used on teleports, mode changes and shot hand-back. */
  snap(reorient = false) {
    this._readPlayer();
    const mv = this.engine.get('movement');
    if (reorient) {
      const yaw = (mv && typeof mv.yaw === 'number') ? mv.yaw : this.yaw;
      this.yaw = yaw;
      this.pitch = TUNE.pitchDefault;
      this._recentreT = -1;
    }
    this._resolveFrame(this._stateName, true);
    /* These have to be cleared BEFORE `_pivotGoal`, not with the rest of the bookkeeping below:
       `_routeUpW` is a term in the goal, so seeding the pivot with the reveal from wherever the
       player used to be is exactly the class of stale-state bug `_boomWantVel` was. */
    this._routeUpRaw = 0; this._routeSideRaw = 0;
    this._routeUpW = 0; this._routeSideW = 0;
    this._routeT = 0;
    this._ceilRaw = 0; this._ceilW = 0; this._ceilT = 0; this._moveGrace = 0;
    this._buildBasis(this.yaw);
    this._pivotGoal(_goal, 1);
    this.pivot.copy(_goal);
    this._pivotVel.set(0, 0, 0);
    this._vSign = 0;
    this._vHold = 0;
    this._boomWant = clamp(this.distance + this._frame.dist, TUNE.distHardMin, TUNE.distMax + 3);
    this.boom = this._boomWant;
    this._boomVel = 0;
    // Was missing, and it is not cosmetic: a stale `_boomWantVel` survives a re-seed and kicks
    // the boom on the first frame after a teleport or a shot hand-back.
    this._boomWantVel = 0;
    this._boomHold = 0;
    this._recovering = false;
    this._shakeAmp = 0; this._shakeDur = 0; this._shakeT = 0;
    this._fovCur = TUNE.fovBase + this._frame.fov;
    this._speedSm = 0;
    this._roll = 0;
    this._sideSign = 0;
    this._wallSide = 0;
    this._focusDur = 0;
    this._hadPlayer = true;
    this._prevPlayer.copy(_pPos);
    if (!this.engine.debug.freeCam) this._write(0);
  }

  /* ======================================================================== */
  /*  frame                                                                   */
  /* ======================================================================== */

  update(dt, t) {
    const engine = this.engine;

    /* The screenshot harness owns the camera in freeCam. Touching it here would fight every
       canonical shot, so we are not even allowed to look. */
    if (engine.debug.freeCam) { this._shotHeld = true; return; }
    if (this._shotHeld) { this._shotHeld = false; this.snap(true); return; }

    const input = engine.input;
    if (!input) return;

    if (dt < 0) dt = 0;
    if (dt > 1 / 20) dt = 1 / 20;

    this._pollCollision(dt);

    // F1 flips a debug fly-cam. Separate from engine.debug.freeCam, which belongs to the harness.
    if (input.pressed && input.pressed('freecam')) {
      this.setMode(this._freeFly ? 'follow' : 'free');
    }

    let lx = input.look ? input.look.x : 0;
    let ly = input.look ? input.look.y : 0;
    if (this._swallowLook > 0) { this._swallowLook--; lx = 0; ly = 0; }

    if (this._freeFly) { this._flyCam(dt, lx, ly); return; }

    this._readPlayer();
    this._speedTrack(dt);
    this._detectTeleport(dt);
    this._resolveFrame(this._stateName, false);
    this._blendFrame(dt);
    this._senseRoute(dt);
    this._orbit(dt, lx, ly, input);
    /* `_focusBlend` moved above `_buildBasis`, and this is a fix rather than a tidy-up: it
       writes `this.yaw`, and running it after the basis was built meant its yaw never reached
       `this.forward` — so the boom direction, the occlusion cast and the written pose all used
       the *previous* frame's heading and the focus pull took effect a frame late, against a
       sightline that had already been cleared for somewhere else. */
    this._focusBlend(dt);
    this._buildBasis(this.yaw);
    this._ceilSettle(dt);
    this._follow(dt);
    this._boomLength(dt);
    this._write(dt);
  }

  /* ---------------------------------------------------------------- player -- */

  _readPlayer() {
    const mv = this.engine.get('movement');
    if (mv && mv.position && typeof mv.position.x === 'number') {
      _pPos.copy(mv.position);
      if (mv.velocity && typeof mv.velocity.x === 'number') _pVel.copy(mv.velocity);
      else _pVel.set(0, 0, 0);
      this._grounded = mv.grounded !== false;
      this._stateName = typeof mv.stateName === 'string' ? mv.stateName : '';
      this._playerYaw = typeof mv.yaw === 'number' ? mv.yaw : null;
    } else {
      // MOVEMENT may not exist yet. Orbit the origin so the rig is still testable.
      _pPos.set(0, 0, 0);
      _pVel.set(0, 0, 0);
      this._grounded = true;
      this._stateName = '';
      this._playerYaw = null;
    }
  }

  /**
   * One smoothed ground speed per frame, for every consumer.
   *
   * This is a step in `update()` rather than a line inside `_write()` — where it used to live,
   * when the FOV stretch was its only reader — because `_boomLength()` now reads it too and
   * runs five calls earlier. Easing it inside whichever consumer happens to run last would
   * hand the boom a one-frame-stale speed and, worse, make the coupling silently depend on
   * method order: reorder `update()` and the dolly changes behaviour with nothing to show for
   * it. Computed once, after `_readPlayer()` has refreshed `_pVel`, read by both.
   */
  _speedTrack(dt) {
    this._speedSm = ease(this._speedSm, Math.hypot(_pVel.x, _pVel.z), 0.22, dt);
  }

  /** 0 at a standstill, 1 at `speedRef`. The shared lever for FOV stretch and boom dolly. */
  _speedNorm() {
    return clamp(this._speedSm / TUNE.speedRef, 0, 1);
  }

  _detectTeleport(dt) {
    if (!this._hadPlayer) { this._hadPlayer = true; this._prevPlayer.copy(_pPos); return; }
    const moved = this._prevPlayer.distanceTo(_pPos);
    this._prevPlayer.copy(_pPos);
    // A respawn or a cutscene warp must re-seed. Interpolating a 40 m jump is a 2-second
    // helicopter shot nobody asked for.
    if (moved > TUNE.teleportSnap && dt > 0 && moved / dt > 120) this.snap(false);
  }

  /* --------------------------------------------------------------- framing -- */

  _resolveFrame(stateName, force) {
    if (!force && stateName === this._lastResolved) return;
    this._lastResolved = stateName;
    let key = 'idle';
    if (stateName) {
      const s = stateName.toLowerCase();
      for (let i = 0; i < STATE_RULES.length; i++) {
        if (s.indexOf(STATE_RULES[i][0]) !== -1) { key = STATE_RULES[i][1]; break; }
      }
    }
    this._frameKey = key;
    if (force) {
      const f = FRAMES[key] || FRAMES.idle;
      this._frame.dist = f.dist; this._frame.height = f.height; this._frame.lead = f.lead;
      this._frame.fov = f.fov; this._frame.pitch = f.pitch; this._frame.side = f.side;
      this._frame.stiff = f.stiff;
    }
  }

  _blendFrame(dt) {
    const f = FRAMES[this._frameKey] || FRAMES.idle;
    const c = this._frame;
    const tau = f.tau;
    c.dist = ease(c.dist, f.dist, tau, dt);
    c.height = ease(c.height, f.height, tau, dt);
    c.lead = ease(c.lead, f.lead, tau, dt);
    c.fov = ease(c.fov, f.fov, tau, dt);
    c.pitch = ease(c.pitch, f.pitch, tau, dt);
    c.side = ease(c.side, f.side, tau, dt);
    c.stiff = ease(c.stiff, f.stiff, tau, dt);

    /* Which side is the wall on? Two short probes answer it without MOVEMENT having to
       publish anything, and the answer only matters a few times a second. */
    const wallish = this._frameKey === 'wall_run';
    this._wallProbeT -= dt;
    if (wallish && this._wallProbeT <= 0) {
      this._wallProbeT = 0.1;
      this._wallSide = this._probeWallSide();
    } else if (!wallish) {
      this._wallSide = 0;
    }
    // Bank into the wall. Rolling the horizon is the cheapest "this is athletic" cue there is.
    this._roll = ease(this._roll, -this._wallSide * TUNE.wallRoll, 0.22, dt);

    /* Lateral framing offset picks its side from where Sly is actually heading, so a hook
       swing opens up toward the destination instead of guessing left or right. */
    const lat = _pVel.x * this.right.x + _pVel.z * this.right.z;
    const want = Math.abs(lat) > 0.6 ? Math.sign(lat) : this._sideSign;
    this._sideSign = ease(this._sideSign, want, 0.35, dt);
  }

  _probeWallSide() {
    const col = this._solidCollision();
    if (!col || typeof col.raycast !== 'function') return this._wallSide;
    _from.copy(_pPos); _from.y += 1.0;
    let hitR = false, hitL = false;
    try {
      _off.copy(this.right);
      let r = col.raycast(_from, _off, 1.3, CAM_SWEEP_OPTS);
      hitR = !!(r && r.hit);
      _off.copy(this.right).multiplyScalar(-1);
      r = col.raycast(_from, _off, 1.3, CAM_SWEEP_OPTS);
      hitL = !!(r && r.hit);
    } catch (err) { this._breakCollision(err); return this._wallSide; }
    if (hitR === hitL) return this._wallSide;
    return hitR ? 1 : -1;
  }

  /* ------------------------------------------------------- route telegraph -- */

  /**
   * Sense the route, then ease the two channels toward what was sensed.
   *
   * The sense is a poll, not a subscription: nothing needs to be published, no new event enters
   * the bus, and a build with no COLLISION module (or a level with no traversal geometry) simply
   * has both weights pinned at zero and behaves exactly as this rig did before. The eased weights
   * are what everything downstream reads, so the 8 Hz poll never shows up as an 8 Hz staircase.
   */
  _senseRoute(dt) {
    this._routeT -= dt;
    if (this._routeT <= 0) {
      this._routeT = TUNE.routePoll;
      this._pickRoute();
    }
    /* On the route, FRAMES owns the shot. */
    const sup = ROUTE_SUPPRESS[this._frameKey];
    const gate = sup === undefined ? 1 : sup;
    const upT = this._routeUpRaw * gate;
    const sideT = this._routeSideRaw * gate;
    this._routeUpW = ease(this._routeUpW, upT,
      upT > this._routeUpW ? TUNE.routeIn : TUNE.routeOut, dt);
    this._routeSideW = ease(this._routeSideW, sideT,
      sideT > this._routeSideW ? TUNE.routeIn : TUNE.routeOut, dt);
  }

  /**
   * One poll: ask COLLISION what traversal geometry is within `routeRange`, and score it.
   *
   * `base` = tag weight × proximity × how far ahead it is. Each channel then multiplies `base` by
   * its own ramp — rise for the lift, horizontal-ness for the profile — and the winner is chosen
   * on whichever ramp is larger, so a route is never rejected for failing the test belonging to
   * the other channel. The ramps are also what make `ledge` safe to sense at all: the level is
   * built out of that tag, and a kerb has neither rise nor line, so it scores zero and the camera
   * never so much as twitches at it.
   *
   * Measured, and the scenario is part of the measurement — a score is a function of crest height
   * AND distance, so a bare "4 m parapet → 0.369" is not reproducible. Standing at the origin, a
   * `ledge` **dead ahead at 4.63 m**: a 0.2 m kerb → 0.0000, a 4 m parapet → 0.3689
   * (near 0.7913 × riseRamp 0.6216 × weight 0.75). `tests/camera.test.mjs` re-derives that from
   * the constants and asserts the code agrees to 1e-6, so it survives a retune of any of them.
   */
  _pickRoute() {
    this._routeUpRaw = 0;
    this._routeSideRaw = 0;

    const col = this._solidCollision();
    if (!col || typeof col.query !== 'function') return;

    let hits = null;
    try { hits = col.query(_pPos, TUNE.routeRange, ROUTE_TAGS); }
    catch (err) { this._breakCollision(err); return; }
    if (!hits || hits.length === 0) return;

    /* "Where am I going" — travel when he is moving, where the player is looking when he is not.
       The second half is what lets a standing player pan onto a route and have it answer. */
    const sp = Math.hypot(_pVel.x, _pVel.z);
    const hx = sp > 1.0 ? _pVel.x / sp : this.forward.x;
    const hz = sp > 1.0 ? _pVel.z / sp : this.forward.z;

    const eyeY = _pPos.y + TUNE.pivotHeight;
    let bestScore = 0, bestUp = 0, bestSide = 0, bestLineYaw = 0;
    // `hits` is sorted near→far and pooled by COLLISION — read it now, retain nothing from it.
    const n = Math.min(hits.length, TUNE.routeScan);
    for (let i = 0; i < n; i++) {
      const h = hits[i];
      const tag = h.tag || h.rec?.tag || '';
      const w = ROUTE_WEIGHT[tag];
      if (!w || !h.point) continue;

      const d = Number.isFinite(h.distance) ? h.distance : _pPos.distanceTo(h.point);
      const near = 1 - smoothstep(TUNE.routeNear, TUNE.routeRange, d);
      if (near <= 0) continue;

      const dx = h.point.x - _pPos.x, dz = h.point.z - _pPos.z;
      const dh = Math.hypot(dx, dz);
      // Dead ahead = 1, dead behind = -1. Behind is damped, never silenced: the only route in
      // reach still deserves to be found, exactly as COLLISION's own `_facingPenalty` argues.
      const ahead = dh > 0.4 ? (dx * hx + dz * hz) / dh : 1;
      const facing = 1 - TUNE.routeAheadBias * (1 - ahead) * 0.5;
      const base = w * near * facing;

      /* The two ramps are deliberately NOT multiplied together. A pole has all the rise and no
         line; a rail at chest height has all the line and no rise; both are routes and each
         should drive its own channel at full strength. Tying the profile swing to the rise gate
         (the first version of this did) made a long flat rail — the single most legible line in
         the level — the one thing the camera refused to show you. */
      const lineness = this._routeShape(h);      // fills _crest and _line
      const riseRamp = smoothstep(TUNE.routeRiseMin, TUNE.routeRiseFull, _crest.y - eyeY);
      const lineRamp = smoothstep(TUNE.routeLineMin, TUNE.routeLineFull, lineness);
      const routeness = Math.max(riseRamp, lineRamp);
      if (routeness <= 0) continue;            // a kerb: tagged `ledge`, but not a route

      const score = base * routeness;
      if (score <= bestScore) continue;
      bestScore = score;
      bestUp = base * riseRamp;
      bestSide = base * lineRamp;
      bestLineYaw = lineRamp > 0 ? Math.atan2(_line.x, _line.z) : 0;
    }

    if (bestScore <= 0) return;
    this._routeUpRaw = clamp(bestUp, 0, 1);
    this._routeSideRaw = clamp(bestSide, 0, 1);
    this._routeLineYaw = bestLineYaw;
  }

  /**
   * Resolve a query hit into a crest (`_crest`) and a horizontal line direction (`_line`, unit),
   * returning how much of that line is horizontal — 0 for a pole, ~1 for a level rail.
   *
   * Everything read here is the **published** authoring contract of AGENTS.md §4.4:
   * `mesh.userData.spline` for rails and poles, `mesh.userData.point` for hooks and spires.
   * `userData.top` is not in that contract — ARCHITECTURE happens to author it on poles — so it
   * is a bonus branch behind a finite check, never a requirement.
   */
  _routeShape(h) {
    _crest.copy(h.point);
    _line.set(0, 0, 0);
    let line3 = 0;

    const ud = h.rec && h.rec.mesh ? h.rec.mesh.userData : null;
    const spline = ud && ud.spline && typeof ud.spline.getPoint === 'function' ? ud.spline : null;
    if (spline) {
      try {
        spline.getPoint(0, _sa);
        spline.getPoint(1, _sb);
        spline.getPoint(0.5, _sc);           // an arched rail can crest between its ends
        _crest.copy(_sa.y >= _sb.y ? _sa : _sb);
        if (_sc.y > _crest.y) _crest.copy(_sc);
        _line.set(_crest.x - h.point.x, _crest.y - h.point.y, _crest.z - h.point.z);
        line3 = _line.length();
      } catch { _crest.copy(h.point); _line.set(0, 0, 0); line3 = 0; }
    } else if (ud && Number.isFinite(ud.top)) {
      _crest.set(h.point.x, ud.top, h.point.z);
    } else if (ud && ud.point && Number.isFinite(ud.point.y)) {
      _crest.copy(ud.point);
    }

    /* Close to the crest the chord degenerates; the tangent at the joining point is the better
       answer for "which way does this line run" and COLLISION hands it to us already. */
    if (line3 < 0.30 && h.tangent) {
      _line.copy(h.tangent);
      line3 = _line.length();
    }
    if (line3 < 1e-4) { _line.set(0, 0, 0); return 0; }

    const lh = Math.hypot(_line.x, _line.z);
    _line.set(_line.x, 0, _line.z);
    if (lh > 1e-4) _line.multiplyScalar(1 / lh);
    return lh / line3;
  }

  /**
   * The heading that puts the sensed line *across* the frame rather than end-on.
   *
   * A camera looking straight along a rail sees a dot. `routeProfileAngle` off the line's own
   * heading is a three-quarter view: the rail sweeps away and its destination is legible, and the
   * direction of travel is still readable — a full 90° profile shows the line beautifully and
   * makes the controls unreadable, which is a bad trade in a game where W is camera-relative.
   * Both signs are valid; we take the nearer, with hysteresis so it cannot flutter at the
   * crossover, and the caller clamps how far this is allowed to drag the shot.
   */
  _routeProfileYaw() {
    const a = wrapPi(this._routeLineYaw + TUNE.routeProfileAngle);
    const b = wrapPi(this._routeLineYaw - TUNE.routeProfileAngle);
    const da = Math.abs(wrapPi(a - this.yaw));
    const db = Math.abs(wrapPi(b - this.yaw));
    const want = da <= db ? 1 : -1;
    if (want !== this._routeSide && Math.abs(da - db) > TUNE.routeSideFlip) this._routeSide = want;
    return this._routeSide > 0 ? a : b;
  }

  /* ------------------------------------------------------- ceiling settle -- */

  /**
   * A slow ambient pitch settle driven by the headroom over the player.
   *
   * Adapted from `Scripts/camera_parent.gd` (licence: none stated — see the provenance note at
   * the top of this file), which runs `pitch += (target_pitch - pitch) * pitch_adjust_spring`
   * with `pitch_adjust_spring = 0.015` — τ = -(1/60)/ln(0.985) = 1.103 s — targeted from a
   * floor-or-roof probe, and only `if camera_player.direction`, i.e. only while travelling.
   *
   * Three things are ours and had to be, and it is worth saying which:
   *   · **The sign.** Their two targets are −0.125 and −0.375 rad on a node whose parenting I
   *     cannot resolve without running Godot, so I did not copy a direction I could not verify.
   *     Ours is derived from our own convention: under a ceiling the camera gives up its positive
   *     (overhead) pitch and flattens toward level, which is the pose that fits in a corridor.
   *   · **It never inverts.** `ceilFlatten` scales the pitch it already has toward 0 and stops
   *     there, so a hard ceiling can flatten the shot but can never drive the camera into the
   *     floor — which a fixed −21.5° offset added to a small pitch would.
   *   · **It is a framing offset, not a write to `this.pitch`.** Theirs mutates the player's own
   *     pitch. In this rig that is the mouse's channel and rule 1 says we do not touch it.
   *
   * The payoff is the same as theirs, and it is not cosmetic: pre-emptively flattening under a
   * lintel is how the boom stops being *shoved* by one. The probe is cast from the pivot, which
   * is player-anchored, so it cannot feed back into the camera pose it is adjusting.
   */
  _ceilSettle(dt) {
    this._ceilT -= dt;
    if (this._ceilT <= 0) {
      this._ceilT = TUNE.ceilPoll;
      this._ceilRaw = this._probeCeiling();
    }
    this._ceilW = ease(this._ceilW, this._ceilRaw * this._movingDebounced(dt), TUNE.ceilTau, dt);
  }

  /**
   * "Is he travelling?", debounced — 1 while moving, 0 after `moveGrace` of stillness.
   *
   * A bare `speed > threshold` flickers for a whole second either side of a walk, and a 1.1 s
   * spring driven by a flickering flag settles nowhere. `Scripts/motion_tracker.gd` in the
   * reference has exactly this debounce (`move_grace_frames = 5`, i.e. the 83 ms above) and it is
   * the right idea, so the idea is what was taken.
   *
   * **Its implementation is not, because it does not work, and that is worth writing down rather
   * than quietly diverging from.** Two independent faults, both read off the source:
   *   1. Nothing ever resets `move_miss_counter` when the player *does* move — the only branch
   *      that touches it is the one entered when he has not — so once the counter reaches
   *      `move_grace_frames` it decrements, re-increments, and `moving` oscillates every frame.
   *   2. `distance_buffer = 0.1` is compared against per-`_physics_process`-frame displacement,
   *      so at Godot's 60 Hz default it is a 6 m/s threshold — above that project's own
   *      `SPEED = 4.0`. With their tuning the tracker reports "not moving" while the player runs.
   * Ours is a countdown timer refreshed by speed: monotone, frame-rate independent, no latch.
   */
  _movingDebounced(dt) {
    if (Math.hypot(_pVel.x, _pVel.z) > TUNE.ceilMoveMin) this._moveGrace = TUNE.moveGrace;
    else this._moveGrace = Math.max(0, this._moveGrace - dt);
    return this._moveGrace > 0 ? 1 : 0;
  }

  _probeCeiling() {
    const col = this._solidCollision();
    if (!col || typeof col.raycast !== 'function') return 0;
    _from.copy(this.pivot);
    _off.set(0, 1, 0);
    try {
      const r = col.raycast(_from, _off, TUNE.ceilProbe, CAM_SWEEP_OPTS);
      if (r && r.hit) {
        const d = Number.isFinite(r.distance) ? r.distance : TUNE.ceilProbe;
        return clamp(1 - d / TUNE.ceilProbe, 0, 1);
      }
    } catch (err) { this._breakCollision(err); }
    return 0;
  }

  /* ----------------------------------------------------------------- orbit -- */

  _orbit(dt, lx, ly, input) {
    const cinematic = this.mode === 'cinematic';

    /* Mouse goes straight in. No filter, no ramp, no acceleration curve — the hand and the
       frame move together or the camera feels broken. */
    let touched = false;
    if (!cinematic && (lx !== 0 || ly !== 0)) {
      this.yaw = wrapPi(this.yaw - lx);
      this.pitch = clamp(this.pitch + ly, TUNE.pitchMin, TUNE.pitchMax);
      touched = true;
      this._recentreT = -1;                 // any mouse input cancels an assist in flight
    }
    this._idleLook = touched ? 0 : this._idleLook + dt;

    /* Scroll zoom. */
    const z = input.zoom || 0;
    if (z !== 0 && !cinematic) {
      this.distance = clamp(this.distance + z * TUNE.zoomStep, TUNE.distMin, TUNE.distMax);
    }

    /* R recentres behind Sly with an ease. */
    if (input.pressed && input.pressed('recentre')) {
      this._recentreT = 0;
      this._recentreFrom = this.yaw;
      this._recentrePitchFrom = this.pitch;
    }
    if (this._recentreT >= 0) {
      this._recentreT += dt;
      const u = smoothstep(0, 1, this._recentreT / TUNE.recentreTime);
      const target = this._behindYaw();
      this.yaw = wrapPi(this._recentreFrom + wrapPi(target - this._recentreFrom) * u);
      this.pitch = this._recentrePitchFrom + (TUNE.pitchDefault - this._recentrePitchFrom) * u;
      if (this._recentreT >= TUNE.recentreTime) this._recentreT = -1;
    } else if (!touched) {
      this._yawAssist(dt);
    }

    this.pitch = clamp(this.pitch, TUNE.pitchMin, TUNE.pitchMax);
  }

  /** Heading to sit behind the player: their facing if we have it, else their travel. */
  _behindYaw() {
    if (this._playerYaw !== null) return this._playerYaw;
    const sp = Math.hypot(_pVel.x, _pVel.z);
    return sp > 0.3 ? Math.atan2(_pVel.x, _pVel.z) : this.yaw;
  }

  /**
   * The yaw assist. **One controller, one target heading** — this used to be two.
   *
   * The base behaviour is unchanged: swing behind Sly while he runs, but ONLY after the mouse has
   * been still for `autoDelay`, and then faded in. Overlapping the player's own aim for even a
   * frame is the difference between "helpful" and "the camera is fighting me".
   *
   * The route telegraph then *bends that one target* toward a profile of the line, rather than
   * pulling on `this.yaw` itself. That distinction is the whole reason this is a single function:
   * two assists writing the same field is not a feature, it is a race — the winner would be
   * whichever ran last, and neither would reach its target while the other was live.
   *
   * The gates are the existing ones, deliberately. The profile swing does not get a softer bar
   * than the behind-swing already has, so the camera still never moves on its own while the
   * player is standing still, and the mouse still cancels everything the instant it moves.
   */
  _yawAssist(dt) {
    if (this.mode === 'aim') return;
    if (this._idleLook < TUNE.autoDelay) return;
    const speed = Math.hypot(_pVel.x, _pVel.z);
    if (speed < TUNE.autoMinSpeed) return;

    const behind = Math.atan2(_pVel.x, _pVel.z);
    let target = behind;
    let cap = TUNE.autoRate;

    if (this._routeSideW > 0.02) {
      /* Bend toward the line, then clamp the bend. `routeYawMax` is a hard promise: however the
         rail is oriented, the assist never puts the camera more than 40° off Sly's heading, so
         "camera-relative forward" never stops meaning roughly forward. */
      const swing = clamp(wrapPi(this._routeProfileYaw() - behind), -TUNE.routeYawMax, TUNE.routeYawMax);
      target = wrapPi(behind + swing * this._routeSideW);
      cap = Math.min(cap, TUNE.routeYawRate);
    }

    const err = wrapPi(target - this.yaw);
    if (Math.abs(err) < TUNE.autoDeadzone) return;

    const fade = smoothstep(TUNE.autoDelay, TUNE.autoDelay + TUNE.autoFade, this._idleLook);
    const speedScale = clamp(speed / 6.0, 0, 1) * (this._grounded ? 1 : TUNE.autoAirScale);
    const rate = Math.min(Math.abs(err) * TUNE.autoGain, cap) * fade * speedScale;
    const step = Math.sign(err) * rate * dt;
    this.yaw = wrapPi(this.yaw + (Math.abs(step) > Math.abs(err) ? err : step));
  }

  /**
   * The rig's own frame. `right` is `forward × up`, which is the definition the whole project
   * strafes on (`Controller._readInput`, `_rgt.crossVectors(_fwd, UP)`).
   *
   * It was `(cy, 0, -sy)` — the exact negation, measured at −1.000 for every yaw. A field named
   * `right` holding the left vector, and the third and last site of a basis inversion that faked
   * two findings in `Moveset.js` across two rounds before it was caught.
   *
   * **Two of the five consumers could not see it and three could**, which is why this took a
   * measured before/after rather than a sign flip:
   *
   *   unaffected  `_sideSign` projects velocity ON `right` and `_pivotGoal` applies the result
   *               back ALONG `right`, so both signs flipped together and the framing offset was
   *               always correct. Verified unchanged, to the digit: |offset| 0.847196 either way,
   *               and `rig.yaw` identical at −0.1624, which is what rules out the yaw path
   *               reading `right` on the quiet. The whisker pair is ±1 at equal authority
   *               combined with `min`, so the probe set is invariant under `right → -right`;
   *               also verified unchanged at 5.00000 / 0.88000 / 5.00000.
   *   corrected   the bank now leans INTO the wall (camUp·toWall −0.0957 → +0.0957 on BOTH
   *               sides), as `_blendFrame`'s comment always said it did. The `aim` shoulder now
   *               offsets over his right (−0.4500 → +0.4500). The debug fly-cam now strafes the
   *               way the stick points (−3.0000 → +3.0000).
   *
   * `tests/traversal.test.mjs` holds all five as numbers, with the two invariants as hard
   * equalities. Nothing here is derived: the roll convention was taken by forcing `_roll` and
   * reading the quaternion `_write` produces, and "bank into the wall" was tested as the physical
   * claim it is — does `camUp` tip toward the wall — because a hand-derived basis is what caused
   * this whole family of bugs. Banking AWAY on both sides was the tell: a wrong constant banks
   * the same way regardless of side, an inverted input banks away from whichever side it is.
   */
  _buildBasis(yaw) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    this.forward.set(sy, 0, cy);
    this.right.set(-cy, 0, sy);
  }

  /* ---------------------------------------------------------------- follow -- */

  /** Ideal look-at point: player + framing height + velocity lead + lateral offset. */
  _pivotGoal(out, leadScale) {
    const f = this._frame;
    const vy = _pVel.y;
    const climbing = Math.max(0, vy);
    const falling = Math.max(0, -vy);

    let y = _pPos.y + TUNE.pivotHeight + f.height;
    y += Math.min(1, climbing / TUNE.climbSpeed) * TUNE.climbLift;
    y -= Math.min(falling * TUNE.fallLeadTime, TUNE.fallLeadMax);
    /* Route reveal. A *bounded* lift, not an aim at the crest: pointing the look-at at the top
       of a 12 m pole would show the route beautifully and put Sly off the bottom of the frame,
       which is the trade this whole file exists to refuse. One metre buys most of the read. */
    y += this._routeUpW * TUNE.routeLift;

    out.set(_pPos.x, y, _pPos.z);

    // Lead the look-at along the ground velocity — more of it the faster he's going, so you
    // are always looking where you'll be, not where you were.
    const lead = TUNE.leadTime * f.lead * leadScale;
    let lx = _pVel.x * lead, lz = _pVel.z * lead;
    const ll = Math.hypot(lx, lz);
    if (ll > TUNE.leadMax) { const k = TUNE.leadMax / ll; lx *= k; lz *= k; }
    out.x += lx; out.z += lz;

    const aim = this.mode === 'aim' || !!(this.engine.input?.down?.('focus'));
    const side = f.side * this._sideSign + (aim ? 0.45 : 0);
    out.addScaledVector(this.right, side);
  }

  _follow(dt) {
    this._pivotGoal(_goal, 1);
    const f = this._frame;
    const p = this.pivot;
    const v = this._pivotVel;

    /* Deadzone, applied to the *goal* rather than the output: inside it the spring has literally
       nothing to chase, so an idle or a fidget produces a dead-still frame. */
    const ex = _goal.x - p.x, ez = _goal.z - p.z;
    const eh = Math.hypot(ex, ez);
    let gx = p.x, gz = p.z;
    if (eh > 1e-6) {
      const k = Math.max(0, eh - TUNE.deadzoneH) / eh;
      gx = p.x + ex * k; gz = p.z + ez * k;
    }
    /* Vertical softness, earned back against the error it is producing — but only when the
       vertical motion causing that error is *sustained*. Two ways to establish that, and the
       cheap one is exact:
         · the state says so. `vtrack` marks the framings where Sly is driving himself along a
           vertical surface, so a pole climb is known to be a climb on frame one — no heuristic,
           no latency, and it is the case the critics actually complained about.
         · otherwise, his vertical velocity has held one sign longer than a whole jump lasts. A
           full 2.52 m jump ascends for 0.458 s and descends for 0.458 s, so `followHoldMin` at
           0.55 s exempts every jump in the game by construction while still catching a long
           fall, a lift, or a long ramp within about half a second.
       Either way the error ramp gates it, so a stair (error < 0.55 m) is untouched regardless. */
    const ey = _goal.y - p.y;
    const ay = Math.abs(ey);
    const vy = _pVel.y;
    if (Math.abs(vy) < 0.5) {
      this._vHold = Math.max(0, this._vHold - dt * 2);   // let go faster than it builds
    } else {
      const s = vy > 0 ? 1 : -1;
      if (s !== this._vSign) { this._vSign = s; this._vHold = 0; } else this._vHold += dt;
    }
    const sustained = Math.max(
      (FRAMES[this._frameKey] || FRAMES.idle).vtrack || 0,
      smoothstep(TUNE.followHoldMin, TUNE.followHoldFull, this._vHold));
    const hard = smoothstep(TUNE.followErrSoft, TUNE.followErrHard, ay) * sustained;
    const dzV = TUNE.deadzoneV * (1 - 0.75 * hard);
    const gy = ay > 1e-6 ? p.y + ey * (Math.max(0, ay - dzV) / ay) : p.y;

    const stiff = f.stiff;
    p.x = smoothDamp(p.x, gx, v.x, TUNE.followTimeH * stiff, dt, TUNE.maxFollowH); v.x = _sdVel;
    p.z = smoothDamp(p.z, gz, v.z, TUNE.followTimeH * stiff, dt, TUNE.maxFollowH); v.z = _sdVel;
    // Vertical gets its own, much longer time constant. This is the whole reason stairs and
    // hops don't make the frame seasick — see `followErrSoft` for why it is not a constant.
    const timeV = TUNE.followTimeV * stiff * (1 - (1 - TUNE.followStiffV) * hard);
    p.y = smoothDamp(p.y, gy, v.y, timeV, dt, TUNE.maxFollowV); v.y = _sdVel;

    /* Leash, applied last so nothing above it can reason its way past it. When it engages the
       spring's stored velocity is dropped: the pivot is being dragged, not swung, and carrying
       40 m/s of imagined momentum into the moment it lets go is a hitch on touchdown. */
    const slack = _goal.y - p.y;
    if (slack > TUNE.followLeashV) { p.y = _goal.y - TUNE.followLeashV; v.y = 0; }
    else if (slack < -TUNE.followLeashV) { p.y = _goal.y + TUNE.followLeashV; v.y = 0; }
  }

  /* ------------------------------------------------------------------ boom -- */

  _effectivePitch() {
    const falling = Math.max(0, -_pVel.y);
    const climbing = Math.max(0, _pVel.y);
    let p = this.pitch + this._frame.pitch;
    // Falling fast: tip down so the landing is on screen before you reach it.
    p += smoothstep(2, TUNE.fallPitchSpeed, falling) * TUNE.fallPitch;
    p += smoothstep(1, TUNE.climbSpeed, climbing) * TUNE.climbPitch;
    // Route reveal: drop the camera and look up the line. Suppressed by the fall tip above by
    // construction — you are not being shown a climb while you are plummeting off one.
    p += this._routeUpW * TUNE.routePitch;
    // Ceiling: give up overhead pitch, toward level and no further. Never inverts (see `_ceilSettle`).
    if (this._ceilW > 0 && p > 0) p -= p * TUNE.ceilFlatten * this._ceilW;
    return clamp(p, TUNE.pitchMin, TUNE.pitchMax);
  }

  _boomLength(dt) {
    const aim = this.mode === 'aim' || !!(this.engine.input?.down?.('focus'));
    let want = this.distance + this._frame.dist + (aim ? -1.1 : 0);
    want += this._speedNorm() * TUNE.distSpeedGain;   // the speed dolly — see `distSpeedGain`
    want += this._routeUpW * TUNE.routeDist;   // room in frame for the vertical line
    if (this.mode === 'cinematic') want += 1.4;
    want = clamp(want, TUNE.distHardMin, TUNE.distMax + 3);
    this._boomWant = smoothDamp(this._boomWant, want, this._boomWantVel || 0, TUNE.zoomTime, dt);
    this._boomWantVel = _sdVel;

    const pitch = this._effectivePitch();
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    _boomDir.set(-this.forward.x * cp, sp, -this.forward.z * cp);

    const allowed = this._castBoom(this._boomWant, _boomDir);
    const capped = Math.min(this._boomWant, allowed);
    const occluded = allowed < this._boomWant - 1e-3;

    if (capped <= this.boom) {
      // Pull in the instant geometry demands it — never clip, not even for a frame. Whiskers
      // make `allowed` fall off continuously, so in practice this reads as a smooth push-in.
      this.boom = capped;
      this._boomVel = 0;
      this._boomHold = occluded ? TUNE.recoverDelay : 0;
      if (occluded) this._recovering = true;
    } else {
      this._boomHold = Math.max(0, this._boomHold - dt);
      if (this._boomHold <= 0) {
        if (occluded) this._recovering = true;
        const slow = this._recovering;
        this.boom = smoothDamp(
          this.boom, capped, this._boomVel,
          slow ? TUNE.recoverTime : TUNE.zoomTime, dt,
          slow ? TUNE.recoverSpeed : 14
        );
        this._boomVel = _sdVel;
        if (this.boom >= this._boomWant - 0.02) this._recovering = false;
      }
    }
    this.boom = clamp(this.boom, TUNE.distHardMin, TUNE.distMax + 3);
  }

  /**
   * Sphere-cast the sightline (AGENTS.md §4.6). Four casts: the boom itself, a whisker either
   * side, and one overhead. The whiskers are the trick — they notice an approaching column a
   * fifth of a second before it crosses the sightline, so the boom shortens continuously instead
   * of stepping, which is what stops the push-in reading as a glitch.
   *
   * Two measured corrections to that idea live here, and the first is a defect I found by
   * simulating a slow orbit past a 1.2 m column rather than by reading the code:
   *
   *  · **A whisker used to speak with the sightline's full authority.** The instant it clipped
   *    the column, the boom was yanked to the whisker's distance even though the sightline was
   *    still clear — a 2.03 m step in one frame, i.e. precisely the pop this design was written
   *    to remove. `WHISKERS` now grades authority: an off-axis cast can only ever claim its share
   *    of the shortening, so the column is met in stages and the centre cast finishes the job.
   *  · **The vertical pair is new**, and comes from the reference — see `WHISKERS`. The old set
   *    was lateral only, so a lintel was invisible until it crossed the sightline and then
   *    arrived all at once, and nothing at all watched the floor. The down whisker matters more
   *    now than it would have before: the route telegraph makes negative pitches common, and a
   *    negative pitch is how a boom ends up in the ground.
   */
  _castBoom(want, dir) {
    const col = this._solidCollision();
    if (!col) return want;
    let allowed = want;
    for (let i = 0; i < WHISKERS.length; i++) {
      const w = WHISKERS[i];
      _from.copy(this.pivot);
      if (w[0]) _from.addScaledVector(this.right, w[0] * TUNE.whisker);
      if (w[1]) _from.y += w[1] * TUNE.whiskerUp;
      _to.copy(_from).addScaledVector(dir, want);
      const d = this._sweep(_from, _to, want);
      if (d >= want) continue;
      const claim = want - (want - d) * w[2];
      if (claim < allowed) allowed = claim;
    }

    /* Belt and braces: if the resulting point is still inside something (a cast can miss a
       corner it starts flush against), find the longest boom that isn't. Bisection rather than
       the old fixed 0.45 m retreat — three 0.45 m steps resolve the same 1.35 m span to 45 cm
       and put a visible jolt in the frame, five bisections resolve it to ~4 cm for the same
       worst-case number of overlap queries, and this path only runs when we are already inside
       geometry. */
    if (typeof col.overlap === 'function') {
      _camPos.copy(this.pivot).addScaledVector(dir, allowed);
      let inside = false;
      try {
        const hits = col.overlap(_camPos, TUNE.camRadius * 0.85, SOLID_TAGS);
        inside = !!(hits && hits.length);
      } catch (err) { this._breakCollision(err); }
      if (inside) {
        let lo = TUNE.distHardMin, hi = allowed;
        for (let i = 0; i < 5; i++) {
          const mid = (lo + hi) * 0.5;
          _camPos.copy(this.pivot).addScaledVector(dir, mid);
          let hits = null;
          try { hits = col.overlap(_camPos, TUNE.camRadius * 0.85, SOLID_TAGS); }
          catch (err) { this._breakCollision(err); break; }
          if (hits && hits.length) hi = mid; else lo = mid;
        }
        allowed = lo;
      }
    }
    return Math.max(TUNE.distHardMin, allowed);
  }

  /** One sphere/ray cast; returns the boom length it permits. */
  _sweep(from, to, want) {
    const col = this._collision;
    try {
      if (typeof col.capsuleSweep === 'function') {
        // Height 0 makes the capsule a sphere, which is what a camera boom wants.
        const r = col.capsuleSweep(from, to, TUNE.camRadius, 0, CAM_SWEEP_OPTS);
        if (r && r.hit) return Math.max(TUNE.distHardMin, (r.distance ?? want) - TUNE.camPad);
      } else if (typeof col.raycast === 'function') {
        _off.copy(to).sub(from);
        const len = _off.length();
        if (len < 1e-5) return want;
        _off.multiplyScalar(1 / len);
        const r = col.raycast(from, _off, len, CAM_SWEEP_OPTS);
        if (r && r.hit) {
          return Math.max(TUNE.distHardMin, (r.distance ?? want) - TUNE.camRadius - TUNE.camPad);
        }
      }
    } catch (err) { this._breakCollision(err); }
    return want;
  }

  _pollCollision(dt) {
    if (this._collisionBroken) return;
    if (this._collision) return;
    this._collisionT -= dt;
    if (this._collisionT > 0) return;
    this._collisionT = TUNE.collisionPoll;
    this._collision = this.engine.get('collision');
  }

  _solidCollision() {
    const col = this._collision;
    if (!col || this._collisionBroken) return null;
    if (col.ready === false) return null;
    if (typeof col.capsuleSweep !== 'function' && typeof col.raycast !== 'function') {
      if (!this._warnedNoCollision) {
        this._warnedNoCollision = true;
        this.engine.warn('camera: collision module exposes neither capsuleSweep nor raycast — occlusion off');
      }
      return null;
    }
    return col;
  }

  _breakCollision(err) {
    if (this._collisionBroken) return;
    this._collisionBroken = true;
    this.engine.warn(`camera: collision query threw (${err?.message || err}) — occlusion disabled`);
  }

  /* ----------------------------------------------------------------- focus -- */

  _focusBlend(dt) {
    if (this._focusDur <= 0) { this._focusW = 0; return; }
    this._focusT += dt;
    const u = this._focusT / this._focusDur;
    if (u >= 1) { this._focusDur = 0; this._focusW = 0; return; }
    // In quickly, hold, out slowly — a focus that snaps off reads as a bug.
    this._focusW = smoothstep(0, 0.22, u) * (1 - smoothstep(0.68, 1, u));

    // Turning the orbit is strictly opt-in: never while the player has their hand on the mouse.
    if (this._idleLook < TUNE.autoDelay * 0.5 || this.mode === 'aim') return;
    _off.copy(this._focusPos).sub(this.pivot);
    if (_off.lengthSq() < 0.04) return;
    const target = Math.atan2(_off.x, _off.z);
    const err = wrapPi(target - this.yaw);
    const rate = Math.min(Math.abs(err) * 2.0, 1.4) * this._focusW;
    const step = Math.sign(err) * rate * dt;
    this.yaw = wrapPi(this.yaw + (Math.abs(step) > Math.abs(err) ? err : step));
  }

  /* ----------------------------------------------------------------- shake -- */

  _shakeEnv() {
    if (this._shakeAmp <= 0 || this._shakeDur <= 0) return 0;
    const u = this._shakeT / this._shakeDur;
    if (u >= 1) return 0;
    const k = 1 - u;
    return k * k;                          // hits at full amplitude, lands at exactly zero
  }

  /* ----------------------------------------------------------------- write -- */

  _write(dt) {
    const cam = this.engine.camera;
    if (!cam) return;

    const pitch = this._effectivePitch();
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    _boomDir.set(-this.forward.x * cp, sp, -this.forward.z * cp);
    _camPos.copy(this.pivot).addScaledVector(_boomDir, this.boom);

    _lookAt.copy(this.pivot);
    _lookAt.y += TUNE.headroom;             // Sly sits just under centre: headroom reads composed
    if (this._focusW > 0) {
      _lookAt.lerp(this._focusPos, this._focusW * 0.8);
    }

    /* Shake. Advance first so a shake fired this frame is already at full amplitude. */
    let env = 0;
    if (this._shakeAmp > 0) {
      this._shakeT += dt;
      env = this._shakeEnv();
      if (env <= 0) { this._shakeAmp = 0; this._shakeDur = 0; this._shakeT = 0; }
    }
    const amp = this._shakeAmp * env;

    _m4.lookAt(_camPos, _lookAt, _UP);
    _q1.setFromRotationMatrix(_m4);

    let rollTotal = this._roll;
    if (amp > 0) {
      const s = this._shakeSeed;
      const tr = this.engine.time * TUNE.shakeFreqRot;
      // Rotation is the dominant channel — that is what the eye reads as force. Position is a
      // whisper by comparison, because big positional shake just looks like a loose tripod.
      const rp = fbm(tr + s) * amp * TUNE.shakeRot;
      const ry = fbm(tr * 1.13 + s + 51.2) * amp * TUNE.shakeRot;
      rollTotal += fbm(tr * 0.87 + s + 91.7) * amp * TUNE.shakeRoll;
      _eul.set(rp, ry, 0, 'YXZ');
      _q2.setFromEuler(_eul);
      _q1.multiply(_q2);

      const tp = this.engine.time * TUNE.shakeFreqPos;
      _off.set(
        fbm(tp + s + 7.1) * amp * TUNE.shakePos,
        fbm(tp * 1.21 + s + 23.9) * amp * TUNE.shakePos,
        fbm(tp * 0.79 + s + 63.3) * amp * TUNE.shakePos * 0.5
      );
      _off.applyQuaternion(_q1);
      _camPos.add(_off);
    }
    if (rollTotal !== 0) {
      _eul.set(0, 0, rollTotal, 'YXZ');
      _q2.setFromEuler(_eul);
      _q1.multiply(_q2);
    }

    cam.position.copy(_camPos);
    cam.quaternion.copy(_q1);

    /* FOV: a modest speed stretch. Enough to feel velocity, not enough to notice as a zoom.
       `_speedSm` is eased once per frame in `_speedTrack`, so this reads the same number the
       boom dolly did. */
    const fovTarget = TUNE.fovBase + this._frame.fov
      + this._speedNorm() * TUNE.fovSpeedGain
      + this._routeUpW * TUNE.routeFov;
    this._fovCur = ease(this._fovCur, fovTarget, TUNE.fovTime, dt);
    const fov = this._fovCur + amp * TUNE.shakeFov;
    if (Math.abs(fov - this._fovApplied) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this._fovApplied = fov;
    }

    // Modules that update after us (fx, guards, hud, postfx) read matrixWorld this frame.
    cam.updateMatrixWorld(true);
  }

  /* ---------------------------------------------------------------- fly cam -- */

  _enterFreeFly() {
    this._freePos.copy(this.engine.camera.position);
    this._freeFly = true;
  }

  _exitFreeFly() {
    this._freeFly = false;
    this.snap(false);
  }

  /** Debug fly-cam: WASD + mouse, Space/Ctrl for altitude, Shift to sprint. No collision. */
  _flyCam(dt, lx, ly) {
    const input = this.engine.input;
    const cam = this.engine.camera;
    if (!cam) return;

    this.yaw = wrapPi(this.yaw - lx);
    this.pitch = clamp(this.pitch + ly, -85 * DEG, 85 * DEG);
    this._buildBasis(this.yaw);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Fly along the view, not along the ground — a debug cam that can't dive is useless.
    _fwd.set(this.forward.x * cp, -sp, this.forward.z * cp);
    _right.copy(this.right);

    const speed = (input.down('sneak') ? TUNE.freeFlyFast : TUNE.freeFlySpeed);
    const mv = input.move || { x: 0, y: 0 };
    _off.set(0, 0, 0);
    _off.addScaledVector(_fwd, mv.y);
    _off.addScaledVector(_right, mv.x);
    if (input.down('jump')) _off.y += 1;
    if (input.down('crouch')) _off.y -= 1;
    if (_off.lengthSq() > 1e-8) _off.normalize().multiplyScalar(speed * dt);
    this._freePos.add(_off);

    _lookAt.copy(this._freePos).addScaledVector(_fwd, 1);
    _m4.lookAt(this._freePos, _lookAt, _UP);
    _q1.setFromRotationMatrix(_m4);
    cam.position.copy(this._freePos);
    cam.quaternion.copy(_q1);
    if (Math.abs(TUNE.fovBase - this._fovApplied) > 0.01) {
      cam.fov = TUNE.fovBase;
      cam.updateProjectionMatrix();
      this._fovApplied = TUNE.fovBase;
    }
    cam.updateMatrixWorld(true);
  }

  /* ======================================================================== */

  dispose() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this._collision = null;
  }
}

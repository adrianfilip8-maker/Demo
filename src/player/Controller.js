import * as THREE from 'three';
import { StateMachine } from './States.js';
import { buildMoveset } from './Moveset.js';
import { TargetField } from './Targets.js';

/**
 * Controller — Sly's character controller. Hand-rolled kinematic capsule, swept against the
 * COLLISION BVH, driving a hierarchical state machine that holds the whole §6 moveset.
 *
 * Division of labour:
 *   Controller  owns the capsule, the numbers, collision resolution, affordance discovery,
 *               and the per-frame contract with ANIMATION / CAMERA.
 *   Moveset.js  owns *what each move does* — one class per move.
 *   States.js   owns *which move wins* — priority + group polling.
 *
 * Everything in TUNE is a feel decision, not an implementation detail. Numbers come straight
 * from AGENTS.md §6; where a number here differs from the spec's it is because the spec gives
 * the *measured outcome* and the constant has to pay for discrete integration to hit it — those
 * are called out individually.
 */

export const TUNE = {
  /* ---- capsule. Sly is 1.8 m (§6). ---- */
  height:       1.80,
  radius:       0.34,
  crouchHeight: 1.06,
  crawlHeight:  0.64,
  stepHeight:   0.42,   // stairs and kerbs are climbed, not collided with
  groundSnap:   0.34,   // how far below the feet a walk keeps sticking to the floor
  probeUp:      0.32,   // ground probes start slightly inside the capsule to survive float error

  /* ---- speeds (§6) ---- */
  walkSpeed:   2.6,
  sneakSpeed:  1.4,
  runSpeed:    7.2,
  crouchSpeed: 1.7,
  crawlSpeed:  1.15,
  tiptoeSpeed: 1.5,
  /* ---- accel / decel. Both compared against the reference and both DELIBERATELY UNCHANGED;
     the comparison is recorded because "we looked and decided not to" is worth more than silence.

     Ours is a flat cap in `accelerate()`: 0 → 7.2 m/s in 0.189 s over 0.682 m, and 7.2 → 0 in
     0.277 s over 0.997 m. `slyrepos/godot`'s `Scripts/player__sly.gd` uses a *speed-dependent*
     step instead — `move_toward(v, target, clamp(1 - h_vel/SPEED, 0.15, 0.75))` per 60 Hz frame,
     i.e. 45 m/s² off the mark falling to 9 m/s² as it approaches top speed. Simulated at their
     numbers that is 0 → 4.0 m/s in 0.183 s, essentially the same *duration* as ours but a very
     different shape: 2.4× the initial bite and a soft top-out. Their decel is `lerp(v, 0, 0.25)`
     per frame — exponential, τ 57.9 ms — which scaled to our 7.2 m/s stops inside **0.475 m**
     against our 0.997 m. **Ours slides 2.10× further to a stop.** That is a real difference in how
     heavy Sly reads, and the honest answer is that it is a feel decision of the same class as
     `landHard` below: `tests/level.test.mjs` mirrors `accelerate` term-for-term in its offline
     ballistic instrument (`arcMin`, the `worst < 0.30 m` agreement assertion), so changing the
     curve is a coordinated change across MOVEMENT and that test, not a constant edit. Written up
     rather than smuggled in.

     One thing that IS worth saying against the reference: its own speed factor reads
     `Vector3(velocity.x, 0, velocity.y).length()` — `velocity.y`, not `.z`. Its acceleration
     curve is therefore keyed off vertical speed on one axis. That is a bug in the source, not a
     design, and it is why none of its constants are imported here. ---- */
  accel:       38,
  decel:       26,
  airControl:  0.55,    // fraction of ground accel available in the air
  airDrag:     0.6,     // gentle, so a hook release keeps its launch

  /* ---- gravity / jump (§6) ---- */
  gravity:     -24,
  maxFall:     -40,
  jumpV0:      11.0,    // v0²/2g = 2.52 m; apex-hang trims it to the spec'd 2.5
  /* Analytic v for a 1.9 m gain is sqrt(2·24·1.9) = 9.55. Semi-implicit Euler plus the
     apex-hang decay eat ~0.14 m of that, so the constant is raised to make the *measured*
     gain the 1.9 m the spec actually asks for. */
  doubleJumpV0: 9.90,
  jumpCut:      0.45,   // releasing Space cuts vy by 55% (§6)
  apexHang:     0.72,   // vy ×0.72 per 60 Hz frame while |vy| < apexWindow — the float
  apexWindow:   2.2,
  /* ---- §723B: the apex beat's residence ceiling, presentation only. -------------------------
     `Fall` shows `jump_apex` while |vy| < apexWindow. In FREE fall that window is a MOMENT:
     gravity crosses it in 2·2.2/24 = 0.18 s at most, and the apex-hang above makes the rising
     half faster, not slower (×0.72/frame toward zero) — measured on the shipped level, a run-off
     jump spends ≤ 5 frames (0.08 s) inside it. A body that stays in the window LONGER is not at
     an apex; it is being carried along a surface that keeps topping vy up (a steep slope climbed
     against the grounding probe's rising guard holds vy ≈ +0.95 for seconds, §723B's trace), and
     holding the apex pose there is the "pose freezes on a steep slope" the owner reported —
     `jump_apex` moves 1.25°/frame against walk's 8.3. 0.30 s is the free-fall ceiling with a
     ~1.7× margin: no ballistic arc can reach it, every measured surf does (3.0 s / 5.6 s).
     Read by `Fall.update` alone; nothing in the simulation consumes it. */
  surfBeat:     0.30,
  /* ---- coyote + jump buffer. Both measured against the reference, both kept. ---------------
     `coyote` 0.110 s is a *time*, and that is the one place this file is unambiguously better
     than `slyrepos/godot`'s `Scripts/player__sly.gd`: theirs counts **frames**
     (`const coyote_time_max = 5`, plus a `floor_grace_time = 0.25` second stage), so its
     forgiveness is 83 ms at 60 Hz and 35 ms at 144 Hz — the same player gets less help on the
     better machine. Measured here on the shipped controller: a ground jump is granted for a lead
     of **0..6 frames = 117 ms** after the floor goes away, which is 0.110 s plus the frame the
     `_preTimers`/`_probeGround` ordering costs, and it is the same 117 ms at any frame rate.

     `jumpBufferMs` 140 is a *game*-time window and, since this change, is actually measured on
     the game clock — `Input.buffered` used to run on `performance.now()`. Measured on a fall that
     arrives at 10.000 m/s: the buffer reaches **8 frames / 1.333 m of approach** at `timeScale` 1
     on either clock, but under Thief-o-Vision (`visionScale` 0.35) the wall clock reached only
     **0.477 m** against the game clock's **1.371 m**. See the header of `src/core/Input.js`. ---- */
  coyote:       0.110,
  jumpBufferMs: 140,
  ledgeSnap:    0.45,   // horizontal assist toward a ledge a jump would just miss
  turnGround:   14,
  turnAir:      8,

  /* ---- skid / roll ---- */
  skidSpeed:  4.6,      // below this a reversal is just a turn, not a skid
  skidDot:   -0.55,     // how hard the reversal has to be
  skidDecel:  30,
  skidMin:    0.12,
  rollSpeed:  8.4,
  rollTime:   0.44,
  rollTurn:   5.0,

  /* ---- wall tech (§6) ---- */
  wallRunSpeed:   4.8,
  wallRunUp:      5.6,   // head-on entry runs *up* the wall instead of along it
  wallRunMax:     1.4,
  wallRunGravity: 0.25,
  wallRunEnter:   3.2,   // min horizontal speed to stick
  wallClingMax:   2.0,
  wallClingSlide: 0.12,  // gravity multiplier while clinging
  wallJumpOut:    7.2,
  wallJumpUp:     0.94,  // × jumpV0
  wallProbe:      0.40,  // how far past the capsule to look for a wall
  wallNormalMax:  0.45,  // |n.y| below this counts as a wall — loose, the temple is battered
  /* One face, one bite. ---------------------------------------------------------------------
     Two contacts count as the SAME wall face when they share a collision rec and their outward
     normals agree to better than this; a face already used this airborne period cannot be
     *polled* into again (see `wallSpent`). Without it the moveset contains a free vertical
     climb, which is the one thing §8.1's Pylon Ascent must not have — measured against the
     shipped level, `wallJump → doubleJump → wallCling → wallJump` on a single flat face climbed
     **17.81 m of the hall's 13 m front wall** and put Sly on top of the 26 m entry pylon, at
     roughly +0.55 m every five frames, from a plain five-frame jump mash. `WallJump.enter`
     re-grants `airJumps`, `WallCling` was freely re-enterable, and the two of them closed a loop
     with no ceiling. `lastWallRec` has been written by `WallRun.enter` since the file was first
     drafted and was never read anywhere: the guard existed, it was simply never wired up.

     0.5 = 60°, and the number is a geometric statement rather than a taste one. It is the widest
     cone that still separates two faces of a rectangular mass (90° apart, dot 0 — a pylon corner
     stays a fresh face, which is what "up the pylon face" in §8.1 asks for), while still reading
     the 45°-apart facets of an 8-segment cylinder proxy (dot 0.707) as one surface, so a column
     cannot be laddered facet by facet. The battered temple faces drift by their own batter
     (~5°) along a single run, which this swallows without noticing. */
  wallFaceDot:    0.5,

  /* ---- ledge tech ---- */
  hangReach:  1.56,      // hand height above the feet
  hangDrop:   1.62,      // feet sit this far below the ledge top while hanging
  shimmy:     1.05,
  climbTime:  0.30,

  /* ---- rail (§6) ---- */
  railSpeed:   9.5,
  railMax:     15.0,
  railFriction: 0.55,
  railSway:    6 * Math.PI / 180,
  railSwayHz:  2.1,
  railWalk:    2.4,
  railMount:   1.35,     // generous: Sly games never make you fight for a rail
  railJumpUp:  0.90,

  /* ---- pole (§6) ---- */
  poleUp:      3.0,
  poleDown:    8.0,
  poleSpin:    1.9,
  poleMount:   1.9,
  poleJumpOut: 6.5,
  poleJumpUp:  0.88,
  poleSwingSpin: 5.2,
  poleSwingTime: 0.42,
  poleSwingLaunch: 1.22,
  /* Re-grab lockout after leaving a pole under your own power — the exact counterpart of
     `hangLock` on ledges, and needed for the same reason. `PoleClimb.canEnter` auto-grabs any
     shaft within `poleMount` 1.9 m that you are heading toward, and the deliberate exits leave
     you well inside that: the top hop rises only 0.7 m and lands you on the capital with the
     shaft directly below. Without a lockout the hop is re-grabbed inside the same frame — the
     state machine runs up to four passes — and the obelisk becomes the dead end its own code
     comment says the hop exists to prevent. 0.40 s = the hop's rise to apex (6.05 m/s at our
     gravity, 0.25 s) plus `jumpBufferMs` 0.14, so a held jump cannot fight the lockout either. */
  poleLockout: 0.40,
  /* Minimum wind-up before a pole swing may be released. `hookMinSwing` 0.18 exists for exactly
     this on the rope and the pole had no equivalent: `PoleClimb.update` returns 'poleSwing' on
     `pressed('attack')`, and the *same* still-true press then satisfied PoleSwing's own release
     test on its first pass — which launched, which put Sly in `jump` (group 'air') with the press
     STILL live, which `DiveAttack` (priority 95) took. One tap on a pole read as a cane slam.
     0.14 s = `jumpBufferMs`: the window this game already treats as one press, so the press that
     starts a swing can never be the press that ends it. */
  poleSwingMin: 0.14,

  /* ---- hook (§6). The best-feeling move in the game. ---- */
  hookL:       2.2,      // pendulum length, anchor -> feet
  hookRelease: 1.15,     // tangential velocity multiplier on release
  hookGrab:    9.0,      // lock-on range with E / RMB
  hookAuto:    2.9,      // airborne fly-through auto-grab, so chains flow
  hookCone:    1.75,     // ~100°, generous
  hookDamp:    0.30,
  hookPump:    7.0,      // W/S pumps the swing like a real one
  hookMinSwing: 0.18,    // can't bail instantly — stops accidental release on grab frame
  hookUpKick:  2.4,      // release adds a little lift so a launch clears the next ledge

  /* ---- spire (§6) ---- */
  spireGrab:   3.4,
  spireJump:   1.25,     // × jumpV0
  spireWobble: 0.10,
  /* Re-grab lockout after leaving a tip — the third member of a family this file already has two
     of (`hangLock` on ledges, `poleLockout` on poles), and it was the one that was missing.

     Without it a spire is fly-paper. `SpireLand.update`'s two deliberate exits both `return`, the
     machine runs up to four passes per frame, and `SpireLand.canEnter` (priority 90, the highest
     pollable move that is not the dive) re-took the tip on the very next pass — with Sly still
     standing on the point, still at zero velocity, so every clause passed. `enter` then copies
     `a.point` back into `c.position`. Measured on the pinnacle at (−6, 27, −50): **crouch held
     for 240 frames left the tip 0 times, and the 0.16 s walk-off the code's own comment describes
     never completed once.** Five `spire` bodies in §8.1 — the obelisk pyramidion and the four
     pylon pinnacles — and the only exit that worked was one with enough vertical speed to fail
     the `velocity.y > 0.8` clause on its own.

     0.30 s is read straight off the predicate it has to outlive. `canEnter`'s "only from above"
     clause is `point.y <= position.y + 1.0`, so the grab dies once Sly is more than 1.0 m below
     the tip, and a fall of 1.0 m from rest at `gravity` −24 takes sqrt(2/24) = 0.289 s (clean
     ballistic — `apexHang` only trims a *rising* vy). 0.30 puts the lock just past that, so both
     exits clear their own re-grab window under gravity alone and nothing wider is claimed. */
  spireLockout: 0.30,

  /* ---- combat ---- */
  comboWindow: 0.34,
  /* §716: these are FLOORS, not the delivered windows — `Moveset.comboStateTime` returns
     `max(comboTimes[i], clip contact + comboFollow)` so a slot whose bound clip strikes late
     (slot 3's `Cane Hit 2`, contact 0.375) gets 0.505 s instead of having its strike cut,
     while every arm whose contacts sit at 0.10–0.21 s (proc, `?combo=mono`, slots 1/2)
     delivers exactly these numbers as it always did. comboFollow 0.13 is the largest constant
     that keeps that bit-exactness — the binding case is proc combo_1 (0.28 − 0.15). */
  comboTimes:  [0.28, 0.28, 0.40],
  comboFollow: 0.13,
  comboLunge:  [2.4, 2.6, 3.8],
  diveSpeed:   18,
  diveRadius:  1.2,
  diveShake:   0.35,
  bounceUp:    0.86,     // × jumpV0

  /* ---- lock-on + circle-strafe. -----------------------------------------------------------
     The move this file had no equivalent of. Sly reads as a thief rather than a jogger because
     when a guard matters he *orbits* him: the camera holds the mark, Sly holds the mark, and the
     stick stops meaning north/east and starts meaning tangent/radius. RMB already is the lock
     button in §6.1 ("hold = Thief-o-Vision + hook lock-on"), so this needs no new binding and
     cannot fire by accident. ---- */
  lockRange:   6.0,      // acquire distance. The combo lunges 2.4–3.8 m and `pickRange` is 2.4,
                         // so 6 m is "one committed step and a swing away" — near enough that the
                         // encounter is about this guard, far enough to circle before committing.
  lockDrop:    8.4,      // 1.4 × lockRange. Pure hysteresis: without a wider break distance the
                         // lock chatters at the boundary and the camera's `combat` framing pumps
                         // in and out with it, which reads as a camera fault rather than a guard.
  lockDot:    -0.15,     // the mark may sit up to ~99° off the camera's forward. Generous, because
                         // the player has already declared intent by holding the button; the cone
                         // only exists to pick *which* of two nearby guards is meant.
  strafeSpeed: 4.6,      // tangential. Between walk 2.6 and run 7.2: at the 3 m mid-orbit radius
                         // it is ω = 1.53 rad/s ≈ 88°/s — brisk enough to flank, slow enough that
                         // the silhouette still reads against the background as it swings past.
  strafeClose: 3.2,      // radial. Deliberately below `strafeSpeed`: closing is a commitment and
                         // should feel heavier than side-stepping.
  strafeNear:  1.9,      // inner orbit radius. Just outside the capsule-plus-guard overlap, so
                         // circling never degenerates into shoving him.
  strafeFar:   5.2,      // outer orbit radius, inside `lockRange` so orbiting cannot break its own
                         // lock — you have to *walk away* to drop a mark, not merely circle wide.
  strafeAccel: 30,       // snappier than the ground `accel` 38 would suggest at this speed: an
                         // orbit is constant-radius, so the only accel the player ever feels is
                         // the start and the reversal, and both want to be crisp.
  strafeFace:  13,       // rad/s the facing tracks the mark. Just under `turnGround` 14 — the lock
                         // must never turn Sly faster than his own steering can.

  /* ---- pickpocket (§6). --------------------------------------------------------------------
     The approach is the move; the grab is a formality. Every one of these is a distance or a
     duration that keeps Sly *creeping* rather than lunging. ---- */
  pickTime:     0.55,    // the reach itself
  pickRange:    2.4,     // arm's length. GUARDS re-resolves the mark at this radius, so it is
                         // also the contract width of `nearestPickpocketTarget`.
  pickApproach: 4.6,     // how far out E will still start an approach. ~2 s of creeping: far
                         // enough that the player commits from cover, near enough that it never
                         // reads as an auto-walk across the courtyard.
  pickCreep:    1.4,     // = `sneakSpeed`, and for the same reason. Nobody runs at a pocket, and
                         // sharing the number means the approach inherits the sneak's feel exactly.
  pickCreepMax: 2.2,     // abort the approach after this. A mark that walks away faster than Sly
                         // creeps is a mark he missed, not one he chases — chasing is what would
                         // turn the stealth move into a homing attack.
  pickBreakDot: -0.5,    // steering this hard against the approach cancels it, same threshold and
                         // same reason as `magBreakDot`: an assist you cannot refuse plays itself.

  /* ---- paraglide ---- */
  glideGravity: 0.17,
  glideFall:   -3.2,
  glideSpeed:   5.6,
  glideAccel:   16,

  /* ---- Thief-o-Vision (§6) ---- */
  visionScale: 0.35,
  visionRange: 26,

  /* ---- target magnetism (Targets.js).  ---------------------------------------------------
     The structure is imported from the two Godot Sly repos (progress/records/
     IMPORT-slyrepos-movement.md §2); NONE of their constants are. They run SPEED 4.0 /
     JUMP_VELOCITY 8.0 → 2 m apex → g 16, air time 1.00 s. We run 7.2 / 11.0 / −24 → apex 2.52 m,
     air time 0.917 s. So every imported number is scaled by the factor matching its *dimension*:

        kH  1.800  horizontal speed   7.2 / 4.0
        kV  1.375  vertical speed    11.0 / 8.0
        kT  0.917  time               0.917 s / 1.000 s
        kLh 1.650  horizontal length  kH·kT   (= jump reach  6.60 / 4.00)
        kLv 1.260  vertical length    kV·kT   (= jump apex   2.52 / 2.00)

     `Targets.DERIVATION` carries the same table as data and tests/targets.test.mjs asserts these
     numbers against it, so none of them can drift back into being a copy of theirs. ---- */
  magPullSpeed:   7.2,       // theirs 4.0 (=SPEED) ×kH — pull at our own top run speed
  magPullTau:     0.068466,  // theirs lerp 0.2/frame@60Hz = τ 74.69 ms, ×kT
  magUpDrift:     2.75,      // theirs 0.5×SPEED = 2.0 ×kV  (= 0.25 × jumpV0)
  magUpDirGain:   1.375,     // theirs' bare dir.y term, ×kV
  magUpFalloff:   0.0825,    // theirs 0.05 ×kLh — assist = k/(horiz+k), WEAKENS with distance
  magYankGain:    11.0,      // theirs dir.y×8 (=JUMP_VELOCITY) ×kV  (= our jumpV0)
  magYankTau:     0.042834,  // theirs lerp 0.3/frame@60Hz = τ 46.7 ms, ×kT
  magFallClamp:  -8.9375,    // theirs −6.5 ×kV — cannot fall past a target you are locked to
  magSnapRadius:  0.20625,   // theirs 0.125 ×kLh
  magSnapLerp:    0.33,      // theirs 0.2 ×kLh — positional close-out, alpha = k/(d+k)
  magNoClip:      2.475,     // theirs 1.5 ×kLh — capsule bypassed inside this, non-notch only
  magRelease:     2.52083,   // theirs 2.0 ×kLv — and 2.52 m is exactly our own jump apex
  magCurveDomain: 11.0,      // theirs clamp(vy, ±8) ×kV
  magFailBoost:   5.5,       // theirs +4.0 "nice jump boost if failed" ×kV — = 0.5 × jumpV0
  /* ---- no counterpart in theirs; derived from our numbers alone ---- */
  magCatch:       1.008,     // runSpeed × jumpBufferMs. Magnetism forgives the same timing error
                             // the input layer already forgives — 140 ms — and nothing wider.
  magVolume:      3.30,      // half a full-speed jump's reach (7.2 × 0.917 / 2)
  magMaxTime:     1.375,     // 1.5 air times; no lock can outlive the arc that started it
  magCooldown:    0.9167,    // one air time before a released target may re-assign
  magYankCap:     1.15,      // yank ≤ 1.15 × the velocity that just reaches the point's height
  magBreakTime:   0.140,     // = jumpBufferMs of sustained opposite input breaks the lock
  magBreakDot:   -0.5,
  magHold:        0.25,      // = coyote + jump buffer: how long Sly holds a reached point

  /* ---- landing. -----------------------------------------------------------------------------
     Both numbers are *arrival speeds* in m/s. They are at their long-standing shipped values and
     this block only names the first one, which was a bare `3.2` repeated in three places in
     Moveset.js (§5 wants feel constants here, not inline).

     ── THE LANDING RACE, FIXED (§443) ─────────────────────────────────────────────────────────
     `landImpact` was read in `_probeGround` as `-velocity.y`, but `move()` runs `_moveVertical`
     first and the swept capsule — which is what actually stops a fall — zeroed `v.y` before the
     probe ever looked. The probe only won when the frame before touchdown happened to leave Sly
     inside its 0.06 m band: 12 wins in 40 sub-frame phases. Driven on the shipped temple that
     produced **silent landings at 0.5, 4, 6 and 10 m and audible ones at 1, 2.5, 8 and 15 m** —
     not ordered by arrival speed, so a player could not learn it. Half of all landings had no
     `land` state, no `landed` event, no sound, no shake and no impact pose.

     `_moveVertical` now records the arrival it is about to erase and `_probeGround` consumes it
     on the same frame. **8 of 8 sampled heights fire.** The same record fixes a second defect:
     a capsule leaning on a face at a ledge sat in `fall` with `grounded=false` for 60 s while the
     sweep was hitting a floor 1 mm below it and the probe was measuring past to the next surface
     0.107 m down.

     ── AND `landHard` RE-DERIVED, BECAUSE THE FIX FORCED IT ───────────────────────────────────
     With arrivals measured correctly, an ordinary jump lands at 10.874 m/s — above the old
     `landHard` 9.0 — so the repair alone would have made *every jump in the game* a hard landing
     with a 0.19 s control tax and a shake. The threshold is therefore derived from the arcs this
     moveset and this level actually produce, measured rather than chosen. Both populations are
     re-measured on every run by `recover.test.mjs` L1, so these numbers cannot quietly rot:

         what he can do to himself      6.196 … 14.586 m/s
                                        floor is a fully cut jump, ceiling is jump+double with the
                                        button held. 14.586 is hard: swept over a 31 x 50 grid of
                                        hold/release/press timings at 1-frame resolution, 1550
                                        arcs, nothing exceeds it. Highest apex reached: 4.502 m
         authored route descents        7.753 · 23.749 · 25.368 m/s
                                        dropped for real, not solved for. The small one is a
                                        step-down below a plain jump; the first genuine fall is
                                        the 12 m descent to the vault. The bottle route's own
                                        descents (26.9 m and 46.0 m) are both larger and so do
                                        not move the lower edge of the band

     The two populations are separated by an empty band **14.586 … 23.749 m/s**, 9.16 m/s wide,
     and the rule that reads off it is the one the moveset already implies: **`landHard` is the
     first landing that was not a move you meant.**

     The margin is worth stating in the right units, because **arrivals are quantized**. The sweep
     records the velocity the move was made with, so every arrival sits on a ladder spaced one
     frame of gravity apart — 0.400 m/s. Population A's top three rungs are 14.586, 14.186,
     13.786. 15.0 clears the top rung by 0.414 m/s, which is 1.04 rungs: a whole step, but only
     just one. It is not a percentage of a continuous quantity, and it is not a comfortable
     margin either — one extra frame of fall anywhere in the moveset would close it. L1 asserts
     exactly that ( `landHard - ceiling >= one tick` ) and is the arm that will fire first if
     `jumpV0`, `gravity` or the double-jump is ever retuned.

     `landBeat` stays 3.2: with the race fixed every real landing speaks, which is the point.

     FEEL REVIEW OWED, AND IT IS THE WHOLE DECISION. The measurement fixes the *band*; every value
     in 14.586 … 23.749 separates the same two populations identically, and L1 passes for all of
     them. Where 15.0 sits inside a 9 m/s window is a feel judgement nobody has made on a machine
     that renders — nobody has heard the shake or felt the 0.19 s. Flagged for hardware
     arbitration with the distribution above, so the reviewer is placing a number inside a
     measured window rather than guessing one. If it wants to move, it is a one-line change here
     and L1 will keep it honest about the edges. ---- */
  landBeat:     3.2,     // enter `land` above this arrival speed. Shipped value, formerly inline.
  landHard:     15.0,    // above this it is `land_hard` + shake + root impulse. Derived above (§443).
  landSoftTime: 0.09,
  landHardTime: 0.19,

  /* ---- safety. -------------------------------------------------------------------------------
     `safePoll` is how often the last SUPPORTED stance is re-sampled. Adapted from
     `player__sly.gd`'s `collision_detect()`, which stamps a `collision point` node at the
     player's origin on every physics frame in which **all nine of its floor rays** are
     colliding, and `return_to_safe()`, which teleports there. The idea is the one worth having:
     the recovery point is not a checkpoint an author placed, it is *the last place the player
     demonstrably stood on solid ground*, which is always exactly as far back as it needs to be.

     Ours is that idea on our own probes. `narrowGround()` already answers "is the surface under
     his feet broad enough to walk on normally" with two casts instead of nine, and it is the
     same question their ray fan was asking. 0.30 s rather than their every-frame, because a
     recovery point 30 cm of walking stale is indistinguishable from a fresh one and 3.3 Hz of
     two casts is free — theirs pays nine casts at 60 Hz for a node nothing reads until you die.
     ---- */
  voidY:       -220,     // absolute last resort; the level's lowest legal floor is -12
  /* The `stuck` half of the safety net (§504). `voidY` catches a player who fell OUT of the world;
     these catch one who is in it and cannot move — airborne, stationary, with no way to jump
     because `grounded` cannot latch on an unwalkable face.

     Neither number is chosen. `stuckTime` has to clear the longest LEGITIMATE stationary airborne
     episode the moveset can produce, and that is `wallCling`, which self-terminates at
     `wallClingMax` 2.0 s; every other air state either moves or is in the `attach` group and
     exempt. 3.0 s is that ceiling plus a full second. `stuckDist` has to sit above the drift a
     genuinely pinned capsule shows and below anything a moving one does: the tomb pin measured
     0.000-0.006 m over 180 frames against every input tried (§503.3), so 0.25 m is ~40x the
     observed drift and still a quarter of a body width. */
  stuckTime:      3.0,
  stuckDist:      0.25,
  /* Sand walks past the stone limit (§515). The user's P1 — "difficult to walk or run up slopes
     other than by jumping" — measured as a grounding flicker: the shipped dunes' walk lines read
     up to 57.2° (q90 50.7-56.1 on the two western dunes), the 50° gate refused grounding on
     154 of 240 frames of a straight uphill walk, and the climb became a ground/air stutter at
     2-3 m/s against 7.2 on clean geometry. A footprint-averaged normal was tried and does NOT
     discriminate (155 vs 154 refusals — the faces are genuinely steep, not faceting artefacts).
     The band, measured: walked sand tops out at 57.2°; the first non-sand face that must stay
     refused is 61.9° (the stage risers); the §503 wedge class is stone. 58 is one degree above
     the measured sand maximum, and the limit is MATERIAL-SCOPED so every stone number in the
     game — shedding, the wedge, the stairs — is untouched. */
  slopeSandDeg:   58,
  /* Announce the next hold while attached, excluding the one being held (§505). OFF and
     UNMEASURED — see `_telegraph` for what it does, what it cannot yet do, and why the number
     that would justify it does not exist. A person can flip this on hardware; nothing has. */
  telegraphNextHold: false,
  safePoll:     0.30,    // seconds between supported-stance samples

  /* ---- the drawn root's easing (§610) --------------------------------------------------------
     §599 measured the rope "teleport" the user reported twice and found it is TWO cuts in the same
     frame, not one. On the chain's entry catch the capsule moves 4.646 m; the camera's follow
     spring passes 1.801 m of that (and only 8-17% of the ordinary catches), while the drawn body
     moves the whole 4.646 m because `_pushCharacter` was `root.position.copy(this.position)` — an
     undamped copy, the only hard cut of the pair and the larger one. This eases that copy. The
     camera's share is a separate matter in a file this lane does not own.

     WHAT IS EASED IS ONLY WHAT VELOCITY DOES NOT EXPLAIN. Ordinary motion travels |v|·dt; a
     placement does not. So the drawn root always moves the honest, explained part immediately and
     holds back the rest. That is what keeps a dive at 47 m/s untouched while a 4.6 m catch at a
     standstill is spread — the two are not told apart by SPEED, which cannot separate them, but by
     whether the simulation travelled the distance or was put there.

     `drawSnapMin` — DERIVED, not picked (§450.4). `tools/drawnease.mjs --census` walks 5,685
     frames over seven regimes (the four-ring chain plus six ground sweeps with run and jump), and
     the unexplained displacement splits like this:

         continuous locomotion   move 0.192 · land 0.19 · fall 0.26 · wallJump 0.342   <- ceiling
         placements              ring4 0.807 · ring3 0.826 · ring2 1.007 · ring1 4.552
                                 ledgeClimb mount 0.653 · poleClimb mount 1.47

     0.45 sits above every continuous-locomotion frame in the census and below the smallest catch
     by 1.8x. Two of 5,383 locomotion frames cross it and BOTH are themselves snaps (a push-out
     during a fall and a ledge mount), so easing them is right rather than an error. The asymmetry
     matters when choosing inside that band: easing something that did not need it costs a 67 ms
     softening nobody can see, while missing a catch defeats the feature entirely.

     `drawEaseFrames` — the offset is paid off in this many EQUAL steps, so the largest drawn step
     is the snap over this number and the worst case sets the count. 4.646 / 4 = 1.162 m per frame
     and 66.7 ms of total divergence; three would be 1.549 m and five would hold the body 3.7 m off
     its capsule for 83 ms, which is long enough to draw him through stone the capsule has already
     cleared. Set to 0 to disable the easing entirely, which is how `tests/draweased.test.mjs`
     proves the capsule trace does not depend on it. */
  drawSnapMin:    0.45,
  drawEaseFrames: 4,
  /* A bound, not a knob: no single placement can move Sly further than the longest affordance
     reach in the game, and `Moveset.TUNE.hookGrab` is 9.0. Lag is clamped here so that a
     pathological frame — a chain of captures, a state that places twice — cannot park the drawn
     body an unbounded distance from the capsule. Nothing measured has ever reached it. */
  drawLagMax:     9.0,

  /* ---- §723A: the swing's drawn composition — the whole character pivots about the crook-on-
     ring contact, so the cane stays ATTACHED to the ring while the feet sweep the arc.
     Presentation only, exactly like the §610 easing above: `_swingDraw` reads the pose and
     writes the drawn root; nothing in the simulation consumes any of it. The capsule still
     rides the pendulum sphere at `hookL` below the anchor — what changes is where the DRAWN
     hierarchy is placed each frame: rotated by the pendulum's own deviation from vertical about
     the posed crook seat, then translated so that seat lands exactly on the ring's point.

     `swingPinIn` mirrors the taut-rope ease at the catch (the capsule's own entry is placed,
     not eased — the DRAWN pin fades in so the crook closes onto the ring instead of cutting);
     `swingPinOut` mirrors it on the release, §610's argument verbatim: the offset held at the
     release frame is paid off in equal steps while the body flies, so the largest drawn step is
     the offset over the frame count and there is no release-frame snap. `swingPinMax` is a
     bound, not a knob — the pin offset is body-reach plus rope-length shaped (~1 m measured)
     and nothing honest approaches 3. */
  swingPinIn:     0.12,
  swingPinOut:    0.20,
  swingPinMax:    3.0,
};

/**
 * Leaving one of these for the air is losing a traversal beat, not choosing to drop — the input to
 * the hard landing's second term (§502, and `onStateChanged` for why this is a list not a group).
 * `hurt` is here because being knocked off is the clearest uncontrolled descent in the game.
 */
const BEAT_LOST = new Set(['wallCling', 'wallRun', 'wallClimb', 'hookSwing', 'railSlide',
  'railWalk', 'poleClimb', 'poleSwing', 'ledgeHang', 'toTarget', 'hurt']);

const SPAWN = new THREE.Vector3(0, 0, 30);
const SPAWN_YAW = Math.PI;
const DEG = Math.PI / 180;

/* ---- scratch. update() must allocate nothing (§5). ---------------------- */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _disp = new THREE.Vector3();
const _rem = new THREE.Vector3();
const _to = new THREE.Vector3();
const _n = new THREE.Vector3();
const _sfrom = new THREE.Vector3();
const _sto = new THREE.Vector3();
const _dv = new THREE.Vector3();      // this frame's capsule displacement, for `_easeDraw` (§610)
const _saveP = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _qpos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/* §723A scratch — `_swingDraw` only. Its own vectors rather than _v1.._v4 because it runs at the
   very end of the frame and a later borrower of the shared scratch would silently corrupt it. */
const _swA = new THREE.Vector3();
const _swB = new THREE.Vector3();
const _swQ = new THREE.Quaternion();
const _swQ2 = new THREE.Quaternion();

/**
 * §723A — "have the whole character pivot about the top point so that the cane stays attached
 * to the ring during the swinging while the feet swing."
 *
 * 'pinned' (default): during `hookSwing` the drawn hierarchy is re-anchored per frame — rotated
 * by the pendulum angle about the cane's posed `hookPoint`, then translated so that point sits
 * exactly on the ring — with an eased fade in at the catch and out at the release. The clip,
 * its binding and the donor cane track are untouched ("keep the animation"), and the capsule's
 * pendulum is untouched: this is a drawn-root composition, §605/§610's lane.
 * 'loose' (`?swing=loose` / `globalThis.__SWING_AB='loose'`): exactly what shipped before —
 * the body translates along the arc and the crook visibly leaves the ring.
 */
const SWING_DEFAULT = 'pinned';
function swingRegime() {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('swing') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__SWING_AB != null) raw = String(globalThis.__SWING_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  const t = String(raw).trim().toLowerCase();
  return t === 'loose' || t === 'pinned' ? t : SWING_DEFAULT;
}
export const SWING_PINNED = swingRegime() === 'pinned';

const _sweepOpt = { skipOneWay: false };
const _nearOpt = { facing: _fwd, maxAngle: TUNE.hookCone, ignoreRec: null };
/* Cone-less exclusion opts. A separate object because `_nearOpt` carries a facing/cone that the
   no-cone and cone-miss paths must NOT acquire — passing `_nearOpt` there would silently add a
   cone filter to two queries that are deliberately omnidirectional. */
const _nearOptNoCone = { ignoreRec: null };
const _nearOptPlain = (rec) => { _nearOptNoCone.ignoreRec = rec; return _nearOptNoCone; };
const TAGS_VENT = ['vent'];
const TAGS_HAZARD = ['hazard'];
const TAGS_VISION = ['hook', 'rail', 'pole', 'spire', 'ledge', 'vent'];

/** My own copy of a sweep result — the module's pooled object may be reused mid-loop. */
const _swRes = { hit: false, sweepHit: false, depenHit: false, depenDepth: 0, position: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0, toi: 1, tag: '', material: 'stone', rec: null };
const _rayRes = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0, tag: '', rec: null };
const _gndRes = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'stone', rec: null };

/** Payload pushed to ANIMATION every frame (§4.7). Reused, never re-created. */
const LOCO = {
  speed: 0, maxSpeed: TUNE.runSpeed, grounded: true, sneaking: false, crouching: false,
  airborne: false, verticalVelocity: 0, turnRate: 0, slope: 0, surface: 'stone',
};

/* ---- flat-plane stand-in so physics is testable before COLLISION lands ---- */
const _flatSweep = { hit: false, position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, tag: 'ground', material: 'sand', rec: null };
const _flatGround = { hit: true, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'sand', rec: null };
const _flatRay = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, tag: '', rec: null };
const EMPTY = [];

const FLAT = {
  ready: true,
  fallback: true,
  SLOPE: { walkable: 50 * DEG, wall: 70 * DEG },
  capsuleSweep(from, to) {
    _flatSweep.position.copy(to);
    _flatSweep.normal.set(0, 1, 0);
    if (to.y < 0) { _flatSweep.position.y = 0; _flatSweep.hit = true; }
    else _flatSweep.hit = false;
    _flatSweep.distance = _flatSweep.position.distanceTo(from);
    return _flatSweep;
  },
  groundCheck(pos, _r, maxDist) {
    _flatGround.y = 0;
    _flatGround.hit = pos.y <= maxDist + 1e-4;
    return _flatGround;
  },
  raycast() { _flatRay.hit = false; return _flatRay; },
  overlap() { return EMPTY; },
  nearest() { return null; },
  query() { return EMPTY; },
};

/** One persistent affordance slot per tag, so nothing pooled is retained across frames. */
function affSlot() {
  return { frame: -1, ignore: null, ok: false, point: new THREE.Vector3(), tangent: new THREE.Vector3(0, 1, 0), t: 0, distance: Infinity, rec: null };
}

/* Per-tag discovery config. Ranges are deliberately generous — Sly's traversal reads as
   fluid precisely because the game meets you more than halfway on grabs. */
const AFFORD = {
  hook:  { range: TUNE.hookGrab, eye: 1.15, cone: TUNE.hookCone },
  rail:  { range: 4.0,           eye: 0.55, cone: 0 },
  pole:  { range: 3.0,           eye: 0.95, cone: 0 },
  spire: { range: TUNE.spireGrab, eye: 0.30, cone: 0 },
  ledge: { range: 2.6,           eye: 1.20, cone: 0 },
};

/**
 * What the telegraph offers to point at, and why it is these three.
 *
 * `hook`, `rail` and `ledge` are the holds a player *aims for* and can miss. `pole` and `spire`
 * are omitted deliberately: both are arrived at rather than aimed at — `poleClimb` is entered by
 * running into a shaft and `spireLand` by descending onto a tip — so a mark on them would fire
 * constantly while telling the player nothing they were deciding about.
 */
const TELEGRAPH_KINDS = ['hook', 'rail', 'ledge'];

export class Controller {
  constructor(engine) {
    this.engine = engine;
    this.input = engine.input;

    /* ---- read by CAMERA, HUD and the debug overlay every frame ---- */
    this.position = SPAWN.clone();
    this.velocity = new THREE.Vector3();
    /* The last stance `_recordSafeStance` was willing to certify. `safeOk` stays false until one
       has actually been sampled, so `_safetyNet` never teleports Sly to a spawn-shaped guess and
       calls it a recovery. */
    this.safePoint = SPAWN.clone();
    this.safeYaw = SPAWN_YAW;
    this.safeOk = false;
    this._safeT = 0;
    this.yaw = SPAWN_YAW;
    this.stateName = 'idle';
    this.grounded = true;

    /* ---- the drawn root's easing (§610). Presentation only: nothing below is read by the
           simulation, and `_easeDraw` is the only writer. See TUNE.drawSnapMin. ---- */
    this._drawLag = new THREE.Vector3();   // how far BEHIND its capsule the drawn body is
    this._drawEaseN = 0;                   // frames of payoff still owed
    this._drawP0 = SPAWN.clone();          // the capsule at the top of this frame
    this._drawV0 = 0;                      // its speed there, which is what "explained" means

    /* ---- §723A: the swing pin (see SWING_PINNED above). Presentation only; `_swingRamp` and
           `_swingDraw` are the only writers, `_swingDraw` the only consumer. ---- */
    this._swingW = 0;                      // 0..1 — how much of the pin is applied
    this._swingDp = new THREE.Vector3();   // world offset baseline -> pinned, held across release
    this._swingDq = new THREE.Quaternion();// world rotation of the pin, held across release

    /* ---- extras peers may find useful; all optional to consume ---- */
    this.speed = 0;
    this.height = TUNE.height;
    this.radius = TUNE.radius;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundY = 0;
    this.groundTag = 'ground';
    this.groundMaterial = 'stone';
    this.groundSlope = 0;
    this.balance = 0;          // rail/spire sway, radians — CAMERA and ANIMATION may lean on it
    this.thiefVision = false;
    this.anchor = new THREE.Vector3();  // hook anchor while swinging
    this.attached = null;      // rec of whatever Sly is holding onto

    /* ---- authored traversal magnetism. Level content authors points into this (see
       addTarget / the 'registerTarget' event); the `toTarget` state consumes them. ---- */
    this.targets = new TargetField(this);
    /* Spline-follow scratch for the rail moves. RailBase.mount() writes straight into it. */
    this.rail = { spline: null, rec: null, u: 0, len: 1, speed: 0 };
    /**
     * Shaft-follow scratch for the pole moves, the exact counterpart of `this.rail` above.
     * `PoleClimb.mount`-equivalent (`PoleClimb.enter`) writes straight into it and `PoleSwing`
     * reads it, so it must be a persistent slot rather than a per-entry literal (§5: `update()`
     * allocates nothing).
     *
     * **This object was missing.** `Moveset.PoleClimb` and `PoleSwing` have always read `c.pole`,
     * nothing ever created it, and `enter()`/`update()` are both wrapped in the state machine's
     * `softFail` try/catch — so grabbing a pole did not error, it *silently half-ran*. Measured
     * headlessly: `enter` threw at its first write and initialised nothing, then `update` threw
     * only *after* `c.position.y += vy * dt`, so holding W climbed at `poleUp` 3 m/s **forever**,
     * with no shaft, no top clamp, no `place()` and no collision — straight up into the sky, and
     * `jump` could not release because it threw before it could return. Crouch was worse: −8 m/s
     * through the floor until `voidY` −220 respawned him. The warning ring filled at its 190 cap.
     * Every one of §8.1's 17 `pole`-tagged bodies — the 22 m obelisk, the twelve hypostyle
     * columns, the two hook masts, the aisle pinnacle poles — was a soft-lock on contact.
     *
     *   rec              collision record we are attached to
     *   x, z             shaft axis in world space (poles are vertical, §4.4)
     *   r                shaft radius, read off the collider's cylinder parameters
     *   bottom, top      climbable extent, from `mesh.userData.bottom/top` (poleProxy sets both)
     *   hold             distance from the axis Sly's capsule sits at while gripping
     *   angle            where round the shaft he is, radians; the spin axis of pole swing
     */
    this.pole = { rec: null, x: 0, z: 0, r: 0.5, bottom: 0, top: 0, hold: 0.77, angle: 0 };
    this.hangLock = 0;         // brief lockout after dropping off a ledge, so it can't re-grab
    this.poleLock = 0;         // …and its counterpart for poles. See TUNE.poleLockout.
    this.spireLock = 0;        // …and for spire tips. See TUNE.spireLockout.
    this.pendingLaunch = 0;    // launch velocity handed to Jump by rail/pole/spire exits

    /* ---- intent ---- */
    this.wishDir = new THREE.Vector3();
    this.wishMag = 0;
    this.wishRaw = new THREE.Vector3();
    this.faceDir = new THREE.Vector3(0, 0, 1);

    /* ---- timers ---- */
    this.airTime = 0;
    this.coyote = 99;
    this.airJumps = 1;         // jumps left after leaving the ground
    /* `jumpHeld` used to live here — assigned every frame in `_readInput` and **read by nothing**,
       in `src/`, `tests/` or `tools/`. Same shape as `c.pole`, `lastWallRec`, `spireLaunch` and
       `hitWall`: machinery wired at one end. Removed rather than given an invented consumer.
       The obvious one — a level-triggered jump cut, "cut the arc on the first frame the button is
       not held" instead of `applyJumpCut`'s edge on `released('jump')` — was written, measured and
       **rejected**: with no `launch()` call of its own, `WallJump` shares the latch, and a hook
       release taken while the button is up (`HookSwing` never calls `applyJumpCut`, so the latch
       survives the whole swing) had its `hookUpKick` cut by 55%. The real hole the level trigger
       was meant to plug — a release lost because focus went away without a keyup — is closed at
       source instead, in `Input._dropAllHeld`. Anything that wants the held state should ask
       `c.down('jump')`, which is where it came from. */
    this.wallRunUsed = 0;      // wall runs since last ground contact
    /* The wall face already spent this airborne period — rec plus its outward XZ normal, which
       together name a *face* rather than a body. See TUNE.wallFaceDot and `wallSpent`. */
    this.lastWallRec = null;
    this.lastWallNx = 0;
    this.lastWallNz = 0;
    /* Identity of the hold currently telegraphed — see `_telegraph`. `null`/'' means "nothing is
       being pointed at", which is a state the HUD is told about explicitly. */
    this._teleRec = null;
    this._teleKind = '';
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.hurtCooldown = 0;
    this.spireLaunch = false;

    /* ---- collision resolution state ---- */
    this.col = FLAT;
    this._colReal = null;
    this._capOff = 0;          // capsuleSweep origin convention offset, calibrated once
    this._calibrated = false;
    this._needSpawnSnap = true;
    /* ── The write-only register. Kept up to date on purpose, because this file's characteristic
       defect is machinery wired at one end and the only defence is a list somebody maintains.
       Every field below is written by this file and read by **nothing** in `src/`, `tests/` or
       `tools/` (verified, not assumed). None of them is a shipping bug the way `c.pole` and
       `lastWallRec` were — they are inert rather than half-running — so none is given an invented
       consumer here:

         lastHitNormal  `_slide`         the normal of the last contact this frame
         lastHitTag     `_slide`         its surface tag — the obvious consumer is FX/AUDIO
                                         picking a scrape sound, which is not MOVEMENT's call
         hitWall        `_slide`         set when a contact normal is wall-ish
         spireLaunch    `SpireLand`      set on the tip's jump exit, cleared by `_preTimers`

       `hitCeiling`, by contrast, IS read — `WallRun.update` returns 'fall' on it — which is why
       it is not on this list and is the shape the others should be brought to. ── */
    this.lastHitNormal = new THREE.Vector3(0, 1, 0);
    this.lastHitTag = '';
    this.hitWall = false;
    this.hitCeiling = false;
    this.landImpact = 0;
    /* What the swept capsule saw on the frame it stopped a fall — the arrival speed and the
       resolved height. Read by `_probeGround` on that frame only. See `_moveVertical`. */
    this._sweepLandVy = 0;
    this._sweepLandY = 0;
    this._sweepLandNormal = new THREE.Vector3(0, 1, 0);
    this._sweepLandFrame = -1;
    /* The frame `landImpact` was written on. `Land.canEnter` gates on it so a stale impact from
       two seconds ago cannot re-fire the landing beat; it read an undefined field, every
       comparison was `NaN <= 2` = false, and the polled entry to `land` was therefore dead —
       only the explicit `return 'land'` inside `AirState.landed()` ever reached it. Touching down
       out of a wall run, a wall cling or a magnet arrival landed in total silence: no squash, no
       `landed` event, so no FX dust and no footfall from AUDIO. −99 rather than 0 so frame 1 of a
       session cannot look like a landing. */
    this._landFrame = -99;
    /* Whether the current airborne episode began from the ground — see `onStateChanged`. Defaults
       TRUE so an unclassified fall is soft: a landing nobody can attribute must not cost control. */
    this._airControlled = true;
    /* The stuck watchdog's anchor and clock — see `_safetyNet`. */
    this._stuckAt = SPAWN.clone();
    this._stuckT = 0;

    /* ---- ledge probe result ---- */
    this.ledge = { ok: false, y: 0, x: 0, z: 0, nx: 0, nz: 1, rec: null };
    /* ---- wall probe result ---- */
    this.wall = { ok: false, nx: 0, nz: 0, ny: 0, dist: 0, rec: null, tag: '' };

    this._aff = { hook: affSlot(), rail: affSlot(), pole: affSlot(), spire: affSlot(), ledge: affSlot() };
    /* A SECOND bank, for `afford(tag, ignoreRec)`. Separate rather than shared so an excluded
       query can never poison the plain one: `_telegraph` asks "the next hold, not this one" on the
       same frame the moveset asks "the nearest hold", and both answers have to be available and
       correct. Memoised on `frame` AND `ignore`, exactly as `lock`/`pick` memoise on
       `frame` + `wide` — no new cache to hand-clear (§448.2's `_frame` cluster is six sites and
       this deliberately does not make it seven). */
    this._affEx = { hook: affSlot(), rail: affSlot(), pole: affSlot(), spire: affSlot(), ledge: affSlot() };
    /* Persistent mark slots, memoised per frame exactly like `_aff` above and for the same
       reason: `canEnter` runs for every candidate above the current priority, so a resolver it
       calls must be free the second time. `body` is a GUARDS-owned object — held only for the
       length of a lock and re-validated every frame, never retained across a release. */
    this.lock = { frame: -1, wide: -1, ok: false, body: null, point: new THREE.Vector3(), distance: Infinity };
    this.pick = { frame: -1, ok: false, body: null, point: new THREE.Vector3(), distance: Infinity };
    this._guards = null;
    this._lookAt = false;      // whether ANIMATION currently holds a look-at target
    this._frame = 0;
    this._prevYaw = SPAWN_YAW;
    this._baseClip = '';
    this._assistUsed = false;
    this._bounceReq = 0;
    /* `_hurtReq` used to sit here. It was never written and never read — not half-wired, wired at
       neither end. `hurt()` sets the velocity itself and calls `sm.request('hurt')`. Deleted. */
    this._placeholder = null;
    this._disposed = false;

    this.sm = new StateMachine(this);
  }

  async init() {
    for (const s of buildMoveset(this)) this.sm.add(s);
    this.sm.set('idle');

    this.character = this.engine.get('character');
    this.anim = this.engine.get('animation');

    // A placeholder capsule keeps physics visible and testable while CHARACTER is in flight.
    if (!this.character?.root) this._makePlaceholder();

    this.position.copy(SPAWN);
    this.yaw = SPAWN_YAW;
    this._prevYaw = SPAWN_YAW;

    this._offBounce = this.engine.on('enemyBounce', (p) => this.bounce(p?.strength));
    this._offHurt = this.engine.on('hurt', (p) => this.hurt(p?.dir, p?.force));
    this._offShot = this.engine.on('shot', () => { this._resetVision(); });
    // Level content authors traversal points without importing anything of ours.
    this._offTarget = this.engine.on('registerTarget', (spec) => this.addTarget(spec));
    this._offUntarget = this.engine.on('unregisterTarget', (spec) => this.removeTarget(spec));

    /* Drain what the level already authored. MANIFEST loads `architecture` at main.js:91 and
       `movement` at :100, so every `registerTarget` the level build emits arrives BEFORE the
       listener two lines above exists, and `Engine.emit` drops it into an empty listener set.
       Fourteen authored traversal targets registered nothing. Same shape and same reason as
       `Engine._colliderQueue`, which already exists for exactly this ordering. */
    for (const spec of this.engine.get('architecture')?.api?.targets || []) this.addTarget(spec);
  }

  /** TUNE, reachable from Targets.js without a module-scope import cycle. */
  tune() { return TUNE; }

  /* ==================================================================== */
  /* frame                                                                */
  /* ==================================================================== */

  update(dt, t) {
    if (this._disposed) return;
    this._frame++;
    this.anim = this.anim || this.engine.get('animation');
    this.character = this.character || this.engine.get('character');
    this._bindCollision();

    // Shot mode: Debug has posed Sly by hand for a canonical frame. Running physics here
    // would drop him off the perch in `hero` and out of the swing in `traversal`.
    if (this.engine.debug.freeCam) {
      this._resetVision();
      // A look-at left standing would cock Sly's head at a guard the harness has posed him away from.
      if (this._lookAt) { this._lookAt = false; try { this.anim?.setLookAt?.(null); } catch { /* pose-only path */ } }
      /* Shot mode: Debug has placed Sly exactly where the recipe says and `Debug.js`:184 reads the
         root back to record where he was staged. An easing offset left standing from before the
         freeze would put the drawn body somewhere the recipe did not ask for and the report would
         record that as the staged position. A pose is not motion; there is nothing to ease. */
      this._drawLag.set(0, 0, 0); this._drawEaseN = 0;
      /* §723A — same reasoning: a staged pose is not a swing, and composing it would put the
         drawn body somewhere the recipe did not ask for. */
      this._swingW = 0;
      this._pushCharacter();
      this._pushLocomotion(dt);
      return;
    }

    /* Where the capsule stood and how fast it was going BEFORE anything moved it. `_easeDraw`
       needs both, and it needs them from here: the state machine mutates `velocity` as it runs, so
       a reading taken afterwards describes the frame's outcome rather than its budget. Sampling it
       after the update is exactly the fault that made the first census score every landing as an
       unexplained jump — contact zeroes the vertical component, so |v|·dt reads ~0 for a frame the
       capsule genuinely travelled. */
    this._drawP0.copy(this.position);
    this._drawV0 = this.velocity.length();

    if (dt > 0) {
      this._thiefVision();
      this._readInput();
      this._preTimers(dt);
      this._probeEnvironment();
      this.targets.update(dt);
      this.sm.update(dt);
      /* After the machine, so the affordances it polled this frame are already memoised and the
         group reflects what Sly is actually in. Never inside a `canEnter`: a predicate must not
         emit, and `canEnter` is called speculatively for states that are then refused. */
      this._telegraph();
      this._postTimers(dt);
      this._hazards(dt);
      // After `_hazards`, so `hurtCooldown` reflects THIS frame and a stance inside a hazard is
      // refused rather than certified one frame before the damage lands.
      this._recordSafeStance(dt);
      this._safetyNet(dt);
    }

    this.stateName = this.sm.name;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (dt > 0) { this._swingRamp(dt); this._easeDraw(dt); }
    this._pushCharacter();
    this._pushLocomotion(dt);
    // After the machine has run, so both read the state Sly is actually in this frame.
    if (dt > 0) this._pushLookAt();
  }

  _bindCollision() {
    const c = this.engine.get('collision');
    if (c !== this._colReal) {
      this._colReal = c;
      this._calibrated = false;
    }
    const usable = c && c.ready !== false && typeof c.capsuleSweep === 'function';
    this.col = usable ? c : FLAT;
    if (usable && !this._calibrated) this._calibrate();
  }

  /**
   * capsuleSweep's `from`/`to` convention (capsule base vs centre) is not pinned down by §4.6.
   * Rather than guess and sink Sly half a body into the paving, drop a capsule onto the floor
   * once and see where it reports itself: base convention lands on the ground plane, centre
   * convention lands half a height above it.
   */
  _calibrate() {
    this._calibrated = true;
    this._capOff = 0;
    const col = this.col;
    _v1.copy(this.position); _v1.y += TUNE.probeUp;
    const g = col.groundCheck?.(_v1, TUNE.radius, 40);
    if (!g?.hit) return;
    const floor = g.y;
    _v1.set(this.position.x, floor + 3.0, this.position.z);
    _v2.set(this.position.x, floor - 0.5, this.position.z);
    const r = col.capsuleSweep(_v1, _v2, TUNE.radius, TUNE.height, _sweepOpt);
    if (!r?.hit) return;
    const delta = r.position.y - floor;
    if (delta > TUNE.height * 0.30 && delta < TUNE.height * 0.75) {
      this._capOff = TUNE.height * 0.5;
      this.engine.warn('movement: capsuleSweep reports capsule centre; compensating.');
    }
  }

  /* ==================================================================== */
  /* input                                                                */
  /* ==================================================================== */

  _readInput() {
    const inp = this.input;
    if (!inp) { this.wishMag = 0; this.wishDir.set(0, 0, 0); return; }

    // Camera-relative, per §6.1. Falls back to Sly's own facing if the camera is looking
    // straight down (getWorldDirection collapses on the XZ plane).
    const cam = this.engine.camera;
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    else _fwd.normalize();
    _rgt.crossVectors(_fwd, UP).normalize();

    /**
     * `inp.move` is already the finished analog intent: keys and the d-pad give a digital unit
     * vector, a stick gives its magnitude after `Input`'s radial deadzone and `moveFloor`
     * (see `INPUT_TUNE`). Nothing here re-shapes it — one response curve, in one file.
     *
     * Worth stating because it is load-bearing for the rest of the moveset: `moveFloor` 0.25 is
     * the *smallest* magnitude a live stick can produce, and every raw-axis verb in Moveset.js
     * sits above it by construction — `PoleClimb`'s climb/descend at |wishRaw.z| > 0.3,
     * `PoleSwing`'s spin at |wishRaw.x| > 0.3, `LedgeHang`'s shimmy at |wishRaw.x| > 0.4 and its
     * drop/climb at |wishRaw.z| > 0.5. So the floor can never *trigger* a traversal verb; the
     * only predicates it crosses are the `wishMag > 0.12` "is he moving at all" ones, which is
     * exactly the family it exists to make decisive.
     */
    const mx = inp.move.x, my = inp.move.y;
    this.wishRaw.set(mx, 0, my);
    this.wishDir.set(0, 0, 0).addScaledVector(_rgt, mx).addScaledVector(_fwd, my);
    const len = this.wishDir.length();
    this.wishMag = Math.min(1, len);
    if (len > 1e-5) this.wishDir.multiplyScalar(1 / len);
    else this.wishDir.set(0, 0, 0);
  }

  down(a) { return !!this.input?.down(a); }
  pressed(a) { return !!this.input?.pressed(a); }
  released(a) { return !!this.input?.released(a); }
  /**
   * Peek the jump buffer — safe inside canEnter, which may not lead to a transition.
   *
   * `jumpBufferMs` is **game** milliseconds. `Input` accumulates its own clock from the engine's
   * scaled `dt`, so this window is the same kind of number as `TUNE.coyote`, `hangLock`,
   * `poleLockout`, `spireLockout` and every `sm.time` gate — it was the only one that was not.
   */
  jumpBuffered() { return !!this.input?.bufferedPeek('jump', TUNE.jumpBufferMs); }
  /** Consume it. Only ever called from enter(), so a jump is spent exactly once. */
  takeJump() { return !!this.input?.buffered('jump', TUNE.jumpBufferMs); }

  _thiefVision() {
    const want = this.down('focus');
    if (want === this.thiefVision) return;
    this.thiefVision = want;
    this.engine.timeScale = want ? TUNE.visionScale : 1;
    this.engine.emit('thiefVision', want);
    if (want) {
      // Hand HUD/FX the affordance list up front so they don't have to poll the BVH.
      const list = this.col.query?.(this.position, TUNE.visionRange, TAGS_VISION);
      if (list && list.length) this.engine.emit('thiefTargets', list);
    }
  }

  _resetVision() {
    if (!this.thiefVision) return;
    this.thiefVision = false;
    this.engine.timeScale = 1;
    this.engine.emit('thiefVision', false);
  }

  /* ==================================================================== */
  /* timers                                                               */
  /* ==================================================================== */

  _preTimers(dt) {
    if (this.grounded) {
      this.coyote = 0;
      this.airTime = 0;
      this.airJumps = 1;
      this.wallRunUsed = 0;
      this.freeWall();
      this._assistUsed = false;
      this.spireLaunch = false;
    } else {
      this.coyote += dt;
      this.airTime += dt;
    }
    if (this.comboTimer > 0) this.comboTimer -= dt;
    else this.comboIndex = 0;
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
    if (this.hangLock > 0) this.hangLock -= dt;
    if (this.poleLock > 0) this.poleLock -= dt;
    if (this.spireLock > 0) this.spireLock -= dt;
  }

  _postTimers(dt) {
    // turnRate for ANIMATION's lean / turn-in-place clips
    let d = this.yaw - this._prevYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    LOCO.turnRate = dt > 0 ? d / dt : 0;
    this._prevYaw = this.yaw;
    this.faceDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  _hazards(dt) {
    if (this.hurtCooldown > 0) return;
    const hits = this.col.overlap?.(this.position, this.radius + 0.1, TAGS_HAZARD);
    if (!hits || !hits.length) return;
    _v1.subVectors(this.position, hits[0].mesh ? hits[0].mesh.position : this.position);
    _v1.y = 0;
    if (_v1.lengthSq() < 1e-4) _v1.copy(this.faceDir).negate();
    _v1.normalize();
    /* Through the bus, so a spike costs a lucky charm exactly as a guard's swing does and the
       health module remains the single place that decides what a hit costs. The direct call is
       kept as the fallback for a build without PLAYERHEALTH: a hazard that shoves is a
       degraded hazard, a hazard that does nothing at all is a missing one. */
    if (this.engine.has?.('health')) {
      this.engine.emit('damage', { amount: 1, source: 'hazard', dir: { x: _v1.x, y: 0, z: _v1.z }, force: 8.5 });
    } else {
      this.hurt(_v1, 8.5);
    }
  }

  /**
   * Remember the last place Sly demonstrably stood on solid ground.
   *
   * Adapted from `player__sly.gd`'s `collision_detect()` / `return_to_safe()` pair — see
   * `TUNE.safePoll` for what was taken and what was not. Three gates, and each one is there
   * because the point is only worth having if arriving at it is survivable:
   *
   *   · `grounded` and the `ground` group — never an attached pose. `sweepTo` puts Sly wherever
   *     the rail or the pole says, and half of those are 20 m up a shaft with nothing under them.
   *   · `!narrowGround()` — our two-cast equivalent of their nine-ray fan. A parapet edge or a
   *     spire tip is somewhere Sly *was*, not somewhere he can be put back.
   *   · `hurtCooldown <= 0` — he was not standing in something that hurt him. This costs no new
   *     query: `_hazards` has already run this frame and set it. Without it the recovery point
   *     drifts into the spike pit that killed him, which is the one place it must never be.
   */
  _recordSafeStance(dt) {
    this._safeT -= dt;
    if (this._safeT > 0) return;
    this._safeT = TUNE.safePoll;
    if (!this.grounded || this.sm.group !== 'ground') return;
    if (this.hurtCooldown > 0) return;
    if (this.narrowGround()) return;
    this.safePoint.copy(this.position);
    this.safeYaw = this.yaw;
    this.safeOk = true;
  }

  /**
   * Stuck is not slow, and the difference is the whole predicate.
   *
   *   grounded            -> NOT stuck. A player standing still is stationary and completely fine;
   *                          this is the false positive that matters most and it is excluded first.
   *   `attach` group      -> NOT stuck. A hang, a hook, a pole, a rail and a spire perch are all
   *                          holds the player is choosing to keep, with no time limit by design.
   *   moved > `stuckDist` -> NOT stuck, and the anchor resets. A slow slide down a face is motion;
   *                          only a capsule that is going nowhere accumulates.
   *
   * `wallCling` is deliberately NOT exempted even though it is stationary and airborne: it is
   * group `air`, not `attach`, and it self-terminates at `wallClingMax` 2.0 s, which is why
   * `stuckTime` 3.0 clears it. Exempting it by name would also exempt a capsule pinned against
   * the same wall, which is the case this exists for.
   */
  _stuck(dt) {
    if (!(dt > 0)) return false;
    if (this.grounded || this.sm.group === 'attach') {
      this._stuckT = 0;
      this._stuckAt.set(this.position.x, this.position.y, this.position.z);
      return false;
    }
    if (this.position.distanceToSquared(this._stuckAt) > TUNE.stuckDist * TUNE.stuckDist) {
      this._stuckT = 0;
      this._stuckAt.set(this.position.x, this.position.y, this.position.z);
      return false;
    }
    this._stuckT += dt;
    return this._stuckT >= TUNE.stuckTime;
  }

  /**
   * Two failures, not one. `voidY` catches falling OUT of the world; `_stuck` catches being in it
   * and unable to move.
   *
   * **The stuck case is inescapable by construction, which is why a watchdog is the only fix.**
   * Driven at the tomb pin (§503): the ground is 6 mm under the feet but 57.64° steep, so
   * `_probeGround` refuses it — correctly, since grounding on a 57.64° face would be the bug —
   * and `grounded` never latches. `Jump.canEnter` needs `canGroundJump()`, coyote expires, and
   * there is then no input that produces a jump. Backing off, walking either way and jumping were
   * all driven and all moved the capsule under 7 mm in 180 frames. The player is stationary,
   * airborne and out of options while `_recordSafeStance` has held a good recovery point the
   * whole time.
   *
   * **This is the class fix; closing the 57.64° face is the instance.** The next unwalkable face
   * anybody authors puts a player back in exactly this state, and nothing in `Controller` would
   * notice.
   *
   * **Those coordinates no longer reproduce, and that is the argument for building it this way.**
   * Re-driven against the world lane's current geometry, the capsule at that point settles to
   * `tiptoe`, `grounded true`, y −6.695 within 10 frames — they closed the 57.64° face. The
   * instance is gone and the class is not: the predicate asks only whether Sly is airborne,
   * unattached and has not moved, so it fires the same way at the next unwalkable face anybody
   * authors, and it is pinned to no coordinate that a level edit can move out from under it.
   */
  _safetyNet(dt) {
    if (this._stuck(dt)) {
      this.engine.warn('movement: stuck airborne and unable to move; returning to the last supported stance.');
      if (this.safeOk) this.teleport(this.safePoint, this.safeYaw);
      else this.teleport(SPAWN, SPAWN_YAW);
      return;                       // `teleport` re-anchors the watchdog; nothing else this frame
    }
    if (this.position.y > TUNE.voidY && Number.isFinite(this.position.y)) return;
    /* Falling out of the world used to cost the whole traverse: `SPAWN` is (0, 0, 30) and §8.1's
       ascent ends 26 m up a pylon on the far side of the level. A recovery point that is always
       exactly as far back as it needs to be is the entire value of the reference's version, and
       the SPAWN fallback stays for the case it cannot cover — dying before ever standing on
       anything, which is reachable, because `init` places Sly and `_needSpawnSnap` only snaps him
       down on the first frame COLLISION is live. */
    if (this.safeOk) {
      this.engine.warn('movement: fell out of the world; returning to the last supported stance.');
      this.teleport(this.safePoint, this.safeYaw);
    } else {
      this.engine.warn('movement: fell out of the world; respawning.');
      this.teleport(SPAWN, SPAWN_YAW);
    }
  }

  /* ==================================================================== */
  /* environment probes                                                   */
  /* ==================================================================== */

  _probeEnvironment() {
    /* `init()` places Sly at `SPAWN` before COLLISION exists, so the first frame it IS live
       drops him onto the real floor. Armed once in the constructor, spent here — and also spent
       by `teleport()`, which is the half that was missing: see that method for the 17.5 m
       single-frame snap this gate used to apply to any freshly-minted Controller that had been
       placed by hand. The `fallback` test is what makes it "the first LIVE frame" rather than
       "frame 1": under `FLAT` the cast would report the y = 0 plane and snap him to it. */
    if (this._needSpawnSnap && !this.col.fallback) {
      this._needSpawnSnap = false;
      this._snapToGroundBelow(8);
      /* §610 — re-anchor the drawn easing on the far side of the drop. This is the one place the
         capsule moves a long way inside a frame without going through `teleport()`, and the note
         above records it reaching 17.5 m. It is the same kind of statement a teleport is — the
         floor telling us where Sly actually stands — so there is nothing to ease, and easing it
         would draw him sinking in from mid-air over the first frames of every session. */
      this._drawP0.copy(this.position);
    }
    this._probeGround(this.grounded ? TUNE.groundSnap : 0.06);
  }

  _snapToGroundBelow(searchUp) {
    _v1.copy(this.position); _v1.y += searchUp;
    const g = this.col.groundCheck?.(_v1, this.radius, searchUp + 30);
    if (g?.hit && Number.isFinite(g.y)) this.position.y = g.y;
  }

  /**
   * The walkable limit, per material (§515). THREE sites consume walkability — the ground
   * probe's gate, the sweep-record fallback, and `_moveVertical`'s seat-vs-shed branch — and
   * the first fix scoped only the probe: the drive then climbed fully grounded at a CONSTANT
   * 1.50 m/s, the §509 tell, because `_moveVertical` still shed downhill through the stone
   * limit every frame gravity re-contacted. One helper, all three sites, so the limit cannot
   * fork again.
   */
  _walkableLimit(material) {
    if (material === 'sand') return TUNE.slopeSandDeg * DEG;
    return this.col.SLOPE?.walkable ?? (50 * DEG);
  }

  /** Authoritative grounding. Sets grounded / groundY / groundNormal / groundTag. */
  _probeGround(snapDown) {
    _v1.copy(this.position); _v1.y += TUNE.probeUp;
    const maxDist = TUNE.probeUp + Math.max(0.04, snapDown);
    const g = this.col.groundCheck?.(_v1, this.radius, maxDist);
    const walkable = this._walkableLimit(g?.material);

    if (g?.hit && Number.isFinite(g.y) &&
        g.y <= this.position.y + TUNE.probeUp + 1e-3 &&
        g.y >= this.position.y - Math.max(0.05, snapDown) - 1e-3 &&
        (g.slope == null || g.slope <= walkable + 0.02)) {
      _gndRes.hit = true;
      _gndRes.y = g.y;
      _gndRes.normal.copy(g.normal && g.normal.lengthSq() > 0.1 ? g.normal : UP);
      _gndRes.slope = g.slope ?? Math.acos(Math.min(1, Math.max(-1, _gndRes.normal.y)));
      _gndRes.tag = g.tag || 'ground';
      _gndRes.material = g.material || 'stone';
      _gndRes.rec = g.rec || null;
    } else {
      _gndRes.hit = false;
    }

    /**
     * The swept capsule stopped a fall on a walkable floor THIS frame, so we are on it.
     *
     * `groundCheck` and the sweep can disagree about which surface is under the feet, and when
     * they do the sweep is right — it is what physically stopped the motion. Measured case: a
     * capsule leaning on a face at a ledge, sweep hitting a floor normal 1 mm below it, probe
     * reporting the next surface down 0.107 m away and refusing it because the airborne band is
     * 0.06 m. The result was `grounded=false` held indefinitely, and everything gated on
     * `grounded` wrong for as long as a player leaned. §443.
     *
     * Deliberately narrow: same frame only, walkable slope only (tested here, not at the write
     * site), and it fills the ground record
     * from the sweep rather than inventing one. The rising guard below still applies, so this
     * cannot re-ground a jump on its launch frame.
     */
    if (!_gndRes.hit && this._sweepLandFrame === this._frame) {
      /* Carry the sweep's OWN normal. Substituting `UP` here was a regression caught by
         `traversal.test.mjs`'s slope arm: it does not fill a gap, it **asserts a flat floor**,
         and `this.groundSlope = _gndRes.slope` publishes that to the shedding logic, the
         animation set and the camera. A 45° walkable ramp reported as `slope = 0` is a lie, and
         a substituted constant that is right most of the time is the §418 shape.
         The gate is the probe path's own walkability test rather than `_moveVertical`'s
         `normal.y > 0.3` (that is ~72°, far steeper than walkable) — the write site records any
         floor-ish contact; only a walkable one may ground him. */
      const n = this._sweepLandNormal;
      const slope = Math.acos(Math.min(1, Math.max(-1, n.y)));
      if (slope <= this._walkableLimit(_swRes.material) + 0.02) {
        _gndRes.hit = true;
        _gndRes.y = this._sweepLandY;
        _gndRes.normal.copy(n);
        _gndRes.slope = slope;
        _gndRes.tag = _gndRes.tag || 'ground';
        _gndRes.material = _gndRes.material || 'stone';
      }
    }

    const wasGrounded = this.grounded;
    // Rising: never let a probe re-ground us or a jump dies on frame one.
    const canGround = _gndRes.hit && this.velocity.y <= 0.02;
    this.grounded = canGround;

    if (canGround) {
      this.groundY = _gndRes.y;
      this.groundNormal.copy(_gndRes.normal);
      this.groundSlope = _gndRes.slope;
      this.groundTag = _gndRes.tag;
      this.groundMaterial = _gndRes.material;
      if (!wasGrounded) {
        /* The arrival speed is whichever of the two saw it — `-velocity.y` when the probe won the
           race, the sweep's captured value when it did not. Before this, the sweep winning meant
           `landImpact` came out 0 and the landing was silent. */
        const swept = this._sweepLandFrame === this._frame ? this._sweepLandVy : 0;
        this.landImpact = Math.max(-this.velocity.y, swept);
        this._landFrame = this._frame;
      }
      this.position.y = _gndRes.y;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    return canGround;
  }

  /**
   * Tell the HUD what the game will let Sly grab, before he has to commit.
   *
   * ── The defect this closes ─────────────────────────────────────────────────────────────────
   * Measured on the shipped build: **nothing on screen said what was grabbable.** `thiefTargets`
   * only fires on the rising edge of holding `focus`, so it is a Thief-o-Vision readout;
   * `targetLocked` had exactly one listener and it was FX; `hookGrab` and `railMount` reach Audio
   * and FX only and fire ON CONTACT. Driven, both grab paths gave **0 frames of warning** —
   * announcement and commitment on the same frame, auto-grab and E-grab alike. The HUD's mark and
   * its projection had existed all along with nothing wired to them (§441).
   *
   * ── Why `afford` and not `TargetField` ────────────────────────────────────────────────────
   * `TargetField` is an **air-assist**, not the thing that decides a grab, and every target in
   * this level is `fromGround: false` **by design** — `EgyptLevel.js`'s `notch-pylon-e-mouth`
   * cites `acquire`'s grounded refusal by name and picks its rung to clear it. An assist that
   * deliberately refuses grounded players cannot telegraph §8.1 step 2's grounded E-grab off the
   * kiosk lintel. Both grab paths consult `afford('hook')`, so `afford` is the mechanism.
   *
   * ── Cost ──────────────────────────────────────────────────────────────────────────────────
   * Free on any frame the moveset already asked the same question — `afford` memoises on
   * `_frame`, and `hookSwing`/`railSlide`/`ledgeHang` poll exactly these three. On a frame where
   * none was polled it is one `col.nearest` per kind, which is the honest worst case rather than
   * the advertised one.
   *
   * ── The point is CLONED, and that is not defensive ────────────────────────────────────────
   * `afford` returns a per-tag scratch object whose `point` is overwritten the next time that tag
   * is queried. Handing that reference to the HUD would be the shelf-life defect §441.5 records —
   * a value that arrives correct and then decays into someone else's memory. These holds are
   * static world geometry, so a copy is not merely safe, it is *correct*; the moving-badge
   * argument that makes `setLockOn` hold a live reference does not apply to a stone ring. One
   * allocation per change of hold, and a change of hold is rare.
   */
  /**
   * ── `TUNE.telegraphNextHold`, and why the boolean everyone reached for is the wrong one ──
   *
   * §449 measured the chain leads at 34 / 3 / 7 / 7 / 5 / 1 frames and traced them here: while
   * `sm.group === 'attach'` the emit is `null` by design, so the next ring cannot be announced
   * until the current one is released, and the warning window collapses to the flight time.
   *
   * "Lift the gate" is NOT the change. Lifting it naively emits the ranked-first affordance while
   * attached, and §441.5 established that the ranked-first hold is routinely **the one you are
   * already on** — that is why `TELEGRAPH_KINDS` is an ordering rather than nearest-first. The
   * feature is *announce the NEXT hold*, which needs the held `rec` excluded, and that is what
   * the switch below does.
   *
   * **PARTIAL, and the limit is worth knowing before anyone turns it on.** `afford(kind)` returns
   * one affordance per kind — the best of that kind — so excluding the held rec skips the whole
   * KIND rather than falling through to the second-best hold of the same kind. On a hook chain
   * that means the next RING is not announced; what gets announced is the best rail/pole/spire/
   * ledge instead, if one is in reach. Announcing the genuinely next ring needs `afford` to return
   * a ranked list, which is a change in `Targets.js` and not this seam.
   *
   * **Default OFF and UNMEASURED.** §504.2 could not reproduce §449's chain drive — their harness
   * was never committed and three drivers here reached one grab against their six — so the leads
   * this would deliver have not been measured on the beat that motivated it. The one number that
   * exists is a rate bound: over 420 frames of an approach that barely attaches, the shipped gate
   * emits 4 times and the same scan with `attached` forced false emits 104. This switch should sit
   * far nearer 4 than 104, because it removes exactly the held-hold re-emit that produces most of
   * that difference — and if it does not, that is the answer about clutter.
   */
  _telegraph() {
    const attached = this.sm?.group === 'attach';
    let best = null, bestKind = '';
    if (!attached || TUNE.telegraphNextHold) {
      /**
       * Ranked by KIND, first hit wins — not by distance. Measured: nearest-first pointed the
       * mark at the kiosk lintel's own `ledge`, 0.25 m under Sly's feet, while he was standing on
       * it aiming at a ring 7.27 m away. The nearest affordance is routinely the one you are
       * already on, and a telegraph that marks the floor tells you nothing you are deciding.
       *
       * `TELEGRAPH_KINDS` is therefore an ordering, and it is the same one its own docblock
       * argues: hooks and rails are *aimed at*, ledges are largely *arrived at*, so a hook in
       * cone and in range is the more decision-relevant hold even when a ledge is closer.
       */
      for (const kind of TELEGRAPH_KINDS) {
        /* Ask for "the next hold of this kind, not the one I am on" (§507). Before the exclusion
           was plumbed through `afford`, the held ring came back, was skipped, and the whole KIND
           was skipped with it — so on a hook chain the mark fell through to the best rail or
           ledge instead of naming the next ring. */
        const a = this.afford(kind, attached ? this.attached : null);
        if (!a) continue;
        best = a; bestKind = kind;
        break;
      }
    }
    /* Edge-triggered on the IDENTITY of the hold, not on its distance: a mark that re-emits every
       frame while Sly walks toward the same ring is a per-frame event on the bus for no new
       information. `rec` is the collider the hold belongs to, so two rings are two identities and
       the same ring approached for eighty frames is one. */
    const rec = best ? (best.rec || null) : null;
    if (rec === this._teleRec && bestKind === this._teleKind) return;
    this._teleRec = rec;
    this._teleKind = bestKind;
    this.engine.emit('telegraph', best
      ? { point: best.point.clone(), kind: bestKind, distance: best.distance }
      : null);
  }

  /** Look for a wall in `dir` (XZ). Fills this.wall. Loose enough for battered temple faces. */
  probeWall(dir) {
    const w = this.wall;
    w.ok = false;
    const col = this.col;
    if (typeof col.raycast !== 'function') return w;
    _v1.set(this.position.x, this.position.y + this.height * 0.55, this.position.z);
    _v2.set(dir.x, 0, dir.z);
    if (_v2.lengthSq() < 1e-6) return w;
    _v2.normalize();
    const r = col.raycast(_v1, _v2, this.radius + TUNE.wallProbe);
    if (!r?.hit) return w;
    if (r.tag === 'ground' && Math.abs(r.normal.y) > TUNE.wallNormalMax) return w;
    if (Math.abs(r.normal.y) > TUNE.wallNormalMax) return w;
    w.ok = true;
    w.nx = r.normal.x; w.ny = r.normal.y; w.nz = r.normal.z;
    w.dist = r.distance;
    w.tag = r.tag || 'wall';
    w.rec = r.rec || null;
    return w;
  }

  /**
   * Wall-face bookkeeping — "one face, one bite".
   *
   * `wallSpent` answers *"has this exact face already carried Sly this airborne period?"* and is
   * the predicate `WallRun`/`WallCling` poll on. It is deliberately a question about a **face**,
   * not a body: a rec plus an outward normal, compared with `TUNE.wallFaceDot`. Two faces of the
   * same pylon are two chances; the same face twice is one.
   *
   * Only the *polled* entries consult it. A forced handoff — `WallRun.update` returning
   * `'wallCling'` when the run times out with Sly still pressed into the wall — goes through
   * `sm.request()`, which never calls `canEnter`, so the move that this rule exists to preserve
   * is untouched by it.
   *
   * A null rec is never spent. Under `FLAT` (or a COLLISION that answers without records) every
   * wall would otherwise compare equal to every other and the wall run would vanish entirely —
   * degrading to "no wall tech" is a far worse failure than degrading to "wall tech is free".
   */
  wallSpent(rec, nx, nz) {
    const last = this.lastWallRec;
    if (!last || !rec || rec !== last) return false;
    return nx * this.lastWallNx + nz * this.lastWallNz > TUNE.wallFaceDot;
  }

  /** Stamp the face Sly has just taken. Called from `enter`, so a refused poll stamps nothing. */
  markWall(rec, nx, nz) {
    this.lastWallRec = rec || null;
    const l = Math.hypot(nx, nz) || 1;
    this.lastWallNx = nx / l;
    this.lastWallNz = nz / l;
  }

  /**
   * Give the walls back. Touching *anything else* — the floor, a ledge, a hook, a rail, a pole,
   * a spire, a guard's head — re-arms every face, which is what makes §8.1's ascent read as the
   * authored chain ("wall runs, spire tips, swinging hooks, up the pylon face") rather than as a
   * lift: the wall carries you to the next hold, and the hold pays for the next wall.
   */
  freeWall() {
    this.lastWallRec = null;
    this.lastWallNx = 0;
    this.lastWallNz = 0;
  }

  /**
   * Ledge detection: a vertical face at hand height with walkable top just beyond it.
   * Two probes rather than one so a chest-high parapet reads as a grab and a sheer wall
   * three storeys tall does not.
   */
  probeLedge(dir) {
    const L = this.ledge;
    L.ok = false;
    const col = this.col;
    if (typeof col.raycast !== 'function') return L;
    _v2.set(dir.x, 0, dir.z);
    if (_v2.lengthSq() < 1e-6) _v2.copy(this.faceDir);
    _v2.normalize();

    const hy = this.position.y + TUNE.hangReach;
    _v1.set(this.position.x, hy, this.position.z);
    const face = col.raycast(_v1, _v2, this.radius + 0.62);
    if (!face?.hit || Math.abs(face.normal.y) > 0.55) return L;

    // Step past the face and look down for the lip.
    _v3.copy(face.point).addScaledVector(_v2, 0.34);
    _v3.y = hy + 0.90;
    const top = col.raycast(_v3, DOWN, 1.55);
    if (!top?.hit || top.normal.y < 0.55) return L;
    const ty = top.point.y;
    if (ty > hy + 0.62 || ty < hy - 0.55) return L;

    L.ok = true;
    L.y = ty;
    L.nx = -_v2.x; L.nz = -_v2.z;       // outward normal, away from the wall
    L.x = face.point.x - _v2.x * (this.radius * 0.96);
    L.z = face.point.z - _v2.z * (this.radius * 0.96);
    L.rec = top.rec || face.rec || null;
    return L;
  }

  /** Nearest affordance of `tag`, memoised for the frame. Never returns pooled state. */
  afford(tag, ignoreRec = null) {
    const cfg = AFFORD[tag];
    const s = ignoreRec ? this._affEx[tag] : this._aff[tag];
    if (!cfg || !s) return null;
    if (s.frame === this._frame && s.ignore === ignoreRec) return s.ok ? s : null;
    s.frame = this._frame;
    s.ignore = ignoreRec;
    s.ok = false;
    const col = this.col;
    if (typeof col.nearest !== 'function') return null;
    _qpos.copy(this.position); _qpos.y += cfg.eye;
    let r = null;
    /* `ignoreRec` is passed straight to `Collision.nearest`, which has supported it as
       `opts.ignoreRec` all along — the capability existed and was simply never plumbed through
       here. `_nearOpt` is shared scratch, so it is set on every path and cleared after, or the
       next plain caller inherits an exclusion nobody asked for. */
    _nearOpt.ignoreRec = ignoreRec;
    if (cfg.cone > 0) {
      _nearOpt.facing = _fwd.lengthSq() > 0.1 ? _fwd : this.faceDir;
      _nearOpt.maxAngle = cfg.cone;
      r = col.nearest(_qpos, tag, cfg.range, _nearOpt);
      // A cone miss shouldn't hide a hook Sly is flying straight into.
      if (!r) r = col.nearest(_qpos, tag, TUNE.hookAuto, ignoreRec ? _nearOptPlain(ignoreRec) : undefined);
    } else {
      r = col.nearest(_qpos, tag, cfg.range, ignoreRec ? _nearOptPlain(ignoreRec) : undefined);
    }
    _nearOpt.ignoreRec = null;
    if (!r || !r.point) return null;
    s.point.copy(r.point);
    if (r.tangent && r.tangent.lengthSq() > 1e-6) s.tangent.copy(r.tangent).normalize();
    else s.tangent.set(0, 1, 0);
    s.t = r.t ?? 0;
    s.distance = r.distance ?? s.point.distanceTo(_qpos);
    s.rec = r.rec || null;
    s.ok = true;
    return s;
  }

  /* ==================================================================== */
  /* marks — who Sly is paying attention to                               */
  /* ==================================================================== */

  /**
   * GUARDS, if the build has it. Resolved lazily and cached, like `anim` and `character`: the
   * MANIFEST loads `movement` before `guards`, so a constructor-time lookup would pin null.
   *
   * Everything below goes through the two methods under GUARDS' own `/* public *\/` banner —
   * `nearest()` ("HUD lock-on and FX use this") and `nearestPickpocketTarget()`. MOVEMENT never
   * touches the roster, never imports `src/ai/**` (§1 forbids it), and a build without guards
   * simply has no marks: `canEnter` goes false and the delta is exactly zero. Same discipline as
   * `TargetField` against an empty registry.
   */
  _guardModule() {
    if (!this._guards) this._guards = this.engine.get('guards');
    return this._guards;
  }

  /**
   * The lock-on mark: the body Sly is holding in focus. Memoised for the frame.
   *
   * `wide` means **"we already hold this mark"** — the circle-strafe passes it every frame it is
   * running. Two things change, and both are hysteresis:
   *
   *   · the range opens from `lockRange` to `lockDrop`, so a guard drifting to the edge of the
   *     orbit is kept rather than re-acquired and the camera does not pump at the boundary;
   *   · **the facing cone stops applying.** It is an *acquisition* test — "which of these two did
   *     you mean" — and applying it to retention is a bug I shipped into this file and measured
   *     out of it: circling ~100° carries the mark behind the camera's forward, the cone rejected
   *     it, and the lock dropped mid-orbit through no act of the player's. A lock is broken by
   *     walking away or letting go, never by the move you are performing with it.
   */
  mark(wide = false) {
    const s = this.lock;
    const w = wide ? 1 : 0;
    // Misses are memoised as well as hits: the machine runs up to four poll passes per frame and
    // an unmemoised miss would re-walk the whole garrison on each of them.
    if (s.frame === this._frame && s.wide === w) return s.ok ? s : null;
    const range = wide ? TUNE.lockDrop : TUNE.lockRange;
    s.frame = this._frame;
    s.wide = w;
    s.ok = false;
    s.body = null;
    s.distance = Infinity;
    const G = this._guardModule();
    if (typeof G?.nearest !== 'function') return null;
    let g = null;
    try { g = G.nearest(this.position, range); } catch (e) { this.softFail('nearest', 'guards', e); }
    /* A body on the floor is scenery, not a mark. Compared against the literal rather than
       importing `STATE` from `src/ai/Patrol.js`, because §1 forbids MOVEMENT importing another
       agent's module — and a string on a public field is data, not an internal. */
    if (!g || !g.position || g.state === 'ko') return null;
    _v1.subVectors(g.position, this.position);
    const d = _v1.length();
    if (d > range) return null;
    /* Which of two nearby guards did the player mean? The camera's forward is the only honest
       answer — it is where they are looking, and `_readInput` has already computed it this frame.
       The cone is wide (~99°) on purpose: holding the button is the intent, this only disambiguates.
       Acquisition only — see the note above on why retention must not consult it. */
    if (!wide && d > 1e-3) {
      _v2.copy(_fwd).setY(0);
      if (_v2.lengthSq() < 1e-6) _v2.copy(this.faceDir);
      else _v2.normalize();
      _v3.copy(_v1).setY(0);
      if (_v3.lengthSq() > 1e-6 && _v3.normalize().dot(_v2) < TUNE.lockDot) return null;
    }
    s.ok = true;
    s.body = g;
    s.point.copy(g.position);
    s.distance = d;
    return s;
  }

  /**
   * The pickpocket mark: the nearest guard whose pocket Sly can actually reach, in front of him.
   * Memoised for the frame — the prompt asks every frame and `Pickpocket.canEnter` asks again.
   *
   * The range passed is `pickApproach`, not `pickRange`: MOVEMENT's job is to know a pocket is
   * *approachable*, and GUARDS re-runs its own `pickRange` test when the reach actually fires, so
   * the authority over "was he robbed" stays in one place.
   */
  pickMark() {
    const s = this.pick;
    if (s.frame === this._frame) return s.ok ? s : null;
    s.frame = this._frame;
    s.ok = false;
    s.body = null;
    s.distance = Infinity;
    const G = this._guardModule();
    if (typeof G?.nearestPickpocketTarget !== 'function') return null;
    let g = null;
    try { g = G.nearestPickpocketTarget(this.position, TUNE.pickApproach, this.faceDir); }
    catch (e) { this.softFail('nearestPickpocketTarget', 'guards', e); }
    if (!g?.pocketPosition) return null;
    s.ok = true;
    s.body = g;
    s.point.copy(g.pocketPosition);
    s.distance = this.position.distanceTo(g.pocketPosition);
    return s;
  }

  /**
   * ── `prompt` is deliberately NOT published from here. Do not add it back on its own. ──────────
   *
   * It is tempting: `HUD.js` subscribes to `prompt`, MOVEMENT is the module that knows what Sly
   * can reach, and this file already resolves the pocket mark for `Pickpocket`. A draft of exactly
   * that shipped from here and was reverted, for two reasons worth leaving behind.
   *
   * 1. **It is not a gap.** `HUD._tickAffordancePrompt` already drives contextual verbs — the
   *    pocket via `Guards.nearestPickpocketTarget`, and hook/rail/pole/spire/vent via one
   *    `collision.query`. Publishing the pocket alone adds a second source of truth for a verb
   *    that already appears, which is the `guardAlert`/`guardSpotted` failure mode that
   *    `tests/eventbus.test.mjs` keeps a whole list to prevent.
   * 2. **The first publisher retires that fallback**, so a partial publication costs the four
   *    traversal verbs and buys nothing. `tests/eventbus.test.mjs` names the trap in advance and
   *    parks `prompt` in DEAD_UNBUILT for it.
   *
   * The correct version — MOVEMENT owns the pocket, HUD keeps traversal — spans `src/player/` and
   * `src/ui/` and is routed as one coordinated change, recorded in `progress/records/ui/`. The
   * cost argument the first draft gave for omitting hook/rail/pole was also simply wrong:
   * `collision.query` takes a tag array and answers all five in a single BVH walk, which is
   * cheaper than the per-tag `afford()` calls that draft was avoiding.
   */

  /**
   * Hand ANIMATION the head/upper-body look-at (§4.7). MOVEMENT has never used this channel, and
   * a lock-on that does not turn Sly's head is a lock-on the player has to take on trust.
   */
  _pushLookAt() {
    const st = this.sm.current;
    const want = st && (st.name === 'combatStrafe' || st.name === 'pickpocket')
      ? (st.name === 'pickpocket' ? this.pick : this.lock) : null;
    const on = !!(want && want.ok);
    if (!on && !this._lookAt) return;
    this._lookAt = on;
    const a = this.anim;
    if (!a?.setLookAt) return;
    if (on) {
      // Aim at the head, not the feet: `headY` is GUARDS' own public accessor for exactly this.
      _v1.copy(want.point);
      _v1.y = Number.isFinite(want.body?.headY) ? want.body.headY : _v1.y + 1.6;
      try { a.setLookAt(_v1); } catch (e) { this.softFail('setLookAt', 'animation', e); }
    } else {
      try { a.setLookAt(null); } catch (e) { this.softFail('setLookAt', 'animation', e); }
    }
  }

  /** True when the surface underfoot is too narrow to walk normally — tiptoe territory. */
  /**
   * Is the ground under Sly a narrow ledge? Two side casts at ±(radius + 0.30).
   *
   * §515.2: the comparison is against the GROUND PLANE, not against flat. The old test was
   * `|g.y − groundY| > 0.35`, and on a steep slope the downhill cast sits lower by
   * offset × tan(slope) × sin(heading-off-fall-line) — at 52° any heading 25° off the gradient
   * crosses 0.35, so the whole west dune classified as a narrow ledge and the climb spent
   * 116 of 120 frames in `tiptoe` at balance speed. That was the user's "difficult to walk up
   * slopes": not the walkability gate (that was §515.1's half), but Tiptoe hijacking the gait
   * at exactly 1.50 m/s — a constant that was the tell (§509).
   *
   * `expectedY` is where the side sample WOULD sit if the ground were the plane through the
   * ground contact: on any planar slope the residual is 0 at every angle and heading, so the
   * probe is slope-blind by construction; at a true ledge the cast misses or lands far off the
   * plane, which is exactly what "narrow" means. Flat ground reduces to the old test verbatim.
   */
  narrowGround() {
    const col = this.col;
    if (typeof col.groundCheck !== 'function' || col.fallback) return false;
    _rgt.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const n = this.groundNormal;
    const ny = Math.max(0.2, n.y);
    for (let s = -1; s <= 1; s += 2) {
      const dx = _rgt.x * s * (this.radius + 0.30);
      const dz = _rgt.z * s * (this.radius + 0.30);
      const expectedY = this.groundY - (n.x * dx + n.z * dz) / ny;
      /* Cast from probeUp above the EXPECTED surface, not above the current feet: on the uphill
         side the plane sits above the feet, and a cast whose origin is below the ground it is
         looking for reports a miss — which read as "void", which read as "narrow", which was
         the first version of this fix changing nothing (residual −0.01 on the downhill side,
         hit=false on the uphill, measured). */
      _v1.set(this.position.x + dx, expectedY + TUNE.probeUp, this.position.z + dz);
      const g = col.groundCheck(_v1, this.radius * 0.5, TUNE.probeUp + 0.45);
      if (!g?.hit || Math.abs(g.y - expectedY) > 0.35) return true;
    }
    return false;
  }

  inVent() {
    const hits = this.col.overlap?.(this.position, this.radius + 0.05, TAGS_VENT);
    if (hits && hits.length) return true;
    return this.groundTag === 'vent';
  }

  /* ==================================================================== */
  /* motion                                                               */
  /* ==================================================================== */

  /** Steer the horizontal velocity toward wishDir × target, per §6's accel/decel. */
  accelerate(dt, target, accel, decel) {
    const v = this.velocity;
    const wm = this.wishMag;
    if (wm > 0.05) {
      const tx = this.wishDir.x * target * wm;
      const tz = this.wishDir.z * target * wm;
      const dx = tx - v.x, dz = tz - v.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        const step = Math.min(d, accel * dt);
        v.x += dx / d * step;
        v.z += dz / d * step;
      }
    } else {
      const sp = Math.hypot(v.x, v.z);
      if (sp > 1e-5) {
        const step = Math.min(sp, decel * dt);
        v.x -= v.x / sp * step;
        v.z -= v.z / sp * step;
      }
    }
  }

  /** Clamp horizontal speed without touching direction. */
  clampSpeed(max) {
    const v = this.velocity;
    const sp = Math.hypot(v.x, v.z);
    if (sp > max && sp > 1e-5) { const k = max / sp; v.x *= k; v.z *= k; }
  }

  speedXZ() { return Math.hypot(this.velocity.x, this.velocity.z); }

  turnToward(dir, rate, dt) {
    if (!dir || (dir.x === 0 && dir.z === 0)) return;
    this.turnToYaw(Math.atan2(dir.x, dir.z), rate, dt);
  }

  turnToYaw(target, rate, dt) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const step = rate * dt;
    this.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  gravity(dt, scale = 1) {
    const v = this.velocity;
    v.y += TUNE.gravity * scale * dt;
    /* Apex hang (§6): trimming vy near zero shortens the rise and stretches the float. Raised
       to a per-second exponent so the feel is identical at 30 and 144 fps.

       **Only while rising.** §6 states the rule as "vy scaled ×0.72 while |vy| < 2.2", and applied
       on the way down as well that is not a hang, it is a parachute: v ← (v − g·dt)·0.72 has a
       stable fixed point at −0.4·0.72/(1−0.72) = **−1.03 m/s**, which the descent converges to and
       can never leave, because it never reaches the 2.2 m/s that would switch the trim off. Sly
       fell at 1 m/s from any height — a 2.4 m jump took 2.4 s to come down, `landImpact` never
       passed the 3.2 threshold so `land` and `land_hard` were unreachable, and `maxFall` was dead
       code. Measured, not reasoned: see tests/targets.test.mjs, which asserts a ballistic descent
       because every number it reports depends on one.
       The rise is deliberately untouched, so both jump heights stay exactly as calibrated (the
       `doubleJumpV0 = 9.90` note above is a measurement of this trim on the way up). */
    if (v.y > 0 && v.y < TUNE.apexWindow) v.y *= Math.pow(TUNE.apexHang, dt * 60);
    if (v.y < TUNE.maxFall) v.y = TUNE.maxFall;
  }

  /** Variable jump height (§6): let go of Space and the arc is cut short. */
  applyJumpCut() {
    if (this.velocity.y > 0 && this.released('jump')) this.velocity.y *= TUNE.jumpCut;
  }

  /** Full integration step: horizontal slide (+ step-up), vertical, then re-ground. */
  move(dt) {
    this.hitWall = false;
    this.hitCeiling = false;
    this._moveHorizontal(dt);
    this._moveVertical(dt);
    this._probeGround(this.grounded ? TUNE.groundSnap : 0.06);
  }

  /**
   * Integrate with the capsule switched off — no sweep, no ground probe.
   *
   * This is target magnetism's "collider bypass" (IMPORT §2): inside `magNoClip` of a target the
   * geometry around the point must not be able to wedge the assist, because the lip of geometry
   * you are being helped over is usually the very thing you would catch on. Nothing else may use
   * this; it is bounded by the 2.475 m radius and by `magMaxTime`.
   */
  moveNoClip(dt) {
    this.hitWall = false;
    this.hitCeiling = false;
    this.position.addScaledVector(this.velocity, dt);
    this.grounded = false;
  }

  /** Horizontal only — used by states that manage their own vertical motion. */
  moveHorizontalOnly(dt) {
    this.hitWall = false;
    this._moveHorizontal(dt);
  }

  /** Straight kinematic displacement with slide — attached moves (rail/pole/hook) use this. */
  sweepTo(target) {
    _disp.subVectors(target, this.position);
    return this._slide(_disp, 3, false);
  }

  _moveHorizontal(dt) {
    const v = this.velocity;
    _disp.set(v.x * dt, 0, v.z * dt);
    if (_disp.lengthSq() < 1e-12) return;

    let stepping = this.grounded;
    _saveP.copy(this.position);

    if (stepping) {
      _p2.copy(_saveP); _p2.y += TUNE.stepHeight;
      if (this._sweep(_saveP, _p2).hit) stepping = false;
      else this.position.copy(_p2);
    }

    this._slide(_disp, 4, true);

    if (stepping) {
      /* Re-seat on the floor, VERTICALLY ONLY.
       *
       * This is where the downhill slide lived. The snap requests a purely vertical drop, but
       * `Collision.capsuleSweep` clips leftover motion into the contact plane — and downward
       * motion clipped into a TILTED plane is downhill motion. Copying the resolved position
       * therefore imported that slide into `x/z` every single frame: measured 0.07 m per frame
       * on a 12.3 deg grade, from sweeps whose requested horizontal displacement was exactly
       * 0.00000. Standing still on a 10 deg ramp drifted 0.1026 m downhill in 90 frames with no
       * input at all.
       *
       * A snap answers "how far down is the floor". That question has a distance, not a
       * direction, so any horizontal component in its answer is by construction not a snap.
       * `toi` is the fraction of the original (vertical) direction travelled before first
       * contact, so `drop * toi` re-seats him on the surface directly beneath where the
       * horizontal slide already put him, and `x/z` are left exactly as that slide decided.
       *
       * This does NOT touch shedding: a steep face sheds through gravity, `_moveVertical` and
       * `groundCheck`'s walkability gate, none of which run through here — verified on a
       * synthetic 55 deg and 65 deg ramp rather than assumed. */
      const drop = TUNE.stepHeight + TUNE.groundSnap;
      _p3.copy(this.position);
      _p3.y -= drop;
      const dn = this._sweep(this.position, _p3);
      if (dn.hit) {
        /* Descend by the time-of-impact, but never further than the resolve actually moved him
           down. `toi` alone is not enough: `capsuleSweep` also reports `hit` when DEPENETRATION
           pushed the capsule clear without the sweep contacting anything, and on that path it
           sets `toi = 1`. Taking that at face value dropped him the whole `stepHeight +
           groundSnap` at a summit lip and he fell off the top of the ladder — measured as
           "ended airborne in fall at y 0.00". Both quantities come from the same result, so the
           min is a bound rather than a tuning constant. */
        const byToi = drop * dn.toi;
        const byResolve = Math.max(0, this.position.y - dn.position.y);
        this.position.y -= Math.min(byToi, byResolve);
      } else {
        this.position.y -= TUNE.stepHeight;   // walked off an edge: give the lift back
      }
    }
  }

  _moveVertical(dt) {
    const v = this.velocity;
    if (Math.abs(v.y) < 1e-9) return;
    _disp.set(0, v.y * dt, 0);
    _to.copy(this.position).add(_disp);
    const r = this._sweep(this.position, _to);
    if (!r.hit) { this.position.copy(_to); return; }

    /* Landing on ground he can STAND on seats him vertically; landing on a face he cannot stand
     * on lets the resolve carry him. Same defect as the ground snap, opposite correct answer, and
     * the discriminator is the one the collision layer already publishes.
     *
     * `capsuleSweep` clips leftover motion into the contact plane, so a purely vertical fall onto
     * a TILTED plane resolves with a downhill horizontal component. On a wall or an overhang that
     * is the whole point — it is how a steep face sheds you. On a walkable grade it is a defect:
     * standing still with no input on a 3-15 deg slope travelled a mean of 0.2816 m and a maximum
     * of 2.1644 m in 90 frames, because gravity re-contacts the surface every frame and every
     * contact donates a little downhill.
     *
     * Gating on walkability restores the AUTHORED intent rather than choosing a new one: this
     * level contains no unwalkable ground at all — the steepest sampled face is 47.9 deg against
     * a 50 deg limit — so every grade the drift was sliding him down was authored standable.
     * The shedding half therefore cannot be tested on this level at all, and is verified on a
     * synthetic 55/65 deg ramp instead; see the arm.
     *
     * The bound is the same idiom as the snap: descend by time-of-impact, never further than the
     * resolve actually achieved vertically, because `hit` is also set when DEPENETRATION pushed
     * the capsule clear without the sweep contacting anything (and sets `toi = 1`). */
    /* §515: per-material, through the same helper as the probe gate and the fallback. A stone
       face keeps `WALKABLE_COS`; sand seats up to `slopeSandDeg`. Without this branch the fix
       half-worked: grounded, accelerating, and shedding downhill to a constant 1.50 m/s. */
    const wcos = r.material === 'sand'
      ? Math.cos(TUNE.slopeSandDeg * Math.PI / 180)
      : (Number.isFinite(this.col.WALKABLE_COS)
        ? this.col.WALKABLE_COS
        : Math.cos(this.col.SLOPE?.walkable ?? (50 * Math.PI / 180)));
    if (v.y < 0 && r.normal.y >= wcos) {
      const fall = Math.abs(_disp.y);
      const byToi = fall * r.toi;
      const byResolve = Math.max(0, this.position.y - r.position.y);
      this.position.y -= Math.min(byToi, byResolve);
    } else {
      this.position.copy(r.position);
    }
    /**
     * The sweep is the authority on arriving, and it now says so instead of erasing the evidence.
     *
     * ── What used to happen (the landing coin flip) ──────────────────────────────────────────
     * `v.y` here IS the true arrival speed. Zeroing it left `_probeGround` — which reads
     * `-velocity.y` a few lines later — nothing to measure, so `landImpact` came out 0 and
     * `Land.canEnter` refused. The probe only ever won when the frame before touchdown happened
     * to leave Sly inside its 0.06 m band: measured 12 wins in 40 sub-frame phases. Driven on the
     * shipped temple that produced **silent landings at 0.5, 4, 6 and 10 m and audible ones at
     * 1, 2.5, 8 and 15 m** — not ordered by speed, so unlearnable. §443.
     *
     * ── And the same erasure hid a second defect ─────────────────────────────────────────────
     * A capsule leaning on a face at a ledge sat in `fall` with `grounded=false` for 60 s of game
     * time while `groundCheck` reported solid ground 0.107 m below its feet — outside the 0.06 m
     * airborne band, so the probe refused it forever. But the downward sweep was hitting a floor
     * normal (0.00, 0.99, −0.14) at `toi` 0.002, one millimetre away: **the capsule was standing
     * on a surface the probe was measuring past.** The sweep knew and threw the fact away.
     *
     * So the contact is recorded rather than discarded. `_probeGround` consumes it on the same
     * frame and only on the same frame — `_landFrame`/`_sweepFrame` gating is already this file's
     * idiom for exactly that.
     */
    if (r.normal.y > 0.3 && v.y < 0) {
      this._sweepLandVy = -v.y;
      this._sweepLandY = this.position.y;
      this._sweepLandNormal.copy(r.normal);
      this._sweepLandFrame = this._frame;
      v.y = 0;
    }
    else if (r.normal.y < -0.3 && v.y > 0) { v.y = 0; this.hitCeiling = true; }
    else { v.y = 0; }
  }

  /** Iterative sweep-and-slide. `killVel` projects velocity out of the contact plane. */
  _slide(disp, maxIter, killVel) {
    const pos = this.position;
    let hitAny = false;
    _rem.copy(disp);
    for (let i = 0; i < maxIter; i++) {
      if (_rem.lengthSq() < 1e-10) break;
      _to.copy(pos).add(_rem);
      const r = this._sweep(pos, _to);
      if (!r.hit) { pos.copy(_to); break; }
      hitAny = true;
      _n.copy(r.normal);
      if (_n.lengthSq() < 0.1) _n.set(0, 1, 0);
      pos.copy(r.position);
      _rem.subVectors(_to, pos);
      const d = _rem.dot(_n);
      if (d < 0) _rem.addScaledVector(_n, -d);
      // Corner forgiveness: an internal edge produces two nearly-opposed normals in one frame.
      // Bleed the residual instead of ping-ponging Sly to a dead stop between them.
      _rem.multiplyScalar(0.98);
      if (killVel) {
        const vd = this.velocity.dot(_n);
        if (vd < 0) this.velocity.addScaledVector(_n, -vd);
      }
      this.lastHitNormal.copy(_n);
      this.lastHitTag = r.tag;
      if (Math.abs(_n.y) <= TUNE.wallNormalMax) this.hitWall = true;
    }
    return hitAny;
  }

  _sweep(from, to) {
    const col = this.col;
    const o = this._capOff;
    _sfrom.copy(from); _sfrom.y += o;
    _sto.copy(to); _sto.y += o;
    let r = null;
    try { r = col.capsuleSweep(_sfrom, _sto, this.radius, this.height, _sweepOpt); }
    catch (e) { this.softFail('capsuleSweep', 'collision', e); r = null; }
    if (r && r.hit && Number.isFinite(r.position?.x)) {
      _swRes.hit = true;
      _swRes.position.copy(r.position); _swRes.position.y -= o;
      _swRes.normal.copy(r.normal && r.normal.lengthSq() > 0.1 ? r.normal : UP);
      _swRes.distance = r.distance ?? 0;
      /* Fraction of the ORIGINAL direction travelled before first contact. The ground snap needs
         this rather than the resolved position, because the resolved position has already been
         slid along the contact plane and a snap must not travel. */
      _swRes.toi = Number.isFinite(r.toi) ? r.toi : 1;
      /* WHY it hit, not just THAT it hit — §409. `hit` is the disjunction `sweepHit || depenHit`
         and its two disjuncts demand opposite handling, so both are carried through rather than
         collapsed here. A collision module that predates the split reports neither; `sweepHit`
         then defaults to the safe reading (`true`, "the sweep contacted"), which is exactly what
         every caller assumed before the split, so an old module keeps its old behaviour. */
      _swRes.sweepHit = r.sweepHit === undefined ? true : !!r.sweepHit;
      _swRes.depenHit = !!r.depenHit;
      _swRes.depenDepth = Number.isFinite(r.depenDepth) ? r.depenDepth : 0;
      _swRes.tag = r.tag || '';
      _swRes.material = r.material || 'stone';
      _swRes.rec = r.rec || null;
    } else {
      _swRes.hit = false;
      _swRes.position.copy(to);
      _swRes.normal.set(0, 1, 0);
      _swRes.tag = ''; _swRes.rec = null; _swRes.distance = 0; _swRes.toi = 1;
      _swRes.sweepHit = false; _swRes.depenHit = false; _swRes.depenDepth = 0;
    }
    return _swRes;
  }

  raycast(origin, dir, maxDist) {
    const col = this.col;
    if (typeof col.raycast !== 'function') { _rayRes.hit = false; return _rayRes; }
    let r = null;
    try { r = col.raycast(origin, dir, maxDist); }
    catch (e) { this.softFail('raycast', 'collision', e); }
    if (r?.hit) {
      _rayRes.hit = true;
      _rayRes.point.copy(r.point);
      _rayRes.normal.copy(r.normal && r.normal.lengthSq() > 0.1 ? r.normal : UP);
      _rayRes.distance = r.distance ?? 0;
      _rayRes.tag = r.tag || '';
      _rayRes.rec = r.rec || null;
    } else _rayRes.hit = false;
    return _rayRes;
  }

  /**
   * Ledge snap assist (§6, 0.45 m). A jump that lands a hand's width short of a lip is a
   * jump the player believes they made — so make it true. One assist per airborne period,
   * only while descending, and always validated by a sweep so it can't push Sly into rock.
   */
  ledgeAssist() {
    if (this._assistUsed || this.grounded) return false;
    const v = this.velocity;
    if (v.y > 0.5 || v.y < -16) return false;
    const col = this.col;
    if (typeof col.groundCheck !== 'function' || col.fallback) return false;

    let hx = v.x, hz = v.z;
    if (Math.hypot(hx, hz) < 0.6) { hx = this.wishDir.x; hz = this.wishDir.z; }
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-4) return false;
    hx /= hl; hz /= hl;

    // Nothing to save if we're already over floor.
    _v1.copy(this.position); _v1.y += TUNE.probeUp;
    const here = col.groundCheck(_v1, this.radius, TUNE.probeUp + 0.55);
    if (here?.hit && here.y > this.position.y - 0.55) return false;

    for (let i = 1; i <= 3; i++) {
      const d = TUNE.ledgeSnap * (i / 3);
      _v2.set(this.position.x + hx * d, this.position.y + TUNE.probeUp + 0.30, this.position.z + hz * d);
      const g = col.groundCheck(_v2, this.radius * 0.9, TUNE.probeUp + 0.95);
      if (!g?.hit) continue;
      if (g.y < this.position.y - 0.40 || g.y > this.position.y + 0.42) continue;
      // Validate by dropping in from above rather than shoving sideways through the lip.
      _v3.set(this.position.x + hx * d, g.y + 0.75, this.position.z + hz * d);
      _v4.set(_v3.x, g.y + 0.02, _v3.z);
      const drop = this._sweep(_v3, _v4);
      if (drop.hit && drop.position.y > g.y + 0.22) continue;
      this.position.set(_v4.x, Math.max(g.y + 0.01, this.position.y), _v4.z);
      if (this.velocity.y < 0) this.velocity.y *= 0.35;
      this._assistUsed = true;
      return true;
    }
    return false;
  }

  /* ==================================================================== */
  /* jump helpers                                                         */
  /* ==================================================================== */

  /** True when a ground jump is legal — includes coyote time (§6, 110 ms). */
  canGroundJump() {
    return this.grounded || this.coyote <= TUNE.coyote;
  }

  launch(vy) {
    this.velocity.y = vy;
    this.grounded = false;
    this.coyote = 99;
    this.position.y += 0.02;   // clear the probe band so the jump can't be re-grounded
  }

  /* ==================================================================== */
  /* animation / peers                                                    */
  /* ==================================================================== */

  /** Set the looping base clip. Only calls play() when it actually changes. */
  baseClip(name, fade = 0.14) {
    if (!name || name === this._baseClip) return;
    this._baseClip = name;
    const a = this.anim;
    if (a?.play) { try { a.play(name, { fade, loop: true }); } catch (e) { this.softFail('play', name, e); } }
  }

  /** Fire-and-forget clip. Does not become the base, so the base resumes underneath it. */
  oneShot(name, speed = 1, fade = 0.08) {
    const a = this.anim;
    if (!name || !a?.play) return;
    this._baseClip = '';   // force the next baseClip() call through
    try { a.play(name, { fade, loop: false, speed }); } catch (e) { this.softFail('play', name, e); }
  }

  onStateChanged(next, _prev) {
    this.stateName = next.name;
    this.height = next.capsule > 0 ? next.capsule : TUNE.height;
    /* Every hold in the game is in the `attach` group — hook, rail, pole, spire, ledge, and an
       authored magnet point. Taking one of them is Sly touching the world somewhere that is not
       a wall, so it pays for the walls again. One hook on the way up is the difference between
       the ascent §8.1 designs and the lift the wall face was. Done here rather than in seven
       `enter`s because the group already says exactly this and the machine already funnels every
       transition through this method. */
    if (next.group === 'attach') this.freeWall();
    /**
     * How this airborne episode BEGAN — the second term the hard landing needs (§502).
     *
     * `landHard` was a pure speed threshold, and §500 measured that speed cannot separate the two
     * things it is asked to: walking off a 3 m terrace and walking off a 17 m cornice are the same
     * act on the same kind of surface, differing only in height, and height is what arrival speed
     * already measures. On the shipped level the MEDIAN walk-off arrives at 17.200 m/s against a
     * threshold of 15.0, so more than half of every edge in the game was a control tax.
     *
     * The distinction that does work is not a property of the fall at all — it is how the fall
     * started, and the machine already carries it. Every ground-group state's only route into the
     * air is `if (!c.grounded) return 'fall'` (Idle, Move, Sneak, Crouch, Roll, Skid, Land, Tiptoe
     * — verified, all eight), which means *stopped being supported while standing on something*.
     * A `Jump` also begins from the ground. Both are departures the player made.
     *
     *   from `ground`   walked off an edge, or jumped  -> CONTROLLED
     *   from BEAT_LOST  lost a cling / wall / hook / rail / pole / hang, or was knocked out of
     *                   `hurt`                          -> not controlled
     *   anything else   jump -> fall at apex, fall -> dive: a continuation, NOT a new episode,
     *                   so the flag is deliberately left alone rather than recomputed
     *
     * **`BEAT_LOST` is an explicit list and not a group test, and that is load-bearing.** The first
     * version of this used `prev.group !== 'air'`, on the assumption that the wall states were
     * `attach`. Measured: `wallCling`, `wallRun`, `wallClimb` and `wallJump` are all group **`air`**,
     * so a lost grip was air -> air and the rule skipped it silently. The group separates `attach`
     * holds from wall work; it does not separate "left on purpose" from "fell off", which is the
     * distinction this needs. Verified against the shipped state table, all 31 states.
     *
     * Done here for the same reason `freeWall()` above is: the machine funnels every transition
     * through this method, so it costs one site instead of a tag on each of the ~40 `return 'fall'`
     * sites in `Moveset.js`.
     *
     * KNOWN RESIDUAL, stated because it is a real error and it is the RIGHT direction: a
     * *deliberate* hook or rail release reads as uncontrolled, because `HookSwing` returns `'fall'`
     * from two lines that mean opposite things (a `crouch` release and the hook going out of
     * range) and the state name cannot tell them apart. So a chosen 25 m drop off a hook still
     * lands hard. Erring toward "that was an event" on a 25 m fall is the tolerable half of this.
     */
    if (next.group === 'air' && _prev) {
      if (_prev.group === 'ground') this._airControlled = true;
      /* `jump` before the BEAT_LOST test, and the ordering is the fix (§511). Every one of the
         six `return 'jump'` sites in Moveset.js is input-gated — a press or buffered press at
         five (Roll, RailSlide, RailWalk, PoleClimb, SpireLand), a deliberate stick-up vault at
         the pole top, and PoleSwing's designed launch at the end of an arc the player started.
         There is no involuntary route into the state (verified, all six guards read). So a
         BEAT_LOST state exiting INTO `jump` is the player leaving on purpose — the §485.2
         obelisk sequence hit exactly this: poleClimb -> jump on a real press was classified as
         a lost beat, and the flag then rode unchanged through spireLand into a 13 m drop that
         landed 31.0 HARD on the route's own documented alternative. */
      else if (next.name === 'jump') this._airControlled = true;
      /* `spireLand` has no failure mode: velocity is zeroed every frame, there is no timer and
         no grip, and its three exits are a jump press, a crouch drop, and a walk-off debounced
         at 0.16 s precisely so "a stray tap doesn't drop you off the tip". Every departure is
         chosen, so it classifies as controlled rather than being left to inherit whatever the
         flag held before the perch — which is the staleness §511 measured. */
      else if (_prev.name === 'spireLand') this._airControlled = true;
      else if (BEAT_LOST.has(_prev.name)) this._airControlled = false;
    }
    this.engine.emit('playerState', next.name);
  }

  softFail(what, who, err) {
    const msg = `movement: ${what} failed in "${who}": ${err?.message || err}`;
    if (this.engine.warnings.length < 190) this.engine.warn(msg);
  }

  _pushLocomotion(dt) {
    const st = this.sm.current;
    LOCO.speed = this.speed;
    LOCO.maxSpeed = TUNE.runSpeed;
    LOCO.grounded = this.grounded;
    LOCO.airborne = !this.grounded;
    LOCO.sneaking = !!st?.sneaking;
    LOCO.crouching = !!st?.crouching;
    LOCO.verticalVelocity = this.velocity.y;
    LOCO.slope = this.groundSlope;
    LOCO.surface = this.groundMaterial;
    if (dt <= 0) LOCO.turnRate = 0;
    const a = this.anim;
    if (a?.setLocomotion) { try { a.setLocomotion(LOCO); } catch (e) { this.softFail('setLocomotion', 'animation', e); } }
  }

  /**
   * §610 — hold back the part of this frame's displacement that velocity does not explain, and pay
   * it off in `drawEaseFrames` equal steps. PRESENTATION ONLY: this reads `position` and
   * `velocity` and writes `_drawLag`, which nothing but `_pushCharacter` consumes. There is no
   * path from the offset back into the simulation, so chain order, `spawn2eye`, `telegraph` and
   * every other drive are unaffected BY CONSTRUCTION rather than by luck — which is the whole
   * reason this succeeds where four simulation-side attempts (§593-§598) did not.
   *
   * Why "unexplained" and not "large": speed cannot separate the two populations. A dive reaches
   * 0.785 m per frame honestly and a catch covers 4.646 m from a standstill; a bound on the step
   * would either rate-limit the dive or miss the catch. Velocity separates them cleanly — the dive
   * travelled its distance, the catch did not.
   */
  _easeDraw(dt) {
    const N = TUNE.drawEaseFrames | 0;
    if (N <= 0) { if (this._drawEaseN) { this._drawLag.set(0, 0, 0); this._drawEaseN = 0; } return; }

    _dv.subVectors(this.position, this._drawP0);
    const moved = _dv.length();
    /* `_drawV0` is the speed at the TOP of the frame, so `explained` is the distance the capsule
       had the budget to travel. Clamped at `moved` because a frame that decelerates (a landing, a
       wall) travels less than its budget, and a shortfall is not something to ease. */
    const unexplained = moved - Math.min(moved, this._drawV0 * dt);
    if (unexplained > TUNE.drawSnapMin && moved > 1e-6) {
      /* Hold back only the unexplained fraction, along the displacement the frame actually made.
         The drawn body still travels `explained` this frame, so it keeps moving at the speed it
         was moving; what it does not do is jump the rest. */
      this._drawLag.addScaledVector(_dv, unexplained / moved);
      if (this._drawLag.lengthSq() > TUNE.drawLagMax * TUNE.drawLagMax) {
        this._drawLag.setLength(TUNE.drawLagMax);
      }
      this._drawEaseN = N;
    }
    /* Linear payoff. Scaling by (n-1)/n and counting down spends the lag in exactly n equal steps
       — the largest drawn step is the snap over N, and it is the same size on every one of them.
       An exponential decay would not do: it pays most of the snap on the first frame, which is the
       frame the cut is on. */
    if (this._drawEaseN > 0) {
      this._drawLag.multiplyScalar((this._drawEaseN - 1) / this._drawEaseN);
      if (--this._drawEaseN === 0) this._drawLag.set(0, 0, 0);
    }
  }

  /**
   * §723A — advance the swing pin's weight. One ramp, two rates: `swingPinIn` toward 1 while
   * the swing holds, `swingPinOut` toward 0 the moment it does not — a release, a crouch bail,
   * a hurt, all through the same door, because `stateName` is the whole condition. Linear on
   * purpose (§610's argument): equal steps mean the largest drawn step at the release is the
   * held offset over the frame count, the same size on every one of them.
   */
  _swingRamp(dt) {
    if (!SWING_PINNED) { this._swingW = 0; return; }
    const want = this.stateName === 'hookSwing' ? 1 : 0;
    if (want > this._swingW) this._swingW = Math.min(1, this._swingW + dt / Math.max(1e-4, TUNE.swingPinIn));
    else if (want < this._swingW) this._swingW = Math.max(0, this._swingW - dt / Math.max(1e-4, TUNE.swingPinOut));
  }

  /**
   * §723A — pivot the DRAWN character about the crook-on-ring contact.
   *
   * ORDER IS THE WHOLE GAME. The clip animates the arms, so the crook seat moves every frame;
   * a correction computed before pose evaluation chases last frame's hand (§442's shape — an
   * instrument reading the bind pose measures nothing). The MANIFEST runs ANIMATION before
   * MOVEMENT, so by the time `_pushCharacter` calls this, the bone locals already carry THIS
   * frame's pose — the same guarantee `Guard.js`'s cone path leans on when it forces matrices
   * "current *now* rather than last frame". The one thing still stale is the world matrices
   * under the root we just moved, so they are refreshed here before the seat is read.
   *
   * The transform, in full: with the root at its baseline placement (capsule minus §610 lag,
   * yaw only), read the cane `hookPoint`'s world position `p` out of the posed hierarchy; build
   * `Q` = the rotation carrying world-down onto the pendulum's radial direction (anchor to
   * capsule — the swing angle the state already integrates); rotate the whole drawn body by `Q`
   * about `p` (the crook holds still, the feet sweep); then translate by `anchor − p` so the
   * crook seat lands exactly on the ring's point. Held as a (Δp, ΔQ) delta against the baseline
   * so the release can FREEZE it and pay it off while the capsule flies — recomputing after the
   * release would pin a flying body's cane to a ring it has let go of.
   *
   * The capsule, the pendulum, `spent()`, the camera's target — none of it is read back from
   * here. §605's rings and every hook record are untouched by construction.
   */
  _swingDraw(root) {
    const w = this._swingW;
    if (w <= 0) return;
    if (this.stateName === 'hookSwing') {
      const cane = this.character?.cane;
      const co = cane?.object, hp = cane?.hookPoint;
      if (!co || !hp) { this._swingW = 0; return; }        // a character with no cane has no crook to pin
      _swA.subVectors(this.position, this.anchor);
      if (_swA.lengthSq() < 1e-6) _swA.set(0, -1, 0); else _swA.normalize();
      _swQ.setFromUnitVectors(DOWN, _swA);                 // pendulum deviation from vertical
      root.updateMatrixWorld(true);                        // fresh matrices under the moved root
      _swB.copy(hp); co.localToWorld(_swB);                // p — the crook seat, posed, this frame
      /* rotate about p, then pin p to the ring: root' = Q·(root − p) + p + (anchor − p) */
      _swA.copy(root.position).sub(_swB).applyQuaternion(_swQ).add(this.anchor);
      this._swingDp.subVectors(_swA, root.position);
      if (this._swingDp.lengthSq() > TUNE.swingPinMax * TUNE.swingPinMax) {
        this._swingDp.setLength(TUNE.swingPinMax);
      }
      this._swingDq.copy(_swQ);
    }
    if (w >= 1) {
      root.position.add(this._swingDp);
      root.quaternion.premultiply(this._swingDq);
    } else {
      root.position.addScaledVector(this._swingDp, w);
      _swQ2.identity().slerp(this._swingDq, w);
      root.quaternion.premultiply(_swQ2);
    }
  }

  _pushCharacter() {
    const root = this.character?.root;
    if (root) {
      root.position.copy(this.position).sub(this._drawLag);
      root.rotation.set(0, this.yaw, 0);
      this._swingDraw(root);
      if (this._placeholder) { this._placeholder.visible = false; }
    } else if (this._placeholder) {
      // The placeholder stands in for the drawn body, so it eases with it or the two disagree.
      this._placeholder.position.copy(this.position).sub(this._drawLag);
      this._placeholder.position.y += TUNE.height * 0.5;
      this._placeholder.rotation.set(0, this.yaw, 0);
    }
  }

  _makePlaceholder() {
    const g = new THREE.CapsuleGeometry(TUNE.radius, TUNE.height - TUNE.radius * 2, 6, 8);
    const m = new THREE.MeshStandardMaterial({ color: 0x2a7fd4, roughness: 0.6 });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'movement:placeholder';
    mesh.castShadow = true;
    this.engine.scene.add(mesh);
    this._placeholder = mesh;
  }

  /* ==================================================================== */
  /* public API                                                           */
  /* ==================================================================== */

  /** Screenshot harness depends on this — it must always work, from any state. */
  teleport(vec3, yaw) {
    if (vec3) this.position.set(vec3.x, vec3.y, vec3.z);
    if (typeof yaw === 'number') { this.yaw = yaw; this._prevYaw = yaw; }
    /* §610 — and spend the drawn easing for exactly the same reason the spawn snap is spent below.
       A teleport is somebody saying where Sly IS; easing it would drag the drawn body across the
       level from a position that no longer exists, and `Debug.js`:141 teleports before every
       canonical shot. `_drawP0` moves with him too, or the very next frame reads the teleport
       itself as one enormous unexplained displacement and eases what was just declared exact. */
    this._drawLag.set(0, 0, 0);
    this._drawEaseN = 0;
    this._drawP0.copy(this.position);
    this._drawV0 = 0;
    /* §723A — a teleport is somebody saying where Sly IS; a swing pin held across it would
       rotate the drawn body about a ring that is no longer the story. */
    this._swingW = 0;
    /**
     * Spend the spawn snap. **A teleport is somebody saying exactly where Sly is**, and the
     * pending snap is an answer to a question about a position that no longer exists.
     *
     * `_needSpawnSnap` is armed in the constructor and consumed by `_probeEnvironment` on the
     * first frame collision is live, where it runs `_snapToGroundBelow(8)` — a cast from
     * `y + 8` reaching 38 m down. It was scoped to "the first live frame" and never to "the
     * spawn", so a Controller teleported before its first update had that cast applied to
     * wherever it had been put. Measured on the shipped temple, one fresh Controller per row,
     * `hardReset` to (4.2, y, 4.5) then one `update()`:
     *
     *     y  -2  ->  2.000   +4.000        y  8.95 ->  2.000   -6.950
     *     y   0  ->  2.000   +2.000        y 19.5  ->  2.000  -17.500
     *     y   1  ->  2.000   +1.000        y 31.9  ->  2.000  -29.900
     *     y 2.5  ->  2.000   -0.500        y 32.1  -> 32.093   -0.007  (out of reach)
     *
     * Both signs: the cast starts 8 m ABOVE him and takes the first ground below that, so a
     * position under a deck is lifted onto it just as one above is dropped to it. Grounded,
     * state `idle`, in one frame, deterministically, on the first update of every new instance.
     *
     * The boot path is untouched by construction rather than by luck: `init()` writes
     * `this.position` directly and calls `teleport()` **zero** times (measured), so the snap
     * still fires exactly where it is meant to. At `SPAWN` it moves Sly −0.0000 m, which is
     * what a snap that has nothing to correct should measure.
     *
     * The reach is deliberately NOT narrowed. After this line the only position the snap can
     * ever act on is the spawn, where it measures zero, so bounding it would be tuning a
     * number no measurement can see.
     */
    this._needSpawnSnap = false;
    // A teleport ends whatever airborne episode was in progress; the next one is re-classified
    // from wherever the caller put him, and until then an unattributable fall is soft.
    this._airControlled = true;
    // …and the watchdog re-anchors, or a teleport INTO the air reads as 3 s of not moving.
    this._stuckAt.set(this.position.x, this.position.y, this.position.z);
    this._stuckT = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 99;
    this.airTime = 0;
    this.airJumps = 1;
    this.wallRunUsed = 0;
    // The face Sly last pushed off is metres away now; the shot harness must not arrive with a
    // wall already spent, exactly as it must not arrive holding a stale mark.
    this.freeWall();
    this.attached = null;
    this.balance = 0;
    this.comboIndex = 0;
    this.hangLock = 0;
    this.poleLock = 0;
    this.spireLock = 0;
    this.targets.release('teleport');
    this._assistUsed = false;
    // Marks are positional; the body Sly was circling is metres away now. Frame −1 forces both
    // resolvers to re-run rather than answer from a memo taken before the jump.
    this.lock.frame = -1; this.lock.ok = false; this.lock.body = null;
    this.pick.frame = -1; this.pick.ok = false; this.pick.body = null;
    /* …and a buffered press is positional in exactly the same way. `jumpBufferMs` is 140 ms of
       game time, the shot harness steps frames by hand, and `sm.set('idle')` two lines below is
       immediately followed by a poll in which `Jump.canEnter` would happily take a press the
       player made before the teleport, somewhere else. Optional-called so a stub input (the one
       in `tests/level.test.mjs` and `tests/targets.test.mjs`) without the method is a no-op. */
    this.input?.clearBuffer?.();
    this.height = TUNE.height;
    this.sm.set('fall');
    this.sm.set('idle');
    this.stateName = this.sm.name;
    this._pushCharacter();
  }

  /**
   * Author a traversal magnetism point (Targets.js). The only required field is `point`.
   *
   *   movement.addTarget({
   *     point: new THREE.Vector3(x, y, z),  // where Sly ends up
   *     volume: 3.3,        // trigger sphere radius; default magVolume
   *     catch: 1.008,       // widest ballistic miss this point rescues; default magCatch
   *     magnet: 1.0,        // their magnet_force — multiplies the horizontal pull
   *     jumpMult: 1.0,      // their jump_mult — multiplies a jump taken from the point
   *     group: 'swing',     // 'swing' | 'pole' | 'notch'  (a notch keeps its collider)
   *     arrive: 'hookSwing' // optional state to hand off to on arrival
   *   });
   *
   * Level modules that would rather not hold a reference can emit `registerTarget` with the same
   * spec on the engine bus. FX/HUD can subscribe to 'targetLocked' / 'targetReached' /
   * 'targetReleased' to put §2.1's blue sparkle on them.
   */
  addTarget(spec) { return spec ? this.targets.add(spec) : null; }
  removeTarget(t) { return this.targets.remove(t); }
  clearTargets() { this.targets.clear(); }

  /** Knockback, bounce pads, anything external that wants to move Sly. */
  addImpulse(vec3) {
    if (!vec3) return;
    this.velocity.x += vec3.x;
    this.velocity.y += vec3.y;
    this.velocity.z += vec3.z;
    if (vec3.y > 0.1) { this.grounded = false; this.coyote = 99; this.position.y += 0.02; }
  }

  /** Enemy bounce — GUARDS calls this (or emits 'enemyBounce') when Sly lands on a head. */
  bounce(strength) {
    this._bounceReq = strength || TUNE.jumpV0 * TUNE.bounceUp;
    this.sm.request('bounce');
  }

  hurt(dir, force = 8) {
    if (this.hurtCooldown > 0) return;
    this.hurtCooldown = 0.7;
    _v1.set(dir?.x ?? -this.faceDir.x, 0, dir?.z ?? -this.faceDir.z);
    if (_v1.lengthSq() < 1e-5) _v1.copy(this.faceDir).negate();
    _v1.normalize().multiplyScalar(force);
    this.velocity.set(_v1.x, TUNE.jumpV0 * 0.42, _v1.z);
    this.grounded = false;
    this.coyote = 99;
    this.sm.request('hurt');
  }

  dispose() {
    this._disposed = true;
    this._resetVision();
    // Latched in ANIMATION's state; leaving it set survives our own teardown.
    if (this._lookAt) { this._lookAt = false; try { this.anim?.setLookAt?.(null); } catch { /* animation already gone */ } }
    this.lock.body = null;
    this.pick.body = null;
    this.engine.timeScale = 1;
    this._offBounce?.(); this._offHurt?.(); this._offShot?.();
    this._offTarget?.(); this._offUntarget?.();
    this.targets.clear();
    if (this._placeholder) {
      this._placeholder.geometry.dispose();
      this._placeholder.material.dispose();
      this._placeholder.removeFromParent();
      this._placeholder = null;
    }
  }
}

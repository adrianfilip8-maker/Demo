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

  /* ---- combat ---- */
  comboWindow: 0.34,
  comboTimes:  [0.28, 0.28, 0.40],
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

     ── KNOWN BUG, diagnosed and deliberately NOT fixed in this change ──────────────────────────
     `landImpact` is read in `_probeGround` as `-velocity.y` on the frame Sly first grounds — but
     `move()` runs `_moveVertical` FIRST, and the swept capsule is what actually stops a fall: it
     sets `v.y = 0` before the probe ever looks. The probe only wins the race when the frame before
     touchdown happens to leave Sly inside its 0.06 m snap band. Measured over the sub-frame phase
     of a standard jump arc: **the probe wins 12 times in 40 and the sweep wins 28**, so whether a
     landing registers at all is decided by arithmetic the player cannot see, and on a fast descent
     (>3.6 m/s, i.e. any drop over ~0.27 m) it is decided against. A 14 m drop was measured landing
     in total silence — `land` never entered, no `landed` event for FX or AUDIO, no shake.

     The fix is one line (capture `-v.y` in `_moveVertical` before zeroing it) and it is not landed
     here, because it is not one line in effect: with the measurement corrected, every ordinary
     jump reliably arrives at **10.474 m/s** — measured against the shipped `gravity()` at 60 Hz,
     apex 2.356 m — which is above `landHard` 9.0. So the correct measurement turns *every jump in
     the game* into a hard landing with a 0.19 s control tax and a camera shake. Fixing the number
     therefore forces re-deriving `landHard`, and that is a feel decision that wants a playtest.
     The derivation I would propose, from this moveset's own arcs: `landBeat` = `jumpV0` 11.0
     ("a landing interrupts you when you arrive faster than you can launch yourself" — it clears
     the routine jump and the 9.386 double jump), and `landHard` = 14.5, just over the fastest
     arrival the moveset can reach under its own power (jump + double jump stacked: apex 4.262 m,
     landing 14.304 m/s), i.e. the first landing that was not a move you meant.
     Written up in `progress/records/movement/NOTE-movement-audit.md` for arbitration. ---- */
  landBeat:     3.2,     // enter `land` above this arrival speed. Shipped value, formerly inline.
  landHard:     9.0,     // above this it is `land_hard` + shake + root impulse. Shipped value.
  landSoftTime: 0.09,
  landHardTime: 0.19,

  /* ---- safety ---- */
  voidY:       -220,     // absolute last resort; the level's lowest legal floor is -12
};

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
const _saveP = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _qpos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const _sweepOpt = { skipOneWay: false };
const _nearOpt = { facing: _fwd, maxAngle: TUNE.hookCone };
const TAGS_VENT = ['vent'];
const TAGS_HAZARD = ['hazard'];
const TAGS_VISION = ['hook', 'rail', 'pole', 'spire', 'ledge', 'vent'];

/** My own copy of a sweep result — the module's pooled object may be reused mid-loop. */
const _swRes = { hit: false, position: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0, tag: '', material: 'stone', rec: null };
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
  return { frame: -1, ok: false, point: new THREE.Vector3(), tangent: new THREE.Vector3(0, 1, 0), t: 0, distance: Infinity, rec: null };
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

export class Controller {
  constructor(engine) {
    this.engine = engine;
    this.input = engine.input;

    /* ---- read by CAMERA, HUD and the debug overlay every frame ---- */
    this.position = SPAWN.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = SPAWN_YAW;
    this.stateName = 'idle';
    this.grounded = true;

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
    this.jumpHeld = false;
    this.wallRunUsed = 0;      // wall runs since last ground contact
    this.lastWallRec = null;
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
    this.lastHitNormal = new THREE.Vector3(0, 1, 0);
    this.lastHitTag = '';
    this.hitWall = false;
    this.hitCeiling = false;
    this.landImpact = 0;
    /* The frame `landImpact` was written on. `Land.canEnter` gates on it so a stale impact from
       two seconds ago cannot re-fire the landing beat; it read an undefined field, every
       comparison was `NaN <= 2` = false, and the polled entry to `land` was therefore dead —
       only the explicit `return 'land'` inside `AirState.landed()` ever reached it. Touching down
       out of a wall run, a wall cling or a magnet arrival landed in total silence: no squash, no
       `landed` event, so no FX dust and no footfall from AUDIO. −99 rather than 0 so frame 1 of a
       session cannot look like a landing. */
    this._landFrame = -99;

    /* ---- ledge probe result ---- */
    this.ledge = { ok: false, y: 0, x: 0, z: 0, nx: 0, nz: 1, rec: null };
    /* ---- wall probe result ---- */
    this.wall = { ok: false, nx: 0, nz: 0, ny: 0, dist: 0, rec: null, tag: '' };

    this._aff = { hook: affSlot(), rail: affSlot(), pole: affSlot(), spire: affSlot(), ledge: affSlot() };
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
    this._hurtReq = null;
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
      this._pushCharacter();
      this._pushLocomotion(dt);
      return;
    }

    if (dt > 0) {
      this._thiefVision();
      this._readInput();
      this._preTimers(dt);
      this._probeEnvironment();
      this.targets.update(dt);
      this.sm.update(dt);
      this._postTimers(dt);
      this._hazards(dt);
      this._safetyNet();
    }

    this.stateName = this.sm.name;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
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

    const mx = inp.move.x, my = inp.move.y;
    this.wishRaw.set(mx, 0, my);
    this.wishDir.set(0, 0, 0).addScaledVector(_rgt, mx).addScaledVector(_fwd, my);
    const len = this.wishDir.length();
    this.wishMag = Math.min(1, len);
    if (len > 1e-5) this.wishDir.multiplyScalar(1 / len);
    else this.wishDir.set(0, 0, 0);

    this.jumpHeld = inp.down('jump');
  }

  down(a) { return !!this.input?.down(a); }
  pressed(a) { return !!this.input?.pressed(a); }
  released(a) { return !!this.input?.released(a); }
  /** Peek the jump buffer — safe inside canEnter, which may not lead to a transition. */
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
      this.lastWallRec = null;
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

  _safetyNet() {
    if (this.position.y > TUNE.voidY && Number.isFinite(this.position.y)) return;
    this.engine.warn('movement: fell out of the world; respawning.');
    this.teleport(SPAWN, SPAWN_YAW);
  }

  /* ==================================================================== */
  /* environment probes                                                   */
  /* ==================================================================== */

  _probeEnvironment() {
    if (this._needSpawnSnap && !this.col.fallback) {
      this._needSpawnSnap = false;
      this._snapToGroundBelow(8);
    }
    this._probeGround(this.grounded ? TUNE.groundSnap : 0.06);
  }

  _snapToGroundBelow(searchUp) {
    _v1.copy(this.position); _v1.y += searchUp;
    const g = this.col.groundCheck?.(_v1, this.radius, searchUp + 30);
    if (g?.hit && Number.isFinite(g.y)) this.position.y = g.y;
  }

  /** Authoritative grounding. Sets grounded / groundY / groundNormal / groundTag. */
  _probeGround(snapDown) {
    _v1.copy(this.position); _v1.y += TUNE.probeUp;
    const maxDist = TUNE.probeUp + Math.max(0.04, snapDown);
    const g = this.col.groundCheck?.(_v1, this.radius, maxDist);
    const walkable = this.col.SLOPE?.walkable ?? (50 * DEG);

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
      if (!wasGrounded) this._noteImpact(-this.velocity.y);
      this.position.y = _gndRes.y;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    return canGround;
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
  afford(tag) {
    const cfg = AFFORD[tag];
    const s = this._aff[tag];
    if (!cfg || !s) return null;
    if (s.frame === this._frame) return s.ok ? s : null;
    s.frame = this._frame;
    s.ok = false;
    const col = this.col;
    if (typeof col.nearest !== 'function') return null;
    _qpos.copy(this.position); _qpos.y += cfg.eye;
    let r = null;
    if (cfg.cone > 0) {
      _nearOpt.facing = _fwd.lengthSq() > 0.1 ? _fwd : this.faceDir;
      _nearOpt.maxAngle = cfg.cone;
      r = col.nearest(_qpos, tag, cfg.range, _nearOpt);
      // A cone miss shouldn't hide a hook Sly is flying straight into.
      if (!r) r = col.nearest(_qpos, tag, TUNE.hookAuto);
    } else {
      r = col.nearest(_qpos, tag, cfg.range);
    }
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
  narrowGround() {
    const col = this.col;
    if (typeof col.groundCheck !== 'function' || col.fallback) return false;
    _rgt.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    for (let s = -1; s <= 1; s += 2) {
      _v1.copy(this.position).addScaledVector(_rgt, s * (this.radius + 0.30));
      _v1.y += TUNE.probeUp;
      const g = col.groundCheck(_v1, this.radius * 0.5, TUNE.probeUp + 0.45);
      if (!g?.hit || Math.abs(g.y - this.groundY) > 0.35) return true;
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
      _p3.copy(this.position);
      _p3.y -= TUNE.stepHeight + TUNE.groundSnap;
      const dn = this._sweep(this.position, _p3);
      if (dn.hit) this.position.copy(dn.position);
      else this.position.y -= TUNE.stepHeight;   // walked off an edge: give the lift back
    }
  }

  _moveVertical(dt) {
    const v = this.velocity;
    if (Math.abs(v.y) < 1e-9) return;
    _disp.set(0, v.y * dt, 0);
    _to.copy(this.position).add(_disp);
    const r = this._sweep(this.position, _to);
    if (!r.hit) { this.position.copy(_to); return; }
    this.position.copy(r.position);
    if (r.normal.y > 0.3 && v.y < 0) { this._noteImpact(-v.y); v.y = 0; }
    else if (r.normal.y < -0.3 && v.y > 0) { v.y = 0; this.hitCeiling = true; }
    else { v.y = 0; }
  }

  /**
   * Record how hard Sly just arrived. `landImpact` is the only input to the whole landing branch —
   * `land` / `land_soft` / `land_hard`, the camera shake, the root impulse and the `landed` event
   * that FX and AUDIO subscribe to.
   *
   * **It has to be captured here, not in `_probeGround`.** `move()` runs `_moveVertical` first and
   * `_probeGround` after, and the swept capsule is what actually stops a fall — it sets `v.y = 0`
   * two lines above. `_probeGround` then read `-this.velocity.y` off a velocity that had already
   * been zeroed and recorded **0**. The probe only ever won the race for descents slow enough to
   * finish inside its 0.06 m snap band (under ~3.6 m/s), so `landImpact` could never exceed that,
   * every threshold above it was dead code, and a 14 m drop landed in complete silence — measured
   * headlessly: zero `landed` events, `land` never entered.
   *
   * `max` within a frame rather than last-write-wins, because both call sites can fire on the same
   * frame and the sweep's number is the true one; and the frame stamp is what lets `Land.canEnter`
   * refuse an impact that is already two frames stale.
   */
  _noteImpact(speed) {
    if (!(speed > 0)) return;
    if (this._landFrame === this._frame && this.landImpact >= speed) return;
    this.landImpact = speed;
    this._landFrame = this._frame;
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
      _swRes.tag = r.tag || '';
      _swRes.material = r.material || 'stone';
      _swRes.rec = r.rec || null;
    } else {
      _swRes.hit = false;
      _swRes.position.copy(to);
      _swRes.normal.set(0, 1, 0);
      _swRes.tag = ''; _swRes.rec = null; _swRes.distance = 0;
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

  _pushCharacter() {
    const root = this.character?.root;
    if (root) {
      root.position.copy(this.position);
      root.rotation.set(0, this.yaw, 0);
      if (this._placeholder) { this._placeholder.visible = false; }
    } else if (this._placeholder) {
      this._placeholder.position.copy(this.position);
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
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 99;
    this.airTime = 0;
    this.airJumps = 1;
    this.wallRunUsed = 0;
    this.attached = null;
    this.balance = 0;
    this.comboIndex = 0;
    this.hangLock = 0;
    this.targets.release('teleport');
    this._assistUsed = false;
    // Marks are positional; the body Sly was circling is metres away now. Frame −1 forces both
    // resolvers to re-run rather than answer from a memo taken before the jump.
    this.lock.frame = -1; this.lock.ok = false; this.lock.body = null;
    this.pick.frame = -1; this.pick.ok = false; this.pick.body = null;
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

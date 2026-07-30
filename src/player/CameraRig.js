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
 *
 * Coordinate convention (matches MOVEMENT's yaw, per AGENTS.md §8.1 "facing north = yaw π"):
 *   forward = (sin(yaw), 0, cos(yaw)).  `yaw` is the heading the camera *looks along*, so a camera
 *   sitting behind Sly has `camera.yaw === movement.yaw`. `pitch` is the camera's elevation above
 *   the pivot: positive = above, looking down.
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

  /* ---- follow spring ------------------------------------------------------ */
  followTimeH: 0.16,
  followTimeV: 0.46,            // ~3x softer than horizontal: stairs must not bob the frame
  deadzoneH: 0.10,
  deadzoneV: 0.22,              // a 22 cm step costs the camera nothing
  maxFollowH: 26,
  maxFollowV: 16,
  pivotHeight: 1.42,            // Sly is 1.8 m; this frames chest/head, not feet
  headroom: 0.18,               // look slightly above the pivot so he sits under centre

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
  distHardMin: 0.55,            // absolute floor; below this we're inside Sly
  recoverDelay: 0.22,           // hold before creeping back out (kills corner flicker)
  recoverTime: 0.62,            // slow on purpose
  recoverSpeed: 2.4,            // m/s cap while recovering
  collisionPoll: 0.5,           // seconds between re-checks for a late COLLISION module

  /* ---- auto-yaw assist ---------------------------------------------------- */
  autoDelay: 1.2,               // no mouse for this long before we dare touch yaw
  autoFade: 0.45,               // and then fade the authority in over this
  autoRate: 0.95,               // rad/s ceiling
  autoGain: 1.7,
  autoDeadzone: 4 * DEG,
  autoMinSpeed: 2.0,
  autoAirScale: 0.45,

  /* ---- recentre (R) ------------------------------------------------------- */
  recentreTime: 0.45,

  /* ---- FOV ---------------------------------------------------------------- */
  fovBase: 52,
  fovSpeedGain: 6.0,            // +6° at full run speed
  fovSpeedRef: 8.0,
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
  wall_run:   { dist:  0.60, height:  0.25, lead: 1.30, fov:  1.5, pitch: -1.0 * DEG, side: 0.35, stiff: 0.90, tau: 0.22 },
  /* Hanging: drop under the lip and look up past it — the point is what's *above*. */
  ledge_hang: { dist: -0.70, height:  1.15, lead: 0.20, fov: -1.5, pitch:-13.0 * DEG, side: 0.00, stiff: 1.30, tau: 0.36 },
  climb:      { dist:  0.35, height:  0.75, lead: 0.35, fov: -1.0, pitch: -7.0 * DEG, side: 0.00, stiff: 1.15, tau: 0.34 },
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
    this._lastShakeAt = -1;

    /* ---- wall side probe ---- */
    this._wallSide = 0;
    this._wallProbeT = 0;

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
    this._lastShakeAt = this.engine.time;
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
    this._buildBasis(this.yaw);
    this._pivotGoal(_goal, 1);
    this.pivot.copy(_goal);
    this._pivotVel.set(0, 0, 0);
    this._boomWant = clamp(this.distance + this._frame.dist, TUNE.distHardMin, TUNE.distMax + 3);
    this.boom = this._boomWant;
    this._boomVel = 0;
    this._boomHold = 0;
    this._recovering = false;
    this._shakeAmp = 0; this._shakeDur = 0; this._shakeT = 0;
    this._fovCur = TUNE.fovBase + this._frame.fov;
    this._speedSm = 0;
    this._roll = 0;
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
    this._detectTeleport(dt);
    this._resolveFrame(this._stateName, false);
    this._blendFrame(dt);
    this._orbit(dt, lx, ly, input);
    this._buildBasis(this.yaw);
    this._follow(dt);
    this._boomLength(dt);
    this._focusBlend(dt);
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
      this._autoYaw(dt);
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
   * Auto-yaw assist. Swings the camera behind Sly while he runs — but ONLY after the mouse has
   * been still for `autoDelay`, and then faded in. Overlapping the player's own aim for even a
   * frame is the difference between "helpful" and "the camera is fighting me".
   */
  _autoYaw(dt) {
    if (this.mode === 'aim') return;
    if (this._idleLook < TUNE.autoDelay) return;
    const speed = Math.hypot(_pVel.x, _pVel.z);
    if (speed < TUNE.autoMinSpeed) return;

    const heading = Math.atan2(_pVel.x, _pVel.z);
    const err = wrapPi(heading - this.yaw);
    if (Math.abs(err) < TUNE.autoDeadzone) return;

    const fade = smoothstep(TUNE.autoDelay, TUNE.autoDelay + TUNE.autoFade, this._idleLook);
    const speedScale = clamp(speed / 6.0, 0, 1) * (this._grounded ? 1 : TUNE.autoAirScale);
    const rate = Math.min(Math.abs(err) * TUNE.autoGain, TUNE.autoRate) * fade * speedScale;
    const step = Math.sign(err) * rate * dt;
    this.yaw = wrapPi(this.yaw + (Math.abs(step) > Math.abs(err) ? err : step));
  }

  _buildBasis(yaw) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    this.forward.set(sy, 0, cy);
    this.right.set(cy, 0, -sy);
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
    const ey = _goal.y - p.y;
    const ay = Math.abs(ey);
    const gy = ay > 1e-6 ? p.y + ey * (Math.max(0, ay - TUNE.deadzoneV) / ay) : p.y;

    const stiff = f.stiff;
    p.x = smoothDamp(p.x, gx, v.x, TUNE.followTimeH * stiff, dt, TUNE.maxFollowH); v.x = _sdVel;
    p.z = smoothDamp(p.z, gz, v.z, TUNE.followTimeH * stiff, dt, TUNE.maxFollowH); v.z = _sdVel;
    // Vertical gets its own, much longer time constant. This is the whole reason stairs and
    // hops don't make the frame seasick.
    p.y = smoothDamp(p.y, gy, v.y, TUNE.followTimeV * stiff, dt, TUNE.maxFollowV); v.y = _sdVel;
  }

  /* ------------------------------------------------------------------ boom -- */

  _effectivePitch() {
    const falling = Math.max(0, -_pVel.y);
    const climbing = Math.max(0, _pVel.y);
    let p = this.pitch + this._frame.pitch;
    // Falling fast: tip down so the landing is on screen before you reach it.
    p += smoothstep(2, TUNE.fallPitchSpeed, falling) * TUNE.fallPitch;
    p += smoothstep(1, TUNE.climbSpeed, climbing) * TUNE.climbPitch;
    return clamp(p, TUNE.pitchMin, TUNE.pitchMax);
  }

  _boomLength(dt) {
    const aim = this.mode === 'aim' || !!(this.engine.input?.down?.('focus'));
    let want = this.distance + this._frame.dist + (aim ? -1.1 : 0);
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
   * Sphere-cast the sightline (AGENTS.md §4.6). Three casts: the boom itself plus a whisker
   * either side. The whiskers are the trick — they notice an approaching column a fifth of a
   * second before it crosses the sightline, so the boom shortens continuously instead of
   * stepping, which is what stops the push-in reading as a glitch.
   */
  _castBoom(want, dir) {
    const col = this._solidCollision();
    if (!col) return want;
    let allowed = want;
    for (let i = 0; i < 3; i++) {
      _from.copy(this.pivot);
      if (i === 1) _from.addScaledVector(this.right, TUNE.whisker);
      else if (i === 2) _from.addScaledVector(this.right, -TUNE.whisker);
      _to.copy(_from).addScaledVector(dir, want);
      const d = this._sweep(_from, _to, want);
      if (d < allowed) allowed = d;
    }

    /* Belt and braces: if the resulting point is still inside something (a cast can miss a
       corner it starts flush against), step in until it isn't. */
    if (typeof col.overlap === 'function') {
      for (let i = 0; i < 3; i++) {
        _camPos.copy(this.pivot).addScaledVector(dir, allowed);
        let hits = null;
        try { hits = col.overlap(_camPos, TUNE.camRadius * 0.85, SOLID_TAGS); }
        catch (err) { this._breakCollision(err); break; }
        if (!hits || hits.length === 0) break;
        allowed = Math.max(TUNE.distHardMin, allowed - 0.45);
        if (allowed <= TUNE.distHardMin) break;
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

    /* FOV: a modest speed stretch. Enough to feel velocity, not enough to notice as a zoom. */
    const speed = Math.hypot(_pVel.x, _pVel.z);
    this._speedSm = ease(this._speedSm, speed, 0.22, dt);
    const fovTarget = TUNE.fovBase + this._frame.fov
      + clamp(this._speedSm / TUNE.fovSpeedRef, 0, 1) * TUNE.fovSpeedGain;
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

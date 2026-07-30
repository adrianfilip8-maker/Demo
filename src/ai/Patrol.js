import * as THREE from 'three';
import { rng } from '../core/Rand.js';

/**
 * Patrol.js — routes, vision and the suspicion model.
 *
 * Two ideas drive everything in this file.
 *
 * **Routes are splines, not waypoint lists.** A guard walking straight-line segments and
 * pivoting on the spot at every corner reads as a chess piece. A Catmull-Rom through the
 * same waypoints gives him a continuous heading, which lets the walk cycle's hip roll and
 * the tail's overshoot actually do their job. Waypoints carry a dwell and an action, so the
 * guard stops, looks around, and gives the player a window — the loop the whole stealth
 * game is played inside.
 *
 * **Detection is a meter, never a switch.** Instant detection is the single fastest way to
 * make a stealth game feel unfair: the player has no frame in which to react, so failure
 * feels arbitrary. Here the meter fills faster when you are close, moving, lit and centred
 * in the cone, and drains slowly after a grace period. The cone changes colour as it fills,
 * so the meter is legible in-world without a HUD element.
 *
 * All coordinates are §8.1 level space: +X east, +Y up, +Z south. Courtyard floor y = 0.
 */

/* ============================== TUNE ====================================== */

/** Per-type senses. Ranges in metres, angles in radians. */
export const VISION = {
  temple: {
    range: 17.0,
    halfAngle: 0.60,        // ~34° — the bright core of the cone
    peripheral: 1.08,       // ~62° — he can *notice* out here, but slowly
    eyeHeight: 1.66,
    hearRadius: 9.0,
    coneLength: 15.0,       // rendered length; the sensed range is a touch longer
  },
  heavy: {
    range: 14.0,
    halfAngle: 0.52,        // ~30°, and a helmet makes it worse
    peripheral: 0.92,
    eyeHeight: 1.92,
    hearRadius: 7.0,
    coneLength: 12.5,
  },
  scarab: {
    range: 9.0,
    halfAngle: 1.10,        // ~63°: compound eyes, wide but short-sighted
    peripheral: 1.45,
    eyeHeight: 0.26,
    hearRadius: 6.0,
    coneLength: 8.0,
  },
};

/**
 * The detection model. Every number here is a *feel* number — the critic loop should be
 * able to retune the whole stealth game from this block without reading a line of logic.
 *
 * Sanity check on the tuning: standing in the bright core at 6 m, walking, in moonlight,
 * fills the meter in roughly 1.4 s — long enough to break line of sight, short enough that
 * standing in front of a guard is never safe. Sneaking triples that.
 */
export const DETECT = {
  fillBase: 0.92,          // meter units per second at the reference condition
  nearBoost: 2.05,         // multiplier at point blank, falling to 1.0 at max range
  farFloor: 0.22,          // multiplier at the very edge of the cone
  peripheralGain: 0.28,    // outside the core but inside peripheral vision
  coreSoftness: 0.22,      // radians of soft edge between core and periphery

  moveStill: 0.50,         // player standing still
  moveWalk: 1.00,
  moveRun: 1.65,
  sneakGain: 0.40,         // shift held
  crouchGain: 0.55,
  airborneGain: 1.20,      // jumping over a guard's head is a bad idea

  darkGain: 0.68,          // moonlit
  litGain: 1.28,           // daylight or standing in another cone
  hearGain: 0.42,          // heard-not-seen: fills toward `searching`, never to `chase`
  hearCap: 0.66,

  drain: 0.34,             // meter units per second once the grace period expires
  drainDelay: 0.85,

  /* thresholds */
  suspicious: 0.34,
  searching: 0.72,
  chase: 1.00,
  ceiling: 1.45,           // overfill headroom: he stays sure for a moment after losing you

  /* timings */
  reactDelay: 0.35,        // he is slow. This is the window the player is meant to exploit.
  loseSight: 2.60,         // seconds without line of sight before chase gives up
  searchTime: 9.0,
  lostLook: 3.6,
  stunTime: 3.2,
  koTime: 12.0,
  attackRange: 2.6,
  attackCooldown: 1.6,
  pickpocketSuspicion: 0.22,   // he half-notices, which is funnier than not noticing

  /* speeds, m/s */
  patrolSpeed: 1.55,
  alertSpeed: 2.35,
  chaseSpeed: 4.60,
  heavyScale: 0.74,        // the Heavy is slower at everything
  scarabScale: 1.25,       // the scarab is faster and jitterier
  turnRate: 3.2,           // rad/s while patrolling
  turnRateAlert: 6.0,
};

/** Alert state machine (AGENTS.md §7 stealth loop). */
export const STATE = {
  PATROL: 'patrol',
  SUSPICIOUS: 'suspicious',
  SEARCHING: 'searching',
  CHASE: 'chase',
  LOST: 'lost',
  STUNNED: 'stunned',
  KO: 'ko',
};

/* ============================== routes ==================================== */

/**
 * Waypoints are `[x, z]` or `[x, z, dwell, action]`, in §8.1 coordinates. `y` is resolved at
 * runtime by a ground probe; `baseY` is the authored fallback for spaces the collision mesh
 * may not cover yet (the rooftop deck and the tomb, mostly).
 *
 * action: 'look' (sweep the head), 'bored' (yawn / scratch / lean), null (just pause).
 */
export const ROUTES = {
  /* The south gate of the Great Courtyard — the stretch of pavement the `guard` canonical
     shot looks at. Deliberately the first route in the table so guard #0 walks it. */
  south_gate: {
    closed: true, baseY: 0, space: 'courtyard',
    points: [
      [-1.0, 0.0, 2.6, 'look'],
      [7.0, -4.5, 1.2, null],
      [12.0, 1.5, 2.2, 'look'],
      [6.5, 7.5, 1.0, null],
      [-4.0, 6.0, 2.0, 'bored'],
      [-9.5, 0.5, 1.4, 'look'],
      [-5.5, -5.0, 1.0, null],
    ],
  },

  /* The big courtyard perimeter: past the colossi, down the west colonnade, across the
     front of the hall and back up the east side. The long walk the player times. */
  courtyard_ring: {
    closed: true, baseY: 0, space: 'courtyard',
    points: [
      [-17.0, 28.0, 2.0, 'look'],
      [-17.5, 14.0, 0, null],
      [-17.0, 3.0, 1.6, null],
      [-9.0, -8.0, 2.4, 'look'],
      [4.0, -10.5, 1.2, null],
      [16.0, -3.0, 1.8, null],
      [17.5, 12.0, 0, null],
      [17.0, 26.0, 2.6, 'bored'],
      [6.0, 30.5, 1.2, 'look'],
      [-6.0, 30.5, 1.4, null],
    ],
  },

  /* A tight ring around the obelisk. Whoever walks this is the reason you can't just climb
     the pole from the south side. */
  obelisk_watch: {
    closed: true, baseY: 0, space: 'courtyard',
    points: [
      [0.0, 4.0, 1.8, 'look'],
      [6.0, 11.0, 1.2, null],
      [0.0, 18.0, 1.8, 'look'],
      [-6.0, 11.0, 1.2, null],
    ],
  },

  /* Sphinx avenue, up the middle between the two rows. Open route: he about-faces at each
     end, which is a much stronger read than a loop out here in the open. */
  sphinx_avenue: {
    closed: false, baseY: null, space: 'approach',
    points: [
      [0.0, 43.0, 2.4, 'look'],
      [0.0, 55.0, 0, null],
      [0.0, 66.0, 1.4, null],
      [0.0, 77.0, 2.8, 'look'],
    ],
  },

  /* Weaving the aisles of the hypostyle hall. The columns break line of sight constantly,
     which is exactly what makes this room playable. */
  hall_weave: {
    closed: true, baseY: 0, space: 'hall',
    points: [
      [-16.0, -20.0, 1.6, 'look'],
      [-16.5, -34.0, 0, null],
      [-16.0, -46.0, 1.8, null],
      [-4.0, -50.0, 2.2, 'look'],
      [10.0, -47.0, 1.2, null],
      [16.0, -38.0, 0, null],
      [16.0, -22.0, 2.0, 'bored'],
      [2.0, -17.5, 1.4, 'look'],
    ],
  },

  /* The rooftop run. Waypoints stay 7 m inside the deck edge — the walk must never put a
     foot over the parapet, and the ground probe below refuses to step off anyway. */
  rooftop_run: {
    closed: true, baseY: 17.0, space: 'roof',
    points: [
      [-16.0, -22.0, 2.2, 'look'],
      [16.0, -22.0, 1.6, null],
      [16.0, -45.0, 2.4, 'look'],
      [-16.0, -45.0, 1.6, null],
    ],
  },

  /* Tomb vault, circling the sarcophagus. Torch-lit, so the cone reads warm against cold. */
  tomb_vault: {
    closed: true, baseY: -12.0, space: 'tomb',
    points: [
      [-9.0, -60.0, 2.0, 'look'],
      [9.0, -60.5, 1.4, null],
      [9.5, -74.0, 2.2, 'bored'],
      [-9.5, -74.0, 1.4, 'look'],
    ],
  },

  /* Scarab on the courtyard architrave, 9 m up. Makes the ledge tiptoe circuit a decision. */
  architrave_ledge: {
    closed: false, baseY: 9.0, space: 'ledge',
    points: [
      [22.6, -8.0, 1.2, 'look'],
      [22.6, 8.0, 0, null],
      [22.6, 26.0, 1.6, 'look'],
    ],
  },

  /* Scarab skittering around the sarcophagus. */
  tomb_scarab: {
    closed: true, baseY: -12.0, space: 'tomb',
    points: [
      [-5.0, -65.0, 0.8, null],
      [5.0, -65.0, 1.0, 'look'],
      [5.5, -71.0, 0.8, null],
      [-5.5, -71.0, 1.0, 'look'],
    ],
  },
};

/** Which guard walks which route. 11 bodies: 6 temple, 3 heavy, 2 scarab. */
export const ROSTER = [
  { type: 'temple', route: 'south_gate', u: 0.00, speed: 1.00 },
  { type: 'temple', route: 'courtyard_ring', u: 0.00, speed: 1.05 },
  { type: 'heavy', route: 'courtyard_ring', u: 0.52, speed: 0.92 },
  { type: 'temple', route: 'obelisk_watch', u: 0.30, speed: 0.94 },
  { type: 'temple', route: 'sphinx_avenue', u: 0.10, speed: 1.08 },
  { type: 'temple', route: 'hall_weave', u: 0.00, speed: 1.00 },
  { type: 'heavy', route: 'hall_weave', u: 0.48, speed: 0.88 },
  { type: 'temple', route: 'rooftop_run', u: 0.15, speed: 1.12 },
  { type: 'heavy', route: 'tomb_vault', u: 0.20, speed: 0.90 },
  { type: 'scarab', route: 'architrave_ledge', u: 0.00, speed: 1.00 },
  { type: 'scarab', route: 'tomb_scarab', u: 0.35, speed: 1.10 },
];

/* ========================================================================== */
/*  Route                                                                      */
/* ========================================================================== */

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();

export class Route {
  /**
   * @param {string} name
   * @param {object} def   entry from ROUTES
   * @param {number} seed  per-route jitter so two routes never share a rhythm
   */
  constructor(name, def, seed = 1) {
    this.name = name;
    this.closed = !!def.closed;
    this.baseY = def.baseY;
    this.space = def.space || 'courtyard';

    const r = rng(seed);
    const pts = def.points.map(([x, z]) => new THREE.Vector3(
      x + r.jitter(0.22), def.baseY ?? 0, z + r.jitter(0.22)));

    // An open route is walked out and back; mirroring the control points into a closed loop
    // would round off the turn-around, and the about-face is the read we want.
    this.curve = new THREE.CatmullRomCurve3(pts, this.closed, 'catmullrom', 0.4);
    this.length = Math.max(1e-3, this.curve.getLength());

    /* Dwell stops, in normalised arc length. Placed by nearest-sample rather than by control
       index, because Catmull-Rom arc length is not uniform between control points. */
    this.stops = [];
    const N = 240;
    for (let i = 0; i < def.points.length; i++) {
      const dwell = def.points[i][2] ?? 0;
      if (dwell <= 0) continue;
      const target = pts[i];
      let bestU = 0, bestD = Infinity;
      for (let k = 0; k <= N; k++) {
        const u = k / N;
        this.curve.getPointAt(u, _p0);
        const d = _p0.distanceToSquared(target);
        if (d < bestD) { bestD = d; bestU = u; }
      }
      this.stops.push({ u: bestU, dwell: dwell * r.range(0.85, 1.2), action: def.points[i][3] || null });
    }
    this.stops.sort((a, b) => a.u - b.u);
  }

  /** Position at normalised arc length. Writes into `out`; allocates nothing. */
  at(u, out) {
    let t = u;
    if (this.closed) t = ((t % 1) + 1) % 1;
    else t = THREE.MathUtils.clamp(t, 0, 1);
    return this.curve.getPointAt(t, out);
  }

  /** Unit tangent at u, in the direction of travel `dir` (+1 forward, −1 back). */
  tangent(u, dir, out) {
    const d = 0.004;
    const a = this.closed ? u - d : Math.max(0, u - d);
    const b = this.closed ? u + d : Math.min(1, u + d);
    this.at(a, _p0);
    this.at(b, _p1);
    out.subVectors(_p1, _p0);
    out.y = 0;
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
    out.normalize();
    if (dir < 0) out.negate();
    return out;
  }

  /** Advance `u` by `metres`, honouring loop/ping-pong. Returns {u, dir}. */
  advance(u, dir, metres, out) {
    let nu = u + (dir * metres) / this.length;
    let nd = dir;
    if (this.closed) nu = ((nu % 1) + 1) % 1;
    else if (nu > 1) { nu = 2 - nu; nd = -1; }
    else if (nu < 0) { nu = -nu; nd = 1; }
    out.u = nu; out.dir = nd;
    return out;
  }

  /** The next dwell stop strictly ahead of `u` in travel direction `dir`. */
  nextStop(u, dir) {
    if (!this.stops.length) return null;
    let best = null, bestGap = Infinity;
    for (const s of this.stops) {
      let gap = dir > 0 ? s.u - u : u - s.u;
      if (this.closed) gap = ((gap % 1) + 1) % 1;
      if (gap <= 1e-4) continue;
      if (gap < bestGap) { bestGap = gap; best = s; }
    }
    return best;
  }
}

/** Build every route once. Deterministic from `seed` (AGENTS.md §1). */
export function buildRoutes(seed = 1) {
  const out = {};
  let i = 0;
  for (const name in ROUTES) out[name] = new Route(name, ROUTES[name], seed + (i++) * 7919);
  return out;
}

/* ========================================================================== */
/*  Vision + suspicion                                                         */
/* ========================================================================== */

const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _flat = new THREE.Vector3();

/**
 * One guard's senses. Owns the suspicion meter, the last-known-position memory and the
 * smoothed cone length used by the in-world cone (see Guard.js `_updateCones`).
 */
export class Senses {
  constructor(type, seed = 1) {
    this.cfg = VISION[type] || VISION.temple;
    this.suspicion = 0;
    this.gain = 0;             // this frame's fill rate — drives the cone's brightness
    this.sawThisFrame = false;
    this.heardThisFrame = false;
    this.timeSinceSeen = 999;
    this.lastSeen = new THREE.Vector3();
    this.lastSeenValid = false;
    this.blockedLength = this.cfg.coneLength;   // smoothed LOS distance straight ahead
    this._noGain = 99;
    this._r = rng(seed * 2654435761 >>> 0);
    // Every guard's cone flickers on its own phase, otherwise a courtyard of guards pulses
    // in unison and the effect reads as a shader, not as torchlight.
    this.phase = this._r() * Math.PI * 2;
  }

  reset() {
    this.suspicion = 0;
    this.gain = 0;
    this.timeSinceSeen = 999;
    this.lastSeenValid = false;
  }

  /**
   * @param {object} p
   *   eye        THREE.Vector3 world eye position
   *   forward    THREE.Vector3 unit facing (horizontal)
   *   target     THREE.Vector3 player position (feet)
   *   targetTop  number  metres above `target` to aim the line-of-sight ray
   *   collision  the COLLISION module, or null
   *   moving     0..1 normalised player speed
   *   sneaking / crouching / airborne  booleans
   *   light      0..1 how lit the player is
   *   alerted    boolean — an alerted guard's cone is narrower but fills faster
   *   dt
   * @returns {number} this frame's fill rate (0 = saw nothing)
   */
  evaluate(p) {
    const cfg = this.cfg;
    this.sawThisFrame = false;
    this.heardThisFrame = false;
    this.gain = 0;

    _to.subVectors(p.target, p.eye);
    _to.y += p.targetTop ?? 0.95;
    const dist = _to.length();

    /* --- hearing: no cone, no line of sight, just noise. Caps below `chase`. --- */
    if (p.moving > 0.55 && !p.sneaking && dist < cfg.hearRadius) {
      this.heardThisFrame = true;
      if (this.suspicion < DETECT.hearCap) {
        this.gain = Math.max(this.gain, DETECT.hearGain * (1 - dist / cfg.hearRadius));
      }
    }

    if (dist > cfg.range || dist < 1e-4) return this._settle(p.dt);

    _flat.copy(_to).setY(0);
    if (_flat.lengthSq() < 1e-6) _flat.copy(p.forward);
    _flat.normalize();
    _fwd.copy(p.forward).setY(0).normalize();
    const cos = THREE.MathUtils.clamp(_fwd.dot(_flat), -1, 1);
    const angle = Math.acos(cos);

    const core = p.alerted ? cfg.halfAngle * 0.86 : cfg.halfAngle;
    if (angle > cfg.peripheral) return this._settle(p.dt);

    // Soft edge between the bright core and peripheral vision. A hard cutoff makes the
    // player feel cheated when they clip the boundary.
    const coreW = 1 - THREE.MathUtils.smoothstep(angle, core - DETECT.coreSoftness, core + DETECT.coreSoftness);
    const periW = 1 - THREE.MathUtils.smoothstep(angle, core, cfg.peripheral);
    const angleGain = coreW + (1 - coreW) * periW * DETECT.peripheralGain;
    if (angleGain < 0.02) return this._settle(p.dt);

    /* --- line of sight (§4.6). This is the raycast that makes pillars matter. --- */
    if (p.collision?.raycast) {
      const hit = p.collision.raycast(p.eye, _to, dist, RAY_OPTS);
      // 0.45 m of slack: a ray that clips the ledge the player is standing on is not a wall.
      if (hit?.hit && hit.distance < dist - 0.45) return this._settle(p.dt);
    }

    const near = THREE.MathUtils.lerp(DETECT.nearBoost, DETECT.farFloor, dist / cfg.range);

    let move = DETECT.moveStill;
    if (p.moving > 0.06) move = THREE.MathUtils.lerp(DETECT.moveWalk, DETECT.moveRun,
      THREE.MathUtils.clamp((p.moving - 0.35) / 0.65, 0, 1));
    if (p.airborne) move = Math.max(move, DETECT.airborneGain);

    let stealth = 1;
    if (p.sneaking) stealth = DETECT.sneakGain;
    else if (p.crouching) stealth = DETECT.crouchGain;

    const light = THREE.MathUtils.lerp(DETECT.darkGain, DETECT.litGain, THREE.MathUtils.clamp(p.light ?? 0.3, 0, 1));

    this.sawThisFrame = true;
    this.lastSeen.copy(p.target);
    this.lastSeenValid = true;
    this.timeSinceSeen = 0;
    this.gain = Math.max(this.gain, DETECT.fillBase * near * angleGain * move * stealth * light);
    return this._settle(p.dt);
  }

  _settle(dt) {
    if (this.gain > 0) {
      this._noGain = 0;
      this.suspicion = Math.min(DETECT.ceiling, this.suspicion + this.gain * dt);
    } else {
      this._noGain += dt;
      if (this._noGain > DETECT.drainDelay) {
        this.suspicion = Math.max(0, this.suspicion - DETECT.drain * dt);
      }
    }
    if (!this.sawThisFrame) this.timeSinceSeen += dt;
    return this.gain;
  }

  /**
   * How far the cone can throw before it hits geometry, smoothed. The cone is drawn as a
   * volume with depth test on, so a wall already clips it in screen space — but a cone that
   * visually shoots *through* a pylon and re-appears beyond it looks wrong, so the length is
   * clipped to the first thing straight ahead. One ray per guard per frame.
   */
  updateReach(collision, eye, forward, dt) {
    const cfg = this.cfg;
    let target = cfg.coneLength;
    if (collision?.raycast) {
      const hit = collision.raycast(eye, forward, cfg.coneLength + 0.5, RAY_OPTS);
      if (hit?.hit) target = Math.max(1.6, hit.distance - 0.12);
    }
    // Smoothed, or the cone snaps a metre every time the guard's head turns past an edge.
    const k = Math.min(1, dt * 7.5);
    this.blockedLength += (target - this.blockedLength) * k;
    return this.blockedLength;
  }
}

/** Line-of-sight rays ignore the things a guard can see through or over. */
const RAY_OPTS = { ignoreTags: ['hazard', 'water', 'rail', 'hook', 'spire', 'vent'] };

/* ========================================================================== */
/*  Helpers shared with Guard.js                                               */
/* ========================================================================== */

/** Threshold → state, before any hysteresis or timers are applied. */
export function stateForSuspicion(s) {
  if (s >= DETECT.chase) return STATE.CHASE;
  if (s >= DETECT.searching) return STATE.SEARCHING;
  if (s >= DETECT.suspicious) return STATE.SUSPICIOUS;
  return STATE.PATROL;
}

/** Base movement speed for a state and type, m/s. */
export function speedFor(state, type) {
  let s;
  switch (state) {
    case STATE.CHASE: s = DETECT.chaseSpeed; break;
    case STATE.SEARCHING: s = DETECT.alertSpeed; break;
    case STATE.SUSPICIOUS: s = 0; break;
    case STATE.LOST: s = DETECT.alertSpeed * 0.8; break;
    case STATE.STUNNED: case STATE.KO: s = 0; break;
    default: s = DETECT.patrolSpeed;
  }
  if (type === 'heavy') s *= DETECT.heavyScale;
  else if (type === 'scarab') s *= DETECT.scarabScale;
  return s;
}

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
 * in the cone, and drains slowly after a grace period.
 *
 * **A meter the player cannot read is a switch with extra steps.** The whole point of a
 * gradient is that the player acts on it, and to act on it he has to see which of the four
 * bands the guard is in — not a continuous orange. Three things carry that read, and all three
 * are pinned to the same thresholds the state machine uses, so they cannot drift apart from it:
 *
 *   - the cone's **colour**, a three-stop ramp (`coneColourStop`): cream while he has noticed
 *     nothing, amber the instant he turns suspicious and held amber through the whole search,
 *     red only once he commits to the chase;
 *   - **hysteresis** on every band, so a meter resting on a threshold cannot flicker the state
 *     — and with it the colour, the animation and the `guardAlert` event — every frame;
 *   - the guard **walking over to look** when he turns suspicious, after a beat of standing
 *     still, so the read survives the player being behind a pillar where no cone is visible.
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
 * ── What the tuning actually does, measured ───────────────────────────────────────────────
 * This block used to carry the line "standing in the bright core at 6 m, walking, in moonlight,
 * fills the meter in roughly 1.4 s". **That number had never been measured, and it is wrong.**
 * `tests/patrol.test.mjs` runs the model and prints the table; at the same reference condition
 * — 6 m, dead centre, moonlit — it reads:
 *
 *     running   0.53 s      standing still  1.80 s
 *     walking   0.88 s      far (15 m)      2.88 s
 *     crouching 1.62 s      daylight        0.60 s
 *     sneaking  2.25 s      edge of cone    1.23 s
 *
 * plus `reactDelay` before he actually moves: 1.23 s from unaware to chasing while walking in
 * the open. Sneaking buys 2.6× (not the "triples" the old line claimed), crouching 1.8×, and
 * a full meter drains back to zero 5.1 s after the player breaks line of sight.
 *
 * Nothing here was retuned to produce that table — it is what the shipped numbers have always
 * done, and the comment is now what they do rather than what someone hoped they did. If these
 * are the wrong feel, change the numbers and the test will print the new table.
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
  /**
   * Hysteresis on every band. Without it `stateForSuspicion` is a bare comparison, and a meter
   * resting on a threshold — which is exactly what happens when the player stands at the edge
   * of the cone, or behind a column edge the LOS ray clips in and out of — flips the state on
   * alternate frames. Each flip re-emits `guardAlert` and restarts the reaction animation, so
   * the guard twitches in place and the read the player is supposed to be learning is noise.
   * He must fall this far below a band to leave it; going up still takes the full threshold.
   */
  hysteresis: 0.06,

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

  /* --- suspicious: the beat that makes the ladder readable ---
     A guard who notices something and does not move has told the player nothing he can act
     on: the cone changes colour and that is all, and from behind a pillar the player cannot
     see the cone. So he plants for `peerTime` — the pause is the tell — then walks over at
     `peerSpeed`, slower than his own patrol, and stops `peerStandoff` short. That approach is
     what turns "I might have been seen" into "I have to move now", and it is also the thing
     that lets the player bait a guard off his beat, which is half of Sly's toolkit. */
  peerTime: 0.60,
  peerSpeed: 1.15,
  peerStandoff: 2.20,

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
 *
 * ── Every waypoint here is measured against the shipped temple ─────────────────────────────
 *
 * The first version of this table was typed from the §8.1 coordinate summary and never
 * checked against `EgyptLevel.js`. `tests/patrol.test.mjs` checks it now — it builds the real
 * level, harvests every collision proxy, and walks each spline through it. On the first run
 * **6 of these 9 routes were physically impossible and 8 of the 11 guards could not complete
 * a lap**: `hall_weave` ran its north-south legs straight down the line of the aisle columns,
 * `tomb_vault` and `tomb_scarab` cut through the crypt pillars, `rooftop_run` straddled the
 * clerestory wall between two roof levels 3.5 m apart, `south_gate` climbed a 2 m terrace and
 * clipped a propylon pier, and `sphinx_avenue` walked on nothing at all.
 *
 * So the numbers below are not decorative. Three rules they now obey, and the reason for each:
 *
 *   1. **Corridors, not diagonals.** The temple is a colonnade building: everything walkable
 *      is a straight band between two rows of stone. A waypoint pair that cuts a corner
 *      diagonally will cross a column line somewhere, and Catmull-Rom rounding puts it there
 *      even when the straight segment would have missed.
 *   2. **Turn on the clear rows.** The hall's column rows sit at z = −22, −30, −38, −46 and
 *      the crypt's pillar rows at z = −62, −68, −74. Cross-legs are authored on the rows
 *      *between* them and nowhere else.
 *   3. **Clearance is measured for the widest body on the route.** The Heavy is 0.56 m in
 *      radius and `Guard._step` stops him with forward rays at exactly that distance, so a
 *      centre-line that clears a column by 0.4 m pins him against it for the rest of the run.
 *      The test demands `radius + 0.20 m`.
 */
export const ROUTES = {
  /* The south forecourt, between the hall front and the terrace — the stretch of pavement the
     `guard` canonical shot looks at. Deliberately the first route in the table so guard #0
     walks it. Stays south of z = −1.5: the four propylon piers stand at x ±(11.2‥13.8) and
     ±(19.7‥22.3) across z −0.5‥2.5, and the old route walked straight into the east one. */
  south_gate: {
    closed: true, baseY: 0, space: 'courtyard',
    points: [
      [0.0, -13.0, 2.6, 'look'],
      [9.0, -12.0, 1.0, null],
      [16.5, -7.5, 2.2, 'look'],
      [16.0, -3.0, 1.2, null],
      [6.0, -3.5, 1.4, null],
      [-6.0, -3.5, 2.0, 'bored'],
      [-16.0, -3.0, 1.2, null],
      [-16.5, -7.5, 2.2, 'look'],
      [-9.0, -12.0, 1.0, null],
    ],
  },

  /* The big courtyard perimeter: down the west colonnade, across the front of the hall, up the
     east side and back along the pylon face. The long walk the player times.

     The east leg is the awkward one and it is deliberately kinked. At z ≈ 1 it must thread the
     6 m gap between two propylon piers, so it runs at x = 16.8; north of z = 20 the ramp
     landing occupies x 12.2‥19.0 at y = 1.47, a 1.5 m step the guard's `stepUp` refuses, so it
     swings out to x = 20.0 between that landing and the peristyle columns at x = 22. */
  courtyard_ring: {
    closed: true, baseY: 0, space: 'courtyard',
    points: [
      [-18.0, 28.5, 2.2, 'look'],
      [-18.0, 16.0, 0, null],
      [-18.0, 1.0, 1.6, null],
      [-18.0, -10.0, 2.4, 'look'],
      [-6.0, -13.0, 1.0, null],
      [6.0, -13.0, 1.0, null],
      [16.8, -10.0, 1.8, null],
      [16.8, 1.0, 0, null],
      [20.0, 15.0, 1.6, null],
      [20.0, 27.5, 2.6, 'bored'],
      [8.0, 29.8, 1.4, 'look'],
      [-8.0, 29.8, 0, null],
    ],
  },

  /* The obelisk terrace, one storey up. Whoever walks this is the reason you cannot simply
     climb the pole from the south side.

     Open, not closed, and that is forced by the architecture rather than chosen: terrace stage
     1 (y = 2.0) is an annulus around stage 2, and its north side is cut in half by the upper
     stair at |x| ≤ 2.6. There is no closed loop up here. A sentry pacing a U past the obelisk
     and turning at each end of the north band is a stronger read anyway — the about-face is
     the beat the player counts. */
  obelisk_watch: {
    closed: false, baseY: 2.0, space: 'terrace',
    points: [
      [5.5, 18.0, 2.0, 'look'],
      [7.6, 12.0, 0, null],
      [7.6, 6.2, 1.2, null],
      [0.0, 4.4, 1.8, 'look'],
      [-7.6, 6.2, 1.2, null],
      [-7.6, 12.0, 0, null],
      [-5.5, 18.0, 2.0, 'look'],
    ],
  },

  /* The entry pylon gateway — the level's front door, and the first thing the player must get
     past from spawn. Open: he about-faces under the lintel at each end.

     This replaces `sphinx_avenue`, which patrolled z 43‥77 out on the approach. That is
     outside the collision mesh entirely (the courtyard ground ends at z = 34), so its guard
     was walking on the authored fallback height over sloping sand, and it is also 10‥45 m
     behind the player's spawn, guarding nothing he has to cross. */
  pylon_gate: {
    closed: false, baseY: 0, space: 'courtyard',
    points: [
      [-6.2, 31.2, 2.2, 'look'],
      [0.0, 32.4, 1.2, null],
      [6.2, 31.2, 2.2, 'look'],
    ],
  },

  /* The hypostyle hall, as a rectangle in the two inner aisles. The columns break line of
     sight constantly, which is exactly what makes this room playable.

     x = ±12.5 is the centre of the corridor between the nave columns (outer face x = ±9.6)
     and the aisle columns (inner face x = ±15.1) — 2.6 m of clearance on the tighter side, so
     the Heavy walks it without ever touching stone. The north cross-leg sits on z ≈ −43, the
     middle of the 4.8 m window between the column rows at z = −38 and z = −46.

     Open, not closed, and that is measured rather than chosen. A closed rectangle needs a
     *south* cross-leg too, and there is nowhere to put one: the only gap between the hall front
     wall (z = −18.1) and the first nave column row (z = −20.4) is 2.3 m wide, and a 0.56 m
     Heavy on a Catmull-Rom that bulges 0.7 m at the corners does not fit through it — measured
     at 0.34 m of clearance, against the 0.76 m he needs. Ping-ponging the U instead puts a
     full about-face at each end of the aisle, which is a better read than a corner anyway. */
  hall_weave: {
    closed: false, baseY: 0, space: 'hall',
    points: [
      [-12.5, -20.0, 2.0, 'look'],
      [-12.5, -31.0, 0, null],
      [-12.5, -42.5, 1.6, null],
      [0.0, -43.5, 1.4, 'bored'],
      [12.5, -42.5, 1.6, null],
      [12.5, -31.0, 0, null],
      [12.5, -20.0, 2.0, 'look'],
    ],
  },

  /* Straight up the nave and back, ending under the inner pylon gate.

     Two guards on the *same* loop at different phase is the weakest way to spend a second
     body: it doubles the pressure on one line and leaves everything else untouched. The first
     coverage run measured exactly that — with both hall guards on `hall_weave`, the nave (the
     main route through the largest room in the level) and the inner gate (the only way to the
     tomb) were watched **0 % of a 240 s window**. A player could walk the length of the
     temple's spine without ever entering a cone. This route is the second body's own beat, and
     it crosses the ring's at right angles, which is what makes the hall a timing puzzle rather
     than a corridor with two men in it. */
  hall_nave: {
    closed: false, baseY: 0, space: 'hall',
    points: [
      [0.0, -19.5, 1.8, 'look'],
      [0.0, -31.0, 1.2, null],
      [0.0, -42.5, 2.0, 'look'],
      [0.0, -48.5, 2.4, 'look'],
    ],
  },

  /* The rooftop run, on the nave deck. The deck is y = 17.0 and only 22.8 m wide (x ±11.4,
     rails on both edges); the aisle roofs either side are y = 13.5, and between them stands
     the clerestory wall. The old route at x = ±16 had one foot on each — six 3.1 m steps per
     lap, every one of them past `stepDown`, so the patrol stalled at the first.

     x = ±8.5 keeps 2.9 m inside the rail. The cross-legs are the fussy part: four roof-light
     slots open through the deck at |x| < 1.3, in the bands z ≈ −47, −39.7, −32.5 and −25.2, and
     a guard crossing the deck at x = 0 walks over one. They sit on z = −21.9 and −43.6, each
     the middle of a full-width window, and each long leg carries a midpoint — a four-point
     Catmull-Rom rectangle bulges ~2.3 m at the corners, which was enough to reach a slot on
     its own. */
  rooftop_run: {
    closed: true, baseY: 17.0, space: 'roof',
    points: [
      [-8.5, -21.9, 2.2, 'look'],
      [0.0, -21.9, 0, null],
      [8.5, -21.9, 1.6, null],
      [8.5, -32.7, 0, null],
      [8.5, -43.6, 2.4, 'look'],
      [0.0, -43.6, 0, null],
      [-8.5, -43.6, 1.6, null],
      [-8.5, -32.7, 0, null],
    ],
  },

  /* The crypt's east aisle, paced end to end past the sarcophagus. Torch-lit, so the cone
     reads warm against cold.

     Open rather than a ring, and again the architecture forces it: the crypt's three pillar
     rows leave a 0.9 m corridor at the south end and a 1.0 m one at the north, and a 0.56 m
     Heavy does not turn a corner in either. The aisle itself (x 6.6‥12.1) is 5.5 m wide and
     runs the length of the room, so he paces it, which is the right patrol for a tomb guard
     anyway — he is standing over the thing you came for. */
  tomb_vault: {
    closed: false, baseY: -12.0, space: 'tomb',
    points: [
      [9.2, -61.5, 2.4, 'look'],
      [9.2, -67.0, 1.4, 'look'],
      [9.2, -72.0, 0, null],
      [9.2, -74.5, 2.4, 'look'],
    ],
  },

  /* Scarab on the courtyard architrave, 9 m up. Makes the ledge tiptoe circuit a decision.
     This is the one route the first audit passed unchanged. */
  architrave_ledge: {
    closed: false, baseY: 9.0, space: 'ledge',
    points: [
      [23.0, -8.0, 1.2, 'look'],
      [23.0, 8.0, 1.0, null],
      [23.0, 26.0, 1.6, 'look'],
    ],
  },

  /* Scarab skittering a tight ring around the sarcophagus, inside the pillar rows. It gets to
     close the loop where the Heavy cannot: 0.26 m of radius fits the 1.0 m gaps between the
     plinth and the pillars, and the two cross-legs at z = −68.0 and −74.6 pass north and south
     of the plinth footprint (z −73.7‥−70.3) rather than over it. */
  tomb_scarab: {
    closed: true, baseY: -12.0, space: 'tomb',
    points: [
      [3.0, -68.0, 0.8, null],
      [3.0, -74.4, 1.0, 'look'],
      [-3.0, -74.4, 0.8, null],
      [-3.0, -68.0, 1.0, 'look'],
    ],
  },
};

/** Which guard walks which route. 11 bodies: 6 temple, 3 heavy, 2 scarab. */
export const ROSTER = [
  { type: 'temple', route: 'south_gate', u: 0.00, speed: 1.00 },
  { type: 'temple', route: 'courtyard_ring', u: 0.00, speed: 1.05 },
  { type: 'heavy', route: 'courtyard_ring', u: 0.52, speed: 0.92 },
  { type: 'temple', route: 'obelisk_watch', u: 0.30, speed: 0.94 },
  { type: 'temple', route: 'pylon_gate', u: 0.10, speed: 1.08 },
  { type: 'temple', route: 'hall_nave', u: 0.00, speed: 1.00 },
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

  /**
   * The dwell stop sitting at `u`, if there is one. `nextStop` deliberately reports only stops
   * strictly *ahead*, which leaves the ends of an open route unreachable on the frame the
   * guard turns around — see `Guard._followRoute`.
   */
  stopAt(u, tol = 1e-3) {
    for (const s of this.stops) if (Math.abs(s.u - u) <= tol) return s;
    return null;
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

/** How far up the alert ladder a state sits. Used only to decide which way hysteresis leans. */
const RUNG = {
  [STATE.PATROL]: 0, [STATE.SUSPICIOUS]: 1, [STATE.SEARCHING]: 2, [STATE.CHASE]: 3,
};

/**
 * Threshold → state.
 *
 * @param {number} s        the suspicion meter
 * @param {string|null} cur the state he is in now. Pass it: with it, each band he already
 *   occupies is `DETECT.hysteresis` lower on the way *down* and unchanged on the way up, so a
 *   meter resting exactly on a threshold cannot chatter. Omit it and this is the bare
 *   comparison it always was, which is what the pure-threshold tests want.
 */
export function stateForSuspicion(s, cur = null) {
  const held = RUNG[cur] ?? 0;
  const h = cur === null ? 0 : DETECT.hysteresis;
  const at = (level, band) => (held >= level ? band - h : band);
  if (s >= at(3, DETECT.chase)) return STATE.CHASE;
  if (s >= at(2, DETECT.searching)) return STATE.SEARCHING;
  if (s >= at(1, DETECT.suspicious)) return STATE.SUSPICIOUS;
  return STATE.PATROL;
}

/**
 * Where the vision cone's colour sits on its three-stop ramp: 0 = patrol cream, 1 = warn
 * amber, 2 = alert red. `Guard.js` mixes the two stops either side of the returned value.
 *
 * A single cream→red lerp across the whole meter — which is what shipped — is a continuous
 * slide, and a player cannot read a state off a continuous slide: every frame is a slightly
 * different orange and none of them means anything in particular. The ramp below is pinned to
 * the *same thresholds the state machine uses*, so the colour of the cone **is** the state:
 * cream while he has noticed nothing, amber the instant he becomes suspicious and held amber
 * through the whole search, red only once he has committed. The two hard edges are at
 * `DETECT.suspicious` and `DETECT.chase`, which are the two moments the player's decision
 * actually changes.
 */
export function coneColourStop(s) {
  if (s <= 0) return 0;
  if (s < DETECT.suspicious) {
    // Warming before the band, so "he is starting to notice" is visible a beat early.
    return THREE.MathUtils.smoothstep(s / DETECT.suspicious, 0.30, 1.0);
  }
  if (s >= DETECT.chase) return 2;
  const t = (s - DETECT.suspicious) / (DETECT.chase - DETECT.suspicious);
  return 1 + THREE.MathUtils.smoothstep(t, 0.55, 1.0);
}

/** Base movement speed for a state and type, m/s. */
export function speedFor(state, type) {
  let s;
  switch (state) {
    case STATE.CHASE: s = DETECT.chaseSpeed; break;
    case STATE.SEARCHING: s = DETECT.alertSpeed; break;
    case STATE.SUSPICIOUS: s = DETECT.peerSpeed; break;
    case STATE.LOST: s = DETECT.alertSpeed * 0.8; break;
    case STATE.STUNNED: case STATE.KO: s = 0; break;
    default: s = DETECT.patrolSpeed;
  }
  if (type === 'heavy') s *= DETECT.heavyScale;
  else if (type === 'scarab') s *= DETECT.scarabScale;
  return s;
}

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

/* §748 revert token: `?sight=sky` (or `globalThis.__SIGHT_AB = 'sky'` from a test, for hosts
   with no `location`) restores the pre-§748 sight exactly — a cone tested only in the
   horizontal plane and therefore unbounded in Y, which is what let a player on a roof, and
   most of all a player directly overhead, be seen. Read once at module scope, the same shape
   `?react=` and `?kk=` use. */
const SIGHT_AB = (() => {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('sight') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__SIGHT_AB != null) raw = String(globalThis.__SIGHT_AB);
  } catch { /* plain-module hosts have no location; that is the test path */ }
  const on = String(raw).trim().toLowerCase().split(',').map((s) => s.trim());
  return { sky: on.includes('sky') };
})();

/**
 * Is the vertical ceiling on sight in force? False only under `?sight=sky`, where every line
 * below is arithmetically bypassed and the fill rate is bit-identical to the pre-§748 build.
 */
export const SIGHT_CEIL_ON = !SIGHT_AB.sky;

/**
 * §748 — how far ABOVE his own feet a guard can see, and how soft the boundary is.
 *
 * ── the defect this closes ──────────────────────────────────────────────────────────────────
 * `Senses.evaluate` tests the cone **entirely in the horizontal plane**: it flattens the vector
 * to the player, flattens the guard's forward, and compares bearings. There was no vertical term
 * anywhere, so the sensed volume was not a cone at all — it was an infinite vertical wedge, and
 * every point directly above the guard's forward line scored `angle 0`, the dead centre of the
 * bright core, at any height inside `range`. Measured on the shipped build before this landed
 * (`tools/sightceil.mjs --table`, temple, walking, moonlit, fill rate per second):
 *
 *     rise above his feet      overhead      2 m out      6 m out     12 m out
 *        0.00 m (same floor)      1.577        1.456        1.118        0.604
 *        4.00 m                   1.355        1.307        1.050        0.568
 *        8.00 m                   1.011        0.988        0.826        0.430
 *
 * Standing eight metres straight up read 1.011 against 1.118 for a player standing six metres
 * away on the guard's own floor and 0.604 for one standing twelve metres away — so height was
 * costing the player almost nothing and distance was costing him everything. **Airborne it was
 * worse than either**: `DETECT.airborneGain` 1.20 multiplies anyone who got up there by jumping,
 * and the overhead column becomes 1.874 / 1.917 / 1.815 / 1.610 / 1.201 at rises 0 / 1 / 2 / 4 /
 * 8 m — so a player eight metres over a guard's head, in the air, filled the meter FASTER (1.201)
 * than one walking about six metres in front of him on his own floor (1.118).
 *
 * ── why a height and not a pitch ────────────────────────────────────────────────────────────
 * A pitch limit is the more principled shape — it is what a cone actually is — and it is the
 * wrong one here, for a reason that is decisive rather than aesthetic: **pitch is a function of
 * distance and height is not.** A player standing on the second step of a staircase one metre
 * in front of a guard is at 25° of elevation and a pitch limit blinds him; the same player on
 * the same step twelve metres away is at 2° and is seen. That inverts the thing the player is
 * being asked to learn. A ceiling parallel to the guard's own floor is flat over stairs, ramps
 * and plinths at every distance, which is the property that keeps a slightly-raised surface
 * readable. The owner offered the height version and it is also the better one.
 *
 * ── the number, and where it comes from ─────────────────────────────────────────────────────
 * `ceiling` is **Carmelita's own drawn height** — the owner's ruling, one number for all three
 * rosters rather than three per-type derivations. It is MEASURED, not quoted: `tools/sightceil.mjs
 * --height` places her through the shipped `instantiateNative`, reads the scale off the node that
 * instantiator writes it to, and takes a world `Box3` over the placed rig. Three independent
 * expressions of it agree to 2.12e-6 m:
 *
 *     world Box3 over the placed rig            y [0.000000, 1.816286]  ->  1.81629 m
 *     merged geometry box x the node scale      1.81628 m   (1.63875 unscaled x 1.108338)
 *     the rebind arm over the same source file  1.81628 m
 *
 * with the head group at 17,469 triangles, because §704 records this character's head once
 * measuring 99.4 % absent and a short box would otherwise pass as a measurement.
 *
 * **Why one number is right and three would have been wrong.** The obvious per-type derivation
 * is each roster's own body height, and it fails on the scarab: `VISION.scarab.eyeHeight` is
 * 0.26 m and `Guard.TUNE.headTop.scarab` is 0.34 m, so a beetle-height ceiling would blind it to
 * a player standing on a kerb — and the comparison here is between the player's FEET and the
 * guard's own base, so it must clear a standing player's whole world, not his ankles. 1.81628 m
 * sits just above MOVEMENT's 1.80 m standing capsule, which means a player standing on a surface
 * as high as he is tall is still at the boundary rather than past it.
 *
 * ── soft, not hard ──────────────────────────────────────────────────────────────────────────
 * `soft` is the same argument the cone edge already carries three lines further down: a hard
 * cutoff makes the player feel cheated when he clips the boundary. The last half-metre
 * smoothsteps to zero, so stepping onto a plinth dims the guard's read of you instead of
 * deleting it.
 *
 * ── what this deliberately does NOT do ──────────────────────────────────────────────────────
 * **Hearing is untouched.** It is a sphere, it has no cone and no defect, and the owner's words
 * were about sight. A player above the ceiling can still be HEARD if he is running, unsneaking,
 * inside `hearRadius` — and `DETECT.hearCap` 0.66 is below `DETECT.chase` 1.00, so noise from
 * above can make a guard suspicious and can never make him chase or catch you.
 *
 * **There is no floor.** A guard on the terrace still sees the courtyard below him to the full
 * `range`. Nothing in the report was about being seen from below and inventing a limit there
 * would be a second change hidden inside this one.
 */
export const SIGHT = {
  /** Metres above the guard's own base. Measured; see above. */
  ceiling: 1.81628,
  /** Metres of smoothstep below `ceiling` over which sight fades to nothing. */
  soft: 0.50,
};

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
  /* The swing lands `attackWindup` after it starts, not on the frame the player enters range.
     An instantaneous hit is not a Sly guard, it is a damage aura: with one hit costing the
     player a lucky charm — or the run — the telegraph IS the mechanic, and it has to be long
     enough to leave. At `chaseSpeed` 4.60 m/s the player covers 1.6 m inside it, which is more
     than the `attackReach` slack below, so backing off during the wind-up works. */
  attackWindup: 0.34,
  /* He leans in as he swings, so the hit connects slightly past the range that started it.
     Without the slack a player who drifts 5 cm during the wind-up is never hit at all. */
  attackReach: 1.15,
  attackKnock: 9.5,        // knockback impulse handed to `hurt`
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
 *
 * ── AND THE THREE RULES WERE MEASURED AGAINST ARCHITECTURE ONLY, WHICH IS HALF THE LEVEL ───
 *
 * Every number above was checked against `EgyptLevel.js`'s masonry and nothing else. `Props`
 * and `KayKit` are separate modules that register their own colliders *after* Architecture, and
 * `tests/patrol.test.mjs` built neither — so the suite was green while **five of the nine
 * guards could not move**, four of them from the first frame:
 *
 *     guard1  courtyard_ring  5.3 m in 200 s   brazier at (-18, 22)   — the west leg ran x = -18
 *     guard2  courtyard_ring 10.5 m in 200 s   brazier at ( 18,  6)   — the east leg swung through it
 *     guard4  pylon_gate      0.0 m in 200 s   KayKit crate (-5.5, 30.5) — he SPAWNED inside it
 *     guard6  hall_weave     91.9 m, then stopped at t = 100 s   KayKit barrels (-12.5, -33.5)
 *     guard8  tomb_vault      0.2 m in 200 s   KayKit crates (8.6, -64.4)
 *
 * The shape is the same every time and it is not a typo anywhere: **the route and the prop were
 * authored to the same round number by two people solving different problems.** `Props`'
 * braziers "light the processional route" and sit at x = ±18 — which is where the ring's west
 * leg was. `KayKit`'s six camera props were grid-searched against paving, columns, wall proxies
 * and shot framing; that list has four entries and **patrol routes are not one of them** — its
 * own header records that the claim "nothing lands ... on a route" was retired as unchecked.
 * Neither constraint set contained the other, and no instrument spanned both.
 *
 *   4. **Props are level geometry too, and the route yields to them unless it cannot.** Which
 *      side moves is a cost question, decided per conflict and recorded at each site below. A
 *      brazier carries a light, an ember emitter and a hazard volume; a KayKit camera prop is
 *      pinned to a measured shot distance in `tests/kaykit.test.mjs`. A waypoint carries a
 *      dwell and nothing else — `SHOT_POSE.guard` *solves* for its subject's stand rather than
 *      reading one, so no shot in the game reads a coordinate from this table. The waypoint is
 *      almost always the cheaper thing to move, and every repair below moves the waypoint.
 *      The one place it could not — see `courtyard_ring` — the ROUTE'S TOPOLOGY changed instead,
 *      because no centre-line existed at any offset.
 *
 * `tests/patrol.test.mjs` C6/C7 now measure this, against the props the shipped game builds,
 * along the spline rather than at the waypoints, over the seed jitter rather than at one draw.
 */
export const ROUTES = {
  /* The south forecourt, between the hall front and the terrace — the stretch of pavement the
     `guard` canonical shot looks at. Deliberately the first route in the table so guard #0
     walks it. Stays south of z = −1.5: the four propylon piers stand at x ±(11.2‥13.8) and
     ±(19.7‥22.3) across z −0.5‥2.5, and the old route walked straight into the east one. */
  south_gate: {
    /* §707: the south legs came off z = -13 (they were [0,-13] and ±[9,-12]) and now run at
       -11.5 / -10.5. `Props._courtyardDress` scatters 26 pots and baskets, and the 30 % that are
       not "against a wall" take `R.pick([-13, 31])` — so the mid-floor pottery lands on exactly
       two z lines, and this route's dwell post was on one of them. Nine vessels cluster at
       x 6.5‥10.5, z -12‥-14; the old leg passed 0.10 m from one over the jitter, against the
       0.62 m this route's temple guard needs.

       Guard #0 was NOT stalled by it, and that is worth knowing rather than guessing at: `_step`
       clamps on two forward RAYS, not on a swept capsule, so a pot 0.10 m off the centre-line
       goes past his shoulder untouched while a pot dead ahead stops him. He was walking through
       the pottery, not into it. Moved anyway — the clearance bar is what keeps the next prop out
       of the beat, and a bar the level violates is not a bar. Measured 1.153 m over 24 seeds. */
    closed: true, baseY: 0, space: 'courtyard',
    points: [
      [0.0, -11.5, 2.6, 'look'],
      [9.0, -10.5, 1.0, null],
      [16.5, -7.5, 2.2, 'look'],
      [16.0, -3.0, 1.2, null],
      [6.0, -3.5, 1.4, null],
      [-6.0, -3.5, 2.0, 'bored'],
      [-16.0, -3.0, 1.2, null],
      [-16.5, -7.5, 2.2, 'look'],
      [-9.0, -10.5, 1.0, null],
    ],
  },

  /* The big courtyard perimeter: down the west colonnade, across the front of the hall, up the
     east side and back along the pylon face. The long walk the player times.

     The east leg is the awkward one and it is deliberately kinked. At z ≈ 1 it must thread the
     6 m gap between two propylon piers, so it runs at x = 16.5; north of z = 20 the ramp
     landing occupies x 12.2‥19.0 at y = 1.47, a 1.5 m step the guard's `stepUp` refuses, so it
     swings out to x = 20.0 between that landing and the peristyle columns at x = 22.

     ── §707: THE RING IS NO LONGER A RING, AND THAT IS FORCED RATHER THAN CHOSEN ────────────
     Three separate props stood on this beat and two of them stopped a body dead:

       west leg   x = -18 ran through the braziers at (-18, 6) AND (-18, 22). `Props`' eight
                  brazier spots are `[±18, 6], [±18, 22], [±7.5, 32], [±20, -10]` — the same
                  x the leg used, because both were written to "the west colonnade". guard1
                  covered 5.3 m in 200 s: his ground probe met the tripod's near-vertical face
                  at 87.2°, past `groundSlopeMax`, so `_step` refused the footfall rather than
                  clamping the forward ray. Same prop, different branch, identical symptom.
                  Now x = -15.8, which is the centre of the 3.3 m band between the brazier line
                  and the west colossus plinth (x -14) and still inside the z = 1 pier gap
                  (-18.5‥-15).
       east leg   the 16.8 → 20.0 swing crossed the brazier at (18, 6) at x ≈ 17.8. guard2 was
                  pinned there by the chest ray at 0.56 m for 189.5 s of a 200 s run. The swing
                  now happens north of the stores instead: 16.5 up to z = 15, out to 20.0 by
                  z = 20, which is the only line between the ramp landing and the peristyle.
       north leg  z = 29.8, x -8‥8, ran through `KayKit`'s `crates_stacked` at (-5.5, 30.5) —
                  the courtyard's ONE near camera prop, pinned by coordinate in
                  `tests/kaykit.test.mjs` C4 along with its measured `sly-profile` framing.

     The north leg is the one place in this file where no waypoint works, and it was worth
     proving rather than asserting before touching the topology. That crate sits in the mouth of
     the pylon throat, between the west colossus plinth (north face z = 28.6) and the throat
     jambs (x ±7.5 for z ≥ 30.6). Measured on a 0.5 m grid of the shipped colliders, the widest
     centre-line clearance anywhere on a west-bound crossing is:

         south of the crate, x = -6.0   0.39 m      north of it, x = -7.5, z = 30.5   0.80 m
         south of the crate, x = -5.0   0.47 m      north of it, x = -7.5, z = 31.0   0.40 m

     — and the Heavy's own RADIUS is 0.56 m. He does not fit, at any offset, at any z. This is
     not a margin the bar could be relaxed to accept; the lane is sealed. Moving the crate was
     tried and measured too: 1.0 m north leaves 0.36 m for this route and 0.25 m for
     `pylon_gate`, because its collider is 2.9 m deep along z and the band between the two beats
     is 2.4 m. There is no position for it that opens both.

     So the ring is now an OPEN ping-pong whose two ends sit either side of the crate, at
     (±8, 29.5). The guard paces the whole perimeter and turns around instead of closing the
     last 16 m — which `pylon_gate`'s guard patrols anyway, 3.7 m further north. `obelisk_watch`
     and `hall_weave` are open for the same class of reason and say so; this is the third.

     Measured over 24 seeds of the waypoint jitter, against Architecture AND the shipped props:
     nearest masonry 0.834 m, nearest prop 0.794 m, both against the 0.76 m bar. */
  courtyard_ring: {
    closed: false, baseY: 0, space: 'courtyard',
    points: [
      [-8.0, 29.5, 1.4, 'look'],
      /* Three points hold the north-west lane straight at z ≈ 29.5. A four-point corner here
         bulged to z = 29.81 and clipped the stone pile at (-12.6, 30.1) — the lane is 1.0 m of
         clearance at 29.5 and 0.52 m at 30.0, so the bulge, not the leg, was the violation. */
      [-12.0, 29.5, 0, null],
      [-15.5, 29.4, 0, null],
      [-15.8, 26.5, 2.2, 'look'],
      [-15.8, 16.0, 0, null],
      [-15.8, 1.0, 1.6, null],
      [-15.8, -10.0, 2.4, 'look'],
      [-6.0, -11.5, 1.0, null],
      [6.0, -11.5, 1.0, null],
      [16.5, -10.0, 1.8, null],
      [16.5, 1.0, 0, null],
      [16.5, 15.0, 0, null],
      [20.0, 20.0, 1.6, null],
      [20.0, 26.5, 2.6, 'bored'],
      [15.5, 29.4, 0, null],
      [12.0, 29.5, 0, null],
      [8.0, 29.5, 1.4, 'look'],
    ],
  },

  /* The obelisk terrace, one storey up. Whoever walks this is the reason you cannot simply
     climb the pole from the south side.

     Open, not closed, and that is forced by the architecture rather than chosen: terrace stage
     1 (y = 2.0) is an annulus around stage 2, and its north side is cut in half by the upper
     stair at |x| ≤ 2.6. There is no closed loop up here. A sentry pacing a U past the obelisk
     and turning at each end of the north band is a stronger read anyway — the about-face is
     the beat the player counts.

     ── THIS ROUTE BROKE RULE 1 AT THE TOP OF THE FILE, AND THE FILE DID NOT NOTICE ──────────
     The seven-point version walked (5.5, 18) → (7.6, 12) → (7.6, 6.2) → (0, 4.4) and mirrored
     back: a heptagon drawn around a rectangle. Every waypoint was clear of stage 2 and **four
     of the six legs cut its corners**, each by 0.45 m —

         leg 0  (5.5,18) → (7.6,12)     at ( 6.15, 16.14)
         leg 2  (7.6,6.2) → (0,4.4)     at ( 6.12,  5.85)
         leg 3  (0,4.4) → (-7.6,6.2)    at (-6.12,  5.85)
         leg 5  (-7.6,12) → (-5.5,18)   at (-6.15, 16.14)

     — which is rule 1 verbatim ("a waypoint pair that cuts a corner diagonally will cross a
     column line somewhere") with a building in place of a column. Driven over 200 seeds the
     spline is inside the stage-2 collider on 12% of its arc and its clearance never rises above
     **−0.361 m**: there is no seed on which this route was ever walkable.

     It walked anyway for as long as it did because **the terrace had no side collision at all**
     — `masonryShell` draws faces and registers nothing, and the ground proxy under stage 2 was
     1.0 m thick against a deck 3.2 m up, so the building was an open frame. `EgyptLevel` closed
     that for the player (you could walk through the second terrace); closing it stopped this
     guard dead at 0.9 m of 144.2 m. **One collider gap had two consumers and only one of them
     was a player.** The patrol layer is a second occupancy test for the level's solids, and it
     found this one first.

     ── The band is 2.2 m wide, not 2.8, and the first rewrite failed on that ────────────────
     The obvious repair is corner waypoints on the annulus between stage 2 (|x| ≤ 6.6, z 5.4‥16.6)
     and the stage-1 deck (|x| ≤ 9.4, z 2.6‥19.4) — 2.8 m of band on all four sides. It measured
     clean against those two rectangles and **still failed**, because the east and west sides
     carry the terrace parapet: a `ledge` proxy at |x| 8.8‥10.0, y 3.0‥3.5, which stands 1.0 m
     above the deck and is solid (`ledge` is in `Collision.SOLID_TAGS`). The usable corridor is
     6.6‥8.8 — **2.2 m**, and a 0.42 m guard who must keep 0.62 m off both faces has 0.96 m of
     total slack for ±0.22 m of jitter and whatever the spline does at the corners.

     Which turned out to be the whole problem. At |x| = 7.7 — the corridor's exact centre-line —
     square corners measured **0.506 m**, under the bar, with the worst sample at the south-east
     turn rather than on any leg. A 90° Catmull-Rom corner overshoots outward, and there is no
     leg position that fixes a corner. Sliding the legs is what the numbers invite and it does
     not work: 7.2 → 0.422, 7.4 → 0.622, 7.7 → 0.507, 7.9 → 0.294, a non-monotone row because
     the binding face alternates between the building and the parapet.

     **Chamfering each 90° corner into two 45° ones buys 0.36 m and costs nothing else.** That
     is rule 1 again, in its own terms: the diagonals here are 0.8 m long and sit in open band.

     Rule 3's bar is `radius + 0.20` = 0.62 m for the temple guard who walks it. Measured on the
     spline against **the level's registered colliders** — not against a rectangle written here,
     which is the mistake that produced the first rewrite — over 60 seeds of the jitter:

         nearest obstacle    0.865 m  worst   (square corners 0.506; the heptagon −0.443)
         deck inset          1.145 m  worst
         route length        46.5 m   (was 40.4)

     The four dwell reads are unchanged and both about-faces stay where they were. */
  obelisk_watch: {
    closed: false, baseY: 2.0, space: 'terrace',
    points: [
      [5.5, 17.8, 2.0, 'look'],
      [6.9, 17.8, 0, null],
      [7.7, 17.0, 0, null],
      [7.7, 12.0, 0, null],
      [7.7, 6.2, 1.2, null],
      [7.7, 4.8, 0, null],
      [6.9, 4.0, 0, null],
      [0.0, 4.0, 1.8, 'look'],
      [-6.9, 4.0, 0, null],
      [-7.7, 4.8, 0, null],
      [-7.7, 6.2, 1.2, null],
      [-7.7, 12.0, 0, null],
      [-7.7, 17.0, 0, null],
      [-6.9, 17.8, 0, null],
      [-5.5, 17.8, 2.0, 'look'],
    ],
  },

  /* The entry pylon gateway — the level's front door, and the first thing the player must get
     past from spawn. Open: he about-faces under the lintel at each end.

     This replaces `sphinx_avenue`, which patrolled z 43‥77 out on the approach. That is
     outside the collision mesh entirely (the courtyard ground ends at z = 34), so its guard
     was walking on the authored fallback height over sloping sand, and it is also 10‥45 m
     behind the player's spawn, guarding nothing he has to cross.

     ── §707: 2 m north, because the west half of the old beat is inside a crate ─────────────
     The old line (±6.2, 31.2) → (0, 32.4) put guard4's spawn at u = 0.10 INSIDE `KayKit`'s
     `crates_stacked` collider at (-5.5, 30.5), which spans x -6.9‥-4.1, z 29.1‥31.9. He
     travelled 0.0 m in 200 s and every one of his 400 samples classified `blocked` — the only
     guard in the garrison who never took a step. Nothing was wrong with him; the waypoint was
     authored in 2 m of solid.

     The crate stays: it is the courtyard's single near camera prop, its position and its
     `sly-profile` framing are pinned by coordinate in `tests/kaykit.test.mjs` C4, and the
     argument for it in `KayKit.js` runs forty lines. The beat moves instead, to the clear band
     across the throat at z 33.0‥33.5 — north of the crate's 31.9 face, south of where the
     courtyard paving ends at z = 34. Under the lintel is a better read for a gate sentry than
     in front of it, and the two 'look' posts and the about-face are unchanged.

     Measured over 24 seeds: nearest prop 1.152 m against a 0.62 m bar (it was 0.000). */
  pylon_gate: {
    closed: false, baseY: 0, space: 'courtyard',
    points: [
      [-6.0, 33.2, 2.2, 'look'],
      [0.0, 33.4, 1.2, null],
      [6.0, 33.2, 2.2, 'look'],
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
     full about-face at each end of the aisle, which is a better read than a corner anyway.

     ── §707: the west leg steps around the barrels, because the corridor has no through line ──
     `KayKit`'s `barrel_small_stack` stands at (-12.5, -33.5) — the route's own x, to the
     decimal, and for the same reason the ring met the braziers: it was placed for the `temple`
     camera against paving, columns, walls and framing, and this beat was not on that list. Its
     collider spans x -13.4‥-11.6. guard6 walked 91.9 m and then stopped for the last 99.5 s of
     a 200 s run, which is the whole argument for measuring patrol over minutes: a spawn-time
     check and a 60 s check both call him healthy.

     Sliding the leg does not work, and the sweep is the reason this is a dodge rather than a
     number. West of the barrels the aisle column at (-16.5, -26) closes the line; east of them
     the nave column at z = -31 does. Over 24 seeds:

         x = -10.7   prop 0.572   x = -10.5   prop 0.776   x = -10.4   prop 0.877
         x = -10.5   arch 0.626   x = -10.3   arch 0.537   (the nave column takes over)

     — a window about 0.1 m wide between "inside the barrels" and "inside the column", against
     ±0.22 m of authored jitter. There is no straight leg.

     So the leg keeps x = -12.5, where its 2.6 m of column clearance was measured, and steps out
     to -14.6 for the 3.5 m the barrels occupy — into the bay between the aisle column rows at
     z = -26 and z = -38, which is empty. A sentry walking around a stack of barrels is what a
     sentry does. Measured 1.116 m of prop clearance over 24 seeds, against 0.76.

     ── and the cross-leg moved 1.5 m north, which the dodge is what FOUND ──────────────────
     The north cross-leg sat at z = -43.5 with the ends at -42.5, and its east half passed the
     nave block at (6.4, -43.7) with 0.636 m over a seed sweep — under the same 0.76 m bar, and
     nothing to do with props. C1 measures ONE seed and got 0.821 m there, so it had always been
     green; adding three waypoints to the west leg shifted every later `r.jitter(0.22)` draw in
     the route's own stream, C1 landed on 0.740 m instead, and failed. The margin was always
     that thin — the dodge only changed which member of the family got measured.

     Repaired rather than tuned back under the bar, because the window's real middle is not
     where the header said. Measured on a 0.5 m grid at x = 6.5‥9.5, the clearance profile
     across the window is 1.38 m at z = -43.0, 1.88 at -42.5, **2.38 at -42.0**, 1.88 at -41.5:
     the widest line is z = -42.0, not the "z ≈ -43" this comment used to claim. Ends at -42.0,
     the 'bored' dwell at -42.4, and the whole route now measures 0.842 m of masonry clearance
     over 24 seeds instead of 0.636. */
  hall_weave: {
    closed: false, baseY: 0, space: 'hall',
    points: [
      [-12.5, -20.0, 2.0, 'look'],
      [-12.5, -28.5, 0, null],
      [-14.6, -32.0, 0, null],
      [-14.6, -35.5, 0, null],
      [-12.5, -39.0, 0, null],
      [-12.5, -42.0, 1.6, null],
      [0.0, -42.4, 1.4, 'bored'],
      [12.5, -42.0, 1.6, null],
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
     anyway — he is standing over the thing you came for.

     ── §707: x = 11.0, not 9.2, and it is the only value that works ────────────────────────
     The hoard's `crates_stacked` at (8.6, -12, -64.4) has a collider spanning x 7.2‥10.0, and
     the old centre-line at 9.2 went straight into it: guard8 covered 0.2 m in 200 s, blocked on
     399 of 400 samples from t = 0.5 s. He is the aisle's only body and he never left the spot
     he spawned on.

     A 5.5 m aisle with a 2.8 m crate in it has one line left, and the sweep says so exactly —
     over 20 seeds, x = 10.8 gives 0.754 m of prop clearance (bar 0.76) and x = 11.2 gives
     0.697 m of masonry clearance (same bar). 11.0 is the single value clearing both: prop
     0.954 m, masonry 0.897 m. The crate is not moved — it is part of the hoard composition the
     room is built around, and unlike the route it has nowhere better to be. */
  tomb_vault: {
    closed: false, baseY: -12.0, space: 'tomb',
    points: [
      [11.0, -61.5, 2.4, 'look'],
      [11.0, -67.0, 1.4, 'look'],
      [11.0, -72.0, 0, null],
      [11.0, -74.5, 2.4, 'look'],
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
     of the plinth footprint (z −73.7‥−70.3) rather than over it.

     ── §707: this ring is inside the hoard, and it is LEFT THAT WAY, deliberately ───────────
     Measured against the shipped props it touches `props_gold` at (3.6, −70.6) with 0.000 m of
     clearance — the coin stacks at (2.8, −68.2) and (5.9, −73.2) and the `chest` at (4.6, −70.0)
     are on the line. It is not repaired here and it is not an oversight: §589 took both scarab
     bodies off the level, so **this route has no walker**, and nothing can stall on it. C6 in
     `tests/patrol.test.mjs` asserts on routes that appear in `ROSTER` and reports the rest, so
     the day someone appends a scarab line to the roster — the two lines §589 says would put one
     back — this route stops being reported and starts being asserted, and fails until it is
     re-authored. That is the right moment for it to matter, and the wrong moment is now:
     threading a 0.26 m body between a plinth, three pillars and a treasure hoard is a piece of
     design work, not a coordinate nudge, and doing it blind for a body nobody can see would be
     tuning against a test rather than against the room. `architrave_ledge` is in the same state
     for the same reason and is clear of props anyway (4.09 m). */
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

/**
 * Which guard walks which route. 9 bodies: 6 temple, 3 heavy.
 *
 * **THE SCARAB IS OFF THE LEVEL, and only off the level (§589).** User ruling from a live
 * playtest — "remove the crab guard" — so the two `scarab` bodies that used to close this list
 * are gone. What is deliberately still here: the `scarab` entry in `GUARD_TUNE`/`VISION`, its
 * clip section in `GuardAnim.js`, `DETECT.scarabScale`, and both routes it walked
 * (`architrave_ledge`, `tomb_scarab`). The ruling was about a body in the world, not about the
 * code that could put one back — and putting one back is these two lines, while re-deriving a
 * deleted type is not.
 *
 * They were the LAST two entries and that is load-bearing rather than lucky: `Guard.js` warns
 * that one warned-and-skipped roster line shifts every later index, `SHOT_POSE.guard` parks
 * roster #0 and `SHOTS.alert.stage` stages #1 and #2. Established by evaluating the array
 * rather than counting lines — indices 9 and 10 of 11 — so nothing any shot stages moved.
 * Anything added below must go BELOW nothing; append, never insert.
 *
 * Consequence worth knowing before it is rediscovered: `architrave_ledge` and `tomb_scarab` are
 * now routes with no walker. The architrave and the crypt have nobody on them.
 */
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
   *   baseY      number  the guard's OWN base height — the floor he is standing on. §748's
   *                      ceiling is measured from here to the player's feet, and both ends of
   *                      that comparison are deliberately soles rather than body centres: a
   *                      scarab's eye is 0.26 m off the ground and a standing player's chest is
   *                      not, so any head-to-head comparison blinds the beetle on level ground.
   *                      Omitted by a caller with no guard body (the unit tests), which falls
   *                      back to `eye.y - cfg.eyeHeight` — the same quantity to within the walk
   *                      bob, since `Guard._eyePosition` rides the live head bone.
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

    /* --- §748: the vertical ceiling. Above his own head he does not look. ---
       Placed here deliberately: after hearing (a sphere, and not ceilinged) and before both the
       cone maths and the line-of-sight ray, so a player on a roof costs one subtraction rather
       than a raycast. `rise` is the player's FEET against the guard's OWN base — see `baseY`
       above for why neither end is a body centre. */
    let riseW = 1;
    if (SIGHT_CEIL_ON) {
      const baseY = p.baseY ?? (p.eye.y - cfg.eyeHeight);
      const rise = p.target.y - baseY;
      if (rise >= SIGHT.ceiling) return this._settle(p.dt);
      riseW = 1 - THREE.MathUtils.smoothstep(rise, SIGHT.ceiling - SIGHT.soft, SIGHT.ceiling);
    }

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
    /* §748 folds `riseW` into this gate rather than only into the fill rate below, so that the
       last centimetres under the ceiling stop counting as SEEING rather than as seeing at a
       vanishing rate — `sawThisFrame` drives `timeSinceSeen`, `lastSeen` and the "you are lit
       because another guard's beam is on you" flag, none of which should latch off a fill rate
       of 0.001. In the `?sight=sky` arm `riseW` is exactly 1 and this is the same comparison it
       has always been. */
    if (angleGain * riseW < 0.02) return this._settle(p.dt);

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
    this.gain = Math.max(this.gain, DETECT.fillBase * near * angleGain * riseW * move * stealth * light);
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

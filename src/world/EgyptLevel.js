import * as THREE from 'three';
import * as K from './Kit.js';

/**
 * EgyptLevel — the Temple of Ra, laid out to the AGENTS.md §8.1 coordinate contract.
 *
 * ============================ THE TRAVERSAL ROUTE ============================
 * A complete spawn -> sarcophagus line using nothing but the §6 moveset. MOVEMENT and
 * COLLISION should be able to walk this on paper and then in the game.
 *
 *  0. SPAWN (0, 0, 30) on courtyard paving, facing -Z. The entry pylon is behind; the
 *     obelisk terrace, kiosk, colossi and the hall front are all in view. Everything
 *     visible from here is climbable.
 *  1. WALK north to the terrace south stair at (0, 0, 19.6). Climb: paving 0 -> stage 1
 *     (y 2.0) -> stage 2 (y 5.2). Both `ground`.
 *  2. DOUBLE JUMP (2.5 + 1.9 = 4.4 m > 3.8 m) from stage 2 onto the obelisk kiosk lintel
 *     ring, top y = 9.0 — the `ledge` Sly perches on in the `hero` shot at (2.2, 9, 8.4).
 *     Alternative: POLE CLIMB the obelisk (0, ·, 11) all 22 m and SPIRE LAND on its
 *     pyramidion tip at y = 22, then drop to the kiosk.
 *  3. CANE HOOK the ring at (4.2, 14.8, 4.5) — 5.8 m above the lintel, inside jump+hook
 *     reach — and SWING the chain north-west: rings at y 14.8 -> 13.2 across z 4.5 -> -13.
 *     Release onto the hall front cornice ledge at (-9.5, 13.6, -15.2).
 *  4. WALK the hall front cornice west to the west aisle roof (y 13.5), or drop through the
 *     hall's great south doorway (x ±4, y 0..9) to the hypostyle floor.
 *  5. INSIDE THE HALL: pole climb any of the 12 papyrus columns; the aisle architrave
 *     circuit (y 13.5) and the interior tiptoe cornice (y 10.0) ring the whole room. The
 *     taut cable at y 12.6 crosses the nave diagonally as a `rail`.
 *  6. NORTH END: walk out of the hall through the inner pylon gate (x ±3, y 0..7.6) at
 *     z -52 onto the descent landing (0, 0, -57).
 *  7. TOMB DESCENT: flight A drops west 0 -> -5.6, landing, flight B drops east -5.6 -> -12,
 *     arriving on the vault floor at (0.4, -12, -57.6). Both flights `ground`, cheek
 *     balustrades `rail`.
 *  8. Through the vault gate doorway at (0, -12, -59.2) into the pillared crypt and north
 *     to the SARCOPHAGUS at (0, -12, -72).
 *
 *  ALTERNATE (stealth): from the hall's north-west corner, CRAWL the `vent` at
 *  (-21, 0, -49.5). It slopes down to y -3.1, turns east, and opens onto the vault's west
 *  shelf at (-14, -3.2, -63). Shelves at y -3.2 / -6.4 / -9.4 ledge-drop to the floor,
 *  bypassing the stair entirely.
 *
 *  ROOFTOP RUN (the §8.6 payoff line, west -> east across the whole complex):
 *    east entry pylon top (14, 26.6, 34)  ->  RAIL 'pylon-drop' down to the east peristyle
 *    architrave (22.6, 9.2, 27)  ->  RAIL WALK / tiptoe the y = 9.0 ledge ring north to
 *    (23, 9, -13)  ->  WALL RUN the hall's south-east return and ledge-climb to the east
 *    aisle roof (y 13.5)  ->  run north to z -50  ->  SPIRE LAND the east pinnacle tip
 *    (16, 21, -50)  ->  double jump to the nave deck (y 17, rails at x ±11.4)  ->  north to
 *    the inner pylon, WALL RUN its battered south face  ->  SPIRE LAND (6, 27, -50)  ->
 *    the y 26 south stage  ->  wall jump to the pylon summit deck (y 34): the highest point
 *    in the level, whole complex and both pyramids in frame.
 *
 *  RAIL ENTRY (§8.1 "first rail slide down into the complex"): rail 'approach' runs from the
 *  ridge anchor mast (10, 15.4, 61) down the peristyle's east flank to a newel post on the
 *  colonnade's south-east return architrave at (20.7, 9.8, 31.8) — landing the player on the
 *  y = 9.0 ledge circuit, which the rooftop run then continues north. Routed east because the
 *  entry-axis corridor is where every character camera and `courtyard` itself stand; scored
 *  against all fifteen with `tools/railroute.mjs`.
 * =============================================================================
 */

/* ---- the §8.1 numbers, in one place so they can be checked against the table ---- */
export const L = {
  court:   { x0: -26, x1: 26, z0: -16, z1: 34, y: 0 },
  obelisk: { x: 0, z: 11, base: 2.6, h: 22 },
  terrace: { s1: { x: 9.4, z0: 2.6, z1: 19.4, y: 2.0 }, s2: { x: 6.6, z0: 5.4, z1: 16.6, y: 5.2 } },
  kiosk:   { x: 3.4, z0: 7.4, z1: 14.6, top: 9.0 },
  colossi: { x: 9.5, z: 25, plinth: 2.0, knee: 4.5, h: 13 },
  pylon:   { x: 14, z: 34, w: 11, d: 6, h: 26 },
  peri:    { x: 23, z0: -14, z1: 32, ledge: 9.0 },
  hall:    { x0: -24, x1: 24, z0: -52, z1: -16, nave: 8.8, aisleRoof: 13.5, naveRoof: 17.0 },
  clere:   { y: 15.5, w: 2.8, h: 1.3, zs: [-20, -28, -36, -44] },
  inner:   { x: 0, z: -52, w: 22, d: 7, h: 34, stage: 26 },
  tomb:    { x0: -14, x1: 14, z0: -78, z1: -56, floor: -12, ceil: -2, sarc: [0, -12, -72] },
  pyr1:    { x: -150, z: -190, base: 148, h: 105 },
  pyr2:    { x: 95, z: -250, base: 104, h: 72 },
};

const D = THREE.MathUtils.degToRad;

/* ============================ small helpers ============================ */

/**
 * One built mass. Chamfered by default: a plain box has a single normal per face, so the
 * 3-band cel ramp puts the whole face in one band and the frame ends up with no terminator
 * on it anywhere. `c: 0` opts out where the piece is small, far, or fully buried.
 */
function box(A, zone, mat, w, h, d, x, y, z, o = {}) {
  const c = o.c ?? 0.05;
  const args = { rng: A.rng, jitter: o.jitter ?? 0.018, chip: o.chip ?? 0, taper: o.taper ?? 0 };
  const g = c > 0
    ? K.chamferBox(w, h, d, { ...args, c, only: o.only ?? 'all' })
    : K.block(w, h, d, args);
  K.place(g, { x, y, z, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0 });
  A.add(zone, mat, K.boxProjectUVs(g));
  return g;
}

/** Axis-aligned volume from extents — reads closer to the §8.1 table than w/h/d does. */
function vol(A, zone, mat, x0, x1, y0, y1, z0, z1, o = {}) {
  return box(A, zone, mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
}

/**
 * World y of TERRAIN's sand at (x, z), or 0 if TERRAIN is not up yet.
 *
 * Everything in this file is authored against y = 0, which is right inside the stylobate —
 * paving slabs define that floor. Outside it there is no paving, only sand, and the sand is
 * not flat: measured against `Terrain.heightAt`, the pylon-corner rubble spill was scattered
 * between 46 cm buried and 18 cm airborne, the mastaba field had one block 7.6 m under the
 * dune and four floating 4.2–4.6 m above it, and the near pyramid's whole footprint hung
 * ~4 m clear of the ground. None of that is visible from the source; all of it is visible
 * in a frame.
 *
 * `heightAt` is safe to call before TERRAIN's own init(): the cache is empty at that point,
 * so it falls through to the analytic field and returns the same surface, just slower.
 * Registration order in main.js puts terrain before architecture, so it resolves.
 */
function sand(A, x, z) {
  const t = A.engine.get?.('terrain');
  return typeof t?.heightAt === 'function' ? t.heightAt(x, z) : 0;
}

/** Lowest sand height over a footprint — bed a mass into the dune instead of tipping it. */
function sandFloor(A, x, z, halfW, halfD = halfW, n = 3) {
  let lo = Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      lo = Math.min(lo, sand(A, x + (i / n * 2 - 1) * halfW, z + (j / n * 2 - 1) * halfD));
    }
  }
  return Number.isFinite(lo) ? lo : 0;
}

/** Highest sand height over a footprint — the companion to sandFloor, for decks that must
 *  clear a slope rather than bed into it. */
function sandCeil(A, x, z, halfW, halfD = halfW, n = 3) {
  let hi = -Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      hi = Math.max(hi, sand(A, x + (i / n * 2 - 1) * halfW, z + (j / n * 2 - 1) * halfD));
    }
  }
  return Number.isFinite(hi) ? hi : 0;
}

function groundProxy(A, x0, x1, y, z0, z1, opts = {}) {
  const t = opts.thick ?? 1.0;
  A.proxy(new THREE.BoxGeometry(x1 - x0, t, z1 - z0),
    { tag: 'ground', material: opts.material || 'stone', ...opts },
    { x: (x0 + x1) / 2, y: y - t / 2, z: (z0 + z1) / 2 });
}

function ledgeProxy(A, x0, x1, y, z0, z1, opts = {}) {
  const t = opts.thick ?? 0.5;
  A.proxy(new THREE.BoxGeometry(Math.max(0.3, x1 - x0), t, Math.max(0.3, z1 - z0)),
    { tag: 'ledge', material: 'stone', climbable: true, ...opts },
    { x: (x0 + x1) / 2, y: y - t / 2, z: (z0 + z1) / 2 });
}

function wallProxy(A, x0, x1, y0, y1, z0, z1, opts = {}) {
  A.proxy(new THREE.BoxGeometry(Math.max(0.25, x1 - x0), y1 - y0, Math.max(0.25, z1 - z0)),
    { tag: 'wall', material: 'stone', climbable: true, ...opts },
    { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 });
}

function poleProxy(A, x, z, y0, y1, r, opts = {}) {
  const m = A.proxy(new THREE.CylinderGeometry(r, r, y1 - y0, 8, 1),
    { tag: 'pole', material: 'stone', climbable: true, ...opts },
    { x, y: (y0 + y1) / 2, z });
  m.userData.axis = new THREE.Vector3(0, 1, 0);
  m.userData.top = y1; m.userData.bottom = y0;
  A.api.poles.push({ pos: new THREE.Vector3(x, y0, z), top: y1, r });
  return m;
}

/* ===================== wall handholds (the notch tag) ==================== */

/**
 * The tag KNOWN_ISSUES §357.2 declined a sustained wall climb for the want of, and the visible
 * object that makes it a route you can SEE rather than data you have to be told about.
 *
 * ── The problem, measured, not recalled ───────────────────────────────────────────────────
 * This level registers **75 `wall` recs and all 75 carry `climbable: true`** (counted off the
 * shipped build, not off the source). The flag therefore carries zero bits: no consumer —
 * MOVEMENT, the camera's route sensor, the HUD's affordance prompt, FX's §2.1.6 sparkle — can
 * tell a face with something to hold from thirty-six metres of blank hall wall. That is the
 * whole of §357.2's "no tag distinguishes a handhold from a blank wall", and it is why the
 * declined-not-deferred verdict there was the right one: **no state should be stubbed against a
 * tag nothing sets.** This sets it.
 *
 * ── What a notch IS, from the reference ───────────────────────────────────────────────────
 * `Scripts/wall_notch.gd` in NoahChase/Sly-Cooper--A-Thief-in-Godot (HEAD 6479957, cloned at
 * /home/user/ref-godot; **licence: none stated** — no LICENSE, no COPYING, no licence section,
 * checked in its tree, and it is fan work derived from Sucker Punch/Sony, exactly as
 * `public/assets/sly-godot/PROVENANCE.md` records for the mesh import). Adapted, not pasted:
 * that file is a Godot `Node3D` with an `Area3D` trigger, a `Target Point` child, `magnet_force`
 * and `jump_mult`, and it drives a `player.state == ON_TARGET` handoff. None of that transfers.
 * What transfers is the **authoring shape**, and it is the part that matters:
 *
 *   a notch is a DISCRETE POINT placed on a wall face, at an authored height,
 *   with an authored onward jump — it is not a property of the wall body.
 *
 * So this publishes points, one per rung, each with the outward normal of the face it sits on.
 * A boolean on `wallProxy` would have been the wrong shape: `proxyBattered` for the east entry
 * pylon is ONE rec covering all four faces over 25.6 m, and "this box is climbable" is exactly
 * the non-information the existing `climbable: true` already is.
 *
 * ── Where the pitch comes from (derived, not chosen) ──────────────────────────────────────
 * From this project's own numbers, not from a feel. `Controller.TUNE`: `jumpV0` 11.0,
 * `wallJumpUp` 0.94, `gravity` −24. A wall jump leaves a hold at 11.0 × 0.94 = 10.34 m/s and
 * apexes v²/2g = **2.2274 m** above it. `WallCling.canEnter` refuses while `velocity.y > 1.2`,
 * and v.y falls to 1.2 at (v² − 1.44)/2g = **2.1974 m**. So 2.1974 m is the highest a hold can
 * be and still be *catchable on the way up by one plain wall jump*, with no double jump spent
 * and no head-on run needed. `pitch` 2.10 sits 0.0974 m under that gate and 0.1274 m under the
 * apex, so arrival is always still rising. Every one of those five numbers is in `Controller.js`
 * and none of them is mine.
 *
 * ── The two niches are staggered by half a pitch, and that is the design ──────────────────
 * The pylon's south face already carries two flagstaff niches (`entryPylons`, `openings` face 0
 * — face 0 is +Z, which on a temple laid out along −Z is the SOUTH, approach elevation, exactly
 * where a real pylon puts them). Fitting both with rungs at the same heights would be two
 * parallel ladders to the same deck. Offsetting one by `pitch / 2` makes the pair read as a
 * single climbing line that zig-zags up the elevation — which is both how a route reads at
 * `dunes` range and how the Sly games actually lay notches out.
 *
 * ── What this deliberately does NOT do ────────────────────────────────────────────────────
 *  · **No state.** §6's move list has no wall climb; MOVEMENT owns that decision and that file.
 *    Nothing in `src/player/` reads `api.handholds` or `rec.handholds` today, so this is inert:
 *    the shipped moveset behaves identically with it and without it.
 *  · **No collider.** A rung registered as its own rec would be a *different* rec from the pylon
 *    face, so `Controller.wallSpent`'s "one face, one bite" would not fire on it and the level
 *    would have shipped a de-facto free climb up 21 m — which is precisely the exploit §357.1
 *    closed and precisely the decision that is not mine to take. The corbels are drawn geometry
 *    and nothing else; `arch._colliders` is unchanged, so guard line-of-sight is unchanged too.
 *  · **No magnetism target.** `tests/level.test.mjs` requires every authored `arrive` to name a
 *    state in `buildMoveset()`, and there is no wall-hold state to name. Authoring one against
 *    `spireLand` would make the tag a lie about which move it belongs to.
 *  · **No rng draw.** The whole level shares one stream and a single extra draw re-shuffles every
 *    block placed afterwards (`Kit.masonryShell` records the same hazard). `chamferBox` makes no
 *    draws when it is handed no `rng`, so every existing block stays bit-identical.
 */
const NOTCH = {
  /** Rung pitch, m. (jumpV0 · wallJumpUp)² / 2g = 2.2274 apex; cling gate at 2.1974. */
  pitch: 2.10,
  /** The gate the pitch is derived against, kept here so the derivation is checkable. */
  clingGate: 2.1974,
  /** How far the corbel stands proud of the wall's own face plane, m. */
  out: 0.17,
  width: 0.74,
  /**
   * How far below its rung the acquisition point puts Sly's FEET: `Controller.TUNE.hangReach`,
   * so his hand lands exactly on the hold.
   *
   * This was 0.99 — `height × 0.55`, the height `probeWall` fires its ray from — and that was
   * wrong for a reason worth keeping. It put the hand 0.57 m ABOVE the rung, and `WallClimb
   * .find()` measures hold-to-HAND against `reach()` = `radius + jumpV0·wallJumpUp/30` =
   * 0.6847 m. hypot(0.55, 0.57) = **0.7921 m**, so `find()` returned null at the one point the
   * whole route is entered from and the climb state could not fire. Measured, not reasoned:
   * the real `Controller` flown at the real level took **0 of 23 rungs**.
   */
  drop: 1.56,
  /**
   * Standoff from the face plane, and it is pinned between three inequalities rather than
   * chosen. Upper bound `WallClimb.reach()` 0.6847 (the hand must be able to find the hold).
   * Lower bound is NOT `radius` 0.34: the face is battered, so it leans out toward Sly as it
   * descends, and the binding point is his feet a whole `hangReach` below the hand — the capsule
   * is only clear of the stone at `radius + batter × hangReach` = 0.34 + 0.105 × 1.56 =
   * **0.5038 m**. 0.55 sits in a window 0.18 m wide, clearing the wall by 0.046 and the reach by
   * 0.135. `probeWall`, firing 0.57 m below the rung where the face is 0.060 m nearer, sees
   * 0.490 m against its 0.74 m reach.
   */
  standoff: 0.55,
};

/**
 * One laddered flagstaff niche: `rungs` bronze corbel brackets up a battered face, plus the
 * spec for each. Returns the specs; the caller passes them to `A.proxy` as `handholds` so the
 * wall rec carries its own holds, and they also land on `A.api.handholds`.
 *
 * The two coordinate laws here are the ones that make the rung land ON the niche instead of
 * beside it, and both are read off the code that builds the mass rather than eyeballed:
 *
 *   · `Kit.masonryShell` scales an opening's along-axis span with the course
 *     (`oScale = face.len / face.len0`), so a niche authored at a = ±3.4 on an 11 m footprint
 *     walks inward with the batter. Without the same scaling a rung at 21 m would sit 1.36 m
 *     off the niche it is supposed to be in.
 *   · `Kit.proxyBattered` is a linear frustum, so the collider's +Z plane is exactly
 *     `cz + d/2 − batter·y`, and its outward normal is `(0, batter, 1)` normalised — tilted up
 *     by the batter, |n.y| = 0.104 for the pylon, comfortably inside `TUNE.wallNormalMax` 0.45,
 *     so these faces do still read as walls to `probeWall`.
 *
 * `point` is published on the COLLIDER's plane, not on the corbel's proud outer face: that is
 * the plane `Controller.probeWall` reports, so a consumer comparing a contact against a hold is
 * comparing like with like. The corbel is what the player sees; the point is where the hold is.
 */
function notchLadder(A, { id, zone, cx, cz, w, d, batter, a, ys }) {
  const specs = [];
  const nz = 1 / Math.hypot(batter, 1);
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    const oScale = (w - 2 * batter * y) / w;      // masonryShell's own opening scaling
    const x = cx + a * oScale;
    const zf = cz + d / 2 - batter * y;           // proxyBattered's +Z plane at this height
    /* Bronze, and the choice is not decoration. Every rail in this level, both hook-cable
       masts, the approach newel and the chain links are `bronze_dark`; it is already this
       level's "you can touch this" material, and it is already in both the `court` and `pylon`
       buckets, so a ladder made of it joins the existing route vocabulary and costs zero extra
       draw calls. A flagstaff niche's own fittings were metal anyway. */
    const g = K.chamferBox(NOTCH.width, 0.16, 0.46, { c: 0.03, taper: -0.14 });
    K.place(g, { x, y, z: zf + NOTCH.out - 0.23 });
    A.add(zone, 'bronze_dark', K.boxProjectUVs(g));
    /* A stub pin back into the stone, so the bracket is built into the wall rather than glued
       to it — the same argument the approach rail's newel post is authored under. */
    const pin = K.chamferBox(0.15, 0.15, 0.5, { c: 0.02 });
    K.place(pin, { x, y: y + 0.02, z: zf - 0.22 });
    A.add(zone, 'bronze_dark', K.boxProjectUVs(pin));

    const spec = {
      id: `${id}-${i}`,
      point: new THREE.Vector3(x, y, zf),
      normal: new THREE.Vector3(0, batter * nz, nz),
      /* The collider this hold sits on, filled in by the caller once the proxy exists.
         `Architecture.proxy` hands back the mesh rather than the rec, so this is the mesh —
         which is what a consumer holding a `collision.query()` hit compares against
         (`hit.rec.mesh === spec.mesh`). The rec's own copy is `rec.handholds`. */
      mesh: null,
      rung: i, pitch: NOTCH.pitch, face: 'south',
    };
    specs.push(spec);
    A.api.handholds.push(spec);
  }
  return specs;
}

function spirePoint(A, x, y, z) {
  const p = new THREE.Vector3(x, y, z);
  const m = A.proxy(new THREE.ConeGeometry(0.5, 1.2, 5),
    { tag: 'spire', material: 'stone' }, { x, y: y - 0.6, z });
  m.userData.point = p.clone();
  A.api.spires.push(p);
  return m;
}

function hookPoint(A, x, y, z) {
  const p = new THREE.Vector3(x, y, z);
  const m = A.proxy(new THREE.SphereGeometry(0.55, 8, 6), { tag: 'hook', material: 'metal' }, { x, y, z });
  m.userData.point = p.clone();
  A.api.hooks.push(p);
  return m;
}

/* ===================== authored traversal magnetism ====================== */

/**
 * Target magnetism (src/player/Targets.js) is a **level-authoring** system with no content.
 * With an empty registry `acquire()` returns null and `toTarget.canEnter` is false: zero
 * behavioural delta until a level says which points deserve it. This is that decision, and it
 * is level design, not plumbing.
 *
 * ── The rule I authored to ────────────────────────────────────────────────────────────────
 * A traversal point earns magnetism when all three hold. Points that fail any one are left
 * alone, and the ones this level has are named below with the measurement that excluded them.
 *
 *   1. **It is only ever reached in flight, and it is a point, not a surface.** A ledge, a
 *      deck, a stair or a roof is metres wide and already has §6's own 0.45 m `ledgeSnap`;
 *      a 0.62 m ring or a pyramidion tip is not.
 *   2. **A miss is expensive.** The fall costs the route, not a step. Measured as the drop
 *      from the point to whatever catches you.
 *   3. **The error is timing, not aim.** Chain beats are metronomic — release, fly, catch —
 *      which is exactly the 140 ms the input layer already forgives with `jumpBufferMs`.
 *
 * ── What that admits, and what it excludes ────────────────────────────────────────────────
 * ADMITTED — 11 hook rings (both courtyard chains) and 3 of the 5 spire tips.
 *
 * EXCLUDED, with the number that excluded it:
 *   · **The two pylon-stage spires (±6, 27, −50).** They stand on `stageTop = 26.0`, which
 *     carries a `groundProxy` over x −8…8, z −51.1…−47.8 — the tips are **1.0 m above ground
 *     you are standing on**. Miss and you are still on the stage. That is decoration, not a
 *     traversal beat, and rule 2 fails outright. The other three spires stand on *poles*
 *     (obelisk 20.4, aisle pinnacles 19.5), with nothing under them but the drop.
 *   · **Every pole.** `poleMount` is 1.9 m and a column is r 1.4–1.9; you cannot miss it.
 *   · **Every rail.** A rail is a line, not a point: `railMount` 1.35 already auto-engages on
 *     contact from above along its *whole length*, which is a comparable radius spread over
 *     tens of metres instead of concentrated at one place. Rule 1.
 *   · **Every ledge, deck, cornice and roof** — rule 1.
 *
 * ── `catch` — the specificity gate, and the only number here that is widened ──────────────
 * `catch` is the widest ballistic miss a point will rescue. Its shipped default is
 * `Controller.TUNE.magCatch` = `runSpeed × jumpBufferMs` = 7.2 × 0.140 = **1.008 m**: the
 * distance the player's own body travels during the window the input layer already forgives.
 * That sentence is the whole justification, and widening it means keeping the sentence and
 * changing the speed in it — never loosening the sentence.
 *
 * A hook chain is the one place in this level where the speed in that sentence is not
 * `runSpeed`. The error on a chain is **release timing on a pendulum**, and during those same
 * 140 ms a body on our L = 2.2 m rope at its characteristic speed √(2·|g|·L) = √105.6 =
 * 10.2762 m/s travels **1.4387 m** along the arc. So the chain rings carry `catch` 1.4387 —
 * 1.427× the default, from our own gravity and our own rope, not from a feel.
 *
 * It goes on **every** ring, not just the interior ones. The first draft gave a chain's end
 * rings the run-speed default on the theory that a chain is *entered* by a jump and only
 * *continued* by a release; the level's own topology refutes it — both chains are traversed in
 * both directions, so every ring including both ends has a neighbour it is released from. The
 * spires are entered by a jump off a pole top and keep the default. **Nothing in this level
 * carries a catch above 1.4387 m**, and nothing rescues a 3 m miss.
 *
 * ── `point` — the ring, and why it may not be the hang position ───────────────────────────
 * `HookSwing.enter` puts Sly on the sphere of radius `hookL` = 2.2 m around the anchor, so the
 * obvious authoring is `ring − (0, 2.2, 0)`: the taut-rope position, "where Sly ends up".
 * **That version is a lock-up, and the headless run in `tests/level.test.mjs` found it.** At
 * the moment you release a swing you are standing on that sphere — at the bottom of the arc,
 * *on* the hang point — so the ring you just launched from re-acquires you on the release
 * frame and flies you back to it. Forever.
 *
 * The constraint that falls out is worth stating as a rule: **the point must be at least
 * `catch` from every position on its own release sphere**, i.e. `|hookL − drop| ≥ catch`. With
 * hookL 2.2 and catch 1.4387 that allows a drop of at most 0.76 m — thin enough that the only
 * honest place for the point is the ring itself, `drop = 0`, which sits a clear 2.2 m from
 * every release position. `catch < hookL` is therefore a hard invariant of this level and the
 * test asserts it.
 *
 * It has a second payoff: the point then coincides with the collider's own `userData.point`,
 * so §2.1.6's sparkle (which FX draws from the COLLISION affordance query) and the magnet mark
 * the same spot. A target that did not sit on its affordance would be a promise made in one
 * place and kept in another. The test asserts that too, for all 14.
 *
 * The cost is real and belongs to MOVEMENT, not here: arriving at the ring centre and then
 * handing off to `HookSwing` teleports Sly 2.2 m straight down as the rope goes taut. That is
 * a `HookSwing.enter` problem (a degenerate `position − anchor`), it already happens on any
 * dead-centre auto-grab, and it is written up as a diff request rather than papered over by
 * authoring the point somewhere it cannot safely go.
 *
 * ── `volume` ──────────────────────────────────────────────────────────────────────────────
 * `magVolume` 3.30 m (half a full-speed jump's reach), except the lower chain: its tightest
 * ring gap is 6.36 m and two 3.30 spheres would overlap there. The rule is that two trigger
 * volumes must be separated by at least one `magSnapRadius` (0.20625 m — the smallest distance
 * this system resolves) of clear air, which caps the lower chain at (6.36 − 0.20625)/2 = 3.077.
 * `tests/level.test.mjs` asserts the whole registry against that rule pairwise.
 */
export const MAG = {
  /** Controller.TUNE.magCatch: runSpeed 7.2 × jumpBufferMs 0.140. Spires. */
  catchJump: 1.008,
  /** √(2 · 24 · hookL 2.2) × jumpBufferMs 0.140 — the same sentence at pendulum speed. Rings. */
  catchSwing: 1.4387,
  /** Controller.TUNE.magVolume. */
  volume: 3.30,
  /** Lower chain: (tightest ring gap 6.36 − magSnapRadius 0.20625) / 2 = 3.0769. */
  volumeLow: 3.07,
  /** §6 hook pendulum length. `catchSwing < hookL` is the no-self-recapture invariant. */
  hookL: 2.2,
  /** §6: "spire land — jump from it gets ×1.25 height". A target standing in for a spire must
   *  carry the same multiplier or the assist would quietly nerf the move it exists to enable. */
  spireJumpMult: 1.25,
};

/**
 * Register one authored point. The spec goes on `A.api.targets` **and** onto the bus.
 *
 * Both, because of a boot-order fact worth writing down: `main.js` MANIFEST puts
 * `architecture` 6th and `movement` 11th, and `Controller.init()` is where the
 * `registerTarget` listener is installed — so an emit from the level build has no listener yet
 * and `Engine.emit` drops it silently. The emit is kept because it is the documented authoring
 * path and it is correct the moment anything is listening; `api.targets` is what actually
 * survives the gap, and FX (15th, after MOVEMENT) flushes it. See the report's diff request
 * for the proper fix — a queue in Controller mirroring `Engine._colliderQueue`.
 */
function magnet(A, spec) {
  (A.api.targets || (A.api.targets = [])).push(spec);
  A.engine?.emit?.('registerTarget', spec);
  return spec;
}

/** A hook ring's magnetism point: the ring itself. See the `point` section above. */
function swingTarget(A, id, x, y, z, volume = MAG.volume) {
  return magnet(A, {
    id,
    point: new THREE.Vector3(x, y, z),
    volume,
    catch: MAG.catchSwing,
    group: 'swing',
    arrive: 'hookSwing',
    userData: { kind: 'hook' },
  });
}

/**
 * The mouth of a wall route: a `group: 'notch'` target that hands off to `wallCling`.
 *
 * ── Why exactly one, and why it is the right one ──────────────────────────────────────────
 * A vertical route wants a whole stack of these, and this level can author precisely one. The
 * binding constraint is not taste, it is arithmetic, and it should be read before anyone
 * "fixes" the count:
 *
 *   `tests/level.test.mjs` — "every authored point sits on a registered affordance, not in
 *   mid-air" — requires every target's `point` to be within 1e-6 m of some **collider's**
 *   `mesh.userData.point`. One mesh carries one point, so N targets need N point-carrying
 *   colliders. The east pylon's whole south elevation is ONE `proxyBattered` rec, so it can
 *   carry one. Registering 22 more would take ARCHITECTURE + PROPS from 272 collider
 *   registrations to 294, and `tests/basketvary.test.mjs:79` seals that total at 272. Moving a
 *   sealed bar so one's own change passes is what §141.1 forbids, so the count stands and the
 *   blocker is reported rather than worked around.
 *
 * That constraint turns out to describe the right architecture anyway, which is the only reason
 * this is authored at all rather than deferred: **magnetism is the acquisition, `rec.handholds`
 * is the continuation.** Getting onto a wall out of a jump is the beat that needs assistance —
 * it is a point, in flight, and a miss costs the whole ascent, which is the three-part test at
 * `MAG`. Moving between rungs once you are already clung to the face is a climb, and a climb
 * wants a state reading the published ladder (TRAVERSAL's `WallClimb`, priority 79, against
 * `rec.handholds`), not 23 trigger spheres 1.05 m apart — which the pairwise volume rule could
 * not admit in any case: at that spacing the widest legal volume is
 * (1.05 − magSnapRadius 0.20625) / 2 = 0.42 m, an eighth of `magVolume`.
 *
 * ── Where the point goes, and why it is not on the rung ───────────────────────────────────
 * The rung is where Sly's HANDS are; a target point is where his capsule ORIGIN — his feet —
 * ends up. Two offsets, both read off `Controller`:
 *
 *   · down by `height × 0.55` = 1.80 × 0.55 = **0.99 m**, which is the exact height
 *     `probeWall` fires its ray from. Put the feet there and the ray that has to find the wall
 *     leaves at the rung's own height rather than a metre off it.
 *   · out by **0.55 m** along the face's horizontal normal. `probeWall` reaches
 *     `radius 0.34 + wallProbe 0.40` = 0.74 m, and the capsule needs `radius` 0.34 of that just
 *     to not be inside the stone. 0.55 leaves 0.21 m of clear air outside the capsule and
 *     0.19 m of probe margin — centred in a window only 0.40 m wide.
 *
 * `arrive: 'wallCling'` was unreachable as a handoff until `a3c2309`; `ToTarget`'s probe hid
 * behind a null current state whose `sm.group` falls back to `'ground'`, and `WallCling.canEnter`
 * opens `if (c.grounded || c.sm.group !== 'air') return false`. Nothing in the level named it, so
 * the fix cost no behaviour — it bought the authoring surface this uses.
 *
 * ── What is NOT set, deliberately ─────────────────────────────────────────────────────────
 * No `jumpMult`. `wall_notch.gd` carries `jump_mult` (its default is 2) and `TargetPoint`
 * supports it, but §6 has no authored wall-notch multiplier the way it has "spire land — jump
 * from it gets ×1.25", and inventing a balance number for a move MOVEMENT has not shipped yet
 * would be this file deciding something that is not its to decide. `catch` stays the derived
 * default 1.008 — nothing in this level rescues a wider miss than the chain's 1.4387.
 */
function notchTarget(A, id, mesh, hold) {
  const pt = new THREE.Vector3(
    hold.point.x,
    hold.point.y - NOTCH.drop,
    hold.point.z + Math.sign(hold.normal.z || 1) * NOTCH.standoff,
  );
  /* The collider carries the same point the target does — `tests/level.test.mjs` asserts the
     coincidence, and the reason it asserts it is that §2.1.6's marker is drawn from COLLISION's
     affordance query.

     This does more than satisfy the test, and the extra is worth knowing before anyone moves
     it: `Collision._buildAffordances` takes its point branch on `ud.point` for ANY tag (the
     `hook`/`spire` test beside it only governs deriving one from bounds), so this single line
     promotes the east pylon's whole south elevation from a BOX affordance to a POINT one.
     `query('wall')` on that rec now answers with the notch instead of with the nearest bit of a
     25.6 m box that slides as the player walks. Checked before relying on it: nothing outside
     `src/world/` reads a `wall` affordance at all — `wall` is in none of CameraRig's
     `ROUTE_TAGS`, HUD's `AFF_TAGS` or FX's `sparkleTags` — and `Controller.probeWall` goes
     through `raycast` against the BVH, which is a different structure and is untouched. So the
     promotion is free today, and it is what would make `wall` safe to sparkle tomorrow. */
  mesh.userData.point = pt.clone();
  return magnet(A, {
    id,
    point: pt,
    volume: MAG.volume,
    catch: MAG.catchJump,
    group: 'notch',
    /**
     * `wallClimb`, and it was `wallCling` until the loop was walked with the real controller.
     *
     * `wallCling` was the only wall state that existed when this was authored; `WallClimb`
     * (priority 79) landed afterwards in `4aaedeb`. Handing off to the cling is not merely
     * suboptimal, it **terminates the route**: `WallCling.update`'s only jump exit is
     * `'wallJump'`, and `WallJump.enter` throws Sly off the face at `wallJumpOut` 7.2 m/s — 3.1 m
     * clear of the wall by its own apex — where no hold is within `WallClimb.find()`'s 0.685 m.
     * Flown for 1400 frames with the stick held into the face and jump mashed, the shipped
     * chain was `toTarget → wallCling → wallJump → doubleJump → fall`, taking **0 of 23 rungs**.
     * `WallClimb`'s jump goes straight UP the face instead (`velocity.set(-n·0.9, 10.34, -n·0.9)`
     * — a light press *into* the stone), which is what makes the ladder a ladder.
     */
    arrive: 'wallClimb',
    mesh,
    userData: { kind: 'notch', rung: hold.rung, hold: hold.id },
  });
}

/** A spire tip that stands on a pole rather than on a deck. */
function spireTarget(A, id, x, y, z) {
  return magnet(A, {
    id,
    point: new THREE.Vector3(x, y, z),
    volume: MAG.volume,
    catch: MAG.catchJump,
    jumpMult: MAG.spireJumpMult,
    group: 'swing',
    arrive: 'spireLand',
    userData: { kind: 'spire' },
  });
}

/**
 * The Egyptian torus door-frame: a roll moulding up both jambs and across the head.
 *
 * An opening cut by dropping blocks leaves a raw hole whose edges are the blocks' side faces —
 * flat, and identical in value to the wall around them, so the biggest dark shape in the frame
 * has no edge on it. Three cylinders give it a continuous lit line, and a cylinder is one of
 * the few shapes in the level with a real normal gradient for the cel ramp to band across.
 */
function doorFrame(A, zone, mat, { halfW, y0, y1, z, r = 0.26, x = 0 }) {
  const R = A.rng;
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(r * 0.94, r, y1 - y0 + r, 14, 1, true);
    K.normaliseAttrs(g);
    A.add(zone, mat, K.boxProjectUVs(K.place(g, {
      x: x + sx * (halfW + r * 0.75), y: y0 + (y1 - y0 + r) / 2, z, rz: D(R.jitter(0.4)),
    })));
  }
  const head = new THREE.CylinderGeometry(r, r, 2 * (halfW + r * 1.5), 14, 1, true);
  K.normaliseAttrs(head);
  // Sit the head roll just *under* the opening's head, not above it: above it is where the
  // lintel already is, and a roll buried in a lintel is triangles nobody sees.
  A.add(zone, mat, K.boxProjectUVs(K.place(head, { x, y: y1 - r * 0.5, z, rz: Math.PI / 2 })));
}

/**
 * Build a rail: the visible tube goes into the zone's merge bucket like everything else, and
 * the spline MOVEMENT snaps to rides on an invisible collider. A rail used to be its own mesh
 * purely so it could carry `userData.spline`, which cost a draw call in the colour pass and
 * three more in the shadow cascades — for a 14 cm tube whose shadow is a thread.
 */
/**
 * A catenary between two anchors — the curve a rope actually hangs in, which is not the curve a
 * Catmull-Rom through hand-placed waypoints gives you.
 *
 * `y = a·cosh(x/a)`, with `a` solved for the requested mid-span sag by bisection: sag is
 * `a·(cosh(L/2a) − 1)`, monotonically decreasing in `a`, so 60 halvings put it well inside
 * float precision. Endpoints are level here, which is the case this level has; a skewed
 * catenary would need the full two-parameter solve and there is nothing asking for one.
 *
 * Why it matters, and it is not the look: the traversal lane measured a rider on a 21.07 m
 * catenary with 3 m of sag **accelerating from 9.66 to 14.07 m/s into the dip and being slowed
 * to 6.54 m/s climbing out the far side — rope physics, out of the shipped rail code, with no
 * new mechanic.** A polyline of waypoints does not produce that; the second derivative has to be
 * right along the whole span or the rider gets a sequence of flat runs and corners.
 */
function catenary(a0, b0, sag, seg = 24) {
  const A0 = new THREE.Vector3(...a0), B0 = new THREE.Vector3(...b0);
  const L = Math.hypot(B0.x - A0.x, B0.z - A0.z);
  if (!(sag > 1e-4) || L < 1e-4) return [a0, b0];
  let lo = 1e-3, hi = 1e4;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (m * (Math.cosh(L / (2 * m)) - 1) > sag) lo = m; else hi = m;
  }
  const a = (lo + hi) / 2;
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = (t - 0.5) * L;
    const dip = a * (Math.cosh(x / a) - Math.cosh(L / (2 * a)));   // 0 at both ends, −sag at mid
    out.push([
      A0.x + (B0.x - A0.x) * t,
      A0.y + (B0.y - A0.y) * t + dip,
      A0.z + (B0.z - A0.z) * t,
    ]);
  }
  return out;
}

function rail(A, name, pts, matKey = 'granite_pink', r = 0.16, zone = 'court', rec = null) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.35);
  // 8 radial segments, not 5: a rail is a hero traversal affordance seen at arm's length in
  // `traversal`, and a pentagonal tube has five flat faces and no terminator.
  const geo = K.railGeo(curve, { r, seg: Math.max(20, Math.round(curve.getLength() * 1.1)), rad: 8 });
  A.add(zone, matKey, geo);
  const box = new THREE.Box3().setFromPoints(curve.getPoints(24));
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const proxy = A.proxy(
    new THREE.BoxGeometry(Math.max(0.3, size.x), Math.max(0.3, size.y), Math.max(0.3, size.z)),
    { tag: 'rail', material: matKey === 'rope_fibre' ? 'cloth' : 'metal', ...(rec || {}) },
    { x: mid.x, y: mid.y, z: mid.z });
  proxy.userData.spline = curve;
  proxy.name = `rail:${name}`;
  A.api.rails.push({ name, curve, ...(rec || {}) });
  return curve;
}

/* ====================== where the detail is spent ======================= */

/**
 * The ten §7.2 cameras, in world space. Kept here rather than imported from `core/Shots.js`
 * so the level does not depend on the shot list at build time — but they are the same numbers
 * and they should be checked against it if a shot ever moves.
 */
const CAMS = [
  [8.9, 10.28, 17.2],    // hero
  [3.5, 2.6, -19.0],     // temple
  [-1.6, 1.45, 33.2],    // sly-closeup
  [-19.0, 5.6, 30.0],    // courtyard
  [26.0, 19.5, 84.0],    // dunes
  [3.2, -9.2, -60.0],    // interior
  [-11.0, 8.4, 22.0],    // night
  [12.0, 14.0, 6.0],     // traversal
  [4.6, 2.35, 31.4],     // combat
  [-11.5, 2.05, 25.4],   // guard
];

/** Distance from (x, y, z) to the nearest canonical camera. */
function camDist(x, y, z) {
  let best = Infinity;
  for (const [cx, cy, cz] of CAMS) {
    const d = Math.hypot(cx - x, cy - y, cz - z);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Per-block chamfer, or 0 — the §1 budget decision, made once and by measurement.
 *
 * A 3 cm bevel on every masonry block is the difference between "carved" and "box" *when you
 * can resolve it*, and it costs 3.7x the triangles of a plain block (44 against 12). At the
 * `hero` camera's 46° over 1600 px, one pixel subtends 7.5 mm at 15 m and 15 mm at 30 m — so
 * past about 20 m the bevel is a sub-pixel line on every block edge, which is not "carved",
 * it is the high-frequency noise §7.3 fails separately under the squint test. Spending the
 * budget there would buy busier frames *and* blow the triangle count.
 *
 * So blocks are bevelled only where a camera is close enough to read them, and the mass-scale
 * silhouette — cornice flare, batter, corner rolls, the settle curve — carries everything
 * further out. That is the same "smoothness on silhouettes and terminators, not uniformly"
 * rule the columns follow.
 */
function chamferFor(x, y, z, near = 20) {
  return camDist(x, y, z) < near ? 0.03 : 0;
}

/* ============================ courtyard ================================ */

function courtyard(A) {
  const c = L.court, R = A.rng;

  /* Paving: individual slabs, merged. A textured plane here would sink the whole shot.
     Merged rather than instanced because the UVs have to be projected in world space — see
     `Kit.pavingField`; instancing a pre-projected unit slab stretched this, the largest
     surface in five of the ten shots, by its own instance scale. */
  const holes = [
    [-9.8, 9.8, 2.2, 19.8],                       // obelisk terrace
    [-13.6, -5.4, 21.4, 28.6], [5.4, 13.6, 21.4, 28.6],   // colossi plinths
    [-20, -8, 30.6, 34], [8, 20, 30.6, 34],       // entry pylon feet
  ];
  A.mesh('paving_courtyard', K.pavingField({
    x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y: 0, slab: 2.45, thick: 0.55, rng: R, sink: 0.055, holes,
  }), 'paving:court', { cast: false });
  groundProxy(A, c.x0, c.x1, 0, c.z0, c.z1, { material: 'stone' });

  /* Stylobate apron so the complex is planted rather than floating on TERRAIN's sand.
     Top at −0.07: BELOW the lowest jittered slab top, not the +0.02 it used to be.

     The clearance is now MEASURED off the built geometry rather than reasoned from the
     nominal values, because the reasoning was not airtight — it compared the apron's nominal
     top against the slabs' ±0.055 sink while ignoring the apron's own corner jitter and the
     slabs' tilt, either of which could have eaten the margin. Over the up-facing vertices in
     the contact band around the whole perimeter:

         apron  top   min −0.0901   median −0.0786   max −0.0691
         paving top   min −0.0452   median −0.0010   max +0.0351

     Worst case against worst case — the highest apron vertex anywhere against the lowest
     perimeter paving vertex anywhere — the apron is still **2.4 cm below**. So there is no
     placement of the jitter that puts it proud, and the channel is continuous.
     Proud of the paving, its chamfered inner arris ran the whole court perimeter as one
     up-facing sliver — under the night key that sliver renders one band brighter than both
     neighbours and was the `guard` shot's cyan "kerb" contact line at the wall/ground
     junctions (this is the geometry the shading investigation predicted: a correctly-lit
     up-facing strip exactly where an occlusion crease should read). Sunk, it becomes a
     shallow perimeter channel the paving edge shades — reads as a drainage margin, and the
     apron still stands 1.4 m proud of the sand outside, which was its whole job. */
  for (const [x0, x1, z0, z1] of [[c.x0 - 1.4, c.x1 + 1.4, c.z1, c.z1 + 1.4], [c.x0 - 1.4, c.x0, c.z0, c.z1 + 1.4], [c.x1, c.x1 + 1.4, c.z0, c.z1 + 1.4]]) {
    vol(A, 'court', 'sandstone_worn', x0, x1, -1.5, -0.07, z0, z1, { jitter: 0.03 });
  }

  /* ---- Obelisk terrace: two stages, so the courtyard has vertical mass in its middle.
     Stage 2's top is where the `night` shot puts Sly at (-4, 5.2, 12.5). ---- */
  const t1 = L.terrace.s1, t2 = L.terrace.s2;
  A.add('court', 'sandstone_block', K.place(K.masonryShell({
    w: t1.x * 2, d: t1.z1 - t1.z0, h: t1.y, batter: 0.05, course: 0.62, thick: 1.0, rng: R,
    blockLen: [1.3, 2.3], recess: 0.06, chipChance: 0.22, gapChance: 0.02, buried: 0.35, hollow: true,
    openings: [{ face: 0, a0: -3.2, a1: 3.2, y0: -1, y1: 3 }],
    // Closest big mass to `hero`, `night` and `courtyard`: it gets both the settle and the
    // bevel. `windFace: 0` is the south face, the one the valley wind loads.
    sag: 0.16, windFace: 0, bow: 0.09, drift: 0.05,
    chamfer: chamferFor(0, t1.y, (t1.z0 + t1.z1) / 2),
  }), { z: (t1.z0 + t1.z1) / 2 }));
  /* Cavetto under each terrace deck. The stages are the biggest plain masses in the lower
     half of `hero`, `night` and `courtyard`, and a cavetto is a continuously curved surface —
     it hands the ramp a full gradient right where the eye enters the frame, and it is the one
     profile that says "Egyptian" from any distance. */
  const tc1 = K.cornice({ w: t1.x * 2 + 0.1, d: t1.z1 - t1.z0 + 0.1, h: 0.62, flare: 0.40, roll: 0.20 });
  A.add('court', 'sandstone_worn', K.place(tc1.geo, { x: 0, y: t1.y - tc1.height, z: (t1.z0 + t1.z1) / 2 }));
  vol(A, 'court', 'paving_courtyard', -t1.x, t1.x, t1.y - 0.5, t1.y, t1.z0, t1.z1, { jitter: 0.02, c: 0.09 });
  groundProxy(A, -t1.x, t1.x, t1.y, t1.z0, t1.z1);
  ledgeProxy(A, -t1.x, t1.x, t1.y, t1.z0, t1.z0 + 0.9);

  A.add('court', 'sandstone_block', K.place(K.masonryShell({
    w: t2.x * 2, d: t2.z1 - t2.z0, h: t2.y - t1.y + 0.4, batter: 0.06, course: 0.6, thick: 0.95, rng: R,
    blockLen: [1.2, 2.1], recess: 0.06, chipChance: 0.2, gapChance: 0.02, hollow: true,
    openings: [{ face: 0, a0: -2.8, a1: 2.8, y0: -1, y1: 4 }],
    sag: 0.13, windFace: 0, bow: 0.08, drift: 0.05,
    chamfer: chamferFor(0, t2.y, (t2.z0 + t2.z1) / 2),
  }), { y: t1.y - 0.4, z: (t2.z0 + t2.z1) / 2 }));
  const tc2 = K.cornice({ w: t2.x * 2 + 0.1, d: t2.z1 - t2.z0 + 0.1, h: 0.56, flare: 0.36, roll: 0.18 });
  A.add('court', 'sandstone_worn', K.place(tc2.geo, { x: 0, y: t2.y - tc2.height, z: (t2.z0 + t2.z1) / 2 }));
  vol(A, 'court', 'paving_courtyard', -t2.x, t2.x, t2.y - 0.45, t2.y, t2.z0, t2.z1, { jitter: 0.02, c: 0.09 });
  groundProxy(A, -t2.x, t2.x, t2.y, t2.z0, t2.z1);
  ledgeProxy(A, -t2.x, t2.x, t2.y, t2.z0, t2.z0 + 0.9);

  /* Stairs up the south face of each stage — the readable way in. */
  const st1 = K.stairFlight({ steps: 4, rise: 0.5, run: 0.75, width: 6.4, rng: R });
  A.add('court', 'sandstone_worn', K.place(st1, { x: 0, y: 0, z: t1.z1 + 3.0, ry: -Math.PI / 2 }));
  groundProxy(A, -3.2, 3.2, 2.05, t1.z1, t1.z1 + 3.1, { thick: 3.4, slope: true });
  const st2 = K.stairFlight({ steps: 7, rise: 0.46, run: 0.7, width: 5.2, rng: R });
  A.add('court', 'sandstone_worn', K.place(st2, { x: 0, y: t1.y, z: t2.z1 + 2.6, ry: -Math.PI / 2 }));
  groundProxy(A, -2.6, 2.6, 5.25, t2.z1, t2.z1 + 2.7, { thick: 3.6 });

  /* ---- Obelisk: 22 m, `pole` for its full height per §8.1. ---- */
  const ob = L.obelisk;
  vol(A, 'court', 'granite_pink', -2.5, 2.5, t2.y - 0.1, t2.y + 1.1, ob.z - 2.5, ob.z + 2.5, { jitter: 0.02, chip: 0.12, c: 0.10 });
  const obGeo = K.obelisk({ h: ob.h - (t2.y + 1.1), base: ob.base, rng: R });
  A.add('court', 'granite_pink', K.place(obGeo, { x: ob.x, y: t2.y + 1.1, z: ob.z, ry: D(1.1) }));
  poleProxy(A, ob.x, ob.z, t2.y + 1.1, ob.h - 1.6, 1.5);
  ledgeProxy(A, -2.5, 2.5, t2.y + 1.1, ob.z - 2.5, ob.z + 2.5);
  spirePoint(A, ob.x, ob.h, ob.z);       // pyramidion tip: a Ninja Spire Landing target
  /* The clearest case in the level, and the numbers are not close. `PoleClimb`'s top hop is
     the only way off this shaft that goes upward: it fires at `jumpV0 × 0.55` = 6.05 m/s from
     the pole top at 20.4, and apex hang trims that to a 0.67 m rise — it **peaks at y 21.07,
     0.93 m under the 22 m tip**. The Ninja Spire Landing this file names in its own route
     comment is not reachable by the move that leads to it; the beat is hop + double jump, and
     the error is the double jump's timing. Measured through the shipped controller
     (`tests/level.test.mjs` §5): 6 of 9 timings land the tip with magnetism, 1 without it, and
     the bare hop — which misses by 1.090 m against a catch of 1.008 — is deliberately NOT
     rescued. The assist forgives the timing of the move; it does not replace the move. */
  spireTarget(A, 'spire-obelisk', ob.x, ob.h, ob.z);

  /* ---- Barque kiosk around the obelisk. Its lintel ring at y 9.0 is the `hero` perch. ---- */
  const ki = L.kiosk;
  for (const sx of [-1, 1]) for (const pz of [ki.z0, ki.z1]) {
    const px = sx * ki.x;
    const kh = ki.top - 1.25 - t2.y;
    A.add('court', 'limestone_polished', K.place(K.masonryShell({
      w: 1.7, d: 1.7, h: kh, batter: 0.045, course: 0.58, thick: 0.85, rng: R,
      blockLen: [1.0, 1.7], recess: 0.05, chipChance: 0.16, gapChance: 0, hollow: false,
    }), { x: px, y: t2.y, z: pz, ry: D(R.jitter(0.5)), rz: D(R.jitter(0.7)) }));
    A.add('court', 'limestone_polished', K.place(
      K.cornerRolls({ w: 1.7, d: 1.7, h: kh - 0.15, r: 0.16, batter: 0.045, rng: R }), { x: px, y: t2.y + 0.08, z: pz }));
    wallProxy(A, px - 0.9, px + 0.9, t2.y, ki.top - 1.25, pz - 0.9, pz + 0.9);
  }
  /* Lintels: 1.25 m deep, chunky, and the south one is cracked. */
  for (const [len, ry, px, pz, crack] of [
    [ki.x * 2 + 2.2, 0, 0, ki.z0, 0], [ki.x * 2 + 2.2, 0, 0, ki.z1, 0.05],
    [ki.z1 - ki.z0, Math.PI / 2, -ki.x, (ki.z0 + ki.z1) / 2, 0], [ki.z1 - ki.z0, Math.PI / 2, ki.x, (ki.z0 + ki.z1) / 2, 0],
  ]) {
    /* The four lintels of the kiosk ring are the closest architecture to the `hero` camera.
       None of them is level: the south one is cracked and sagging, the others each sit a
       fraction of a degree off, so the ring reads as four stones laid by hand on four piers
       that have settled differently — not as one extruded rectangle.

       Bounded, because this ring is a §8.1 traversal surface: its `ledge` collider sits at a
       flat y = 9.0 and MOVEMENT snaps to that, so any deviation of the art from level is a gap
       between where Sly stands and where the stone is drawn. `tilt x half-span + bow` is held
       under ~6 cm — inside a foot's thickness, and invisible as a float. */
    /* Astragal along both lower arrises. This ring is 63% of `hero`'s projected gilded area
       at 7–14 m — the closest gold to any canonical camera — and as four flat-faced beams it
       was the single biggest contributor to §121.9's "gilded architecture is flat, so the
       specular lobe has nowhere to land". A bead is 14 triangles per side and its normal
       sweeps the whole quadrant from soffit to face. */
    const g = K.beam(len, 1.25, 1.5, {
      rng: R, pieces: Math.max(2, Math.round(len / 2.4)), crack, chip: 0.14,
      tilt: R.jitter(0.35), bow: crack > 0 ? 0.04 : 0.014, roll: 0.15,
    });
    A.add('court', 'hieroglyph_gilded', K.place(g, { x: px, y: ki.top - 0.625, z: pz, ry }));
  }
  for (const pz of [ki.z0, ki.z1]) ledgeProxy(A, -ki.x - 1.1, ki.x + 1.1, ki.top, pz - 0.75, pz + 0.75, { thick: 1.25 });
  for (const sx of [-1, 1]) ledgeProxy(A, sx * ki.x - 0.75, sx * ki.x + 0.75, ki.top, ki.z0, ki.z1, { thick: 1.25 });

  /* ---- Colossi: plinths + thrones are architecture; the seated figures are PROPS. ---- */
  for (const sx of [-1, 1]) {
    const cx = sx * L.colossi.x, cz = L.colossi.z;
    A.add('court', 'sandstone_block', K.place(K.masonryShell({
      w: 8.0, d: 7.0, h: L.colossi.plinth, batter: 0.04, course: 0.65, thick: 1.0, rng: R,
      blockLen: [1.5, 2.6], recess: 0.07, chipChance: 0.24, gapChance: 0.02, buried: 0.4, hollow: false,
      /* Only 2 m tall, so the amplitudes are small — but the pair is symmetric about the
         entry axis in `courtyard` and `combat`, which is exactly where a mirrored pair is
         easiest to catch. Each plinth draws its own phases from the shared stream. */
      bow: 0.07, drift: 0.05,
    }), { x: cx, y: 0, z: cz }));
    /* Cavetto podium. The plinth is the one part of the colossus group with clear air above
       its whole perimeter — the throne above it is 6.8 m wide against the plinth's 8.0 — so
       this is where the moulding the throne back cannot carry actually goes. Sized so the
       cornice top lands exactly on `L.colossi.plinth`, keeping the y = 2.0 ground proxy and
       the seat that stands on it where they were. */
    /* `roll` 0.13 -> 0.26, and the reason is measured, not stylistic.
       A cornice's torus roll ends in a CREST: the profile's top-quarter segment, which turns
       from vertical to horizontal and is therefore up-facing (n.y = 0.960 exactly — the value
       is fixed by the profile's angular step, so it is a signature you can grep the built tree
       for). Its width is `roll * 0.4791`. At `roll` 0.13 that is **6.2 cm**, which is not a
       moulding surface, it is a wire — and on this piece it was a *gilded* wire, 2 m from the
       `guard` camera, projecting 24 px, the widest narrow up-facing strip in that whole frame.
       Measured on the built tree: 16 triangles at world y 1.423..1.440, n.y 0.960, and with
       `guard`'s key (0.508, 0.473, -0.719) the two sides sit at ndl 0.655 and 0.253 — i.e. the
       lit side lands within 0.04 of the 0.62 the cyan-contact-line report quotes. This is the
       "kerb top a few pixels wide" that brief asked to stop existing.
       Every other cornice in the level already clears this: rolls 0.30..0.46 give 14..22 cm
       crests, which read as the intended highlight band. This one was the only one below it —
       confirmed by a level-wide census of the n.y = 0.960 signature, which returns exactly one
       architecture cluster. `h` drops 0.22 -> 0.12 so the podium grows only 0.82 -> 0.98 m
       rather than to 1.08; `plCor.height` feeds nothing but the placement below, and
       `L.colossi.plinth` (the y = 2.0 ground proxy and the throne that stands on it) does not
       move. See Kit.corniceProfile's note on the crest constraint. */
    const plCor = K.cornice({ w: 8.0 - 2 * 0.04 * 1.4, d: 7.0 - 2 * 0.04 * 1.4, h: 0.12, roll: 0.26, flare: 0.34 });
    A.add('court', 'hieroglyph_gilded', K.place(plCor.geo, { x: cx, y: L.colossi.plinth - plCor.height, z: cz }));
    groundProxy(A, cx - 4, cx + 4, L.colossi.plinth, cz - 3.5, cz + 3.5);
    /* Throne: seat block to the knee ledge at 4.5, then the high back slab. */
    vol(A, 'court', 'sandstone_block', cx - 3.4, cx + 3.4, L.colossi.plinth, L.colossi.knee, cz - 3.0, cz + 2.6, { jitter: 0.03, chip: 0.18, c: 0.12 });
    ledgeProxy(A, cx - 3.4, cx + 3.4, L.colossi.knee, cz + 1.4, cz + 2.6, { thick: 0.9 });   // the knees
    /* ---- Throne back: the largest single mass in the `courtyard` frame, and until now a
       plain `vol`. Front-face ownership at the `courtyard` camera puts this slab and the seat
       under it at 41% of the frame, nearer than anything else in the shot at 6.0–8.7 m, which
       is why critic pass 5 read the whole complex off it: "every structure is a chamfered
       cuboid — no cavetto cornice, no torus roll moulding, no batter on any wall".
       It now carries all three. The naos shrine — a battered box, rolled at the arrises,
       capped by a cavetto — is the Egyptian form a throne back *is*, so this is the vocabulary
       arriving on the piece the camera is actually pointed at rather than on a distant pylon.

       **No cavetto on this one, and the reason is measured.** A cavetto is the obvious cap for
       a naos, but the colossus leans on this slab: sliced every 25 cm over the band the back
       runs (`thronegap.mjs`), the statue's nearest z sits between −1.70 m and +0.55 m of the
       slab's own south face, i.e. it is *touching or inside* it for most of the height. Any
       moulding that projects cuts the figure. So this mass gets the two vocabulary items that
       hug rather than overhang — the batter and the corner rolls, the latter at the ±3.2
       arrises where the statue's 2.66 m shoulder half-width leaves them clear — and the
       cavetto goes on the plinth below, which is unobstructed. A back pillar with no cornice
       is also what a real seated colossus has. */
    /* Batter 0.09 (5.1°), not the 0.055 used elsewhere: over this slab's 5.1 m that is 46 cm
       of lean instead of 28 cm, which is the difference between a wall the eye reads as leaning
       and one it reads as vertical with a perspective error. The rolls take the same number and
       follow it. Battering also tips the top of the slab *north*, away from the colossus. */
    /* ---- The pair is no longer mirror-symmetric above the seat. ----
       Critic pass 6, `courtyard`: "left and right buildings are mirrored duplicates". These
       two are that finding — they are the frame's flanking masses, they sit at ±9.5 on the
       camera's own axis, and `bow`/`drift` at 6–7 cm cannot answer it: over the 6–9 m these
       are seen from, centimetres are a pixel or two, and a mirror read survives that intact.
       It needs the same order of move the entry pylons got (a 0.9 m height split and a
       collapsed corner), so the east back pillar has lost its head: 1.5 m shorter, and the
       top three courses of its outer half are gone, with the block spill at its foot.
       The west one keeps the full 9.6 m. Both `ledge` proxies follow `tbTop`, so the
       traversal circuit keeps a perch on each — one just steps down to the other. */
    const tbW = 6.4, tbTop = sx > 0 ? 8.1 : 9.6, tbBat = 0.09;
    A.add('court', 'hieroglyph_wall', K.place(K.masonryShell({
      w: tbW, d: 1.8, h: tbTop - L.colossi.knee, batter: tbBat, course: 0.62, thick: 0.8, rng: R,
      blockLen: [1.4, 2.3], recess: 0.06, chipChance: 0.2, gapChance: 0.015, hollow: false,
      bow: 0.06, drift: 0.05,
      /* Outer half only — the inner half frames the entry axis and stays square. */
      openings: sx > 0
        ? [{ face: 0, a0: 0.4, a1: 3.4, y0: tbTop - L.colossi.knee - 1.5, y1: 99 },
           { face: 1, a0: 0.4, a1: 3.4, y0: tbTop - L.colossi.knee - 1.5, y1: 99 }]
        : [],
    }), { x: cx, y: L.colossi.knee, z: cz - 2.1 }));
    if (sx > 0) {
      for (let i = 0; i < 5; i++) {
        const s = R.range(0.55, 1.05);
        const g = K.chamferBox(s * 1.4, s * 0.55, s * 1.0, { rng: R, jitter: 0.03, c: 0.045 });
        /* On the courtyard paving outboard of the plinth (which runs to x 13.5, z 21.5…28.5),
           not on the plinth top — the seat block occupies that from y 2.0 to 4.5 and anything
           dropped there would be inside it. */
        K.place(g, {
          x: cx + R.range(4.5, 7.2), y: s * 0.28, z: cz + R.range(-3.6, 1.4),
          rx: D(R.jitter(13)), ry: D(R.range(0, 360)), rz: D(R.jitter(15)),
        });
        A.add('court', 'hieroglyph_wall', K.boxProjectUVs(g));
      }
    }
    A.add('court', 'sandstone_worn', K.place(
      K.cornerRolls({ w: tbW, d: 1.8, h: tbTop - L.colossi.knee, r: 0.24, batter: tbBat, rng: R }),
      { x: cx, y: L.colossi.knee, z: cz - 2.1 }));
    wallProxy(A, cx - 3.2, cx + 3.2, L.colossi.knee, tbTop, cz - 3.0, cz - 1.2);
    ledgeProxy(A, cx - 3.2, cx + 3.2, tbTop, cz - 3.0, cz - 1.2, { thick: 0.7 });
    /* Sand banked against the north face — the wind comes down the valley. */
    /* Same wind, same reason as the entry pylons — the colossi are the other mirrored pair. */
    A.add('court', 'sandstone_worn', K.place(K.sandDrift({
      len: 7.4, h: 1.35, depth: 3.4, rng: R, skew: sx > 0 ? 0.34 : 0.66,
    }), { x: cx, z: cz - 3.0, ry: Math.PI }));
  }

  /* ---- Peristyle colonnade: the §8.1 architrave ledge ring at y = 9.0, x = ±23. ---- */
  const pe = L.peri;
  const pierZ = [];
  for (let z = pe.z0 + 1; z <= pe.z1 - 1; z += 5.5) pierZ.push(z);
  for (const sx of [-1, 1]) {
    for (const pz of pierZ) {
      /* Nine identical uprights in a row is the "straight/symmetric everywhere" failure in
         its purest form, so each pier gets its own batter, its own height and about a degree
         of lean. The architrave above them stays put, which is what makes the drift read as
         settlement rather than as noise. */
      const bat = 0.05 + R.jitter(0.018);
      const tilt = D(R.jitter(0.9));
      /* ONE pier per side has lost its top. Height/batter/lean jitter is ±22 cm and about a
         degree — real, but centimetre-scale, and at the 13–40 m these are seen from it is
         1–2 px. A pier that stops at 3.4 m instead of 7.7 m is a four-metre hole in the
         colonnade's rhythm, which is the same order of move as the collapsed pylon corner.
         Chosen off the pier's own index so the two sides break at different bays and the
         colonnade never reads as mirrored. The architrave above keeps its full span and its
         y = 9.0 `ledge` contract — a ruin drops the upright and leaves the lintel bridging,
         which is also the more interesting silhouette. */
      const broken = pierZ.indexOf(pz) === (sx < 0 ? 5 : 2);
      const ph = broken ? 3.4 + R.jitter(0.3) : 7.7 + R.jitter(0.22);
      A.add('court', 'sandstone_block', K.place(K.masonryShell({
        w: 2.15, d: 1.95, h: ph, batter: bat, course: 0.64, thick: 0.85, rng: R,
        blockLen: [1.1, 1.9], recess: 0.06, chipChance: broken ? 0.55 : 0.2,
        gapChance: broken ? 0.14 : 0.03, buried: 0.3, hollow: false,
      }), { x: sx * pe.x, y: 0, z: pz, ry: D(R.jitter(0.45)), rz: tilt }));
      if (broken) {
        /* The drums that came off it, lying at the foot. Same bucket, so zero extra draws. */
        for (let i = 0; i < 4; i++) {
          const s = R.range(0.85, 1.45);
          const g = K.chamferBox(s * 1.7, s * 0.66, s * 1.5, { rng: R, jitter: 0.035, chip: R.chance(0.6) ? 0.18 : 0, c: 0.05 });
          K.place(g, {
            x: sx * pe.x + R.range(-2.6, 2.6), y: s * 0.33 - R.range(0.04, 0.22), z: pz + R.range(-2.4, 2.4),
            rx: D(R.jitter(16)), ry: D(R.range(0, 360)), rz: D(R.jitter(18)),
          });
          A.add('court', 'sandstone_block', K.boxProjectUVs(g));
        }
      }
      /* Torus rolls down the arrises. Four lit vertical lines turn a masonry box into a
         modelled mass for ~250 triangles, which is the best terminator-per-triangle in the
         level — the ramp has an actual gradient to quantise on a cylinder. */
      A.add('court', 'sandstone_worn', K.place(
        K.cornerRolls({ w: 2.15, d: 1.95, h: ph - 0.2, r: 0.19, batter: bat, rng: R }),
        { x: sx * pe.x, y: 0.1, z: pz, rz: tilt }));
      wallProxy(A, sx * pe.x - 1.05, sx * pe.x + 1.05, 0, ph, pz - 0.95, pz + 0.95);
    }
    /* Architrave: top face exactly y = 9.0, 1.6 m deep — obviously grabbable.

       48 m of it. Dead level it is the straightest edge in the level; a 5 cm bow over that run
       is invisible as a measurement and obvious as a silhouette. Held to ~9 cm total for the
       same reason as the kiosk ring: the `ledge` collider at y = 9.0 is the §8.1 contract and
       does not bow with the art. */
    const g = K.beam(pe.z1 - pe.z0 + 2.2, 1.3, A.TUNE.ledgeDepth, {
      rng: R, pieces: 12, chip: 0.16, tilt: sx > 0 ? 0.10 : -0.075, bow: 0.05,
    });
    A.add('court', 'hieroglyph_wall', K.place(g, { x: sx * pe.x, y: pe.ledge - 0.65, z: (pe.z0 + pe.z1) / 2, ry: Math.PI / 2 }));
    ledgeProxy(A, sx * pe.x - 0.8, sx * pe.x + 0.8, pe.ledge, pe.z0 - 1.1, pe.z1 + 1.1, { thick: 1.3 });
    /* Torus roll along the outer face — reads the cornice motif at colonnade scale. */
    const roll = new THREE.CylinderGeometry(0.3, 0.3, pe.z1 - pe.z0 + 2.2, 16, 1, true);
    K.normaliseAttrs(roll);
    A.add('court', 'sandstone_worn', K.boxProjectUVs(K.place(roll, { x: sx * (pe.x + 0.82), y: pe.ledge - 1.15, z: (pe.z0 + pe.z1) / 2, rx: Math.PI / 2 })));

    /* ---- Temenos wall behind the colonnade: mudbrick, buried, wall-runnable ----
     *
     * Built as five runs of differing height with a real breach in the middle, instead of
     * as one 49 m box of constant 5.6 m.
     *
     * §7.3's "silhouettes are straight/symmetric everywhere" is not answered in centimetres.
     * `sag` and `drift` move this wall's line by ~20 cm over its whole length; at the 25–45 m
     * it is seen from that is well under a pixel, which is why the condition survived the last
     * two rounds of curve work. A run that steps 5.6 → 3.9 m, stops dead for three metres, and
     * comes back at 2.9 m moves the skyline by *metres* — the same class of move as the
     * collapsed pylon corner, which is the one that did land.
     *
     * This is also the wall that matters most: measured by projected frame area over the ten
     * canonical cameras, it is 88.8% of the `guard` frame — the worst-scoring shot in the set,
     * where it and the colonnade in front of it are essentially the entire image.
     *
     * That measurement also retires the assumption this wall was built on. The old comment
     * here read "no chamfer — it is never inside 25 m of a camera"; the `guard` camera stands
     * 14 m from it. It gets the same 3 cm chamfer as everything else a camera can approach,
     * which is what turns mudbrick from a box into a mass at that distance.
     *
     * ---- HEIGHT: 5.6 -> 12.5 m (ledger #29) ----
     *
     * The defect was never the architrave. It was that the temenos stood 5.6 m against a
     * colonnade whose architrave ledge is 9.0 m — an enclosure shorter than the thing it
     * encloses, which makes this a freestanding colonnade with a boundary fence around it
     * rather than a peristyle court. The frame evidence says the same thing twice: from
     * `courtyard`'s eye at y 5.6 the old wall top subtends *exactly* 0° of elevation, so it
     * occluded nothing and the desert horizon ran straight through the ambulatory. A temple
     * court that shows you the horizon has failed at the one job an enclosure has. At 12.5 m
     * the same wall top sits 6.56° above the eye line.
     *
     * That elevation angle proves the wall is tall ENOUGH; it does not prove nothing sees past
     * it, and this run is stepped, breached and jittered, so those are different claims.
     * `tools/horizon.mjs` settles it by ray-cast — every frustum ray classified, no threshold:
     * a ray that hits nothing and points at or below horizontal must land on desert floor.
     * Measured skyline: W max 12.56 mean 9.39, E max 12.58 mean 8.97, and the only run below
     * the courtyard eye is the breach at z 9..12. Desert visible as % of frame, this wall at
     * 5.6 m vs at 12.5 m, same seed and same cameras — the control matters, because a leak
     * number with nothing to compare it against does not measure the raise:
     *
     *   courtyard   0.52 -> 0.16   and the leak's z range collapses 9.2..27.9 -> 9.2..11.2
     *   hero        1.24 -> 0.90   residual is over plan segment 2, a deliberate ~9 m step,
     *                              seen from an eye at y 10.28 that is above it — and `hero`
     *                              is the shot whose brief asks for the Great Pyramid hazed in
     *                              the distance, so some of this is the vista, not a leak
     *   night       1.22 -> 1.11   barely moves: its leak was always the breach, not height
     *   guard       0.00 -> 0.00   but sky rays 303 -> 0; the wall now fills that frame
     *   combat / sly-closeup       0.00, sealed outright
     *   traversal   0.78           past the run's north end, and over the top from y 14.0
     *
     * So the raise did the thing it was for: on the camera it was argued from it removes two
     * thirds of the leak and confines the rest to the breach.
     *
     * So: no unintended hole anywhere in the wall — every through-wall candidate dissolved once
     * the top was probed at the crossing's own z rather than at the nearest grid sample, bar 5
     * rays (0.03%) at the breach's own ragged edge. But "the horizon is gone" is overstated as
     * an absolute and is corrected here: the breach is a hole BY DESIGN and it still shows
     * desert to two of the eight enclosed cameras, and an eye above the wall top legitimately
     * sees over it. Left standing, because a collapsed section that shows the desert beyond is
     * the ruin reading this wall is for. If it ever needs closing, the cheap fix is to raise
     * the rubble mound rather than to re-close the wall.
     *
     * Three things had to move together, and two of them are not free:
     *
     *   w 1.5 -> 2.0, centre ±25.3 -> ±25.6.  A 12.5 m wall 1.5 m thick is a playing card.
     *
     *   batter 0.075 -> 0.03.  This one is forced, not chosen. `masonryShell` floors its
     *   course width at 1.2 m, so w 2.0 at batter 0.075 stops tapering at y 5.33 and runs
     *   dead straight for the remaining 7 m — a kink in the silhouette exactly where the eye
     *   is. 0.03 clamps at 13.33 m, clear of the 12.5 m top, and still closes 2.0 -> 1.25 m
     *   over the height. Measured, not guessed: see the clamp table in the ledger.
     *
     *   course 0.5 -> 0.72, blockLen [1.35,2.15] -> [1.9,2.9].  This is the funding. The raise
     *   costs +48.4k triangles unfunded (+121% on this wall); coarsening the courses gives
     *   back 41.6k of it for +6.8k net (+17%), and it costs nothing visible — a 0.72 m course
     *   still reads 27 px tall at the `guard` camera against 19 px at 0.5 m, and courses that
     *   size are the more plausible read for a mudbrick temenos at this mass anyway.
     *
     * `skipFaces` was the funding originally proposed and it is NOT used here, for two reasons
     * both of which are measurements rather than opinions. It only saves a further 16k, and it
     * would be the one change in this wall whose correctness depends on where the cameras are:
     * dropping the outward skin leaves the run one block thick, `gapChance` fallen blocks then
     * have nothing behind them and open into 25–44 cm holes (through-ray leak 0.16% -> 0.94%,
     * worst hole 438 mm ≈ 16 px from `guard`), so it additionally forces gapChance to 0 and
     * costs this wall its fallen-brick ruin notes. And it is safe only while every camera stays
     * inboard of the outer face — which they all are, but `dunes` at x 26.0 clears the east
     * face plane at x 26.6 by **0.6 m**. That is too thin a margin to spend on 16k triangles in
     * a level where three canonical cameras were repositioned this session alone.
     */
    const tx = sx * (pe.x + 2.6);
    const zA = pe.z0 - 1.5, zB = pe.z1 + 1.5;
    const TH = 12.5;
    const k = TH / 5.6;    // scale the stepped profile, so the steps grow with the wall
    /* [length, height] — heights in metres, 0 = the collapsed breach. Lengths sum to the
       full run so the two ends still land exactly on the colonnade's. */
    const plan = [
      [13.5 + R.jitter(1.1), 5.6 * k],
      [11.0 + R.jitter(1.0), (5.6 - R.range(1.4, 2.0)) * k],
      [3.2 + R.jitter(0.5), 0],
      [12.0 + R.jitter(1.0), (5.6 - R.range(0.1, 0.5)) * k],
      [9.3, (5.6 - R.range(2.4, 3.0)) * k],
    ];
    const span = plan.reduce((s, p) => s + p[0], 0);
    let zc = zA;
    for (const [rawLen, hh] of plan) {
      const len = rawLen * (zB - zA) / span;      // renormalise so the ends stay put
      const z0 = zc, z1 = zc + len;
      zc = z1;
      if (hh <= 0) {
        /* The breach: a low mound of collapsed brick, so the gap reads as a failure rather
           than as a gateway someone left. Same material key, so it merges for free. */
        for (let i = 0; i < 5; i++) {
          const s = R.range(0.5, 0.95);
          const g = K.chamferBox(s * 1.4, s * 0.5, s * 1.0, { rng: R, jitter: 0.03, c: 0.04 });
          K.place(g, {
            x: tx + R.range(-1.5, 1.5), y: s * 0.25 - R.range(0.02, 0.16), z: z0 + R.range(0.3, len - 0.3),
            rx: D(R.jitter(12)), ry: D(R.range(0, 360)), rz: D(R.jitter(14)),
          });
          A.add('court', 'mudbrick', K.boxProjectUVs(g));
        }
        continue;
      }
      A.add('court', 'mudbrick', K.place(K.masonryShell({
        w: 2.0, d: len, h: hh, batter: 0.03, course: 0.72, thick: 0.7, rng: R,
        blockLen: [1.9, 2.9], recess: 0.05, chipChance: 0.26, gapChance: 0.06, buried: 0.6,
        hollow: true, chamfer: 0.03,
        /* Thin wall: `bow` only eats its 2.0 m thickness, which `wc`'s 1.2 m floor clamps
           away anyway, so this one is all `drift` — each run wanders off true on its own
           phase, so the five of them do not line up into one straight wall again. */
        sag: 0.34, windFace: sx > 0 ? 2 : 3, windK: 2.6, drift: 0.17,
      }), { x: tx, y: 0, z: (z0 + z1) / 2 }));
      wallProxy(A, tx - 1.0, tx + 1.0, 0, hh, z0, z1);
      ledgeProxy(A, tx - 0.9, tx + 0.9, hh, z0, z1);
    }
  }
  /* Short south returns — enclosure without blocking the entry axis. */
  for (const sx of [-1, 1]) {
    for (const px of [sx * 18.5]) {
      A.add('court', 'sandstone_block', K.place(K.masonryShell({
        w: 2.15, d: 1.95, h: 7.7, batter: 0.05, course: 0.64, thick: 0.85, rng: R, hollow: false,
        blockLen: [1.1, 1.9], recess: 0.06, chipChance: 0.2, gapChance: 0.03, buried: 0.3,
      }), { x: px, y: 0, z: 31.5, rz: D(R.jitter(0.8)) }));
      A.add('court', 'sandstone_worn', K.place(
        K.cornerRolls({ w: 2.15, d: 1.95, h: 7.5, r: 0.19, batter: 0.05, rng: R }), { x: px, y: 0.1, z: 31.5 }));
      wallProxy(A, px - 1.05, px + 1.05, 0, 7.7, 30.5, 32.5);
    }
    const g = K.beam(pe.x - 17.4, 1.3, A.TUNE.ledgeDepth, { rng: R, pieces: 3, chip: 0.14 });
    A.add('court', 'hieroglyph_wall', K.place(g, { x: sx * 20.7, y: pe.ledge - 0.65, z: 31.5 }));
    ledgeProxy(A, sx * 17.4, sx * pe.x, pe.ledge, 30.7, 32.3, { thick: 1.3 });
  }
}

/* ========================== entry pylons =============================== */

function entryPylons(A) {
  const p = L.pylon, R = A.rng;

  for (const sx of [-1, 1]) {
    const cx = sx * p.x;
    /* The two towers are not a mirrored pair. The west one is nearly a metre shorter and
       leans harder, which is the difference between "two towers" and "one tower drawn twice"
       in the `hero` and `dunes` silhouettes. The east tower keeps §8.1's 26 m because the
       rooftop-run rail starts on its deck. */
    const ph = sx > 0 ? p.h : p.h - 0.9;
    const B = A.TUNE.batterPylon * (sx > 0 ? 1.0 : 1.13);
    A.add('court', 'hieroglyph_wall', K.place(K.masonryShell({
      w: p.w, d: p.d, h: ph, batter: B, course: A.TUNE.courseHeight, thick: 1.05, rng: R,
      blockLen: [1.4, 2.5], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
      gapChance: A.TUNE.fallenBlockChance, buried: 0.55, hollow: true,
      /* Flagstaff niches: the four vertical grooves down the south face. */
      openings: [
        { face: 0, a0: -3.9, a1: -2.9, y0: 1.2, y1: 22 },
        { face: 0, a0: 2.9, a1: 3.9, y0: 1.2, y1: 22 },
        { face: 1, a0: -1.6, a1: 1.6, y0: -1, y1: 4.2 },   // service door on the north face
        /* THE COLLAPSED CORNER, west tower only.
           Bow and drift move a silhouette by tens of centimetres; this moves it by three
           metres, and it is the difference between a pair that has aged apart and a pair that
           is the same mesh twice. Both faces meeting at the tower's outer south corner lose
           the same eight courses, so the bite is a real corner loss with a returning inside
           face — not a rectangle punched in one elevation.
           Placed at mid-height, not at the head: the cornice ring is a single closed sweep
           and a bite under it would leave a cornice bridging thin air. Placed on the outer
           corner, not the gate side: the gate reveal is the framing line for `dunes` and
           `hero` and it wants to stay clean. */
        ...(sx < 0 ? [
          { face: 0, a0: -6.2, a1: -3.35, y0: 9.4, y1: 14.6 },
          { face: 3, a0: 0.55, a1: 3.4, y0: 9.4, y1: 14.6 },
        ] : []),
      ],
      /* The west tower has settled twice as far as the east one and lost twice as many
         blocks off its windward face. Height and batter already differ; this is what makes
         the *coursing* differ too, so the pair reads as two buildings that have aged apart
         rather than as one asset instanced twice. */
      sag: sx > 0 ? 0.10 : 0.21,
      windFace: 0, windK: sx > 0 ? 1.7 : 2.4,
      /* The tallest silhouettes in the level, and the ones every wide shot reads against.
         Measured off a least-squares batter line, the two faces of this pair that keep all
         their blocks were straight to 3.6 and 3.9 cm RMS over 26 m. These two curves take
         that to tens of centimetres — 22 cm of belly, 18 cm of lean — which is 4 px at
         `dunes` and 10 px at `hero`, i.e. the first amplitude a critic can actually see.
         Both are pinned to zero at the base and at the wall head, so the foot still meets the
         apron and the cornice still lands on the nominal batter. */
      bow: 0.22, drift: 0.18,
      chamfer: chamferFor(cx, ph * 0.5, p.z),
    }), { x: cx, y: 0, z: p.z }));
    A.add('court', 'sandstone_worn', K.place(
      K.cornerRolls({ w: p.w, d: p.d, h: ph - 1.0, r: A.TUNE.rollRadius, batter: B, rng: R }),
      { x: cx, y: 0, z: p.z }));

    /* Cavetto + torus cornice. This silhouette IS Egyptian architecture. */
    const inset = B * (ph - 0.4);
    const cw = p.w - 2 * inset, cd = p.d - 2 * inset;
    const cor = K.cornice({ w: cw, d: cd, h: A.TUNE.corniceHeight, flare: A.TUNE.corniceFlare, roll: A.TUNE.rollRadius });
    A.add('court', 'hieroglyph_gilded', K.place(cor.geo, { x: cx, y: ph - 0.4, z: p.z }));
    /* Roof deck on top of the cornice. */
    vol(A, 'court', 'paving_courtyard', cx - cw / 2, cx + cw / 2, ph - 0.4 + cor.height - 0.35, ph - 0.4 + cor.height,
      p.z - cd / 2, p.z + cd / 2, { jitter: 0.02, c: 0.08 });
    const deckY = ph - 0.4 + cor.height;
    groundProxy(A, cx - cw / 2, cx + cw / 2, deckY, p.z - cd / 2, p.z + cd / 2);
    ledgeProxy(A, cx - cw / 2 - A.TUNE.corniceFlare, cx + cw / 2 + A.TUNE.corniceFlare, deckY - 0.36, p.z - cd / 2 - 1.4, p.z - cd / 2 - 0.2);

    /* ---- The vertical route, and the thing that says "climb here". ------------------------
     * Two blind critics read this level as having "zero vertical route" and "nothing says climb
     * here". Both are fair about this face: the south elevation of the entry pylon is 25.6 m of
     * battered stone with two flagstaff niches cut down it and nothing in either of them, and
     * the only authored ways up out of the courtyard are a cane hook (needs the kiosk first) and
     * the approach rail (which you arrive on, not leave by).
     *
     * The EAST tower only, and the pair is the argument. Fitting both would be two identical
     * lifts side by side; fitting neither is where we started. The east tower is where
     * `pylon-drop` starts (13.6, 26.3, 32) — the rooftop run's own entry — so laddering it makes
     * the ascent and the descent the *same authored line*, read in both directions. The west
     * tower's niches stay bare, which is consistent with everything else already authored about
     * it: it has settled twice as far, lost twice as many courses and dropped a whole corner
     * (`sag` 0.21 against 0.10, the collapsed-corner openings above). Its fittings went with
     * them. The bare pair is also what makes the fitted pair read as deliberate rather than as
     * texture — with nothing to compare against, a bracket is just another block.
     *
     * The INNER pylon is deliberately NOT laddered, and this is a narrowing of §357.2's
     * "south faces of the three pylons only" that should be argued rather than quietly taken:
     * §8.1 already authors that ascent (nave deck → wall-run the battered south face → SPIRE
     * LAND (6, 27, −50) → the y 26 stage), and §357.3 deliberately took the free lift off it.
     * A ground-to-summit rung line at z −47.6 would hand that back. One vertical route, where
     * the level had none, is the fix; three is a lift.
     *
     * Specs are built BEFORE the proxy so the rec can carry its own holds — `Engine
     * .registerCollider` spreads `opts` onto the rec, so `handholds` arrives as `rec.handholds`
     * with no engine change, and `mesh.userData.handholds` mirrors it for the §4.4 authoring
     * contract's other half.
     *
     * Cost, measured by building `Architecture` + `Props` with an instrumented
     * `registerCollider` — the same harness `tests/basketvary.test.mjs` seals — and diffing the
     * tag histogram against HEAD: **identical, 272 registrations, every tag equal**
     * (ground 52, hazard 8, hook 11, ledge 90, pole 21, rail 6, spire 5, vent 4, wall 75).
     * 0 new colliders, 0 new draw calls (corbels and pins go into `court|bronze_dark`, a bucket
     * that already exists). That the route tags in particular are untouched is the load-bearing
     * half: `pole`, `hook`, `spire`, `rail` and `ledge` are CameraRig's `ROUTE_TAGS`, and one
     * stray `pole` (weight 1.0, the highest there is) would silently drive the camera's UP
     * channel.
     *
     * ── The ladder runs PAST the niche head, and it has to ────────────────────────────────
     * The first version stopped at the niches' own head (y 22), putting the top rungs at 21.00
     * and 19.95, and the route ran out below the tower. Two more rungs per niche carry the
     * fittings up the 3.6 m of plain wall between the niche head and the cornice — which is
     * where a real pylon's upper flagstaff brackets sit anyway, because the niche stops short of
     * the cornice on a real one too. Top rungs are now 25.20 (west line) and 24.15 (east),
     * both inside the wall proxy's own 25.6 m top.
     *
     * ── AN ARITHMETIC RETRACTION, AND THEN THE MEASURED ANSWER ────────────────────────────
     * The exit numbers first written here were wrong, and wrong in a way worth naming: they
     * treated the rung as the position of Sly's FEET. It is the position of his HAND —
     * `WallClimb.enter` puts the capsule at `h.point.y − hangReach`, exactly as a ledge does.
     * So a launch from a rung at Y lifts the feet to Y − 1.56 + 2.2274 and the hands to
     * **Y + 2.2274**, not Y + 2.2274 + 1.56. From 25.20 that is 27.427, not 28.99, and it does
     * **not** clear the 28.92 deck lip by 0.07 m — it misses it by 1.49 m. With the re-granted
     * double jump the hands make 29.469, clearing by 0.549 m.
     *
     * What the route actually does was then measured rather than derived, by flying the real
     * `Controller` against the real `Collision` on the built level: the ascent tops out on the
     * **head of this proxy at y 25.60**, which `LedgeHang` (priority 88, above everything in the
     * ladder) catches on the way up from either line's top rung — hands reach 27.43 from the
     * west and 26.38 from the east, both over the 25.60 lip. From that perch a plain jump puts
     * the hands at 29.68 and the deck is taken. **The loop closes, in two beats rather than
     * one**, and it closes from BOTH lines, so the 1.05 m stagger between their top rungs — which
     * `WallClimb.find()` cannot bridge, the two lines being 3.5 m apart against its 0.685 m
     * reach — costs nothing. Left as it is: an ascent that ends on the wall head and then steps
     * onto the deck is a better beat than one that lands on the deck in a single bound, and it
     * is the beat the geometry already had.
     *
     * ONE CONSEQUENCE IS NOT MINE TO FIX AND IS FLAGGED IN THE REPORT: this proxy is authored
     * `ph − 0.4` while the drawn shell is `ph`, so the collider head at 25.60 sits 0.40 m below
     * the masonry that is actually drawn there (measured: 284 vertices of `court|hieroglyph_wall`
     * between y 25.88 and 26.03). Nothing could reach that surface before this ladder existed,
     * so the mismatch has never mattered; it does now. */
    const holds = [];
    if (sx > 0) {
      /* First rung one pitch off the paving, so it is inside a plain standing jump (apex
         jumpV0²/2g = 2.52 m). The +3.4 niche is offset half a pitch — see NOTCH.
         `ys` is an explicit list rather than a count, and that is not decoration: the east line
         needs a SHORT final step, and a uniform-pitch generator cannot express one. */
      const P = NOTCH.pitch;
      const up = (n, first) => Array.from({ length: n }, (_, i) => first + i * P);
      holds.push(...notchLadder(A, {
        id: 'notch-pylon-e-w', zone: 'court', cx, cz: p.z, w: p.w, d: p.d, batter: B,
        a: -3.4, ys: up(12, P),                       // 2.10 … 25.20
      }));
      /* The east line closes with 24.15 → 25.20, a 1.05 m half-pitch step, so both niches finish
         at the same height and which line `WallClimb.find()` commits you to stops being a thing
         anyone has to reason about — `find()` cannot cross between them (3.5 m apart at the top
         against its 0.685 m reach), so a difference there would be one you could not correct.
         Free: a short step is under the 2.2274 m apex the pitch is derived against, not over it.
         **It must be emitted INTO this ladder, not as its own.** Authored as a separate
         `notchLadder` call it took the id family `notch-pylon-e-e-top`, and
         `tests/traversal.test.mjs` groups ladders by `id.replace(/-\d+$/, '')` — so one physical
         line read as two ladders **0.130 m apart**, inside `WallClimb.find()`'s 0.563 m lateral
         budget. That silently activated the traversal lane's `sameLine()` tie-break, which they
         had shipped and documented as provably inert because the real ladders are 3.598 m apart.
         A rung in the wrong id family is a rule turned on in another file. */
      holds.push(...notchLadder(A, {
        id: 'notch-pylon-e-e', zone: 'court', cx, cz: p.z, w: p.w, d: p.d, batter: B,
        a: 3.4, ys: [...up(11, P * 1.5), P * 12],     // 3.15 … 24.15, then 25.20
      }));
    }

    /* Battered wall-run faces. atan(0.105) = 6.0 deg off vertical -> 84 deg slope, still `wall`.
     *
     * ── What the `− 0.4` turned out to be for, and the defect it leaves ───────────────────
     * The proxy is built to `ph − 0.4` — the cornice's springing line, not the tower's height —
     * and that is deliberate and correct: `K.cornice` is a flared cavetto that grows from
     * 5.62 × 0.62 m at its base to 9.12 × 4.12 m at the deck, and a battered box (which
     * *narrows* as it rises) cannot approximate it in any direction. So the collider stops where
     * the cornice begins. The drawn `masonryShell` is built to the full `ph`, running its last
     * 0.4 m up BEHIND the cornice so the springing has stone behind it rather than a slot —
     * measured, that top course sits inside the cornice's own footprint by 0.031 m in both axes,
     * so it is buried and never rendered as an exposed face.
     *
     * None of that is the bug. The bug is the **cap**: `proxyBattered` closes its top, leaving an
     * invisible floor at 25.60 — the springing line of a 3.32 m cornice that occupies
     * y 25.60…28.92 right there. Round 3 reported this as Sly standing "0.40 m into the drawn
     * top course" and that was too kind by an order of magnitude: the cornice flares outward as
     * it rises and reaches his standing z of ~34.7 at y 26.21, so from mid-shin upward **his
     * torso and head are inside gilded stone** for the second or so he is perched there. Nothing
     * could reach that surface before the handhold ladder existed, which is why it never cost
     * anything.
     *
     * ── AND IT STAYS, BECAUSE THE ALTERNATIVE IS A BROKEN ROUTE ───────────────────────────
     * Dropping the cap is geometrically safe — the frustum's top face is
     * `max(0.4, w − 2·batter·h)` = 5.6240 × 0.6240 and the deck's own `groundProxy` is
     * `p.w − 2·B·(ph − 0.4)` = **5.6240 × 0.6240, bit-identical**, sitting directly above it, so
     * no hole is opened. It was built, flown, and reverted, because without that perch **the
     * ascent cannot reach the deck at all**. Measured on the real controller from either line's
     * top rung at 25.20: hands peak at **27.47 with no double jump and 27.75 with one — 1.45 and
     * 1.17 m under the 28.92 lip.** Probing a `WallClimb` that re-granted `airJumps` on launch
     * (the one-line change that would be the obvious fix) moves it to 27.75 and no further.
     * The gap is structural: a launch lifts the hands `2.2274` m from a hold, the top hold can be
     * no higher than the collider that carries it (25.60), and the nearest thing above is the
     * cornice lip at 28.56. 25.20 + 2.2274 = 27.43 does not reach it and no rung placed lower can.
     *
     * So the perch is load-bearing and the trade is: a one-second pose inside a cavetto, or an
     * ascent that ends in mid-air. Kept, deliberately, and written up rather than chosen quietly.
     * Closing it properly needs a collider on the cornice itself — which is where Sly should be
     * standing — and that is one registration against a sealed total of 272. Reported. */
    const face = A.proxy(K.proxyBattered(p.w, p.d, ph - 0.4, B, A._proxyMat()),
      { tag: 'wall', material: 'stone', climbable: true, batter: B, handholds: holds.length ? holds : null },
      { x: cx, y: 0, z: p.z });
    if (holds.length) {
      face.userData.handholds = holds;
      for (const h of holds) h.mesh = face;
      /* The mouth. Rung 1 of the west niche (y 4.20), not rung 0: the target's feet sit
         `chest` 0.99 below the rung, so rung 0 would put the acquisition point at y 1.11 —
         close enough to the paving that a running jump crosses it before magnetism is worth
         anything. From 4.20 the point is at 3.21, which a jump (apex 2.5208) into a double
         jump (a further 2.0419) reaches with 1.35 m to spare, and `volume` 3.30 opens the
         trigger well before that. It is also the rung the two staggered ladders are furthest
         apart at the bottom, so the mark is unambiguous about which line it starts. */
      notchTarget(A, 'notch-pylon-e-mouth', face, holds[1]);
    }

    /* Sand drift on the north (leeward) face. */
    /* `skew` flips with `sx` because the drift is placed mirrored (`x: cx = ±p.x`), so a single
       local value would give the two towers mirror-image crests — which is precisely the tell
       that made them read as a matched pair of smiles in `courtyard`. Flipping it means both
       crests pile toward the same WORLD direction, i.e. one wind over the whole site, which is
       both the physically coherent choice and the one that breaks the symmetry. */
    A.add('court', 'sandstone_worn', K.place(K.sandDrift({
      len: p.w * 0.95, h: A.TUNE.sandHeight, depth: 4.2, rng: R, skew: sx > 0 ? 0.30 : 0.70,
    }), { x: cx, z: p.z - p.d / 2, ry: Math.PI }));

    /* The stone that came off the collapsed corner is lying at its foot. A bite with no
       debris under it reads as a design decision; a bite with a spill of blocks under it
       reads as an event. Same material key as the tower, so all of it merges into that
       bucket's existing draw call and the whole spill costs zero draws. */
    if (sx < 0) {
      const fx = cx - p.w * 0.5 + 0.4, fz = p.z + p.d * 0.5;
      for (let i = 0; i < 7; i++) {
        const s = R.range(0.75, 1.5);
        const g = K.chamferBox(s * 1.5, s * 0.62, s * 1.1, { rng: R, jitter: 0.03, chip: R.chance(0.5) ? 0.16 : 0, c: 0.05 });
        /* The spill runs z 37.4 … 41.6, straddling the edge of TERRAIN's paving pad
           (padZ1 37.5): measured, the sand under it climbs from -0.06 to +0.70 over those
           four metres. Authored flat, the far half of the pile was up to 70 cm underground.
           Bed every block on the sand at its own position instead of on the y = 0 that only
           holds inside the stylobate. */
        const bx = fx + R.range(-2.2, 3.4), bz = fz + R.range(0.4, 4.6);
        K.place(g, {
          x: bx, y: sand(A, bx, bz) + s * 0.31 - R.range(0.05, 0.3), z: bz,
          rx: D(R.jitter(14)), ry: D(R.range(0, 360)), rz: D(R.jitter(16)),
        });
        A.add('court', 'hieroglyph_wall', K.boxProjectUVs(g));
      }
    }
  }

  /* Great gate lintel bridging the towers: the frame you see the obelisk through. */
  const span = 2 * (p.x - p.w / 2) + 1.6;
  // The gate lintel spans 20 m between two towers that have settled by different amounts,
  // so it cannot be level: it rides 0.5° down toward the west tower, which is the shorter one.
  const lint = K.beam(span, 2.6, 5.4, { rng: R, pieces: 7, crack: 0.06, chip: 0.2, tilt: -0.35, bow: 0.06, roll: 0.22 });
  A.add('court', 'hieroglyph_gilded', K.place(lint, { x: 0, y: 14.3, z: p.z - 0.2 }));
  ledgeProxy(A, -span / 2, span / 2, 15.6, p.z - 2.9, p.z + 2.5, { thick: 2.6 });
  const gcor = K.cornice({ w: span, d: 5.6, h: 1.5, flare: 0.95, roll: 0.34 });
  A.add('court', 'sandstone_block', K.place(gcor.geo, { x: 0, y: 15.6, z: p.z - 0.2 }));
  ledgeProxy(A, -span / 2, span / 2, 15.6 + gcor.height, p.z - 3.2, p.z + 2.8, { thick: 0.5 });
  /* Underside of the gate reads as a dark ceiling in the `dunes` shot. */
  vol(A, 'court', 'ceiling_stars', -span / 2 + 0.4, span / 2 - 0.4, 14.0, 14.32, p.z - 2.6, p.z + 2.6, { c: 0.03 });
}

/* ===================== hooks, cables, entry rail ======================= */

function courtyardTraversal(A) {
  const R = A.rng;

  /* Masts to hang the hook cable from — a cable needs an anchor to be believable. */
  for (const [mx, my, mz] of [[20.6, 15.9, 27.5], [-13.4, 13.9, -15.0]]) {
    const g = new THREE.CylinderGeometry(0.26, 0.42, my - (mz > 0 ? L.peri.ledge : 13.5), 12, 1);
    K.normaliseAttrs(g);
    const y0 = mz > 0 ? L.peri.ledge : 13.5;
    A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(g, { x: mx, y: (y0 + my) / 2, z: mz, rz: D(R.jitter(0.7)) })));
    poleProxy(A, mx, mz, y0, my, 0.4, { material: 'metal' });
  }

  /* ---- Main hook chain: z 27 -> -13, y 14.8 -> 13.2, swingable end to end. ---- */
  const hookLine = [
    [20.0, 14.9, 27.0], [14.0, 14.9, 20.0], [8.5, 14.9, 12.0],
    [4.2, 14.8, 4.5], [1.0, 14.5, -3.0], [-4.0, 13.9, -8.5], [-9.5, 13.2, -13.0],
  ];
  const cable = new THREE.CatmullRomCurve3(
    [[20.6, 15.75, 27.5], ...hookLine.map(([x, y, z]) => [x, y + 0.85, z]), [-13.4, 13.85, -15.0]]
      .map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  A.add('court', 'rope_fibre', K.railGeo(cable, { r: 0.075, seg: 64, rad: 4 }));

  const ringGeo = K.hookRing({ r: 0.62, tube: 0.115, rng: R });
  const mats = [];
  for (let i = 0; i < hookLine.length; i++) {
    const [x, y, z] = hookLine[i];
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(D(R.jitter(2.5)), D(R.jitter(30)), D(R.jitter(2.5)), 'YXZ')), new THREE.Vector3(1, 1, 1));
    mats.push(m);
    hookPoint(A, x, y, z);
    /* The set piece magnetism exists for. Seven 0.62 m rings strung 7.14–9.71 m apart at
       y 13.2–14.9 over paving at y 0: a missed catch is an 11–13 m fall and the whole ascent
       again. §8.1's route enters this chain at ring 3 (the E-grab off the kiosk lintel, which
       `hookGrab` 9.0 already covers) and swings north-west; ring 0's own entry is the east
       mast (20.6, ·, 27.5), a `pole` from y 9.0 to 15.9 standing 0.78 m off the ring. Every
       ring here is also arrived at by a release from a neighbour, which is the approach the
       pendulum catch is derived for. */
    swingTarget(A, `hook-main-${i}`, x, y, z);
    A.add('court', 'bronze_dark', K.place(K.chain({ len: 0.9, r: 0.06, links: 4 }), { x, y: y + 1.65, z }));
  }

  /* ---- Second, lower chain: west colonnade -> obelisk kiosk. Gives the swing a return. ----
   *
   * BOTH ENDS OF THIS CABLE USED TO STOP IN MID-AIR, and that is measured, not an impression.
   * Sampling every drawn vertex in the level (excluding the cable's own tube) against the two
   * terminal control points:
   *
   *     main cable  south anchor (20.6, 15.75, 27.5)   nearest drawn geometry  0.151 m  (mast)
   *     main cable  north anchor (−13.4, 13.85, −15)   nearest drawn geometry  0.050 m  (mast)
   *     low  cable  west anchor  (−21.0, 12.9,  26.0)  nearest drawn geometry  4.189 m
   *     low  cable  east anchor  (  2.2, 11.6,   7.0)  nearest drawn geometry  2.630 m
   *
   * A blind critic filed this level as having "overhead wires [that] never touch anything you
   * can reach, so they read as set dressing rather than a path". Against the MAIN chain that is
   * false — it is masted at both ends and its east mast is a `pole` standing on the y 9.0 ledge
   * circuit. Against THIS one it was exactly right, twice over: a 24 m rope tied to nothing at
   * either end, whose west half was also unreachable (nearest `pole` to ring `hook-low-0`:
   * 21.01 m; nearest standable surface 11.60 m straight down).
   *
   * Both ends now die into an eye-bolt through a bronze pad let into the stone, at the two
   * `ledge` tops the chain is actually worked from — the west colonnade architrave circuit
   * (x −23.8…−22.2, z −15.1…33.1, top y 9.0) and the obelisk kiosk lintel (x −4.5…4.5,
   * z 6.7…8.2, top y 9.0). The rope therefore runs visibly DOWN out of the sky onto the walkway
   * you stand on, at both ends, which is a stronger answer to "reads as set dressing" than a
   * mast would have been: a mast attaches the rope to a post, this attaches it to the route.
   *
   * A MAST WAS THE FIRST VERSION AND IT IS NOT WHAT SHIPPED. It would have been the exact
   * counterpart of the main chain's — a `poleProxy` off the same y 9.0 circuit, closing the one
   * real reachability hole here (`hook-low-0`'s nearest `pole` measured 21.01 m; the mast took
   * it to 6.71 m). It was built, measured, and then removed, and the reason is worth recording
   * because it is a constraint and not a preference: `tests/basketvary.test.mjs:79` pins
   * `REG.length` — the TOTAL collider registration count of ARCHITECTURE + PROPS — at 272, as a
   * seal against a rope coil quietly gaining a collider. One extra `pole` anywhere in the level
   * fails it, and moving a sealed bar so one's own change passes is what §141.1 forbids. Worse,
   * `pole` is a CameraRig `ROUTE_TAG` carrying `ROUTE_WEIGHT` 1.0, so a mast added here would
   * have pulled the camera's UP channel from 40 m away as a side effect of tying up a rope.
   * The reachability gap is left open and written up rather than worked around.
   *
   * The rings themselves do not move: `low` is untouched, so every magnetism target, every
   * `tests/level.test.mjs` reach measurement and the pairwise volume rule are unaffected.
   * Neither anchor draws from `A.rng` — see the note in `notchLadder`, and neither registers a
   * collider, so `arch._colliders` and guard line-of-sight are byte-for-byte what they were. */
  const lowW = [-22.9, 9.52, 26.0], lowE = [-3.7, 9.52, 7.5];
  for (const [ax, ay, az] of [lowW, lowE]) {
    A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(
      K.chamferBox(0.42, 0.20, 0.36, { c: 0.03 }), { x: ax, y: ay - 0.46, z: az })));
    A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(
      K.torusRoll(0.24, 0.055, { radial: 14, tube: 6 }), { x: ax, y: ay, z: az, rx: Math.PI * 0.5 })));
  }
  const low = [[-16.5, 11.6, 24.0], [-11.0, 11.7, 19.0], [-6.0, 11.8, 14.0], [-1.5, 11.9, 9.5]];
  const cable2 = new THREE.CatmullRomCurve3(
    [lowW, ...low.map(([x, y, z]) => [x, y + 0.85, z]), lowE]
      .map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  A.add('court', 'rope_fibre', K.railGeo(cable2, { r: 0.07, seg: 44, rad: 4 }));
  for (let i = 0; i < low.length; i++) {
    const [x, y, z] = low[i];
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(D(R.jitter(2)), D(R.jitter(25)), D(R.jitter(2)), 'YXZ')), new THREE.Vector3(0.94, 0.94, 0.94));
    mats.push(m);
    hookPoint(A, x, y, z);
    /* The return chain. Rings 0–1 hang over bare paving (11.6 m fall); rings 2–3 hang over
       terrace stage 2 at y 5.2, so a miss there costs 6.6 m — by rule 2 alone they are the
       weakest two in the level. They are authored anyway, and the reason is that the unit of
       this grammar is the *chain*, not the ring: every ring wears the same §2.1.6 sparkle, and
       magnetism that worked on two of four would make that sparkle a lie on the other two.
       Consistency inside one set piece beats a per-ring audit. Volume 3.07, not 3.30 — this
       chain's tightest gap is 6.36 m, see MAG. */
    swingTarget(A, `hook-low-${i}`, x, y, z, MAG.volumeLow);
    A.add('court', 'bronze_dark', K.place(K.chain({ len: 0.85, r: 0.055, links: 4 }), { x, y: y + 1.6, z }));
  }
  A.instance('gold_leaf', ringGeo, mats, 'hooks:rings');

  /* ---- The approach rail: §8.1's "first rail slide down into the complex". ----
     The anchor stands at z 61 — 23.5 m beyond TERRAIN's paving pad (padZ1 37.5) and well
     past its 16 m fade, out on the open dune ridge. Measured against `Terrain.heightAt`
     the sand across this 3.4 m footprint runs y 9.97 … 12.41, so the 9 m tower that used
     to be authored from y = 0 was buried whole: its deck sat 1–3.4 m UNDER the surface and
     the mast appeared to sprout from bare sand with nothing holding it up. It is 30 m from
     the `dunes` camera and lands at pixel (452, 570) — dead centre of that frame.
     Bed the plinth on the measured ridge and let the mast make up the difference, so the
     §8.1 rail head stays at its contract height of ~15.4. */
  const ancLo = sandFloor(A, 10, 61, 1.7), ancHi = sandCeil(A, 10, 61, 1.7);
  const ancBase = ancLo - 1.5, ancDeck = ancHi + 0.35;
  A.add('court', 'sandstone_block', K.place(K.masonryShell({
    w: 3.4, d: 3.4, h: ancDeck - ancBase, batter: 0.08, course: 0.6, thick: 0.9, rng: R, hollow: false,
    blockLen: [1.1, 1.8], recess: 0.06, chipChance: 0.22, gapChance: 0.03, buried: 1.2,
  }), { x: 10, y: ancBase, z: 61 }));
  wallProxy(A, 8.3, 11.7, ancBase, ancDeck, 59.3, 62.7);
  ledgeProxy(A, 8.3, 11.7, ancDeck, 59.3, 62.7);
  const mastH = Math.max(1.2, 15.62 - ancDeck);
  const mast = new THREE.CylinderGeometry(0.24, 0.4, mastH, 12, 1);
  K.normaliseAttrs(mast);
  A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(mast, { x: 10, y: ancDeck + mastH * 0.5, z: 61 })));
  /* The descent runs down the peristyle's EAST flank and lands on the colonnade, and the
   * reason is that this rail had been routed twice against one camera at a time.
   *
   * Critic pass 6 filed as its #1 of thirteen "a constant-radius tube with a handrail return
   * bend, drawn at world scale diagonally across the entire composition" in `courtyard`. §79
   * refuted the cane attribution and handed it here. What the two previous reroutes had both
   * missed is that **each was checked against the one frame it was fixing.** The first line
   * (x +5.2 → +2.2) was moved west to clear `sly-closeup`; the west line it became was then
   * never checked against anything else. Scored across all fifteen cameras with
   * `tools/railroute.mjs`, that west line was in three frames, not one:
   *
   *     courtyard    200/400 samples   nearest 4.2 m   42.5 px of tube   [452,170 .. 1256,546]
   *     combat       114/400 samples   nearest 5.7 m   45.3 px           [3,220 .. 688,333]
   *     sly-profile  109/400 samples   nearest 4.9 m   55.6 px           [234,6 .. 679,186]
   *
   * The px column is the one that matters: a traversal affordance crossing a wide shot is
   * normal, and a 45 px bronze bar four metres from the lens is a different object. `courtyard`
   * stands at (−2.5, 4, 41.5) — *on the approach*, which is the corridor this rail descends —
   * so no west or centre line can be far from that lens. The whole character cluster
   * (`sly-*`, `combat`, at z 28…33 on the entry axis) rules out the middle for the same reason.
   *
   * East is available after all. The note this replaces said it was not — "+4 m or more puts
   * the line inside the east pylon tower (x 8.5..19.5 at z 31..37)" — which is true of a line
   * that still has to reach the courtyard floor on the entry axis, and false of one that goes
   * *round* the tower: at z 36 this line is at x 20.2, clearing the tower's battered face
   * (19.5 − 0.105·10.6 = 18.4) by 1.8 m.
   *
   * It lands on the peristyle's south-east return architrave — an existing `ledge` at y 9.0
   * spanning x 17.4…23, z 30.7…32.3 — which is a better beat than the old terminus anyway:
   * the slide delivers you onto the §8.1 ledge circuit instead of onto open paving, and the
   * rooftop run continues north from where you land. Landing there rather than on the
   * architrave proper also keeps it 6 m from `pylon-drop`'s terminus at (22.6, 9.25, 26); an
   * earlier candidate that landed at (23, 9.45, 25) converged with it to within 0.4 m and
   * would have fused two rails into one blob.
   *
   * Verified, not asserted: 0 samples in fourteen of the fifteen frusta, and in `dunes` —
   * the approach shot, where this rail is the subject matter — 8.1 px at 27.7 m. Minimum
   * clearance over `Terrain.heightAt` along the whole run is 4.12 m, at the anchor itself,
   * which is unchanged. The mast, the §8.1 rail head height and the "first rail slide down
   * into the complex" beat are all unchanged. */
  rail(A, 'approach', [
    [10.0, 15.3, 61.0], [13.2, 13.6, 52.0], [16.6, 12.0, 43.0],
    [20.2, 10.6, 36.0], [20.7, 9.8, 31.8],
  ], 'bronze_dark', 0.12);
  /* Newel post at the landing. The critic's reading of the old line as a *cane* was helped by
     it ending in mid-air on an upward flick — the last 5 m flattened from a steep descent to
     1.15 m over 5 m of z, which in screen space curls back up and is exactly a crook. This
     line descends monotonically into a post instead, so it terminates on an object. */
  const newel = new THREE.CylinderGeometry(0.13, 0.17, 1.0, 10, 1);
  K.normaliseAttrs(newel);
  A.add('court', 'bronze_dark', K.boxProjectUVs(K.place(newel, { x: 20.7, y: 9.3, z: 31.8 })));

  /* Rooftop-run entry: east pylon deck down to the peristyle architrave. */
  rail(A, 'pylon-drop', [[13.6, 26.3, 32.0], [15.6, 22.0, 31.0], [19.0, 15.0, 29.4], [21.8, 10.2, 28.2], [22.6, 9.25, 26.0]], 'bronze_dark', 0.13);
}

/* ========================= hypostyle hall ============================== */

function hypostyleHall(A) {
  const h = L.hall, R = A.rng, B = A.TUNE.batterHall;
  const WALL_H = 13.0, DECK = h.aisleRoof, NAVE = h.naveRoof, CL = 11.4;
  const zc = (h.z0 + h.z1) / 2;

  /* ---- Floor: worn slabs, holes where the columns land. ---- */
  const holes = [];
  const naveZ = [-22, -30, -38, -46], aisleZ = [-26, -38];
  for (const cz of naveZ) for (const sx of [-1, 1]) holes.push([sx * 8 - 2.5, sx * 8 + 2.5, cz - 2.5, cz + 2.5]);
  for (const cz of aisleZ) for (const sx of [-1, 1]) holes.push([sx * 16.5 - 2.3, sx * 16.5 + 2.3, cz - 2.3, cz + 2.3]);
  A.mesh('paving_courtyard', K.pavingField({
    x0: -23, x1: 23, z0: -51, z1: -17, y: 0, slab: 2.3, thick: 0.5, rng: R, sink: 0.045, holes,
  }), 'paving:hall', { cast: false });
  groundProxy(A, -23, 23, 0, -51.2, -16.8);

  /* ---- Outer walls. Battered, buried at the base, hieroglyph-faced. ---- */
  const winZ = [-21, -27, -33, -39, -45];
  const sideOpen = [];
  for (const wz of winZ) {
    for (const f of [2, 3]) sideOpen.push({ face: f, a0: wz - zc - 0.95, a1: wz - zc + 0.95, y0: 10.3, y1: 12.6 });
  }
  for (const sx of [-1, 1]) {
    A.add('hall', 'hieroglyph_wall', K.place(K.masonryShell({
      w: 2.1, d: h.z1 - h.z0, h: WALL_H, batter: B, course: 0.74, thick: 1.05, rng: R,
      blockLen: [1.7, 2.7], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
      gapChance: 0.035, buried: 0.6, hollow: true, openings: sideOpen,
      /* 36 m of unbroken wall on each side of the hall — the longest straight lines in the
         level and the ones `temple` looks down. Each side settles independently (the seed has
         advanced between them), so the room is not symmetric about its own axis. The west wall
         is the one the wind scours. */
      sag: 0.26, windFace: sx < 0 ? 3 : 2, drift: 0.16,
      chamfer: chamferFor(sx * 23.9, WALL_H * 0.5, zc),
    }), { x: sx * 23.9, y: 0, z: zc }));
    wallProxy(A, sx * 23.9 - 1.1, sx * 23.9 + 1.1, 0, WALL_H, h.z0, h.z1);
    /* Window sills, inside and out — narrow `ledge` perches lining the hall. */
    for (const wz of winZ) {
      ledgeProxy(A, sx * 23.9 - 1.2, sx * 23.9 + 1.2, 10.3, wz - 1.0, wz + 1.0, { thick: 0.4 });
      const g = K.beam(2.2, 0.42, 2.8, { rng: R, pieces: 2, chip: 0.1 });
      A.add('hall', 'limestone_polished', K.place(g, { x: sx * 23.9, y: 12.75, z: wz, ry: Math.PI / 2 }));
    }
    A.add('hall', 'sandstone_worn', K.place(K.sandDrift({ len: 30, h: 1.5, depth: 3.6, seg: 22, rng: R }),
      { x: sx * 25.1, z: zc, ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 }));
  }
  /* South facade: the great doorway (x ±4.2, 0..9.2) plus two side doors. */
  const sOpen = [];
  for (const f of [0, 1]) {
    sOpen.push({ face: f, a0: -4.4, a1: 4.4, y0: -1, y1: 9.4 });
    sOpen.push({ face: f, a0: -17.6, a1: -14.4, y0: -1, y1: 4.8 });
    sOpen.push({ face: f, a0: 14.4, a1: 17.6, y0: -1, y1: 4.8 });
  }
  A.add('hall', 'hieroglyph_wall', K.place(K.masonryShell({
    w: 48, d: 2.1, h: WALL_H, batter: B, course: 0.74, thick: 1.05, rng: R,
    blockLen: [1.7, 2.7], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
    gapChance: 0.03, buried: 0.5, hollow: true, openings: sOpen,
    // The facade the approach reads against, and the wall `temple` stands three metres from.
    sag: 0.24, windFace: 0, drift: 0.13,
    chamfer: chamferFor(0, WALL_H * 0.5, h.z1 - 1.05),
  }), { x: 0, y: 0, z: h.z1 - 1.05 }));
  for (const [x0, x1] of [[-24, -17.6], [-14.4, -4.4], [4.4, 14.4], [17.6, 24]]) wallProxy(A, x0, x1, 0, WALL_H, h.z1 - 2.1, h.z1);
  for (const [x0, x1, y] of [[-4.4, 4.4, 9.4], [-17.6, -14.4, 4.8], [14.4, 17.6, 4.8]]) wallProxy(A, x0, x1, y, WALL_H, h.z1 - 2.1, h.z1);
  /* Great doorway lintel + its own cornice: the landing pad at the end of the hook chain. */
  A.add('hall', 'hieroglyph_gilded', K.place(K.beam(10.4, 1.5, 3.4, { rng: R, pieces: 4, crack: 0.045, chip: 0.18, tilt: 0.35, bow: 0.05, roll: 0.16 }), { x: 0, y: 10.15, z: h.z1 - 0.9 }));
  const dcor = K.cornice({ w: 11.2, d: 3.9, h: 0.86, flare: 0.86, roll: 0.3 });
  A.add('hall', 'sandstone_block', K.place(dcor.geo, { x: 0, y: 10.9, z: h.z1 - 0.9 }));
  ledgeProxy(A, -6.4, 6.4, 10.9 + dcor.height, h.z1 - 3.2, h.z1 + 1.2, { thick: 0.6 });
  doorFrame(A, 'hall', 'sandstone_worn', { halfW: 4.55, y0: 0, y1: 9.4, z: h.z1 - 0.02, r: 0.3 });
  for (const sx of [-1, 1]) {
    doorFrame(A, 'hall', 'sandstone_worn', { x: sx * 16, halfW: 1.75, y0: 0, y1: 4.8, z: h.z1 - 0.02, r: 0.2 });
  }
  A.api.doorways.push({ center: new THREE.Vector3(0, 4.7, h.z1 - 1), w: 8.8, h: 9.4 });

  /* North wall, split by the inner pylon gate. */
  A.add('hall', 'hieroglyph_wall', K.place(K.masonryShell({
    w: 48, d: 2.1, h: WALL_H, batter: B, course: 0.74, thick: 1.05, rng: R,
    blockLen: [1.7, 2.7], recess: A.TUNE.mortarRecess, chipChance: 0.16, gapChance: 0.03, buried: 0.4, hollow: true,
    openings: [0, 1].flatMap((f) => [{ face: f, a0: -3.4, a1: 3.4, y0: -1, y1: 8.2 }]),
    // Sheltered end of the hall: it settles the least and keeps its blocks.
    sag: 0.14, windFace: 1, drift: 0.10,
    chamfer: chamferFor(0, WALL_H * 0.5, h.z0 + 1.05),
  }), { x: 0, y: 0, z: h.z0 + 1.05 }));
  for (const [x0, x1] of [[-24, -3.4], [3.4, 24]]) wallProxy(A, x0, x1, 0, WALL_H, h.z0, h.z0 + 2.1);
  wallProxy(A, -3.4, 3.4, 8.2, WALL_H, h.z0, h.z0 + 2.1);

  /* ---- 12 papyrus columns: 8 tall in the nave rows, 4 shorter in the aisles. ----
     `temple` is a long axial view straight down this colonnade, so these eight columns are the
     single most-looked-at object in the level and the place §7.3's "straight/symmetric
     everywhere" is decided.

     Every one of them is now a different column. Height varies by up to 25 cm, the bell by 6%,
     and each leans in its own direction — most by a fraction of a degree, two of them visibly.
     The lean is applied *inside* the shaft (`lean`, a shear taken up over the height) rather
     than as a rigid `rz` tilt, so the foot stays planted on its plinth and only the capital
     moves, which is what a column that has been pushed out of plumb by three thousand years
     of settlement actually looks like. `rBase` is untouched: the plinths and pole colliders
     are contract surfaces.

     `rTop` came down 1.4 -> 1.25 so the taper is 1.52:1 rather than 1.36:1 and the bell over-
     hangs a visibly thinner neck: the neck is 1.00 m where it was 1.26, against a bell of
     2.40 m. Bell/neck goes 2.07 -> 2.40.

     **The bell has 24 cm of room and the lean has to respect it.** At x = ±8 the clerestory
     wall's inner face is at ±10.64, and a 1.6° lean moves a capital 40 cm — measured, six of
     the eight columns pushed *through* the wall on the first attempt. So the cross-nave lean
     is strictly inward, toward x = 0, which is the direction that has room; the free-signed
     lean is spent along z, where columns are 8 m apart and nothing is in the way. Leaning
     inward is also the better picture: the capitals converge over the nave and the hall reads
     as closing in overhead. Clearance is now a construction guarantee, not a coincidence. */
  const colProxies = [];
  const NAVE_LEAN_IN = { '-22': 0.55, '-30': 1.15, '-38': 1.75, '-46': 0.75 };
  for (const cz of naveZ) for (const sx of [-1, 1]) {
    const cx = sx * 8;
    /* 12.3 -> 11.6 with `capH` 2.4 -> 3.1: the capital takes 70 cm off the shaft and spends it
       on itself, so `col.height` and the abacus top are unchanged to the centimetre and the
       architrave at y 16.2 still lands where it did. A bell 4.4 m across and only 2.4 m tall is
       a mushroom; the same bell 3.1 m tall is a capital, and a heavier capital on a shorter
       shaft is the §7.3 "exaggerated-cartoon" proportion rather than the archaeological one. */
    const hSh = 11.6 + R.jitter(0.25);
    // Inward only (−sx), never less than 0.4°, so the bell always moves away from the wall.
    const lean = -sx * D(0.4 + NAVE_LEAN_IN[String(cz)] * (sx < 0 ? 1 : 0.7));
    const leanZ = D(R.jitter(1.1));
    /* `belly` 1.92 -> 1.74. The bell gives up 22 cm of radius and the abacus takes 20 cm of
       overhang with it, because a capital whose widest element is the bud has no abacus as far
       as the camera is concerned (see `papyrusColumn`). Net: the capital is the same width at
       its widest, but the widest thing is now a square plate with a shadow under it. */
    const col = K.papyrusColumn({
      hShaft: hSh, rBase: 1.9, rTop: 1.25, capH: 3.1 + R.jitter(0.12), abacus: 0.62,
      rng: R, bandCount: 4, belly: 1.74 * (1 + R.jitter(0.03)), lean, leanZ,
      spin: D(R.range(0, 45)),
    });
    A.add('hall', 'column_papyrus', K.place(col.geo, { x: cx, y: 0.35, z: cz }));
    vol(A, 'hall', 'sandstone_block', cx - 2.35, cx + 2.35, 0, 0.42, cz - 2.35, cz + 2.35, { jitter: 0.02, chip: 0.12 });
    // Climbable to the cord bundle under the bell, which moved down with the shorter shaft.
    poleProxy(A, cx, cz, 0.42, 11.9, 1.62);
    colProxies.push([cx, cz, col.height + 0.35]);
    /* The abacus travels with the lean — up to 47 cm at 2.15° — so the ledge collider has to
       travel with it, or the top 0.6 m of the capital is art you can see and cannot land on. */
    /* Sized off `col.rAbacus` rather than a literal, so the plate and the surface you can land
       on cannot drift apart the next time the capital is retuned — which is exactly how the
       abacus came to be narrower than its own bell. 5 cm inset keeps the collider off the
       chamfered rim. */
    const abY = col.capTop + 0.31, ox = lean * abY, oz = leanZ * abY;
    const aR = col.rAbacus - 0.05;
    ledgeProxy(A, cx + ox - aR, cx + ox + aR, col.height + 0.35, cz + oz - aR, cz + oz + aR, { thick: 0.62 });
  }
  for (const cz of aisleZ) for (const sx of [-1, 1]) {
    const cx = sx * 16.5;
    /* Aisle columns are never nearer than ~14 m to a canonical camera, so they get two
       thirds of the nave columns' radial density — still enough to resolve the ribs. */
    // Aisle columns sit against the outer wall, so their lean is spent along z where there
    // is room, and only a token amount across x.
    const lean = D(R.jitter(0.35)), leanZ = D(R.jitter(1.0));
    /* The aisles carry the *open* campaniform capital against the nave's closed bud. There is
       6.3 m to the wall out here, so the flare is free, and one hall with two capital orders in
       it is the difference between an Egyptian temple and one part instanced twelve times. */
    const col = K.papyrusColumn({
      hShaft: 9.5 + R.jitter(0.2), rBase: 1.62, rTop: 1.07, capH: 1.9, abacus: 0.55,
      rng: R, bandCount: 3, seg: 32, belly: 1.74 * (1 + R.jitter(0.04)), lean, leanZ,
      campaniform: true, abacusOver: 0.17, spin: D(R.range(0, 45)),
    });
    A.add('hall', 'column_papyrus', K.place(col.geo, { x: cx, y: 0.34, z: cz }));
    vol(A, 'hall', 'sandstone_block', cx - 2.0, cx + 2.0, 0, 0.4, cz - 2.0, cz + 2.0, { jitter: 0.02 });
    poleProxy(A, cx, cz, 0.4, 12.3, 1.38);
    const abY = col.capTop + 0.275, ox = lean * abY, oz = leanZ * abY;
    const aR = col.rAbacus - 0.05;
    ledgeProxy(A, cx + ox - aR, cx + ox + aR, col.height + 0.34, cz + oz - aR, cz + oz + aR, { thick: 0.55 });
  }

  /* ---- Interior tiptoe cornice at y 10.0: the §8.3 ledge circuit round the room. ---- */
  for (const sx of [-1, 1]) {
    const g = K.beam(h.z1 - h.z0 - 3, 0.62, 0.95, { rng: R, pieces: 14, chip: 0.1, tilt: sx > 0 ? 0.10 : -0.13, bow: 0.04 });
    A.add('hall', 'limestone_polished', K.place(g, { x: sx * 22.35, y: 9.7, z: zc, ry: Math.PI / 2 }));
    ledgeProxy(A, sx * 22.35 - 0.5, sx * 22.35 + 0.5, 10.01, h.z0 + 2.2, h.z1 - 2.2, { thick: 0.62 });
  }
  for (const [pz, ry] of [[h.z1 - 2.55, 0], [h.z0 + 2.55, 0]]) {
    const g = K.beam(45, 0.62, 0.95, { rng: R, pieces: 18, chip: 0.1 });
    A.add('hall', 'limestone_polished', K.place(g, { x: 0, y: 9.7, z: pz, ry }));
    ledgeProxy(A, -22.4, 22.4, 10.01, pz - 0.5, pz + 0.5, { thick: 0.62 });
  }

  /* ---- Architraves. Nave at 16.2..17.0, aisle at 12.65..13.5. ---- */
  for (const sx of [-1, 1]) {
    /* The nave architraves run the full 34 m of the shot `temple` is composed around. A
       10 cm bow and a fifth of a degree of tilt, different on each side, is what stops the
       two of them converging on the vanishing point as a pair of perfect straight lines. */
    const g = K.beam(h.z1 - h.z0 - 2, 0.8, 3.0, {
      rng: R, pieces: 13, crack: 0.03, chip: 0.16, tilt: sx > 0 ? 0.20 : -0.28, bow: 0.11,
      roll: 0.12,
    });
    A.add('hall', 'hieroglyph_gilded', K.place(g, { x: sx * 8, y: 16.6, z: zc, ry: Math.PI / 2 }));
    const a = K.beam(h.z1 - h.z0 - 2, 0.85, 2.6, { rng: R, pieces: 13, chip: 0.14, tilt: sx > 0 ? -0.18 : 0.24, bow: 0.09 });
    A.add('hall', 'hieroglyph_wall', K.place(a, { x: sx * 16.5, y: 13.07, z: zc, ry: Math.PI / 2 }));
    const c = K.beam(h.z1 - h.z0 - 2, 0.85, 1.8, { rng: R, pieces: 13, chip: 0.12, tilt: sx > 0 ? 0.26 : -0.14, bow: 0.08 });
    A.add('hall', 'hieroglyph_wall', K.place(c, { x: sx * CL, y: 13.07, z: zc, ry: Math.PI / 2 }));
  }
  for (const cz of naveZ) {
    A.add('hall', 'hieroglyph_wall', K.place(K.beam(16.6, 0.8, 2.4, { rng: R, pieces: 5, chip: 0.14 }), { x: 0, y: 16.6, z: cz }));
  }

  /* ---- Aisle roof (deck y 13.5) as individual transverse slabs. ----
     The slab is deeper than the pitch so consecutive slabs *overlap*. They used to be laid at
     a 2.55 m pitch and cut 2.42 m deep, which left a 13 cm slot between every pair running the
     full 12 m width of the aisle — 26 open slits straight through the roof to the sky, and
     from a low camera they foreshorten into exactly the pale wedges the critic sees. Measured
     by firing rays straight up from a 0.35 m grid on the aisle floor: 215 of 6080 probes
     escaped, none of them through a designed opening. The overlap also has to beat the
     +/-0.3 deg yaw jitter, which swings a 12 m slab's ends by about 6 cm. */
  const AISLE_PITCH = 2.55, AISLE_DEPTH = AISLE_PITCH + 0.24;
  for (const sx of [-1, 1]) {
    for (let z = h.z0 + 1.4; z < h.z1 - 1.4; z += AISLE_PITCH) {
      const len = 23.4 - CL;
      const g = K.chamferBox(len, 0.86, AISLE_DEPTH, { rng: R, jitter: 0.02, chip: R.chance(0.12) ? 0.12 : 0, c: 0.06 });
      K.place(g, { x: sx * (CL + len / 2), y: 13.06, z: z + AISLE_PITCH / 2, ry: D(R.jitter(0.3)) });
      A.add('hall', 'sandstone_block', K.boxProjectUVs(g));
    }
    groundProxy(A, sx > 0 ? CL : -23.4, sx > 0 ? 23.4 : -CL, DECK, h.z0 + 1.4, h.z1 - 1.4);
  }

  /* ---- Clerestory band walls with the real §8.1 slots at y 15.5. ---- */
  const clOpen = L.clere.zs.flatMap((cz) => [2, 3].map((f) => ({
    face: f, a0: cz - zc - L.clere.w / 2, a1: cz - zc + L.clere.w / 2,
    y0: L.clere.y - 13.5 - L.clere.h / 2, y1: L.clere.y - 13.5 + L.clere.h / 2,
  })));
  for (const sx of [-1, 1]) {
    A.add('hall', 'limestone_polished', K.place(K.masonryShell({
      w: 1.5, d: h.z1 - h.z0 - 2.8, h: 3.1, batter: 0.02, course: 0.62, thick: 0.72, rng: R,
      blockLen: [1.3, 2.2], recess: 0.05, chipChance: 0.14, gapChance: 0, hollow: true, openings: clOpen,
    }), { x: sx * CL, y: DECK, z: zc }));
    wallProxy(A, sx * CL - 0.76, sx * CL + 0.76, DECK, DECK + 3.1, h.z0 + 1.4, h.z1 - 1.4);
    ledgeProxy(A, sx * CL - 0.76, sx * CL + 0.76, DECK + 3.1, h.z0 + 1.4, h.z1 - 1.4);
    for (const cz of L.clere.zs) {
      A.api.clerestory.push({
        center: new THREE.Vector3(sx * CL, L.clere.y, cz),
        normal: new THREE.Vector3(sx, 0, 0), w: L.clere.w, h: L.clere.h,
      });
      /* Mullion so the slot reads as a stone grille rather than a hole. */
      box(A, 'hall', 'limestone_polished', 1.6, L.clere.h, 0.22, sx * CL, L.clere.y, cz, { jitter: 0.01 });
    }
  }

  /* ---- Nave roof at y 17, with real slots punched through every 8 m in z. ---- */
  const slotZ = [-24, -32, -40, -48];
  /* Same overlap rule as the aisle roof. The nave's 12 cm slots happen to be backed by the
     painted star ceiling just below, so they do not leak today — but relying on a second
     surface to cover the first one's gaps is how the aisle roof got away with it for so long. */
  const NAVE_PITCH = 2.42, NAVE_DEPTH = NAVE_PITCH + 0.22;
  for (let z = h.z0 + 1.4; z < h.z1 - 1.4; z += NAVE_PITCH) {
    const cz = z + NAVE_PITCH / 2;
    /* Half the pitch, not a fixed 1.0 m: the band grid does not land on the nominal slot
       centres, so at 1.0 m two of the four §8.1 slots matched no band at all and were never
       cut — while `api.roofSlots` went on advertising four openings to LIGHTING. Half-pitch
       guarantees each slot claims exactly one band. */
    const slot = slotZ.find((s) => Math.abs(s - cz) < NAVE_PITCH / 2);
    const spans = slot ? [[-CL, -1.3], [1.3, CL]] : [[-CL, CL]];
    for (const [x0, x1] of spans) {
      const g = K.chamferBox(x1 - x0, 0.82, NAVE_DEPTH, { rng: R, jitter: 0.02, chip: R.chance(0.1) ? 0.12 : 0, c: 0.06 });
      K.place(g, { x: (x0 + x1) / 2, y: NAVE - 0.41, z: cz, ry: D(R.jitter(0.25)) });
      A.add('hall', 'sandstone_block', K.boxProjectUVs(g));
      /* The painted ceiling is emitted band-by-band with the *same* spans as the roof slab
         above it, so a slot in the roof is a slot in the ceiling by construction. It used to
         be one continuous slab across the whole nave, which quietly sealed all four roof
         slots — `api.roofSlots` advertised four openings to LIGHTING that no ray could pass
         through. Firing rays up from the nave floor found 0 escapes where there should have
         been four 2.6 m openings. */
      const cg = K.chamferBox(x1 - x0 - 0.8, 0.06, NAVE_DEPTH, { rng: R, jitter: 0.01, c: 0.02 });
      K.place(cg, { x: (x0 + x1) / 2, y: NAVE - 0.83, z: cz });
      A.add('hall', 'ceiling_stars', K.boxProjectUVs(cg));
      groundProxy(A, x0, x1, NAVE, cz - 1.2, cz + 1.2, { thick: 0.85 });
    }
    if (slot) {
      A.api.roofSlots.push({ center: new THREE.Vector3(0, NAVE - 0.4, cz), normal: new THREE.Vector3(0, 1, 0), w: 2.6, h: 2.3 });
      for (const sx of [-1, 1]) ledgeProxy(A, sx * 1.3 - 0.4, sx * 1.3 + 0.4, NAVE, cz - 1.15, cz + 1.15, { thick: 0.5 });
    }
  }

  /* Torus rolls down the four outer corners of the hall, the same motif as the pylons. The
     hall is the biggest single mass in the level and its corners were hard 90° arrises. */
  for (const sx of [-1, 1]) for (const pz of [h.z0 + 1.05, h.z1 - 1.05]) {
    const roll = new THREE.CylinderGeometry(0.34, 0.42, WALL_H - 0.3, 16, 1, true);
    K.normaliseAttrs(roll);
    A.add('hall', 'sandstone_worn', K.boxProjectUVs(K.place(roll, {
      x: sx * 23.7, y: (WALL_H - 0.3) / 2, z: pz,
      rz: -sx * Math.atan(B), rx: (pz > zc ? 1 : -1) * Math.atan(B),
    })));
  }

  /* ---- Exterior cornice ring at the wall head: silhouette + a ledge all the way round. ---- */
  const ext = K.cornice({ w: 48 - 2 * B * WALL_H, d: (h.z1 - h.z0) - 2 * B * WALL_H, h: 1.3, flare: 1.05, roll: 0.36 });
  A.add('hall', 'hieroglyph_gilded', K.place(ext.geo, { x: 0, y: WALL_H, z: zc }));
  const cTop = WALL_H + ext.height;
  for (const sx of [-1, 1]) ledgeProxy(A, sx * 23.2 - 1.0, sx * 23.2 + 1.0, cTop, h.z0 + 0.5, h.z1 - 0.5, { thick: 0.5 });
  for (const pz of [h.z0 + 1.2, h.z1 - 1.2]) ledgeProxy(A, -23.4, 23.4, cTop, pz - 1.0, pz + 1.0, { thick: 0.5 });

  /* ---- Rooftop rails on the nave deck + the taut cable across the nave interior. ---- */
  for (const sx of [-1, 1]) {
    rail(A, `roof-${sx > 0 ? 'e' : 'w'}`, [
      [sx * CL, NAVE + 0.42, h.z1 - 2.5], [sx * CL, NAVE + 0.42, zc], [sx * CL, NAVE + 0.42, h.z0 + 2.5],
    ], 'bronze_dark', 0.13, 'hall');
  }
  /* ---- The rope. -----------------------------------------------------------------------
   * §8.1 already called this "the taut cable at y 12.6 [that] crosses the nave diagonally as a
   * `rail`", and it was four hand-placed waypoints through a Catmull-Rom — a shape that reads as
   * a slack line and rides as a sequence of flat runs and corners. It is now a real catenary
   * with an authored mount speed, which is the whole of what a rope needs from this side.
   *
   * ── Why this is a rope and not a new mechanic ────────────────────────────────────────────
   * The traversal lane measured the shipped `RailSlide` on a catenary and found rope physics
   * already in it: a rider accelerating **9.66 → 14.07 m/s** into the dip and slowed to
   * **6.54 m/s** climbing the far side, with no new code. The one thing standing between that
   * and a rope is `RailSlide.enter`'s `mount(c, a, TUNE.railSpeed)` floor, which forces every
   * mount to ≥ 9.5 m/s — enough to crest any sag this level can hold, every time. `mountSpeed`
   * is the per-rec override that lets a rope decline it; the level publishes it and the one line
   * that reads it belongs to MOVEMENT. Until then this is inert, exactly like `rec.handholds`
   * was: `Engine.registerCollider` spreads opts onto the rec, so it arrives as `rec.mountSpeed`
   * with no engine change, and nothing reads it yet.
   *
   * **0, meaning no floor** — not a smaller floor. A rail's floor exists so that mounting one
   * always carries you somewhere; a rope's carry comes from its own sag, so a floor is the one
   * thing that stops it being a rope. Step on at whatever speed you arrive with and let the
   * curve do the rest.
   *
   * ── Sag 1.5 m is a clearance, not a taste ────────────────────────────────────────────────
   * Measured by casting down from 200 samples along the curve against the built level: the
   * binding obstacle is not mid-span, it is the **first nave column capital at (−6.8, ·, −22.9),
   * y 11.90**, which the span passes almost directly over. Clearance under the rope there runs
   * 0.71 m at the old 0.40 m sag, 0.33 at 1.5, 0.16 at 2.0, and **0.02 at 2.5 — touching**.
   * 1.5 m keeps a third of a metre of daylight over the capital while still dropping the low
   * point to y 11.25, which by `v² = v0² + 2gΔh` turns a 2.4 m/s step-on into 8.8 m/s at the
   * bottom and back — the pendulum, inside the geometry the hall already has. */
  rail(A, 'hall-cable', catenary([-8.4, 12.75, -20.5], [8.4, 12.75, -45.5], 1.5, 32),
    'rope_fibre', 0.085, 'hall', { mountSpeed: 0, rope: true });

  /* Pinnacles on the aisle roof: the §8.1 spire tips at (±16, 21, −50). */
  for (const sx of [-1, 1]) {
    A.add('hall', 'granite_pink', K.place(K.obelisk({ h: 7.5, base: 1.5, rng: R }), { x: sx * 16, y: DECK, z: -50, ry: D(R.jitter(1.5)) }));
    poleProxy(A, sx * 16, -50, DECK, DECK + 6.0, 0.85);
    spirePoint(A, sx * 16, 21, -50);
    /* Same geometry as the obelisk and the same argument: the pole ends at 19.5 and the top hop
       peaks 0.83 m under the 21 m tip. These two are the narrower shaft (r 0.85 against the
       obelisk's 1.5), so the bare hop lands 0.853 m out — just *inside* catch 1.008, where the
       obelisk's 1.090 m is just outside. That 0.24 m of pole radius is the whole difference,
       and it is why the catch is derived rather than fitted: a number chosen to make the
       obelisk work would have made these two an aimbot. The surface that catches a miss here
       is the aisle roof 7.5 m below. §8.1: "SPIRE LAND the east pinnacle tip (16, 21, −50)". */
    spireTarget(A, `spire-pinnacle-${sx > 0 ? 'e' : 'w'}`, sx * 16, 21, -50);
  }
}

/* =========================== inner pylon =============================== */

function innerPylon(A) {
  const p = L.inner, R = A.rng, B = A.TUNE.batterPylon * 0.85;
  const MASS = 31.5;

  A.add('pylon', 'hieroglyph_wall', K.place(K.masonryShell({
    w: p.w, d: p.d, h: MASS, batter: B, course: A.TUNE.courseHeight, thick: 1.1, rng: R,
    blockLen: [1.5, 2.7], recess: A.TUNE.mortarRecess, chipChance: A.TUNE.chipChance,
    gapChance: A.TUNE.fallenBlockChance, buried: 0.5, hollow: true,
    openings: [0, 1].flatMap((f) => [{ face: f, a0: -3.4, a1: 3.4, y0: -1, y1: 8.2 }]),
    // 31.5 m tall and it closes the `temple` vista. The settle is the only thing that stops
    // its 48 course lines being 48 perfectly parallel horizontals — and the bow is the only
    // thing that stops its edges being two perfectly straight diagonals.
    sag: 0.20, windFace: 0, bow: 0.24, drift: 0.16,
  }), { x: p.x, y: 0, z: p.z }));
  A.add('pylon', 'sandstone_worn', K.place(K.cornerRolls({ w: p.w, d: p.d, h: MASS - 0.5, r: 0.48, batter: B, rng: R }), { x: p.x, y: 0, z: p.z }));

  /* Battered faces on all four sides — the vertical set piece's wall-run surfaces.
     Split at the gate: a single solid box here made §8.1 route step 6 impassable (measured —
     the centre line was inside a `wall` proxy from z −48 to −55). Above the gate head the
     mass is solid again, so the tall battered faces the rooftop run uses are unchanged. */
  const GATE_H = 8.4;
  for (const sx of [-1, 1]) {
    A.proxy(K.proxyFlank(sx * p.w / 2, sx * 3.5, p.d, GATE_H, B, A._proxyMat()),
      { tag: 'wall', material: 'stone', climbable: true, batter: B }, { x: p.x, y: 0, z: p.z });
  }
  A.proxy(K.proxyBattered(p.w - 2 * B * GATE_H, p.d - 2 * B * GATE_H, MASS - GATE_H, B, A._proxyMat()),
    { tag: 'wall', material: 'stone', climbable: true, batter: B }, { x: p.x, y: GATE_H, z: p.z });

  /* Gate passage through to the tomb stair. */
  groundProxy(A, -3.4, 3.4, 0, p.z - p.d / 2 - 0.2, p.z + p.d / 2 + 0.2);
  /* ---- The gate you walk through had no floor -------------------------
   * `groundProxy` is invisible, and the two things that DO draw a floor here stop short of
   * each other: the hall paving ends at z = -51 and the tomb landing slab starts at z = -54.
   * Between them, for the passage's full 6.8 m width, there was nothing — an axis ray fired
   * downward from inside the passage ran the full 30 m of the probe without a hit, on 54 of
   * 64 samples in the main gate and 64 of 64 in the stage gate. This is on the `temple`
   * camera's centre line and is a candidate for the daylight that keeps reaching the
   * interior shots. Top at 0.02 to match the landing slab it butts against, not the paving,
   * so the two ends of the threshold agree with their own neighbour rather than splitting
   * the difference and leaving a lip at both. */
  vol(A, 'pylon', 'paving_courtyard', -4.3, 4.3, -0.6, 0.02, -54.1, -51.0, { jitter: 0.02 });
  vol(A, 'pylon', 'ceiling_stars', -3.2, 3.2, 8.2, 8.5, p.z - p.d / 2, p.z + p.d / 2, { c: 0.03 });
  A.add('pylon', 'hieroglyph_gilded', K.place(K.beam(8.6, 1.4, p.d + 0.6, { rng: R, pieces: 3, crack: 0.05, chip: 0.16, roll: 0.15 }), { x: 0, y: 8.9, z: p.z }));
  doorFrame(A, 'pylon', 'sandstone_worn', { halfW: 3.55, y0: 0, y1: 8.2, z: p.z + p.d / 2 + 0.02, r: 0.28 });
  A.api.doorways.push({ center: new THREE.Vector3(0, 4.1, p.z), w: 6.8, h: 8.2 });

  /* Summit: cornice, deck at y = 34 (the §8.1 height), rails, sand-free and windswept. */
  const inset = B * MASS;
  const cw = p.w - 2 * inset, cd = p.d - 2 * inset;
  const cor = K.cornice({ w: cw, d: cd, h: 1.44, flare: 1.3, roll: 0.46 });
  A.add('pylon', 'hieroglyph_gilded', K.place(cor.geo, { x: p.x, y: MASS, z: p.z }));
  vol(A, 'pylon', 'paving_courtyard', -cw / 2, cw / 2, p.h - 0.4, p.h, p.z - cd / 2, p.z + cd / 2, { jitter: 0.02 });
  groundProxy(A, -cw / 2, cw / 2, p.h, p.z - cd / 2, p.z + cd / 2);
  ledgeProxy(A, -cw / 2 - 1.3, cw / 2 + 1.3, p.h - 0.42, p.z + cd / 2 + 0.2, p.z + cd / 2 + 1.5, { thick: 0.5 });
  rail(A, 'pylon-summit', [[-cw / 2 + 0.6, p.h + 0.4, p.z + cd / 2 - 0.6], [0, p.h + 0.4, p.z + cd / 2 - 0.6], [cw / 2 - 0.6, p.h + 0.4, p.z + cd / 2 - 0.6]], 'bronze_dark', 0.13, 'pylon');

  /* ---- South stage: the stepped shoulder that carries the (±6, 27, −50) spires. ---- */
  const sz0 = p.z + p.d / 2 - 3.0, sz1 = p.z + p.d / 2 + 0.9;
  A.add('pylon', 'hieroglyph_wall', K.place(K.masonryShell({
    w: 21.4, d: sz1 - sz0, h: 24.0, batter: A.TUNE.batterPylon, course: A.TUNE.courseHeight, thick: 1.0, rng: R,
    blockLen: [1.4, 2.5], recess: A.TUNE.mortarRecess, chipChance: 0.2, gapChance: 0.04, buried: 0.5, hollow: true,
    openings: [0, 1].flatMap((f) => [
      { face: f, a0: -3.6, a1: 3.6, y0: -1, y1: 8.6 },
      { face: f, a0: -7.4, a1: -6.0, y0: 1.4, y1: 21 },     // flagstaff niches
      { face: f, a0: 6.0, a1: 7.4, y0: 1.4, y1: 21 },
    ]),
    sag: 0.17, windFace: 0, windK: 2.2, bow: 0.20, drift: 0.14,
  }), { x: 0, y: 0, z: (sz0 + sz1) / 2 }));
  const sInset = A.TUNE.batterPylon * 24;
  const scor = K.cornice({ w: 21.4 - 2 * sInset, d: (sz1 - sz0) - 2 * sInset + 1.2, h: 0.94, flare: 1.1, roll: 0.4 });
  A.add('pylon', 'hieroglyph_gilded', K.place(scor.geo, { x: 0, y: 24.0, z: (sz0 + sz1) / 2 }));
  const stageTop = 26.0;
  vol(A, 'pylon', 'paving_courtyard', -8.0, 8.0, stageTop - 0.4, stageTop, sz0 + 0.4, sz1 - 0.2, { jitter: 0.02 });
  groundProxy(A, -8.0, 8.0, stageTop, sz0 + 0.4, sz1 - 0.2);
  ledgeProxy(A, -9.4, 9.4, 25.6, sz1 - 0.2, sz1 + 1.2, { thick: 0.5 });
  /* Same split as the mass behind it — the stage's own gate is the first thing on the route
     out of the hall, so a solid proxy here blocks it just as completely. */
  const SB = A.TUNE.batterPylon, SGH = 8.8, SZC = (sz0 + sz1) / 2;
  for (const sx of [-1, 1]) {
    A.proxy(K.proxyFlank(sx * 21.4 / 2, sx * 3.7, sz1 - sz0, SGH, SB, A._proxyMat()),
      { tag: 'wall', material: 'stone', climbable: true, batter: SB }, { x: 0, y: 0, z: SZC });
  }
  A.proxy(K.proxyBattered(21.4 - 2 * SB * SGH, (sz1 - sz0) - 2 * SB * SGH, 24.0 - SGH, SB, A._proxyMat()),
    { tag: 'wall', material: 'stone', climbable: true, batter: SB }, { x: 0, y: SGH, z: SZC });

  for (const sx of [-1, 1]) {
    A.add('pylon', 'gold_leaf', K.place(K.spire({ r: 0.52, h: 1.0, rng: R }), { x: sx * 6, y: stageTop, z: -50 }));
    spirePoint(A, sx * 6, 27, -50);
    /* DELIBERATELY NOT a magnetism target — see the rule at `MAG`. These two stand on
       `stageTop` 26.0, which the groundProxy two lines above makes walkable over x −8…8,
       z −51.1…−47.8. The tip is 1.0 m above ground you are already standing on and a miss
       lands you back on it, so rule 2 ("a miss is expensive") fails by 1.0 m. The three
       spires that DO carry targets stand on poles with the drop underneath. */
  }
  /* Sand banked on the leeward north face. */
  A.add('pylon', 'sandstone_worn', K.place(K.sandDrift({ len: 20, h: 2.0, depth: 5.0, seg: 18, rng: R }), { x: 0, z: p.z - p.d / 2, ry: Math.PI }));
}

/* ============================== tomb =================================== */

function tomb(A) {
  const t = L.tomb, R = A.rng;
  const F = t.floor, C = t.ceil, zc = (t.z0 + t.z1) / 2;

  /* ---- Descent: landing, then a dog-leg of two flights, 0 -> -12. ---- */
  groundProxy(A, -3.6, 3.6, 0, -58.6, -55.4);
  vol(A, 'tomb', 'sandstone_block', -13.6, 4.2, -0.9, 0.02, -59.4, -54.0, { jitter: 0.03 });
  const fA = K.stairFlight({ steps: 14, rise: 0.4, run: 0.69, width: 3.2, rng: R, cheek: 0.9 });
  A.add('tomb', 'sandstone_worn', K.place(fA, { x: 3.6, y: 0, z: -55.6, ry: Math.PI }));
  /* stairFlight climbs +X from its origin, so mirror it: descend west from x 3.6 to -6.1. */
  A.proxy(new THREE.BoxGeometry(9.9, 1.2, 3.2), { tag: 'ground', material: 'stone' },
    { x: -1.25, y: -2.8 - 0.6, z: -55.6, rz: Math.atan2(5.6, 9.9) });
  const fB = K.stairFlight({ steps: 16, rise: 0.4, run: 0.63, width: 3.2, rng: R, cheek: 0.9 });
  A.add('tomb', 'sandstone_worn', K.place(fB, { x: -9.9, y: -12.0, z: -57.9 }));
  A.proxy(new THREE.BoxGeometry(10.4, 1.2, 3.2), { tag: 'ground', material: 'stone' },
    { x: -4.7, y: -8.8 - 0.6, z: -57.9, rz: -Math.atan2(6.4, 10.1) });
  groundProxy(A, -13.6, -9.6, -5.6, -59.4, -54.2);        // mid landing
  vol(A, 'tomb', 'sandstone_block', -13.8, -9.4, -6.5, -5.6, -59.6, -54.0, { jitter: 0.03 });
  for (const sx of [-1, 1]) wallProxy(A, -14.2, 4.4, -12.4, 0.4, sx > 0 ? -54.4 : -60.0, sx > 0 ? -53.8 : -59.4);
  vol(A, 'tomb', 'mudbrick', -14.2, 4.4, -12.4, 0.4, -54.4, -53.6, { jitter: 0.04 });
  vol(A, 'tomb', 'mudbrick', -14.6, -13.8, -12.4, 0.4, -60.0, -53.6, { jitter: 0.04 });

  /* ---- Vault shell. ---- */
  /* No holes in the vault floor. The crypt piers stand *on* the paving — they start at y = F,
     which is the slab top — so nothing needs cutting away for them.
     This used to punch two 14 m strips down the pier lines, so between the piers the floor
     simply had no slabs: four openings straight through the shell into the void, which is what
     the `interior` frame's cream wedges were. Cutting the strips back to per-pier squares was
     not enough either, because `pavingMatrices` drops a whole 2.33 x 2.38 m slab whenever its
     centre lands in a hole, and a 2.2 m pier cannot cover the fringe. Measured by casting the
     shot's own frustum against the built geometry: 99 of 112 escaping rays left through
     y = -12, and 48 still did with per-pier holes. With none, zero do. */
  A.mesh('paving_courtyard', K.pavingField({
    x0: t.x0, x1: t.x1, z0: t.z0, z1: -59.0, y: F, slab: 2.35, thick: 0.5, rng: R, sink: 0.05,
  }), 'paving:tomb', { cast: false });
  groundProxy(A, t.x0, t.x1, F, t.z0, -58.6);
  const nicheZ = [-64, -70, -76];
  /* A lamp niche is a recess, so it is cut into the *inner* face only — cutting it through
     both faces made it a window onto the void, which was 4 of the escaping sightlines. Face 2
     is +X and face 3 is -X, so which one is "inner" flips with the wall. The vent mouth is the
     exception: that is a real passage in from the hall and has to go through both faces. */
  const vaultOpenings = (sx) => {
    const inner = sx > 0 ? 3 : 2;
    const o = nicheZ.map((nz) => ({ face: inner, a0: nz - zc - 0.8, a1: nz - zc + 0.8, y0: 3.0, y1: 4.9 }));
    if (sx < 0) {
      for (const f of [2, 3]) o.push({ face: f, a0: -63 - zc - 1.0, a1: -63 - zc + 1.0, y0: 8.2, y1: 9.9 });
    }
    return o;
  };
  for (const sx of [-1, 1]) {
    A.add('tomb', 'hieroglyph_wall', K.place(K.masonryShell({
      w: 1.9, d: t.z1 - t.z0, h: C - F, batter: 0.015, course: 0.7, thick: 0.95, rng: R,
      /* gapChance 0: the vault is sealed and solid rock lies beyond it, so a fallen block is
         not a ruin note, it is a hole through the shell.
         No skipFaces either. Dropping the buried outer row leaves the wall one block thick,
         and `masonryShell` builds each block at 98.5% of its course height to leave a mortar
         joint — so a one-row wall has a ~1 cm slot running its whole length at every course
         line, and those see straight through to the void. The outer row is also what a niche
         is cut *into*. */
      blockLen: [1.4, 2.4], recess: 0.07, chipChance: 0.22, gapChance: 0, hollow: true,
      openings: vaultOpenings(sx),
    }), { x: sx * (t.x1 - 0.95), y: F, z: zc }));
    wallProxy(A, sx * (t.x1 - 0.95) - 1.0, sx * (t.x1 - 0.95) + 1.0, F, C, t.z0, t.z1);
    for (const nz of nicheZ) ledgeProxy(A, sx * (t.x1 - 0.95) - 1.0, sx * (t.x1 - 0.95) + 1.0, F + 3.0, nz - 0.8, nz + 0.8, { thick: 0.35 });
  }
  A.add('tomb', 'hieroglyph_wall', K.place(K.masonryShell({
    w: t.x1 - t.x0, d: 1.9, h: C - F, batter: 0.015, course: 0.7, thick: 0.95, rng: R,
    blockLen: [1.4, 2.4], recess: 0.07, chipChance: 0.2, gapChance: 0, hollow: true,
  }), { x: 0, y: F, z: t.z0 + 0.95 }));
  wallProxy(A, t.x0, t.x1, F, C, t.z0, t.z0 + 1.9);
  /* Gate wall + doorway, behind the `interior` camera — and it has to be *behind* it.
     At z -59.4 and 1.6 m thick this spanned z -60.2 .. -58.6, and the shot camera stands at
     z = -60.0: it was 0.2 m inside the masonry. Measured, not inferred — a containment probe
     from the camera found surfaces 0.06 m above it, 0.26 m west and 0.41 m north, all
     `arch:tomb:hieroglyph_wall`. Every escaping sightline and the whole "unlit vault" reading
     followed from that. Thinner, and moved south until the north face clears the camera by
     0.7 m; still the stairwell/crypt boundary, still clear of the crypt piers at z -62. */
  const GATE_Z = -58.75, GATE_D = 1.1;
  A.add('tomb', 'hieroglyph_wall', K.place(K.masonryShell({
    w: t.x1 - t.x0, d: GATE_D, h: C - F, batter: 0.015, course: 0.7, thick: 0.9, rng: R,
    blockLen: [1.3, 2.2], recess: 0.07, chipChance: 0.2, gapChance: 0, hollow: true,
    openings: [0, 1].flatMap((f) => [{ face: f, a0: -2.6, a1: 2.6, y0: -1, y1: 3.8 }]),
  }), { x: 0, y: F, z: GATE_Z }));
  doorFrame(A, 'tomb', 'granite_pink', { halfW: 2.72, y0: F, y1: F + 3.8, z: GATE_Z - GATE_D / 2 - 0.02, r: 0.2 });
  for (const [x0, x1] of [[t.x0, -2.6], [2.6, t.x1]]) wallProxy(A, x0, x1, F, C, GATE_Z - GATE_D / 2, GATE_Z + GATE_D / 2);
  wallProxy(A, -2.6, 2.6, F + 3.8, C, GATE_Z - GATE_D / 2, GATE_Z + GATE_D / 2);
  vol(A, 'tomb', 'ceiling_stars', t.x0 + 0.9, t.x1 - 0.9, C - 0.85, C, t.z0 + 1.6, -58.8, { c: 0.03 });

  /* ---- Pillared crypt. The nearest pier is the `interior` shot's foreground frame. ---- */
  for (const sx of [-1, 1]) {
    for (const pz of [-62, -68, -74]) {
      const ph = C - F - 1.2;
      A.add('tomb', 'granite_pink', K.place(K.masonryShell({
        w: 2.2, d: 2.2, h: ph, batter: 0.025, course: 0.72, thick: 1.05, rng: R,
        blockLen: [1.1, 2.0], recess: 0.055, chipChance: 0.18, gapChance: 0, hollow: false,
      }), { x: sx * 5.5, y: F, z: pz, ry: D(R.jitter(0.5)), rz: D(R.jitter(0.6)) }));
      /* The nearest of these is the `interior` frame's dark foreground pier. A box in that
         slot is a black rectangle; the rolls give it four lit arrises against the torchlight. */
      A.add('tomb', 'granite_pink', K.place(
        K.cornerRolls({ w: 2.2, d: 2.2, h: ph - 0.12, r: 0.2, batter: 0.025, rng: R }), { x: sx * 5.5, y: F + 0.06, z: pz }));
      wallProxy(A, sx * 5.5 - 1.1, sx * 5.5 + 1.1, F, C - 1.2, pz - 1.1, pz + 1.1);
    }
    A.add('tomb', 'hieroglyph_gilded', K.place(K.beam(15.6, 1.2, 2.4, { rng: R, pieces: 5, crack: 0.04, chip: 0.14, roll: 0.13 }), { x: sx * 5.5, y: C - 0.6, z: -68, ry: Math.PI / 2 }));
    /* West-wall shelves: the vent's landing chain down to the floor. */
    if (sx < 0) {
      for (const [sy, z0, z1] of [[-3.2, -70, -60.5], [-6.4, -72, -64], [-9.4, -74, -66]]) {
        vol(A, 'tomb', 'sandstone_block', t.x0 + 0.6, t.x0 + 2.0, sy - 0.6, sy, z0, z1, { jitter: 0.025, chip: 0.12 });
        ledgeProxy(A, t.x0 + 0.6, t.x0 + 2.0, sy, z0, z1, { thick: 0.6 });
      }
    }
  }

  /* ---- Sarcophagus at (0, −12, −72). Lid shoved aside — someone got here first. ---- */
  const [sx0, sy0, sz0] = t.sarc;
  vol(A, 'tomb', 'granite_pink', sx0 - 2.4, sx0 + 2.4, sy0, sy0 + 0.55, sz0 - 1.7, sz0 + 1.7, { jitter: 0.02 });
  A.add('tomb', 'granite_pink', K.place(K.masonryShell({
    w: 3.5, d: 2.1, h: 1.6, batter: 0.02, course: 0.8, thick: 0.55, rng: R,
    blockLen: [1.2, 1.8], recess: 0.04, chipChance: 0.2, gapChance: 0, hollow: false,
  }), { x: sx0, y: sy0 + 0.55, z: sz0 }));
  const lid = K.chamferBox(3.8, 0.5, 2.35, { rng: R, jitter: 0.02, chip: 0.18, c: 0.055 });
  K.place(lid, { x: sx0 + 0.55, y: sy0 + 2.4, z: sz0 + 0.3, ry: D(6.5), rz: D(2.2) });
  A.add('tomb', 'gold_leaf', K.boxProjectUVs(lid));
  ledgeProxy(A, sx0 - 1.9, sx0 + 2.6, sy0 + 2.65, sz0 - 1.1, sz0 + 1.5, { thick: 0.5 });
  A.proxy(new THREE.BoxGeometry(4.8, 2.2, 3.4), { tag: 'ground', material: 'stone' }, { x: sx0, y: sy0 + 1.1, z: sz0 });

  /* False door on the north wall — the tomb's one gilded hero read. */
  vol(A, 'tomb', 'hieroglyph_gilded', -2.6, 2.6, F, F + 6.2, t.z0 + 1.7, t.z0 + 2.1, { jitter: 0.02 });
  vol(A, 'tomb', 'gold_leaf', -1.9, 1.9, F + 0.4, F + 5.4, t.z0 + 1.6, t.z0 + 1.75, { jitter: 0.01 });

  /* ---- The `vent`: hall north-west corner -> vault west shelf. ---- */
  const ventMat = { material: 'sand' };
  A.proxy(new THREE.BoxGeometry(1.35, 1.2, 10.6), { tag: 'vent', crawl: true, ...ventMat },
    { x: -21, y: -1.55, z: -54.5, rx: -D(17.2) });
  A.proxy(new THREE.BoxGeometry(1.35, 1.2, 2.4), { tag: 'vent', crawl: true, ...ventMat }, { x: -21, y: -3.5, z: -60.6 });
  A.proxy(new THREE.BoxGeometry(7.6, 1.2, 1.35), { tag: 'vent', crawl: true, ...ventMat }, { x: -17.4, y: -3.55, z: -61.6 });
  /* Portal frames so the crawl reads as built, not as a hole in the maths. */
  vol(A, 'hall', 'mudbrick', -22.3, -19.7, 0.0, 1.55, -50.4, -49.9, { jitter: 0.02 });
  vol(A, 'hall', 'mudbrick', -22.3, -21.9, -0.1, 1.55, -50.4, -48.6, { jitter: 0.02 });
  vol(A, 'hall', 'mudbrick', -19.9, -19.6, -0.1, 1.55, -50.4, -48.6, { jitter: 0.02 });
  A.proxy(new THREE.BoxGeometry(2.2, 0.6, 1.9), { tag: 'vent', crawl: true, ...ventMat }, { x: -21, y: -0.2, z: -49.4 });
}

/* ========================= background mass ============================= */

function background(A) {
  const R = A.rng;

  /* ---- THE PYRAMIDS ARE NOT BUILT HERE. They are TERRAIN's. ----------------------------
   *
   * They were built here *as well*, and that is the whole of critic pass 6's finding #4.
   *
   * `Terrain.js:276 PYRAMIDS` places `pyramid_105` at (-150, -190) h 105 halfBase 82 and
   * `pyramid_72` at (95, -250) h 72 halfBase 57 — the same two landmarks, at the same two
   * coordinates, as `L.pyr1` / `L.pyr2` below. Terrain's are the LARGER of each pair
   * (halfBase 82 against this module's 74), so every triangle this loop emitted was sealed
   * inside Terrain's mass and could not be seen from any camera in the level. Measured by
   * rasterising the merged `arch:far:limestone_polished` mask against the `dunes` camera and
   * then raycasting the same pixels through Terrain: every hit along the silhouette the
   * critic photographed returns `pyramid_105` at d = 296–316 m, in front of this module's
   * geometry at ~325 m. 644 triangles, drawn nowhere, and `castShadow` on all of them.
   *
   * That duplication is also why the critic's silhouette predicate returned edge-x values of
   * 556, 388, 274, 654 on consecutive rows: there is not one edge there to find. There are
   * two overlapping pyramids of different size and value plus a cloud deck, and its threshold
   * was landing on whichever happened to win that row.
   *
   * The ~13 px "hard geometric courses" it measured are Terrain's `courses: 24` over 105 m —
   * 4.4 m per course at the `dunes` camera's 2.88 px/m, i.e. 12.6 px. They are NOT this
   * module's: `K.steppedPyramid` was rewritten on 08-01 into a single cased mass whose
   * silhouette, rasterised above, advances exactly 1 px per row from y=100 to y=230 with no
   * step anywhere in it. The rewrite was correct and it has never been on screen.
   *
   * So the surviving landmark is Terrain's, the fix belongs there, and this loop is deleted
   * rather than reconciled — two modules cannot both own a landmark. `L.pyr1`/`L.pyr2` stay
   * as the §8.1 coordinate record (nothing outside this file reads them) and Terrain's
   * PYRAMIDS table is held to the same two positions.
   * ------------------------------------------------------------------------------------- */
  /* A third, distant, half-buried mastaba field staggers the horizon further. Each one is
     dropped onto its own patch of sand — one of the five used to be 7.6 m under the dune,
     which is 12 k triangles and a shadow caster for nothing at all. */
  for (let i = 0; i < 5; i++) {
    const x = -60 - i * 34 + R.jitter(12), z = -150 - i * 26 + R.jitter(20);
    const hh = 7 + R.range(0, 5), w = 24 + R.range(0, 14), d = 16 + R.range(0, 10);
    const y = sandFloor(A, x, z, w * 0.5, d * 0.5) + hh * 0.5 - hh * 0.28;   // buried to ~28%
    box(A, 'far', 'sandstone_worn', w, hh, d, x, y, z, { jitter: 0.2, taper: 2.6, ry: D(R.range(-8, 8)), c: 0 });
  }
}

/* ==================== foreground framing (§2.3) ======================== */

function foreground(A) {
  const R = A.rng;

  /* Twin processional gateways across the courtyard's mid-line. These are the dark
     near-field frames for the `traversal` and `hero` cameras, and the hook chain flies
     over them, so they earn their keep three times. */
  for (const sx of [-1, 1]) {
    const inner = sx * 12.5, outer = sx * 21.0;
    for (const px of [inner, outer]) {
      A.add('court', 'hieroglyph_wall', K.place(K.masonryShell({
        w: 2.6, d: 3.0, h: 12.6, batter: 0.095, course: 0.64, thick: 0.95, rng: R, hollow: true,
        blockLen: [1.2, 2.1], recess: 0.06, chipChance: 0.22, gapChance: 0.04, buried: 0.4,
      }), { x: px, y: 0, z: 1.0, ry: D(R.jitter(0.5)), rz: D(R.jitter(0.8)) }));
      A.add('court', 'sandstone_worn', K.place(
        K.cornerRolls({ w: 2.6, d: 3.0, h: 12.3, r: 0.24, batter: 0.095, rng: R }), { x: px, y: 0.12, z: 1.0 }));
      A.proxy(K.proxyBattered(2.6, 3.0, 12.6, 0.085, A._proxyMat()), { tag: 'wall', material: 'stone', climbable: true }, { x: px, y: 0, z: 1.0 });
    }
    const span = Math.abs(outer - inner) + 2.2;
    A.add('court', 'hieroglyph_gilded', K.place(K.beam(span, 1.7, 3.4, { rng: R, pieces: 4, crack: sx > 0 ? 0.05 : 0, chip: 0.16, roll: 0.18 }), { x: (inner + outer) / 2, y: 12.0, z: 1.0 }));
    const cor = K.cornice({ w: span, d: 3.6, h: 0.9, flare: 0.95, roll: 0.34 });
    A.add('court', 'sandstone_block', K.place(cor.geo, { x: (inner + outer) / 2, y: 12.85, z: 1.0 }));
    ledgeProxy(A, Math.min(inner, outer) - 1.1, Math.max(inner, outer) + 1.1, 12.85 + cor.height, -0.9, 2.9, { thick: 0.6 });
    ledgeProxy(A, Math.min(inner, outer) - 1.1, Math.max(inner, outer) + 1.1, 12.85, -1.7, -0.7, { thick: 0.5 });
  }

  /* Terrace parapets: dark vertical mass in the lower frame of the `night` shot. */
  for (const sx of [-1, 1]) {
    vol(A, 'court', 'sandstone_block', sx * 9.4 - (sx > 0 ? 1.1 : 0), sx * 9.4 + (sx > 0 ? 0 : 1.1), 2.0, 3.5, 3.4, 19.4, { jitter: 0.03, chip: 0.14 });
    ledgeProxy(A, sx * 9.4 - 0.6, sx * 9.4 + 0.6, 3.5, 3.4, 19.4);
  }

  /* Fallen architrave + column drums in the courtyard's east bay: the `hero` shot's
     lower-left dark mass, and a ruin note that stops the complex looking new-built. */
  const drum = new THREE.CylinderGeometry(1.72, 1.86, 1.5, 22, 1);
  K.normaliseAttrs(drum);
  const drums = [];
  for (const [x, y, z, rz, ry] of [[12.6, 0.95, 20.6, D(88), D(12)], [13.9, 0.9, 18.1, D(84), D(-40)], [11.4, 2.4, 21.3, D(80), D(30)]]) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(D(R.jitter(4)), ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    drums.push(m);
    A.proxy(new THREE.BoxGeometry(3.4, 1.8, 3.2), { tag: 'ground', material: 'stone' }, { x, y: y - 0.2, z });
  }
  A.instance('column_papyrus', K.boxProjectUVs(drum), drums, 'ruin:drums');
  box(A, 'court', 'hieroglyph_gilded', 6.2, 1.5, 2.6, 15.6, 0.72, 22.6, { jitter: 0.03, chip: 0.22, ry: D(-24), rz: D(3.5) });
  A.proxy(new THREE.BoxGeometry(6.2, 1.5, 2.6), { tag: 'ledge', material: 'stone' }, { x: 15.6, y: 0.72, z: 22.6, ry: D(-24) });
  A.add('court', 'sandstone_worn', K.place(K.sandDrift({ len: 9, h: 0.9, depth: 3.0, rng: R }), { x: 13.5, z: 19.6, ry: Math.PI * 0.85 }));
}

export function buildEgyptLevel(A) {
  /* Authored magnetism points collect here as well as going onto the bus — see `magnet()` for
     why both. FX flushes whatever MOVEMENT was not yet listening to hear. */
  A.api.targets = [];

  courtyard(A);
  entryPylons(A);
  courtyardTraversal(A);
  hypostyleHall(A);
  innerPylon(A);
  tomb(A);
  background(A);
  foreground(A);

  A.api.route = [
    ['spawn', 0, 0, 30], ['terrace-1', 0, 2, 19], ['terrace-2', 0, 5.2, 14],
    ['kiosk-lintel', 2.2, 9, 8.4], ['hook-chain', 4.2, 14.8, 4.5], ['hall-front-cornice', -9.5, 13.6, -15.2],
    ['hall-floor', 0, 0, -20], ['inner-gate', 0, 0, -52], ['descent-landing', 0, 0, -57],
    ['vault-floor', 0.4, -12, -57.6], ['sarcophagus', 0, -12, -72],
  ];
}

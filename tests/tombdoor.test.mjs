import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';

/**
 * The tomb's DOOR, as opposed to the tomb's room.
 *
 * ── Why this file exists (§480) ────────────────────────────────────────────────────────────
 * `collectroute.test.mjs` V3's own failure message is *"the collect loop does not close and the
 * vault reward is unwinnable"*, and it opens with `const start = new THREE.Vector3(0, -11.95,
 * -60)`. `cluevault.test.mjs` R2 places twelve bottles and measures magnet radii in the same
 * room. **Every arm in this project that touches the tomb starts inside the tomb.** The suite
 * had therefore established, thoroughly and greenly, that a room works — and had never once
 * asked whether the room has a door.
 *
 * It did not. TERRAIN's `sand_collision` is one `ground` surface held flush at y ≈ 0 across the
 * whole complex by `complexMask`. That is invisible everywhere the temple floor is *also* y = 0
 * and fatal in the one place the level goes below it: the tomb descent is a shaft from y 0 to a
 * vault floor at y −12, and the sand lay across it as a 0.52 m lid. Measured before the repair,
 * a capsule swept down from y +3 stopped at y ≈ 0 at **every** point of the authored descent, and
 * a 154-column census over the vault on a 2 m grid found **zero** columns that admitted a capsule
 * to the vault floor. §8.1 route steps 7 and 8 were unreachable and the demo had no ending.
 *
 * ── What these arms claim, and what they deliberately do not ───────────────────────────────
 * They claim the **shaft is open**: that the descent is not roofed, that the opening is bounded
 * to the stairwell rather than thinning the desert, and that the lid is gone read from both
 * faces. They do **not** claim the descent is walkable — it is not, and §480.3 records why in
 * detail. Anyone who wants that property has to write it; quoting a green here for it is exactly
 * the mistake this file was written to end.
 *
 * ── Reading the level rather than a picture of it (§435.4) ────────────────────────────────
 * Every probe point below is derived from `EgyptLevel.js`'s own registered proxies — the descent
 * landing, both ramp proxies and the mid landing — not from coordinates typed here. A probe
 * written from the author's model of the level is a test of the model.
 *
 * ── A capsule, not a ray ──────────────────────────────────────────────────────────────────
 * Every occupancy question uses `capsuleSweep` at `TUNE.height` 1.80 / `TUNE.radius` 0.34. A ray
 * answers "is the line clear"; the question here is "can the player get down there".
 *
 * ── The ablation, run rather than asserted ────────────────────────────────────────────────
 * `PROXY_OPENINGS` emptied — the pre-repair tree, one constant, nothing on the measurement path
 * stubbed — turns **D1 and D2 red and leaves D1b and D3 green.** That split is the point: the two
 * arms that claim the shaft is open fail without the opening, and the two that claim the cut is
 * *bounded* and that the vent is *untouched* are indifferent to it, because they are about
 * different properties. An ablation that reddened all four would have meant these were one arm
 * wearing four hats.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = TUNE.radius, H = TUNE.height;

/* The stairwell, as `tomb()` registers it: `wallProxy(A, -14.2, 4.4, -12.4, 0.4, …)` twice, at
   z −54.4…−53.8 and z −60.0…−59.4. The well interior is what those walls enclose. */
const WELL = { x0: -14.2, x1: 4.4, z0: -59.4, z1: -54.4 };

/** Feet position a capsule comes to rest at when dropped from `y` at (x, z). */
function dropTo(collision, x, z, y = 3.0, floor = -16) {
  const s = collision.capsuleSweep(V(x, y, z), V(x, floor, z), R, H);
  return s.sweepHit ? s.position.y : floor;
}

test('D1 the tomb descent shaft is OPEN from above — the lid that sealed the level is gone', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON:  the shipped tree, where `PROXY_OPENINGS` cuts the stairwell out of the collision
   *             proxy. Every authored descent station admits a capsule well below desert level.
   * FAILS ON:   the pre-repair tree, and any regression that restores the lid — a removed
   *             opening, a widened `complexMask`, a proxy rebuilt without the cut. RUN in-arm
   *             below as the desert control, which is the same surface one metre away.
   * does NOT discriminate: whether the descent is WALKABLE. These are drops, not walks. §480.3
   *             measures the walk and it does not connect; a green here is not that claim.
   */
  const { collision } = await realWorld();

  /**
   * Stations on the authored dog-leg. Each was chosen by reading which registered proxy actually
   * catches the capsule there, not by picking a plausible coordinate — the first draft of this
   * arm probed (−8, −57.9) and failed at y −2.172 on the vault GATE WALL's top, which is correct
   * geometry doing its job. A probe that cannot tell a lid from a wall is not measuring the lid.
   */
  const stations = [
    ['flight A upper run', -5.0, -56.5, 'flight A ramp proxy'],
    ['flight A lower run', -6.0, -56.8, 'flight A ramp proxy'],
    ['flight B west', -7.0, -56.8, 'flight B ramp proxy'],
    ['mid landing', -11.6, -56.8, 'mid landing groundProxy'],
    ['flight B deep', -4.0, -57.7, 'flight B ramp proxy'],
  ];
  for (const [label, x, z, expect] of stations) {
    const y = dropTo(collision, x, z);
    assert.ok(y < -4.0,
      `${label} (${x}, ${z}): a capsule dropped from y +3 rests at y ${y.toFixed(3)}, expected to ` +
      `reach the ${expect} well below −4. Resting near 0 means the desert proxy is roofing the tomb ` +
      'descent again — the §480 lid. The vault floor is −12.');
  }

  /**
   * The shaft must connect deep, not merely dent: somewhere inside it, a straight drop has to
   * carry a capsule to vault depth.
   *
   * ── This assertion was re-derived, because its first form passed for the wrong reason ──────
   * It used to sample "cells on the landing" as `groundCheck(y 2.0) >= -0.6` and drop from each,
   * reporting -11.05. That start set was **defined by the lid**: cells over the open shaft only
   * reported ground near y 0 because `groundCheck` was falling back to TERRAIN's analytic sand
   * (§484). With the analytic half closed those cells correctly report the ramp at -0.9…-5.8, the
   * start set shrinks to the real landing, and the same code reports -6.51 — which reads as a
   * regression and is the opposite. An assertion whose sample is chosen by the defect moves when
   * the defect is fixed, so it is scored from a FIXED point inside the shaft instead.
   */
  const deep = dropTo(collision, -4.0, -57.7);
  assert.ok(deep <= -10.0,
    `a capsule dropped in the stairwell at (-4.0, -57.7) rests at y ${deep.toFixed(2)}. The shaft ` +
    'has to reach vault depth (−12) or the tomb is sealed however open the top looks.');
});

test('D1b the opening is BOUNDED to the stairwell — the desert is not thinned to buy it', async () => {
  /**
   * The calibration, drawn from the claim's own domain (§435.3): an arm that says "the descent is
   * open" must also fire when the *desert* stops being solid, because the cheap way to pass D1 is
   * to lower, thin or coarsen the proxy globally — and a slab that seals one hole is holding up
   * everything else that stands on sand.
   *
   * PASSES ON:  the shipped cut, 18.6 × 5.0 m, bounded by the stairwell's own wall proxies.
   * FAILS ON:   a global thinning, a dropped proxy, or an opening widened past the masonry.
   * does NOT discriminate: the 0.5 m refinement pitch. A 1 m or 0.25 m edge passes this equally;
   *             it pins that the hole is where the masonry is, not how finely it is cut.
   */
  const { collision } = await realWorld();

  /* Just OUTSIDE each wall of the well, the sand must still catch a capsule at desert level. */
  const outside = [
    ['south of the well', 0, WELL.z1 + 1.6],
    ['north of the well', 0, WELL.z0 - 1.6],
    ['west of the well', WELL.x0 - 2.0, -56.9],
    ['east of the well', WELL.x1 + 2.0, -56.9],
  ];
  for (const [label, x, z] of outside) {
    const y = dropTo(collision, x, z);
    assert.ok(y > -1.2,
      `${label} (${x.toFixed(1)}, ${z.toFixed(1)}): a capsule falls to y ${y.toFixed(2)}. The opening ` +
      'has spread past the stairwell masonry, or the desert proxy has been thinned. Either way the ' +
      'approach, the avenue and the ridge are standing on this surface.');
  }

  /* And the desert at large is untouched: sample the four quadrants of the playspace. */
  for (const [x, z] of [[-40, 20], [40, 20], [-40, -30], [40, -30], [0, 60], [0, -90]]) {
    const y = dropTo(collision, x, z, 30, -40);
    assert.ok(y > -20,
      `the desert proxy has a hole at (${x}, ${z}) — a capsule fell to y ${y.toFixed(2)}. ` +
      'PROXY_OPENINGS is meant to cut one stairwell, not the ground the level stands on.');
  }
});

test('D2 the lid is gone read from BELOW as well as from above', async () => {
  /**
   * A clearance read from one side is half a reading — the original §447.1 measurement quoted the
   * slab as y [0.00, 0.52] precisely because it was taken from both faces, and the same discipline
   * is what makes this arm a check rather than a restatement of D1.
   *
   * PASSES ON:  the repaired tree — from the mid landing a capsule sweeps up through where the
   *             lid was.
   * FAILS ON:   the lid's return, which stops the upward sweep with feet near y −1.3.
   * does NOT discriminate: anything about the descent's walkability or the vault's interior.
   */
  const { collision } = await realWorld();

  const g = collision.groundCheck(V(-11.6, -4.0, -56.8), R, 20);
  assert.ok(g.hit && g.y < -5.0 && g.y > -6.5,
    `the mid landing should be the floor under (−11.6, −56.8) at about y −5.6; groundCheck says ` +
    `${g.hit ? g.y.toFixed(3) : 'MISS'}. The probe has drifted off the proxy it was written against.`);

  const up = collision.capsuleSweep(V(-11.6, g.y + 0.03, -56.8), V(-11.6, g.y + 12, -56.8), R, H);
  const ceiling = up.sweepHit ? up.position.y + H : Infinity;
  assert.ok(ceiling > 1.0,
    `standing on the mid landing, a capsule swept up meets a ceiling at y ${ceiling.toFixed(2)}. ` +
    'Anything near y 0 is the desert proxy back across the stairwell — the §480 lid, from below.');
});

test('D3 the stealth vent is still sealed, and a terrain cut is NOT its repair', async () => {
  /**
   * §8.1's alternate route crawls the vent at (−21, 0, −49.5) down to the vault's west shelf. It
   * was sealed by the same slab, and the obvious move — cut it out of the proxy too — is wrong.
   *
   * Measured: `vent` is not in `Collision.SOLID_TAGS`, so the four vent proxies are REGION markers
   * for `crawl` and not floor, and **ARCHITECTURE registers no `ground` under the vent's sloping
   * shaft at all**. From z −52 southward a probe below the sand finds nothing. Cutting the sand
   * there would replace a sealed passage with a fall into the void, which is strictly worse.
   *
   * This arm pins the reason so the next lane does not "finish the job" by widening the opening.
   *
   * PASSES ON:  today's tree — the vent shaft has no floor, and the opening does not reach it.
   * FAILS ON:   somebody cutting the vent out of the proxy without building its floor first, and
   *             also on somebody BUILDING that floor — at which point this arm should be replaced
   *             with a reachability arm, and the message says so.
   * does NOT discriminate: whether the vent's floor, once built, would be walkable or crawlable.
   */
  const { collision } = await realWorld();
  assert.ok(!collision.SOLID_TAGS.includes('vent'),
    '`vent` has become a solid tag. The vent proxies were region markers for `crawl`; if they are ' +
    'floor now, D3 is measuring something else and needs re-deriving.');

  let floored = 0;
  for (let z = -53; z >= -60; z -= 1) {
    const below = collision.groundCheck(V(-21, -0.6, z), R, 30);
    if (below.hit) floored++;
  }
  assert.equal(floored, 0,
    `the vent shaft now has ${floored} sampled stations with floor beneath the sand. If ARCHITECTURE ` +
    'has built the vent floor, delete this arm and write the reachability one — the terrain opening ' +
    'can then be extended to (−21, ·, −49…−60) and the stealth route becomes real.');

  /* And until then the sand must still hold the crawler up rather than dropping him into it. */
  const y = dropTo(collision, -21, -55.0);
  assert.ok(y > -1.2,
    `a capsule at the vent shaft falls to y ${y.toFixed(2)}. The proxy has been cut here without a ` +
    'floor underneath, which turns a sealed passage into a hole into the void.');
});

/**
 * ── R1/R2: the cheap invariant, and the expensive one it replaces (§483) ────────────────────
 *
 * Four lids were found this session — TERRAIN's sand over the stairwell, ARCHITECTURE's descent
 * landing over its own ramp, the gate corridor over the same ramp, and a suspected prop lid that
 * turned out not to exist. The tempting arm is the general one: *"no `ground` proxy roofs a
 * walkable surface it does not belong to."* **Measured, that is unusable.** Sampling every
 * walkable column in the playspace on a 2 m grid and walking down each one:
 *
 *     walkable columns                                  1505
 *     walkable surfaces roofed by something above      10152
 *     ... where the roof is a DIFFERENT collider        5108   across 36 distinct pairs
 *     the top pairs:  ledge over ground 1141 · ground over sand 968 · sand over ground 567
 *
 * Every architrave roofs a floor, every deck roofs the desert, every cornice roofs a wall. The
 * general invariant fires five thousand times on a correct level, so it is not an invariant, it
 * is a description of a temple.
 *
 * What separates the real lids is not that they roof something — it is that they roof **the only
 * way to a place the level promises**. So the cheap arm is not about roofs at all: it asserts the
 * promise directly. `architecture.api.route` is eleven waypoints, and checking that a capsule can
 * *stand* at each one would have caught two of the three real defects on its own — `vault-floor`
 * had no ground at all under the sand lid, and the hall-front cornice's first corrected coordinate
 * sat under the aisle roof with 0.79 m of clearance.
 */
test('R1: every authored route waypoint is a place a capsule can actually stand', async () => {
  /**
   * DOMAIN (§418.3)
   * PASSES ON: today's tree, where every standing waypoint takes a 1.80 m capsule.
   * FAILS ON:  the §447.1 tree — `vault-floor` returned no ground at all — and on the soffit
   *            coordinate (−9.5, 15.36, −17.2) this lane briefly shipped, which has 0.79 m under
   *            the aisle roof. Both are drawn from the claim's own domain rather than invented.
   * does NOT discriminate: whether consecutive waypoints CONNECT. R2 measures that and does not
   *            yet assert the tomb leg. A waypoint you can stand on is not a waypoint you can
   *            reach, and this file has already made that mistake once at level scale.
   */
  const { collision, arch } = await realWorld();
  /* `hook-chain` is an airborne hold and `sarcophagus` is the goal object you stand BESIDE, not
     on. Named rather than filtered by a rule, so adding a waypoint forces a decision here. */
  const NOT_STANCES = new Set(['hook-chain', 'sarcophagus']);

  for (const [name, x, y, z] of arch.api.route) {
    if (NOT_STANCES.has(name)) continue;
    const g = collision.groundCheck(V(x, y + 1.2, z), R, 6);
    assert.ok(g.hit,
      `route waypoint '${name}' at (${x}, ${y}, ${z}) has NO GROUND under it within 6 m. That is ` +
      'the §447.1 signature — something is roofing the place the route promises.');
    const p = V(x, g.y + 0.03, z);
    const occ = collision.capsuleSweep(p, p.clone(), R, H);
    assert.ok(!(occ.depenHit && occ.depenDepth > 0.05),
      `route waypoint '${name}' has ground at y ${g.y.toFixed(2)} but a ${H} m capsule does not fit ` +
      `there (depenetration ${(occ.depenDepth || 0).toFixed(3)} m). A horizontal surface with ` +
      'something close above it is a soffit, not a ledge, and nothing in the route table says so.');
  }
});

test('R2: the route legs that connect, and the one that does not', async () => {
  /**
   * Step-connectivity between consecutive waypoints, flood-filled at `stepHeight` 0.42 and
   * `slopeWalkableDeg` 50 — the same bars `_moveHorizontal` and the ground probe use, so a leg
   * that passes here is one a walker can actually take.
   *
   * PASSES ON: the legs listed in CONNECTED below.
   * FAILS ON:  any of those legs regressing — which is what a lid does first.
   * does NOT discriminate: the tomb descent, which is OPEN and NOT YET WALKABLE (§482.3, §483).
   *            It is excluded BY NAME rather than by a threshold, so closing it is a one-line
   *            change here and cannot be forgotten. Legs involving airborne holds are excluded
   *            for the same reason: a hook chain is not a walk.
   */
  const { collision, arch } = await realWorld();
  const WALK = Math.cos(50 * Math.PI / 180), G = 0.4, STEP = 0.42;
  /**
   * LOCAL probe, from just above the walker's current height — not from the sky.
   *
   * The first draft cast from y 40 and reported `hall-floor -> inner-gate` unwalkable, a leg this
   * lane had already DRIVEN in 133 frames. Inside a roofed hall a downward cast from above finds
   * the ROOF at y 17, so the flood was walking the rooftop and failing to reach a gate at y 0.
   * That is a clearance read from the wrong side (§435.4's rule, in the vertical), and it would
   * have been filed as a level defect by anything that trusted its own output.
   */
  const stand = (x, z, fromY) => {
    const g = collision.groundCheck(V(x, fromY + 1.0, z), R, 2.4);
    if (!g.hit || g.normal.y < WALK) return null;
    const p = V(x, g.y + 0.03, z);
    const occ = collision.capsuleSweep(p, p.clone(), R, H);
    return (occ.depenHit && occ.depenDepth > 0.05) ? null : g.y;
  };
  /**
   * Can a walker get from a to b, staying on standable ground within stepHeight each move?
   *
   * ── The visited set is keyed by HEIGHT as well as XZ, and that is the whole arm (§484) ─────
   * `stand()` probes 2.4 m from the walker's own plane, which is what a walker experiences — so
   * the SAME XZ cell is standable at different heights depending on the height you arrive at.
   * Keyed on XZ alone, a shallow first visit claims the cell and locks out the deeper approach,
   * and the tomb descent — a ramp that doubles back under itself — reported unwalkable at y -8.75
   * for a whole round. The tell was the instrument contradicting itself: the frontier's own
   * neighbour printed "PASSES (should have been explored)" while the flood had stopped.
   *
   * ── And the goal test must include Y ───────────────────────────────────────────────────────
   * `descent-landing` (0, 0, -57) is 0.72 m from `vault-floor` (0.4, -12, -57.6) in XZ and 12 m
   * above it. An XZ-only goal returned CONNECTED from the start cell without taking a step. A
   * reachability test that ignores the axis the defect lives on returns true for the thing it
   * exists to refute; this one was caught by asking the flood for its path and getting ONE CELL.
   */
  const connects = (ax, ay, az, bx, by, bz, budget = 30000) => {
    const key = (x, z, y) => `${Math.round(x / G)},${Math.round(z / G)},${Math.round(y / 0.5)}`;
    /* Bounded to the corridor between the endpoints, generously. Unbounded, a 0.5 m flood escapes
       into the hall and spends two minutes answering a question about five metres of stair. */
    const lo = { x: Math.min(ax, bx) - 14, z: Math.min(az, bz) - 14 };
    const hi = { x: Math.max(ax, bx) + 14, z: Math.max(az, bz) + 14 };
    const y0 = stand(ax, az, ay); if (y0 == null) return false;
    const seen = new Set([key(ax, az, y0)]);
    const q = [[ax, az, y0]];
    /* BEST-FIRST, not breadth-first. A plain BFS from the hall floor expands uniformly across
       1700 m2 of nave before it threads the 6 m gate, and exhausts its budget doing it — which
       reads as "no path" and is really "no patience". Ordering by remaining distance costs one
       sort per pop and finds the same paths; it can only make the search give up LATER, never
       accept something a step rule rejected. */
    while (q.length && seen.size < budget) {
      q.sort((p, r) => (Math.hypot(p[0] - bx, p[1] - bz) - Math.hypot(r[0] - bx, r[1] - bz)));
      const [cx, cz, cy] = q.shift();
      if (Math.hypot(cx - bx, cz - bz) < 1.2 && Math.abs(cy - by) < 1.2) return true;
      for (const [dx, dz] of [[G, 0], [-G, 0], [0, G], [0, -G]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < lo.x || nx > hi.x || nz < lo.z || nz > hi.z) continue;
        const ny = stand(nx, nz, cy);
        if (ny == null || Math.abs(ny - cy) > STEP) continue;
        const k = key(nx, nz, ny);
        if (seen.has(k)) continue;
        seen.add(k); q.push([nx, nz, ny]);
      }
    }
    return false;
  };
  /* Ground legs only. The route's other legs are jumps, a hook chain and a stair, and a flood
     fill is the wrong instrument for every one of them. */
  const CONNECTED = [
    ['hall-floor', 'inner-gate'],
    ['inner-gate', 'descent-landing'],
    /* PROMOTED (§484). The tomb descent walks: the analytic half of the §480 lid is closed and a
       driven walk follows the flood's own path from the landing to y -10.88 on flight B. */
    ['descent-landing', 'vault-floor'],
  ];
  const wp = Object.fromEntries(arch.api.route.map(([n, x, y, z]) => [n, { x, y, z }]));
  for (const [a, b] of CONNECTED) {
    assert.ok(connects(wp[a].x, wp[a].y, wp[a].z, wp[b].x, wp[b].y, wp[b].z),
      `route leg '${a}' -> '${b}' is no longer walkable at stepHeight ${STEP} / slopeWalkable 50. ` +
      'A lid over the path is the first thing to check.');
  }
  /* END TO END, which is the assertion this file was written to be able to make and could not
     until §484: the hall floor is where the courtyard's great south doorway drops you, and the
     vault floor is the last standable waypoint on the route. One flood, no waypoint stepping
     stones, so it cannot pass by being handed the middle of its own answer. */
  assert.ok(connects(wp['hall-floor'].x, wp['hall-floor'].y, wp['hall-floor'].z,
                     wp['vault-floor'].x, wp['vault-floor'].y, wp['vault-floor'].z, 120000),
    'the hall floor no longer reaches the vault floor on foot. That is the whole back third of ' +
    'the level, and a lid over the descent is the first thing to check — in BOTH of TERRAIN\'s ' +
    'representations, the proxy mesh and the analytic collisionHeightAt (§484).');
});

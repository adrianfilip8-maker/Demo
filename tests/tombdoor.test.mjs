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

  /* The shaft must connect deep, not merely dent. Somewhere on the landing a straight drop has
     to carry a capsule to vault depth; measured on the repaired tree the best is −11.05. */
  let deepest = 99;
  for (let x = 3.5; x >= -4; x -= 0.25) {
    for (let z = -54.2; z >= -59.2; z -= 0.25) {
      const g = collision.groundCheck(V(x, 2.0, z), R, 6);
      if (!g.hit || g.y < -0.6) continue;               // start on the landing, not in the well
      deepest = Math.min(deepest, dropTo(collision, x, z, g.y + 0.05));
    }
  }
  assert.ok(deepest <= -10.0,
    `the deepest a capsule falls from anywhere on the descent landing is y ${deepest.toFixed(2)}. ` +
    'The shaft has to reach vault depth (−12) or the tomb is sealed however open the top looks.');
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

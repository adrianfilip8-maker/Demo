import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE as PTUNE, TREASURES } from '../src/world/Pickups.js';
import { TUNE as CTUNE } from '../src/player/Controller.js';

/**
 * Is the collect route actually walkable? — connectivity, which is a different claim from reach.
 *
 * ── The distinction this file exists to draw ───────────────────────────────────────────────
 * `tests/cluevault.test.mjs` R2 proved each of the twelve bottles is inside the pickup magnet
 * **from somewhere a player can be**. That is a statement about twelve places. It says nothing
 * about whether those places are connected, and *twelve locally-reachable bottles on a route with
 * a gap in it is twelve reachable bottles and no loop.* Nothing had ever established that the
 * demo's core loop is completable, because the browser playtest could not get past the terrace
 * stair (`fc3db1b`) and frames there cost 0.8 s each.
 *
 * So this drives the real `Controller` through the real level and asks whether the points join.
 *
 * ── The instrument is asymmetric, and that is stated rather than hidden ────────────────────
 * The driver is a straight-line walker: aim the camera at the target, hold forward, and jump when
 * horizontal progress stalls. It cannot hook-swing, it cannot pathfind round furniture, and it
 * climbs a ladder only when handed the rung-by-rung script `traversal.test.mjs` derived.
 *
 * > **A leg that connects is proof — a driven `Controller` actually got there.**
 * > **A leg that does not is a candidate, not a verdict**, because the missing thing may be the
 * > verb rather than the route.
 *
 * The full 13-leg sweep run while writing this scored 8 connected. The five that did not are all
 * climbs, a 55 m cross-level traversal and a 45 m descent — the route's own authored beats, which
 * this driver has no input script for. **None of the five is blocked by geometry**: each ends in
 * open air or against a face it would need a verb to pass, never against a wall where the route
 * says there is a way. The three legs pinned below are the ones that decide whether the demo is
 * completable at all, and all three are proofs.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROPS_SRC = fs.readFileSync(path.join(HERE, '..', 'src/world/Props.js'), 'utf8');

/** The twelve bottle spots, scraped from `Props._clueBottles()` (never copied — §421's rule). */
const B = (() => {
  const body = /_clueBottles\(\)\s*\{[\s\S]*?const spots = \[([\s\S]*?)\n\s*\];/.exec(PROPS_SRC);
  if (!body) return [];
  return [...body[1].matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)]
    .map((m) => new THREE.Vector3(+m[1], +m[2], +m[3]));
})();

const EYE = new THREE.Vector3(...TREASURES.find((t) => t.id === 'eye').pos);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Input is camera-relative (`Controller._readInput`, §6.1), so steering means aiming the camera. */
function aimAt(engine, t, from) {
  const dx = t.x - from.x, dz = t.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  engine.camera.rotation.set(0, Math.atan2(-dx / l, -dz / l), 0, 'YXZ');
  engine.camera.updateMatrixWorld(true);
}

/**
 * Walk a polyline. Returns the closest approach to the LAST point and the frame it entered the
 * pickup magnet, or -1. `via` points exist because a player steers round furniture and a
 * straight-line bot does not — see V3.
 */
function walk(engine, c, start, points, frames = 900) {
  hardReset(engine, c, start.clone());
  const goal = points[points.length - 1];
  let best = Infinity, reached = -1, wp = 0, stuck = 0, lastD = Infinity;
  for (let i = 0; i < frames; i++) {
    const t = points[Math.min(wp, points.length - 1)];
    aimAt(engine, t, c.position);
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 1;
    if (stuck > 12) { if (i % 18 < 3) engine.input.hold('jump'); else engine.input.let_go('jump'); }
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (wp < points.length - 1 && c.position.distanceTo(t) < 2.0) wp++;
    const d = c.position.distanceTo(goal);
    if (d < best) best = d;
    if (reached < 0 && d <= PTUNE.magnet) reached = i;
    stuck = (lastD - d) < 0.004 ? stuck + 1 : 0;
    lastD = d;
  }
  return { best, reached, end: c.position.clone() };
}

/* ============================================================================================
   V1 — the way in, which is where the playtest stopped
============================================================================================ */

test('V1 spawn reaches the first three bottles on plain forward input', async () => {
  /**
   * The browser playtest reported holding forward from spawn stopping after 7.14 m against the
   * terrace stair proxy. `fc3db1b` fixed it. This is the same walk, headless and past the fix,
   * and it is the arm that says the demo has a readable way in at all.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped level — bottles 0, 1 and 2 each entered the magnet, at frames 97, 228
   *            and 244, with closest approaches 2.15 m, 1.00 m and 0.19 m.
   * FAILS ON:  RUN in-arm — the same walk aimed at a point 40 m out over the open desert behind
   *            spawn, which never enters the magnet. Without it, "reached" could be satisfied by
   *            a driver that teleports or by a magnet radius wider than the level.
   */
  /* ONE `realWorld()` for the whole arm. Calling it again mid-test **disposes the Controller
     you are holding** — §425.1's subscription fix retires the previous one on handout, and a
     disposed Controller does not move. The first draft of this arm called it again from a helper
     and reported "the way in is blocked again", 13.04 m, ended exactly at spawn. A defect I
     introduced two rounds ago, caught by the arm it was about to make lie. */
  const { engine, c, collision } = await realWorld();
  assert.ok(B.length >= 12, `§211.1: scraped ${B.length} bottle spots`);

  const SPAWN = new THREE.Vector3(0, 0, 30);
  const legs = [[SPAWN, B[0]], [standFor({ collision }, 0), B[1]], [standFor({ collision }, 1), B[2]]];
  let connected = 0;
  for (let i = 0; i < legs.length; i++) {
    const [from, to] = legs[i];
    assert.ok(from, `no standing point for the start of leg ${i}`);
    const r = walk(engine, c, from, [to]);
    assert.ok(r.reached >= 0,
      `leg ${i} (-> bottle ${i}) never entered the ${PTUNE.magnet} m magnet; closest ` +
      `${r.best.toFixed(2)} m, ended (${r.end.x.toFixed(1)}, ${r.end.y.toFixed(1)}, ${r.end.z.toFixed(1)}). ` +
      'The way in is blocked again.');
    connected++;
  }
  assert.equal(connected, 3);

  /* The counterexample, run: a target the route does not go to is never reached. */
  const nowhere = walk(engine, c, SPAWN, [new THREE.Vector3(0, 0, 70)]);
  assert.equal(nowhere.reached, -1,
    'the driver reached a point 40 m out in the open desert — "reached" is not measuring arrival');
});

/* ============================================================================================
   V2 — the vertical beat bottles 4 and 5 exist to teach
============================================================================================ */

test('V2 the pylon ladder delivers bottle 5, rung by rung on the real face', async () => {
  /**
   * `Props._clueBottles()` puts one bottle ON the ladder and one on the deck it delivers you to,
   * *"so the route that had nothing saying 'climb here' now has a collectible at both ends of
   * it."* That is a claim about a traversal nobody had ever driven end to end in the shipped
   * level. The input script is `traversal.test.mjs`'s, unchanged: hold into the wall, and on a
   * rung release jump for one frame then press — the only safe place to re-arm, because
   * `Fall.air()` cuts a jump released mid-rise.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: the shipped pylon — 7 consecutive rungs caught (`notch-pylon-e-w-6` … `-12`),
   *            y 10.64 -> 28.95, bottle 5 entered at frame 137, closest 1.94 m.
   * FAILS ON:  RUN in-arm — the identical drive with the rung script replaced by plain forward
   *            input, which is what the straight-line walker does everywhere else. It catches no
   *            rung and never reaches the deck, which is why the full sweep scored this leg as
   *            unconnected and why that score was a statement about the driver.
   */
  const { engine, c, collision } = await realWorld();
  const holds = collision.recs.find((x) => x.handholds?.length)?.handholds ?? [];
  const rung = holds.find((h) => h.id === 'notch-pylon-e-w-5');
  assert.ok(rung, 'the pylon ladder has lost rung notch-pylon-e-w-5');

  const n = new THREE.Vector3(rung.normal.x, 0, rung.normal.z).normalize();
  const start = new THREE.Vector3(
    rung.point.x + n.x * (CTUNE.radius + 0.20),
    rung.point.y - CTUNE.hangReach - 0.40,
    rung.point.z + n.z * (CTUNE.radius + 0.20));

  const climb = (useRungScript) => {
    engine.camera.rotation.set(0, Math.atan2(n.x, n.z), 0, 'YXZ');
    engine.camera.updateMatrixWorld(true);
    hardReset(engine, c, start.clone(), Math.atan2(-n.x, -n.z));
    c.grounded = false;
    const caught = new Set();
    let onRung = 0, best = Infinity, reached = -1, top = start.y;
    for (let i = 0; i < 1400; i++) {
      engine.input.beginFrame(DT);
      engine.input.move.x = 0; engine.input.move.y = 1;
      if (useRungScript && c.stateName === 'wallClimb') {
        onRung++;
        if (onRung === 1) engine.input.let_go('jump'); else engine.input.hold('jump');
      } else { onRung = 0; engine.input.hold('jump'); }
      engine.time = i * DT;
      c.update(DT, i * DT);
      const h = c.sm.get('wallClimb')?._hold;
      if (h) caught.add(h.id);
      if (c.position.y > top) top = c.position.y;
      const d = c.position.distanceTo(B[5]);
      if (d < best) best = d;
      if (reached < 0 && d <= PTUNE.magnet) reached = i;
    }
    return { caught, best, reached, top };
  };

  const good = climb(true);
  assert.ok(good.caught.size >= 5,
    `the climb caught ${good.caught.size} rungs; the ladder is no longer climbable in sequence`);
  assert.ok(good.top > 28,
    `the climb topped out at y ${good.top.toFixed(2)}, short of the deck at 28.92`);
  assert.ok(good.reached >= 0,
    `bottle 5 never entered the magnet from the ladder; closest ${good.best.toFixed(2)} m`);

  /* The counterexample, run: without the rung script the same face is not climbable. */
  const plain = climb(false);
  assert.equal(plain.reached, -1,
    'plain forward input now reaches the deck too, so V2 is no longer measuring the ladder beat');
  assert.ok(plain.top < good.top,
    `plain input reached y ${plain.top.toFixed(2)} against the scripted climb's ${good.top.toFixed(2)} — ` +
    'the two drives no longer differ and the counterexample has gone stale');
});

/* ============================================================================================
   V3 — the payoff: the last bottle to the Eye
============================================================================================ */

test('V3 the vault leg closes on the Eye, and the straight line does not', async () => {
  /**
   * The one leg of the sweep that looked like a genuine gap: right room, right height, and the
   * driver stopped **4.42 m** short of the Eye. It is not a gap — the sarcophagus sits on the
   * straight line at z −72, where the floor rises to −10.89 and headroom is blocked 0.13 m up.
   * A player walks round it; a straight-line bot walks into it.
   *
   * That distinction is the whole reason this file is separate from R2. R2's question was "can
   * this bottle be taken from somewhere". This one's is "do the somewheres join", and the honest
   * answer needed the obstacle identified rather than the failure reported.
   *
   * DOMAIN (§418.3 / §418.9)
   * PASSES ON: a two-point path via x = −5, which enters the magnet at frame 157, closest 0.10 m.
   * FAILS ON:  RUN in-arm — the straight line at the Eye from the same start, which never enters
   *            it (closest 4.42 m). Both drives are in this arm, one waypoint apart, so the
   *            claim "the loop closes" cannot be satisfied by a driver that reaches everything.
   */
  const { engine, c, collision } = await realWorld();
  const start = new THREE.Vector3(0, -11.95, -60);

  /* The obstacle, measured rather than asserted. */
  const at = new THREE.Vector3(0, -11.95, -72);
  const g = collision.groundCheck(new THREE.Vector3(at.x, at.y + 1.0, at.z), CTUNE.radius, 3);
  assert.ok(g.hit && g.y > -11.5,
    `nothing stands on the straight line at z −72 any more (ground ${g.hit ? g.y.toFixed(2) : 'MISS'}); ` +
    'the detour below is no longer explained by furniture and V3 should be re-derived');

  const round = walk(engine, c, start, [new THREE.Vector3(-5, -11.95, -72), EYE]);
  assert.ok(round.reached >= 0,
    `the Eye is not reachable from the vault-floor bottle even round the sarcophagus; closest ` +
    `${round.best.toFixed(2)} m. The collect loop does not close and the vault reward is unwinnable.`);

  const straight = walk(engine, c, start, [EYE]);
  assert.equal(straight.reached, -1,
    'the straight line now reaches the Eye too, so this arm has stopped distinguishing a route ' +
    'gap from a driver that cannot steer — which is the distinction it exists for');
  assert.ok(straight.best > round.best,
    `straight ${straight.best.toFixed(2)} m vs round ${round.best.toFixed(2)} m — the detour no ` +
    'longer helps and the counterexample is stale');
});

/* --------------------------------------------------------------------------------------- */

/** Where a player stands to collect bottle `i` — the surface under it (cluevault R2's rule). */
function standFor({ collision }, i) {
  const b = B[i];
  const r = collision.raycast(b, DOWN, 20);
  if (!r.hit) return null;
  if ((b.y - r.point.y) > PTUNE.grabHeight + PTUNE.magnet) return null;
  return new THREE.Vector3(b.x, r.point.y + 0.05, b.z);
}

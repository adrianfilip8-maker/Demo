/**
 * Guard.test.mjs — headless behaviour tests for the garrison.
 *
 *   node src/ai/Guard.test.mjs
 *
 * **`npm test` does not run this file.** The script is `node --test "tests/*.test.mjs"`, and
 * this suite is neither in `tests/` nor written against `node:test` — it carries its own
 * three-function harness. It has to be run by hand, which means it can rot silently between
 * runs; it had two stale expectations when the routes were re-authored. `tests/patrol.test.mjs`
 * is in the glob and is the one CI-shaped guard suite.
 *
 * Nothing here needs a GPU, a browser or a level: the tests stand a real `Guards` module up
 * against a stub Engine and a stub COLLISION built out of axis-aligned boxes, then run the
 * shipped update loop. That means they exercise `Guard.js` exactly as the game does — route
 * following, the LOS raycast, the suspicion model, the alert machine and the wall/ledge
 * refusal — while still running in under a minute, which a capture never will.
 *
 * The `.mjs` extension is deliberate: main.js discovers modules with
 * `import.meta.glob('./{...,ai,...}/*.js')`, so a test file must not end in `.js` or it lands
 * in the build graph.
 */
import * as THREE from 'three';
import { Guards } from './Guard.js';
import { ROUTES, ROSTER, DETECT, STATE, VISION } from './Patrol.js';

const ROSTER_TYPES = ROSTER.map((r) => r.type);

/* ============================ tiny test harness =========================== */

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [32m✓[0m ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  [31m✗[0m ${name}\n      ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg}: got ${a.toFixed(4)}, want ${b.toFixed(4)} ±${tol}`);
}

/* ============================== stub world ================================ */

/**
 * COLLISION stand-in. A world of axis-aligned boxes (walls) and rectangular platforms
 * (floors). It answers the two queries Guard.js actually uses — `raycast` and `groundCheck` —
 * with the same result shapes AGENTS.md §4.6 specifies.
 */
class StubCollision {
  constructor({ boxes = [], platforms = [] } = {}) {
    this.boxes = boxes;
    this.platforms = platforms;
    this.ready = true;
    this.rays = 0;
    this._ray = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, tag: 'wall', rec: null };
    this._gnd = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'stone', rec: null, distance: 0 };
  }

  raycast(origin, dir, maxDist) {
    this.rays++;
    const r = this._ray;
    r.hit = false;
    const l = Math.hypot(dir.x, dir.y, dir.z);
    if (l < 1e-9) return r;
    const dx = dir.x / l, dy = dir.y / l, dz = dir.z / l;
    let best = maxDist > 0 ? maxDist : 100;
    let found = false;
    for (const b of this.boxes) {
      const t = slab(origin.x, origin.y, origin.z, dx, dy, dz, b);
      if (t >= 0 && t < best) { best = t; found = true; }
    }
    if (found) {
      r.hit = true;
      r.distance = best;
      r.point.set(origin.x + dx * best, origin.y + dy * best, origin.z + dz * best);
    }
    return r;
  }

  groundCheck(pos, radius, maxDist) {
    const g = this._gnd;
    g.hit = false;
    let bestY = -Infinity;
    for (const p of this.platforms) {
      if (pos.x < p.x0 || pos.x > p.x1 || pos.z < p.z0 || pos.z > p.z1) continue;
      if (p.y > pos.y + 1e-3) continue;
      if (pos.y - p.y > maxDist) continue;
      if (p.y > bestY) bestY = p.y;
    }
    if (bestY > -Infinity) { g.hit = true; g.y = bestY; g.distance = pos.y - bestY; }
    return g;
  }
}

/** Ray/AABB slab test. Returns the entry distance, or -1. */
function slab(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

const inBox = (p, b, pad = 0) =>
  p.x > b.x0 + pad && p.x < b.x1 - pad &&
  p.y > b.y0 + pad && p.y < b.y1 - pad &&
  p.z > b.z0 + pad && p.z < b.z1 - pad;

/**
 * The level's walkable surfaces, coarse but faithful to §8.1.
 *
 * **These are five rectangles, not the temple.** Everything in this file runs against them, so
 * nothing in this file can say whether a route lies anywhere a guard can actually stand — and
 * for a long time it did not: `hall_weave` ran its legs down the line of the aisle columns and
 * passed every test here. `tests/patrol.test.mjs` builds the shipped level and asks that
 * question properly; this suite's job is the follower code, which these rectangles are enough
 * for and much faster at.
 */
const FLOORS = [
  { x0: -30, x1: 30, z0: -60, z1: 100, y: 0 },      // courtyard + hall + approach
  { x0: -9.4, x1: 9.4, z0: 2.6, z1: 19.4, y: 2 },    // obelisk terrace, stage 1
  { x0: -24, x1: 24, z0: -52, z1: -16, y: 17 },      // rooftop deck
  { x0: -14, x1: 14, z0: -78, z1: -56, y: -12 },     // tomb vault
  { x0: 20.5, x1: 25, z0: -14, z1: 32, y: 9 },       // courtyard architrave ledge
];

class StubEngine {
  constructor({ collision = null, tod = 0.06 } = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.quality = 'med';
    this.warnings = [];
    this.debug = { timeOfDay: tod };
    this.time = 0;
    this.events = [];
    this._mods = new Map();
    this._ev = new Map();
    this.movement = {
      position: new THREE.Vector3(0, 0, 400),
      velocity: new THREE.Vector3(),
      speed: 0, maxSpeed: 7.2, grounded: true, stateName: 'idle',
    };
    if (collision) this._mods.set('collision', collision);
    this._mods.set('movement', this.movement);
  }
  get(k) { return this._mods.get(k) ?? null; }
  has(k) { return this._mods.has(k); }
  warn(m) { this.warnings.push(String(m)); }
  on(e, fn) {
    if (!this._ev.has(e)) this._ev.set(e, new Set());
    this._ev.get(e).add(fn);
    return () => this._ev.get(e)?.delete(fn);
  }
  emit(e, p) {
    this.events.push({ e, state: p?.state, id: p?.id });
    for (const fn of this._ev.get(e) || []) fn(p);
  }
  registerCollider() { return {}; }
}

async function makeGuards(opts = {}) {
  const collision = new StubCollision({ boxes: opts.boxes || [], platforms: opts.platforms || FLOORS });
  const engine = new StubEngine({ collision, tod: opts.tod ?? 0.06 });
  const guards = new Guards(engine);
  await guards.init();
  return { guards, engine, collision };
}

/** Advance the module `seconds` at a fixed step, calling `onStep(t)` before each frame. */
function run(guards, engine, seconds, dt = 1 / 30, onStep = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    engine.time += dt;
    if (onStep) onStep(engine.time, i);
    guards.update(dt, engine.time);
  }
}

/* ============================== the tests ================================= */

async function main() {
  console.log('\nGUARDS — behaviour tests\n');

  /* ------------------------------------------------------------------ 1 --- */
  console.log('assembly');
  {
    const { guards, engine } = await makeGuards();
    check('one guard per ROSTER entry, each with its own skeleton', () => {
      assert(guards.list.length === 11, `expected 11 guards, got ${guards.list.length}`);
      const skels = new Set(guards.list.map((g) => g.skeleton));
      assert(skels.size === 11, 'skeletons are shared between instances');
      const geos = new Set(guards.list.map((g) => g.mesh.geometry));
      assert(geos.size === 3, `expected 3 shared geometries, got ${geos.size}`);
    });
    check('the whole garrison fits the 40 draw-call budget', () => {
      // 11 × (body + metal) + 11 ink shells + beam + pool.
      const withShells = guards.stats.draws + guards.list.length;
      assert(withShells <= 40, `${withShells} draw calls`);
    });
    check('init raised no warnings', () => {
      assert(engine.warnings.length === 0, engine.warnings.join(' | '));
    });
    check('every guard starts on his route, on the floor', () => {
      for (const g of guards.list) {
        assert(Number.isFinite(g.position.x + g.position.y + g.position.z), `${g.id} has a non-finite position`);
        const want = g.route.baseY;
        if (want !== null && want !== undefined) near(g.position.y, want, 0.35, `${g.id} spawn height`);
      }
    });
  }

  /* ------------------------------------------------------------------ 2 --- */
  console.log('\npatrol');
  {
    const { guards, engine } = await makeGuards();
    const g = guards.list[0];
    assert(g.route.name === 'south_gate', 'roster #0 should walk south_gate');

    const wps = ROUTES.south_gate.points.map(([x, z]) => ({ x, z, best: Infinity }));
    let maxOff = 0;
    run(guards, engine, 130, 1 / 30, () => {
      for (const w of wps) {
        const d = Math.hypot(g.position.x - w.x, g.position.z - w.z);
        if (d < w.best) w.best = d;
      }
      maxOff = Math.max(maxOff, g._offRoute);
    });

    check('a guard walks his full route and loops it', () => {
      assert(g.laps >= 1, `only completed ${g.laps} laps in 130 s`);
      for (let i = 0; i < wps.length; i++) {
        assert(wps[i].best < 1.0, `never reached waypoint ${i} (${wps[i].x}, ${wps[i].z}) — closest ${wps[i].best.toFixed(2)} m`);
      }
    });
    check('he stays glued to the spline (never wanders off-route)', () => {
      assert(maxOff < 1.2, `strayed ${maxOff.toFixed(2)} m from the route`);
    });
    check('he actually pauses at the authored dwell stops', () => {
      // Read the count off the route table rather than hardcoding it: the previous literal 7
      // went stale the moment the routes were re-authored against the real level.
      const authored = ROUTES.south_gate.points.filter((p) => (p[2] ?? 0) > 0).length;
      assert(authored > 0, 'south_gate authors no dwell stops at all');
      assert(g.route.stops.length === authored,
        `expected ${authored} dwell stops, got ${g.route.stops.length}`);
    });

    check('an open route pauses at its own turn-around, not just in the middle', () => {
      // Four of the ten routes ping-pong, and the about-face is the beat the player counts.
      const open = ROSTER.map((e, i) => ({ e, i })).filter(({ e }) => !ROUTES[e.route].closed);
      assert(open.length > 0, 'no open routes in the roster to check');
      let checked = 0;
      for (const { e } of open) {
        const r = guards.routes[e.route];
        const ends = r.stops.filter((s) => s.u < 1e-3 || s.u > 1 - 1e-3);
        const authoredEnds = [ROUTES[e.route].points[0], ROUTES[e.route].points.at(-1)]
          .filter((p) => (p[2] ?? 0) > 0).length;
        checked++;
        assert(ends.length === authoredEnds,
          `${e.route}: ${authoredEnds} end dwells authored, ${ends.length} resolved onto the spline`);
      }
      assert(checked === open.length, `checked ${checked} of ${open.length} open routes`);
    });
  }

  /* ------------------------------------------------------------------ 3 --- */
  console.log('\nline of sight');
  {
    const { guards, engine, collision } = await makeGuards();
    const g = guards.list[0];
    g.dwell = 1e9; g.dwellAction = 'look';          // hold his post for the duration

    // Drop a pillar squarely between guard #0's post and a player 7 m in front of him.
    const c = g.position.clone().addScaledVector(g.forward, 3.5);
    const pillar = { x0: c.x - 1.4, x1: c.x + 1.4, y0: 0, y1: 6, z0: c.z - 1.4, z1: c.z + 1.4 };
    collision.boxes.push(pillar);

    const place = () => {
      const eye = g._eyePosition(new THREE.Vector3());
      engine.movement.position.set(eye.x + g.forward.x * 7, eye.y - 0.95, eye.z + g.forward.z * 7);
    };
    engine.movement.speed = 2.6;
    engine.movement.stateName = 'move';
    run(guards, engine, 6, 1 / 30, place);

    check('a pillar genuinely blocks line of sight', () => {
      assert(g.senses.suspicion === 0, `suspicion rose to ${g.senses.suspicion.toFixed(3)} through solid stone`);
      assert(g.state === STATE.PATROL, `state went to ${g.state} behind cover`);
      assert(collision.rays > 0, 'no LOS ray was ever cast');
    });

    // Take the pillar away; the same player must now be seen.
    collision.boxes.length = 0;
    run(guards, engine, 3, 1 / 30, place);
    check('with the pillar gone the same player is seen', () => {
      assert(g.senses.suspicion > DETECT.suspicious,
        `suspicion only reached ${g.senses.suspicion.toFixed(3)} in the open`);
    });
  }

  /* ------------------------------------------------------------------ 4 --- */
  console.log('\ndetection model');
  {
    const { guards, engine } = await makeGuards({ tod: 0.02 });
    const g = guards.list[0];
    g.dwell = 1e9; g.dwellAction = 'look';
    const D = 6.0;
    const cfg = VISION.temple;

    const place = () => {
      const eye = g._eyePosition(new THREE.Vector3());
      engine.movement.position.set(eye.x + g.forward.x * D, eye.y - 0.95, eye.z + g.forward.z * D);
    };

    // Let the light estimate settle before measuring anything.
    engine.movement.speed = 0; engine.movement.stateName = 'idle';
    engine.movement.position.set(0, 0, 400);
    run(guards, engine, 3, 1 / 60);

    engine.movement.speed = 2.6;
    engine.movement.stateName = 'move';
    g.senses.suspicion = 0;

    const dt = 1 / 60;
    let t = 0;
    const before = g.senses.suspicion;
    run(guards, engine, 0.5, dt, place);
    t = 0.5;
    const rate = (g.senses.suspicion - before) / t;

    check('suspicion fills at the rate DETECT is tuned for', () => {
      const lit = guards._light;
      const nearK = THREE.MathUtils.lerp(DETECT.nearBoost, DETECT.farFloor, D / cfg.range);
      const moving = 2.6 / 7.2;
      const move = THREE.MathUtils.lerp(DETECT.moveWalk, DETECT.moveRun,
        THREE.MathUtils.clamp((moving - 0.35) / 0.65, 0, 1));
      const light = THREE.MathUtils.lerp(DETECT.darkGain, DETECT.litGain, THREE.MathUtils.clamp(lit, 0, 1));
      const want = DETECT.fillBase * nearK * move * light;
      near(rate, want, want * 0.08, 'fill rate (units/s)');
    });

    check('walking into the bright core at 6 m is caught inside two seconds', () => {
      g.senses.suspicion = 0;
      let elapsed = 0;
      for (let i = 0; i < 60 * 6; i++) {
        engine.time += dt; place(); guards.update(dt, engine.time); elapsed += dt;
        if (g.senses.suspicion >= DETECT.chase) break;
      }
      assert(elapsed > 0.6 && elapsed < 2.2, `took ${elapsed.toFixed(2)} s to fill`);
    });

    check('sneaking multiplies the time to detection by ~1/sneakGain', () => {
      g.senses.reset();
      g.senses.suspicion = 0;
      engine.movement.stateName = 'sneak';
      const b = g.senses.suspicion;
      run(guards, engine, 0.5, dt, place);
      const sneakRate = (g.senses.suspicion - b) / 0.5;
      near(sneakRate / rate, DETECT.sneakGain, DETECT.sneakGain * 0.12, 'sneak gain ratio');
      engine.movement.stateName = 'move';
    });

    check('suspicion drains at the tuned rate after the grace period', () => {
      g.senses.suspicion = 0.9;
      engine.movement.position.set(0, 0, 500);       // out of every sense
      engine.movement.speed = 0;
      // Nothing must drain until drainDelay has elapsed.
      run(guards, engine, DETECT.drainDelay * 0.7, dt);
      near(g.senses.suspicion, 0.9, 1e-6, 'drained during the grace period');
      run(guards, engine, DETECT.drainDelay * 0.4, dt);
      const a = g.senses.suspicion;
      run(guards, engine, 1.0, dt);
      const drained = (a - g.senses.suspicion) / 1.0;
      near(drained, DETECT.drain, DETECT.drain * 0.08, 'drain rate (units/s)');
    });
  }

  /* ------------------------------------------------------------------ 5 --- */
  console.log('\nalert machine');
  {
    const { guards, engine } = await makeGuards({ tod: 0.02 });
    const g = guards.list[0];
    g.dwell = 1e9; g.dwellAction = 'look';
    const seen = [];
    engine.on('guardAlert', (p) => { if (p.id === g.id) seen.push(p.state); });

    const place = () => {
      const eye = g._eyePosition(new THREE.Vector3());
      engine.movement.position.set(eye.x + g.forward.x * 5, eye.y - 0.95, eye.z + g.forward.z * 5);
    };
    engine.movement.speed = 4.0; engine.movement.stateName = 'move';
    run(guards, engine, 5, 1 / 60, place);

    check('patrol → suspicious → searching → chase, in order, with the react delay', () => {
      assert(g.state === STATE.CHASE, `ended in ${g.state}, expected chase`);
      const order = [STATE.SUSPICIOUS, STATE.SEARCHING, STATE.CHASE];
      let k = 0;
      for (const s of seen) if (s === order[k]) k++;
      assert(k === order.length, `saw ${seen.join(' → ')}`);
    });

    check('every transition emits guardAlert with the guard and the state', () => {
      const ev = engine.events.filter((e) => e.e === 'guardAlert');
      assert(ev.length >= 3, `only ${ev.length} guardAlert events`);
      assert(ev.every((e) => typeof e.state === 'string' && e.id), 'payload is missing guard/state');
    });

    // Now vanish. He must lose the trail and eventually go back to work.
    engine.movement.position.set(0, 0, 600);
    engine.movement.speed = 0; engine.movement.stateName = 'idle';
    let sawLost = false;
    let backToPatrol = -1;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 45; i++) {
      engine.time += dt;
      guards.update(dt, engine.time);
      if (g.state === STATE.LOST) sawLost = true;
      if (sawLost && g.state === STATE.PATROL) { backToPatrol = i * dt; break; }
    }

    check('losing the player runs chase → lost → … → patrol', () => {
      assert(sawLost, 'never entered lost');
      assert(backToPatrol >= 0, `still ${g.state} after 45 s`);
      assert(backToPatrol > DETECT.loseSight, `gave up after only ${backToPatrol.toFixed(1)} s`);
      assert(backToPatrol < 30, `took ${backToPatrol.toFixed(1)} s to stand down`);
      assert(g.senses.suspicion < DETECT.suspicious, 'returned to patrol with a hot meter');
    });

    check('he walks back to the nearest point of his beat and resumes it', () => {
      const away = g._offRoute;
      assert(away > 0.5, 'the chase never took him off his route — the test proves nothing');
      // _setState(PATROL) re-anchors `u` to the closest point, so the walk home is the
      // shortest one available rather than a trek back to wherever he abandoned the beat.
      const stale = new THREE.Vector3();
      g.route.at(0, stale);
      assert(away <= Math.hypot(stale.x - g.position.x, stale.z - g.position.z) + 1e-6,
        're-anchor did not pick the nearest point on the route');

      g.dwell = 0;
      run(guards, engine, 25, 1 / 30);
      assert(g._offRoute < 1.2, `still ${g._offRoute.toFixed(2)} m off route after 25 s`);
      const u0 = g.u;
      run(guards, engine, 8, 1 / 30);
      assert(g.u !== u0 || g.dwell > 0, 'never resumed walking the beat');
    });
  }

  /* ------------------------------------------------------------------ 6 --- */
  console.log('\nno guard leaves the level');
  {
    // A wall straddling the south-gate beat, and the real rooftop/ledge/tomb footprints.
    const wall = { x0: 2.6, x1: 4.2, y0: 0, y1: 4, z0: -7.0, z1: 2.0 };
    const { guards, engine } = await makeGuards({ boxes: [wall] });

    const prev = guards.list.map((g) => g.position.clone());
    let breached = null;
    let tunnelled = null;
    let offDeck = null;
    let fell = null;
    let roofStray = 0;
    let ledgeStray = 0;
    const roof = guards.list[7];
    const ledge = guards.list[9];

    // Every frame, not just the last one: a guard who crosses the wall and comes back is
    // still a guard who walked through a wall.
    const watch = () => {
      for (let i = 0; i < guards.list.length; i++) {
        const g = guards.list[i];
        if (inBox(g.position, wall, -0.02)) breached ||= g.id;
        // Segment test: did this frame's step pass through the slab?
        const dx = g.position.x - prev[i].x, dy = g.position.y - prev[i].y, dz = g.position.z - prev[i].z;
        const len = Math.hypot(dx, dy, dz);
        if (len > 1e-6) {
          const t = slab(prev[i].x, prev[i].y + 1.0, prev[i].z, dx / len, dy / len, dz / len, wall);
          if (t >= 0 && t < len) tunnelled ||= `${g.id} @${prev[i].x.toFixed(1)},${prev[i].z.toFixed(1)}`;
        }
        prev[i].copy(g.position);
      }
      roofStray = Math.max(roofStray, Math.abs(roof.position.x) - 24, Math.abs(roof.position.z + 34) - 18);
      ledgeStray = Math.max(ledgeStray, Math.abs(roof.position.y - 17));
      if (ledge.position.x < 20 || ledge.position.x > 25.5) ledgeStray = Math.max(ledgeStray, 1);
    };

    run(guards, engine, 90, 1 / 30, (t, i) => {
      watch();
      // Keep the rooftop and ledge guards charging at something well past their edge, so the
      // ledge refusal is actually put under load rather than merely never exercised.
      for (const [g, tx, tz] of [[roof, 40, -34], [ledge, -20, 9]]) {
        g.senses.suspicion = DETECT.ceiling;
        g.senses.lastSeenValid = true;
        g.senses.timeSinceSeen = 0;
        g.senses.lastSeen.set(tx, g.position.y, tz);
        if (g.state !== STATE.CHASE) g._setState(STATE.CHASE);
      }
    });

    for (let i = 0; i < guards.list.length; i++) {
      const g = guards.list[i];
      if (inBox(g.position, wall, -0.05)) breached ||= g.id;
      if (!Number.isFinite(g.position.y)) fell ||= g.id;
    }
    if (roof.position.x < -25 || roof.position.x > 25 ||
        roof.position.z < -53 || roof.position.z > -15 ||
        Math.abs(roof.position.y - 17) > 0.6) offDeck = roof.position.toArray().map((v) => v.toFixed(2)).join(', ');
    const ledgeOff = (ledge.position.x < 20 || ledge.position.x > 25.5 || Math.abs(ledge.position.y - 9) > 0.6)
      ? ledge.position.toArray().map((v) => v.toFixed(2)).join(', ') : null;

    check('no guard walks through a wall, on any frame', () => {
      assert(!breached, `${breached} ended up inside the wall`);
      assert(!tunnelled, `${tunnelled} tunnelled through the wall between frames`);
    });
    check('the rooftop patrol never steps off the rooftop', () => {
      assert(!offDeck, `rooftop guard at (${offDeck})`);
      assert(roofStray <= 0.6, `rooftop guard strayed ${roofStray.toFixed(2)} m past the deck edge`);
      assert(ledgeStray <= 0.6, `rooftop guard's height wandered ${ledgeStray.toFixed(2)} m`);
    });
    check('the architrave scarab never steps off the ledge', () => {
      assert(!ledgeOff, `ledge scarab at (${ledgeOff})`);
    });
    check('nobody falls out of the world', () => {
      assert(!fell, `${fell} has a non-finite position`);
      for (const g of guards.list) {
        assert(g.position.y > -20 && g.position.y < 40, `${g.id} at y=${g.position.y.toFixed(1)}`);
      }
    });
    check('the wall stops him without pinning him there forever', () => {
      const g = guards.list[0];
      assert(g.laps >= 0 && Number.isFinite(g.u), 'route parameter went bad');
    });
    void prev;
  }

  /* ------------------------------------------------------------------ 7 --- */
  console.log('\nthe MOVEMENT API');
  {
    const { guards, engine } = await makeGuards();
    const g = guards.list[0];
    run(guards, engine, 1, 1 / 30);

    check('pocketPosition sits behind the guard', () => {
      const back = new THREE.Vector3().subVectors(g.pocketPosition, g.position);
      back.y = 0;
      assert(back.dot(g.forward) < 0, 'the pouch is in front of him');
      assert(back.length() > 0.2 && back.length() < 0.8, `pouch ${back.length().toFixed(2)} m away`);
    });

    check('nearestPickpocketTarget respects distance and facing', () => {
      const toward = new THREE.Vector3().subVectors(g.position, g.pocketPosition).normalize();
      const from = g.pocketPosition.clone().addScaledVector(toward, -0.5);
      assert(guards.nearestPickpocketTarget(from, 2.0, toward) === g, 'did not find the guard in front');
      assert(guards.nearestPickpocketTarget(from, 0.2, toward) === null, 'ignored maxDist');
      assert(guards.nearestPickpocketTarget(from, 2.0, toward.clone().negate()) === null, 'targeted a guard behind Sly');
    });

    check('pickpocket pays out once and only once', () => {
      const loot = g.pickpocket();
      assert(loot && loot.coins > 0, 'no loot');
      assert('item' in loot, 'loot has no item slot');
      assert(g.pickpocket() === null, 'paid out twice');
      assert(g.canBePickpocketed === false, 'still pickpocketable when empty');
    });

    check('canBePickpocketed goes false the moment he is alerted', () => {
      const h = guards.list[1];
      assert(h.canBePickpocketed === true, 'a patrolling guard should be a target');
      h.senses.suspicion = DETECT.suspicious + 0.01;
      h._setState(STATE.SUSPICIOUS);
      assert(h.canBePickpocketed === false, 'still a target while alerted');
    });

    check('bounce stuns a temple guard and merely angers a Heavy', () => {
      const temple = guards.list[4];
      assert(temple.type === 'temple');
      assert(temple.bounce() === true, 'the jackal should go down');
      assert(temple.state === STATE.KO, `jackal is ${temple.state}`);
      const heavy = guards.list[2];
      assert(heavy.type === 'heavy');
      assert(heavy.bounce() === false, 'the hippo should not go down');
      assert(heavy.state === STATE.CHASE, `hippo is ${heavy.state}`);
    });

    check('hit knocks back, stuns, then KOs', () => {
      const h = guards.list[5];
      const dir = new THREE.Vector3(1, 0, 0);
      assert(h.hit(dir, 1) === true);
      assert(h.state === STATE.STUNNED, `first hit left him ${h.state}`);
      assert(h.knock.length() > 0.5, 'no knockback impulse');
      h.hit(dir, 1); h.hit(dir, 1);
      assert(h.state === STATE.KO, `third hit left him ${h.state}`);
    });

    check('a KO\'d guard recovers rather than staying dead', () => {
      const h = guards.list[5];
      run(guards, engine, DETECT.koTime + 1, 1 / 30);
      assert(h.state === STATE.PATROL, `still ${h.state} after ${DETECT.koTime}s`);
    });
  }

  /* ------------------------------------------------------------------ 8 --- */
  console.log('\nthe cone');
  {
    const { guards, engine, collision } = await makeGuards();
    const g = guards.list[0];
    g.dwell = 1e9;
    run(guards, engine, 2, 1 / 30);

    check('the beam instance matches the guard: origin, aim and half-angle', () => {
      const m = new THREE.Matrix4();
      guards.beamMesh.getMatrixAt(0, m);
      const e = m.elements;
      const origin = new THREE.Vector3(e[12], e[13], e[14]);
      const axis = new THREE.Vector3(e[8], e[9], e[10]);
      const lateral = new THREE.Vector3(e[0], e[1], e[2]);
      const reach = axis.length();
      near(reach, g.reach, 0.02, 'beam throw');
      // Half-angle: the lateral scale is tan(halfAngle) × reach by construction.
      near(Math.atan2(lateral.length(), reach), VISION.temple.halfAngle, 0.02, 'beam half-angle');
      // Aims where he is looking, tipped slightly down.
      const flat = axis.clone().setY(0).normalize();
      assert(flat.dot(g.forward) > 0.99, 'beam does not follow his facing');
      assert(axis.y < 0, 'beam aims at the sky');
      // Starts at his head, not his feet or the world origin.
      assert(origin.y > g.position.y + 1.2 && origin.y < g.position.y + 2.3,
        `beam apex at y=${(origin.y - g.position.y).toFixed(2)} above his feet`);
    });

    check('the pool is the beam footprint, flat on the floor at his feet', () => {
      const m = new THREE.Matrix4();
      guards.poolMesh.getMatrixAt(0, m);
      const e = m.elements;
      const origin = new THREE.Vector3(e[12], e[13], e[14]);
      const along = new THREE.Vector3(e[8], e[9], e[10]);
      const across = new THREE.Vector3(e[0], e[1], e[2]);
      near(origin.y - g.position.y, 0.035, 0.01, 'pool height above the paving');
      near(along.length(), g.reach, 0.02, 'pool length');
      near(Math.atan2(across.length(), along.length()), VISION.temple.halfAngle, 0.02, 'pool spread');
      assert(Math.abs(along.y) < 1e-6 && Math.abs(across.y) < 1e-6, 'the pool is not flat');
    });

    check('every cone instance has a finite transform and colour', () => {
      const m = new THREE.Matrix4();
      for (let i = 0; i < guards.list.length; i++) {
        guards.beamMesh.getMatrixAt(i, m);
        for (const v of m.elements) assert(Number.isFinite(v), `beam ${i} matrix has NaN`);
        guards.poolMesh.getMatrixAt(i, m);
        for (const v of m.elements) assert(Number.isFinite(v), `pool ${i} matrix has NaN`);
      }
      const c = guards.beamMesh.instanceColor;
      assert(c, 'no instanceColor — USE_INSTANCING_COLOR will never be defined');
      for (const v of c.array) assert(Number.isFinite(v) && v >= 0, 'beam colour has NaN');
    });

    check('the beam shortens against geometry but never collapses to a stub', () => {
      const open = g.reach;
      assert(open > 10, `unobstructed beam only reached ${open.toFixed(2)} m`);
      // Drop a pillar 2.5 m in front of his eyes.
      const c = g.position.clone().addScaledVector(g.forward, 2.5);
      collision.boxes.push({ x0: c.x - 1.2, x1: c.x + 1.2, y0: 0, y1: 6, z0: c.z - 1.2, z1: c.z + 1.2 });
      run(guards, engine, 2, 1 / 30);
      assert(g.reach < open * 0.75, `beam did not shorten at all (${g.reach.toFixed(2)} of ${open.toFixed(2)})`);
      // ...but a 34°-wide cone whose axis clips a doorframe is still mostly in open air, so
      // the throw floors out rather than vanishing. Depth testing handles the rest per pixel.
      assert(g.reach > VISION.temple.coneLength * 0.4,
        `beam collapsed to a ${g.reach.toFixed(2)} m stub and stopped reading`);
      collision.boxes.length = 0;
    });

    check('the beam turns red as the meter fills and dims when he is down', () => {
      const c = new THREE.Color();
      guards.beamMesh.getColorAt(0, c);
      const calm = c.clone();
      g.senses.suspicion = DETECT.chase;
      g._setState(STATE.CHASE);
      run(guards, engine, 0.2, 1 / 30);
      guards.beamMesh.getColorAt(0, c);
      assert(c.r / Math.max(1e-5, c.b) > calm.r / Math.max(1e-5, calm.b) * 1.5,
        'the cone did not shift toward red when alerted');
      g.bounce();
      run(guards, engine, 0.2, 1 / 30);
      guards.beamMesh.getColorAt(0, c);
      assert(c.r + c.g + c.b < 1e-4, 'a KO\'d guard is still projecting light');
    });

    check('cone brightness tracks Senses.gain', () => {
      const h = guards.list[3];
      const c = new THREE.Color();
      h.senses.gain = 0; h.senses.suspicion = 0;
      run(guards, engine, 0.05, 1 / 30);
      guards.beamMesh.getColorAt(3, c);
      const dim = c.r + c.g + c.b;
      // Hold a fill rate open across the frame the cone samples.
      const spy = () => { h.senses.gain = DETECT.fillBase; };
      engine.time += 1 / 30; spy(); h.update(1 / 30, guards._sense); spy();
      guards._updateCones(1 / 30, engine.time);
      guards.beamMesh.getColorAt(3, c);
      assert(c.r + c.g + c.b > dim * 1.3, 'gain did not brighten the cone');
    });
  }

  /* ------------------------------------------------------------------ 9 --- */
  console.log('\nthe guard canonical shot');
  {
    const { guards, engine } = await makeGuards();
    // §7.2: camera (3, 2, 4.2) → target (−0.8, 1.5, 0), 38° vertical, 16:9. Pose the stub
    // camera exactly as core/Shots.js applyShot() does, since the solver reads it live.
    const CAM = new THREE.Vector3(3, 2, 4.2);
    const FWD = new THREE.Vector3(-0.8 - 3, 1.5 - 2, 0 - 4.2).normalize();
    const RIGHT = new THREE.Vector3().crossVectors(FWD, new THREE.Vector3(0, 1, 0)).normalize();
    engine.camera.position.copy(CAM);
    engine.camera.fov = 38;
    engine.camera.aspect = 16 / 9;
    engine.camera.up.set(0, 1, 0);
    engine.camera.lookAt(new THREE.Vector3(-0.8, 1.5, 0));
    engine.camera.updateProjectionMatrix();
    engine.camera.updateMatrixWorld(true);

    engine.emit('shot', { name: 'guard' });
    run(guards, engine, 0.5, 1 / 30);
    const g = guards.list[0];

    check('roster #0 is parked in frame and held there', () => {
      const to = new THREE.Vector3().subVectors(g.position, CAM);
      const dist = to.length();
      assert(dist > 4 && dist < 18, `subject is ${dist.toFixed(1)} m from the lens`);
      to.normalize();
      const off = Math.acos(THREE.MathUtils.clamp(to.dot(FWD), -1, 1));
      assert(off < THREE.MathUtils.degToRad(28), `subject is ${(off * 57.3).toFixed(0)}° off axis`);
      assert(g.speed === 0, 'the subject walked out of frame');
    });

    check('the solver puts his whole silhouette inside the frame', () => {
      // §7.2: 38° vertical lens. Feet and head must both land inside the top/bottom edges.
      const halfV = Math.tan(THREE.MathUtils.degToRad(19));
      const d = new THREE.Vector3().subVectors(g.position, CAM).dot(FWD);
      const axis = CAM.y + FWD.y * d;
      const half = halfV * d;
      const feet = (g.position.y - axis) / half;
      const head = (g.position.y + 2.1 - axis) / half;
      assert(head <= 0.98, `his head is ${head.toFixed(2)} — above the top edge`);
      assert(feet >= -0.98, `his feet are ${feet.toFixed(2)} — below the bottom edge`);
      assert(head - feet > 0.18, `he only fills ${((head - feet) / 2 * 100).toFixed(0)}% of the frame`);
    });
    check('his beam rakes across the frame rather than out of it', () => {
      // Mostly across the lens (big screen-x component), a little toward the viewer.
      const screenX = g.forward.dot(RIGHT);
      const depth = g.forward.dot(FWD);
      assert(screenX < -0.7, `beam only ${screenX.toFixed(2)} across the frame`);
      assert(depth > -0.6 && depth < 0.3, `beam points ${depth.toFixed(2)} along the lens axis`);
    });
    check('releasing the shot lets him walk again', () => {
      engine.emit('shot', { name: 'hero' });
      g.dwell = 0;
      run(guards, engine, 3, 1 / 30);
      assert(guards._shotLock === null, 'still locked');
      assert(g.speed > 0.2, 'never resumed his beat');
    });
  }

  /* ----------------------------------------------------------------- 10 --- */
  console.log('\ndeterminism (AGENTS.md §1)');
  {
    const trace = async () => {
      const { guards, engine } = await makeGuards();
      run(guards, engine, 30, 1 / 30);
      return guards.list.map((g) => [
        +g.position.x.toFixed(6), +g.position.y.toFixed(6), +g.position.z.toFixed(6),
        +g.yaw.toFixed(6), +g.u.toFixed(6), g.state,
      ].join(','));
    };
    const a = await trace();
    const b = await trace();
    check('the same seed rebuilds the identical patrol, frame for frame', () => {
      for (let i = 0; i < a.length; i++) {
        assert(a[i] === b[i], `guard ${i} diverged:\n        ${a[i]}\n        ${b[i]}`);
      }
    });
    check('the roster is 6 temple, 3 heavy, 2 scarab', () => {
      const counts = {};
      for (const r of ROSTER_TYPES) counts[r] = (counts[r] || 0) + 1;
      assert(counts.temple === 6 && counts.heavy === 3 && counts.scarab === 2,
        JSON.stringify(counts));
    });
  }

  /* ----------------------------------------------------------------- 11 --- */
  console.log('\nsoak');
  {
    // Five simulated minutes with a player wandering through the courtyard, so every guard
    // cycles patrol → alert → chase → lost → patrol repeatedly. Nothing may drift or go NaN.
    const { guards, engine } = await makeGuards();
    let worstOff = 0;
    let states = new Set();
    run(guards, engine, 300, 1 / 30, (t) => {
      engine.movement.position.set(Math.sin(t * 0.21) * 14, 0, 8 + Math.cos(t * 0.17) * 16);
      engine.movement.speed = 3.2;
      engine.movement.stateName = 'move';
      for (const g of guards.list) {
        worstOff = Math.max(worstOff, g._offRoute);
        states.add(g.state);
      }
    });

    check('five minutes of live stealth leaves every guard finite and on his feet', () => {
      for (const g of guards.list) {
        const p = g.position;
        assert(Number.isFinite(p.x + p.y + p.z + g.yaw + g.u + g.speed),
          `${g.id} went non-finite: ${p.toArray()} yaw ${g.yaw} u ${g.u}`);
        assert(g.u >= 0 && g.u <= 1, `${g.id} route parameter escaped [0,1]: ${g.u}`);
        assert(Math.abs(g.speed) < 12, `${g.id} is moving at ${g.speed.toFixed(1)} m/s`);
        assert(g.senses.suspicion >= 0 && g.senses.suspicion <= DETECT.ceiling,
          `${g.id} meter out of range: ${g.senses.suspicion}`);
      }
      assert(worstOff < 40, `a guard wandered ${worstOff.toFixed(1)} m from his route`);
    });

    check('the whole alert machine is exercised, not just patrol', () => {
      for (const want of [STATE.PATROL, STATE.SUSPICIOUS, STATE.SEARCHING, STATE.CHASE, STATE.LOST]) {
        assert(states.has(want), `never entered ${want} in five minutes (saw ${[...states].join(', ')})`);
      }
    });

    check('cone instances stay finite through the whole soak', () => {
      for (const v of guards.beamMesh.instanceMatrix.array) assert(Number.isFinite(v), 'beam matrix NaN');
      for (const v of guards.beamMesh.instanceColor.array) assert(Number.isFinite(v), 'beam colour NaN');
      for (const v of guards.poolMesh.instanceMatrix.array) assert(Number.isFinite(v), 'pool matrix NaN');
      for (const v of guards._poolOnset.array) assert(Number.isFinite(v) && v > 0, 'pool onset NaN');
    });
  }

  /* ---------------------------------------------------------------- done --- */
  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f.name}\n${f.err.stack}\n`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

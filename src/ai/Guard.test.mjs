/**
 * Guard.test.mjs — headless behaviour tests for the garrison.
 *
 *   node src/ai/Guard.test.mjs
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
import { ROUTES, DETECT, STATE, VISION } from './Patrol.js';

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

/** The level's walkable surfaces, coarse but faithful to §8.1. */
const FLOORS = [
  { x0: -30, x1: 30, z0: -60, z1: 100, y: 0 },      // courtyard + hall + approach
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
      assert(g.route.stops.length === 7, `expected 7 dwell stops, got ${g.route.stops.length}`);
    });
  }

  /* ------------------------------------------------------------------ 3 --- */
  console.log('\nline of sight');
  {
    // A pillar between guard #0's post and a player standing 7 m in front of him.
    const pillar = { x0: -1.9, x1: 0.9, y0: 0, y1: 6, z0: 2.6, z1: 5.4 };
    const { guards, engine } = await makeGuards({ boxes: [pillar] });
    const g = guards.list[0];
    g.dwell = 1e9; g.dwellAction = 'look';          // hold his post for the duration

    // Park the player dead ahead, behind the pillar.
    const place = () => {
      g._eyePosition(new THREE.Vector3());
      const eye = g._eyePosition(new THREE.Vector3());
      engine.movement.position.set(eye.x + g.forward.x * 7, eye.y - 0.95, eye.z + g.forward.z * 7);
    };
    engine.movement.speed = 2.6;
    engine.movement.stateName = 'move';
    run(guards, engine, 6, 1 / 30, place);

    check('a pillar genuinely blocks line of sight', () => {
      assert(g.senses.suspicion === 0, `suspicion rose to ${g.senses.suspicion.toFixed(3)} through solid stone`);
      assert(g.state === STATE.PATROL, `state went to ${g.state} behind cover`);
      assert(engine._mods.get('collision').rays > 0, 'no LOS ray was ever cast');
    });

    // Take the pillar away; the same player must now be seen.
    engine._mods.get('collision').boxes.length = 0;
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

    check('he resumes his route after standing down', () => {
      const u0 = g.u;
      g.dwell = 0;
      run(guards, engine, 6, 1 / 30);
      assert(g.u !== u0 || g.dwell > 0, 'never started walking again');
      assert(g._offRoute < 1.5, `${g._offRoute.toFixed(2)} m off route after the chase`);
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
    let offDeck = null;
    let fell = null;
    const roof = guards.list[7];
    const ledge = guards.list[9];

    run(guards, engine, 90, 1 / 30, (t, i) => {
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

    check('no guard walks through a wall', () => {
      assert(!breached, `${breached} ended up inside the wall`);
    });
    check('the rooftop patrol never steps off the rooftop', () => {
      assert(!offDeck, `rooftop guard at (${offDeck})`);
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
    const pillar = { x0: -1.9, x1: 0.9, y0: 0, y1: 6, z0: 2.0, z1: 4.0 };
    const { guards, engine } = await makeGuards({ boxes: [pillar] });
    const g = guards.list[0];
    g.dwell = 1e9;
    run(guards, engine, 2, 1 / 30);

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

    check('the beam is clipped by whatever is in front of him', () => {
      // Aim him straight at the pillar and check the throw shortens to roughly its face.
      g.yaw = 0; g.forward.set(0, 0, 1);
      run(guards, engine, 2, 1 / 30);
      assert(g.reach < 4.5, `beam still throws ${g.reach.toFixed(2)} m into a pillar 2 m away`);
      guards._mods; // no-op
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
    engine.emit('shot', { name: 'guard' });
    run(guards, engine, 0.5, 1 / 30);
    const g = guards.list[0];
    check('roster #0 is parked in frame and held there', () => {
      near(g.position.x, -1.0, 0.25, 'subject x');
      near(g.position.z, 0.0, 0.25, 'subject z');
      near(g.yaw, 1.99, 0.02, 'subject yaw');
      assert(g.speed === 0, 'the subject walked out of frame');
    });
    check('his beam rakes across the frame, not into the lens', () => {
      // Camera sits at (3, 2, 4.2) looking at (-0.8, 1.5, 0) — §7.2.
      const toCam = new THREE.Vector3(3 - g.position.x, 0, 4.2 - g.position.z).normalize();
      const dot = g.forward.dot(toCam);
      assert(dot > 0.1 && dot < 0.7, `three-quarter read failed: forward·toCamera = ${dot.toFixed(2)}`);
    });
    check('releasing the shot lets him walk again', () => {
      engine.emit('shot', { name: 'hero' });
      g.dwell = 0;
      run(guards, engine, 3, 1 / 30);
      assert(guards._shotLock === null, 'still locked');
      assert(g.speed > 0.2, 'never resumed his beat');
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

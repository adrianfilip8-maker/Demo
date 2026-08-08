import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import * as K from '../src/world/Kit.js';
import { Architecture } from '../src/world/Architecture.js';
import { buildEgyptLevel } from '../src/world/EgyptLevel.js';
import { Guards, GUARD_TUNE } from '../src/ai/Guard.js';
import {
  ROUTES, ROSTER, VISION, DETECT, STATE, Route, buildRoutes, Senses,
  stateForSuspicion, coneColourStop,
} from '../src/ai/Patrol.js';
import { TUNE as PLAYER } from '../src/player/Controller.js';

/**
 * The guard patrols, measured against the temple they are supposed to walk in.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────────────
 * `src/ai/Guard.test.mjs` has 44 tests and they all pass. They run the shipped `Guards` module
 * against a **stub** world: five hand-placed boxes and four rectangular floors, one of which is
 * a flat plane covering the whole map at y = 0. That suite proves the follower code is correct
 * — the spline maths, the alert machine, the wall refusal, the cone transforms — and it is
 * completely blind to the question of whether the authored waypoints lie anywhere a guard can
 * stand in the real level. Under it, `hall_weave` ran its north-south legs straight down the
 * line of the aisle columns and passed every test in the file.
 *
 * So: this suite builds the **shipped level** (`buildEgyptLevel`, ~1.3 s, plain Node, no
 * browser, no renderer, no lock), harvests every collision proxy it registers into a world-space
 * AABB, and serves the real `raycast` / `groundCheck` contract off those boxes. The guards then
 * walk the actual temple.
 *
 * The first run convicted **6 of 9 routes and 8 of 11 guards**. See `KNOWN_ISSUES.md` §230 and
 * `progress/records/PREREG-routeaudit.md` / `PREREG-patrolgap.md`, which hold the thresholds —
 * every one of them sealed before the corresponding measurement.
 *
 * ── The rule every data-driven test here obeys (§211.1) ───────────────────────────────────
 * Nine assertions once passed in this project while inspecting nothing, because they read a
 * field that did not exist. **Every test below counts what it inspected and asserts the count
 * is non-zero.** A passing test has to prove it looked.
 *
 * ── Calibration ───────────────────────────────────────────────────────────────────────────
 * Every measurement carries a positive arm that MUST fire, because an instrument that cannot
 * demonstrate it can see the defect says nothing when it reports the defect absent. The arms
 * are tests in their own right, named `CAL-*`, and they fail loudly if the thing they are
 * supposed to detect goes undetected.
 */

K.setMergeFn?.(mergeGeometries);

/* ====================================================================== */
/* the shipped level, as a collision oracle                                */
/* ====================================================================== */

const TAGS = new Map();

function quietEngine() {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    warnings: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get: () => null, has: () => false, on: () => () => {}, emit() {},
    registerCollider: (m, o) => TAGS.set(m, o?.tag || 'ground'),
    warn(m) { this.warnings.push(String(m)); },
  };
}

const arch = new Architecture(quietEngine());
const BUILD_T0 = Date.now();
buildEgyptLevel(arch);
const BUILD_MS = Date.now() - BUILD_T0;

/** Every registered collision proxy as `{ tag, min, max }` in world space. */
const BOXES = [];
for (const m of arch._colliders) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  if (!Number.isFinite(b.min.x) || !Number.isFinite(b.max.z)) continue;
  BOXES.push({ tag: TAGS.get(m) || 'ground', min: b.min.clone(), max: b.max.clone() });
}

const SUPPORT_TAGS = new Set(['ground', 'ledge']);
const BLOCK_TAGS = new Set(['wall', 'pole']);

/**
 * Uniform XZ bucket index. 248 boxes × ~600 k queries is 150 M box tests without it, which
 * turns a 12-second suite into a two-minute one.
 */
const CELL = 8;
const GRID = new Map();
const key = (ix, iz) => ix * 100003 + iz;
for (let i = 0; i < BOXES.length; i++) {
  const b = BOXES[i];
  for (let ix = Math.floor(b.min.x / CELL); ix <= Math.floor(b.max.x / CELL); ix++) {
    for (let iz = Math.floor(b.min.z / CELL); iz <= Math.floor(b.max.z / CELL); iz++) {
      const k = key(ix, iz);
      let a = GRID.get(k);
      if (!a) GRID.set(k, a = []);
      a.push(i);
    }
  }
}
function near(x, z, pad = 0) {
  const out = [];
  const seen = new Set();
  for (let ix = Math.floor((x - pad) / CELL); ix <= Math.floor((x + pad) / CELL); ix++) {
    for (let iz = Math.floor((z - pad) / CELL); iz <= Math.floor((z + pad) / CELL); iz++) {
      for (const i of GRID.get(key(ix, iz)) || []) {
        if (seen.has(i)) continue;
        seen.add(i); out.push(BOXES[i]);
      }
    }
  }
  return out;
}

/** Ray/AABB slab. Entry distance, or −1. */
function slab(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) return -1; continue; }
    let t1 = (b.min[ax] - o[ax]) / d[ax], t2 = (b.max[ax] - o[ax]) / d[ax];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/**
 * COLLISION, served off the real level. Same result shapes as `src/world/Collision.js` and the
 * same `ignoreTags` semantics — the guards cannot tell the difference, which is the point.
 */
class LevelCollision {
  constructor(extra = []) {
    this.ready = true;
    this.rays = 0;
    this.extra = extra;              // injected boxes, for the calibration arms
    this._d = new THREE.Vector3();
    this._ray = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0, tag: 'wall', rec: null };
    this._gnd = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), slope: 0, tag: 'ground', material: 'stone', rec: null, distance: 0 };
  }

  _candidates(x, z, pad) {
    const c = near(x, z, pad);
    return this.extra.length ? c.concat(this.extra) : c;
  }

  raycast(origin, dir, maxDist, opts) {
    this.rays++;
    const r = this._ray;
    r.hit = false;
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-9) return r;
    const d = this._d.set(dir.x / len, dir.y / len, dir.z / len);
    const ig = opts?.ignoreTags;
    let best = maxDist > 0 ? maxDist : 100;
    let hitTag = null;
    // One bucket lookup padded by the ray's own reach; cheap, and never misses a box the
    // unindexed scan would have found, because `pad` covers the whole segment.
    const pad = best + CELL;
    for (const b of this._candidates(origin.x, origin.z, pad)) {
      if (ig && ig.includes(b.tag)) continue;
      const t = slab(origin, d, b);
      if (t >= 0 && t < best) { best = t; hitTag = b.tag; }
    }
    if (hitTag !== null) {
      r.hit = true; r.distance = best; r.tag = hitTag;
      r.point.set(origin.x + d.x * best, origin.y + d.y * best, origin.z + d.z * best);
    }
    return r;
  }

  groundCheck(pos, radius, maxDist) {
    const g = this._gnd;
    g.hit = false;
    let bestY = -Infinity, bestTag = 'ground';
    const r = radius || 0;
    for (const b of this._candidates(pos.x, pos.z, r + CELL)) {
      if (!SUPPORT_TAGS.has(b.tag)) continue;
      if (pos.x < b.min.x - r || pos.x > b.max.x + r) continue;
      if (pos.z < b.min.z - r || pos.z > b.max.z + r) continue;
      if (b.max.y > pos.y + 1e-3) continue;
      if (pos.y - b.max.y > maxDist) continue;
      if (b.max.y > bestY) { bestY = b.max.y; bestTag = b.tag; }
    }
    if (bestY > -Infinity) { g.hit = true; g.y = bestY; g.tag = bestTag; g.distance = pos.y - bestY; }
    return g;
  }
}

/** Highest support at (x, z) at or below `yMax`, probed with the guard's own foot radius. */
function supportAt(x, z, yMax, footR, extra = []) {
  let hi = null;
  const list = extra.length ? near(x, z, footR + CELL).concat(extra) : near(x, z, footR + CELL);
  for (const b of list) {
    if (!SUPPORT_TAGS.has(b.tag)) continue;
    if (x < b.min.x - footR || x > b.max.x + footR) continue;
    if (z < b.min.z - footR || z > b.max.z + footR) continue;
    if (b.max.y > yMax) continue;
    if (hi === null || b.max.y > hi) hi = b.max.y;
  }
  return hi;
}

/** Is (x, y, z) inside a wall or a column? Returns the tag, or null. */
function blockedAt(x, y, z, extra = []) {
  const list = extra.length ? near(x, z, CELL).concat(extra) : near(x, z, CELL);
  for (const b of list) {
    if (!BLOCK_TAGS.has(b.tag)) continue;
    if (x <= b.min.x || x >= b.max.x || z <= b.min.z || z >= b.max.z) continue;
    if (y <= b.min.y || y >= b.max.y) continue;
    return b.tag;
  }
  return null;
}

/** Horizontal distance from (x, z) to the nearest wall/pole that spans height `y`. */
function clearanceAt(x, y, z, extra = []) {
  let best = Infinity;
  const list = extra.length ? near(x, z, 6 + CELL).concat(extra) : near(x, z, 6 + CELL);
  for (const b of list) {
    if (!BLOCK_TAGS.has(b.tag)) continue;
    if (y < b.min.y || y > b.max.y) continue;
    const dx = Math.max(b.min.x - x, 0, x - b.max.x);
    const dz = Math.max(b.min.z - z, 0, z - b.max.z);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

/* ====================================================================== */
/* engine stub + driver                                                    */
/* ====================================================================== */

class StubEngine {
  constructor(collision, tod = 0.06) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.quality = 'med';
    this.warnings = [];
    this.debug = { timeOfDay: tod };
    this.time = 0;
    this.alerts = [];
    this._mods = new Map();
    this._ev = new Map();
    // Parked 400 m away: nothing in this file wants a guard reacting to a phantom player
    // unless it puts one there deliberately.
    this.movement = {
      position: new THREE.Vector3(0, 0, 400), velocity: new THREE.Vector3(),
      speed: 0, maxSpeed: PLAYER.runSpeed, grounded: true, stateName: 'idle',
    };
    this._mods.set('collision', collision);
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
    if (e === 'guardAlert') this.alerts.push({ id: p?.id, state: p?.state, prev: p?.prev });
    for (const fn of this._ev.get(e) || []) fn(p);
  }
  registerCollider() { return {}; }
}

async function makeGarrison({ extra = [], tod = 0.06 } = {}) {
  const collision = new LevelCollision(extra);
  const engine = new StubEngine(collision, tod);
  const guards = new Guards(engine);
  await guards.init();
  return { guards, engine, collision };
}

function step(guards, engine, seconds, dt = 1 / 30, onFrame = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    engine.time += dt;
    guards.update(dt, engine.time);
    if (onFrame) onFrame(engine.time, i);
  }
  return n;
}

const RAD = { temple: 0.42, heavy: 0.56, scarab: 0.26 };
const widestOn = (routeName) => Math.max(0.26,
  ...ROSTER.filter((e) => e.route === routeName).map((e) => RAD[e.type] || 0.42));

const ROUTE_NAMES = Object.keys(ROUTES);
const SEED = 0x9a2d10;

/* Built once and shared: `buildRoutes` is deterministic and the geometry tests do not mutate. */
const ROUTE_OBJS = buildRoutes(SEED);

/** Sample a route's spline at N arc-uniform points, with the level's answer at each. */
function sampleRoute(name, N = 400, extra = []) {
  const route = ROUTE_OBJS[name];
  const baseY = ROUTES[name].baseY ?? 0;
  const footR = widestOn(name) * 0.7;
  const yMax = baseY + 2.5;
  const p = new THREE.Vector3();
  const rows = [];
  for (let i = 0; i < N; i++) {
    route.at(i / N, p);
    const s = supportAt(p.x, p.z, yMax, footR, extra);
    const y = (s === null ? baseY : s) + 1.15;
    rows.push({ x: p.x, z: p.z, support: s, chestY: y });
  }
  return { rows, baseY, radius: widestOn(name) };
}

console.log(`\n[patrol] shipped level built in ${BUILD_MS} ms — ${BOXES.length} collision AABBs, `
  + `${ROUTE_NAMES.length} routes, ${ROSTER.length} guards\n`);

/* ====================================================================== */
/* C1 — clearance                                                          */
/* ====================================================================== */

test('C1: every route clears the masonry by the widest body that walks it, plus 20 cm', () => {
  let inspected = 0;
  const bad = [];
  const report = [];
  for (const name of ROUTE_NAMES) {
    const { rows, radius } = sampleRoute(name);
    const need = radius + 0.20;
    let worst = Infinity, worstAt = null;
    for (const r of rows) {
      inspected++;
      const c = clearanceAt(r.x, r.chestY, r.z);
      if (c < worst) { worst = c; worstAt = r; }
      if (c <= need) bad.push(`${name} @ (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) clear ${c.toFixed(2)} m, needs > ${need.toFixed(2)}`);
    }
    report.push(`  ${name.padEnd(18)} radius ${radius.toFixed(2)}  tightest ${worst === Infinity ? '  none' : worst.toFixed(2)} m`
      + (worstAt && worst < 9 ? `  at (${worstAt.x.toFixed(1)}, ${worstAt.z.toFixed(1)})` : ''));
  }
  console.log('[C1] clearance to the nearest wall or column, per route:');
  for (const line of report) console.log(line);
  assert.ok(inspected >= ROUTE_NAMES.length * 400, `inspected only ${inspected} samples`);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} clearance violations`);
});

test('CAL-1: the clearance test detects a route threaded past a hall column', () => {
  // The east aisle column at x 15.1‥17.9, z −27.4‥−24.6. Run the line 0.1 m off its face.
  const grazing = new Route('cal1', {
    closed: false, baseY: 0, points: [[15.0, -34.0], [15.0, -26.0], [15.0, -18.0]],
  }, 1);
  const p = new THREE.Vector3();
  let inspected = 0, violations = 0, tightest = Infinity;
  for (let i = 0; i < 400; i++) {
    grazing.at(i / 400, p);
    inspected++;
    const c = clearanceAt(p.x, 1.15, p.z);
    tightest = Math.min(tightest, c);
    if (c <= RAD.temple + 0.20) violations++;
  }
  console.log(`[CAL-1] grazing route: tightest ${tightest.toFixed(3)} m, ${violations}/${inspected} samples violate`);
  assert.ok(inspected === 400, `inspected ${inspected}`);
  assert.ok(violations > 0, 'CAL-1 DID NOT FIRE — the clearance test is blind, every C1 pass is void');
});

/* ====================================================================== */
/* C2 — geometry (PREREG-routeaudit T1–T4, verbatim)                       */
/* ====================================================================== */

const STEP_UP = GUARD_TUNE.stepUp;
const STEP_DOWN = GUARD_TUNE.stepDown;

function geometryVerdict(name, extra = []) {
  const { rows, baseY } = sampleRoute(name, 400, extra);
  const wall = rows.filter((r) => blockedAt(r.x, r.chestY, r.z, extra));
  const unsupported = rows.filter((r) => r.support === null);
  const supported = rows.filter((r) => r.support !== null);
  const mismatch = supported.filter((r) => Math.abs(r.support - baseY) > STEP_DOWN);
  const cliffs = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.support === null || b.support === null) continue;
    const d = b.support - a.support;
    if (d > STEP_UP || d < -STEP_DOWN) cliffs.push({ from: a.support, to: b.support, x: b.x, z: b.z });
  }
  return {
    inspected: rows.length, wall, unsupported, supported, mismatch, cliffs,
    T1: wall.length >= 1,
    T2: cliffs.length >= 1,
    T3: unsupported.length / rows.length > 0.05,
    T4: supported.length > 0 && mismatch.length / supported.length > 0.05,
  };
}

test('C2: every route lies on a floor the level actually has, with no step a guard refuses', () => {
  let inspected = 0;
  const broken = [];
  console.log('[C2] per route: wall samples / unsupported / floor-mismatch / cliff steps');
  for (const name of ROUTE_NAMES) {
    const v = geometryVerdict(name);
    inspected += v.inspected;
    const flags = [v.T1 && 'T1-WALL', v.T2 && 'T2-CLIFF', v.T3 && 'T3-VOID', v.T4 && 'T4-MISMATCH'].filter(Boolean);
    console.log(`  ${name.padEnd(18)} ${String(v.wall.length).padStart(4)} `
      + `${String(v.unsupported.length).padStart(5)} ${String(v.mismatch.length).padStart(6)} `
      + `${String(v.cliffs.length).padStart(6)}   ${flags.length ? flags.join(' ') : 'CLEAN'}`);
    if (flags.length) {
      const where = v.wall[0] || v.cliffs[0] || v.unsupported[0] || v.mismatch[0];
      broken.push(`${name}: ${flags.join(' ')} first at (${where.x.toFixed(1)}, ${where.z.toFixed(1)})`);
    }
  }
  assert.ok(inspected === ROUTE_NAMES.length * 400, `inspected ${inspected} samples`);
  assert.deepEqual(broken, [], 'routes that a guard cannot physically walk');
});

/**
 * The first version of this arm ran the line down x = 0 through z −60‥−44 and **did not fire**.
 * That was correct of it: x = 0 at chest height is the inner pylon's *gateway*, which is open,
 * and the mass above it starts at y = 8.4. The arm was mis-specified, it is recorded here as
 * having failed, and it is replaced with a line through the pylon's west tower — `wall
 * x −11.0‥−3.5, y 0‥8.40, z −55.5‥−48.5` — which is solid at the height a guard walks. The
 * threshold it calibrates (T1: ≥ 1 sample inside stone) is untouched.
 */
test('CAL-2a: the geometry test detects a route driven through the inner pylon tower', () => {
  const through = new Route('cal2a', { closed: false, baseY: 0, points: [[-7, -58], [-7, -52], [-7, -46]] }, 1);
  const p = new THREE.Vector3();
  let inspected = 0, walls = 0;
  for (let i = 0; i < 400; i++) {
    through.at(i / 400, p);
    inspected++;
    if (blockedAt(p.x, 1.15, p.z)) walls++;
  }
  console.log(`[CAL-2a] pylon-tower route: ${walls}/${inspected} samples inside stone`);
  assert.ok(inspected === 400, `inspected ${inspected}`);
  assert.ok(walls > 0, 'CAL-2a DID NOT FIRE — T1 is blind and every "no wall hit" is void');
});

test('CAL-2b: the geometry test detects a step past stepUp, and unsupported ground', () => {
  // The courtyard terrace: paving at y = 0 to stage 1 at y = 2.0, a 2 m riser.
  const overEdge = new Route('cal2b', { closed: false, baseY: 0, points: [[0, -2], [0, 6], [0, 12]] }, 1);
  const p = new THREE.Vector3();
  let inspected = 0, cliffs = 0, prev = null;
  for (let i = 0; i < 400; i++) {
    overEdge.at(i / 400, p);
    inspected++;
    const s = supportAt(p.x, p.z, 2.5, 0.29);
    if (prev !== null && s !== null && (s - prev > STEP_UP || s - prev < -STEP_DOWN)) cliffs++;
    prev = s;
  }
  // And the desert, where there is no collision at all.
  let voidSamples = 0;
  for (let i = 0; i < 100; i++) voidSamples += supportAt(200 + i, 200, 2.5, 0.29) === null ? 1 : 0;
  console.log(`[CAL-2b] terrace edge: ${cliffs} cliff steps in ${inspected} samples; desert: ${voidSamples}/100 unsupported`);
  assert.ok(inspected === 400, `inspected ${inspected}`);
  assert.ok(cliffs > 0, 'CAL-2b DID NOT FIRE — T2 is blind and every "no cliff" is void');
  assert.ok(voidSamples === 100, `CAL-2b DID NOT FIRE — T3 is blind (${voidSamples}/100 off-mesh samples read as supported)`);
});

/* ====================================================================== */
/* C3 — no stall: the real garrison walks the real temple                  */
/* ====================================================================== */

const SOAK_SECONDS = 180;

/** Run the garrison and record, per guard, distance covered and dwell stops visited. */
async function soak(seconds, opts = {}) {
  const { guards, engine, collision } = await makeGarrison(opts);
  const trace = guards.list.map((g) => ({
    id: g.id, route: g.route.name, type: g.type,
    dist: 0, last: g.position.clone(), stops: new Set(), maxOff: 0, laps: 0,
  }));
  const frames = step(guards, engine, seconds, 1 / 30, () => {
    for (let i = 0; i < guards.list.length; i++) {
      const g = guards.list[i], t = trace[i];
      t.dist += g.position.distanceTo(t.last);
      t.last.copy(g.position);
      t.maxOff = Math.max(t.maxOff, g._offRoute);
      if (g.dwell > 0) t.stops.add(Math.round(g.u * 200));
    }
  });
  for (let i = 0; i < guards.list.length; i++) trace[i].laps = guards.list[i].laps;
  return { guards, engine, collision, trace, frames };
}

test('C3: 180 s of patrol in the real temple, and nobody is stuck', async () => {
  const { guards, engine, trace, frames } = await soak(SOAK_SECONDS);
  assert.ok(frames > 5000, `only ${frames} frames stepped`);
  assert.ok(trace.length === ROSTER.length, `traced ${trace.length} guards`);

  console.log(`[C3] ${frames} frames — per guard: distance / route length / dwell stops visited`);
  const stuck = [];
  for (let i = 0; i < trace.length; i++) {
    const t = trace[i];
    const g = guards.list[i];
    const len = g.route.length;
    // Expected ground covered if he never stopped, discounted for dwells and the 0.55 floor.
    const cruise = 1.55 * (ROSTER[i].speed ?? 1) * (t.type === 'heavy' ? 0.74 : t.type === 'scarab' ? 1.25 : 1);
    const want = 0.55 * cruise * SOAK_SECONDS;
    const ok = t.dist >= want && t.stops.size >= 3;
    console.log(`  ${t.id} ${t.route.padEnd(18)} ${t.dist.toFixed(1).padStart(7)} m / route ${len.toFixed(1).padStart(6)} m`
      + `  stops ${String(t.stops.size).padStart(2)}  laps ${t.laps}  maxOff ${t.maxOff.toFixed(2)} m  ${ok ? '' : '  <-- STALLED'}`);
    if (!ok) stuck.push(`${t.id} (${t.route}): ${t.dist.toFixed(1)} m < ${want.toFixed(1)} m required, ${t.stops.size} dwell stops`);
  }
  assert.equal(engine.warnings.length, 0, engine.warnings.join(' | '));
  assert.deepEqual(stuck, [], 'guards that could not complete their beat');
});

test('CAL-2c: the stall test detects a guard pinned by a wall dropped across his beat', async () => {
  /* A slab across both of hall_weave's inner aisles, at z = −31 where the route's long legs
     run. Both, because the guard starts mid-route and a fence on the leg he happens to be
     walking away from tests nothing — the first version of this arm fenced only the west aisle
     and reported an identical distance with and without, which is a calibration arm quietly
     measuring nothing. */
  const fence = [
    { tag: 'wall', min: new THREE.Vector3(-16.5, 0, -32.0), max: new THREE.Vector3(-8.5, 4, -30.0) },
    { tag: 'wall', min: new THREE.Vector3(8.5, 0, -32.0), max: new THREE.Vector3(16.5, 4, -30.0) },
  ];
  const { trace } = await soak(60, { extra: fence });
  const hall = trace.filter((t) => t.route === 'hall_weave');
  assert.ok(hall.length >= 1, `expected at least one hall_weave guard, traced ${hall.length}`);
  const free = await soak(60);
  const freeHall = free.trace.filter((t) => t.route === 'hall_weave');
  const pinnedDist = Math.min(...hall.map((t) => t.dist));
  const freeDist = Math.min(...freeHall.map((t) => t.dist));
  console.log(`[CAL-2c] hall guards with a fence: ${hall.map((t) => t.dist.toFixed(1)).join(', ')} m; `
    + `without: ${freeHall.map((t) => t.dist.toFixed(1)).join(', ')} m`);
  assert.ok(freeDist > 0, 'the unobstructed control covered no ground — the instrument is dead');
  assert.ok(pinnedDist < freeDist * 0.75,
    `CAL-2c DID NOT FIRE — a wall across the beat cost only ${(100 - 100 * pinnedDist / freeDist).toFixed(0)} % of the distance; `
    + 'the stall test cannot see a pinned guard and every C3 pass is void');
});

/* ====================================================================== */
/* C4 — the timing gap                                                     */
/* ====================================================================== */

/**
 * Chokepoints named in `PREREG-patrolgap.md` before any of this was measured: the points the
 * traversal line in `EgyptLevel.js`'s own header passes through.
 */
const CHOKEPOINTS = [
  ['spawn', 0, 0, 30],
  ['terrace-foot', 0, 0, 20],
  ['obelisk-base', 0, 2, 11],
  ['court-west', -18, 0, 8],
  ['court-east', 18, 0, 8],
  ['hall-door', 0, 0, -17],
  ['hall-nave-mid', 0, 0, -34],
  ['hall-west-aisle', -20, 0, -34],
  ['inner-gate', 0, 0, -52],
  ['crypt-nave', 0, -12, -66],
];

const GAP_FLOOR = 6.0;          // seconds — derived in the seal from 5.5 m ÷ sneakSpeed × 1.5
const COVER_FLOOR = 0.08;       // fraction of the window a chokepoint must be watched at all
const WINDOW = 240;             // seconds
const PROBE_DT = 0.1;

/** Is `p` inside guard `g`'s bright core right now, line of sight included? */
const _eye = new THREE.Vector3(), _to = new THREE.Vector3(), _fwd = new THREE.Vector3();
function seesPoint(g, p, collision) {
  const cfg = g.vision;
  g._eyePosition(_eye);
  _to.subVectors(p, _eye);
  const dist = _to.length();
  if (dist > cfg.range || dist < 1e-4) return false;
  _fwd.copy(g.forward).setY(0).normalize();
  const flat = _to.clone().setY(0);
  if (flat.lengthSq() < 1e-6) return false;
  flat.normalize();
  const ang = Math.acos(THREE.MathUtils.clamp(_fwd.dot(flat), -1, 1));
  if (ang > cfg.halfAngle) return false;
  const hit = collision.raycast(_eye, _to, dist, { ignoreTags: ['hazard', 'water', 'rail', 'hook', 'spire', 'vent'] });
  if (hit?.hit && hit.distance < dist - 0.45) return false;
  return true;
}

/** Coverage timeline for a set of probes over `seconds` of patrol. */
async function coverage(probes, seconds, opts = {}) {
  const { guards, engine, collision } = await makeGarrison(opts);
  const only = opts.freeze ? opts.freeze(guards) : null;
  const pts = probes.map(([, x, y, z]) => new THREE.Vector3(x, y + 1.0, z));
  const seen = probes.map(() => []);
  const every = Math.max(1, Math.round(PROBE_DT / (1 / 30)));
  let samples = 0;
  step(guards, engine, seconds, 1 / 30, (t, i) => {
    if (i % every) return;
    samples++;
    for (let k = 0; k < pts.length; k++) {
      let hit = false;
      for (const g of guards.list) {
        // Calibration arms restrict to the one guard they pinned; otherwise the other ten are
        // still patrolling and their genuine sightings contaminate the arm.
        if (only && g !== only) continue;
        if (seesPoint(g, pts[k], collision)) { hit = true; break; }
      }
      seen[k].push(hit);
    }
  });
  return probes.map((pr, k) => {
    const tl = seen[k];
    let covered = 0, run = 0, longest = 0;
    for (const v of tl) {
      if (v) { covered++; run = 0; } else { run++; longest = Math.max(longest, run); }
    }
    return {
      name: pr[0], samples: tl.length,
      coverFrac: tl.length ? covered / tl.length : 0,
      longestGap: longest * PROBE_DT,
    };
  });
}

test('C4: every named chokepoint is watched, and every one has a learnable window', async () => {
  const rows = await coverage(CHOKEPOINTS, WINDOW);
  console.log(`[C4] ${WINDOW} s of patrol, ${rows[0].samples} probes each — coverage / longest safe window`);
  let inspected = 0;
  const tooTight = [], unguarded = [];
  for (const r of rows) {
    inspected += r.samples;
    const flag = r.coverFrac < COVER_FLOOR ? 'UNGUARDED'
      : r.longestGap < GAP_FLOOR ? 'NO WINDOW' : '';
    console.log(`  ${r.name.padEnd(16)} covered ${(100 * r.coverFrac).toFixed(1).padStart(5)} %   `
      + `longest gap ${r.longestGap.toFixed(1).padStart(6)} s   ${flag}`);
    if (r.coverFrac < COVER_FLOOR) unguarded.push(r.name);
    else if (r.longestGap < GAP_FLOOR) tooTight.push(`${r.name}: ${r.longestGap.toFixed(1)} s < ${GAP_FLOOR} s`);
  }
  assert.ok(inspected > CHOKEPOINTS.length * 2000, `inspected only ${inspected} probe samples`);
  assert.deepEqual(tooTight, [], 'chokepoints with no window a player could use');
  // Unguarded points are a reported design gap, not a failure of the routes — but at least
  // half the named chokepoints must carry real pressure or this is not a stealth level.
  const guarded = rows.length - unguarded.length;
  console.log(`[C4] ${guarded}/${rows.length} chokepoints carry guard pressure; unguarded: ${unguarded.join(', ') || 'none'}`);
  assert.ok(guarded >= Math.ceil(rows.length / 2),
    `only ${guarded} of ${rows.length} chokepoints are watched at all — the garrison is not covering the traversal line`);
});

test('CAL-3/4: the coverage instrument reads 0 % off in the desert, high point-blank, and 0 % through a wall', async () => {
  // Low arm: nothing within 300 m.
  const low = await coverage([['desert', 0, 0, 300]], 20);
  // High arm: pin a guard and stand a probe 2.5 m down his sight line.
  const pinAt = (guards) => {
    const g = guards.list[0];
    g.update = () => {};                               // frozen mid-beat, facing +Z
    g.position.set(0, 0, -6);
    g.yaw = 0; g.forward.set(0, 0, 1);
    g.root.position.copy(g.position);
    g.root.rotation.set(0, 0, 0);
    g.root.updateMatrixWorld(true);
    return g;
  };
  const high = await coverage([['point-blank', 0, 0, -3.5]], 20, { freeze: pinAt });
  // LOS arm: same geometry, with a slab between them.
  const slabBox = [{ tag: 'wall', min: new THREE.Vector3(-3, 0, -5.2), max: new THREE.Vector3(3, 4, -4.6) }];
  const occl = await coverage([['point-blank-occluded', 0, 0, -3.5]], 20, { freeze: pinAt, extra: slabBox });

  console.log(`[CAL-3] desert ${(100 * low[0].coverFrac).toFixed(1)} % (gap ${low[0].longestGap.toFixed(1)} s) | `
    + `point-blank ${(100 * high[0].coverFrac).toFixed(1)} % (gap ${high[0].longestGap.toFixed(1)} s) | `
    + `occluded ${(100 * occl[0].coverFrac).toFixed(1)} %`);
  assert.ok(low[0].samples > 100 && high[0].samples > 100 && occl[0].samples > 100,
    'the calibration arms inspected almost nothing');
  assert.equal(low[0].coverFrac, 0, 'CAL-3 low arm DID NOT FIRE — the desert reads as covered');
  assert.ok(high[0].coverFrac > 0.9,
    `CAL-3 high arm DID NOT FIRE — a probe 2.5 m down a frozen guard's sight line read ${(100 * high[0].coverFrac).toFixed(1)} %; `
    + 'the instrument cannot see a guard looking straight at something and every C4 number is fiction');
  assert.equal(occl[0].coverFrac, 0,
    'CAL-4 DID NOT FIRE — a wall between guard and probe changed nothing, so coverage is being scored through stone');
});

/* ====================================================================== */
/* C5 — determinism                                                        */
/* ====================================================================== */

test('C5: the same seed rebuilds the identical patrol', async () => {
  const a = await makeGarrison();
  const b = await makeGarrison();
  step(a.guards, a.engine, 60);
  step(b.guards, b.engine, 60);
  let inspected = 0;
  const drift = [];
  for (let i = 0; i < a.guards.list.length; i++) {
    inspected++;
    const p = a.guards.list[i].position, q = b.guards.list[i].position;
    const d = p.distanceTo(q);
    if (d > 1e-9) drift.push(`${a.guards.list[i].id}: ${d.toExponential(2)} m apart after 60 s`);
  }
  console.log(`[C5] ${inspected} guards compared after 60 s, max drift ${drift.length ? 'NONZERO' : '0'}`);
  assert.ok(inspected === ROSTER.length, `compared ${inspected} guards`);
  assert.deepEqual(drift, []);
});

/* ====================================================================== */
/* the detection model — arithmetic, not pixels                            */
/* ====================================================================== */

/**
 * `Senses.evaluate` reads `moving` as a *normalised* speed — the player's speed over his own
 * maximum — so these are the game's own numbers, not invented ones.
 */
const MOVE = {
  still: 0,
  sneak: PLAYER.sneakSpeed / PLAYER.runSpeed,
  walk: PLAYER.walkSpeed / PLAYER.runSpeed,
  run: 1,
};

/** Drive a bare `Senses` with a fixed stimulus. Returns the meter timeline. */
function meter(over, dt, mut = {}) {
  const s = new Senses('temple', 7);
  const p = {
    eye: new THREE.Vector3(0, 1.66, 0),
    forward: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(0, 0, 6),
    targetTop: 0.95, collision: null, moving: MOVE.walk, sneaking: false, crouching: false,
    airborne: false, light: 0.3, alerted: false, dt,
    ...mut,
  };
  const out = [];
  for (let t = 0; t < over; t += dt) { s.evaluate(p); out.push(s.suspicion); }
  return { s, out };
}

/**
 * ── A criterion this test registered and then had to void (§141.1) ─────────────────────────
 *
 * The first version asserted `1.0 s < tChase < 3.0 s`, and it failed at 0.53 s. Both halves of
 * that were wrong and neither failure was the game's:
 *
 *   - the stimulus was labelled "walking" and fed `moving: 1`, which is *sprinting* — `moving`
 *     is normalised against `runSpeed`, so the number under test was never the walk case;
 *   - the 1.0 s floor was derived from a sentence in `Patrol.js`'s own docstring claiming the
 *     reference condition "fills the meter in roughly 1.4 s". That sentence had never been
 *     measured. Deriving a threshold from an unverified comment is deriving it from nothing.
 *
 * **That bound is VOID and is not re-derived to fit the number that came back.** What replaces
 * it is the weakest criterion that still catches the failure this test exists for — detection
 * that is effectively instantaneous, which is the single thing that makes a stealth game feel
 * unfair — and it is derived from the guard's own reaction window rather than from prose: the
 * meter must take longer to fill than `DETECT.reactDelay`, so the player always has at least
 * that window before anything happens, and it must not be so slow that a guard is no threat.
 * The *relative* assertions in the next test are the ones that encode the design, and all of
 * them passed on the first run, unchanged.
 *
 * The docstring has been corrected to the measured value.
 */
test('detection is a meter that fills monotonically and is never instant', () => {
  const dt = 1 / 60;
  const { out } = meter(8, dt);
  let inspected = 0, decreases = 0;
  for (let i = 1; i < out.length; i++) { inspected++; if (out[i] < out[i - 1] - 1e-12) decreases++; }
  const tChase = out.findIndex((v) => v >= DETECT.chase) * dt;
  const tSusp = out.findIndex((v) => v >= DETECT.suspicious) * dt;
  const runT = meter(8, dt, { moving: MOVE.run }).out.findIndex((v) => v >= DETECT.chase) * dt;
  console.log(`[detect] 6 m, dead centre, moonlit — walking: suspicious ${tSusp.toFixed(2)} s, `
    + `full ${tChase.toFixed(2)} s (+${DETECT.reactDelay} s react = ${(tChase + DETECT.reactDelay).toFixed(2)} s to chase); `
    + `running: full ${runT.toFixed(2)} s`);
  assert.ok(inspected > 400, `inspected ${inspected} steps`);
  assert.equal(decreases, 0, 'the meter went down while the player was in plain sight');
  assert.ok(tSusp > DETECT.reactDelay * 0.5,
    `suspicion crossed in ${tSusp.toFixed(3)} s — that is effectively instant detection`);
  assert.ok(tChase > DETECT.reactDelay,
    `the meter filled in ${tChase.toFixed(2)} s, inside the guard's own ${DETECT.reactDelay} s reaction window — `
    + 'the player has no frame in which to react and failure reads as arbitrary');
  assert.ok(tChase < 5.0, `full detection took ${tChase.toFixed(2)} s — a guard staring at you is not a threat`);
  assert.ok(runT < tChase, 'running is not more dangerous than walking');
});

test('sneaking, distance and darkness each buy the player measurable time', () => {
  const dt = 1 / 60;
  const cases = {
    walking: {},
    running: { moving: MOVE.run },
    sneaking: { moving: MOVE.sneak, sneaking: true },
    crouching: { crouching: true },
    'standing still': { moving: MOVE.still },
    'far (15 m)': { target: new THREE.Vector3(0, 0, 15) },
    'daylight': { light: 1 },
    'edge of cone': { target: new THREE.Vector3(3.6, 0, 6) },
  };
  const times = {};
  let inspected = 0;
  for (const k in cases) {
    const { out } = meter(60, dt, cases[k]);
    inspected++;
    const i = out.findIndex((v) => v >= DETECT.chase);
    times[k] = i < 0 ? Infinity : i * dt;
    console.log(`[detect] ${k.padEnd(16)} time to full detection: ${times[k] === Infinity ? 'never' : times[k].toFixed(2) + ' s'}`);
  }
  assert.ok(inspected === Object.keys(cases).length, `ran ${inspected} cases`);
  assert.ok(times.sneaking > times.walking * 2, 'sneaking barely helps');
  assert.ok(times.crouching > times.walking, 'crouching does not help');
  assert.ok(times['standing still'] > times.walking, 'standing still does not help');
  assert.ok(times['far (15 m)'] > times.walking, 'distance does not help');
  assert.ok(times.daylight < times.walking, 'daylight is not worse than moonlight');
  assert.ok(times['edge of cone'] > times.walking, 'the cone edge is as dangerous as its centre');
});

test('the meter drains back to zero after the grace period, so there is a way down', () => {
  const dt = 1 / 60;
  const { s } = meter(2.0, dt);
  const peak = s.suspicion;
  assert.ok(peak > DETECT.suspicious, `never got suspicious: ${peak}`);
  const gone = { target: new THREE.Vector3(0, 0, 400) };
  const p = {
    eye: new THREE.Vector3(0, 1.66, 0), forward: new THREE.Vector3(0, 0, 1),
    targetTop: 0.95, collision: null, moving: 0, sneaking: false, crouching: false,
    airborne: false, light: 0.3, alerted: false, dt, ...gone,
  };
  let t = 0, tDrainStart = -1, inspected = 0;
  const before = s.suspicion;
  while (s.suspicion > 0 && t < 30) {
    s.evaluate(p); t += dt; inspected++;
    if (tDrainStart < 0 && s.suspicion < before - 1e-9) tDrainStart = t;
  }
  console.log(`[detect] peak ${peak.toFixed(2)} → grace ${tDrainStart.toFixed(2)} s → empty at ${t.toFixed(2)} s`);
  assert.ok(inspected > 100, `inspected ${inspected} steps`);
  assert.ok(tDrainStart >= DETECT.drainDelay - dt * 2, `drain began after ${tDrainStart.toFixed(2)} s, before the ${DETECT.drainDelay} s grace`);
  assert.equal(s.suspicion, 0, 'the meter never emptied — there is no way back to patrol');
  assert.ok(t < 20, `it took ${t.toFixed(1)} s to forget, which is longer than any player will wait`);
});

test('hearing fills toward searching but can never reach chase on its own', () => {
  const dt = 1 / 60;
  const s = new Senses('temple', 3);
  const p = {
    eye: new THREE.Vector3(0, 1.66, 0), forward: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(0, 0, -4),                 // directly behind him
    targetTop: 0.95, collision: null, moving: 1, sneaking: false, crouching: false,
    airborne: false, light: 0.3, alerted: false, dt,
  };
  let inspected = 0;
  for (let t = 0; t < 60; t += dt) { s.evaluate(p); inspected++; }
  console.log(`[detect] 60 s of running behind his back: meter rests at ${s.suspicion.toFixed(3)} (cap ${DETECT.hearCap})`);
  assert.ok(inspected > 3000, `inspected ${inspected} steps`);
  assert.ok(s.suspicion > DETECT.suspicious, 'he never heard a thing');
  assert.ok(s.suspicion < DETECT.chase, 'noise alone escalated to full detection');
  assert.ok(s.suspicion <= DETECT.hearCap + 0.02, `hearing overran its cap: ${s.suspicion}`);
});

/* ====================================================================== */
/* legibility: the state has to be readable from outside                   */
/* ====================================================================== */

test('the four alert bands are ordered and separated, and hysteresis stops them chattering', () => {
  const bands = [0, DETECT.suspicious, DETECT.searching, DETECT.chase];
  let inspected = 0;
  for (let i = 1; i < bands.length; i++) {
    inspected++;
    assert.ok(bands[i] > bands[i - 1], 'thresholds are not ordered');
    assert.ok(bands[i] - bands[i - 1] > 0.2, `bands ${i - 1}/${i} are ${(bands[i] - bands[i - 1]).toFixed(2)} apart — too close to read`);
  }
  assert.ok(inspected === 3, `inspected ${inspected} band gaps`);

  // Chatter: hover the meter exactly on a threshold and jitter it by float noise.
  assert.ok(DETECT.hysteresis > 0, 'no hysteresis band declared');
  let flips = 0, checked = 0;
  let state = STATE.PATROL;
  for (let i = 0; i < 4000; i++) {
    const s = DETECT.suspicious + (i % 2 ? 1e-4 : -1e-4);
    const next = stateForSuspicion(s, state);
    checked++;
    if (next !== state) flips++;
    state = next;
  }
  console.log(`[legibility] 4000 frames hovering on the suspicious threshold: ${flips} state flips`);
  assert.ok(checked === 4000, `checked ${checked}`);
  assert.ok(flips <= 1, `the alert state flipped ${flips} times on a meter that never moved 0.0002 — `
    + 'a guard that chatters restarts his reaction animation every frame and reads as broken');
});

test('the cone colour is a three-stop ramp keyed to the thresholds, not a smooth slide', () => {
  const probes = [0, 0.15, DETECT.suspicious, 0.5, DETECT.searching, 0.9, DETECT.chase, 1.4];
  const stops = probes.map((s) => coneColourStop(s));
  let inspected = 0;
  for (let i = 1; i < stops.length; i++) { inspected++; assert.ok(stops[i] >= stops[i - 1], 'the ramp goes backwards'); }
  console.log('[legibility] suspicion → colour stop: '
    + probes.map((p, i) => `${p.toFixed(2)}→${stops[i].toFixed(2)}`).join('  '));
  assert.ok(inspected === probes.length - 1, `inspected ${inspected} pairs`);
  // Patrol must be unambiguously stop 0, and full detection unambiguously stop 2.
  assert.equal(coneColourStop(0), 0, 'a guard who has noticed nothing is not showing the patrol colour');
  assert.ok(coneColourStop(DETECT.chase) >= 1.999, 'a chasing guard is not showing the alert colour');
  // The middle band must actually be reached, or the amber stop is dead code.
  const mid = coneColourStop((DETECT.suspicious + DETECT.searching) / 2);
  assert.ok(mid > 0.35 && mid < 1.65, `the suspicious band maps to ${mid.toFixed(2)} — the warn colour is never shown`);
});

test('a suspicious guard walks over to look, and gives up if he finds nothing', async () => {
  const { guards, engine } = await makeGarrison();
  const g = guards.list[0];
  // Park the player where guard #0 can be made to notice, then take him away.
  const spot = g.position.clone().addScaledVector(g.forward, 7);
  g.senses.suspicion = DETECT.suspicious + 0.05;
  g.senses.lastSeen.copy(spot);
  g.senses.lastSeenValid = true;
  g._setState(STATE.SUSPICIOUS);
  const start = g.position.clone();
  let closest = Infinity, inspected = 0, sawSuspicious = false;
  step(guards, engine, 25, 1 / 30, () => {
    inspected++;
    if (g.state === STATE.SUSPICIOUS) sawSuspicious = true;
    closest = Math.min(closest, g.position.distanceTo(spot));
  });
  const moved = start.distanceTo(g.position);
  console.log(`[legibility] suspicious guard: closed to ${closest.toFixed(2)} m of the noise `
    + `(started ${start.distanceTo(spot).toFixed(2)} m away), moved ${moved.toFixed(2)} m, ended in "${g.state}"`);
  assert.ok(inspected > 500, `inspected ${inspected} frames`);
  assert.ok(sawSuspicious, 'never entered the suspicious state at all');
  assert.ok(closest < start.distanceTo(spot) - 1.0, 'a suspicious guard did not move toward what he noticed — '
    + 'the player gets no "he is coming to look" beat and no reason to move');
  assert.equal(g.state, STATE.PATROL, `he never stood down — still "${g.state}" after 25 s`);
});

test('the full ladder runs up and back down: patrol → suspicious → searching → chase → patrol', async () => {
  const { guards, engine } = await makeGarrison();
  const g = guards.list[0];
  const seen = [];
  engine.on('guardAlert', (p) => { if (p.id === g.id) seen.push(p.state); });

  const player = engine.movement;
  // Stand him in the bright core, 5 m out, walking, in daylight.
  const put = () => {
    player.position.copy(g.position).addScaledVector(g.forward, 5).setY(g.position.y);
    player.speed = PLAYER.walkSpeed;
    player.stateName = 'walk';
  };
  let inspected = 0;
  step(guards, engine, 6, 1 / 30, () => { inspected++; put(); });
  player.position.set(0, 0, 400);
  player.speed = 0;
  step(guards, engine, 40, 1 / 30, () => { inspected++; });

  const order = seen.filter((s, i) => s !== seen[i - 1]);
  console.log(`[legibility] state ladder: ${order.join(' → ')}`);
  assert.ok(inspected > 1000, `inspected ${inspected} frames`);
  assert.ok(order.length >= 3, `only ${order.length} transitions: ${order.join(', ')}`);
  assert.equal(order[0], STATE.SUSPICIOUS, `first transition was "${order[0]}", not suspicious — detection is binary`);
  assert.ok(order.includes(STATE.CHASE), 'never escalated to chase');
  assert.equal(order[order.length - 1], STATE.PATROL, `ended in "${order[order.length - 1]}" — he never stood back down`);
});

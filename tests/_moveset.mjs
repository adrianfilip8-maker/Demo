import * as THREE from 'three';
import { Controller, TUNE } from '../src/player/Controller.js';
import { buildMoveset } from '../src/player/Moveset.js';

/**
 * _moveset.mjs — the shared harness for driving Sly's state machine.
 *
 * ── Why this file exists (§424) ────────────────────────────────────────────────────────────
 * Every one of these functions was written by the traversal lane and lived in
 * `tests/traversal.test.mjs`, where nothing else could import it. The consequence, measured:
 * eight other test files reason about ~46 state names they cannot drive, and two written on one
 * day hit the gap directly — `recover.test.mjs` R2 went vacuous because `sm.set('ledgeHang')`
 * snapped Sly to a ledge that was not there, and `camlead.test.mjs` assigns `mv.stateName` as a
 * string on a fake movement object.
 *
 * **This is a MOVE, not a copy.** `traversal.test.mjs` imports every one of these back. If a
 * second world builder ever appears beside `realWorld()`, the thing §424 was written to stop has
 * happened. The two copies that existed when this landed — traversal's and the one
 * `cluevault.test.mjs` grew for its placement proofs — are both gone into this one.
 *
 * **A third exists and was left, deliberately:** `camspeed.test.mjs:163` runs the same four-module
 * build sequence, but into a *camera-rig* engine of its own rather than `stubEngine()`, and it
 * boots exactly once at module scope — so the cache would buy it nothing and folding it in would
 * mean parameterising the engine to couple two lanes together for no measured gain. Recorded here
 * so the next reader knows it was seen and weighed rather than missed. `vegwater.test.mjs:80` is
 * not a fourth: it builds a Terrain-only fixture, not the world.
 *
 * ── Two harnesses, and they answer different questions ─────────────────────────────────────
 *   makeSim + censusSetup   a STUB world and a starting pose per state. Cheap (no BVH), total
 *                           control, and the right instrument when you want a controlled pose
 *                           rather than the temple — which is what a camera or a stance gate
 *                           usually wants.
 *   realWorld + driveRoute  the SHIPPED level: Terrain, Architecture, Props, one BVH, scripted
 *                           input. The right instrument when the question is about the real
 *                           geometry — a real rung, a real ledge, a real drop.
 *
 * ── The cache, and why it is safe ──────────────────────────────────────────────────────────
 * `realWorld()` was called 20 times in one file with no cache, and a boot is 4.8-7.8 s that does
 * not get cheaper on repeat: ~110 s of a 181 s suite spent rebuilding the same immutable world.
 * It is cached here. Checked rather than assumed before doing it: **`Controller` registers no
 * colliders** (`grep registerCollider src/player/Controller.js` is empty; it touches the world
 * only by adding a debug mesh to the scene), so no driven probe can mutate the BVH.
 *
 * A **fresh `Controller` is minted per call** — 0.3 ms — so callers get exactly what they got
 * before the cache existed. Only the world is shared, and the world is read-only.
 */

export class StubInput {
  constructor() {
    this.move = { x: 0, y: 0 };
    this._down = new Set(); this._pressed = new Set(); this._released = new Set();
    this._buf = new Map(); this.t = 0;
  }
  beginFrame(dt) { this.t += dt; this._pressed.clear(); this._released.clear(); }
  clear() { this._down.clear(); this._pressed.clear(); this._released.clear(); this._buf.clear(); }
  hold(a) { if (!this._down.has(a)) { this._down.add(a); this._pressed.add(a); this._buf.set(a, this.t); } }
  let_go(a) { if (this._down.delete(a)) this._released.add(a); }
  down(a) { return this._down.has(a); }
  pressed(a) { return this._pressed.has(a); }
  released(a) { return this._released.has(a); }
  bufferedPeek(a, ms) { const t = this._buf.get(a); return t != null && (this.t - t) * 1000 <= ms; }
  buffered(a, ms) { const ok = this.bufferedPeek(a, ms); if (ok) this._buf.delete(a); return ok; }
}

export function stubEngine() {
  const listeners = new Map();
  return {
    input: new StubInput(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),   // default look direction is −Z
    scene: new THREE.Scene(), renderer: null,
    time: 0, dt: 0, timeScale: 1, width: 1920, height: 1080, quality: 'high',
    warnings: [], events: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get() { return null; }, has() { return false; },
    warn(m) { this.warnings.push(String(m)); },
    on(e, f) { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e).add(f); return () => listeners.get(e).delete(f); },
    emit(e, p) { this.events.push({ evt: e, payload: p }); for (const f of listeners.get(e) || []) f(p); },
    registerCollider() {},
  };
}

/**
 * Floor at y = 0, plus optionally the solid block `z <= wall.z, y <= wall.top` — a climbable +z
 * face with a walkable lid — and a registry of point affordances for `afford()`.
 *
 * `capsuleSweep` resolves by which face the motion CROSSED, using `from`, never by testing the
 * end point against the solid. See the note inside it: the point-in-solid version produced a
 * convincing fake engine bug.
 */
export function stubCollision({ points = [], wall = null, groundTag = 'ground', narrow = 0 } = {}) {
  const sweep = { hit: false, position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0 };
  const gnd = { hit: false, y: 0, normal: new THREE.Vector3(0, 1, 0), tag: 'ground', material: 'stone', rec: { id: 'floor' } };
  return {
    ready: true, fallback: false,
    SLOPE: { walkable: 50 * Math.PI / 180, wall: 70 * Math.PI / 180 },
    capsuleSweep(from, to, radius) {
      const r = radius ?? TUNE.radius;
      sweep.position.copy(to); sweep.normal.set(0, 1, 0); sweep.hit = false;
      if (to.y < 0) { sweep.position.y = 0; sweep.hit = true; }
      if (wall) {
        /* SWEPT, not point-in-solid: which face the capsule crossed is decided from `from`, and
           that distinction is load-bearing rather than pedantic. A point test resolves by final
           position, so the 0.76 m step-down probe `_moveHorizontal` fires after a mantle — which
           starts on the lid and ends inside the block — came out as "you are inside the +z face"
           and shoved Sly back out sideways. That produced a perfect mantle/fall/re-grab loop and
           looked exactly like an engine bug for as long as it took to trace. It was this
           function. */
        const side = wall.z + r;
        if (from.z >= side - 1e-9 && sweep.position.z < side && sweep.position.y < wall.top) {
          sweep.position.z = side; sweep.hit = true; sweep.normal.set(0, 0, 1);
        }
        if (from.y >= wall.top - 1e-9 && sweep.position.y < wall.top && sweep.position.z <= wall.z) {
          sweep.position.y = wall.top; sweep.hit = true; sweep.normal.set(0, 1, 0);
        }
      }
      sweep.distance = sweep.position.distanceTo(from);
      return sweep;
    },
    groundCheck(pos, _r, maxDist) {
      // Standing ON the block counts as ground, so a ladder can top out onto something.
      gnd.y = (wall && pos.z <= wall.z) ? wall.top : 0;
      gnd.tag = typeof groundTag === 'function' ? groundTag(pos) : groundTag;
      // `narrow` makes the floor a beam along z, so `narrowGround()` (which probes ±0.64 m to
      // either side) answers true and `tiptoe` becomes reachable.
      gnd.hit = (narrow ? Math.abs(pos.x) <= narrow : true) && pos.y - gnd.y <= maxDist + 1e-4;
      return gnd;
    },
    raycast(o, d, maxDist) {
      if (wall && d.z < -0.5 && o.y <= wall.top) {
        const dist = o.z - wall.z;
        if (dist > 0 && dist <= maxDist) {
          return { hit: true, point: new THREE.Vector3(o.x, o.y, wall.z), normal: new THREE.Vector3(0, 0, 1), distance: dist, tag: 'wall', rec: wall.rec };
        }
      }
      if (d.y < -0.5) {
        if (wall && o.z <= wall.z && o.y > wall.top && o.y - wall.top <= maxDist) {
          return { hit: true, point: new THREE.Vector3(o.x, wall.top, o.z), normal: new THREE.Vector3(0, 1, 0), distance: o.y - wall.top, tag: 'ledge', rec: wall.rec };
        }
        if (o.y > 0 && o.y <= maxDist) {
          return { hit: true, point: new THREE.Vector3(o.x, 0, o.z), normal: new THREE.Vector3(0, 1, 0), distance: o.y, tag: 'ground', rec: { id: 'floor' } };
        }
      }
      return { hit: false };
    },
    overlap() { return []; }, query() { return []; },
    nearest(pos, tag, maxDist) {
      let best = null, bd = Infinity;
      for (const it of points) {
        if (it.tag !== tag) continue;
        const p = it.point(pos);
        const d = p.distanceTo(pos);
        if (d <= maxDist && d < bd) { bd = d; best = { point: p, distance: d, rec: it.rec, tangent: it.tangent, t: it.t?.(pos) ?? 0 }; }
      }
      return best;
    },
  };
}

/** A minimal GUARDS stand-in, so `mark()` and `pickMark()` resolve and the two lock-on states
 *  can be exercised rather than exiting on "there is nobody to look at". */
export function stubGuards(at) {
  const body = { position: at.clone(), pocketPosition: at.clone(), headY: at.y + 1.6, state: 'patrol' };
  return {
    nearest: () => body,
    nearestPickpocketTarget: () => body,
  };
}

export async function makeSim(colOpts = {}) {
  const engine = stubEngine();
  if (colOpts.guards) engine.get = (m) => (m === 'guards' ? colOpts.guards : null);
  const c = new Controller(engine);
  await c.init();
  c.col = stubCollision(colOpts);
  c._colReal = c.col;
  c._calibrated = true;
  c._bindCollision = () => {};              // the stub is the collision; do not let init swap it
  c.teleport(new THREE.Vector3(0, 0, 0), Math.PI);
  c._needSpawnSnap = false;
  return { engine, c };
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DT = 1 / 60;

/** Drive the sim. `script(i, input, c)` sets input for frame i; `probe(i, c)` observes. */
export function run(engine, c, frames, script, probe) {
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    script(i, engine.input, c);
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (probe) probe(i, c);
  }
}

export const countEvents = (engine, name) => engine.events.filter((e) => e.evt === name).length;

export function railPoints(a, b, len) {
  const spline = new THREE.LineCurve3(a, b);
  const rec = { id: 'rail0', mesh: { userData: { spline } } };
  const u = (p) => Math.min(1, Math.max(0, (p.x - a.x) / len));
  return [{ tag: 'rail', rec, point: (p) => spline.getPointAt(u(p)), t: u, tangent: V(1, 0, 0) }];
}

export const PITCH = 2.10;

export function ladderWall({ rungs = 10, pitch = PITCH, z = -10, holds = true, top = 40, lines = null } = {}) {
  const batter = 0.105, nz = 1 / Math.hypot(batter, 1);
  const rec = { id: 'pylon-face', handholds: null };
  const list = [];
  const cols = lines || [{ x: 0, y0: pitch, n: rungs }];
  cols.forEach((col, ci) => {
    for (let i = 0; i < (col.n ?? rungs); i++) {
      list.push({
        id: `notch-${ci}-${i}`, point: V(col.x, col.y0 + i * pitch, z), normal: V(0, batter * nz, nz),
        mesh: null, rung: i, pitch, face: 'south',
      });
    }
  });
  if (holds) rec.handholds = list;
  return { wall: { z, top, rec }, rec, list };
}

export const VENT_HALF = 2.5;                      // half-width of the census vent — see `censusSetup`

export function hookItem() {
  return { tag: 'hook', rec: { id: 'ring', mesh: { userData: {} } }, point: () => V(0, 8, -6), tangent: V(0, 1, 0) };
}
export function poleItem() {
  return {
    tag: 'pole',
    rec: { id: 'pole', mesh: { userData: { bottom: 0, top: 12 }, geometry: { parameters: { radiusTop: 0.5 } } } },
    point: (p) => V(0, Math.min(12, Math.max(0, p.y)), -6), tangent: V(0, 1, 0),
  };
}
export function spireItem() {
  return { tag: 'spire', rec: { id: 'tip', mesh: { userData: {} } }, point: () => V(0, 6, -6), tangent: V(0, 1, 0) };
}
export const BLANK_WALL = () => ({ z: -10, top: 40, rec: { id: 'blank-face' } });
export const LEDGE_WALL = () => ({ z: -10, top: 4, rec: { id: 'lip' } });

/** One world and one starting pose per state. */
export function censusSetup(name) {
  const air = (y = 10) => ({ col: {}, place(c) { c.position.set(0, y, 0); c.velocity.set(0, 0, 0); c.grounded = false; } });
  const ground = () => ({ col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true; } });
  switch (name) {
    case 'hookSwing':
      return { col: { points: [hookItem()] }, place(c) { c.position.set(0, 5.9, -6); c.velocity.set(4, 0, 0); c.grounded = false; } };
    case 'railSlide': case 'railWalk':
      return {
        col: { points: railPoints(V(-14, 5, -6), V(14, 5, -6), 28) },
        place(c) { c.position.set(0, 5, -6); c.velocity.set(6, 0, 0); c.grounded = false; },
      };
    case 'poleClimb': case 'poleSwing':
      return { col: { points: [poleItem()] }, place(c) { c.position.set(0, 4, -5.2); c.velocity.set(0, 0, 0); c.grounded = false; } };
    case 'spireLand':
      return { col: { points: [spireItem()] }, place(c) { c.position.set(0, 6.2, -6); c.velocity.set(0, -1, 0); c.grounded = false; } };
    case 'ledgeHang': case 'ledgeClimb':
      return {
        col: { wall: LEDGE_WALL() },
        place(c) {
          c.position.set(0, 4 - TUNE.hangDrop, -9.67); c.velocity.set(0, 0, 0); c.grounded = false;
          c.probeLedge(V(0, 0, -1));
        },
      };
    case 'wallClimb':
      return {
        col: { wall: ladderWall({ rungs: 6 }).wall },
        place(c) {
          c.position.set(0, PITCH - TUNE.hangReach, -9.61); c.velocity.set(0, 0, 0); c.grounded = false;
          c.probeWall(V(0, 0, -1));
        },
      };
    case 'wallRun': case 'wallCling': case 'wallJump':
      return {
        col: { wall: BLANK_WALL() },
        place(c) {
          c.position.set(0, 5, -9.6); c.velocity.set(0, 2, -5); c.grounded = false;
          c.probeWall(V(0, 0, -1));
        },
      };
    case 'toTarget':
      return {
        col: {},
        place(c) {
          c.position.set(0, 7, -3); c.velocity.set(0, 0, -6); c.grounded = false;
          c.addTarget({ id: 'census', point: V(0, 6, -6), volume: 6, catch: 6 });
          c.targets.acquire();
        },
      };
    /* A FINITE vent, because that is what the level authors — the four shipped vent colliders
       are tunnels (1.35 × 1.20 × 10.60 m and smaller), not regions. An infinite one reports
       `crawl` as a trap, which is a statement about the harness and not about the moveset. */
    case 'crawl':
      return {
        col: { groundTag: (p) => (Math.abs(p.x) <= VENT_HALF && Math.abs(p.z) <= VENT_HALF ? 'vent' : 'ground') },
        place: ground().place,
      };
    case 'tiptoe':  return { col: { narrow: 0.5 }, place: ground().place };
    case 'combatStrafe': case 'pickpocket':
      return { col: { guards: stubGuards(V(0, 0, -2.0)) }, place: ground().place };
    case 'land':
      return { col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, 0); c.grounded = true; c.landImpact = 6; } };
    case 'skid':
      return { col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, 6); c.grounded = true; } };
    case 'roll': case 'combo':
      return { col: {}, place(c) { c.position.set(0, 0, 0); c.velocity.set(0, 0, -6); c.grounded = true; } };
    case 'dive': case 'fall': case 'jump': case 'doubleJump': case 'paraglide': case 'bounce': case 'hurt':
      return air(12);
    default:
      return ground();
  }
}

/**
 * The whole world, in MANIFEST order — `terrain`, `architecture`, `props`, then `collision`.
 *
 * **Architecture alone is not the level, and believing it was cost this lane a whole round.**
 * `Terrain.js:1071` registers the desert sand as a plain `ground` collider and `Props.js`
 * registers the banner masts as `pole`s. With only `Architecture` built, the courtyard
 * `groundProxy` is the sole floor in the world, so a grid search for "nearest standable ground"
 * to a target just outside the entry pylon's south face lands on the FAR side of the pylon and
 * reports 6.45 m of solid masonry in between. Every number in that finding was produced
 * correctly, by a correct method, about a game that does not exist.
 *
 * The habit this encodes: a harness that omits a module does not fail. It runs, it returns, and
 * its numbers are plausible. So the collider count is asserted against the shipped total rather
 * than trusted — if a module stops loading here, this fails instead of quietly lying.
 */
let _WORLD = null;
let _PREV = null;

/**
 * The whole world, cached. See the file header for why the cache is safe; the short version is
 * that `Controller` registers no colliders, so nothing a probe does can reach the BVH.
 *
 * The **Controller is fresh on every call** — 0.3 ms against a 5 s world — so a caller gets
 * exactly the object it got before this cache existed. `engine.events` is drained on handout
 * because the engine is shared and a probe that counts events must not start with the previous
 * one's, which is the single hazard sharing an engine introduces.
 */
export async function realWorld() {
  if (_WORLD) {
    const { engine } = _WORLD;
    /**
     * Retire the previous Controller before minting the next.
     *
     * **Found by looking for it, and it is the one hazard the cache actually introduces.**
     * `Controller.init` subscribes to `enemyBounce`, `hurt`, `shot`, `registerTarget` and
     * `unregisterTarget` on the engine. With a per-call engine those listeners died with it;
     * with a shared one they accumulate, so after N calls a single `registerTarget` emit is
     * handled N times and every retired Controller keeps growing a target list nobody reads.
     * Measured before fixing: two calls, one emit, and the FIRST controller's target list went
     * 15 -> 16. `dispose()` is the existing unsubscribe path and this is what it is for.
     */
    try { _PREV?.dispose?.(); } catch { /* a torn-down probe must not fail the next one */ }
    engine.events.length = 0;
    engine.warnings.length = 0;
    engine.input.clear?.();
    const c = new Controller(engine);
    await c.init();
    _PREV = c;
    return { ..._WORLD, c };
  }
  const { Terrain } = await import('../src/world/Terrain.js');
  const { Architecture } = await import('../src/world/Architecture.js');
  const { Props } = await import('../src/world/Props.js');
  const { Collision } = await import('../src/world/Collision.js');
  const engine = stubEngine();
  const queued = [];
  const mods = {};
  let collision = null;
  const guardBody = { position: V(0, 0, 28), pocketPosition: V(0, 1, 28), headY: 1.6, state: 'patrol' };
  engine.get = (m) => (m === 'collision' ? collision
    : m === 'guards' ? { nearest: () => guardBody, nearestPickpocketTarget: () => guardBody }
    : mods[m] || null);
  engine.registerCollider = (mesh, opts = {}) => {
    const rec = { mesh, tag: opts.tag || 'ground', climbable: !!opts.climbable, material: opts.material || 'stone', oneWay: !!opts.oneWay, ...opts };
    if (collision?.add) collision.add(rec); else queued.push(rec);
    return rec;
  };
  mods.terrain = new Terrain(engine);
  await mods.terrain.init();
  mods.architecture = new Architecture(engine);
  await mods.architecture.init();
  mods.props = new Props(engine);
  await mods.props.init();
  collision = new Collision(engine);
  for (const r of queued) collision.add(r);
  await collision.init();
  _WORLD = { engine, arch: mods.architecture, collision, mods };
  const c = new Controller(engine);
  await c.init();
  _PREV = c;
  return { ..._WORLD, c };
}

/** Reset every scrap of per-run state, including the guards this lane added to the states. */
export function hardReset(engine, c, pos, yaw = Math.PI) {
  c.teleport(pos.clone(), yaw);
  c.velocity.set(0, 0, 0);
  c.airJumps = 1; c.wallRunUsed = 0; c.freeWall();
  c.hangLock = 0; c.poleLock = 0; c.spireLock = 0; c.landImpact = 0;
  c.comboIndex = 0; c.comboTimer = 0;
  c.targets.release('probe');
  for (const t of c.targets.list) t.cooldown = 0;
  /**
   * The state instances hold guards of their own, and leaving them set between probes made a
   * standoff sweep read as alternating success/failure — a player never teleports between rungs,
   * a probe harness does. This used to scrub them by name: `WallClimb._left/_line/_hold/_pick`,
   * `HookSwing._spent`, `RailSlide._offRec`.
   *
   * **That list is gone rather than fixed (§424).** A hand-written enumeration of things you must
   * not forget, with nothing checking that you did not, was already wrong twice over: `idle._bored`
   * was never in it, and `RailSlide._offRec` is assigned lazily, so no sweep and no reader can
   * enumerate it from a fresh instance at all. Adding a test that the list is complete would just
   * be a second list.
   *
   * A whole fresh moveset costs a fraction of a millisecond and has no stale fields by
   * construction, so there is nothing left to remember. `teleport()` above already ends in
   * `sm.set('fall'); sm.set('idle')`, so the state after this line is `idle` either way — the
   * rebuild changes which OBJECT is idle, not which state.
   */
  c.sm.states.clear();
  c.sm.ordered.length = 0;
  c.sm.current = null; c.sm.prev = null; c.sm.time = 0;
  c.sm._pending = null; c.sm._pendingFrom = null;
  for (const s of buildMoveset(c)) c.sm.add(s);
  c.sm.set('idle');
  c.stateName = c.sm.name;
  engine.input.clear?.();
  engine.events.length = 0;
}

/**
 * Reachability for the attach half of the moveset, against `realWorld()` — terrain, architecture,
 * props, collision. Start positions are DERIVED here, not written down: every position this lane
 * previously located for these states was found in a world missing Terrain and Props, so all of
 * them had to be re-derived anyway.
 *
 * Each route below records the script that produced it. That labelling is not decoration — the
 * world lane lost a round to presenting a failure from one script beside climbing results from
 * another as though they were one result, and several states here are reached *incidentally* by
 * a script aimed at something else (which is a real answer, but only if you can say which run it
 * came from).
 */
export async function driveRoute(engine, c, start, yaw, frames, drive, watch) {
  hardReset(engine, c, start, yaw);
  let first = -1, last = '', path = [];
  for (let i = 0; i < frames; i++) {
    engine.input.beginFrame(DT);
    engine.input.move.x = 0; engine.input.move.y = 0;
    drive(engine.input, i, c);
    engine.time = i * DT;
    c.update(DT, i * DT);
    if (c.stateName !== last) { path.push(`${c.stateName}@${i}`); last = c.stateName; }
    if (first < 0 && c.stateName === watch) first = i;
  }
  return { first, path };
}

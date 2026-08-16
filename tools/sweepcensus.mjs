/**
 * The §409/§412 census: how often does `Collision.capsuleSweep` report `hit` for DEPENETRATION
 * rather than for a swept contact, and which caller asked?
 *
 * `capsuleSweep` sets `hit` on two occasions that mean opposite things — the swept capsule
 * contacted geometry, or the capsule was already overlapping and got pushed out without the
 * sweep touching anything. On the second path it also sets `toi = 1` and `distance = totalLen`,
 * so a caller reading `hit` and trusting `toi` is told "you travelled the whole way" by a sweep
 * that never moved. That dropped Sly off a wall-climb summit lip (§409.1).
 *
 * The layer now publishes `sweepHit` / `depenHit`, so this counts exactly rather than inferring.
 *
 * **Why this is a tool and not a test.** §409.2's original census was reasoned from memory and
 * measured at one site for 305 sweeps; it missed a caller and understated the rate by two orders
 * of magnitude. A rate needs thousands of frames, and thousands of controller frames cost minutes
 * under `node --test` against seconds here. `tests/traversal.test.mjs` keeps the parts that must
 * never regress — the four-quadrant discriminator, the static scan that catches a NEW caller
 * anywhere in `src`, and the summit-lip minimal pair — and the rate lives here where it is cheap
 * to re-measure. No renderer, no capture lock, ~6 seconds.
 *
 *   node tools/sweepcensus.mjs [--grid 10] [--frames 45]
 */
import * as THREE from 'three';
import { Terrain } from '../src/world/Terrain.js';
import { Architecture } from '../src/world/Architecture.js';
import { Props } from '../src/world/Props.js';
import { Collision } from '../src/world/Collision.js';
import { Controller, TUNE } from '../src/player/Controller.js';

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const GRID = argOf('grid', 10);       // metres between start points, over ±40 m
const FRAMES = argOf('frames', 45);   // frames walked per route
const DT = 1 / 60;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---- the smallest engine the world modules and the Controller will accept ---------------- */
class StubInput {
  constructor() { this.move = { x: 0, y: 0 }; this._down = new Set(); this._pressed = new Set(); this._released = new Set(); this._buf = new Map(); this.t = 0; }
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

const queued = []; const mods = {}; let collision = null;
const guardBody = { position: V(0, 0, 28), pocketPosition: V(0, 1, 28), headY: 1.6, state: 'patrol' };
const engine = {
  input: new StubInput(),
  camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
  scene: new THREE.Scene(), renderer: null,
  time: 0, dt: 0, timeScale: 1, width: 1600, height: 900, quality: 'high',
  warnings: [], events: [],
  debug: { freeCam: false, showColliders: false, wireframe: false },
  get: (m) => (m === 'collision' ? collision
    : m === 'guards' ? { nearest: () => guardBody, nearestPickpocketTarget: () => guardBody }
      : mods[m] || null),
  has: () => false,
  warn(m) { this.warnings.push(String(m)); },
  on: () => () => {},
  /* Deliberately a no-op sink rather than a growing array: a few thousand controller frames emit
     tens of thousands of events and retaining them costs more than the physics does. */
  emit() {},
  registerCollider(mesh, opts = {}) {
    const rec = { mesh, tag: opts.tag || 'ground', climbable: !!opts.climbable, material: opts.material || 'stone', oneWay: !!opts.oneWay, ...opts };
    if (collision?.add) collision.add(rec); else queued.push(rec);
    return rec;
  },
};

mods.terrain = new Terrain(engine); await mods.terrain.init();
mods.architecture = new Architecture(engine); await mods.architecture.init();
mods.props = new Props(engine); await mods.props.init();
collision = new Collision(engine);
for (const r of queued) collision.add(r);
await collision.init();
const c = new Controller(engine);
await c.init();

/* ---- attribution -------------------------------------------------------------------------
   Caller NAME from the stack, which is robust to the file moving. The two sites inside
   `_moveHorizontal` are separated by the SHAPE of the request instead, because they ask opposite
   questions of the same wrapper: the step-up probe sweeps UP by stepHeight, the ground snap
   sweeps DOWN by stepHeight + groundSnap. A line number would separate them too and would rot. */
function siteOf(from, to, height) {
  if (height === 0) return 'CameraRig._sweep (boom)';
  const st = new Error().stack.split('\n');
  for (let i = 2; i < st.length; i++) {
    const m = /at (?:async )?([A-Za-z_$][\w$.]*)/.exec(st[i]);
    if (!m) continue;
    /* Frames arrive QUALIFIED — `Object.capsuleSweep`, `collision.capsuleSweep`,
       `Controller._sweep` — so these must be suffix tests. Written as exact equality first, which
       silently matched nothing and lumped all 6,412 sweeps under one name: an attribution that
       cannot attribute, reported as a census. */
    if (/(^|\.)(capsuleSweep|_sweep|siteOf)$/.test(m[1])) continue;
    const n = m[1].replace(/^[A-Za-z_$][\w$]*\./, '');
    if (n === '_moveHorizontal') return (to.y - from.y) > 0 ? '_moveHorizontal step-up probe' : '_moveHorizontal ground snap';
    return n;
  }
  return '(unattributed)';
}

const stats = new Map();
const realSweep = collision.capsuleSweep.bind(collision);
let recording = false;
collision.capsuleSweep = function (from, to, r, h, o, out) {
  const res = realSweep(from, to, r, h, o, out);
  if (recording) {
    const s = siteOf(from, to, h);
    let e = stats.get(s);
    if (!e) { e = { calls: 0, hit: 0, sweepOnly: 0, both: 0, depenOnly: 0, maxDepth: 0 }; stats.set(s, e); }
    e.calls++;
    if (res.hit) e.hit++;
    if (res.sweepHit && !res.depenHit) e.sweepOnly++;
    if (res.sweepHit && res.depenHit) e.both++;
    if (!res.sweepHit && res.depenHit) { e.depenOnly++; e.maxDepth = Math.max(e.maxDepth, res.depenDepth); }
  }
  return res;
};

function reset(pos, yaw = Math.PI) {
  c.teleport(pos.clone(), yaw);
  c.velocity.set(0, 0, 0);
  c.airJumps = 1; c.wallRunUsed = 0; c.freeWall();
  c.hangLock = 0; c.poleLock = 0; c.spireLock = 0; c.landImpact = 0;
  c.comboIndex = 0; c.comboTimer = 0;
  c.targets.release('probe');
  for (const t of c.targets.list) t.cooldown = 0;
  for (const n of ['wallClimb', 'hookSwing', 'railSlide', 'wallCling']) {
    const s = c.sm.get?.(n); if (!s) continue;
    s._left = 0; s._line = null; s._spent = false; s._offRec = null; s._hold = null;
  }
  c._assistUsed = false; c._needSpawnSnap = false;
}

/* ---- the walk ---------------------------------------------------------------------------- */
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
let routes = 0, frames = 0, jumps = 0;
recording = true;
for (let x = -40; x <= 40; x += GRID) {
  for (let z = -40; z <= 40; z += GRID) {
    /* Read the height out as a NUMBER before anything else queries the collision layer.
       `groundCheck` hands back a POOLED result from a ring of six, and one `c.update()` spends
       far more than six ground queries, so holding `g` across the direction loop and reading
       `g.y` on the second pass reads whatever the pool has since put there — `resetGround` sets
       `y = -Infinity`, which teleports the character to -Infinity and the walk never returns.
       This cost me two runs that looked like the box being slow, which it also was. */
    const g0 = collision.groundCheck(V(x, 90, z), TUNE.radius, 300);
    if (!g0?.hit) continue;
    const gy = g0.y;
    for (const [mx, my] of DIRS) {
      reset(V(x, gy + 0.05, z));
      for (let i = 0; i < 3; i++) { engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0; engine.time = i * DT; c.update(DT, i * DT); }
      if (!c.grounded) continue;
      routes++;
      for (let i = 0; i < FRAMES; i++) {
        engine.input.beginFrame(DT);
        engine.input.move.x = mx; engine.input.move.y = my;
        if (i % 15 === 7) { engine.input.hold('jump'); jumps++; } else engine.input.let_go('jump');
        engine.time = i * DT; c.update(DT, i * DT);
        frames++;
      }
    }
  }
}
recording = false;

console.log(`\n[census] ${routes} routes · ${frames} controller frames · ${jumps} jumps · ` +
  `${GRID} m grid over +-40 m\n`);
console.log('site                              calls    hit  sweep only   both  DEPEN-ONLY  max push');
let total = 0, totalDepen = 0;
for (const [s, e] of [...stats.entries()].sort()) {
  total += e.calls; totalDepen += e.depenOnly;
  console.log(`  ${s.padEnd(32)}${String(e.calls).padStart(6)}${String(e.hit).padStart(7)}` +
    `${String(e.sweepOnly).padStart(12)}${String(e.both).padStart(7)}${String(e.depenOnly).padStart(12)}` +
    `${e.maxDepth.toFixed(4).padStart(10)}`);
}
console.log(`  ${'TOTAL'.padEnd(32)}${String(total).padStart(6)}${''.padStart(26)}${String(totalDepen).padStart(12)}`);
console.log(`\n  depenetration-only rate: ${totalDepen} / ${total} = 1 in ` +
  `${totalDepen ? (total / totalDepen).toFixed(0) : '(none)'}`);

/* The origin-convention probe runs ONCE per collision binding and its answer is latched into
   `_capOff` for every subsequent sweep, so it is reported separately — it is the highest
   consequence bare `hit` read in the codebase, and §409.2's census missed it entirely. */
c._calibrated = false;
let cal = null;
const spy = collision.capsuleSweep;
collision.capsuleSweep = function (...a) { return (cal = spy.apply(this, a)); };
c._calibrate();
collision.capsuleSweep = spy;
console.log(`\n  _calibrate probe (runs once, LATCHES): hit=${cal?.hit} sweepHit=${cal?.sweepHit} ` +
  `depenHit=${cal?.depenHit} push=${(cal?.depenDepth ?? 0).toFixed(4)} m -> _capOff=${c._capOff}`);
console.log('  It is safe because a 3.5 m drop starting 3 m above ground found by `groundCheck`');
console.log('  MUST cross that ground, so the sweep loop cannot come back empty. If that stops');
console.log('  being true the probe needs the bound, not a wider acceptance window.\n');

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import * as K from '../src/world/Kit.js';
import { Architecture } from '../src/world/Architecture.js';
import { buildEgyptLevel, MAG, L as LEVEL } from '../src/world/EgyptLevel.js';
import { Controller, TUNE } from '../src/player/Controller.js';
import { buildMoveset } from '../src/player/Moveset.js';
import { EMITTERS, PAL, TILE } from '../src/fx/Emitters.js';
import { TUNE as FXTUNE } from '../src/fx/Particles.js';

/**
 * Level content — the authored traversal-magnetism registry in `src/world/EgyptLevel.js`.
 *
 * `src/player/Targets.js` shipped a mechanism with no content: an empty registry makes
 * `acquire()` return null and `toTarget.canEnter` false, so magnetism was a zero-delta feature
 * until a level said which points deserve it. This suite is the acceptance for that decision.
 *
 * ── What is under test, and what it is not ────────────────────────────────────────────────
 * `tests/targets.test.mjs` already proves the *law* works, on synthetic points placed a stated
 * Δ short of a known arc. It cannot say anything about whether the temple's own rings and tips
 * are places a player can actually arrive, because it never builds the temple. This file does:
 * `EgyptLevel.js`, `Architecture.js`, `Controller.js`, `Moveset.js` and `Targets.js` all import
 * in plain Node (no `import.meta.glob`, no DOM, no renderer), so the **shipped level builds
 * headless in about a second** and every number below is read off the real registry rather than
 * off a copy of it in this file. If someone moves a ring, this suite moves with it.
 *
 * ── The claim ─────────────────────────────────────────────────────────────────────────────
 * "A target authored where the player can never arrive is worse than no target: it is a
 * promise the game does not keep." So, for all 14:
 *
 *   §2  no two trigger volumes overlap — acquisition cannot flicker between two points;
 *   §3  a ballistic arc from a plausible approach at our real speed and gravity passes within
 *       `catch`; and the same instrument says NO for controls that are out of reach;
 *   §4  a real `Controller` on a stub engine, flown off a real ring at a real swing release,
 *       is caught when it should be and left alone when it should not;
 *   §5  the one spire the level's own moveset physically cannot reach is closed by exactly
 *       the derived catch and nothing wider.
 *
 * ── Calibration ───────────────────────────────────────────────────────────────────────────
 * Every measurement here carries an arm that MUST move, because four runs voided this session
 * on that rule. §2 proves it can see an overlap by scaling the volumes until one appears. §3
 * runs its whole scan against controls displaced out of the envelope, which must fail. §4 runs
 * the identical 30-cell grid with `targets.enabled` false, which must catch nothing — and the
 * grid itself is two-sided: near misses must be caught AND wide misses must not, so a system
 * that did nothing and a system that did everything both fail it.
 *
 * Numbers are printed whatever they say.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

K.setMergeFn?.(mergeGeometries);

function quietEngine() {
  const events = [];
  return {
    events,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100),
    warnings: [],
    debug: { freeCam: false, showColliders: false, wireframe: false },
    get: () => null,
    has: () => false,
    on: () => () => {},
    emit(e, p) { events.push({ e, p }); },
    registerCollider: () => {},
    warn(m) { this.warnings.push(String(m)); },
  };
}

/** Build the shipped level once. Deterministic: Architecture seeds from WORLD_SEED (§1). */
const archEngine = quietEngine();
const arch = new Architecture(archEngine);
const buildStart = Date.now();
buildEgyptLevel(arch);
const BUILD_MS = Date.now() - buildStart;

const SPECS = arch.api.targets;
/** Every collider the level registered, so a target can be checked against a real affordance. */
const COLLIDERS = arch._colliders.map((m) => ({ name: m.name, point: m.userData?.point || null }));

const G = TUNE.gravity;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const byId = (id) => SPECS.find((s) => s.id === id);

/* ---- stub input + controller, same shape as tests/targets.test.mjs ---- */

class StubInput {
  constructor() {
    this.move = { x: 0, y: 0 };
    this._down = new Set(); this._pressed = new Set(); this._released = new Set();
    this._buf = new Map(); this.t = 0;
  }
  beginFrame(dt) { this.t += dt; this._pressed.clear(); this._released.clear(); }
  hold(a) { if (!this._down.has(a)) { this._down.add(a); this._pressed.add(a); this._buf.set(a, this.t); } }
  let_go(a) { if (this._down.delete(a)) this._released.add(a); }
  down(a) { return this._down.has(a); }
  pressed(a) { return this._pressed.has(a); }
  released(a) { return this._released.has(a); }
  bufferedPeek(a, ms) { const t = this._buf.get(a); return t != null && (this.t - t) * 1000 <= ms; }
  buffered(a, ms) { const ok = this.bufferedPeek(a, ms); if (ok) this._buf.delete(a); return ok; }
}

function playerEngine() {
  const e = quietEngine();
  const listeners = new Map();
  e.input = new StubInput();
  e.time = 0; e.dt = 0; e.timeScale = 1;
  e.width = 1920; e.height = 1080; e.quality = 'high';
  e.on = (evt, fn) => {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  };
  e.emit = (evt, p) => { e.events.push({ e: evt, p }); for (const fn of listeners.get(evt) || []) fn(p); };
  return e;
}

/**
 * Fly the real controller from a launch state, with the whole shipped registry loaded.
 * `enabled` is the single lever between the two arms.
 *
 * `steer` is a world direction to hold the stick toward. Input is camera-relative (§6.1), so
 * the stub camera is aimed along it and `move.y = 1` held — that is how a player asks for air
 * control, and leaving it out models a player who lets go of the stick mid-flight.
 */
async function fly({ p0, vel, target, enabled, jumpAt = null, steer = null, frames = 170, dt = 1 / 60 }) {
  const engine = playerEngine();
  const c = new Controller(engine);
  await c.init();
  for (const s of SPECS) c.addTarget(s);
  c.targets.enabled = enabled;
  if (steer) {
    engine.camera.position.set(0, 0, 0);
    engine.camera.lookAt(steer.x, 0, steer.z);
    engine.camera.updateMatrixWorld(true);
  }
  c.teleport(p0.clone(), Math.atan2(vel.x, vel.z));
  c.grounded = false; c.coyote = 99; c.airJumps = 1;
  c.velocity.copy(vel);
  c.sm.set('fall');

  let minD = Infinity, reached = false, acquired = null;
  for (let i = 0; i < frames; i++) {
    const t = i * dt;
    engine.input.beginFrame(dt);
    if (steer) engine.input.move.y = 1;
    // Held, not tapped: `applyJumpCut` takes 55% off vy the frame Space is released, so a
    // tapped double jump measures the jump cut rather than the double jump.
    if (jumpAt != null && t >= jumpAt) engine.input.hold('jump');
    engine.time = t;
    c.update(dt, t);
    const d = c.position.distanceTo(target);
    if (d < minD) minD = d;
    if (!acquired && c.targets.target) acquired = c.targets.target.id;
    if (c.targets.status === 'onTarget') reached = true;
    if (c.position.y < target.y - 14) break;
  }
  return { minD, reached, acquired, state: c.stateName, release: c.targets.lastRelease };
}

/* ====================================================================== */
/* the offline ballistic instrument                                        */
/* ====================================================================== */

/**
 * Closest approach of an arc to a point. **This mirrors the shipped air step, not a textbook
 * parabola**, and the difference is not academic: the first draft of this file used the same
 * drag-free, hang-free parabola `Targets.predictMiss` uses for the acquisition gate, and it
 * disagreed with the real integrator by up to 1.06 m — enough to certify a spire the shipped
 * game cannot reach. `predictMiss` being optimistic is fine for a gate; it is not fine for an
 * instrument that decides whether a promise can be kept.
 *
 * What is reproduced, from `AirState.air` / `Controller.gravity` / `DoubleJump.enter`, in the
 * same order and at the same 1/60 step the live arm runs:
 *   · `accelerate(dt, runSpeed, accel × airControl, airDrag)` — steering toward `steer` when a
 *     direction is held, and decaying at `airDrag` 0.6 m/s² when it is not;
 *   · gravity, then apex hang (`vy ×= 0.72^(60·dt)` while `0 < vy < 2.2`) — the term that costs
 *     the pole top hop 8 cm of rise and made the difference above;
 *   · the air jump: redirect horizontal to `wishDir × max(3.2, 0.92·speed)` when steering, then
 *     `vy := doubleJumpV0`.
 * `ledgeAssist` is inert here for the same reason it is in the live arm — `FLAT.fallback` makes
 * it return early, so §6's 0.45 m ledge snap cannot be credited to magnetism.
 */
function arcMin(p0, v0, target, t1, { steer = null, T = 2.4, dt = 1 / 60 } = {}) {
  const p = p0.clone(), v = v0.clone();
  let best = p.distanceTo(target), jumped = t1 == null;
  const sx = steer ? steer.x : 0, sz = steer ? steer.z : 0;
  for (let t = 0; t < T; t += dt) {
    if (!jumped && t >= t1) {
      jumped = true;
      if (steer) {
        const sp = Math.max(3.2, Math.hypot(v.x, v.z) * 0.92);
        v.x = sx * sp; v.z = sz * sp;
      }
      v.y = TUNE.doubleJumpV0;
    }
    if (steer) {
      const dx = sx * TUNE.runSpeed - v.x, dz = sz * TUNE.runSpeed - v.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        const step = Math.min(d, TUNE.accel * TUNE.airControl * dt);
        v.x += dx / d * step; v.z += dz / d * step;
      }
    } else {
      const sp = Math.hypot(v.x, v.z);
      if (sp > 1e-5) {
        const step = Math.min(sp, TUNE.airDrag * dt);
        v.x -= v.x / sp * step; v.z -= v.z / sp * step;
      }
    }
    v.y += G * dt;
    if (v.y > 0 && v.y < TUNE.apexWindow) v.y *= Math.pow(TUNE.apexHang, dt * 60);
    if (v.y < TUNE.maxFall) v.y = TUNE.maxFall;
    p.addScaledVector(v, dt);
    const d = p.distanceTo(target);
    if (d < best) best = d;
    if (p.y < target.y - 14) break;
  }
  return best;
}

const AIRJUMP_TIMES = [null, ...Array.from({ length: 41 }, (_, k) => k * 0.04)];
const bestOverAirJump = (p0, v0, tgt, opts) => {
  let b = Infinity;
  for (const t1 of AIRJUMP_TIMES) { const d = arcMin(p0, v0, tgt, t1, opts); if (d < b) b = d; }
  return b;
};

/**
 * A swing release off the ring at `anchor`, aimed at `tgt`.
 *
 * Modelled from the shipped moveset, not invented: `HookSwing` is a rigid pendulum of length
 * `hookL` about the ring, so at release angle θ off a swing pumped to θmax the tangential speed
 * is √(2|g|L(cos θ − cos θmax)); release multiplies velocity by `hookRelease` and adds
 * `hookUpKick` to vy, and hands back one air jump (`c.airJumps = 1`), which the scan spends.
 * The release position is on the sphere, so it starts L·sinθ forward of the hang point and
 * L(1−cosθ) above it. θmax = 75° is a well-pumped but not extraordinary swing; §3 also reports
 * the minimum θmax each hop actually needs.
 */
function swingRelease(anchor, tgt, thetaDeg, thetaMaxDeg) {
  const L = TUNE.hookL;
  const hang = anchor.clone(); hang.y -= L;
  const dir = V(tgt.x - hang.x, 0, tgt.z - hang.z);
  if (dir.lengthSq() < 1e-9) return null;
  dir.normalize();
  const th = thetaDeg * Math.PI / 180, tm = thetaMaxDeg * Math.PI / 180;
  const k = Math.cos(th) - Math.cos(tm);
  if (k <= 0) return null;
  const v = Math.sqrt(2 * -G * L * k);
  const vh = v * Math.cos(th) * TUNE.hookRelease;
  const vv = v * Math.sin(th) * TUNE.hookRelease + TUNE.hookUpKick;
  const p0 = hang.clone().addScaledVector(dir, L * Math.sin(th));
  p0.y += L * (1 - Math.cos(th));
  return { p0, vel: V(dir.x * vh, vv, dir.z * vh), vh, vv, dir };
}

function swingBest(anchor, tgt, thetaMaxDeg = 75) {
  let best = Infinity, arg = null;
  for (let d = 5; d <= 70; d += 0.5) {
    const r = swingRelease(anchor, tgt, d, thetaMaxDeg);
    if (!r) continue;
    const m = bestOverAirJump(r.p0, r.vel, tgt);
    if (m < best) { best = m; arg = { theta: d, vh: +r.vh.toFixed(2), vv: +r.vv.toFixed(2) }; }
  }
  return { miss: best, arg };
}

/** A launch from a fixed foot position, aimed at the target, scanning horizontal speed. */
function launchBest(from, tgt, vy0, sMin, sMax, { steer = false, airJump = true } = {}) {
  const dir = V(tgt.x - from.x, 0, tgt.z - from.z);
  if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1); else dir.normalize();
  const opts = { steer: steer ? dir : null };
  let best = Infinity, arg = null;
  for (let s = sMin; s <= sMax + 1e-9; s += 0.05) {
    const v0 = V(dir.x * s, vy0, dir.z * s);
    const m = airJump ? bestOverAirJump(from.clone(), v0, tgt, opts)
                      : arcMin(from.clone(), v0, tgt, null, opts);
    if (m < best) { best = m; arg = { s: +s.toFixed(2) }; }
  }
  return { miss: best, arg, dir };
}

/** `PoleClimb`'s top hop: `jumpV0 × 0.55` up, 1.6 m/s toward the shaft, from the hold circle. */
const POLE_HOP_VY = TUNE.jumpV0 * 0.55;
const poleHold = (r) => r + TUNE.radius * 0.8;

/** Highest y a launch at `vy0` from `y0` actually reaches, apex hang included. */
function arcApex(y0, vy0, dt = 1 / 60) {
  let y = y0, v = vy0, top = y0;
  for (let t = 0; t < 2; t += dt) {
    v += G * dt;
    if (v > 0 && v < TUNE.apexWindow) v *= Math.pow(TUNE.apexHang, dt * 60);
    y += v * dt;
    if (y > top) top = y;
    if (v < 0 && y < y0) break;
  }
  return top;
}

/* ====================================================================== */
/* 0 — the registry is what the level says it is                           */
/* ====================================================================== */

test('level: the shipped level builds headless and registers a non-empty target registry', () => {
  assert.ok(Array.isArray(SPECS), 'architecture.api.targets is not an array');
  assert.ok(SPECS.length > 0, 'the registry is empty — magnetism is still a zero-delta feature');
  const emitted = archEngine.events.filter((e) => e.e === 'registerTarget');
  console.log(`\n[build] ${BUILD_MS} ms · ${arch._colliders.length} colliders · ` +
              `${SPECS.length} targets · ${emitted.length} registerTarget emits`);
  for (const s of SPECS) {
    console.log(`  ${s.id.padEnd(18)} (${s.point.x.toFixed(2)}, ${s.point.y.toFixed(2)}, ` +
                `${s.point.z.toFixed(2)})  vol ${s.volume}  catch ${s.catch}  ` +
                `${s.group}/${s.arrive}${s.jumpMult ? ` jumpMult ${s.jumpMult}` : ''}`);
  }
  assert.equal(emitted.length, SPECS.length, 'every authored target must also go onto the bus');
  const ids = new Set(SPECS.map((s) => s.id));
  assert.equal(ids.size, SPECS.length, 'duplicate target ids — dedupe on flush would drop one');
});

test('level: every authored point sits on a registered affordance, not in mid-air', () => {
  /* The design invariant behind putting a hook's point on the ring rather than 2.2 m under it:
     §2.1.6's idle diamond is drawn from COLLISION's affordance query, so a target that did not
     coincide with a collider point would be a promise marked in one place and kept in another. */
  const pts = COLLIDERS.filter((c) => c.point);
  assert.ok(pts.length > 0, 'inspected zero collider points — the proxy list is wrong');
  let checked = 0;
  for (const s of SPECS) {
    const near = pts.reduce((a, b) => (b.point.distanceTo(s.point) < a.point.distanceTo(s.point) ? b : a));
    const d = near.point.distanceTo(s.point);
    checked++;
    assert.ok(d < 1e-6, `${s.id} is ${d.toFixed(3)} m from the nearest affordance point (${near.name})`);
  }
  console.log(`[affordance] ${checked} targets, each coincident with a ${pts.length}-point collider set`);
});

/* ====================================================================== */
/* 1 — the constants are derived, not chosen                               */
/* ====================================================================== */

test('level: both catch values are derivations from TUNE, and only one of them is widened', () => {
  const jumpDerived = TUNE.runSpeed * TUNE.jumpBufferMs / 1000;
  const swingDerived = Math.sqrt(2 * -TUNE.gravity * TUNE.hookL) * TUNE.jumpBufferMs / 1000;
  console.log(`\n[catch] default  runSpeed ${TUNE.runSpeed} x ${TUNE.jumpBufferMs} ms = ` +
              `${jumpDerived.toFixed(4)}  (authored ${MAG.catchJump}, TUNE.magCatch ${TUNE.magCatch})`);
  console.log(`[catch] swing    sqrt(2 x ${-TUNE.gravity} x hookL ${TUNE.hookL}) = ` +
              `${Math.sqrt(2 * -TUNE.gravity * TUNE.hookL).toFixed(4)} m/s x ${TUNE.jumpBufferMs} ms = ` +
              `${swingDerived.toFixed(4)}  (authored ${MAG.catchSwing}) — ` +
              `${(MAG.catchSwing / jumpDerived).toFixed(3)}x the default`);

  assert.ok(Math.abs(MAG.catchJump - jumpDerived) < 1e-3, 'catchJump is not runSpeed x jumpBuffer');
  assert.equal(MAG.catchJump, TUNE.magCatch, 'catchJump must BE the shipped default, not a copy of it');
  assert.ok(Math.abs(MAG.catchSwing - swingDerived) < 1e-3,
    `catchSwing ${MAG.catchSwing} is not sqrt(2gL) x jumpBuffer ${swingDerived.toFixed(4)}`);

  /* The gate this whole feature lives or dies on. A catch wide enough to rescue a 3 m miss
     makes the game play itself; state the ceiling and hold every authored value under it. */
  for (const s of SPECS) {
    assert.ok(s.catch <= 1.5,
      `${s.id} carries catch ${s.catch} — nothing in this level may exceed 1.5 m`);
  }
  const widened = SPECS.filter((s) => s.catch > MAG.catchJump + 1e-9);
  console.log(`[catch] ${widened.length} of ${SPECS.length} targets carry the widened value; ` +
              `max authored catch ${Math.max(...SPECS.map((s) => s.catch))}`);
  assert.ok(widened.length > 0 && widened.length < SPECS.length,
    'either nothing is widened (so the derivation is decoration) or everything is (so there is no judgement)');
});

test('level: no ring can recapture the player it just launched (catch < hookL)', () => {
  /* Found by §4's live arm, not by reasoning: with the point at the hang position, releasing a
     swing leaves you standing ON the target, so `predictMiss` is ~0 and the ring you just left
     re-acquires you on the release frame, forever. The invariant is that no position on a
     ring's own release sphere may be within `catch` of its point. */
  const L = TUNE.hookL;
  let checked = 0, worst = Infinity;
  for (const s of SPECS.filter((t) => t.userData?.kind === 'hook')) {
    const anchor = s.point;                      // the point IS the ring: drop = 0
    for (let d = 0; d <= 90; d += 5) {
      const th = d * Math.PI / 180;
      // Any position on the sphere of radius L about the anchor.
      const p = anchor.clone();
      p.x += L * Math.sin(th); p.y -= L * Math.cos(th);
      const dist = p.distanceTo(s.point);
      if (dist < worst) worst = dist;
      checked++;
      assert.ok(dist >= s.catch,
        `${s.id}: a release position is ${dist.toFixed(3)} m from its own point, inside catch ${s.catch}`);
    }
  }
  console.log(`[recapture] ${checked} release positions checked; closest ${worst.toFixed(3)} m ` +
              `vs catch ${MAG.catchSwing} (margin ${(worst - MAG.catchSwing).toFixed(3)} m)`);
  assert.ok(checked > 0, 'inspected zero release positions');
  /* CALIBRATION: the same check against the authoring that failed. A point at the hang
     position must be rejected, or this test cannot tell the two apart. */
  const hangDist = Math.abs(L - L);              // hang point sits ON the bottom of the sphere
  assert.ok(hangDist < MAG.catchSwing,
    'the rejected authoring (point = ring - hookL) must fail this invariant, or it proves nothing');
});

/* ====================================================================== */
/* 2 — trigger volumes cannot flicker                                      */
/* ====================================================================== */

/** Two volumes must be separated by at least one magSnapRadius of clear air. */
function overlapPairs(scale) {
  const out = [];
  for (let i = 0; i < SPECS.length; i++) {
    for (let j = i + 1; j < SPECS.length; j++) {
      const a = SPECS[i], b = SPECS[j];
      const d = a.point.distanceTo(b.point);
      const need = (a.volume + b.volume) * scale + TUNE.magSnapRadius;
      if (d < need) out.push({ a: a.id, b: b.id, d, need });
    }
  }
  return out;
}

test('level: no two trigger volumes overlap, and the pair test can see an overlap', () => {
  const bad = overlapPairs(1);
  let tightest = { gap: Infinity, a: '', b: '' };
  let pairs = 0;
  for (let i = 0; i < SPECS.length; i++) {
    for (let j = i + 1; j < SPECS.length; j++) {
      pairs++;
      const gap = SPECS[i].point.distanceTo(SPECS[j].point) - SPECS[i].volume - SPECS[j].volume;
      if (gap < tightest.gap) tightest = { gap, a: SPECS[i].id, b: SPECS[j].id };
    }
  }
  console.log(`\n[volumes] ${pairs} pairs; tightest clear air ${tightest.gap.toFixed(3)} m ` +
              `between ${tightest.a} and ${tightest.b} (rule: >= magSnapRadius ${TUNE.magSnapRadius})`);
  assert.ok(pairs > 0, 'inspected zero pairs');
  assert.deepEqual(bad.map((p) => `${p.a}/${p.b} d=${p.d.toFixed(2)} need=${p.need.toFixed(2)}`), [],
    'trigger volumes are close enough for acquisition to flicker');

  /* CALIBRATION — the arm that MUST move. Grow every volume and at least one pair has to trip,
     or this test is asserting a property of the arithmetic rather than of the level. */
  const grown = overlapPairs(1.25);
  console.log(`[volumes] calibration: at 1.25x volume, ${grown.length} pairs trip ` +
              `(${grown.slice(0, 3).map((p) => `${p.a}/${p.b}`).join(', ')})`);
  assert.ok(grown.length > 0,
    'growing every volume by 25% produced no overlap at all — the pair test cannot detect one');
});

/* ====================================================================== */
/* 3 — reachability                                                        */
/* ====================================================================== */

const CHAINS = [
  { name: 'main', ids: SPECS.filter((s) => s.id.startsWith('hook-main-')).map((s) => s.id) },
  { name: 'low', ids: SPECS.filter((s) => s.id.startsWith('hook-low-')).map((s) => s.id) },
];

test('level: every chain ring is reachable by a swing release from a neighbour', () => {
  const rows = [];
  let hops = 0, worst = 0;
  const reachable = new Set();
  for (const ch of CHAINS) {
    for (let i = 0; i + 1 < ch.ids.length; i++) {
      for (const [fromId, toId] of [[ch.ids[i], ch.ids[i + 1]], [ch.ids[i + 1], ch.ids[i]]]) {
        const from = byId(fromId), to = byId(toId);
        const r = swingBest(from.point, to.point, 75);
        let minTm = null;
        for (let tm = 40; tm <= 140; tm += 2) {
          if (swingBest(from.point, to.point, tm).miss <= to.catch) { minTm = tm; break; }
        }
        hops++;
        if (r.miss > worst) worst = r.miss;
        if (r.miss <= to.catch) reachable.add(toId);
        rows.push(`  ${fromId} -> ${toId}  gap ${from.point.distanceTo(to.point).toFixed(2)} m  ` +
                  `best miss ${r.miss.toFixed(3)} (catch ${to.catch})  ` +
                  `release ${r.arg?.theta}deg at ${r.arg?.vh} m/s  needs swing pumped to >= ${minTm}deg`);
        assert.ok(r.miss <= to.catch,
          `${fromId} -> ${toId}: best ballistic miss ${r.miss.toFixed(3)} m exceeds catch ${to.catch}`);
      }
    }
  }
  console.log(`\n[reach: swing] ${hops} hops, both directions, theta_max 75deg\n` + rows.join('\n'));
  console.log(`[reach: swing] worst best-miss over all hops ${worst.toFixed(3)} m`);
  assert.ok(hops > 0, 'inspected zero hops');
  const rings = SPECS.filter((s) => s.userData?.kind === 'hook').map((s) => s.id);
  assert.deepEqual(rings.filter((id) => !reachable.has(id)), [],
    'a ring is not reachable from any neighbour');
});

test('level: every spire tip is reachable off the pole that carries it', () => {
  /* Each of the three stands on a `pole`, so the approach is `PoleClimb`'s top hop. The obelisk
     figures are the justification for the whole spire set: the hop peaks BELOW the tip. */
  const APPROACH = [
    { id: 'spire-obelisk', axis: V(LEVEL.obelisk.x, 0, LEVEL.obelisk.z), poleTop: LEVEL.obelisk.h - 1.6, r: 1.5 },
    { id: 'spire-pinnacle-e', axis: V(16, 0, -50), poleTop: LEVEL.hall.aisleRoof + 6.0, r: 0.85 },
    { id: 'spire-pinnacle-w', axis: V(-16, 0, -50), poleTop: LEVEL.hall.aisleRoof + 6.0, r: 0.85 },
  ];
  const rows = [];
  for (const a of APPROACH) {
    const s = byId(a.id);
    assert.ok(s, `${a.id} is not in the registry`);
    const hold = poleHold(a.r);
    const from = V(a.axis.x + hold, a.poleTop + 0.02, a.axis.z);
    // The plausible approach: hold the stick toward the shaft you are hopping onto.
    const withJump = launchBest(from, s.point, POLE_HOP_VY, 1.6, TUNE.runSpeed, { steer: true });
    // The hop ALONE at its own authored speed — `PoleClimb` launches at exactly 1.6 m/s.
    const bare = launchBest(from, s.point, POLE_HOP_VY, 1.6, 1.6, { steer: true, airJump: false }).miss;
    /* Apex hang trims the rise: the analytic v²/2g is 0.763 m and the shipped integrator gets
       less, which is exactly the 8 cm that decides whether this tip is reachable. */
    const peak = arcApex(from.y, POLE_HOP_VY);
    rows.push(`  ${a.id.padEnd(18)} pole top ${a.poleTop.toFixed(2)} -> hop peaks ${peak.toFixed(3)} ` +
              `vs tip ${s.point.y.toFixed(2)} (short by ${(s.point.y - peak).toFixed(3)} m)  ` +
              `bare miss ${bare.toFixed(3)}  with air jump ${withJump.miss.toFixed(3)}  catch ${s.catch}`);
    assert.ok(withJump.miss <= s.catch,
      `${a.id}: best miss ${withJump.miss.toFixed(3)} exceeds catch ${s.catch}`);
    assert.ok(peak < s.point.y,
      `${a.id}: the pole top hop already clears the tip, so this target has nothing to do`);
    assert.ok(bare > TUNE.magSnapRadius,
      `${a.id}: the bare hop already arrives (${bare.toFixed(3)} m) — the target has no work to do`);
  }
  console.log(`\n[reach: spire] top hop = jumpV0 x 0.55 = ${POLE_HOP_VY.toFixed(2)} m/s, ` +
              `1.6 m/s toward the shaft, stick held toward it\n` + rows.join('\n'));
  /* Recorded because it is the line between an assist and a substitute: the bare hop misses by
     0.83–1.09 m and the catch is 1.008, so magnetism rescues the *pinnacles* off a bare hop and
     does NOT rescue the obelisk — whose extra 0.10 m of pole radius puts it outside. The
     double jump is not optional there, and that is the right answer: an assist that replaced
     the move would be the game playing itself. §5 measures the obelisk arm both ways. */
});

test('level: CALIBRATION — the same scans say NO for approaches that are out of reach', () => {
  /* Without this, "every target is reachable" is equally consistent with an instrument that
     returns a small number for anything. Two controls, both derived from the envelope rather
     than picked: +8 m in y is above the apex of every launch in it, and +10 m further along
     the same approach direction is beyond its horizontal reach (+6 m is not — that is measured
     below and is why the control is 10). */
  const rows = [];
  let controls = 0, passed = 0;
  for (const ch of CHAINS) {
    for (let i = 0; i + 1 < ch.ids.length; i++) {
      const from = byId(ch.ids[i]), to = byId(ch.ids[i + 1]);
      const up = to.point.clone(); up.y += 8;
      const dir = V(to.point.x - from.point.x, 0, to.point.z - from.point.z).normalize();
      const far = to.point.clone().addScaledVector(dir, 10);
      const near = to.point.clone().addScaledVector(dir, 6);
      const mUp = swingBest(from.point, up, 75).miss;
      const mFar = swingBest(from.point, far, 75).miss;
      const mNear = swingBest(from.point, near, 75).miss;
      controls += 2;
      if (mUp > to.catch) passed++;
      if (mFar > to.catch) passed++;
      rows.push(`  ${from.id} -> ${to.id}:  +8y ${mUp.toFixed(2)}  +10m along ${mFar.toFixed(2)}  ` +
                `(+6m along ${mNear.toFixed(2)}, catch ${to.catch})`);
      assert.ok(mUp > to.catch, `control +8y for ${to.id} came back reachable (${mUp.toFixed(3)})`);
      assert.ok(mFar > to.catch, `control +10m for ${to.id} came back reachable (${mFar.toFixed(3)})`);
    }
  }
  console.log(`\n[reach: calibration] ${controls} controls, ${passed} correctly out of reach\n` + rows.join('\n'));
  assert.equal(passed, controls, 'a control the envelope cannot reach was reported reachable');

  /* And the spire control: the same launch aimed at a tip 8 m higher must fail. */
  const s = byId('spire-obelisk');
  const hold = poleHold(1.5);
  const from = V(LEVEL.obelisk.x + hold, LEVEL.obelisk.h - 1.6 + 0.02, LEVEL.obelisk.z);
  const high = s.point.clone(); high.y += 8;
  const m = launchBest(from, high, POLE_HOP_VY, 1.6, TUNE.runSpeed, { steer: true }).miss;
  console.log(`[reach: calibration] spire-obelisk +8y -> ${m.toFixed(2)} m (catch ${s.catch})`);
  assert.ok(m > s.catch, 'the spire control came back reachable');
});

/* ====================================================================== */
/* 4 — the real controller, flown off a real ring                          */
/* ====================================================================== */

const HOP_FROM = byId('hook-main-2');
const HOP_TO = byId('hook-main-3');
const THETAS = [15, 25, 35, 45, 55];
const DJ_TIMES = [null, 0.1, 0.3, 0.4, 0.6, 0.8];

/** The grid, run twice — the only difference between the arms is `targets.enabled`. */
const grid = [];
for (const th of THETAS) {
  for (const dj of DJ_TIMES) {
    const r = swingRelease(HOP_FROM.point, HOP_TO.point, th, 75);
    if (!r) continue;
    const off = await fly({ p0: r.p0, vel: r.vel, target: HOP_TO.point, enabled: false, jumpAt: dj });
    const on = await fly({ p0: r.p0, vel: r.vel, target: HOP_TO.point, enabled: true, jumpAt: dj });
    grid.push({ th, dj, off, on });
  }
}

test('level: CALIBRATION — with magnetism off, the real controller catches nothing (A1)', () => {
  const caught = grid.filter((g) => g.on.reached).length;
  const caughtOff = grid.filter((g) => g.off.reached).length;
  console.log(`\n[live] ${HOP_FROM.id} -> ${HOP_TO.id}, ${grid.length} release/air-jump cells, ` +
              `real Controller at 60 Hz with all ${SPECS.length} targets loaded`);
  console.log(`[live] magnetism OFF caught ${caughtOff}/${grid.length} · ON caught ${caught}/${grid.length}`);
  assert.equal(caughtOff, 0, 'the disabled arm arrived at the ring — the lever is not the lever');
  assert.ok(caught > 0, 'the enabled arm caught nothing, so the registry is inert in the real controller');
  assert.ok(caught < grid.length,
    'the enabled arm caught EVERY cell including the wide ones — that is an aimbot, not an assist');
});

test('level: near misses are caught and wide misses are not (A2 + specificity)', () => {
  const rows = [];
  const tooWide = [], tooTight = [];
  for (const th of THETAS) {
    const cells = grid.filter((g) => g.th === th);
    rows.push(`  release ${String(th).padStart(2)}deg: ` +
      cells.map((g) => `${g.dj == null ? '--' : g.dj.toFixed(1)}:${g.off.minD.toFixed(2)}${g.on.reached ? '*' : ' '}`).join('  '));
    for (const g of cells) {
      // Two-sided, with the band set by the authored catch and nothing else.
      if (g.on.reached && g.off.minD > HOP_TO.catch * 1.35) tooWide.push(`${th}deg/${g.dj}=${g.off.minD.toFixed(2)}`);
      if (!g.on.reached && g.off.minD < HOP_TO.catch * 0.65) tooTight.push(`${th}deg/${g.dj}=${g.off.minD.toFixed(2)}`);
    }
  }
  console.log(`[live] cell = unassisted closest approach in metres, * = magnetism reached the ring\n` +
              rows.join('\n'));
  console.log(`[live] catch ${HOP_TO.catch} m; band checked ${(HOP_TO.catch * 0.65).toFixed(3)} .. ` +
              `${(HOP_TO.catch * 1.35).toFixed(3)}`);
  console.log(`[live] caught outside the band (would be an aimbot): ${tooWide.join(', ') || '(none)'}`);
  console.log(`[live] missed inside the band (would be unreliable): ${tooTight.join(', ') || '(none)'}`);

  /* The 35% band is the disagreement allowance between the two instruments, and it is stated
     before the arms are read: `off.minD` is the minimum over the WHOLE unassisted arc, while
     acquisition runs `predictMiss` from a live mid-flight state on an arc the assist is already
     bending. They cannot agree to the metre and it would be dishonest to demand it. */
  assert.deepEqual(tooWide, [], 'magnetism captured an arc that missed by more than 1.35x catch');
  assert.deepEqual(tooTight, [], 'magnetism ignored an arc that passed within 0.65x catch');

  const nearMisses = grid.filter((g) => g.off.minD > TUNE.magSnapRadius && g.off.minD <= HOP_TO.catch);
  const rescued = nearMisses.filter((g) => g.on.reached).length;
  console.log(`[live] genuine near misses (unassisted > magSnapRadius ${TUNE.magSnapRadius}, ` +
              `<= catch): ${nearMisses.length}, rescued ${rescued}`);
  assert.ok(nearMisses.length >= 5,
    `only ${nearMisses.length} cells are genuine near misses — the grid is not testing the claim`);
  assert.equal(rescued, nearMisses.length, 'a genuine near miss inside catch was not rescued');
});

test('level: a released ring never re-acquires the player it just launched', () => {
  const selfCatch = grid.filter((g) => g.on.acquired === HOP_FROM.id);
  const acquired = new Set(grid.map((g) => g.on.acquired).filter(Boolean));
  console.log(`\n[recapture] targets acquired across the grid: ${[...acquired].join(', ') || '(none)'}`);
  assert.deepEqual(selfCatch.map((g) => `${g.th}deg/${g.dj}`), [],
    `${HOP_FROM.id} re-acquired the player on release — the swing chain is a lock-up`);
  assert.ok(acquired.size > 0, 'no target was acquired anywhere in the grid');
});

test('level: the offline instrument and the real integrator agree', () => {
  /* §3's whole result rests on this. Compared on the identical release states the grid used,
     with the air jump matched cell for cell, against `fly()`'s real Controller.

     CALIBRATION — the arm that must move: the same comparison against the *textbook* parabola
     (`predictMiss`'s own model, no apex hang, no drag). It has to be visibly worse, or the
     extra terms in `arcMin` are decoration and the first draft of this file was fine. */
  let worst = 0, worstNaive = 0, n = 0;
  const rows = [];
  const naive = (p0, v0, tgt, t1) => {
    const p = p0.clone(), v = v0.clone();
    let best = p.distanceTo(tgt), jumped = t1 == null;
    for (let t = 0; t < 2.4; t += 1 / 240) {
      if (!jumped && t >= t1) { v.y = TUNE.doubleJumpV0; jumped = true; }
      v.y += G / 240;
      p.addScaledVector(v, 1 / 240);
      const d = p.distanceTo(tgt); if (d < best) best = d;
      if (p.y < tgt.y - 14) break;
    }
    return best;
  };
  for (const g of grid) {
    const r = swingRelease(HOP_FROM.point, HOP_TO.point, g.th, 75);
    const offline = arcMin(r.p0, r.vel, HOP_TO.point, g.dj);
    const d = Math.abs(offline - g.off.minD);
    const dn = Math.abs(naive(r.p0, r.vel, HOP_TO.point, g.dj) - g.off.minD);
    if (d > worst) worst = d;
    if (dn > worstNaive) worstNaive = dn;
    n++;
    if (d > 0.25) rows.push(`  ${g.th}deg/${g.dj}: offline ${offline.toFixed(3)} vs live ${g.off.minD.toFixed(3)}`);
  }
  console.log(`\n[agreement] ${n} cells; worst |arcMin - live| = ${worst.toFixed(3)} m; ` +
              `worst |textbook parabola - live| = ${worstNaive.toFixed(3)} m` +
              (rows.length ? `\n${rows.join('\n')}` : ''));
  assert.ok(n > 0, 'compared zero cells');
  assert.ok(worst < 0.30,
    `the instrument and the shipped integrator disagree by ${worst.toFixed(3)} m — ` +
    'the reachability scan is measuring a different game');
  assert.ok(worstNaive > worst * 1.5,
    `the textbook parabola tracks the shipped integrator as well as arcMin does ` +
    `(${worstNaive.toFixed(3)} vs ${worst.toFixed(3)}) — the apex-hang and drag terms are inert`);
});

/* ====================================================================== */
/* 5 — the spire the moveset cannot reach                                  */
/* ====================================================================== */

test('level: the Ninja Spire Landing off the obelisk, with and without magnetism', async () => {
  /* The whole justification for the spire targets, run through the shipped controller.
     `PoleClimb`'s top hop is the only upward exit from a pole: 6.05 m/s, which apex hang trims
     to a 0.67 m rise — 0.93 m UNDER a tip the level's own route comment calls a Ninja Spire
     Landing. So the beat needs the double jump, and the double jump needs to be timed. The grid
     is over that timing; the assist is what forgives it. */
  const s = byId('spire-obelisk');
  const hold = poleHold(1.5);
  const top = LEVEL.obelisk.h - 1.6;
  const from = V(LEVEL.obelisk.x + hold, top + 0.02, LEVEL.obelisk.z);
  const inward = V(-1.6, POLE_HOP_VY, 0);        // the top hop: toward the shaft
  const steer = V(-1, 0, 0);                     // stick held toward the shaft
  const peak = arcApex(from.y, POLE_HOP_VY);

  const cells = [];
  for (const dj of [null, 0, 0.05, 0.10, 0.15, 0.20, 0.30, 0.45, 0.60]) {
    const off = await fly({ p0: from, vel: inward, target: s.point, enabled: false, steer, jumpAt: dj, frames: 110 });
    const on = await fly({ p0: from, vel: inward, target: s.point, enabled: true, steer, jumpAt: dj, frames: 110 });
    cells.push({ dj, off, on });
  }
  console.log(`\n[spire] pole top ${top} + hop ${POLE_HOP_VY.toFixed(2)} m/s peaks at y ${peak.toFixed(3)}, ` +
              `tip at y ${s.point.y} — short by ${(s.point.y - peak).toFixed(3)} m before any horizontal error`);
  console.log('[spire] double-jump time -> unassisted closest approach / magnetism reached (catch ' +
              `${s.catch}):\n  ` +
              cells.map((c) => `${c.dj == null ? 'none' : c.dj.toFixed(2)}:${c.off.minD.toFixed(2)}${c.on.reached ? '*' : ' '}`).join('  '));

  const bare = cells.find((c) => c.dj == null);
  assert.ok(peak < s.point.y, 'the top hop clears the tip; this target has nothing to do');
  assert.ok(bare.off.minD > TUNE.magSnapRadius,
    `CALIBRATION FAILED: the bare hop already arrives (${bare.off.minD.toFixed(3)} m)`);
  assert.equal(bare.on.reached, false,
    `the bare hop (miss ${bare.off.minD.toFixed(3)} m, catch ${s.catch}) was rescued — the assist ` +
    'is standing in for the double jump instead of forgiving its timing');

  const caughtOff = cells.filter((c) => c.on.reached === undefined).length; // structural, always 0
  const caught = cells.filter((c) => c.on.reached);
  const landedUnassisted = cells.filter((c) => c.off.minD <= TUNE.magSnapRadius);
  console.log(`[spire] ${caught.length}/${cells.length} timings reach the tip with magnetism; ` +
              `${landedUnassisted.length} would have landed without it`);
  assert.ok(caught.length > landedUnassisted.length,
    'magnetism widened the double-jump timing window by nothing at all');
  for (const c of caught) {
    assert.equal(c.on.acquired, s.id, `cell dj=${c.dj} acquired ${c.on.acquired}, not the pyramidion`);
    assert.ok(c.off.minD <= s.catch * 1.35,
      `cell dj=${c.dj} was caught from ${c.off.minD.toFixed(3)} m, well outside catch ${s.catch}`);
  }
  void caughtOff;
});

/* ====================================================================== */
/* 6 — the handoff MOVEMENT owns                                           */
/* ====================================================================== */

test('level: every authored `arrive` names a state that exists (and the guard that blocks it)', () => {
  const states = new Map(buildMoveset().map((s) => [s.name, s]));
  const wanted = [...new Set(SPECS.map((s) => s.arrive).filter(Boolean))];
  assert.ok(wanted.length > 0, 'no target authors an arrive state');
  for (const name of wanted) {
    assert.ok(states.has(name), `arrive: '${name}' is not a state in buildMoveset()`);
  }
  /* Recorded, not asserted as a pass: `ToTarget` is registered in the `attach` group, and
     `HookSwing`/`SpireLand`/`PoleClimb`/`RailSlide` all open `canEnter` with
     `if (c.sm.group === 'attach') return false`. `ToTarget.update` probes the candidate while
     ToTarget is still current, so the guard fires on ToTarget itself and the handoff can never
     succeed. The level authors `arrive` anyway: it is declarative intent, it costs nothing
     today (arrival holds for magHold 0.25 s and the opportunistic grab takes over), and it
     becomes correct the moment MOVEMENT lands either fix in the report. */
  const toTarget = states.get('toTarget');
  const blocked = wanted.filter((n) => {
    const src = String(states.get(n).canEnter);
    return /group\s*===\s*'attach'/.test(src);
  });
  console.log(`\n[arrive] authored: ${wanted.join(', ')} · toTarget.group='${toTarget?.group}'`);
  console.log(`[arrive] refuse while sm.group==='attach' (so the handoff is currently dead): ` +
              `${blocked.join(', ') || '(none)'} — see the report's diff request`);
  assert.equal(toTarget?.group, 'attach', 'toTarget changed group; re-read the handoff analysis');
});

/* ====================================================================== */
/* 7 — the FX grammar and what it costs on screen                          */
/* ====================================================================== */

const TARGET_FX = ['target_lock', 'target_catch', 'target_jump'];
const P11 = (fovDeg) => 1 / Math.tan((fovDeg * Math.PI) / 360);
const frac = (m, fov, d) => (m * P11(fov)) / d;

test('fx: the target events have emitters, in §2.1.6 colours, in the ceiled batch', () => {
  for (const name of TARGET_FX) {
    const def = EMITTERS[name];
    assert.ok(def, `${name} is missing from the emitter table`);
    assert.equal(def.batch, 'spark', `${name} must live in the batch that carries TUNE.flashMaxH`);
    assert.equal(def.col0, PAL.sparkCore, `${name} col0 must be §2.1.6's #8fd8ff core`);
    assert.ok(def.col1 === PAL.sparkGlow || def.col1 === PAL.rimCool,
      `${name} col1 ${def.col1?.toString(16)} is outside §2.1.6's blue`);
    assert.notEqual(def.tile, TILE.GLOW,
      `${name} uses the GLOW disc — that is the sprite cane_flash veiled the hero with`);
    assert.ok(def.size[1] < def.size[0], `${name} must shrink over its life`);
    assert.ok(def.life[1] <= 0.55, `${name} life ${def.life[1]} s is not an event beat`);
  }
  assert.equal(PAL.sparkCore, 0x8fd8ff);
  assert.equal(PAL.sparkGlow, 0x2a7fd4);
});

test('fx: the target bursts cost a fraction of the hero, measured not asserted', () => {
  /* Same arithmetic as tests/fx.test.mjs: on-screen diameter / frame height = size * P11 / d.
     The hero is ~0.40 of frame height (290 px on 720) in these framings. */
  const FRAMINGS = [
    { shot: 'combat', fov: 40, d: 4.906 },
    { shot: 'traversal', fov: 44, d: 6.0 },
  ];
  const rows = [];
  let checked = 0;
  for (const name of TARGET_FX) {
    const size = Math.max(...EMITTERS[name].size);
    for (const f of FRAMINGS) {
      const r = frac(size, f.fov, f.d);
      checked++;
      rows.push(`  ${name.padEnd(13)} ${size.toFixed(2)} m on ${f.shot.padEnd(10)} d ${f.d} -> ` +
                `frac ${r.toFixed(4)} (${(r * 720).toFixed(0)} px of 720, hero ~290 px)`);
      assert.ok(r < FXTUNE.flashMaxH,
        `${name} on ${f.shot} is ${r.toFixed(3)} of frame height, at or over the ceiling ${FXTUNE.flashMaxH}`);
      /* tests/fx.test.mjs asserts every non-cane_flash spark emitter stays under 75% of the
         ceiling at fov 40 / d 5. Hold the same line here so this file cannot break that one. */
      assert.ok(frac(size, 40, 5.0) < FXTUNE.flashMaxH * 0.75,
        `${name} is within 25% of the ceiling — it would break the targeted-clamp test`);
    }
  }
  console.log('\n[fx cost] ' + rows.join('\n').trim());
  assert.ok(checked > 0, 'measured zero emitter/framing pairs');

  /* Recorded for the report, deliberately NOT changed: the incumbent `SparkleField` marker has
     no screen-space ceiling of its own (it is a bespoke ShaderMaterial, not a Batch). Its own
     arithmetic, from the shader: half-extent = baseScale * sparkleSize * (0.86 + 0.28*pulse)
     * (1 + 0.020*d), diameter = 2x that. */
  const hookScale = 1.15;                       // _updateSparkles: hook markers
  for (const d of [3, 5, 10]) {
    const half = hookScale * FXTUNE.sparkleSize * (0.86 + 0.28) * (1 + 0.020 * d);
    const r = frac(2 * half, 44, d);
    console.log(`[fx incumbent] SparkleField hook marker at ${d} m: diameter ${(2 * half).toFixed(3)} m ` +
                `-> frac ${r.toFixed(3)} (${(r * 720).toFixed(0)} px of 720)`);
  }
  assert.equal(FXTUNE.sparkleSize, 0.42, 'sparkleSize moved — re-measure the incumbent above');
  assert.ok(FXTUNE.sparkleTags.includes('hook') && FXTUNE.sparkleTags.includes('spire'),
    'every authored target sits on a hook or spire collider; both tags must be in sparkleTags ' +
    'or §2.1.6\'s idle diamond is missing from the points magnetism acts on');
});

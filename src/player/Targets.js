import * as THREE from 'three';

/**
 * Targets — authored traversal magnetism. The mechanic this project had none of.
 *
 * Two halves, and the level-authoring half is the important one:
 *
 *   1. A **registry of authored traversal points**. A target is a designer-placed object with a
 *      trigger volume, a target point, a magnet strength, a jump multiplier and a group tag
 *      (`swing` / `pole` / `notch`). Level modules author them through
 *      `engine.emit('registerTarget', spec)` or `engine.get('movement').addTarget(spec)`; nothing
 *      in `src/world/**` has to import this file.
 *   2. A **homing law**. Once a target is assigned, MOVEMENT enters `toTarget` and is steered onto
 *      the point: horizontal pull, a distance-weakened upward assist, a hard yank at the last
 *      moment, a fall clamp, a positional snap, and a collision bypass at close range.
 *
 * Imported from `progress/records/IMPORT-slyrepos-movement.md` §2 — the structure is theirs, the
 * numbers are not. Upstream, the design is spread across three GDScript files in the fan-made
 * Godot project the import record names: `Scripts/target_point.gd` (the point itself — a
 * `is_selected` flag, `assign_player`/`unassign_player`, and a per-point `jump_mult`),
 * `Scripts/wall_notch.gd` (the authored *wall* hold: a sphere `Area3D` of `area_radius`, a
 * `magnet_force`, a `jump_mult`, an `auto_jump`) and `Scripts/thief_moves_wall_notch.gd` (the same
 * two knobs on a capsule volume). Each field below names the one it came from.
 *
 * **Licence: none stated** — verified in that repository's own tree at the commit surveyed, not
 * assumed: 720 files, no LICENSE, no COPYING, no NOTICE, no licence section, and no README at all.
 * It is a fan work derived from Sucker Punch / Sony's Sly Cooper. This is the same status recorded
 * in `public/assets/sly-godot/PROVENANCE.md`, and it is emphatically **not** the CC0 grant that
 * `assets/kaykit/` carries. Nothing here is a paste: the designs are re-expressed in this file's
 * own idiom and every constant is re-derived through `scaleFactors()` below.
 *
 * **Their constants do not transfer**: they run SPEED 4.0 / JUMP_VELOCITY 8.0
 * (~2 m apex), we run 7.2 / 11.0 with gravity −24 (2.52 m apex). Every imported constant is
 * re-derived through the dimensional scale factors in `scaleFactors()` and the arithmetic is
 * checked by `tests/targets.test.mjs` against `DERIVATION` below, so a number here cannot quietly
 * drift back into being a copy.
 *
 * The two details that stop this reading as a cheat, and the reason the law is worth importing
 * at all:
 *   · the upward assist **weakens with horizontal distance** (`magUpFalloff / (horiz + magUpFalloff)`),
 *     so it straightens a near-miss instead of dragging the player across a courtyard;
 *   · the capsule is **bypassed inside `magNoClip`** of a non-notch target, so the assist cannot
 *     die on a lip of geometry it was invoked precisely to get you over.
 *
 * And one rule that is ours alone: a target is only ever *assigned* if the player's current
 * ballistic arc already passes within `catch` of it (`predictMiss`). Magnetism corrects the timing
 * error the input layer already forgives — `runSpeed × jumpBufferMs` = 1.0 m — and nothing wider.
 * A jump aimed somewhere else stays aimed somewhere else. Without that gate this is an aimbot.
 *
 * TUNE lives in Controller.js (§5) and Controller.js imports this file, so — exactly as in
 * Moveset.js — nothing here may touch TUNE at module scope. Every reference is inside a function.
 */

/* ---- scratch. step() must allocate nothing (§5). ---- */
const _p0 = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();

/** Their constants, verbatim from the import record. Only ever read through `DERIVATION`. */
export const THEIRS = {
  speed: 4.0,          // SPEED
  jumpV0: 8.0,         // JUMP_VELOCITY
  apex: 2.0,           // "→ ~2 m", as recorded
  pullLerp: 0.2,       // velocity.xz lerp per 60 Hz physics frame
  yankLerp: 0.3,       // velocity.y lerp per 60 Hz physics frame, close and below
  upDrift: 2.0,        // their far up-assist target was `0.5 * SPEED` = 2.0 m/s
  upFalloff: 0.05,     // 0.05 / (horizDist + 0.05)
  yankGain: 8.0,       // dir.y × 8
  fallClamp: -6.5,
  snapRadius: 0.125,
  snapLerp: 0.2,       // 0.2 / (d + 0.2)
  noClip: 1.5,
  release: 2.0,
};

/**
 * Dimensional scale factors between their game and ours, measured from `TUNE` — never guessed.
 *
 * Their gravity was not recorded; their *outcome* was ("JUMP_VELOCITY 8.0 → ~2 m"), and that
 * pins it: g = v0²/2h = 16 m/s², air time 2v0/g = 1.00 s. Ours: g = 24, v0 = 11 → apex 2.52 m,
 * air time 0.917 s.
 *
 * The pay-off is that lengths fall out consistently instead of being chosen: kLh = kH·kT is the
 * ratio of full-speed jump *reach* (6.60 / 4.00) and kLv = kV·kT is the ratio of jump *apex*
 * (2.52 / 2.00), both computed two independent ways and both agreeing exactly. Our game is
 * stretched 1.65× horizontally and 1.26× vertically — which is why one uniform "scale" factor
 * would have been wrong for half these numbers.
 */
export function scaleFactors(tune) {
  const airTheirs = 2 * THEIRS.jumpV0 / (THEIRS.jumpV0 * THEIRS.jumpV0 / (2 * THEIRS.apex));
  const airOurs = 2 * tune.jumpV0 / -tune.gravity;
  const kH = tune.runSpeed / THEIRS.speed;      // horizontal speed   7.2/4.0  = 1.800
  const kV = tune.jumpV0 / THEIRS.jumpV0;       // vertical speed    11.0/8.0  = 1.375
  const kT = airOurs / airTheirs;               // time              0.917/1.0 = 0.917
  return { kH, kV, kT, kLh: kH * kT, kLv: kV * kT, airOurs, airTheirs };
}

/**
 * Every imported constant, its dimension, and what it becomes here. `tests/targets.test.mjs`
 * asserts TUNE matches this table — the derivation is executable, not a comment.
 * `dim`: h = horizontal speed · v = vertical speed · t = time · Lh/Lv = horizontal/vertical length
 * · f60 = a per-60 Hz-frame lerp factor converted to a time constant, then scaled by kT.
 */
export const DERIVATION = [
  { key: 'magPullSpeed',  from: 'speed',      dim: 'h',   note: 'pull toward the point at our own top run speed — theirs pulled at exactly SPEED' },
  { key: 'magPullTau',    from: 'pullLerp',   dim: 'f60', note: 'lerp 0.2/frame @60 Hz = τ 74.7 ms; our arcs are 8% shorter in time' },
  { key: 'magUpDrift',    from: 'upDrift',    dim: 'v',   note: '0.5×SPEED of theirs is 0.25×JUMP_VELOCITY; ours is 0.25×jumpV0' },
  { key: 'magUpDirGain',  from: 'one',        dim: 'v',   note: 'the bare dir.y term of their far assist, in our vertical velocity scale' },
  { key: 'magUpFalloff',  from: 'upFalloff',  dim: 'Lh',  note: 'THE non-obvious one: assist strength = k/(horiz+k), so it fades with distance' },
  { key: 'magYankGain',   from: 'yankGain',   dim: 'v',   note: 'their yank target was dir.y × JUMP_VELOCITY; ours is dir.y × jumpV0' },
  { key: 'magYankTau',    from: 'yankLerp',   dim: 'f60', note: 'lerp 0.3/frame @60 Hz = τ 46.7 ms' },
  { key: 'magFallClamp',  from: 'fallClamp',  dim: 'v',   note: 'you cannot fall past a target you are locked to' },
  { key: 'magSnapRadius', from: 'snapRadius', dim: 'Lh',  note: 'must exceed one frame of clamped fall — see magFallClamp' },
  { key: 'magSnapLerp',   from: 'snapLerp',   dim: 'Lh',  note: 'positional close-out, alpha = k/(d+k)' },
  { key: 'magNoClip',     from: 'noClip',     dim: 'Lh',  note: 'THE other non-obvious one: capsule off, so geometry cannot wedge the assist' },
  { key: 'magRelease',    from: 'release',    dim: 'Lv',  note: 'lands on 2.52 m — exactly our jump apex, i.e. "a target you can no longer reach"' },
  { key: 'magCurveDomain', from: 'jumpV0',    dim: 'v',   note: 'their jump curve sampled clamp(vy, ±8) = ±JUMP_VELOCITY' },
];

/** Resolve `DERIVATION` against a TUNE block. Returns { key: expectedValue }. */
export function derive(tune) {
  const k = scaleFactors(tune);
  const mul = { h: k.kH, v: k.kV, t: k.kT, Lh: k.kLh, Lv: k.kLv };
  const out = {};
  for (const d of DERIVATION) {
    const base = d.from === 'one' ? 1 : THEIRS[d.from];
    if (d.dim === 'f60') out[d.key] = (-(1 / 60) / Math.log(1 - base)) * k.kT;
    else out[d.key] = base * mul[d.dim];
  }
  return out;
}

/**
 * Target-jump curve (their `jump_mult_curve.sample_baked(clamp(velocity.y, -8, 8))`) — a curve,
 * not a constant, so the boost depends on how you arrived. Theirs was a baked Curve resource and
 * its shape was not recorded, so this one is authored: knots are **exit** velocities rather than
 * their impulses, because our per-target `jumpMult` has to multiply something with the units of a
 * launch. Arriving in freefall converts momentum into height (+18% at a full-speed slam); arriving
 * already rising gets nothing extra, which is what keeps a target from being a trampoline.
 */
export const JUMP_CURVE = { slam: 0.18, knots: 5 };

export function targetJumpExit(vy, tune) {
  const v0 = tune.jumpV0;
  const dom = tune.magCurveDomain;
  const x = Math.max(-dom, Math.min(dom, vy));
  const s = Math.max(0, Math.min(1, -x / dom));
  return v0 * (1 + JUMP_CURVE.slam * s * s);
}

/** The impulse actually added to velocity.y. Never negative — a target boosts or does nothing. */
export function targetJumpImpulse(vy, mult, tune) {
  return Math.max(0, targetJumpExit(vy, tune) * (mult || 1) - vy);
}

/**
 * Closest approach of the current ballistic arc to a point, over one jump's worth of flight.
 * Coarse scan then a local refine — 32 evaluations of a parabola, no allocation.
 *
 * This is the specificity gate. It is the difference between an assist and an aimbot: the arc
 * already has to be going there.
 */
export function predictMiss(pos, vel, T, g, horizon) {
  let best = Infinity, bestT = 0;
  const N = 24;
  const h = horizon / N;
  for (let i = 0; i <= N; i++) {
    const t = i * h;
    const x = pos.x + vel.x * t - T.x;
    const z = pos.z + vel.z * t - T.z;
    const y = pos.y + vel.y * t + 0.5 * g * t * t - T.y;
    const d2 = x * x + y * y + z * z;
    if (d2 < best) { best = d2; bestT = t; }
  }
  const lo = Math.max(0, bestT - h), hi = Math.min(horizon, bestT + h);
  const h2 = (hi - lo) / 8;
  for (let i = 0; i <= 8; i++) {
    const t = lo + i * h2;
    const x = pos.x + vel.x * t - T.x;
    const z = pos.z + vel.z * t - T.z;
    const y = pos.y + vel.y * t + 0.5 * g * t * t - T.y;
    const d2 = x * x + y * y + z * z;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/** Squared distance from a point to the segment a→b. Guards the snap against tunnelling. */
function segDist(ax, ay, az, bx, by, bz, T) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (l2 > 1e-12) {
    t = ((T.x - ax) * dx + (T.y - ay) * dy + (T.z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const px = ax + dx * t - T.x, py = ay + dy * t - T.y, pz = az + dz * t - T.z;
  return Math.sqrt(px * px + py * py + pz * pz);
}

let _nextId = 1;

/**
 * One authored traversal point. Everything except `point` has a default, so the minimum
 * authoring call is `addTarget({ point: new THREE.Vector3(x, y, z) })`.
 */
export class TargetPoint {
  constructor(spec = {}, tune) {
    const p = spec.point || spec.mesh?.userData?.point || spec.mesh?.position;
    this.id = spec.id ?? `target${_nextId++}`;
    this.point = new THREE.Vector3().copy(p || { x: 0, y: 0, z: 0 });
    /** Trigger volume: a sphere. Default is half a full-speed jump's reach. */
    this.volume = spec.volume ?? spec.radius ?? tune.magVolume;
    /** How wide a ballistic miss this point will still rescue. Default = the input layer's own
     *  forgiveness, `runSpeed × jumpBufferMs`. Widen it only for deliberately generous set-pieces. */
    this.catch = spec.catch ?? tune.magCatch;
    /** `wall_notch.gd`'s `magnet_force`: a multiplier on the horizontal pull. */
    this.magnet = spec.magnet ?? 1;
    /** `target_point.gd`/`wall_notch.gd`'s `jump_mult`: multiplies the exit velocity of a jump
     *  taken from this point. */
    this.jumpMult = spec.jumpMult ?? 1;
    /** `swing` | `pole` | `notch`. A notch keeps its collider (you are pressed into a wall) —
     *  the group exists because `wall_notch.gd`'s hold is a face you are held *against*, not a
     *  point you pass through, so `step()`'s `magNoClip` bypass must not apply to it. */
    this.group = spec.group || 'swing';
    /**
     * Optional state to hand off to on arrival.
     *
     * The reachable set is **whatever `canEnter` accepts when asked from `fall`** (or from `idle`
     * if Sly has grounded) — that is literally the probe `ToTarget.update` runs, and those two are
     * the states it falls back to when the handoff is declined. In the shipped moveset that means
     * `'hookSwing'`, `'poleClimb'`, `'railSlide'`, `'spireLand'`, `'ledgeHang'` and `'wallCling'`.
     *
     * The last two were unreachable *as a handoff* until the probe was fixed, and the shape of the
     * bug is worth keeping: both open `canEnter` with `if (c.grounded || c.sm.group !== 'air')`,
     * and the probe used to hide `ToTarget` behind a **null** current state, whose `sm.group` falls
     * back to `'ground'`. So they answered no unconditionally, every arrival, forever. It was not a
     * dead end — the opportunistic poll picked Sly up once the lock timed out — but it cost the
     * full `magHold`: **measured 35 frames from lock to `ledgeHang` against 20 after the fix, a
     * 15-frame / 0.25 s stall on every arrival at a ledge or notch point.** These are the two
     * states an authored *vertical* route is made of, which is why it mattered more than the count.
     *
     * A state named here still has to *want* the arrival. `'wallCling'` needs the stick pushed
     * into the face (`wishMag > 0.5`) and an unspent wall; `'ledgeHang'` needs a real lip under
     * `probeLedge`. A refused handoff is not an error — the arrival simply holds and releases.
     */
    this.arrive = spec.arrive || null;
    /** Magnetism is an air move; set true for a point that also pulls a grounded player. */
    this.fromGround = !!spec.fromGround;
    this.enabled = spec.enabled !== false;
    this.rec = spec.rec || null;
    this.mesh = spec.mesh || null;
    this.userData = spec.userData || null;
    this.cooldown = 0;
  }
}

/**
 * The registry plus the homing law. Owned by Controller; one per player.
 *
 * `status`: 'idle' → 'homing' → 'onTarget'. `target` is the current assignment (their `target`
 * variable); `locked` says the `toTarget` state has taken it up.
 */
export class TargetField {
  constructor(c) {
    this.c = c;
    this.list = [];
    this.target = null;
    this.locked = false;
    this.status = 'idle';
    this.bypass = false;
    this.time = 0;
    this.dist = Infinity;
    this.miss = Infinity;
    this.against = 0;         // seconds of sustained input away from the target
    this.enabled = true;
    this.lastRelease = '';
    /** Instrumentation for the headless harness and the debug overlay. */
    this.stats = { acquired: 0, reached: 0, released: 0 };
  }

  /* ---------------- authoring ---------------- */

  add(spec) {
    const t = spec instanceof TargetPoint ? spec : new TargetPoint(spec, this.c.tune());
    this.list.push(t);
    return t;
  }

  remove(t) {
    const id = t?.id ?? t;
    const i = this.list.findIndex((x) => x === t || x.id === id);
    if (i < 0) return false;
    if (this.target === this.list[i]) this.release('removed');
    this.list.splice(i, 1);
    return true;
  }

  clear() {
    this.release('cleared');
    this.list.length = 0;
  }

  /* ---------------- assignment ---------------- */

  /** Per-frame, before the state machine runs. Ticks cooldowns and assigns a target. */
  update(dt) {
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - dt);
    }
    if (this.locked || !this.enabled) return;
    if (this.target) { this.target = null; this.status = 'idle'; }
    this.acquire();
  }

  /**
   * Entering the trigger volume assigns a target — but only if the arc is already going there.
   * Best candidate = smallest predicted miss.
   */
  acquire() {
    const c = this.c;
    const T = c.tune();
    if (c.sm?.group === 'attach') return null;
    const g = T.gravity;
    const horizon = 2 * T.jumpV0 / -T.gravity;
    let best = null, bestMiss = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (!t.enabled || t.cooldown > 0) continue;
      if (c.grounded && !t.fromGround) continue;
      const d = c.position.distanceTo(t.point);
      if (d > t.volume) continue;
      const miss = predictMiss(c.position, c.velocity, t.point, g, horizon);
      if (miss > t.catch) continue;
      if (miss < bestMiss) { bestMiss = miss; best = t; }
    }
    if (!best) return null;
    this.target = best;
    this.miss = bestMiss;
    this.dist = c.position.distanceTo(best.point);
    return best;
  }

  /** Called by the `toTarget` state as it takes the assignment up. */
  lock() {
    if (!this.target) return false;
    this.locked = true;
    this.status = 'homing';
    this.time = 0;
    this.against = 0;
    this.stats.acquired++;
    this.c.engine.emit('targetLocked', { target: this.target, point: this.target.point, miss: this.miss });
    return true;
  }

  release(reason) {
    const t = this.target;
    if (!t) { this.locked = false; this.status = 'idle'; return; }
    // A cooldown, not a flag: the player is usually still inside the volume they just failed out
    // of, and re-assigning on the next frame is a lock-up rather than an assist.
    t.cooldown = this.c.tune().magCooldown;
    this.target = null;
    this.locked = false;
    this.status = 'idle';
    this.bypass = false;
    this.lastRelease = reason || '';
    this.stats.released++;
    this.c.engine.emit('targetReleased', { target: t, reason: this.lastRelease });
  }

  /* ---------------- the homing law ---------------- */

  /**
   * One homing step: steer, integrate, snap. Returns 'homing' | 'onTarget' | 'released'.
   *
   * Structure is theirs (IMPORT §2); every number is `magX` from TUNE, derived above.
   */
  step(dt) {
    const c = this.c;
    const T = c.tune();
    const t = this.target;
    if (!t) return 'released';
    this.time += dt;

    const P = t.point;
    const dx = P.x - c.position.x, dy = P.y - c.position.y, dz = P.z - c.position.z;
    const dist = Math.hypot(dx, dy, dz);
    const horiz = Math.hypot(dx, dz);
    this.dist = dist;

    /* ---- release conditions ---- */
    // dy is target − player, so dy > 0 means the point is above us: this fires when we have
    // fallen a full jump apex below it and are not coming back.
    if (dy > T.magRelease) { this.release('below'); return 'released'; }
    if (this.time > T.magMaxTime) { this.release('timeout'); return 'released'; }
    if (dist > t.volume * 1.35) { this.release('left'); return 'released'; }
    // Steering away is always allowed to break the lock — an assist the player cannot refuse is
    // the thing that reads as the game playing itself.
    if (c.wishMag > 0.5 && horiz > 1e-4 &&
        (c.wishDir.x * dx + c.wishDir.z * dz) / horiz < T.magBreakDot) {
      this.against += dt;
      if (this.against > T.magBreakTime) { this.release('steer'); return 'released'; }
    } else this.against = 0;

    const inv = dist > 1e-6 ? 1 / dist : 0;
    const ux = dx * inv, uy = dy * inv, uz = dz * inv;
    const v = c.velocity;

    /* Gravity first, exactly as every other air state has it (§6, apex hang and all). The assists
       below *lerp against* it rather than replacing it — that is what makes this an assist, and it
       is why a target you are above is simply fallen onto. */
    c.gravity(dt);

    /* ---- horizontal pull ---- */
    const pull = 1 - Math.exp(-dt / T.magPullTau);
    const pullSpeed = T.magPullSpeed * t.magnet;
    v.x += (ux * pullSpeed - v.x) * pull;
    v.z += (uz * pullSpeed - v.z) * pull;

    /* ---- upward assist. Only when the point is at or above us: below us, gravity is already
       doing the work and the fall clamp is what stops us going past it. ---- */
    if (dy > -T.magSnapRadius) {
      if (dist <= T.magNoClip) {
        // The last-moment yank. Capped at the velocity that just reaches the point's height with
        // a 15% margin: at our gravity an uncapped dir.y×jumpV0 launches 2 m past a 0.3 m rise.
        let want = uy * T.magYankGain;
        const need = Math.sqrt(2 * -T.gravity * Math.max(0, dy)) * T.magYankCap;
        if (T.magYankCap > 0 && want > need) want = need;
        const a = 1 - Math.exp(-dt / T.magYankTau);
        v.y += (want - v.y) * a;
      } else {
        // Weakens with horizontal distance — this is the line that makes it an assist.
        const a60 = T.magUpFalloff / (horiz + T.magUpFalloff);
        const a = 1 - Math.pow(1 - a60, 60 * dt);
        v.y += (uy * T.magUpDirGain + T.magUpDrift - v.y) * a;
      }
    }

    if (v.y < T.magFallClamp) v.y = T.magFallClamp;

    /* ---- integrate. Inside magNoClip of a non-notch target the capsule is bypassed. ---- */
    this.bypass = dist <= T.magNoClip && t.group !== 'notch';
    _p0.copy(c.position);
    if (this.bypass) c.moveNoClip(dt);
    else c.move(dt);

    /* ---- perfect snap. Tested against the segment travelled, not the end point: at 30 fps a
       clamped fall covers 0.30 m and the snap radius is 0.21 m, so a point test tunnels. ---- */
    const near = segDist(_p0.x, _p0.y, _p0.z, c.position.x, c.position.y, c.position.z, P);
    if (near <= T.magSnapRadius) {
      v.set(0, 0, 0);
      _rel.subVectors(P, c.position);
      const d = _rel.length();
      if (d < 0.02) c.position.copy(P);
      else {
        const a60 = T.magSnapLerp / (d + T.magSnapLerp);
        c.position.addScaledVector(_rel, 1 - Math.pow(1 - a60, 60 * dt));
      }
      if (this.status !== 'onTarget') {
        this.status = 'onTarget';
        this.stats.reached++;
        c.engine.emit('targetReached', { target: t, point: P, group: t.group });
      }
      return 'onTarget';
    }
    this.status = 'homing';
    return 'homing';
  }

  /** A jump taken from a point Sly is locked to. Consumes the target. */
  takeJump() {
    const c = this.c;
    const T = c.tune();
    const t = this.target;
    if (!t) return 0;
    const imp = targetJumpImpulse(c.velocity.y, t.jumpMult, T);
    c.velocity.y += imp;
    c.grounded = false;
    c.coyote = 99;
    this.release('jumped');
    return imp;
  }
}

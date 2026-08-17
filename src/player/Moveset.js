import * as THREE from 'three';
import { State } from './States.js';
import { TUNE } from './Controller.js';

/**
 * Moveset — one class per move in AGENTS.md §6. Each move owns its own rules and nothing else's.
 *
 * Reading order: ground locomotion, then air, then the attached moves (hook / rail / pole /
 * spire / ledge), then combat. Priorities are declared in buildMoveset() at the bottom so the
 * whole ladder can be read in one screen.
 *
 * NOTE ON THE IMPORT: TUNE lives in Controller.js (§5 wants one block at the top of that file),
 * and Controller.js imports this module — a cycle. So nothing here may touch TUNE at module
 * scope; every reference is inside a method, by which time the binding is live.
 */

/* ---- scratch. Shared with nothing; still module-scope so update() allocates nothing. ---- */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _pt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Signed 2D dot of two XZ directions. */
function dot2(ax, az, bx, bz) { return ax * bx + az * bz; }

/** Horizontal unit direction of travel, falling back to intent then facing. */
function travelDir(c, out) {
  const v = c.velocity;
  let x = v.x, z = v.z;
  if (Math.hypot(x, z) < 0.5) { x = c.wishDir.x; z = c.wishDir.z; }
  if (Math.hypot(x, z) < 1e-4) { x = c.faceDir.x; z = c.faceDir.z; }
  const l = Math.hypot(x, z) || 1;
  return out.set(x / l, 0, z / l);
}

/* ====================================================================== */
/* ground locomotion                                                       */
/* ====================================================================== */

class Idle extends State {
  enter(c) { this._bored = 0; }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    this._bored += dt;
    // Idle variation: ANIMATION owns the look, but the *choice* of what Sly is doing is a
    // gameplay statement, so it lives here.
    c.baseClip(this._bored > 13 ? 'idle_look' : this._bored > 6 ? 'idle_bored' : 'idle_confident', 0.3);
    c.accelerate(dt, 0, TUNE.accel, TUNE.decel);
    c.gravity(dt);
    c.move(dt);
    return null;
  }
}

class Move extends State {
  canEnter(c) { return c.grounded && c.wishMag > 0.12; }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    if (c.wishMag < 0.08 && c.speedXZ() < 0.35) return 'idle';
    c.turnToward(c.wishDir, TUNE.turnGround, dt);
    // Keyboard has no analogue ramp, so the run is the target and §6's walk speed is the
    // blend point ANIMATION crosses on the way there — you feel the walk during accel.
    c.accelerate(dt, TUNE.runSpeed, TUNE.accel, TUNE.decel);
    c.gravity(dt);
    c.move(dt);
    const sp = c.speedXZ();
    c.baseClip(sp < 3.4 ? 'walk' : sp < 6.3 ? 'run' : 'run_fast', 0.16);
    return null;
  }
}

class Sneak extends State {
  canEnter(c) { return c.grounded && c.down('sneak'); }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    if (!c.down('sneak')) return c.wishMag > 0.12 ? 'move' : 'idle';
    if (c.wishMag > 0.12) c.turnToward(c.wishDir, TUNE.turnGround * 0.8, dt);
    c.accelerate(dt, TUNE.sneakSpeed, TUNE.accel * 0.6, TUNE.decel);
    c.gravity(dt);
    c.move(dt);
    c.baseClip(c.speedXZ() > 0.25 ? 'sneak_walk' : 'sneak_idle', 0.2);
    return null;
  }
}

class Crouch extends State {
  canEnter(c) { return c.grounded && c.down('crouch'); }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    if (!c.down('crouch')) return c.wishMag > 0.12 ? 'move' : 'idle';
    if (c.wishMag > 0.12) c.turnToward(c.wishDir, TUNE.turnGround * 0.7, dt);
    c.accelerate(dt, TUNE.crouchSpeed, TUNE.accel * 0.55, TUNE.decel);
    c.gravity(dt);
    c.move(dt);
    c.baseClip(c.speedXZ() > 0.2 ? 'crouch_walk' : 'crouch_idle', 0.2);
    return null;
  }
}

/** Ctrl tapped at speed. Fast, brief, and it keeps the momentum — a repositioning tool. */
class Roll extends State {
  canEnter(c) { return c.grounded && c.pressed('crouch') && c.speedXZ() > 3.4; }
  enter(c) {
    c.oneShot('roll');
    travelDir(c, _a);
    if (c.wishMag > 0.4) _a.copy(c.wishDir);
    c.yaw = Math.atan2(_a.x, _a.z);
    c.velocity.x = _a.x * TUNE.rollSpeed;
    c.velocity.z = _a.z * TUNE.rollSpeed;
  }
  update(c, dt) {
    /* Roll-cancel into a jump. Roll is priority 70 — above `DoubleJump` 66 and `Jump` 64 — so
       nothing can preempt it, and this method polled everything EXCEPT jump. Measured on the
       shipped moveset: the roll runs 0.44 s, and a jump pressed 6 or 15 frames in was silently
       dropped, because the 140 ms buffer expires inside the roll; only a press in the last
       ~8 frames survived to fire at the exit. A dropped input is a bug, not a difficulty
       choice, and roll-cancel is standard vocabulary for this character.

       Same shape `WallRun`, `WallCling` and `LedgeHang` already use (:398, :446, :523). The
       returned name forces the transition — `request()` does not consult `canEnter`, and
       `set()` is an unconditional switch — so `Jump.canEnter`'s `jumpBuffered()` clause is
       bypassed on a fresh press, which is the intent: `Jump.enter` calls `takeJump()` (a no-op
       on an empty buffer) and then launches. `c.grounded` is the guard that matters, since
       `canGroundJump()` is `grounded || coyote` and Roll's group is `ground`, never `attach`. */
    if (c.grounded && (c.pressed('jump') || c.jumpBuffered())) return 'jump';
    if (c.wishMag > 0.2) c.turnToward(c.wishDir, TUNE.rollTurn, dt);
    _a.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const k = 1 - c.sm.time / TUNE.rollTime;
    const sp = TUNE.walkSpeed + (TUNE.rollSpeed - TUNE.walkSpeed) * Math.max(0, k);
    c.velocity.x = _a.x * sp;
    c.velocity.z = _a.z * sp;
    c.gravity(dt);
    c.move(dt);
    if (!c.grounded && c.coyote > TUNE.coyote) return 'fall';
    if (c.sm.time >= TUNE.rollTime) return c.wishMag > 0.12 ? 'move' : 'idle';
    return null;
  }
}

/** Turn-around snap: a hard reversal at speed skids instead of pivoting on the spot. */
class Skid extends State {
  canEnter(c) {
    if (!c.grounded || c.wishMag < 0.35) return false;
    const v = c.velocity;
    const sp = Math.hypot(v.x, v.z);
    if (sp < TUNE.skidSpeed) return false;
    return dot2(c.wishDir.x, c.wishDir.z, v.x / sp, v.z / sp) < TUNE.skidDot;
  }
  enter(c) { c.oneShot('skid_stop'); this._target = Math.atan2(c.wishDir.x, c.wishDir.z); }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    if (c.wishMag > 0.3) this._target = Math.atan2(c.wishDir.x, c.wishDir.z);
    c.turnToYaw(this._target, TUNE.turnGround * 0.5, dt);
    c.accelerate(dt, 0, TUNE.accel, TUNE.skidDecel);
    c.gravity(dt);
    c.move(dt);
    if (c.sm.time > TUNE.skidMin && (c.speedXZ() < 1.7 || c.sm.time > 0.42)) {
      return c.wishMag > 0.12 ? 'move' : 'idle';
    }
    return null;
  }
}

/** Landing beat. ANIMATION owns the squash (§6, 0.82 over 90 ms); MOVEMENT just says "land". */
class Land extends State {
  canEnter(c) { return c.grounded && c.landImpact > TUNE.landBeat && c._frame - c._landFrame <= 2; }
  enter(c) {
    const f = c.landImpact;
    c.landImpact = 0;
    const rolling = c.down('crouch') && c.speedXZ() > 3.0;
    /**
     * TWO terms, not one (§502). `landHard` is the speed floor; `_airControlled` is how the fall
     * began. A hard landing is a fast arrival out of a descent the player did NOT choose — lost a
     * grip, was knocked off, fell out of a traversal beat. Walking or jumping off an edge is a
     * departure he made, at any height, so it stays soft however fast it arrives.
     *
     * Speed alone could not do this: §500 measured the median walk-off on the shipped level at
     * 17.200 m/s against a threshold of 15.0, and §501 showed the two populations are the same act
     * at different heights. `landBeat` is untouched — every landing still speaks (§443.1).
     */
    const hard = f >= TUNE.landHard && !c._airControlled;
    this._t = rolling ? 0.24 : hard ? TUNE.landHardTime : TUNE.landSoftTime;
    c.oneShot(rolling ? 'land_roll' : hard ? 'land_hard' : 'land_soft');
    if (hard) {
      c.engine.emit('shake', Math.min(0.3, f * 0.018));
      c.anim?.addImpulse?.({ bone: 'root', dir: DOWN, strength: Math.min(1, f / 18), decay: 9 });
    }
    c.engine.emit('landed', { pos: c.position, force: f, surface: c.groundMaterial });
  }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    // Steering stays live through the landing — a landing that locks input feels broken.
    c.accelerate(dt, TUNE.walkSpeed * c.wishMag, TUNE.accel * 0.7, TUNE.decel * 1.4);
    if (c.wishMag > 0.2) c.turnToward(c.wishDir, TUNE.turnGround * 0.6, dt);
    c.gravity(dt);
    c.move(dt);
    if (c.sm.time >= this._t) return c.wishMag > 0.12 ? 'move' : 'idle';
    return null;
  }
}

/** Tiptoe on narrow ledges (§4.4): slow, deliberate, with a balance sway. */
class Tiptoe extends State {
  canEnter(c) {
    if (!c.grounded || c.groundTag === 'rail') return false;
    if (c.groundTag !== 'ledge' && c.groundTag !== 'ground') return false;
    return c.narrowGround();
  }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    if (!c.narrowGround()) return c.wishMag > 0.12 ? 'move' : 'idle';
    if (c.wishMag > 0.15) c.turnToward(c.wishDir, TUNE.turnGround * 0.55, dt);
    c.accelerate(dt, TUNE.tiptoeSpeed, TUNE.accel * 0.5, TUNE.decel);
    c.gravity(dt);
    c.move(dt);
    c.balance = Math.sin(c.engine.time * 3.1) * TUNE.railSway * 0.75;
    c.baseClip(c.speedXZ() > 0.2 ? 'sneak_walk' : 'balance_idle', 0.22);
    return null;
  }
  exit(c) { c.balance = 0; }
}

/** Crawl (§6) — vents only, and the vent decides, not the player. */
class Crawl extends State {
  canEnter(c) { return c.inVent(); }
  update(c, dt) {
    if (!c.inVent()) return c.grounded ? 'idle' : 'fall';
    if (c.wishMag > 0.15) c.turnToward(c.wishDir, TUNE.turnGround * 0.6, dt);
    c.accelerate(dt, TUNE.crawlSpeed, TUNE.accel * 0.5, TUNE.decel);
    c.gravity(dt);
    c.move(dt);
    c.baseClip('crawl', 0.2);
    return null;
  }
}

/* ====================================================================== */
/* air                                                                     */
/* ====================================================================== */

/** Shared air behaviour: jump cut, air control, gravity, assist, land handoff. */
class AirState extends State {
  air(c, dt, gravityScale = 1) {
    c.applyJumpCut();
    c.turnToward(c.wishDir, TUNE.turnAir, dt);
    c.accelerate(dt, TUNE.runSpeed, TUNE.accel * TUNE.airControl, TUNE.airDrag);
    c.gravity(dt, gravityScale);
    if (c.velocity.y < 0) c.ledgeAssist();
    c.move(dt);
  }
  landed(c) {
    if (!c.grounded) return null;
    return c.landImpact > TUNE.landBeat ? 'land' : c.wishMag > 0.12 ? 'move' : 'idle';
  }
}

class Fall extends AirState {
  canEnter(c) { return !c.grounded && c.sm.group === 'ground'; }
  update(c, dt) {
    this.air(c, dt);
    const l = this.landed(c); if (l) return l;
    const vy = c.velocity.y;
    c.baseClip(Math.abs(vy) < TUNE.apexWindow ? 'jump_apex' : 'jump_fall', 0.14);
    return null;
  }
}

class Jump extends AirState {
  /** Coyote time + jump buffer (§6) both live in this one predicate. */
  canEnter(c) { return c.canGroundJump() && c.sm.group !== 'attach' && c.jumpBuffered(); }
  enter(c) {
    c.takeJump();
    const v0 = c.pendingLaunch > 0 ? c.pendingLaunch : TUNE.jumpV0;
    c.pendingLaunch = 0;
    c.launch(v0);
    c.oneShot('jump_rise');
    c.engine.emit('jumped', { pos: c.position, v0 });
  }
  update(c, dt) {
    this.air(c, dt);
    const l = this.landed(c); if (l) return l;
    if (c.velocity.y <= 0) return 'fall';
    c.baseClip('jump_rise', 0.1);
    return null;
  }
}

/** Double jump — the cane twirl. Also a redirect: it re-aims momentum at the new stick dir. */
class DoubleJump extends AirState {
  canEnter(c) {
    return !c.grounded && c.sm.group === 'air' && c.airJumps > 0
        && !c.canGroundJump() && c.jumpBuffered();
  }
  enter(c) {
    c.takeJump();
    c.airJumps--;
    if (c.wishMag > 0.3) {
      // Twirling redirects rather than merely adding height; that is what makes the double
      // jump a *correction* tool and why players forgive a badly aimed first jump.
      const sp = Math.max(3.2, c.speedXZ() * 0.92);
      c.velocity.x = c.wishDir.x * sp;
      c.velocity.z = c.wishDir.z * sp;
      c.turnToward(c.wishDir, 999, 1);
    }
    c.launch(TUNE.doubleJumpV0);
    c.oneShot('double_jump');
    c.engine.emit('doubleJump', { pos: c.position });
  }
  update(c, dt) {
    this.air(c, dt);
    const l = this.landed(c); if (l) return l;
    if (c.velocity.y <= 0) return 'fall';
    c.baseClip('double_jump', 0.1);
    return null;
  }
}

class Paraglide extends AirState {
  canEnter(c) {
    return !c.grounded && c.sm.group === 'air' && c.down('glide')
        && c.velocity.y < 0.8 && c.airTime > 0.10;
  }
  enter(c) { c.oneShot('paraglide', 1, 0.16); c.engine.emit('paraglide', true); }
  exit(c) { c.engine.emit('paraglide', false); }
  update(c, dt) {
    if (!c.down('glide')) return 'fall';
    c.turnToward(c.wishDir, TUNE.turnAir * 1.3, dt);
    c.accelerate(dt, TUNE.glideSpeed, TUNE.glideAccel, TUNE.airDrag * 2);
    c.gravity(dt, TUNE.glideGravity);
    if (c.velocity.y < TUNE.glideFall) c.velocity.y = TUNE.glideFall;
    c.ledgeAssist();
    c.move(dt);
    const l = this.landed(c); if (l) return l;
    c.baseClip('paraglide', 0.18);
    return null;
  }
}

/** Cane Slam (§6): straight down at 18 m/s, 1.2 m impact, 0.35 shake. */
class DiveAttack extends AirState {
  canEnter(c) { return !c.grounded && c.sm.group === 'air' && c.pressed('attack'); }
  enter(c) {
    c.oneShot('dive_attack');
    c.velocity.x *= 0.3;
    c.velocity.z *= 0.3;
    c.velocity.y = -TUNE.diveSpeed;
  }
  update(c, dt) {
    c.velocity.y = Math.min(c.velocity.y, -TUNE.diveSpeed);
    c.move(dt);
    if (c.grounded) {
      c.oneShot('dive_impact');
      c.engine.emit('shake', TUNE.diveShake);
      c.engine.emit('caneSlam', { pos: c.position, radius: TUNE.diveRadius, material: c.groundMaterial });
      c.anim?.addImpulse?.({ bone: 'root', dir: DOWN, strength: 1, decay: 8 });
      c.landImpact = 0;
      return 'idle';
    }
    c.baseClip('dive_attack', 0.08);
    return null;
  }
}

/** Enemy bounce. GUARDS calls movement.bounce() or emits 'enemyBounce'. */
class Bounce extends AirState {
  constructor(n, o) { super(n, o); }
  enter(c) {
    c.launch(c._bounceReq || TUNE.jumpV0 * TUNE.bounceUp);
    c._bounceReq = 0;
    c.airJumps = 1;             // a bounce refreshes the double jump — chains read as skill
    c.freeWall();               // …and the walls, for the same reason: a head is a fresh contact
    c.oneShot('double_jump');
    c.engine.emit('shake', 0.1);
  }
  update(c, dt) {
    this.air(c, dt);
    const l = this.landed(c); if (l) return l;
    if (c.velocity.y <= 0) return 'fall';
    return null;
  }
}

/* ====================================================================== */
/* wall tech                                                               */
/* ====================================================================== */

class WallRun extends State {
  canEnter(c) {
    if (c.grounded || c.sm.group !== 'air') return false;
    if (c.wallRunUsed >= 2 || c.velocity.y < -11) return false;
    if (c.speedXZ() < TUNE.wallRunEnter) return false;
    travelDir(c, _a);
    if (c.probeWall(_a).ok && !c.wallSpent(c.wall.rec, c.wall.nx, c.wall.nz)) return true;
    if (c.wishMag > 0.5 && c.probeWall(c.wishDir).ok
        && !c.wallSpent(c.wall.rec, c.wall.nx, c.wall.nz)) return true;
    return false;
  }
  enter(c) {
    const w = c.wall;
    this._nx = w.nx; this._nz = w.nz;
    c.wallRunUsed++;
    c.markWall(w.rec, w.nx, w.nz);
    travelDir(c, _a);
    // Head-on means "up"; glancing means "along". Both are Sly; the entry angle picks.
    const headOn = -dot2(_a.x, _a.z, this._nx, this._nz);
    this._vertical = headOn > 0.72;
    // Tangent along the wall: up × normal, signed toward the direction of travel.
    _b.set(0, 1, 0).cross(_c3.set(this._nx, 0, this._nz)).normalize();
    this._sign = dot2(_b.x, _b.z, _a.x, _a.z) >= 0 ? 1 : -1;
    this._tx = _b.x * this._sign; this._tz = _b.z * this._sign;
    /* Wall on the left or the right, for the clip. `_d` is Sly's RIGHT — `faceDir × up`, the
       same definition `Controller._readInput` strafes on — and `w.n` points OUT of the face,
       from the wall toward Sly, so the wall lies along `-n` and is on his right exactly when
       `n · right < 0`.

       This was `(cos yaw, 0, -sin yaw)`, which is his LEFT, so every non-degenerate wall run
       played the mirrored clip: measured 26/26 mismatched across a yaw × normal sweep and in two
       driven approaches at 55° and 70° off the face. `Clips.js` names what that costs — "wall on
       his LEFT… the inside (left) hand slaps along the stone" — so Sly banked away from the wall
       he was running on and slapped empty air. A head-on approach has `n · right` ≈ 0 and no side
       either way; only glancing runs could ever show it. See `tests/traversal.test.mjs`. */
    _d.set(-Math.cos(c.yaw), 0, Math.sin(c.yaw));
    this._side = dot2(this._nx, this._nz, _d.x, _d.z) < 0 ? 'r' : 'l';
    if (this._vertical) c.velocity.y = Math.max(c.velocity.y, TUNE.wallRunUp);
    c.oneShot(`wall_run_${this._side}`);
    c.engine.emit('wallRun', { pos: c.position, normal: _c3, material: w.rec?.material });
  }
  update(c, dt) {
    if (c.pressed('jump') || c.jumpBuffered()) { c.wall.nx = this._nx; c.wall.nz = this._nz; return 'wallJump'; }
    if (c.sm.time > TUNE.wallRunMax) {
      return (c.wishMag > 0.45 && -dot2(c.wishDir.x, c.wishDir.z, this._nx, this._nz) > 0.3)
        ? 'wallCling' : 'fall';
    }
    // Keep contact: press gently into the wall and re-probe so a corner ends the run cleanly.
    _a.set(-this._nx, 0, -this._nz);
    if (!c.probeWall(_a).ok) return 'fall';
    this._nx = c.wall.nx; this._nz = c.wall.nz;

    if (this._vertical) {
      c.velocity.x = -this._nx * 1.2;
      c.velocity.z = -this._nz * 1.2;
      c.gravity(dt, TUNE.wallRunGravity);
      if (c.velocity.y < 0.4) return 'wallCling';
    } else {
      c.velocity.x = this._tx * TUNE.wallRunSpeed - this._nx * 0.8;
      c.velocity.z = this._tz * TUNE.wallRunSpeed - this._nz * 0.8;
      c.gravity(dt, TUNE.wallRunGravity);
    }
    c.turnToYaw(Math.atan2(this._vertical ? -this._nx : this._tx, this._vertical ? -this._nz : this._tz), 12, dt);
    c.move(dt);
    if (c.grounded) return c.wishMag > 0.12 ? 'move' : 'idle';
    if (c.hitCeiling) return 'fall';
    c.baseClip(`wall_run_${this._side}`, 0.1);
    return null;
  }
}

/**
 * WallClimb — the sustained vertical route, on AUTHORED holds and nothing else.
 *
 * §357.2 declined this move "for the want of a tag that distinguishes a handhold from a blank
 * wall". WORLD landed the tag (`EgyptLevel.notchLadder`, 19 rungs up the east entry pylon's two
 * south flagstaff niches, y 2.100…21.000) and left it inert: nothing in `src/player/**` read
 * `rec.handholds`. This reads it.
 *
 * ── What it is ────────────────────────────────────────────────────────────────────────────
 * A hold state, not a climb-anywhere state. Sly catches an authored rung, hangs on it, and
 * jump takes him **straight up the face** at `jumpV0 × wallJumpUp` = 10.34 m/s — the exact
 * launch WORLD derived the 2.10 m rung pitch from. The ladder is therefore a chain of plain
 * wall jumps between authored points, and its ceiling is the top rung, not the player's
 * patience. `find()` returns null on all 74 other `wall` recs in the level, so on every surface
 * WORLD did not ladder this state cannot fire at all.
 *
 * ── It does NOT defeat `wallSpent`, and this is the part to read ──────────────────────────
 * The trap WORLD refused to walk into (their words: a rung-rec would be "a *different* rec from
 * the pylon face, so `wallSpent`'s one-face-one-bite would not fire and the level would have
 * shipped a de-facto free climb up 21 m") is closed here from the other side, in two decisions
 * that are deliberately the opposite of the brief I was handed:
 *
 *   · **`enter` calls `markWall`, not `freeWall`.** I was asked for `freeWall()`. `freeWall`
 *     hands the blank face back, which would let a rung pay for a `wallCling` on bare stone
 *     between rungs — the §357.1 loop with an authored first step. Marking instead means
 *     catching a rung *spends* the face: `WallRun.canEnter` and `WallCling.canEnter` both poll
 *     `wallSpent` and both then refuse it for the rest of the airborne period. The only way up
 *     a laddered face is the ladder.
 *   · **`group: 'air'`, not `'attach'`.** Forced by the above: `Controller.onStateChanged` runs
 *     `if (next.group === 'attach') this.freeWall()` *after* `enter`, so an attach-group climb
 *     would have its own `markWall` undone one line later by the machine. 'air' also matches
 *     its two neighbours in the ladder, `wallRun` 80 and `wallCling` 78.
 *
 * The net is strictly tighter than what shipped: before this state, the pylon's south face was
 * worth one wall run plus one cling; after it, taking a rung costs you both.
 *
 * ── The pitch contract, and the one number in it that I moved ─────────────────────────────
 * WORLD derived `pitch` 2.10 against `WallCling.canEnter`'s `velocity.y > 1.2` gate, which a
 * 10.34 m/s launch crosses at 2.1974 m. **This state does not use that gate**, and the honest
 * consequence has to be stated rather than inherited: at the rung itself, 2.10 m up, a 10.34
 * launch is still travelling `√(10.34² − 2·24·2.10)` = **2.473 m/s**, so a cling-gated catch
 * would have refused every rung on the way up and only taken it falling back. The binding
 * constraint for a hold state is the **apex, 2.2274 m**, not the cling gate — 2.10 m clears it
 * by 0.1274 m rather than by 0.0974 m. WORLD's number stays correct under both readings, which
 * is why it needed no change; what changed is which inequality it is correct *against*.
 * `tests/traversal.test.mjs` asserts the apex form directly off `TUNE`.
 *
 * ── Reference ─────────────────────────────────────────────────────────────────────────────
 * `Scripts/wall_notch.gd` (NoahChase/Sly-Cooper--A-Thief-in-Godot, HEAD 6479957 at
 * /home/user/ref-godot; **licence: none stated** — no LICENSE, no COPYING, no licence section,
 * no README, verified in that tree, fan work derived from Sucker Punch/Sony). Adapted, never
 * pasted, and only one behaviour is taken: their notch commits on `elif player.direction:` —
 * a hold acts when the player is *steering into it*, never on mere proximity. That is the
 * `wishMag`/facing gate below, and it is why flying past the pylon does not snag you. Their
 * `magnet_force` pull and `auto_jump` are deliberately not taken: we have `Targets.js` for
 * assistance and an auto-jump would make the ladder play itself.
 */
class WallClimb extends State {
  constructor(n, o) {
    super(n, o);
    this._hold = null;      // the rung being held
    this._pick = null;      // what `canEnter` found, handed to `enter`
    this._left = null;      // the rung just released — see `spent()`
    this._line = null;      // the ladder this ascent is committed to — see `find()`
  }

  /**
   * Reach around the hand. Derived, not chosen: a hold must not be able to pass between two
   * frames of the fastest approach this state can produce. That approach is its own launch,
   * 10.34 m/s, and the slowest frame rate this file reasons about elsewhere is 30 fps, so the
   * worst single-frame step is 0.345 m; `TUNE.radius` 0.34 covers the capsule's own standoff
   * from the face plane the hold is published on. 0.685 m total, against a 2.10 m pitch — it
   * cannot span two rungs, and the two niches are 6.8 m apart laterally.
   */
  reach() { return TUNE.radius + TUNE.jumpV0 * TUNE.wallJumpUp / 30; }

  /**
   * The rung just released, refused until Sly is clear of it — the same guard `HookSwing.spent`
   * carries, for the same reason and designed in this time rather than measured out. A launch
   * starts *at* the hold it leaves, so without this the first frame of the ascent re-catches the
   * rung it just left and the ladder is a hover. Cleared once out of reach, so a mistimed jump
   * that falls back onto the same rung is a recovery rather than a 21 m drop.
   */
  spent(h, handY, c, R) {
    if (this._left !== h) return false;
    const p = h.point;
    const d = Math.hypot(p.x - c.position.x, p.y - handY, p.z - c.position.z);
    if (d > R) { this._left = null; return false; }
    return true;
  }

  /**
   * Are two holds rungs of the SAME ladder? Purely geometric, so it needs no id convention and
   * survives a level that names its holds differently.
   *
   * Lateral separation under half a pitch. The numbers on the shipped pylon say that separates
   * cleanly with an order of magnitude to spare: consecutive rungs of one ladder drift
   * horizontally by 0.259 m (0.136 m of `masonryShell` opening scale plus 0.221 m of
   * `proxyBattered` batter over one 2.10 m rise), while the two authored ladders are 3.5 m apart
   * at their closest. Half-pitch is 1.05 m — four times the intra-ladder drift, a third of the
   * inter-ladder gap.
   */
  sameLine(a, b) {
    if (!a || !b) return false;
    const p = a.pitch || b.pitch || 0;
    if (!(p > 0)) return false;
    return Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z) < p * 0.5;
  }

  /**
   * Nearest takeable rung on the wall `w`, or null. Null on every un-laddered rec in the game.
   *
   * **"Nearest" is not enough once a face carries two ladders**, which is the case today — all
   * 23 of the level's holds sit on ONE rec, in two staggered lines half a pitch apart in height.
   * Plain nearest-by-distance lets an ascent zig-zag between the two lines, which is a route the
   * designer did not author and which reads as the climb wandering. So the rule is:
   *
   *     prefer the nearest reachable rung ON THE LINE SLY IS ALREADY CLIMBING;
   *     fall back to the nearest reachable rung anywhere only when that line has run out.
   *
   * Committing to a line is what makes it a route, and stepping across when your line ends is
   * what stops the commitment becoming a dead end. The reference reaches for the same idea from
   * the other direction — `wall_notch.gd` gates its chain on `player.last_target != target_point`
   * — but keys it on object identity, which cannot express "the next rung up the same niche".
   *
   * Only the rec `probeWall` actually resolved is searched, and that is deliberate: `enter`
   * marks THAT rec, so taking a hold from a neighbouring rec would spend the wrong face and put
   * `wallSpent` out of step with what Sly is holding. The cost is a stated authoring contract —
   * **one ladder must live on one rec** — which `tests/traversal.test.mjs` asserts against the
   * shipped level rather than leaving as folklore.
   */
  find(c, w) {
    const holds = w.rec?.handholds;
    if (!holds || !holds.length) return null;
    const R = this.reach();
    const handY = c.position.y + TUNE.hangReach;
    let best = null, bd = Infinity, online = null, od = Infinity;
    for (let i = 0; i < holds.length; i++) {
      const h = holds[i];
      if (!h || !h.point) continue;
      if (this.spent(h, handY, c, R)) continue;
      const d = Math.hypot(h.point.x - c.position.x, h.point.y - handY, h.point.z - c.position.z);
      if (d > R) continue;
      if (d < bd) { bd = d; best = h; }
      if (this._line && this.sameLine(h, this._line) && d < od) { od = d; online = h; }
    }
    return online || best;
  }

  canEnter(c) {
    if (c.grounded || c.sm.group !== 'air') return false;
    // Intent, exactly as `WallCling` demands it and for the reference's own reason: a hold acts
    // when it is being reached for. Proximity alone must never take control off a player.
    if (c.wishMag < 0.5) return false;
    const w = c.probeWall(c.wishDir);
    if (!w.ok || !w.rec) return false;
    if (-dot2(c.wishDir.x, c.wishDir.z, w.nx, w.nz) < 0.45) return false;
    this._pick = this.find(c, w);
    return !!this._pick;
  }

  enter(c) {
    const h = this._pick || this.find(c, c.wall);
    if (!h) { c.sm.request('fall'); return; }
    this._hold = h;
    this._left = null;
    this._line = h;                   // the ladder this ascent is committed to — see `find`
    _a.set(h.normal?.x ?? c.wall.nx, 0, h.normal?.z ?? c.wall.nz);
    if (_a.lengthSq() < 1e-6) _a.set(-c.faceDir.x, 0, -c.faceDir.z);
    _a.normalize();
    // The hand goes on the hold; the feet hang `hangReach` below it, same as a ledge.
    c.position.set(
      h.point.x + _a.x * (TUNE.radius + 0.05),
      h.point.y - TUNE.hangReach,
      h.point.z + _a.z * (TUNE.radius + 0.05)
    );
    c.velocity.set(0, 0, 0);
    c.grounded = false;
    c.yaw = Math.atan2(-_a.x, -_a.z);
    c.attached = c.wall.rec || h.mesh || null;
    /* NOT `freeWall()`. See the header — this is the line that keeps the free climb closed. */
    c.markWall(c.wall.rec, c.wall.nx, c.wall.nz);
    c.oneShot('wall_cling');
    /* `ledgeGrab`, deliberately not a new event: `tests/eventbus.test.mjs` pins the exact
       publisher/subscriber census and a new name would land red. It is also the honest one —
       FX subscribes it as "the moment Sly catches something", which is precisely this. */
    c.engine.emit('ledgeGrab', { pos: c.position, material: c.wall.rec?.material });
  }

  update(c, dt) {
    const h = this._hold;
    if (!h) return 'fall';
    c.velocity.set(0, 0, 0);

    _a.set(h.normal?.x ?? 0, 0, h.normal?.z ?? 0);
    if (_a.lengthSq() < 1e-6) _a.set(-c.faceDir.x, 0, -c.faceDir.z);
    _a.normalize();

    if (c.pressed('jump') || c.jumpBuffered()) {
      c.takeJump();
      /* Straight up the face at the launch WORLD's pitch was derived from, with a light press
         INTO the wall (not out of it, as `WallJump` does at `wallJumpOut` 7.2) so the capsule
         stays inside `probeWall`'s reach for the whole rise and the next rung is catchable.
         `Fall`'s own `applyJumpCut` still applies, so a tapped jump climbs short exactly as a
         tapped jump does everywhere else in this file. */
      c.velocity.set(-_a.x * 0.9, TUNE.jumpV0 * TUNE.wallJumpUp, -_a.z * 0.9);
      c.wallRunUsed = 0;
      c.coyote = 99;
      return 'fall';
    }
    if (c.down('crouch')) {
      // Let go, nudged clear of the face — the same drop `LedgeHang` performs.
      c.position.x += _a.x * 0.06;
      c.position.z += _a.z * 0.06;
      return 'fall';
    }
    /* A hold is an authored point in world space, not a socket on a body — `EgyptLevel` builds
       each one as a plain `Vector3` and every laddered rec in the game is a static proxy. What
       was undefined until now is what happens if that stops being true, because `update` pins
       velocity to zero and never calls `move()`: a rec that slid out from under Sly would leave
       him hanging on nothing, frozen, with the wall gone. These two checks make that case
       *defined* rather than merely unlikely — the hand drifting further than `reach` from the
       hold, or the face no longer being there at all, both let go. A hold that moves drops you;
       it does not carry you and it does not strand you. */
    const R = this.reach();
    if (Math.hypot(h.point.x - c.position.x,
                   h.point.y - (c.position.y + TUNE.hangReach),
                   h.point.z - c.position.z) > R) return 'fall';
    _b.set(-_a.x, 0, -_a.z);
    if (!c.probeWall(_b).ok) return 'fall';

    c.turnToYaw(Math.atan2(-_a.x, -_a.z), 12, dt);
    c.baseClip('wall_cling', 0.14);
    return null;
  }

  exit(c) {
    this._left = this._hold;
    this._hold = null;
    this._pick = null;
    c.attached = null;
  }
}

class WallCling extends State {
  canEnter(c) {
    if (c.grounded || c.sm.group !== 'air') return false;
    if (c.velocity.y > 1.2 || c.wishMag < 0.5) return false;
    if (!c.probeWall(c.wishDir).ok) return false;
    /* The cling is the rung the free climb was built out of, so it carries the same "one face,
       one bite" rule as the run: `wallJump` re-grants the double jump, the double jump carries
       Sly back onto the face he just left, and the cling used to accept him every time. */
    if (c.wallSpent(c.wall.rec, c.wall.nx, c.wall.nz)) return false;
    return -dot2(c.wishDir.x, c.wishDir.z, c.wall.nx, c.wall.nz) > 0.45;
  }
  enter(c) {
    this._nx = c.wall.nx; this._nz = c.wall.nz;
    c.markWall(c.wall.rec, c.wall.nx, c.wall.nz);
    c.velocity.set(0, Math.min(0, c.velocity.y), 0);
    c.oneShot('wall_cling');
    c.wallRunUsed = Math.max(0, c.wallRunUsed - 1);   // clinging re-arms one wall run
  }
  update(c, dt) {
    if (c.pressed('jump') || c.jumpBuffered()) { c.wall.nx = this._nx; c.wall.nz = this._nz; return 'wallJump'; }
    if (c.sm.time > TUNE.wallClingMax) return 'fall';
    if (c.down('crouch')) return 'fall';
    _a.set(-this._nx, 0, -this._nz);
    if (!c.probeWall(_a).ok) return 'fall';
    this._nx = c.wall.nx; this._nz = c.wall.nz;
    c.velocity.x = -this._nx * 0.6;
    c.velocity.z = -this._nz * 0.6;
    c.gravity(dt, TUNE.wallClingSlide);
    c.turnToYaw(Math.atan2(-this._nx, -this._nz), 12, dt);
    c.move(dt);
    if (c.grounded) return 'idle';
    c.baseClip('wall_cling', 0.14);
    return null;
  }
}

class WallJump extends State {
  enter(c) {
    c.takeJump();
    _a.set(c.wall.nx, 0, c.wall.nz);
    if (_a.lengthSq() < 1e-5) _a.set(-c.faceDir.x, 0, -c.faceDir.z);
    _a.normalize();
    c.velocity.set(_a.x * TUNE.wallJumpOut, TUNE.jumpV0 * TUNE.wallJumpUp, _a.z * TUNE.wallJumpOut);
    c.yaw = Math.atan2(_a.x, _a.z);
    c.grounded = false;
    c.coyote = 99;
    c.airJumps = 1;          // the double jump comes back, so wall chains stay open
    c.wallRunUsed = 0;
    c.oneShot('wall_jump');
    c.engine.emit('wallJump', { pos: c.position, material: c.wall.rec?.material });
  }
  update(c, dt) {
    c.applyJumpCut();
    c.turnToward(c.wishDir, TUNE.turnAir * 0.7, dt);
    c.accelerate(dt, TUNE.runSpeed, TUNE.accel * TUNE.airControl * 0.7, TUNE.airDrag);
    c.gravity(dt);
    c.move(dt);
    if (c.grounded) return c.landImpact > TUNE.landBeat ? 'land' : 'idle';
    if (c.velocity.y <= 0) return 'fall';
    c.baseClip('wall_jump', 0.1);
    return null;
  }
}

/* ====================================================================== */
/* ledge tech                                                              */
/* ====================================================================== */

class LedgeHang extends State {
  canEnter(c) {
    if (c.grounded || c.sm.group !== 'air') return false;
    if (c.velocity.y > 1.5 || c.hangLock > 0) return false;
    travelDir(c, _a);
    if (c.probeLedge(_a).ok) return true;
    return c.wishMag > 0.3 && c.probeLedge(c.wishDir).ok;
  }
  enter(c) {
    const L = c.ledge;
    this._nx = L.nx; this._nz = L.nz;
    c.position.set(L.x, L.y - TUNE.hangDrop, L.z);
    c.velocity.set(0, 0, 0);
    c.grounded = false;
    c.yaw = Math.atan2(-this._nx, -this._nz);
    c.attached = L.rec;
    c.airJumps = 1;
    c.oneShot('ledge_hang');
    c.engine.emit('ledgeGrab', { pos: c.position, material: L.rec?.material });
  }
  update(c, dt) {
    c.velocity.set(0, 0, 0);
    if (c.down('crouch') || c.wishRaw.z < -0.5) {
      c.hangLock = 0.34;
      c.position.x += this._nx * 0.06;
      c.position.z += this._nz * 0.06;
      return 'fall';
    }
    if (c.pressed('jump') || c.jumpBuffered() || c.wishRaw.z > 0.5 || c.pressed('interact')) return 'ledgeClimb';

    // Shimmy: step along the lip, then verify the lip is still there before committing.
    let sh = 0;
    if (c.wishRaw.x > 0.4) sh = 1;
    else if (c.wishRaw.x < -0.4) sh = -1;
    if (sh !== 0) {
      _b.set(0, 1, 0).cross(_c3.set(this._nx, 0, this._nz)).normalize();
      const step = TUNE.shimmy * dt * sh;
      _a.set(c.position.x + _b.x * step, c.position.y, c.position.z + _b.z * step);
      _d.set(-this._nx, 0, -this._nz);
      const savedX = c.position.x, savedZ = c.position.z;
      c.position.x = _a.x; c.position.z = _a.z;
      if (c.probeLedge(_d).ok) {
        const L = c.ledge;
        c.position.set(L.x, L.y - TUNE.hangDrop, L.z);
        this._nx = L.nx; this._nz = L.nz;
      } else { c.position.x = savedX; c.position.z = savedZ; }
      c.baseClip(sh > 0 ? 'ledge_shimmy_r' : 'ledge_shimmy_l', 0.14);
    } else {
      c.baseClip('ledge_hang', 0.16);
    }
    return null;
  }
  exit(c) { c.attached = null; }
}

class LedgeClimb extends State {
  enter(c) {
    _a.set(-c.ledge.nx, 0, -c.ledge.nz);
    if (_a.lengthSq() < 1e-5) _a.copy(c.faceDir);
    this._fromX = c.position.x; this._fromY = c.position.y; this._fromZ = c.position.z;
    this._toX = c.position.x + _a.x * (TUNE.radius + 0.34);
    this._toY = c.ledge.y + 0.03;
    this._toZ = c.position.z + _a.z * (TUNE.radius + 0.34);
    c.velocity.set(0, 0, 0);
    c.oneShot('ledge_climb');
  }
  update(c, dt) {
    const k = Math.min(1, c.sm.time / TUNE.climbTime);
    // Up first, then forward: mantling with a straight lerp reads as clipping through the lip.
    const ky = Math.min(1, k / 0.62);
    const kf = Math.max(0, (k - 0.38) / 0.62);
    c.position.set(
      this._fromX + (this._toX - this._fromX) * kf,
      this._fromY + (this._toY - this._fromY) * ky,
      this._fromZ + (this._toZ - this._fromZ) * kf
    );
    c.velocity.set(0, 0, 0);
    if (k >= 1) { c.grounded = true; c.landImpact = 0; return c.wishMag > 0.12 ? 'move' : 'idle'; }
    return null;
  }
}

/* ====================================================================== */
/* cane hook + swing — the best-feeling move in the game                   */
/* ====================================================================== */

class HookSwing extends State {
  constructor(n, o) {
    super(n, o);
    /** The anchor Sly last let go of, and whether it is still refusing to take him back. */
    this._spent = false;
    this._left = new THREE.Vector3();
  }

  /**
   * One anchor, one release — the fourth member of a family this file already had three of
   * (`hangLock` on ledges, `poleLockout` on poles, `spireLockout` on tips) and the one that
   * was missing.
   *
   * **Without it the release is a no-op and a hook is a one-way door.** `update` returns
   * 'fall'; the machine sets `fall` and re-polls *in the same frame*, with Sly's position not
   * yet advanced by one millimetre; and `canEnter`'s fly-through clause —
   * `!grounded && distance <= hookAuto` — is then satisfied by construction.
   *
   * By construction, and not merely usually. `afford('hook')` measures from the eye, 1.15 m up
   * the capsule, so at swing angle θ off vertical the distance it reports is
   * `|2.2·u + 1.15·y|` = **√(6.1625 − 5.06·cos θ)** — 1.05 m hanging straight down, 2.48 m at
   * horizontal. It only reaches `hookAuto` 2.9 m at cos θ = −0.444, i.e. **θ = 116°**, which is
   * past horizontal and unreachable for a pendulum that starts below its own anchor. There is no
   * point on the swing from which the release survives its own frame. Measured on the shipped
   * moveset — one ring, a scripted fly-through, a jump tap every 20 frames: **12 grabs, 11
   * `hookRelease` events, 240 frames, and `distance(Sly, ring)` pinned at 2.200 m on every one
   * of them.** Crouch bails the same way and fares no better. Both courtyard hook chains in
   * §8.1 were traps rather than routes.
   *
   * The guard is a **place, not a clock**, and that is the point: what has to elapse after a
   * rope release is the distance the launch buys, not a duration. It therefore costs a chain
   * nothing — a *different* ring is grabbable on the very next frame, which is the whole reason
   * `hookAuto` exists — and it needs no fourth timer in Controller's `_preTimers`.
   *
   * `hookL` is the same-anchor tolerance. It is a measurement, not a taste: EgyptLevel's `MAG`
   * records the tightest ring gap in the level as 6.36 m, so 2.2 m tells two rings apart with
   * 1.4 m to spare, while comfortably covering the drift of one ring's own reported point.
   *
   * It gates the deliberate clauses too, and has to: `bail` fires on `pressed('interact')`, and
   * that same still-live press satisfies `canEnter`'s own E clause out to `hookGrab` 9 m on the
   * re-poll. Letting go with E would otherwise be the most reliable way to stay put.
   */
  spent(a) {
    if (!this._spent) return false;
    // A different ring entirely — nothing to refuse.
    if (a.point.distanceTo(this._left) > TUNE.hookL) { this._spent = false; return false; }
    // Same ring, but the launch has carried him clear of it: the grab is honest again.
    if (a.distance > TUNE.hookAuto) { this._spent = false; return false; }
    return true;
  }

  canEnter(c) {
    if (c.sm.group === 'attach') return false;
    const a = c.afford('hook');
    if (!a) return false;
    if (this.spent(a)) return false;
    // E always works; RMB lock-on works; and flying close enough grabs on its own, because
    // making the player press a button mid-chain is what kills a swing line.
    if (c.pressed('interact')) return a.distance <= TUNE.hookGrab;
    if (c.down('focus') && (c.pressed('jump') || c.pressed('attack'))) return a.distance <= TUNE.hookGrab;
    return !c.grounded && a.distance <= TUNE.hookAuto;
  }
  enter(c) {
    const a = c.afford('hook');
    this._spent = false;              // attached again: nothing is owed
    c.anchor.copy(a ? a.point : c.position);
    c.attached = a ? a.rec : null;
    // Rope goes taut: place Sly on the sphere, keep only the tangential part of his velocity.
    _a.subVectors(c.position, c.anchor);
    /* A dead-centre arrival leaves no radial direction — magnetism's `magSnapRadius` puts Sly AT the
       ring, and a dead-on auto-grab does the same. Straight down then teleports him the full
       `hookL` 2.2 m in one frame, which reads as a cut rather than a rope going taut. Hang him below
       and BEHIND, along his own facing, so the swing starts where the approach was heading. */
    if (_a.lengthSq() < 1e-4) _a.set(-c.faceDir.x * 0.5, -1, -c.faceDir.z * 0.5);
    _a.normalize();
    c.position.copy(c.anchor).addScaledVector(_a, TUNE.hookL);
    const vr = c.velocity.dot(_a);
    c.velocity.addScaledVector(_a, -vr);
    c.grounded = false;
    c.oneShot('hook_grab');
    c.engine.emit('hookGrab', { pos: c.anchor, material: a?.rec?.material });
  }
  update(c, dt) {
    const L = TUNE.hookL;
    _a.subVectors(c.position, c.anchor);
    if (_a.lengthSq() < 1e-6) _a.set(0, -1, 0);
    _a.normalize();

    // Tangential gravity only — the rope eats the radial component.
    _b.set(0, TUNE.gravity, 0);
    _b.addScaledVector(_a, -_b.dot(_a));
    c.velocity.addScaledVector(_b, dt);

    // Pumping. A real swing is pumped at the bottom, so scale the input by how fast you're
    // already going; standing still on a rope shouldn't launch you.
    if (c.wishMag > 0.2) {
      _c3.copy(c.velocity);
      const sp = _c3.length();
      if (sp > 0.35) {
        _c3.multiplyScalar(1 / sp);
        const push = dot2(c.wishDir.x, c.wishDir.z, _c3.x, _c3.z);
        c.velocity.addScaledVector(_c3, push * TUNE.hookPump * dt * Math.min(1, sp / 5));
      } else {
        _c3.set(c.wishDir.x, 0, c.wishDir.z);
        _c3.addScaledVector(_a, -_c3.dot(_a));
        c.velocity.addScaledVector(_c3, TUNE.hookPump * 0.5 * dt);
      }
    }
    c.velocity.multiplyScalar(1 - TUNE.hookDamp * dt);

    // Integrate then re-project onto the sphere; correct the velocity back to tangential.
    c.position.addScaledVector(c.velocity, dt);
    _a.subVectors(c.position, c.anchor);
    const d = _a.length() || 1;
    _a.multiplyScalar(1 / d);
    c.position.copy(c.anchor).addScaledVector(_a, L);
    c.velocity.addScaledVector(_a, -c.velocity.dot(_a));

    // Face along the swing so the silhouette reads, and lean into it.
    if (c.speedXZ() > 0.4) c.turnToYaw(Math.atan2(c.velocity.x, c.velocity.z), 9, dt);
    c.balance = Math.max(-0.5, Math.min(0.5, -_a.x * 0.4 + -_a.z * 0.0));

    /* `jumpBuffered()` alongside the press, the same poll `railSlide`, `railWalk`, `poleClimb`,
       `wallRun`, `wallCling`, `spireLand`, `ledgeHang` and `toTarget` all already carry, and the
       same defect `Roll` was just fixed for. The gate here is a *minimum wind-up*, so a press
       that lands before it opens is dropped outright rather than deferred. Measured with a
       one-frame tap at every offset after the grab: **frames +0…+10 (0–167 ms) were silently
       swallowed**, and the release only answered from +11 on. The buffer recovers +3…+10 — eight
       frames of input the player did make.

       Frames +0…+2 stay dropped, and that is correct rather than a shortfall: `hookMinSwing`
       0.18 s deliberately exceeds `jumpBufferMs` 0.14 s precisely so that the press which STARTS
       a swing can never be the press that ends it — the same rule `poleSwingMin` was written for
       — and a buffered poll respects it automatically instead of having to special-case it. */
    const bail = c.pressed('jump') || c.jumpBuffered() || c.pressed('interact') || c.pressed('attack');
    if (bail && c.sm.time > TUNE.hookMinSwing) {
      // Release preserves tangential velocity ×1.15 (§6) plus a little lift, so a well-timed
      // release at the bottom of the arc genuinely launches you across the courtyard.
      c.takeJump();
      c.velocity.multiplyScalar(TUNE.hookRelease);
      c.velocity.y += TUNE.hookUpKick;
      c.airJumps = 1;
      c.oneShot('hook_release');
      c.engine.emit('hookRelease', { pos: c.position, vel: c.velocity });
      return 'fall';
    }
    if (c.down('crouch') && c.sm.time > TUNE.hookMinSwing) { c.velocity.multiplyScalar(0.5); return 'fall'; }
    c.baseClip('hook_swing', 0.18);
    return null;
  }
  exit(c) {
    c.attached = null;
    c.balance = 0;
    // Whatever ended the swing — a release, a crouch, a hurt, a teleport — this anchor has had
    // its bite. `spent()` above hands it back as soon as Sly is clear of it.
    this._left.copy(c.anchor);
    this._spent = true;
  }
}

/* ====================================================================== */
/* rails                                                                   */
/* ====================================================================== */

/** Shared spline follow. `c.rail` holds { spline, u, len, speed }. */
class RailBase extends State {
  mount(c, a, minSpeed) {
    const r = c.rail;
    r.spline = a.rec?.mesh?.userData?.spline || null;
    r.rec = a.rec;
    r.u = Math.min(1, Math.max(0, a.t || 0));
    r.len = 1;
    if (r.spline?.getLength) { try { r.len = Math.max(0.5, r.spline.getLength()); } catch { r.len = 1; } }
    this.tangentAt(c, r.u, _tan);
    const along = c.velocity.dot(_tan);
    const sign = Math.abs(along) > 0.6 ? Math.sign(along) : (_tan.y > 0 ? -1 : 1);
    /* The mount FLOOR comes from the rail when the rail states one, and only then.
     *
     * This is the one line §371.2 predicted, and the measurement behind it is worth keeping: our
     * `advance()` already carries `speed += gravity · tangent.y · dt`, so a rail on a catenary is
     * rope physics with no new state — on a 21 m test rope it mounted at 9.66 m/s, accelerated to
     * 14.07 at the bottom and was slowed to 6.54 climbing out. What separated it from a rope was
     * `RailSlide.enter`'s hard `TUNE.railSpeed` floor of 9.5 m/s, which is exactly enough energy
     * to crest a sag every time; a rope wants to be able to settle INTO one and swing.
     * `rec.mountSpeed` lets the level say so — `EgyptLevel`'s `hall-cable` (span 30.32 m, sag
     * 1.50 m) is the first and only rail that does, and `registerCollider` spreads it onto the rec
     * exactly as it does `handholds`. Absent, `minSpeed` is unchanged, so the other five rails in
     * the level are bit-identical. */
    const floor = Number.isFinite(a.rec?.mountSpeed) ? a.rec.mountSpeed : minSpeed;
    r.speed = sign * Math.max(Math.abs(along), floor);
    c.attached = a.rec;
    c.velocity.set(0, 0, 0);
  }
  tangentAt(c, u, out) {
    const s = c.rail.spline;
    if (s?.getTangentAt) {
      try { s.getTangentAt(Math.min(1, Math.max(0, u)), out); if (out.lengthSq() > 1e-6) return out.normalize(); } catch {}
    }
    return out.set(c.faceDir.x, 0, c.faceDir.z).normalize();
  }
  pointAt(c, u, out) {
    const s = c.rail.spline;
    if (s?.getPointAt) {
      try { s.getPointAt(Math.min(1, Math.max(0, u)), out); if (Number.isFinite(out.x)) return out; } catch {}
    }
    return out.copy(c.position);
  }
  /** Advance along the spline; returns true when we've run off an end. */
  advance(c, dt, maxSpeed) {
    const r = c.rail;
    this.tangentAt(c, r.u, _tan);
    r.speed += TUNE.gravity * _tan.y * dt;            // gravity-driven along the spline (§6)
    r.speed *= 1 - TUNE.railFriction * 0.1 * dt;
    if (Math.abs(r.speed) > maxSpeed) r.speed = Math.sign(r.speed) * maxSpeed;
    r.u += (r.speed * dt) / r.len;
    if (r.u <= 0 || r.u >= 1) {
      r.u = Math.min(1, Math.max(0, r.u));
      this.tangentAt(c, r.u, _tan);
      this.pointAt(c, r.u, _pt);
      c.position.copy(_pt);
      // Leaving the end preserves velocity along the tangent (§6).
      c.velocity.copy(_tan).multiplyScalar(r.speed);
      return true;
    }
    this.pointAt(c, r.u, _pt);
    // Balance sway ±6° (§6): a small lateral offset so it reads in motion, not just in the rig.
    c.balance = Math.sin(c.engine.time * TUNE.railSwayHz * Math.PI * 2) * TUNE.railSway;
    _b.set(0, 1, 0).cross(_tan).normalize();
    c.position.set(_pt.x + _b.x * c.balance * 0.14, _pt.y, _pt.z + _b.z * c.balance * 0.14);
    c.velocity.copy(_tan).multiplyScalar(r.speed);
    c.grounded = false;
    if (Math.abs(r.speed) > 0.15) c.turnToYaw(Math.atan2(_tan.x * Math.sign(r.speed), _tan.z * Math.sign(r.speed)), 10, dt);
    return false;
  }
  jumpOff(c) {
    this.tangentAt(c, c.rail.u, _tan);
    c.velocity.copy(_tan).multiplyScalar(c.rail.speed);
    c.pendingLaunch = TUNE.jumpV0 * TUNE.railJumpUp;
    return 'jump';
  }

  /**
   * Where the "just stepped off this rail" flag lives: on the `railSlide` instance, because
   * `railSlide` is the only rail state that is ever *polled* into (`railWalk.canEnter` needs
   * `grounded` on `groundTag === 'rail'`, and the slide→walk handoff is forced). One flag,
   * written by both states, read by one.
   */
  gate(c) { return c.sm.get('railSlide') || this; }

  /**
   * Record the departure. Called from `exit`, so every way off a rail — jump, crouch, running
   * off the end, a hurt, a teleport — is covered by one line.
   *
   * Reads `c.attached` rather than `c.rail.rec`, and runs *before* `exit` clears it: `c.rail` is
   * scratch that outlives the mount, so an `enter` that found no affordance and bailed to `fall`
   * would otherwise stamp the previous rail's record and refuse it on the way back.
   */
  stepOff(c) { const g = this.gate(c); if (g) g._offRec = c.attached || null; }

  exit(c) { this.stepOff(c); c.attached = null; c.balance = 0; }
}

class RailSlide extends RailBase {
  /**
   * The rail's half of `HookSwing.spent` — the same defect, and measured worse, because a rail
   * has no `hookMinSwing` to hide behind.
   *
   * Both of a rail's non-jump departures leave Sly *on* the line, and the auto-engage clause
   * below then re-takes him on the machine's very next pass:
   *
   *   · **Running off the end.** `advance` clamps `u` to 1, puts Sly on the end point and
   *     returns 'fall'. Measured on an 8 m horizontal rail entered at `railSpeed` 9.5 m/s:
   *     **Sly welded at x = 4.15 for the remaining 168 frames, 337 `railMount` events in 3
   *     seconds, and `sm.frameSwitches` saturated at its 4-pass ceiling on every frame.**
   *     A rail could not be ridden off its own end. Jump still escaped, so this was a lock the
   *     player could only leave upward — which is precisely "traversal that cannot be chained".
   *   · **Crouching off.** `velocity ×0.6` leaves `vy` at 0 on a level rail, which passes
   *     `velocity.y <= 0.6`, and the escape then depends on falling the 0.65 m of the vertical
   *     clause one re-mounted frame at a time. Measured: **0.90 s of frozen, stuttering descent
   *     and 98 `railMount` events**, with the 9.5 m/s of momentum thrown away.
   *
   * Keyed on the collision record rather than on a point, because a rail is a *line* and its
   * affordance point slides along with Sly — there is no fixed anchor to compare against, which
   * is exactly why the hook's positional form will not transfer. `railMount × 1.6` is the widest
   * radius any clause here mounts from, so clearing it means clearing all of them.
   *
   * A record-less COLLISION (the `FLAT` fallback, or any `nearest` that answers without recs)
   * leaves `_offRec` null and the guard inert. That is the same degradation `wallSpent`
   * documents, and it fails in the same direction — toward the behaviour that shipped.
   */
  canEnter(c) {
    if (c.sm.group === 'attach') return false;
    const a = c.afford('rail');
    if (!a) return false;
    if (this._offRec && a.rec === this._offRec) {
      if (a.distance <= TUNE.railMount * 1.6) return false;
      this._offRec = null;                 // clear of the rail he left: it is a rail again
    }
    if (c.pressed('interact') && a.distance <= TUNE.railMount * 1.6) return true;
    // Auto-engage on contact from above (§ affordance discovery). Generous on purpose.
    if (!c.grounded && c.velocity.y <= 0.6 && a.distance <= TUNE.railMount
        && a.point.y <= c.position.y + 0.65) return true;
    return false;
  }
  enter(c) {
    const a = c.afford('rail');
    this._offRec = null;                   // attached again: nothing is owed
    if (!a) { c.sm.request('fall'); return; }
    this.mount(c, a, TUNE.railSpeed);
    c.oneShot('rail_slide');
    c.engine.emit('railMount', { pos: c.position, material: a.rec?.material });
  }
  update(c, dt) {
    if (c.pressed('jump') || c.jumpBuffered()) return this.jumpOff(c);
    if (c.down('crouch')) { c.velocity.multiplyScalar(0.6); return 'fall'; }
    if (this.advance(c, dt, TUNE.railMax)) return 'fall';
    if (Math.abs(c.rail.speed) < TUNE.railWalk * 0.85) return 'railWalk';
    c.baseClip('rail_slide', 0.14);
    return null;
  }
}

/** Rail walk — balancing along a rail under your own power instead of sliding it. */
class RailWalk extends RailBase {
  canEnter(c) {
    if (c.sm.group === 'attach') return false;
    if (!c.grounded || c.groundTag !== 'rail') return false;
    const a = c.afford('rail');
    return !!a && a.distance <= TUNE.railMount * 1.3;
  }
  enter(c) {
    // Same clear as `RailSlide.enter`, and needed here too: the slide→walk handoff runs
    // `RailSlide.exit` (which arms the flag) before this, and Sly is still on the rail.
    const g = this.gate(c); if (g) g._offRec = null;
    if (!c.rail.spline || c.sm.prev?.name !== 'railSlide') {
      const a = c.afford('rail');
      if (!a) { c.sm.request('fall'); return; }
      this.mount(c, a, 0);
    }
    c.oneShot('rail_walk');
  }
  update(c, dt) {
    if (c.pressed('jump') || c.jumpBuffered()) return this.jumpOff(c);
    if (c.down('crouch')) return 'fall';
    const r = c.rail;
    this.tangentAt(c, r.u, _tan);
    // Player-driven: push along the rail, and the rail's own slope still pulls.
    const push = c.wishMag > 0.15 ? dot2(c.wishDir.x, c.wishDir.z, _tan.x, _tan.z) : 0;
    const target = push * TUNE.railWalk;
    r.speed += (target - r.speed) * Math.min(1, 8 * dt);
    if (this.advance(c, dt, TUNE.railWalk * 1.6)) return 'fall';
    if (Math.abs(r.speed) > TUNE.railWalk * 1.5) return 'railSlide';
    c.baseClip(Math.abs(r.speed) > 0.25 ? 'rail_walk' : 'balance_idle', 0.2);
    return null;
  }
}

/* ====================================================================== */
/* poles                                                                   */
/* ====================================================================== */

class PoleClimb extends State {
  canEnter(c) {
    if (c.sm.group === 'attach') return false;
    // Same guard, same reason, as `hangLock` on LedgeHang: a deliberate exit leaves Sly well
    // inside `poleMount`, and the machine runs up to four passes per frame, so without this the
    // top hop is re-grabbed before it has left the ground. See TUNE.poleLockout.
    if (c.poleLock > 0) return false;
    const a = c.afford('pole');
    if (!a) return false;
    if (c.pressed('interact') && a.distance <= TUNE.poleMount * 1.5) return true;
    if (a.distance > TUNE.poleMount) return false;
    // Running or jumping into a column grabs it, if you're actually heading for it.
    if (c.wishMag < 0.4) return false;
    _a.set(a.point.x - c.position.x, 0, a.point.z - c.position.z);
    if (_a.lengthSq() < 1e-6) return false;
    _a.normalize();
    return dot2(c.wishDir.x, c.wishDir.z, _a.x, _a.z) > 0.4;
  }
  enter(c) {
    const a = c.afford('pole');
    const p = c.pole;
    if (!a) { c.sm.request('fall'); return; }
    p.rec = a.rec;
    p.x = a.point.x; p.z = a.point.z;
    const ud = a.rec?.mesh?.userData;
    const gp = a.rec?.mesh?.geometry?.parameters;
    p.r = Math.max(0.18, gp?.radiusTop ?? gp?.radius ?? 0.5);
    p.bottom = Number.isFinite(ud?.bottom) ? ud.bottom : a.point.y - 12;
    p.top = Number.isFinite(ud?.top) ? ud.top : a.point.y + 12;
    p.hold = p.r + TUNE.radius * 0.8;
    p.angle = Math.atan2(c.position.x - p.x, c.position.z - p.z);
    c.attached = a.rec;
    c.velocity.set(0, 0, 0);
    c.grounded = false;
    c.position.y = Math.min(Math.max(c.position.y, p.bottom + 0.05), p.top - 0.25);
    this.place(c);
    c.oneShot('pole_climb');
    c.engine.emit('poleMount', { pos: c.position, material: a.rec?.material });
  }
  place(c) {
    const p = c.pole;
    c.position.x = p.x + Math.sin(p.angle) * p.hold;
    c.position.z = p.z + Math.cos(p.angle) * p.hold;
    c.yaw = Math.atan2(-Math.sin(p.angle), -Math.cos(p.angle));   // face the pole
  }
  update(c, dt) {
    const p = c.pole;
    if (c.pressed('attack')) return 'poleSwing';
    if (c.pressed('jump') || c.jumpBuffered()) {
      _a.set(Math.sin(p.angle), 0, Math.cos(p.angle));
      c.velocity.set(_a.x * TUNE.poleJumpOut, 0, _a.z * TUNE.poleJumpOut);
      c.yaw = Math.atan2(_a.x, _a.z);
      c.pendingLaunch = TUNE.jumpV0 * TUNE.poleJumpUp;
      return 'jump';
    }

    // Spin around the shaft; climb, descend, or slide.
    if (Math.abs(c.wishRaw.x) > 0.3) p.angle += -c.wishRaw.x * TUNE.poleSpin * dt;
    let vy = 0;
    let clip = 'pole_climb';
    if (c.down('crouch')) { vy = -TUNE.poleDown; clip = 'pole_slide'; }
    else if (c.wishRaw.z > 0.3) vy = TUNE.poleUp;
    else if (c.wishRaw.z < -0.3) vy = -TUNE.poleUp;
    c.position.y += vy * dt;
    c.velocity.set(0, vy, 0);

    if (c.position.y >= p.top - 0.26) {
      c.position.y = p.top - 0.26;
      // Reaching the top and still pushing up hops you onto it — that's how the obelisk
      // becomes a spire landing instead of a dead end.
      if (c.wishRaw.z > 0.3) {
        c.position.y = p.top + 0.02;
        c.pendingLaunch = TUNE.jumpV0 * 0.55;
        _a.set(Math.sin(p.angle), 0, Math.cos(p.angle));
        c.velocity.set(-_a.x * 1.6, 0, -_a.z * 1.6);
        return 'jump';
      }
    }
    if (c.position.y <= p.bottom + 0.02) { c.position.y = p.bottom + 0.02; if (vy < 0) return 'idle'; }

    this.place(c);
    c.baseClip(clip, 0.16);
    return null;
  }
  exit(c) { c.attached = null; c.poleLock = TUNE.poleLockout; }
}

/** Pole swing — wind up around the shaft and let go for a long horizontal launch. */
class PoleSwing extends State {
  enter(c) { c.oneShot('pole_swing'); this._spin = 0; }
  update(c, dt) {
    const p = c.pole;
    /* The orbit follows the stick. `position` is `pole + hold · (sin angle, 0, cos angle)`, so
       increasing `angle` moves along `(cos angle, 0, -sin angle)` — and at the press Sly faces
       the pole, which makes that his RIGHT. So stick-right must raise `angle`: `dir = +sign`.

       This was `-Math.sign`, and pushing right orbited him left in all 12 poses the level offers.
       The tell that needed no basis vector at all: with NO stick the default is `dir = 1`, so
       letting go reversed the direction the stick had just asked for. Everything below is written
       in terms of `dir` — the tangent, the yaw, the launch velocity — so the sign lives here and
       only here. See `tests/traversal.test.mjs`. */
    const dir = c.wishRaw.x !== 0 ? Math.sign(c.wishRaw.x) : 1;
    const w = TUNE.poleSwingSpin * dir;
    p.angle += w * dt;
    this._spin += Math.abs(w) * dt;
    c.position.x = p.x + Math.sin(p.angle) * p.hold;
    c.position.z = p.z + Math.cos(p.angle) * p.hold;
    // Tangent of the orbit at the current angle.
    _a.set(Math.cos(p.angle), 0, -Math.sin(p.angle)).multiplyScalar(dir);
    c.yaw = Math.atan2(_a.x, _a.z);
    c.velocity.set(0, 0, 0);
    /* The manual release needs the same minimum wind-up `hookMinSwing` gives the rope, or the
       press that STARTED the swing satisfies this test on its own first pass. See TUNE.poleSwingMin.

       `jumpBuffered()` for the same reason it was just added to the rope and to `Roll`: this gate
       is a *minimum*, so a jump pressed before it opens was dropped rather than deferred. The
       press that starts a pole swing is `attack` (`PoleClimb.update` returns 'poleSwing' on it),
       and `PoleClimb` polls `pressed('jump') || jumpBuffered()` one line above that — so any
       buffered jump has already been spent on a pole jump and this poll cannot resurrect it. */
    const bail = c.sm.time > TUNE.poleSwingMin
      && (c.pressed('jump') || c.jumpBuffered() || c.pressed('attack'));
    if (c.sm.time >= TUNE.poleSwingTime || bail) {
      const sp = Math.abs(w) * p.hold * TUNE.poleSwingLaunch + 5.0;
      c.velocity.set(_a.x * sp, 0, _a.z * sp);
      c.pendingLaunch = TUNE.jumpV0 * 0.8;
      c.airJumps = 1;
      return 'jump';
    }
    c.baseClip('pole_swing', 0.12);
    return null;
  }
  exit(c) { c.attached = null; c.poleLock = TUNE.poleLockout; }
}

/* ====================================================================== */
/* target magnetism — the authored assist                                  */
/* ====================================================================== */

/**
 * TO_TARGET. Sly has been assigned an authored traversal point (Targets.js) and is being flown
 * onto it. The law lives in `TargetField.step`; this class is only the state around it — when it
 * ends, and what an arrival hands off to.
 *
 * It sits in the `attach` group on purpose. Every opportunistic grab in this file refuses to fire
 * while `sm.group === 'attach'`, so once a designer-placed target has taken the arc, a hook that
 * happens to be nearby cannot steal it mid-flight. Only `hurt` (priority 100, onRequest) outranks
 * it — being shot off a magnet line is allowed, being distracted off one is not.
 */
class ToTarget extends State {
  canEnter(c) {
    const f = c.targets;
    return !!f && !!f.target && !f.locked && c.sm.group !== 'attach';
  }
  enter(c) {
    c.targets.lock();
    this._held = 0;
  }
  update(c, dt) {
    const f = c.targets;
    const t = f.target;
    if (!t) return c.grounded ? 'idle' : 'fall';

    const st = f.step(dt);
    if (st === 'released') return c.grounded ? (c.wishMag > 0.12 ? 'move' : 'idle') : 'fall';

    // Face the point while homing, so the silhouette shows the intent rather than the physics.
    _a.set(t.point.x - c.position.x, 0, t.point.z - c.position.z);
    if (_a.lengthSq() > 1e-4) c.turnToward(_a, TUNE.turnAir * 1.5, dt);

    if (st === 'onTarget') {
      // A jump taken off a point uses the arrival curve, not a constant (IMPORT §2).
      if (c.pressed('jump') || c.jumpBuffered()) {
        c.takeJump();
        f.takeJump();
        c.airJumps = 1;
        c.oneShot('jump_rise');
        c.engine.emit('targetJump', { pos: c.position, vy: c.velocity.y });
        return 'fall';
      }
      // Hand off to whatever move the point exists to start, if that move will actually take it.
      const next = t.arrive;
      if (next && c.sm.has(next)) {
        let ok = false;
        /* `ToTarget` is itself registered `group: 'attach'`, and every move an `arrive` can name
           opens `canEnter` with `if (c.sm.group === 'attach') return false`. Probing from inside
           ToTarget therefore fires that guard ON OURSELVES, so the handoff could never succeed and
           the arrival instead sat out `magHold` 0.25 s until the opportunistic grab took over — a
           visible 7-frame stall at 30 fps. Hide ourselves for the length of the probe. The
           alternative, giving ToTarget its own group, also works but lets spireLand/ledgeClimb/
           ledgeHang preempt an authored lock and changes what `TargetField.acquire`'s attach guard
           means.

           **What we hide behind matters, and `null` was the wrong answer.** `sm.group` falls back
           to 'ground' on a null current, and `LedgeHang` and `WallCling` both open
           `if (c.grounded || c.sm.group !== 'air') return false` — so those two answered "no"
           unconditionally, on every arrival, forever. `TargetPoint.arrive` documents `'ledgeHang'`
           as one of its three examples and `group: 'notch'` exists for wall holds whose state is
           `wallCling`: the two states an authored *vertical* route is made of were the two the
           probe could not reach. Nothing in the shipped level names them, so this cost no
           behaviour — it cost the authoring surface, which is the half of this system that is
           supposed to be useful.

           Standing in `fall` (or `idle` when grounded) fixes it and is strictly more honest than
           `null`, because those are literally the two states this method hands to when the
           handoff is declined — `return c.grounded ? 'idle' : 'fall'` below. The probe now asks
           each candidate the question it will actually be asked one frame later. The four moves
           that already worked test `group !== 'attach'` and are unaffected either way: 'air' and
           'ground' both pass. */
        const cur = c.sm.current;
        c.sm.current = c.sm.get(c.grounded ? 'idle' : 'fall') || null;
        try { ok = c.sm.get(next).canEnter(c); } catch { ok = false; } finally { c.sm.current = cur; }
        if (ok) { f.release('handoff'); return next; }
      }
      this._held += dt;
      if (this._held > TUNE.magHold) { f.release('held'); return c.grounded ? 'idle' : 'fall'; }
      c.baseClip(t.group === 'pole' ? 'pole_climb' : t.group === 'notch' ? 'wall_cling' : 'ledge_hang', 0.14);
      return null;
    }

    this._held = 0;
    c.baseClip(c.velocity.y > 0.2 ? 'jump_rise' : 'jump_fall', 0.14);
    return null;
  }
  exit(c) {
    if (c.targets?.locked) c.targets.release('preempted');
    this._held = 0;
  }
}

/* ====================================================================== */
/* Ninja Spire Landing                                                     */
/* ====================================================================== */

class SpireLand extends State {
  canEnter(c) {
    if (c.grounded || c.sm.group === 'attach') return false;
    if (c.velocity.y > 0.8) return false;
    // Same guard, same reason, as `hangLock` on ledges and `poleLock` on poles: both of this
    // state's deliberate exits leave Sly standing on the point at zero velocity, which satisfies
    // every clause below, and the machine re-polls in the same frame. See TUNE.spireLockout.
    if (c.spireLock > 0) return false;
    const a = c.afford('spire');
    if (!a) return false;
    // Only from above — a spire is a landing, not a wall grab.
    return a.point.y <= c.position.y + 1.0 && a.distance <= TUNE.spireGrab;
  }
  enter(c) {
    const a = c.afford('spire');
    if (a) c.position.copy(a.point);
    c.attached = a ? a.rec : null;
    c.velocity.set(0, 0, 0);
    c.grounded = false;
    c.airJumps = 1;
    c.landImpact = 0;
    c.oneShot('spire_land');
    c.engine.emit('spireLand', { pos: c.position, material: a?.rec?.material });
    c.engine.emit('shake', 0.08);
  }
  update(c, dt) {
    c.velocity.set(0, 0, 0);
    // Balance wobble — Sly perched on a point is never quite still.
    const t = c.engine.time;
    c.balance = (Math.sin(t * 2.7) * 0.7 + Math.sin(t * 4.3) * 0.3) * TUNE.spireWobble;
    if (c.wishMag > 0.2) c.turnToward(c.wishDir, 6, dt);

    if (c.pressed('jump') || c.jumpBuffered()) {
      // Spire jump gets ×1.25 (§6) and hands back two air jumps — that is the triple jump.
      c.pendingLaunch = TUNE.jumpV0 * TUNE.spireJump;
      c.airJumps = 2;
      c.spireLaunch = true;
      if (c.wishMag > 0.3) {
        c.velocity.x = c.wishDir.x * 4.2;
        c.velocity.z = c.wishDir.z * 4.2;
      }
      return 'jump';
    }
    if (c.down('crouch')) return 'fall';
    // Deliberately walking off takes a beat, so a stray tap doesn't drop you off the tip.
    if (c.wishMag > 0.75) {
      this._off = (this._off || 0) + dt;
      if (this._off > 0.16) {
        c.velocity.set(c.wishDir.x * 3.4, 0, c.wishDir.z * 3.4);
        return 'fall';
      }
    } else this._off = 0;
    c.baseClip(c.sm.time > 0.3 ? 'spire_balance' : 'spire_land', 0.2);
    return null;
  }
  exit(c) { c.attached = null; c.balance = 0; this._off = 0; c.spireLock = TUNE.spireLockout; }
}

/* ====================================================================== */
/* combat + interaction                                                    */
/* ====================================================================== */

class Combo extends State {
  canEnter(c) { return c.grounded && c.pressed('attack'); }
  enter(c) { this.swing(c); }
  swing(c) {
    c.comboIndex = c.comboIndex >= 3 ? 1 : c.comboIndex + 1;
    c.comboTimer = TUNE.comboWindow + TUNE.comboTimes[c.comboIndex - 1];
    this._t = TUNE.comboTimes[c.comboIndex - 1];
    this._elapsed = 0;
    c.oneShot(`cane_combo_${c.comboIndex}`);
    // Each hit lunges — Sly's combo covers ground, which is why it doubles as a movement tool.
    _a.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const sp = TUNE.comboLunge[c.comboIndex - 1];
    c.velocity.x = _a.x * sp;
    c.velocity.z = _a.z * sp;
    /* No `material` here, deliberately, and this is the one site of the ten that does not get it.
       The other nine are *surface contacts* — a hand or a foot arriving on a rec whose `material`
       COLLISION assigned — and each has that rec in scope at emit time. A cane swing is not a
       contact with anything: `Combo.swing` fires on the wind-up, before and independently of
       whether it connects, and there is no hit to read. Sourcing it from `groundMaterial` would
       voice the floor Sly is standing on rather than the thing he hit, which is exactly the class
       of error `ledgeGrab -> step_cloth` already is. A wrong material is worse than none, because
       none is at least honestly a default. If AUDIO wants a surfaced impact it needs a *hit*
       event from whatever resolves the strike, which is COMBAT's to publish, not MOVEMENT's. */
    c.engine.emit('caneHit', { index: c.comboIndex, pos: c.position, dir: _a });
    if (c.comboIndex === 3) c.engine.emit('shake', 0.16);
  }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    this._elapsed += dt;
    if (c.wishMag > 0.3 && this._elapsed < this._t * 0.4) c.turnToward(c.wishDir, TUNE.turnGround * 0.7, dt);
    c.accelerate(dt, 0, TUNE.accel, TUNE.decel * 1.6);
    c.gravity(dt);
    c.move(dt);
    if (this._elapsed >= this._t * 0.55 && c.pressed('attack') && c.comboIndex < 3) { this.swing(c); return null; }
    if (this._elapsed >= this._t) return c.wishMag > 0.12 ? 'move' : 'idle';
    return null;
  }
}

/**
 * Circle-strafe around a mark — the one move in §6's vocabulary this file had no equivalent of.
 *
 * What it changes: with a guard locked, the stick stops meaning *north/east* and starts meaning
 * *tangent/radius*. A/D swing Sly round the mark at a fixed distance, W/S tighten or open the
 * orbit, and his facing is welded to the body the whole time. That is the difference between
 * walking past a guard and casing him, and it is the read the whole stealth pillar is built on.
 *
 * Three deliberate choices worth their own sentence:
 *
 *   · **Raw axes, not `wishDir`.** `wishDir` is camera-relative (§6.1) and camera-relative input
 *     is exactly what a lock-on suspends — the same idiom `PoleClimb` and `LedgeHang` already use
 *     when the world, not the camera, defines the axes.
 *   · **Shift and Ctrl outrank the lock.** Sneaking past a guard must never be overridden by
 *     noticing him. If the player is holding a stealth modifier, that is the move they asked for.
 *   · **Named `combatStrafe` so CAMERA resolves it for free.** `CameraRig.STATE_RULES` matches the
 *     substring `combat` → the `combat` framing (pulled in 0.90 m, offset 0.30 m to the side,
 *     lens tightened), which is precisely the framing an orbit wants. No edit to CAMERA's table,
 *     which is not MOVEMENT's file to write.
 *
 * ANIMATION gets no strafe axis here, and that is a limitation stated rather than hidden: §4.7's
 * `setLocomotion` has no lateral channel and extending that contract is ANIMATION's call, not
 * ours. What it *does* get is the two channels that already carry an orbit honestly — `turnRate`,
 * which for a circle of radius r at speed v is a constant signed v/r and drives the existing lean
 * and turn-in-place blends, and `setLookAt`, which Controller now points at the mark's head.
 */
class CombatStrafe extends State {
  canEnter(c) {
    if (!c.grounded || !c.down('focus')) return false;
    // The stealth modifiers win the button. See the note above.
    if (c.down('sneak') || c.down('crouch')) return false;
    const m = c.mark();
    return !!m && m.distance <= TUNE.lockRange;
  }
  enter(c) {
    const m = c.mark();
    c.engine.emit('lockOn', m ? { pos: m.point, body: m.body } : null);
  }
  exit(c) {
    // Invalidate rather than falsify: writing `ok = false` while the memo still carries this
    // frame's number would answer "no mark" to anything else that asks before the frame ends.
    c.lock.frame = -1;
    c.lock.ok = false;
    c.lock.body = null;
    c.engine.emit('lockOn', null);
  }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    if (!c.down('focus')) return c.wishMag > 0.12 ? 'move' : 'idle';
    // `wide` keeps the mark out to `lockDrop`; only a guard who genuinely walks away breaks it.
    const m = c.mark(true);
    if (!m) return c.wishMag > 0.12 ? 'move' : 'idle';

    /* Frame of the orbit: `_a` points from Sly to the mark (radial, inward), and `_b` is `_a × up`
       — which, since `turnToYaw` below puts his facing on `_a`, is **his right**. Both are
       flattened: an orbit is a plan-view move, and a guard standing on a step above you must not
       tilt it.

       `_b` was described here as the "left-hand tangent", and that wording is why this note now
       says which one it is. The behaviour was never wrong — stick-right orbits right, measured
       12/12 against a stick-right walk — but a lateral vector labelled with the wrong side is
       exactly what faked two findings across two rounds elsewhere in this file. */
    _a.set(m.point.x - c.position.x, 0, m.point.z - c.position.z);
    const r = _a.length();
    if (r < 1e-3) return 'idle';
    _a.multiplyScalar(1 / r);
    _b.set(-_a.z, 0, _a.x);

    /* Radial term. Clamped by *rejecting the input*, not by clamping the position: pushing into
       `strafeNear` and being teleported back out is the classic lock-on shove, and it reads as
       the game fighting the player rather than as a wall. */
    let radial = -c.wishRaw.z * TUNE.strafeClose;     // +z on the stick is "forward" = close in
    if (radial > 0 && r > TUNE.strafeFar) radial = 0;
    if (radial < 0 && r < TUNE.strafeNear) radial = 0;
    const tangent = c.wishRaw.x * TUNE.strafeSpeed;

    _c3.set(_b.x * tangent - _a.x * radial, 0, _b.z * tangent - _a.z * radial);
    const v = c.velocity;
    const dx = _c3.x - v.x, dz = _c3.z - v.z;
    const step = Math.hypot(dx, dz);
    if (step > 1e-5) {
      const k = Math.min(1, TUNE.strafeAccel * dt / step);
      v.x += dx * k; v.z += dz * k;
    }

    c.turnToYaw(Math.atan2(_a.x, _a.z), TUNE.strafeFace, dt);
    c.gravity(dt);
    c.move(dt);

    const sp = c.speedXZ();
    /* Only walk/run exist for grounded locomotion (§4.7's clip list), so a hard sideways orbit
       plays a forward stride. The blend point is dropped to 3.0 — below the walk→run crossover
       `Move` uses — because a strafe at 4.6 m/s is a *quick* move, not a jog, and the run clip's
       longer stride is the closer lie of the two. */
    c.baseClip(sp < 0.35 ? 'idle_confident' : sp < 3.0 ? 'walk' : 'run', 0.18);
    return null;
  }
}

/**
 * Pickpocket (§6) — and specifically **the approach**, which is the whole move.
 *
 * What was here before put Sly's hand out whenever the player pressed E on flat ground with
 * nothing grabbable nearby, whether or not a guard existed. `tests/pickpocket.test.mjs` says so
 * in as many words — "it never checks that a guard is anywhere near" — and fixed the half of that
 * defect it owned by making HUD pay on `guardPickpocket` (the steal) rather than on `pickpocket`
 * (the reach). This is the other half: the reach itself should not happen with nobody to rob.
 *
 * Two phases, because the tension in a pickpocket is entirely in the first one:
 *
 *   `creep`  — a mark is `pickRange`…`pickApproach` away. Sly closes on it at `pickCreep`
 *              (= `sneakSpeed`) with his facing on the body, re-reading the mark every frame so
 *              a patrolling guard is followed rather than lunged at. It gives up on its own.
 *   `reach`  — inside `pickRange`. The original 0.55 s beat, unchanged.
 *
 * `pickpocket` now fires at the *start of the reach* instead of on entry, so GUARDS resolves its
 * own target with Sly's hand already at the pocket. FX's coin burst lands there too.
 */
class Pickpocket extends State {
  canEnter(c) {
    if (!c.grounded || !c.pressed('interact')) return false;
    // E is overloaded; traversal wins it. Only pick a pocket when nothing is grabbable.
    if (c.afford('hook')) return false;
    if (c.afford('rail')) return false;
    if (c.afford('pole')) return false;
    // …and only when there is actually a pocket. Without GUARDS this is simply always false,
    // which is the correct behaviour for a build with nobody to steal from.
    return !!c.pickMark();
  }
  enter(c) {
    c.velocity.x *= 0.2; c.velocity.z *= 0.2;
    this._reaching = false;
    this._creep = 0;
    const m = c.pickMark();
    if (m && m.distance <= TUNE.pickRange) this.reach(c);
    else c.baseClip('sneak_walk', 0.14);
  }
  reach(c) {
    this._reaching = true;
    this._t = 0;
    c.oneShot('pickpocket');
    c.engine.emit('pickpocket', { pos: c.position, yaw: c.yaw, range: TUNE.pickRange });
  }
  update(c, dt) {
    if (!c.grounded) return 'fall';

    if (this._reaching) {
      this._t += dt;
      c.accelerate(dt, 0, TUNE.accel, TUNE.decel * 2);
      c.gravity(dt);
      c.move(dt);
      if (this._t >= TUNE.pickTime) return 'idle';
      return null;
    }

    /* ---- creep. Re-read the mark every frame: it is walking. ---- */
    const m = c.pickMark();
    if (!m) return c.wishMag > 0.12 ? 'move' : 'idle';
    _a.set(m.point.x - c.position.x, 0, m.point.z - c.position.z);
    const d = _a.length();
    if (d > 1e-4) _a.multiplyScalar(1 / d);
    else _a.copy(c.faceDir);

    // Steering hard away cancels it, same threshold and same reason as magnetism's `magBreakDot`.
    if (c.wishMag > 0.5 && dot2(c.wishDir.x, c.wishDir.z, _a.x, _a.z) < TUNE.pickBreakDot) {
      return 'move';
    }
    this._creep += dt;
    if (this._creep > TUNE.pickCreepMax) return c.wishMag > 0.12 ? 'move' : 'idle';

    c.turnToward(_a, TUNE.turnGround * 0.9, dt);
    // Steer with the *mark's* direction, not the stick's — this is the assist, and it is bounded
    // by `pickCreepMax` above and refusable by the break test above that.
    const v = c.velocity;
    const tx = _a.x * TUNE.pickCreep, tz = _a.z * TUNE.pickCreep;
    const ax = tx - v.x, az = tz - v.z;
    const l = Math.hypot(ax, az);
    if (l > 1e-5) {
      const k = Math.min(1, TUNE.accel * 0.6 * dt / l);
      v.x += ax * k; v.z += az * k;
    }
    c.gravity(dt);
    c.move(dt);

    /* Re-measure against the point rather than re-asking `pickMark()`: the resolver is memoised
       for the frame (it has to be — `canEnter` polls it), so it would answer with the distance
       from before this step and cost the reach a frame. `m.point` is the slot's own vector and is
       still live. 3D, because that is the metric GUARDS' own `nearestPickpocketTarget` applies. */
    if (m.point.distanceTo(c.position) <= TUNE.pickRange) { this.reach(c); return null; }
    c.baseClip('sneak_walk', 0.18);
    return null;
  }
}

class Hurt extends State {
  enter(c) { c.oneShot('hurt'); c.engine.emit('shake', 0.22); }
  update(c, dt) {
    c.gravity(dt);
    c.move(dt);
    if (c.grounded && c.sm.time > 0.32) { c.landImpact = 0; return 'idle'; }
    if (c.sm.time > 1.6) return c.grounded ? 'idle' : 'fall';
    return null;
  }
}

/* ====================================================================== */
/* the ladder                                                              */
/* ====================================================================== */

/**
 * Priorities, high to low. A state can only be preempted by something strictly above it, so
 * this list *is* the interruption policy. Sticky moves sit above jump on purpose: while Sly is
 * on a rail, "jump" is the rail's business, not Jump's.
 */
export function buildMoveset() {
  return [
    new Hurt('hurt', { priority: 100, group: 'action', onRequest: true }),
    new DiveAttack('dive', { priority: 95, group: 'air' }),
    new SpireLand('spireLand', { priority: 90, group: 'attach' }),
    new LedgeClimb('ledgeClimb', { priority: 89, group: 'attach', onRequest: true }),
    new LedgeHang('ledgeHang', { priority: 88, group: 'attach' }),
    // Above the opportunistic hook grab: an authored target is a level-design instruction and
    // beats a hook that merely happens to be in range. Below ledge/spire, which are contact.
    new ToTarget('toTarget', { priority: 87, group: 'attach' }),
    new HookSwing('hookSwing', { priority: 86, group: 'attach' }),
    new RailSlide('railSlide', { priority: 84, group: 'attach' }),
    new RailWalk('railWalk', { priority: 83, group: 'attach' }),
    new PoleClimb('poleClimb', { priority: 82, group: 'attach' }),
    new PoleSwing('poleSwing', { priority: 81, group: 'attach', onRequest: true }),
    new WallRun('wallRun', { priority: 80, group: 'air' }),
    /* Between the wall run and the cling, where §357.2 put it. Above `wallCling` so an authored
       rung always beats a bare-stone grab at the same contact; below `wallRun` so a run in
       progress is never interrupted by a rung it happens to sweep past. `group: 'air'` is
       load-bearing — see the class header. */
    new WallClimb('wallClimb', { priority: 79, group: 'air' }),
    new WallCling('wallCling', { priority: 78, group: 'air' }),
    new Bounce('bounce', { priority: 76, group: 'air', onRequest: true }),
    new Roll('roll', { priority: 70, group: 'ground', crouching: true, capsule: TUNE.crouchHeight }),
    new Crawl('crawl', { priority: 68, group: 'ground', crouching: true, capsule: TUNE.crawlHeight }),
    new DoubleJump('doubleJump', { priority: 66, group: 'air' }),
    new Jump('jump', { priority: 64, group: 'air' }),
    new WallJump('wallJump', { priority: 62, group: 'air', onRequest: true }),
    new Paraglide('paraglide', { priority: 60, group: 'air' }),
    new Combo('combo', { priority: 55, group: 'action' }),
    new Pickpocket('pickpocket', { priority: 52, group: 'action' }),
    new Land('land', { priority: 50, group: 'ground' }),
    /* Below `land`, `pickpocket` and `combo` on purpose: a lock is a *stance*, and every one of
       those three is an action the player took while holding it. Above `skid` and everything
       under it, so the orbit owns ordinary ground locomotion for as long as the button is held. */
    new CombatStrafe('combatStrafe', { priority: 45, group: 'ground' }),
    new Skid('skid', { priority: 40, group: 'ground' }),
    new Fall('fall', { priority: 30, group: 'air' }),
    new Tiptoe('tiptoe', { priority: 20, group: 'ground' }),
    new Crouch('crouch', { priority: 12, group: 'ground', crouching: true, capsule: TUNE.crouchHeight }),
    new Sneak('sneak', { priority: 10, group: 'ground', sneaking: true }),
    new Move('move', { priority: 6, group: 'ground' }),
    new Idle('idle', { priority: 0, group: 'ground' }),
  ];
}

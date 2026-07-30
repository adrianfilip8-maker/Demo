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
  canEnter(c) { return c.grounded && c.landImpact > 3.2 && c._frame - c._landFrame <= 2; }
  enter(c) {
    const f = c.landImpact;
    c.landImpact = 0;
    const rolling = c.down('crouch') && c.speedXZ() > 3.0;
    this._t = rolling ? 0.24 : f >= TUNE.landHard ? TUNE.landHardTime : TUNE.landSoftTime;
    c.oneShot(rolling ? 'land_roll' : f >= TUNE.landHard ? 'land_hard' : 'land_soft');
    if (f >= TUNE.landHard) {
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
    return c.landImpact > 3.2 ? 'land' : c.wishMag > 0.12 ? 'move' : 'idle';
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
      c.engine.emit('caneSlam', { pos: c.position, radius: TUNE.diveRadius });
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
    if (c.probeWall(_a).ok) return true;
    if (c.wishMag > 0.5 && c.probeWall(c.wishDir).ok) return true;
    return false;
  }
  enter(c) {
    const w = c.wall;
    this._nx = w.nx; this._nz = w.nz;
    c.wallRunUsed++;
    c.lastWallRec = w.rec;
    travelDir(c, _a);
    // Head-on means "up"; glancing means "along". Both are Sly; the entry angle picks.
    const headOn = -dot2(_a.x, _a.z, this._nx, this._nz);
    this._vertical = headOn > 0.72;
    // Tangent along the wall: up × normal, signed toward the direction of travel.
    _b.set(0, 1, 0).cross(_c3.set(this._nx, 0, this._nz)).normalize();
    this._sign = dot2(_b.x, _b.z, _a.x, _a.z) >= 0 ? 1 : -1;
    this._tx = _b.x * this._sign; this._tz = _b.z * this._sign;
    // Wall on the left or the right, for the clip.
    _d.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    this._side = dot2(this._nx, this._nz, _d.x, _d.z) < 0 ? 'r' : 'l';
    if (this._vertical) c.velocity.y = Math.max(c.velocity.y, TUNE.wallRunUp);
    c.oneShot(`wall_run_${this._side}`);
    c.engine.emit('wallRun', { pos: c.position, normal: _c3 });
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

class WallCling extends State {
  canEnter(c) {
    if (c.grounded || c.sm.group !== 'air') return false;
    if (c.velocity.y > 1.2 || c.wishMag < 0.5) return false;
    if (!c.probeWall(c.wishDir).ok) return false;
    return -dot2(c.wishDir.x, c.wishDir.z, c.wall.nx, c.wall.nz) > 0.45;
  }
  enter(c) {
    this._nx = c.wall.nx; this._nz = c.wall.nz;
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
    c.engine.emit('wallJump', { pos: c.position });
  }
  update(c, dt) {
    c.applyJumpCut();
    c.turnToward(c.wishDir, TUNE.turnAir * 0.7, dt);
    c.accelerate(dt, TUNE.runSpeed, TUNE.accel * TUNE.airControl * 0.7, TUNE.airDrag);
    c.gravity(dt);
    c.move(dt);
    if (c.grounded) return c.landImpact > 3.2 ? 'land' : 'idle';
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
    c.engine.emit('ledgeGrab', { pos: c.position });
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
  canEnter(c) {
    if (c.sm.group === 'attach') return false;
    const a = c.afford('hook');
    if (!a) return false;
    // E always works; RMB lock-on works; and flying close enough grabs on its own, because
    // making the player press a button mid-chain is what kills a swing line.
    if (c.pressed('interact')) return a.distance <= TUNE.hookGrab;
    if (c.down('focus') && (c.pressed('jump') || c.pressed('attack'))) return a.distance <= TUNE.hookGrab;
    return !c.grounded && a.distance <= TUNE.hookAuto;
  }
  enter(c) {
    const a = c.afford('hook');
    c.anchor.copy(a ? a.point : c.position);
    c.attached = a ? a.rec : null;
    // Rope goes taut: place Sly on the sphere, keep only the tangential part of his velocity.
    _a.subVectors(c.position, c.anchor);
    if (_a.lengthSq() < 1e-4) _a.set(0, -1, 0);
    _a.normalize();
    c.position.copy(c.anchor).addScaledVector(_a, TUNE.hookL);
    const vr = c.velocity.dot(_a);
    c.velocity.addScaledVector(_a, -vr);
    c.grounded = false;
    c.oneShot('hook_grab');
    c.engine.emit('hookGrab', { pos: c.anchor });
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

    const bail = c.pressed('jump') || c.pressed('interact') || c.pressed('attack');
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
  exit(c) { c.attached = null; c.balance = 0; }
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
    r.speed = sign * Math.max(Math.abs(along), minSpeed);
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
  exit(c) { c.attached = null; c.balance = 0; }
}

class RailSlide extends RailBase {
  canEnter(c) {
    if (c.sm.group === 'attach') return false;
    const a = c.afford('rail');
    if (!a) return false;
    if (c.pressed('interact') && a.distance <= TUNE.railMount * 1.6) return true;
    // Auto-engage on contact from above (§ affordance discovery). Generous on purpose.
    if (!c.grounded && c.velocity.y <= 0.6 && a.distance <= TUNE.railMount
        && a.point.y <= c.position.y + 0.65) return true;
    return false;
  }
  enter(c) {
    const a = c.afford('rail');
    if (!a) { c.sm.request('fall'); return; }
    this.mount(c, a, TUNE.railSpeed);
    c.oneShot('rail_slide');
    c.engine.emit('railMount', { pos: c.position });
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
    c.engine.emit('poleMount', { pos: c.position });
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
  exit(c) { c.attached = null; }
}

/** Pole swing — wind up around the shaft and let go for a long horizontal launch. */
class PoleSwing extends State {
  enter(c) { c.oneShot('pole_swing'); this._spin = 0; }
  update(c, dt) {
    const p = c.pole;
    const dir = c.wishRaw.x !== 0 ? -Math.sign(c.wishRaw.x) : 1;
    const w = TUNE.poleSwingSpin * dir;
    p.angle += w * dt;
    this._spin += Math.abs(w) * dt;
    c.position.x = p.x + Math.sin(p.angle) * p.hold;
    c.position.z = p.z + Math.cos(p.angle) * p.hold;
    // Tangent of the orbit at the current angle.
    _a.set(Math.cos(p.angle), 0, -Math.sin(p.angle)).multiplyScalar(dir);
    c.yaw = Math.atan2(_a.x, _a.z);
    c.velocity.set(0, 0, 0);
    if (c.sm.time >= TUNE.poleSwingTime || c.pressed('jump') || c.pressed('attack')) {
      const sp = Math.abs(w) * p.hold * TUNE.poleSwingLaunch + 5.0;
      c.velocity.set(_a.x * sp, 0, _a.z * sp);
      c.pendingLaunch = TUNE.jumpV0 * 0.8;
      c.airJumps = 1;
      return 'jump';
    }
    c.baseClip('pole_swing', 0.12);
    return null;
  }
  exit(c) { c.attached = null; }
}

/* ====================================================================== */
/* Ninja Spire Landing                                                     */
/* ====================================================================== */

class SpireLand extends State {
  canEnter(c) {
    if (c.grounded || c.sm.group === 'attach') return false;
    if (c.velocity.y > 0.8) return false;
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
    c.engine.emit('spireLand', { pos: c.position });
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
  exit(c) { c.attached = null; c.balance = 0; this._off = 0; }
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

class Pickpocket extends State {
  canEnter(c) {
    if (!c.grounded || !c.pressed('interact')) return false;
    // E is overloaded; traversal wins it. Only pick a pocket when nothing is grabbable.
    if (c.afford('hook')) return false;
    if (c.afford('rail')) return false;
    if (c.afford('pole')) return false;
    return true;
  }
  enter(c) {
    c.velocity.x *= 0.2; c.velocity.z *= 0.2;
    c.oneShot('pickpocket');
    c.engine.emit('pickpocket', { pos: c.position, yaw: c.yaw, range: TUNE.pickRange });
  }
  update(c, dt) {
    if (!c.grounded) return 'fall';
    c.accelerate(dt, 0, TUNE.accel, TUNE.decel * 2);
    c.gravity(dt);
    c.move(dt);
    if (c.sm.time >= TUNE.pickTime) return 'idle';
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
    new HookSwing('hookSwing', { priority: 86, group: 'attach' }),
    new RailSlide('railSlide', { priority: 84, group: 'attach' }),
    new RailWalk('railWalk', { priority: 83, group: 'attach' }),
    new PoleClimb('poleClimb', { priority: 82, group: 'attach' }),
    new PoleSwing('poleSwing', { priority: 81, group: 'attach', onRequest: true }),
    new WallRun('wallRun', { priority: 80, group: 'air' }),
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
    new Skid('skid', { priority: 40, group: 'ground' }),
    new Fall('fall', { priority: 30, group: 'air' }),
    new Tiptoe('tiptoe', { priority: 20, group: 'ground' }),
    new Crouch('crouch', { priority: 12, group: 'ground', crouching: true, capsule: TUNE.crouchHeight }),
    new Sneak('sneak', { priority: 10, group: 'ground', sneaking: true }),
    new Move('move', { priority: 6, group: 'ground' }),
    new Idle('idle', { priority: 0, group: 'ground' }),
  ];
}

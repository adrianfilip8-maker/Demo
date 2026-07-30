import * as THREE from 'three';
import { Rig, PoseBuffer, eulerDeg } from './Rig.js';
import { CLIPS, CLIP_NAMES, MISSING, sampleInto, sampleCane } from './Clips.js';

/**
 * Animation.js — the ANIMATION module (AGENTS.md §4.7).
 *
 * MOVEMENT says *what Sly is doing*; this decides *what that looks like*. Nothing outside
 * this file ever touches a bone.
 *
 * The frame, in order:
 *
 *   1. **Blend tree** — an 8-way locomotion blend (idle/walk/run/run_fast × stand/sneak/crouch)
 *      plus turn-in-place, all sharing one stride phase so a walk can cross-fade into a run
 *      mid-step without the feet swapping or skating.
 *   2. **Tracks** — explicit clips MOVEMENT asked for, layered over the tree and cross-fading
 *      against it. One-shots sit on top and hand the body back when they end.
 *   3. **Additive** — breathing, lean into turns and acceleration, landing squash. These ride
 *      on top of the keyframes so they never fight the authored pose.
 *   4. **Procedural** (Rig.js) — look-at, tail spring chain, cap/ear overshoot, hit impulses,
 *      and two-bone foot IK planted on the real ground normal.
 *
 * Everything degrades: no CHARACTER, no COLLISION, no MOVEMENT — it still renders a pose.
 */

/* ========================================================================== */

export const ANIM_TUNE = {
  /* --- blending --- */
  fade: 0.12,               // default cross-fade (§4.7 default)
  treeFade: 0.18,           // how fast the locomotion tree takes the body back
  stanceRate: 7.0,          // sneak/crouch stance cross-fade rate
  speedSmooth: 9.0,         // low-pass on locomotion speed; raw speed makes the tree buzz

  /* --- stride phase --- */
  strideMin: 0.35,          // cycles/s floor so a crawl at 0.2 m/s still animates
  strideMax: 3.4,           // cycles/s ceiling — a physics spike must not flicker the legs
  turnCycle: 1.7,           // rad of yaw per turn-in-place cycle

  /* --- speed axis breakpoints (m/s) --- */
  standAxis: [0.0, 2.6, 5.4, 7.6],
  sneakAxis: [0.0, 1.5],
  crouchAxis: [0.0, 1.7],
  moveFloor: 0.22,          // below this he is standing still, whatever the physics says

  /* --- lean --- */
  leanTurn: 4.6,            // degrees of bank per rad/s of turn
  leanTurnMax: 15,
  leanAccel: 0.55,          // degrees of pitch per m/s² of acceleration
  leanAccelMax: 11,
  leanRate: 6.5,

  /* --- breathing (idles only) --- */
  breathRate: 0.44,         // Hz
  breathAmp: 2.1,           // degrees at the chest
  breathScale: 0.022,

  /* --- landing squash, §6: 0.82 scale-y over 90 ms, ease-out back --- */
  squashIn: 0.09,
  squashOut: 0.26,
  squashScale: 0.18,        // 1 - 0.82
  squashKnee: 26,           // degrees of extra knee fold at full squash

  /* --- procedural layer weights --- */
  lookWeight: 1.0,
  ikGround: 1.0,
  ikAirRate: 5.0,
};

/* Nodes of the locomotion tree. Eight of them: two axes, speed × stance. */
const TREE = [
  { clip: 'idle_confident', stance: 0, i: 0 },
  { clip: 'walk', stance: 0, i: 1 },
  { clip: 'run', stance: 0, i: 2 },
  { clip: 'run_fast', stance: 0, i: 3 },
  { clip: 'sneak_idle', stance: 1, i: 0 },
  { clip: 'sneak_walk', stance: 1, i: 1 },
  { clip: 'crouch_idle', stance: 2, i: 0 },
  { clip: 'crouch_walk', stance: 2, i: 1 },
];

/** Clips MOVEMENT plays that mean "let the tree drive", not "override the body". */
const TREE_CLIPS = {
  idle_confident: 0, idle_bored: 0, idle_look: 0,
  walk: 0, run: 0, run_fast: 0,
  sneak_idle: 1, sneak_walk: 1,
  crouch_idle: 2, crouch_walk: 2,
};

/** Clips whose feet are not on the floor — foot IK must keep its hands off them. */
const AIRBORNE = new Set([
  'jump_rise', 'jump_apex', 'jump_fall', 'double_jump', 'paraglide',
  'wall_run_l', 'wall_run_r', 'wall_jump', 'wall_cling',
  'ledge_hang', 'ledge_shimmy_l', 'ledge_shimmy_r',
  'hook_grab', 'hook_swing', 'hook_release',
  'pole_climb', 'pole_slide', 'pole_swing',
  'rail_slide', 'rail_walk', 'balance_idle',
  'spire_land', 'spire_balance', 'perch_idle',
  'dive_attack', 'roll', 'land_roll', 'crawl', 'ko',
]);

/** Idles get breathing; a run does not need a chest wobble on top of the hammering. */
const BREATHES = new Set([
  'idle_confident', 'idle_bored', 'idle_look', 'perch_idle', 'balance_idle',
  'sneak_idle', 'crouch_idle', 'ledge_hang', 'wall_cling', 'spire_balance', 'ko',
]);

const TRACK_MAX = 6;
const IMPULSE_MAX = 4;
const D2R = Math.PI / 180;

/* ---- module-scope scratch — update() allocates nothing ------------------- */
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _w = new Float32Array(TREE.length);
const _stance = new Float32Array(3);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ========================================================================== */

export class Animation {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    this.character = null;
    this.rig = null;
    this.pose = null;
    this.ready = false;

    /* ---- locomotion state pushed by MOVEMENT (copied, never retained) ---- */
    this.loco = {
      speed: 0, maxSpeed: 7.2, grounded: true, sneaking: false, crouching: false,
      airborne: false, verticalVelocity: 0, turnRate: 0, slope: 0, surface: 'stone',
    };
    this.smoothSpeed = 0;
    this.prevSpeed = 0;
    this.accel = 0;

    /* ---- tree ---- */
    this.stanceW = new Float32Array([1, 0, 0]);
    this.stanceHint = 0;
    this.treeW = 1;
    this.phase = 0;          // shared stride phase, 0..1
    this.treeTime = 0;       // free-running clock for the non-strided idles
    this.turnPhase = 0;
    this.turnW = 0;
    this._treeEvClip = null;
    this._treePhasePrev = 0;

    /* ---- tracks ---- */
    this.tracks = [];
    for (let i = 0; i < TRACK_MAX; i++) {
      this.tracks.push({
        clip: null, time: 0, prevTime: 0, w: 0, target: 0, fade: 0.12,
        loop: true, speed: 1, lock: false, base: false, ending: false,
      });
    }

    /* ---- additive ---- */
    this.lean = { bank: 0, pitch: 0 };
    this.squash = 0;
    this.squashT = -1;
    this.breath = 0;

    /* ---- impulses ---- */
    this.impulses = [];
    for (let i = 0; i < IMPULSE_MAX; i++) {
      this.impulses.push({ bone: '', dir: new THREE.Vector3(), strength: 0, decay: 6, life: 0, dur: 0.45, active: false });
    }

    /* ---- events ---- */
    this._listeners = new Map();
    this._evtPayload = { surface: 'stone', foot: 'L', power: 1, index: 0, force: 0 };

    /* ---- cane ---- */
    this.canePivot = null;
    this.caneBase = new THREE.Quaternion();
    this.caneCur = new THREE.Quaternion();
    this.caneTarget = new THREE.Quaternion();
    this.caneHas = false;

    /* ---- freeze ---- */
    this.frozen = null;
    this.frozenT = 0;

    this.lookTarget = new THREE.Vector3();
    this.lookOn = false;
    this._warned = Object.create(null);
    this._ikW = 1;
  }

  /* ====================================================================== */
  /*  init                                                                  */
  /* ====================================================================== */

  async init() {
    if (MISSING.length) {
      this.engine.warn(`ANIMATION: clips missing from Clips.js: ${MISSING.join(', ')}`);
    }
    this._bind();
    // CHARACTER may still be building (or may have failed); pick it up when it lands.
    this._offReady = this.engine.on('characterReady', () => this._bind());
  }

  /** Attach to SlyModel. Safe to call repeatedly; a no-op once it has taken. */
  _bind() {
    if (this.ready) return true;
    const ch = this.engine.get('character');
    if (!ch?.bones?.hips || !ch.boneNames?.length) return false;

    this.character = ch;
    this.rig = new Rig(this.engine, ch);
    if (!this.rig.ok) {
      if (!this._warned.rig) {
        this._warned.rig = 1;
        this.engine.warn('ANIMATION: SlyModel skeleton is incomplete — running without a rig.');
      }
      return false;
    }
    this.pose = new PoseBuffer(ch.boneNames);

    const pivot = ch._attachPoints?.cane || null;
    if (pivot) {
      this.canePivot = pivot;
      this.caneBase.copy(pivot.quaternion);
      this.caneCur.identity();
      this.caneTarget.identity();
    }

    this.ready = true;
    // Start on the money pose rather than one frame of bind.
    this.play('idle_confident', { fade: 0 });
    return true;
  }

  /* ====================================================================== */
  /*  §4.7 public API                                                       */
  /* ====================================================================== */

  play(clip, opts) {
    const name = typeof clip === 'string' ? clip : clip?.name;
    const c = CLIPS[name];
    if (!c) {
      if (!this._warned[`c:${name}`]) {
        this._warned[`c:${name}`] = 1;
        this.engine.warn(`ANIMATION: unknown clip "${name}" — ignored.`);
      }
      return null;
    }
    const fade = opts?.fade ?? ANIM_TUNE.fade;
    const loop = opts?.loop !== false;
    const speed = opts?.speed ?? 1;
    const weight = opts?.weight ?? 1;
    const lock = !!opts?.lock;

    // A locked clip owns the body until it is done.
    for (const tr of this.tracks) {
      if (tr.clip && tr.lock && tr.w > 0.02 && !tr.ending && tr.clip !== c) return null;
    }

    const stance = TREE_CLIPS[name];
    if (stance !== undefined) {
      // MOVEMENT is describing locomotion — hand the body to the blend tree, which knows
      // more about it (real speed, real turn rate) than a single clip name does.
      this.stanceHint = stance;
      for (const tr of this.tracks) if (tr.clip && !tr.lock) this._end(tr, fade || ANIM_TUNE.treeFade);
      return null;
    }

    // Already running? Retarget it instead of restarting — MOVEMENT re-asserts base clips
    // every frame and a restart would stutter the cycle.
    for (const tr of this.tracks) {
      if (tr.clip === c && !tr.ending) {
        tr.target = weight; tr.loop = loop || tr.loop; tr.speed = speed; tr.lock = tr.lock || lock;
        if (loop) this._demoteOthers(tr, fade);
        return tr;
      }
    }

    const tr = this._alloc();
    tr.clip = c;
    tr.time = 0; tr.prevTime = -1e-4;
    tr.w = fade > 0 ? 0 : weight;
    tr.target = weight;
    tr.fade = Math.max(0.001, fade);
    tr.loop = loop;
    tr.speed = speed;
    tr.lock = lock;
    tr.base = loop;
    tr.ending = false;
    if (loop) this._demoteOthers(tr, fade);
    return tr;
  }

  stop(clip, fade = ANIM_TUNE.fade) {
    const name = typeof clip === 'string' ? clip : clip?.name;
    for (const tr of this.tracks) if (tr.clip?.name === name) this._end(tr, fade);
  }

  isPlaying(clip) {
    const name = typeof clip === 'string' ? clip : clip?.name;
    if (this.frozen) return this.frozen.name === name;
    for (const tr of this.tracks) if (tr.clip?.name === name && tr.w > 0.01 && !tr.ending) return true;
    // The tree is "playing" whichever locomotion clip currently carries the most weight.
    if (TREE_CLIPS[name] !== undefined && this.treeW > 0.05) {
      this._treeWeights();
      for (let i = 0; i < TREE.length; i++) if (TREE[i].clip === name && _w[i] > 0.15) return true;
    }
    return false;
  }

  /** Continuous locomotion state. Fields are copied — the caller reuses its object. */
  setLocomotion(s) {
    if (!s) return;
    const L = this.loco;
    L.speed = +s.speed || 0;
    L.maxSpeed = +s.maxSpeed || 7.2;
    L.grounded = !!s.grounded;
    L.airborne = s.airborne !== undefined ? !!s.airborne : !s.grounded;
    L.sneaking = !!s.sneaking;
    L.crouching = !!s.crouching;
    L.verticalVelocity = +s.verticalVelocity || 0;
    L.turnRate = +s.turnRate || 0;
    L.slope = +s.slope || 0;
    L.surface = s.surface || 'stone';
  }

  setLookAt(worldPos) {
    if (worldPos) { this.lookTarget.copy(worldPos); this.lookOn = true; }
    else this.lookOn = false;
    this.rig?.setLookAt(this.lookOn ? this.lookTarget : null);
  }

  /**
   * A shove on a bone. `bone: 'root'` is the landing/impact channel — rotating the root would
   * tip the whole character through the floor, so it drives the squash spring instead, which
   * is what a body actually does when something hits it hard.
   */
  addImpulse(imp) {
    if (!imp) return;
    if (!imp.bone || imp.bone === 'root' || imp.bone === 'hips') {
      const s = clamp01(Math.abs(imp.strength ?? 1));
      if (s > this.squash * 0.6) { this.squashT = 0; this.squash = Math.max(this.squash, s); }
      this._emit('land', { force: s * 18, surface: this.loco.surface });
      if (!imp.bone || imp.bone === 'root') return;
    }
    let slot = null;
    for (const s of this.impulses) if (!s.active) { slot = s; break; }
    if (!slot) { slot = this.impulses[0]; for (const s of this.impulses) if (s.life < slot.life) slot = s; }
    slot.bone = imp.bone;
    slot.dir.copy(imp.dir || _v0.set(0, -1, 0));
    if (slot.dir.lengthSq() < 1e-8) slot.dir.set(0, -1, 0);
    slot.strength = THREE.MathUtils.clamp(imp.strength ?? 1, -3, 3);
    slot.decay = imp.decay ?? 6;
    slot.dur = 0.34 + 0.5 / Math.max(1, slot.decay);
    slot.life = slot.dur;
    slot.active = true;
  }

  /** Screenshot harness: hold one frame. `phase` (0..1) is a debug extra for filmstrips. */
  freezePose(name, phase) {
    const c = CLIPS[name];
    if (!c) {
      this.engine.warn(`ANIMATION: freezePose("${name}") — no such clip.`);
      return false;
    }
    this.frozen = c;
    this.frozenT = phase === undefined || phase === null
      ? c.hold
      : THREE.MathUtils.clamp(phase, 0, 1) * c.dur;
    // Springs must not drag a stale swing into a still frame.
    this.rig?.settle();
    this.lean.bank = 0; this.lean.pitch = 0;
    this.squash = 0; this.squashT = -1;
    this.breath = 0;
    for (const s of this.impulses) s.active = false;
    this._ikW = AIRBORNE.has(name) ? 0 : 1;
    return true;
  }

  unfreezePose() {
    if (!this.frozen) return;
    this.frozen = null;
    this.rig?.settle();
  }

  clipNames() { return CLIP_NAMES.slice(); }

  /** 'footstep' {surface,foot} · 'cane_hit' {index} · 'land' {force} */
  onEvent(name, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this._listeners.get(name)?.delete(fn);
  }

  /* ====================================================================== */
  /*  frame                                                                 */
  /* ====================================================================== */

  update(dt, t) {
    if (!this.ready && !this._bind()) return;
    const d = dt > 0 ? Math.min(dt, 1 / 20) : 0;

    this.pose.clear();
    this.caneHas = false;

    if (this.frozen) {
      sampleInto(this.frozen, this.frozenT, this.pose, 1);
      this.caneHas = sampleCane(this.frozen, this.frozenT, this.caneTarget);
    } else {
      this._advance(d, t);
      this._sampleTree(d);
      this._sampleTracks();
      this._additive(d, t);
    }

    this.rig.commit(this.pose);
    this.rig.sampleMotion(d);
    this.rig.yawRate = this.loco.turnRate;

    this._runImpulses(d);
    this.rig.lookAtLayer(d, this.lookOn ? ANIM_TUNE.lookWeight : 0);
    this.rig.springLayer(d, 1);
    this.rig.tailLayer(d, 1);
    this._footIK(d);
    this._applyCane(d);
  }

  /* ---------------------------------------------------------------- tracks */

  _alloc() {
    for (const tr of this.tracks) if (!tr.clip) return tr;
    let worst = this.tracks[0];
    for (const tr of this.tracks) if (tr.w < worst.w && !tr.lock) worst = tr;
    return worst;
  }

  _end(tr, fade) {
    if (!tr.clip || tr.ending) return;
    tr.ending = true;
    tr.lock = false;
    tr.target = 0;
    tr.fade = Math.max(0.001, fade ?? ANIM_TUNE.fade);
  }

  /** A new looping base retires the old one; one-shots are left to finish on top. */
  _demoteOthers(keep, fade) {
    for (const tr of this.tracks) {
      if (tr === keep || !tr.clip) continue;
      if (tr.loop) this._end(tr, fade || ANIM_TUNE.fade);
    }
  }

  _advance(dt, t) {
    const L = this.loco;
    const k = 1 - Math.exp(-ANIM_TUNE.speedSmooth * Math.max(dt, 1e-4));
    this.smoothSpeed += (L.speed - this.smoothSpeed) * k;
    if (dt > 1e-4) {
      const a = (this.smoothSpeed - this.prevSpeed) / dt;
      this.accel += (a - this.accel) * Math.min(1, dt * 8);
    }
    this.prevSpeed = this.smoothSpeed;

    /* stance cross-fade */
    const hint = this.stanceHint;
    const wantSneak = (L.sneaking || hint === 1) && !L.crouching ? 1 : 0;
    const wantCrouch = (L.crouching || hint === 2) ? 1 : 0;
    const sr = 1 - Math.exp(-ANIM_TUNE.stanceRate * Math.max(dt, 1e-4));
    this.stanceW[1] += (wantSneak - this.stanceW[1]) * sr;
    this.stanceW[2] += (wantCrouch - this.stanceW[2]) * sr;
    this.stanceW[0] = Math.max(0, 1 - this.stanceW[1] - this.stanceW[2]);

    /* shared stride phase — the reason the feet don't skate through a blend */
    const stride = this._strideLength();
    let rate = stride > 0 ? this.smoothSpeed / stride : 0;
    if (rate > 0 && rate < ANIM_TUNE.strideMin) rate = ANIM_TUNE.strideMin;
    rate = Math.min(rate, ANIM_TUNE.strideMax);
    this._treePhasePrev = this.phase;
    this.phase = (this.phase + rate * dt) % 1;
    this.treeTime += dt;

    /* turn in place: only meaningful when he is not really going anywhere */
    const still = 1 - clamp01((this.smoothSpeed - ANIM_TUNE.moveFloor) / 1.4);
    const wantTurn = clamp01((Math.abs(L.turnRate) - 0.45) / 2.2) * still * this.stanceW[0];
    this.turnW += (wantTurn - this.turnW) * Math.min(1, dt * 8);
    this.turnPhase = (this.turnPhase + (Math.abs(L.turnRate) / ANIM_TUNE.turnCycle) * dt) % 1;

    /* track fades + playheads */
    let used = 0;
    for (const tr of this.tracks) {
      if (!tr.clip) continue;
      const step = tr.fade > 0 ? dt / tr.fade : 1;
      if (tr.w < tr.target) tr.w = Math.min(tr.target, tr.w + step);
      else if (tr.w > tr.target) tr.w = Math.max(tr.target, tr.w - step);

      tr.prevTime = tr.time;
      const clipRate = tr.clip.stride > 0
        ? Math.min(ANIM_TUNE.strideMax, Math.max(ANIM_TUNE.strideMin, this.smoothSpeed / tr.clip.stride)) * tr.clip.dur
        : 1;
      tr.time += dt * tr.speed * clipRate;

      this._trackEvents(tr);

      if (!tr.loop && tr.time >= tr.clip.dur && !tr.ending) this._end(tr, ANIM_TUNE.fade);
      if (tr.ending && tr.w <= 0.001) { tr.clip = null; tr.w = 0; tr.lock = false; continue; }
      used += tr.w;
    }
    this.treeW = clamp01(1 - used);

    /* landing squash envelope: fast in, ease-out back (§6) */
    if (this.squashT >= 0) {
      this.squashT += dt;
      if (this.squashT > ANIM_TUNE.squashIn + ANIM_TUNE.squashOut) { this.squashT = -1; this.squash = 0; }
    }
    void t;
  }

  /** Weighted mean stride of every moving node — the blend's real ground speed. */
  _strideLength() {
    this._treeWeights();
    let s = 0, w = 0;
    for (let i = 0; i < TREE.length; i++) {
      const c = CLIPS[TREE[i].clip];
      if (!c?.stride || _w[i] <= 0) continue;
      s += c.stride * _w[i]; w += _w[i];
    }
    for (const tr of this.tracks) {
      if (!tr.clip?.stride || tr.w <= 0) continue;
      s += tr.clip.stride * tr.w; w += tr.w;
    }
    return w > 1e-3 ? s / w : 0;
  }

  /* ------------------------------------------------------------------ tree */

  /** Fill `_w` with the 8 node weights: a speed axis inside each stance. */
  _treeWeights() {
    _w.fill(0);
    _stance[0] = this.stanceW[0]; _stance[1] = this.stanceW[1]; _stance[2] = this.stanceW[2];
    const sp = Math.max(0, this.smoothSpeed);
    const T = ANIM_TUNE;

    // stand: idle → walk → run → run_fast
    if (_stance[0] > 1e-3) this._axis(sp, T.standAxis, _stance[0], 0);
    if (_stance[1] > 1e-3) this._axis(sp, T.sneakAxis, _stance[1], 4);
    if (_stance[2] > 1e-3) this._axis(sp, T.crouchAxis, _stance[2], 6);
    return _w;
  }

  /** Piecewise-linear 1-D blend across `pts` speeds, into `_w` starting at `base`. */
  _axis(sp, pts, weight, base) {
    const n = pts.length;
    if (sp <= pts[0] + 1e-4) { _w[base] += weight; return; }
    if (sp >= pts[n - 1]) { _w[base + n - 1] += weight; return; }
    for (let i = 0; i < n - 1; i++) {
      if (sp <= pts[i + 1]) {
        let f = (sp - pts[i]) / (pts[i + 1] - pts[i]);
        // Ease the idle→move edge so a nudge of the stick doesn't half-play a walk.
        if (i === 0) f = clamp01((sp - ANIM_TUNE.moveFloor) / (pts[1] - ANIM_TUNE.moveFloor));
        _w[base + i] += weight * (1 - f);
        _w[base + i + 1] += weight * f;
        return;
      }
    }
  }

  _sampleTree(dt) {
    if (this.treeW <= 0.001) return;
    this._treeWeights();
    let dom = null, domW = 0;
    for (let i = 0; i < TREE.length; i++) {
      const nw = _w[i];
      if (nw <= 0.002) continue;
      const c = CLIPS[TREE[i].clip];
      if (!c) continue;
      const time = c.stride > 0 ? this.phase * c.dur : this.treeTime;
      sampleInto(c, time, this.pose, nw * this.treeW);
      if (nw > domW) { domW = nw; dom = c; }
      if (!this.caneHas && nw > 0.4) this.caneHas = sampleCane(c, time, this.caneTarget);
    }

    // Turn-in-place rides on top of the idle: it is a whole-body wind, not a leg cycle.
    if (this.turnW > 0.01) {
      const c = CLIPS[this.loco.turnRate > 0 ? 'turn_l' : 'turn_r'];
      if (c) sampleInto(c, this.turnPhase * c.dur, this.pose, this.turnW * this.treeW * 0.85);
    }

    this._treeEvents(dom);
    void dt;
  }

  _sampleTracks() {
    for (const tr of this.tracks) {
      if (!tr.clip || tr.w <= 0.001) continue;
      sampleInto(tr.clip, tr.time, this.pose, tr.w);
      if (tr.w > 0.35) {
        if (sampleCane(tr.clip, tr.time, _q0)) {
          if (!this.caneHas) { this.caneTarget.copy(_q0); this.caneHas = true; }
          else this.caneTarget.slerp(_q0, tr.w);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- events */

  _emit(name, data) {
    const set = this._listeners.get(name);
    if (set) for (const fn of set) { try { fn(data); } catch (e) { this.engine.warn(`ANIMATION: "${name}" handler threw: ${e?.message}`); } }
    this.engine.emit(name, data);
  }

  _fire(ev) {
    const p = this._evtPayload;
    p.surface = this.loco.surface;
    p.foot = ev.d?.foot || 'L';
    p.power = ev.d?.power ?? 1;
    p.index = ev.d?.index ?? 0;
    p.force = (ev.d?.force ?? 0) * 18;
    this._emit(ev.n, p);
  }

  /** Fire everything the playhead crossed this frame, wrap included. */
  _trackEvents(tr) {
    const evs = tr.clip.events;
    if (!evs.length) return;
    const dur = tr.clip.dur;
    let a = tr.prevTime, b = tr.time;
    if (b <= a) return;
    if (tr.loop) {
      const la = ((a % dur) + dur) % dur;
      const lb = la + (b - a);
      for (const e of evs) {
        if ((e.t > la && e.t <= lb) || (e.t + dur > la && e.t + dur <= lb)) this._fire(e);
      }
    } else {
      for (const e of evs) if (e.t > a && e.t <= b) this._fire(e);
    }
  }

  /** Locomotion events come off the dominant node's phase, so a blend fires once per step. */
  _treeEvents(dom) {
    if (!dom || !dom.events.length || !dom.stride || this.treeW < 0.35) { this._treeEvClip = dom; return; }
    if (this._treeEvClip !== dom) { this._treeEvClip = dom; return; }
    const a = this._treePhasePrev, b = this.phase;
    const wrapped = b < a;
    for (const e of dom.events) {
      const p = e.t / dom.dur;
      if (wrapped ? (p > a || p <= b) : (p > a && p <= b)) this._fire(e);
    }
  }

  /* -------------------------------------------------------------- additive */

  /**
   * Layers a keyframe should not carry: breath, the lean into a turn or an acceleration, and
   * the landing squash. All post-multiplied onto the sampled pose so they bend the authored
   * shape instead of replacing it.
   */
  _additive(dt, t) {
    const T = ANIM_TUNE;
    const L = this.loco;

    /* lean — bank into the turn, pitch into the acceleration */
    const wantBank = THREE.MathUtils.clamp(-L.turnRate * T.leanTurn, -T.leanTurnMax, T.leanTurnMax)
      * clamp01(this.smoothSpeed / 3.0);
    const wantPitch = THREE.MathUtils.clamp(this.accel * T.leanAccel, -T.leanAccelMax, T.leanAccelMax);
    const lr = 1 - Math.exp(-T.leanRate * Math.max(dt, 1e-4));
    this.lean.bank += (wantBank - this.lean.bank) * lr;
    this.lean.pitch += (wantPitch - this.lean.pitch) * lr;
    if (Math.abs(this.lean.bank) > 0.05 || Math.abs(this.lean.pitch) > 0.05) {
      const b = this.lean.bank, p = this.lean.pitch;
      this._rot('hips', p * 0.5, 0, b * 0.55);
      this._rot('spine', p * 0.25, 0, b * 0.22);
      this._rot('chest', p * 0.25, 0, b * 0.23);
      // The head stays level — it is the one part of him that never commits.
      this._rot('neck', -p * 0.3, 0, -b * 0.25);
      this._rot('head', -p * 0.3, 0, -b * 0.35);
    }

    /* breathing, idles only */
    let breathW = 0;
    if (this.treeW > 0.2 && this.smoothSpeed < 0.6) breathW = this.treeW;
    for (const tr of this.tracks) if (tr.clip && BREATHES.has(tr.clip.name)) breathW = Math.max(breathW, tr.w);
    if (breathW > 0.01) {
      const ph = t * T.breathRate * Math.PI * 2;
      const s = Math.sin(ph);
      const a = T.breathAmp * breathW;
      this._rot('chest', -a, 0, 0);
      this._rot('spine', a * 0.45, 0, 0);
      this._rot('neck', -a * 0.35 * s, 0, 0);
      this._scale('chest', 1 + T.breathScale * s * breathW, 1 + T.breathScale * 0.6 * s * breathW, 1 + T.breathScale * s * breathW);
      this._rot('shoulderL', 0, 0, -a * 0.4 * s);
      this._rot('shoulderR', 0, 0, a * 0.4 * s);
    }

    /* landing squash */
    if (this.squashT >= 0 && this.squash > 0.01) {
      const T2 = ANIM_TUNE;
      // Straight in over 90 ms, then an ease-out cubic release — the recoil reads as elastic.
      const u = clamp01((this.squashT - T2.squashIn) / T2.squashOut);
      const env = this.squashT <= T2.squashIn
        ? this.squashT / T2.squashIn
        : (1 - u) * (1 - u) * (1 - u);
      const s = env * this.squash * T2.squashScale;
      if (s > 0.002) {
        this._scale('hips', 1 + s * 0.9, 1 - s, 1 + s * 0.85);
        this._scale('chest', 1 + s * 0.6, 1 - s * 0.7, 1 + s * 0.55);
        this._scale('head', 1 + s * 0.35, 1 - s * 0.4, 1 + s * 0.3);
        const knee = s * ANIM_TUNE.squashKnee / T2.squashScale;
        this._rot('upperLegL', -knee * 0.55, 0, 0);
        this._rot('upperLegR', -knee * 0.55, 0, 0);
        this._rot('lowerLegL', knee, 0, 0);
        this._rot('lowerLegR', knee, 0, 0);
        this._rot('footL', -knee * 0.42, 0, 0);
        this._rot('footR', -knee * 0.42, 0, 0);
        this._rot('spine', knee * 0.12, 0, 0);
      }
    }
  }

  _rot(bone, x, y, z) {
    if (!x && !y && !z) return;
    eulerDeg(x, y, z, _q1);
    this.pose.rotate(bone, _q1);
  }

  _scale(bone, x, y, z) { this.pose.mulScale(bone, x, y, z); }

  /* ------------------------------------------------------------- impulses */

  _runImpulses(dt) {
    for (const s of this.impulses) {
      if (!s.active) continue;
      if (!this.rig.applyImpulse(s, dt)) s.active = false;
    }
  }

  /* ---------------------------------------------------------------- footIK */

  _footIK(dt) {
    let want = this._ikW;
    if (!this.frozen) {
      want = this.loco.grounded ? ANIM_TUNE.ikGround : 0;
      // An airborne authored clip (a swing, a hang) must not have its legs dragged down.
      for (const tr of this.tracks) if (tr.clip && tr.w > 0.5 && AIRBORNE.has(tr.clip.name)) want = 0;
      const r = 1 - Math.exp(-ANIM_TUNE.ikAirRate * Math.max(dt, 1e-4));
      this._ikW += (want - this._ikW) * r;
    } else this._ikW = want;
    const yaw = this.character.root.rotation.y;
    this.rig.footIK(dt, this._ikW, yaw);
  }

  /* ------------------------------------------------------------------ cane */

  /**
   * Re-aim the cane inside the fist. CHARACTER owns where the grip is; ANIMATION owns where
   * the cane points, because "over the shoulder", "hooked on a ring" and "speared at the
   * floor" are animation decisions, not model ones.
   */
  _applyCane(dt) {
    if (!this.canePivot) return;
    if (!this.caneHas) this.caneTarget.identity();
    const k = this.frozen ? 1 : 1 - Math.exp(-16 * Math.max(dt, 1e-4));
    this.caneCur.slerp(this.caneTarget, k);
    this.canePivot.quaternion.copy(this.caneCur).multiply(this.caneBase);
    this.canePivot.updateMatrixWorld(true);
  }

  /* ====================================================================== */

  dispose() {
    this._offReady?.();
    if (this.canePivot) {
      this.canePivot.quaternion.copy(this.caneBase);
      this.canePivot = null;
    }
    this._listeners.clear();
    this.rig?.dispose();
    this.rig = null;
    this.pose = null;
    this.character = null;
    this.ready = false;
  }
}

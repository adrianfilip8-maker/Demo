import * as THREE from 'three';

/**
 * Rig.js — everything between "a pose" and "bones in the world".
 *
 * Three jobs, in this order every frame:
 *   1. `PoseBuffer` — a weighted quaternion accumulator. The blend tree in Animation.js pours
 *      poses into these; the rig writes the result onto the skeleton.
 *   2. Analytic IK — a two-bone solver used for foot planting (and reusable for hands).
 *   3. Procedural layers that a keyframe can't express: the tail spring chain, the look-at
 *      chain, cap/ear overshoot springs, and foot planting on the real ground normal.
 *
 * Conventions this file depends on (they are the CHARACTER contract, see SlyModel.js):
 *   · every bone's bind rotation is identity, so a bone's local axes are world-aligned in bind
 *     pose. That is what makes hand-authored Euler XYZ poses readable and mirrorable.
 *   · +X is Sly's LEFT, +Z is his FORWARD, root origin is at his feet.
 *
 * Reading the sign conventions (used all through Clips.js):
 *   spine chain   +X pitch forward · +Y turn left · +Z roll right
 *   head          +X look down     · −X chin up
 *   upperLeg      −X swing forward (knee up) · +X swing back
 *   lowerLeg      +X knee flexion (heel toward the tail)
 *   foot          +X toe down (push-off) · −X toe up (heel strike)
 *   upperArm      −X swing forward · +X swing back · L +Z raises, R −Z raises
 *   tail          +X lifts the tail · +Y sweeps it to his right
 */

const D2R = Math.PI / 180;

export const RIG_TUNE = {
  /* --- tail spring chain. The tail is half his silhouette, so it gets real dynamics. --- */
  tailStiff: 168,          // spring toward the authored pose; high = tracks the clip closely
  tailDamp: 15.5,          // critical-ish. Under-damped on purpose: one visible overshoot.
  tailSag: 0.85,           // m/s² of droop, scaled per segment — a heavy fluffy tail hangs
  tailWhip: 0.070,         // how far hip velocity drags the tip back (s) — the streaming look
  tailWhipMax: 0.42,       // clamp, so a teleport doesn't fling the tail to the horizon
  tailSpin: 0.055,         // extra drag from turning, per rad/s
  tailStiffFall: 0.80,     // stiffness multiplier per segment down the chain (tip is floppiest)

  /* --- look-at --- */
  lookYawMax: 84,          // degrees; beyond this the chain gives up rather than snapping the neck
  lookUpMax: 36,
  lookDownMax: 46,
  lookLag: 9.0,            // exponential follow rate — the head arrives a beat late
  lookChest: 0.16, lookNeck: 0.34, lookHead: 0.50,

  /* --- overshoot springs on the loose bits --- */
  brimStiff: 260, brimDamp: 17, brimGain: 0.34, brimMax: 22,
  earStiff: 210, earDamp: 13.5, earGain: 0.50, earMax: 30,

  /* --- foot IK --- */
  ikMaxDrop: 0.30,         // most the hips may sink to keep a foot on lower ground
  ikDropRate: 6.0,         // hip drop follow rate (m/s per m of error)
  ikProbeUp: 0.55, ikProbeDown: 1.30,
  ikAnkle: 0.086,          // bind ankle height above the sole plane
  ikRollMax: 32,           // degrees of foot tilt onto a slope
  ikSoft: 0.02,            // keeps the knee from locking dead straight
};

/* ---- module-scope scratch: nothing in this file allocates per frame ---- */
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
/**
 * `aimBone`'s own scratch, and it must stay private to it.
 *
 * It used to borrow `_v0`, which silently killed the entire two-bone IK: `twoBoneIK` builds the
 * direction it wants into `_v0` and passes it as `dirWorld`, and `aimBone`'s first act was to
 * overwrite `_v0` with the bone's *current* direction — so `setFromUnitVectors(_v0, dirWorld)`
 * was comparing the vector against itself, produced the identity quaternion, and rotated
 * nothing. Both of `twoBoneIK`'s two calls aliased this way, so foot planting had never once
 * moved a leg, in any clip, while still returning `true`.
 */
const _vAim = new THREE.Vector3();
const _eu = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _ident = new THREE.Quaternion();

/** Euler XYZ degrees → quaternion, into `out`. */
export function eulerDeg(x, y, z, out) {
  _eu.set(x * D2R, y * D2R, z * D2R, 'XYZ');
  return out.setFromEuler(_eu);
}

/* ========================================================================== */
/*  PoseBuffer                                                                */
/* ========================================================================== */

/**
 * A weighted pose. Bones nobody wrote stay at bind — deliberately: a clip that only keys the
 * arms must not drag the legs back toward the A-pose just because its weight is 0.4.
 * Accumulation is an incremental normalised slerp, which is the standard way to average
 * quaternions without ever leaving the unit sphere.
 */
export class PoseBuffer {
  constructor(names) {
    this.names = names;
    this.q = Object.create(null);
    this.w = Object.create(null);
    this.s = Object.create(null);
    this.sw = Object.create(null);
    for (const n of names) {
      this.q[n] = new THREE.Quaternion();
      this.s[n] = new THREE.Vector3(1, 1, 1);
      this.w[n] = 0;
      this.sw[n] = 0;
    }
    this.pos = new THREE.Vector3();
    this.posW = 0;
  }

  clear() {
    for (const n of this.names) {
      this.w[n] = 0; this.sw[n] = 0;
      this.q[n].identity();
      this.s[n].set(1, 1, 1);
    }
    this.pos.set(0, 0, 0);
    this.posW = 0;
    return this;
  }

  addQuat(name, q, w) {
    if (w <= 0) return;
    const cur = this.q[name];
    if (cur === undefined) return;
    const acc = this.w[name];
    if (acc <= 0) { cur.copy(q); this.w[name] = w; return; }
    cur.slerp(q, w / (acc + w));
    this.w[name] = acc + w;
  }

  addScale(name, sx, sy, sz, w) {
    if (w <= 0) return;
    const cur = this.s[name];
    if (cur === undefined) return;
    const acc = this.sw[name];
    const f = w / (acc + w);
    cur.x += (sx - cur.x) * f;
    cur.y += (sy - cur.y) * f;
    cur.z += (sz - cur.z) * f;
    this.sw[name] = acc + w;
  }

  addPos(x, y, z, w) {
    if (w <= 0) return;
    const f = w / (this.posW + w);
    this.pos.x += (x - this.pos.x) * f;
    this.pos.y += (y - this.pos.y) * f;
    this.pos.z += (z - this.pos.z) * f;
    this.posW = this.posW + w;
  }

  /**
   * Post-multiply a delta onto an already-sampled bone. This is how the additive layers
   * (breath, lean, squash) bend the authored pose instead of averaging against it — an
   * additive that went through addQuat would *dilute* the keyframe, which is exactly the
   * mush this contract exists to avoid.
   */
  rotate(name, q) {
    const cur = this.q[name];
    if (cur === undefined) return;
    if (this.w[name] <= 0) { cur.copy(q); this.w[name] = 1; return; }
    cur.multiply(q);
  }

  /** Multiplicative scale, for squash and stretch riding on top of an authored scale. */
  mulScale(name, x, y, z) {
    const cur = this.s[name];
    if (cur === undefined) return;
    if (this.sw[name] <= 0) { cur.set(x, y, z); this.sw[name] = 1; return; }
    cur.x *= x; cur.y *= y; cur.z *= z;
  }

  /** Override this buffer with another, per bone, by `w` (optionally masked). */
  mix(other, w, mask) {
    if (w <= 0) return;
    for (const n of this.names) {
      const ow = other.w[n];
      if (ow <= 0) continue;
      const k = mask ? w * mask(n) : w;
      if (k <= 0) continue;
      if (this.w[n] <= 0) { this.q[n].copy(other.q[n]); this.w[n] = k; }
      else { this.q[n].slerp(other.q[n], k); this.w[n] = Math.max(this.w[n], k); }
      if (other.sw[n] > 0) {
        const s = other.s[n], c = this.s[n];
        c.x += (s.x - c.x) * k; c.y += (s.y - c.y) * k; c.z += (s.z - c.z) * k;
        this.sw[n] = Math.max(this.sw[n], k);
      }
    }
    if (other.posW > 0) {
      const k = mask ? w * mask('hips') : w;
      this.pos.lerp(other.pos, k);
      this.posW = Math.max(this.posW, k);
    }
  }
}

/* ========================================================================== */
/*  Rig                                                                       */
/* ========================================================================== */

const TAIL = ['tailA', 'tailB', 'tailC', 'tailD'];

export class Rig {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {any} character SlyModel, or null while CHARACTER is still being written
   */
  constructor(engine, character) {
    this.engine = engine;
    this.character = character || null;
    this.bones = character?.bones || Object.create(null);
    this.names = (character?.boneNames || []).slice();
    this.ok = !!(this.bones.hips && this.bones.head && this.names.length);

    /* bind data ---------------------------------------------------------- */
    this.bindPos = Object.create(null);     // local rest position per bone
    this.bindLen = Object.create(null);     // distance to first child (bone length)
    this.bindDir = Object.create(null);     // unit direction to first child, in bone-local space
    this.hipsBase = new THREE.Vector3();

    if (this.ok) this._measure();

    /* tail spring state -------------------------------------------------- */
    this.tailP = TAIL.map(() => new THREE.Vector3());
    this.tailV = TAIL.map(() => new THREE.Vector3());
    this.tailSeeded = false;

    /* look-at ------------------------------------------------------------ */
    this.lookTarget = new THREE.Vector3();
    this.lookActive = false;
    this.lookYaw = 0; this.lookPitch = 0;   // smoothed, degrees

    /* overshoot springs (rotation vectors, degrees) ----------------------- */
    this.spring = {
      capBrim: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      earL: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      earR: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    };
    this.headQPrev = new THREE.Quaternion();
    this.headSeeded = false;

    /* hips motion, for the whip and the ear bounce ------------------------ */
    this.hipsWorld = new THREE.Vector3();
    this.hipsVel = new THREE.Vector3();
    this.hipsPrev = new THREE.Vector3();
    this.hipsSeeded = false;
    this.yawRate = 0;

    /* foot IK ------------------------------------------------------------ */
    this.hipDrop = 0;
    this.footPlant = { L: 0, R: 0 };
    this._ikTargetL = new THREE.Vector3();
    this._ikTargetR = new THREE.Vector3();
    this._ikNormalL = new THREE.Vector3(0, 1, 0);
    this._ikNormalR = new THREE.Vector3(0, 1, 0);
    this.warned = Object.create(null);
  }

  /* ---------------------------------------------------------------------- */

  _measure() {
    for (const n of this.names) {
      const b = this.bones[n];
      if (!b) continue;
      this.bindPos[n] = b.position.clone();
    }
    // hips.position may already carry the model's default-pose offset; the true bind local
    // position is what SlyModel measured, so prefer bp() when it is available.
    const bp = this.character.bp?.('hips');
    this.hipsBase.copy(bp || this.bindPos.hips || _v0.set(0, 0.905, 0));
    this.bindPos.hips?.copy(this.hipsBase);

    for (const n of this.names) {
      const b = this.bones[n];
      if (!b) continue;
      const child = b.children.find((c) => c.isBone);
      const dir = new THREE.Vector3();
      let len = 0;
      if (child) { dir.copy(child.position); len = dir.length(); }
      if (len < 1e-5) {
        // Leaf bones (toes, tail tip, ears): inherit the parent's direction so aiming still works.
        const p = b.parent?.isBone ? this.bindDir[b.parent.name] : null;
        dir.copy(p || _v0.set(0, -1, 0));
        len = 0.16;
      } else dir.multiplyScalar(1 / len);
      this.bindDir[n] = dir;
      this.bindLen[n] = len;
    }
  }

  has(name) { return !!this.bones[name]; }

  /** Warn once per missing bone — a silent no-op would hide a broken contract. */
  need(name) {
    const b = this.bones[name];
    if (!b && !this.warned[name]) {
      this.warned[name] = 1;
      this.engine.warn(`ANIMATION: rig bone "${name}" is missing from SlyModel.bones — layer skipped.`);
    }
    return b || null;
  }

  /* ====================================================================== */
  /*  commit                                                                */
  /* ====================================================================== */

  /** Write a finished PoseBuffer onto the skeleton. */
  commit(pose) {
    if (!this.ok) return;
    for (const n of this.names) {
      const b = this.bones[n];
      if (!b) continue;
      if (pose.w[n] > 0) b.quaternion.copy(pose.q[n]);
      else b.quaternion.identity();
      if (pose.sw[n] > 0) b.scale.copy(pose.s[n]);
      else b.scale.set(1, 1, 1);
    }
    const h = this.bones.hips;
    if (h) {
      h.position.set(
        this.hipsBase.x + pose.pos.x,
        this.hipsBase.y + pose.pos.y - this.hipDrop,
        this.hipsBase.z + pose.pos.z,
      );
    }
    this.character.root.updateMatrixWorld(true);
  }

  /** Track hips world motion — the tail whip and ear bounce read from this. */
  sampleMotion(dt) {
    if (!this.ok) return;
    const h = this.bones.hips;
    this.hipsWorld.setFromMatrixPosition(h.matrixWorld);
    if (!this.hipsSeeded) { this.hipsPrev.copy(this.hipsWorld); this.hipsSeeded = true; }
    if (dt > 1e-5) {
      _v0.copy(this.hipsWorld).sub(this.hipsPrev).multiplyScalar(1 / dt);
      // Heavy smoothing: raw per-frame deltas are noisy and the tail would buzz.
      this.hipsVel.lerp(_v0, Math.min(1, dt * 18));
    }
    this.hipsPrev.copy(this.hipsWorld);
  }

  /* ====================================================================== */
  /*  IK                                                                    */
  /* ====================================================================== */

  /**
   * Rotate `bone` so the direction it currently points in lands on `dirWorld`, keeping the
   * roll the pose author gave it. Doing it as a *delta* rather than an absolute aim is what
   * preserves the authored twist — an absolute look-at would flatten every knee and elbow.
   */
  aimBone(bone, dirWorld) {
    const bd = this.bindDir[bone.name];
    if (!bd) return;
    bone.getWorldQuaternion(_q0);                     // current world orientation
    /* `_vAim`, never `_v0` — callers pass their own scratch as `dirWorld` and `_v0` is the
       one they reach for. See the declaration of `_vAim`: aliasing it here made every
       two-bone IK solve a no-op that still reported success. */
    _vAim.copy(bd).applyQuaternion(_q0).normalize(); // where it points now
    if (_vAim.lengthSq() < 1e-8) return;
    _q1.setFromUnitVectors(_vAim, dirWorld);          // world-space correction
    // localNew = inv(parentWorld) * delta * parentWorld * localOld
    const parent = bone.parent;
    if (parent) parent.getWorldQuaternion(_q2); else _q2.identity();
    _q3.copy(_q2).invert();
    bone.quaternion.premultiply(_q2).premultiply(_q1).premultiply(_q3);
    bone.updateMatrixWorld(true);
  }

  /**
   * Two-bone analytic IK. `end` is the joint being placed (the ankle), not the toe.
   * The knee is placed on the circle of valid solutions using `poleWorld` as the hint, so the
   * knee always breaks forward however the clip twisted the hip.
   */
  twoBoneIK(upperName, lowerName, endName, targetWorld, poleWorld, weight = 1) {
    const up = this.bones[upperName], lo = this.bones[lowerName], en = this.bones[endName];
    if (!up || !lo || !en || weight <= 0) return false;

    const L1 = this.bindLen[upperName] || 0.4;
    const L2 = this.bindLen[lowerName] || 0.4;

    _v1.setFromMatrixPosition(up.matrixWorld);           // hip
    _v2.copy(targetWorld);
    if (weight < 1) {
      _v3.setFromMatrixPosition(en.matrixWorld);
      _v2.lerpVectors(_v3, _v2, weight);
    }
    _v3.copy(_v2).sub(_v1);
    let d = _v3.length();
    if (d < 1e-4) return false;
    const dMax = (L1 + L2) * (1 - RIG_TUNE.ikSoft);
    const dMin = Math.abs(L1 - L2) + 0.02;
    if (d > dMax) { _v3.multiplyScalar(dMax / d); d = dMax; _v2.copy(_v1).add(_v3); }
    else if (d < dMin) { _v3.multiplyScalar(dMin / d); d = dMin; _v2.copy(_v1).add(_v3); }

    _v4.copy(_v3).multiplyScalar(1 / d);                 // hip → target axis
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(1e-6, L1 * L1 - a * a));

    // pole → the component perpendicular to the limb axis
    _v5.copy(poleWorld);
    _v5.addScaledVector(_v4, -_v5.dot(_v4));
    if (_v5.lengthSq() < 1e-6) {
      _v5.set(0, 0, 1).addScaledVector(_v4, -_v4.z);
      if (_v5.lengthSq() < 1e-6) _v5.set(1, 0, 0);
    }
    _v5.normalize();

    _v6.copy(_v1).addScaledVector(_v4, a).addScaledVector(_v5, h);   // knee

    _v0.copy(_v6).sub(_v1).normalize();
    this.aimBone(up, _v0);
    _v0.setFromMatrixPosition(lo.matrixWorld);
    _v0.subVectors(_v2, _v0);
    if (_v0.lengthSq() < 1e-8) return true;
    this.aimBone(lo, _v0.normalize());
    return true;
  }

  /* ====================================================================== */
  /*  foot IK                                                               */
  /* ====================================================================== */

  /**
   * Plant both feet on the real ground. Two things happen here that keyframes cannot do:
   * a foot that would sink into a slope is lifted onto it *keeping the lift the clip authored*,
   * and if a foot has to reach down further than the leg allows, the hips sink to meet it.
   * Degrades to a clean no-op when COLLISION has not landed yet.
   */
  footIK(dt, weight, footYaw) {
    if (!this.ok || weight <= 0.001) {
      this.hipDrop += (0 - this.hipDrop) * Math.min(1, dt * RIG_TUNE.ikDropRate);
      this.footPlant.L = this.footPlant.R = 0;
      return;
    }
    const collision = this.engine.get('collision');
    const rootY = this.character.root.position.y;
    const ankleH = RIG_TUNE.ikAnkle;

    let drop = 0;
    for (const side of ['L', 'R']) {
      const foot = this.bones[`foot${side}`];
      if (!foot) continue;
      _v1.setFromMatrixPosition(foot.matrixWorld);
      const clipLift = Math.max(0, _v1.y - (rootY + ankleH));

      let groundY = rootY;
      const nrm = side === 'L' ? this._ikNormalL : this._ikNormalR;
      nrm.set(0, 1, 0);
      if (collision?.groundCheck) {
        _v2.set(_v1.x, _v1.y + RIG_TUNE.ikProbeUp, _v1.z);
        const g = collision.groundCheck(_v2, 0.10, RIG_TUNE.ikProbeUp + RIG_TUNE.ikProbeDown);
        if (g?.hit) {
          groundY = g.y;
          if (g.normal) nrm.copy(g.normal).normalize();
        }
      }
      const targetY = groundY + ankleH + clipLift;
      const tgt = side === 'L' ? this._ikTargetL : this._ikTargetR;
      tgt.set(_v1.x, targetY, _v1.z);
      // Contact weight: only a foot near the ground gets rolled onto the slope.
      this.footPlant[side] = 1 - THREE.MathUtils.clamp(clipLift / 0.10, 0, 1);
      drop = Math.min(drop, groundY - rootY);
    }

    // Hips follow the lower foot so the leg never has to over-extend. Filtered, or a step onto
    // a stair pops the pelvis. commit() consumes this next frame — a one-frame lag on ground
    // that is by definition changing slowly, and it keeps the pass order simple.
    const wantDrop = THREE.MathUtils.clamp(-drop, 0, RIG_TUNE.ikMaxDrop) * weight;
    this.hipDrop += (wantDrop - this.hipDrop) * Math.min(1, dt * RIG_TUNE.ikDropRate);

    for (const side of ['L', 'R']) {
      const tgt = side === 'L' ? this._ikTargetL : this._ikTargetR;
      const foot = this.bones[`foot${side}`];
      if (!foot) continue;
      // Pole: forward of the knee, rotated by the character's facing, so knees break forward.
      _v0.set(Math.sin(footYaw), 0.25, Math.cos(footYaw)).normalize();
      this.twoBoneIK(`upperLeg${side}`, `lowerLeg${side}`, `foot${side}`, tgt, _v0, weight);

      // Roll the foot onto the surface normal, but only while it is actually in contact.
      const nrm = side === 'L' ? this._ikNormalL : this._ikNormalR;
      const plant = this.footPlant[side] * weight;
      if (plant > 0.01 && nrm.y < 0.9995) {
        foot.getWorldQuaternion(_q0);
        _v1.copy(this.bindDir[`foot${side}`] || _up).applyQuaternion(_q0).normalize();
        // keep the toe heading, tilt only the pitch/roll onto the plane
        _v2.copy(_v1).addScaledVector(nrm, -_v1.dot(nrm)).normalize();
        if (_v2.lengthSq() > 1e-6) {
          _v3.copy(_v1).lerp(_v2, THREE.MathUtils.clamp(plant, 0, 1)).normalize();
          this.aimBone(foot, _v3);
        }
      }
    }
  }

  /* ====================================================================== */
  /*  look-at                                                               */
  /* ====================================================================== */

  setLookAt(v) {
    if (v) { this.lookTarget.copy(v); this.lookActive = true; }
    else this.lookActive = false;
  }

  /**
   * Weighted look-at over chest → neck → head. Angles are resolved in the chest's frame so
   * the limits mean what they say however the spine is twisted, and they are low-pass filtered
   * so the head arrives a beat after the eyes would have — that lag is most of what makes a
   * look read as alive rather than as a turret.
   */
  lookAtLayer(dt, weight) {
    const head = this.bones.head, neck = this.bones.neck, chest = this.bones.chest;
    if (!head || !neck || !chest) return;

    let wantYaw = 0, wantPitch = 0, w = 0;
    if (this.lookActive && weight > 0.001) {
      chest.getWorldQuaternion(_q0).invert();
      _v0.setFromMatrixPosition(head.matrixWorld);
      _v1.copy(this.lookTarget).sub(_v0);
      if (_v1.lengthSq() > 1e-5) {
        _v1.normalize().applyQuaternion(_q0);
        wantYaw = Math.atan2(_v1.x, Math.max(0.05, _v1.z)) / D2R;
        wantPitch = -Math.asin(THREE.MathUtils.clamp(_v1.y, -1, 1)) / D2R;
        const T = RIG_TUNE;
        // Outside the comfortable cone the chain gives up smoothly instead of snapping.
        const over = Math.max(0, Math.abs(wantYaw) - T.lookYawMax);
        w = weight * (1 - THREE.MathUtils.clamp(over / 40, 0, 1));
        wantYaw = THREE.MathUtils.clamp(wantYaw, -T.lookYawMax, T.lookYawMax);
        wantPitch = THREE.MathUtils.clamp(wantPitch, -T.lookUpMax, T.lookDownMax);
      }
    }
    const k = 1 - Math.exp(-RIG_TUNE.lookLag * Math.max(dt, 1e-4));
    this.lookYaw += (wantYaw * w - this.lookYaw) * k;
    this.lookPitch += (wantPitch * w - this.lookPitch) * k;

    if (Math.abs(this.lookYaw) < 0.05 && Math.abs(this.lookPitch) < 0.05) return;
    const T = RIG_TUNE;
    // A head turn without a matching roll reads mechanical; 0.14 of the yaw as tilt fixes it.
    this._addLocal(chest, T.lookChest * this.lookPitch, T.lookChest * this.lookYaw, 0);
    this._addLocal(neck, T.lookNeck * this.lookPitch, T.lookNeck * this.lookYaw, -0.05 * this.lookYaw);
    this._addLocal(head, T.lookHead * this.lookPitch, T.lookHead * this.lookYaw, -0.14 * this.lookYaw);
    chest.updateMatrixWorld(true);
  }

  _addLocal(bone, x, y, z) {
    eulerDeg(x, y, z, _q4);
    bone.quaternion.multiply(_q4);
  }

  /* ====================================================================== */
  /*  tail                                                                  */
  /* ====================================================================== */

  /**
   * Spring chain. Each segment's tip is a particle pulled toward where the *authored* pose
   * puts it, dragged by hip velocity and sagging under its own weight. Because the target is
   * the authored pose, a clip's tail keys still read exactly — the spring only adds the lag,
   * the overshoot and the whip on a direction change, which is the whole point: a tail that
   * matches the body frame-for-frame looks welded on.
   */
  tailLayer(dt, springWeight = 1) {
    if (!this.ok || !this.bones.tailA) return;
    const T = RIG_TUNE;
    const hv = this.hipsVel;
    // Drag: the tip trails the direction of travel, and turning sweeps it outward.
    _v5.copy(hv).multiplyScalar(-T.tailWhip);
    const spin = -this.yawRate * T.tailSpin;
    if (_v5.length() > T.tailWhipMax) _v5.setLength(T.tailWhipMax);

    for (let i = 0; i < TAIL.length; i++) {
      const bone = this.bones[TAIL[i]];
      if (!bone) continue;
      const len = this.bindLen[TAIL[i]] || 0.24;
      const bd = this.bindDir[TAIL[i]];

      _v0.setFromMatrixPosition(bone.matrixWorld);          // segment root, world
      bone.getWorldQuaternion(_q0);
      _v1.copy(bd).applyQuaternion(_q0).normalize();        // authored direction
      _v2.copy(_v0).addScaledVector(_v1, len);              // authored tip

      const f = (i + 1) / TAIL.length;
      _v2.addScaledVector(_v5, f * f);                       // drag grows toward the tip
      _v2.y -= T.tailSag * f * f * 0.06;
      // Turning sweeps the tail sideways around the body axis.
      _v3.set(-_v1.z, 0, _v1.x).multiplyScalar(spin * f * f);
      _v2.add(_v3);

      const p = this.tailP[i], v = this.tailV[i];
      if (!this.tailSeeded) { p.copy(_v2); v.set(0, 0, 0); }

      const stiff = T.tailStiff * Math.pow(T.tailStiffFall, i);
      const damp = T.tailDamp * Math.pow(0.94, i);
      // semi-implicit Euler; dt is clamped upstream so this stays stable
      _v4.copy(_v2).sub(p).multiplyScalar(stiff).addScaledVector(v, -damp);
      _v4.y -= T.tailSag * (1 + i * 0.35);
      v.addScaledVector(_v4, dt);
      p.addScaledVector(v, dt);

      // hard length constraint — the tail may bend, never stretch
      _v3.copy(p).sub(_v0);
      const l = _v3.length();
      if (l < 1e-5) { _v3.copy(_v1); } else _v3.multiplyScalar(1 / l);
      p.copy(_v0).addScaledVector(_v3, len);

      if (springWeight < 1) _v3.lerp(_v1, 1 - springWeight).normalize();
      this.aimBone(bone, _v3);
    }
    this.tailSeeded = true;
  }

  /** Snap the tail (and every other spring) onto its target — used by freezePose. */
  settle() {
    this.tailSeeded = false;
    for (const v of this.tailV) v.set(0, 0, 0);
    for (const k in this.spring) {
      const s = this.spring[k];
      s.x = s.y = s.z = s.vx = s.vy = s.vz = 0;
    }
    this.hipsVel.set(0, 0, 0);
    this.hipsSeeded = false;
    this.headSeeded = false;
    this.lookYaw = 0; this.lookPitch = 0;
    this.hipDrop = 0;
  }

  /* ====================================================================== */
  /*  cap brim + ear overshoot                                              */
  /* ====================================================================== */

  /**
   * The cap and the ears are loose mass on a fast-moving head: they must lag it and overshoot.
   * Driven by the head's angular velocity, so a snap turn flicks the brim and the ears trail.
   */
  springLayer(dt, weight = 1) {
    const head = this.bones.head;
    if (!head || dt <= 1e-5) return;
    head.getWorldQuaternion(_q0);
    if (!this.headSeeded) { this.headQPrev.copy(_q0); this.headSeeded = true; }

    // angular velocity ≈ 2 * vector part of (q * inv(qPrev)) / dt
    _q1.copy(this.headQPrev).invert().premultiply(_q0);
    if (_q1.w < 0) { _q1.x = -_q1.x; _q1.y = -_q1.y; _q1.z = -_q1.z; _q1.w = -_q1.w; }
    const inv = 2 / dt / D2R;
    const wx = _q1.x * inv, wy = _q1.y * inv, wz = _q1.z * inv;
    this.headQPrev.copy(_q0);

    const T = RIG_TUNE;
    const bounce = THREE.MathUtils.clamp(-this.hipsVel.y * 6, -18, 18);
    this._spring('capBrim', dt, T.brimStiff, T.brimDamp,
      -wx * T.brimGain, -wy * T.brimGain, -wz * T.brimGain, T.brimMax);
    this._spring('earL', dt, T.earStiff, T.earDamp,
      -wx * T.earGain + bounce * 0.35, -wy * T.earGain, -wz * T.earGain - bounce * 0.5, T.earMax);
    this._spring('earR', dt, T.earStiff, T.earDamp,
      -wx * T.earGain + bounce * 0.35, -wy * T.earGain, -wz * T.earGain + bounce * 0.5, T.earMax);

    for (const name of ['capBrim', 'earL', 'earR']) {
      const b = this.bones[name];
      if (!b) continue;
      const s = this.spring[name];
      this._addLocal(b, s.x * weight, s.y * weight, s.z * weight);
    }
  }

  _spring(name, dt, k, c, dx, dy, dz, max) {
    const s = this.spring[name];
    s.vx += (dx - s.x) * k * dt - s.vx * c * dt;
    s.vy += (dy - s.y) * k * dt - s.vy * c * dt;
    s.vz += (dz - s.z) * k * dt - s.vz * c * dt;
    s.x = THREE.MathUtils.clamp(s.x + s.vx * dt, -max, max);
    s.y = THREE.MathUtils.clamp(s.y + s.vy * dt, -max, max);
    s.z = THREE.MathUtils.clamp(s.z + s.vz * dt, -max, max);
  }

  /* ====================================================================== */
  /*  impulses (hit reactions)                                              */
  /* ====================================================================== */

  /**
   * A world-space shove on a bone, resolved into a decaying rotation about the axis that
   * swings that bone in the shove direction. Spreads up the spine so a hit moves the whole
   * body, not one shoulder.
   */
  applyImpulse(imp, dt) {
    const bone = this.bones[imp.bone];
    if (!bone) return false;
    imp.life -= dt;
    if (imp.life <= 0) return false;
    const t = 1 - imp.life / imp.dur;
    // one damped swing out and back: sells "hit" much better than a linear decay
    const env = Math.sin(Math.PI * Math.min(1, t) * 1.35) * Math.exp(-imp.decay * t) * imp.strength;
    if (Math.abs(env) < 1e-4) return true;

    bone.getWorldQuaternion(_q0);
    _v0.copy(this.bindDir[imp.bone] || _up).applyQuaternion(_q0).normalize();
    _v1.copy(imp.dir).normalize();
    _v2.crossVectors(_v0, _v1);                            // rotation axis, world
    if (_v2.lengthSq() < 1e-8) return true;
    _v2.normalize();
    if (bone.parent) bone.parent.getWorldQuaternion(_q1); else _q1.identity();
    _v2.applyQuaternion(_q1.invert());                      // → bone-local space
    _q2.setFromAxisAngle(_v2, env * D2R * 40);
    bone.quaternion.multiply(_q2);
    // let the chain above carry a third of it
    const spread = { head: 'neck', neck: 'chest', chest: 'spine', spine: 'hips' }[imp.bone];
    if (spread && this.bones[spread]) {
      const pb = this.bones[spread];
      _q3.setFromAxisAngle(_v2, env * D2R * 14);
      pb.quaternion.multiply(_q3);
    }
    bone.updateMatrixWorld(true);
    return true;
  }

  dispose() {
    this.bones = Object.create(null);
    this.character = null;
  }
}

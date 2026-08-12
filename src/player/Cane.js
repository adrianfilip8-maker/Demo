import * as THREE from 'three';
import { MeshBuilder, addTube, addEllipsoid, addHardBox, superEllipse } from './Body.js';

/**
 * Cane.js — Sly's shepherd's-crook cane, built as a standalone prop.
 *
 * It is a separate object rather than part of the skinned body for three reasons: MOVEMENT
 * has to hook it onto rings and swing from it, ANIMATION has to be able to re-parent it
 * (hand → back → shoulder), and it is the one part of Sly that is hard-edged metal rather
 * than fur — so it wants its own material and its own outline thickness.
 *
 * One material, not two: the whole prop draws in a single call and the grip is the same gold
 * dropped to a dark bronze by vertex colour. The character budget is 12 draw calls and the
 * body already spends 9 of them.
 *
 * Local frame: **grip at the origin, shaft along +Y, hook curling toward +Z (forward).**
 * `hookPoint` is where a ring sits when the cane catches it.
 *
 * Since §294 the SHIPPED character draws the owner-supplied model instead of these triangles —
 * `adoptAsset` below swaps the rendered geometry after this build, inside the same local frame,
 * so everything in this header stays true of what renders. The procedural build remains the
 * frame's source of truth (and what the legacy models and `tools/canesize.mjs` still draw).
 */

/**
 * The hook geometry is the whole point of this prop, so read these two together:
 *
 *   · `hookRadius` sets how big the C is. At 0.125 m the crook was smaller than his own hand
 *     and the critic logged it as "a bangle" and "a detached orange hook". It is now 0.168 —
 *     as wide as his head is deep, which is the ratio the reference uses.
 *   · `hookSweep` sets how far round it goes. 4.45 rad is 255°, i.e. very nearly a closed
 *     ring — which is *why* it read as a bangle rather than a hook. A shepherd's crook has to
 *     stay visibly **open**: 3.35 rad (192°) leaves a clean gap you can see daylight through,
 *     and an open C is what makes the silhouette legible at 40 px.
 */
export const CANE_TUNE = {
  /**
   * Distance from the grip (the local origin) down to the butt ferrule.
   *
   * This is not a free style choice, it is a constraint, and it is worth stating why because
   * the obvious knob does not work. `CANE.plant` is the standing idle — the pose `sly-closeup`
   * and `hero` freeze on — and a preset called `plant` has to actually plant. **The aim cannot
   * do it.** Re-aiming turns the shaft about a cone whose apex is the grip, so the tip sweeps a
   * sphere of fixed radius and its height is set by the grip height and this number alone.
   *
   * Measured on `idle_confident` (node tools/poseprobe.mjs): the grip rides at y 0.787 above
   * the floor and `plant` stands the shaft 8.5° off vertical, so the tip needs
   * 0.787 / cos 8.5° = 0.796 m of shaft below the grip to touch down.
   *
   * It used to be `length * 0.455` = 0.5915 m, which left the tip floating 0.20 m in the air.
   * A 4×3×3 sweep of the aim could not move that and the invariance looked like a dead knob;
   * it was not. 0.196 m is the *lowest the tip can physically reach* from that grip, so the
   * aim was already sitting within 6 mm of its own optimum and the sweep was reading the flat
   * bottom of the bowl. The shaft was simply 20 cm too short to reach the ground.
   *
   * Re-derive this if `IDLE_A`'s right arm moves — it is measured against the grip, not the
   * world. `node caneall.mjs` prints the tip height for all 52 clips, which is the check that
   * matters: lengthening the shaft is global, and the tip must not spear the floor elsewhere.
   */
  dropBelowGrip: 0.796,
  shaftR: 0.0205,       // slim shaft so the hook reads as the heavy end
  hookR: 0.0375,        // deliberately chunky: this silhouette is his logo
  hookRadius: 0.168,    // radius of the C
  hookSweep: 3.35,      // radians of arc — an open C, not a closed ring
  gripLo: -0.125,
  gripHi: 0.225,
  gripR: 0.0295,
  wrapDepth: 0.0050,    // helical leather wrap relief
  wrapTurns: 9,
};

const PAL = {
  gold: 0xe8b942,
};

/* module scope: build() must not allocate per vertex */
const _grip = new THREE.Color();

export class Cane {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.opts = opts;
    this.object = new THREE.Group();
    this.object.name = 'sly_cane';
    this.hookPoint = new THREE.Vector3();
    this.tipPoint = new THREE.Vector3();
    this._disposables = [];
    this.triangles = 0;
  }

  /**
   * Per-instance overrides of `CANE_TUNE`, via `new Cane(engine, { tune: {...} })`.
   *
   * They exist because the grip is the one dimension that is not a free style choice: it has to
   * fit the hand that closes on it, and the two characters that build this prop have different
   * hands. `SlyModelDLRig` measures its own glove and passes a solved `gripR`/`shaftR`; the
   * legacy model passes nothing and keeps the authored numbers, so nothing about it moves.
   */
  build(materials) {
    const T = { ...CANE_TUNE, ...(this.opts.tune || {}) };
    const mb = new MeshBuilder({ root: 0 });

    /* ---- shaft path: straight, then the crook --------------------------- */
    /* Sampled directly rather than through a spline so `s` (0 at the butt, 1 at the hook tip)
       tracks real arc position — the radius and grip masks are authored against it. */
    const butt = -T.dropBelowGrip;          // below the grip — see CANE_TUNE, this plants the tip
    const shaftTop = 0.425;                 // where the crook begins
    const NS = 16, NH = 30;
    const centers = [];
    const sVal = [];
    const shaftLen = shaftTop - butt;
    // The crook: an arc in the YZ plane whose centre sits forward of the shaft top so the
    // hook opens downward-forward — the shape that actually catches a ring.
    const cy = shaftTop + T.hookRadius * 0.42;
    const cz = T.hookRadius * 0.86;
    const a0 = Math.atan2(shaftTop - cy, -cz);
    const hookLen = T.hookRadius * T.hookSweep;
    const total = shaftLen + hookLen;

    for (let i = 0; i <= NS; i++) {
      const f = i / NS;
      centers.push(new THREE.Vector3(0, butt + shaftLen * f, 0));
      sVal.push((shaftLen * f) / total);
    }
    for (let i = 1; i <= NH; i++) {
      const a = a0 - (i / NH) * T.hookSweep;
      centers.push(new THREE.Vector3(0, cy + Math.sin(a) * T.hookRadius, cz + Math.cos(a) * T.hookRadius));
      sVal.push((shaftLen + hookLen * (i / NH)) / total);
    }
    const nR = centers.length;
    const sOf = (i) => sVal[Math.min(i, nR - 1)];
    const sHook = shaftLen / total;

    // Radius: slim through the shaft, swelling into the hook, tapering at the very tip.
    const radiusAt = (i) => {
      const s = sOf(i);
      const shaft = THREE.MathUtils.lerp(T.shaftR * 1.14, T.shaftR * 0.95, THREE.MathUtils.clamp(s / sHook, 0, 1));
      const intoHook = THREE.MathUtils.smoothstep(s, sHook - 0.10, sHook + 0.10);
      const tipTaper = 1 - 0.40 * THREE.MathUtils.smoothstep(s, 0.90, 1.0);
      return THREE.MathUtils.lerp(shaft, T.hookR, intoHook) * tipTaper;
    };

    // The grip is the same tube, swollen and wrapped — one continuous surface, no seams to crack.
    const gripAmt = (yLocal) => {
      const a = THREE.MathUtils.smoothstep(yLocal, T.gripLo - 0.03, T.gripLo + 0.015);
      const b = 1 - THREE.MathUtils.smoothstep(yLocal, T.gripHi - 0.015, T.gripHi + 0.03);
      return Math.min(a, b);
    };

    const gripK = (i) => (i < nR && sOf(i) < sHook ? gripAmt(centers[i].y) : 0);

    addTube(mb, {
      centers,
      seg: 12,
      rx: (i) => THREE.MathUtils.lerp(radiusAt(i), T.gripR, gripK(i)),
      shape: (a, i) => {
        const s = superEllipse(a, 1.0);
        const g = gripK(i);
        if (g > 0.01) {
          // helical wrap: a ridge that spirals up the grip
          const phase = (centers[i].y - T.gripLo) / (T.gripHi - T.gripLo) * T.wrapTurns * Math.PI * 2 + a;
          const ridge = Math.pow(Math.abs(Math.sin(phase * 0.5)), 0.7);
          const k = 1 + (ridge - 0.5) * (T.wrapDepth / T.gripR) * g;
          return { u: s.u * k, v: s.v * k };
        }
        return s;
      },
      groupAt: () => 'gold',
      sgAt: () => 501,
      // The grip is the same gold, dropped to a dark bronze. Vertex colour multiplies the
      // material, so this is a value shift on one surface rather than a second draw call.
      colorAt: (i) => _grip.setScalar(THREE.MathUtils.lerp(1, 0.34, gripK(i))),
      uvScale: [1, 1],
      capStart: false,
      capEnd: true,
      weightsAt: () => [['root', 1]],
      upHint: new THREE.Vector3(0, 0, 1),
    });

    /* ---- ferrule at the butt: hard-edged, dark gold ---------------------- */
    mb.group('gold');
    addEllipsoid(mb, {
      center: new THREE.Vector3(0, butt + 0.012, 0),
      radii: new THREE.Vector3(T.shaftR * 1.5, 0.03, T.shaftR * 1.5),
      segTheta: 12, segPhi: 6, phi0: -Math.PI / 2, phi1: 0.35,
      group: 'gold', sg: 511, weights: [['root', 1]],
    });
    // collars pin the grip down at both ends — reads as a bound handle, not a painted stripe
    for (const [y, r] of [[T.gripLo - 0.004, T.gripR * 1.16], [T.gripHi + 0.004, T.gripR * 1.16]]) {
      addTube(mb, {
        centers: [new THREE.Vector3(0, y - 0.009, 0), new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y + 0.009, 0)],
        seg: 12, rx: [r * 0.9, r, r * 0.9],
        groupAt: () => 'gold',
        sgAt: (i) => 520 + i,
        weightsAt: () => [['root', 1]],
        upHint: new THREE.Vector3(0, 0, 1),
        capStart: false, capEnd: false,
      });
    }

    /* ---- decorative knurl where the crook leaves the shaft -------------- */
    addHardBox(mb, {
      center: new THREE.Vector3(0, shaftTop - 0.055, 0),
      half: new THREE.Vector3(T.shaftR * 1.85, 0.016, T.shaftR * 1.85),
      group: 'gold', weights: [['root', 1]],
    });

    /* ---- geometry ------------------------------------------------------- */
    const geo = mb.toGeometry(['gold']);
    geo.deleteAttribute('skinIndex');
    geo.deleteAttribute('skinWeight');
    this.triangles = mb.triangleCount;

    const mats = materials || this._fallbackMaterials();
    this.mesh = new THREE.Mesh(geo, mats);
    this.mesh.name = 'cane';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
    this._disposables.push(geo);

    // Hook contact point: the inside of the C, where a ring would rest.
    this.hookPoint.set(0, cy, cz);
    this.tipPoint.set(0, butt, 0);
    /* The authored centreline and the tune actually used. Both are read by tests: the crook is a
       sampled arc here and a mitred polyline in the FBX `staff` it replaces, and the only way to
       say that with a number is to compare centrelines. */
    this.tune = T;
    this.centerline = centers.map((c) => c.clone());
    this.gripSpan = [T.gripLo, T.gripHi];
    this.object.userData.hookPoint = this.hookPoint;

    return this;
  }

  /**
   * Swap the RENDERED geometry for the owner-supplied cane (`src/assets/sly-cane/sly-cane.glb`,
   * §294) — the procedural build above is still run first, because it is the FRAME: its measured
   * y-extent is the conform target, and `hookPoint` / `tipPoint` / `centerline` / `gripSpan`
   * keep the contact and aim contract every clip, swing and test was authored against. Only the
   * drawn triangles change.
   *
   * THE OWNER'S CONSTRAINT — "do not alter the shape of the model" — is why everything below is
   * a similarity transform: one uniform scale, one rotation about Y, one translation. No
   * non-uniform scale, no welding, no re-meshing. The three numbers are DERIVED FROM THE
   * GEOMETRY at adopt time rather than quoted from PROVENANCE.md, whose own history shows why
   * (its first drop-in scale was 16% short, inferred from a comment instead of measured):
   *
   *   · scale   = this build's bbox y-extent ÷ the asset's. Matching bbox to bbox reproduces
   *     BOTH extremes of the prop it replaces: the butt lands at the procedural ferrule's
   *     lowest point, so `CANE_TUNE.dropBelowGrip`'s planted tip (and every `caneall.mjs`
   *     tip-height figure) carries over bit-for-bit, and the crook tops out at the same height.
   *   · rotation = the hook's mean lateral offset off the shaft axis (tip-ring centroid),
   *     turned onto +Z — this frame's "hook curls forward". Measured sign, not assumed
   *     (the asset curls in +X; a wrong sign here is a backwards cane in his hand).
   *   · translation = shaft axis onto the Y axis, butt onto the procedural butt.
   */
  adoptAsset(asset) {
    if (!asset?.geometry || !this.mesh) return false;
    const old = this.mesh.geometry;
    old.computeBoundingBox();
    const targetLen = old.boundingBox.max.y - old.boundingBox.min.y;

    /* the parse is cached module-wide and immutable; the frame is baked into a private clone */
    const geo = asset.geometry.clone();
    const pos = geo.attributes.position;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const len = y1 - y0;
    let cx = 0, cz = 0, cn = 0, ox = 0, oz = 0, on = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < y0 + len * 0.05) { cx += pos.getX(i); cz += pos.getZ(i); cn++; }
      if (y > y0 + len * 0.65) { ox += pos.getX(i); oz += pos.getZ(i); on++; }
    }
    if (!cn || !on || !(len > 0)) return false;
    cx /= cn; cz /= cn;
    ox = ox / on - cx; oz = oz / on - cz;
    if (Math.hypot(ox, oz) < len * 0.02) return false;   // no hook bend — do not guess

    const s = targetLen / len;                            // uniform: shape preserved
    const theta = -Math.atan2(ox, oz);                    // hook bend -> +Z (forward)
    geo.applyMatrix4(new THREE.Matrix4()
      .makeTranslation(0, old.boundingBox.min.y - y0 * s, 0)
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeRotationY(theta))
      .multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz)));
    /* one group over everything, so the mesh's material ARRAY keeps working */
    geo.clearGroups();
    geo.addGroup(0, geo.index ? geo.index.count : pos.count, 0);

    const i = this._disposables.indexOf(old);
    if (i >= 0) this._disposables.splice(i, 1);
    old.dispose();
    this._disposables.push(geo);
    this.mesh.geometry = geo;
    this.triangles = asset.triangles;
    this.assetCane = asset.source || true;
    return true;
  }

  _fallbackMaterials() {
    const gold = new THREE.MeshStandardMaterial({
      color: PAL.gold, metalness: 0.85, roughness: 0.3, vertexColors: true,
    });
    this._disposables.push(gold);
    this._owned = true;
    return [gold];
  }

  setVisible(v) { this.object.visible = v; }

  dispose() {
    for (const d of this._disposables) d.dispose?.();
    this._disposables.length = 0;
    this.object.removeFromParent();
  }
}

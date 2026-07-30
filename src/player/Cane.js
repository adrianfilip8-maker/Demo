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
 * Local frame: **grip at the origin, shaft along +Y, hook curling toward +Z (forward).**
 * `hookPoint` is where a ring sits when the cane catches it.
 */

export const CANE_TUNE = {
  length: 1.2,          // butt tip → top of the hook arc
  shaftR: 0.0165,       // slim shaft so the hook reads as the heavy end
  hookR: 0.023,         // deliberately chunky: this silhouette is his logo
  hookRadius: 0.125,    // radius of the C
  hookSweep: 4.45,      // radians of arc — past a semicircle so the C closes visibly
  gripLo: -0.115,
  gripHi: 0.215,
  gripR: 0.0245,
  wrapDepth: 0.0042,    // helical leather wrap relief
  wrapTurns: 9,
};

const PAL = {
  gold: 0xe8b942,
  goldDark: 0x8a6216,
  red: 0xa83828,
};

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

  build(materials) {
    const T = CANE_TUNE;
    const mb = new MeshBuilder({ root: 0 });

    /* ---- shaft path: straight, then the crook --------------------------- */
    /* Sampled directly rather than through a spline so `s` (0 at the butt, 1 at the hook tip)
       tracks real arc position — the radius and grip masks are authored against it. */
    const butt = -T.length * 0.455;         // below the grip
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

    const isGrip = (i) => i < nR && sOf(i) < sHook && gripAmt(centers[i].y) > 0.5;
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
      groupAt: (i) => (i < 900 && isGrip(i) ? 'grip' : 'gold'),
      sgAt: () => 501,
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
    const geo = mb.toGeometry(['gold', 'grip']);
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
    this.object.userData.hookPoint = this.hookPoint;

    return this;
  }

  _fallbackMaterials() {
    const gold = new THREE.MeshStandardMaterial({
      color: PAL.gold, metalness: 0.85, roughness: 0.3, vertexColors: true,
    });
    const grip = new THREE.MeshStandardMaterial({
      color: PAL.red, metalness: 0.0, roughness: 0.75, vertexColors: true,
    });
    this._disposables.push(gold, grip);
    this._owned = true;
    return [gold, grip];
  }

  setVisible(v) { this.object.visible = v; }

  dispose() {
    for (const d of this._disposables) d.dispose?.();
    this._disposables.length = 0;
    this.object.removeFromParent();
  }
}

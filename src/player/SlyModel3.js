/**
 * SlyModel3 — the Sly 3 reference rebuild. Selected at boot by `__CHAR_AB=model3` (see main.js);
 * absent that token the incumbent `SlyModel.js` boots, so this file can never ship by accident.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT YET
 * -----------------------------------
 * This is stage 1: the **reference-derived skeleton, proportions and palette**, plus a skinned
 * blockout that satisfies the whole CHARACTER contract so the swap is testable end to end before
 * a single hour goes into surface form. Building it in this order is deliberate — the incumbent
 * is 3,000 lines and a rebuild that cannot boot is unmeasurable, so the first milestone is "the
 * A/B path works and the silhouette is right", not "the fur is right".
 *
 * Every constant below is traceable to `progress/records/SPEC-sly3model.md`, which records the
 * four reference images and — importantly — labels which readings are measured and which are
 * visual. Three of the four references exist only in conversation context, so the palette here is
 * a **visual reading to be converged by rendering against the reference**, not a measurement.
 * §190/§193/§195 are all one mistake — treating a quantity as better-founded than it is — so the
 * distinction is carried in the code rather than left in a document.
 *
 * CONTRACT (from Rig.js, unchanged and deliberately so):
 *   · bone bind rotations are identity — a bone's local axes are world-aligned in bind pose
 *   · +X is Sly's LEFT, +Z is FORWARD, root origin at his feet
 *   · public surface: root · bones · mesh · bp(name) · update(dt,t) · dispose()
 * Bone NAMES and HIERARCHY are identical to the incumbent's, so every authored clip in Clips.js
 * and every spring chain in Rig.js drives this model with no change. Bone POSITIONS differ —
 * that is where the Sly 3 proportions live — and that is safe precisely because clips are
 * rotations, which are proportion-independent.
 */

import * as THREE from 'three';

/* ============================ TUNE — proportions ==========================
 * SPEC §3, all [read] from the standing three-quarter reference. Ratios were read first and
 * converted to metres at a FIXED total height, because SPEC F6 requires height parity with the
 * incumbent: if the rebuild is a different size the A/B stops being about the model.
 */
export const TUNE = {
  height: 1.80,              // F6 — identical to the incumbent. Do not "improve" this.

  /* SPEC §3: head including cap ≈ 1/5.5 of height. The incumbent reads nearer 1/6.4, so this is
     the single largest proportion change and the one most responsible for "reads as Sly". */
  headFraction: 1 / 5.5,
  capRise: 0.055,            // crown of cap above skull top
  muzzleLen: 0.86,           // longer than the incumbent's 0.71 — SPEC §2 calls the muzzle the
                             // feature that most says "raccoon" in silhouette
  muzzleGirth: 0.72,
  earLen: 0.150,             // large, tall, pointed (SPEC §2)
  earSpread: 0.130,

  /* Long thin legs, large feet (SPEC §3). */
  legFraction: 0.520,        // hip height as a fraction of total height
  shinRatio: 0.52,           // shin / (thigh+shin)
  footLen: 0.245,            // large — cartoon proportion, F-checked against silhouette
  footWidth: 0.104,
  limbSlim: 0.86,            // limbs are slender relative to the incumbent

  /* SPEC §2: the tail is roughly half the visual mass and must not be under-built. F3 gates the
     root thickness at >= 0.4 x head width; this sits well clear at 0.62. */
  tailScale: 1.10,
  tailRootFrac: 0.62,        // tail root radius as a fraction of head half-width
  tailRings: 5,              // alternating grey/cream bands (SPEC §2)

  shoulderW: 0.150,
  hipW: 0.082,

  /* --- shading / line: kept in family with the incumbent so the A/B is about FORM, not grade.
     Changing these would make the comparison unreadable. --- */
  outline: 0.0034,
  outlineColor: 0x1a1210,
  rim: 0.62,
  rimColor: 0x7fd4ff,
  furSSS: 0.38,
  bands: 3,
};

/* ============================ PAL — palette ===============================
 * SPEC §1, [read] from the flat texture atlas (the one reference that is unlit albedo).
 *
 * F1 in the spec: cap, shirt, gloves and boots are ONE blue in the reference. They therefore all
 * reference `blue` here, by name, rather than carrying four near-identical literals — the defect
 * F1 exists to catch is made structurally impossible rather than merely tested for.
 * Likewise F5 and `gold`.
 */
const PAL = {
  blue: 0x2f5fc4,          // shirt · cap · gloves · boots — ONE colour (F1)
  blueDark: 0x16264f,      // shade side / inner sleeve
  gold: 0xd9a521,          // belt · collar V · wrist cuffs · cane (F5)
  goldDark: 0x8f6a12,
  cream: 0xe4dcc6,         // trousers, tail light bands
  furLight: 0xcfcdc4,      // muzzle, cheeks, brow
  furMid: 0x8d8b84,        // ear interior, tail dark bands
  black: 0x141414,         // the mask, the nose
  red: 0xc4222c,           // hip sash
  eyeIris: 0xd9821a,       // amber
  eyeWhite: 0xf2f0ea,
};

/* ============================ SKELETON ====================================
 * Names and hierarchy verbatim from the incumbent (the clip contract). Positions are derived
 * from TUNE above rather than authored, so a proportion change propagates instead of drifting
 * out of sync with the mesh — the failure the incumbent's own tail comment records.
 */
const H = TUNE.height;
const HEAD_H = H * TUNE.headFraction;      // head incl. cap
const HIP_Y = H * TUNE.legFraction;
const NECK_Y = H - HEAD_H;                 // neck joint = underside of the head mass
const CHEST_Y = HIP_Y + (NECK_Y - HIP_Y) * 0.62;
const SPINE_Y = HIP_Y + (NECK_Y - HIP_Y) * 0.28;
const HEAD_Y = NECK_Y + HEAD_H * 0.22;
const HEAD_HW = HEAD_H * 0.40;             // head half-width
const THIGH = HIP_Y * (1 - TUNE.shinRatio);
const ANKLE_Y = HIP_Y - THIGH - HIP_Y * TUNE.shinRatio * 0.86;

const SKELETON = [
  ['hips', 'root', [0, HIP_Y, -0.005]],
  ['spine', 'hips', [0, SPINE_Y, 0]],
  ['chest', 'spine', [0, CHEST_Y, -0.005]],
  ['neck', 'chest', [0, NECK_Y - 0.02, 0.010]],
  ['head', 'neck', [0, HEAD_Y, 0.015]],
  ['jaw', 'head', [0, HEAD_Y + HEAD_H * 0.06, HEAD_HW * 0.30]],
  ['capBrim', 'head', [0, HEAD_Y + HEAD_H * 0.38, HEAD_HW * 0.42]],
  ['earL', 'head', [TUNE.earSpread, HEAD_Y + HEAD_H * 0.34, -HEAD_HW * 0.16]],
  ['earR', 'head', [-TUNE.earSpread, HEAD_Y + HEAD_H * 0.34, -HEAD_HW * 0.16]],
  ['browL', 'head', [HEAD_HW * 0.42, HEAD_Y + HEAD_H * 0.30, HEAD_HW * 0.70]],
  ['browR', 'head', [-HEAD_HW * 0.42, HEAD_Y + HEAD_H * 0.30, HEAD_HW * 0.70]],

  ['shoulderL', 'chest', [0.052, NECK_Y - 0.055, 0]],
  ['upperArmL', 'shoulderL', [TUNE.shoulderW, NECK_Y - 0.070, 0]],
  ['lowerArmL', 'upperArmL', [TUNE.shoulderW + 0.190, NECK_Y - 0.235, 0]],
  ['handL', 'lowerArmL', [TUNE.shoulderW + 0.340, NECK_Y - 0.400, 0]],
  ['shoulderR', 'chest', [-0.052, NECK_Y - 0.055, 0]],
  ['upperArmR', 'shoulderR', [-TUNE.shoulderW, NECK_Y - 0.070, 0]],
  ['lowerArmR', 'upperArmR', [-(TUNE.shoulderW + 0.190), NECK_Y - 0.235, 0]],
  ['handR', 'lowerArmR', [-(TUNE.shoulderW + 0.340), NECK_Y - 0.400, 0]],

  ['upperLegL', 'hips', [TUNE.hipW, HIP_Y - 0.015, 0]],
  ['lowerLegL', 'upperLegL', [TUNE.hipW + 0.011, HIP_Y - THIGH, 0.012]],
  ['footL', 'lowerLegL', [TUNE.hipW + 0.016, ANKLE_Y, -0.020]],
  ['toeL', 'footL', [TUNE.hipW + 0.016, ANKLE_Y - 0.044, TUNE.footLen * 0.62]],
  ['upperLegR', 'hips', [-TUNE.hipW, HIP_Y - 0.015, 0]],
  ['lowerLegR', 'upperLegR', [-(TUNE.hipW + 0.011), HIP_Y - THIGH, 0.012]],
  ['footR', 'lowerLegR', [-(TUNE.hipW + 0.016), ANKLE_Y, -0.020]],
  ['toeR', 'footR', [-(TUNE.hipW + 0.016), ANKLE_Y - 0.044, TUNE.footLen * 0.62]],

  /* The bind tail already carries the raccoon S-curve — it RISES across the chain rather than
     trailing flat. The incumbent records why: a horizontal bind tail is hidden by the body from
     every angle but pure side-on, which is how a metre of tail can read as no tail at all. */
  ['tailA', 'hips', [0, HIP_Y + 0.015, -0.150 * TUNE.tailScale]],
  ['tailB', 'tailA', [0.038 * TUNE.tailScale, HIP_Y + 0.020, -0.470 * TUNE.tailScale]],
  ['tailC', 'tailB', [0.110 * TUNE.tailScale, HIP_Y + 0.075, -0.775 * TUNE.tailScale]],
  ['tailD', 'tailC', [0.205 * TUNE.tailScale, HIP_Y + 0.175, -1.020 * TUNE.tailScale]],
];

const BONE_ORDER = SKELETON.map((s) => s[0]);

/* ============================ mesh helpers ================================ */

/** A lofted tube through `rings` of [centre, radius, colour], skinned to one bone each. */
function loft(rings, bone, seg = 12) {
  const pos = [], col = [], idx = [], bidx = [], bwt = [];
  const c = new THREE.Color();
  for (let r = 0; r < rings.length; r++) {
    const [p, rad, hex] = rings[r];
    c.setHex(hex);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(p[0] + Math.cos(a) * rad, p[1], p[2] + Math.sin(a) * rad);
      col.push(c.r, c.g, c.b);
      bidx.push(bone, 0, 0, 0);
      bwt.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s, b = r * seg + ((s + 1) % seg);
      const d = a + seg, e = b + seg;
      idx.push(a, d, b, b, d, e);
    }
  }
  return { pos, col, idx, bidx, bwt };
}

/** Axis-aligned ellipsoid, skinned rigidly to one bone. */
function blob(centre, radii, hex, bone, seg = 12, rows = 8) {
  const rings = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, phi = t * Math.PI;
    rings.push([
      [centre[0], centre[1] + Math.cos(phi) * radii[1], centre[2]],
      Math.max(1e-4, Math.sin(phi) * radii[0]),
      hex,
    ]);
  }
  const g = loft(rings, bone, seg);
  // squash Z independently so a blob can be an egg rather than only a sphere
  if (radii[2] !== radii[0]) {
    const k = radii[2] / radii[0];
    for (let i = 2; i < g.pos.length; i += 3) g.pos[i] = centre[2] + (g.pos[i] - centre[2]) * k;
  }
  return g;
}

function merge(parts) {
  const pos = [], col = [], idx = [], bidx = [], bwt = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.pos); col.push(...p.col); bidx.push(...p.bidx); bwt.push(...p.bwt);
    for (const i of p.idx) idx.push(i + base);
  }
  return { pos, col, idx, bidx, bwt };
}

/* ============================ the model =================================== */

export class SlyModel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'sly3';
    this.bones = {};
    this.boneNames = BONE_ORDER;
    this.mesh = null;
    this._bindWorld = {};
    this._restQ = {};
  }

  async init() {
    const THREEJS = THREE;
    /* ---- skeleton ---- */
    const boneIndex = {};
    SKELETON.forEach(([name], i) => { boneIndex[name] = i; });
    for (const [name, parent, p] of SKELETON) {
      const b = new THREEJS.Bone();
      b.name = name;
      // Positions in SKELETON are ABSOLUTE model-space; convert to parent-local so every bind
      // rotation stays identity (the contract Rig.js depends on).
      const par = parent === 'root' ? null : this.bones[parent];
      const parAbs = parent === 'root' ? [0, 0, 0] : this._abs[parent];
      b.position.set(p[0] - parAbs[0], p[1] - parAbs[1], p[2] - parAbs[2]);
      (this._abs ||= {})[name] = p;
      (par || this.root).add(b);
      this.bones[name] = b;
      this._bindWorld[name] = new THREEJS.Vector3(p[0], p[1], p[2]);
    }

    const boneList = BONE_ORDER.map((n) => this.bones[n]);
    const skeleton = new THREEJS.Skeleton(boneList);

    /* ---- blockout geometry ---- */
    const bi = (n) => BONE_ORDER.indexOf(n);
    const hw = HEAD_HW;
    const parts = [];

    // torso: hips -> chest, tapering, in shirt blue with the cream trouser block below the belt
    parts.push(loft([
      [[0, HIP_Y - 0.10, 0], 0.098, PAL.cream],
      [[0, HIP_Y, 0], 0.104, PAL.cream],
      [[0, HIP_Y + 0.03, 0], 0.106, PAL.gold],      // the belt
      [[0, SPINE_Y, 0], 0.108, PAL.blue],
      [[0, CHEST_Y, 0], 0.116, PAL.blue],
      [[0, NECK_Y - 0.03, 0], 0.086, PAL.blue],
    ], bi('chest')));

    // head + muzzle + cap
    parts.push(blob([0, HEAD_Y + HEAD_H * 0.12, 0], [hw, HEAD_H * 0.40, hw * 0.94], PAL.furLight, bi('head')));
    parts.push(loft([
      [[0, HEAD_Y + HEAD_H * 0.06, hw * 0.55], hw * 0.52 * TUNE.muzzleGirth, PAL.furLight],
      [[0, HEAD_Y + HEAD_H * 0.02, hw * 0.55 + hw * TUNE.muzzleLen * 0.60], hw * 0.30 * TUNE.muzzleGirth, PAL.furLight],
      [[0, HEAD_Y - HEAD_H * 0.02, hw * 0.55 + hw * TUNE.muzzleLen], hw * 0.13, PAL.black],
    ], bi('head')));
    parts.push(blob([0, HEAD_Y + HEAD_H * 0.40, -hw * 0.05], [hw * 1.03, HEAD_H * 0.20, hw * 1.00], PAL.blue, bi('head')));

    // ears
    for (const [n, sx] of [['earL', 1], ['earR', -1]]) {
      parts.push(loft([
        [[sx * TUNE.earSpread, HEAD_Y + HEAD_H * 0.34, -hw * 0.16], hw * 0.30, PAL.furMid],
        [[sx * (TUNE.earSpread + 0.02), HEAD_Y + HEAD_H * 0.34 + TUNE.earLen * 0.6, -hw * 0.18], hw * 0.18, PAL.furLight],
        [[sx * (TUNE.earSpread + 0.03), HEAD_Y + HEAD_H * 0.34 + TUNE.earLen, -hw * 0.20], hw * 0.03, PAL.furLight],
      ], bi(n), 8));
    }

    // limbs
    const limb = (a, b, ra, rb, hex, bone) => parts.push(loft([
      [a, ra, hex], [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], (ra + rb) / 2, hex], [b, rb, hex],
    ], bone, 10));
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      const A = this._abs;
      limb(A[`upperArm${L}`], A[`lowerArm${L}`], 0.052 * TUNE.limbSlim, 0.043 * TUNE.limbSlim, PAL.blue, bi(`upperArm${L}`));
      limb(A[`lowerArm${L}`], A[`hand${L}`], 0.043 * TUNE.limbSlim, 0.036 * TUNE.limbSlim, PAL.blue, bi(`lowerArm${L}`));
      parts.push(blob(A[`hand${L}`], [0.055, 0.058, 0.050], PAL.blue, bi(`hand${L}`), 8, 6));
      limb(A[`upperLeg${L}`], A[`lowerLeg${L}`], 0.070 * TUNE.limbSlim, 0.054 * TUNE.limbSlim, PAL.cream, bi(`upperLeg${L}`));
      limb(A[`lowerLeg${L}`], A[`foot${L}`], 0.050 * TUNE.limbSlim, 0.040 * TUNE.limbSlim, PAL.blue, bi(`lowerLeg${L}`));
      parts.push(blob([A[`foot${L}`][0], A[`foot${L}`][1] - 0.020, A[`foot${L}`][2] + TUNE.footLen * 0.30],
        [TUNE.footWidth, 0.050, TUNE.footLen * 0.60], PAL.blue, bi(`foot${L}`), 10, 6));
    }

    // tail — banded, thick at the root (F3)
    const tailBones = ['tailA', 'tailB', 'tailC', 'tailD'];
    const rootR = hw * TUNE.tailRootFrac;
    for (let i = 0; i < tailBones.length; i++) {
      const a = this._abs[tailBones[i]];
      const b = i + 1 < tailBones.length ? this._abs[tailBones[i + 1]]
        : [a[0] + 0.14, a[1] + 0.10, a[2] - 0.20];
      const t0 = i / tailBones.length, t1 = (i + 1) / tailBones.length;
      const r0 = rootR * (1 - t0 * 0.55), r1 = rootR * (1 - t1 * 0.55);
      const hex = i % 2 === 0 ? PAL.furMid : PAL.cream;
      parts.push(loft([[a, r0, hex], [b, r1, hex]], bi(tailBones[i]), 12));
    }

    const m = merge(parts);
    const geo = new THREEJS.BufferGeometry();
    geo.setAttribute('position', new THREEJS.Float32BufferAttribute(m.pos, 3));
    geo.setAttribute('color', new THREEJS.Float32BufferAttribute(m.col, 3));
    geo.setAttribute('skinIndex', new THREEJS.Uint16BufferAttribute(m.bidx, 4));
    geo.setAttribute('skinWeight', new THREEJS.Float32BufferAttribute(m.bwt, 4));
    geo.setIndex(m.idx);
    geo.computeVertexNormals();

    const shading = this.engine?.get?.('shading');
    const mat = shading?.make
      ? shading.make({
        name: 'sly3:body', color: 0xffffff, vertexColors: true, bands: TUNE.bands,
        rim: TUNE.rim, rimColor: TUNE.rimColor, sss: TUNE.furSSS,
        outline: TUNE.outline, outlineColor: TUNE.outlineColor,
      })
      : new THREEJS.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

    this.mesh = new THREEJS.SkinnedMesh(geo, mat);
    this.mesh.name = 'sly3:mesh';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.add(boneList[0]);
    this.mesh.bind(skeleton);

    this.root.updateMatrixWorld(true);
    for (const n of BONE_ORDER) this._restQ[n] = this.bones[n].quaternion.clone();

    this.engine?.scene?.add(this.root);
  }

  /** Bind-pose world position of a bone — Rig.js calls this for the hips. */
  bp(name) { return this._bindWorld[name]; }

  update() { /* all motion comes from Rig/Animation; nothing self-driven here */ }

  dispose() {
    this.mesh?.geometry?.dispose?.();
    const mm = this.mesh?.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => x?.dispose?.());
    this.root.parent?.remove(this.root);
    this.mesh = null;
  }
}

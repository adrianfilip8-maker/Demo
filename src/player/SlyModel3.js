/**
 * SlyModel3 — the Sly 3 reference rebuild. Selected at boot by `?char=model3` / `__CHAR_AB`
 * (see main.js); absent that token the incumbent `SlyModel.js` boots, so this file can never
 * ship by accident.
 *
 * STAGE 2 — surface form. Stage 1 (the blockout) proved the swap end to end and put five
 * defects on screen; this stage exists to fix what those frames showed:
 *
 *   · the muzzle was 90% swallowed by the cranium (its first ring sat INSIDE the head blob);
 *   · the tail rendered as a flat ribbon;
 *   · the belt smeared into shirt and shorts as a vertex-colour gradient;
 *   · the head read ~1/7 of height instead of the reference's 1/5.5;
 *   · the boots ran knee-high like socks.
 *
 * The ribbon tail and the invisible muzzle shared one root cause, worth recording because it is
 * a geometry lesson and not a tuning miss: stage 1's `loft()` built every ring in the horizontal
 * XZ plane, so any tube whose axis is itself horizontal (tail along −Z, muzzle along +Z, arms
 * along ±X) had its ring offsets lying ALONG the axis — a degenerate ribbon. Vertical tubes
 * (torso, legs) were fine, which is exactly why the defect survived a vertical-primitives
 * blockout unnoticed. Stage 2 builds every limb-like form with `tube()`: rings perpendicular to
 * the path via parallel-transport frames.
 *
 * Colour boundaries: `tube()`/`loft()` interpolate vertex colours between rings, so a crisp
 * material edge (belt, cuff, boot top) is made by DOUBLING a ring — two rings at the same
 * position carrying the two colours. The gradient smear in stage 1 was the absence of this.
 *
 * Reference: progress/records/SPEC-sly3model.md (palette [read] from the user-supplied flat
 * texture atlas; proportions [read] from the standing three-quarter). PREREG-charab gates:
 *   G1 one blue by NAME across cap/shirt/gloves/boots — every blue below is `PAL.blue`;
 *   G2 one gold by NAME across belt/collar/cuffs/cane — every gold below is `PAL.gold`;
 *   G3 height parity with the incumbent (TUNE.height 1.80, unchanged);
 *   G4 tail root ≥ 0.40 × head WIDTH — see `tailRootFrac`, units stated at the constant.
 *
 * CONTRACT (Rig.js, unchanged): identity bind rotations; +X is Sly's LEFT, +Z FORWARD, origin at
 * feet; public surface root · bones · mesh · bp(name) · update(dt,t) · dispose(). Bone names and
 * hierarchy are verbatim from the incumbent so every clip and spring chain drives this model.
 */

import * as THREE from 'three';

/* ============================ TUNE — proportions ========================== */
export const TUNE = {
  height: 1.80,              // G3 — identical to the incumbent. Do not "improve" this.

  /* SPEC §3 read 1/5.5; the blind critic (r1, judging vs the reference) called the rendered head
     "~1/7" and asked for "about 1/5". The render eats head-share through the muzzle projecting
     forward rather than up and the cap hugging the skull, so the budget is raised toward the
     critic's number. SPEC's own rule: [read] values converge by rendering. */
  /* r2 measured the render at 6.1 heads — top of the window, still lean. Third nudge toward the
     centre; the critic measures, so the number converges by rounds. */
  headFraction: 1 / 4.85,
  capRise: 0.055,
  muzzleLen: 1.45,           // in head-HALF-WIDTH units, measured from the cranium's front face
  muzzleGirth: 0.78,
  earLen: 0.205,             // r1: "tall pointed ears ... instead of the small nubs"
  earSpread: 0.128,

  legFraction: 0.492,        // r3: "take the excess out of the shins" — lands ~5.3 heads rendered
  shinRatio: 0.52,
  footLen: 0.250,
  footWidth: 0.106,
  limbSlim: 0.86,

  /* G4 / SPEC F3. UNITS, stated because a units error already bit here once (the gate caught the
     stage-1 comment claiming 0.62 "sat well clear" — 0.62 was in HALF-width units and the bar is
     in WIDTH units, so the real figure was 0.31 and the tail was too thin): `tailRootFrac` is the
     tail root RADIUS as a fraction of head HALF-width. The gate divides by 2 to compare against
     F3's ≥ 0.40 × head WIDTH. 0.95 here ⇒ 0.475 × head width. */
  tailScale: 1.10,
  tailRootFrac: 1.05,        // r3: "2-3x thicker at the root" — 0.525 x head width, G4 well clear
  tailRings: 5,

  shoulderW: 0.170,          // r1: "widen the shoulders so the tunic reads as a torso, not a tube"
  hipW: 0.082,

  /* shading/line kept in family with the incumbent so the A/B is about FORM, not grade */
  outline: 0.0034,
  outlineColor: 0x1a1210,
  rim: 0.62,
  rimColor: 0x7fd4ff,
  furSSS: 0.38,
  bands: 3,
};

/* ============================ PAL — palette ===============================
 * SPEC §1 [read] from the flat atlas. G1/G5-by-construction: parts reference these BY NAME. */
const PAL = {
  blue: 0x2f5fc4,          // shirt · cap · gloves · boots — ONE blue (G1)
  blueDark: 0x16264f,
  gold: 0xd9a521,          // belt · collar · cuffs · cane — ONE gold (G2)
  goldDark: 0x8f6a12,
  cream: 0xe4dcc6,         // trousers, tail light bands
  furLight: 0xcfcdc4,      // muzzle, cheeks, neck
  furMid: 0x8d8b84,        // ears, muzzle shading
  tailDark: 0x5e5c55,      // tail dark bands — darker than furMid ON PURPOSE: stage 2's bands
                           // used furMid and washed out to a pale tube under SSS + rim; the
                           // venice crop's dark rings read near-charcoal in shade
  black: 0x141414,         // mask, nose, pupils
  red: 0xc4222c,           // hip sash
  eyeIris: 0xd9821a,
  eyeWhite: 0xf2f0ea,
};

/* ============================ SKELETON ==================================== */
const H = TUNE.height;
const HEAD_H = H * TUNE.headFraction;
const HIP_Y = H * TUNE.legFraction;
const NECK_Y = H - HEAD_H;
const CHEST_Y = HIP_Y + (NECK_Y - HIP_Y) * 0.62;
const SPINE_Y = HIP_Y + (NECK_Y - HIP_Y) * 0.28;
/* r3 (stage 6): 0.22 gave "a long pale tube neck". The head now sits ON the collar. */
const HEAD_Y = NECK_Y + HEAD_H * 0.12;
const HEAD_HW = HEAD_H * 0.40;
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
  ['lowerArmL', 'upperArmL', [TUNE.shoulderW + 0.190, NECK_Y - 0.245, 0]],
  ['handL', 'lowerArmL', [TUNE.shoulderW + 0.345, NECK_Y - 0.455, 0]],
  ['shoulderR', 'chest', [-0.052, NECK_Y - 0.055, 0]],
  ['upperArmR', 'shoulderR', [-TUNE.shoulderW, NECK_Y - 0.070, 0]],
  ['lowerArmR', 'upperArmR', [-(TUNE.shoulderW + 0.190), NECK_Y - 0.245, 0]],
  ['handR', 'lowerArmR', [-(TUNE.shoulderW + 0.345), NECK_Y - 0.455, 0]],

  ['upperLegL', 'hips', [TUNE.hipW, HIP_Y - 0.015, 0]],
  ['lowerLegL', 'upperLegL', [TUNE.hipW + 0.011, HIP_Y - THIGH, 0.012]],
  ['footL', 'lowerLegL', [TUNE.hipW + 0.016, ANKLE_Y, -0.020]],
  ['toeL', 'footL', [TUNE.hipW + 0.016, ANKLE_Y - 0.044, TUNE.footLen * 0.62]],
  ['upperLegR', 'hips', [-TUNE.hipW, HIP_Y - 0.015, 0]],
  ['lowerLegR', 'upperLegR', [-(TUNE.hipW + 0.011), HIP_Y - THIGH, 0.012]],
  ['footR', 'lowerLegR', [-(TUNE.hipW + 0.016), ANKLE_Y, -0.020]],
  ['toeR', 'footR', [-(TUNE.hipW + 0.016), ANKLE_Y - 0.044, TUNE.footLen * 0.62]],

  /* Bind tail carries the raccoon S — rises across the chain (a horizontal bind tail hides
     behind the body from almost every angle; the incumbent's own comment records this). */
  ['tailA', 'hips', [0, HIP_Y + 0.015, -0.150 * TUNE.tailScale]],
  ['tailB', 'tailA', [0.038 * TUNE.tailScale, HIP_Y + 0.020, -0.470 * TUNE.tailScale]],
  ['tailC', 'tailB', [0.110 * TUNE.tailScale, HIP_Y + 0.075, -0.775 * TUNE.tailScale]],
  ['tailD', 'tailC', [0.205 * TUNE.tailScale, HIP_Y + 0.175, -1.020 * TUNE.tailScale]],
];

const BONE_ORDER = SKELETON.map((s) => s[0]);

/* ============================ mesh builders =============================== */

/**
 * Oriented tube: rings PERPENDICULAR to the polyline, frames carried by parallel transport so
 * the ring basis never flips at a bend. This is the stage-2 fix for the ribbon defect — rings
 * must be ⟂ to the path, not to the world.
 *
 * pts    [[x,y,z], ...]      polyline (a repeated point makes a zero-length segment: a colour
 *                            seam — both rings share a position, colours stay crisp)
 * rad    [r, ...]            per-point radius
 * hex    [0x…, ...]          per-point colour
 * bone   [i, ...]            per-point bone index (rigid weight 1)
 */
function tube(pts, rad, hex, bone, seg = 12, jit = null, bone2 = null, w2 = null) {
  const P = pts.map((p) => new THREE.Vector3(...p));
  const n = P.length;
  const t = [], up = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const d = new THREE.Vector3().subVectors(b, a);
    if (d.lengthSq() < 1e-10) t.push(t[t.length - 1]?.clone() ?? new THREE.Vector3(0, 1, 0));
    else t.push(d.normalize());
  }
  // initial normal: anything not parallel to t0
  up.set(Math.abs(t[0].y) < 0.92 ? 0 : 1, Math.abs(t[0].y) < 0.92 ? 1 : 0, 0);
  let N = new THREE.Vector3().crossVectors(up, t[0]).normalize();
  const pos = [], col = [], idx = [], bidx = [], bwt = [];
  const c = new THREE.Color(), B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i > 0) { // parallel transport: project previous normal off the new tangent
      N = N.clone().sub(t[i].clone().multiplyScalar(N.dot(t[i])));
      if (N.lengthSq() < 1e-8) N.set(0, 1, 0).sub(t[i].clone().multiplyScalar(t[i].y));
      N.normalize();
    }
    B.crossVectors(t[i], N).normalize();
    c.setHex(hex[i]);
    for (let s = 0; s < seg; s++) {
      /* jit[i] > 0 makes this ring ragged: deterministic per-vertex radius jitter (SPEC F4 — the
         torn trouser hem is a silhouette feature; a straight hem is a registered defect). */
      const j = jit && jit[i] ? 1 + jit[i] * Math.sin(s * 3.71 + i * 1.93) : 1;
      const a = (s / seg) * Math.PI * 2, ca = Math.cos(a) * rad[i] * j, sa = Math.sin(a) * rad[i] * j;
      pos.push(P[i].x + N.x * ca + B.x * sa, P[i].y + N.y * ca + B.y * sa, P[i].z + N.z * ca + B.z * sa);
      col.push(c.r, c.g, c.b);
      /* r3 (§stage-6): a ring welded 100% to its nearest bone creases at every bone boundary the
         moment the chain poses — the critic's "hard-faceted zigzag" was skinning, not sampling.
         bone2/w2, when given, blend each ring across the two bones its param sits between. */
      if (bone2 && bone2[i] != null && w2 && w2[i] > 0) {
        bidx.push(bone[i], bone2[i], 0, 0); bwt.push(1 - w2[i], w2[i], 0, 0);
      } else {
        bidx.push(bone[i], 0, 0, 0); bwt.push(1, 0, 0, 0);
      }
    }
  }
  for (let r = 0; r < n - 1; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s, b2 = r * seg + ((s + 1) % seg), d = a + seg, e = b2 + seg;
      idx.push(a, d, b2, b2, d, e);
    }
  }
  return { pos, col, idx, bidx, bwt };
}

/** Vertical-axis ellipsoid (fine for heads/hands/blobs — its axis never lies flat). */
function blob(centre, radii, hexv, bone, seg = 12, rows = 8) {
  const pos = [], col = [], idx = [], bidx = [], bwt = [];
  const c = new THREE.Color(hexv);
  for (let i = 0; i <= rows; i++) {
    const phi = (i / rows) * Math.PI;
    const y = centre[1] + Math.cos(phi) * radii[1];
    const rx = Math.max(1e-4, Math.sin(phi) * radii[0]);
    const rz = Math.max(1e-4, Math.sin(phi) * radii[2]);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(centre[0] + Math.cos(a) * rx, y, centre[2] + Math.sin(a) * rz);
      col.push(c.r, c.g, c.b);
      bidx.push(bone, 0, 0, 0); bwt.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s, b = r * seg + ((s + 1) % seg), d = a + seg, e = b + seg;
      idx.push(a, d, b, b, d, e);
    }
  }
  return { pos, col, idx, bidx, bwt };
}

/** Vertical loft (axis = +Y): unchanged from stage 1, correct for the torso/neck. */
function loft(rings, bone, seg = 14) {
  const pos = [], col = [], idx = [], bidx = [], bwt = [];
  const c = new THREE.Color();
  for (const [p, rad, hexv] of rings) {
    c.setHex(hexv);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(p[0] + Math.cos(a) * rad, p[1], p[2] + Math.sin(a) * rad);
      col.push(c.r, c.g, c.b);
      bidx.push(bone, 0, 0, 0); bwt.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s, b = r * seg + ((s + 1) % seg), d = a + seg, e = b + seg;
      idx.push(a, d, b, b, d, e);
    }
  }
  return { pos, col, idx, bidx, bwt };
}

/** Catmull-Rom through pts, sampled at `steps` points (for the tail spline). */
function catmull(pts, steps) {
  const P = pts.map((p) => new THREE.Vector3(...p));
  const out = [];
  const get = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let s = 0; s < steps; s++) {
    const t = (s / (steps - 1)) * (P.length - 1);
    const i = Math.min(P.length - 2, Math.floor(t)), u = t - i;
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const u2 = u * u, u3 = u2 * u;
    out.push([
      0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
      0.5 * ((2 * p1.y) + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      0.5 * ((2 * p1.z) + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3),
    ]);
  }
  return out;
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
    /* ---- skeleton (identical mechanism to stage 1) ---- */
    for (const [name, parent, p] of SKELETON) {
      const b = new THREE.Bone();
      b.name = name;
      const par = parent === 'root' ? null : this.bones[parent];
      const parAbs = parent === 'root' ? [0, 0, 0] : this._abs[parent];
      b.position.set(p[0] - parAbs[0], p[1] - parAbs[1], p[2] - parAbs[2]);
      (this._abs ||= {})[name] = p;
      (par || this.root).add(b);
      this.bones[name] = b;
      this._bindWorld[name] = new THREE.Vector3(p[0], p[1], p[2]);
    }
    const boneList = BONE_ORDER.map((n) => this.bones[n]);
    const skeleton = new THREE.Skeleton(boneList);
    const bi = (n) => BONE_ORDER.indexOf(n);
    const hw = HEAD_HW;
    const A = this._abs;
    const parts = [];

    /* ================= HEAD group ================= */
    const headB = bi('head');
    const CR = [hw * 1.04, HEAD_H * 0.46, hw * 0.98];            // cranium radii — fills the budget
    const CY = HEAD_Y + HEAD_H * 0.14;                            // cranium centre height
    parts.push(blob([0, CY, 0], CR, PAL.furLight, headB, 14, 10));

    // muzzle — oriented tube from the cranium's FRONT FACE outward (+Z), dipping slightly.
    // Stage 1's sat inside the ball; this one starts at z = 0.80·hw (proud of centre) and runs
    // muzzleLen HALF-WIDTHS from the front face, so the snout projects unambiguously.
    /* Stage 3: raised to MID-face and near-horizontal. Stage 2 set the muzzle a tenth of a head
       LOW with a 2 cm droop and it read as a bird's bill pointing at the floor; the reference's
       snout leaves the face at eye-cheek height, level, and only the nose tip dips.
       Stage 4 (r1: "a detached rectangular block ... with a visible seam"): the first ring now
       starts DEEP INSIDE the cranium at a larger radius, so the tube emerges through the surface
       and the junction is buried — fusion by overlap, plus cheek pads flanking the root. */
    const mzY = CY - HEAD_H * 0.02;
    const mz0 = CR[2] * 0.48;
    const mzTip = CR[2] + hw * TUNE.muzzleLen - CR[2] * 0.2;
    parts.push(tube(
      [[0, mzY, mz0], [0, mzY - 0.002, (mz0 + mzTip) / 2], [0, mzY - 0.006, mzTip]],
      [hw * 0.62 * TUNE.muzzleGirth, hw * 0.42 * TUNE.muzzleGirth, hw * 0.22],
      [PAL.furLight, PAL.furLight, PAL.furLight], [headB, headB, headB], 12));
    for (const s of [1, -1]) {
      parts.push(blob([s * hw * 0.34, mzY - hw * 0.06, CR[2] * 0.72], [hw * 0.26, hw * 0.22, hw * 0.24],
        PAL.furLight, headB, 10, 6));                       // cheeks: blend muzzle root into skull
    }
    /* r2 (closeup): "flat-ended grey cylinder with no nose" — the nose now CAPS the muzzle tip
       (overlapping the last ring) instead of floating ahead of it. */
    parts.push(blob([0, mzY - 0.004, mzTip + hw * 0.02], [hw * 0.17, hw * 0.13, hw * 0.14], PAL.black, headB, 10, 6));

    // mask — black field across the eyes with pointed outer corners: two wing blobs proud of the
    // cranium plus a bridge across the face front (SPEC §2: it is a fur marking and wraps).
    const eyeY = CY + HEAD_H * 0.05;
    for (const s of [1, -1]) {
      parts.push(blob([s * hw * 0.72, eyeY, hw * 0.55], [hw * 0.40, hw * 0.28, hw * 0.34], PAL.black, headB, 10, 6));
      /* r1/SPEC: "drawn to a point at each outer corner" — a tapering black spike sweeping from
         the wing outward and back toward the ear base. This is the mask's identity signature. */
      parts.push(tube(
        [[s * hw * 0.82, eyeY + hw * 0.02, hw * 0.30], [s * hw * 1.06, eyeY + hw * 0.10, -hw * 0.10]],
        [hw * 0.16, hw * 0.015], [PAL.black, PAL.black], [headB, headB], 8));
    }
    /* r2 (closeup): "mask a lopsided blob covering one eye only"; r3: still half-missing. Stage 6
       makes the bridge TALLER and WIDER than both sockets and pulls the wings frontal, so the
       black field survives any three-quarter. */
    parts.push(blob([0, eyeY, hw * 0.86], [hw * 0.88, hw * 0.30, hw * 0.13], PAL.black, headB, 12, 6));

    /* eyes — stage 3: ~30% bigger and pushed proud of a THINNER mask bridge. Stage 2's stack sat
       flush with the bridge and read as one black lump; the amber is an identity cue and has to
       survive the profile view. */
    for (const s of [1, -1]) {
      parts.push(blob([s * hw * 0.30, eyeY + hw * 0.02, hw * 1.00], [hw * 0.20, hw * 0.19, hw * 0.10], PAL.eyeWhite, headB, 10, 6));
      parts.push(blob([s * hw * 0.27, eyeY + hw * 0.02, hw * 1.09], [hw * 0.115, hw * 0.115, hw * 0.055], PAL.eyeIris, headB, 8, 5));
      parts.push(blob([s * hw * 0.255, eyeY + hw * 0.02, hw * 1.135], [hw * 0.048, hw * 0.048, hw * 0.026], PAL.black, headB, 6, 4));
    }

    // r3: "the cap is a thin band leaving a bare tan crown" — the dome now ENCLOSES the crown
    // (wider than the cranium in all axes, centred lower) with the brim forward (G1: PAL.blue)
    parts.push(blob([0, CY + HEAD_H * 0.26, -hw * 0.04], [hw * 1.14, HEAD_H * 0.30, hw * 1.08], PAL.blue, headB, 14, 8));
    parts.push(blob([0, CY + HEAD_H * 0.205, hw * 0.95], [hw * 0.60, HEAD_H * 0.040, hw * 0.48], PAL.blue, bi('capBrim'), 12, 5));
    // r3: "a defined jaw" — a chin mass under the muzzle root, fusing face into skull
    parts.push(blob([0, mzY - hw * 0.34, CR[2] * 0.52], [hw * 0.36, hw * 0.20, hw * 0.34], PAL.furLight, headB, 10, 6));

    // ears — big oriented fins, wide base to a sharp tip (SPEC: large, tall, pointed)
    for (const [n, s] of [['earL', 1], ['earR', -1]]) {
      const eb = A[n];
      parts.push(tube(
        [[eb[0], eb[1] - 0.012, eb[2]],
         [eb[0] + s * 0.030, eb[1] + TUNE.earLen * 0.55, eb[2] - 0.012],
         [eb[0] + s * 0.052, eb[1] + TUNE.earLen, eb[2] - 0.024]],
        [hw * 0.36, hw * 0.20, hw * 0.035],
        [PAL.furMid, PAL.furMid, PAL.furLight], [bi(n), bi(n), bi(n)], 10));
    }

    // neck — closes the stage-1 gap between torso top and head underside
    parts.push(loft([
      [[0, NECK_Y - 0.045, 0.010], 0.058, PAL.furLight],
      [[0, HEAD_Y + 0.010, 0.012], 0.062, PAL.furLight],
    ], bi('neck')));

    /* ================= TORSO — doubled rings for crisp edges ================= */
    const beltLo = HIP_Y + 0.008, beltHi = HIP_Y + 0.052;
    const collarLo = NECK_Y - 0.062;
    parts.push(loft([
      [[0, HIP_Y - 0.125, 0], 0.094, PAL.cream],
      [[0, beltLo, 0], 0.108, PAL.cream],
      [[0, beltLo, 0], 0.110, PAL.gold],     // ← doubled: cream|gold seam
      [[0, beltHi, 0], 0.112, PAL.gold],
      [[0, beltHi, 0], 0.110, PAL.blue],     // ← doubled: gold|blue seam
      [[0, SPINE_Y, 0], 0.112, PAL.blue],
      [[0, CHEST_Y, 0], 0.132, PAL.blue],
      [[0, collarLo, 0], 0.098, PAL.blue],
      [[0, collarLo, 0], 0.098, PAL.gold],   // ← doubled: blue|gold collar seam
      [[0, NECK_Y - 0.030, 0], 0.078, PAL.gold],
    ], bi('chest')));

    // red hip sash — on Sly's RIGHT (−X): a wrap pad + a hanging flap (SPEC §2)
    parts.push(blob([-0.078, HIP_Y - 0.028, 0.058], [0.070, 0.048, 0.070], PAL.red, bi('hips'), 10, 6));
    parts.push(tube(
      [[-0.062, HIP_Y - 0.052, 0.088], [-0.052, HIP_Y - 0.165, 0.098]],
      [0.036, 0.020], [PAL.red, PAL.red], [bi('hips'), bi('hips')], 8));

    /* ================= ARMS — oriented tubes, gold cuffs, mitten hands ================= */
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      const sh = A[`upperArm${L}`], el = A[`lowerArm${L}`], wr = A[`hand${L}`];
      const slim = TUNE.limbSlim;
      // wrist cuff: doubled point 3.5cm before the wrist along the forearm
      const cu = [wr[0] - (wr[0] - el[0]) * 0.18, wr[1] - (wr[1] - el[1]) * 0.18, wr[2] - (wr[2] - el[2]) * 0.18];
      /* stage 3: +25% limb mass — stage 2's arms read starved next to both the reference and the
         incumbent */
      parts.push(tube(
        [sh, el, cu, cu, wr],
        [0.065 * slim, 0.055 * slim, 0.048 * slim, 0.058 * slim, 0.056 * slim],
        [PAL.blue, PAL.blue, PAL.blue, PAL.gold, PAL.gold],
        [bi(`upperArm${L}`), bi(`lowerArm${L}`), bi(`lowerArm${L}`), bi(`lowerArm${L}`), bi(`hand${L}`)], 10));
      // mitten + thumb (G1: PAL.blue)
      parts.push(blob([wr[0] + s * 0.014, wr[1] - 0.042, wr[2] + 0.014], [0.062, 0.074, 0.068], PAL.blue, bi(`hand${L}`), 10, 6));
      parts.push(tube(
        [[wr[0], wr[1] - 0.024, wr[2] + 0.036], [wr[0] - s * 0.014, wr[1] - 0.062, wr[2] + 0.070]],
        [0.024, 0.015], [PAL.blue, PAL.blue], [bi(`hand${L}`), bi(`hand${L}`)], 7));
    }

    /* ================= LEGS — cream to mid-calf, then blue boots ================= */
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      const hip = A[`upperLeg${L}`], knee = A[`lowerLeg${L}`], ank = A[`foot${L}`];
      const slim = TUNE.limbSlim;
      /* stage 3: baggy cream shorts from the hip, RAGGED hem at mid-calf (SPEC F4 — a straight
         hem is a registered defect; the jitter ring is the tatter), boot below with a flare.
         +25% mass throughout — stage 2's legs were noodles. */
      const hem = [knee[0] + (ank[0] - knee[0]) * 0.42, knee[1] + (ank[1] - knee[1]) * 0.42, knee[2] + (ank[2] - knee[2]) * 0.42];
      parts.push(tube(
        [[hip[0], hip[1] + 0.02, hip[2]], knee, hem, hem, ank],
        [0.096 * slim, 0.070 * slim, 0.078 * slim, 0.058 * slim, 0.062 * slim],
        [PAL.cream, PAL.cream, PAL.cream, PAL.blue, PAL.blue],
        [bi(`upperLeg${L}`), bi(`lowerLeg${L}`), bi(`lowerLeg${L}`), bi(`lowerLeg${L}`), bi(`foot${L}`)], 12,
        [0, 0, 0.20, 0, 0]));                       // ← the hem ring alone is ragged
      // foot: big rounded boot + heel (G1: PAL.blue)
      parts.push(blob([ank[0], ank[1] - 0.024, ank[2] + TUNE.footLen * 0.30],
        [TUNE.footWidth, 0.058, TUNE.footLen * 0.62], PAL.blue, bi(`foot${L}`), 12, 6));
      parts.push(blob([ank[0], ank[1] - 0.016, ank[2] - TUNE.footLen * 0.16],
        [TUNE.footWidth * 0.72, 0.050, TUNE.footLen * 0.24], PAL.blue, bi(`foot${L}`), 8, 5));
    }

    /* ================= TAIL — thick, banded, splined ================= */
    {
      const rootR = hw * TUNE.tailRootFrac;                       // G4: 0.95·hw ⇒ 0.475 × head width
      /* stage 3: the stage-2 tail hooked upward like a swan neck (the tip extension rose 0.16 m)
         and its bands washed out. The arc now stays LOW and sweeps behind — S, not J — and the
         tip extension is modest. */
      const spine = catmull([
        [0, HIP_Y + 0.010, -0.06],
        A.tailA, A.tailB, A.tailC, A.tailD,
        [A.tailD[0] + 0.10 * TUNE.tailScale, A.tailD[1] + 0.05, A.tailD[2] - 0.11 * TUNE.tailScale],
      ], 30);
      const tailBones = ['tailA', 'tailB', 'tailC', 'tailD'].map(bi);
      const pts = [], rad = [], hex = [], bone = [];
      const bandOf = (t) => Math.min(TUNE.tailRings * 2 - 1, Math.floor(t * TUNE.tailRings * 2));
      const colOf = (b) => (b % 2 === 0 ? PAL.tailDark : PAL.cream);   // dark first, HIGH contrast
      /* r3 (stage 6): r2's "uniform rope" fix over-corrected into "a narrow tapering stick" — the
         VISIBLE tail in posed shots is the mid and tip, so tip-weighted taper removed exactly the
         mass the silhouette needed. Mid-weighted profile now: fatter root, slow mid decline, real
         taper only in the last third. The critic's kinks were skinning (fixed via bone2/w2 below),
         and the "ragged fur edge" it asked for is a small jitter on the light bands. */
      const radOf = (t) => Math.max(hw * 0.12, rootR * (1 - 0.55 * Math.pow(t, 1.35)));
      const boneParam = (t) => {
        const x = Math.min(0.999, Math.max(0, t)) * tailBones.length;
        const i = Math.floor(x);
        return { a: tailBones[i], b: tailBones[Math.min(tailBones.length - 1, i + 1)], w: x - i };
      };
      const w2 = [], bone2 = [], jitv = [];
      let prevBand = -1;
      const pushRing = (i, t, b) => {
        const bp = boneParam(t);
        pts.push(spine[i]); rad.push(radOf(t)); hex.push(colOf(b));
        bone.push(bp.a); bone2.push(bp.b); w2.push(bp.w);
        jitv.push(b % 2 === 1 ? 0.07 : 0);       // fur hint on the light bands only
      };
      for (let i = 0; i < spine.length; i++) {
        const t = i / (spine.length - 1);
        const b = bandOf(t);
        if (prevBand >= 0 && b !== prevBand) pushRing(i, t, prevBand);  // doubled ring: crisp band edge
        pushRing(i, t, b);
        prevBand = b;
      }
      parts.push(tube(pts, rad, hex, bone, 12, jitv, bone2, w2));
      const tip = spine[spine.length - 1];
      parts.push(blob([tip[0], tip[1], tip[2]], [hw * 0.14, hw * 0.14, hw * 0.14],
        PAL.tailDark, tailBones[3], 8, 5));
    }

    /* ================= CANE — gold shaft + hook, in the right hand (G2: PAL.gold) ============ */
    {
      const wr = A.handR;
      const g = bi('handR');
      /* r1: the cane read as "a thin gold thread ... a hanging chain". Shaft and hook radii up
         ~60%, hook radius up to a real crook, so it carries weight at gameplay distance.
         r2: "the cane detaches — floating clear of the hand, clipping the tail, stabbing through
         the hip". The shaft now runs THROUGH the mitten's centre (the grip is a spline point, not
         a hope), and the below-hand run is 40% shorter so a crouch cannot drive it into the hip. */
      /* r3: "a second gold segment poking out at the hip" — the below-grip stub is DELETED. The
         cane is one piece: shaft rising from the fist to the crook, nothing below the hand. */
      const grip = [wr[0] - 0.014, wr[1] - 0.042, wr[2] + 0.014];   // the mitten's centre, exactly
      const top = [wr[0] - 0.02, wr[1] + 0.55, wr[2] + 0.09];
      parts.push(tube(
        [[grip[0] + 0.006, grip[1] - 0.06, grip[2] - 0.012], grip, top],
        [0.021, 0.023, 0.021], [PAL.gold, PAL.gold, PAL.gold], [g, g, g], 9));
      const hookPts = [], hookR = 0.115;
      for (let i = 0; i <= 7; i++) {
        const a = (i / 7) * Math.PI;                              // 180°
        hookPts.push([top[0], top[1] + Math.sin(a) * hookR, top[2] + hookR - Math.cos(a) * hookR]);
      }
      parts.push(tube(hookPts, hookPts.map(() => 0.019), hookPts.map(() => PAL.gold),
        hookPts.map(() => g), 9));
    }

    /* ---- assemble ---- */
    const m = merge(parts);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.bidx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.bwt, 4));
    geo.setIndex(m.idx);
    geo.computeVertexNormals();

    const shading = this.engine?.get?.('shading');
    const mat = shading?.make
      ? shading.make({
        name: 'sly3:body', color: 0xffffff, vertexColors: true, bands: TUNE.bands,
        rim: TUNE.rim, rimColor: TUNE.rimColor, sss: TUNE.furSSS,
        outline: TUNE.outline, outlineColor: TUNE.outlineColor,
      })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

    this.mesh = new THREE.SkinnedMesh(geo, mat);
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

  bp(name) { return this._bindWorld[name]; }
  update() { /* all motion comes from Rig/Animation */ }
  dispose() {
    this.mesh?.geometry?.dispose?.();
    const mm = this.mesh?.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => x?.dispose?.());
    this.root.parent?.remove(this.root);
    this.mesh = null;
  }
}

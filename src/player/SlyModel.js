import * as THREE from 'three';
import {
  MeshBuilder, addTube, addEllipsoid, addPatch, addTuft, addHardBox,
  resample, superEllipse, smooth, ramp, furTint,
  makeFurMaps, makeClothMaps, makeMetalMaps,
} from './Body.js';
import { Cane } from './Cane.js';

/**
 * SlyModel — Sly Cooper himself. One skinned mesh, one skeleton, every vertex generated here.
 *
 * The design brief in a sentence: **~1:5 head-to-body cartoon raccoon thief**, slate-blue fur,
 * cyan newsboy cap, black domino mask, an enormous ringed tail and a gold crook cane. If the
 * silhouette does not say "Sly" when filled solid black, nothing else about the model matters.
 *
 * Ownership notes for the other player agents:
 *   · `root` origin is at his FEET, +Z is his forward. MOVEMENT positions this and nothing else.
 *   · `bones` is a name → THREE.Bone map. ANIMATION drives it. The names are a contract (§4).
 *   · Bind pose is a relaxed A-pose (arms 40° below horizontal). The *default* pose applied on
 *     top of bind is `idle_confident`, so a frame taken before ANIMATION exists is never a
 *     T-pose mannequin.
 *
 * ⚠ ANIMATION please note: because the bind IS an A-pose, `Rig.commit()`'s
 * `else b.quaternion.identity()` branch renders a literal A-pose for any bone a pose buffer
 * does not drive. Every clip in `Clips.js` currently drives all 31 bones, so it never fires —
 * but it means a partially-authored clip fails into the one silhouette §7.3 auto-fails on,
 * rather than into the previous frame or the default idle. Holding the previous value would
 * fail soft instead. Changing the bind here is not the fix: every clip is authored as rotations
 * on top of it, so moving it would shift all 52.
 */

/* ============================ TUNE ======================================== */

export const TUNE = {
  height: 1.80,

  /* --- silhouette proportions. These are the cartoon exaggeration knobs. ---
   *
   * Measured before this pass, off the skinned mesh rather than off these numbers: chin→crown
   * 0.349 m against a 1.93 m rendered figure = **5.5 heads**, or 4.4 counting the cap as part
   * of the head silhouette (which it is). That is the lanky end of stylised-realistic, not the
   * ~1:5 §7.3 asks for, and at `hero` distance — 55 px — it left him an unreadable column.
   *
   * Head count alone is the weakest of the levers, because the head sits on top: growing it
   * grows the total, so the ratio only asymptotes to 1.49 + 1.396/headHeight. Getting to 4.5
   * by headScale alone needs S≈1.55 and a bobblehead. The cartoon read actually comes from the
   * *set*: big head, tiny waist, narrow shoulders, long thin limbs, oversized hands and feet,
   * and a tail with more mass than the torso. All six move together here.
   */
  headScale: 1.31,        // cranium scale about the neck joint (§7.3 "~1:5 head:body")
  headWide: 1.08,         // extra width-only on the cranium: rounder from the front
  tailScale: 1.12,        // tail length + girth; the tail is half the silhouette
  handScale: 1.46,        // big thief hands — they sell every gesture, so they are oversized
  footScale: 1.34,        // chunky boots give the contrapposto a base to stand on
  limbSlim: 0.86,         // long thin limbs: every leg/arm radius goes through this
  shoulderSlim: 0.87,     // narrow shoulders — the deltoid mass, not the bone spacing
  brimLift: 0.050,        // cap brim off the brow — it was covering both eyes, see _buildCap
  torsoShrink: 0.16,      // see `by()`: hips→neck 0.49 → 0.33 m, 5.29 → 4.88 heads tall

  /* Head-space units (pre-`headScale`), applied to the muzzle, the nose and the mouth line
   * together so they cannot drift apart. The muzzle root used to top out at y 1.652 against
   * eye centres at 1.612 — a snout taller than the eyes are high, rising to a point *between*
   * them. Measured through the real `sly-closeup` camera it owned 18% of the head box and left
   * the domino mask with nowhere to be: rendering the `ink` group alone produced two pupils, a
   * nose and a mouth, and no mask at any thickness anywhere on the face. See _buildMask.
   *
   * 0.034 → 0.070 off a real capture: at 0.034 the snout root still topped out at head-space
   * 1.598 against eyes that bottom out at 1.536, so it read as a beak rising between them. */
  muzzleDrop: 0.070,

  /* --- shading / line --- */
  outline: 0.0034,        // fraction-of-frame-height thickness ⇒ ~2.5 px at any resolution
  outlineColor: 0x1a1210, // §2.1: warm near-black, never pure #000
  rim: 0.62,
  rimColor: 0x7fd4ff,
  furSSS: 0.38,           // warm wrap-through; the single biggest "this is fur" cue
  bands: 3,
  furTintAmount: 0.095,   // per-vertex tone break-up so no region is a flat colour

  /* --- fur, read from the OUTLINE (§7.3 "fur reads as smooth plastic") ---
   * A cel-shaded character carries no fur information in its shading, so all of it has to be
   * in the geometry: a shell-fur or noise-normal pass cannot save a silhouette that is a
   * smooth capsule. Two instruments — clumps that break the edge, and low-frequency lobing
   * that stops the underlying loft being a capsule in the first place. */
  tuftDensity: 2.2,       // clump count multiplier
  tuftWidth: 1.55,        // clumps are broad flat wedges, not needles (needles read as spikes)
  furLobe: 0.055,         // amplitude of the low-frequency lumpiness on furred lofts

  /* --- idle life, only used while ANIMATION is absent --- */
  breathRate: 0.62,
  breathAmp: 0.014,
  tailIdleRate: 0.42,
  tailIdleAmp: 0.055,

  segLimb: 13,            // radial segments: limbs
  segTorso: 20,
  segHead: 22,
  segTail: 18,
};

/* ============================ PALETTE ===================================== */

/**
 * §2.1 material separation. These are *material* colours — the only place hue lives. The
 * values are deliberately spread apart on a value ladder, because "flat single colour" is an
 * auto-fail and two materials three points apart in luminance read as one under a cel ramp:
 *
 *   cream 0.87 · gold 0.73 · furMid 0.54 · shirt 0.45 · clothDark 0.28 · tailDark 0.19 · ink 0.07
 *
 * These are *material* colours only. Vertex colour on this mesh is a neutral multiplier — see
 * the contract note on Body.furTint before writing a palette value into a `colorAt`.
 */
const PAL = {
  furMid: 0x7a8ba8,       // §2.1 slate blue-grey — the fur
  furShadow: 0x53627c,
  furLight: 0xa2b4cd,
  cream: 0xe4dfcb,        // muzzle, chest V, tail bands — the light end of the ladder
  tailDark: 0x2a3142,     // the rings; well below the fur so they band at any size
  shirt: 0x2f7fc4,        // §2.1 cyan-blue cap + shirt
  shirtDark: 0x1b4f7c,    // gloves, boots, brim — a real value step below the shirt
  gold: 0xe8b942,         // §2.2 GOLD mid — belt buckle, pouch, cane
  ink: 0x191113,          // §2.1 never pure black
  eyeWhite: 0xf7f3e6,
};

/* Material group order — index into the material array, so also the draw-call order. */
const GROUPS = ['fur', 'furCream', 'furDark', 'cloth', 'clothDark', 'gold', 'ink', 'eye'];

/**
 * Head space. `headScale` has to move the skull, the face, the cap, the ears *and* the head
 * bones together or the mask slides off the eyes the moment you touch it — which is why it
 * had been left at 1.0 and he shipped at 6.1 heads tall (§7.3 fails "realistic instead of
 * ~1:5 head:body cartoon"). Everything above the neck joint goes through `hy`/`hx`.
 */
const HEAD_BASE = 1.396;                                   // the neck joint: the fixed point
const HIP_Y = 0.905;                                       // the hips joint: the other fixed point

/**
 * Body space. **This is the head:body lever**, and it is the one that actually works.
 *
 * `headScale` alone asymptotes: the head sits on top of hips + torso, so growing it grows the
 * total and the ratio only ever approaches `1.49 + 1.396/headHeight`. Reaching 1:4.5 that way
 * needs headScale ≈ 1.55 and produces a bobblehead. Taking the *torso* out instead moves the
 * numerator down and the denominator not at all, and it is independently the right cartoon
 * call: big head, short body, long legs.
 *
 * `by(y)` compresses the hips→neck span by `TUNE.torsoShrink` metres and rigidly carries
 * everything above the neck down by the same amount. Below the hips it is the identity, so
 * legs, boots and the shirt hem never move. Every absolute Y in body space goes through it —
 * the bone table, `TORSO`, `SPINE_RAMP`, the chest V, the belt and the body tufts — so the
 * next person moves one number instead of finding ten.
 *
 * Two things deliberately do **not** go through it:
 *   · the arm chain, which drops rigidly by `armDrop` instead — compressing it would shorten
 *     his arms, and §7.3 wants them long;
 *   · the tail, which is authored off the hips and is half the silhouette.
 */
const by = (y) => {
  const s = TUNE.torsoShrink;
  if (s <= 0 || y <= HIP_Y) return y;
  if (y >= HEAD_BASE) return y - s;
  return HIP_Y + (y - HIP_Y) * (1 - s / (HEAD_BASE - HIP_Y));
};
/** How far the shoulder moved; the whole arm chain follows it rigidly. */
const armDrop = () => 1.292 - by(1.292);
const ay = (y) => y - armDrop();

const hy = (y) => by(HEAD_BASE) + (y - HEAD_BASE) * TUNE.headScale;
const hx = (v) => v * TUNE.headScale;
/** Cross-body width in head space. Wider than it is deep reads rounder from the front. */
const hw = (v) => v * TUNE.headScale * TUNE.headWide;

/**
 * Low-frequency lumpiness for a lofted fur surface. Same trick the tail has always used,
 * pulled out so every furred loft can have it: two incommensurate ripples around the ring
 * and along the length, so the outline is never a clean ellipse at any cut. `amp` 0 → off.
 */
const furLobe = (a, t, amp, fa = 5, ft = 15) => (amp <= 0 ? 1 : (
  1 + amp * Math.sin(t * ft + a * fa) + amp * 0.62 * Math.cos(a * (fa + 3) - t * (ft * 0.63))
));

/* ============================ SKELETON ==================================== */

/** [name, parent, [x,y,z] in bind-pose model space]. His right is −X, forward is +Z. */
const SKELETON = [
  ['hips', 'root', [0, HIP_Y, -0.005]],
  ['spine', 'hips', [0, by(1.010), 0.000]],
  ['chest', 'spine', [0, by(1.150), -0.005]],
  ['neck', 'chest', [0, by(1.315), 0.010]],
  ['head', 'neck', [0, hy(1.420), 0.015]],
  ['jaw', 'head', [0, hy(1.478), hx(0.055)]],
  ['capBrim', 'head', [0, hy(1.665), hx(0.090)]],
  ['earL', 'head', [hw(0.128), hy(1.662), hx(-0.022)]],
  ['earR', 'head', [hw(-0.128), hy(1.662), hx(-0.022)]],
  ['browL', 'head', [hw(0.064), hy(1.648), hx(0.140)]],
  ['browR', 'head', [hw(-0.064), hy(1.648), hx(0.140)]],

  ['shoulderL', 'chest', [0.052, ay(1.292), 0.000]],
  ['upperArmL', 'shoulderL', [0.140, ay(1.278), 0.000]],
  ['lowerArmL', 'upperArmL', [0.3315, ay(1.1173), 0.000]],
  ['handL', 'lowerArmL', [0.4800, ay(0.9523), 0.000]],
  ['shoulderR', 'chest', [-0.052, ay(1.292), 0.000]],
  ['upperArmR', 'shoulderR', [-0.140, ay(1.278), 0.000]],
  ['lowerArmR', 'upperArmR', [-0.3315, ay(1.1173), 0.000]],
  ['handR', 'lowerArmR', [-0.4800, ay(0.9523), 0.000]],

  ['upperLegL', 'hips', [0.072, 0.885, 0.000]],
  ['lowerLegL', 'upperLegL', [0.083, 0.480, 0.012]],
  ['footL', 'lowerLegL', [0.088, 0.082, -0.020]],
  ['toeL', 'footL', [0.088, 0.038, 0.098]],
  ['upperLegR', 'hips', [-0.072, 0.885, 0.000]],
  ['lowerLegR', 'upperLegR', [-0.083, 0.480, 0.012]],
  ['footR', 'lowerLegR', [-0.088, 0.082, -0.020]],
  ['toeR', 'footR', [-0.088, 0.038, 0.098]],

  /* The tail is half the silhouette, so its *bind* already carries the raccoon S — it rises
     across the chain instead of trailing flat behind him. A horizontal bind tail disappears
     behind the body from every camera angle except pure side-on, which is how a 1.1 m tail
     managed to read as "no tail at all". ANIMATION's clip rotations compose on top of this. */
  ['tailA', 'hips', [0, 0.898, -0.135]],
  ['tailB', 'tailA', [0.038, 0.896, -0.440]],
  ['tailC', 'tailB', [0.110, 0.928, -0.730]],
  ['tailD', 'tailC', [0.205, 1.008, -0.962]],
];

/**
 * `idle_confident` — the default pose, per AGENTS.md §7.3 ("pose is A-pose/T-pose/stiff" is an
 * auto-fail). Weight on his right leg, pelvis cocked, chest counter-rotated against the hips,
 * chin up, cane slung over the right shoulder, tail arcing up behind. Euler XYZ, radians.
 * Because every bone's bind rotation is identity, these read as world-axis rotations at the
 * joint, which makes them hand-tunable.
 */
const IDLE_CONFIDENT = {
  hipsOffset: [0, -0.016, 0],
  hips: [0.030, 0.150, -0.085],
  spine: [-0.025, -0.070, 0.055],
  chest: [0.020, -0.150, 0.045],
  neck: [-0.030, 0.060, -0.010],
  head: [-0.055, 0.165, -0.050],
  jaw: [0.020, 0, 0],
  capBrim: [0.020, 0, 0],
  earL: [-0.120, 0.050, -0.150],
  earR: [-0.040, -0.060, 0.230],
  browL: [0, 0, 0.100],
  browR: [0, 0, -0.020],

  shoulderL: [0.030, 0.060, -0.140],
  upperArmL: [0.090, 0.100, -0.545],
  lowerArmL: [-0.060, -0.300, -0.480],
  handL: [0.140, -0.150, -0.180],

  shoulderR: [0.040, -0.060, 0.130],
  upperArmR: [0.260, -0.120, 0.640],
  lowerArmR: [0.140, 0.520, 1.180],
  handR: [-0.050, 0.120, 0.020],

  upperLegR: [-0.020, -0.150, 0.070],
  lowerLegR: [0.045, 0, 0],
  footR: [-0.020, -0.060, 0],
  upperLegL: [0.150, 0.230, 0.010],
  lowerLegL: [-0.250, 0, 0],
  footL: [0.115, 0.090, 0],

  tailA: [0.300, -0.130, 0.030],
  tailB: [0.320, -0.190, 0],
  tailC: [0.240, 0.120, 0],
  tailD: [-0.140, 0.280, 0],
};

/* ---- scratch (module scope: update() must not allocate) ------------------ */
const _e = new THREE.Euler();
const _qs = new THREE.Quaternion();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

/* ========================================================================== */

export class SlyModel {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;

    this.root = new THREE.Group();
    this.root.name = 'sly_root';

    this.height = TUNE.height;
    this.bones = {};
    this.skeleton = null;
    this.mesh = null;
    this.outlineMesh = null;
    this.cane = null;

    this._materials = [];
    this._textures = [];
    this._geometries = [];
    this._restQ = {};          // bind-pose-relative default pose, for the idle breath
    this._attachPoints = {};
    this._offShot = null;
    this.triangles = 0;
    this.warned = false;
  }

  /* ====================================================================== */
  /*  init                                                                  */
  /* ====================================================================== */

  async init() {
    try {
      this._buildSkeleton();
      const mb = new MeshBuilder(this._boneIndex);
      this._buildBody(mb);
      const geo = mb.toGeometry(GROUPS);
      this._geometries.push(geo);
      this.triangles = mb.triangleCount;

      if (mb.missingBones.size) {
        this.engine.warn(`SlyModel: weights referenced unknown bones: ${[...mb.missingBones].join(', ')}`);
      }

      this._makeTextures();
      const mats = GROUPS.map((g) => this._material(g));

      this.mesh = new THREE.SkinnedMesh(geo, mats);
      this.mesh.name = 'sly_body';
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      // One character, always on screen and always deforming — culling it by a stale bind-pose
      // bounding sphere is the classic skinned-mesh popping bug.
      this.mesh.frustumCulled = false;
      this.root.add(this.mesh);

      // Bind while root sits at the identity so bindMatrix is trivial and MOVEMENT can move
      // `root` freely afterwards.
      this.root.updateMatrixWorld(true);
      this.mesh.bind(this.skeleton, new THREE.Matrix4());

      this._buildCane();
      this._buildOutline(geo);

      this.applyPose(IDLE_CONFIDENT);
      this._captureRest();

      this.engine.scene.add(this.root);

      // Without MOVEMENT there is nobody to place him for a canonical shot, and an unposed
      // character at the origin makes every character frame useless.
      this._offShot = this.engine.on('shot', ({ shot }) => {
        if (this.engine.get('movement') || !shot?.player) return;
        this.root.position.fromArray(shot.player.pos);
        this.root.rotation.set(0, shot.player.yaw ?? 0, 0);
        this.root.updateMatrixWorld(true);
      });

      this.engine.emit('characterReady', this);
    } catch (err) {
      this.engine.warn(`SlyModel: build failed — ${err?.message || err}`);
      console.error('[character] build failed', err);
    }
  }

  /* ====================================================================== */
  /*  skeleton                                                              */
  /* ====================================================================== */

  _buildSkeleton() {
    const rootBone = new THREE.Bone();
    rootBone.name = 'root';
    this.bones.root = rootBone;
    this.root.add(rootBone);

    const worldPos = { root: new THREE.Vector3(0, 0, 0) };
    for (const [name, parent, p] of SKELETON) {
      const b = new THREE.Bone();
      b.name = name;
      const wp = new THREE.Vector3().fromArray(p);
      worldPos[name] = wp;
      // Bones carry no bind rotation: every joint's local axes stay world-aligned, so a pose
      // authored as Euler XYZ is readable by a human and mirrors cleanly.
      b.position.copy(wp).sub(worldPos[parent]);
      this.bones[parent].add(b);
      this.bones[name] = b;
    }
    this._bindWorld = worldPos;

    const order = ['root', ...SKELETON.map((s) => s[0])];
    const boneList = order.map((n) => this.bones[n]);
    this._boneIndex = {};
    order.forEach((n, i) => { this._boneIndex[n] = i; });

    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(boneList);
    this.boneNames = order;
  }

  /** Position of a bone in bind space — every builder below measures from these. */
  bp(name) { return this._bindWorld[name]; }

  /* ====================================================================== */
  /*  body                                                                  */
  /* ====================================================================== */

  _buildBody(mb) {
    this._buildTorso(mb);
    this._buildChestV(mb);
    this._buildBelt(mb);
    this._buildTail(mb);
    for (const s of [1, -1]) {
      this._buildArm(mb, s);
      this._buildHand(mb, s);
      this._buildLeg(mb, s);
      this._buildBoot(mb, s);
      this._buildEar(mb, s);
    }
    this._buildHead(mb);
    this._buildMuzzle(mb);
    this._buildFace(mb);
    this._buildCap(mb);
    this._buildTufts(mb);
  }

  /* ---------------------------- torso ----------------------------------- */

  /* y, half-width, half-depth, z-offset. Wide chest → wasp waist → flared shirt hem: the
     classic thief triangle. Y is authored in *uncompressed* body space and mapped through
     `by()` here, so `TUNE.torsoShrink` moves the whole profile without touching these
     numbers — the silhouette shape is a separate decision from the torso's length. */
  static TORSO = [
    [0.815, 0.112, 0.092, -0.008],
    [0.848, 0.109, 0.089, -0.006],
    [0.895, 0.101, 0.082, 0.000],
    [0.945, 0.088, 0.071, 0.004],
    [0.995, 0.079, 0.063, 0.006],   // the wasp waist stays exactly where it was
    [1.045, 0.092, 0.071, 0.006],
    [1.095, 0.112, 0.083, 0.004],
    [1.145, 0.128, 0.092, 0.000],
    [1.195, 0.134, 0.095, -0.004],
    [1.245, 0.128, 0.089, -0.008],
    [1.290, 0.112, 0.079, -0.008],
    [1.316, 0.096, 0.071, -0.002],
    [1.330, 0.104, 0.078, 0.002],   // collar lip flares out
    [1.337, 0.098, 0.078, 0.005],   // neck fur begins (hard crease here)
    [1.382, 0.094, 0.076, 0.008],
    [1.422, 0.092, 0.076, 0.010],
  ].map((r) => [by(r[0]), r[1], r[2], r[3]]);

  _torsoRadius(y) {
    const T = SlyModel.TORSO;
    for (let i = 0; i < T.length - 1; i++) {
      if (y <= T[i + 1][0] || i === T.length - 2) {
        const f = THREE.MathUtils.clamp((y - T[i][0]) / (T[i + 1][0] - T[i][0]), 0, 1);
        return {
          rx: THREE.MathUtils.lerp(T[i][1], T[i + 1][1], f),
          rz: THREE.MathUtils.lerp(T[i][2], T[i + 1][2], f),
          cz: THREE.MathUtils.lerp(T[i][3], T[i + 1][3], f),
        };
      }
    }
    return { rx: T[0][1], rz: T[0][2], cz: T[0][3] };
  }

  /* Same authoring space as TORSO, mapped the same way — the weight ramp has to move with the
     geometry it weights or a shortened torso shears at the waist. */
  static SPINE_RAMP = [
    [0.80, { hips: 1 }],
    [0.93, { hips: 1 }],
    [0.98, { hips: 0.45, spine: 0.55 }],
    [1.03, { spine: 1 }],
    [1.10, { spine: 0.35, chest: 0.65 }],
    [1.17, { chest: 1 }],
    [1.28, { chest: 1 }],
    [1.312, { chest: 0.55, neck: 0.45 }],
    [1.345, { neck: 1 }],
    [1.392, { neck: 0.45, head: 0.55 }],
    [1.430, { head: 1 }],
  ].map((r) => [by(r[0]), r[1]]);

  _buildTorso(mb) {
    const T = SlyModel.TORSO;
    const centers = T.map(([y, , , cz]) => new THREE.Vector3(0, y, cz));
    const sgBody = mb.newSg(), sgCollar = mb.newSg(), sgNeck = mb.newSg();

    addTube(mb, {
      centers,
      seg: TUNE.segTorso,
      rx: (i) => T[i][1],
      ry: (i) => T[i][2],
      upHint: new THREE.Vector3(0, 0, 1),
      // Slightly squared section: a perfect ellipse cylinder reads as a barrel, a superellipse
      // reads as a chest with a flat back and a keel.
      shape: (a, i) => {
        const s = superEllipse(a, 1.18);
        // keel: push the sternum forward through the chest rings only
        const chest = smooth(1.08, 1.20, T[i][0]) * (1 - smooth(1.24, 1.31, T[i][0]));
        s.v *= 1 + 0.06 * chest * Math.max(0, Math.cos(a));
        return s;
      },
      groupAt: (i) => (T[i][0] >= 1.336 ? 'furCream' : 'cloth'),
      sgAt: (i) => (T[i][0] >= 1.336 ? sgNeck : (T[i][0] >= 1.330 ? sgCollar : sgBody)),
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount * 0.6),
      weightsAtVert: (i, t, a, p) => this._torsoWeights(p),
      capStart: true,
      uvScale: [3, 1],
    });
  }

  /**
   * Torso weights. Two hand fixes on top of the spine ramp:
   *  · **Shoulders** — the deltoid area of the torso is dragged into shoulderL/R by an x·y
   *    window. Without it, raising an arm shears a triangular dent out of the chest, because
   *    the chest bone owns the vertices the deltoid actually sits on.
   *  · **Hips** — everything below the belt is pinned to `hips` at full weight and explicitly
   *    denied to `spine`, so a hip sway does not pull the shirt hem into an hourglass.
   */
  _torsoWeights(p) {
    const w = ramp(p.y, SlyModel.SPINE_RAMP);
    const ax = Math.abs(p.x);
    const shoulderWin = smooth(0.042, 0.098, ax)
      * smooth(by(1.16), by(1.25), p.y) * (1 - smooth(by(1.28), by(1.33), p.y));
    if (shoulderWin > 0.01) {
      const s = shoulderWin * 0.62;
      const name = p.x > 0 ? 'shoulderL' : 'shoulderR';
      const out = [];
      for (const [b, a] of w) out.push([b, a * (1 - s)]);
      out.push([name, s]);
      return out;
    }
    return w;
  }

  /** The open-collar cream chest. A colour break at the collarbone stops the torso reading
      as one blue tube, and gives the chest tufts something to grow out of. */
  _buildChestV(mb) {
    const top = by(1.322);
    mb.group('furCream').sg(mb.newSg());
    addPatch(mb, {
      segU: 14, segV: 5,
      group: 'furCream',
      at: (u, v) => {
        const th = THREE.MathUtils.lerp(-0.66, 0.66, u);
        const mid = 1 - Math.pow(Math.abs(u * 2 - 1), 1.5);
        const bot = top - 0.030 - 0.105 * mid;
        const y = THREE.MathUtils.lerp(top, bot, v);
        const r = this._torsoRadius(y);
        const k = 1.022;
        return new THREE.Vector3(Math.sin(th) * r.rx * k, y, r.cz + Math.cos(th) * r.rz * k);
      },
      colorAt: (u, v, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount),
      weightsAtVert: (u, v, p) => ramp(p.y, SlyModel.SPINE_RAMP),
    });
  }

  /* ---------------------------- belt + pouch ---------------------------- */

  _buildBelt(mb) {
    const y = by(0.851);
    const r = this._torsoRadius(y);
    const N = 30;
    const centers = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      centers.push(new THREE.Vector3(Math.sin(a) * (r.rx + 0.006), y, r.cz + Math.cos(a) * (r.rz + 0.006)));
    }
    addTube(mb, {
      centers, seg: 8, rx: 0.013, ry: 0.027,
      groupAt: () => 'clothDark',
      sgAt: () => 640,
      weightsAt: () => [['hips', 1]],
      upHint: new THREE.Vector3(0, 1, 0),
      shape: (a) => superEllipse(a, 1.7),
    });

    // buckle — hard-edged gold, the one metal accent at the waist
    addHardBox(mb, {
      center: new THREE.Vector3(0.004, y, r.cz + r.rz + 0.019),
      half: new THREE.Vector3(0.031, 0.022, 0.010),
      group: 'gold', weights: [['hips', 1]],
    });

    /* Gold belt pouch on his right hip — the loot bag. Boxy, chunky, and it breaks the hip
       silhouette so his waist doesn't read as a smooth taper. */
    const pouch = [
      new THREE.Vector3(-0.104, 0.884, 0.034),
      new THREE.Vector3(-0.112, 0.848, 0.032),
      new THREE.Vector3(-0.118, 0.804, 0.030),
      new THREE.Vector3(-0.120, 0.766, 0.028),
      new THREE.Vector3(-0.118, 0.744, 0.026),
    ];
    addTube(mb, {
      centers: pouch, seg: 12,
      rx: [0.026, 0.032, 0.034, 0.031, 0.020],
      ry: [0.040, 0.049, 0.052, 0.047, 0.030],
      groupAt: () => 'gold',
      sgAt: () => 650,
      shape: (a) => superEllipse(a, 1.65),
      weightsAt: () => [['hips', 1]],
      upHint: new THREE.Vector3(0, 0, 1),
      capStart: true, capEnd: true,
    });
    // pouch strap
    addTube(mb, {
      centers: [
        new THREE.Vector3(-0.104, 0.878, 0.062),
        new THREE.Vector3(-0.106, 0.858, 0.066),
        new THREE.Vector3(-0.110, 0.834, 0.062),
      ],
      seg: 6, rx: 0.007, ry: 0.026,
      groupAt: () => 'clothDark', sgAt: () => 652,
      weightsAt: () => [['hips', 1]],
      upHint: new THREE.Vector3(1, 0, 0),
      capStart: true, capEnd: true,
    });
  }

  /* ---------------------------- tail ------------------------------------ */

  /**
   * The tail. Deliberately enormous: the brief calls it half his silhouette and it is the
   * one shape that makes a slate-blue biped read as a raccoon at 40 px tall. Four bones so
   * ANIMATION can whip it; six dark rings; tufts all the way round so the outline is ragged
   * on both edges — a tail smooth along one whole side reads as upholstery, not fur.
   */
  _buildTail(mb) {
    const S = TUNE.tailScale;
    /* Follows the bind bone chain: back off the hips, then sweeping up *and* out to his left.
       Both departures from "straight behind" are deliberate, and neither is decoration:
         · The rise gets the tail out from behind his own back. Left horizontal it is occluded
           from every camera angle except pure side-on — which is how a 1.1 m tail managed to
           be recorded as "no tail at all".
         · The lateral flare gets it out from behind his own shoulder. `sly-closeup`'s camera
           sits 1.8° off his facing direction, so a tail that only rises still stacks up behind
           the torso in the one shot that exists to prove the character.
       ANIMATION's clip rotations compose on top, so this only has to *start* the arc. */
    const spine = resample([
      new THREE.Vector3(0.000, 0.898, -0.070 * S),
      new THREE.Vector3(0.008, 0.895, -0.199 * S),
      new THREE.Vector3(0.026, 0.894, -0.337 * S),
      new THREE.Vector3(0.055, 0.899, -0.474 * S),
      new THREE.Vector3(0.094, 0.913, -0.607 * S),
      new THREE.Vector3(0.141, 0.941, -0.731 * S),
      new THREE.Vector3(0.196, 0.983, -0.840 * S),
      new THREE.Vector3(0.254, 1.039, -0.926 * S),
      new THREE.Vector3(0.312, 1.105, -0.984 * S),
      new THREE.Vector3(0.362, 1.174, -1.016 * S),
    ], 32);

    /* Girth: at its widest the tail is 0.36 m across — wider than his 0.27 m chest and close to
       his 0.41 m head. That ratio is not an exaggeration of the reference, it *is* the
       reference; a tail slimmer than the torso reads as a rope. The root stays narrow (0.058)
       so the fat lobe reads as its own mass rather than as a hump on his back. */
    const radius = (t) => {
      const prof = [
        [0.00, 0.058], [0.09, 0.098], [0.20, 0.150], [0.36, 0.180],
        [0.52, 0.178], [0.66, 0.163], [0.80, 0.135], [0.91, 0.094], [1.00, 0.034],
      ];
      for (let i = 0; i < prof.length - 1; i++) {
        if (t <= prof[i + 1][0]) {
          const f = (t - prof[i][0]) / (prof[i + 1][0] - prof[i][0]);
          return THREE.MathUtils.lerp(prof[i][1], prof[i + 1][1], f) * S;
        }
      }
      return 0.034 * S;
    };

    /* Ring bands. Crisp material boundaries at ring positions — no vertex duplication needed,
       so the surface stays watertight and the normals stay smooth across the colour change.
       Six bands, and the dark ones are the wider pair: a raccoon tail reads dark-dominant. */
    const BANDS = [[0.14, 0.255], [0.335, 0.445], [0.520, 0.625], [0.700, 0.795], [0.860, 0.935], [0.975, 1.001]];
    const isDark = (t) => BANDS.some(([a, b]) => t >= a && t < b);

    const RAMP = [
      [0.00, { hips: 0.55, tailA: 0.45 }],
      [0.07, { tailA: 1 }],
      [0.20, { tailA: 1 }],
      [0.28, { tailA: 0.5, tailB: 0.5 }],
      [0.38, { tailB: 1 }],
      [0.48, { tailB: 1 }],
      [0.56, { tailB: 0.5, tailC: 0.5 }],
      [0.66, { tailC: 1 }],
      [0.74, { tailC: 1 }],
      [0.82, { tailC: 0.45, tailD: 0.55 }],
      [0.90, { tailD: 1 }],
      [1.00, { tailD: 1 }],
    ];
    this._tailRamp = RAMP;
    this._tailSpine = spine;
    this._tailRadius = radius;
    this._tailIsDark = isDark;

    addTube(mb, {
      centers: spine,
      seg: TUNE.segTail,
      rx: (i, t) => radius(t),
      upHint: new THREE.Vector3(0, 1, 0),
      // A tail that is a perfect surface of revolution reads as a sausage. Low-frequency
      // lumpiness plus a mild vertical squash makes it read as fur over a spine.
      shape: (a, i, t) => {
        const s = superEllipse(a, 1.06);
        const lump = furLobe(a, t * 6, TUNE.furLobe * 1.5, 3, 26);
        return { u: s.u * lump * 1.03, v: s.v * lump * 0.94 };
      },
      groupAt: (i, t) => (isDark(t) ? 'furDark' : 'furCream'),
      sgAt: () => 700,
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount),
      weightsAt: (i, t) => ramp(t, RAMP),
      capEnd: true,
      uvScale: [3, 1],
    });
  }

  /* ---------------------------- arms ------------------------------------ */

  _buildArm(mb, side) {
    const L = side > 0 ? 'L' : 'R';
    const sh = this.bp('upperArmL').clone(); sh.x *= side;
    const el = this.bp('lowerArmL').clone(); el.x *= side;
    const wr = this.bp('handL').clone(); wr.x *= side;

    /* ≥3 rings straddle each joint so the elbow can flex 100° without creasing.
       Y through `ay()`: the arm drops rigidly with the shoulder when the torso is shortened,
       it does not compress with it — a short torso should not also mean short arms. */
    const key = [
      [0.00, new THREE.Vector3(side * 0.062, ay(1.292), 0.000), 0.052],
      [0.10, new THREE.Vector3(side * 0.104, ay(1.290), 0.000), 0.066],
      [0.22, new THREE.Vector3(side * 0.145, ay(1.279), 0.000), 0.071],
      [0.34, new THREE.Vector3(side * 0.196, ay(1.238), 0.000), 0.060],
      [0.48, new THREE.Vector3(side * 0.252, ay(1.191), 0.000), 0.052],
      [0.60, new THREE.Vector3(side * 0.300, ay(1.150), 0.000), 0.049],
      [0.68, new THREE.Vector3(side * 0.3315, ay(1.1173), 0.000), 0.0505],
      [0.76, new THREE.Vector3(side * 0.366, ay(1.0835), 0.000), 0.048],
      [0.86, new THREE.Vector3(side * 0.412, ay(1.0325), 0.000), 0.0435],
      [0.93, new THREE.Vector3(side * 0.451, ay(0.9885), 0.000), 0.040],
      [0.965, new THREE.Vector3(side * 0.468, ay(0.9700), 0.000), 0.042],
      [1.00, new THREE.Vector3(side * 0.482, ay(0.9535), 0.000), 0.038],
    ];
    void sh; void el; void wr;

    const centers = key.map((k) => k[1]);
    const radii = key.map((k) => k[2]);
    const ts = key.map((k) => k[0]);

    const ARM_RAMP = [
      [0.00, { [`shoulder${L}`]: 0.50, chest: 0.50 }],
      [0.10, { [`shoulder${L}`]: 0.86, chest: 0.14 }],
      [0.22, { [`shoulder${L}`]: 0.58, [`upperArm${L}`]: 0.42 }],
      [0.34, { [`shoulder${L}`]: 0.18, [`upperArm${L}`]: 0.82 }],
      [0.48, { [`upperArm${L}`]: 1 }],
      [0.60, { [`upperArm${L}`]: 0.78, [`lowerArm${L}`]: 0.22 }],
      [0.68, { [`upperArm${L}`]: 0.50, [`lowerArm${L}`]: 0.50 }],
      [0.76, { [`upperArm${L}`]: 0.20, [`lowerArm${L}`]: 0.80 }],
      [0.86, { [`lowerArm${L}`]: 1 }],
      [0.93, { [`lowerArm${L}`]: 1 }],
      [0.965, { [`lowerArm${L}`]: 0.82, [`hand${L}`]: 0.18 }],
      [1.00, { [`lowerArm${L}`]: 0.42, [`hand${L}`]: 0.58 }],
    ];

    // Sleeve → a short band of bare forearm fur → glove cuff. The fur band exists so the
    // forearm tufts have somewhere to grow from, and it breaks the blue tube in two.
    const sgSleeve = mb.newSg(), sgFur = mb.newSg(), sgCuff = mb.newSg();
    const cuffStart = 0.86, gloveStart = 0.965;

    /* Published for the tuft pass so forearm clumps sit on the real loft rather than on a
       hand-copied pair of coordinates that silently rots when a radius moves. */
    (this._armInfo || (this._armInfo = {}))[side] = { key, ramp: ARM_RAMP, cuffStart, gloveStart };

    /* Slim, and slimmest at the shoulder end. §7.3's cartoon read wants narrow shoulders and
       long thin limbs; the deltoid below carries what shoulder mass there is. */
    const slim = (i) => TUNE.limbSlim * (ts[i] < 0.34 ? TUNE.shoulderSlim : 1);

    /* Cloth silhouette events. A sleeve is not a machined tube — fabric bunches above the
       elbow and the hem rolls where it ends — and the sleeve is the *second* largest smooth
       surface on him after the legs, ~35 px wide and 250 px long at `sly-closeup`, with
       nothing happening on either edge. These are 3–4 px steps, which is about the smallest
       event that survives the 2.5 px ink hull. Fur clumps are not the instrument here: this
       surface is cloth, and clumping it would read as a moulting jumper. */
    const clothSwell = (i) => {
      const t = ts[i];
      if (t >= cuffStart) return 1;
      return 1 + 0.10 * smooth(0.56, 0.68, t) * (1 - smooth(0.70, 0.80, t))
        + 0.20 * smooth(0.68, 0.76, t);
    };

    addTube(mb, {
      centers, seg: TUNE.segLimb,
      rx: (i) => radii[i] * slim(i) * clothSwell(i) * (ts[i] >= gloveStart ? 1.14 : 1.0),
      framesOverride: undefined,
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a, i) => {
        const s = superEllipse(a, 1.05);
        // the bare forearm band is fur, so it gets the lumpy loft; the sleeve does not
        if (ts[Math.min(i, ts.length - 1)] >= cuffStart && ts[Math.min(i, ts.length - 1)] < gloveStart) {
          const k = furLobe(a, i, TUNE.furLobe * 1.3, 4, 11);
          return { u: s.u * k, v: s.v * k };
        }
        return s;
      },
      groupAt: (i) => {
        const t = ts[Math.min(i, ts.length - 1)];
        if (t >= gloveStart) return 'clothDark';
        if (t >= cuffStart) return 'fur';
        return 'cloth';
      },
      sgAt: (i) => {
        const t = ts[Math.min(i, ts.length - 1)];
        if (t >= gloveStart) return sgCuff;
        if (t >= cuffStart) return sgFur;
        return sgSleeve;
      },
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount * 0.5),
      weightsAt: (i) => ramp(ts[Math.min(i, ts.length - 1)], ARM_RAMP),
      capStart: true,
      uvScale: [2, 1],
    });

    /* Deltoid cap. Automatic weighting cannot invent this volume, and without it a raised arm
       exposes the hole where the sleeve meets the chest. */
    addEllipsoid(mb, {
      center: new THREE.Vector3(side * 0.132 * TUNE.shoulderSlim, ay(1.281), -0.002),
      radii: new THREE.Vector3(0.062, 0.058, 0.062).multiplyScalar(TUNE.shoulderSlim),
      segTheta: 16, segPhi: 9,
      group: 'cloth', sg: mb.newSg(),
      weights: [[`shoulder${L}`, 0.78], ['chest', 0.22]],
      colorAt: (u, v, p) => furTint(_c, p.x, p.y, p.z, 0.03),
    });
  }

  /* ---------------------------- hands ----------------------------------- */

  /** Big glove mitts. Sly's hands sell every gesture, so they get real fingers and a cuff. */
  _buildHand(mb, side) {
    const L = side > 0 ? 'L' : 'R';
    const wrist = new THREE.Vector3(side * 0.482, ay(0.9535), 0);
    const dir = new THREE.Vector3(side * 0.669, -0.743, 0).normalize();   // along the arm
    const fwd = new THREE.Vector3(0, 0, 1);                               // thumb side
    const nrm = new THREE.Vector3().crossVectors(dir, fwd).normalize();   // palm normal
    const S = TUNE.handScale;
    const palm = wrist.clone().addScaledVector(dir, 0.052 * S);
    const W = [[`hand${L}`, 1]];

    // cuff — flared, hard-edged. Reads as a glove rather than painted-on colour.
    addTube(mb, {
      centers: [
        wrist.clone().addScaledVector(dir, -0.014),
        wrist.clone().addScaledVector(dir, 0.004),
        wrist.clone().addScaledVector(dir, 0.020),
      ],
      seg: TUNE.segLimb,
      rx: [0.038 * S, 0.044 * S, 0.041 * S],
      framesOverride: { T: [dir, dir, dir], R: [fwd, fwd, fwd], U: [nrm, nrm, nrm] },
      groupAt: () => 'clothDark',
      sgAt: (i) => 800 + i,
      weightsAt: () => [[`lowerArm${L}`, 0.35], [`hand${L}`, 0.65]],
    });

    addEllipsoid(mb, {
      center: palm,
      radii: new THREE.Vector3(0.030 * S, 0.058 * S, 0.052 * S),
      basis: { x: nrm, y: dir, z: fwd },
      segTheta: 16, segPhi: 10,
      group: 'clothDark', sg: mb.newSg(), weights: W,
      warp: (p) => { p.addScaledVector(fwd, 0.004 * S); },
    });

    // three fingers spread along the thumb axis, plus a thumb off the radial side
    const fingers = [
      { z: -0.031, len: 0.052, r: 0.0165, tilt: -0.16 },
      { z: 0.001, len: 0.060, r: 0.0175, tilt: 0.0 },
      { z: 0.032, len: 0.054, r: 0.0165, tilt: 0.16 },
    ];
    for (const f of fingers) {
      const base = palm.clone().addScaledVector(dir, 0.042 * S).addScaledVector(fwd, f.z * S);
      const fd = dir.clone().addScaledVector(fwd, f.tilt).normalize();
      const pts = [
        base.clone(),
        base.clone().addScaledVector(fd, f.len * 0.42 * S),
        base.clone().addScaledVector(fd, f.len * 0.78 * S),
        base.clone().addScaledVector(fd, f.len * S),
      ];
      addTube(mb, {
        centers: pts, seg: 8,
        rx: [f.r * S * 1.02, f.r * S, f.r * S * 0.92, f.r * S * 0.66],
        framesOverride: { T: [fd, fd, fd, fd], R: [fwd, fwd, fwd, fwd], U: [nrm, nrm, nrm, nrm] },
        groupAt: () => 'clothDark', sgAt: () => 810,
        weightsAt: () => W,
        capEnd: true,
      });
    }
    // thumb
    const tb = palm.clone().addScaledVector(fwd, 0.038 * S).addScaledVector(dir, -0.006 * S);
    const td = new THREE.Vector3().copy(fwd).multiplyScalar(0.82).addScaledVector(dir, 0.42)
      .addScaledVector(nrm, -side * 0.12).normalize();
    const tpts = [tb.clone(), tb.clone().addScaledVector(td, 0.022 * S),
      tb.clone().addScaledVector(td, 0.040 * S), tb.clone().addScaledVector(td, 0.052 * S)];
    addTube(mb, {
      centers: tpts, seg: 8,
      rx: [0.020 * S, 0.019 * S, 0.017 * S, 0.012 * S],
      framesOverride: { T: [td, td, td, td], R: [nrm, nrm, nrm, nrm], U: [dir, dir, dir, dir] },
      groupAt: () => 'clothDark', sgAt: () => 812,
      weightsAt: () => W, capEnd: true,
    });
  }

  /* ---------------------------- legs ------------------------------------ */

  _buildLeg(mb, side) {
    const L = side > 0 ? 'L' : 'R';
    const key = [
      [0.00, new THREE.Vector3(side * 0.070, 0.905, 0.000), 0.102],
      [0.10, new THREE.Vector3(side * 0.076, 0.820, 0.002), 0.092],
      [0.24, new THREE.Vector3(side * 0.080, 0.708, 0.006), 0.077],
      [0.40, new THREE.Vector3(side * 0.083, 0.590, 0.010), 0.064],
      [0.52, new THREE.Vector3(side * 0.085, 0.480, 0.012), 0.0595],  // knee
      [0.62, new THREE.Vector3(side * 0.086, 0.410, 0.006), 0.0605],
      [0.72, new THREE.Vector3(side * 0.088, 0.330, -0.002), 0.0625],  // calf
      [0.82, new THREE.Vector3(side * 0.089, 0.240, -0.010), 0.049],
      [0.92, new THREE.Vector3(side * 0.090, 0.150, -0.017), 0.039],
      [1.00, new THREE.Vector3(side * 0.090, 0.086, -0.021), 0.036],
    ];
    const ts = key.map((k) => k[0]);
    const RAMP = [
      [0.00, { hips: 0.42, [`upperLeg${L}`]: 0.58 }],
      [0.10, { [`upperLeg${L}`]: 1 }],
      [0.40, { [`upperLeg${L}`]: 1 }],
      [0.46, { [`upperLeg${L}`]: 0.72, [`lowerLeg${L}`]: 0.28 }],
      [0.52, { [`upperLeg${L}`]: 0.45, [`lowerLeg${L}`]: 0.55 }],
      [0.60, { [`upperLeg${L}`]: 0.12, [`lowerLeg${L}`]: 0.88 }],
      [0.72, { [`lowerLeg${L}`]: 1 }],
      [0.92, { [`lowerLeg${L}`]: 1 }],
      [1.00, { [`lowerLeg${L}`]: 0.55, [`foot${L}`]: 0.45 }],
    ];

    /* Published for the tuft pass. The leg is the largest single smooth surface on him — at
       `sly-closeup` he renders 669 px tall, so one leg is ~35 px wide and ~300 px long — and
       measured off the real projection its outline curvature was 0.26 px/row against 3.9 on the
       head, i.e. a machined tube. Clumps have to sit exactly on this loft or they float. */
    (this._legInfo || (this._legInfo = {}))[side] = { key, ramp: RAMP };

    addTube(mb, {
      centers: key.map((k) => k[1]), seg: TUNE.segLimb,
      rx: (i) => key[i][2] * TUNE.limbSlim,
      upHint: new THREE.Vector3(0, 0, 1),
      // Bare fur leg: lobed, so the outline is never the clean tapered cylinder that reads
      // as moulded plastic. Amplitude falls off toward the ankle, where the boot takes over.
      shape: (a, i, t) => {
        const s = superEllipse(a, 1.04);
        const k = furLobe(a, i, TUNE.furLobe * (1 - 0.55 * t), 5, 13);
        return { u: s.u * k, v: s.v * k };
      },
      groupAt: () => 'fur',
      sgAt: () => 900 + (side > 0 ? 0 : 1),
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount * 0.7),
      weightsAt: (i) => ramp(ts[Math.min(i, ts.length - 1)], RAMP),
      capStart: true,
      uvScale: [2, 1],
    });
  }

  /* ---------------------------- boots ----------------------------------- */

  /** Chunky, obviously-grabbable feet. Big boots read as cartoon and give the pose a base. */
  _buildBoot(mb, side) {
    const L = side > 0 ? 'L' : 'R';
    const S = TUNE.footScale;
    const x = side * 0.088;
    const SOLE = 0.014;

    // shaft, from a flared cuff at mid-calf down to the ankle
    const shaft = [
      [new THREE.Vector3(x, 0.312, -0.004), 0.078],
      [new THREE.Vector3(x, 0.286, -0.006), 0.070],
      [new THREE.Vector3(x, 0.232, -0.010), 0.061],
      [new THREE.Vector3(x, 0.170, -0.016), 0.055],
      [new THREE.Vector3(x, 0.120, -0.020), 0.053],
    ];
    addTube(mb, {
      centers: shaft.map((s) => s[0]), seg: 16,
      rx: (i) => shaft[i][1] * S,
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a) => superEllipse(a, 1.35),
      groupAt: () => 'clothDark',
      sgAt: (i) => (i === 0 ? 950 : 951),
      weightsAt: (i) => (i <= 1
        ? [[`lowerLeg${L}`, 1]]
        : [[`lowerLeg${L}`, 0.82 - i * 0.16], [`foot${L}`, 0.18 + i * 0.16]]),
      capStart: true,
      uvScale: [2, 1],
    });

    // the foot itself: lofted along +Z, bottom clamped flat onto the sole plane
    const foot = [
      [-0.062, 0.036, 0.034, 0.086],
      [-0.030, 0.046, 0.044, 0.072],
      [0.010, 0.052, 0.046, 0.060],
      [0.062, 0.054, 0.043, 0.052],
      [0.115, 0.052, 0.038, 0.047],
      [0.163, 0.045, 0.031, 0.043],
      [0.198, 0.032, 0.023, 0.040],
      [0.216, 0.016, 0.012, 0.038],
    ];
    const centers = foot.map(([z, , , cy]) => new THREE.Vector3(x, cy, z));
    addTube(mb, {
      centers, seg: 16,
      rx: (i) => foot[i][1] * S,
      ry: (i) => foot[i][2] * S,
      upHint: new THREE.Vector3(0, 1, 0),
      shape: (a) => superEllipse(a, 1.5),
      warp: (p) => { if (p.y < SOLE + 0.010) p.y = SOLE + 0.010; },
      groupAt: () => 'clothDark',
      sgAt: () => 955 + (side > 0 ? 0 : 1),
      weightsAt: (i, t) => (t < 0.72
        ? [[`foot${L}`, 1]]
        : [[`foot${L}`, 1 - (t - 0.72) / 0.28 * 0.8], [`toe${L}`, (t - 0.72) / 0.28 * 0.8]]),
      capStart: true, capEnd: true,
      uvScale: [2, 1],
    });

    // sole slab: separate, near-square section, its own smoothing group ⇒ a hard welt line
    addTube(mb, {
      centers: foot.map(([z, , , ]) => new THREE.Vector3(x, SOLE * 0.5 + 0.004, z)),
      seg: 12,
      rx: (i) => foot[i][1] * S * 1.06,
      ry: () => SOLE * 0.62,
      upHint: new THREE.Vector3(0, 1, 0),
      shape: (a) => superEllipse(a, 2.6),
      groupAt: () => 'ink',
      sgAt: () => 958 + (side > 0 ? 0 : 1),
      weightsAt: (i, t) => (t < 0.72
        ? [[`foot${L}`, 1]]
        : [[`foot${L}`, 1 - (t - 0.72) / 0.28 * 0.8], [`toe${L}`, (t - 0.72) / 0.28 * 0.8]]),
      capStart: true, capEnd: true,
    });
  }

  /* ---------------------------- head ------------------------------------ */

  /* y, half-width, half-depth, z-offset — a big cranium with wide cheeks and a domed skull. */
  static HEAD = [
    [1.396, 0.076, 0.078, 0.012],
    [1.430, 0.108, 0.114, 0.012],
    [1.470, 0.137, 0.148, 0.008],
    [1.510, 0.157, 0.170, 0.000],
    [1.552, 0.169, 0.185, -0.005],
    [1.596, 0.171, 0.189, -0.009],
    [1.640, 0.164, 0.183, -0.012],
    [1.686, 0.147, 0.165, -0.012],
    [1.722, 0.117, 0.131, -0.008],
    [1.750, 0.072, 0.084, 0.000],
    [1.763, 0.024, 0.028, 0.006],
  ];

  get headCenter() { return new THREE.Vector3(0, hy(1.588), hx(-0.006)); }
  get headRadii() {
    return new THREE.Vector3(
      0.176 * TUNE.headScale * TUNE.headWide, 0.184 * TUNE.headScale, 0.196 * TUNE.headScale);
  }

  /** Point on the idealised head ellipsoid. theta 0 = straight ahead, +theta = his left. */
  headSurf(theta, phi, inflate = 1) {
    const c = this.headCenter, r = this.headRadii;
    return new THREE.Vector3(
      c.x + r.x * inflate * Math.cos(phi) * Math.sin(theta),
      c.y + r.y * inflate * Math.sin(phi),
      c.z + r.z * inflate * Math.cos(phi) * Math.cos(theta),
    );
  }

  _headWeights(p) {
    const w = ramp(p.y, [
      [hy(1.380), { neck: 0.72, head: 0.28 }],
      [hy(1.420), { neck: 0.34, head: 0.66 }],
      [hy(1.462), { head: 1 }],
      [hy(1.80) + 0.6, { head: 1 }],
    ]);
    // jaw takes over the lower front so ANIMATION can talk / snarl without moving the skull
    const j = smooth(hy(1.530), hy(1.430), p.y) * smooth(hx(0.02), hx(0.10), p.z) * 0.55;
    if (j < 0.02) return w;
    const out = [];
    for (const [b, a] of w) out.push([b, a * (1 - j)]);
    out.push(['jaw', j]);
    return out;
  }

  _buildHead(mb) {
    const H = SlyModel.HEAD;
    const S = TUNE.headScale;
    const centers = H.map(([y, , , cz]) => new THREE.Vector3(0, hy(y), hx(cz)));
    addTube(mb, {
      centers, seg: TUNE.segHead,
      rx: (i) => H[i][1] * S * TUNE.headWide,
      ry: (i) => H[i][2] * S,
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a, i) => {
        const s = superEllipse(a, 1.10);
        /* **The ring angle is not measured from the face.** `addTube` builds its frame from
         * `upHint`, and for a +Y tube with `upHint` +Z that gives R = −X, U = +Z — so the
         * section is `p = c − X·(cos a · rx) + Z·(sin a · ry)`, i.e. `a = 0` is his *right
         * ear* and the face plane is `a = π/2`. Relating it to the head-ellipsoid theta used
         * by `headSurf` (θ = 0 straight ahead): **a = π/2 + θ**.
         *
         * Both terms below used `cos(a)` and were therefore rotated 90° off their comments.
         * `front` peaked on his right cheek, where `s.v` is 0, so the face was never flattened
         * and the brow shelf was never built; and `back` — "back and sides only" — evaluated
         * to **1 across the whole face plane**, so the lobing ran at full amplitude exactly
         * where the comment says it must not.
         *
         * That is not cosmetic. The lobe peaks at 1 + amp·1.62 = 1.049 of the ideal radius and
         * the domino mask is a patch at 1.045, so the cranium was pushing *through the mask*
         * over the face. Measured on the face-plane band: 92 fur verts outside the mask plane
         * before, and the mask rendered 1062 visible px — 2.4% of the head box. */
        const front = Math.max(0, Math.sin(a));
        const brow = smooth(1.615, 1.660, H[i][0]) * (1 - smooth(1.665, 1.700, H[i][0]));
        s.v *= 1 - 0.05 * front * front + 0.035 * brow * front;
        /* Fur lobing, but *only* round the back and sides: the mask, eyes, brows and mouth are
           all placed on the idealised ellipsoid, so lumping the face plane would float them.
           Across the mask's own span (|θ| ≤ 1.34 ⇒ a ∈ [0.23, 2.91]) `front` never drops below
           0.228, which caps the lobe at 1.038 — inside the mask plane everywhere it matters. */
        const back = 1 - Math.max(0, Math.sin(a));
        const k = furLobe(a, H[i][0] * 4, TUNE.furLobe * 0.55 * back, 4, 9);
        s.u *= k; s.v *= k;
        return s;
      },
      groupAt: () => 'fur',
      sgAt: () => 1100,
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount),
      weightsAtVert: (i, t, a, p) => this._headWeights(p),
      capStart: true, capEnd: true,
      uvScale: [3, 1],
    });
  }

  /**
   * The snout. Everything here goes through `TUNE.muzzleDrop`, and so do the nose and the
   * mouth, because the three are one shape and moving them independently is how a face comes
   * apart. The root's *vertical* radius is also cut: at 0.088 it made the snout root taller
   * than the eye line, which is what put a cream wedge between the two eyes and squeezed the
   * mask off the face entirely.
   *
   * **Second pass, from a real `sly-closeup` capture rather than a probe.** The snout was still
   * the loudest thing on the face: a bright cream wedge running from *between the eyes* down to
   * the chin, which is what the critic read as "a bird skull" and "a pale khaki diagonal band
   * across the muzzle". The arithmetic behind it — eye centre sits at head-space y 1.612 with a
   * 0.076 radius, so the eyes bottom out at **1.536**, while the root ring topped out at
   * 1.564 − 0.034 + 0.068 = **1.598**. The snout root was 6 cm of head-space *above* the bottom
   * of the eyes, so it drove a cream wedge up the bridge and there was physically nowhere for
   * the black to cross between the eyes.
   *
   * Now every ring tops out below 1.545. The bridge between the eyes is slate fur, which is
   * what the mask patch needs to sit on, and cream is confined to the snout proper.
   */
  _buildMuzzle(mb) {
    const S = TUNE.headScale;
    const D = TUNE.muzzleDrop;
    const key = [
      [new THREE.Vector3(0, 1.564 - D, 0.040), 0.092, 0.050],
      [new THREE.Vector3(0, 1.559 - D, 0.118), 0.098, 0.056],
      [new THREE.Vector3(0, 1.550 - D, 0.192), 0.092, 0.060],
      [new THREE.Vector3(0, 1.539 - D, 0.258), 0.078, 0.056],
      [new THREE.Vector3(0, 1.528 - D, 0.312), 0.058, 0.047],
      [new THREE.Vector3(0, 1.519 - D, 0.352), 0.030, 0.026],
    ];
    addTube(mb, {
      centers: key.map((k) => new THREE.Vector3(0, hy(k[0].y), hx(k[0].z))),
      seg: 20,
      rx: (i) => key[i][1] * S * TUNE.headWide,
      ry: (i) => key[i][2] * S,
      upHint: new THREE.Vector3(0, 1, 0),
      shape: (a) => superEllipse(a, 1.12),
      groupAt: () => 'furCream',
      sgAt: () => 1110,
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount),
      // The lower half of the snout is the jaw; the bridge stays with the skull.
      weightsAtVert: (i, t, a, p) => {
        const below = Math.max(0, -Math.sin(a));
        const j = 0.62 * below * smooth(hx(0.03), hx(0.25), p.z);
        return [['head', 1 - j], ['jaw', j]];
      },
      capStart: true, capEnd: true,
      uvScale: [2, 1],
    });
  }

  /* ---------------------------- face ------------------------------------ */

  _buildFace(mb) {
    this._buildMask(mb);
    for (const s of [1, -1]) this._buildEye(mb, s);
    this._buildNose(mb);
    this._buildMouth(mb);
    for (const s of [1, -1]) this._buildBrow(mb, s);
  }

  /**
   * The black domino mask. Authored as a band on the head ellipsoid: a centre elevation that
   * climbs toward the temples and a half-height that tapers to a point, which is what makes it
   * read as a *bandit mask* rather than a stripe. This is the single strongest silhouette /
   * identity cue on the face, so it is generous and bold rather than subtle.
   *
   * **Measured, not guessed: this band was rendering zero pixels.** Rasterising the model
   * through the real `sly-closeup` camera and keeping only the `ink` material group gives a
   * picture of literally "the black on his face", and it contained the two pupils, the nose
   * and the mouth — and no mask at all, anywhere, at any thickness.
   *
   * The cause is arithmetic. The band's half-height was 0.335 rad, which on a 0.241 m head is
   * 0.157 m ≈ 54 px at that camera. Each eyeball is a 0.096 m sphere whose centre sits at
   * 0.80 of the head radius, so it crosses the mask surface on a circle of apparent diameter
   * 0.175 m ≈ 61 px. The hole was *bigger than the band was tall*, so at every theta where the
   * mask had a job the eye punched clean through it, and the leftovers were covered by the
   * upper lid — which was slate fur sitting exactly where a domino mask goes.
   *
   * So: the band is now tall enough to survive its own eye holes, and the lid moved into this
   * group (see _buildEye), which is also what the reference does — Sly's lids are inside the
   * black. Keep the taper exponents; they are what make it read as a bandit mask sweeping up
   * to the temples rather than as a stripe.
   *
   * `ink` on the face went 2460 → 3222 px and `eye` 1210 → 1615 px on that measurement, so the
   * mask is on screen now. **It is still thin, and the remaining cause is structural, so do not
   * chase it with these numbers.** Two knobs were swept and both are dead ends:
   *   · `half` past ~0.5 buys nothing. The band is squeezed between the brim's lower edge and
   *     the muzzle's top, a gap of ~27 px at `sly-closeup`, and the eye is 66 px tall — it
   *     already overflows the gap in both directions, so extra band height lands under the cap
   *     or behind the snout.
   *   · sinking the eyeball shrinks the hole it punches, but 1:1 — at inflate 0.76 the mask
   *     gains 280 px and the sclera loses 1080. §7.3 wants huge eyes; that is the wrong trade.
   *
   * The real fix is that the sclera is a *sphere* protruding through the mask, so it can only
   * ever punch a hole; in the reference the eye is a flat lens set *into* the black. Flattening
   * the sclera along `outward` (radii z ~0.073 → ~0.034, centre out to ~0.96 inflate, pupil
   * offset down to match) makes the mask surround the eye instead of fighting it. That is a
   * coupled change across sclera, pupil, highlight and lid, and the eye read depends on
   * material brightness, so it wants a real capture to land — not this probe.
   */
  _buildMask(mb) {
    /* `TH` 1.34 → 1.44 and the inflate 1.045 → 1.058.
     *
     * The band's *middle* is a lost cause and should stop being treated as the target: the eye
     * lens is 0.086 of a 0.176 cranium half-width, so across the eye there is simply no black
     * left over — and that is what the reference does too. What carries the identity is the
     * **temple sweep**, the part of the band outboard of the eye that climbs toward the ear,
     * plus the bridge between the eyes (which the muzzle drop finally freed). Both live at
     * large |θ| or small |θ|, neither is occluded by the eye, and TH is what decides how far
     * round the sweep gets before it stops.
     *
     * The inflate lift is margin, not taste. With `_buildHead`'s angle convention corrected the
     * cranium loft caps at 1.038 across this band, but the brow shelf adds 3.5% of depth on the
     * face plane on top of that; 1.058 clears both without reaching the eye lens (front ≈ 1.09),
     * so the eye still sits in front of the mask, which is the one ordering that must hold. */
    const TH = 1.44;
    addPatch(mb, {
      segU: 30, segV: 4,
      group: 'ink', sg: mb.newSg(),
      at: (u, v) => {
        const th = THREE.MathUtils.lerp(-TH, TH, u);
        const at = Math.abs(th) / TH;
        const phic = 0.128 + 0.425 * Math.pow(at, 1.75);
        const half = 0.500 * (1 - 0.80 * Math.pow(at, 3.0)) * (0.70 + 0.30 * smooth(0.0, 0.30, at));
        const phi = phic + (v * 2 - 1) * half;
        return this.headSurf(th, phi, 1.058);
      },
      weightsAtVert: (u, v, p) => this._headWeights(p),
    });
  }

  /**
   * The eye, built as a **lens set into the mask** rather than a ball punching through it.
   *
   * This is the coupled rebuild `_buildMask` predicted and could not land without a capture.
   * Every part — sclera, pupil, highlight, lid — was a near-sphere whose radius along the view
   * normal equalled its radius across the face, so it stood ~17% of a head radius proud of a
   * mask patch sitting at 1.045. Measured on the model: `eye` verts reached inflate **1.221**
   * and `ink` (pupil + lid) **1.219**. A hole that size cannot be closed by making the band
   * taller, which is why sweeping `half` bought nothing.
   *
   * Three consequences of flattening, all of them wanted:
   *   · the mask survives its own eye holes, because the lens crosses back inside 1.045 near
   *     its rim instead of arcing a whole sphere-diameter in front of it;
   *   · the pupil stops being fresnel-lifted. A sphere's normal turns through 90° inside a few
   *     pixels, so `rim 0.30` was firing across most of it and the "black" pupil rendered
   *     mid-grey against a blown-out sclera — the capture read as goggles, not eyes. A lens
   *     facing the camera has almost no grazing area, so ink reads as ink;
   *   · the eye shades with the face rather than as an independent marble, which is what a
   *     cel-shaded cartoon eye is supposed to do.
   *
   * `outward` is now the true head-ellipsoid normal, blended 30% toward straight-ahead. The
   * normal keeps the lens flush (a tilted lens digs one rim in and lifts the other); the blend
   * is the old hand-picked direction's actual value, kept because a raccoon whose eyes face
   * fully sideways stops making eye contact with the camera.
   */
  _buildEye(mb, side) {
    const S = TUNE.headScale;
    const th = side * 0.455, ph = 0.165;
    const SINK = 0.92;                                   // centre depth, in head-ellipsoid radii
    const c = this.headSurf(th, ph, SINK);
    const r = this.headRadii;
    // ∇((p−c)/r)² — the ellipsoid normal, not a normalised position
    const nrm = new THREE.Vector3(
      Math.cos(ph) * Math.sin(th) / r.x, Math.sin(ph) / r.y, Math.cos(ph) * Math.cos(th) / r.z,
    ).normalize();
    const outward = nrm.lerp(new THREE.Vector3(0, 0, 1), 0.30).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, outward).normalize();
    const trueUp = new THREE.Vector3().crossVectors(outward, right).normalize();
    const basis = { x: right, y: trueUp, z: outward };

    /* Sclera. Deliberately oversized: §7.3's character read is "huge eyes behind the mask",
       and at the 55 px he occupies in `hero` the eye is either a legible white shape inside
       the black band or it is nothing at all. Wide across the face, shallow along the view —
       `0.032` against `0.078` is the whole point of this function. */
    addEllipsoid(mb, {
      center: c, radii: new THREE.Vector3(0.086 * S, 0.092 * S, 0.032 * S), basis,
      segTheta: 16, segPhi: 10,
      group: 'eye', sg: mb.newSg(), weights: [['head', 1]],
    });
    /* Pupil — big and cartoon, a flatter disc riding on the lens. The offset is what keeps it
       off the sclera (0.020 + 0.020 clears the sclera's 0.032 by 0.008·S), not a big radius. */
    const pc = c.clone().addScaledVector(outward, 0.020 * S).addScaledVector(trueUp, 0.002 * S);
    addEllipsoid(mb, {
      center: pc, radii: new THREE.Vector3(0.042 * S, 0.050 * S, 0.020 * S), basis,
      segTheta: 14, segPhi: 9,
      group: 'ink', sg: mb.newSg(), weights: [['head', 1]],
    });
    // highlight on the pupil: the "alive" cue. Sits on black, so it reads at any size.
    const hc = pc.clone().addScaledVector(outward, 0.014 * S)
      .addScaledVector(trueUp, 0.020 * S).addScaledVector(right, -side * 0.015 * S);
    addEllipsoid(mb, {
      center: hc, radii: new THREE.Vector3(0.016 * S, 0.016 * S, 0.010 * S), basis,
      segTheta: 8, segPhi: 5,
      group: 'eye', sg: mb.newSg(), weights: [['head', 1]],
    });

    /* Hooded upper lid, tilted outward-down — this is where the *smug* comes from. A wide-open
       eye reads as surprised; a lid cutting across the top third reads as amused.

       In the `ink` group, not `fur`. It is the largest surface sitting where the domino mask
       belongs, and as slate fur it was one of the two things measured to be erasing the mask
       entirely (see _buildMask). Sly's lids are inside the black in every reference frame, so
       this costs nothing in fidelity and it is most of what puts the mask back on screen.

       Flattened to the same lens profile as the sclera and grown slightly across the face, so
       it laps the sclera's upper rim instead of doming over it. `phi0` 0.40 → 0.50: at 0.40 the
       spherical lid plus the sphere sclera together read as a bilobed sleepy eye in the
       capture, and the lid is worth more as a thin black hood than as a second eyelid. */
    const lidUp = trueUp.clone().applyAxisAngle(outward, side * 0.30).normalize();
    const lidRight = new THREE.Vector3().crossVectors(lidUp, outward).normalize();
    addEllipsoid(mb, {
      center: c.clone().addScaledVector(outward, 0.005 * S),
      radii: new THREE.Vector3(0.091 * S, 0.097 * S, 0.033 * S),
      basis: { x: lidRight, y: lidUp, z: outward },
      segTheta: 16, segPhi: 5, phi0: 0.56, phi1: Math.PI / 2,
      group: 'ink', sg: mb.newSg(), weights: [['head', 1]],
      colorAt: (u, v, p) => furTint(_c, p.x, p.y, p.z, 0.03),
    });
  }

  _buildNose(mb) {
    const S = TUNE.headScale;
    const c = new THREE.Vector3(0, hy(1.530 - TUNE.muzzleDrop), hx(0.348));
    addEllipsoid(mb, {
      center: c,
      radii: new THREE.Vector3(0.031 * S * TUNE.headWide, 0.024 * S, 0.024 * S),
      segTheta: 12, segPhi: 7,
      group: 'ink', sg: mb.newSg(), weights: [['head', 1]],
      // narrow the bottom into the triangular raccoon nose
      warp: (p, ft, fp) => {
        const k = 1 - 0.62 * Math.max(0, 1 - fp * 2.2);
        p.x = c.x + (p.x - c.x) * k;
        p.z = c.z + (p.z - c.z) * (1 - 0.25 * Math.max(0, 1 - fp * 2.2));
      },
    });
  }

  /** The half-smile. Asymmetric on purpose: one corner up is the whole read on "smug". */
  _buildMouth(mb) {
    const S = TUNE.headScale;
    /* Rides `muzzleDrop` with the snout it is drawn on — a mouth left behind by a moved
       muzzle floats in front of the cheek, which is worse than no mouth. */
    const D = TUNE.muzzleDrop;
    const P = (x, y, z) => new THREE.Vector3(hw(x), hy(y - D), hx(z));
    const line = resample([
      P(-0.070, 1.512, 0.238),
      P(-0.042, 1.500, 0.296),
      P(-0.010, 1.496, 0.324),
      P(0.023, 1.500, 0.322),
      P(0.055, 1.516, 0.292),
      P(0.078, 1.534, 0.236),
    ], 16);
    const muzzleC = P(0, 1.552, 0.180);
    addPatch(mb, {
      segU: 15, segV: 2,
      group: 'ink', sg: mb.newSg(),
      at: (u, v) => {
        const i = Math.min(line.length - 2, Math.floor(u * (line.length - 1)));
        const f = u * (line.length - 1) - i;
        const p = line[i].clone().lerp(line[i + 1], f);
        const outN = p.clone().sub(muzzleC).normalize();
        const taper = 0.55 + 0.45 * Math.sin(Math.PI * THREE.MathUtils.clamp(u * 1.0, 0, 1));
        p.addScaledVector(outN, 0.004 * S);
        p.y += (v - 0.5) * 0.017 * S * taper;
        return p;
      },
      weightsAtVert: (u, v, p) => [['head', 0.35], ['jaw', 0.65]],
    });
  }

  _buildBrow(mb, side) {
    const S = TUNE.headScale;
    const L = side > 0 ? 'L' : 'R';
    const lift = side > 0 ? 0.014 : 0.0;                 // cocked left brow
    const inner = this.headSurf(side * 0.20, 0.575, 1.028);
    const outer = this.headSurf(side * 0.78, 0.640, 1.028);
    inner.y += lift * 0.4; outer.y += lift;
    const mid = inner.clone().lerp(outer, 0.5);
    mid.y += 0.010 + lift * 0.4;
    mid.multiplyScalar(1.0);
    const pts = resample([inner, mid, outer], 7);
    const T0 = new THREE.Vector3().subVectors(outer, inner).normalize();
    addTube(mb, {
      centers: pts, seg: 6,
      rx: (i) => (0.013 - 0.006 * Math.abs(i / 6 - 0.5) * 2) * S,
      ry: (i) => (0.0085 - 0.004 * Math.abs(i / 6 - 0.5) * 2) * S,
      upHint: new THREE.Vector3(0, 0, 1),
      groupAt: () => 'ink',
      sgAt: () => 1200 + (side > 0 ? 0 : 1),
      weightsAt: () => [[`brow${L}`, 0.85], ['head', 0.15]],
      capStart: true, capEnd: true,
    });
    void T0;
  }

  /* ---------------------------- ears ------------------------------------ */

  _buildEar(mb, side) {
    const S = TUNE.headScale;
    const L = side > 0 ? 'L' : 'R';
    /* Swept out at ~48° from vertical so the tips clear the cap crown *laterally*.
       Worth the arithmetic, because it had never actually been true: at the old 0.62 lean the
       tip landed at |x| 0.284 against a cap half-width of 0.286, i.e. 2 mm *inside* the widest
       part of the hat, so the ears vanished into the cap outline from every angle except a
       narrow frontal cone — and `interior`, `dunes`, `traversal` and `hero` all look at him
       from behind, where the cap then reads as a featureless dome. At 0.86 the tip clears the
       crown by 1.7 cm before its tuft, and the ear/cap notch — the shape that says "raccoon in
       a hat" rather than "person" — survives from any azimuth. */
    const base = new THREE.Vector3(hw(side * 0.118), hy(1.646), hx(-0.020));
    const axis = new THREE.Vector3(side * 0.86, 0.77, -0.16).normalize();
    const thick = new THREE.Vector3(side * 0.74, -0.24, 0.63).normalize();   // faces outward-front
    const width = new THREE.Vector3().crossVectors(thick, axis).normalize();

    const n = 8;
    const centers = [];
    for (let i = 0; i < n; i++) centers.push(base.clone().addScaledVector(axis, (i / (n - 1)) * 0.196 * S));
    // published for the tuft pass, which has to grow a wisp off the real tip
    (this._earTip || (this._earTip = {}))[side] = { p: centers[n - 1].clone(), axis: axis.clone() };
    const F = { T: centers.map(() => axis), R: centers.map(() => width), U: centers.map(() => thick) };
    const wProf = [0.056, 0.078, 0.092, 0.094, 0.084, 0.062, 0.034, 0.007];
    const tProf = [0.033, 0.039, 0.039, 0.035, 0.029, 0.020, 0.011, 0.003];

    addTube(mb, {
      centers, seg: 12,
      rx: (i) => wProf[i] * S, ry: (i) => tProf[i] * S,
      framesOverride: F,
      shape: (a) => superEllipse(a, 1.30),
      groupAt: (i) => (i >= 5 ? 'furDark' : 'fur'),
      sgAt: () => 1300 + (side > 0 ? 0 : 1),
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, TUNE.furTintAmount),
      weightsAt: (i, t) => (t < 0.14
        ? [['head', 0.55], [`ear${L}`, 0.45]]
        : [[`ear${L}`, 1]]),
      capStart: true,
      uvScale: [1, 1],
    });

    // inner ear: a shallow cream shell on the front face
    const inner = centers.map((c, i) => c.clone().addScaledVector(thick, tProf[i] * 0.62 * S));
    addTube(mb, {
      centers: inner.slice(0, 7), seg: 10,
      rx: (i) => wProf[i] * 0.60 * S, ry: (i) => tProf[i] * 0.26 * S,
      framesOverride: { T: F.T.slice(0, 7), R: F.R.slice(0, 7), U: F.U.slice(0, 7) },
      shape: (a) => superEllipse(a, 1.35),
      groupAt: () => 'furCream',
      sgAt: () => 1310 + (side > 0 ? 0 : 1),
      weightsAt: (i, t) => (t < 0.14 ? [['head', 0.55], [`ear${L}`, 0.45]] : [[`ear${L}`, 1]]),
      capStart: true, capEnd: true,
    });
  }

  /* ---------------------------- cap ------------------------------------- */

  /**
   * Cyan newsboy cap: puffy eight-panel crown, a hard dark hem band, and a long stiff bill on
   * its own bone so ANIMATION can flick it. With the mask and the tail this is one of the three
   * shapes that has to survive being filled solid black — and it is the one that was failing.
   */
  _buildCap(mb) {
    const S = TUNE.headScale;
    const pivot = new THREE.Vector3(0, 1.640, 0.0);   // in *unscaled* head space; place() maps it
    // Tipped down over the brow and cocked to his left. A level, symmetric cap reads as a
    // swimming hat; the cock is most of what makes it read as *his* cap.
    const tilt = new THREE.Matrix4().makeRotationX(0.062).premultiply(new THREE.Matrix4().makeRotationZ(0.098));
    const place = (p) => {
      p.sub(pivot).applyMatrix4(tilt).add(pivot);
      p.set(hw(p.x), hy(p.y), hx(p.z));
      return p;
    };

    /* y, half-width, half-depth, z-offset.
     *
     * The old crown peaked at 0.201 against a 0.171 skull — a 3 cm lip, which is nothing at
     * silhouette scale and is exactly why the critic recorded "no cap; the head is a bare
     * rounded lump". This one peaks at 0.232 against the same 0.171 skull and is pulled back
     * and up off the cranium, so the profile steps out hard above the ears and the cap becomes
     * its own soft newsboy lozenge rather than a hat-coloured patch of scalp. Bigger than this
     * and it swallows the ears, which cost more silhouette than the extra bulk buys.
     */
    const C = [
      [1.598, 0.180, 0.190, 0.004],
      [1.612, 0.214, 0.226, 0.000],
      [1.634, 0.234, 0.246, -0.008],
      [1.664, 0.240, 0.252, -0.018],
      [1.700, 0.236, 0.246, -0.030],
      [1.740, 0.222, 0.230, -0.042],
      [1.776, 0.196, 0.201, -0.052],
      [1.804, 0.152, 0.155, -0.058],
      [1.822, 0.088, 0.090, -0.062],
      [1.830, 0.018, 0.019, -0.064],
    ];
    addTube(mb, {
      centers: C.map(([y, , , cz]) => new THREE.Vector3(0, y, cz)), seg: 26,
      rx: (i) => C[i][1], ry: (i) => C[i][2],
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a, i) => {
        const s = superEllipse(a, 1.08);
        // eight soft panels; the seams read as folded cloth, not as facets
        const panel = 1 + 0.040 * Math.cos(8 * a + 0.35) * (1 - Math.pow(i / (C.length - 1), 2));
        // the crown slumps toward the back-left, so the outline is never bilaterally symmetric
        const slump = 1 + 0.075 * Math.max(0, -Math.cos(a - 0.5)) * smooth(0.30, 0.95, i / (C.length - 1));
        return { u: s.u * panel * slump, v: s.v * panel * slump };
      },
      warp: (p) => place(p),
      groupAt: () => 'cloth',
      sgAt: (i) => (i === 0 ? 1400 : 1401),
      colorAt: (i, t, a, p) => furTint(_c, p.x, p.y, p.z, 0.035),
      weightsAt: () => [['head', 1]],
      capStart: true, capEnd: true,
      uvScale: [4, 1],
    });

    // crown button — the one gold spark at the top of the frame in a close-up
    const btn = place(new THREE.Vector3(0, 1.832, -0.064));
    addEllipsoid(mb, {
      center: btn, radii: new THREE.Vector3(0.023 * S, 0.016 * S, 0.023 * S),
      segTheta: 12, segPhi: 6, phi0: -0.2,
      group: 'gold', sg: mb.newSg(), weights: [['head', 1]],
    });

    /* Hem band: a hard dark ring around the base of the crown. It splits the cap off the head
       with a value break as well as a shape break, so the cap survives being backlit. */
    const HN = 26;
    const hem = [];
    for (let i = 0; i <= HN; i++) {
      const th = (i / HN) * Math.PI * 2;
      hem.push(place(new THREE.Vector3(Math.sin(th) * 0.186, 1.596 + 0.006 * Math.cos(th), -0.002 + Math.cos(th) * 0.196)));
    }
    addTube(mb, {
      centers: hem, seg: 8, rx: 0.020 * S, ry: 0.026 * S,
      upHint: new THREE.Vector3(0, 1, 0),
      shape: (a) => superEllipse(a, 1.8),
      groupAt: () => 'clothDark',
      sgAt: () => 1405,
      weightsAt: () => [['head', 1]],
      uvScale: [4, 1],
    });

    /* Brim: a flat inclined section swept along the front of the hem. Built as a tube so the
       top face, the underside and the rounded outer edge come out watertight in one pass.
       Wide, deep and dark — with the ears it is the top half of the silhouette test.
     *
     * `brimLift` exists because this brim was **covering both eyes**. Not a lighting problem
     * and not a guess: a ray cast from each sclera toward the `sly-closeup` camera hit
     * `clothDark` on the `capBrim` bone 5.8 cm and 8.4 cm out, and the frame sampled `#284375`
     * at the projected eye centres — brim colour, on a sclera that is 44 px across. Every
     * character capture in this project has rendered a Sly with no visible eyes for that
     * reason, and no amount of emissive on the eye material could have reached the camera.
     * Verify any change to this with `occlude.mjs`: both rays must report CLEAR. */
    /* **Shortened off a real capture.** At `0.292 + 0.108` the bill reached head-space z 0.400
     * against a face plane at ~0.19 — it projected further in front of his face than his face
     * is deep, and `sly-closeup` read the head as a lampshade with a slot under it. Measured
     * on the head box, `cloth` + `clothDark` owned **51%** of every pixel of his head and the
     * entire face 10%; 272 brim verts sat in front of the mask plane. A newsboy bill is short
     * and stubby, and the identity in this silhouette is the *crown* plus the mask, not the
     * bill's reach. Now 0.238 + 0.082 = 0.320, a 20% cut in projection, with the wrap round
     * the temples pulled in from 0.224 to 0.206 so it stops shading the outer eye. */
    const N = 24, TH = 1.40;
    const arc = [];
    for (let i = 0; i <= N; i++) {
      const th = THREE.MathUtils.lerp(-TH, TH, i / N);
      const k = Math.abs(th) / TH;
      arc.push(place(new THREE.Vector3(
        Math.sin(th) * 0.206,
        1.610 + TUNE.brimLift - 0.030 * Math.pow(k, 2),
        0.004 + Math.cos(th) * 0.238,
      )));
    }
    addTube(mb, {
      centers: arc, seg: 12,
      // deep at the centre, tucking away at the temples — a peak, not a sun-visor ring
      rx: (i) => 0.082 * S * (1 - 0.66 * Math.pow(Math.abs(i / N * 2 - 1), 1.9)),
      ry: 0.0165 * S,
      upHint: new THREE.Vector3(0, 1, 0),
      // shear the section so the outer lip dips: a flat brim reads as a frisbee
      shape: (a) => { const s = superEllipse(a, 1.6); return { u: s.u, v: s.v + 0.70 * s.u }; },
      groupAt: () => 'clothDark',
      sgAt: () => 1410,
      weightsAt: () => [['capBrim', 0.85], ['head', 0.15]],
      capStart: true, capEnd: true,
      uvScale: [3, 1],
    });
  }

  /* ---------------------------- fur tufts ------------------------------- */

  /**
   * Silhouette fur. §7.3 fails "fur reads as smooth plastic" and no shader fixes that on a
   * perfectly smooth outline — the eye reads the *edge* first. These spikes cost ~12 triangles
   * each and they are the difference between fur and a vinyl toy.
   */
  /**
   * Fur clumps. §7.3 fails "fur reads as smooth plastic", and under a cel ramp that is decided
   * entirely by the outline — there is no shading gradient for a fur *texture* to live in, so
   * a normal map or a shell pass cannot rescue a smooth capsule.
   *
   * The previous pass put isolated needles on the edge and the critic read them as "a torn or
   * burnt edge", which is the correct read: a needle is not what fur looks like. Real fur
   * clumps are **broad flat wedges that overlap**, so the edge scallops rather than spikes.
   * Hence `tuftWidth` (wide) with `flat` (thin in the other axis), doubled density, and
   * neighbouring clumps deliberately jittered in length so no two are the same silhouette.
   */
  _buildTufts(mb) {
    const S = TUNE.headScale;
    const D = TUNE.tuftDensity;
    const WF = TUNE.tuftWidth;
    /* Tufts carry no colour of their own: like every vertex colour on this model they would
       MULTIPLY their material (see Body.furTint), so the group owns the hue and they stay
       neutral. They exist for the ragged silhouette edge, not for tone. */
    const put = (o) => addTuft(mb, {
      sg: mb.newSg(), color: 0xffffff, flat: 0.45,
      ...o,
      width: (o.width ?? 0.015) * WF,
    });
    // deterministic jitter: two clumps the same size next to each other read as a comb
    const jit = (i, k) => 1 + 0.34 * Math.sin(i * 12.9898 + k * 78.233);

    for (const side of [1, -1]) {
      /* cheek ruffs — the widest part of his head, so the most valuable place to break up.
       *
       * **Start moved off the face plane.** These began at θ 0.60 against eyes centred at
       * θ 0.455, so the innermost clumps stood in front of the face at eye height and the
       * capture read them as black spiky lashes flanking the eyes — clutter exactly where the
       * identity is. 92 of them sat in front of the mask plane. A tuft earns its triangles by
       * breaking the *outline*, which needs it at the silhouette edge, not on the face: from
       * θ 0.86 they are past the eye and doing the job the comment claims. */
      for (let i = 0; i < Math.round(5 * D); i++) {
        const f = i / (Math.round(5 * D) - 1);
        const th = side * THREE.MathUtils.lerp(0.86, 1.46, f);
        const phi = THREE.MathUtils.lerp(-0.38, 0.30, f);
        const base = this.headSurf(th, phi, 0.97);
        const out = base.clone().sub(this.headCenter).normalize();
        const dir = out.clone().addScaledVector(new THREE.Vector3(0, -1, -0.55), 0.55).normalize();
        put({
          base, dir,
          length: (0.052 + 0.030 * (1 - Math.abs(f - 0.45) * 2)) * S * jit(i, side),
          width: 0.021 * S, bend: 0.34, bendDir: new THREE.Vector3(0, -1, 0),
          group: 'fur', weights: [['head', 1]],
        });
      }
      /* a second, shorter cheek layer set between the first — overlapping clumps are what
         turn a row of spikes into a ruff */
      for (let i = 0; i < Math.round(4 * D); i++) {
        const f = (i + 0.5) / Math.round(4 * D);
        const th = side * THREE.MathUtils.lerp(0.92, 1.38, f);
        // kept at or below eye level: clumps that climb past it crowd the mask and the face
        // stops reading as a face at any distance
        const base = this.headSurf(th, THREE.MathUtils.lerp(-0.30, 0.18, f), 0.99);
        const out = base.clone().sub(this.headCenter).normalize();
        put({
          base, dir: out.clone().addScaledVector(new THREE.Vector3(0, -0.55, -0.35), 0.6).normalize(),
          length: 0.036 * S * jit(i, side + 3), width: 0.024 * S, bend: 0.30,
          bendDir: new THREE.Vector3(0, -1, 0),
          group: 'fur', weights: [['head', 1]],
        });
      }
      // cream ruff under the cheek, framing the muzzle
      for (let i = 0; i < Math.round(3 * D); i++) {
        const f = i / (Math.round(3 * D) - 1);
        const th = side * THREE.MathUtils.lerp(0.48, 1.10, f);
        const base = this.headSurf(th, -0.44 + f * 0.14, 0.96);
        const out = base.clone().sub(this.headCenter).normalize();
        put({
          base, dir: out.clone().addScaledVector(new THREE.Vector3(0, -1, 0), 0.85).normalize(),
          length: 0.054 * S * jit(i, side + 7), width: 0.020 * S, bend: 0.35,
          bendDir: new THREE.Vector3(0, -1, 0.3),
          group: 'furCream', weights: [['head', 0.55], ['jaw', 0.45]],
        });
      }
      // ear-tip wisp
      const ear = this._earTip?.[side];
      const et = ear ? ear.p.clone().addScaledVector(ear.axis, -0.014 * S) : this.headSurf(side * 0.6, 0.9, 1.05);
      put({
        base: et, dir: (ear ? ear.axis.clone() : new THREE.Vector3(side * 0.38, 0.86, -0.34)).normalize(),
        length: 0.040 * S, width: 0.011 * S, bend: 0.4,
        group: 'furDark', weights: [[side > 0 ? 'earL' : 'earR', 1]],
      });

      /* chest ruff bursting out of the open collar. Two rows at different heights so the
         collar edge is a scalloped mass rather than a single fringe. */
      if (side > 0) {
        for (const row of [{ y: by(1.300), len: 0.056, w: 0.020, sp: 0.56, k: 1 },
          { y: by(1.268), len: 0.042, w: 0.024, sp: 0.72, k: 2 }]) {
          const N = Math.round(5 * D);
          for (let i = 0; i < N; i++) {
            const f = (i + 0.5) / N;
            const th = THREE.MathUtils.lerp(-row.sp, row.sp, f);
            const y = row.y - 0.030 * Math.abs(th);
            const r = this._torsoRadius(y);
            const base = new THREE.Vector3(Math.sin(th) * r.rx * 1.02, y, r.cz + Math.cos(th) * r.rz * 1.02);
            put({
              base, dir: new THREE.Vector3(Math.sin(th) * 0.5, 0.72, Math.cos(th) * 0.62).normalize(),
              length: row.len * jit(i, row.k), width: row.w, bend: 0.35,
              bendDir: new THREE.Vector3(0, 0, 1),
              group: 'furCream', weights: [['chest', 0.6], ['neck', 0.4]],
            });
          }
        }
      }
      // neck ruff around the collar
      for (let i = 0; i < Math.round(3 * D); i++) {
        const th = side * (0.95 + i * 0.55);
        const y = by(1.352);
        const r = this._torsoRadius(y);
        const base = new THREE.Vector3(Math.sin(th) * r.rx * 1.02, y, r.cz + Math.cos(th) * r.rz * 1.02);
        put({
          base, dir: new THREE.Vector3(Math.sin(th) * 0.75, -0.42, Math.cos(th) * 0.75).normalize(),
          length: 0.042, width: 0.015, bend: 0.3,
          group: 'furCream', weights: [['neck', 1]],
        });
      }

      /* Backs of the forearms — §7.3 names this surface explicitly. Rings now, replacing two
         ulnar-side rows that covered about 140° of the arm: `combat`, `traversal` and `hero`
         all catch a forearm from outside that arc, where the edge was clean. Built off the
         published arm loft so a radius change cannot silently float them. */
      const arm = this._armInfo?.[side];
      if (arm) {
        const armAt = (u) => {
          const K = arm.key;
          let i = 0;
          while (i < K.length - 2 && u > K[i + 1][0]) i++;
          const f = THREE.MathUtils.clamp((u - K[i][0]) / (K[i + 1][0] - K[i][0] || 1), 0, 1);
          return {
            c: K[i][1].clone().lerp(K[i + 1][1], f),
            r: THREE.MathUtils.lerp(K[i][2], K[i + 1][2], f) * TUNE.limbSlim,
          };
        };
        const axis = new THREE.Vector3(side * 0.669, -0.743, 0).normalize();
        const fwd = new THREE.Vector3(0, 0, 1);
        const nrm = new THREE.Vector3().crossVectors(axis, fwd).normalize();
        /* `a` is measured from +Z here, so a camera in front of him puts the forearm's
           silhouette tangents at a ≈ ±π/2 and a camera behind him at the same two lines. Those
           get the clumps; a full ring was tried and carpets a 0.07 m band into a bottle brush. */
        const COLS = [{ a: 1.52, n: 3 }, { a: -1.52, n: 3 }, { a: 3.02, n: 2 }];
        for (let ci = 0; ci < COLS.length; ci++) {
          const col = COLS[ci];
          for (let r = 0; r < col.n; r++) {
            const u = arm.cuffStart + 0.010
              + (r / (col.n - 1)) * (arm.gloveStart - arm.cuffStart - 0.030);
            const { c, r: rad } = armAt(u);
            const a = col.a + 0.30 * Math.sin(r * 5.1 + ci * 1.9);
            const out = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(nrm, Math.sin(a)).normalize();
            put({
              base: c.clone().addScaledVector(out, rad * 0.86),
              dir: out.clone().multiplyScalar(0.78).addScaledVector(axis, 0.58).normalize(),
              length: 0.050 * (r % 2 ? 0.66 : 1.0) * jit(r * 3 + ci, side * 5),
              width: 0.015, bend: 0.32,
              bendDir: axis.clone(),
              group: 'fur', weights: ramp(u, arm.ramp),
            });
          }
        }
      }
      /* Whole leg, hip to boot cuff. This replaces a row of seven wisps that all sat on the
         *back* of the thigh: measured through the real `sly-closeup` projection, the leg
         outline moved 0.26 px per row — against 3.9 on the head and 1.5 on the tail — so it
         was a machined tube from every angle the shot list actually uses, and the wisps never
         touched a silhouette edge.
         Rings, not a stripe, for the same reason the tail carries rings: the ten shots look at
         him from every azimuth. The inner ~90° is skipped — clumps there push through the
         opposite thigh and nothing is ever positioned to see them. Row spacing works out at
         ~22 px at closeup against a ~10 px clump, so the 2.5 px ink hull leaves a real gap
         between neighbours instead of welding them into one fat line. */
      const leg = this._legInfo?.[side];
      if (leg) {
        const legAt = (u) => {
          const K = leg.key;
          let i = 0;
          while (i < K.length - 2 && u > K[i + 1][0]) i++;
          const f = THREE.MathUtils.clamp((u - K[i][0]) / (K[i + 1][0] - K[i][0] || 1), 0, 1);
          return {
            c: K[i][1].clone().lerp(K[i + 1][1], f),
            r: THREE.MathUtils.lerp(K[i][2], K[i + 1][2], f) * TUNE.limbSlim,
          };
        };
        /* Columns, not a full ring. A ring of clumps at every height was tried first and it
           tiles the leg into a diamond lattice — it reads as pinecone scales, not fur, because
           clumps land on the *face* of the leg where nothing needs breaking up.
           Only two lines on the cross-section are ever the silhouette: with `out` measured from
           straight-outward, a camera in front of him or behind him puts the tangent at a ≈ 0,
           and a side camera (`guard` at 98°) puts it at a ≈ ±π/2. So the clumps live in three
           columns on those tangents and the rest of the leg stays clean. Alternating long/short
           down each column is what makes an edge read as fur rather than as a comb. */
        const COLS = [
          { a: 0.00, n: 6, u0: 0.10, u1: 0.68, len: 0.062, alt: 0.58 },   // outer edge
          { a: -1.42, n: 5, u0: 0.14, u1: 0.66, len: 0.052, alt: 0.62 },  // back of thigh/calf
          { a: 1.46, n: 3, u0: 0.30, u1: 0.62, len: 0.036, alt: 0.70 },   // front, sparse
        ];
        for (let ci = 0; ci < COLS.length; ci++) {
          const col = COLS[ci];
          for (let r = 0; r < col.n; r++) {
            const u = col.u0 + (r / (col.n - 1)) * (col.u1 - col.u0);
            const { c, r: rad } = legAt(u);
            const a = col.a + 0.34 * Math.sin(r * 4.7 + ci * 2.3);
            const out = new THREE.Vector3(side * Math.cos(a), 0, Math.sin(a));
            put({
              base: c.clone().addScaledVector(out, rad * 0.88),
              dir: out.clone().multiplyScalar(0.80).add(new THREE.Vector3(0, -0.66, 0)).normalize(),
              length: col.len * (r % 2 ? col.alt : 1.0) * jit(r * 3 + ci, side * 23),
              width: 0.017 - 0.004 * u, bend: 0.34,
              bendDir: new THREE.Vector3(0, -1, 0),
              group: 'fur', weights: ramp(u, leg.ramp),
            });
          }
        }
        /* Knee ruff: one deliberate fur point above the kneecap. A leg with a single large
           shape on it reads as a drawn leg; a leg with forty small ones reads as texture. */
        for (let i = 0; i < 3; i++) {
          const u = 0.44;
          const { c, r: rad } = legAt(u);
          const a = -0.30 + i * 0.62;
          const out = new THREE.Vector3(side * Math.cos(a), 0, Math.sin(a));
          put({
            base: c.clone().addScaledVector(out, rad * 0.86),
            dir: out.clone().multiplyScalar(0.62).add(new THREE.Vector3(0, -0.84, 0)).normalize(),
            length: 0.070 * (i === 1 ? 1.0 : 0.78), width: 0.023, bend: 0.40,
            bendDir: new THREE.Vector3(0, -1, 0),
            group: 'fur', weights: ramp(u, leg.ramp),
          });
        }
      }
      // fur spilling over the boot cuff
      for (let i = 0; i < Math.round(5 * D); i++) {
        const N = Math.round(5 * D);
        const a = (i / N) * Math.PI * 2 + 0.4;
        const base = new THREE.Vector3(side * 0.088 + Math.sin(a) * 0.042, 0.308, -0.004 + Math.cos(a) * 0.042);
        put({
          base, dir: new THREE.Vector3(Math.sin(a) * 0.55, 0.72, Math.cos(a) * 0.55).normalize(),
          length: 0.042 * jit(i, side * 17), width: 0.018, bend: 0.3,
          group: 'fur',
          weights: [[side > 0 ? 'lowerLegL' : 'lowerLegR', 1]],
        });
      }
    }

    /* tail: a ragged top edge plus a fan at the tip. The tail silhouette does the heaviest
       lifting of any shape on the character, so it gets the most tufts. */
    const spine = this._tailSpine, radius = this._tailRadius, isDark = this._tailIsDark;
    const n = spine.length;
    /* Clumps all the way round every ring, not just along the top: the tail is seen from
       behind in five of the ten canonical shots (`hero` at 172°, `dunes` 167°, `interior`
       177°, `traversal` 160°), so a ridge on one edge only would be invisible in half the set.
       Longest clumps land on the ring boundaries, which is where a real ringed tail parts. */
    for (let i = 2; i < n - 2; i++) {
      const t = i / (n - 1);
      const c = spine[i];
      const tan = new THREE.Vector3().subVectors(spine[Math.min(n - 1, i + 1)], spine[Math.max(0, i - 1)]).normalize();
      const rings = i % 2 ? [-2.1, -0.7, 0.7, 2.1] : [-2.8, -1.4, 0.0, 1.4, 2.8];
      for (const roll of rings) {
        const up = new THREE.Vector3(Math.sin(roll) * 0.85, Math.cos(roll), 0).normalize();
        const side2 = new THREE.Vector3().crossVectors(tan, up).normalize();
        const outward = new THREE.Vector3().crossVectors(side2, tan).normalize();
        const base = c.clone().addScaledVector(outward, radius(t) * 0.92);
        // a band edge gets the longest clumps — that is where fur actually parts
        const edge = isDark(t) !== isDark(Math.max(0, t - 0.035)) ? 1.35 : 1.0;
        put({
          base,
          dir: outward.clone().addScaledVector(tan, -0.55).normalize(),
          length: (0.040 + 0.020 * Math.sin(t * 7)) * TUNE.tailScale * edge * jit(i, roll),
          width: 0.030 * TUNE.tailScale, bend: 0.30, bendDir: tan.clone().negate(),
          group: isDark(t) ? 'furDark' : 'furCream',
          weights: ramp(t, this._tailRamp),
        });
      }
    }
    // tip fan
    const tipC = spine[n - 1];
    const tipT = new THREE.Vector3().subVectors(spine[n - 1], spine[n - 4]).normalize();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const perp = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8, 0);
      perp.sub(_v.copy(tipT).multiplyScalar(perp.dot(tipT))).normalize();
      put({
        base: tipC.clone().addScaledVector(tipT, -0.010),
        dir: tipT.clone().multiplyScalar(0.75).addScaledVector(perp, 0.65).normalize(),
        length: 0.075 * TUNE.tailScale, width: 0.017 * TUNE.tailScale, bend: 0.2,
        group: 'furDark', weights: [['tailD', 1]],
      });
    }
  }

  /* ====================================================================== */
  /*  materials                                                             */
  /* ====================================================================== */

  _makeTextures() {
    const size = this.engine.quality === 'low' ? 128 : (this.engine.quality === 'ultra' ? 512 : 256);
    /**
     * Sly's maps are entirely his own — nothing is pulled from TEXTURES.
     *
     * The library has no reason to author strand-flow fur or a helical grip wrap for one
     * character, and both of its slots actively hurt here: an albedo *multiplies* the material
     * colour, so a shared map gets a second uncontrolled say in the hue that §2.1 makes this
     * file responsible for, and a stone normal at stone frequency turns fur into gravel. It
     * also removes the crash vector — `textures.get()` returns a *bundle*, and handing that
     * bundle to a material slot makes three.js read `.matrix` off a plain object and kill the
     * frame mid-render. Nothing to unwrap if nothing is fetched.
     *
     * The detail albedos below are authored near-white on purpose: they modulate, never tint.
     */
    this._fur = makeFurMaps(size, 7);
    this._cloth = makeClothMaps(size, 21);
    this._metal = makeMetalMaps(Math.min(size, 256), 33);
    this._textures.push(this._fur.normal, this._fur.detail, this._cloth.normal,
      this._cloth.detail, this._metal.normal, this._metal.detail);
    this._gradient = this._makeGradient();
    this._textures.push(this._gradient);
  }

  /** 3-band cel ramp with a *slightly* softened terminator (AGENTS.md §2.1). */
  _makeGradient() {
    const N = 64;
    const data = new Uint8Array(N * 4);
    const bands = [0.30, 0.66, 1.0];
    const edges = [0.42, 0.60];
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      let v = bands[0];
      v = THREE.MathUtils.lerp(bands[0], bands[1], smooth(edges[0] - 0.022, edges[0] + 0.022, x));
      v = THREE.MathUtils.lerp(v, bands[2], smooth(edges[1] - 0.020, edges[1] + 0.020, x));
      const g = Math.round(v * 255);
      data[i * 4] = g; data[i * 4 + 1] = g; data[i * 4 + 2] = g; data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  /**
   * Note what is *not* here: `detail`. SHADING's triplanar detail layer is projected in world
   * space, which is wrong twice over for a character — it swims across the surface as he moves,
   * and it is the same projection the critic recorded smearing along every curved, non-axis-
   * aligned surface in the set. Sly is nothing but curved, non-axis-aligned surface. His fur
   * and cloth detail comes from his own UV-mapped maps below, which follow the loft.
   */
  _matSpec(group) {
    const F = this._fur, C = this._cloth, M = this._metal;
    switch (group) {
      /* Specular is near-zero on fur and moderate on the shirt, and the two halves of that
         have different evidence behind them, so they are recorded separately.
       *
       * Fur: near-zero on physical grounds. Fur scatters; it has no highlight to speak of, and
       * a wide soft one is exactly the cue that reads as moulded vinyl. That holds regardless
       * of what else the renderer was doing.
       *
       * Shirt: I originally cut this hard (0.10 → 0.055) on the strength of the critic's
       * "broad satin specular smear down the left of the shirt". That attribution was made
       * while the fresnel rim was firing on any face angled away from the eye rather than only
       * at silhouettes — a full-strength `#7fd4ff` wash across flat surfaces, worth ~22 luma on
       * shadowed verticals. A broad soft cool smear is far more characteristic of that bug than
       * of a `gloss 22` lobe, so most of the cut was probably aimed at the wrong term. The rim
       * is now gated; this is a partial revert, kept a little under the original because some
       * of the sheen was real. §2.1 wants a hard-stepped specular, not none. */
      case 'fur': return {
        color: PAL.furMid, map: F.detail, normalMap: F.normal,
        normalScale: 1.15, repeat: [3, 3], sss: TUNE.furSSS, rim: TUNE.rim,
        spec: 0.025, gloss: 8,
      };
      case 'furCream': return {
        color: PAL.cream, map: F.detail, normalMap: F.normal,
        normalScale: 1.05, repeat: [3, 3], sss: TUNE.furSSS + 0.06, rim: TUNE.rim * 0.9,
        spec: 0.02, gloss: 8,
      };
      case 'furDark': return {
        color: PAL.tailDark, map: F.detail, normalMap: F.normal,
        normalScale: 1.25, repeat: [3, 3], sss: TUNE.furSSS * 0.6, rim: TUNE.rim * 1.15,
        spec: 0.03, gloss: 9,
      };
      case 'cloth': return {
        color: PAL.shirt, map: C.detail, normalMap: C.normal,
        normalScale: 0.75, repeat: [4, 4], sss: 0.14, rim: TUNE.rim * 0.85,
        spec: 0.085, gloss: 20,
      };
      case 'clothDark': return {
        color: PAL.shirtDark, map: C.detail, normalMap: C.normal,
        normalScale: 0.85, repeat: [4, 4], sss: 0.10, rim: TUNE.rim * 0.95,
        spec: 0.18, gloss: 34,
      };
      case 'gold': return {
        color: PAL.gold, map: M.detail, normalMap: M.normal,
        normalScale: 0.7, repeat: [2, 2], sss: 0.0, rim: 0.5,
        spec: 0.9, gloss: 96, metal: true,
      };
      case 'ink': return {
        color: PAL.ink, sss: 0.0, rim: 0.30, spec: 0.05, gloss: 12, flat: true,
      };
      case 'eye': return {
        // A *neutral* whisper of self-illumination, not a warm one. At `tod: 0.02` the old warm
        // emissive was the brightest thing on him and he read as "a cat in a hedge" — two yellow
        // dots floating in black. The eyes should catch light, not emit it.
        // Lifted from 0x121212. Captured at `tod 0.80` the eyes came out dark-on-dark inside
        // the black mask and the face lost the one feature that identifies him at 40 px. Still
        // neutral and still low — this holds the sclera's value through a shadowed face, it
        // does not make him glow. Worth re-checking on `night`, which is where the previous
        // (warm, brighter) emissive failed.
        // A wet sphere: a tight bright highlight is correct here and it is a legibility win
        // at distance. The 0.55/80 is the original; it was collateral in an unrelated edit.
        color: PAL.eyeWhite, sss: 0.0, rim: 0.22, spec: 0.55, gloss: 80, emissive: 0x282828,
      };
      default: return { color: 0xff00ff };
    }
  }

  _material(group) {
    const spec = this._matSpec(group);
    const shading = this.engine.get('shading');
    if (shading?.toon) {
      try {
        const m = shading.toon({
          color: spec.color,
          map: spec.map || null,
          normalMap: spec.normalMap || null,
          bands: TUNE.bands,
          rim: spec.rim ?? TUNE.rim,
          rimColor: TUNE.rimColor,
          spec: spec.spec ?? 0.1,
          gloss: spec.gloss ?? 20,
          /* `metal` was authored on the gold spec and dropped here, so every gilded surface on
             the character — cane shaft and crook, belt buckle, cap button — has been running at
             uMetal 0 for its whole life. The world's gilding was fixed when metal went live;
             this was the one gold left flat, and §7.3 fails "gold doesn't read as metal"
             outright. Note for whoever extends this: two more authored fields are *still*
             dropped by this same pass-through and both are deliberate holds, not oversights —
             `spec.flat` (would map to toon's `flatShading`, changes pupils/nose/mouth/mask all
             at once) and `spec.normalScale` (0.70–1.25 across the groups, currently running at
             three's default 1.0 on every one of them; `_applyRepeat` only clones for `repeat`).
             Each changes a shading read on every surface it touches, so each wants its own
             capture rather than being folded in with a geometry pass. */
          metal: spec.metal ? 1 : 0,
          outline: 1.0,
          sss: spec.sss ?? 0,
          detail: spec.detail ?? null,
          emissive: spec.emissive ?? 0x000000,
          emissiveIntensity: spec.emissive ? 0.35 : 0,
          skinning: true,
          vertexColors: true,
          side: THREE.FrontSide,
        });
        if (m) {
          this._applyRepeat(spec, m);
          this._materials.push(m);
          m.__owned = false;
          return m;
        }
      } catch (err) {
        if (!this.warned) { this.engine.warn(`SlyModel: shading.toon() failed, using fallback — ${err?.message}`); this.warned = true; }
      }
    }
    return this._fallbackMaterial(group, spec);
  }

  /** Textures are shared between groups, so per-material repeat needs its own clone. */
  _applyRepeat(spec, m) {
    if (!spec.repeat) return;
    for (const key of ['map', 'normalMap']) {
      const t = m[key];
      if (!t || !t.isTexture) continue;
      if (!t.__slyCloned) {
        const c = t.clone();
        c.__slyCloned = true;
        c.wrapS = c.wrapT = THREE.RepeatWrapping;
        c.needsUpdate = true;
        m[key] = c;
        this._textures.push(c);
      }
      m[key].repeat.set(spec.repeat[0], spec.repeat[1]);
    }
  }

  /**
   * Fallback when SHADING has not landed. MeshToonMaterial + an authored 3-band gradient is a
   * far better stand-in for the Sly look than MeshStandardMaterial, and a small fresnel rim
   * injection keeps the silhouette separated (§7.3 fails "no rim light"). Gold goes through
   * MeshStandardMaterial because it needs real metalness to read as metal.
   */
  _fallbackMaterial(group, spec) {
    let m;
    if (spec.metal) {
      m = new THREE.MeshStandardMaterial({
        color: spec.color, metalness: 0.92, roughness: 0.26,
        map: spec.map || null, normalMap: spec.normalMap || null,
        vertexColors: true,
      });
    } else {
      m = new THREE.MeshToonMaterial({
        color: spec.color,
        map: spec.map || null,
        normalMap: spec.normalMap || null,
        gradientMap: this._gradient,
        emissive: new THREE.Color(spec.emissive ?? 0x000000),
        vertexColors: true,
      });
      const rim = spec.rim ?? TUNE.rim;
      const rimCol = new THREE.Color(TUNE.rimColor);
      const wrap = spec.sss ?? 0;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = { value: rim };
        sh.uniforms.uRimColor = { value: rimCol };
        sh.uniforms.uWrap = { value: wrap };
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'uniform float uRim;\nuniform vec3 uRimColor;\nuniform float uWrap;\nvoid main() {')
          .replace('#include <opaque_fragment>', `
            {
              vec3 vd = normalize( vViewPosition );
              float fres = pow( clamp( 1.0 - abs( dot( normal, vd ) ), 0.0, 1.0 ), 2.6 );
              // warm wrap-through: fur and skin bleed light around the terminator
              outgoingLight += diffuseColor.rgb * uWrap * 0.55 * vec3(1.06,0.92,0.80)
                             * ( 1.0 - abs( dot( normal, vd ) ) * 0.35 );
              outgoingLight += uRimColor * fres * uRim;
            }
            #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => `slyToon|${rim}|${wrap}`;
    }
    if (spec.normalScale && m.normalScale) m.normalScale.setScalar(spec.normalScale);
    this._applyRepeat(spec, m);
    m.__owned = true;
    this._materials.push(m);
    return m;
  }

  /* ====================================================================== */
  /*  outline                                                               */
  /* ====================================================================== */

  _buildOutline(geo) {
    const shading = this.engine.get('shading');
    if (shading?.outline) {
      try {
        const r = shading.outline(this.mesh, { thickness: TUNE.outline / 0.0034 });
        if (r) { this.outlineMesh = r; return; }
      } catch (err) {
        this.engine.warn(`SlyModel: shading.outline() failed — ${err?.message}`);
      }
    }
    // Own inverted hull. Attributes and index are *shared* with the body geometry, and the
    // groups are dropped so the whole silhouette costs exactly one draw call.
    const og = new THREE.BufferGeometry();
    for (const k in geo.attributes) og.setAttribute(k, geo.attributes[k]);
    og.setIndex(geo.index);
    og.boundingSphere = geo.boundingSphere;
    og.boundingBox = geo.boundingBox;

    const mat = new THREE.MeshBasicMaterial({
      color: TUNE.outlineColor, side: THREE.BackSide, fog: false,
    });
    const thick = { value: TUNE.outline };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uThick = thick;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uThick;')
        .replace('#include <project_vertex>', `
          #include <project_vertex>
          #ifdef USE_SKINNING
            // Extrude in view space scaled by depth, so the line holds ~2.5 px at any distance
            // instead of thinning out (§7.3 fails uniform-thickness-regardless-of-depth).
            vec3 olN = normalize( normalMatrix * objectNormal );
            gl_Position = projectionMatrix * ( mvPosition + vec4( olN * uThick * ( - mvPosition.z ), 0.0 ) );
          #endif
        `);
    };
    mat.customProgramCacheKey = () => 'slyOutline';

    const shell = new THREE.SkinnedMesh(og, mat);
    shell.name = 'sly_outline';
    shell.frustumCulled = false;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.renderOrder = -1;
    this.root.add(shell);
    shell.bind(this.skeleton, new THREE.Matrix4());
    this.outlineMesh = shell;
    this._materials.push(mat);
    this._geometries.push(og);
    this._outlineThickness = thick;
  }

  /* ====================================================================== */
  /*  cane                                                                  */
  /* ====================================================================== */

  _buildCane() {
    /* One material, not two. The grip used to carry its own red-leather material, which cost a
       draw call the character budget could not spare; it is now the same gold shaded darker by
       vertex colour, which is honest now that vertex colour is a multiplier (see Body.furTint)
       and still reads as a bound handle because the helical wrap is *geometry*, not texture. */
    const goldMat = this._material('gold');
    this.cane = new Cane(this.engine).build([goldMat]);

    /* A pivot inside the hand so the cane can be re-aimed without touching the hand pose.
       In bind pose a fist grips along ±Z, so the shaft (+Y local) is rotated onto it. */
    const pivot = new THREE.Group();
    pivot.name = 'caneGrip';
    pivot.position.set(-0.036, -0.040, 0.004);
    pivot.rotation.set(Math.PI * 0.5, 0, 0.16);
    pivot.add(this.cane.object);
    this.bones.handR.add(pivot);
    this._canePivot = pivot;
    this._attachPoints.cane = pivot;

    // Give the cane its own, slightly heavier ink line — it is a hard prop among soft fur.
    const sh = this.engine.get('shading');
    if (sh?.outline) {
      try { sh.outline(this.cane.mesh, { thickness: 1.25 }); return; } catch { /* fall through */ }
    }
    const og = new THREE.BufferGeometry();
    for (const k in this.cane.mesh.geometry.attributes) og.setAttribute(k, this.cane.mesh.geometry.attributes[k]);
    og.setIndex(this.cane.mesh.geometry.index);
    og.boundingSphere = this.cane.mesh.geometry.boundingSphere;
    const mat = new THREE.MeshBasicMaterial({ color: TUNE.outlineColor, side: THREE.BackSide, fog: false });
    const thick = { value: TUNE.outline * 1.15 };
    mat.onBeforeCompile = (sh2) => {
      sh2.uniforms.uThick = thick;
      sh2.vertexShader = sh2.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uThick;\nvarying vec3 vDummy;')
        .replace('#include <begin_vertex>', `
          #include <beginnormal_vertex>
          #include <begin_vertex>`)
        .replace('#include <project_vertex>', `
          #include <project_vertex>
          vec3 olN = normalize( normalMatrix * objectNormal );
          gl_Position = projectionMatrix * ( mvPosition + vec4( olN * uThick * ( - mvPosition.z ), 0.0 ) );
          vDummy = olN;
        `);
    };
    mat.customProgramCacheKey = () => 'slyCaneOutline';
    const shell = new THREE.Mesh(og, mat);
    shell.name = 'cane_outline';
    shell.renderOrder = -1;
    shell.frustumCulled = false;
    this.cane.object.add(shell);
    this._materials.push(mat);
    this._geometries.push(og);
  }

  /* ====================================================================== */
  /*  pose                                                                  */
  /* ====================================================================== */

  /** Apply an Euler-XYZ pose map on top of bind. Used for the default idle and by tools. */
  applyPose(pose) {
    for (const name in pose) {
      if (name === 'hipsOffset') continue;
      const b = this.bones[name];
      if (!b) continue;
      const r = pose[name];
      b.rotation.set(r[0], r[1], r[2]);
    }
    if (pose.hipsOffset && this.bones.hips) {
      const base = this._bindWorld.hips;
      const parent = this._bindWorld.root;
      this.bones.hips.position.set(
        base.x - parent.x + pose.hipsOffset[0],
        base.y - parent.y + pose.hipsOffset[1],
        base.z - parent.z + pose.hipsOffset[2],
      );
    }
    this.root.updateMatrixWorld(true);
  }

  _captureRest() {
    for (const n of this.boneNames) this._restQ[n] = this.bones[n].quaternion.clone();
  }

  /* ====================================================================== */
  /*  public API                                                            */
  /* ====================================================================== */

  /** Parent an object to a bone. Names: handR handL back hip head — or any bone name. */
  attach(name, obj3d) {
    const alias = { handR: 'handR', handL: 'handL', back: 'chest', hip: 'hips', head: 'head' };
    const bone = this.bones[alias[name] || name];
    if (!bone) {
      this.engine.warn(`SlyModel.attach: no such attach point "${name}"`);
      return null;
    }
    if (obj3d) bone.add(obj3d);
    return bone;
  }

  setVisible(v) {
    this.root.visible = !!v;
  }

  /** Bone world position, for FX / AUDIO / CAMERA. Writes into `out`. */
  bonePosition(name, out) {
    const b = this.bones[name];
    if (!b) return out;
    return out.setFromMatrixPosition(b.matrixWorld);
  }

  /* ====================================================================== */
  /*  update                                                                */
  /* ====================================================================== */

  update(dt, t) {
    if (!this.mesh) return;
    if (this.engine.debug.hidePlayer && this.root.visible) this.root.visible = false;

    // Once ANIMATION exists it owns every bone; this idle only keeps pre-ANIMATION frames alive.
    if (this.engine.get('animation')) return;

    const br = Math.sin(t * TUNE.breathRate * Math.PI * 2);
    const sw = Math.sin(t * TUNE.tailIdleRate * Math.PI * 2);
    const sw2 = Math.sin(t * TUNE.tailIdleRate * Math.PI * 2 - 0.9);

    this._flex('chest', TUNE.breathAmp * br, 0, 0);
    this._flex('spine', TUNE.breathAmp * -0.4 * br, 0, 0);
    this._flex('neck', TUNE.breathAmp * -0.6 * br, 0.02 * sw, 0);
    this._flex('head', 0, 0.03 * sw2, 0.012 * br);
    this._flex('tailA', 0.02 * sw, TUNE.tailIdleAmp * sw, 0);
    this._flex('tailB', 0.025 * sw2, TUNE.tailIdleAmp * 1.15 * sw2, 0);
    this._flex('tailC', 0.02 * sw, TUNE.tailIdleAmp * 1.3 * sw, 0);
    this._flex('tailD', 0, TUNE.tailIdleAmp * 1.5 * sw2, 0);
    this._flex('earL', 0, 0, 0.05 * sw2);
    this._flex('earR', 0, 0, -0.04 * sw);
  }

  _flex(name, x, y, z) {
    const b = this.bones[name];
    const rest = this._restQ[name];
    if (!b || !rest) return;
    _e.set(x, y, z, 'XYZ');
    _qs.setFromEuler(_e);
    b.quaternion.copy(rest).multiply(_qs);
  }

  /* ====================================================================== */
  /*  dispose                                                               */
  /* ====================================================================== */

  dispose() {
    this._offShot?.();
    this.cane?.dispose();
    for (const g of this._geometries) g.dispose?.();
    for (const m of this._materials) if (m.__owned !== false) m.dispose?.();
    for (const t of this._textures) t.dispose?.();
    this._geometries.length = 0;
    this._materials.length = 0;
    this._textures.length = 0;
    this.skeleton?.dispose?.();
    this.root.removeFromParent();
    this.mesh = null;
    this.outlineMesh = null;
  }
}

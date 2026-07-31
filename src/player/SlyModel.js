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
 */

/* ============================ TUNE ======================================== */

export const TUNE = {
  height: 1.80,

  /* --- silhouette proportions. These are the cartoon exaggeration knobs. --- */
  headScale: 1.19,        // cranium scale about the neck joint — tuned to ~5 heads tall (§7.3)
  tailScale: 1.00,        // tail length + girth; the tail is half the silhouette
  handScale: 1.22,        // big thief hands — they sell every gesture, so they are oversized
  footScale: 1.18,        // chunky boots give the contrapposto a base to stand on

  /* --- shading / line --- */
  outline: 0.0034,        // fraction-of-frame-height thickness ⇒ ~2.5 px at any resolution
  outlineColor: 0x1a1210, // §2.1: warm near-black, never pure #000
  rim: 0.62,
  rimColor: 0x7fd4ff,
  furSSS: 0.38,           // warm wrap-through; the single biggest "this is fur" cue
  bands: 3,
  furTintAmount: 0.075,   // per-vertex tone break-up so no region is a flat colour
  tuftDensity: 1.0,

  /* --- idle life, only used while ANIMATION is absent --- */
  breathRate: 0.62,
  breathAmp: 0.014,
  tailIdleRate: 0.42,
  tailIdleAmp: 0.055,

  segLimb: 14,            // radial segments: limbs
  segTorso: 22,
  segHead: 26,
  segTail: 20,
};

/* ============================ PALETTE ===================================== */

/**
 * §2.1 material separation. These are *material* colours — the only place hue lives. The
 * values are deliberately spread apart on a value ladder, because "flat single colour" is an
 * auto-fail and two materials three points apart in luminance read as one under a cel ramp:
 *
 *   cream 0.84 · gold 0.72 · furMid 0.55 · shirt 0.42 · clothDark 0.24 · tailDark 0.14 · ink 0.06
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
const hy = (y) => HEAD_BASE + (y - HEAD_BASE) * TUNE.headScale;
const hx = (v) => v * TUNE.headScale;

/* ============================ SKELETON ==================================== */

/** [name, parent, [x,y,z] in bind-pose model space]. His right is −X, forward is +Z. */
const SKELETON = [
  ['hips', 'root', [0, 0.905, -0.005]],
  ['spine', 'hips', [0, 1.010, 0.000]],
  ['chest', 'spine', [0, 1.150, -0.005]],
  ['neck', 'chest', [0, 1.315, 0.010]],
  ['head', 'neck', [0, hy(1.420), 0.015]],
  ['jaw', 'head', [0, hy(1.478), hx(0.055)]],
  ['capBrim', 'head', [0, hy(1.665), hx(0.090)]],
  ['earL', 'head', [hx(0.128), hy(1.662), hx(-0.022)]],
  ['earR', 'head', [hx(-0.128), hy(1.662), hx(-0.022)]],
  ['browL', 'head', [hx(0.064), hy(1.648), hx(0.140)]],
  ['browR', 'head', [hx(-0.064), hy(1.648), hx(0.140)]],

  ['shoulderL', 'chest', [0.052, 1.292, 0.000]],
  ['upperArmL', 'shoulderL', [0.140, 1.278, 0.000]],
  ['lowerArmL', 'upperArmL', [0.3315, 1.1173, 0.000]],
  ['handL', 'lowerArmL', [0.4800, 0.9523, 0.000]],
  ['shoulderR', 'chest', [-0.052, 1.292, 0.000]],
  ['upperArmR', 'shoulderR', [-0.140, 1.278, 0.000]],
  ['lowerArmR', 'upperArmR', [-0.3315, 1.1173, 0.000]],
  ['handR', 'lowerArmR', [-0.4800, 0.9523, 0.000]],

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
  ['tailB', 'tailA', [0.022, 0.896, -0.445]],
  ['tailC', 'tailB', [0.062, 0.928, -0.748]],
  ['tailD', 'tailC', [0.116, 1.008, -0.996]],
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
     classic thief triangle. */
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
  ];

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
  ];

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
      * smooth(1.16, 1.25, p.y) * (1 - smooth(1.28, 1.33, p.y));
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
    const top = 1.322;
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
    const y = 0.851;
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
   * ANIMATION can whip it; five dark rings; tufts along the top so the outline is ragged.
   */
  _buildTail(mb) {
    const S = TUNE.tailScale;
    /* Follows the bind bone chain: back off the hips, then sweeping up into a raised hook.
       Read the profile below with this in mind — the fat part of the tail sits *above* the
       hips, at head height, where it silhouettes against sky instead of against his own back. */
    const spine = resample([
      new THREE.Vector3(0.000, 0.898, -0.070 * S),
      new THREE.Vector3(0.004, 0.895, -0.200 * S),
      new THREE.Vector3(0.014, 0.894, -0.340 * S),
      new THREE.Vector3(0.030, 0.899, -0.480 * S),
      new THREE.Vector3(0.052, 0.913, -0.618 * S),
      new THREE.Vector3(0.080, 0.941, -0.748 * S),
      new THREE.Vector3(0.112, 0.983, -0.864 * S),
      new THREE.Vector3(0.146, 1.039, -0.958 * S),
      new THREE.Vector3(0.178, 1.105, -1.024 * S),
      new THREE.Vector3(0.204, 1.174, -1.066 * S),
    ], 32);

    /* Girth: at its widest the tail is 0.36 m across — wider than his 0.23 m chest and level
       with his 0.35 m head. That ratio is not an exaggeration of the reference, it *is* the
       reference; a tail slimmer than the torso reads as a rope. */
    const radius = (t) => {
      const prof = [
        [0.00, 0.078], [0.09, 0.120], [0.20, 0.156], [0.36, 0.178],
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
        const lump = 1 + 0.05 * Math.sin(t * 26 + a * 3) + 0.035 * Math.cos(a * 5 - t * 11);
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

    // ≥3 rings straddle each joint so the elbow can flex 100° without creasing.
    const key = [
      [0.00, new THREE.Vector3(side * 0.062, 1.292, 0.000), 0.052],
      [0.10, new THREE.Vector3(side * 0.104, 1.290, 0.000), 0.066],
      [0.22, new THREE.Vector3(side * 0.145, 1.279, 0.000), 0.071],
      [0.34, new THREE.Vector3(side * 0.196, 1.238, 0.000), 0.060],
      [0.48, new THREE.Vector3(side * 0.252, 1.191, 0.000), 0.052],
      [0.60, new THREE.Vector3(side * 0.300, 1.150, 0.000), 0.049],
      [0.68, new THREE.Vector3(side * 0.3315, 1.1173, 0.000), 0.0505],
      [0.76, new THREE.Vector3(side * 0.366, 1.0835, 0.000), 0.048],
      [0.86, new THREE.Vector3(side * 0.412, 1.0325, 0.000), 0.0435],
      [0.93, new THREE.Vector3(side * 0.451, 0.9885, 0.000), 0.040],
      [0.965, new THREE.Vector3(side * 0.468, 0.9700, 0.000), 0.042],
      [1.00, new THREE.Vector3(side * 0.482, 0.9535, 0.000), 0.038],
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

    addTube(mb, {
      centers, seg: TUNE.segLimb,
      rx: (i) => radii[i] * (ts[i] >= gloveStart ? 1.14 : (ts[i] >= cuffStart ? 1.0 : 1.0)),
      framesOverride: undefined,
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a) => superEllipse(a, 1.05),
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
      center: new THREE.Vector3(side * 0.132, 1.281, -0.002),
      radii: new THREE.Vector3(0.062, 0.058, 0.062),
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
    const wrist = new THREE.Vector3(side * 0.482, 0.9535, 0);
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

    addTube(mb, {
      centers: key.map((k) => k[1]), seg: TUNE.segLimb,
      rx: (i) => key[i][2],
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a) => superEllipse(a, 1.04),
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
  get headRadii() { return new THREE.Vector3(0.176 * TUNE.headScale, 0.184 * TUNE.headScale, 0.196 * TUNE.headScale); }

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
      rx: (i) => H[i][1] * S,
      ry: (i) => H[i][2] * S,
      upHint: new THREE.Vector3(0, 0, 1),
      shape: (a, i) => {
        const s = superEllipse(a, 1.10);
        // flatten the face plane a little and put a brow shelf over the eyes
        const front = Math.max(0, Math.cos(a));
        const brow = smooth(1.615, 1.660, H[i][0]) * (1 - smooth(1.665, 1.700, H[i][0]));
        s.v *= 1 - 0.05 * front * front + 0.035 * brow * front;
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

  _buildMuzzle(mb) {
    const S = TUNE.headScale;
    const key = [
      [new THREE.Vector3(0, 1.562, 0.040), 0.099, 0.084],
      [new THREE.Vector3(0, 1.554, 0.104), 0.103, 0.087],
      [new THREE.Vector3(0, 1.540, 0.160), 0.094, 0.079],
      [new THREE.Vector3(0, 1.520, 0.210), 0.078, 0.066],
      [new THREE.Vector3(0, 1.500, 0.249), 0.057, 0.049],
      [new THREE.Vector3(0, 1.486, 0.273), 0.031, 0.027],
    ];
    const c = this.headCenter;
    addTube(mb, {
      centers: key.map((k) => new THREE.Vector3(0, hy(k[0].y), hx(k[0].z))),
      seg: 20,
      rx: (i) => key[i][1] * S,
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
   */
  _buildMask(mb) {
    const TH = 1.34;
    addPatch(mb, {
      segU: 26, segV: 4,
      group: 'ink', sg: mb.newSg(),
      at: (u, v) => {
        const th = THREE.MathUtils.lerp(-TH, TH, u);
        const at = Math.abs(th) / TH;
        const phic = 0.112 + 0.425 * Math.pow(at, 1.75);
        const half = 0.335 * (1 - 0.80 * Math.pow(at, 3.0)) * (0.70 + 0.30 * smooth(0.0, 0.30, at));
        const phi = phic + (v * 2 - 1) * half;
        return this.headSurf(th, phi, 1.020);
      },
      weightsAtVert: (u, v, p) => this._headWeights(p),
    });
  }

  _buildEye(mb, side) {
    const S = TUNE.headScale;
    const th = side * 0.455;
    const c = this.headSurf(th, 0.165, 0.80);            // sunk into the skull, bulging out
    const outward = new THREE.Vector3(side * 0.36, 0.10, 1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, outward).normalize();
    const trueUp = new THREE.Vector3().crossVectors(outward, right).normalize();
    const basis = { x: right, y: trueUp, z: outward };

    // sclera
    addEllipsoid(mb, {
      center: c, radii: new THREE.Vector3(0.049 * S, 0.052 * S, 0.050 * S), basis,
      segTheta: 18, segPhi: 12,
      group: 'eye', sg: mb.newSg(), weights: [['head', 1]],
    });
    // pupil — big and cartoon, sitting proud of the sclera so it never z-fights
    const pc = c.clone().addScaledVector(outward, 0.030 * S).addScaledVector(trueUp, 0.002 * S);
    addEllipsoid(mb, {
      center: pc, radii: new THREE.Vector3(0.026 * S, 0.031 * S, 0.026 * S), basis,
      segTheta: 14, segPhi: 9,
      group: 'ink', sg: mb.newSg(), weights: [['head', 1]],
    });
    // highlight on the pupil: the "alive" cue. Sits on black, so it reads at any size.
    const hc = pc.clone().addScaledVector(outward, 0.019 * S)
      .addScaledVector(trueUp, 0.013 * S).addScaledVector(right, -side * 0.010 * S);
    addEllipsoid(mb, {
      center: hc, radii: new THREE.Vector3(0.011 * S, 0.011 * S, 0.010 * S), basis,
      segTheta: 10, segPhi: 7,
      group: 'eye', sg: mb.newSg(), weights: [['head', 1]],
    });

    /* Hooded upper lid, tilted outward-down — this is where the *smug* comes from. A wide-open
       eye reads as surprised; a lid cutting across the top third reads as amused. */
    const lidUp = trueUp.clone().applyAxisAngle(outward, side * 0.30).normalize();
    const lidRight = new THREE.Vector3().crossVectors(lidUp, outward).normalize();
    addEllipsoid(mb, {
      center: c.clone().addScaledVector(outward, 0.002 * S),
      radii: new THREE.Vector3(0.053 * S, 0.056 * S, 0.054 * S),
      basis: { x: lidRight, y: lidUp, z: outward },
      segTheta: 18, segPhi: 6, phi0: 0.18, phi1: Math.PI / 2,
      group: 'fur', sg: mb.newSg(), weights: [['head', 1]],
      colorAt: (u, v, p) => furTint(_c, p.x, p.y, p.z, 0.03, 4, 0.74),
    });
  }

  _buildNose(mb) {
    const S = TUNE.headScale;
    const c = new THREE.Vector3(0, hy(1.504), hx(0.268));
    addEllipsoid(mb, {
      center: c,
      radii: new THREE.Vector3(0.031 * S, 0.024 * S, 0.024 * S),
      segTheta: 14, segPhi: 9,
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
    const P = (x, y, z) => new THREE.Vector3(hx(x), hy(y), hx(z));
    const line = resample([
      P(-0.066, 1.492, 0.192),
      P(-0.040, 1.478, 0.234),
      P(-0.010, 1.473, 0.254),
      P(0.022, 1.477, 0.252),
      P(0.052, 1.494, 0.230),
      P(0.074, 1.514, 0.190),
    ], 16);
    const muzzleC = P(0, 1.532, 0.150);
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
    /* Pushed outboard and swept out at ~40° from vertical so the tips clear the cap crown by
       a clear margin. An ear buried under the hat brim is worth nothing in silhouette, and
       the ear/cap notch is the shape that says "raccoon in a hat" rather than "person". */
    const base = new THREE.Vector3(hx(side * 0.118), hy(1.646), hx(-0.020));
    const axis = new THREE.Vector3(side * 0.62, 0.77, -0.16).normalize();
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
   * Cyan newsboy cap. Puffy eight-panel crown with a scalloped radius, tipped forward, plus a
   * stiff dark brim on its own bone so ANIMATION can flick it. With the mask and the tail this
   * is one of the three shapes that has to survive being filled solid black.
   */
  _buildCap(mb) {
    const S = TUNE.headScale;
    const pivot = new THREE.Vector3(0, 1.640, 0.0);   // in *unscaled* head space; place() maps it
    // Tipped down over the brow and cocked to his left. A level, symmetric cap reads as a
    // swimming hat; the cock is most of what makes it read as *his* cap.
    const tilt = new THREE.Matrix4().makeRotationX(0.175).premultiply(new THREE.Matrix4().makeRotationZ(0.105));
    const place = (p) => {
      p.sub(pivot).applyMatrix4(tilt).add(pivot);
      p.set(hx(p.x), hy(p.y), hx(p.z));
      return p;
    };

    /* y, half-width, half-depth, z-offset.
     *
     * The old crown peaked at 0.201 against a 0.171 skull — a 3 cm lip, which is nothing at
     * silhouette scale and is exactly why the critic recorded "no cap; the head is a bare
     * rounded lump". This one peaks at 0.262: it *overhangs* the skull by half a head-radius,
     * so the profile steps out hard above the ears and the cap becomes its own shape rather
     * than a hat-coloured patch of scalp. It is also pulled back and up into a soft newsboy
     * lozenge instead of a dome concentric with the cranium.
     */
    const C = [
      [1.598, 0.180, 0.190, 0.004],
      [1.614, 0.211, 0.222, 0.000],
      [1.640, 0.228, 0.240, -0.006],
      [1.672, 0.232, 0.244, -0.014],
      [1.712, 0.224, 0.235, -0.024],
      [1.756, 0.203, 0.212, -0.034],
      [1.800, 0.170, 0.176, -0.042],
      [1.840, 0.124, 0.128, -0.048],
      [1.868, 0.066, 0.068, -0.052],
      [1.880, 0.014, 0.015, -0.054],
    ];
    addTube(mb, {
      centers: C.map(([y, , , cz]) => new THREE.Vector3(0, y, cz)), seg: 32,
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
    const btn = place(new THREE.Vector3(0, 1.882, -0.054));
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
       Wide, deep and dark — with the ears it is the top half of the silhouette test. */
    const N = 24, TH = 1.40;
    const arc = [];
    for (let i = 0; i <= N; i++) {
      const th = THREE.MathUtils.lerp(-TH, TH, i / N);
      const k = Math.abs(th) / TH;
      arc.push(place(new THREE.Vector3(
        Math.sin(th) * 0.216,
        1.594 - 0.020 * Math.pow(k, 2),
        0.004 + Math.cos(th) * 0.240,
      )));
    }
    addTube(mb, {
      centers: arc, seg: 12,
      // deep at the centre, tucking away at the temples — a peak, not a sun-visor ring
      rx: (i) => 0.094 * S * (1 - 0.62 * Math.pow(Math.abs(i / N * 2 - 1), 1.9)),
      ry: 0.0150 * S,
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
  _buildTufts(mb) {
    const S = TUNE.headScale;
    const D = TUNE.tuftDensity;
    /* Tufts carry no colour of their own: like every vertex colour on this model they would
       MULTIPLY their material (see Body.furTint), so the group owns the hue and they stay
       neutral. They exist for the ragged silhouette edge, not for tone. */
    const put = (o) => addTuft(mb, { sg: mb.newSg(), color: 0xffffff, ...o });

    for (const side of [1, -1]) {
      /* cheek ruffs — the widest part of his head, so the most valuable place to break up */
      for (let i = 0; i < Math.round(5 * D); i++) {
        const f = i / 4;
        const th = side * THREE.MathUtils.lerp(0.72, 1.30, f);
        const phi = THREE.MathUtils.lerp(-0.30, 0.20, f);
        const base = this.headSurf(th, phi, 0.97);
        const out = base.clone().sub(this.headCenter).normalize();
        const dir = out.clone().addScaledVector(new THREE.Vector3(0, -1, -0.55), 0.55).normalize();
        put({
          base, dir, length: (0.050 + 0.030 * (1 - Math.abs(f - 0.45) * 2)) * S,
          width: 0.019 * S, bend: 0.30, bendDir: new THREE.Vector3(0, -1, 0),
          group: 'fur', weights: [['head', 1]],
        });
      }
      // cream ruff under the cheek, framing the muzzle
      for (let i = 0; i < Math.round(3 * D); i++) {
        const f = i / 2;
        const th = side * THREE.MathUtils.lerp(0.55, 1.02, f);
        const base = this.headSurf(th, -0.42 + f * 0.10, 0.96);
        const out = base.clone().sub(this.headCenter).normalize();
        put({
          base, dir: out.clone().addScaledVector(new THREE.Vector3(0, -1, 0), 0.85).normalize(),
          length: 0.048 * S, width: 0.016 * S, bend: 0.35, bendDir: new THREE.Vector3(0, -1, 0.3),
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

      /* chest ruff bursting out of the open collar */
      for (let i = 0; i < Math.round(4 * D); i++) {
        const f = (i + 0.5) / 4;
        const th = THREE.MathUtils.lerp(-0.5, 0.5, f) + (side > 0 ? 0 : 0);
        if (side < 0) continue;
        const y = 1.300 - 0.030 * Math.abs(th);
        const r = this._torsoRadius(y);
        const base = new THREE.Vector3(Math.sin(th) * r.rx * 1.02, y, r.cz + Math.cos(th) * r.rz * 1.02);
        put({
          base, dir: new THREE.Vector3(Math.sin(th) * 0.5, 0.72, Math.cos(th) * 0.62).normalize(),
          length: 0.048, width: 0.016, bend: 0.35, bendDir: new THREE.Vector3(0, 0, 1),
          group: 'furCream', weights: [['chest', 0.6], ['neck', 0.4]],
        });
      }
      // neck ruff around the collar
      for (let i = 0; i < Math.round(3 * D); i++) {
        const th = side * (0.95 + i * 0.55);
        const y = 1.352;
        const r = this._torsoRadius(y);
        const base = new THREE.Vector3(Math.sin(th) * r.rx * 1.02, y, r.cz + Math.cos(th) * r.rz * 1.02);
        put({
          base, dir: new THREE.Vector3(Math.sin(th) * 0.75, -0.42, Math.cos(th) * 0.75).normalize(),
          length: 0.042, width: 0.015, bend: 0.3,
          group: 'furCream', weights: [['neck', 1]],
        });
      }

      /* backs of the forearms — the fur band between sleeve cuff and glove */
      for (let i = 0; i < Math.round(3 * D); i++) {
        const f = i / 2;
        const c = new THREE.Vector3(side * THREE.MathUtils.lerp(0.415, 0.452, f),
          THREE.MathUtils.lerp(1.030, 0.988, f), 0);
        const back = new THREE.Vector3(side * -0.35, -0.30, -0.88).normalize();
        put({
          base: c.clone().addScaledVector(back, 0.030),
          dir: back.clone().addScaledVector(new THREE.Vector3(side * -0.5, 0.35, 0), 0.5).normalize(),
          length: 0.042, width: 0.014, bend: 0.3,
          group: 'fur',
          weights: [[side > 0 ? 'lowerArmL' : 'lowerArmR', 1]],
        });
      }
      // thigh wisps
      for (let i = 0; i < Math.round(2 * D); i++) {
        const y = 0.800 - i * 0.075;
        const base = new THREE.Vector3(side * 0.076, y, -0.055);
        put({
          base, dir: new THREE.Vector3(side * 0.35, -0.55, -0.76).normalize(),
          length: 0.048, width: 0.016, bend: 0.28,
          group: 'fur',
          weights: [[side > 0 ? 'upperLegL' : 'upperLegR', 1]],
        });
      }
      // fur spilling over the boot cuff
      for (let i = 0; i < Math.round(4 * D); i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const base = new THREE.Vector3(side * 0.088 + Math.sin(a) * 0.045, 0.308, -0.004 + Math.cos(a) * 0.045);
        put({
          base, dir: new THREE.Vector3(Math.sin(a) * 0.55, 0.72, Math.cos(a) * 0.55).normalize(),
          length: 0.036, width: 0.013, bend: 0.3,
          group: 'fur',
          weights: [[side > 0 ? 'lowerLegL' : 'lowerLegR', 1]],
        });
      }
    }

    /* tail: a ragged top edge plus a fan at the tip. The tail silhouette does the heaviest
       lifting of any shape on the character, so it gets the most tufts. */
    const spine = this._tailSpine, radius = this._tailRadius, isDark = this._tailIsDark;
    const n = spine.length;
    for (let i = 3; i < n - 2; i += 2) {
      const t = i / (n - 1);
      const c = spine[i];
      const tan = new THREE.Vector3().subVectors(spine[Math.min(n - 1, i + 1)], spine[Math.max(0, i - 1)]).normalize();
      for (const roll of [-2.5, -1.05, 0.0, 1.05, 2.5]) {
        if (Math.abs(roll) > 0.1 && i % 4 !== 0) continue;
        const up = new THREE.Vector3(Math.sin(roll) * 0.85, Math.cos(roll), 0).normalize();
        const side2 = new THREE.Vector3().crossVectors(tan, up).normalize();
        const outward = new THREE.Vector3().crossVectors(side2, tan).normalize();
        const base = c.clone().addScaledVector(outward, radius(t) * 0.92);
        put({
          base,
          dir: outward.clone().addScaledVector(tan, -0.55).normalize(),
          length: (0.070 + 0.034 * Math.sin(t * 7)) * TUNE.tailScale,
          width: 0.021 * TUNE.tailScale, bend: 0.25, bendDir: tan.clone().negate(),
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
    const tx = this.engine.get('textures');
    /**
     * Only *normal* maps are borrowed from TEXTURES, never albedo.
     *
     * A `map` multiplies the material colour, so an albedo from the shared library gets a
     * second, uncontrolled say in the character's hue — and hue is exactly what §2.1 makes
     * this file responsible for. The library's stone albedos are also currently the project's
     * biggest defect, and the last thing Sly needs is that violet landing on his fur. His own
     * detail maps below are authored near-white for the same reason.
     */
    this._shared = {};
    for (const name of ['fur_sly', 'fur_tail_rings', 'cloth_shirt_blue', 'leather_boot', 'gold_cane']) {
      let b = null;
      try { b = tx?.get?.(name) ?? null; } catch { b = null; }
      // Per AGENTS.md §4.4 textures.get() hands back a *bundle* of maps, not a texture.
      // Passing the bundle into a material slot makes three.js read `.matrix` off a plain
      // object and kills the frame mid-render, so unwrap the one slot we want.
      const n = b && !b.isTexture ? b.normalMap : (b?.isTexture ? null : null);
      this._shared[name] = n?.isTexture ? n : null;
    }
    // Own maps are always built: TEXTURES may be absent, and even when present it has no
    // reason to author strand-flow fur for one character.
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

  _matSpec(group) {
    const F = this._fur, C = this._cloth, M = this._metal, SH = this._shared;
    // Albedo is always ours (near-white detail); only the normal may come from TEXTURES.
    const nrm = (name, own) => SH[name] || own;
    switch (group) {
      case 'fur': return {
        color: PAL.furMid, map: F.detail, normalMap: nrm('fur_sly', F.normal),
        normalScale: 1.15, repeat: [3, 3], sss: TUNE.furSSS, rim: TUNE.rim,
        spec: 0.05, gloss: 10, detail: 'fur',
      };
      case 'furCream': return {
        color: PAL.cream, map: F.detail, normalMap: nrm('fur_sly', F.normal),
        normalScale: 1.05, repeat: [3, 3], sss: TUNE.furSSS + 0.06, rim: TUNE.rim * 0.9,
        spec: 0.04, gloss: 10, detail: 'fur',
      };
      case 'furDark': return {
        color: PAL.tailDark, map: F.detail, normalMap: nrm('fur_tail_rings', F.normal),
        normalScale: 1.25, repeat: [3, 3], sss: TUNE.furSSS * 0.6, rim: TUNE.rim * 1.15,
        spec: 0.06, gloss: 12, detail: 'fur',
      };
      case 'cloth': return {
        color: PAL.shirt, map: C.detail, normalMap: nrm('cloth_shirt_blue', C.normal),
        normalScale: 0.75, repeat: [4, 4], sss: 0.14, rim: TUNE.rim * 0.85,
        spec: 0.10, gloss: 22, detail: 'cloth',
      };
      case 'clothDark': return {
        color: PAL.shirtDark, map: C.detail, normalMap: nrm('leather_boot', C.normal),
        normalScale: 0.85, repeat: [4, 4], sss: 0.10, rim: TUNE.rim * 0.95,
        spec: 0.18, gloss: 34, detail: 'cloth',
      };
      case 'gold': return {
        color: PAL.gold, map: M.detail, normalMap: nrm('gold_cane', M.normal),
        normalScale: 0.7, repeat: [2, 2], sss: 0.0, rim: 0.5,
        spec: 0.9, gloss: 96, metal: true, detail: 'metal',
      };
      case 'ink': return {
        color: PAL.ink, sss: 0.0, rim: 0.30, spec: 0.05, gloss: 12, flat: true,
      };
      case 'eye': return {
        color: PAL.eyeWhite, sss: 0.0, rim: 0.22, spec: 0.55, gloss: 80, emissive: 0x2a2418,
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
    const goldMat = this._material('gold');
    const gripMat = this._material('grip') || null;
    void gripMat;
    const gripSpec = { color: 0xa83828, map: this._cloth.detail, normalMap: this._cloth.normal, repeat: [3, 3], sss: 0.12, rim: 0.45, spec: 0.12, gloss: 20 };
    let grip;
    const shading = this.engine.get('shading');
    if (shading?.toon) {
      try {
        grip = shading.toon({
          color: gripSpec.color, map: gripSpec.map, normalMap: gripSpec.normalMap,
          bands: TUNE.bands, rim: gripSpec.rim, rimColor: TUNE.rimColor,
          spec: gripSpec.spec, gloss: gripSpec.gloss, sss: gripSpec.sss, outline: 1.0,
          skinning: false, vertexColors: true, side: THREE.FrontSide,
        });
        if (grip) { this._applyRepeat(gripSpec, grip); this._materials.push(grip); }
      } catch { grip = null; }
    }
    if (!grip) grip = this._fallbackMaterial('grip', gripSpec);

    this.cane = new Cane(this.engine).build([goldMat, grip]);

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

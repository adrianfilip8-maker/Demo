/**
 * SlyModelGodot — the character mesh from the Godot fan project, bound to RIG3.  `?char=godot`
 *
 * Imported at the project owner's explicit instruction ("be sure to use the character model from
 * <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>"). Provenance, licence status and the
 * import tool are in `public/assets/sly-godot/PROVENANCE.md`; `tools/godot2rig.mjs` rebuilds the
 * asset and `tests/godot.test.mjs` guards its structure.
 *
 * This follows `SlyModelDLRig`, which is the established way a foreign mesh joins this engine's
 * animation system: keep the artist's geometry and skin weights, re-express those weights over
 * RIG3's bones, and carry the mesh from the source bind pose into ours. Driving the source's own
 * 174-bone hierarchy instead would need a full retarget layer and would leave every clip, spring,
 * shot and guard interaction to be rewritten.
 *
 * ── WHAT IS DIFFERENT ABOUT THIS ASSET, and what each difference forced ──────────────────
 *
 * 1. **The bone map is not guessed.** The source project ships `Assets/Bone Maps/sly_bone_map.tres`
 *    — Godot's own humanoid retarget table, in a text format — and it is the authority for the
 *    torso, where a name-based guess is wrong: `Hips` is **`spine.001`**, not the bone actually
 *    called `Hips_Center`. `Hips_Center` carries no skin weight and is not in the tail of the
 *    hierarchy at all. Guessing by name would have hung the whole character off a dead bone.
 *
 * 2. **Only 7 of the 21 meshes are skinned.** Teeth, eyes, hat, belt and cane are plain meshes
 *    parented to bone NODES and follow the skeleton by hierarchy, not by weights. They are given a
 *    rigid weight to whichever RIG3 bone their parent joint resolves to, or they would be left
 *    behind at the origin — a failure that looks like missing geometry, not like a rigging bug.
 *
 * 3. **`GLTFLoader` renames every bone.** `PropertyBinding.sanitizeNodeName` strips the dot in
 *    r185, so `spine.001` arrives as `spine001` and `shoulder.L` as `shoulderL` — which then
 *    COLLIDES with RIG3's own `shoulderL`. The map below is written in source form and resolved
 *    through a tolerant matcher (`mixamo2clips`'s lesson: its first run mapped 0 of 21 bones and
 *    only said so because it printed the count). The count is asserted at load here for the same
 *    reason: a silent partial map produces a character that is wrong but plausible.
 *
 * 4. **The tail is real geometry on eight joints**, and this is the one thing the shipped character
 *    still lacks (§226 — the tail rebuild went into `SlyModel3`, which does not ship). Godot itself
 *    deletes this tail on import and plays a physics chain instead; we keep it, because RIG3 has
 *    `tailA..tailD` and a procedural spring, which is the same idea in our engine. The eight source
 *    joints are spread over our four by ARC POSITION with a linear blend at the boundaries, so the
 *    artist's falloff survives as a smooth blend rather than four rigid blocks.
 *
 * 5. **Five facial blendshapes survive as live morph targets.** The face carries Angry, Smarmy,
 *    Purse, Blink and Gasp. The three meshes with a non-zero authored weight are baked (they are
 *    the character's rest shape, not an expression); the face's five stay drivable, and `Blink` is
 *    driven on a timer — this character could not blink before.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from './SlyModel3.js';
import { Cane, CANE_TUNE } from './Cane.js';

/* Served from `public/`, so the two 2048² albedos resolve beside the .glb by URI exactly as
   `assets/kaykit/` does — nothing is fetched from off-site and the build stays self-contained. */
const BASE = 'assets/sly-godot/';

/**
 * Source joint -> RIG3 bone, from `Assets/Bone Maps/sly_bone_map.tres` where that file has an
 * opinion, and by arc position along the chain where it does not (it is silent on the tail, and
 * deliberately empty on all thirty finger entries).
 *
 * `UpperChest` (`spine.004`) folds into `chest` because RIG3 has one chest bone. Everything absent
 * — the whole face rig, the fingers, the IK controls, the hat and ear bones — folds into its
 * nearest mapped ancestor, so its influence is kept rather than dropped.
 *
 * JAW, EARS AND BROWS ARE DELIBERATELY ABSENT, and that is a decision rather than an oversight.
 * RIG3 has `jaw`, `earL`, `earR`, `capBrim` and `browL/R`, and mapping the source's like-named
 * joints onto them looked tidy and is wrong twice: our clips drive `jaw` with motion authored for
 * the procedural model's small jaw blob, which smears this muzzle (`SlyModelDLRig` measured that
 * and reverted it), and our detail-bone BIND POSITIONS were derived for a procedural head, so
 * anchoring the artist's ears and cap there would move authored geometry to fit a placeholder.
 * The whole skull rides `head` rigidly, which is what a well-authored head should do.
 */
const BONE_MAP = {
  'spine.001': 'hips',                      // bone_map/Hips — NOT `Hips_Center`
  'spine.002': 'spine',                     // bone_map/Spine
  'spine.003': 'chest', 'spine.004': 'chest', // bone_map/Chest + UpperChest
  'spine.005': 'neck',                      // bone_map/Neck
  face: 'head',                             // bone_map/Head
  'shoulder.L': 'shoulderL', 'upper_arm.L': 'upperArmL', 'forearm.L': 'lowerArmL', 'hand.L': 'handL',
  'shoulder.R': 'shoulderR', 'upper_arm.R': 'upperArmR', 'forearm.R': 'lowerArmR', 'hand.R': 'handR',
  'thigh.L': 'upperLegL', 'shin.L': 'lowerLegL', 'foot.L': 'footL', 'toe.L': 'toeL',
  'thigh.R': 'upperLegR', 'shin.R': 'lowerLegR', 'foot.R': 'footR', 'toe.R': 'toeR',
};

/**
 * The tail, which the bone map has nothing to say about.
 *
 * The source chain runs `Tail.001 → Tail.008 → Tail.007 → … → Tail.002` (the numbering descends
 * down the tail, which is the sort of thing that has to be read out of the hierarchy rather than
 * assumed). `Tail.001` sits INSIDE the pelvis at z = +0.026 in our units — it is the chain's root
 * control, not the first joint on the surface — so `tailA` anchors on `Tail.008`, the first joint
 * the tail's own geometry is built around.
 *
 * Each source joint is placed at its normalised ARC position along `Tail.008 → Tail.002` and its
 * weight is split linearly between the two RIG3 tail joints it falls between. A hard assignment
 * gives four rigid blocks with a crease at each boundary; this is the same smooth-falloff argument
 * `SlyModelDLRig` makes for its twelve-onto-four collapse, done explicitly.
 */
const TAIL_SRC = ['Tail.001', 'Tail.008', 'Tail.007', 'Tail.006', 'Tail.005', 'Tail.004', 'Tail.003', 'Tail.002'];
const TAIL_OURS = ['tailA', 'tailB', 'tailC', 'tailD'];
/* Which source joint each of ours takes its BIND POSITION from — a different question from whose
   influence it carries, and conflating the two cost `SlyModelDLRig` a 60 % stretch in its tail
   root. Chosen by arc: ours sit at 0, 0.351, 0.697, 1.000 along the chain and these four sit at
   0, 0.333, 0.667, 1.000. */
const TAIL_ANCHOR = { tailA: 'Tail.008', tailB: 'Tail.006', tailC: 'Tail.004', tailD: 'Tail.002' };

/** Right/left digit chains, for the grip. Three phalanges per finger on this rig, not four. */
const DIGITS = (s) => ({
  index: [`f_index.01.${s}`, `f_index.02.${s}`, `f_index.03.${s}`],
  mid: [`f_middle.01.${s}`, `f_middle.02.${s}`, `f_middle.03.${s}`],
  ring: [`f_ring.01.${s}`, `f_ring.02.${s}`, `f_ring.03.${s}`],
  pinky: [`f_pinky.01.${s}`, `f_pinky.02.${s}`, `f_pinky.03.${s}`],
  thumb: [`thumb.01.${s}`, `thumb.02.${s}`, `thumb.03.${s}`],
});

/**
 * Degrees of flexion at each phalanx.
 *
 * Measured before this was written, not tuned afterwards: every digit on this rig is DEAD STRAIGHT
 * in bind — base-to-tip straightness 0.977 (index) to 0.998 (thumb) — so the hands are four rigid
 * prongs and a thumb, exactly the "splayed rake fingers" the blind critic logged against the
 * shipped model in §202. RIG3 has no finger bones, so the twenty joints per hand collapse into
 * `handL`/`handR` and can never curl at runtime; this is the last moment the fix is possible and
 * it costs nothing after load. The profile is `SlyModelDLRig`'s, which was derived against a
 * comparable glove and is reused rather than re-guessed.
 */
const CURL = { finger: [24, 36, 30], thumb: [16, 22] };

/** `?godot=` levers, read at module load because a capture harness cannot poke them after boot. */
function modeFlags() {
  let raw = '';
  try {
    if (typeof location !== 'undefined' && location.search) raw = new URLSearchParams(location.search).get('godot') || '';
    if (!raw && typeof globalThis !== 'undefined' && globalThis.__GODOT_AB != null) raw = String(globalThis.__GODOT_AB);
  } catch { /* plain-module hosts have no location; that is the offline path */ }
  const t = new Set(String(raw).split(/[,\s]+/).filter(Boolean));
  return {
    /* the calibration lever for the grip: leave the fingers in their authored T-pose rake. */
    openHand: t.has('open'),
    /* freeze the eyelids open, so a blink capture has a null arm that cannot blink. */
    noBlink: t.has('noblink'),
  };
}
const MODE = modeFlags();

/* GLTFLoader rewrites node names (see the header). Try each plausible sanitisation. */
const VARIANTS = (s) => [s, s.replace(/\./g, ''), s.replace(/\./g, '_'), s.replace(/[\s.:/[\]]/g, '_')];

/** Material name -> which of the two albedos it samples, established from the glTF's own graph. */
const PART_TEX = { BodyMat: 'body', HeadMat: 'head', EyeMat: 'head', CaneMat: 'head' };
const FALLBACK = { BodyMat: 0x2f5fc4, HeadMat: 0xcfcdc4, EyeMat: 0xf2f0ea, CaneMat: 0xd9a521 };

/**
 * The cane socket, in `handR`'s local space.
 *
 * Taken from `SlyModel3`, whose cane is authored against RIG3's own `handR` bind position — and
 * that is legitimate here rather than a borrowed constant, because the retarget puts this model's
 * palm centre exactly on that joint: measured in source bind space the palm centroid is
 * (-0.390, 0.883, 0.082) against `hand.R` at (-0.390, 0.884, 0.082), i.e. 1 mm apart.
 */
const CANE_SOCKET = { off: new THREE.Vector3(-0.014, -0.042, 0.014), top: new THREE.Vector3(-0.020, 0.550, 0.090) };

/** Least-squares circle through 2-D points (Kåsa). Returns {cx, cy, r, rms}. */
function circleFit(pts) {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c] || 1e-12;
    for (let j = c; j < 4; j++) m[c][j] /= d;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let j = c; j < 4; j++) m[r][j] -= f * m[c][j];
    }
  }
  const cx = m[0][3] / 2, cy = m[1][3] / 2;
  const r = Math.sqrt(Math.max(1e-9, m[2][3] + cx * cx + cy * cy));
  let s = 0;
  for (const [x, y] of pts) s += (Math.hypot(x - cx, y - cy) - r) ** 2;
  return { cx, cy, r, rms: Math.sqrt(s / n) };
}

export class SlyModel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'slygodot';
    this.bones = {};
    this.boneNames = RIG3.BONE_ORDER;
    this.mesh = null;          // body/eyes/tail/props — one geometry, material groups
    this.face = null;          // the head, kept separate so its five morphs cost 5k verts not 30k
    this.cane = null;
    this._bindWorld = {};
    this._restQ = {};
    this._disposables = [];
    /* what the load actually read and decided — the tests and the report assert on this */
    this.info = { joints: 0, mapped: 0, weightMapped: 0, tris: 0, scale: 1, morphs: [] };
    this._blink = { t: 0, next: 2.4 + Math.random() * 2.6, idx: -1 };
  }

  /**
   * @param {{gltf?: object}} [pre] offline callers hand in an already-parsed GLTF so the whole
   *   build can be measured without a browser, a network or the capture lock.
   */
  async init(pre = null) {
    /* Offline callers hand in a parsed GLTF and have no image decoder, so they also skip the two
       albedos. Nothing else about the build differs, which is what makes the offline measurement
       a measurement of the shipped path rather than of a second implementation of it. */
    this._noTex = !!pre?.noTextures;
    /* ---- 1. the project skeleton ------------------------------------------------------- */
    const abs = {};
    for (const [name, parent, p] of RIG3.SKELETON) {
      const b = new THREE.Bone();
      b.name = name;
      const parAbs = parent === 'root' ? [0, 0, 0] : abs[parent];
      b.position.set(p[0] - parAbs[0], p[1] - parAbs[1], p[2] - parAbs[2]);
      abs[name] = p;
      (parent === 'root' ? this.root : this.bones[parent]).add(b);
      this.bones[name] = b;
      this._bindWorld[name] = new THREE.Vector3(p[0], p[1], p[2]);
    }
    const boneList = RIG3.BONE_ORDER.map((n) => this.bones[n]);
    const skeleton = new THREE.Skeleton(boneList);

    /* ---- 2. the asset ------------------------------------------------------------------- */
    const gltf = pre?.gltf || await new GLTFLoader().setPath(BASE).loadAsync('sly-godot.glb');
    const src = gltf.scene;
    src.updateMatrixWorld(true);

    const meshes = [];
    src.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const skinned = meshes.filter((m) => m.isSkinnedMesh);
    if (!skinned.length) throw new Error('SlyModelGodot: the glb carries no skinned mesh');
    const srcSkel = skinned[0].skeleton;
    this.info.joints = srcSkel.bones.length;

    /* source bind world positions, from the inverse bind matrices — authoritative, and independent
       of whatever pose the file happens to be left in. */
    const srcWorld = {};
    {
      const m4 = new THREE.Matrix4();
      srcSkel.bones.forEach((b, i) => {
        m4.copy(srcSkel.boneInverses[i]).invert();
        srcWorld[b.name] = new THREE.Vector3().setFromMatrixPosition(m4);
      });
    }
    const have = new Set(srcSkel.bones.map((b) => b.name));
    /** source name (canonical, dotted) -> the name this file actually uses */
    const N = (s) => VARIANTS(s).find((v) => have.has(v)) || null;

    /* ---- 3. joint -> RIG3, with the tail blended by arc position ------------------------ */
    /* `share` is a list of [RIG3 bone index, fraction]; only the tail ever has two entries. */
    const map = new Map();
    for (const [s, ours] of Object.entries(BONE_MAP)) {
      const n = N(s);
      if (n) map.set(n, [[RIG3.BONE_ORDER.indexOf(ours), 1]]);
    }
    {
      /* normalised arc position of each source tail joint along Tail.008 -> Tail.002, and of each
         of ours along tailA -> tailD, both measured from the rigs rather than assumed. */
      const arcOf = (names, pos) => {
        const cum = [0];
        for (let i = 1; i < names.length; i++) cum.push(cum[i - 1] + pos(names[i]).distanceTo(pos(names[i - 1])));
        const span = cum[cum.length - 1] || 1;
        return cum.map((c) => c / span);
      };
      const chain = TAIL_SRC.slice(1).map(N).filter(Boolean);          // Tail.008 … Tail.002
      if (chain.length === TAIL_SRC.length - 1) {
        const sA = arcOf(chain, (n) => srcWorld[n]);
        const oA = arcOf(TAIL_OURS, (n) => new THREE.Vector3(...abs[n]));
        const place = (a) => {
          let hi = oA.findIndex((v) => v >= a);
          if (hi <= 0) return [[RIG3.BONE_ORDER.indexOf(TAIL_OURS[0]), 1]];
          if (hi < 0) return [[RIG3.BONE_ORDER.indexOf(TAIL_OURS[TAIL_OURS.length - 1]), 1]];
          const lo = hi - 1;
          const f = (a - oA[lo]) / Math.max(1e-9, oA[hi] - oA[lo]);
          return [[RIG3.BONE_ORDER.indexOf(TAIL_OURS[lo]), 1 - f], [RIG3.BONE_ORDER.indexOf(TAIL_OURS[hi]), f]];
        };
        chain.forEach((n, i) => map.set(n, place(sA[i])));
        const root = N(TAIL_SRC[0]);                                    // Tail.001, the pelvis control
        if (root) map.set(root, [[RIG3.BONE_ORDER.indexOf('tailA'), 1]]);
      } else {
        this.engine?.warn?.(`SlyModelGodot: only ${chain.length}/7 tail joints found — the tail will be rigid`);
      }
    }
    /* fold every unmapped joint into its nearest mapped ancestor */
    const resolve = (bone) => {
      for (let b = bone; b; b = b.parent) {
        if (b.name && map.has(b.name)) return map.get(b.name);
        if (!b.isBone) break;
      }
      return null;
    };
    const share = srcSkel.bones.map(resolve);
    this.info.mapped = share.filter(Boolean).length;
    const HIPS = RIG3.BONE_ORDER.indexOf('hips');
    /* An unresolved joint is an IK/pole control with no skin weight on this rig; sending it to
       `hips` keeps any stray influence attached to the body rather than dropping it. */
    for (let i = 0; i < share.length; i++) if (!share[i]) share[i] = [[HIPS, 1]];
    /* §mixamo: a silently half-resolved map produces a character that is wrong but plausible. */
    if (this.info.mapped < 100) {
      throw new Error(`SlyModelGodot: only ${this.info.mapped}/${srcSkel.bones.length} joints resolved — `
        + 'the bone-name sanitisation changed and BONE_MAP no longer matches the asset');
    }

    /* ---- 4. geometry into one space, morphs baked or carried --------------------------- */
    const geos = [], mats = [], faceGeo = { geo: null, morphs: null, names: null, weights: null };
    let tris = 0;
    for (const o of meshes) {
      if (/cane/i.test(o.name)) continue;                 // see _buildCane: the source cane is parked
      let g = o.geometry.clone();
      const isFace = !!(o.morphTargetInfluences?.length >= 5);
      const lin = new THREE.Matrix3().setFromMatrix4(o.matrixWorld);

      /* Morph deltas are relative (glTF always is) and this file's five carriers are checked by
         `tests/godot.test.mjs`. Everything except the face is baked at its AUTHORED weight: two of
         them ship at a full 1.0 and are the character's rest shape, not an expression, so dropping
         them would render a mesh the source game never displays. */
      const mt = g.morphAttributes?.position || [];
      if (mt.length && !isFace) {
        const p = g.attributes.position;
        for (let k = 0; k < mt.length; k++) {
          const w = o.morphTargetInfluences[k] || 0;
          if (!(Math.abs(w) > 1e-6)) continue;
          for (let i = 0; i < p.count; i++) {
            p.setXYZ(i, p.getX(i) + w * mt[k].getX(i), p.getY(i) + w * mt[k].getY(i), p.getZ(i) + w * mt[k].getZ(i));
          }
        }
      }

      /* Indices are KEPT. Every primitive in this file has them, and the face's five morph deltas
         are per-vertex: expanding 5,092 vertices to 25,944 would take the morph payload from
         305 KB to 1.6 MB for nothing. (`SlyModelDLRig` flattens because its FBX needs a
         non-finite-triangle sweep that only works per triangle; this asset has none.) */
      g.applyMatrix4(o.matrixWorld);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();

      /* Rigid weights for the fourteen unskinned meshes — teeth, eyes, hat, belt. They follow the
         source skeleton by NODE PARENTAGE, so without this they would be left at the origin. */
      if (!o.isSkinnedMesh) {
        let bone = o.parent;
        while (bone && !bone.isBone) bone = bone.parent;
        const idx = bone ? srcSkel.bones.findIndex((b) => b === bone || b.name === bone.name) : -1;
        const n = g.attributes.position.count;
        const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4] = Math.max(0, idx); sw[i * 4] = 1; }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        if (idx < 0) this.engine?.warn?.(`SlyModelGodot: ${o.name} hangs off no bone — pinned to hips`);
      }
      for (const k of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      }
      /* both, not just the attributes: `mergeGeometries` refuses a set whose `morphTargetsRelative`
         flags disagree, and the five morph carriers arrive with it true. */
      g.morphAttributes = {};
      g.morphTargetsRelative = false;
      tris += g.attributes.position.count / 3;

      if (isFace) {
        /* The face keeps its five targets. Deltas are DIRECTIONS, so only the linear part of every
           later transform applies to them — translation cancels in a difference. */
        faceGeo.geo = g;
        faceGeo.names = Object.keys(o.morphTargetDictionary || {});
        faceGeo.weights = o.morphTargetInfluences.slice();
        faceGeo.morphs = mt.map((a) => {
          const out = new THREE.Float32BufferAttribute(new Float32Array(a.count * 3), 3);
          const v = new THREE.Vector3();
          for (let i = 0; i < a.count; i++) { v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix3(lin); out.setXYZ(i, v.x, v.y, v.z); }
          return out;
        });
        faceGeo.mat = o.material?.name || 'HeadMat';
      } else {
        geos.push(g);
        mats.push(o.material?.name || 'BodyMat');
      }
    }
    if (!faceGeo.geo) throw new Error('SlyModelGodot: the face mesh (5 morph targets) is missing');
    this.info.tris = Math.round(tris);
    this.info.morphs = faceGeo.names;

    /* ---- 5. close the hands, while the finger bones still exist ------------------------- */
    const gripSrc = this._curlHands([...geos, faceGeo.geo], srcSkel, srcWorld, N);

    /* ---- 6. normalise: soles on the floor, uniform scale to the engine's character height */
    /* Every character in this engine is normalised to `RIG3.TUNE.height`; `SlyModelDLRig` does the
       same to its own 185-unit FBX. This mesh measures 1.6607 m, so the factor is 1.084 — and
       because it is UNIFORM, the asset's proportions are untouched: 6.18 heads before and after.
       The alternative, moving `Controller.TUNE.height`, changes the collision capsule, the camera
       framing and every guard sightline for all six characters, which is not a change one model
       gets to make. */
    const all = [...geos, faceGeo.geo];
    const box = new THREE.Box3();
    for (const g of all) { g.computeBoundingBox(); box.union(g.boundingBox); }
    if (!Number.isFinite(box.min.y) || !(box.max.y > box.min.y)) throw new Error('SlyModelGodot: degenerate bounding box');
    const yOff = -box.min.y;
    const rawH = box.max.y - box.min.y;

    /* Where each RIG3 bone's source joint sits, for a given scale. */
    const srcPosFor = (s) => {
      const out = {};
      const put = (ours, n) => { out[ours] = srcWorld[n].clone().setY(srcWorld[n].y + yOff).multiplyScalar(s); };
      for (const [src, ours] of Object.entries(BONE_MAP)) { const n = N(src); if (n && !out[ours]) put(ours, n); }
      for (const [ours, src] of Object.entries(TAIL_ANCHOR)) { const n = N(src); if (n) put(ours, n); }
      return out;
    };

    /**
     * THE SCALE IS SOLVED, NOT ASSUMED — and this is the whole of the height question.
     *
     * The obvious normalisation is `S = height / bbox`, which is what every model here does, and
     * for this asset it is 1.0839. It is also **wrong by 5 cm**, because it sizes the mesh BEFORE
     * the retarget and the retarget then moves the crown: RIG3's `head` joint sits proportionally
     * lower than this rig's, so the skull lands 5.5 cm below where the bbox said it would and the
     * finished character measures **1.7506 m** against a 1.80 m collision capsule. Nothing in the
     * naive version reports that; it is only visible if you measure the output instead of the input.
     *
     * The fix is exact rather than iterative, because the baked height is AFFINE in `S`. A baked
     * vertex is `Σ w·(abs + q·sc·S·(p_raw − src_raw))`, and for a conforming limb `sc = l_ours /
     * (S · l_raw)`, so that term loses its `S` entirely while the non-conforming torso keeps it.
     * Two evaluations therefore determine the line and one solve lands the target. The correction
     * is clamped: a solve that wants to move the scale by more than a quarter means the model is
     * not what this file thinks it is, and silently obeying it would be worse than being 5 cm short.
     *
     * What this deliberately does NOT do is move `Controller.TUNE.height`. That number is the
     * collision capsule, the camera framing and every guard sightline for all six characters; one
     * imported model does not get to change it, and a uniform scale costs nothing in proportion —
     * the asset's 6.18 heads are 6.18 heads at any scale.
     */
    const bakedHeightAt = (s) => {
      const P = srcPosFor(s);
      const B = this._bakeMatrices(P, abs);
      let lo = Infinity, hi = -Infinity;
      const v = new THREE.Vector3(), t = new THREE.Vector3();
      for (const g of all) {
        const pos = g.attributes.position, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
        for (let i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i) + yOff, pos.getZ(i)).multiplyScalar(s);
          let y = 0;
          for (let k = 0; k < 4; k++) {
            const w = sw[i * 4 + k];
            if (w > 0) y += w * t.copy(v).applyMatrix4(B.M[share[si[i * 4 + k]][0][0]]).y;
          }
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      }
      return hi - lo;
    };
    const S0 = RIG3.TUNE.height / rawH;
    const h0 = bakedHeightAt(S0), h1 = bakedHeightAt(S0 * 1.05);
    const slope = (h1 - h0) / (S0 * 0.05);
    let S = Number.isFinite(slope) && Math.abs(slope) > 1e-6 ? S0 + (RIG3.TUNE.height - h0) / slope : S0;
    S = Math.min(S0 * 1.25, Math.max(S0 * 0.8, S));
    this.info.scale = S;
    this.info.naiveScale = S0;
    this.info.naiveHeight = h0;
    /* the fist's measured inner radius, carried into project metres by the same uniform factor */
    const gripR = Math.min(0.05, Math.max(0.012, gripSrc * S));
    this.info.gripR = gripR;
    for (const g of all) { g.translate(0, yOff, 0); g.scale(S, S, S); }
    for (const a of faceGeo.morphs) {
      for (let i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * S, a.getY(i) * S, a.getZ(i) * S);
    }
    const srcP = srcPosFor(S);
    this._srcP = srcP; this._yOff = yOff; this._S = S;

    /* ---- 7. re-express the artist's weights over RIG3's bones --------------------------- */
    for (const g of all) {
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const n = g.attributes.position.count;
      const bidx = new Uint16Array(n * 4), bwt = new Float32Array(n * 4);
      const bucket = new Map();
      for (let i = 0; i < n; i++) {
        bucket.clear();
        for (let k = 0; k < 4; k++) {
          const w = sw.array[i * 4 + k];
          if (!(w > 0)) continue;
          for (const [ours, f] of share[si.array[i * 4 + k]]) bucket.set(ours, (bucket.get(ours) || 0) + w * f);
        }
        const top = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = top.reduce((s, e) => s + e[1], 0) || 1;
        for (let k = 0; k < 4; k++) {
          bidx[i * 4 + k] = top[k] ? top[k][0] : 0;
          bwt[i * 4 + k] = top[k] ? top[k][1] / sum : 0;
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bidx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bwt, 4));
    }

    /* ---- 8. carry the mesh from the source bind pose into ours -------------------------- */
    const { M, Q, rot } = this._bakeMatrices(srcP, abs);
    const L = M.map((m) => new THREE.Matrix3().setFromMatrix4(m));    // linear part, for deltas
    this._rot = rot; this._M = M;

    const p0 = new THREE.Vector3(), pa = new THREE.Vector3(), pt = new THREE.Vector3();
    const n0 = new THREE.Vector3(), na = new THREE.Vector3(), nt = new THREE.Vector3();
    for (const g of all) {
      const pos = g.attributes.position, nrm = g.attributes.normal;
      const bidx = g.attributes.skinIndex.array, bwt = g.attributes.skinWeight.array;
      const isFace = g === faceGeo.geo;
      for (let i = 0; i < pos.count; i++) {
        p0.fromBufferAttribute(pos, i); pa.set(0, 0, 0);
        n0.fromBufferAttribute(nrm, i); na.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = bwt[i * 4 + k];
          if (!(w > 0)) continue;
          pa.addScaledVector(pt.copy(p0).applyMatrix4(M[bidx[i * 4 + k]]), w);
          na.addScaledVector(nt.copy(n0).applyQuaternion(Q[bidx[i * 4 + k]]), w);
        }
        pos.setXYZ(i, pa.x, pa.y, pa.z);
        if (na.lengthSq() > 1e-12) { na.normalize(); nrm.setXYZ(i, na.x, na.y, na.z); }
        if (!isFace) continue;
        for (const a of faceGeo.morphs) {
          p0.set(a.getX(i), a.getY(i), a.getZ(i)); pa.set(0, 0, 0);
          for (let k = 0; k < 4; k++) {
            const w = bwt[i * 4 + k];
            if (w > 0) pa.addScaledVector(pt.copy(p0).applyMatrix3(L[bidx[i * 4 + k]]), w);
          }
          a.setXYZ(i, pa.x, pa.y, pa.z);
        }
      }
      pos.needsUpdate = true; nrm.needsUpdate = true;
    }

    /* ---- 9. materials, meshes, skeleton ------------------------------------------------- */
    /* MERGED BY MATERIAL, not one group per source mesh. `mergeGeometries(geos, true)` emits a
       draw group per input, so the twenty non-face meshes would cost twenty draw calls against a
       twelve-call character budget — while carrying only THREE distinct materials between them.
       Same geometry, same materials, three calls. */
    const byMat = new Map();
    geos.forEach((g, i) => { (byMat.get(mats[i]) || byMat.set(mats[i], []).get(mats[i])).push(g); });
    const order = [...byMat.keys()];
    const perMat = order.map((k) => (byMat.get(k).length === 1 ? byMat.get(k)[0] : mergeGeometries(byMat.get(k), false)));
    if (perMat.some((g) => !g)) throw new Error('SlyModelGodot: per-material merge failed — parts disagree on attributes');
    const merged = perMat.length === 1 ? perMat[0] : mergeGeometries(perMat, true);
    if (!merged) throw new Error('SlyModelGodot: merge failed — parts disagree on attributes');
    this.mesh = new THREE.SkinnedMesh(merged, order.map((m) => this._material(m)));
    this.mesh.name = 'slygodot:body';

    faceGeo.geo.morphAttributes.position = faceGeo.morphs;
    faceGeo.geo.morphTargetsRelative = true;
    this.face = new THREE.SkinnedMesh(faceGeo.geo, this._material(faceGeo.mat));
    this.face.name = 'slygodot:face';
    this.face.morphTargetDictionary = Object.fromEntries(faceGeo.names.map((n, i) => [n, i]));
    this.face.morphTargetInfluences = faceGeo.weights.slice();
    this._blink.idx = faceGeo.names.indexOf('Blink');

    for (const m of [this.mesh, this.face]) {
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.root.add(m);
    }
    /**
     * Bind, and the order here is load-bearing.
     *
     * `new Skeleton(bones)` computes its inverses in the constructor, from `bone.matrixWorld` —
     * which is still identity on freshly created bones, because nothing has updated it yet. Those
     * inverses are garbage. `bind(skeleton)` with no matrix recomputes them (that is how
     * `SlyModelDLRig` gets correct ones), but TWO meshes share this skeleton and only one may own
     * that call, so the update and the recompute are done explicitly and both meshes then bind
     * against the same, already-correct, identity frame. `bindMode` stays Attached, so three keeps
     * `bindMatrixInverse` in step with the root's motion every frame.
     */
    this.root.add(boneList[0]);
    this.root.updateMatrixWorld(true);
    skeleton.calculateInverses();
    const bindMatrix = new THREE.Matrix4();       // geometry and bones share the root's own frame
    this.mesh.bind(skeleton, bindMatrix);
    this.face.bind(skeleton, bindMatrix);

    /* one ink system — the cel silhouette is what makes this read at gameplay distance */
    const shading = this.engine?.get?.('shading');
    shading?.outline?.(this.mesh, { thickness: 1 });
    shading?.outline?.(this.face, { thickness: 1 });

    this._buildCane(abs, gripR);

    this.root.userData.height = RIG3.TUNE.height;
    this.root.userData.artistWeights = true;
    this.root.updateMatrixWorld(true);
    for (const nm of RIG3.BONE_ORDER) this._restQ[nm] = this.bones[nm].quaternion.clone();
    this.engine?.scene?.add(this.root);
    this.engine?.warn?.(`SlyModelGodot: ${this.info.joints} source joints -> ${RIG3.BONE_ORDER.length} RIG3 bones `
      + `(${this.info.mapped} resolved), ${this.info.tris} tris, scale ${S.toFixed(4)}, `
      + `morphs [${this.info.morphs.join(', ')}], grip ${(gripR * 1000).toFixed(1)} mm`);
    this.engine?.emit?.('characterReady', this);
  }

  /**
   * Per-bone transform carrying source bind space into RIG3 bind space.
   *
   * Both refinements `SlyModelDLRig` paid for in captures are kept. A bone's ROTATION comes from
   * the next STRUCTURAL joint, never from a detail bone hanging off it — taking `head`'s from
   * `jaw` derived the whole skull from a small facial offset and shrank it to 0.70. And per-bone
   * SCALE is applied only where a LIMB must conform: applied to spine, neck or head it resizes
   * body parts to the ratio of two joint SPACINGS, which shrinks a skull by a fifth for no reason.
   */
  _bakeMatrices(srcP, abs) {
    const STRUCT = new Set([
      'hips', 'spine', 'chest', 'neck', 'head',
      'shoulderL', 'upperArmL', 'lowerArmL', 'handL', 'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
      'upperLegL', 'lowerLegL', 'footL', 'toeL', 'upperLegR', 'lowerLegR', 'footR', 'toeR',
      'tailA', 'tailB', 'tailC', 'tailD',
    ]);
    const CONFORMS = (nm) => /^(shoulder|upperArm|lowerArm|hand|upperLeg|lowerLeg|foot|toe|tail)/.test(nm);
    const structChild = {};
    for (const [nm, par] of RIG3.SKELETON) if (STRUCT.has(nm) && STRUCT.has(par) && !structChild[par]) structChild[par] = nm;
    const rot = {};
    for (const [nm, par] of RIG3.SKELETON) {
      const kid = structChild[nm];
      if (kid && srcP[nm] && srcP[kid]) {
        const dS = srcP[kid].clone().sub(srcP[nm]);
        const dO = new THREE.Vector3(...abs[kid]).sub(new THREE.Vector3(...abs[nm]));
        const lS = dS.length(), lO = dO.length();
        rot[nm] = (lS > 1e-6 && lO > 1e-6)
          ? { q: new THREE.Quaternion().setFromUnitVectors(dS.divideScalar(lS), dO.divideScalar(lO)), sc: CONFORMS(nm) ? lO / lS : 1 }
          : { q: new THREE.Quaternion(), sc: 1 };
      } else rot[nm] = rot[par] || { q: new THREE.Quaternion(), sc: 1 };
    }
    const M = RIG3.BONE_ORDER.map((nm) => {
      const r = rot[nm] || { q: new THREE.Quaternion(), sc: 1 };
      const from = srcP[nm] || new THREE.Vector3(...abs[nm]);
      return new THREE.Matrix4()
        .compose(new THREE.Vector3(...abs[nm]), r.q, new THREE.Vector3(r.sc, r.sc, r.sc))
        .multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
    });
    const Q = RIG3.BONE_ORDER.map((nm) => (rot[nm] ? rot[nm].q : new THREE.Quaternion()));
    return { M, Q, rot };
  }

  /** Material for one of the asset's four, on the cel shader when it is available. Deduped: the
   *  seven body meshes share one `BodyMat`, so they share one material and one draw call. */
  _material(name) {
    this._matCache ||= new Map();
    if (this._matCache.has(name)) return this._matCache.get(name);
    const T = RIG3.TUNE;
    const shading = this.engine?.get?.('shading');
    let map = null;
    const stem = PART_TEX[name];
    if (stem && !this._noTex) {
      map = new THREE.TextureLoader().load(`${BASE}sly-${stem}.png`);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      map.flipY = false;                 // glTF convention; the UVs were authored against it
      /* Every UV set in this asset lies inside [0,1] — measured, all 21 of them — so clamping is
         correct here. `SlyModelDLRig` needs RepeatWrapping because its tail runs V to 1.504; this
         tail does not, and repeating would be a silent no-op that hid a future authoring change. */
      this._disposables.push(map);
    }
    const opts = {
      name: `slygodot:${name}`, color: map ? 0xffffff : FALLBACK[name], map,
      bands: T.bands, rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
      outline: T.outline, outlineColor: T.outlineColor,
    };
    const m = shading?.make ? shading.make(opts) : new THREE.MeshStandardMaterial({ color: opts.color, map, roughness: 0.85 });
    this._disposables.push(m);
    this._matCache.set(name, m);
    return m;
  }

  /**
   * Close both gloves, in source bind space, on the artist's own finger bones.
   *
   * THE FLEX AXIS IS DERIVED, NOT TYPED IN, and that is what makes one sign work for both hands:
   * `palmWard` is the component of the thumb direction perpendicular to the fingers, and the thumb
   * is on the palm side by anatomy, so `cross(fingerDir, palmWard)` gives an axis whose positive
   * rotation curls inward on left and right alike with no mirrored special case.
   *
   * Returns the fitted internal radius of the right fist, which is what the cane's grip is sized
   * to. Sizing the hand to the cane instead would be the wrong way round — the glove is authored
   * art and the prop is ours.
   */
  _curlHands(geos, srcSkel, srcWorld, N) {
    let gripR = CANE_TUNE.gripR;
    for (const side of ['R', 'L']) {
      const D = DIGITS(side);
      const joints = {};
      let ok = true;
      for (const [d, chain] of Object.entries(D)) {
        joints[d] = chain.map(N);
        if (joints[d].some((n) => !n || !srcWorld[n])) ok = false;
      }
      if (!ok) { this.engine?.warn?.(`SlyModelGodot: hand ${side} has no finger chain — left open`); continue; }

      const cen = (a) => a.reduce((s, v) => s.add(v.clone()), new THREE.Vector3()).multiplyScalar(1 / a.length);
      const fingers = ['index', 'mid', 'ring', 'pinky'];
      const knuck = cen(fingers.map((f) => srcWorld[joints[f][0]]));
      const tipC = cen(fingers.map((f) => srcWorld[joints[f][2]]));
      const fingerDir = tipC.clone().sub(knuck).normalize();
      const thumbDir = srcWorld[joints.thumb[2]].clone().sub(srcWorld[joints.thumb[0]]).normalize();
      const palmWard = thumbDir.clone().addScaledVector(fingerDir, -thumbDir.dot(fingerDir));
      if (palmWard.lengthSq() < 1e-8) continue;
      palmWard.normalize();
      const axis = new THREE.Vector3().crossVectors(fingerDir, palmWard).normalize();

      /* per source-bone flexion matrix, by forward kinematics down each digit */
      const T = new Map();
      for (const [d, chain] of Object.entries(D)) {
        const deg = d === 'thumb' ? CURL.thumb : CURL.finger;
        let acc = new THREE.Matrix4();
        chain.forEach((raw, k) => {
          const n = joints[d][k];
          const th = MODE.openHand ? 0 : THREE.MathUtils.degToRad(deg[k] ?? 0);
          const p = srcWorld[n];
          const R = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)
            .multiply(new THREE.Matrix4().makeRotationAxis(axis, th))
            .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
          acc = acc.clone().multiply(R);
          T.set(srcSkel.bones.findIndex((b) => b.name === n), acc.clone());
        });
      }
      T.delete(-1);

      /* the vertices the curl will move, remembered so the fist can be measured afterwards */
      const digitVerts = [];
      const rot3 = new THREE.Matrix3();
      const v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3();
      for (const g of geos) {
        const pos = g.attributes.position, nrm = g.attributes.normal;
        const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
        if (!si || !sw) continue;
        for (let i = 0; i < pos.count; i++) {
          let onDigit = 0;
          for (let k = 0; k < 4; k++) if (sw.array[i * 4 + k] > 0.5 && T.has(si.array[i * 4 + k])) onDigit = 1;
          let touched = 0;
          for (let k = 0; k < 4; k++) if (sw.array[i * 4 + k] > 0 && T.has(si.array[i * 4 + k])) touched = 1;
          if (!touched) continue;
          v.fromBufferAttribute(pos, i); acc.set(0, 0, 0);
          for (let k = 0; k < 4; k++) {
            const w = sw.array[i * 4 + k];
            if (!(w > 0)) continue;
            const m = T.get(si.array[i * 4 + k]);
            acc.addScaledVector(m ? tmp.copy(v).applyMatrix4(m) : tmp.copy(v), w);
          }
          pos.setXYZ(i, acc.x, acc.y, acc.z);
          if (onDigit) digitVerts.push(acc.clone());
          /* normals follow the same blend, rotation only */
          v.fromBufferAttribute(nrm, i); acc.set(0, 0, 0);
          for (let k = 0; k < 4; k++) {
            const w = sw.array[i * 4 + k];
            if (!(w > 0)) continue;
            const m = T.get(si.array[i * 4 + k]);
            if (m) acc.addScaledVector(tmp.copy(v).applyMatrix3(rot3.setFromMatrix4(m)), w);
            else acc.addScaledVector(v, w);
          }
          if (acc.lengthSq() > 1e-12) { acc.normalize(); nrm.setXYZ(i, acc.x, acc.y, acc.z); }
        }
        pos.needsUpdate = true; nrm.needsUpdate = true;
      }

      if (side === 'R') {
        /* THE TUNNEL, measured rather than assumed.
         *
         * Fit a circle through the twelve curled finger joints, projected onto the plane normal to
         * the flexion axis — that circle is the bone line of the closed fist, not its inner
         * surface. The flesh between the two is then measured directly: the 10th percentile of the
         * digit vertices' distance from the fitted centre IS the inner wall of the fist, and that
         * is what the cane's grip has to fit. Taking the joint circle alone would size the grip to
         * the skeleton and put the shaft inside the fingers. */
        const e1 = new THREE.Vector3(1, 0, 0);
        if (Math.abs(e1.dot(axis)) > 0.9) e1.set(0, 1, 0);
        const u = new THREE.Vector3().crossVectors(axis, e1).normalize();
        const w2 = new THREE.Vector3().crossVectors(axis, u);
        const pts = [];
        for (const f of fingers) {
          for (let k = 0; k < 3; k++) {
            const p = srcWorld[joints[f][k]].clone();
            const m = T.get(srcSkel.bones.findIndex((b) => b.name === joints[f][k]));
            if (m) p.applyMatrix4(m);
            pts.push([p.dot(u), p.dot(w2)]);
          }
        }
        const fit = circleFit(pts);
        const rr = digitVerts
          .map((p) => Math.hypot(p.dot(u) - fit.cx, p.dot(w2) - fit.cy))
          .sort((a, b) => a - b);
        const inner = rr.length ? rr[Math.max(0, Math.floor(rr.length * 0.10))] : fit.r * 0.6;
        this.info.grip = { joints: fit.r, rms: fit.rms, inner, verts: rr.length };
        if (Number.isFinite(inner) && inner > 0) gripR = inner;
        /* The tunnel's own frame, in source bind space. The cane goes HERE, not at a constant:
           the fitted centre is where the closed fist actually has a hole, and `axis` is the axis
           the fingers curled about, so it is by construction the axis of the cylinder they grip.
           Sign chosen so the shaft rises — the character stands in bind pose, so +Y is up. */
        const centre = new THREE.Vector3()
          .addScaledVector(u, fit.cx).addScaledVector(w2, fit.cy)
          .addScaledVector(axis, srcWorld[N('hand.R')] ? srcWorld[N('hand.R')].dot(axis) : 0);
        this._grip = { centre, axis: axis.clone().multiplyScalar(axis.y >= 0 ? 1 : -1) };
      }
    }
    return gripR;
  }

  /**
   * The cane.
   *
   * THE SOURCE CANE IS NOT USED, and the reason is measurable rather than aesthetic: `Cane_LowPoly`
   * is a 1.31 m staff standing on the ground 0.65 m to the character's right in bind pose, held
   * there by `CaneBone.001` — a bone RIG3 does not have and no clip in this engine drives. Its
   * nearest vertex is 514–614 mm from the right hand's fingertips. Godot's own animations move that
   * bone; ours cannot. Drawing it would put a staff in mid-air beside him.
   *
   * `Cane.js` is socketed to `handR` in its place, which is what both other rigged characters do,
   * is what `Animation.js`'s cane-pivot path expects, and whose crook is a sampled 192° arc rather
   * than a mitred polyline.
   */
  _buildCane(abs, gripR) {
    const socket = new THREE.Group();
    socket.name = 'caneSocket';
    const hi = RIG3.BONE_ORDER.indexOf('handR');
    const M = this._M[hi];
    const q = (this._rot?.handR?.q) || new THREE.Quaternion();
    /* the measured tunnel, carried through the same normalise + retarget the mesh took */
    let off = CANE_SOCKET.off.clone(), up = CANE_SOCKET.top.clone().sub(CANE_SOCKET.off).normalize();
    if (this._grip) {
      off = this._grip.centre.clone().setY(this._grip.centre.y + this._yOff).multiplyScalar(this._S)
        .applyMatrix4(M).sub(new THREE.Vector3(...abs.handR));
      up = this._grip.axis.clone().applyQuaternion(q).normalize();
      if (up.y < 0) up.negate();
      this.info.socket = { off: off.toArray(), up: up.toArray() };
    }
    socket.position.copy(off);
    const fw = new THREE.Vector3(0, 0, 1);
    fw.addScaledVector(up, -fw.dot(up));
    if (fw.lengthSq() < 1e-6) fw.set(1, 0, 0).addScaledVector(up, -up.x);
    fw.normalize();
    const rt = new THREE.Vector3().crossVectors(up, fw).normalize();

    this.cane = new Cane(this.engine, { tune: { gripR } });
    const shading = this.engine?.get?.('shading');
    const gold = shading?.make
      ? shading.make({
        name: 'slygodot:cane', color: 0xe8b942, vertexColors: true,
        bands: RIG3.TUNE.bands, rim: RIG3.TUNE.rim, rimColor: RIG3.TUNE.rimColor,
        outline: RIG3.TUNE.outline, outlineColor: RIG3.TUNE.outlineColor,
      })
      : new THREE.MeshStandardMaterial({ color: 0xe8b942, vertexColors: true, metalness: 0.85, roughness: 0.3 });
    this.cane.build([gold]);
    this._caneMaterial = gold;
    socket.add(this.cane.object);
    this.bones.handR.add(socket);
    this._caneSocket = socket;
    shading?.outline?.(this.cane.mesh, { thickness: 1.25 });
  }

  bp(name) { return this._bindWorld[name]; }

  /**
   * A blink.
   *
   * The only thing this model animates that the rig does not: `Blink` is a face blendshape and RIG3
   * has no eyelid bone, so nothing in `Rig`/`Animation` can reach it. Two closes 60–140 ms apart on
   * a 3–6 s cycle is the human pattern; the point is that the eyes are not glass.
   * `?godot=noblink` is the null arm — same build, eyelids frozen open.
   */
  update(dt = 0) {
    const inf = this.face?.morphTargetInfluences;
    const i = this._blink.idx;
    if (!inf || i < 0 || MODE.noBlink) return;
    const b = this._blink;
    b.t += dt;
    if (b.t >= b.next) { b.t = 0; b.next = 2.6 + Math.random() * 3.2; }
    /* one 0.13 s close, and a shorter second one a beat later */
    const w = (t, at, len) => (t < at || t > at + len ? 0 : Math.sin(((t - at) / len) * Math.PI));
    inf[i] = Math.min(1, w(b.t, 0, 0.13) + 0.7 * w(b.t, 0.20, 0.09));
  }

  dispose() {
    for (const m of [this.mesh, this.face]) {
      if (!m) continue;
      m.geometry?.dispose?.();
      this.root.remove(m);
    }
    this.cane?.dispose?.();
    for (const d of this._disposables) d?.dispose?.();
    this._disposables.length = 0;
    this.engine?.scene?.remove(this.root);
  }
}

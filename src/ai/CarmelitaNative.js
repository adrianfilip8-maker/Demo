import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { atlasOf, INTERIOR, CARMELITA_HEAD, CARMELITA_ASSET } from './CarmelitaGuard.js';

/**
 * CarmelitaNative — Carmelita's own rig, her own skin weights, her own clips. §704.
 *
 * The owner, in full: *"Try to import the character again, using the source rig and animations
 * rather than trying to modify them. For now, leave the vision cone, alert ladder, and guard
 * interaction untouched."*
 *
 * So: **no `BONE_MAP`, no bind transfer, no `RIGID_WITH` rigid carry, no retarget.** Her 199-joint
 * skeleton is instantiated as authored, her skin weights are copied unchanged, and her eleven
 * clips are played by `THREE.AnimationMixer` against her own node names. What this file does is
 * *mount* that character — merge her meshes so the garrison stays inside its draw budget, size her
 * to the level, and sit her on the floor. Everything it does is a mount decision; none of it is a
 * change to the rig.
 *
 * `src/ai/CarmelitaGuard.js` — the RIG3 rebind — is untouched and still the default. This is the
 * other arm of a one-token A/B (`TUNE.carmelitaNative`, `?carm=native` / `?carm=rebind`), the same
 * shape as `?char=dlraw`/`?char=dl` and `GUARD_TUNE.carmelitaTex`.
 *
 * ── why this can work at all, which was not obvious and was measured first ───────────────────
 * The rebind exists because the clips were believed to need RIG3's bind. Three facts, each
 * measured before a line of this file was written, say the native path needs nothing of the kind:
 *
 *   1. **The rest pose IS the bind pose.** `boneWorld · boneInverse` deviates from the identity by
 *      at most **2.4e-6** across all 199 joints; 0 of 199 exceed 1e-4. The GLB's `bindMatrix` is
 *      the identity and its `bindMode` is `attached`. So the character draws correctly at rest
 *      with no transfer of any kind — which is precisely what the rebind was reconstructing, badly
 *      (§702: 194 of 199 bind matrices carrying >1° of rotation that nothing put back).
 *   2. **`carmelita-guard.glb` and `carmelita-anims.glb` are the same rig.** Their 199 bones are
 *      listed in the same ORDER, every inverse-bind matrix agrees to **exactly 0**, and the local
 *      rest TRS agrees to 1.0e-3 (worst: `Toe_CTL_L`, an IK control, sub-millimetre). So the clips
 *      cut out of one file drive the skeleton cut out of the other, unretargeted.
 *   3. **Every clip resolves.** All eleven address all 199 joints, and for all eleven the count of
 *      targets that are *not* a bone of this skeleton is **0**, as is the count that are not a node
 *      of the scene at all.
 *
 * ── the skinIndex space, and why §309's off-by-one cannot exist here ────────────────────────
 * §309's `+1` is a property of the RETARGET path and of `GuardModel.instantiate()`: that function
 * prepends a synthetic `root` bone to the skeleton while `bindToRig3` built its `boneIndex` over a
 * root-less order, so every vertex reads one bone early. This path **prepends nothing and remaps
 * nothing**. The merged geometry carries the source's own `skinIndex` values and
 * `instantiateNative()` rebuilds the skeleton in `asset.boneOrder`, which is
 * `skeleton.bones.map(b => b.name)` verbatim. The identity of index *i* is the same integer at
 * every stage, so there is no shift to get wrong. Measured rather than argued — see
 * `tools/carmnative.mjs`, which reports the max skinIndex against the bone count and CPU-skins the
 * bind pose to show it returns the geometry unmoved.
 *
 * ── what is dropped, and by what rule ────────────────────────────────────────────────────────
 * The same two rules the rebind path earned, applied to the same meshes, so the two arms are
 * comparable:
 *
 *   - **the shock pistol** — `MainBody`, `Barrel`, `Antennae003` are 100% weighted to the
 *     `ShockPistol` armature root, a sibling of the body root `Bone001`. Read off the HIERARCHY,
 *     never off a node name. The rule is shown able to reject: `Legs` is 96.4% `Bone001` /
 *     3.6% `Hips_Center` and is kept.
 *   - **the sealed mouth interior** — `TeethUpper_LowPoly` and `Tongue_LowPoly`, 1,024 triangles
 *     that `tools/carminterior.mjs` scored at 99.8% and 100% enclosed. §702 cut them to get under
 *     the triangle cap and the cap has not moved.
 *
 * The source scene's 13 non-character drawables — four `Text*` annotation meshes and nine
 * `LineSegments` rig widgets (`Arrow`, `Circle`, `Cube`, `IKPolehandle`, `singlecircle`,
 * `Starcircle`, `Handrot`, `HandCurlCTL`, `BézierCircle`) — are not dropped here because they were
 * already dropped by `tools/carmelita2guard.mjs`, which decided them by data (no skin **and** no
 * material) rather than by name. This file consumes that file's output and re-asserts the census.
 *
 * ── the head, which a fresh import WOULD get wrong ───────────────────────────────────────────
 * `Head_LP` ships with a **96-element index — 32 of its 5,000 triangles**, referencing 64 of its
 * 3,040 vertices. The vertex cloud is whole, so every structural check passes while 0.6% of the
 * face is drawn. It is upstream: both glTF exports carry the 32-triangle version and the FBX
 * carries the complete one, which is what `tools/carmhead.mjs` recovered into
 * `carmelita-head-lp.glb`. **A native import reads the same broken index**, so the recovery is
 * applied here too — and gated on §702's fiducial, re-checked at load rather than trusted:
 * all 64 surviving stub vertices must be matched in the recovered mesh at distance 0.
 *
 * That gate is cheap here and it earns its place: it is what separates "the right head" from "a
 * head", and §418.3 wants both directions on record. Measured: the recovered head passes at a
 * worst distance of **2.6e-7 m**, and `Hair_LP` substituted for it fails at **7.6e-2 m**.
 *
 * > **A correction to §702's prose, which would send the next reader to the wrong gate.** That
 * > section describes the fiducial as "a UV equal to (u, 1−v)". That is what `tools/carmhead.mjs`
 * > checks against the **FBX**, which it v-flips at line 127 *before* comparing. The emitted
 * > `carmelita-head-lp.glb` therefore agrees with the stub's UVs with **no flip at all** —
 * > measured 64/64 at exactly 0.000e+0 unflipped, and 0/64 flipped. The tool is correct; the
 * > sentence describes its input and reads as though it described its output. The gate below uses
 * > the unflipped comparison because that is the file's actual property.
 *
 * ── the two things this file DOES change, both of them mount decisions ───────────────────────
 * **Scale.** She is authored 1.6387 m tall at the bind pose; the shipped rebound guard is
 * 1.8163 m, and the level, the camera framing and the cone were all tuned around that. One
 * uniform factor — `MOUNT_SCALE`, 1.8163 / 1.6387 = **1.108338** — is applied on a group between
 * the guard root and the rig, so `Guard._step` still owns `root.position` and `GuardAnim`'s
 * squash-and-stretch would still own `root.scale` if it were driving. Uniform, so it cannot change
 * a proportion; the head stays the same fraction of her height it was authored at.
 *
 * **Base origin.** `Guard._step` ASSIGNS `position.y` from the ground probe (§697), so the mesh
 * must be base-origin. The source already is — its lowest vertex sits at y = 0.000237 m, which is
 * 0.26 mm once scaled — and the residual is removed anyway so the property is exact rather than
 * nearly true. §697's `TUNE.groundProbe` and `TUNE.groundSlopeMax` are not read, not written and
 * not involved.
 */

const BASE = 'assets/sly-anim/';
/** The eleven clips, cut out of the source scene by `tools/carmelita2native.mjs`. */
export const CARMELITA_CLIPS_ASSET = `${BASE}carmelita-clips.glb`;

/**
 * Guard clip name → her clip name. **This is the whole integration surface.**
 *
 * `Guard.js` asks for a state's clip by name and something plays it; it never names a bone, and
 * nothing below the mixer knows what a guard is. That is what makes the AI — patrol routing,
 * detection, the alert ladder, the swing — untouched by this import, which is what the owner
 * asked for.
 *
 * **Twelve** names are requested by `Guard._chooseClip` and `_playOneShot`, and all twelve are
 * mapped. The count is worth stating because ten of them are obvious from `_chooseClip`'s switch
 * and two are not: `attack` and `pickpocketed_reaction` are fired from `_playOneShot` at the swing
 * and the pickpocket, a hundred lines away from the switch. `tests/carmnative.test.mjs` greps them
 * out of `Guard.js` rather than restating them here, so a state added later cannot silently fall
 * through to `idle` — which is how it caught both of these.
 *
 * Four of her eleven clips have no guard state that reaches them and are listed in `UNUSED_CLIPS`
 * rather than quietly absent — `Air` and `Jump` need a guard who leaves the ground and none does,
 * `Run.001` is a second run the roster has no speed for, and `Shoot(GunMovement)` animates the
 * pistol that this import drops. They are still loaded and still playable by name, so a later
 * state can reach one without touching this file.
 */
export const CLIP_FOR = {
  idle: 'Idle',
  idle_bored: 'Lookaround',
  walk_patrol: 'PatrolWalk',
  walk_alert: 'CasualWalking',
  run_chase: 'Run',
  look_around: 'Lookaround',
  suspicious: 'Lookaround',
  alert: 'HitTaken',
  stunned: 'HitTaken',
  ko: 'HitTaken',
  pickpocketed_reaction: 'HitTaken',
  /* The swing. `Shoot(BodyMovement)` is the only whole-body aggressive action she was authored
     with, and §698 already recorded the mismatch it comes from: it is a GUN animation on a
     garrison that swings. It is used because a guard who attacks with no clip at all reads worse
     than one who attacks with the wrong one, and because the alternative — authoring a swing —
     is exactly what the owner asked us to stop doing. Stated as a compromise, not as a fit.
     `Shoot(GunMovement)` is the pistol's own half of that clip pair and stays unused, because
     the pistol is not on her. */
  attack: 'Shoot(BodyMovement)',
};

/** Her clips that no guard state reaches. Loaded and playable; simply never asked for. */
export const UNUSED_CLIPS = ['Air', 'Jump', 'Run.001', 'Shoot(GunMovement)'];

/**
 * Guard clips that must not loop — a one-shot reaction, or a state that holds its last frame.
 * `Guard._playOneShot` passes `loop: false` explicitly for the four it fires, so this is the
 * default for the two that are chosen by `_chooseClip` instead (`stunned`, `ko`) and a restatement
 * for the rest.
 *
 * `suspicious` is deliberately NOT here even though `_playOneShot('suspicious')` exists: it is
 * also a sustained state in `_chooseClip`'s switch, and a guard who plants to look suspicious and
 * then freezes on the last frame is worse than one who keeps looking. The one-shot call passes
 * `loop: false` for its own firing and `play()` restores this default on the next call.
 */
export const ONCE = new Set(['alert', 'stunned', 'ko', 'attack', 'pickpocketed_reaction']);

/**
 * The uniform mount scale — see the header. Derived, not chosen: the shipped rebound guard's
 * bind-pose height over hers, both measured as the merged geometry the GPU would draw with every
 * bone at rest. `tools/carmnative.mjs --scale` re-derives it and fails if the two drift.
 */
export const MOUNT_SCALE = 1.108338;

/** The armature root that carries the body. Read off the hierarchy in `classify`, not asserted. */
const PROP_ROOT_RULE = 'a mesh whose weight lands 100% on an armature root no body mesh uses';

/* ========================================================================== */

/**
 * §702's fiducial, re-run at load. Returns the worst distance from a surviving stub vertex to its
 * nearest vertex in the candidate head; 0 means the same mesh at the same scale in the same frame.
 *
 * Exported so `tools/carmnative.mjs` can run the negative arm (§418.3) over a mesh that must fail.
 */
export function headFiducial(stubGeom, headGeom) {
  if (!stubGeom?.index || !headGeom?.attributes?.position) return { ok: false, worst: Infinity, n: 0 };
  const sp = stubGeom.attributes.position, hp = headGeom.attributes.position;
  const live = new Set();
  for (let i = 0; i < stubGeom.index.count; i++) live.add(stubGeom.index.getX(i));
  /* A uniform grid over the candidate, so the check is O(n) rather than 64 × 15,000. The cell is
     1 cm — far larger than the 1e-6 tolerance and far smaller than the 7.6e-2 a wrong mesh
     misses by, so neither arm can land on the wrong side of it. */
  const CELL = 0.01;
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  for (let j = 0; j < hp.count; j++) {
    const k = key(hp.getX(j), hp.getY(j), hp.getZ(j));
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(j);
  }
  let worst = 0;
  for (const vi of live) {
    const x = sp.getX(vi), y = sp.getY(vi), z = sp.getZ(vi);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(key(x + dx * CELL, y + dy * CELL, z + dz * CELL));
      if (!a) continue;
      for (const j of a) {
        const d = (hp.getX(j) - x) ** 2 + (hp.getY(j) - y) ** 2 + (hp.getZ(j) - z) ** 2;
        if (d < best) best = d;
      }
    }
    /* Nothing within the search radius means the candidate is not this mesh — the gate is already
       decided. Fall back to a full scan anyway so the REJECTION carries a distance rather than an
       `Infinity`: §418.3 wants the failing input on record with a number, and a gate that can only
       say "no" teaches the next reader nothing about how far off a wrong mesh is. 64 vertices
       against a few thousand is microseconds. */
    if (!Number.isFinite(best)) {
      for (let j = 0; j < hp.count; j++) {
        const d = (hp.getX(j) - x) ** 2 + (hp.getY(j) - y) ** 2 + (hp.getZ(j) - z) ** 2;
        if (d < best) best = d;
      }
    }
    worst = Math.max(worst, Math.sqrt(best));
  }
  return { ok: worst <= 1e-5, worst, n: live.size };
}

/**
 * Put the recovered face into the parsed scene, keeping its skin attributes.
 *
 * Unlike `CarmelitaGuard.spliceHead` this one GATES on the fiducial and refuses on failure, and it
 * does not need to divide out a node transform beyond the general case, because the recovered mesh
 * is emitted in the source scene's world space and every skinned node in `carmelita-guard.glb` is
 * at the identity (measured: 0 of 21 non-identity). The division is done anyway — a silent
 * double-transform is exactly the failure that would look like a slightly-wrong face.
 */
export function spliceHeadNative(scene, headGeom) {
  if (!headGeom?.attributes?.position || !headGeom.index) return { ok: false, why: 'no head geometry' };
  if (!headGeom.attributes.skinIndex || !headGeom.attributes.skinWeight) {
    return { ok: false, why: 'the recovered head carries no skin attributes — it cannot be bound' };
  }
  let target = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Head_LP') target = o; });
  if (!target) return { ok: false, why: 'Head_LP is not in the scene' };

  const fid = headFiducial(target.geometry, headGeom);
  if (!fid.ok) {
    return { ok: false, why: `fiducial failed: worst ${fid.worst.toExponential(3)} m over ${fid.n} vertices`, fiducial: fid };
  }

  const before = (target.geometry.index?.count ?? target.geometry.attributes.position.count) / 3;
  scene.updateMatrixWorld(true);
  const g = headGeom.clone();
  g.applyMatrix4(new THREE.Matrix4().copy(target.matrixWorld).invert());
  target.geometry = g;
  target.morphTargetInfluences = undefined;
  target.morphTargetDictionary = undefined;
  return { ok: true, before, after: g.index.count / 3, fiducial: fid };
}

/**
 * Classify the skinned meshes: kept body, detached prop, sealed interior.
 * Off the armature hierarchy and the `INTERIOR` list — the same two rules the rebind path uses.
 */
function classify(skinned, skel) {
  const rootOf = skel.bones.map((b) => { let p = b; while (p.parent?.isBone) p = p.parent; return p.name; });
  /* Which armature roots carry body weight: a root is a body root iff some mesh puts weight on it
     that is not 100% of that mesh. `Legs` (96.4/3.6) is what makes `Hips_Center` a body root and
     is the reason the rule is stated over meshes rather than over roots. */
  const rootTotals = new Map();
  const perMesh = new Map();
  for (const m of skinned) {
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    const per = new Map();
    let total = 0;
    if (si && sw) {
      for (let k = 0; k < sw.array.length; k++) {
        const w = sw.array[k]; if (!(w > 0)) continue;
        total += w;
        const r = rootOf[si.array[k]];
        per.set(r, (per.get(r) || 0) + w);
        rootTotals.set(r, (rootTotals.get(r) || 0) + w);
      }
    }
    perMesh.set(m, { per, total });
  }
  /* A root is "body" if any mesh spreads weight across it AND something else. */
  const bodyRoots = new Set();
  for (const [, { per }] of perMesh) {
    if (per.size > 1) for (const r of per.keys()) bodyRoots.add(r);
  }
  const kept = [], props = [], interior = [];
  for (const m of skinned) {
    if (INTERIOR.includes(m.name)) { interior.push(m); continue; }
    const { per, total } = perMesh.get(m);
    let onBody = 0;
    for (const [r, w] of per) if (bodyRoots.has(r)) onBody += w;
    if (total > 0 && onBody <= 0) { props.push({ mesh: m, root: [...per.keys()][0] }); continue; }
    kept.push(m);
  }
  return { kept, props, interior, bodyRoots: [...bodyRoots], rootOf };
}

/**
 * Build the native asset from the parsed scene. Pure, so it runs headless and is testable in
 * plain Node — the emitted `.glb` carries no images, so `GLTFLoader.parse` needs no DOM.
 *
 * @param {THREE.Object3D} scene  the parsed `carmelita-guard.glb` scene
 * @param {THREE.BufferGeometry|null} headGeom  the recovered face, or null to keep the stub
 * @returns {{geometry, boneOrder, boneSpec, boneInverses, regions, tris, stats}}
 */
export function buildNative(scene, headGeom = null, opts = {}) {
  scene.updateMatrixWorld(true);

  let headSplice = null;
  if (headGeom) {
    headSplice = spliceHeadNative(scene, headGeom);
    scene.updateMatrixWorld(true);
  }

  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) throw new Error('carmelita-native: no skinned mesh in the asset');

  const skel = skinned[0].skeleton;
  /* Every mesh must share ONE skeleton, or a single merged skinIndex space is a fiction. */
  for (const m of skinned) {
    if (m.skeleton !== skel) throw new Error('carmelita-native: the meshes do not share one skeleton');
  }
  const boneOrder = skel.bones.map((b) => b.name);
  if (new Set(boneOrder).size !== boneOrder.length) {
    throw new Error('carmelita-native: bone names are not unique — AnimationMixer binds by name');
  }

  const { kept, props, interior, bodyRoots } = classify(skinned, skel);
  if (!kept.length) throw new Error('carmelita-native: every mesh was classified away');

  /* ---- merge, keeping the source skinIndex values EXACTLY as authored ---- */
  const groups = [[], []];
  const regionNames = [[], []];
  let tris = 0;
  for (const mesh of kept) {
    const g = mesh.geometry.clone();
    /* Identity in this asset (measured 0 of 21 non-identity); applied unconditionally because a
       silent double-transform is the failure that looks like a slightly-wrong character. */
    g.applyMatrix4(mesh.matrixWorld);
    const nV = g.attributes.position.count;
    /* mergeGeometries needs identical attribute sets, and this asset ships four different ones
       (tangent on 17, colour pairs on 2, `_gn_custom_normals` on 1). Keep exactly what the guard
       material reads. skinIndex and skinWeight are carried through UNCHANGED — that is the point. */
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nV * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    /* Uint16 throughout, so the merge cannot pick a wider type for one input and mismatch. */
    const si = g.attributes.skinIndex;
    if (!(si.array instanceof Uint16Array)) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(si.array), 4));
    }
    g.morphAttributes = {};
    g.morphTargetsRelative = false;
    tris += (g.index ? g.index.count : nV) / 3;

    const gi = atlasOf(mesh.material);
    groups[gi].push(g);
    regionNames[gi].push({ name: mesh.name, count: nV });
  }

  const flat = [...groups[0], ...groups[1]];
  const merged = mergeGeometries(flat, true);
  if (!merged) throw new Error('carmelita-native: mergeGeometries returned null — attribute sets disagree');

  /* One group per material, in GROUPS order — two materials for the whole garrison, which is what
     keeps nine characters inside the draw budget. Merging is available here for the same reason it
     was in the rebind: every mesh shares one skeleton, so one merged buffer is still one skin. */
  const nBody = groups[0].length;
  let bodyCount = 0, headStart = 0, headCount = 0;
  merged.groups.forEach((grp, i) => {
    if (i < nBody) bodyCount += grp.count;
    else { if (!headCount) headStart = grp.start; headCount += grp.count; }
  });
  merged.clearGroups();
  merged.addGroup(0, bodyCount, 0);
  if (headCount) merged.addGroup(headStart, headCount, 1);

  /* ---- the skeleton spec, in the source's own order and with its own bind ---- */
  const boneIndex = new Map(boneOrder.map((n, i) => [n, i]));
  const boneSpec = skel.bones.map((b) => {
    /* Parent as an INDEX into this same array, or -1 when the parent is not a bone (`metarig`,
       an Object3D, parents the three armature roots). A root's transform is recorded in WORLD
       space so whatever sat above it is preserved without carrying the node itself. */
    const isBoneParent = !!b.parent?.isBone;
    const parent = isBoneParent ? boneIndex.get(b.parent.name) ?? -1 : -1;
    const m = new THREE.Matrix4();
    if (isBoneParent) m.copy(b.matrix);
    else m.copy(b.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    return {
      name: b.name, parent,
      pos: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w], scale: [s.x, s.y, s.z],
    };
  });
  const boneInverses = skel.boneInverses.map((m) => m.elements.slice());

  /* ---- base origin: the property `Guard._step` assumes (§697) ---- */
  merged.computeBoundingBox();
  const soleLift = -merged.boundingBox.min.y;
  if (Math.abs(soleLift) > 1e-9) {
    merged.translate(0, soleLift, 0);
    merged.computeBoundingBox();
  }
  const bb = merged.boundingBox;
  const height = bb.max.y - bb.min.y;

  const regions = [];
  {
    let off = 0;
    for (let gi = 0; gi < 2; gi++) {
      for (const r of regionNames[gi]) { regions.push({ name: r.name, group: gi, start: off, count: r.count }); off += r.count; }
    }
  }

  /* Highest skinIndex actually written, against the bone count — the §309 question, answered by
     the data rather than by the argument in the header. */
  let maxSkinIndex = -1;
  {
    const si = merged.getAttribute('skinIndex');
    for (let i = 0; i < si.array.length; i++) if (si.array[i] > maxSkinIndex) maxSkinIndex = si.array[i];
  }

  return {
    geometry: merged,
    boneOrder, boneSpec, boneInverses, regions,
    tris: Math.round(tris),
    height,
    /* Unrounded, because it is the exact inverse of a transform applied to the vertices and a
       consumer undoing it needs the value, not a display of it. It must be undone BEFORE skinning,
       never after: the lift is in the bind pose, so a rotated bone carries it somewhere else and
       subtracting it from the posed vertex leaves up to twice it behind (measured: a 0.237 mm lift
       showing up as 0.449 mm of apparent disagreement — `tools/carmnative.mjs` made exactly this
       mistake first). `stats.soleLift` is the same number rounded, for reading. */
    soleLift,
    stats: {
      meshes: skinned.length, kept: kept.length, bones: boneOrder.length,
      groups: merged.groups.length, bodyMeshes: groups[0].length, headMeshes: groups[1].length,
      soleLift: Math.round(soleLift * 1e6) / 1e6,
      height: Math.round(height * 1e5) / 1e5,
      maxSkinIndex, bodyRoots,
      dropped: [...props.map((p) => p.mesh.name), ...interior.map((m) => m.name)],
      droppedProps: props.map((p) => `${p.mesh.name}@${p.root}`),
      droppedInterior: interior.map((m) => m.name),
      propRule: PROP_ROOT_RULE,
      head: headSplice,
    },
  };
}

/**
 * One guard instance: a fresh 199-bone hierarchy sharing the asset's geometry and bind.
 *
 * The layout is `root` (Group, owned by `Guard._step` and by `GuardAnim.rootScale`) → `rig`
 * (Group, carrying `MOUNT_SCALE` and nothing else) → { bone tree, SkinnedMesh }. Putting the scale
 * on its own node is what lets `Guard` keep writing `root.position` and `root.scale` exactly as it
 * does for every other guard: neither is touched here.
 *
 * Because mesh and bones sit under the SAME scaled node, the scale cancels out of the skinning
 * algebra and is reapplied once by the renderer as the mesh's own world matrix — `bindMode` is
 * `attached`, so `bindMatrixInverse` tracks `matrixWorld` and the identity `bindMatrix` handed to
 * `bind()` stays correct at any scale.
 */
export function instantiateNative(asset, materials, opts = {}) {
  const scale = opts.scale ?? MOUNT_SCALE;
  const root = new THREE.Group();
  root.name = 'guard_root';
  const rig = new THREE.Group();
  rig.name = 'carmelita_rig';
  rig.scale.setScalar(scale);
  root.add(rig);

  const bones = asset.boneSpec.map((s) => {
    const b = new THREE.Bone();
    b.name = s.name;
    b.position.fromArray(s.pos);
    b.quaternion.fromArray(s.quat);
    b.scale.fromArray(s.scale);
    return b;
  });
  asset.boneSpec.forEach((s, i) => { (s.parent >= 0 ? bones[s.parent] : rig).add(bones[i]); });

  const byName = {};
  for (const b of bones) byName[b.name] = b;
  rig.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(bones, asset.boneInverses.map((e) => new THREE.Matrix4().fromArray(e)));

  const mesh = new THREE.SkinnedMesh(asset.geometry, materials);
  mesh.name = 'guard_body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  /* The same explicit, generously inflated culling sphere `GuardModel.instantiate` uses, and for
     the same reason: three fills `SkinnedMesh.boundingSphere` from whatever pose is current the
     first time it is asked and never recomputes it, so culling against it pops a guard out of
     frame mid-animation — while `frustumCulled = false` draws every guard in every shot and every
     shadow cascade. */
  mesh.frustumCulled = true;
  asset.geometry.computeBoundingSphere();
  mesh.boundingSphere = asset.geometry.boundingSphere.clone();
  mesh.boundingSphere.radius *= 2.0;
  rig.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());

  return { root, rig, mesh, bones: byName, boneList: bones, skeleton, scale };
}

/* ========================================================================== */

/**
 * The clip-name driver — `GuardAnim`'s interface, over her own clips.
 *
 * Every method `Guard.js` calls is here with the same signature and the same meaning, so the AI is
 * a drop-in caller and none of it needed changing: `play`, `setLocomotion`, `setLook`, `update`,
 * `freeze`, `unfreeze`, `clipNames`, `isPlaying`, and the `current` / `speed` / `finished` /
 * `rootScale` properties.
 *
 * Two of those are accepted and deliberately do nothing, and saying so is the point:
 *
 *   - **`setLocomotion`** feeds `GuardAnim`'s procedural lean and its tail/headcloth springs. Her
 *     clips carry their own weight shift and their own secondary motion, authored. Synthesising a
 *     second one on top is exactly the "modifying them" the owner asked us to stop doing. The
 *     values are still recorded, so a later lane has them without re-plumbing.
 *   - **`rootScale`** is `GuardAnim`'s ±4.8% squash-and-stretch, and it stays at the identity for
 *     the same reason. `Guard.js` still copies it onto `root.scale` every frame; it copies ones.
 *     One consequence is worth stating plainly: the nine guards will measure the SAME height
 *     rather than §702's 1.68–1.87 m spread, because that spread was this squash and nothing else.
 *
 * **`setLook` is implemented**, because it is not a change to the animation: it is the guard's
 * gaze, it is what makes the head track a target, and dropping it would be a visible regression
 * against the shipped build. It is applied as a bounded additive rotation on `Neck2` and `Head`
 * AFTER the mixer has written the authored pose, and it is split between the two so neither joint
 * carries an unnatural angle alone.
 */
export class CarmelitaNativeAnim {
  /**
   * @param {{root: THREE.Object3D, bones: Record<string, THREE.Bone>}} rig  from `instantiateNative`
   * @param {THREE.AnimationClip[]} clips  her eleven, as loaded
   * @param {number} seed  phase offset, so nine guards do not breathe in lockstep
   */
  constructor(rig, clips, seed = 0) {
    this.rig = rig;
    this.mixer = new THREE.AnimationMixer(rig.rig || rig.root);
    this.clips = new Map();
    for (const c of clips || []) this.clips.set(c.name, c);

    /** Guard name → action, built once. A name with no clip resolves to `idle` and is reported. */
    this.actions = new Map();
    this.missing = [];
    for (const [guardName, srcName] of Object.entries(CLIP_FOR)) {
      const clip = this.clips.get(srcName);
      if (!clip) { this.missing.push(`${guardName}→${srcName}`); continue; }
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      if (ONCE.has(guardName)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      else a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions.set(guardName, a);
    }
    /* Her own names are playable too, so nothing here forecloses a later state reaching `Jump`.
       ONLY the clips no guard name already maps, and that restriction is load-bearing:
       `AnimationMixer.clipAction(clip, root)` is CACHED by (clip, root) and returns the SAME
       action object every time. Four guard names resolve to `HitTaken` and three to `Lookaround`,
       so registering her source names unconditionally handed those actions a second
       configuration — which is how `alert` came to be a LoopRepeat action that never reported
       finished, while its `setLoop(LoopOnce)` sat three lines above looking correct. `play()` is
       now the single authority on loop mode for exactly this reason. */
    const mapped = new Set(Object.values(CLIP_FOR));
    for (const [name, clip] of this.clips) {
      if (this.actions.has(name) || mapped.has(name)) continue;
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions.set(name, a);
    }

    this.names = [...this.actions.keys()];
    this._current = '';
    this.speed = 1;
    this.finished = false;
    this._frozen = false;
    this.rootScale = new THREE.Vector3(1, 1, 1);
    this.hipsOffset = new THREE.Vector3();

    this._neck = rig.bones?.Neck2 || rig.bones?.Neck1 || null;
    this._head = rig.bones?.Head || null;
    this._lookYaw = 0; this._lookPitch = 0;
    this._lookTargetYaw = 0; this._lookTargetPitch = 0; this._lookWeight = 0;
    this._neckRest = this._neck ? this._neck.quaternion.clone() : null;
    this._headRest = this._head ? this._head.quaternion.clone() : null;

    this._speedIn = 0; this._turnIn = 0; this._accelIn = 0;

    if (this.actions.size) {
      const first = this.actions.has('idle') ? 'idle' : this.names[0];
      this.play(first, { fade: 0 });
      /* Phase the loop so a garrison does not march in step. */
      const a = this.actions.get(first);
      if (a) a.time = seed % (a.getClip()?.duration || 1);
    }
  }

  clipNames() { return this.names.slice(); }
  isPlaying(name) { return this._current === name; }
  get current() { return this._current; }

  /** Cross-fade to a clip by GUARD name. Re-playing the current clip is a no-op unless `restart`. */
  play(name, { fade = 0.18, loop = null, speed = 1, restart = false } = {}) {
    const next = this.actions.get(name) || this.actions.get('idle');
    if (!next) return;
    const nextName = this.actions.has(name) ? name : 'idle';
    if (this._current === nextName && !restart) { this.speed = speed; return; }
    const prev = this.actions.get(this._current);
    /* An omitted `loop` restores the NAME'S OWN default rather than leaving whatever the last
       caller set — `GuardAnim.play` does the same (`loop === null ? clip.loop : loop`), and
       without it one `_playOneShot('suspicious')` would leave the sustained SUSPICIOUS state
       clamped on its last frame forever after. */
    const wantLoop = loop === null ? !ONCE.has(nextName) : !!loop;
    if (wantLoop) { next.setLoop(THREE.LoopRepeat, Infinity); next.clampWhenFinished = false; }
    else { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    if (prev && prev !== next && fade > 0) {
      prev.crossFadeTo(next, fade, false);
      next.play();
    } else {
      if (prev && prev !== next) prev.stop();
      next.play();
    }
    this._current = nextName;
    this.speed = speed;
    this.finished = false;
  }

  /** Hold one frame of a clip — the screenshot harness needs a deterministic pose. */
  freeze(name, t = 0) {
    const a = this.actions.get(name);
    if (!a) return false;
    for (const [, other] of this.actions) if (other !== a) { other.stop(); other.enabled = false; }
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    a.time = THREE.MathUtils.clamp(t, 0, a.getClip()?.duration || 0);
    a.paused = true;
    this._current = name;
    this._frozen = true;
    this.mixer.update(0);
    this._applyLook(0);
    return true;
  }

  unfreeze() {
    this._frozen = false;
    const a = this.actions.get(this._current);
    if (a) a.paused = false;
  }

  /**
   * Accepted and unused — see the class header. Recorded so the values are available without
   * re-plumbing, and NOT fed into a procedural overlay on top of authored motion.
   */
  setLocomotion(speed, turnRate, accel) {
    this._speedIn = speed; this._turnIn = turnRate; this._accelIn = accel;
  }

  /** Where the guard is looking, in his own frame. Additive over the authored pose. */
  setLook(yaw, pitch, weight = 1) {
    this._lookTargetYaw = yaw || 0;
    this._lookTargetPitch = pitch || 0;
    this._lookWeight = weight || 0;
  }

  update(dt) {
    if (this._frozen) { this._applyLook(0); return; }
    const a = this.actions.get(this._current);
    if (a) a.setEffectiveTimeScale(this.speed);
    this.mixer.update(dt);
    if (a && a.loop === THREE.LoopOnce) {
      const d = a.getClip()?.duration || 0;
      this.finished = d > 0 && a.time >= d - 1e-4;
    } else this.finished = false;
    this._applyLook(dt);
  }

  /**
   * Bounded additive gaze, written AFTER the mixer so it composes with the authored pose rather
   * than replacing it. Split 40/60 neck/head, and clamped, so a target behind the guard cannot
   * fold his neck through his chest — the AI is allowed to want any angle; the rig is not
   * obliged to reach it.
   */
  _applyLook(dt) {
    if (!this._neck && !this._head) return;
    const k = dt > 0 ? Math.min(1, dt * 9) : 1;
    this._lookYaw += (this._lookTargetYaw * this._lookWeight - this._lookYaw) * k;
    this._lookPitch += (this._lookTargetPitch * this._lookWeight - this._lookPitch) * k;
    const yaw = THREE.MathUtils.clamp(this._lookYaw, -1.05, 1.05);
    const pitch = THREE.MathUtils.clamp(this._lookPitch, -0.55, 0.55);
    _e.set(pitch * 0.4, yaw * 0.4, 0, 'XYZ');
    if (this._neck) this._neck.quaternion.multiply(_q.setFromEuler(_e));
    _e.set(pitch * 0.6, yaw * 0.6, 0, 'XYZ');
    if (this._head) this._head.quaternion.multiply(_q.setFromEuler(_e));
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/* ========================================================================== */

/**
 * Load and build. Resolves to `null` — never throws — when anything is absent or unreadable, so
 * `Guards.init()` falls back to the rebind path and then to the procedural body rather than losing
 * the garrison. Ten headless suites build `Guards` with no fetch at all and must keep working.
 */
export async function loadCarmelitaNative(opts = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const get = async (url) => {
    const loader = new GLTFLoader();
    return Promise.race([
      loader.loadAsync(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
    ]);
  };
  try {
    const gltf = await get(opts.url || CARMELITA_ASSET);
    /* The recovered face is a SECOND, OPTIONAL fetch whose failure must not cost the character —
       without it she keeps the 32-triangle stub, which is also what `head: false` reverts to. */
    let head = null;
    if (opts.head !== false) {
      try {
        const hg = await get(opts.headUrl || CARMELITA_HEAD);
        hg.scene.traverse((o) => { if (!head && o.isMesh) head = o.geometry; });
      } catch { head = null; }
    }
    const asset = buildNative(gltf.scene, head, opts);
    /* The clips are a THIRD fetch. A guard with no clips is still a guard standing at his bind
       pose, which is a far better failure than no garrison. */
    let clips = [];
    try {
      const cg = await get(opts.clipsUrl || CARMELITA_CLIPS_ASSET);
      clips = cg.animations || [];
    } catch { clips = []; }
    asset.clips = clips;
    asset.source = opts.url || CARMELITA_ASSET;
    asset.headRecovered = !!(asset.stats.head?.ok);
    asset.native = true;
    return asset;
  } catch {
    return null;
  }
}

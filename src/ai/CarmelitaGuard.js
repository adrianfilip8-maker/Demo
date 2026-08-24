import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from '../player/SlyModel3.js';

/**
 * CarmelitaGuard — the guard body, from the Godot fan project's Carmelita, bound to RIG3.
 *
 * Imported at the owner's instruction ("replace the created guard with the downloaded Carmelita
 * model along with relevant files and animations"). Provenance and **licence status — none
 * stated** — are in `public/assets/sly-anim/PROVENANCE.md`. `tools/carmelita2guard.mjs` cuts the
 * body out of the source scene and `tests/carmguard.test.mjs` guards this binding.
 *
 * ── Half of this job was already done ────────────────────────────────────────────────────────
 * `GUARD_CLIPS` has been Carmelita's motion since `tools/carmelita2clips.mjs` ran: all eleven of
 * her clips — including `PatrolWalk` and `Lookaround`, the two a stealth guard cannot do without —
 * retargeted onto RIG3's bone names. What was still procedural was only the **mesh**, the metaball
 * `blob()` construction in `GuardModel.js`. So this file is the second half: her geometry, over the
 * bones her own animation already drives.
 *
 * ── Why the target skeleton is RIG3 and not the guard rig ───────────────────────────────────
 * `GuardModel.humanoidSkeleton()` and `RIG3` share every humanoid bone name — hips, spine, chest,
 * neck, head, jaw, ears, the four-bone arms, the four-bone legs, tailA/tailB — and differ only in
 * their decorations (the guard has `snout`, `nemesL/R/B`, `kiltF/B`; RIG3 has `capBrim`, `browL/R`,
 * `tailC/D`). But they differ in their **bind positions**, and `GUARD_CLIPS` is authored as Euler
 * deltas *on top of RIG3's bind* — its generated header says so. Binding Carmelita's mesh at RIG3's
 * bind is therefore the pose her own clips were written for.
 *
 * ── The rebind, which is `SlyModelGodot`'s ──────────────────────────────────────────────────
 * Keep the artist's geometry and skin weights, re-express those weights over our bones, and carry
 * the mesh from the source bind pose into ours:
 *
 *     v' = Σ w · ourBindWorld[target(j)] · srcInverseBind[j] · v
 *
 * `srcInverseBind` comes from the loaded `Skeleton.boneInverses` rather than from re-deriving the
 * armature's world matrices, because that is the value the source file actually asserts. RIG3's
 * bind carries no rotation (`instantiate` places every bone by position alone), so `ourBindWorld`
 * is a pure translation and the rotation in `M` is entirely the *undoing* of the source bind —
 * which is the whole operation.
 *
 * Driving her own 199-joint hierarchy instead would need a full retarget layer and would leave
 * every clip, the cone, the alert ladder and every guard interaction to be rewritten.
 *
 * ── 199 joints onto 31 ──────────────────────────────────────────────────────────────────────
 * `BONE_MAP` is the same table `tools/carmelita2clips.mjs` validated for the clips — the two are
 * asserted equal by `tests/carmguard.test.mjs`, so they cannot drift. Everything it does not name
 * — her whole face rig, the fingers, the coat and collar helpers, and all 35 IK/pole controls —
 * **folds into its nearest mapped ancestor** rather than being dropped, so its influence is kept.
 * A dropped joint leaves the geometry it weighted stranded at the origin, which reads as missing
 * geometry rather than as a rigging bug.
 *
 * ── The atlas split, which used to be a guess and is now the source project's own record ────
 * This file used to assign the two 2048² albedos **by node name**, and said so: the GLB's
 * materials carry no `baseColorTexture`, so nothing in the GLB records which mesh wears which
 * atlas. §241 recorded that as unrecoverable offline. It is not — the record simply lives one
 * file up, in the *Godot importer's* material remap, which is where `sly-godot/PROVENANCE.md`
 * had already read Sly's own two atlases from. Applying that same method here:
 *
 *     Carmelita_Animations7.fbx.import  "materials" →   BodyMat → uid://bnewj3kvedjat
 *                                                       EyeMat  → uid://4r18yagxqqq
 *                                                       HeadMat → uid://dcdj8rdtni3ux
 *     Assets/Materials/Carmelita Body.tres  (bnewj3kvedjat) → ..._CarmelitaBody_...BaseColor.png
 *     Assets/Materials/Carmelita Eyes.tres  (4r18yagxqqq)   → ..._CarmelitaHead_...BaseColor.png
 *     Assets/Materials/Carmelita Head.tres  (dcdj8rdtni3ux) → ..._CarmelitaHead_...BaseColor.png
 *
 * So the discriminator is the **source material**, not the node name — see `MATERIAL_ATLAS`. The
 * old guess was wrong where it mattered: it put `BustRetopo` (1,768 tris of chest) in the head
 * group on the strength of the word "Bust", and `BustRetopo` is `BodyMat`.
 */

const BASE = 'assets/sly-anim/';
const ASSET = `${BASE}carmelita-guard.glb`;

/**
 * Source joint → RIG3 bone. Identical to `MAP` in `tools/carmelita2clips.mjs`; that tool derived
 * and validated it (two neck bones collapse to one, `Neck2` chosen because our single bone carries
 * the accumulated bend), and `tests/carmguard.test.mjs` parses the tool's literal and asserts this
 * one matches it, so a change there cannot silently leave the mesh on the old correspondence.
 */
export const BONE_MAP = {
  Hips: 'hips',
  Ribs: 'spine',
  Chest: 'chest',
  Neck2: 'neck',
  Head: 'head',
  Jaw: 'jaw',
  'Ear.L': 'earL', 'Ear.R': 'earR',
  'shoulder.L': 'shoulderL', 'shoulder.R': 'shoulderR',
  'upper_arm.L': 'upperArmL', 'upper_arm.R': 'upperArmR',
  'forearm.L': 'lowerArmL', 'forearm.R': 'lowerArmR',
  'Hand.L': 'handL', 'Hand.R': 'handR',
  'thigh.L': 'upperLegL', 'thigh.R': 'upperLegR',
  'shin.L': 'lowerLegL', 'shin.R': 'lowerLegR',
  'foot.L': 'footL', 'foot.R': 'footR',
  'toe.L': 'toeL', 'toe.R': 'toeR',
};

/**
 * Which merged group each source mesh lands in, and therefore which of the two albedos it wears.
 *
 * `GuardModel.GROUPS` is `['body', 'metal']` and `Guards._buildMaterials` builds exactly two
 * materials for the whole garrison — that is what keeps eleven characters inside the draw budget,
 * and it is kept. So her 21 meshes merge into two groups.
 *
 * The assignment is **read off the source project's own importer**, not inferred from node names
 * — see the header. Eighteen of the twenty-one meshes are decided by it; the other three are
 * `UNREMAPPED` below and are the only ones still chosen rather than measured.
 */
export const MATERIAL_ATLAS = {
  BodyMat: 0,     // Carmelita Body.tres  → carmelita-body.png
  HeadMat: 1,     // Carmelita Head.tres  → carmelita-head.png
  EyeMat: 1,      // Carmelita Eyes.tres  → carmelita-head.png
};

/**
 * The three source materials the Godot project does **not** remap, so neither atlas is theirs:
 * in that project they render as flat colours from the FBX (`OH_Outline_Material` black,
 * `OutlineMat.001` light grey). They are `Stomach_LP` (416 tris, a panel under the coat),
 * `TeethUpper_LowPoly` (832) and `Tongue_LowPoly` (192) — 1,440 of 29,791 tris, all of them
 * inside the mouth or under the coat.
 *
 * We have two groups and no third material to spend on them, so they go to `body`. That choice is
 * **arbitrary within a stated bound** rather than measured, and it is recorded here as such — the
 * point of `MATERIAL_ATLAS` is that the other eighteen no longer are.
 */
export const UNREMAPPED = ['OH_Outline_Material', 'OutlineMat.001', 'TestMaterialBody.001'];

/** Which merged group (0 body, 1 head) a source mesh's material puts it in. */
export function atlasOf(material) {
  const names = Array.isArray(material) ? material.map((m) => m?.name) : [material?.name];
  for (const n of names) if (n && MATERIAL_ATLAS[n] != null) return MATERIAL_ATLAS[n];
  return 0;
}

/** RIG3 bones Carmelita's rig cannot supply. Reported, and asserted exactly by the test. */
export const NO_SOURCE = ['capBrim', 'browL', 'browR', 'tailA', 'tailB', 'tailC', 'tailD'];

/* ========================================================================== */

/** Resolve a source joint name through three's own sanitiser, then the plausible variants. */
export function resolveName(raw, names) {
  const san = THREE.PropertyBinding.sanitizeNodeName;
  return (san && names.has(san(raw)) && san(raw))
    || (names.has(raw) && raw)
    || (names.has(raw.replace(/\./g, '')) && raw.replace(/\./g, ''))
    || (names.has(raw.replace(/\./g, '_')) && raw.replace(/\./g, '_'))
    || null;
}

/** RIG3's bind, as world positions keyed by bone name. `root` is the origin. */
export function rig3BindWorld() {
  const world = { root: new THREE.Vector3() };
  for (const [name, parent, p] of RIG3.SKELETON) {
    world[name] = new THREE.Vector3().fromArray(p);
    if (!world[parent]) world[parent] = world.root;
  }
  return world;
}

/**
 * Bind the loaded scene to RIG3.
 *
 * Pure over `scene` so it runs headless: the emitted `.glb` carries no images, so
 * `GLTFLoader.parse` needs no DOM and this whole path is testable in plain Node.
 *
 * @param {THREE.Object3D} scene   the parsed glTF scene
 * @returns {{geometry, skeleton, tris, missing, stats}} the `GuardModel` asset shape
 */
export function bindToRig3(scene) {
  scene.updateMatrixWorld(true);

  /* ---- 1. collect the skinned meshes and the one skeleton they share ---- */
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) throw new Error('carmelita: no skinned mesh in the asset');

  const skel = skinned[0].skeleton;
  const srcBones = skel.bones;
  const srcNames = new Set(srcBones.map((b) => b.name));

  /* ---- 2. every source joint -> a RIG3 bone, folding the unmapped into their ancestors ---- */
  const direct = new Map();                       // sanitised source name -> RIG3 bone
  const unmapped = [];
  for (const [raw, target] of Object.entries(BONE_MAP)) {
    const n = resolveName(raw, srcNames);
    if (n) direct.set(n, target); else unmapped.push(raw);
  }
  if (direct.size < Object.keys(BONE_MAP).length) {
    throw new Error(`carmelita: only ${direct.size}/${Object.keys(BONE_MAP).length} bones resolved `
      + `(missing ${unmapped.join(', ')}) — a partial map produces a character that is wrong but plausible`);
  }

  /** Walk up until a mapped ancestor is found. Falls back to `hips`, never to nothing. */
  const targetOf = new Array(srcBones.length);
  let folded = 0;
  for (let i = 0; i < srcBones.length; i++) {
    let b = srcBones[i], t = null;
    while (b) { if (direct.has(b.name)) { t = direct.get(b.name); break; } b = b.parent; }
    if (t === null) { t = 'hips'; }
    if (!direct.has(srcBones[i].name)) folded++;
    targetOf[i] = t;
  }

  /* ---- 3. the target bone order: RIG3, minus what nothing weights ---- */
  const used = new Set(targetOf);
  const order = RIG3.BONE_ORDER.filter((b) => used.has(b));
  const boneIndex = new Map(order.map((n, i) => [n, i]));

  /* ---- 4. the bind transfer, one matrix per SOURCE joint ---- */
  const bindWorld = rig3BindWorld();
  const M = srcBones.map((b, i) => {
    const t = targetOf[i];
    const ours = new THREE.Matrix4().makeTranslation(
      bindWorld[t].x, bindWorld[t].y, bindWorld[t].z);
    return ours.multiply(skel.boneInverses[i]);
  });
  const Q = M.map((m) => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().extractRotation(m)));

  /* ---- 5. per mesh: bake the world transform, remap weights, carry into our bind ---- */
  const groups = [[], []];                        // 0 = body, 1 = head
  /* Region names per group, in the same push order as `groups` — after the merge these become
     `regions` (name/group/start/count in merged-vertex space). Pure metadata: nothing in the
     boot path reads it, but it makes the merged buffer self-describing, which is what lets
     GUARDS paint the §2.2 dress into the vertex-colour channel per source mesh instead of
     reverse-engineering offsets (PREREG-guardart; §291's channel contract, second clause). */
  const regionNames = [[], []];
  let tris = 0;
  const p0 = new THREE.Vector3(), pa = new THREE.Vector3(), pt = new THREE.Vector3();
  const n0 = new THREE.Vector3(), na = new THREE.Vector3(), nt = new THREE.Vector3();

  for (const mesh of skinned) {
    const g = mesh.geometry.clone();
    /* Every mesh sits under its own node transform; bake it before touching vertices or the
       parts assemble in the wrong places. The skin's bind is in skeleton space, and these nodes
       are siblings of the armature at identity in this asset — asserted by the test, which
       checks the bound result's height against RIG3's. */
    g.applyMatrix4(mesh.matrixWorld);

    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!si || !sw) continue;
    const nV = g.attributes.position.count;
    const outI = new Uint16Array(nV * 4);
    const outW = new Float32Array(nV * 4);

    /* Weight remap: several source joints collapse onto one of ours, so accumulate per target
       and renormalise. Keeping the raw four would leave a vertex weighted 0.5/0.5 to the same
       bone twice, which is not wrong but wastes two of the four slots every vertex has. */
    const acc = new Map();
    for (let v = 0; v < nV; v++) {
      acc.clear();
      for (let k = 0; k < 4; k++) {
        const w = sw.array[v * 4 + k];
        if (!(w > 0)) continue;
        const t = targetOf[si.array[v * 4 + k]];
        acc.set(t, (acc.get(t) || 0) + w);
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      let sum = 0;
      for (const [, w] of top) sum += w;
      if (!(sum > 0)) { outI[v * 4] = boneIndex.get('hips') ?? 0; outW[v * 4] = 1; continue; }
      for (let k = 0; k < top.length; k++) {
        outI[v * 4 + k] = boneIndex.get(top[k][0]) ?? 0;
        outW[v * 4 + k] = top[k][1] / sum;
      }
    }

    /* Carry the vertices from her bind into ours, using the ORIGINAL source indices. */
    const pos = g.attributes.position, nrm = g.attributes.normal;
    for (let v = 0; v < nV; v++) {
      p0.fromBufferAttribute(pos, v); pa.set(0, 0, 0);
      if (nrm) { n0.fromBufferAttribute(nrm, v); na.set(0, 0, 0); }
      for (let k = 0; k < 4; k++) {
        const w = sw.array[v * 4 + k];
        if (!(w > 0)) continue;
        const j = si.array[v * 4 + k];
        pa.addScaledVector(pt.copy(p0).applyMatrix4(M[j]), w);
        if (nrm) na.addScaledVector(nt.copy(n0).applyQuaternion(Q[j]), w);
      }
      pos.setXYZ(v, pa.x, pa.y, pa.z);
      if (nrm && na.lengthSq() > 1e-12) { na.normalize(); nrm.setXYZ(v, na.x, na.y, na.z); }
    }

    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(outI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(outW, 4));
    /* Merge needs identical attribute sets. Keep only what the guard material reads. */
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nV * 2), 2));
    }
    g.morphAttributes = {};
    g.morphTargetsRelative = false;
    if (g.index) tris += g.index.count / 3; else tris += nV / 3;

    const gi = atlasOf(mesh.material);
    groups[gi].push(g);
    regionNames[gi].push({ name: mesh.name, count: nV });
  }

  /* ---- 6. one geometry, two groups, in GROUPS order ---- */
  const flat = [...groups[0], ...groups[1]];
  if (!flat.length) throw new Error('carmelita: every mesh was discarded during the bind');
  const merged = mergeGeometries(flat, true);
  if (!merged) throw new Error('carmelita: mergeGeometries returned null — attribute sets disagree');

  /* mergeGeometries emits one group per input; collapse to two so two materials cover it. */
  const nBody = groups[0].length;
  let bodyCount = 0, headStart = 0, headCount = 0;
  merged.groups.forEach((grp, i) => {
    if (i < nBody) bodyCount += grp.count;
    else { if (!headCount) headStart = grp.start; headCount += grp.count; }
  });
  merged.clearGroups();
  merged.addGroup(0, bodyCount, 0);
  if (headCount) merged.addGroup(headStart, headCount, 1);

  /* ---- 7. the skeleton spec `instantiate()` wants ---- */
  const skeleton = RIG3.SKELETON
    .filter(([n]) => used.has(n))
    .map(([n, p, pos]) => [n, used.has(p) ? p : 'root', pos]);

  const missing = new Set(NO_SOURCE.filter((b) => !used.has(b)));

  /* Merged-vertex-space regions, in `flat` order (body meshes first, then head — the same
     concatenation the merge consumed, so starts are exact by construction). */
  const regions = [];
  {
    let off = 0;
    for (let gi = 0; gi < 2; gi++) {
      for (const r of regionNames[gi]) {
        regions.push({ name: r.name, group: gi, start: off, count: r.count });
        off += r.count;
      }
    }
  }

  return {
    geometry: merged,
    skeleton,
    regions,
    tris: Math.round(tris),
    missing,
    stats: {
      meshes: skinned.length, bones: order.length, folded,
      srcJoints: srcBones.length, groups: merged.groups.length,
      bodyMeshes: groups[0].length, headMeshes: groups[1].length,
    },
  };
}

/**
 * Load and bind. Resolves to `null` — never throws — when the asset is absent or unreadable, so
 * `Guards.init()` falls back to the procedural body rather than losing the garrison. Ten headless
 * suites build `Guards` with no fetch at all and must keep working.
 */
export async function loadCarmelitaGuard(url = ASSET) {
  /* No DOM means no page to resolve `assets/…` against. `GLTFLoader.loadAsync` on a relative URL
   * in Node does not reject — it never settles at all, and `node --test` reports every test in the
   * file as "Promise resolution is still pending but the event loop has already resolved". That is
   * a hang presenting as thirteen unrelated failures, which is exactly the kind of diagnosis this
   * project loses hours to, so the environment is checked rather than the error caught. */
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  try {
    const loader = new GLTFLoader();
    /* And a second belt: a fetch that stalls must not hold the whole boot behind it. The guards
     * are one module of eighteen and the procedural body is a complete fallback. */
    const gltf = await Promise.race([
      loader.loadAsync(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
    ]);
    const asset = bindToRig3(gltf.scene);
    asset.source = url;
    return asset;
  } catch {
    return null;
  }
}

export const CARMELITA_ASSET = ASSET;

/**
 * Her two albedos, in `MATERIAL_ATLAS` group order — index 0 is the body atlas, index 1 the head.
 *
 * They are separate files rather than GLB-embedded images because the source is: the Godot
 * project assigns them through `.tres` material overrides, and `carmelita-guard.glb` carries
 * **zero** images and zero textures (checked in the file, not assumed). Relative URLs, resolved
 * against the page like every other asset here, because §666's leading slash resolves to the
 * domain root and 404s under this project's `/Demo/` path prefix.
 */
export const CARMELITA_TEX = [`${BASE}carmelita-body.png`, `${BASE}carmelita-head.png`];

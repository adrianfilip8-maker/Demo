/**
 * SlyModel27 — Sly on his OWN rig, his OWN weights, his OWN clips and his OWN cane.  `?char=sly27`
 *
 * This is for the player what §704 is for Carmelita: the source file imported whole rather than
 * folded onto RIG3. Nothing here is retargeted. There is no `BONE_MAP`, no bind transfer, no
 * per-vertex weight collapse and no rigid prop carry — the 166-joint skeleton, the artist's skin
 * weights and the 24 authored clips arrive as `tools/godot2sly27.mjs` emitted them, and
 * `THREE.AnimationMixer` drives the source's own node names.
 *
 * ── what this replaces, and why the distinction is not academic ──────────────────────────────
 * `?char=godot` (`SlyModelGodot.js`) takes the mesh from the OLD `SlyCooper_Anims4.gltf` and
 * rebinds it to RIG3; `GodotClips.js` takes the clips from `SlyCooper_Anims27.gltf` and retargets
 * THOSE onto RIG3 too. So the existing arrangement runs Anims27 motion on an Anims4 body across a
 * retarget layer. Both halves now come from one file, unmodified.
 *
 * Provenance, source paths and licence status: `public/assets/sly-godot/PROVENANCE.md`. Licence is
 * **none stated**; imported at the owner's standing instruction. Nothing from the source project's
 * music or sound-effect directories is read, referenced or emitted (§364.3).
 *
 * That sentence is deliberately phrased WITHOUT the literal directory paths, and the reason is
 * worth a line. `tests/audiowired.test.mjs`'s A2 guard scans every source file for those two paths,
 * case-insensitively, and it cannot tell a disclaimer from a loader — so the first draft of this
 * header, which spelled them out in order to promise they were never touched, **failed A2 on all
 * three suite runs**. The guard is right and the comment was wrong: to a text scan, naming the path
 * IS referencing it. The prose form carries the same meaning and leaves the guard able to keep
 * meaning what it means. The literal paths live in PROVENANCE.md, outside the scanned roots.
 *
 * ── THE CANE COMES FOR FREE, and that retires a sentence in §479.20 ─────────────────────────
 * §479.20 records that our cane "hangs at his side rather than planting, because their rig has no
 * cane bone". The second half is **false of the source** and always was. `Cane_LowPoly` is a rigid
 * 896-triangle mesh parented to `CaneBone.001`, which is joint #104 of the skin and a child of
 * `hand.R`; 23 of the 24 clips animate it and six carry real articulation on it. What is true is
 * narrower: RIG3 has no cane bone, so the retarget's bone map had nowhere to send those channels.
 * On this path the cane is part of the character and needs no attach logic at all — `Cane.js`,
 * `CaneAsset.js` and the Sketchfab `sly-cane.glb` are all unused here.
 *
 * ── THE ENGINE'S PROCEDURAL LAYER DOES NOT REACH THIS SKELETON, deliberately ────────────────
 * `Rig.js` states the character contract it needs: RIG3 bone NAMES, identity bind rotations, +X
 * left, +Z forward, origin at the feet. A Blender metarig satisfies none of those. So this model
 * exposes **no `bones` map and an empty `boneNames`**, which is the documented way to make
 * `Animation._bind()` return false: the whole procedural stack — the 52-clip blend tree, foot IK,
 * the tail spring, look-at, cap/ear overshoot and hit impulses — stands down, and the mixer is the
 * only thing posing this body. That is the honest arrangement, not a limitation worked around:
 * driving RIG3 Euler poses onto Blender-oriented bones is precisely the mangling a retarget exists
 * to avoid, and doing it silently would be worse than not doing it.
 *
 * The cost is stated plainly because it is the reason this ships behind a token: the native set is
 * 23 usable clips against 52 verbs the game asks for, and the layers above lose their subject.
 * `tools/sly27fit.mjs` reports the coverage per verb.
 *
 * ── NO INK OUTLINE, and it is a measured constraint rather than an oversight (§711) ─────────
 * Every other character shells itself: `SlyModelDLRig` calls `shading.outline()` on its body and
 * its cane, `SlyModelGodot` on its body, face and cane. This file makes no such call, so the
 * native arm draws with the toon ramp but without the build's inverted-hull ink.
 *
 * That is deliberate and it is a budget fact. §709's in-page worst view is 1,192,970 of a
 * 1,200,000 triangle cap — **7,030 spare**. Unshelled, this character is 30,346 against the
 * incumbent's 28,838 (13,063 body + 1,356 cane + both their shells): **+1,508, and it fits.**
 * Shelling all 21 parts doubles it to 60,692 — **+31,854, a breach of about 24,800.** So the
 * native player and the house outline do not both fit today. Do not "finish" this by adding the
 * shells without re-measuring: decimation, shelling only the silhouette parts, or a cap change
 * are the three routes, and all three are the owner's call.
 *
 * ── §442, the trap this file is built around ────────────────────────────────────────────────
 * Every clip pins `CaneBone.001` about 148° away from its bind rotation, and the same is true of
 * much of the body. **The bind pose of this asset is not a pose the source game ever shows.** An
 * instrument — or a capture — that samples this character before a clip has been evaluated is
 * measuring the rest pose and will report a cane sticking through his arm. `update()` therefore
 * evaluates the mixer once at t=0 during `init()`, so the character is never handed to the engine
 * in bind pose.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RIG3 } from './SlyModel3.js';

/* Served from `public/`, so the two albedos resolve beside the .glb by URI — the same arrangement
   as `sly-godot.glb` and `assets/kaykit/`. Nothing is fetched from off-site. */
const BASE = 'assets/sly-godot/';
export const BODY_ASSET = `${BASE}sly27.glb`;
export const CLIPS_ASSET = `${BASE}sly27-clips.glb`;

/** The source's four material names. Fallback colours are only reached with no texture (offline
 *  measurement), so they exist to keep the parts distinguishable, not to be art direction. */
const FALLBACK = { BodyMat: 0x2f4a6d, HeadMat: 0x8fa4b8, EyeMat: 0xf2f2f2, CaneMat: 0xc9a227 };

/** The clip held when nothing else is playing. §479.20: the owner picked raw `Standupright` off a
 *  contact sheet and has since said "static pose is good for now", so that ruling is the default
 *  here too — and on this path it plays as authored rather than as a retarget of itself. */
export const REST_CLIP = 'Standupright';

/**
 * Names in this asset do not survive the loader unchanged, and both ways it mangles them have
 * already cost this project a round.
 *
 * 1. **three's `GLTFLoader` sanitises NODE names**: `CaneBone.001` arrives as `CaneBone001`,
 *    `spine.001` as `spine001`. §709 is exactly this — geometry reported absent because the
 *    search used a name the exporter had de-dotted. `getObjectByName('CaneBone.001')` returns
 *    undefined against a file that plainly contains that bone.
 * 2. **ANIMATION names are NOT sanitised, and one of them has trailing whitespace**: the source
 *    clip is literally `"Crouching stand   "`, three spaces included. Asking for
 *    `"Crouching stand"` misses it, which is how a clip that ships can read as missing.
 *
 * So every lookup here goes through these. Exported because `tools/sly27fit.mjs` must resolve the
 * same names the runtime does — two independent matchers would drift, and the report would then
 * be describing a character the browser does not build.
 */
export const nodeVariants = (n) => [n, n.replace(/\./g, ''), n.replace(/\./g, '_')];
export function findNode(root, name) {
  for (const v of nodeVariants(name)) { const o = root.getObjectByName(v); if (o) return o; }
  return null;
}
/** Loose clip key: case-preserving, whitespace-insensitive at both ends and internally collapsed. */
export const clipKey = (n) => String(n).trim().replace(/\s+/g, ' ');

/** The one clip with no verb of ours to serve — 1 channel, and it is in the file rather than cut
 *  (`tools/godot2sly27.mjs` keeps it) so that "24 clips" means 24 clips. */
export const UNUSED_CLIPS = ['KeyAction.001'];

export class SlyModel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'sly27';
    /* EMPTY ON PURPOSE — see the header. This is the switch that makes `Animation._bind()` return
       false and hand posing to the mixer. It is not an oversight and must not be "fixed". */
    this.bones = {};
    this.boneNames = [];
    this.mesh = null;
    this.cane = null;            // the source's own, already parented to CaneBone.001
    this.mixer = null;
    this.clips = new Map();
    this.action = null;
    this._disposables = [];
    this._matCache = new Map();
    this.info = { joints: 0, tris: 0, drawParts: 0, scale: 1, clips: 0, morphs: [], rigid: 0, skinned: 0 };
  }

  /**
   * @param {{gltf?: object, clips?: object, noTextures?: boolean}} [pre] offline callers hand in
   *   already-parsed GLTFs so the whole build can be measured with no browser, network or lock.
   */
  async init(pre = null) {
    this._noTex = !!pre?.noTextures;
    const loader = new GLTFLoader().setPath(BASE);
    const gltf = pre?.gltf || await loader.loadAsync('sly27.glb');
    const scene = gltf.scene;

    /* ---- 1. the source hierarchy, as authored ------------------------------------------- */
    scene.updateMatrixWorld(true);
    const skinned = [];
    const rigid = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      (o.isSkinnedMesh ? skinned : rigid).push(o);
      o.castShadow = true;
      o.receiveShadow = true;
      /* The character is always on screen and the camera can put him past a cascade edge; his
         own bounds are morph-driven and the loader's are not always tight. */
      o.frustumCulled = false;
    });
    if (!skinned.length) throw new Error('SlyModel27: sly27.glb carries no skinned mesh');
    this.info.joints = skinned[0].skeleton.bones.length;
    this.info.skinned = skinned.length;
    this.info.rigid = rigid.length;

    /* ---- 2. materials: the house cel shader, deduped per source material ------------------ */
    for (const m of [...skinned, ...rigid]) {
      const srcName = Array.isArray(m.material) ? m.material[0]?.name : m.material?.name;
      m.material = this._material(srcName, Array.isArray(m.material) ? m.material[0] : m.material);
      const g = m.geometry;
      this.info.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (g.morphAttributes?.position?.length && m.morphTargetDictionary) {
        for (const k of Object.keys(m.morphTargetDictionary)) if (!this.info.morphs.includes(k)) this.info.morphs.push(k);
      }
    }
    this.info.drawParts = skinned.length + rigid.length;

    /* ---- 3. the clips ------------------------------------------------------------------- */
    const clipGltf = pre?.clips || await loader.loadAsync('sly27-clips.glb');
    this.mixer = new THREE.AnimationMixer(scene);
    /* Keyed by the NORMALISED name (see `clipKey`), with the authored name kept beside it so the
       report can print what the file actually says rather than what we tidied it to. */
    for (const c of clipGltf.animations || []) this.clips.set(clipKey(c.name), c);
    this.info.clips = this.clips.size;
    this.info.authoredNames = (clipGltf.animations || []).map((c) => c.name);

    /* ---- 4. normalise: soles on the floor, uniform scale to the engine's character height --
     *
     * The convention every character here follows (`SlyModelGodot`, `SlyModelDLRig`): scale the
     * asset to `RIG3.TUNE.height` rather than move `Controller.TUNE.height`, which would change
     * the collision capsule, the camera frame and every tuned distance in the build.
     *
     * MEASURED AT THE REST CLIP, NOT AT BIND (§442). The bind pose of this asset is not a pose the
     * source ever shows — sampling the height there would size him off a pose nobody sees. The
     * mixer is stepped onto `Standupright` first, then the bounds are taken, so the number
     * describes the character as he actually stands. Applied to the ROOT as a transform, never
     * baked into the geometry: the skeleton drives these vertices and rewriting them would be
     * exactly the "modifying the source" this path exists to avoid. */
    this.root.add(scene);
    this._playRest();
    this.mixer.update(0);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3();
    for (const m of [...skinned, ...rigid]) {
      if (m.name === 'Cane_LowPoly') continue;      // the prop is not the body's height
      box.expandByObject(m);
    }
    if (!Number.isFinite(box.min.y) || !(box.max.y > box.min.y)) throw new Error('SlyModel27: degenerate bounding box');
    const rawH = box.max.y - box.min.y;
    const S = RIG3.TUNE.height / rawH;
    this.info.scale = S;
    this.info.rawHeight = rawH;
    this.root.scale.setScalar(S);
    /* Soles to y=0 in the ROOT's frame, after the scale, so the capsule and the drawn body agree. */
    scene.position.y -= box.min.y;
    this.root.updateMatrixWorld(true);
    this.root.userData.height = RIG3.TUNE.height;

    /* ---- 5. INTO THE SCENE ---------------------------------------------------------------
     *
     * `SlyModelGodot` and `SlyModelDLRig` both do this and nothing else does it for them: the
     * character module owns its own attachment. Leaving it out builds a complete, correctly
     * scaled, correctly posed character that renders NOTHING, and — this is the part worth
     * writing down — **no offline instrument can see it**. `sly27fit.mjs`, `tools/godot2sly27
     * .mjs` and every assertion in `tests/sly27.test.mjs` traverse `model.root`, which is a
     * perfectly good object whether or not it has a parent. They all passed on a build that drew
     * an empty courtyard. That is §439/§440 exactly: the instruments shared the subject's
     * assumption — that `root` is what matters — and could not falsify it. Only the frame could.
     * `tests/sly27.test.mjs` now asserts the attachment, in both directions. */
    this.engine?.scene?.add(this.root);

    this.mesh = skinned[0];
    this.cane = findNode(scene, 'Cane_LowPoly');
    this.caneBone = findNode(scene, 'CaneBone.001');
    /* The cane is the visible half of this whole import; if the loader ever renames it in a way
       `nodeVariants` does not cover, say so rather than shipping a caneless Sly in silence. */
    if (!this.cane || !this.caneBone) {
      this.engine?.warn?.('SlyModel27: Cane_LowPoly / CaneBone.001 did not resolve — the cane will not be posed. '
        + 'Check three\'s node-name sanitising against `nodeVariants`.');
    }

    this.engine?.warn?.(`SlyModel27: native rig — ${this.info.joints} joints, ${this.info.tris} tris, `
      + `${this.info.drawParts} parts, ${this.info.clips} clips, scale ${S.toFixed(4)} (raw ${rawH.toFixed(4)} m). `
      + `The procedural animation layer is intentionally inactive on this path.`);
    return this;
  }

  /** Material for one of the source's four, on the cel shader when it is available. Deduped, so
   *  the seven `BodyMat` parts share one material — and, where the merge allows, one draw. */
  _material(name, src) {
    const key = name || 'BodyMat';
    if (this._matCache.has(key)) return this._matCache.get(key);
    const T = RIG3.TUNE;
    const shading = this.engine?.get?.('shading');
    /* The loader already resolved the two albedos from the glb's own image URIs — that is the
       whole reason `godot2sly27.mjs` rewrites them to the committed atlas filenames. */
    const map = src?.map || null;
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.flipY = false;               // glTF convention; these UVs were authored against it
      map.anisotropy = 4;
    }
    const opts = {
      name: `sly27:${key}`, color: map ? 0xffffff : (FALLBACK[key] ?? 0xffffff), map,
      bands: T.bands, rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
      outline: T.outline, outlineColor: T.outlineColor,
    };
    const m = shading?.make ? shading.make(opts) : new THREE.MeshStandardMaterial({ color: opts.color, map, roughness: 0.85 });
    this._disposables.push(m);
    this._matCache.set(key, m);
    return m;
  }

  /* ------------------------------------------------------------------ clips --- */

  _playRest() { this.play(REST_CLIP, { loop: true, fade: 0 }); }

  /**
   * Cross-fade to one of the source's own clips, by its own name.
   * @returns {boolean} whether the clip exists — callers get a false rather than a throw, so a
   *   regenerated asset that dropped a clip degrades instead of taking the character down.
   */
  play(name, { loop = true, fade = 0.15 } = {}) {
    const clip = this.clips.get(clipKey(name));
    if (!clip || !this.mixer) return false;
    const next = this.mixer.clipAction(clip);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    if (this.action === next && next.isRunning()) return true;
    next.reset().play();
    if (this.action && this.action !== next && fade > 0) this.action.crossFadeTo(next, fade, false);
    else if (this.action && this.action !== next) this.action.stop();
    this.action = next;
    return true;
  }

  clipNames() { return [...this.clips.keys()]; }

  /* ------------------------------------------------------------------ frame --- */

  update(dt = 0) {
    if (this.mixer && dt > 0) this.mixer.update(dt);
  }

  /** Bind-pose world position of a bone, by SOURCE name. RIG3 names are not defined on this rig
   *  and asking for one returns undefined rather than a plausible wrong bone (§442). */
  bp(name) {
    const b = this.mesh?.skeleton?.bones?.find?.((x) => x.name === name);
    if (!b) return undefined;
    const i = this.mesh.skeleton.bones.indexOf(b);
    return new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().copy(this.mesh.skeleton.boneInverses[i]).invert(),
    );
  }

  dispose() {
    this.mixer?.stopAllAction?.();
    this.mixer = null;
    this.root.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    for (const d of this._disposables) d?.dispose?.();
    this._disposables.length = 0;
    this._matCache.clear();
    this.engine?.scene?.remove(this.root);
    this.root.parent?.remove(this.root);
  }
}

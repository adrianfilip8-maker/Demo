/**
 * SlyModelDL — a DOWNLOADED complete Sly mesh, auto-skinned onto the project's own skeleton.
 *
 * The user's 2026-08-07 instruction: pick the best completed downloadable Sly model and use it
 * directly; downloaded content is allowed so long as the final build stays SELF-CONTAINED. This
 * class is the self-contained half of that: the asset lives in the repo at src/assets/sly-dl.glb
 * and is bundled by vite (`new URL(..., import.meta.url)`) — the shipped build fetches nothing.
 *
 * THE PICK (recorded in task #20 and KNOWN_ISSUES): the PlayStation All-Stars Battle Royale Sly
 * — Sony's own cel-shaded modern Sly (~10.6k polys), the official "modern version of the Sly 3
 * model" the project brief asks for — with SAB64's rigged FBX port as the secondary source.
 * At the time this class was written every host carrying either (models-resource.com,
 * deviantart.com + wixmp CDN, sketchfab.com, rigmodels.com, plus archive.org / huggingface.co
 * mirrors) was blocked by the workspace egress proxy, so src/assets/sly-dl.glb currently holds
 * the Khronos RiggedFigure sample as a PIPELINE PLACEHOLDER. Replacing it with the real asset
 * is the whole swap: drop the GLB in, adjust DL_TUNE.yaw if the model faces the wrong way,
 * verify with a `?char=dl` capture, then flip the CHAR_MODELS default.
 *
 * WHY AUTO-SKIN INSTEAD OF USING THE ASSET'S OWN RIG: the game's animation is procedural clips
 * generated against the project skeleton's bone NAMES and IDENTITY BIND rotations (SlyModel /
 * SlyModel3 share them; RIG3 exports them). Re-skinning the downloaded mesh onto that skeleton
 * means zero changes to Rig/Animation/Shots/guards — the mesh is the deliverable, the rig is
 * already ours. A foreign rig would need a full retarget layer instead.
 *
 * Skinning: nearest-segment, two-bone blend. Each SKELETON edge (parent joint -> child joint)
 * is a capsule segment; a vertex projects onto the nearest core segment at parameter t and
 * weights (1-t) to the parent bone, t to the child — the same blend family the procedural
 * model's bone2/w2 rings use, generalized. Face-detail bones (jaw/capBrim/brows/ears) are
 * EXCLUDED from candidacy: the head owns the face; detail bones would steal cheek vertices.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from './SlyModel3.js';

const ASSET_URL = new URL('../assets/sly-dl.glb', import.meta.url);

const DL_TUNE = {
  yaw: 0,             // extra Y rotation if the asset faces off-axis (+Z forward is the target)
  heightScale: 1.0,   // multiplier on top of the height normalization, for hats/poses
  smoothK: 2.0,       // inverse-distance sharpness when a vertex sits between two segments
};

/* Core segments only — see header. Leaf joints get a short stub so hands/feet/tail tip own
   their surroundings. */
const CORE = new Set([
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'lowerArmL', 'handL',
  'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'toeL',
  'upperLegR', 'lowerLegR', 'footR', 'toeR',
  'tailA', 'tailB', 'tailC', 'tailD',
]);

export class SlyModel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'slydl';
    this.bones = {};
    this.boneNames = RIG3.BONE_ORDER;
    this.mesh = null;
    this._bindWorld = {};
    this._restQ = {};
  }

  async init() {
    /* ---- skeleton: byte-for-byte the SlyModel3 mechanism, from the exported contract ---- */
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

    /* ---- load the bundled asset ---- */
    const gltf = await new GLTFLoader().loadAsync(ASSET_URL.href);

    /* ---- flatten every mesh into world space, one geometry per material ---- */
    gltf.scene.updateMatrixWorld(true);
    const geos = [], mats = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      let g = o.geometry.clone();
      /* SkinnedMesh sources arrive in bind pose; static meshes carry node transforms. Either
         way the WORLD-SPACE shape is what we re-skin, so bake the matrix and drop any rig. */
      g.applyMatrix4(o.matrixWorld);
      for (const k of ['skinIndex', 'skinWeight']) if (g.attributes[k]) g.deleteAttribute(k);
      if (g.index) g = g.toNonIndexed();       // groups after merge stay per-source this way
      geos.push(g);
      mats.push(Array.isArray(o.material) ? o.material[0] : o.material);
    });
    if (!geos.length) throw new Error('SlyModelDL: asset has no meshes');
    const merged = mergeGeometries(geos, true);

    /* ---- normalize: feet at y=0, centred, TUNE.height tall, facing +Z ---- */
    merged.applyMatrix4(new THREE.Matrix4().makeRotationY(DL_TUNE.yaw));
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    const h = bb.max.y - bb.min.y;
    const s = (RIG3.TUNE.height / h) * DL_TUNE.heightScale;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    merged.translate(-cx, -bb.min.y, -cz);
    merged.scale(s, s, s);

    /* ---- auto-skin onto the project skeleton ---- */
    const segs = [];
    for (const [name, parent] of RIG3.SKELETON) {
      if (!CORE.has(name)) continue;
      const bChild = RIG3.BONE_ORDER.indexOf(name);
      if (parent === 'root') {
        /* hips: a stub around the joint itself */
        const p = new THREE.Vector3(...abs[name]);
        segs.push({ a: p, b: p.clone().add(new THREE.Vector3(0, 0.02, 0)), i0: bChild, i1: bChild });
        continue;
      }
      const bPar = RIG3.BONE_ORDER.indexOf(parent);
      segs.push({
        a: new THREE.Vector3(...abs[parent]),
        b: new THREE.Vector3(...abs[name]),
        i0: bPar, i1: bChild,
      });
      /* leaf stubs: extend past the joint so extremity vertices bind fully to the leaf bone */
      const isParentOfCore = RIG3.SKELETON.some(([n2, p2]) => p2 === name && CORE.has(n2));
      if (!isParentOfCore) {
        const a = new THREE.Vector3(...abs[parent]);
        const b = new THREE.Vector3(...abs[name]);
        const ext = b.clone().sub(a).normalize().multiplyScalar(0.08).add(b);
        segs.push({ a: b, b: ext, i0: bChild, i1: bChild });
      }
    }
    const pos = merged.attributes.position;
    const n = pos.count;
    const bidx = new Uint16Array(n * 4);
    const bwt = new Float32Array(n * 4);
    const v = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      let best = null;
      for (const sg of segs) {
        pa.subVectors(sg.b, sg.a);
        const L2 = pa.lengthSq();
        let t = L2 > 1e-12 ? pb.subVectors(v, sg.a).dot(pa) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d2 = pb.copy(sg.a).addScaledVector(pa, t).sub(v).lengthSq();
        if (!best || d2 < best.d2) best = { d2, t, i0: sg.i0, i1: sg.i1 };
      }
      const o = i * 4;
      bidx[o] = best.i0; bidx[o + 1] = best.i1;
      bwt[o] = 1 - best.t; bwt[o + 1] = best.t;
    }
    merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bidx, 4));
    merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bwt, 4));
    merged.computeVertexNormals();

    /* ---- materials through the project's toon factory, textures preserved ---- */
    const shading = this.engine?.get?.('shading');
    const hasVC = !!merged.attributes.color;
    const T = RIG3.TUNE;
    const finalMats = mats.map((m, i) => (shading?.make
      ? shading.make({
        name: `slydl:${m?.name || i}`, color: m?.color?.getHex?.() ?? 0xffffff,
        map: m?.map ?? null, vertexColors: hasVC, bands: T.bands,
        rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
        outline: T.outline, outlineColor: T.outlineColor,
      })
      : new THREE.MeshStandardMaterial({ color: m?.color ?? 0xffffff, map: m?.map ?? null, roughness: 0.85 })));

    this.mesh = new THREE.SkinnedMesh(merged, finalMats.length === 1 ? finalMats[0] : finalMats);
    this.mesh.name = 'slydl:mesh';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.add(boneList[0]);
    this.mesh.bind(skeleton);

    this.root.userData.height = RIG3.TUNE.height;
    this.root.userData.source = 'downloaded (see header: src/assets/sly-dl.glb)';
    this.root.updateMatrixWorld(true);
    for (const nm of RIG3.BONE_ORDER) this._restQ[nm] = this.bones[nm].quaternion.clone();

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

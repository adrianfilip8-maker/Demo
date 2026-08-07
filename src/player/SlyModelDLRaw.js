/**
 * SlyModelDLRaw — the supplied Sly model EXACTLY as imported, textured, and otherwise untouched.
 *
 * Reached under `?char=dlraw`. This exists because six successive attempts to make the imported
 * mesh deform correctly on the project's rig each failed on the tail, and the instruction was to
 * stop revising the mesh and simply put the textures on the model as supplied.
 *
 * WHAT IS AND IS NOT DONE HERE. The geometry is the asset's own, vertex for vertex: no
 * re-posing out of its T-pose, no auto-skin, no weight shaping, no normal recomputation — the
 * authored normals are kept as they came. The only transform is the uniform scale that fits it to
 * the world's 1.80 m character height, plus dropping the feet to the floor. Even the scale is
 * near-identity (the asset stands 1.853 m), and it is applied because a character that is the
 * wrong size against the architecture is not "faithful" in any useful sense.
 *
 * The 16 triangles with non-finite corners are still dropped. That is not a revision of the
 * model: OBJLoader manufactures those NaNs by resolving a face index against its vertex array as
 * it stands mid-parse, and a single NaN vertex propagates through the bounding box into every
 * position, rendering nothing at all. Dropping them recovers the asset; keeping them loses it.
 *
 * HOW IT MOVES, stated plainly because it is a real limitation rather than a detail. The full
 * project skeleton is built so ANIMATION and Rig bind and run as they expect, but every vertex is
 * weighted rigidly to `hips`. The model therefore translates and turns with the character and is
 * never deformed by a pose — it holds the T-pose it was authored in. That is the honest cost of
 * "unrevised": the arms are out because that is how the asset is built, and bringing them down is
 * exactly the kind of alteration this file exists to avoid.
 *
 * `SlyModelDL.js` keeps the full rigged integration and is unchanged; this is a sibling, not a
 * replacement, so neither approach costs the other.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from './SlyModel3.js';

const MESH_URL = new URL('../assets/sly-dl/sly.obj', import.meta.url);
const TEX_FILES = import.meta.glob('../assets/sly-dl/*.png', { eager: true, query: '?url', import: 'default' });

const TEX_FOR = { Sly_Body: 'sly_body', Sly_Eyeball: 'sly_eyeball', Sly_Head: 'sly_head', Sly_Tail: 'sly_tail' };
const FALLBACK = { Sly_Body: 0x2f5fc4, Sly_Eyeball: 0xd9821a, Sly_Head: 0xcfcdc4, Sly_Tail: 0x8d8b84 };

function textureFor(matName) {
  const stem = TEX_FOR[matName];
  if (!stem) return null;
  const key = Object.keys(TEX_FILES).find((k) => k.endsWith(`/${stem}.png`));
  return key ? TEX_FILES[key] : null;
}

/* Same recovery as the rigged path — see the header for why this is not a revision. */
function dropNonFiniteTriangles(g) {
  const pos = g.attributes.position;
  const tris = pos.count / 3;
  const keep = [];
  for (let t = 0; t < tris; t++) {
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const i = (t * 3 + k) * 3;
      if (!Number.isFinite(pos.array[i]) || !Number.isFinite(pos.array[i + 1]) || !Number.isFinite(pos.array[i + 2])) ok = false;
    }
    if (ok) keep.push(t);
  }
  if (keep.length === tris) return { geo: g, dropped: 0 };
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize, span = 3 * n;
    const arr = new a.array.constructor(keep.length * span);
    for (let j = 0; j < keep.length; j++) arr.set(a.array.subarray(keep[j] * span, keep[j] * span + span), j * span);
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  return { geo: out, dropped: tris - keep.length };
}

export class SlyModel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'slydlraw';
    this.bones = {};
    this.boneNames = RIG3.BONE_ORDER;
    this.mesh = null;
    this._bindWorld = {};
    this._restQ = {};
  }

  async init() {
    /* Skeleton: built in full so ANIMATION/Rig bind and run normally. Nothing is weighted to it
       except hips, so it drives the model's placement and never its shape. */
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

    const obj = await new OBJLoader().loadAsync(MESH_URL.href);
    obj.updateMatrixWorld(true);

    const geos = [], matNames = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      let g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      const r = dropNonFiniteTriangles(g);
      geos.push(r.geo);
      matNames.push((Array.isArray(o.material) ? o.material[0] : o.material)?.name ?? `mat${geos.length}`);
    });
    if (!geos.length) throw new Error('SlyModelDLRaw: asset has no meshes');

    for (const g of geos) {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();     // only if the asset supplied none
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    const merged = mergeGeometries(geos, true);

    /* The only transform: feet to the floor, uniform scale to the world's character height. */
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    if (![bb.min.y, bb.max.y].every(Number.isFinite) || !(bb.max.y > bb.min.y)) {
      throw new Error('SlyModelDLRaw: non-finite or degenerate bounding box — refusing to scale');
    }
    const s = RIG3.TUNE.height / (bb.max.y - bb.min.y);
    merged.translate(0, -bb.min.y, 0);
    merged.scale(s, s, s);

    /* Rigid to hips: the model is carried by the character, never reshaped by it. */
    const n = merged.attributes.position.count;
    const hips = RIG3.BONE_ORDER.indexOf('hips');
    const bidx = new Uint16Array(n * 4);
    const bwt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { bidx[i * 4] = hips; bwt[i * 4] = 1; }
    merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bidx, 4));
    merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bwt, 4));

    const shading = this.engine?.get?.('shading');
    const T = RIG3.TUNE;
    const loader = new THREE.TextureLoader();
    const missing = [];
    const materials = matNames.map((nm) => {
      const url = textureFor(nm);
      if (!url) missing.push(nm);
      let map = null;
      if (url) {
        map = loader.load(url);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 4;
      }
      return shading?.make
        ? shading.make({
          name: `slydlraw:${nm}`, color: map ? 0xffffff : (FALLBACK[nm] ?? 0xcccccc), map,
          bands: T.bands, rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
          outline: T.outline, outlineColor: T.outlineColor,
        })
        : new THREE.MeshStandardMaterial({ color: map ? 0xffffff : (FALLBACK[nm] ?? 0xcccccc), map, roughness: 0.85 });
    });
    if (missing.length) this.engine?.warn?.(`SlyModelDLRaw: no texture for ${missing.join(', ')}`);

    this.mesh = new THREE.SkinnedMesh(merged, materials.length === 1 ? materials[0] : materials);
    this.mesh.name = 'slydlraw:mesh';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.add(boneList[0]);
    this.mesh.bind(skeleton);

    this.root.userData.height = RIG3.TUNE.height;
    this.root.userData.faithful = true;
    this.root.updateMatrixWorld(true);
    for (const nm of RIG3.BONE_ORDER) this._restQ[nm] = this.bones[nm].quaternion.clone();
    this.engine?.scene?.add(this.root);
  }

  bp(name) { return this._bindWorld[name]; }
  update() { /* nothing: the model is carried by hips and never reshaped */ }
  dispose() {
    this.mesh?.geometry?.dispose?.();
    const mm = this.mesh?.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x?.map?.dispose?.(); x?.dispose?.(); });
    this.root.parent?.remove(this.root);
    this.mesh = null;
  }
}

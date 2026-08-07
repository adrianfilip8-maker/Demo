/**
 * SlyModelDLRig — the supplied model, unrevised, on its OWN artist rig.
 *
 * This is the answer to "rig the unrevised one", and it is the approach I should have taken from
 * the start. The supplied FBX carries a full production rig: 117 bones and artist-authored skin
 * weights on all four meshes. Every previous attempt discarded that and auto-generated weights
 * from bone-segment distance, which was adequate for limbs and never worked on the tail — the
 * artist spreads the tail across TWELVE bones with hand-tuned falloff, and no nearest-segment
 * heuristic reproduces that.
 *
 * WHAT IS PRESERVED. The mesh is the asset's own, vertex for vertex, with its authored normals
 * and its four textures — the same geometry as `SlyModelDLRaw`, which is why this counts as
 * rigging the unrevised model rather than another revision of it. The skin weights are the
 * artist's, not mine.
 *
 * WHAT IS TRANSLATED, and why translation is necessary at all. The game's animation is procedural:
 * Rig and Animation pose bones BY NAME against this project's skeleton, with identity bind
 * rotations. Driving the FBX's 117-bone hierarchy instead would need a full retarget layer and
 * would leave every clip, spring chain, shot and guard interaction to be rewritten. So the
 * artist's weights are re-expressed over OUR bones:
 *
 *   1. each FBX bone maps to the project bone it corresponds to (`BONE_MAP`), and every
 *      unmapped bone — face, fingers, ears, brows, the hat — folds into its nearest mapped
 *      ancestor, so its influence is kept rather than dropped;
 *   2. per vertex, the FBX influences are accumulated per project bone, the four strongest kept,
 *      and the result renormalised. The artist's RELATIVE weighting survives; only the bone
 *      count collapses;
 *   3. the mesh is carried from the FBX's bind pose into ours by the same per-bone
 *      rotate/scale/translate used elsewhere — now driven by good weights instead of guessed ones.
 *
 * The twelve tail bones collapse onto our four, which is a real loss of articulation. What it is
 * not is a loss of SMOOTHNESS: the artist's falloff across those twelve becomes a smooth blend
 * across our four, which is exactly the property my nearest-segment weighting could not produce
 * and the reason the tail kept collapsing into a flat fan.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from './SlyModel3.js';

const FBX_URL = new URL('../assets/sly-dl/sly.fbx', import.meta.url);
const TEX_FILES = import.meta.glob('../assets/sly-dl/*.png', { eager: true, query: '?url', import: 'default' });

/* FBX bone -> project bone. Everything absent folds into its nearest mapped ancestor at load. */
const BONE_MAP = {
  a_body: 'hips', pelvis: 'hips',
  lower_back: 'spine', mid_back: 'spine',
  chest: 'chest', top_shoulders: 'chest',
  base_neck: 'neck', mid_neck: 'neck',
  base_head: 'head',
  L_clavicle: 'shoulderL', LF_shoulder: 'upperArmL', LF_elbow: 'lowerArmL', LF_wrist: 'handL',
  RT_clavicle: 'shoulderR', RT_shoulder: 'upperArmR', RT_elbow: 'lowerArmR', RT_wrist: 'handR',
  LF_hip: 'upperLegL', LF_knee: 'lowerLegL', LF_ankle: 'footL', LF_ball: 'toeL',
  RT_hip: 'upperLegR', RT_knee: 'lowerLegR', RT_ankle: 'footR', RT_ball: 'toeR',
  /* Twelve tail bones onto four, chosen by arc position against our chain
     (ours run z = -0.165, -0.517, -0.853, -1.122 against the asset's -22 … -127). */
  tail_base: 'tailA', tail1: 'tailA', tail2: 'tailA',
  tail3: 'tailB', tail4: 'tailB', tail6: 'tailB',
  tail7: 'tailC', tail8: 'tailC', tail9: 'tailC',
  tail11: 'tailD', tail12: 'tailD', tail_tip: 'tailD',
  staff: 'handR',                       // the cane, held in the right hand
  LF_ear_base: 'earL', LF_ear_mid: 'earL', RT_ear_base: 'earR', RT_ear_mid: 'earR',
  jaw: 'jaw', hat: 'capBrim',
};

const TEX_BY_PART = { body: 'sly_body', eyeball: 'sly_eyeball', head: 'sly_head', tail: 'sly_tail' };
const FALLBACK = { body: 0x2f5fc4, eyeball: 0xd9821a, head: 0xcfcdc4, tail: 0x8d8b84 };

const partOf = (name = '') => (/tail/i.test(name) ? 'tail' : /eyeball/i.test(name) ? 'eyeball'
  : /head/i.test(name) ? 'head' : 'body');

function textureUrl(part) {
  const stem = TEX_BY_PART[part];
  const key = Object.keys(TEX_FILES).find((k) => k.endsWith(`/${stem}.png`));
  return key ? TEX_FILES[key] : null;
}

function dropNonFiniteTriangles(g) {
  const pos = g.attributes.position, tris = pos.count / 3, keep = [];
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
    this.root.name = 'slydlrig';
    this.bones = {};
    this.boneNames = RIG3.BONE_ORDER;
    this.mesh = null;
    this._bindWorld = {};
    this._restQ = {};
  }

  async init() {
    /* ---- project skeleton ---- */
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

    /* ---- the asset, rig and all ---- */
    const fbx = await new FBXLoader().loadAsync(FBX_URL.href);
    fbx.updateMatrixWorld(true);

    const skinned = [];
    fbx.traverse((o) => { if (o.isSkinnedMesh && o.geometry?.attributes?.skinWeight) skinned.push(o); });
    if (!skinned.length) throw new Error('SlyModelDLRig: FBX carries no skinned meshes');
    const srcSkel = skinned[0].skeleton;

    /* FBX bone index -> project bone index, folding unmapped bones into the nearest mapped
       ancestor so their influence is kept rather than silently dropped. */
    const resolve = (bone) => {
      for (let b = bone; b; b = b.parent) {
        if (b.name && BONE_MAP[b.name]) return BONE_MAP[b.name];
        if (!b.isBone) break;
      }
      return 'hips';
    };
    const fbxToOurs = srcSkel.bones.map((b) => RIG3.BONE_ORDER.indexOf(resolve(b)));
    const folded = srcSkel.bones.filter((b) => !BONE_MAP[b.name]).length;

    /* FBX bind-pose world positions, from the inverse bind matrices (authoritative, and
       independent of whatever pose the file happens to be left in). */
    const srcPos = {};
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    srcSkel.bones.forEach((b, i) => {
      const nm = BONE_MAP[b.name];
      if (!nm || srcPos[nm]) return;                       // first mapped bone wins the slot
      m.copy(srcSkel.boneInverses[i]).invert();
      srcPos[nm] = v.setFromMatrixPosition(m).clone();
    });

    /* ---- geometry: world space, per part, sanitized ---- */
    const geos = [], parts = [];
    let dropped = 0;
    for (const sm of skinned) {
      let g = sm.geometry.clone();
      /* SkinnedMesh geometry is authored in bind space; its own matrixWorld is the bind
         transform, so baking it puts every part into one shared space. */
      g.applyMatrix4(sm.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      const r = dropNonFiniteTriangles(g);
      dropped += r.dropped;
      geos.push(r.geo);
      parts.push(partOf(sm.name));
    }
    if (dropped) this.engine?.warn?.(`SlyModelDLRig: dropped ${dropped} triangle(s) with non-finite corners`);

    for (const g of geos) {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const k of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      }
    }
    const merged = mergeGeometries(geos, true);
    if (!merged) throw new Error('SlyModelDLRig: merge failed — parts disagree on attributes');

    /* ---- normalize: feet to the floor, uniform scale to our character height ---- */
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    if (![bb.min.y, bb.max.y].every(Number.isFinite) || !(bb.max.y > bb.min.y)) {
      throw new Error('SlyModelDLRig: non-finite or degenerate bounding box');
    }
    const S = RIG3.TUNE.height / (bb.max.y - bb.min.y);
    const yOff = -bb.min.y;
    merged.translate(0, yOff, 0);
    merged.scale(S, S, S);
    /* the same transform, applied to the FBX bind positions so both live in one space */
    for (const k of Object.keys(srcPos)) srcPos[k] = srcPos[k].clone().setY(srcPos[k].y + yOff).multiplyScalar(S);

    /* ---- re-express the artist's weights over our bones ---- */
    const si = merged.attributes.skinIndex, sw = merged.attributes.skinWeight;
    const n = merged.attributes.position.count;
    const bidx = new Uint16Array(n * 4), bwt = new Float32Array(n * 4);
    const bucket = new Map();
    for (let i = 0; i < n; i++) {
      bucket.clear();
      for (let k = 0; k < 4; k++) {
        const w = sw.array[i * 4 + k];
        if (!(w > 0)) continue;
        const ours = fbxToOurs[si.array[i * 4 + k]];
        if (ours < 0) continue;
        bucket.set(ours, (bucket.get(ours) || 0) + w);
      }
      const top = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, e) => s + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        bidx[i * 4 + k] = top[k] ? top[k][0] : 0;
        bwt[i * 4 + k] = top[k] ? top[k][1] / sum : 0;
      }
    }

    /* ---- carry the mesh from the FBX bind pose into ours ---- */
    const firstCoreChild = {};
    for (const [nm, par] of RIG3.SKELETON) if (!firstCoreChild[par]) firstCoreChild[par] = nm;
    const rot = {};
    for (const [nm, par] of RIG3.SKELETON) {
      const kid = firstCoreChild[nm];
      if (kid && srcPos[nm] && srcPos[kid]) {
        const dS = srcPos[kid].clone().sub(srcPos[nm]);
        const dO = new THREE.Vector3(...abs[kid]).sub(new THREE.Vector3(...abs[nm]));
        const lS = dS.length(), lO = dO.length();
        rot[nm] = (lS > 1e-6 && lO > 1e-6)
          ? { q: new THREE.Quaternion().setFromUnitVectors(dS.divideScalar(lS), dO.divideScalar(lO)), sc: lO / lS }
          : { q: new THREE.Quaternion(), sc: 1 };
      } else rot[nm] = rot[par] || { q: new THREE.Quaternion(), sc: 1 };
    }
    const M = RIG3.BONE_ORDER.map((nm) => {
      const r = rot[nm] || { q: new THREE.Quaternion(), sc: 1 };
      const from = srcPos[nm] || new THREE.Vector3(...abs[nm]);
      return new THREE.Matrix4()
        .compose(new THREE.Vector3(...abs[nm]), r.q, new THREE.Vector3(r.sc, r.sc, r.sc))
        .multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
    });
    const Q = RIG3.BONE_ORDER.map((nm) => (rot[nm] ? rot[nm].q : new THREE.Quaternion()));

    const pos = merged.attributes.position, nrm = merged.attributes.normal;
    const p0 = new THREE.Vector3(), pa = new THREE.Vector3(), pt = new THREE.Vector3();
    const n0 = new THREE.Vector3(), na = new THREE.Vector3(), nt = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p0.fromBufferAttribute(pos, i); pa.set(0, 0, 0);
      n0.fromBufferAttribute(nrm, i); na.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = bwt[i * 4 + k];
        if (w > 0) {
          pa.addScaledVector(pt.copy(p0).applyMatrix4(M[bidx[i * 4 + k]]), w);
          na.addScaledVector(nt.copy(n0).applyQuaternion(Q[bidx[i * 4 + k]]), w);
        }
      }
      pos.setXYZ(i, pa.x, pa.y, pa.z);
      if (na.lengthSq() > 1e-12) { na.normalize(); nrm.setXYZ(i, na.x, na.y, na.z); }
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;

    merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bidx, 4));
    merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bwt, 4));
    /* authored normals are carried above — never recomputed (non-indexed input would go faceted) */

    /* ---- materials ---- */
    const shading = this.engine?.get?.('shading');
    const T = RIG3.TUNE;
    const loader = new THREE.TextureLoader();
    const materials = parts.map((part) => {
      const url = textureUrl(part);
      let map = null;
      if (url) { map = loader.load(url); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
      return shading?.make
        ? shading.make({
          name: `slydlrig:${part}`, color: map ? 0xffffff : FALLBACK[part], map,
          bands: T.bands, rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
          outline: T.outline, outlineColor: T.outlineColor,
        })
        : new THREE.MeshStandardMaterial({ color: map ? 0xffffff : FALLBACK[part], map, roughness: 0.85 });
    });

    this.mesh = new THREE.SkinnedMesh(merged, materials.length === 1 ? materials[0] : materials);
    this.mesh.name = 'slydlrig:mesh';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.add(boneList[0]);
    this.mesh.bind(skeleton);

    this.root.userData.height = RIG3.TUNE.height;
    this.root.userData.artistWeights = true;
    this.root.userData.foldedBones = folded;
    this.root.updateMatrixWorld(true);
    for (const nm of RIG3.BONE_ORDER) this._restQ[nm] = this.bones[nm].quaternion.clone();
    this.engine?.scene?.add(this.root);
  }

  bp(name) { return this._bindWorld[name]; }
  update() { /* all motion comes from Rig/Animation */ }
  dispose() {
    this.mesh?.geometry?.dispose?.();
    const mm = this.mesh?.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => { x?.map?.dispose?.(); x?.dispose?.(); });
    this.root.parent?.remove(this.root);
    this.mesh = null;
  }
}

/**
 * SlyModelDL — the supplied complete Sly mesh, auto-skinned onto the project's own skeleton.
 *
 * The asset is the user-supplied Sly Cooper model (`src/assets/sly-dl/sly.obj` + `sly.mtl`):
 * 6,753 verts / 13,321 tris across four UV-mapped material groups — body, eyeball, head, tail.
 * It arrives already in our coordinate convention: feet at y = 0, 1.853 m tall (against
 * TUNE.height 1.80), symmetric in x, tail trailing −Z, so +Z is forward. Normalization below
 * still runs — it is cheap and it makes the class asset-agnostic rather than tuned to one file.
 *
 * SELF-CONTAINED, which is the standing constraint on downloaded content: the mesh and any
 * textures are bundled by vite through `new URL(..., import.meta.url)` and `import.meta.glob`.
 * The shipped build fetches nothing at runtime.
 *
 * WHY OBJ AND NOT THE FBX/DAE: those carry the asset's own armature, and this class deliberately
 * throws a foreign rig away. The game's animation is procedural — clips are generated against
 * THIS project's bone names and identity bind rotations (SlyModel/SlyModel3 share them; RIG3
 * exports them). Re-skinning the mesh onto that skeleton means Rig, Animation, Controller,
 * CameraRig, Shots and the guard solver all keep working untouched. Keeping the foreign rig
 * would instead require a full retarget layer, for no gain — the mesh is what we wanted, the rig
 * was already ours.
 *
 * Skinning: nearest-segment, two-bone blend. Each skeleton edge (parent joint → child joint) is
 * a segment; a vertex projects onto the nearest one at parameter t and weights (1−t) to the
 * parent, t to the child — the same blend family the procedural model's own rings use.
 * Face-detail bones (jaw/capBrim/brows/ears) are excluded from candidacy so the head owns the
 * face; leaf joints get a stub segment past the joint so hands, feet and the tail tip bind fully.
 *
 * TEXTURES are optional by design, via `import.meta.glob` — the same graceful-degradation
 * pattern main.js uses for modules. Drop `sly_body.png`, `sly_eyeball.png`, `sly_head.png`,
 * `sly_tail.png` into `src/assets/sly-dl/` and each material picks its map up automatically. Any
 * that are absent fall back to the flat palette below, so the build never breaks on a missing
 * file and no placeholder can silently ship pretending to be the real atlas.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG3 } from './SlyModel3.js';

const MESH_URL = new URL('../assets/sly-dl/sly.obj', import.meta.url);

/* Optional texture set. Empty object when the PNGs are not present — see header. */
const TEX_FILES = import.meta.glob('../assets/sly-dl/*.png', { eager: true, query: '?url', import: 'default' });

/* Per-material fallback colour, used only where the matching texture is absent. Values are the
   SPEC-sly3model palette this project already read from the reference atlas, so an untextured
   boot still reads as Sly rather than as grey clay. */
const MAT_FALLBACK = {
  Sly_Body: 0x2f5fc4,       // tunic/cap/gloves/boots dominate this atlas
  Sly_Eyeball: 0xd9821a,
  Sly_Head: 0xcfcdc4,
  Sly_Tail: 0x8d8b84,
};

const DL_TUNE = {
  yaw: 0,             // extra Y rotation if a future asset faces off-axis (+Z forward is target)
  heightScale: 1.0,   // multiplier on top of height normalization
  /* Re-centre the mesh on its bounding box in x/z. OFF, deliberately: this asset is authored
     about its own root — feet land at y = -0.0002 and x is centred to 0.001 — so its z = 0 is
     the author's root too. Centring on the BOX instead would drag the body ~0.21 m forward to
     counterweight the tail, which reaches z = -1.278 while the front of the model only reaches
     +0.854. The character would then stand off the mark every shot frames. Turn on only for an
     asset that is genuinely off-origin, and check the tail is not doing the same thing there. */
  recentreXZ: false,
};

/* Core segments only — see header. */
const CORE = new Set([
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'lowerArmL', 'handL',
  'shoulderR', 'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'toeL',
  'upperLegR', 'lowerLegR', 'footR', 'toeR',
  'tailA', 'tailB', 'tailC', 'tailD',
]);

/**
 * Drop triangles with a non-finite corner, returning a fresh non-indexed geometry.
 *
 * WHY THIS EXISTS, because it looks like paranoia and is not. OBJLoader resolves a positive face
 * index against its vertex array AS IT STANDS WHEN THE FACE IS PARSED. This asset's last faces in
 * three of its four parts reference that part's highest vertex indices — including 6753, the very
 * last vertex in the file — and read past the end, yielding `undefined` → NaN. The file itself is
 * valid: 6,753 finite `v` lines, every face a triangle, every index within 1…6753, no zero or
 * negative refs. All 48 poisoned floats (16 vertices of 39,963) came from the loader.
 *
 * Left alone this is catastrophic rather than cosmetic: 16 NaN vertices make the bounding box NaN,
 * which makes the height-normalization scale NaN, which multiplies EVERY position to NaN — and a
 * fully-NaN mesh draws nothing at all. That is exactly how this model reached the first capture
 * invisible, with healthy bones, materials, textures and scene graph, and no clue in the log.
 */
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

function textureFor(matName) {
  const stem = {
    Sly_Body: 'sly_body', Sly_Eyeball: 'sly_eyeball', Sly_Head: 'sly_head', Sly_Tail: 'sly_tail',
  }[matName];
  if (!stem) return null;
  const key = Object.keys(TEX_FILES).find((k) => k.endsWith(`/${stem}.png`));
  return key ? TEX_FILES[key] : null;
}

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
    /* ---- skeleton: the SlyModel3 mechanism, from the exported contract ---- */
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

    /* ---- load the bundled mesh ---- */
    const obj = await new OBJLoader().loadAsync(MESH_URL.href);
    obj.updateMatrixWorld(true);

    const geos = [], matNames = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      /* OBJLoader emits one mesh per material group, so groups are already per-material; when a
         mesh does carry several, split so each geometry keeps a single material identity. */
      if (g.groups?.length > 1 && mats.length > 1) {
        for (let i = 0; i < g.groups.length; i++) {
          const gr = g.groups[i];
          const sub = g.clone();
          sub.setDrawRange(0, Infinity);
          const slice = new THREE.BufferGeometry();
          for (const key of Object.keys(g.attributes)) {
            const a = g.attributes[key];
            const arr = a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize);
            slice.setAttribute(key, new THREE.BufferAttribute(arr, a.itemSize));
          }
          geos.push(slice);
          matNames.push(mats[gr.materialIndex]?.name ?? `mat${i}`);
          sub.dispose();
        }
      } else {
        geos.push(g);
        matNames.push(mats[0]?.name ?? 'mat0');
      }
    });
    if (!geos.length) throw new Error('SlyModelDL: asset has no meshes');

    /* Sanitize per part, BEFORE the merge, so the group boundaries stay right (see
       dropNonFiniteTriangles' header for what this is defending against and why it matters). */
    let dropped = 0;
    for (let i = 0; i < geos.length; i++) {
      const r = dropNonFiniteTriangles(geos[i]);
      if (r.dropped) { geos[i] = r.geo; dropped += r.dropped; }
    }
    if (dropped) this.engine?.warn?.(`SlyModelDL: dropped ${dropped} triangle(s) with non-finite corners (OBJLoader forward-reference; see dropNonFiniteTriangles)`);
    this._droppedTris = dropped;

    /* Uniform attribute set across parts, so the merge cannot silently drop one. */
    for (const g of geos) {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    const merged = mergeGeometries(geos, true);   // groups preserved, one per source part

    /* ---- normalize: feet at y=0, centred in x/z, TUNE.height tall, facing +Z ---- */
    merged.applyMatrix4(new THREE.Matrix4().makeRotationY(DL_TUNE.yaw));
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    /* Fail LOUDLY rather than invisibly. A single non-finite position makes this box NaN, the
       scale below NaN, and then every position NaN — which renders as a perfectly healthy-looking
       model that simply is not there. That cost a full capture round to diagnose; it will not
       cost a second one. */
    if (![bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite) || !(bb.max.y > bb.min.y)) {
      throw new Error(`SlyModelDL: bounding box is non-finite or degenerate after sanitize (${JSON.stringify(bb.min)} .. ${JSON.stringify(bb.max)}) — refusing to normalize`);
    }
    const s = (RIG3.TUNE.height / (bb.max.y - bb.min.y)) * DL_TUNE.heightScale;
    merged.translate(
      DL_TUNE.recentreXZ ? -(bb.min.x + bb.max.x) / 2 : 0,
      -bb.min.y,                                        // feet to the floor, always
      DL_TUNE.recentreXZ ? -(bb.min.z + bb.max.z) / 2 : 0,
    );
    merged.scale(s, s, s);

    /* ---- the ASSET's own bind pose, which is NOT ours -------------------------------------
     *
     * Measured from the mesh, post-normalization: it is a narrow column (max |x| 0.20-0.27) at
     * every height except y 1.2-1.4, where |x| reaches 0.946 across 1,900 vertices, with the arm's
     * y pinned at 1.272 the whole way out. The asset is T-POSED. Our skeleton's arms hang down
     * (hand at x 0.515, y 0.974), and its tail sweeps to +x while the asset's runs straight back.
     *
     * Skinning a T-posed mesh against a relaxed skeleton binds the outstretched arms to whatever
     * bone happens to be nearest — torso, head — and the first capture showed exactly that. So the
     * weights are solved against the ASSET's pose, and the mesh is then re-posed into OURS before
     * binding. Fractions of TUNE.height, not metres, so the figures survive a height change.
     */
    const H = RIG3.TUNE.height;
    const srcAbs = { ...abs };
    {
      const ARM_Y = 0.7067 * H, ARM_Z = -0.0056 * H;
      for (const [S, side] of [['L', 1], ['R', -1]]) {
        srcAbs[`upperArm${S}`] = [side * 0.1222 * H, ARM_Y, ARM_Z];   // where the arm leaves the torso
        srcAbs[`lowerArm${S}`] = [side * 0.2906 * H, ARM_Y, ARM_Z];   // elbow, at our bone-length ratio
        srcAbs[`hand${S}`] = [side * 0.4611 * H, ARM_Y, ARM_Z];       // wrist; fingers run to 0.946
      }
      srcAbs.tailA = [0, 0.5000 * H, -0.0994 * H];
      srcAbs.tailB = [0, 0.4889 * H, -0.2944 * H];
      srcAbs.tailC = [0, 0.4722 * H, -0.4889 * H];
      srcAbs.tailD = [0, 0.4556 * H, -0.6889 * H];
    }

    /* ---- auto-skin, solved in the ASSET's pose ---- */
    const segs = [];
    for (const [name, parent] of RIG3.SKELETON) {
      if (!CORE.has(name)) continue;
      const iChild = RIG3.BONE_ORDER.indexOf(name);
      if (parent === 'root') {
        const p = new THREE.Vector3(...srcAbs[name]);
        segs.push({ a: p, b: p.clone().setY(p.y + 0.02), i0: iChild, i1: iChild });
        continue;
      }
      const iPar = RIG3.BONE_ORDER.indexOf(parent);
      const a = new THREE.Vector3(...srcAbs[parent]);
      const b = new THREE.Vector3(...srcAbs[name]);
      segs.push({ a, b, i0: iPar, i1: iChild });
      const parentOfCore = RIG3.SKELETON.some(([n2, p2]) => p2 === name && CORE.has(n2));
      if (!parentOfCore) {
        const ext = b.clone().sub(a).normalize().multiplyScalar(0.08).add(b);
        segs.push({ a: b.clone(), b: ext, i0: iChild, i1: iChild });
      }
    }
    const pos = merged.attributes.position;
    const n = pos.count;
    const bidx = new Uint16Array(n * 4);
    const bwt = new Float32Array(n * 4);
    const v = new THREE.Vector3(), ab = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      let best = null;
      for (const sg of segs) {
        ab.subVectors(sg.b, sg.a);
        const L2 = ab.lengthSq();
        let t = L2 > 1e-12 ? tmp.subVectors(v, sg.a).dot(ab) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d2 = tmp.copy(sg.a).addScaledVector(ab, t).sub(v).lengthSq();
        if (!best || d2 < best.d2) best = { d2, t, i0: sg.i0, i1: sg.i1 };
      }
      /* Weight shaping, and it is the difference between a limb and a ribbon.
       *
       * The naive reading of the segment parameter — w = (1−t, t) — puts a vertex halfway along a
       * bone at 50/50 between that bone and the next one. That is wrong on its own terms: the span
       * from joint A to joint B *is* bone A's body, and should be rigid to A, blending toward B
       * only as it nears the joint. Worse, a 50/50 blend of two divergent transforms lands the
       * vertex on the average of them, which sits INSIDE the bend — so every bone body pinches
       * toward the chord as the chain flexes. On the tail, four spring-driven bones each pinching
       * at their midpoint collapsed the tube into a flat fan.
       *
       * So: rigid along the bone, ramping across the last BLEND of the segment. A vertex arriving
       * at joint B from the A side reaches 100 % B exactly as a vertex on the B→C segment starts
       * at 100 % B, so the two segments agree about the joint they share. */
      const BLEND = 0.35;
      const tw = best.t <= 1 - BLEND ? 0 : (best.t - (1 - BLEND)) / BLEND;
      const o = i * 4;
      bidx[o] = best.i0; bidx[o + 1] = best.i1;
      bwt[o] = 1 - tw; bwt[o + 1] = tw;
    }
    /* A NaN vertex would have produced NaN `t` here, and since every comparison against NaN is
       false the nearest-segment loop would silently keep its FIRST candidate — binding the whole
       mesh rigidly to hips at weight NaN. Assert instead: the sanitize above should make this
       unreachable, and if it ever is reached the message says which invariant broke. */
    for (let i = 0; i < bwt.length; i++) {
      if (!Number.isFinite(bwt[i])) throw new Error(`SlyModelDL: non-finite skin weight at ${i} — sanitize did not cover this input`);
    }

    /* ---- REBIND: carry the mesh from the asset's pose into ours -----------------------------
     *
     * Both skeletons hold identity bind rotations (the Rig contract), so a bone's bind transform
     * is fixed entirely by its own position and the direction of its limb. For each bone we take
     * the rotation that turns its ASSET-pose limb direction onto its OURS-pose direction, plus the
     * length ratio, and apply it about that bone's asset-pose joint:
     *
     *     M = T(ours) · R(src→ours) · S(len ratio) · T(−src)
     *
     * then move every vertex by the same two-bone blend that skins it. Rotating rather than merely
     * translating is the whole point: a translation would drag the T-posed arm down while leaving
     * it horizontal. The scale term makes the asset's limbs match OUR bone lengths, so joints land
     * on bones and the procedural clips — authored against these proportions — drive it cleanly.
     *
     * Leaf bones (hands, toes, tailD, head) have no limb of their own, so they inherit their
     * parent's rotation instead of inventing one.
     */
    {
      const firstCoreChild = {};
      for (const [nm, par] of RIG3.SKELETON) {
        if (CORE.has(nm) && CORE.has(par) && !firstCoreChild[par]) firstCoreChild[par] = nm;
      }
      const rot = {};                                   // name -> { q, sc }
      for (const [nm, par] of RIG3.SKELETON) {
        if (!CORE.has(nm)) continue;
        const kid = firstCoreChild[nm];
        if (kid) {
          const dS = new THREE.Vector3(...srcAbs[kid]).sub(new THREE.Vector3(...srcAbs[nm]));
          const dO = new THREE.Vector3(...abs[kid]).sub(new THREE.Vector3(...abs[nm]));
          const lS = dS.length(), lO = dO.length();
          rot[nm] = (lS > 1e-6 && lO > 1e-6)
            ? { q: new THREE.Quaternion().setFromUnitVectors(dS.divideScalar(lS), dO.divideScalar(lO)), sc: lO / lS }
            : { q: new THREE.Quaternion(), sc: 1 };
        } else {
          rot[nm] = rot[par] || { q: new THREE.Quaternion(), sc: 1 };   // leaf inherits
        }
      }
      const M = RIG3.BONE_ORDER.map((nm) => {
        const r = rot[nm];
        if (!r) return new THREE.Matrix4();
        return new THREE.Matrix4()
          .compose(new THREE.Vector3(...abs[nm]), r.q, new THREE.Vector3(r.sc, r.sc, r.sc))
          .multiply(new THREE.Matrix4().makeTranslation(-srcAbs[nm][0], -srcAbs[nm][1], -srcAbs[nm][2]));
      });
      const src = new THREE.Vector3(), acc = new THREE.Vector3(), tmp2 = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        src.fromBufferAttribute(pos, i);
        acc.set(0, 0, 0);
        for (let k = 0; k < 2; k++) {
          const w = bwt[i * 4 + k];
          if (w > 0) acc.addScaledVector(tmp2.copy(src).applyMatrix4(M[bidx[i * 4 + k]]), w);
        }
        pos.setXYZ(i, acc.x, acc.y, acc.z);
      }
      pos.needsUpdate = true;
      merged.computeBoundingBox();
      const rb = merged.boundingBox;
      if (![rb.min.y, rb.max.y].every(Number.isFinite)) throw new Error('SlyModelDL: rebind produced a non-finite mesh');
      this._rebindBBox = [rb.min.toArray().map((v) => +v.toFixed(3)), rb.max.toArray().map((v) => +v.toFixed(3))];
    }

    merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bidx, 4));
    merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bwt, 4));
    merged.computeVertexNormals();

    /* ---- materials: project toon factory, one per source part, textures when present ---- */
    const shading = this.engine?.get?.('shading');
    const T = RIG3.TUNE;
    const texLoader = new THREE.TextureLoader();
    const missing = [];
    const materials = matNames.map((nm) => {
      const url = textureFor(nm);
      if (!url) missing.push(nm);
      let map = null;
      if (url) {
        map = texLoader.load(url);
        map.colorSpace = THREE.SRGBColorSpace;
        /* flipY stays at three's default of TRUE. It was set false here on the reasoning that
           "OBJ UVs are already bottom-up", which is backwards: glTF puts UV (0,0) at the image's
           TOP-left and therefore wants flipY false, while OBJ puts it at the BOTTOM-left, which
           is what the default already assumes. With it false the atlas sampled inverted — the
           blue tunic landed on the legs and the tan trousers on the torso, and every face marking
           came out scrambled. */
        map.anisotropy = 4;
      }
      return shading?.make
        ? shading.make({
          name: `slydl:${nm}`, color: map ? 0xffffff : (MAT_FALLBACK[nm] ?? 0xcccccc), map,
          bands: T.bands, rim: T.rim, rimColor: T.rimColor, sss: T.furSSS,
          outline: T.outline, outlineColor: T.outlineColor,
        })
        : new THREE.MeshStandardMaterial({ color: map ? 0xffffff : (MAT_FALLBACK[nm] ?? 0xcccccc), map, roughness: 0.85 });
    });
    if (missing.length) {
      this.engine?.warn?.(`SlyModelDL: no texture for ${missing.join(', ')} — flat palette fallback in use`);
    }

    this.mesh = new THREE.SkinnedMesh(merged, materials.length === 1 ? materials[0] : materials);
    this.mesh.name = 'slydl:mesh';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.add(boneList[0]);
    this.mesh.bind(skeleton);

    this.root.userData.height = RIG3.TUNE.height;
    this.root.userData.parts = matNames;
    this.root.userData.texturesMissing = missing;
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

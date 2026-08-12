import * as THREE from 'three';

/**
 * CaneAsset.js — the owner-supplied cane model (`src/assets/sly-cane/sly-cane.glb`, §294),
 * parsed straight off its bytes.
 *
 * WHY A HAND PARSER AND NOT `GLTFLoader`. Two reasons, both operational rather than stylistic:
 *
 *   1. The offline guards (`tests/dlrig.test.mjs`) build the SHIPPED character in plain Node,
 *      where `GLTFLoader` stalls on this file: its images are EMBEDDED (six bufferView JPEGs and
 *      PNGs), the loader decodes them through `Image`/`createImageBitmap`, and the test shim's
 *      fake `Image` never fires `load` — so `init()` would hang in exactly the environment that
 *      exists to measure it. Reading the accessors directly costs ~80 lines and keeps the grip
 *      guards measuring the cane that renders.
 *   2. `GLTFLoader` would hand back a `MeshStandardMaterial` graph this build cannot use — the
 *      cel shader replaces three's light loop entirely (§221), so the PBR material would be
 *      thrown away at once. All that is wanted from the file is one geometry and one albedo.
 *
 * WHAT IS READ. The file carries two primitives (494 tris). Only `Cane` — the actual cane
 * surface, outward normals, doubleSided, the full 0..1 UV atlas — is built. The other primitive,
 * `shader`, is a baked INVERTED-HULL OUTLINE: measured on the bytes, its vertex normals point
 * inward (170 of 270 with dot(n, radial) < −0.2, mean −0.36 against the cane's +0.31), it
 * encloses the `Cane` surface by a few millimetres on every side, and its UVs sample one small
 * patch of an otherwise empty texture. This build draws its ink through ONE system
 * (`Shading.outline`, critic 7 #3) with view-dependent thickness; shipping the asset's fixed
 * hull beside it would double the cane's line. Skipping a baked render device is not a shape
 * edit — the cane's shape is the `Cane` primitive, and it ships vertex for vertex.
 *
 * WHAT IS NOT TOUCHED. POSITION/NORMAL/TEXCOORD_0 are copied as authored; TANGENT is dropped
 * (no normal map ships — a normal map on a flat-banded toon surface fights the ramp, the same
 * caution recorded for `assets/tombchaser/`). The metalRough images stay unread at runtime:
 * their VALUES were captured against registered bars and FAILED to read as metal under this
 * shader (§266 — the diffuse kill costs more than the capped lobe pays back while
 * `uSpecNormPow` is 0), so the cane keeps the house TUNE response like every character surface.
 *
 * NODE TRANSFORMS. The file's node chain (`Sketchfab_model` → `Collada visual scene group`)
 * composes to a pure uniform scale of 0.7952 — two ±90° X-rotations that cancel, measured from
 * the matrices, not assumed. A uniform scale is exactly what `Cane.adoptAsset`'s length conform
 * re-derives from the geometry itself, so raw accessor space is the correct input and the node
 * chain is deliberately not walked.
 *
 * SELF-CONTAINMENT. The `.glb` reaches the build through `new URL(..., import.meta.url)` — the
 * same Vite mechanism as `sly-dl/sly.fbx` — so it is bundled and hashed into `dist/` and this
 * fetch never leaves the build's own assets. Nothing lands in `public/`, nothing is fetched
 * from outside. Licence status: UNKNOWN — recorded, not guessed; see the PROVENANCE.md that
 * sits beside the asset.
 */

const GLB_URL = new URL('../assets/sly-cane/sly-cane.glb', import.meta.url);

/* glTF componentType ids, named so the guards below read as sentences. */
const F32 = 5126, U32 = 5125, U16 = 5123;

function readAccessor(json, view, binOff, ai, itemSize) {
  const a = json.accessors[ai];
  if (a.componentType !== F32) throw new Error(`accessor ${ai} is not float32`);
  const bv = json.bufferViews[a.bufferView];
  const base = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || itemSize * 4;
  const out = new Float32Array(a.count * itemSize);
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < itemSize; k++) out[i * itemSize + k] = view.getFloat32(base + i * stride + k * 4, true);
  }
  return out;
}

function readIndices(json, view, binOff, ai) {
  const a = json.accessors[ai];
  const bv = json.bufferViews[a.bufferView];
  const base = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0);
  if (a.componentType === U32) {
    const out = new Uint32Array(a.count);
    for (let i = 0; i < a.count; i++) out[i] = view.getUint32(base + i * 4, true);
    return out;
  }
  if (a.componentType === U16) {
    const out = new Uint16Array(a.count);
    for (let i = 0; i < a.count; i++) out[i] = view.getUint16(base + i * 2, true);
    return out;
  }
  throw new Error(`index accessor ${ai} has componentType ${a.componentType}`);
}

async function parse(ab) {
  const view = new DataView(ab);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb');
  let off = 12, json = null, binOff = -1;
  while (off < ab.byteLength) {
    const len = view.getUint32(off, true), type = view.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, off + 8, len)));
    else if (type === 0x004e4942 && binOff < 0) binOff = off + 8;
    off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
  }
  if (!json || binOff < 0) throw new Error('missing JSON or BIN chunk');

  /* The cane surface is selected BY MATERIAL NAME. Position in the mesh list is an export
     accident; the material name is the author's own label for what the surface is. */
  let prim = null;
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives || []) {
      if (json.materials?.[p.material]?.name === 'Cane') prim = prim ? 'dup' : p;
    }
  }
  if (!prim || prim === 'dup') throw new Error(`expected exactly one 'Cane' primitive`);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(readAccessor(json, view, binOff, prim.attributes.POSITION, 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(readAccessor(json, view, binOff, prim.attributes.NORMAL, 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(readAccessor(json, view, binOff, prim.attributes.TEXCOORD_0, 2), 2));
  const indices = readIndices(json, view, binOff, prim.indices);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  /* Validate the two facts the frame conform rests on, at parse time, so a failure here falls
     back to the procedural cane as a unit instead of adopting a mangled one: a real y-extent,
     and a measurable hook bend off the shaft axis (adoptAsset re-derives its direction). */
  const pos = geometry.attributes.position;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!(y1 - y0 > 0.1)) throw new Error(`degenerate y-extent ${(y1 - y0).toFixed(4)}`);
  let cx = 0, cz = 0, cn = 0, ox = 0, oz = 0, on = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 + (y1 - y0) * 0.05) { cx += pos.getX(i); cz += pos.getZ(i); cn++; }
    if (y > y0 + (y1 - y0) * 0.65) { ox += pos.getX(i); oz += pos.getZ(i); on++; }
  }
  if (!cn || !on) throw new Error('no tip ring or no hook vertices');
  if (Math.hypot(ox / on - cx / cn, oz / on - cz / cn) < (y1 - y0) * 0.02) {
    throw new Error('no measurable hook bend — refusing to guess an orientation');
  }

  /* The authored albedo. Decoded through `createImageBitmap` exactly as `GLTFLoader` would
     (no colour-space conversion, flipY false — glTF's UV origin is top-left). In plain Node
     there is no decoder; the geometry still ships and the material falls back to the house
     gold, the same graceful degrade the body textures already take offline. */
  let texture = null;
  const bct = json.materials[prim.material].pbrMetallicRoughness?.baseColorTexture;
  const img = bct ? json.images?.[json.textures?.[bct.index]?.source] : null;
  if (img && img.bufferView != null && typeof createImageBitmap === 'function' && typeof Blob === 'function') {
    try {
      const bv = json.bufferViews[img.bufferView];
      const bytes = new Uint8Array(ab, binOff + (bv.byteOffset || 0), bv.byteLength);
      const bmp = await createImageBitmap(new Blob([bytes], { type: img.mimeType || 'image/jpeg' }),
        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      texture = new THREE.Texture(bmp);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      /* the file's own sampler: wrapS/T 10497 (REPEAT), min 9987 / mag 9729 — three's defaults
         bar the wrap, and anisotropy 4 matches every other character map */
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    } catch { texture = null; }
  }

  return { geometry, texture, triangles: indices.length / 3, source: 'sly-cane.glb' };
}

let _pending = null;

/**
 * Fetch + parse once per page, shared by every adopter (the parse is immutable; adopters clone
 * the geometry before baking their own frame into it). Resolves `null` on ANY failure — a
 * missing file, a reshaped export, a degenerate hook — so callers keep the procedural cane and
 * the game never throws after init (§5 conventions).
 */
export function loadCaneAsset(warn) {
  if (!_pending) {
    _pending = fetch(GLB_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(parse)
      .catch((e) => { warn?.(`CaneAsset: ${e?.message || e} — the procedural cane ships instead`); return null; });
  }
  return _pending;
}

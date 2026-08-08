/**
 * godot2rig — import the Godot project's ACTUAL player mesh, and measure it against ours.
 *
 * SOURCE, established by reading the scene graph rather than by guessing from filenames:
 *
 *   Scenes/Character/player__sly.tscn
 *     └─ instance  Scenes/Character Mesh/sly_cooper_anims_4.tscn
 *          └─ instance  Assets/Temp Imports/tempsly/SlyCooper_Anims4.gltf   ← THE MESH
 *          └─ material overrides (SlyCooper_Anims4.gltf.import, "materials" block):
 *                 BodyMat → Assets/Materials/New Sly Body.tres → Assets/Textures/Sly_Body.png
 *                 HeadMat → Assets/Materials/New Sly Head.tres → Assets/Textures/Sly_Head_Paint.png
 *                 CaneMat → New Sly Head.tres
 *                 EyeMat  → use_external DISABLED, so the glTF's own EyeMat survives
 *     └─ instance  Scenes/Character Mesh/sly_tail.tscn  (a separate rigid-body tail; see below)
 *
 * TWO THINGS THIS RESOLVES that a filename search cannot:
 *
 *  1. `Assets/Models/SlyCooper_2025.bin` and `Assets/Temp Imports/slygltf.bin` are ORPHANS — their
 *     `.gltf` siblings are not in the repository, so neither is loadable and neither is what the
 *     game plays. `Assets/Models/SlyCooper_RigNoPhysics.blend1` is a Blender auto-backup.
 *  2. `SlyCooper_Anims4.gltf.import` carries `"PATH:metarig/Skeleton3D/Tail_LowPoly":
 *     {"import/skip_import": true}` — **Godot deletes the glTF's tail on import** and plays a
 *     separate `sly_tail.fbx` chain instead. We keep `Tail_LowPoly`: RIG3 has `tailA`..`tailD` and
 *     a procedural spring, which is the same idea done in our engine, and the mesh is the only
 *     ringed tail geometry in either repository.
 *
 * WHAT THIS TOOL DOES, in two modes:
 *
 *   node tools/godot2rig.mjs --import --src <dir>    rebuild the committed assets from a checkout
 *   node tools/godot2rig.mjs                          measure the committed asset (no checkout)
 *
 * `--import` needs a checkout of <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>
 * (licence status: `public/assets/sly-anim/PROVENANCE.md`) with these five files extracted into one
 * directory — a blobless clone plus `git show` is enough, no working tree required:
 *
 *   Assets/Temp Imports/tempsly/SlyCooper_Anims4.gltf
 *   Assets/Temp Imports/tempsly/SlyCooper_Anims4.bin
 *   Assets/Textures/Sly_Body.png                       (the OVERRIDE albedo, not the glTF's own)
 *   Assets/Textures/Sly_Head_Paint.png
 *
 * The glTF's own `uri` pair lives in `tempsly/` and is a DIFFERENT pair of files — 16-bit RGB,
 * 7.46 MB for the body. The Godot material overrides point at the 8-bit `Assets/Textures/` pair,
 * so those are what the game samples and those are what we take. Checked by hash, not assumed.
 *
 * WHAT IS WRITTEN: `public/assets/sly-godot/` — the geometry with animations stripped, plus the
 * five authored clips in a mesh-free companion file that nothing loads at runtime. Splitting them
 * keeps 285 KB and 2,620 animation channels out of the boot path while preserving motion authored
 * on a rig that HAS A TAIL AND FINGERS, which Mixamo does not and which `MixamoClips` therefore
 * could not carry (PROVENANCE: "What Mixamo does not have is a tail").
 */
import './_domshim.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/assets/sly-godot');

/** The four source files, and the names they take in `public/assets/sly-godot/`. */
export const SOURCES = {
  gltf: 'SlyCooper_Anims4.gltf',
  bin: 'SlyCooper_Anims4.bin',
  body: 'Sly_Body.png',
  head: 'Sly_Head_Paint.png',
};
export const PRODUCTS = {
  mesh: 'sly-godot.glb',
  anims: 'sly-godot-anims.glb',
  body: 'sly-body.png',
  head: 'sly-head.png',
};

/** The four `[Action Stash]*` clips are Blender's unassigned-action dump; the five named ones are
 *  the rig's authored motion. Kept as an explicit list so a rename in the source fails loudly. */
export const KEEP_CLIPS = ['Walk', 'Run', 'Jump', 'CrouchingStand', 'UprightStand'];

/* ─────────────────────────── GLB writing ─────────────────────────────────────────────────── */

/** Pack a glTF JSON + one binary blob into a .glb container. */
export function toGLB(json, bin) {
  const js = Buffer.from(JSON.stringify(json), 'utf8');
  const jp = (4 - (js.length % 4)) % 4;
  const bp = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + js.length + jp + (bin.length ? 8 + bin.length + bp : 0);
  const o = Buffer.alloc(total);
  let k = 0;
  o.write('glTF', k); k += 4; o.writeUInt32LE(2, k); k += 4; o.writeUInt32LE(total, k); k += 4;
  o.writeUInt32LE(js.length + jp, k); k += 4; o.writeUInt32LE(0x4E4F534A, k); k += 4;
  js.copy(o, k); k += js.length; for (let i = 0; i < jp; i++) o[k++] = 0x20;
  if (bin.length) {
    o.writeUInt32LE(bin.length + bp, k); k += 4; o.writeUInt32LE(0x004E4942, k); k += 4;
    bin.copy(o, k); k += bin.length; for (let i = 0; i < bp; i++) o[k++] = 0;
  }
  return o;
}

/**
 * Rebuild a glTF around only the accessors reachable from `keepAccessors`, repacking the buffer.
 *
 * Written as a compactor rather than a hand-edit because the source has 4,830 accessors and 4,830
 * bufferViews — 4,726 of them animation — and deleting the animations without repacking would
 * leave a 1.9 MB buffer behind a 1.08 MB mesh.
 */
export function compact(src, srcBin, keepAccessors, needBounds = new Set()) {
  const g = JSON.parse(JSON.stringify(src));
  const chunks = [];
  const accMap = new Map();
  let offset = 0;
  const outAcc = [], outBV = [];
  for (const ai of keepAccessors) {
    if (accMap.has(ai)) continue;
    const a = { ...src.accessors[ai] };
    if (a.bufferView != null) {
      const bv = src.bufferViews[a.bufferView];
      const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
      const stride = bv.byteStride;
      const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
      const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
      const elem = compSize * nComp;
      let buf;
      if (stride && stride !== elem) {
        buf = Buffer.alloc(a.count * elem);
        for (let i = 0; i < a.count; i++) srcBin.copy(buf, i * elem, start + i * stride, start + i * stride + elem);
      } else {
        buf = srcBin.subarray(start, start + a.count * elem);
      }
      /* glTF REQUIRES min/max on POSITION, and this source omits it on every morph-target
         POSITION — three's `computeBounds` warns and then skips the bounds expansion, so a morphed
         mesh gets a bounding box that does not contain its own morphed extent and frustum-culls
         early when the shape is driven. Cheap to compute here, where the bytes are already in
         hand, so the emitted file is in spec whatever the source did.
         Restricted to the accessors that are actually POSITION (`needBounds`) rather than applied
         to every float accessor: the clip file holds 2,628 animation sampler accessors, min/max is
         neither required nor read on any of them, and writing it there added 331 KB of JSON to a
         1.0 MB file for nothing. */
      if (needBounds.has(ai) && a.componentType === 5126 && (a.min === undefined || a.max === undefined)) {
        const mn = new Array(nComp).fill(Infinity);
        const mx = new Array(nComp).fill(-Infinity);
        for (let i = 0; i < a.count; i++) {
          for (let c = 0; c < nComp; c++) {
            const v = buf.readFloatLE((i * nComp + c) * 4);
            if (v < mn[c]) mn[c] = v;
            if (v > mx[c]) mx[c] = v;
          }
        }
        if (a.count > 0) { a.min = mn; a.max = mx; }
      }
      const pad = (4 - (offset % 4)) % 4;
      if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
      outBV.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(bv.target != null ? { target: bv.target } : {}) });
      chunks.push(buf); offset += buf.length;
      a.bufferView = outBV.length - 1;
      delete a.byteOffset;
    }
    accMap.set(ai, outAcc.length);
    outAcc.push(a);
  }
  g.accessors = outAcc;
  g.bufferViews = outBV;
  const bin = Buffer.concat(chunks);
  g.buffers = [{ byteLength: bin.length }];
  return { json: g, bin, accMap };
}

/**
 * Refuse to emit a glTF that references an accessor it does not contain.
 *
 * The general form of the defect this file shipped once: `compact()` renumbers accessors, and every
 * caller must remap EVERY reference. Miss one class of reference — morph targets, here — and the
 * output is a file that validates structurally, loads its first twenty primitives, and then throws
 * from inside three's loader on the twenty-first. That failure arrives far from its cause and looks
 * like a bad asset rather than a bad exporter.
 *
 * So the invariant is asserted at the point of emission rather than trusted: walk everything that
 * can name an accessor and require it to be in range. A future extension (sparse accessors, a new
 * attribute set) that this function does not know about will still not be *checked*, but nothing
 * currently emitted can regress silently.
 */
export function assertAccessorsResolved(json, label) {
  const n = (json.accessors || []).length;
  const bad = [];
  const chk = (v, where) => {
    if (v === undefined) return;
    if (!Number.isInteger(v) || v < 0 || v >= n) bad.push(`${where} -> accessor ${v} (of ${n})`);
  };
  (json.meshes || []).forEach((m, mi) => (m.primitives || []).forEach((p, pi) => {
    const at = `mesh[${mi}]${m.name ? ` "${m.name}"` : ''}.prim[${pi}]`;
    for (const [k, v] of Object.entries(p.attributes || {})) chk(v, `${at}.attributes.${k}`);
    chk(p.indices, `${at}.indices`);
    (p.targets || []).forEach((t, ti) => {
      for (const [k, v] of Object.entries(t)) chk(v, `${at}.targets[${ti}].${k}`);
    });
    /* A range check alone is not enough, and finding that out was instructive: reproducing the
       shipped defect by restoring `Cube.007`'s source index 103 did NOT trip the check, because
       the corrected file contains 104 accessors and 103 is legal in it. An index can be wrong and
       in range, and then the mesh loads carrying another attribute's bytes as its morph delta.
       Morph deltas are per-vertex, so the count must equal the base POSITION's count — a semantic
       invariant that a lucky index cannot satisfy. */
    const base = p.attributes?.POSITION;
    if (base != null && json.accessors[base]) {
      (p.targets || []).forEach((t, ti) => {
        if (t.POSITION == null || !json.accessors[t.POSITION]) return;
        const n0 = json.accessors[base].count;
        const n1 = json.accessors[t.POSITION].count;
        if (n0 !== n1) bad.push(`${at}.targets[${ti}].POSITION has ${n1} elements against a base of ${n0}`);
      });
    }
  }));
  (json.skins || []).forEach((s, si) => chk(s.inverseBindMatrices, `skin[${si}].inverseBindMatrices`));
  (json.animations || []).forEach((a, ai) => (a.samplers || []).forEach((s, si) => {
    chk(s.input, `anim[${ai}] "${a.name}".sampler[${si}].input`);
    chk(s.output, `anim[${ai}] "${a.name}".sampler[${si}].output`);
  }));
  if (bad.length) {
    throw new Error(`godot2rig: ${label} references ${bad.length} accessor(s) it does not contain — `
      + `the compaction remap missed a reference class:\n  ${bad.slice(0, 12).join('\n  ')}`);
  }
}

/* ─────────────────────────── the import ──────────────────────────────────────────────────── */

function doImport(srcDir) {
  for (const f of Object.values(SOURCES)) {
    const p = path.join(srcDir, f);
    if (!existsSync(p)) throw new Error(`godot2rig: missing source ${p}\n  see the header of this file for the four files --src must contain`);
  }
  const src = JSON.parse(readFileSync(path.join(srcDir, SOURCES.gltf), 'utf8'));
  const bin = readFileSync(path.join(srcDir, SOURCES.bin));
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`source: ${SOURCES.gltf}  ${src.nodes.length} nodes, ${src.meshes.length} meshes, `
    + `${src.skins[0].joints.length} joints, ${src.animations.length} animations, ${src.accessors.length} accessors`);

  /* ---- 1. the mesh file: everything but the animations ---- */
  {
    const keep = [];
    const needBounds = new Set();
    for (const m of src.meshes) {
      for (const p of m.primitives) {
        for (const a of Object.values(p.attributes)) keep.push(a);
        if (p.attributes.POSITION != null) needBounds.add(p.attributes.POSITION);
        for (const t of p.targets || []) if (t.POSITION != null) needBounds.add(t.POSITION);
        if (p.indices != null) keep.push(p.indices);
        /* Morph targets, and they are NOT optional here. Five meshes carry blendshapes — the face
           (`RetopoFlow.007`) has Angry/Smarmy/Purse/Blink/Gasp — and THREE of them ship with a
           non-zero authored weight, `Cube.014` and `Cube.007` at a full 1.0. Dropping the targets
           would silently render those meshes in a base shape the Godot game never shows.
           Omitting them from the keep set (the original defect) was worse still: the remap below
           left `targets[].POSITION` holding its SOURCE index, 103, into a compacted 95-accessor
           table, and three's GLTFLoader dereferenced the hole and threw on load. */
        for (const t of p.targets || []) for (const a of Object.values(t)) keep.push(a);
      }
    }
    for (const s of src.skins) if (s.inverseBindMatrices != null) keep.push(s.inverseBindMatrices);
    const { json, bin: outBin, accMap } = compact(src, bin, keep, needBounds);
    delete json.animations;
    for (const m of json.meshes) {
      for (const p of m.primitives) {
        for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
        if (p.indices != null) p.indices = accMap.get(p.indices);
        for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
      }
    }
    for (const s of json.skins) if (s.inverseBindMatrices != null) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
    assertAccessorsResolved(json, PRODUCTS.mesh);
    /* External image URIs — the two PNGs sit beside the .glb, so GLTFLoader resolves them against
       the .glb's own path and `public/` copies all three verbatim. Same arrangement as
       `public/assets/kaykit/`, and the reason that directory is .gltf+.bin rather than baked. */
    json.images = [{ mimeType: 'image/png', name: 'sly_body', uri: PRODUCTS.body },
      { mimeType: 'image/png', name: 'sly_head', uri: PRODUCTS.head }];
    const out = toGLB(json, outBin);
    writeFileSync(path.join(OUT_DIR, PRODUCTS.mesh), out);
    console.log(`  ${PRODUCTS.mesh}  ${(out.length / 1024).toFixed(0)} KB  (buffer ${(outBin.length / 1024).toFixed(0)} KB, ${json.accessors.length} accessors)`);
  }

  /* ---- 2. the clip file: the five authored clips, no meshes ---- */
  {
    const names = src.animations.map((a) => a.name);
    for (const want of KEEP_CLIPS) {
      if (!names.includes(want)) throw new Error(`godot2rig: source has no clip "${want}" (has: ${names.join(', ')})`);
    }
    const anims = src.animations.filter((a) => KEEP_CLIPS.includes(a.name));
    const keep = [];
    for (const a of anims) for (const s of a.samplers) keep.push(s.input, s.output);
    const { json, bin: outBin, accMap } = compact(src, bin, keep);
    json.animations = JSON.parse(JSON.stringify(anims));
    for (const a of json.animations) for (const s of a.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
    assertAccessorsResolved(json, PRODUCTS.anims);
    delete json.meshes; delete json.skins; delete json.materials; delete json.images; delete json.textures; delete json.samplers;
    for (const n of json.nodes) { delete n.mesh; delete n.skin; }
    const out = toGLB(json, outBin);
    writeFileSync(path.join(OUT_DIR, PRODUCTS.anims), out);
    console.log(`  ${PRODUCTS.anims}  ${(out.length / 1024).toFixed(0)} KB  (${json.animations.length} clips: ${json.animations.map((a) => a.name).join(', ')})`);
  }

  /* ---- 3. the two albedos the Godot MATERIALS point at ---- */
  for (const [k, from] of [['body', SOURCES.body], ['head', SOURCES.head]]) {
    const b = readFileSync(path.join(srcDir, from));
    writeFileSync(path.join(OUT_DIR, PRODUCTS[k]), b);
    console.log(`  ${PRODUCTS[k]}  ${(b.length / 1024).toFixed(0)} KB  ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  bitdepth ${b[24]} colortype ${b[25]}  <- ${from}`);
  }
}

/* ─────────────────────────── the measurement ─────────────────────────────────────────────── */

/**
 * Neck pinch: the narrowest horizontal slab between the shoulder line and the crown.
 *
 * This is the critic's own construction ("measured cap crown to sole against the neck pinch") and
 * it is applied identically to every model, which is the only thing that makes the numbers
 * comparable. The window starts above `yLo` so the waist cannot win, and the slab width is the
 * X extent, not the diagonal, so a forward-leaning muzzle does not count as width.
 */
export function headMetrics(points, { slab = 0.005 } = {}) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const h = maxY - minY;
  /* search the top third only: the neck is the narrowest slab up there, the ankles are narrower
     still and would win over the whole body. */
  const lo = minY + h * 0.62, hi = maxY - h * 0.02;
  let best = null;
  for (let y = lo; y < hi; y += slab) {
    let a = Infinity, b = -Infinity, n = 0;
    for (const p of points) if (p[1] >= y && p[1] < y + slab) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; n++; }
    if (n < 8) continue;                        // a slab of stray verts is not a cross-section
    const w = b - a;
    if (!best || w < best.w) best = { y: y + slab / 2, w, n };
  }
  if (!best) return { height: h, headCount: NaN, neckY: NaN, neckW: NaN, crown: maxY, sole: minY };
  const headH = maxY - best.y;
  return { height: h, sole: minY, crown: maxY, neckY: best.y, neckW: best.w, headH, headCount: h / headH };
}

/** Every vertex of an Object3D subtree, in that subtree's own root space. */
export function worldPoints(obj, reject = () => false) {
  const out = [];
  const v = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || reject(o)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); o.localToWorld(v); out.push([v.x, v.y, v.z]); }
  });
  return out;
}

/**
 * Split a .glb back into its JSON and BIN chunks. The inverse of `toGLB`.
 */
export function fromGLB(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let bin = Buffer.alloc(0);
  const after = 20 + jsonLen;
  if (after + 8 <= buf.length) bin = buf.subarray(after + 8, after + 8 + buf.readUInt32LE(after));
  return { json, bin };
}

/**
 * Drop the material/texture graph, keeping geometry and skinning.
 *
 * `_domshim`'s `FakeImg` has a no-op `addEventListener`, so the load event never fires and three's
 * ImageLoader promise never settles — `parseAsync` on a file with external image URIs hangs forever
 * rather than failing. (Observed as Node's "Detected unsettled top-level await", which is a hang
 * wearing a warning's clothes.) The shipped asset deliberately references its two PNGs by URI so
 * the runtime loader resolves them beside the .glb, so the measurement — which reads vertex
 * positions and nothing else — strips them instead of teaching the shim to lie about images.
 */
export function stripImages(buf) {
  const { json, bin } = fromGLB(buf);
  for (const m of json.meshes || []) for (const p of m.primitives || []) delete p.material;
  delete json.materials; delete json.textures; delete json.images; delete json.samplers;
  return toGLB(json, bin);
}

async function doMeasure() {
  const file = path.join(OUT_DIR, PRODUCTS.mesh);
  if (!existsSync(file)) throw new Error(`godot2rig: ${file} not built — run with --import --src <dir>`);
  const onDisk = readFileSync(file);
  const bytes = stripImages(onDisk);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = gltf.scene;
  const pts = worldPoints(root, (o) => /Cane/i.test(o.name));
  const m = headMetrics(pts);
  console.log(`${PRODUCTS.mesh}: ${(statSync(file).size / 1024).toFixed(0)} KB`);
  console.log(`  sole ${m.sole.toFixed(4)}  crown ${m.crown.toFixed(4)}  height ${m.height.toFixed(4)}`);
  console.log(`  neck pinch y=${m.neckY.toFixed(4)} width=${m.neckW.toFixed(4)}  head ${m.headH.toFixed(4)}  => ${m.headCount.toFixed(2)} heads`);
  let tris = 0, meshes = 0;
  root.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  console.log(`  ${meshes} meshes, ${tris} tris`);
}

/* ─────────────────────────── entry ───────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--import')) {
    const i = argv.indexOf('--src');
    if (i < 0 || !argv[i + 1]) throw new Error('godot2rig --import needs --src <dir>');
    doImport(path.resolve(argv[i + 1]));
  } else {
    await doMeasure();
  }
}

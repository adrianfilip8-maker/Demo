#!/usr/bin/env node
/**
 * godot2sly27 — import Sly's NATIVE rig, weights, clips and cane from `SlyCooper_Anims27.gltf`.
 *
 *   node tools/godot2sly27.mjs --import --src <checkout root>   # checkout -> the two committed .glb
 *   node tools/godot2sly27.mjs                                   # measure the committed assets
 *
 * ── what this is, against the two imports that already exist ─────────────────────────────────
 * `tools/godot2rig.mjs` takes the MESH from the old `Assets/Temp Imports/tempsly/SlyCooper_Anims4
 * .gltf` and `tools/godot2clips.mjs` takes CLIPS from `Assets/Models/Characters/SlyCooper_Anims27
 * .gltf` and RETARGETS them onto RIG3. So the shipped `?char=godot` arrangement runs Anims27
 * motion on an Anims4 body through a retarget layer. This tool takes **one file, whole**: its own
 * 166-joint skeleton, its own skin weights, its own 24 clips and its own cane, with no bone map,
 * no bind transfer and no retarget — the same treatment §704 gave Carmelita.
 *
 * Provenance and licence status: `public/assets/sly-godot/PROVENANCE.md`. Licence is **none
 * stated**, imported at the owner's standing instruction. Nothing is downloaded here; this reads a
 * checkout already on disk. Nothing under the source project's `Assets/Music/` or
 * `Assets/Effects/` is opened, read, decoded, converted or referenced (§364.3).
 *
 * ── the textures, and why this tool copies none ──────────────────────────────────────────────
 * Anims27's own image URIs are an author-local path
 * (`Sly Cooper Character anims  July2026/.../Textures/Sly_Body.png`) that **does not exist in the
 * repository**, and its `.import` sets `materials/extract=0`, so Godot supplies no override to
 * resolve them against either. What settles it is measurement rather than the filename: all 21
 * mesh nodes carry **byte-identical `TEXCOORD_0`** to Anims4's, and every mesh node's material
 * assignment is identical across the two files. So the two atlases already committed for
 * `?char=godot` are pixel-correct for this mesh, and the emitted glb points its two images at
 * them by URI. Re-copying them under new names would add 3.3 MB of duplicate bytes to the tree
 * and could not be more correct than identical UVs already make them.
 *
 * ── what is emitted ─────────────────────────────────────────────────────────────────────────
 *   sly27.glb        21 mesh nodes, the 166-joint skin, 4 materials, the full node hierarchy,
 *                    NO animations. The cane is IN here — see below.
 *   sly27-clips.glb  the 24 clips and the node hierarchy they address, NO meshes/skins/materials.
 *
 * Split for the same reason `sly-godot-anims.glb` is split from `sly-godot.glb`: the clips are
 * 2.4 MB of channels and the body does not need them to draw. Both are registered in
 * `tests/bundle.test.mjs`'s unshipped-payload list.
 *
 * ── THE CANE, which is the part worth reading ───────────────────────────────────────────────
 * `Cane_LowPoly` (896 tris, `CaneMat`) is **not skinned** — it is a rigid mesh parented to
 * `CaneBone.001`, which IS joint #104 of the 166-joint skin and is a child of `hand.R`. Zero
 * vertices weight to that joint: it exists purely as a prop-attachment bone. All 24 clips animate
 * it, and in seven of them it carries real articulation rather than a held constant, so on this
 * path the cane plants and swings from the clip data with no attach logic of ours at all.
 *
 * This retires the sentence in §479.20 that says "their rig has no cane bone". That was never
 * true of either source file — `Assets/Temp Imports/tempsly/SlyCooper_Anims4.gltf` carries the
 * same `CaneBone.001` under the same `hand.R`, and it is present in the committed
 * `sly-godot.glb` today. What is true, and narrower, is that RIG3 has no cane bone, so
 * `godot2clips.mjs`'s bone map had nowhere to send that joint's channels and dropped them.
 *
 * ── §227, the standing hazard in every tool of this shape ────────────────────────────────────
 * `compact()` renumbers every accessor and the caller must remap EVERY reference class. For the
 * body those are primitive attributes, primitive indices, morph-target attributes and the skin's
 * `inverseBindMatrices`; for the clips they are the samplers' `input`/`output` and nothing else.
 * `assertAccessorsResolved` runs before a byte is written, on both.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { toGLB, compact, assertAccessorsResolved } from './godot2rig.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/assets/sly-godot');

/** Where the source lives inside a checkout, and what the products are called here. */
export const SRC_REL = 'Assets/Models/Characters/SlyCooper_Anims27.gltf';
export const PRODUCTS = { body: 'sly27.glb', clips: 'sly27-clips.glb' };
/** The two atlases already committed for `?char=godot`; see the header for why they are reused. */
export const ATLAS = { body: 'sly-body.png', head: 'sly-head.png' };

/** Material name -> which committed atlas its baseColorTexture must resolve to. Read off the
 *  source's own `baseColorTexture` -> `images[].uri` basenames, not typed in from memory. */
const MAT_ATLAS = { BodyMat: 'body', HeadMat: 'head', EyeMat: 'head', CaneMat: 'head' };

/** The one clip with no verb of ours to serve; kept in the emitted file all the same, because a
 *  native import that silently drops a clip is a retarget by another name. Reported, not cut. */
export const THIN_CLIP = 'KeyAction.001';

/* ────────────────────────────────── source reading ──────────────────────────────────────────── */

/** Read a .gltf + its external .bin as the {json, bin} pair the compactor wants. */
export function readGltfPair(gltfPath) {
  const json = JSON.parse(readFileSync(gltfPath, 'utf8'));
  const dir = path.dirname(gltfPath);
  if (!json.buffers?.length) throw new Error(`${gltfPath}: no buffers`);
  if (json.buffers.length !== 1) throw new Error(`${gltfPath}: ${json.buffers.length} buffers — this tool assumes one`);
  const uri = json.buffers[0].uri;
  if (!uri) throw new Error(`${gltfPath}: buffer 0 has no uri (already a glb?)`);
  const bin = readFileSync(path.join(dir, decodeURIComponent(uri)));
  if (bin.length < json.buffers[0].byteLength) {
    throw new Error(`${gltfPath}: bin is ${bin.length} bytes, buffer declares ${json.buffers[0].byteLength}`);
  }
  return { json, bin };
}

/* ───────────────────────────────────── the import ───────────────────────────────────────────── */

function doImport(srcRoot) {
  const gltfPath = existsSync(path.join(srcRoot, SRC_REL))
    ? path.join(srcRoot, SRC_REL)
    : path.join(srcRoot, path.basename(SRC_REL));
  if (!existsSync(gltfPath)) throw new Error(`cannot find ${SRC_REL} under ${srcRoot}`);
  const { json: src, bin } = readGltfPair(gltfPath);
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\ngodot2sly27 --import  <- ${gltfPath}`);
  console.log(`  source: ${src.meshes.length} meshes, ${src.nodes.length} nodes, `
    + `${src.skins?.length || 0} skin(${src.skins?.[0]?.joints.length || 0} joints), `
    + `${src.animations?.length || 0} animations, ${src.accessors.length} accessors`);

  /* Refuse on a file that is not the one this tool was written against, rather than emitting a
     confidently wrong asset (the §442 shape: a correct procedure on the wrong subject). */
  if (!src.animations?.length) throw new Error('REFUSING: source carries no animations');
  if ((src.skins?.length || 0) !== 1) throw new Error(`REFUSING: expected exactly 1 skin, found ${src.skins?.length || 0}`);
  const caneNode = src.nodes.findIndex((n) => n.name === 'Cane_LowPoly');
  const caneBone = src.nodes.findIndex((n) => n.name === 'CaneBone.001');
  if (caneNode < 0 || caneBone < 0) throw new Error('REFUSING: no Cane_LowPoly / CaneBone.001 — this is not the rig this tool documents');

  /* ---- 1. the body: meshes + skin + hierarchy, no animations ---- */
  {
    const keep = [];
    const needBounds = new Set();
    for (const m of src.meshes) {
      for (const p of m.primitives) {
        for (const a of Object.values(p.attributes)) keep.push(a);
        if (p.attributes.POSITION != null) needBounds.add(p.attributes.POSITION);
        if (p.indices != null) keep.push(p.indices);
        for (const t of p.targets || []) {
          for (const a of Object.values(t)) { keep.push(a); if (t.POSITION != null) needBounds.add(t.POSITION); }
        }
      }
    }
    for (const s of src.skins) if (s.inverseBindMatrices != null) keep.push(s.inverseBindMatrices);
    const { json, bin: outBin, accMap } = compact(src, bin, keep, needBounds);
    /* EVERY reference class, remapped (§227). Miss one and the file loads until it doesn't. */
    for (const m of json.meshes) {
      for (const p of m.primitives) {
        for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
        if (p.indices != null) p.indices = accMap.get(p.indices);
        for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
      }
    }
    for (const s of json.skins) if (s.inverseBindMatrices != null) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
    delete json.animations;
    /* The two atlases sit beside the .glb and GLTFLoader resolves them against its own path —
       the same arrangement as sly-godot.glb and assets/kaykit/. */
    json.images = [{ mimeType: 'image/png', name: 'sly_body', uri: ATLAS.body },
      { mimeType: 'image/png', name: 'sly_head', uri: ATLAS.head }];
    json.textures = [{ source: 0 }, { source: 1 }];
    for (const m of json.materials) {
      const which = MAT_ATLAS[m.name];
      if (!which) throw new Error(`REFUSING: material "${m.name}" is not one of the four this tool documents`);
      m.pbrMetallicRoughness ||= {};
      m.pbrMetallicRoughness.baseColorTexture = { index: which === 'body' ? 0 : 1 };
    }
    assertAccessorsResolved(json, PRODUCTS.body);
    const out = toGLB(json, outBin);
    writeFileSync(path.join(OUT_DIR, PRODUCTS.body), out);
    console.log(`  ${PRODUCTS.body}  ${(out.length / 1024).toFixed(0)} KB  `
      + `(${json.accessors.length} accessors, ${json.meshes.length} meshes, ${json.skins[0].joints.length} joints)`);
  }

  /* ---- 2. the clips: all 24, no meshes ---- */
  {
    const anims = JSON.parse(JSON.stringify(src.animations));
    /* DEAD CHANNELS, dropped and counted — the same treatment `godot2clips.mjs` documents.
     *
     * 10,168 of the source's 11,478 samplers hold two keys of the same value. Most of those are
     * NOT dead: a constant that differs from the node's rest TRS is the clip's static pose, and
     * dropping it would let the rest pose show through. `CaneBone.001` is the proof — every clip
     * pins it 147.91° away from its bind rotation, so a "constant" channel there is load-bearing.
     *
     * Dead means constant AND equal to the node's own rest value, which is provably a no-op: with
     * or without the channel the node holds exactly that value. Compared on the raw floats with
     * no tolerance, so a channel that merely looks like rest is kept. */
    const restOf = (node, path2) => {
      const n = src.nodes[node];
      if (path2 === 'translation') return n.translation || [0, 0, 0];
      if (path2 === 'rotation') return n.rotation || [0, 0, 0, 1];
      if (path2 === 'scale') return n.scale || [1, 1, 1];
      return null;
    };
    const readOut = (acc) => {
      const a = src.accessors[acc];
      if (a.bufferView == null || a.componentType !== 5126) return null;
      const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
      if (!nComp) return null;
      const bv = src.bufferViews[a.bufferView];
      const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
      if (bv.byteStride && bv.byteStride !== nComp * 4) return null;   // interleaved: don't guess
      const out = [];
      for (let i = 0; i < a.count * nComp; i++) out.push(bin.readFloatLE(start + i * 4));
      return { v: out, n: nComp, count: a.count };
    };
    let dead = 0, deadByPath = { translation: 0, rotation: 0, scale: 0, weights: 0 };
    for (const a of anims) {
      a.channels = a.channels.filter((c) => {
        const rest = restOf(c.target.node, c.target.path);
        if (!rest) return true;                                   // weights / unknown: keep
        const s = a.samplers[c.sampler];
        if (src.accessors[s.input].count > 2) return true;         // real motion
        const o = readOut(s.output);
        if (!o || o.n !== rest.length) return true;
        for (let k = 0; k < o.count; k++) {
          for (let c2 = 0; c2 < o.n; c2++) if (o.v[k * o.n + c2] !== rest[c2]) return true;
        }
        dead++; deadByPath[c.target.path] = (deadByPath[c.target.path] || 0) + 1;
        return false;
      });
      /* Samplers are addressed by index, so re-pack them alongside the surviving channels. */
      const used = new Map();
      const keptS = [];
      for (const c of a.channels) {
        if (!used.has(c.sampler)) { used.set(c.sampler, keptS.length); keptS.push(a.samplers[c.sampler]); }
        c.sampler = used.get(c.sampler);
      }
      a.samplers = keptS;
    }
    console.log(`  dead channels dropped: ${dead} `
      + `(translation ${deadByPath.translation}, rotation ${deadByPath.rotation}, scale ${deadByPath.scale}) `
      + `— constant AND equal to the node's rest TRS, so provably no-ops`);
    const keep = [];
    for (const a of anims) for (const s of a.samplers) keep.push(s.input, s.output);
    const { json, bin: outBin, accMap } = compact(src, bin, keep);
    json.animations = anims;
    for (const a of json.animations) for (const s of a.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
    /* Drop the meshes FIRST, then assert. `compact()` kept only the animation accessors, so the
       mesh definitions `compact` copied forward still name accessors that no longer exist — and
       asserting before the delete fails on references that are about to stop existing. Checking
       after the delete is checking what is actually emitted, which is the point of the guard. */
    delete json.meshes; delete json.skins; delete json.materials; delete json.images; delete json.textures; delete json.samplers;
    for (const n of json.nodes) { delete n.mesh; delete n.skin; }
    assertAccessorsResolved(json, PRODUCTS.clips);
    const out = toGLB(json, outBin);
    writeFileSync(path.join(OUT_DIR, PRODUCTS.clips), out);
    console.log(`  ${PRODUCTS.clips}  ${(out.length / 1024).toFixed(0)} KB  (${json.animations.length} clips)`);
  }
  console.log(`  textures: NONE copied — ${ATLAS.body} / ${ATLAS.head} reused (see header)\n`);
}

/* ──────────────────────────────────── the measurement ───────────────────────────────────────── */

/** Read a .glb back into {json, bin} without three, so the report measures the emitted bytes. */
export function readGLB(p) {
  const buf = readFileSync(p);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${p}: not a glb`);
  const jlen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
  let bin = Buffer.alloc(0);
  const after = 20 + jlen;
  if (after + 8 <= buf.length) bin = buf.subarray(after + 8, after + 8 + buf.readUInt32LE(after));
  return { json, bin, bytes: buf.length };
}

function report() {
  const bodyP = path.join(OUT_DIR, PRODUCTS.body);
  const clipP = path.join(OUT_DIR, PRODUCTS.clips);
  if (!existsSync(bodyP) || !existsSync(clipP)) {
    console.error(`missing ${PRODUCTS.body} / ${PRODUCTS.clips} — run with --import --src <checkout root>`);
    process.exit(1);
  }
  const B = readGLB(bodyP), C = readGLB(clipP);
  const j = B.json;

  const parentOf = new Map();
  j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
  const pathOf = (i) => { const p = []; let c = i, g = 0; while (c != null && g++ < 500) { p.unshift(j.nodes[c].name); c = parentOf.get(c); } return p.join('/'); };
  const roots = j.nodes.map((_, i) => i).filter((i) => !parentOf.has(i));

  console.log(`\ngodot2sly27 — the committed native import`);
  console.log(`  ${PRODUCTS.body}   ${(B.bytes / 1024).toFixed(0)} KB   `
    + `${j.meshes.length} meshes, ${j.nodes.length} nodes, ${j.skins[0].joints.length} joints, `
    + `${j.materials.length} materials, ${j.animations?.length || 0} animations`);
  console.log(`  ${PRODUCTS.clips}  ${(C.bytes / 1024).toFixed(0)} KB   ${C.json.animations.length} clips`);
  console.log(`  root nodes: ${roots.map((i) => j.nodes[i].name).join(', ')}`);

  /* Census by NODE, because identity lives on the node and the mesh names are Blender defaults
     (`Circle.004`, `Cube.007`, `RetopoFlow.003`) sitting beside real ones (§709). */
  const triOf = (p) => (p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
  let tris = 0, skinnedTris = 0, rigidTris = 0;
  const rows = [];
  j.nodes.forEach((n, i) => {
    if (n.mesh == null) return;
    const m = j.meshes[n.mesh];
    const t = m.primitives.reduce((s, p) => s + triOf(p), 0);
    tris += t;
    if (n.skin != null) skinnedTris += t; else rigidTris += t;
    rows.push({ node: n.name, mesh: m.name, t, skin: n.skin, mat: [...new Set(m.primitives.map((p) => j.materials[p.material]?.name))].join('|'), morphs: m.primitives[0]?.targets?.length || 0, i });
  });
  rows.sort((a, b) => b.t - a.t);
  console.log(`\n  node                         mesh                 tris  skin  material   morphs`);
  for (const r of rows) {
    console.log(`  ${r.node.padEnd(28)} ${r.mesh.padEnd(18)} ${String(r.t).padStart(6)}  ${r.skin != null ? 'yes ' : ' no '}  ${r.mat.padEnd(9)}  ${r.morphs || ''}`);
  }
  console.log(`  TOTAL ${tris} tris  (${skinnedTris} skinned, ${rigidTris} rigid-on-a-bone)`);

  /* Materials -> atlas, read off the emitted file. */
  console.log(`\n  materials:`);
  for (const m of j.materials) {
    const ti = m.pbrMetallicRoughness?.baseColorTexture?.index;
    console.log(`    ${m.name.padEnd(9)} -> ${ti != null ? j.images[j.textures[ti].source].uri : '(no texture)'}`);
  }

  /* The cane, by hierarchy and by skin binding — the claim this tool exists to make checkable. */
  const skin = j.skins[0];
  const jointNames = skin.joints.map((i) => j.nodes[i].name);
  const caneNodeI = j.nodes.findIndex((n) => n.name === 'Cane_LowPoly');
  const caneBoneI = j.nodes.findIndex((n) => n.name === 'CaneBone.001');
  const caneJoint = skin.joints.indexOf(caneBoneI);
  console.log(`\n  CANE`);
  console.log(`    Cane_LowPoly  skin=${j.nodes[caneNodeI].skin ?? 'NONE (rigid, parented to a bone)'}`);
  console.log(`    path          ${pathOf(caneNodeI)}`);
  console.log(`    CaneBone.001  joint #${caneJoint} of ${skin.joints.length}, child of ${j.nodes[parentOf.get(caneBoneI)].name}`);
  const animated = C.json.animations.filter((a) => a.channels.some((c) => c.target.node === caneBoneI));
  const moving = C.json.animations.filter((a) => {
    const ch = a.channels.find((c) => c.target.node === caneBoneI && c.target.path === 'rotation');
    return ch && C.json.accessors[a.samplers[ch.sampler].input].count > 2;
  });
  console.log(`    animated in ${animated.length}/${C.json.animations.length} clips; carries real articulation (>2 keys) in ${moving.length}: ${moving.map((a) => a.name).join(', ')}`);

  console.log(`\n  clips (${C.json.animations.length}):`);
  for (const a of C.json.animations) {
    const dur = Math.max(...a.samplers.map((s) => C.json.accessors[s.input].max?.[0] || 0));
    console.log(`    ${a.name.padEnd(22)} ${String(a.channels.length).padStart(4)} channels  ${dur.toFixed(3)}s`
      + `${a.name === THIN_CLIP ? '   <- 1 channel, no verb of ours; kept rather than cut' : ''}`);
  }
  console.log('');
  return { body: j, clips: C.json, tris, skinnedTris, rigidTris, jointNames };
}

/* ────────────────────────────────────────── cli ─────────────────────────────────────────────── */

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--import')) {
    const i = argv.indexOf('--src');
    if (i < 0 || !argv[i + 1]) { console.error('--import needs --src <checkout root>'); process.exit(2); }
    doImport(argv[i + 1]);
  }
  report();
}

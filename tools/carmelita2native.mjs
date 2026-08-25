#!/usr/bin/env node
/**
 * carmelita2native.mjs — cut the CLIPS out of `carmelita-anims.glb`, keeping them as authored.
 *
 *   node tools/carmelita2native.mjs [--write]
 *
 * The exact inverse of `tools/carmelita2guard.mjs`. That tool keeps the 21 skinned meshes and
 * drops all eleven animations; this one keeps all eleven animations and the 199-joint node
 * hierarchy they address, and drops every mesh, skin, material, texture and image. Between them
 * the two outputs cover the source file with no overlap, which is the point: the native guard
 * fetches `carmelita-guard.glb` for her body and `carmelita-clips.glb` for her motion, and
 * neither file carries a byte the other already has.
 *
 * ── why this exists at all (§704) ────────────────────────────────────────────────────────────
 * The owner asked for "the source rig and animations rather than trying to modify them". The
 * retarget path (`tools/carmelita2clips.mjs` → `src/ai/GuardClips.js`) folds her 199 joints onto
 * RIG3's 31 and re-expresses every key as an Euler delta on top of a different bind. Nothing here
 * is retargeted: the channels are copied byte-for-byte and addressed by her own node names, so
 * `THREE.AnimationMixer` drives her own hierarchy with her own keys.
 *
 * Provenance and licence status for the source: `public/assets/sly-anim/PROVENANCE.md`. Licence is
 * **none stated**, taken at the owner's instruction. Nothing is downloaded here; this reads the
 * file already in the repository. Nothing under the source project's `Assets/Music/` or
 * `Assets/Effects/` is read, referenced or emitted (§364.3).
 *
 * ── the duplicated clip, which is in the source and not in this tool ─────────────────────────
 * `Shoot(BodyMovement)` ships **1,194 channels for 597 distinct node/path pairs** — every channel
 * is present exactly twice, addressing the same node and the same property. The other ten clips
 * carry 597 each. A duplicate channel is not harmless: `AnimationMixer` binds both, and which one
 * wins is an ordering accident rather than a decision. They are collapsed here, keeping the FIRST
 * of each pair, and the count is reported so the drop cannot be silent. This is the one place the
 * tool does not copy the source verbatim, and it is doing so to preserve the source's *meaning*
 * rather than its byte layout.
 *
 * ── §227, the standing hazard in every tool of this shape ────────────────────────────────────
 * `compact()` renumbers every accessor and the caller must remap EVERY reference class. Here the
 * classes are the animation samplers' `input` and `output` — and nothing else, because meshes,
 * skins and morph targets are all dropped. That is a much smaller surface than
 * `carmelita2guard.mjs` had, and `assertAccessorsResolved` still runs before a byte is written.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fromGLB, toGLB, compact, assertAccessorsResolved } from './godot2rig.mjs';

const SRC = 'public/assets/sly-anim/carmelita-anims.glb';
const OUT = 'public/assets/sly-anim/carmelita-clips.glb';

const WRITE = process.argv.includes('--write');

if (!existsSync(SRC)) {
  console.error(`missing ${SRC} — see public/assets/sly-anim/PROVENANCE.md`);
  process.exit(1);
}

const srcBuf = readFileSync(SRC);
const { json: src, bin: srcBin } = fromGLB(srcBuf);

console.log(`\ncarmelita2native — ${SRC} (${(srcBuf.length / 1048576).toFixed(2)} MB)`);
console.log(`  meshes ${src.meshes.length}  nodes ${src.nodes.length}  skins ${src.skins?.length || 0}`
  + `  animations ${src.animations?.length || 0}  accessors ${src.accessors.length}`);

if (!src.animations?.length) {
  console.error('REFUSING TO WRITE: the source carries no animations — this is not the file this tool was written against.');
  process.exit(1);
}

/* ------------------------------------------------------------- dedupe --- */

/**
 * Collapse channels that address the same (node, path) twice. Reported per clip so a source that
 * stops doing this, or starts doing it somewhere new, is visible rather than absorbed.
 */
let dupTotal = 0;
const clipRows = [];
const anims = src.animations.map((a) => {
  const seen = new Set();
  const channels = [];
  let dup = 0;
  for (const ch of a.channels) {
    const key = `${ch.target.node}.${ch.target.path}`;
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    channels.push(ch);
  }
  dupTotal += dup;
  clipRows.push({ name: a.name, kept: channels.length, dup });
  return { ...a, channels };
});

console.log('\nCLIPS — all eleven kept, as authored:');
for (const r of clipRows) {
  console.log(`  ${(r.name || '?').padEnd(24)} channels ${String(r.kept).padStart(5)}`
    + (r.dup ? `   ${r.dup} duplicate channel(s) collapsed` : ''));
}
console.log(`  duplicate channels collapsed in total: ${dupTotal}`);

/* -------------------------------------------------------------- prune --- */

/* Accessors: every surviving sampler's input and output, and nothing else. Mesh attributes,
   indices, morph targets and inverseBindMatrices are all deliberately NOT collected — that is
   the drop, and it is the whole saving. */
const keepAcc = [];
for (const a of anims) {
  const used = new Set(a.channels.map((c) => c.sampler));
  for (const si of used) {
    const s = a.samplers[si];
    keepAcc.push(s.input);
    keepAcc.push(s.output);
  }
}

/* The same refusal `carmelita2guard.mjs` earned the hard way: `compact()` copies an accessor's
   own bufferView and knows nothing about `sparse.indices` / `sparse.values`, so a kept sparse
   accessor emits a file that validates and then throws from inside the loader (§227). */
const sparseKept = [...new Set(keepAcc)].filter((ai) => src.accessors[ai].sparse);
if (sparseKept.length) {
  console.error(`\nREFUSING TO WRITE: ${sparseKept.length} kept accessor(s) are SPARSE, and compact() `
    + `does not remap sparse.indices/sparse.values bufferViews (§227). Accessors: ${sparseKept.join(', ')}`);
  process.exit(1);
}

console.log(`\n  accessors: ${new Set(keepAcc).size} referenced of ${src.accessors.length} `
  + `(${src.accessors.length - new Set(keepAcc).size} dropped — every mesh attribute, index, `
  + `morph target and inverseBindMatrices)`);

const { json: out, bin, accMap } = compact(src, srcBin, keepAcc, new Set());
const remap = (v) => (v == null ? v : accMap.get(v));

/* ---- remap the ONE reference class that survives: animation samplers ---- */
out.animations = anims.map((a) => {
  /* Renumber samplers too, so an unreferenced sampler cannot drag a dropped accessor along. */
  const used = [...new Set(a.channels.map((c) => c.sampler))].sort((x, y) => x - y);
  const smap = new Map(used.map((s, i) => [s, i]));
  return {
    ...(a.name != null ? { name: a.name } : {}),
    samplers: used.map((si) => {
      const s = a.samplers[si];
      return { ...s, input: remap(s.input), output: remap(s.output) };
    }),
    channels: a.channels.map((c) => ({ ...c, sampler: smap.get(c.sampler) })),
  };
});

/* ---- drop everything the clips do not address ----
   Nodes are kept in full and IN PLACE. Every animation channel targets a node by INDEX, so
   renumbering nodes would mean a second remap pass over every channel — exactly the §227 shape
   of error, for a saving that does not show up next to the keyframe data. The mesh and skin
   references on those nodes are stripped instead, which is what actually frees the accessors. */
let strippedMesh = 0, strippedSkin = 0;
out.nodes = src.nodes.map((n) => {
  const c = { ...n };
  if (c.mesh != null) { delete c.mesh; strippedMesh++; }
  if (c.skin != null) { delete c.skin; strippedSkin++; }
  if (c.weights) delete c.weights;
  return c;
});
delete out.meshes;
delete out.skins;
delete out.materials;
delete out.textures;
delete out.images;
delete out.samplers;

console.log(`  nodes: ${out.nodes.length} kept in place (indices unchanged — channels address them by index)`);
console.log(`         ${strippedMesh} stripped of a mesh, ${strippedSkin} stripped of a skin`);
console.log(`  dropped wholesale: meshes, skins, materials, textures, images, samplers`);

assertAccessorsResolved(out, 'carmelita-clips');
console.log('  assertAccessorsResolved: OK');

const glb = toGLB(out, bin);
console.log(`\n  ${OUT}  ${(glb.length / 1048576).toFixed(2)} MB `
  + `(from ${(srcBuf.length / 1048576).toFixed(2)} MB — ${(100 - 100 * glb.length / srcBuf.length).toFixed(0)}% smaller)`);

if (WRITE) {
  writeFileSync(OUT, glb);
  console.log('  written.');
} else {
  console.log('  dry run — pass --write to emit.');
}

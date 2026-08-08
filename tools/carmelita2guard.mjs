/**
 * carmelita2guard.mjs — cut the guard body out of `carmelita-anims.glb`.
 *
 *   node tools/carmelita2guard.mjs [--write]
 *
 * The filename lies: `public/assets/sly-anim/carmelita-anims.glb` is not animations-only. It is a
 * complete Blender scene — 34 meshes, 199 joints, 11 clips, 4,457 accessors, 3.86 MB — and the
 * three things this project wants out of it are separable:
 *
 *   - **the clips** — already taken. `tools/carmelita2clips.mjs` retargeted all eleven onto RIG3's
 *     bone names and `src/ai/GuardClips.js` carries the output, so `GUARD_CLIPS` has been
 *     Carmelita's motion since before this tool existed. **Every animation is dropped here**;
 *     keeping them would ship the same keyframes twice in two formats.
 *   - **the mesh** — what this tool keeps, and what `src/ai/CarmelitaGuard.js` binds.
 *   - **the rig widgets and the scene junk** — dropped, see below.
 *
 * Provenance and licence status for the source: `public/assets/sly-anim/PROVENANCE.md`. Licence is
 * **none stated**, taken at the owner's instruction. Nothing is downloaded here; this reads the
 * file already in the repository.
 *
 * ── What is dropped, and how each was decided ────────────────────────────────────────────────
 *
 * **13 meshes, checked one at a time rather than by name.** The brief that prompted this work
 * flagged `Text`, `Text.001`, `Text.002`, `Text.009` and `BézierCircle.005` as "Blender scene junk,
 * almost certainly not part of the character", and that is right — but the useful discriminator
 * turned out not to be the name. All thirteen share three properties that no character mesh has:
 * **no skin, no material, and parented to the scene root rather than to the armature.** Their node
 * names are `Arrow`, `Circle`, `Cube`, `IKPolehandle`, `singlecircle`, `Starcircle`, `Handrot`,
 * `HandCurlCTL`, `BézierCircle` and four `Text*` — they are the *custom bone shapes* a Blender
 * animator sees in the viewport (the rig's own UI) plus its text annotations. The rule is asserted
 * rather than the list: a mesh is junk iff it has no `skin` **and** no material.
 *
 * **The two "outline" materials are NOT dropped, and that is the interesting one.** `OutlineMat.001`
 * and `OH_Outline_Material` look exactly like the baked inverted-hull outlines that fan models
 * usually carry, and this project has its own ink pass (`Guards._applyOutlines`), so shipping a
 * second one would fight it. Reading the node names instead of the material names says otherwise:
 * they are on **`Stomach_LP`** (416 tris) and **`TeethUpper_LowPoly`** (832 tris). They are the
 * character's stomach and upper teeth wearing misnamed materials. Dropping them on the material
 * name would have deleted body parts, and the resulting hole would have read as a rigging bug.
 *
 * **All 11 animations and the 199-joint node hierarchy's animation samplers** — 4,336 of the
 * 4,457 accessors. This is where the file size goes.
 *
 * ── §227, which this tool is one instance of ────────────────────────────────────────────────
 * `compact()` renumbers every accessor and every caller must remap EVERY reference: attributes,
 * indices, morph targets, skin `inverseBindMatrices`, animation samplers. Miss one class and the
 * output validates, loads twenty primitives and throws on the twenty-first. Two of the kept meshes
 * carry morph targets (`Head_LP` has four, `TeethUpper_LowPoly` has one), so the class that caused
 * §227 is live in this input. `assertAccessorsResolved` runs before a byte is written and checks
 * both out-of-range references and the semantic invariant a lucky in-range index still fails.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fromGLB, toGLB, compact, assertAccessorsResolved } from './godot2rig.mjs';

const SRC = 'public/assets/sly-anim/carmelita-anims.glb';
const OUT = 'public/assets/sly-anim/carmelita-guard.glb';

const WRITE = process.argv.includes('--write');

if (!existsSync(SRC)) {
  console.error(`missing ${SRC} — see public/assets/sly-anim/PROVENANCE.md`);
  process.exit(1);
}

const srcBuf = readFileSync(SRC);
const { json: src, bin: srcBin } = fromGLB(srcBuf);

console.log(`\ncarmelita2guard — ${SRC} (${(srcBuf.length / 1048576).toFixed(2)} MB)`);
console.log(`  meshes ${src.meshes.length}  nodes ${src.nodes.length}  skins ${src.skins.length}`
  + `  animations ${src.animations?.length || 0}  accessors ${src.accessors.length}`);

/* ---------------------------------------------------------------- classify --- */

const nodeByMesh = new Map();
src.nodes.forEach((n, i) => { if (n.mesh != null) (nodeByMesh.get(n.mesh) || nodeByMesh.set(n.mesh, []).get(n.mesh)).push(i); });

const parentOf = new Map();
src.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));

const tris = (p) => (p.indices != null ? src.accessors[p.indices].count
  : src.accessors[p.attributes.POSITION].count) / 3;

/**
 * A mesh is character iff any node instancing it has a `skin`. Every one of the 21 character
 * meshes is skinned and every one of the 13 junk meshes is not, so the test is decided by the
 * data. The material check is carried alongside and asserted to agree — if the two rules ever
 * disagree the file has changed and this tool must be re-read, not re-run.
 */
const rows = [];
for (let mi = 0; mi < src.meshes.length; mi++) {
  const m = src.meshes[mi];
  const nodes = src.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.mesh === mi);
  const skinned = nodes.some(({ n }) => n.skin != null);
  const hasMat = m.primitives.some((p) => p.material != null);
  const rooted = nodes.every(({ i }) => !parentOf.has(i));
  const t = m.primitives.reduce((s, p) => s + tris(p), 0);
  const targets = m.primitives.reduce((s, p) => s + (p.targets?.length || 0), 0);
  rows.push({
    mi, mesh: m.name || '?', node: nodes.map(({ n }) => n.name).join(',') || '(none)',
    skinned, hasMat, rooted, tris: t, targets,
    mat: [...new Set(m.primitives.map((p) => src.materials?.[p.material]?.name).filter(Boolean))].join(','),
  });
}

const keepRows = rows.filter((r) => r.skinned);
const dropRows = rows.filter((r) => !r.skinned);

console.log('\nKEEP — skinned character meshes:');
for (const r of keepRows) {
  console.log(`  ${r.node.padEnd(22)} ${r.mesh.padEnd(18)} ${String(Math.round(r.tris)).padStart(6)} tris`
    + `  mat=${r.mat}${r.targets ? `  morphs=${r.targets}` : ''}`);
}
console.log('\nDROP — no skin, no material, parented to the scene root (Blender rig widgets + text):');
for (const r of dropRows) {
  console.log(`  ${r.node.padEnd(22)} ${r.mesh.padEnd(18)} ${String(Math.round(r.tris)).padStart(6)} tris`
    + `  mat=${r.mat || '(none)'}  rootParented=${r.rooted}`);
}

/* The two rules must agree, or the input is not the file this tool was written against. */
const disagree = rows.filter((r) => r.skinned !== r.hasMat);
if (disagree.length) {
  console.error(`\nREFUSING TO WRITE: ${disagree.length} mesh(es) where "is skinned" and "has a material" `
    + `disagree — the classification rule no longer decides this file:\n`
    + disagree.map((r) => `  ${r.node} / ${r.mesh}: skinned=${r.skinned} hasMat=${r.hasMat}`).join('\n'));
  process.exit(1);
}

const keptTris = Math.round(keepRows.reduce((s, r) => s + r.tris, 0));
const dropTris = Math.round(dropRows.reduce((s, r) => s + r.tris, 0));
console.log(`\n  kept ${keepRows.length} meshes / ${keptTris} tris   dropped ${dropRows.length} meshes / ${dropTris} tris`);

/* ------------------------------------------------------------------ prune --- */

const keepMesh = new Set(keepRows.map((r) => r.mi));

/* Accessors: every attribute, index and morph target of a kept primitive, plus the skin's
   inverseBindMatrices. Animation samplers are deliberately NOT collected — that is the drop. */
const keepAcc = [];
const needBounds = new Set();
const add = (a) => { if (a != null) keepAcc.push(a); };
for (const mi of keepMesh) {
  for (const p of src.meshes[mi].primitives) {
    for (const [k, v] of Object.entries(p.attributes || {})) { add(v); if (k === 'POSITION') needBounds.add(v); }
    add(p.indices);
    for (const t of p.targets || []) {
      for (const [k, v] of Object.entries(t)) { add(v); if (k === 'POSITION') needBounds.add(v); }
    }
  }
}
for (const s of src.skins || []) add(s.inverseBindMatrices);

console.log(`  accessors: ${keepAcc.length} referenced of ${src.accessors.length} `
  + `(${src.accessors.length - new Set(keepAcc).size} dropped, mostly animation samplers)`);

const { json: out, bin, accMap } = compact(src, srcBin, keepAcc, needBounds);

/* ---- remap EVERY reference class. §227: missing one produces a file that loads, then throws. --- */
const remap = (v) => (v == null ? v : accMap.get(v));

out.meshes = [];
const meshIndexMap = new Map();
for (const mi of [...keepMesh].sort((a, b) => a - b)) {
  const m = JSON.parse(JSON.stringify(src.meshes[mi]));
  for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes || {})) p.attributes[k] = remap(p.attributes[k]);
    if (p.indices != null) p.indices = remap(p.indices);
    for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = remap(t[k]);
  }
  meshIndexMap.set(mi, out.meshes.length);
  out.meshes.push(m);
}
for (const s of out.skins || []) {
  if (s.inverseBindMatrices != null) s.inverseBindMatrices = remap(s.inverseBindMatrices);
}

/* Nodes: keep the whole 199-joint armature (the skin needs every joint it names, and
   `CarmelitaGuard.js` reads the rest pose off it), drop the mesh reference on junk nodes. */
let strippedNodes = 0;
out.nodes = src.nodes.map((n) => {
  const c = { ...n };
  if (c.mesh != null) {
    if (keepMesh.has(c.mesh)) c.mesh = meshIndexMap.get(c.mesh);
    else { delete c.mesh; delete c.skin; strippedNodes++; }
  }
  return c;
});
delete out.animations;

/* Junk nodes are now empty leaves. Leaving them costs a few hundred bytes of JSON and keeps every
   node index — and therefore every `skin.joints` entry and every `scene.nodes` entry — valid
   without a second remap pass. Renumbering nodes is exactly the §227 shape of error, for a saving
   that does not show up in a 1 MB file. */
console.log(`  nodes: ${strippedNodes} stripped of their mesh, ${out.nodes.length} kept (armature intact)`);
console.log(`  animations: ${src.animations?.length || 0} dropped (already in src/ai/GuardClips.js)`);

assertAccessorsResolved(out, 'carmelita-guard');
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

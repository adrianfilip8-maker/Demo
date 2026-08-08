import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fromGLB, assertAccessorsResolved, PRODUCTS, KEEP_CLIPS } from '../tools/godot2rig.mjs';

/**
 * Structural guards on the imported Godot character assets.
 *
 * These exist because the first import SHIPPED A FILE THREE CANNOT LOAD, and nothing caught it —
 * the importer's own report said "sly-godot.glb 1150 KB, 95 accessors" and looked like success.
 *
 * The defect: `compact()` renumbers accessors and every caller must remap EVERY reference to them.
 * The mesh block remapped `primitives[].attributes` and `primitives[].indices` but not
 * `primitives[].targets`, so the five meshes carrying morph targets kept their SOURCE indices —
 * into a table compacted from 4,830 accessors down to 95. `Cube.007`'s target pointed at accessor
 * 103, which no longer existed, and three's GLTFLoader dereferenced the hole and threw partway
 * through loading. A file that is 95% correct fails later and further from its cause than a file
 * that is entirely wrong.
 *
 * Why the targets could not simply be dropped, which was the tempting one-line fix: they are facial
 * blendshapes — `RetopoFlow.007` carries Angry, Smarmy, Purse, Blink and Gasp — and THREE of the
 * five meshes ship with a non-zero authored weight, `Cube.014` and `Cube.007` at a full 1.0.
 * Stripping the targets would have rendered those meshes in a base shape the source game never
 * displays, silently and plausibly. The weights are asserted below for that reason.
 *
 * Costs milliseconds: these read the .glb's JSON chunk directly and never construct a three scene,
 * so they need no DOM shim, no browser and no capture lock.
 */

const DIR = new URL('../public/assets/sly-godot/', import.meta.url).pathname;
const have = existsSync(DIR + PRODUCTS.mesh);

/** Both products, parsed once. Guarded so a checkout without the assets skips rather than errors. */
const files = have
  ? Object.fromEntries([PRODUCTS.mesh, PRODUCTS.anims].map((f) => [f, fromGLB(readFileSync(DIR + f))]))
  : null;

test('godot: the imported assets are present', () => {
  /* §211.1 — every test below loops over `files`. If the assets were missing they would each pass
     having inspected nothing, so the subject's existence is asserted before anything reads it. */
  assert.ok(have, `${DIR}${PRODUCTS.mesh} is missing — run: node tools/godot2rig.mjs --import --src <dir>`);
  for (const f of [PRODUCTS.body, PRODUCTS.head]) {
    assert.ok(existsSync(DIR + f), `${f} is missing — the .glb references it by URI and will 404 at runtime`);
  }
});

test('godot: no accessor reference dangles in either product', () => {
  /* The regression guard for the shipped defect. `assertAccessorsResolved` throws with the offending
     references listed; a passing run means every mesh attribute, index, morph target, skin and
     animation sampler in both files names an accessor the file actually contains. */
  for (const [name, { json }] of Object.entries(files)) {
    assert.ok(json.accessors.length > 50, `${name} has only ${json.accessors.length} accessors`);
    assertAccessorsResolved(json, name);
  }
});

test('godot: every POSITION accessor carries min/max, as glTF requires', () => {
  /* The source omits min/max on all nine morph-target POSITIONs. three warns and then SKIPS the
     bounds expansion, so a morphed mesh gets a bounding box that does not contain its own morphed
     extent — it frustum-culls early once the shape is driven, which reads as a limb vanishing at
     certain camera angles rather than as a malformed file. */
  const { json } = files[PRODUCTS.mesh];
  let checked = 0;
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      for (const ai of [p.attributes.POSITION, ...(p.targets || []).map((t) => t.POSITION)]) {
        if (ai == null) continue;
        checked++;
        const a = json.accessors[ai];
        assert.ok(Array.isArray(a.min) && a.min.length === 3, `accessor ${ai} has no min`);
        assert.ok(Array.isArray(a.max) && a.max.length === 3, `accessor ${ai} has no max`);
        assert.ok(a.min.every(Number.isFinite) && a.max.every(Number.isFinite), `accessor ${ai} bounds are not finite`);
      }
    }
  }
  assert.ok(checked >= 30, `only ${checked} POSITION accessors inspected`);
});

test('godot: the facial blendshapes survive the import, weights included', () => {
  const { json } = files[PRODUCTS.mesh];
  const byName = Object.fromEntries(json.meshes.map((m) => [m.name, m]));
  const face = byName['RetopoFlow.007'];
  assert.ok(face, 'the face mesh RetopoFlow.007 is gone');
  assert.deepEqual(face.extras.targetNames, ['Angry', 'Smarmy', 'Purse', 'Blink', 'Gasp']);
  assert.equal(face.primitives[0].targets.length, 5, 'the face lost blendshape geometry');

  /* The two meshes authored fully morphed. If a future change drops `weights`, these render in a
     base shape the source game never shows — the exact silent failure that made "just strip the
     targets" the wrong fix. */
  for (const n of ['Cube.014', 'Cube.007']) {
    assert.ok(byName[n], `${n} is gone`);
    assert.deepEqual(byName[n].weights, [1], `${n} lost its authored morph weight`);
  }
  const total = json.meshes.flatMap((m) => m.primitives.flatMap((p) => p.targets || [])).length;
  assert.equal(total, 9, `expected 9 morph targets across the character, found ${total}`);
});

test('godot: the skeleton and the five authored clips are intact', () => {
  const { json } = files[PRODUCTS.mesh];
  assert.equal(json.skins.length, 1, 'expected exactly one skin');
  assert.equal(json.skins[0].joints.length, 174, 'joint count changed — the rig is not the one measured');
  assert.equal(json.meshes.length, 21);

  const { json: anims } = files[PRODUCTS.anims];
  assert.deepEqual(anims.animations.map((a) => a.name).sort(), [...KEEP_CLIPS].sort());
  /* The clip file is deliberately mesh-free so 2,628 animation accessors stay out of the boot
     path. If a mesh reappears here the split has silently collapsed. */
  assert.ok(!anims.meshes || anims.meshes.length === 0, 'the clip file has regrown a mesh');
  for (const a of anims.animations) {
    assert.ok(a.channels.length > 0 && a.samplers.length > 0, `clip ${a.name} is empty`);
  }
});

test('godot: the mesh file references its two albedos by URI, not by embedded buffer', () => {
  /* The runtime loader resolves these against the .glb's own path, the same arrangement as
     `public/assets/kaykit/`. Embedding them would put 3.7 MB of PNG into the boot parse. */
  const { json } = files[PRODUCTS.mesh];
  assert.deepEqual((json.images || []).map((i) => i.uri).sort(), [PRODUCTS.body, PRODUCTS.head].sort());
  for (const i of json.images) assert.equal(i.bufferView, undefined, `${i.uri} is embedded, not referenced`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * The RUNTIME side: `src/player/SlyModelGodot.js`, which binds this asset to RIG3 as `?char=godot`.
 *
 * These build the character for real — the same `init()` the browser runs, handed an already-parsed
 * GLTF because Node has no image decoder — and assert on what it produced. That costs about a
 * second and is the only thing standing between a silently half-retargeted character and a capture.
 *
 * The failure they exist to catch is NOT a crash. It is `mixamo2clips`'s: a bone-name matcher that
 * stops matching (GLTFLoader sanitises `spine.001` to `spine001`, and a three upgrade could switch
 * to `spine_001`) leaves a model that loads, renders, and hangs every vertex off `hips`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
import '../tools/_domshim.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toGLB } from '../tools/godot2rig.mjs';
import { RIG3 } from '../src/player/SlyModel3.js';
import { SlyModel } from '../src/player/SlyModelGodot.js';

/** Build the character once, with the textures stripped (see `stripImages`'s note on the shim). */
const built = have ? await (async () => {
  const { json, bin } = fromGLB(readFileSync(DIR + PRODUCTS.mesh));
  for (const m of json.materials || []) delete m.pbrMetallicRoughness?.baseColorTexture;
  delete json.textures; delete json.images; delete json.samplers;
  const b = toGLB(json, bin);
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  const warnings = [];
  const model = new SlyModel({ scene: new THREE.Group(), warn: (m) => warnings.push(m), get: () => null, emit: () => {} });
  await model.init({ gltf, noTextures: true });
  return { model, warnings };
})() : null;

test('godot: the character builds on RIG3 and every RIG3 bone exists', () => {
  assert.ok(built, 'the asset is missing, so the model could not be built');
  const { model } = built;
  for (const n of RIG3.BONE_ORDER) assert.ok(model.bones[n]?.isBone, `RIG3 bone "${n}" is missing`);
  assert.equal(model.boneNames.length, RIG3.BONE_ORDER.length);
  assert.ok(model.mesh?.isSkinnedMesh, 'the body mesh is not a SkinnedMesh');
  assert.ok(model.face?.isSkinnedMesh, 'the face mesh is not a SkinnedMesh');
  assert.ok(model.cane, 'the cane was not built');
});

test('godot: the bone map still resolves — the sanitisation trap', () => {
  /* The number that matters is not the joint count, it is how much of the artist's SKIN WEIGHT
     lands on a bone the map names. A rig whose IK controls outnumber its deform bones can resolve
     a healthy-looking fraction of joints while sending the mesh to `hips`. Measured at 99.70 %;
     the bar is set well below that and well above what any partial match could reach. */
  const { model } = built;
  assert.ok(model.info.mapped >= 110,
    `only ${model.info.mapped}/174 joints resolved — GLTFLoader's node-name sanitisation changed`);
  assert.ok(model.info.weightMapped > 0.98,
    `only ${(100 * model.info.weightMapped).toFixed(2)} % of skin weight reaches a mapped bone`);
});

test('godot: the tail rides tailA..tailD, spread across the chain', () => {
  /* §226's open fork: the tail rebuild went into the model that does not ship. This one has real
     ringed geometry on the rig that does, and the check is that it is genuinely DISTRIBUTED — a
     tail welded to `tailA` alone would pass a "has a tail" check and swing as one rigid rod. */
  const { model } = built;
  const g = model.mesh.geometry;
  const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const idx = ['tailA', 'tailB', 'tailC', 'tailD'].map((n) => RIG3.BONE_ORDER.indexOf(n));
  const per = idx.map(() => 0);
  let total = 0;
  for (let i = 0; i < g.attributes.position.count; i++) {
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k], j = idx.indexOf(si[i * 4 + k]);
      if (w > 0 && j >= 0) { per[j] += w; total += w; }
    }
  }
  assert.ok(total > 100, `only ${total.toFixed(1)} weight on the tail chain — is the tail there at all?`);
  for (let j = 0; j < 4; j++) {
    assert.ok(per[j] / total > 0.05,
      `tail${'ABCD'[j]} carries ${(100 * per[j] / total).toFixed(1)} % of the tail — the chain has collapsed`);
  }
});

test('godot: the five facial blendshapes are live on the face mesh', () => {
  const { model } = built;
  assert.deepEqual(Object.keys(model.face.morphTargetDictionary), ['Angry', 'Smarmy', 'Purse', 'Blink', 'Gasp']);
  assert.equal(model.face.geometry.morphAttributes.position.length, 5);
  assert.equal(model.face.geometry.morphTargetsRelative, true, 'glTF morph deltas are relative');
  /* `Gasp` ships at 0.0194 and that is the character's authored rest, not an expression. */
  assert.ok(Math.abs(model.face.morphTargetInfluences[4] - 0.0193557) < 1e-4,
    `Gasp starts at ${model.face.morphTargetInfluences[4]} — the authored rest weight was lost`);
  /* the blink must actually close: drive `update` and require a frame above 0.85 */
  const bi = 3;
  let peak = 0;
  for (let i = 0; i < 1200; i++) { model.update(1 / 60); peak = Math.max(peak, model.face.morphTargetInfluences[bi]); }
  assert.ok(peak > 0.85, `the blink peaked at ${peak.toFixed(2)} over 20 s — the eyelids never close`);
});

test('godot: the finished character is one draw call per material, not one per source mesh', () => {
  /* `mergeGeometries(geos, true)` emits a group per INPUT, so merging the twenty non-face meshes
     naively costs twenty draw calls against a twelve-call character budget — while carrying three
     distinct materials between them. */
  const { model } = built;
  const groups = model.mesh.geometry.groups.length;
  assert.ok(groups <= 4, `the body draws in ${groups} groups; it carries at most 4 materials`);
  assert.equal(Array.isArray(model.mesh.material) ? model.mesh.material.length : 1, groups);
});

test('godot: the retarget is no worse than the incumbent, and the height shortfall is recorded', () => {
  /* Uniform scale, per the house convention — and the post-retarget height is NOT the 1.80 m the
     normalisation targets, because RIG3 places `head` proportionally lower than this rig does.
     Asserted so the figure cannot drift unnoticed: `SlyModelDLRig` lands at 1.798 m under the
     identical construction, and the gap is this asset's proportions, not a bug. */
  const { model } = built;
  assert.ok(Math.abs(model.info.scale - 1.0839) < 0.01, `scale drifted to ${model.info.scale}`);
  assert.ok(model.info.bakedHeight > 1.70 && model.info.bakedHeight < 1.80,
    `post-retarget height ${model.info.bakedHeight.toFixed(4)} m is outside the recorded band`);
  assert.ok(model.info.tris > 29000 && model.info.tris < 30000, `${model.info.tris} tris`);
});

test('godot: the gloves are closed, and the null arm proves the measurement is alive', () => {
  /* Every digit on this rig is straight in bind (0.977-0.998), so the hands are four rigid prongs
     — §202's "splayed rake fingers" against the shipped model, in the source art this time. The
     curl runs at load, on the artist's own finger bones, in the last moment before RIG3's four-bone
     collapse makes it impossible. `?godot=open` is the arm that must separate from it. */
  const { model } = built;
  assert.ok(model.info.curl.verts > 500, `only ${model.info.curl.verts} digit vertices found`);
  assert.ok(model.info.curl.mean > 0.02,
    `the curl moved digit vertices a mean of ${(1000 * model.info.curl.mean).toFixed(1)} mm — it is not firing`);
});

test('godot: `?char=godot` reaches this file, and it is NOT the default', () => {
  /* Two claims, and the second matters as much as the first. The default character is `dlrig` by
     direct owner instruction dated 2026-08-07; moving it needs a blind A/B round, which importing a
     model is not. §216 is the cautionary tale — an agent read the shipped model correctly and was
     overridden from memory — so the map is read from the source rather than remembered. */
  const main = readFileSync(new URL('../src/main.js', import.meta.url).pathname, 'utf8');
  const block = main.slice(main.indexOf('const CHAR_MODELS'), main.indexOf('function characterModule'));
  assert.match(block, /godot:\s*\['\.\/player\/SlyModelGodot\.js',\s*'SlyModel'\]/,
    '`?char=godot` is not wired into CHAR_MODELS');
  const dflt = block.match(/'':\s*\['([^']+)'/);
  assert.ok(dflt, "CHAR_MODELS has no '' default entry");
  assert.equal(dflt[1], './player/SlyModelDLRig.js',
    `the default character is now ${dflt[1]} — that needs a blind A/B round, not an import`);
});

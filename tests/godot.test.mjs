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

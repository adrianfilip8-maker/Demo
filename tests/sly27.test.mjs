/**
 * sly27.test.mjs — guards on the NATIVE Sly import (§711).
 *
 * The failure these exist to catch is NOT a crash. It is the quiet one: an asset that loads,
 * renders, and is subtly not the thing it claims to be — a cane that resolved to nothing because
 * three de-dotted its bone name, a clip that reads as missing because the source spelled it with
 * trailing whitespace, or a `bones` map that somebody "fixed" by filling it in, which would hand
 * RIG3 Euler poses to a Blender skeleton and mangle the character silently.
 *
 * §418.3 — every assertion below records an input seen to PASS and one seen to FAIL, and the
 * failing arm is constructed and run here rather than described, so a guard that has stopped
 * being able to fail shows up as a failing test instead of a passing one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import '../tools/_domshim.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fromGLB, toGLB } from '../tools/godot2rig.mjs';
import { PRODUCTS, ATLAS, THIN_CLIP } from '../tools/godot2sly27.mjs';
import { SlyModel, nodeVariants, findNode, clipKey, REST_CLIP } from '../src/player/SlyModel27.js';

const DIR = new URL('../public/assets/sly-godot/', import.meta.url).pathname;
const bodyP = path.join(DIR, PRODUCTS.body);
const clipP = path.join(DIR, PRODUCTS.clips);
const have = existsSync(bodyP) && existsSync(clipP);

/* ─────────────────────────────── the emitted bytes ─────────────────────────────────────────── */

test('sly27: both assets exist and are well-formed glb', () => {
  assert.ok(have, `missing ${PRODUCTS.body} / ${PRODUCTS.clips} — run tools/godot2sly27.mjs --import --src <checkout>`);
  for (const p of [bodyP, clipP]) {
    const b = readFileSync(p);
    assert.equal(b.readUInt32LE(0), 0x46546c67, `${path.basename(p)} is not a glb`);
    assert.equal(b.readUInt32LE(4), 2, `${path.basename(p)} is not glTF 2.0`);
  }
});

test('sly27: the body carries one 166-joint skin, 21 mesh nodes and no animations', () => {
  const { json } = fromGLB(readFileSync(bodyP));
  assert.equal(json.skins.length, 1, 'expected exactly one skin');
  assert.equal(json.skins[0].joints.length, 166, 'the source rig is 166 joints');
  assert.equal(json.nodes.filter((n) => n.mesh != null).length, 21, '21 mesh-bearing NODES');
  assert.ok(!json.animations, 'the body file must carry no animations — they live in the clip file');
  /* The atlases are referenced by URI, not embedded: that is what lets the two committed PNGs be
     reused rather than duplicated, and it is the thing a re-import could silently change. */
  assert.deepEqual(json.images.map((i) => i.uri), [ATLAS.body, ATLAS.head]);
});

test('sly27: the clip file carries all 24 clips and no geometry', () => {
  const { json } = fromGLB(readFileSync(clipP));
  assert.equal(json.animations.length, 24);
  for (const k of ['meshes', 'skins', 'materials', 'images', 'textures']) {
    assert.ok(!json[k], `the clip file must carry no ${k}`);
  }
  assert.ok(json.animations.some((a) => a.name === THIN_CLIP),
    `${THIN_CLIP} is kept rather than cut, so that "24 clips" means 24 clips`);
});

/* ── THE CANE. The claim §711 rests on, asserted on the bytes rather than believed. ─────────── */

test('sly27: the cane is a RIGID mesh on CaneBone.001, and that joint carries no skin weight', () => {
  const { json } = fromGLB(readFileSync(bodyP));
  const caneI = json.nodes.findIndex((n) => n.name === 'Cane_LowPoly');
  const boneI = json.nodes.findIndex((n) => n.name === 'CaneBone.001');
  assert.ok(caneI >= 0 && boneI >= 0, 'Cane_LowPoly and CaneBone.001 must both be present');

  /* rigid, not skinned — this is what makes it ride the bone with no attach logic */
  assert.equal(json.nodes[caneI].skin, undefined, 'Cane_LowPoly must not be skinned');
  const prim = json.meshes[json.nodes[caneI].mesh].primitives[0];
  assert.ok(!prim.attributes.JOINTS_0, 'Cane_LowPoly must carry no JOINTS_0');

  /* parented to the bone, and the bone parented to the hand */
  assert.ok((json.nodes[boneI].children || []).includes(caneI), 'Cane_LowPoly must be a child of CaneBone.001');
  const handI = json.nodes.findIndex((n) => n.name === 'hand.R');
  assert.ok((json.nodes[handI].children || []).includes(boneI), 'CaneBone.001 must be a child of hand.R');

  /* a joint of the skin, but a zero-weight one: a prop mount, not a deformer */
  const ji = json.skins[0].joints.indexOf(boneI);
  assert.ok(ji >= 0, 'CaneBone.001 must be a joint of the skin');
  const { json: j2, bin } = fromGLB(readFileSync(bodyP));
  let onCane = 0;
  for (const n of j2.nodes) {
    if (n.mesh == null || n.skin == null) continue;
    for (const p of j2.meshes[n.mesh].primitives) {
      if (!p.attributes.JOINTS_0) continue;
      const ja = j2.accessors[p.attributes.JOINTS_0], wa = j2.accessors[p.attributes.WEIGHTS_0];
      const jv = readAcc(j2, bin, ja), wv = readAcc(j2, bin, wa);
      for (let k = 0; k < jv.length; k++) if (jv[k] === ji && wv[k] > 0) onCane++;
    }
  }
  assert.equal(onCane, 0, 'CaneBone.001 must deform nothing — it is a prop mount');
});

test('sly27: the cane bone is animated, and in more than one clip it actually moves', () => {
  const { json: body } = fromGLB(readFileSync(bodyP));
  const boneI = body.nodes.findIndex((n) => n.name === 'CaneBone.001');
  const { json } = fromGLB(readFileSync(clipP));
  const animated = json.animations.filter((a) => a.channels.some((c) => c.target.node === boneI));
  assert.ok(animated.length >= 20, `expected the cane bone animated in most clips, got ${animated.length}`);
  /* PASS ARM: clips whose cane rotation has more than two keys really articulate. */
  const moving = json.animations.filter((a) => {
    const ch = a.channels.find((c) => c.target.node === boneI && c.target.path === 'rotation');
    return ch && json.accessors[a.samplers[ch.sampler].input].count > 2;
  }).map((a) => a.name);
  assert.ok(moving.length >= 4, `expected several clips to articulate the cane, got ${moving.join(', ')}`);
  assert.ok(moving.includes('Canehit'), 'Canehit must articulate the cane');
  /* FAIL ARM (§418.3): a clip that holds it constant must NOT be counted as articulating. If this
     ever passes, the >2-keys discriminator has stopped discriminating and the count above is noise. */
  assert.ok(!moving.includes('Walk'), 'Walk holds the cane constant — the discriminator must exclude it');
});

/* ── the two name traps, both directions ───────────────────────────────────────────────────── */

test('sly27: node names survive three de-dotting them (§709), and the matcher can still miss', () => {
  const root = new THREE.Group();
  const b = new THREE.Object3D(); b.name = 'CaneBone001'; root.add(b);
  /* PASS: the dotted source name resolves through the variant list */
  assert.equal(findNode(root, 'CaneBone.001'), b);
  assert.ok(nodeVariants('CaneBone.001').includes('CaneBone001'));
  /* FAIL: a name that is genuinely absent must return null, not the nearest thing */
  assert.equal(findNode(root, 'CaneBone.002'), null);
  assert.equal(findNode(root, 'Nonexistent'), null);
});

test('sly27: the source clip with trailing whitespace is reachable, and clipKey still separates', () => {
  /* PASS: the source really does spell it "Crouching stand   " */
  const { json } = fromGLB(readFileSync(clipP));
  const raw = json.animations.map((a) => a.name);
  assert.ok(raw.includes('Crouching stand   '),
    'the source spells this clip with trailing spaces — if that changed, the normaliser below is untested');
  assert.equal(clipKey('Crouching stand   '), 'Crouching stand');
  /* FAIL: normalising must not collapse two genuinely different clips onto one key */
  assert.notEqual(clipKey('CaneSwing Grab'), clipKey('CaneSwing Idle'));
  const keys = new Set(raw.map(clipKey));
  assert.equal(keys.size, raw.length, 'clipKey must not merge two distinct source clips');
});

/* ─────────────────────────────── the runtime side ──────────────────────────────────────────── */

const built = have ? await (async () => {
  const strip = (p) => {
    const { json, bin } = fromGLB(readFileSync(p));
    for (const m of json.materials || []) delete m.pbrMetallicRoughness?.baseColorTexture;
    delete json.textures; delete json.images; delete json.samplers;
    const b = toGLB(json, bin);
    return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  };
  const [gltf, clips] = await Promise.all([strip(bodyP), strip(clipP)]);
  const warnings = [];
  const model = new SlyModel({ scene: new THREE.Group(), warn: (m) => warnings.push(m), get: () => null, emit: () => {} });
  await model.init({ gltf, clips, noTextures: true });
  return { model, warnings };
})() : null;

test('sly27: the model builds, resolves its cane, and holds the rest clip', () => {
  assert.ok(built, 'the assets are missing, so the model could not be built');
  const { model } = built;
  assert.equal(model.info.joints, 166);
  assert.equal(model.info.tris, 30346);
  assert.equal(model.info.clips, 24);
  assert.ok(model.cane, 'the cane object must resolve');
  assert.ok(model.caneBone, 'the cane BONE must resolve — this is the de-dotting trap');
  assert.ok(model.clips.has(clipKey(REST_CLIP)), `the rest clip ${REST_CLIP} must be present`);
  assert.ok(model.play(REST_CLIP), 'the rest clip must play');
  /* FAIL ARM: an absent clip returns false rather than throwing or silently doing nothing. */
  assert.equal(model.play('NoSuchClip'), false);
});

test('sly27: the model exposes NO RIG3 bones — this is the switch, not an oversight', () => {
  /* `Animation._bind()` returns false when `bones.hips` or `boneNames.length` is missing, which is
     how the procedural layer stands down and the mixer is left as the only thing posing this
     skeleton. Filling either in would hand RIG3 Euler poses to Blender-oriented bones — the exact
     mangling a retarget exists to avoid — and it would do it silently. If a future change wants
     the procedural layer back, it needs a real bone map and a bind transfer, not these two lines.
     See the header of `src/player/SlyModel27.js`. */
  const { model } = built;
  assert.deepEqual(model.bones, {}, 'bones must stay empty (see the comment in this test)');
  assert.equal(model.boneNames.length, 0, 'boneNames must stay empty (see the comment in this test)');
  /* and the condition Animation actually tests, spelled out so this cannot drift from it */
  assert.ok(!(model.bones?.hips && model.boneNames?.length), 'Animation._bind() must return false for this model');
});

test('sly27: the bind pose is NOT the rest clip — sampling before the mixer runs is a real error (§442)', () => {
  const { model } = built;
  const caneBox = () => { model.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(model.cane); };
  /* PASS: on the rest clip the cane sits where the authored pose puts it */
  model.play(REST_CLIP, { loop: true, fade: 0 });
  model.mixer.update(0);
  const posed = caneBox().min.y;
  /* FAIL ARM: with every action stopped the skeleton falls back to bind, and the cane moves a
     long way. If these two ever agree, the §442 warning in the model header has become false and
     the instruments that avoid the bind pose are avoiding nothing. */
  model.mixer.stopAllAction();
  model.mixer.update(0);
  const bind = caneBox().min.y;
  assert.ok(Math.abs(posed - bind) > 0.1,
    `bind and posed cane must differ materially — got ${posed.toFixed(4)} vs ${bind.toFixed(4)}`);
});

/* tiny accessor reader, local so the test does not depend on a tool's private helper */
function readAcc(json, bin, a) {
  const CT = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const TA = CT[a.componentType], n = NC[a.type];
  const out = new TA(a.count * n);
  if (a.bufferView == null) return out;
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const sz = TA.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || n * sz;
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < n; c++) out[i * n + c] = new TA(bin.buffer, bin.byteOffset + base + i * stride + c * sz, 1)[0];
  }
  return out;
}

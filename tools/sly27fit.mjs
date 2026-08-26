#!/usr/bin/env node
/**
 * sly27fit.mjs — does the NATIVE Sly fit the engine the incumbent was tuned around? §711
 *
 *   node tools/sly27fit.mjs            # the full report
 *   node tools/sly27fit.mjs --cane     # just the cane, at every clip
 *
 * Reads only committed assets. No fetch, no lock, no browser, **no renderer** — §439/§440: an
 * instrument that shares an assumption with its subject cannot falsify it, and the thing under
 * test here is a geometry-and-skeleton claim, so it is answered from the geometry and the
 * skeleton. `tools/carmsil.mjs` is the same idea one step further (it rasterises without three).
 *
 * ── §442, which this tool exists to not fall into ───────────────────────────────────────────
 * The bind pose of `sly27.glb` is not a pose the source game ever shows: every clip pins
 * `CaneBone.001` about 148° off its bind rotation. A measurement taken before a clip is evaluated
 * measures the rest pose. So every figure below is taken with the mixer STEPPED ONTO A NAMED CLIP
 * AT A NAMED TIME, both are printed beside the number, and the bind pose is reported separately
 * and labelled as the thing it is rather than quietly used as a stand-in for a pose.
 *
 * ── §442 again, in the other direction ──────────────────────────────────────────────────────
 * `sly27.glb` and `sly-godot.glb` are the same sculpt at two rest offsets and their mesh NODE
 * names are identical. Every figure names which file it came from.
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fromGLB, toGLB } from './godot2rig.mjs';
import { RIG3 } from '../src/player/SlyModel3.js';
import { SlyModel as Sly27, findNode, clipKey } from '../src/player/SlyModel27.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const A = (p) => path.join(ROOT, 'public/assets/sly-godot', p);
const ONLY_CANE = process.argv.includes('--cane');

/** Parse a committed .glb with its external image references removed — Node has no image decoder,
 *  and an unresolvable `uri` leaves `GLTFLoader.parse` never calling back (it hangs rather than
 *  throwing, which is how this cost twenty minutes the first time). */
async function loadStripped(file) {
  if (!existsSync(file)) throw new Error(`missing ${file} — run tools/godot2sly27.mjs --import --src <checkout>`);
  const { json, bin } = fromGLB(readFileSync(file));
  for (const m of json.materials || []) delete m.pbrMetallicRoughness?.baseColorTexture;
  delete json.textures; delete json.images; delete json.samplers;
  const b = toGLB(json, bin);
  const g = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  g.scene.updateMatrixWorld(true);
  return g;
}

const engineStub = () => ({ scene: new THREE.Group(), warn: () => {}, get: () => null, emit: () => {} });

/** Build the native model exactly as the browser does, on already-parsed GLTFs. */
async function buildNative() {
  const [gltf, clips] = await Promise.all([loadStripped(A('sly27.glb')), loadStripped(A('sly27-clips.glb'))]);
  const m = new Sly27(engineStub());
  await m.init({ gltf, clips, noTextures: true });
  return m;
}

/** World-space AABB of one named object, with the model's root transform applied. */
function boxOf(model, name) {
  /* through the runtime's own resolver — three de-dots node names, and an instrument with its
     own matcher would report on a character the browser does not build (§440). */
  const o = findNode(model.root, name);
  if (!o) return null;
  model.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

/** Step the mixer onto one clip at one time, from a clean state. */
function poseAt(model, clipName, t) {
  const clip = model.clips.get(clipKey(clipName));
  if (!clip) return false;
  model.mixer.stopAllAction();
  const a = model.mixer.clipAction(clip);
  a.reset().play();
  model.action = a;
  model.mixer.setTime(0);
  model.mixer.setTime(t);
  model.root.updateMatrixWorld(true);
  return true;
}

const f = (n, d = 4) => (n == null || !Number.isFinite(n) ? '  n/a  ' : n.toFixed(d));

/* ══════════════════════════════════════════════════════════════════════════════════════════ */

const native = await buildNative();
console.log(`\n══ sly27 — the native import, measured ═══════════════════════════════════════════\n`);
console.log(`  source file      public/assets/sly-godot/sly27.glb  +  sly27-clips.glb`);
console.log(`  joints           ${native.info.joints}`);
console.log(`  triangles        ${native.info.tris}`);
console.log(`  mesh parts       ${native.info.drawParts}  (${native.info.skinned} skinned, ${native.info.rigid} rigid-on-a-bone)`);
console.log(`  materials        ${native._matCache.size}  (${[...native._matCache.keys()].join(', ')})`);
console.log(`  clips            ${native.info.clips}`);
console.log(`  morph targets    ${native.info.morphs.length}  (${native.info.morphs.join(', ')})`);
console.log(`  raw height       ${f(native.info.rawHeight)} m   (measured at "${'Standupright'}" t=0, NOT at bind — §442)`);
console.log(`  scale applied    ×${f(native.info.scale)}   -> ${f(RIG3.TUNE.height)} m, the engine's character height`);

/* ── the cane: does it plant, or does it hang? ─────────────────────────────────────────────── */
console.log(`\n══ THE CANE ═════════════════════════════════════════════════════════════════════\n`);
console.log(`  It is a rigid 896-tri mesh parented to CaneBone.001 (joint #104, child of hand.R),`);
console.log(`  so it is posed by the CLIP, not by any attach logic of ours.\n`);
/* SWEPT, not sampled. The first version of this table read each clip at its midpoint and reported
   `PickPocket` and `Crouching stand` as bit-identical — which turned out to be TRUE of the data
   (these clips bake an absolute pose on every joint, so two clips that leave the right arm alone
   agree exactly) but useless as an answer, because a 4-second idle's midpoint is a hold. "Does it
   plant" is a claim about the whole clip, so the whole clip is walked and the CLOSEST the tip
   comes to the ground is reported with the time it happens.

   Walked at 1/60 with `mixer.update(dt)`, the way the engine steps it, rather than teleported with
   `setTime` (§435.4). Both were measured and they agree to 6 decimals on ten clip/time pairs — the
   teleport is not wrong here — but the walk is what the runtime does, so the walk is what is
   reported. */
console.log(`  clip                  tip@t=0   MIN tip     at t     top y   |horiz|   verdict`);
console.log(`  ${'-'.repeat(88)}`);
const caneRows = [];
const clipList = ONLY_CANE ? native.clipNames() : ['Standupright', 'Walk', 'Run', 'Jump', 'Falling', 'Landing', 'Canehit', 'CaneSwing', 'PoleGrab', 'LedgeGrab', 'PickPocket', 'Crouching stand'];
function sweepCane(name) {
  const clip = native.clips.get(clipKey(name));
  if (!clip) return null;
  native.mixer.stopAllAction();
  const a = native.mixer.clipAction(clip);
  a.reset().play();
  native.action = a;
  native.mixer.update(0);
  const read = () => { native.root.updateMatrixWorld(true); return boxOf(native, 'Cane_LowPoly'); };
  const b0 = read();
  let best = { y: b0.min.y, t: 0, top: b0.max.y, horiz: Math.hypot((b0.min.x + b0.max.x) / 2, (b0.min.z + b0.max.z) / 2) };
  const step = 1 / 60;
  for (let t = step; t <= clip.duration + 1e-9; t += step) {
    native.mixer.update(step);
    const b = read();
    if (b.min.y < best.y) best = { y: b.min.y, t, top: b.max.y, horiz: Math.hypot((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2) };
  }
  return { t0: b0.min.y, ...best };
}
for (const name of clipList) {
  const r = sweepCane(name);
  if (!r) { console.log(`  ${name.padEnd(20)} (absent)`); continue; }
  /* "Planted" is a claim about the ground, so it is tested against the ground: the tip within
     12 cm of y=0 (the soles are AT y=0 by construction). Every number is printed either way, so
     the reader is not taking the label's word for it. */
  const verdict = r.y < 0.12 ? 'PLANTS' : r.y > 0.45 ? 'carried high throughout' : 'held clear';
  caneRows.push({ name, ...r, verdict });
  console.log(`  ${name.padEnd(20)} ${f(r.t0, 3).padStart(8)}  ${f(r.y, 3).padStart(8)}  ${f(r.t, 2).padStart(6)}  ${f(r.top, 3).padStart(7)}  ${f(r.horiz, 3).padStart(7)}   ${verdict}`);
}

/* Bind pose, reported as itself and NOT used as a stand-in for a pose (§442). */
{
  native.mixer.stopAllAction();
  native.mixer.setTime(0);
  native.root.updateMatrixWorld(true);
  const b = boxOf(native, 'Cane_LowPoly');
  console.log(`\n  BIND POSE (no clip evaluated) — this is NOT a pose the source ever shows:`);
  console.log(`    cane tip y ${f(b?.min.y)}   top y ${f(b?.max.y)}  — quoted so that a frame captured`);
  console.log(`    before the mixer runs can be recognised as this rather than as a broken import.`);
}

if (ONLY_CANE) process.exit(0);

/* ── clip coverage: 24 native clips against the verbs the engine asks for ─────────────────── */
console.log(`\n══ CLIP COVERAGE ════════════════════════════════════════════════════════════════\n`);
{
  const { CLIP_NAMES } = await import('../src/player/Clips.js');
  const { GODOT_CLIPS } = await import('../src/player/GodotClips.js');
  const nativeNames = new Set(native.clipNames());
  const retargeted = new Set(Object.keys(GODOT_CLIPS).map(clipKey));
  console.log(`  the engine's verb set (Clips.js)        ${CLIP_NAMES.length} clips`);
  console.log(`  retargeted onto RIG3 today (GodotClips) ${retargeted.size} source motions`);
  console.log(`  native clips in sly27-clips.glb         ${nativeNames.size}`);
  const missing = [...retargeted].filter((n) => !nativeNames.has(n));
  const extra = [...nativeNames].filter((n) => !retargeted.has(n));
  console.log(`\n  source motions the retarget ships that the native file does NOT have: ${missing.length ? missing.join(', ') : '(none)'}`);
  console.log(`  native clips the retarget never took: ${extra.length ? extra.join(', ') : '(none)'}`);
  console.log(`\n  THE GAP THAT MATTERS: ${CLIP_NAMES.length} verbs are drawn today by ${retargeted.size} imported motions`);
  console.log(`  spliced into procedural poses. The native path has no procedural half — ${nativeNames.size} clips`);
  console.log(`  is all there is, and ${CLIP_NAMES.length - nativeNames.size} verbs have no native source at all.`);
}

/* ── §708's grip point, RE-DERIVED on this mesh rather than carried ───────────────────────── */
console.log(`\n══ THE GRIP POINT, re-derived (§708) ════════════════════════════════════════════\n`);
{
  /* §708 established that the grip point is the artist's GLOVE, not the hand BONE, because the
     character is a cartoon fox in oversized gloves — and that the offset is derived from skin
     weights, so it changes with the mesh and must NOT be carried across. Re-derived here.

     ON THIS RIG THE HAND BONE CARRIES NO SKIN AT ALL. `handR` and `handL` have zero weight on
     every vertex of all seven skinned meshes; the glove is weighted to their descendants —
     `palm01/04`, `f_index/middle/ring/pinky*`, `thumb01..03`. So an instrument that asks "which
     vertices are weighted to the hand bone" returns the empty set on a hand that visibly exists,
     which is what the first version of this section did. `handR` is a structural parent, exactly
     like `CaneBone.001` (also a zero-weight joint).

     What is measured instead: the weight-weighted centroid of every vertex influenced by the hand
     bone OR ANY OF ITS DESCENDANTS — the glove as the artist actually skinned it — against the
     hand bone's own rest position. In metres after the model's uniform scale, the frame every
     other distance in this report uses. */
  const skinned = [];
  native.root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const skel = skinned[0].skeleton;
  const names = skel.bones.map((b) => b.name);
  const S = native.info.scale;
  for (const boneName of ['handR', 'handL']) {
    const bi = names.indexOf(boneName);
    if (bi < 0) { console.log(`  ${boneName}: absent`); continue; }
    /* the hand bone and everything under it, by walking the loaded bone hierarchy */
    const cluster = new Set();
    (function walk(b) { const i = names.indexOf(b.name); if (i >= 0) cluster.add(i); for (const ch of b.children) if (ch.isBone) walk(ch); })(skel.bones[bi]);
    let wsum = 0, ownW = 0; const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    let touched = 0, maxW = 0;
    for (const m of skinned) {
      const g = m.geometry;
      const ji = g.attributes.skinIndex, wj = g.attributes.skinWeight, pos = g.attributes.position;
      if (!ji || !wj) continue;
      for (let k = 0; k < pos.count; k++) {
        let w = 0;
        for (let s = 0; s < 4; s++) {
          const b = ji.getComponent(k, s), ww = wj.getComponent(k, s);
          if (cluster.has(b)) w += ww;
          if (b === bi) ownW += ww;
        }
        if (w <= 0) continue;
        maxW = Math.max(maxW, w); touched++;
        v.fromBufferAttribute(pos, k); c.addScaledVector(v, w); wsum += w;
      }
    }
    console.log(`  ${boneName}: ${cluster.size} bones in the hand cluster; weight ON THE HAND BONE ITSELF = ${f(ownW, 3)}`);
    if (!wsum) { console.log(`  ${boneName}: the whole cluster influences nothing`); continue; }
    c.divideScalar(wsum);
    const n = touched;
    /* the bone's own rest position, from the inverse bind matrix — authoritative and independent
       of whatever pose the file is left in. */
    const bw = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skel.boneInverses[bi]).invert());
    const d = c.distanceTo(bw) * S;
    console.log(`  ${boneName.padEnd(7)} ${String(n).padStart(4)} vertices influenced (max single weight ${f(maxW, 3)}); `
      + `influence centroid is ${f(d * 100, 2)} cm from the bone (after the ×${f(native.info.scale, 3)} scale)`);
  }
  console.log(`\n  §708 measured ~20 cm on the INCUMBENT mesh. That number is not carried here — the`);
  console.log(`  figures above are this mesh's own, and they are reported, not acted on.`);
}

/* ── against the incumbent godot arm, same measurement both sides ─────────────────────────── */
console.log(`\n══ AGAINST ?char=godot (the same sculpt, rebound to RIG3) ═══════════════════════\n`);
{
  const gPath = A('sly-godot.glb');
  if (!existsSync(gPath)) console.log('  sly-godot.glb absent — nothing to compare against.');
  else {
    const g = await loadStripped(gPath);
    const { SlyModel: SlyGodot } = await import('../src/player/SlyModelGodot.js');
    const gm = new SlyGodot(engineStub());
    await gm.init({ gltf: g, noTextures: true });
    const gb = new THREE.Box3().setFromObject(gm.root);
    native.mixer.stopAllAction();
    poseAt(native, 'Standupright', 0);
    const nb = new THREE.Box3().setFromObject(native.root);
    const row = (l, a, b) => console.log(`  ${l.padEnd(22)} ${String(a).padStart(12)}   ${String(b).padStart(12)}`);
    console.log(`  ${''.padEnd(22)} ${'?char=godot'.padStart(12)}   ${'?char=sly27'.padStart(12)}`);
    row('joints', gm.info.joints, native.info.joints);
    row('triangles', gm.info.tris, native.info.tris);
    row('scale applied', `×${f(gm.info.scale)}`, `×${f(native.info.scale)}`);
    row('drawn height (m)', f(gb.max.y - gb.min.y), f(nb.max.y - nb.min.y));
    row('sole y (m)', f(gb.min.y), f(nb.min.y));
    row('crown y (m)', f(gb.max.y), f(nb.max.y));
    row('width x (m)', f(gb.max.x - gb.min.x), f(nb.max.x - nb.min.x));
    row('depth z (m)', f(gb.max.z - gb.min.z), f(nb.max.z - nb.min.z));
    console.log(`\n  ?char=godot's height is its BIND pose (RIG3, identity rotations — that IS its rest`);
    console.log(`  and it is a legitimate reading there). ?char=sly27's is at Standupright t=0, because`);
    console.log(`  this rig's bind is not a pose (§442). They are not the same kind of number and the`);
    console.log(`  difference in the sole/crown rows is mostly that, not a difference in the character.`);
  }
}
console.log('');

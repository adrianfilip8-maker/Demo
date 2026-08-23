#!/usr/bin/env node
/**
 * idleref.mjs — what does the REFERENCE standing idle do with the arms, and where is ours?
 *
 * The user's ruling (§479.16): *"the default pose seems to be worse. For the pose, have arms
 * spread further out to the side to be more similar to the default pose of the character in
 * Sly 2."* The reference is not a number anyone should pick from memory — it is sitting in the
 * repository, so this measures it.
 *
 * WHICH CLIP, read from their scene graph rather than chosen by name: their `floor_state`
 * blend takes five inputs, and input 3 is `"idle stand"` →
 * `AnimationNodeAnimation_y3bsy` → `Library_Sly_19/Standupright`
 * (`Scenes/Character Mesh/sly_cooper_anims_4.tscn:47918,48107,48139`). The other two standing
 * inputs (`idle crouch`, `idle crouch low`) BOTH resolve to `Crouching stand   `, the crouched
 * idle. So `Standupright` is their default standing pose — the thing the user is naming.
 *
 * THE FRAME, and why these three numbers: comparing two rigs' Euler triples is meaningless
 * (their rest arm hangs at [.54,−.84,.04], RIG3's at [.72,−.69,0] — §479.6), so every quantity
 * here is a POSE property measured off joint POSITIONS in a frame the pose itself defines:
 *
 *   lat  = upperArmL − upperArmR, horizontalised   (the shoulder line — §479.5's frame)
 *   up   = chest − hips                            (the torso axis, so a lean cannot fake it)
 *   fwd  = lat × up
 *
 *   ABDUCTION  the shoulder→elbow direction's angle out of the torso's down-axis, in the
 *              frontal plane: 0° = arm hanging flat against the ribs, 90° = straight out to
 *              the side. THIS is the number the user's words name.
 *   FLEXION    the same direction's forward/back component (+ = forward of the torso plane).
 *   FOLD       the interior angle at the elbow (180° = straight).
 *   SEP        hand-to-hand lateral separation, in cm and in shoulder-widths.
 *
 * Both sides are reported: their idle need not be symmetric, and ours certainly is not (the
 * right hand holds the cane).
 *
 *   node tools/idleref.mjs              measure the reference + our shipped idles
 *   node tools/idleref.mjs --try        also score the candidate arm chains in TRY below
 */
import './_domshim.mjs';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { carry, fmtCarry } from './_posecarry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET = path.join(ROOT, 'public/assets/sly-godot/sly-godot-moves.glb');

/* The pose-geometry metric (frame, abduction, flexion, fold, hand-out, separation) lives in
   `_posecarry.mjs` — one copy, shared with `idlecensus.mjs`, because two rounds of user rulings
   are quoted against these exact numbers (§212). */
const fmt = fmtCarry;

/* ------------------------------------------------------------------------ the reference ---- */
const buf = readFileSync(ASSET);
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const root = gltf.scene;
root.updateMatrixWorld(true);
const nodes = new Map();
root.traverse((o) => { if (o.name) nodes.set(o.name, o); });
const resolve = (nm) => nodes.get(nm) || nodes.get(nm.replace(/\./g, '')) || nodes.get(nm.replace(/\./g, '_'));
const SRC = {
  hips: 'spine.001', chest: 'spine.004',
  upperArmL: 'upper_arm.L', lowerArmL: 'forearm.L', handL: 'hand.L',
  upperArmR: 'upper_arm.R', lowerArmR: 'forearm.R', handR: 'hand.R',
};
const _v = new THREE.Vector3();
const srcAt = (role) => _v.setFromMatrixPosition(resolve(SRC[role]).matrixWorld).clone();

const mixer = new THREE.AnimationMixer(root);
console.log(`REFERENCE — ${path.basename(ASSET)}\n`);
for (const name of ['Standupright', 'Crouching stand   ']) {
  const clip = gltf.animations.find((a) => a.name === name || a.name.trim() === name.trim());
  if (!clip) { console.log(`  !! ${name}: absent`); continue; }
  const act = mixer.clipAction(clip); act.reset(); act.play();
  /* three phases: their standing idles are 4 s breathing loops, so one sample could be a
     transient. The spread should be small; if it is not, the number to quote is the mean. */
  const rows = [];
  for (const f of [0.10, 0.45, 0.80]) {
    mixer.setTime(f * clip.duration);
    root.updateMatrixWorld(true);
    rows.push(carry(srcAt));
  }
  act.stop();
  console.log(`${name.trim()} (${clip.duration.toFixed(2)} s, their "${name.trim() === 'Standupright' ? 'idle stand' : 'idle crouch'}")`);
  rows.forEach((r, i) => fmt(`@${[10, 45, 80][i]}%`, r));
  const mean = (k, S) => (rows.reduce((s, r) => s + r[S][k], 0) / rows.length).toFixed(1);
  console.log(`  MEAN  L abduction ${mean('abduction', 'L')}°  fold ${mean('fold', 'L')}°  |  R abduction ${mean('abduction', 'R')}°  fold ${mean('fold', 'R')}°\n`);
}

/* ------------------------------------------------------------------------------- ours ------ */
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { CLIPS, compile, sampleInto } = await import('../src/player/Clips.js');
const { buildClipSet } = await import('../src/player/Animation.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const ourAt = (role) => new THREE.Vector3().setFromMatrixPosition(sly.bones[role].matrixWorld);

function ours(clip, t) {
  pb.clear();
  sampleInto(clip, t, pb, 1);
  for (const n of sly.boneNames) {
    const b = sly.bones[n]; if (!b) continue;
    if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  sly.root.updateMatrixWorld(true);
  return carry(ourAt);
}

/* The SHIPPED table, not the raw clip: in the `godot` regime every procedural clip still
   passes through §531's limb lever (Animation.js:624), so `CLIPS.idle_confident` is NOT what
   the player is looking at. Both are printed — the delivered row is the one that answers the
   user. */
const SHIP = buildClipSet('godot').table;
console.log('OURS — through the real compile → sampleInto → SlyModel FK\n');
for (const n of ['idle_confident', 'idle_bored', 'idle_look']) {
  const c = CLIPS[n];
  console.log(`${n} (${c.dur} s, hold ${c.hold})`);
  fmt('raw (?anim=proc)', ours(c, c.hold));
  fmt('DELIVERED (shipped)', ours(SHIP[n], SHIP[n].hold));
  console.log('');
}

/* --------------------------------------------------------------------- candidate scoring --- */
if (process.argv.includes('--try')) {
  const { TRY } = await import('./idletry.mjs');
  console.log('CANDIDATES (arm chain substituted into idle_confident\'s own key 0)\n');
  const raw = CLIPS.idle_confident;
  for (const [tag, arms] of Object.entries(TRY)) {
    /* rebuild key 0's pose with the candidate arm chain, hold it as a 1-key clip so the
       measurement is of the POSE, not of a fidget phase */
    const k0 = raw.keys ? raw.keys[0] : null;
    void k0;
    const P0 = { ...arms.base, ...arms.chain };
    const cand = compile('cand', { dur: 1, loop: true, hold: 0.5, keys: [
      { t: 0, e: 'soft', P: P0, pos: arms.pos }, { t: 1, e: 'soft', P: P0, pos: arms.pos }] });
    fmt(tag, ours(cand, 0.5));
  }
}
if (warnings.length) console.log(`\nwarnings: ${warnings.slice(0, 3).join(' | ')}`);

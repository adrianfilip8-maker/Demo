#!/usr/bin/env node
/**
 * idleseam — what a binding costs at the STATE TRANSITION it lives on. §717's instrument.
 *
 *   node tools/idleseam.mjs <bench-module.js|-> '[["A","B","label"],...]'
 *
 * A name resolves against the SHIPPED source tables first (the bench module, then
 * GodotLibClips, GodotClips, and the procedural set last); `proc:<verb>` forces the procedural
 * authoring def. That order is deliberate — resolving a verb name to a same-named procedural
 * clip would make every baseline row flatter than the truth.
 *
 * §715 refused `Run 1` not on its own numbers but on the tree's contract with its blend
 * partner. Every idle verb here has a partner it fades to and from constantly:
 *   idle_bored   ↔ idle_confident / idle_look   (Moveset.js:142, 0.3 s crossfade, 6 s and 13 s)
 *   sneak_idle   ↔ sneak_walk                   (Moveset.js:176, 0.2 s, on every stop/start)
 *   balance_idle ↔ rail_walk                    (Moveset.js:1358, 0.2 s, on every stop/start)
 * A pose that measures fine alone can still POP at that seam. This reports, for a pair, the
 * hips-height step and the per-bone angular distance between the two clips' cycle-mean poses.
 *
 * The BAND is the shipped set's own: the proc pairs that already ship and already look right
 * are printed first, so "large" is a comparison rather than a threshold I invented.
 */
import './_domshim.mjs';
import * as THREE from 'three';

const BENCH = process.argv[2];
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { compile, sampleInto, RAW_CLIPS } = await import('../src/player/Clips.js');
const { GODOT_CLIPS } = await import('../src/player/GodotClips.js');
const { GODOT_LIB_CLIPS } = await import('../src/player/GodotLibClips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');
const bench = BENCH && BENCH !== '-' ? (await import((await import('node:path')).resolve(BENCH))).GODOT_LIB_CLIPS : {};
const DEG = 180 / Math.PI;

const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const at = (n) => new THREE.Vector3().setFromMatrixPosition(sly.bones[n].matrixWorld);
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'lowerArmL',
  'handL', 'shoulderR', 'upperArmR', 'lowerArmR', 'handR', 'upperLegL', 'lowerLegL', 'footL',
  'upperLegR', 'lowerLegR', 'footR'];

/* `proc:<verb>` forces the procedural authoring def; a bare name is looked up in the SHIPPED
   source tables first, so a baseline row measures what actually ships rather than a same-named
   procedural stand-in — the mistake that would make every baseline flatter than the truth. */
function src(name) {
  if (name.startsWith('proc:')) {
    const n = name.slice(5);
    if (!RAW_CLIPS[n]) throw new Error(`seam717: no proc clip ${n}`);
    return RAW_CLIPS[n];
  }
  if (bench[name]) return bench[name];
  if (GODOT_LIB_CLIPS[name]) return GODOT_LIB_CLIPS[name];
  if (GODOT_CLIPS[name]) return GODOT_CLIPS[name];
  if (RAW_CLIPS[name]) return RAW_CLIPS[name];
  throw new Error(`seam717: no clip ${name}`);
}
/** cycle-mean WORLD rotation per bone + mean hips height, over the whole loop */
function meanPose(name) {
  const c = compile(name, src(name));
  const N = 40;
  const acc = Object.create(null), hips = [];
  for (const b of BONES) acc[b] = [];
  for (let i = 0; i < N; i++) {
    pb.clear();
    sampleInto(c, (i / N) * c.dur, pb, 1);
    for (const n of sly.boneNames) {
      const b = sly.bones[n]; if (!b) continue;
      if (pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
      if (pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
    }
    const base = sly.bp('hips');
    sly.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
    sly.root.updateMatrixWorld(true);
    hips.push(at('hips').y);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const b of BONES) { if (!sly.bones[b]) continue; sly.bones[b].matrixWorld.decompose(p, q, s); acc[b].push(q.clone()); }
  }
  const out = Object.create(null);
  for (const b of BONES) {
    if (!acc[b].length) continue;
    /* quaternion mean by hemisphere-aligned average, renormalised — adequate for the small
       spreads an idle cycle covers, and every input is checked against the first sample's sign */
    const r = new THREE.Quaternion(0, 0, 0, 0);
    for (const q of acc[b]) {
      const s = q.dot(acc[b][0]) < 0 ? -1 : 1;
      r.x += s * q.x; r.y += s * q.y; r.z += s * q.z; r.w += s * q.w;
    }
    r.normalize(); out[b] = r;
  }
  return { pose: out, hipsY: hips.reduce((a, v) => a + v, 0) / hips.length };
}

const cache = new Map();
const M = (n) => (cache.get(n) || (cache.set(n, meanPose(n)), cache.get(n)));

function seam(a, b) {
  const A = M(a), B = M(b);
  let worst = 0, worstB = '', sum = 0, n = 0;
  for (const bone of BONES) {
    if (!A.pose[bone] || !B.pose[bone]) continue;
    const d = A.pose[bone].clone().invert().multiply(B.pose[bone]);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
    if (ang > worst) { worst = ang; worstB = bone; }
    sum += ang; n++;
  }
  return { hipsCm: (B.hipsY - A.hipsY) * 100, worst, worstB, mean: sum / n };
}

const PAIRS = JSON.parse(process.argv[3] || '[]');
console.log('  ' + 'A'.padEnd(20) + '→ ' + 'B'.padEnd(20) + 'hips step'.padStart(11)
  + 'mean bone'.padStart(11) + 'worst bone'.padStart(12) + '  at');
for (const [a, b, tag] of PAIRS) {
  const s = seam(a, b);
  console.log('  ' + a.padEnd(20) + '→ ' + b.padEnd(20)
    + (s.hipsCm >= 0 ? '+' : '') + s.hipsCm.toFixed(1).padStart(9) + ' cm'
    + s.mean.toFixed(1).padStart(9) + '°' + s.worst.toFixed(1).padStart(10) + '°  '
    + s.worstB + (tag ? `   ${tag}` : ''));
}

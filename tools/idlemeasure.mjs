#!/usr/bin/env node
/**
 * idlemeasure — every idle candidate and every idle incumbent, on the SHIPPED rig, through the
 * SHIPPED compile()/sampleInto() seam, over the whole cycle. §717's instrument.
 *
 *   node tools/idlemeasure.mjs                       the shipped set + the baked godot clips
 *   node tools/idlemeasure.mjs <bench-module.js>     ... plus a candidate module emitted by
 *                                                    `godotlib2clips.mjs --asset X --keep Y`
 *
 * WHY IT EXISTS. §715 and §717 both had to answer "does this clip's foot touch the ground, and
 * does this clip move" about clips that were not yet bound, and §715's importer could only
 * report in ITS OWN clip space. "The ankles float 0.46" is a true sentence about a frame nobody
 * looks at; what decides a binding is where the foot lands on the rig the player sees.
 *
 * Metric vocabulary is borrowed, not re-invented: `_posecarry.mjs`'s carry() (the one copy the
 * §479 rulings are quoted against) plus idlecensus.mjs's classifier axes (travel / sweep / foot
 * band / hip fraction / uprightness). What this adds is the GROUND CONTACT reading on OUR rig:
 * the lowest world y any foot/toe reaches over the cycle, which is what "the ankles float"
 * means at the play site rather than in the importer's clip space.
 *
 * §442 guard: the rig is posed from the clip before every read, and the run prints the BIND
 * pose as its own row — an instrument that measured the bind pose would report every clip
 * identical to that row. §418.3: known-good and known-bad inputs are in the same table.
 */
import './_domshim.mjs';
import * as path from 'node:path';
import * as THREE from 'three';
import { carry, DEG } from './_posecarry.mjs';

const BENCH = process.argv[2];
const warnings = [];
const engine = {
  quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(m), get: () => null, has: () => false, on: () => () => {}, emit: () => {},
};
const { SlyModel } = await import('../src/player/SlyModel.js');
const { compile, sampleInto, RAW_CLIPS } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const sly = new SlyModel(engine); await sly.init();
const pb = new PoseBuffer(sly.boneNames);
const at = (role) => new THREE.Vector3().setFromMatrixPosition(sly.bones[role].matrixWorld);

/* the bench module is `export const GODOT_LIB_CLIPS = {...}` — read it as data */
const bench = BENCH ? (await import(path.resolve(BENCH))).GODOT_LIB_CLIPS : {};

function poseAt(clip, t) {
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
}
function bindPose() {
  for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) { b.quaternion.identity(); b.scale.set(1, 1, 1); } }
  const base = sly.bp('hips');
  sly.bones.hips.position.set(base.x, base.y, base.z);
  sly.root.updateMatrixWorld(true);
}

const FEET = ['footL', 'footR', 'toeL', 'toeR'];
const N = 61;
/* the ground reference is the rig's OWN bind foot height, so every row reads as a signed
   departure from where the rest pose puts the contact — the importer's IK_ANKLE convention,
   re-derived on our rig instead of copied as a constant. */
let BIND_FOOT = 0;

function measure(name, raw) {
  const c = compile(name, raw);
  const hipsY = [], hipsX = [], hipsZ = [], footY = [], seps = [], foldL = [], foldR = [],
    outL = [], outR = [], upright = [];
  const perBone = Object.create(null);
  const worldQ = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * c.dur;
    poseAt(c, t);
    const h = at('hips'), ch = at('chest');
    hipsY.push(h.y); hipsX.push(h.x); hipsZ.push(h.z);
    footY.push(Math.min(...FEET.map((f) => (sly.bones[f] ? at(f).y : Infinity))));
    for (const f of FEET) if (sly.bones[f]) (perBone[f] || (perBone[f] = [])).push(at(f).y);
    /* STEP DETECTOR — a gait lifts one toe clear while the other stays down; an idle lifts
       neither. Read as each toe's own vertical excursion over the cycle. */
    (perBone.__tl || (perBone.__tl = [])).push(at('toeL').y);
    (perBone.__tr || (perBone.__tr = [])).push(at('toeR').y);
    /* BRACE DETECTOR — perch_idle's defining feature is a glove planted low and FORWARD of the
       hips. Hand height above the contact plane, and hand offset along the pose's own forward. */
    const latB = at('upperArmL').clone().sub(at('upperArmR')); latB.y = 0; latB.normalize();
    const upB = at('chest').clone().sub(at('hips')).normalize();
    const fwdB = new THREE.Vector3().crossVectors(latB, upB).normalize();
    const hp = at('hips');
    (perBone.__hy || (perBone.__hy = [])).push(Math.min(at('handL').y, at('handR').y));
    (perBone.__hf || (perBone.__hf = [])).push(Math.max(at('handL').clone().sub(hp).dot(fwdB), at('handR').clone().sub(hp).dot(fwdB)));
    const cy = carry(at);
    seps.push(cy.sepCm); foldL.push(cy.L.fold); foldR.push(cy.R.fold);
    outL.push(cy.L.handOutCm); outR.push(cy.R.handOutCm);
    const u = ch.clone().sub(h).normalize();
    upright.push(Math.acos(THREE.MathUtils.clamp(u.y, -1, 1)) * DEG);
    const qs = [];
    for (const n of sly.boneNames) { const b = sly.bones[n]; if (b) qs.push(b.quaternion.clone()); }
    worldQ.push(qs);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const rng = (a) => Math.max(...a) - Math.min(...a);
  /* LOOP SEAM measured on the AUTHORING KEYS, never through sampleInto: the sampler wraps
     (t % dur), so pose(dur) IS pose(0) by construction and a seam read there is the
     instrument agreeing with itself (§439/§440). First key vs last key is the real seam. */
  const A = worldQ[0];
  let seam = 0, seamBone = '';
  {
    const ks = raw.keys.slice().sort((a, b) => a.t - b.t);
    const first = ks[0], last = ks[ks.length - 1];
    const poseOf = (k) => {
      const acc = Object.create(null);
      for (const kk of ks) { if (kk.t > k.t) break; for (const b in kk.P) acc[b] = kk.P[b]; }
      return acc;
    };
    const pa = poseOf(first), pb2 = poseOf(last);
    const e = new THREE.Euler(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (const b of new Set([...Object.keys(pa), ...Object.keys(pb2)])) {
      const va = pa[b] || [0, 0, 0], vb = pb2[b] || [0, 0, 0];
      e.set(va[0] / DEG, va[1] / DEG, va[2] / DEG, 'XYZ'); qa.setFromEuler(e);
      e.set(vb[0] / DEG, vb[1] / DEG, vb[2] / DEG, 'XYZ'); qb.setFromEuler(e);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(qa.clone().invert().multiply(qb).w))) * DEG;
      if (ang > seam) { seam = ang; seamBone = b; }
    }
  }
  /* mean per-second joint sweep, idlecensus' SWEEP_DPS axis */
  let sweep = 0;
  for (let i = 1; i < worldQ.length; i++) {
    let s = 0;
    for (let b = 0; b < A.length; b++) {
      const d = worldQ[i - 1][b].clone().invert().multiply(worldQ[i][b]);
      s += 2 * Math.acos(Math.min(1, Math.abs(d.w))) * DEG;
    }
    sweep += s / A.length;
  }
  sweep /= c.dur;
  return {
    name, dur: +c.dur.toFixed(2), loop: c.loop,
    hipsY: +mean(hipsY).toFixed(3), hipsYmin: +Math.min(...hipsY).toFixed(3),
    swayCm: +(rng(hipsX) * 100).toFixed(1), surgeCm: +(rng(hipsZ) * 100).toFixed(1),
    bobCm: +(rng(hipsY) * 100).toFixed(1),
    footYmin: +Math.min(...footY).toFixed(3), footYmax: +Math.max(...footY).toFixed(3),
    groundCm: +((Math.min(...footY) - BIND_FOOT) * 100).toFixed(1),
    perBone: Object.fromEntries(Object.entries(perBone).filter(([k]) => !k.startsWith('__')).map(([k, v]) => [k, +Math.min(...v).toFixed(3)])),
    stepL: +((Math.max(...perBone.__tl) - Math.min(...perBone.__tl)) * 100).toFixed(1),
    stepR: +((Math.max(...perBone.__tr) - Math.min(...perBone.__tr)) * 100).toFixed(1),
    handY: +((Math.min(...perBone.__hy) - BIND_FOOT) * 100).toFixed(1),
    handF: +(Math.max(...perBone.__hf) * 100).toFixed(1),
    seamBone,
    sep: +mean(seps).toFixed(1), sepMin: Math.min(...seps), sepMax: Math.max(...seps),
    foldL: +mean(foldL).toFixed(0), foldR: +mean(foldR).toFixed(0),
    outL: +mean(outL).toFixed(1), outR: +mean(outR).toFixed(1),
    upright: +mean(upright).toFixed(1),
    seam: +seam.toFixed(1), sweep: +sweep.toFixed(1),
  };
}

const rows = [];
/* the §442 control: the bind pose read by the SAME code path */
bindPose();
BIND_FOOT = Math.min(...FEET.map((f) => at(f).y));
{
  const cy = carry(at);
  rows.push({
    name: '(BIND POSE — §442 control)', dur: 0, loop: false,
    hipsY: +at('hips').y.toFixed(3), hipsYmin: +at('hips').y.toFixed(3),
    swayCm: 0, surgeCm: 0, bobCm: 0,
    footYmin: +Math.min(...FEET.map((f) => at(f).y)).toFixed(3),
    footYmax: +Math.min(...FEET.map((f) => at(f).y)).toFixed(3),
    sep: cy.sepCm, sepMin: cy.sepCm, sepMax: cy.sepCm,
    foldL: cy.L.fold, foldR: cy.R.fold, outL: cy.L.handOutCm, outR: cy.R.handOutCm,
    upright: +(Math.acos(THREE.MathUtils.clamp(at('chest').clone().sub(at('hips')).normalize().y, -1, 1)) * DEG).toFixed(1),
    seam: 0, sweep: 0,
  });
}

const PROC = ['idle_confident', 'idle_bored', 'idle_look', 'perch_idle', 'balance_idle',
  'sneak_idle', 'crouch_idle', 'sneak_walk', 'crouch_walk'];
for (const n of PROC) if (RAW_CLIPS[n]) rows.push({ ...measure(n, RAW_CLIPS[n]), tag: 'proc' });
for (const n of Object.keys(bench)) rows.push({ ...measure(n, bench[n]), tag: 'ported' });
/* the SHIPPED library bake — the clips §715 and §717 actually bound, so every number those
   sections quote is re-derivable from this tool with no argument at all. */
const { GODOT_LIB_CLIPS } = await import('../src/player/GodotLibClips.js');
for (const n of Object.keys(GODOT_LIB_CLIPS)) {
  if (bench[n]) continue;                       // a bench module overrides the shipped bake
  rows.push({ ...measure(n, GODOT_LIB_CLIPS[n]), tag: 'lib' });
}
/* the ALREADY-BAKED gltf set: §715's refusals live here, and RailrunStand is this table's
   §418.3 fail arm — the clip refused for feet that float, measured on the same instrument. */
const { GODOT_CLIPS } = await import('../src/player/GodotClips.js');
for (const n of ['Standupright', 'Crouching stand', 'RailrunStand', 'SpireJumpIdle',
  'PoleClimbIdle', 'CaneSwing Idle', 'LedgeGrab Idle']) {
  if (GODOT_CLIPS[n]) rows.push({ ...measure(n, GODOT_CLIPS[n]), tag: 'gltf' });
}

const H = ['clip', 'dur', 'lp', 'hipsY', 'bob', 'sway', 'surge', 'grndCm', 'footYmax',
  'sep', 'sepMin', 'sepMax', 'foldL', 'foldR', 'outL', 'outR', 'tilt', 'seam', 'sweep'];
const W = [32, 6, 3, 7, 6, 6, 6, 8, 9, 7, 7, 7, 6, 6, 7, 7, 6, 6, 7];
console.log(H.map((h, i) => h.padStart(W[i])).join(''));
for (const r of rows) {
  const v = [r.name + (r.tag ? ` [${r.tag}]` : ''), r.dur, r.loop ? 'y' : 'n', r.hipsY, r.bobCm, r.swayCm,
    r.surgeCm, r.groundCm ?? 0, r.footYmax, r.sep, r.sepMin, r.sepMax, r.foldL, r.foldR, r.outL, r.outR,
    r.upright, r.seam, r.sweep];
  console.log(v.map((x, i) => String(x).padStart(W[i])).join(''));
}
console.log('\nhipsY/footY are WORLD metres on the shipped rig; bob/sway/surge are hips excursion cm over the cycle;');
console.log('sep/out are _posecarry cm; fold deg; tilt = chest-over-hips off world up (deg); seam = worst-bone t0 vs tEnd (deg);');
console.log('sweep = mean per-bone deg/s (idlecensus SWEEP_DPS axis: an idle sits low, a gait high).');

console.log('\n— per-contact-bone minimum world y over the cycle (m), and the worst-bone loop seam —');
for (const r of rows) {
  if (!r.perBone) continue;
  console.log(`  ${(r.name + (r.tag ? ` [${r.tag}]` : '')).padEnd(34)} `
    + Object.entries(r.perBone).map(([k, v]) => `${k} ${v.toFixed(3)}`).join('  ')
    + `   seam ${r.seam.toFixed(1)}deg @${r.seamBone}`);
}

console.log('\n— STEP detector (per-toe vertical excursion cm: a gait lifts, an idle does not) and BRACE detector —');
console.log('  ' + 'clip'.padEnd(34) + 'stepL'.padStart(7) + 'stepR'.padStart(7) + '   lowest hand above contact (cm)   furthest hand FORWARD of hips (cm)');
for (const r of rows) {
  if (r.stepL === undefined) continue;
  console.log('  ' + (r.name + (r.tag ? ` [${r.tag}]` : '')).padEnd(34)
    + String(r.stepL).padStart(7) + String(r.stepR).padStart(7)
    + String(r.handY).padStart(28) + String(r.handF).padStart(37));
}

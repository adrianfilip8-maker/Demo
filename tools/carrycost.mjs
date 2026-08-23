#!/usr/bin/env node
/**
 * carrycost.mjs — price the DL geometry carry against the procedural control, OFFLINE, on the
 * whole clip table, through ONE code path.
 *
 * §479.12 measured the shipped rig reading ~8 cm tighter between the arms than `?char=model3`
 * at `idle_confident` and attributed the difference to `SlyModelDLRig`'s per-bone geometry
 * carry. That comparison was taken in-page, one browser run per character, which is correct but
 * expensive (it needs the shared capture lock) and it cannot separate the two things that make
 * the numbers differ:
 *
 *   · PLACEMENT — the carry rotating a bone's geometry, which is what "carry cost" should mean;
 *   · BULK — the two characters simply being different meshes. `gapCm` is a SURFACE clearance
 *     (innermost left-arm vertex minus innermost right-arm vertex), so a chunkier glove reads
 *     tighter at an identical pose with a perfectly correct carry.
 *
 * The separator is the BIND row: with every bone at identity no clip and no posed rotation is
 * involved, so whatever the two models differ by there is bulk-and-bind-placement, and it is the
 * constant that must be subtracted from every posed row before any of it is called a defect.
 *
 * Both characters are loaded in this one process — the shipped `SlyModelDLRig` through the same
 * three transport rewrites `tests/dlrig.test.mjs` uses (it needs Vite's `import.meta.glob` and a
 * `file:` fetch), and the control `SlyModel3`. Same predicate, same frame, same sampler, so a
 * difference in the output is a difference in the models rather than in the instruments.
 *
 *   node tools/carrycost.mjs                    bind + the idle family
 *   node tools/carrycost.mjs --all              bind + every clip in the table
 *   node tools/carrycost.mjs walk run idle_look
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/player/SlyModelDLRig.js');
const SHIM = path.join(ROOT, 'node_modules/.carrycost');

/* ---- the transport shims three's loaders need in plain Node (dlrig.test.mjs's, verbatim) ---- */
class FakeImg {
  constructor() { this.width = 1; this.height = 1; }
  addEventListener() {} removeEventListener() {}
  set src(_v) {} get src() { return ''; }
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => new FakeImg(), createElement: () => new FakeImg() };
}
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class { constructor(t, i = {}) { this.type = t; Object.assign(this, i); } };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  if (url.startsWith('file:')) return new Response(readFileSync(new URL(url)), { status: 200 });
  return realFetch(input, init);
};

async function loadDLRig() {
  let src = readFileSync(SRC, 'utf8');
  const globRe = /import\.meta\.glob\([^;]*?\);/;
  if ((src.match(new RegExp(globRe.source, 'g')) || []).length !== 1) {
    throw new Error('carrycost: expected exactly one import.meta.glob in SlyModelDLRig.js');
  }
  src = src.replace(globRe, '{};');
  src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));
  src = src.replace(/(\bfrom\s+')(\.\.?\/[^']+)(')/g,
    (_m, a, spec, c) => a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + c);
  mkdirSync(SHIM, { recursive: true });
  const out = path.join(SHIM, `m${process.pid}.mjs`);
  writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

function stubEngine() {
  const warns = [];
  const shading = {
    make: (o) => new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff }),
    outline: () => {},
  };
  return { warns, quality: 'med', scene: new THREE.Scene(), debug: {}, stats: {},
    warn: (s) => warns.push(s), get: (k) => (k === 'shading' ? shading : undefined),
    has: () => false, on: () => () => {}, emit: () => {} };
}

const { buildClipSet } = await import('../src/player/Animation.js');
const { sampleInto } = await import('../src/player/Clips.js');
const { PoseBuffer } = await import('../src/player/Rig.js');

const dlMod = await loadDLRig();
const m3Mod = await import('../src/player/SlyModel3.js');

const models = {};
for (const [key, Cls] of [['dlrig', dlMod.SlyModel], ['model3', m3Mod.SlyModel]]) {
  const m = new Cls(stubEngine());
  await m.init();
  models[key] = { m, pb: new PoseBuffer(m.boneNames) };
}
try { rmSync(SHIM, { recursive: true, force: true }); } catch { /* best effort */ }

const LSET = new Set(['shoulderL', 'upperArmL', 'lowerArmL', 'handL']);
const RSET = new Set(['shoulderR', 'upperArmR', 'lowerArmR', 'handR']);
const _v = new THREE.Vector3();

/** The §479.10 volume predicate on one model, at one pose. `clip === null` means BIND. */
function gapOf(key, clip, t) {
  const { m, pb } = models[key];
  pb.clear();
  if (clip) sampleInto(clip, t, pb, 1);
  for (const n of m.boneNames) {
    const b = m.bones[n]; if (!b) continue;
    if (clip && pb.w[n] > 0) b.quaternion.copy(pb.q[n]); else b.quaternion.identity();
    if (clip && pb.sw[n] > 0) b.scale.copy(pb.s[n]); else b.scale.set(1, 1, 1);
  }
  const base = m.bp('hips');
  if (clip) m.bones.hips.position.set(base.x + pb.pos.x, base.y + pb.pos.y, base.z + pb.pos.z);
  else m.bones.hips.position.copy(base);
  m.root.updateMatrixWorld(true);

  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(m.bones[n].matrixWorld);
  const ua = wp('upperArmL'), ub = wp('upperArmR'), hip = wp('hips');
  const lat = ua.clone().sub(ub); lat.y = 0; lat.normalize();
  const latOf = (p) => p.clone().sub(hip).dot(lat);

  let lMin = Infinity, rMax = -Infinity;
  m.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry, pos = g.attributes.position;
    const sI = g.attributes.skinIndex, sW = g.attributes.skinWeight;
    if (!sI || !sW) return;
    const names = o.skeleton.bones.map((b) => b.name);
    for (let v = 0; v < pos.count; v++) {
      let wl = 0, wr = 0;
      for (let k = 0; k < 4; k++) {
        const w = sW.getComponent(v, k); if (w <= 0) continue;
        const nm = names[sI.getComponent(v, k)];
        if (LSET.has(nm)) wl += w; else if (RSET.has(nm)) wr += w;
      }
      if (wl < 0.6 && wr < 0.6) continue;
      _v.fromBufferAttribute(pos, v);
      if (o.applyBoneTransform) o.applyBoneTransform(v, _v); else o.boneTransform(v, _v);
      _v.applyMatrix4(o.matrixWorld);
      const x = latOf(_v);
      if (wl >= 0.6) { if (x < lMin) lMin = x; } else if (x > rMax) rMax = x;
    }
  });
  const boneSep = (latOf(wp('handL')) - latOf(wp('handR'))) / 0.28;
  return {
    gap: Number.isFinite(lMin) && Number.isFinite(rMax) ? +((lMin - rMax) * 100).toFixed(1) : null,
    boneSep: +boneSep.toFixed(2),
  };
}

const { table } = buildClipSet('godot');
const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = process.argv.includes('--all')
  ? Object.keys(table)
  : (argv.length ? argv : ['idle_confident', 'idle_bored', 'idle_look', 'sneak_idle',
      'wall_run_l', 'rail_slide', 'victory', 'land_hard', 'land_roll', 'ledge_climb']);

/* ---- BIND first: the constant the posed rows must be read against ---- */
const bDL = gapOf('dlrig', null, 0), bM3 = gapOf('model3', null, 0);
console.log('                     dlrig     model3    difference   (cm; + = arms clear)');
console.log(`  BIND (no clip)  ${String(bDL.gap).padStart(7)}  ${String(bM3.gap).padStart(8)}  `
  + `${String(+(bDL.gap - bM3.gap).toFixed(1)).padStart(10)}     <- bulk + bind placement, NOT carry`);
console.log(`     bone sep     ${String(bDL.boneSep).padStart(7)}  ${String(bM3.boneSep).padStart(8)}  `
  + `${String(+(bDL.boneSep - bM3.boneSep).toFixed(2)).padStart(10)}     <- same skeleton? (0 = yes)`);
console.log('');

const rows = [];
for (const name of names) {
  const clip = table[name];
  if (!clip) { console.log(`  ${name.padEnd(16)} NOT IN TABLE`); continue; }
  /* worst (most negative) phase per model, each judged on its own clip timeline */
  let dlW = Infinity, m3W = Infinity, ph = null;
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const t = f * clip.dur;
    const d = gapOf('dlrig', clip, t).gap, m = gapOf('model3', clip, t).gap;
    if (d != null && d < dlW) { dlW = d; ph = f; }
    if (m != null && m < m3W) m3W = m;
  }
  const diff = +(dlW - m3W).toFixed(1);
  const excess = +(diff - (bDL.gap - bM3.gap)).toFixed(1);   // beyond the bind constant
  rows.push({ name, dlW, m3W, diff, excess, ph });
  console.log(`  ${name.padEnd(16)} ${String(dlW).padStart(7)}  ${String(m3W).padStart(8)}  `
    + `${String(diff).padStart(10)}   excess vs bind ${String(excess).padStart(7)}`
    + `${dlW < 0 ? '   *** dlrig OVERLAP ***' : ''}`);
}

console.log('\n"excess vs bind" is the only column that could be a CARRY defect: it is what the');
console.log('shipped rig loses at this pose OVER AND ABOVE what it already differs by at bind.');

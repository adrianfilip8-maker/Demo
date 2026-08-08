/**
 * Guards on the SHIPPED character — `SlyModelDLRig`, the default `?char=` token (§216).
 *
 * WHY THIS FILE EXISTS AT ALL. §216 recorded that this one module "cannot be covered here":
 * it resolves its textures through `import.meta.glob`, a Vite-only macro, and its FBX through
 * `new URL(..., import.meta.url)` + `fetch`, which undici refuses for the `file:` scheme. So the
 * one character path that ships was the one path every offline guard could not reach, which is
 * precisely why §213's `shading.make` typo and critic pass 7's #5 and #6 all lived in it.
 *
 * Three mechanical rewrites remove the three blockers, and NOTHING ELSE is touched. Each is
 * asserted to match, so a change to the module's shape fails loudly here instead of silently
 * testing a stale copy:
 *
 *   1. `import.meta.glob(...)`  ->  `{}`   (no textures offline; `textureUrl` already returns null)
 *   2. `import.meta.url`        ->  the real file URL, so the asset path still resolves
 *   3. relative specifiers      ->  absolute file: URLs, so the rewritten copy can live elsewhere
 *
 * This is deliberately NOT a hand-copy of `init()`. A previous replica of this module disagreed
 * with the pipeline and was flagged unreliable by its own author; the deeper problem with a
 * replica is that it stops describing the file the moment the file is edited. Loading the real
 * source means these guards measure the thing that ships.
 *
 * VALIDATED AGAINST THE PIPELINE. `progress/records/PROVENANCE-critic7.md` records the browser
 * console at capture time:
 *
 *     ! SlyModelDLRig: relaxed 6070 glove vertices, max move 12.0 (asset units)
 *
 * Loaded this way, on the tree that produced that capture, the same line comes back byte for byte.
 * The glove bake is exactly the bind-space arithmetic in question, so that is a real agreement and
 * not a coincidence of two counts. The first test below pins the vertex count half of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as THREE from 'three';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/player/SlyModelDLRig.js');
const SHIM = path.join(ROOT, 'node_modules/.dlrig-test');

/* ---- the two transport shims three's loaders need in plain Node --------------------------- */
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
  if (url.startsWith('file:')) {
    return new Response(readFileSync(new URL(url)), { status: 200 });
  }
  return realFetch(input, init);
};

let seq = 0;
async function loadModule(patch) {
  let src = readFileSync(SRC, 'utf8');

  const globRe = /import\.meta\.glob\([^;]*?\);/;
  assert.equal((src.match(new RegExp(globRe.source, 'g')) || []).length, 1,
    'expected exactly one import.meta.glob in SlyModelDLRig.js');
  src = src.replace(globRe, '{};');

  assert.ok(src.includes('import.meta.url'), 'expected import.meta.url in SlyModelDLRig.js');
  src = src.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(SRC).href));

  const relRe = /(\bfrom\s+')(\.\.?\/[^']+)(')/g;
  assert.ok(src.match(relRe), 'expected relative imports in SlyModelDLRig.js');
  src = src.replace(relRe, (_m, a, spec, c) =>
    a + pathToFileURL(path.resolve(path.dirname(SRC), spec)).href + c);

  if (patch) src = patch(src);
  mkdirSync(SHIM, { recursive: true });
  const out = path.join(SHIM, `m${process.pid}.${seq++}.mjs`);
  writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

/** An engine stub that records what the module asked the shading module for. */
function stubEngine() {
  const warns = [], made = [], outlined = [];
  const shading = {
    make(o) { made.push(o.name); return new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff }); },
    outline(mesh, o) { outlined.push([mesh?.name ?? '?', o?.thickness]); },
  };
  return { warns, made, outlined, warn: (s) => warns.push(s), get: (k) => (k === 'shading' ? shading : undefined), scene: null };
}

const built = new Map();
async function build(key = 'default', patch = null) {
  if (built.has(key)) return built.get(key);
  const mod = await loadModule(patch);
  const engine = stubEngine();
  const model = new mod.SlyModel(engine);
  await model.init();
  const r = { model, engine, mod };
  built.set(key, r);
  return r;
}

test.after(() => { try { rmSync(SHIM, { recursive: true, force: true }); } catch { /* best effort */ } });

/* ---------------------------------------------------------------- the shipped path loads at all */

test('the shipped character builds offline and reproduces the recorded boot line', async () => {
  const { model, engine } = await build();
  const relax = engine.warns.find((w) => w.includes('glove vertices'));
  assert.ok(relax, `no glove-bake warning; got ${JSON.stringify(engine.warns)}`);
  /* 6,070 is the count in the browser console at critic pass 7's capture
     (progress/records/PROVENANCE-critic7.md) and in §207. It is the agreement that licenses
     every other number in this file. */
  assert.match(relax, /relaxed 6070 glove vertices/);
  assert.ok(model.mesh?.isSkinnedMesh, 'no skinned mesh');
  assert.equal(model.mesh.skeleton.bones.length, 31);
});

test('§213: the character asks shading for the cel material and for an ink hull', async () => {
  const { engine } = await build();
  /* `shading.make` did not exist for the whole life of the project, so every one of these silently
     fell through to MeshStandardMaterial. The names are asserted, not just the count, because a
     partial fall-through is exactly the failure that hid for months. */
  for (const n of ['slydlrig:body', 'slydlrig:head', 'slydlrig:eyeball', 'slydlrig:tail', 'slydlrig:cane']) {
    assert.ok(engine.made.includes(n), `no cel material requested for ${n}: ${engine.made}`);
  }
  const names = engine.outlined.map(([n]) => n);
  assert.ok(names.includes('slydlrig:mesh'), `body has no ink hull: ${JSON.stringify(engine.outlined)}`);
  assert.ok(names.includes('cane'), `cane has no ink hull: ${JSON.stringify(engine.outlined)}`);
});

/* ---------------------------------------------------------------- #6: the crook is not a polyline */

test('critic 7 #6: the mitred `staff` submesh is gone and Cane.js is in its place', async () => {
  const { model, engine } = await build();
  const drop = engine.warns.find((w) => w.includes('staff submesh dropped'));
  assert.ok(drop, `staff not dropped: ${JSON.stringify(engine.warns)}`);
  /* 774 vertices = 258 triangles, all weighted to the `staff` bone. If the asset changes, this
     fails rather than quietly dropping a different number of triangles. */
  assert.match(drop, /dropped \(258 tris\)/);
  assert.equal(model.mesh.geometry.attributes.position.count, 39189);
  assert.ok(model.cane?.mesh, 'no cane built');
  assert.ok(model.bones.handR.getObjectByName('caneSocket'), 'cane not socketed to handR');
});

test('critic 7 #6: the crook is a sampled arc, not three straight segments', async () => {
  const { model } = await build();
  const cl = model.cane.centerline;
  const turns = [];
  for (let i = 1; i + 1 < cl.length; i++) {
    const a = cl[i].clone().sub(cl[i - 1]), b = cl[i + 1].clone().sub(cl[i]);
    if (a.length() < 1e-9 || b.length() < 1e-9) continue;
    turns.push(THREE.MathUtils.radToDeg(Math.acos(
      THREE.MathUtils.clamp(a.normalize().dot(b.normalize()), -1, 1))));
  }
  const hook = turns.slice(-29);
  const sorted = [...hook].sort((x, y) => x - y);
  const sweep = hook.reduce((x, y) => x + y, 0);
  /* The FBX crook this replaces measures 3 joints turning 113 / 99 / 32 degrees — a bent coat
     hanger. A crook swept as an arc spends its sweep evenly, so the discriminator is the turn PER
     JOINT at a comparable joint count, not the total. */
  assert.ok(hook.length >= 24, `only ${hook.length} hook joints — too coarse to read as an arc`);
  assert.ok(sorted[sorted.length >> 1] <= 10, `median hook turn ${sorted[sorted.length >> 1].toFixed(1)} deg`);
  assert.ok(sorted[sorted.length - 1] <= 30, `worst hook joint turns ${sorted[sorted.length - 1].toFixed(1)} deg`);
  assert.ok(sweep > 150 && sweep < 240, `hook sweep ${sweep.toFixed(0)} deg is not an open C`);
});

/* ---------------------------------------------------------------- #5: the cane is held */

/** Digit vertices, the cane's own shaft frame near the hand, and the wrap around it. */
function gripMetrics(model) {
  model.root.updateMatrixWorld(true);
  const p = model.mesh.geometry.attributes.position;
  const gi = model.gripInfo;
  const V = (i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
  const digits = Object.fromEntries(Object.entries(gi.digitVerts).map(([d, a]) => [d, [...a].map(V)]));
  const all = Object.values(digits).flat();
  const hand = new THREE.Vector3();
  for (const v of all) hand.add(v);
  hand.divideScalar(all.length);

  const cg = model.cane.mesh.geometry.attributes.position;
  const mw = model.cane.mesh.matrixWorld;
  const cane = [];
  for (let i = 0; i < cg.count; i++) cane.push(new THREE.Vector3(cg.getX(i), cg.getY(i), cg.getZ(i)).applyMatrix4(mw));

  /* the shaft frame comes from the CANE's own vertices, not from the solve, so this measures the
     thing that renders rather than the thing that was decided */
  const near = cane.filter((v) => v.distanceTo(hand) < 0.25);
  const c = new THREE.Vector3();
  for (const v of near) c.add(v);
  c.divideScalar(near.length);
  let ax = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 200; i++) {
    const a = new THREE.Vector3();
    for (const v of near) { const d = v.clone().sub(c); a.addScaledVector(d, d.dot(ax)); }
    ax.copy(a.normalize());
  }
  const radOf = (v) => { const d = v.clone().sub(c); return d.addScaledVector(ax, -d.dot(ax)).length(); };
  const R = near.map(radOf).sort((a, b) => a - b)[near.length >> 1];
  const axl = all.map((v) => v.clone().sub(c).dot(ax)).sort((a, b) => a - b);
  const band = Math.max(Math.abs(axl[Math.floor(axl.length * 0.05)]), Math.abs(axl[Math.floor(axl.length * 0.95)]));

  const e1 = new THREE.Vector3(1, 0, 0);
  if (Math.abs(e1.dot(ax)) > 0.9) e1.set(0, 1, 0);
  e1.addScaledVector(ax, -e1.dot(ax)).normalize();
  const e2 = new THREE.Vector3().crossVectors(ax, e1).normalize();
  const bins = new Array(12).fill(0);
  for (const v of all) {
    const q = v.clone().sub(c);
    const a = q.dot(ax);
    if (Math.abs(a) > band) continue;
    const r = q.addScaledVector(ax, -a).length();
    if (r > R + 0.025) continue;
    let th = Math.atan2(q.dot(e2), q.dot(e1));
    if (th < 0) th += Math.PI * 2;
    bins[Math.floor(th / (Math.PI * 2 / 12)) % 12]++;
  }
  const nn = all.map((v) => {
    let d = Infinity;
    for (const q of cane) { const s = v.distanceToSquared(q); if (s < d) d = s; }
    return Math.sqrt(d);
  }).sort((a, b) => a - b);
  return {
    wrap: bins.filter((b) => b > 0).length, bins, shaftR: R,
    medianNN: nn[nn.length >> 1], minNN: nn[0],
    within10: 100 * nn.filter((x) => x < 0.010).length / nn.length,
  };
}

test('critic 7 #5: the right hand closes around the cane', async () => {
  const { model } = await build();
  const m = gripMetrics(model);
  /* Before: WRAP 5/12, median digit-to-cane 132.3 mm, 0.9 % within 10 mm — a shaft running across
     the BACK of the knuckles. These are regression floors set below the measured result, not
     hypotheses; the calibration test below is what proves they can fail. */
  assert.ok(m.wrap >= 10, `WRAP ${m.wrap}/12 bins [${m.bins}]`);
  assert.ok(m.medianNN < 0.060, `median digit-to-cane ${(m.medianNN * 1000).toFixed(1)} mm`);
  assert.ok(m.minNN < 0.010, `nearest digit-to-cane ${(m.minNN * 1000).toFixed(1)} mm — nothing touches`);
  assert.ok(m.within10 > 3, `only ${m.within10.toFixed(1)} % of digit vertices within 10 mm`);
});

test('CALIBRATION: `?grip=open` defeats the solved curl and the grip guard fails', async () => {
  /* An assertion nobody has watched fail is an assertion of unknown strength (§211.1). This
     injects the defect the test above exists to catch — the open hand, cane still socketed — and
     requires the wrap to collapse. If this stops firing, the guard above is decorative.
     It goes through the RUNTIME lever rather than a source patch on purpose: `?grip=open` is what
     a capture's calibration arm will use, and a lever that has rotted is worse than no lever
     (§210.2). Guarding it here means the capture arm cannot be silently dead. */
  const prev = globalThis.__GRIP_AB;
  globalThis.__GRIP_AB = 'open';
  let model;
  try { ({ model } = await build('open-hand')); } finally { globalThis.__GRIP_AB = prev; }
  assert.deepEqual(['index', 'mid', 'ring', 'pinky'].map((d) => model.gripInfo.scale[d]), [0, 0, 0, 0],
    '?grip=open did not reach the solve — the capture calibration arm is dead');
  assert.ok(model.cane, '?grip=open must leave the cane socketed: only the curl is the variable');
  const m = gripMetrics(model);
  assert.ok(m.wrap < 10, `open hand still reports WRAP ${m.wrap}/12 — the guard cannot fail`);
  assert.ok(m.medianNN > 0.060, `open hand still reports ${(m.medianNN * 1000).toFixed(1)} mm`);
});

test('the grip solve is derived from the glove, and self-consistent in project metres', async () => {
  const { model } = await build();
  const gi = model.gripInfo;
  assert.equal(gi.side, 'RT', 'the cane hand should be derived from the staff, and it is the right');
  /* The solve lives in FBX bind units and the cane is built in project metres; the conversion runs
     through the same per-bone matrix the mesh took. If it drifts, the cane is the wrong size in
     the hand and nothing else complains — so it is checked against the rendered radius. */
  const m = gripMetrics(model);
  assert.ok(Math.abs(m.shaftR - model.cane.tune.gripR) < 0.004,
    `cane grip radius ${(model.cane.tune.gripR * 1000).toFixed(1)} mm but measures ${(m.shaftR * 1000).toFixed(1)} mm`);
  /* the fist closes ON the cane: fitted internal radius == the grip radius it was solved for */
  assert.ok(Math.abs(gi.fistRadius - gi.gripR) < 0.02 * gi.gripR,
    `fist ${gi.fistRadius.toFixed(3)} vs grip ${gi.gripR.toFixed(3)}`);
  /* and it does not sink into the palm — an independent surface the solve never looked at */
  assert.ok(gi.palmClear > 0, `the cane sinks ${(-gi.palmClear).toFixed(2)} units into the palm`);
  /* the four fingers must not move as one block — that is the other half of #5 */
  const ks = ['index', 'mid', 'ring', 'pinky'].map((d) => gi.scale[d]);
  assert.ok(Math.max(...ks) - Math.min(...ks) > 0.2, `all four fingers curl alike: ${ks}`);
});

/* ---------------------------------------------------------------- things the fix must not break */

test('dropping the staff does not rescale the character', async () => {
  const { model } = await build();
  const g = model.mesh.geometry;
  g.computeBoundingBox();
  const h = g.boundingBox.max.y - g.boundingBox.min.y;
  /* The normalise step divides by the merged bounding box, so removing 774 vertices could silently
     change the character's scale. Measured on the asset before any of this, the staff's y extent
     (128.7..134.2) sits inside the body's (0..185.3), so it sets neither extreme and S is
     unchanged — 1.892 m is the value BOTH the pre-change and post-change builds produce. The
     scale is normalised to the 1.80 m spec before the bind transfer, which then adds the rest. */
  assert.ok(Math.abs(h - 1.892) < 0.005, `mesh height ${h.toFixed(3)} m`);
  assert.equal(model.root.userData.height, 1.8);
});

test('the bake is deterministic', async () => {
  const a = (await build()).model.gripInfo;
  const b = (await build('twice')).model.gripInfo;
  for (const k of ['gripR', 'shaftR', 'kShared', 'thumbAimDeg', 'fitRms', 'palmClear']) {
    assert.equal(a[k], b[k], `${k} differs between builds`);
  }
  assert.deepEqual(a.scale, b.scale);
});

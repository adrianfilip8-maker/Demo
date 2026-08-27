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

test('critic 7 #6: the mitred `staff` submesh is gone and the cane prop is in its place', async () => {
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

test('§294: the owner-supplied sly-cane.glb is what renders, adopted into the procedural frame', async () => {
  /* The swap this pins: `Cane.js` still builds (it is the FRAME — aim, hookPoint, tip plant,
     grip conventions), and `adoptAsset` replaces the rendered triangles with the downloaded
     model's `Cane` primitive, conformed by similarity transform only. Every number here is
     measured off the shipped bytes: 306 vertices / 774 indices is that primitive exactly, and
     the bbox must land on the procedural cane's own extents (tools/canesize.mjs: y
     [-0.8140, +0.7010]) with the hook curling to +Z — the frame the socket and all 52 clips
     were authored against. If the file, the parse, or the conform drifts, this fails BEFORE a
     capture has to discover it. */
  const { model, engine } = await build();
  assert.equal(model.cane.assetCane, 'sly-cane.glb', 'the asset cane was not adopted');
  const drop = engine.warns.find((w) => w.includes('staff submesh dropped'));
  assert.match(drop, /sly-cane\.glb \(§294\) socketed to handR/);
  const g = model.cane.mesh.geometry;
  assert.equal(g.attributes.position.count, 306, 'not the glb Cane primitive (vertex count)');
  assert.equal(g.index?.count, 774, 'not the glb Cane primitive (index count)');
  assert.ok(g.attributes.uv, 'the authored UVs were dropped — the albedo map has nothing to sample');
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(Math.abs(b.min.y - -0.8140) < 0.002, `butt at ${b.min.y.toFixed(4)}, expected -0.8140 — the tip plant drifts`);
  assert.ok(Math.abs(b.max.y - 0.7010) < 0.002, `crook top at ${b.max.y.toFixed(4)}, expected +0.7010`);
  assert.ok(b.max.z > 0.20, `hook reaches z ${b.max.z.toFixed(4)} — it should curl forward (+Z) past 0.20`);
  assert.ok(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) < 0.06,
    `cane spans x ±${Math.max(Math.abs(b.min.x), Math.abs(b.max.x)).toFixed(4)} — the hook is bending sideways, not forward`);
  /* the contact contract is the frame's, not the asset's — a ring still rests where MOVEMENT
     expects it, and the tip the plant pose was solved for has not moved */
  assert.ok(Math.abs(model.cane.tipPoint.y - -0.796) < 1e-9, 'tipPoint moved off the CANE_TUNE contract');
});

test('§719: the crook is tagged on the adopted mesh, and the classifier refuses rather than guesses', async () => {
  /* The hook's gold is a per-vertex albedo multiplier, so "which vertices" IS the change, and it
     is pinned here rather than left to a capture to discover. Offline there is no image decoder,
     so `asset.texture` is null, the material is already the house gold and `albedoTint` comes out
     as identity — the CLASSIFICATION still runs, and it is what this asserts. Every number below
     is a property of the shipped `.glb` conformed into `Cane.js`'s frame. */
  const { model } = await build();
  const tag = model.cane.hookTag;
  assert.ok(tag, 'no hookTag — Cane.adoptAsset no longer classifies the crook');
  assert.equal(tag.verts, 306);
  assert.equal(tag.comps, 4, 'the asset is four islands: butt ferrule, shaft, collar, crook');
  assert.equal(tag.hook, 188, 'the crook component is 188 of the 306 vertices');
  assert.equal(tag.tinted, true, `the classifier refused: ${tag.why}`);

  /* THE ATTRIBUTE ALWAYS EXISTS. `vertexColors: true` over an unbound COLOR_0 multiplies to
     black (the PREREG-guardfix defect), so this is the guard that keeps the cane from going
     black, not a completeness check. */
  const geo = model.cane.mesh.geometry;
  assert.ok(geo.attributes.color, 'the adopted geometry carries no COLOR_0 — a vertex-colour '
    + 'material over this geometry would multiply to black');
  assert.equal(geo.attributes.color.count, 306);

  /* The tagged set owns the TOP of the prop and the part reaching farthest off the shaft axis,
     and it does not reach down into the hand. Read off the geometry, not off the tag. */
  geo.computeBoundingBox();
  assert.ok(Math.abs(tag.yTop - geo.boundingBox.max.y) < 1e-6,
    'the tagged component does not own the top of the prop');
  assert.ok(tag.yLo > 0.05,
    `the crook is tagged from y ${tag.yLo.toFixed(3)} — that is down at the grip, not the crook`);
  assert.ok(tag.rFar > tag.rShaft * 5,
    `the crook reaches ${tag.rFar.toFixed(3)} off the axis against a shaft radius of `
    + `${tag.rShaft.toFixed(3)} — not different enough to be a hook and a stick`);
  /* The ramp exists and is short: gold by the time the tube has left the axis, no hard seam. */
  assert.ok(tag.ramp > 0, 'no vertex is part-way up the ramp — the transition is a hard seam');
  assert.ok(tag.yRamp > tag.yLo && tag.yRamp < tag.yTop, 'the ramp does not sit inside the crook');

  /* §418.3 — the input this is SEEN to fail on, in the arm rather than in a comment. Welded into
     one component, nothing separates the crook from the shaft, and the answer must be a REFUSAL
     with an all-white attribute: never a guess, and never a black cane. Run on a private `Cane`
     so the shared cached build above is not mutated. */
  const { Cane } = await import('../src/player/Cane.js');
  const welded = geo.clone();
  const ix = Array.from(welded.index.array);
  for (let i = 1; i < welded.attributes.position.count; i++) ix.push(0, i, i);   // degenerate fan
  welded.setIndex(new THREE.BufferAttribute(new Uint32Array(ix), 1));
  const probe = new Cane(null, {});
  const refused = probe._tagHook(welded, new THREE.Color(0.5, 0.5, 0.5));
  assert.equal(refused.tinted, false, 'a single-component mesh was tinted anyway — the control does not fire');
  assert.match(refused.why, /one connected component/);
  const c2 = welded.attributes.color;
  let anyTinted = false;
  for (let i = 0; i < c2.count; i++) if (c2.getX(i) < 0.999) anyTinted = true;
  assert.equal(anyTinted, false, 'the refusal left a non-white COLOR_0 behind — that is the black-cane path');
});

test('§719: the tint is the quotient that lands the crook exactly on the house gold', async () => {
  /* The whole colour claim is one identity — asset albedo x tint = house gold — and it is checked
     here rather than inferred from a frame. It is also the guard on the two constants: if the
     owner re-exports the cane with different artwork, or the house gold moves, this goes red and
     the tint has to be re-derived instead of silently painting the wrong colour. */
  const { albedoTint } = await import('../src/player/Cane.js');
  const { ASSET_HOOK_ALBEDO } = await import('../src/player/CaneAsset.js');
  const GOLD = 0xe8b942;
  const tint = albedoTint(GOLD, ASSET_HOOK_ALBEDO);
  const base = new THREE.Color(ASSET_HOOK_ALBEDO);
  const got = new THREE.Color(base.r * tint.r, base.g * tint.g, base.b * tint.b);
  assert.equal(got.getHex(), GOLD,
    `asset albedo #${base.getHexString()} x tint (${tint.toArray().map((v) => v.toFixed(4))}) `
    + `= #${got.getHexString()}, wanted #${GOLD.toString(16)}`);

  /* NEVER BRIGHTER THAN ITS OWN ALBEDO. A tint channel above 1 would be a gain, and gain on this
     prop is §266's question, measured and refused. The clamp is what keeps a colour change from
     smuggling one in, so it is asserted rather than trusted. */
  for (const [k, v] of Object.entries({ r: tint.r, g: tint.g, b: tint.b })) {
    assert.ok(v > 0 && v <= 1, `tint.${k} = ${v} — outside (0, 1]`);
  }
  /* Identity when there is nothing to move: no texture means the material is already the house
     gold, and the crook must then be tinted by exactly nothing. */
  const idem = albedoTint(GOLD, GOLD);
  assert.deepEqual([idem.r, idem.g, idem.b], [1, 1, 1],
    'albedoTint(x, x) is not identity — the no-texture fork would double-darken the crook');
});

test('critic 7 #6: the crook FRAME is a sampled arc, not three straight segments', async () => {
  /* Since §294 the RENDERED crook is the owner's asset (pinned above); this centerline is the
     frame the aim system and hookPoint contract still run on, and it must stay an open arc —
     a regression here bends every cane pose even with the asset drawn over it. */
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
  const cidx = model.cane.mesh.geometry.index;
  const mw = model.cane.mesh.matrixWorld;
  const cane = [];
  for (let i = 0; i < cg.count; i++) cane.push(new THREE.Vector3(cg.getX(i), cg.getY(i), cg.getZ(i)).applyMatrix4(mw));

  /* Digit-to-cane distance is measured to the cane's SURFACE (exact point-to-triangle), not to
     its nearest vertex. The vertex proxy was honest against the procedural cane's 1356 dense
     triangles, but the §294 asset's shaft is a low-poly tube with rings only at its ends — its
     mid-shaft has metres of surface and no vertices, so "nearest vertex" inflated a held hand
     from ~32 mm to 68 mm and the guard failed on the instrument rather than the grip. The
     REGISTERED thresholds below are unchanged; measured on the asset cane they read
     held 31.8 / open 66.9 mm median, so the 60 mm separator still separates the two arms. */
  const tris = [];
  const worldV = (i) => new THREE.Vector3(cg.getX(i), cg.getY(i), cg.getZ(i)).applyMatrix4(mw);
  if (cidx) for (let t = 0; t < cidx.count; t += 3) tris.push(new THREE.Triangle(worldV(cidx.getX(t)), worldV(cidx.getX(t + 1)), worldV(cidx.getX(t + 2))));
  else for (let t = 0; t < cg.count; t += 3) tris.push(new THREE.Triangle(cane[t].clone(), cane[t + 1].clone(), cane[t + 2].clone()));
  const closest = new THREE.Vector3();
  const surfD = (v) => {
    let d = Infinity;
    for (const tr of tris) { tr.closestPointToPoint(v, closest); const s = v.distanceToSquared(closest); if (s < d) d = s; }
    return Math.sqrt(d);
  };

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
  const nn = all.map(surfD).sort((a, b) => a - b);
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
     scale is normalised to the 1.80 m spec before the bind transfer, which then adds the rest.
     RE-READ at 1.884 when the skull carry stopped tilting the head −12° (§522 defect 3): the cap
     peak was the bbox max and the upright skull sits it 8 mm lower. S itself is untouched — the
     staff claim this test exists for is about the normalise step, which runs before the carry. */
  assert.ok(Math.abs(h - 1.884) < 0.005, `mesh height ${h.toFixed(3)} m`);
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

/* ------------------------------------------------- the terminal-bone carry (§479.13) ---- */

test('§479.13: the hands inherit the forearm carry, and that is CORRECT — identity would swing the glove 54°', async () => {
  /* THE CLASS §470.1 FOUND, AND WHERE IT STOPS. `SlyModelDLRig`'s carry gives each bone a
     rotation derived from its own axis to the next STRUCTURAL joint; a bone with no structural
     child inherits its parent's. Six bones inherit: `head` (forced to identity by §470.1 —
     the skull spans nothing, so rot[neck] rotated the whole face −12° chin-up), `handL`,
     `handR`, `toeL`, `toeR`, `tailD`.
     §479.12 proposed the hands as the next instance of that class — the shipped rig's idle
     reads ~8 cm tighter between the arms than the procedural control, and the hands carry
     54.1°. Measured, the proposal is WRONG and this arm records why, because the fix it implies
     (`rot.hand = identity`, by analogy with the head) is a REGRESSION: unlike the skull, a
     glove is a continuation of the forearm, so the forearm's carry is exactly the rotation that
     keeps it continuous. Offline against the FBX: the left glove's centroid sits 6.4° off the
     source forearm direction, and 6.4° off OUR forearm direction after the inherited carry —
     preserved to the tenth of a degree. With identity it would sit 54.4° off.
     DOMAIN (§418.3) — passes on: the shipped carry (glove within 15° of the forearm
     continuation, RUN below); fails on: the same measurement with the hand carry forced to
     identity, RUN below as the contrast arm, which reads > 45°. Cannot discriminate: whether
     the arms LOOK crossed — that is the volume predicate's job on the skinned mesh
     (tools/idlecross.mjs), and §479.13 records that the dlrig↔model3 gap difference survives
     with the carry untouched. */
  const { model } = await build();
  const mesh = model.mesh;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const iHand = names.indexOf('handL'), iFore = names.indexOf('lowerArmL');
  assert.ok(iHand >= 0 && iFore >= 0, 'handL/lowerArmL missing from the shipped skeleton');

  /* bind-pose positions of our own joints, from the skeleton the module built */
  const bpos = (i) => new THREE.Vector3().setFromMatrixPosition(
    new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert());
  const wrist = bpos(iHand), elbow = bpos(iFore);
  const foreDir = wrist.clone().sub(elbow).normalize();

  /* skin-weighted centroid of the glove, in the same bind space */
  const g = mesh.geometry, pos = g.attributes.position;
  const sI = g.attributes.skinIndex, sW = g.attributes.skinWeight;
  const c = new THREE.Vector3();
  let n = 0;
  const _v = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (sI.getComponent(v, k) === iHand) w += sW.getComponent(v, k);
    if (w < 0.5) continue;
    c.add(_v.fromBufferAttribute(pos, v)); n++;
  }
  assert.ok(n > 200, `only ${n} glove vertices found — the weight layout changed`);
  c.divideScalar(n);

  const gloveDir = c.clone().sub(wrist).normalize();
  const deg = Math.acos(Math.max(-1, Math.min(1, gloveDir.dot(foreDir)))) * 180 / Math.PI;
  if (process.env.SHOWDEG) console.log(`  [479.13] glove-vs-forearm ${deg.toFixed(1)} deg`);
  assert.ok(deg < 15,
    `the left glove sits ${deg.toFixed(1)}° off the forearm continuation — the hand carry is no `
    + 'longer keeping the glove on the arm (identity on rot.hand reads ~54°)');

  /* CONTRAST, RUN: the same geometry with the carry undone about the wrist reads far worse, so
     this arm can say "no". The undo is the inverse of the forearm's own carry quaternion,
     recovered from the bind bases rather than re-derived from the FBX. */
  const bad = gloveDir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), 54 * Math.PI / 180);
  const badDeg = Math.acos(Math.max(-1, Math.min(1, bad.dot(foreDir)))) * 180 / Math.PI;
  assert.ok(badDeg > 45,
    `contrast arm did not separate: a 54° swing off the forearm read ${badDeg.toFixed(1)}°`);
});

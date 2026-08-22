import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import { realWorld } from './_moveset.mjs';

/**
 * framebudget — the per-frame costs that are hardware-INDEPENDENT (§544).
 *
 * ── Why there is no fps here, and why there must not be ─────────────────────────────────────
 *
 * This container renders through SwiftShader on a box that has had four lanes on it all session.
 * Any frames-per-second number taken here measures the container. `tests/enginefps.test.mjs`
 * already handles that correctly and is worth reading before adding anything timed: it drives
 * `FpsMeter` from a **synthetic monotonic clock** and touches no renderer, no rAF and no browser
 * (verified: zero matches for playwright/chromium/renderer/requestAnimationFrame in that file).
 * It records that a driven session here presented 38 frames in 53.9 s — 0.70 fps — while the old
 * readout said 21.
 *
 * So every assertion below is a COUNT or a RATIO, never a duration. Counts of draws, of
 * resources, of collections. Those predict cost on the user's machine; a millisecond here does
 * not.
 *
 * ── Direction ───────────────────────────────────────────────────────────────────────────────
 *
 * Every bound is stated as "no worse than", because the levers live in other lanes' files
 * (`src/world/*` especially). Widening coverage or reducing cost must never redden this; only a
 * regression should.
 */

const DT = 1 / 60;
/** PerformanceObserver delivers asynchronously, so a synchronous frame loop can never see a GC
 *  reported inside it. Every window is flushed before its count is read — the first version of
 *  this instrument read 0 collections across 1600 frames because it was not. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Every drawable, split by whether it would actually be submitted (self AND ancestors visible). */
function drawables(scene) {
  const vis = [], hid = [];
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    let v = o.visible, p = o.parent;
    while (v && p) { if (!p.visible) v = false; p = p.parent; }
    (v ? vis : hid).push(o);
  });
  return { vis, hid };
}
const tris = (o) => {
  const g = o.geometry;
  if (!g?.attributes?.position) return 0;
  return ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
};
/** Distinct geometry / material / texture uuids reachable from the graph. */
function resources(scene) {
  const geo = new Set(), mat = new Set(), tex = new Set();
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    if (o.geometry) geo.add(o.geometry.uuid);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      mat.add(m.uuid);
      for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) tex.add(v.uuid); }
    }
  });
  return { geo, mat, tex };
}

/* ====================================================================== */
/* F1 — nothing is created during play                                     */
/* ====================================================================== */

test('F1 mid-play: no material, geometry or texture is created while the game runs', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : 900 driven frames (15 s) of the real Controller over the real world, after
   *               which the reachable geometry / material / texture sets are unchanged and the
   *               node count has not grown.
   *   fails  on : RUN in-arm — one material and one texture added to a live mesh mid-loop, which
   *               the same comparison must catch. Without that clause the arm would pass just as
   *               happily if the census were reading nothing at all.
   *   verdict   : passes on a steady scene, fails on one that grows. It is a proxy for two costs
   *               that only appear on real hardware — a material first drawn is a SHADER COMPILE
   *               and a texture first drawn is a GPU UPLOAD, both mid-play stutters the player
   *               reads as a freeze — and the proxy is the honest half: the count is measurable
   *               here, the milliseconds are not.
   *   does NOT  : discriminate resources created outside the scene graph (a material swapped on
   *   discrim.    an existing mesh with the old one dropped nets to zero here), nor the 17 shipped
   *               modules this harness does not build (see F2's note).
   */
  const { engine, c } = await realWorld();
  for (let i = 0; i < 60; i++) { engine.input.beginFrame?.(DT); c.update(DT, i * DT); }
  const before = resources(engine.scene);
  let nodes0 = 0; engine.scene.traverse(() => nodes0++);

  for (let i = 0; i < 900; i++) { engine.input.beginFrame?.(DT); c.update(DT, i * DT); }

  const after = resources(engine.scene);
  let nodes1 = 0; engine.scene.traverse(() => nodes1++);
  const newMat = [...after.mat].filter((k) => !before.mat.has(k));
  const newTex = [...after.tex].filter((k) => !before.tex.has(k));
  const newGeo = [...after.geo].filter((k) => !before.geo.has(k));

  assert.equal(newMat.length, 0,
    `${newMat.length} material(s) appeared during 900 frames of play. Each one compiles a shader `
    + 'the first time it is drawn, and a mid-play compile is a stall the player reads as a freeze.');
  assert.equal(newTex.length, 0,
    `${newTex.length} texture(s) appeared during play — each is a GPU upload at first draw`);
  assert.equal(newGeo.length, 0, `${newGeo.length} geometry/geometries appeared during play`);
  assert.equal(nodes1, nodes0, `the scene graph grew from ${nodes0} to ${nodes1} nodes during play`);

  /* RUN the counterexample: make the scene grow and prove the census sees it. */
  {
    const THREE = await import('three');
    const probe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) }));
    engine.scene.add(probe);
    const grown = resources(engine.scene);
    assert.ok([...grown.mat].filter((k) => !before.mat.has(k)).length === 1
      && [...grown.tex].filter((k) => !before.tex.has(k)).length === 1
      && [...grown.geo].filter((k) => !before.geo.has(k)).length === 1,
      'the census did not notice a mesh with a brand-new geometry, material and texture added to '
      + 'the scene — it cannot detect the regression it exists for (§418)');
    engine.scene.remove(probe);
    probe.geometry.dispose(); probe.material.map.dispose(); probe.material.dispose();
  }
  console.log(`\n[F1] 900 frames: ${before.geo.size} geometries, ${before.mat.size} materials, `
    + `${before.tex.size} textures, ${nodes0} nodes — all unchanged`);
});

/* ====================================================================== */
/* F2 — the visible set, and the 274 drawables that are never submitted    */
/* ====================================================================== */

test('F2 visibility: the collision proxies stay hidden, so they cost draws nothing', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the built world reporting far more drawables in the graph than would ever be
   *               submitted, with the hidden remainder being the collision proxy subtree, and the
   *               VISIBLE count reconciling with what `tools/scenebudget.mjs` reports for its
   *               worst shot (73 draws / 0.578 M tris, reproduced this round).
   *   fails  on : RUN in-arm — the proxy group made visible, which must move 262 drawables into
   *               the submitted set. That is the regression this guards: a `visible = true` left
   *               on a debug group quadruples the draw call count and nothing else would notice.
   *   verdict   : passes on the shipped visibility, fails on the proxies being shown. It
   *               discriminates SUBMISSION, which is what a draw call is, rather than graph size.
   *   does NOT  : discriminate frustum culling, shadow passes, or the 17 shipped modules this
   *   discrim.    harness does not build — `main.js`'s MANIFEST carries 21 and `realWorld()`
   *               builds 4 of them plus the Controller, so every count here is a FLOOR on the
   *               shipped scene, never a total.
   */
  const { engine } = await realWorld();
  const { vis, hid } = drawables(engine.scene);
  const visTris = vis.reduce((s, o) => s + tris(o), 0);

  assert.ok(hid.length > 100,
    `only ${hid.length} drawables are hidden — the collision proxy subtree is expected to be much `
    + 'larger than that, so either it has gone or this arm is looking at the wrong scene');
  assert.ok(vis.length < hid.length,
    `${vis.length} visible vs ${hid.length} hidden — the proxies are no longer the bulk of the graph`);
  assert.ok(visTris < 700e3,
    `${(visTris / 1e3).toFixed(0)} k visible triangles; scenebudget's worst shot reproduces at `
    + '578 k and the offline scene ceiling at 650 k, so this is content growth worth a look');

  /* RUN the counterexample: show the proxies and watch the submitted set explode. */
  const proxies = engine.scene.children.find((ch) => ch.name === 'architecture:colliders');
  assert.ok(proxies, 'the collision proxy group is not where this arm expects it');
  /* The meshes are hidden individually, not only via their group — flipping the group alone adds
     nothing, which the first version of this counterexample discovered by reproducing nothing. */
  const flipped = [];
  proxies.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && !o.visible) { o.visible = true; flipped.push(o); } });
  const shown = drawables(engine.scene).vis.length;
  for (const o of flipped) o.visible = false;
  assert.ok(shown - vis.length > 200,
    `making the proxy group visible added only ${shown - vis.length} drawables — this arm cannot `
    + 'tell a hidden subtree from a shown one (§418)');

  console.log(`\n[F2] graph ${vis.length + hid.length} drawables · SUBMITTED ${vis.length} `
    + `(${(visTris / 1e3).toFixed(0)} k tris) · hidden ${hid.length} (collision proxies)`
    + `\n     showing the proxy group would submit ${shown} instead — a ${(shown / vis.length).toFixed(1)}x draw increase`);
});

/* ====================================================================== */
/* F3 — GC pressure                                                        */
/* ====================================================================== */

test('F3 GC: the update loop causes no major collection, and does not leak', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : 3000 driven frames producing zero MAJOR collections, observed through a
   *               PerformanceObserver that is flushed after the synchronous window (without the
   *               flush it reports zero unconditionally, which is how the first version of this
   *               instrument produced a meaningless pass).
   *   fails  on : RUN in-arm — a deliberate churn loop of the same length, which must produce
   *               collections through the same observer. That is the positive control: it proves
   *               the channel can see a collection at all before a zero is believed.
   *   verdict   : passes on the shipped loop, fails on a loop that allocates hard. It
   *               discriminates GC PRESSURE, which is the frame-time hazard §543's tap bound is
   *               waiting for.
   *   does NOT  : discriminate bytes per frame. Three instruments disagreed by up to 470x on that
   *   discrim.    number — heapUsed cannot see churn (typed-array backing stores are external and
   *               escape analysis removes small-object controls), and the sampling heap profiler's
   *               absolute total could not be reconciled. Only the COLLISION COUNT survived its
   *               controls, so only the collision count is asserted.
   */
  let gc = 0, major = 0;
  const obs = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) { gc++; const k = e.detail?.kind; if (k !== 1 && k !== 8) major++; }
  });
  obs.observe({ entryTypes: ['gc'] });

  const { engine, c } = await realWorld();
  for (let i = 0; i < 200; i++) { engine.input.beginFrame?.(DT); c.update(DT, i * DT); }
  await flush();

  const g0 = gc, m0 = major;
  const N = 3000;
  for (let i = 0; i < N; i++) { engine.input.beginFrame?.(DT); c.update(DT, i * DT); }
  await flush();
  const scav = gc - g0 - (major - m0), maj = major - m0;

  assert.equal(maj, 0,
    `${maj} major collection(s) in ${N} frames. A major GC is a multi-millisecond stop-the-world `
    + 'pause — the frame-time collapse that opens the §543 sub-frame-tap window.');
  assert.ok(scav <= 20,
    `${scav} scavenges in ${N} frames (${(scav / N * 1000).toFixed(1)} per 1000). The measured `
    + 'baseline is ~1.3-1.5 per 1000; a large rise means the loop started allocating.');

  /* POSITIVE CONTROL, RUN: prove the channel can see a collection. */
  {
    await flush();
    const before = gc;
    const keep = [];
    for (let i = 0; i < N; i++) {
      const arr = [];
      for (let k = 0; k < 200; k++) arr.push({ x: k, y: i, z: k + i });
      keep.push(arr.length);
      if (keep.length > 1000) keep.length = 0;
    }
    await flush();
    assert.ok(gc - before > 0,
      'a loop allocating ~6 KiB/frame for 3000 frames produced no observed collection — the gc '
      + 'channel is blind here and the zero above means nothing (§418)');
    console.log(`\n[F3] ${N} frames: ${scav} scavenges, ${maj} major`
      + ` · positive control produced ${gc - before} collections`);
  }
  obs.disconnect();
});

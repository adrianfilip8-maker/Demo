import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Lighting } from '../src/render/Lighting.js';

/**
 * shadowcache — the static-caster shadow cache's invalidation, which nothing tested (§545).
 *
 * ── Why this file exists ────────────────────────────────────────────────────────────────────
 *
 * `Lighting` caches the STATIC casters' depth image per cascade and re-renders it only when
 * something that could change that image changes; every frame it blits the cached depth and
 * draws the ~13 dynamic casters on top. It is the largest single saving in the frame, and its
 * failure mode is silent: a fingerprint that misses a change serves the OLD shape's shadow
 * indefinitely — "§15's exact failure shape", as `Lighting.js` puts it. A fingerprint that is
 * too eager is merely slow, and the file records that one too (an unconditional reset made every
 * 8th frame dirty: 26 refreshes per 100 frames, paying the full bill for nothing).
 *
 * A grep of `tests/` for `shadowStaticCache`, `_cacheStats` and `cascade` matched **no file**.
 * Both of those repairs, and the geometry-fingerprint work that closed the PREREG gap, were
 * unpinned.
 *
 * ── How this runs without a GPU ─────────────────────────────────────────────────────────────
 *
 * `Lighting.init()` completes headlessly (three's lights and shadow cameras need no context),
 * so the real `_updateShadowCache` runs here. Only the three methods that touch the renderer are
 * stubbed — `_renderCacheStatics`, `_blitCacheDepth`, `_renderCacheDynamics` — plus the
 * engagement gate's `renderer.properties` lookup. **The decision logic under test is the shipped
 * one, not a copy**: every assertion below reads `_cacheStats.refreshes`, which the shipped code
 * increments exactly when it decides the cached depth is stale.
 *
 * ── What this cannot discriminate ───────────────────────────────────────────────────────────
 *
 * Pixels. Whether a refresh produces the RIGHT depth image, whether the blit lands, whether the
 * dynamic overdraw registers — all of that needs a real context and belongs to a capture. This
 * file answers only "does the cache notice", which is the half that fails silently.
 */

/* ====================================================================== */
/* harness                                                                 */
/* ====================================================================== */

function rig() {
  const scene = new THREE.Scene();
  const engine = {
    scene,
    camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500),
    quality: 'high',
    settings: { shadowMap: 3072, shadowCascades: 3 },
    debug: {}, warnings: [],
    warn(m) { this.warnings.push(m); },
    has: () => false, get: () => null, on: () => () => {}, emit: () => {},
    /* The engagement gate asks the renderer whether each cascade's map has a live FBO. */
    renderer: { properties: { get: () => ({ __webglFramebuffer: {} }) } },
  };
  return { scene, engine };
}

async function lighting() {
  const { scene, engine } = rig();
  const L = new Lighting(engine);
  await L.init();
  /* Give every cached cascade a map so the gate passes, then neutralise the three methods that
     would touch a GL context. Nothing else is replaced. */
  for (const c of L.cascades) c.light.shadow.map = { texture: {} };
  L._renderCacheStatics = () => {};
  L._blitCacheDepth = () => true;
  L._renderCacheDynamics = () => {};
  return { L, scene, engine };
}

const mesh = (name, { cast = true, visible = true } = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  m.name = name; m.castShadow = cast; m.visible = visible;
  return m;
};

/** One frame of the cache. Returns how many cascade refreshes it decided to do. */
function frame(L) {
  const before = L._cacheStats.refreshes;
  L._updateShadowCache();
  return L._cacheStats.refreshes - before;
}
/** Settle: the first engaged frame always refreshes (`_staticSig` starts NaN), and the census
 *  runs on a `%8` beat, so run past both before measuring. */
function settle(L, n = 12) { for (let i = 0; i < n; i++) frame(L); }

/* ====================================================================== */
/* S1 — who is static and who is dynamic                                   */
/* ====================================================================== */

test('S1 census: sly_root, guard_root and skinned meshes are dynamic; the world is static', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a scene holding a `sly_root` child, a `guard_root` child, a SkinnedMesh
   *               parented nowhere special, and two ordinary world meshes — the first three
   *               classified dynamic, the last two static.
   *   fails  on : RUN in-arm — the same body re-parented out of `sly_root`, which must become
   *               static. Without that the arm would pass on any implementation that called
   *               everything dynamic.
   *   verdict   : passes on the shipped rule, fails on a re-parent. It discriminates the
   *               CLASSIFICATION, which is what decides who is in the cached image at all.
   */
  const { L, scene } = await lighting();
  const sly = new THREE.Group(); sly.name = 'sly_root';
  const body = mesh('sly_body'); sly.add(body);
  const guard = new THREE.Group(); guard.name = 'guard_root';
  guard.add(mesh('guard_body'));
  const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  skin.name = 'loose_skinned'; skin.castShadow = true;
  const w1 = mesh('wall_a'), w2 = mesh('wall_b');
  scene.add(sly, guard, skin, w1, w2);

  L._censusCasters();
  const staticNames = L._staticCasters.map((m) => m.name);
  assert.equal(L._dynCount, 3,
    `${L._dynCount} dynamic casters, expected 3 (sly body, guard body, loose skinned) — got statics `
    + JSON.stringify(staticNames));
  for (const n of ['sly_body', 'guard_body', 'loose_skinned']) {
    assert.ok(!staticNames.includes(n), `${n} was classified STATIC — it moves, so its shadow would freeze`);
  }
  for (const n of ['wall_a', 'wall_b']) {
    assert.ok(staticNames.includes(n), `${n} was classified dynamic — it would be redrawn every frame for nothing`);
  }

  /* RUN the counterexample: take the body out of sly_root and it must become static. */
  scene.add(body);                       // re-parents out of sly_root
  L._censusCasters();
  assert.ok(L._staticCasters.map((m) => m.name).includes('sly_body'),
    're-parenting a mesh out of `sly_root` did not make it static — the rule is not reading the '
    + 'ancestor chain, and this arm cannot discriminate the classification (§418)');
  console.log(`\n[S1] dynamic ${L._dynCount} · static ${L._staticCasters.length} (${staticNames.join(', ')})`);
});

/* ====================================================================== */
/* S2 / S3 — what dirties the cache, and what must not                     */
/* ====================================================================== */

test('S2 a static that MOVES dirties the cache; a quiescent world does not', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a settled cache doing zero refreshes on a quiescent frame, then refreshing on
   *               the frame after a visible static is moved.
   *   fails  on : RUN in-arm — the quiescent frames themselves, asserted to be zero. The file
   *               records a regression where an unconditional reset made every 8th frame dirty
   *               (26 refreshes per 100 frames), so "it refreshes when I move something" alone
   *               does not discriminate: a cache that refreshes ALWAYS would satisfy it.
   *   verdict   : passes on a real change, fails on no change.
   */
  const { L, scene } = await lighting();
  const w = mesh('wall_a');
  scene.add(w, mesh('wall_b'));
  settle(L);

  let idle = 0;
  for (let i = 0; i < 24; i++) idle += frame(L);
  assert.equal(idle, 0,
    `${idle} refreshes across 24 quiescent frames — the cache is paying its full bill for nothing, `
    + 'which is the `%8` regression this arm exists to catch');

  w.position.x += 3;
  w.updateMatrixWorld(true);
  const moved = frame(L);
  assert.ok(moved > 0,
    'moving a visible static did not dirty the cache — its shadow will keep the old shape '
    + 'indefinitely, which is the silent failure the fingerprint exists to prevent');
  console.log(`\n[S2] 24 quiescent frames -> ${idle} refreshes · one moved static -> ${moved}`);
});

test('S3 an INVISIBLE static that moves must NOT dirty the cache', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : a hidden caster moved a long way, producing zero refreshes — it contributes
   *               nothing to the depth image, so a refresh would reproduce the previous map
   *               pixel for pixel. This is not hypothetical: `main.js` turns `castShadow` on for
   *               every opaque mesh, which sweeps in ARCHITECTURE's invisible collider proxies,
   *               so the static set is dominated by meshes that cannot cast anything (§544
   *               measured 262 of them).
   *   fails  on : RUN in-arm — the SAME mesh made visible and moved the same way, which must
   *               dirty. Without that the arm would pass on a fingerprint that had stopped
   *               noticing movement altogether.
   *   verdict   : passes on an invisible move, fails on a visible one. It discriminates the
   *               VISIBILITY term specifically, rather than movement in general.
   */
  const { L, scene } = await lighting();
  const hidden = mesh('proxy:ledge', { visible: false });
  scene.add(hidden, mesh('wall_a'));
  settle(L);

  for (let i = 0; i < 3; i++) {
    hidden.position.x += 5;
    hidden.updateMatrixWorld(true);
  }
  let dirt = 0;
  for (let i = 0; i < 16; i++) dirt += frame(L);
  assert.equal(dirt, 0,
    `moving an INVISIBLE caster produced ${dirt} refresh(es). It contributes nothing to the depth `
    + 'image, so every one of those re-renders reproduces the previous map exactly — the cost with '
    + 'none of the benefit, on a static set dominated by invisible collider proxies.');

  /* RUN the counterexample: reveal it and move it the same way. */
  hidden.visible = true;
  settle(L);
  hidden.position.x += 5;
  hidden.updateMatrixWorld(true);
  const seen = frame(L);
  assert.ok(seen > 0,
    'the same mesh, VISIBLE, moved the same distance, still did not dirty the cache — the '
    + 'fingerprint has stopped noticing movement and S3 proves nothing (§418)');
  console.log(`\n[S3] invisible moves -> ${dirt} refreshes · the same mesh visible -> ${seen}`);
});

test('S4 a visibility FLIP dirties, in both directions', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : hiding a visible caster dirtying the cache, and revealing it dirtying again.
   *               This is why `Lighting` keeps invisible members in `_staticCasters` and zeroes
   *               their CONTRIBUTION rather than dropping them: the census runs on a `%8` beat,
   *               so a dropped member that reappeared would serve a stale map for up to eight
   *               frames, and both live reveal paths flip an ANCESTOR's flag.
   *   fails  on : RUN in-arm — an ancestor-level flip, which must also be seen. A fingerprint
   *               reading only `mesh.visible` would pass the direct case and miss the real one.
   *   verdict   : passes on a flip at either level, fails on neither — the ancestor clause is
   *               what makes it match the shipped reveal paths.
   */
  const { L, scene } = await lighting();
  const group = new THREE.Group(); group.name = 'tomb';
  const m = mesh('tomb_wall');
  group.add(m);
  scene.add(group, mesh('wall_a'));
  settle(L);

  m.visible = false;
  const hid = frame(L);
  assert.ok(hid > 0, 'hiding a caster did not dirty the cache — its shadow stays in the map');
  settle(L);
  m.visible = true;
  const shown = frame(L);
  assert.ok(shown > 0, 'revealing a caster did not dirty the cache — its shadow never appears');

  /* RUN the ancestor case, which is the one the shipped reveal paths actually use. */
  settle(L);
  group.visible = false;
  group.updateMatrixWorld(true);
  const viaParent = frame(L);
  assert.ok(viaParent > 0,
    'hiding the PARENT group did not dirty the cache. Both live reveal paths flip an ancestor '
    + 'flag, so a fingerprint that reads only the mesh\'s own `visible` misses every real reveal.');
  console.log(`\n[S4] hide ${hid} · show ${shown} · via ancestor ${viaParent}`);
});

/* ====================================================================== */
/* S5 — the geometry terms (the PREREG-fingerprint-geometry closure)       */
/* ====================================================================== */

test('S5 geometry: a static whose SHAPE changes under a still transform dirties the cache', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : four edits that change the depth image while the transform stands still —
   *               the geometry object replaced, the position attribute's version bumped, the
   *               index's version bumped, and drawRange.count changed — each dirtying the cache
   *               on its own.
   *   fails  on : RUN in-arm — a frame with no edit at all between each case, asserted to be
   *               zero, so "it dirtied" is never satisfied by a cache that dirties every frame.
   *               And the drawRange trap explicitly: `count` defaults to Infinity, and Infinity
   *               in the sum would freeze the fingerprint at Infinity — equal to itself forever,
   *               hiding every LATER edit. The arm sets Infinity first and then requires a
   *               subsequent real edit to still be seen.
   *   verdict   : passes on each shape edit, fails on quiescence. It discriminates the GEOMETRY
   *               terms, which is the half a transform-only fingerprint would miss.
   */
  const { L, scene } = await lighting();
  const m = mesh('wall_a');
  scene.add(m, mesh('wall_b'));
  settle(L);

  const step = (label, mutate) => {
    let quiet = 0;
    for (let i = 0; i < 10; i++) quiet += frame(L);
    assert.equal(quiet, 0, `${label}: ${quiet} refreshes before the edit — the cache is dirty anyway`);
    mutate();
    const got = frame(L);
    assert.ok(got > 0, `${label}: the edit did not dirty the cache, so the old shape's shadow stands`);
    settle(L);
    return got;
  };

  const r1 = step('geometry replaced', () => { m.geometry = new THREE.SphereGeometry(2, 8, 6); });
  const r2 = step('position attribute version', () => { m.geometry.attributes.position.needsUpdate = true; });
  const r3 = step('index version', () => { if (m.geometry.index) m.geometry.index.needsUpdate = true; else m.geometry.setIndex([0, 1, 2]); });
  /* The Infinity trap, in order: default count IS Infinity, so set a finite one, then go back to
     Infinity, then make a further real edit — which must still be seen. */
  const r4 = step('drawRange count finite', () => { m.geometry.setDrawRange(0, 12); });
  const r5 = step('drawRange back to Infinity', () => { m.geometry.setDrawRange(0, Infinity); });
  const r6 = step('a real edit AFTER Infinity', () => { m.position.z += 4; m.updateMatrixWorld(true); });

  assert.ok(r6 > 0,
    'after drawRange returned to its Infinity default, a later real change was not seen — the '
    + 'fingerprint has frozen at Infinity, which is equal to itself forever and hides every '
    + 'subsequent edit');
  console.log(`\n[S5] geometry ${r1} · position ${r2} · index ${r3} · drawRange ${r4} · Infinity ${r5} · after ${r6}`);
});

/* ====================================================================== */
/* S6 — the cache key follows the fitted box, so camera motion invalidates */
/* ====================================================================== */

test('S6 fit: a still camera refreshes nothing, and the radius is rotation-invariant', async () => {
  /* ── DOMAIN (§418.3) ──────────────────────────────────────────────────────────────────────
   *   passes on : the REAL `Lighting.update()` — fit included, not just `_updateShadowCache` —
   *               driven for 60 frames with a still camera, producing zero refreshes; and the
   *               fitted radius never changing under a 90 deg/s turn, which is the rotation
   *               invariance the sphere fit exists to provide.
   *   fails  on : RUN in-arm — a static caster moved, which must dirty the cache through the same
   *               path. Without it "zero refreshes" would be satisfied by a cache that had stopped
   *               deciding anything at all.
   *   verdict   : passes on a quiescent fit, fails on a real change. It pins the STILL-camera
   *               guarantee, which is the half the cache reliably delivers.
   *   does NOT  : assert what a TURNING camera does. §547 measured the centre moving on 58-60 of
   *   discrim.    60 turning frames while the radius moved on 0 — so the cache is fully effective
   *               still and ineffective turning — but asserting that would redden the day someone
   *               improves it. The turning number is printed, not asserted.
   *
   * ── The harness trap this arm also guards ───────────────────────────────────────────────
   * `Lighting.update()` reads `engine.debug.timeOfDay`; a stub without it sets `timeOfDay =
   * undefined` on the first call, which makes the sun direction NaN, which makes every cache key
   * NaN, which makes `stale` true forever. §547's first run measured "100% refresh on a still
   * camera" from exactly that and it was the harness, not the code (§435.4). The assertion below
   * that a still camera refreshes ZERO would have caught it.
   */
  const { L, scene, engine } = await lighting();
  engine.debug.timeOfDay = 0.79;                 // see the note above — without this it is all NaN
  scene.add(mesh('wall_a'), mesh('wall_b'));
  const cam = engine.camera;
  const DT = 1 / 60;
  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { cam.updateMatrixWorld(true); L.update(DT, t += DT); } };

  cam.position.set(0, 6, 20); cam.rotation.set(0, 0, 0);
  step(24);                                      // past the first-frame refresh and the %8 beat
  const r0 = L._cacheStats.refreshes;
  step(60);
  const still = L._cacheStats.refreshes - r0;
  assert.equal(still, 0,
    `${still} refreshes over 60 frames with a STILL camera and a quiescent world. The fit is `
    + 'moving when nothing is, so the cache pays its full bill every frame and saves nothing — '
    + 'and if every key component is NaN (the `timeOfDay` trap above) this is exactly what it '
    + 'looks like.');

  /* the sphere fit's stated property: radius is rotation-invariant */
  const radii = L.cascades.map((c) => c.radius);
  let ry = 0;
  for (let i = 0; i < 60; i++) {
    ry += (Math.PI / 2) * DT;
    cam.rotation.set(0, ry, 0);
    cam.updateMatrixWorld(true);
    L.update(DT, t += DT);
  }
  L.cascades.forEach((c, i) => {
    assert.equal(c.radius, radii[i],
      `cascade ${i}'s fitted radius moved from ${radii[i]} to ${c.radius} under a pure rotation — `
      + 'the bounding-sphere fit exists precisely so it does not, and that is what stops the ortho '
      + 'box resizing as the camera turns');
  });
  const turning = L._cacheStats.refreshes - r0 - still;

  /* RUN the counterexample: a real change must still dirty it through this same path. */
  cam.rotation.set(0, ry, 0);
  step(12);
  const r1 = L._cacheStats.refreshes;
  const w = scene.children.find((o) => o.name === 'wall_a');
  w.position.x += 6; w.updateMatrixWorld(true);
  step(1);
  assert.ok(L._cacheStats.refreshes > r1,
    'moving a static caster did not dirty the cache through the full update path — this arm '
    + 'cannot tell a quiescent cache from a dead one (§418)');

  console.log(`\n[S6] still camera: ${still} refreshes / 60 frames · turning 90 deg/s: ${turning} `
    + `(radius invariant on all ${L.cascades.length} cascades; §547 measured the CENTRE moving instead)`);
});

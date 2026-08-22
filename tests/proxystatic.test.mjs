import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { realWorld, hardReset, DT } from './_moveset.mjs';
import { TUNE } from '../src/player/Controller.js';
import { SHOTS } from '../src/core/Shots.js';

/**
 * proxystatic.test.mjs — the two §544 items the perf lane routed into `src/world/`, both
 * reproduced first and then decided on their measured ceiling rather than their headline.
 *
 * ── (1) 263 invisible collision proxies carried `matrixAutoUpdate` — DONE (§573) ───────────
 * Reproduced exactly: 308 of 357 scene nodes recomposed a matrix every frame, 264 of them in
 * `Architecture.proxyRoot`, 263 flagged `userData.collisionProxy` and every one of those
 * `visible === false`. (The lane's figures were 306/355 and 262; the +1 proxy is §571's nave
 * rope, added between their measurement and this one, and the counts line up once it is.)
 *
 * Safe because the transform is written once and never again — checked before relying on it:
 * the only writes to `.position`/`.rotation`/`.scale`/`.quaternion` in `Architecture.js` are
 * the two lines inside `proxy()`, and no other module touches `proxyRoot` or the
 * `collisionProxy` flag. Ceiling, on the UNFORCED `scene.updateMatrixWorld()` the renderer
 * actually calls: **60.9 → 39.9 µs, a 21.0 µs saving = 0.126 % of a 16.67 ms frame.** Small,
 * free, and reported as small.
 *
 * ── (2) 11 meshes bypass frustum culling — DECLINED, and arm F is why ─────────────────────
 * Reproduced exactly: 11 meshes, `nile` at 18,432 triangles, `coins`, `clue_bottles`, 8
 * instanced, 82,394 triangles in total. But the ranking was by triangle count, and the
 * question is what culling could REMOVE. Given the correct bounding volume — three 0.185.1's
 * `Frustum.intersectsObject` prefers `object.boundingSphere`, which `InstancedMesh` has and
 * computes across its instances, so the "the per-mesh bounds lie" comment in `Vegetation.js`
 * describes a three.js that no longer exists — the spheres come out at radius **29.9 to 394.5 m**.
 * The cameras are *inside* them. Across all 18 canonical shots, enabling culling would remove
 * **2,112 of 1,483,092 submitted triangles: 0.14 %**, and all of it is `coins` in one shot.
 *
 * And there is a trap in doing it anyway. `clue_bottles`' instance matrices are written only in
 * `Props.update()`, never at build, so at build time its bounding sphere is **r 0.2 at the
 * origin**. Flipping `frustumCulled = true` there — the obvious action from the perf list —
 * culls it from half the canonical cameras until something recomputes the sphere. A visible
 * pop, for 0.14 %.
 *
 * The obvious rescue is "the shadow cascades are much smaller frusta, so it must pay there".
 * Measured, not assumed: ortho boxes at the half-extents `Lighting.js` names (14.5 / 25 / 42 /
 * 160 m) on every route waypoint cull **0 triangles at every size**. That is the real shape of
 * this item — the spheres do not merely overlap these frusta, they CONTAIN them, and a cull test
 * whose volume swallows the camera can only ever answer "keep". No flag flip can pay.
 * (`src/render/` is the perf lane's file and nothing here touches it; the split distances are
 * read from its own comment. `nile` is `receiveShadow = false` and never sets `castShadow`, so
 * it is not in the shadow passes at all.)
 *
 * What COULD pay is subdivision, and it was priced rather than waved at: splitting `nile` — the
 * 18,432-triangle water plane, 278 x 760 m — into a 4x4 grid of tiles with their own spheres
 * culls 56.9 % of its triangles across the 18 shots (68.3 % at 8x8, 71.5 % at 16x16). That is
 * **1.82 % of the level's 577,690 drawn triangles for 20.3 % more draw calls** (74 to 89), and
 * it also multiplies a collider registration on the plane whose whole job is to make falling in
 * a soft fail, and needs every tile sphere inflated by the vertex shader's wave amplitude
 * (0.148 m vertical plus the gerstner horizontal) or the water pops at tile edges. Bad trade,
 * declined — but priced, so the next person does not have to re-derive it.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ====================================================================================== */
test('proxystatic S: every collision proxy is static, and moving one without updateMatrix breaks it', async () => {
  /* DOMAIN (§418.3)
   * passes on : the shipped tree — every `collisionProxy` node has `matrixAutoUpdate === false`
   *             and a `matrixWorld` whose translation equals its authored position.
   * fails  on : RUN IN-ARM — a proxy whose `.position` is moved 5 m without `updateMatrix()`.
   *             Its `matrixWorld` must NOT follow, which is exactly the hazard the flag
   *             introduces and the reason the docblock in `proxy()` names it.
   * control   : RUN IN-ARM — a node that still carries `matrixAutoUpdate` (a Props mesh) DOES
   *             follow the same move. Without it, "the proxy did not move" is indistinguishable
   *             from "this test cannot detect movement".
   * does NOT  : discriminate whether collision still WORKS — arm C does that, and the pin
   * discrim.    census, reach census, slope sweep and `spawn2eye` all re-ran green.
   */
  const { engine, arch } = await realWorld();
  const all = [];
  engine.scene.traverse((o) => all.push(o));
  const proxies = all.filter((o) => o.userData?.collisionProxy);
  assert.ok(proxies.length > 200, `only ${proxies.length} collision proxies found — the fixture is wrong`);

  const auto = proxies.filter((o) => o.matrixAutoUpdate);
  assert.equal(auto.length, 0,
    `${auto.length} of ${proxies.length} collision proxies still recompose a matrix every frame. §573 `
    + 'turned that off because their transforms are written once in Architecture.proxy() and never again');

  /* the transforms actually survived the change */
  const p = new THREE.Vector3();
  for (const o of proxies) {
    p.setFromMatrixPosition(o.matrixWorld);
    assert.ok(p.distanceTo(o.position) < 1e-6,
      `proxy ${o.name} has matrixWorld translation ${p.toArray().map((v) => v.toFixed(3))} against position `
      + `${o.position.toArray().map((v) => v.toFixed(3))} — the static flag desynced the collider from its authorship`);
  }
  const totalAuto = all.filter((o) => o.matrixAutoUpdate).length;
  assert.ok(totalAuto < 80,
    `${totalAuto} scene nodes still recompose a matrix each frame; it was 308 before §573 and should now `
    + 'be well under 80');

  /* the failing input: move a proxy the way a future author would, and watch collision not care */
  const victim = proxies[Math.floor(proxies.length / 2)];
  const wasAt = victim.position.clone();
  victim.position.x += 5;
  victim.updateMatrixWorld(true);
  p.setFromMatrixPosition(victim.matrixWorld);
  assert.ok(Math.abs(p.x - wasAt.x) < 1e-6,
    'a proxy moved 5 m WITHOUT updateMatrix() had its matrixWorld follow anyway. Then §573 did not take '
    + 'effect on it, and the docblock warning in Architecture.proxy() is describing something that is not true');
  victim.position.copy(wasAt);
  victim.updateMatrix();
  victim.updateMatrixWorld(true);

  /* the control: a node that still auto-updates DOES follow */
  const live = all.find((o) => o.matrixAutoUpdate && o.isMesh && !o.userData?.collisionProxy);
  assert.ok(live, 'no auto-updating mesh left to use as a control');
  const liveAt = live.position.clone();
  live.position.x += 5;
  live.updateMatrixWorld(true);
  p.setFromMatrixPosition(live.matrixWorld);
  assert.ok(Math.abs(p.x - (liveAt.x + 5)) < 1e-6,
    `CONTROL: an auto-updating node moved 5 m and its matrixWorld did not follow (x ${p.x.toFixed(3)} vs `
    + `${(liveAt.x + 5).toFixed(3)}). Then the proxy assertion above proves nothing — this test cannot see movement`);
  live.position.copy(liveAt);
  live.updateMatrixWorld(true);
  console.log(`[proxystatic S] ${proxies.length} proxies static · ${totalAuto} of ${all.length} nodes still auto-update`);
});

/* ====================================================================================== */
test('proxystatic C: collision still stands on the proxies it always did', async () => {
  /* Cheap, direct, and pointed at the one thing that would be catastrophic: a proxy that stops
     colliding surfaces as falling through the world. Four stances on four different proxy
     families, settled (§562), plus a control at a spot with no floor. */
  const { engine, collision, c } = await realWorld();
  const step = () => {
    engine.input.beginFrame(DT); engine.input.move.x = 0; engine.input.move.y = 0;
    engine.time += DT; c.update(DT, engine.time); engine.events.length = 0;
  };
  const settles = (x, y, z) => {
    hardReset(engine, c, V(x, y + 0.6, z), Math.PI);
    for (let i = 0; i < 60; i++) step();
    return { ok: c.grounded, y: c.position.y };
  };
  const STANCES = [
    ['courtyard paving', 0, 0, 25],
    ['stage-1 deck', 0, 2, 19],
    ['kiosk lintel', 2.2, 9, 8.4],
    ['y 9 ledge ring', 23, 9, -13],
    ['hall floor', 0, 0, -33],
    ['vault floor', 0.4, -12, -57.6],
  ];
  for (const [name, x, y, z] of STANCES) {
    const r = settles(x, y, z);
    assert.ok(r.ok && Math.abs(r.y - y) < 1.2,
      `${name}: a capsule no longer settles at (${x}, ${y}, ${z}) — it ended ${r.ok ? `at y ${r.y.toFixed(2)}` : 'airborne'}. `
      + 'That is a proxy that stopped colliding, which is what §573 had to not do');
  }
  /* control: somewhere with no floor must NOT settle, or "it settled" means nothing */
  const air = settles(0, 60, 0);
  assert.ok(!air.ok || air.y < 30,
    `CONTROL: a capsule dropped at y 60 over open air reported grounded at y ${air.y.toFixed(2)} — this probe `
    + 'cannot tell standing from falling');
  console.log('[proxystatic C] 6 proxy families still carry a settled capsule; the air control does not');
});

/* ====================================================================================== */
test('proxystatic F: the frustum-bypass item buys 0.14 %, and flipping the flag would pop the bottles', async () => {
  /* A TRIPWIRE plus a measurement (§418.5). It records why item (2) was declined, so nobody
   * re-derives it from the triangle count and flips eleven flags.
   *
   * DOMAIN (§418.3)
   * passes on : the shipped tree — the 11 bypassing meshes all have correct bounding spheres of
   *             radius >= 25 m, and across the 18 canonical cameras enabling culling would
   *             remove under 2 % of the triangles they submit.
   * fails  on : RUN IN-ARM — `clue_bottles` at BUILD time, whose sphere is r < 1 at the origin
   *             because `Props.update()` writes its matrices later. That is the trap, and it is
   *             asserted as a fact about the shipped tree rather than described.
   * control   : RUN IN-ARM — the SAME expression (`copy(sphereOf(o)).applyMatrix4(...)`) on the
   *             largest bypassing mesh, displaced clear of the level, must be culled by every
   *             camera, and undisplaced must be kept by at least one. Without both, "nothing is
   *             culled" is indistinguishable from "this frustum test never culls anything".
   *             The first version of this control was a 0.5 m sphere at (400, 0, 400) and it
   *             FAILED, 17 of 18 — because the level is 2,304 m across (`nile` spans x/z ±1,150)
   *             and 400 m is *inside* it, well within the shot at (-3, 1, 28) whose 600 m far
   *             plane looks straight down that diagonal. A coordinate guessed from an intuition
   *             about level size is not a control; one derived from the level's own bounds is.
   * does NOT  : distinguish "culling saves nothing" from "culling saves nothing WORTH HAVING".
   * discrim.    Subdividing `nile` would cull 56.9 % of its triangles; that is priced in the file
   *             header and declined on the draw-call trade, not on this arm's evidence.
   */
  const { engine, mods, arch } = await realWorld();
  const all = [];
  engine.scene.traverse((o) => all.push(o));
  const noCull = all.filter((o) => o.isMesh && o.frustumCulled === false);
  assert.ok(noCull.length >= 10,
    `${noCull.length} meshes bypass frustum culling; the perf lane measured 11 and this arm is about them`);

  const frustum = new THREE.Frustum(), sphere = new THREE.Sphere();
  const shots = Object.values(SHOTS ?? {}).filter((s) => Array.isArray(s?.pos) && Array.isArray(s?.target));
  assert.ok(shots.length >= 10, `only ${shots.length} canonical shots — the sweep needs the real camera set`);
  const camFor = (s) => {
    const cam = new THREE.PerspectiveCamera(s.fov ?? 46, 16 / 9, 0.1, 600);
    cam.position.fromArray(s.pos);
    cam.lookAt(new THREE.Vector3().fromArray(s.target));
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  };

  /* the trap, before anything writes the matrices — cause AND consequence */
  const bottles = noCull.find((o) => o.name === 'clue_bottles');
  assert.ok(bottles, 'clue_bottles is no longer among the bypassing meshes — re-read this arm before trusting it');
  bottles.boundingSphere = null;
  bottles.computeBoundingSphere();
  /* Hold the build-time radius NOW: the sweep below recomputes every sphere after
   * `Props.update()`, and reading the field afterwards reports 56.8 m — the opposite of what
   * this assertion proves. */
  const bottlesBuildR = bottles.boundingSphere.radius;
  assert.ok(bottlesBuildR < 1.0,
    `clue_bottles' build-time bounding sphere is r ${bottlesBuildR.toFixed(2)}, not the degenerate `
    + 'r 0.2 this arm records. If Props now writes its instance matrices at build, the trap is gone and '
    + 'enabling culling on it is safe — say so and delete this assertion');
  /* The cause is a degenerate sphere; the consequence is that the bottles disappear. Setting
   * frustumCulled = true on this mesh, with the volume it carries at build, deletes it from most
   * of the canonical cameras — a visible defect, not a saving. */
  let bottlesLost = 0;
  for (const s of shots) {
    camFor(s);
    sphere.copy(bottles.boundingSphere).applyMatrix4(bottles.matrixWorld);
    if (!frustum.intersectsSphere(sphere)) bottlesLost++;
  }
  assert.ok(bottlesLost >= shots.length / 3,
    `enabling culling on clue_bottles would drop it from only ${bottlesLost} of ${shots.length} cameras. This arm `
    + 'records that it vanishes from 9 of 18; if that is no longer true the trap has changed and needs re-measuring');

  /* now let Props write them, and take the honest spheres */
  mods.props.update?.(1 / 60, 1.0);
  const tris = (o) => {
    const g = o.geometry;
    if (!g?.attributes?.position) return 0;
    const per = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    return Math.round(per * (o.isInstancedMesh ? o.count : 1));
  };
  for (const o of noCull) {
    if (o.boundingSphere !== undefined) { o.boundingSphere = null; o.computeBoundingSphere(); }
    else if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
  }
  const sphereOf = (o) => (o.boundingSphere !== undefined ? o.boundingSphere : o.geometry.boundingSphere);
  const minR = Math.min(...noCull.map((o) => sphereOf(o).radius));
  assert.ok(minR >= 25,
    `the smallest correct bounding sphere among the bypassing meshes is r ${minR.toFixed(1)} m. They were all `
    + '29.9 m and up — objects that span the level, which is why culling cannot remove them');

  let submitted = 0, culled = 0;
  /* The control is derived, not guessed: take the LARGEST bypassing mesh — the hardest thing on
   * the level to cull — and push it clear of the level's own bounding box through the same
   * expression the measurement uses. Off the map it must vanish from every camera; where it
   * actually sits it must survive at least one. */
  const levelBox = new THREE.Box3();
  for (const o of all) if (o.isMesh && o.geometry?.attributes?.position) levelBox.expandByObject(o);
  const span = levelBox.getSize(new THREE.Vector3()).length();
  const control = noCull.reduce((a, b) => (sphereOf(a).radius >= sphereOf(b).radius ? a : b));
  const away = new THREE.Matrix4().makeTranslation(span, span, span);
  let controlCulled = 0, controlKept = 0;
  for (const s of shots) {
    camFor(s);
    for (const o of noCull) {
      const t = tris(o);
      submitted += t;
      sphere.copy(sphereOf(o)).applyMatrix4(o.matrixWorld);
      if (!frustum.intersectsSphere(sphere)) culled += t;
    }
    sphere.copy(sphereOf(control)).applyMatrix4(new THREE.Matrix4().multiplyMatrices(away, control.matrixWorld));
    if (!frustum.intersectsSphere(sphere)) controlCulled++;
    sphere.copy(sphereOf(control)).applyMatrix4(control.matrixWorld);
    if (frustum.intersectsSphere(sphere)) controlKept++;
  }
  assert.equal(controlCulled, shots.length,
    `CONTROL (negative): "${control.name}" displaced ${span.toFixed(0)} m per axis, clear of a level that is `
    + `${levelBox.getSize(new THREE.Vector3()).x.toFixed(0)} m wide, was culled by only ${controlCulled} of `
    + `${shots.length} frusta. This frustum test cannot cull, so "${(100 * culled / submitted).toFixed(2)} % would `
    + 'be culled" would mean nothing');
  assert.ok(controlKept > 0,
    `CONTROL (positive): "${control.name}" where it actually stands was culled by all ${shots.length} frusta. `
    + 'This frustum test culls everything, so the same measurement would mean nothing in the other direction');
  /* The obvious objection is "the main camera is the wide one — the SHADOW cascades are small,
   * and there the bypass must cost something". It does not, and this is the reason the item
   * cannot be rescued by flipping flags: the spheres do not merely overlap these frusta, they
   * CONTAIN them. Ortho boxes at the cascade half-extents Lighting.js names (14.5 / 25 / 42 /
   * 160 m), centred on each route waypoint, cull nothing at all. `src/render/` is the perf
   * lane's file and nothing here touches it — the split distances are read from its comment. */
  const route = arch.api?.route ?? [];
  assert.ok(route.length >= 8, `only ${route.length} route waypoints — the cascade sweep needs the real route`);
  const sun = V(-0.5, -1, -0.35).normalize();
  let cascadeCulled = 0;
  for (const half of [14.5, 25, 42, 160]) {
    for (const w of route) {
      const c = V(w.x ?? w[0], w.y ?? w[1], w.z ?? w[2]);
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 400);
      cam.position.copy(c).addScaledVector(sun, -200);
      cam.lookAt(c); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      for (const o of noCull) {
        sphere.copy(sphereOf(o)).applyMatrix4(o.matrixWorld);
        if (!frustum.intersectsSphere(sphere)) cascadeCulled += tris(o);
      }
    }
  }
  assert.equal(cascadeCulled, 0,
    `${cascadeCulled} triangles would be culled at shadow-cascade frustum sizes. This arm records ZERO — the `
    + 'bypassing spheres contain those boxes entirely. If that has changed, the geometry shrank and the item '
    + 'is worth re-pricing rather than staying declined');

  const pct = 100 * culled / submitted;
  assert.ok(pct < 2,
    `enabling frustum culling on these meshes would now remove ${pct.toFixed(2)} % of the triangles they submit `
    + '(measured 0.14 %). If that has risen materially the geometry moved and the item is worth re-pricing');
  console.log(`[proxystatic F] ${noCull.length} bypassing meshes, min sphere r ${minR.toFixed(1)} m · `
    + `culling would remove ${culled} of ${submitted} tris across ${shots.length} cameras (${pct.toFixed(2)}%) · `
    + `clue_bottles sphere r ${bottlesBuildR.toFixed(2)} at build, r ${bottles.boundingSphere.radius.toFixed(2)} `
    + 'once Props.update() has written its matrices — that gap IS the trap');
});

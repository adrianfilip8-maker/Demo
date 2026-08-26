/* §1 budget ATTRIBUTION, offline: who owns the triangles, and what the counter is counting.
 *
 * WHY THIS EXISTS. `shots/<label>/manifest.json` carries one draw-call and one triangle number
 * per shot, taken from `renderer.info.render` (`Engine.js:273-274`, `autoReset = false`, reset
 * at `Engine.js:267` and read after the whole PostFX chain). Two blind critic rounds have read
 * that column as a §1 breach ("15 of 16 shots over 1.2 M"). It attributes nothing — no owner,
 * no pass — so every module can assume the mass is someone else's, and no one can act on it.
 *
 * This file answers both halves offline, with no boot and no capture lock:
 *
 *   1. ATTRIBUTION — per shot, per owner: the frustum-visible draws and triangles of every
 *      world module that builds headlessly, at named-subtree granularity, plus the SCENE TOTAL
 *      (the same walk with culling switched off), which is the ceiling no camera can exceed.
 *
 *   2. RECONCILIATION — a predicted `renderer.info` figure built from the passes the frame
 *      actually runs, so the manifest column can be checked against a model of itself:
 *        beauty (main view) + normal prepass (same set, overrideMaterial — PostFX.js:2029)
 *        + N shadow cascades (N = 3 at quality `high`, Engine.js:14) each drawing the casters
 *          inside its own fitted ortho box, which is NOT the camera frustum
 *        + a handful of full-screen blits (AO, edge, bloom chain, composite, FXAA).
 *      The cascade fit reproduces `Lighting.js`'s own arithmetic (splits, slice sphere,
 *      radiusQuantum, caster pad from `casterCeiling / sin(elevation)`), not an approximation.
 *      Sun direction per shot comes from `evalAtmosphere(tod)`, the same function Lighting uses.
 *
 * STATED GAPS — this is a floor on mass and on the prediction, never a ceiling:
 *   - The character (`SlyModelDLRig`) resolves its FBX through `import.meta.glob` and cannot
 *     load in plain Node (§216). It is absent here.
 *   - Guards build headlessly, but `loadCarmelitaGuard()` returns null without fetch, so the
 *     two humanoid types fall back to the procedural body. Guard mass here is the procedural
 *     roster, not the shipped Carmelita mesh.
 *   - Ink shells are added in-page; the world modules carry none headlessly (verified: zero
 *     `isOutlineShell` meshes in all three roots).
 *   - FX emitters, sky dome and HUD are not built.
 * Everything absent is character-scale (tens of k triangles), and the conclusion is quoted with
 * a bound that assumes the worst for all of it.
 *
 *   node tools/budgetattrib.mjs                 # table for every canonical shot
 *   node tools/budgetattrib.mjs --json out.json # also write the machine-readable rows
 *   node tools/budgetattrib.mjs --detail night  # per-owner rows for one shot
 */
import './_domshim.mjs';
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import { SHOTS } from '../src/core/Shots.js';
import { createAtmosphereState, evalAtmosphere } from '../src/render/Atmosphere.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i === -1) return false; argv.splice(i, 1); return true; };
const JSONOUT = opt('json', '');
const INPAGE = flag('inpage');
const DETAIL = argv.filter((a) => !a.startsWith('--'));

/* ---- the in-page substitution (--inpage) ---------------------------------
 *
 * Three things render in the browser that cannot build in Node, and one of them is now large.
 * Their triangle counts are MEASURED here, offline, straight off the asset files — not guessed:
 *
 *   CARMELITA_TRIS  `public/assets/sly-anim/carmelita-guard.glb`, summed over its 21 primitives'
 *                   index accessors. `CarmelitaGuard.js` merges those 21 into ONE geometry with
 *                   TWO material groups (body + head), so it costs 2 draws per guard, and it
 *                   REPLACES the procedural body on the `temple` and `heavy` roster types
 *                   (`Guard.js:1290`) — 9 of the 11 roster entries. It landed 2026-08-08, six
 *                   days AFTER the last in-page budget table (budget34, 2026-08-02), which is
 *                   why no attribution on record contains it.
 *   SLY_TRIS        `src/assets/sly-dl/sly.fbx`, parsed with FBXLoader under `_domshim.mjs`:
 *                   4 meshes, 13,321 triangles. Plus `sly-cane.glb` at 494.
 *   Ink shells      `Guard.js:1496` shells every guard; the character carries one too. A shell is
 *                   a second draw of the SAME triangles (`Outline.js:518`), one draw each.
 *
 * This mode is a SUBSTITUTION MODEL, not an in-page measurement: it swaps the measured asset
 * mass onto the headless guard/player transforms. It is quoted as such everywhere it appears.
 */
/* Collected diagnostics, declared here because the measured Carmelita mass below reports into it. */
const warnings = [];

/* CARMELITA_TRIS used to be the literal 29791, "measured: glb index accessors, 21 primitives".
 * §702 moved it twice in one change — the shock pistol left (−1,672) and the recovered face
 * arrived (+4,968) — and a literal here would have gone on reporting the old number in the
 * REASSURING direction, which is §700.3's lesson and §310's before it. So it is no longer a
 * literal: it is read from the code the game calls, over the same committed assets, with the same
 * head splice. If the asset or the bind changes again this moves with it.
 *
 * **§709 corrected WHICH ARM it reads (§442).** It called `bindToRig3` — `CarmelitaGuard.js`, the
 * REBIND. The shipped default has been `TUNE.carmelitaNative = 1` since §704, i.e. `buildNative`.
 * The two happen to agree at 32,063 on today's assets, so the figure was never wrong; the
 * INSTRUMENT was, and a correct number measured on the wrong subject is §442 exactly. It now
 * builds the shipped arm, and the pistol with it, so a change to either shows up here.
 *
 * `.tris` is what `Guard.js` adds to `this.stats.tris`, so this is the number the runtime uses,
 * not a re-derivation of it. Falls back to the historical literal only if the assets are absent,
 * and says so loudly rather than quoting a number it did not measure. */
const { CARMELITA_TRIS, PISTOL_TRIS } = await (async () => {
  try {
    const { readFileSync } = await import('node:fs');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { buildNative, splicePistolNative, PISTOL_MESHES } = await import('../src/ai/CarmelitaNative.js');
    const { GUARD_TUNE } = await import('../src/ai/Guard.js');
    const parse = async (p) => {
      const b = readFileSync(p);
      return new Promise((res, rej) => new GLTFLoader().parse(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
    };
    const scene = (await parse('public/assets/sly-anim/carmelita-guard.glb')).scene;
    let head = null;
    try {
      const h = await parse('public/assets/sly-anim/carmelita-head-lp.glb');
      h.scene.traverse((o) => { if (!head && o.isMesh) head = o.geometry; });
    } catch { /* the stub head is the documented fallback; the count below reports what it got */ }
    /* The pistol is measured only when the shipped TUNE actually draws it, and through the same
       splice `loadCarmelitaNative` performs — so a build that turned it off, or one whose
       low-poly asset went missing, is quoted at what it would really cost. */
    const armed = GUARD_TUNE.carmelitaPistol > 0.5;
    if (armed) {
      try {
        const lp = await parse('public/assets/sly-anim/carmelita-pistol-lp.glb');
        const geos = {};
        lp.scene.traverse((o) => { if (o.isMesh && PISTOL_MESHES.includes(o.name)) geos[o.name] = o.geometry; });
        const sp = splicePistolNative(scene, geos);
        if (!sp.ok) warnings.push(`the low-poly pistol did not splice (${sp.why}) — quoting the FULL-resolution pistol`);
      } catch (e) {
        warnings.push(`carmelita-pistol-lp.glb not read (${e.message}) — quoting the FULL-resolution pistol`);
      }
    }
    const a = buildNative(scene, head, { pistol: armed });
    return { CARMELITA_TRIS: a.tris, PISTOL_TRIS: a.pistol ? a.pistol.tris : 0 };
  } catch (e) {
    warnings.push(`carmelita mass NOT measured (${e.message}) — falling back to the 2026-08-08 literal 29791`);
    return { CARMELITA_TRIS: 29791, PISTOL_TRIS: 0 };
  }
})();
const CARMELITA_DRAWS = 2;         // merged geometry, two material groups
const SLY_TRIS = 13321 + 494;      // sly.fbx (4 meshes) + sly-cane.glb
const SLY_DRAWS = 4;
const HUMANOID_TYPES = new Set(['temple', 'heavy']);

const W = 1280, H = 720;
const BUDGET_DRAWS = 250, BUDGET_TRIS = 1.2e6;

/* Mirrors src/render/Lighting.js TUNE + Engine.js QUALITY_PRESETS.high. Read, not remembered —
   if TUNE moves, this moves with it or the reconciliation is quoting a stale rig. */
const L = {
  shadowNear: 0.5, shadowDistance: 160, splitLambda: 0.78, radiusQuantum: 0.25,
  casterCeiling: 36, casterPadMin: 34, casterPadMax: 130,
  cascades: 3,              // engine.settings.shadowCascades at quality 'high'
};
/* Full-screen blits in PostFX._renderChain at high: AO, edge, bloom bright + 3 down + 3 up,
   composite, FXAA. Each is one draw of two triangles. Counted as a constant, and it is
   ~4% of the draw column and ~0.001% of the triangle column, so its exactness does not matter. */
const BLIT_DRAWS = 11, BLIT_TRIS = 22;

/* ---------------------------------------------------------------- build --- */
const built = {};
const texStub = { tex: () => null, get: () => null, material: () => null, bundle: () => null };
const engine = {
  quality: 'high', scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  settings: { shadowCascades: L.cascades, shadowMap: 3072 },
  warn: (m) => warnings.push(m), has: () => false,
  get: (k) => (k === 'textures' ? texStub : built[k] || null),
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};

const roots = [];
async function build(label, path, cls, pick) {
  try {
    const mod = await import(path);
    const C = mod[cls];
    if (!C) { console.log(`  (${label}: no export ${cls})`); return; }
    const inst = new C(engine, built.terrain);
    await inst.init?.();
    built[label] = inst;
    const r = pick(inst);
    if (r) { r.updateMatrixWorld(true); roots.push([label, r]); }
    else console.log(`  (${label}: no root)`);
  } catch (e) { console.log(`  (${label} failed: ${String(e.message).split('\n')[0]})`); }
}
await build('architecture', '../src/world/Architecture.js', 'Architecture', (o) => o.root);
await build('props',        '../src/world/Props.js',        'Props',        (o) => o.group || o.root);
/* terrain INCLUDES vegetation and water — building them again triple-counts (§130). */
await build('terrain',      '../src/world/Terrain.js',      'Terrain',      (o) => o.group || o.root || o.mesh);
await build('guards',       '../src/ai/Guard.js',           'Guards',       (o) => o.group);

/* ------------------------------------------------------------- collect --- */
const tri = (m) => {
  const g = m.geometry; if (!g?.attributes?.position) return 0;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  return n * (m.isInstancedMesh ? m.count : 1);
};

/** One record per drawn mesh: owner label, triangles, world bounding sphere + box, caster flag. */
const items = [];
for (const [label, root] of roots) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) return;
    if (o.visible === false) return;
    if (o.userData?.collisionProxy) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;

    const path = [];
    let p = o;
    while (p && p !== root) { if (p.name) path.unshift(p.name); p = p.parent; }
    const owner = `${label}/${path[0] || '(unnamed)'}`;

    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    const sphere = g.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    const box = new THREE.Box3();
    if (o.isInstancedMesh) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        box.union(g.boundingBox.clone().applyMatrix4(m.premultiply(o.matrixWorld)));
      }
      sphere.radius = Math.max(sphere.radius, box.getSize(new THREE.Vector3()).length() * 0.5);
      sphere.center.copy(box.getCenter(new THREE.Vector3()));
    } else {
      box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    }

    /* main.js's boot sweep: every opaque mesh casts unless it opts out. That is what makes the
       caster set the whole world rather than the frame's contents — the single fact the
       reconciliation turns on. */
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const opaque = mat ? !mat.transparent && mat.depthWrite !== false : true;
    const caster = opaque && !o.userData?.noShadow && !o.userData?.isOutlineShell;

    items.push({ module: label, owner, tris: tri(o), sphere, box, caster, obj: o });
  });
}

/* ---- in-page substitution: Carmelita bodies, ink shells, the character --- */
if (INPAGE) {
  const typeOf = new Map();
  for (const g of built.guards?.guards || []) if (g.mesh) typeOf.set(g.mesh.uuid, g.type);

  const shells = [];
  const pistols = [];
  for (const it of items) {
    if (it.module !== 'guards') continue;
    const type = typeOf.get(it.obj?.uuid);
    if (!type) continue;
    if (HUMANOID_TYPES.has(type)) {
      it.tris = CARMELITA_TRIS;                 // the merged Carmelita body replaces the procedural one
      it.extraDraws = CARMELITA_DRAWS - 1;      // two material groups = two draws
      it.owner = 'guards/carmelita_body';
    }
    /* `Guard.js`'s `_applyOutlines` shells every guard, scarabs included. Shells never cast
       (main.js opts `isOutlineShell` out of the sweep), so they cost the beauty and prepass
       passes only. */
    shells.push({ module: 'guards', owner: `${it.owner} [ink shell]`, tris: it.tris,
      sphere: it.sphere, box: it.box, caster: false, obj: null });
    /* §709: the shock pistol, pushed AFTER the shell for this guard is built, which is the whole
       point — it is its own `SkinnedMesh` and `_applyOutlines` does not shell it, so it appears
       ONCE where the body appears twice. That halving is what let it fit. If
       `TUNE.carmelitaPistolInk` is ever turned on, this row needs a shell beside it and the
       arithmetic below stops matching the build. */
    if (HUMANOID_TYPES.has(type) && PISTOL_TRIS > 0) {
      pistols.push({ module: 'guards', owner: 'guards/carmelita_pistol', tris: PISTOL_TRIS,
        sphere: it.sphere, box: it.box, caster: true, obj: null });
    }
  }
  items.push(...shells, ...pistols);
}

/* ------------------------------------------------------------ cascades --- */
const atmo = createAtmosphereState();
function cascadeSets(shot) {
  const { pos, target, fov, tod } = shot;
  evalAtmosphere(tod ?? 0.78, atmo);
  const keyDir = atmo.sunDir.clone().normalize();         // points TOWARD the sun

  const camPos = new THREE.Vector3(...pos);
  const fwd = new THREE.Vector3(...target).sub(camPos).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov * 0.5));
  const tanH = tanV * (W / H);
  const k2 = tanV * tanV + tanH * tanH;

  const splits = [];
  for (let i = 0; i <= L.cascades; i++) {
    const p = i / L.cascades;
    const log = L.shadowNear * Math.pow(L.shadowDistance / L.shadowNear, p);
    const uni = L.shadowNear + (L.shadowDistance - L.shadowNear) * p;
    splits.push(THREE.MathUtils.lerp(uni, log, L.splitLambda));
  }

  const lightDir = keyDir.clone().multiplyScalar(-1).normalize();   // direction light travels
  const upRef = Math.abs(lightDir.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(upRef, lightDir).normalize();
  const up = new THREE.Vector3().crossVectors(lightDir, right).normalize();
  const sinEl = Math.max(0.28, Math.abs(keyDir.y));
  const pad = THREE.MathUtils.clamp(L.casterCeiling / sinEl, L.casterPadMin, L.casterPadMax);

  const out = [];
  for (let i = 0; i < L.cascades; i++) {
    const n = splits[i], f = splits[i + 1];
    let z = 0.5 * (n + f) * (1 + k2), radius;
    if (z >= f) { z = f; radius = Math.max(f * Math.sqrt(k2), Math.hypot(n * Math.sqrt(k2), f - n)); }
    else radius = Math.sqrt((f - z) * (f - z) + f * f * k2);
    radius = Math.ceil(radius / L.radiusQuantum) * L.radiusQuantum;
    const centre = camPos.clone().addScaledVector(fwd, z);
    const back = radius + pad;

    let draws = 0, tris = 0;
    const byOwner = new Map();
    for (const it of items) {
      if (!it.caster) continue;
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let c = 0; c < 8; c++) {
        const q = new THREE.Vector3(
          c & 1 ? it.box.max.x : it.box.min.x,
          c & 2 ? it.box.max.y : it.box.min.y,
          c & 4 ? it.box.max.z : it.box.min.z).sub(centre);
        const a = [q.dot(right), q.dot(up), q.dot(lightDir)];
        for (let k = 0; k < 3; k++) { if (a[k] < lo[k]) lo[k] = a[k]; if (a[k] > hi[k]) hi[k] = a[k]; }
      }
      if (hi[0] < -radius || lo[0] > radius) continue;
      if (hi[1] < -radius || lo[1] > radius) continue;
      if (hi[2] < -back || lo[2] > radius) continue;
      draws++; tris += it.tris;
      const a = byOwner.get(it.owner) || [0, 0]; a[0]++; a[1] += it.tris; byOwner.set(it.owner, a);
    }
    out.push({ i, radius, draws, tris, byOwner });
  }
  return { cascades: out, sunDir: keyDir, pad, sinEl };
}

/* --------------------------------------------------------------- shots --- */
const names = Object.keys(SHOTS).filter((k) => SHOTS[k]?.pos && SHOTS[k]?.target);
const rows = [];
for (const sn of names) {
  const s = SHOTS[sn];
  const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 2000);
  cam.position.fromArray(s.pos);
  cam.lookAt(new THREE.Vector3(...s.target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const fr = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));

  let draws = 0, tris = 0;
  const byOwner = new Map();
  const byModule = new Map();
  const add = (owner, module, d, t) => {
    draws += d; tris += t;
    const a = byOwner.get(owner) || [0, 0]; a[0] += d; a[1] += t; byOwner.set(owner, a);
    const b = byModule.get(module) || [0, 0]; b[0] += d; b[1] += t; byModule.set(module, b);
  };
  for (const it of items) {
    if (!fr.intersectsSphere(it.sphere)) continue;
    add(it.owner, it.module, 1 + (it.extraDraws || 0), it.tris);
  }
  /* The character stands where the shot stages him; he is absent from every headless build
     (§216: the FBX resolves through `import.meta.glob`). Billed at his measured asset mass,
     doubled for his ink shell, whenever the staged stand is inside the frustum. */
  if (INPAGE && s.player?.pos) {
    const c = new THREE.Vector3(...s.player.pos).setY(s.player.pos[1] + 0.9);
    if (fr.intersectsSphere(new THREE.Sphere(c, 1.2))) {
      add('player/sly_root', 'player', SLY_DRAWS, SLY_TRIS);
      add('player/sly_root [ink shell]', 'player', SLY_DRAWS, SLY_TRIS);
    }
  }

  const cs = cascadeSets(s);
  const shadow = cs.cascades.reduce((a, c) => ({ draws: a.draws + c.draws, tris: a.tris + c.tris }), { draws: 0, tris: 0 });
  const predicted = {
    draws: draws * 2 + shadow.draws + BLIT_DRAWS,
    tris: tris * 2 + shadow.tris + BLIT_TRIS,
  };
  rows.push({ shot: sn, draws, tris, byOwner, byModule, cascades: cs.cascades, shadow, predicted, tod: s.tod });
}

/* --------------------------------------------------------------- print --- */
const modules = [...roots.map((r) => r[0]), ...(INPAGE ? ['player'] : [])];
const sceneTotal = items.reduce((a, it) => ({
  draws: a.draws + 1 + (it.extraDraws || 0), tris: a.tris + it.tris,
}), { draws: 0, tris: 0 });
if (INPAGE) { sceneTotal.draws += SLY_DRAWS * 2; sceneTotal.tris += SLY_TRIS * 2; }

console.log(`\n§1 ATTRIBUTION — offline, ${W}x${H}, quality high (${L.cascades} cascades), no boot`);
console.log(`modules built: ${modules.join(' ')}`
  + (INPAGE ? `   [--inpage: Carmelita bodies + ink shells + character substituted from measured asset mass]`
            : `   (character absent — see header gaps)`) + `\n`);
console.log(`SCENE TOTAL, culling off: ${sceneTotal.draws} meshes / ${(sceneTotal.tris / 1e6).toFixed(3)}M tris`
  + `  = ${(sceneTotal.tris / BUDGET_TRIS * 100).toFixed(0)}% of the 1.2M cap`);
console.log(`  (no camera can exceed this; it is the ceiling on every "visible" reading of §1)\n`);

rows.sort((a, b) => b.tris - a.tris);
const head = `shot           draws     tris   %tri  ` + modules.map((m) => m.slice(0, 5).padStart(13)).join('')
  + `   shadow(3c)   predicted info`;
console.log(head);
for (const r of rows) {
  const per = modules.map((m) => {
    const v = r.byModule.get(m) || [0, 0];
    return `${v[0]}/${(v[1] / 1000).toFixed(0)}k`.padStart(13);
  }).join('');
  console.log(`${r.shot.padEnd(13)} ${String(r.draws).padStart(5)} ${(r.tris / 1e6).toFixed(3)}M ${(r.tris / BUDGET_TRIS * 100).toFixed(0).padStart(5)}%${per}`
    + `   ${String(r.shadow.draws).padStart(3)}/${(r.shadow.tris / 1e6).toFixed(2)}M`
    + `   ${String(r.predicted.draws).padStart(4)}/${(r.predicted.tris / 1e6).toFixed(2)}M`);
}

const wd = Math.max(...rows.map((r) => r.draws)), wt = Math.max(...rows.map((r) => r.tris));
console.log(`\nWORST main-view: ${wd} draws (${(wd / BUDGET_DRAWS * 100).toFixed(0)}% of 250), `
  + `${(wt / 1e6).toFixed(3)}M tris (${(wt / BUDGET_TRIS * 100).toFixed(0)}% of 1.2M)`);

for (const sn of DETAIL) {
  const r = rows.find((x) => x.shot === sn);
  if (!r) { console.log(`\n(no shot "${sn}")`); continue; }
  console.log(`\n=== ${sn}: main-view owners (${r.draws} draws / ${(r.tris / 1e6).toFixed(3)}M) ===`);
  for (const [owner, v] of [...r.byOwner.entries()].sort((a, b) => b[1][1] - a[1][1])) {
    console.log(`  ${String(v[0]).padStart(3)} draws  ${String(Math.round(v[1])).padStart(8)} tris`
      + ` (${(v[1] / r.tris * 100).toFixed(1)}%)  ${owner}`);
  }
  console.log(`  cascades: ` + r.cascades.map((c) => `c${c.i} r${c.radius.toFixed(0)}m ${c.draws}/${Math.round(c.tris / 1000)}k`).join('   '));

  /* The frame-cost half: who is submitted into the shadow passes, which are NOT camera-culled.
     `main.js:242` marks every opaque mesh a caster, so this bills geometry that is off-screen —
     and, inside the sealed tomb, geometry that is not even in the same room. */
  const shadowOwners = new Map();
  for (const c of r.cascades) {
    for (const [owner, v] of c.byOwner) {
      const a = shadowOwners.get(owner) || [0, 0]; a[0] += v[0]; a[1] += v[1]; shadowOwners.set(owner, a);
    }
  }
  console.log(`\n=== ${sn}: SHADOW submissions by owner, summed over the 3 cascades `
    + `(${r.shadow.draws} draws / ${(r.shadow.tris / 1e6).toFixed(3)}M) ===`);
  for (const [owner, v] of [...shadowOwners.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 12)) {
    const seen = r.byOwner.get(owner);
    console.log(`  ${String(v[0]).padStart(3)} draws  ${String(Math.round(v[1])).padStart(8)} tris`
      + ` (${(v[1] / r.shadow.tris * 100).toFixed(1)}%)  ${owner}`
      + (seen ? '' : `   [NOT VISIBLE in this frame]`));
  }
}

if (JSONOUT) {
  await writeFile(JSONOUT, JSON.stringify({
    at: new Date().toISOString(), width: W, height: H, quality: 'high', cascades: L.cascades,
    budget: { draws: BUDGET_DRAWS, tris: BUDGET_TRIS },
    sceneTotal, modules,
    shots: rows.map((r) => ({
      shot: r.shot, tod: r.tod, mainView: { draws: r.draws, tris: r.tris },
      byModule: Object.fromEntries(r.byModule), byOwner: Object.fromEntries(r.byOwner),
      cascades: r.cascades, shadow: r.shadow, predictedInfo: r.predicted,
    })),
  }, null, 2));
  console.log(`\n→ ${JSONOUT}`);
}
if (warnings.length) console.log(`\nbuild warnings: ${warnings.length}`);

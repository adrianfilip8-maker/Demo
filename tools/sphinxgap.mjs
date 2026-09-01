/**
 * sphinxgap — "There is empty space below the bottom of the sphinx statues and above the
 * ground", measured per statue and per BASE CORNER (§746).
 *
 * The owner's sentence has more than one mechanism behind it and they want different repairs:
 *
 *   1. the placement query answers about the WRONG SURFACE (§697's shape: `heightAt` reporting
 *      something other than what is drawn under the statue — architecture, a proxy, a probe's
 *      own bottom),
 *   2. the query is right about a point and WRONG BETWEEN POINTS — the render mesh is a 0.8 m
 *      lattice built from `rawHeight` and the placement cache a 1.0 m bilinear one, so a mound
 *      sampled at its peak can be DRAWN lower than the number the statue was placed on,
 *   3. a FLAT rectangular base sampled at ONE point cannot sit flush on a SLOPE — the uphill
 *      edge meets the sand and the downhill edge hangs in air, by (half the footprint along
 *      the fall line) x tan(theta),
 *   4. the constants are simply stale.
 *
 * 3 is a per-CORNER quantity and every aggregate hides it, which is why nothing here is pooled.
 * 1 and 2 are separated by measuring the DRAWN surface rather than the query: this raycasts
 * straight down the rendered scene graph, which shares no geometry with `Terrain.heightAt` —
 * the render rings are built from `rawHeight` on their own 0.8 m lattice, `heightAt` is a 1 m
 * cached bilinear — so `heightAt − drawn` is exactly "the number the placement used disagrees
 * with the picture" and nothing else. Instrument and subject must not share the belief
 * (§439/§440).
 *
 * ── The statues are never re-derived, they are INTERCEPTED (§435.4) ────────────────────────
 * No sphinx is rebuilt here from this file's idea of the placement. `Props.init()` runs the
 * shipped path and `_absorb` is hooked, so every bag measured is the one the frame draws, with
 * the shipped rng stream, the shipped `s: 1 + jitter(0.04)` and the shipped yaw. The base
 * footprint is taken from the placed bag's OWN xz bounding box — the base course is the widest
 * part of the piece in both local axes, so the bag's xz box IS the base rectangle, already
 * carrying the scale and the yaw. Nothing about the placement is restated here.
 *
 * ── Controls, in-arm on every run (§439/§440) ─────────────────────────────────────────────
 * The gap estimator runs on two synthetic bodies before the real ones: a plate laid EXACTLY on
 * the drawn surface (must read 0.000) and the same plate lifted 0.500 m (must read 0.500). A
 * run whose controls miss those numbers prints VOID and exits 2.
 *
 * ── The one thing that would silently break it ────────────────────────────────────────────
 * The statues are IN the scene, so a ray cast from above hits the sphinx's own head first and
 * reports the animal as its own ground. PROPS' merged meshes are therefore excluded from the
 * ray targets by object identity (not by name), and the census prints what remains so a run
 * that has excluded the world by accident is visible rather than confident (§697's rule).
 *
 *   node tools/sphinxgap.mjs [--arm=flat|sink] [--quality=low|med|high|ultra] [--nx=N --nz=N]
 *                            [--json=path]
 *
 * `--arm` drives the SHIPPED `?sphinx=` token through its own `__SPHINX_AB` seam rather than
 * re-implementing the offset here, so before (`--arm=flat`), after (default) and the rejected
 * alternative (`--arm=sink`) all come off ONE instrument measuring ONE build path.
 */
import * as THREE from 'three';

const arg = (k, d) => {
  const a = process.argv.find((v) => v.startsWith(`--${k}=`));
  return a ? Number(a.slice(k.length + 3)) : d;
};
const ARM = (process.argv.find((v) => v.startsWith('--arm=')) || '--arm=').slice(6);
if (ARM) globalThis.__SPHINX_AB = ARM;      // drives the SHIPPED `?sphinx=` seam, not a copy of it
/* Grid resolution is an argument because "is the worst node the worst POINT" is a question the
   instrument has to be able to answer about itself: if refining the sweep moves the number, the
   coarse sweep was under-sampling the dune and any constant sized off it is too small. */
const GRID_NX = arg('nx', 13), GRID_NZ = arg('nz', 9);
/* QUALITY is a real domain for this measurement and not a convenience: `Terrain.INNER_STEP` is
   0.6 / 0.8 / 0.96 / 1.6 m for ultra / high / med / low, so the DRAWN dune is a different
   surface at each setting and a skirt sized on one of them can be short on another. Every
   quality is swept before the constant is chosen (§418.3: the input it could fail on). */
const QUALITY = (process.argv.find((v) => v.startsWith('--quality=')) || '--quality=high').slice(10);

const warnings = [];
const modules = new Map();
const engine = {
  quality: QUALITY, scene: new THREE.Scene(), debug: {}, stats: {}, warnings,
  warn: (m) => warnings.push(String(m)),
  get: (k) => modules.get(k) || null,
  has: (k) => modules.has(k),
  on: () => () => {}, emit: () => {}, registerCollider: () => {},
};

const { Terrain } = await import('../src/world/Terrain.js');
const terrain = new Terrain(engine);
await terrain.init();
modules.set('terrain', terrain);

/* ARCHITECTURE is built too, and not for decoration: candidate 1 is "the statues stand on
   architecture and `heightAt` is answering about sand". That cannot be ruled out in a harness
   where the architecture does not exist (Terrain.js' own note: a probe in a world with a hole
   in it answers confidently). If it fails to build the run says so and candidate 1 stays open
   rather than being quietly closed. */
let archOk = false, archErr = '';
try {
  const { Architecture } = await import('../src/world/Architecture.js');
  const architecture = new Architecture(engine);
  await architecture.init();
  modules.set('architecture', architecture);
  archOk = true;
} catch (e) { archErr = e?.message || String(e); }

/* KAYKIT and SMASHABLES are built when they can be, for one reason only: the deeper base
   course is new solid volume, and "does it now intersect something" cannot be answered in a
   world that does not contain the things it might intersect. `primeKayKitAssets` is the same
   seam `tests/decalstat.test.mjs` uses. If either fails to boot the run says so and the
   interpenetration census is reported as partial rather than as clean. */
const { Props, SPHINX_BASE } = await import('../src/world/Props.js');
const { Bag } = await import('../src/world/PropKit.js');
const props = new Props(engine);

/* The placement MATRIX, captured rather than reconstructed.
   Recovering the scale from the placed bag's own bounding box looked exact and is not: the base
   course carries ±0.035 m of corner jitter and a 0.10 m chamfer, so `dz / 2.56` misses the true
   `s` by up to 1.8 %. Harmless while it multiplied a 0.65 m pedestal — 1 cm — and it grew to
   3.6 cm the moment the pedestal became 2.65 m, which showed up as the plinth foot appearing to
   MOVE between two arms in which it provably cannot. `Bag.transform` is the one call every
   placement goes through, so the matrix is taken from there and decomposed. */
const _xf = new WeakMap();
const origXform = Bag.prototype.transform;
Bag.prototype.transform = function (m) { if (m?.isMatrix4) _xf.set(this, m.clone()); return origXform.call(this, m); };

/* Intercept the shipped build. `_absorb` is the single funnel every placed bag goes through. */
const seen = [];
const origAbsorb = props._absorb.bind(props);
props._absorb = (bag) => {
  if (bag?.parts?.length) {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    let n = 0;
    for (const p of bag.parts) {
      const pos = p.geo?.attributes?.position;
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) { box.expandByPoint(v.fromBufferAttribute(pos, i)); n++; }
    }
    if (n) {
      const m = _xf.get(bag);
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
      if (m) m.decompose(pos, quat, scl);
      seen.push({ box, verts: n, place: m ? pos.clone() : null, s: m ? scl.y : NaN });
    }
  }
  return origAbsorb(bag);
};
await props.init();
modules.set('props', props);

let extraOk = [], extraErr = [];
for (const [key, mod, name] of [['kaykit', '../src/world/KayKit.js', 'KayKit'],
                                ['smashables', '../src/world/Smashables.js', 'Smashables']]) {
  try {
    if (key === 'kaykit') {
      const { primeKayKitAssets } = await import('../tests/_kaykitboot.mjs');
      primeKayKitAssets();
    }
    const M = (await import(mod))[name];
    const inst = new M(engine);
    await inst.init();
    modules.set(key, inst);
    extraOk.push(key);
  } catch (e) { extraErr.push(`${key}: ${e?.message || e}`); }
}

const L_X = 7, L_Z = [40, 46.3, 52.6, 58.9, 65.2, 71.5, 77.8, 84];
const avenue = seen.filter((s) => {
  const cx = (s.box.min.x + s.box.max.x) / 2, cz = (s.box.min.z + s.box.max.z) / 2;
  return Math.abs(Math.abs(cx) - L_X) < 1.5 && L_Z.some((z) => Math.abs(cz - z) < 1.2);
});

/* ── the drawn surface ───────────────────────────────────────────────────────────────────── */
const ray = new THREE.Raycaster();
ray.far = 400;
const DOWN = new THREE.Vector3(0, -1, 0);
const propMeshes = new Set();
props.group.traverse((o) => { if (o.isMesh) propMeshes.add(o); });
const targets = [];
let excludedProxy = 0;
engine.scene.updateMatrixWorld(true);
engine.scene.traverse((o) => {
  if (!o.isMesh || !o.geometry?.attributes?.position) return;
  if (propMeshes.has(o)) return;                      // the statues are not their own ground
  /* Invisible COLLISION proxies are not the picture, and this run found one: `proxy:wall`
     sits 6 mm under `arch:court:sandstone_block` and a ray that admits it reports the
     collider's opinion while claiming to report the art's. Excluded by `visible === false`
     rather than by name, so a proxy nobody thought to name is excluded too. */
  if (o.visible === false || /^proxy:/.test(o.name) || o.name === 'sand_collision') { excludedProxy++; return; }
  targets.push(o);
});
const tri = (m) => ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) | 0;
const census = targets.map((m) => `${m.name || m.type}(${tri(m)})`);
const hasGround = targets.some((m) => m.name === 'sand_ring0');

/**
 * Every rendered hit under (x, z), highest first.
 *
 * §697's second instrument fault, repeated here and caught the same way: "the topmost
 * up-facing rendered surface" is NOT the surface a body rests on — at (7, 58.9) the sphinx's
 * base tucks under a courtyard wall whose top is 2.0 m above the sand, and a first-hit probe
 * reported that wall as the ground and the statue as 2.1 m UNDERGROUND. The reference has to
 * be taken relative to the SUBJECT, so callers pass a ceiling and anything above it is named
 * as an overhang instead of silently becoming the floor.
 */
function hitsAt(x, z) {
  ray.set(new THREE.Vector3(x, 120, z), DOWN);
  return ray.intersectObjects(targets, false);
}
/**
 * The DRAWN SAND under (x, z) — the highest hit on a render ring, and nothing else.
 *
 * The owner's words are "above the ground", and on this avenue the ground is sand at every one
 * of the sixteen stations (proved in the centre table: `standing on` reads `sand_ring0` 16/16).
 * Naming the reference surface rather than taking "whatever is topmost" is what makes the
 * number mean one thing: `nearby` separately reports any NON-sand drawn surface within the
 * statue's own vertical span, so architecture over or under the base is named (§442) instead
 * of quietly becoming, or hiding, the floor.
 */
function drawnAt(x, z, ceil = Infinity) {
  const hits = hitsAt(x, z);
  const s = hits.find((q) => /^sand_ring/.test(q.object.name));
  const near = hits.filter((q) => !/^sand_ring/.test(q.object.name)
    && q.point.y <= ceil + 3 && q.point.y >= (s ? s.point.y - 3 : -Infinity));
  return {
    y: s ? s.point.y : NaN,
    what: s ? s.object.name : '-',
    over: hits.filter((q) => q.point.y > ceil + 1e-4).length,
    near: near.length ? (near[0].object.name || near[0].object.type) : '',
  };
}
/** The estimator under test, factored so the controls run through the SAME code as the statues. */
function gapAt(x, z, bottomY, ceil = Infinity) {
  const d = drawnAt(x, z, ceil);
  return { drawn: d.y, what: d.what, over: d.over, near: d.near, gap: bottomY - d.y };
}

/* ── controls ────────────────────────────────────────────────────────────────────────────── */
const surf = drawnAt(L_X, 65.2);
const ctlNeg = gapAt(L_X, 65.2, surf.y);
const ctlPos = gapAt(L_X, 65.2, surf.y + 0.5);
const ctlOk = Math.abs(ctlNeg.gap) < 1e-6 && Math.abs(ctlPos.gap - 0.5) < 1e-6;

console.log(`modules: terrain ok · architecture ${archOk ? 'ok' : `FAILED (${archErr})`} · props ok`
  + ` · ${extraOk.join(' ') || 'no extras'}${extraErr.length ? ` · FAILED ${extraErr.join('; ')}` : ''}`);
console.log(`ray targets: ${targets.length} meshes (${propMeshes.size} PROPS + ${excludedProxy} invisible/proxy excluded), sand_ring0 ${hasGround ? 'PRESENT' : 'MISSING — VOID'}`);
console.log(`  ${census.slice(0, 12).join(' ')}${census.length > 12 ? ` … +${census.length - 12}` : ''}`);
console.log(`controls: flush ${ctlNeg.gap.toFixed(6)} (want 0) · lifted-0.5 ${ctlPos.gap.toFixed(6)} (want 0.5) → ${ctlOk ? 'OK' : 'FAILED — VOID'}`);
console.log(`avenue bags intercepted: ${avenue.length} (want 16)   quality: ${QUALITY}   arm: ${ARM || 'shipped'} → SPHINX_BASE='${SPHINX_BASE}'`);
if (!hasGround || !ctlOk || avenue.length !== 16) { console.log('VOID'); process.exit(2); }

/* ── per statue, per corner ──────────────────────────────────────────────────────────────── */
/* The base course's depth is read from the module under test and resolved through the SAME
   arm the module resolved, so `placeY` (local y 0 — the plinth foot) stays correct in every
   arm. A tool that assumed 0.65 here would put the animal 2 m from where it is. */
const SKIRT = SPHINX_BASE === 'skirt' ? Props.AVENUE_SKIRT : 0;
const PEDESTAL = Props.AVENUE_PEDESTAL + SKIRT;
const BASE_HX = 1.28;                 // Statues.sphinx base course, local half-width in x
const BODY_LOCAL = 0.84;              // the lofted body's `y0`: below this is plinth, not animal
const rows = [];
for (const s of avenue) {
  const cx = (s.box.min.x + s.box.max.x) / 2, cz = (s.box.min.z + s.box.max.z) / 2;
  const x = Math.sign(cx) * L_X;
  const z = L_Z.reduce((a, b) => (Math.abs(b - cz) < Math.abs(a - cz) ? b : a));
  /* Scale and placement come from the bag's own composed matrix (see the `Bag.transform` hook
     above), so `placeY` is the local y = 0 the frame actually used and not a back-computation
     from a jittered bounding box. */
  const scale = s.s;
  const bottom = s.box.min.y;
  const placeY = s.place ? s.place.y : bottom + PEDESTAL * scale;   // local y 0 in world
  const ceil = placeY + 0.04 * scale;                     // the base course's own top face
  const corners = [
    { tag: 'x−z−', wx: s.box.min.x, wz: s.box.min.z },
    { tag: 'x−z+', wx: s.box.min.x, wz: s.box.max.z },
    { tag: 'x+z−', wx: s.box.max.x, wz: s.box.min.z },
    { tag: 'x+z+', wx: s.box.max.x, wz: s.box.max.z },
  ].map((c) => ({ ...c, ...gapAt(c.wx, c.wz, bottom, ceil), h: terrain.heightAt(c.wx, c.wz) }));
  const q = gapAt(x, z, bottom, ceil);
  /* Four corners are not the footprint. A dune crest crossing the middle of an edge, or a
     `sphinxDrift` mound peaking inside the rectangle, is invisible to a corner sample and is
     exactly the thing that decides how deep a skirt has to be — so the whole rectangle is
     swept. NX x NZ over the placed bag's own xz box, drawn surface AND query at each node. */
  const NX = GRID_NX, NZ = GRID_NZ;
  let gridMaxGap = -Infinity, gridMinGap = Infinity, gridMaxSand = -Infinity, gridMinSand = Infinity;
  let gridMaxQ = -Infinity, gridMinQ = Infinity, worstAt = null, offSurface = 0, overhang = 0, nearArch = '';
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const wx = s.box.min.x + (s.box.max.x - s.box.min.x) * (i / (NX - 1));
      const wz = s.box.min.z + (s.box.max.z - s.box.min.z) * (j / (NZ - 1));
      const d = drawnAt(wx, wz, ceil);
      if (d.over) overhang++;
      if (d.near) nearArch = d.near;
      if (!Number.isFinite(d.y)) { offSurface++; continue; }
      const g = bottom - d.y;
      if (g > gridMaxGap) { gridMaxGap = g; worstAt = [wx, wz, d.what]; }
      gridMinGap = Math.min(gridMinGap, g);
      gridMaxSand = Math.max(gridMaxSand, d.y);
      gridMinSand = Math.min(gridMinSand, d.y);
      const hq = terrain.heightAt(wx, wz);
      gridMaxQ = Math.max(gridMaxQ, hq); gridMinQ = Math.min(gridMinQ, hq);
    }
  }
  const n = terrain.normalAt(x, z, new THREE.Vector3());
  const slope = Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
  const fall = Math.atan2(n.x, n.z) * 180 / Math.PI;      // downhill bearing, deg from +z
  rows.push({
    x, z, scale, bottom, top: s.box.max.y, placeY,
    dimX: s.box.max.x - s.box.min.x, dimZ: s.box.max.z - s.box.min.z,
    plinthFoot: placeY, bodyFoot: placeY + BODY_LOCAL * scale,
    hCentre: terrain.heightAt(x, z), drawnCentre: q.drawn, what: q.what, gapCentre: q.gap,
    corners, slope, fall, offSurface, overhang, nearArch, worstAt,
    maxSand: gridMaxSand, minSand: gridMinSand, qSpread: gridMaxQ - gridMinQ,
    maxGap: gridMaxGap, minGap: gridMinGap,
    /* The skirt this statue needs: how much deeper the base course must reach, in LOCAL units,
       to put its underside at or below the lowest drawn sand anywhere under its footprint. */
    needSkirt: gridMaxGap / scale,
  });
}
rows.sort((a, b) => a.z - b.z || a.x - b.x);

console.log('\n── the query vs the picture, at each statue centre ──');
console.log('    x      z   heightAt    drawn   Q−D   baseBottom  gap@ctr  slope  fall→  standing on');
for (const r of rows) {
  console.log(
    `${r.x.toFixed(0).padStart(5)} ${r.z.toFixed(1).padStart(6)} ${r.hCentre.toFixed(3).padStart(10)} ` +
    `${r.drawnCentre.toFixed(3).padStart(8)} ${(r.hCentre - r.drawnCentre).toFixed(3).padStart(6)} ` +
    `${r.bottom.toFixed(3).padStart(12)} ${r.gapCentre.toFixed(3).padStart(8)} ` +
    `${r.slope.toFixed(1).padStart(6)} ${r.fall.toFixed(0).padStart(6)}  ${r.what}`
  );
}

console.log('\n── per BASE CORNER, then over the WHOLE footprint (NX×NZ): gap = base bottom − DRAWN sand ──');
console.log('    x      z     x−z−    x−z+    x+z−    x+z+   centre | grid WORST  deepest   skirt   base w×l  sand-over-base  non-sand nearby');
for (const r of rows) {
  console.log(
    `${r.x.toFixed(0).padStart(5)} ${r.z.toFixed(1).padStart(6)} ` +
    r.corners.map((c) => c.gap.toFixed(3).padStart(7)).join(' ') +
    ` ${r.gapCentre.toFixed(3).padStart(7)} | ${r.maxGap.toFixed(3).padStart(10)} ${r.minGap.toFixed(3).padStart(8)}` +
    ` ${r.needSkirt.toFixed(3).padStart(7)}  ${r.dimZ.toFixed(2)}×${r.dimX.toFixed(2)}  ${String(r.overhang).padStart(4)}  ${r.nearArch || '—'}`
  );
}

const worst = rows.reduce((a, b) => (b.maxGap > a.maxGap ? b : a));
const deepest = rows.reduce((a, b) => (b.minGap < a.minGap ? b : a));
console.log(`\nWORST floating corner   ${worst.maxGap.toFixed(3)} m at (${worst.x}, ${worst.z})`);
console.log(`DEEPEST buried corner  ${deepest.minGap.toFixed(3)} m at (${deepest.x}, ${deepest.z})`);
console.log(`corners floating > 5 mm: ${rows.reduce((n, r) => n + r.corners.filter((c) => c.gap > 0.005).length, 0)}/${rows.length * 4}` +
  `   statues with any: ${rows.filter((r) => r.maxGap > 0.005).length}/${rows.length}`);
console.log(`|heightAt − drawn| at centre: max ${Math.max(...rows.map((r) => Math.abs(r.hCentre - r.drawnCentre))).toFixed(3)} m` +
  `, mean ${(rows.reduce((s, r) => s + Math.abs(r.hCentre - r.drawnCentre), 0) / rows.length).toFixed(3)} m`);
console.log(`DEEPEST SKIRT REQUIRED (local units, worst statue): ${Math.max(...rows.map((r) => r.needSkirt)).toFixed(3)} m` +
  `   [scales: ${Math.min(...rows.map((r) => r.scale)).toFixed(4)}…${Math.max(...rows.map((r) => r.scale)).toFixed(4)}]`);
console.log(`terrain height spread WITHIN one base footprint: ${Math.min(...rows.map((r) => r.qSpread)).toFixed(2)}…${Math.max(...rows.map((r) => r.qSpread)).toFixed(2)} m` +
  ` (the base is ${rows[0].dimZ.toFixed(2)} m along the fall line)`);

/* ── what the sink costs at the uphill end ───────────────────────────────────────────────── */
console.log('\n── burial at the uphill end: how deep the stone and the ANIMAL go under sand ──');
console.log('    x      z  plinthFoot  bodyFoot  highest sand  plinth buried  BODY buried');
for (const r of rows) {
  console.log(
    `${r.x.toFixed(0).padStart(5)} ${r.z.toFixed(1).padStart(6)} ${r.plinthFoot.toFixed(3).padStart(11)} ` +
    `${r.bodyFoot.toFixed(3).padStart(9)} ${r.maxSand.toFixed(3).padStart(13)} ` +
    `${Math.max(0, r.maxSand - r.plinthFoot).toFixed(3).padStart(14)} ${Math.max(0, r.maxSand - r.bodyFoot).toFixed(3).padStart(12)}`
  );
}
console.log(`max plinth burial ${Math.max(...rows.map((r) => Math.max(0, r.maxSand - r.plinthFoot))).toFixed(3)} m` +
  ` · max BODY burial ${Math.max(...rows.map((r) => Math.max(0, r.maxSand - r.bodyFoot))).toFixed(3)} m`);

/* ── interpenetration: does the deeper course now sit INSIDE anything? (§732's shape) ────── */
/* The deeper base is new solid volume, and the honest way to ask whether it collides with
   something is to ask the scene, not the author. Every rendered surface hit inside the block's
   own vertical span [bottom, top] over its own footprint is a candidate; sand is excluded only
   because being inside the sand is the entire purpose. The census is per statue and it prints
   the empty case explicitly, because "no output" and "nothing found" have to look different. */
console.log('\n── interpenetration census: rendered NON-SAND surfaces inside each base block ──');
let hitsTotal = 0;
for (const r of rows) {
  const s = avenue.find((a) => Math.sign((a.box.min.x + a.box.max.x) / 2) * L_X === r.x
    && Math.abs((a.box.min.z + a.box.max.z) / 2 - r.z) < 1.2);
  const top = r.placeY + 0.04 * r.scale;
  const found = new Map();
  let nodes = 0;
  const ext = new THREE.Box3();
  const NI = 25, NJ = 17;
  for (let i = 0; i < NI; i++) {
    for (let j = 0; j < NJ; j++) {
      const wx = s.box.min.x + (s.box.max.x - s.box.min.x) * (i / (NI - 1));
      const wz = s.box.min.z + (s.box.max.z - s.box.min.z) * (j / (NJ - 1));
      let any = false;
      for (const h of hitsAt(wx, wz)) {
        if (/^sand_ring/.test(h.object.name)) continue;
        if (h.point.y < r.bottom - 1e-4 || h.point.y > top + 1e-4) continue;
        found.set(h.object.name || h.object.type, (found.get(h.object.name || h.object.type) || 0) + 1);
        any = true;
      }
      if (any) { nodes++; ext.expandByPoint(new THREE.Vector3(wx, 0, wz)); }
    }
  }
  hitsTotal += nodes;
  if (found.size) {
    console.log(`${r.x.toFixed(0).padStart(5)} ${r.z.toFixed(1).padStart(6)}  ${nodes}/${NI * NJ} nodes` +
      `  over x ${ext.min.x.toFixed(2)}…${ext.max.x.toFixed(2)}, z ${ext.min.z.toFixed(2)}…${ext.max.z.toFixed(2)}` +
      `  (${((ext.max.x - ext.min.x) * (ext.max.z - ext.min.z)).toFixed(2)} m² of ${((s.box.max.x - s.box.min.x) * (s.box.max.z - s.box.min.z)).toFixed(2)})` +
      `  — ${[...found].map(([k, n]) => `${k} x${n}`).join(', ')}`);
  }
}
console.log(hitsTotal === 0
  ? `CLEAN — 0 of ${rows.length * 425} footprint nodes meet a non-sand surface inside a base block`
  : `${hitsTotal} of ${rows.length * 425} footprint nodes meet one — see the rows above, and compare `
    + `against \`--arm=flat\` before attributing any of it to the skirt`);

const jsonArg = process.argv.find((v) => v.startsWith('--json='));
if (jsonArg) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(jsonArg.slice(7), JSON.stringify(rows, null, 1));
  console.log(`\nwrote ${jsonArg.slice(7)}`);
}

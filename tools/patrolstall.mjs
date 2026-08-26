/**
 * patrolstall — "four of nine guards cannot patrol", measured, and the blocker NAMED.
 *
 * `tests/patrol.test.mjs` builds `Architecture` alone and walks the routes through its
 * colliders. Nothing else in the level is in that oracle, so the suite is green while the
 * garrison stands still. This probe runs the **shipped boot** — Architecture, Props, KayKit,
 * Collision, Guards, all of it — and asks a different question: not "is the route clear of
 * masonry" but "did this body move".
 *
 * ── What has to be discriminated, and how ─────────────────────────────────────────────────
 * "Stalled" has at least four causes that look identical from outside:
 *
 *   1. a prop (or a prop's collider) standing on the route,
 *   2. a waypoint authored inside geometry,
 *   3. a step the guard refuses — past `stepUp` up or `stepDown` down,
 *   4. two guards jammed against each other.
 *
 * `Guard._step` fails in exactly two places and they separate 1/2 from 3: it returns false
 * when the forward rays clamp `allowed` to zero (**blocked**), and when `groundCheck` finds no
 * floor under the next footfall while `hadGround` is set (**nofloor**). This probe replays both
 * branches at every sample, in the guard's own travel direction, and records which one fired
 * plus the `rec.mesh.name` and tag of whatever the ray hit. Cause 4 is separated by carrying the
 * nearest-other-guard distance on every sample: guards are not in the collision BVH at all, so
 * a guard-vs-guard jam would have to show up as two bodies inside each other's radius with no
 * collider hit, and that combination is reported explicitly rather than inferred.
 *
 * ── §439/§440: not the same query the guard uses ─────────────────────────────────────────
 * The branch replay above IS the guard's own query, deliberately — it is the only thing that
 * can say *why `_step` returned false*. It cannot falsify "the collider is in the wrong place",
 * because it shares the collider with the subject. So beside it runs a second, independent
 * instrument, the one §697's guard lane used: a `THREE.Raycaster` fired along the same direction
 * at the **drawn scene**, characters and shells and volumes removed. Where the two agree, there
 * is a real object in the way. Where COLLISION reports a blocker and the render shows nothing,
 * the collider and the art have come apart — which this level is already known to do in the
 * other direction (§697, §701.10).
 *
 * These are not the same geometry for KayKit: `KayKit._collider` builds a separate invisible
 * `kaykit:solid` box per item while the art is one merged `kaykit:props` mesh. For `Props` they
 * ARE the same object — `Props._flushBuckets` registers the visible merged mesh itself — so
 * agreement there is expected and proves only that the mesh is where it says it is.
 *
 * ── §435.4: every sample is walked, never teleported ─────────────────────────────────────
 * The garrison is driven with `guards.update(dt)` — the shipped frame path — from spawn, and
 * sampled as it passes. A guard assigned a `u` carries a `hadGround` and a route-baseY fallback
 * a walked guard does not, which is exactly the state that fakes or hides a stall. Nobody here
 * is placed anywhere.
 *
 * ── Naming the blocker ───────────────────────────────────────────────────────────────────
 * `Props` merges every solid prop of a material into ONE collider, so `rec.mesh.name` is
 * `props_stone` and identifies nothing. Two extra passes fix that: for a KayKit hit, the
 * individual `kaykit:solid` box nearest the hit point is reported with its size and centre; for
 * a Props hit, the merged mesh's own triangles within 1.2 m of the hit are gathered into a local
 * AABB, so the answer is "a 0.62 × 1.05 × 0.62 m stone object centred at (x, y, z)" — which is a
 * prop, identifiable in `Props.js`, rather than a bucket name.
 *
 *   node tools/patrolstall.mjs [--seconds 200] [--every 0.5] [--query ...] [--out FILE]
 */
import { withGame } from './harness.mjs';
import fs from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d;
};
const SECONDS = arg('--seconds', 200);
const EVERY = arg('--every', 0.5);
const QUERY = (() => {
  const i = process.argv.indexOf('--query');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '';
})();
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/patrolstall.json';

const out = await withGame({ width: 640, height: 360, quality: 'low', query: QUERY }, async ({ page }) => {
  page.setDefaultTimeout(0);
  return page.evaluate(async ([seconds, every]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Raycaster) break; } catch { THREE = null; }
    }
    if (!THREE?.Raycaster) return { error: 'could not load THREE in page' };

    const engine = window.__ENGINE;
    const guards = engine.get('guards');
    const col = engine.get('collision');
    const scene = engine.scene;
    if (!guards?.guards?.length) return { error: 'no guards' };
    if (!col) return { error: 'no collision' };

    /* Which modules actually registered collision, so "props are in the oracle" is a fact about
       this boot and not an assumption about the manifest. */
    const modules = { props: !!engine.get('props'), kaykit: !!engine.get('kaykit'),
                      architecture: !!engine.get('architecture'), smashables: !!engine.get('smashables'),
                      pickups: !!engine.get('pickups') };

    /* Census of every registered collider, by name — this is the set patrol.test.mjs does NOT
       have, and printing it is how "the test's oracle is short by N boxes" stops being a claim. */
    const recs = col._recs || col.recs || col.records || [];
    const census = new Map();
    const kaykitBoxes = [];
    for (const rec of recs) {
      const m = rec?.mesh; if (!m) continue;
      const k = `${m.name || '(unnamed)'}|${rec.tag}`;
      census.set(k, (census.get(k) || 0) + 1);
      if ((m.name || '') === 'kaykit:solid') {
        m.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(m);
        kaykitBoxes.push({ min: b.min.clone(), max: b.max.clone(),
                           c: b.getCenter(new THREE.Vector3()), s: b.getSize(new THREE.Vector3()) });
      }
    }

    /* ---- instrument B: the DRAWN scene, everything that is not world removed --------------
       Same construction as tools/guardfloat.mjs's instrument B, and deliberately so: it is the
       independent check that lane already validated. */
    const guardRoots = new Set(guards.guards.map((g) => g.root));
    const SKIP = /guard|sly|cone|beam|pool|particle|trail|decal|sky|debug|outline|alert|hud|mark|cane/i;
    const targets = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      for (let p = o; p; p = p.parent) {
        if (!p.visible) return;
        if (guardRoots.has(p)) return;
        if (SKIP.test(p.name || '')) return;
        if (p.userData?.slyOutline || p.userData?.isOutlineShell) return;
      }
      const m = o.material;
      const one = Array.isArray(m) ? m[0] : m;
      if (one?.transparent && one?.depthWrite === false) return;
      targets.push(o);
    });

    const rc = new THREE.Raycaster();
    const _o = new THREE.Vector3(), _d = new THREE.Vector3();
    /** Nearest DRAWN surface along a ray. Independent of COLLISION. */
    function drawnAlong(x, y, z, dx, dz, far) {
      _o.set(x, y, z); _d.set(dx, 0, dz).normalize();
      rc.set(_o, _d); rc.near = 0; rc.far = far;
      let hits = [];
      try { hits = rc.intersectObjects(targets, false); } catch (e) { return { err: e.message }; }
      if (!hits.length) return null;
      const h = hits[0];
      return { d: +h.distance.toFixed(3), name: h.object.name || '(unnamed)',
               p: [+h.point.x.toFixed(3), +h.point.y.toFixed(3), +h.point.z.toFixed(3)] };
    }

    /** The collider hit along a ray, with the record named. The guard's own query. */
    function colAlong(x, y, z, dx, dz, far, opts) {
      _o.set(x, y, z); _d.set(dx, 0, dz).normalize();
      let r = null;
      try { r = col.raycast(_o, _d, far, opts); } catch { r = null; }
      if (!r?.hit) return null;
      return { d: +r.distance.toFixed(3), tag: r.tag, mat: r.material,
               rec: r.rec?.mesh?.name || '(rec?)',
               p: [+r.point.x.toFixed(3), +r.point.y.toFixed(3), +r.point.z.toFixed(3)],
               n: [+r.normal.x.toFixed(2), +r.normal.y.toFixed(2), +r.normal.z.toFixed(2)] };
    }

    /**
     * Turn a hit on a MERGED prop mesh into one object: the local AABB of that mesh's own
     * triangles within `rad` of the hit point. `props_stone` names a bucket; this names a thing.
     */
    const _va = new THREE.Vector3();
    function islandAt(meshName, px, py, pz, rad = 1.2) {
      let mesh = null;
      scene.traverse((o) => { if (!mesh && o.isMesh && o.name === meshName) mesh = o; });
      if (!mesh?.geometry?.attributes?.position) return null;
      mesh.updateMatrixWorld(true);
      const pos = mesh.geometry.attributes.position;
      const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
      const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      let n = 0;
      const r2 = rad * rad;
      for (let i = 0; i < pos.count; i++) {
        _va.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const dx = _va.x - px, dy = _va.y - py, dz = _va.z - pz;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        lo.min(_va); hi.max(_va); n++;
      }
      if (!n) return null;
      return { verts: n,
               min: [+lo.x.toFixed(3), +lo.y.toFixed(3), +lo.z.toFixed(3)],
               max: [+hi.x.toFixed(3), +hi.y.toFixed(3), +hi.z.toFixed(3)],
               size: [+(hi.x - lo.x).toFixed(3), +(hi.y - lo.y).toFixed(3), +(hi.z - lo.z).toFixed(3)],
               centre: [+((lo.x + hi.x) / 2).toFixed(3), +((lo.y + hi.y) / 2).toFixed(3),
                        +((lo.z + hi.z) / 2).toFixed(3)] };
    }

    /** The individual KayKit box nearest a point — the crate, not the bucket. */
    function kaykitNear(px, py, pz) {
      let best = null, bd = Infinity;
      for (const b of kaykitBoxes) {
        const cx = Math.min(Math.max(px, b.min.x), b.max.x);
        const cy = Math.min(Math.max(py, b.min.y), b.max.y);
        const cz = Math.min(Math.max(pz, b.min.z), b.max.z);
        const d = Math.hypot(px - cx, py - cy, pz - cz);
        if (d < bd) { bd = d; best = b; }
      }
      if (!best) return null;
      return { d: +bd.toFixed(3),
               centre: [+best.c.x.toFixed(3), +best.c.y.toFixed(3), +best.c.z.toFixed(3)],
               size: [+best.s.x.toFixed(3), +best.s.y.toFixed(3), +best.s.z.toFixed(3)] };
    }

    /* ---- park the player: the routes are the subject, not a chase ------------------------- */
    const mv = engine.get('movement');
    const parked = mv?.position ? mv.position.clone() : null;
    if (mv?.position) mv.position.set(600, 0, 600);

    const RAY_OPTS = { ignoreTags: ['hazard', 'water', 'rail', 'hook', 'spire', 'vent'] };
    /* The SHIPPED tune, read from the module the guards themselves run on — not retyped here,
       which is how a probe ends up measuring a threshold the subject does not use. */
    let TUNE = {};
    try { TUNE = (await import('/src/ai/Guard.js')).GUARD_TUNE || {}; } catch { TUNE = {}; }
    const STEP_UP = TUNE.stepUp ?? 0.85;
    const STEP_DOWN = TUNE.stepDown ?? 1.05;
    const CHEST = TUNE.chestY || { temple: 1.15, heavy: 1.35, scarab: 0.34 };

    const _gp = new THREE.Vector3();
    /**
     * Replay `Guard._step`'s two decisions at this instant, in the guard's travel direction.
     * Returns which branch would fire, and what the blocking ray hit.
     */
    function branchOf(g) {
      const tgt = g._routePoint;
      if (!tgt) return { branch: '?' };
      const dx = tgt.x - g.position.x, dz = tgt.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-4) return { branch: 'arrived' };
      const ux = dx / dist, uz = dz / dist;
      const maxSpeed = 1.55;
      let allowed = Math.min(dist, maxSpeed / 60);
      const probe = allowed + g.radius;
      let worst = null;
      for (let i = 0; i < 2; i++) {
        const y = g.position.y + (i === 0 ? g.radius * 0.9 : (CHEST[g.type] ?? 1.15));
        const h = colAlong(g.position.x, y, g.position.z, ux, uz, probe, RAY_OPTS);
        if (h) {
          const a = Math.max(0, h.d - g.radius);
          if (a < allowed) { allowed = a; worst = { ...h, ray: i === 0 ? 'low' : 'chest' }; }
        }
      }
      if (allowed <= 1e-5) return { branch: 'blocked', hit: worst, dir: [+ux.toFixed(3), +uz.toFixed(3)] };
      const nx = g.position.x + ux * allowed, nz = g.position.z + uz * allowed;
      let gr = null;
      try {
        _gp.set(nx, g.position.y + STEP_UP, nz);
        gr = col.groundCheck(_gp, g.groundProbe ?? g.radius * 0.7, STEP_UP + STEP_DOWN);
      } catch { gr = null; }
      const slopeDeg = gr?.hit ? gr.slope * 180 / Math.PI : null;
      const floor = !!gr?.hit && !(TUNE.groundSlopeMax > 0 && Number.isFinite(gr.slope)
                                   && gr.slope > TUNE.groundSlopeMax * Math.PI / 180);
      if (!floor && g.hadGround) {
        return { branch: 'nofloor', dir: [+ux.toFixed(3), +uz.toFixed(3)],
                 ground: gr?.hit ? { y: +gr.y.toFixed(3), tag: gr.tag, rec: gr.rec?.mesh?.name || '(rec?)',
                                     slope: +slopeDeg.toFixed(1) } : null,
                 step: gr?.hit ? +(gr.y - g.position.y).toFixed(3) : null };
      }
      return { branch: 'moving', allowed: +allowed.toFixed(4) };
    }

    /* ---- walk the garrison ---------------------------------------------------------------- */
    const dt = 1 / 60;
    const frames = Math.round(seconds / dt);
    const everyN = Math.max(1, Math.round(every / dt));
    const rows = guards.guards.map((g) => ({
      id: g.id, index: g.index, type: g.type, route: g.route.name, radius: g.radius,
      baseY: g.route.baseY, space: g.route.space, routeLen: +g.route.length.toFixed(2),
      spawn: [+g.position.x.toFixed(3), +g.position.y.toFixed(3), +g.position.z.toFixed(3)],
      spawnU: +g.u.toFixed(4),
      dist: 0, _last: g.position.clone(), samples: [],
    }));

    let t = 0;
    for (let f = 0; f < frames; f++) {
      t += dt;
      try { guards.update(dt, t); } catch (e) { return { error: 'guards.update threw: ' + e.message }; }
      for (let i = 0; i < guards.guards.length; i++) {
        const g = guards.guards[i], r = rows[i];
        r.dist += g.position.distanceTo(r._last);
        r._last.copy(g.position);
      }
      if (f % everyN) continue;
      for (let i = 0; i < guards.guards.length; i++) {
        const g = guards.guards[i], p = g.position;
        // nearest OTHER guard — cause 4's only signature, carried on every sample
        let nn = Infinity, nnId = null;
        for (let j = 0; j < guards.guards.length; j++) {
          if (j === i) continue;
          const d = p.distanceTo(guards.guards[j].position);
          if (d < nn) { nn = d; nnId = guards.guards[j].id; }
        }
        const br = branchOf(g);
        rows[i].samples.push({
          t: +t.toFixed(2), u: +g.u.toFixed(4), state: g.state, spd: +g.speed.toFixed(3),
          dwell: +(g.dwell ?? 0).toFixed(2), off: +(g._offRoute ?? 0).toFixed(3),
          hadGround: !!g.hadGround, dist: +rows[i].dist.toFixed(2),
          x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
          nn: +nn.toFixed(2), nnId, ...br,
        });
      }
    }

    /* ---- for each guard: the longest window with no progress, fully worked up ------------- */
    for (const r of rows) {
      delete r._last;
      const S = r.samples;
      // longest run of consecutive samples whose position moved < 5 cm from the run's start
      let bi = 0, bl = 0, i = 0;
      while (i < S.length) {
        let j = i + 1;
        while (j < S.length
               && Math.hypot(S[j].x - S[i].x, S[j].z - S[i].z) < 0.05) j++;
        if (j - i > bl) { bl = j - i; bi = i; }
        i = j > i + 1 ? j - 1 : i + 1;
      }
      r.stillFrom = S[bi]?.t ?? null;
      r.stillSec = +((bl - 1) * every).toFixed(1);
      const s = S[bi];
      r.still = s || null;
      // branch histogram over the whole run, and over the still window
      const hist = {}, histStill = {};
      S.forEach((q, k) => {
        hist[q.branch] = (hist[q.branch] || 0) + 1;
        if (k >= bi && k < bi + bl) histStill[q.branch] = (histStill[q.branch] || 0) + 1;
      });
      r.branches = hist; r.branchesStill = histStill;
      r.patrolPct = +(100 * S.filter((q) => q.state === 'patrol').length / S.length).toFixed(1);
      r.uSpan = +(Math.max(...S.map((q) => q.u)) - Math.min(...S.map((q) => q.u))).toFixed(3);
      r.minNN = +Math.min(...S.map((q) => q.nn)).toFixed(2);

      if (s && s.branch === 'blocked' && s.hit) {
        const [hx, hy, hz] = s.hit.p;
        r.blocker = {
          rec: s.hit.rec, tag: s.hit.tag, ray: s.hit.ray, at: s.hit.p, dist: s.hit.d,
          /* the independent instrument, same origin, same direction */
          drawn: drawnAlong(s.x, s.y + (s.hit.ray === 'low' ? r.radius * 0.9 : 1.15), s.z,
                            s.dir[0], s.dir[1], 4.0),
          island: /^props_/.test(s.hit.rec) ? islandAt(s.hit.rec, hx, hy, hz, 1.2) : null,
          kaykit: /kaykit/.test(s.hit.rec) ? kaykitNear(hx, hy, hz) : null,
        };
      } else if (s && s.branch === 'nofloor') {
        r.blocker = { branch: 'nofloor', ground: s.ground, step: s.step,
                      drawn: drawnAlong(s.x, s.y + 0.5, s.z, s.dir[0], s.dir[1], 4.0) };
      }
    }

    if (parked && mv?.position) mv.position.copy(parked);

    /* ---- controls (§418.3): a point known to be clear and one known to be inside stone ----- */
    const ctl = {
      openCourt: colAlong(0, 0.8, -8, 1, 0, 3.0, RAY_OPTS),
      openCourtDrawn: drawnAlong(0, 0.8, -8, 1, 0, 3.0),
      intoHallWall: colAlong(0, 1.2, -16.0, 0, -1, 4.0, RAY_OPTS),
      intoHallWallDrawn: drawnAlong(0, 1.2, -16.0, 0, -1, 4.0),
    };

    return { rows, ctl, modules, targetCount: targets.length,
             colliderCount: recs.length, kaykitBoxCount: kaykitBoxes.length,
             census: [...census.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n) };
  }, [SECONDS, EVERY]);
});

if (out.error) { console.log('ERROR: ' + out.error); process.exit(1); }

console.log(`\nmodules present: ${JSON.stringify(out.modules)}`);
console.log(`collision records: ${out.colliderCount}   kaykit:solid boxes: ${out.kaykitBoxCount}   drawn raycast targets: ${out.targetCount}`);
console.log('\ncollider census (name|tag -> count):');
for (const c of out.census.slice(0, 24)) console.log(`   ${String(c.n).padStart(5)}  ${c.k}`);

console.log('\ncontrol (§418.3) — a ray that must miss and a ray that must hit:');
console.log(`   open courtyard (0,0.8,-8)+x : collision ${JSON.stringify(out.ctl.openCourt)}`);
console.log(`                                 drawn     ${JSON.stringify(out.ctl.openCourtDrawn)}`);
console.log(`   into hall front (0,1.2,-16)-z: collision ${JSON.stringify(out.ctl.intoHallWall)}`);
console.log(`                                 drawn     ${JSON.stringify(out.ctl.intoHallWallDrawn)}`);

console.log(`\n=== ${SECONDS} s of patrol, sampled every ${EVERY} s — did the body move? ===`);
console.log('#  id       type   route            dist(m) route(m) uSpan patrol%  longest-still  minNN  branches');
for (const r of out.rows) {
  const b = Object.entries(r.branches).map(([k, n]) => `${k}:${n}`).join(' ');
  console.log(`${String(r.index).padEnd(2)} ${r.id.padEnd(8)} ${r.type.padEnd(6)} ${r.route.padEnd(16)} `
    + `${r.dist.toFixed(1).padStart(7)} ${r.routeLen.toFixed(1).padStart(7)} ${r.uSpan.toFixed(3).padStart(6)} `
    + `${String(r.patrolPct).padStart(6)}  ${String(r.stillSec).padStart(6)} s @ ${String(r.stillFrom).padStart(6)}s `
    + `${r.minNN.toFixed(2).padStart(6)}  ${b}`);
}

console.log('\n=== what each stalled body is jammed on ===');
for (const r of out.rows) {
  if (!r.blocker) continue;
  const s = r.still;
  console.log(`\n${r.id} (${r.type}, ${r.route}) still ${r.stillSec}s from t=${r.stillFrom}s`);
  console.log(`   at (${s.x}, ${s.y}, ${s.z})  u=${s.u} state=${s.state} off-route ${s.off} m  nearest other guard ${s.nn} m (${s.nnId})`);
  console.log(`   branches during the still window: ${JSON.stringify(r.branchesStill)}`);
  if (r.blocker.branch === 'nofloor') {
    console.log(`   REFUSED THE STEP: ground ${JSON.stringify(r.blocker.ground)}  step ${r.blocker.step} m`);
    console.log(`   drawn along travel: ${JSON.stringify(r.blocker.drawn)}`);
  } else {
    console.log(`   COLLISION blocker: "${r.blocker.rec}" tag=${r.blocker.tag} via the ${r.blocker.ray} ray at ${r.blocker.dist} m, hit ${JSON.stringify(r.blocker.at)}`);
    console.log(`   DRAWN along the same ray (independent): ${JSON.stringify(r.blocker.drawn)}`);
    if (r.blocker.island) console.log(`   the object, from the merged mesh's own triangles: size ${JSON.stringify(r.blocker.island.size)} centred ${JSON.stringify(r.blocker.island.centre)} (${r.blocker.island.verts} verts)`);
    if (r.blocker.kaykit) console.log(`   nearest kaykit:solid box: ${r.blocker.kaykit.d} m away, size ${JSON.stringify(r.blocker.kaykit.size)} centred ${JSON.stringify(r.blocker.kaykit.centre)}`);
  }
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\nfull record -> ${OUT}`);

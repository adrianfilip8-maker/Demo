/**
 * guardfloat — "the guards are floating rather than being on the ground", measured.
 *
 * The report is one sentence and the word "floating" has at least four different causes behind
 * it, each needing a different repair:
 *
 *   1. route waypoints authored at the wrong Y,
 *   2. a missing or broken ground snap,
 *   3. a *correct* snap onto a collider that is itself in the air (the guard is not floating —
 *      the world is),
 *   4. a foot-vs-origin offset, where a correct snap still hovers the model by a leg length.
 *
 * Separating 3 from the rest is the whole job, and it cannot be done with one instrument.
 * `Guard._step` snaps to `Collision.groundCheck`, so **asking `Collision` where the ground is
 * cannot falsify "the collider is in the wrong place"** — the instrument and the thing measured
 * share the assumption (KNOWN_ISSUES §439/§440). So this runs two:
 *
 *   A. `collision.groundCheck` — the BVH the guard actually snaps to, queried with the guard's
 *      own radius and span so it reports what `_step` saw, not what a friendlier probe sees.
 *   B. `THREE.Raycaster` straight down the **rendered scene graph**, guards and their ink shells
 *      and the cone/pool volumes excluded. ARCHITECTURE's collision proxies are separate,
 *      invisible meshes from the drawn ones, so this shares no geometry with A: `colY - rndY` is
 *      exactly "the collider disagrees with the picture" and nothing else.
 *
 * and a third column that is neither: the **lowest CPU-skinned foot vertex of the guard's own
 * body**, in world space, at the pose the frame would draw. That is where the boot sole actually
 * is, so `soleY - rndY` is the gap the player is complaining about in the units he sees it in,
 * and it is the only column that can see cause 4.
 *
 * ── §435.4: the guards WALK to every sample ─────────────────────────────────────────────────
 * No guard is ever teleported to a `u` and measured. The probe drives `Guards.update(dt)` — the
 * shipped frame path — and samples whoever is passing through. A guard placed at `u = 0.4` by
 * assignment carries a `hadGround` of false and a route-baseY fallback that a walked guard does
 * not, which is precisely the state that would fake a floating guard, or hide one.
 *
 *   node tools/guardfloat.mjs [--seconds 180] [--every 0.5]
 *
 * ── TWO FAULTS THIS FILE HAD, both in the instrument and not in the subject ───────────────
 * Recorded because a probe that has been wrong once is the only kind worth trusting, and
 * because both are the standing shape here: the instrument tests your model of the world, not
 * the world (§435.4/§439).
 *
 *   1. The sole column read 1e+189 m. `SkinnedMesh.applyBoneTransform(i, v)` is the GLSL
 *      `skinning_vertex` chunk verbatim — it expects the VERTEX POSITION already seeded into
 *      `v` and overwrites it — not a "give me vertex i" helper. Called with an uninitialised
 *      vector it skins whatever was in the register. Obvious once the numbers were absurd; the
 *      danger is the version of this bug that returns a plausible number.
 *
 *   2. The reference surface was wrong, and this one DID return plausible numbers. "The
 *      topmost up-facing rendered surface, cast from 6 m above the guard" is not the floor he
 *      is standing on — it is whatever is highest at his XZ. Standing beside a plinth it
 *      picked the plinth's lip, and reported a guard who was correctly on the pavement as
 *      1.00 m UNDERGROUND. It briefly made a fix look like a regression. The reference has to
 *      be sampled from the subject's own feet downward; it is now `sole + 0.10` and never a
 *      fixed height above the scene. `renderOver` reports anything above him separately, so an
 *      overhang is named instead of silently becoming the floor.
 *
 * ── Which of the four guard-ground tools to reach for ─────────────────────────────────────
 * They measure different quantities; none is a superset of another.
 *   `guardfloat`  the GAP, per guard, along the whole route — distribution, not one number.
 *                 Two independent instruments (collision BVH vs. a raycast of the RENDERED
 *                 scene) so "the collider disagrees with the picture" is separable.
 *   `guardstand`  ONE guard's surroundings: the radius sweep that shows the answer moving with
 *                 the probe, the neighbourhood grid, and the named colliders within 2 m.
 *   `guardlift`   the single FRAME a guard leaves the floor. `guardfloat` samples twice a
 *                 second and the lift is one frame wide, so it cannot see it (§440: sampling
 *                 is an instrument too).
 *   `guardground` the frames.
 *
 * Two of `guardfloat`'s own readings were wrong before they were right, and both faults were in
 * the instrument rather than the subject — see its header. Read a number from any of these
 * against the control rows it prints, not on its own.
 *
 * Prints, per guard, the gap distribution over the lap plus the worst sample's full surface
 * stack: every collider under his feet, top to bottom, with tag and record name, beside the
 * rendered surfaces at the same XZ. A guard standing on a floating collider shows a collision
 * hit at his feet and a rendered hit metres below it; a guard the snap never reached shows both
 * instruments agreeing, far below him.
 */
import { withGame } from './harness.mjs';
import fs from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d;
};
const SECONDS = arg('--seconds', 180);
const EVERY = arg('--every', 0.5);
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/guardfloat.json';

const out = await withGame({ width: 640, height: 360, quality: 'low' }, async ({ page }) => {
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
    const terrain = engine.get('terrain');
    const scene = engine.scene;
    if (!guards?.guards?.length) return { error: 'no guards' };
    if (!col) return { error: 'no collision' };

    /* ---- instrument B: the rendered world, with everything that is not world removed ------ */
    const guardRoots = new Set(guards.guards.map((g) => g.root));
    const SKIP = /guard|sly|cone|beam|pool|particle|trail|decal|sky|debug|outline|alert|hud|mark|cane/i;
    const targets = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;              // no characters in the world set
      for (let p = o; p; p = p.parent) {
        if (!p.visible) return;                              // proxies and hidden helpers
        if (guardRoots.has(p)) return;
        if (SKIP.test(p.name || '')) return;
        if (p.userData?.slyOutline || p.userData?.isOutlineShell) return;
      }
      const m = o.material;
      const one = Array.isArray(m) ? m[0] : m;
      if (one?.transparent && one?.depthWrite === false) return;   // additive haze, not a floor
      targets.push(o);
    });

    const rc = new THREE.Raycaster();
    const DOWN = new THREE.Vector3(0, -1, 0);
    const org = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    /** Every rendered surface under (x, z), from `fromY` down. Top-first. */
    function renderStack(x, z, fromY) {
      org.set(x, fromY, z);
      rc.set(org, DOWN);
      rc.near = 0; rc.far = 400;
      let hits = [];
      try { hits = rc.intersectObjects(targets, false); } catch (e) { return [{ err: e.message }]; }
      const rows = [];
      for (const h of hits) {
        let up = 1;
        if (h.face) { nrm.copy(h.face.normal).transformDirection(h.object.matrixWorld); up = nrm.y; }
        rows.push({ y: +(fromY - h.distance).toFixed(4), name: h.object.name || '(unnamed)', up: +up.toFixed(3) });
        if (rows.length >= 8) break;
      }
      return rows;
    }
    /**
     * The rendered floor UNDER a given height — the highest up-facing surface at or below it.
     *
     * The first cut of this took the topmost up-facing surface from 6 m over the guard's head,
     * which is a different question and gives a different answer wherever the level has
     * anything above him: it read the lip of a plinth he was standing beside as "the floor",
     * and reported a correctly grounded guard as a metre underground. The reference for
     * "is he standing on it" has to be sampled from his own feet downward, so `from` is the
     * sole plus a centimetre of slack, never a fixed height above the scene.
     */
    function renderFloor(x, z, fromY) {
      for (const r of renderStack(x, z, fromY)) if (r.up > 0.5) return r;
      return null;
    }
    /** Anything rendered directly ABOVE the feet, so an overhang is reported and not silently
        mistaken for the floor. */
    function renderOver(x, z, fromY, upTo) {
      const all = renderStack(x, z, upTo);
      const out = [];
      for (const r of all) { if (r.y <= fromY + 1e-3) break; if (r.up > 0.5) out.push(r); }
      return out;
    }

    /* ---- instrument A: the collision BVH ------------------------------------------------- */
    const p2 = new THREE.Vector3();
    function colStack(x, z, fromY) {
      const rows = [];
      let y = fromY;
      for (let i = 0; i < 10; i++) {
        p2.set(x, y, z);
        let r = null;
        try { r = col.raycast(p2, DOWN, 400); } catch { r = null; }
        if (!r?.hit) break;
        const hy = r.point.y;
        rows.push({ y: +hy.toFixed(4), tag: r.tag, mat: r.material, up: +r.normal.y.toFixed(3),
                    rec: r.rec?.mesh?.name || r.rec?.name || '(rec?)' });
        y = hy - 0.02;
        if (y < -90) break;
      }
      return rows;
    }

    /* ---- instrument C: the lowest CPU-skinned FOOT vertex of this guard's body ------------
       Foot-weighted only, and cached per geometry (geometry is shared per guard type), so a KO
       pose reports the boot rather than a hand that happens to be lower. */
    const footSets = new Map();
    function footVerts(mesh) {
      const g = mesh.geometry;
      if (footSets.has(g.uuid)) return footSets.get(g.uuid);
      const names = mesh.skeleton.bones.map((b) => b.name);
      const feet = new Set();
      names.forEach((n, i) => { if (/^(foot|toe|leg[LR]?\d*)/i.test(n)) feet.add(i); });
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const list = [];
      for (let i = 0; i < g.attributes.position.count; i++) {
        for (let k = 0; k < 4; k++) {
          if (sw.getComponent(i, k) > 0.05 && feet.has(si.getComponent(i, k))) { list.push(i); break; }
        }
      }
      const res = list.length ? list : Array.from({ length: g.attributes.position.count }, (_, i) => i);
      footSets.set(g.uuid, res);
      return res;
    }
    /* `applyBoneTransform` needs the vertex position seeded into the vector — it is the GLSL
       `skinning_vertex` chunk verbatim, not a "give me vertex i" helper. Its output is the
       shader's `transformed`, which the renderer then multiplies by `modelMatrix`; that second
       step is `localToWorld`. Both halves are reported, because on this rig `bind()` is handed
       an IDENTITY bindMatrix while the mesh sits under a moved `root`, and whether that
       double-counts the guard's own transform is exactly the thing in question. */
    const sv = new THREE.Vector3();
    function soleY(g) {
      const m = g.mesh;
      if (!m?.isSkinnedMesh) return null;
      m.updateMatrixWorld(true);
      m.skeleton.update();
      const pos = m.geometry.attributes.position;
      const list = footVerts(m);
      let loT = Infinity, loW = Infinity;
      for (const i of list) {
        sv.fromBufferAttribute(pos, i);
        m.applyBoneTransform(i, sv);
        if (sv.y < loT) loT = sv.y;                 // shader `transformed`
        m.localToWorld(sv);
        if (sv.y < loW) loW = sv.y;                 // after modelMatrix — what is drawn
      }
      return Number.isFinite(loW) ? { t: loT, w: loW } : null;
    }

    /* ---- park the player far away so nobody chases; the routes are what is being measured -- */
    const mv = engine.get('movement');
    const parked = mv?.position ? mv.position.clone() : null;
    if (mv?.position) mv.position.set(600, 0, 600);

    /* ---- walk the garrison, sampling ------------------------------------------------------ */
    const dt = 1 / 60;
    const frames = Math.round(seconds / dt);
    const everyN = Math.max(1, Math.round(every / dt));
    const rows = guards.guards.map((g) => ({
      id: g.id, index: g.index, name: g.name, type: g.type, route: g.route.name,
      baseY: g.route.baseY, space: g.route.space, radius: g.radius,
      spawn: (() => { const s = soleY(g); return { x: +g.position.x.toFixed(3), y: +g.position.y.toFixed(4),
               z: +g.position.z.toFixed(3), u: +g.u.toFixed(4), hadGround: !!g.hadGround,
               soleW: s ? +s.w.toFixed(4) : null, soleT: s ? +s.t.toFixed(4) : null }; })(),
      samples: [],
    }));

    let t = 0;
    for (let f = 0; f < frames; f++) {
      t += dt;
      try { guards.update(dt, t); } catch (e) { return { error: 'guards.update threw: ' + e.message }; }
      if (f % everyN) continue;
      for (let i = 0; i < guards.guards.length; i++) {
        const g = guards.guards[i];
        const p = g.position;
        /* A: exactly `_step`'s query — same origin lift, same radius the guard actually uses,
           same span. Beside it, the same query at the LEGACY width and a bare point ray, so
           "the fat probe found something lateral" and "the thin probe fell through a crack"
           are separable per sample instead of inferred from the trajectory. */
        let ga = null, gw = null, gr = null;
        const pr = g.groundProbe ?? g.radius * 0.7;
        try {
          p2.set(p.x, p.y + 0.85, p.z);
          const r = col.groundCheck(p2, pr, 0.85 + 1.05);
          if (r?.hit) ga = { y: +r.y.toFixed(4), tag: r.tag, rec: r.rec?.mesh?.name || '(rec?)',
                             slope: +(r.slope * 180 / Math.PI).toFixed(2), walkable: !!r.walkable };
        } catch { ga = null; }
        try {
          p2.set(p.x, p.y + 0.85, p.z);
          const r = col.groundCheck(p2, g.radius * 0.7, 0.85 + 1.05);
          if (r?.hit) gw = { y: +r.y.toFixed(4), tag: r.tag, rec: r.rec?.mesh?.name || '(rec?)' };
        } catch { gw = null; }
        try {
          p2.set(p.x, p.y + 0.85, p.z);
          const r = col.raycast(p2, DOWN, 0.85 + 1.05);
          if (r?.hit) gr = { y: +r.point.y.toFixed(4), tag: r.tag, rec: r.rec?.mesh?.name || '(rec?)' };
        } catch { gr = null; }
        /* A-deep: the same BVH but from well above and with no span limit — what the snap
           WOULD have found if `stepUp/stepDown` were not in the way. */
        let gd = null;
        try {
          const s0 = colStack(p.x, p.z, p.y + 6)[0];
          if (s0) gd = { y: s0.y, tag: s0.tag, rec: s0.rec };
        } catch { gd = null; }
        const s = soleY(g);
        /* Sampled from the sole down, not from 6 m up — see renderFloor. */
        const foot = s ? s.w : p.y;
        const rf = renderFloor(p.x, p.z, foot + 0.10);
        const over = renderOver(p.x, p.z, foot + 0.10, foot + 6);
        let th = NaN;
        try { th = terrain?.heightAt ? terrain.heightAt(p.x, p.z) : NaN; } catch { th = NaN; }
        rows[i].samples.push({
          t: +t.toFixed(2), u: +g.u.toFixed(4), state: g.state, spd: +g.speed.toFixed(3),
          hadGround: !!g.hadGround, off: +(g._offRoute ?? 0).toFixed(3),
          x: +p.x.toFixed(3), y: +p.y.toFixed(4), z: +p.z.toFixed(3),
          colY: ga ? ga.y : null, colTag: ga ? ga.tag : null, colRec: ga ? ga.rec : null,
          probeR: +pr.toFixed(3), slope: ga ? ga.slope : null, walkable: ga ? ga.walkable : null,
          wideY: gw ? gw.y : null, wideRec: gw ? gw.rec : null,
          rayY: gr ? gr.y : null, rayRec: gr ? gr.rec : null,
          deepY: gd ? gd.y : null, deepTag: gd ? gd.tag : null, deepRec: gd ? gd.rec : null,
          rndY: rf ? rf.y : null, rndName: rf ? rf.name : null,
          overY: over.length ? over[over.length - 1].y : null, overName: over.length ? over[over.length - 1].name : null,
          sole: s ? +s.w.toFixed(4) : null, soleT: s ? +s.t.toFixed(4) : null,
          mwY: +g.mesh.matrixWorld.elements[13].toFixed(4),
          terrY: Number.isFinite(th) ? +th.toFixed(4) : null,
        });
      }
    }

    /* ---- the worst and the best sample per guard get their full stacks, both instruments --- */
    for (const r of rows) {
      let worst = null, wg = -Infinity, best = null, bg = Infinity;
      for (const s of r.samples) {
        if (s.rndY === null || s.sole === null) continue;
        const gap = s.sole - s.rndY;
        if (gap > wg) { wg = gap; worst = s; }
        if (gap < bg) { bg = gap; best = s; }
      }
      if (worst) {
        r.worst = worst; r.worstGap = +wg.toFixed(4);
        r.worstColStack = colStack(worst.x, worst.z, worst.y + 6);
        r.worstRndStack = renderStack(worst.x, worst.z, worst.y + 6);
        r.worstFootStack = renderStack(worst.x, worst.z, (worst.sole ?? worst.y) + 0.10);
      }
      if (best) { r.best = best; r.bestGap = +bg.toFixed(4); }
    }

    if (parked && mv?.position) mv.position.copy(parked);

    /* ---- the control (§418.3): points whose answer is known independently of both --------- */
    const ctl = {
      courtyard: { at: [0, -8], rnd: renderFloor(0, -8, 0.10), col: colStack(0, -8, 8)[0] || null },
      offLevel: { at: [600, 600], rnd: renderFloor(600, 600, 8), col: colStack(600, 600, 8)[0] || null },
    };

    return { rows, ctl, targetCount: targets.length };
  }, [SECONDS, EVERY]);
});

if (out.error) { console.log('ERROR: ' + out.error); process.exit(1); }

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (v, n = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '   --  ' : v.toFixed(n).padStart(7));

console.log(`\nrendered-world raycast targets: ${out.targetCount}`);
console.log(`control  courtyard(0,-8): rendered ${JSON.stringify(out.ctl.courtyard.rnd)}`);
console.log(`                          collision ${JSON.stringify(out.ctl.courtyard.col)}`);
console.log(`control  off-level(600,600): rendered ${JSON.stringify(out.ctl.offLevel.rnd)}  collision ${JSON.stringify(out.ctl.offLevel.col)}\n`);

console.log('gapC = lowest skinned FOOT vertex, AFTER modelMatrix (what is drawn) MINUS topmost up-facing RENDERED surface [m]');
console.log('gapT = the same vertex BEFORE modelMatrix (shader `transformed`)        MINUS the same surface [m]');
console.log('gapA = what the guard snapped to (collision)                            MINUS the same surface [m]  <- cause 3 lives here');
console.log('#  id       type   route            n  u-span |    gapC: min    p25    med    p75    max |  gapT med | gapA med  | patrol%');
for (const r of out.rows) {
  const ok = r.samples.filter((s) => s.rndY !== null && s.sole !== null);
  if (!ok.length) { console.log(`${r.index} ${r.id} ${r.route}: NO rendered floor under any sample`); continue; }
  const gaps = ok.map((s) => s.sole - s.rndY);
  const gapt = ok.filter((s) => s.soleT !== null).map((s) => s.soleT - s.rndY);
  const dis = ok.filter((s) => s.colY !== null).map((s) => s.colY - s.rndY);
  const us = r.samples.map((s) => s.u);
  const pat = r.samples.filter((s) => s.state === 'patrol').length / r.samples.length;
  console.log(`${String(r.index).padEnd(2)} ${r.id.padEnd(8)} ${r.type.padEnd(6)} ${r.route.padEnd(15)} ${String(ok.length).padStart(4)} `
    + `${(Math.max(...us) - Math.min(...us)).toFixed(2)} | `
    + `${f(Math.min(...gaps))} ${f(q(gaps, 0.25))} ${f(q(gaps, 0.5))} ${f(q(gaps, 0.75))} ${f(Math.max(...gaps))} | `
    + `${gapt.length ? f(q(gapt, 0.5)) : '   --  '}  | `
    + `${dis.length ? f(q(dis, 0.5)) : '   --  '}   |  ${(pat * 100).toFixed(0)}%`);
}

console.log('\nSLOPE of the surface each guard is standing on, over the whole lap [degrees] — the');
console.log('threshold question: a guard floor in this level is flat; anything steep is prop geometry.');
console.log('#  id       min    p50    p90    max   | not-walkable samples');
for (const r of out.rows) {
  const sl = r.samples.filter((s) => s.slope !== null).map((s) => s.slope);
  if (!sl.length) { console.log(`${r.index} ${r.id}: no ground record`); continue; }
  const nw = r.samples.filter((s) => s.walkable === false).length;
  console.log(`${String(r.index).padEnd(2)} ${r.id.padEnd(8)} ${f(Math.min(...sl), 2)} ${f(q(sl, 0.5), 2)} ${f(q(sl, 0.9), 2)} ${f(Math.max(...sl), 2)}  | ${nw}`);
}

console.log('\n--- worst sample per guard: the whole surface stack, both instruments ---');
for (const r of out.rows) {
  if (!r.worst) continue;
  const w = r.worst;
  console.log(`\n${r.id} ${r.type} on ${r.route} (baseY ${r.baseY}, space ${r.space})  worst gapC ${r.worstGap} m / best ${r.bestGap} m`);
  console.log(`   at u=${w.u} t=${w.t}s  pos (${w.x}, ${w.y}, ${w.z})  soleDrawn ${w.sole}  soleTransformed ${w.soleT}  meshMatrixWorld.y ${w.mwY}  hadGround=${w.hadGround}  offRoute ${w.off}  state ${w.state}`);
  console.log(`   snapped to: colY ${w.colY} tag ${w.colTag} rec ${w.colRec}   |   rendered floor ${w.rndY} "${w.rndName}"   |   terrain ${w.terrY}`);
  console.log(`   COLLISION stack down from y=${(w.y + 6).toFixed(2)}:`);
  for (const c of r.worstColStack) console.log(`      y ${String(c.y).padStart(9)}  up ${String(c.up).padStart(6)}  tag ${String(c.tag).padEnd(8)} mat ${String(c.mat).padEnd(7)} rec ${c.rec}`);
  if (!r.worstColStack.length) console.log('      (nothing)');
  console.log(`   RENDERED  stack down from y=${(w.y + 6).toFixed(2)}:`);
  for (const c of r.worstRndStack) console.log(`      y ${String(c.y).padStart(9)}  up ${String(c.up).padStart(6)}  ${c.name || c.err}`);
  if (!r.worstRndStack.length) console.log('      (nothing)');
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`\nfull record -> ${OUT}`);

/**
 * guardstand — what exactly is under the guards that `guardfloat` found in the air?
 *
 * `guardfloat` says three of nine guards settle 1.2–2.1 m above the topmost RENDERED up-facing
 * surface at their own XZ, on colliders named `props_bronze` and `kaykit:solid`, and then stop
 * moving entirely. Two things have to be established before that is a diagnosis rather than a
 * number:
 *
 *  1. **That the rendered-world instrument can see props at all.** If the mesh filter drops the
 *     prop art, then "no rendered surface at 1.35 m" is a statement about the filter, not about
 *     the level (§439/§440). So this prints the FULL scene census — every mesh, whether it was
 *     admitted to the raycast set, and the reason it was not. A run whose census shows no props
 *     is a broken instrument and its verdict must be thrown away.
 *
 *  2. **Whether the guard is ON the prop or BESIDE it.** `Collision.groundCheck` sweeps a CAPSULE
 *     of radius `guard.radius * 0.7` — 0.29 m for a temple guard, 0.39 m for a heavy — so it
 *     reports support wherever that fat probe first touches something, including the *side* of a
 *     tall prop the guard is merely walking past. A point-ray at the same XZ cannot do that. So
 *     every stand is re-probed at a range of radii from 0.02 m upward: a support that appears
 *     only above some radius is the capsule grazing something next to the guard, and a support
 *     present at 0.02 m is a real surface underfoot.
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
 * Also dumps the neighbourhood — a 13x13 cm-grid of both instruments around each subject — and
 * the world bounds of every collider record and drawn mesh within 2 m, so "which prop" is a name
 * rather than an inference.
 *
 *   node tools/guardstand.mjs [--seconds 45]
 */
import { withGame } from './harness.mjs';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
const SECONDS = arg('--seconds', 45);

const out = await withGame({ width: 640, height: 360, quality: 'low' }, async ({ page }) => {
  page.setDefaultTimeout(0);
  return page.evaluate(async ([seconds]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Raycaster) break; } catch { THREE = null; }
    }
    if (!THREE?.Raycaster) return { error: 'no THREE' };
    const engine = window.__ENGINE, guards = engine.get('guards'), col = engine.get('collision'), scene = engine.scene;

    /* ---------- 1. the census: what instrument B can and cannot see ---------------------- */
    const guardRoots = new Set(guards.guards.map((g) => g.root));
    const SKIP = /guard|sly|cone|beam|pool|particle|trail|decal|sky|debug|outline|alert|hud|mark|cane/i;
    const census = [];
    const targets = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      let why = null;
      if (o.isSkinnedMesh) why = 'skinned (a character)';
      for (let p = o; p && !why; p = p.parent) {
        if (!p.visible) why = `invisible${p === o ? '' : ` (ancestor "${p.name}")`}`;
        else if (guardRoots.has(p)) why = 'under a guard root';
        else if (SKIP.test(p.name || '')) why = `name filter matched "${p.name}"`;
        else if (p.userData?.slyOutline || p.userData?.isOutlineShell) why = 'ink shell';
      }
      if (!why) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m?.transparent && m?.depthWrite === false) why = 'additive/no-depth';
      }
      const bb = new THREE.Box3();
      try { bb.setFromObject(o); } catch { /* leave empty */ }
      census.push({
        name: o.name || '(unnamed)', type: o.type, inst: o.isInstancedMesh ? o.count : 0,
        tris: Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3),
        admitted: !why, why,
        bb: bb.isEmpty() ? null : [+bb.min.x.toFixed(1), +bb.min.y.toFixed(2), +bb.min.z.toFixed(1),
                                   +bb.max.x.toFixed(1), +bb.max.y.toFixed(2), +bb.max.z.toFixed(1)],
      });
      if (!why) targets.push(o);
    });

    const rc = new THREE.Raycaster();
    const DOWN = new THREE.Vector3(0, -1, 0), org = new THREE.Vector3(), nrm = new THREE.Vector3(), p2 = new THREE.Vector3();
    function rnd(x, z, fromY) {
      org.set(x, fromY, z); rc.set(org, DOWN); rc.near = 0; rc.far = 400;
      const hits = rc.intersectObjects(targets, false);
      const rows = [];
      for (const h of hits) {
        let up = 1;
        if (h.face) { nrm.copy(h.face.normal).transformDirection(h.object.matrixWorld); up = nrm.y; }
        rows.push({ y: +(fromY - h.distance).toFixed(3), n: h.object.name || '?', up: +up.toFixed(2) });
        if (rows.length >= 6) break;
      }
      return rows;
    }
    const rndTop = (x, z, fromY) => { for (const r of rnd(x, z, fromY)) if (r.up > 0.5) return r; return null; };
    function colRay(x, z, fromY) {
      const rows = []; let y = fromY;
      for (let i = 0; i < 8; i++) {
        p2.set(x, y, z);
        let r = null; try { r = col.raycast(p2, DOWN, 400); } catch { r = null; }
        if (!r?.hit) break;
        rows.push({ y: +r.point.y.toFixed(3), tag: r.tag, rec: r.rec?.mesh?.name || '?' });
        y = r.point.y - 0.02; if (y < -90) break;
      }
      return rows;
    }

    /* ---------- 2. settle the garrison the way the game does ----------------------------- */
    const mv = engine.get('movement');
    const parked = mv?.position ? mv.position.clone() : null;
    if (mv?.position) mv.position.set(600, 0, 600);
    const dt = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(seconds / dt); f++) { t += dt; guards.update(dt, t); }

    /* ---------- 3. per-guard: radius sweep, neighbourhood, and the named neighbours ------- */
    const subjects = [];
    for (const g of guards.guards) {
      const p = g.position;
      const top = rndTop(p.x, p.z, p.y + 0.10);
      const gap = top ? +(p.y - top.y).toFixed(4) : null;

      /* the radius sweep — the capsule-grazing test */
      const radii = [0.02, 0.04, 0.06, 0.08, 0.10, 0.15, 0.20, 0.25, 0.294, 0.392];
      const sweep = radii.map((r) => {
        let res = null;
        try { p2.set(p.x, p.y + 0.85, p.z); res = col.groundCheck(p2, r, 1.90); } catch { res = null; }
        return { r, y: res?.hit ? +res.y.toFixed(4) : null, tag: res?.hit ? res.tag : null,
                 rec: res?.hit ? (res.rec?.mesh?.name || '?') : null,
                 /* the whole record: if the phantom stand reports a TILTED normal then
                    `walkable` — already computed by groundCheck and read by nobody — is the
                    gate, and the fix is one line. If it reports a flat one, it is not. */
                 ny: res?.hit ? +res.normal.y.toFixed(4) : null,
                 slope: res?.hit ? +(res.slope * 180 / Math.PI).toFixed(2) : null,
                 walkable: res?.hit ? !!res.walkable : null,
                 dist: res?.hit ? +res.distance.toFixed(4) : null,
                 oneWay: res?.hit ? !!res.oneWay : null,
      };
      });
      /* the same probe with a span long enough to reach the real floor, at both widths —
         "what would a narrow probe have said if it were allowed to look far enough". */
      const deep = [0.02, 0.10, 0.294, 0.392].map((r) => {
        let res = null;
        try { p2.set(p.x, p.y + 0.85, p.z); res = col.groundCheck(p2, r, 40); } catch { res = null; }
        return { r, y: res?.hit ? +res.y.toFixed(4) : null, tag: res?.hit ? res.tag : null,
                 rec: res?.hit ? (res.rec?.mesh?.name || '?') : null, ny: res?.hit ? +res.normal.y.toFixed(4) : null,
                 walkable: res?.hit ? !!res.walkable : null };
      });

      /* the neighbourhood: both instruments on a grid */
      const grid = [];
      for (let dz = -0.6; dz <= 0.61; dz += 0.2) {
        const row = [];
        for (let dx = -0.6; dx <= 0.61; dx += 0.2) {
          const c = colRay(p.x + dx, p.z + dz, p.y + 6)[0];
          const rr = rndTop(p.x + dx, p.z + dz, p.y + 0.10);
          row.push({ dx: +dx.toFixed(1), dz: +dz.toFixed(1), c: c ? c.y : null, cr: c ? c.rec : null, r: rr ? rr.y : null, rn: rr ? rr.n : null });
        }
        grid.push(row);
      }

      /* named neighbours: drawn meshes and collider records whose bounds come within 2 m */
      const near = [];
      const bb = new THREE.Box3(), probe = new THREE.Box3(
        new THREE.Vector3(p.x - 2, p.y - 3, p.z - 2), new THREE.Vector3(p.x + 2, p.y + 3, p.z + 2));
      for (const o of targets) {
        try { bb.setFromObject(o); } catch { continue; }
        if (bb.isEmpty() || !bb.intersectsBox(probe)) continue;
        near.push({ kind: 'drawn', name: o.name || '?', inst: o.isInstancedMesh ? o.count : 0,
                    y: [+bb.min.y.toFixed(3), +bb.max.y.toFixed(3)] });
      }
      for (const rec of (col.recs || [])) {
        const m = rec.mesh; if (!m) continue;
        try { m.updateWorldMatrix(true, true); bb.setFromObject(m); } catch { continue; }
        if (bb.isEmpty() || !bb.intersectsBox(probe)) continue;
        near.push({ kind: 'collider', name: m.name || '?', tag: rec.tag, tris: rec._tris,
                    y: [+bb.min.y.toFixed(3), +bb.max.y.toFixed(3)] });
      }

      subjects.push({
        id: g.id, type: g.type, route: g.route.name, radius: g.radius,
        pos: [+p.x.toFixed(3), +p.y.toFixed(4), +p.z.toFixed(3)], u: +g.u.toFixed(4),
        speed: +g.speed.toFixed(3), state: g.state, hadGround: !!g.hadGround, off: +(g._offRoute ?? 0).toFixed(3),
        renderTop: top, gapToRender: gap, sweep, deep, grid, near: near.slice(0, 40),
      });
    }
    if (parked && mv?.position) mv.position.copy(parked);
    return { census, subjects, targetCount: targets.length };
  }, [SECONDS]);
});

if (out.error) { console.log('ERROR ' + out.error); process.exit(1); }

console.log(`\n=== SCENE CENSUS — can instrument B see props? (${out.targetCount} of ${out.census.length} meshes admitted) ===`);
const adm = out.census.filter((c) => c.admitted).sort((a, b) => b.tris - a.tris);
console.log('-- ADMITTED to the rendered-world raycast:');
for (const c of adm) console.log(`   ${String(c.tris).padStart(7)} tris  ${c.inst ? `x${String(c.inst).padStart(4)}` : '     '}  ${c.name}   y ${c.bb ? `${c.bb[1]}..${c.bb[4]}` : '?'}`);
console.log('-- EXCLUDED, and why:');
const byWhy = {};
for (const c of out.census.filter((x) => !x.admitted)) (byWhy[c.why] ||= []).push(c.name);
for (const [w, names] of Object.entries(byWhy)) console.log(`   ${String(names.length).padStart(4)}  ${w}\n         ${[...new Set(names)].slice(0, 14).join(', ')}`);

for (const s of out.subjects) {
  const flag = s.gapToRender !== null && s.gapToRender > 0.25 ? '  *** IN THE AIR ***' : '';
  console.log(`\n=== ${s.id} ${s.type} ${s.route}  pos ${JSON.stringify(s.pos)} u=${s.u} speed=${s.speed} state=${s.state} offRoute=${s.off}${flag}`);
  console.log(`    topmost rendered surface here: ${JSON.stringify(s.renderTop)}   gap ${s.gapToRender} m`);
  console.log(`    groundCheck vs probe RADIUS (the guard's own is ${(s.radius * 0.7).toFixed(3)}):`);
  for (const w of s.sweep) console.log(`       r=${w.r.toFixed(3)}  ->  ${w.y === null ? 'NO SUPPORT' : `y ${String(w.y).padStart(9)}  n.y ${String(w.ny).padStart(7)}  slope ${String(w.slope).padStart(6)}deg  walkable ${w.walkable ? 'YES' : 'no '}  dist ${String(w.dist).padStart(7)}  tag ${String(w.tag).padEnd(7)} rec ${w.rec}`}`);
  console.log('    same probe, span 40 m (far enough to reach the real floor):');
  for (const w of s.deep) console.log(`       r=${w.r.toFixed(3)}  ->  ${w.y === null ? 'NO SUPPORT' : `y ${String(w.y).padStart(9)}  n.y ${String(w.ny).padStart(7)}  walkable ${w.walkable ? 'YES' : 'no '}  tag ${String(w.tag).padEnd(7)} rec ${w.rec}`}`);
  if (flag) {
    console.log('    neighbourhood — collision top / rendered top, 20 cm grid:');
    for (const row of s.grid) {
      console.log('       ' + row.map((c) => `${String(c.c === null ? '--' : c.c.toFixed(2)).padStart(6)}/${String(c.r === null ? '--' : c.r.toFixed(2)).padStart(6)}`).join(' '));
    }
    console.log('    named neighbours within 2 m:');
    for (const n of s.near) console.log(`       ${n.kind.padEnd(8)} ${String(n.name).padEnd(28)} ${n.tag ? `tag ${String(n.tag).padEnd(7)}` : '           '} y ${n.y[0]} .. ${n.y[1]}${n.inst ? `  x${n.inst}` : ''}`);
  }
}

fs.writeFileSync('/tmp/guardstand.json', JSON.stringify(out, null, 1));
console.log('\nfull record -> /tmp/guardstand.json');

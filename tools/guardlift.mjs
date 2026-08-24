/**
 * guardlift — the single frame on which a guard leaves the floor, with the ground record that
 * lifted him.
 *
 * `guardfloat` samples twice a second, which is enough to say a guard is in the air and useless
 * for saying what put him there: the lift is one frame wide. This watches every frame of the
 * shipped `Guards.update` path and prints the ones where a guard's `y` moves by more than a
 * centimetre, together with the FULL `groundCheck` record `_step` was handed at that moment —
 * height, normal, slope, walkable, and the signed distance from the probe origin, which is
 * negative exactly when the probe started inside the thing it "landed" on.
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
 * Nothing is teleported: the guards walk, and the trace is of the walk (§435.4).
 *
 *   node tools/guardlift.mjs [--seconds 30]
 */
import { withGame } from './harness.mjs';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
const SECONDS = arg('--seconds', 30);

const out = await withGame({ width: 640, height: 360, quality: 'low' }, async ({ page }) => {
  page.setDefaultTimeout(0);
  return page.evaluate(async ([seconds]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Vector3) break; } catch { THREE = null; }
    }
    const engine = window.__ENGINE, guards = engine.get('guards'), col = engine.get('collision');
    const mv = engine.get('movement');
    const parked = mv?.position ? mv.position.clone() : null;
    if (mv?.position) mv.position.set(600, 0, 600);

    const p2 = new THREE.Vector3();
    const rec = (g, atY) => {
      /* Exactly `_step`'s probe: origin at feet + stepUp, the guard's own radius, span
         stepUp + stepDown. Re-run rather than intercepted, so it reports the same call. */
      p2.set(g.position.x, atY + 0.85, g.position.z);
      let r = null;
      try { r = col.groundCheck(p2, g.groundProbe ?? g.radius * 0.7, 0.85 + 1.05); } catch { r = null; }
      if (!r?.hit) return null;
      return { y: +r.y.toFixed(4), ny: +r.normal.y.toFixed(4), slope: +(r.slope * 180 / Math.PI).toFixed(2),
               walkable: !!r.walkable, dist: +r.distance.toFixed(4), tag: r.tag, rec: r.rec?.mesh?.name || '?' };
    };

    const dt = 1 / 60;
    const prev = guards.guards.map((g) => g.position.y);
    const events = [];
    let t = 0;
    for (let f = 0; f < Math.round(seconds / dt); f++) {
      t += dt;
      const before = guards.guards.map((g) => ({ y: g.position.y, x: g.position.x, z: g.position.z }));
      guards.update(dt, t);
      for (let i = 0; i < guards.guards.length; i++) {
        const g = guards.guards[i];
        const dy = g.position.y - prev[i];
        if (Math.abs(dy) > 0.01) {
          events.push({
            t: +t.toFixed(3), id: g.id, dy: +dy.toFixed(4),
            from: +prev[i].toFixed(4), to: +g.position.y.toFixed(4),
            wasAt: [+before[i].x.toFixed(3), +before[i].z.toFixed(3)],
            nowAt: [+g.position.x.toFixed(3), +g.position.z.toFixed(3)],
            u: +g.u.toFixed(4), speed: +g.speed.toFixed(3),
            /* the record as it reads NOW, from the height he came FROM — i.e. the query that
               produced this step, re-asked at the position it produced. */
            ground: rec(g, before[i].y),
          });
        }
        prev[i] = g.position.y;
      }
      if (events.length > 400) break;
    }
    if (parked && mv?.position) mv.position.copy(parked);
    return { events, probe: guards.guards.map((g) => ({ id: g.id, r: g.groundProbe ?? g.radius * 0.7 })) };
  }, [SECONDS]);
});

console.log('probe radii: ' + out.probe.map((p) => `${p.id}=${p.r}`).join(' '));
console.log(`\n${out.events.length} frames where a guard's y moved > 1 cm\n`);
console.log('   t      id       dy       from  ->  to      u      | ground: y      n.y   slope  walkable  dist    tag/rec');
for (const e of out.events) {
  const g = e.ground;
  console.log(`${String(e.t).padStart(7)} ${e.id.padEnd(7)} ${String(e.dy).padStart(8)}  ${String(e.from).padStart(8)} -> ${String(e.to).padStart(8)} ${String(e.u).padStart(7)} | `
    + (g ? `${String(g.y).padStart(9)} ${String(g.ny).padStart(7)} ${String(g.slope).padStart(6)} ${g.walkable ? 'YES' : 'no '} ${String(g.dist).padStart(8)}  ${g.tag}/${g.rec}` : 'NO GROUND'));
}
fs.writeFileSync('/tmp/guardlift.json', JSON.stringify(out, null, 1));

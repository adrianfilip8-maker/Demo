#!/usr/bin/env node
/**
 * carmnativeshot.mjs — the §704 before/after frames, on cameras whose FRONT-ness is measured.
 *
 *   node tools/carmnativeshot.mjs --arm rebind             # writes the camera literals it computed
 *   node tools/carmnativeshot.mjs --arm native --cam <json>    # re-uses them exactly
 *   node tools/carmnativeshot.mjs --arm default --cam <json>   # NO query — whatever ships
 *
 * ── why the camera is computed and then PASSED IN, rather than computed twice ────────────────
 * A before/after pair is only evidence if the two frames differ by the change and by nothing else.
 * The garrison settles deterministically, but the two arms do NOT settle to the same instant-by-
 * instant positions — their clip sets have different durations, so a guard's worst-case sample
 * lands at a different `u`. Recomputing "the camera in front of guard4" per arm would therefore
 * photograph two different stances from two different bearings and call the difference a fix.
 *
 * So: the first run computes the cameras from its settled garrison, prints them as JSON, and the
 * second run is handed that JSON verbatim. Both runs print the facing dot **for the camera they
 * actually used**, so "front" stays a measurement on both sides rather than a name inherited from
 * the first (§702.9's own lesson: `portrait-colonnade` sat at dot −0.94 for a season).
 *
 * ── §435.4 ──────────────────────────────────────────────────────────────────────────────────
 * Nobody is teleported to a pose. The garrison WALKS the settle window on the shipped
 * `Guards.update` path and is photographed wherever it has got to.
 */
import { withGame } from './harness.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ARM = arg('--arm', 'rebind');
const SECONDS = Number(arg('--seconds', 60));
const CAMIN = arg('--cam', '');
/* `--arm default` passes NO query at all, so the run exercises whatever `TUNE.carmelitaNative`
   actually ships as. That is a different claim from `--arm native`, which forces the token: one
   says "the native path works", the other says "the native path is what a player gets". After
   §704's default flip the second is the one that needed proving, and a forced token cannot
   prove it. The tool prints `guards.carmelitaNative` either way, so the arm is read back off the
   built garrison rather than assumed from the flag. */
const QUERY = ARM === 'native' ? 'carm=native' : ARM === 'rebind' ? 'carm=rebind' : '';

/* Which guards to stand in front of. Two subjects in two quarters, which is §466.5's second
   sample for a visual claim — one guard cannot distinguish "the import is fixed" from "this
   guard happens to look all right from here". */
const SUBJECTS = ['guard4', 'guard1'];
const RANGE = 4.0;          // metres, matching §702's face cameras
const EYE = 1.35;           // metres, a little below her head so the face is not shot down onto

const out = await withGame({ width: 1280, height: 720, quality: 'high', query: QUERY }, async ({ page }) => {
  page.setDefaultTimeout(0);
  await page.evaluate(() => window.__GAME.setShot('courtyard'));
  /* A throwaway frame before the first real one: the first capture of a boot pays the whole
     shader-program warm-up and comes back a flat field otherwise (ventshot.mjs's finding). */
  await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

  const staged = await page.evaluate(async ([seconds, subjects, range, eye, camIn]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Box3) break; } catch { THREE = null; }
    }
    if (!THREE?.Box3) return { error: 'could not load THREE in page' };
    const engine = window.__ENGINE;
    const guards = engine.get('guards');
    if (!guards?.guards?.length) return { error: 'no guards' };

    /* settle: the garrison walks; the player is parked far outside so he cannot trip a cone
       and turn a patrol into a chase (which would change the clip and the stance). */
    const mv = engine.get('movement');
    if (mv?.position) mv.position.set(600, 0, 600);
    if (guards._shotLocks) guards._shotLocks.length = 0;
    const dt = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(seconds / dt); f++) { t += dt; guards.update(dt, t); }

    const byId = new Map(guards.guards.map((g) => [g.id, g]));
    const cams = camIn ? JSON.parse(camIn) : {};
    const rows = [];
    for (const id of subjects) {
      const g = byId.get(id);
      if (!g) { rows.push({ id, error: 'absent' }); continue; }
      const mesh = g.mesh;
      mesh.updateMatrixWorld(true);
      mesh.skeleton?.update?.();
      /* the drawn box, CPU-skinned — the same contract carmscale/guardfloat use */
      const pos = mesh.geometry.attributes.position;
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i);
        mesh.applyBoneTransform(i, v);
        mesh.localToWorld(v);
        box.expandByPoint(v);
      }
      const centre = box.getCenter(new THREE.Vector3());
      const fwd = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(g.root.getWorldQuaternion(new THREE.Quaternion())).normalize();

      /* If a camera was handed in, USE IT and measure it. Otherwise put one on the guard's own
         forward axis at `range`, which is front by construction — and then still measure it. */
      let camPos, lookAt;
      if (cams[id]) { camPos = new THREE.Vector3(...cams[id].pos); lookAt = new THREE.Vector3(...cams[id].look); }
      else {
        camPos = centre.clone().addScaledVector(fwd, range); camPos.y = box.min.y + eye;
        lookAt = new THREE.Vector3(centre.x, box.min.y + eye * 0.92, centre.z);
      }
      const toCam = camPos.clone().sub(centre).normalize();
      rows.push({
        id, state: g.state, clip: g.anim?.current || '?',
        pos: [+g.position.x.toFixed(3), +g.position.y.toFixed(3), +g.position.z.toFixed(3)],
        drawn: { h: +(box.max.y - box.min.y).toFixed(4), y: [+box.min.y.toFixed(4), +box.max.y.toFixed(4)] },
        bones: mesh.skeleton?.bones?.length ?? 0,
        dot: +fwd.dot(toCam).toFixed(3),
        dist: +camPos.distanceTo(centre).toFixed(2),
        cam: { pos: camPos.toArray().map((n) => +n.toFixed(4)), look: lookAt.toArray().map((n) => +n.toFixed(4)) },
      });
    }
    return { rows, native: !!guards.carmelitaNative };
  }, [SECONDS, SUBJECTS, RANGE, EYE, CAMIN]);

  if (staged.error) throw new Error(staged.error);
  console.log(`arm=${ARM}  guards.carmelitaNative=${staged.native}`);
  for (const r of staged.rows) {
    console.log(`  ${r.id}  state ${r.state}  clip ${String(r.clip).padEnd(12)} drawn h ${r.drawn.h}  bones ${r.bones}`
      + `   dot ${r.dot >= 0 ? '+' : ''}${r.dot} @ ${r.dist} m`);
  }

  /* Refuse a frame that is not a front view, rather than shipping it with a name that says it is. */
  const bad = staged.rows.filter((r) => !r.error && r.dot < 0.90);
  if (bad.length) {
    console.log(`REFUSING: ${bad.map((r) => `${r.id} dot ${r.dot}`).join(', ')} — not a front view`);
  }

  for (const r of staged.rows) {
    if (r.error || r.dot < 0.90) continue;
    const png = await page.evaluate(async (F) => {
      const g = window.__GAME, e = g.engine;
      const ch = e.get('character');
      if (ch?.root) ch.root.visible = false;
      e.camera.fov = 42;
      e.camera.position.set(...F.cam.pos);
      e.camera.up.set(0, 1, 0);
      e.camera.lookAt(...F.cam.look);
      e.camera.updateProjectionMatrix();
      e.camera.updateMatrixWorld(true);
      await g.step(8, 1 / 60);
      e.camera.fov = 42;
      e.camera.position.set(...F.cam.pos);
      e.camera.lookAt(...F.cam.look);
      e.camera.updateProjectionMatrix();
      e.camera.updateMatrixWorld(true);
      return g.capture();
    }, r);
    const file = path.join(ROOT, 'shots', `carm704-${ARM}-${r.id}.png`);
    await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
    console.log(`  → shots/carm704-${ARM}-${r.id}.png`);
  }
  return staged;
});

console.log('\ncameras, for the other arm — pass verbatim as --cam:');
console.log(JSON.stringify(Object.fromEntries(out.rows.filter((r) => !r.error).map((r) => [r.id, r.cam]))));
process.exit(0);

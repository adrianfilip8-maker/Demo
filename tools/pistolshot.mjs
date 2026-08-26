#!/usr/bin/env node
/**
 * pistolshot.mjs — the §709 before/after frames: the gun in her hands, the cone off its muzzle.
 *
 *   node tools/pistolshot.mjs --pistol 1                      # writes the cameras it computed
 *   node tools/pistolshot.mjs --pistol 0 --cam <json>         # the same cameras, unarmed
 *   node tools/pistolshot.mjs --pistol 1 --ink 1 --cam <json> # armed, pistol shelled too
 *
 * ── the camera is computed ONCE and passed in ───────────────────────────────────────────────
 * `carmnativeshot.mjs`'s rule, for its reason. A before/after pair is evidence only if the two
 * frames differ by the change and nothing else — and arming a guard CHANGES HER CLIP
 * (`CLIP_FOR_ARMED` swaps `CasualWalking` for `PatrolWalk`), so the two arms do not settle to the
 * same stance at the same instant. Recomputing "the camera in front of guard4" per arm would
 * photograph two different poses from two different bearings and call the difference a result.
 *
 * ── §435.4 ──────────────────────────────────────────────────────────────────────────────────
 * Nobody is teleported. The garrison walks the settle window on the shipped `Guards.update` path
 * and is photographed wherever it got to.
 *
 * ── §466.5 ──────────────────────────────────────────────────────────────────────────────────
 * Two subjects in two quarters per claim, and every frame's facing dot is MEASURED and printed
 * for the camera actually used. The face cameras refuse below 0.90. The CONE camera is a
 * deliberate PROFILE — you cannot see where a beam starts by standing in it — and it is labelled
 * as one and its dot is printed rather than dressed up as a front view.
 *
 * ── what it also reports, because a frame cannot say it ─────────────────────────────────────
 * Whether the pistol mesh actually exists on the guard, how many triangles it is, where the cone
 * apex was placed, and how far that is from the head-bone apex the build used before. A frame
 * showing a gun proves the gun loaded; it does not prove the cone moved.
 */
import { withGame } from './harness.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const PISTOL = arg('--pistol', '1');
const INK = arg('--ink', '0');
const SECONDS = Number(arg('--seconds', 60));
const CAMIN = arg('--cam', '');
const SHOT = arg('--shot', 'courtyard');
const TAG = arg('--tag', `p${PISTOL}${INK === '1' ? 'i' : ''}`);

const SUBJECTS = ['guard4', 'guard1'];
const RANGE = 3.4;          // metres — closer than §704's 4.0, because the subject is a 0.37 m prop
const EYE = 1.15;

const QUERY = `carmpistol=${PISTOL}`;

const out = await withGame({ width: 1280, height: 720, quality: 'high', query: QUERY }, async ({ page }) => {
  page.setDefaultTimeout(0);
  await page.evaluate(([shot, ink]) => {
    window.__GAME.setShot(shot);
    /* The ink knob is a TUNE poke, the Lighting.js precedent this project already uses for
       capture brackets — the shells are (re)built below by re-running `_applyOutlines`. */
    const g = window.__ENGINE.get('guards');
    if (g?.TUNE) g.TUNE.carmelitaPistolInk = Number(ink);
  }, [SHOT, INK]);
  /* A throwaway frame before the first real one: the first capture of a boot pays the whole
     shader-program warm-up and comes back a flat field otherwise (ventshot.mjs's finding). */
  await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

  const staged = await page.evaluate(async ([seconds, subjects, range, eye, camIn, ink]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Box3) break; } catch { THREE = null; }
    }
    if (!THREE?.Box3) return { error: 'could not load THREE in page' };
    const engine = window.__ENGINE;
    const guards = engine.get('guards');
    if (!guards?.guards?.length) return { error: 'no guards' };
    if (Number(ink) === 1) { guards.TUNE.carmelitaPistolInk = 1; guards._applyOutlines(); }

    /* settle: the garrison walks; the player is parked far outside so he cannot trip a cone
       and turn a patrol into a chase (which would change the clip and the stance). */
    const mv = engine.get('movement');
    if (mv?.position) mv.position.set(600, 0, 600);
    if (guards._shotLocks) guards._shotLocks.length = 0;
    const dt = 1 / 60;
    let t = 0;
    for (let f = 0; f < Math.round(seconds / dt); f++) { t += dt; guards.update(dt, t); }

    const asset = guards.carmelita;
    const byId = new Map(guards.guards.map((g) => [g.id, g]));
    const cams = camIn ? JSON.parse(camIn) : {};
    const rows = [];
    for (const id of subjects) {
      const g = byId.get(id);
      if (!g) { rows.push({ id, error: 'absent' }); continue; }
      const mesh = g.mesh;
      mesh.updateMatrixWorld(true);
      mesh.skeleton?.update?.();
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

      /* where the cone actually starts, and where it USED to start — the claim the frame cannot make */
      const apex = g._coneApex(new THREE.Vector3()).clone();
      const eyeP = g._eyePosition(new THREE.Vector3()).clone();

      let camPos, lookAt, conePos, coneLook;
      if (cams[id]) {
        camPos = new THREE.Vector3(...cams[id].pos); lookAt = new THREE.Vector3(...cams[id].look);
        conePos = new THREE.Vector3(...cams[id].conePos); coneLook = new THREE.Vector3(...cams[id].coneLook);
      } else {
        camPos = centre.clone().addScaledVector(fwd, range); camPos.y = box.min.y + eye;
        lookAt = new THREE.Vector3(centre.x, box.min.y + eye * 0.92, centre.z);
        /* the cone camera: broadside, so the beam is seen along its length rather than down it */
        const side = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
        conePos = centre.clone().addScaledVector(side, 7.5).addScaledVector(fwd, 2.2);
        conePos.y = box.min.y + 2.3;
        coneLook = centre.clone().addScaledVector(fwd, 2.6); coneLook.y = box.min.y + 0.9;
      }
      const toCam = camPos.clone().sub(centre).normalize();
      const toCone = conePos.clone().sub(centre).normalize();
      rows.push({
        id, state: g.state, clip: g.anim?.current || '?',
        drawnH: +(box.max.y - box.min.y).toFixed(4),
        hasPistol: !!g.pistolMesh,
        pistolTris: g.pistolMesh ? (g.pistolMesh.geometry.index.count / 3) : 0,
        pistolShelled: !!g.pistolMesh?.userData?.slyShell,
        muzzleBone: g.muzzleBone?.name || null,
        apex: apex.toArray().map((n) => +n.toFixed(4)),
        eye: eyeP.toArray().map((n) => +n.toFixed(4)),
        apexMovedBy: +apex.distanceTo(eyeP).toFixed(4),
        apexAboveFeet: +(apex.y - g.position.y).toFixed(4),
        dot: +fwd.dot(toCam).toFixed(3),
        coneDot: +fwd.dot(toCone).toFixed(3),
        dist: +camPos.distanceTo(centre).toFixed(2),
        cam: {
          pos: camPos.toArray().map((n) => +n.toFixed(4)), look: lookAt.toArray().map((n) => +n.toFixed(4)),
          conePos: conePos.toArray().map((n) => +n.toFixed(4)), coneLook: coneLook.toArray().map((n) => +n.toFixed(4)),
        },
      });
    }
    return {
      rows, native: !!guards.carmelitaNative,
      armed: !!asset?.armed, assetPistolTris: asset?.pistol?.tris ?? 0,
      lp: asset?.stats?.pistolLP || null,
      muzzle: asset?.stats?.pistol?.muzzle || null,
      stats: { draws: guards.stats?.draws, tris: guards.stats?.tris },
      inkTune: guards.TUNE.carmelitaPistolInk,
    };
  }, [SECONDS, SUBJECTS, RANGE, EYE, CAMIN, INK]);

  if (staged.error) throw new Error(staged.error);
  console.log(`?${QUERY}  ink=${staged.inkTune}  native=${staged.native}  armed=${staged.armed}  `
    + `asset pistol ${staged.assetPistolTris} tris   guards.stats ${JSON.stringify(staged.stats)}`);
  console.log(`  low-poly splice: ${JSON.stringify(staged.lp)}`);
  console.log(`  muzzle: ${JSON.stringify(staged.muzzle)}`);
  for (const r of staged.rows) {
    if (r.error) { console.log(`  ${r.id}: ${r.error}`); continue; }
    console.log(`  ${r.id}  state ${r.state}  clip ${String(r.clip).padEnd(14)} drawn h ${r.drawnH} m`);
    console.log(`      pistol ${r.hasPistol ? `YES ${r.pistolTris} tris, shelled=${r.pistolShelled}` : 'no'}`
      + `   muzzle bone ${r.muzzleBone || '—'}`);
    console.log(`      cone apex (${r.apex.join(', ')})  ${r.apexAboveFeet} m above his feet`);
    console.log(`      head-bone eye (${r.eye.join(', ')})  — apex moved ${r.apexMovedBy} m`);
    console.log(`      face cam dot ${r.dot >= 0 ? '+' : ''}${r.dot} @ ${r.dist} m   cone cam dot ${r.coneDot} (a PROFILE, by design)`);
  }

  const bad = staged.rows.filter((r) => !r.error && r.dot < 0.90);
  if (bad.length) console.log(`REFUSING the face frames: ${bad.map((r) => `${r.id} dot ${r.dot}`).join(', ')} — not a front view`);

  for (const r of staged.rows) {
    if (r.error) continue;
    /* face frame — front, gated */
    if (r.dot >= 0.90) {
      const png = await page.evaluate(async (F) => {
        const g = window.__GAME, e = g.engine;
        const ch = e.get('character');
        if (ch?.root) ch.root.visible = false;
        const aim = () => {
          e.camera.fov = 42;
          e.camera.position.set(...F.cam.pos);
          e.camera.up.set(0, 1, 0);
          e.camera.lookAt(...F.cam.look);
          e.camera.updateProjectionMatrix();
          e.camera.updateMatrixWorld(true);
        };
        aim(); await g.step(8, 1 / 60); aim();
        return g.capture();
      }, r);
      const file = path.join(ROOT, 'shots', `pistol709-${TAG}-${r.id}.png`);
      await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
      console.log(`  → shots/pistol709-${TAG}-${r.id}.png`);
    }
    /* cone frame — profile, at night so the beam is not faded out by daylight */
    const cpng = await page.evaluate(async (F) => {
      const g = window.__GAME, e = g.engine;
      const ch = e.get('character');
      if (ch?.root) ch.root.visible = false;
      await g.setShot('night');
      const aim = () => {
        e.camera.fov = 40;
        e.camera.position.set(...F.cam.conePos);
        e.camera.up.set(0, 1, 0);
        e.camera.lookAt(...F.cam.coneLook);
        e.camera.updateProjectionMatrix();
        e.camera.updateMatrixWorld(true);
      };
      aim(); await g.step(8, 1 / 60); aim();
      return g.capture();
    }, r);
    const cfile = path.join(ROOT, 'shots', `pistol709-cone-${TAG}-${r.id}.png`);
    await writeFile(cfile, Buffer.from(cpng.split(',')[1], 'base64'));
    console.log(`  → shots/pistol709-cone-${TAG}-${r.id}.png`);
    await page.evaluate(async (s) => { await window.__GAME.setShot(s); }, SHOT);
  }
  return staged;
});

console.log('\ncameras, for the other arm — pass verbatim as --cam:');
console.log(JSON.stringify(Object.fromEntries(out.rows.filter((r) => !r.error).map((r) => [r.id, r.cam]))));
process.exit(0);

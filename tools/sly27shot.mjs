#!/usr/bin/env node
/**
 * sly27shot.mjs — the §711 before/after frames, on cameras whose FRONT-ness is measured.
 *
 *   node tools/sly27shot.mjs --arm default            # writes the camera literals it computed
 *   node tools/sly27shot.mjs --arm godot  --cam <json>   # re-uses them exactly
 *   node tools/sly27shot.mjs --arm sly27  --cam <json>
 *
 * ── why the camera is computed once and then PASSED IN ───────────────────────────────────────
 * A before/after pair is only evidence if the two frames differ by the change and by nothing else.
 * The three arms are three different meshes at three different scales, so "put the camera in front
 * of Sly" recomputed per arm would photograph three subjects from three bearings and call the
 * difference a result. The first run prints its cameras as JSON; the others are handed it verbatim.
 * Every run prints the facing dot **for the camera it actually used**, so "front" stays a
 * measurement on each arm rather than a name inherited from the first — §702 caught a frame
 * labelled "front" sitting at dot −0.94, and a tool here spent its whole life doing that.
 *
 * ── §466.5: two samples per visual claim ────────────────────────────────────────────────────
 * Two cameras per arm, and they are different KINDS of view rather than two of the same:
 *   `closeup`  the canonical `sly-closeup` bearing, unchanged, so these frames are comparable to
 *              every character frame this project has taken. Measured at dot ≈ +0.83 — a
 *              three-quarter front, which is what that shot has always been.
 *   `front`    computed dead-on from the player's own facing at the same range. This is the one
 *              that earns the phrase "verified front view".
 *
 * ── §442, and it is the whole reason this tool poses explicitly ─────────────────────────────
 * `sly-closeup` freezes the pose `idle_confident`, which is a RIG3 procedural clip. On `?char=
 * sly27` the procedural layer is intentionally inactive, so `freezePose` reaches nothing and the
 * character would be photographed in **bind pose** — a pose the source never shows, with the cane
 * through his arm. This tool therefore drives the native model's OWN clip by name and steps the
 * mixer, and prints which clip each arm was actually holding, so a frame can never silently be of
 * the rest pose. `--pose <clip>` picks it; the default is `Standupright`, §479.20's ruling.
 *
 * ── §435.4 ──────────────────────────────────────────────────────────────────────────────────
 * The mixer is WALKED to the requested time in 1/60 steps on the shipped `update` path, never
 * teleported with `setTime`.
 */
import { withGame } from './harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ARM = arg('--arm', 'default');
const CAMIN = arg('--cam', '');
const POSE = arg('--pose', 'Standupright');
const HOLD = Number(arg('--hold', 2.0));      // seconds into the clip to hold
const OUT = arg('--out', path.join(ROOT, 'shots'));

/* `--arm default` passes NO query, so the run exercises whatever actually ships. That is a
   different claim from `--arm sly27`, which forces the token: one says "the native path works",
   the other says "the native path is what a player gets". The arm is read back off the built
   character (its constructor name and joint count), never assumed from the flag. */
const QUERY = ARM === 'default' ? '' : `char=${ARM}`;
const RANGE = 3.6;      // metres — `sly-closeup`'s own camera stands 3.57 m out
const EYE = 1.45;

await mkdir(OUT, { recursive: true });

const out = await withGame({ width: 1280, height: 720, quality: 'high', query: QUERY }, async ({ page, info }) => {
  page.setDefaultTimeout(0);
  await page.evaluate(() => window.__GAME.setShot('sly-closeup'));
  /* A throwaway frame before the first real one: the first capture of a boot pays the whole
     shader-program warm-up and comes back a flat field otherwise (ventshot.mjs's finding). */
  await page.evaluate(async () => { await window.__GAME.step(12, 1 / 60); window.__GAME.capture(); });

  const staged = await page.evaluate(async ([pose, hold, range, eye, camIn]) => {
    let THREE = null;
    for (const url of ['/node_modules/.vite/deps/three.js', '/node_modules/three/build/three.module.js']) {
      try { THREE = await import(/* @vite-ignore */ url); if (THREE?.Box3) break; } catch { THREE = null; }
    }
    if (!THREE?.Box3) return { error: 'could not load THREE in page' };
    const engine = window.__ENGINE;
    const ch = engine.get('character');
    if (!ch?.root) return { error: 'no character' };

    /* WHICH ARM IS ACTUALLY BUILT — read off the object, not the flag. */
    const skinned = [];
    ch.root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    const built = {
      ctor: ch.constructor?.name || '?',
      rootName: ch.root.name,
      joints: skinned[0]?.skeleton?.bones?.length ?? 0,
      boneNames: (ch.boneNames || []).length,
      nativeClips: typeof ch.clipNames === 'function' ? ch.clipNames().length : 0,
      caneObj: !!ch.root.getObjectByName('Cane_LowPoly'),
    };

    /* POSE IT (§442). On the native arm drive its own clip and WALK the mixer; on the RIG3 arms
       the shot's own `freezePose` has already run and there is nothing to step. */
    let posed = null;
    if (typeof ch.play === 'function' && built.nativeClips) {
      const ok = ch.play(pose, { loop: true, fade: 0 });
      if (ok) {
        const step = 1 / 60;
        for (let t = 0; t < hold - 1e-9; t += step) ch.update(Math.min(step, hold - t));
        posed = { how: 'native mixer', clip: pose, held: hold, ok };
      } else posed = { how: 'native mixer', clip: pose, ok: false };
    } else {
      posed = { how: 'freezePose (RIG3)', clip: engine.get('animation')?.frozen?.name || '(shot default)' };
    }
    ch.root.updateMatrixWorld(true);

    /* the DRAWN box, so scale/containment numbers describe what the frame contains */
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const m of skinned) {
      m.skeleton?.update?.();
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i);
        m.applyBoneTransform(i, v);
        m.localToWorld(v);
        box.expandByPoint(v);
      }
    }
    /* rigid parts (the cane, the hat, the eyes) are not skinned, so add them by object */
    ch.root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) box.expandByObject(o); });
    const centre = box.getCenter(new THREE.Vector3());

    const yaw = ch.root.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
    const cams = camIn ? JSON.parse(camIn) : {};
    const rows = [];
    for (const which of ['closeup', 'front']) {
      let camPos, lookAt;
      if (cams[which]) { camPos = new THREE.Vector3(...cams[which].pos); lookAt = new THREE.Vector3(...cams[which].look); }
      else if (which === 'closeup') {
        camPos = new THREE.Vector3(-1.6, 1.45, 33.2);          // `sly-closeup`, verbatim
        lookAt = new THREE.Vector3(0.0, 0.95, 30.0);
      } else {
        camPos = centre.clone().addScaledVector(fwd, range); camPos.y = box.min.y + eye;
        lookAt = new THREE.Vector3(centre.x, box.min.y + eye * 0.86, centre.z);
      }
      const toCam = camPos.clone().sub(centre); toCam.y = 0; toCam.normalize();
      rows.push({
        which,
        dot: +fwd.dot(toCam).toFixed(3),
        dist: +camPos.distanceTo(centre).toFixed(2),
        cam: { pos: camPos.toArray().map((n) => +n.toFixed(4)), look: lookAt.toArray().map((n) => +n.toFixed(4)) },
      });
    }
    return {
      built, posed, yaw: +yaw.toFixed(4), rows,
      drawn: {
        h: +(box.max.y - box.min.y).toFixed(4),
        y: [+box.min.y.toFixed(4), +box.max.y.toFixed(4)],
        x: [+box.min.x.toFixed(4), +box.max.x.toFixed(4)],
        z: [+box.min.z.toFixed(4), +box.max.z.toFixed(4)],
      },
      warnings: window.__GAME.warnings.slice(-6),
    };
  }, [POSE, HOLD, RANGE, EYE, CAMIN]);

  if (staged.error) throw new Error(staged.error);
  console.log(`\narm=${ARM}   built: ${staged.built.ctor} root="${staged.built.rootName}" `
    + `joints ${staged.built.joints}  RIG3 boneNames ${staged.built.boneNames}  nativeClips ${staged.built.nativeClips}  `
    + `cane object ${staged.built.caneObj ? 'PRESENT' : 'absent'}`);
  console.log(`  posed by ${staged.posed.how}: "${staged.posed.clip}"${staged.posed.ok === false ? '  <- CLIP DID NOT TAKE' : ''}`);
  console.log(`  drawn height ${staged.drawn.h} m   y ${staged.drawn.y.join(' .. ')}   x ${staged.drawn.x.join(' .. ')}   z ${staged.drawn.z.join(' .. ')}`);
  for (const r of staged.rows) console.log(`  ${r.which.padEnd(8)} dot ${r.dot >= 0 ? '+' : ''}${r.dot} @ ${r.dist} m`);
  for (const w of staged.warnings) console.log(`  [warn] ${w}`);

  const files = [];
  for (const r of staged.rows) {
    /* Refuse a frame that is not a front view rather than shipping it under a name that says it
       is. `closeup` is a three-quarter by construction, so it carries the lower bar it has always
       had; `front` must actually be front. */
    const bar = r.which === 'front' ? 0.90 : 0.60;
    if (r.dot < bar) { console.log(`  REFUSING ${r.which}: dot ${r.dot} < ${bar}`); continue; }
    const dataUrl = await page.evaluate(async (F) => {
      const g = window.__GAME, e = g.engine;
      e.camera.fov = 38;
      e.camera.position.set(...F.cam.pos);
      e.camera.up.set(0, 1, 0);
      e.camera.lookAt(...F.cam.look);
      e.camera.updateProjectionMatrix();
      e.camera.updateMatrixWorld(true);
      await g.step(8, 1 / 60);
      /* re-assert after stepping: the camera rig runs in `step` and would otherwise take it back */
      e.camera.fov = 38;
      e.camera.position.set(...F.cam.pos);
      e.camera.lookAt(...F.cam.look);
      e.camera.updateProjectionMatrix();
      e.camera.updateMatrixWorld(true);
      return g.capture();
    }, r);
    const file = path.join(OUT, `sly27-${ARM}-${r.which}.png`);
    await writeFile(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
    files.push(file);
    console.log(`  wrote ${path.relative(ROOT, file)}`);
  }
  return { staged, files };
});

if (!CAMIN) {
  const cams = Object.fromEntries(out.staged.rows.map((r) => [r.which, r.cam]));
  console.log(`\n--cam '${JSON.stringify(cams)}'\n`);
}

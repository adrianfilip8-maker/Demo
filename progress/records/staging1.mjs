/**
 * staging1 — the registered capture for PREREG-staging1.md. COORDINATOR-dispatched, run by the
 * STAGING owner under the coordinator's authorisation.
 *
 * WHAT CHANGED FROM THE SEAL'S §5 PLAN, AND WHY IT IS STRICTLY BETTER
 * ------------------------------------------------------------------
 * The seal said "one arm per boot, source values in src/core/Shots.js, because `Debug` exposes
 * `SHOT_NAMES` but not `SHOTS`". That premise is WRONG and I found it while wiring this runner:
 *
 *     Debug.setShot() RETURNS `{ name, shot, subject, stats, warnings }`, and `shot` IS the
 *     live `SHOTS[name]` object (Debug.js:78 `const shot = SHOTS[name]`, returned at :143).
 *
 * `applyShot()` re-reads `SHOTS[name].pos/.target` on every call, so mutating that object from
 * the page is **exactly** equivalent to editing the literal in the file — same object, same
 * reader, same code path — and `Guard._poseForShot` re-solves the subject off the live camera
 * on the `shot` event either way. So all four arms run in ONE boot, on a BYTE-IDENTICAL source
 * tree, with no edit to `src/core/Shots.js` at all.
 *
 * Three things that buys, all of which the seal's plan lacked:
 *   1. §121.4's hazard is gone by construction — the arms cannot differ by tree state.
 *   2. No window in which a modified `src/core/Shots.js` sits on disk while five other owners
 *      boot against it. The coordinator asked for "revert inside the hold before release";
 *      this never writes the file, which is the same guarantee with nothing to revert.
 *   3. `restore` vs `base` becomes a real determinism check inside one boot (P-F4).
 *
 * ARMS (PREREG-staging1 §1 / §2.2) — camera translated on x only, pos AND target together:
 *   base     pos [-11.50, 2.6, 30.5]  target [-17.00, 1.1, 28.0]   (shipped; also the under-move KB)
 *   cand     pos [-13.25, 2.6, 30.5]  target [-18.75, 1.1, 28.0]   (west 1.75 m)
 *   kbover   pos [-15.50, 2.6, 30.5]  target [-21.00, 1.1, 28.0]   (west 4.00 m — over-move KB)
 *   restore  pos [-11.50, 2.6, 30.5]  target [-17.00, 1.1, 28.0]   (P-F4)
 *
 * Frames + readbacks land INCREMENTALLY at progress/records/staging1/. Scoring is NOT here:
 *   node progress/records/staging1-score.mjs
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/staging1';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* The seal's values, restated here so drift against the file is loud rather than silent. */
const SHIPPED = { pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] };
const ARMS = [
  { id: 'base', pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] },
  { id: 'cand', pos: [-13.25, 2.6, 30.5], target: [-18.75, 1.1, 28.0] },
  { id: 'kbover', pos: [-15.5, 2.6, 30.5], target: [-21.0, 1.1, 28.0] },
  { id: 'restore', pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] },
];

const report = {
  prereg: 'PREREG-staging1.md',
  runner: 'progress/records/staging1.mjs',
  startedAt: new Date().toISOString(),
  srcTreeBefore: treeHash(),
  shippedExpected: SHIPPED,
  arms: [],
};
const save = () => writeFileSync(path.join(OUT, 'readback.json'), JSON.stringify(report, null, 1));
save();
log(`srcTree ${report.srcTreeBefore} — booting (own FIFO lock hold; harness acquires)`);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}; renderer ${info.renderer}`);
  report.boot = { warnings: info.warnings, renderer: info.renderer, modules: info.modules };
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 200)}`); });

  /* ---- LEVER PROBE, before anything is believed (§7: specified is not live) ------------- */
  const lever = await page.evaluate(async () => {
    const res = await window.__GAME.setShot('guard');
    window.__SG = res.shot;                       // the live SHOTS.guard object
    const gm = window.__ENGINE.get('guards');
    return {
      gotShotObject: !!window.__SG && Array.isArray(window.__SG.pos) && Array.isArray(window.__SG.target),
      livePos: window.__SG?.pos?.slice?.(),
      liveTarget: window.__SG?.target?.slice?.(),
      liveFov: window.__SG?.fov, liveTod: window.__SG?.tod,
      livePlayer: window.__SG?.player,
      camPos: window.__ENGINE.camera.position.toArray(),
      hasGuards: !!gm, guardCount: gm?.guards?.length ?? 0,
      hasShotLock: !!gm?._shotLock,
      hasSolver: typeof gm?._solveShotPose === 'function',
      shotNames: window.__GAME.shots,
    };
  });
  report.lever = lever;
  log(`LEVER ${JSON.stringify(lever)}`);
  save();

  if (!lever.gotShotObject) {
    log('FATAL: setShot() did not hand back a mutable SHOTS entry — the poke premise fails; NOTHING captured.');
    report.fatal = 'no mutable SHOTS entry'; save(); return;
  }
  if (!lever.hasGuards || lever.guardCount === 0) {
    log('FATAL: GUARDS module absent or roster empty — the shot has no subject; NOTHING captured.');
    report.fatal = 'no guards'; save(); return;
  }
  if (!lever.hasSolver) {
    log('FATAL: _solveShotPose absent — the subject is not being placed by the mechanism this seal reasons about.');
    report.fatal = 'no _solveShotPose'; save(); return;
  }
  const drift = ['pos', 'target'].some((k) => SHIPPED[k].some((v, i) => Math.abs(v - lever[k === 'pos' ? 'livePos' : 'liveTarget'][i]) > 1e-9));
  if (drift) log(`WARNING: shipped SHOTS.guard differs from the seal's values — tree drift; the base gates arbitrate.`);
  report.treeDrift = drift;
  save();

  /* ---- ARMS ---------------------------------------------------------------------------- */
  for (const arm of ARMS) {
    const png = path.join(OUT, `guard.${arm.id}.png`);
    if (existsSync(png)) { log(`arm ${arm.id}: frame present — skipping (idempotent resume)`); continue; }
    const ta = Date.now();

    const r = await page.evaluate(async (a) => {
      const THREE = window.__GAME.THREE;
      /* The arm: mutate the live shot table, then re-stage. `applyShot` re-reads pos/target and
         re-emits 'shot', so GUARDS re-solves the stand off the moved camera — which is the whole
         mechanism this seal rests on. */
      window.__SG.pos = a.pos.slice();
      window.__SG.target = a.target.slice();
      const res = await window.__GAME.setShot('guard');

      /* Settle (banda1's voidA lesson): 10 frozen frames + a thrown-away capture before any
         scored frame, so program compiles and the one-off async settle are absorbed. */
      await window.__GAME.step(10, 0);
      window.__GAME.capture('image/png');
      await window.__GAME.step(1, 0);

      const cam = window.__ENGINE.camera;
      const gm = window.__ENGINE.get('guards');
      const g = gm._shotLock || gm.guards[0];
      const proj = (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(cam);
        return [+((v.x * 0.5 + 0.5) * 1280).toFixed(1), +((1 - (v.y * 0.5 + 0.5)) * 720).toFixed(1), +v.z.toFixed(4)];
      };
      const gp = g?.position;
      const dataUrl = window.__GAME.capture('image/png');
      return {
        dataUrl,
        readback: {
          shotPos: window.__SG.pos.slice(), shotTarget: window.__SG.target.slice(),
          shotFov: window.__SG.fov, shotTod: window.__SG.tod,
          camPos: cam.position.toArray().map((v) => +v.toFixed(6)),
          camFov: cam.fov,
          tod: window.__ENGINE.debug.timeOfDay,
          guardIndex: gm.guards.indexOf(g),
          guardType: g?.type ?? null,
          guardLocked: !!gm._shotLock,
          guardPos: gp ? [+gp.x.toFixed(4), +gp.y.toFixed(4), +gp.z.toFixed(4)] : null,
          guardYaw: g ? +g.yaw.toFixed(4) : null,
          guardState: g?.state ?? null,
          feetPx: gp ? proj(gp.x, gp.y, gp.z) : null,
          headPx: gp ? proj(gp.x, gp.y + 1.95, gp.z) : null,
          /* every other guard in the roster, so "which body is in frame" is answerable later */
          roster: gm.guards.map((q, i) => ({ i, type: q.type, p: [+q.position.x.toFixed(2), +q.position.y.toFixed(2), +q.position.z.toFixed(2)] })),
          subject: res.subject, stats: res.stats, warnings: res.warnings?.length ?? 0,
        },
      };
    }, arm);

    writeFileSync(png, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    const rb = { arm: arm.id, want: { pos: arm.pos, target: arm.target }, secs: Math.round((Date.now() - ta) / 1000), ...r.readback };

    /* Arm-took assertion: if the camera is not where the arm asked, the arm never happened. */
    const took = arm.pos.every((v, i) => Math.abs(v - rb.camPos[i]) < 1e-4);
    rb.armTook = took;
    report.arms.push(rb);
    save();
    log(`arm ${arm.id} ${rb.secs}s  cam ${JSON.stringify(rb.camPos)} took=${took}  stand ${JSON.stringify(rb.guardPos)}  feet ${JSON.stringify(rb.feetPx?.slice(0, 2))} head ${JSON.stringify(rb.headPx?.slice(0, 2))}  -> ${path.basename(png)}`);
    if (!took) log(`  ARM-TOOK FAILED for ${arm.id} — the camera did not move to the arm's value; this frame is NOT the arm it claims.`);
  }

  /* Leave the table exactly as we found it, inside the hold, before the harness releases. */
  const restored = await page.evaluate((s) => {
    window.__SG.pos = s.pos.slice();
    window.__SG.target = s.target.slice();
    return { pos: window.__SG.pos.slice(), target: window.__SG.target.slice() };
  }, SHIPPED);
  report.tableRestored = restored;
  log(`shot table restored in-page to ${JSON.stringify(restored)} (nothing was ever written to src/**)`);
});

report.srcTreeAfter = treeHash();
report.finishedAt = new Date().toISOString();
report.sameTree = report.srcTreeBefore === report.srcTreeAfter;
save();
log(`DONE — srcTree before ${report.srcTreeBefore} after ${report.srcTreeAfter} same=${report.sameTree}`);

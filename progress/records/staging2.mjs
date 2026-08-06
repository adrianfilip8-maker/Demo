/**
 * staging2 — the registered capture for PREREG-staging2.md. STAGING owner, coordinator-dispatched.
 *
 * staging1's runner with four protocol repairs, each caused by something staging1 measured:
 *
 *   1. DISCARDED PREROLL STAGE (seal §2.1). staging1's first scored arm took 454 s against
 *      249/226/253 s and differed from committed sbs3 by 42% while `restore` — same camera,
 *      later in the same boot — reproduced it to 2.74%. Shader compile and texture prewarm
 *      landed inside the scored frame. staging2 stages `guard`, settles, captures and DISCARDS
 *      before any arm is scored. The discarded frame is still written (guard.preroll.png) so
 *      the repair is auditable rather than merely asserted.
 *   2. ARM ORDER preroll → base → cand → restore → KBmid → KBover (seal §2.4), so P-F4 brackets
 *      exactly the window the verdict depends on and a rollback loses only calibration.
 *   3. bootId ON EVERY ARM (seal §2.3, P-F8). The runner is per-arm resumable, so without this a
 *      rollback mid-run would silently produce a cross-boot comparison.
 *   4. PER-ARM WALL-TIME reported (seal §4, R5) — this run answers §185's open question: does the
 *      first-arm signature reappear once a preroll absorbs it?
 *
 * §186 ordering, and why it is vacuous here: there is NO on-disk install. `Debug.setShot()`
 * returns the live `SHOTS[name]` object (Debug.js:78, returned at :143) and `applyShot()` re-reads
 * .pos/.target every call, so the arms are runtime mutations of that object. Order is
 * acquire → boot → (install-in-page → capture) per arm → revert-in-page → release, and
 * src/core/Shots.js is never written. srcTree before/after is asserted (P-F8).
 *
 * Scoring is NOT here:  node progress/records/staging2-score.mjs
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/staging2';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

const SHIPPED = { pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] };

/* Seal §3. The ORDER is seal §2.4 and is load-bearing, not cosmetic. */
const ARMS = [
  { id: 'preroll', pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0], discard: true },
  { id: 'base', pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] },
  { id: 'cand', pos: [-13.25, 2.6, 30.5], target: [-18.75, 1.1, 28.0] },
  { id: 'restore', pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] },
  { id: 'KBmid', pos: [-12.5, 2.6, 30.5], target: [-18.0, 1.1, 28.0] },
  { id: 'KBover', pos: [-15.5, 2.6, 30.5], target: [-21.0, 1.1, 28.0] },
];

const BOOT_ID = randomUUID().slice(0, 12);

const report = {
  prereg: 'PREREG-staging2.md',
  runner: 'progress/records/staging2.mjs',
  bootId: BOOT_ID,
  startedAt: new Date().toISOString(),
  srcTreeBefore: treeHash(),
  shippedExpected: SHIPPED,
  armOrder: ARMS.map((a) => a.id),
  arms: [],
};
const save = () => writeFileSync(path.join(OUT, 'readback.json'), JSON.stringify(report, null, 1));
save();
log(`bootId ${BOOT_ID}  srcTree ${report.srcTreeBefore} — booting (harness takes the FIFO ticket)`);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}; renderer ${info.renderer}`);
  /* §192.1 — P-F8's tree clause must be read INSIDE the held lock. `srcTreeBefore` above is taken
     at process construction, before the FIFO ticket is granted, so on a queue that runs 20-60
     minutes deep it routinely samples a SIBLING runner's transient arm install rather than the
     tree this boot renders. That is what voided run r9: `before` 9fb6101f27556a12 was
     combatrecipient's `kbside` arm, `after` 4c83af2068ab9936 was base, and nothing drifted while
     this process was actually rendering. Both readings below are taken while the lock is held, so
     the comparison answers the declared question — did the tree move while I had exclusive
     access — and is immune to what siblings do in the queue. `srcTreeBefore` is kept and still
     reported, as the queue-wait observation it actually is. */
  report.srcTreeAtLock = treeHash();
  log(`srcTreeAtLock ${report.srcTreeAtLock} (pre-lock reading was ${report.srcTreeBefore}` +
      `${report.srcTreeAtLock === report.srcTreeBefore ? '' : ' — differs: a sibling held an arm during the queue wait'})`);
  report.boot = { warnings: info.warnings, renderer: info.renderer, modules: info.modules };
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 200)}`); });

  /* ---- LEVER PROBE, before anything is believed (§7: specified is not live) ------------- */
  const lever = await page.evaluate(async () => {
    /* §195.3: setShot at dt 0 — its internal seventeen settle frames were the clock leak that
       made P-F4's [0,0] band unachievable across arms (mean luma fell monotonically in capture
       order). Our own step() calls were already frozen; the staging path's were not, until the
       dt option existed. */
    const res = await window.__GAME.setShot('guard', { dt: 0 });
    window.__SG = res.shot;                       // the live SHOTS.guard object
    const gm = window.__ENGINE.get('guards');
    return {
      gotShotObject: !!window.__SG && Array.isArray(window.__SG.pos) && Array.isArray(window.__SG.target),
      livePos: window.__SG?.pos?.slice?.(),
      liveTarget: window.__SG?.target?.slice?.(),
      liveFov: window.__SG?.fov, liveTod: window.__SG?.tod,
      hasGuards: !!gm, guardCount: gm?.guards?.length ?? 0,
      hasSolver: typeof gm?._solveShotPose === 'function',
    };
  });
  report.lever = lever;
  log(`LEVER ${JSON.stringify(lever)}`);
  save();

  if (!lever.gotShotObject) { report.fatal = 'no mutable SHOTS entry'; save(); log('FATAL: no mutable SHOTS entry'); return; }
  if (!lever.hasGuards || lever.guardCount === 0) { report.fatal = 'no guards'; save(); log('FATAL: no guards'); return; }
  if (!lever.hasSolver) { report.fatal = 'no _solveShotPose'; save(); log('FATAL: no _solveShotPose'); return; }

  const drift = SHIPPED.pos.some((v, i) => Math.abs(v - lever.livePos[i]) > 1e-9)
    || SHIPPED.target.some((v, i) => Math.abs(v - lever.liveTarget[i]) > 1e-9);
  report.treeDrift = drift;
  if (drift) log('WARNING: shipped SHOTS.guard differs from the seal\'s values — tree drift; base gates arbitrate.');
  save();

  /* ---- ARMS ---------------------------------------------------------------------------- */
  for (const arm of ARMS) {
    const png = path.join(OUT, `guard.${arm.id}.png`);
    if (existsSync(png)) { log(`arm ${arm.id}: frame present — skipping (idempotent resume; P-F8 will catch a cross-boot mix)`); continue; }
    const ta = Date.now();

    const r = await page.evaluate(async (a) => {
      const THREE = window.__GAME.THREE;
      /* The arm: mutate the live shot table, then re-stage. `applyShot` re-reads pos/target and
         re-emits 'shot', so GUARDS re-solves the stand off the moved camera. */
      window.__SG.pos = a.pos.slice();
      window.__SG.target = a.target.slice();
      const res = await window.__GAME.setShot('guard', { dt: 0 });   // §195.3: frozen staging path

      /* Settle: 10 frozen frames + a thrown-away capture before the scored frame. Sufficient for
         a stage that is not the boot's first — which is what the preroll arm now guarantees. */
      await window.__GAME.step(10, 0);
      window.__GAME.capture('image/png');
      await window.__GAME.step(1, 0);

      const cam = window.__ENGINE.camera;
      const gm = window.__ENGINE.get('guards');
      const g = gm._shotLock || gm.guards[0];
      const proj = (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(cam);
        return [+((v.x * 0.5 + 0.5) * 1280).toFixed(1), +((1 - (v.y * 0.5 + 0.5)) * 720).toFixed(1)];
      };
      const gp = g?.position;
      const dataUrl = window.__GAME.capture('image/png');
      return {
        dataUrl,
        readback: {
          shotPos: window.__SG.pos.slice(), shotTarget: window.__SG.target.slice(),
          camPos: cam.position.toArray().map((v) => +v.toFixed(6)),
          camFov: cam.fov, tod: window.__ENGINE.debug.timeOfDay,
          guardIndex: gm.guards.indexOf(g), guardType: g?.type ?? null,
          guardLocked: !!gm._shotLock,
          guardPos: gp ? [+gp.x.toFixed(4), +gp.y.toFixed(4), +gp.z.toFixed(4)] : null,
          guardYaw: g ? +g.yaw.toFixed(4) : null,
          feetPx: gp ? proj(gp.x, gp.y, gp.z) : null,
          headPx: gp ? proj(gp.x, gp.y + 1.95, gp.z) : null,
          roster: gm.guards.map((q, i) => ({ i, type: q.type, p: [+q.position.x.toFixed(2), +q.position.y.toFixed(2), +q.position.z.toFixed(2)] })),
          subject: res.subject, stats: res.stats, warnings: res.warnings?.length ?? 0,
        },
      };
    }, arm);

    writeFileSync(png, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    const took = arm.pos.every((v, i) => Math.abs(v - r.readback.camPos[i]) < 1e-4);
    const rb = {
      arm: arm.id, bootId: BOOT_ID, discard: !!arm.discard,
      want: { pos: arm.pos, target: arm.target },
      wallSecs: Math.round((Date.now() - ta) / 1000),
      armTook: took, ...r.readback,
    };
    report.arms.push(rb);
    save();
    log(`arm ${arm.id}${arm.discard ? ' (DISCARDED — preroll)' : ''} ${rb.wallSecs}s  cam ${JSON.stringify(rb.camPos)} took=${took}  stand ${JSON.stringify(rb.guardPos)}  feet ${JSON.stringify(rb.feetPx)} head ${JSON.stringify(rb.headPx)}`);
    if (!took) log(`  P-F7: ARM-TOOK FAILED for ${arm.id} — this frame is NOT the arm it claims.`);
  }

  /* Revert in-page, inside the hold, before the harness releases (§186 — nothing on disk to undo). */
  const restored = await page.evaluate((s) => {
    window.__SG.pos = s.pos.slice();
    window.__SG.target = s.target.slice();
    return { pos: window.__SG.pos.slice(), target: window.__SG.target.slice() };
  }, SHIPPED);
  report.tableRestored = restored;
  log(`shot table restored in-page to ${JSON.stringify(restored)} (src/** never written)`);
  report.srcTreeAtRelease = treeHash();       // §192.1 — still inside the held lock
});

report.srcTreeAfter = treeHash();
report.finishedAt = new Date().toISOString();
/* §192.1: P-F8's tree clause is now the in-lock pair. `srcTreeBefore`/`srcTreeAfter` are both
   taken outside the lock and are retained as reported observations only. */
report.sameTree = report.srcTreeAtLock === report.srcTreeAtRelease;
report.sameTreeOutsideLock = report.srcTreeBefore === report.srcTreeAfter;
save();
log(`DONE — srcTree before ${report.srcTreeBefore} after ${report.srcTreeAfter} same=${report.sameTree}`);
log(`wall-times: ${report.arms.map((a) => `${a.arm} ${a.wallSecs}s`).join('  ')}   <- §185's question`);

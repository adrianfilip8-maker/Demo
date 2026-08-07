/**
 * staging3-derive — the DERIVATION capture for the staging2 re-seal (§195.4). Not a scored run.
 *
 * §195.4 orders a re-seal whose bands come from frozen-clock base frames, with P-F4's band set
 * from a MEASURED restage floor — "two consecutive dt-0 stagings of the same arm" — rather than
 * asserted [0,0]. §197 adds the second reason this capture must be fresh rather than recycled
 * from r12: the §196 character ship sits between r12 and today, and SHOTS.guard places the
 * player, so r12's committed frames describe a tree that no longer exists (the exact defect that
 * voided litwarm r11).
 *
 * Three stages, one boot, shipped vectors only:
 *
 *   preroll  (DISCARDED)  absorbs first-stage shader compile — staging2 §2.1's repair, kept
 *   deriveA               the base anchor frame: base gates + base-side absolutes come from here
 *   deriveB               an immediate second restage of the SAME vectors: applyShot -> GUARDS
 *                         re-solve -> settle -> capture. |deriveA - deriveB| is the restage
 *                         floor P-F4's band is derived from.
 *
 * Everything else is staging2.mjs's protocol verbatim: dt:0 at every staging and step (§195.3),
 * in-lock srcTree pair (§192.1), bootId on every stage, armTook probe, per-stage wall time
 * (§185's question), no src/** writes, no git (coordinator sweeps by filename).
 *
 * Analysis is NOT here: staging3-derive-analyze.mjs reads the two frames after DONE.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/staging3';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

const SHIPPED = { pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] };

const STAGES = [
  { id: 'preroll', discard: true },
  { id: 'deriveA' },
  { id: 'deriveB' },
];

const BOOT_ID = randomUUID().slice(0, 12);

const report = {
  purpose: 'derivation capture for the §195.4 re-seal (PREREG-staging3) — not a scored run',
  runner: 'progress/records/staging3-derive.mjs',
  bootId: BOOT_ID,
  startedAt: new Date().toISOString(),
  srcTreeBefore: treeHash(),
  shipped: SHIPPED,
  stageOrder: STAGES.map((s) => s.id),
  stages: [],
};
const save = () => writeFileSync(path.join(OUT, 'readback-derive.json'), JSON.stringify(report, null, 1));
save();
log(`bootId ${BOOT_ID}  srcTree ${report.srcTreeBefore} — booting (harness takes the FIFO ticket)`);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}; renderer ${info.renderer}`);
  report.srcTreeAtLock = treeHash();   // §192.1: read inside the held lock
  log(`srcTreeAtLock ${report.srcTreeAtLock}${report.srcTreeAtLock === report.srcTreeBefore ? '' : ' (pre-lock reading differed — sibling arm during queue wait, observed not fatal)'}`);
  report.boot = { warnings: info.warnings, renderer: info.renderer };
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 200)}`); });

  /* Lever probe — same assertions as staging2.mjs, because a derivation frame from a boot with
     no guards or no solver would anchor the seal on a broken scene. */
  const lever = await page.evaluate(async () => {
    const res = await window.__GAME.setShot('guard', { dt: 0 });
    window.__SG = res.shot;
    const gm = window.__ENGINE.get('guards');
    const c = window.__ENGINE.get('character');
    return {
      gotShotObject: !!window.__SG && Array.isArray(window.__SG.pos) && Array.isArray(window.__SG.target),
      livePos: window.__SG?.pos?.slice?.(), liveTarget: window.__SG?.target?.slice?.(),
      liveTod: window.__SG?.tod,
      hasGuards: !!gm, guardCount: gm?.guards?.length ?? 0,
      hasSolver: typeof gm?._solveShotPose === 'function',
      characterRoot: c?.root?.name ?? null,   // §197: record WHICH character this tree stages
    };
  });
  report.lever = lever;
  log(`LEVER ${JSON.stringify(lever)}`);
  save();
  if (!lever.gotShotObject || !lever.hasGuards || lever.guardCount === 0 || !lever.hasSolver) {
    report.fatal = 'lever probe failed'; save(); log('FATAL: lever probe failed'); return;
  }
  const drift = SHIPPED.pos.some((v, i) => Math.abs(v - lever.livePos[i]) > 1e-9)
    || SHIPPED.target.some((v, i) => Math.abs(v - lever.liveTarget[i]) > 1e-9);
  report.treeDrift = drift;
  if (drift) log('WARNING: shipped SHOTS.guard differs from the recorded shipped vectors.');
  save();

  for (const st of STAGES) {
    const png = path.join(OUT, `guard.${st.id}.png`);
    if (existsSync(png)) { log(`stage ${st.id}: frame present — skipping (idempotent resume)`); continue; }
    const ta = Date.now();
    const r = await page.evaluate(async (shipped) => {
      const THREE = window.__GAME.THREE;
      /* The restage cycle under measurement: same vectors, full applyShot -> re-solve path. */
      window.__SG.pos = shipped.pos.slice();
      window.__SG.target = shipped.target.slice();
      const res = await window.__GAME.setShot('guard', { dt: 0 });
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
      return {
        dataUrl: window.__GAME.capture('image/png'),
        readback: {
          camPos: cam.position.toArray().map((v) => +v.toFixed(6)),
          tod: window.__ENGINE.debug.timeOfDay,
          guardLocked: !!gm._shotLock,
          guardPos: gp ? [+gp.x.toFixed(4), +gp.y.toFixed(4), +gp.z.toFixed(4)] : null,
          feetPx: gp ? proj(gp.x, gp.y, gp.z) : null,
          headPx: gp ? proj(gp.x, gp.y + 1.95, gp.z) : null,
          subject: res.subject, stats: res.stats,
        },
      };
    }, SHIPPED);
    writeFileSync(png, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    const took = SHIPPED.pos.every((v, i) => Math.abs(v - r.readback.camPos[i]) < 1e-4);
    const rb = {
      stage: st.id, bootId: BOOT_ID, discard: !!st.discard,
      wallSecs: Math.round((Date.now() - ta) / 1000), armTook: took, ...r.readback,
    };
    report.stages.push(rb);
    save();
    log(`stage ${st.id}${st.discard ? ' (DISCARDED — preroll)' : ''} ${rb.wallSecs}s  cam ${JSON.stringify(rb.camPos)} took=${took}  feet ${JSON.stringify(rb.feetPx)} head ${JSON.stringify(rb.headPx)}`);
    if (!took) log(`  ARM-TOOK FAILED on ${st.id} — derivation frame invalid`);
  }

  report.srcTreeAtRelease = treeHash();   // §192.1 — still inside the held lock
});

report.srcTreeAfter = treeHash();
report.finishedAt = new Date().toISOString();
report.sameTree = report.srcTreeAtLock === report.srcTreeAtRelease;
save();
log(`DONE — in-lock tree pair same=${report.sameTree}; wall-times ${report.stages.map((s) => `${s.stage} ${s.wallSecs}s`).join('  ')}`);

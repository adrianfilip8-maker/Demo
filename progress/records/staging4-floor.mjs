/**
 * staging4-floor — the discriminating capture §198 ordered, and it registers no verdict.
 *
 * THE QUESTION. staging3's P-F4 fired at 110 px with the residue localized to one upper-right
 * sky cluster and 0 of 110 px inside any measured rect (RESULT-staging3). Two mechanisms fit the
 * same data and that capture could not separate them:
 *
 *   (a) PATH-DEPENDENCE — the `cand` excursion leaves state that survives the restage back;
 *   (b) BOOT-AGE DRIFT  — something in the sky/FX advances with elapsed stages or wall-time
 *                          regardless of where the camera goes.
 *
 * They were confounded because excursion-count, restage-count and elapsed time all rose together:
 * the no-excursion pair (deriveA→deriveB, 240 s, one restage) read maxΣ|Δ| 1, and the
 * through-cand pair (478 s, two restages) read 18.
 *
 * THE DESIGN. One boot, six stages, EVERY ONE at the shipped vectors — the camera never moves,
 * so excursion-count is pinned at zero while restage-count and elapsed time run their full range.
 * Then:
 *   · residue grows with stage index anyway  ⇒ (b) boot-age drift; path-dependence is dead, and
 *     P-F4's frame-wide [0,0] is unachievable for any two stages far enough apart in a boot;
 *   · every same-vector pair stays at 0 px   ⇒ (a) survives — the excursion is implicated, and
 *     the next seal's protocol must bracket restore adjacent to base.
 *
 * §198 replaced §4.2's registered `base → cand → restore → restore2` shape with this one, in the
 * open and for a stated reason: restore2 holds excursion-count fixed at ONE, so it cannot
 * separate (a) from (b) either. No band moves as a result — staging3 stays VOID.
 *
 * Protocol carried from staging3.mjs verbatim: dt:0 at every setShot and step (§195), discarded
 * preroll to absorb first-stage compile (§185), bootId on every stage (P-F8's shape), in-lock
 * srcTree pair (§192.1), armTook probe, per-stage wall-time, no src/** writes, no git.
 *
 * Analysis is separate: staging4-floor-analyze.mjs.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/staging4';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

const SHIPPED = { pos: [-11.5, 2.6, 30.5], target: [-17.0, 1.1, 28.0] };
/* Six stages, identical vectors. s1..s5 are scored; preroll is discarded. */
const STAGES = ['preroll', 's1', 's2', 's3', 's4', 's5'];
const BOOT_ID = randomUUID().slice(0, 12);

const report = {
  purpose: 'discriminating capture for §198: does restage residue grow with stage index when the camera NEVER moves?',
  runner: 'progress/records/staging4-floor.mjs',
  bootId: BOOT_ID,
  startedAt: new Date().toISOString(),
  srcTreeBefore: treeHash(),
  shipped: SHIPPED,
  stageOrder: STAGES,
  stages: [],
};
const save = () => writeFileSync(path.join(OUT, 'readback-floor.json'), JSON.stringify(report, null, 1));
save();
log(`bootId ${BOOT_ID}  srcTree ${report.srcTreeBefore} — booting (harness takes the FIFO ticket)`);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);
  report.srcTreeAtLock = treeHash();
  report.boot = { warnings: info.warnings, renderer: info.renderer };
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 200)}`); });

  const lever = await page.evaluate(async () => {
    const res = await window.__GAME.setShot('guard', { dt: 0 });
    window.__SG = res.shot;
    const gm = window.__ENGINE.get('guards');
    return {
      ok: !!window.__SG && Array.isArray(window.__SG.pos),
      livePos: window.__SG?.pos?.slice?.(), guardCount: gm?.guards?.length ?? 0,
      character: window.__ENGINE.get('character')?.root?.name ?? null,
    };
  });
  report.lever = lever;
  log(`LEVER ${JSON.stringify(lever)}`);
  save();
  if (!lever.ok || !lever.guardCount) { report.fatal = 'lever probe failed'; save(); return; }

  for (const id of STAGES) {
    const png = path.join(OUT, `guard.${id}.png`);
    if (existsSync(png)) { log(`stage ${id}: present — skipping (idempotent resume)`); continue; }
    const t = Date.now();
    const r = await page.evaluate(async (shipped) => {
      /* The camera is re-ASSIGNED the same values every stage, so the full
         applyShot -> GUARDS re-solve -> settle path runs identically each time. */
      window.__SG.pos = shipped.pos.slice();
      window.__SG.target = shipped.target.slice();
      const res = await window.__GAME.setShot('guard', { dt: 0 });
      await window.__GAME.step(10, 0);
      window.__GAME.capture('image/png');
      await window.__GAME.step(1, 0);
      const cam = window.__ENGINE.camera;
      const gm = window.__ENGINE.get('guards');
      const g = gm._shotLock || gm.guards[0];
      return {
        dataUrl: window.__GAME.capture('image/png'),
        readback: {
          camPos: cam.position.toArray().map((v) => +v.toFixed(6)),
          guardPos: g?.position ? [+g.position.x.toFixed(4), +g.position.y.toFixed(4), +g.position.z.toFixed(4)] : null,
          tod: window.__ENGINE.debug.timeOfDay, stats: res.stats,
        },
      };
    }, SHIPPED);
    writeFileSync(png, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    const took = SHIPPED.pos.every((v, i) => Math.abs(v - r.readback.camPos[i]) < 1e-4);
    report.stages.push({
      stage: id, bootId: BOOT_ID, discard: id === 'preroll',
      wallSecs: Math.round((Date.now() - t) / 1000),
      elapsedSecs: Math.round((Date.now() - T0) / 1000),
      armTook: took, ...r.readback,
    });
    save();
    log(`stage ${id} ${report.stages.at(-1).wallSecs}s (elapsed ${report.stages.at(-1).elapsedSecs}s)  took=${took}  guard ${JSON.stringify(r.readback.guardPos)}`);
  }
  report.srcTreeAtRelease = treeHash();
});

report.finishedAt = new Date().toISOString();
report.sameTree = report.srcTreeAtLock === report.srcTreeAtRelease;
save();
log(`DONE — in-lock tree pair same=${report.sameTree}`);

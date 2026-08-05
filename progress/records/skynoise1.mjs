/**
 * skynoise1 — the registered capture for PREREG-skynoise.md §8. SKY owner.
 *
 * Four §164 chunks, each its OWN withGame boot (own FIFO lock hold, released between
 * chunks), arms as sealed — live pokes of a running page, never rebuilds (§124.4 makes
 * mid-boot tree edits inert; the bundle is fixed at boot):
 *
 *   A courtyard   base / cand / flat / restore
 *   B night       base / cand / flat / restore
 *   C dunes       base / cand / flat / restore
 *   D hero        base / cand / restore            (regression watch; no flat arm)
 *
 *   base    = shipped uniforms, untouched (known-bad #1: the measured marbled state)
 *   cand    = PREREG §3's six numbers:  uDeckScale (0.000105, 0.000138, 0.000105)
 *                                       uDeckSoft  (0.36, 0.38, 0.40)
 *   flat    = uCloudCover (9,9,9) at shipped scale/soft (known-bad #2: poster sky —
 *             a REJECT reading by seal, present so the metric has both ends of its scale)
 *   restore = shipped values poked back. P-F4: must be BIT-IDENTICAL to base (0 px at
 *             ΣRGB>=4) or every arm number in the boot is void. Identity is expected
 *             because all inter-arm stepping is step(1, dt=0) — the world clock stands
 *             still (Debug.js's own §28 note), so drift cannot move the clouds.
 *
 * ORDERING TRAP (sealed in PREREG §8): setShot FIRST, then read the shipped originals,
 * then poke. `setShot` emits `timeOfDay` → `Sky._refresh()` → `evalAtmosphere` rewrites
 * uCloudCover.value (a Vector3 SHARED with the atmosphere state), so any cover poked
 * before staging is silently reverted. Never re-setShot inside an arm.
 *
 * Durability (§163/§164): every arm's PNG + the chunk's readback JSON are written the
 * moment they exist, to committed paths under progress/records/skynoise1/<chunk>/.
 * Idempotent resume: a chunk whose every frame already exists is skipped, so a rollback
 * mid-run costs only the chunk in flight — relaunch and it continues.
 *
 * Provenance: src-tree sha256 (§121.4 — the SHA lies under concurrent owners; and no git
 * commands in this task by coordinator instruction), re-read after every chunk.
 *
 * Scoring is NOT here (pnight1's rule: a frame producer scores nothing). Score offline:
 *   node progress/records/skynoise-diag.mjs score progress/records/skynoise1
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/skynoise1';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* PREREG-skynoise.md §3 — the six registered numbers. Do not touch anything else. */
const CAND = { scale: [0.000105, 0.000138, 0.000105], soft: [0.36, 0.38, 0.40] };
/* Shipped values, restated so a readback mismatch is loud rather than silent (drift guard:
   skynoise-diag.mjs asserts the same numbers out of Sky.js source). */
const SHIP = { scale: [0.0003, 0.00052, 0.00088], soft: [0.30, 0.16, 0.09] };

const CHUNKS = [
  { id: 'A', shot: 'courtyard', arms: ['base', 'cand', 'flat', 'restore'] },
  { id: 'B', shot: 'night', arms: ['base', 'cand', 'flat', 'restore'] },
  { id: 'C', shot: 'dunes', arms: ['base', 'cand', 'flat', 'restore'] },
  { id: 'D', shot: 'hero', arms: ['base', 'cand', 'restore'] },
];

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].toUpperCase() : null;

for (const chunk of CHUNKS) {
  if (only && chunk.id !== only) continue;
  const dir = path.join(OUT, chunk.id);
  mkdirSync(dir, { recursive: true });
  const done = chunk.arms.every((a) => existsSync(path.join(dir, `${chunk.shot}.${a}.png`)));
  if (done) { log(`chunk ${chunk.id} (${chunk.shot}): all frames present — skipping (idempotent resume)`); continue; }

  const report = {
    prereg: 'PREREG-skynoise.md', chunk: chunk.id, shot: chunk.shot,
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(),
    cand: CAND, shipExpected: SHIP, arms: [],
  };
  const save = () => writeFileSync(path.join(dir, 'readback.json'), JSON.stringify(report, null, 1));
  save();
  log(`chunk ${chunk.id} (${chunk.shot}): srcTree ${report.srcTreeBefore} — booting (own lock hold)`);

  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 30 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
    for (const w of info.warnings || []) log(`    WARN ${w}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });

    /* Lever probe BEFORE anything is believed (§7: specified is not live). */
    const lever = await page.evaluate(() => {
      const sky = window.__ENGINE?.get?.('sky');
      const u = sky?._u;
      return {
        hasSky: !!sky, hasScale: !!u?.uDeckScale, hasSoft: !!u?.uDeckSoft, hasCover: !!u?.uCloudCover,
        scale: u ? u.uDeckScale.value.toArray() : null,
        soft: u ? u.uDeckSoft.value.toArray() : null,
      };
    });
    report.lever = lever;
    log(`  LEVER ${JSON.stringify(lever)}`);
    save();
    if (!lever.hasScale || !lever.hasSoft || !lever.hasCover) {
      log(`  FATAL: sky deck uniforms absent — chunk ${chunk.id} void, no captures taken`);
      report.fatal = 'deck uniforms absent';
      save();
      return;
    }
    const shipMatch = lever.scale.every((v, i) => Math.abs(v - SHIP.scale[i]) < 1e-9)
      && lever.soft.every((v, i) => Math.abs(v - SHIP.soft[i]) < 1e-9);
    if (!shipMatch) log(`  WARNING: shipped uniforms differ from PREREG's expected ship values — tree drift; base gate will arbitrate`);

    const t1 = Date.now();
    const staged = await page.evaluate(async (n) => {
      const r = await window.__GAME.setShot(n);
      return { stats: r?.stats, warnings: r?.warnings?.length };
    }, chunk.shot);
    log(`  setShot(${chunk.shot}) ${((Date.now() - t1) / 1000).toFixed(0)}s  draws ${staged.stats?.drawCalls} tris ${staged.stats?.triangles}`);
    report.setShot = staged;
    save();

    /* Originals read AFTER setShot (the ordering trap above). */
    const ORIG = await page.evaluate(() => {
      const u = window.__ENGINE.get('sky')._u;
      return {
        scale: u.uDeckScale.value.toArray(), soft: u.uDeckSoft.value.toArray(),
        cover: u.uCloudCover.value.toArray(), time: u.uTime.value,
        tod: window.__ENGINE.debug.timeOfDay,
      };
    });
    report.orig = ORIG;
    log(`  originals: scale [${ORIG.scale}] soft [${ORIG.soft}] cover [${ORIG.cover.map((v) => v.toFixed(3))}] tod ${ORIG.tod} uTime ${ORIG.time.toFixed(2)}`);
    save();

    for (const arm of chunk.arms) {
      const ta = Date.now();
      const pokes = {
        base: { scale: ORIG.scale, soft: ORIG.soft, cover: ORIG.cover },
        cand: { scale: CAND.scale, soft: CAND.soft, cover: ORIG.cover },
        flat: { scale: ORIG.scale, soft: ORIG.soft, cover: [9, 9, 9] },
        restore: { scale: ORIG.scale, soft: ORIG.soft, cover: ORIG.cover },
      }[arm];
      const r = await page.evaluate(async (p) => {
        const u = window.__ENGINE.get('sky')._u;
        u.uDeckScale.value.fromArray(p.scale);
        u.uDeckSoft.value.fromArray(p.soft);
        u.uCloudCover.value.fromArray(p.cover);
        await window.__GAME.step(1, 0);          // dt=0: world clock frozen between arms
        const dataUrl = window.__GAME.capture('image/png');
        return {
          readback: {
            scale: u.uDeckScale.value.toArray(), soft: u.uDeckSoft.value.toArray(),
            cover: u.uCloudCover.value.toArray(), time: u.uTime.value,
          },
          dataUrl,
        };
      }, pokes);
      const mism = ['scale', 'soft', 'cover'].filter((k) => r.readback[k].some((v, i) => Math.abs(v - pokes[k][i]) > 1e-9));
      const file = path.join(dir, `${chunk.shot}.${arm}.png`);
      writeFileSync(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      log(`  ${arm.padEnd(8)} ${((Date.now() - ta) / 1000).toFixed(0)}s  scale [${r.readback.scale}]  soft [${r.readback.soft}]  cover [${r.readback.cover.map((v) => v.toFixed(2))}]  uTime ${r.readback.time.toFixed(2)}  ${mism.length ? 'POKE MISMATCH ' + mism.join(',') : 'applied ok'}  → ${path.basename(file)}`);
      report.arms.push({ arm, requested: pokes, readback: r.readback, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
      save();
    }

    report.srcTreeAfter = treeHash();
    report.finishedAt = new Date().toISOString();
    log(`  chunk ${chunk.id} done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
    save();
  });
  log(`chunk ${chunk.id}: lock released`);
}
log('ALL DONE');

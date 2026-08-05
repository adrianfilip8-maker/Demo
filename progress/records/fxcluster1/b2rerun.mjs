/**
 * b2rerun — the CORRECTED re-run of PREREG-fxcluster sub-arm B (sparkle staging preroll).
 * Registered successor run named in RESULT-fxcluster §3: the first letter's verdict was
 * UNSCOREABLE — mechanism PROVEN (base 0 ≤ 10, cand 440 ∈ [60,4000]) but the restore gate
 * read 440 vs ≤5, because the preroll's born-stamp back-dating persists after the flag
 * re-asserts OFF: SparkleField.mark() writes `born` only for NEW keys (Particles.js:1650-1654),
 * so re-marking a known key keeps the poked −0.25 stamp forever. Toggling the flag restores
 * nothing the flag did not itself write.
 *
 * CORRECTED DESIGN — RESTORE BY RE-STAGE: the restore arm (1) deletes the flag, (2) wipes
 * ONLY the field's marker-identity table (count/instanceCount/_keys/_seen), then (3) runs a
 * fresh setShot('traversal') staging pass, so every marker key is NEW to mark() and every
 * born stamp is REBUILT from scratch by the shipped staging path itself — not poked back by
 * hand. The probe proves provenance: pre-poke born = −0.25 (cand contamination), post-restage
 * born ≥ 0 (epoch-1 stamps ≈ 0.0167/0.05, matching base's measured distribution), pop ≤ 0.15.
 *
 * One boot, traversal only, arms base → cand (debug.sparklePreroll=true, re-setShot)
 * → restore-by-restage. Bands (PREREG-fxcluster §1 sub-arm B, unchanged — this run re-scores
 * the SAME seal): Q-B1 hook-disc bright-blue base ≤ 10, cand [60,4000]; Q-B2 strict band
 * [10,3000] NON-GATING; restore ≡ base |Δ| ≤ 5 px on Q-B1. §141: if restore-by-restage still
 * fails ≤5 that is a REAL finding about staging determinism — record mechanism, do not
 * iterate designs mid-run.
 *
 * NO SRC EDITS: the sub-arm B seam is already COMMITTED in src/fx/Particles.js (verified
 * inert by the first run's base arm). This runner VERIFIES the seams and ABORTS if absent.
 * Frames + readbacks INCREMENTALLY to progress/records/fxcluster1/, b2-prefixed
 * (b2-traversal.<arm>.png, b2-readback.json). Per-chunk resumable: if all three frames
 * exist the chunk is skipped; a partial chunk re-runs WHOLE in a fresh boot (registered
 * pairs stay within one boot). FIFO capture lock via tools/harness.mjs → tools/lock.mjs
 * (queues politely behind any banda2 hold). Scoring is NOT here: the sealed
 * fxcluster1/fxcluster-diag.mjs + score-aux.mjs run offline afterwards (b2score.mjs).
 * No git — the coordinator sweeps.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const OUT = path.join(ROOT, 'progress/records/fxcluster1');
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);
const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

/* ============================================================ seam VERIFICATION (no edits) */

const SEAM_PROBES = [
  { file: 'src/fx/Particles.js', probe: 'preroll(sec)', name: 'B-a SparkleField.preroll' },
  { file: 'src/fx/Particles.js', probe: 'sparklePreroll', name: 'B-b _stageShot debug gate' },
];
for (const s of SEAM_PROBES) {
  if (!readFileSync(path.join(ROOT, s.file), 'utf8').includes(s.probe)) {
    log(`FATAL: committed seam [${s.name}] absent from ${s.file} — this run may not edit src/**; ABORT before any capture`);
    process.exit(2);
  }
}
log(`seam verify: both sub-arm B seams present in src/fx/Particles.js (srcTree ${treeHash()})`);

/* ================================================================ shared helpers
   (armCapture/probeSparkle carried verbatim from the registered fxcluster1.mjs runner —
   same staging, settle, readback and incremental-write discipline.) */

const FRAME = (arm) => path.join(OUT, `b2-traversal.${arm}.png`);

function makeReport() {
  const report = {
    prereg: 'PREREG-fxcluster.md (sub-arm B, corrected re-run per RESULT-fxcluster §3)',
    chunk: 'b2',
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, 'b2-readback.json'), JSON.stringify(report, null, 1));
  save();
  return { report, save };
}

/** Stage + settle + probe + capture one arm. `pokeFn`/`probeFn` run in the page. */
async function armCapture(page, report, save, shot, arm, { poke = null, pokeArg = null, restage = true, probe = null } = {}) {
  const ta = Date.now();
  const row = { shot, arm, at: new Date().toISOString() };
  if (poke) row.poke = await page.evaluate(poke, pokeArg);
  if (restage) {
    row.setShot = await page.evaluate(async (n) => {
      const r = await window.__GAME.setShot(n);
      return {
        tod: window.__ENGINE.debug.timeOfDay,
        drift: r?.subject?.drift, onScreen: r?.subject?.onScreen,
        draws: r?.stats?.drawCalls, tris: r?.stats?.triangles, warnings: r?.warnings?.length,
      };
    }, shot);
    /* Settle per banda's voidA lesson: frozen steps + one thrown-away capture absorb program
       compiles and the one-off async settle BEFORE any scored frame. dt=0 — world clock
       frozen, so arms differ only by their poke. */
    await page.evaluate(async () => { await window.__GAME.step(10, 0); window.__GAME.capture('image/png'); });
  }
  if (probe) row.probe = await page.evaluate(probe);
  const dataUrl = await page.evaluate(() => window.__GAME.capture('image/png'));
  writeFileSync(FRAME(arm), Buffer.from(dataUrl.split(',')[1], 'base64'));
  row.cam = await page.evaluate(() => {
    const c = window.__ENGINE.camera; const d = new window.__GAME.THREE.Vector3();
    c.getWorldDirection(d);
    return { pos: c.position.toArray().map((v) => +v.toFixed(3)), fwd: d.toArray().map((v) => +v.toFixed(3)), fov: c.fov };
  });
  row.tod = await page.evaluate(() => window.__ENGINE.debug.timeOfDay);
  row.srcAtArm = treeHash();
  row.secs = Math.round((Date.now() - ta) / 1000);
  report.arms.push(row); save();
  log(`  ${shot}.${arm.padEnd(8)} ${String(row.secs).padStart(3)}s  tod ${row.tod}  ${JSON.stringify(row.probe ?? {}).slice(0, 220)}`);
  return row;
}

const probeSparkle = () => {
  const e = window.__ENGINE;
  const fx = e.get('fx');
  const sp = fx?.sparkles;
  const uTime = sp?.material?.uniforms?.uTime?.value ?? null;
  const mk = [];
  if (sp) {
    for (let i = 0; i < Math.min(sp.count, 24); i++) {
      const born = sp.aData.array[i * 4 + 2];
      const dtb = uTime - born;
      const t = Math.min(1, Math.max(0, dtb / 0.22));
      mk.push({
        pos: [sp.aPos.array[i * 3], sp.aPos.array[i * 3 + 1], sp.aPos.array[i * 3 + 2]].map((v) => +v.toFixed(2)),
        born: +born.toFixed(4), pop: +(t * t * (3 - 2 * t)).toFixed(3),
      });
    }
  }
  return {
    sparklePreroll: e.debug.sparklePreroll ?? null,
    hasPreroll: typeof sp?.preroll === 'function',
    count: sp?.count ?? null, uTime: uTime === null ? null : +uTime.toFixed(4),
    playerPos: e.get('movement')?.position?.toArray().map((v) => +v.toFixed(2)) ?? null,
    markers: mk,
  };
};

/* ================================================================ chunk b2 */

async function chunkB2() {
  const frames = ['base', 'cand', 'restore'].map(FRAME);
  if (frames.every(existsSync)) { log('chunk b2: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport();
  log(`chunk b2 (traversal only): srcTree ${report.srcTreeBefore} — booting (own FIFO lock hold; a banda2 capture may be ahead — queueing politely)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — renderer ${info.renderer?.slice(0, 40)} warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    /* Lever probe before anything is believed (§7): the seam must be IN THIS BOOT's bundle. */
    const lever = await page.evaluate(() => {
      const fx = window.__ENGINE?.get?.('fx');
      return {
        hasEMITTERS: !!fx?.EMITTERS,
        hasPreroll: typeof fx?.sparkles?.preroll === 'function',
        flagAtBoot: window.__ENGINE?.debug?.sparklePreroll ?? null,
      };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever)}`);
    if (!lever.hasPreroll) {
      report.fatal = 'sub-arm B seam not live in this boot — bundle compiled without SparkleField.preroll';
      save(); log(`  FATAL: ${report.fatal}`); return;
    }

    /* base — shipped behaviour, the seal's known-bad (expect Q-B1 = 0, pop ≤ 0.15). */
    await armCapture(page, report, save, 'traversal', 'base', { probe: probeSparkle });

    /* cand — the proven lever: preroll runs inside _stageShot on re-setShot (expect pop ≥ 0.9). */
    await armCapture(page, report, save, 'traversal', 'cand', {
      poke: () => { window.__ENGINE.debug.sparklePreroll = true; return { set: true }; },
      probe: probeSparkle,
    });

    /* restore — BY RE-STAGE (the corrected design, RESULT-fxcluster §3). The poke deletes the
       flag and wipes ONLY the marker-identity table; the fresh setShot below is what rebuilds
       every born stamp, through the shipped mark() new-key path. prePoke snapshot proves the
       stamps really were the cand arm's −0.25 before the pass, so post-pass born ≥ 0 is
       attributable to the re-stage and nothing else. */
    await armCapture(page, report, save, 'traversal', 'restore', {
      poke: () => {
        const e = window.__ENGINE;
        delete e.debug.sparklePreroll;
        const sp = e.get('fx').sparkles;
        const prePoke = {
          count: sp.count,
          born: Array.from({ length: Math.min(sp.count, 24) }, (_, i) => +sp.aData.array[i * 4 + 2].toFixed(4)),
        };
        sp.count = 0;
        sp.geometry.instanceCount = 0;
        sp._keys.fill(0);
        sp._seen.fill(0);
        return { deletedFlag: true, identityWiped: true, prePoke };
      },
      probe: probeSparkle,
    });

    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk b2 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk b2: lock released');
}

await chunkB2();
log('ALL DONE');

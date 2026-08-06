/**
 * sparkcount — PREREG-sparkcount §7. PROBE-ONLY: boots, stages four shots, dumps SparkleField
 * instance data. NO FRAMES CAPTURED, so the lock hold is short.
 *
 * SPARKCOUNT is computed OFFLINE by sparkcount-score.mjs from this dump, so the registered
 * arithmetic is auditable and re-derivable without a second boot (seal §7).
 *
 * NO SRC EDITS: verifies the committed SparkleField + preroll seam and aborts if absent.
 * FIFO lock via withGame — litwarm is running with staging1 and combatrecipient queued; this
 * queues politely behind them (seal §7). No git — the coordinator sweeps.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = '/home/user/Demo';
const OUT = path.join(ROOT, 'progress/records/fxcluster1');
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);
const treeHash = () => execSync("cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16", { encoding: 'utf8' }).trim();

for (const [file, probe, name] of [
  ['src/fx/Particles.js', 'class SparkleField', 'SparkleField'],
  ['src/fx/Particles.js', 'preroll(sec)', 'preroll seam'],
]) {
  if (!readFileSync(path.join(ROOT, file), 'utf8').includes(probe)) {
    log(`FATAL: committed seam [${name}] absent from ${file} — ABORT`); process.exit(2);
  }
}
log(`seam verify ok (srcTree ${treeHash()})`);

const report = { prereg: 'PREREG-sparkcount.md', startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), arms: [] };
const save = () => writeFileSync(path.join(OUT, 'sparkcount-readback.json'), JSON.stringify(report, null, 1));
save();

/* Page-side dump. Reads the raw instance buffers so SPARKCOUNT can be derived offline —
   nothing is judged in here. */
const dumpSparkles = () => {
  const e = window.__ENGINE;
  const fx = e.get('fx');
  const sf = fx?.sparkles;
  if (!sf) return { fatal: 'fx.sparkles absent' };
  const n = sf.count | 0;
  const pos = [], data = [];
  for (let i = 0; i < n; i++) {
    pos.push([+sf.aPos.array[i * 3].toFixed(3), +sf.aPos.array[i * 3 + 1].toFixed(3), +sf.aPos.array[i * 3 + 2].toFixed(3)]);
    data.push([+sf.aData.array[i * 4].toFixed(4), +sf.aData.array[i * 4 + 1].toFixed(4), +sf.aData.array[i * 4 + 2].toFixed(4), +sf.aData.array[i * 4 + 3].toFixed(4)]);
  }
  const c = e.camera; const d = new window.__GAME.THREE.Vector3(); c.getWorldDirection(d);
  return {
    rawCount: n,
    instanceCount: sf.geometry.instanceCount,
    meshVisible: !!sf.mesh.visible,
    uTimeFx: +sf.material.uniforms.uTime.value.toFixed(6),
    fxT0: fx._t0 != null ? +fx._t0.toFixed(6) : null,
    engineTime: +e.time.toFixed(6),
    aPos: pos, aData: data,
    camera: { pos: c.position.toArray().map((v) => +v.toFixed(3)), fwd: d.toArray().map((v) => +v.toFixed(3)), fov: c.fov, aspect: +(c.aspect ?? 0).toFixed(4) },
    prerollFlag: e.debug?.sparklePreroll ?? null,
  };
};

const ARMS = [
  { arm: 'traversal-prerollOFF', shot: 'traversal', preroll: false },   // KB1 — the decisive control
  { arm: 'traversal-prerollON', shot: 'traversal', preroll: true },     // KB2
  { arm: 'night', shot: 'night', preroll: true },                       // KB3
  { arm: 'interior', shot: 'interior', preroll: true },                 // KB4
];

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — renderer ${info.renderer?.slice(0, 40)}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 160)}`); });
  const live = await page.evaluate(() => {
    const fx = window.__ENGINE?.get?.('fx');
    return { hasFx: !!fx, hasSparkles: !!fx?.sparkles, hasPreroll: typeof fx?.sparkles?.preroll === 'function', capacity: fx?.sparkles?.capacity ?? null };
  });
  report.live = live; save();
  log(`LIVE ${JSON.stringify(live)}`);
  if (!live.hasSparkles || !live.hasPreroll) {
    report.fatal = 'fx.sparkles / preroll not live — P-S5'; save(); log(`FATAL: ${report.fatal}`); return;
  }

  for (const a of ARMS) {
    const row = { ...a, at: new Date().toISOString() };
    await page.evaluate((p) => {
      if (p) window.__ENGINE.debug.sparklePreroll = true; else delete window.__ENGINE.debug.sparklePreroll;
    }, a.preroll);
    row.setShot = await page.evaluate(async (n) => {
      const r = await window.__GAME.setShot(n);
      return { tod: window.__ENGINE.debug.timeOfDay, draws: r?.stats?.drawCalls, warnings: r?.warnings?.length };
    }, a.shot);
    await page.evaluate(async () => { await window.__GAME.step(10, 0); });
    row.dump = await page.evaluate(dumpSparkles);
    row.srcAtArm = treeHash();
    report.arms.push(row); save();
    log(`  ${a.arm.padEnd(22)} rawCount ${String(row.dump?.rawCount).padStart(4)}  uTimeFx ${row.dump?.uTimeFx}  meshVisible ${row.dump?.meshVisible}`);
  }
  report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
  log(`done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED'})`);
});
log('ALL DONE (probe-only; no frames written)');

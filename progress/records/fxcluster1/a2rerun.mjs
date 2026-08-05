/**
 * a2rerun — PREREG-fxcluster-a2: sub-arm A second letter (same −0.20 heading lever,
 * residue-pinned staging). One boot, guard only, arms base → base2 → cand → restore.
 *
 * The parent's UNSCOREABLE came from |base2−base| 2.06 / |restore−base| 4.27 against ≤1.0 —
 * diagnosed (seal §0) as the c2-proven pool-residue accumulation, NOT stochastic noise:
 * identical-state pairs are unequal (base↔base2 684 px ≥10ΔL, base2↔restore 5 px), the
 * drift is monotone and lives in the ROI's dark right half. Cure: the c2 pool wipe before
 * EVERY arm identically, then a fresh setShot('guard') rebuilds staged content through
 * shipped code. The parent's original ≤1.0 noise gates then stand as registered.
 *
 * NO SRC EDITS: verifies the committed Guard.js heading seam + Particles.js poke paths and
 * aborts if absent. Frames + readback INCREMENTALLY, a2-prefixed. Per-chunk resume. FIFO
 * lock via withGame (atmowire/others may be ahead — queue politely). Scoring offline:
 * a2score.mjs (sealed diag §A + score-aux A). No git — the coordinator sweeps.
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

/* seam verification — poke paths must be committed; this run may not edit src */
const SEAM_PROBES = [
  { file: 'src/ai/Guard.js', probe: 'guardTowardCamera', name: 'A heading seam' },
  { file: 'src/fx/Particles.js', probe: 'this.EMITTERS = EMITTERS', name: 'FX poke path' },
];
for (const s of SEAM_PROBES) {
  if (!readFileSync(path.join(ROOT, s.file), 'utf8').includes(s.probe)) {
    log(`FATAL: committed seam [${s.name}] absent from ${s.file} — ABORT before any capture`);
    process.exit(2);
  }
}
log(`seam verify: heading seam + FX poke path present (srcTree ${treeHash()})`);

const FRAME = (arm) => path.join(OUT, `a2-guard.${arm}.png`);

function makeReport() {
  const report = {
    prereg: 'PREREG-fxcluster-a2.md',
    chunk: 'a2',
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, 'a2-readback.json'), JSON.stringify(report, null, 1));
  save();
  return { report, save };
}

/** Stage + settle + probe + capture one arm (c2 pattern; every arm restages). */
async function armCapture(page, report, save, arm, { poke = null, pokeArg = null, probe = null } = {}) {
  const ta = Date.now();
  const row = { shot: 'guard', arm, at: new Date().toISOString() };
  if (poke) row.poke = await page.evaluate(poke, pokeArg);
  row.setShot = await page.evaluate(async (n) => {
    const r = await window.__GAME.setShot(n);
    return {
      tod: window.__ENGINE.debug.timeOfDay,
      drift: r?.subject?.drift, onScreen: r?.subject?.onScreen,
      draws: r?.stats?.drawCalls, tris: r?.stats?.triangles, warnings: r?.warnings?.length,
    };
  }, 'guard');
  await page.evaluate(async () => { await window.__GAME.step(10, 0); window.__GAME.capture('image/png'); });
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
  log(`  guard.${arm.padEnd(8)} ${String(row.secs).padStart(3)}s  tod ${row.tod}  ${JSON.stringify(row.probe?.guard ?? {}).slice(0, 180)}`);
  return row;
}

/* page-side probe: parent's guard probe + pool stats */
const probeGuardA2 = () => {
  const e = window.__ENGINE;
  const gd = e.get('guards');
  const g0 = gd?.guards?.[0];
  const ic = gd?.beamMesh?.instanceColor;
  const fx = e.get('fx');
  const pools = {};
  for (const [name, b] of fx.batches) pools[name] = { used: b._used, inst: b.geometry.instanceCount, loop: !!b.looping };
  if (fx.decals) pools.__decals = { used: fx.decals._used, inst: fx.decals.geometry.instanceCount };
  return {
    guard: {
      guardTowardCamera: e.debug.guardTowardCamera ?? null,
      pos: g0 ? g0.position.toArray().map((v) => +v.toFixed(3)) : null,
      yaw: g0 ? +g0.yaw.toFixed(4) : null,
      forward: g0 ? g0.forward.toArray().map((v) => +v.toFixed(3)) : null,
      light: gd ? +gd._light.toFixed(4) : null,
      uOpacity: gd?._beamMat ? +gd._beamMat.uniforms.uOpacity.value.toFixed(4) : null,
      beamCol0: ic ? Array.from(ic.array.slice(0, 3)).map((v) => +v.toFixed(4)) : null,
    },
    pools,
    playerPos: e.get('movement')?.position?.toArray().map((v) => +v.toFixed(2)) ?? null,
  };
};

/* page-side wipe (seal §1 = the c2 wipe verbatim), with optional flag poke:
   mode 'base'/'base2' — wipe only; 'cand' — set flag −0.20 then wipe; 'restore' — delete flag then wipe */
const armPoke = (ARG) => {
  const e = window.__ENGINE;
  const fx = e.get('fx');
  const out = { mode: ARG.mode };
  if (ARG.mode === 'cand') { e.debug.guardTowardCamera = ARG.value; out.set = ARG.value; }
  if (ARG.mode === 'restore') { delete e.debug.guardTowardCamera; out.deleted = true; }
  const snap = () => {
    const o = {};
    for (const [name, b] of fx.batches) o[name] = { used: b._used, head: b._head, loop: !!b.looping, inst: b.geometry.instanceCount };
    if (fx.decals) o.__decals = { used: fx.decals._used, head: fx.decals._head, inst: fx.decals.geometry.instanceCount };
    return o;
  };
  out.poolsBeforeWipe = snap();
  for (const [, b] of fx.batches) {
    if (!b.looping) { b._used = 0; b._head = 0; b._deathMax = -1; b.geometry.instanceCount = 0; }
  }
  if (fx.decals) { fx.decals._used = 0; fx.decals._head = 0; fx.decals._deathMax = -1; fx.decals.geometry.instanceCount = 0; }
  out.poolsAfterWipe = snap();
  return out;
};

async function chunkA2() {
  const frames = ['base', 'base2', 'cand', 'restore'].map(FRAME);
  if (frames.every(existsSync)) { log('chunk a2: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport();
  log(`chunk a2 (guard only): srcTree ${report.srcTreeBefore} — booting (own FIFO lock hold; queueing politely)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — renderer ${info.renderer?.slice(0, 40)} warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    const lever = await page.evaluate(() => {
      const e = window.__ENGINE;
      const fx = e?.get?.('fx');
      return {
        hasGuards: !!e?.get?.('guards'), hasEMITTERS: !!fx?.EMITTERS, hasBatches: !!fx?.batches,
        flagAtBoot: e?.debug?.guardTowardCamera ?? null,
      };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever)}`);
    if (!lever.hasGuards || !lever.hasBatches) {
      report.fatal = 'guards/FX poke paths not live in this boot'; save(); log(`  FATAL: ${report.fatal}`); return;
    }

    await armCapture(page, report, save, 'base', { poke: armPoke, pokeArg: { mode: 'base' }, probe: probeGuardA2 });
    await armCapture(page, report, save, 'base2', { poke: armPoke, pokeArg: { mode: 'base2' }, probe: probeGuardA2 });
    await armCapture(page, report, save, 'cand', { poke: armPoke, pokeArg: { mode: 'cand', value: -0.20 }, probe: probeGuardA2 });
    await armCapture(page, report, save, 'restore', { poke: armPoke, pokeArg: { mode: 'restore' }, probe: probeGuardA2 });

    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk a2 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk a2: lock released');
}

await chunkA2();
log('ALL DONE');

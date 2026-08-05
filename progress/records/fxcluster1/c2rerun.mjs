/**
 * c2rerun — PREREG-fxcluster-c2: sub-arm C successor (warmer flash core, staged clean).
 *
 * One boot, combat only, arms base → cand (c2 EMITTERS block) → restore (shipped values).
 * EVERY arm identically begins with the POOL WIPE (seal §0): non-looping Batch rings +
 * Decals ring zeroed, then a fresh setShot('combat') rebuilds fires/burst/decal through the
 * shipped staging path — every arm is a "first staging", the state the frame anchors were
 * measured on. Mechanism being neutralized: Batch.commit's `time > _deathMax` empty test
 * (Particles.js:1527) can never pass after _stageShot re-bases the clock, so prior stagings'
 * cohorts resurrect near-peak at the next arm's capture (monotone blob growth 7235→8465 in
 * the parent letter, localized at the flash site).
 *
 * NO SRC EDITS (the parent's committed EMITTERS seam is the poke path; verified, abort if
 * absent). Frames + readback INCREMENTALLY, c2-prefixed. Per-chunk resume: all-frames-exist
 * skips; a partial chunk re-runs whole in a fresh boot. FIFO lock via withGame (skyswirl/
 * mradius may be ahead — queue politely). Scoring offline: c2score.mjs (sealed instrument).
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

/* seam verification — the poke path must be committed; this run may not edit src */
if (!readFileSync(path.join(ROOT, 'src/fx/Particles.js'), 'utf8').includes('this.EMITTERS = EMITTERS')) {
  log('FATAL: EMITTERS poke-path seam absent from src/fx/Particles.js — ABORT before any capture');
  process.exit(2);
}
log(`seam verify: EMITTERS poke path present (srcTree ${treeHash()})`);

const FRAME = (arm) => path.join(OUT, `c2-combat.${arm}.png`);

function makeReport() {
  const report = {
    prereg: 'PREREG-fxcluster-c2.md',
    chunk: 'c2',
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, 'c2-readback.json'), JSON.stringify(report, null, 1));
  save();
  return { report, save };
}

/* The c2 block (seal §1). Alphas = parent block values; lever = col0 one rank warmer.
   cane_flash col1 stays at the PARENT block's 0xd4823a (shipped is goldMid — the parent
   letter proved the pair direction; only col0 moves rank). */
const C2_POKE = {
  cane_flash: { alpha: [1.3, 1.3], col0: 0xd4823a, col1: 0xd4823a },
  cane_arc: { alpha: [1.0, 1.6], col0: 0xd4823a },
  cane_spark: { alpha: [1.6, 2.4], col0: 0xe8912a },
  cane_ring: { alpha: [1.4, 1.4] },
};

/** Stage + settle + probe + capture one arm (b2 pattern; every arm restages). */
async function armCapture(page, report, save, arm, { poke = null, pokeArg = null, probe = null } = {}) {
  const ta = Date.now();
  const row = { shot: 'combat', arm, at: new Date().toISOString() };
  if (poke) row.poke = await page.evaluate(poke, pokeArg);
  row.setShot = await page.evaluate(async (n) => {
    const r = await window.__GAME.setShot(n);
    return {
      tod: window.__ENGINE.debug.timeOfDay,
      drift: r?.subject?.drift, onScreen: r?.subject?.onScreen,
      draws: r?.stats?.drawCalls, tris: r?.stats?.triangles, warnings: r?.warnings?.length,
    };
  }, 'combat');
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
  log(`  combat.${arm.padEnd(8)} ${String(row.secs).padStart(3)}s  tod ${row.tod}  ${JSON.stringify(row.probe?.defs?.cane_flash ?? {})} spark ${JSON.stringify(row.probe?.pools?.spark ?? {})}`);
  return row;
}

/* page-side: pool stats snapshot (self-contained — no node-side closures) */
const probeCombat = () => {
  const fx = window.__ENGINE.get('fx');
  const out = { hasEMITTERS: !!fx?.EMITTERS, defs: {}, pools: {} };
  if (fx?.EMITTERS) {
    for (const k of ['cane_flash', 'cane_arc', 'cane_spark', 'cane_ring']) {
      const d = fx.EMITTERS[k];
      out.defs[k] = d ? { alpha: [...d.alpha], col0: d.col0, col1: d.col1 } : null;
    }
  }
  for (const [name, b] of fx.batches) {
    out.pools[name] = { used: b._used, head: b._head, dMax: +(+b._deathMax).toFixed(3), loop: !!b.looping, inst: b.geometry.instanceCount };
  }
  if (fx.decals) out.pools.__decals = { used: fx.decals._used, head: fx.decals._head, inst: fx.decals.geometry.instanceCount };
  out.playerPos = window.__ENGINE.get('movement')?.position?.toArray().map((v) => +v.toFixed(3)) ?? null;
  return out;
};

/* page-side wipe (seal §0), shared by all arms via pokeArg.mode:
   mode 'base'    — wipe only
   mode 'cand'    — apply C2 block (snapshot shipped), then wipe
   mode 'restore' — re-apply snapshot, then wipe */
const armPoke = (ARG) => {
  const fx = window.__ENGINE.get('fx');
  const out = { mode: ARG.mode };
  const snap = () => {
    const o = {};
    for (const [name, b] of fx.batches) o[name] = { used: b._used, head: b._head, dMax: +(+b._deathMax).toFixed(3), loop: !!b.looping, inst: b.geometry.instanceCount };
    if (fx.decals) o.__decals = { used: fx.decals._used, head: fx.decals._head, inst: fx.decals.geometry.instanceCount };
    return o;
  };
  if (ARG.mode === 'cand') {
    const before = {};
    for (const [k, v] of Object.entries(ARG.block)) {
      const d = fx.EMITTERS[k];
      before[k] = { alpha: [...d.alpha], col0: d.col0, col1: d.col1 };
      if (v.alpha) d.alpha = [...v.alpha];
      if (v.col0 !== undefined) d.col0 = v.col0;
      if (v.col1 !== undefined) d.col1 = v.col1;
    }
    window.__C2_SHIPPED = before;
    out.requested = ARG.block; out.before = before;
  } else if (ARG.mode === 'restore') {
    const before = window.__C2_SHIPPED;
    for (const [k, v] of Object.entries(before)) {
      const d = fx.EMITTERS[k];
      d.alpha = [...v.alpha]; d.col0 = v.col0; d.col1 = v.col1;
    }
    out.restoredFrom = before;
  }
  out.poolsBeforeWipe = snap();
  for (const [, b] of fx.batches) {
    if (!b.looping) { b._used = 0; b._head = 0; b._deathMax = -1; b.geometry.instanceCount = 0; }
  }
  if (fx.decals) { fx.decals._used = 0; fx.decals._head = 0; fx.decals._deathMax = -1; fx.decals.geometry.instanceCount = 0; }
  out.poolsAfterWipe = snap();
  return out;
};

async function chunkC2() {
  const frames = ['base', 'cand', 'restore'].map(FRAME);
  if (frames.every(existsSync)) { log('chunk c2: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport();
  log(`chunk c2 (combat only): srcTree ${report.srcTreeBefore} — booting (own FIFO lock hold; skyswirl/mradius may be ahead — queueing politely)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — renderer ${info.renderer?.slice(0, 40)} warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    const lever = await page.evaluate(() => {
      const fx = window.__ENGINE?.get?.('fx');
      return {
        hasEMITTERS: !!fx?.EMITTERS, hasBatches: !!fx?.batches, hasDecals: !!fx?.decals,
        shipped: fx?.EMITTERS ? Object.fromEntries(['cane_flash', 'cane_arc', 'cane_spark', 'cane_ring']
          .map((k) => [k, { alpha: [...fx.EMITTERS[k].alpha], col0: fx.EMITTERS[k].col0, col1: fx.EMITTERS[k].col1 }])) : null,
      };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever).slice(0, 300)}`);
    if (!lever.hasEMITTERS || !lever.hasBatches) {
      report.fatal = 'EMITTERS/batches poke path not live in this boot'; save(); log(`  FATAL: ${report.fatal}`); return;
    }

    await armCapture(page, report, save, 'base', { poke: armPoke, pokeArg: { mode: 'base' }, probe: probeCombat });
    await armCapture(page, report, save, 'cand', { poke: armPoke, pokeArg: { mode: 'cand', block: C2_POKE }, probe: probeCombat });
    await armCapture(page, report, save, 'restore', { poke: armPoke, pokeArg: { mode: 'restore' }, probe: probeCombat });

    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk c2 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk c2: lock released');
}

await chunkC2();
log('ALL DONE');

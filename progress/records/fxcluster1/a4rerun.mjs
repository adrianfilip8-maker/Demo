/**
 * a4rerun — PREREG-fxcluster-a4: sub-arm A fourth letter. Same −0.20 heading lever as all three
 * parents; a3's instrument is carried UNCHANGED (pool ROI ΔmedL, mirror, §13 clause — E/N 11 655
 * on a3's clean pair). What changes is exactly one thing in staging:
 *
 * THE WARM-UP. a3 breached V-1/V-2/V-3 and the letter localised it: `setShot` stops the rAF
 * loop, so on the FIRST measured arm the loop is still running when the pin is written and ~2
 * real frames (0.03 s) leak past it, while arms 2-4 stage from an already-stopped loop and land
 * on exactly 1000 + 17/60 = 1000.283333 with bit-identical beamCol0. So a4 runs a DISCARD
 * setShot('guard') before the first measured arm, putting arm 1 in the same state as the rest.
 * Its frame is never captured or scored.
 *
 * Everything else is a3's, deliberately: pin engine.time = 1000.0 at the head of every arm
 * (Guard.js carries THREE absolute-time terms — :1588 CPU flicker +-9%, :278-279 BEAM_FRAG dust
 * +-19%, :347 POOL_FRAG +-13.6% — and the cone is the one animated subsystem that never got the
 * shot-event re-base Particles.js:2600-2612 and Lighting.js:568-571 both perform and document),
 * then the c2/a2 pool wipe, then the flag poke, then setShot, then step(10, 0).
 *
 * The looping ambient fields are NOT wiped, by measurement (seal §0.2): at dt = 0 nothing
 * respawns, so wiping them would strip ambient haze from every arm — a treatment change, not a
 * protocol change — and every statistic a4 registers is already immune to their residual.
 *
 * NO SRC EDITS: verifies the committed Guard.js heading seam + Particles.js poke path and
 * aborts if absent. Frames + readback INCREMENTALLY, a4-prefixed. Idempotent resume. FIFO
 * lock via withGame (an sbs3 chunk may hold it — queue politely). Scoring offline:
 * a4score.mjs. No git — the coordinator sweeps.
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

/* PREREG-fxcluster-a4 §1: the pinned engine clock. A constant above any natural boot value so
   the first set is FORWARD; every arm re-pins to the same number, so all four arms render every
   absolute-time term at an identical phase. */
const T_PIN = 1000.0;

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

const FRAME = (arm) => path.join(OUT, `a4-guard.${arm}.png`);

function makeReport() {
  const report = {
    prereg: 'PREREG-fxcluster-a4.md',
    chunk: "a4",
    tPin: T_PIN,
    startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), arms: [],
  };
  const save = () => writeFileSync(path.join(OUT, 'a4-readback.json'), JSON.stringify(report, null, 1));
  save();
  return { report, save };
}

/**
 * Page-side arm staging, in the seal §1 order:
 *   1 pin engine.time  2 pool wipe  3 flag poke  4 (setShot happens next, outside)
 * Returns the clock + pool evidence V-1/V-2 are scored against.
 */
const armPoke = (ARG) => {
  const e = window.__ENGINE;
  const fx = e.get('fx');
  const out = { mode: ARG.mode };

  /* 1 — CLOCK PIN (seal §0). Recorded before and after so V-2 can be scored. */
  out.engineTimeBeforePin = +e.time.toFixed(6);
  e.time = ARG.tPin;
  out.engineTimeAfterPin = +e.time.toFixed(6);

  /* 2 — pool wipe, the c2/a2 wipe verbatim */
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

  /* 3 — the lever, unchanged from both parents */
  if (ARG.mode === 'cand') { e.debug.guardTowardCamera = ARG.value; out.set = ARG.value; }
  if (ARG.mode === 'restore') { delete e.debug.guardTowardCamera; out.deleted = true; }
  return out;
};

/* page-side probe: a2's guard probe + the clock evidence this seal adds */
const probeGuardA4 = () => {
  const e = window.__ENGINE;
  const gd = e.get('guards');
  const g0 = gd?.guards?.[0];
  const ic = gd?.beamMesh?.instanceColor;
  const fx = e.get('fx');
  const pools = {};
  for (const [name, b] of fx.batches) pools[name] = { used: b._used, inst: b.geometry.instanceCount, loop: !!b.looping };
  if (fx.decals) pools.__decals = { used: fx.decals._used, inst: fx.decals.geometry.instanceCount };
  return {
    clock: {
      engineTime: +e.time.toFixed(6),
      beamUTime: gd?._beamMat ? +gd._beamMat.uniforms.uTime.value.toFixed(6) : null,
      poolUTime: gd?._poolMat ? +gd._poolMat.uniforms.uTime.value.toFixed(6) : null,
      sensesPhase: g0?.senses ? +g0.senses.phase.toFixed(6) : null,
      fxT0: fx?._t0 != null ? +fx._t0.toFixed(6) : null,
    },
    guard: {
      guardTowardCamera: e.debug.guardTowardCamera ?? null,
      pos: g0 ? g0.position.toArray().map((v) => +v.toFixed(3)) : null,
      yaw: g0 ? +g0.yaw.toFixed(4) : null,
      forward: g0 ? g0.forward.toArray().map((v) => +v.toFixed(3)) : null,
      light: gd ? +gd._light.toFixed(4) : null,
      uOpacity: gd?._beamMat ? +gd._beamMat.uniforms.uOpacity.value.toFixed(4) : null,
      beamCol0: ic ? Array.from(ic.array.slice(0, 3)).map((v) => +v.toFixed(6)) : null,
      suspicion: g0?.senses ? +g0.senses.suspicion.toFixed(4) : null,
      gain: g0?.senses ? +g0.senses.gain.toFixed(4) : null,
    },
    pools,
    playerPos: e.get('movement')?.position?.toArray().map((v) => +v.toFixed(2)) ?? null,
  };
};

/** Stage + settle + probe + capture one arm (a2 pattern; every arm restages identically). */
async function armCapture(page, report, save, arm, { pokeArg, probe }) {
  const ta = Date.now();
  const row = { shot: 'guard', arm, at: new Date().toISOString() };
  row.poke = await page.evaluate(armPoke, pokeArg);
  row.setShot = await page.evaluate(async (n) => {
    const r = await window.__GAME.setShot(n);
    return {
      tod: window.__ENGINE.debug.timeOfDay,
      drift: r?.subject?.drift, onScreen: r?.subject?.onScreen,
      draws: r?.stats?.drawCalls, tris: r?.stats?.triangles, warnings: r?.warnings?.length,
      engineTimeAfterSetShot: +window.__ENGINE.time.toFixed(6),
    };
  }, 'guard');
  /* dt = 0: frames advance, the world clock does not (Debug.js:152-167). */
  await page.evaluate(async () => { await window.__GAME.step(10, 0); window.__GAME.capture('image/png'); });
  row.probe = await page.evaluate(probe);
  const dataUrl = await page.evaluate(() => window.__GAME.capture('image/png'));
  writeFileSync(FRAME(arm), Buffer.from(dataUrl.split(',')[1], 'base64'));
  row.engineTimeAtCapture = await page.evaluate(() => +window.__ENGINE.time.toFixed(6));
  row.cam = await page.evaluate(() => {
    const c = window.__ENGINE.camera; const d = new window.__GAME.THREE.Vector3();
    c.getWorldDirection(d);
    return { pos: c.position.toArray().map((v) => +v.toFixed(3)), fwd: d.toArray().map((v) => +v.toFixed(3)), fov: c.fov };
  });
  row.tod = await page.evaluate(() => window.__ENGINE.debug.timeOfDay);
  row.srcAtArm = treeHash();
  row.secs = Math.round((Date.now() - ta) / 1000);
  report.arms.push(row); save();
  log(`  guard.${arm.padEnd(8)} ${String(row.secs).padStart(3)}s  t ${row.engineTimeAtCapture}  beamCol0 ${JSON.stringify(row.probe?.guard?.beamCol0)}  yaw ${row.probe?.guard?.yaw}`);
  return row;
}

async function chunkA4() {
  const frames = ['base', 'base2', 'cand', 'restore'].map(FRAME);
  if (frames.every(existsSync)) { log('chunk a4: all frames present — skipping (idempotent resume)'); return; }
  const { report, save } = makeReport();
  log(`chunk a4 (guard only): srcTree ${report.srcTreeBefore}, tPin ${T_PIN} — booting (FIFO lock; queueing politely)`);
  await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
    log(`  boot ok — renderer ${info.renderer?.slice(0, 40)} warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });
    const lever = await page.evaluate(() => {
      const e = window.__ENGINE;
      const fx = e?.get?.('fx');
      const g0 = e?.get?.('guards')?.guards?.[0];
      return {
        hasGuards: !!e?.get?.('guards'), hasEMITTERS: !!fx?.EMITTERS, hasBatches: !!fx?.batches,
        flagAtBoot: e?.debug?.guardTowardCamera ?? null,
        engineTimeAtBoot: e ? +e.time.toFixed(3) : null,
        sensesPhaseAtBoot: g0?.senses ? +g0.senses.phase.toFixed(6) : null,
        timeWritable: (() => { const t = e.time; e.time = 12345.5; const ok = e.time === 12345.5; e.time = t; return ok; })(),
      };
    });
    report.lever = lever; save();
    log(`  LEVER ${JSON.stringify(lever)}`);
    if (!lever.hasGuards || !lever.hasBatches) {
      report.fatal = 'guards/FX poke paths not live in this boot'; save(); log(`  FATAL: ${report.fatal}`); return;
    }
    if (!lever.timeWritable) {
      report.fatal = 'engine.time is not writable in this boot — the a4 clock pin cannot be applied';
      save(); log(`  FATAL: ${report.fatal}`); return;
    }

    /* ===================== THE a4 CHANGE: the discard warm-up =====================
       a3's V-1/V-2/V-3 breached because `setShot` stops the rAF loop, so the FIRST arm's pin
       leaked ~2 real frames (0.03 s) before the loop halted, while arms 2-4 were bit-identical.
       One discard staging puts arm 1 in the same state as the rest. Nothing here is captured or
       scored; the clock readings around it are recorded so the seal's P-A4a can be judged on
       evidence rather than on the hypothesis. */
    report.warmup = await page.evaluate(async () => {
      const e = window.__ENGINE;
      const before = +e.time.toFixed(6);
      await window.__GAME.setShot('guard');
      const after = +e.time.toFixed(6);
      /* second read after a dt=0 frame: if the loop is now stopped, this must not move */
      await window.__GAME.step(1, 0);
      return { engineTimeBeforeWarmup: before, engineTimeAfterWarmup: after, engineTimeAfterIdleFrame: +e.time.toFixed(6) };
    });
    save();
    log(`  WARM-UP (discarded) ${JSON.stringify(report.warmup)}`);

    for (const [arm, extra] of [
      ['base', {}], ['base2', {}], ['cand', { value: -0.20 }], ['restore', {}],
    ]) {
      await armCapture(page, report, save, arm, {
        pokeArg: { mode: arm === 'cand' ? 'cand' : arm === 'restore' ? 'restore' : 'base', tPin: T_PIN, ...extra },
        probe: probeGuardA4,
      });
    }

    report.srcTreeAfter = treeHash(); report.finishedAt = new Date().toISOString(); save();
    log(`  chunk a4 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  });
  log('chunk a4: lock released');
}

await chunkA4();
log('ALL DONE');

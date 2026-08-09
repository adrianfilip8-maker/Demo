#!/usr/bin/env node
/**
 * fxshape — WHICH emitter is D12's grey smear, measured rather than argued.
 *
 * Critic 9, D12: "The slash in `combat.png` is a soft grey smear arcing across a third of the
 * frame with no graphic edge, no colour and no tapering — it reads as a thumbprint on the lens,
 * and it also desaturates everything it crosses (which is why the shirt patch there measures
 * sat 0.064)."
 *
 * `_stageShot('combat')` fires ONE `_onCaneHit(3, …)`, which emits four things at once —
 * `cane_flash`, `cane_ring`, `cane_spark`, `cane_debris` — plus the cane ribbon trail runs
 * independently. Naming the smear by reading the source is a guess; four of them are plausible
 * and the ledger already contains one wrong attribution of this exact frame (§215.1: `fx9`
 * measured the surround while the band over the character sat at mean 180). So: one boot, one
 * arm per suspect, differenced against a common base.
 *
 * **No source arm exists on disk at any point.** Each arm is installed by wrapping
 * `Particles._emit` (and `Trails.update`) in the page after boot and unwrapped before the next,
 * so §186's "the edit must not exist outside the window the lock protects" is satisfied by
 * construction rather than by ordering — there is no edit.
 *
 * This run makes NO ship claim and moves no parameter. Its output is an attribution with pixel
 * counts. Arms:
 *
 *   base      everything on
 *   noring    `cane_ring` suppressed          (PLANAR, additive, exempt from TUNE.flashMaxH)
 *   noflash   `cane_flash` suppressed         (additive GLOW, clamped by flashMaxH 0.45)
 *   nospark   `cane_spark` + `cane_debris` suppressed
 *   notrail   the cane ribbon trail hidden    (src/fx/Trails.js)
 *   nocane    all of the above at once        (the ceiling: everything the hit draws)
 *   base2     repeat of base                  VALIDITY — must be pixel-identical to base
 *
 * `base2` is the arm that decides whether anything else can be believed: every arm is staged
 * with the SAME fixed dt so each one renders the impact at the same age. If base2 differs from
 * base by more than a handful of pixels, this boot is VOID and the deltas below are animation
 * phase, not attribution (§28 — a gold-bloom sweep was once voided because its DUPLICATE arm
 * moved more pixels than its strongest real arm).
 *
 * **dt is 1/60, NOT 0, and that is the opposite of §28/§195's standing advice for within-boot
 * A/Bs — for a reason this run discovered the expensive way.** The first attribution boot
 * passed `{ dt: 0 }` and came back with all seven arms byte-identical: 0 changed pixels on
 * every suppression arm, including `nocane`, which suppresses everything the hit draws.
 * The levers were fine — the log shows `cane_ring`/`cane_flash`/`cane_spark`/`cane_debris`
 * each called twice per arm and blocked. The cause is that a frozen clock freezes the
 * PARTICLES: age is `uTime - t0`, `_stageShot` emits at the current `uTime`, and every
 * emitter's alpha begins with `smoothstep(0, fadeIn, u)`, which is exactly 0 at u = 0. So
 * `combat` staged at dt 0 contains **no impact effect at all**, and an A/B run that way
 * reports "your change did nothing" when the truth is "the thing under test was never drawn".
 * Any event-driven FX — impact, landing, alert, pickup — is invisible under the repo's own
 * recommended A/B staging. Determinism comes from dt being FIXED, not from it being zero:
 * `Debug.setShot` applies the shot twice and runs SETTLE_FRAMES_2 = 3 frames after the second,
 * so at 1/60 every arm renders the hit at the same 0.05 s of age.
 *
 *   node progress/records/fxshape.mjs
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/* Provenance, recorded at boot and enforced by the scorer. Four agents commit to this branch
   continuously and every arm waits on a FIFO, so a comparison spanning two invocations spans
   two TREES by default — the materials lane VOIDed a run today whose arms were twenty commits
   apart across a `src/core/Shots.js` re-framing. Every arm here shares one boot, and this pins
   the tree they shared so the scorer can refuse rather than guess. */
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
/* KNOWN DEFECT IN THIS FIELD, kept honest rather than quietly fixed mid-flight: the sha is
   sampled at PROCESS START, and `withGame` then waits on the FIFO — measured at 20-60 minutes
   here — before vite compiles anything. Four agents commit continuously, so this can name a
   tree the boot did not compile, and a provenance record that is confidently wrong is worse
   than an absent one. `fxdraw.mjs` samples inside `onLocked` instead, which is the correct
   seam. Treat this field as ADVISORY: what actually makes this run's arms same-tree is that
   they share one boot, and vite is frozen for its duration (SANDS_NO_HMR + one page.goto). */
const PROVENANCE = { sha: git('rev-parse', 'HEAD'), shaWhen: 'process-start (ADVISORY, see comment)', srcDirty: git('status', '--porcelain', 'src/') || '', at: new Date().toISOString() };

const OUT = path.join(ROOT, 'shots', 'fxshape');
const SUPPRESS = {
  base: [],
  noring: ['cane_ring'],
  noflash: ['cane_flash'],
  nospark: ['cane_spark', 'cane_debris'],
  nocane: ['cane_ring', 'cane_flash', 'cane_spark', 'cane_debris'],
  base2: [],
};
const TRAIL_OFF = new Set(['notrail', 'nocane']);
const ARMS = ['base', 'noring', 'noflash', 'nospark', 'notrail', 'nocane', 'base2'];

await mkdir(OUT, { recursive: true });

const res = await withGame({ width: 1280, height: 720, quality: 'high', verbose: false }, async ({ page, info }) => {
  /* Inventory first: prove the levers exist and bite before spending arms on them. A wrapper
     installed on a method nobody calls is an arm that silently does nothing, which is the
     failure this repo keeps paying for. */
  const inv = await page.evaluate(() => {
    const fx = window.__ENGINE?.get?.('fx');
    if (!fx) return { ok: false, why: 'no fx module' };
    window.__fxOrigEmit = fx._emit.bind(fx);
    window.__fxSeen = [];
    fx._emit = function (name, ...rest) {
      window.__fxSeen.push(name);
      if (window.__fxBlock && window.__fxBlock.has(name)) return null;
      return window.__fxOrigEmit(name, ...rest);
    };
    return {
      ok: true,
      hasTrails: !!fx.trails, trailCount: fx.trails?.list?.length ?? 0,
      batches: [...(fx.batches?.keys?.() ?? [])],
    };
  });
  if (!inv.ok) throw new Error(`lever inventory failed: ${inv.why}`);
  console.log(`tree ${PROVENANCE.sha} · src dirty: ${PROVENANCE.srcDirty ? PROVENANCE.srcDirty.split('\n').length + ' file(s)' : 'no'}`);
  console.log(`fx levers: batches [${inv.batches.join(',')}] · trails ${inv.trailCount}`);

  const out = {};
  for (const arm of ARMS) {
    const seen = await page.evaluate(([block, trailOff]) => {
      window.__fxBlock = new Set(block);
      window.__fxSeen = [];
      const fx = window.__ENGINE.get('fx');
      if (fx.trails) for (const h of fx.trails.list) { h.__fxsuppress = !!trailOff; }
      /* Trails re-set `.visible` every update, so a one-shot visible=false would be reverted
         before the frame draws — the same trap `propshull.mjs` documents for the ink shells.
         Wrap `update` instead and force it off after the module has had its say. */
      if (!window.__trailWrapped && fx.trails) {
        const orig = fx.trails.update.bind(fx.trails);
        fx.trails.update = (dt, t) => { orig(dt, t); for (const h of fx.trails.list) if (h.__fxsuppress) h.mesh.visible = false; };
        window.__trailWrapped = true;
      }
      return true;
    }, [SUPPRESS[arm] ?? [], TRAIL_OFF.has(arm)]);
    void seen;

    const r = await page.evaluate(async (shot) => {
      const res2 = await window.__GAME.setShot(shot, { dt: 1 / 60 });
      return { stats: res2.stats, seen: window.__fxSeen.slice(), t: window.__ENGINE?.time ?? null,
        dataUrl: window.__GAME.capture('image/png', 0.92, 0) };
    }, 'combat');
    const b64 = r.dataUrl.slice(r.dataUrl.indexOf(',') + 1);
    await writeFile(path.join(OUT, `${arm}.png`), Buffer.from(b64, 'base64'));
    out[arm] = { seen: r.seen, t: r.t, tris: r.stats?.triangles, draws: r.stats?.drawCalls };
    console.log(`  ${arm.padEnd(8)} t ${String(r.t).padStart(8)} · emitters fired [${r.seen.join(',')}]`);
  }
  /* Ride-along, costing no extra lock acquisition: one `courtyard` frame on the shipped tree.
     PREREG-smiley's gates are geometric and passed headless; this is the look at the frame that
     its own falsifier asks for ("if a gate passes and the frame still reads as a face, the
     instrument was wrong"). It is not an arm of anything and nothing is scored from it. */
  await page.evaluate(() => { window.__fxBlock = new Set(); });
  const ct = await page.evaluate(async () => {
    const r2 = await window.__GAME.setShot('courtyard', { dt: 1 / 60 });
    return { stats: r2.stats, dataUrl: window.__GAME.capture('image/png', 0.92, 0) };
  });
  await writeFile(path.join(OUT, 'courtyard.png'),
    Buffer.from(ct.dataUrl.slice(ct.dataUrl.indexOf(',') + 1), 'base64'));
  console.log('  courtyard ride-along written (not an arm, nothing scored from it)');

  return { out, info };
});

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ provenance: PROVENANCE, arms: res.out }, null, 2));
console.log(`\nwrote ${ARMS.length} frames to ${OUT}`);

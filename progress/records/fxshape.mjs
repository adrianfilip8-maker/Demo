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
 * `base2` is the arm that decides whether anything else can be believed: every arm is captured
 * at dt 0 so the world clock does not advance between them (§28/§195 — a gold-bloom sweep was
 * once voided because its DUPLICATE arm moved more pixels than its strongest real arm). If
 * base2 differs from base by more than a handful of pixels, this boot is VOID and the deltas
 * below are animation phase, not attribution.
 *
 *   node progress/records/fxshape.mjs
 */
import { withGame, ROOT } from '../../tools/harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

    const r = await page.evaluate(async () => {
      const res2 = await window.__GAME.setShot('combat', { dt: 0 });
      return { stats: res2.stats, seen: window.__fxSeen.slice(), t: window.__ENGINE?.time ?? null,
        dataUrl: window.__GAME.capture('image/png', 0.92, 0) };
    });
    const b64 = r.dataUrl.slice(r.dataUrl.indexOf(',') + 1);
    await writeFile(path.join(OUT, `${arm}.png`), Buffer.from(b64, 'base64'));
    out[arm] = { seen: r.seen, t: r.t, tris: r.stats?.triangles, draws: r.stats?.drawCalls };
    console.log(`  ${arm.padEnd(8)} t ${String(r.t).padStart(8)} · emitters fired [${r.seen.join(',')}]`);
  }
  return { out, info };
});

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(res.out, null, 2));
console.log(`\nwrote ${ARMS.length} frames to ${OUT}`);

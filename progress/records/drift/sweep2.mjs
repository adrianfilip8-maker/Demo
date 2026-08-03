/**
 * drift1 — attribution sweep for KNOWN_ISSUES §111's global cool drift (tx7 7dc4442 -> HEAD).
 *
 * ONE BOOT, live uniform/TUNE pokes, dt = 0 between arms (Debug.js:162's within-boot rule).
 *
 * v2: the v1 run stalled at ~6 min on its first arm with no output while its renderer sat at
 * 174% CPU, after staging 17 frames at 6.6 s/frame. I do not know why, and rather than pick
 * between the four mechanisms I could not eliminate by reading (dt=0 path, the new static
 * shadow cache, toDataURL readback, CDP transfer), this version TIMES EACH SUB-OPERATION and
 * prints a wall-clock stamp per line, so the next run says where the time goes instead of
 * being another 6-minute silence. Probe first, sweep second.
 *
 * WHAT THIS IS NOT (KNOWN_ISSUES §11 — the suffix I have not implemented):
 *   - Arms are pokes of the LIVE tree, not builds of 7dc4442. Anything that drifted outside
 *     src/render is present in EVERY arm including `tx7all`. So `tx7all` reproducing tx7's
 *     b-r is evidence the render knobs own it; `tx7all` FAILING to is evidence something
 *     outside src/render contributes, not evidence these knobs are innocent.
 *   - `base2` is a self-control, not a treatment: it must return bit-identical to `base` or
 *     the poke/restore path leaked and every number here is void.
 *   - Frame-wide b-r cannot localise anything. The PNGs are written to be looked at, and the
 *     spatial ROIs carry the localisation.
 */
import { withGame, ROOT } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/drift/frames';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

const HEAD = { fillSkyMix: 0.70, shadowBounceMix: 0.05, shadowTeal: 0.15, rimGain: 4.10, bloomThreshold: 2.20, bloomKnee: 0.30, subjWarmShade: 0.50 };
/* 7dc4442 values for the six live knobs that moved in src/render across the window.
   subjWarmShade is NOT in tx7all: it did not exist at 7dc4442, but it is character-scoped and
   warm-ward, so restoring it would confound the architecture question it is not part of. */
const TX7 = { fillSkyMix: 0.0, shadowBounceMix: 0.20, shadowTeal: 0.0, rimGain: 2.05, bloomThreshold: 1.55, bloomKnee: 0.45 };

const ARMS = [
  ['base', {}],
  ['fill0', { fillSkyMix: TX7.fillSkyMix }],
  ['sbm20', { shadowBounceMix: TX7.shadowBounceMix }],
  ['teal0', { shadowTeal: TX7.shadowTeal }],
  ['rim205', { rimGain: TX7.rimGain }],
  ['bloom155', { bloomThreshold: TX7.bloomThreshold, bloomKnee: TX7.bloomKnee }],
  ['fill0sbm20', { fillSkyMix: TX7.fillSkyMix, shadowBounceMix: TX7.shadowBounceMix }],
  ['tx7all', { ...TX7 }],
  /* Not a treatment — a MASK GENERATOR. subjWarmShade is vSlySkin-scoped, so pixels differing
     from `base` are exactly the skinned draws. A mask the renderer draws beats a projected one:
     §11 bills charview's "in frame is not visible" and the night eye box for that exact gap. */
  ['subjwarm0', { subjWarmShade: 0.0 }],
  ['base2', {}],
];
const LITE = ['base', 'fill0', 'sbm20', 'fill0sbm20', 'tx7all', 'base2'];
const PLAN = [
  ['hero', ARMS],                                                    // the shot §111 publishes
  ['temple', ARMS.filter(([n]) => LITE.includes(n))],                // largest swing, +0.098
  ['dunes', ARMS.filter(([n]) => LITE.includes(n))],                 // §104's sphinx avenue
  ['sly-closeup', ARMS.filter(([n]) => LITE.includes(n) || n === 'subjwarm0')],
];

const rows = [];

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 3 * 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — ${info.renderer || '?'}  warnings ${info.warnings?.length ?? 0}`);

  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 200)}`); });

  log('staging hero');
  const st = await page.evaluate(async () => {
    const t = performance.now();
    const r = await window.__GAME.setShot('hero');
    return { ms: performance.now() - t, stats: r.stats };
  });
  log(`staged ${(st.ms / 1000).toFixed(0)}s  draws ${st.stats?.drawCalls} tris ${st.stats?.triangles}`);

  /* ---- timing probe: which sub-operation actually costs, in-page so no CDP in the number ---- */
  const probe = await page.evaluate(async () => {
    const ms = async (f) => { const t = performance.now(); await f(); return +(performance.now() - t).toFixed(0); };
    const out = {};
    out.step_dt60 = await ms(() => window.__GAME.step(1, 1 / 60));
    out.step_dt0_a = await ms(() => window.__GAME.step(1, 0));
    out.step_dt0_b = await ms(() => window.__GAME.step(1, 0));
    out.capture = await ms(async () => { window.__GAME.capture('image/png'); });
    const E = window.__ENGINE, sh = E.get('shading');
    out.poke = await ms(async () => { sh.tune.shadowTeal = 0.15; sh._refreshShadowColor(); });
    return out;
  });
  log(`PROBE (ms): ${JSON.stringify(probe)}`);

  for (const [shot, arms] of PLAN) {
    log(`===== ${shot} =====`);
    if (shot !== 'hero') {
      const s2 = await page.evaluate(async (n) => {
        const t = performance.now(); const r = await window.__GAME.setShot(n);
        return { ms: performance.now() - t, stats: r.stats };
      }, shot);
      log(`  staged ${(s2.ms / 1000).toFixed(0)}s  draws ${s2.stats?.drawCalls} tris ${s2.stats?.triangles}`);
    }

    for (const [name, poke] of arms) {
      const ta = Date.now();
      const r = await page.evaluate(async ([HEAD, poke]) => {
        const mark = {};
        let t = performance.now();
        const E = window.__ENGINE, sh = E.get('shading'), pf = E.get('postfx');
        const v = { ...HEAD, ...poke };
        sh.tune.shadowBounceMix = v.shadowBounceMix;
        sh.tune.shadowTeal = v.shadowTeal;
        sh.tune.fillSkyMix = v.fillSkyMix;
        sh.tune.rimGain = v.rimGain;
        sh.tune.subjWarmShade = v.subjWarmShade;
        sh._refreshShadowColor();                 // shadow knobs only reach the uniform here
        sh.uniforms.uFillSkyMix.value = v.fillSkyMix;
        sh.uniforms.uRimGain.value = v.rimGain;
        sh.uniforms.uSubjWarmShade.value = v.subjWarmShade;
        pf.tune.bloomThreshold = v.bloomThreshold;
        pf.tune.bloomKnee = v.bloomKnee;
        mark.poke = +(performance.now() - t).toFixed(0); t = performance.now();
        await window.__GAME.step(1, 0);           // dt = 0: no sim advance between arms
        mark.step = +(performance.now() - t).toFixed(0); t = performance.now();
        const dataUrl = window.__GAME.capture('image/png');   // itself renders one more frame
        mark.capture = +(performance.now() - t).toFixed(0);
        const sc = sh.uniforms.uShadowColor.value;
        return {
          mark, requested: v,
          readback: {
            fillSkyMix: sh.uniforms.uFillSkyMix.value, rimGain: sh.uniforms.uRimGain.value,
            shadowBounceMix: sh.tune.shadowBounceMix, shadowTeal: sh.tune.shadowTeal,
            bloomThreshold: pf.tune.bloomThreshold, bloomKnee: pf.tune.bloomKnee,
            subjWarmShade: sh.uniforms.uSubjWarmShade.value,
            uShadowColor: [sc.r, sc.g, sc.b],
          },
          dataUrl,
        };
      }, [HEAD, poke]);

      const mism = Object.keys(r.requested).filter((k) => Math.abs(r.readback[k] - r.requested[k]) > 1e-9);
      writeFileSync(path.join(OUT, `${shot}-${name}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      log(`  ${name.padEnd(11)} ${((Date.now() - ta) / 1000).toFixed(0)}s (poke ${r.mark.poke} step ${r.mark.step} cap ${r.mark.capture} ms)  shadowLight(${r.readback.uShadowColor.map((x) => x.toFixed(3)).join(',')})  ${mism.length ? 'MISMATCH ' + mism.join(',') : 'applied ok'}`);
      rows.push({ shot, arm: name, ...r.readback, mark: r.mark, mismatch: mism });
      writeFileSync(path.join(OUT, '..', 'sweep.json'), JSON.stringify(rows, null, 1));
    }
  }
});
log('done');

/**
 * gate1 — bracket for the depth-dependent shadow bounce (§115.4). ONE BOOT, live TUNE pokes,
 * dt = 0 between arms (Debug.js:162's within-boot rule). Plan and predictions:
 * scratchpad/PREREG-gate1.md, written before this file produced a frame.
 *
 * WHAT THIS IS NOT (§11 — the suffix I have not implemented):
 *   - Arms are pokes of the LIVE tree, not rebuilds. Anything outside src/render is present
 *     in every arm identically and cancels in the differences, not in the absolutes.
 *   - `base2` is a self-control, not a treatment: it must return bit-identical to `base` or
 *     the poke/restore path leaked and every number here is void. `base` additionally tests
 *     that the new uniforms are inert at their shipped defaults.
 *   - Frame-wide b-r cannot localise anything, and a changed-pixel count is not evidence of
 *     a fix (§8: the shadow wash moved 83.8% of frame and left the defect bit-intact). The
 *     PNGs are written to be looked at; analyse3.mjs carries the spatial ROIs.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = '/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/gate/frames';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);

/* Shipped state for every knob this sweep touches. Re-read from ToonMaterial.TUNE this
   session rather than quoted from the record (§114.3: the documented shadow light was stale). */
const HEAD = { shadowBounceMix: 0.05, shadowBounceMixLit: 0.05, shadowDepth: [0.45, 0.85] };

const ARMS = [
  ['base',       {}],
  ['gate20_70',  { shadowBounceMixLit: 0.20, shadowDepth: [0.30, 0.70] }],
  ['gate20_85',  { shadowBounceMixLit: 0.20, shadowDepth: [0.45, 0.85] }],
  ['gate20_95',  { shadowBounceMixLit: 0.20, shadowDepth: [0.55, 0.95] }],
  ['gate35_85',  { shadowBounceMixLit: 0.35, shadowDepth: [0.45, 0.85] }],
  /* Uniform values: Lit == Mix, so the gate is inert and these are pure global changes. */
  ['sbm20',      { shadowBounceMix: 0.20,  shadowBounceMixLit: 0.20 }],
  ['sbm085',     { shadowBounceMix: 0.085, shadowBounceMixLit: 0.085 }],
  ['sbm175',     { shadowBounceMix: 0.175, shadowBounceMixLit: 0.175 }],
  ['base2',      {}],
];

const PLAN = ['hero', 'temple', 'sly-closeup', 'night'];
const rows = [];

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 3 * 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — ${info.renderer || '?'}  warnings ${info.warnings?.length ?? 0}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`  page error: ${m.text().slice(0, 200)}`); });

  /* Prove the new uniforms exist before spending 36 frames on them. A missing uniform would
     silently make every gate arm equal to base, and the sweep would read as "no effect". */
  const wired = await page.evaluate(() => {
    const sh = window.__ENGINE.get('shading');
    return {
      hasLit: !!sh.uniforms.uShadowColorLit,
      hasDepth: !!sh.uniforms.uShadowDepth,
      tuneLit: sh.tune.shadowBounceMixLit,
      tuneDepth: sh.tune.shadowDepth,
      col: sh.uniforms.uShadowColor ? [...sh.uniforms.uShadowColor.value.toArray()] : null,
      colLit: sh.uniforms.uShadowColorLit ? [...sh.uniforms.uShadowColorLit.value.toArray()] : null,
    };
  });
  log(`WIRING ${JSON.stringify(wired)}`);
  if (!wired.hasLit || !wired.hasDepth) throw new Error('new uniforms absent — aborting rather than measuring a no-op');

  for (const shot of PLAN) {
    log(`===== ${shot} =====`);
    const s = await page.evaluate(async (n) => {
      const t = performance.now(); const r = await window.__GAME.setShot(n);
      return { ms: performance.now() - t, stats: r.stats };
    }, shot);
    log(`  staged ${(s.ms / 1000).toFixed(0)}s  draws ${s.stats?.drawCalls} tris ${s.stats?.triangles}`);

    for (const [name, poke] of ARMS) {
      const ta = Date.now();
      const r = await page.evaluate(async ([HEAD, poke]) => {
        const mark = {};
        let t = performance.now();
        const sh = window.__ENGINE.get('shading');
        const v = { ...HEAD, ...poke };
        sh.tune.shadowBounceMix = v.shadowBounceMix;
        sh.tune.shadowBounceMixLit = v.shadowBounceMixLit;
        sh.tune.shadowDepth = v.shadowDepth;
        sh._refreshShadowColor();          // both colours AND the window reach uniforms here
        mark.poke = +(performance.now() - t).toFixed(0); t = performance.now();
        await window.__GAME.step(1, 0);
        mark.step = +(performance.now() - t).toFixed(0); t = performance.now();
        const dataUrl = window.__GAME.capture('image/png');
        mark.capture = +(performance.now() - t).toFixed(0);
        const sc = sh.uniforms.uShadowColor.value, sl = sh.uniforms.uShadowColorLit.value;
        const sd = sh.uniforms.uShadowDepth.value;
        return {
          mark, requested: v,
          readback: {
            shadowBounceMix: sh.tune.shadowBounceMix,
            shadowBounceMixLit: sh.tune.shadowBounceMixLit,
            uShadowColor: [sc.r, sc.g, sc.b],
            uShadowColorLit: [sl.r, sl.g, sl.b],
            uShadowDepth: [sd.x, sd.y],
          },
          dataUrl,
        };
      }, [HEAD, poke]);

      /* Readback check on the scalars we can compare directly. */
      const mism = [];
      for (const k of ['shadowBounceMix', 'shadowBounceMixLit']) {
        if (Math.abs(r.readback[k] - r.requested[k]) > 1e-9) mism.push(k);
      }
      if (Math.abs(r.readback.uShadowDepth[0] - r.requested.shadowDepth[0]) > 1e-9
        || Math.abs(r.readback.uShadowDepth[1] - r.requested.shadowDepth[1]) > 1e-9) mism.push('shadowDepth');

      writeFileSync(path.join(OUT, `${shot}-${name}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      const c = r.readback.uShadowColor.map((x) => x.toFixed(3)).join(',');
      const cl = r.readback.uShadowColorLit.map((x) => x.toFixed(3)).join(',');
      log(`  ${name.padEnd(11)} ${((Date.now() - ta) / 1000).toFixed(0)}s (poke ${r.mark.poke} step ${r.mark.step} cap ${r.mark.capture} ms)  deep(${c}) lit(${cl}) win[${r.readback.uShadowDepth.join(',')}]  ${mism.length ? 'MISMATCH ' + mism.join(',') : 'ok'}`);
      rows.push({ shot, arm: name, ...r.readback, mark: r.mark, mismatch: mism });
      writeFileSync(path.join(OUT, '..', 'sweep3.json'), JSON.stringify(rows, null, 1));
    }
  }
});
log('done');

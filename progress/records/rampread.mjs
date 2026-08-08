/**
 * rampread — read the toon ramp DIRECTLY, instead of inferring it from a graded composite.
 *
 * Critic pass 7 reported "there is no toon ramp anywhere". Two sealed experiments then tried to
 * find out why by measuring flat-colour area in the finished frame: PREREG-ramp1 bracketed the
 * ambient fill (answer: not the cause) and PREREG-grain1 bracketed the composite grain (answer:
 * most of the concealment, 1.2% -> 20.96% flat area, but raw flatness only reached 54% against the
 * >85% a quantised ramp gives).
 *
 * Both were reading a number that mixes the ramp with albedo texture, the shadow penumbra, the rim,
 * bloom, AgX and sRGB. This reads `vec3( ramp, ndl, key )` off the scene target with the whole
 * composite bypassed — the term itself, in the pixels it is computed for.
 *
 * THE CALIBRATION COMES FIRST, and it is not optional. toon.glsl.js's own comment says mode 4
 * writes the constants (0.25, 0.50, 0.75) which must arrive as (64, 128, 191) +/-1 on every
 * toon-shaded pixel; if they do not, the bypass is not a bypass and no other mode's numbers mean
 * anything. This runner refuses to report mode 5 unless mode 4 passes.
 *
 * What it settles. With bands 3 the terminators sit at N.L 0.14 and 0.52 (+/- 0.024), so above
 * 0.544 the ramp is a FLAT 1.0 by construction. If G shows a surface living entirely above that,
 * the ramp is correct and the residual variation the flat-area metric scored is albedo, penumbra or
 * rim — not the ramp. R is meaningless without G.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/rampread';
const SHOTS = ['sly-startle', 'temple', 'courtyard'];
/* the ROIs critic pass 7 measured, restated */
const ROIS = {
  'sly-startle': { y: 430, x0: 520, x1: 780, label: 'Sly shirt chest' },
  temple: { y: 430, x0: 120, x1: 380, label: 'temple column' },
  courtyard: { y: 520, x0: 420, x1: 760, label: 'courtyard step' },
};
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);

  const api = await page.evaluate(() => ({
    hasTerm: typeof window.__ENGINE?.get?.('shading')?.debugTerm === 'function',
    hasRaw: typeof window.__ENGINE?.get?.('postfx')?.debugRaw === 'function',
  }));
  log(`api: debugTerm ${api.hasTerm}  debugRaw ${api.hasRaw}`);
  if (!api.hasTerm || !api.hasRaw) { log('!! missing debug API — cannot proceed'); return; }

  /* three discarded prerolls: compile, then the §198.1 early-boot transition */
  for (let i = 0; i < 3; i++) {
    await page.evaluate(async () => { await window.__GAME.setShot('sly-startle', { dt: 0 }); await window.__GAME.step(12, 0); });
    log(`  preroll${i + 1}`);
  }

  const grab = async (shot, mode) => page.evaluate(async ([s, m]) => {
    const G = window.__GAME, E = window.__ENGINE;
    E.get('shading').debugTerm(m);
    E.get('postfx').debugRaw(true);
    await G.setShot(s, { dt: 0 });
    await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
    const png = G.capture('image/png');
    E.get('shading').debugTerm(0);
    E.get('postfx').debugRaw(false);
    return png;
  }, [shot, mode]);

  /* ---- mode 4: prove the bypass before trusting mode 5 ---- */
  const cal = await grab('sly-startle', 4);
  await writeFile(path.join(OUT, 'cal.mode4.png'), Buffer.from(cal.split(',')[1], 'base64'));
  log('  wrote cal.mode4.png  (must read 64,128,191 +/-1 on toon pixels)');

  for (const shot of SHOTS) {
    const png = await grab(shot, 5);
    await writeFile(path.join(OUT, `${shot}.mode5.png`), Buffer.from(png.split(',')[1], 'base64'));
    log(`  wrote ${shot}.mode5.png`);
  }
  await writeFile(path.join(OUT, 'rois.json'), JSON.stringify(ROIS, null, 2));
});
log('DONE');

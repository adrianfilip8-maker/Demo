/**
 * ramp1 — is the smooth hemispheric fill what erases the toon ramp?
 *
 * Runs PREREG-ramp1.md. Six arms on ONE boot, sweeping `debug.fillScale` over the whole fill
 * (hemi + ambient, in both the scene lights and the setKeyLight payload SHADING actually reads),
 * capturing the four shots whose ROIs critic pass 7 measured its terminator finding on.
 *
 * The metric is the critic's own FLAT fraction, not a new one, so the answer is comparable to the
 * verdict it responds to and I cannot pick a statistic afterwards that flatters the change.
 *
 * Arm order puts `restore` adjacent to the strong candidate so the determinism check brackets
 * exactly the window the verdict rests on, per staging4 §2.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/ramp1';
const SHOTS = ['sly-startle', 'temple', 'interior', 'courtyard'];
const ARMS = [
  ['preroll1', 1.0], ['preroll2', 1.0], ['preroll3', 1.0],
  ['base', 1.0], ['f35', 0.35], ['f10', 0.10], ['restore', 1.0], ['f00', 0.0],
];
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

const readback = { arms: [] };

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  const bootId = await page.evaluate(() => window.__ENGINE?.bootId ?? null);
  log(`bootId ${bootId}`);

  for (const [arm, scale] of ARMS) {
    const preroll = arm.startsWith('preroll');
    /* set the lever, then let a frame run so LIGHTING republishes with it */
    const took = await page.evaluate(async (s) => {
      window.__ENGINE.debug.fillScale = s;
      await window.__GAME.step(2, 0);
      return window.__ENGINE.debug.fillScale;
    }, scale);
    if (Math.abs(took - scale) > 1e-6) log(`  !! P-F4 armTook mismatch on ${arm}: ${took} != ${scale}`);

    for (const shot of preroll ? [SHOTS[0]] : SHOTS) {
      const png = await page.evaluate(async (s) => {
        const G = window.__GAME;
        await G.setShot(s, { dt: 0 });
        await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
        return G.capture('image/png');
      }, shot);
      if (!preroll) {
        await writeFile(path.join(OUT, `${shot}.${arm}.png`), Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    const bid = await page.evaluate(() => window.__ENGINE?.bootId ?? null);
    readback.arms.push({ arm, scale, took, bootId: bid, at: Date.now() - t0 });
    log(`  ${arm.padEnd(9)} fillScale ${String(scale).padEnd(5)} took ${took}  boot ${bid === bootId ? 'same' : 'CHANGED'}`);
  }

  /* leave the lever where it shipped, so nothing downstream inherits a test value */
  await page.evaluate(() => { window.__ENGINE.debug.fillScale = 1; });
  await writeFile(path.join(OUT, 'readback.json'), JSON.stringify(readback, null, 2));
});
log('DONE');

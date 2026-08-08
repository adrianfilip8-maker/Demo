/**
 * grain1 — is the smooth hemispheric fill what erases the toon ramp?
 *
 * Runs PREREG-grain1.md. Six arms on ONE boot, sweeping `debug.grainScale` over the whole fill
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

const OUT = '/home/user/Demo/progress/records/grain1';
const SHOTS = ['sly-startle', 'temple', 'interior', 'courtyard'];
const ARMS = [
  ['preroll1', 1.0], ['preroll2', 1.0], ['preroll3', 1.0],
  ['base', 1.0], ['g00', 0.0], ['restore', 1.0],
];
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

const readback = { arms: [] };

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 90 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  /* P-F5 needs a boot identity and THE ENGINE HAS NONE — `window.__ENGINE.bootId` is undefined,
     so the first version of this runner compared null to null and would have "passed" the
     one-boot falsifier on every arm no matter what happened. That is §11's confident-null exactly,
     and it was caught 74 s into an 80-minute run by printing the value instead of trusting it.
     A token minted here does the job the engine cannot: a page reload drops the global, so a
     mismatch is a real reload rather than an absent property reading as agreement. */
  const bootId = await page.evaluate(() => {
    window.__RAMP1_BOOT = window.__RAMP1_BOOT || `b${Math.random().toString(36).slice(2)}${Date.now()}`;
    return window.__RAMP1_BOOT;
  });
  log(`bootToken ${bootId}`);

  for (const [arm, scale] of ARMS) {
    const preroll = arm.startsWith('preroll');
    /* set the lever, then let a frame run so LIGHTING republishes with it */
    const took = await page.evaluate(async (s) => {
      window.__ENGINE.debug.grainScale = s;
      await window.__GAME.step(2, 0);
      return window.__ENGINE.debug.grainScale;
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
    const bid = await page.evaluate(() => window.__RAMP1_BOOT ?? null);
    const same = bid !== null && bid === bootId;
    readback.arms.push({ arm, scale, took, bootToken: bid, sameBoot: same, at: Date.now() - t0 });
    log(`  ${arm.padEnd(9)} grainScale ${String(scale).padEnd(5)} took ${took}  boot ${same ? 'same' : 'CHANGED/LOST'}`);
    if (!same) log(`  !! P-F5 boot token lost or changed on ${arm} — run is VOID`);
  }

  /* leave the lever where it shipped, so nothing downstream inherits a test value */
  await page.evaluate(() => { window.__ENGINE.debug.grainScale = 1; });
  await writeFile(path.join(OUT, 'readback.json'), JSON.stringify(readback, null, 2));
});
log('DONE');

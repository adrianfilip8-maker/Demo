/**
 * kaykitprops — capture the shots the KayKit props actually land in, so the placement is judged
 * on frames rather than on a coordinate table.
 *
 * The props go in three clusters (west and east colonnade in the courtyard, the hypostyle aisles,
 * and the tomb hoard), so the shots that can see them are `courtyard`, `temple` and `interior`.
 * `hero` is included as a CONTROL: nothing was placed anywhere near it, so if `hero` changes,
 * something landed where it was not meant to.
 *
 *     node kaykitprops.mjs on      # props placed (the shipped default)
 *     node kaykitprops.mjs off     # ?kaykit=off, for the before/after pair
 *
 * Registers no band and gates nothing. It also reads the module's own stats back out of the
 * engine, because "30 placed" and "30 visible in frame" are different claims and only the first
 * is cheap to verify.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ARM = (process.argv[2] || 'on').trim();
const OUT = '/home/user/Demo/progress/records/kaykitprops';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 45 * 60 * 1000,
  query: ARM === 'off' ? 'kaykit=off' : '',
}, async ({ page, info }) => {
  log(`boot ok (${ARM}) — warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  const stats = await page.evaluate(() => {
    const k = window.__ENGINE?.get?.('kaykit');
    return { mode: k?.mode ?? null, stats: k?.stats ?? null };
  });
  log(`kaykit: ${JSON.stringify(stats)}`);

  /* `hero` is the nearest thing to a control: 20 of the placements are in its frustum, but all at
     33-49 m and occluded, and its first capture showed none of them. The character close-ups are
     covered by `glovecheck.mjs` instead — no prop is now nearer than 25 m in any of them, which is
     background, and the prop that had been at 6.9 m was dropped rather than shipped. */
  for (const shot of ['courtyard', 'temple', 'interior', 'hero']) {
    const png = await page.evaluate(async (s) => {
      const G = window.__GAME;
      await G.setShot(s, { dt: 0 });
      await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
      return G.capture('image/png');
    }, shot);
    await writeFile(path.join(OUT, `${shot}.${ARM}.png`), Buffer.from(png.split(',')[1], 'base64'));
    log(`  wrote ${shot}.${ARM}.png`);
  }
});
log('DONE');

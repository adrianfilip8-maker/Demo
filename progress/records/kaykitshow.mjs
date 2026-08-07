/**
 * kaykitshow — render the KayKit showcase row so the pack's look can be judged before any of it
 * is placed in the level. Two arms from separate boots, since `?kaykit=` is read at module load:
 *
 *   sandstone  the retinted atlas (this game's palette)
 *   raw        the pack's own dungeon grey/brown, for comparison
 *
 * Not a sealed A/B and it registers no band. It answers "do these read under our cel shading and
 * at our scale", which is a look question for the owner, not a measurement.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MODE = (process.argv[2] || 'sandstone').trim();
const OUT = '/home/user/Demo/progress/records/kaykit';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 40 * 60 * 1000,
  query: `kaykit=${MODE === 'raw' ? 'raw' : '1'}`,
}, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);
  const who = await page.evaluate(() => {
    const k = window.__ENGINE?.get?.('kaykit');
    return { mode: k?.mode ?? null, loaded: k?.stats?.loaded ?? 0, failed: k?.stats?.failed ?? 0, tris: Math.round(k?.stats?.tris ?? 0) };
  });
  log(`kaykit: mode=${who.mode} loaded=${who.loaded} failed=${who.failed} tris=${who.tris}`);
  if (!who.loaded) log('!! nothing loaded — the showcase is empty, the frame will prove nothing');

  const r = await page.evaluate(async () => {
    const G = window.__GAME;
    await G.setShot('kaykit', { dt: 0 });
    await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
    return G.capture('image/png');
  });
  await writeFile(path.join(OUT, `showcase.${MODE}.png`), Buffer.from(r.split(',')[1], 'base64'));
  log(`  wrote showcase.${MODE}.png`);
});
log('DONE');

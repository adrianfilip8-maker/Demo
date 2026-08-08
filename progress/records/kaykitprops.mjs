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

  /* `hero` IS NOT A CONTROL, and calling it one was my error — twice, in this comment and in a
     commit message. It was true of the original thirty placements, which were all 33-49 m out and
     occluded, and it stopped being true in the same change that quoted it: that change added
     `crates_stacked` at (−11.5, 9.5) with the comment `// hero 23.8 m`, i.e. a prop placed FOR this
     shot. The re-render duly shows a barrel at a column base right of frame, and the difference
     against the previous run localises it — 1064 changed pixels in one cell there, separate from
     the 385 at Sly from the glove curl.

     So `hero` is a JUDGED shot like the others now. What it actually checks is that nothing landed
     where it was not designed to: the barrel is at 24-27 m, small, at a column base, and does not
     compete with the figure. The character close-ups are covered by `glovecheck.mjs`; no prop is
     nearer than 25 m in any of them, and the one that had been at 6.9 m was dropped rather than
     shipped. */
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

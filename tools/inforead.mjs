#!/usr/bin/env node
/* inforead — read `renderer.info.render` for one shot, several times, in ONE boot.
 *
 * WHY THIS EXISTS (§719.7). `shots/<run>/report.json` carries a draw-call and a triangle number
 * per shot, and two lanes have now compared that column across two runs as if it were like for
 * like. It is not: it is the FIRST frame of a boot, and the first frame carries a warm-up term.
 * Measured on `sly-closeup`, one boot, consecutive `setShot` calls: 272 calls / 2,328,441 tris on
 * the first and 270 / 2,328,401 on every one after it — while a different tool's first frame at a
 * different commit read 270. So the warm-up term is a property of the BOOT, not of the tree, and a
 * ±2 between two manifests says nothing at all about a change.
 *
 * This prints both terms so the question can be settled in three minutes instead of by argument.
 * It is deliberately tiny and resolution-independent (draw counts are; culling does not care about
 * pixels), so it can run at 320x180 and cost almost nothing of the shared capture lock.
 *
 *   node tools/inforead.mjs [shot]        # default sly-closeup
 */
import { withGame } from './harness.mjs';

const SHOT = process.argv[2] || 'sly-closeup';
const out = await withGame({ width: 320, height: 180, quality: 'high' }, async ({ page }) => {
  const rows = [];
  for (const k of ['first', 'second', 'third']) {
    rows.push(await page.evaluate(async ([s, key]) => {
      await window.__GAME.setShot(s, { dt: 0 });
      const r = window.__ENGINE.renderer.info.render;
      return { key, calls: r.calls, triangles: r.triangles };
    }, [SHOT, k]));
  }
  return rows;
});
console.log(`### renderer.info.render — ${SHOT}, one boot, three consecutive setShot calls`);
for (const r of out) console.log(`  ${r.key.padEnd(7)} calls ${String(r.calls).padStart(5)}   triangles ${String(r.triangles).padStart(9)}`);
const same = out.every((r) => r.calls === out[out.length - 1].calls);
console.log(same ? '  (no warm-up term in this boot)' : '  WARM-UP TERM PRESENT: the first frame differs from steady state — do not compare two manifests');

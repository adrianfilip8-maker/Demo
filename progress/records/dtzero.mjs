/**
 * dtzero — does `G.step(n, 0)` actually re-render, or does the capture return a stale frame?
 *
 * matident painted 85 scene materials RED and got 0 differing pixels. That cannot be a shading bug;
 * it means the frame we captured was not drawn after the mutation. Every probe that found "the
 * uniform does not reach the shader" (rampwire2, rampwire3, and cel1's KB arm) used
 * `G.step(n, 0)` — dt = 0 — with no `setShot` between the poke and the capture. `grain1`, whose arms
 * DID differ, called `setShot` in between.
 *
 * So the suspect is dt = 0. Three arms, same red repaint, only the step differing. The red repaint
 * is the calibration: it MUST change the frame under any working path, so an arm that stays at 0 is
 * the arm whose step does not render.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { PNG } from 'pngjs';

const log = (s) => process.stdout.write(`${s}\n`);
await withGame({ width: 320, height: 180, quality: 'high', timeout: 20 * 60 * 1000 }, async ({ page }) => {
  const cap = async () => PNG.sync.read(Buffer.from(
    (await page.evaluate(() => window.__GAME.capture('image/png'))).split(',')[1], 'base64'));
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]) > 3) n++; return n; };

  await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); await window.__GAME.step(8, 1 / 60); });
  const base = await cap();

  /* paint red once; it stays red for every arm below */
  const n = await page.evaluate(() => {
    let k = 0;
    window.__ENGINE.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m?.color) { m.color.setRGB(1, 0, 0); m.needsUpdate = true; k++; }
    });
    return k;
  });
  log(`painted ${n} materials red\n`);

  await page.evaluate(async () => { await window.__GAME.step(4, 0); });
  const a1 = diff(base, await cap());

  await page.evaluate(async () => { await window.__GAME.step(4, 1 / 60); });
  const a2 = diff(base, await cap());

  await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); await window.__GAME.step(4, 0); });
  const a3 = diff(base, await cap());

  const total = base.width * base.height;
  log(`ARM 1  step(4, 0)              : ${a1} / ${total} px`);
  log(`ARM 2  step(4, 1/60)           : ${a2} / ${total} px`);
  log(`ARM 3  setShot + step(4, 0)    : ${a3} / ${total} px`);
  log('');
  if (a1 === 0 && a2 > 100) log('=> dt = 0 DOES NOT RENDER. Every probe using step(n, 0) measured a stale frame.');
  else if (a1 === 0 && a3 > 100) log('=> only setShot forces a render. step(n, 0) alone measures a stale frame.');
  else if (a1 > 100) log('=> dt = 0 renders fine. The stale-frame hypothesis is WRONG; look elsewhere.');
  else log('=> nothing rendered under any arm — the capture path itself is stale.');
});

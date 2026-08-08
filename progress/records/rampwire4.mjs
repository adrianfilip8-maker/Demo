/**
 * rampwire4 — the ramp test, re-run with a dt that actually renders.
 *
 * dtzero.mjs established that `G.step(n, 0)` DOES NOT RENDER: an all-red repaint of 90 scene
 * materials moved 0 px under step(4, 0) and 4969 px under step(4, 1/60). rampwire2, rampwire3 and
 * matident all used dt = 0 between the poke and the capture, so every "the uniform does not reach
 * the shader" null they produced is an artefact of my own harness.
 *
 * This repeats the two arms that matter with dt = 1/60, and carries the red repaint as the
 * calibration arm — the same one that exposed the problem, so it cannot silently stop working.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { PNG } from 'pngjs';
const log = (s) => process.stdout.write(`${s}\n`);

await withGame({ width: 320, height: 180, quality: 'high', timeout: 20 * 60 * 1000 }, async ({ page }) => {
  const step = (n) => page.evaluate(async (k) => { await window.__GAME.step(k, 1 / 60); }, n);
  const cap = async () => PNG.sync.read(Buffer.from(
    (await page.evaluate(() => window.__GAME.capture('image/png'))).split(',')[1], 'base64'));
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]) > 3) n++; return n; };

  await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); });
  await step(8);
  const base = await cap();
  const total = base.width * base.height;

  await page.evaluate(() => window.__ENGINE.get('shading').setRampTuning({ hi: 0.95 }));
  await step(4);
  const dHi = diff(base, await cap());
  await page.evaluate(() => window.__ENGINE.get('shading').setRampTuning({ hi: 0.52 }));
  await step(4);

  await page.evaluate(() => window.__ENGINE.get('shading').setRampTuning({ soft: 0.30 }));
  await step(4);
  const dSoft = diff(base, await cap());
  await page.evaluate(() => window.__ENGINE.get('shading').setRampTuning({ soft: 0.024 }));
  await step(4);

  /* CALIBRATION — must move, or this harness is stale again */
  await page.evaluate(() => {
    window.__ENGINE.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m?.color) { m.color.setRGB(1, 0, 0); m.needsUpdate = true; }
    });
  });
  await step(4);
  const dRed = diff(base, await cap());

  log(`ARM 1  SHARED  uTermHi 0.52 -> 0.95   : ${dHi} / ${total} px`);
  log(`ARM 2  PER-MAT uTermSoft 0.024 -> 0.30: ${dSoft} / ${total} px`);
  log(`CALIB  all materials red              : ${dRed} / ${total} px`);
  log('');
  if (dRed < 100) log('=> CALIBRATION FAILED — harness still stale, nothing here is interpretable.');
  else if (dHi > 100) log('=> THE RAMP LEVER WORKS. §217 is RETRACTED: it was my dt=0 harness bug throughout.');
  else if (dSoft > 100) log('=> per-material works, shared does not. §217 survives in narrowed form.');
  else log('=> calibration fires but NEITHER ramp path moves the frame. §217 stands, now on a sound harness.');
});

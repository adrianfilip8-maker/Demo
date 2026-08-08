/**
 * rampwire2 — isolate the ramp lever from every confound, because I have now been wrong three times
 * reasoning about this subsystem.
 *
 * cel1's KB arm concluded "the shared uniform block does not reach the shader". That conclusion has
 * a confound I did not control: the arm poked `setRampTuning` and then called `G.setShot()` before
 * capturing, and `setShot` emits `timeOfDay`, which drives LIGHTING, which republishes into SHADING.
 * `applyShot` itself only moves the camera and sets tod — but the emit chain is exactly the sort of
 * thing that quietly restores a uniform.
 *
 * So this does the experiment with NOTHING in between:
 *   A. capture at the shipped 0.52
 *   B. set hi = 0.95, step, capture — no setShot, no shot change, no tod change
 *   C. read the uniform back
 *   D. now call setShot and read it AGAIN — does the shot change clobber it?
 *
 * If A and B differ, the lever works and cel1's KB arm was defeated by its own runner, not by a
 * rendering defect — and §217 is my error, not a finding.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = '/home/user/Demo/progress/records/rampwire2';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 640, height: 360, quality: 'high', timeout: 25 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);

  const grab = async (tag) => {
    const png = await page.evaluate(async () => {
      const G = window.__GAME;
      await G.step(4, 0); G.capture('image/png'); await G.step(1, 0);
      return G.capture('image/png');
    });
    await writeFile(`${OUT}/${tag}.png`, Buffer.from(png.split(',')[1], 'base64'));
    return png;
  };

  /* Park on a shot ONCE, then never touch setShot again until step D. */
  await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); await window.__GAME.step(8, 0); });

  const a = await grab('A_052');
  const readA = await page.evaluate(() => window.__ENGINE.get('shading').uniforms.uTermHi.value);

  await page.evaluate(async () => {
    window.__ENGINE.get('shading').setRampTuning({ hi: 0.95 });
    await window.__GAME.step(4, 0);
  });
  const b = await grab('B_095');
  const readB = await page.evaluate(() => window.__ENGINE.get('shading').uniforms.uTermHi.value);

  /* D — does a shot change clobber the value? */
  const readD = await page.evaluate(async () => {
    await window.__GAME.setShot('courtyard', { dt: 0 });
    await window.__GAME.step(6, 0);
    return window.__ENGINE.get('shading').uniforms.uTermHi.value;
  });

  /* Direct pixel diff of A vs B, no ROI, no statistic — just "did anything at all change". */
  const px = (d) => Buffer.from(d.split(',')[1], 'base64');
  const { PNG } = await import('pngjs');
  const pa = PNG.sync.read(px(a)), pb = PNG.sync.read(px(b));
  let diff = 0, maxd = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2]);
    if (d > 3) diff++;
    if (d > maxd) maxd = d;
  }
  const total = pa.width * pa.height;

  log(`uTermHi read: after A ${readA}   after set ${readB}   after a setShot ${readD}`);
  log(`A vs B differing pixels: ${diff} / ${total} (${(100 * diff / total).toFixed(2)}%)  max channel-sum delta ${maxd}`);
  log('');
  if (diff > total * 0.01) {
    log('=> THE LEVER WORKS. cel1 KB was defeated by its own runner, not by a rendering defect.');
    log('   §217 is MY ERROR and must be retracted.');
  } else if (readD !== readB) {
    log(`=> setShot CLOBBERS the uniform (${readB} -> ${readD}). cel1 KB poked, then setShot reset it.`);
    log('   §217 is MY ERROR and must be retracted.');
  } else {
    log('=> the value persists AND the frame does not move. §217 stands.');
  }
  await writeFile(`${OUT}/result.json`, JSON.stringify({ readA, readB, readD, diff, total, maxd }, null, 2));
});
log('DONE');

/**
 * dltailprobe — is the tail's flat fan made by the SKINNING or by the tail SPRING?
 *
 * Five hypotheses have failed on this defect (path-dependence, mid-bone weight pinching, an
 * eyeballed source centreline, flat shading, and before those a plain geometry fault). Offline
 * measurement says the mesh handed to the skinner is a proper tube — rebound bind-pose
 * cross-sections 0.33 x 0.31, aspect 0.80-1.54 along its length — so the collapse must arrive
 * with the pose. This stops guessing and looks directly.
 *
 * Method: boot, stage the shot, then NEUTER the animation in-page — replace `animation.update`
 * with a no-op and reset every bone to the model's own recorded rest quaternion — and capture.
 * No src/** edit: the monkeypatch lives entirely in the page, so nothing ships and no capture
 * lock discipline is strained.
 *
 *   tail reads as a TUBE  -> the geometry and weights are fine; the tail SPRING is the cause
 *   tail still a FAN      -> the skinning is wrong in a way bind-pose vertex measurements missed
 *
 * Writes both: the posed frame and the rest-pose frame, from one boot, for direct comparison.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CHAR = (process.argv[2] || 'dl').trim();
const OUT = `/home/user/Demo/progress/records/dltailprobe${CHAR === 'dl' ? '' : '-' + CHAR}`;
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 40 * 60 * 1000, query: `char=${CHAR}` },
  async ({ page, info }) => {
    log(`boot ok — warnings ${info.warnings?.length ?? 0}`);
    page.on('console', (m) => { if (m.type() === 'error') log(`  PAGE ERROR: ${m.text().slice(0, 200)}`); });

    /* 1 — the shot exactly as dlsmoke takes it, animation live */
    const posed = await page.evaluate(async () => {
      const G = window.__GAME;
      await G.setShot('sly-closeup', { dt: 0 });
      await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
      return G.capture('image/png');
    });
    await writeFile(path.join(OUT, 'closeup.posed.png'), Buffer.from(posed.split(',')[1], 'base64'));
    log('  posed frame written');

    /* 2 — animation neutered, every bone back to its recorded rest quaternion */
    const info2 = await page.evaluate(async () => {
      const G = window.__GAME;
      const a = window.__ENGINE.get('animation');
      if (a) a.update = () => {};                       // in-page only; nothing ships
      const c = window.__ENGINE.get('character');
      let reset = 0;
      for (const nm of Object.keys(c.bones || {})) {
        const q = c._restQ?.[nm];
        if (q) { c.bones[nm].quaternion.copy(q); reset++; }
        c.bones[nm].scale.set(1, 1, 1);
      }
      c.root.updateMatrixWorld(true);
      await G.step(12, 0); G.capture('image/png'); await G.step(1, 0);
      return { reset, bones: Object.keys(c.bones || {}).length, dataUrl: G.capture('image/png') };
    });
    await writeFile(path.join(OUT, 'closeup.rest.png'), Buffer.from(info2.dataUrl.split(',')[1], 'base64'));
    log(`  rest frame written — ${info2.reset}/${info2.bones} bones reset to rest`);
  });
log('DONE');

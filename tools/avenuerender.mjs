/**
 * §97 asked for the avenue candidate to be argued ON A RENDER rather than on a visibility table.
 * avenueshot.mjs ray-marches TERRAIN ONLY, has no sun term, and every top station sits 16 m AGL.
 * This renders them so those three gaps can actually be looked at.
 *
 * Stations:
 *   shipped   - `dunes` as it ships, for reference
 *   A         - x 0, z 88, 16 m AGL, fov 38   (§97's processional-signature row: 14/16, 99% width)
 *   B         - x 0, z 88,  6 m AGL, fov 38   (same stance at character height - tests whether the
 *                                              elevation is doing the work or the on-axis stance is)
 *   C         - x 10, z 92, 16 m AGL, fov 50  (§97's 15/16 row: more animals, clustered centre)
 */
import { withGame } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const SCR = process.env.SANDS_OUT || 'shots/avenue';

const STATIONS = [
  ['A-onaxis-16m-fov38', 0, 88, 16, 38, [0, 6, 40]],
  ['B-onaxis-6m-fov38', 0, 88, 6, 38, [0, 4, 40]],
  ['C-off-16m-fov50', 10, 92, 16, 50, [0, 6, 40]],
];

mkdirSync(SCR, { recursive: true });
const res = await withGame({ width: 1280, height: 720, quality: 'high', timeout: 300000 }, async ({ page }) => {
  await page.evaluate(async () => { await window.__GAME.setShot('dunes'); });
  const shipped = await page.evaluate(async () => {
    await window.__GAME.step(2, 0);
    return window.__GAME.capture();
  });

  const out = [{ tag: 'shipped-dunes', png: shipped }];
  for (const [tag, x, z, agl, fov, target] of STATIONS) {
    const png = await page.evaluate(async ([x, z, agl, fov, target]) => {
      const eng = window.__ENGINE;
      const terrain = eng.get('terrain');
      const gy = terrain?.heightAt ? terrain.heightAt(x, z) : 0;
      const cam = eng.camera;
      cam.fov = fov;
      cam.position.set(x, gy + agl, z);
      cam.lookAt(target[0], target[1], target[2]);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      await window.__GAME.step(2, 0);
      eng.renderFrame(0);
      return window.__GAME.capture();
    }, [x, z, agl, fov, target]);
    out.push({ tag, png });
  }
  return out;
});

for (const { tag, png } of res) {
  writeFileSync(`${SCR}/av-${tag}.png`, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`wrote av-${tag}.png`);
}

/**
 * matident — are the materials SHADING writes the materials the scene DRAWS?
 *
 * rampwire3 settled that neither a shared uniform (uTermHi, uInkNight) nor a per-material one
 * (uTermSoft, confirmed written: 38 materials, sample value 0.3) moves a single pixel. So the
 * patched toon program is not drawing these pixels, and the question is no longer "does the write
 * land" — it does — but "does the thing written to appear in the frame".
 *
 * Leading hypothesis, stated so it can be wrong: `Shading._cache` holds 38 materials, and the scene
 * meshes use DIFFERENT instances, so every write goes to an object nothing renders. Cheap to test by
 * identity. The alternative — that the frame is served from something that is not being redrawn — is
 * tested by poking a material found BY TRAVERSING THE SCENE rather than from the cache.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';

const OUT = '/home/user/Demo/progress/records/matident';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 640, height: 360, quality: 'high', timeout: 25 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok`);
  const grab = async (tag) => {
    const d = await page.evaluate(async () => {
      const G = window.__GAME;
      await G.step(4, 0); G.capture('image/png'); await G.step(1, 0);
      return G.capture('image/png');
    });
    await writeFile(`${OUT}/${tag}.png`, Buffer.from(d.split(',')[1], 'base64'));
    return PNG.sync.read(Buffer.from(d.split(',')[1], 'base64'));
  };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) { const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]); if (d > 3) n++; } return n; };

  await page.evaluate(async () => { await window.__GAME.setShot('temple', { dt: 0 }); await window.__GAME.step(8, 0); });
  const base = await grab('base');

  const ident = await page.evaluate(() => {
    const E = window.__ENGINE, sh = E.get('shading');
    const cache = [...sh._cache.values()];
    const inScene = [];
    E.scene.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) inScene.push(m);
    });
    const uniq = [...new Set(inScene)];
    const shared = uniq.filter((m) => cache.includes(m));
    return {
      cacheSize: cache.length,
      sceneMaterials: uniq.length,
      cacheMaterialsAlsoInScene: shared.length,
      sceneWithSlyUniforms: uniq.filter((m) => m.userData?.slyUniforms).length,
      sceneVisible: uniq.filter((m) => m.visible !== false).length,
    };
  });
  log(`cache ${ident.cacheSize} materials · scene has ${ident.sceneMaterials} unique · IN BOTH: ${ident.cacheMaterialsAlsoInScene}`);
  log(`scene materials carrying slyUniforms: ${ident.sceneWithSlyUniforms}`);

  /* Poke a material found by TRAVERSING THE SCENE — not from the cache. Set its base colour red:
     an unmissable change that needs no toon path at all. If even THIS does not move the frame, the
     capture is not showing the scene we are mutating. */
  const poked = await page.evaluate(async () => {
    const E = window.__ENGINE;
    let n = 0;
    E.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m?.color) { m.color.setRGB(1, 0, 0); m.needsUpdate = true; n++; }
      }
    });
    await window.__GAME.step(4, 0);
    return n;
  });
  const dRed = diff(base, await grab('allred'));
  log(`painted ${poked} scene materials RED -> ${dRed} differing px`);
  log(dRed > 1000
    ? '=> the capture DOES show scene mutations. The toon uniforms are reaching a material that is not drawn.'
    : '=> even an all-red repaint does not move the frame. The capture is NOT showing the live scene.');
  await writeFile(`${OUT}/result.json`, JSON.stringify({ ident, poked, dRed }, null, 2));
});
log('DONE');

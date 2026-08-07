/**
 * dlsmoke — smoke capture for the DOWNLOADED-model pipeline (`?char=dl`, SlyModelDL.js).
 *
 * Not an A/B and not a critic round: this verifies the ingestion path end to end — GLB loads,
 * auto-skin binds, toon materials apply, clips drive the skeleton — by booting with the dl token
 * and photographing two canonical shots at dt:0 (§195/§28: the staging path itself frozen).
 * Runs against WHATEVER src/assets/sly-dl.glb holds: today the Khronos placeholder (a grey
 * mannequin proves the pipeline; nobody will mistake it for a verdict), the real downloaded Sly
 * once its host is unblocked and the asset lands.
 *
 * Identity readback asserts root 'slydl' — a silently-ignored token producing a confident
 * wrong-model capture is §194's failure shape, same guard as charab.mjs.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/dlsmoke';
const SHOTS = ['sly-closeup', 'traversal'];

const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);

await mkdir(OUT, { recursive: true });
const report = { runner: 'dlsmoke.mjs', at: new Date().toISOString(), shots: {} };

await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 40 * 60 * 1000,
  query: 'char=dl',
}, async ({ page, info }) => {
  log(`boot ok — renderer ${info.renderer}; warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  const who = await page.evaluate(() => {
    const c = window.__ENGINE?.get?.('character');
    return {
      rootName: c?.root?.name ?? null,
      meshName: c?.mesh?.name ?? null,
      bones: c?.bones ? Object.keys(c.bones).length : 0,
      verts: c?.mesh?.geometry?.attributes?.position?.count ?? 0,
      materials: Array.isArray(c?.mesh?.material) ? c.mesh.material.length : (c?.mesh?.material ? 1 : 0),
      height: c?.root?.userData?.height ?? null,
      source: c?.root?.userData?.source ?? null,
    };
  });
  report.identity = who;
  log(`identity: root="${who.rootName}" mesh="${who.meshName}" bones=${who.bones} verts=${who.verts} mats=${who.materials}`);
  if (who.rootName !== 'slydl') {
    report.tokenMismatch = true;
    log(`!! TOKEN MISMATCH — expected root 'slydl', got '${who.rootName}'. The dl token did not take.`);
  }

  for (const shot of SHOTS) {
    const s0 = Date.now();
    const r = await page.evaluate(async (name) => {
      const G = window.__GAME;
      const staged = await G.setShot(name, { dt: 0 });   // §195: staging path frozen
      await G.step(12, 0);
      G.capture('image/png');
      await G.step(1, 0);
      return { dataUrl: G.capture('image/png'), stats: staged?.stats ?? null };
    }, shot);
    const file = path.join(OUT, `${shot}.dl.png`);
    await writeFile(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    report.shots[shot] = { secs: Math.round((Date.now() - s0) / 1000), stats: r.stats };
    log(`  ${shot}  ${report.shots[shot].secs}s -> ${path.basename(file)}`);
  }
});

await writeFile(path.join(OUT, 'dlsmoke.json'), JSON.stringify(report, null, 1));
log(`DONE${report.tokenMismatch ? '  !! TOKEN MISMATCH' : ''}`);

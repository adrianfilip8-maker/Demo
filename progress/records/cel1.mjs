/**
 * cel1 — runs PREREG-cel1.md. Does aliasing `Shading.make` put the character on the cel material?
 *
 * TWO boots, because `make` is consumed at material-construction time inside `init()` and there is
 * no runtime toggle. `?cel=off` genuinely removes the property, so every call site takes its own
 * native fallback — the pre-fix build, exactly. The harness's `query` option exists for precisely
 * this ("choices that must be made BEFORE any module loads").
 *
 * The KB arm is the run's integrity check and it is aimed at the specific claim rather than at
 * "something must move": collapsing the lit band with setRampTuning({hi: 0.95}) MUST grossly change
 * the character if the character is genuinely on the toon material. If it does not, the character is
 * still on MeshStandardMaterial, the alias never reached it, and every number here is void —
 * including a `cand` that appears to confirm. That is §210.2's lesson written as an arm.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = '/home/user/Demo/progress/records/cel1';
const SHOTS = ['sly-startle', 'temple', 'interior', 'courtyard'];
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

const shoot = async (page, arm, shots) => {
  for (const shot of shots) {
    /* `G.capture()` RETURNS the data URL; it does not stash it on the game object. The first
       version of this runner read a `G.lastCapture` that does not exist and wrote nothing for
       every shot — caught by printing the miss rather than assuming the write. The double call
       mirrors grain1: the first capture flushes the frame, the second returns the settled one. */
    const png = await page.evaluate(async (s) => {
      const G = window.__GAME;
      await G.setShot(s, { dt: 0 });
      await G.step(12, 1/60); G.capture("image/png"); await G.step(1, 1/60);
      return G.capture('image/png');
    }, shot);
    if (!png) { log(`  !! ${arm}/${shot} produced no capture`); continue; }
    await writeFile(`${OUT}/${shot}.${arm}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  const stats = await page.evaluate(() => ({ ...window.__GAME.stats || window.__ENGINE.stats }));
  log(`  ${arm}: draws ${stats.drawCalls} tris ${stats.triangles} programs ${stats.programs}`);
  return stats;
};

const readback = { arms: {} };

/* ---- BOOT A: cel=off, the pre-fix build ---- */
await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000, query: 'cel=off' },
  async ({ page, info }) => {
    log(`boot A (cel=off) ok — warnings ${info.warnings?.length ?? 0}`);
    for (const w of info.warnings || []) log(`   ! ${w}`);
    /* Prove the arm is what it claims BEFORE capturing it: with cel=off the property must be
       absent, and the character's material must not be a toon material. */
    const probe = await page.evaluate(() => {
      const sh = window.__ENGINE.get('shading');
      let charMat = null;
      window.__ENGINE.scene.traverse((o) => {
        if (charMat || !o.isSkinnedMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m) charMat = { mesh: o.name, type: m.type, isToon: !!m.userData?.slyUniforms };
      });
      return { hasMake: typeof sh?.make, charMat };
    });
    log(`  A probe: shading.make = ${probe.hasMake}  character material = ${JSON.stringify(probe.charMat)}`);
    readback.armA = probe;
    readback.arms.base = await shoot(page, 'base', SHOTS);
  });

/* ---- BOOT B: cel=on (default), the alias in force ---- */
await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 },
  async ({ page, info }) => {
    log(`boot B (cel=on) ok — warnings ${info.warnings?.length ?? 0}`);
    for (const w of info.warnings || []) log(`   ! ${w}`);
    const probe = await page.evaluate(() => {
      const sh = window.__ENGINE.get('shading');
      let charMat = null;
      window.__ENGINE.scene.traverse((o) => {
        if (charMat || !o.isSkinnedMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m) charMat = { mesh: o.name, type: m.type, isToon: !!m.userData?.slyUniforms };
      });
      return { hasMake: typeof sh?.make, charMat };
    });
    log(`  B probe: shading.make = ${probe.hasMake}  character material = ${JSON.stringify(probe.charMat)}`);
    readback.armB = probe;

    readback.arms.cand = await shoot(page, 'cand', SHOTS);

    /* KB — collapse the lit band. If the character does not move, it is not on the ramp. */
    await page.evaluate(async () => {
      window.__ENGINE.get('shading').setRampTuning({ hi: 0.95 });
      await window.__GAME.step(4, 1/60);
    });
    readback.arms.KB = await shoot(page, 'KB', SHOTS);

    await page.evaluate(async () => {
      window.__ENGINE.get('shading').setRampTuning({ hi: 0.52 });
      await window.__GAME.step(4, 1/60);
    });
    readback.arms.restore = await shoot(page, 'restore', SHOTS);
  });

await writeFile(`${OUT}/readback.json`, JSON.stringify(readback, null, 2));
log('DONE');

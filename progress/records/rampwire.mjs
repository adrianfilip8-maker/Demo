/**
 * rampwire — why does `setRampTuning` change nothing, on ANY surface?
 *
 * cel1's KB arm moved `uTermHi` 0.52 -> 0.95 and produced **0.0 L of change** on all eight ROIs,
 * including `temple/column_R`, which is Architecture geometry built through `shading.toon()` and is
 * certainly a toon material. So the failure is not the §213 alias and not the character: the ramp
 * lever does not reach the shader at all. That is §210.2's finding arriving a second time, on the
 * lever task #25's whole A/B depends on.
 *
 * Everything reasoning can check already checks out, which is why this asks the page instead:
 *   · `this.uniforms` (ToonMaterial.js:730) DOES contain uTermLo/uTermHi.
 *   · `onBeforeCompile` does `Object.assign(shader.uniforms, self.uniforms, own)` — by reference.
 *   · `own` carries uTermSoft, not uTermHi, so there is no shadowing.
 *   · toon.glsl.js:129-131 declares them and :173 reads them.
 *
 * §210.2's probe failed here because it read `material.program`, which modern three does not have.
 * The right handle is `renderer.properties.get(material).currentProgram`. This reports facts.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = '/home/user/Demo/progress/records/rampwire';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 640, height: 360, quality: 'high', timeout: 25 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);

  const r = await page.evaluate(async () => {
    const E = window.__ENGINE, G = window.__GAME, R = E.renderer;
    const sh = E.get('shading');
    const out = { hasShading: !!sh, hasSetter: typeof sh?.setRampTuning, mats: [] };

    await G.setShot('temple', { dt: 0 });
    await G.step(4, 0);

    /* Collect toon materials that are actually IN the frame. */
    const found = [];
    E.scene.traverse((o) => {
      if (!o.isMesh || found.length >= 4) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m?.userData?.slyUniforms && !found.some((f) => f.m === m)) found.push({ name: m.name || o.name, m });
    });

    out.sharedBefore = sh.uniforms?.uTermHi?.value ?? null;
    out.sharedIsObject = !!sh.uniforms?.uTermHi;

    for (const f of found) {
      const props = R.properties.get(f.m);
      const prog = props?.currentProgram;
      const su = prog?.getUniforms?.();
      /* seq is the list three will actually UPLOAD each frame. If uTermHi is absent from it, the
         value can be written all day and never reach the GPU. */
      const seqIds = su?.seq ? su.seq.map((x) => x.id) : null;
      const mapIds = su?.map ? Object.keys(su.map) : null;
      out.mats.push({
        name: String(f.name).slice(0, 26),
        compiled: !!prog,
        /* IDENTITY: is the object the program uploads the SAME one the setter writes? */
        sameObjectAsShared: f.m.userData.slyUniforms?.uTermHi === sh.uniforms?.uTermHi,
        matHasTermHi: !!f.m.userData.slyUniforms?.uTermHi,
        matTermHiValue: f.m.userData.slyUniforms?.uTermHi?.value ?? null,
        progUploadsTermHi: seqIds ? seqIds.includes('uTermHi') : null,
        progDeclaresTermHi: mapIds ? mapIds.includes('uTermHi') : null,
        uniformCount: seqIds ? seqIds.length : null,
      });
    }

    /* Now poke it and see what follows the write. */
    sh.setRampTuning({ hi: 0.95 });
    out.sharedAfter = sh.uniforms?.uTermHi?.value ?? null;
    out.matsAfter = found.map((f) => f.m.userData.slyUniforms?.uTermHi?.value ?? null);
    await G.step(3, 0);
    out.sharedAfterRender = sh.uniforms?.uTermHi?.value ?? null;
    out.matsAfterRender = found.map((f) => f.m.userData.slyUniforms?.uTermHi?.value ?? null);
    return out;
  });

  log(`shading present ${r.hasShading}  setRampTuning is a ${r.hasSetter}`);
  log(`shared uTermHi: before ${r.sharedBefore} -> after set ${r.sharedAfter} -> after render ${r.sharedAfterRender}`);
  log(`per-material uTermHi after set:    ${JSON.stringify(r.matsAfter)}`);
  log(`per-material uTermHi after render: ${JSON.stringify(r.matsAfterRender)}`);
  log('');
  log('material                    compiled sameObj hasTermHi value  progUploads progDeclares nUniforms');
  for (const m of r.mats) {
    log(`  ${m.name.padEnd(26)} ${String(m.compiled).padEnd(8)} ${String(m.sameObjectAsShared).padEnd(7)} `
      + `${String(m.matHasTermHi).padEnd(9)} ${String(m.matTermHiValue).padEnd(6)} `
      + `${String(m.progUploadsTermHi).padEnd(11)} ${String(m.progDeclaresTermHi).padEnd(12)} ${m.uniformCount}`);
  }
  await writeFile(`${OUT}/probe.json`, JSON.stringify(r, null, 2));
});
log('DONE');

/**
 * termprobe — why does `debugTerm(4)` not reach the shader?
 *
 * `rampread`'s calibration frame came back as an ordinary raw scene: the debugRaw BYPASS worked
 * (no ink, no grade, no bloom) but not one pixel carried mode 4's constants (0.25, 0.50, 0.75) ->
 * (64, 128, 191). toon.glsl.js's own comment says that makes every channel unquotable, so the
 * channel is broken and the ramp question cannot be answered until it is fixed.
 *
 * Four things could produce that, and reasoning cannot separate them — each has a plausible story
 * and I have already talked myself into two of them. So this asks the page:
 *
 *   H1 the setter writes a different object than the shader received
 *   H2 `own` shadows the shared uDebugTerm per material (Object.assign(shader, shared, own))
 *   H3 the splice missed, so TOON_SHADE — and the whole debug block — is not in the program
 *   H4 the uniform arrives but something resets it before the draw
 *
 * No capture, no lock contention beyond the boot. It reports facts, not a verdict.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = '/home/user/Demo/progress/records/termprobe';
const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);
await mkdir(OUT, { recursive: true });

await withGame({ width: 640, height: 360, quality: 'high', timeout: 20 * 60 * 1000 }, async ({ page, info }) => {
  log(`boot ok — warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  const r = await page.evaluate(async () => {
    const E = window.__ENGINE, G = window.__GAME;
    const sh = E.get('shading');
    const out = { patchWarned: !!sh._patchWarned, shared: null, mats: [] };

    sh.debugTerm(4);
    out.shared = sh.uniforms?.uDebugTerm?.value ?? null;
    out.sharedIsObj = !!sh.uniforms?.uDebugTerm;

    /* render once so any onBeforeCompile has definitely run */
    await G.step(2, 0);

    /* walk the scene for toon materials and ask what THEIR program holds */
    const seen = new Set();
    E.scene.traverse((o) => {
      if (!o.isMesh || out.mats.length >= 6) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m || seen.has(m.uuid)) continue;
        seen.add(m.uuid);
        const prog = m.program;
        const su = prog?.getUniforms?.();
        const names = su?.seq ? su.seq.map((x) => x.id) : null;
        out.mats.push({
          name: m.name || '(unnamed)',
          type: m.type,
          hasOnBeforeCompile: typeof m.onBeforeCompile === 'function',
          compiled: !!prog,
          /* does the compiled program actually declare uDebugTerm? H3's test */
          programHasUDebugTerm: names ? names.includes('uDebugTerm') : null,
          /* is the object the program will upload the SAME object the setter writes? H1/H2 */
          sameObjectAsShared: null,
          slyOutline: !!m.userData?.slyOutline,
        });
      }
    });

    /* H4: set, render, read back */
    sh.debugTerm(4);
    await G.step(1, 0);
    out.afterRender = sh.uniforms?.uDebugTerm?.value ?? null;

    /* does anything in update() clobber it? drive several frames */
    await G.step(10, 0);
    out.after10 = sh.uniforms?.uDebugTerm?.value ?? null;

    /* H3 directly: is the debug block text in the compiled fragment source? */
    const anyMat = [...seen].length;
    out.materialCount = anyMat;
    return out;
  });

  log(`patchWarned (splice missed at least once): ${r.patchWarned}`);
  log(`shared uDebugTerm after debugTerm(4): ${r.shared}   (object present: ${r.sharedIsObj})`);
  log(`value after 1 render: ${r.afterRender}   after 10 more: ${r.after10}`);
  log(`materials walked: ${r.materialCount}`);
  for (const m of r.mats) {
    log(`  ${String(m.name).slice(0, 28).padEnd(30)} ${m.type.padEnd(22)} compiled ${m.compiled}  programHasUDebugTerm ${m.programHasUDebugTerm}  outlineShell ${m.slyOutline}`);
  }
  await writeFile(`${OUT}/probe.json`, JSON.stringify(r, null, 2));
});
log('DONE');

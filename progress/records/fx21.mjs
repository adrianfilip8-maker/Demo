/**
 * fx21 — Arm A of PREREG-sandhigh.md: what `sandHigh` contributes where it is DOING ITS JOB.
 *
 * This is a baseline, not a treatment. Nothing is changed in `src/`; the only toggle is the
 * pool's visibility, exactly as `fx20` used it (and `fx20`'s `back` control was bit-identical
 * at 0 px, so the toggle is known not to perturb anything else).
 *
 * WHY THIS RUN EXISTS: §124.1's named fix and the obvious screen-size cap are both already
 * falsified offline on frames I hold (see the PREREG). What is NOT measurable from those frames
 * is the cost ceiling — `temple` is an interior, and `sandHigh` is an exterior haze field, so
 * `temple` cannot say what the field is worth when it is working. Without that number, any
 * "the disc is gone and the haze is intact" claim has an unmeasured half, and §124's `sandLow`
 * bracket is the standing example of what that costs (a cap that killed 97.8% of a field).
 *
 * Registered before the frames exist:
 *   - `dunes`, `hero`, `courtyard` are the exterior shots where a ground haze is motivated.
 *   - `temple` is re-captured as the SAME-BOOT anchor so the interior disc numbers and the
 *     exterior baselines are never compared across boots (§121.4 / §124.4).
 *   - `back` per shot is the control; if any `back` differs from its `base`, that shot's rows
 *     are void and reported as such, before any baseline number is quoted.
 *
 * Predictions, so this run can be wrong: the exterior shots show a LARGER total sandHigh
 * contribution than `temple` (it is their field), with a HIGHER scattered fraction (>10.1%) and
 * NO component near ΔL +17 — i.e. many small contributions rather than one loud one. If an
 * exterior shot also carries a ΔL>=8 component over a dark blue backdrop, the artefact is not
 * temple-specific and the PREREG's ARTEFACT/FIELD split needs rewriting before any fix.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const OUT = '/home/user/Demo/shots/fx21';
const W = 1280, H = 720;

const APPLY = `(cfg) => {
  const fx = window.__ENGINE.get('fx');
  const b = fx.batches.get('sandHigh');
  if (!b?.mesh) return '!! no sandHigh batch';
  b.mesh.visible = cfg.off !== true;
  return 'sandHigh.visible=' + b.mesh.visible + ' live=' + (b._used ?? -1) + '/' + (b.capacity ?? -1);
}`;

const PROBE = `() => {
  const E = window.__ENGINE, fx = E.get('fx');
  const cam = E.camera; cam.updateMatrixWorld(true);
  const out = { time: +E.time.toFixed(4), frame: E.frame,
    fov: +cam.fov.toFixed(2), aspect: +cam.aspect.toFixed(4),
    camPos: cam.getWorldPosition(new (window.__GAME.THREE.Vector3)()).toArray().map(v => +v.toFixed(2)),
    batches: {} };
  for (const [n, b] of fx.batches) out.batches[n] = { live: b._used ?? -1, vis: !!b.mesh?.visible };
  const A = E.get('lighting')?.atmosphere;
  if (A) out.tod = +A.tod.toFixed(3);
  return out;
}`;

const JOBS = [];
for (const shot of ['dunes', 'hero', 'courtyard', 'temple']) {
  JOBS.push([shot, 'base', {}]);
  JOBS.push([shot, 'no-sandHigh', { off: true }]);
  JOBS.push([shot, 'back', {}]);          // control, per shot
}

const srcHash = () => {
  try {
    return execSync("find /home/user/Demo/src -name '*.js' -exec cat {} + | md5sum | cut -c1-16", { encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
};
console.log(`src content hash BEFORE: ${srcHash()}`);

const res = await withGame({ width: W, height: H, quality: 'high', timeout: 3000000 }, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);
  await mkdir(OUT, { recursive: true });
  const acc = { warnings: info.warnings, jobs: {} };
  let last = null;
  for (const [shot, label, cfg] of JOBS) {
    const t0 = Date.now();
    const restage = last !== shot;
    const r = await page.evaluate(async ([n, c, applyBody, probeBody, doStage]) => {
      const G = window.__GAME, E = window.__ENGINE;
      if (doStage) await G.setShot(n);
      const applied = (0, eval)('(' + applyBody + ')')(c);
      for (let i = 0; i < 3; i++) E.renderFrame(0);
      return { applied, probe: (0, eval)('(' + probeBody + ')')(), dataUrl: G.capture('image/png') };
    }, [shot, cfg, APPLY, PROBE, restage]);
    last = shot;
    const file = path.join(OUT, `${shot}.${label}.png`);
    await writeFile(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    acc.jobs[`${shot}.${label}`] = { applied: r.applied, probe: r.probe };
    const p = r.probe;
    console.log(`\n--- ${shot} [${label}]  ${((Date.now() - t0) / 1000) | 0}s  t=${p.time} f=${p.frame} -> ${file}`);
    console.log(`    applied: ${r.applied}`);
    console.log(`    cam ${JSON.stringify(p.camPos)} fov ${p.fov} tod ${p.tod}  sandHigh live ${p.batches.sandHigh?.live}`);
  }
  return acc;
});
await writeFile(path.join(OUT, 'fx21.json'), JSON.stringify(res, null, 1));
console.log(`\nsrc content hash AFTER: ${srcHash()}`);
console.log('fx21 DONE — wrote ' + path.join(OUT, 'fx21.json'));

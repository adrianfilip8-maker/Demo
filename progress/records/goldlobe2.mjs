/**
 * goldlobe2 — the registered capture for PREREG-goldlobe2.md §6, chunk G2. SHADING owner.
 *
 * PRECONDITION (lever probe, fatal if absent): the §2 uGlintSharp scaffold — uGoldGlint /
 * uGlintPow / uGlintSharp, defaults 0.0 / 20 / 1.0 — is in the tree. The scaffold lands as
 * its own default-inert edit inside a held ticket BEFORE this runner boots (inert-by-gain:
 * the add is ×0.0 at shipped TUNE.goldGlint 0.0); it STAYS as a scaffold like its
 * predecessor — commit is the coordinator's.
 *
 * One boot, traversal + combat staged sequentially, arms per shot (seal §6):
 *   base       0.0 / 20 / 1.0   (boot values — defect present; G-0base gate)
 *   As         2.6 / 20 / 1.25  (bracket dose row)
 *   cand       2.6 / 20 / 1.5   (the candidate)
 *   KBwidelobe 5.2 /  2 / 1.0   (port-proven over-lobe: 33.2% of visible-face body rays
 *                                ≥ L160 vs the 20% B2' line — must read as its own failure;
 *                                a LOW read is P-F6' VOID + re-diagnose)
 *   null       0.0 / 20 / 1.0   (P-F2 scaffold-inertness + P-F4 restore in one arm:
 *                                must be 0 px vs base at ΣRGB ≥ 4)
 *
 * Readback per arm (§40): all three uniforms + TUNE mirrors. Frames + JSON INCREMENTALLY to
 * progress/records/goldlobe2/ (<shot>.<arm>.png flat). Scoring is offline per the seal §6
 * (matmask/gildlit/goldgap); this runner scores nothing. No git — the coordinator sweeps.
 * Idempotent resume: reruns skip if all frames exist.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/goldlobe2';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);
const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

const ARMS = [
  ['base', 0.0, 20, 1.0],
  ['As', 2.6, 20, 1.25],
  ['cand', 2.6, 20, 1.5],
  ['KBwidelobe', 5.2, 2, 1.0],
  ['null', 0.0, 20, 1.0],
];
const SHOTS = ['traversal', 'combat'];

const allDone = SHOTS.every((s) => ARMS.every(([a]) => existsSync(path.join(OUT, `${s}.${a}.png`))));
if (allDone) { log('all frames present — nothing to do (idempotent resume)'); process.exit(0); }

const report = {
  prereg: 'PREREG-goldlobe2.md', chunk: 'G2',
  startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), shots: [],
};
const save = () => writeFileSync(path.join(OUT, 'readback-G2.json'), JSON.stringify(report, null, 1));
save();
log(`chunk G2: srcTree ${report.srcTreeBefore} — booting (own lock hold)`);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 60 * 60 * 1000 }, async ({ page, info }) => {
  log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });

  const lever = await page.evaluate(() => {
    const sh = window.__ENGINE?.get?.('shading');
    return {
      hasGlint: !!sh?.uniforms?.uGoldGlint, hasPow: !!sh?.uniforms?.uGlintPow,
      hasSharp: !!sh?.uniforms?.uGlintSharp,
      glint: sh?.uniforms?.uGoldGlint?.value, pow: sh?.uniforms?.uGlintPow?.value,
      sharp: sh?.uniforms?.uGlintSharp?.value,
      tuneGlint: sh?.tune?.goldGlint, tunePow: sh?.tune?.glintPow, tuneSharp: sh?.tune?.glintSharp,
    };
  });
  report.lever = lever;
  log(`  LEVER ${JSON.stringify(lever)}`);
  save();
  if (!lever.hasGlint || !lever.hasPow || !lever.hasSharp) {
    log('  FATAL: uGlintSharp scaffold absent — the §2 pre-edit is not in this tree; chunk void, no captures');
    report.fatal = 'goldlobe2 scaffold absent'; save(); return;
  }
  if (lever.glint !== 0 || lever.sharp !== 1) log(`  WARNING: boot values glint ${lever.glint} / sharp ${lever.sharp} ≠ 0 / 1 — base gate will arbitrate`);

  for (const shot of SHOTS) {
    const sRec = { shot, arms: [] };
    report.shots.push(sRec);
    const t1 = Date.now();
    const staged = await page.evaluate(async (n) => {
      const r = await window.__GAME.setShot(n);
      return { stats: r?.stats, tod: window.__ENGINE.debug.timeOfDay };
    }, shot);
    sRec.setShot = staged;
    log(`  setShot(${shot}) ${((Date.now() - t1) / 1000).toFixed(0)}s  tod ${staged.tod}  draws ${staged.stats?.drawCalls} tris ${staged.stats?.triangles}`);
    save();

    /* Settle (banda2's protocol, carried): absorb program compiles + the one-off async
       settle BEFORE any scored frame — 10 frozen frames + a throwaway capture. */
    const t2 = Date.now();
    await page.evaluate(async () => {
      await window.__GAME.step(10, 0);
      window.__GAME.capture('image/png');
    });
    sRec.settleSecs = Math.round((Date.now() - t2) / 1000);
    log(`  settle(${shot}) ${sRec.settleSecs}s (10 frozen frames + throwaway capture)`);
    save();

    for (const [arm, gain, pow, sharp] of ARMS) {
      const ta = Date.now();
      const r = await page.evaluate(async ({ gain, pow, sharp }) => {
        const sh = window.__ENGINE.get('shading');
        if (sh.tune.goldGlint !== undefined) sh.tune.goldGlint = gain;
        if (sh.tune.glintPow !== undefined) sh.tune.glintPow = pow;
        if (sh.tune.glintSharp !== undefined) sh.tune.glintSharp = sharp;
        sh.uniforms.uGoldGlint.value = gain;
        sh.uniforms.uGlintPow.value = pow;
        sh.uniforms.uGlintSharp.value = sharp;
        await window.__GAME.step(1, 0);
        const dataUrl = window.__GAME.capture('image/png');
        return {
          readback: {
            glint: sh.uniforms.uGoldGlint.value, pow: sh.uniforms.uGlintPow.value,
            sharp: sh.uniforms.uGlintSharp.value,
            tuneGlint: sh.tune.goldGlint, tunePow: sh.tune.glintPow, tuneSharp: sh.tune.glintSharp,
          },
          dataUrl,
        };
      }, { gain, pow, sharp });
      const rb = r.readback;
      const mism = [];
      if (Math.abs(rb.glint - gain) > 1e-9) mism.push('glint');
      if (Math.abs(rb.pow - pow) > 1e-9) mism.push('pow');
      if (Math.abs(rb.sharp - sharp) > 1e-9) mism.push('sharp');
      writeFileSync(path.join(OUT, `${shot}.${arm}.png`), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      log(`  ${shot}.${arm.padEnd(11)} ${((Date.now() - ta) / 1000).toFixed(0)}s  glint ${rb.glint} pow ${rb.pow} sharp ${rb.sharp}  ${mism.length ? 'POKE MISMATCH ' + mism.join(',') : 'applied ok'}`);
      sRec.arms.push({ arm, requested: { gain, pow, sharp }, readback: rb, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
      save();
    }
  }

  report.srcTreeAfter = treeHash();
  report.finishedAt = new Date().toISOString();
  log(`  chunk G2 done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  save();
});
log('ALL DONE');

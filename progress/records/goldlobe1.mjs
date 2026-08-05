/**
 * goldlobe1 — the registered capture for PREREG-goldlobe.md §7, chunk E. SHADING owner.
 *
 * PRECONDITION (checked by the lever probe, fatal if absent): the §2 scaffold —
 * uGoldGlint/uGlintPow, default 0.0/20 — is in the tree. The scaffold lands as its own
 * default-inert edit inside this task's held ticket; commit is the coordinator's.
 *
 * One boot, traversal + combat staged sequentially, arms per shot (seal §7):
 *   base      glint 0.0 / pow 20   (boot values — the defect present; G-0base gate)
 *   Alo       glint 1.6 / pow 20   (dose row)
 *   cand      glint 2.6 / pow 20   (the candidate)
 *   KBchrome  glint 2.6 / pow 5    (over-lobed known-bad — must fail as its own failure)
 *   null      glint 0.0 / pow 20   (P-F2 scaffold-inertness + P-F4 restore in one arm:
 *                                   must be 0 px vs base at ΣRGB≥4)
 *
 * Readback per arm (§40), frames + JSON INCREMENTALLY to progress/records/goldlobe1/
 * (<shot>.<arm>.png flat). Scoring is offline (matmask/gildlit/goldgap per the seal §7);
 * this runner scores nothing. No git — the coordinator sweeps.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OUT = '/home/user/Demo/progress/records/goldlobe1';
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)} +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${s}`);
const treeHash = () => execSync(
  "cd /home/user/Demo && find src -name '*.js' | sort | xargs sha256sum | sha256sum | cut -c1-16",
  { encoding: 'utf8' },
).trim();

const ARMS = [
  ['base', 0.0, 20], ['Alo', 1.6, 20], ['cand', 2.6, 20], ['KBchrome', 2.6, 5], ['null', 0.0, 20],
];
const SHOTS = ['traversal', 'combat'];

const allDone = SHOTS.every((s) => ARMS.every(([a]) => existsSync(path.join(OUT, `${s}.${a}.png`))));
if (allDone) { log('all frames present — nothing to do (idempotent resume)'); process.exit(0); }

const report = {
  prereg: 'PREREG-goldlobe.md', chunk: 'E',
  startedAt: new Date().toISOString(), srcTreeBefore: treeHash(), shots: [],
};
const save = () => writeFileSync(path.join(OUT, 'readback-E.json'), JSON.stringify(report, null, 1));
save();
log(`chunk E: srcTree ${report.srcTreeBefore} — booting (own lock hold)`);

await withGame({ width: 1280, height: 720, quality: 'high', timeout: 30 * 60 * 1000 }, async ({ page, info }) => {
  log(`  boot ok — warnings ${info.warnings?.length ?? 0}`);
  page.on('console', (m) => { if (m.type() === 'error') log(`    page error: ${m.text().slice(0, 200)}`); });

  const lever = await page.evaluate(() => {
    const sh = window.__ENGINE?.get?.('shading');
    return {
      hasGlint: !!sh?.uniforms?.uGoldGlint, hasPow: !!sh?.uniforms?.uGlintPow,
      glint: sh?.uniforms?.uGoldGlint?.value, pow: sh?.uniforms?.uGlintPow?.value,
      tuneGlint: sh?.tune?.goldGlint, tunePow: sh?.tune?.glintPow,
    };
  });
  report.lever = lever;
  log(`  LEVER ${JSON.stringify(lever)}`);
  save();
  if (!lever.hasGlint || !lever.hasPow) {
    log('  FATAL: scaffold uniforms absent — the §2 scaffold is not in this tree; chunk void, no captures');
    report.fatal = 'scaffold absent'; save(); return;
  }
  if (lever.glint !== 0) log(`  WARNING: boot uGoldGlint ${lever.glint} ≠ 0 — scaffold not inert at boot; base gate will arbitrate`);

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

    for (const [arm, gain, pow] of ARMS) {
      const ta = Date.now();
      const r = await page.evaluate(async ({ gain, pow }) => {
        const sh = window.__ENGINE.get('shading');
        if (sh.tune.goldGlint !== undefined) sh.tune.goldGlint = gain;
        if (sh.tune.glintPow !== undefined) sh.tune.glintPow = pow;
        sh.uniforms.uGoldGlint.value = gain;
        sh.uniforms.uGlintPow.value = pow;
        await window.__GAME.step(1, 0);
        const dataUrl = window.__GAME.capture('image/png');
        return {
          readback: { glint: sh.uniforms.uGoldGlint.value, pow: sh.uniforms.uGlintPow.value },
          dataUrl,
        };
      }, { gain, pow });
      const mism = [];
      if (Math.abs(r.readback.glint - gain) > 1e-9) mism.push('glint');
      if (Math.abs(r.readback.pow - pow) > 1e-9) mism.push('pow');
      const file = path.join(OUT, `${shot}.${arm}.png`);
      writeFileSync(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      log(`  ${shot}.${arm.padEnd(9)} ${((Date.now() - ta) / 1000).toFixed(0)}s  uGoldGlint ${r.readback.glint} uGlintPow ${r.readback.pow}  ${mism.length ? 'POKE MISMATCH ' + mism.join(',') : 'applied ok'}`);
      sRec.arms.push({ arm, requested: { gain, pow }, readback: r.readback, mismatch: mism, secs: Math.round((Date.now() - ta) / 1000) });
      save();
    }
  }

  report.srcTreeAfter = treeHash();
  report.finishedAt = new Date().toISOString();
  log(`  chunk E done — srcTree after ${report.srcTreeAfter} (${report.srcTreeAfter === report.srcTreeBefore ? 'STABLE' : 'MOVED — flag in RESULT'})`);
  save();
});
log('ALL DONE');

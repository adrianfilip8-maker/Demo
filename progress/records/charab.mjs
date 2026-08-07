/**
 * charab.mjs — capture the character A/B: incumbent vs the Sly 3 rebuild.
 *
 *   node charab.mjs base      # SlyModel.js   (no ?char= param)
 *   node charab.mjs model3    # SlyModel3.js  (?char=model3)
 *
 * ONE MODEL PER BOOT, because the selector is read at module-load time — there is no in-page
 * poke that swaps a model, which is why this passes a URL param rather than mutating a uniform.
 *
 * §195 IS OBEYED HERE, and it is the reason this file exists rather than reusing `grab()`.
 * `grab()` stages via `setShot`, which runs `step(14)` + `step(3)` at the DEFAULT LIVE dt, so
 * every arm renders at a different animation phase and later arms are systematically different
 * from earlier ones. That confound voided staging2 twice. This runner stages once, then settles
 * and captures with `step(n, 0)` — dt = 0, world clock frozen — which is the documented remedy
 * (§28) and is what makes litwarm's arms byte-identical.
 *
 * The two arms are separate boots, so §193's cross-boot floor applies to any pixel comparison
 * between them. That is fine and expected: this capture is for LOOKING at, and for the critic's
 * blind side-by-side. It registers no pixel band, and no verdict here rests on a differing-pixel
 * count between arms.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ARM = (process.argv[2] || 'base').trim();
if (!['base', 'model3'].includes(ARM)) {
  console.error(`unknown arm "${ARM}" (base|model3)`);
  process.exit(2);
}
const OUT = '/home/user/Demo/progress/records/charab';
const SHOTS = ['sly-closeup', 'sly-profile', 'sly-perch', 'traversal'];

const t0 = Date.now();
const log = (s) => process.stdout.write(`[${((Date.now() - t0) / 1000) | 0}s] ${s}\n`);

log(`arm "${ARM}" — ${ARM === 'model3' ? 'SlyModel3.js (?char=model3)' : 'SlyModel.js (incumbent)'}`);

await mkdir(OUT, { recursive: true });

const report = { arm: ARM, at: new Date().toISOString(), shots: {} };

await withGame({
  width: 1280, height: 720, quality: 'high', timeout: 40 * 60 * 1000,
  query: ARM === 'model3' ? 'char=model3' : '',
}, async ({ page, info }) => {
  log(`boot ok — renderer ${info.renderer}; warnings ${info.warnings?.length ?? 0}`);
  for (const w of info.warnings || []) log(`   ! ${w}`);

  /* Which model actually loaded? Asked, not assumed — a silently-ignored URL param would
     otherwise produce two identical arms and a very confident null (§194's failure shape). */
  const who = await page.evaluate(() => {
    const c = window.__ENGINE?.get?.('character');
    return {
      ctor: c?.constructor?.name ?? null,
      rootName: c?.root?.name ?? null,
      meshName: c?.mesh?.name ?? null,
      bones: c?.bones ? Object.keys(c.bones).length : 0,
      verts: c?.mesh?.geometry?.attributes?.position?.count ?? 0,
      height: c?.root?.userData?.height ?? null,
    };
  });
  report.identity = who;
  log(`identity: root="${who.rootName}" mesh="${who.meshName}" bones=${who.bones} verts=${who.verts}`);
  const isRebuild = who.rootName === 'sly3';
  if ((ARM === 'model3') !== isRebuild) {
    log(`!! ARM MISMATCH — arm "${ARM}" but root name is "${who.rootName}". The URL param did not take.`);
    report.armMismatch = true;
  }

  for (const shot of SHOTS) {
    const s0 = Date.now();
    const r = await page.evaluate(async (name) => {
      const G = window.__GAME;
      /* C-F3 (§195): setShot's INTERNAL seventeen settle frames ran at live dt, so every arm was
         captured at a different idle-animation phase — the pose lottery that voided FINAL r1.
         dt: 0 freezes the staging path itself; both arms now capture the same canonical pose. */
      const staged = await G.setShot(name, { dt: 0 });
      /* §28/§195: freeze the world clock for the settle AND the capture, so this frame does not
         depend on how long the boot or the previous shot happened to take. */
      await G.step(12, 0);
      G.capture('image/png');           // throwaway: flush SwiftShader
      await G.step(1, 0);
      return { dataUrl: G.capture('image/png'), stats: staged?.stats ?? null, subject: staged?.subject ?? null };
    }, shot);
    const file = path.join(OUT, `${shot}.${ARM}.png`);
    await writeFile(file, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    report.shots[shot] = { secs: Math.round((Date.now() - s0) / 1000), stats: r.stats, subject: r.subject };
    log(`  ${shot}  ${report.shots[shot].secs}s -> ${path.basename(file)}`);
  }
});

await writeFile(path.join(OUT, `charab-${ARM}.json`), JSON.stringify(report, null, 1));
log(`DONE arm=${ARM}${report.armMismatch ? '  !! ARM MISMATCH' : ''}`);

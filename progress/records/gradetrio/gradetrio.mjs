/**
 * gradetrio.mjs — the SHARED one-boot poke runner for the r11 grade/exposure family's
 * remaining three seals (RESULT-critic11 queue item 1, items b/c/d):
 *
 *   PREREG-tombdim     (b) interior ambient hierarchy — debug.tombAmb pokes
 *   PREREG-goldenrake  (c) hero 22° raking key       — shading.uniforms.uRakeTrack pokes
 *   PREREG-nightfloor  (d) §2.2 night shadow floor   — debug.shadowFloorNight pokes
 *
 * One boot, HEAD tree, NO install: all three mechanisms ship inert in HEAD (gates untaken
 * at their defaults, pinned by tests/tombdim.test.mjs, tests/goldenrake.test.mjs,
 * tests/nightfloor.test.mjs), so there is nothing to install and nothing to restore — the
 * fxghost/fxink/seamglint shared-runner shape (693681d) on the redkey no-install chassis.
 * The three seals register, score and ship INDEPENDENTLY; each scorer consumes only the
 * rows its PREREG names, and the per-shot off/back bracket (R bars) is shared by citation.
 *
 *   node progress/records/gradetrio/gradetrio.mjs
 *
 * Per canonical shot (all 16, roster order): stage once ({dt:0}, step(3,0), renderFrame(0),
 * NOT captured), then arms — each arm assigns ALL THREE levers (restore-first, the
 * fxartifact ARM shape), settles step(2,0) + renderFrame(0), captures + readbacks:
 *
 *   off   tombAmb 1.0   rakeTrack 0.0   shadowFloorNight 0.125
 *   bon   tombAmb 0.30  (others default)         [+ bko 0.15, interior only]
 *   con   rakeTrack 1.0 (others default)         [+ cko 0.5, hero only]
 *   don   shadowFloorNight 0.14 (others default) [+ dko 0.18, night only]
 *   back  all defaults — diff(off, back) brackets EVERY intervening poke of the shot
 *
 * {dt:0} everywhere, no retries, no resume (PF7). 83 frames.
 *
 * PF6 launch pins: src/ clean; HEAD ToonMaterial.js carries the three inert defaults and
 * both debug override spellings; HEAD toon.glsl.js carries the untaken uRakeTrack branch;
 * roster exact. PF5: killed mid-boot ⇒ nothing installed, nothing to restore; archive the
 * out-dir and relaunch.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/gradetrio1');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
/* Lever tuple defaults + candidate/dose values (the three PREREGs' §candidate). */
const DEF = { tomb: 1.0, rake: 0.0, nfloor: 0.125 };
const B_ON = 0.30, B_KO = 0.15, C_ON = 1.0, C_KO = 0.5, D_ON = 0.14, D_KO = 0.18;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins ────────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6 ABORT: src/ dirty at launch:\n${dirt}`);
  const tm = gitRaw('show', 'HEAD:src/render/ToonMaterial.js');
  for (const [re, what] of [
    [/tombAmb:\s*1\.0\b/, 'inert tombAmb: 1.0'],
    [/shadowFloorNight:\s*0\.125\b/, 'inert shadowFloorNight: 0.125'],
    [/rakeTrack:\s*0\.0\b/, 'inert rakeTrack: 0.0'],
    [/debug\?\.tombAmb/, 'debug.tombAmb override'],
    [/debug\?\.shadowFloorNight/, 'debug.shadowFloorNight override'],
  ]) if (!re.test(tm)) die(`PF6 ABORT: HEAD ToonMaterial.js lacks ${what} — either a ship write landed (a seal is stale) or the mechanism commit is missing`);
  const gl = gitRaw('show', 'HEAD:src/render/shaders/toon.glsl.js');
  if (!/uRakeTrack > 0\.0/.test(gl) || !/uniform float uRakeTrack;/.test(gl))
    die('PF6 ABORT: HEAD toon.glsl.js lacks the uRakeTrack branch — goldenrake has no lever');
}

/* Expected src hash: git archive HEAD (never the working tree). */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `gradetrio-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')} verified (three inert mechanisms present); expected src hash ${EXPECT_HEAD}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes. Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const manifest = {
  seal: 'PREREG-tombdim + PREREG-goldenrake + PREREG-nightfloor (shared runner)',
  head: git('rev-parse', 'HEAD'),
  expect: { head: EXPECT_HEAD },
  values: { B_ON, B_KO, C_ON, C_KO, D_ON, D_KO, DEF },
  launchedAt: new Date().toISOString(), pid: process.pid,
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

/* ---- page-side functions ------------------------------------------------------------------ */

const STAGE_ONLY = async (name) => {
  const eng = window.__ENGINE;
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name };
};

/* fxartifact's ARM shape: every arm assigns ALL THREE levers, so poke and restore are the
   same code path and the `back` arm is the `off` assignment repeated. debug.* levers are
   read per publish by setKeyLight (recompute-on-arrival, exact by construction);
   uRakeTrack is a shared uniform nothing republishes, so the assignment sticks (the
   uShadowHold contract). */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  eng.debug.tombAmb = cfg.tomb;
  eng.debug.shadowFloorNight = cfg.nfloor;
  sh.uniforms.uRakeTrack.value = cfg.rake;
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const kc = sh?.uniforms?.uKeyColor?.value || null;
  const sc = sh?.uniforms?.uShadowColor?.value || null;
  const scl = sh?.uniforms?.uShadowColorLit?.value || null;
  return {
    png: c.toDataURL('image/png'),
    readback: {
      tombAmb: eng.debug?.tombAmb ?? null,
      shadowFloorNight: eng.debug?.shadowFloorNight ?? null,
      uRakeTrack: sh?.uniforms?.uRakeTrack ? sh.uniforms.uRakeTrack.value : null,
      uRakeGap: sh?.uniforms?.uRakeGap ? sh.uniforms.uRakeGap.value : null,
      tuneTomb: sh?.tune?.tombAmb ?? null,
      tuneNfloor: sh?.tune?.shadowFloorNight ?? null,
      tuneRake: sh?.tune?.rakeTrack ?? null,
      uAmbIntensity: sh?.uniforms?.uAmbIntensity ? sh.uniforms.uAmbIntensity.value : null,
      uShadowColor: sc ? { r: sc.r, g: sc.g, b: sc.b } : null,
      uShadowColorLit: scl ? { r: scl.r, g: scl.g, b: scl.b } : null,
      uKeyColor: kc ? { r: kc.r, g: kc.g, b: kc.b } : null,
      uKeyIntensity: sh?.uniforms?.uKeyIntensity ? sh.uniforms.uKeyIntensity.value : null,
      uLocalToon: sh?.uniforms?.uLocalToon ? sh.uniforms.uLocalToon.value : null,
      nightAmount: sh?._nightAmount ?? null,
      tombF: sh?._tombF ?? null,
      camY: eng.camera?.position?.y ?? null,
      timeOfDay: eng.debug?.timeOfDay ?? null,
    },
  };
};

/* ---- the one boot -------------------------------------------------------------------------- */

function saveFrame(shot, arm, got, ordinal) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  /* per-capture tree stamp (§296: a multi-arm run stamps the tree PER CAPTURE) */
  const t = treeState();
  manifest.rows.push({
    shot, arm, file,
    sha256: createHash('sha256').update(buf).digest('hex'),
    tree: { src: t.src, head: t.head },
    readback: got.readback,
    ordinal, at: new Date().toISOString(),
  });
  saveManifest();
  const rb = got.readback;
  console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(22)} sha ${manifest.rows.at(-1).sha256.slice(0, 16)}  tomb=${rb.tombAmb} rake=${rb.uRakeTrack} nfloor=${rb.shadowFloorNight} amb=${rb.uAmbIntensity?.toFixed?.(4)} scB=${rb.uShadowColor?.b?.toFixed?.(5)} camY=${rb.camY?.toFixed?.(2)} na=${rb.nightAmount}`);
}

const onLocked = async () => {
  const dirtNow = git('status', '--porcelain', '--', 'src/');
  if (dirtNow) {
    console.log(`ABORT — src/ dirty at lock grant (foreign residue; §186 — NOT ours, do not restore):\n${dirtNow}`);
    throw new Error('src dirty at lock grant');
  }
  const tree = treeState();
  if (tree.src !== EXPECT_HEAD) {
    console.log(`ABORT — working src hash ${tree.src} != git-archive HEAD ${EXPECT_HEAD}`);
    throw new Error('tree verification failed at lock grant');
  }
  console.log(`HEAD tree verified under the lock — src ${tree.src} (no install; the three mechanisms are inert in HEAD)`);
};
const onReleasing = async () => {
  const dirt = git('status', '--porcelain', '--', 'src/');
  console.log(dirt
    ? `!! src/ dirty at release — NOT this runner's doing (it installs nothing): report, do not touch:\n${dirt}`
    : 'src/ clean at release (nothing was installed).');
};

console.log(`frames -> ${OUT}`);
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    const roster = [...info.shots].sort();
    if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
      throw new Error(`roster drift: page has [${info.shots}]`);
    }
    /* All 16 shots stage under the same published lever values (uniform staging
       disclosure, torchlight3 §6): the defaults, set explicitly before the first staging. */
    await page.evaluate((d) => {
      const eng = window.__ENGINE;
      eng.debug.tombAmb = d.tomb;
      eng.debug.shadowFloorNight = d.nfloor;
      eng.get('shading').uniforms.uRakeTrack.value = d.rake;
    }, DEF);
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      await page.evaluate(STAGE_ONLY, shot);
      console.log(`-- staged ${shot} (${++n}/16, ${((Date.now() - t0) / 1000) | 0}s)`);
      const arms = [['off', { ...DEF }], ['bon', { ...DEF, tomb: B_ON }]];
      if (shot === 'interior') arms.push(['bko', { ...DEF, tomb: B_KO }]);
      arms.push(['con', { ...DEF, rake: C_ON }]);
      if (shot === 'hero') arms.push(['cko', { ...DEF, rake: C_KO }]);
      arms.push(['don', { ...DEF, nfloor: D_ON }]);
      if (shot === 'night') arms.push(['dko', { ...DEF, nfloor: D_KO }]);
      arms.push(['back', { ...DEF }]);
      for (const [arm, cfg] of arms) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal);
      }
    }
    /* clear the levers to their published/null state */
    await page.evaluate(() => {
      const eng = window.__ENGINE;
      eng.debug.tombAmb = null;
      eng.debug.shadowFloorNight = null;
      eng.get('shading').uniforms.uRakeTrack.value = 0.0;
    });
  });
console.log('DONE. Score with:');
console.log('  node progress/records/gradetrio/tombdim-score.mjs');
console.log('  node progress/records/gradetrio/goldenrake-score.mjs');
console.log('  node progress/records/gradetrio/nightfloor-score.mjs');

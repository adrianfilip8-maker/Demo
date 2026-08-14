/**
 * tombdim2.mjs — the one-boot poke runner for PREREG-tombdim2: the PAIRED interior seal.
 *
 *   node progress/records/tombdim2/tombdim2.mjs        (launch it detached via tools/launch.sh)
 *
 * The parent seal (PREREG-tombdim, RESULT-gradetrio, §307) moved ONE knob — the ambient
 * family — and the tomb's torch pools rode it down (POOL 95.0 -> 75.7 L, SARC 72.2 -> 50.7).
 * This runner moves the ambient DOWN and the pool term UP in the same arm, so the arms are
 * PAIRS. Both levers already exist in HEAD and both are live per-publish debug overrides:
 *
 *   eng.debug.tombAmb    ToonMaterial TUNE.tombAmb   (1.0 = gate untaken; camera-height scoped)
 *   eng.debug.localToon  Lighting     TUNE.localToon (2.5 SHIPPED, §303; underground-gated in
 *                                                     toon.glsl.js — above-ground emitters x0)
 *
 * so there is NOTHING to install and NOTHING to restore: HEAD is the tree, the arms are pokes,
 * and both are recomputed from the live camera/TUNE on every _publishKeyLight (Lighting.js
 * :2062 -> ToonMaterial.setKeyLight), which makes poke and restore exact by construction.
 * No src/ byte moves for this capture (§296 exposure: none).
 *
 * Per shot: stage once ({dt:0}, step(3,0), renderFrame(0), NOT captured), then arms — each arm
 * assigns BOTH levers (restore-first, the fxartifact/gradetrio ARM shape), settles
 * step(2,0) + renderFrame(0), captures + readbacks. `back` repeats `off`, so diff(off, back)
 * brackets every intervening poke of that shot (§302: [0,0] bars are legitimate ONLY
 * same-boot).
 *
 *   interior (7):  off  (1.00, 2.5)   amb  (0.30, 2.5)   pool (1.00, 6.0)
 *                  p30  (0.30, 6.0)   p45  (0.45, 4.0)   p30hi(0.30, 8.0)   back (1.00, 2.5)
 *   15 above (3):  off  (1.00, 2.5)   xtr  (0.30, 8.0)   back (1.00, 2.5)
 *
 * `xtr` is the MOST EXTREME pair: above ground the tombAmb weight is exactly 0 (factor exactly
 * 1) and every fire is above the shader's y < -0.5 gate (exactly x0.0), so if the extreme pair
 * is 0 px every milder pair is too, by the same arithmetic — and VB proves the pokes really
 * reached the uniforms on those shots rather than being silently dropped.
 *
 * 15*3 + 7 = 52 frames. {dt:0} everywhere, no retries, no resume (PF7).
 *
 * PF6 launch pins: HEAD ToonMaterial.js carries `tombAmb: 1.0` + `debug?.tombAmb`; HEAD
 * Lighting.js carries `localToon: 2.5` + `debug?.localToon`; HEAD toon.glsl.js carries the
 * underground gate and the 1.6 cap; roster == the 16 canonicals; and — at LOCK GRANT, not at
 * enqueue — src/ clean and hashing to the launch-derived `git archive HEAD`. PF5: killed
 * mid-boot => nothing installed, nothing to restore; archive the out-dir and relaunch.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/tombdim21');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
/* the registered arm table (seal §5) — {tomb, local} pairs */
const DEF = { tomb: 1.0, local: 2.5 };
const ARMS_INTERIOR = [
  ['off',   { tomb: 1.00, local: 2.5 }],
  ['amb',   { tomb: 0.30, local: 2.5 }],
  ['pool',  { tomb: 1.00, local: 6.0 }],
  ['p30',   { tomb: 0.30, local: 6.0 }],
  ['p45',   { tomb: 0.45, local: 4.0 }],
  ['p30hi', { tomb: 0.30, local: 8.0 }],
  ['back',  { tomb: 1.00, local: 2.5 }],
];
const ARMS_ABOVE = [
  ['off',  { tomb: 1.00, local: 2.5 }],
  ['xtr',  { tomb: 0.30, local: 8.0 }],
  ['back', { tomb: 1.00, local: 2.5 }],
];
const EXPECT_ROWS = 15 * ARMS_ABOVE.length + ARMS_INTERIOR.length;   // 52

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins ──────────────────────────────────────────────────────────────────────
   Two classes, and the distinction is load-bearing on a tree six lanes share:
   - HEAD pins (below) are read with `git show HEAD:` and are FATAL at launch: they are what
     says this seal is not stale.
   - WORKING-TREE cleanliness is NOT fatal at launch, because at enqueue time another lane may
     legitimately hold the lock with its CAND files installed (it restores them before it
     releases). Demanding a clean tree at enqueue would make a queued runner abort on someone
     else's correct behaviour. It is instead FATAL at LOCK GRANT (`onLocked`), where the tree
     is the thing this capture actually renders, together with the stronger check that the
     working src hash equals the launch-derived `git archive HEAD` hash. */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) console.log(`NOTE: src/ dirty at launch (another lane's install — §186: NOT ours, do not touch). The lock-grant check is the binding one:\n${dirt}`);
  const tm = gitRaw('show', 'HEAD:src/render/ToonMaterial.js');
  for (const [re, what] of [
    [/tombAmb:\s*1\.0\b/, 'inert tombAmb: 1.0 (a flipped default means a ship write landed and this seal is stale)'],
    [/debug\?\.tombAmb/, 'the debug.tombAmb override'],
  ]) if (!re.test(tm)) die(`PF6 ABORT: HEAD ToonMaterial.js lacks ${what}`);
  const li = gitRaw('show', 'HEAD:src/render/Lighting.js');
  for (const [re, what] of [
    [/localToon:\s*2\.5\b/, 'the SHIPPED localToon: 2.5 (§303) — the off arm is defined as that value'],
    [/debug\?\.localToon/, 'the debug.localToon override'],
  ]) if (!re.test(li)) die(`PF6 ABORT: HEAD Lighting.js lacks ${what}`);
  const gl = gitRaw('show', 'HEAD:src/render/shaders/toon.glsl.js');
  if (!/uLocalToon > 0\.0/.test(gl) || !/slyLocalY < -0\.5/.test(gl) || !/SLY_LOCAL_CAP = 1\.6/.test(gl))
    die('PF6 ABORT: HEAD toon.glsl.js lacks §303’s local term, its underground gate or its 1.6 cap');
}

/* Expected src hash: git archive HEAD (never the working tree). */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `tombdim2-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')} verified (both levers present and at their registered off values); expected src hash ${EXPECT_HEAD}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes. Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const manifest = {
  seal: 'PREREG-tombdim2 (paired ambient-dim x pool-raise; interior only)',
  head: git('rev-parse', 'HEAD'),
  expect: { head: EXPECT_HEAD, rows: EXPECT_ROWS },
  arms: { interior: ARMS_INTERIOR, above: ARMS_ABOVE },
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

/* Every arm assigns BOTH levers, so poke and restore are one code path and `back` is the `off`
   assignment repeated. Both debug keys are read per publish (Lighting._publishKeyLight ->
   Shading.setKeyLight), so the assignment cannot go stale and the restore is exact. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  eng.debug.tombAmb = cfg.tomb;
  eng.debug.localToon = cfg.local;
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
      localToon: eng.debug?.localToon ?? null,
      tuneTomb: sh?.tune?.tombAmb ?? null,
      uAmbIntensity: sh?.uniforms?.uAmbIntensity ? sh.uniforms.uAmbIntensity.value : null,
      uLocalToon: sh?.uniforms?.uLocalToon ? sh.uniforms.uLocalToon.value : null,
      uShadowColor: sc ? { r: sc.r, g: sc.g, b: sc.b } : null,
      uShadowColorLit: scl ? { r: scl.r, g: scl.g, b: scl.b } : null,
      uKeyColor: kc ? { r: kc.r, g: kc.g, b: kc.b } : null,
      uKeyIntensity: sh?.uniforms?.uKeyIntensity ? sh.uniforms.uKeyIntensity.value : null,
      uRakeTrack: sh?.uniforms?.uRakeTrack ? sh.uniforms.uRakeTrack.value : null,
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
  console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${manifest.rows.at(-1).sha256.slice(0, 16)}  tomb=${rb.tombAmb} local=${rb.localToon} tombF=${rb.tombF} amb=${rb.uAmbIntensity?.toFixed?.(5)} uLT=${rb.uLocalToon} scB=${rb.uShadowColor?.b?.toFixed?.(5)} camY=${rb.camY?.toFixed?.(2)}`);
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
  console.log(`HEAD tree verified under the lock — src ${tree.src} (no install; both levers are debug pokes)`);
};
const onReleasing = async () => {
  const dirt = git('status', '--porcelain', '--', 'src/');
  console.log(dirt
    ? `!! src/ dirty at release — NOT this runner's doing (it installs nothing): report, do not touch:\n${dirt}`
    : 'src/ clean at release (nothing was installed).');
};

console.log(`frames -> ${OUT} (${EXPECT_ROWS} expected)`);
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    const roster = [...info.shots].sort();
    if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
      throw new Error(`roster drift: page has [${info.shots}]`);
    }
    /* All 16 shots stage under the same published lever values (uniform staging disclosure,
       torchlight3 §6): the defaults, set explicitly before the first staging. */
    await page.evaluate((d) => {
      const eng = window.__ENGINE;
      eng.debug.tombAmb = d.tomb;
      eng.debug.localToon = d.local;
    }, DEF);
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      await page.evaluate(STAGE_ONLY, shot);
      console.log(`-- staged ${shot} (${++n}/16, ${((Date.now() - t0) / 1000) | 0}s)`);
      for (const [arm, cfg] of (shot === 'interior' ? ARMS_INTERIOR : ARMS_ABOVE)) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal);
      }
    }
    /* clear the levers back to their published/null state */
    await page.evaluate(() => {
      const eng = window.__ENGINE;
      eng.debug.tombAmb = null;
      eng.debug.localToon = null;
    });
  });
console.log('DONE. Score with:');
console.log('  node progress/records/tombdim2/tombdim2-score.mjs');

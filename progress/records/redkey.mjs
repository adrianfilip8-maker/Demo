/**
 * PREREG-redkey §5 — the one-boot poke capture runner. Forked from torchlight3.mjs with the
 * install machinery REMOVED: the mechanism ships inert in HEAD (TUNE.keySatMax 1.0,
 * branch-untaken, pinned by tests/redkey.test.mjs), so there is nothing to install and
 * nothing to restore — the arms are debug.keySatMax pokes, the lever class both prior poke
 * seals proved exact (§302 twelve-for-twelve, §303 42-for-42).
 *
 *   node progress/records/redkey.mjs
 *
 * Per canonical shot (all 16, roster order): stage once ({dt:0}, step(3,0), renderFrame(0),
 * NOT captured), then poke 1.0 -> `off`, poke 0.45 -> `on`, [sly-arm only: poke 0.35 ->
 * `ko`], poke 1.0 -> `back`. {dt:0} everywhere, no retries, no resume (PF7).
 *
 * PF6 launch pins: src/ clean, HEAD ToonMaterial carries the inert default, roster exact.
 * PF5: if killed mid-boot there is nothing to restore; archive the out-dir and relaunch.
 */
import { withGame } from '../../tools/harness.mjs';
import { treeState, srcHash } from '../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'progress/records/redkey');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
const OFF_V = 1.0, ON_V = 0.45, KO_V = 0.35;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins ────────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6 ABORT: src/ dirty at launch:\n${dirt}`);
  const tm = gitRaw('show', 'HEAD:src/render/ToonMaterial.js');
  if (!/keySatMax:\s*1\.0\b/.test(tm))
    die('PF6 ABORT: HEAD ToonMaterial.js does not carry the inert keySatMax: 1.0 — either the ship write already landed (this seal is stale) or the mechanism commit is missing');
  if (!/debug\?\.keySatMax/.test(tm))
    die('PF6 ABORT: HEAD ToonMaterial.js lacks the debug.keySatMax override — the arms have no lever');
}

/* Expected src hash: git archive HEAD (never the working tree). */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `redkey-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')} verified (inert mechanism present); expected src hash ${EXPECT_HEAD}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes. Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const manifest = {
  seal: 'PREREG-redkey', head: git('rev-parse', 'HEAD'),
  expect: { head: EXPECT_HEAD }, values: { off: OFF_V, on: ON_V, ko: KO_V },
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

/* torchlight3's POKE body, lever renamed: poke debug.keySatMax, settle at dt 0, capture +
   readback. The uniform-arrival clamp recomputes from the incoming colour every publish, so
   poke and restore are exact by construction (tests/redkey.test.mjs pins it). */
const POKE = async (v) => {
  const eng = window.__ENGINE;
  eng.debug.keySatMax = v;
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const sh = eng.get('shading');
  const kc = sh?.uniforms?.uKeyColor?.value || null;
  const mx = kc ? Math.max(kc.r, kc.g, kc.b) : 0, mn = kc ? Math.min(kc.r, kc.g, kc.b) : 0;
  return {
    png: c.toDataURL('image/png'),
    readback: {
      keySatMax: eng.debug?.keySatMax ?? null,
      tuneKeySatMax: sh?.tune?.keySatMax ?? null,
      uKeyColor: kc ? { r: kc.r, g: kc.g, b: kc.b } : null,
      sat: mx > 1e-9 ? (mx - mn) / mx : 0,
      uKeyIntensity: sh?.uniforms?.uKeyIntensity ? sh.uniforms.uKeyIntensity.value : null,
    },
  };
};

/* ---- the one boot -------------------------------------------------------------------------- */

function saveFrame(shot, arm, got, tree, ordinal) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  manifest.rows.push({
    shot, arm, file,
    sha256: createHash('sha256').update(buf).digest('hex'),
    tree, readback: got.readback,
    ordinal, at: new Date().toISOString(),
  });
  saveManifest();
  console.log(`  #${String(ordinal).padStart(2)} ${shot}.${arm}  sha ${manifest.rows.at(-1).sha256.slice(0, 16)}  sat=${got.readback.sat.toFixed(4)} keySatMax=${got.readback.keySatMax}`);
}

let tree = null;
const onLocked = async () => {
  const dirtNow = git('status', '--porcelain', '--', 'src/');
  if (dirtNow) {
    console.log(`ABORT — src/ dirty at lock grant (foreign residue; §186 — NOT ours, do not restore):\n${dirtNow}`);
    throw new Error('src dirty at lock grant');
  }
  tree = treeState();
  if (tree.src !== EXPECT_HEAD) {
    console.log(`ABORT — working src hash ${tree.src} != git-archive HEAD ${EXPECT_HEAD}`);
    throw new Error('tree verification failed at lock grant');
  }
  console.log(`HEAD tree verified under the lock — src ${tree.src} (no install; the mechanism is inert in HEAD)`);
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
    /* All 16 shots stage under the same published value (§5 disclosure). */
    await page.evaluate((v) => { window.__ENGINE.debug.keySatMax = v; }, OFF_V);
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      await page.evaluate(STAGE_ONLY, shot);
      console.log(`-- staged ${shot} (${++n}/16, ${((Date.now() - t0) / 1000) | 0}s)`);
      const arms = shot === 'sly-arm'
        ? [['off', OFF_V], ['on', ON_V], ['ko', KO_V], ['back', OFF_V]]
        : [['off', OFF_V], ['on', ON_V], ['back', OFF_V]];
      for (const [arm, v] of arms) {
        const got = await page.evaluate(POKE, v);
        saveFrame(shot, arm, got, tree, ++ordinal);
      }
    }
    await page.evaluate(() => { window.__ENGINE.debug.keySatMax = null; });
  });
console.log('DONE. Score with: node progress/records/redkey-score.mjs');

/**
 * PREREG-torchlight3 §6 — the one-boot capture runner. Forked from torchlight2.mjs; every
 * §186/§296/PF6/PF7 guard is v2's machinery verbatim. What changed is the boot structure:
 *
 *   node progress/records/torchlight3.mjs <BASE_SHA> <CAND_SHA>
 *
 * ONE boot, CAND tree only (RESULT-torchlight2 disposition: cross-boot [0,0] is unachievable
 * on this renderer — §302 — so no base boot, no warm-up, no cross-boot bar). BASE_SHA stays
 * in argv as the premise's referent: the PF6 checks that BASE is the pre-term tree and that
 * BASE..CAND is exactly the three registered files all carry.
 *
 * Per canonical shot (all 16, roster order): stage once ({dt:0}, step(3,0), renderFrame(0),
 * NOT captured), then arms in-boot via the debug.localToon lever (R1-proven exact in both
 * prior runs): poke 0.0 -> `off`, poke 2.5 -> `on`, [interior only: poke 6.0 -> `ko`],
 * poke 0.0 -> `back`. The poke/settle/capture body is v2's POKE verbatim (the
 * c10postfx2/twilight per-shot poke/back pattern). {dt:0} everywhere, no retries.
 *
 * Install machinery kept from v2: CAND installed once under the lock (src clean at lock
 * grant, bytes from `git show` raw, srcHash verified BEFORE vite spawns, abort restores the
 * checkout); onReleasing restores HEAD and now sha-verifies the restore too.
 * PF7: fresh out-dir progress/records/torchlight3/; if it exists non-empty this runner
 * ABORTS and the operator archives it (mv torchlight3 torchlight3-void-runN). No resume.
 *
 * If this process is killed mid-boot (PF5): `git status` shows the three files modified;
 * restore with `git checkout HEAD -- src/render/Lighting.js src/render/ToonMaterial.js
 * src/render/shaders/toon.glsl.js` and archive the out-dir before relaunching.
 */
import { withGame } from '../../tools/harness.mjs';
import { treeState, srcHash } from '../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'progress/records/torchlight3');
const FILES = [
  'src/render/Lighting.js',
  'src/render/ToonMaterial.js',
  'src/render/shaders/toon.glsl.js',
];
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];

/* PREREG-torchlight3 §3 pins (= v2's §3 pins; same candidate bytes, third seal). */
const PIN_BASE = '926f0eeab5dec9f5224352cf17b40f30a4d4bded';
const PIN_CAND = 'f4056f4364af67cdddfae67e152062dbc9ee2f47';
const PIN_CAND_SRC = 'f9a77726b2a5ece0';
const PIN_CARRIER_DELTA = ['src/render/Lighting.js', 'src/render/PostFX.js'];

const [BASE, CAND] = [process.argv[2], process.argv[3]];
if (!BASE || !CAND) { console.error('usage: node torchlight3.mjs <BASE_SHA> <CAND_SHA>'); process.exit(2); }

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
/* Raw bytes, NO trim (v1's run-1 lesson: .trim() ate trailing newlines and no tree matched). */
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: every tree precondition, before anything exists on disk (v2 verbatim) ──────────── */
if (git('rev-parse', BASE) !== PIN_BASE) die(`PF6 VOID: BASE ${BASE} != registered ${PIN_BASE}`);
if (git('rev-parse', CAND) !== PIN_CAND) die(`PF6 VOID: CAND ${CAND} != registered ${PIN_CAND}`);
if (git('rev-parse', `${CAND}^`) !== PIN_BASE) die('PF6 VOID: CAND^ is not BASE');
{
  const touched = git('diff', '--name-only', `${BASE}..${CAND}`, '--', 'src/').split('\n').filter(Boolean).sort();
  if (JSON.stringify(touched) !== JSON.stringify([...FILES].sort()))
    die(`PF6 VOID: BASE..CAND touches under src/:\n  ${touched.join('\n  ')}\nexpected exactly the three registered files`);
  const carrier = git('diff', '--name-only', `${CAND}..HEAD`, '--', 'src/').split('\n').filter(Boolean).sort();
  if (JSON.stringify(carrier) !== JSON.stringify([...PIN_CARRIER_DELTA].sort()))
    die(`PF6 VOID: CAND..HEAD src delta is [${carrier}], expected exactly [${PIN_CARRIER_DELTA}] — another lane landed src between seal and launch; re-derive the seal's §3 before re-launching`);
  if (!/localToon:\s*2\.5\b/.test(gitRaw('show', `${CAND}:src/render/Lighting.js`)))
    die('PF6 VOID: CAND Lighting.js does not carry localToon: 2.5');
  if (/localToon/.test(gitRaw('show', `${BASE}:src/render/Lighting.js`)))
    die('PF6 VOID: BASE Lighting.js already knows localToon — not the pre-term tree');
  if (!/localToon:\s*0\.0\b/.test(gitRaw('show', 'HEAD:src/render/Lighting.js')))
    die('PF6 VOID: HEAD Lighting.js is not at the registered fallback 0.0 — §3 is stale');
}
const candContent = new Map(FILES.map((f) => [f, gitRaw('show', `${CAND}:${f}`)]));

/* Expected hashes: install = `git archive HEAD` (never the working tree) + the three files at
   CAND; restore = `git archive HEAD` untouched. Both verified live (§3: install AND restore
   are sha-verified). */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `torchlight3-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive ${PIN_CAND} src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const candArchive = srcHash(path.join(_tmp, 'src'));
if (candArchive !== PIN_CAND_SRC)
  die(`PF6 VOID: CAND archive src hash ${candArchive} != registered ${PIN_CAND_SRC}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
for (const f of FILES) writeFileSync(path.join(_tmp, f), candContent.get(f));
const EXPECT_CAND = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`BASE ${BASE.slice(0, 7)} / CAND ${CAND.slice(0, 7)} verified: candidate diff is exactly the three registered files; CAND src ${PIN_CAND_SRC}.`);
console.log(`expected src hashes: install (cand) ${EXPECT_CAND}  restore (head) ${EXPECT_HEAD}`);

/* ── PF7: one run = one session — a used out-dir is an operator decision, not a resume ──── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes (RESULT-torchlight D1: a\nmanifest resume converts same-tree bars into cross-session bars). Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const dirt0 = git('status', '--porcelain', '--', 'src/');
if (dirt0) console.log(`note: src/ dirty at LAUNCH (another lane's under-lock arm?) — proceeding; the boot re-checks at its lock grant:\n${dirt0}`);

const manifest = {
  seal: 'PREREG-torchlight3', base: BASE, cand: CAND,
  head: git('rev-parse', 'HEAD'), files: FILES,
  expect: { cand: EXPECT_CAND, head: EXPECT_HEAD },
  launchedAt: new Date().toISOString(), pid: process.pid,
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

/* ---- page-side functions ----------------------------------------------------------------- */

/* Stage only — §251 frozen clock; the staged frame is NOT captured (PREREG-torchlight3 §6:
   every scored arm follows an explicit poke). */
const STAGE_ONLY = async (name) => {
  const eng = window.__ENGINE;
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name };
};

/* v2's POKE verbatim: poke the lever, settle at dt 0, capture + readback. */
const POKE = async (v) => {
  const eng = window.__ENGINE;
  eng.debug.localToon = v;
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const sh = eng.get('shading'), lt = eng.get('lighting');
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uLocalToon: sh?.uniforms?.uLocalToon ? sh.uniforms.uLocalToon.value : null,
      debugLocalToon: eng.debug?.localToon ?? null,
      tuneLocalToon: lt?.TUNE?.localToon ?? null,
      slots: (lt?._pool || []).filter((s) => s.light.visible).map((s) => ({
        x: +s.light.position.x.toFixed(2), y: +s.light.position.y.toFixed(3),
        z: +s.light.position.z.toFixed(2), i: +s.light.intensity.toFixed(3),
      })),
    },
  };
};

/* ---- the one boot ------------------------------------------------------------------------ */

function saveFrame(bootLabel, shot, arm, got, tree, ordinal) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  manifest.rows.push({
    shot, arm, file,
    sha256: createHash('sha256').update(buf).digest('hex'),
    tree, readback: got.readback,
    boot: bootLabel, ordinal, at: new Date().toISOString(),
  });
  saveManifest();
  console.log(`  #${String(ordinal).padStart(2)} ${shot}.${arm}  sha ${manifest.rows.at(-1).sha256.slice(0, 16)}  slots=${got.readback.slots.length} uLocalToon=${got.readback.uLocalToon}`);
}

const LABEL = 'boot 1 (cand, 16 shots x poke arms)';
let tree = null;
let installed = false;
const onLocked = async () => {
  const dirtNow = git('status', '--porcelain', '--', 'src/');
  if (dirtNow) {
    console.log(`${LABEL}: ABORT — src/ dirty at lock grant (foreign residue):\n${dirtNow}`);
    throw new Error('src dirty at lock grant');
  }
  for (const f of FILES) writeFileSync(path.join(ROOT, f), candContent.get(f));
  installed = true;
  tree = treeState();
  if (tree.src !== EXPECT_CAND) {
    execFileSync('git', ['checkout', 'HEAD', '--', ...FILES], { cwd: ROOT });
    console.log(`${LABEL}: ABORT — src hash ${tree.src} != expected ${EXPECT_CAND} after install`);
    throw new Error('tree verification failed at lock grant');
  }
  console.log(`${LABEL}: CAND arm installed & verified under the lock — src ${tree.src}`);
};
const onReleasing = async () => {
  if (!installed) return;
  execFileSync('git', ['checkout', 'HEAD', '--', ...FILES], { cwd: ROOT });
  const back = treeState().src;
  console.log(`${LABEL}: HEAD restored before lock release — src ${back} ${back === EXPECT_HEAD
    ? '== expected OK'
    : `!! MISMATCH (expected ${EXPECT_HEAD}) — PF5 recovery: git checkout HEAD -- ${FILES.join(' ')}`}`);
};

console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')}; frames -> ${OUT}`);
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    const roster = [...info.shots].sort();
    if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
      throw new Error(`roster drift: page has [${info.shots}]`);
    }
    /* All 16 shots stage under the same published value (§6 disclosure): the lever is set to
       0.0 before the first staging and cleared after the last shot. */
    await page.evaluate(() => { window.__ENGINE.debug.localToon = 0.0; });
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      await page.evaluate(STAGE_ONLY, shot);
      console.log(`-- staged ${shot} (${++n}/16, ${((Date.now() - t0) / 1000) | 0}s)`);
      const arms = shot === 'interior'
        ? [['off', 0.0], ['on', 2.5], ['ko', 6.0], ['back', 0.0]]
        : [['off', 0.0], ['on', 2.5], ['back', 0.0]];
      for (const [arm, v] of arms) {
        const got = await page.evaluate(POKE, v);
        saveFrame(LABEL, shot, arm, got, tree, ++ordinal);
      }
    }
    await page.evaluate(() => { window.__ENGINE.debug.localToon = null; });
  });
console.log('DONE. Score with: node progress/records/torchlight3-score.mjs');

/**
 * PREREG-torchlight2 §6 — the capture runner. Forked from torchlight.mjs (run 4) with the
 * three registered instrument fixes; everything not named below is v1's machinery verbatim.
 *
 *   node progress/records/torchlight2.mjs <BASE_SHA> <CAND_SHA>
 *
 * FIX 1 — candidate-tree independence: the cand arm comes from CAND_SHA by `git show`, never
 *   from HEAD (HEAD now carries the registered fallback localToon 0.0 and must not leak into
 *   any arm). Both boots install under the lock: A/A2 write the three files at BASE, B writes
 *   them at CAND, onReleasing restores HEAD after every boot. argv is pinned to the seal's
 *   registered shas and CAND's archive hash — a wrong operator argv aborts before any boot.
 * FIX 2 — one run = one session: fresh out-dir progress/records/torchlight2/; if it exists
 *   non-empty this runner ABORTS (PF7) and the operator archives it (e.g. `mv torchlight2
 *   torchlight2-void-runN`). There is NO manifest resume; a relaunch re-runs every boot.
 * FIX 3 lives in the seal/scorer (slot table, F-bars); this file only adds the readback and
 *   attribution columns (per-capture ordinal + timestamp) the scorer and PF4 diagnosis read.
 * Plus a WARM-UP boot 0 (captures nothing): run 4's odd boot was the cold one; A/A2/B run warm.
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
const OUT = path.join(ROOT, 'progress/records/torchlight2');
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

/* PREREG-torchlight2 §3 pins. A different candidate is a different prereg — edit consciously. */
const PIN_BASE = '926f0eeab5dec9f5224352cf17b40f30a4d4bded';
const PIN_CAND = 'f4056f4364af67cdddfae67e152062dbc9ee2f47';
const PIN_CAND_SRC = 'f9a77726b2a5ece0';
const PIN_CARRIER_DELTA = ['src/render/Lighting.js', 'src/render/PostFX.js'];

const [BASE, CAND] = [process.argv[2], process.argv[3]];
if (!BASE || !CAND) { console.error('usage: node torchlight2.mjs <BASE_SHA> <CAND_SHA>'); process.exit(2); }

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
/* Raw bytes, NO trim (v1's run-1 lesson: .trim() ate trailing newlines and no tree matched). */
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6-v2: every tree precondition, before anything exists on disk ─────────────────────── */
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
const baseContent = new Map(FILES.map((f) => [f, gitRaw('show', `${BASE}:${f}`)]));
const candContent = new Map(FILES.map((f) => [f, gitRaw('show', `${CAND}:${f}`)]));

/* Expected per-boot src hashes: carrier = `git archive HEAD` (never the working tree), three
   files swapped from refs — v1's amended machinery, §296's "one locked boot is not one tree". */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `torchlight2-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive ${PIN_CAND} src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const candArchive = srcHash(path.join(_tmp, 'src'));
if (candArchive !== PIN_CAND_SRC)
  die(`PF6 VOID: CAND archive src hash ${candArchive} != registered ${PIN_CAND_SRC}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
for (const f of FILES) writeFileSync(path.join(_tmp, f), candContent.get(f));
const EXPECT_CAND = srcHash(path.join(_tmp, 'src'));
for (const f of FILES) writeFileSync(path.join(_tmp, f), baseContent.get(f));
const EXPECT_BASE = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`BASE ${BASE.slice(0, 7)} / CAND ${CAND.slice(0, 7)} verified: candidate diff is exactly the three registered files; CAND src ${PIN_CAND_SRC}.`);
console.log(`expected src hashes: base ${EXPECT_BASE}  cand ${EXPECT_CAND}`);

/* ── PF7: one run = one session — a used out-dir is an operator decision, not a resume ──── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes (RESULT-torchlight D1: a\nmanifest resume converts same-tree bars into cross-session bars). Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const dirt0 = git('status', '--porcelain', '--', 'src/');
if (dirt0) console.log(`note: src/ dirty at LAUNCH (another lane's under-lock arm?) — proceeding; every boot re-checks at its own lock grant:\n${dirt0}`);

const manifest = {
  seal: 'PREREG-torchlight2', base: BASE, cand: CAND,
  head: git('rev-parse', 'HEAD'), files: FILES,
  expect: { base: EXPECT_BASE, cand: EXPECT_CAND },
  launchedAt: new Date().toISOString(), pid: process.pid,
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

/* ---- page-side functions (v1 verbatim: §251 frozen clock, slots readback) --------------- */

const STAGE = async (name) => {
  const eng = window.__ENGINE;
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
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

/* ---- boots ------------------------------------------------------------------------------ */

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

async function boot(label, { install, shots, arm, interiorArms }) {
  let tree = null;
  /* onLocked VERIFIES the tree it just built and aborts BEFORE vite spawns on any mismatch;
     it restores the checkout itself on that path (outside withGame's try/finally — v1's
     amendment, carried). Warm-up passes install=null and installs/verifies nothing beyond
     src-clean. */
  const onLocked = async () => {
    const dirtNow = git('status', '--porcelain', '--', 'src/');
    if (dirtNow) {
      console.log(`${label}: ABORT — src/ dirty at lock grant (foreign residue):\n${dirtNow}`);
      throw new Error('src dirty at lock grant');
    }
    if (!install) { tree = treeState(); console.log(`${label}: HEAD tree as-is — src ${tree.src}`); return; }
    for (const f of FILES) writeFileSync(path.join(ROOT, f), install.content.get(f));
    tree = treeState();
    if (tree.src !== install.expect) {
      execFileSync('git', ['checkout', 'HEAD', '--', ...FILES], { cwd: ROOT });
      console.log(`${label}: ABORT — src hash ${tree.src} != expected ${install.expect} after install`);
      throw new Error('tree verification failed at lock grant');
    }
    console.log(`${label}: ${install.name} arm installed & verified under the lock — src ${tree.src}`);
  };
  const onReleasing = install ? async () => {
    execFileSync('git', ['checkout', 'HEAD', '--', ...FILES], { cwd: ROOT });
    console.log(`${label}: HEAD restored before lock release — src ${treeState().src}`);
  } : null;

  await withGame(
    { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
    async ({ page, info }) => {
      const roster = [...info.shots].sort();
      if (JSON.stringify(roster) !== JSON.stringify([...ROSTER].sort())) {
        throw new Error(`roster drift: page has [${info.shots}]`);
      }
      if (!shots.length) { console.log(`${label}: booted, nothing to capture (warm-up)`); return; }
      let ordinal = 0;
      for (const shot of ROSTER) {
        if (!shots.includes(shot)) continue;
        const got = await page.evaluate(STAGE, shot);
        saveFrame(label, shot, arm, got, tree, ++ordinal);
        if (interiorArms && shot === 'interior') {
          for (const [a, v] of [['null0', 0], ['kbover', 6.0], ['restore', 2.5]]) {
            const g = await page.evaluate(POKE, v);
            saveFrame(label, 'interior', a, g, tree, ++ordinal);
          }
          await page.evaluate(() => { window.__ENGINE.debug.localToon = null; });
        }
      }
    });
}

console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')}; frames -> ${OUT}`);
const armBase = { name: 'BASE', content: baseContent, expect: EXPECT_BASE };
const armCand = { name: 'CAND', content: candContent, expect: EXPECT_CAND };
await boot('boot 0  (warm-up, no frames)', { install: null, shots: [], arm: null });
await boot('boot A  (base, 16 shots)', { install: armBase, shots: ROSTER, arm: 'base' });
await boot('boot A2 (base, D1 control)', { install: armBase, shots: ['interior', 'hero'], arm: 'base2' });
await boot('boot B  (candidate, 16 shots + interior pokes)', { install: armCand, shots: ROSTER, arm: 'cand', interiorArms: true });
console.log('DONE. Score with: node progress/records/torchlight2-score.mjs');

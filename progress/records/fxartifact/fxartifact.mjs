/**
 * PREREG-fxghost / PREREG-fxink / PREREG-seamglint — the shared one-boot poke runner.
 *
 *   bash tools/launch.sh progress/records/fxartifact/fxartifact.mjs \
 *        progress/records/logs/fxartifact-run1.log /tmp/sands-of-ra/fxartifact1.pid
 *
 * ONE boot, torchlight3's per-shot poke pattern (§302/§303: on this renderer a [0,0] pixel
 * bar is legitimate ONLY same-boot; no cross-boot bar exists in any of the three seals).
 * Eleven shots, staged once each ({dt:0}; `combat` LAST via the §275.1 rewind + dt 1/60
 * recipe, because the swing band is a particle-age phenomenon and a dt-0 staging ages it 0).
 * Per staged shot: `off` (all levers base) -> per-seal poke arms -> `back` (all levers
 * base). diff(off, back) brackets every intervening poke of that shot (PF4 fail-closed).
 *
 * Levers (all live, §40 readbacks per arm):
 *   A  fx.batches.get('sandHigh').material.uniforms.uLitMix.value   (sticky; base 0.52)
 *      + sandHigh mesh.visible for the `ahide` reference arm
 *   B  postfx.tune.fxInkCut (composite re-reads per frame; base 0)  — REQUIRES the installed
 *      candidate: PostFX.cand.js is written to src/render/PostFX.js ONLY inside this
 *      runner's lock window (§186) and restored before release, both sides sha-verified.
 *      + fx.root.visible for the `bfx0` footprint arm
 *   C  shading.uniforms.uRimShadowFloorArch.value (sticky; base 0.55)
 *      + postfx.tune.rimShadowFloor for the report-only `s10` decomposition arm (base 0.45)
 *
 * Every arm application is RESTORE-FIRST (c10postfx pattern): all levers are reset to base,
 * then the arm's single change is applied — so no arm can inherit a stale lever.
 *
 * PF5 (killed mid-boot): `git status` shows src/render/PostFX.js modified;
 *   git checkout HEAD -- src/render/PostFX.js
 * then archive the out-dir and relaunch. PF7: fresh out-dir, never resumes.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/fxartifact1');
const CAND = path.join(ROOT, 'progress/records/fxartifact/PostFX.cand.js');
const FILE = 'src/render/PostFX.js';

/* §3 pins (all three seals). A foreign PostFX.js landing between seal and launch is a PF6
   abort — re-derive the candidate (mkcand anchors) before relaunching. */
const PIN_BASE_SHA256 = '35f7d36fcaff06a8412cc4734dcf3d07823282aaf86d1fe2c38de457a8ed8b49';
const PIN_CAND_SHA256 = '1bb7d7be7e3453a82360187fa09cbd103d3d102e15e474ec9efd88116ebffc43';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const die = (m) => { console.error(m); process.exit(2); };

/* ── PF6: tree preconditions, before anything exists on disk ─────────────────────────────── */
const candBytes = readFileSync(CAND);
if (sha256(candBytes) !== PIN_CAND_SHA256) die(`PF6 VOID: PostFX.cand.js sha ${sha256(candBytes)} != pinned ${PIN_CAND_SHA256}`);
{
  const headFile = execFileSync('git', ['show', `HEAD:${FILE}`], { cwd: ROOT });
  if (sha256(headFile) !== PIN_BASE_SHA256)
    die(`PF6 VOID: HEAD:${FILE} sha ${sha256(headFile)} != pinned ${PIN_BASE_SHA256} — a foreign PostFX landed between seal and launch; re-derive the candidate.`);
}

/* Expected whole-src hashes for install and restore, from `git archive HEAD` (never the
   working tree) — torchlight3 §3 machinery, one swapped file. */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `fxartifact-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const EXPECT_HEAD = srcHash(path.join(_tmp, 'src'));
writeFileSync(path.join(_tmp, FILE), candBytes);
const EXPECT_CAND = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`pins OK. expected src hashes: install ${EXPECT_CAND}  restore ${EXPECT_HEAD}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} non-empty. Archive it (mv fxartifact1 fxartifact1-void-runN) and relaunch. No resume.`);
mkdirSync(OUT, { recursive: true });

/* ── the matrix ──────────────────────────────────────────────────────────────────────────── */
const A_SHOTS = new Set(['temple', 'night', 'interior', 'sly-profile', 'dunes', 'hero', 'courtyard']);
const C_SHOTS = new Set(['dunes', 'night', 'guard', 'hero', 'courtyard', 'sly-closeup']);
const S_SHOTS = new Set(['dunes', 'night']);           // report-only screen-floor decomposition
const ROSTER = ['hero', 'temple', 'sly-closeup', 'courtyard', 'dunes', 'interior', 'night',
  'traversal', 'guard', 'sly-profile', 'combat'];       // combat LAST (its staging rewinds time)

const armsFor = (shot) => {
  const arms = [['off', {}]];
  if (A_SHOTS.has(shot)) arms.push(['ahide', { aHide: 1 }], ['a26', { aLit: 0.26 }], ['a13', { aLit: 0.13 }], ['a00', { aLit: 0.0 }]);
  arms.push(['bfx0', { bFxOff: 1 }], ['bon', { bCut: 1.0 }]);
  if (C_SHOTS.has(shot)) arms.push(['c20', { cFloor: 0.20 }], ['c10', { cFloor: 0.10 }]);
  if (S_SHOTS.has(shot)) arms.push(['s10', { sFloor: 0.10 }]);
  arms.push(['back', {}]);
  return arms;
};

const manifest = {
  seals: ['PREREG-fxghost', 'PREREG-fxink', 'PREREG-seamglint'],
  head: git('rev-parse', 'HEAD'),
  pins: { base: PIN_BASE_SHA256, cand: PIN_CAND_SHA256 },
  expect: { cand: EXPECT_CAND, head: EXPECT_HEAD },
  launchedAt: new Date().toISOString(), pid: process.pid,
  rows: [],
};
const saveManifest = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
saveManifest();

/* ── page-side ───────────────────────────────────────────────────────────────────────────── */

const STAGE = async (name) => {
  const eng = window.__ENGINE;
  if (name === 'combat') {
    /* §275/§275.1: the swing band is particle-age; dt 0 stages age 0 = alpha 0. Rewind to one
       absolute timeline, stage at dt 1/60 (t lands at 0.2833 — the fxdraw/fxshape recipe). */
    eng.time = 0;
    await window.__GAME.setShot('combat', { dt: 1 / 60 });
    eng.renderFrame(0);
    return { staged: name, t: eng.time };
  }
  await window.__GAME.setShot(name, { dt: 0 });
  await window.__GAME.step(3, 0);
  eng.renderFrame(0);
  return { staged: name, t: eng.time };
};

/* Restore-first, then one change; settle {dt:0}; capture; read back every lever (§40). */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const fx = eng.get('fx'), pf = eng.get('postfx'), sh = eng.get('shading');
  const sand = fx.batches.get('sandHigh');
  /* base state, unconditionally */
  sand.material.uniforms.uLitMix.value = 0.52;
  if (sand.mesh) sand.mesh.visible = true;
  fx.root.visible = true;
  pf.tune.fxInkCut = 0;
  sh.uniforms.uRimShadowFloorArch.value = 0.55;
  pf.tune.rimShadowFloor = 0.45;
  /* the arm's single change */
  if (cfg.aLit !== undefined) sand.material.uniforms.uLitMix.value = cfg.aLit;
  if (cfg.aHide) sand.mesh.visible = false;
  if (cfg.bCut !== undefined) pf.tune.fxInkCut = cfg.bCut;
  if (cfg.bFxOff) fx.root.visible = false;
  if (cfg.cFloor !== undefined) sh.uniforms.uRimShadowFloorArch.value = cfg.cFloor;
  if (cfg.sFloor !== undefined) pf.tune.rimShadowFloor = cfg.sFloor;
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uLitMix: sand.material.uniforms.uLitMix.value,
      sandVis: !!sand.mesh?.visible,
      sandLive: sand._used ?? -1,
      fxRootVis: !!fx.root.visible,
      uFxInkCut: pf.compositeMat?.uniforms?.uFxInkCut ? pf.compositeMat.uniforms.uFxInkCut.value : 'ABSENT',
      uRimShadowFloorArch: sh.uniforms.uRimShadowFloorArch.value,
      uRimShadowFloor: pf.compositeMat?.uniforms?.uRimShadowFloor ? pf.compositeMat.uniforms.uRimShadowFloor.value : 'ABSENT',
      t: eng.time,
    },
  };
};

/* ── install/restore under the lock (§186) ───────────────────────────────────────────────── */
let installed = false;
let tree0 = null;
const onLocked = async () => {
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) { console.log(`ABORT — src/ dirty at lock grant (foreign residue):\n${dirt}`); throw new Error('src dirty at lock grant'); }
  const headNow = execFileSync('git', ['show', `HEAD:${FILE}`], { cwd: ROOT });
  if (sha256(headNow) !== PIN_BASE_SHA256) { console.log(`ABORT — HEAD:${FILE} moved between launch and lock grant`); throw new Error('PostFX pin failed at lock grant'); }
  writeFileSync(path.join(ROOT, FILE), candBytes);
  installed = true;
  tree0 = treeState();
  if (tree0.src !== EXPECT_CAND) {
    execFileSync('git', ['checkout', 'HEAD', '--', FILE], { cwd: ROOT });
    console.log(`ABORT — src hash ${tree0.src} != expected ${EXPECT_CAND} after install`);
    throw new Error('tree verification failed at lock grant');
  }
  console.log(`candidate installed & verified under the lock — src ${tree0.src}`);
};
const onReleasing = async () => {
  if (!installed) return;
  execFileSync('git', ['checkout', 'HEAD', '--', FILE], { cwd: ROOT });
  const back = treeState().src;
  console.log(`HEAD restored before lock release — src ${back} ${back === EXPECT_HEAD
    ? '== expected OK'
    : `!! MISMATCH (expected ${EXPECT_HEAD}) — PF5 recovery: git checkout HEAD -- ${FILE}`}`);
};

function saveFrame(shot, arm, got, ordinal) {
  const buf = Buffer.from(got.png.split(',')[1], 'base64');
  const file = `${shot}.${arm}.png`;
  writeFileSync(path.join(OUT, file), buf);
  /* per-capture tree stamp (§296: a multi-arm run stamps the tree PER CAPTURE) */
  const t = treeState();
  manifest.rows.push({
    shot, arm, file, sha256: sha256(buf),
    tree: { src: t.src, head: t.head },
    readback: got.readback, ordinal, at: new Date().toISOString(),
  });
  saveManifest();
  console.log(`  #${String(ordinal).padStart(2)} ${shot}.${arm}  sha ${manifest.rows.at(-1).sha256.slice(0, 16)}  lit=${got.readback.uLitMix} cut=${got.readback.uFxInkCut} floor=${got.readback.uRimShadowFloorArch} sfloor=${got.readback.uRimShadowFloor} sandVis=${got.readback.sandVis} fxVis=${got.readback.fxRootVis}`);
}

console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')}; frames -> ${OUT}`);
await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);
    for (const s of ROSTER) if (!info.shots.includes(s)) throw new Error(`roster drift: page lacks shot '${s}' (has [${info.shots}])`);
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      const st = await page.evaluate(STAGE, shot);
      console.log(`-- staged ${shot} (${++n}/${ROSTER.length}, ${((Date.now() - t0) / 1000) | 0}s, t=${st.t})`);
      for (const [arm, cfg] of armsFor(shot)) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal);
      }
    }
  });
console.log('DONE. Score with:');
console.log('  node progress/records/fxartifact/fxghost-score.mjs');
console.log('  node progress/records/fxartifact/fxink-score.mjs');
console.log('  node progress/records/fxartifact/seamglint-score.mjs');

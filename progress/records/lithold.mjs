/**
 * lithold.mjs — the one-boot poke runner for PREREG-lithold.md (critic r11/r12's
 * "the character is bleached to grey-white; the iconic blue is gone from the frame's own
 * hero" — traversal + combat; §277's saturation half, §289's lit-side mirror).
 *
 *   node progress/records/lithold.mjs
 *
 * ONE boot, HEAD tree, NO install. The mechanism ships INERT in HEAD (TUNE.subjLitHold 0.0,
 * the TOON_SHADE branch untaken, pinned by tests/lithold.test.mjs), so there is nothing to
 * install and nothing to restore — the gradetrio/redkey no-install chassis on the
 * torchlight3 one-boot poke pattern (§302: a [0,0] pixel bar is legitimate ONLY same-boot).
 *
 * Per canonical shot (all 16, roster order): stage once ({dt:0}, step(3,0), renderFrame(0),
 * NOT captured), then, while the shot stays staged:
 *
 *   off    uSubjLitHold 0.0            the branch untaken
 *   on     uSubjLitHold 0.70           the candidate
 *   ko     uSubjLitHold 0.40           dose arm — traversal and combat only
 *   back   uSubjLitHold 0.0            diff(off, back) brackets every intervening poke
 *
 * and on the six PROT-ENV shots (traversal, combat, temple, dunes, night, interior) three
 * more, AFTER back so no debug state can reach a scored arm:
 *
 *   cal    postfx.debugRaw('scene') + shading.calibrate('term')   must read (64,128,191)
 *   msk    shading.debugTerm(1)      R = vSlySkin — the exact subject mask
 *   bk2    debug off, hold 0.0       diff(off, bk2) == 0 proves the debug state restored
 *
 * 16x3 + 2 + 6x3 = 68 frames. {dt:0} everywhere, no retries, no resume (PF7).
 *
 * PF6 launch pins: src/ clean; HEAD ToonMaterial.js carries subjLitHold: 0.0, the shared
 * uniform, and §289's subjShadowHold still at 1.0; HEAD toon.glsl.js carries the declared
 * uniform and the untaken branch; roster exact. PF5: killed mid-boot => nothing installed,
 * nothing to restore; archive the out-dir and relaunch.
 */
import { withGame } from '../../tools/harness.mjs';
import { treeState, srcHash } from '../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'progress/records/lithold1');
const ROSTER = [
  'hero', 'kaykit', 'temple', 'sly-closeup', 'sly-startle', 'sly-perch', 'sly-arm',
  'courtyard', 'dunes', 'interior', 'night', 'traversal', 'combat', 'guard',
  'sly-profile', 'sly-key',
];
const ON = 0.70, KO = 0.40, OFF = 0.0;
const DOSE = ['traversal', 'combat'];
const MASKED = ['traversal', 'combat', 'temple', 'dunes', 'night', 'interior'];
const EXPECT_ROWS = ROSTER.length * 3 + DOSE.length + MASKED.length * 3;   // 68

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitRaw = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const die = (msg) => { console.error(msg); process.exit(2); };

/* Six lanes share this tree today, so "src/ is clean" is not a condition this runner can
   demand of the whole subtree without simply never running (§186 is about not EDITING under
   another run's lock, not about refusing to measure beside one). The gates are therefore
   precise instead of blanket, and they are strictest exactly where this measurement lives:
   - at LAUNCH: THIS seal's two files must be byte-identical to HEAD; foreign dirt anywhere
     in src/ is recorded, loudly, and is not fatal;
   - at LOCK GRANT: src/render/ and src/player/ — the shading and character chains every
     number in this seal comes out of — must carry NO dirt at all, mine or anyone's, or the
     run aborts BEFORE booting so the queue wait is the only thing spent;
   - throughout: every row stamps the tree, and V4 requires one hash across all 68. */
const OWNED = ['src/render/ToonMaterial.js', 'src/render/shaders/toon.glsl.js'];
const CRITICAL = ['src/render', 'src/player'];

/* ── PF6: launch pins ────────────────────────────────────────────────────────────────────── */
{
  const mine = git('status', '--porcelain', '--', ...OWNED);
  if (mine) die(`PF6 ABORT: this seal's own src files are dirty at launch — the mechanism must be COMMITTED before the capture:\n${mine}`);
  const foreign = git('status', '--porcelain', '--', 'src/');
  if (foreign) console.log(`PF6 NOTE — foreign src/ dirt at launch (NOT this lane's; recorded, not touched):\n${foreign}`);
  const tm = gitRaw('show', 'HEAD:src/render/ToonMaterial.js');
  for (const [re, what] of [
    [/subjLitHold:\s*0\.0\b/, 'the inert default subjLitHold: 0.0'],
    [/uSubjLitHold:\s*\{\s*value:\s*TUNE\.subjLitHold\s*\}/, 'the shared uSubjLitHold uniform'],
    [/subjShadowHold:\s*1\.0\b/, "§289's shipped subjShadowHold 1.0 (the shadow side must not have moved)"],
  ]) if (!re.test(tm)) die(`PF6 ABORT: HEAD ToonMaterial.js lacks ${what} — either a ship write landed (this seal is stale) or the mechanism commit is missing`);
  const gl = gitRaw('show', 'HEAD:src/render/shaders/toon.glsl.js');
  if (!/uniform float uSubjLitHold;/.test(gl) || !/if \( uSubjLitHold > 0\.0 \) \{/.test(gl))
    die('PF6 ABORT: HEAD toon.glsl.js lacks the uSubjLitHold branch — this seal has no lever');
  if (!/float hold\s+= clamp\( max\( uShadowHold, uSubjShadowHold \* vSlySkin \)/.test(gl))
    die("PF6 ABORT: HEAD toon.glsl.js no longer carries §289's shadow-side hold where it shipped");
}

/* HEAD's own src hash, from git archive rather than the working tree — reported so the
   RESULT can say whether the captured tree was HEAD exactly or HEAD plus recorded foreign
   dirt outside the critical chains. */
const _tmp = path.join(process.env.TMPDIR || '/tmp', `lithold-expected-${process.pid}`);
rmSync(_tmp, { recursive: true, force: true });
mkdirSync(_tmp, { recursive: true });
execFileSync('bash', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(_tmp)}`], { cwd: ROOT });
const HEAD_SRC = srcHash(path.join(_tmp, 'src'));
rmSync(_tmp, { recursive: true, force: true });
console.log(`HEAD ${git('rev-parse', '--short=12', 'HEAD')} verified (mechanism inert, §289 intact); HEAD src hash ${HEAD_SRC}`);

/* ── PF7: one run = one out-dir ──────────────────────────────────────────────────────────── */
if (existsSync(OUT) && readdirSync(OUT).length > 0)
  die(`PF7 ABORT: ${OUT} exists and is non-empty. This runner never resumes. Archive it, e.g.\n  mv ${OUT} ${OUT}-void-runN\nthen relaunch.`);
mkdirSync(OUT, { recursive: true });

const manifest = {
  seal: 'PREREG-lithold',
  head: git('rev-parse', 'HEAD'),
  expect: { head: HEAD_SRC, rows: EXPECT_ROWS },
  headSrc: HEAD_SRC,
  foreignAtLaunch: git('status', '--porcelain', '--', 'src/'),
  values: { OFF, ON, KO, DOSE, MASKED },
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

/* Every arm assigns the lever AND the debug state, so poke and restore are the same code
   path and `back` is the `off` assignment repeated (the fxartifact/gradetrio ARM shape).
   uSubjLitHold is shared by identity and nothing republishes it, so the assignment sticks
   across __GAME.step() — the uShadowHold contract, pinned by tests/lithold.test.mjs. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  const px = eng.get('postfx');
  sh.uniforms.uSubjLitHold.value = cfg.hold;
  let calib = null;
  if (cfg.debug === 'cal') { px.debugRaw('scene'); calib = sh.calibrate('term'); }
  else if (cfg.debug === 'msk') { px.debugRaw('scene'); sh.debugTerm(1); }
  else { sh.debugTerm(0); px.debugRaw(false); }
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  const kc = sh?.uniforms?.uKeyColor?.value || null;
  return {
    png: c.toDataURL('image/png'),
    readback: {
      uSubjLitHold: sh?.uniforms?.uSubjLitHold ? sh.uniforms.uSubjLitHold.value : null,
      uSubjShadowHold: sh?.uniforms?.uSubjShadowHold ? sh.uniforms.uSubjShadowHold.value : null,
      uShadowHold: sh?.uniforms?.uShadowHold ? sh.uniforms.uShadowHold.value : null,
      uShadowHoldKnee: sh?.uniforms?.uShadowHoldKnee ? sh.uniforms.uShadowHoldKnee.value : null,
      uDebugTerm: sh?.uniforms?.uDebugTerm ? sh.uniforms.uDebugTerm.value : null,
      debugRaw: px?._debugRaw ?? null,
      debugSrc: px?._debugSrc ?? null,
      calib,
      uKeyColor: kc ? { r: kc.r, g: kc.g, b: kc.b } : null,
      uKeyIntensity: sh?.uniforms?.uKeyIntensity ? sh.uniforms.uKeyIntensity.value : null,
      uRakeTrack: sh?.uniforms?.uRakeTrack ? sh.uniforms.uRakeTrack.value : null,
      uLocalToon: sh?.uniforms?.uLocalToon ? sh.uniforms.uLocalToon.value : null,
      nightAmount: sh?._nightAmount ?? null,
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
  console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(22)} sha ${manifest.rows.at(-1).sha256.slice(0, 16)}  hold=${rb.uSubjLitHold} shadowHold=${rb.uSubjShadowHold} dbgTerm=${rb.uDebugTerm} raw=${rb.debugRaw} camY=${rb.camY?.toFixed?.(2)} na=${rb.nightAmount}`);
}

const onLocked = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) {
    console.log(`ABORT at lock grant — src/render or src/player carries uncommitted work (§186: NOT ours, do not touch, do not restore). Every number this seal reports comes out of those two chains, so a tree nobody can reconstruct is not a tree worth spending a boot on. Wait for it to land and relaunch:\n${crit}`);
    throw new Error('critical src chains dirty at lock grant');
  }
  const mine = git('status', '--porcelain', '--', ...OWNED);
  if (mine) { console.log(`ABORT — this seal's own files drifted from HEAD:\n${mine}`); throw new Error('owned files dirty at lock grant'); }
  const tree = treeState();
  manifest.lockGrant = { src: tree.src, head: tree.head, foreign: git('status', '--porcelain', '--', 'src/'), at: new Date().toISOString() };
  saveManifest();
  console.log(`tree verified under the lock — src ${tree.src} (HEAD src ${HEAD_SRC}${tree.src === HEAD_SRC ? ', exact' : ', differs: foreign dirt outside the critical chains, recorded'}); no install`);
};
const onReleasing = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  const mine = git('status', '--porcelain', '--', ...OWNED);
  manifest.release = { src: treeState().src, critical: crit, owned: mine, at: new Date().toISOString() };
  saveManifest();
  console.log(crit || mine
    ? `!! src dirty at release — NOT this runner's doing (it installs nothing): report, do not touch:\n${crit}${mine}`
    : 'src/render + src/player clean at release (nothing was installed).');
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
    /* Uniform staging disclosure (torchlight3 §6): every shot stages under the SAME lever
       value — the inert default — set explicitly before the first staging. */
    await page.evaluate((v) => {
      const eng = window.__ENGINE;
      eng.get('shading').uniforms.uSubjLitHold.value = v;
      eng.get('shading').debugTerm(0);
      eng.get('postfx').debugRaw(false);
    }, OFF);
    let ordinal = 0, n = 0;
    for (const shot of ROSTER) {
      const t0 = Date.now();
      await page.evaluate(STAGE_ONLY, shot);
      console.log(`-- staged ${shot} (${++n}/16, ${((Date.now() - t0) / 1000) | 0}s)`);
      const arms = [['off', { hold: OFF }], ['on', { hold: ON }]];
      if (DOSE.includes(shot)) arms.push(['ko', { hold: KO }]);
      arms.push(['back', { hold: OFF }]);
      if (MASKED.includes(shot)) {
        arms.push(['cal', { hold: OFF, debug: 'cal' }]);
        arms.push(['msk', { hold: OFF, debug: 'msk' }]);
        arms.push(['bk2', { hold: OFF }]);
      }
      for (const [arm, cfg] of arms) {
        const got = await page.evaluate(ARM, cfg);
        saveFrame(shot, arm, got, ++ordinal);
      }
    }
    /* leave the levers and the debug state at their published/off values */
    await page.evaluate(() => {
      const eng = window.__ENGINE;
      eng.get('shading').uniforms.uSubjLitHold.value = 0.0;
      eng.get('shading').debugTerm(0);
      eng.get('postfx').debugRaw(false);
    });
  });
console.log('DONE. Score with:');
console.log('  node progress/records/lithold-score.mjs');

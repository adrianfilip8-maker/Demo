/**
 * keyprobe-run.mjs — the capture runner for PREREG-keyprobe. One shot, 5 arms, one boot.
 *
 *   bash tools/launch.sh /home/user/Demo/progress/records/keyprobe/keyprobe-run.mjs \
 *     /home/user/Demo/progress/records/logs/keyprobe.log /tmp/sands-of-ra/keyprobe.pid
 *
 * Then:  node progress/records/keyprobe/keyprobe-score.mjs progress/records/keyprobe1
 *
 * ── What it measures and why it needs no `src` change ────────────────────────────────────────
 *
 * §336 named the one measurement that settles the shadow-tint item — *"a `key` (= `ramp * sh`)
 * readback over the terminator rect"* — and the item has failed to substitute for it twice: §342.1
 * used a mismatched control, and §342.2 corrected the control but still had to condition every
 * figure on an unmeasured `sh`.
 *
 * The shipped shader already writes both quantities:
 *
 *   toon.glsl.js:528   float key = ramp * sh;
 *   toon.glsl.js:1454  uDebugTerm 5  ->  vec3( ramp, ndl, key )
 *
 * so ONE arm decomposes the product: `sh = key / ramp` wherever `ramp > 0`. `term6` (`sh` gated by
 * `step(0.02, ndl)`) is captured as a cross-check and is explicitly NOT load-bearing — that gate is
 * why mode 6 alone cannot answer this and mode 5 can.
 *
 * `debugTerm` writes pre-AgX into the linear scene target, so it is only meaningful through
 * `debugRaw('scene')` (ToonMaterial's own docstring). Bytes are undecoded `value * 255`; `cal`
 * proves that in-boot rather than assuming it (§333 / linchroma §2).
 *
 * Staging is live-settle-then-freeze (§328/§330) with 2 discarded warm-up renders (§331), and the
 * `off`/`back` bracket must be 0 px — which is what proves the arms shared one frozen world state.
 *
 * Readback comes from the LIVE uniform, after the render, per PostFX.js:1900. There is no
 * `isDebugRaw()` on PostFX at this sha, so the private `_debugRaw`/`_debugSrc` that `debugRaw()`
 * actually assigns are what get read — an arm whose state is not read back cannot be adjudicated.
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/keyprobe1');

/* ── sealed by PREREG-keyprobe §2-§3 ──────────────────────────────────────────────────────── */
const SEAL = 'PREREG-keyprobe';
const SHOT = 'courtyard';
const WARMUP = 2;
const EXPECT_ROWS = 5;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
/** Pre-lock aborts only — `process.exit` is correct before anything is acquired. */
const die = (msg) => { console.error(msg); process.exit(2); };
/**
 * Aborts from INSIDE the `withGame` callback. `withGame` releases the lock, closes the browser and
 * kills vite in a `finally` (harness.mjs:135-146), and `process.exit()` SKIPS `finally` blocks — so
 * `die()` there would orphan a SwiftShader Chromium and a vite server. The lock self-heals
 * (lock.mjs:128 reclaims on a dead holder pid); the child processes do not. Throwing runs teardown.
 */
const abort = (msg) => { throw new Error(msg); };

{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6: src/ is dirty at launch — a capture must run against a committed tree:\n${dirt}`);
}
mkdirSync(OUT, { recursive: true });
{
  const mine = readdirSync(OUT);
  if (mine.length) die(`PF7: ${OUT} is not empty (no resume) — archive it before relaunching:\n  ${mine.join('\n  ')}`);
}

const HEAD = git('rev-parse', 'HEAD');
const EXPECT_SRC = srcHash();
console.log(`${SEAL} — HEAD ${HEAD.slice(0, 12)}, expected src hash ${EXPECT_SRC}`);
console.log(`frames -> ${OUT}`);

const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  const px = eng.get('postfx');

  if (cfg.raw) px.debugRaw('scene'); else px.debugRaw(false);
  sh.debugTerm(cfg.term);

  await window.__GAME.step(2, 0);
  eng.renderFrame(0);

  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return {
    png: c.toDataURL('image/png'),
    rb: {
      uDebugTerm: sh.uniforms?.uDebugTerm?.value ?? null,
      debugRaw: px._debugRaw ?? null,
      debugSrc: px._debugSrc ?? null,
      camY: eng.camera?.position?.y ?? null,
    },
  };
};

const WARM = async () => {
  const eng = window.__ENGINE;
  eng.get('postfx').debugRaw(false);
  eng.get('shading').debugTerm(0);
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
};

const STAGE_LIVE = async (name) => {
  const r = await window.__GAME.setShot(name, {});
  return { warnings: r.warnings.length };
};

const rows = [];
const CRITICAL = ['src/render', 'src/player'];

const onLocked = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) {
    console.log(`ABORT at lock grant — src/render or src/player carries uncommitted work `
      + `(§186: NOT ours, do not touch, do not restore):\n${crit}`);
    throw new Error('critical src chains dirty at lock grant');
  }
  const t = treeState();
  if (t.src !== EXPECT_SRC) throw new Error(`V-TREE: src moved before capture (${t.src} != ${EXPECT_SRC})`);
  console.log(`HEAD tree verified under the lock — src ${t.src} (this runner installs nothing)`);
};
const onReleasing = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) console.log(`!! src dirty at release — NOT this runner's doing: report, do not touch:\n${crit}`);
};

await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);

    const st = await page.evaluate(STAGE_LIVE, SHOT);
    console.log(`-- staged ${SHOT} LIVE (dt undefined, roster path); ${st.warnings} warning(s)`);
    for (let w = 0; w < WARMUP; w++) await page.evaluate(WARM);
    console.log(`-- warm-up ${WARMUP} render(s) discarded (§331)`);

    const plan = [
      ['off', { raw: false, term: 0 }],
      ['cal', { raw: true, term: 4 }],
      ['term5', { raw: true, term: 5 }],
      ['term6', { raw: true, term: 6 }],
      ['back', { raw: false, term: 0 }],
    ];

    for (const [arm, cfg] of plan) {
      const r = await page.evaluate(ARM, cfg);
      const buf = Buffer.from(r.png.split(',')[1], 'base64');
      const file = `${SHOT}.${arm}.png`;
      writeFileSync(path.join(OUT, file), buf);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      rows.push({ shot: SHOT, arm, file, sha256, readback: r.rb });
      console.log(`  #${rows.length} ${(SHOT + '.' + arm).padEnd(20)} sha ${sha256.slice(0, 16)}`
        + `  dbgTerm=${r.rb.uDebugTerm} raw=${r.rb.debugRaw}/${r.rb.debugSrc}`);
    }

    /* §40 collapse check, in-boot: the three debug arms must have been rendered in DIFFERENT
       states, or the calibration is certifying a bypass it shares with nothing. */
    const state = (a) => { const r = rows.find((q) => q.arm === a).readback; return `${r.uDebugTerm}/${r.debugRaw}`; };
    for (const [a, b] of [['cal', 'term5'], ['cal', 'term6'], ['term5', 'term6']]) {
      if (state(a) === state(b)) {
        abort(`ABORT: \`${a}\` and \`${b}\` rendered in the SAME state (${state(a)}) — §40: an arm whose `
          + 'state collapses onto another scores nothing.');
      }
    }
    if (state('off') !== state('back')) {
      console.log(`!! \`off\` and \`back\` differ in poked state — R_bracket expected to FAIL; recorded, not corrected.`);
    }
    console.log('-- arm states distinct (cal/term5/term6 all differ), off == back');

    const t1 = treeState();
    if (t1.src !== EXPECT_SRC) abort(`V-TREE: src moved DURING capture (${t1.src} != ${EXPECT_SRC})`);
  },
);

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  seal: SEAL, warmup: WARMUP, shot: SHOT, head: HEAD, srcHash: EXPECT_SRC,
  staging: 'setShot(name, {}) — dt UNDEFINED, live settle, roster-faithful (§328)',
  expectRows: EXPECT_ROWS, capturedAt: new Date().toISOString(), rows,
}, null, 2));

console.log(`\n${rows.length} frames -> ${OUT}`);
console.log('FORCE-ADD NOW (§329.1/§335, these PNGs are gitignored):');
console.log('  git add -f progress/records/keyprobe1/*.png progress/records/keyprobe1/manifest.json');
console.log('score with:\n  node progress/records/keyprobe/keyprobe-score.mjs progress/records/keyprobe1');

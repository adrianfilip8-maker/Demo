/**
 * litbleach.mjs — the ROSTER-FAITHFUL one-boot poke runner for PREREG-litbleach.
 *
 * The one thing this runner exists to get right (§328, §2 of the seal):
 *
 *   STAGE LIVE, THEN FREEZE.
 *
 * lithold staged with `setShot(name, { dt: 0 })`, which freezes the world clock THROUGH
 * staging and rests the character at a different animation phase and position than the roster.
 * It measured S 0.678 on traversal where the roster measures 0.205, its BG gate correctly
 * VOIDed, and the run bought nothing. Here:
 *
 *   1. stage ONCE with `setShot(name)` — dt undefined, byte-for-byte `harness.grab()`'s call,
 *      the live-settle path the roster uses. NOT captured.
 *   2. every arm thereafter pokes the uniform and renders with step(2, 0) + renderFrame(0):
 *      dt 0, no clock advance, no re-stage. All arms of a shot share ONE frozen world state.
 *   3. the per-shot off/back bracket must be 0 px, which is what PROVES step 2 held.
 *
 * That reconciles §195/§28's dt:0 discipline (arms must not move the world) with §328's rule
 * (the runner must reproduce the defect) — the two were never in conflict; lithold applied the
 * first to the staging as well as to the arms, and that was the whole error.
 *
 * No install: TUNE.subjLitHold is INERT at 0.0 in HEAD and is poked live, so this runner is
 * immune to tree churn and V-TREE has one src hash to verify.
 *
 *   bash tools/launch.sh /home/user/Demo/progress/records/litbleach/litbleach.mjs \
 *     /home/user/Demo/progress/records/logs/litbleach-run1.log /tmp/sands-of-ra/litbleach1.pid
 *
 * 14 frames: 3 shots x {off, on, ko, back} + msk on the two dose shots. No retries, no resume (PF7).
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/litbleach1');
const DOSE = ['traversal', 'combat'];
const CONTROL = 'sly-key';
const ROSTER = [...DOSE, CONTROL];
const ON = 0.70, KO = 0.40, OFF = 0.0;      // PREREG-litbleach §7 — sealed before any frame

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins ─────────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6: src/ is dirty at launch — a capture must run against a committed tree:\n${dirt}`);
}
/* PF7: one run, one out-dir. A resumed run mixes trees; the seal is re-run from empty. */
if (existsSync(OUT) && readdirSync(OUT).length) {
  die(`PF7: ${OUT} is non-empty — archive it before relaunching (no resume).`);
}
mkdirSync(OUT, { recursive: true });

const HEAD = git('rev-parse', 'HEAD');
const EXPECT_SRC = srcHash();
console.log(`HEAD ${HEAD.slice(0, 12)} verified (subjLitHold inert in HEAD); expected src hash ${EXPECT_SRC}`);
console.log(`frames -> ${OUT}`);

/* ── the arm: poke, settle WITHOUT advancing the clock, render, capture ───────────────────── */
/* uSubjLitHold is shared by identity and nothing republishes it, so the assignment sticks
   across __GAME.step() — the uShadowHold contract, pinned by tests/lithold.test.mjs. Every arm
   assigns BOTH the lever and the debug state so poke and restore are one code path and `back`
   is literally the `off` assignment repeated. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  const px = eng.get('postfx');
  sh.uniforms.uSubjLitHold.value = cfg.hold;
  if (cfg.debug === 'msk') { px.debugRaw('scene'); sh.debugTerm(1); }
  else { sh.debugTerm(0); px.debugRaw(false); }
  await window.__GAME.step(2, 0);          // dt 0 — flushes without advancing the world clock
  eng.renderFrame(0);
  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return {
    png: c.toDataURL('image/png'),
    rb: {
      uSubjLitHold: sh.uniforms.uSubjLitHold.value,
      uSubjShadowHold: sh.uniforms.uSubjShadowHold?.value,
      uDebugTerm: sh.uniforms.uDebugTerm?.value,
      debugRaw: px.isDebugRaw?.() ?? null,
      camY: eng.camera?.position?.y ?? null,
    },
  };
};

/* ── THE STAGING CALL — dt undefined, exactly harness.grab()'s, exactly the roster's ──────── */
const STAGE_LIVE = async (name) => {
  const r = await window.__GAME.setShot(name, {});     // live settle; the world clock advances
  return { warnings: r.warnings.length };
};

const rows = [];
let ordinal = 0;

/* §186 — the two chains every number here comes out of. Dirt in them at lock grant means the
   tree cannot be reconstructed later, so the boot is not worth spending. */
const CRITICAL = ['src/render', 'src/player'];

const onLocked = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) {
    console.log(`ABORT at lock grant — src/render or src/player carries uncommitted work (§186: NOT ours, do not touch, do not restore):\n${crit}`);
    throw new Error('critical src chains dirty at lock grant');
  }
  const t = treeState();
  if (t.src !== EXPECT_SRC) throw new Error(`V-TREE: src moved before capture (${t.src} != ${EXPECT_SRC})`);
  console.log(`HEAD tree verified under the lock — src ${t.src} (no install; subjLitHold inert in HEAD)`);
};
const onReleasing = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) console.log(`!! src dirty at release — NOT this runner's doing (it installs nothing): report, do not touch:\n${crit}`);
};

await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);

  for (const shot of ROSTER) {
    /* 1. stage ONCE, LIVE. Not captured — this frame only exists to place the character. */
    const st = await page.evaluate(STAGE_LIVE, shot);
    console.log(`-- staged ${shot} LIVE (dt undefined, roster path); ${st.warnings} warning(s)`);

    /* 2. arms, all from the frozen world state left by that single staging. */
    const arms = [
      ['off', { hold: OFF }],
      ['on', { hold: ON }],
      ['ko', { hold: KO }],
      ['back', { hold: OFF }],
    ];
    if (DOSE.includes(shot)) arms.push(['msk', { hold: OFF, debug: 'msk' }]);

    for (const [arm, cfg] of arms) {
      const r = await page.evaluate(ARM, cfg);
      const buf = Buffer.from(r.png.split(',')[1], 'base64');
      const file = `${shot}.${arm}.png`;
      writeFileSync(path.join(OUT, file), buf);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      rows.push({ shot, arm, file, sha256, readback: r.rb });
      ordinal += 1;
      console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${sha256.slice(0, 16)}  hold=${r.rb.uSubjLitHold} dbgTerm=${r.rb.uDebugTerm} raw=${r.rb.debugRaw}`);
    }
  }

  const t1 = treeState();
  if (t1.src !== EXPECT_SRC) die(`V-TREE: src moved DURING capture (${t1.src} != ${EXPECT_SRC})`);
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    seal: 'PREREG-litbleach', head: HEAD, srcHash: EXPECT_SRC,
    staging: 'setShot(name, {}) — dt UNDEFINED, live settle, roster-faithful (§328)',
    doses: { OFF, ON, KO }, expectRows: 14,
    capturedAt: new Date().toISOString(), rows,
  }, null, 2));
  }
);

console.log(`\n${rows.length} frames -> ${OUT}  (expected 14)`);
console.log('score with: node progress/records/litbleach/litbleach-score.mjs');

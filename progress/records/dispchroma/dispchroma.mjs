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
const OUT = path.join(ROOT, 'progress/records/dispchroma1');
const DOSE = ['traversal'];        // §3 of the seal: combat is routed out — the statistic cannot see its costume
const CONTROL = 'sly-key';
const ROSTER = [...DOSE, CONTROL];
const ON = 2.00, KO = 1.00, OFF = 0.0;   // PREREG-dispchroma §2 — DERIVED offline, not guessed
const WARMUP = 2;                            // §331 — discarded settling renders after staging

/* ── AMENDMENT A1: per-shot chunked capture ──────────────────────────────────────────────────
   Five consecutive captures were destroyed by container rollbacks on a cadence that has
   tightened to ~38 min, below even this seal's deliberately-short 45 min. One shot per boot is
   ~5 frames / ~15 min and fits. NO bar changes: 13 of the 14 comparisons are within one shot and
   therefore within one boot, and PF_STAGE compares measured saturations against fixed thresholds
   rather than pixels against pixels. See AMENDMENT-litbleach-A1.md for the bar-by-bar argument
   and for V_CHUNK_TREE, the gate that replaces single-process V-TREE with a stronger one. */
const SHOT = process.argv[2];
if (!SHOT || !ROSTER.includes(SHOT)) {
  console.error(`usage: node dispchroma.mjs <shot>   where <shot> is one of: ${ROSTER.join(', ')}`);
  console.error('(AMENDMENT A1 — one shot per boot; run all three, then score.)');
  process.exit(4);
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const die = (msg) => { console.error(msg); process.exit(2); };

/* ── PF6: launch pins ─────────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6: src/ is dirty at launch — a capture must run against a committed tree:\n${dirt}`);
}
/* PF7, per AMENDMENT A1 now applied PER SHOT: a chunk aborts if its OWN frames already exist.
   A half-finished chunk is archived and re-run whole — chunks are never resumed mid-shot. */
mkdirSync(OUT, { recursive: true });
{
  const mine = readdirSync(OUT).filter((f) => f.startsWith(`${SHOT}.`) || f === `manifest.${SHOT}.json`);
  if (mine.length) {
    die(`PF7: ${OUT} already holds ${mine.length} file(s) for shot "${SHOT}" — archive them before relaunching this chunk (no resume):\n  ${mine.join('\n  ')}`);
  }
}

const HEAD = git('rev-parse', 'HEAD');
const EXPECT_SRC = srcHash();
console.log(`HEAD ${HEAD.slice(0, 12)} verified (dispChromaHold inert in HEAD); expected src hash ${EXPECT_SRC}`);
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
  /* The lever lives on the COMPOSITE material's uniforms (PostFX), not on shading. Poked live;
     nothing republishes it per frame, so the assignment sticks across __GAME.step(). */
  px.compositeMat.uniforms.uDispChromaHold.value = cfg.hold;
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
      uDispChromaHold: px.compositeMat.uniforms.uDispChromaHold.value,
      uDebugTerm: sh.uniforms.uDebugTerm?.value,
      debugRaw: px.isDebugRaw?.() ?? null,
      camY: eng.camera?.position?.y ?? null,
    },
  };
};

/* A discarded settling render (§331). Identical to an arm's render path except that nothing is
   captured, so the frames the seal measures are all post-convergence. */
const WARM = async () => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  const px = eng.get('postfx');
  px.compositeMat.uniforms.uDispChromaHold.value = 0.0;
  sh.debugTerm(0);
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
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
  console.log(`HEAD tree verified under the lock — src ${t.src} (no install; dispChromaHold inert in HEAD)`);
};
const onReleasing = async () => {
  const crit = git('status', '--porcelain', '--', ...CRITICAL);
  if (crit) console.log(`!! src dirty at release — NOT this runner's doing (it installs nothing): report, do not touch:\n${crit}`);
};

await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);

  for (const shot of [SHOT]) {
    /* 1. stage ONCE, LIVE. Not captured — this frame only exists to place the character. */
    const st = await page.evaluate(STAGE_LIVE, shot);
    console.log(`-- staged ${shot} LIVE (dt undefined, roster path); ${st.warnings} warning(s)`);

    /* §331 WARM-UP — the single reason litbleach VOIDed. convprobe measured that the FIRST
       render after staging is not converged (r0 vs r1: 1125 px at max delta 21) and that every
       render after it is bit-exact (r1..r7 identical, six consecutive pairs at 0/0). litbleach
       captured `off` as that first render and `back` as the fourth, so its bracket compared a
       pre-convergence frame against a converged one. These renders are DISCARDED — nothing is
       written, nothing is measured. The measurement says 1 suffices; 2 is sealed for margin
       against a shot that settles more slowly, at a cost of one render per shot. */
    for (let w = 0; w < WARMUP; w++) await page.evaluate(WARM);
    console.log(`-- warm-up ${WARMUP} render(s) discarded (§331: first render after staging is unconverged)`);

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
      console.log(`  #${String(ordinal).padStart(2)} ${(shot + '.' + arm).padEnd(20)} sha ${sha256.slice(0, 16)}  hold=${r.rb.uDispChromaHold} dbgTerm=${r.rb.uDebugTerm} raw=${r.rb.debugRaw}`);
    }
  }

  const t1 = treeState();
  if (t1.src !== EXPECT_SRC) die(`V-TREE: src moved DURING capture (${t1.src} != ${EXPECT_SRC})`);
  /* Per-shot manifest (AMENDMENT A1). The scorer merges these and enforces V_CHUNK_TREE —
     every chunk must carry the SAME srcHash, which checks the tree at three points in time
     instead of the two a single process could check. */
  writeFileSync(path.join(OUT, `manifest.${SHOT}.json`), JSON.stringify({
    seal: 'PREREG-dispchroma', warmup: 2,
    shot: SHOT, head: HEAD, srcHash: EXPECT_SRC,
    staging: 'setShot(name, {}) — dt UNDEFINED, live settle, roster-faithful (§328)',
    doses: { OFF, ON, KO }, expectRowsTotal: 9,
    capturedAt: new Date().toISOString(), rows,
  }, null, 2));
  }
);

console.log(`\n${rows.length} frames -> ${OUT}  (9 across both chunks)`);
console.log('score with: node progress/records/dispchroma/dispchroma-score.mjs');

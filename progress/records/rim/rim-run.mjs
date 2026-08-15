/**
 * rim-run.mjs — the CHUNKED capture runner for PREREG-rim. One shot per boot, 5 arms, 15 frames.
 *
 *   bash tools/launch.sh /home/user/Demo/progress/records/rim/rim-run.mjs \
 *     /home/user/Demo/progress/records/logs/rim-night.log /tmp/sands-of-ra/rim-night.pid night
 *
 * (the shot goes AFTER the pid path — `launch.sh` forwards trailing argv to the script.)
 * Run all three — `night`, `sly-profile`, `hero` — then score:
 *
 *   node progress/records/rim/rim-score.mjs progress/records/rim1
 *
 * ── What this runner is obliged to get right, and where each obligation comes from ──────────
 *
 * **It installs nothing.** Every arm of PREREG-rim §4 is a poke of an existing live-read uniform
 * or an existing debug hook, verified against `src` at this sha before this file was written:
 *
 *   - `postfx.tune.rimStrength` is re-read into `uRimStrength` on **every** render
 *     (PostFX.js:2321) and the whole Path-B composite branch is gated `uRimStrength > 0.0`
 *     (PostFX.js:1487). So `screenoff` is a true OFF **by control flow**, not a small strength.
 *   - `debugRaw('scene')` takes the string form explicitly (PostFX.js:1893-1897).
 *   - `debugTerm(n)` is ToonMaterial's (ToonMaterial.js:1946).
 *
 * That is why `V_CHUNK_TREE` can demand one `src` hash across all three boots: there is nothing
 * for this runner to install or restore, so the tree cannot move because of it.
 *
 * **Staging is live-settle-then-freeze (§328/§330), not `dt: 0`.** `setShot(name, {})` with `dt`
 * UNDEFINED is byte-for-byte `harness.grab()`'s call and the path the roster uses. lithold froze
 * the clock *through* staging, rested the character at a different animation phase, measured
 * S 0.678 where the roster measures 0.205, and bought nothing. Every arm thereafter renders with
 * `step(2, 0)` + `renderFrame(0)` — dt 0, no clock advance, no re-stage — so all five arms of a
 * shot share ONE frozen world state. `R_<shot>` (`off` vs `back` at 0 px) is what PROVES that held.
 *
 * **Two discarded warm-up renders after staging (§331).** `convprobe` measured that the FIRST
 * render after staging is unconverged (r0 vs r1: 1125 px at max delta 21) and that every render
 * after it is bit-exact (r1..r7, six consecutive pairs at 0/0). litbleach captured `off` as that
 * first render and VOIDed on exactly this; litbleach2 turned `R_sly-key` from 1120 px into 0 px
 * with the warm-up in. The seal keeps the bracket bar at 0.
 *
 * **Readback comes from the LIVE uniform, never from `this.tune`.** PostFX.js:1900 states the rule
 * and the reason: §40's decisive A/B arm never ran because a bias clamp floored two arms to the
 * same value, and the only thing that could have caught it was reading the value the shader got
 * rather than the value that was requested. `uRimStrength` is assigned *during* the render, so
 * every readback here is taken AFTER `renderFrame(0)`. `edgeEnabled` is read back too, because
 * PostFX.js:2321 forces `uRimStrength` to 0 when the edge pass is off — without it, an `off` arm
 * that silently matched `screenoff` would be unattributable.
 *
 * **Force-add the frames of every completed chunk immediately** (§329.1/§335) — `progress/records/
 * *​/**​/*.png` is gitignored, and that is exactly how `shots/r13` was lost (PREREG-rim §0).
 */
import { withGame } from '../../../tools/harness.mjs';
import { treeState, srcHash } from '../../../tools/treestate.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'progress/records/rim1');

/* ── sealed by PREREG-rim §4; none of it may move now (§141.1) ─────────────────────────────── */
const SEAL = 'PREREG-rim';
const SHOTS = ['night', 'sly-profile', 'hero'];
const ARMS = ['off', 'screenoff', 'raw', 'cal', 'back'];
const WARMUP = 2;
const EXPECT_ROWS = 15;

const SHOT = process.argv[2];
if (!SHOT || !SHOTS.includes(SHOT)) {
  console.error(`usage: node rim-run.mjs <shot>   where <shot> is one of: ${SHOTS.join(', ')}`);
  console.error('(PREREG-rim §4 — one shot per boot, 5 frames per chunk; run all three, then score.)');
  process.exit(4);
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
/** Pre-lock aborts only. `process.exit` is correct here because nothing has been acquired yet. */
const die = (msg) => { console.error(msg); process.exit(2); };
/**
 * Aborts from INSIDE the `withGame` callback, and the distinction is not cosmetic.
 *
 * `withGame` releases the capture lock, closes the browser and kills the vite server in a
 * `finally` (harness.mjs:135-146). **`process.exit()` skips `finally` blocks**, so calling `die()`
 * inside the callback would orphan a SwiftShader Chromium (measured at ~370 % CPU on this
 * container) and a vite server for the life of the session. The lock itself self-heals — `lock.mjs`
 * reclaims when the holder pid is dead (`alive()`, lock.mjs:128) and `process.exit` does kill the
 * pid — but the two child processes do not.
 *
 * Throwing instead propagates through the `finally`, so teardown runs, and `withGame` rethrows to
 * the top level where node exits non-zero. Found by the guardcone lane reading this file as its
 * reference runner; it never fired here because all three chunks passed every check.
 */
const abort = (msg) => { throw new Error(msg); };

/* ── PF6 / PF7 launch pins ────────────────────────────────────────────────────────────────── */
{
  const dirt = git('status', '--porcelain', '--', 'src/');
  if (dirt) die(`PF6: src/ is dirty at launch — a capture must run against a committed tree:\n${dirt}`);
}
mkdirSync(OUT, { recursive: true });
{
  /* PF7 applied PER CHUNK: a chunk aborts if its OWN frames exist. A half-finished chunk is
     archived and re-run whole — chunks are never resumed mid-shot. */
  const mine = readdirSync(OUT).filter((f) => f.startsWith(`${SHOT}.`) || f === `manifest.${SHOT}.json`);
  if (mine.length) {
    die(`PF7: ${OUT} already holds ${mine.length} file(s) for shot "${SHOT}" — archive them before `
      + `relaunching this chunk (no resume):\n  ${mine.join('\n  ')}`);
  }
}

const HEAD = git('rev-parse', 'HEAD');
const EXPECT_SRC = srcHash();
console.log(`${SEAL} chunk "${SHOT}" — HEAD ${HEAD.slice(0, 12)}, expected src hash ${EXPECT_SRC}`);
console.log(`frames -> ${OUT}`);

/* ── the arm ──────────────────────────────────────────────────────────────────────────────────
   `rimStrength` is captured once at boot and restored by value, so `back` is literally the `off`
   assignment repeated rather than a second opinion about what the shipped default is. */
const ARM = async (cfg) => {
  const eng = window.__ENGINE;
  const sh = eng.get('shading');
  const px = eng.get('postfx');

  px.tune.rimStrength = cfg.rimStrength;
  if (cfg.raw) px.debugRaw('scene'); else px.debugRaw(false);
  sh.debugTerm(cfg.term);

  await window.__GAME.step(2, 0);          // dt 0 — flushes without advancing the world clock
  eng.renderFrame(0);

  const src = eng.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return {
    png: c.toDataURL('image/png'),
    /* Read AFTER the render, off the LIVE uniform objects (PostFX.js:1900).
     *
     * `uEdgeEnabled` is read as well as `uRimStrength` because the Path-B composite branch is
     * gated on BOTH (`uEdgeEnabled > 0.5 && uRimStrength > 0.0`, PostFX.js:1487) and the two have
     * different owners: `uEdgeEnabled` folds in `needNormals` (PostFX.js:2292), which no arm here
     * sets. Without it, an `off` arm that silently rendered with the branch already dead would be
     * indistinguishable from `screenoff` and M1/M3 would be measuring nothing.
     *
     * There is **no `isDebugRaw()` on PostFX** — checked at this sha, it does not exist. Calling
     * it optionally would have recorded `debugRaw: null` on all five arms, leaving `raw` and `cal`
     * with no evidence they were in bypass at all. The private fields `_debugRaw` / `_debugSrc` are
     * what `debugRaw()` actually assigns (PostFX.js:1894-1896), so they are what gets read. Ugly,
     * and correct: an arm whose state is not read back is an arm that cannot be adjudicated. */
    rb: {
      uRimStrength: px.compositeMat?.uniforms?.uRimStrength?.value ?? null,
      uEdgeEnabled: px.compositeMat?.uniforms?.uEdgeEnabled?.value ?? null,
      tuneRimStrength: px.tune.rimStrength,
      edgeEnabled: px.passes?.edge?.enabled ?? null,
      uDebugTerm: sh.uniforms?.uDebugTerm?.value ?? null,
      debugRaw: px._debugRaw ?? null,
      debugSrc: px._debugSrc ?? null,
      camY: eng.camera?.position?.y ?? null,
    },
  };
};

/* A discarded settling render (§331): identical to an arm's render path, nothing captured. */
const WARM = async (shipped) => {
  const eng = window.__ENGINE;
  eng.get('postfx').tune.rimStrength = shipped;
  eng.get('postfx').debugRaw(false);
  eng.get('shading').debugTerm(0);
  await window.__GAME.step(2, 0);
  eng.renderFrame(0);
};

/* THE STAGING CALL — dt undefined, exactly harness.grab()'s, exactly the roster's (§328). */
const STAGE_LIVE = async (name) => {
  const r = await window.__GAME.setShot(name, {});
  return { warnings: r.warnings.length };
};

const READ_SHIPPED = async () => window.__ENGINE.get('postfx').tune.rimStrength;

const rows = [];

/* §186 — the chains every number here comes out of. Dirt in them at lock grant means the tree
   cannot be reconstructed later, so the boot is not worth spending. */
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
  if (crit) console.log(`!! src dirty at release — NOT this runner's doing (it installs nothing): `
    + `report, do not touch:\n${crit}`);
};

await withGame(
  { width: 1280, height: 720, quality: 'high', timeout: 900000, onLocked, onReleasing },
  async ({ page, info }) => {
    console.log(`renderer: ${info.renderer}`);

    const SHIPPED = await page.evaluate(READ_SHIPPED);
    console.log(`shipped tune.rimStrength = ${SHIPPED} (captured at boot; \`back\` restores this value)`);
    if (!(SHIPPED > 0)) {
      abort(`ABORT: shipped rimStrength is ${SHIPPED} — \`off\` and \`screenoff\` would be the same arm `
        + 'and M1/M3 would be unattributable.');
    }

    /* 1. stage ONCE, LIVE. Not captured — this frame exists only to place the character. */
    const st = await page.evaluate(STAGE_LIVE, SHOT);
    console.log(`-- staged ${SHOT} LIVE (dt undefined, roster path); ${st.warnings} warning(s)`);

    /* 2. §331 warm-up, discarded. */
    for (let w = 0; w < WARMUP; w++) await page.evaluate(WARM, SHIPPED);
    console.log(`-- warm-up ${WARMUP} render(s) discarded (§331: first render after staging is unconverged)`);

    /* 3. the five arms, all from the frozen world state left by that single staging. */
    const plan = [
      ['off', { rimStrength: SHIPPED, raw: false, term: 0 }],
      ['screenoff', { rimStrength: 0, raw: false, term: 0 }],
      ['raw', { rimStrength: SHIPPED, raw: true, term: 0 }],
      ['cal', { rimStrength: SHIPPED, raw: true, term: 4 }],
      ['back', { rimStrength: SHIPPED, raw: false, term: 0 }],
    ];

    for (const [arm, cfg] of plan) {
      const r = await page.evaluate(ARM, cfg);
      const buf = Buffer.from(r.png.split(',')[1], 'base64');
      const file = `${SHOT}.${arm}.png`;
      writeFileSync(path.join(OUT, file), buf);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      rows.push({ shot: SHOT, arm, file, sha256, readback: r.rb });
      console.log(`  #${String(rows.length).padStart(2)} ${(SHOT + '.' + arm).padEnd(22)}`
        + ` sha ${sha256.slice(0, 16)}  uRim=${r.rb.uRimStrength} uEdge=${r.rb.uEdgeEnabled}`
        + ` dbgTerm=${r.rb.uDebugTerm} raw=${r.rb.debugRaw}/${r.rb.debugSrc}`);
    }

    /* The arms must actually differ in the state they were poked into. This is not a bar — the
       seal's bars are the scorer's — it is the §40 check that the A/B happened at all, and it is
       cheap enough to run before the frames leave the boot. */
    const armState = (a) => {
      const r = rows.find((q) => q.arm === a).readback;
      return `${r.uRimStrength}/${r.uEdgeEnabled}/${r.uDebugTerm}/${r.debugRaw}`;
    };
    if (armState('off') === armState('screenoff')) {
      abort(`ABORT: \`off\` and \`screenoff\` were rendered in the SAME state (${armState('off')}) — `
        + 'M1 and M3 would be measuring nothing. §40: an arm whose state collapses onto another scores nothing.');
    }
    if (armState('raw') === armState('cal')) {
      abort(`ABORT: \`raw\` and \`cal\` were rendered in the SAME state (${armState('raw')}) — `
        + 'the calibration cannot prove a bypass it shares with the arm it certifies.');
    }
    if (armState('off') !== armState('back')) {
      console.log(`!! \`off\` and \`back\` differ in poked state (${armState('off')} vs ${armState('back')}) `
        + '— R_<shot> is expected to FAIL; recorded, not corrected.');
    }
    console.log(`-- arm states distinct: off/screenoff and raw/cal differ, off == back`);

    const t1 = treeState();
    if (t1.src !== EXPECT_SRC) abort(`V-TREE: src moved DURING capture (${t1.src} != ${EXPECT_SRC})`);
  },
);

/* ── per-chunk manifest, then the merged one the scorer reads ─────────────────────────────── */
writeFileSync(path.join(OUT, `manifest.${SHOT}.json`), JSON.stringify({
  seal: SEAL, warmup: WARMUP, shot: SHOT, head: HEAD, srcHash: EXPECT_SRC,
  staging: 'setShot(name, {}) — dt UNDEFINED, live settle, roster-faithful (§328)',
  shippedRimStrength: rows[0]?.readback?.tuneRimStrength ?? null,
  capturedAt: new Date().toISOString(), rows,
}, null, 2));

/* The scorer reads a SINGLE `manifest.json` carrying `rows` (15) and `chunks` (3, one src hash
   across all of them — V_CHUNK_TREE). Rebuilt from whatever chunks exist after every run, so the
   last chunk to finish produces the complete file and an incomplete set is visibly incomplete
   rather than absent. Rows are emitted in sealed shot × arm order so the merged file reads the
   same however the chunks were interleaved. */
const chunkFiles = readdirSync(OUT)
  .filter((f) => f.startsWith('manifest.') && f !== 'manifest.json' && f.endsWith('.json'));
const chunks = chunkFiles
  .map((f) => JSON.parse(readFileSync(path.join(OUT, f), 'utf8')))
  .sort((a, b) => SHOTS.indexOf(a.shot) - SHOTS.indexOf(b.shot));
const allRows = [];
for (const shot of SHOTS) {
  const ch = chunks.find((c) => c.shot === shot);
  if (!ch) continue;
  for (const arm of ARMS) {
    const r = ch.rows.find((q) => q.arm === arm);
    if (r) allRows.push(r);
  }
}
const hashes = [...new Set(chunks.map((c) => c.srcHash))];
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  seal: SEAL, warmup: WARMUP, head: HEAD,
  srcHash: hashes.length === 1 ? hashes[0] : null,
  staging: 'setShot(name, {}) — dt UNDEFINED, live settle, roster-faithful (§328)',
  expectRows: EXPECT_ROWS,
  chunks: chunks.map((c) => ({ shot: c.shot, srcHash: c.srcHash, head: c.head, capturedAt: c.capturedAt })),
  mergedAt: new Date().toISOString(), rows: allRows,
}, null, 2));

const done = chunks.map((c) => c.shot);
const left = SHOTS.filter((s) => !done.includes(s));
console.log(`\n${rows.length} frames -> ${OUT}   (${allRows.length}/${EXPECT_ROWS} rows across ${chunks.length}/3 chunks)`);
if (hashes.length > 1) console.log(`!! V_CHUNK_TREE will FAIL — chunks carry ${hashes.length} src hashes: ${hashes.join(', ')}`);
console.log(`FORCE-ADD NOW (§329.1/§335, these PNGs are gitignored):`);
console.log(`  git add -f progress/records/rim1/${SHOT}.*.png progress/records/rim1/manifest*.json`);
console.log(left.length
  ? `remaining chunks: ${left.join(', ')}`
  : `all 3 chunks present — score with:\n  node progress/records/rim/rim-score.mjs progress/records/rim1`);

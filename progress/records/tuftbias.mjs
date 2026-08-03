/**
 * tuftbias — the `TUNE.tuftShadeMix` arm, sealed at `progress/records/PREREG-tuftbias.md`
 * (see §7 addendum for the design this file implements).
 *
 * THREE arms in ONE lock hold, one vite server, one browser, three fresh page contexts:
 *
 *   A     no token          ship 0.82, the control
 *   B     tuftbias40        0.40
 *   BACK  no token          re-run of A; MUST be bit-identical to A or the arm is void
 *
 * Why one hold: §5 wants A re-captured in the same session as B. One frozen vite build
 * (SANDS_NO_HMR) makes every other agent's code identical between arms *by construction*
 * rather than by checking. Why fresh contexts: `__CHAR_AB` has to be set before any module
 * loads, and `addInitScript` is fixed at registration — a new context per arm is the only
 * clean way to vary it.
 *
 * WHAT THIS DOES NOT DO — the suffix between it and a critic frame (KNOWN_ISSUES §11's rule):
 * nothing. It is the real harness, the real renderer, the real PostFX chain, at the harness's
 * own 1280x720. The only difference from `tools/shot.mjs` is that it navigates three times and
 * writes a token first. It reports no derived statistic at all, deliberately — per §7.1 the
 * frame rules and `chipscore` cannot, so this file emits PNGs and provenance and nothing else.
 */
import { withGame } from '/home/user/Demo/tools/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const OUT = '/home/user/Demo/shots/tuftbias';
const SHOT = 'sly-closeup';
const W = 1280, H = 720;

const ARMS = [
  ['A', ''],
  ['B', 'tuftbias40'],
  ['BACK', ''],
];

/*
 * `git ls-files -s` reads the INDEX, so it reports only committed/staged content and is blind to
 * a live WORKING-TREE edit by another agent — which is exactly the event this field exists to
 * catch (FX has a patch armed against `src/fx/Particles.js`). Hash file CONTENTS instead.
 *
 * §11's rule — the suffix this does NOT cover: tracked files only, so a brand-new untracked
 * source file would not register, and it says nothing about WHEN within the run a change landed.
 */
const treeHash = (dirs) =>
  execSync(`git ls-files -z ${dirs} | xargs -0 sha256sum | sha256sum`, { cwd: '/home/user/Demo' })
    .toString().trim().slice(0, 16);

const playerTree = () => treeHash('src/player');

/*
 * SIX directories, not one. Named `srcTree` because the previous name was `renderTree` and it
 * cost a misrouted handoff: the hash moved, I read the name, and I routed the change to RENDER
 * — when the only edits in the window were `src/world`'s (Props.js, EgyptLevel.js, Kit.js) and
 * nothing in `src/render/**` had moved for four hours. A variable named for ONE of the six
 * things it covers gets read as meaning only that thing, including by the person who wrote it.
 * The dirs are listed in the constant so the reader cannot substitute the name for the contents.
 */
const SRC_DIRS = 'src/player src/fx src/textures src/render src/world src/core';
const srcTree = () => treeHash(SRC_DIRS);

const treeBefore = playerTree();
const srcBefore = srcTree();
console.log(`player tree BEFORE:  ${treeBefore}`);
console.log(`src tree BEFORE:     ${srcBefore}   [${SRC_DIRS}]`);

/*
 * SETTLE GATE — hold the boot until the six-dir tree has been still for a while.
 *
 * §124.4 ("one vite server, SANDS_NO_HMR, module graph populated at arm A") was quoted at this
 * harness and does not apply to it: that rule was established on `fx9`, which calls `page.goto`
 * ONCE. This file navigates inside the arm loop, so every arm is its own boot and re-requests
 * every module. `SANDS_NO_HMR` stops the server WATCHING; it does not stop a fresh navigation
 * from re-reading the tree off disk. So an edit landing between two arms is a between-runs edit
 * wearing mid-run clothes, and that is exactly what voided the first attempt.
 */
async function settle(quietMs = 120000, maxWaitMs = 45 * 60 * 1000) {
  const t0 = Date.now();
  let last = srcTree(), since = Date.now();
  while (Date.now() - since < quietMs) {
    if (Date.now() - t0 > maxWaitMs) {
      console.log(`settle: gave up after ${((Date.now() - t0) / 60000) | 0} min; booting anyway (per-arm hashes will localise any move)`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 5000));
    const now = srcTree();
    if (now !== last) {
      console.log(`settle: src tree moved ${last} -> ${now}; restarting the ${quietMs / 1000}s quiet window`);
      last = now; since = Date.now();
    }
  }
  console.log(`settle: src tree quiet for ${quietMs / 1000}s at ${last}`);
  return true;
}
const settled = await settle();

const res = await withGame({ width: W, height: H, quality: 'high', timeout: 2400000 }, async ({ page, info }) => {
  console.log(`renderer: ${info.renderer}`);
  for (const w of info.warnings) console.log(`   ! ${w}`);
  await mkdir(OUT, { recursive: true });

  const baseUrl = page.url();
  const browser = page.context().browser();
  console.log(`base url: ${baseUrl}`);

  /*
   * WHY THE PREVIOUS LAUNCH DIED, and it was not the dev server.
   *
   * `withGame` boots its own page and hands it to us ALREADY RENDERING, and it stays open for
   * the whole callback. Arm A's `goto` therefore started a SECOND full game — a second
   * SwiftShader context, a second 1024 px texture prewarm (the first one alone logged 21.1 s) —
   * on a container with no GPU and every core already pegged by the first. The browser could
   * not service the navigation inside 90 s and Playwright reported `domcontentloaded` timeout,
   * which reads like "the server never served the page" and is not: the boot had already
   * succeeded, the renderer string and the prewarm warning are in the log above the failure,
   * and the stack lands at OUR goto inside `fn` (harness.mjs:121), not at the harness's.
   *
   * Closing the harness's page first makes "exactly one game instance alive" true by
   * construction rather than by timing luck. Each arm already closes its own context at the end
   * of the loop, so the base page was the only overlap.
   */
  await page.context().close();

  const acc = { baseUrl, treeBefore, srcBefore, settled, arms: {} };

  for (const [label, token] of ARMS) {
    const t0 = Date.now();
    /*
     * Hash immediately before THIS arm's navigation, not just before and after the loop.
     * A before/after pair can only say "the tree moved somewhere in 40 minutes", which is a
     * void. A per-arm hash says WHICH arm it moved under, which leaves the arms either side of
     * the move still comparable — a partial result instead of a void. The first run needed
     * exactly this: three `src/world` edits landed at 19:44, 20:06:27 and 20:06:42, one between
     * each pair of arms, and the before/after pair could not show that.
     */
    const srcAtArm = srcTree();
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // Runs before ANY page script, so the model's per-call `CHAR_AB()` sees it at build time.
    await ctx.addInitScript(`globalThis.__CHAR_AB = ${JSON.stringify(token)};`);
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

    await p.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction('window.__GAME && window.__GAME.ready === true', null,
      { timeout: 2400000, polling: 500 });

    // Confirm the token actually reached the module that built the mesh, in this page.
    const seen = await p.evaluate(() => ({
      charAB: String(globalThis.__CHAR_AB ?? '(unset)'),
      tris: window.__ENGINE?.get?.('character')?.triangles ?? null,
    }));

    const r = await p.evaluate(async (n) => {
      const out = await window.__GAME.setShot(n);
      return { stats: out.stats, warnings: out.warnings.length, dataUrl: window.__GAME.capture('image/png') };
    }, SHOT);

    const buf = Buffer.from(r.dataUrl.split(',')[1], 'base64');
    const file = path.join(OUT, `${SHOT}-${label}.png`);
    await writeFile(file, buf);
    const sha = createHash('sha256').update(buf).digest('hex');

    acc.arms[label] = {
      token: token || '(none)', file, sha, bytes: buf.length,
      charAB: seen.charAB, triangles: seen.tris, srcAtArm, srcAfterArm: srcTree(),
      stats: r.stats, consoleErrors: errs, secs: ((Date.now() - t0) / 1000) | 0,
    };
    const a = acc.arms[label];
    console.log(`arm ${label.padEnd(4)} token=${(token || '(none)').padEnd(11)} charAB=${seen.charAB.padEnd(11)} tris=${seen.tris} sha=${sha.slice(0, 16)} ${a.secs}s  src@boot=${srcAtArm}${a.srcAfterArm === srcAtArm ? '' : ` -> ${a.srcAfterArm} <-- TREE MOVED DURING THIS ARM`}`);

    await ctx.close();
  }

  return acc;
});

res.treeAfter = playerTree();
res.srcAfter = srcTree();
res.playerTreeStable = res.treeBefore === res.treeAfter;
// If this is false, BACK-vs-A is NOT a determinism control — someone else's edit landed mid-run
// and any A/BACK difference is theirs, not the token's. Report it, do not silently absorb it.
res.srcTreeStable = res.srcBefore === res.srcAfter;

// Which arms were built from the same tree. Arms sharing a hash are comparable to each other
// even when the run as a whole is not clean — this is the void-to-partial-result conversion.
const armHashes = Object.entries(res.arms).map(([k, v]) => [k, v.srcAtArm]);
res.armsByTree = {};
for (const [k, h] of armHashes) (res.armsByTree[h] ??= []).push(k);
res.comparablePairs = Object.values(res.armsByTree).filter((g) => g.length > 1);

// The registered gate: BACK must equal A byte-for-byte or the arm is void (PREREG §7.5).
// Kept exactly as registered. A gate is not re-scoped after seeing the frames it judged.
const a = res.arms.A?.sha, b = res.arms.B?.sha, back = res.arms.BACK?.sha;
res.backIdentical = !!a && a === back;
res.armsDiffer = !!a && a !== b;

console.log('');
console.log(`player tree AFTER: ${res.treeAfter}  STABLE=${res.playerTreeStable}`);
console.log(`src tree AFTER:    ${res.srcAfter}  STABLE=${res.srcTreeStable}` +
  (res.srcTreeStable ? '' : '  <-- ANOTHER AGENT EDITED MID-RUN; A/BACK is not a control'));
for (const [h, g] of Object.entries(res.armsByTree)) console.log(`  tree ${h}: arms ${g.join(', ')}`);
console.log(`comparable arm groups (same tree at boot): ${JSON.stringify(res.comparablePairs)}`);
console.log(`BACK identical to A: ${res.backIdentical}   ${res.backIdentical ? '' : '<-- ARM IS VOID per PREREG §7.5'}`);
console.log(`A differs from B:    ${res.armsDiffer}   ${res.armsDiffer ? '' : '<-- token had no pixel effect at all'}`);

await writeFile(path.join(OUT, 'tuftbias.json'), JSON.stringify(res, null, 2));
console.log(`\n-> ${OUT}/`);

/**
 * §D2 / PREREG-bodyhue.md — does the −21.1° albedo rotation land the costume on 213.5° in a FRAME?
 *
 * Two arms per shot, both inside ONE `withGame`, so the capture lock is taken once per shot and
 * the working tree cannot move between arms.
 *
 *   A  ?body=raw   the supplied albedo — and the same-run control (§273)
 *   B  ?body=fix   the derived albedo
 *
 * Then `costumeMask = { p : A(p) != B(p) }`, which is exactly the pixels the body texture reaches.
 * No ROI, no colour predicate: an earlier predicate of mine selected 42.8% of `hero` — sky and
 * shadowed stone — and its numbers were discarded. A difference mask cannot make that mistake.
 *
 * **One imprecision in the seal, corrected here rather than glossed.** PREREG §2 says "both arms
 * in one boot per shot". `BODY_MODE` is read at module load, so each arm necessarily needs its own
 * page load — two boots, not one. What the seal was actually protecting is that both arms sit
 * under ONE lock acquisition on ONE tree, and that is what this implements. The wording was loose;
 * the design is not weakened, and nothing about the registered thresholds changes.
 *
 * Scoring is `tools/bodyhuescore.mjs`. Thresholds live in the pre-registration and are not
 * re-derived there.
 */
import { withGame } from './harness.mjs';
import { treeState } from './treestate.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = process.env.SANDS_OUT || 'shots/bodyhue';
/* Registered shot list. `temple` and `combat` are deliberately absent — PREREG §3: they are
   shadow-dominated (§231 measured temple at 97.5% cast-shadowed) and an albedo rotation is a claim
   about the key path. Not captured at all, rather than captured and discarded. */
const SHOTS = (process.argv[2] || 'sly-closeup,sly-perch,hero,courtyard').split(',');

mkdirSync(OUT, { recursive: true });

const NOW = treeState();
console.log(`target src tree ${NOW.src} (HEAD ${NOW.head})`);

/** Render the currently-loaded arm and return its PNG. */
const grab = async (page, shot) => page.evaluate(async (s) => {
  await window.__GAME.setShot(s, { dt: 0 });
  await window.__GAME.step(3, 0);
  window.__ENGINE.renderFrame(0);
  const src = window.__ENGINE.canvas;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
  return {
    png: c.toDataURL('image/png'),
    /* Read back what the page actually loaded, so "the lever took" is measured rather than
       assumed — CAL-1's most likely failure is a query param that never reached module load. */
    bodyParam: new URLSearchParams(location.search).get('body'),
  };
}, shot);

const results = [];
for (const shot of SHOTS) {
  const got = await withGame(
    { width: 1280, height: 720, quality: 'high', timeout: 900000, query: 'body=raw' },
    async ({ page }) => {
      const out = [];
      out.push({ tag: 'A-raw', ...(await grab(page, shot)) });

      /* Arm B needs its own module load. Same origin, same port, same lock. */
      const u = new URL(page.url());
      u.searchParams.set('body', 'fix');
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__GAME && window.__GAME.ready === true', null,
        { timeout: 900000, polling: 500 });
      out.push({ tag: 'B-fix', ...(await grab(page, shot)) });
      return out;
    });

  for (const r of got) {
    const buf = Buffer.from(r.png.split(',')[1], 'base64');
    const file = `${OUT}/${shot}-${r.tag}.png`;
    writeFileSync(file, buf);
    const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    results.push({ shot, arm: r.tag, file, sha, bodyParam: r.bodyParam, tree: NOW });
    console.log(`${shot.padEnd(13)} ${r.tag.padEnd(6)} body=${String(r.bodyParam).padEnd(4)} sha=${sha}`);
  }
}

writeFileSync(`${OUT}/arms.json`, JSON.stringify(results, null, 1));

/* CAL-2 reported here, gated in the scorer: identical arms mean a page never got its param. */
const byShot = new Map();
for (const r of results) {
  if (!byShot.has(r.shot)) byShot.set(r.shot, {});
  byShot.get(r.shot)[r.arm] = r;
}
let bad = 0;
console.log('\nCAL-2 (registered): sha(A) != sha(B) on every shot');
for (const [shot, a] of byShot) {
  const same = a['A-raw'] && a['B-fix'] && a['A-raw'].sha === a['B-fix'].sha;
  const wrongParam = a['A-raw']?.bodyParam !== 'raw' || a['B-fix']?.bodyParam !== 'fix';
  if (same) { console.log(`  ${shot}: arms BIT-IDENTICAL — the lever did not take, VOID`); bad++; }
  if (wrongParam) { console.log(`  ${shot}: body param did not reach the page, VOID`); bad++; }
  if (!same && !wrongParam) console.log(`  ${shot}: ok`);
}
console.log(bad ? `\n${bad} problem(s) — see above` : '\ncapture clean; score with tools/bodyhuescore.mjs');
